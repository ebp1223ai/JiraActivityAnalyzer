import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeJaaError } from "./jaaErrorNormalizerV0327.js";

export const BRIDGE_EXECUTION_CONTEXT_VERSION = "jaa-bridge-execution-context-v1" as const;
export const MODEL_DELIVERY_HANDLE_VERSION = "jaa-model-delivery-handle-v1" as const;

export type BridgeExecutionContextState = "CREATED" | "TOOLS_REGISTERED" | "THREAD_BOUND" | "TURN_BOUND" | "DELIVERY_ACTIVE" | "DELIVERY_COMPLETED" | "TERMINAL";

export type BridgeExecutionContextConfig = {
  runDirectory: string;
  analysisAttemptId: string;
  internalRunId: string;
  provider: string;
  model: string;
  sourceInputIdentity: string;
  rulesSnapshotId: string;
  expectedRecordCount: number;
  sessionNonce: string;
  ttlMs?: number;
};

type HandleRecord = {
  handleHash: string;
  handlePrefix: string;
  contextId: string;
  threadId: string;
  turnId: string;
  manifestHash: string;
  sourceInputReceiptHash: string;
  transportVersion: "bridge-resumable-v4";
  createdAtMs: number;
  expiresAtMs: number;
  completedAtUtc: string | null;
};

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

function durableJson(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = JSON.stringify(value, null, 2) + "\n";
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, target);
  if (sha256(fs.readFileSync(target)) !== sha256(Buffer.from(body))) throw new Error("AI_ARTIFACT_HASH_MISMATCH:Bridge context receipt hash verification failed.");
}

function fail(code: string, message: string): never { throw Object.assign(new Error(`${code}:${message}`), { code }); }

export class BridgeExecutionContextV0327 {
  readonly contextVersion = BRIDGE_EXECUTION_CONTEXT_VERSION;
  readonly toolRegistrationId = `toolreg_${crypto.randomUUID()}`;
  readonly contextId = `ctx_${crypto.randomUUID()}`;
  readonly createdAtUtc = new Date().toISOString();
  readonly expiresAtMs: number;
  private state: BridgeExecutionContextState = "CREATED";
  private providerThreadId: string | null = null;
  private providerTurnId: string | null = null;
  private terminalAtUtc: string | null = null;
  private readonly turnWaiters = new Set<() => void>();
  private handleRecord: HandleRecord | null = null;

  constructor(readonly config: BridgeExecutionContextConfig) {
    this.expiresAtMs = Date.now() + (config.ttlMs ?? 30 * 60_000);
    this.writeReceipt();
  }

  registerTools() {
    if (this.state === "CREATED") this.state = "TOOLS_REGISTERED";
    else if (this.state !== "TOOLS_REGISTERED") fail("AI_BRIDGE_TOOL_REGISTRATION_MISMATCH", `Tools cannot be registered from ${this.state}.`);
    this.writeReceipt();
    return this.toolRegistrationId;
  }

  bindThread(threadId: string) {
    if (!threadId) fail("AI_BRIDGE_THREAD_BINDING_MISMATCH", "Provider Thread ID is missing.");
    if (this.providerThreadId && this.providerThreadId !== threadId) fail("AI_BRIDGE_THREAD_BINDING_MISMATCH", "Provider Thread was already bound to another value.");
    if (!["TOOLS_REGISTERED", "THREAD_BOUND"].includes(this.state)) fail("AI_BRIDGE_THREAD_BINDING_MISMATCH", `Thread cannot bind from ${this.state}.`);
    this.providerThreadId = threadId;
    this.state = "THREAD_BOUND";
    this.writeReceipt();
  }

  bindTurn(threadId: string, turnId: string) {
    if (this.providerThreadId !== threadId || !turnId) fail("AI_BRIDGE_TURN_BINDING_MISMATCH", "Provider Turn does not belong to the bound Thread.");
    if (this.providerTurnId && this.providerTurnId !== turnId) fail("AI_BRIDGE_TURN_BINDING_MISMATCH", "Provider Turn was already bound to another value.");
    if (!["THREAD_BOUND", "TURN_BOUND"].includes(this.state)) fail("AI_BRIDGE_TURN_BINDING_MISMATCH", `Turn cannot bind from ${this.state}.`);
    this.providerTurnId = turnId;
    this.state = "TURN_BOUND";
    this.writeReceipt();
    for (const resolve of this.turnWaiters) resolve();
    this.turnWaiters.clear();
  }

  async awaitTurnBound(timeoutMs = 2_000) {
    this.assertLive();
    if (this.state === "TURN_BOUND" || this.state === "DELIVERY_ACTIVE" || this.state === "DELIVERY_COMPLETED") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.turnWaiters.delete(onBound);
        reject(Object.assign(new Error("AI_BRIDGE_CONTEXT_NOT_BOUND:Provider Thread/Turn binding did not complete before the tool-call deadline."), { code: "AI_BRIDGE_CONTEXT_NOT_BOUND" }));
      }, timeoutMs);
      const onBound = () => { clearTimeout(timeout); resolve(); };
      this.turnWaiters.add(onBound);
    });
    this.assertLive();
  }

  assertHostCall(input: { toolRegistrationId?: string; threadId: string; turnId: string }) {
    this.assertLive();
    if (input.toolRegistrationId && input.toolRegistrationId !== this.toolRegistrationId) fail("AI_BRIDGE_TOOL_REGISTRATION_MISMATCH", "Tool registration does not resolve to this Context.");
    if (!this.providerThreadId || input.threadId !== this.providerThreadId) fail("AI_BRIDGE_THREAD_BINDING_MISMATCH", "Tool call Thread does not match Host binding.");
    if (!this.providerTurnId || input.turnId !== this.providerTurnId) fail("AI_BRIDGE_TURN_BINDING_MISMATCH", "Tool call Turn does not match Host binding.");
  }

  issueDeliveryHandle(manifestHash: string, sourceInputReceiptHash: string) {
    this.assertBound();
    if (this.handleRecord) fail("AI_MODEL_DELIVERY_HANDLE_REPLAYED", "A Model Delivery Handle was already issued for this Context.");
    const handle = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    this.handleRecord = {
      handleHash: sha256(handle), handlePrefix: handle.slice(0, 8), contextId: this.contextId,
      threadId: this.providerThreadId!, turnId: this.providerTurnId!, manifestHash, sourceInputReceiptHash,
      transportVersion: "bridge-resumable-v4", createdAtMs: now, expiresAtMs: Math.min(this.expiresAtMs, now + 30 * 60_000), completedAtUtc: null
    };
    this.state = "DELIVERY_ACTIVE";
    this.writeHandleReceipt("issued");
    this.writeReceipt();
    return handle;
  }

  validateDeliveryHandle(handle: unknown, call: { threadId: string; turnId: string }, nowMs = Date.now()) {
    const value = typeof handle === "string" ? handle : "";
    if (!value) fail("AI_MODEL_DELIVERY_HANDLE_MISSING", "Model Delivery Handle is required.");
    const record = this.handleRecord;
    if (!record || sha256(value) !== record.handleHash) fail("AI_MODEL_DELIVERY_HANDLE_INVALID", "Model Delivery Handle is unknown.");
    if (record.completedAtUtc) fail("AI_MODEL_DELIVERY_HANDLE_REPLAYED", "Model Delivery Handle was completed and cannot be replayed.");
    if (nowMs > record.expiresAtMs) fail("AI_MODEL_DELIVERY_HANDLE_EXPIRED", "Model Delivery Handle expired.");
    if (record.contextId !== this.contextId || record.threadId !== call.threadId || record.turnId !== call.turnId) fail("AI_MODEL_DELIVERY_HANDLE_SCOPE_MISMATCH", "Model Delivery Handle scope does not match this Context/Thread/Turn.");
    return { handleHash: record.handleHash, handlePrefix: record.handlePrefix };
  }

  completeDeliveryHandle(handle: unknown, call: { threadId: string; turnId: string }) {
    const safe = this.validateDeliveryHandle(handle, call);
    this.handleRecord!.completedAtUtc = new Date().toISOString();
    this.state = "DELIVERY_COMPLETED";
    this.writeHandleReceipt("completed");
    this.writeReceipt();
    return safe;
  }

  terminate() {
    if (this.state === "TERMINAL") return;
    this.state = "TERMINAL";
    this.terminalAtUtc = new Date().toISOString();
    this.writeReceipt();
    for (const resolve of this.turnWaiters) resolve();
    this.turnWaiters.clear();
  }

  snapshot() {
    return Object.freeze({
      contextVersion: this.contextVersion, contextId: this.contextId, toolRegistrationId: this.toolRegistrationId,
      analysisAttemptId: this.config.analysisAttemptId, internalRunId: this.config.internalRunId, provider: this.config.provider, model: this.config.model,
      sourceInputIdentity: this.config.sourceInputIdentity, rulesSnapshotId: this.config.rulesSnapshotId, expectedRecordCount: this.config.expectedRecordCount,
      sessionNonceHash: sha256(this.config.sessionNonce), contextState: this.state,
      threadBindingState: this.providerThreadId ? "BOUND" : "PENDING", turnBindingState: this.providerTurnId ? "BOUND" : "PENDING",
      providerThreadId: this.providerThreadId, providerTurnId: this.providerTurnId,
      createdAtUtc: this.createdAtUtc, expiresAtUtc: new Date(this.expiresAtMs).toISOString(), terminalAtUtc: this.terminalAtUtc,
      deliveryHandle: this.handleRecord ? { schemaVersion: MODEL_DELIVERY_HANDLE_VERSION, handleHash: this.handleRecord.handleHash, handlePrefix: this.handleRecord.handlePrefix, completedAtUtc: this.handleRecord.completedAtUtc, fullHandlePersisted: false } : null
    });
  }

  private assertBound() {
    this.assertLive();
    if (!this.providerThreadId || !this.providerTurnId || !["TURN_BOUND", "DELIVERY_ACTIVE", "DELIVERY_COMPLETED"].includes(this.state)) fail("AI_BRIDGE_CONTEXT_NOT_BOUND", "Bridge Context is not fully bound to Provider Thread/Turn.");
  }

  private assertLive() {
    if (this.state === "TERMINAL") fail("AI_BRIDGE_CONTEXT_EXPIRED", "Bridge Context is terminal.");
    if (Date.now() > this.expiresAtMs) fail("AI_BRIDGE_CONTEXT_EXPIRED", "Bridge Context expired.");
  }

  private writeReceipt() {
    durableJson(path.join(this.config.runDirectory, "progress", "bridge-execution-context-receipt.json"), { schemaVersion: BRIDGE_EXECUTION_CONTEXT_VERSION, ...this.snapshot() });
  }

  private writeHandleReceipt(event: "issued" | "completed") {
    const record = this.handleRecord!;
    durableJson(path.join(this.config.runDirectory, "progress", "model-delivery-handle-receipt.json"), {
      schemaVersion: MODEL_DELIVERY_HANDLE_VERSION, event, contextId: record.contextId, handleHash: record.handleHash, handlePrefix: record.handlePrefix,
      threadBindingStatus: "BOUND", turnBindingStatus: "BOUND", manifestHash: record.manifestHash, sourceInputReceiptHash: record.sourceInputReceiptHash,
      transportVersion: record.transportVersion, createdAtUtc: new Date(record.createdAtMs).toISOString(), expiresAtUtc: new Date(record.expiresAtMs).toISOString(), completedAtUtc: record.completedAtUtc, fullHandlePersisted: false
    });
  }
}

export function normalizeBridgeContextError(error: unknown, stage: string) {
  return normalizeJaaError(error, { stage, source: "AnalysisBridgeV0327", fallbackCode: "AI_BRIDGE_CONTRACT_MISMATCH" });
}
