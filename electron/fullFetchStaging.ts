import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJsonSha256 } from "./activityStreamRoundStability.js";
import { createZip, findSensitiveData } from "./sourceArchiveExporter.js";

export const FULL_FETCH_STAGING_SCHEMA = "full_fetch_staging_v1";
export const FULL_FETCH_CHECKPOINT_SCHEMA = "full_fetch_queue_checkpoint_v1";
export const RETENTION_DAYS = 7;

export type StagingStatus = "created" | "running" | "cancel_requested" | "cancelled" | "interrupted" | "resuming" | "ready_to_export" | "exporting" | "exported" | "partial_exported" | "export_failed" | "discarded";
export type TargetStatus = "pending" | "in_progress" | "eligible" | "partial" | "failed_retryable" | "failed_non_retryable" | "failed_after_resume_retry" | "excluded";

export type StagingTarget = {
  index: number;
  objectKey: string;
  candidate: Record<string, unknown>;
  status: TargetStatus;
  attemptCount: number;
  resumeRetryCount: number;
  lastError: string;
  errorType: string;
  classification: string;
  rawFilePath: string;
  contentHash: string;
  updatedAt: string;
};

export type StagingCheckpoint = {
  schemaVersion: string;
  stagingId: string;
  originalQueueOrder: string[];
  targets: StagingTarget[];
  updatedAt: string;
};

export type StagingState = {
  schemaVersion: string;
  stagingId: string;
  fullFetchRunId: string;
  status: StagingStatus;
  selectedUser: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  completed: number;
  eligible: number;
  partial: number;
  failed: number;
  excluded: number;
  remaining: number;
  lastCompletedObjectKey: string;
  exportedAt: string | null;
  retainUntil: string | null;
  packagePath: string | null;
  packageSha256: string | null;
};

export type StagingRun = { dir: string; state: StagingState; checkpoint: StagingCheckpoint };
export type TargetOutcome = {
  status: "eligible" | "partial" | "failed" | "excluded";
  rawEnvelope?: Record<string, unknown>;
  missingSections?: string[];
  failedEndpoints?: string[];
  classification?: string;
  retryable?: boolean;
  errorType?: string;
  errorMessage?: string;
};

const mutableStatuses = new Set<StagingStatus>(["created", "running", "cancel_requested", "cancelled", "interrupted", "resuming", "ready_to_export", "partial_exported", "export_failed"]);
const completeTargetStatuses = new Set<TargetStatus>(["eligible", "partial", "failed_retryable", "failed_non_retryable", "failed_after_resume_retry", "excluded"]);
const locks = new Set<string>();

function now() { return new Date().toISOString(); }
function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/authorization\s*[:=]\s*[^\r\n]+/gi, "Authorization: [masked]")
    .replace(/(token|password|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1: [masked]")
    .slice(0, 2000);
}
function safeKey(value: string) { return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 120) || "UNKNOWN"; }
function json(value: unknown) { return `${JSON.stringify(value, null, 2)}\n`; }
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, "utf8")) as T; }
function relative(runDir: string, filePath: string) { return path.relative(runDir, filePath).replace(/\\/g, "/"); }

export function atomicWriteJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = fs.openSync(temporaryPath, "w");
  try {
    fs.writeFileSync(descriptor, json(value), "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try { fs.renameSync(temporaryPath, filePath); }
  catch {
    try { fs.rmSync(filePath, { force: true }); } catch { /* Windows replace fallback. */ }
    fs.renameSync(temporaryPath, filePath);
  }
}

function appendJsonl(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, "a");
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, "utf8"); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}

function jsonlHasIdentity(filePath: string, objectKey: string, contentHash: string) {
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).some((line) => {
    try { const item = JSON.parse(line) as Record<string, unknown>; return item.objectKey === objectKey && item.contentHash === contentHash; }
    catch { return false; }
  });
}

function assertUnlocked(run: StagingRun) {
  if (locks.has(run.state.stagingId)) throw new Error("Full Fetch staging is locked for export.");
}

function diagnosticsPath(runDir: string) { return path.join(runDir, "staging-diagnostics.jsonl"); }
export function appendStagingDiagnostic(runDir: string, stage: string, fields: Record<string, unknown> = {}) {
  appendJsonl(diagnosticsPath(runDir), { time: now(), stage, ...fields, errorMessage: fields.errorMessage ? cleanText(fields.errorMessage) : undefined });
}

function paths(runDir: string) {
  return {
    state: path.join(runDir, "staging-state.json"), checkpoint: path.join(runDir, "queue-checkpoint.json"),
    eligible: path.join(runDir, "source-archive", "jira-full-fetch-payloads.jsonl"),
    refs: path.join(runDir, "source-archive", "source-import-refs.jsonl"),
    index: path.join(runDir, "source-archive", "source-object-index.json"),
    errors: path.join(runDir, "failed", "errors.jsonl"), exportResult: path.join(runDir, "export", "export-result.json")
  };
}

function validate(run: StagingRun) {
  if (run.state.schemaVersion !== FULL_FETCH_STAGING_SCHEMA || run.checkpoint.schemaVersion !== FULL_FETCH_CHECKPOINT_SCHEMA) throw new Error("Unsupported Full Fetch staging schema.");
  if (run.state.stagingId !== run.checkpoint.stagingId) throw new Error("Staging state/checkpoint ID mismatch.");
  if (run.checkpoint.originalQueueOrder.length !== run.checkpoint.targets.length) throw new Error("Staging queue is corrupt.");
  return run;
}

export function loadStagingRun(runDir: string): StagingRun {
  return validate({ dir: runDir, state: readJson<StagingState>(paths(runDir).state), checkpoint: readJson<StagingCheckpoint>(paths(runDir).checkpoint) });
}

function deriveState(state: StagingState, checkpoint: StagingCheckpoint): StagingState {
  const count = (status: TargetStatus) => checkpoint.targets.filter((target) => target.status === status).length;
  const completed = checkpoint.targets.filter((target) => completeTargetStatuses.has(target.status)).length;
  const remaining = checkpoint.targets.filter((target) => target.status === "pending" || target.status === "in_progress" || target.status === "partial" || (target.status === "failed_retryable" && target.resumeRetryCount === 0)).length;
  return {
    ...state, updatedAt: now(), total: checkpoint.targets.length, completed, eligible: count("eligible"), partial: count("partial"),
    failed: count("failed_retryable") + count("failed_non_retryable") + count("failed_after_resume_retry"), excluded: count("excluded"),
    remaining
  };
}

function persist(run: StagingRun) {
  run.checkpoint.updatedAt = now();
  run.state = deriveState(run.state, run.checkpoint);
  atomicWriteJson(paths(run.dir).checkpoint, run.checkpoint);
  appendStagingDiagnostic(run.dir, "checkpoint_write", { stagingId: run.state.stagingId, completed: run.state.completed, remaining: run.state.remaining });
  atomicWriteJson(paths(run.dir).state, run.state);
}

export function createStagingRun(rootDir: string, input: { runId: string; selectedUser: string; queue: Record<string, unknown>[]; createdAt?: string }): StagingRun {
  const createdAt = input.createdAt ?? now();
  const stagingId = `FFS-${safeKey(input.runId)}`;
  const runDir = path.join(rootDir, stagingId);
  if (fs.existsSync(runDir)) throw new Error(`Staging already exists: ${stagingId}`);
  for (const folder of ["completed", "partial", "failed", "source-archive", "export"]) fs.mkdirSync(path.join(runDir, folder), { recursive: true });
  const targets = input.queue.map((candidate, index): StagingTarget => ({ index, objectKey: safeKey(String(candidate.key ?? `UNKNOWN-${index + 1}`)), candidate, status: "pending", attemptCount: 0, resumeRetryCount: 0, lastError: "", errorType: "", classification: "", rawFilePath: "", contentHash: "", updatedAt: createdAt }));
  const checkpoint: StagingCheckpoint = { schemaVersion: FULL_FETCH_CHECKPOINT_SCHEMA, stagingId, originalQueueOrder: targets.map((target) => target.objectKey), targets, updatedAt: createdAt };
  const state: StagingState = { schemaVersion: FULL_FETCH_STAGING_SCHEMA, stagingId, fullFetchRunId: input.runId, status: "created", selectedUser: cleanText(input.selectedUser), createdAt, updatedAt: createdAt, total: targets.length, completed: 0, eligible: 0, partial: 0, failed: 0, excluded: 0, remaining: targets.length, lastCompletedObjectKey: "", exportedAt: null, retainUntil: null, packagePath: null, packageSha256: null };
  const run = { dir: runDir, state, checkpoint };
  atomicWriteJson(paths(runDir).index, { schemaVersion: "source_object_index_v1", objects: [] });
  persist(run);
  appendStagingDiagnostic(runDir, "staging_create", { stagingId, runId: input.runId, total: targets.length });
  return run;
}

export function setStagingStatus(run: StagingRun, status: StagingStatus) { assertUnlocked(run); run.state.status = status; persist(run); return run; }

export function startTarget(run: StagingRun, objectKey: string, resume = false) {
  assertUnlocked(run);
  const target = run.checkpoint.targets.find((item) => item.objectKey === safeKey(objectKey));
  if (!target) throw new Error(`Unknown staging target: ${objectKey}`);
  target.status = "in_progress"; target.attemptCount += 1; target.updatedAt = now();
  if (resume) target.resumeRetryCount += 1;
  persist(run);
  appendStagingDiagnostic(run.dir, resume ? "resume_target_retry" : "target_start", { stagingId: run.state.stagingId, objectKey: target.objectKey, attemptCount: target.attemptCount, resumeRetryCount: target.resumeRetryCount });
  return target;
}

function isRetryable(outcome: TargetOutcome) {
  if (typeof outcome.retryable === "boolean") return outcome.retryable;
  const kind = `${outcome.errorType ?? ""} ${outcome.classification ?? ""}`.toLowerCase();
  return /timeout|network_error|connection_reset|partial_response|temporary_parse_failure|http_(429|500|502|503|504)/.test(kind);
}

export function completeTarget(run: StagingRun, objectKey: string, outcome: TargetOutcome) {
  assertUnlocked(run);
  const target = run.checkpoint.targets.find((item) => item.objectKey === safeKey(objectKey));
  if (!target) throw new Error(`Unknown staging target: ${objectKey}`);
  const started = Date.now();
  if (outcome.status === "eligible") {
    const raw = outcome.rawEnvelope ?? {};
    const issue = raw.issue && typeof raw.issue === "object" && !Array.isArray(raw.issue) ? raw.issue as Record<string, unknown> : {};
    if (Object.keys(issue).length === 0 || !String(issue.key ?? target.objectKey).trim()) {
      outcome = { status: "failed", classification: "unsupported_schema", errorType: "unsupported_schema", errorMessage: "Eligible payload is missing a valid primary Jira issue.", retryable: false };
    } else {
      const sectionsValue = raw.requiredSections ?? raw.sections;
      const sections = sectionsValue && typeof sectionsValue === "object" && !Array.isArray(sectionsValue) ? sectionsValue as Record<string, unknown> : {};
      const incomplete = Object.entries(sections).filter(([, value]) => !["complete", "not_supported", "not_applicable", "complete_metadata_only"].includes(String(value))).map(([key]) => key);
      if (incomplete.length) outcome = { ...outcome, status: "partial", missingSections: incomplete, classification: "incomplete_required_sections", retryable: true, errorType: "partial_response", errorMessage: `Required sections incomplete: ${incomplete.join(", ")}` };
    }
  }
  const base = { sourceSystem: "jira", objectType: "issue", objectKey: target.objectKey, selectedFullFetchTarget: true, capturedAt: now(), ...outcome.rawEnvelope };
  appendStagingDiagnostic(run.dir, "raw_write_start", { objectKey: target.objectKey });
  if (outcome.status === "eligible" || outcome.status === "partial") {
    const partial = outcome.status === "partial";
    const envelope = partial ? { ...base, missingSections: outcome.missingSections ?? [], failedEndpoints: outcome.failedEndpoints ?? [], classification: cleanText(outcome.classification), retryable: isRetryable(outcome), errorType: cleanText(outcome.errorType), errorMessageSanitized: cleanText(outcome.errorMessage) } : base;
    if (!Object.keys(outcome.rawEnvelope ?? {}).length) throw new Error("Raw Full Fetch envelope is empty.");
    const sensitive = findSensitiveData(envelope);
    if (sensitive.length) return completeTarget(run, objectKey, { status: "failed", errorType: "sensitive_rejection", classification: "sensitive_rejection", errorMessage: `Sensitive paths rejected: ${sensitive.join(", ")}`, retryable: false });
    const rawFile = path.join(run.dir, partial ? "partial" : "completed", `${safeKey(target.objectKey)}.raw.json`);
    atomicWriteJson(rawFile, envelope);
    target.rawFilePath = relative(run.dir, rawFile);
    target.contentHash = canonicalJsonSha256(outcome.rawEnvelope);
    appendStagingDiagnostic(run.dir, "raw_write_complete", { objectKey: target.objectKey, fileSize: fs.statSync(rawFile).size, durationMs: Date.now() - started });
    target.status = partial ? "partial" : "eligible";
    target.classification = cleanText(outcome.classification || target.status);
    target.errorType = cleanText(outcome.errorType);
    target.lastError = cleanText(outcome.errorMessage);
    appendStagingDiagnostic(run.dir, "eligibility_assessment", { objectKey: target.objectKey, targetStatus: target.status, classification: target.classification });
    if (!partial) {
      const index = readJson<{ schemaVersion: string; objects: Array<Record<string, unknown>> }>(paths(run.dir).index);
      const identity = `jira:${target.objectKey}:${target.contentHash}`;
      if (!index.objects.some((item) => item.identity === identity)) {
        const payload = { ...envelope, contentHash: target.contentHash };
        if (!jsonlHasIdentity(paths(run.dir).eligible, target.objectKey, target.contentHash)) appendJsonl(paths(run.dir).eligible, payload);
        if (!jsonlHasIdentity(paths(run.dir).refs, target.objectKey, target.contentHash)) appendJsonl(paths(run.dir).refs, { sourceSystem: "jira", objectType: "issue", objectKey: target.objectKey, contentHash: target.contentHash, sourceFileName: target.rawFilePath, sourceJsonPath: "$" });
        index.objects.push({ identity, sourceSystem: "jira", objectType: "issue", objectKey: target.objectKey, contentHash: target.contentHash, rawFilePath: target.rawFilePath });
        atomicWriteJson(paths(run.dir).index, index);
        appendStagingDiagnostic(run.dir, "eligible_jsonl_append", { objectKey: target.objectKey, classification: target.classification });
      }
    }
  } else if (outcome.status === "failed") {
    const retryable = isRetryable(outcome);
    target.status = retryable ? (target.resumeRetryCount > 0 ? "failed_after_resume_retry" : "failed_retryable") : "failed_non_retryable";
    target.errorType = cleanText(outcome.errorType); target.classification = cleanText(outcome.classification); target.lastError = cleanText(outcome.errorMessage);
    appendJsonl(paths(run.dir).errors, { time: now(), objectKey: target.objectKey, status: target.status, retryable, errorType: target.errorType, classification: target.classification, errorMessageSanitized: target.lastError, attemptCount: target.attemptCount, resumeRetryCount: target.resumeRetryCount });
  } else target.status = "excluded";
  target.updatedAt = now();
  run.state.lastCompletedObjectKey = target.objectKey;
  persist(run);
  appendStagingDiagnostic(run.dir, "target_complete", { objectKey: target.objectKey, targetStatus: target.status, attemptCount: target.attemptCount, resumeRetryCount: target.resumeRetryCount, completed: run.state.completed, remaining: run.state.remaining });
  return target;
}

export function selectResumeTargets(run: StagingRun) {
  return run.checkpoint.targets.filter((target) => target.status === "pending" || target.status === "in_progress" || target.status === "partial" || (target.status === "failed_retryable" && target.resumeRetryCount === 0));
}

export function scanRecoverableStaging(rootDir: string) {
  fs.mkdirSync(rootDir, { recursive: true });
  const runs: StagingRun[] = [];
  for (const name of fs.readdirSync(rootDir)) {
    const runDir = path.join(rootDir, name);
    try {
      const run = loadStagingRun(runDir);
      if (run.state.status === "running" || run.state.status === "resuming") {
        for (const target of run.checkpoint.targets) {
          if (target.status === "in_progress" && target.resumeRetryCount > 0) {
            target.status = "failed_after_resume_retry";
            target.errorType = target.errorType || "interrupted_resume_retry";
            target.lastError = target.lastError || "Resume retry was interrupted; automatic retry limit reached.";
          }
        }
        run.state.status = "interrupted";
        persist(run);
      }
      const needsDecision = run.state.status === "partial_exported" ? run.state.remaining > 0 : run.state.total > 0 || run.state.status === "export_failed";
      if (mutableStatuses.has(run.state.status) && run.state.status !== "discarded" && needsDecision) runs.push(run);
    } catch (error) { appendStagingDiagnostic(runDir, "startup_recovery_scan", { errorType: "checkpoint_corruption", errorMessage: error instanceof Error ? error.message : String(error) }); }
  }
  runs.sort((a, b) => b.state.updatedAt.localeCompare(a.state.updatedAt));
  if (runs[0]) appendStagingDiagnostic(runs[0].dir, "startup_recovery_scan", { stagingId: runs[0].state.stagingId, recoverable: true });
  return runs[0] ?? null;
}

export function previewStaging(run: StagingRun) {
  appendStagingDiagnostic(run.dir, "preview_start", { stagingId: run.state.stagingId });
  const index = readJson<{ objects?: unknown[] }>(paths(run.dir).index);
  const files = [paths(run.dir).state, paths(run.dir).checkpoint, paths(run.dir).index, paths(run.dir).errors].filter(fs.existsSync);
  const stagingSizeBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0) + run.checkpoint.targets.reduce((sum, target) => sum + (target.rawFilePath && fs.existsSync(path.join(run.dir, target.rawFilePath)) ? fs.statSync(path.join(run.dir, target.rawFilePath)).size : 0), 0);
  const result = { ...run.state, duplicates: Math.max(0, run.state.eligible - (index.objects?.length ?? 0)), stagingSizeBytes, estimatedPackageSizeBytes: stagingSizeBytes, blockingErrors: run.checkpoint.targets.filter((target) => target.status === "failed_non_retryable" || target.status === "failed_after_resume_retry").map((target) => ({ objectKey: target.objectKey, error: target.lastError })) };
  appendStagingDiagnostic(run.dir, "preview_complete", { stagingId: run.state.stagingId, completed: run.state.completed, remaining: run.state.remaining });
  return result;
}

export function retainUntil(exportedAt: string) { return new Date(new Date(exportedAt).getTime() + RETENTION_DAYS * 86400000).toISOString(); }

function buffersFromLines(filePath: string) { return fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.alloc(0); }
export function exportStaging(run: StagingRun, outputDir: string, partial = false, exportedAt = now()) {
  if (locks.has(run.state.stagingId)) throw new Error("Staging export is already running.");
  locks.add(run.state.stagingId);
  try {
    run.state.status = "exporting"; persist(run); appendStagingDiagnostic(run.dir, partial ? "partial_export_start" : "export_start", { stagingId: run.state.stagingId });
    fs.mkdirSync(outputDir, { recursive: true });
    const p = paths(run.dir); const index = readJson<Record<string, unknown>>(p.index);
    const packageStatus = partial || run.state.remaining > 0 || run.state.partial > 0 || run.state.failed > 0 ? "partial" : "complete";
    const manifest = { schemaVersion: "source_archive_import_package_v1", appVersion: "0.2.28", exportedAt, packageStatus, safeForAutomaticImport: packageStatus === "complete", stagingId: run.state.stagingId, total: run.state.total, completed: run.state.completed, remaining: run.state.remaining, eligible: run.state.eligible, partial: run.state.partial, failed: run.state.failed, excluded: run.state.excluded, futureImporterPolicy: "Import eligible records only; skip partial, failed, and excluded records; deduplicate before insertion." };
    const prefix = "source-archive-import-package/";
    const files: Record<string, Buffer> = {
      [`${prefix}source-archive-import-manifest.json`]: Buffer.from(json(manifest)),
      [`${prefix}jira-full-fetch-payloads.jsonl`]: buffersFromLines(p.eligible),
      [`${prefix}source-import-refs.jsonl`]: buffersFromLines(p.refs),
      [`${prefix}source-object-index.json`]: Buffer.from(json(index)),
      [`${prefix}source-archive-import-summary.json`]: Buffer.from(json(run.state)),
      [`${prefix}source-archive-import-errors.jsonl`]: buffersFromLines(p.errors),
      [`${prefix}README_Source_Archive_Import.txt`]: Buffer.from("Full Fetch Staging / Full Fetch 增量暫存\n\nPartial packages are not safe for automatic import. Import eligible records only.\n部分套件不可自動匯入；僅匯入 eligible 紀錄。\n", "utf8")
    };
    appendStagingDiagnostic(run.dir, "zip_start", { stagingId: run.state.stagingId });
    const zip = createZip(files); const fileName = `source-archive-import-package-${run.state.stagingId}-${packageStatus}.zip`; const packagePath = path.join(outputDir, fileName);
    const descriptor = fs.openSync(packagePath, "w"); try { fs.writeFileSync(descriptor, zip); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    appendStagingDiagnostic(run.dir, "zip_complete", { stagingId: run.state.stagingId, fileSize: zip.length });
    const packageSha256 = crypto.createHash("sha256").update(zip).digest("hex");
    const exportResult = { schemaVersion: "full_fetch_staging_export_result_v1", stagingId: run.state.stagingId, packageStatus, safeForAutomaticImport: packageStatus === "complete", packagePath, packageSha256, fileSize: zip.length, exportedAt };
    atomicWriteJson(p.exportResult, exportResult);
    run.state.status = packageStatus === "complete" ? "exported" : "partial_exported"; run.state.exportedAt = exportedAt; run.state.retainUntil = retainUntil(exportedAt); run.state.packagePath = packagePath; run.state.packageSha256 = packageSha256; persist(run);
    appendStagingDiagnostic(run.dir, "package_hash", { stagingId: run.state.stagingId, classification: packageSha256 });
    appendStagingDiagnostic(run.dir, packageStatus === "partial" ? "partial_export_complete" : "export_complete", { stagingId: run.state.stagingId, fileSize: zip.length });
    return exportResult;
  } catch (error) {
    run.state.status = "export_failed"; persist(run); appendStagingDiagnostic(run.dir, "export_failure", { errorType: "export_failure", errorMessage: error instanceof Error ? error.message : String(error) }); throw error;
  } finally { locks.delete(run.state.stagingId); }
}

export function cancelAndExportPartial(run: StagingRun, outputDir: string) {
  if (run.state.status !== "cancel_requested") setStagingStatus(run, "cancel_requested");
  setStagingStatus(run, "cancelled");
  return exportStaging(run, outputDir, true);
}

export function discardStaging(run: StagingRun) { setStagingStatus(run, "discarded"); return run.state; }

export function cleanupExpiredStaging(rootDir: string, at = new Date()) {
  const results: Array<{ stagingId: string; removed: boolean; reason: string }> = [];
  if (!fs.existsSync(rootDir)) return results;
  for (const name of fs.readdirSync(rootDir)) {
    const runDir = path.join(rootDir, name);
    try {
      const run = loadStagingRun(runDir); appendStagingDiagnostic(runDir, "cleanup_start", { stagingId: run.state.stagingId });
      const exportResultValid = fs.existsSync(paths(runDir).exportResult) && Boolean(run.state.packagePath && fs.existsSync(run.state.packagePath) && run.state.packageSha256);
      const expired = Boolean(run.state.retainUntil && new Date(run.state.retainUntil).getTime() <= at.getTime());
      if ((run.state.status === "exported" || run.state.status === "partial_exported") && expired && exportResultValid && !locks.has(run.state.stagingId)) { fs.rmSync(runDir, { recursive: true, force: true }); results.push({ stagingId: run.state.stagingId, removed: true, reason: "retention_expired" }); }
      else { appendStagingDiagnostic(runDir, "cleanup_complete", { stagingId: run.state.stagingId, classification: "retained" }); results.push({ stagingId: run.state.stagingId, removed: false, reason: exportResultValid ? "not_expired" : "export_not_verified" }); }
    } catch { results.push({ stagingId: name, removed: false, reason: "invalid_staging" }); }
  }
  return results;
}

export function stagingDebugIndex(run: StagingRun | null) {
  if (!run) return { stagingAvailable: false, recoverable: false, includedFiles: [], omittedFiles: [], omittedCount: 0, omittedSize: 0 };
  const p = paths(run.dir);
  const candidates = [p.state, p.checkpoint, p.index, p.exportResult, p.errors, diagnosticsPath(run.dir)];
  const includedFiles = candidates.filter(fs.existsSync).map((file) => relative(run.dir, file));
  const omitted = run.checkpoint.targets.filter((target) => target.rawFilePath && fs.existsSync(path.join(run.dir, target.rawFilePath))).map((target) => ({ file: target.rawFilePath, size: fs.statSync(path.join(run.dir, target.rawFilePath)).size, reason: "large_raw_payload_omitted" }));
  return { stagingAvailable: true, stagingId: run.state.stagingId, status: run.state.status, counts: { total: run.state.total, completed: run.state.completed, eligible: run.state.eligible, partial: run.state.partial, failed: run.state.failed, excluded: run.state.excluded, remaining: run.state.remaining }, lastCompletedKey: run.state.lastCompletedObjectKey, recoverable: mutableStatuses.has(run.state.status) && (run.state.status !== "partial_exported" || run.state.remaining > 0), sourceArchivePackage: run.state.packagePath ?? "not_finalized", finalPackagePath: run.state.packagePath, finalPackageHash: run.state.packageSha256, includedFiles, omittedFiles: omitted, omittedCount: omitted.length, omittedSize: omitted.reduce((sum, item) => sum + item.size, 0), omittedReason: "Raw target payloads are excluded from Debug Bundle by default." };
}

export function stagingPaths(run: StagingRun) { return paths(run.dir); }
