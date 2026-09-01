import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Scalar = string | number | null;
type Row = Record<string, unknown>;
export type QueryFilterOperator = "EQ" | "CONTAINS" | "IN" | "GTE" | "LT";
export type QueryFilter = { field: string; operator: QueryFilterOperator; value?: string | number; values?: Array<string | number> };
export type QuerySort = { field: string; direction: "asc" | "desc" };
export type StructuredQueryRequest = { page?: number; pageSize?: number; filters?: QueryFilter[]; sort?: QuerySort[]; visibleColumns?: string[] };
export type QueryReceipt = { kind: "AI_RESULTS" | "INTEGRATED_RESULTS"; requestedAtUtc: string; request: { page: number; pageSize: number; filters: QueryFilter[]; sort: QuerySort[] }; appliedFilters: string[]; durationMs: number; totalCount: number; filteredCount: number; errorCode: string };

const latestReceipts: Partial<Record<QueryReceipt["kind"], QueryReceipt>> = {};
const AI_FIELDS: Record<string, string> = {
  eventTime: "r.event_time_utc", actor: "r.actor_display_value", issueKey: "r.issue_key",
  fieldName: "r.field_name", aiStatus: "r.ai_status", effectiveStatus: "r.effective_status",
  reviewState: "r.review_state", linkStatus: "COALESCE(l.link_status,'NOT_ATTEMPTED')", skillId: "f.skill_id"
};
const INTEGRATED_FIELDS: Record<string, string> = {
  eventTime: "e.event_time", actor: "COALESCE(e.actor_display_name,e.actor_account_id,'')", issueKey: "o.issue_key",
  fieldName: "e.field_name", analysisState: "CASE WHEN r.ai_record_id IS NULL THEN 'UNANALYZED' ELSE 'ANALYZED' END",
  aiStatus: "r.ai_status", effectiveStatus: "r.effective_status", reviewState: "r.review_state",
  linkStatus: "CASE WHEN r.ai_record_id IS NULL THEN 'NO_AI_RECORD' ELSE COALESCE(l.link_status,'NOT_ATTEMPTED') END"
};
const OPERATORS = new Set<QueryFilterOperator>(["EQ", "CONTAINS", "IN", "GTE", "LT"]);

function rowList(value: unknown[]) { return value as Row[]; }
function normalizedRequest(input: StructuredQueryRequest) {
  const page = Number(input.page ?? 1), pageSize = Number(input.pageSize ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) throw new Error("QUERY_PAGE_INVALID");
  if (![25, 50, 100, 200, 500].includes(pageSize)) throw new Error("QUERY_PAGE_SIZE_INVALID");
  if (input.filters !== undefined && (!Array.isArray(input.filters) || input.filters.length > 50)) throw new Error("QUERY_FILTERS_INVALID");
  if (input.sort !== undefined && (!Array.isArray(input.sort) || input.sort.length > 3)) throw new Error("QUERY_SORT_INVALID");
  return { page, pageSize, filters: input.filters ?? [], sort: input.sort ?? [] };
}
function escapeLike(value: string) { return value.replace(/[\\%_]/g, (character) => "\\" + character); }
function buildWhere(filters: QueryFilter[], fields: Record<string, string>) {
  const clauses: string[] = [], values: Scalar[] = [], appliedFilters: string[] = [];
  for (const filter of filters) {
    const column = fields[filter.field];
    if (!column) throw new Error("QUERY_FIELD_NOT_ALLOWED:" + filter.field);
    if (!OPERATORS.has(filter.operator)) throw new Error("QUERY_OPERATOR_NOT_ALLOWED:" + filter.operator);
    if (filter.operator === "IN") {
      if (!Array.isArray(filter.values) || filter.values.length < 1 || filter.values.length > 100) throw new Error("QUERY_FILTER_VALUES_INVALID");
      clauses.push(column + " IN (" + filter.values.map(() => "?").join(",") + ")");
      values.push(...filter.values.map((value) => String(value)));
      appliedFilters.push(filter.field + " IN (" + filter.values.map(String).join(", ") + ")");
      continue;
    }
    if (filter.value === undefined || filter.value === null || String(filter.value).length > 2048) throw new Error("QUERY_FILTER_VALUE_INVALID");
    const value = String(filter.value);
    if (filter.operator === "CONTAINS") { clauses.push(column + " LIKE ? ESCAPE '\\'"); values.push("%" + escapeLike(value) + "%"); }
    else { clauses.push(column + (filter.operator === "EQ" ? "=" : filter.operator === "GTE" ? ">=" : "<") + "?"); values.push(value); }
    appliedFilters.push(filter.field + " " + filter.operator + " " + value);
  }
  return { sql: clauses.length ? "WHERE " + clauses.join(" AND ") : "", values, appliedFilters };
}
function buildOrder(sort: QuerySort[], fields: Record<string, string>, fallback: string) {
  if (!sort.length) return "ORDER BY " + fallback;
  return "ORDER BY " + sort.map((item) => {
    const column = fields[item.field];
    if (!column) throw new Error("QUERY_SORT_FIELD_NOT_ALLOWED:" + item.field);
    if (!["asc", "desc"].includes(item.direction)) throw new Error("QUERY_SORT_DIRECTION_NOT_ALLOWED:" + item.direction);
    return column + " " + item.direction.toUpperCase();
  }).join(", ");
}
function recordReceipt(kind: QueryReceipt["kind"], request: ReturnType<typeof normalizedRequest>, appliedFilters: string[], started: number, totalCount: number, filteredCount: number, errorCode = "") {
  const value: QueryReceipt = { kind, requestedAtUtc: new Date().toISOString(), request, appliedFilters, durationMs: Date.now() - started, totalCount, filteredCount, errorCode };
  latestReceipts[kind] = value;
  return value;
}

export function queryAiResultsV040(databasePath: string, input: StructuredQueryRequest = {}) {
  const started = Date.now(), request = normalizedRequest(input), where = buildWhere(request.filters, AI_FIELDS);
  const order = buildOrder(request.sort, AI_FIELDS, "r.event_time_utc DESC,r.ai_record_id");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    const joins = "FROM ai_analysis_records r LEFT JOIN ai_source_links l ON l.ai_record_id=r.ai_record_id LEFT JOIN ai_skill_findings f ON f.ai_record_id=r.ai_record_id";
    const totalCount = Number((db.prepare("SELECT COUNT(*) value FROM ai_analysis_records").get() as Row).value ?? 0);
    const filteredCount = Number((db.prepare("SELECT COUNT(DISTINCT r.ai_record_id) value " + joins + " " + where.sql).get(...where.values) as Row).value ?? 0);
    const offset = (request.page - 1) * request.pageSize;
    const sql = "SELECT r.ai_record_id,r.evidence_id,r.issue_key,r.project_key,r.field_name,r.event_time_utc,r.actor_display_value,r.ai_status,r.effective_status,r.review_state,r.is_human_verified,r.ai_confidence,r.ai_rationale,l.link_status,l.link_method,l.diagnostic_code,l.diagnostic_message,GROUP_CONCAT(DISTINCT f.skill_id) skill_ids " + joins + " " + where.sql + " GROUP BY r.ai_record_id " + order + " LIMIT ? OFFSET ?";
    const rows = rowList(db.prepare(sql).all(...where.values, request.pageSize, offset));
    const queryReceipt = recordReceipt("AI_RESULTS", request, where.appliedFilters, started, totalCount, filteredCount);
    return { totalCount, filteredCount, rows, page: request.page, pageSize: request.pageSize, durationMs: queryReceipt.durationMs, appliedFilters: where.appliedFilters };
  } catch (error) {
    recordReceipt("AI_RESULTS", request, where.appliedFilters, started, 0, 0, error instanceof Error ? error.message : "QUERY_ERROR");
    throw error;
  } finally { db.close(); }
}

const RAW_REQUIRED: Record<string, string[]> = {
  activity_events: ["id", "source_object_id", "event_time", "actor_account_id", "actor_display_name", "field_name", "from_value_json", "to_value_json"],
  source_objects: ["id", "issue_key"], database_metadata: ["database_id"]
};
export function inspectRawDatabaseSchema(databasePath: string) {
  if (!databasePath || !fs.existsSync(databasePath)) return { ok: false as const, errorCode: "RAW_DATABASE_CLOSED", missing: ["database file"] };
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const missing: string[] = [];
    for (const [table, columns] of Object.entries(RAW_REQUIRED)) {
      const actual = new Set(rowList(db.prepare("PRAGMA table_info(" + table + ")").all()).map((item) => String(item.name ?? "")));
      if (!actual.size) missing.push(table + ".*");
      else for (const column of columns) if (!actual.has(column)) missing.push(table + "." + column);
    }
    return missing.length ? { ok: false as const, errorCode: "QUERY_SCHEMA_ERROR", missing } : { ok: true as const, errorCode: "", missing: [] };
  } finally { db.close(); }
}

export function queryIntegratedResultsV040(sourceDatabasePath: string, aiDatabasePath: string | null, input: StructuredQueryRequest = {}) {
  const started = Date.now(), request = normalizedRequest(input), preflight = inspectRawDatabaseSchema(sourceDatabasePath);
  if (!preflight.ok) {
    recordReceipt("INTEGRATED_RESULTS", request, [], started, 0, 0, preflight.errorCode);
    return { ok: false as const, errorCode: preflight.errorCode, missingColumns: preflight.missing, totalCount: 0, filteredCount: 0, rows: [], durationMs: Date.now() - started, integrationState: preflight.errorCode === "RAW_DATABASE_CLOSED" ? "BLOCKED_RAW_DB" : "QUERY_SCHEMA_ERROR" };
  }
  const hasAi = Boolean(aiDatabasePath && fs.existsSync(aiDatabasePath));
  const db = new DatabaseSync(sourceDatabasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    if (hasAi) db.prepare("ATTACH DATABASE ? AS ai").run(aiDatabasePath as string);
    const integratedFields = hasAi ? INTEGRATED_FIELDS : { ...INTEGRATED_FIELDS, analysisState: "'UNANALYZED'", aiStatus: "NULL", effectiveStatus: "NULL", reviewState: "NULL", linkStatus: "'NO_AI_RECORD'" };
    const where = buildWhere(request.filters, integratedFields);
    const order = buildOrder(request.sort, integratedFields, "e.event_time DESC,e.id");
    const aiColumns = hasAi ? "r.ai_record_id,r.ai_status,r.effective_status,r.review_state,r.ai_confidence,r.ai_rationale,l.link_status" : "NULL ai_record_id,NULL ai_status,NULL effective_status,NULL review_state,NULL ai_confidence,NULL ai_rationale,NULL link_status";
    const joins = hasAi
      ? "FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id LEFT JOIN ai.ai_source_links l ON l.link_status='MATCHED' AND l.matched_source_database_id=(SELECT database_id FROM database_metadata LIMIT 1) AND l.matched_activity_event_id=e.id LEFT JOIN ai.ai_analysis_records r ON r.ai_record_id=l.ai_record_id"
      : "FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id";
    const totalCount = Number((db.prepare("SELECT COUNT(*) value FROM activity_events").get() as Row).value ?? 0);
    const filteredCount = Number((db.prepare("SELECT COUNT(*) value " + joins + " " + where.sql).get(...where.values) as Row).value ?? 0);
    const offset = (request.page - 1) * request.pageSize;
    const sql = "SELECT e.id activity_event_id,o.issue_key,e.event_time,e.actor_account_id,e.actor_display_name,e.field_name,e.from_value_json,e.to_value_json,CASE WHEN " + (hasAi ? "r.ai_record_id" : "NULL") + " IS NULL THEN 'UNANALYZED' ELSE 'ANALYZED' END analysis_state," + aiColumns + " " + joins + " " + where.sql + " " + order + " LIMIT ? OFFSET ?";
    const rows = rowList(db.prepare(sql).all(...where.values, request.pageSize, offset));
    const matchedCount = hasAi ? Number((db.prepare("SELECT COUNT(*) value FROM ai.ai_source_links WHERE link_status='MATCHED' AND matched_source_database_id=(SELECT database_id FROM database_metadata LIMIT 1)").get() as Row).value ?? 0) : 0;
    const aiRecordCount = hasAi ? Number((db.prepare("SELECT COUNT(*) value FROM ai.ai_analysis_records").get() as Row).value ?? 0) : 0;
    const integrationState = !hasAi ? "BLOCKED_AI_DB" : matchedCount === 0 ? "READY_NO_MATCH" : matchedCount < aiRecordCount ? "READY_PARTIAL" : "READY";
    const queryReceipt = recordReceipt("INTEGRATED_RESULTS", request, where.appliedFilters, started, totalCount, filteredCount);
    return { ok: true as const, totalCount, filteredCount, rows, page: request.page, pageSize: request.pageSize, durationMs: queryReceipt.durationMs, appliedFilters: where.appliedFilters, matchedCount, aiRecordCount, integrationState };
  } catch (error) {
    const errorCode = error instanceof Error && error.message.startsWith("QUERY_") ? error.message : "QUERY_ERROR";
    recordReceipt("INTEGRATED_RESULTS", request, [], started, 0, 0, errorCode);
    return { ok: false as const, errorCode, message: error instanceof Error ? error.message : String(error), totalCount: 0, filteredCount: 0, rows: [], durationMs: Date.now() - started, integrationState: "QUERY_ERROR" };
  } finally {
    if (hasAi) try { db.exec("DETACH DATABASE ai"); } catch { /* Attachment may already be closed. */ }
    db.close();
  }
}
export function latestAiDatabaseQueryDiagnostics() { return { ...latestReceipts }; }
