import { DatabaseSync } from "node:sqlite";

type Json = Record<string, any>;
export type FieldCatalogEntryV042 = {
  path: string;
  label: string;
  group: "AI Record" | "Source Trace" | "AI Analysis" | "Skill Findings" | "Manual Review" | "Source Link" | "Import Batch" | "Raw" | "Computed";
  dataType: "text" | "number" | "boolean" | "date" | "json";
  filterType: "text" | "number" | "multi" | "date";
  sortable: boolean;
  exportable: boolean;
  allNull: boolean;
};

type InternalField = FieldCatalogEntryV042 & { expression: string };
const rows = (value: unknown) => value as Json[];
const safeColumn = (value: string) => `"${value.replace(/"/g, '""')}"`;
const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
const title = (path: string) => path.split(".").at(-1)?.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ") ?? path;
const temporal = (path: string) => /(?:^|[._])(date|time|timestamp|createdAt|updatedAt|reviewedAt|observedAt|importedAt|attemptedAt|completedAt)(?:$|[._])/i.test(path);
const groupFor = (namespace: string): FieldCatalogEntryV042["group"] => ({ aiRecord: "AI Record", sourceTrace: "Source Trace", aiAnalysis: "AI Analysis", skillFindings: "Skill Findings", manualReview: "Manual Review", sourceLink: "Source Link", importBatch: "Import Batch", raw: "Raw", computed: "Computed" } as const)[namespace] ?? "Computed";

function typeOf(path: string, sqliteType = "", jsonType = "") {
  if (temporal(path)) return { dataType: "date" as const, filterType: "date" as const };
  if (/INT|REAL|NUMERIC|DOUBLE|FLOAT/i.test(sqliteType) || ["integer", "real"].includes(jsonType)) return { dataType: "number" as const, filterType: "number" as const };
  if (jsonType === "true" || jsonType === "false" || /BOOL/i.test(sqliteType)) return { dataType: "boolean" as const, filterType: "multi" as const };
  if (["array", "object"].includes(jsonType)) return { dataType: "json" as const, filterType: "text" as const };
  return { dataType: "text" as const, filterType: "text" as const };
}

function put(map: Map<string, InternalField>, path: string, expression: string, sqliteType = "", jsonType = "", allNull = false, sortable = true) {
  const namespace = path.split(".")[0].replace(/\[\]$/, "");
  map.set(path, { path, label: title(path), group: groupFor(namespace), ...typeOf(path, sqliteType, jsonType), sortable, exportable: true, allNull, expression });
}

function tableColumns(db: DatabaseSync, map: Map<string, InternalField>, table: string, alias: string, namespace: string) {
  for (const column of rows(db.prepare(`PRAGMA table_info(${table})`).all())) {
    const name = String(column.name);
    const allNull = Number((db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${safeColumn(name)} IS NOT NULL`).get() as Json).count ?? 0) === 0;
    put(map, `${namespace}.${name}`, `${alias}.${safeColumn(name)}`, String(column.type ?? ""), "", allNull);
  }
}

function jsonFields(db: DatabaseSync, map: Map<string, InternalField>, table: string, alias: string, idColumn: string, jsonColumn: string, namespace: string, basePath: string) {
  if (!rows(db.prepare(`PRAGMA table_info(${table})`).all()).some((column) => column.name === jsonColumn)) return;
  const discovered = rows(db.prepare(`SELECT jt.fullkey fullkey,jt.type type,COUNT(jt.atom) non_null
    FROM ${table} src,json_tree(src.${safeColumn(jsonColumn)}) jt
    WHERE jt.fullkey <> '$'
    GROUP BY jt.fullkey,jt.type`).all());
  for (const item of discovered) {
    const rawPath = String(item.fullkey).replace(/^\$\.?/, "").replace(/\[\d+\]/g, "[]").replace(/\."([^"]+)"/g, ".$1").replace(/^"([^"]+)"/, "$1");
    if (!rawPath) continue;
    const path = `${basePath}.${rawPath}`;
    const jsonPath = String(item.fullkey);
    const extracted = `json_extract(${alias}.${safeColumn(jsonColumn)},${sqlLiteral(jsonPath)})`;
    const expression = alias === "sf" ? `(SELECT GROUP_CONCAT(DISTINCT json_extract(sf.finding_json,${sqlLiteral(jsonPath)})) FROM ai_skill_findings sf WHERE sf.analysis_id=a.analysis_id)` : extracted;
    put(map, path, expression, "", String(item.type), Number(item.non_null ?? 0) === 0, !path.includes("[]"));
  }
}

export function buildAiFieldCatalogV042(db: DatabaseSync) {
  const map = new Map<string, InternalField>();
  tableColumns(db, map, "ai_records", "r", "aiRecord");
  tableColumns(db, map, "ai_import_batches", "b", "importBatch");
  tableColumns(db, map, "source_link_attempts", "l", "sourceLink");
  jsonFields(db, map, "ai_record_source_traces", "t", "source_trace_id", "source_trace_json", "sourceTrace", "sourceTrace");
  jsonFields(db, map, "ai_record_analyses", "a", "analysis_id", "analysis_json", "aiAnalysis", "aiAnalysis");
  jsonFields(db, map, "ai_record_reviews", "rv", "review_id", "review_json", "manualReview", "manualReview");
  jsonFields(db, map, "ai_skill_findings", "sf", "finding_id", "finding_json", "skillFindings", "skillFindings[]");
  for (const [path, expression] of Object.entries({
    eventTime: "r.event_time", issueKey: "r.issue_key", projectKey: "json_extract(t.reference_json,'$.projectKey')", displayName: "json_extract(t.reference_json,'$.actor.displayValue')", fieldName: "r.field_name",
    analysisStatus: "a.analysis_status", reviewRank: "COALESCE(rv.review_rank,'AI_ONLY')", sourceTraceStatus: "r.source_trace_status", sourceLinkStatus: "r.source_link_status", integrityStatus: "r.integrity_status", confidence: "a.confidence", rationale: "json_extract(a.analysis_json,'$.rationale')"
  })) put(map, `computed.${path}`, expression, path === "confidence" ? "REAL" : "", "", false);
  return [...map.values()].sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path));
}

export function publicFieldCatalogV042(fields: InternalField[]) {
  return fields.map(({ expression: _expression, ...field }) => field);
}

export function fieldExpressionsV042(fields: InternalField[]) {
  return Object.fromEntries(fields.map((field) => [field.path, field.expression]));
}

function parse(value: unknown) { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; } }
function flatten(value: unknown, prefix: string, output: Json) {
  if (Array.isArray(value)) {
    output[`${prefix}[]`] = value;
    const keys = new Set(value.flatMap((item) => item && typeof item === "object" ? Object.keys(item) : []));
    for (const key of keys) flatten(value.map((item) => item?.[key]).filter((item) => item !== undefined), `${prefix}[].${key}`, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Json)) flatten(child, prefix ? `${prefix}.${key}` : key, output);
    return;
  }
  output[prefix] = value;
}

export function materializeFieldValuesV042(row: Json) {
  const output: Json = {};
  for (const [key, value] of Object.entries(row)) if (key.startsWith("_catalog__")) output[key.slice("_catalog__".length)] = value;
  flatten(parse(row._source_trace_json), "sourceTrace", output);
  flatten(parse(row._analysis_json), "aiAnalysis", output);
  flatten(parse(row._review_json), "manualReview", output);
  flatten(parse(row._finding_json), "skillFindings", output);
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("_")) continue;
    output[`computed.${key}`] = value;
  }
  return output;
}
