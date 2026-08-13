export const AI_ANALYSIS_IPC_VERSION = 1 as const;
export const AI_ANALYSIS_DB_SCHEMA_VERSION = 1 as const;
export const AI_ANALYSIS_INPUT_SCHEMA_VERSION = "ai-analysis-input-v1" as const;
export const AI_ANALYSIS_OUTPUT_SCHEMA_VERSION = "ai-analysis-output-v3" as const;
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
  | "AI_OUTPUT_SCHEMA_BUILD_FAILED"
  | "AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED"
  | "AI_OUTPUT_SCHEMA_PROVIDER_REJECTED"
  | "AI_PROVIDER_RESPONSE_INCOMPLETE"
  | "AI_PROVIDER_RESPONSE_EVIDENCE_MISMATCH"
  | "AI_PROVIDER_RESPONSE_INVALID_JSON"
  | "AI_PROVIDER_RESPONSE_SCHEMA_MISMATCH"
  | "AI_RESULT_IDENTITY_VALIDATION_FAILED"
  | "AI_RESULT_CATALOG_VALIDATION_FAILED"
  | "AI_RESPONSE_SEMANTIC_VALIDATION_FAILED"
  | "AI_REQUEST_PACKAGE_FAILED"
  | "AI_RUN_ARCHIVE_FAILED"
  | "AI_FORMAL_ARTIFACT_WRITE_FAILED"
  | "AI_SQLITE_TRANSACTION_FAILED"
  | "CHATGPT_RUNTIME_UNAVAILABLE"
  | "CHATGPT_SIGN_IN_REQUIRED"
  | "CHATGPT_USAGE_LIMITED"
  | "OUTCOME_UNKNOWN"
  | "ANALYSIS_INPUT_INVALID"
  | "ANALYSIS_RULES_INVALID"
  | "ANALYSIS_RULES_DUPLICATE_SKILL_ID"
  | "INPUT_TOO_LARGE"
  | "ANALYSIS_INPUT_CONTEXT_TOO_LARGE"
  | "ANALYSIS_MODEL_CONTEXT_CAPACITY_UNAVAILABLE"
  | "ANALYSIS_ESTIMATED_CONTEXT_EXCEEDS_LIMIT"
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
export type AiRunStage = "idle" | "validating_source" | "validating_rules" | "building_payload" | "building_output_schema" | "validating_output_schema" | "output_schema_ready" | "preflighting_capacity" | "waiting_capacity_confirmation" | "starting_thread" | "starting_turn" | "waiting_response" | "receiving_response" | "validating_response" | "validating_response_schema" | "validating_identity" | "validating_catalog" | "merging_evidence" | "writing_staging" | "writing_formal_artifacts" | "validating_artifacts" | "committing_database" | "completed" | "cancelling" | "cancelled" | "failed";
export type AiClassificationStatus = "MATCHED" | "EXCLUDED" | "UNKNOWN" | "CATALOG_DETAIL_MISSING" | "NEEDS_REVIEW";
export type AiCandidateClassificationStatus = Exclude<AiClassificationStatus, "UNKNOWN">;
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

export type CapacityWarningCode = "ANALYSIS_MODEL_CONTEXT_CAPACITY_UNAVAILABLE" | "ANALYSIS_ESTIMATED_CONTEXT_EXCEEDS_LIMIT";
export type CapacityCalculationSnapshot = {
  providerId: string; providerDisplayName: string; modelId: string; modelDisplayName: string;
  capacitySource: "app_server_capability" | "provider_model_metadata" | "official_model_reference_only" | "unavailable";
  capacitySourceStatus: string; capacityTokens: number | null; capacityRawResponseSanitized: unknown;
  estimatorName: string; estimatorVersion: string; estimatorMethod: string; estimatorFallbackUsed: boolean; roundingRule: string;
  rulesBytesUtf8: number; pendingPayloadBytesUtf8: number; wrapperInstructionsBytesUtf8: number; finalSerializedPromptBytesUtf8: number;
  estimatedRulesTokens: number; estimatedPendingPayloadTokens: number; estimatedWrapperTokens: number; estimatedFinalInputTokens: number;
  outputReserveBaseTokens: number; outputReservePerRecordTokens: number; recordCount: number; estimatedVisibleOutputReserveTokens: number;
  reasoningReserveTokens: number | null; safetyMarginTokens: number | null; otherReserveTokens: number | null;
  estimatedOutputAndReasoningReserveTokens: number | null; estimatedRequiredTotalTokens: number | null;
  remainingAfterInputTokens: number | null; estimatedMarginTokens: number | null; estimatedOverageTokens: number | null;
  calculationTimestamp: string;
};
export type CapacityConfirmation = {
  analysisRunId: string; warningCode: CapacityWarningCode; capacitySnapshotHash: string;
  confirmedAt: string | null; confirmationAction: "pending" | "confirmed" | "cancelled";
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
export type AiScoreComponent = { componentKey: string; score: number; explanation: string | null };
export type RequestDocumentRole = "PENDING_ANALYSIS_JSON" | "COMMON_RULES" | "SKILL_CATALOG" | "RULE_SET_MANIFEST_OR_SCORING_RULES" | "ANALYSIS_INSTRUCTION" | "OUTPUT_SCHEMA";
export type ProviderDeliveryMode = "NATIVE_FILE_INPUT" | "INLINE_EXACT_CONTENT";
export type RequestPackageDocument = { role: RequestDocumentRole; originalFileName: string; originalAbsolutePath: string | null; snapshotRelativePath: string; mimeType: string; encoding: "utf-8" | "binary"; originalByteLength: number; snapshotByteLength: number; originalSha256: string; snapshotSha256: string; byteIdentical: boolean; sourceKind: "USER_FILE" | "APP_GENERATED"; modelVisible: boolean; complete: boolean; truncated: boolean; transformationName: string | null };
export type AiAnalysisRequestPackage = { requestPackageVersion: string; runId: string; createdAtLocal: string; createdAtUtc: string; localTimeZone: string; deliveryMode: ProviderDeliveryMode; inputRecordCount: number; inputStableIdSetSha256: string; pendingSourceSha256: string; documents: RequestPackageDocument[]; coreInstructionName: string; coreInstructionVersion: string; coreInstructionSha256: string; supplementalInstructionSha256: string | null; outputSchemaSha256: string; finalProviderPayloadSha256: string; finalProviderPayloadBytes: number; inlineBlockCount: number; nativeFileCount: number };
export type AiAnalysisConversationEvent = { schemaVersion: string; runId: string; sequence: number; eventId: string; messageId: string | null; parentMessageId: string | null; role: "software" | "assistant" | "system"; atLocal: string; atUtc: string; type: "user_message" | "assistant_delta" | "assistant_message" | "system_event" | "provider_event" | "validation_event" | "artifact_event"; visibility: "CHATGPT_VISIBLE" | "APP_ONLY"; visibleToProvider: boolean; contentType: "text" | "json" | "metadata" | "error"; content: string; contentByteLength: number; contentSha256: string; providerRequestId: string | null; threadId: string | null; turnId: string | null; metadata: Record<string, unknown>; previousHash: string | null; hash: string };
export type AiSemanticFinding = { code: "SEMANTIC_STATUS_INVALID" | "SEMANTIC_CANDIDATE_STATUS_INVALID" | "SEMANTIC_CANDIDATE_REQUIRED" | "SEMANTIC_CANDIDATE_FORBIDDEN" | "SEMANTIC_NEGATIVE_CHECK_REQUIRED" | "SEMANTIC_REASON_REQUIRED" | "SEMANTIC_CATALOG_CANDIDATE_LOST" | "SEMANTIC_CATALOG_CHECK_REQUIRED" | "SEMANTIC_CATALOG_DETAIL_FLAG_INVALID" | "SEMANTIC_REVIEW_REASON_REQUIRED" | "SEMANTIC_REVIEW_ATTENTION_REQUIRED" | "SEMANTIC_CANDIDATE_ID_REQUIRED" | "SEMANTIC_POSITIVE_EVIDENCE_REQUIRED" | "SEMANTIC_MATCHED_RULE_REQUIRED" | "SEMANTIC_AUDIT_TRAIL_REQUIRED"; severity: "error"; path: string; jsonPath: string; jsonPointer: string; recordIndex: number; sourceRecordStableId: string | null; candidateIndex: number | null; skillId: string | null; message: string; expected: unknown; actual: unknown; ruleId: string | null };

export type AiAnalysisCandidate = {
  skillId: string;
  skillName: string;
  group: string;
  score: number | null;
  confidence: number | null;
  confidenceLabel?: "High" | "Medium" | "Low";
  confidenceReason?: string;
  scoreComponents?: AiScoreComponent[];
  positiveSignals?: string[];
  positiveEvidenceRefs: string[];
  negativeChecks?: AiNegativeCheck[];
  negativeEvidenceRefs: string[];
  rejectedNearSkills?: AiRejectedNearSkill[];
  evidenceQuote?: string;
  matchedRuleIds: string[];
  reason: string;
  status: AiAnalysisStatus;
  candidateStatus?: AiCandidateClassificationStatus;
  statusReason?: string;
  catalogDetailAvailable?: boolean;
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
  reviewReason?: string | null;
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
  providerDispatchCount?: number;
  threadStartAttemptCount?: number;
  threadCreatedCount?: number;
  turnStartAttemptCount?: number;
  acceptedTurnCount?: number;
  turnCompletedCount?: number;
  retryCount: number;
  repairTurnCount?: number;
  fallbackRequestCount?: number;
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
  providerResponseRawPath?: string | null;
  providerResponseGzipPath?: string | null;
  providerResponseSha256?: string | null;
  providerResponseGzipSha256?: string | null;
  providerResponseCanonicalPath?: string | null;
  providerResponseCanonicalSha256?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  appVersion?: string | null;
  buildTime?: string | null;
  packagedSourceCommit?: string | null;
  providerRuntimeVersion?: string | null;
  promptTemplateVersion?: string | null;
  promptSha256?: string | null;
  outputSchemaName?: string | null;
  outputSchemaSha256?: string | null;
  outputSchemaBytesUtf8?: number | null;
  outputSchemaValidation?: {
    validatorName: string; validatorVersion: string; validatedAt: string; isValid: boolean; findingCount: number;
    findings: Array<{ code: string; severity: "error"; jsonPointer: string; message: string; expected: unknown; actual: unknown; keyword: string; key?: string }>;
    maxObservedDepth: number; totalObjectProperties: number; totalEnumValues: number; totalSchemaStringLength: number;
    unsupportedKeywords: string[]; requiredPropertyMismatchCount: number; additionalPropertiesViolationCount: number;
  } | null;
  capacityPreflight?: {
    inputEstimateTokens: number;
    modelCapacityTokens: number | null;
    reservedOutputTokens: number;
    safetyMarginTokens: number | null;
    requiredContextTokens: number | null;
  } | null;
  capacitySnapshot?: CapacityCalculationSnapshot | null;
  capacityWarningCode?: CapacityWarningCode | null;
  capacitySnapshotHash?: string | null;
  capacityConfirmation?: CapacityConfirmation | null;
  failedStagingPath?: string | null;
  runDirectory?: string | null;
  requestPackage?: AiAnalysisRequestPackage | null;
  supplementalInstruction?: string | null;
  conversation?: AiAnalysisConversationEvent[];
  semanticFindings?: AiSemanticFinding[];
  providerReturnedRecordCount?: number;
  parsedRecordCount?: number;
  schemaValidRecordCount?: number;
  semanticValidRecordCount?: number;
  formalArtifactRecordCount?: number;
  sqliteCommittedRecordCount?: number;
  databaseWriteStatus?: string | null;
  validationGate?: { passed: boolean; inputCount: number; outputCount: number; missingStableIds: string[]; duplicateStableIds: string[]; unexpectedStableIds: string[]; catalogInvalidSkillIds: string[]; formalJsonAllowed: boolean; goldenHtmlAllowed: boolean; sqliteAllowed: boolean } | null;
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
