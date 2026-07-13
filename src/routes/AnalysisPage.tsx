import { Fragment, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, DatabaseZap, Download, Eye, FolderOpen, HelpCircle, PauseCircle, Play, RotateCcw, Search, Trash2 } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel, MockModal } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserAnalysisCandidateIssue, type UserAnalysisFullFetchMemory, type UserAnalysisFullFetchProgress, type UserAnalysisFullFetchReportRow } from "../state/SessionStateContext";

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

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "-";
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean).join(" ");
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
  const hasFullFetchResult = userAnalysis.fullFetchStatus === "paused" || userAnalysis.fullFetchStatus === "completed" || userAnalysis.fullFetchStatus === "completed_with_errors" || userAnalysis.fullFetchStatus === "failed";
  const dateRangeDays = userAnalysis.startDate && userAnalysis.endDate
    ? Math.round((Date.parse(userAnalysis.endDate) - Date.parse(userAnalysis.startDate)) / 86400000) + 1
    : 0;
  const dateRangeWarning = dateRangeDays > 90 ? "Date range is over 90 days. Candidate Discovery may be slow; narrow the range if possible." : "";
  const fullFetchCompletedCount = userAnalysis.fullFetchProgress.success + userAnalysis.fullFetchProgress.failed + userAnalysis.fullFetchProgress.skipped;
  const fullFetchProgressPercent = userAnalysis.fullFetchProgress.total > 0
    ? Math.min(100, Math.round((fullFetchCompletedCount / userAnalysis.fullFetchProgress.total) * 100))
    : 0;
  const connectionReady = Boolean(window.desktopApp?.uiSmoke || (activeConnection?.baseUrl && activeConnection?.apiToken));
  const fullFetchDisabledReason = fetchQueue.length === 0
    ? "Fetch Queue is empty / 抓取佇列是空的"
    : userAnalysis.fullFetchStatus === "running"
      ? "Full Fetch is already running / 完整抓取正在執行中"
      : !connectionReady
        ? "Connection is not ready / Jira 連線尚未就緒"
        : "";
  const candidateSaveDisabledReason = userAnalysis.candidateIssues.length === 0 ? "No candidate result yet / 尚無候選結果" : "";
  const fullFetchSaveDisabledReason = userAnalysis.fullFetchStatus === "running"
    ? "Full Fetch is running / 完整抓取正在執行中"
    : !hasFullFetchResult
      ? "No Full Fetch result yet / 尚無完整抓取結果"
      : "";

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
  }

  function logAnalysisAction(category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO", message: string) {
    appendDebugLog("analysis", [`[${category}] ${message}`]);
    void window.desktopApp?.userAnalysis?.logAction?.({ category, message }).then((result) => {
      if (!result?.actionLogPath) return;
      setUserAnalysis((current) => ({
        ...current,
        actionLogPath: result.actionLogPath ?? current.actionLogPath,
        actionLogAvailable: result.actionLogAvailable ?? current.actionLogAvailable
      }));
    });
  }

  useEffect(() => {
    let active = true;
    void window.desktopApp?.userAnalysis?.actionLogDiagnostics?.().then((diagnostics) => {
      if (active) {
        patchState({ actionLogPath: diagnostics.actionLogPath, actionLogAvailable: diagnostics.actionLogAvailable });
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const subscribe = window.desktopApp?.userAnalysis?.onFullFetchProgress;
    if (!subscribe) return;
    return subscribe((payload) => {
      const progress = payload as unknown as UserAnalysisFullFetchProgress;
      setUserAnalysis((current) => ({
        ...current,
        fullFetchStatus: progress.status === "paused"
          ? "paused"
          : progress.status === "completed"
            ? "completed"
            : progress.status === "failed" || progress.status === "crashed"
              ? "failed"
              : "running",
        fullFetchRunId: progress.runId || current.fullFetchRunId,
        fullFetchProgress: progress,
        fullFetchMemory: progress.memory ?? current.fullFetchMemory,
        autoLogPath: progress.autoLogPath || current.autoLogPath,
        checkpointPath: progress.checkpointPath || current.checkpointPath,
        pauseAfterCurrentIssue: current.pauseAfterCurrentIssue && progress.status !== "paused"
      }));
    });
  }, [setUserAnalysis]);

  useEffect(() => {
    if (!window.desktopApp?.uiSmoke) return;
    const seedLargeQueue = (event: Event) => {
      const count = Math.max(41, Number((event as CustomEvent<{ count?: number }>).detail?.count ?? 41));
      const issues: UserAnalysisCandidateIssue[] = Array.from({ length: count }, (_, index) => ({
        id: `smoke-${index + 1}`,
        key: `SMOKE-${index + 1}`,
        summary: `UI smoke candidate ${index + 1}`,
        status: "Open",
        assignee: "smoke.user",
        reporter: "smoke.user",
        creator: "smoke.user",
        updated: "2026-07-13 12:00:00",
        created: "2026-07-13 12:00:00",
        issueType: "Task",
        priority: "Medium",
        project: "SMOKE",
        matchedReason: "UI smoke test"
      }));
      setUserAnalysis((current) => ({ ...current, candidateIssues: issues, selectedForFetch: issues.map((issue) => issue.key), excludedIssues: [], activeTab: "queue" }));
    };
    const churnDebugLog = () => {
      appendDebugLog("analysis", Array.from({ length: 220 }, (_, index) => `[PROGRESS] Retention smoke progress ${index + 1}/220`));
    };
    window.addEventListener("jaa:seed-large-queue", seedLargeQueue);
    window.addEventListener("jaa:churn-debug-log", churnDebugLog);
    return () => {
      window.removeEventListener("jaa:seed-large-queue", seedLargeQueue);
      window.removeEventListener("jaa:churn-debug-log", churnDebugLog);
    };
  }, [appendDebugLog, setUserAnalysis]);

  useEffect(() => {
    const subscribe = window.desktopApp?.userAnalysis?.onFullFetchLog;
    if (!subscribe) return;
    return subscribe((line) => appendDebugLog("analysis", [line]));
  }, [appendDebugLog]);

  useEffect(() => {
    let active = true;
    void window.desktopApp?.userAnalysis?.latestFullFetchCheckpoint?.().then((result) => {
      if (!active || !result?.unfinished) return;
      setUserAnalysis((current) => ({
        ...current,
        previousUnfinishedRun: { ...(result.checkpoint ?? {}), checkpointPath: result.checkpointPath ?? "" },
        previousUnfinishedDismissed: false
      }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [setUserAnalysis]);

  function showStep(step: "candidate" | "queue" | "fetchReport" | "exports") {
    const labels = {
      candidate: "Candidate Search / 候選搜尋",
      queue: "Fetch Queue / 抓取佇列",
      fetchReport: "Full Fetch Report / 完整抓取報告",
      exports: "Exports / 匯出"
    };
    logAnalysisAction("USER_ACTION", `Workflow tab changed: ${labels[step]}`);
    patchState({ activeTab: step === "candidate" ? "candidates" : step });
  }

  function toggleReportDetail(issueKey: string) {
    const expanded = new Set(userAnalysis.expandedFetchReportIssues);
    if (expanded.has(issueKey)) {
      logAnalysisAction("USER_ACTION", `Hide Detail clicked / 隱藏詳細: issueKey=${issueKey}`);
      expanded.delete(issueKey);
    } else {
      logAnalysisAction("USER_ACTION", `View Detail clicked / 查看詳細: issueKey=${issueKey}`);
      expanded.add(issueKey);
    }
    patchState({ expandedFetchReportIssues: Array.from(expanded) });
  }

  function validate() {
    if (selectedUsers.length === 0) return "Please enter at least one user.";
    if (!userAnalysis.startDate || !userAnalysis.endDate) return "Please select start date and end date.";
    if (userAnalysis.startDate > userAnalysis.endDate) return "Start date must be earlier than or equal to end date.";
    return "";
  }

  function handlePreviewJql() {
    logAnalysisAction("USER_ACTION", "Button clicked: Preview JQL / 預覽 JQL");
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
    logAnalysisAction("USER_ACTION", "Button clicked: Run Candidate Discovery / 執行候選搜尋");
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
    logAnalysisAction("USER_ACTION", `${checked ? "Candidate selected / 候選 Jira 已選取" : "Candidate unselected / 候選 Jira 取消選取"}: ${issueKey}`);
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
    logAnalysisAction("USER_ACTION", `Remove from Fetch Queue clicked / 從抓取佇列移除: ${issueKey}`);
    toggleIssue(issueKey, false);
  }

  function selectAllCandidates() {
    const keys = filteredCandidates.map((issue) => issue.key);
    logAnalysisAction("USER_ACTION", `Select all candidates clicked / 全選候選 Jira: selectedCount=${keys.length}`);
    patchState({ selectedForFetch: keys, excludedIssues: [], notice: `${keys.length} candidate(s) selected.` });
  }

  function clearSelection() {
    logAnalysisAction("USER_ACTION", `Clear selection clicked / 清除選取: previousCount=${userAnalysis.selectedForFetch.length}`);
    patchState({ selectedForFetch: [], excludedIssues: userAnalysis.candidateIssues.map((issue) => issue.key), notice: "Selection cleared." });
  }

  function addSelectedToFetchQueue() {
    logAnalysisAction("USER_ACTION", `Add to Fetch Queue clicked / 加入抓取佇列: selectedCount=${userAnalysis.selectedForFetch.length}`);
    patchState({ notice: `${userAnalysis.selectedForFetch.length} issue(s) added to Fetch Queue.`, errors: [] });
  }

  function clearFetchQueue() {
    logAnalysisAction("USER_ACTION", `Clear Fetch Queue clicked / 清除抓取佇列: previousCount=${fetchQueue.length}`);
    patchState({ selectedForFetch: [], excludedIssues: userAnalysis.candidateIssues.map((issue) => issue.key), notice: "Fetch Queue cleared. / 抓取佇列已清除。" });
  }

  function fetchQueueRuntimeStatus(issueKey: string) {
    const tracked = userAnalysis.fullFetchProgress.issueStatus.find((item) => item.issueKey === issueKey);
    if (tracked) return tracked.status;
    const completed = userAnalysis.fullFetchReport.find((item) => item.issueKey === issueKey);
    return completed?.fetchStatus ?? "pending";
  }

  function clearSession() {
    logAnalysisAction("USER_ACTION", "Button clicked: Clear Candidate Session / 清除候選工作階段");
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
      fullFetchProgress: {
        ...current.fullFetchProgress,
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
        issueStatus: []
      },
      fullFetchMemory: { rssMB: 0, heapUsedMB: 0, heapTotalMB: 0, externalMB: 0, systemFreeMB: 0, rawDataEstimateMB: 0 },
      autoLogPath: "",
      checkpointPath: "",
      pauseAfterCurrentIssue: false,
      largeQueueConfirmationOpen: false,
      largeQueueConfirmInput: "",
      largeQueueConfirmError: "",
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

  async function handleRunFullFetchClick() {
    logAnalysisAction("USER_ACTION", "Button clicked: Run Full Fetch from Queue / 依佇列執行完整抓取");
    logAnalysisAction("USER_ACTION", `Context: queueCount=${fetchQueue.length} batchSize=${userAnalysis.batchSize} rawDataMode=${userAnalysis.rawDataMode} activeStep=${userAnalysis.activeTab}`);
    if (fullFetchDisabledReason) {
      logAnalysisAction("GUARD", `Action blocked: reason=${fullFetchDisabledReason} queueCount=${fetchQueue.length}`);
      return;
    }
    if (fetchQueue.length > 40) {
      logAnalysisAction("GUARD", `Large queue confirmation required: queueCount=${fetchQueue.length} threshold=40`);
      logAnalysisAction("UI_MODAL", "Large queue confirmation opened / 大量抓取確認已開啟");
      patchState({ largeQueueConfirmationOpen: true, largeQueueConfirmInput: "", largeQueueConfirmError: "" });
      return;
    }
    await runFullFetch();
  }

  function handleLargeQueueConfirmationCancel() {
    logAnalysisAction("USER_ACTION", "Large queue confirmation cancelled / 大量抓取確認已取消");
    logAnalysisAction("GUARD", "Full Fetch cancelled before start by user");
    logAnalysisAction("INFO", "Full Fetch cancelled before start / 完整抓取已在開始前取消");
    logAnalysisAction("UI_MODAL", "Large queue confirmation closed / 大量抓取確認已關閉");
    patchState({ largeQueueConfirmationOpen: false, largeQueueConfirmInput: "", largeQueueConfirmError: "" });
  }

  function handleLargeQueueConfirmationInput(value: string) {
    logAnalysisAction("USER_ACTION", `Large queue confirmation input changed: confirmInputMatched=${value.trim() === "CONFIRM"}`);
    patchState({ largeQueueConfirmInput: value, largeQueueConfirmError: "" });
  }

  async function handleLargeQueueConfirmationSubmit() {
    const matched = userAnalysis.largeQueueConfirmInput.trim() === "CONFIRM";
    logAnalysisAction("USER_ACTION", `Large queue confirmation submitted: confirmInputMatched=${matched}`);
    if (!matched) {
      logAnalysisAction("GUARD", "Large queue confirmation rejected: input did not match CONFIRM");
      patchState({ largeQueueConfirmError: "Please type CONFIRM exactly. / 請正確輸入 CONFIRM。" });
      return;
    }
    logAnalysisAction("GUARD", "Large queue confirmed by user");
    logAnalysisAction("USER_ACTION", "Large queue confirmation confirmed / 大量抓取已確認");
    logAnalysisAction("UI_MODAL", "Large queue confirmation closed / 大量抓取確認已關閉");
    logAnalysisAction("INFO", "Full Fetch started after large queue confirmation");
    patchState({ largeQueueConfirmationOpen: false, largeQueueConfirmInput: "", largeQueueConfirmError: "" });
    if (window.desktopApp?.uiSmoke) {
      patchState({ notice: "Large queue confirmation smoke path passed. / 大量抓取確認測試路徑通過。" });
      return;
    }
    await runFullFetch();
  }

  async function runFullFetch() {
    if (userAnalysis.rawDataMode === "full_raw_in_memory" && fetchQueue.length > 20) {
      const confirmed = window.confirm("Full Raw in Memory with more than 20 issues can use substantial memory and increase crash risk. Continue?");
      logAnalysisAction("USER_ACTION", `Full Raw in Memory risk confirmation: confirmed=${confirmed}`);
      if (!confirmed) {
        logAnalysisAction("GUARD", "Full Fetch cancelled before start: full_raw_in_memory_risk_not_confirmed");
        return;
      }
    } else if (userAnalysis.rawDataMode === "full_raw_in_memory" && fetchQueue.length > 10) {
      appendDebugLog("analysis", ["[WARN] Full Raw in Memory selected for more than 10 issues"]);
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
      fullFetchProgress: {
        ...userAnalysis.fullFetchProgress,
        status: "running",
        total: fetchQueue.length,
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
        batchSize: userAnalysis.batchSize === "all" ? fetchQueue.length : userAnalysis.batchSize,
        currentBatch: 0,
        totalBatches: userAnalysis.batchSize === "all" ? 1 : Math.ceil(fetchQueue.length / userAnalysis.batchSize),
        rawDataMode: userAnalysis.rawDataMode,
        issueStatus: []
      },
      fullFetchMemory: { rssMB: 0, heapUsedMB: 0, heapTotalMB: 0, externalMB: 0, systemFreeMB: 0, rawDataEstimateMB: 0 },
      autoLogPath: "",
      checkpointPath: "",
      pauseAfterCurrentIssue: false,
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
        fetchLimit: userAnalysis.fetchLimit,
        batchSize: userAnalysis.batchSize,
        rawDataMode: userAnalysis.rawDataMode
      });
      if (!response) throw new Error("Electron User Analysis Full Fetch API is not available.");
      const run = (response.run ?? {}) as Record<string, unknown>;
      const diagnostics = (response.diagnostics ?? run.diagnostics ?? {}) as Record<string, unknown>;
      const finalMemory = (diagnostics.finalMemory ?? {}) as UserAnalysisFullFetchMemory;
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
        fullFetchMemory: finalMemory.rssMB === undefined ? userAnalysis.fullFetchMemory : finalMemory,
        autoLogPath: String(diagnostics.autoLogPath ?? ""),
        checkpointPath: String(diagnostics.checkpointPath ?? ""),
        pauseAfterCurrentIssue: false,
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

  async function handlePauseFullFetch() {
    logAnalysisAction("USER_ACTION", "Button clicked: Pause After Current Issue / 當前 Jira 完成後暫停");
    patchState({ pauseAfterCurrentIssue: true, notice: "Pause requested. The current issue will finish first. / 已要求暫停，將先完成目前 Jira。" });
    const result = await window.desktopApp?.userAnalysis?.pauseFullFetch?.();
    if (!result?.ok) {
      patchState({ pauseAfterCurrentIssue: false, errors: [result?.message ?? "Pause request failed."] });
      return;
    }
    appendDebugLog("analysis", ["[INFO] Pause requested; waiting for current issue to complete"]);
  }

  async function openDiagnosticsFolder(filePath = userAnalysis.autoLogPath || userAnalysis.checkpointPath) {
    logAnalysisAction("USER_ACTION", "Open Log Folder clicked / 開啟 Log 資料夾");
    const result = await window.desktopApp?.userAnalysis?.openDiagnosticsFolder?.({ filePath });
    patchState(result?.ok
      ? { notice: `Opened diagnostics folder: ${result.folderPath}`, errors: [] }
      : { notice: "", errors: [result?.error ?? "Open diagnostics folder failed."] });
  }

  async function copyDiagnosticsPath(filePath: string) {
    logAnalysisAction("USER_ACTION", "Copy diagnostics path clicked / 複製診斷路徑");
    if (!filePath) return;
    await navigator.clipboard.writeText(filePath);
    patchState({ notice: "Diagnostics path copied. / 已複製診斷路徑。", errors: [] });
  }

  async function openActionLogFolder() {
    logAnalysisAction("USER_ACTION", "Open Action Log Folder clicked / 開啟使用者操作紀錄資料夾");
    if (window.desktopApp?.uiSmoke) {
      patchState({ notice: "Action log folder smoke path passed. / 使用者操作紀錄資料夾測試通過。", errors: [] });
      return;
    }
    const result = await window.desktopApp?.userAnalysis?.openDiagnosticsFolder?.({ filePath: userAnalysis.actionLogPath });
    patchState(result?.ok
      ? { notice: `Opened action log folder: ${result.folderPath}`, errors: [] }
      : { notice: "", errors: [result?.error ?? "Open action log folder failed."] });
  }

  async function copyActionLogPath() {
    logAnalysisAction("USER_ACTION", "Copy Action Log Path clicked / 複製使用者操作紀錄路徑");
    if (!userAnalysis.actionLogPath) return;
    if (window.desktopApp?.uiSmoke) {
      patchState({ notice: "Action log copy smoke path passed. / 使用者操作紀錄路徑複製測試通過。", errors: [] });
      return;
    }
    try {
      await navigator.clipboard.writeText(userAnalysis.actionLogPath);
      patchState({ notice: "Action log path copied. / 已複製使用者操作紀錄路徑。", errors: [] });
    } catch (error) {
      patchState({ notice: "", errors: [error instanceof Error ? error.message : "Copy action log path failed."] });
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
        executionMode: "sequential",
        batchSize: userAnalysis.batchSize,
        rawDataMode: userAnalysis.rawDataMode,
        progress: userAnalysis.fullFetchProgress,
        memory: userAnalysis.fullFetchMemory,
        autoLogPath: userAnalysis.autoLogPath,
        checkpointPath: userAnalysis.checkpointPath
      },
      fullFetchDiagnostics: {
        autoLogPath: userAnalysis.autoLogPath,
        checkpointPath: userAnalysis.checkpointPath,
        batchSize: userAnalysis.batchSize,
        rawDataMode: userAnalysis.rawDataMode,
        memory: userAnalysis.fullFetchMemory
      },
      actionLogDiagnostics: {
        actionLogPath: userAnalysis.actionLogPath,
        actionLogAvailable: userAnalysis.actionLogAvailable,
        actionLogNote: "USER_ACTION / GUARD / UI_MODAL are persisted separately to avoid UI debug buffer truncation."
      },
      summary: userAnalysis.fullFetchSummary,
      fetchReport: userAnalysis.fullFetchReport,
      issueResults: userAnalysis.fullFetchResultsByIssue,
      warnings: userAnalysis.fullFetchWarnings,
      errors: userAnalysis.fullFetchErrors,
      debugLogSanitized: getDebugLogs("analysis"),
      debugLogNote: "debugLogSanitized may contain the recent UI debug buffer only. See actionLogDiagnostics.actionLogPath for complete USER_ACTION / GUARD / UI_MODAL timeline."
    };
  }

  function fullFetchRawDataPayload() {
    const rawData = (userAnalysis.fullFetchRawDataByIssueSanitized ?? {}) as Record<string, unknown>;
    return {
      exportType: String(rawData.exportType ?? "user-analysis-full-fetch-raw-data"),
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
      rawDataMode: userAnalysis.rawDataMode,
      rawDataManifest: Array.isArray(rawData.issues) ? rawData.issues : [],
      rawDataMessage: String(rawData.message ?? ""),
      endpointMetadata: Array.isArray(rawData.endpointMetadata) ? rawData.endpointMetadata : [],
      actionLogDiagnostics: {
        actionLogPath: userAnalysis.actionLogPath,
        actionLogAvailable: userAnalysis.actionLogAvailable,
        actionLogNote: "USER_ACTION / GUARD / UI_MODAL are persisted separately to avoid UI debug buffer truncation."
      },
      debugLogSanitized: getDebugLogs("analysis"),
      debugLogNote: "debugLogSanitized may contain the recent UI debug buffer only. See actionLogDiagnostics.actionLogPath for complete USER_ACTION / GUARD / UI_MODAL timeline.",
      warnings: userAnalysis.fullFetchWarnings,
      errors: userAnalysis.fullFetchErrors
    };
  }

  async function saveFullFetchResult(raw = false) {
    logAnalysisAction("USER_ACTION", raw ? "Button clicked: Save Full Fetch Raw Data / 儲存完整抓取 Raw Data" : "Button clicked: Save Full Fetch Result / 儲存完整抓取結果");
    if (fullFetchSaveDisabledReason) {
      logAnalysisAction("GUARD", `Action blocked: ${fullFetchSaveDisabledReason}`);
      return;
    }
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
    logAnalysisAction("USER_ACTION", raw ? "Button clicked: Save Candidate Raw Data / 儲存候選 Raw Data" : "Button clicked: Save Candidate Result / 儲存候選結果");
    if (candidateSaveDisabledReason) {
      logAnalysisAction("GUARD", `Action blocked: ${candidateSaveDisabledReason}`);
      return;
    }
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
    const actionLabels = {
      result: "Open Candidate Result Folder clicked / 開啟候選結果資料夾",
      raw: "Open Candidate Raw Data Folder clicked / 開啟候選 Raw Data 資料夾",
      fullResult: "Open Full Fetch Result Folder clicked / 開啟完整抓取結果資料夾",
      fullRaw: "Open Full Fetch Raw Data Folder clicked / 開啟完整抓取 Raw Data 資料夾"
    };
    logAnalysisAction("USER_ACTION", actionLabels[kind]);
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
    const actionLabels = {
      result: "Copy Candidate Result Path clicked / 複製候選結果路徑",
      raw: "Copy Candidate Raw Data Path clicked / 複製候選 Raw Data 路徑",
      fullResult: "Copy Full Fetch Result Path clicked / 複製完整抓取結果路徑",
      fullRaw: "Copy Full Fetch Raw Data Path clicked / 複製完整抓取 Raw Data 路徑"
    };
    logAnalysisAction("USER_ACTION", actionLabels[kind]);
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
      {userAnalysis.largeQueueConfirmationOpen ? (
        <MockModal
          title="Large Full Fetch Confirmation / 大量完整抓取確認"
          onClose={handleLargeQueueConfirmationCancel}
          footer={<>
            <button className="btn" type="button" onClick={handleLargeQueueConfirmationCancel}>Cancel / 取消</button>
            <button className="btn btn-primary" type="button" onClick={() => void handleLargeQueueConfirmationSubmit()}><Play size={16} />Confirm and Run Full Fetch / 確認並執行完整抓取</button>
          </>}
        >
          <div className="space-y-4 leading-relaxed">
            <p>You are about to run Full Fetch for <b>{fetchQueue.length}</b> Jira issues.<br />你即將對 <b>{fetchQueue.length}</b> 張 Jira 執行完整抓取。</p>
            <p>This may use significant memory and take a long time.<br />這可能會使用較多記憶體並花費較長時間。</p>
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <div className="font-black">Recommended settings / 建議設定</div>
              <div className="mt-2">Batch Size / 每批數量：<b>{userAnalysis.batchSize}</b></div>
              <div>Raw Data Mode / Raw Data 模式：<b className="break-words">{userAnalysis.rawDataMode}</b></div>
              <ul className="mt-2 list-inside list-disc">
                <li>Use Batch Size 10. / 建議使用每批 10 張。</li>
                <li>Use Auto-save Raw Per Issue. / 建議使用逐張自動儲存 Raw。</li>
                <li>Avoid Full Raw In Memory. / 避免使用全部 Raw 存記憶體模式。</li>
              </ul>
            </div>
            <div>
              <FieldLabel label="Type CONFIRM to continue" sub="請輸入 CONFIRM 才能繼續" />
              <input className="field" autoFocus value={userAnalysis.largeQueueConfirmInput} onChange={(event) => handleLargeQueueConfirmationInput(event.target.value)} placeholder="CONFIRM" />
              {userAnalysis.largeQueueConfirmError ? <div className="mt-2 text-sm font-bold text-red-700">{userAnalysis.largeQueueConfirmError}</div> : null}
            </div>
          </div>
        </MockModal>
      ) : null}
      <div className="mb-4 flex min-w-0 flex-wrap gap-2">
        <label className="btn cursor-pointer" title="Show or hide contextual guidance">
          <input className="h-4 w-4" type="checkbox" checked={userAnalysis.showHelpTips} onChange={(event) => { logAnalysisAction("USER_ACTION", event.target.checked ? "Show Help Tips clicked / 顯示操作說明" : "Hide Help Tips clicked / 隱藏操作說明"); patchState({ showHelpTips: event.target.checked }); }} />
          {userAnalysis.showHelpTips ? "Hide Help Tips / 隱藏操作說明" : "Show Help Tips / 顯示操作說明"}
        </label>
        <button className="btn" type="button" onClick={() => { logAnalysisAction("USER_ACTION", userAnalysis.helpOpen ? "Help panel closed / 使用說明已關閉" : "Help panel opened / 使用說明已開啟"); patchState({ helpOpen: !userAnalysis.helpOpen }); }}>
          <HelpCircle size={16} />Help / 使用說明
        </button>
      </div>
      {userAnalysis.showHelpTips ? <p className="mb-4 text-xs font-semibold leading-relaxed text-muted">Turn on contextual help for each User Analysis step.<br />開啟每個使用者分析步驟的操作說明。</p> : null}
      <p className="mb-4 max-w-3xl text-sm font-semibold leading-relaxed text-muted">
        Find Jira issues touched by selected users in a date range. Stage 1 discovers candidate issues and prepares a fetch queue for Stage 2.<br />
        依選定使用者與日期範圍搜尋相關 Jira，第一階段建立候選清單與抓取佇列，供第二階段完整抓取使用。
      </p>

      {userAnalysis.previousUnfinishedRun && !userAnalysis.previousUnfinishedDismissed ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black">Previous Full Fetch may be unfinished / 前次完整抓取可能未完成</div>
              <div className="mt-1 break-words">Last completed: {String(userAnalysis.previousUnfinishedRun.lastCompletedIndex ?? 0)} / {String(userAnalysis.previousUnfinishedRun.total ?? userAnalysis.previousUnfinishedRun.queueCount ?? 0)} · {String(userAnalysis.previousUnfinishedRun.lastCompletedIssueKey ?? "-")}</div>
              <div className="mt-1 break-words">Crash or exit likely occurred near / 可能中斷於：{String(userAnalysis.previousUnfinishedRun.currentIssueKey ?? "-")}</div>
              <div className="mt-1 break-all text-xs" title={String(userAnalysis.previousUnfinishedRun.autoLogPath ?? "")}>{String(userAnalysis.previousUnfinishedRun.autoLogPath ?? "")}</div>
              <div className="mt-1 break-all text-xs" title={String(userAnalysis.previousUnfinishedRun.checkpointPath ?? "")}>{String(userAnalysis.previousUnfinishedRun.checkpointPath ?? "")}</div>
              <div className="mt-2 font-semibold">Automatic resume is not performed. Review the checkpoint before starting a new run. / 系統不會自動續跑，請先檢查 checkpoint。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="button" onClick={() => void openDiagnosticsFolder(String(userAnalysis.previousUnfinishedRun?.checkpointPath ?? ""))}><FolderOpen size={15} />Open Diagnostics / 開啟診斷</button>
              <button className="btn" type="button" disabled={!userAnalysis.previousUnfinishedRun.autoLogPath} onClick={() => void copyDiagnosticsPath(String(userAnalysis.previousUnfinishedRun?.autoLogPath ?? ""))}><Copy size={15} />Copy Log Path / 複製 Log 路徑</button>
              <button className="btn" type="button" disabled={!userAnalysis.previousUnfinishedRun.checkpointPath} onClick={() => void copyDiagnosticsPath(String(userAnalysis.previousUnfinishedRun?.checkpointPath ?? ""))}><Copy size={15} />Copy Checkpoint Path / 複製 Checkpoint 路徑</button>
              <button className="btn" type="button" onClick={() => patchState({ previousUnfinishedDismissed: true })}>Dismiss / 關閉</button>
            </div>
          </div>
        </div>
      ) : null}

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

      {(userAnalysis.fullFetchStatus === "running" || userAnalysis.fullFetchStatus === "paused" || userAnalysis.autoLogPath) ? (
        <SectionCard title="Full Fetch Progress" subtitle="完整抓取進度" className="mb-4">
          <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <MiniStat label="Total Issues / 總數" value={userAnalysis.fullFetchProgress.total} />
            <MiniStat label="Current / 目前" value={`${userAnalysis.fullFetchProgress.currentIndex} / ${userAnalysis.fullFetchProgress.total}`} />
            <MiniStat label="Current Issue / 目前 Jira" value={userAnalysis.fullFetchProgress.currentIssueKey || "-"} />
            <MiniStat label="Success / 成功" value={userAnalysis.fullFetchProgress.success} />
            <MiniStat label="Failed / 失敗" value={userAnalysis.fullFetchProgress.failed} />
            <MiniStat label="Skipped / 略過" value={userAnalysis.fullFetchProgress.skipped} />
            <MiniStat label="Elapsed / 已耗時" value={formatDuration(userAnalysis.fullFetchProgress.elapsedMs)} />
            <MiniStat label="ETA / 預估剩餘" value={formatDuration(userAnalysis.fullFetchProgress.estimatedRemainingMs)} />
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200" aria-label={`Full Fetch progress ${fullFetchProgressPercent}%`}>
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${fullFetchProgressPercent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-bold text-muted">
            <span>{fullFetchProgressPercent}% · Average / 平均 {formatDuration(userAnalysis.fullFetchProgress.averageMsPerIssue)} per issue</span>
            <span>Batch / 批次 {userAnalysis.fullFetchProgress.currentBatch || 0} / {userAnalysis.fullFetchProgress.totalBatches || 0}</span>
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MiniStat label="RSS Memory" value={`${userAnalysis.fullFetchMemory.rssMB} MB`} />
            <MiniStat label="Heap Used" value={`${userAnalysis.fullFetchMemory.heapUsedMB} MB`} />
            <MiniStat label="Heap Total" value={`${userAnalysis.fullFetchMemory.heapTotalMB} MB`} />
            <MiniStat label="External" value={`${userAnalysis.fullFetchMemory.externalMB} MB`} />
            <MiniStat label="System Free" value={`${userAnalysis.fullFetchMemory.systemFreeMB} MB`} />
            <MiniStat label="Raw Estimate" value={`${userAnalysis.fullFetchMemory.rawDataEstimateMB} MB`} />
          </div>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            {[["Auto Log / 自動紀錄", userAnalysis.autoLogPath], ["Checkpoint / 檢查點", userAnalysis.checkpointPath]].map(([label, filePath]) => (
              <div key={label} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-muted">{label}</div>
                <div className="mt-1 break-all text-xs font-semibold" title={filePath}>{filePath || "Preparing... / 準備中..."}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn px-3 py-2" type="button" disabled={!filePath} onClick={() => void openDiagnosticsFolder(filePath)}><FolderOpen size={14} />Open Folder / 開啟資料夾</button>
                  <button className="btn px-3 py-2" type="button" disabled={!filePath} onClick={() => void copyDiagnosticsPath(filePath)}><Copy size={14} />Copy Path / 複製路徑</button>
                </div>
              </div>
            ))}
          </div>
          {userAnalysis.fullFetchStatus === "running" ? (
            <button className="btn mt-4" type="button" disabled={userAnalysis.pauseAfterCurrentIssue} onClick={() => void handlePauseFullFetch()}>
              <PauseCircle size={16} />{userAnalysis.pauseAfterCurrentIssue ? "Pause requested / 已要求暫停" : "Pause after current issue / 完成目前 Jira 後暫停"}
            </button>
          ) : null}
          {userAnalysis.fullFetchStatus === "paused" ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">Full Fetch paused after the last completed issue. / 完整抓取已於上一張 Jira 完成後暫停。</div> : null}
        </SectionCard>
      ) : null}

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
              onChange={(event) => { logAnalysisAction("USER_ACTION", `Selected Users changed / 選擇使用者變更: userCount=${parseUsers(event.target.value).length}`); patchState({ selectedUsersText: event.target.value }); }}
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
              <input className="field" type="date" value={userAnalysis.startDate} onChange={(event) => { logAnalysisAction("USER_ACTION", `Date Range changed / 日期範圍變更: startDate=${event.target.value}`); patchState({ startDate: event.target.value }); }} />
            </div>
            <div>
              <FieldLabel label="End Date" sub="結束日期" />
              <input className="field" type="date" value={userAnalysis.endDate} onChange={(event) => { logAnalysisAction("USER_ACTION", `Date Range changed / 日期範圍變更: endDate=${event.target.value}`); patchState({ endDate: event.target.value }); }} />
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
              <select className="field" value={userAnalysis.fetchLimit} onChange={(event) => { logAnalysisAction("USER_ACTION", `Fetch Limit changed / 抓取上限變更: value=${event.target.value}`); patchState({ fetchLimit: Number(event.target.value) }); }}>
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
          <select className="field" value={userAnalysis.pageSize} onChange={(event) => { logAnalysisAction("USER_ACTION", `Rows per page changed / 每頁筆數變更: value=${event.target.value}`); patchState({ pageSize: Number(event.target.value), page: 1 }); }}>{pageSizeOptions.map((option) => <option key={option} value={option}>{option} rows / 筆</option>)}</select>
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-muted">Showing / 顯示 {pagedCandidates.length} of / 共 {filteredCandidates.length}</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="button" disabled={filteredCandidates.length === 0} onClick={selectAllCandidates}>Select All / 全選</button>
              <button className="btn" type="button" disabled={userAnalysis.selectedForFetch.length === 0} onClick={clearSelection}>Clear Selection / 清除選取</button>
              <button className="btn" type="button" disabled={userAnalysis.selectedForFetch.length === 0} onClick={addSelectedToFetchQueue}><DatabaseZap size={15} />Add to Fetch Queue / 加入抓取佇列</button>
              <button className="btn px-3 py-2" type="button" disabled={page <= 1} onClick={() => { logAnalysisAction("USER_ACTION", `Page changed / 分頁變更: page=${page - 1}`); patchState({ page: page - 1 }); }}>Prev / 上一頁</button>
              <button className="btn px-3 py-2" type="button" disabled={page >= pageCount} onClick={() => { logAnalysisAction("USER_ACTION", `Page changed / 分頁變更: page=${page + 1}`); patchState({ page: page + 1 }); }}>Next / 下一頁</button>
            </div>
          </div>
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
            <div className="mb-3 grid min-w-0 grid-cols-1 gap-4 rounded-lg border border-line bg-slate-50 p-4 lg:grid-cols-2">
              <div className="min-w-0">
                <FieldLabel label="Raw Data Mode" sub="原始資料模式" />
                <select className="field" value={userAnalysis.rawDataMode} disabled={userAnalysis.fullFetchStatus === "running"} onChange={(event) => { logAnalysisAction("USER_ACTION", `Raw Data Mode changed / Raw Data 模式變更: value=${event.target.value}`); patchState({ rawDataMode: event.target.value as typeof userAnalysis.rawDataMode }); }}>
                  <option value="summary_only">Summary Only / 僅摘要（最低記憶體）</option>
                  <option value="auto_save_raw_per_issue">Auto-save Raw per Issue / 每張 Jira 自動存檔（建議）</option>
                  <option value="full_raw_in_memory">Full Raw in Memory / 完整 Raw 保留於記憶體（高風險）</option>
                </select>
                <span className="mt-1 block text-xs font-semibold leading-snug text-muted">Auto-save writes sanitized per-issue diagnostic JSON outside the database. / 自動存檔只寫入清理後的診斷 JSON，不寫入資料庫。</span>
              </div>
              <div className="min-w-0">
                <FieldLabel label="Batch Size" sub="批次大小" />
                <select className="field" value={userAnalysis.batchSize} disabled={userAnalysis.fullFetchStatus === "running"} onChange={(event) => { logAnalysisAction("USER_ACTION", `Batch Size changed / 每批數量變更: value=${event.target.value}`); patchState({ batchSize: event.target.value === "all" ? "all" : Number(event.target.value) as 10 | 20 | 40 }); }}>
                  <option value={10}>10 issues / 10 張</option>
                  <option value={20}>20 issues / 20 張</option>
                  <option value={40}>40 issues / 40 張</option>
                  <option value="all">All / 全部（不建議大佇列）</option>
                </select>
                <span className="mt-1 block text-xs font-semibold leading-snug text-muted">Processing remains sequential; checkpoint and memory diagnostics are refreshed at each batch boundary. / 維持循序抓取，每批更新 checkpoint 與記憶體診斷。</span>
              </div>
            </div>
            {fetchQueue.length > 10 ? (
              <div className={`mb-3 flex gap-3 rounded-lg border p-3 text-sm font-semibold leading-relaxed ${fetchQueue.length > 40 ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <AlertTriangle className="mt-0.5 shrink-0" size={17} />
                <span>Large queue: {fetchQueue.length} issues. Expect longer runtime and more Jira GET requests. / 大型佇列共 {fetchQueue.length} 張 Jira，執行時間與唯讀 GET 請求數會增加。{fetchQueue.length > 40 ? " Starting requires typing CONFIRM. / 啟動時需輸入 CONFIRM。" : ""}</span>
              </div>
            ) : null}
            {userAnalysis.rawDataMode === "full_raw_in_memory" ? (
              <div className="mb-3 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-relaxed text-red-900"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><span>Full Raw in Memory increases memory and crash risk. Prefer Auto-save Raw per Issue for production-sized queues. / 完整 Raw 保留於記憶體會提高記憶體與當機風險，大型佇列請優先使用每張 Jira 自動存檔。</span></div>
            ) : null}
            <div className="mb-3 flex flex-wrap justify-end gap-2">
              <button className="btn" type="button" disabled={fetchQueue.length === 0 || userAnalysis.fullFetchStatus === "running"} onClick={clearFetchQueue}><Trash2 size={15} />Clear Fetch Queue / 清除抓取佇列</button>
            </div>
            <ResponsiveTableContainer>
              <table className="table min-w-[1120px]">
                <thead>
                  <tr>
                    {["Issue Key / Jira 編號", "Summary / 摘要", "Jira Status / Jira 狀態", "Fetch Status / 抓取狀態", "Assignee / 負責人", "Updated / 更新時間", "Matched Reason / 符合原因", "Remove / 移除"].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {fetchQueue.map((issue) => (
                    <tr key={issue.key}>
                      <td className="font-black text-blue-700">{issue.key}</td>
                      <td><span className="block max-w-[360px] truncate" title={issue.summary} data-allow-truncate="true">{issue.summary}</span></td>
                      <td><StatusBadge>{issue.status}</StatusBadge></td>
                      <td><StatusBadge>{fetchQueueRuntimeStatus(issue.key)}</StatusBadge></td>
                      <td><span className="block max-w-[180px] truncate" title={issue.assignee} data-allow-truncate="true">{issue.assignee}</span></td>
                      <td>{issue.updated}</td>
                      <td><span className="block max-w-[300px] truncate" title={issue.matchedReason} data-allow-truncate="true">{issue.matchedReason}</span></td>
                      <td><button className="btn px-3 py-2" type="button" onClick={() => removeFromQueue(issue.key)}><Trash2 size={14} />Remove / 移除</button></td>
                    </tr>
                  ))}
                  {fetchQueue.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted">No issues selected for Fetch Queue. / 抓取佇列中尚無 Jira。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold leading-relaxed text-muted">
              {userAnalysis.showHelpTips ? <><b>Run Full Fetch / 執行完整抓取</b><br />Run Full Fetch reads issue fields, changelog, comments, attachments metadata, issue links, and parsed users.<br />完整抓取會讀取 issue 欄位、changelog、comments、attachments metadata、issue links 與使用者資訊。<br /><br /><b>Safety / 安全性：</b> Read-only Jira API only. No database write, no Jira write, and no attachment body download.<br />只使用唯讀 Jira API，不寫入資料庫、不寫入 Jira，也不下載附件本體。</> : <>This will fetch full read-only data for all issues currently in the Fetch Queue. / 這會依目前抓取佇列執行唯讀完整抓取。</>}
            </div>
            <button className="btn btn-primary mt-3" type="button" onClick={() => void handleRunFullFetchClick()} disabled={Boolean(fullFetchDisabledReason)} title={fullFetchDisabledReason || "Run a sequential read-only fetch for the current queue"}>
              <Play size={16} />{userAnalysis.fullFetchStatus === "running" ? "Running Full Fetch / 完整抓取中..." : hasFullFetchResult ? "Re-run Full Fetch from Queue / 依佇列重新完整抓取" : "Run Full Fetch from Queue / 依佇列執行完整抓取"}
            </button>
            {fullFetchDisabledReason ? <div className="mt-2 text-sm font-bold text-amber-800">Disabled reason / 無法執行原因：{fullFetchDisabledReason}</div> : null}
            {hasFullFetchResult ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><span>Full Fetch completed. Go to Full Fetch Report to review results.<br />完整抓取已完成。請前往完整抓取報告檢視結果。</span><button className="btn" type="button" onClick={() => showStep("fetchReport")}>Go to Full Fetch Report / 前往完整抓取報告</button></div> : null}
          </>
        ) : (
          <>
            {userAnalysis.showHelpTips ? <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Review fetch status, counts, warnings, and errors for each fetched Jira issue.<br />檢查每張已抓取 Jira 的抓取狀態、統計數量、警告與錯誤。<br />Use View Detail / 查看詳細 to inspect HTTP status, changelog count, issue links, parsed users, and last fetched time.<br />使用 View Detail / 查看詳細 可檢查 HTTP 狀態、changelog 數量、issue links、parsed users 與最後抓取時間。</div> : null}
            <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
              <select className="field" value={userAnalysis.fetchReportFilter} onChange={(event) => { logAnalysisAction("USER_ACTION", `Status filter changed / 狀態篩選變更: value=${event.target.value}`); patchState({ fetchReportFilter: event.target.value as typeof userAnalysis.fetchReportFilter, fetchReportPage: 1 }); }}>
                <option value="all">All / 全部</option>
                <option value="success">Success / 成功</option>
                <option value="failed">Failed / 失敗</option>
              </select>
              <select className="field" value={userAnalysis.fetchReportPageSize} onChange={(event) => { logAnalysisAction("USER_ACTION", `Rows per page changed / 每頁筆數變更: value=${event.target.value}`); patchState({ fetchReportPageSize: Number(event.target.value), fetchReportPage: 1 }); }}>
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
                <button className="btn px-3 py-2" type="button" disabled={fetchReportPage <= 1} onClick={() => { logAnalysisAction("USER_ACTION", `Page changed / 分頁變更: page=${fetchReportPage - 1}`); patchState({ fetchReportPage: fetchReportPage - 1 }); }}>Prev / 上一頁</button>
                <button className="btn px-3 py-2" type="button" disabled={fetchReportPage >= fetchReportPageCount} onClick={() => { logAnalysisAction("USER_ACTION", `Page changed / 分頁變更: page=${fetchReportPage + 1}`); patchState({ fetchReportPage: fetchReportPage + 1 }); }}>Next / 下一頁</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold text-muted"><span>This will replace the current Full Fetch session result.<br />這會取代目前的完整抓取工作階段結果。</span><button className="btn" type="button" onClick={() => void handleRunFullFetchClick()} disabled={Boolean(fullFetchDisabledReason)} title={fullFetchDisabledReason}><Play size={15} />Re-run Full Fetch from Queue / 依佇列重新完整抓取</button></div>
          </>
        )}
      </SectionCard> : null}

      {userAnalysis.activeTab === "exports" ? <div id="analysis-exports" className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0 xl:col-span-2">
          <SectionCard title="User Action Log" subtitle="使用者操作紀錄">
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm font-semibold leading-relaxed text-violet-950">
              The complete USER_ACTION / GUARD / UI_MODAL timeline is persisted separately from the recent UI Debug Log buffer.<br />
              完整操作時間線會獨立落盤，不受 UI Debug Log 最近 160 行限制。
            </div>
            <div className="mt-3 min-w-0 rounded-lg border border-line bg-slate-50 p-3">
              <div className="text-xs font-black uppercase text-muted">Path / 路徑</div>
              <div className="mt-1 break-all text-sm font-bold text-ink" title={userAnalysis.actionLogPath || "Loading action log path"}>
                {userAnalysis.actionLogPath || "Loading... / 載入中..."}
              </div>
              <div className="mt-2 text-xs font-semibold text-muted">
                Status / 狀態：{userAnalysis.actionLogAvailable ? "Available / 可用" : "Ready; the file is created on the first action / 已就緒，首次操作時建立檔案"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.actionLogPath} onClick={() => void openActionLogFolder()}>
                  <FolderOpen size={15} />Open Action Log Folder / 開啟使用者操作紀錄資料夾
                </button>
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.actionLogPath} onClick={() => void copyActionLogPath()}>
                  <Copy size={15} />Copy Action Log Path / 複製使用者操作紀錄路徑
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Stage 1 Candidate Export" subtitle="第一階段候選資料匯出">
          {userAnalysis.showHelpTips ? <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Candidate exports are Stage 1 outputs. They contain candidate issue lists and search context, but not full comments, attachments, or changelog.<br />候選匯出是第一階段輸出，包含候選 Jira 清單與搜尋條件，但不包含完整 comments、attachments 或 changelog。<br /><br />Raw Data contains more original Jira response data and is mainly for debugging. / Raw Data 包含較完整的 Jira 原始回應資料，主要用於除錯與深入分析。</div> : null}
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" type="button" onClick={() => void saveCandidateResult(false)} disabled={userAnalysis.saving || Boolean(candidateSaveDisabledReason)} title={candidateSaveDisabledReason}>
              <Download size={16} />Save Candidate Result / 儲存候選結果
            </button>
            <button className="btn" type="button" onClick={() => void saveCandidateResult(true)} disabled={userAnalysis.saving || Boolean(candidateSaveDisabledReason)} title={candidateSaveDisabledReason}>
              <Download size={16} />Save Candidate Raw Data / 儲存候選 Raw Data
            </button>
          </div>
          {candidateSaveDisabledReason ? <div className="mt-2 text-sm font-bold text-amber-800">Disabled reason / 無法執行原因：{candidateSaveDisabledReason}</div> : null}
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
              <button className="btn btn-primary" type="button" onClick={() => void saveFullFetchResult(false)} disabled={userAnalysis.saving || Boolean(fullFetchSaveDisabledReason)} title={fullFetchSaveDisabledReason}>
                <Download size={16} />Save Full Fetch Result / 儲存完整抓取結果
              </button>
              <button className="btn" type="button" onClick={() => void saveFullFetchResult(true)} disabled={userAnalysis.saving || Boolean(fullFetchSaveDisabledReason)} title={fullFetchSaveDisabledReason}>
                <Download size={16} />Save Full Fetch Raw Data / 儲存完整抓取 Raw Data
              </button>
            </div>
            {fullFetchSaveDisabledReason ? <div className="text-sm font-bold text-amber-800">Disabled reason / 無法執行原因：{fullFetchSaveDisabledReason}</div> : null}
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
