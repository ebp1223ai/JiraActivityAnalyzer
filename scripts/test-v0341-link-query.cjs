const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0341-test-helpers.cjs");
const m = api();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0341-query-"));
const contracts = path.join(root, "contracts", "ai-analysis");
const fixturePath = path.join(root, "tests", "fixtures", "v041", "jaa-ai-analysis-package-v2__ai-only__golden-3.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const dbPath = path.join(temp, "ai.sqlite"), rawPath = path.join(temp, "raw.sqlite");
try {
  m.initializeAiDatabaseV041({ databasePath: dbPath, ddlPath: path.join(contracts, "JAA_AI_Analysis_SQLite_Schema_v2.0.0.sql") });
  m.importAiAnalysisPackageV041({ databasePath: dbPath, ddlPath: path.join(contracts, "JAA_AI_Analysis_SQLite_Schema_v2.0.0.sql"), packageSchemaPath: path.join(contracts, "jaa-ai-analysis-package_v2.0.0.schema.json"), sourceTraceSchemaPath: path.join(contracts, "jaa-source-trace_v1.0.0.schema.json"), packagePath: fixturePath });
  const filtered = m.queryAiResultsV041(dbPath, { page: 1, pageSize: 25, filters: { issueKey: { values: ["FIX-100"] }, actor: { text: "Fixture" }, field: { values: ["Comment"] }, analysisStatus: { values: ["CLASSIFIED"] } } });
  assert.equal(filtered.filteredCount, 1);
  assert.equal(filtered.rows[0].issueKey, "FIX-100");
  assert.equal(m.distinctAiResultsV041(dbPath, "actor", "Fixture", 100).values[0].count, 3);

  const raw = new DatabaseSync(rawPath);
  raw.exec("CREATE TABLE database_metadata(metadata_key TEXT PRIMARY KEY,database_id TEXT NOT NULL,updated_at TEXT); INSERT INTO database_metadata VALUES('primary','source-db-golden-001','generation-other'); CREATE TABLE source_objects(source_object_id TEXT PRIMARY KEY,object_key TEXT NOT NULL); INSERT INTO source_objects VALUES('object-1','FIX-100'),('object-2','FIX-999'); CREATE TABLE activity_events(id TEXT PRIMARY KEY,source_object_id TEXT NOT NULL,event_type TEXT,event_time TEXT,actor_account_id TEXT,actor_display_name TEXT,field_id TEXT,field_name TEXT,from_value_json TEXT,to_value_json TEXT,source_record_id TEXT); INSERT INTO activity_events VALUES('activity-fixture-000','object-1','jira_comment','2026-08-31T01:00:00.000Z','fixture_user','Fixture User',NULL,'Comment','null','\"after\"','stable-000'),('raw-unanalysed','object-2','jira_history','2026-08-31T04:00:00.000Z','fixture_user','Fixture User',NULL,'description','\"before\"','\"after\"','raw-stable');");
  raw.close();
  const ai = new DatabaseSync(dbPath, { readOnly: true }); const aiRecordId = ai.prepare("SELECT ai_record_id FROM ai_records WHERE activity_event_id='activity-fixture-000'").get().ai_record_id; ai.close();
  const record = fixture.records[0];
  const candidate = { activityEventId: "activity-fixture-000", sourceRecordStableId: "stable-000", fieldName: "Comment", eventTime: "2026-08-31T01:00:00.000Z", databaseGeneration: "generation-other", sourceContentHash: "deliberately-different" };
  const sameIdentity = m.decideSourceLinkV041({ ...record, databaseGeneration: "generation-golden-001", integrityReceipt: { status: "MISMATCH" } }, "source-db-golden-001", [candidate]);
  assert.equal(sameIdentity.status, "PRIMARY_MATCHED");
  assert.equal(sameIdentity.databaseGenerationStatus, "DIFFERENT");
  m.recordSourceLinkAttemptV041({ databasePath: dbPath, aiRecordId, rawDatabaseIdentity: "source-db-golden-001", record: { ...record, databaseGeneration: "generation-golden-001" }, candidates: [candidate] });
  const integrated = m.queryIntegratedResultsV041(rawPath, dbPath, { page: 1, pageSize: 25 });
  assert.equal(integrated.totalCount, 2);
  assert.equal(integrated.rows.filter((row) => row.analysisState === "ANALYZED").length, 1);
  assert.equal(integrated.rows.filter((row) => row.analysisState === "UNANALYZED").length, 1);
  assert.equal(m.queryIntegratedResultsV041(rawPath, dbPath, { page: 1, pageSize: 25, filters: { analysisState: { values: ["UNANALYZED"] } } }).filteredCount, 1);
  assert.equal(integrated.rawDatabaseIdentity, "source-db-golden-001");
  console.log(JSON.stringify({ status: "PASS", version: "0.3.41", headerFiltersAffectRows: true, primaryMatch: 1, unanalysedRowsPreserved: 1, generationDifferentAllowed: true, hashGateCount: 0 }, null, 2));
} finally { try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { console.warn(`cleanup warning: ${error.code}`); } }
