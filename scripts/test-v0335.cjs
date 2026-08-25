const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { api, root } = require("./v0335-test-helpers.cjs");

const m = api();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0335-"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

assert.equal(m.ANALYSIS_BRIDGE_VERSION, "0.3.37-bridge-v17");
assert.equal(m.RUNTIME_CONTRACT_V0335.applicationVersion, "0.3.35");
assert.equal(m.RUNTIME_CONTRACT_V0335.promptTemplateVersion, "0.3.35-zh-TW-v16");
assert.equal(m.RUNTIME_CONTRACT_V0335.hostLifecycleContract, "jaa-host-control-lifecycle-v2");
assert.equal(m.RUNTIME_CONTRACT_V0335.analysisTelemetryContract, "jaa-analysis-telemetry-v1");
assert.equal(m.RUNTIME_CONTRACT_V0335.artifactCompletionContract, "jaa-artifact-completion-boundary-v1");

const rulesDir = path.join(root, "rules", "v0.3.35");
const expected = {
  "Skill_Classification_Common_Rules_v1.6.4.md": [46756, "3b8cccc062db30a1dbc19ea0b7d75d0e19e44150ab805b2d8ae43ef68f054d57"],
  "Skill_Catalog_v0.3.1.md": [24636, "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d"],
  "Skill_Analysis_HTML_Report_Template_v1.5.1.md": [38057, "dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02"]
};
for (const [name, [bytes, sha]] of Object.entries(expected)) {
  const body = fs.readFileSync(path.join(rulesDir, name));
  assert.equal(body.length, bytes);
  assert.equal(hash(body), sha);
}
const rules = m.loadExplicitRulesSnapshotV0335({
  mode: "BUNDLED_DEFAULT",
  manifest: path.join(rulesDir, "Skill_Analysis_Rule_Set_Manifest_v0.8.4.md"),
  commonRules: path.join(rulesDir, "Skill_Classification_Common_Rules_v1.6.4.md"),
  catalog: path.join(rulesDir, "Skill_Catalog_v0.3.1.md"),
  htmlTemplate: path.join(rulesDir, "Skill_Analysis_HTML_Report_Template_v1.5.1.md")
});
assert.equal(rules.promptVersion, "JAA-CHATGPT-ZH-TW-0.3.35");
assert.equal(rules.classificationEngineVersion, "JAA-CLASSIFICATION-1.6.4");

const runDirectory = path.join(temporary, "controller");
const controller = m.getHostControlLifecycleControllerV0335(runDirectory);
assert.equal(m.getHostControlLifecycleControllerV0335(runDirectory), controller);
assert.equal(controller.snapshot().state, "ATTEMPT_CREATED");
controller.providerDispatched();
controller.inputSegmentRead();
assert.equal(controller.snapshot().state, "INPUT_READING");
controller.inputSegmentRead();
assert.equal(controller.snapshot().state, "INPUT_READING");
const firstFinalize = controller.finalize({ bindingHash: "binding", receipt: { modelInputDelivered: true, deliveredRecordCount: 17 } });
assert.equal(controller.snapshot().state, "INPUT_READY");
assert.equal(controller.finalize({ bindingHash: "binding", receipt: { ignored: true } }).lifecycleReceiptId, firstFinalize.lifecycleReceiptId);
assert.throws(() => controller.finalize({ bindingHash: "different", receipt: {} }), /AI_MODEL_DELIVERY_FINALIZE_MISMATCH/);
assert.equal(controller.snapshot().analysisTelemetry.state, "NOT_REPORTED");
controller.acceptArtifact("artifact-receipt", 17);
assert.equal(controller.snapshot().state, "VALIDATING");
assert.equal(controller.snapshot().analysisTelemetry.state, "COMPLETED_BY_ARTIFACT");
controller.complete("SUCCEEDED");
controller.complete("FAILED", "SHOULD_NOT_REPLACE");
assert.equal(controller.snapshot().transitionCount, 6);
assert.equal(controller.snapshot().terminal.outcome, "SUCCEEDED");

const telemetryRun = path.join(temporary, "telemetry");
const telemetry = new m.HostControlLifecycleControllerV0335(telemetryRun);
telemetry.providerDispatched(); telemetry.inputSegmentRead(); telemetry.finalize({ bindingHash: "telemetry", receipt: { modelInputDelivered: true } });
assert.equal(telemetry.reportProgress({ phase: "ANALYSIS_STARTED", expectedCount: 17, completedCount: 1, decisionPreparedCount: 0, message: "start" }).accepted, true);
assert.equal(telemetry.reportProgress({ phase: "ANALYSIS_COMPLETED", expectedCount: 17, completedCount: 0, decisionPreparedCount: 0, message: "late" }).warning.code, "AI_ANALYSIS_PROGRESS_NON_MONOTONIC");
telemetry.acceptArtifact("after-progress-warning", 17);
assert.equal(telemetry.snapshot().analysisTelemetry.state, "COMPLETED_BY_ARTIFACT");

const failedPostcondition = new m.HostControlLifecycleControllerV0335(path.join(temporary, "postcondition"), { failFinalizePostcondition: true });
failedPostcondition.providerDispatched(); failedPostcondition.inputSegmentRead();
assert.throws(() => failedPostcondition.finalize({ bindingHash: "bad", receipt: {} }), /AI_LIFECYCLE_POSTCONDITION_FAILED/);

const receiptDirectory = path.join(temporary, "receipts");
const passWithoutEvidence = Object.fromEntries(["TOKEN_BINDING", "SUBMISSION_DECODE", "DECISION_SCHEMA", "COUNT_INDEX_ORDER", "EVIDENCE_QUOTE_REFERENCE", "SOURCE_ROLE_ATTRIBUTION", "STATUS_SEMANTIC", "QUALITY_GATE", "CANONICAL_ASSEMBLY"].map((stage) => [stage, "PASSED"]));
assert.throws(() => m.writeValidationStageReceiptsV0335({ runDirectory: receiptDirectory, inputHash: "input", outcomes: passWithoutEvidence }), /AI_VALIDATION_PASS_WITHOUT_EVIDENCE/);
const isolatedOutcomes = Object.fromEntries(["TOKEN_BINDING", "SUBMISSION_DECODE", "DECISION_SCHEMA", "COUNT_INDEX_ORDER", "EVIDENCE_QUOTE_REFERENCE", "SOURCE_ROLE_ATTRIBUTION", "STATUS_SEMANTIC", "QUALITY_GATE"].map((stage) => [stage, "PASSED"]));
for (const stage of ["CANONICAL_ASSEMBLY", "ANALYZED_RESULT_PUBLISH", "ACTIVE_RESULT_COMMIT", "REPORT_PACKAGE", "HTML_RENDER", "SQLITE"]) isolatedOutcomes[stage] = "NOT_RUN_BY_TEST_ISOLATION";
const receipts = m.writeValidationStageReceiptsV0335({ runDirectory: path.join(temporary, "isolated"), inputHash: "input", outcomes: isolatedOutcomes });
assert.equal(receipts.receipts.length, 14);
assert.ok(receipts.receipts.slice(8).every((receipt) => receipt.outcome === "NOT_RUN_BY_TEST_ISOLATION"));

const bridgeSource = fs.readFileSync(path.join(root, "electron", "analysisBridgeRuntimeV0335.ts"), "utf8");
const validationSource = fs.readFileSync(path.join(root, "electron", "aiAnalysisValidationPipelineV0335.ts"), "utf8");
const ipcSource = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
assert.match(bridgeSource, /control\.inputSegmentRead\(\)/);
assert.match(bridgeSource, /control\.finalize/);
assert.match(bridgeSource, /control\.acceptArtifact/);
assert.doesNotMatch(bridgeSource, /this\.legacy\.handle\("jaa_publish_analysis_artifacts"/);
assert.doesNotMatch(validationSource, /delegated|placeholder/i);
assert.doesNotMatch(ipcSource, /Authoritative ANALYSIS_COMPLETED exact-count evidence is missing/);
assert.match(ipcSource, /ANALYZED_RESULT_PUBLISHED/);
assert.match(ipcSource, /ACTIVE_RESULT_COMMITTED/);
assert.match(ipcSource, /REPORT_PACKAGE_CREATED/);

console.log("v0.3.35 authoritative lifecycle tests passed; providerCalled=false; productionSqliteWritten=false");
