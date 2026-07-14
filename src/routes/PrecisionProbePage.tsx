import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Copy, DatabaseZap, Download, FolderOpen, Play, Radio } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel, MockModal } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserActivityStreamDateQueryResult, type UserActivityStreamDateSemantics, type UserActivityStreamMaxResultsDiagnostics, type UserActivityStreamResult, type UserActivityStreamVariantResult, type UserAnalysisCandidateIssue, type UserAnalysisPrecisionProbeResult, type UserAnalysisPrecisionProbeSummary } from "../state/SessionStateContext";

function parseUsers(input: string) {
  return Array.from(new Set(input.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)));
}

function jqlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function addDays(dateText: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return dateText;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function newActivityStreamRunId() {
  const stamp = new Date().toISOString().split("-").join("").split(":").join("").replace("T", "").replace("Z", "").slice(0, 17);
  return `asrun-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

const emptyParserDiagnostics = {
  atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0,
  entriesWithIssueKeyCount: 0, confluenceOnlyEntryCount: 0,
  entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0,
  entriesWithMultipleIssueKeysCount: 0, parserErrorCount: 0, parserErrorsSanitized: [] as string[],
  skippedEntriesSanitized: [] as Array<{ entryIndex: number; reason: string; rawTitleText: string; rawUpdatedText: string; rawAuthorText: string }>,
  parserAnomaly: false, parserAnomalyReason: ""
};
const emptyActivityEntryStats = { totalAtomEntries: 0, parsedActivityEntryCount: 0, parsedIssueActivityCount: 0, entriesWithIssueKeyCount: 0, entriesWithoutIssueKeyCount: 0, confluenceOnlyEntryCount: 0, nonJiraEntryCount: 0, jiraIssueEntryCount: 0, uniqueIssueKeyCount: 0 };

const activityTypeOptions = ["link", "comment", "attachment", "status", "assignee_change", "field_change", "description_update", "page", "unknown"] as const;
const variantOptions = ["username", "escaped_username", "email", "manual_url"] as const;
const sourceOptions = ["activity_stream", "manual_url"] as const;
const maxResultsQuickValues = [10, 20, 50, 100, 200, 500, 1000] as const;
const capTestValues = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 65535] as const;
const crossPageDebugBundleTodo = ["Jira Probe: verify debug bundle includes latest probe result", "Jira Analysis: verify debug bundle includes latest analysis result", "Candidate Discovery: verify debug bundle includes latest candidate result", "Fetch Queue: verify run history and latest queue snapshot", "Full Fetch: verify debug bundle includes latest fetch report", "Connections / Data Source Test: verify latest connection test result"];

function buildBaseJql(users: string[], startDate: string, endDate: string) {
  const endExclusive = addDays(endDate, 1);
  const roles = users.length === 1
    ? `assignee = ${jqlString(users[0])} OR reporter = ${jqlString(users[0])} OR creator = ${jqlString(users[0])}`
    : `assignee in (${users.map(jqlString).join(", ")}) OR reporter in (${users.map(jqlString).join(", ")}) OR creator in (${users.map(jqlString).join(", ")})`;
  return `(${roles}) AND updated >= "${startDate}" AND updated < "${endExclusive}" ORDER BY updated DESC, created DESC, key DESC`;
}

function stamp() {
  const date = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 rounded-lg border border-line bg-white p-3"><div className="text-xs font-black uppercase leading-snug text-muted">{label}</div><div className="mt-1 break-words text-2xl font-black text-ink" data-no-clip="true">{value}</div></div>;
}

export function PrecisionProbePage() {
  const { activeConnection } = useConnectionContext();
  const { userAnalysis, setUserAnalysis } = useSessionState();
  const { appendDebugLog, getDebugLogs } = useOutletContext<AppOutletContext>();
  const selectedUsers = useMemo(() => parseUsers(userAnalysis.selectedUsersText), [userAnalysis.selectedUsersText]);
  const endExclusive = addDays(userAnalysis.endDate, 1);
  const connectionReady = Boolean(window.desktopApp?.uiSmoke || (activeConnection?.baseUrl && activeConnection?.apiToken));
  const latestRunIdRef = useRef(userAnalysis.currentActivityStreamRunId);
  const runningRef = useRef(userAnalysis.isActivityStreamRunning);
  const [largeQueryConfirmation, setLargeQueryConfirmation] = useState<{ open: boolean; input: string; error: string; action: "activity" | "precision" | "cap" | "" }>({ open: false, input: "", error: "", action: "" });
  const allEntries = useMemo(() => [
    ...userAnalysis.activityStream.entriesSanitized.filter((entry) => entry.variant !== "manual_url"),
    ...(userAnalysis.manualActivityStreamResult?.entriesSanitized ?? [])
  ], [userAnalysis.activityStream.entriesSanitized, userAnalysis.manualActivityStreamResult]);
  const filteredEntries = useMemo(() => {
    const filter = userAnalysis.parsedEntriesFilter;
    const issueQuery = filter.issueKeyQuery.trim().toLowerCase();
    const authorQuery = filter.authorQuery.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (filter.activityTypes.length > 0 && !filter.activityTypes.includes(entry.activityType)) return false;
      if (issueQuery && !entry.extractedIssueKeysPerEntry.some((key) => key.toLowerCase().includes(issueQuery))) return false;
      if (filter.onlyWithIssueKey && entry.extractedIssueKeysPerEntry.length === 0) return false;
      if (filter.applyClientDateFilter && filter.dateRange.start && entry.activityTime && entry.activityTime.slice(0, 10) < filter.dateRange.start) return false;
      if (filter.applyClientDateFilter && filter.dateRange.end && entry.activityTime && entry.activityTime.slice(0, 10) > filter.dateRange.end) return false;
      if (filter.variants.length > 0 && !filter.variants.includes(entry.variant)) return false;
      if (filter.sources.length > 0 && !filter.sources.includes(entry.source)) return false;
      if (authorQuery && !`${entry.activityAuthor} ${entry.activityAuthorEmail}`.toLowerCase().includes(authorQuery)) return false;
      return true;
    });
  }, [allEntries, userAnalysis.parsedEntriesFilter]);
  const filterStats = useMemo(() => ({
    totalParsedEntries: allEntries.length,
    filteredEntries: filteredEntries.length,
    uniqueIssueKeyCount: new Set(filteredEntries.flatMap((entry) => entry.extractedIssueKeysPerEntry)).size,
    activityTypeCounts: filteredEntries.reduce<Record<string, number>>((counts, entry) => ({ ...counts, [entry.activityType]: (counts[entry.activityType] ?? 0) + 1 }), {})
  }), [allEntries, filteredEntries]);
  const totalEntryPages = Math.max(1, Math.ceil(filteredEntries.length / userAnalysis.parsedEntriesPageSize));
  const currentEntryPage = Math.min(userAnalysis.parsedEntriesPage, totalEntryPages);
  const paginatedEntries = useMemo(() => filteredEntries.slice((currentEntryPage - 1) * userAnalysis.parsedEntriesPageSize, currentEntryPage * userAnalysis.parsedEntriesPageSize), [filteredEntries, currentEntryPage, userAnalysis.parsedEntriesPageSize]);
  const showingStart = filteredEntries.length === 0 ? 0 : (currentEntryPage - 1) * userAnalysis.parsedEntriesPageSize + 1;
  const showingEnd = Math.min(currentEntryPage * userAnalysis.parsedEntriesPageSize, filteredEntries.length);
  const clientDateFilteredEntries = useMemo(() => allEntries.filter((entry) => {
    const date = entry.activityTime.slice(0, 10);
    return Boolean(date && (!userAnalysis.startDate || date >= userAnalysis.startDate) && (!userAnalysis.endDate || date <= userAnalysis.endDate));
  }), [allEntries, userAnalysis.startDate, userAnalysis.endDate]);

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    setUserAnalysis((current) => current.parsedEntriesPage === 1 ? current : { ...current, parsedEntriesPage: 1 });
  }, [userAnalysis.parsedEntriesFilter, setUserAnalysis]);

  async function autoSaveRun(resultType: "activity_stream_run" | "precision_probe_run" | "manual_url_replay_run" | "maxresults_cap_test", runId: string, status: string, data: unknown) {
    if (!window.desktopApp?.userAnalysis?.autoSaveRun || !["success", "partial", "completed"].includes(status)) return;
    const saved = await window.desktopApp.userAnalysis.autoSaveRun({ resultType, runId, status, data });
    const toMetadata = (value: typeof saved.resultTracking.latestRunResult) => value ? { path: value.path, folderPath: value.folderPath, savedAt: value.savedAt, runId: value.runId, resultType: value.resultType, status: value.status, diagnosis: value.diagnosis, parsedActivityCount: value.parsedActivityCount } : null;
    const metadata = toMetadata(saved.resultTracking.latestRunResult)!;
    setUserAnalysis((current) => ({ ...current, lastAutoSavedResult: metadata, lastSuccessfulAutoSavedResult: toMetadata(saved.resultTracking.lastSuccessfulResult), lastParsedAutoSavedResult: toMetadata(saved.resultTracking.lastParsedResult), latestNoEntriesAutoSavedResult: toMetadata(saved.resultTracking.latestNoEntriesResult), autoSavedResultPaths: [metadata, ...current.autoSavedResultPaths].slice(0, 20) }));
    appendDebugLog("precision", [`[INFO] Auto-saved ${resultType}: ${saved.filePath}`]);
  }

  function logAction(category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO", message: string) {
    appendDebugLog("precision", [`[${category}] ${message}`]);
    void window.desktopApp?.userAnalysis?.logAction?.({ category, message }).then((result) => {
      if (result?.actionLogPath) patchState({ actionLogPath: result.actionLogPath, actionLogAvailable: result.actionLogAvailable ?? true });
    });
  }

  function beginActivityStreamRun() {
    if (runningRef.current) {
      logAction("GUARD", "Activity Stream run blocked: another run is already in progress");
      return "";
    }
    const runId = newActivityStreamRunId();
    runningRef.current = true;
    latestRunIdRef.current = runId;
    setUserAnalysis((current) => ({
      ...current,
      currentActivityStreamRunId: runId,
      isActivityStreamRunning: true,
      precisionProbeStatus: "running",
      precisionProbeErrors: [],
      notice: "",
      manualActivityStreamResult: null,
      manualUrlReplayDiagnostics: { manualUrlProvided: false, manualUrlAccepted: false, rejectReason: "", requestUrlSanitized: "" },
      precisionIssueKeySets: { ...current.precisionIssueKeySets, activityStreamIssueKeys: [], manualActivityStreamIssueKeys: [], recommendedIssueKeys: [] },
      uniquePreciseIssueKeys: [],
      activityStreamDateQueryResults: [],
      activityStreamChunkResults: [],
      activityStreamChunkMergeStats: { totalChunkAtomEntries: 0, mergedActivityEntries: 0, duplicateEntriesRemoved: 0, mergedEntriesWithIssueKeyCount: 0, mergedConfluenceOnlyEntryCount: 0, uniqueIssueKeyCount: 0, successfulChunks: 0, noEntryChunks: 0, failedChunks: 0 },
      activityStreamDateSemantics: { ...current.activityStreamDateSemantics, dateQueryModesTested: [], bestDateQueryMode: "client_side_only", serverDateFilterEffective: "unknown", rawReturnedEntries: 0, clientDateFilteredEntries: 0, warnings: [] },
      activityStream: {
        ...current.activityStream,
        runId,
        status: "running",
        overallStatus: "running",
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
        parsedActivityCount: 0,
        parsedIssueKeys: [],
        atomEntryCount: 0,
        variantResults: [],
        activityStreamIssueKeys: [],
        entriesSanitized: [],
        firstEntriesSanitized: [],
        error: "",
        rawSummary: "",
        parserDiagnostics: emptyParserDiagnostics,
        activityEntryStats: emptyActivityEntryStats
      }
    }));
    return runId;
  }

  function staleResult(runId: string) {
    if (runId && runId === latestRunIdRef.current) return false;
    appendDebugLog("precision", [`[WARN] Ignored stale Activity Stream result: resultRunId=${runId || "missing"} currentRunId=${latestRunIdRef.current || "missing"}`]);
    return true;
  }

  function finishRun(runId: string, result: UserActivityStreamResult, details: { startedAt?: string; completedAt?: string; mode: string; user: string; maxResults: number; start: string; end: string }) {
    runningRef.current = false;
    setUserAnalysis((current) => ({
      ...current,
      isActivityStreamRunning: false,
      activityStreamRunHistory: [{
        runId,
        startedAt: details.startedAt || new Date().toISOString(),
        completedAt: details.completedAt || new Date().toISOString(),
        mode: details.mode,
        activityStreamUser: details.user,
        maxResults: details.maxResults,
        dateRange: { start: details.start, end: details.end },
        bestVariant: result.bestVariant,
        atomEntryCount: result.atomEntryCount,
        parsedActivityCount: result.parsedActivityCount,
        parsedIssueKeyCount: result.parsedIssueKeys.length,
        diagnosis: result.diagnosis,
        staleIgnored: false
      }, ...current.activityStreamRunHistory].slice(0, 5),
      lastSuccessfulActivityStreamResult: result.parsed ? result : current.lastSuccessfulActivityStreamResult
    }));
  }

  function failRun(runId: string, message: string) {
    if (runId !== latestRunIdRef.current) return;
    runningRef.current = false;
    patchState({ isActivityStreamRunning: false, precisionProbeStatus: "failed", precisionProbeErrors: [message] });
  }

  function smokeConnection() {
    return activeConnection ?? (window.desktopApp?.uiSmoke ? {
      id: "ui-smoke", name: "UI Smoke Connection", baseUrl: "https://jira.example.invalid", authType: "bearer" as const, apiVersion: "v2" as const,
      username: "smoke.user", email: "smoke.user@example.invalid", apiToken: "ui-smoke-masked", tokenSource: "session" as const,
      tokenMasked: "****", status: "not_tested" as const, lastTestedAt: "", authenticatedUser: "", accessibleProjectsCount: 0, active: true
    } : null);
  }

  function validate() {
    if (!Number.isInteger(userAnalysis.activityStreamCustomChunkDays) || userAnalysis.activityStreamCustomChunkDays < 1 || userAnalysis.activityStreamCustomChunkDays > 31) return "Custom chunk days must be between 1 and 31.";
    if (selectedUsers.length === 0) return "Please enter at least one selected user. / 請輸入至少一位使用者。";
    if (!userAnalysis.activityStreamUser.trim()) return "Please enter Activity Stream User. / 請輸入 Activity Stream 使用者。";
    if (!userAnalysis.startDate || !userAnalysis.endDate || userAnalysis.startDate > userAnalysis.endDate) return "Please enter a valid date range. / 請輸入有效日期範圍。";
    if (!Number.isInteger(userAnalysis.precisionProbeMaxResults) || userAnalysis.precisionProbeMaxResults < 1 || userAnalysis.precisionProbeMaxResults > 65535) return "maxResults must be between 1 and 65535. / maxResults 必須介於 1 到 65535。";
    if (!smokeConnection()) return "Jira connection is not ready. / Jira 連線尚未就緒。";
    return "";
  }

  async function runActivityStreamOnly(largeMaxResultsConfirmed = false, capTest = false) {
    logAction("USER_ACTION", "Button clicked: Run Activity Stream Probe / 執行 Activity Stream 測試");
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    try {
      const response = await window.desktopApp?.userAnalysis?.activityStreamProbe?.({
        connection: smokeConnection()!, selectedUsers, activityStreamUser: userAnalysis.activityStreamUser.trim(), queryMode: userAnalysis.activityStreamQueryMode, startDate: userAnalysis.startDate,
        endDate: userAnalysis.endDate, maxResults: userAnalysis.precisionProbeMaxResults, maxResultsSource: userAnalysis.precisionProbeMaxResultsSource, largeMaxResultsConfirmed,
        dateQueryMode: capTest ? "none" : userAnalysis.activityStreamDateQueryMode, chunkingMode: capTest ? "off" : userAnalysis.activityStreamChunkingMode, customChunkDays: userAnalysis.activityStreamCustomChunkDays, relativeLinks: userAnalysis.activityStreamRelativeLinks, runId
      });
      if (!response) throw new Error("Electron Activity Stream API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      const activityStream = response.activityStream as unknown as UserActivityStreamResult;
      const dateSemantics = response.dateSemantics as unknown as UserActivityStreamDateSemantics;
      const dateQueryResults = (Array.isArray(response.dateQueryResults) ? response.dateQueryResults : []) as UserActivityStreamDateQueryResult[];
      const maxResultsDiagnostics = response.maxResultsDiagnostics as unknown as UserActivityStreamMaxResultsDiagnostics;
      const dateRangeChunking = response.dateRangeChunking as typeof userAnalysis.activityStreamDateRangeChunking;
      const activityStreamChunkResults = (Array.isArray(response.activityStreamChunkResults) ? response.activityStreamChunkResults : []) as typeof userAnalysis.activityStreamChunkResults;
      const chunkMergeStats = response.chunkMergeStats as typeof userAnalysis.activityStreamChunkMergeStats;
      if (staleResult(String(response.runId || activityStream.runId || ""))) return;
      setUserAnalysis((current) => {
        const manualKeys = current.precisionIssueKeySets.manualActivityStreamIssueKeys;
        const recommendedIssueKeys = manualKeys.length > 0 ? manualKeys : activityStream.activityStreamIssueKeys;
        let diagnostics = maxResultsDiagnostics;
        const previous = current.activityStreamCapTestResults[0];
        if (capTest && previous && diagnostics.requestedMaxResults > previous.requestedMaxResults && diagnostics.actualAtomEntryCount > 0 && diagnostics.actualAtomEntryCount === previous.actualAtomEntryCount) diagnostics = { ...diagnostics, serverCapDetected: "likely", serverCapValueEstimated: diagnostics.actualAtomEntryCount, warnings: [...diagnostics.warnings, `Likely server cap detected near ${diagnostics.actualAtomEntryCount} entries.`] };
        return { ...current, activityStream, activityStreamDateSemantics: { ...dateSemantics, clientDateFilterApplied: current.parsedEntriesFilter.applyClientDateFilter }, activityStreamDateQueryResults: dateQueryResults, activityStreamMaxResultsDiagnostics: diagnostics, activityStreamCapTestResults: capTest ? [diagnostics, ...current.activityStreamCapTestResults].slice(0, 9) : current.activityStreamCapTestResults, precisionIssueKeySets: { ...current.precisionIssueKeySets, activityStreamIssueKeys: activityStream.activityStreamIssueKeys, recommendedIssueKeys }, uniquePreciseIssueKeys: recommendedIssueKeys, precisionProbeStatus: activityStream.overallStatus === "failed" ? "failed" : "completed", precisionProbeErrors: activityStream.error ? [activityStream.error] : [], notice: `${capTest ? "MaxResults Cap Test" : "Activity Stream Probe"} completed: ${activityStream.parsedActivityCount} activities, ${activityStream.activityStreamIssueKeys.length} issue key(s). / Activity Stream 測試完成。` };
      });
      patchState({ activityStreamDateRangeChunking: dateRangeChunking, activityStreamChunkResults, activityStreamChunkMergeStats: chunkMergeStats });
      finishRun(runId, activityStream, { startedAt: String(response.startedAt || ""), completedAt: String(response.completedAt || ""), mode: userAnalysis.activityStreamQueryMode, user: userAnalysis.activityStreamUser.trim(), maxResults: userAnalysis.precisionProbeMaxResults, start: userAnalysis.startDate, end: endExclusive });
      if (activityStream.overallStatus !== "failed") await autoSaveRun(capTest ? "maxresults_cap_test" : "activity_stream_run", runId, activityStream.overallStatus === "success" || activityStream.overallStatus === "no_entries" ? "success" : "partial", { app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch }, requestContext: { activityStreamUser: userAnalysis.activityStreamUser, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, dateQueryMode: capTest ? "none" : userAnalysis.activityStreamDateQueryMode, chunkingMode: capTest ? "off" : userAnalysis.activityStreamChunkingMode, customChunkDays: userAnalysis.activityStreamCustomChunkDays, maxResults: userAnalysis.precisionProbeMaxResults }, activityStream, dateSemantics, dateQueryResults, maxResultsDiagnostics, dateRangeChunking, activityStreamChunkResults, chunkMergeStats, clientDateFilteredEntriesSanitized: Array.isArray(response.clientDateFilteredEntriesSanitized) ? response.clientDateFilteredEntriesSanitized : [], activityStreamRunHistory: userAnalysis.activityStreamRunHistory });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activity Stream Probe failed.";
      failRun(runId, message);
      appendDebugLog("precision", [`[ERROR] ${message}`]);
    }
  }

  async function runPrecisionProbe(largeMaxResultsConfirmed = false) {
    logAction("USER_ACTION", "Button clicked: Run Precision Probe / 執行精準查詢測試");
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    patchState({ precisionProbeWarnings: [] });
    try {
      const response = await window.desktopApp?.userAnalysis?.precisionProbe?.({
        connection: smokeConnection()!, selectedUsers, startInclusive: userAnalysis.startDate, endExclusive,
        activityStreamEndInclusive: userAnalysis.endDate,
        projectScope: userAnalysis.precisionProjectScope, activityStreamUser: userAnalysis.activityStreamUser.trim(),
        activityStreamQueryMode: userAnalysis.activityStreamQueryMode,
        activityStreamRelativeLinks: userAnalysis.activityStreamRelativeLinks,
        activityStreamRunId: runId,
        activityStreamDateQueryMode: userAnalysis.activityStreamDateQueryMode,
        activityStreamChunkingMode: userAnalysis.activityStreamChunkingMode,
        activityStreamCustomChunkDays: userAnalysis.activityStreamCustomChunkDays,
        maxResults: userAnalysis.precisionProbeMaxResults, maxResultsSource: userAnalysis.precisionProbeMaxResultsSource, largeMaxResultsConfirmed, broadJql: buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate)
      });
      if (!response) throw new Error("Electron Precision Probe API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      const summary = response.summary as unknown as UserAnalysisPrecisionProbeSummary;
      const activityStream = response.activityStream as unknown as UserActivityStreamResult;
      const dateSemantics = response.dateSemantics as unknown as UserActivityStreamDateSemantics;
      const dateQueryResults = (Array.isArray(response.dateQueryResults) ? response.dateQueryResults : []) as UserActivityStreamDateQueryResult[];
      const maxResultsDiagnostics = response.maxResultsDiagnostics as unknown as UserActivityStreamMaxResultsDiagnostics;
      const dateRangeChunking = response.dateRangeChunking as typeof userAnalysis.activityStreamDateRangeChunking;
      const activityStreamChunkResults = (Array.isArray(response.activityStreamChunkResults) ? response.activityStreamChunkResults : []) as typeof userAnalysis.activityStreamChunkResults;
      const chunkMergeStats = response.chunkMergeStats as typeof userAnalysis.activityStreamChunkMergeStats;
      if (staleResult(activityStream.runId)) return;
      const status = String(response.status ?? "failed");
      const responseSets = (response.issueKeySets ?? {
        activityStreamIssueKeys: [], manualActivityStreamIssueKeys: [], updatedByCandidateIssueKeys: [], changedByIssueKeys: [], broadBaselineIssueKeys: [], recommendedIssueKeys: []
      }) as typeof userAnalysis.precisionIssueKeySets;
      const mergedSets = { ...responseSets, manualActivityStreamIssueKeys: [], recommendedIssueKeys: responseSets.activityStreamIssueKeys };
      patchState({
        precisionProbeStatus: status === "success" ? "completed" : status === "partial" ? "partial" : "failed",
        precisionProbeResults: (Array.isArray(response.results) ? response.results : []) as UserAnalysisPrecisionProbeResult[],
        precisionProbeSummary: summary,
        activityStream,
        activityStreamDateSemantics: { ...dateSemantics, clientDateFilterApplied: userAnalysis.parsedEntriesFilter.applyClientDateFilter },
        activityStreamDateQueryResults: dateQueryResults,
        activityStreamDateRangeChunking: dateRangeChunking,
        activityStreamChunkResults,
        activityStreamChunkMergeStats: chunkMergeStats,
        activityStreamMaxResultsDiagnostics: maxResultsDiagnostics,
        precisionIssueKeySets: mergedSets,
        uniquePreciseIssueKeys: mergedSets.recommendedIssueKeys,
        precisionIssueSources: (response.issueSources ?? {}) as Record<string, string[]>,
        precisionProbeWarnings: (Array.isArray(response.warnings) ? response.warnings : []) as string[],
        precisionProbeErrors: (Array.isArray(response.errors) ? response.errors : []) as string[],
        precisionProbeLastRunAt: new Date().toISOString(),
        notice: `Precision Probe completed: ${summary.uniquePreciseIssueCount} unique candidate(s). / 精準查詢測試完成。`
      });
      finishRun(runId, activityStream, { mode: `precision:${userAnalysis.activityStreamQueryMode}`, user: userAnalysis.activityStreamUser.trim(), maxResults: userAnalysis.precisionProbeMaxResults, start: userAnalysis.startDate, end: endExclusive });
      if (status === "success" || status === "partial") await autoSaveRun("precision_probe_run", runId, status, { app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch }, requestContext: { selectedUsers, activityStreamUser: userAnalysis.activityStreamUser, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, dateQueryMode: userAnalysis.activityStreamDateQueryMode, chunkingMode: userAnalysis.activityStreamChunkingMode, customChunkDays: userAnalysis.activityStreamCustomChunkDays, maxResults: userAnalysis.precisionProbeMaxResults }, summary, probeResults: response.results, activityStream, dateSemantics, dateQueryResults, maxResultsDiagnostics, dateRangeChunking, activityStreamChunkResults, chunkMergeStats, issueKeySets: mergedSets, activityStreamRunHistory: userAnalysis.activityStreamRunHistory });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Precision Probe failed.";
      failRun(runId, message);
      appendDebugLog("precision", [`[ERROR] ${message}`]);
    }
  }

  async function runManualUrlReplay() {
    logAction("USER_ACTION", "Button clicked: Run Manual URL Replay / 執行手動 URL 重放");
    const connection = smokeConnection();
    if (!connection) return patchState({ precisionProbeErrors: ["Jira connection is not ready. / Jira 連線尚未就緒。"] });
    if (!userAnalysis.manualActivityStreamUrl.trim()) return patchState({ precisionProbeErrors: ["Please enter a Manual Activity Stream URL. / 請輸入手動 Activity Stream URL。"] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    try {
      const response = await window.desktopApp?.userAnalysis?.activityStreamManualReplay?.({ connection, manualUrl: userAnalysis.manualActivityStreamUrl, runId });
      if (!response) throw new Error("Electron Manual URL Replay API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      if (staleResult(String(response.runId || ""))) return;
      const diagnostics = response.manualUrlReplayDiagnostics as typeof userAnalysis.manualUrlReplayDiagnostics;
      const variantResult = response.variantResult as UserActivityStreamVariantResult | null;
      if (!variantResult) {
        const rejected = { ...userAnalysis.activityStream, runId, status: "failed" as const, overallStatus: "failed" as const, diagnosis: "blocked" as const, atomEntryCount: 0, parsedActivityCount: 0, parsedIssueKeys: [], parserDiagnostics: emptyParserDiagnostics };
        patchState({ manualUrlReplayDiagnostics: diagnostics, precisionProbeStatus: "failed", precisionProbeErrors: [`Manual URL rejected: ${diagnostics.rejectReason}`] });
        finishRun(runId, rejected, { startedAt: String(response.startedAt || ""), completedAt: String(response.completedAt || ""), mode: "manual_url", user: "manual", maxResults: userAnalysis.precisionProbeMaxResults, start: userAnalysis.startDate, end: endExclusive });
        return;
      }
      const manualActivityStream = response.activityStream as unknown as UserActivityStreamResult;
      const manualKeys = variantResult.parsedIssueKeys;
      setUserAnalysis((current) => {
        const activityStream = { ...manualActivityStream, variantResults: [...current.activityStream.variantResults.filter((item) => item.variant !== "manual_url"), variantResult], entriesSanitized: [...current.activityStream.entriesSanitized.filter((entry) => entry.variant !== "manual_url"), ...variantResult.entriesSanitized] };
        return { ...current, activityStream, manualActivityStreamResult: variantResult, manualUrlReplayDiagnostics: diagnostics, precisionIssueKeySets: { ...current.precisionIssueKeySets, manualActivityStreamIssueKeys: manualKeys, recommendedIssueKeys: manualKeys }, uniquePreciseIssueKeys: manualKeys, precisionIssueSources: Object.fromEntries(manualKeys.map((key) => [key, ["activity_stream_manual"]])), precisionProbeSummary: { ...current.precisionProbeSummary, activityStreamSupported: variantResult.supported, uniquePreciseIssueCount: manualKeys.length, recommendedStage1Mode: variantResult.parsed ? "activity_stream_manual" : "no_activity_found" }, precisionProbeStatus: variantResult.parsed ? "completed" : "partial", notice: `Manual URL replay ${variantResult.parsed ? "parsed" : "completed without parsed Jira keys"}. / 手動 URL 重放完成。` };
      });
      finishRun(runId, manualActivityStream, { startedAt: String(response.startedAt || ""), completedAt: String(response.completedAt || ""), mode: "manual_url", user: "manual", maxResults: userAnalysis.precisionProbeMaxResults, start: userAnalysis.startDate, end: endExclusive });
      if (variantResult.status === "success") await autoSaveRun("manual_url_replay_run", runId, "success", { app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch }, requestContext: { manualUrlReplay: true, requestUrlSanitized: diagnostics.requestUrlSanitized }, activityStream: manualActivityStream, manualUrlReplayDiagnostics: diagnostics, variantResult, activityStreamRunHistory: userAnalysis.activityStreamRunHistory });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Manual URL Replay failed.";
      failRun(runId, message);
    }
  }

  function requestLargeQuery(action: "activity" | "precision" | "cap") {
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    if (userAnalysis.precisionProbeMaxResults > 2000) {
      logAction("UI_MODAL", `Large Activity Stream query confirmation opened: maxResults=${userAnalysis.precisionProbeMaxResults} action=${action}`);
      setLargeQueryConfirmation({ open: true, input: "", error: "", action });
      return;
    }
    if (action === "precision") void runPrecisionProbe(false);
    else void runActivityStreamOnly(false, action === "cap");
  }

  function cancelLargeQuery() {
    logAction("USER_ACTION", "Large Activity Stream query confirmation cancelled");
    setLargeQueryConfirmation({ open: false, input: "", error: "", action: "" });
  }

  function confirmLargeQuery() {
    if (largeQueryConfirmation.input !== "CONFIRM") {
      logAction("GUARD", "Large Activity Stream query confirmation rejected: confirmation text mismatch");
      setLargeQueryConfirmation((current) => ({ ...current, error: "Please type CONFIRM exactly. / 請完整輸入 CONFIRM。" }));
      return;
    }
    const action = largeQueryConfirmation.action;
    logAction("USER_ACTION", `Large Activity Stream query confirmed: maxResults=${userAnalysis.precisionProbeMaxResults} action=${action}`);
    setLargeQueryConfirmation({ open: false, input: "", error: "", action: "" });
    if (action === "precision") void runPrecisionProbe(true);
    else void runActivityStreamOnly(true, action === "cap");
  }

  function addToFetchQueue() {
    logAction("USER_ACTION", "Button clicked: Add Precise Candidates to Fetch Queue / 加入精準候選到抓取佇列");
    setUserAnalysis((current) => {
      const issues = new Map(current.candidateIssues.map((issue) => [issue.key, issue]));
      for (const key of current.precisionIssueKeySets.recommendedIssueKeys) {
        const sources = current.precisionIssueSources[key] ?? [];
        const reason = `Precision Probe matched: ${sources.join(", ") || "unknown"}`;
        const existing = issues.get(key);
        issues.set(key, existing ? { ...existing, matchedReason: existing.matchedReason.includes(reason) ? existing.matchedReason : `${existing.matchedReason}; ${reason}` } : {
          id: key, key, summary: "", status: "", assignee: "", reporter: "", creator: "", updated: "", created: "", issueType: "", priority: "", project: key.split("-")[0] ?? "", matchedReason: reason
        } satisfies UserAnalysisCandidateIssue);
      }
      return { ...current, candidateIssues: Array.from(issues.values()), selectedForFetch: Array.from(new Set([...current.selectedForFetch, ...current.precisionIssueKeySets.recommendedIssueKeys])), notice: `${current.precisionIssueKeySets.recommendedIssueKeys.length} recommended candidate(s) added to User Analysis Fetch Queue. Full Fetch was not started. / 已加入使用者分析抓取佇列，未自動執行完整抓取。` };
    });
  }

  function exportPayload() {
    const manual = userAnalysis.manualActivityStreamResult;
    const activityStream = {
      ...userAnalysis.activityStream,
      overallStatus: manual?.parsed ? "success" : userAnalysis.activityStream.overallStatus,
      parsed: Boolean(manual?.parsed || userAnalysis.activityStream.parsed),
      diagnosis: manual?.parsed ? "parsed" : userAnalysis.activityStream.diagnosis,
      bestVariant: manual?.parsed ? "manual_url" : userAnalysis.activityStream.bestVariant,
      bestActivityStreamUser: manual?.parsed ? "manual" : userAnalysis.activityStream.bestActivityStreamUser,
      bestParsedIssueKeys: manual?.parsed ? manual.parsedIssueKeys : userAnalysis.activityStream.bestParsedIssueKeys,
      parsedActivityCount: userAnalysis.activityStream.entriesSanitized.filter((entry) => entry.variant !== "manual_url" && Boolean(entry.activityTitle || entry.activityAuthor || entry.activityTime || entry.activityType !== "unknown")).length + (manual?.parsedActivityCount ?? 0),
      parsedIssueKeys: Array.from(new Set([...userAnalysis.activityStream.parsedIssueKeys, ...(manual?.parsedIssueKeys ?? [])])).sort(),
      atomEntryCount: userAnalysis.activityStream.variantResults.filter((item) => item.variant !== "manual_url").reduce((sum, item) => sum + item.atomEntryCount, 0) + (manual?.atomEntryCount ?? 0),
      variantResults: [...userAnalysis.activityStream.variantResults.filter((item) => item.variant !== "manual_url"), ...(manual ? [manual] : [])],
      entriesSanitized: [...userAnalysis.activityStream.entriesSanitized.filter((entry) => entry.variant !== "manual_url"), ...(manual?.entriesSanitized ?? [])],
      firstEntriesSanitized: manual?.parsed ? manual.firstEntriesSanitized : userAnalysis.activityStream.firstEntriesSanitized,
      manualReplay: { enabled: Boolean(manual), status: manual?.status ?? "not_run", requestUrlSanitized: userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized }
    };
    return {
      exportType: "user-activity-precision-probe",
      app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch },
      exportedAt: new Date().toISOString(), globalDataSourceMode: "live_jira_api",
      source: { type: "live_jira_api", baseUrl: activeConnection?.baseUrl ?? "", apiVersion: activeConnection?.apiVersion ?? "v2", authType: activeConnection?.authType ?? "bearer", readOnly: true, databaseWrite: false, attachmentDownload: false, token: "[masked]", authorization: "[masked]" },
      requestContext: { selectedUsers, activityStreamUser: userAnalysis.activityStreamUser, activityStreamQueryMode: userAnalysis.activityStreamQueryMode, relativeLinks: userAnalysis.activityStreamRelativeLinks, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate, endInclusive: true }, jqlDateRange: { startInclusive: userAnalysis.startDate, endExclusive }, projectScope: userAnalysis.precisionProjectScope, probeMaxResults: userAnalysis.precisionProbeMaxResults },
      summary: userAnalysis.precisionProbeSummary,
      probeResults: userAnalysis.precisionProbeResults,
      activityStream,
      dateSemantics: { ...userAnalysis.activityStreamDateSemantics, clientDateFilterApplied: userAnalysis.parsedEntriesFilter.applyClientDateFilter },
      dateQueryResults: userAnalysis.activityStreamDateQueryResults,
      dateRangeChunking: userAnalysis.activityStreamDateRangeChunking,
      activityStreamChunkResults: userAnalysis.activityStreamChunkResults,
      chunkMergeStats: userAnalysis.activityStreamChunkMergeStats,
      maxResultsDiagnostics: userAnalysis.activityStreamMaxResultsDiagnostics,
      maxResultsCapTestResults: userAnalysis.activityStreamCapTestResults,
      clientDateFilteredEntriesSanitized: clientDateFilteredEntries.slice(0, 200),
      manualUrlReplayDiagnostics: userAnalysis.manualUrlReplayDiagnostics,
      activityStreamRunHistory: userAnalysis.activityStreamRunHistory,
      parsedEntriesFilter: userAnalysis.parsedEntriesFilter,
      parsedEntriesFilterStats: filterStats,
      filteredEntriesSanitized: filteredEntries.slice(0, 200),
      parsedEntriesTableState: { pageSize: userAnalysis.parsedEntriesPageSize, currentPage: currentEntryPage, totalPages: totalEntryPages, filteredEntries: filteredEntries.length },
      activityEntryStats: userAnalysis.activityStream.activityEntryStats,
      autoSave: userAnalysis.lastAutoSavedResult ? { enabled: true, savedAt: userAnalysis.lastAutoSavedResult.savedAt, path: userAnalysis.lastAutoSavedResult.path, resultType: userAnalysis.lastAutoSavedResult.resultType } : { enabled: true, savedAt: "", path: "", resultType: "not_run" },
      debugBundleHints: { includeInDebugBundle: true, resultType: "precision_probe_export", latestResult: true },
      autoSavedResultPaths: userAnalysis.autoSavedResultPaths,
      crossPageDebugBundleTodo,
      issueKeySets: userAnalysis.precisionIssueKeySets,
      uniquePreciseIssueKeys: userAnalysis.uniquePreciseIssueKeys,
      recommendations: [`Recommended Stage 1 Mode: ${userAnalysis.precisionProbeSummary.recommendedStage1Mode}`, "updatedBy may not exactly match Activity Stream user actions in this Jira environment. / updatedBy 在此 Jira 環境中不一定等同於 Activity Stream 實際使用者操作紀錄。"],
      warnings: userAnalysis.precisionProbeWarnings, errors: userAnalysis.precisionProbeErrors,
      debugLogSanitized: getDebugLogs("precision"),
      debugLogNote: "debugLogSanitized may contain the recent UI debug buffer only. See actionLogDiagnostics.actionLogPath for complete USER_ACTION / GUARD / UI_MODAL timeline.",
      actionLogDiagnostics: { actionLogPath: userAnalysis.actionLogPath, actionLogAvailable: userAnalysis.actionLogAvailable }
    };
  }

  async function saveResult() {
    logAction("USER_ACTION", "Button clicked: Save Precision Probe Result / 儲存精準查詢測試結果");
    if (userAnalysis.precisionProbeResults.length === 0 && userAnalysis.activityStream.status === "not_run") return logAction("GUARD", "Action blocked: No Precision Probe result yet / 尚無測試結果");
    patchState({ saving: true });
    try {
      const result = await window.desktopApp?.userAnalysis?.saveExport?.({ category: "user-analysis", defaultFileName: `user-activity-precision-probe-${stamp()}.json`, data: exportPayload() });
      if (!result) throw new Error("Electron export API is not available.");
      patchState({ saving: false, lastSavedPrecisionProbePath: result.filePath ?? "", lastSavedExportFolderPath: result.folderPath ?? "", notice: `Saved to: ${result.filePath}` });
      appendDebugLog("precision", [`[INFO] Precision Probe result saved: ${result.filePath}`, "[INFO] Token: [masked]", "[INFO] Authorization: [masked]"]);
    } catch (error) {
      patchState({ saving: false, precisionProbeErrors: [error instanceof Error ? error.message : "Save failed."] });
    }
  }

  const stream = userAnalysis.activityStream;
  return <>
    <PageHeader title="User Activity Precision Probe" subtitle="使用者活動精準查詢測試" />
    {largeQueryConfirmation.open ? <MockModal title="Large Activity Stream Query Confirmation / 大型查詢確認" onClose={cancelLargeQuery} footer={<><button className="btn" type="button" onClick={cancelLargeQuery}>Cancel / 取消</button><button data-testid="confirm-large-max" className="btn btn-primary" type="button" onClick={confirmLargeQuery}><Play size={16} />Confirm and Run / 確認並執行</button></>}><div className="space-y-3 leading-relaxed"><p>You are about to request up to <b>{userAnalysis.precisionProbeMaxResults}</b> Activity Stream entries.<br />你即將要求最多 <b>{userAnalysis.precisionProbeMaxResults}</b> 筆 Activity Stream entries。</p><p>This can increase response time and Jira server load. No Jira or database write will occur.<br />這可能增加回應時間與 Jira server 負載，但不會寫入 Jira 或資料庫。</p><div><FieldLabel label="Type CONFIRM to continue" sub="請輸入 CONFIRM 才能繼續" /><input data-testid="large-max-confirm-input" className="field" autoFocus value={largeQueryConfirmation.input} onChange={(event) => setLargeQueryConfirmation((current) => ({ ...current, input: event.target.value, error: "" }))} placeholder="CONFIRM" />{largeQueryConfirmation.error ? <div className="mt-2 text-sm font-bold text-red-700">{largeQueryConfirmation.error}</div> : null}</div></div></MockModal> : null}
    <SectionCard className="mb-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-relaxed text-cyan-950">Activity Stream is the preferred actual-activity validation source. updatedBy remains a candidate source and may include automation or indexing effects.<br />Activity Stream 優先作為實際活動驗證來源；updatedBy 僅為候選來源，可能包含自動化或索引影響。</div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div><FieldLabel label="Selected Users" sub="選擇使用者" /><textarea className="field min-h-24" value={userAnalysis.selectedUsersText} onChange={(event) => patchState({ selectedUsersText: event.target.value })} /></div>
        <div><FieldLabel label="Activity Stream User" sub="Activity Stream 使用者" /><input data-testid="activity-stream-user" className="field" value={userAnalysis.activityStreamUser} placeholder="roger_hsieh or roger_hsieh@phison.com" onChange={(event) => { logAction("USER_ACTION", `Activity Stream User changed: value=${event.target.value}`); patchState({ activityStreamUser: event.target.value }); }} /><div className="mt-2 text-xs font-semibold text-muted">Username and email are supported. / 支援 username 與 email。</div></div>
        <div><FieldLabel label="Activity Stream User Query Mode" sub="Activity Stream 使用者查詢模式" /><select data-testid="activity-stream-query-mode" className="field" value={userAnalysis.activityStreamQueryMode} onChange={(event) => { const value = event.target.value as typeof userAnalysis.activityStreamQueryMode; logAction("USER_ACTION", `Activity Stream Query Mode changed: value=${value}`); patchState({ activityStreamQueryMode: value }); }}><option value="auto">Auto / 自動（建議）</option><option value="username">Username only / 只用帳號</option><option value="email">Email only / 只用 Email</option><option value="custom">Custom only / 只用自訂輸入</option></select><div className="mt-2 text-xs font-semibold leading-relaxed text-muted">Auto tries username, escaped username, and email variants without duplicates. / 自動模式會依序測試帳號、跳脫帳號與 Email。</div></div>
        <div className="grid grid-cols-2 gap-2"><div><FieldLabel label="Start Date" sub="開始日期" /><input data-testid="activity-stream-start-date" className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} /></div><div><FieldLabel label="End Date" sub="結束日期" /><input data-testid="activity-stream-end-date" className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} /></div></div>
        <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input className="field" value={userAnalysis.precisionProjectScope} placeholder="COPGEN1, FW" onChange={(event) => patchState({ precisionProjectScope: event.target.value })} /></div>
        <div><FieldLabel label="Probe Max Results" sub="最大回傳筆數（1–65535）" /><input data-testid="probe-max-results" className="field" type="number" min={1} max={65535} value={userAnalysis.precisionProbeMaxResults} onChange={(event) => { const value = Number(event.target.value); logAction("USER_ACTION", `Probe Max Results changed: value=${value}`); patchState({ precisionProbeMaxResults: value, precisionProbeMaxResultsSource: "custom" }); }} /><div className="mt-2 flex flex-wrap gap-1">{maxResultsQuickValues.map((value) => <button data-testid={`max-quick-${value}`} key={value} className="btn px-2 py-1 text-xs" type="button" onClick={() => patchState({ precisionProbeMaxResults: value, precisionProbeMaxResultsSource: "quick" })}>{value}</button>)}</div></div>
        <div><FieldLabel label="Activity Stream Date Query Mode" sub="Activity Stream 日期查詢模式" /><select data-testid="activity-stream-date-query-mode" className="field" value={userAnalysis.activityStreamDateQueryMode} onChange={(event) => patchState({ activityStreamDateQueryMode: event.target.value as typeof userAnalysis.activityStreamDateQueryMode })}><option value="none">None / 不使用 server 日期條件</option><option value="startDate_endDate">startDate/endDate query</option><option value="update_date_after_before">update-date AFTER/BEFORE query</option><option value="both">Both / 同時測試（建議）</option></select></div>
        <div><FieldLabel label="Date Range Chunking" sub="Long-range update-date requests" /><select data-testid="activity-stream-chunking-mode" className="field" value={userAnalysis.activityStreamChunkingMode} onChange={(event) => patchState({ activityStreamChunkingMode: event.target.value as typeof userAnalysis.activityStreamChunkingMode })}><option value="off">Off</option><option value="auto">Auto</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="custom_days">Custom Days</option></select>{userAnalysis.activityStreamChunkingMode === "custom_days" ? <div className="mt-2"><FieldLabel label="Custom Days" sub="1-31 days per chunk" /><input data-testid="activity-stream-custom-chunk-days" className="field" type="number" min={1} max={31} value={userAnalysis.activityStreamCustomChunkDays} onChange={(event) => patchState({ activityStreamCustomChunkDays: Number(event.target.value) })} /></div> : null}<div className="mt-2 text-xs font-semibold leading-relaxed text-muted">Auto: up to 31 days uses one request; longer ranges use monthly update-date chunks.</div></div>
        <label className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-bold text-ink"><input type="checkbox" checked={userAnalysis.activityStreamRelativeLinks} onChange={(event) => patchState({ activityStreamRelativeLinks: event.target.checked })} />Use relativeLinks=true / 使用 relativeLinks=true</label>
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">Requested range: {userAnalysis.startDate || "-"} .. {userAnalysis.endDate || "-"} inclusive<br />Server endExclusive: {endExclusive || "-"}<br />Timezone: Asia/Taipei / UTC+8</div>
      </div>
      {userAnalysis.precisionProbeMaxResults > 500 ? <div data-testid="large-max-warning" className={`mt-3 rounded-lg border p-3 text-sm font-bold ${userAnalysis.precisionProbeMaxResults > 10000 ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{userAnalysis.precisionProbeMaxResults > 10000 ? "Strong warning: this query may timeout, stall the UI, or increase Jira server load. / 強烈警告：此查詢可能逾時、造成 UI 卡頓或增加 Jira server 負載。" : "Large Activity Stream query requested. / 大型 Activity Stream 查詢提醒。"}{userAnalysis.precisionProbeMaxResults > 2000 ? <><br />Type CONFIRM before this request can run. / 執行前必須輸入 CONFIRM。</> : null}</div> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button data-testid="run-activity-stream" className="btn" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("activity")}><Radio size={16} />Run Activity Stream Probe / 執行 Activity Stream 測試</button><button data-testid="run-precision-probe" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("precision")}><Play size={16} />Run Precision Probe / 執行精準查詢測試</button><button data-testid="save-precision-probe" className="btn" type="button" disabled={userAnalysis.saving || userAnalysis.isActivityStreamRunning || (userAnalysis.precisionProbeResults.length === 0 && stream.status === "not_run")} onClick={() => void saveResult()}><Download size={16} />Save Precision Probe Result / 儲存精準查詢測試結果</button><button data-testid="add-precision-queue" className="btn" type="button" disabled={userAnalysis.isActivityStreamRunning || userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length === 0} onClick={addToFetchQueue}><DatabaseZap size={16} />Add Recommended Keys to Fetch Queue / 加入建議 Jira 到抓取佇列</button></div>
      {userAnalysis.isActivityStreamRunning ? <div data-testid="activity-stream-running" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Running Activity Stream Probe...<br />Run ID: {userAnalysis.currentActivityStreamRunId}</div> : null}
      {userAnalysis.notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{userAnalysis.notice}</div> : null}
    </SectionCard>

    <SectionCard title="Last Auto-Saved Result" subtitle="最後自動儲存結果" className="mb-4">
      {userAnalysis.lastAutoSavedResult ? <div data-testid="last-auto-saved-result" className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0 text-sm font-semibold leading-relaxed"><div className="break-all"><b>Path:</b> {userAnalysis.lastAutoSavedResult.path}</div><div><b>Saved At:</b> {userAnalysis.lastAutoSavedResult.savedAt}</div><div><b>Run ID:</b> {userAnalysis.lastAutoSavedResult.runId}</div><div><b>Result Type:</b> {userAnalysis.lastAutoSavedResult.resultType}</div><div><b>Status:</b> {userAnalysis.lastAutoSavedResult.status}</div></div><div className="flex flex-wrap items-start gap-2"><button data-testid="open-auto-save-folder" className="btn" type="button" onClick={() => void window.desktopApp?.userAnalysis?.openExportFolder?.({ folderPath: userAnalysis.lastAutoSavedResult?.folderPath })}><FolderOpen size={16} />Open Folder / 開啟資料夾</button><button data-testid="copy-auto-save-path" className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(userAnalysis.lastAutoSavedResult?.path ?? "")}><Copy size={16} />Copy Path / 複製路徑</button></div></div> : <div className="text-sm font-semibold text-muted">No auto-saved run yet. / 尚無自動儲存結果。</div>}
    </SectionCard>

    <SectionCard title="Auto-Saved Result Tracking" subtitle="Latest, successful, parsed, and no-entry snapshots" className="mb-4">
      <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2" data-testid="auto-save-result-tracking">{[
        ["Latest Run Result", "latest-run-auto-save", userAnalysis.lastAutoSavedResult],
        ["Last Successful Auto-Saved Result", "last-successful-auto-save", userAnalysis.lastSuccessfulAutoSavedResult],
        ["Last Parsed Auto-Saved Result", "last-parsed-auto-save", userAnalysis.lastParsedAutoSavedResult],
        ["Latest No Entries Result", "latest-no-entries-auto-save", userAnalysis.latestNoEntriesAutoSavedResult]
      ].map(([label, testId, value]) => { const result = value as typeof userAnalysis.lastAutoSavedResult; return <div key={String(testId)} data-testid={String(testId)} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3"><div className="text-sm font-black text-ink">{String(label)}</div>{result ? <><div className="mt-2 text-xs font-semibold leading-relaxed text-muted"><div><b>Run ID:</b> {result.runId}</div><div><b>Status:</b> {result.status}</div><div><b>Diagnosis:</b> {result.diagnosis}</div><div><b>Parsed:</b> {result.parsedActivityCount}</div><div className="break-all"><b>Path:</b> {result.path}</div></div><div className="mt-3 flex flex-wrap gap-2"><button className="btn px-2 py-1 text-xs" type="button" onClick={() => void window.desktopApp?.userAnalysis?.openExportFolder?.({ folderPath: result.folderPath })}><FolderOpen size={14} />Open Folder</button><button className="btn px-2 py-1 text-xs" type="button" onClick={() => void navigator.clipboard?.writeText(result.path)}><Copy size={14} />Copy Path</button></div></> : <div className="mt-2 text-sm font-semibold text-muted">not_available</div>}</div>; })}</div>
    </SectionCard>

    <SectionCard title="Manual Activity Stream URL Replay" subtitle="手動 Activity Stream URL 重放" className="mb-4">
      <FieldLabel label="Manual Activity Stream URL" sub="手動 Activity Stream URL" />
      <textarea data-testid="manual-activity-stream-url" className="field min-h-24 break-all" value={userAnalysis.manualActivityStreamUrl} placeholder="https://jira.example.com/plugins/servlet/streams?maxResults=10&relativeLinks=true&streams=user+IS+roger%5C_hsieh" onChange={(event) => { logAction("USER_ACTION", "Manual Activity Stream URL changed"); patchState({ manualActivityStreamUrl: event.target.value }); }} />
      <div className="mt-3 flex flex-wrap items-center gap-3"><button data-testid="run-manual-activity-stream" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => void runManualUrlReplay()}><Radio size={16} />Run Manual URL Replay / 執行手動 URL 重放</button>{userAnalysis.manualUrlReplayDiagnostics.manualUrlProvided ? <StatusBadge>{userAnalysis.manualUrlReplayDiagnostics.manualUrlAccepted ? "Manual URL validated / 手動 URL 驗證通過" : "Manual URL rejected / 手動 URL 被拒絕"}</StatusBadge> : null}</div>
      {userAnalysis.manualUrlReplayDiagnostics.rejectReason ? <div data-testid="manual-replay-reject" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Reject reason / 拒絕原因：{userAnalysis.manualUrlReplayDiagnostics.rejectReason}</div> : null}
      {userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized ? <div className="mt-3 break-all rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-900">{userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized}</div> : null}
    </SectionCard>

    <SectionCard title="Date Semantics Result" subtitle="日期語意驗證結果" className="mb-4">
      <div data-testid="date-semantics-result" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"><MiniStat label="Date Query Mode" value={userAnalysis.activityStreamDateQueryMode} /><MiniStat label="Requested Range" value={`${userAnalysis.startDate} .. ${userAnalysis.endDate}`} /><MiniStat label="Timezone" value="Asia/Taipei UTC+8" /><MiniStat label="Server Returned Entries" value={userAnalysis.activityStreamDateSemantics.rawReturnedEntries} /><MiniStat label="Client Date Filtered Entries" value={userAnalysis.activityStreamDateSemantics.clientDateFilteredEntries} /><MiniStat label="Date Filter Effective" value={String(userAnalysis.activityStreamDateSemantics.serverDateFilterEffective)} /><MiniStat label="Best Date Query Mode" value={userAnalysis.activityStreamDateSemantics.bestDateQueryMode} /></div>
      <ResponsiveTableContainer className="mt-4"><table data-testid="date-query-results" className="table min-w-[1200px]"><thead><tr>{["Mode", "Atom", "Parsed", "Inside", "Outside", "Newest", "Oldest", "Effective", "Filter Key"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamDateQueryResults.map((result) => <tr key={result.mode}><td>{result.mode}</td><td>{result.atomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.entriesInsideRequestedRange}</td><td>{result.entriesOutsideRequestedRange}</td><td>{result.newestEntryTime || "-"}</td><td>{result.oldestEntryTime || "-"}</td><td><StatusBadge>{String(result.dateFilterEffective)}</StatusBadge></td><td>{result.dateFilterKeyTested || "-"}</td></tr>)}{userAnalysis.activityStreamDateQueryResults.length === 0 ? <tr><td colSpan={9} className="text-center text-muted">Run Activity Stream Probe to verify date semantics. / 請先執行 Activity Stream 測試。</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      {userAnalysis.activityStreamDateSemantics.warnings.map((warning) => <div key={warning} className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">{warning}</div>)}
    </SectionCard>

    <SectionCard title="Date Range Chunking Result" subtitle="分段查詢與合併診斷" className="mb-4">
      <div data-testid="chunking-summary" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3"><MiniStat label="Chunking Enabled" value={String(userAnalysis.activityStreamDateRangeChunking.enabled)} /><MiniStat label="Mode" value={userAnalysis.activityStreamDateRangeChunking.mode} /><MiniStat label="Chunk Count" value={userAnalysis.activityStreamDateRangeChunking.chunkCount} /><MiniStat label="Successful Chunks" value={userAnalysis.activityStreamChunkMergeStats.successfulChunks} /><MiniStat label="No Entry Chunks" value={userAnalysis.activityStreamChunkMergeStats.noEntryChunks} /><MiniStat label="Failed Chunks" value={userAnalysis.activityStreamChunkMergeStats.failedChunks} /><MiniStat label="Total Atom Entries" value={userAnalysis.activityStreamChunkMergeStats.totalChunkAtomEntries} /><MiniStat label="Merged Activities" value={userAnalysis.activityStreamChunkMergeStats.mergedActivityEntries} /><MiniStat label="Duplicates Removed" value={userAnalysis.activityStreamChunkMergeStats.duplicateEntriesRemoved} /></div>
      {userAnalysis.activityStreamDateRangeChunking.largeRangeWarning ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">Large date range: monthly chunking is recommended and enabled in Auto mode.</div> : null}
      <ResponsiveTableContainer className="mt-4"><table data-testid="activity-stream-chunk-results" className="table min-w-[1250px]"><thead><tr>{["Chunk", "Start", "End Exclusive", "HTTP", "Diagnosis", "Atom", "Parsed", "Jira", "Confluence", "Request"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamChunkResults.map((chunk) => <tr key={chunk.chunkIndex}><td>{chunk.chunkIndex}</td><td>{chunk.chunkStart}</td><td>{chunk.chunkEndExclusive}</td><td>{chunk.httpStatus}</td><td><StatusBadge>{chunk.diagnosis}</StatusBadge></td><td>{chunk.atomEntryCount}</td><td>{chunk.parsedActivityCount}</td><td>{chunk.entriesWithIssueKeyCount}</td><td>{chunk.confluenceOnlyEntryCount}</td><td><span className="block max-w-[420px] truncate" title={chunk.requestUrlSanitized} data-allow-truncate="true">{chunk.requestUrlSanitized}</span></td></tr>)}{userAnalysis.activityStreamChunkResults.length === 0 ? <tr><td colSpan={10} className="text-center text-muted">No chunked run yet.</td></tr> : null}</tbody></table></ResponsiveTableContainer>
    </SectionCard>

    <SectionCard title="MaxResults Cap Test" subtitle="最大回傳上限測試" className="mb-4">
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-[220px]"><FieldLabel label="Test Value" sub="測試筆數" /><select data-testid="cap-test-value" className="field" value={capTestValues.includes(userAnalysis.precisionProbeMaxResults as typeof capTestValues[number]) ? userAnalysis.precisionProbeMaxResults : 50} onChange={(event) => patchState({ precisionProbeMaxResults: Number(event.target.value), precisionProbeMaxResultsSource: "quick" })}>{capTestValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></div><button data-testid="run-cap-test" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("cap")}><Radio size={16} />Run MaxResults Cap Test / 執行上限測試</button></div>
      <div data-testid="max-results-diagnostics" className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"><MiniStat label="Requested MaxResults" value={userAnalysis.activityStreamMaxResultsDiagnostics.requestedMaxResults} /><MiniStat label="Actual Atom Entries" value={userAnalysis.activityStreamMaxResultsDiagnostics.actualAtomEntryCount} /><MiniStat label="Parsed Activities" value={userAnalysis.activityStreamMaxResultsDiagnostics.parsedActivityCount} /><MiniStat label="Response Time" value={`${userAnalysis.activityStreamMaxResultsDiagnostics.responseTimeMs} ms`} /><MiniStat label="Response Size" value={`${userAnalysis.activityStreamMaxResultsDiagnostics.responseSizeKB} KB`} /><MiniStat label="Server Cap Detected" value={String(userAnalysis.activityStreamMaxResultsDiagnostics.serverCapDetected)} /><MiniStat label="Estimated Cap" value={userAnalysis.activityStreamMaxResultsDiagnostics.serverCapValueEstimated ?? "-"} /></div>
      <ResponsiveTableContainer className="mt-4"><table data-testid="cap-test-results" className="table min-w-[900px]"><thead><tr>{["Requested", "Actual Atom", "Parsed", "Response", "Size KB", "Cap", "Estimated"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamCapTestResults.map((result, index) => <tr key={`${result.requestedMaxResults}-${index}`}><td>{result.requestedMaxResults}</td><td>{result.actualAtomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.responseTimeMs} ms</td><td>{result.responseSizeKB}</td><td>{String(result.serverCapDetected)}</td><td>{result.serverCapValueEstimated ?? "-"}</td></tr>)}{userAnalysis.activityStreamCapTestResults.length === 0 ? <tr><td colSpan={7} className="text-center text-muted">No cap tests yet. A single short result cannot prove a server cap. / 尚無上限測試，單次結果不足以判定 server cap。</td></tr> : null}</tbody></table></ResponsiveTableContainer>
    </SectionCard>

    <SectionCard title="Activity Stream Result" subtitle="Activity Stream 結果" className="mb-4">
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3" data-testid="activity-entry-summary"><MiniStat label="Overall Status / 整體狀態" value={stream.overallStatus} /><MiniStat label="Diagnosis / 診斷" value={stream.diagnosis} /><MiniStat label="Total Activity Entries / 全部活動筆數" value={stream.activityEntryStats.totalAtomEntries} /><MiniStat label="Parsed Activity Entries / 已解析活動筆數" value={stream.activityEntryStats.parsedActivityEntryCount} /><MiniStat label="Entries with Jira Key / 含 Jira Key 活動" value={stream.activityEntryStats.entriesWithIssueKeyCount} /><MiniStat label="Confluence-only Entries / Confluence-only 活動" value={stream.activityEntryStats.confluenceOnlyEntryCount} /><MiniStat label="Non-Jira Entries / 非 Jira 活動" value={stream.activityEntryStats.nonJiraEntryCount} /><MiniStat label="Unique Jira Issue Keys / 去重 Jira 數" value={stream.activityEntryStats.uniqueIssueKeyCount} /><MiniStat label="Best Variant / 最佳變體" value={userAnalysis.manualActivityStreamResult?.parsed ? "manual_url" : stream.bestVariant || "-"} /></div>
      <div className="mb-3 break-all rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold text-muted">GET {stream.requestUrlSanitized || "/plugins/servlet/streams?..."}<br />Best date query mode / 最佳日期查詢模式：{userAnalysis.activityStreamDateSemantics.bestDateQueryMode}</div>
      {stream.bestVariantReason === "all_variants_no_entries" ? <div data-testid="all-variants-no-entries" className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">No Activity Stream entries found for all user variants. / 所有使用者查詢變體均未找到 Activity Stream entries。</div> : null}
      <h3 className="mb-2 text-sm font-black text-ink">Query Variants / 查詢變體</h3>
      <ResponsiveTableContainer className="mb-4"><table className="table min-w-[1200px]" data-testid="activity-stream-variants"><thead><tr>{["Variant", "User", "HTTP", "Content Type", "Reachable", "Supported", "Atom Entries", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{[...stream.variantResults.filter((item) => item.variant !== "manual_url"), ...(userAnalysis.manualActivityStreamResult ? [userAnalysis.manualActivityStreamResult] : [])].map((result) => <tr key={`${result.variant}-${result.activityStreamUser}`}><td className="font-bold">{result.variant}</td><td>{result.activityStreamUser}</td><td>{result.httpStatus}</td><td>{result.contentType || "-"}</td><td>{result.reachable ? "yes" : "no"}</td><td>{result.supported}</td><td>{result.atomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.parsedIssueKeys.join(", ") || "-"}</td><td><StatusBadge>{result.diagnosis}</StatusBadge></td></tr>)}{stream.variantResults.length === 0 && !userAnalysis.manualActivityStreamResult ? <tr><td colSpan={10} className="text-center text-muted">No query variants yet / 尚無查詢變體</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      <h3 className="mb-2 text-sm font-black text-ink">Parser Diagnostics / 解析診斷</h3>
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="parser-diagnostics"><MiniStat label="Atom Entries" value={stream.parserDiagnostics.atomEntryCount} /><MiniStat label="Parsed Entries" value={stream.parserDiagnostics.parsedEntryCount} /><MiniStat label="Skipped Entries" value={stream.parserDiagnostics.skippedEntryCount} /><MiniStat label="With Issue Key" value={stream.parserDiagnostics.entriesWithIssueKeyCount} /><MiniStat label="Without Issue Key" value={stream.parserDiagnostics.entriesWithoutIssueKeyCount} /><MiniStat label="Confluence-only" value={stream.parserDiagnostics.confluenceOnlyEntryCount} /><MiniStat label="Without Author" value={stream.parserDiagnostics.entriesWithoutAuthorCount} /><MiniStat label="Without Time" value={stream.parserDiagnostics.entriesWithoutTimeCount} /></div>
      {stream.parserDiagnostics.parserAnomaly ? <div data-testid="parser-anomaly" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">Parser anomaly detected: Atom entries were returned, but few entries were parsed.<br />解析異常：Activity Stream 回傳了 Atom entries，但只有少數 entries 被解析。<br />{stream.parserDiagnostics.parserAnomalyReason}</div> : null}
      {stream.parserDiagnostics.skippedEntriesSanitized.length > 0 ? <ResponsiveTableContainer className="mb-4"><table className="table min-w-[800px]"><thead><tr><th>Entry</th><th>Reason</th><th>Title</th><th>Time</th><th>Author</th></tr></thead><tbody>{stream.parserDiagnostics.skippedEntriesSanitized.map((entry) => <tr key={entry.entryIndex}><td>{entry.entryIndex}</td><td>{entry.reason}</td><td>{entry.rawTitleText || "-"}</td><td>{entry.rawUpdatedText || "-"}</td><td>{entry.rawAuthorText || "-"}</td></tr>)}</tbody></table></ResponsiveTableContainer> : null}
      <h3 className="mb-2 text-sm font-black text-ink">Parsed Entries / 解析項目</h3>
      <div className="mb-4 rounded-lg border border-line bg-slate-50 p-3" data-testid="parsed-entries-filter"><div className="mb-3 text-sm font-black text-ink">Parsed Entries Filter / 解析項目篩選</div><div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div><FieldLabel label="Activity Type" sub="活動類型（Ctrl/Cmd 多選；未選即 All）" /><select data-testid="filter-activity-types" multiple className="field min-h-32" value={userAnalysis.parsedEntriesFilter.activityTypes} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, activityTypes: Array.from(event.currentTarget.selectedOptions, (option) => option.value) as typeof userAnalysis.parsedEntriesFilter.activityTypes } })}>{activityTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
        <div><FieldLabel label="Issue Key" sub="Jira Key（partial match）" /><input data-testid="filter-issue-key" className="field" value={userAnalysis.parsedEntriesFilter.issueKeyQuery} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, issueKeyQuery: event.target.value } })} placeholder="COPGEN1-138930" /><label className="mt-3 flex items-center gap-2 text-sm font-bold"><input data-testid="filter-only-key" type="checkbox" checked={userAnalysis.parsedEntriesFilter.onlyWithIssueKey} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, onlyWithIssueKey: event.target.checked } })} />Only with Jira Key / 只顯示有 Jira Key</label></div>
        <div><FieldLabel label="Author" sub="作者、帳號或 Email" /><input data-testid="filter-author" className="field" value={userAnalysis.parsedEntriesFilter.authorQuery} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, authorQuery: event.target.value } })} placeholder="roger_hsieh" /></div>
        <div className="grid grid-cols-2 gap-2"><div><FieldLabel label="Filter Start" sub="篩選開始日期" /><input data-testid="filter-start" className="field" type="date" value={userAnalysis.parsedEntriesFilter.dateRange.start} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, dateRange: { ...userAnalysis.parsedEntriesFilter.dateRange, start: event.target.value } } })} /></div><div><FieldLabel label="Filter End" sub="篩選結束日期" /><input data-testid="filter-end" className="field" type="date" value={userAnalysis.parsedEntriesFilter.dateRange.end} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, dateRange: { ...userAnalysis.parsedEntriesFilter.dateRange, end: event.target.value } } })} /></div></div>
        <div><FieldLabel label="Variant" sub="查詢變體（Ctrl/Cmd 多選；未選即 All）" /><select data-testid="filter-variants" multiple className="field min-h-32" value={userAnalysis.parsedEntriesFilter.variants} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, variants: Array.from(event.currentTarget.selectedOptions, (option) => option.value) } })}>{variantOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
        <div><FieldLabel label="Source" sub="來源（Ctrl/Cmd 多選；未選即 All）" /><select data-testid="filter-sources" multiple className="field min-h-24" value={userAnalysis.parsedEntriesFilter.sources} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, sources: Array.from(event.currentTarget.selectedOptions, (option) => option.value) as typeof userAnalysis.parsedEntriesFilter.sources } })}>{sourceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
      </div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm font-bold"><input data-testid="apply-client-date-filter" type="checkbox" checked={userAnalysis.parsedEntriesFilter.applyClientDateFilter} onChange={(event) => patchState({ parsedEntriesFilter: { ...userAnalysis.parsedEntriesFilter, applyClientDateFilter: event.target.checked }, activityStreamDateSemantics: { ...userAnalysis.activityStreamDateSemantics, clientDateFilterApplied: event.target.checked } })} />Apply Client Date Filter / 套用本機日期篩選</label><button data-testid="reset-entry-filters" className="btn" type="button" onClick={() => patchState({ parsedEntriesFilter: { activityTypes: [], issueKeyQuery: "", onlyWithIssueKey: false, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, variants: [], sources: [], authorQuery: "", applyClientDateFilter: true } })}>Reset Filters / 重設篩選</button><span className="text-sm font-bold text-muted">Total Parsed Entries / 全部解析項目：{filterStats.totalParsedEntries} · Filtered Entries / 篩選後項目：{filterStats.filteredEntries} · Unique Issue Keys / 去重 Jira：{filterStats.uniqueIssueKeyCount}</span></div><div className="mt-2 text-xs font-semibold text-muted">Activity Types / 活動類型統計：{Object.entries(filterStats.activityTypeCounts).map(([type, count]) => `${type}: ${count}`).join(" · ") || "-"}</div></div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-3" data-testid="parsed-entries-pagination"><label className="flex items-center gap-2 text-sm font-bold">Page Size / 每頁筆數<select data-testid="parsed-page-size" className="field w-24" value={userAnalysis.parsedEntriesPageSize} onChange={(event) => patchState({ parsedEntriesPageSize: Number(event.target.value) as typeof userAnalysis.parsedEntriesPageSize, parsedEntriesPage: 1 })}>{[10, 20, 40, 80, 160].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div className="text-sm font-bold text-muted">Showing {showingStart}-{showingEnd} of {filteredEntries.length} / 第 {showingStart}-{showingEnd} 筆，共 {filteredEntries.length} 筆</div><div className="flex items-center gap-2"><button data-testid="parsed-prev-page" className="btn" type="button" disabled={currentEntryPage <= 1} onClick={() => patchState({ parsedEntriesPage: Math.max(1, currentEntryPage - 1) })}>Previous / 上一頁</button><span className="text-sm font-black">Page {currentEntryPage} of {totalEntryPages}</span><button data-testid="parsed-next-page" className="btn" type="button" disabled={currentEntryPage >= totalEntryPages} onClick={() => patchState({ parsedEntriesPage: Math.min(totalEntryPages, currentEntryPage + 1) })}>Next / 下一頁</button></div></div>
      <ResponsiveTableContainer><table className="table min-w-[1300px]" data-testid="activity-stream-results"><thead><tr>{["Run ID", "Variant", "Source", "Activity Type", "Issue Key", "Time", "Author", "Title Summary", "Details"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{paginatedEntries.map((entry, index) => { const entryKey = `${entry.runId}-${entry.variant}-${entry.entryIndex}-${entry.activityTime}`; const expanded = userAnalysis.expandedActivityEntries.includes(entryKey); return [<tr key={entryKey}><td>{entry.runId || "-"}</td><td>{entry.variant || "-"}</td><td>{entry.source}</td><td>{entry.activityType}</td><td className="font-black text-blue-700">{entry.issueKey || "-"}</td><td>{entry.activityTime || "-"}</td><td>{entry.activityAuthor || "-"}</td><td><span className="block max-w-[320px] truncate" title={entry.activityTitle} data-allow-truncate="true">{entry.activityTitle.slice(0, 200) || "-"}</span></td><td><button data-testid={`entry-detail-${index}`} className="btn px-2 py-1 text-xs" type="button" onClick={() => patchState({ expandedActivityEntries: expanded ? userAnalysis.expandedActivityEntries.filter((key) => key !== entryKey) : [...userAnalysis.expandedActivityEntries, entryKey] })}>{expanded ? "Hide Details / 收合詳細" : "Show Details / 顯示詳細"}</button></td></tr>, expanded ? <tr key={`${entryKey}-detail`} data-testid="entry-detail-panel"><td colSpan={9}><div className="max-h-80 overflow-auto rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-950"><div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2"><div><b>Raw Title:</b> <span className="break-words">{entry.rawTitle || entry.activityTitle || "-"}</span></div><div><b>Raw Summary:</b> <span className="break-words">{entry.rawSummary || "-"}</span></div><div><b>Activity Application:</b> {entry.activityApplication}</div><div><b>Object Type:</b> {entry.objectType || "-"}</div><div><b>Target:</b> {entry.target || "-"}</div><div><b>Links:</b> {entry.links.join(", ") || "-"}</div><div><b>Author Email:</b> {entry.activityAuthorEmail || "-"}</div><div><b>Extracted Issue Keys:</b> {entry.extractedIssueKeysPerEntry.join(", ") || "-"}</div><div><b>Entry Index:</b> {entry.entryIndex}</div><div><b>Run / Variant / Source:</b> {entry.runId} / {entry.variant} / {entry.source}</div></div><div className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-blue-100 bg-white p-2"><b>Raw Content:</b> {entry.rawContent || "-"}</div><button data-testid={`copy-entry-${index}`} className="btn mt-3 px-2 py-1 text-xs" type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(entry, null, 2))}><Copy size={14} />Copy Entry JSON</button></div></td></tr> : null]; })}{filteredEntries.length === 0 ? <tr><td colSpan={9} className="text-center text-muted">No entries match the current filters / 沒有符合目前篩選條件的項目</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      {stream.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{stream.error}</div> : null}
    </SectionCard>

    <SectionCard title="Activity Stream Run History" subtitle="最近 5 次執行" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1150px]" data-testid="activity-stream-run-history"><thead><tr>{["Run ID", "Started", "Mode", "User", "Max", "Best Variant", "Atom", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamRunHistory.map((run) => <tr key={run.runId}><td>{run.runId}</td><td>{run.startedAt}</td><td>{run.mode}</td><td>{run.activityStreamUser}</td><td>{run.maxResults}</td><td>{run.bestVariant || "-"}</td><td>{run.atomEntryCount}</td><td>{run.parsedActivityCount}</td><td>{run.parsedIssueKeyCount}</td><td>{run.diagnosis}</td></tr>)}{userAnalysis.activityStreamRunHistory.length === 0 ? <tr><td colSpan={10} className="text-center text-muted">No runs yet / 尚無執行紀錄</td></tr> : null}</tbody></table></ResponsiveTableContainer></SectionCard>

    {userAnalysis.precisionProbeResults.length > 0 ? <><SectionCard title="Precision Probe Summary" subtitle="精準查詢測試摘要" className="mb-4"><div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"><MiniStat label="updatedBy Candidate / 候選來源" value={userAnalysis.precisionProbeSummary.updatedBySupported} /><MiniStat label="Activity Stream" value={userAnalysis.precisionProbeSummary.activityStreamSupported} /><MiniStat label="CHANGED BY" value={userAnalysis.precisionProbeSummary.changedBySupported} /><MiniStat label="Broad Baseline / 寬鬆基準" value={userAnalysis.precisionProbeSummary.broadCandidateCount} /><MiniStat label="Recommended Jira / 建議 Jira" value={userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length} /><MiniStat label="Potential Reduction / 預估減少" value={userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent === null ? "N/A" : `${userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent}%`} /></div><div data-testid="precision-recommendation" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Recommended Stage 1 Mode / 建議第一階段模式：{userAnalysis.precisionProbeSummary.recommendedStage1Mode}<br />Recommended Issue Keys / 建議 Jira：{userAnalysis.precisionIssueKeySets.recommendedIssueKeys.join(", ") || "-"}</div><div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-900">Candidate Issue Keys / 候選 Jira（updatedBy）：{userAnalysis.precisionIssueKeySets.updatedByCandidateIssueKeys.join(", ") || "-"}<br />updatedBy may not exactly match Activity Stream user actions in this Jira environment.<br />updatedBy 在此 Jira 環境中不一定等同於 Activity Stream 實際使用者操作紀錄。</div></SectionCard><SectionCard title="Probe Results" subtitle="測試結果" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1280px]" data-testid="precision-results-table"><thead><tr>{["Probe Method / 測試方法", "Status / 狀態", "HTTP", "Supported / 支援", "Count / 數量", "Sample Issue Keys", "Candidate Source", "Error", "Recommendation"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.precisionProbeResults.map((result) => <tr key={result.candidateSource}><td className="font-bold">{result.method}</td><td><StatusBadge>{result.status}</StatusBadge></td><td>{result.httpStatus}</td><td>{result.supported}</td><td className="font-black">{result.resultCount}</td><td>{result.sampleIssueKeys.join(", ") || "-"}</td><td>{result.candidateSource}</td><td>{result.error || "-"}</td><td>{result.recommendation}</td></tr>)}</tbody></table></ResponsiveTableContainer></SectionCard></> : null}
    {[...userAnalysis.precisionProbeWarnings, ...userAnalysis.precisionProbeErrors].map((message) => <div key={message} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{message}</div>)}
  </>;
}
