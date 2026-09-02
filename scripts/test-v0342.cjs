const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0342-test-helpers.cjs");

const m = api();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0342-"));
const contracts = path.join(root, "contracts", "ai-analysis");
const fixtures = path.join(root, "tests", "fixtures", "v042");
const schema = path.join(contracts, "jaa-ai-analysis-package_v2.0.0.schema.json");
const traceSchema = path.join(contracts, "jaa-source-trace_v1.0.0.schema.json");
const fixture = (name) => path.join(fixtures, name);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const validate = (file, databasePath) => m.validateAiAnalysisPackageV042({ filePath: file, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema, databasePath });
const importPackage = (databasePath, packagePath, extra = {}) => m.importAiAnalysisPackageV042({ databasePath, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema, packagePath, ...extra });

try {
  assert.equal(sha256(path.join(contracts, "JAA_AI_Analysis_SQLite_Schema_v2.0.0.sql")), m.AI_ANALYSIS_DDL_SHA256_V042);
  assert.equal(m.AI_ANALYSIS_DDL_SHA256_V042, "1ad8269f4b70eb98571a551bf436cb9a022d681d8f69efef718548cd353cf648");
  assert.equal(m.AI_ANALYSIS_DDL_VERSION_V042, "2.0.0");

  const positive = [
    ["jaa-ai-analysis-package-v2__ai-only__golden-3.json", "AI_ONLY", 3],
    ["jaa-ai-analysis-package-v2__review-partial__golden-3.json", "REVIEW_PARTIAL", 3],
    ["jaa-ai-analysis-package-v2__review-completed__golden-3.json", "REVIEW_COMPLETED", 3],
    ["jaa-ai-analysis-package-v2__ai-only__golden-44.json", "AI_ONLY", 44],
    ["jaa-ai-analysis-package-v2__review-partial__golden-44.json", "REVIEW_PARTIAL", 44],
    ["jaa-ai-analysis-package-v2__review-completed__golden-44.json", "REVIEW_COMPLETED", 44]
  ];
  for (const [name, rank, count] of positive) {
    const result = validate(fixture(name));
    assert.equal(result.preview.ok, true, `${name}: ${JSON.stringify(result.preview.errors)}`);
    assert.equal(result.preview.derivedReviewRank, rank);
    assert.equal(result.preview.recordCount, count);
  }
  const bad = validate(fixture("jaa-ai-analysis-package-v2__negative-missing-diff.json")).preview;
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((error) => String(error.path).includes("/records/1/sourceTrace/diff")), JSON.stringify(bad.errors));

  const mismatched = read(fixture("jaa-ai-analysis-package-v2__review-partial__golden-3.json"));
  mismatched.packageId = "fixture-rank-mismatch";
  mismatched.reviewRank = "REVIEW_COMPLETED";
  const mismatchPath = path.join(temp, "rank-mismatch.json");
  fs.writeFileSync(mismatchPath, JSON.stringify(mismatched));
  const mismatch = validate(mismatchPath).preview;
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.errors.some((error) => error.code === "REVIEW_RANK_MISMATCH"));

  const malformedCases = [
    ["record-order", (pkg) => { pkg.packageId = "fixture-record-order"; pkg.records[1].recordIndex = 9; }, "RECORD_INDEX_MISMATCH"],
    ["duplicate-identity", (pkg) => { pkg.packageId = "fixture-duplicate-identity"; pkg.records[1].sourceTrace.reference.activityEventId = pkg.records[0].sourceTrace.reference.activityEventId; }, "DUPLICATE_PRIMARY_IDENTITY"],
    ["layer-identity", (pkg) => { pkg.packageId = "fixture-layer-identity"; pkg.records[1].aiAnalysis.issueKey = "WRONG-1"; }, "LAYER_IDENTITY_MISMATCH"]
  ];
  for (const [name, mutate, code] of malformedCases) {
    const pkg = read(fixture("jaa-ai-analysis-package-v2__ai-only__golden-3.json"));
    mutate(pkg);
    const filePath = path.join(temp, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(pkg));
    const preview = validate(filePath).preview;
    assert.equal(preview.ok, false);
    assert.ok(preview.errors.some((error) => error.code === code), `${name}: ${JSON.stringify(preview.errors)}`);
  }

  const sourceLinkGolden = read(fixture("JAA_v0.3.42_Source_Link_Golden.json"));
  const aiOnly3 = read(fixture("jaa-ai-analysis-package-v2__ai-only__golden-3.json"));
  const partial3 = read(fixture("jaa-ai-analysis-package-v2__review-partial__golden-3.json"));
  const completed3 = read(fixture("jaa-ai-analysis-package-v2__review-completed__golden-3.json"));
  assert.deepEqual(aiOnly3.records.map((record) => record.sourceTrace), partial3.records.map((record) => record.sourceTrace));
  assert.deepEqual(aiOnly3.records.map((record) => record.sourceTrace), completed3.records.map((record) => record.sourceTrace));
  for (const expected of sourceLinkGolden.expected) {
    const record = aiOnly3.records[expected.recordIndex];
    const decision = m.decideSourceLinkV042(record, sourceLinkGolden.sourceDatabaseId, sourceLinkGolden.rawCandidates);
    assert.equal(decision.method, expected.method);
    assert.equal(decision.candidateCount, expected.candidateCount);
    assert.equal(decision.status, expected.status);
    assert.equal(decision.matchedActivityEventId, expected.matchedActivityEventId);
  }
  const dbPath = path.join(temp, "ai.sqlite");
  assert.equal(m.initializeAiDatabaseV042({ databasePath: dbPath }).lifecycleState, "READY_EMPTY");
  const aiOnly44 = fixture("jaa-ai-analysis-package-v2__ai-only__golden-44.json");
  const partial44 = fixture("jaa-ai-analysis-package-v2__review-partial__golden-44.json");
  const completed44 = fixture("jaa-ai-analysis-package-v2__review-completed__golden-44.json");
  const beforePreflightHash = sha256(dbPath);
  assert.equal(validate(aiOnly44, dbPath).preview.ok, true);
  assert.equal(sha256(dbPath), beforePreflightHash, "preflight must not mutate database bytes");
  assert.equal(importPackage(dbPath, aiOnly44).insertedCount, 44);
  const partialReceipt = importPackage(dbPath, partial44);
  assert.equal(partialReceipt.replacedCount, 44);
  assert.equal(partialReceipt.readBack.reviews, 7);
  const completeReceipt = importPackage(dbPath, completed44);
  assert.equal(completeReceipt.replacedCount, 44);
  assert.equal(completeReceipt.readBack.reviews, 44);
  assert.equal(importPackage(dbPath, completed44).idempotent, true);
  const lower = read(aiOnly44);
  lower.packageId = "fixture-lower-rank-after-completed";
  const lowerPath = path.join(temp, "lower.json");
  fs.writeFileSync(lowerPath, JSON.stringify(lower));
  assert.equal(importPackage(dbPath, lowerPath).protectedSkipCount, 44);

  const db = new DatabaseSync(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) value FROM ai_records WHERE active_review_id IS NOT NULL").get().value, 44);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  const completedPackage = read(completed44);
  const storedTraces = db.prepare("SELECT source_trace_json FROM ai_record_source_traces WHERE import_batch_id=(SELECT import_batch_id FROM ai_import_batches WHERE package_id=?) ORDER BY rowid").all(completedPackage.packageId).map((row) => JSON.parse(row.source_trace_json));
  assert.deepEqual(storedTraces, completedPackage.records.map((record) => record.sourceTrace));
  const firstAnalysis = db.prepare("SELECT analysis_id,analysis_json FROM ai_record_analyses WHERE analysis_id=(SELECT active_analysis_id FROM ai_records ORDER BY record_index LIMIT 1)").get();
  const future = JSON.parse(firstAnalysis.analysis_json);
  future.futureContractField = { timestamp: "2026-09-02T10:00:00Z", value: "visible-without-frontend-change" };
  db.prepare("UPDATE ai_record_analyses SET analysis_json=? WHERE analysis_id=?").run(JSON.stringify(future), firstAnalysis.analysis_id);
  db.close();
  const query = m.queryAiResultsV042(dbPath, { page: 1, pageSize: 200 });
  assert.ok(query.fieldCatalog.some((field) => field.path === "aiAnalysis.futureContractField.value"));
  assert.ok(query.fieldCatalog.some((field) => field.path === "aiAnalysis.futureContractField.timestamp" && field.filterType === "date"));
  assert.ok(query.rows.some((row) => row.fieldValues["aiAnalysis.futureContractField.value"] === "visible-without-frontend-change"));
  assert.throws(() => m.queryAiResultsV042(dbPath, { page: 1, pageSize: 25, filters: { eventTime: { from: "2026-09-02", to: "2026-09-01" } } }), /QUERY_DATE_RANGE_INVALID/);
  const completeRecords = read(completed44).records;
  const days = completeRecords.map((record) => record.sourceTrace.reference.eventTime.slice(0, 10));
  const firstDay = days.slice().sort()[0], lastDay = days.slice().sort().at(-1);
  const sameDayExpected = days.filter((day) => day === firstDay).length;
  assert.equal(m.queryAiResultsV042(dbPath, { page: 1, pageSize: 200, filters: { eventTime: { from: firstDay, to: firstDay } } }).filteredCount, sameDayExpected);
  assert.equal(m.queryAiResultsV042(dbPath, { page: 1, pageSize: 200, filters: { eventTime: { from: firstDay } } }).filteredCount, 44);
  assert.equal(m.queryAiResultsV042(dbPath, { page: 1, pageSize: 200, filters: { eventTime: { to: lastDay } } }).filteredCount, 44);
  assert.equal(m.queryAiResultsV042(dbPath, { page: 1, pageSize: 200, filters: { eventTime: { from: firstDay, to: lastDay } } }).filteredCount, 44);

  const rollbackPath = path.join(temp, "rollback.sqlite");
  m.initializeAiDatabaseV042({ databasePath: rollbackPath });
  assert.throws(() => importPackage(rollbackPath, aiOnly44, { failureInjection: "AFTER_RECORDS" }), /SYNTHETIC_V042_IMPORT_FAILURE/);
  const rolledBack = new DatabaseSync(rollbackPath, { readOnly: true });
  assert.equal(rolledBack.prepare("SELECT COUNT(*) value FROM ai_import_batches").get().value, 0);
  assert.equal(rolledBack.prepare("SELECT COUNT(*) value FROM ai_records").get().value, 0);
  rolledBack.close();

  const rawPath = path.join(temp, "raw.sqlite");
  const raw = new DatabaseSync(rawPath);
  raw.exec("CREATE TABLE database_metadata(metadata_key TEXT PRIMARY KEY,database_id TEXT NOT NULL,schema_version INTEGER,created_at TEXT); INSERT INTO database_metadata VALUES('primary','source-db-golden-001',2,'2026-08-31T00:00:00Z'); CREATE TABLE source_objects(id TEXT PRIMARY KEY,issue_key TEXT NOT NULL,project_key TEXT); INSERT INTO source_objects VALUES('object-1','FIX-1000','FIX'),('object-2','FIX-999','FIX'); CREATE TABLE activity_events(id TEXT PRIMARY KEY,source_object_id TEXT NOT NULL,event_type TEXT,event_time TEXT,actor_account_id TEXT,actor_display_name TEXT,field_id TEXT,field_name TEXT,from_value_json TEXT,to_value_json TEXT,source_record_id TEXT); INSERT INTO activity_events VALUES('activity-fixture-44-000','object-1','jira_comment','2026-08-01T00:00:00Z','fixture_user','Fixture User',NULL,'Comment','null','\"after\"','stable-44-000'),('raw-unanalysed','object-2','jira_history','2026-08-31T04:00:00Z','fixture_user','Fixture User',NULL,'description','\"before\"','\"after\"','raw-stable');");
  raw.close();
  const writable = new DatabaseSync(dbPath);
  const aiRecordId = writable.prepare("SELECT ai_record_id FROM ai_records WHERE activity_event_id='activity-fixture-44-000'").get().ai_record_id;
  writable.close();
  const packageRecord = read(aiOnly44).records[0];
  const candidate = { activityEventId: "activity-fixture-44-000", sourceRecordStableId: "stable-44-000", fieldName: "Comment", eventTime: "2026-08-01T00:00:00Z" };
  assert.equal(m.decideSourceLinkV042(packageRecord, "source-db-golden-001", [candidate]).status, "PRIMARY_MATCHED");
  m.recordSourceLinkAttemptV042({ databasePath: dbPath, aiRecordId, rawDatabaseIdentity: "source-db-golden-001", record: packageRecord, candidates: [candidate] });
  m.recordSourceLinkAttemptV042({ databasePath: dbPath, aiRecordId, rawDatabaseIdentity: "source-db-golden-001", record: packageRecord, candidates: [], failureReason: "SYNTHETIC_QUERY_FAILURE" });
  const linkAudit = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(linkAudit.prepare("SELECT COUNT(*) value FROM source_link_attempts WHERE ai_record_id=?").get(aiRecordId).value, 2);
  assert.equal(linkAudit.prepare("SELECT link_status FROM source_link_attempts WHERE ai_record_id=? ORDER BY attempted_at DESC,link_attempt_id DESC LIMIT 1").get(aiRecordId).link_status, "ERROR");
  linkAudit.close();
  m.recordSourceLinkAttemptV042({ databasePath: dbPath, aiRecordId, rawDatabaseIdentity: "source-db-golden-001", record: packageRecord, candidates: [candidate] });
  const integrated = m.queryIntegratedResultsV042(rawPath, dbPath, { page: 1, pageSize: 25 });
  assert.equal(integrated.totalCount, 2);
  assert.equal(integrated.matchedCount, 1);
  assert.equal(integrated.rows.filter((row) => row.analysisState === "UNANALYZED").length, 1);
  assert.ok(integrated.fieldCatalog.some((field) => field.path === "raw.activity_events.event_time"));
  assert.ok(integrated.fieldCatalog.some((field) => field.path.startsWith("ai.")));
  assert.ok(integrated.fieldCatalog.some((field) => field.path.startsWith("link.")));
  assert.equal(m.queryIntegratedResultsV042(rawPath, null, { page: 1, pageSize: 25 }).integrationState, "AI_DATABASE_CLOSED");
  const unmatchedPath = path.join(temp, "unmatched.sqlite");
  m.initializeAiDatabaseV042({ databasePath: unmatchedPath });
  importPackage(unmatchedPath, fixture("jaa-ai-analysis-package-v2__ai-only__golden-3.json"));
  assert.equal(m.queryIntegratedResultsV042(rawPath, unmatchedPath, { page: 1, pageSize: 25 }).integrationState, "READY_NO_MATCH");
  const brokenRawPath = path.join(temp, "broken-raw.sqlite");
  const brokenRaw = new DatabaseSync(brokenRawPath);
  brokenRaw.exec("CREATE TABLE placeholder(id TEXT)");
  brokenRaw.close();
  assert.equal(m.queryIntegratedResultsV042(brokenRawPath, dbPath, { page: 1, pageSize: 25 }).integrationState, "BLOCKED_RAW_DB");

  const source = fs.readFileSync(path.join(root, "electron", "aiAnalysisDatabaseV042.ts"), "utf8");
  assert.doesNotMatch(source, /readFileSync\(input\.ddlPath/);
  assert.match(source, /AI_ANALYSIS_DDL_V042/);
  console.log(JSON.stringify({ status: "PASS", version: "0.3.42", goldenFixtures: 7, ranks: ["AI_ONLY", "REVIEW_PARTIAL", "REVIEW_COMPLETED"], records44: true, findings113: true, rollback: true, embeddedDdl: true, dynamicFieldCatalog: true, rawLeftJoin: true }, null, 2));
} finally {
  try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { console.warn(`cleanup warning: ${error.code}`); }
}
