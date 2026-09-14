import fs from "./businessIoDiagnosticsV044.js";
import { createHash } from "node:crypto";
import { descriptionDisplayV047, DISPLAY_POLICY_V047 } from "../shared/integratedDisplayV047.js";
import { presentationMetricsV046 } from "../shared/activityPresentationV046.js";
import { createFieldDiscoveryV044, indexFieldsV044, materializeRowV044, queryStageV044 } from "./aiResultsIndexV044.js";
import { DatabaseSync } from "node:sqlite";
import { readProjectionV049, closeReadProjectionsV049, type ProjectionBuildOptionsV049 } from './readProjectionV049.js';
export { configureReadProjectionV049 } from './readProjectionV049.js';
import { databaseRevisionV045, closeDatabaseRevisionsV045 } from './databaseRevisionV045.js';
import { projectActiveAiV043 } from "../shared/aiResultProjectionV043.js";
import { fieldIdV043, registerDocumentV043, resolveFieldV043, typedValueV043, type FieldV043 } from "./aiFieldRegistryV043.js";

type Json = Record<string, any>;
export type QueryV043 = { page?: number; pageSize?: number; sort?: { field?: string; direction?: string } | null; filters?: Record<string, Json>; timeZone?: string; diffQuickFilters?: Json; visibleFields?: string[] };
export type Snapshot = { indexed: Set<string>; db: DatabaseSync; registry: Map<string, FieldV043>; total: number; key: string; metadata: Json; disk?: boolean; hydrate?: (ids: string[]) => Json[]; persistIndex?: () => void };
const cache = new Map<string, Snapshot>();
const receipts: Json = {};
const facetCacheV049 = new WeakMap<Snapshot, Map<string, any>>();
const parse = (value: any) => value == null ? null : JSON.parse(String(value));
const fileKey = databaseRevisionV045;
const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
export function invalidateAiResultsV043(closeRevisions = true) { for (const snapshot of cache.values()) snapshot.db.close(); cache.clear(); closeReadProjectionsV049(); if (closeRevisions) closeDatabaseRevisionsV045(); }

function aiJoin(prefix = "") {
  return `FROM ${prefix}ai_records r JOIN ${prefix}ai_record_analyses a ON a.analysis_id=r.active_analysis_id
    JOIN ${prefix}ai_record_source_traces t ON t.ai_record_id=r.ai_record_id AND t.import_batch_id=a.import_batch_id
    JOIN ${prefix}ai_import_batches b ON b.import_batch_id=a.import_batch_id
    LEFT JOIN ${prefix}ai_record_reviews rv ON rv.review_id=r.active_review_id AND rv.analysis_id=a.analysis_id
    LEFT JOIN ${prefix}source_link_attempts l ON l.rowid=(SELECT MAX(l2.rowid) FROM ${prefix}source_link_attempts l2 WHERE l2.ai_record_id=r.ai_record_id)`;
}
function jsonColumns(db: DatabaseSync, table: string, alias: string) {
  return `json_object(${(db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Json[]).flatMap(c => [`'${String(c.name).replace(/'/g, "''")}'`, `${alias}.${quote(c.name)}`]).join(",")})`;
}
function seedSchema(registry: Map<string, FieldV043>, db: DatabaseSync, namespace: string, tables: string[]) {
  for (const table of tables) {
    const fields = Object.fromEntries((db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Json[]).map(c => [c.name, null]));
    registerDocumentV043(registry, { [namespace]: { [table]: fields } });
  }
}
function createSnapshot(kind: "ai" | "integrated", aiPath: string | null, rawPath: string | null, options?: ProjectionBuildOptionsV049): Snapshot {
  if (aiPath && !fs.existsSync(aiPath)) throw new Error("AI_DATABASE_UNAVAILABLE");
  const key = `${DISPLAY_POLICY_V047}|${kind}|${fileKey(aiPath)}|${fileKey(rawPath)}`;
  const existing = !options && cache.get(key); if (existing) { queryStageV044("cache-hit", "START"); queryStageV044("cache-hit", "END"); return existing; }
  if (!options) for (const [oldKey, old] of cache) { old.db.close(); cache.delete(oldKey); queryStageV044('cache-released', 'POINT', { reason: 'CONTENT_CHANGED_OR_DATABASE_SWITCH', rowCount: old.total }); }
  queryStageV044("snapshot-build", "START", { stages: ["source-read", "mapping", "complete-field-discovery"], rawPath, aiPath, pathPolicy: "operator-selected-databases-read-only" });
  queryStageV044("source-read", "START", { mode: "streaming-iterator", paths: [rawPath, aiPath], bindings: "schema-derived identifiers; no literal Jira values" });
  queryStageV044("mapping-aggregation", "START", { mode: "streaming-overlap-with-source-read" });
  queryStageV044("field-discovery", "START", { scope: "all-rows", mode: "streaming-overlap-with-mapping" });
  const db = new DatabaseSync(options?.file ?? ":memory:");
  if (options?.file) db.exec('PRAGMA cache_size=-8192; PRAGMA temp_store=FILE');
  const registry = new Map<string, FieldV043>();
  db.exec("CREATE TABLE documents(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE projections(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE cells(row_id TEXT NOT NULL,field_id TEXT NOT NULL,token TEXT NOT NULL,kind TEXT NOT NULL,text TEXT,number REAL, UNIQUE(row_id,field_id,token)); BEGIN");
  registerDocumentV043(registry, { computed: Object.fromEntries(["eventTime", "issueKey", "projectKey", "displayName", "fieldName", "eventType", "action", "sourceProvenance", "before", "after", "diffText", "analysisStatus", "reviewRank", "sourceLinkStatus", "sourceTraceStatus", "integrityStatus", "skillId", "confidence", "rationale", "summary", "issueTypeName", "currentStatusName", "currentPriorityName", "historyId", "itemIndex"].map(key => [key, null])) });
  registerDocumentV043(registry, { computed: { manual: { state: null } } });
  const insertRow = db.prepare("INSERT INTO documents VALUES(?,?)"), insertProjection = db.prepare("INSERT INTO projections VALUES(?,?)"), insertCell = db.prepare("INSERT OR IGNORE INTO cells VALUES(?,?,?,?,?,?)");
  let total = 0;
  const discover = createFieldDiscoveryV044(registry);
  let lastProgress = performance.now();
  const eventField = fieldIdV043("computed", ["eventTime"]);
  const metricCache = new Map<string, ReturnType<typeof presentationMetricsV046>>();
  let totalGuardCount = 0, diffComputations = 0, diffMs = 0;
  const guardSampleLimit = 20;
  const add = (row: Json, doc: Json) => {
    const reusable = !row.aiRecordId && typeof row.before === "string" && typeof row.after === "string" && row.before.length + row.after.length < 4096;
    const metricKey = reusable ? JSON.stringify([row.fieldId, row.fieldName, row.eventType, row.before, row.after]) : "";
    let metrics = metricKey ? metricCache.get(metricKey) : undefined;
    if (!metrics) {
      metrics = descriptionDisplayV047(row, text => createHash('sha256').update(text).digest('hex'));
      diffComputations += (metrics as Json).diffComputationCount ?? 0; diffMs += (metrics as Json).diffComputationMs ?? 0;
      if (metricKey && (metrics as Json).diffStatus !== 'GUARD') { if (metricCache.size >= 128) metricCache.delete(metricCache.keys().next().value!); metricCache.set(metricKey, metrics); }
    }
    Object.assign(row, metrics);
    if (row.diffStatus === 'GUARD') {
      totalGuardCount++;
      if (totalGuardCount <= guardSampleLimit) queryStageV044('description-diff-guard', 'POINT', { ...row.diffDiagnostic, activityEventId:row.activityEventId ?? row.id, aiRecordId:row.aiRecordId ?? null, analysisId:row.analysisId ?? null, displaySourceKind:row.displaySourceKind, processed:total, sample:totalGuardCount });
    }
    // Stack/inputs belong to bounded diagnostics, not the indexed/exported document.
    delete row.diffDiagnostic;
    discover(doc);
    const v = typedValueV043(row.eventTime);
    if (options?.summaryOnly) { const epoch = Date.parse(row.eventTime); v.number = Number.isFinite(epoch) ? epoch : null; }
    insertCell.run(row.id, eventField, v.token, v.kind, v.text, v.number);
    const summary = Object.fromEntries(Object.entries(row).filter(([key, value]) => !['before','after','diffText','rationale'].includes(key) && (value === null || ['string','number','boolean'].includes(typeof value))));
    if (options?.summaryOnly) {
      Object.assign(summary, { skillId: row.skillId, skillIds: row.skillIds, skillFindings: row.skillFindings?.map((f: Json) => ({ skillId: f.skillId, skillName: f.skillName })), manual: row.manual ? { state: row.manual.state, provisional: row.manual.provisional, confirmed: row.manual.confirmed.map((f: Json) => ({ skillId: f.skillId })) } : undefined,
        rawEventId: row.activityEventId, sourceObjectId: doc.raw?.activity_events?.source_object_id, eventIdentityHash: doc.raw?.activity_events?.event_identity_hash, activeReviewId: doc.ai?.ai_records?.active_review_id, activeSourceLinkAttemptId: doc.link?.source_link_attempts?.link_attempt_id });
    }
    insertRow.run(row.id, JSON.stringify({ document: options?.summaryOnly ? { computed: summary } : doc }));
    insertProjection.run(row.id, JSON.stringify({ computed: Object.fromEntries(Object.entries(row).filter(([key, value]) => !["before", "after", "diffText", "rationale"].includes(key) && (value === null || ["string", "number", "boolean"].includes(typeof value)))) })); total++;
    if (performance.now() - lastProgress > 500) { queryStageV044("snapshot-build", "PROGRESS", { processed: total, total: null, rssBytes: process.memoryUsage().rss }); lastProgress = performance.now(); }
  };
  const aiRows = new Map<string, { row: Json; document: Json }>();
  let rawIdentity = "", matched = 0, ambiguous = 0;
  try {
    if (aiPath && fs.existsSync(aiPath)) {
      const source = new DatabaseSync(aiPath, { readOnly: true });
      try {
        source.exec("PRAGMA query_only=ON; BEGIN");
        seedSchema(registry, source, "ai", ["ai_records", "ai_record_analyses", "ai_record_reviews", "ai_import_batches", "ai_skill_findings", "ai_record_source_traces"]);
        seedSchema(registry, source, "link", ["source_link_attempts"]);
        const select = ["r", "a", "t", "b", "rv", "l"].map((alias, i) => `${jsonColumns(source, ["ai_records", "ai_record_analyses", "ai_record_source_traces", "ai_import_batches", "ai_record_reviews", "source_link_attempts"][i], alias)} ${alias}`).join(",");
        const aiScope = options?.ids ? ` WHERE ${kind==='ai'?'r.ai_record_id':'l.matched_activity_event_id'} IN (${options.ids.map(()=>'?').join(',')})` : '';
        for (const raw of source.prepare(`SELECT ${select},(SELECT json_group_array(json(f.finding_json)) FROM ai_skill_findings f WHERE f.analysis_id=a.analysis_id) findings ${aiJoin()}${aiScope}`).iterate(...(options?.ids ?? [])) as Iterable<Json>) {
          const r = parse(raw.r), a = parse(raw.a), t = parse(raw.t), b = parse(raw.b), rv = parse(raw.rv), l = parse(raw.l);
          const trace = parse(t.source_trace_json), analysis = parse(a.analysis_json), review = parse(rv.review_json), storedFindings = parse(raw.findings) as Json[];
          const findings = analysis.skillFindings.map((original: Json) => { const saved = storedFindings.find(f => f.skillId === original.skillId); if (!saved || JSON.stringify(saved) !== JSON.stringify(original)) throw new Error("ACTIVE_FINDING_PROJECTION_MISMATCH"); return saved; });
          if (findings.length !== storedFindings.length) throw new Error("ACTIVE_FINDING_COUNT_MISMATCH");
          const row = projectActiveAiV043(r, trace, analysis, review, findings, b, l.link_attempt_id ? l : null);
          const document = { ai: { ai_records: r, ai_record_analyses: a, ai_record_reviews: rv, ai_import_batches: b, sourceTrace: trace, analysis, manualReview: review, skillFindings: findings }, link: { source_link_attempts: l }, computed: row };
          aiRows.set(r.ai_record_id, { row, document });
        }
      } finally { source.close(); }
    }
    if (rawPath && fs.existsSync(rawPath)) {
      const raw = new DatabaseSync(rawPath, { readOnly: true });
      try {
        raw.exec("PRAGMA query_only=ON; BEGIN");
        rawIdentity = String((raw.prepare("SELECT database_id FROM database_metadata WHERE metadata_key='primary'").get() as Json)?.database_id ?? "");
        const hasCurrent = Boolean(raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='current_issue_snapshots'").get());
        seedSchema(registry, raw, "raw", ["activity_events", "source_objects", ...(hasCurrent ? ["current_issue_snapshots"] : [])]);
        const byTarget = new Map<string, Array<{ row: Json; document: Json }>>();
        for (const entry of aiRows.values()) {
          const l = entry.row.link;
          if (l?.raw_database_identity === rawIdentity && ["PRIMARY_MATCHED", "FALLBACK_MATCHED"].includes(l.link_status) && l.matched_activity_event_id) {
            const list = byTarget.get(l.matched_activity_event_id) ?? []; list.push(entry); byTarget.set(l.matched_activity_event_id, list);
          }
        }
        // Raw is the left side; a unique authoritative link is the only permitted AI association.
        const objectColumns = new Set((raw.prepare('PRAGMA table_info(source_objects)').all() as Json[]).map(c => c.name));
        const objectIdColumn = objectColumns.has('id') ? 'id' : 'source_object_id';
        const current = hasCurrent ? options?.summaryOnly ? "json_object('summary',s.summary,'issue_type',s.issue_type,'status',s.status,'priority',s.priority)" : jsonColumns(raw, 'current_issue_snapshots', 's') : 'NULL';
        const ids = kind === 'ai' && options ? (options.ids ? options.ids.map(id=>aiRows.get(id)?.row.link?.matched_activity_event_id) : [...aiRows.values()].map(entry=>entry.row.link?.matched_activity_event_id)).filter(Boolean) : options?.ids;
        const scope = ids ? ` WHERE e.id IN (${ids.map(() => '?').join(',')})` : '';
        for (const item of raw.prepare(`SELECT ${jsonColumns(raw, "activity_events", "e")} event,${jsonColumns(raw, "source_objects", "o")} object,${current} currentIssue FROM activity_events e LEFT JOIN source_objects o ON o.${quote(objectIdColumn)}=e.source_object_id ${hasCurrent ? `LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.${quote(objectIdColumn)}` : ""}${scope}`).iterate(...(ids ?? [])) as Iterable<Json>) {
          const e = parse(item.event), o = parse(item.object), links = byTarget.get(e.id) ?? [], found = links.length === 1 ? links[0] : null;
          const before = parse(e.from_value_json), after = parse(e.to_value_json), currentIssue = parse(item.currentIssue) ?? {};
          const rawRow = { id: e.id, activityEventId: e.id, sourceRecordId: e.source_record_id, eventTime: e.event_time, eventType: e.event_type, action: e.event_type, sourceProvenance: e.source_provenance ?? e.event_type, displayName: e.actor_display_name ?? e.actor_account_id, actorAccountId: e.actor_account_id, issueKey: o.issue_key ?? o.object_key, projectKey: o.project_key ?? String(o.issue_key ?? o.object_key ?? "").split("-")[0], fieldName: e.field_name, fieldId: e.field_id, before, after, historyId: e.history_id ?? e.source_record_id, itemIndex: e.item_index ?? null };
          Object.assign(rawRow, { summary: currentIssue.summary ?? null, issueTypeName: currentIssue.issue_type ?? null, currentStatusName: currentIssue.status ?? null, currentPriorityName: currentIssue.priority ?? null });
          if (links.length > 1) ambiguous++;
          if (found) {
            matched++;
            found.row.rawSupplement = rawRow;
            found.row.sourceConflict = (found.row.before !== null && JSON.stringify(found.row.before) !== JSON.stringify(before)) || (found.row.after !== null && JSON.stringify(found.row.after) !== JSON.stringify(after));
          }
          if (kind === "integrated") {
            const row = { ...(found?.row ?? {}), ...rawRow, analysisStatus: found ? found.row.analysisStatus : "NOT_ANALYZED", rawSupplement: found ? rawRow : null, analysisState: found ? "ANALYZED" : links.length > 1 ? "IDENTITY_CONFLICT" : "UNANALYZED", contentSource: "RAW_EVENT", sourceTrace: found?.row.sourceTrace ?? null, sourceConflict: found?.row.sourceConflict ?? false, sourceLinkStatus: found?.row.sourceLinkStatus ?? (links.length > 1 ? "IDENTITY_CONFLICT" : "NOT_ATTEMPTED") };
            add(row, { raw: { activity_events: e, source_objects: o, current_issue_snapshots: currentIssue, decoded: { activity_events: Object.fromEntries(Object.entries(e).filter(([k, v]) => k.endsWith("_json") && typeof v === "string").map(([k, v]) => [k, parse(v)])), source_objects: Object.fromEntries(Object.entries(o).filter(([k, v]) => k.endsWith("_json") && typeof v === "string").map(([k, v]) => [k, parse(v)])) } }, ai: found?.document.ai ?? {}, link: found?.document.link ?? {}, computed: row });
          }
        }
      } finally { raw.close(); }
    } else if (kind === "integrated") throw new Error("RAW_DATABASE_CLOSED");
    if (kind === "ai") for (const entry of aiRows.values()) if (!options?.ids || options.ids.includes(entry.row.id)) add(entry.row, entry.document);
    db.exec("COMMIT; CREATE INDEX cells_field ON cells(field_id,token,row_id); CREATE INDEX cells_row ON cells(row_id,field_id); CREATE INDEX cells_range ON cells(field_id,number,row_id)");
    const aliases: Record<string, string> = { actor: "displayName", field: "fieldName", source: "sourceProvenance", diff: "diffText" };
    for (const field of [...registry.values()]) if (field.namespace === "computed" && field.segments.length === 1) {
      const name = field.segments[0] as string; registry.set(name, field);
    }
    for (const [alias, name] of Object.entries(aliases)) if (registry.has(name)) registry.set(alias, registry.get(name)!);
    const metadata: Json = { rawDatabaseIdentity: rawIdentity, aiRecordCount: aiRows.size, unmatchedAiCount: aiRows.size - matched, displaySourcePolicy: DISPLAY_POLICY_V047, matchedCount: matched, ambiguousCount: ambiguous, ambiguousLinkCount: [...aiRows.values()].filter(e => e.row.link?.raw_database_identity === rawIdentity && e.row.link?.link_status === 'AMBIGUOUS').length, integrationState: !aiPath ? "AI_DATABASE_CLOSED" : !aiRows.size ? "READY_NO_AI_RECORDS" : !matched ? "RELINK_REQUIRED" : matched === aiRows.size ? "FULL_MATCH" : "PARTIAL_MATCH" };
    Object.assign(metadata, { totalGuardCount, guardSampleCount:Math.min(totalGuardCount,guardSampleLimit), guardTruncatedCount:Math.max(0,totalGuardCount-guardSampleLimit), diffComputations, diffMs });
    queryStageV044('description-diff-summary','POINT', { totalGuardCount, sampleCount:metadata.guardSampleCount, truncatedCount:metadata.guardTruncatedCount, diffComputations, diffMs });
    const snapshot = { db, registry, total, key, metadata, indexed: new Set([eventField]) };
    queryStageV044("field-discovery", "END", { processed: total, fieldCount: registry.size });
    queryStageV044("mapping-aggregation", "END", { processed: total, matched, ambiguous });
    queryStageV044("source-read", "END", { processed: total, aiRecordCount: aiRows.size });
    queryStageV044("snapshot-build", "END", { processed: total, fieldCount: registry.size });
    if (!options && cache.size >= 2) { const oldest = cache.keys().next().value!; cache.get(oldest)!.db.close(); cache.delete(oldest); }
    if (!options) cache.set(key, snapshot); return snapshot;
  } catch (error) { db.close(); throw error; }
}

// Resolve local calendar boundaries with Intl, not a fixed 24-hour offset across DST.
export function dayBoundaryV043(day: string, zone: string, next = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("QUERY_DATE_INVALID");
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) throw new Error("QUERY_DATE_INVALID");
  const target = new Date(parsed); if (next) target.setUTCDate(target.getUTCDate() + 1);
  const desired = target.toISOString().slice(0, 10);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const calendar = (ms: number) => { const parts = Object.fromEntries(fmt.formatToParts(ms).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
  let lo = target.getTime() - 36 * 3600000, hi = target.getTime() + 36 * 3600000;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (calendar(mid) < desired) lo = mid; else hi = mid; }
  return hi;
}
function predicates(snapshot: Snapshot, query: QueryV043, exclude?: string) {
  const quick = query.diffQuickFilters ?? {};
  const quickFields = Object.entries({ hideZeroAdded: 'addedLineCount', hideZeroDeleted: 'removedLineCount', hideNoChange: 'isSubstantiveChange', hideBeforeUnavailable: 'beforeAvailability' }).filter(([toggle]) => quick[toggle]).map(([, field]) => field);
  indexFieldsV044(snapshot, [...Object.keys(query.filters ?? {}), ...quickFields, ...(quickFields.length ? ['diffApplicability'] : [])].filter(name => name !== exclude));
  const clauses: string[] = [], binds: (string | number)[] = [];
  const excluded = exclude ? snapshot.registry.get(exclude)?.path : undefined;
  for (const [name, filter] of Object.entries(query.filters ?? {})) {
    const f = snapshot.registry.get(name); if (!f) throw new Error(`QUERY_FIELD_UNAVAILABLE:${name}`);
    if (f.path === excluded) continue;
    const terms: string[] = [], values: (string | number)[] = [];
    if (f.path === snapshot.registry.get("analysisStatus")?.path && Array.isArray(filter.values) && !filter.values.length) { clauses.push("0"); continue; }
    if (filter.values?.length) {
      terms.push(`(${filter.values.map((v: string) => /^(missing|null|string|number|boolean|array|object):/.test(v) ? "c.token=?" : "c.text=?").join(" OR ")})`);
      values.push(...filter.values);
    } else if (filter.text) {
      if (["array", "json"].includes(f.dataType)) throw new Error("CONTAINER_TEXT_FILTER_UNSUPPORTED");
      terms.push(filter.operator === "exact" ? "c.text=?" : filter.operator === "not-equal" ? "c.text<>?" : filter.operator === "not-contains" ? "instr(lower(c.text),lower(?))=0" : "instr(lower(c.text),lower(?))>0"); values.push(filter.text);
    }
    if (filter.min !== undefined || filter.max !== undefined) {
      for (const n of [filter.min, filter.max]) if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n))) throw new Error("QUERY_NUMBER_INVALID");
      if (filter.min !== undefined && filter.max !== undefined && filter.min > filter.max) throw new Error("QUERY_NUMBER_RANGE_INVALID");
      if (filter.min !== undefined) { terms.push("c.number>=?"); values.push(filter.min); }
      if (filter.max !== undefined) { terms.push("c.number<=?"); values.push(filter.max); }
    }
    const bound = (v: string, upper: boolean) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? dayBoundaryV043(v, query.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, upper) : Date.parse(v);
    const from = filter.from ? bound(filter.from, false) : undefined, to = filter.to ? bound(filter.to, true) : undefined;
    if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to)) || (from !== undefined && to !== undefined && from > to)) throw new Error("QUERY_DATE_RANGE_INVALID");
    const epochColumn = snapshot.disk && f.dataType==='date' ? 'c.number' : 'jaa_epoch(c.text)';
    if (from !== undefined) { terms.push(`${epochColumn}>=?`); values.push(from); }
    if (to !== undefined) { terms.push(`${epochColumn}${/^\d{4}-\d{2}-\d{2}$/.test(filter.to) ? "<" : "<="}?`); values.push(to); }
    if (filter.operator === "exists") terms.push("1");
    if (filter.operator === "is-empty") terms.push("c.token IN ('null:null','string:\"\"','array:[]','object:{}')");
    if (filter.values?.includes("missing:")) {
      clauses.push(`(NOT EXISTS(SELECT 1 FROM cells c WHERE c.row_id=d.id AND c.field_id=?) OR EXISTS(SELECT 1 FROM cells c WHERE c.row_id=d.id AND c.field_id=? AND ${terms.join(" AND ")}))`); binds.push(f.path, f.path, ...values);
    } else if (terms.length) { clauses.push(`EXISTS(SELECT 1 FROM cells c WHERE c.row_id=d.id AND c.field_id=? AND ${terms.join(" AND ")})`); binds.push(f.path, ...values); }
  }
  for (const [toggle, field, op] of [["hideZeroAdded", "addedLineCount", ">0"], ["hideZeroDeleted", "removedLineCount", ">0"], ["hideNoChange", "isSubstantiveChange", "=1"]]) if (query.diffQuickFilters?.[toggle]) {
    const id = snapshot.registry.get(field)?.path;
    // Unknown metrics remain visible; absence is not a measured zero.
    if (id) { clauses.push(`NOT EXISTS(SELECT 1 FROM cells c INDEXED BY cells_row JOIN cells applicable INDEXED BY cells_row ON applicable.row_id=c.row_id AND applicable.field_id=? AND applicable.text=\'DESCRIPTION\' WHERE c.row_id=d.id AND c.field_id=? AND c.number IS NOT NULL AND NOT(c.number${op}))`); binds.push(snapshot.registry.get("diffApplicability")!.path, id); }
  }
  if (query.diffQuickFilters?.hideBeforeUnavailable) { const id = snapshot.registry.get("beforeAvailability")?.path; if (id) { clauses.push("NOT EXISTS(SELECT 1 FROM cells c INDEXED BY cells_row JOIN cells applicable INDEXED BY cells_row ON applicable.row_id=c.row_id AND applicable.field_id=? AND applicable.text='DESCRIPTION' WHERE c.row_id=d.id AND c.field_id=? AND c.text='UNAVAILABLE')"); binds.push(snapshot.registry.get("diffApplicability")!.path, id); } }
  if (Object.entries(query.filters ?? {}).some(([name,f]) => f.text && snapshot.registry.get(name)?.path === snapshot.registry.get('diffText')?.path && snapshot.registry.get(name)?.path !== excluded)) {
    indexFieldsV044(snapshot,['diffSearchUnknown']);
    const unknown = snapshot.registry.get('diffSearchUnknown');
    if (unknown) { clauses.push("NOT EXISTS(SELECT 1 FROM cells u WHERE u.row_id=d.id AND u.field_id=? AND u.number=1)"); binds.push(unknown.path); }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", binds };
}

function diffCoverage(s: Snapshot, query: QueryV043) {
  const diffPath = s.registry.get('diffText')?.path;
  const searched = Object.entries(query.filters ?? {}).filter(([name,f]) => f.text && s.registry.get(name)?.path === diffPath).map(([name])=>name);
  const count = (q: QueryV043, field: string, condition: string) => {
    if (!s.registry.has(field)) return 0;
    indexFieldsV044(s,[field]); const w = predicates(s,q);
    return Number((s.db.prepare('SELECT COUNT(*) n FROM documents d '+w.sql+(w.sql?' AND ':' WHERE ')+'EXISTS(SELECT 1 FROM cells u WHERE u.row_id=d.id AND u.field_id=? AND '+condition+')').get(...w.binds,s.registry.get(field)!.path) as Json).n);
  };
  const candidates = { ...query, filters:Object.fromEntries(Object.entries(query.filters ?? {}).filter(([name])=>!searched.includes(name))) };
  const warningCount = count(query,'diffStatus',"u.text='GUARD'");
  const searchUnknownCount = searched.length ? count(candidates,'diffSearchUnknown','u.number=1') : 0;
  return { warningCount, searchUnknownCount, searchCoverage:searchUnknownCount?'INCOMPLETE':'COMPLETE', resultStatus:warningCount||searchUnknownCount?'COMPLETED_WITH_WARNINGS':'COMPLETED' };
}
const exportDiagnosticFields = ['id','activityEventId','aiRecordId','analysisId','diffStatus','diffReason','displaySourceKind','beforeAvailability','addedLineCount','removedLineCount','isSubstantiveChange'];
function exportFields(s: Snapshot, visible?: string[]) {
  const names = visible ? [...visible,...exportDiagnosticFields] : [...s.registry.keys()].filter(k=>s.registry.get(k)?.path===k);
  return [...new Map(names.map(id=>s.registry.get(id.replace(/^dynamic:/,''))).filter((f): f is FieldV043=>Boolean(f)).map(f=>[f.path,f])).values()];
}
function snapshotFor(kind: "ai" | "integrated", aiPath: string | null, rawPath: string | null) { const s = process.env.JAA_READ_PROJECTION_V049 === '0' ? createSnapshot(kind, aiPath, rawPath) : readProjectionV049(kind, aiPath, rawPath, options => createSnapshot(kind, aiPath, rawPath, options)); s.db.function("jaa_epoch", (v: any) => { const ms = Date.parse(String(v)); return Number.isFinite(ms) ? ms : null; }); return s; }
export function queryResultsV043(kind: "ai" | "integrated", aiPath: string | null, rawPath: string | null, query: QueryV043 = {}, all = false) {
  const start = Date.now(), s = snapshotFor(kind, aiPath, rawPath), where = predicates(s, query);
  const page = query.page ?? 1, size = query.pageSize ?? 50;
  if (!Number.isSafeInteger(page) || page < 1 || ![20, 25, 50, 100, 200].includes(size)) throw new Error("QUERY_PAGE_INVALID");
  const sort = s.registry.get(query.sort?.field ?? "eventTime");
  if (query.sort?.field && !sort) throw new Error("QUERY_SORT_FIELD_UNAVAILABLE");
  if (sort && !sort.sortable) throw new Error("CONTAINER_SORT_UNSUPPORTED");
  if (sort) indexFieldsV044(s, [sort.path]);
  queryStageV044("sql-query", "START");
  const sortSql = sort ? `(SELECT ${["number", "boolean"].includes(sort.dataType) || (s.disk && sort.dataType === 'date') ? "c.number" : sort.dataType === "date" ? "jaa_epoch(c.text)" : "c.text"} FROM cells c WHERE c.row_id=d.id AND c.field_id=? ORDER BY c.token LIMIT 1) ${query.sort?.direction === "asc" ? "ASC" : "DESC"},` : "";
  const count = Number((s.db.prepare(`SELECT COUNT(*) n FROM documents d ${where.sql}`).get(...where.binds) as Json).n);
  const epochOrder = s.disk && sort?.path === s.registry.get('eventTime')?.path;
  const sql = epochOrder ? `SELECT d.id,d.body FROM cells cs INDEXED BY cells_sort JOIN documents d ON d.id=cs.row_id WHERE cs.field_id=? ${where.sql ? 'AND '+where.sql.slice(6) : ''} ORDER BY cs.number ${query.sort?.direction==='asc'?'ASC':'DESC'},cs.row_id ${all?'':'LIMIT ? OFFSET ?'}` : `SELECT id,body FROM documents d ${where.sql} ORDER BY ${sortSql} d.id ${all ? "" : "LIMIT ? OFFSET ?"}`;
  const binds = [...(epochOrder ? [sort!.path,...where.binds] : [...where.binds,...(sort?[sort.path]:[])]), ...(all ? [] : [size, (page - 1) * size])];
  const queryStart = performance.now();
  const sqlRows = s.db.prepare(sql).all(...binds) as Json[];
  const projectionQueryMs = performance.now() - queryStart;
  queryStageV044('page-hydration', 'START', { rowCount: sqlRows.length });
  queryStageV044("row-mapping", "START", { rowCount: sqlRows.length });
  const hydrateStart = performance.now();
  const heavy = !query.visibleFields || query.visibleFields.some(id => { const f=s.registry.get(id.replace(/^dynamic:/,'')); return f && (f.namespace !== 'computed' || ['before','after','diffText','diffHunks','computedDiffHunks','sourceTrace','rationale','rawSupplement','analysis','manualReview','skillFindings'].includes(String(f.segments[0])) || (f.segments[0] === 'manual' && f.segments[1] !== 'state')); });
  let rows = sqlRows, aiRecordsHydrated=0;
  if (s.hydrate && heavy && !s.metadata.projectionStale) {
    const bodies = new Map<string,string>();
    for(let i=0;i<sqlRows.length;i+=100) {for(const row of s.hydrate(sqlRows.slice(i,i+100).map(r=>r.id))) bodies.set(row.id,row.body);aiRecordsHydrated+=s.metadata.lastHydrationAiRecords ?? 0;}
    rows = sqlRows.map(row=>{const body=bodies.get(row.id);if(!body)throw Error('PROJECTION_CANONICAL_ROW_MISSING');return { ...row,body };});
  }
  const mappedRows = rows.map(r => materializeRowV044(r.body, s.registry, query.visibleFields));
  const hydrateMs = performance.now() - hydrateStart;
  queryStageV044('page-hydration', 'END', { hydrateMs, returnedRows: rows.length, aiRecordsHydrated });
  queryStageV044('projection-page','POINT',{ projectionQueryMs,hydrateMs,totalCandidateCount:s.total,filteredCandidateCount:count,returnedRows:rows.length,heavyRowsHydrated:s.disk && heavy && !s.metadata.projectionStale ? rows.length : 0,selectedColumnCount:query.visibleFields?.length ?? null,projectionGeneration:s.key });
  queryStageV044("row-mapping", "END", { rowCount: mappedRows.length });
  const statusCounts = kind === "integrated" ? distinctResultsV043(kind, aiPath, rawPath, "analysisStatus", query).values : undefined;
  const result = { ok: true, statusCounts, rows: mappedRows, fieldCatalog: [...s.registry].filter(([id, f]) => id === f.path).map(([, f]) => f), totalCount: s.total, filteredCount: count, page, pageSize: size, pageCount: Math.max(1, Math.ceil(count / size)), generation: s.key, ...s.metadata, durationMs: Date.now() - start };
  Object.assign(result, diffCoverage(s,query));
  Object.assign(result,{readPath:{projectionQueryMs,hydrateMs,totalCandidateCount:s.total,filteredCandidateCount:count,summaryRowsScanned:null,scanMeasurement:'UNAVAILABLE_SQLITE_STATEMENT_COUNTER',returnedRows:rows.length,heavyRowsHydrated:s.disk && heavy && !s.metadata.projectionStale?rows.length:0,aiRecordsHydrated,projectionGeneration:s.key,sidecar:Boolean(s.disk)}});
  queryStageV044("sql-query", "END", { queryTemplate: sql, parameterTypes: binds.map(v => typeof v), queryId: "v043-document-page", totalCount: s.total, filteredCount: count, rowCount: result.rows.length, elapsedMs: result.durationMs });
  receipts[kind] = { queryPlan: s.db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...binds), queryTemplate: sql, parameterTypes: binds.map(v => typeof v), scope: kind, total: s.total, filtered: count, elapsedMs: result.durationMs };
  return result;
}
export function distinctResultsV043(kind: "ai" | "integrated", aiPath: string | null, rawPath: string | null, field: string, query: QueryV043 = {}, search = "") {
  const s = snapshotFor(kind, aiPath, rawPath), f = s.registry.get(field); if (!f) throw new Error(`QUERY_FIELD_UNAVAILABLE:${field}`);
  const fingerprint=JSON.stringify([field,search,query.filters,query.diffQuickFilters,query.timeZone]);
  const cache=facetCacheV049.get(s) ?? new Map<string,any>();facetCacheV049.set(s,cache);
  const cached=cache.get(fingerprint);if(cached){queryStageV044('facet-cache','POINT',{facetCacheHit:true,projectionGeneration:s.key});return structuredClone(cached);}
  queryStageV044('facet-cache','POINT',{facetCacheHit:false,projectionGeneration:s.key});
  indexFieldsV044(s, [f.path]);
  const where = predicates(s, query, field), join = where.sql ? "AND" : "WHERE";
  const sql = `SELECT c.token value,c.text label,c.kind,COUNT(DISTINCT d.id) count FROM documents d JOIN cells c ON c.row_id=d.id ${where.sql} ${join} c.field_id=? AND instr(lower(c.text),lower(?))>0 GROUP BY c.token,c.text,c.kind ORDER BY c.number,c.text,c.token`;
  const values = s.db.prepare(sql).all(...where.binds, f.path, search) as Json[];
  const missing = Number((s.db.prepare(`SELECT COUNT(*) n FROM documents d ${where.sql} ${join} NOT EXISTS(SELECT 1 FROM cells c WHERE c.row_id=d.id AND c.field_id=?)`).get(...where.binds, f.path) as Json).n);
  if (missing && (!search || "未提供 missing".includes(search.toLowerCase()))) values.push({ value: "missing:", label: "(未提供 / missing)", kind: "missing", count: missing });
  const selected = query.filters?.[field]?.values ?? [];
  for (const value of selected) if (!values.some(item => item.value === value || item.label === value)) values.push({ value, label: value, count: 0, selected: true });
  receipts.facets = { queryTemplate: sql, parameterTypes: [...where.binds, f.path, search].map(v => typeof v), candidateCount: values.length, excludedField: f.path, scope: kind };
  const result={ field, values: values.map(item => ({ ...item, selected: selected.includes(item.value) || selected.includes(item.label) })), truncated: false };
  if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(fingerprint,result);return structuredClone(result);
}
export function exportResultsV043(kind: "ai" | "integrated", aiPath: string | null, rawPath: string | null, query: QueryV043, visible?: string[]) {
  const result = queryResultsV043(kind, aiPath, rawPath, { ...query, visibleFields: visible }, true);
  const s = snapshotFor(kind, aiPath, rawPath);
  const fields = exportFields(s,visible);
  for (const row of result.rows) for (const name of exportDiagnosticFields) { const f=s.registry.get(name); if(f) row.fieldValues[f.path]=row[name]; }
  return { schemaName: "jaa-table-query-export", schemaVersion: "0.3.43", scope: visible ? "visible-columns" : "all-fields", completePackage: false, displaySourcePolicy: DISPLAY_POLICY_V047, snapshot: result.generation, ...diffCoverage(s,query), totalCount: result.totalCount, filteredCount: result.filteredCount, fields: fields.map(f => ({ id: f.path, label: f.label })), rows: result.rows.map((row: Json) => Object.fromEntries(fields.map(f => [f.path, row.fieldValues[f.path]]))) };
}
export function latestQueryDiagnosticsV043() { const cacheBytes = [...cache.values()].reduce((n, s) => n + Number((s.db.prepare("PRAGMA page_count").get() as Json).page_count) * Number((s.db.prepare("PRAGMA page_size").get() as Json).page_size), 0); return { ...receipts, cacheEntries: cache.size, cacheBytes, cacheBudgetBytes: 256 * 1024 ** 2 }; }
export function releaseOversizeResultCacheV045() { const state = latestQueryDiagnosticsV043(); if (state.cacheBytes > state.cacheBudgetBytes) { invalidateAiResultsV043(false); queryStageV044("cache-released", "POINT", { reason: "BYTE_BUDGET", bytes: state.cacheBytes }); } }

// Iterate a single immutable query snapshot; never send full-scope export rows over IPC.
export function writeQueryExportV044(kind: "ai" | "integrated", ai: string | null, raw: string | null, query: QueryV043, visible: string[] | undefined, target: string, format: string) {
  if (!target || !target.endsWith('.partial')) throw Error('INVALID_EXPORT_TARGET');
  queryStageV044('export-snapshot', 'START');
  const metadata = queryResultsV043(kind, ai, raw, { ...query, page: 1, pageSize: 25, visibleFields: [] });
  const s = snapshotFor(kind, ai, raw), where = predicates(s, query);
  if ((query as Json).expectedSnapshot && (query as Json).expectedSnapshot !== s.key) throw Error('EXPORT_SNAPSHOT_CHANGED');
  queryStageV044('export-snapshot', 'END', { snapshot: s.key, filteredCount: metadata.filteredCount });
  const fields = exportFields(s,visible);
  const sort = s.registry.get(query.sort?.field ?? 'eventTime');
  const order = sort ? '(SELECT ' + (['number','boolean'].includes(sort.dataType) ? 'c.number' : sort.dataType === 'date' ? 'jaa_epoch(c.text)' : 'c.text') + ' FROM cells c WHERE c.row_id=d.id AND c.field_id=? ORDER BY c.token LIMIT 1) ' + (query.sort?.direction === 'asc' ? 'ASC' : 'DESC') + ',' : '';
  const sql = 'SELECT id,body FROM documents d ' + where.sql + ' ORDER BY ' + order + ' d.id';
  const header = { schemaName: 'jaa-table-query-export', schemaVersion: '0.3.43', scope: visible ? 'visible-columns' : 'all-fields', completePackage: false, displaySourcePolicy: DISPLAY_POLICY_V047, snapshot: metadata.generation, totalCount: metadata.totalCount, filteredCount: metadata.filteredCount, fields: fields.map(f => ({ id: f.path, label: f.label })) };
  const coverage = diffCoverage(s,query);
  Object.assign(header, coverage);
  const csvMetadata = { queryWarningCount:coverage.warningCount, querySearchUnknownCount:coverage.searchUnknownCount, querySearchCoverage:coverage.searchCoverage, queryResultStatus:coverage.resultStatus };
  const fd = fs.openSync(target, 'wx'); let processed = 0, lastProgress = performance.now();
  const csvCell = (value: unknown) => '"' + (value == null ? '' : JSON.stringify(value)).replace(/"/g, '""') + '"';
  queryStageV044('export-write', 'START', { total: metadata.filteredCount });
  let projectionMs = 0, serializationMs = 0, writeMs = 0;
  try {
    fs.writeSync(fd, format === 'csv' ? '\uFEFF' + [...fields.map(f => csvCell(f.path)),...Object.keys(csvMetadata).map(csvCell)].join(',') + '\r\n' : JSON.stringify(header).slice(0, -1) + ',"rows":[');
    function* exportRows(): Generator<Json> {
      let batch: Json[] = [];
      const hydrate = (items: Json[]) => {
        if(!s.hydrate) return items;
        if(s.metadata.projectionStale) throw Error('EXPORT_SNAPSHOT_CHANGED');
        const hydrated = new Map(s.hydrate(items.map(r=>r.id)).map(r=>[r.id,r]));
        return items.map(row=>{const value=hydrated.get(row.id);if(!value)throw Error('PROJECTION_CANONICAL_ROW_MISSING');return value;});
      };
      for(const row of s.db.prepare(sql).iterate(...where.binds,...(sort?[sort.path]:[])) as Iterable<Json>) {
        batch.push(row); if(batch.length===100){yield* hydrate(batch);batch=[];}
      }
      if(batch.length)yield* hydrate(batch);
    }
    for (const item of exportRows()) {
      const projectionStart = performance.now();
      const row = materializeRowV044(item.body, s.registry, fields.map(f => f.path));
      const values = Object.fromEntries(fields.map(f => [f.path, row.fieldValues[f.path]]));
      projectionMs += performance.now() - projectionStart;
      const serializeStart = performance.now();
      const encoded = format === 'csv' ? [...fields.map(f => csvCell(values[f.path])),...Object.values(csvMetadata).map(csvCell)].join(',') + '\r\n' : (processed ? ',' : '') + JSON.stringify(values);
      serializationMs += performance.now() - serializeStart;
      const writeStart = performance.now(); fs.writeSync(fd, encoded); writeMs += performance.now() - writeStart;
      processed++;
      if (performance.now() - lastProgress > 500) { queryStageV044('export-write', 'PROGRESS', { processed, total: metadata.filteredCount }); lastProgress = performance.now(); }
    }
    if (format !== 'csv') fs.writeSync(fd, ']}');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  queryStageV044('export-write', 'END', { processed, total: metadata.filteredCount });
  queryStageV044('export-projection-serialization', 'POINT', { projectionMs, serializationMs, writeMs, rowCount: processed });
  return { sizeBytes: fs.statSync(target).size, filteredCount: processed, snapshot: metadata.generation, projectionMs, serializationMs, writeMs, ...diffCoverage(s,query) };
}
