const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0341-test-helpers.cjs");
const m = api();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0341-integration-"));
const v1Ddl = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-v1.sql");
const v1Schema = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-import-package_v1.0.0.schema.json");
const v1Fixture = path.join(root, "tests", "fixtures", "v039", "jaa-ai-analysis-import-59__ai-only__strict-canonical-v1.0.0.json");
const v2Ddl = path.join(root, "contracts", "ai-analysis", "JAA_AI_Analysis_SQLite_Schema_v2.0.0.sql");

function buildV1(filePath) {
  m.initializeAiAnalysisDatabase({ databasePath: filePath, ddlPath: v1Ddl, appVersion: "0.3.40" });
  m.importAiAnalysisPackage({ databasePath: filePath, ddlPath: v1Ddl, schemaPath: v1Schema, packagePath: v1Fixture, appVersion: "0.3.40" });
}

try {
  const success = path.join(temp, "migration-success.sqlite"); buildV1(success);
  const receipt = m.migrateAiDatabaseV1ToV2Complete({ databasePath: success, ddlPath: v2Ddl, backupDirectory: path.join(temp, "backups") });
  assert.equal(receipt.legacyRecordCount, 59);
  assert.equal(receipt.migratedRecordCount, 59);
  assert.equal(receipt.partialTraceCount, 59);
  assert.equal(receipt.inventedSourceTraceCount, 0);
  assert.ok(fs.existsSync(receipt.backupPath));
  const migrated = new DatabaseSync(success, { readOnly: true });
  assert.equal(migrated.prepare("PRAGMA user_version").get().user_version, 2);
  assert.equal(migrated.prepare("SELECT COUNT(*) value FROM ai_records WHERE source_trace_status='PARTIAL' AND source_link_status='NOT_ATTEMPTED' AND integrity_status='UNVERIFIABLE'").get().value, 59);
  assert.equal(migrated.prepare("SELECT COUNT(*) value FROM ai_record_source_traces WHERE trace_completeness_status='PARTIAL'").get().value, 59);
  assert.equal(migrated.prepare("SELECT COUNT(*) value FROM ai_analysis_records").get().value, 59);
  assert.equal(migrated.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(migrated.prepare("PRAGMA foreign_key_check").all().length, 0);
  migrated.close();

  const rollback = path.join(temp, "migration-rollback.sqlite"); buildV1(rollback);
  assert.throws(() => m.migrateAiDatabaseV1ToV2Complete({ databasePath: rollback, ddlPath: v2Ddl, backupDirectory: path.join(temp, "backups"), failureInjection: "AFTER_DATA" }), /SYNTHETIC_MIGRATION_FAILURE_AFTER_DATA/);
  const rolledBack = new DatabaseSync(rollback, { readOnly: true });
  assert.equal(rolledBack.prepare("PRAGMA user_version").get().user_version, 1);
  assert.equal(rolledBack.prepare("SELECT COUNT(*) value FROM ai_analysis_records").get().value, 59);
  assert.equal(rolledBack.prepare("SELECT COUNT(*) value FROM sqlite_master WHERE type='table' AND name='ai_records'").get().value, 0);
  assert.equal(rolledBack.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  rolledBack.close();
  console.log(JSON.stringify({ status: "PASS", version: "0.3.41", migrated: 59, legacyPreserved: 59, partialTrace: 59, rollback: "PASS", backup: "PASS" }, null, 2));
} finally { try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { console.warn(`cleanup warning: ${error.code}`); } }
