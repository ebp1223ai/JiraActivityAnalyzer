import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const HOST_CONTROL_LIFECYCLE_VERSION_V0335 = "jaa-host-control-lifecycle-v2" as const;
export const ANALYSIS_TELEMETRY_VERSION_V0335 = "jaa-analysis-telemetry-v1" as const;

export type HostControlStateV0335 =
  | "ATTEMPT_CREATED" | "PROVIDER_DISPATCHED" | "INPUT_READING" | "INPUT_READY"
  | "ARTIFACT_RECEIVED" | "VALIDATING" | "CANONICAL_CREATED"
  | "ANALYZED_RESULT_PUBLISHED" | "ACTIVE_RESULT_COMMITTED"
  | "REPORT_PACKAGE_CREATED" | "HTML_RENDERED" | "SQLITE_GATE" | "TERMINAL";

export type AnalysisTelemetryStateV0335 =
  | "NOT_REPORTED" | "STARTED" | "IN_PROGRESS" | "COMPLETED" | "COMPLETED_BY_ARTIFACT";

type ProgressInput = {
  phase: "INPUT_READY" | "ANALYSIS_STARTED" | "ANALYSIS_COMPLETED" | "ARTIFACT_SUBMISSION_STARTED";
  expectedCount: number;
  completedCount: number;
  decisionPreparedCount: number;
  message: string;
};

type Transition = {
  sequence: number;
  stateBefore: HostControlStateV0335;
  stateAfter: HostControlStateV0335;
  reason: string;
  receiptId: string | null;
  timestampUtc: string;
  idempotencyKey: string;
};

const ORDER: HostControlStateV0335[] = [
  "ATTEMPT_CREATED", "PROVIDER_DISPATCHED", "INPUT_READING", "INPUT_READY",
  "ARTIFACT_RECEIVED", "VALIDATING", "CANONICAL_CREATED",
  "ANALYZED_RESULT_PUBLISHED", "ACTIVE_RESULT_COMMITTED", "REPORT_PACKAGE_CREATED",
  "HTML_RENDERED", "SQLITE_GATE", "TERMINAL"
];
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };

function durableJson(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = JSON.stringify(value, null, 2) + "\n";
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, target);
}

function appendJsonl(target: string, value: unknown) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const descriptor = fs.openSync(target, "a", 0o600);
  try { fs.writeSync(descriptor, JSON.stringify(value) + "\n"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export class HostControlLifecycleControllerV0335 {
  private state: HostControlStateV0335 = "ATTEMPT_CREATED";
  private telemetry: AnalysisTelemetryStateV0335 = "NOT_REPORTED";
  private sequence = 0;
  private finalized: { bindingHash: string; receiptId: string; receipt: Record<string, unknown> } | null = null;
  private lastProgress: ProgressInput | null = null;
  private readonly warnings: Array<Record<string, unknown>> = [];
  private readonly transitions: Transition[] = [];
  private terminal: { outcome: "SUCCEEDED" | "FAILED" | "CANCELLED"; errorCode: string | null; atUtc: string } | null = null;

  constructor(readonly runDirectory: string, private readonly hooks: { failFinalizePostcondition?: boolean } = {}) {
    this.persist();
  }

  transition(next: HostControlStateV0335, reason: string, receiptId: string | null = null, idempotencyKey = `${next}:${receiptId ?? reason}`) {
    if (this.state === "TERMINAL") return this.snapshot();
    if (this.state === next) return this.snapshot();
    if (ORDER.indexOf(next) < ORDER.indexOf(this.state)) fail("AI_LIFECYCLE_TRANSITION_INVALID", `${this.state} cannot transition to ${next}.`);
    const transition: Transition = { sequence: ++this.sequence, stateBefore: this.state, stateAfter: next, reason, receiptId, timestampUtc: new Date().toISOString(), idempotencyKey };
    this.state = next;
    this.transitions.push(transition);
    appendJsonl(path.join(this.runDirectory, "progress", "host-control-transitions.jsonl"), transition);
    this.persist();
    return this.snapshot();
  }

  providerDispatched() { return this.transition("PROVIDER_DISPATCHED", "Provider thread and turn bound."); }
  inputSegmentRead() { return this.transition("INPUT_READING", "First input segment read successfully."); }

  finalize(input: { bindingHash: string; receipt: Record<string, unknown> }) {
    if (this.finalized) {
      if (this.finalized.bindingHash !== input.bindingHash) fail("AI_MODEL_DELIVERY_FINALIZE_MISMATCH", "Repeated finalize does not match the immutable delivery binding.");
      return { ...this.finalized.receipt, lifecycleReceiptId: this.finalized.receiptId, idempotentReplay: true };
    }
    if (this.state !== "INPUT_READING") fail("AI_MODEL_INPUT_DELIVERY_INCOMPLETE", `Finalize requires INPUT_READING; observed=${this.state}.`);
    const receiptId = `delivery_${sha256(`${input.bindingHash}:${JSON.stringify(input.receipt)}`).slice(0, 24)}`;
    this.finalized = { bindingHash: input.bindingHash, receiptId, receipt: Object.freeze({ ...input.receipt }) };
    this.transition("INPUT_READY", "Delivery receipt durably finalized.", receiptId, `finalize:${input.bindingHash}`);
    if (this.hooks.failFinalizePostcondition) this.state = "INPUT_READING";
    if (this.state !== "INPUT_READY") fail("AI_LIFECYCLE_POSTCONDITION_FAILED", `Finalize postcondition expected INPUT_READY; observed=${this.state}.`);
    this.persist();
    return { ...input.receipt, lifecycleReceiptId: receiptId, idempotentReplay: false };
  }

  reportProgress(input: ProgressInput) {
    if (![input.expectedCount, input.completedCount, input.decisionPreparedCount].every(Number.isInteger)
      || input.expectedCount < 0 || input.completedCount < 0 || input.decisionPreparedCount < 0
      || input.completedCount > input.expectedCount || input.decisionPreparedCount > input.expectedCount) {
      fail("AI_ANALYSIS_PROGRESS_INVALID", "Progress counts are outside the expected Run scope.");
    }
    const duplicate = this.lastProgress?.phase === input.phase
      && this.lastProgress.completedCount === input.completedCount
      && this.lastProgress.decisionPreparedCount === input.decisionPreparedCount;
    if (duplicate) return { ...this.snapshot(), accepted: true, idempotentReplay: true, warning: null };
    let warning: Record<string, unknown> | null = null;
    if (this.state !== "INPUT_READY" && ORDER.indexOf(this.state) < ORDER.indexOf("ARTIFACT_RECEIVED")) {
      warning = { code: "AI_MODEL_INPUT_DELIVERY_INCOMPLETE", recoverable: true, message: "Progress telemetry arrived before INPUT_READY." };
    } else if (this.lastProgress && (input.completedCount < this.lastProgress.completedCount || input.decisionPreparedCount < this.lastProgress.decisionPreparedCount)) {
      warning = { code: "AI_ANALYSIS_PROGRESS_NON_MONOTONIC", recoverable: true, observed: input, previous: this.lastProgress };
    }
    if (warning) this.warnings.push({ ...warning, atUtc: new Date().toISOString() });
    this.lastProgress = { ...input };
    this.telemetry = input.phase === "ANALYSIS_COMPLETED" ? "COMPLETED"
      : input.phase === "ANALYSIS_STARTED" ? "STARTED" : "IN_PROGRESS";
    this.persist();
    return { ...this.snapshot(), accepted: true, idempotentReplay: false, warning };
  }

  acceptArtifact(receiptId: string, decisionCount: number) {
    if (this.state !== "INPUT_READY") fail("AI_ARTIFACT_CONTROL_STATE_INVALID", `Artifact requires INPUT_READY; observed=${this.state}.`);
    this.transition("ARTIFACT_RECEIVED", `Artifact durably persisted with ${decisionCount} decisions.`, receiptId, `artifact:${receiptId}`);
    this.telemetry = "COMPLETED_BY_ARTIFACT";
    this.persist();
    return this.transition("VALIDATING", "Artifact content validation started.", receiptId, `validation:${receiptId}`);
  }

  complete(outcome: "SUCCEEDED" | "FAILED" | "CANCELLED", errorCode: string | null = null) {
    if (this.terminal) return this.snapshot();
    this.terminal = { outcome, errorCode, atUtc: new Date().toISOString() };
    this.transition("TERMINAL", `Run terminal outcome=${outcome}.`, null, `terminal:${outcome}:${errorCode ?? "none"}`);
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      schemaVersion: HOST_CONTROL_LIFECYCLE_VERSION_V0335,
      controllerKey: sha256(path.resolve(this.runDirectory)).slice(0, 24),
      state: this.state,
      sequence: this.sequence,
      finalized: this.finalized ? { bindingHash: this.finalized.bindingHash, receiptId: this.finalized.receiptId } : null,
      analysisTelemetry: { schemaVersion: ANALYSIS_TELEMETRY_VERSION_V0335, state: this.telemetry, lastProgress: this.lastProgress, warnings: [...this.warnings] },
      transitionCount: this.transitions.length,
      terminal: this.terminal
    });
  }

  private persist() {
    const snapshot = this.snapshot();
    durableJson(path.join(this.runDirectory, "progress", "host-control-lifecycle.json"), snapshot);
    durableJson(path.join(this.runDirectory, "debug", "host-control-lifecycle.json"), snapshot);
  }
}

const controllers = new Map<string, HostControlLifecycleControllerV0335>();

export function getHostControlLifecycleControllerV0335(runDirectory: string, hooks: { failFinalizePostcondition?: boolean } = {}) {
  const key = path.resolve(runDirectory).toLowerCase();
  const existing = controllers.get(key);
  if (existing) return existing;
  const controller = new HostControlLifecycleControllerV0335(runDirectory, hooks);
  controllers.set(key, controller);
  return controller;
}

export function releaseHostControlLifecycleControllerV0335(runDirectory: string) {
  controllers.delete(path.resolve(runDirectory).toLowerCase());
}
