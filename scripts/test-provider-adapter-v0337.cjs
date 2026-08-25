const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { api, root } = require("./v0337-test-helpers.cjs");
const m = api();
const request = { schemaVersion: m.PROVIDER_REQUEST_CONTRACT_V0337, runId: "adapter-run", providerId: m.CHATGPT_CODEX_PROVIDER_ID_V0337, inputBindings: [{ role: "PENDING_ANALYSIS_JSON", fileName: "pending.json", bytes: 10, sha256: "a".repeat(64), providerVisible: true }, { role: "RULE_SET_MANIFEST", fileName: "manifest.md", bytes: 10, sha256: "b".repeat(64), providerVisible: true }, { role: "COMMON_RULES", fileName: "rules.md", bytes: 10, sha256: "c".repeat(64), providerVisible: true }, { role: "SKILL_CATALOG", fileName: "catalog.md", bytes: 10, sha256: "d".repeat(64), providerVisible: true }], effectiveInstruction: { text: "繁體中文正式分析", bytes: 24, sha256: "e".repeat(64), identity: "JAA-CHATGPT-ZH-TW-0.3.37" }, expectedRecordCount: 17, decisionContract: "jaa-ai-analysis-decisions-v5", artifactContract: m.PROVIDER_ARTIFACT_CONTRACT_V0337, locale: "zh-TW", cancellation: new AbortController().signal, options: {} };
let transportCalls = 0; const events = [];
const adapter = new m.ChatGptCodexProviderAdapterV0337(async () => { transportCalls++; return { text: "完成", requestId: "request", threadId: "thread", turnId: "turn" }; }, async () => true, () => true);
const registry = new m.AnalysisProviderRegistryV0337().register(adapter).register(new m.MockAnalysisProviderAdapterV0337());
(async () => {
  const result = await registry.require(m.CHATGPT_CODEX_PROVIDER_ID_V0337).analyze(request, { append(event) { events.push(event); } });
  assert.equal(result.terminal, "completed"); assert.equal(transportCalls, 1); assert.deepEqual(events.map((event) => event.type), ["prepared", "completed"]);
  const capabilities = await registry.productionCapabilities(); assert.deepEqual(capabilities.map((item) => item.providerId), [m.CHATGPT_CODEX_PROVIDER_ID_V0337]); assert.ok(!capabilities.some((item) => item.providerId === m.MOCK_PROVIDER_ID_V0337));
  assert.throws(() => m.assertProviderArtifactBoundaryV0337({ schemaVersion: m.PROVIDER_ARTIFACT_CONTRACT_V0337, providerId: "x", decisions: [], providerReceiptRef: "r", canonicalResult: {} }), /HOST_FIELD_FORBIDDEN/);
  const coreFiles = ["providerAnalysisContractsV0337.ts", "durableArtifactTruthResolverV0337.ts", "terminalOutcomeReducerV0337.ts", "postArtifactPipelineV0337.ts", "recoveryServiceV0337.ts"];
  for (const name of coreFiles) { const source = fs.readFileSync(path.join(root, "electron", name), "utf8"); assert.doesNotMatch(source, /from ["'][^"']*(chatGpt|codex|thread|turn)/i, `${name} imports provider concrete types`); }
  console.log("v0.3.37 provider adapter boundary passed; one transport call; no fallback; Mock excluded from production capabilities");
})().catch((error) => { console.error(error); process.exitCode = 1; });