const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0338-test-helpers.cjs");
const m = api();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0338-"));
const ddlPath = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-v1.sql");
const schemaPath = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-import-package_v1.0.0.schema.json");
const aiOnlyPath = path.join(root, "tests", "fixtures", "v038", "jaa-ai-analysis-import-59__ai-only__v1.0.0.json");
const completedPath = path.join(root, "tests", "fixtures", "v038", "jaa-ai-analysis-import-59__review-completed__v1.0.0.json");

function dbPath(name) { return path.join(temporary, name, "jaa-ai-analysis.sqlite"); }
function scalar(file, sql) { const db = new DatabaseSync(file, { readOnly: true }); try { return Number(db.prepare(sql).get().value); } finally { db.close(); } }
function one(file, sql, ...values) { const db = new DatabaseSync(file, { readOnly: true }); try { return db.prepare(sql).get(...values); } finally { db.close(); } }
function imported(file, packagePath, options = {}) { return m.importAiAnalysisPackage({ databasePath: file, ddlPath, schemaPath, packagePath, appVersion: "0.3.38", ...options }); }

assert.equal(m.AI_IMPORT_SCHEMA_SHA256, "6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c");
const previewAi = m.validateAiImportPackage({ filePath: aiOnlyPath, schemaPath, appVersion: "0.3.38" }).preview;
const previewCompleted = m.validateAiImportPackage({ filePath: completedPath, schemaPath, appVersion: "0.3.38" }).preview;
assert.equal(previewAi.ok, true, JSON.stringify(previewAi.errors));
assert.equal(previewCompleted.ok, true, JSON.stringify(previewCompleted.errors));
assert.equal(previewAi.recordCount, 59); assert.equal(previewAi.findingCount, 86); assert.equal(previewAi.reviewState, "AI_ONLY");
assert.equal(previewCompleted.reviewState, "REVIEW_COMPLETED");

const fresh = dbPath("fresh");
const initialized = m.initializeAiAnalysisDatabase({ databasePath: fresh, ddlPath, appVersion: "0.3.38", databaseId: "ai-db-test" });
assert.equal(initialized.status, "READY"); assert.equal(initialized.schemaVersion, 1);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%'"), 12);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM sqlite_master WHERE type='view' AND name LIKE 'v_ai_%'"), 3);

const aiReceipt = imported(fresh, aiOnlyPath);
assert.equal(aiReceipt.insertedCount, 59); assert.equal(aiReceipt.replacedCount, 0); assert.equal(aiReceipt.protectedSkipCount, 0);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_analysis_records"), 59);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_skill_findings"), 86);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_source_links"), 59);
const repeated = imported(fresh, aiOnlyPath);
assert.equal(repeated.idempotent, true); assert.equal(repeated.importBatchId, aiReceipt.importBatchId);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_analysis_records"), 59);

const beforeUpgrade = one(fresh, "SELECT ai_record_id,first_imported_at_utc,row_version FROM ai_analysis_records ORDER BY ai_record_id LIMIT 1");
const completedReceipt = imported(fresh, completedPath);
assert.equal(completedReceipt.replacedCount, 59);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_analysis_records WHERE review_state='REVIEW_COMPLETED'"), 59);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_skill_reviews WHERE verdict='ACCEPT'"), 81);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_skill_reviews WHERE verdict='REJECT_EVIDENCE_INSUFFICIENT'"), 5);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_record_reviews WHERE status_agreement='DISAGREE'"), 10);
const afterUpgrade = one(fresh, "SELECT ai_record_id,first_imported_at_utc,row_version FROM ai_analysis_records WHERE ai_record_id=?", beforeUpgrade.ai_record_id);
assert.equal(afterUpgrade.ai_record_id, beforeUpgrade.ai_record_id); assert.equal(afterUpgrade.first_imported_at_utc, beforeUpgrade.first_imported_at_utc); assert.equal(afterUpgrade.row_version, 2);
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_source_link_attempts"), 118);

const protectedReceipt = imported(fresh, aiOnlyPath);
assert.equal(protectedReceipt.idempotent, true, "Previously completed package is globally idempotent and must not downgrade reviewed rows.");
assert.equal(scalar(fresh, "SELECT COUNT(*) value FROM ai_analysis_records WHERE review_state='REVIEW_COMPLETED'"), 59);

const protectedFresh = dbPath("protection");
imported(protectedFresh, completedPath);
const protection = imported(protectedFresh, aiOnlyPath);
assert.equal(protection.protectedSkipCount, 59); assert.equal(protection.replacedCount, 0);
assert.equal(scalar(protectedFresh, "SELECT COUNT(*) value FROM ai_analysis_records WHERE review_state='REVIEW_COMPLETED'"), 59);
assert.equal(scalar(protectedFresh, "SELECT COUNT(*) value FROM ai_import_actions WHERE action_type='SKIPPED_PROTECTED_REVIEW'"), 59);

const rollback = dbPath("rollback");
assert.throws(() => imported(rollback, aiOnlyPath, { failAfterRecord: 3 }), /SYNTHETIC_IMPORT_FAILURE/);
assert.equal(scalar(rollback, "SELECT COUNT(*) value FROM ai_analysis_records"), 0);
assert.equal(scalar(rollback, "SELECT COUNT(*) value FROM ai_import_batches"), 0);

const sourcePath = path.join(temporary, "source.sqlite");
const pkg = JSON.parse(fs.readFileSync(aiOnlyPath, "utf8"));
const first = pkg.records[0].sourceReference;
const source = new DatabaseSync(sourcePath);
source.exec("CREATE TABLE database_metadata(database_id TEXT); CREATE TABLE activity_events(id TEXT PRIMARY KEY,source_object_id TEXT,object_version_id TEXT,event_type TEXT,event_time TEXT,actor_account_id TEXT,actor_display_name TEXT,field_id TEXT,field_name TEXT,from_value_json TEXT,to_value_json TEXT,source_record_id TEXT,event_hash TEXT,created_at TEXT); CREATE TABLE source_objects(source_object_id TEXT PRIMARY KEY,object_key TEXT); INSERT INTO database_metadata VALUES('" + pkg.sourceBinding.sourceDatabaseId + "'); INSERT INTO source_objects VALUES('source-1','COPGEN1-148378');");
source.prepare("INSERT INTO activity_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(first.activityEventId, "source-1", "version-1", "field_change", first.eventTime, "user-1", "Test User", null, first.fieldName, null, "null", first.sourceRecordStableId, first.sourceContentHash, new Date().toISOString());
source.close();
const linked = dbPath("linked");
const linkedReceipt = imported(linked, aiOnlyPath, { sourceDatabasePath: sourcePath });
assert.equal(linkedReceipt.matchedCount, 1);
assert.equal(scalar(linked, "SELECT COUNT(*) value FROM ai_source_links WHERE link_status='MATCHED'"), 1);
const integrated = m.queryIntegratedResults(sourcePath, linked, { limit: 100, offset: 0, filters: { analysisState: "ALL" } });
assert.equal(integrated.total, 1); assert.equal(integrated.items[0].analysis_state, "ANALYZED_MATCHED");
const relink = m.relinkAiAnalysisSources({ databasePath: linked, sourceDatabasePath: sourcePath, appVersion: "0.3.38" });
assert.equal(relink.total, 59);
assert.equal(scalar(linked, "SELECT COUNT(*) value FROM ai_source_link_attempts"), 118);

const appText = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const sidebarText = fs.readFileSync(path.join(root, "src", "components", "Sidebar.tsx"), "utf8");
for (const route of ["/ai-database", "/ai-results", "/integrated-results"]) assert.match(appText, new RegExp(route));
assert.doesNotMatch(appText, /<AiAnalysisPage/); assert.match(sidebarText, /AI 分析（封存中）/); assert.doesNotMatch(sidebarText, /to="\/ai-analysis"/);
console.log("v0.3.38 schema, strict preflight, 59/86 golden import, idempotency, review protection, atomic rollback, source-link attempts, and archived-route tests passed");
