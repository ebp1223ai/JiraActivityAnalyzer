export const ANALYSIS_BRIDGE_VERSION = "0.3.19-bridge-v2" as const;
export const ANALYSIS_BRIDGE_SCHEMA_VERSION = "jaa-analysis-bridge-contract-v1" as const;

export type AnalysisLifecycleStage =
  | "RUN_CREATED"
  | "INPUT_PREPARED"
  | "BRIDGE_PREFLIGHT_COMPLETED"
  | "PROVIDER_DISPATCHED"
  | "INPUT_READING"
  | "INPUT_READY"
  | "ANALYSIS_STARTED"
  | "ANALYSIS_COMPLETED"
  | "ARTIFACT_SUBMISSION_STARTED"
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
  artifactStatus: "not_started" | "submitting" | "published" | "failed";
  validationStatus: "not_started" | "completed" | "failed";
  canonicalAssemblyStatus: "not_started" | "completed" | "failed";
  sqliteStatus: "blocked" | "eligible" | "committed";
  overallStatus: "running" | "completed" | "completed_with_warnings" | "failed" | "interrupted";
  lastSuccessfulStage: AnalysisLifecycleStage;
  firstFailedStage: AnalysisLifecycleStage | null;
  rootErrorCode: string | null;
  analysisStarted: boolean;
  analysisCompleted: boolean;
  completedCount: number | null;
  decisionPreparedCount: number | null;
  updatedAtLocal: string;
  updatedAtUtc: string;
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
  modelDeliveryReceipt?: Record<string, unknown> | null;
  modelDeliveryFailure?: Record<string, unknown> | null;
  artifactReceipt: Record<string, unknown> | null;
  lifecycle: AnalysisLifecycleSummary;
};

export type AnalysisBridgeToolContext = { runId: string; sessionNonce: string; threadId: string; turnId: string; callId: string };
