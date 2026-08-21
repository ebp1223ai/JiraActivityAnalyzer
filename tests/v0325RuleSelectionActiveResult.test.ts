import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuleSelectionTransactionServiceV0325, normalizeRuleSelectionErrorV0325, V0325_RULE_FILES } from "../electron/aiAnalysisRulesV0325.js";
import { ActiveResultRegistryV0325, AnalysisAttemptStoreV0325, navigationDecisionV0325 } from "../electron/aiAnalysisResultStateV0325.js";
import type { AiAnalysisRun, AiRuleDocumentRole } from "../shared/aiAnalysisContract.js";
const root = process.cwd();
const rulesDir = path.join(root, "rules", "v0.3.25");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0325-"));
const sha256 = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");

try {
  const service = new RuleSelectionTransactionServiceV0325(rulesDir, path.join(temp, "rule-state"));
  const bundledActive = service.transaction.activeSet;
  assert.ok(bundledActive, "bundled Active Set must initialize");
  const roles: AiRuleDocumentRole[] = ["manifest", "common_rules", "catalog", "html_template"];
  for (let index = 0; index < 3; index += 1) {
    const role = roles[index];
    const result = service.selectRole(role, path.join(rulesDir, V0325_RULE_FILES[role].fileName));
    assert.equal(result.activated, false);
    assert.equal(service.transaction.activeSet?.activeSetId, bundledActive.activeSetId, "1/2/3 roles must not replace Active");
  }
  const fourth = service.selectRole("html_template", path.join(rulesDir, V0325_RULE_FILES.html_template.fileName));
  assert.equal(fourth.activated, true);
  assert.equal(service.transaction.activeSet?.mode, "MANUAL_EXPLICIT");
  assert.equal(service.rules?.catalogCount, 279);

  const activeBeforeBad = service.transaction.activeSet?.activeSetId;
  const badDir = path.join(temp, "bad"); fs.mkdirSync(badDir);
  const badPath = path.join(badDir, V0325_RULE_FILES.common_rules.fileName);
  fs.writeFileSync(badPath, fs.readFileSync(path.join(rulesDir, V0325_RULE_FILES.common_rules.fileName), "utf8") + String.fromCharCode(10) + "changed", "utf8");
  const bad = service.selectRole("common_rules", badPath);
  assert.equal(bad.activated, false);
  assert.equal(bad.error?.code, "AI_RULE_FILE_HASH_MISMATCH");
  assert.equal(service.transaction.activeSet?.activeSetId, activeBeforeBad, "invalid Draft must preserve Active");
  service.cancelDraft();
  assert.equal(service.transaction.draftSet, null);
  service.useBundled();
  assert.equal(service.transaction.activeSet?.mode, "BUNDLED_DEFAULT");
  assert.doesNotMatch(normalizeRuleSelectionErrorV0325({}).message, /undefined/i);

  const attemptStore = new AnalysisAttemptStoreV0325(path.join(temp, "attempts"));
  const attempt = attemptStore.begin({ pendingDatasetSha256: "dataset-hash", activeRuleSetId: service.transaction.activeSet?.activeSetId ?? null, instructionMode: "STANDARD_FORMAL" });
  const denied = attemptStore.navigation(attempt, navigationDecisionV0325({ attempt, run: null, active: null }));
  assert.equal(denied.decision, "DENY");
  attemptStore.preflightFailed(attempt, "ANALYSIS_INPUT_INVALID", "synthetic preflight");
  assert.equal(attemptStore.find(attempt.analysisAttemptId)?.linkedRunId, null);

  const analyzedPath = path.join(temp, "analysis-result.json");
  fs.writeFileSync(analyzedPath, JSON.stringify({ schemaVersion: "0.3.24-v1", records: [{}] }), "utf8");
  const analyzedBytes = fs.readFileSync(analyzedPath);
  const run = {
    runId: "analysis_test",
    status: "completed",
    results: [{ resultId: "r1" }],
    selectedDiffIds: ["d1"],
    analyzedFilePath: analyzedPath,
    analyzedFileSha256: sha256(analyzedBytes),
    completedAt: "2026-08-20T10:00:00.000Z",
    sourceFileSha256: "dataset-hash",
    rules: { ruleSetId: "rules-test" }
  } as unknown as AiAnalysisRun;
  const registry = new ActiveResultRegistryV0325(path.join(temp, "results"));
  const active = registry.activateRun(run, "ANALYSIS_RUN");
  assert.equal(active.recordCount, 1);
  assert.equal(registry.activateRun(run, "ANALYSIS_RUN").activeResultId, active.activeResultId, "same artifact must be idempotent");
  const linkedAttempt = attemptStore.begin({ pendingDatasetSha256: "dataset-hash", activeRuleSetId: "rules-test", instructionMode: "STANDARD_FORMAL" });
  attemptStore.linkRun(linkedAttempt, run.runId);
  const allowed = attemptStore.navigation(linkedAttempt, navigationDecisionV0325({ attempt: linkedAttempt, run, active: registry.active }));
  assert.equal(allowed.decision, "ALLOW");

  const invalidRun = { ...run, runId: "bad-count", selectedDiffIds: ["d1", "d2"] } as AiAnalysisRun;
  assert.throws(() => registry.activateRun(invalidRun, "ANALYSIS_RUN"));
  assert.equal(registry.active?.activeResultId, active.activeResultId, "failed result must not replace Active");

  const bridgeFiles = fs.readdirSync(path.join(root, "dist-electron")).filter((name) => /^analysis-bridge-v[0-9]+[.]cjs$/.test(name));
  assert.equal(bridgeFiles.length, 1, "electron build must remove stale Bridge bundles");
  assert.match(bridgeFiles[0] ?? "", /^analysis-bridge-v0326[.]cjs$/, "electron build must package only the current v0.3.26 Bridge");
  const ui = fs.readFileSync(path.join(root, "src", "ai-analysis", "AiAnalysisReconstructedPage.tsx"), "utf8");
  assert.ok(ui.includes('result.navigationDecision?.decision === "ALLOW"'));
  assert.match(ui, /snapshot.activeResult/);
  assert.doesNotMatch(ui.slice(ui.indexOf("function ResultsPage"), ui.indexOf("export function AiAnalysisReconstructedPage")), /resultConversation|完整分析對話|Bridge Integrity|Run Cumulative Tokens/);
  console.log("v0.3.25 focused contract tests passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
