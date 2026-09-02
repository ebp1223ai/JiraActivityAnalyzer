import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Json = Record<string, any>;
type Query = { page?: number; pageSize?: number; sort?: { field?: string; direction?: string } | null; filters?: Record<string, { text?: string; values?: string[]; from?: string; to?: string; min?: number; max?: number }> };
const rows = (value: unknown) => value as Json[];
const receipts: Record<string, unknown> = {};

const AI_FIELDS: Record<string, string> = {
  eventTime: "r.event_time", issueKey: "r.issue_key", projectKey: "json_extract(t.reference_json,'$.projectKey')",
  displayName: "json_extract(t.reference_json,'$.actor.displayValue')", fieldName: "r.field_name",
  sourceProvenance: "json_extract(t.reference_json,'$.sourceProvenance')", source: "json_extract(t.reference_json,'$.sourceProvenance')", eventType: "json_extract(t.reference_json,'$.sourceProvenance')", action: "json_extract(t.reference_json,'$.sourceProvenance')",
  actor: "json_extract(t.reference_json,'$.actor.displayValue')", field: "r.field_name", summary: "json_extract(t.reference_json,'$.summary')", issueTypeName: "json_extract(t.reference_json,'$.issueTypeName')", currentStatusName: "json_extract(t.reference_json,'$.currentStatusName')", currentPriorityName: "json_extract(t.reference_json,'$.currentPriorityName')", before: "json_extract(t.diff_json,'$.before')", after: "json_extract(t.diff_json,'$.after')", diff: "json_extract(t.diff_json,'$.diffText')", historyId: "json_extract(t.reference_json,'$.historyId')", itemIndex: "json_extract(t.reference_json,'$.historyItemIndex')",
  analysisStatus: "a.analysis_status", reviewRank: "COALESCE(rv.review_rank,'AI_ONLY')", sourceTraceStatus: "r.source_trace_status",
  sourceLinkStatus: "r.source_link_status", integrityStatus: "r.integrity_status", skillId: "f.skill_id", confidence: "a.confidence", rationale: "json_extract(a.analysis_json,'$.rationale')"
};

function normalize(input: Query) {
  const page = Number(input.page ?? 1), pageSize = Number(input.pageSize ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) throw new Error("QUERY_PAGE_INVALID");
  if (![25, 50, 100, 200].includes(pageSize)) throw new Error("QUERY_PAGE_SIZE_INVALID");
  return { page, pageSize, sort: input.sort ?? null, filters: input.filters ?? {} };
}

function whereOf(filters: NonNullable<Query["filters"]>, fields: Record<string, string>) {
  const clauses: string[] = [], values: Array<string | number> = [], applied: string[] = [];
  for (const [field, filter] of Object.entries(filters)) {
    const column = fields[field];
    if (!column) throw new Error(`QUERY_FIELD_NOT_ALLOWED:${field}`);
    if (filter.text) { clauses.push(`${column} LIKE ? ESCAPE '\\'`); values.push(`%${filter.text.replace(/[\\%_]/g, "\\$&")}%`); applied.push(`${field}:text`); }
    if (filter.values?.length) { if (filter.values.length > 100) throw new Error("QUERY_FILTER_VALUES_INVALID"); clauses.push(`${column} IN (${filter.values.map(() => "?").join(",")})`); values.push(...filter.values); applied.push(`${field}:values`); }
    if (filter.from) { clauses.push(`${column}>=?`); values.push(filter.from); applied.push(`${field}:from`); }
    if (filter.to) { clauses.push(`${column}<?`); values.push(filter.to); applied.push(`${field}:to`); }
    if (filter.min !== undefined) { clauses.push(`${column}>=?`); values.push(filter.min); applied.push(`${field}:min`); }
    if (filter.max !== undefined) { clauses.push(`${column}<=?`); values.push(filter.max); applied.push(`${field}:max`); }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values, applied };
}

function orderOf(sort: Query["sort"], fields: Record<string, string>, fallback: string) {
  if (!sort?.field) return `ORDER BY ${fallback}`;
  const field = fields[sort.field];
  if (!field) throw new Error(`QUERY_SORT_FIELD_NOT_ALLOWED:${sort.field}`);
  return `ORDER BY ${field} ${sort.direction === "asc" ? "ASC" : "DESC"}`;
}

function parse(value: unknown) { try { return JSON.parse(String(value ?? "null")); } catch { return null; } }
function projectAi(row: Json) {
  const reference = parse(row.reference_json) ?? {}, diff = parse(row.diff_json) ?? {};
  return {
    id: row.ai_record_id, activityEventId: row.activity_event_id, sourceRecordId: row.source_record_stable_id,
    eventTime: row.event_time, displayName: reference.actor?.displayValue ?? reference.actor?.stableIdentity ?? "—",
    actorAccountId: reference.actor?.stableIdentity ?? "", issueKey: row.issue_key, projectKey: reference.projectKey ?? "",
    eventType: reference.sourceProvenance ?? "ai_analysis", action: reference.sourceProvenance ?? "AI Analysis", fieldName: row.field_name,
    before: diff.before ?? diff.beforeValue ?? null, after: diff.after ?? diff.afterValue ?? null, diff, diffText: diff.diffText ?? "",
    sourceProvenance: reference.sourceProvenance ?? "pending_analysis", analysisStatus: row.analysis_status,
    reviewRank: row.review_rank, sourceTraceStatus: row.source_trace_status, sourceLinkStatus: row.source_link_status,
    integrityStatus: row.integrity_status, confidence: row.confidence, rationale: row.rationale, skillIds: row.skill_ids ?? ""
  };
}

const AI_JOINS = "FROM ai_records r JOIN ai_record_source_traces t ON t.source_trace_id=(SELECT t2.source_trace_id FROM ai_record_source_traces t2 WHERE t2.ai_record_id=r.ai_record_id ORDER BY t2.observed_at DESC LIMIT 1) JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id LEFT JOIN ai_record_reviews rv ON rv.review_id=r.active_review_id LEFT JOIN ai_skill_findings f ON f.analysis_id=a.analysis_id";

export function queryAiResultsV041(databasePath: string, input: Query = {}) {
  const started = Date.now(), query = normalize(input), where = whereOf(query.filters, AI_FIELDS), order = orderOf(query.sort, AI_FIELDS, "r.event_time DESC,r.ai_record_id");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    const totalCount = Number((db.prepare("SELECT COUNT(*) value FROM ai_records").get() as Json).value ?? 0);
    const filteredCount = Number((db.prepare(`SELECT COUNT(DISTINCT r.ai_record_id) value ${AI_JOINS} ${where.sql}`).get(...where.values) as Json).value ?? 0);
    const raw = rows(db.prepare(`SELECT r.*,t.reference_json,t.diff_json,a.analysis_status,a.confidence,json_extract(a.analysis_json,'$.rationale') rationale,COALESCE(rv.review_rank,'AI_ONLY') review_rank,GROUP_CONCAT(DISTINCT f.skill_id) skill_ids ${AI_JOINS} ${where.sql} GROUP BY r.ai_record_id ${order} LIMIT ? OFFSET ?`).all(...where.values, query.pageSize, (query.page - 1) * query.pageSize));
    const result = { rows: raw.map(projectAi), filteredCount, totalCount, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(filteredCount / query.pageSize)), durationMs: Date.now() - started, appliedFilters: where.applied };
    receipts.ai = { at: new Date().toISOString(), query, result: { filteredCount, totalCount, durationMs: result.durationMs } };
    return result;
  } finally { db.close(); }
}

export function distinctAiResultsV041(databasePath: string, fieldName: string, search = "", limit = 100) {
  const field = AI_FIELDS[fieldName];
  if (!field) throw new Error(`QUERY_FIELD_NOT_ALLOWED:${fieldName}`);
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try { db.exec("PRAGMA query_only=ON"); const values = rows(db.prepare(`SELECT COALESCE(CAST(${field} AS TEXT),'') value,COUNT(DISTINCT r.ai_record_id) count ${AI_JOINS} WHERE CAST(${field} AS TEXT) LIKE ? GROUP BY value ORDER BY count DESC,value LIMIT ?`).all(`%${search}%`, Math.min(100, Math.max(1, limit)))); return { field: fieldName, values, truncated: values.length === limit }; }
  finally { db.close(); }
}

const RAW_REQUIRED: Record<string, string[]> = { activity_events: ["id", "source_object_id", "event_time", "actor_account_id", "actor_display_name", "field_name", "from_value_json", "to_value_json", "source_record_id"], source_objects: ["source_object_id", "object_key"], database_metadata: ["database_id"] };
export function inspectRawSchemaV041(databasePath: string) {
  if (!databasePath || !fs.existsSync(databasePath)) return { ok: false as const, errorCode: "RAW_DATABASE_CLOSED", missing: ["database file"] };
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try { const missing: string[] = []; for (const [table, expected] of Object.entries(RAW_REQUIRED)) { const actual = new Set(rows(db.prepare(`PRAGMA table_info(${table})`).all()).map((row) => String(row.name))); for (const column of expected) if (!actual.has(column)) missing.push(`${table}.${column}`); } return missing.length ? { ok: false as const, errorCode: "QUERY_SCHEMA_ERROR", missing } : { ok: true as const, errorCode: "", missing: [] }; }
  finally { db.close(); }
}

export function queryIntegratedResultsV041(rawPath: string, aiPath: string | null, input: Query = {}) {
  const started = Date.now(), preflight = inspectRawSchemaV041(rawPath), query = normalize(input);
  if (!preflight.ok) return { ok: false, errorCode: preflight.errorCode, missingColumns: preflight.missing, rows: [], filteredCount: 0, totalCount: 0, page: query.page, pageSize: query.pageSize, pageCount: 1, integrationState: "BLOCKED_RAW_DB" };
  const hasAi = Boolean(aiPath && fs.existsSync(aiPath));
  const db = new DatabaseSync(rawPath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    if (hasAi) db.prepare("ATTACH DATABASE ? AS ai").run(aiPath as string);
    const fields: Record<string, string> = { eventTime: "e.event_time", issueKey: "o.object_key", projectKey: "substr(o.object_key,1,instr(o.object_key,'-')-1)", displayName: "COALESCE(e.actor_display_name,e.actor_account_id,'')", actor: "COALESCE(e.actor_display_name,e.actor_account_id,'')", fieldName: "e.field_name", field: "e.field_name", sourceProvenance: "e.event_type", source: "e.event_type", eventType: "e.event_type", action: "e.event_type", summary: "''", issueTypeName: "''", currentStatusName: "''", currentPriorityName: "''", before: "e.from_value_json", after: "e.to_value_json", diff: "e.to_value_json", historyId: "e.source_record_id", itemIndex: "0", analysisState: hasAi ? "CASE WHEN r.ai_record_id IS NULL THEN 'UNANALYZED' ELSE 'ANALYZED' END" : "'UNANALYZED'", analysisStatus: hasAi ? "a.analysis_status" : "NULL", reviewRank: hasAi ? "COALESCE(rv.review_rank,'AI_ONLY')" : "NULL", sourceTraceStatus: hasAi ? "r.source_trace_status" : "NULL", sourceLinkStatus: hasAi ? "COALESCE(r.source_link_status,'NOT_ATTEMPTED')" : "'NO_AI_DATABASE'", integrityStatus: hasAi ? "r.integrity_status" : "NULL", confidence: hasAi ? "a.confidence" : "NULL", rationale: hasAi ? "json_extract(a.analysis_json,'$.rationale')" : "NULL", skillId: "NULL" };
    const where = whereOf(query.filters, fields), order = orderOf(query.sort, fields, "e.event_time DESC,e.id");
    const joins = hasAi ? "FROM activity_events e JOIN source_objects o ON o.source_object_id=e.source_object_id LEFT JOIN ai.ai_records r ON r.source_database_id=(SELECT database_id FROM database_metadata LIMIT 1) AND r.activity_event_id=e.id AND r.source_link_status IN ('PRIMARY_MATCHED','FALLBACK_MATCHED') LEFT JOIN ai.ai_record_analyses a ON a.analysis_id=r.active_analysis_id LEFT JOIN ai.ai_record_reviews rv ON rv.review_id=r.active_review_id" : "FROM activity_events e JOIN source_objects o ON o.source_object_id=e.source_object_id";
    const rawDatabaseIdentity = String((db.prepare("SELECT database_id value FROM database_metadata LIMIT 1").get() as Json).value ?? "");
    const totalCount = Number((db.prepare("SELECT COUNT(*) value FROM activity_events").get() as Json).value ?? 0);
    const filteredCount = Number((db.prepare(`SELECT COUNT(*) value ${joins} ${where.sql}`).get(...where.values) as Json).value ?? 0);
    const aiColumns = hasAi ? ",r.ai_record_id,a.analysis_status,a.confidence,COALESCE(rv.review_rank,'AI_ONLY') review_rank,r.source_trace_status,r.source_link_status,r.integrity_status,json_extract(a.analysis_json,'$.rationale') rationale" : ",NULL ai_record_id,NULL analysis_status,NULL confidence,NULL review_rank,NULL source_trace_status,'NO_AI_DATABASE' source_link_status,NULL integrity_status,NULL rationale";
    const resultRows = rows(db.prepare(`SELECT e.id,e.source_record_id,e.event_type,e.event_time,e.actor_account_id,e.actor_display_name,e.field_id,e.field_name,e.from_value_json,e.to_value_json,o.object_key ${aiColumns} ${joins} ${where.sql} ${order} LIMIT ? OFFSET ?`).all(...where.values, query.pageSize, (query.page - 1) * query.pageSize)).map((row) => ({ id: row.id, activityEventId: row.id, sourceRecordId: row.source_record_id, eventType: row.event_type, action: row.event_type, eventTime: row.event_time, actorAccountId: row.actor_account_id, displayName: row.actor_display_name, issueKey: row.object_key, projectKey: String(row.object_key ?? "").split("-")[0], fieldName: row.field_name, before: parse(row.from_value_json), after: parse(row.to_value_json), sourceProvenance: row.event_type, analysisState: row.ai_record_id ? "ANALYZED" : "UNANALYZED", analysisStatus: row.analysis_status, reviewRank: row.review_rank, sourceTraceStatus: row.source_trace_status, sourceLinkStatus: row.source_link_status, integrityStatus: row.integrity_status, confidence: row.confidence, rationale: row.rationale }));
    const aiRecordCount = hasAi ? Number((db.prepare("SELECT COUNT(*) value FROM ai.ai_records").get() as Json).value ?? 0) : 0;
    const matchedCount = hasAi
      ? Number((db.prepare(`SELECT COUNT(DISTINCT e.id) value ${joins}`).get() as Json).value ?? 0)
      : 0;
    const integrationState = !hasAi ? "BLOCKED_AI_DB" : aiRecordCount === 0 ? "READY_NO_AI_RECORDS" : matchedCount === 0 ? "READY_NO_MATCH" : "READY";
    const result = { ok: true, rows: resultRows, filteredCount, totalCount, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(filteredCount / query.pageSize)), durationMs: Date.now() - started, appliedFilters: where.applied, aiRecordCount, matchedCount, integrationState, rawDatabaseIdentity };
    receipts.integrated = { at: new Date().toISOString(), query, result: { filteredCount, totalCount, durationMs: result.durationMs, integrationState } };
    return result;
  } finally { if (hasAi) try { db.exec("DETACH DATABASE ai"); } catch { /* best effort */ } db.close(); }
}

export function latestAiQueryDiagnosticsV041() { return { ...receipts }; }
