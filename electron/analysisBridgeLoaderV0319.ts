import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ANALYSIS_BRIDGE_VERSION, type AnalysisBridgeToolContext, type AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";
import type { AiAnalysisRequestPackage } from "../shared/aiAnalysisContract.js";
import type { AiInstructionMode } from "../shared/analysisInstructionContract.js";

type BridgeInstance = {
  version: string;
  transport: "codex_dynamic_tools_stdio";
  toolSpecs(): unknown[];
  preflight(): Record<string, unknown>;
  readonly toolRegistrationId: string;
  handle(tool: string, args: unknown, context: AnalysisBridgeToolContext): Promise<unknown>;
  bindProviderThread(threadId: string): void;
  bindProviderTurn(threadId: string, turnId: string): void;
  markDerivedError(code: string, message: string, stage: import("../shared/analysisBridgeContract.js").AnalysisLifecycleStage): void;
  terminate(): void;
  setProviderTurnStatus(status: AnalysisLifecycleSummary["providerTurnStatus"]): void;
  setHtmlRenderStatus(status: AnalysisLifecycleSummary["htmlRenderStatus"]): void;
  setSqliteStatus(status: AnalysisLifecycleSummary["sqliteStatus"], errorCode?: string): void;
  setPostBridgeStage(stage: "VALIDATION_COMPLETED" | "CANONICAL_ASSEMBLY_COMPLETED" | "RUN_COMPLETED", status: "completed" | "failed"): void;
  fail(stage: import("../shared/analysisBridgeContract.js").AnalysisLifecycleStage, code: string, message?: string): void;
  snapshot(): { inputReceipt: Record<string, unknown> | null; sourceInputReceipt?: Record<string, unknown> | null; modelDeliveryReceipt?: Record<string, unknown> | null; modelDeliveryFailure?: Record<string, unknown> | null; artifactReceipt: Record<string, unknown> | null; lifecycle: AnalysisLifecycleSummary; bridgeExecutionContext?: Record<string, unknown>; rootError?: Record<string, unknown> | null; derivedErrors?: Array<Record<string, unknown>> };
};

type BridgeManifest = { schemaVersion: string; version: string; relativePath: string; sha256: string; transport: string; localOnly: boolean; externalFallback: boolean; modelInputTransport?: string };
const requireLocal = createRequire(__filename);

export function loadAnalysisBridge(input: { runId: string; sessionNonce: string; runDirectory: string; requestPackage: AiAnalysisRequestPackage; rulesSnapshotId: string; catalogSkillIds: string[]; instructionMode?: AiInstructionMode; analysisAttemptId?: string; requestId?: string; provider?: string; model?: string; manifestSha256?: string; commonRulesSha256?: string; catalogSha256?: string; outputSchemaSha256?: string; quoteCatalog?: unknown; evidenceSegments?: unknown[] }) {
  const bundlePath = path.join(__dirname, "analysis-bridge-v0327.cjs");
  const manifestPath = path.join(__dirname, "analysis-bridge-manifest.json");
  if (!fs.existsSync(bundlePath) || !fs.existsSync(manifestPath)) throw new Error("AI_BRIDGE_UNAVAILABLE:Bundled Analysis Bridge is missing.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BridgeManifest;
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(bundlePath)).digest("hex");
  if (manifest.version !== ANALYSIS_BRIDGE_VERSION || manifest.relativePath !== "analysis-bridge-v0327.cjs" || manifest.sha256 !== actualHash || manifest.transport !== "codex_dynamic_tools_stdio" || manifest.localOnly !== true || manifest.externalFallback !== false || manifest.modelInputTransport !== "bridge-resumable-v3") throw new Error("AI_BRIDGE_INTEGRITY_MISMATCH:Bundled Analysis Bridge manifest or SHA-256 mismatch.");
  const runtime = requireLocal(bundlePath) as { createAnalysisBridge?: (config: unknown) => BridgeInstance };
  if (typeof runtime.createAnalysisBridge !== "function") throw new Error("AI_BRIDGE_CONTRACT_MISMATCH:Bridge factory is unavailable.");
  const bridge = runtime.createAnalysisBridge(input);
  if (bridge.version !== ANALYSIS_BRIDGE_VERSION || bridge.transport !== "codex_dynamic_tools_stdio" || typeof bridge.handle !== "function" || typeof bridge.preflight !== "function" || typeof bridge.bindProviderThread !== "function" || typeof bridge.bindProviderTurn !== "function") throw new Error("AI_BRIDGE_CONTRACT_MISMATCH:Bridge runtime contract mismatch.");
  return { bridge, manifest, bundlePath, manifestPath, sha256: actualHash };
}

export type LoadedAnalysisBridge = ReturnType<typeof loadAnalysisBridge>;
