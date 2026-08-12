export const CODEX_RUNTIME_VERSION = "0.147.0" as const;

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
  | { type: "started"; runId: string; at: string }
  | { type: "delta"; runId: string; text: string }
  | { type: "usage"; runId: string; inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null }
  | { type: "completed"; runId: string; text: string; elapsedMs: number }
  | { type: "cancelled"; runId: string }
  | { type: "failed"; runId: string; errorCode: string; message: string; outcomeUnknown: boolean; visibleText: string; usage: ChatGptAnalysisResponse["usage"] };

export type ChatGptAnalysisRequest = {
  runId?: string;
  prompt: string;
  model?: string | null;
  outputSchema?: Record<string, unknown> | null;
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
};
