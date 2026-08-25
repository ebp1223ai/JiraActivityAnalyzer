import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { durableWriteJsonV0337, sha256BytesV0337 } from "./durableIoV0337.js";
import { resolveDurableArtifactTruthV0337, type ArtifactTruthPathsV0337 } from "./durableArtifactTruthResolverV0337.js";

export const TERMINAL_OUTCOME_REDUCER_VERSION_V0337 = "jaa-terminal-outcome-reducer-v1" as const;
export const TERMINAL_CONTRADICTION_GUARD_VERSION_V0337 = "jaa-terminal-contradiction-guard-v1" as const;
export type ProviderTerminalV0337 = "completed" | "failed" | "cancelled" | null;
export type PostArtifactTerminalV0337 = "SUCCEEDED" | "FAILED" | null;
export type TerminalActionV0337 = "RUN_POST_ARTIFACT" | "DEFER_POST_ARTIFACT" | "SUCCEEDED" | "FAILED_POST_ARTIFACT" | "FAILED_NO_ARTIFACT" | "FAILED_PROVIDER" | "CANCELLED" | "RECONCILIATION_REQUIRED" | "WAITING_FOR_FACTS";

export function reduceTerminalOutcomeV0337(input: { runDirectory: string; runId: string; providerTerminal: ProviderTerminalV0337; artifactPaths: ArtifactTruthPathsV0337; contentValidationFailed: boolean; postArtifactTerminalOutcome: PostArtifactTerminalV0337 }) {
  const resolver = resolveDurableArtifactTruthV0337(input.runId, input.artifactPaths);
  let action: TerminalActionV0337 = "WAITING_FOR_FACTS";
  if (resolver.status === "PERSISTED_VALID") action = input.postArtifactTerminalOutcome === "SUCCEEDED" ? "SUCCEEDED" : input.postArtifactTerminalOutcome === "FAILED" || input.contentValidationFailed ? "FAILED_POST_ARTIFACT" : "RUN_POST_ARTIFACT";
  else if (resolver.status === "CONTRADICTORY" || resolver.status === "CORRUPT") action = "RECONCILIATION_REQUIRED";
  else if (input.providerTerminal === "completed") action = "FAILED_NO_ARTIFACT";
  else if (input.providerTerminal === "failed") action = "FAILED_PROVIDER";
  else if (input.providerTerminal === "cancelled") action = "CANCELLED";
  else action = "DEFER_POST_ARTIFACT";
  const rootErrorCode = action === "FAILED_NO_ARTIFACT" ? "AI_ARTIFACT_SUBMISSION_MISSING" : action === "RECONCILIATION_REQUIRED" ? "AI_TERMINAL_FACT_RECONCILIATION_REQUIRED" : action === "FAILED_PROVIDER" ? "CHATGPT_TURN_FAILED" : action === "CANCELLED" ? "RUN_CANCELLED" : action === "FAILED_POST_ARTIFACT" ? "AI_POST_ARTIFACT_PIPELINE_FAILED" : null;
  if (rootErrorCode === "AI_ARTIFACT_SUBMISSION_MISSING" && resolver.status !== "NOT_FOUND") throw new Error("TERMINAL_CONTRADICTION_GUARD_BYPASSED");
  const decision = Object.freeze({ schemaVersion: TERMINAL_OUTCOME_REDUCER_VERSION_V0337, contradictionGuard: TERMINAL_CONTRADICTION_GUARD_VERSION_V0337, runId: input.runId, action, rootErrorCode, resolver, analysisStarted: resolver.status === "PERSISTED_VALID", analysisCompleted: resolver.status === "PERSISTED_VALID", analysisTelemetry: resolver.status === "PERSISTED_VALID" ? "COMPLETED_BY_ARTIFACT" as const : "NOT_REPORTED" as const, providerWarning: resolver.status === "PERSISTED_VALID" && input.providerTerminal && input.providerTerminal !== "completed" ? `PROVIDER_${input.providerTerminal.toUpperCase()}_AFTER_ARTIFACT` : null, decidedAtUtc: new Date().toISOString() });
  const factsHash = sha256BytesV0337(JSON.stringify({ providerTerminal: input.providerTerminal, contentValidationFailed: input.contentValidationFailed, postArtifactTerminalOutcome: input.postArtifactTerminalOutcome, resolver }));
  durableWriteJsonV0337(path.join(input.runDirectory, "progress", "terminal-decision-receipt.json"), { schemaVersion: "jaa-terminal-decision-receipt-v1", reducerInputFactsHash: factsHash, resolverResult: resolver, matrixBranch: `${input.providerTerminal ?? "none"}:${resolver.status}`, action, rootErrorCode, terminal: ["SUCCEEDED", "FAILED_POST_ARTIFACT", "FAILED_NO_ARTIFACT", "FAILED_PROVIDER", "CANCELLED"].includes(action), decision });
  return decision;
}

export function appendTerminalEventV0337(runDirectory: string, runId: string, decision: ReturnType<typeof reduceTerminalOutcomeV0337>) {
  if (!["SUCCEEDED", "FAILED_POST_ARTIFACT", "FAILED_NO_ARTIFACT", "FAILED_PROVIDER", "CANCELLED"].includes(decision.action)) return null;
  const terminalPath = path.join(runDirectory, "progress", "run-terminal.json");
  if (fs.existsSync(terminalPath)) return JSON.parse(fs.readFileSync(terminalPath, "utf8"));
  const terminal = { schemaVersion: "jaa-run-terminal-event-v1", runId, terminalOutcome: decision.action, rootErrorCode: decision.rootErrorCode, decisionSha256: sha256BytesV0337(JSON.stringify(decision)), idempotencyKey: crypto.createHash("sha256").update(`${runId}:${decision.action}`).digest("hex"), atUtc: new Date().toISOString() };
  durableWriteJsonV0337(terminalPath, terminal); return terminal;
}
