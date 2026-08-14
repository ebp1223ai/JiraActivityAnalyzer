import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { initializeAppRoot } from "../electron/appPaths.js";
import { readPublishedArtifacts, createArtifactWorkspaces, warningPersistenceGate } from "../electron/aiAnalysisArtifactsV0316.js";
import { AiAnalysisRunArchive, flushRunArchive } from "../electron/aiAnalysisRunArchiveV0314.js";
import { buildCapacityCalculationSnapshot } from "../electron/aiAnalysisV0312.js";
import {
  canonicalArtifactPaths,
  compareSandboxPolicies,
  createTokenTelemetry,
  rootArtifactError,
  sanitizedPolicyConfig,
  updateTokenTelemetry,
  validateConfigRequirements,
  workspaceWritePolicy,
  zeroDispatchTokenTelemetry
} from "../electron/codexWritableArtifactsV0317.js";

const root = fs.mkdtempSync(path.join(process.cwd(), "test-artifacts", "v0317-"));
initializeAppRoot(root);
try {
  const runRoot = path.join(root, "run");
  const outputRoot = path.join(runRoot, "ai-output");
  fs.mkdirSync(outputRoot, { recursive: true });
  assert.deepEqual(canonicalArtifactPaths(runRoot, outputRoot), { runRoot: fs.realpathSync(runRoot), outputRoot: fs.realpathSync(outputRoot) });
  assert.throws(() => canonicalArtifactPaths(runRoot, root), /AI_ARTIFACT_PATH_ESCAPE/);

  const policy = workspaceWritePolicy(outputRoot);
  assert.equal(policy.type, "workspaceWrite");
  assert.deepEqual(policy.writableRoots, [path.resolve(outputRoot)]);
  assert.equal(policy.networkAccess, false);
  const probe = sanitizedPolicyConfig("analysis_test", runRoot, policy);
  const comparison = compareSandboxPolicies(probe, structuredClone(probe), structuredClone(probe));
  assert.equal(comparison.matched, true);
  const mismatch = compareSandboxPolicies(probe, structuredClone(probe), sanitizedPolicyConfig("analysis_test", runRoot, workspaceWritePolicy(path.join(runRoot, "other"))));
  assert.equal(mismatch.matched, false);
  assert.equal(mismatch.errorCode, "AI_SANDBOX_POLICY_MISMATCH");

  assert.equal(validateConfigRequirements({ requirements: null }).accepted, true);
  assert.equal(validateConfigRequirements({ requirements: { allowedSandboxModes: ["read-only"] } }).workspaceWriteAllowed, false);
  assert.equal(validateConfigRequirements({ requirements: { allowedSandboxModes: ["workspace-write"], allowedApprovalPolicies: ["never"] } }).accepted, true);

  let telemetry = createTokenTelemetry(200_000);
  telemetry = updateTokenTelemetry(telemetry, { total: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, reasoningOutputTokens: 5, totalTokens: 125 }, last: { inputTokens: 30, cachedInputTokens: 10, outputTokens: 10, reasoningOutputTokens: 2, totalTokens: 42 } });
  telemetry = updateTokenTelemetry(telemetry, { total: { inputTokens: 300, cachedInputTokens: 120, outputTokens: 50, reasoningOutputTokens: 15, totalTokens: 365 }, last: { inputTokens: 60, cachedInputTokens: 20, outputTokens: 15, reasoningOutputTokens: 5, totalTokens: 80 } });
  assert.equal(telemetry.turnCumulative.totalTokens, 365);
  assert.equal(telemetry.lastModelCall.totalTokens, 80);
  assert.equal(telemetry.usageEventCount, 2);
  assert.equal(telemetry.maxObservedSingleCallTokens, 80);
  assert.equal(telemetry.maxObservedContextUtilizationPercent, 0.04);
  telemetry = updateTokenTelemetry(telemetry, { total: { totalTokens: 100 }, last: { totalTokens: 20 } });
  assert.equal(telemetry.turnCumulative.totalTokens, 365);
  assert.equal(telemetry.anomalies[0]?.code, "TOKEN_CUMULATIVE_ROLLBACK");
  const overContext = updateTokenTelemetry(createTokenTelemetry(100), { total: { totalTokens: 1_000 }, last: { totalTokens: 90 } });
  assert.equal(overContext.turnCumulative.totalTokens, 1_000);
  assert.equal(overContext.maxObservedContextUtilizationPercent, 90);
  assert.equal(zeroDispatchTokenTelemetry().availability, "actual_zero_no_model_dispatch");
  assert.equal(zeroDispatchTokenTelemetry().turnCumulative.totalTokens, 0);

  const capacity = buildCapacityCalculationSnapshot({ capacity: { providerId: "test", providerDisplayName: "Test", modelId: "test", modelDisplayName: "Test", source: "unavailable", status: "unavailable", tokens: null, rawSanitized: null }, rulesBytesUtf8: 300, pendingPayloadBytesUtf8: 600, wrapperInstructionsBytesUtf8: 900, finalSerializedPromptBytesUtf8: 900, recordCount: 1 });
  assert.equal(capacity.estimatedFinalInputTokens, capacity.estimatedRulesTokens + capacity.estimatedPendingPayloadTokens + capacity.estimatedWrapperTokens);
  assert.equal(capacity.estimatorVersion, "2.0");

  const artifactRun = path.join(root, "artifact-warning");
  fs.mkdirSync(path.join(artifactRun, "input-workspace"), { recursive: true });
  const artifacts = createArtifactWorkspaces(artifactRun);
  fs.writeFileSync(artifacts.decisions, "{}", "utf8");
  const optional = readPublishedArtifacts(artifacts);
  assert.deepEqual(optional.warnings.sort(), ["AI_ANALYSIS_REPORT_MISSING", "AI_FINAL_SUMMARY_MISSING"]);
  assert.equal(warningPersistenceGate({ structuralValidationPassed: true, warnings: optional.warnings }).sqliteEligible, false);
  fs.unlinkSync(artifacts.decisions);
  assert.throws(() => readPublishedArtifacts(artifacts), /ai-analysis-decisions.json is missing/);

  assert.equal(rootArtifactError([{ params: { item: { type: "commandExecution", status: "declined", command: "Set-Content ai-output/file", aggregatedOutput: "blocked by policy" } } }], "AI_DECISION_FILE_MISSING"), "AI_OUTPUT_WRITE_BLOCKED_BY_POLICY");
  assert.equal(rootArtifactError([], "AI_DECISION_FILE_MISSING"), "AI_DECISION_FILE_MISSING");

  const active = new AiAnalysisRunArchive("analysis_selected_active");
  active.append("system_event", "APP_ONLY", "active");
  const targeted = flushRunArchive(active.runId, "test_selected");
  assert.equal(targeted.runId, active.runId);
  assert.equal(targeted.status, "forced_durable_flush");
  assert.equal(targeted.completed, true);
  active.close("test");
  const terminal = flushRunArchive(active.runId, "test_terminal");
  assert.equal(terminal.status, "not_applicable_terminal_already_flushed");
  assert.equal(terminal.requested, false);

  const service = fs.readFileSync(path.join(process.cwd(), "electron", "chatGptService.ts"), "utf8");
  assert.match(service, /dynamicTools/);
  assert.match(service, /sandbox: "read-only"/);
  assert.doesNotMatch(service, /command\/exec|Get-Content|Set-Content|Move-Item/);
  assert.match(service, /loadAnalysisBridge/);
  const ipc = fs.readFileSync(path.join(process.cwd(), "electron", "aiAnalysisIpc.ts"), "utf8");
  assert.match(ipc, /actual_zero_no_model_dispatch/);
  assert.match(service, /releaseBridge/);
  const main = fs.readFileSync(path.join(process.cwd(), "electron", "main.ts"), "utf8");
  assert.match(main, /getSelectedCanonicalAiRunDirectory/);
  assert.match(main, /incomplete_expected_for_failed_run/);
  assert.match(main, /exportStatus/);
  assert.match(main, /contentCompleteness/);
  const archiveSource = fs.readFileSync(path.join(process.cwd(), "electron", "aiAnalysisRunArchiveV0314.ts"), "utf8");
  assert.match(archiveSource, /SANITIZATION_FAILED_PAYLOAD_OMITTED/);
  assert.match(archiveSource, /originalPayloadSha256/);

  console.log(JSON.stringify({ status: "passed", policy: comparison.matched, cumulativeTokens: telemetry.turnCumulative.totalTokens, lastModelCallTokens: telemetry.lastModelCall.totalTokens, targetedFlush: targeted.status }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
