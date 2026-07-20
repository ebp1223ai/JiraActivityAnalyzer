import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { Copy, DatabaseZap, Download, FolderOpen, Play, Radio, RotateCcw, Square } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel, MockModal } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserActivityStreamDateQueryResult, type UserActivityStreamDateSemantics, type UserActivityStreamMaxResultsDiagnostics, type UserActivityStreamResult, type UserActivityStreamVariantResult, type UserAnalysisCandidateIssue, type UserAnalysisPrecisionProbeResult, type UserAnalysisPrecisionProbeSummary } from "../state/SessionStateContext";
import type { ActivityStreamProbeRun, ActivityStreamRequestWindowType, ActivityStreamMergeStrategy } from "../../electron/activityStreamStability";

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

const activityTypeOptions = ["link", "comment", "attachment", "status_change", "resolution_change", "assignee_change", "field_change", "description_update", "page", "unknown"] as const;
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

type AutoSavedResultMetadata = {
  path: string; folderPath: string; savedAt: string; runId: string; resultType: string;
  status: string; diagnosis: string; parsedActivityCount: number;
};

type ResultTrackingRole = { label: string; testId: string; value: AutoSavedResultMetadata | null };

function groupResultTrackingByRunId(roles: ResultTrackingRole[]) {
  const groups = new Map<string, { result: AutoSavedResultMetadata; roles: ResultTrackingRole[] }>();
  for (const role of roles) {
    if (!role.value) continue;
    const current = groups.get(role.value.runId);
    if (current) current.roles.push(role);
    else groups.set(role.value.runId, { result: role.value, roles: [role] });
  }
  return Array.from(groups.values());
}

export function PrecisionProbePage() {
  const location = useLocation();
  const { activeConnection } = useConnectionContext();
  const { userAnalysis, setUserAnalysis } = useSessionState();
  const { appendDebugLog, getDebugLogs } = useOutletContext<AppOutletContext>();
  const selectedUsers = useMemo(() => parseUsers(userAnalysis.selectedUsersText), [userAnalysis.selectedUsersText]);
  const endExclusive = addDays(userAnalysis.endDate, 1);
  const connectionReady = Boolean(window.desktopApp?.uiSmoke || (activeConnection?.baseUrl && activeConnection?.apiToken));
  const latestRunIdRef = useRef(userAnalysis.currentActivityStreamRunId);
  const runningRef = useRef(userAnalysis.isActivityStreamRunning);
  const [largeQueryConfirmation, setLargeQueryConfirmation] = useState<{ open: boolean; input: string; error: string; action: "activity" | "precision" | "cap" | ""; advanced: boolean }>({ open: false, input: "", error: "", action: "", advanced: false });
  const [resultTrackingDetailsOpen, setResultTrackingDetailsOpen] = useState(false);
  const [probeMode, setProbeMode] = useState<"precision" | "stability" | "comparison" | "raw">(new URLSearchParams(location.search).get("mode") === "stability" ? "stability" : "precision");
  const [stabilityRetryDelayMs, setStabilityRetryDelayMs] = useState(window.desktopApp?.uiSmoke ? 0 : 1000);
  const [stabilityStopEarly, setStabilityStopEarly] = useState(false);
  const [stabilityForceAll, setStabilityForceAll] = useState(true);
  const [stabilityFallback, setStabilityFallback] = useState<"union" | "last_attempt">("union");
  const [stabilityRun, setStabilityRun] = useState<ActivityStreamProbeRun & { files?: Record<string, string> } | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState<Record<string, unknown>>({});
  const [stabilityRunning, setStabilityRunning] = useState(false);
  const [stabilityStatusFilter, setStabilityStatusFilter] = useState("all");
  const [stabilitySort, setStabilitySort] = useState<"window" | "attempt" | "duration">("window");
  const [stabilityColumnsOpen, setStabilityColumnsOpen] = useState(false);
  const [stabilityVisibleColumns, setStabilityVisibleColumns] = useState(["window", "attempt", "status", "duration", "raw", "normalized", "unique", "jira", "newPrevious", "missingPrevious", "newUnion", "missingUnion", "eventFingerprint", "issueFingerprint", "coldStart"]);
  const [stabilityConfirmOpen, setStabilityConfirmOpen] = useState(false);
  const [stabilityConfirmText, setStabilityConfirmText] = useState("");
  const standardSelectedUser = selectedUsers.length === 1 ? selectedUsers[0] : "";
  const standardQueryUser = standardSelectedUser.replace(/(^|[^\\])_/g, "$1\\_");
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
  const resultTrackingRoles = useMemo<ResultTrackingRole[]>(() => [
    { label: "Latest Run Result", testId: "latest-run-auto-save", value: userAnalysis.lastAutoSavedResult },
    { label: "Last Successful Result", testId: "last-successful-auto-save", value: userAnalysis.lastSuccessfulAutoSavedResult },
    { label: "Last Parsed Result", testId: "last-parsed-auto-save", value: userAnalysis.lastParsedAutoSavedResult },
    { label: "Latest No Entries Result", testId: "latest-no-entries-auto-save", value: userAnalysis.latestNoEntriesAutoSavedResult }
  ], [userAnalysis.lastAutoSavedResult, userAnalysis.lastSuccessfulAutoSavedResult, userAnalysis.lastParsedAutoSavedResult, userAnalysis.latestNoEntriesAutoSavedResult]);
  const resultTrackingGroups = useMemo(() => groupResultTrackingByRunId(resultTrackingRoles), [resultTrackingRoles]);
  const latestTrackingRoles = resultTrackingGroups.find((group) => group.result.runId === userAnalysis.lastAutoSavedResult?.runId)?.roles ?? [];

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    if (new URLSearchParams(location.search).get("mode") === "stability") setProbeMode("stability");
  }, [location.search]);

  useEffect(() => window.desktopApp?.userAnalysis?.onStabilityProbeProgress?.((progress) => {
    setStabilityProgress(progress);
    const level = progress.stage === "failed" ? "ERROR" : progress.stage === "cancelled" ? "WARN" : "INFO";
    appendDebugLog("precision", [`[${level}][stability-probe] runId=${String(progress.probeRunId || "-")} window=${String(progress.windowIndex || 0)}/${String(progress.windowCount || 0)} attempt=${String(progress.attemptNumber || 0)}/${String(progress.totalAttempts || 0)} stage=${String(progress.stage || "-")} message=${String(progress.message || "-")}`]);
  }), [appendDebugLog]);

  function estimatedStabilityWindows() {
    const start = Date.parse(`${userAnalysis.startDate}T00:00:00Z`);
    const end = Date.parse(`${userAnalysis.endDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return 0;
    const totalDays = Math.floor((end - start) / 86400000) + 1;
    if (userAnalysis.activityStreamRequestWindow === "calendar_month") {
      const first = new Date(start); const last = new Date(end);
      return (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
    }
    const days = userAnalysis.activityStreamRequestWindow === "1_day" ? 1 : userAnalysis.activityStreamRequestWindow === "7_days" ? 7 : userAnalysis.activityStreamRequestWindow === "14_days" ? 14 : userAnalysis.activityStreamCustomWindowDays;
    return Math.ceil(totalDays / days);
  }

  async function executeStabilityProbe(confirmedLargeRun = false) {
    if (stabilityRunning || !activeConnection || selectedUsers.length !== 1) return;
    setStabilityRunning(true);
    setStabilityRun(null);
    setStabilityProgress({ stage: "starting", windowIndex: 0, windowCount: estimatedStabilityWindows(), attemptNumber: 0, totalAttempts: userAnalysis.activityStreamForcedRetryCount });
    logAction("USER_ACTION", `Button clicked: Run Stability Probe window=${userAnalysis.activityStreamRequestWindow} retries=${userAnalysis.activityStreamForcedRetryCount} merge=${userAnalysis.activityStreamMergeStrategy}`);
    try {
      const result = await window.desktopApp?.userAnalysis?.activityStreamStabilityProbe?.({ connection: activeConnection, confirmedLargeRun, config: { selectedUser: selectedUsers[0], dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, projectScope: userAnalysis.precisionProjectScope, requestWindow: { type: userAnalysis.activityStreamRequestWindow, customDays: userAnalysis.activityStreamRequestWindow === "custom_days" ? userAnalysis.activityStreamCustomWindowDays : null }, forcedRetryCount: userAnalysis.activityStreamForcedRetryCount, retryDelayMs: stabilityRetryDelayMs, stopEarlyWhenStable: stabilityStopEarly, forceRunAllAttempts: stabilityForceAll, mergeStrategy: userAnalysis.activityStreamMergeStrategy, noStableFallback: stabilityFallback } });
      if (!result) throw new Error("Stability Probe IPC is unavailable.");
      setStabilityRun(result as unknown as ActivityStreamProbeRun & { files?: Record<string, string> });
      setStabilityRunning(false);
      appendDebugLog("precision", [`[INFO][stability-probe] runId=${String(result.probeRunId)} stage=complete message=Probe result and diagnostics exported`, "[INFO] No database write performed", "[INFO] No Jira write performed", "[INFO] Token: [masked]", "[INFO] Authorization: [masked]"]);
    } catch (error) {
      setStabilityRunning(false);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("CONFIRM_REQUIRED")) setStabilityConfirmOpen(true);
      else appendDebugLog("precision", [`[ERROR][stability-probe] stage=failed message=${message}`]);
    }
  }

  async function cancelStabilityProbe() {
    logAction("USER_ACTION", "Button clicked: Cancel Stability Probe");
    await window.desktopApp?.userAnalysis?.cancelStabilityProbe?.();
  }

  async function exportStabilityResult() {
    if (!stabilityRun) return;
    const result = await window.desktopApp?.userAnalysis?.saveExport?.({ category: "user-analysis", defaultFileName: `activity-stream-stability-probe-${stabilityRun.probeRunId}.json`, data: stabilityRun });
    appendDebugLog("precision", [`[INFO][stability-probe] runId=${stabilityRun.probeRunId} stage=export message=Exported ${result?.filePath || "cancelled"}`]);
  }

  function applyStabilityRecommendation() {
    if (!stabilityRun) return;
    patchState({ activityStreamRequestWindow: stabilityRun.recommendation.recommendedRequestWindow, activityStreamForcedRetryCount: stabilityRun.recommendation.recommendedRetryCount, activityStreamMergeStrategy: "union" });
    logAction("USER_ACTION", `Applied Stability Probe recommendation: window=${stabilityRun.recommendation.recommendedRequestWindow} retries=${stabilityRun.recommendation.recommendedRetryCount} merge=union`);
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
        activityTypeClassifierDiagnostics: { enabled: true, rulesVersion: "1.1", commentPriorityHigherThanAttachment: true, totalEntries: 0, correctedEntryCount: 0, preservedEntryCount: 0, inferredEntryCount: 0, fallbackUnknownCount: 0, matchedRuleCounts: {}, finalTypeCounts: {} },
        activityEntryStats: emptyActivityEntryStats,
        baselineComparison: { enabled: false, baselineFound: false, snapshotKey: "", classification: "not_run", confidence: "normal", shouldRetry: false, retryReason: "", baselineCounts: { bestAtomEntryCount: 0, bestParsedActivityCount: 0, bestIssueKeyCount: 0, bestEntryFingerprintCount: 0 }, currentCounts: { atomEntryCount: 0, parsedActivityCount: 0, issueKeyCount: 0, entryFingerprintCount: 0 }, missingIssueKeys: [], missingEntryFingerprints: [], newIssueKeys: [], newEntryFingerprints: [], baselineUpdated: false, baselineUpdateReason: "", baselinePath: "" },
        baselineGuardRetry: { triggered: false, maxRetries: 2, attempts: [], finalAcceptedRunId: "", finalClassification: "not_run", baselineUpdated: false, retryRecovered: false },
        baselineGuardAttemptResults: [],
        lowConfidenceObservation: null
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

  function validate(advanced = false) {
    if (selectedUsers.length === 0) return "Please enter at least one selected user. / 請輸入至少一位使用者。";
    if (!advanced && selectedUsers.length > 1) return "Activity Stream currently supports one selected user in the standard flow. Please select one user or use Advanced Diagnostics. / 標準流程目前只支援一位使用者，請只選一位或使用進階診斷。";
    if (advanced && (!Number.isInteger(userAnalysis.activityStreamCustomChunkDays) || userAnalysis.activityStreamCustomChunkDays < 1 || userAnalysis.activityStreamCustomChunkDays > 31)) return "Custom chunk days must be between 1 and 31.";
    if (!userAnalysis.startDate || !userAnalysis.endDate || userAnalysis.startDate > userAnalysis.endDate) return "Please enter a valid date range. / 請輸入有效日期範圍。";
    if (advanced && (!Number.isInteger(userAnalysis.precisionProbeMaxResults) || userAnalysis.precisionProbeMaxResults < 1 || userAnalysis.precisionProbeMaxResults > 65535)) return "maxResults must be between 1 and 65535. / maxResults 必須介於 1 到 65535。";
    if (!smokeConnection()) return "Jira connection is not ready. / Jira 連線尚未就緒。";
    return "";
  }

  async function runActivityStreamOnly(largeMaxResultsConfirmed = false, capTest = false, advanced = false) {
    logAction("USER_ACTION", "Button clicked: Run Activity Stream Probe / 執行 Activity Stream 測試");
    const error = validate(advanced || capTest);
    if (error) return patchState({ precisionProbeErrors: [error] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    try {
      const response = await window.desktopApp?.userAnalysis?.activityStreamProbe?.({
        connection: smokeConnection()!, selectedUsers, activityStreamUser: advanced ? userAnalysis.activityStreamUser.trim() : standardSelectedUser, queryMode: advanced ? userAnalysis.activityStreamQueryMode : "escaped_username", startDate: userAnalysis.startDate,
        endDate: userAnalysis.endDate, maxResults: advanced ? userAnalysis.precisionProbeMaxResults : 500, maxResultsSource: advanced ? userAnalysis.precisionProbeMaxResultsSource : "custom", largeMaxResultsConfirmed,
        dateQueryMode: capTest ? "none" : userAnalysis.activityStreamDateQueryMode, chunkingMode: capTest ? "off" : userAnalysis.activityStreamChunkingMode, customChunkDays: userAnalysis.activityStreamCustomChunkDays, relativeLinks: userAnalysis.activityStreamRelativeLinks, runId,
        standardFlow: !advanced && !capTest, advancedOverrideUsed: advanced && Boolean(userAnalysis.activityStreamUser.trim())
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
        return { ...current, activityStream, standardActivityStreamFlow: response.standardActivityStreamFlow as typeof current.standardActivityStreamFlow, advancedDiagnosticsUsed: response.advancedDiagnosticsUsed === true, activityStreamDateSemantics: { ...dateSemantics, clientDateFilterApplied: current.parsedEntriesFilter.applyClientDateFilter }, activityStreamDateQueryResults: dateQueryResults, activityStreamMaxResultsDiagnostics: diagnostics, activityStreamCapTestResults: capTest ? [diagnostics, ...current.activityStreamCapTestResults].slice(0, 9) : current.activityStreamCapTestResults, precisionIssueKeySets: { ...current.precisionIssueKeySets, activityStreamIssueKeys: activityStream.activityStreamIssueKeys, recommendedIssueKeys }, uniquePreciseIssueKeys: recommendedIssueKeys, precisionProbeStatus: activityStream.overallStatus === "failed" ? "failed" : "completed", precisionProbeErrors: activityStream.error ? [activityStream.error] : [], notice: `${capTest ? "MaxResults Cap Test" : "Activity Stream Probe"} completed: ${activityStream.parsedActivityCount} activities, ${activityStream.activityStreamIssueKeys.length} issue key(s). / Activity Stream 測試完成。` };
      });
      patchState({ activityStreamDateRangeChunking: dateRangeChunking, activityStreamChunkResults, activityStreamChunkMergeStats: chunkMergeStats });
      finishRun(runId, activityStream, { startedAt: String(response.startedAt || ""), completedAt: String(response.completedAt || ""), mode: advanced ? userAnalysis.activityStreamQueryMode : "escaped_username", user: advanced ? userAnalysis.activityStreamUser.trim() || standardSelectedUser : standardSelectedUser, maxResults: advanced ? userAnalysis.precisionProbeMaxResults : 500, start: userAnalysis.startDate, end: endExclusive });
      if (activityStream.overallStatus !== "failed") await autoSaveRun(capTest ? "maxresults_cap_test" : "activity_stream_run", runId, activityStream.overallStatus === "success" || activityStream.overallStatus === "no_entries" ? "success" : "partial", { app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch }, requestContext: { activityStreamUser: advanced ? userAnalysis.activityStreamUser : standardSelectedUser, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, dateQueryMode: advanced ? (capTest ? "none" : userAnalysis.activityStreamDateQueryMode) : "update_date_after_before", chunkingMode: advanced ? (capTest ? "off" : userAnalysis.activityStreamChunkingMode) : "auto", customChunkDays: userAnalysis.activityStreamCustomChunkDays, maxResults: advanced ? userAnalysis.precisionProbeMaxResults : 500 }, standardActivityStreamFlow: response.standardActivityStreamFlow, advancedDiagnosticsUsed: response.advancedDiagnosticsUsed, activityTypeClassifierDiagnostics: response.activityTypeClassifierDiagnostics, activityStream, dateSemantics, dateQueryResults, maxResultsDiagnostics, dateRangeChunking, activityStreamChunkResults, chunkMergeStats, clientDateFilteredEntriesSanitized: Array.isArray(response.clientDateFilteredEntriesSanitized) ? response.clientDateFilteredEntriesSanitized : [], activityStreamRunHistory: userAnalysis.activityStreamRunHistory });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activity Stream Probe failed.";
      failRun(runId, message);
      appendDebugLog("precision", [`[ERROR] ${message}`]);
    }
  }

  async function runPrecisionProbe(largeMaxResultsConfirmed = false, advanced = false) {
    logAction("USER_ACTION", "Button clicked: Run Precision Probe / 執行精準查詢測試");
    const error = validate(advanced);
    if (error) return patchState({ precisionProbeErrors: [error] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    patchState({ precisionProbeWarnings: [] });
    try {
      const response = await window.desktopApp?.userAnalysis?.precisionProbe?.({
        connection: smokeConnection()!, selectedUsers, startInclusive: userAnalysis.startDate, endExclusive,
        activityStreamEndInclusive: userAnalysis.endDate,
        projectScope: userAnalysis.precisionProjectScope, activityStreamUser: advanced ? userAnalysis.activityStreamUser.trim() : standardSelectedUser,
        activityStreamQueryMode: advanced ? userAnalysis.activityStreamQueryMode : "escaped_username",
        activityStreamRelativeLinks: userAnalysis.activityStreamRelativeLinks,
        activityStreamRunId: runId,
        activityStreamDateQueryMode: userAnalysis.activityStreamDateQueryMode,
        activityStreamChunkingMode: userAnalysis.activityStreamChunkingMode,
        activityStreamCustomChunkDays: userAnalysis.activityStreamCustomChunkDays,
        maxResults: advanced ? userAnalysis.precisionProbeMaxResults : 500, maxResultsSource: advanced ? userAnalysis.precisionProbeMaxResultsSource : "custom", largeMaxResultsConfirmed, standardFlow: !advanced, advancedOverrideUsed: advanced && Boolean(userAnalysis.activityStreamUser.trim()), broadJql: buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate)
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
        standardActivityStreamFlow: response.standardActivityStreamFlow as typeof userAnalysis.standardActivityStreamFlow,
        advancedDiagnosticsUsed: response.advancedDiagnosticsUsed === true,
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
      finishRun(runId, activityStream, { mode: `precision:${advanced ? userAnalysis.activityStreamQueryMode : "escaped_username"}`, user: advanced ? userAnalysis.activityStreamUser.trim() || standardSelectedUser : standardSelectedUser, maxResults: advanced ? userAnalysis.precisionProbeMaxResults : 500, start: userAnalysis.startDate, end: endExclusive });
      if (status === "success" || status === "partial") await autoSaveRun("precision_probe_run", runId, status, { app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch }, requestContext: { selectedUsers, activityStreamUser: advanced ? userAnalysis.activityStreamUser : standardSelectedUser, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, dateQueryMode: advanced ? userAnalysis.activityStreamDateQueryMode : "update_date_after_before", chunkingMode: advanced ? userAnalysis.activityStreamChunkingMode : "auto", customChunkDays: userAnalysis.activityStreamCustomChunkDays, maxResults: advanced ? userAnalysis.precisionProbeMaxResults : 500 }, standardActivityStreamFlow: response.standardActivityStreamFlow, advancedDiagnosticsUsed: response.advancedDiagnosticsUsed, activityTypeClassifierDiagnostics: response.activityTypeClassifierDiagnostics, summary, probeResults: response.results, activityStream, dateSemantics, dateQueryResults, maxResultsDiagnostics, dateRangeChunking, activityStreamChunkResults, chunkMergeStats, issueKeySets: mergedSets, activityStreamRunHistory: userAnalysis.activityStreamRunHistory });
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

  function requestLargeQuery(action: "activity" | "precision" | "cap", advanced = false) {
    const useAdvanced = advanced || action === "cap";
    const error = validate(useAdvanced);
    if (error) return patchState({ precisionProbeErrors: [error] });
    if (useAdvanced && userAnalysis.precisionProbeMaxResults > 2000) {
      logAction("UI_MODAL", `Large Activity Stream query confirmation opened: maxResults=${userAnalysis.precisionProbeMaxResults} action=${action}`);
      setLargeQueryConfirmation({ open: true, input: "", error: "", action, advanced: useAdvanced });
      return;
    }
    if (action === "precision") void runPrecisionProbe(false, useAdvanced);
    else void runActivityStreamOnly(false, action === "cap", useAdvanced);
  }

  function cancelLargeQuery() {
    logAction("USER_ACTION", "Large Activity Stream query confirmation cancelled");
    setLargeQueryConfirmation({ open: false, input: "", error: "", action: "", advanced: false });
  }

  function confirmLargeQuery() {
    if (largeQueryConfirmation.input !== "CONFIRM") {
      logAction("GUARD", "Large Activity Stream query confirmation rejected: confirmation text mismatch");
      setLargeQueryConfirmation((current) => ({ ...current, error: "Please type CONFIRM exactly. / 請完整輸入 CONFIRM。" }));
      return;
    }
    const action = largeQueryConfirmation.action;
    const advanced = largeQueryConfirmation.advanced;
    logAction("USER_ACTION", `Large Activity Stream query confirmed: maxResults=${userAnalysis.precisionProbeMaxResults} action=${action}`);
    setLargeQueryConfirmation({ open: false, input: "", error: "", action: "", advanced: false });
    if (action === "precision") void runPrecisionProbe(true, advanced);
    else void runActivityStreamOnly(true, action === "cap", advanced);
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
      standardActivityStreamFlow: userAnalysis.standardActivityStreamFlow,
      advancedDiagnosticsUsed: userAnalysis.advancedDiagnosticsUsed,
      activityTypeClassifierDiagnostics: userAnalysis.activityStream.activityTypeClassifierDiagnostics,
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

  const stabilityTabs = <div data-testid="precision-probe-modes" className="mb-4 flex min-w-0 flex-wrap gap-2 border-b border-line pb-3">{([ ["precision", "Precision Discovery"], ["stability", "Activity Stream Stability"], ["comparison", "Attempt Comparison"], ["raw", "Raw Results / Diagnostics"] ] as const).map(([value, label]) => <button key={value} data-testid={`probe-mode-${value}`} className={`btn ${probeMode === value ? "btn-primary" : ""}`} type="button" onClick={() => setProbeMode(value)}>{label}</button>)}</div>;
  const stabilityWindowCount = estimatedStabilityWindows();
  const stabilityTotalRequests = stabilityWindowCount * userAnalysis.activityStreamForcedRetryCount;
  const sortedStabilityAttempts = [...(stabilityRun?.attempts ?? [])].filter((attempt) => stabilityStatusFilter === "all" || (stabilityStatusFilter === "success" ? attempt.requestSucceeded : !attempt.requestSucceeded)).sort((left, right) => stabilitySort === "attempt" ? left.attemptNumber - right.attemptNumber : stabilitySort === "duration" ? right.durationMs - left.durationMs : left.windowId.localeCompare(right.windowId) || left.attemptNumber - right.attemptNumber);
  const attemptColumnLabels: Record<string, string> = { window: "Window", attempt: "Attempt", status: "Status", duration: "Duration", raw: "Raw Events", normalized: "Normalized", unique: "Unique Events", jira: "Jira Keys", newPrevious: "New vs Previous", missingPrevious: "Missing vs Previous", newUnion: "New vs Union", missingUnion: "Missing vs Union", eventFingerprint: "Event Fingerprint", issueFingerprint: "Issue Key Fingerprint", coldStart: "Cold Start" };

  function StabilitySetup() {
    return <SectionCard title="Activity Stream Stability Setup" subtitle="Activity Stream 穩定性測試設定" className="mb-4"><div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div><FieldLabel label="Selected User" sub="選定使用者" /><input className="field" value={userAnalysis.selectedUsersText} onChange={(event) => patchState({ selectedUsersText: event.target.value.replace(/[\n,;].*$/, "") })} /></div>
      <div className="grid grid-cols-2 gap-2"><div><FieldLabel label="Start Date" sub="開始日期" /><input data-testid="stability-start-date" className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} /></div><div><FieldLabel label="End Date" sub="結束日期" /><input data-testid="stability-end-date" className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} /></div></div>
      <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input className="field" value={userAnalysis.precisionProjectScope} onChange={(event) => patchState({ precisionProjectScope: event.target.value })} /></div>
      <div><FieldLabel label="Request Window" sub="請求視窗" /><select data-testid="stability-request-window" className="field" value={userAnalysis.activityStreamRequestWindow} onChange={(event) => patchState({ activityStreamRequestWindow: event.target.value as ActivityStreamRequestWindowType })}><option value="1_day">1 Day</option><option value="7_days">7 Days</option><option value="14_days">14 Days</option><option value="calendar_month">1 Calendar Month</option><option value="custom_days">Custom</option></select>{userAnalysis.activityStreamRequestWindow === "custom_days" ? <input data-testid="stability-custom-window-days" className="field mt-2" type="number" min={1} max={31} value={userAnalysis.activityStreamCustomWindowDays} onChange={(event) => patchState({ activityStreamCustomWindowDays: Math.max(1, Math.min(31, Math.trunc(Number(event.target.value)))) })} /> : null}</div>
      <div><FieldLabel label="Forced Retry Count" sub="每個 Window 強制執行 1-32 次" /><input data-testid="stability-retry-count" className="field" type="number" min={1} max={32} value={userAnalysis.activityStreamForcedRetryCount} onChange={(event) => patchState({ activityStreamForcedRetryCount: Math.max(1, Math.min(32, Math.trunc(Number(event.target.value)))) })} /><div className="mt-2 flex flex-wrap gap-1">{[1,2,3,4,5,6,7,8,9,10,16,24,32].map((value) => <button key={value} className="btn px-2 py-1 text-xs" type="button" onClick={() => patchState({ activityStreamForcedRetryCount: value })}>{value}</button>)}</div></div>
      <div><FieldLabel label="Retry Delay" sub="重試間隔" /><select data-testid="stability-retry-delay" className="field" value={stabilityRetryDelayMs} onChange={(event) => setStabilityRetryDelayMs(Number(event.target.value))}>{[0,1,2,3,5].map((seconds) => <option key={seconds} value={seconds * 1000}>{seconds} second{seconds === 1 ? "" : "s"}</option>)}</select></div>
      <label className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm font-bold"><input data-testid="stability-stop-early" type="checkbox" checked={stabilityStopEarly} onChange={(event) => setStabilityStopEarly(event.target.checked)} />Stop Early When Stable</label>
      <label className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm font-bold"><input data-testid="stability-force-all" type="checkbox" checked={stabilityForceAll} onChange={(event) => setStabilityForceAll(event.target.checked)} />Force Run All Attempts</label>
      <div><FieldLabel label="Merge Strategy" sub="合併策略" /><select data-testid="stability-merge-strategy" className="field" value={userAnalysis.activityStreamMergeStrategy} onChange={(event) => patchState({ activityStreamMergeStrategy: event.target.value as ActivityStreamMergeStrategy })}><option value="union">Union</option><option value="last_stable">Last Stable</option></select>{userAnalysis.activityStreamMergeStrategy === "last_stable" ? <select data-testid="stability-fallback" className="field mt-2" value={stabilityFallback} onChange={(event) => setStabilityFallback(event.target.value as typeof stabilityFallback)}><option value="union">Fallback: Union</option><option value="last_attempt">Fallback: Last Attempt</option></select> : null}</div>
    </div><div data-testid="stability-request-estimate" className={`mt-4 rounded-lg border p-3 text-sm font-bold ${stabilityTotalRequests > 500 ? "border-red-300 bg-red-50 text-red-900" : stabilityTotalRequests > 100 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>Sequential requests only, concurrency = 1. Estimated total: {stabilityWindowCount} windows × {userAnalysis.activityStreamForcedRetryCount} attempts = {stabilityTotalRequests} requests.{stabilityTotalRequests > 500 ? " Type CONFIRM before running." : stabilityTotalRequests > 100 ? " Large sequential run warning." : ""}</div><div className="mt-4 flex flex-wrap gap-2"><button data-testid="run-stability-probe" className="btn btn-primary" type="button" disabled={!connectionReady || selectedUsers.length !== 1 || stabilityRunning} onClick={() => stabilityTotalRequests > 500 ? setStabilityConfirmOpen(true) : void executeStabilityProbe()}><Play size={16} />Run Stability Probe</button><button data-testid="cancel-stability-probe" className="btn" type="button" disabled={!stabilityRunning} onClick={() => void cancelStabilityProbe()}><Square size={16} />Cancel</button><button data-testid="reset-stability-results" className="btn" type="button" disabled={stabilityRunning} onClick={() => { setStabilityRun(null); setStabilityProgress({}); }}><RotateCcw size={16} />Reset Results</button><button data-testid="export-stability-result" className="btn" type="button" disabled={!stabilityRun} onClick={() => void exportStabilityResult()}><Download size={16} />Export Probe Result</button></div></SectionCard>;
  }

  function StabilityProgress() {
    if (!stabilityRunning && !stabilityRun) return null;
    const latest = stabilityRun?.attempts[stabilityRun.attempts.length - 1];
    return <SectionCard title="Probe Progress" subtitle="執行進度" className="mb-4"><div data-testid="stability-progress" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3"><MiniStat label="Current Window" value={`${String(stabilityProgress.windowIndex ?? stabilityRun?.windows.length ?? 0)} / ${String(stabilityProgress.windowCount ?? stabilityWindowCount)}`} /><MiniStat label="Current Attempt" value={`${String(stabilityProgress.attemptNumber ?? latest?.attemptNumber ?? 0)} / ${String(stabilityProgress.totalAttempts ?? userAnalysis.activityStreamForcedRetryCount)}`} /><MiniStat label="Date Window" value={`${String(stabilityProgress.requestWindowStart ?? latest?.requestWindowStart ?? "-")} ~ ${String(stabilityProgress.requestWindowEnd ?? latest?.requestWindowEnd ?? "-")}`} /><MiniStat label="Raw Events" value={String(stabilityProgress.rawEventCount ?? latest?.rawEventCount ?? 0)} /><MiniStat label="Unique Events" value={String(stabilityProgress.uniqueEventCount ?? latest?.uniqueEventCount ?? 0)} /><MiniStat label="Jira Issue Keys" value={String(stabilityProgress.jiraIssueKeyCount ?? latest?.jiraIssueKeyCount ?? 0)} /><MiniStat label="Elapsed Time" value={stabilityRun ? `${Math.max(0, Date.parse(stabilityRun.completedAt) - Date.parse(stabilityRun.startedAt))} ms` : "Running"} /><MiniStat label="Current Stability" value={String(stabilityProgress.stability ?? stabilityRun?.status ?? stabilityProgress.stage ?? "running")} /></div></SectionCard>;
  }

  function AttemptComparison() {
    return <SectionCard title="Attempt Comparison" subtitle="每次查詢結果比較" className="mb-4"><div className="mb-3 flex flex-wrap items-end gap-2"><select data-testid="stability-status-filter" className="field max-w-40" value={stabilityStatusFilter} onChange={(event) => setStabilityStatusFilter(event.target.value)}><option value="all">All Status</option><option value="success">Success</option><option value="failed">Failed</option></select><select data-testid="stability-sort" className="field max-w-40" value={stabilitySort} onChange={(event) => setStabilitySort(event.target.value as typeof stabilitySort)}><option value="window">Sort: Window</option><option value="attempt">Sort: Attempt</option><option value="duration">Sort: Duration</option></select><button data-testid="stability-column-settings-toggle" className="btn" type="button" onClick={() => setStabilityColumnsOpen((open) => !open)}>Column Settings</button><button data-testid="copy-stability-comparison" className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(sortedStabilityAttempts, null, 2))}><Copy size={16} />Copy</button></div>{stabilityColumnsOpen ? <div data-testid="stability-column-settings" className="mb-3 flex flex-wrap gap-3 rounded-lg border border-line bg-slate-50 p-3">{Object.entries(attemptColumnLabels).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={stabilityVisibleColumns.includes(key)} onChange={() => setStabilityVisibleColumns((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} />{label}</label>)}</div> : null}<ResponsiveTableContainer><table data-testid="stability-attempt-comparison" className="table min-w-[1900px]"><thead><tr>{Object.entries(attemptColumnLabels).filter(([key]) => stabilityVisibleColumns.includes(key)).map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{sortedStabilityAttempts.map((attempt) => { const values: Record<string, unknown> = { window: `${attempt.requestWindowStart} ~ ${attempt.requestWindowEnd}`, attempt: `${attempt.attemptNumber}/${attempt.totalAttempts}`, status: attempt.requestSucceeded ? "success" : "failed", duration: `${attempt.durationMs}ms`, raw: attempt.rawEventCount, normalized: attempt.normalizedEventCount, unique: attempt.uniqueEventCount, jira: attempt.jiraIssueKeyCount, newPrevious: attempt.newEventsComparedWithPreviousAttempt, missingPrevious: attempt.missingEventsComparedWithPreviousAttempt, newUnion: attempt.newEventsComparedWithCurrentUnion, missingUnion: attempt.missingEventsComparedWithFinalUnion, eventFingerprint: attempt.eventSetFingerprint, issueFingerprint: attempt.issueKeySetFingerprint, coldStart: attempt.coldStartSuspected ? "Yes" : "No" }; return <tr key={attempt.attemptId}>{Object.keys(attemptColumnLabels).filter((key) => stabilityVisibleColumns.includes(key)).map((key) => <td key={key} className={key.includes("Fingerprint") ? "max-w-64 truncate" : ""} title={String(values[key] ?? "")}>{String(values[key] ?? "-")}</td>)}</tr>; })}{sortedStabilityAttempts.length === 0 ? <tr><td colSpan={stabilityVisibleColumns.length} className="text-center text-muted">No Stability Probe attempts yet.</td></tr> : null}</tbody></table></ResponsiveTableContainer><div className="mt-3 text-xs font-semibold text-muted">CSV is automatically exported as activity-stream-attempt-comparison.csv.</div></SectionCard>;
  }

  function StabilitySummary() {
    if (!stabilityRun) return null;
    return <><SectionCard title="Window Summary" subtitle="視窗穩定度摘要" className="mb-4"><ResponsiveTableContainer><table data-testid="stability-window-summary" className="table min-w-[1100px]"><thead><tr>{["Window", "Attempts", "First Stable", "Union Events", "Union Jira Keys", "Intersection", "Stability", "Recommended Retry"].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{stabilityRun.windows.map((window) => <tr key={window.windowId}><td>{window.start} ~ {window.end}</td><td>{window.attempts.length}</td><td>{window.stability.firstStableAttempt ?? "-"}</td><td>{window.finalUnionEventCount}</td><td>{window.finalUnionJiraKeyCount}</td><td>{window.finalIntersectionEventCount}</td><td><StatusBadge>{window.stability.classification}</StatusBadge></td><td>{window.recommendedRetryCount}</td></tr>)}</tbody></table></ResponsiveTableContainer></SectionCard><SectionCard title="Overall Recommendation" subtitle="整體建議" className="mb-4"><div data-testid="stability-recommendation" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"><MiniStat label="Request Window" value={stabilityRun.recommendation.recommendedRequestWindow} /><MiniStat label="Retry Count" value={stabilityRun.recommendation.recommendedRetryCount} /><MiniStat label="Stable Attempt P50" value={stabilityRun.recommendation.observedStableAttemptP50 ?? "N/A"} /><MiniStat label="Stable Attempt Max" value={stabilityRun.recommendation.observedStableAttemptMax ?? "N/A"} /><MiniStat label="Unstable Windows" value={stabilityRun.recommendation.unstableWindowCount} /><MiniStat label="Cold Start Windows" value={stabilityRun.recommendation.coldStartAffectedWindowCount} /></div><div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">{stabilityRun.recommendation.recommendationReason}</div>{stabilityRun.mergeFallbackReason ? <div data-testid="stability-fallback-warning" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">{stabilityRun.mergeFallbackReason}</div> : null}<button data-testid="apply-stability-recommendation" className="btn btn-primary mt-4" type="button" onClick={applyStabilityRecommendation}>Apply Recommendation to User Analysis</button></SectionCard></>;
  }

  if (probeMode !== "precision") return <><PageHeader title="User Activity Precision Probe" subtitle="使用者活動精準查詢測試" />{stabilityTabs}{stabilityConfirmOpen ? <MockModal title="Confirm Large Sequential Probe" onClose={() => setStabilityConfirmOpen(false)} footer={<><button className="btn" type="button" onClick={() => setStabilityConfirmOpen(false)}>Cancel</button><button data-testid="confirm-stability-run" className="btn btn-primary" type="button" onClick={() => { if (stabilityConfirmText === "CONFIRM") { setStabilityConfirmOpen(false); void executeStabilityProbe(true); } }}>Confirm and Run</button></>}><p className="mb-3 text-sm font-semibold">This probe will execute {stabilityTotalRequests} sequential requests. Type CONFIRM to continue.</p><input data-testid="stability-confirm-input" className="field" value={stabilityConfirmText} onChange={(event) => setStabilityConfirmText(event.target.value)} /></MockModal> : null}{probeMode === "stability" ? <><StabilitySetup /><StabilityProgress /><StabilitySummary /></> : probeMode === "comparison" ? <><AttemptComparison /><StabilitySummary /></> : <SectionCard title="Raw Results / Diagnostics" subtitle="已遮罩的單次 Attempt 結果" className="mb-4"><div data-testid="stability-raw-results" className="space-y-3">{stabilityRun?.attempts.map((attempt) => <details key={attempt.attemptId} className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-bold">{attempt.windowId} / Attempt {attempt.attemptNumber}</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(attempt.rawResultSanitized, null, 2)}</pre></details>)}{!stabilityRun ? <div className="text-sm font-semibold text-muted">No Stability Probe result yet.</div> : null}</div></SectionCard>}</>;

  const stream = userAnalysis.activityStream;
  const baseline = stream.baselineComparison;
  const baselineLabel = stream.baselineGuardRetry?.retryRecovered ? "Retried / 已重試" : stream.baselineGuardRetry?.finalClassification === "result_incomplete_candidate" ? "Incomplete Candidate / 可能不完整" : baseline?.classification === "accepted_improved" ? "Improved / 有新增" : baseline?.classification === "accepted_equal" || baseline?.classification === "first_observation" ? "Accepted / 已接受" : baseline?.classification?.startsWith("suspicious_") ? "Regression Detected / 偵測到倒退" : "Not Run / 尚未執行";
  return <>{stabilityTabs}
    <PageHeader title="User Activity Precision Probe" subtitle="使用者活動精準查詢測試" />
    {largeQueryConfirmation.open ? <MockModal title="Large Activity Stream Query Confirmation / 大型查詢確認" onClose={cancelLargeQuery} footer={<><button className="btn" type="button" onClick={cancelLargeQuery}>Cancel / 取消</button><button data-testid="confirm-large-max" className="btn btn-primary" type="button" onClick={confirmLargeQuery}><Play size={16} />Confirm and Run / 確認並執行</button></>}><div className="space-y-3 leading-relaxed"><p>You are about to request up to <b>{userAnalysis.precisionProbeMaxResults}</b> Activity Stream entries.<br />你即將要求最多 <b>{userAnalysis.precisionProbeMaxResults}</b> 筆 Activity Stream entries。</p><p>This can increase response time and Jira server load. No Jira or database write will occur.<br />這可能增加回應時間與 Jira server 負載，但不會寫入 Jira 或資料庫。</p><div><FieldLabel label="Type CONFIRM to continue" sub="請輸入 CONFIRM 才能繼續" /><input data-testid="large-max-confirm-input" className="field" autoFocus value={largeQueryConfirmation.input} onChange={(event) => setLargeQueryConfirmation((current) => ({ ...current, input: event.target.value, error: "" }))} placeholder="CONFIRM" />{largeQueryConfirmation.error ? <div className="mt-2 text-sm font-bold text-red-700">{largeQueryConfirmation.error}</div> : null}</div></div></MockModal> : null}
    <SectionCard title="Activity Stream Standard Flow" subtitle="Activity Stream 標準流程" className="mb-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-relaxed text-cyan-950">Activity Stream is the preferred actual-activity validation source. updatedBy remains a candidate source and may include automation or indexing effects.<br />Activity Stream 優先作為實際活動驗證來源；updatedBy 僅為候選來源，可能包含自動化或索引影響。</div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div><FieldLabel label="Selected Users" sub="選擇使用者" /><textarea data-testid="selected-users" className="field min-h-24" value={userAnalysis.selectedUsersText} onChange={(event) => patchState({ selectedUsersText: event.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2"><div><FieldLabel label="Start Date" sub="開始日期" /><input data-testid="activity-stream-start-date" className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} /></div><div><FieldLabel label="End Date" sub="結束日期" /><input data-testid="activity-stream-end-date" className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} /></div></div>
        <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input className="field" value={userAnalysis.precisionProjectScope} placeholder="COPGEN1, FW" onChange={(event) => patchState({ precisionProjectScope: event.target.value })} /></div>
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">Requested range: {userAnalysis.startDate || "-"} .. {userAnalysis.endDate || "-"} inclusive<br />Server endExclusive: {endExclusive || "-"}<br />Timezone: Asia/Taipei / UTC+8</div>
      </div>
      {selectedUsers.length === 0 ? <div data-testid="standard-flow-no-user" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Select one user before running Activity Stream. / 請先選擇一位使用者。</div> : null}
      {selectedUsers.length > 1 ? <div data-testid="standard-flow-multi-user-warning" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">Activity Stream currently supports one selected user in the standard flow. Please select one user or use Advanced Diagnostics.<br />標準流程目前只支援一位使用者；請只選一位，或使用進階診斷。</div> : null}
      <div data-testid="standard-activity-stream-flow" className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <MiniStat label="Selected User" value={standardSelectedUser || "Not selected"} />
        <MiniStat label="Query User" value={standardQueryUser || "-"} />
        <MiniStat label="Variant" value="escaped_username" />
        <MiniStat label="Date Query" value="update-date AFTER/BEFORE" />
        <MiniStat label="Chunking" value="Auto" />
        <MiniStat label="Per Chunk Limit" value={500} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button data-testid="run-activity-stream" className="btn" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("activity")}><Radio size={16} />Run Activity Stream Probe / 執行 Activity Stream 測試</button><button data-testid="run-precision-probe" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("precision")}><Play size={16} />Run Precision Probe / 執行精準查詢測試</button><button data-testid="save-precision-probe" className="btn" type="button" disabled={userAnalysis.saving || userAnalysis.isActivityStreamRunning || (userAnalysis.precisionProbeResults.length === 0 && stream.status === "not_run")} onClick={() => void saveResult()}><Download size={16} />Save Precision Probe Result / 儲存精準查詢測試結果</button><button data-testid="add-precision-queue" className="btn" type="button" disabled={userAnalysis.isActivityStreamRunning || userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length === 0} onClick={addToFetchQueue}><DatabaseZap size={16} />Add Recommended Keys to Fetch Queue / 加入建議 Jira 到抓取佇列</button></div>
      <button data-testid="toggle-advanced-diagnostics" className="btn mt-4" type="button" aria-expanded={userAnalysis.advancedDiagnosticsOpen} onClick={() => patchState({ advancedDiagnosticsOpen: !userAnalysis.advancedDiagnosticsOpen })}>Advanced Diagnostics / 進階診斷 {userAnalysis.advancedDiagnosticsOpen ? "▲" : "▼"}</button>
      {userAnalysis.advancedDiagnosticsOpen ? <div data-testid="advanced-diagnostics" className="mt-4 rounded-lg border border-line bg-slate-50 p-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div><FieldLabel label="Activity Stream User Override" sub="Activity Stream 使用者覆寫" /><input data-testid="activity-stream-user" className="field" value={userAnalysis.activityStreamUser} placeholder={standardSelectedUser || "roger_hsieh"} onChange={(event) => { logAction("USER_ACTION", `Activity Stream User Override changed: value=${event.target.value}`); patchState({ activityStreamUser: event.target.value }); }} /><div className="mt-2 text-xs font-semibold text-muted">Leave blank to use Selected Users[0]. / 留空時使用第一位 Selected User。</div></div>
          <div><FieldLabel label="Activity Stream User Query Mode" sub="Activity Stream 使用者查詢模式" /><select data-testid="activity-stream-query-mode" className="field" value={userAnalysis.activityStreamQueryMode} onChange={(event) => { const value = event.target.value as typeof userAnalysis.activityStreamQueryMode; logAction("USER_ACTION", `Activity Stream Query Mode changed: value=${value}`); patchState({ activityStreamQueryMode: value }); }}><option value="auto">Auto</option><option value="username">Username</option><option value="escaped_username">Escaped Username</option><option value="email">Email</option><option value="custom">Manual / Custom</option></select></div>
          <div><FieldLabel label="Activity Stream Date Query Mode" sub="Activity Stream 日期查詢模式" /><select data-testid="activity-stream-date-query-mode" className="field" value={userAnalysis.activityStreamDateQueryMode} onChange={(event) => patchState({ activityStreamDateQueryMode: event.target.value as typeof userAnalysis.activityStreamDateQueryMode })}><option value="none">None</option><option value="startDate_endDate">startDate/endDate</option><option value="update_date_after_before">update-date AFTER/BEFORE</option><option value="both">Both</option></select><div className="mt-2 text-xs font-bold text-amber-800">startDate/endDate is known unreliable in this Jira environment.</div></div>
          <div><FieldLabel label="Probe Max Results" sub="每次查詢最大筆數（1–65535）" /><input data-testid="probe-max-results" className="field" type="number" min={1} max={65535} value={userAnalysis.precisionProbeMaxResults} onChange={(event) => { const value = Number(event.target.value); logAction("USER_ACTION", `Probe Max Results changed: value=${value}`); patchState({ precisionProbeMaxResults: value, precisionProbeMaxResultsSource: "custom" }); }} /><div className="mt-2 flex flex-wrap gap-1">{maxResultsQuickValues.map((value) => <button data-testid={`max-quick-${value}`} key={value} className="btn px-2 py-1 text-xs" type="button" onClick={() => patchState({ precisionProbeMaxResults: value, precisionProbeMaxResultsSource: "quick" })}>{value}</button>)}</div></div>
          <div><FieldLabel label="Date Range Chunking" sub="進階分段設定" /><select data-testid="activity-stream-chunking-mode" className="field" value={userAnalysis.activityStreamChunkingMode} onChange={(event) => patchState({ activityStreamChunkingMode: event.target.value as typeof userAnalysis.activityStreamChunkingMode })}><option value="off">Off</option><option value="auto">Auto</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="custom_days">Custom Days</option></select>{userAnalysis.activityStreamChunkingMode === "custom_days" ? <div className="mt-2"><FieldLabel label="Custom Days" sub="1-31 days per chunk" /><input data-testid="activity-stream-custom-chunk-days" className="field" type="number" min={1} max={31} value={userAnalysis.activityStreamCustomChunkDays} onChange={(event) => patchState({ activityStreamCustomChunkDays: Number(event.target.value) })} /></div> : null}</div>
          <label className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-white p-3 text-sm font-bold text-ink"><input type="checkbox" checked={userAnalysis.activityStreamRelativeLinks} onChange={(event) => patchState({ activityStreamRelativeLinks: event.target.checked })} />Use relativeLinks=true / 使用 relativeLinks=true</label>
        </div>
        {userAnalysis.activityStreamUser.trim() && standardSelectedUser && userAnalysis.activityStreamUser.trim() !== standardSelectedUser ? <div data-testid="advanced-override-warning" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">Manual Activity Stream User Override is different from Selected Users.</div> : null}
        {userAnalysis.precisionProbeMaxResults > 500 ? <div data-testid="large-max-warning" className={`mt-3 rounded-lg border p-3 text-sm font-bold ${userAnalysis.precisionProbeMaxResults > 10000 ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{userAnalysis.precisionProbeMaxResults > 10000 ? "Strong warning: this query may timeout, stall the UI, or increase Jira server load." : "Large Activity Stream query requested."} {userAnalysis.precisionProbeMaxResults > 2000 ? "Type CONFIRM before this request can run." : ""}</div> : null}
        <div className="mt-4 flex flex-wrap gap-2"><button data-testid="run-advanced-activity-stream" className="btn" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("activity", true)}><Radio size={16} />Run Advanced Activity Stream Probe</button><button data-testid="run-advanced-precision-probe" className="btn" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("precision", true)}><Play size={16} />Run Advanced Precision Probe</button></div>
      </div> : null}
      {userAnalysis.isActivityStreamRunning ? <div data-testid="activity-stream-running" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Running Activity Stream Probe...<br />Run ID: {userAnalysis.currentActivityStreamRunId}</div> : null}
      {userAnalysis.notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{userAnalysis.notice}</div> : null}
    </SectionCard>

    <SectionCard title="Last Auto-Saved Result" subtitle="最後自動儲存結果" className="mb-4">
      {userAnalysis.lastAutoSavedResult ? <div data-testid="last-auto-saved-result" className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0 text-sm font-semibold leading-relaxed"><div className="break-all"><b>Path:</b> {userAnalysis.lastAutoSavedResult.path}</div><div><b>Saved At:</b> {userAnalysis.lastAutoSavedResult.savedAt}</div><div><b>Run ID:</b> {userAnalysis.lastAutoSavedResult.runId}</div><div><b>Result Type:</b> {userAnalysis.lastAutoSavedResult.resultType}</div><div><b>Status:</b> {userAnalysis.lastAutoSavedResult.status}</div>{latestTrackingRoles.length > 1 ? <div data-testid="latest-result-also-used-as"><b>Also used as:</b> {latestTrackingRoles.slice(1).map((role) => role.label).join(", ")}</div> : null}</div><div className="flex flex-wrap items-start gap-2"><button data-testid="open-auto-save-folder" className="btn" type="button" onClick={() => void window.desktopApp?.userAnalysis?.openExportFolder?.({ folderPath: userAnalysis.lastAutoSavedResult?.folderPath })}><FolderOpen size={16} />Open Folder / 開啟資料夾</button><button data-testid="copy-auto-save-path" className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(userAnalysis.lastAutoSavedResult?.path ?? "")}><Copy size={16} />Copy Path / 複製路徑</button></div></div> : <div className="text-sm font-semibold text-muted">No auto-saved run yet. / 尚無自動儲存結果。</div>}
      {userAnalysis.latestNoEntriesAutoSavedResult && userAnalysis.latestNoEntriesAutoSavedResult.runId !== userAnalysis.lastAutoSavedResult?.runId ? <div data-testid="latest-no-entries-summary" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950"><b>Latest No Entries Result:</b> {userAnalysis.latestNoEntriesAutoSavedResult.runId} · {userAnalysis.latestNoEntriesAutoSavedResult.savedAt}</div> : null}
      <button data-testid="toggle-result-tracking-details" className="btn mt-4" type="button" aria-expanded={resultTrackingDetailsOpen} onClick={() => setResultTrackingDetailsOpen((open) => !open)}>Result Tracking Details {resultTrackingDetailsOpen ? "▲" : "▼"}</button>
      {resultTrackingDetailsOpen ? <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2" data-testid="auto-save-result-tracking">{resultTrackingGroups.map(({ result, roles }) => <div key={result.runId} data-testid={`result-tracking-run-${result.runId}`} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3"><div className="text-sm font-black text-ink">{roles.map((role) => role.label).join(" · ")}</div><div className="mt-2 text-xs font-semibold leading-relaxed text-muted"><div><b>Run ID:</b> {result.runId}</div><div><b>Status:</b> {result.status}</div><div><b>Diagnosis:</b> {result.diagnosis}</div><div><b>Parsed:</b> {result.parsedActivityCount}</div><div className="break-all"><b>Path:</b> {result.path}</div></div><div className="mt-3 flex flex-wrap gap-2"><button className="btn px-2 py-1 text-xs" type="button" onClick={() => void window.desktopApp?.userAnalysis?.openExportFolder?.({ folderPath: result.folderPath })}><FolderOpen size={14} />Open Folder</button><button className="btn px-2 py-1 text-xs" type="button" onClick={() => void navigator.clipboard?.writeText(result.path)}><Copy size={14} />Copy Path</button></div></div>)}</div> : null}
    </SectionCard>

    {userAnalysis.advancedDiagnosticsOpen ? <SectionCard title="Manual Activity Stream URL Replay" subtitle="Advanced Diagnostics / 進階診斷" className="mb-4">
      <FieldLabel label="Manual Activity Stream URL" sub="手動 Activity Stream URL" />
      <textarea data-testid="manual-activity-stream-url" className="field min-h-24 break-all" value={userAnalysis.manualActivityStreamUrl} placeholder="https://jira.example.com/plugins/servlet/streams?maxResults=10&relativeLinks=true&streams=user+IS+roger%5C_hsieh" onChange={(event) => { logAction("USER_ACTION", "Manual Activity Stream URL changed"); patchState({ manualActivityStreamUrl: event.target.value }); }} />
      <div className="mt-3 flex flex-wrap items-center gap-3"><button data-testid="run-manual-activity-stream" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => void runManualUrlReplay()}><Radio size={16} />Run Manual URL Replay / 執行手動 URL 重放</button>{userAnalysis.manualUrlReplayDiagnostics.manualUrlProvided ? <StatusBadge>{userAnalysis.manualUrlReplayDiagnostics.manualUrlAccepted ? "Manual URL validated / 手動 URL 驗證通過" : "Manual URL rejected / 手動 URL 被拒絕"}</StatusBadge> : null}</div>
      {userAnalysis.manualUrlReplayDiagnostics.rejectReason ? <div data-testid="manual-replay-reject" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Reject reason / 拒絕原因：{userAnalysis.manualUrlReplayDiagnostics.rejectReason}</div> : null}
      {userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized ? <div className="mt-3 break-all rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-900">{userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized}</div> : null}
    </SectionCard> : null}

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

    {userAnalysis.advancedDiagnosticsOpen ? <SectionCard title="MaxResults Cap Test" subtitle="Advanced Diagnostics / 進階診斷" className="mb-4">
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-[220px]"><FieldLabel label="Test Value" sub="測試筆數" /><select data-testid="cap-test-value" className="field" value={capTestValues.includes(userAnalysis.precisionProbeMaxResults as typeof capTestValues[number]) ? userAnalysis.precisionProbeMaxResults : 50} onChange={(event) => patchState({ precisionProbeMaxResults: Number(event.target.value), precisionProbeMaxResultsSource: "quick" })}>{capTestValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></div><button data-testid="run-cap-test" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => requestLargeQuery("cap")}><Radio size={16} />Run MaxResults Cap Test / 執行上限測試</button></div>
      <div data-testid="max-results-diagnostics" className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"><MiniStat label="Requested MaxResults" value={userAnalysis.activityStreamMaxResultsDiagnostics.requestedMaxResults} /><MiniStat label="Actual Atom Entries" value={userAnalysis.activityStreamMaxResultsDiagnostics.actualAtomEntryCount} /><MiniStat label="Parsed Activities" value={userAnalysis.activityStreamMaxResultsDiagnostics.parsedActivityCount} /><MiniStat label="Response Time" value={`${userAnalysis.activityStreamMaxResultsDiagnostics.responseTimeMs} ms`} /><MiniStat label="Response Size" value={`${userAnalysis.activityStreamMaxResultsDiagnostics.responseSizeKB} KB`} /><MiniStat label="Server Cap Detected" value={String(userAnalysis.activityStreamMaxResultsDiagnostics.serverCapDetected)} /><MiniStat label="Estimated Cap" value={userAnalysis.activityStreamMaxResultsDiagnostics.serverCapValueEstimated ?? "-"} /></div>
      <ResponsiveTableContainer className="mt-4"><table data-testid="cap-test-results" className="table min-w-[900px]"><thead><tr>{["Requested", "Actual Atom", "Parsed", "Response", "Size KB", "Cap", "Estimated"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamCapTestResults.map((result, index) => <tr key={`${result.requestedMaxResults}-${index}`}><td>{result.requestedMaxResults}</td><td>{result.actualAtomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.responseTimeMs} ms</td><td>{result.responseSizeKB}</td><td>{String(result.serverCapDetected)}</td><td>{result.serverCapValueEstimated ?? "-"}</td></tr>)}{userAnalysis.activityStreamCapTestResults.length === 0 ? <tr><td colSpan={7} className="text-center text-muted">No cap tests yet. A single short result cannot prove a server cap. / 尚無上限測試，單次結果不足以判定 server cap。</td></tr> : null}</tbody></table></ResponsiveTableContainer>
    </SectionCard> : null}

    <SectionCard title="Activity Stream Result" subtitle="Activity Stream 結果" className="mb-4">
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3" data-testid="activity-entry-summary"><MiniStat label="Overall Status / 整體狀態" value={stream.overallStatus} /><MiniStat label="Diagnosis / 診斷" value={stream.diagnosis} /><MiniStat label="Total Activity Entries / 全部活動筆數" value={stream.activityEntryStats.totalAtomEntries} /><MiniStat label="Parsed Activity Entries / 已解析活動筆數" value={stream.activityEntryStats.parsedActivityEntryCount} /><MiniStat label="Entries with Jira Key / 含 Jira Key 活動" value={stream.activityEntryStats.entriesWithIssueKeyCount} /><MiniStat label="Confluence-only Entries / Confluence-only 活動" value={stream.activityEntryStats.confluenceOnlyEntryCount} /><MiniStat label="Non-Jira Entries / 非 Jira 活動" value={stream.activityEntryStats.nonJiraEntryCount} /><MiniStat label="Unique Jira Issue Keys / 去重 Jira 數" value={stream.activityEntryStats.uniqueIssueKeyCount} /><MiniStat label="Best Variant / 最佳變體" value={userAnalysis.manualActivityStreamResult?.parsed ? "manual_url" : stream.bestVariant || "-"} /></div>
      <div className="mb-3 break-all rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold text-muted">GET {stream.requestUrlSanitized || "/plugins/servlet/streams?..."}<br />Best date query mode / 最佳日期查詢模式：{userAnalysis.activityStreamDateSemantics.bestDateQueryMode}</div>
      {baseline?.enabled ? <div data-testid="activity-stream-baseline-guard" className={`mb-4 rounded-lg border p-4 ${baseline.shouldRetry || stream.baselineGuardRetry.finalClassification === "result_incomplete_candidate" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}><div className="text-sm font-black">Baseline Guard / 基準快照防護：{baselineLabel}</div><div className="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"><MiniStat label="Baseline Entries" value={baseline.baselineCounts.bestParsedActivityCount} /><MiniStat label="Current Entries" value={baseline.currentCounts.parsedActivityCount} /><MiniStat label="Baseline Issue Keys" value={baseline.baselineCounts.bestIssueKeyCount} /><MiniStat label="Current Issue Keys" value={baseline.currentCounts.issueKeyCount} /><MiniStat label="Retry Attempts" value={stream.baselineGuardRetry.attempts.length > 0 ? stream.baselineGuardRetry.attempts.length - 1 : 0} /></div>{baseline.missingIssueKeys.length > 0 ? <div data-testid="baseline-missing-issue-keys" className="mt-3 break-words text-sm font-bold">Missing issue keys / 缺少的 Issue Keys：{baseline.missingIssueKeys.join(", ")}</div> : null}{stream.baselineGuardRetry.retryRecovered ? <div className="mt-3 text-sm font-bold">Retry recovered a better result. / 重試後取得較完整結果。</div> : stream.baselineGuardRetry.finalClassification === "result_incomplete_candidate" ? <div className="mt-3 text-sm font-bold">Result is still below baseline after retries. Baseline was not overwritten. / 重試後仍低於基準，本次結果未覆蓋 baseline。</div> : baseline.shouldRetry ? <div className="mt-3 text-sm font-bold">Current result is below local baseline. Retry triggered. / 目前結果低於本地基準，已觸發重試。</div> : null}<div className="mt-2 break-all text-xs font-semibold">Classification: {baseline.classification}<br />Baseline Path: {baseline.baselinePath}</div></div> : null}
      {stream.bestVariantReason === "all_variants_no_entries" ? <div data-testid="all-variants-no-entries" className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">No Activity Stream entries found for all user variants. / 所有使用者查詢變體均未找到 Activity Stream entries。</div> : null}
      <h3 className="mb-2 text-sm font-black text-ink">Query Variants / 查詢變體</h3>
      <ResponsiveTableContainer className="mb-4"><table className="table min-w-[1200px]" data-testid="activity-stream-variants"><thead><tr>{["Variant", "User", "HTTP", "Content Type", "Reachable", "Supported", "Atom Entries", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{[...stream.variantResults.filter((item) => item.variant !== "manual_url"), ...(userAnalysis.manualActivityStreamResult ? [userAnalysis.manualActivityStreamResult] : [])].map((result) => <tr key={`${result.variant}-${result.activityStreamUser}`}><td className="font-bold">{result.variant}</td><td>{result.activityStreamUser}</td><td>{result.httpStatus}</td><td>{result.contentType || "-"}</td><td>{result.reachable ? "yes" : "no"}</td><td>{result.supported}</td><td>{result.atomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.parsedIssueKeys.join(", ") || "-"}</td><td><StatusBadge>{result.diagnosis}</StatusBadge></td></tr>)}{stream.variantResults.length === 0 && !userAnalysis.manualActivityStreamResult ? <tr><td colSpan={10} className="text-center text-muted">No query variants yet / 尚無查詢變體</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      <h3 className="mb-2 text-sm font-black text-ink">Parser Diagnostics / 解析診斷</h3>
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="parser-diagnostics"><MiniStat label="Atom Entries" value={stream.parserDiagnostics.atomEntryCount} /><MiniStat label="Parsed Entries" value={stream.parserDiagnostics.parsedEntryCount} /><MiniStat label="Skipped Entries" value={stream.parserDiagnostics.skippedEntryCount} /><MiniStat label="With Issue Key" value={stream.parserDiagnostics.entriesWithIssueKeyCount} /><MiniStat label="Without Issue Key" value={stream.parserDiagnostics.entriesWithoutIssueKeyCount} /><MiniStat label="Confluence-only" value={stream.parserDiagnostics.confluenceOnlyEntryCount} /><MiniStat label="Without Author" value={stream.parserDiagnostics.entriesWithoutAuthorCount} /><MiniStat label="Without Time" value={stream.parserDiagnostics.entriesWithoutTimeCount} /></div>
      <h3 className="mb-2 text-sm font-black text-ink">Activity Type Classifier / 活動類型分類器</h3>
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="activity-type-classifier-diagnostics"><MiniStat label="Rules Version" value={stream.activityTypeClassifierDiagnostics.rulesVersion} /><MiniStat label="Classified Entries" value={stream.activityTypeClassifierDiagnostics.totalEntries} /><MiniStat label="Corrected Types" value={stream.activityTypeClassifierDiagnostics.correctedEntryCount} /><MiniStat label="Preserved Types" value={stream.activityTypeClassifierDiagnostics.preservedEntryCount} /><MiniStat label="Inferred Types" value={stream.activityTypeClassifierDiagnostics.inferredEntryCount} /><MiniStat label="Fallback Unknown" value={stream.activityTypeClassifierDiagnostics.fallbackUnknownCount} /><MiniStat label="Comment Priority" value={stream.activityTypeClassifierDiagnostics.commentPriorityHigherThanAttachment ? "Higher than attachment" : "Invalid"} /></div>
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
      <ResponsiveTableContainer><table className="table min-w-[1300px]" data-testid="activity-stream-results"><thead><tr>{["Run ID", "Variant", "Source", "Activity Type", "Issue Key", "Time", "Author", "Title Summary", "Details"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{paginatedEntries.map((entry, index) => { const entryKey = `${entry.runId}-${entry.variant}-${entry.entryIndex}-${entry.activityTime}`; const expanded = userAnalysis.expandedActivityEntries.includes(entryKey); return [<tr key={entryKey}><td>{entry.runId || "-"}</td><td>{entry.variant || "-"}</td><td>{entry.source}</td><td>{entry.activityType}</td><td className="font-black text-blue-700">{entry.issueKey || "-"}</td><td>{entry.activityTime || "-"}</td><td>{entry.activityAuthor || "-"}</td><td><span className="block max-w-[320px] truncate" title={entry.activityTitle} data-allow-truncate="true">{entry.activityTitle.slice(0, 200) || "-"}</span></td><td><button data-testid={`entry-detail-${index}`} className="btn px-2 py-1 text-xs" type="button" onClick={() => patchState({ expandedActivityEntries: expanded ? userAnalysis.expandedActivityEntries.filter((key) => key !== entryKey) : [...userAnalysis.expandedActivityEntries, entryKey] })}>{expanded ? "Hide Details / 收合詳細" : "Show Details / 顯示詳細"}</button></td></tr>, expanded ? <tr key={`${entryKey}-detail`} data-testid="entry-detail-panel"><td colSpan={9}><div className="max-h-80 overflow-auto rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-950"><div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2"><div><b>Raw Title:</b> <span className="break-words">{entry.rawTitle || entry.activityTitle || "-"}</span></div><div><b>Raw Summary:</b> <span className="break-words">{entry.rawSummary || "-"}</span></div><div><b>Activity Application:</b> {entry.activityApplication}</div><div><b>Object Type:</b> {entry.objectType || "-"}</div><div><b>Target:</b> {entry.target || "-"}</div><div><b>Links:</b> {entry.links.join(", ") || "-"}</div><div><b>Author Email:</b> {entry.activityAuthorEmail || "-"}</div><div><b>Extracted Issue Keys:</b> {entry.extractedIssueKeysPerEntry.join(", ") || "-"}</div><div><b>Classifier Rule:</b> {entry.activityTypeClassifier.matchedRule} ({entry.activityTypeClassifier.priority})</div><div><b>Previous / Final Type:</b> {entry.activityTypeClassifier.previousType || "-"} / {entry.activityTypeClassifier.finalType}</div><div><b>Entry Index:</b> {entry.entryIndex}</div><div><b>Run / Variant / Source:</b> {entry.runId} / {entry.variant} / {entry.source}</div></div><div className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-blue-100 bg-white p-2"><b>Raw Content:</b> {entry.rawContent || "-"}</div><button data-testid={`copy-entry-${index}`} className="btn mt-3 px-2 py-1 text-xs" type="button" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(entry, null, 2))}><Copy size={14} />Copy Entry JSON</button></div></td></tr> : null]; })}{filteredEntries.length === 0 ? <tr><td colSpan={9} className="text-center text-muted">No entries match the current filters / 沒有符合目前篩選條件的項目</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      {stream.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{stream.error}</div> : null}
    </SectionCard>

    <SectionCard title="Activity Stream Run History" subtitle="最近 5 次執行" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1150px]" data-testid="activity-stream-run-history"><thead><tr>{["Run ID", "Started", "Mode", "User", "Max", "Best Variant", "Atom", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamRunHistory.map((run) => <tr key={run.runId}><td>{run.runId}</td><td>{run.startedAt}</td><td>{run.mode}</td><td>{run.activityStreamUser}</td><td>{run.maxResults}</td><td>{run.bestVariant || "-"}</td><td>{run.atomEntryCount}</td><td>{run.parsedActivityCount}</td><td>{run.parsedIssueKeyCount}</td><td>{run.diagnosis}</td></tr>)}{userAnalysis.activityStreamRunHistory.length === 0 ? <tr><td colSpan={10} className="text-center text-muted">No runs yet / 尚無執行紀錄</td></tr> : null}</tbody></table></ResponsiveTableContainer></SectionCard>

    {userAnalysis.precisionProbeResults.length > 0 ? <><SectionCard title="Precision Probe Summary" subtitle="精準查詢測試摘要" className="mb-4"><div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"><MiniStat label="updatedBy Candidate / 候選來源" value={userAnalysis.precisionProbeSummary.updatedBySupported} /><MiniStat label="Activity Stream" value={userAnalysis.precisionProbeSummary.activityStreamSupported} /><MiniStat label="CHANGED BY" value={userAnalysis.precisionProbeSummary.changedBySupported} /><MiniStat label="Broad Baseline / 寬鬆基準" value={userAnalysis.precisionProbeSummary.broadCandidateCount} /><MiniStat label="Recommended Jira / 建議 Jira" value={userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length} /><MiniStat label="Potential Reduction / 預估減少" value={userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent === null ? "N/A" : `${userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent}%`} /></div><div data-testid="precision-recommendation" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Recommended Stage 1 Mode / 建議第一階段模式：{userAnalysis.precisionProbeSummary.recommendedStage1Mode}<br />Recommended Issue Keys / 建議 Jira：{userAnalysis.precisionIssueKeySets.recommendedIssueKeys.join(", ") || "-"}</div><div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-900">Candidate Issue Keys / 候選 Jira（updatedBy）：{userAnalysis.precisionIssueKeySets.updatedByCandidateIssueKeys.join(", ") || "-"}<br />updatedBy may not exactly match Activity Stream user actions in this Jira environment.<br />updatedBy 在此 Jira 環境中不一定等同於 Activity Stream 實際使用者操作紀錄。</div></SectionCard><SectionCard title="Probe Results" subtitle="測試結果" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1280px]" data-testid="precision-results-table"><thead><tr>{["Probe Method / 測試方法", "Status / 狀態", "HTTP", "Supported / 支援", "Count / 數量", "Sample Issue Keys", "Candidate Source", "Error", "Recommendation"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.precisionProbeResults.map((result) => <tr key={result.candidateSource}><td className="font-bold">{result.method}</td><td><StatusBadge>{result.status}</StatusBadge></td><td>{result.httpStatus}</td><td>{result.supported}</td><td className="font-black">{result.resultCount}</td><td>{result.sampleIssueKeys.join(", ") || "-"}</td><td>{result.candidateSource}</td><td>{result.error || "-"}</td><td>{result.recommendation}</td></tr>)}</tbody></table></ResponsiveTableContainer></SectionCard></> : null}
    {[...userAnalysis.precisionProbeWarnings, ...userAnalysis.precisionProbeErrors].map((message) => <div key={message} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{message}</div>)}
  </>;
}
