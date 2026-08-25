const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { api } = require("./v0337-test-helpers.cjs");
const m = api();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0337-mock-"));
const request = { schemaVersion: m.PROVIDER_REQUEST_CONTRACT_V0337, runId: "mock-17", providerId: m.MOCK_PROVIDER_ID_V0337, inputBindings: [], effectiveInstruction: { text: "test", bytes: 4, sha256: "a".repeat(64), identity: "test" }, expectedRecordCount: 17, decisionContract: "jaa-ai-analysis-decisions-v5", artifactContract: m.PROVIDER_ARTIFACT_CONTRACT_V0337, locale: "zh-TW", cancellation: new AbortController().signal, options: {} };
(async () => {
  const adapter = new m.MockAnalysisProviderAdapterV0337("artifact_before_terminal"); const events = [];
  const result = await adapter.analyze(request, { append(event) { events.push(event); } }); assert.equal(result.artifact.decisions.length, 17); assert.equal(result.artifact.providerId, m.MOCK_PROVIDER_ID_V0337); m.assertProviderArtifactBoundaryV0337(result.artifact);
  const artifactBytes = Buffer.from(JSON.stringify({ schemaVersion: "jaa-ai-submitted-artifact-v1", decisions: result.artifact.decisions, analysisReportMarkdown: result.artifact.analysisReportMarkdown, finalSummaryZhTw: result.artifact.finalAssistantSummary }, null, 2) + "\n");
  const persisted = m.persistProviderArtifactV0337({ runDirectory: temporary, runId: request.runId, artifactBytes, validateBinding() {} });
  const oldTerminalPath = path.join(temporary, "progress", "run-terminal.json"); fs.writeFileSync(oldTerminalPath, JSON.stringify({ terminalOutcome: "FAILED_NO_ARTIFACT", rootErrorCode: "AI_ARTIFACT_SUBMISSION_MISSING" }) + "\n"); const oldBytes = fs.readFileSync(oldTerminalPath);
  let sideEffects = 0; const actions = m.buildIsolatedRecoveryActionsV0337(temporary, request.runId, persisted.artifactSha256); for (const action of Object.values(actions)) { const original = action; Object.defineProperty(actions, Object.keys(actions).find((key) => actions[key] === action), { value: () => { sideEffects++; return original(); }, enumerable: true }); }
  const recovery = m.recoverPersistedArtifactV0337({ runDirectory: temporary, runId: request.runId, actions, sqliteIsolation: true, oldTerminalPath }); assert.equal(recovery.pipeline.receipts.length, 14); assert.equal(recovery.pipeline.receipts.at(-1).outcome, "NOT_RUN_BY_TEST_ISOLATION"); assert.equal(recovery.providerContacted, false); assert.equal(recovery.providerTokenDelta, 0); assert.deepEqual(fs.readFileSync(oldTerminalPath), oldBytes); assert.ok(recovery.supersessionReceiptPath && fs.existsSync(recovery.supersessionReceiptPath)); assert.equal(sideEffects, 13);
  const second = m.recoverPersistedArtifactV0337({ runDirectory: temporary, runId: request.runId, actions, sqliteIsolation: true, oldTerminalPath }); assert.equal(second.pipeline.completed, true); assert.equal(sideEffects, 13); assert.deepEqual(fs.readFileSync(persisted.artifactPath), artifactBytes);
  for (const scenario of ["failed", "cancelled"]) { const value = await new m.MockAnalysisProviderAdapterV0337(scenario).analyze({ ...request, runId: `mock-${scenario}` }, { append() {} }); assert.equal(value.terminal, scenario); assert.equal(value.artifact, null); }
  console.log("v0.3.37 Mock Provider 17-record durable persist and 14-stage idempotent recovery passed; network=false; codexProcess=false; auth=false; productionSqliteWritten=false");
})().catch((error) => { console.error(error); process.exitCode = 1; });