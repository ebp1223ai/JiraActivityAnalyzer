import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AnalysisBridgeV0319, MODEL_DELIVERY_PROTOCOL, MODEL_VISIBLE_SEGMENT_BYTES } from "../electron/analysisBridgeRuntimeV0319.js";
import { composeEffectiveInstruction, SYSTEM_SAFETY_WRAPPER } from "../electron/aiAnalysisInstructionV0319.js";
import { createTokenTelemetry, updateTokenTelemetry } from "../electron/codexWritableArtifactsV0317.js";
import { redactChatGptTextComplete } from "../electron/chatGptRedactor.js";

const sha = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const runId = () => `analysis_${crypto.randomUUID()}`;

function exactPending(records: number, targetBytes: number) {
  const document = { schemaVersion: "fixture", records: Array.from({ length: records }, (_, recordIndex) => ({ recordIndex, reference: { sourceRecordStableId: `stable-${recordIndex}` }, text: `繁體中文-${recordIndex}-😀` })), padding: "" };
  const base = JSON.stringify(document);
  const needed = targetBytes - Buffer.byteLength(base);
  assert.ok(needed >= 0, "fixture target must be large enough");
  document.padding = "x".repeat(needed);
  const result = JSON.stringify(document);
  assert.equal(Buffer.byteLength(result), targetBytes);
  return result;
}

function fixture(recordCount: number, pendingBytes: number, hooks?: { truncateSegmentIndex?: number }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0319-"));
  fs.mkdirSync(path.join(root, "input-workspace")); fs.mkdirSync(path.join(root, "ai-output")); fs.mkdirSync(path.join(root, "progress"));
  const inputs = [
    ["PENDING_ANALYSIS_JSON", "pending-analysis.json", exactPending(recordCount, pendingBytes)],
    ["COMMON_RULES", "common-rules.md", "# Common Rules\n\n規則 😀\n"],
    ["SKILL_CATALOG", "skill-catalog.md", "# Skill Catalog\n\nSKILL-001\n"],
    ["RULE_SET_MANIFEST_OR_SCORING_RULES", "rule-set-manifest.md", "# Manifest\n\nversion: test\n"]
  ] as const;
  const documents = inputs.map(([role, name, content]) => { const bytes = Buffer.from(content); fs.writeFileSync(path.join(root, "input-workspace", name), bytes); return { role, snapshotRelativePath: `input-workspace/${name}`, originalFileName: name, mimeType: name.endsWith("json") ? "application/json" : "text/markdown", encoding: "utf-8", snapshotByteLength: bytes.length, snapshotSha256: sha(bytes), complete: true, truncated: false, byteIdentical: true }; });
  const id = runId();
  const bridge = new AnalysisBridgeV0319({ runId: id, sessionNonce: "a".repeat(64), runDirectory: root, requestPackage: { runId: id, pendingSourceSha256: documents[0].snapshotSha256, inputRecordCount: recordCount, documents }, rulesSnapshotId: "rules-test", catalogSkillIds: ["SKILL-001"], instructionMode: "STANDARD_FORMAL", testHooks: hooks });
  const context = { runId: id, sessionNonce: "a".repeat(64), threadId: "thread-test", turnId: "turn-test", callId: "call-test" };
  return { root, bridge, context, runId: id };
}

function deliverAll(value: ReturnType<typeof fixture>) {
  const manifest = value.bridge.handle("jaa_get_input_manifest", { runId: value.runId }, value.context) as any;
  assert.equal(manifest.transportProtocol, MODEL_DELIVERY_PROTOCOL); assert.equal(manifest.expectedFileCount, 4);
  for (const file of manifest.files) for (const item of file.segments) {
    const segment = value.bridge.handle("jaa_read_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: item.segmentIndex, cursor: item.startByte }, value.context) as any;
    assert.ok(Buffer.byteLength(JSON.stringify(segment)) < 8192, "model-visible envelope stays below the observed boundary");
    assert.ok(Buffer.byteLength(segment.content) <= MODEL_VISIBLE_SEGMENT_BYTES);
    value.bridge.handle("jaa_ack_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: item.segmentIndex, deliveredBytes: segment.deliveredBytes, segmentSha256: segment.segmentSha256, receiptToken: segment.receiptToken }, value.context);
  }
  return value.bridge.handle("jaa_finalize_input_delivery", { runId: value.runId }, value.context) as any;
}

for (const [records, bytes] of [[17, 111_967], [117, 360_000]] as const) {
  const value = fixture(records, bytes); try { const receipt = deliverAll(value); assert.equal(receipt.modelInputDelivered, true); assert.equal(receipt.deliveredRecordCount, records); assert.equal(receipt.expectedBytes, receipt.deliveredBytes); assert.equal(receipt.files.length, 4); assert.ok(receipt.files.every((file: any) => file.eof && file.complete)); } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
}

{
  const value = fixture(17, 111_967, { truncateSegmentIndex: 0 }); try {
    const manifest = value.bridge.handle("jaa_get_input_manifest", { runId: value.runId }, value.context) as any; const file = manifest.files[0]; const expected = file.segments[0];
    assert.throws(() => value.bridge.handle("jaa_read_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: 1, cursor: file.segments[1].startByte }, value.context), /CURSOR|SEGMENT|ORDER/i);
    assert.throws(() => value.bridge.handle("jaa_read_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: 0, cursor: 1 }, value.context), /CURSOR_MISMATCH/);
    const truncated = value.bridge.handle("jaa_read_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: 0, cursor: expected.startByte }, value.context) as any;
    assert.ok(truncated.deliveredBytes < truncated.expectedBytes);
    assert.throws(() => value.bridge.handle("jaa_ack_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: 0, deliveredBytes: truncated.deliveredBytes, segmentSha256: truncated.segmentSha256, receiptToken: truncated.receiptToken }, value.context), /HASH_MISMATCH/);
    const resumed = deliverAll(value); assert.equal(resumed.modelInputDelivered, true);
    assert.throws(() => value.bridge.handle("jaa_read_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: 0, cursor: expected.startByte }, value.context), /DUPLICATE_SEGMENT/);
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
}

for (const mode of ["STANDARD_FORMAL", "STANDARD_PLUS_USER_INSTRUCTION", "CUSTOM_DIAGNOSTIC"] as const) {
  const result = composeEffectiveInstruction({ mode, runId: "analysis_test", recordCount: 17, sourceSha256: "source", rulesSnapshotId: "rules", userAdditionalInstruction: "著重 evidence", userCustomInstruction: "診斷最後一筆" });
  assert.ok(result.effectiveInstruction.includes(SYSTEM_SAFETY_WRAPPER)); assert.equal(sha(result.effectiveInstruction), result.effectiveInstructionSha256);
  assert.equal(result.sqliteEligible, mode !== "CUSTOM_DIAGNOSTIC");
}

let telemetry = createTokenTelemetry(258_400);
for (const totalTokens of [50_000, 70_000, 90_000, 100_000, 112_214]) telemetry = updateTokenTelemetry(telemetry, { event: { tokenUsage: { totalUsage: { input_tokens: totalTokens - 1_466, output_tokens: 1_466, total_tokens: totalTokens }, lastModelCall: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 } } } });
assert.equal(telemetry.turnCumulative.totalTokens, 112_214); assert.equal(telemetry.usageEventCount, 5); assert.notEqual(telemetry.turnCumulative.totalTokens, 422_214);

const huge = JSON.stringify({ payload: "x".repeat(136_544), authorization: "Bearer secret-token" });
const redacted = redactChatGptTextComplete(huge); assert.doesNotThrow(() => JSON.parse(redacted)); assert.ok(redacted.length > 8192); assert.ok(!redacted.includes("secret-token"));

console.log("v0.3.19 instruction, resumable delivery, sanitizer, and cumulative token tests passed");
