export const ANALYSIS_BRIDGE_VERSION = "0.3.36-bridge-v16" as const;
export const ANALYSIS_BRIDGE_SCHEMA_VERSION = "jaa-analysis-bridge-contract-v1" as const;

export type AnalysisLifecycleStage =
  | "RUN_CREATED"
  | "INPUT_PREPARED"
  | "BRIDGE_PREFLIGHT_COMPLETED"
  | "MODEL_INPUT_MANIFEST_GENERATION"
  | "PROVIDER_DISPATCHED"
  | "INPUT_READING"
  | "INPUT_READY"
  | "ANALYSIS_STARTED"
  | "ANALYSIS_COMPLETED"
  | "ARTIFACT_SUBMISSION_STARTED"
  | "ARTIFACT_SUBMISSION_VALIDATION"
  | "ARTIFACT_PUBLISHED"
  | "VALIDATION_COMPLETED"
  | "CANONICAL_ASSEMBLY_COMPLETED"
  | "RUN_COMPLETED";

export type AnalysisLifecycleSummary = {
  schemaVersion: "jaa-analysis-lifecycle-v1";
  runId: string;
  providerTurnStatus: "not_started" | "running" | "completed" | "failed" | "interrupted";
  inputStatus: "not_started" | "reading" | "ready" | "failed";
  sourceInputStatus?: "not_started" | "validated" | "failed";
  modelInputStatus?: "not_started" | "delivering" | "delivered" | "failed";
  analysisStatus: "not_started" | "running" | "completed" | "failed" | "interrupted";
  artifactStatus: "not_started" | "submitting" | "received" | "accepted" | "persisted" | "content_validated" | "formally_published" | "rejected" | "submission_rejected" | "published" | "failed";
  artifactAttemptStatus?: "not_started" | "received";
  validationStatus: "not_started" | "running" | "passed" | "completed" | "failed" | "blocked";
  firstFailedValidationStage?: string | null;
  canonicalAssemblyStatus: "not_started" | "completed" | "failed";
  htmlRenderStatus: "not_started" | "rendering" | "completed" | "failed";
  sqliteStatus: "blocked" | "eligible" | "committed" | "commit_failed";
  overallStatus: "running" | "completed" | "completed_with_warnings" | "completed_with_quality_warnings" | "completed_with_artifact_error" | "completed_with_report_error" | "completed_with_persistence_error" | "failed" | "interrupted";
  lastSuccessfulStage: AnalysisLifecycleStage;
  firstFailedStage: AnalysisLifecycleStage | null;
  rootErrorCode: string | null;
  rootErrorStage?: string | null;
  rootErrorMessage?: string | null;
  derivedErrorCodes?: string[];
  derivedStatusCodes: string[];
  canonicalStatus: "not_created" | "created";
  analyzedResultStatus?: "not_created" | "created";
  activeResultStatus?: "unchanged" | "changed";
  formalReportPackageStatus?: "not_created" | "created";
  formalHtmlStatus?: "not_started" | "created";
  diagnosticReportPackageStatus?: "not_created" | "created";
  diagnosticHtmlStatus?: "not_created" | "created";
  terminalState?: string;
  terminalIdempotencyKey?: string;
  terminalSnapshotHash?: string;
  terminalAtUtc?: string;
  analysisStarted: boolean;
  analysisCompleted: boolean;
  completedCount: number | null;
  decisionPreparedCount: number | null;
  updatedAtLocal: string;
  updatedAtUtc: string;
  controlState?: string;
  analysisTelemetry?: Record<string, unknown>;
};

export type AnalysisBridgeEvidence = {
  version: typeof ANALYSIS_BRIDGE_VERSION;
  sha256: string;
  integrity: "verified";
  transport: "codex_dynamic_tools_stdio";
  localOnly: true;
  preflight: Record<string, unknown>;
  inputReceipt: Record<string, unknown> | null;
  sourceInputReceipt?: Record<string, unknown> | null;
  boundarySafetyReceipt?: Record<string, unknown> | null;
  modelDeliveryReceipt?: Record<string, unknown> | null;
  modelDeliveryFailure?: Record<string, unknown> | null;
  artifactReceipt: Record<string, unknown> | null;
  lifecycle: AnalysisLifecycleSummary;
  bridgeExecutionContext?: Record<string, unknown> | null;
  rootError?: Record<string, unknown> | null;
  derivedErrors?: Array<Record<string, unknown>>;
  runtimeContract?: Record<string, unknown>;
  providerDispatchGate?: Record<string, unknown> | null;
  providerLifecycle?: Record<string, unknown> | null;
  hostControlLifecycle?: Record<string, unknown> | null;
  analysisTelemetry?: Record<string, unknown> | null;
};

export type AnalysisBridgeToolContext = { runId: string; sessionNonce: string; threadId: string; turnId: string; callId: string; toolRegistrationId?: string };
