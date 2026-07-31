import fs from "node:fs";
import path from "node:path";
import { atomicWriteJsonStream, atomicWriteNdjsonStream, directorySize, hashFile, readSmallJson, resolveInside, safeIssueDirectoryName, validateGeneratedJsonFile, verifyFileReference, type FileReference } from "./fileBackedJson.js";
import { buildCurrentIssueSnapshot, normalizeCurrentIssueFields, type NormalizedCurrentField } from "./normalizedCurrentFields.js";
import { hasSensitiveData } from "./sourceArchiveExporter.js";
import { createStreamingZip, verifyStreamingZip, type StreamingZipEntry } from "./streamingZip.js";
import { aggregateFullFetchStatus, canonicalIssueStatus, reconcileFullFetchCounts, type FullFetchReconciliationInput } from "./fullFetchStatus.js";

export const FULL_FETCH_STAGING_SCHEMA = "full_fetch_staging_v4";
export const FULL_FETCH_INDEX_SCHEMA = "full_fetch_run_index_v4";
export const FULL_FETCH_COMPLETENESS_POLICY = "full_fetch_completeness_v5";
export const RETENTION_DAYS = 7;
export const CANCELLED_RETENTION_DAYS = 30;

export type PackagedBuildIdentity = {
  appVersion: string;
  packagedSourceCommit: string;
  buildTime: string;
};

let activeBuildIdentity: PackagedBuildIdentity = {
  appVersion: "development",
  packagedSourceCommit: "unknown",
  buildTime: "Development Mode"
};

export function configureFullFetchBuildIdentity(identity: PackagedBuildIdentity) {
  activeBuildIdentity = { ...identity };
}

function runBuildIdentity(run: StagingRun) {
  return run.state.runContext.buildInfo ?? activeBuildIdentity;
}

export type StagingStatus = "created" | "running" | "completed" | "completed_with_partial" | "completed_with_errors" | "failed" | "cancelled" | "failed_final" | "aborted_on_restart" | "discarded" | "legacy_incomplete";
export type TargetStatus = "pending" | "in_progress" | "eligible" | "partial" | "required_partial" | "failed_issue" | "failed_final" | "not_attempted_due_to_run_failure" | "excluded";
type LegacyTargetStatus = "interrupted" | "partial" | "failed_retryable" | "failed_non_retryable" | "failed_after_resume_retry";
export type OptionalEndpointState = "available" | "unsupported" | "permission_denied" | "temporarily_unavailable" | "not_attempted";

export type OptionalEndpointStatus = { enabled: boolean; status: OptionalEndpointState; archiveBlocking: false; retryable: false; warning: string | null; httpStatus: number | "-" | null; errorCode: string; attemptCount: number; fetchedAt: string | null };
export type FullFetchRunContext = {
  fullFetchRunId: string;
  stagingId: string;
  selectedUser: string;
  projectScope: string;
  dateRange: { start: string; end: string };
  jql: string;
  selectedIssues: string[];
  fetchQueue: Array<{ key: string; source: string; matchedReason: string }>;
  directIssueKeys: string[];
  relatedIssuesStatus: string;
  fetchRemoteLinks: boolean;
  queueSnapshot: {
    schemaVersion: string;
    confirmedAt: string;
    queueTotal: number;
    eligibleCount: number;
    excludedCount: number;
    invalidCount: number;
    plannedCount: number;
    originalQueueOrder: readonly string[];
    items: ReadonlyArray<Readonly<Record<string, unknown>>>;
  };
  sourceProvenance: {
    sourceSystem: "jira";
    serverIdentity: string;
    baseUrlNormalized: string;
    serverTitle: string;
    serverTitleStatus?: "verified" | "unverified";
    connectionLabel?: string;
  };
  completenessPolicyVersion: string;
  buildInfo?: PackagedBuildIdentity;
};
export type Step5ActionRecord = {
  action: "full_fetch_result_saved" | "source_archive_exported" | "debug_bundle_generated";
  timestamp: string; runId: string; outputPath: string; fileSize: number; sha256: string; issueCount: number; eligibleCount: number;
  result: "completed" | "completed_with_errors" | "failed"; error: string; generatedAutomatically?: boolean;
};
export type CoverageCategory = {
  category: string;
  requested: boolean;
  attempted: boolean;
  collected: boolean;
  pageCount: number;
  recordCount: number;
  status: "complete" | "partial" | "failed" | "not_collected" | "metadata_only" | "permission_limited" | "unsupported";
  fileRef: FileReference | null;
  errorSummary: string;
  fetchedAt: string | null;
  attemptCount: number;
  httpStatus: number | "-" | null;
};
export type StagingTarget = {
  index: number;
  objectKey: string;
  candidate: { key: string; source: string; matchedReason: string };
  status: TargetStatus | LegacyTargetStatus;
  attemptCount: number;
  lastError: string;
  errorType: string;
  classification: string;
  issueManifestRef: FileReference | null;
  currentIssueSnapshotRef: FileReference | null;
  snapshotFetchedAt: string;
  normalizedCurrentFieldsRef: FileReference | null;
  normalizedCurrentFields: NormalizedCurrentField[];
  canonicalFiles: Record<string, FileReference>;
  coverage: CoverageCategory[];
  optionalWarnings: string[];
  optionalEndpointStatus: Record<string, OptionalEndpointStatus>;
  partialReasons: Array<Record<string, unknown>>;
  sizeBytes: number;
  updatedAt: string;
};
export type StagingIndex = { schemaVersion: string; stagingId: string; originalQueueOrder: string[]; targets: StagingTarget[]; updatedAt: string };
export type RunError = { code: string; stage: string; name: string; message: string; stackSummary: string; failedAt: string };
export type ArchiveVerification = {
  eligibleCount: number; entryCount: number; expectedSizeBytes: number; verifiedSizeBytes: number; hashMatchedCount: number;
  zipReopenVerified: boolean; requiredEntriesReadable: boolean; manifestConsistent: boolean; safeForAutomaticImport: boolean;
};
export type StagingState = {
  schemaVersion: string; stagingId: string; fullFetchRunId: string; status: StagingStatus; selectedUser: string; runContext: FullFetchRunContext;
  createdAt: string; startedAt: string | null; finishedAt: string | null; failureTime: string | null; updatedAt: string;
  total: number; completed: number; apiSuccess: number; eligible: number; archiveEligible: number; partial: number; requiredPartial: number;
  optionalWarning: number; failed: number; failedFinal: number; excluded: number; notAttempted: number; remaining: number;
  lastCompletedObjectKey: string; faultingObjectKey: string; runError: RunError | null; stagingSizeBytes: number;
  packagePath: string | null; packageSha256: string | null; exportVerification: ArchiveVerification | null; safeToCleanup: boolean;
  cancelledAt: string | null; successfulExportAt: string | null; lastExportAttemptAt: string | null; exportError: RunError | null;
  legacyReadOnly: boolean; legacyMessage: string;
  countReconciliation: ReturnType<typeof reconcileFullFetchCounts>;
  countReconciliationPassed: boolean;
  workflowState: { relatedDiscovery: "not_started" | "completed"; relatedReview: "not_started" | "completed" | "skipped"; relatedFullFetch: "not_started" | "running" | "completed" | "skipped" };
  step5History: Step5ActionRecord[];
};
export type StagingRun = { dir: string; state: StagingState; index: StagingIndex };
export type TargetOutcome = {
  status: "eligible" | "partial" | "required_partial" | "failed" | "excluded";
  rawEnvelope?: Record<string, unknown>; missingSections?: string[]; failedEndpoints?: string[];
  optionalEndpointStatus?: Record<string, OptionalEndpointStatus>; optionalWarnings?: string[]; classification?: string;
  partialReasons?: Array<Record<string, unknown>>;
  errorType?: string; errorMessage?: string;
};

const terminalRunStatuses = new Set<StagingStatus>(["completed", "completed_with_partial", "completed_with_errors", "failed", "cancelled", "failed_final", "aborted_on_restart", "discarded", "legacy_incomplete"]);
const terminalTargetStatuses = new Set<TargetStatus | LegacyTargetStatus>(["eligible", "partial", "required_partial", "failed_issue", "failed_final", "not_attempted_due_to_run_failure", "excluded", "failed_non_retryable", "failed_after_resume_retry"]);
const mutationLocks = new Set<string>();

function now() { return new Date().toISOString(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function cleanText(value: unknown, max = 2000) { return String(value ?? "").replace(/authorization\s*[:=]\s*[^\r\n]+/gi, "Authorization: [masked]").replace(/(token|password|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1: [masked]").slice(0, max); }
function relative(runDir: string, filePath: string) { return path.relative(runDir, filePath).replace(/\\/g, "/"); }
function paths(runDir: string) {
  return { state: path.join(runDir, "manifest.json"), index: path.join(runDir, "run-index.json"), result: path.join(runDir, "full-fetch-result.json"), errors: path.join(runDir, "run-errors.json"), issueErrors: path.join(runDir, "issue-errors.ndjson"), diagnostics: path.join(runDir, "staging-diagnostics.ndjson"), exportResult: path.join(runDir, "export-result.json") };
}
function atomicSmallJson(filePath: string, value: unknown, runDir = path.dirname(filePath)) { return atomicWriteJsonStream(filePath, value, relative(runDir, filePath)); }
function appendDiagnostic(runDir: string, value: unknown) {
  const filePath = paths(runDir).diagnostics;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}
function appendNdjson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}
export function appendStagingDiagnostic(runDir: string, stage: string, fields: Record<string, unknown> = {}) { appendDiagnostic(runDir, { time: now(), stage, ...fields, errorMessage: fields.errorMessage ? cleanText(fields.errorMessage) : undefined }); }

function lightweightCandidate(candidate: Record<string, unknown>, index: number) {
  const metadata = record(candidate.queueMetadata);
  const sources = Array.isArray(metadata.sources) ? metadata.sources.map(String) : [];
  return { key: safeIssueDirectoryName(String(candidate.key ?? `UNKNOWN-${index + 1}`)), source: cleanText(sources[0] ?? candidate.source ?? "manual", 120), matchedReason: cleanText(metadata.matchedReason ?? candidate.matchedReason, 240) };
}
function defaultRunContext(selectedUser: string, queue: Array<{ key: string; source: string; matchedReason: string }>): FullFetchRunContext {
  return { fullFetchRunId: "", stagingId: "", selectedUser: cleanText(selectedUser, 240), projectScope: "", dateRange: { start: "", end: "" }, jql: "", selectedIssues: queue.map((item) => item.key), fetchQueue: queue, directIssueKeys: [], relatedIssuesStatus: "not_started", fetchRemoteLinks: false, queueSnapshot: { schemaVersion: "full_fetch_queue_snapshot_v1", confirmedAt: "", queueTotal: queue.length, eligibleCount: queue.length, excludedCount: 0, invalidCount: 0, plannedCount: queue.length, originalQueueOrder: queue.map((item) => item.key), items: [] }, sourceProvenance: { sourceSystem: "jira", serverIdentity: "", baseUrlNormalized: "", serverTitle: "", serverTitleStatus: "unverified", connectionLabel: "" }, completenessPolicyVersion: FULL_FETCH_COMPLETENESS_POLICY };
}

export function deriveState(state: StagingState, index: StagingIndex): StagingState {
  const count = (...statuses: Array<TargetStatus | LegacyTargetStatus>) => index.targets.filter((target) => statuses.includes(target.status)).length;
  const eligible = count("eligible");
  const requiredPartial = count("partial", "required_partial");
  const failedIssue = count("failed_issue", "failed_non_retryable", "failed_after_resume_retry");
  const failedFinal = count("failed_final");
  const notAttempted = count("not_attempted_due_to_run_failure");
  const excluded = count("excluded");
  const completed = index.targets.filter((target) => terminalTargetStatuses.has(target.status)).length;
  const optionalWarning = index.targets.filter((target) => target.optionalWarnings.length > 0 || Object.values(target.optionalEndpointStatus).some((entry) => Boolean(entry?.warning))).length;
  const snapshot = state.runContext.queueSnapshot;
  const reconciliationInput: FullFetchReconciliationInput = {
    queueTotal: Number(snapshot?.queueTotal ?? index.targets.length),
    eligible: Number(snapshot?.eligibleCount ?? index.targets.length),
    excluded: Number(snapshot?.excludedCount ?? 0),
    invalid: Number(snapshot?.invalidCount ?? 0),
    planned: index.targets.length,
    attempted: eligible + requiredPartial + failedIssue + failedFinal,
    completed: eligible,
    partial: requiredPartial,
    failed: failedIssue + failedFinal,
    notAttempted
  };
  const countReconciliation = reconcileFullFetchCounts(reconciliationInput);
  return { ...state, updatedAt: now(), total: index.targets.length, completed, apiSuccess: eligible + requiredPartial, eligible, archiveEligible: countReconciliation.countReconciliationPassed ? eligible : 0, partial: requiredPartial, requiredPartial, optionalWarning, failed: failedIssue + failedFinal, failedFinal, excluded, notAttempted, remaining: Math.max(0, index.targets.length - completed), stagingSizeBytes: state.stagingSizeBytes, countReconciliation, countReconciliationPassed: countReconciliation.countReconciliationPassed };
}

function resultDocument(run: StagingRun) {
  return {
    schemaVersion: "full_fetch_result_index_v5", ...runBuildIdentity(run), runId: run.state.fullFetchRunId, stagingId: run.state.stagingId,
    status: run.state.status, createdAt: run.state.createdAt, startedAt: run.state.startedAt, finishedAt: run.state.finishedAt, failureTime: run.state.failureTime,
    lastCompletedIssue: run.state.lastCompletedObjectKey, faultingIssue: run.state.faultingObjectKey, runError: run.state.runError,
    counts: { total: run.state.total, completed: run.state.completed, eligible: run.state.eligible, partial: run.state.requiredPartial, failed: run.state.failed, notAttempted: run.state.notAttempted, excluded: run.state.excluded },
    queueSnapshot: run.state.runContext.queueSnapshot,
    countReconciliation: run.state.countReconciliation,
    stagingSizeBytes: directorySize(run.dir), archiveEligible: run.state.status === "completed" && run.state.countReconciliationPassed && run.state.requiredPartial === 0 && run.state.failed === 0 && run.state.notAttempted === 0,
    issues: run.index.targets.map((target) => ({ issueKey: target.objectKey, status: canonicalIssueStatus(target.status) ?? target.status, originalStatus: target.status, classification: target.classification, errorCode: target.errorType, errorMessage: target.lastError, partialReasons: target.partialReasons, sizeBytes: target.sizeBytes, snapshotFetchedAt: target.snapshotFetchedAt, normalizedCurrentFields: target.normalizedCurrentFields, currentIssueSnapshotRef: target.currentIssueSnapshotRef, normalizedCurrentFieldsRef: target.normalizedCurrentFieldsRef, issueManifestRef: target.issueManifestRef, canonicalFiles: target.canonicalFiles, coverage: target.coverage }))
  };
}

function persist(run: StagingRun) {
  run.index.updatedAt = now();
  run.state = deriveState({ ...run.state, stagingSizeBytes: directorySize(run.dir) }, run.index);
  atomicSmallJson(paths(run.dir).index, run.index, run.dir);
  atomicSmallJson(paths(run.dir).state, run.state, run.dir);
  atomicSmallJson(paths(run.dir).result, resultDocument(run), run.dir);
}
function assertMutable(run: StagingRun) {
  if (run.state.legacyReadOnly) throw new Error("Legacy Full Fetch staging is read-only. Resume is no longer supported.");
  if (mutationLocks.has(run.state.stagingId)) throw new Error("A Full Fetch staging mutation is already active.");
}

export function createStagingRun(rootDir: string, input: { runId: string; selectedUser: string; queue: Record<string, unknown>[]; createdAt?: string; runContext?: Partial<FullFetchRunContext> }): StagingRun {
  const createdAt = input.createdAt ?? now();
  const queue = input.queue.map(lightweightCandidate);
  const stagingId = `FFS-${input.runId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}`;
  const runDir = path.join(path.resolve(rootDir), stagingId);
  if (path.dirname(runDir) !== path.resolve(rootDir) || fs.existsSync(runDir)) throw new Error(`Staging already exists or is invalid: ${stagingId}`);
  fs.mkdirSync(path.join(runDir, "issues"), { recursive: true });
  const targets: StagingTarget[] = queue.map((candidate, index) => ({ index, objectKey: candidate.key, candidate, status: "pending", attemptCount: 0, lastError: "", errorType: "", classification: "", issueManifestRef: null, currentIssueSnapshotRef: null, snapshotFetchedAt: "", normalizedCurrentFieldsRef: null, normalizedCurrentFields: [], canonicalFiles: {}, coverage: [], optionalWarnings: [], optionalEndpointStatus: {}, partialReasons: [], sizeBytes: 0, updatedAt: createdAt }));
  if (new Set(targets.map((target) => target.objectKey)).size !== targets.length) throw new Error("Full Fetch queue contains duplicate issue keys.");
  const index: StagingIndex = { schemaVersion: FULL_FETCH_INDEX_SCHEMA, stagingId, originalQueueOrder: targets.map((target) => target.objectKey), targets, updatedAt: createdAt };
  const context = { ...defaultRunContext(input.selectedUser, queue), ...input.runContext, fullFetchRunId: input.runId, stagingId, selectedUser: cleanText(input.runContext?.selectedUser ?? input.selectedUser, 240), fetchQueue: queue, selectedIssues: queue.map((item) => item.key), fetchRemoteLinks: input.runContext?.fetchRemoteLinks === true, completenessPolicyVersion: FULL_FETCH_COMPLETENESS_POLICY, buildInfo: input.runContext?.buildInfo ?? activeBuildIdentity } as FullFetchRunContext;
  const initialReconciliation = reconcileFullFetchCounts({ queueTotal: context.queueSnapshot.queueTotal, eligible: context.queueSnapshot.eligibleCount, excluded: context.queueSnapshot.excludedCount, invalid: context.queueSnapshot.invalidCount, planned: targets.length, attempted: 0, completed: 0, partial: 0, failed: 0, notAttempted: targets.length });
  const state: StagingState = { schemaVersion: FULL_FETCH_STAGING_SCHEMA, stagingId, fullFetchRunId: input.runId, status: targets.length ? "created" : "completed", selectedUser: context.selectedUser, runContext: context, createdAt, startedAt: null, finishedAt: targets.length ? null : createdAt, failureTime: null, updatedAt: createdAt, total: targets.length, completed: 0, apiSuccess: 0, eligible: 0, archiveEligible: 0, partial: 0, requiredPartial: 0, optionalWarning: 0, failed: 0, failedFinal: 0, excluded: 0, notAttempted: 0, remaining: targets.length, lastCompletedObjectKey: "", faultingObjectKey: "", runError: null, stagingSizeBytes: 0, packagePath: null, packageSha256: null, exportVerification: null, safeToCleanup: false, cancelledAt: null, successfulExportAt: null, lastExportAttemptAt: null, exportError: null, legacyReadOnly: false, legacyMessage: "", countReconciliation: initialReconciliation, countReconciliationPassed: initialReconciliation.countReconciliationPassed, workflowState: { relatedDiscovery: "not_started", relatedReview: "not_started", relatedFullFetch: "not_started" }, step5History: [] };
  const run = { dir: runDir, state: { ...state, cancelledAt: state.cancelledAt ?? null, successfulExportAt: state.successfulExportAt ?? null, lastExportAttemptAt: state.lastExportAttemptAt ?? null, exportError: state.exportError ?? null }, index };
  persist(run); appendStagingDiagnostic(runDir, "staging_create", { stagingId, runId: input.runId, total: targets.length, rootDir: path.resolve(rootDir) });
  return run;
}

function loadLegacyRun(runDir: string): StagingRun {
  const legacyState = readSmallJson<Record<string, unknown>>(path.join(runDir, "staging-state.json"));
  const legacyIndex = readSmallJson<Record<string, unknown>>(path.join(runDir, "queue-checkpoint.json"));
  const legacyTargets = Array.isArray(legacyIndex.targets) ? legacyIndex.targets.map(record) : [];
  const createdAt = String(legacyState.createdAt ?? now());
  const stagingId = String(legacyState.stagingId ?? path.basename(runDir));
  const targets: StagingTarget[] = legacyTargets.map((target, index) => ({ index, objectKey: String(target.objectKey ?? `LEGACY-${index + 1}`), candidate: { key: String(target.objectKey ?? ""), source: "legacy_v0.2.29", matchedReason: "legacy_read_only" }, status: String(target.status ?? "interrupted") as LegacyTargetStatus, attemptCount: Number(target.attemptCount ?? 0), lastError: cleanText(target.lastError), errorType: cleanText(target.errorType), classification: "legacy_read_only", issueManifestRef: null, currentIssueSnapshotRef: null, snapshotFetchedAt: "", normalizedCurrentFieldsRef: null, normalizedCurrentFields: [], canonicalFiles: {}, coverage: [], optionalWarnings: [], optionalEndpointStatus: {}, partialReasons: [], sizeBytes: 0, updatedAt: String(target.updatedAt ?? createdAt) }));
  const queue = targets.map((target) => target.candidate);
  const countReconciliation = reconcileFullFetchCounts({ queueTotal: targets.length, eligible: targets.length, excluded: 0, invalid: 0, planned: targets.length, attempted: 0, completed: 0, partial: 0, failed: 0, notAttempted: targets.length });
  const state: StagingState = { schemaVersion: "legacy_v0.2.29_read_only", stagingId, fullFetchRunId: String(legacyState.fullFetchRunId ?? ""), status: "legacy_incomplete", selectedUser: String(legacyState.selectedUser ?? ""), runContext: defaultRunContext(String(legacyState.selectedUser ?? ""), queue), createdAt, startedAt: String(legacyState.startedAt ?? "") || null, finishedAt: null, failureTime: String(legacyState.updatedAt ?? createdAt), updatedAt: String(legacyState.updatedAt ?? createdAt), total: targets.length, completed: 0, apiSuccess: 0, eligible: 0, archiveEligible: 0, partial: 0, requiredPartial: 0, optionalWarning: 0, failed: 0, failedFinal: 0, excluded: 0, notAttempted: 0, remaining: targets.length, lastCompletedObjectKey: String(legacyState.lastCompletedObjectKey ?? ""), faultingObjectKey: "", runError: { code: "legacy_incomplete", stage: "legacy_adapter", name: "LegacyIncompleteRun", message: "Legacy incomplete Full Fetch result. Resume is no longer supported.", stackSummary: "", failedAt: String(legacyState.updatedAt ?? createdAt) }, stagingSizeBytes: directorySize(runDir), packagePath: null, packageSha256: null, exportVerification: null, safeToCleanup: false, cancelledAt: null, successfulExportAt: null, lastExportAttemptAt: null, exportError: null, legacyReadOnly: true, legacyMessage: "Legacy incomplete Full Fetch result. Resume is no longer supported.", countReconciliation, countReconciliationPassed: countReconciliation.countReconciliationPassed, workflowState: { relatedDiscovery: "not_started", relatedReview: "not_started", relatedFullFetch: "not_started" }, step5History: [] };
  const run = { dir: runDir, state, index: { schemaVersion: "legacy_v0.2.29_read_only", stagingId, originalQueueOrder: targets.map((target) => target.objectKey), targets, updatedAt: state.updatedAt } };
  run.state = deriveState(run.state, run.index); return run;
}

export function loadStagingRun(runDir: string): StagingRun {
  const statePath = paths(runDir).state;
  if (!fs.existsSync(statePath)) return loadLegacyRun(runDir);
  const state = readSmallJson<StagingState>(statePath);
  const index = readSmallJson<StagingIndex>(paths(runDir).index);
  if (state.stagingId !== index.stagingId) throw new Error("Unsupported or inconsistent Full Fetch staging schema.");
  const currentSchema = state.schemaVersion === FULL_FETCH_STAGING_SCHEMA && index.schemaVersion === FULL_FETCH_INDEX_SCHEMA;
  const v0230Schema = state.schemaVersion === "full_fetch_staging_v2" && index.schemaVersion === "full_fetch_run_index_v2";
  const v0231Schema = state.schemaVersion === "full_fetch_staging_v3" && index.schemaVersion === "full_fetch_run_index_v3";
  if (!currentSchema && !v0230Schema && !v0231Schema) throw new Error("Unsupported or inconsistent Full Fetch staging schema.");
  const legacyReadOnly = v0230Schema || v0231Schema || state.legacyReadOnly === true;
  const defaultContext = defaultRunContext(state.selectedUser, index.targets.map((target) => target.candidate));
  const compatibleIndex = { ...index, targets: index.targets.map((target) => ({ ...target, partialReasons: Array.isArray(target.partialReasons) ? target.partialReasons : [] })) };
  const compatibleState = {
    ...state,
    runContext: { ...defaultContext, ...state.runContext, queueSnapshot: state.runContext?.queueSnapshot ?? defaultContext.queueSnapshot },
    cancelledAt: state.cancelledAt ?? null,
    successfulExportAt: state.successfulExportAt ?? null,
    lastExportAttemptAt: state.lastExportAttemptAt ?? null,
    exportError: state.exportError ?? null,
    legacyReadOnly,
    legacyMessage: v0230Schema ? "v0.2.30 Full Fetch staging is readable in compatibility mode and will not be mutated." : v0231Schema ? "v0.2.31 Full Fetch staging is readable in compatibility mode and will not be mutated." : state.legacyMessage ?? ""
  };
  const run = { dir: runDir, state: compatibleState, index: compatibleIndex };
  run.state = deriveState({ ...compatibleState, stagingSizeBytes: directorySize(runDir) }, compatibleIndex);
  return run;
}

export function setStagingStatus(run: StagingRun, status: StagingStatus) {
  assertMutable(run);
  if (terminalRunStatuses.has(run.state.status) && status === "running") throw new Error("Terminal Full Fetch runs cannot transition back to running.");
  run.state.status = status;
  if (status === "running") run.state.startedAt ??= now();
  if (terminalRunStatuses.has(status)) run.state.finishedAt ??= now();
  persist(run); return run;
}
export function updateStagingWorkflow(run: StagingRun, update: Partial<StagingState["workflowState"]>) { assertMutable(run); run.state.workflowState = { ...run.state.workflowState, ...update }; persist(run); return run.state.workflowState; }
export function recordStep5Action(run: StagingRun, action: Step5ActionRecord) { if (run.state.legacyReadOnly) return action; run.state.step5History = [...run.state.step5History, { ...action, outputPath: cleanText(action.outputPath), error: cleanText(action.error) }].slice(-100); persist(run); return action; }

export function startTarget(run: StagingRun, objectKey: string) {
  assertMutable(run);
  if (terminalRunStatuses.has(run.state.status)) throw new Error("Cannot start an issue in a terminal Full Fetch run.");
  const key = safeIssueDirectoryName(objectKey);
  const target = run.index.targets.find((item) => item.objectKey === key);
  if (!target || target.status !== "pending") throw new Error(`Full Fetch issue is not pending: ${key}`);
  target.status = "in_progress"; target.attemptCount += 1; target.updatedAt = now();
  persist(run); appendStagingDiagnostic(run.dir, "target_start", { objectKey: key, attemptCount: target.attemptCount }); return target;
}

function endpointInfo(envelope: Record<string, unknown>, fragment: string) {
  const item = (Array.isArray(envelope.endpointMetadata) ? envelope.endpointMetadata : []).map(record).find((entry) => String(entry.endpoint ?? "").includes(fragment));
  return { fetchedAt: item ? String(item.fetchedAt ?? record(envelope.requestMetadata).fetchedAt ?? "") || null : null, attemptCount: Number(item?.attempts ?? 0), httpStatus: (typeof item?.status === "number" || item?.status === "-") ? item.status as number | "-" : null };
}
function fileCoverage(category: string, requested: boolean, attempted: boolean, status: CoverageCategory["status"], fileRef: FileReference | null, errorSummary = "", metadata: Partial<Pick<CoverageCategory, "fetchedAt" | "attemptCount" | "httpStatus" | "pageCount">> = {}): CoverageCategory {
  return { category, requested, attempted, collected: Boolean(fileRef && status !== "failed"), pageCount: metadata.pageCount ?? (attempted ? 1 : 0), recordCount: fileRef?.recordCount ?? 0, status, fileRef, errorSummary: cleanText(errorSummary), fetchedAt: metadata.fetchedAt ?? null, attemptCount: metadata.attemptCount ?? 0, httpStatus: metadata.httpStatus ?? null };
}
function verifyCanonicalFiles(run: StagingRun, files: Record<string, FileReference>) {
  const failures: string[] = [];
  for (const [section, reference] of Object.entries(files)) {
    const verified = verifyFileReference(run.dir, reference);
    if (!verified.ok) { failures.push(`${section}:${verified.errorCode}`); continue; }
    if (!validateGeneratedJsonFile(verified.filePath, reference.path.endsWith(".ndjson"))) failures.push(`${section}:canonical_json_unreadable`);
  }
  return failures;
}

function paginationVerified(value: Record<string, unknown>) {
  const reportedTotal = typeof value.reportedTotal === "number" ? value.reportedTotal : NaN;
  const fetchedCount = Number(value.fetchedCount);
  const duplicateCount = Number(value.duplicateCount);
  return value.paginationComplete === true
    && Number.isInteger(reportedTotal)
    && reportedTotal >= 0
    && fetchedCount === reportedTotal
    && duplicateCount === 0;
}

export function completeTarget(run: StagingRun, objectKey: string, outcome: TargetOutcome) {
  assertMutable(run);
  const key = safeIssueDirectoryName(objectKey);
  const target = run.index.targets.find((item) => item.objectKey === key);
  if (!target || target.status !== "in_progress") throw new Error(`Full Fetch issue is not in progress: ${key}`);
  const completedAt = now();
  target.optionalEndpointStatus = outcome.optionalEndpointStatus ?? {};
  target.optionalWarnings = Array.from(new Set([...(outcome.optionalWarnings ?? []), ...Object.values(target.optionalEndpointStatus).flatMap((entry) => entry?.warning ? [entry.warning] : [])].map((item) => cleanText(item)).filter(Boolean)));
  target.partialReasons = Array.isArray(outcome.partialReasons) ? outcome.partialReasons.map((item) => ({ ...item })) : [];
  if (outcome.status === "failed") {
    target.status = "failed_final"; target.errorType = cleanText(outcome.errorType || "issue_fetch_failed"); target.lastError = cleanText(outcome.errorMessage); target.classification = cleanText(outcome.classification || "issue_scoped_failure"); target.updatedAt = completedAt;
    appendNdjson(paths(run.dir).issueErrors, { time: completedAt, issueKey: key, status: target.status, errorCode: target.errorType, message: target.lastError });
    run.state.lastCompletedObjectKey = key; persist(run); return target;
  }
  if (outcome.status === "excluded") { target.status = "excluded"; target.updatedAt = completedAt; run.state.lastCompletedObjectKey = key; persist(run); return target; }
  const envelope = record(outcome.rawEnvelope);
  const issueResponse = envelope.issue;
  if (!issueResponse || hasSensitiveData(issueResponse)) throw new Error(`Current Issue Snapshot rejected for ${key}.`);
  const issueDir = path.join(run.dir, "issues", key);
  fs.mkdirSync(issueDir, { recursive: true });
  const reference = (name: string) => relative(run.dir, path.join(issueDir, name));
  const snapshot = buildCurrentIssueSnapshot(issueResponse, String(record(envelope.requestMetadata).fetchedAt ?? completedAt));
  if (String(snapshot.key).toUpperCase() !== key) throw new Error(`Current Issue Snapshot identity mismatch for ${key}.`);
  const normalized = normalizeCurrentIssueFields(snapshot);
  const canonicalFiles: Record<string, FileReference> = {};
  canonicalFiles.currentIssueSnapshot = atomicWriteJsonStream(path.join(issueDir, "current-issue-snapshot.json"), snapshot, reference("current-issue-snapshot.json"));
  canonicalFiles.normalizedCurrentFields = atomicWriteJsonStream(path.join(issueDir, "normalized-current-fields.json"), normalized, reference("normalized-current-fields.json"));
  canonicalFiles.changelog = atomicWriteNdjsonStream(path.join(issueDir, "changelog.ndjson"), Array.isArray(envelope.changelogHistories) ? envelope.changelogHistories : [], reference("changelog.ndjson"));
  canonicalFiles.comments = atomicWriteNdjsonStream(path.join(issueDir, "comments.ndjson"), Array.isArray(envelope.comments) ? envelope.comments : [], reference("comments.ndjson"));
  canonicalFiles.worklogs = atomicWriteNdjsonStream(path.join(issueDir, "worklogs.ndjson"), Array.isArray(envelope.worklogs) ? envelope.worklogs : [], reference("worklogs.ndjson"));
  canonicalFiles.attachments = atomicWriteJsonStream(path.join(issueDir, "attachments.json"), Array.isArray(envelope.attachments) ? envelope.attachments : [], reference("attachments.json"), Array.isArray(envelope.attachments) ? envelope.attachments.length : 0);
  canonicalFiles.users = atomicWriteJsonStream(path.join(issueDir, "users.json"), Array.isArray(envelope.parsedUsers) ? envelope.parsedUsers : [], reference("users.json"), Array.isArray(envelope.parsedUsers) ? envelope.parsedUsers.length : 0);
  canonicalFiles.evidence = atomicWriteNdjsonStream(path.join(issueDir, "evidence.ndjson"), Array.isArray(envelope.evidenceEvents) ? envelope.evidenceEvents : [], reference("evidence.ndjson"));
  canonicalFiles.issueLinks = atomicWriteJsonStream(path.join(issueDir, "issue-links.json"), Array.isArray(envelope.issueLinks) ? envelope.issueLinks : [], reference("issue-links.json"), Array.isArray(envelope.issueLinks) ? envelope.issueLinks.length : 0);
  const remoteStatus = target.optionalEndpointStatus.remoteLinks;
  const remoteRecords = remoteStatus?.status === "available" && Array.isArray(envelope.remoteLinks) ? envelope.remoteLinks : null;
  canonicalFiles.remoteLinks = atomicWriteJsonStream(path.join(issueDir, "remote-links.json"), { sectionStatus: remoteStatus ?? null, records: remoteRecords }, reference("remote-links.json"), remoteRecords?.length ?? 0);
  canonicalFiles.requestMetadata = atomicWriteJsonStream(path.join(issueDir, "request-metadata.json"), { requestMetadata: record(envelope.requestMetadata), paginationMetadata: record(envelope.paginationMetadata), endpointMetadata: Array.isArray(envelope.endpointMetadata) ? envelope.endpointMetadata : [], completenessMetadata: record(envelope.completenessMetadata), optionalEndpointStatus: target.optionalEndpointStatus }, reference("request-metadata.json"));
  const pagination = record(envelope.paginationMetadata);
  const changelogPagination = record(pagination.changelog);
  const commentsPagination = record(pagination.comments);
  const worklogsPagination = record(pagination.worklogs);
  const worklogCompleteness = record(envelope.worklogCompleteness);
  const changelogPaginationComplete = paginationVerified(changelogPagination);
  const commentsPaginationComplete = paginationVerified(commentsPagination);
  const worklogsPaginationComplete = paginationVerified(worklogsPagination) && worklogCompleteness.status === "complete" && Number(worklogCompleteness.parseErrorCount ?? 0) === 0;
  const validationFailures: string[] = [];
  if (!snapshot.id || String(snapshot.key).toUpperCase() !== key) validationFailures.push("issue_identity_mismatch");
  if (snapshot.sectionStatus.fields !== "returned") validationFailures.push("full_fields_not_returned");
  if (!changelogPaginationComplete) validationFailures.push("changelog_pagination_incomplete");
  if (!commentsPaginationComplete) validationFailures.push("comments_pagination_incomplete");
  if (!worklogsPaginationComplete) validationFailures.push(`worklogs_${String(worklogCompleteness.status ?? "incomplete")}`);
  validationFailures.push(...verifyCanonicalFiles(run, canonicalFiles));
  const missing = Array.from(new Set([...(outcome.missingSections ?? []), ...validationFailures]));
  const finalStatus: TargetStatus = outcome.status === "partial" || outcome.status === "required_partial" || missing.length > 0 ? "partial" : "eligible";
  const issueEndpoint = endpointInfo(envelope, `/issue/${key}`);
  const changelogEndpoint = issueEndpoint;
  const commentsEndpoint = endpointInfo(envelope, "/comment");
  const worklogsEndpoint = endpointInfo(envelope, "/worklog");
  const fetchedAt = String(record(envelope.requestMetadata).fetchedAt ?? completedAt);
  const coverage = [
    fileCoverage("current_issue_snapshot", true, true, validationFailures.some((item) => item.includes("identity") || item.includes("fields") || item.startsWith("currentIssueSnapshot:")) ? "failed" : "complete", canonicalFiles.currentIssueSnapshot, "", { ...issueEndpoint, fetchedAt }),
    fileCoverage("normalized_current_fields", true, true, "complete", canonicalFiles.normalizedCurrentFields, "", { ...issueEndpoint, fetchedAt }),
    fileCoverage("changelog", true, true, changelogPaginationComplete ? "complete" : "partial", canonicalFiles.changelog, changelogPaginationComplete ? "" : "Changelog pagination incomplete", { ...changelogEndpoint, fetchedAt, pageCount: Number(changelogPagination.pageCount ?? 0) }),
    fileCoverage("comments", true, true, commentsPaginationComplete ? "complete" : "partial", canonicalFiles.comments, commentsPaginationComplete ? "" : "Comments pagination incomplete", { ...commentsEndpoint, fetchedAt, pageCount: Number(commentsPagination.pageCount ?? 0) }),
    fileCoverage("worklogs", true, true, worklogsPaginationComplete ? "complete" : worklogCompleteness.status === "permission_restricted" ? "permission_limited" : worklogCompleteness.status === "unsupported" ? "unsupported" : "partial", canonicalFiles.worklogs, worklogsPaginationComplete ? "" : String(worklogCompleteness.fetchError ?? worklogCompleteness.status ?? "Worklogs incomplete"), { ...worklogsEndpoint, fetchedAt, pageCount: Number(worklogsPagination.pageCount ?? 0) }),
    fileCoverage("attachments", true, true, "metadata_only", canonicalFiles.attachments, "", { ...issueEndpoint, fetchedAt }),
    fileCoverage("users", true, true, "complete", canonicalFiles.users, "", { ...issueEndpoint, fetchedAt }),
    fileCoverage("evidence", true, true, "complete", canonicalFiles.evidence, "", { ...issueEndpoint, fetchedAt }),
    fileCoverage("issue_links", true, true, "complete", canonicalFiles.issueLinks, "", { ...issueEndpoint, fetchedAt }),
    fileCoverage("remote_links", remoteStatus?.enabled === true, remoteStatus?.status !== "not_attempted", remoteStatus?.status === "available" ? "complete" : "not_collected", canonicalFiles.remoteLinks, remoteStatus?.warning ?? "", { fetchedAt: remoteStatus?.fetchedAt ?? null, attemptCount: remoteStatus?.attemptCount ?? 0, httpStatus: remoteStatus?.httpStatus ?? null })
  ];
  const issueManifest = { schemaVersion: "full_fetch_issue_manifest_v4", ...runBuildIdentity(run), runId: run.state.fullFetchRunId, stagingId: run.state.stagingId, issueId: snapshot.id, issueKey: key, status: finalStatus, fetchedAt: snapshot.fetchedAt, committedAt: completedAt, currentIssueSnapshotRef: canonicalFiles.currentIssueSnapshot, normalizedCurrentFieldsRef: canonicalFiles.normalizedCurrentFields, canonicalFiles, coverage, coreValidation: { identityVerified: !validationFailures.includes("issue_identity_mismatch"), fullFieldsReturned: snapshot.sectionStatus.fields === "returned", changelogPaginationComplete, commentsPaginationComplete, worklogsPaginationComplete, worklogCompleteness, canonicalHashSizeAndParseVerified: !validationFailures.some((item) => item.includes("canonical_")), failures: validationFailures }, missingSections: missing, partialReasons: target.partialReasons, failedEndpoints: outcome.failedEndpoints ?? [], optionalWarnings: target.optionalWarnings, classification: finalStatus === "eligible" ? outcome.classification ?? "complete" : "required_core_section_incomplete" };
  const manifestRef = atomicWriteJsonStream(path.join(issueDir, "issue-manifest.json"), issueManifest, reference("issue-manifest.json"));
  target.status = finalStatus; target.classification = cleanText(finalStatus === "eligible" ? outcome.classification || target.status : "required_core_section_incomplete"); target.errorType = cleanText(finalStatus === "eligible" ? outcome.errorType : "eligible_validation_failed"); target.lastError = cleanText(finalStatus === "eligible" ? outcome.errorMessage : missing.join(", ")); target.currentIssueSnapshotRef = canonicalFiles.currentIssueSnapshot; target.snapshotFetchedAt = snapshot.fetchedAt; target.normalizedCurrentFieldsRef = canonicalFiles.normalizedCurrentFields; target.normalizedCurrentFields = normalized.fields; target.issueManifestRef = manifestRef; target.canonicalFiles = canonicalFiles; target.coverage = coverage; target.sizeBytes = Object.values(canonicalFiles).reduce((sum, ref) => sum + ref.sizeBytes, 0) + manifestRef.sizeBytes; target.updatedAt = completedAt;
  if (finalStatus !== "eligible") appendNdjson(paths(run.dir).issueErrors, { time: completedAt, issueKey: key, status: finalStatus, errorCode: target.errorType, message: target.lastError, canonicalFiles });
  run.state.lastCompletedObjectKey = key; persist(run); appendStagingDiagnostic(run.dir, "target_complete", { objectKey: key, status: target.status, issueBytes: target.sizeBytes, stagingBytes: run.state.stagingSizeBytes, heapUsedMB: Math.round(process.memoryUsage().heapUsed / 104857.6) / 10 }); return target;
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return cleanText((error as { code: string }).code, 120);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/0x1fffffe8|string longer|string length|Invalid string length/i.test(message)) return "string_limit_exceeded";
  if (/ENOSPC/i.test(message)) return "disk_full";
  if (/EACCES|EPERM/i.test(message)) return "file_permission_denied";
  if (/hash/i.test(message)) return "hash_failed";
  if (/zip/i.test(message)) return "zip_failed";
  return "run_infrastructure_failure";
}
export function failStagingRun(run: StagingRun, faultingIssue: string, error: unknown, stage: string) {
  if (run.state.legacyReadOnly) return run.state;
  const failedAt = now(); const key = faultingIssue ? safeIssueDirectoryName(faultingIssue) : "";
  for (const target of run.index.targets) {
    if (target.objectKey === key || target.status === "in_progress") { target.status = "failed_final"; target.errorType = errorCode(error); target.lastError = cleanText(error instanceof Error ? error.message : error); target.classification = "run_level_failure"; target.updatedAt = failedAt; }
    else if (target.status === "pending") { target.status = "not_attempted_due_to_run_failure"; target.classification = "not_attempted_due_to_run_failure"; target.updatedAt = failedAt; }
  }
  const typedStage = error && typeof error === "object" && "stage" in error && typeof (error as { stage?: unknown }).stage === "string" ? (error as { stage: string }).stage : stage;
  run.state.status = "failed"; run.state.finishedAt = failedAt; run.state.failureTime = failedAt; run.state.faultingObjectKey = key; run.state.runError = { code: errorCode(error), stage: cleanText(typedStage, 160), name: error instanceof Error ? error.name : "Error", message: cleanText(error instanceof Error ? error.message : error), stackSummary: cleanText(error instanceof Error ? error.stack : "", 4000), failedAt };
  try { persist(run); atomicSmallJson(paths(run.dir).errors, { schemaVersion: "full_fetch_run_errors_v1", runId: run.state.fullFetchRunId, stagingId: run.state.stagingId, runError: run.state.runError, faultingIssue: key, notAttemptedIssues: run.index.targets.filter((target) => target.status === "not_attempted_due_to_run_failure").map((target) => target.objectKey) }, run.dir); }
  catch (manifestError) { try { fs.writeFileSync(path.join(run.dir, "emergency-error-manifest.json"), JSON.stringify({ runId: run.state.fullFetchRunId, stagingId: run.state.stagingId, status: "failed", faultingIssue: key, errorCode: run.state.runError.code, errorMessage: run.state.runError.message, manifestError: cleanText(manifestError) }), "utf8"); } catch { /* Last-resort failure must not retain the process lock. */ } }
  return run.state;
}
export function finalizeStagingRun(run: StagingRun, cancelled = false) {
  assertMutable(run);
  if (run.state.remaining > 0) for (const target of run.index.targets) if (target.status === "pending") { target.status = "not_attempted_due_to_run_failure"; target.classification = cancelled ? "not_attempted_due_to_user_cancellation" : "not_attempted"; }
  const aggregate = aggregateFullFetchStatus(run.index.targets.map((target) => target.status), false);
  run.state = deriveState(run.state, run.index);
  run.state.status = cancelled ? "cancelled" : run.state.countReconciliationPassed ? aggregate.status : "failed";
  if (!cancelled && !run.state.countReconciliationPassed) {
    const failedAt = now();
    run.state.failureTime = failedAt;
    run.state.runError = { code: "FULL_FETCH_COUNT_RECONCILIATION_FAILED", stage: "count_reconciliation", name: "CountReconciliationError", message: run.state.countReconciliation.errors.map((item) => `${item.formula}: expected ${item.expected}, actual ${item.actual}`).join("; "), stackSummary: "", failedAt };
    appendStagingDiagnostic(run.dir, "count_reconciliation_failed", { errors: run.state.countReconciliation.errors });
  }
  run.state.finishedAt = now(); run.state.cancelledAt = cancelled ? run.state.finishedAt : null; persist(run); return run.state;
}

export function recoverStaleStaging(rootDir: string) {
  fs.mkdirSync(rootDir, { recursive: true }); const recovered: StagingRun[] = [];
  for (const name of fs.readdirSync(rootDir)) {
    const runDir = path.join(rootDir, name);
    try {
      const run = loadStagingRun(runDir);
      if (!run.state.legacyReadOnly && run.state.status === "running") {
        const failedAt = now(); for (const target of run.index.targets) { if (target.status === "in_progress") { target.status = "failed_final"; target.errorType = "process_restarted"; target.lastError = "The previous app process ended before this issue committed."; } else if (target.status === "pending") target.status = "not_attempted_due_to_run_failure"; }
        run.state.status = "failed"; run.state.failureTime = failedAt; run.state.finishedAt = failedAt; run.state.runError = { code: "process_restarted", stage: "startup_recovery", name: "AbortedOnRestart", message: "The previous Full Fetch process ended while the run was active.", stackSummary: "", failedAt }; persist(run); recovered.push(run);
      }
    } catch { /* Invalid directories are not mutated automatically. */ }
  }
  return recovered;
}
export function listStagingRuns(rootDir: string, legacyRootDir?: string) {
  recoverStaleStaging(rootDir);
  const runs: StagingRun[] = [];
  for (const [root, legacy] of [[rootDir, false], ...(legacyRootDir && path.resolve(legacyRootDir) !== path.resolve(rootDir) ? [[legacyRootDir, true] as [string, boolean]] : [])] as Array<[string, boolean]>) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const runDir = path.join(root, name);
      try { const run = loadStagingRun(runDir); if (legacy && !run.state.legacyReadOnly) continue; runs.push(run); } catch { /* ignored */ }
    }
  }
  return runs.sort((a, b) => b.state.updatedAt.localeCompare(a.state.updatedAt));
}
export function previewStaging(run: StagingRun) {
  run.state = deriveState({ ...run.state, stagingSizeBytes: directorySize(run.dir) }, run.index);
  return {
    ...run.state,
    stagingPath: run.dir,
    blockingErrors: run.index.targets
      .filter((target) => ["failed_issue", "failed_final"].includes(target.status))
      .map((target) => ({ objectKey: target.objectKey, errorCode: target.errorType, error: target.lastError }))
  };
}

export function deleteFailedStaging(rootDir: string, stagingId: string) {
  if (!/^FFS-[A-Za-z0-9_-]{1,120}$/.test(stagingId)) throw new Error("Invalid staging ID.");
  const root = fs.realpathSync(path.resolve(rootDir)); const candidate = path.join(root, stagingId);
  if (!fs.existsSync(candidate) || fs.lstatSync(candidate).isSymbolicLink()) throw new Error("Staging target is missing or unsafe.");
  const resolved = fs.realpathSync(candidate);
  if (resolved === root || path.dirname(resolved) !== root || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Staging target escapes the staging root.");
  const run = loadStagingRun(resolved);
  if (run.state.legacyReadOnly || !["failed", "failed_final", "aborted_on_restart", "completed_with_partial", "completed_with_errors", "discarded"].includes(run.state.status)) throw new Error("Only failed, partial, or discarded current-version staging can be deleted.");
  if (run.state.status !== "discarded") { run.state.status = "discarded"; run.state.finishedAt ??= now(); persist(run); }
  fs.rmSync(resolved, { recursive: true, force: false }); return { ok: true, stagingId, deletedPath: resolved };
}
export function discardStaging(run: StagingRun) { assertMutable(run); run.state.status = "discarded"; run.state.finishedAt ??= now(); persist(run); return run.state; }
export function cleanupExpiredStaging(rootDir: string, at = new Date()) {
  const results: Array<{ stagingId: string; removed: boolean; reason: string }> = [];
  if (!fs.existsSync(rootDir)) return results;
  for (const run of listStagingRuns(rootDir)) {
    if (mutationLocks.has(run.state.stagingId) || ["created", "running"].includes(run.state.status)) { results.push({ stagingId: run.state.stagingId, removed: false, reason: "active_staging" }); continue; }
    if (["failed", "failed_final", "aborted_on_restart", "completed_with_partial", "completed_with_errors", "legacy_incomplete"].includes(run.state.status)) { results.push({ stagingId: run.state.stagingId, removed: false, reason: "fetch_failure_permanent_retention" }); continue; }
    if (run.state.exportError && !run.state.safeToCleanup) { results.push({ stagingId: run.state.stagingId, removed: false, reason: "export_failure_permanent_retention" }); continue; }
    const cancelledAt = run.state.cancelledAt ? new Date(run.state.cancelledAt).getTime() : NaN;
    if (run.state.status === "cancelled" && Number.isFinite(cancelledAt) && cancelledAt + CANCELLED_RETENTION_DAYS * 86400000 <= at.getTime()) { fs.rmSync(run.dir, { recursive: true, force: true }); results.push({ stagingId: run.state.stagingId, removed: true, reason: "cancelled_retention_expired" }); continue; }
    const exportedAt = run.state.successfulExportAt ? new Date(run.state.successfulExportAt).getTime() : NaN;
    if (run.state.status === "completed" && run.state.safeToCleanup && Number.isFinite(exportedAt) && exportedAt + RETENTION_DAYS * 86400000 <= at.getTime()) { fs.rmSync(run.dir, { recursive: true, force: true }); results.push({ stagingId: run.state.stagingId, removed: true, reason: "verified_export_retention_expired" }); }
    else results.push({ stagingId: run.state.stagingId, removed: false, reason: "retained" });
  }
  return results;
}

function archiveEntries(run: StagingRun, prefix: string) {
  const entries: StreamingZipEntry[] = [];
  for (const target of run.index.targets.filter((item) => item.status === "eligible")) {
    for (const ref of [target.issueManifestRef, ...Object.values(target.canonicalFiles)]) {
      if (!ref) continue;
      entries.push({ name: `${prefix}${ref.path}`, filePath: resolveInside(run.dir, ref.path) });
    }
  }
  return entries;
}
export function exportStaging(run: StagingRun, outputDir: string, _partial = false, exportedAt = now()) {
  assertMutable(run);
  run.state = deriveState(run.state, run.index);
  if (run.state.status !== "completed" || !run.state.countReconciliationPassed || run.state.requiredPartial > 0 || run.state.failed > 0 || run.state.notAttempted > 0 || run.state.remaining > 0) throw new Error("Only a complete Full Fetch run with passed count reconciliation can finalize a formal Source Archive.");
  mutationLocks.add(run.state.stagingId);
  let packagePath = "";
  try {
    run.state.lastExportAttemptAt = exportedAt; run.state.safeToCleanup = false; persist(run);
    fs.mkdirSync(outputDir, { recursive: true }); const prefix = "source-archive-import-package/";
    for (const target of run.index.targets.filter((item) => item.status === "eligible")) {
      const references = [...Object.values(target.canonicalFiles), ...(target.issueManifestRef ? [target.issueManifestRef] : [])];
      const invalid = references.map((reference) => ({ reference, verification: verifyFileReference(run.dir, reference) })).find((item) => !item.verification.ok || !validateGeneratedJsonFile(item.verification.filePath, item.reference.path.endsWith(".ndjson")));
      if (invalid) throw new Error(`Eligible canonical verification failed for ${target.objectKey}: ${invalid.verification.errorCode || "canonical_json_unreadable"}`);
    }
    const canonical = archiveEntries(run, prefix);
  const objectIndex = { schemaVersion: "source_object_index_v3", ...runBuildIdentity(run), stagingId: run.state.stagingId, fullFetchRunId: run.state.fullFetchRunId, countReconciliation: run.state.countReconciliation, objects: run.index.targets.filter((target) => target.status === "eligible").map((target) => ({ sourceSystem: "jira", objectType: "issue", objectKey: target.objectKey, issueManifestRef: target.issueManifestRef, currentIssueSnapshotRef: target.currentIssueSnapshotRef, normalizedCurrentFieldsRef: target.normalizedCurrentFieldsRef, canonicalFiles: target.canonicalFiles, sizeBytes: target.sizeBytes })) };
    let verification: ArchiveVerification = { eligibleCount: run.state.eligible, entryCount: canonical.length + 2, expectedSizeBytes: canonical.reduce((sum, entry) => sum + fs.statSync(entry.filePath!).size, 0), verifiedSizeBytes: 0, hashMatchedCount: 0, zipReopenVerified: false, requiredEntriesReadable: false, manifestConsistent: false, safeForAutomaticImport: false };
  const manifest = () => Buffer.from(`${JSON.stringify({ schemaVersion: "source_archive_import_package_v3", sectionMetadataVersion: "coverage_v2", ...runBuildIdentity(run), exportedAt, packageStatus: "complete", stagingId: run.state.stagingId, fullFetchRunId: run.state.fullFetchRunId, eligible: run.state.eligible, countReconciliation: run.state.countReconciliation, verification, canonicalStorage: "per_issue_file_backed", futureImporterPolicy: "Import eligible records only and verify every canonical file reference before insertion." }, null, 2)}\n`, "utf8");
    const indexBytes = Buffer.from(`${JSON.stringify(objectIndex, null, 2)}\n`, "utf8");
    const makeEntries = () => [{ name: `${prefix}source-archive-import-manifest.json`, data: manifest() }, { name: `${prefix}source-object-index.json`, data: indexBytes }, ...canonical];
    packagePath = path.join(outputDir, `source-archive-import-package-${run.state.stagingId}-complete.zip`);
    let created = createStreamingZip(packagePath, makeEntries());
    let verified = verifyStreamingZip(packagePath, created.entries);
    verification = { ...verification, entryCount: verified.length, verifiedSizeBytes: verified.reduce((sum, item) => sum + item.sizeBytes, 0), hashMatchedCount: verified.length, zipReopenVerified: true, requiredEntriesReadable: true, manifestConsistent: true, safeForAutomaticImport: true };
    created = createStreamingZip(packagePath, makeEntries()); verified = verifyStreamingZip(packagePath, created.entries);
    const packageHash = hashFile(packagePath);
    run.state.packagePath = packagePath; run.state.packageSha256 = packageHash.sha256; run.state.exportVerification = verification; run.state.safeToCleanup = true; run.state.successfulExportAt = exportedAt; run.state.exportError = null; persist(run);
    const result = { schemaVersion: "full_fetch_staging_export_result_v3", stagingId: run.state.stagingId, fullFetchRunId: run.state.fullFetchRunId, packageStatus: "complete", safeForAutomaticImport: true, safeToCleanup: true, packagePath, packageSha256: packageHash.sha256, fileSize: packageHash.sizeBytes, exportedAt, verification, errors: [] };
    atomicSmallJson(paths(run.dir).exportResult, result, run.dir); return result;
  } catch (error) {
    if (packagePath) try { fs.rmSync(packagePath, { force: true }); } catch { /* best effort */ }
    const failedAt = now();
    run.state.safeToCleanup = false; run.state.packagePath = null; run.state.packageSha256 = null; run.state.exportVerification = null;
    run.state.exportError = { code: errorCode(error) === "run_infrastructure_failure" ? "source_archive_export_failed" : errorCode(error), stage: error && typeof error === "object" && "stage" in error ? cleanText((error as { stage?: unknown }).stage, 160) : "source_archive_export", name: error instanceof Error ? error.name : "Error", message: cleanText(error instanceof Error ? error.message : error), stackSummary: cleanText(error instanceof Error ? error.stack : "", 4000), failedAt };
    persist(run); atomicSmallJson(paths(run.dir).exportResult, { schemaVersion: "full_fetch_staging_export_result_v3", stagingId: run.state.stagingId, fullFetchRunId: run.state.fullFetchRunId, packageStatus: "failed", safeForAutomaticImport: false, safeToCleanup: false, exportedAt, error: run.state.exportError }, run.dir);
    throw error;
  } finally { mutationLocks.delete(run.state.stagingId); }
}
export function isStagingMutationLocked(stagingId: string) { return mutationLocks.has(stagingId); }

export function stagingDebugIndex(run: StagingRun | null) {
  if (!run) return { stagingAvailable: false, includedFiles: [], omittedFiles: [] };
  const preview = previewStaging(run);
  return { stagingAvailable: true, stagingId: run.state.stagingId, fullFetchRunId: run.state.fullFetchRunId, status: run.state.status, legacyReadOnly: run.state.legacyReadOnly, legacyMessage: run.state.legacyMessage, stagingPath: run.dir, stagingSizeBytes: preview.stagingSizeBytes, counts: { total: run.state.total, completed: run.state.completed, eligible: run.state.eligible, requiredPartial: run.state.requiredPartial, optionalWarning: run.state.optionalWarning, failed: run.state.failed, failedFinal: run.state.failedFinal, notAttempted: run.state.notAttempted, excluded: run.state.excluded, remaining: run.state.remaining }, runError: run.state.runError, faultingIssue: run.state.faultingObjectKey, finalPackagePath: run.state.packagePath, finalPackageHash: run.state.packageSha256, verification: run.state.exportVerification, safeToCleanup: run.state.safeToCleanup, includedFiles: [paths(run.dir).state, paths(run.dir).index, paths(run.dir).result, paths(run.dir).errors, paths(run.dir).issueErrors, paths(run.dir).diagnostics].filter(fs.existsSync).map((file) => relative(run.dir, file)), omittedFiles: [] };
}
export function stagingPaths(run: StagingRun) { return paths(run.dir); }
export function readFullFetchResultIndex(run: StagingRun) { return readSmallJson<Record<string, unknown>>(paths(run.dir).result); }
