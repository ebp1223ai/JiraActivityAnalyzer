import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PROVIDER_DISPATCH_LEDGER_SCHEMA = "jaa-provider-dispatch-ledger-v1" as const;
export type ProviderDispatchStateV0330 = "prepared" | "dispatch_attempted" | "provider_contacted" | "thread_created" | "turn_start_attempted" | "turn_accepted" | "turn_completed" | "failed";
const order: ProviderDispatchStateV0330[] = ["prepared", "dispatch_attempted", "provider_contacted", "thread_created", "turn_start_attempted", "turn_accepted", "turn_completed", "failed"];
const timestampKeys: Partial<Record<ProviderDispatchStateV0330, string>> = { prepared: "providerRequestPreparedAt", dispatch_attempted: "providerDispatchAttemptedAt", provider_contacted: "providerContactedAt", thread_created: "threadCreatedAt", turn_start_attempted: "turnStartAttemptedAt", turn_accepted: "turnAcceptedAt", turn_completed: "turnCompletedAt" };
const countKeys: Partial<Record<ProviderDispatchStateV0330, string>> = { prepared: "providerDispatchPreparationCount", dispatch_attempted: "providerDispatchAttemptCount", provider_contacted: "providerContactCount", thread_created: "threadCreatedCount", turn_start_attempted: "turnStartAttemptCount", turn_accepted: "acceptedTurnCount", turn_completed: "turnCompletedCount" };

export type ProviderDispatchProjectionV0330 = Record<string, unknown> & { schemaVersion: typeof PROVIDER_DISPATCH_LEDGER_SCHEMA; lastState: ProviderDispatchStateV0330 | null; terminalHash: string | null };

export class ProviderDispatchLedgerV0330 {
  private sequence = 0;
  private previousHash: string | null = null;
  private lastState: ProviderDispatchStateV0330 | null = null;
  private seen = new Set<string>();
  private projectionValue: ProviderDispatchProjectionV0330 = {
    schemaVersion: PROVIDER_DISPATCH_LEDGER_SCHEMA, lastState: null, terminalHash: null,
    providerDispatchPreparationCount: 0, providerDispatchAttemptCount: 0, providerContactCount: 0,
    threadStartAttemptCount: 0, threadCreatedCount: 0, turnStartAttemptCount: 0, acceptedTurnCount: 0, turnCompletedCount: 0,
    providerRequestPreparedAt: null, providerDispatchAttemptedAt: null, providerContactedAt: null,
    threadCreatedAt: null, turnStartAttemptedAt: null, turnAcceptedAt: null, turnCompletedAt: null
  };
  constructor(readonly filePath: string) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
  append(state: ProviderDispatchStateV0330, metadata: Record<string, unknown> = {}) {
    const idempotencyKey = String(metadata.idempotencyKey ?? state);
    if (this.seen.has(idempotencyKey)) return this.projection;
    if (state !== "failed" && this.lastState && order.indexOf(state) < order.indexOf(this.lastState)) throw new Error("PROVIDER_DISPATCH_STATE_REGRESSION");
    const at = String(metadata.at ?? new Date().toISOString());
    const base = { schemaVersion: PROVIDER_DISPATCH_LEDGER_SCHEMA, sequence: ++this.sequence, state, atUtc: at, previousHash: this.previousHash, metadata: { ...metadata, idempotencyKey } };
    const eventHash = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    fs.appendFileSync(this.filePath, JSON.stringify({ ...base, eventHash }) + "\n", "utf8");
    this.previousHash = eventHash; this.lastState = state; this.seen.add(idempotencyKey);
    const countKey = countKeys[state]; const timestampKey = timestampKeys[state];
    if (countKey) this.projectionValue[countKey] = Number(this.projectionValue[countKey] ?? 0) + 1;
    if (state === "dispatch_attempted") this.projectionValue.threadStartAttemptCount = Number(this.projectionValue.threadStartAttemptCount ?? 0) + 1;
    if (timestampKey && this.projectionValue[timestampKey] === null) this.projectionValue[timestampKey] = at;
    this.projectionValue = { ...this.projectionValue, lastState: state, terminalHash: eventHash, ...(state === "failed" ? { rootErrorCode: metadata.rootErrorCode ?? "UNKNOWN", lastSuccessfulState: metadata.lastSuccessfulState ?? this.lastState } : {}) };
    return this.projection;
  }
  get projection() { return structuredClone(this.projectionValue); }
}
