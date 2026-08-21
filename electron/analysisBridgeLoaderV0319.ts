import { app } from "electron";
import { ANALYSIS_BRIDGE_VERSION, type AnalysisBridgeToolContext, type AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";
import type { AiAnalysisRequestPackage } from "../shared/aiAnalysisContract.js";
import type { AiInstructionMode } from "../shared/analysisInstructionContract.js";
import { resolveAnalysisBridgeArtifactV0331, type BridgePreflightReceiptV0331 } from "./analysisBridgeResolverV0331.js";

type BridgeInstance = {
  version: string;
  transport: "codex_dynamic_tools_stdio";
  toolSpecs(): unknown[];
  preflight(): Record<string, unknown>;
  readonly toolRegistrationId: string;
  handle(tool: string, args: unknown, context: AnalysisBridgeToolContext): Promise<unknown>;
  serializeToolResponse(tool: string, result: unknown): { contentItems: Array<{ type: string; text: string }>; success: true };
  bindProviderThread(threadId: string): void;
  bindProviderTurn(threadId: string, turnId: string): void;
  markDerivedError(code: string, message: string, stage: import("../shared/analysisBridgeContract.js").AnalysisLifecycleStage): void;
  terminate(): void;
  setProviderTurnStatus(status: AnalysisLifecycleSummary["providerTurnStatus"]): void;
  setHtmlRenderStatus(status: AnalysisLifecycleSummary["htmlRenderStatus"]): void;
  setSqliteStatus(status: AnalysisLifecycleSummary["sqliteStatus"], errorCode?: string): void;
  setPostBridgeStage(stage: "VALIDATION_COMPLETED" | "CANONICAL_ASSEMBLY_COMPLETED" | "RUN_COMPLETED", status: "completed" | "failed"): void;
  fail(stage: import("../shared/analysisBridgeContract.js").AnalysisLifecycleStage, code: string, message?: string): void;
  snapshot(): { inputReceipt: Record<string, unknown> | null; sourceInputReceipt?: Record<string, unknown> | null; boundarySafetyReceipt?: Record<string, unknown> | null; modelDeliveryReceipt?: Record<string, unknown> | null; modelDeliveryFailure?: Record<string, unknown> | null; artifactReceipt: Record<string, unknown> | null; lifecycle: AnalysisLifecycleSummary; bridgeExecutionContext?: Record<string, unknown>; rootError?: Record<string, unknown> | null; derivedErrors?: Array<Record<string, unknown>>; runtimeContract?: Record<string, unknown>; providerDispatchGate?: Record<string, unknown> | null };
};

type BridgeInput = { runId: string; sessionNonce: string; runDirectory: string; requestPackage: AiAnalysisRequestPackage; rulesSnapshotId: string; catalogSkillIds: string[]; instructionMode?: AiInstructionMode; analysisAttemptId?: string; requestId?: string; provider?: string; model?: string; manifestSha256?: string; commonRulesSha256?: string; catalogSha256?: string; outputSchemaSha256?: string; quoteCatalog?: unknown; evidenceSegments?: unknown[] };

export function preflightAnalysisBridgeV0331(phase: BridgePreflightReceiptV0331["phase"], attemptId?: string | null) {
  return resolveAnalysisBridgeArtifactV0331({ appIsPackaged: app.isPackaged, processResourcesPath: process.resourcesPath, developmentResourcesPath: __dirname, phase, attemptId });
}

export function loadAnalysisBridge(input: BridgeInput) {
  const resolution = preflightAnalysisBridgeV0331("analysis_start", input.analysisAttemptId);
  if (resolution.receipt.status !== "ready" || !resolution.runtime || !resolution.manifest) {
    const code = resolution.receipt.rootErrorCode ?? "AI_BRIDGE_LOADABILITY_FAILED";
    throw Object.assign(new Error(`${code}:${resolution.receipt.rootErrorMessage ?? "Analysis Bridge preflight failed."}`), { code, bridgePreflightReceipt: resolution.receipt });
  }
  const runtime = resolution.runtime as { createAnalysisBridge?: (config: unknown) => BridgeInstance };
  const bridge = runtime.createAnalysisBridge!(input);
  if (bridge.version !== ANALYSIS_BRIDGE_VERSION || bridge.transport !== "codex_dynamic_tools_stdio" || typeof bridge.handle !== "function" || typeof bridge.serializeToolResponse !== "function" || typeof bridge.preflight !== "function" || typeof bridge.bindProviderThread !== "function" || typeof bridge.bindProviderTurn !== "function") throw Object.assign(new Error("AI_BRIDGE_CONTRACT_MISMATCH:Bridge runtime contract mismatch."), { code: "AI_BRIDGE_CONTRACT_MISMATCH", bridgePreflightReceipt: resolution.receipt });
  return {
    bridge,
    manifest: { ...resolution.manifest, version: resolution.manifest.bridgeIdentity, transport: "codex_dynamic_tools_stdio" as const },
    packagedManifest: resolution.manifest,
    bundlePath: resolution.artifactPath,
    manifestPath: resolution.manifestPath,
    sha256: resolution.receipt.observedSha256!,
    preflightReceipt: resolution.receipt
  };
}

export type LoadedAnalysisBridge = ReturnType<typeof loadAnalysisBridge>;