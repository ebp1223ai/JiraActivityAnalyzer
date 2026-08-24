import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROVIDER_LIFECYCLE_VERSION_V0334 = "jaa-provider-lifecycle-v1" as const;

export type ProviderLifecycleStateV0334 =
  | "ATTEMPT_CREATED" | "PROVIDER_DISPATCHED" | "INPUT_READING"
  | "INPUT_DELIVERY_FINALIZED" | "INPUT_READY" | "ANALYSIS_STARTED"
  | "ANALYSIS_IN_PROGRESS" | "ARTIFACT_RECEIVED" | "VALIDATION_COMPLETED"
  | "CANONICAL_CREATED" | "ANALYZED_RESULT_PUBLISHED" | "ACTIVE_RESULT_COMMITTED"
  | "REPORT_PACKAGE_CREATED" | "HTML_RENDERED" | "SQLITE_GATE" | "TERMINAL";

type ProgressPhase = "INPUT_READY" | "ANALYSIS_STARTED" | "ANALYSIS_COMPLETED" | "ARTIFACT_SUBMISSION_STARTED";
type ProgressInput = { phase: ProgressPhase; expectedCount: number; completedCount: number; decisionPreparedCount: number; message: string };
type FinalizeInput = { bindingHash: string; receipt: Record<string, unknown> };

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };

function durableJson(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = JSON.stringify(value, null, 2) + "\n";
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(fd, body, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, target);
}

export class ProviderLifecycleV0334 {
  private state: ProviderLifecycleStateV0334 = "ATTEMPT_CREATED";
  private finalized: { bindingHash: string; receiptId: string; receipt: Record<string, unknown> } | null = null;
  private lastProgress: ProgressInput | null = null;
  private readonly warnings: Array<Record<string, unknown>> = [];
  private terminal: { outcome: "SUCCEEDED" | "FAILED" | "CANCELLED"; errorCode: string | null; atUtc: string } | null = null;

  constructor(private readonly runDirectory: string) { this.persist("CREATED", null); }

  transition(next: ProviderLifecycleStateV0334, evidence: Record<string, unknown> | null = null) {
    if (this.state === "TERMINAL") return this.snapshot();
    this.state = next;
    this.persist("TRANSITION", evidence);
    return this.snapshot();
  }

  finalize(input: FinalizeInput) {
    if (this.finalized) {
      if (this.finalized.bindingHash !== input.bindingHash) fail("AI_MODEL_DELIVERY_FINALIZE_MISMATCH", "Repeated finalize does not match the original delivery binding.");
      this.persist("FINALIZE_IDEMPOTENT_REPLAY", { receiptId: this.finalized.receiptId });
      return { ...this.finalized.receipt, lifecycleReceiptId: this.finalized.receiptId, idempotentReplay: true };
    }
    const receiptId = `delivery_${sha256(`${input.bindingHash}:${JSON.stringify(input.receipt)}`).slice(0, 24)}`;
    this.finalized = { bindingHash: input.bindingHash, receiptId, receipt: Object.freeze({ ...input.receipt }) };
    this.transition("INPUT_DELIVERY_FINALIZED", { receiptId });
    this.transition("INPUT_READY", { receiptId, atomicFinalize: true });
    return { ...input.receipt, lifecycleReceiptId: receiptId, idempotentReplay: false };
  }

  reportProgress(input: ProgressInput) {
    if (!this.finalized || !["INPUT_READY", "ANALYSIS_STARTED", "ANALYSIS_IN_PROGRESS", "ARTIFACT_RECEIVED"].includes(this.state)) fail("AI_MODEL_INPUT_DELIVERY_INCOMPLETE", "INPUT_READY is required before analysis progress.");
    if (![input.expectedCount, input.completedCount, input.decisionPreparedCount].every(Number.isInteger) || input.expectedCount < 0 || input.completedCount < 0 || input.decisionPreparedCount < 0 || input.completedCount > input.expectedCount || input.decisionPreparedCount > input.expectedCount) fail("AI_ANALYSIS_PROGRESS_INVALID", "Progress counts are outside the expected run scope.");
    const duplicate = this.lastProgress?.phase === input.phase && this.lastProgress.completedCount === input.completedCount && this.lastProgress.decisionPreparedCount === input.decisionPreparedCount;
    if (duplicate) return { ...this.snapshot(), accepted: true, idempotentReplay: true, warning: null };
    let warning: Record<string, unknown> | null = null;
    if (this.lastProgress && (input.completedCount < this.lastProgress.completedCount || input.decisionPreparedCount < this.lastProgress.decisionPreparedCount)) {
      warning = { code: "AI_ANALYSIS_PROGRESS_NON_MONOTONIC", recoverable: true, observed: input, previous: this.lastProgress, atUtc: new Date().toISOString() };
      this.warnings.push(warning);
    }
    this.lastProgress = { ...input };
    if (input.phase === "ANALYSIS_STARTED") this.transition("ANALYSIS_STARTED", { completedCount: input.completedCount });
    else if (input.phase === "ANALYSIS_COMPLETED" || input.phase === "ARTIFACT_SUBMISSION_STARTED") this.transition("ANALYSIS_IN_PROGRESS", { phase: input.phase, completedCount: input.completedCount, decisionPreparedCount: input.decisionPreparedCount });
    else this.persist("PROGRESS", { phase: input.phase });
    return { ...this.snapshot(), accepted: true, idempotentReplay: false, warning };
  }

  complete(outcome: "SUCCEEDED" | "FAILED" | "CANCELLED", errorCode: string | null = null) {
    if (this.terminal) return this.snapshot();
    this.terminal = { outcome, errorCode, atUtc: new Date().toISOString() };
    this.state = "TERMINAL";
    this.persist("TERMINAL", this.terminal);
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      schemaVersion: PROVIDER_LIFECYCLE_VERSION_V0334,
      state: this.state,
      finalized: this.finalized ? { bindingHash: this.finalized.bindingHash, receiptId: this.finalized.receiptId } : null,
      lastProgress: this.lastProgress,
      warnings: [...this.warnings],
      terminal: this.terminal
    });
  }

  private persist(event: string, evidence: Record<string, unknown> | null) {
    durableJson(path.join(this.runDirectory, "progress", "provider-lifecycle.json"), { ...this.snapshot(), lastEvent: event, evidence, updatedAtUtc: new Date().toISOString() });
  }
}
