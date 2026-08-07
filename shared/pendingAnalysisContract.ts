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

export type PendingAnalysisProgress = {
  exportId: string;
  status: "idle" | "preparing" | "filtering" | "writing" | "finalizing" | "completed" | "cancelled" | "failed";
  sourceView: PendingAnalysisSourceView;
  filteredCount: number;
  exportedCount: number;
  percentage: number;
  elapsedMs: number;
  message: string;
  errorCode?: PendingAnalysisExportErrorCode;
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
  appVersion: "0.3.0";
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
  constructor(public readonly code: PendingAnalysisExportErrorCode, message: string) {
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

const forbiddenKey = /(token|password|authorization|cookie|secret|databasepath|filepath|folderpath|baseurlnormalized)/i;
const windowsPath = /(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\)/;

export function assertPendingAnalysisSafe(value: unknown, path = "$") {
  if (typeof value === "string" && windowsPath.test(value)) {
    throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", `Local path found at ${path}`);
  }
  if (Array.isArray(value)) return value.forEach((child, index) => assertPendingAnalysisSafe(child, `${path}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (forbiddenKey.test(key)) throw new PendingAnalysisExportError("EXPORT_INTEGRITY_FAILED", `Forbidden field ${path}.${key}`);
      assertPendingAnalysisSafe(child, `${path}.${key}`);
    }
  }
}

export function assertPendingAnalysisDocument(document: PendingAnalysisDocument) {
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
  assertPendingAnalysisSafe(document);
  return document;
}
