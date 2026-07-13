import { Fragment, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, DatabaseZap, Download, Eye, FolderOpen, HelpCircle, Play, RotateCcw, Search, Trash2 } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserAnalysisCandidateIssue, type UserAnalysisFullFetchReportRow } from "../state/SessionStateContext";

const fetchLimitOptions = [10, 20, 40, 80, 160];
const pageSizeOptions = [10, 20, 40, 80, 160];

function parseUsers(input: string) {
  return Array.from(new Set(
    input
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function jqlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function addDays(dateText: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return dateText;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toJqlDateRange(startDate: string, endDate: string) {
  return {
    startInclusive: startDate,
    endExclusive: addDays(endDate, 1)
  };
}

function buildBaseJql(users: string[], startDate: string, endDate: string) {
  if (users.length === 0 || !startDate || !endDate) return "";
  const { startInclusive, endExclusive } = toJqlDateRange(startDate, endDate);
  const userClauses = users.length === 1
    ? [
      `  assignee = ${jqlString(users[0])}`,
      `  OR reporter = ${jqlString(users[0])}`,
      `  OR creator = ${jqlString(users[0])}`
    ]
    : [
      `  assignee in (${users.map(jqlString).join(", ")})`,
      `  OR reporter in (${users.map(jqlString).join(", ")})`,
      `  OR creator in (${users.map(jqlString).join(", ")})`
    ];
  return [
    "(",
    ...userClauses,
    ")",
    `AND updated >= "${startInclusive}"`,
    `AND updated < "${endExclusive}"`,
    "ORDER BY updated DESC, created DESC, key DESC"
  ].join("\n");
}

function formatGeneratedJql(baseJql: string, strategy: string, updatedByStatus: string, dateRange: { start: string; end: string; endExclusive: string }, fallbackReason = "") {
  return [
    "UI Date Range:",
    `${dateRange.start} to ${dateRange.end}`,
    "",
    "JQL Date Range:",
    `updated >= "${dateRange.start}"`,
    `updated < "${dateRange.endExclusive}"`,
    "",
    "End Date Handling:",
    "End date is inclusive in UI and converted to exclusive end date in JQL.",
    "",
    "JQL Strategy:",
    strategy,
    "",
    "updatedBy:",
    updatedByStatus === "disabled" ? "Disabled / Not included in base query" : updatedByStatus,
    fallbackReason ? "" : undefined,
    fallbackReason ? "Fallback reason:" : undefined,
    fallbackReason || undefined,
    "",
    "Generated Base JQL:",
    baseJql
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function stamp() {
  const date = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parentFolder(filePath: string) {
  const index = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  return index > -1 ? filePath.slice(0, index) : "";
}

function sourcePayload(connection: ReturnType<typeof useConnectionContext>["activeConnection"]) {
  return {
    globalDataSourceMode: "live_jira_api",
    source: {
      type: "live_jira_api",
      baseUrl: connection?.baseUrl ?? "",
      apiVersion: connection?.apiVersion ?? "v2",
      authType: connection?.authType ?? "bearer",
      readOnly: true,
      databaseWrite: false,
      attachmentDownload: false,
      token: "[masked]",
      authorization: "[masked]"
    }
  };
}

function issueMatches(issue: UserAnalysisCandidateIssue, keyword: string) {
  if (!keyword.trim()) return true;
  const needle = keyword.trim().toLowerCase();
  return [issue.key, issue.summary, issue.status, issue.assignee, issue.reporter, issue.creator, issue.matchedReason]
    .some((value) => value.toLowerCase().includes(needle));
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 text-2xl font-black text-ink" data-no-clip="true">{value}</div>
    </div>
  );
}

export function AnalysisPage() {
  const { activeConnection } = useConnectionContext();
  const { appendDebugLog, getDebugLogs } = useOutletContext<AppOutletContext>();
  const { userAnalysis, setUserAnalysis } = useSessionState();

  const selectedUsers = useMemo(() => parseUsers(userAnalysis.selectedUsersText), [userAnalysis.selectedUsersText]);
  const currentJqlDateRange = useMemo(
    () => toJqlDateRange(userAnalysis.startDate, userAnalysis.endDate),
    [userAnalysis.endDate, userAnalysis.startDate]
  );
  const generatedBaseJql = userAnalysis.generatedBaseJql || buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate);
  const generatedJql = userAnalysis.generatedJql || formatGeneratedJql(generatedBaseJql, userAnalysis.jqlStrategy, userAnalysis.updatedByStatus, {
    start: userAnalysis.startDate,
    end: userAnalysis.endDate,
    endExclusive: currentJqlDateRange.endExclusive
  });
  const filteredCandidates = userAnalysis.candidateIssues.filter((issue) => issueMatches(issue, userAnalysis.search));
  const pageCount = Math.max(1, Math.ceil(filteredCandidates.length / userAnalysis.pageSize));
  const page = Math.min(userAnalysis.page, pageCount);
  const pagedCandidates = filteredCandidates.slice((page - 1) * userAnalysis.pageSize, page * userAnalysis.pageSize);
  const fetchQueue = userAnalysis.candidateIssues.filter((issue) => userAnalysis.selectedForFetch.includes(issue.key));
  const fetchLimitExceeded = fetchQueue.length > userAnalysis.fetchLimit;
  const filteredFetchReport = userAnalysis.fullFetchReport.filter((row) => userAnalysis.fetchReportFilter === "all" || row.fetchStatus === userAnalysis.fetchReportFilter);
  const fetchReportPageCount = Math.max(1, Math.ceil(filteredFetchReport.length / userAnalysis.fetchReportPageSize));
  const fetchReportPage = Math.min(userAnalysis.fetchReportPage, fetchReportPageCount);
  const pagedFetchReport = filteredFetchReport.slice((fetchReportPage - 1) * userAnalysis.fetchReportPageSize, fetchReportPage * userAnalysis.fetchReportPageSize);
  const hasFullFetchResult = userAnalysis.fullFetchStatus === "completed" || userAnalysis.fullFetchStatus === "completed_with_errors" || userAnalysis.fullFetchStatus === "failed";
  const dateRangeDays = userAnalysis.startDate && userAnalysis.endDate
    ? Math.round((Date.parse(userAnalysis.endDate) - Date.parse(userAnalysis.startDate)) / 86400000) + 1
    : 0;
  const dateRangeWarning = dateRangeDays > 90 ? "Date range is over 90 days. Candidate Discovery may be slow; narrow the range if possible." : "";

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
  }

  function showStep(step: "candidate" | "queue" | "fetchReport" | "exports") {
    patchState({ activeTab: step === "candidate" ? "candidates" : step });
  }

  function toggleReportDetail(issueKey: string) {
    const expanded = new Set(userAnalysis.expandedFetchReportIssues);
    if (expanded.has(issueKey)) expanded.delete(issueKey);
    else expanded.add(issueKey);
    patchState({ expandedFetchReportIssues: Array.from(expanded) });
  }

  function validate() {
    if (selectedUsers.length === 0) return "Please enter at least one user.";
    if (!userAnalysis.startDate || !userAnalysis.endDate) return "Please select start date and end date.";
    if (userAnalysis.startDate > userAnalysis.endDate) return "Start date must be earlier than or equal to end date.";
    return "";
  }

  function handlePreviewJql() {
    const error = validate();
    if (error) {
      patchState({ errors: [error], notice: "" });
      appendDebugLog("analysis", [`[WARN] ${error}`]);
      return;
    }
    const nextJqlDateRange = toJqlDateRange(userAnalysis.startDate, userAnalysis.endDate);
    const nextBaseJql = buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate);
    const nextGeneratedJql = formatGeneratedJql(nextBaseJql, "base search without updatedBy", "disabled", {
      start: userAnalysis.startDate,
      end: userAnalysis.endDate,
      endExclusive: nextJqlDateRange.endExclusive
    });
    const updatedByWarning = "updatedBy search is not enabled in Stage 1 because this Jira instance may not support it.";
    patchState({
      generatedJql: nextGeneratedJql,
      generatedBaseJql: nextBaseJql,
      jqlDateRange: nextJqlDateRange,
      jqlStrategy: "base search without updatedBy",
      updatedByStatus: "disabled",
      errors: [],
      warnings: dateRangeWarning ? [dateRangeWarning, updatedByWarning] : [updatedByWarning],
      notice: "Generated JQL updated."
    });
    appendDebugLog("analysis", [
      `[INFO] Selected users parsed: ${selectedUsers.length}`,
      `[INFO] UI date range: ${userAnalysis.startDate} to ${userAnalysis.endDate}`,
      `[INFO] JQL date range: updated >= "${nextJqlDateRange.startInclusive}" AND updated < "${nextJqlDateRange.endExclusive}"`,
      "[INFO] Search Mode: Standard",
      "[INFO] JQL Strategy: base search without updatedBy",
      "[INFO] updatedBy status: disabled",
      "[INFO] Generated Base JQL:",
      nextBaseJql
    ]);
  }

  async function handleRunDiscovery() {
    const error = validate();
    if (error) {
      patchState({ errors: [error], notice: "" });
      appendDebugLog("analysis", [`[ERROR] ${error}`]);
      return;
    }
    const nextJqlDateRange = toJqlDateRange(userAnalysis.startDate, userAnalysis.endDate);
    const nextBaseJql = buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate);
    const nextGeneratedJql = formatGeneratedJql(nextBaseJql, "base search without updatedBy", "disabled", {
      start: userAnalysis.startDate,
      end: userAnalysis.endDate,
      endExclusive: nextJqlDateRange.endExclusive
    });
    const updatedByWarning = "updatedBy search is not enabled in Stage 1 because this Jira instance may not support it.";
    patchState({
      loading: true,
      errors: [],
      warnings: dateRangeWarning ? [dateRangeWarning, updatedByWarning] : [updatedByWarning],
      generatedJql: nextGeneratedJql,
      generatedBaseJql: nextBaseJql,
      jqlDateRange: nextJqlDateRange,
      jqlStrategy: "base search without updatedBy",
      updatedByStatus: "disabled",
      notice: ""
    });
    appendDebugLog("analysis", [
      "[INFO] User Analysis Stage 1 initialized",
      "[INFO] Data Source Mode: Live Jira API",
      "[INFO] Connection Source: Current .env Jira Connection",
      `[INFO] API Version: ${activeConnection?.apiVersion === "v3" ? "Jira Cloud v3" : "Jira Server/Data Center v2"}`,
      `[INFO] Auth Type: ${activeConnection?.authType === "basic" ? "Basic Auth" : "Bearer Token / PAT"}`,
      "[INFO] Authorization: [masked]",
      `[INFO] Selected users parsed: ${selectedUsers.length}`,
      `[INFO] UI date range: ${userAnalysis.startDate} to ${userAnalysis.endDate}`,
      `[INFO] JQL date range: updated >= "${nextJqlDateRange.startInclusive}" AND updated < "${nextJqlDateRange.endExclusive}"`,
      "[INFO] Search Mode: Standard",
      "[INFO] JQL Strategy: base search without updatedBy",
      "[INFO] updatedBy status: disabled",
      `[INFO] Candidate Safety Limit: ${userAnalysis.candidateSafetyLimit}`,
      `[INFO] Fetch Limit: ${userAnalysis.fetchLimit}`,
      "[INFO] Generated Base JQL:",
      nextBaseJql
    ]);
    try {
      if (!activeConnection) throw new Error("No active Jira connection. Reload .env in Connections first.");
      const response = await window.desktopApp?.userAnalysis?.discoverCandidates?.({
        connection: activeConnection,
        jql: nextBaseJql,
        safetyLimit: userAnalysis.candidateSafetyLimit,
        selectedUsers
      });
      if (!response) throw new Error("Electron User Analysis API is not available.");
      appendDebugLog("analysis", Array.isArray(response.logs) ? response.logs as string[] : []);
      if (!response.ok) {
        const message = String(response.message ?? "Candidate Discovery failed.");
        patchState({
          loading: false,
          errors: [message],
          warnings: dateRangeWarning ? [dateRangeWarning, updatedByWarning] : [updatedByWarning],
          jqlStrategy: String(response.jqlStrategy ?? "base search without updatedBy") as typeof userAnalysis.jqlStrategy,
          updatedByStatus: String(response.updatedByStatus ?? "disabled") as typeof userAnalysis.updatedByStatus,
          rawSearchMetadata: response.metadata ?? null,
          notice: ""
        });
        return;
      }
      const candidates = (Array.isArray(response.candidates) ? response.candidates : []) as UserAnalysisCandidateIssue[];
      const warnings = [...(dateRangeWarning ? [dateRangeWarning] : []), updatedByWarning, ...(Array.isArray(response.warnings) ? response.warnings as string[] : [])];
      patchState({
        loading: false,
        candidateIssues: candidates,
        selectedForFetch: candidates.slice(0, userAnalysis.fetchLimit).map((issue) => issue.key),
        excludedIssues: [],
        activeTab: "candidates",
        page: 1,
        errors: [],
        warnings,
        jqlStrategy: String(response.jqlStrategy ?? "base search without updatedBy") as typeof userAnalysis.jqlStrategy,
        updatedByStatus: String(response.updatedByStatus ?? "disabled") as typeof userAnalysis.updatedByStatus,
        lastDiscoveryAt: new Date().toISOString(),
        rawSearchMetadata: response.metadata ?? null,
        notice: `Candidate Discovery completed: ${candidates.length} issues.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Candidate Discovery failed.";
      patchState({ loading: false, errors: [message], warnings: dateRangeWarning ? [dateRangeWarning, updatedByWarning] : [updatedByWarning], notice: "" });
      appendDebugLog("analysis", [`[ERROR] ${message}`, "[INFO] No database write performed"]);
    }
  }

  function toggleIssue(issueKey: string, checked: boolean) {
    setUserAnalysis((current) => {
      const selected = new Set(current.selectedForFetch);
      const excluded = new Set(current.excludedIssues);
      if (checked) {
        selected.add(issueKey);
        excluded.delete(issueKey);
      } else {
        selected.delete(issueKey);
        excluded.add(issueKey);
      }
      return { ...current, selectedForFetch: Array.from(selected), excludedIssues: Array.from(excluded) };
    });
  }

  function removeFromQueue(issueKey: string) {
    toggleIssue(issueKey, false);
  }

  function clearSession() {
    setUserAnalysis((current) => ({
      ...current,
      generatedJql: "",
      generatedBaseJql: "",
      jqlDateRange: {
        startInclusive: "",
        endExclusive: ""
      },
      jqlStrategy: "base search without updatedBy",
      updatedByStatus: "disabled",
      candidateIssues: [],
      selectedForFetch: [],
      excludedIssues: [],
      activeTab: "candidates",
      page: 1,
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
      fetchReportPage: 1,
      fetchReportPageSize: 40,
      fetchReportFilter: "all",
      lastSavedFullFetchResultPath: "",
      lastSavedFullFetchRawDataPath: "",
      rawSearchMetadata: null,
      loading: false,
      saving: false,
      notice: "Candidate session cleared."
    }));
    appendDebugLog("analysis", ["[INFO] User Analysis candidate session cleared"]);
  }

  function exportPayload() {
    return {
      exportType: "user-analysis-candidate-result",
      app: {
        name: "Jira Activity Analyzer",
        version: buildInfo.version.replace(/^v/, ""),
        buildTime: buildInfo.buildTime,
        gitCommit: buildInfo.gitCommit,
        gitBranch: buildInfo.gitBranch
      },
      exportedAt: new Date().toISOString(),
      ...sourcePayload(activeConnection),
      selectedUsers,
      dateRange: {
        start: userAnalysis.startDate,
        end: userAnalysis.endDate,
        endInclusive: true
      },
      jqlDateRange: userAnalysis.jqlDateRange.startInclusive ? userAnalysis.jqlDateRange : currentJqlDateRange,
      searchMode: userAnalysis.searchMode,
      jqlStrategy: userAnalysis.jqlStrategy,
      generatedJql,
      generatedBaseJql,
      updatedByStatus: userAnalysis.updatedByStatus,
      candidateSafetyLimit: userAnalysis.candidateSafetyLimit,
      fetchLimit: userAnalysis.fetchLimit,
      candidateIssues: userAnalysis.candidateIssues,
      selectedForFetch: fetchQueue,
      excludedIssues: userAnalysis.excludedIssues,
      warnings: userAnalysis.warnings,
      errors: userAnalysis.errors,
      debugLogSanitized: getDebugLogs("analysis")
    };
  }

  function rawDataPayload() {
    return {
      exportType: "user-analysis-candidate-raw-data",
      app: {
        name: "Jira Activity Analyzer",
        version: buildInfo.version.replace(/^v/, ""),
        buildTime: buildInfo.buildTime,
        gitCommit: buildInfo.gitCommit,
        gitBranch: buildInfo.gitBranch
      },
      exportedAt: new Date().toISOString(),
      ...sourcePayload(activeConnection),
      selectedUsers,
      dateRange: {
        start: userAnalysis.startDate,
        end: userAnalysis.endDate,
        endInclusive: true
      },
      jqlDateRange: userAnalysis.jqlDateRange.startInclusive ? userAnalysis.jqlDateRange : currentJqlDateRange,
      generatedJql,
      generatedBaseJql,
      jqlStrategy: userAnalysis.jqlStrategy,
      updatedByStatus: userAnalysis.updatedByStatus,
      searchRequest: {
        method: "GET",
        endpoint: activeConnection?.apiVersion === "v3" ? "/rest/api/3/search" : "/rest/api/2/search",
        fields: ["key", "summary", "status", "assignee", "reporter", "creator", "updated", "created", "issuetype", "priority", "project"],
        candidateSafetyLimit: userAnalysis.candidateSafetyLimit
      },
      searchRequestMetadata: userAnalysis.rawSearchMetadata,
      rawSearchResponsesSanitized: userAnalysis.rawSearchMetadata ? [userAnalysis.rawSearchMetadata] : [],
      rawSearchMetadataSanitized: userAnalysis.rawSearchMetadata,
      pagination: {
        page: userAnalysis.page,
        pageSize: userAnalysis.pageSize,
        totalCandidates: userAnalysis.candidateIssues.length
      },
      debugLogSanitized: getDebugLogs("analysis")
    };
  }

  async function handleRunFullFetch() {
    if (fetchQueue.length === 0) {
      patchState({ errors: ["Please select issues from Candidate Issues before running Full Fetch."], notice: "" });
      appendDebugLog("analysis", ["[WARN] Please select issues from Candidate Issues before running Full Fetch."]);
      return;
    }
    if (fetchLimitExceeded) {
      const confirmed = window.confirm(`Selected issues exceed fetch limit ${userAnalysis.fetchLimit}. Full Fetch may take longer and call many Jira API endpoints. Continue?`);
      if (!confirmed) {
        appendDebugLog("analysis", ["[INFO] Full Fetch canceled before start"]);
        return;
      }
    }
    if (userAnalysis.fullFetchRunId) {
      appendDebugLog("analysis", ["[INFO] Previous full fetch session replaced."]);
    }
    patchState({
      fullFetchStatus: "running",
      fullFetchStartedAt: new Date().toISOString(),
      fullFetchFinishedAt: "",
      fullFetchRunId: "",
      fullFetchReport: [],
      fullFetchResultsByIssue: [],
      fullFetchRawDataByIssueSanitized: null,
      fullFetchWarnings: [],
      fullFetchErrors: [],
      fetchReportPage: 1,
      activeTab: "fetchReport",
      errors: [],
      notice: "Full Fetch running..."
    });
    try {
      if (!activeConnection) throw new Error("No active Jira connection. Reload .env in Connections first.");
      const response = await window.desktopApp?.userAnalysis?.fullFetch?.({
        connection: activeConnection,
        fetchQueue,
        fetchLimit: userAnalysis.fetchLimit
      });
      if (!response) throw new Error("Electron User Analysis Full Fetch API is not available.");
      appendDebugLog("analysis", Array.isArray(response.logs) ? response.logs as string[] : []);
      const run = (response.run ?? {}) as Record<string, unknown>;
      const status = String(run.status ?? (response.ok ? "completed" : "failed")) as typeof userAnalysis.fullFetchStatus;
      patchState({
        fullFetchRunId: String(run.runId ?? ""),
        fullFetchStartedAt: String(run.startedAt ?? ""),
        fullFetchFinishedAt: String(run.finishedAt ?? new Date().toISOString()),
        fullFetchStatus: status,
        fullFetchSummary: response.summary as typeof userAnalysis.fullFetchSummary,
        fullFetchReport: (Array.isArray(response.fetchReport) ? response.fetchReport : []) as UserAnalysisFullFetchReportRow[],
        fullFetchResultsByIssue: Array.isArray(response.issueResults) ? response.issueResults : [],
        fullFetchRawDataByIssueSanitized: response.rawData ?? null,
        fullFetchWarnings: Array.isArray(response.warnings) ? response.warnings as string[] : [],
        fullFetchErrors: Array.isArray(response.errors) ? response.errors as string[] : [],
        errors: Array.isArray(response.errors) ? response.errors as string[] : [],
        warnings: [...userAnalysis.warnings, ...(Array.isArray(response.warnings) ? response.warnings as string[] : [])],
        notice: `Full Fetch ${status}: ${(response.summary as Record<string, unknown> | undefined)?.success ?? 0} success, ${(response.summary as Record<string, unknown> | undefined)?.failed ?? 0} failed.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Full Fetch failed.";
      patchState({
        fullFetchStatus: "failed",
        fullFetchFinishedAt: new Date().toISOString(),
        fullFetchErrors: [message],
        errors: [message],
        notice: ""
      });
      appendDebugLog("analysis", [`[ERROR] Full Fetch failed: ${message}`, "[INFO] No database write performed"]);
    }
  }

  function fullFetchResultPayload() {
    return {
      exportType: "user-analysis-full-fetch-result",
      app: {
        name: "Jira Activity Analyzer",
        version: buildInfo.version.replace(/^v/, ""),
        buildTime: buildInfo.buildTime,
        gitCommit: buildInfo.gitCommit,
        gitBranch: buildInfo.gitBranch
      },
      exportedAt: new Date().toISOString(),
      ...sourcePayload(activeConnection),
      stage: "user-analysis-stage-2-full-fetch",
      selectedUsers,
      dateRange: {
        start: userAnalysis.startDate,
        end: userAnalysis.endDate,
        endInclusive: true
      },
      jqlDateRange: userAnalysis.jqlDateRange.startInclusive ? userAnalysis.jqlDateRange : currentJqlDateRange,
      generatedBaseJql,
      candidateIssuesCount: userAnalysis.candidateIssues.length,
      selectedForFetch: fetchQueue,
      fetchQueueCount: fetchQueue.length,
      fullFetchRun: {
        runId: userAnalysis.fullFetchRunId,
        startedAt: userAnalysis.fullFetchStartedAt,
        finishedAt: userAnalysis.fullFetchFinishedAt,
        status: userAnalysis.fullFetchStatus,
        executionMode: "sequential"
      },
      summary: userAnalysis.fullFetchSummary,
      fetchReport: userAnalysis.fullFetchReport,
      issueResults: userAnalysis.fullFetchResultsByIssue,
      warnings: userAnalysis.fullFetchWarnings,
      errors: userAnalysis.fullFetchErrors,
      debugLogSanitized: getDebugLogs("analysis")
    };
  }

  function fullFetchRawDataPayload() {
    const rawData = (userAnalysis.fullFetchRawDataByIssueSanitized ?? {}) as Record<string, unknown>;
    return {
      exportType: "user-analysis-full-fetch-raw-data",
      app: {
        name: "Jira Activity Analyzer",
        version: buildInfo.version.replace(/^v/, ""),
        buildTime: buildInfo.buildTime,
        gitCommit: buildInfo.gitCommit,
        gitBranch: buildInfo.gitBranch
      },
      exportedAt: new Date().toISOString(),
      ...sourcePayload(activeConnection),
      requestContext: {
        selectedUsers,
        dateRange: {
          start: userAnalysis.startDate,
          end: userAnalysis.endDate,
          endInclusive: true
        },
        jqlDateRange: userAnalysis.jqlDateRange.startInclusive ? userAnalysis.jqlDateRange : currentJqlDateRange,
        fetchQueue
      },
      rawIssueResponsesSanitized: Array.isArray(rawData.rawIssueResponsesSanitized) ? rawData.rawIssueResponsesSanitized : [],
      rawCommentResponsesSanitized: Array.isArray(rawData.rawCommentResponsesSanitized) ? rawData.rawCommentResponsesSanitized : [],
      endpointMetadata: Array.isArray(rawData.endpointMetadata) ? rawData.endpointMetadata : [],
      warnings: userAnalysis.fullFetchWarnings,
      errors: userAnalysis.fullFetchErrors
    };
  }

  async function saveFullFetchResult(raw = false) {
    patchState({ saving: true, notice: "" });
    try {
      const result = await window.desktopApp?.userAnalysis?.saveExport?.({
        category: raw ? "raw-data" : "user-analysis",
        defaultFileName: raw ? `user-analysis-full-fetch-raw-${stamp()}.json` : `user-analysis-full-fetch-${stamp()}.json`,
        data: raw ? fullFetchRawDataPayload() : fullFetchResultPayload()
      });
      if (!result) throw new Error("Electron export API is not available.");
      if (result.canceled) {
        patchState({ saving: false, notice: "Save canceled.", errors: [] });
        appendDebugLog("analysis", [raw ? "[INFO] Save Full Fetch Raw Data canceled" : "[INFO] Save Full Fetch Result canceled"]);
        return;
      }
      patchState({
        saving: false,
        notice: `Saved to: ${result.filePath}`,
        errors: [],
        lastSavedFullFetchResultPath: raw ? userAnalysis.lastSavedFullFetchResultPath : result.filePath ?? "",
        lastSavedFullFetchRawDataPath: raw ? result.filePath ?? "" : userAnalysis.lastSavedFullFetchRawDataPath,
        lastSavedExportFolderPath: result.folderPath ?? userAnalysis.lastSavedExportFolderPath
      });
      appendDebugLog("analysis", [
        raw ? `[INFO] Full fetch raw data saved: ${result.filePath}` : `[INFO] Full fetch result saved: ${result.filePath}`,
        "[INFO] Export data sanitized"
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      patchState({ saving: false, errors: [message], notice: "" });
      appendDebugLog("analysis", [raw ? `[ERROR] Save Full Fetch Raw Data failed: ${message}` : `[ERROR] Save Full Fetch Result failed: ${message}`]);
    }
  }

  async function saveCandidateResult(raw = false) {
    patchState({ saving: true, notice: "" });
    try {
      const result = await window.desktopApp?.userAnalysis?.saveExport?.({
        category: raw ? "raw-data" : "user-analysis",
        defaultFileName: raw ? `user-analysis-candidates-raw-${stamp()}.json` : `user-analysis-candidates-${stamp()}.json`,
        data: raw ? rawDataPayload() : exportPayload()
      });
      if (!result) throw new Error("Electron export API is not available.");
      if (result.canceled) {
        patchState({ saving: false, notice: "Save canceled.", errors: [] });
        appendDebugLog("analysis", [raw ? "[INFO] Save Candidate Raw Data canceled" : "[INFO] Save Candidate Result canceled"]);
        return;
      }
      patchState({
        saving: false,
        notice: `Saved to: ${result.filePath}`,
        errors: [],
        lastSavedCandidateResultPath: raw ? userAnalysis.lastSavedCandidateResultPath : result.filePath ?? "",
        lastSavedCandidateRawDataPath: raw ? result.filePath ?? "" : userAnalysis.lastSavedCandidateRawDataPath,
        lastSavedExportFolderPath: result.folderPath ?? userAnalysis.lastSavedExportFolderPath
      });
      appendDebugLog("analysis", [
        raw ? `[INFO] Candidate raw data saved: ${result.filePath}` : `[INFO] Candidate result saved: ${result.filePath}`,
        "[INFO] Export data sanitized"
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      patchState({ saving: false, errors: [message], notice: "" });
      appendDebugLog("analysis", [raw ? `[ERROR] Save Candidate Raw Data failed: ${message}` : `[ERROR] Save Candidate Result failed: ${message}`]);
    }
  }

  async function openSavedFolder(kind: "result" | "raw" | "fullResult" | "fullRaw") {
    const filePath = kind === "result"
      ? userAnalysis.lastSavedCandidateResultPath
      : kind === "raw"
        ? userAnalysis.lastSavedCandidateRawDataPath
        : kind === "fullResult"
          ? userAnalysis.lastSavedFullFetchResultPath
          : userAnalysis.lastSavedFullFetchRawDataPath;
    const folderPath = parentFolder(filePath);
    if (!folderPath) return;
    try {
      const result = await window.desktopApp?.userAnalysis?.openExportFolder?.({ folderPath });
      if (!result) throw new Error("Electron open folder API is not available.");
      const label = kind === "result" ? "candidate result" : kind === "raw" ? "candidate raw data" : kind === "fullResult" ? "full fetch result" : "full fetch raw data";
      patchState({ notice: result.ok ? `Opened ${label} folder: ${result.folderPath}` : `Open ${label} folder failed: ${result.error}`, errors: result.ok ? [] : [result.error ?? `Open ${label} folder failed.`] });
      const successLog = kind === "fullResult"
        ? `[INFO] Full fetch result folder opened: ${result.folderPath}`
        : kind === "fullRaw"
          ? `[INFO] Full fetch raw data folder opened: ${result.folderPath}`
          : `[INFO] Candidate ${kind === "result" ? "result" : "raw data"} folder opened: ${result.folderPath}`;
      appendDebugLog("analysis", [result.ok ? successLog : `[ERROR] Open ${label} folder failed: ${result.error}`]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Open export folder failed.";
      patchState({ errors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] Open export folder failed: ${message}`]);
    }
  }

  async function copySavedPath(kind: "result" | "raw" | "fullResult" | "fullRaw") {
    const filePath = kind === "result"
      ? userAnalysis.lastSavedCandidateResultPath
      : kind === "raw"
        ? userAnalysis.lastSavedCandidateRawDataPath
        : kind === "fullResult"
          ? userAnalysis.lastSavedFullFetchResultPath
          : userAnalysis.lastSavedFullFetchRawDataPath;
    if (!filePath) return;
    try {
      await navigator.clipboard.writeText(filePath);
      const notice = kind === "result" ? "Candidate result path copied." : kind === "raw" ? "Candidate raw data path copied." : kind === "fullResult" ? "Full fetch result path copied." : "Full fetch raw data path copied.";
      const log = kind === "result" ? "[INFO] Candidate result path copied" : kind === "raw" ? "[INFO] Candidate raw data path copied" : kind === "fullResult" ? "[INFO] Full fetch result path copied" : "[INFO] Full fetch raw data path copied";
      patchState({ notice, errors: [] });
      appendDebugLog("analysis", [log]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copy path failed.";
      patchState({ errors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] Copy path failed: ${message}`]);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="使用者分析" subtitle="User Analysis" />
      <div className="mb-4 flex min-w-0 flex-wrap gap-2">
        <label className="btn cursor-pointer" title="Show or hide contextual guidance">
          <input className="h-4 w-4" type="checkbox" checked={userAnalysis.showHelpTips} onChange={(event) => patchState({ showHelpTips: event.target.checked })} />
          {userAnalysis.showHelpTips ? "Hide Help Tips / 隱藏操作說明" : "Show Help Tips / 顯示操作說明"}
        </label>
        <button className="btn" type="button" onClick={() => patchState({ helpOpen: !userAnalysis.helpOpen })}>
          <HelpCircle size={16} />Help / 使用說明
        </button>
      </div>
      {userAnalysis.showHelpTips ? <p className="mb-4 text-xs font-semibold leading-relaxed text-muted">Turn on contextual help for each User Analysis step.<br />開啟每個使用者分析步驟的操作說明。</p> : null}
      <p className="mb-4 max-w-3xl text-sm font-semibold leading-relaxed text-muted">
        Find Jira issues touched by selected users in a date range. Stage 1 discovers candidate issues and prepares a fetch queue for Stage 2.<br />
        依選定使用者與日期範圍搜尋相關 Jira，第一階段建立候選清單與抓取佇列，供第二階段完整抓取使用。
      </p>

      <SectionCard className="mb-4">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["candidate", "1", "Candidate Search", "候選搜尋"],
            ["queue", "2", "Fetch Queue", "抓取佇列"],
            ["fetchReport", "3", "Full Fetch Report", "完整抓取報告"],
            ["exports", "4", "Exports", "匯出"]
          ].map(([step, number, title, subtitle]) => {
            const tab = step === "candidate" ? "candidates" : step;
            const active = userAnalysis.activeTab === tab;
            return <button key={step} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition ${active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-line bg-slate-50 hover:border-blue-300 hover:bg-blue-50"}`} type="button" aria-current={active ? "step" : undefined} onClick={() => showStep(step as "candidate" | "queue" | "fetchReport" | "exports")}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black ${active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>{number}</span>
              <span className="min-w-0 text-sm font-black leading-snug text-ink">{title}<br /><span className="text-xs font-semibold text-muted">{subtitle}</span></span>
            </button>;
          })}
        </div>
      </SectionCard>

      {userAnalysis.helpOpen ? (
        <SectionCard title="User Analysis workflow" subtitle="使用者分析流程" className="mb-4">
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-blue-50 p-3 text-sm leading-relaxed"><b>1. Candidate Search / 候選搜尋</b><br />Search Jira issues by users and date range.<br />依使用者與日期範圍搜尋候選 Jira。</div>
            <div className="rounded-lg bg-violet-50 p-3 text-sm leading-relaxed"><b>2. Fetch Queue / 抓取佇列</b><br />Select issues that should be fully fetched.<br />選擇要完整抓取的 Jira。</div>
            <div className="rounded-lg bg-emerald-50 p-3 text-sm leading-relaxed"><b>3. Full Fetch Report / 完整抓取報告</b><br />Review fetch status, counts, warnings, and errors.<br />檢查抓取狀態、數量統計、警告與錯誤。</div>
            <div className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed"><b>4. Exports / 匯出</b><br />Save Stage 1 candidate data or Stage 2 full fetch data.<br />儲存第一階段候選資料或第二階段完整抓取資料。</div>
          </div>
          <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">
            Stage 1 Candidate Result / 第一階段候選結果:<br />exports/user-analysis/user-analysis-candidates-YYYYMMDD_HHmmss.json<br /><br />
            Stage 1 Candidate Raw Data / 第一階段候選 Raw Data:<br />exports/raw-data/user-analysis-candidates-raw-YYYYMMDD_HHmmss.json<br /><br />
            Stage 2 Full Fetch Result / 第二階段完整抓取結果:<br />exports/user-analysis/user-analysis-full-fetch-YYYYMMDD_HHmmss.json<br /><br />
            Stage 2 Full Fetch Raw Data / 第二階段完整抓取 Raw Data:<br />exports/raw-data/user-analysis-full-fetch-raw-YYYYMMDD_HHmmss.json
          </div>
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-relaxed text-emerald-900">
            <b>Safety / 安全性</b><br />This tool uses read-only Jira API during Candidate Discovery and Full Fetch. / 本工具在候選搜尋與完整抓取時只使用唯讀 Jira API。<br />It does not write to Jira or the local database. / 不會寫入 Jira 或本地資料庫。<br />It does not download attachment file bodies. / 不會下載附件本體。<br />Tokens and Authorization values are masked in debug logs and exports. / Debug Log 與匯出檔會遮蔽 token 與 Authorization。
          </div>
        </SectionCard>
      ) : null}

      {userAnalysis.activeTab === "candidates" ? <>
      <SectionCard title="Data Source Mode" subtitle="資料來源模式" className="mb-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-5">
          {[
            ["Data Source Mode", "Live Jira API"],
            ["Connection Source", "Current .env Jira Connection"],
            ["API Version", activeConnection?.apiVersion === "v3" ? "Jira Cloud v3" : "Jira Server/Data Center v2"],
            ["Read-only", "Yes"],
            ["Database Write", "No"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs font-black uppercase text-blue-700">{label}</div>
              <div className="mt-1 break-words text-sm font-black leading-snug text-blue-950" data-no-clip="true">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-relaxed text-slate-700">
          Candidate Discovery will use read-only Jira JQL search. Local Database mode is disabled for User Analysis.
        </div>
      </SectionCard>

      <SectionCard id="candidate-search" title="Candidate Search" subtitle="候選搜尋" className="mb-4">
        {userAnalysis.showHelpTips ? <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Use this step to search for Jira issues related to selected users and date range.<br />本步驟用來依使用者與日期範圍搜尋可能相關的 Jira。<br /><br /><b>Result / 結果：</b><br />This only creates a candidate issue list. Full comments, attachments, and changelog are not fully fetched yet.<br />這裡只會產生候選 Jira 清單，尚不會完整抓取 comments、attachments、changelog。</div> : null}
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <FieldLabel label="Selected Users" sub="選擇使用者" />
            <textarea
              className="field min-h-28 resize-y leading-relaxed"
              value={userAnalysis.selectedUsersText}
              placeholder={"roger_hsieh\nch_kao\nsomeone@phison.com"}
              onChange={(event) => patchState({ selectedUsersText: event.target.value })}
            />
            <div className="mt-2 flex min-w-0 flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <span key={user} className="chip" title={user}><span className="truncate">{user}</span></span>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <FieldLabel label="Start Date" sub="開始日期" />
              <input className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} />
            </div>
            <div>
              <FieldLabel label="End Date" sub="結束日期" />
              <input className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} />
            </div>
            <div>
              <FieldLabel label="Search Mode" sub="搜尋模式" />
              <select className="field" value="standard" disabled>
                <option>Standard - assignee OR reporter OR creator</option>
              </select>
            </div>
            <div>
              <FieldLabel label="Candidate Safety Limit" sub="候選安全上限" />
              <input className="field" value={userAnalysis.candidateSafetyLimit} readOnly />
            </div>
            <div>
              <FieldLabel label="Fetch Limit" sub="抓取上限" />
              <select className="field" value={userAnalysis.fetchLimit} onChange={(event) => patchState({ fetchLimit: Number(event.target.value) })}>
                {fetchLimitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="rounded-lg border border-line bg-white p-3 text-xs font-semibold leading-relaxed text-muted">
              updatedBy is disabled in Stage 1. Exact updatedBy actor requires Stage 2 Full Fetch.<br />第一階段不使用 updatedBy；精確的更新者資訊需由第二階段完整抓取取得。
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn" type="button" onClick={handlePreviewJql}><Eye size={16} />Preview JQL / 預覽 JQL</button>
          <button className="btn btn-primary" type="button" onClick={handleRunDiscovery} disabled={userAnalysis.loading}>
            <Play size={16} />{userAnalysis.loading ? "Running / 執行中..." : "Run Candidate Discovery / 執行候選搜尋"}
          </button>
          <button className="btn" type="button" onClick={clearSession}><RotateCcw size={16} />Clear Candidate Session / 清除候選工作階段</button>
        </div>
      </SectionCard>

      <SectionCard title="Generated JQL" subtitle="產生的 JQL" className="mb-4">
        {userAnalysis.showHelpTips ? <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">This JQL is used only for read-only candidate discovery. / 此 JQL 只用於唯讀候選 Jira 搜尋。<br />The generated JQL does not use updatedBy because the current Jira Server/Data Center may not support it. / 產生的 JQL 不使用 updatedBy，因為目前 Jira Server/Data Center 可能不支援該條件。</div> : null}
        <pre className="thin-scroll max-h-72 min-w-0 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-slate-950 p-4 text-xs font-semibold leading-relaxed text-slate-100">
          {generatedJql || "Preview JQL to generate a Standard search query."}
        </pre>
      </SectionCard>

      {(userAnalysis.errors.length > 0 || userAnalysis.warnings.length > 0 || fetchLimitExceeded || userAnalysis.notice) ? (
        <div className="mb-4 space-y-2">
          {userAnalysis.errors.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{item}</div>)}
          {userAnalysis.warnings.map((item) => <div key={item} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{item}</div>)}
          {fetchLimitExceeded ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">Selected issues exceed fetch limit {userAnalysis.fetchLimit}. Stage 2 Full Fetch will require confirmation.</div> : null}
          {userAnalysis.notice ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">{userAnalysis.notice}</div> : null}
        </div>
      ) : null}

      <div className="mb-4 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Candidate Issues / 候選 Jira" value={userAnalysis.candidateIssues.length} />
        <MiniStat label="Fetch Queue / 抓取佇列" value={fetchQueue.length} />
        <MiniStat label="Fetch Limit / 抓取上限" value={userAnalysis.fetchLimit} />
        <MiniStat label="Safety Limit / 安全上限" value={userAnalysis.candidateSafetyLimit} />
      </div>
      <div className="mb-4 flex justify-end">
        <button className="btn btn-primary" type="button" onClick={() => showStep("queue")} disabled={userAnalysis.candidateIssues.length === 0}><DatabaseZap size={16} />Go to Fetch Queue / 前往抓取佇列</button>
      </div>
      </> : null}

      {userAnalysis.activeTab === "queue" ? (
        <SectionCard title="Candidate Issues" subtitle="候選 Jira" className="mb-4">
          {userAnalysis.showHelpTips ? <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Select candidate issues and add them to the Fetch Queue before running Full Fetch.<br />請先從候選 Jira 中選擇要分析的項目，加入抓取佇列後再執行完整抓取。<br />Only issues in the Fetch Queue will be processed by Full Fetch. / 只有抓取佇列中的 Jira 會被完整抓取。</div> : null}
          <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px_220px]">
            <div className="relative min-w-0"><Search className="absolute left-3 top-3 text-muted" size={16} /><input className="field pl-9" value={userAnalysis.search} placeholder="Filter candidates / 篩選候選 Jira..." onChange={(event) => patchState({ search: event.target.value, page: 1 })} /></div>
            <select className="field" value={userAnalysis.pageSize} onChange={(event) => patchState({ pageSize: Number(event.target.value), page: 1 })}>{pageSizeOptions.map((option) => <option key={option} value={option}>{option} rows / 筆</option>)}</select>
            <div className="flex items-center justify-end gap-2 text-sm font-bold text-muted">Page / 頁 {page} / {pageCount}</div>
          </div>
          <ResponsiveTableContainer>
            <table className="table min-w-[1160px]"><thead><tr>{["Selected / 選取", "Issue Key / Jira 編號", "Summary / 摘要", "Status / 狀態", "Assignee / 負責人", "Reporter / 回報者", "Creator / 建立者", "Updated / 更新時間", "Matched Reason / 符合原因"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>{pagedCandidates.map((issue) => <tr key={issue.key}>
                <td><input type="checkbox" checked={userAnalysis.selectedForFetch.includes(issue.key)} onChange={(event) => toggleIssue(issue.key, event.target.checked)} aria-label={`Add ${issue.key} to Fetch Queue`} /></td>
                <td><button className="font-black text-blue-700" type="button" onClick={() => toggleIssue(issue.key, !userAnalysis.selectedForFetch.includes(issue.key))}>{issue.key}</button></td>
                <td><span className="block max-w-[340px] truncate" title={issue.summary} data-allow-truncate="true">{issue.summary}</span></td><td><StatusBadge>{issue.status}</StatusBadge></td>
                <td><span className="block max-w-[160px] truncate" title={issue.assignee} data-allow-truncate="true">{issue.assignee}</span></td><td><span className="block max-w-[160px] truncate" title={issue.reporter} data-allow-truncate="true">{issue.reporter}</span></td><td><span className="block max-w-[160px] truncate" title={issue.creator} data-allow-truncate="true">{issue.creator}</span></td><td>{issue.updated}</td><td><span className="block max-w-[280px] truncate" title={issue.matchedReason} data-allow-truncate="true">{issue.matchedReason}</span></td>
              </tr>)}{pagedCandidates.length === 0 ? <tr><td colSpan={9} className="text-center text-muted">No candidate issues / 尚無候選 Jira</td></tr> : null}</tbody>
            </table>
          </ResponsiveTableContainer>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-semibold text-muted">Showing / 顯示 {pagedCandidates.length} of / 共 {filteredCandidates.length}</div><div className="flex flex-wrap gap-2"><button className="btn" type="button" disabled={userAnalysis.selectedForFetch.length === 0} onClick={() => patchState({ notice: `${userAnalysis.selectedForFetch.length} issue(s) added to Fetch Queue.`, errors: [] })}><DatabaseZap size={15} />Add to Fetch Queue / 加入抓取佇列</button><button className="btn px-3 py-2" type="button" disabled={page <= 1} onClick={() => patchState({ page: page - 1 })}>Prev / 上一頁</button><button className="btn px-3 py-2" type="button" disabled={page >= pageCount} onClick={() => patchState({ page: page + 1 })}>Next / 下一頁</button></div></div>
        </SectionCard>
      ) : null}

      {(userAnalysis.activeTab === "queue" || userAnalysis.activeTab === "fetchReport") ? <SectionCard
        id="stage-results"
        title={userAnalysis.activeTab === "queue" ? "Fetch Queue Items" : "Full Fetch Report"}
        subtitle={userAnalysis.activeTab === "queue" ? "抓取佇列項目" : "完整抓取報告"}
      >
        {false ? (
          <>
            <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px_220px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-3 text-muted" size={16} />
                <input className="field pl-9" value={userAnalysis.search} placeholder="Filter issue key, summary, assignee, reporter, creator..." onChange={(event) => patchState({ search: event.target.value, page: 1 })} />
              </div>
              <select className="field" value={userAnalysis.pageSize} onChange={(event) => patchState({ pageSize: Number(event.target.value), page: 1 })}>
                {pageSizeOptions.map((option) => <option key={option} value={option}>{option} rows / 筆</option>)}
              </select>
              <div className="flex items-center justify-end gap-2 text-sm font-bold text-muted">
                Page {page} / {pageCount}
              </div>
            </div>
            <ResponsiveTableContainer>
              <table className="table min-w-[1160px]">
                <thead>
                  <tr>
                    {["Selected", "Issue Key", "Summary", "Status", "Assignee", "Reporter", "Creator", "Updated", "Matched Reason"].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pagedCandidates.map((issue) => (
                    <tr key={issue.key}>
                      <td><input type="checkbox" checked={userAnalysis.selectedForFetch.includes(issue.key)} onChange={(event) => toggleIssue(issue.key, event.target.checked)} /></td>
                      <td><button className="font-black text-blue-700" type="button" onClick={() => toggleIssue(issue.key, !userAnalysis.selectedForFetch.includes(issue.key))}>{issue.key}</button></td>
                      <td><span className="block max-w-[340px] truncate" title={issue.summary} data-allow-truncate="true">{issue.summary}</span></td>
                      <td><StatusBadge>{issue.status}</StatusBadge></td>
                      <td><span className="block max-w-[160px] truncate" title={issue.assignee} data-allow-truncate="true">{issue.assignee}</span></td>
                      <td><span className="block max-w-[160px] truncate" title={issue.reporter} data-allow-truncate="true">{issue.reporter}</span></td>
                      <td><span className="block max-w-[160px] truncate" title={issue.creator} data-allow-truncate="true">{issue.creator}</span></td>
                      <td>{issue.updated}</td>
                      <td><span className="block max-w-[280px] truncate" title={issue.matchedReason} data-allow-truncate="true">{issue.matchedReason}</span></td>
                    </tr>
                  ))}
                  {pagedCandidates.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-muted">No candidate issues yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-muted">Showing {pagedCandidates.length} of {filteredCandidates.length} filtered candidates.</div>
              <div className="flex gap-2">
                <button className="btn px-3 py-2" type="button" disabled={page <= 1} onClick={() => patchState({ page: page - 1 })}>Prev</button>
                <button className="btn px-3 py-2" type="button" disabled={page >= pageCount} onClick={() => patchState({ page: page + 1 })}>Next</button>
              </div>
            </div>
          </>
        ) : userAnalysis.activeTab === "queue" ? (
          <>
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">
              <b>Fetch Queue / 抓取佇列</b><br />Only issues in the Fetch Queue will be processed by Full Fetch. / 只有抓取佇列中的 Jira 會被完整抓取。
            </div>
            <ResponsiveTableContainer>
              <table className="table min-w-[980px]">
                <thead>
                  <tr>
                    {["Issue Key / Jira 編號", "Summary / 摘要", "Status / 狀態", "Assignee / 負責人", "Updated / 更新時間", "Matched Reason / 符合原因", "Remove / 移除"].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {fetchQueue.map((issue) => (
                    <tr key={issue.key}>
                      <td className="font-black text-blue-700">{issue.key}</td>
                      <td><span className="block max-w-[360px] truncate" title={issue.summary} data-allow-truncate="true">{issue.summary}</span></td>
                      <td><StatusBadge>{issue.status}</StatusBadge></td>
                      <td><span className="block max-w-[180px] truncate" title={issue.assignee} data-allow-truncate="true">{issue.assignee}</span></td>
                      <td>{issue.updated}</td>
                      <td><span className="block max-w-[300px] truncate" title={issue.matchedReason} data-allow-truncate="true">{issue.matchedReason}</span></td>
                      <td><button className="btn px-3 py-2" type="button" onClick={() => removeFromQueue(issue.key)}><Trash2 size={14} />Remove / 移除</button></td>
                    </tr>
                  ))}
                  {fetchQueue.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted">No issues selected for Fetch Queue. / 抓取佇列中尚無 Jira。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold leading-relaxed text-muted">
              {userAnalysis.showHelpTips ? <><b>Run Full Fetch / 執行完整抓取</b><br />Run Full Fetch reads issue fields, changelog, comments, attachments metadata, issue links, and parsed users.<br />完整抓取會讀取 issue 欄位、changelog、comments、attachments metadata、issue links 與使用者資訊。<br /><br /><b>Safety / 安全性：</b> Read-only Jira API only. No database write, no Jira write, and no attachment body download.<br />只使用唯讀 Jira API，不寫入資料庫、不寫入 Jira，也不下載附件本體。</> : <>This will fetch full read-only data for all issues currently in the Fetch Queue. / 這會依目前抓取佇列執行唯讀完整抓取。</>}
            </div>
            <button className="btn btn-primary mt-3" type="button" onClick={() => void handleRunFullFetch()} disabled={fetchQueue.length === 0 || userAnalysis.fullFetchStatus === "running"} title="Run a sequential read-only fetch for the current queue">
              <Play size={16} />{userAnalysis.fullFetchStatus === "running" ? "Running Full Fetch / 完整抓取中..." : hasFullFetchResult ? "Re-run Full Fetch from Queue / 依佇列重新完整抓取" : "Run Full Fetch from Queue / 依佇列執行完整抓取"}
            </button>
            {hasFullFetchResult ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><span>Full Fetch completed. Go to Full Fetch Report to review results.<br />完整抓取已完成。請前往完整抓取報告檢視結果。</span><button className="btn" type="button" onClick={() => showStep("fetchReport")}>Go to Full Fetch Report / 前往完整抓取報告</button></div> : null}
          </>
        ) : (
          <>
            {userAnalysis.showHelpTips ? <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Review fetch status, counts, warnings, and errors for each fetched Jira issue.<br />檢查每張已抓取 Jira 的抓取狀態、統計數量、警告與錯誤。<br />Use View Detail / 查看詳細 to inspect HTTP status, changelog count, issue links, parsed users, and last fetched time.<br />使用 View Detail / 查看詳細 可檢查 HTTP 狀態、changelog 數量、issue links、parsed users 與最後抓取時間。</div> : null}
            <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
              <select className="field" value={userAnalysis.fetchReportFilter} onChange={(event) => patchState({ fetchReportFilter: event.target.value as typeof userAnalysis.fetchReportFilter, fetchReportPage: 1 })}>
                <option value="all">All / 全部</option>
                <option value="success">Success / 成功</option>
                <option value="failed">Failed / 失敗</option>
              </select>
              <select className="field" value={userAnalysis.fetchReportPageSize} onChange={(event) => patchState({ fetchReportPageSize: Number(event.target.value), fetchReportPage: 1 })}>
                {pageSizeOptions.map((option) => <option key={option} value={option}>{option} rows / 筆</option>)}
              </select>
              <div className="flex items-center justify-end gap-2 text-sm font-bold text-muted">
                Page / 頁 {fetchReportPage} / {fetchReportPageCount}
              </div>
            </div>
            <div className="mb-3 grid min-w-0 grid-cols-2 gap-3 md:grid-cols-5">
              <MiniStat label="Total Issues / Jira 總數" value={userAnalysis.fullFetchSummary.totalIssues} />
              <MiniStat label="Success / 成功" value={userAnalysis.fullFetchSummary.success} />
              <MiniStat label="Failed / 失敗" value={userAnalysis.fullFetchSummary.failed} />
              <MiniStat label="Comments / 留言" value={userAnalysis.fullFetchSummary.totalComments} />
              <MiniStat label="Events / 估算事件" value={userAnalysis.fullFetchSummary.totalEstimatedEvents} />
            </div>
            <ResponsiveTableContainer>
              <table className="table min-w-[940px]">
                <thead>
                  <tr>
                    {["Issue Key / Jira 編號", "Summary / 摘要", "Fetch Status / 抓取狀態", "Comments / 留言", "Attachments / 附件 Metadata", "Events / 估算事件", "Duration / 耗時", "Detail / 詳細"].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pagedFetchReport.map((row) => (
                    <Fragment key={`${row.issueKey}-${row.lastFetchedAt}`}>
                    <tr>
                      <td className="font-black text-blue-700">{row.issueKey}</td>
                      <td><span className="block max-w-[320px] truncate" title={row.summary} data-allow-truncate="true">{row.summary}</span></td>
                      <td><StatusBadge>{row.fetchStatus}</StatusBadge></td>
                      <td data-no-clip="true">{row.comments}</td>
                      <td data-no-clip="true">{row.attachmentsMetadata}</td>
                      <td data-no-clip="true">{row.estimatedEvents}</td>
                      <td data-no-clip="true">{row.duration}</td>
                      <td><button className="btn px-3 py-2" type="button" onClick={() => toggleReportDetail(row.issueKey)}>{userAnalysis.expandedFetchReportIssues.includes(row.issueKey) ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{userAnalysis.expandedFetchReportIssues.includes(row.issueKey) ? "Hide Detail / 隱藏詳細" : "View Detail / 查看詳細"}</button></td>
                    </tr>
                    {userAnalysis.expandedFetchReportIssues.includes(row.issueKey) ? <tr><td colSpan={8} className="whitespace-normal bg-slate-50">
                      <div className="grid min-w-0 grid-cols-2 gap-3 p-2 md:grid-cols-4">
                        <MiniStat label="HTTP Status / HTTP 狀態" value={row.httpStatus || "-"} />
                        <MiniStat label="Changelog Histories / 歷史數" value={row.changelogHistories} />
                        <MiniStat label="Changelog Items / 項目數" value={row.changelogItems} />
                        <MiniStat label="Issue Links / 數量" value={row.issueLinks} />
                        <MiniStat label="Parsed Users / 解析使用者數" value={row.parsedUsers} />
                        <div className="col-span-2 rounded-lg border border-line bg-white p-3 text-sm"><b>Error / Warning / 錯誤與警告</b><div className="mt-1 break-words text-muted">{row.error || "-"}</div></div>
                        <div className="rounded-lg border border-line bg-white p-3 text-sm"><b>Last Fetched At / 最後抓取時間</b><div className="mt-1 text-muted">{row.lastFetchedAt || "-"}</div></div>
                      </div>
                    </td></tr> : null}
                    </Fragment>
                  ))}
                  {pagedFetchReport.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted">No Fetch Report yet. Run Full Fetch from the Fetch Queue. / 尚無抓取報告，請先從抓取佇列執行完整抓取。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-muted">Showing / 顯示 {pagedFetchReport.length} of / 共 {filteredFetchReport.length} fetch report rows / 筆抓取報告。</div>
              <div className="flex gap-2">
                <button className="btn px-3 py-2" type="button" disabled={fetchReportPage <= 1} onClick={() => patchState({ fetchReportPage: fetchReportPage - 1 })}>Prev / 上一頁</button>
                <button className="btn px-3 py-2" type="button" disabled={fetchReportPage >= fetchReportPageCount} onClick={() => patchState({ fetchReportPage: fetchReportPage + 1 })}>Next / 下一頁</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold text-muted"><span>This will replace the current Full Fetch session result.<br />這會取代目前的完整抓取工作階段結果。</span><button className="btn" type="button" onClick={() => void handleRunFullFetch()} disabled={fetchQueue.length === 0 || userAnalysis.fullFetchStatus === "running"}><Play size={15} />Re-run Full Fetch from Queue / 依佇列重新完整抓取</button></div>
          </>
        )}
      </SectionCard> : null}

      {userAnalysis.activeTab === "exports" ? <div id="analysis-exports" className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Stage 1 Candidate Export" subtitle="第一階段候選資料匯出">
          {userAnalysis.showHelpTips ? <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Candidate exports are Stage 1 outputs. They contain candidate issue lists and search context, but not full comments, attachments, or changelog.<br />候選匯出是第一階段輸出，包含候選 Jira 清單與搜尋條件，但不包含完整 comments、attachments 或 changelog。<br /><br />Raw Data contains more original Jira response data and is mainly for debugging. / Raw Data 包含較完整的 Jira 原始回應資料，主要用於除錯與深入分析。</div> : null}
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" type="button" onClick={() => void saveCandidateResult(false)} disabled={userAnalysis.saving}>
              <Download size={16} />Save Candidate Result / 儲存候選結果
            </button>
            <button className="btn" type="button" onClick={() => void saveCandidateResult(true)} disabled={userAnalysis.saving}>
              <Download size={16} />Save Candidate Raw Data / 儲存候選 Raw Data
            </button>
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3">
            <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
              <div className="text-xs font-black uppercase text-muted">Last Saved Candidate Result</div>
              <div className="mt-1 break-all text-sm font-bold text-ink" title={userAnalysis.lastSavedCandidateResultPath || "Not saved yet"}>
                {userAnalysis.lastSavedCandidateResultPath || "Not saved yet"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedCandidateResultPath} onClick={() => void openSavedFolder("result")}>
                  <FolderOpen size={15} />Open Result Folder / 開啟結果資料夾
                </button>
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedCandidateResultPath} onClick={() => void copySavedPath("result")}>
                  <Copy size={15} />Copy Result Path / 複製結果路徑
                </button>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
              <div className="text-xs font-black uppercase text-muted">Last Saved Candidate Raw Data</div>
              <div className="mt-1 break-all text-sm font-bold text-ink" title={userAnalysis.lastSavedCandidateRawDataPath || "Not saved yet"}>
                {userAnalysis.lastSavedCandidateRawDataPath || "Not saved yet"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedCandidateRawDataPath} onClick={() => void openSavedFolder("raw")}>
                  <FolderOpen size={15} />Open Raw Data Folder / 開啟 Raw Data 資料夾
                </button>
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedCandidateRawDataPath} onClick={() => void copySavedPath("raw")}>
                  <Copy size={15} />Copy Raw Data Path / 複製 Raw Data 路徑
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 text-sm font-semibold leading-relaxed text-muted">
            Exports include globalDataSourceMode, masked source metadata, generatedJql, generatedBaseJql, jqlStrategy, updatedByStatus, candidateIssues, selectedForFetch, warnings, errors, and sanitized debug logs.
          </div>
        </SectionCard>
        <SectionCard title="Stage 2 Full Fetch Export" subtitle="第二階段完整抓取資料匯出">
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">
              Full Fetch exports are Stage 2 outputs and should be used for later analysis.<br />完整抓取匯出是第二階段輸出，後續分析請優先使用這份資料。
            </div>
            {fetchQueue.length === 0 ? (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-800">
                <AlertTriangle className="mt-0.5 shrink-0" size={17} />
                <span>Please select issues from Candidate Issues before running Full Fetch.</span>
              </div>
            ) : null}
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <MiniStat label="Total Issues" value={userAnalysis.fullFetchSummary.totalIssues || fetchQueue.length} />
              <MiniStat label="Pending" value={userAnalysis.fullFetchSummary.pending} />
              <MiniStat label="Running" value={userAnalysis.fullFetchStatus === "running" ? 1 : userAnalysis.fullFetchSummary.running} />
              <MiniStat label="Success" value={userAnalysis.fullFetchSummary.success} />
              <MiniStat label="Failed" value={userAnalysis.fullFetchSummary.failed} />
              <MiniStat label="Skipped" value={userAnalysis.fullFetchSummary.skipped} />
              <MiniStat label="Comments" value={userAnalysis.fullFetchSummary.totalComments} />
              <MiniStat label="Attachments" value={userAnalysis.fullFetchSummary.totalAttachmentsMetadata} />
              <MiniStat label="Changelog" value={userAnalysis.fullFetchSummary.totalChangelogHistories} />
              <MiniStat label="Events" value={userAnalysis.fullFetchSummary.totalEstimatedEvents} />
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">
              Execution Mode: Sequential read-only fetch. One issue is fetched at a time.
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" type="button" onClick={() => void saveFullFetchResult(false)} disabled={!hasFullFetchResult || userAnalysis.saving}>
                <Download size={16} />Save Full Fetch Result / 儲存完整抓取結果
              </button>
              <button className="btn" type="button" onClick={() => void saveFullFetchResult(true)} disabled={!hasFullFetchResult || userAnalysis.saving}>
                <Download size={16} />Save Full Fetch Raw Data / 儲存完整抓取 Raw Data
              </button>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3">
              <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-muted">Last Saved Full Fetch Result</div>
                <div className="mt-1 break-all text-sm font-bold text-ink" title={userAnalysis.lastSavedFullFetchResultPath || "Not saved yet"}>
                  {userAnalysis.lastSavedFullFetchResultPath || "Not saved yet"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedFullFetchResultPath} onClick={() => void openSavedFolder("fullResult")}>
                    <FolderOpen size={15} />Open Full Fetch Result Folder / 開啟完整抓取結果資料夾
                  </button>
                  <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedFullFetchResultPath} onClick={() => void copySavedPath("fullResult")}>
                    <Copy size={15} />Copy Full Fetch Result Path / 複製完整抓取結果路徑
                  </button>
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-muted">Last Saved Full Fetch Raw Data</div>
                <div className="mt-1 break-all text-sm font-bold text-ink" title={userAnalysis.lastSavedFullFetchRawDataPath || "Not saved yet"}>
                  {userAnalysis.lastSavedFullFetchRawDataPath || "Not saved yet"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedFullFetchRawDataPath} onClick={() => void openSavedFolder("fullRaw")}>
                    <FolderOpen size={15} />Open Full Fetch Raw Data Folder / 開啟完整抓取 Raw Data 資料夾
                  </button>
                  <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedFullFetchRawDataPath} onClick={() => void copySavedPath("fullRaw")}>
                    <Copy size={15} />Copy Full Fetch Raw Data Path / 複製完整抓取 Raw Data 路徑
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div> : null}
    </div>
  );
}
