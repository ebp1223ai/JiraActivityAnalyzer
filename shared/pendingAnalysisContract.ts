import crypto from "node:crypto";

export const PENDING_ANALYSIS_SCHEMA_NAME = "jira-activity-analyzer.pending-analysis" as const;
export const PENDING_ANALYSIS_SCHEMA_VERSION = "0.3.0-draft.1" as const;
export const PENDING_ANALYSIS_CONTRACT_STATUS = "review-draft" as const;

export type PendingAnalysisSourceView = "ISSUE_ACTIVITY_EVENTS" | "USER_ALL_ACTIVITY_EVENTS";
export type PendingAnalysisExportErrorCode =
  | "NO_FILTERED_RECORDS"
  | "SOURCE_DATABASE_NOT_READY"
  | "SOURCE_DATABASE_CHANGED"
  | "FILTER_SNAPSHOT_INVALID"
  | "COUNT_EXPORT_MISMATCH"
  | "SOURCE_IDENTITY_INCOMPLETE"
  | "EXPORT_CANCELLED"
  | "EXPORT_PATH_NOT_WRITABLE"
  | "EXPORT_WRITE_FAILED"
  | "EXPORT_FINALIZE_FAILED"
  | "EXPORT_INTEGRITY_FAILED";

export type PendingAnalysisProvenance = "SOURCE_EVIDENCE" | "DERIVED_FROM_EVIDENCE" | "RUNTIME_GENERATED_METADATA";
export type PendingAnalysisIntegrityReason =
  | "EVIDENCE_PATH_TEXT_ALLOWED"
  | "RUNTIME_PATH_IN_GENERATED_METADATA"
  | "CREDENTIAL_PATTERN_DETECTED"
  | "UNKNOWN_FIELD_PROVENANCE";

export type PendingAnalysisRuntimeIdentity = {
  appRoot?: string;
  databasePath?: string;
  executablePath?: string;
  userDataPath?: string;
  tempPath?: string;
  stagingPath?: string;
  profilePath?: string;
  credentialValues?: string[];
};

export type PendingAnalysisIntegrityDecision = {
  reason: PendingAnalysisIntegrityReason;
  jsonPath: string;
  provenance: PendingAnalysisProvenance;
};

export type PendingAnalysisProgress = {
  exportId: string;
  status: "idle" | "preparing" | "filtering" | "writing" | "finalizing" | "completed" | "cancelled" | "failed";
  stage: "preparing" | "filtering" | "writing" | "finalizing" | "completed" | "cancelled" | "failed";
  sourceView: PendingAnalysisSourceView;
  totalRecords: number;
  processedRecords: number;
  serializedRecords: number;
  writtenRecords: number;
  filteredCount: number;
  exportedCount: number;
  percentage: number;
  elapsedMs: number;
  message: string;
  errorCode?: PendingAnalysisExportErrorCode;
  integrityReason?: PendingAnalysisIntegrityReason;
  offendingJsonPath?: string;
  result?: PendingAnalysisExportResult;
};

export type PendingAnalysisExportResult = {
  exportId: string;
  fileName: string;
  filePath: string;
  folderPath: string;
  exportedCount: number;
  sizeBytes: number;
  sha256: string;
  elapsedMs: number;
};

export type PendingAnalysisExportRequest = {
  sourceView: PendingAnalysisSourceView;
  query: Record<string, unknown>;
  expectedFilteredCount: number;
  expectedDatabaseIdentity: string;
  issueKey?: string;
  userScope?: unknown;
};

export type PendingAnalysisRecord = {
  evidenceIdentity: Record<string, unknown> & {
    evidenceId: string;
    activityEventId: string;
    sourceContentHash: string;
  };
  eventMetadata: Record<string, unknown>;
  analysisContent: Record<string, unknown>;
  currentIssueContext: Record<string, unknown> & { contextType: "CURRENT_SAVED_ISSUE_SNAPSHOT" };
  relatedContextCandidates: { sameHistoryItems: unknown[]; availability: string; diagnostics: string[] };
  integrity: { recordSha256: string; originalEvidenceAvailable: boolean; diagnostics: string[] };
};

export type PendingAnalysisDocument = {
  schemaName: typeof PENDING_ANALYSIS_SCHEMA_NAME;
  schemaVersion: typeof PENDING_ANALYSIS_SCHEMA_VERSION;
  contractStatus: typeof PENDING_ANALYSIS_CONTRACT_STATUS;
  exportId: string;
  createdAt: string;
  timezone: "Asia/Taipei";
  appVersion: "0.3.1";
  sourceView: PendingAnalysisSourceView;
  sourceDatabase: {
    sourceDatabaseId: string;
    jiraServerFingerprint: string;
    jiraServerHost: string;
    sourceSchemaVersion: number;
    databaseGeneration: string;
  };
  querySnapshot: Record<string, unknown> & { filterSnapshotHash: string };
  counts: { filteredCountAtStart: number; exportedCount: number; skippedCount: 0; failedCount: 0; batchCount: number };
  records: PendingAnalysisRecord[];
  integrity: { recordsSha256: string; recordCount: number; schemaVersion: string; exportCompletionStatus: "COMPLETED"; algorithm: "SHA-256" };
  diagnostics: string[];
};

export class PendingAnalysisExportError extends Error {
  constructor(
    public readonly code: PendingAnalysisExportErrorCode,
    message: string,
    public readonly integrityReason?: PendingAnalysisIntegrityReason,
    public readonly offendingJsonPath?: string
  ) {
    super(message);
    this.name = "PendingAnalysisExportError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function filterSnapshot(query: Record<string, unknown>, subject: Record<string, unknown>) {
  const { page: _page, pageSize: _pageSize, ...completeQuery } = query;
  const snapshot = { query: completeQuery, subject };
  return { ...snapshot, filterSnapshotHash: sha256Canonical(snapshot) };
}

export function createPendingEvidenceId(sourceDatabaseId: string, sourceIdentity: Record<string, unknown>, contentSha256: string) {
  return `pae_${sha256Canonical({ sourceDatabaseId, sourceIdentity, contentSha256 }).slice(0, 40)}`;
}

const credentialKey = /(?:^|[_-])(authorization|bearer|cookie|session(?:id)?|password|secret|api[_-]?token|token)(?:$|[_-])/i;
const credentialText = /(?:authorization\s*[:=]|bearer\s+[A-Za-z0-9+/=._~-]{6,}|(?:cookie|session(?:id)?|password|secret|api[_-]?token|token)\s*[:=]\s*\S+)/i;
const provenanceValues = new Set<PendingAnalysisProvenance>(["SOURCE_EVIDENCE", "DERIVED_FROM_EVIDENCE", "RUNTIME_GENERATED_METADATA"]);

function integrityFailure(reason: Exclude<PendingAnalysisIntegrityReason, "EVIDENCE_PATH_TEXT_ALLOWED">, jsonPath: string): never {
  throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", reason + " at " + jsonPath, reason, jsonPath);
}

function normalizedHostPath(value: string) {
  const trimmed = value.trim().replace(/^file:\/+/, "/").replace(/\\/g, "/").replace(/\/+/g, "/");
  return /^[A-Za-z]:\//.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function containsCredential(value: string, context: PendingAnalysisRuntimeIdentity) {
  if (credentialText.test(value)) return true;
  return (context.credentialValues ?? []).filter((candidate) => candidate.length >= 6).some((candidate) => value.includes(candidate));
}

function looksLikeHostPath(value: string, context: PendingAnalysisRuntimeIdentity) {
  const trimmed = value.trim();
  if (!trimmed || (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^file:\/\//i.test(trimmed))) return false;
  const normalized = normalizedHostPath(trimmed);
  const roots = [context.appRoot, context.databasePath, context.executablePath, context.userDataPath, context.tempPath, context.stagingPath, context.profilePath]
    .filter((candidate): candidate is string => Boolean(candidate)).map(normalizedHostPath);
  if (roots.some((root) => normalized === root || normalized.startsWith(root + "/") || normalized.includes(root))) return true;
  return /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/])/.test(trimmed)
    || /^\/(?:Users|home|tmp|var|opt|etc|private|mnt|Volumes)(?:\/|$)/i.test(trimmed)
    || /^(?:\.{1,2}[\\/])/.test(trimmed)
    || /^[^:\r\n]+[\\/][^:\r\n]+\.(?:db|sqlite3?|exe|dll|json|log|tmp|partial|profile)$/i.test(trimmed);
}

export function scanPendingAnalysisValue(value: unknown, provenance: PendingAnalysisProvenance | undefined, jsonPath = "$", context: PendingAnalysisRuntimeIdentity = {}): PendingAnalysisIntegrityDecision[] {
  if (!provenance || !provenanceValues.has(provenance)) integrityFailure("UNKNOWN_FIELD_PROVENANCE", jsonPath);
  const decisions: PendingAnalysisIntegrityDecision[] = [];
  const visit = (child: unknown, childPath: string) => {
    if (typeof child === "string") {
      if (containsCredential(child, context)) integrityFailure("CREDENTIAL_PATTERN_DETECTED", childPath);
      if (looksLikeHostPath(child, context)) {
        if (provenance === "RUNTIME_GENERATED_METADATA") integrityFailure("RUNTIME_PATH_IN_GENERATED_METADATA", childPath);
        decisions.push({ reason: "EVIDENCE_PATH_TEXT_ALLOWED", jsonPath: childPath, provenance });
      }
    } else if (Array.isArray(child)) {
      child.forEach((item, index) => visit(item, childPath + "[" + index + "]"));
    } else if (child && typeof child === "object") {
      for (const [key, item] of Object.entries(child as Record<string, unknown>)) {
        const itemPath = childPath + "." + key;
        if (credentialKey.test(key)) integrityFailure("CREDENTIAL_PATTERN_DETECTED", itemPath);
        visit(item, itemPath);
      }
    }
  };
  visit(value, jsonPath);
  return decisions;
}

export function assertPendingAnalysisSafe(value: unknown, provenance?: PendingAnalysisProvenance, path = "$", context: PendingAnalysisRuntimeIdentity = {}) {
  return scanPendingAnalysisValue(value, provenance, path, context);
}

function scanFields(value: unknown, rules: Record<string, PendingAnalysisProvenance>, path: string, context: PendingAnalysisRuntimeIdentity) {
  if (!value || typeof value !== "object" || Array.isArray(value)) integrityFailure("UNKNOWN_FIELD_PROVENANCE", path);
  const decisions: PendingAnalysisIntegrityDecision[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path + "." + key;
    const provenance = rules[key];
    if (!provenance) integrityFailure("UNKNOWN_FIELD_PROVENANCE", childPath);
    decisions.push(...scanPendingAnalysisValue(child, provenance, childPath, context));
  }
  return decisions;
}

export function assertPendingAnalysisRecordSafe(record: PendingAnalysisRecord, context: PendingAnalysisRuntimeIdentity = {}) {
  const top = record as Record<string, unknown>;
  const allowedTop = new Set(["evidenceIdentity", "eventMetadata", "analysisContent", "currentIssueContext", "relatedContextCandidates", "integrity"]);
  for (const key of Object.keys(top)) if (!allowedTop.has(key)) integrityFailure("UNKNOWN_FIELD_PROVENANCE", "$." + key);
  return [
    ...scanPendingAnalysisValue(record.evidenceIdentity, "DERIVED_FROM_EVIDENCE", "$.evidenceIdentity", context),
    ...scanPendingAnalysisValue(record.eventMetadata, "SOURCE_EVIDENCE", "$.eventMetadata", context),
    ...scanFields(record.analysisContent, {
      beforeRaw: "SOURCE_EVIDENCE", afterRaw: "SOURCE_EVIDENCE", parsedBefore: "SOURCE_EVIDENCE", parsedAfter: "SOURCE_EVIDENCE", comment: "SOURCE_EVIDENCE",
      beforeAvailability: "DERIVED_FROM_EVIDENCE", afterAvailability: "DERIVED_FROM_EVIDENCE", beforeSha256: "DERIVED_FROM_EVIDENCE", afterSha256: "DERIVED_FROM_EVIDENCE",
      diffStatus: "DERIVED_FROM_EVIDENCE", diffReason: "DERIVED_FROM_EVIDENCE", diffText: "DERIVED_FROM_EVIDENCE", diffHunks: "DERIVED_FROM_EVIDENCE",
      addedLineCount: "DERIVED_FROM_EVIDENCE", removedLineCount: "DERIVED_FROM_EVIDENCE", unchangedLineCount: "DERIVED_FROM_EVIDENCE",
      isSubstantiveChange: "DERIVED_FROM_EVIDENCE", contentDisplayMode: "DERIVED_FROM_EVIDENCE", contentSource: "DERIVED_FROM_EVIDENCE",
      commentFormat: "DERIVED_FROM_EVIDENCE", diagnostics: "DERIVED_FROM_EVIDENCE"
    }, "$.analysisContent", context),
    ...scanFields(record.currentIssueContext, {
      contextType: "RUNTIME_GENERATED_METADATA", contextSemantics: "RUNTIME_GENERATED_METADATA", currentDescriptionAvailability: "RUNTIME_GENERATED_METADATA",
      summary: "SOURCE_EVIDENCE", projectKey: "SOURCE_EVIDENCE", projectName: "SOURCE_EVIDENCE", issueType: "SOURCE_EVIDENCE", status: "SOURCE_EVIDENCE",
      priority: "SOURCE_EVIDENCE", labels: "SOURCE_EVIDENCE", components: "SOURCE_EVIDENCE", assignee: "SOURCE_EVIDENCE", reporter: "SOURCE_EVIDENCE",
      creator: "SOURCE_EVIDENCE", startDate: "SOURCE_EVIDENCE", dueDate: "SOURCE_EVIDENCE", currentDescription: "SOURCE_EVIDENCE", snapshotUpdatedAt: "SOURCE_EVIDENCE"
    }, "$.currentIssueContext", context),
    ...scanFields(record.relatedContextCandidates, {
      sameHistoryItems: "SOURCE_EVIDENCE", availability: "RUNTIME_GENERATED_METADATA", diagnostics: "RUNTIME_GENERATED_METADATA"
    }, "$.relatedContextCandidates", context),
    ...scanPendingAnalysisValue(record.integrity, "RUNTIME_GENERATED_METADATA", "$.integrity", context)
  ];
}

export function assertPendingAnalysisHeaderSafe(value: Record<string, unknown>, context: PendingAnalysisRuntimeIdentity = {}) {
  return scanFields(value, {
    schemaName: "RUNTIME_GENERATED_METADATA", schemaVersion: "RUNTIME_GENERATED_METADATA", contractStatus: "RUNTIME_GENERATED_METADATA",
    exportId: "RUNTIME_GENERATED_METADATA", createdAt: "RUNTIME_GENERATED_METADATA", timezone: "RUNTIME_GENERATED_METADATA",
    appVersion: "RUNTIME_GENERATED_METADATA", sourceView: "RUNTIME_GENERATED_METADATA", sourceDatabase: "RUNTIME_GENERATED_METADATA",
    querySnapshot: "RUNTIME_GENERATED_METADATA", counts: "RUNTIME_GENERATED_METADATA"
  }, "$", context);
}

export function assertPendingAnalysisDocument(document: PendingAnalysisDocument, context: PendingAnalysisRuntimeIdentity = {}) {
  if (document.schemaName !== PENDING_ANALYSIS_SCHEMA_NAME || document.schemaVersion !== PENDING_ANALYSIS_SCHEMA_VERSION || document.contractStatus !== PENDING_ANALYSIS_CONTRACT_STATUS) {
    throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Pending-analysis contract header is invalid.");
  }
  if (!document.sourceDatabase.sourceDatabaseId || !document.sourceDatabase.jiraServerFingerprint || !document.sourceDatabase.databaseGeneration) {
    throw new PendingAnalysisExportError("SOURCE_IDENTITY_INCOMPLETE", "Source database identity is incomplete.");
  }
  if (document.counts.filteredCountAtStart !== document.counts.exportedCount || document.counts.exportedCount !== document.records.length) {
    throw new PendingAnalysisExportError("COUNT_EXPORT_MISMATCH", "Filtered and exported record counts do not match.");
  }
  const digest = sha256Canonical(document.records);
  if (document.integrity.recordsSha256 !== digest) throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Record digest mismatch.");
  const { records, integrity, diagnostics, ...header } = document;
  assertPendingAnalysisHeaderSafe(header, context);
  records.forEach((record) => assertPendingAnalysisRecordSafe(record, context));
  scanPendingAnalysisValue(integrity, "RUNTIME_GENERATED_METADATA", "$.integrity", context);
  scanPendingAnalysisValue(diagnostics, "RUNTIME_GENERATED_METADATA", "$.diagnostics", context);
  return document;
}
