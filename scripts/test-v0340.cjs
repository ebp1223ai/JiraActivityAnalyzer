const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0340-test-helpers.cjs");
const m = api();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0340-"));
const ddlPath = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-v1.sql");
const schemaPath = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-import-package_v1.0.0.schema.json");
const fixture = path.join(root, "tests", "fixtures", "v039", "jaa-ai-analysis-import-59__ai-only__strict-canonical-v1.0.0.json");

function scalar(filePath, sql) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try { return Number(db.prepare(sql).get().value); } finally { db.close(); }
}
function createRawDatabase(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  try {
    db.exec("CREATE TABLE database_metadata(database_id TEXT NOT NULL); INSERT INTO database_metadata VALUES('raw-v040'); CREATE TABLE source_objects(id TEXT PRIMARY KEY,issue_key TEXT NOT NULL); INSERT INTO source_objects VALUES('object-1','V040-1'); CREATE TABLE activity_events(id TEXT PRIMARY KEY,source_object_id TEXT NOT NULL,event_time TEXT NOT NULL,actor_account_id TEXT,actor_display_name TEXT,field_name TEXT,from_value_json TEXT,to_value_json TEXT); INSERT INTO activity_events VALUES('event-1','object-1','2026-09-01T00:00:00.000Z','actor-1','Synthetic User','description','\"before\"','\"after\"');");
  } finally { db.close(); }
}

try {
  const rootOne = path.join(temp, "portable-one");
  fs.mkdirSync(rootOne, { recursive: true });
  const defaultPath = path.join(rootOne, "databases", "ai-analysis", "jaa-ai-analysis.sqlite");
  const storeOne = new m.AiAnalysisDatabaseStoreV040({ appRoot: rootOne, defaultDatabasePath: defaultPath, ddlPath, appVersion: "0.3.40" });
  assert.equal(storeOne.lifecycle().lifecycleState, "NOT_SELECTED");
  const created = storeOne.createAndActivate(defaultPath);
  assert.equal(created.snapshot.lifecycleState, "READY_EMPTY");
  assert.equal(created.snapshot.pathMode, "APP_ROOT_RELATIVE");
  const databaseId = created.snapshot.databaseId;
  assert.ok(databaseId);
  const imported = m.importAiAnalysisPackage({ databasePath: defaultPath, ddlPath, schemaPath, packagePath: fixture, appVersion: "0.3.40" });
  assert.equal(imported.insertedCount, 59);

  const badPath = path.join(temp, "bad.sqlite");
  fs.writeFileSync(badPath, "not sqlite", "utf8");
  assert.throws(() => storeOne.openAndActivate(badPath), /AI_DATABASE_/);
  assert.equal(storeOne.lifecycle().databaseId, databaseId);

  const rootTwo = path.join(temp, "portable-moved");
  fs.renameSync(rootOne, rootTwo);
  const movedDefault = path.join(rootTwo, "databases", "ai-analysis", "jaa-ai-analysis.sqlite");
  const storeTwo = new m.AiAnalysisDatabaseStoreV040({ appRoot: rootTwo, defaultDatabasePath: movedDefault, ddlPath, appVersion: "0.3.40" });
  const moved = storeTwo.lifecycle();
  assert.equal(moved.lifecycleState, "READY_WITH_DATA");
  assert.equal(moved.databaseId, databaseId);
  assert.equal(moved.recordCount, 59);
  assert.equal(moved.pathMode, "APP_ROOT_RELATIVE");

  const all = m.queryAiResultsV040(movedDefault, { page: 1, pageSize: 25, sort: [{ field: "eventTime", direction: "desc" }] });
  assert.equal(all.totalCount, 59);
  assert.equal(all.filteredCount, 59);
  assert.equal(all.rows.length, 25);
  const first = all.rows[0], issue = String(first.issue_key);
  const filtered = m.queryAiResultsV040(movedDefault, { page: 1, pageSize: 50, filters: [{ field: "issueKey", operator: "EQ", value: issue }] });
  assert.ok(filtered.filteredCount > 0 && filtered.filteredCount <= filtered.totalCount);
  assert.ok(filtered.rows.every((row) => row.issue_key === issue));
  const actorFiltered = m.queryAiResultsV040(movedDefault, { page: 1, pageSize: 50, filters: [{ field: "actor", operator: "CONTAINS", value: String(first.actor_display_value).slice(0, 3) }] });
  assert.ok(actorFiltered.filteredCount > 0);
  assert.throws(() => m.queryAiResultsV040(movedDefault, { page: 1, pageSize: 50, filters: [{ field: "arbitrarySql", operator: "EQ", value: "x" }] }), /QUERY_FIELD_NOT_ALLOWED/);
  assert.throws(() => m.queryAiResultsV040(movedDefault, { page: 1, pageSize: 50, filters: [{ field: "issueKey", operator: "DROP", value: "x" }] }), /QUERY_OPERATOR_NOT_ALLOWED/);

  const rawPath = path.join(temp, "raw.sqlite");
  createRawDatabase(rawPath);
  assert.equal(m.inspectRawDatabaseSchema(rawPath).ok, true);
  const integratedNoMatch = m.queryIntegratedResultsV040(rawPath, movedDefault, { page: 1, pageSize: 25 });
  assert.equal(integratedNoMatch.ok, true);
  assert.equal(integratedNoMatch.totalCount, 1);
  assert.equal(integratedNoMatch.rows[0].analysis_state, "UNANALYZED");
  assert.equal(integratedNoMatch.integrationState, "READY_NO_MATCH");

  const ai = new DatabaseSync(movedDefault);
  try {
    const aiRecordId = ai.prepare("SELECT ai_record_id FROM ai_analysis_records LIMIT 1").get().ai_record_id;
    ai.prepare("UPDATE ai_source_links SET link_status='MATCHED',link_method='SOURCE_DATABASE_AND_ACTIVITY_EVENT',matched_source_database_id='raw-v040',matched_activity_event_id='event-1',matched_raw_record_id='event-1',source_identity_match=1,source_content_match=1 WHERE ai_record_id=?").run(aiRecordId);
  } finally { ai.close(); }
  const integratedMatch = m.queryIntegratedResultsV040(rawPath, movedDefault, { page: 1, pageSize: 25, filters: [{ field: "analysisState", operator: "EQ", value: "ANALYZED" }] });
  assert.equal(integratedMatch.ok, true);
  assert.equal(integratedMatch.filteredCount, 1);
  assert.equal(integratedMatch.rows[0].analysis_state, "ANALYZED");

  const malformedRaw = path.join(temp, "malformed-raw.sqlite");
  const malformed = new DatabaseSync(malformedRaw); malformed.exec("CREATE TABLE activity_events(id TEXT);"); malformed.close();
  const schemaFailure = m.queryIntegratedResultsV040(malformedRaw, movedDefault, { page: 1, pageSize: 25 });
  assert.equal(schemaFailure.errorCode, "QUERY_SCHEMA_ERROR");
  assert.ok(schemaFailure.missingColumns.includes("activity_events.source_object_id"));
  const closed = m.queryIntegratedResultsV040(path.join(temp, "missing-raw.sqlite"), movedDefault, { page: 1, pageSize: 25 });
  assert.equal(closed.errorCode, "RAW_DATABASE_CLOSED");

  const externalPath = path.join(temp, "external", "team-ai.sqlite");
  m.createAiAnalysisDatabaseAtomic({ databasePath: externalPath, allowedRoot: path.dirname(externalPath), ddlPath, appVersion: "0.3.40" });
  const external = storeTwo.openAndActivate(externalPath);
  assert.equal(external.pathMode, "ABSOLUTE");
  fs.unlinkSync(externalPath);
  assert.equal(storeTwo.lifecycle().lifecycleState, "FILE_NOT_FOUND");
  assert.equal(fs.existsSync(externalPath), false);

  const defaults = m.defaultUiPreferences();
  assert.ok(defaults.aiResults.visibleColumns.includes("eventTime"));
  assert.ok(defaults.integratedResults.visibleColumns.includes("analysisState"));
  const normalizedPreferences = m.normalizeUiPreferences({ aiResults: { ...defaults.aiResults, visibleColumns: ["issueKey", "arbitrarySql"] } });
  assert.deepEqual(normalizedPreferences.aiResults.visibleColumns, ["issueKey"]);

  const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
  assert.match(mainSource, /fs\.mkdirSync\(aiDatabaseBundleDir, \{ recursive: true \}\)/);
  assert.match(mainSource, /ai-query-diagnostics\.json/);
  assert.match(mainSource, /ai-switch-preflight-failure\.json/);
  assert.equal(scalar(movedDefault, "SELECT COUNT(*) value FROM ai_analysis_records"), 59);
  console.log(JSON.stringify({ status: "PASS", version: "0.3.40", lifecycle: ["NOT_SELECTED", "READY_EMPTY", "READY_WITH_DATA", "FILE_NOT_FOUND"], aiRecords: 59, integratedJoin: "source_objects.id=activity_events.source_object_id", queryWhitelist: true, debugBundleContract: true }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
