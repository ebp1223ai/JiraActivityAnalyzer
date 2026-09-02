const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0341-test-helpers.cjs");
const m = api();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0341-"));
const contracts = path.join(root, "contracts", "ai-analysis");
const fixtures = path.join(root, "tests", "fixtures", "v041");
const ddl = path.join(contracts, "JAA_AI_Analysis_SQLite_Schema_v2.0.0.sql");
const schema = path.join(contracts, "jaa-ai-analysis-package_v2.0.0.schema.json");
const traceSchema = path.join(contracts, "jaa-source-trace_v1.0.0.schema.json");
const aiOnly = path.join(fixtures, "jaa-ai-analysis-package-v2__ai-only__golden-3.json");
const reviewed = path.join(fixtures, "jaa-ai-analysis-package-v2__review-completed__golden-3.json");
const negative = path.join(fixtures, "jaa-ai-analysis-package-v2__negative-missing-diff.json");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

try {
  assert.equal(hash(ddl), "1ad8269f4b70eb98571a551bf436cb9a022d681d8f69efef718548cd353cf648");
  assert.equal(hash(schema), "36f879a3ee5a5671e92c0ea8dec4c4e850caf7282cbfc45ef68f41e394e8af27");
  assert.equal(hash(traceSchema), "b96147f4a2f766fb39679beeba66ef4ea210f290bc69078b88456fc8b5b8e6e7");
  const positive = m.validateAiAnalysisPackageV041({ filePath: aiOnly, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema });
  assert.equal(positive.preview.ok, true, JSON.stringify(positive.preview.errors));
  assert.equal(m.validateAiAnalysisPackageV041({ filePath: reviewed, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema }).preview.ok, true);
  const bad = m.validateAiAnalysisPackageV041({ filePath: negative, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema }).preview;
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((error) => String(error.path).includes("/records/1/sourceTrace") && String(error.message).includes("diff")), JSON.stringify(bad.errors));

  const dbPath = path.join(temp, "fresh.sqlite");
  const fresh = m.initializeAiDatabaseV041({ databasePath: dbPath, ddlPath: ddl });
  assert.equal(fresh.schemaVersion, 2);
  assert.equal(fresh.lifecycleState, "READY_EMPTY");
  const first = m.importAiAnalysisPackageV041({ databasePath: dbPath, ddlPath: ddl, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema, packagePath: aiOnly });
  assert.equal(first.insertedCount, 3);
  assert.equal(first.committedRecordCount, 3);
  const second = m.importAiAnalysisPackageV041({ databasePath: dbPath, ddlPath: ddl, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema, packagePath: aiOnly });
  assert.equal(second.idempotent, true);
  assert.equal(second.identicalNoopCount, 3);
  const database = new DatabaseSync(dbPath, { readOnly: true });
  const sourceRows = database.prepare("SELECT t.source_trace_json FROM ai_record_source_traces t JOIN ai_records r ON r.ai_record_id=t.ai_record_id ORDER BY r.record_index LIMIT 3").all().map((row) => JSON.parse(row.source_trace_json));
  assert.deepEqual(sourceRows, read(aiOnly).records.map((record) => record.sourceTrace));
  database.close();
  const upgraded = m.importAiAnalysisPackageV041({ databasePath: dbPath, ddlPath: ddl, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema, packagePath: reviewed });
  assert.equal(upgraded.replacedCount, 3);

  const lower = read(aiOnly); lower.packageId = "fixture-ai-only-lower-rank";
  const lowerPath = path.join(temp, "lower.json"); fs.writeFileSync(lowerPath, JSON.stringify(lower));
  const protectedResult = m.importAiAnalysisPackageV041({ databasePath: dbPath, ddlPath: ddl, packageSchemaPath: schema, sourceTraceSchemaPath: traceSchema, packagePath: lowerPath });
  assert.equal(protectedResult.protectedSkipCount, 3);
  const afterProtection = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(afterProtection.prepare("SELECT COUNT(*) value FROM ai_records WHERE active_review_id IS NOT NULL").get().value, 3);
  assert.equal(afterProtection.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(afterProtection.prepare("PRAGMA foreign_key_check").all().length, 0);

  const packageRecord = read(aiOnly).records[0];
  const aiRecordId = afterProtection.prepare("SELECT ai_record_id FROM ai_records ORDER BY record_index LIMIT 1").get().ai_record_id;
  afterProtection.close();
  const baseCandidate = { activityEventId: packageRecord.sourceTrace.reference.activityEventId, sourceRecordStableId: packageRecord.sourceTrace.reference.sourceRecordStableId, fieldName: packageRecord.sourceTrace.reference.fieldName, eventTime: packageRecord.sourceTrace.reference.eventTime };
  assert.equal(m.decideSourceLinkV041(packageRecord, "source-db-golden-001", [baseCandidate]).status, "PRIMARY_MATCHED");
  assert.equal(m.decideSourceLinkV041(packageRecord, "source-db-golden-001", [baseCandidate, baseCandidate]).status, "AMBIGUOUS");
  assert.equal(m.decideSourceLinkV041(packageRecord, "source-db-golden-001", [{ ...baseCandidate, activityEventId: "fallback" }]).status, "FALLBACK_MATCHED");
  assert.equal(m.decideSourceLinkV041(packageRecord, "source-db-other", [baseCandidate]).status, "SOURCE_DATABASE_MISMATCH");
  m.recordSourceLinkAttemptV041({ databasePath: dbPath, aiRecordId, rawDatabaseIdentity: "source-db-golden-001", record: packageRecord, candidates: [baseCandidate] });
  m.recordSourceLinkAttemptV041({ databasePath: dbPath, aiRecordId, rawDatabaseIdentity: "source-db-golden-001", record: packageRecord, candidates: [baseCandidate] });
  const links = new DatabaseSync(dbPath, { readOnly: true }); assert.equal(links.prepare("SELECT COUNT(*) value FROM source_link_attempts").get().value, 2); links.close();

  const appSource = fs.readFileSync(path.join(root, "src", "routes", "AiDatabaseViewerPagesV041.tsx"), "utf8");
  assert.match(appSource, /ActivityComparisonTable/);
  assert.doesNotMatch(appSource, /Top Filters|TopFilters/);
  assert.match(fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8"), /AiViewerStateProvider/);
  assert.match(fs.readFileSync(path.join(root, "src", "routes", "DashboardPage.tsx"), "utf8"), /DatabaseOverviewToolbar/);
  assert.match(fs.readFileSync(path.join(root, "src", "routes", "AiDatabasePage.tsx"), "utf8"), /DatabaseOverviewToolbar/);
  assert.match(fs.readFileSync(path.join(root, "package.json"), "utf8"), /"test:v0\.3\.41"/);
  console.log(JSON.stringify({ status: "PASS", version: "0.3.41", contracts: 3, goldenRecords: 3, losslessReadBack: true, idempotent: true, reviewRankProtection: true, appendOnlyLinkAttempts: 2, componentReuse: true }, null, 2));
} finally { try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { console.warn(`cleanup warning: ${error.code}`); } }
