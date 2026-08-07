import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { assertPathInsideRoot, resolveInsideRoot } from "./appRoot.js";
import { scanDatabaseEventsForPendingAnalysis } from "./databaseViewer.js";
import {
  PENDING_ANALYSIS_CONTRACT_STATUS,
  PENDING_ANALYSIS_EXPORT_MODE,
  PENDING_ANALYSIS_SCHEMA_NAME,
  PENDING_ANALYSIS_SCHEMA_VERSION,
  PendingAnalysisExportError,
  assertPendingAnalysisHeaderSafe,
  assertPendingAnalysisRecordSafe,
  canonicalJson,
  createPendingEvidenceId,
  filterSnapshot,
  sha256Canonical,
  type PendingAnalysisExportRequest,
  type PendingAnalysisExportResult,
  type PendingAnalysisProgress,
  type PendingAnalysisRecord,
  type PendingAnalysisRuntimeIdentity
} from "../shared/pendingAnalysisContract.js";

type RunInput = PendingAnalysisExportRequest & {
  exportId: string;
  databasePath: string;
  appRoot: string;
  appVersion: string;
  runtimeIdentity?: PendingAnalysisRuntimeIdentity;
};

type RunControl = {
  isCancelled?: () => boolean;
  onProgress?: (progress: PendingAnalysisProgress) => void;
  now?: () => number;
};

function taipeiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { file: `${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}`, iso: `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+08:00` };
}

function hostOnly(value: unknown) {
  try { return new URL(String(value ?? "")).host; } catch { return ""; }
}

function nullableText(value: unknown) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function rawContent(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function sha256Text(value: string | null) {
  return value === null ? null : crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function pendingAnalysisRecord(row: Record<string, unknown>, source: { databaseId: string; jiraServerFingerprint: string }, runtimeIdentity: PendingAnalysisRuntimeIdentity = {}): PendingAnalysisRecord {
  const beforeRaw = rawContent(row.before);
  const afterRaw = rawContent(row.after);
  const descriptionDiff = row.descriptionDiff && typeof row.descriptionDiff === "object" ? row.descriptionDiff as Record<string, unknown> : null;
  const beforeAvailable = descriptionDiff && typeof descriptionDiff.beforeAvailable === "boolean"
    ? descriptionDiff.beforeAvailable && descriptionDiff.beforeComplete !== false
    : beforeRaw !== null && row.beforeComplete !== 0;
  const afterAvailable = descriptionDiff && typeof descriptionDiff.afterAvailable === "boolean"
    ? descriptionDiff.afterAvailable && descriptionDiff.afterComplete !== false
    : afterRaw !== null && row.afterComplete !== 0;
  const diffBeforeSha256 = nullableText(descriptionDiff?.diffInputBeforeSha256);
  const diffAfterSha256 = nullableText(descriptionDiff?.diffInputAfterSha256);
  const beforeSha256 = beforeAvailable ? diffBeforeSha256 ?? sha256Text(beforeRaw) : null;
  const afterSha256 = afterAvailable ? diffAfterSha256 ?? sha256Text(afterRaw) : null;
  if ((beforeAvailable && !beforeSha256) || (afterAvailable && !afterSha256)) {
    throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Canonical source content hash is unavailable.");
  }
  const activityEventId = nullableText(row.eventId) ?? "";
  const sourceRecordStableId = nullableText(row.sourceRecordId);
  const sourceIdentity = {
    activityEventId,
    sourceRecordStableId,
    historyId: nullableText(row.historyId),
    historyItemIndex: typeof row.itemIndex === "number" ? row.itemIndex : row.itemIndex == null ? null : Number(row.itemIndex),
    issueId: nullableText(row.issueId),
    issueKey: nullableText(row.issueKey),
    projectKey: nullableText(row.projectKey),
    fieldId: nullableText(row.fieldId),
    fieldName: nullableText(row.fieldName),
    eventTime: nullableText(row.eventTime),
    actor: { stableIdentity: nullableText(row.userId), displayValue: nullableText(row.displayName) },
    sourceProvenance: nullableText(row.sourceProvenance)
  };
  const diffHunks = Array.isArray(descriptionDiff?.hunks) ? structuredClone(descriptionDiff.hunks) as PendingAnalysisRecord["diff"]["diffHunks"] : [];
  const diffStatus = nullableText(descriptionDiff?.status) ?? nullableText(row.diffStatus);
  const addedLineCount = Number.isInteger(descriptionDiff?.addedLines) ? Number(descriptionDiff?.addedLines)
    : Number.isInteger(row.addedCount) ? Number(row.addedCount) : null;
  const removedLineCount = Number.isInteger(descriptionDiff?.deletedLines) ? Number(descriptionDiff?.deletedLines)
    : Number.isInteger(row.deletedCount) ? Number(row.deletedCount) : null;
  const sourceContentHash = sha256Canonical({ sourceIdentity, beforeSha256, afterSha256, diffStatus, diffHunks });
  const reference: PendingAnalysisRecord["reference"] = {
    evidenceId: createPendingEvidenceId(source.databaseId, sourceIdentity, sourceContentHash),
    activityEventId,
    sourceDatabaseId: source.databaseId,
    jiraServerFingerprint: source.jiraServerFingerprint,
    sourceRecordStableId,
    historyId: sourceIdentity.historyId,
    historyItemIndex: Number.isFinite(sourceIdentity.historyItemIndex) ? sourceIdentity.historyItemIndex : null,
    issueId: sourceIdentity.issueId,
    issueKey: sourceIdentity.issueKey,
    projectKey: sourceIdentity.projectKey,
    fieldId: sourceIdentity.fieldId,
    fieldName: sourceIdentity.fieldName,
    eventTime: sourceIdentity.eventTime,
    actor: sourceIdentity.actor,
    sourceProvenance: sourceIdentity.sourceProvenance,
    sourceContentHash,
    beforeSha256,
    afterSha256
  };
  const diff: PendingAnalysisRecord["diff"] = {
    diffText: null,
    diffHunks,
    addedLineCount,
    removedLineCount,
    diffStatus,
    isSubstantiveChange: diffStatus === "changed",
    beforeAvailability: beforeAvailable ? "AVAILABLE" : "UNAVAILABLE",
    afterAvailability: afterAvailable ? "AVAILABLE" : "UNAVAILABLE",
    integrityStatus: beforeSha256 || afterSha256 ? "VERIFIED" : "NOT_APPLICABLE",
    diagnostics: [nullableText(descriptionDiff?.diagnosticsCode)].filter((value): value is string => Boolean(value))
  };
  const integrityBase = {
    originalEvidenceAvailable: beforeAvailable || afterAvailable,
    sourceContentHashesVerified: Boolean((!beforeAvailable || beforeSha256) && (!afterAvailable || afterSha256)),
    diagnostics: [] as string[]
  };
  const compactBase = { reference, diff, integrity: integrityBase };
  const record: PendingAnalysisRecord = {
    reference,
    diff,
    integrity: { recordSha256: sha256Canonical(compactBase), ...integrityBase }
  };
  assertPendingAnalysisRecordSafe(record, runtimeIdentity);
  return record;
}
function errorCode(error: unknown, phase: "preparing" | "filtering" | "writing" | "finalizing") {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "EXPORT_CANCELLED") return code;
  if (error instanceof PendingAnalysisExportError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/SOURCE_DATABASE_CHANGED/.test(message)) return "SOURCE_DATABASE_CHANGED";
  if (/INVALID_|UNSUPPORTED_FIELDS|QUERY_OBJECT/.test(message)) return "FILTER_SNAPSHOT_INVALID";
  if (/ENOENT|SQLITE_CANTOPEN|no such table|DATABASE_UNAVAILABLE/.test(message)) return "SOURCE_DATABASE_NOT_READY";
  if (phase === "finalizing") return "EXPORT_FINALIZE_FAILED";
  return "EXPORT_WRITE_FAILED";
}

export function pendingAnalysisProgress(input: {
  exportId: string;
  status: Exclude<PendingAnalysisProgress["status"], "idle">;
  sourceView: PendingAnalysisProgress["sourceView"];
  totalRecords: number;
  processedRecords: number;
  serializedRecords?: number;
  writtenRecords?: number;
  elapsedMs: number;
  message: string;
}): PendingAnalysisProgress {
  const totalRecords = Math.max(0, Math.trunc(input.totalRecords));
  const processedRecords = Math.max(0, Math.min(totalRecords, Math.trunc(input.processedRecords)));
  const serializedRecords = Math.max(0, Math.min(processedRecords, Math.trunc(input.serializedRecords ?? processedRecords)));
  const writtenRecords = Math.max(0, Math.min(serializedRecords, Math.trunc(input.writtenRecords ?? serializedRecords)));
  const percentage = input.status === "completed" ? 100
    : totalRecords > 0 ? Math.min(99, Math.floor(processedRecords / totalRecords * 100)) : 0;
  return {
    exportId: input.exportId, status: input.status, stage: input.status, sourceView: input.sourceView,
    totalRecords, processedRecords, serializedRecords, writtenRecords,
    filteredCount: totalRecords, exportedCount: processedRecords, percentage,
    elapsedMs: Math.max(0, input.elapsedMs), message: input.message
  };
}

export async function runPendingAnalysisExport(input: RunInput, control: RunControl = {}): Promise<PendingAnalysisExportResult> {
  const now = control.now ?? (() => performance.now());
  const startedAt = now();
  const timestamp = taipeiTimestamp();
  const folderPath = resolveInsideRoot(input.appRoot, "exports", "pending-analysis");
  fs.mkdirSync(folderPath, { recursive: true });
  try { fs.accessSync(folderPath, fs.constants.W_OK); } catch { throw new PendingAnalysisExportError("EXPORT_PATH_NOT_WRITABLE", "Pending-analysis export folder is not writable."); }
  const prefix = input.sourceView === "ISSUE_ACTIVITY_EVENTS" ? "issue-activity-events" : "user-all-activity-events";
  const shortId = input.exportId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  let sequence = 0;
  let fileName = "";
  let finalPath = "";
  do {
    const suffix = sequence ? `_${String(sequence).padStart(2, "0")}` : "";
    fileName = `pending-analysis_${prefix}_${timestamp.file}_${shortId}${suffix}.json`;
    finalPath = assertPathInsideRoot(input.appRoot, path.join(folderPath, fileName));
    sequence += 1;
  } while (fs.existsSync(finalPath));
  const partialPath = `${finalPath}.partial`;
  const spoolPath = `${finalPath}.records.partial`;
  const recordsDigest = crypto.createHash("sha256");
  let phase: "preparing" | "filtering" | "writing" | "finalizing" = "preparing";
  let exportedCount = 0;
  let serializedCount = 0;
  let writtenCount = 0;
  let sourceDatabaseId = "";
  let jiraServerFingerprint = "";
  let batchCount = 0;
  let firstRecord = true;
  const runtimeIdentity = { ...input.runtimeIdentity, appRoot: input.appRoot, databasePath: input.databasePath };
  const emit = (status: Exclude<PendingAnalysisProgress["status"], "idle">, message: string) => control.onProgress?.(pendingAnalysisProgress({
    exportId: input.exportId, status, sourceView: input.sourceView, totalRecords: input.expectedFilteredCount,
    processedRecords: exportedCount, serializedRecords: serializedCount, writtenRecords: writtenCount,
    elapsedMs: now() - startedAt, message
  }));
  emit("preparing", "Freezing filtered query snapshot / 凍結篩選條件");
  try {
    fs.writeFileSync(spoolPath, "", { encoding: "utf8", flag: "wx" });
    recordsDigest.update("[");
    phase = "filtering";
    const scan = await scanDatabaseEventsForPendingAnalysis(input.databasePath, { sourceView: input.sourceView, query: input.query, issueKey: input.issueKey, userScope: input.userScope }, {
      batchSize: 100,
      onStart: (value) => {
        sourceDatabaseId = String(value.metadata.databaseId ?? "");
        jiraServerFingerprint = String(value.metadata.jiraServerIdentity ?? "");
        if (input.expectedDatabaseIdentity && input.expectedDatabaseIdentity !== value.databaseGeneration) throw new PendingAnalysisExportError("SOURCE_DATABASE_CHANGED", "Viewer database generation changed before export started.");
      },
      isCancelled: control.isCancelled,
      onProgress: (value) => emit(value.stage === "filtering" ? "filtering" : "writing", value.stage === "filtering" ? "Filtering complete data set / 篩選完整資料集" : "Writing export records / 寫入匯出紀錄"),
      onBatch: (batch) => {
        phase = "writing";
        const chunks: string[] = [];
        batchCount += 1;
        for (const row of batch) {
          const record = pendingAnalysisRecord(row, { databaseId: sourceDatabaseId, jiraServerFingerprint }, runtimeIdentity);
          const canonical = canonicalJson(record);
          serializedCount += 1;
          recordsDigest.update(firstRecord ? canonical : `,${canonical}`);
          chunks.push(`${firstRecord ? "" : ",\n"}${JSON.stringify(record, null, 2).split("\n").map((line) => `    ${line}`).join("\n")}`);
          firstRecord = false;
          exportedCount += 1;
        }
        fs.appendFileSync(spoolPath, chunks.join(""), "utf8");
        writtenCount = exportedCount;
      }
    });
    if (!scan.filteredCount) throw new PendingAnalysisExportError("NO_FILTERED_RECORDS", "No filtered records are available for export.");
    if (scan.filteredCount !== exportedCount || scan.filteredCount !== input.expectedFilteredCount) throw new PendingAnalysisExportError("COUNT_EXPORT_MISMATCH", "Filtered record count changed before export completed.");
    const databaseId = String(scan.metadata.databaseId ?? "");
    const jiraServerIdentity = String(scan.metadata.jiraServerIdentity ?? "");
    if (!databaseId || !jiraServerIdentity) throw new PendingAnalysisExportError("SOURCE_IDENTITY_INCOMPLETE", "Database ID or Jira server identity is unavailable.");
    recordsDigest.update("]");
    const querySnapshot = filterSnapshot(input.query, input.sourceView === "ISSUE_ACTIVITY_EVENTS" ? { issueKey: input.issueKey } : { userScope: input.userScope });
    const header = {
      schemaName: PENDING_ANALYSIS_SCHEMA_NAME, schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION,
      contractStatus: PENDING_ANALYSIS_CONTRACT_STATUS, exportId: input.exportId, createdAt: timestamp.iso,
      timezone: "Asia/Taipei", appVersion: input.appVersion,
      exportMetadata: { exportMode: PENDING_ANALYSIS_EXPORT_MODE, selfContained: false, fullContentIncluded: false, sourceDatabaseRequiredForFullContent: true },
      sourceView: input.sourceView,
      sourceDatabase: { sourceDatabaseId: databaseId, jiraServerFingerprint: jiraServerIdentity, jiraServerHost: hostOnly(scan.metadata.jiraServerUrl), sourceSchemaVersion: Number(scan.metadata.schemaVersion), databaseGeneration: scan.databaseGeneration },
      querySnapshot, counts: { filteredCountAtStart: scan.filteredCount, exportedCount, skippedCount: 0, failedCount: 0, batchCount }
    };
    assertPendingAnalysisHeaderSafe(header, runtimeIdentity);
    phase = "finalizing";
    emit("finalizing", "Finalizing integrity metadata / 完成完整性資料");
    const headerText = JSON.stringify(header, null, 2).replace(/\n}$/, "");
    fs.writeFileSync(partialPath, `${headerText},\n  \"records\": [\n`, { encoding: "utf8", flag: "wx" });
    await pipeline(fs.createReadStream(spoolPath), fs.createWriteStream(partialPath, { flags: "a" }));
    fs.appendFileSync(partialPath, `\n  ],\n  \"integrity\": ${JSON.stringify({ recordsSha256: recordsDigest.digest("hex"), recordCount: exportedCount, schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION, exportCompletionStatus: "COMPLETED", algorithm: "SHA-256" })},\n  \"diagnostics\": ${JSON.stringify(["Compact reference export. Full source content remains in the source SQLite database."])}\n}\n`, "utf8");
    const fileHash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => { const stream = fs.createReadStream(partialPath); stream.on("data", (chunk) => fileHash.update(chunk)); stream.on("end", resolve); stream.on("error", reject); });
    const sha256 = fileHash.digest("hex");
    const sizeBytes = fs.statSync(partialPath).size;
    fs.renameSync(partialPath, finalPath);
    fs.unlinkSync(spoolPath);
    const result = { exportId: input.exportId, fileName, filePath: finalPath, folderPath, exportedCount, sizeBytes, sha256, elapsedMs: Math.max(0, now() - startedAt) };
    emit("completed", "Export completed / 匯出完成");
    return result;
  } catch (error) {
    for (const candidate of [partialPath, spoolPath]) { try { fs.unlinkSync(candidate); } catch { /* Atomic cleanup. */ } }
    const code = errorCode(error, phase);
    if (code === "EXPORT_CANCELLED") throw new PendingAnalysisExportError("EXPORT_CANCELLED", "Pending-analysis export was cancelled.");
    if (error instanceof PendingAnalysisExportError) throw error;
    throw new PendingAnalysisExportError(code as "SOURCE_DATABASE_CHANGED" | "SOURCE_DATABASE_NOT_READY" | "FILTER_SNAPSHOT_INVALID" | "EXPORT_WRITE_FAILED" | "EXPORT_FINALIZE_FAILED", error instanceof Error ? error.message : String(error));
  }
}
