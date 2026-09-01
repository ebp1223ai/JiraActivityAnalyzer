const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { root, api } = require("./v0339-test-helpers.cjs");

const m = api();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0339-"));
const allowedRoot = path.join(temporary, "app-root", "databases", "ai-analysis");
const databasePath = path.join(allowedRoot, "jaa-ai-analysis.sqlite");
const ddlPath = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-v1.sql");
const schemaPath = path.join(root, "contracts", "ai-analysis", "jaa-ai-analysis-import-package_v1.0.0.schema.json");
const fixture = (name) => path.join(root, "tests", "fixtures", "v039", name);
const aiOnly = fixture("jaa-ai-analysis-import-59__ai-only__strict-canonical-v1.0.0.json");
const completed59 = fixture("jaa-ai-analysis-import-59__review-completed__converted-v1.0.0.json");
const completed17 = fixture("jaa-ai-analysis-import-17__review-completed__converted-v1.0.0.json");
const partial59 = fixture("jaa-ai-analysis-import-59__review-partial-54-of-59__converted-v1.0.0.json");
const negativeInline = fixture("jaa-ai-analysis-import-59__negative-inlineSegments__expected-preflight-fail.json");

function scalar(file, sql) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return Number(db.prepare(sql).get().value); } finally { db.close(); }
}

try {
  const missing = m.inspectAiAnalysisDatabase({ databasePath, allowedRoot });
  assert.equal(missing.lifecycleState, "NOT_CREATED");
  assert.equal(missing.canCreate, true);
  assert.equal(fs.existsSync(databasePath), false, "Lifecycle inspection must not lazily create SQLite.");

  const failedCreatePath = path.join(allowedRoot, "failed-create.sqlite");
  assert.throws(() => m.createAiAnalysisDatabaseAtomic({ databasePath: failedCreatePath, allowedRoot, ddlPath, appVersion: "0.3.39", failureInjectionStage: "AFTER_VALIDATE" }), /SYNTHETIC_CREATE_FAILURE_AFTER_VALIDATE/);
  assert.equal(fs.existsSync(failedCreatePath), false);
  assert.equal(fs.readdirSync(allowedRoot).filter((name) => name.includes("failed-create.sqlite") && (name.endsWith(".tmp") || name.endsWith("-wal") || name.endsWith("-shm"))).length, 0);
  const created = m.createAiAnalysisDatabaseAtomic({ databasePath, allowedRoot, ddlPath, appVersion: "0.3.39" });
  assert.equal(created.ok, true);
  assert.equal(created.snapshot.lifecycleState, "READY_EMPTY");
  assert.equal(created.receipt.atomicRename, true);
  assert.equal(fs.readdirSync(allowedRoot).filter((name) => name.endsWith(".tmp") || name.includes(".tmp-")).length, 0);
  assert.throws(() => m.createAiAnalysisDatabaseAtomic({ databasePath, allowedRoot, ddlPath, appVersion: "0.3.39" }), /AI_DATABASE_ALREADY_EXISTS/);
  assert.throws(() => m.createAiAnalysisDatabaseAtomic({ databasePath: path.join(temporary, "outside.sqlite"), allowedRoot, ddlPath, appVersion: "0.3.39" }), /AI_DATABASE_PATH_OUTSIDE_APP_ROOT/);

  for (const [name, records, findings, review] of [
    [path.basename(aiOnly), 59, 86, "AI_ONLY"],
    [path.basename(completed59), 59, 86, "REVIEW_COMPLETED"],
    [path.basename(completed17), 17, 39, "REVIEW_COMPLETED"],
    [path.basename(partial59), 59, 86, "REVIEW_PARTIAL"]
  ]) {
    const preview = m.validateAiImportPackage({ filePath: fixture(name), schemaPath, appVersion: "0.3.39", databasePath }).preview;
    assert.equal(preview.ok, true, `${name}: ${JSON.stringify(preview.errors)}`);
    assert.equal(preview.recordCount, records);
    assert.equal(preview.findingCount, findings);
    assert.equal(preview.reviewState, review);
  }

  const negative = m.validateAiImportPackage({ filePath: negativeInline, schemaPath, appVersion: "0.3.39", databasePath }).preview;
  assert.equal(negative.ok, false);
  assert.ok(negative.errors.some((error) => error.code === "SCHEMA_VALIDATION_FAILED" && error.path === "$.records[0].sourceSnapshot.diffHunks[0].lines[0].inlineSegments" && /unexpected property inlineSegments/.test(error.message)), JSON.stringify(negative.errors));
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_import_batches"), 0);
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_analysis_records"), 0);

  const wrongRoleCases = [
    ["manual.json", { schemaName: "jaa-manual-skill-review", schemaVersion: "1.3.0" }, "WRONG_FILE_ROLE_MANUAL_REVIEW"],
    ["pending.json", { schemaName: "jira-activity-analyzer.pending-analysis", schemaVersion: "0.3.3-draft.1" }, "WRONG_FILE_ROLE_PENDING"],
    ["analyzed.json", { schemaName: "jaa-ai-analysis-result", schemaVersion: "5" }, "WRONG_FILE_ROLE_LEGACY_ANALYZED"],
    ["unknown.json", { hello: "world" }, "UNSUPPORTED_FILE_TYPE"]
  ];
  for (const [name, value, expectedCode] of wrongRoleCases) {
    const file = path.join(temporary, name); fs.writeFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
    const preview = m.validateAiImportPackage({ filePath: file, schemaPath, appVersion: "0.3.39", databasePath }).preview;
    assert.equal(preview.ok, false); assert.equal(preview.errors[0].code, expectedCode);
  }
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_import_batches"), 0);

  const first = m.importAiAnalysisPackage({ databasePath, ddlPath, schemaPath, packagePath: aiOnly, appVersion: "0.3.39" });
  assert.equal(first.insertedCount, 59); assert.equal(first.replacedCount, 0);
  const repeated = m.importAiAnalysisPackage({ databasePath, ddlPath, schemaPath, packagePath: aiOnly, appVersion: "0.3.39" });
  assert.equal(repeated.idempotent, true);
  const upgrade = m.importAiAnalysisPackage({ databasePath, ddlPath, schemaPath, packagePath: completed59, appVersion: "0.3.39" });
  assert.equal(upgrade.replacedCount, 59);
  const downgrade = m.importAiAnalysisPackage({ databasePath, ddlPath, schemaPath, packagePath: partial59, appVersion: "0.3.39" });
  assert.equal(downgrade.protectedSkipCount, 59);
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_analysis_records WHERE review_state='REVIEW_COMPLETED'"), 59);
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_skill_reviews WHERE verdict='ACCEPT'"), 81);
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_skill_reviews WHERE verdict='REJECT_EVIDENCE_INSUFFICIENT'"), 5);
  assert.equal(scalar(databasePath, "SELECT COUNT(*) value FROM ai_record_reviews WHERE status_agreement='DISAGREE'"), 10);

  const database17 = path.join(allowedRoot, "reviewed-17.sqlite");
  m.createAiAnalysisDatabaseAtomic({ databasePath: database17, allowedRoot, ddlPath, appVersion: "0.3.39" });
  const receipt17 = m.importAiAnalysisPackage({ databasePath: database17, ddlPath, schemaPath, packagePath: completed17, appVersion: "0.3.39" });
  assert.equal(receipt17.insertedCount, 17);
  assert.equal(scalar(database17, "SELECT COUNT(*) value FROM ai_analysis_records"), 17);
  assert.equal(scalar(database17, "SELECT COUNT(*) value FROM ai_skill_findings"), 39);
  assert.equal(scalar(database17, "SELECT COUNT(*) value FROM ai_additional_evidence_assignments"), 5);
  const populated = m.inspectAiAnalysisDatabase({ databasePath, allowedRoot });
  assert.equal(populated.lifecycleState, "READY_WITH_DATA");
  assert.equal(populated.recordCount, 59);
  assert.equal(populated.findingCount, 86);
  assert.equal(populated.importBatchCount, 3);

  const backupDirectory = path.join(temporary, "backups");
  const backup = m.backupAiAnalysisDatabase({ databasePath, allowedRoot, backupDirectory });
  assert.equal(backup.ok, true); assert.equal(fs.existsSync(backup.backupPath), true); assert.ok(backup.sizeBytes > 0);

  const zeroPath = path.join(allowedRoot, "zero.sqlite"); fs.writeFileSync(zeroPath, "");
  const zero = m.inspectAiAnalysisDatabase({ databasePath: zeroPath, allowedRoot });
  assert.equal(zero.lifecycleState, "READ_ONLY_DIAGNOSTIC"); assert.equal(zero.errorCode, "AI_DATABASE_EMPTY_OR_NOT_FILE"); assert.equal(fs.statSync(zeroPath).size, 0);

  const preload = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");
  const ipc = fs.readFileSync(path.join(root, "electron", "aiAnalysisDatabaseIpcV039.ts"), "utf8");
  assert.match(preload, /ai-database:lifecycle/); assert.match(preload, /ai-database:create/); assert.match(preload, /ai-database:backup/);
  assert.doesNotMatch(ipc, /ensureDatabase/); assert.match(ipc, /INVALID_REQUEST_ID/); assert.match(ipc, /AI_DATABASE_NOT_READY/);
  console.log("v0.3.39 lifecycle, atomic create, strict fixtures, file-role rejection, import protection, backup, and Bridge contract tests passed");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
