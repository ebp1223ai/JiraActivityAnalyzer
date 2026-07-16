import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { defaultWorkflowSteps, type FetchQueueMetadata, type RelatedCandidateIssue, type TimelineIssueGroup, type WorkflowStepStatus } from "../../electron/userAnalysisWorkflow";

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
  queueMetadata?: FetchQueueMetadata;
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
  activityType: "link" | "comment" | "attachment" | "status_change" | "resolution_change" | "assignee_change" | "field_change" | "description_update" | "page" | "unknown";
  activityTypeClassifier: UserActivityTypeClassifierResult;
  source: "activity_stream" | "manual_url";
  variant: string;
  extractedIssueKeysPerEntry: string[];
  rawTitle: string;
  rawSummary: string;
  rawContent: string;
  activityApplication: "Jira" | "Confluence" | "Other";
  objectType: string;
  target: string;
  links: string[];
  entryIndex: number;
  entryFingerprint: string;
};

export type UserActivityTypeClassifierResult = {
  matchedRule: string;
  matchedText: string;
  priority: number;
  sourceField: "title" | "rawTitle" | "application" | "objectType" | "rawContent" | "previousType" | "";
  previousType: string;
  finalType: UserActivityStreamEntry["activityType"];
};

export type UserActivityTypeClassifierDiagnostics = {
  enabled: boolean;
  rulesVersion: string;
  commentPriorityHigherThanAttachment: boolean;
  totalEntries: number;
  correctedEntryCount: number;
  preservedEntryCount: number;
  inferredEntryCount: number;
  fallbackUnknownCount: number;
  matchedRuleCounts: Record<string, number>;
  finalTypeCounts: Record<string, number>;
};

export type UserStandardActivityStreamFlow = {
  enabled: boolean;
  selectedUser: string;
  activityStreamQueryUser: string;
  activityStreamQueryUserEncoded: string;
  variant: string;
  dateQueryMode: string;
  chunkingMode: string;
  perChunkMaxResults: number;
  advancedOverrideUsed: boolean;
};

export type UserActivityStreamDiagnosis = "parsed" | "parsed_no_issue_keys" | "parsed_confluence_only" | "no_entries" | "parser_failed" | "html_login" | "http_error" | "blocked" | "unknown";

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
  activityTypeClassifierDiagnostics: UserActivityTypeClassifierDiagnostics;
  activityEntryStats: UserActivityStreamEntryStats;
  dateQueryMode?: UserActivityStreamDateQueryResult["mode"];
};

export type UserActivityStreamDateQueryMode = "none" | "startDate_endDate" | "update_date_after_before" | "both";
export type UserActivityStreamDateEffectiveness = true | false | "likely_true" | "unknown";

export type UserActivityStreamDateQueryResult = {
  mode: "none" | "startDate_endDate" | "update_date_after_before";
  runId: string;
  requestUrlSanitized: string;
  dateFilterKeyTested: "" | "update-date" | "last-update-date";
  dateParameterSemantics: "none" | "end_exclusive";
  atomEntryCount: number;
  parsedActivityCount: number;
  entriesInsideRequestedRange: number;
  entriesOutsideRequestedRange: number;
  newestEntryTime: string;
  oldestEntryTime: string;
  dateFilterEffective: UserActivityStreamDateEffectiveness;
  warnings: string[];
};

export type UserActivityStreamDateSemantics = {
  requestedDateRange: { start: string; end: string; endInclusive: true; timezone: "Asia/Taipei"; startEpochMs: number; endExclusiveEpochMs: number };
  dateQueryModesTested: UserActivityStreamDateQueryResult["mode"][];
  bestDateQueryMode: UserActivityStreamDateQueryResult["mode"] | "client_side_only";
  serverDateFilterEffective: UserActivityStreamDateEffectiveness;
  clientDateFilterApplied: boolean;
  rawReturnedEntries: number;
  clientDateFilteredEntries: number;
  warnings: string[];
};

export type UserActivityStreamMaxResultsDiagnostics = {
  requestedMaxResults: number;
  maxResultsSource: "custom" | "quick";
  actualAtomEntryCount: number;
  parsedActivityCount: number;
  serverCapDetected: true | false | "likely" | "unknown";
  serverCapValueEstimated: number | null;
  responseTimeMs: number;
  responseSizeKB: number;
  largeMaxResultsWarningShown: boolean;
  largeMaxResultsConfirmed: boolean;
  warnings: string[];
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
  entriesWithIssueKeyCount: number;
  confluenceOnlyEntryCount: number;
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

export type UserActivityStreamEntryStats = {
  totalAtomEntries: number;
  parsedActivityEntryCount: number;
  parsedIssueActivityCount: number;
  entriesWithIssueKeyCount: number;
  entriesWithoutIssueKeyCount: number;
  confluenceOnlyEntryCount: number;
  nonJiraEntryCount: number;
  jiraIssueEntryCount: number;
  uniqueIssueKeyCount: number;
};

export type UserActivityStreamBaselineComparison = {
  enabled: boolean;
  baselineFound: boolean;
  snapshotKey: string;
  classification: string;
  confidence: "normal" | "high";
  shouldRetry: boolean;
  retryReason: string;
  baselineCounts: { bestAtomEntryCount: number; bestParsedActivityCount: number; bestIssueKeyCount: number; bestEntryFingerprintCount: number };
  currentCounts: { atomEntryCount: number; parsedActivityCount: number; issueKeyCount: number; entryFingerprintCount: number };
  missingIssueKeys: string[];
  missingEntryFingerprints: string[];
  newIssueKeys: string[];
  newEntryFingerprints: string[];
  baselineUpdated: boolean;
  baselineUpdateReason: string;
  baselinePath: string;
};

export type UserActivityStreamBaselineGuardRetry = {
  triggered: boolean;
  maxRetries: number;
  attempts: Array<{ attempt: number; runId: string; classification: string; parsedActivityCount: number; issueKeyCount: number; missingIssueKeyCount: number; missingEntryFingerprintCount: number }>;
  finalAcceptedRunId: string;
  finalClassification: string;
  baselineUpdated: boolean;
  retryRecovered: boolean;
};

export type UserActivityStreamResult = {
  runId: string;
  status: "not_run" | "running" | "success" | "failed" | "unsupported";
  overallStatus: "not_run" | "running" | "success" | "partial" | "no_entries" | "failed";
  reachable: boolean;
  supported: "yes" | "no" | "unknown";
  parsed: boolean;
  diagnosis: UserActivityStreamDiagnosis;
  bestVariant: string;
  bestVariantReason: "all_variants_no_entries" | "ranked_by_parse_quality" | "no_variant_available" | string;
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
  activityTypeClassifierDiagnostics: UserActivityTypeClassifierDiagnostics;
  activityEntryStats: UserActivityStreamEntryStats;
  baselineComparison: UserActivityStreamBaselineComparison;
  baselineGuardRetry: UserActivityStreamBaselineGuardRetry;
  baselineGuardAttemptResults: Array<{ runId: string; startedAt: string; completedAt: string; classification: string; atomEntryCount: number; parsedActivityCount: number; issueKeys: string[]; entryFingerprintCount: number; missingIssueKeys: string[]; missingEntryFingerprintCount: number }>;
  lowConfidenceObservation: { runId: string; reason: string; missingIssueKeys: string[]; missingEntryCount: number } | null;
};

export type UserActivityTimelineEvent = {
  eventId: string;
  userKey: string;
  displayName: string;
  issueKey: string;
  allIssueKeys: string[];
  eventTime: string;
  eventType: "comment" | "attachment" | "link" | "page" | "field_change" | "status_change" | "assignee_change" | "resolution_change" | "unknown";
  eventTitle: string;
  source: "activity_stream";
  sourceSystem: "jira" | "confluence" | "other" | "unknown";
  sourceDetail: "jira_activity_stream" | "confluence_activity_stream" | "jira_full_fetch" | "jira_changelog" | "related_issue_expansion" | "other_activity_stream" | "unknown";
  activityApplication: string;
  sourceRunId: string;
  sourceConfidence: "high" | "medium" | "low";
  projectKey: string;
  evidence: { activityTypeClassifier: { matchedRule: string; finalType: string }; baselineGuard: { classification: string; retryTriggered: boolean; retryRecovered: boolean; baselineBestParsedActivityCount: number; currentParsedActivityCount: number; entryFingerprintMatched: boolean } };
  rawRef: { entryFingerprint: string; variant: string; activityStreamQueryUser: string };
  rawTitle: string;
  sanitizedSummary: string;
};

export type UserActivityTimelineSummary = {
  timelineRunId: string;
  builtAt: string;
  selectedUser: string;
  dateRange: { start: string; end: string };
  projectScope: string;
  source: "activity_stream";
  sourceRunId: string;
  totalEvents: number;
  issueKeyCount: number;
  primaryIssueKeyCount: number;
  allIssueKeyCount: number;
  eventTypeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  sourceSystemCounts: Record<"jira" | "confluence" | "other" | "unknown", number>;
  sourceDetailCounts: Record<string, number>;
  sourceSystemDiagnostics: { classificationRulesVersion: "v0.2.21"; unknownSamples: Array<{ eventId: string; title: string; activityApplication: string | null; issueKey: string | null; eventType: UserActivityTimelineEvent["eventType"]; reason: string }> };
  confidenceCounts: Record<string, number>;
  baselineGuard: { classification: string; retryTriggered: boolean; retryRecovered: boolean };
  integrity: {
    sourceParsedActivityCount: number; timelineEventCount: number; convertedEventCount: number; skippedEntryCount: number; deduplicatedEntryCount: number;
    sourceParsedIssueKeyCount: number; timelinePrimaryIssueKeyCount: number; timelineAllIssueKeyCount: number;
    sourceIssueKeys: string[]; timelinePrimaryIssueKeys: string[]; timelineAllIssueKeys: string[];
    missingIssueKeysFromTimeline: string[]; missingIssueKeysFromPrimaryTimeline: string[]; eventIdCollisionCount: number;
    skipReasons: Array<{ reason: string; count: number }>; dedupReasons: Array<{ reason: string; count: number }>; warnings: string[];
  };
  eventCountReconciliation: { sourceParsedActivityCount: number; timelineEventCount: number; difference: number; deduplicatedEntryCount: number; skippedEntryCount: number; unexplainedDifferenceCount: number; status: "reconciled" | "unreconciled" };
  dedupDiagnostics: { enabled: boolean; deduplicatedEntryCount: number; dedupGroups: Array<{ eventId: string; keptEntryIndex: number; deduplicatedEntryIndexes: number[]; reason: string; issueKeys: string[]; eventTime: string }> };
  confidenceDiagnostics: { runLevelClassification: string; eventLevelBaselineMatchedCount: number; eventLevelBaselineMissingCount: number; forcedLowDueToRunIncompleteCount: number };
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
  applyClientDateFilter: boolean;
};

export type UserActivityStreamAutoSave = { path: string; savedAt: string; runId: string; resultType: string; status: string; diagnosis: string; parsedActivityCount: number; folderPath: string };

export type UserActivityStreamDateRangeChunking = {
  enabled: boolean;
  requestedMode: "off" | "auto" | "monthly" | "weekly" | "custom_days";
  mode: "off" | "monthly" | "weekly" | "custom_days";
  chunkCount: number;
  chunkSizeDays: number | null;
  requestedDateRange: { start: string; end: string; endExclusive: string; timezone: "Asia/Taipei" };
  largeRangeWarning: boolean;
  chunks: Array<{ chunkIndex: number; chunkStart: string; chunkEndExclusive: string; startEpochMs: number; endEpochMs: number }>;
};

export type UserActivityStreamChunkResult = { chunkIndex: number; chunkStart: string; chunkEndExclusive: string; startEpochMs: number; endEpochMs: number; requestUrlSanitized: string; httpStatus: string; diagnosis: UserActivityStreamDiagnosis; status: string; atomEntryCount: number; parsedActivityCount: number; entriesWithIssueKeyCount: number; confluenceOnlyEntryCount: number; uniqueIssueKeyCount: number; error: string };
export type UserActivityStreamChunkMergeStats = { totalChunkAtomEntries: number; mergedActivityEntries: number; duplicateEntriesRemoved: number; mergedEntriesWithIssueKeyCount: number; mergedConfluenceOnlyEntryCount: number; uniqueIssueKeyCount: number; successfulChunks: number; noEntryChunks: number; failedChunks: number };

export type UserActivityStreamManualDiagnostics = {
  manualUrlProvided: boolean;
  manualUrlAccepted: boolean;
  rejectReason: string;
  requestUrlSanitized: string;
};

export type UserAnalysisPrecisionProbeSummary = {
  overallStatus: "not_run" | "running" | "success" | "partial" | "no_entries" | "failed";
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
  activeTab: "timeline" | "selectIssues" | "queue" | "fetchReport" | "relatedIssues" | "exports" | "candidates";
  workflowSteps: WorkflowStepStatus;
  timelineStatus: "idle" | "running" | "completed" | "failed";
  timelineEvents: UserActivityTimelineEvent[];
  timelineSummary: UserActivityTimelineSummary | null;
  timelineIssueGroups: TimelineIssueGroup[];
  selectedTimelineIssueKeys: string[];
  timelineIssueFilters: { activityTypes: string[]; confidences: string[]; issueKeyRoles: string[]; sourceSystems: Array<"jira" | "confluence" | "other" | "unknown">; projectKeys: string[]; query: string };
  relatedCandidateIssues: RelatedCandidateIssue[];
  selectedRelatedIssueKeys: string[];
  relatedIssueFilters: { relationType: string; confidence: string };
  addedTimelineIssuesToFetchQueueCount: number;
  addedRelatedIssuesToFetchQueueCount: number;
  addedRecommendedRelatedIssuesToFetchQueueCount: number;
  addedOptionalRelatedIssuesToFetchQueueCount: number;
  lastQueueAddSummary: { kind: "timeline" | "recommended" | "optional" | ""; added: number; merged: number; total: number };
  advancedToolsOpen: boolean;
  previousFullFetchOpen: boolean;
  timelineFilters: { project: string; issueKey: string; activityType: string; confidence: string; source: string; onlyWithJiraKey: boolean; onlyLowConfidence: boolean };
  expandedTimelineEvents: string[];
  timelineExportPaths: { jsonPath: string; csvPath: string; summaryPath: string };
  precisionProbeMaxResults: number;
  precisionProbeMaxResultsSource: "custom" | "quick";
  activityStreamDateQueryMode: UserActivityStreamDateQueryMode;
  activityStreamChunkingMode: UserActivityStreamDateRangeChunking["requestedMode"];
  activityStreamCustomChunkDays: number;
  activityStreamDateRangeChunking: UserActivityStreamDateRangeChunking;
  activityStreamChunkResults: UserActivityStreamChunkResult[];
  activityStreamChunkMergeStats: UserActivityStreamChunkMergeStats;
  activityStreamDateSemantics: UserActivityStreamDateSemantics;
  activityStreamDateQueryResults: UserActivityStreamDateQueryResult[];
  activityStreamMaxResultsDiagnostics: UserActivityStreamMaxResultsDiagnostics;
  activityStreamCapTestResults: UserActivityStreamMaxResultsDiagnostics[];
  precisionProjectScope: string;
  activityStreamUser: string;
  activityStreamQueryMode: "auto" | "username" | "escaped_username" | "email" | "custom";
  advancedDiagnosticsOpen: boolean;
  advancedDiagnosticsUsed: boolean;
  standardActivityStreamFlow: UserStandardActivityStreamFlow;
  activityStreamRelativeLinks: boolean;
  manualActivityStreamUrl: string;
  manualActivityStreamResult: UserActivityStreamVariantResult | null;
  manualUrlReplayDiagnostics: UserActivityStreamManualDiagnostics;
  currentActivityStreamRunId: string;
  isActivityStreamRunning: boolean;
  activityStreamRunHistory: UserActivityStreamRunHistory[];
  lastSuccessfulActivityStreamResult: UserActivityStreamResult | null;
  parsedEntriesFilter: UserActivityStreamFilter;
  parsedEntriesPage: number;
  parsedEntriesPageSize: 10 | 20 | 40 | 80 | 160;
  expandedActivityEntries: string[];
  lastAutoSavedResult: UserActivityStreamAutoSave | null;
  lastSuccessfulAutoSavedResult: UserActivityStreamAutoSave | null;
  lastParsedAutoSavedResult: UserActivityStreamAutoSave | null;
  latestNoEntriesAutoSavedResult: UserActivityStreamAutoSave | null;
  autoSavedResultPaths: UserActivityStreamAutoSave[];
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
  selectedUsersText: "roger_hsieh",
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
  activeTab: "timeline",
  workflowSteps: defaultWorkflowSteps(),
  timelineStatus: "idle",
  timelineEvents: [],
  timelineSummary: null,
  timelineIssueGroups: [],
  selectedTimelineIssueKeys: [],
  timelineIssueFilters: { activityTypes: [], confidences: [], issueKeyRoles: [], sourceSystems: ["jira"], projectKeys: [], query: "" },
  relatedCandidateIssues: [],
  selectedRelatedIssueKeys: [],
  relatedIssueFilters: { relationType: "all", confidence: "all" },
  addedTimelineIssuesToFetchQueueCount: 0,
  addedRelatedIssuesToFetchQueueCount: 0,
  addedRecommendedRelatedIssuesToFetchQueueCount: 0,
  addedOptionalRelatedIssuesToFetchQueueCount: 0,
  lastQueueAddSummary: { kind: "", added: 0, merged: 0, total: 0 },
  advancedToolsOpen: false,
  previousFullFetchOpen: false,
  timelineFilters: { project: "", issueKey: "", activityType: "all", confidence: "all", source: "all", onlyWithJiraKey: false, onlyLowConfidence: false },
  expandedTimelineEvents: [],
  timelineExportPaths: { jsonPath: "", csvPath: "", summaryPath: "" },
  precisionProbeMaxResults: 50,
  precisionProbeMaxResultsSource: "quick",
  activityStreamDateQueryMode: "both",
  activityStreamChunkingMode: "auto",
  activityStreamCustomChunkDays: 14,
  activityStreamDateRangeChunking: { enabled: false, requestedMode: "auto", mode: "off", chunkCount: 1, chunkSizeDays: null, requestedDateRange: { start: "2026-07-01", end: "2026-07-07", endExclusive: "2026-07-08", timezone: "Asia/Taipei" }, largeRangeWarning: false, chunks: [] },
  activityStreamChunkResults: [],
  activityStreamChunkMergeStats: { totalChunkAtomEntries: 0, mergedActivityEntries: 0, duplicateEntriesRemoved: 0, mergedEntriesWithIssueKeyCount: 0, mergedConfluenceOnlyEntryCount: 0, uniqueIssueKeyCount: 0, successfulChunks: 0, noEntryChunks: 0, failedChunks: 0 },
  activityStreamDateSemantics: { requestedDateRange: { start: "2026-07-01", end: "2026-07-07", endInclusive: true, timezone: "Asia/Taipei", startEpochMs: 0, endExclusiveEpochMs: 0 }, dateQueryModesTested: [], bestDateQueryMode: "client_side_only", serverDateFilterEffective: "unknown", clientDateFilterApplied: true, rawReturnedEntries: 0, clientDateFilteredEntries: 0, warnings: [] },
  activityStreamDateQueryResults: [],
  activityStreamMaxResultsDiagnostics: { requestedMaxResults: 50, maxResultsSource: "quick", actualAtomEntryCount: 0, parsedActivityCount: 0, serverCapDetected: "unknown", serverCapValueEstimated: null, responseTimeMs: 0, responseSizeKB: 0, largeMaxResultsWarningShown: false, largeMaxResultsConfirmed: false, warnings: [] },
  activityStreamCapTestResults: [],
  precisionProjectScope: "",
  activityStreamUser: "",
  activityStreamQueryMode: "auto",
  advancedDiagnosticsOpen: false,
  advancedDiagnosticsUsed: false,
  standardActivityStreamFlow: { enabled: true, selectedUser: "", activityStreamQueryUser: "", activityStreamQueryUserEncoded: "", variant: "escaped_username", dateQueryMode: "update_date_after_before", chunkingMode: "auto", perChunkMaxResults: 500, advancedOverrideUsed: false },
  activityStreamRelativeLinks: true,
  manualActivityStreamUrl: "",
  manualActivityStreamResult: null,
  manualUrlReplayDiagnostics: { manualUrlProvided: false, manualUrlAccepted: false, rejectReason: "", requestUrlSanitized: "" },
  currentActivityStreamRunId: "",
  isActivityStreamRunning: false,
  activityStreamRunHistory: [],
  lastSuccessfulActivityStreamResult: null,
  parsedEntriesFilter: { activityTypes: [], issueKeyQuery: "", onlyWithIssueKey: false, dateRange: { start: "2026-07-01", end: "2026-07-07" }, variants: [], sources: [], authorQuery: "", applyClientDateFilter: true },
  parsedEntriesPage: 1,
  parsedEntriesPageSize: 40,
  expandedActivityEntries: [],
  lastAutoSavedResult: null,
  lastSuccessfulAutoSavedResult: null,
  lastParsedAutoSavedResult: null,
  latestNoEntriesAutoSavedResult: null,
  autoSavedResultPaths: [],
  activityStream: {
    runId: "",
    status: "not_run",
    overallStatus: "not_run",
    reachable: false,
    supported: "unknown",
    parsed: false,
    diagnosis: "unknown",
    bestVariant: "",
    bestVariantReason: "no_variant_available",
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
    parserDiagnostics: { atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0, entriesWithIssueKeyCount: 0, confluenceOnlyEntryCount: 0, entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0, entriesWithMultipleIssueKeysCount: 0, parserErrorCount: 0, parserErrorsSanitized: [], skippedEntriesSanitized: [], parserAnomaly: false, parserAnomalyReason: "" },
    activityTypeClassifierDiagnostics: { enabled: true, rulesVersion: "1.1", commentPriorityHigherThanAttachment: true, totalEntries: 0, correctedEntryCount: 0, preservedEntryCount: 0, inferredEntryCount: 0, fallbackUnknownCount: 0, matchedRuleCounts: {}, finalTypeCounts: {} },
    activityEntryStats: { totalAtomEntries: 0, parsedActivityEntryCount: 0, parsedIssueActivityCount: 0, entriesWithIssueKeyCount: 0, entriesWithoutIssueKeyCount: 0, confluenceOnlyEntryCount: 0, nonJiraEntryCount: 0, jiraIssueEntryCount: 0, uniqueIssueKeyCount: 0 },
    baselineComparison: { enabled: false, baselineFound: false, snapshotKey: "", classification: "not_run", confidence: "normal", shouldRetry: false, retryReason: "", baselineCounts: { bestAtomEntryCount: 0, bestParsedActivityCount: 0, bestIssueKeyCount: 0, bestEntryFingerprintCount: 0 }, currentCounts: { atomEntryCount: 0, parsedActivityCount: 0, issueKeyCount: 0, entryFingerprintCount: 0 }, missingIssueKeys: [], missingEntryFingerprints: [], newIssueKeys: [], newEntryFingerprints: [], baselineUpdated: false, baselineUpdateReason: "", baselinePath: "" },
    baselineGuardRetry: { triggered: false, maxRetries: 2, attempts: [], finalAcceptedRunId: "", finalClassification: "not_run", baselineUpdated: false, retryRecovered: false },
    baselineGuardAttemptResults: [],
    lowConfidenceObservation: null
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
