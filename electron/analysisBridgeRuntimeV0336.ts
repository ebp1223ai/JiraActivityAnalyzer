import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AnalysisBridgeV0319 } from "./analysisBridgeRuntimeV0319.js";
import { BridgeExecutionContextV0334 } from "./bridgeExecutionContextV0334.js";
import { buildArtifactIdentityReceiptV0336, injectArtifactActualIdentityV0336, persistAiSubmittedArtifactV0336, sealDispatchExpectedIdentityV0336, type ArtifactIdentityV0336, type ArtifactSubmissionV0336, type RunIdentityFieldsV0336 } from "./aiArtifactIdentityV0336.js";
import { createArtifactSubmissionSchemaV0326 } from "./aiAnalysisDecisionContractV0326.js";
import { getDecisionContractDescriptorV0324 } from "./aiAnalysisDecisionContractV0324.js";
import { runLayeredValidationV0335 } from "./aiAnalysisValidationPipelineV0335.js";
import { normalizeJaaError, type NormalizedJaaError } from "./jaaErrorNormalizerV0327.js";
import { RUNTIME_CONTRACT_V0336 } from "./runtimeContractRegistryV0336.js";
import { createModelInputManifestV3, createRuntimeManifestReceiptV0336, serializeAndValidateManifestResponseV0336, writeRuntimeManifestReceiptV0336, type RuntimeManifestReceiptV0336 } from "./runtimeManifestV0336.js";
import type { EvidenceQuoteCatalog } from "./evidenceQuoteCatalogV0326.js";
import type { EvidenceSegmentV0324 } from "./aiAnalysisEvidenceSegmenterV0324.js";
import type { AnalysisBridgeToolContext, AnalysisLifecycleStage, AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";
import type { AiInstructionMode } from "../shared/analysisInstructionContract.js";
import { getHostControlLifecycleControllerV0336, releaseHostControlLifecycleControllerV0336, type HostControlStateV0336 } from "./hostControlLifecycleV0336.js";
import { TerminalOutcomeServiceV0336 } from "./terminalOutcomeServiceV0336.js";
import { ArtifactLifecycleV0336, type ArtifactStateV0336 } from "./artifactLifecycleV0336.js";

type JsonObject = Record<string, unknown>;
type Config = {
  runId: string;
  sessionNonce: string;
  runDirectory: string;
  requestPackage: any;
  rulesSnapshotId: string;
  catalogSkillIds: string[];
  instructionMode?: AiInstructionMode;
  analysisAttemptId?: string;
  requestId?: string;
  provider?: string;
  model?: string;
  manifestSha256?: string;
  commonRulesSha256?: string;
  catalogSha256?: string;
  outputSchemaSha256?: string;
  quoteCatalog?: EvidenceQuoteCatalog;
  evidenceSegments?: EvidenceSegmentV0324[];
  testHooks?: any;
};

const ARTIFACT_TOOL = "jaa_publish_analysis_artifacts_v5";
const IDENTITY_ARGUMENT = /^(runId|internalRunId|analysisAttemptId|requestId|threadId|turnId|sourceSha256|sourceDatasetSha256|rulesSnapshotId|sessionNonce)$/;
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };

function durableJson(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = JSON.stringify(value, null, 2) + "\n";
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, target);
  if (sha256(fs.readFileSync(target)) !== sha256(Buffer.from(body))) fail("AI_ARTIFACT_HASH_MISMATCH", "Durable receipt hash verification failed.");
  return target;
}

function durableText(target: string, body: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, target);
  const bytes = fs.readFileSync(target);
  if (sha256(bytes) !== sha256(Buffer.from(body))) fail("AI_ARTIFACT_HASH_MISMATCH", "Artifact reopen/hash verification failed.");
  return { relativePath: `ai-output/${path.basename(target)}`, sizeBytes: bytes.length, sha256: sha256(bytes), durable: true, reopenVerified: true };
}
function appendJsonl(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const descriptor = fs.openSync(target, "a", 0o600);
  try { fs.writeSync(descriptor, JSON.stringify(value) + "\n"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function modelSafe<T>(value: T): T {
  if (Array.isArray(value)) return value.map(modelSafe) as T;
  if (!value || typeof value !== "object") return value;
  const hidden = new Set(["runId", "internalRunId", "analysisAttemptId", "requestId", "threadId", "turnId", "sessionNonce", "sourceSha256", "sourceDatasetSha256", "rulesSnapshotId", "approvedArtifactIdentity"]);
  return Object.fromEntries(Object.entries(value as JsonObject).filter(([key]) => !hidden.has(key)).map(([key, child]) => [key, modelSafe(child)])) as T;
}

const ackSchema = {
  anyOf: [
    { type: "null" },
    {
      type: "object", additionalProperties: false,
      required: ["fileId", "segmentIndex", "deliveredBytes", "segmentSha256", "receiptToken"],
      properties: { fileId: { type: "string" }, segmentIndex: { type: "integer" }, deliveredBytes: { type: "integer" }, segmentSha256: { type: "string" }, receiptToken: { type: "string" } }
    }
  ]
} as const;

export class AnalysisBridgeV0336 {
  readonly version = "0.3.36-bridge-v16";
  readonly schemaVersion = "jaa-analysis-bridge-v11";
  readonly transport = "codex_dynamic_tools_stdio" as const;
  readonly executionContext: BridgeExecutionContextV0334;
  private readonly legacy: AnalysisBridgeV0319;
  private readonly quoteCatalog: EvidenceQuoteCatalog;
  private readonly toolCallEvidencePath: string;
  private artifactToken: string | null = null;
  private artifactTokenHash: string | null = null;
  private artifactTokenPrefix: string | null = null;
  private artifactTokenExpiresAt = 0;
  private artifactTokenConsumed = false;
  private approvedIdentity: ArtifactIdentityV0336 | null = null;
  private identityInput: RunIdentityFieldsV0336 | null = null;
  private artifactReceipt: JsonObject | null = null;
  private artifactAttempt = 0;
  private submissionRejectedCode: string | null = null;
  private manifestCache: any = null;
  private rootError: NormalizedJaaError | null = null;
  private readonly derivedErrors: NormalizedJaaError[] = [];
  private providerDispatchGateReceipt: RuntimeManifestReceiptV0336 | null = null;
  private recoverableCursorError: NormalizedJaaError | null = null;
  private readonly recoveredWarnings: NormalizedJaaError[] = [];
  private htmlRenderStatus: AnalysisLifecycleSummary["htmlRenderStatus"] | null = null;
  private readonly control: ReturnType<typeof getHostControlLifecycleControllerV0336>;
  private readonly terminalOutcome: TerminalOutcomeServiceV0336;
  private readonly artifactLifecycle = new ArtifactLifecycleV0336();
  private legacyInputReadySynchronized = false;

  constructor(private readonly config: Config) {
    this.legacy = new AnalysisBridgeV0319({ ...config, requestPackage: { ...config.requestPackage, decisionContractVersion: "jaa-ai-analysis-decisions-v4" } });
    this.quoteCatalog = config.quoteCatalog ?? { schemaVersion: "jaa-evidence-quote-catalog-v1", catalogVersion: "JAA-EVIDENCE-QUOTE-CATALOG-1.0.0", recordCount: config.requestPackage.inputRecordCount, quoteCount: 0, entries: [], catalogSha256: sha256("empty") };
    this.toolCallEvidencePath = path.join(config.runDirectory, "progress", "bridge-tool-calls.jsonl");
    this.control = getHostControlLifecycleControllerV0336(config.runDirectory, { failFinalizePostcondition: Boolean(config.testHooks?.failFinalizePostcondition) });
    this.terminalOutcome = new TerminalOutcomeServiceV0336(config.runDirectory, config.runId);
    this.executionContext = new BridgeExecutionContextV0334({
      runDirectory: config.runDirectory,
      analysisAttemptId: config.analysisAttemptId ?? `attempt_${config.runId}`,
      internalRunId: config.runId,
      provider: config.provider ?? "chatgpt_codex",
      model: config.model ?? "selected-model",
      sourceInputIdentity: config.requestPackage.pendingSourceSha256,
      rulesSnapshotId: config.rulesSnapshotId,
      expectedRecordCount: config.requestPackage.inputRecordCount,
      sessionNonce: config.sessionNonce
    });
    durableJson(path.join(config.runDirectory, "derived", "evidence-quote-catalog-receipt.json"), { schemaVersion: "jaa-evidence-quote-catalog-receipt-v1", catalogVersion: this.quoteCatalog.catalogVersion, quoteCount: this.quoteCatalog.quoteCount, catalogSha256: this.quoteCatalog.catalogSha256, createdAtUtc: new Date().toISOString() });
    if (this.quoteCatalog.entries.length) fs.writeFileSync(path.join(config.runDirectory, "derived", "evidence-quote-catalog.jsonl"), this.quoteCatalog.entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf8");
  }

  get toolRegistrationId() { return this.executionContext.toolRegistrationId; }

  toolSpecs() {
    this.executionContext.registerTools();
    const delivery = [
      { type: "function", name: "jaa_get_input_manifest", description: "取得本次 Host-bound Context 的四檔 manifest 與 opaque delivery handle。不得傳入 Run identity。", inputSchema: { type: "object", additionalProperties: false, properties: {} } },
      { type: "function", name: "jaa_read_and_ack_next_segment", description: "以 opaque handle 原子 ACK 前一 segment 並讀取下一 segment。", inputSchema: { type: "object", additionalProperties: false, required: ["deliveryHandle", "cursor", "previousAck"], properties: { deliveryHandle: { type: "string", minLength: 32 }, cursor: { type: "integer", minimum: 0 }, previousAck: ackSchema } } },
      { type: "function", name: "jaa_get_delivery_status", description: "以 opaque handle 查詢目前 delivery 狀態。", inputSchema: { type: "object", additionalProperties: false, required: ["deliveryHandle"], properties: { deliveryHandle: { type: "string", minLength: 32 } } } },
      { type: "function", name: "jaa_finalize_input_delivery", description: "以 opaque handle 與 final ACK 建立 Model Delivery Receipt。", inputSchema: { type: "object", additionalProperties: false, required: ["deliveryHandle", "finalAck"], properties: { deliveryHandle: { type: "string", minLength: 32 }, finalAck: ackSchema } } }
    ];
    if (this.config.instructionMode === "CUSTOM_DIAGNOSTIC") return delivery;
    const progress = { type: "function", name: "jaa_report_analysis_progress", description: "以 opaque handle 回報分析 checkpoint。", inputSchema: { type: "object", additionalProperties: false, required: ["deliveryHandle", "phase", "expectedCount", "completedCount", "decisionPreparedCount", "message"], properties: { deliveryHandle: { type: "string", minLength: 32 }, phase: { type: "string", enum: ["INPUT_READY", "ANALYSIS_STARTED", "ANALYSIS_COMPLETED", "ARTIFACT_SUBMISSION_STARTED"] }, expectedCount: { type: "integer", minimum: 0 }, completedCount: { type: "integer", minimum: 0 }, decisionPreparedCount: { type: "integer", minimum: 0 }, statusDistribution: { type: ["object", "null"], additionalProperties: { type: "integer", minimum: 0 } }, message: { type: "string", minLength: 1, maxLength: 2000 } } } };
    const submissionSchema = createArtifactSubmissionSchemaV0326(this.config.requestPackage.inputRecordCount);
    return [...delivery, progress, { type: "function", name: ARTIFACT_TOOL, description: "提交一次 Decision v5、繁中分析報告與摘要；JAA 由 Host Context 注入正式 identity。", inputSchema: submissionSchema }];
  }

  preflight() {
    if (!/^[a-f0-9]{64}$/i.test(this.config.outputSchemaSha256 ?? "")) fail("AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED", "Verified output schema SHA-256 is required before provider dispatch.");
    const legacy = this.legacy.preflight();
    const probe = new AnalysisBridgeV0319({ ...this.config, requestPackage: { ...this.config.requestPackage, decisionContractVersion: "jaa-ai-analysis-decisions-v4" } });
    const probeContext = { runId: this.config.runId, sessionNonce: this.config.sessionNonce, threadId: "provider-dispatch-gate", turnId: "provider-dispatch-gate", callId: "provider-dispatch-gate" };
    const sourceManifest = modelSafe(probe.handle("jaa_get_input_manifest", { runId: this.config.runId }, probeContext));
    const gateManifest = createModelInputManifestV3(RUNTIME_CONTRACT_V0336, sourceManifest, { deliveryHandle: `dispatch_gate_${"0".repeat(32)}`, artifactSubmissionToken: null });
    const receipt = createRuntimeManifestReceiptV0336(gateManifest, true, RUNTIME_CONTRACT_V0336);
    this.providerDispatchGateReceipt = receipt;
    writeRuntimeManifestReceiptV0336(this.config.runDirectory, "provider-dispatch-gate-receipt.json", receipt);
    durableJson(path.join(this.config.runDirectory, "control", "runtime-contract-registry.json"), RUNTIME_CONTRACT_V0336);
    if (!receipt.selfValidationPassed || !receipt.providerDispatchAllowed) {
      const code = receipt.errorCode ?? "AI_PROVIDER_DISPATCH_BLOCKED";
      const normalized = normalizeJaaError(Object.assign(new Error(`${code}:Provider dispatch blocked by Runtime Manifest self-validation.`), { code }), { stage: "MODEL_INPUT_MANIFEST_GENERATION", source: "ProviderDispatchGateV0328", fallbackCode: code });
      this.captureRootError(normalized);
      for (const derived of ["AI_MODEL_INPUT_DELIVERY_INCOMPLETE", "AI_ANALYSIS_NOT_STARTED", "AI_ARTIFACT_NOT_SUBMITTED"]) this.markDerivedError(derived, "Provider was not dispatched because Runtime Manifest validation failed.", "BRIDGE_PREFLIGHT_COMPLETED");
      throw Object.assign(new Error(`${code}:${normalized.technicalMessage}`), { code, normalized });
    }
    return { ...modelSafe(legacy), version: this.version, runtimeContract: RUNTIME_CONTRACT_V0336, providerDispatchGate: receipt, bridgeExecutionContext: "jaa-bridge-execution-context-v1", modelDeliveryHandle: RUNTIME_CONTRACT_V0336.modelDeliveryHandleContract, transportProtocol: RUNTIME_CONTRACT_V0336.providerTransport, decisionContract: RUNTIME_CONTRACT_V0336.decisionContract, artifactSubmissionTokenContract: RUNTIME_CONTRACT_V0336.artifactSubmissionTokenContract, modelVisibleIdentityFields: [], hostOwnedIdentity: true };
  }

  bindProviderThread(threadId: string) { this.executionContext.bindThread(threadId); }

  bindProviderTurn(threadId: string, turnId: string) {
    this.control.providerDispatched();
    this.executionContext.bindTurn(threadId, turnId);
    if (this.approvedIdentity) return;
    this.identityInput = Object.freeze({
      analysisAttemptId: this.config.analysisAttemptId ?? `attempt_${this.config.runId}`,
      runId: this.config.runId,
      requestId: this.config.requestId ?? this.executionContext.toolRegistrationId,
      threadId,
      turnId,
      provider: this.config.provider ?? "chatgpt_codex",
      model: this.config.model ?? "selected-model",
      sourceDatasetSha256: this.config.requestPackage.pendingSourceSha256,
      sourceDatasetBytes: Number(this.config.requestPackage.documents?.find((document: any) => document.role === "PENDING_ANALYSIS_JSON")?.snapshotByteLength ?? 0),
      sourceRecordCount: this.config.requestPackage.inputRecordCount,
      rulesSnapshotId: this.config.rulesSnapshotId,
      manifestSha256: this.config.manifestSha256 ?? "unavailable",
      commonRulesSha256: this.config.commonRulesSha256 ?? "unavailable",
      catalogSha256: this.config.catalogSha256 ?? "unavailable",
      outputSchemaSha256: this.config.outputSchemaSha256!
    });
    this.approvedIdentity = sealDispatchExpectedIdentityV0336(this.identityInput);
    this.artifactToken = crypto.randomBytes(32).toString("base64url");
    this.artifactTokenHash = sha256(this.artifactToken);
    this.artifactTokenPrefix = this.artifactToken.slice(0, 8);
    this.artifactTokenExpiresAt = Date.now() + 30 * 60_000;
    durableJson(path.join(this.config.runDirectory, "progress", "artifact-submission-token-receipt.json"), { schemaVersion: "jaa-artifact-submission-token-v1", tokenHash: this.artifactTokenHash, tokenPrefix: this.artifactTokenPrefix, identityHash: sha256(JSON.stringify(this.approvedIdentity)), threadBindingStatus: "BOUND", turnBindingStatus: "BOUND", expiresAtUtc: new Date(this.artifactTokenExpiresAt).toISOString(), fullTokenPersisted: false });
  }

  async handle(tool: string, argsValue: unknown, context: AnalysisBridgeToolContext) {
    const started = Date.now();
    const providerStateBefore = this.control.snapshot().state;
    const args = object(argsValue);
    let normalized: NormalizedJaaError | null = null;
    try {
      await this.executionContext.awaitTurnBound();
      this.executionContext.assertHostCall({ toolRegistrationId: context.toolRegistrationId, threadId: context.threadId, turnId: context.turnId });
      const forbidden = Object.keys(args).find((key) => IDENTITY_ARGUMENT.test(key));
      if (forbidden) fail("AI_BRIDGE_CONTRACT_MISMATCH", `Model-visible tool argument '${forbidden}' is forbidden by the zero-identity contract.`);
      let result: unknown;
      if (tool === "jaa_get_input_manifest") result = this.manifest(args, context);
      else if (tool === "jaa_read_and_ack_next_segment") result = this.readAndAck(args, context);
      else if (tool === "jaa_get_delivery_status") result = this.status(args, context);
      else if (tool === "jaa_finalize_input_delivery") result = this.finalize(args, context);
      else if (tool === "jaa_report_analysis_progress") result = this.progress(args, context);
      else if (tool === ARTIFACT_TOOL) result = this.publish(args, context);
      else fail("AI_BRIDGE_CONTRACT_MISMATCH", `Unknown Analysis Bridge tool: ${tool}`);
      if (this.recoverableCursorError && ["jaa_read_and_ack_next_segment", "jaa_get_delivery_status", "jaa_finalize_input_delivery"].includes(tool)) { this.recoveredWarnings.push(this.recoverableCursorError); this.recoverableCursorError = null; }
      this.writeToolEvidence(tool, args, context, started, true, null, providerStateBefore);
      return modelSafe(result);
    } catch (error) {
      normalized = normalizeJaaError(error, { stage: this.stageForTool(tool), source: "AnalysisBridgeV0336", fallbackCode: "AI_INPUT_TOOL_FAILED", safeDetails: { callId: context.callId, toolName: tool, argumentNames: Object.keys(args).sort() } });
      if (normalized.errorCode === "AI_MODEL_INPUT_CURSOR_MISMATCH") this.recoverableCursorError = normalized;
      else if (tool === "jaa_report_analysis_progress") this.recoveredWarnings.push(normalized);
      else this.captureRootError(normalized);
      this.writeToolEvidence(tool, args, context, started, false, normalized, providerStateBefore);
      throw Object.assign(new Error(`${normalized.errorCode}:${normalized.technicalMessage}`), { code: normalized.errorCode, normalized });
    }
  }

  markDerivedError(code: string, message: string, stage: AnalysisLifecycleStage) {
    const normalized = normalizeJaaError(Object.assign(new Error(`${code}:${message}`), { code }), { stage, source: "ChatGptService", fallbackCode: code });
    if (!this.derivedErrors.some((entry) => entry.errorCode === normalized.errorCode && entry.stage === normalized.stage)) this.derivedErrors.push(normalized);
    this.legacy.fail(stage, code);
  }

  terminate() { if (this.recoverableCursorError) { this.captureRootError(this.recoverableCursorError); this.recoverableCursorError = null; } this.executionContext.terminate(); releaseHostControlLifecycleControllerV0336(this.config.runDirectory); }

  private hostContext(context: AnalysisBridgeToolContext): AnalysisBridgeToolContext {
    return { ...context, runId: this.config.runId, sessionNonce: this.config.sessionNonce, toolRegistrationId: this.executionContext.toolRegistrationId };
  }

  private manifest(args: JsonObject, context: AnalysisBridgeToolContext) {
    if (Object.keys(args).length) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Manifest is a zero-argument tool and accepts only {}.");
    this.manifestCache ??= this.legacy.handle("jaa_get_input_manifest", { runId: this.config.runId }, this.hostContext(context)) as any;
    const sourceManifest = modelSafe(this.manifestCache);
    const sourceReceipt = this.legacy.snapshot().sourceInputReceipt ?? {};
    const deliveryHandle = this.executionContext.issueDeliveryHandle(sha256(JSON.stringify(sourceManifest)), sha256(JSON.stringify(sourceReceipt)));
    const manifest = createModelInputManifestV3(RUNTIME_CONTRACT_V0336, sourceManifest, { deliveryHandle, artifactSubmissionToken: this.config.instructionMode === "CUSTOM_DIAGNOSTIC" ? null : this.artifactToken });
    const receipt = createRuntimeManifestReceiptV0336(manifest, true, RUNTIME_CONTRACT_V0336);
    writeRuntimeManifestReceiptV0336(this.config.runDirectory, "runtime-manifest-receipt.json", receipt);
    writeRuntimeManifestReceiptV0336(this.config.runDirectory, "runtime-manifest-self-validation.json", receipt);
    writeRuntimeManifestReceiptV0336(this.config.runDirectory, "model-input-manifest-receipt.json", receipt);
    durableJson(path.join(this.config.runDirectory, "control", "model-input-manifest.json"), { ...manifest, deliveryHandle: "[redacted]", artifactSubmissionToken: manifest.artifactSubmissionToken ? "[redacted]" : null });
    if (!receipt.selfValidationPassed) fail(receipt.errorCode ?? "AI_RUNTIME_MANIFEST_SERIALIZATION_MISMATCH", `Runtime Manifest self-validation failed. expected=${receipt.expectedProtocol} observed=${receipt.observedProtocol}`);
    return manifest;
  }

  serializeToolResponse(tool: string, result: unknown) {
    if (tool === "jaa_get_input_manifest") {
      const response = serializeAndValidateManifestResponseV0336(result, RUNTIME_CONTRACT_V0336);
      return { contentItems: response.contentItems, success: true as const };
    }
    return { contentItems: [{ type: "inputText", text: JSON.stringify(result) }], success: true as const };
  }

  private validateHandle(args: JsonObject, context: AnalysisBridgeToolContext, operation: "mutation" | "readonly" | "finalize" = "mutation") {
    return this.executionContext.validateDeliveryHandle(args.deliveryHandle, { threadId: context.threadId, turnId: context.turnId }, operation);
  }

  private readAndAck(args: JsonObject, context: AnalysisBridgeToolContext) {
    this.validateHandle(args, context);
    const host = this.hostContext(context);
    if (args.previousAck) this.legacy.handle("jaa_ack_input_segment", { runId: this.config.runId, ...object(args.previousAck) }, host);
    this.manifestCache ??= this.legacy.handle("jaa_get_input_manifest", { runId: this.config.runId }, host) as any;
    const status = this.legacy.handle("jaa_get_delivery_status", { runId: this.config.runId }, host) as any;
    const next = status.missingSegments?.[0];
    if (!next) return { schemaVersion: "jaa-read-and-ack-next-segment-v2", sequence: status.acknowledgedSegments, ackReceiptId: args.previousAck ? `ack_${sha256(JSON.stringify(args.previousAck)).slice(0, 24)}` : null, nextSegment: null, nextCursor: Number(args.cursor), eof: true, finalizeRequired: true };
    const file = this.manifestCache.files.find((entry: any) => entry.fileId === next.fileId);
    const metadata = file.segments[next.segmentIndex];
    if (Number(args.cursor) !== metadata.startByte) fail("AI_MODEL_INPUT_CURSOR_MISMATCH", "Combined cursor skipped, rolled back, or does not match the next durable segment.");
    const segment = this.legacy.handle("jaa_read_input_segment", { runId: this.config.runId, fileId: next.fileId, segmentIndex: next.segmentIndex, cursor: metadata.startByte }, host) as any;
    this.control.inputSegmentRead();
    const ordered = this.manifestCache.files.flatMap((entry: any) => entry.segments.map((part: any) => ({ fileId: entry.fileId, ...part })));
    const position = ordered.findIndex((part: any) => part.fileId === next.fileId && part.segmentIndex === next.segmentIndex);
    const following = ordered[position + 1];
    return { schemaVersion: "jaa-read-and-ack-next-segment-v2", sequence: status.acknowledgedSegments, ackReceiptId: args.previousAck ? `ack_${sha256(JSON.stringify(args.previousAck)).slice(0, 24)}` : null, nextSegment: segment, nextCursor: following?.startByte ?? segment.nextCursor, eof: false, finalizeRequired: false };
  }

  private status(args: JsonObject, context: AnalysisBridgeToolContext) {
    this.validateHandle(args, context, "readonly");
    return { ...(this.legacy.handle("jaa_get_delivery_status", { runId: this.config.runId }, this.hostContext(context)) as JsonObject), providerLifecycle: this.control.snapshot() };
  }

  private finalize(args: JsonObject, context: AnalysisBridgeToolContext) {
    this.validateHandle(args, context, "finalize");
    const host = this.hostContext(context);
    if (args.finalAck) this.legacy.handle("jaa_ack_input_segment", { runId: this.config.runId, ...object(args.finalAck) }, host);
    const legacyReceipt = this.legacy.handle("jaa_finalize_input_delivery", { runId: this.config.runId }, host) as JsonObject;
    const bindingHash = sha256(JSON.stringify({
      deliveryHandleHash: sha256(String(args.deliveryHandle ?? "")),
      finalAck: args.finalAck ?? null,
      receipt: legacyReceipt,
      threadId: context.threadId,
      turnId: context.turnId
    }));
    const receipt = this.control.finalize({ bindingHash, receipt: { ...legacyReceipt, transportProtocol: RUNTIME_CONTRACT_V0336.providerTransport } });
    durableJson(path.join(this.config.runDirectory, "progress", "model-delivery-receipt.json"), receipt);
    this.executionContext.completeDeliveryHandle(args.deliveryHandle, { threadId: context.threadId, turnId: context.turnId });
    if (this.control.snapshot().state !== "INPUT_READY") fail("AI_LIFECYCLE_POSTCONDITION_FAILED", "Finalize returned without INPUT_READY postcondition.");
    return receipt;
  }

  private progress(args: JsonObject, context: AnalysisBridgeToolContext) {
    this.validateHandle(args, context, "readonly");
    return this.control.reportProgress({
      phase: String(args.phase) as "INPUT_READY" | "ANALYSIS_STARTED" | "ANALYSIS_COMPLETED" | "ARTIFACT_SUBMISSION_STARTED",
      expectedCount: Number(args.expectedCount),
      completedCount: Number(args.completedCount),
      decisionPreparedCount: Number(args.decisionPreparedCount),
      message: String(args.message)
    });
  }
  private publish(args: JsonObject, context: AnalysisBridgeToolContext) {
    if (!this.approvedIdentity || !this.artifactToken || !this.artifactTokenHash) fail("AI_BRIDGE_CONTEXT_NOT_BOUND", "Approved Artifact Identity is not sealed.");
    const identity = this.approvedIdentity!;
    const tokenHash = this.artifactTokenHash!;
    this.artifactAttempt += 1;
    this.artifactLifecycle.transition("received");
    const submission: ArtifactSubmissionV0336 = { artifactSubmissionToken: typeof args.artifactSubmissionToken === "string" ? args.artifactSubmissionToken : "", decisions: args.decisions, analysisReportMarkdown: String(args.analysisReportMarkdown ?? ""), finalSummaryZhTw: String(args.finalSummaryZhTw ?? "") };
    const persisted = persistAiSubmittedArtifactV0336(this.config.runDirectory, this.artifactAttempt, submission, identity);
    const actualIdentity = injectArtifactActualIdentityV0336(this.identityInput!, identity.createdAtUtc);
    const identityPath = path.join(this.config.runDirectory, "artifact-attempts", `artifact-identity-receipt-${String(this.artifactAttempt).padStart(3, "0")}.json`);
    const reject = (code: string, message: string): never => {
      this.submissionRejectedCode = code;
      const receipt = { ...buildArtifactIdentityReceiptV0336(identity, actualIdentity, code), accepted: false, firstMismatchCode: code, tokenHash, tokenPrefix: this.artifactTokenPrefix, fullTokenPersisted: false };
      durableJson(identityPath, receipt);
      return fail(code, message);
    };
    if (!submission.artifactSubmissionToken) reject("AI_ARTIFACT_TOKEN_MISSING", "Artifact token is required.");
    if (sha256(submission.artifactSubmissionToken) !== this.artifactTokenHash) reject("AI_ARTIFACT_TOKEN_INVALID", "Artifact token is invalid.");
    if (Date.now() > this.artifactTokenExpiresAt) reject("AI_ARTIFACT_TOKEN_EXPIRED", "Artifact token expired.");
    if (this.artifactTokenConsumed) reject("AI_ARTIFACT_TOKEN_REPLAYED", "Artifact token was already consumed.");
    if (context.threadId !== identity.threadId || context.turnId !== identity.turnId) reject("AI_ARTIFACT_TOKEN_SCOPE_MISMATCH", "Artifact token scope does not match the Host-bound Turn.");
    this.artifactTokenConsumed = true;
    const identityReceipt = { ...buildArtifactIdentityReceiptV0336(identity, actualIdentity, "MATCH"), tokenHash, tokenPrefix: this.artifactTokenPrefix, fullTokenPersisted: false };
    durableJson(identityPath, identityReceipt);
    if (!identityReceipt.accepted) reject("IDENTITY_MISMATCH", "Artifact-time Host identity does not match dispatch-time expected identity.");
    const decisions = Array.isArray(submission.decisions) ? submission.decisions as Array<Record<string, unknown>> : [];
    if (decisions.length === identity.sourceRecordCount && decisions.length > 0 && decisions.every((decision) => decision.status === "FAILED")) {
      durableJson(path.join(this.config.runDirectory, "progress", "provider-run-failure-receipt.json"), { schemaVersion: "jaa-provider-run-failure-receipt-v1", status: "FAILED", errorCode: "AI_PROVIDER_RUN_LEVEL_FAILURE", receivedDecisionCount: decisions.length, formalArtifactCreated: false, createdAtUtc: new Date().toISOString() });
      this.terminalOutcome.validationFailed();
      fail("AI_PROVIDER_RUN_LEVEL_FAILURE", "Provider returned an all-FAILED batch; treat this as a run-level failure, not formal per-record analysis.");
    }
    if (decisions.length !== identity.sourceRecordCount || decisions.some((decision, index) => Number(decision.recordIndex) !== index)) {
      reject("AI_ARTIFACT_DECISION_COUNT_INVALID", `Artifact requires exact ordered decisions expected=${identity.sourceRecordCount} actual=${decisions.length}.`);
    }
    if (!submission.analysisReportMarkdown.trim() || !submission.finalSummaryZhTw.trim()) reject("AI_ARTIFACT_RECEIPT_INVALID", "Analysis Report and final Traditional Chinese summary are required.");
    this.control.acceptArtifact(persisted.artifact.sha256, decisions.length);
    const outputDirectory = path.join(this.config.runDirectory, "ai-output");
    const artifacts = [
      { role: "DECISIONS_JSON", ...durableText(path.join(outputDirectory, "ai-analysis-decisions.json"), JSON.stringify(decisions) + "\n") },
      { role: "ANALYSIS_REPORT", ...durableText(path.join(outputDirectory, "analysis-report.md"), submission.analysisReportMarkdown.trim() + "\n") },
      { role: "ARTIFACT_FINAL_SUMMARY", ...durableText(path.join(outputDirectory, "artifact-final-summary.txt"), submission.finalSummaryZhTw.trim() + "\n") }
    ];
    this.artifactReceipt = {
      schemaVersion: "jaa-artifact-submission-result-v3",
      status: "persisted",
      decisionCount: decisions.length,
      authoritativeDistribution: null,
      warnings: [],
      decisionContractVersion: RUNTIME_CONTRACT_V0336.decisionContract,
      approvedArtifactIdentity: identity,
      aiSubmittedArtifactSha256: persisted.artifact.sha256,
      identityReceiptPath: identityPath,
      artifacts,
      persistedAt: new Date().toISOString()
    };
    durableJson(path.join(this.config.runDirectory, "progress", "artifact-receipt.json"), this.artifactReceipt);
    return this.artifactReceipt;
  }

  private captureRootError(normalized: NormalizedJaaError) {
    if (!this.rootError) {
      this.rootError = normalized;
      this.legacy.fail(this.stageForToolName(normalized.stage), normalized.errorCode);
    } else if (!this.derivedErrors.some((entry) => entry.errorCode === normalized.errorCode && entry.stage === normalized.stage)) this.derivedErrors.push(normalized);
  }

  private stageForTool(tool: string) {
    if (tool === ARTIFACT_TOOL) return "ARTIFACT_SUBMISSION_VALIDATION";
    if (tool === "jaa_report_analysis_progress") return "ANALYSIS_STARTED";
    return "INPUT_READING";
  }

  private stageForToolName(stage: string): AnalysisLifecycleStage {
    return stage === "ARTIFACT_SUBMISSION_VALIDATION" ? "ARTIFACT_SUBMISSION_VALIDATION" : stage === "ANALYSIS_STARTED" ? "ANALYSIS_STARTED" : "INPUT_READING";
  }

  private writeToolEvidence(tool: string, args: JsonObject, context: AnalysisBridgeToolContext, startedAt: number, success: boolean, error: NormalizedJaaError | null, providerStateBefore: string) {
    const snapshot = this.executionContext.snapshot();
    appendJsonl(this.toolCallEvidencePath, {
      schemaVersion: "jaa-bridge-tool-call-evidence-v1",
      toolRegistrationId: this.executionContext.toolRegistrationId,
      toolName: tool,
      callId: context.callId,
      argumentSchemaVersion: this.schemaVersion,
      argumentNames: Object.keys(args).sort(),
      contextResolutionStatus: error?.errorCode === "AI_BRIDGE_CONTEXT_AMBIGUOUS" ? "AMBIGUOUS" : error?.errorCode?.startsWith("AI_BRIDGE_") ? "REJECTED" : "RESOLVED",
      threadBindingStatus: snapshot.threadBindingState,
      turnBindingStatus: snapshot.turnBindingState,
      deliveryHandleStatus: "deliveryHandle" in args ? "PRESENT_REDACTED" : "NOT_APPLICABLE",
      startedAtUtc: new Date(startedAt).toISOString(),
      completedAtUtc: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      success,
      providerStateBefore,
      providerStateAfter: this.control.snapshot().state,
      lifecycleReceiptId: this.control.snapshot().finalized?.receiptId ?? null,
      errorCode: error?.errorCode ?? null,
      safeMessage: error?.messageZhTw ?? null,
      fullHandlePersisted: false,
      fullTokenPersisted: false
    });
  }

  setProviderTurnStatus(status: AnalysisLifecycleSummary["providerTurnStatus"]) {
    this.legacy.setProviderTurnStatus(status);
    if (status === "completed" || status === "failed" || status === "interrupted") this.terminalOutcome.providerTerminal(status === "interrupted" ? "cancelled" : status);
  }
  setControlStage(state: HostControlStateV0336, reason: string, receiptId: string | null = null) { return this.control.transition(state, reason, receiptId); }
  setArtifactStatus(status: Extract<ArtifactStateV0336, "content_validated" | "formally_published">) { return this.artifactLifecycle.transition(status); }
  setHtmlRenderStatus(status: AnalysisLifecycleSummary["htmlRenderStatus"]) { this.htmlRenderStatus = status; if (status === "completed") this.control.transition("HTML_RENDERED", "HTML renderer receipt completed."); }
  setSqliteStatus(status: AnalysisLifecycleSummary["sqliteStatus"], code?: string) { this.legacy.setSqliteStatus(status); this.control.transition("SQLITE_GATE", `SQLite gate status=${status}.`); if (status === "commit_failed" && code) this.markDerivedError(code, "SQLite commit failed after analysis.", "RUN_COMPLETED"); }
  setPostBridgeStage(stage: "VALIDATION_COMPLETED" | "CANONICAL_ASSEMBLY_COMPLETED" | "RUN_COMPLETED", status: "completed" | "failed") { this.legacy.setPostBridgeStage(stage, status); if (stage === "CANONICAL_ASSEMBLY_COMPLETED" && status === "completed") this.control.transition("CANONICAL_CREATED", "Canonical durable write completed."); else if (stage === "RUN_COMPLETED") { this.terminalOutcome.postArtifactTerminal(status === "completed" ? "SUCCEEDED" : "FAILED"); this.control.complete(status === "completed" ? "SUCCEEDED" : "FAILED", status === "failed" ? "AI_RUN_FAILED" : null); } }
  fail(stage: AnalysisLifecycleStage, code: string, message = code) { const normalized = normalizeJaaError(Object.assign(new Error(`${code}:${message}`), { code }), { stage, source: "AnalysisBridgeV0336", fallbackCode: code }); this.captureRootError(normalized); }

  snapshot() {
    const snapshot = this.legacy.snapshot();
    const lifecycle = {
      ...snapshot.lifecycle,
      htmlRenderStatus: this.htmlRenderStatus ?? snapshot.lifecycle.htmlRenderStatus,
      inputStatus: ["INPUT_READY", "ARTIFACT_RECEIVED", "VALIDATING", "CANONICAL_CREATED", "ANALYZED_RESULT_PUBLISHED", "ACTIVE_RESULT_COMMITTED", "REPORT_PACKAGE_CREATED", "HTML_RENDERED", "SQLITE_GATE", "TERMINAL"].includes(this.control.snapshot().state) ? "ready" as const : this.control.snapshot().state === "INPUT_READING" ? "reading" as const : snapshot.lifecycle.inputStatus,
      modelInputStatus: this.control.snapshot().finalized ? "delivered" as const : snapshot.lifecycle.modelInputStatus,
      analysisStatus: this.artifactReceipt || ["COMPLETED", "COMPLETED_BY_ARTIFACT"].includes(this.control.snapshot().analysisTelemetry.state) ? "completed" as const : this.control.snapshot().analysisTelemetry.state === "NOT_REPORTED" ? "not_started" as const : "running" as const,
      validationStatus: this.control.snapshot().state === "VALIDATING" ? "running" as const : ["CANONICAL_CREATED", "ANALYZED_RESULT_PUBLISHED", "ACTIVE_RESULT_COMMITTED", "REPORT_PACKAGE_CREATED", "HTML_RENDERED", "SQLITE_GATE", "TERMINAL"].includes(this.control.snapshot().state) ? "passed" as const : snapshot.lifecycle.validationStatus,
      rootErrorCode: this.rootError?.errorCode ?? snapshot.lifecycle.rootErrorCode,
      rootErrorStage: this.rootError?.stage ?? null,
      rootErrorMessage: this.rootError?.messageZhTw ?? null,
      derivedErrorCodes: this.derivedErrors.map((entry) => entry.errorCode),
      derivedStatusCodes: [...new Set([...(snapshot.lifecycle.derivedStatusCodes ?? []), ...this.derivedErrors.map((entry) => entry.errorCode)])],
      artifactStatus: this.submissionRejectedCode ? "rejected" as const : this.artifactReceipt ? this.artifactLifecycle.snapshot().state : this.artifactAttempt > 0 ? "received" as const : snapshot.lifecycle.artifactStatus,
      artifactAttemptStatus: this.artifactAttempt > 0 ? "received" as const : "not_started" as const,
      overallStatus: this.rootError || this.submissionRejectedCode ? "failed" as const : snapshot.lifecycle.overallStatus,
      controlState: this.control.snapshot().state,
      analysisTelemetry: this.control.snapshot().analysisTelemetry,
      analysisStarted: Boolean(this.artifactReceipt) || snapshot.lifecycle.analysisStarted,
      analysisCompleted: Boolean(this.artifactReceipt) || ["COMPLETED", "COMPLETED_BY_ARTIFACT"].includes(this.control.snapshot().analysisTelemetry.state),
      completedCount: this.control.snapshot().analysisTelemetry.lastProgress?.completedCount ?? Number(this.artifactReceipt?.decisionCount ?? 0),
      decisionPreparedCount: this.control.snapshot().analysisTelemetry.lastProgress?.decisionPreparedCount ?? Number(this.artifactReceipt?.decisionCount ?? 0)
    };
    return {
      ...snapshot,
      lifecycle,
      artifactReceipt: this.artifactReceipt ?? snapshot.artifactReceipt,
      transportProtocol: RUNTIME_CONTRACT_V0336.providerTransport,
      runtimeContract: RUNTIME_CONTRACT_V0336,
      providerDispatchGate: this.providerDispatchGateReceipt,
      decisionContract: RUNTIME_CONTRACT_V0336.decisionContract,
      bridgeExecutionContext: this.executionContext.snapshot(),
      providerLifecycle: this.control.snapshot(),
      hostControlLifecycle: this.control.snapshot(),
      analysisTelemetry: this.control.snapshot().analysisTelemetry,
      toolCallEvidencePath: this.toolCallEvidencePath,
      rootError: this.rootError,
      derivedErrors: structuredClone(this.derivedErrors),
      recoveredWarnings: structuredClone(this.recoveredWarnings),
      artifactToken: this.artifactTokenHash ? { schemaVersion: "jaa-artifact-submission-token-v1", tokenHash: this.artifactTokenHash, tokenPrefix: this.artifactTokenPrefix, fullTokenPersisted: false, consumed: this.artifactTokenConsumed } : null
    };
  }
}

export function createAnalysisBridge(config: Config) { return new AnalysisBridgeV0336(config); }
