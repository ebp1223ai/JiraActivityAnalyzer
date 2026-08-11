export type AiMode = "cloud" | "local" | "offline";
export type AiMainTab = "diagnostics" | "workspace" | "results";
export type ResultsView = "records" | "report";
export type ConnectionTestStatus = "not_configured" | "not_tested" | "running" | "passed" | "failed";
export type AnalysisRunStatus = "idle" | "queued" | "running" | "completed" | "failed";
export type DiagnosticStepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
export type AnalysisDisposition = "candidate" | "needs_review" | "excluded" | "unknown";

export type AiSettingsForm = {
  provider: string;
  endpoint: string;
  model: string;
  apiContract: string;
  authType: string;
  accessToken: string;
  contextWindow: string;
  timeoutSeconds: string;
};

export type AiServiceState = {
  mode: "cloud" | "local";
  configured: boolean;
  savedAt: string | null;
  tested: boolean;
  testStatus: ConnectionTestStatus;
  testedAt: string | null;
  settingsVersion: number;
  testedSettingsVersion: number | null;
  form: AiSettingsForm;
  diagnosticRunId: string | null;
  diagnosticSteps: DiagnosticStep[];
};

export type DiagnosticStep = {
  id: string;
  name: string;
  status: DiagnosticStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorCategory: string | null;
  message: string;
  requestSummary: string;
  responseSummary: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  service: "cloud" | "local";
  provider: string;
  model: string;
  createdAt: string;
  durationMs: number | null;
  tokenUsage: number | null;
  text: string;
  simulated: true;
};

export type AnalysisBasisFile = {
  kind: "catalog" | "rules" | "manifest";
  fileName: string;
  version: string;
  sha256: string;
  status: "verified" | "invalid";
};

export type EventPreview = {
  id: string;
  issueKey: string;
  actor: string;
  field: string;
  occurredAt: string;
  summary: string;
  added: number;
  deleted: number;
};

export type PendingDataset = {
  id: string;
  fileName: string;
  fileType: "pending";
  subject: string;
  dateRange: string;
  eventCount: number;
  issueCount: number;
  projectCount: number;
  jiraServer: string;
  sourceDatabase: string;
  integrity: "verified" | "invalid";
  importedAt: string;
  previews: EventPreview[];
  sourcePayload?: unknown;
};

export type SkillCatalogEntry = {
  id: string;
  name: string;
  group: string;
  catalogStatus: "review-draft";
  detailDescription: string | null;
};

export type SkillCandidate = {
  skillId: string;
  skillName: string;
  group: string;
  score: number;
  confidence: "high" | "medium" | "low";
  status: "CATALOG_DETAIL_MISSING" | "NEEDS_REVIEW";
  reason: string;
};

export type AnalysisResultRow = {
  id: string;
  evidenceId: string;
  issueKey: string;
  actor: string;
  sourceType: string;
  occurredAt: string;
  diffSummary: string;
  fullDiff: string;
  positiveEvidence: string[];
  negativeEvidence: string[];
  matchedRules: string[];
  traceId: string;
  disposition: AnalysisDisposition;
  dispositionLabel: string;
  skills: SkillCandidate[];
};

export type AnalysisSnapshot = {
  mode: AiMode;
  provider: string;
  model: string;
  settingsVersion: number | null;
  basisVersions: string[];
  basisHashes: string[];
};

export type AnalyzedDataset = {
  id: string;
  fileName: string;
  fileType: "analyzed";
  status: AnalysisRunStatus;
  sourcePendingFileName: string;
  subject: string;
  dateRange: string;
  eventCount: number;
  diffCount: number;
  issueCount: number;
  projectCount: number;
  jiraServer: string;
  sourceDatabase: string;
  integrity: "verified" | "invalid";
  importedAt: string;
  progress: number;
  currentStep: string;
  snapshot: AnalysisSnapshot;
  records: AnalysisResultRow[];
  summary: {
    analysisResultCount: number;
    skillCandidateDiffCount: number;
    needsReviewCount: number;
    excludedOrUnknownCount: number;
    catalogSkillCount: number;
  };
  sourcePayload?: unknown;
};

export type AnalysisRunState = {
  id: string;
  status: AnalysisRunStatus;
  sourcePendingId: string;
  outputAnalyzedId: string;
  snapshot: AnalysisSnapshot;
  progress: number;
  currentStep: string;
  startedAt: string;
  completedAt: string | null;
};
