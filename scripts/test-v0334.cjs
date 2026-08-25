const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { api, root } = require("./v0334-test-helpers.cjs");
const m = api();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0334-"));

assert.equal(m.ANALYSIS_BRIDGE_VERSION, "0.3.36-bridge-v16");
assert.equal(m.RUNTIME_CONTRACT_V0334.applicationVersion, "0.3.34");
assert.equal(m.RUNTIME_CONTRACT_V0334.promptTemplateVersion, "0.3.34-zh-TW-v15");
assert.equal(m.RUNTIME_CONTRACT_V0334.bridgeIdentity, "0.3.34-bridge-v14");

const rulesDir = path.join(root, "rules", "v0.3.34");
const expected = {
  "Skill_Analysis_Rule_Set_Manifest_v0.8.3.md": [31216, "1c2c4c5e525565a2da609eb0e3aac3b3b89b38a830416140743edfb350c0152f"],
  "Skill_Classification_Common_Rules_v1.6.3.md": [44599, "9b7a9a537fa5d86d79f8881700043da26d15b4e575d8843c30235a5be74efb5a"],
  "Skill_Catalog_v0.3.1.md": [24636, "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d"],
  "Skill_Analysis_HTML_Report_Template_v1.5.1.md": [38057, "dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02"]
};
for (const [name, [bytes, sha]] of Object.entries(expected)) { const data = fs.readFileSync(path.join(rulesDir, name)); assert.equal(data.length, bytes); assert.equal(hash(data), sha); }
const rules = m.loadExplicitRulesSnapshotV0334({ mode: "BUNDLED_DEFAULT", manifest: path.join(rulesDir, "Skill_Analysis_Rule_Set_Manifest_v0.8.3.md"), commonRules: path.join(rulesDir, "Skill_Classification_Common_Rules_v1.6.3.md"), catalog: path.join(rulesDir, "Skill_Catalog_v0.3.1.md"), htmlTemplate: path.join(rulesDir, "Skill_Analysis_HTML_Report_Template_v1.5.1.md") });
assert.equal(rules.promptVersion, "JAA-CHATGPT-ZH-TW-0.3.34");
assert.equal(rules.classificationEngineVersion, "JAA-CLASSIFICATION-1.6.3");

const context = new m.BridgeExecutionContextV0334({ runDirectory: path.join(temporary, "context"), analysisAttemptId: "attempt", internalRunId: "run", provider: "test", model: "test", sourceInputIdentity: "source", rulesSnapshotId: "rules", expectedRecordCount: 17, sessionNonce: "nonce" });
context.registerTools(); context.bindThread("thread"); context.bindTurn("thread", "turn");
const handle = context.issueDeliveryHandle("manifest", "source-receipt");
context.completeDeliveryHandle(handle, { threadId: "thread", turnId: "turn" });
assert.equal(context.validateDeliveryHandle(handle, { threadId: "thread", turnId: "turn" }, "readonly").operation, "readonly");
assert.equal(context.completeDeliveryHandle(handle, { threadId: "thread", turnId: "turn" }).operation, "finalize");
assert.throws(() => context.validateDeliveryHandle(handle, { threadId: "thread", turnId: "turn" }, "mutation"), /AI_MODEL_DELIVERY_HANDLE_REPLAYED/);

const lifecycle = new m.ProviderLifecycleV0334(path.join(temporary, "lifecycle"));
lifecycle.transition("PROVIDER_DISPATCHED"); lifecycle.transition("INPUT_READING");
const first = lifecycle.finalize({ bindingHash: "binding", receipt: { deliveredRecords: 17 } });
assert.equal(lifecycle.snapshot().state, "INPUT_READY");
assert.equal(lifecycle.finalize({ bindingHash: "binding", receipt: { ignored: true } }).lifecycleReceiptId, first.lifecycleReceiptId);
assert.throws(() => lifecycle.finalize({ bindingHash: "different", receipt: {} }), /AI_MODEL_DELIVERY_FINALIZE_MISMATCH/);
assert.equal(lifecycle.reportProgress({ phase: "ANALYSIS_STARTED", expectedCount: 17, completedCount: 1, decisionPreparedCount: 0, message: "start" }).accepted, true);
assert.equal(lifecycle.reportProgress({ phase: "ANALYSIS_COMPLETED", expectedCount: 17, completedCount: 0, decisionPreparedCount: 0, message: "late telemetry" }).warning.code, "AI_ANALYSIS_PROGRESS_NON_MONOTONIC");
assert.notEqual(lifecycle.snapshot().state, "TERMINAL");

const receiptsDir = path.join(temporary, "causality");
m.writeValidationStageReceiptsV0333({ runDirectory: receiptsDir, inputHash: "input", failedStage: "DECISION_SCHEMA", rootErrorCode: "AI_DECISION_INVALID", findings: [], warningStages: [], blockedPendingAcceptanceStages: [], stageReasons: { DECISION_SCHEMA: "invalid" } });
const receipts = fs.readdirSync(path.join(receiptsDir, "validation-stage-receipts")).map((name) => JSON.parse(fs.readFileSync(path.join(receiptsDir, "validation-stage-receipts", name), "utf8")));
const failedIndex = receipts.findIndex((item) => item.stage === "DECISION_SCHEMA");
assert.ok(failedIndex >= 0); assert.equal(receipts[failedIndex].outcome, "FAILED");
assert.ok(receipts.slice(failedIndex + 1).every((item) => item.outcome === "NOT_RUN_DUE_TO_PRIOR_FAILURE"));

const bridgeSource = fs.readFileSync(path.join(root, "electron", "analysisBridgeRuntimeV0334.ts"), "utf8");
assert.match(bridgeSource, /AI_PROVIDER_RUN_LEVEL_FAILURE/);
assert.match(bridgeSource, /formalArtifactCreated: false/);
console.log("v0.3.34 offline tests passed; providerCalled=false");
