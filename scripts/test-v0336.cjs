const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { api, root } = require("./v0336-test-helpers.cjs");
const m = api();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0336-"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

assert.equal(m.ANALYSIS_BRIDGE_VERSION, "0.3.37-bridge-v17");
assert.equal(m.RUNTIME_CONTRACT_V0336.applicationVersion, "0.3.36");
assert.equal(m.RUNTIME_CONTRACT_V0336.promptTemplateVersion, "0.3.36-zh-TW-v17");
assert.equal(m.RUNTIME_CONTRACT_V0336.hostLifecycleContract, "jaa-host-control-lifecycle-v3");
assert.equal(m.RUNTIME_CONTRACT_V0336.terminalOutcomeReducer, "jaa-terminal-outcome-reducer-v1");
assert.equal(m.RUNTIME_CONTRACT_V0336.postArtifactPipeline, "jaa-post-artifact-pipeline-v1");
assert.ok(Object.isFrozen(m.RUNTIME_CONTRACT_V0336));

const rulesDir = path.join(root, "rules", "v0.3.36");
for (const [name, bytes, sha] of [
  ["Skill_Classification_Common_Rules_v1.6.5.md", 51776, "c819004275aff3c6b3fc646b994ef1077a8e4385730e07460fdd0e36d4aef10d"],
  ["Skill_Catalog_v0.3.1.md", 24636, "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d"],
  ["Skill_Analysis_HTML_Report_Template_v1.5.1.md", 38057, "dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02"]
]) { const body = fs.readFileSync(path.join(rulesDir, name)); assert.equal(body.length, bytes); assert.equal(hash(body), sha); }
const rules = m.loadExplicitRulesSnapshotV0336({ mode: "BUNDLED_DEFAULT", manifest: path.join(rulesDir, "Skill_Analysis_Rule_Set_Manifest_v0.8.5.md"), commonRules: path.join(rulesDir, "Skill_Classification_Common_Rules_v1.6.5.md"), catalog: path.join(rulesDir, "Skill_Catalog_v0.3.1.md"), htmlTemplate: path.join(rulesDir, "Skill_Analysis_HTML_Report_Template_v1.5.1.md") });
assert.equal(rules.promptVersion, "JAA-CHATGPT-ZH-TW-0.3.36");
assert.equal(rules.classificationEngineVersion, "JAA-CLASSIFICATION-1.6.5");

const base = { providerTerminal: null, durableArtifactPersisted: false, artifactSha256: null, contentValidationFailed: false, postArtifactTerminalOutcome: null };
for (const [providerTerminal, artifact, outcome] of [["completed", true, "CONTINUE_POST_ARTIFACT"], ["failed", true, "CONTINUE_POST_ARTIFACT"], ["cancelled", true, "CONTINUE_POST_ARTIFACT"], ["completed", false, "FAILED_NO_ARTIFACT"], ["failed", false, "FAILED_PROVIDER"], ["cancelled", false, "CANCELLED"]]) {
  const input = { ...base, providerTerminal, durableArtifactPersisted: artifact, artifactSha256: artifact ? "a".repeat(64) : null };
  assert.equal(m.reduceTerminalOutcomeV0336(input).outcome, outcome);
  assert.deepEqual(m.reduceTerminalOutcomeV0336(input), m.reduceTerminalOutcomeV0336(input));
}
const derived = m.reduceTerminalOutcomeV0336({ ...base, providerTerminal: "failed", durableArtifactPersisted: true, artifactSha256: "a".repeat(64) });
assert.equal(derived.analysisStarted, true); assert.equal(derived.analysisCompleted, true); assert.equal(derived.analysisTelemetry, "COMPLETED_BY_ARTIFACT"); assert.equal(derived.providerWarning, "PROVIDER_FAILED_AFTER_ARTIFACT");

const artifactLifecycle = new m.ArtifactLifecycleV0336(); assert.equal(artifactLifecycle.transition("received"), "received"); assert.equal(artifactLifecycle.transition("persisted"), "persisted"); assert.throws(() => artifactLifecycle.transition("formally_published"), /AI_ARTIFACT_STATE_TRANSITION_INVALID/); assert.equal(artifactLifecycle.transition("content_validated"), "content_validated"); assert.equal(artifactLifecycle.transition("formally_published"), "formally_published");
const sanitized = m.sanitizeChatGptValueComplete({ inputTokens: 1977962, cachedInputTokens: 1836032, outputTokens: 10530, reasoningTokens: 1877, totalTokens: 1988492, authorization: "Bearer secret-value", token: "secret-value", modelContextWindow: null }); assert.equal(sanitized.inputTokens, 1977962); assert.equal(sanitized.totalTokens, 1988492); assert.equal(sanitized.authorization, "[masked]"); assert.equal(sanitized.token, "[masked]"); assert.equal(sanitized.modelContextWindow, null);
const terminalDir = path.join(temporary, "terminal"); const terminal = new m.TerminalOutcomeServiceV0336(terminalDir, "run-1");
terminal.artifactPersisted("a".repeat(64)); terminal.providerTerminal("failed"); assert.equal(fs.existsSync(path.join(terminalDir, "progress", "run-terminal.json")), false);
terminal.postArtifactTerminal("SUCCEEDED"); terminal.postArtifactTerminal("SUCCEEDED");
assert.equal(JSON.parse(fs.readFileSync(path.join(terminalDir, "progress", "run-terminal.json"))).terminalOutcome, "SUCCEEDED");

const pipelineDir = path.join(temporary, "pipeline"); let sideEffects = 0; const pipeline = new m.PostArtifactPipelineV0336(pipelineDir, "run-p", "b".repeat(64));
for (const stage of m.POST_ARTIFACT_STAGES_V0336.slice(0, 3)) pipeline.runStage(stage, () => { sideEffects += 1; return {}; });
assert.equal(pipeline.snapshot().nextStage, "ANALYZED_RESULT_PUBLISH");
const resumed = new m.PostArtifactPipelineV0336(pipelineDir, "run-p", "b".repeat(64));
for (const stage of m.POST_ARTIFACT_STAGES_V0336) resumed.runStage(stage, () => { sideEffects += 1; return {}; }, stage === "SQLITE_GATE");
assert.equal(sideEffects, 7); assert.equal(resumed.snapshot().nextStage, null);

const identityInput = { analysisAttemptId: "attempt", runId: "run", requestId: "request", threadId: "thread", turnId: "turn", provider: "chatgpt_codex", model: "model", sourceDatasetSha256: "c".repeat(64), sourceDatasetBytes: 123, sourceRecordCount: 17, rulesSnapshotId: "rules", manifestSha256: "d".repeat(64), commonRulesSha256: "e".repeat(64), catalogSha256: "f".repeat(64), outputSchemaSha256: "1".repeat(64) };
const expected = m.sealDispatchExpectedIdentityV0336(identityInput); const actual = m.injectArtifactActualIdentityV0336(identityInput, expected.createdAtUtc);
assert.notEqual(expected, actual); assert.equal(m.buildArtifactIdentityReceiptV0336(expected, actual, "MATCH").accepted, true);
const staleRegistry = Object.freeze({ ...m.RUNTIME_CONTRACT_V0336, applicationVersion: "0.3.35", promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.35", bridgeIdentity: "0.3.35-bridge-v15" });
const stale = m.injectArtifactActualIdentityV0336(identityInput, expected.createdAtUtc, staleRegistry);
const mismatch = m.buildArtifactIdentityReceiptV0336(expected, stale, "MATCH"); assert.equal(mismatch.accepted, false); assert.ok(mismatch.comparisons.some((entry) => !entry.match));

const artifactPath = path.join(temporary, "artifact.json"); const bytes = Buffer.from('{"decisions":17}\n'); fs.writeFileSync(artifactPath, bytes);
const reconciliation = m.reconcileLifecycleV0336({ controlState: "VALIDATING", artifactStatus: "persisted", artifactPath, artifactBytes: bytes.length, artifactSha256: hash(bytes), validationReceipts: [{ stage: "DECISION_SCHEMA", outcome: "PASSED" }], firstFailedStage: null, rootErrorCode: null, terminalOutcome: null });
assert.equal(reconciliation.valid, true); assert.equal(reconciliation.derivedAnalysisStarted, true); assert.equal(reconciliation.derivedAnalysisCompleted, true);

const bridgeSource = fs.readFileSync(path.join(root, "electron", "analysisBridgeRuntimeV0336.ts"), "utf8"); const ipcSource = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
assert.match(bridgeSource, /artifact-final-summary\.txt/); assert.match(ipcSource, /provider-final-assistant-message\.txt/); assert.doesNotMatch(ipcSource, /ai-output", "final-assistant-message\.txt/);
console.log("v0.3.36 terminal reconciliation, identity, artifact separation, and reentrant pipeline tests passed; providerCalled=false; productionSqliteWritten=false");