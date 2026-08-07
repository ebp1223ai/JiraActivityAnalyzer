import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { assertPathInsideRoot, resolveInsideRoot } from "./appRoot.js";
import { scanDatabaseEventsForPendingAnalysis } from "./databaseViewer.js";
import {
  PENDING_ANALYSIS_CONTRACT_STATUS,
  PENDING_ANALYSIS_SCHEMA_NAME,
  PENDING_ANALYSIS_SCHEMA_VERSION,
  PendingAnalysisExportError,
  assertPendingAnalysisSafe,
  canonicalJson,
  createPendingEvidenceId,
  filterSnapshot,
  sha256Canonical,
  type PendingAnalysisExportRequest,
  type PendingAnalysisExportResult,
  type PendingAnalysisProgress,
  type PendingAnalysisRecord
} from "../shared/pendingAnalysisContract.js";

type RunInput = PendingAnalysisExportRequest & {
  exportId: string;
  databasePath: string;
  appRoot: string;
  appVersion: string;
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

function jsonValue(value: unknown) {
  if (typeof value !== "string") return value ?? null;
  try { return JSON.parse(value); } catch { return value; }
}

function hostOnly(value: unknown) {
  try { return new URL(String(value ?? "")).host; } catch { return ""; }
}

export function pendingAnalysisRecord(row: Record<string, unknown>, source: { databaseId: string; jiraServerFingerprint: string }): PendingAnalysisRecord {
  const beforeRaw = row.before == null ? null : String(row.before);
  const afterRaw = row.after == null ? null : String(row.after);
  const descriptionDiff = row.descriptionDiff && typeof row.descriptionDiff === "object" ? row.descriptionDiff as Record<string, unknown> : null;
  const sourceIdentity = {
    issueId: row.issueId ?? null, issueKey: row.issueKey ?? null, eventTime: row.eventTime ?? null,
    eventType: row.eventType ?? null, sourceProvenance: row.sourceProvenance ?? null,
    sourceRecordStableId: row.sourceRecordId ?? null, jiraNativeSourceId: row.jiraNativeSourceId ?? null,
    identityKeyType: row.identityKeyType ?? null, fieldId: row.fieldId ?? null,
    historyId: row.historyId ?? null, historyItemIndex: row.itemIndex ?? null
  };
  const beforeAvailable = beforeRaw !== null && row.beforeComplete !== 0;
  const afterAvailable = afterRaw !== null && row.afterComplete !== 0;
  const beforeSha256 = descriptionDiff?.diffInputBeforeSha256 ?? (beforeAvailable ? crypto.createHash("sha256").update(beforeRaw!, "utf8").digest("hex") : null);
  const afterSha256 = descriptionDiff?.diffInputAfterSha256 ?? (afterAvailable ? crypto.createHash("sha256").update(afterRaw!, "utf8").digest("hex") : null);
  const analysisContent = {
    beforeRaw, afterRaw,
    beforeAvailability: beforeAvailable ? "AVAILABLE" : "UNAVAILABLE",
    afterAvailability: afterAvailable ? "AVAILABLE" : "UNAVAILABLE",
    beforeSha256, afterSha256,
    diffStatus: row.diffStatus ?? null,
    diffReason: descriptionDiff?.diagnosticsCode ?? null,
    diffText: null,
    diffHunks: descriptionDiff?.hunks ?? [],
    addedLineCount: row.addedCount ?? null,
    removedLineCount: row.deletedCount ?? null,
    unchangedLineCount: null,
    isSubstantiveChange: row.diffStatus === "changed",
    contentDisplayMode: row.contentDisplayMode ?? null,
    contentSource: row.contentSource ?? null,
    parsedBefore: jsonValue(row.before), parsedAfter: jsonValue(row.after),
    comment: row.commentBody ?? null, commentFormat: row.commentBodyFormat ?? null,
    diagnostics: [descriptionDiff?.diagnosticsCode].filter(Boolean)
  };
  const sourceContentHash = sha256Canonical({ sourceIdentity, beforeRaw, afterRaw, beforeSha256, afterSha256, diffStatus: row.diffStatus ?? null });
  const evidenceIdentity = {
    evidenceId: createPendingEvidenceId(source.databaseId, sourceIdentity, sourceContentHash),
    activityEventId: String(row.eventId ?? ""), sourceRecordType: "ACTIVITY_EVENT",
    sourceRecordStableId: row.sourceRecordId ?? null, sourceDatabaseId: source.databaseId,
    jiraServerFingerprint: source.jiraServerFingerprint, issueId: row.issueId ?? null,
    issueKey: row.issueKey ?? null, historyId: row.historyId ?? null, historyItemIndex: row.itemIndex ?? null,
    commentId: row.sourceCommentId ?? null, fieldId: row.fieldId ?? null, fieldName: row.fieldName ?? null,
    sourceType: row.sourceProvenance ?? null, sourceContentHash,
    availability: { history: row.historyId ? "AVAILABLE" : "NOT_APPLICABLE", comment: row.sourceCommentId ? "AVAILABLE" : "NOT_APPLICABLE" }
  };
  const recordBase = {
    evidenceIdentity,
    eventMetadata: {
      eventTime: row.eventTime ?? null, eventType: row.eventType ?? null, action: row.eventType ?? null,
      actor: { stableIdentity: row.userId ?? null, displayValue: row.displayName ?? null },
      projectKey: row.projectKey ?? null, source: row.sourceProvenance ?? null, sourceUrl: null,
      provenanceStatus: row.sourceProvenance ? "AVAILABLE" : "UNAVAILABLE",
      integrityStatus: row.parseStatus === "success" ? "VALIDATED" : String(row.parseStatus ?? "UNKNOWN")
    },
    analysisContent,
    currentIssueContext: {
      contextType: "CURRENT_SAVED_ISSUE_SNAPSHOT" as const,
      contextSemantics: "CURRENT_SAVED_ISSUE_SNAPSHOT",
      summary: row.summary ?? null, projectKey: row.projectKey ?? null, projectName: null,
      issueType: row.issueTypeName ?? null, status: row.currentStatusName ?? null, priority: row.currentPriorityName ?? null,
      labels: jsonValue(row.currentLabels), components: jsonValue(row.currentComponents),
      assignee: row.currentAssigneeId ?? null, reporter: row.currentReporterId ?? null, creator: row.currentCreatorId ?? null,
      startDate: row.currentStartDate ?? null, dueDate: row.currentDueDate ?? null,
      currentDescription: null, currentDescriptionAvailability: "NOT_PROJECTED_BY_CURRENT_SCHEMA",
      snapshotUpdatedAt: row.currentSnapshotUpdatedAt ?? null
    },
    relatedContextCandidates: { sameHistoryItems: [], availability: "UNAVAILABLE", diagnostics: ["Bounded same-history projection is not available in v0.3.0 draft. No remote request was made."] },
    integrity: {
      recordSha256: "", originalEvidenceAvailable: beforeRaw !== null || afterRaw !== null,
      identityCompleteness: evidenceIdentity.activityEventId && evidenceIdentity.sourceRecordStableId && evidenceIdentity.sourceDatabaseId ? "COMPLETE" : "INCOMPLETE",
      beforeAfterHashVerified: Boolean((!beforeAvailable || beforeSha256) && (!afterAvailable || afterSha256)),
      crossViewIdentityConsistency: "DETERMINISTIC_BY_SOURCE_IDENTITY_AND_CONTENT_HASH",
      diagnostics: [] as string[]
    }
  };
  const record = { ...recordBase, integrity: { ...recordBase.integrity, recordSha256: sha256Canonical(recordBase) } };
  assertPendingAnalysisSafe(record);
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
  let sourceDatabaseId = "";
  let jiraServerFingerprint = "";
  let batchCount = 0;
  let firstRecord = true;
  const emit = (status: PendingAnalysisProgress["status"], message: string, filteredCount: number, percentage: number) => control.onProgress?.({ exportId: input.exportId, status, sourceView: input.sourceView, filteredCount, exportedCount, percentage, elapsedMs: Math.max(0, now() - startedAt), message });
  emit("preparing", "Freezing filtered query snapshot / 凍結篩選條件", input.expectedFilteredCount, 0);
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
      onProgress: (value) => emit(value.stage === "filtering" ? "filtering" : "writing", value.stage === "filtering" ? "Filtering complete data set / 篩選完整資料集" : "Writing export records / 寫入匯出紀錄", value.stage === "filtering" ? value.matched : value.total, value.total ? Math.min(95, Math.round(value.scanned / value.total * 95)) : 0),
      onBatch: (batch) => {
        phase = "writing";
        const chunks: string[] = [];
        batchCount += 1;
        for (const row of batch) {
          const record = pendingAnalysisRecord(row, { databaseId: sourceDatabaseId, jiraServerFingerprint });
          const canonical = canonicalJson(record);
          recordsDigest.update(firstRecord ? canonical : `,${canonical}`);
          chunks.push(`${firstRecord ? "" : ",\n"}${JSON.stringify(record, null, 2).split("\n").map((line) => `    ${line}`).join("\n")}`);
          firstRecord = false;
          exportedCount += 1;
        }
        fs.appendFileSync(spoolPath, chunks.join(""), "utf8");
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
      timezone: "Asia/Taipei", appVersion: input.appVersion, sourceView: input.sourceView,
      sourceDatabase: { sourceDatabaseId: databaseId, jiraServerFingerprint: jiraServerIdentity, jiraServerHost: hostOnly(scan.metadata.jiraServerUrl), sourceSchemaVersion: Number(scan.metadata.schemaVersion), databaseGeneration: scan.databaseGeneration },
      querySnapshot, counts: { filteredCountAtStart: scan.filteredCount, exportedCount, skippedCount: 0, failedCount: 0, batchCount }
    };
    assertPendingAnalysisSafe(header);
    phase = "finalizing";
    emit("finalizing", "Finalizing integrity metadata / 完成完整性資料", scan.filteredCount, 96);
    const headerText = JSON.stringify(header, null, 2).replace(/\n}$/, "");
    fs.writeFileSync(partialPath, `${headerText},\n  \"records\": [\n`, { encoding: "utf8", flag: "wx" });
    await pipeline(fs.createReadStream(spoolPath), fs.createWriteStream(partialPath, { flags: "a" }));
    fs.appendFileSync(partialPath, `\n  ],\n  \"integrity\": ${JSON.stringify({ recordsSha256: recordsDigest.digest("hex"), recordCount: exportedCount, schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION, exportCompletionStatus: "COMPLETED", algorithm: "SHA-256" })},\n  \"diagnostics\": ${JSON.stringify(["Contract remains review-draft pending real SQLite and user content review"])}\n}\n`, "utf8");
    const fileHash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => { const stream = fs.createReadStream(partialPath); stream.on("data", (chunk) => fileHash.update(chunk)); stream.on("end", resolve); stream.on("error", reject); });
    const sha256 = fileHash.digest("hex");
    const sizeBytes = fs.statSync(partialPath).size;
    fs.renameSync(partialPath, finalPath);
    fs.unlinkSync(spoolPath);
    const result = { exportId: input.exportId, fileName, filePath: finalPath, folderPath, exportedCount, sizeBytes, sha256, elapsedMs: Math.max(0, now() - startedAt) };
    emit("completed", "Export completed / 匯出完成", exportedCount, 100);
    return result;
  } catch (error) {
    for (const candidate of [partialPath, spoolPath]) { try { fs.unlinkSync(candidate); } catch { /* Atomic cleanup. */ } }
    const code = errorCode(error, phase);
    if (code === "EXPORT_CANCELLED") throw new PendingAnalysisExportError("EXPORT_CANCELLED", "Pending-analysis export was cancelled.");
    if (error instanceof PendingAnalysisExportError) throw error;
    throw new PendingAnalysisExportError(code as "SOURCE_DATABASE_CHANGED" | "SOURCE_DATABASE_NOT_READY" | "FILTER_SNAPSHOT_INVALID" | "EXPORT_WRITE_FAILED" | "EXPORT_FINALIZE_FAILED", error instanceof Error ? error.message : String(error));
  }
}
