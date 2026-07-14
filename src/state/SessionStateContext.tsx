import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export type SessionTableState = {
  page: number;
  pageSize: number;
  search: string;
  filter: string;
};

export type JiraAnalysisSessionState = {
  issueKey: string;
  result: unknown | null;
  loading: boolean;
  error: string;
  notice: string;
  activeTab: string;
  tabStates: Partial<Record<string, SessionTableState>>;
  lastLoadedAt: string;
  saving: boolean;
};

export type JiraProbeSessionState = {
  issueKey: string;
  result: unknown | null;
  showRawJson: boolean;
  activeTab: string;
  inspectorSearch: string;
  inspectorFilter: string;
  runState: string;
  error: string;
  actionNotice: string;
  envLoadedOnce: boolean;
  lastProbeAt: string;
  saving: boolean;
};

export type UserAnalysisCandidateIssue = {
  id: string;
  key: string;
  summary: string;
  status: string;
  assignee: string;
  reporter: string;
  creator: string;
  updated: string;
  created: string;
  issueType: string;
  priority: string;
  project: string;
  matchedReason: string;
};

export type UserAnalysisPrecisionProbeResult = {
  method: string;
  status: "not_run" | "running" | "success" | "unsupported" | "failed" | "partial";
  httpStatus: string;
  supported: "yes" | "no" | "unknown";
  resultCount: number;
  sampleIssueKeys: string[];
  candidateSource: string;
  error: string;
  recommendation: string;
  contentType?: string;
  jql?: string;
  rawSummary?: string;
};

export type UserActivityStreamEntry = {
  runId: string;
  issueKey: string;
  activityTitle: string;
  activityAuthor: string;
  activityAuthorEmail: string;
  activityTime: string;
  activityType: "link" | "comment" | "attachment" | "status" | "assignee_change" | "field_change" | "description_update" | "page" | "unknown";
  source: "activity_stream" | "manual_url";
  variant: string;
  extractedIssueKeysPerEntry: string[];
};

export type UserActivityStreamDiagnosis = "parsed" | "no_entries" | "parser_failed" | "html_login" | "http_error" | "blocked" | "unknown";

export type UserActivityStreamFirstEntry = {
  rawTitleText: string;
  rawAuthorText: string;
  rawUpdatedText: string;
  rawPublishedText: string;
  rawLinkHref: string;
  rawSummaryText: string;
  extractedIssueKeys: string[];
};

export type UserActivityStreamVariantResult = {
  runId: string;
  status: "success" | "failed" | "unsupported";
  variant: "username" | "escaped_username" | "email" | "custom" | "manual_url";
  activityStreamUser: string;
  requestUrlSanitized: string;
  httpStatus: string;
  contentType: string;
  reachable: boolean;
  supported: "yes" | "no" | "unknown";
  parsed: boolean;
  atomEntryCount: number;
  parsedActivityCount: number;
  parsedIssueKeys: string[];
  diagnosis: UserActivityStreamDiagnosis;
  entriesSanitized: UserActivityStreamEntry[];
  firstEntriesSanitized: UserActivityStreamFirstEntry[];
  error: string;
  rawSummary: string;
  parserDiagnostics: UserActivityStreamParserDiagnostics;
};

export type UserActivityStreamSkippedEntry = {
  entryIndex: number;
  reason: string;
  rawTitleText: string;
  rawUpdatedText: string;
  rawAuthorText: string;
};

export type UserActivityStreamParserDiagnostics = {
  atomEntryCount: number;
  parsedEntryCount: number;
  skippedEntryCount: number;
  entriesWithoutIssueKeyCount: number;
  entriesWithoutAuthorCount: number;
  entriesWithoutTimeCount: number;
  entriesWithoutTitleCount: number;
  entriesWithMultipleIssueKeysCount: number;
  parserErrorCount: number;
  parserErrorsSanitized: string[];
  skippedEntriesSanitized: UserActivityStreamSkippedEntry[];
  parserAnomaly: boolean;
  parserAnomalyReason: string;
};

export type UserActivityStreamResult = {
  runId: string;
  status: "not_run" | "running" | "success" | "failed" | "unsupported";
  overallStatus: "not_run" | "running" | "success" | "partial" | "failed";
  reachable: boolean;
  supported: "yes" | "no" | "unknown";
  parsed: boolean;
  diagnosis: UserActivityStreamDiagnosis;
  bestVariant: string;
  bestActivityStreamUser: string;
  bestParsedIssueKeys: string[];
  httpStatus: string;
  contentType: string;
  requestUrlSanitized: string;
  activityStreamUser: string;
  activityStreamDateSemantics: "unknown";
  parsedActivityCount: number;
  parsedIssueKeys: string[];
  atomEntryCount: number;
  variantResults: UserActivityStreamVariantResult[];
  activityStreamIssueKeys: string[];
  entriesSanitized: UserActivityStreamEntry[];
  firstEntriesSanitized: UserActivityStreamFirstEntry[];
  error: string;
  rawSummary: string;
  parserDiagnostics: UserActivityStreamParserDiagnostics;
};

export type UserActivityStreamRunHistory = {
  runId: string;
  startedAt: string;
  completedAt: string;
  mode: string;
  activityStreamUser: string;
  maxResults: number;
  dateRange: { start: string; end: string };
  bestVariant: string;
  atomEntryCount: number;
  parsedActivityCount: number;
  parsedIssueKeyCount: number;
  diagnosis: UserActivityStreamDiagnosis;
  staleIgnored: boolean;
};

export type UserActivityStreamFilter = {
  activityTypes: UserActivityStreamEntry["activityType"][];
  issueKeyQuery: string;
  onlyWithIssueKey: boolean;
  dateRange: { start: string; end: string };
  variants: string[];
  sources: UserActivityStreamEntry["source"][];
  authorQuery: string;
};

export type UserActivityStreamManualDiagnostics = {
  manualUrlProvided: boolean;
  manualUrlAccepted: boolean;
  rejectReason: string;
  requestUrlSanitized: string;
};

export type UserAnalysisPrecisionProbeSummary = {
  overallStatus: "not_run" | "running" | "success" | "partial" | "failed";
  updatedBySupported: "yes" | "no" | "unknown";
  activityStreamSupported: "yes" | "no" | "unknown";
  changedBySupported: "yes" | "no" | "partial" | "unknown";
  broadCandidateCount: number;
  uniquePreciseIssueCount: number;
  potentialFullFetchReductionPercent: number | null;
  recommendedStage1Mode: "updatedBy_candidate" | "activity_stream" | "activity_stream_manual" | "no_activity_found" | "changed_by_hybrid" | "broad_fallback";
};

export type UserAnalysisPrecisionIssueKeySets = {
  activityStreamIssueKeys: string[];
  manualActivityStreamIssueKeys: string[];
  updatedByCandidateIssueKeys: string[];
  changedByIssueKeys: string[];
  broadBaselineIssueKeys: string[];
  recommendedIssueKeys: string[];
};

export type UserAnalysisFullFetchReportRow = {
  issueKey: string;
  summary: string;
  status: string;
  fetchStatus: "pending" | "running" | "success" | "failed" | "skipped";
  httpStatus: string;
  changelogHistories: number;
  changelogItems: number;
  comments: number;
  attachmentsMetadata: number;
  issueLinks: number;
  parsedUsers: number;
  estimatedEvents: number;
  duration: string;
  error: string;
  lastFetchedAt: string;
};

export type UserAnalysisFullFetchSummary = {
  totalIssues: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  skipped: number;
  totalChangelogHistories: number;
  totalChangelogItems: number;
  totalComments: number;
  totalAttachmentsMetadata: number;
  totalIssueLinks: number;
  totalParsedUsers: number;
  totalEstimatedEvents: number;
};

export type UserAnalysisFullFetchMemory = {
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  systemFreeMB: number;
  rawDataEstimateMB: number;
};

export type UserAnalysisFullFetchProgress = {
  runId: string;
  status: string;
  total: number;
  currentIndex: number;
  currentIssueKey: string;
  lastCompletedIndex: number;
  lastCompletedIssueKey: string;
  success: number;
  failed: number;
  skipped: number;
  elapsedMs: number;
  averageMsPerIssue: number;
  estimatedRemainingMs: number;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  rawDataMode: "summary_only" | "auto_save_raw_per_issue" | "full_raw_in_memory";
  memory: UserAnalysisFullFetchMemory;
  autoLogPath: string;
  checkpointPath: string;
  issueStatus: Array<{ index: number; issueKey: string; status: string; durationMs?: number; error?: string }>;
};

export type UserAnalysisSessionState = {
  selectedUsersText: string;
  startDate: string;
  endDate: string;
  searchMode: "standard";
  generatedJql: string;
  generatedBaseJql: string;
  jqlDateRange: {
    startInclusive: string;
    endExclusive: string;
  };
  jqlStrategy: "base search without updatedBy" | "base-in-query" | "base-or-chain-fallback";
  updatedByStatus: "disabled" | "success" | "failed" | "not_supported";
  candidateSafetyLimit: number;
  fetchLimit: number;
  candidateIssues: UserAnalysisCandidateIssue[];
  selectedForFetch: string[];
  excludedIssues: string[];
  activeTab: "candidates" | "queue" | "fetchReport" | "exports";
  precisionProbeMaxResults: 0 | 10 | 20 | 50;
  precisionProjectScope: string;
  activityStreamUser: string;
  activityStreamQueryMode: "auto" | "username" | "email" | "custom";
  activityStreamRelativeLinks: boolean;
  manualActivityStreamUrl: string;
  manualActivityStreamResult: UserActivityStreamVariantResult | null;
  manualUrlReplayDiagnostics: UserActivityStreamManualDiagnostics;
  currentActivityStreamRunId: string;
  isActivityStreamRunning: boolean;
  activityStreamRunHistory: UserActivityStreamRunHistory[];
  lastSuccessfulActivityStreamResult: UserActivityStreamResult | null;
  parsedEntriesFilter: UserActivityStreamFilter;
  activityStream: UserActivityStreamResult;
  precisionIssueKeySets: UserAnalysisPrecisionIssueKeySets;
  precisionProbeStatus: "idle" | "running" | "completed" | "partial" | "failed";
  precisionProbeResults: UserAnalysisPrecisionProbeResult[];
  precisionProbeSummary: UserAnalysisPrecisionProbeSummary;
  uniquePreciseIssueKeys: string[];
  precisionIssueSources: Record<string, string[]>;
  precisionProbeWarnings: string[];
  precisionProbeErrors: string[];
  precisionProbeLastRunAt: string;
  lastSavedPrecisionProbePath: string;
  showHelpTips: boolean;
  helpOpen: boolean;
  expandedFetchReportIssues: string[];
  page: number;
  pageSize: number;
  search: string;
  warnings: string[];
  errors: string[];
  lastDiscoveryAt: string;
  lastSavedCandidateResultPath: string;
  lastSavedCandidateRawDataPath: string;
  lastSavedExportFolderPath: string;
  fullFetchRunId: string;
  fullFetchStartedAt: string;
  fullFetchFinishedAt: string;
  fullFetchStatus: "idle" | "running" | "paused" | "completed" | "completed_with_errors" | "failed";
  fullFetchSummary: UserAnalysisFullFetchSummary;
  fullFetchReport: UserAnalysisFullFetchReportRow[];
  fullFetchResultsByIssue: unknown[];
  fullFetchRawDataByIssueSanitized: unknown | null;
  fullFetchWarnings: string[];
  fullFetchErrors: string[];
  fullFetchProgress: UserAnalysisFullFetchProgress;
  fullFetchMemory: UserAnalysisFullFetchMemory;
  autoLogPath: string;
  checkpointPath: string;
  actionLogPath: string;
  actionLogAvailable: boolean;
  rawDataMode: "summary_only" | "auto_save_raw_per_issue" | "full_raw_in_memory";
  batchSize: 10 | 20 | 40 | "all";
  pauseAfterCurrentIssue: boolean;
  previousUnfinishedRun: Record<string, unknown> | null;
  previousUnfinishedDismissed: boolean;
  largeQueueConfirmationOpen: boolean;
  largeQueueConfirmInput: string;
  largeQueueConfirmError: string;
  fetchReportPage: number;
  fetchReportPageSize: number;
  fetchReportFilter: "all" | "success" | "failed";
  lastSavedFullFetchResultPath: string;
  lastSavedFullFetchRawDataPath: string;
  rawSearchMetadata: unknown | null;
  saving: boolean;
  loading: boolean;
  notice: string;
};

type SessionStateContextValue = {
  jiraAnalysis: JiraAnalysisSessionState;
  setJiraAnalysis: Dispatch<SetStateAction<JiraAnalysisSessionState>>;
  jiraProbe: JiraProbeSessionState;
  setJiraProbe: Dispatch<SetStateAction<JiraProbeSessionState>>;
  userAnalysis: UserAnalysisSessionState;
  setUserAnalysis: Dispatch<SetStateAction<UserAnalysisSessionState>>;
};

const initialJiraAnalysis: JiraAnalysisSessionState = {
  issueKey: "COPGEN1-138930",
  result: null,
  loading: false,
  error: "",
  notice: "",
  activeTab: "overview",
  tabStates: {},
  lastLoadedAt: "",
  saving: false
};

const initialJiraProbe: JiraProbeSessionState = {
  issueKey: "",
  result: null,
  showRawJson: false,
  activeTab: "overview",
  inspectorSearch: "",
  inspectorFilter: "all",
  runState: "idle",
  error: "",
  actionNotice: "",
  envLoadedOnce: false,
  lastProbeAt: "",
  saving: false
};

const initialUserAnalysis: UserAnalysisSessionState = {
  selectedUsersText: "roger_hsieh\nch_kao",
  startDate: "2026-07-01",
  endDate: "2026-07-07",
  searchMode: "standard",
  generatedJql: "",
  generatedBaseJql: "",
  jqlDateRange: {
    startInclusive: "",
    endExclusive: ""
  },
  jqlStrategy: "base search without updatedBy",
  updatedByStatus: "disabled",
  candidateSafetyLimit: 1000,
  fetchLimit: 40,
  candidateIssues: [],
  selectedForFetch: [],
  excludedIssues: [],
  activeTab: "candidates",
  precisionProbeMaxResults: 10,
  precisionProjectScope: "",
  activityStreamUser: "roger_hsieh",
  activityStreamQueryMode: "auto",
  activityStreamRelativeLinks: true,
  manualActivityStreamUrl: "",
  manualActivityStreamResult: null,
  manualUrlReplayDiagnostics: { manualUrlProvided: false, manualUrlAccepted: false, rejectReason: "", requestUrlSanitized: "" },
  currentActivityStreamRunId: "",
  isActivityStreamRunning: false,
  activityStreamRunHistory: [],
  lastSuccessfulActivityStreamResult: null,
  parsedEntriesFilter: { activityTypes: [], issueKeyQuery: "", onlyWithIssueKey: false, dateRange: { start: "2026-07-01", end: "2026-07-07" }, variants: [], sources: [], authorQuery: "" },
  activityStream: {
    runId: "",
    status: "not_run",
    overallStatus: "not_run",
    reachable: false,
    supported: "unknown",
    parsed: false,
    diagnosis: "unknown",
    bestVariant: "",
    bestActivityStreamUser: "",
    bestParsedIssueKeys: [],
    httpStatus: "-",
    contentType: "",
    requestUrlSanitized: "",
    activityStreamUser: "",
    activityStreamDateSemantics: "unknown",
    parsedActivityCount: 0,
    parsedIssueKeys: [],
    atomEntryCount: 0,
    variantResults: [],
    activityStreamIssueKeys: [],
    entriesSanitized: [],
    firstEntriesSanitized: [],
    error: "",
    rawSummary: "",
    parserDiagnostics: { atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0, entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0, entriesWithMultipleIssueKeysCount: 0, parserErrorCount: 0, parserErrorsSanitized: [], skippedEntriesSanitized: [], parserAnomaly: false, parserAnomalyReason: "" }
  },
  precisionIssueKeySets: {
    activityStreamIssueKeys: [],
    manualActivityStreamIssueKeys: [],
    updatedByCandidateIssueKeys: [],
    changedByIssueKeys: [],
    broadBaselineIssueKeys: [],
    recommendedIssueKeys: []
  },
  precisionProbeStatus: "idle",
  precisionProbeResults: [],
  precisionProbeSummary: {
    overallStatus: "not_run",
    updatedBySupported: "unknown",
    activityStreamSupported: "unknown",
    changedBySupported: "unknown",
    broadCandidateCount: 0,
    uniquePreciseIssueCount: 0,
    potentialFullFetchReductionPercent: null,
    recommendedStage1Mode: "broad_fallback"
  },
  uniquePreciseIssueKeys: [],
  precisionIssueSources: {},
  precisionProbeWarnings: [],
  precisionProbeErrors: [],
  precisionProbeLastRunAt: "",
  lastSavedPrecisionProbePath: "",
  showHelpTips: true,
  helpOpen: false,
  expandedFetchReportIssues: [],
  page: 1,
  pageSize: 40,
  search: "",
  warnings: [],
  errors: [],
  lastDiscoveryAt: "",
  lastSavedCandidateResultPath: "",
  lastSavedCandidateRawDataPath: "",
  lastSavedExportFolderPath: "",
  fullFetchRunId: "",
  fullFetchStartedAt: "",
  fullFetchFinishedAt: "",
  fullFetchStatus: "idle",
  fullFetchSummary: {
    totalIssues: 0,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    totalChangelogHistories: 0,
    totalChangelogItems: 0,
    totalComments: 0,
    totalAttachmentsMetadata: 0,
    totalIssueLinks: 0,
    totalParsedUsers: 0,
    totalEstimatedEvents: 0
  },
  fullFetchReport: [],
  fullFetchResultsByIssue: [],
  fullFetchRawDataByIssueSanitized: null,
  fullFetchWarnings: [],
  fullFetchErrors: [],
  fullFetchProgress: {
    runId: "",
    status: "idle",
    total: 0,
    currentIndex: 0,
    currentIssueKey: "",
    lastCompletedIndex: 0,
    lastCompletedIssueKey: "",
    success: 0,
    failed: 0,
    skipped: 0,
    elapsedMs: 0,
    averageMsPerIssue: 0,
    estimatedRemainingMs: 0,
    batchSize: 10,
    currentBatch: 0,
    totalBatches: 0,
    rawDataMode: "auto_save_raw_per_issue",
    memory: { rssMB: 0, heapUsedMB: 0, heapTotalMB: 0, externalMB: 0, systemFreeMB: 0, rawDataEstimateMB: 0 },
    autoLogPath: "",
    checkpointPath: "",
    issueStatus: []
  },
  fullFetchMemory: { rssMB: 0, heapUsedMB: 0, heapTotalMB: 0, externalMB: 0, systemFreeMB: 0, rawDataEstimateMB: 0 },
  autoLogPath: "",
  checkpointPath: "",
  actionLogPath: "",
  actionLogAvailable: false,
  rawDataMode: "auto_save_raw_per_issue",
  batchSize: 10,
  pauseAfterCurrentIssue: false,
  previousUnfinishedRun: null,
  previousUnfinishedDismissed: false,
  largeQueueConfirmationOpen: false,
  largeQueueConfirmInput: "",
  largeQueueConfirmError: "",
  fetchReportPage: 1,
  fetchReportPageSize: 40,
  fetchReportFilter: "all",
  lastSavedFullFetchResultPath: "",
  lastSavedFullFetchRawDataPath: "",
  rawSearchMetadata: null,
  saving: false,
  loading: false,
  notice: ""
};

const SessionStateContext = createContext<SessionStateContextValue | null>(null);

export function SessionStateProvider({ children }: { children: ReactNode }) {
  const [jiraAnalysis, setJiraAnalysis] = useState(initialJiraAnalysis);
  const [jiraProbe, setJiraProbe] = useState(initialJiraProbe);
  const [userAnalysis, setUserAnalysis] = useState(initialUserAnalysis);

  return (
    <SessionStateContext.Provider value={{ jiraAnalysis, setJiraAnalysis, jiraProbe, setJiraProbe, userAnalysis, setUserAnalysis }}>
      {children}
    </SessionStateContext.Provider>
  );
}

export function useSessionState() {
  const context = useContext(SessionStateContext);
  if (!context) throw new Error("useSessionState must be used inside SessionStateProvider");
  return context;
}
