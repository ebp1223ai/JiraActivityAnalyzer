import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { configureAppRoot } from "../electron/appRoot.js";
import {
  AnalysisDispatchGuard,
  AnalysisErrorDeduplicator,
  buildCapacityCalculationSnapshot,
  capacitySnapshotHash,
  capacityWarning,
  createFailedStaging,
  evaluateFormalPersistenceGate,
  persistFailedRunEvidence
} from "../electron/aiAnalysisV0312.js";

const capacity = (tokens: number | null) => ({
  providerId: "chatgpt_codex", providerDisplayName: "ChatGPT", modelId: "synthetic-model", modelDisplayName: "Synthetic Model",
  source: tokens === null ? "unavailable" as const : "app_server_capability" as const,
  status: tokens === null ? "capability_method_unavailable" : "available", tokens,
  rawSanitized: tokens === null ? { error: "unsupported" } : { contextWindowTokens: tokens }
});
const snapshot = (promptBytes: number, tokens: number | null, records = 117) => buildCapacityCalculationSnapshot({
  capacity: capacity(tokens), rulesBytesUtf8: 120_000, pendingPayloadBytesUtf8: 250_000,
  wrapperInstructionsBytesUtf8: Math.max(0, promptBytes - 370_000), finalSerializedPromptBytesUtf8: promptBytes, recordCount: records
});

test("known capacity within limit dispatches without warning", () => assert.equal(capacityWarning(snapshot(30_000, 200_000, 1)), null));
test("known capacity overage is warning-only with complete formula", () => {
  const value = snapshot(407_037, 200_000);
  assert.equal(value.estimatedFinalInputTokens, 135_679);
  assert.equal(value.estimatedVisibleOutputReserveTokens, 74_880);
  assert.equal(value.safetyMarginTokens, 16_000);
  assert.equal(value.estimatedOutputAndReasoningReserveTokens, 90_880);
  assert.equal(value.estimatedRequiredTotalTokens, 226_559);
  assert.equal(value.estimatedOverageTokens, 26_559);
  assert.equal(capacityWarning(value), "ANALYSIS_ESTIMATED_CONTEXT_EXCEEDS_LIMIT");
});
test("unavailable capacity preserves null margins but complete input and required estimates", () => {
  const value = snapshot(407_037, null);
  assert.equal(value.capacityTokens, null); assert.equal(value.remainingAfterInputTokens, null);
  assert.equal(value.estimatedMarginTokens, null); assert.equal(value.estimatedOverageTokens, null);
  assert.ok((value.estimatedRequiredTotalTokens ?? 0) > value.estimatedFinalInputTokens);
  assert.equal(capacityWarning(value), "ANALYSIS_MODEL_CONTEXT_CAPACITY_UNAVAILABLE");
});
test("bytes fallback exposes divisor, rounding, bytes, and never hardcodes 200000", () => {
  const value = snapshot(300, null, 1);
  assert.equal(value.estimatedFinalInputTokens, 100); assert.equal(value.roundingRule, "ceil");
  assert.match(value.estimatorMethod, /UTF-8 bytes \/ 3/); assert.notEqual(value.capacityTokens, 200_000);
});
test("capacity snapshot hash is stable for shared UI manifest debug and ledger value", () => {
  const value = snapshot(407_037, 200_000); const hashes = Array.from({ length: 4 }, () => capacitySnapshotHash(value));
  assert.equal(new Set(hashes).size, 1); assert.match(hashes[0], /^[a-f0-9]{64}$/);
});
test("dispatch guard permits exactly one dispatch after confirmation", () => {
  const guard = new AnalysisDispatchGuard(); guard.register("analysis_a", true);
  assert.equal(guard.begin("analysis_a"), false); assert.equal(guard.confirm("analysis_a"), "confirmed");
  assert.equal(guard.begin("analysis_a"), true); assert.equal(guard.begin("analysis_a"), false);
});
test("cancelled capacity warning has zero dispatch opportunity", () => {
  const guard = new AnalysisDispatchGuard(); guard.register("analysis_cancel", true); guard.finish("analysis_cancel");
  assert.equal(guard.begin("analysis_cancel"), false);
});
test("repeat IPC rerender route change and timeout cannot reset dispatching state", () => {
  const guard = new AnalysisDispatchGuard(); guard.register("analysis_once", false); assert.equal(guard.begin("analysis_once"), true);
  for (let index = 0; index < 160; index += 1) { guard.register("analysis_once", false); assert.equal(guard.begin("analysis_once"), false); }
});
test("same primary error is deduplicated with occurrence count", () => {
  const logs = new AnalysisErrorDeduplicator(); for (let index = 0; index < 160; index += 1) logs.record("analysis_a", "preflight", "E1", "same");
  assert.equal(logs.list().length, 1); assert.equal(logs.list()[0].occurrenceCount, 160);
});
test("different run stage and error code remain distinct", () => {
  const logs = new AnalysisErrorDeduplicator(); logs.record("analysis_a", "preflight", "E1", "one"); logs.record("analysis_a", "provider", "E1", "two"); logs.record("analysis_b", "provider", "E1", "three"); logs.record("analysis_b", "provider", "E2", "four");
  assert.equal(logs.list().length, 4);
});
test("formal gate allows only completed 117 in and 117 out", () => {
  const ids = Array.from({ length: 117 }, (_, index) => `stable-${index}`);
  const gate = evaluateFormalPersistenceGate({ providerStatus: "completed", inputIds: ids, outputIds: [...ids], catalogInvalidSkillIds: [], responseSaved: true, jsonValid: true });
  assert.equal(gate.passed, true); assert.equal(gate.formalJsonAllowed && gate.goldenHtmlAllowed && gate.sqliteAllowed, true);
});
test("incomplete invalid duplicate missing unexpected and catalog errors close all formal gates", () => {
  for (const input of [
    { providerStatus: "incomplete", inputIds: ["a"], outputIds: ["a"], catalogInvalidSkillIds: [], responseSaved: true, jsonValid: true },
    { providerStatus: "completed", inputIds: ["a", "b"], outputIds: ["a", "a", "c"], catalogInvalidSkillIds: [], responseSaved: true, jsonValid: true },
    { providerStatus: "completed", inputIds: ["a"], outputIds: ["a"], catalogInvalidSkillIds: ["BAD_001"], responseSaved: true, jsonValid: true },
    { providerStatus: "completed", inputIds: ["a"], outputIds: ["a"], catalogInvalidSkillIds: [], responseSaved: true, jsonValid: false }
  ]) { const gate = evaluateFormalPersistenceGate(input); assert.equal(gate.passed, false); assert.equal(gate.sqliteAllowed, false); }
});
test("failed staging is APP_ROOT-contained complete sanitized evidence and collision-safe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0312-root-")); configureAppRoot(root);
  const runId = "analysis_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"; const folder = createFailedStaging(runId); const cap = snapshot(407_037, null);
  persistFailedRunEvidence({ folder, runManifest: { runId }, failedManifest: { status: "failed" }, capacitySnapshot: cap, providerDiagnostics: { authorization: "[masked]" }, requestSanitized: { token: "[masked]" }, responseSanitized: { text: "safe" }, visibleResponse: "{\"safe\":true}", validationResult: { passed: false }, tokenUsage: { availability: "unavailable" }, executionTime: { durationMs: 1 }, events: [{ type: "failed" }], actions: ["Selected rules", "Selected Pending JSON", "Provider diagnostics", "Started analysis", "Capacity warning confirmed"] });
  for (const name of ["run-manifest.json", "failed-run-manifest.json", "capacity-snapshot.json", "provider-diagnostics.json", "request-sanitized.json", "response-sanitized.json", "provider-visible-response.json.gz", "provider-visible-response.sha256", "validation-result.json", "token-usage.json", "execution-time.json", "event-log.jsonl", "user-action-log.txt"]) assert.ok(fs.existsSync(path.join(folder, name)), name);
  assert.ok(path.resolve(folder).startsWith(path.resolve(root))); assert.throws(() => createFailedStaging(runId), /exist/i); assert.throws(() => createFailedStaging("..\\escape"), /INVALID/);
  assert.doesNotMatch(fs.readFileSync(path.join(folder, "request-sanitized.json"), "utf8"), /secret-value/);
  fs.rmSync(root, { recursive: true, force: true });
});
