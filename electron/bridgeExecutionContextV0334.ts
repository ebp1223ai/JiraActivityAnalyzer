import crypto from "node:crypto";
import { BridgeExecutionContextV0327, type BridgeExecutionContextConfig } from "./bridgeExecutionContextV0327.js";

export type DeliveryHandleOperationV0334 = "mutation" | "readonly" | "finalize";

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };

/** v14 compatibility layer: completed handles stay valid for readonly status and identical finalize replay. */
export class BridgeExecutionContextV0334 {
  private readonly legacy: BridgeExecutionContextV0327;

  constructor(config: BridgeExecutionContextConfig) { this.legacy = new BridgeExecutionContextV0327(config); }
  get contextVersion() { return this.legacy.contextVersion; }
  get toolRegistrationId() { return this.legacy.toolRegistrationId; }
  get contextId() { return this.legacy.contextId; }
  registerTools() { return this.legacy.registerTools(); }
  bindThread(threadId: string) { return this.legacy.bindThread(threadId); }
  bindTurn(threadId: string, turnId: string) { return this.legacy.bindTurn(threadId, turnId); }
  awaitTurnBound(timeoutMs?: number) { return this.legacy.awaitTurnBound(timeoutMs); }
  assertHostCall(input: { toolRegistrationId?: string; threadId: string; turnId: string }) { return this.legacy.assertHostCall(input); }
  issueDeliveryHandle(manifestHash: string, sourceInputReceiptHash: string) { return this.legacy.issueDeliveryHandle(manifestHash, sourceInputReceiptHash); }
  terminate() { return this.legacy.terminate(); }
  snapshot() { return this.legacy.snapshot(); }

  validateDeliveryHandle(handle: unknown, call: { threadId: string; turnId: string }, operation: DeliveryHandleOperationV0334 = "mutation") {
    const snapshot = this.legacy.snapshot();
    const completed = snapshot.deliveryHandle?.completedAtUtc;
    if (!completed || operation === "mutation") return this.legacy.validateDeliveryHandle(handle, call);
    const value = typeof handle === "string" ? handle : "";
    if (!value) fail("AI_MODEL_DELIVERY_HANDLE_MISSING", "Model Delivery Handle is required.");
    if (sha256(value) !== snapshot.deliveryHandle?.handleHash) fail("AI_MODEL_DELIVERY_HANDLE_INVALID", "Model Delivery Handle is unknown.");
    if (snapshot.providerThreadId !== call.threadId || snapshot.providerTurnId !== call.turnId) fail("AI_MODEL_DELIVERY_HANDLE_SCOPE_MISMATCH", "Model Delivery Handle scope does not match this Context/Thread/Turn.");
    if (Date.now() > Date.parse(snapshot.expiresAtUtc)) fail("AI_MODEL_DELIVERY_HANDLE_EXPIRED", "Model Delivery Handle expired.");
    return { handleHash: snapshot.deliveryHandle.handleHash, handlePrefix: snapshot.deliveryHandle.handlePrefix, completedAtUtc: completed, operation };
  }

  completeDeliveryHandle(handle: unknown, call: { threadId: string; turnId: string }) {
    if (this.legacy.snapshot().deliveryHandle?.completedAtUtc) return this.validateDeliveryHandle(handle, call, "finalize");
    return this.legacy.completeDeliveryHandle(handle, call);
  }
}
