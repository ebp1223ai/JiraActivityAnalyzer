import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { CapacityCalculationSnapshot, CapacityWarningCode } from "../shared/aiAnalysisContract.js";
import { assertAppPath, ensureDir, getExportsDir } from "./appPaths.js";

export type CapacitySourceInput = {
  providerId: string;
  providerDisplayName: string;
  modelId: string;
  modelDisplayName: string;
  source: CapacityCalculationSnapshot["capacitySource"];
  status: string;
  tokens: number | null;
  rawSanitized: unknown;
};

const estimate = (bytes: number) => Math.ceil(bytes / 3);

export function buildCapacityCalculationSnapshot(input: {
  capacity: CapacitySourceInput;
  rulesBytesUtf8: number;
  pendingPayloadBytesUtf8: number;
  wrapperInstructionsBytesUtf8: number;
  finalSerializedPromptBytesUtf8: number;
  recordCount: number;
  configuredMaxOutputTokens?: number | null;
}): CapacityCalculationSnapshot {
  const visible = Math.max(input.configuredMaxOutputTokens ?? 0, 8192, input.recordCount * 640);
  const finalInput = estimate(input.finalSerializedPromptBytesUtf8);
  const safety = Math.max(4096, Math.ceil((input.capacity.tokens ?? finalInput) * 0.08));
  const reserve = visible + safety;
  const required = finalInput + reserve;
  return {
    providerId: input.capacity.providerId, providerDisplayName: input.capacity.providerDisplayName,
    modelId: input.capacity.modelId, modelDisplayName: input.capacity.modelDisplayName,
    capacitySource: input.capacity.source, capacitySourceStatus: input.capacity.status,
    capacityTokens: input.capacity.tokens, capacityRawResponseSanitized: input.capacity.rawSanitized,
    estimatorName: "utf8-bytes-ratio", estimatorVersion: "1.0", estimatorMethod: "ceil(UTF-8 bytes / 3)",
    estimatorFallbackUsed: true, roundingRule: "ceil",
    rulesBytesUtf8: input.rulesBytesUtf8, pendingPayloadBytesUtf8: input.pendingPayloadBytesUtf8,
    wrapperInstructionsBytesUtf8: input.wrapperInstructionsBytesUtf8,
    finalSerializedPromptBytesUtf8: input.finalSerializedPromptBytesUtf8,
    estimatedRulesTokens: estimate(input.rulesBytesUtf8),
    estimatedPendingPayloadTokens: estimate(input.pendingPayloadBytesUtf8),
    estimatedWrapperTokens: estimate(input.wrapperInstructionsBytesUtf8),
    estimatedFinalInputTokens: finalInput,
    outputReserveBaseTokens: 8192, outputReservePerRecordTokens: 640, recordCount: input.recordCount,
    estimatedVisibleOutputReserveTokens: visible, reasoningReserveTokens: 0,
    safetyMarginTokens: safety, otherReserveTokens: 0,
    estimatedOutputAndReasoningReserveTokens: reserve,
    estimatedRequiredTotalTokens: required,
    remainingAfterInputTokens: input.capacity.tokens === null ? null : input.capacity.tokens - finalInput,
    estimatedMarginTokens: input.capacity.tokens === null || required === null ? null : input.capacity.tokens - required,
    estimatedOverageTokens: input.capacity.tokens === null || required === null ? null : Math.max(0, required - input.capacity.tokens),
    calculationTimestamp: new Date().toISOString()
  };
}

export function capacityWarning(snapshot: CapacityCalculationSnapshot): CapacityWarningCode | null {
  if (snapshot.capacityTokens === null) return "ANALYSIS_MODEL_CONTEXT_CAPACITY_UNAVAILABLE";
  if (snapshot.estimatedRequiredTotalTokens !== null && snapshot.estimatedRequiredTotalTokens > snapshot.capacityTokens) return "ANALYSIS_ESTIMATED_CONTEXT_EXCEEDS_LIMIT";
  return null;
}

export function capacitySnapshotHash(snapshot: CapacityCalculationSnapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function evaluateFormalPersistenceGate(input: {
  providerStatus: string; inputIds: string[]; outputIds: string[]; catalogInvalidSkillIds: string[];
  responseSaved: boolean; jsonValid: boolean;
}) {
  const missingStableIds = input.inputIds.filter((id) => !input.outputIds.includes(id));
  const duplicateStableIds = input.outputIds.filter((id, index) => input.outputIds.indexOf(id) !== index);
  const unexpectedStableIds = input.outputIds.filter((id) => !input.inputIds.includes(id));
  const passed = input.providerStatus === "completed" && input.responseSaved && input.jsonValid
    && missingStableIds.length === 0 && duplicateStableIds.length === 0 && unexpectedStableIds.length === 0
    && input.catalogInvalidSkillIds.length === 0 && input.inputIds.length === input.outputIds.length;
  return { passed, inputCount: input.inputIds.length, outputCount: input.outputIds.length, missingStableIds, duplicateStableIds, unexpectedStableIds, catalogInvalidSkillIds: [...input.catalogInvalidSkillIds], formalJsonAllowed: passed, goldenHtmlAllowed: passed, sqliteAllowed: passed };
}
export class AnalysisDispatchGuard {
  private readonly states = new Map<string, "ready" | "confirmed" | "dispatching" | "terminal">();
  register(runId: string, needsConfirmation: boolean) { if (!this.states.has(runId)) this.states.set(runId, needsConfirmation ? "ready" : "confirmed"); return this.states.get(runId)!; }
  confirm(runId: string) { if (this.states.get(runId) === "ready") this.states.set(runId, "confirmed"); return this.states.get(runId) ?? null; }
  begin(runId: string) { if (this.states.get(runId) !== "confirmed") return false; this.states.set(runId, "dispatching"); return true; }
  finish(runId: string) { if (this.states.has(runId)) this.states.set(runId, "terminal"); }
  state(runId: string) { return this.states.get(runId) ?? null; }
}

export type DedupedLogEntry = { key: string; runId: string; stage: string; errorCode: string; rootCauseHash: string; message: string; occurrenceCount: number; firstOccurredAt: string; lastOccurredAt: string };
export class AnalysisErrorDeduplicator {
  private readonly entries = new Map<string, DedupedLogEntry>();
  record(runId: string, stage: string, errorCode: string, message: string, at = new Date().toISOString()) {
    const normalizedRootCause = message.trim().replace(/\\s+/g, " ");
    const rootCauseHash = crypto.createHash("sha256").update(normalizedRootCause, "utf8").digest("hex");
    const key = `${runId}|${stage}|${errorCode}|${rootCauseHash}`;
    const existing = this.entries.get(key);
    if (existing) { existing.occurrenceCount += 1; existing.lastOccurredAt = at; return structuredClone(existing); }
    const entry = { key, runId, stage, errorCode, rootCauseHash, message: normalizedRootCause, occurrenceCount: 1, firstOccurredAt: at, lastOccurredAt: at };
    this.entries.set(key, entry); return structuredClone(entry);
  }
  list(runId?: string) { return [...this.entries.values()].filter((item) => !runId || item.runId === runId).map((item) => structuredClone(item)); }
}

function writeExclusive(filePath: string, data: string | Buffer) {
  const safe = assertAppPath(filePath);
  fs.writeFileSync(safe, data, { flag: "wx" });
  return safe;
}

export function createFailedStaging(runId: string) {
  if (!/^analysis_[a-f0-9-]+$/i.test(runId)) throw new Error("INVALID_ANALYSIS_RUN_ID");
  const parent = ensureDir(path.join(getExportsDir(), "ai-analysis", "failed-staging"));
  const folder = assertAppPath(path.join(parent, runId));
  fs.mkdirSync(folder, { recursive: false });
  return folder;
}

export function persistFailedRunEvidence(input: {
  folder: string; runManifest: unknown; failedManifest: unknown; capacitySnapshot?: CapacityCalculationSnapshot | null;
  providerDiagnostics?: unknown; requestSanitized?: unknown; responseSanitized?: unknown; visibleResponse?: string | null;
  validationResult: unknown; tokenUsage: unknown; executionTime: unknown; events: unknown[]; actions: string[];
}) {
  const files: string[] = [];
  const json = (name: string, value: unknown) => { files.push(writeExclusive(path.join(input.folder, name), JSON.stringify(value, null, 2))); };
  json("run-manifest.json", input.runManifest); json("failed-run-manifest.json", input.failedManifest);
  if (input.capacitySnapshot) json("capacity-snapshot.json", input.capacitySnapshot);
  if (input.providerDiagnostics !== undefined) json("provider-diagnostics.json", input.providerDiagnostics);
  if (input.requestSanitized !== undefined) json("request-sanitized.json", input.requestSanitized);
  if (input.responseSanitized !== undefined) json("response-sanitized.json", input.responseSanitized);
  if (input.visibleResponse !== null && input.visibleResponse !== undefined) {
    const raw = Buffer.from(input.visibleResponse, "utf8");
    files.push(writeExclusive(path.join(input.folder, "provider-visible-response.json.gz"), gzipSync(raw)));
    files.push(writeExclusive(path.join(input.folder, "provider-visible-response.sha256"), crypto.createHash("sha256").update(raw).digest("hex") + "\n"));
  }
  json("validation-result.json", input.validationResult); json("token-usage.json", input.tokenUsage); json("execution-time.json", input.executionTime);
  files.push(writeExclusive(path.join(input.folder, "event-log.jsonl"), input.events.map((item) => JSON.stringify(item)).join("\n") + "\n"));
  files.push(writeExclusive(path.join(input.folder, "user-action-log.txt"), input.actions.join("\n") + "\n"));
  return files;
}
