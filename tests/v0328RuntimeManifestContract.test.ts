import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { AnalysisBridgeV0328 } from "../electron/analysisBridgeRuntimeV0328.js";
import { createRuntimeManifestReceiptV0328 } from "../electron/runtimeManifestV0328.js";
import { BridgeExecutionContextV0327 } from "../electron/bridgeExecutionContextV0327.js";
import { buildEvidenceQuoteCatalog } from "../electron/evidenceQuoteCatalogV0326.js";
import { normalizeJaaError } from "../electron/jaaErrorNormalizerV0327.js";
import { loadExplicitRulesSnapshotV0328, V0328_APPLICATION_BINDING, V0328_RULE_FILES } from "../electron/aiAnalysisRulesV0328.js";
import type { EvidenceSegmentV0324 } from "../electron/aiAnalysisEvidenceSegmenterV0324.js";

async function run() {
const requireLocal = createRequire(path.join(process.cwd(), "package.json"));
const BridgeClass: typeof AnalysisBridgeV0328 = process.env.JAA_PACKAGED_BRIDGE ? requireLocal(process.env.JAA_PACKAGED_BRIDGE).AnalysisBridgeV0328 : AnalysisBridgeV0328;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0328-"));
const controlledRulesRoot = path.resolve(process.cwd(), "rules", "v0.3.28");
const controlledRuleHashes = {
  manifest: "f3bf59d9d99f42307f89b8eeffd270715a4523e26277f19cb32f51e6031850e3",
  common_rules: "0093db6b189da6bc6d78ecb498ac81c8a867deca5b18b26dffbebbd12aa505e0",
  catalog: "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d",
  html_template: "aa896e0d9a627aaff129739b16b56331132a5f4b08ad8f442c84e06fbe999182"
} as const;
const rules = loadExplicitRulesSnapshotV0328({
  mode: "BUNDLED_DEFAULT",
  manifest: path.join(controlledRulesRoot, V0328_RULE_FILES.manifest.fileName),
  commonRules: path.join(controlledRulesRoot, V0328_RULE_FILES.common_rules.fileName),
  catalog: path.join(controlledRulesRoot, V0328_RULE_FILES.catalog.fileName),
  htmlTemplate: path.join(controlledRulesRoot, V0328_RULE_FILES.html_template.fileName)
});
assert.equal(rules.promptVersion, V0328_APPLICATION_BINDING.promptVersion);
assert.equal(rules.pipelineVersion, V0328_APPLICATION_BINDING.pipelineVersion);
for (const document of rules.roleDocuments ?? []) assert.equal(document.sha256, controlledRuleHashes[document.role]);
const segments: EvidenceSegmentV0324[] = [
  { evidenceSegmentId: "seg_a", recordIndex: 0, sourceRecordStableId: "stable_0", evidenceRef: "ev_0", hunkId: null, lineType: "ADDED", oldLineNumber: null, newLineNumber: 1, exactText: '"第一行\\r\\n第二行\\t\\"quoted\\" 中文"', evidenceRoleEligibility: "PRIMARY_CHANGE", sourceJsonPointer: "/records/0/comment", segmentSha256: "x" },
  { evidenceSegmentId: "seg_b", recordIndex: 1, sourceRecordStableId: "stable_1", evidenceRef: "ev_1", hunkId: null, lineType: "CONTEXT", oldLineNumber: 1, newLineNumber: 1, exactText: "supporting context", evidenceRoleEligibility: "SUPPORTING_CONTEXT", sourceJsonPointer: "/records/1/comment", segmentSha256: "y" }
];
const quoteCatalog = buildEvidenceQuoteCatalog(segments);

function createBridge(name: string) {
  const runRoot = path.join(root, name);
  fs.mkdirSync(path.join(runRoot, "input-workspace"), { recursive: true });
  fs.mkdirSync(path.join(runRoot, "progress"), { recursive: true });
  const roles = ["PENDING_ANALYSIS_JSON", "COMMON_RULES", "SKILL_CATALOG", "RULE_SET_MANIFEST_OR_SCORING_RULES"];
  const documents = roles.map((role, index) => {
    const fileName = index === 0 ? "pending-analysis.json" : `input-${index}.md`;
    const relative = `input-workspace/${fileName}`;
    const payload = index === 0 ? JSON.stringify({ records: [{ sourceRecordStableId: "stable_0", evidenceSegments: [segments[0]] }, { sourceRecordStableId: "stable_1", evidenceSegments: [segments[1]] }], padding: "x".repeat(50_000) }) : "x".repeat(4096 * 12 + 17);
    const bytes = Buffer.from(payload);
    fs.writeFileSync(path.join(runRoot, relative), bytes);
    return { role, snapshotRelativePath: relative, originalFileName: fileName, mimeType: index === 0 ? "application/json" : "text/markdown", encoding: "utf-8", snapshotByteLength: bytes.length, snapshotSha256: crypto.createHash("sha256").update(bytes).digest("hex"), complete: true, truncated: false, byteIdentical: true };
  });
  const id = crypto.createHash("sha256").update(name).digest("hex");
  const runId = `analysis_${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`;
  const bridge = new BridgeClass({ runId, sessionNonce: "0123456789abcdef0123456789abcdef", runDirectory: runRoot, requestPackage: { runId, pendingSourceSha256: "a".repeat(64), inputRecordCount: 2, decisionContractVersion: "jaa-ai-analysis-decisions-v5", documents }, rulesSnapshotId: "rules", catalogSkillIds: ["GC_006"], quoteCatalog, evidenceSegments: segments, analysisAttemptId: `attempt_${name}`, requestId: `request_${name}`, provider: "chatgpt_codex", model: "gpt-test", manifestSha256: "b".repeat(64), commonRulesSha256: "c".repeat(64), catalogSha256: "d".repeat(64), outputSchemaSha256: "e".repeat(64) });
  return { bridge, runRoot, runId };
}

const primary = createBridge("primary");
const secondary = createBridge("secondary");
const specs = primary.bridge.toolSpecs() as any[];
const preflight = primary.bridge.preflight() as any;
assert.equal(preflight.providerDispatchGate.selfValidationPassed, true);
assert.equal(preflight.providerDispatchGate.providerDispatchAllowed, true);
assert.equal(preflight.transportProtocol, "bridge-resumable-v3");
const secondarySpecs = secondary.bridge.toolSpecs() as any[];
assert.notEqual(primary.bridge.toolRegistrationId, secondary.bridge.toolRegistrationId);
assert.equal(specs.find((spec) => spec.name === "jaa_get_input_manifest").inputSchema.additionalProperties, false);
assert.deepEqual(specs.find((spec) => spec.name === "jaa_get_input_manifest").inputSchema.properties, {});
for (const spec of specs) {
  const schema = JSON.stringify(spec.inputSchema);
  for (const forbidden of ["runId", "analysisAttemptId", "requestId", "threadId", "turnId", "rulesSnapshotId", "sourceSha256"]) assert(!schema.includes(forbidden), `${spec.name} leaked ${forbidden}`);
}
assert.equal(secondarySpecs.length, specs.length);

primary.bridge.bindProviderThread("thread-primary");
const hostContext = { runId: primary.runId, sessionNonce: "0123456789abcdef0123456789abcdef", threadId: "thread-primary", turnId: "turn-primary", callId: "call-1", toolRegistrationId: primary.bridge.toolRegistrationId };
const pendingManifest = primary.bridge.handle("jaa_get_input_manifest", {}, hostContext) as Promise<any>;
setTimeout(() => primary.bridge.bindProviderTurn("thread-primary", "turn-primary"), 20);
const manifest = await pendingManifest;
assert.equal(manifest.schemaVersion, "jaa-model-input-manifest-v3");
assert.equal(manifest.transportProtocol, "bridge-resumable-v3");
const serialized = primary.bridge.serializeToolResponse("jaa_get_input_manifest", manifest);
const decodedManifest = JSON.parse(serialized.contentItems[0].text);
assert.equal(decodedManifest.schemaVersion, "jaa-model-input-manifest-v3");
assert.equal(decodedManifest.transportProtocol, "bridge-resumable-v3");
assert.equal(decodedManifest.expectedFileCount, 4);
assert.equal(decodedManifest.expectedRecordCount, 2);
const staleReceipt = createRuntimeManifestReceiptV0328({ ...manifest, transportProtocol: "bridge-resumable-v2" }, true);
assert.equal(staleReceipt.selfValidationPassed, false);
assert.equal(staleReceipt.providerDispatchAllowed, false);
assert.equal(staleReceipt.errorCode, "AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH");
assert.equal(typeof manifest.deliveryHandle, "string");
assert.equal(typeof manifest.artifactSubmissionToken, "string");
assert(!JSON.stringify(manifest).includes(primary.runId));
assert(!JSON.stringify(manifest).includes("thread-primary"));
assert(!JSON.stringify(manifest).includes("turn-primary"));
assert(Object.isFrozen(primary.bridge.snapshot().bridgeExecutionContext));

let cursor = 0;
let previousAck: any = null;
let combinedCalls = 0;
let deliveredSegments = 0;
for (;;) {
  const response = await primary.bridge.handle("jaa_read_and_ack_next_segment", { deliveryHandle: manifest.deliveryHandle, cursor, previousAck }, { ...hostContext, callId: `delivery-${combinedCalls}` }) as any;
  combinedCalls += 1;
  if (response.eof) break;
  const segment = response.nextSegment;
  deliveredSegments += 1;
  previousAck = { fileId: segment.fileId, segmentIndex: segment.segmentIndex, deliveredBytes: segment.deliveredBytes, segmentSha256: segment.segmentSha256, receiptToken: segment.receiptToken };
  cursor = response.nextCursor;
}
const deliveryReceipt = await primary.bridge.handle("jaa_finalize_input_delivery", { deliveryHandle: manifest.deliveryHandle, finalAck: previousAck }, { ...hostContext, callId: "finalize" }) as any;
assert.equal(deliveryReceipt.modelInputDelivered, true);
assert.equal(deliveryReceipt.deliveredFileCount, 4);
assert.equal(deliveredSegments, 52);
assert.equal(combinedCalls, 53);
assert(combinedCalls < 104);

async function progress(phase: string, completedCount: number, decisionPreparedCount: number, statusDistribution: unknown = null) {
  return primary.bridge.handle("jaa_report_analysis_progress", { deliveryHandle: manifest.deliveryHandle, phase, expectedCount: 2, completedCount, decisionPreparedCount, statusDistribution, message: phase }, { ...hostContext, callId: `progress-${phase}` });
}
await progress("INPUT_READY", 0, 0);
await progress("ANALYSIS_STARTED", 0, 0);
await progress("ANALYSIS_COMPLETED", 2, 2, { CLASSIFIED: 1, UNKNOWN: 1 });
await progress("ARTIFACT_SUBMISSION_STARTED", 2, 2);
const quote = quoteCatalog.entries.find((entry) => entry.recordIndex === 0 && entry.evidenceRoleEligibility.includes("PRIMARY_CHANGE"))!;
const decisions = [
  { recordIndex: 0, status: "CLASSIFIED", confidence: 0.9, skillFindings: [{ skillId: "GC_006", confidence: 0.9, evidenceQuoteIds: [quote.evidenceQuoteId], evidenceExplanation: "直接描述技術變更。", negativeChecks: ["排除一般關鍵字"], rationale: "符合技術邊界。" }], recordNegativeChecks: [], unknownReasons: [], rationale: "有完整證據。" },
  { recordIndex: 1, status: "UNKNOWN", confidence: 0, skillFindings: [], recordNegativeChecks: [], unknownReasons: ["只有背景"], rationale: "證據不足。" }
];
const artifactReceipt = await primary.bridge.handle("jaa_publish_analysis_artifacts_v5", { artifactSubmissionToken: manifest.artifactSubmissionToken, decisions, analysisReportMarkdown: "# 正式報告", finalSummaryZhTw: "2 筆已提交。" }, { ...hostContext, callId: "publish" }) as any;
assert.equal(artifactReceipt.decisionContractVersion, "jaa-ai-analysis-decisions-v5");
assert(!JSON.stringify(artifactReceipt).includes(primary.runId));
assert(fs.existsSync(path.join(primary.runRoot, "artifact-attempts", "ai-submitted-artifact-attempt-001.json")));
await assert.rejects(() => primary.bridge.handle("jaa_publish_analysis_artifacts_v5", { artifactSubmissionToken: manifest.artifactSubmissionToken, decisions, analysisReportMarkdown: "retry", finalSummaryZhTw: "retry" }, { ...hostContext, callId: "publish-replay" }), /AI_ARTIFACT_TOKEN_REPLAYED/);

const rejected = createBridge("rejected");
rejected.bridge.toolSpecs();
rejected.bridge.bindProviderThread("thread-rejected");
rejected.bridge.bindProviderTurn("thread-rejected", "turn-rejected");
const rejectedContext = { runId: rejected.runId, sessionNonce: "0123456789abcdef0123456789abcdef", threadId: "thread-rejected", turnId: "turn-rejected", callId: "legacy", toolRegistrationId: rejected.bridge.toolRegistrationId };
await assert.rejects(() => rejected.bridge.handle("jaa_get_input_manifest", { runId: rejected.runId }, rejectedContext), /AI_BRIDGE_CONTRACT_MISMATCH/);
rejected.bridge.markDerivedError("AI_MODEL_INPUT_DELIVERY_INCOMPLETE", "0/4 files delivered.", "INPUT_READING");
const failedLifecycle = rejected.bridge.snapshot().lifecycle;
assert.equal(failedLifecycle.rootErrorCode, "AI_BRIDGE_CONTRACT_MISMATCH");
assert(failedLifecycle.derivedErrorCodes?.includes("AI_MODEL_INPUT_DELIVERY_INCOMPLETE"));

const directRoot = path.join(root, "context-unit");
const direct = new BridgeExecutionContextV0327({ runDirectory: directRoot, analysisAttemptId: "attempt", internalRunId: "analysis_internal", provider: "chatgpt_codex", model: "gpt-test", sourceInputIdentity: "source", rulesSnapshotId: "rules", expectedRecordCount: 2, sessionNonce: "nonce".repeat(8) });
direct.registerTools();
await assert.rejects(() => direct.awaitTurnBound(5), /AI_BRIDGE_CONTEXT_NOT_BOUND/);
direct.bindThread("thread");
direct.bindTurn("thread", "turn");
const handle = direct.issueDeliveryHandle("manifest", "receipt");
assert.throws(() => direct.validateDeliveryHandle("", { threadId: "thread", turnId: "turn" }), /AI_MODEL_DELIVERY_HANDLE_MISSING/);
assert.throws(() => direct.validateDeliveryHandle("wrong", { threadId: "thread", turnId: "turn" }), /AI_MODEL_DELIVERY_HANDLE_INVALID/);
assert.throws(() => direct.validateDeliveryHandle(handle, { threadId: "thread", turnId: "other" }), /AI_MODEL_DELIVERY_HANDLE_SCOPE_MISMATCH/);
assert.throws(() => direct.validateDeliveryHandle(handle, { threadId: "thread", turnId: "turn" }, Date.now() + 31 * 60_000), /AI_MODEL_DELIVERY_HANDLE_EXPIRED/);
direct.completeDeliveryHandle(handle, { threadId: "thread", turnId: "turn" });
assert.throws(() => direct.validateDeliveryHandle(handle, { threadId: "thread", turnId: "turn" }), /AI_MODEL_DELIVERY_HANDLE_REPLAYED/);

for (const value of [new Error("boom"), "broken", { errorCode: "STRUCTURED", messageZhTw: "結構錯誤", stage: "IPC" }, { message: undefined }, null, undefined, 42]) {
  const normalized = normalizeJaaError(value, { stage: "TEST", source: "v0328-test" });
  assert(normalized.errorCode);
  assert(normalized.messageZhTw);
  assert.notEqual(`${normalized.errorCode}: ${normalized.messageZhTw}`, "undefined: undefined");
}

const toolEvidence = fs.readFileSync(path.join(primary.runRoot, "progress", "bridge-tool-calls.jsonl"), "utf8");
assert(!toolEvidence.includes(manifest.deliveryHandle));
assert(!toolEvidence.includes(manifest.artifactSubmissionToken));
assert(toolEvidence.includes("jaa-bridge-tool-call-evidence-v1"));
const prompt = fs.readFileSync(path.resolve("electron/aiAnalysisInstructionV0324.ts"), "utf8");
assert(prompt.includes("jaa_get_input_manifest({})"));
assert(prompt.includes("JAA-CHATGPT-ZH-TW-0.3.29"));
const debugSource = fs.readFileSync(path.resolve("electron/main.ts"), "utf8") + fs.readFileSync(path.resolve("electron/aiAnalysisIpc.ts"), "utf8");
assert(!debugSource.includes('"render-workspace/html-report-template.md"'));
for (const classification of ["expected_and_present", "expected_but_missing", "not_produced_due_to_prior_failure", "not_applicable_no_model_delivery", "not_applicable_no_submission", "not_applicable_instruction_mode"]) assert(debugSource.includes(classification));

console.log(JSON.stringify({ status: "PASS", runtime: process.env.JAA_PACKAGED_BRIDGE ? "packaged" : "source", bridge: "0.3.29-bridge-v11", manifestZeroIdentity: true, independentToolRegistrations: true, delayedTurnBinding: true, deliveredSegments, combinedCalls, v2EquivalentCalls: 104, handleCases: 5, artifactTokenReplayRejected: true, rootError: failedLifecycle.rootErrorCode, derivedErrorCodes: failedLifecycle.derivedErrorCodes, errorShapes: 7, debugLifecycleVocabulary: true, tempRoot: root }, null, 2));
}

export const completed = run();
