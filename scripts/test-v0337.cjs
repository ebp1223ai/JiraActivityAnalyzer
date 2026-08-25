const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { api, root } = require("./v0337-test-helpers.cjs");
const m = api();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0337-"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

assert.equal(m.RUNTIME_CONTRACT_V0337.applicationVersion, "0.3.37");
assert.equal(m.RUNTIME_CONTRACT_V0337.promptTemplateVersion, "0.3.37-zh-TW-v18");
assert.equal(m.RUNTIME_CONTRACT_V0337.bridgeIdentity, "0.3.37-bridge-v17");
assert.equal(m.RUNTIME_CONTRACT_V0337.providerAdapter, "jaa-analysis-provider-adapter-v1");
assert.equal(m.RUNTIME_CONTRACT_V0337.durableArtifactTruthResolver, "jaa-durable-artifact-truth-resolver-v1");
assert.ok(Object.isFrozen(m.RUNTIME_CONTRACT_V0337));

const rulesDir = path.join(root, "rules", "v0.3.37");
for (const [name, bytes, sha] of [
  ["Skill_Classification_Common_Rules_v1.6.6.md", 56335, "bd1858c939fd6e240c5fd57bf7d28c90d52bd1b9cee8149daca7b4f1403c2da4"],
  ["Skill_Catalog_v0.3.1.md", 24636, "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d"],
  ["Skill_Analysis_HTML_Report_Template_v1.5.1.md", 38057, "dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02"]
]) { const body = fs.readFileSync(path.join(rulesDir, name)); assert.equal(body.length, bytes); assert.equal(hash(body), sha); }
const rules = m.loadExplicitRulesSnapshotV0337({ mode: "BUNDLED_DEFAULT", manifest: path.join(rulesDir, "Skill_Analysis_Rule_Set_Manifest_v0.8.6.md"), commonRules: path.join(rulesDir, "Skill_Classification_Common_Rules_v1.6.6.md"), catalog: path.join(rulesDir, "Skill_Catalog_v0.3.1.md"), htmlTemplate: path.join(rulesDir, "Skill_Analysis_HTML_Report_Template_v1.5.1.md") });
assert.equal(rules.promptVersion, "JAA-CHATGPT-ZH-TW-0.3.37"); assert.equal(rules.catalogCount, 279);

const runDirectory = path.join(temporary, "durable");
const artifactBody = Buffer.from(JSON.stringify({ schemaVersion: "jaa-ai-submitted-artifact-v1", decisions: [{ recordIndex: 0 }] }, null, 2) + "\n");
const persisted = m.persistProviderArtifactV0337({ runDirectory, runId: "run-durable", artifactBytes: artifactBody, validateBinding() {} });
const paths = { artifactPath: persisted.artifactPath, receiptPath: persisted.receiptPath, factJournalPath: path.join(runDirectory, "progress", "reducer-facts.jsonl") };
const truth = m.resolveDurableArtifactTruthV0337("run-durable", paths); assert.equal(truth.status, "PERSISTED_VALID"); assert.equal(truth.artifactSha256, hash(artifactBody));
for (const providerTerminal of ["completed", "failed", "cancelled"]) {
  const decision = m.reduceTerminalOutcomeV0337({ runDirectory, runId: "run-durable", providerTerminal, artifactPaths: paths, contentValidationFailed: false, postArtifactTerminalOutcome: null });
  assert.equal(decision.action, "RUN_POST_ARTIFACT"); assert.equal(decision.analysisTelemetry, "COMPLETED_BY_ARTIFACT"); assert.notEqual(decision.rootErrorCode, "AI_ARTIFACT_SUBMISSION_MISSING");
}
const missingDir = path.join(temporary, "missing"); fs.mkdirSync(missingDir, { recursive: true });
const missing = m.reduceTerminalOutcomeV0337({ runDirectory: missingDir, runId: "run-missing", providerTerminal: "completed", artifactPaths: { artifactPath: path.join(missingDir, "missing.json"), receiptPath: path.join(missingDir, "missing-receipt.json") }, contentValidationFailed: false, postArtifactTerminalOutcome: null }); assert.equal(missing.action, "FAILED_NO_ARTIFACT");

const corruptDir = path.join(temporary, "corrupt"); const corrupt = m.persistProviderArtifactV0337({ runDirectory: corruptDir, runId: "run-corrupt", artifactBytes: artifactBody, validateBinding() {} }); fs.appendFileSync(corrupt.artifactPath, "x");
const corruptTruth = m.resolveDurableArtifactTruthV0337("run-corrupt", { artifactPath: corrupt.artifactPath, receiptPath: corrupt.receiptPath, factJournalPath: path.join(corruptDir, "progress", "reducer-facts.jsonl") }); assert.equal(corruptTruth.status, "CORRUPT");
const guarded = m.reduceTerminalOutcomeV0337({ runDirectory: corruptDir, runId: "run-corrupt", providerTerminal: "completed", artifactPaths: { artifactPath: corrupt.artifactPath, receiptPath: corrupt.receiptPath, factJournalPath: path.join(corruptDir, "progress", "reducer-facts.jsonl") }, contentValidationFailed: false, postArtifactTerminalOutcome: null }); assert.equal(guarded.action, "RECONCILIATION_REQUIRED"); assert.equal(guarded.rootErrorCode, "AI_TERMINAL_FACT_RECONCILIATION_REQUIRED");

const journal = new m.ReducerFactJournalV0337(path.join(temporary, "journal"), "run-journal"); for (let i = 0; i < 25; i++) journal.append("PROVIDER_ACCEPTED", "race-test", { index: i }); const verified = journal.verify(); assert.equal(verified.valid, true); assert.equal(verified.facts.length, 25); assert.equal(new Set(verified.facts.map((fact) => fact.sequence)).size, 25);
assert.throws(() => journal.append("PROVIDER_SENT", "test", { authorization: "secret" }), /SENSITIVE_FIELD_FORBIDDEN/);
console.log("v0.3.37 durable truth, contradiction guard, ordering, journal, rules, and terminal matrix tests passed; providerContacted=false; productionSqliteWritten=false");