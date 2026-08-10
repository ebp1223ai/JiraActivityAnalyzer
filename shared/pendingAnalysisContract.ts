import crypto from "node:crypto";
import type { DiffHunk } from "./descriptionDiff.js";

export const PENDING_ANALYSIS_SCHEMA_NAME = "jira-activity-analyzer.pending-analysis" as const;
export const PENDING_ANALYSIS_SCHEMA_VERSION = "0.3.3-draft.1" as const;
export const PENDING_ANALYSIS_CONTRACT_STATUS = "review-draft" as const;
export const PENDING_ANALYSIS_EXPORT_MODE = "compact-reference" as const;

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
  | "FULL_CONTENT_FIELD_FORBIDDEN"
  | "DIFF_CONTENT_MISSING"
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

export type PendingAnalysisAvailability = "AVAILABLE" | "UNAVAILABLE";

export type PendingAnalysisRecord = {
  reference: {
    evidenceId: string;
    activityEventId: string;
    sourceDatabaseId: string;
    jiraServerFingerprint: string;
    sourceRecordStableId: string | null;
    historyId: string | null;
    historyItemIndex: number | null;
    issueId: string | null;
    issueKey: string | null;
    projectKey: string | null;
    fieldId: string | null;
    fieldName: string | null;
    eventTime: string | null;
    actor: { stableIdentity: string | null; displayValue: string | null };
    sourceProvenance: string | null;
    sourceContentHash: string;
    beforeSha256: string | null;
    afterSha256: string | null;
  };
  diff: {
    diffText: null;
    diffHunks: DiffHunk[];
    addedLineCount: number | null;
    removedLineCount: number | null;
    diffStatus: string | null;
    isSubstantiveChange: boolean;
    beforeAvailability: PendingAnalysisAvailability;
    afterAvailability: PendingAnalysisAvailability;
    integrityStatus: "VERIFIED" | "NOT_APPLICABLE";
    diagnostics: string[];
  };
  integrity: {
    recordSha256: string;
    originalEvidenceAvailable: boolean;
    sourceContentHashesVerified: boolean;
    diagnostics: string[];
  };
};

export type PendingAnalysisDocument = {
  schemaName: typeof PENDING_ANALYSIS_SCHEMA_NAME;
  schemaVersion: typeof PENDING_ANALYSIS_SCHEMA_VERSION;
  contractStatus: typeof PENDING_ANALYSIS_CONTRACT_STATUS;
  exportId: string;
  createdAt: string;
  timezone: "Asia/Taipei";
  appVersion: "0.3.3";
  exportMetadata: {
    exportMode: typeof PENDING_ANALYSIS_EXPORT_MODE;
    selfContained: false;
    fullContentIncluded: false;
    sourceDatabaseRequiredForFullContent: true;
  };
  sourceView: PendingAnalysisSourceView;
  sourceDatabase: {
    sourceDatabaseId: string;
    jiraServerFingerprint: string;
    jiraServerHost: string;
    sourceSchemaVersion: number;
    databaseGeneration: string;
  };
  querySnapshot: Record<string, unknown> & { filterSnapshotHash: string };
  counts: { filteredCountAtStart: number; exportedCount: number; skippedCount: 0; failedCount: 0; batchCount: number; changedRecordCount: number; recordsWithDiffContentCount: number; diffHunkCount: number; diffCoverageComplete: boolean };
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

const forbiddenCompactKeys = new Set([
  "beforeraw", "afterraw", "parsedbefore", "parsedafter", "before", "after",
  "beforecontent", "aftercontent", "fromvalue", "tovalue", "fromstring", "tostring",
  "oldvalue", "newvalue", "rawbefore", "rawafter"
]);

export function assertNoEmbeddedFullContent(value: unknown, path = "$compact") {
  const visit = (child: unknown, childPath: string) => {
    if (Array.isArray(child)) child.forEach((item, index) => visit(item, `${childPath}[${index}]`));
    else if (child && typeof child === "object") {
      for (const [key, item] of Object.entries(child as Record<string, unknown>)) {
        const itemPath = `${childPath}.${key}`;
        if (forbiddenCompactKeys.has(key.toLowerCase())) integrityFailure("FULL_CONTENT_FIELD_FORBIDDEN", itemPath);
        visit(item, itemPath);
      }
    }
  };
  visit(value, path);
  return value;
}

export function assertPendingAnalysisRecordSafe(record: PendingAnalysisRecord, context: PendingAnalysisRuntimeIdentity = {}) {
  const top = record as Record<string, unknown>;
  const allowedTop = new Set(["reference", "diff", "integrity"]);
  for (const key of Object.keys(top)) if (!allowedTop.has(key)) integrityFailure("UNKNOWN_FIELD_PROVENANCE", "$." + key);
  assertNoEmbeddedFullContent(record);
  const { recordSha256, ...integrityBase } = record.integrity;
  const expectedRecordSha256 = sha256Canonical({ reference: record.reference, diff: record.diff, integrity: integrityBase });
  if (recordSha256 !== expectedRecordSha256) throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Compact record digest mismatch.");
  if (record.diff.diffStatus === "changed" && record.diff.isSubstantiveChange) {
    const changeLines = record.diff.diffHunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "insert" || line.kind === "delete");
    const inserted = changeLines.filter((line) => line.kind === "insert").length;
    const deleted = changeLines.filter((line) => line.kind === "delete").length;
    if (!record.diff.diffHunks.length || !changeLines.length || inserted !== record.diff.addedLineCount || deleted !== record.diff.removedLineCount) {
      integrityFailure("DIFF_CONTENT_MISSING", "$.diff.diffHunks");
    }
  }
  if (!record.reference.sourceDatabaseId || !record.reference.jiraServerFingerprint || !record.reference.activityEventId) {
    throw new PendingAnalysisExportError("SOURCE_IDENTITY_INCOMPLETE", "Compact source reference is incomplete.");
  }
  return [
    ...scanPendingAnalysisValue(record.reference, "DERIVED_FROM_EVIDENCE", "$.reference", context),
    ...scanPendingAnalysisValue(record.diff, "DERIVED_FROM_EVIDENCE", "$.diff", context),
    ...scanPendingAnalysisValue(record.integrity, "RUNTIME_GENERATED_METADATA", "$.integrity", context)
  ];
}

export function assertPendingAnalysisHeaderSafe(value: Record<string, unknown>, context: PendingAnalysisRuntimeIdentity = {}) {
  return scanFields(value, {
    schemaName: "RUNTIME_GENERATED_METADATA", schemaVersion: "RUNTIME_GENERATED_METADATA", contractStatus: "RUNTIME_GENERATED_METADATA",
    exportId: "RUNTIME_GENERATED_METADATA", createdAt: "RUNTIME_GENERATED_METADATA", timezone: "RUNTIME_GENERATED_METADATA",
    appVersion: "RUNTIME_GENERATED_METADATA", exportMetadata: "RUNTIME_GENERATED_METADATA",
    sourceView: "RUNTIME_GENERATED_METADATA", sourceDatabase: "RUNTIME_GENERATED_METADATA",
    querySnapshot: "RUNTIME_GENERATED_METADATA", counts: "RUNTIME_GENERATED_METADATA"
  }, "$", context);
}

export function assertPendingAnalysisDocument(document: PendingAnalysisDocument, context: PendingAnalysisRuntimeIdentity = {}) {
  if (document.schemaName !== PENDING_ANALYSIS_SCHEMA_NAME || document.schemaVersion !== PENDING_ANALYSIS_SCHEMA_VERSION || document.contractStatus !== PENDING_ANALYSIS_CONTRACT_STATUS) {
    throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Pending-analysis contract header is invalid.");
  }
  if (document.exportMetadata.exportMode !== PENDING_ANALYSIS_EXPORT_MODE || document.exportMetadata.selfContained
      || document.exportMetadata.fullContentIncluded || !document.exportMetadata.sourceDatabaseRequiredForFullContent) {
    throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Compact export metadata is invalid.");
  }
  if (!document.sourceDatabase.sourceDatabaseId || !document.sourceDatabase.jiraServerFingerprint || !document.sourceDatabase.databaseGeneration) {
    throw new PendingAnalysisExportError("SOURCE_IDENTITY_INCOMPLETE", "Source database identity is incomplete.");
  }
  if (document.counts.filteredCountAtStart !== document.counts.exportedCount || document.counts.exportedCount !== document.records.length) {
    throw new PendingAnalysisExportError("COUNT_EXPORT_MISMATCH", "Filtered and exported record counts do not match.");
  }
  const changedRecords = document.records.filter((record) => record.diff.diffStatus === "changed" && record.diff.isSubstantiveChange);
  const recordsWithDiffContent = changedRecords.filter((record) => record.diff.diffHunks.some((hunk) => hunk.lines.some((line) => line.kind === "insert" || line.kind === "delete")));
  const diffHunkCount = document.records.reduce((total, record) => total + record.diff.diffHunks.length, 0);
  if (!document.counts.diffCoverageComplete || document.counts.changedRecordCount !== changedRecords.length
      || document.counts.recordsWithDiffContentCount !== recordsWithDiffContent.length || document.counts.diffHunkCount !== diffHunkCount
      || changedRecords.length !== recordsWithDiffContent.length) integrityFailure("DIFF_CONTENT_MISSING", "$.counts.diffCoverageComplete");
  const digest = sha256Canonical(document.records);
  if (document.integrity.recordsSha256 !== digest) throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", "Record digest mismatch.");
  const { records, integrity, diagnostics, ...header } = document;
  assertPendingAnalysisHeaderSafe(header, context);
  records.forEach((record) => assertPendingAnalysisRecordSafe(record, context));
  scanPendingAnalysisValue(integrity, "RUNTIME_GENERATED_METADATA", "$.integrity", context);
  scanPendingAnalysisValue(diagnostics, "RUNTIME_GENERATED_METADATA", "$.diagnostics", context);
  return document;
}
