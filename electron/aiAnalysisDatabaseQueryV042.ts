import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { buildAiFieldCatalogV042, fieldExpressionsV042, materializeFieldValuesV042, publicFieldCatalogV042 } from "./aiAnalysisFieldCatalogV042.js";

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
    if (filter.from && filter.to && filter.from > filter.to) throw new Error(`QUERY_DATE_RANGE_INVALID:${field}`);
    if (filter.to) { const inclusiveTo = /^\d{4}-\d{2}-\d{2}$/.test(filter.to) ? `${filter.to}T23:59:59.999` : filter.to; clauses.push(`${column}<=?`); values.push(inclusiveTo); applied.push(`${field}:to-inclusive`); }
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

const AI_JOINS = "FROM ai_records r JOIN ai_record_source_traces t ON t.ai_record_id=r.ai_record_id AND t.import_batch_id=(SELECT import_batch_id FROM ai_record_analyses WHERE analysis_id=r.active_analysis_id) JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id JOIN ai_import_batches b ON b.import_batch_id=a.import_batch_id LEFT JOIN ai_record_reviews rv ON rv.review_id=r.active_review_id LEFT JOIN source_link_attempts l ON l.link_attempt_id=(SELECT l2.link_attempt_id FROM source_link_attempts l2 WHERE l2.ai_record_id=r.ai_record_id ORDER BY l2.attempted_at DESC,l2.link_attempt_id DESC LIMIT 1) LEFT JOIN ai_skill_findings f ON f.analysis_id=a.analysis_id";

export function queryAiResultsV042(databasePath: string, input: Query = {}) {
  const started = Date.now(), query = normalize(input);
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    const catalog = buildAiFieldCatalogV042(db);
    const dynamicFields = fieldExpressionsV042(catalog);
    const fields = { ...AI_FIELDS, ...dynamicFields, ...Object.fromEntries(Object.entries(AI_FIELDS).map(([key, expression]) => [`computed.${key}`, expression])) };
    const where = whereOf(query.filters, fields), order = orderOf(query.sort, fields, "r.event_time DESC,r.ai_record_id");
    const catalogProjection = catalog.map((item) => `${item.expression} AS "_catalog__${item.path.replace(/"/g, '""')}"`).join(",");
    const totalCount = Number((db.prepare("SELECT COUNT(*) value FROM ai_records").get() as Json).value ?? 0);
    const filteredCount = Number((db.prepare(`SELECT COUNT(DISTINCT r.ai_record_id) value ${AI_JOINS} ${where.sql}`).get(...where.values) as Json).value ?? 0);
    const raw = rows(db.prepare(`SELECT ${catalogProjection},r.*,t.reference_json,t.diff_json,t.source_trace_json _source_trace_json,a.analysis_json _analysis_json,rv.review_json _review_json,(SELECT json_group_array(json(sf.finding_json)) FROM ai_skill_findings sf WHERE sf.analysis_id=a.analysis_id) _finding_json,a.analysis_status,a.confidence,json_extract(a.analysis_json,'$.rationale') rationale,COALESCE(rv.review_rank,'AI_ONLY') review_rank,GROUP_CONCAT(DISTINCT f.skill_id) skill_ids ${AI_JOINS} ${where.sql} GROUP BY r.ai_record_id ${order} LIMIT ? OFFSET ?`).all(...where.values, query.pageSize, (query.page - 1) * query.pageSize));
    const result = { rows: raw.map((row) => { const projected = projectAi(row); return { ...projected, fieldValues: materializeFieldValuesV042({ ...row, ...projected }) }; }), fieldCatalog: publicFieldCatalogV042(catalog), filteredCount, totalCount, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(filteredCount / query.pageSize)), durationMs: Date.now() - started, appliedFilters: where.applied };
    receipts.ai = { at: new Date().toISOString(), query, result: { filteredCount, totalCount, durationMs: result.durationMs } };
    return result;
  } finally { db.close(); }
}

export function distinctAiResultsV042(databasePath: string, fieldName: string, search = "", limit = 100) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON");
    const catalog = buildAiFieldCatalogV042(db);
    const field = AI_FIELDS[fieldName] ?? fieldExpressionsV042(catalog)[fieldName];
    if (!field) throw new Error(`QUERY_FIELD_NOT_ALLOWED:${fieldName}`);
    const boundedLimit = Math.min(100, Math.max(1, limit));
    const values = rows(db.prepare(`SELECT COALESCE(CAST(${field} AS TEXT),'') value,COUNT(DISTINCT r.ai_record_id) count ${AI_JOINS} WHERE CAST(${field} AS TEXT) LIKE ? GROUP BY value ORDER BY count DESC,value LIMIT ?`).all(`%${search}%`, boundedLimit));
    return { field: fieldName, values, truncated: values.length === boundedLimit };
  } finally { db.close(); }
}

function integratedCatalog(db: DatabaseSync, aiPath: string | null) {
  const catalog: Json[] = [];
  const fields: Record<string, string> = {};
  for (const [table, alias] of [["activity_events", "e"], ["source_objects", "o"]] as const) {
    for (const column of rows(db.prepare(`PRAGMA table_info(${table})`).all())) {
      const name = String(column.name), path = `raw.${table}.${name}`;
      fields[path] = `${alias}."${name.replace(/"/g, '""')}"`;
      catalog.push({ path, label: name.replace(/_/g, " "), group: "Raw", dataType: /INT|REAL|NUMERIC/i.test(String(column.type)) ? "number" : /(?:date|time|_at)$/i.test(name) ? "date" : "text", filterType: /INT|REAL|NUMERIC/i.test(String(column.type)) ? "number" : /(?:date|time|_at)$/i.test(name) ? "date" : "text", sortable: true, exportable: true, allNull: false });
    }
  }
  if (aiPath && fs.existsSync(aiPath)) {
    const ai = new DatabaseSync(aiPath, { readOnly: true });
    try {
      const aiCatalog = buildAiFieldCatalogV042(ai);
      const aiExpressions = fieldExpressionsV042(aiCatalog);
      for (const item of publicFieldCatalogV042(aiCatalog)) {
        const isLink = item.path.startsWith("sourceLink.");
        const path = isLink ? `link.${item.path.slice("sourceLink.".length)}` : `ai.${item.path}`;
        catalog.push({ ...item, path, group: isLink ? "Source Link" : "AI Analysis" });
        fields[path] = aiExpressions[item.path].replace("FROM ai_skill_findings", "FROM ai.ai_skill_findings");
      }
    } finally { ai.close(); }
  }
  return { catalog, fields };
}
function projectIntegrated(row: Json) {
  const projected: Json = {
    id: row.id, activityEventId: row.id, sourceRecordId: row.source_record_id, eventType: row.event_type, action: row.event_type,
    eventTime: row.event_time, actorAccountId: row.actor_account_id, displayName: row.actor_display_name, issueKey: row.issue_key,
    projectKey: String(row.issue_key ?? "").split("-")[0], fieldName: row.field_name, before: parse(row.from_value_json), after: parse(row.to_value_json),
    sourceProvenance: row.event_type, analysisState: row.ai_record_id ? "ANALYZED" : "UNANALYZED", analysisStatus: row.analysis_status,
    reviewRank: row.review_rank, sourceTraceStatus: row.source_trace_status, sourceLinkStatus: row.source_link_status,
    integrityStatus: row.integrity_status, confidence: row.confidence, rationale: row.rationale
  };
  const fieldValues: Json = {};
  for (const [key, value] of Object.entries(row)) {
    const match = /^_raw__(activity_events|source_objects)__(.+)$/.exec(key);
    if (match) fieldValues[`raw.${match[1]}.${match[2]}`] = value;
  }
  for (const [key, value] of Object.entries(materializeFieldValuesV042({ ...row, ...projected }))) {
    if (/^(raw|ai|link|computed)\./.test(key)) fieldValues[key] = value;
    else fieldValues[key.startsWith("sourceLink.") ? `link.${key.slice(11)}` : `ai.${key}`] = value;
  }
  for (const [key, value] of Object.entries(projected)) fieldValues[`computed.${key}`] = value;
  return { ...projected, fieldValues };
}
const RAW_REQUIRED: Record<string, string[]> = { activity_events: ["id", "source_object_id", "event_time", "actor_account_id", "actor_display_name", "field_name", "from_value_json", "to_value_json", "source_record_id"], source_objects: ["id", "issue_key"], database_metadata: ["database_id"] };
export function inspectRawSchemaV042(databasePath: string) {
  if (!databasePath || !fs.existsSync(databasePath)) return { ok: false as const, errorCode: "RAW_DATABASE_CLOSED", missing: ["database file"] };
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try { const missing: string[] = []; for (const [table, expected] of Object.entries(RAW_REQUIRED)) { const actual = new Set(rows(db.prepare(`PRAGMA table_info(${table})`).all()).map((row) => String(row.name))); for (const column of expected) if (!actual.has(column)) missing.push(`${table}.${column}`); } return missing.length ? { ok: false as const, errorCode: "QUERY_SCHEMA_ERROR", missing } : { ok: true as const, errorCode: "", missing: [] }; }
  finally { db.close(); }
}

export function queryIntegratedResultsV042(rawPath: string, aiPath: string | null, input: Query = {}) {
  const started = Date.now(), preflight = inspectRawSchemaV042(rawPath), query = normalize(input);
  if (!preflight.ok) return { ok: false, errorCode: preflight.errorCode, missingColumns: preflight.missing, rows: [], filteredCount: 0, totalCount: 0, page: query.page, pageSize: query.pageSize, pageCount: 1, integrationState: "BLOCKED_RAW_DB" };
  const hasAi = Boolean(aiPath && fs.existsSync(aiPath));
  const db = new DatabaseSync(rawPath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    if (hasAi) db.prepare("ATTACH DATABASE ? AS ai").run(aiPath as string);
    const dynamic = integratedCatalog(db, hasAi ? aiPath : null);
    const fields: Record<string, string> = { ...dynamic.fields, ...Object.fromEntries(Object.entries(dynamic.fields).map(([key, expression]) => [`computed.${key}`, expression])),  eventTime: "e.event_time", issueKey: "o.issue_key", projectKey: "substr(o.issue_key,1,instr(o.issue_key,'-')-1)", displayName: "COALESCE(e.actor_display_name,e.actor_account_id,'')", actor: "COALESCE(e.actor_display_name,e.actor_account_id,'')", fieldName: "e.field_name", field: "e.field_name", sourceProvenance: "e.event_type", source: "e.event_type", eventType: "e.event_type", action: "e.event_type", summary: "''", issueTypeName: "''", currentStatusName: "''", currentPriorityName: "''", before: "e.from_value_json", after: "e.to_value_json", diff: "e.to_value_json", historyId: "e.source_record_id", itemIndex: "0", analysisState: hasAi ? "CASE WHEN r.ai_record_id IS NULL THEN 'UNANALYZED' ELSE 'ANALYZED' END" : "'UNANALYZED'", analysisStatus: hasAi ? "a.analysis_status" : "NULL", reviewRank: hasAi ? "COALESCE(rv.review_rank,'AI_ONLY')" : "NULL", sourceTraceStatus: hasAi ? "r.source_trace_status" : "NULL", sourceLinkStatus: hasAi ? "COALESCE(r.source_link_status,'NOT_ATTEMPTED')" : "'NO_AI_DATABASE'", integrityStatus: hasAi ? "r.integrity_status" : "NULL", confidence: hasAi ? "a.confidence" : "NULL", rationale: hasAi ? "json_extract(a.analysis_json,'$.rationale')" : "NULL", skillId: "NULL" };
    const where = whereOf(query.filters, fields), order = orderOf(query.sort, fields, "e.event_time DESC,e.id");
    const dynamicProjection = Object.entries(dynamic.fields).map(([path, expression]) => `${expression.replace("FROM ai_skill_findings", "FROM ai.ai_skill_findings")} AS "_catalog__${path.replace(/"/g, '""')}"`).join(",");
    const joins = hasAi ? "FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id LEFT JOIN ai.ai_records r ON r.source_database_id=(SELECT database_id FROM database_metadata WHERE metadata_key='primary' LIMIT 1) AND r.activity_event_id=e.id AND r.source_link_status IN ('PRIMARY_MATCHED','FALLBACK_MATCHED') LEFT JOIN ai.ai_record_analyses a ON a.analysis_id=r.active_analysis_id LEFT JOIN ai.ai_record_source_traces t ON t.ai_record_id=r.ai_record_id AND t.import_batch_id=a.import_batch_id LEFT JOIN ai.ai_import_batches b ON b.import_batch_id=a.import_batch_id LEFT JOIN ai.ai_record_reviews rv ON rv.review_id=r.active_review_id LEFT JOIN ai.source_link_attempts l ON l.link_attempt_id=(SELECT l2.link_attempt_id FROM ai.source_link_attempts l2 WHERE l2.ai_record_id=r.ai_record_id ORDER BY l2.attempted_at DESC,l2.link_attempt_id DESC LIMIT 1)" : "FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id";
    const rawDatabaseIdentity = String((db.prepare("SELECT database_id value FROM database_metadata WHERE metadata_key='primary' LIMIT 1").get() as Json).value ?? "");
    const totalCount = Number((db.prepare("SELECT COUNT(*) value FROM activity_events").get() as Json).value ?? 0);
    const filteredCount = Number((db.prepare(`SELECT COUNT(*) value ${joins} ${where.sql}`).get(...where.values) as Json).value ?? 0);
    const rawProjection = rows(db.prepare("PRAGMA table_info(activity_events)").all()).map((column) => `e."${String(column.name).replace(/"/g, '""')}" AS "_raw__activity_events__${String(column.name)}"`).concat(rows(db.prepare("PRAGMA table_info(source_objects)").all()).map((column) => `o."${String(column.name).replace(/"/g, '""')}" AS "_raw__source_objects__${String(column.name)}"`)).join(",");
    const aiColumns = hasAi ? ",r.ai_record_id,a.analysis_status,a.confidence,COALESCE(rv.review_rank,'AI_ONLY') review_rank,r.source_trace_status,r.source_link_status,r.integrity_status,json_extract(a.analysis_json,'$.rationale') rationale,t.source_trace_json _source_trace_json,a.analysis_json _analysis_json,rv.review_json _review_json,(SELECT json_group_array(json(sf.finding_json)) FROM ai.ai_skill_findings sf WHERE sf.analysis_id=a.analysis_id) _finding_json" : ",NULL ai_record_id,NULL analysis_status,NULL confidence,NULL review_rank,NULL source_trace_status,'NO_AI_DATABASE' source_link_status,NULL integrity_status,NULL rationale";
    const resultRows = rows(db.prepare(`SELECT e.id,e.source_record_id,e.event_type,e.event_time,e.actor_account_id,e.actor_display_name,e.field_id,e.field_name,e.from_value_json,e.to_value_json,o.issue_key,${rawProjection},${dynamicProjection} ${aiColumns} ${joins} ${where.sql} ${order} LIMIT ? OFFSET ?`).all(...where.values, query.pageSize, (query.page - 1) * query.pageSize)).map(projectIntegrated);
    const aiRecordCount = hasAi ? Number((db.prepare("SELECT COUNT(*) value FROM ai.ai_records").get() as Json).value ?? 0) : 0;
    const matchedCount = hasAi
      ? Number((db.prepare(`SELECT COUNT(DISTINCT CASE WHEN r.ai_record_id IS NOT NULL THEN e.id END) value ${joins}`).get() as Json).value ?? 0)
      : 0;
    const integrationState = !hasAi ? "AI_DATABASE_CLOSED" : aiRecordCount === 0 ? "READY_NO_AI_RECORDS" : matchedCount === 0 ? "READY_NO_MATCH" : "READY";
    const result = { ok: true, rows: resultRows, fieldCatalog: dynamic.catalog, filteredCount, totalCount, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(filteredCount / query.pageSize)), durationMs: Date.now() - started, appliedFilters: where.applied, aiRecordCount, matchedCount, integrationState, rawDatabaseIdentity };
    receipts.integrated = { at: new Date().toISOString(), query, result: { filteredCount, totalCount, durationMs: result.durationMs, integrationState } };
    return result;
  } finally { if (hasAi) try { db.exec("DETACH DATABASE ai"); } catch { /* best effort */ } db.close(); }
}

export function latestAiQueryDiagnosticsV042() { return { ...receipts }; }
