import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { AnalysisBridgeV0318 } from "./analysisBridgeRuntimeV0318.js";
import { ANALYSIS_BRIDGE_SCHEMA_VERSION, ANALYSIS_BRIDGE_VERSION, type AnalysisBridgeToolContext, type AnalysisLifecycleStage, type AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";
import type { AiInstructionMode } from "../shared/analysisInstructionContract.js";
import { createBoundarySafetyReceiptV0331, extractProtectedTokenSpansV0331, planProtectedTokenSafeSegmentsV1, PROVIDER_TRANSPORT_V0331, SEGMENT_SCHEMA_VERSION_V0331, type ProtectedTokenSpanV0331 } from "./protectedTokenSegmentPlannerV0331.js";

type JsonObject = Record<string, unknown>;
type RequestDocument = { role: string; snapshotRelativePath: string; originalFileName: string; mimeType: string; encoding: string; snapshotByteLength: number; snapshotSha256: string; complete: boolean; truncated: boolean; byteIdentical: boolean };
type BridgeConfig = {
  runId: string;
  sessionNonce: string;
  runDirectory: string;
  requestPackage: { runId: string; pendingSourceSha256: string; inputRecordCount: number; decisionContractVersion?: string; documents: RequestDocument[] };
  rulesSnapshotId: string;
  catalogSkillIds: string[];
  instructionMode?: AiInstructionMode;
  testHooks?: { failWrite?: boolean; failRename?: boolean; truncateSegmentIndex?: number };
};
type Segment = { index: number; startByte: number; endByteExclusive: number; bytes: Buffer; sha256: string; receiptToken: string; attempts: number; acknowledged: boolean; boundaryBefore: { offset: number; utf8Safe: boolean; escapeSafe: boolean; protectedTokenSafe: boolean }; boundaryAfter: { offset: number; utf8Safe: boolean; escapeSafe: boolean; protectedTokenSafe: boolean } };
type DeliveryFile = { fileId: string; role: string; fileName: string; bytes: Buffer; sha256: string; segments: Segment[]; protectedSpans: ProtectedTokenSpanV0331[]; segmentPlan: ReturnType<typeof planProtectedTokenSafeSegmentsV1> };

const INPUT_ROLES = ["PENDING_ANALYSIS_JSON", "COMMON_RULES", "SKILL_CATALOG", "RULE_SET_MANIFEST_OR_SCORING_RULES"];
export const MODEL_DELIVERY_PROTOCOL = PROVIDER_TRANSPORT_V0331;
export const MODEL_VISIBLE_SEGMENT_BYTES = 4096;
const MAX_SEGMENT_ATTEMPTS = 3;

function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function sha256(value: string | Buffer) { return crypto.createHash("sha256").update(value).digest("hex"); }
function fail(code: string, message: string): never { throw new Error(`${code}:${message}`); }
function strictUtf8(bytes: Buffer, role: string) { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail("AI_INPUT_UTF8_INVALID", `${role} is not valid UTF-8.`); } }
function contained(root: string, relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes(":")) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Invalid input path.");
  const canonicalRoot = fs.realpathSync.native(root); const candidate = path.resolve(canonicalRoot, relativePath); const relative = path.relative(canonicalRoot, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Input escaped the Run allowlist.");
  const stat = fs.lstatSync(candidate); if (!stat.isFile() || stat.isSymbolicLink()) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Input is not a regular file.");
  return fs.realpathSync.native(candidate);
}
function durableJson(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true }); const text = JSON.stringify(value, null, 2) + "\n"; const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temp, "wx"); try { fs.writeFileSync(fd, text, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, target); const reopened = fs.readFileSync(target); if (sha256(reopened) !== sha256(Buffer.from(text))) fail("AI_ARTIFACT_RECEIPT_INVALID", "Receipt reopen/hash verification failed.");
}
function appendEvent(target: string, value: unknown) { const fd = fs.openSync(target, "a"); try { fs.writeSync(fd, JSON.stringify(value) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function splitUtf8(bytes: Buffer, nonce: string, fileId: string, catalogSkillIds: readonly string[], requireJson: boolean) {
  strictUtf8(bytes, fileId);
  const protectedSpans = extractProtectedTokenSpansV0331(bytes, { fileId, catalogSkillIds, requireJson });
  const segmentPlan = planProtectedTokenSafeSegmentsV1(bytes, protectedSpans, MODEL_VISIBLE_SEGMENT_BYTES);
  const segments: Segment[] = segmentPlan.segments.map((part) => ({
    index: part.index, startByte: part.startByte, endByteExclusive: part.endByteExclusive, bytes: part.bytes, sha256: part.sha256,
    receiptToken: sha256(nonce + ":" + fileId + ":" + part.index + ":" + part.startByte + ":" + part.sha256), attempts: 0, acknowledged: false,
    boundaryBefore: part.boundaryBefore, boundaryAfter: part.boundaryAfter
  }));
  return { segments, protectedSpans, segmentPlan };
}

export class AnalysisBridgeV0319 {
  readonly version = ANALYSIS_BRIDGE_VERSION;
  readonly schemaVersion = ANALYSIS_BRIDGE_SCHEMA_VERSION;
  readonly transport = "codex_dynamic_tools_stdio" as const;
  private readonly legacy: AnalysisBridgeV0318;
  private readonly files: DeliveryFile[];
  private readonly progressDirectory: string;
  private sourceReceipt: JsonObject;
  private modelDeliveryReceipt: JsonObject | null = null;
  private modelDeliveryFailure: JsonObject | null = null;
  private deliveryContext: AnalysisBridgeToolContext | null = null;
  private boundarySafetyReceipt: Record<string, unknown> | null = null;

  constructor(private readonly config: BridgeConfig) {
    this.legacy = new AnalysisBridgeV0318(config);
    this.progressDirectory = path.join(fs.realpathSync.native(config.runDirectory), "progress");
    const documents = config.requestPackage.documents.filter((item) => INPUT_ROLES.includes(item.role));
    if (documents.length !== 4 || new Set(documents.map((item) => item.role)).size !== 4) fail("AI_INPUT_RECEIPT_INCOMPLETE", "Exactly four source documents are required.");
    this.files = documents.map((document, index) => {
      if (document.encoding !== "utf-8" || !document.complete || document.truncated || !document.byteIdentical) fail("AI_INPUT_RECEIPT_INCOMPLETE", `${document.role} manifest is incomplete.`);
      const bytes = fs.readFileSync(contained(config.runDirectory, document.snapshotRelativePath)); strictUtf8(bytes, document.role);
      if (bytes.length !== document.snapshotByteLength || sha256(bytes) !== document.snapshotSha256) fail("AI_INPUT_HASH_MISMATCH", `${document.role} hash or byte length mismatch.`);
      const fileId = document.role === "PENDING_ANALYSIS_JSON" ? "pending-analysis" : `rules-${index}`;
      const planned = splitUtf8(bytes, config.sessionNonce, fileId, config.catalogSkillIds, document.role === "PENDING_ANALYSIS_JSON");
      return { fileId, role: document.role, fileName: document.originalFileName, bytes, sha256: sha256(bytes), ...planned };
    });
    this.boundarySafetyReceipt = createBoundarySafetyReceiptV0331(config.runId, this.files.map((file) => ({ fileId: file.fileId, plan: file.segmentPlan, spans: file.protectedSpans })));
    durableJson(path.join(this.progressDirectory, "segment-boundary-safety-receipt.json"), this.boundarySafetyReceipt);
    durableJson(path.join(config.runDirectory, "debug", "segment-boundary-safety-receipt.json"), this.boundarySafetyReceipt);
    durableJson(path.join(config.runDirectory, "debug", "segment-plan-summary.json"), { schemaVersion: "jaa-segment-plan-summary-v1", plannerVersion: "jaa-protected-token-safe-segment-planner-v1", files: this.files.map((file) => ({ fileId: file.fileId, sourceBytes: file.bytes.length, segmentCount: file.segments.length, segmentPlanSha256: file.segmentPlan.segmentPlanSha256 })) });
    durableJson(path.join(config.runDirectory, "debug", "protected-token-summary.json"), { schemaVersion: "jaa-protected-token-summary-v1", files: this.files.map((file) => ({ fileId: file.fileId, protectedTokenCount: file.protectedSpans.length, byType: Object.fromEntries([...new Set(file.protectedSpans.map((span) => span.tokenType))].sort().map((type) => [type, file.protectedSpans.filter((span) => span.tokenType === type).length])) })) });
    this.sourceReceipt = { schemaVersion: "jaa-source-input-receipt-v1", runId: config.runId, sourceInputValidated: true, expectedFileCount: 4, validatedFileCount: 4, expectedRecordCount: config.requestPackage.inputRecordCount, files: this.files.map((file) => ({ fileId: file.fileId, role: file.role, fileName: file.fileName, expectedBytes: file.bytes.length, actualBytes: file.bytes.length, expectedSha256: file.sha256, actualSha256: file.sha256, sha256Matched: true, encoding: "utf-8", strictUtf8Valid: true, complete: true, segmentCount: file.segments.length })), createdAt: new Date().toISOString() };
    durableJson(path.join(this.progressDirectory, "source-input-receipt.json"), this.sourceReceipt);
  }

  toolSpecs() {
    const base = [
      { type: "function", name: "jaa_get_input_manifest", description: "取得本次 Run 的四檔來源驗證結果與可續傳 segment manifest。", inputSchema: { type: "object", additionalProperties: false, required: ["runId"], properties: { runId: { type: "string" } } } },
      { type: "function", name: "jaa_read_input_segment", description: "讀取一個 UTF-8 安全且大小受限的 segment。只能讀取尚未 ack 或狀態列為 missing 的 segment。", inputSchema: { type: "object", additionalProperties: false, required: ["runId", "fileId", "segmentIndex", "cursor"], properties: { runId: { type: "string" }, fileId: { type: "string" }, segmentIndex: { type: "integer", minimum: 0 }, cursor: { type: "integer", minimum: 0 } } } },
      { type: "function", name: "jaa_ack_input_segment", description: "以 byte length、SHA-256 與 receipt token 確認模型已收到 segment。", inputSchema: { type: "object", additionalProperties: false, required: ["runId", "fileId", "segmentIndex", "deliveredBytes", "segmentSha256", "receiptToken"], properties: { runId: { type: "string" }, fileId: { type: "string" }, segmentIndex: { type: "integer", minimum: 0 }, deliveredBytes: { type: "integer", minimum: 0 }, segmentSha256: { type: "string" }, receiptToken: { type: "string" } } } },
      { type: "function", name: "jaa_get_delivery_status", description: "取得已確認與 missing segments；續傳時只重送 missing segments。", inputSchema: { type: "object", additionalProperties: false, required: ["runId"], properties: { runId: { type: "string" } } } },
      { type: "function", name: "jaa_finalize_input_delivery", description: "全部 segment ack 後建立 durable Model Delivery Receipt。", inputSchema: { type: "object", additionalProperties: false, required: ["runId"], properties: { runId: { type: "string" } } } }
    ];
    const legacyTools = this.legacy.toolSpecs().filter((item: any) => item.name !== "jaa_read_analysis_inputs");
    return this.config.instructionMode === "CUSTOM_DIAGNOSTIC" ? base : [...base, ...legacyTools];
  }

  preflight() { const legacy = this.legacy.preflight(); return { ...legacy, version: this.version, transportProtocol: MODEL_DELIVERY_PROTOCOL, segmentSchemaVersion: SEGMENT_SCHEMA_VERSION_V0331, segmentPlannerVersion: "jaa-protected-token-safe-segment-planner-v1", boundarySafetyReceipt: this.boundarySafetyReceipt, modelVisibleSegmentBytes: MODEL_VISIBLE_SEGMENT_BYTES, sourceInputValidated: true }; }

  handle(tool: string, argsValue: unknown, context: AnalysisBridgeToolContext) {
    this.validate(argsValue, context); const args = object(argsValue);
    if (tool === "jaa_get_input_manifest") return this.manifest(context);
    if (tool === "jaa_read_input_segment") return this.read(args, context);
    if (tool === "jaa_ack_input_segment") return this.ack(args, context);
    if (tool === "jaa_get_delivery_status") return this.status();
    if (tool === "jaa_finalize_input_delivery") return this.finalize(context);
    if (this.config.instructionMode === "CUSTOM_DIAGNOSTIC") fail("AI_BRIDGE_CONTRACT_MISMATCH", "Formal analysis tools are unavailable in CUSTOM_DIAGNOSTIC mode.");
    if (!this.modelDeliveryReceipt) fail("AI_MODEL_INPUT_DELIVERY_INCOMPLETE", "Model Delivery Receipt is required before analysis tools.");
    return this.legacy.handle(tool, argsValue, context);
  }

  setProviderTurnStatus(status: AnalysisLifecycleSummary["providerTurnStatus"]) { this.legacy.setProviderTurnStatus(status); }
  setSqliteStatus(status: AnalysisLifecycleSummary["sqliteStatus"]) { if (this.config.instructionMode === "CUSTOM_DIAGNOSTIC" && status !== "blocked") fail("AI_SQLITE_BLOCKED", "CUSTOM_DIAGNOSTIC is never SQLite eligible."); this.legacy.setSqliteStatus(status); }
  setPostBridgeStage(stage: "VALIDATION_COMPLETED" | "CANONICAL_ASSEMBLY_COMPLETED" | "RUN_COMPLETED", status: "completed" | "failed") { this.legacy.setPostBridgeStage(stage, status); }
  fail(stage: AnalysisLifecycleStage, code: string) { this.legacy.fail(stage, code); }
  snapshot() { const legacy = this.legacy.snapshot(); return { ...legacy, inputReceipt: this.sourceReceipt, sourceInputReceipt: this.sourceReceipt, boundarySafetyReceipt: this.boundarySafetyReceipt, modelDeliveryReceipt: this.modelDeliveryReceipt, modelDeliveryFailure: this.modelDeliveryFailure, lifecycle: { ...legacy.lifecycle, sourceInputStatus: "validated", modelInputStatus: this.modelDeliveryReceipt ? "delivered" : this.modelDeliveryFailure ? "failed" : "delivering" } }; }

  private validate(argsValue: unknown, context: AnalysisBridgeToolContext) { const args = object(argsValue); if (args.runId !== this.config.runId || context.runId !== this.config.runId || context.sessionNonce !== this.config.sessionNonce || !context.threadId || !context.turnId || !context.callId) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Tool context or Run ID mismatch."); if (this.deliveryContext && (this.deliveryContext.threadId !== context.threadId || this.deliveryContext.turnId !== context.turnId)) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Delivery cannot move between provider turns."); this.deliveryContext ??= context; }
  private manifest(context: AnalysisBridgeToolContext) { return { schemaVersion: "jaa-model-input-manifest-v3", runId: this.config.runId, threadId: context.threadId, turnId: context.turnId, transportProtocol: MODEL_DELIVERY_PROTOCOL, expectedFileCount: 4, expectedRecordCount: this.config.requestPackage.inputRecordCount, segmentByteLimit: MODEL_VISIBLE_SEGMENT_BYTES, files: this.files.map((file) => ({ fileId: file.fileId, role: file.role, fileName: file.fileName, expectedBytes: file.bytes.length, expectedSha256: file.sha256, segmentCount: file.segments.length, segments: file.segments.map((segment) => ({ segmentIndex: segment.index, startByte: segment.startByte, endByteExclusive: segment.endByteExclusive, expectedBytes: segment.bytes.length, sha256: segment.sha256, boundaryBefore: segment.boundaryBefore, boundaryAfter: segment.boundaryAfter })) })) }; }
  private find(args: JsonObject) { const file = this.files.find((item) => item.fileId === String(args.fileId)); const segment = file?.segments[Number(args.segmentIndex)]; if (!file || !segment || segment.index !== Number(args.segmentIndex)) fail("AI_MODEL_INPUT_SEGMENT_INVALID", "Unknown fileId or segmentIndex."); return { file, segment }; }
  private read(args: JsonObject, context: AnalysisBridgeToolContext) { const { file, segment } = this.find(args); const firstMissing = file.segments.find((item) => !item.acknowledged); if (firstMissing && firstMissing.index !== segment.index) fail("AI_MODEL_INPUT_SEGMENT_INVALID", "Segments must be delivered in byte order; resume from the first missing segment."); if (Number(args.cursor) !== segment.startByte) fail("AI_MODEL_INPUT_CURSOR_MISMATCH", "Segment cursor does not match its byte offset."); if (segment.acknowledged) fail("AI_MODEL_INPUT_DUPLICATE_SEGMENT", "Acknowledged segments cannot be resent."); segment.attempts += 1; if (segment.attempts > MAX_SEGMENT_ATTEMPTS) { this.deliveryFailed("AI_MODEL_INPUT_RETRY_EXHAUSTED", file.fileId, segment.index); fail("AI_MODEL_INPUT_RETRY_EXHAUSTED", "Segment retry limit exhausted."); }
    let delivered = segment.bytes; if (file.fileId === "pending-analysis" && this.config.testHooks?.truncateSegmentIndex === segment.index && segment.attempts === 1) delivered = delivered.subarray(0, Math.max(0, delivered.length - 1));
    const result = { schemaVersion: SEGMENT_SCHEMA_VERSION_V0331, runId: this.config.runId, threadId: context.threadId, turnId: context.turnId, fileId: file.fileId, role: file.role, segmentIndex: segment.index, segmentCount: file.segments.length, startByte: segment.startByte, endByteExclusive: segment.startByte + delivered.length, expectedBytes: segment.bytes.length, deliveredBytes: delivered.length, segmentSha256: sha256(delivered), expectedSegmentSha256: segment.sha256, boundaryBefore: segment.boundaryBefore, boundaryAfter: segment.boundaryAfter, receiptToken: segment.receiptToken, eof: segment.index === file.segments.length - 1 && delivered.length === segment.bytes.length, nextCursor: segment.startByte + delivered.length, content: strictUtf8(delivered, `${file.fileId}:${segment.index}`) };
    appendEvent(path.join(this.progressDirectory, "model-delivery-events.jsonl"), { ...result, content: "[model-visible-segment]", event: "segment_read", at: new Date().toISOString() }); return result;
  }
  private ack(args: JsonObject, _context: AnalysisBridgeToolContext) { const { file, segment } = this.find(args); if (segment.acknowledged) return { acknowledged: true, duplicateAck: true, fileId: file.fileId, segmentIndex: segment.index };
    if (Number(args.deliveredBytes) !== segment.bytes.length || args.segmentSha256 !== segment.sha256 || args.receiptToken !== segment.receiptToken) fail("AI_MODEL_INPUT_SEGMENT_HASH_MISMATCH", "Segment byte length, SHA-256, or receipt token mismatch."); segment.acknowledged = true; appendEvent(path.join(this.progressDirectory, "model-delivery-events.jsonl"), { event: "segment_acknowledged", runId: this.config.runId, fileId: file.fileId, segmentIndex: segment.index, bytes: segment.bytes.length, sha256: segment.sha256, attempts: segment.attempts, at: new Date().toISOString() }); return { acknowledged: true, fileId: file.fileId, segmentIndex: segment.index, bytes: segment.bytes.length, sha256: segment.sha256 };
  }
  private status() { const missingSegments = this.files.flatMap((file) => file.segments.filter((segment) => !segment.acknowledged).map((segment) => ({ fileId: file.fileId, segmentIndex: segment.index, startByte: segment.startByte, expectedBytes: segment.bytes.length, attempts: segment.attempts }))); const acknowledgedSegments = this.files.reduce((sum, file) => sum + file.segments.filter((item) => item.acknowledged).length, 0); const expectedSegments = this.files.reduce((sum, file) => sum + file.segments.length, 0); return { schemaVersion: "jaa-model-delivery-status-v2", runId: this.config.runId, transportProtocol: MODEL_DELIVERY_PROTOCOL, expectedSegments, acknowledgedSegments, missingSegments, complete: missingSegments.length === 0 }; }
  private finalize(context: AnalysisBridgeToolContext) { if (this.modelDeliveryReceipt) return this.modelDeliveryReceipt; const status = this.status(); if (!status.complete) fail("AI_MODEL_INPUT_DELIVERY_INCOMPLETE", `${status.missingSegments.length} segment(s) are still missing.`);
    this.legacy.handle("jaa_read_analysis_inputs", { runId: this.config.runId }, context);
    const deliveredBytes = this.files.reduce((sum, file) => sum + file.bytes.length, 0); const receipt = { schemaVersion: "jaa-model-delivery-receipt-v1", runId: this.config.runId, threadId: context.threadId, turnId: context.turnId, modelInputDelivered: true, transportProtocol: MODEL_DELIVERY_PROTOCOL, expectedFileCount: 4, deliveredFileCount: 4, expectedRecordCount: this.config.requestPackage.inputRecordCount, deliveredRecordCount: this.config.requestPackage.inputRecordCount, lastDeliveredRecordIndex: this.config.requestPackage.inputRecordCount - 1, expectedBytes: deliveredBytes, deliveredBytes, missingFileIds: [], missingRecordIndexes: [], files: this.files.map((file) => ({ fileId: file.fileId, role: file.role, expectedBytes: file.bytes.length, deliveredBytes: file.bytes.length, expectedSha256: file.sha256, deliveredSha256: file.sha256, segmentCount: file.segments.length, acknowledgedSegmentCount: file.segments.length, eof: true, complete: true })), completedAt: new Date().toISOString() };
    durableJson(path.join(this.progressDirectory, "model-delivery-receipt.json"), receipt); this.modelDeliveryReceipt = receipt; appendEvent(path.join(this.progressDirectory, "model-delivery-events.jsonl"), { event: "delivery_finalized", runId: this.config.runId, at: new Date().toISOString(), receiptSha256: sha256(JSON.stringify(receipt)) }); return receipt;
  }
  private deliveryFailed(errorCode: string, fileId: string, segmentIndex: number) { this.modelDeliveryFailure = { schemaVersion: "jaa-model-delivery-failure-v1", runId: this.config.runId, transportProtocol: MODEL_DELIVERY_PROTOCOL, errorCode, fileId, segmentIndex, status: this.status(), failedAt: new Date().toISOString() }; durableJson(path.join(this.progressDirectory, "model-delivery-failure.json"), this.modelDeliveryFailure); }
}

export function createAnalysisBridge(config: BridgeConfig) { return new AnalysisBridgeV0319(config); }
