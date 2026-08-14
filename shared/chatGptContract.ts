export const CODEX_RUNTIME_VERSION = "0.147.0" as const;

export type ChatGptTokenBucket = { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null };
export type ChatGptTokenTelemetry = {
  availability: "actual" | "actual_zero_no_model_dispatch" | "unavailable";
  turnCumulative: ChatGptTokenBucket;
  lastModelCall: ChatGptTokenBucket;
  modelContextWindow: number | null;
  maxObservedSingleCallTokens: number | null;
  maxObservedContextUtilizationPercent: number | null;
  usageEventCount: number;
  anomalies: Array<{ code: "TOKEN_CUMULATIVE_ROLLBACK"; previousTotal: number; observedTotal: number; eventIndex: number }>;
};

export type ActiveAiProvider = "chatgpt_codex" | "ai_nexus" | "offline_rule";

export type ChatGptRuntimeState =
  | "stopped"
  | "starting"
  | "signed_out"
  | "login_pending"
  | "connected"
  | "usage_limited"
  | "runtime_error"
  | "stopping";

export type ChatGptModel = {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: string | null;
  contextWindow: number | null;
  contextWindowSource?: "provider_model_metadata" | "unavailable";
  contextWindowRawSanitized?: unknown;
};

export type ChatGptCapacityResult = {
  providerId: string; providerDisplayName: string; modelId: string; modelDisplayName: string;
  capacitySource: "app_server_capability" | "provider_model_metadata" | "official_model_reference_only" | "unavailable";
  capacitySourceStatus: string; capacityTokens: number | null; capacityRawResponseSanitized: unknown;
};

export type ChatGptRateLimitWindow = {
  usedPercent: number | null;
  windowDurationMinutes: number | null;
  resetsAt: string | null;
};

export type ChatGptStatus = {
  state: ChatGptRuntimeState;
  runtimeVersion: typeof CODEX_RUNTIME_VERSION;
  runtimeFound: boolean;
  runtimeSha256: string | null;
  runtimeSource: "bundled";
  runtimeIntegrity: "unverified" | "verified" | "failed";
  accountEmailMasked: string | null;
  planType: string | null;
  authMode: "chatgpt" | null;
  models: ChatGptModel[];
  selectedModel: string | null;
  primaryRateLimit: ChatGptRateLimitWindow | null;
  secondaryRateLimit: ChatGptRateLimitWindow | null;
  lastRefreshAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type ChatGptRunEvent =
  | { type: "preflight_completed"; runId: string; at: string; evidence: { writeProbe: unknown; policyComparison: unknown; effectivePermissions: unknown } }
  | { type: "thread_starting"; runId: string; at: string }
  | { type: "thread_created"; runId: string; at: string; threadId: string }
  | { type: "turn_starting"; runId: string; at: string; threadId: string }
  | { type: "turn_started"; runId: string; at: string; threadId: string; turnId: string }
  | { type: "provider_turn_completed"; runId: string; at: string; threadId: string; turnId: string; tokenTelemetry: ChatGptTokenTelemetry }
  | { type: "started"; runId: string; at: string }
  | { type: "delta"; runId: string; text: string }
  | { type: "usage"; runId: string; inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null; tokenTelemetry: ChatGptTokenTelemetry }
  | { type: "completed"; runId: string; text: string; elapsedMs: number }
  | { type: "cancelled"; runId: string }
  | { type: "failed"; runId: string; errorCode: string; message: string; outcomeUnknown: boolean; visibleText: string; usage: ChatGptAnalysisResponse["usage"] }
  | { type: "bridge_tool"; runId: string; tool: string; callId: string; success: boolean; result: unknown }
  | { type: "provider_event"; runId: string; method: string; params: unknown };

export type ChatGptAnalysisRequest = {
  runId?: string;
  requestPurpose?: "FORMAL_ANALYSIS" | "CUSTOM_DIAGNOSTIC" | "MANUAL_CHAT";
  instructionMode?: import("./analysisInstructionContract.js").AiInstructionMode;
  prompt: string;
  model?: string | null;
  outputSchema?: Record<string, unknown> | null;
  outputSchemaSha256?: string | null;
  deliveryMode?: "LOCAL_FILE_WORKSPACE";
  workspacePath?: string;
  outputWorkspacePath?: string;
  runDirectory?: string;
  allowedReadRoots?: string[];
  finalProviderPayloadSha256?: string | null;
  requestPackage?: import("./aiAnalysisContract.js").AiAnalysisRequestPackage;
  rulesSnapshotId?: string;
  catalogSkillIds?: string[];
};
export type ChatGptAnalysisResponse = {
  runId: string;
  text: string;
  model: string;
  runtimeVersion: typeof CODEX_RUNTIME_VERSION;
  elapsedMs: number;
  requestId: string | null;
  threadId: string;
  turnId: string;
  usage: { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null };
  tokenTelemetry: ChatGptTokenTelemetry;
  sandboxEvidence?: { writeProbe: unknown; policyComparison: unknown; effectivePermissions: unknown };
  bridgeEvidence?: import("./analysisBridgeContract.js").AnalysisBridgeEvidence;
};
