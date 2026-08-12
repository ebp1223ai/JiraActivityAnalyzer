export const AI_ANALYSIS_IPC_VERSION = 1 as const;
export const AI_ANALYSIS_DB_SCHEMA_VERSION = 1 as const;
export const AI_ANALYSIS_INPUT_SCHEMA_VERSION = "ai-analysis-input-v1" as const;
export const AI_ANALYSIS_OUTPUT_SCHEMA_VERSION = "ai-analysis-output-v2" as const;
export const AI_ANALYZED_FILE_SCHEMA_VERSION = "0.3.11-v1" as const;
export const AI_ANALYZED_LEGACY_FILE_SCHEMA_VERSIONS = ["0.3.9-v1"] as const;
export { type ActiveAiProvider, type ChatGptAnalysisRequest, type ChatGptAnalysisResponse, type ChatGptModel, type ChatGptRunEvent, type ChatGptRuntimeState, type ChatGptStatus } from "./chatGptContract.js";
import type { ActiveAiProvider, ChatGptStatus } from "./chatGptContract.js";

export type AiAnalysisErrorCode =
  | "ENV_NOT_FOUND"
  | "ENV_FORMAT_UNSUPPORTED"
  | "ENV_PARSE_ERROR"
  | "ENV_CONCURRENT_MODIFICATION"
  | "AI_NOT_CONFIGURED"
  | "AI_AUTH_FAILED"
  | "AI_ENDPOINT_UNREACHABLE"
  | "AI_TLS_ERROR"
  | "AI_MODEL_NOT_FOUND"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_RESPONSE_INVALID"
  | "CHATGPT_RUNTIME_UNAVAILABLE"
  | "CHATGPT_SIGN_IN_REQUIRED"
  | "CHATGPT_USAGE_LIMITED"
  | "OUTCOME_UNKNOWN"
  | "ANALYSIS_INPUT_INVALID"
  | "ANALYSIS_RULES_INVALID"
  | "ANALYSIS_RULES_DUPLICATE_SKILL_ID"
  | "INPUT_TOO_LARGE"
  | "ANALYSIS_INPUT_CONTEXT_TOO_LARGE"
  | "SOURCE_MISMATCH"
  | "RUN_CANCELLED"
  | "RUN_INTERRUPTED"
  | "PARTIAL_RESULT_FORBIDDEN"
  | "AI_DB_MIGRATION_FAILED"
  | "EXPORT_VALIDATION_FAILED";

export type AiServiceKey = "chatgpt" | "ai_nexus";
export type AiAnalyzerMode = "CHATGPT" | "AI_NEXUS" | "OFFLINE_RULE";
export type AiApiContract = "responses" | "chat_completions";
export type AiAuthType = "bearer" | "api_key";
export type AiAnalysisStatus = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED" | "NEEDS_REVIEW" | "UNKNOWN" | "EXCLUDED";
export type AiRunStatus = "queued" | "running" | "retrying" | "cancelling" | "cancelled" | "completed" | "partial" | "failed" | "interrupted";
export type AiRunStage = "idle" | "validating_source" | "validating_rules" | "building_payload" | "preflighting_capacity" | "starting_thread" | "starting_turn" | "waiting_response" | "receiving_response" | "validating_response" | "merging_evidence" | "writing_staging" | "validating_artifacts" | "committing_database" | "completed" | "cancelling" | "cancelled" | "failed";
export type AiClassificationStatus = "MATCHED" | "EXCLUDED" | "UNKNOWN";
export type AiReviewStatus = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED";
export type AiReviewAttention = "STANDARD_REVIEW" | "NEEDS_REVIEW";

export type AiTokenUsage = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  availability: "actual" | "partial" | "unavailable" | "not_applicable";
  estimatedInputTokens: number | null;
};

export type AiPublicSettings = {
  service: AiServiceKey;
  provider: string;
  endpoint: string;
  model: string;
  apiContract: AiApiContract;
  authType: AiAuthType;
  organization: string;
  project: string;
  contextWindow: number | null;
  timeoutMs: number;
  maxOutputTokens: number | null;
  maxRetries: number;
  secretConfigured: boolean;
  secretMask: string;
  configFingerprint: string;
  loadedAt: string | null;
  savedAt: string | null;
  testedFingerprint: string | null;
  connectionStatus: "not_configured" | "not_tested" | "running" | "passed" | "failed";
  lastErrorCode: AiAnalysisErrorCode | null;
};

export type AiSettingsUpdate = Omit<AiPublicSettings,
  "secretConfigured" | "secretMask" | "configFingerprint" | "loadedAt" | "savedAt" | "testedFingerprint" | "connectionStatus" | "lastErrorCode"
> & { secret?: string; preserveSecret: boolean; expectedEnvSha256: string; expectedEnvMtimeMs: number | null };

export type AiEnvSummary = {
  found: boolean;
  envPath: string;
  templatePath: string;
  formatVersion: string | null;
  supported: boolean;
  sha256: string;
  mtimeMs: number | null;
  loadedAt: string;
  errorCode: AiAnalysisErrorCode | null;
  message: string;
  aiNexus: AiPublicSettings;
  deprecatedOpenAiKeysIgnored: boolean;
  localDatabaseConfigured: boolean;
  aiDatabaseConfigured: boolean;
  rulesDirectoryConfigured: boolean;
};

export type AiDiagnosticStep = {
  id: "configuration" | "network" | "authentication" | "model" | "minimal_request" | "contract" | "persistence";
  name: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorCode: AiAnalysisErrorCode | null;
  message: string;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
};

export type AiConnectionResult = {
  ok: boolean;
  service: AiServiceKey;
  testedFingerprint: string;
  statusCode: number | null;
  requestId: string | null;
  elapsedMs: number;
  errorCode: AiAnalysisErrorCode | null;
  message: string;
  usage: AiTokenUsage;
  sanitizedResponse: Record<string, unknown>;
};

export type AiDiagnosticRun = {
  runId: string;
  service: AiServiceKey;
  status: "running" | "passed" | "failed";
  startedAt: string;
  completedAt: string | null;
  testedFingerprint: string;
  steps: AiDiagnosticStep[];
  folderPath: string | null;
  copySummary: string;
};

export type AiChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  service: AiServiceKey;
  provider: string;
  model: string;
  createdAt: string;
  elapsedMs: number | null;
  usage: AiTokenUsage;
  text: string;
  traceFolderPath?: string;
};

export type AiRulesFile = {
  kind: "manifest" | "catalog" | "rules";
  fileName: string;
  fullPath?: string;
  version: string;
  sha256: string;
  sizeBytes?: number;
  mtimeMs?: number;
  status: "verified" | "invalid";
};

export type AiRulesDuplicateDetail = {
  skillId: string;
  normalizedId: string;
  comparison: "exact" | "trimmed" | "unicode_normalized" | "case_insensitive";
  severity: "error" | "warning";
  definitions: Array<{
    fullPath: string;
    lineNumber: number;
    recordIndex: number;
    loadSource: "manifest_reference" | "manual_file";
  }>;
};

export type AiCatalogEntry = {
  id: string;
  name: string;
  group: string;
  catalogStatus: "review-draft" | "approved";
  detailDescription: string | null;
};

export type AiRulesSnapshot = {
  valid: boolean;
  rulesDirectoryLabel: string;
  rulesDirectoryPath?: string;
  snapshotId?: string;
  validatedAt?: string;
  ruleSetId: string;
  manifestSchemaVersion: string;
  catalogVersion: string;
  commonRulesVersion: string;
  classificationEngineVersion: "offline-rule-v1";
  parserVersion: "ai-rules-parser-v1";
  files: AiRulesFile[];
  catalogCount: number;
  uniqueSkillIdCount?: number;
  duplicateSkillIdCount?: number;
  duplicateDetails?: AiRulesDuplicateDetail[];
  catalog: AiCatalogEntry[];
  commonRulesNormalized: string[];
  errors: string[];
  warnings?: string[];
};

export type AiPendingDiff = {
  sourceDiffId: string;
  sourceContentHash: string;
  evidenceId: string;
  activityEventId: string;
  issueKey: string;
  projectKey: string;
  actorId: string;
  actorDisplayName: string;
  fieldId: string;
  fieldName: string;
  eventTime: string;
  sourceProvenance: string;
  diffStatus: string;
  substantive: boolean;
  addedLineCount: number;
  removedLineCount: number;
  diffHunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: Array<{ type: string; text: string }> }>;
};

export type AiPendingDataset = {
  datasetId: string;
  fileName: string;
  sourceFilePath?: string;
  sourceFileSizeBytes?: number;
  importedAt?: string;
  schemaVersion: string;
  sourceFileSha256: string;
  sourceDatabaseId: string;
  jiraServerFingerprint: string;
  jiraServerHost: string;
  sourceSchemaVersion: number;
  sourceView: string;
  createdAt: string;
  eventCount: number;
  eligibleCount: number;
  issues: number;
  projects: number;
  integrityStatus: "verified" | "invalid";
  errors: string[];
  diffs: AiPendingDiff[];
};

export type AiNegativeCheck = { ruleId: string; passed: boolean; detail: string; evidenceRefs: string[] };
export type AiRejectedNearSkill = { skillId: string; reason: string };

export type AiAnalysisCandidate = {
  skillId: string;
  skillName: string;
  group: string;
  score: number | null;
  confidence: number | null;
  confidenceLabel?: "High" | "Medium" | "Low";
  confidenceReason?: string;
  scoreComponents?: Record<string, number>;
  positiveSignals?: string[];
  positiveEvidenceRefs: string[];
  negativeChecks?: AiNegativeCheck[];
  negativeEvidenceRefs: string[];
  rejectedNearSkills?: AiRejectedNearSkill[];
  evidenceQuote?: string;
  matchedRuleIds: string[];
  reason: string;
  status: AiAnalysisStatus;
};

export type AiDiffAnalysisResult = {
  resultId: string;
  sourceDiffId: string;
  sourceContentHash: string;
  evidenceRefs: string[];
  recordIndex?: number;
  sourceRecordStableId?: string;
  activityEventId?: string;
  evidenceId?: string;
  classificationStatus?: AiClassificationStatus;
  reviewStatus?: AiReviewStatus;
  reviewAttention?: AiReviewAttention;
  dispositionReason?: string;
  exclusionReason?: string | null;
  unknownReason?: string | null;
  matchedRuleIds?: string[];
  negativeChecks?: AiNegativeCheck[];
  candidates: AiAnalysisCandidate[];
  status: AiAnalysisStatus;
  analyzerVersion: string;
  requestTraceId: string | null;
  usage: AiTokenUsage;
  rawResultAvailable: boolean;
  legacyCompatibilityWarning?: string | null;
  reviewNote: string;
  reviewedAt: string | null;
};

export type AiRunProgress = {
  runId: string;
  status: AiRunStatus;
  stage?: AiRunStage;
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  currentBatch: number;
  totalDiffs: number;
  completedDiffs: number;
  requestCount: number;
  retryCount: number;
  threadCount?: number;
  turnCount?: number;
  mainPayloadCount?: number;
  rulesTransmissionCount?: number;
  payloadRecordCount?: number;
  resultRecordCount?: number;
  elapsedMs: number;
  usage: AiTokenUsage;
  message: string;
  errorCode: AiAnalysisErrorCode | null;
};

export type AiAnalysisRun = {
  runId: string;
  revision: number;
  status: AiRunStatus;
  analyzerMode: AiAnalyzerMode;
  sourceDatasetId: string;
  sourceFileName: string;
  sourceFilePath?: string;
  sourceFileSha256: string;
  sourceDatabaseId: string;
  jiraServerFingerprint: string;
  selectedDiffIds: string[];
  provider: ActiveAiProvider;
  model: string;
  apiContract: AiApiContract | "offline";
  configFingerprint: string | null;
  rules: AiRulesSnapshot;
  startedAt: string;
  completedAt: string | null;
  progress: AiRunProgress;
  results: AiDiffAnalysisResult[];
  analyzedFileName: string;
  plannedAnalyzedFilePath?: string | null;
  analyzedFilePath: string | null;
  analyzedFileSizeBytes?: number | null;
  analyzedFileSha256?: string | null;
  databasePath: string | null;
  reportFilePath?: string | null;
  reportFileSizeBytes?: number | null;
  reportFileSha256?: string | null;
  compactPayloadPath?: string | null;
  compactPayloadSha256?: string | null;
  compactPayloadSizeBytes?: number | null;
  providerResponseGzipPath?: string | null;
  providerResponseSha256?: string | null;
  providerResponseGzipSha256?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  appVersion?: string | null;
  buildTime?: string | null;
  packagedSourceCommit?: string | null;
  providerRuntimeVersion?: string | null;
  promptTemplateVersion?: string | null;
  promptSha256?: string | null;
  capacityPreflight?: {
    inputEstimateTokens: number;
    modelCapacityTokens: number | null;
    reservedOutputTokens: number;
    safetyMarginTokens: number | null;
    requiredContextTokens: number | null;
  } | null;
  distributionDiagnostics?: {
    candidateCount: number;
    distinctSkillCount: number;
    groupFirstCandidateCount: number;
    suffix001CandidateCount: number;
    bySkill: Array<{ skillId: string; skillName: string; group: string; count: number }>;
    byGroup: Array<{ group: string; count: number }>;
  } | null;
  legacySchemaVersion?: string | null;
  importedFromFile?: boolean;
};

export type AiAnalysisSnapshot = {
  ipcVersion: typeof AI_ANALYSIS_IPC_VERSION;
  env: AiEnvSummary;
  rules: AiRulesSnapshot | null;
  pendingDatasets: AiPendingDataset[];
  selectedPendingDatasetId: string | null;
  runs: AiAnalysisRun[];
  selectedRunId: string | null;
  activeRunId: string | null;
  chatgpt: ChatGptStatus;
};

export type AiExportFormat = "json" | "csv" | "html";

export class AiAnalysisError extends Error {
  constructor(public readonly code: AiAnalysisErrorCode, message: string, public readonly retryable = false) {
    super(message);
    this.name = "AiAnalysisError";
  }
}

export function emptyTokenUsage(availability: AiTokenUsage["availability"] = "unavailable"): AiTokenUsage {
  return { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, availability, estimatedInputTokens: null };
}
