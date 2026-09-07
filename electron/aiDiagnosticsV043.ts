import crypto from "node:crypto";
type Json = Record<string, any>;
const digest = (value: unknown) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");

export function safeAiDatabaseDiagnosticV043(value: Json | null): Json | null {
  if (!value) return null;
  const allowed = ["lifecycleState", "schemaVersion", "canQuery", "canImport", "exists", "readOnly", "recordCount", "findingCount", "reviewedCount", "completedReviewCount", "matchedCount", "importBatchCount", "traceCompletenessCounts", "linkOutcomeCounts", "sourceContextCount", "createdAtUtc", "lastImportAtUtc", "lastOpenedAtUtc", "sqliteRuntimeVersion", "integrity", "foreignKeyErrors", "journalMode", "sizeBytes", "modifiedAtUtc", "pathMode", "errorCode"];
  return { ...Object.fromEntries(allowed.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]])), databaseIdentityHash: digest(value.databaseId), paths: "[masked]" };
}

export function safeAiAuditV043(database: Json | null) {
  if (!database) return null;
  return {
    snapshot: safeAiDatabaseDiagnosticV043(database.snapshot), embeddedDdl: database.embeddedDdl,
    batches: (database.batches ?? []).map((b: Json) => ({ idHash: digest(b.import_batch_id), schemaVersion: b.package_schema_version, reviewRank: b.review_rank, records: b.record_count, importedAt: b.imported_at, transactionStatus: b.transaction_status })),
    traces: (database.traces ?? []).map((t: Json) => ({ recordHash: digest(t.ai_record_id), completeness: t.trace_completeness_status, observedAt: t.observed_at })),
    links: (database.links ?? []).map((l: Json) => ({ recordHash: digest(l.ai_record_id), targetHash: digest(l.matched_activity_event_id), status: l.link_status, method: l.link_method, candidates: l.candidate_count, attemptedAt: l.attempted_at, error: l.link_status === "ERROR" ? "SOURCE_LINK_QUERY_FAILED" : null }))
  };
}
