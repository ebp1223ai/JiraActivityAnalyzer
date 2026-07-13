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
  rawDataMode: "summary_only" | "auto_save_raw_per_issue" | "full_raw_in_memory";
  batchSize: 10 | 20 | 40 | "all";
  pauseAfterCurrentIssue: boolean;
  previousUnfinishedRun: Record<string, unknown> | null;
  previousUnfinishedDismissed: boolean;
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
  rawDataMode: "auto_save_raw_per_issue",
  batchSize: 10,
  pauseAfterCurrentIssue: false,
  previousUnfinishedRun: null,
  previousUnfinishedDismissed: false,
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
