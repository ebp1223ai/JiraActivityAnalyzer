import { useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { DatabaseZap, Download, Play, Radio } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserActivityStreamResult, type UserActivityStreamVariantResult, type UserAnalysisCandidateIssue, type UserAnalysisPrecisionProbeResult, type UserAnalysisPrecisionProbeSummary } from "../state/SessionStateContext";

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
  const stamp = new Date().toISOString().replace(/[-:TZ]/g, "").slice(0, 17);
  return `asrun-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

const emptyParserDiagnostics = {
  atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0,
  entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0,
  entriesWithMultipleIssueKeysCount: 0, parserErrorCount: 0, parserErrorsSanitized: [] as string[],
  skippedEntriesSanitized: [] as Array<{ entryIndex: number; reason: string; rawTitleText: string; rawUpdatedText: string; rawAuthorText: string }>,
  parserAnomaly: false, parserAnomalyReason: ""
};

const activityTypeOptions = ["link", "comment", "attachment", "status", "assignee_change", "field_change", "description_update", "page", "unknown"] as const;
const variantOptions = ["username", "escaped_username", "email", "manual_url"] as const;
const sourceOptions = ["activity_stream", "manual_url"] as const;

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
      if (filter.dateRange.start && entry.activityTime && entry.activityTime.slice(0, 10) < filter.dateRange.start) return false;
      if (filter.dateRange.end && entry.activityTime && entry.activityTime.slice(0, 10) > filter.dateRange.end) return false;
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

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
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
        parserDiagnostics: emptyParserDiagnostics
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
    if (selectedUsers.length === 0) return "Please enter at least one selected user. / 請輸入至少一位使用者。";
    if (!userAnalysis.activityStreamUser.trim()) return "Please enter Activity Stream User. / 請輸入 Activity Stream 使用者。";
    if (!userAnalysis.startDate || !userAnalysis.endDate || userAnalysis.startDate > userAnalysis.endDate) return "Please enter a valid date range. / 請輸入有效日期範圍。";
    if (!smokeConnection()) return "Jira connection is not ready. / Jira 連線尚未就緒。";
    return "";
  }

  async function runActivityStreamOnly() {
    logAction("USER_ACTION", "Button clicked: Run Activity Stream Probe / 執行 Activity Stream 測試");
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    try {
      const response = await window.desktopApp?.userAnalysis?.activityStreamProbe?.({
        connection: smokeConnection()!, selectedUsers, activityStreamUser: userAnalysis.activityStreamUser.trim(), queryMode: userAnalysis.activityStreamQueryMode, startDate: userAnalysis.startDate,
        endDate: endExclusive, maxResults: userAnalysis.precisionProbeMaxResults, relativeLinks: userAnalysis.activityStreamRelativeLinks, runId
      });
      if (!response) throw new Error("Electron Activity Stream API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      const activityStream = response.activityStream as unknown as UserActivityStreamResult;
      if (staleResult(String(response.runId || activityStream.runId || ""))) return;
      setUserAnalysis((current) => {
        const manualKeys = current.precisionIssueKeySets.manualActivityStreamIssueKeys;
        const recommendedIssueKeys = manualKeys.length > 0 ? manualKeys : activityStream.activityStreamIssueKeys;
        return { ...current, activityStream, precisionIssueKeySets: { ...current.precisionIssueKeySets, activityStreamIssueKeys: activityStream.activityStreamIssueKeys, recommendedIssueKeys }, uniquePreciseIssueKeys: recommendedIssueKeys, precisionProbeStatus: activityStream.overallStatus === "failed" ? "failed" : "completed", precisionProbeErrors: activityStream.error ? [activityStream.error] : [], notice: `Activity Stream Probe completed: ${activityStream.parsedActivityCount} activities, ${activityStream.activityStreamIssueKeys.length} issue key(s). / Activity Stream 測試完成。` };
      });
      finishRun(runId, activityStream, { startedAt: String(response.startedAt || ""), completedAt: String(response.completedAt || ""), mode: userAnalysis.activityStreamQueryMode, user: userAnalysis.activityStreamUser.trim(), maxResults: userAnalysis.precisionProbeMaxResults, start: userAnalysis.startDate, end: endExclusive });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activity Stream Probe failed.";
      failRun(runId, message);
      appendDebugLog("precision", [`[ERROR] ${message}`]);
    }
  }

  async function runPrecisionProbe() {
    logAction("USER_ACTION", "Button clicked: Run Precision Probe / 執行精準查詢測試");
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    const runId = beginActivityStreamRun();
    if (!runId) return;
    patchState({ precisionProbeWarnings: [] });
    try {
      const response = await window.desktopApp?.userAnalysis?.precisionProbe?.({
        connection: smokeConnection()!, selectedUsers, startInclusive: userAnalysis.startDate, endExclusive,
        projectScope: userAnalysis.precisionProjectScope, activityStreamUser: userAnalysis.activityStreamUser.trim(),
        activityStreamQueryMode: userAnalysis.activityStreamQueryMode,
        activityStreamRelativeLinks: userAnalysis.activityStreamRelativeLinks,
        activityStreamRunId: runId,
        maxResults: userAnalysis.precisionProbeMaxResults, broadJql: buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate)
      });
      if (!response) throw new Error("Electron Precision Probe API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      const summary = response.summary as unknown as UserAnalysisPrecisionProbeSummary;
      const activityStream = response.activityStream as unknown as UserActivityStreamResult;
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
        precisionIssueKeySets: mergedSets,
        uniquePreciseIssueKeys: mergedSets.recommendedIssueKeys,
        precisionIssueSources: (response.issueSources ?? {}) as Record<string, string[]>,
        precisionProbeWarnings: (Array.isArray(response.warnings) ? response.warnings : []) as string[],
        precisionProbeErrors: (Array.isArray(response.errors) ? response.errors : []) as string[],
        precisionProbeLastRunAt: new Date().toISOString(),
        notice: `Precision Probe completed: ${summary.uniquePreciseIssueCount} unique candidate(s). / 精準查詢測試完成。`
      });
      finishRun(runId, activityStream, { mode: `precision:${userAnalysis.activityStreamQueryMode}`, user: userAnalysis.activityStreamUser.trim(), maxResults: userAnalysis.precisionProbeMaxResults, start: userAnalysis.startDate, end: endExclusive });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Manual URL Replay failed.";
      failRun(runId, message);
    }
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
      parsedActivityCount: userAnalysis.activityStream.entriesSanitized.filter((entry) => entry.variant !== "manual_url" && entry.extractedIssueKeysPerEntry.length > 0).length + (manual?.parsedActivityCount ?? 0),
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
      manualUrlReplayDiagnostics: userAnalysis.manualUrlReplayDiagnostics,
      activityStreamRunHistory: userAnalysis.activityStreamRunHistory,
      parsedEntriesFilter: userAnalysis.parsedEntriesFilter,
      parsedEntriesFilterStats: filterStats,
      filteredEntriesSanitized: filteredEntries.slice(0, 200),
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
    <SectionCard className="mb-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-relaxed text-cyan-950">Activity Stream is the preferred actual-activity validation source. updatedBy remains a candidate source and may include automation or indexing effects.<br />Activity Stream 優先作為實際活動驗證來源；updatedBy 僅為候選來源，可能包含自動化或索引影響。</div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div><FieldLabel label="Selected Users" sub="選擇使用者" /><textarea className="field min-h-24" value={userAnalysis.selectedUsersText} onChange={(event) => patchState({ selectedUsersText: event.target.value })} /></div>
        <div><FieldLabel label="Activity Stream User" sub="Activity Stream 使用者" /><input data-testid="activity-stream-user" className="field" value={userAnalysis.activityStreamUser} placeholder="roger_hsieh or roger_hsieh@phison.com" onChange={(event) => { logAction("USER_ACTION", `Activity Stream User changed: value=${event.target.value}`); patchState({ activityStreamUser: event.target.value }); }} /><div className="mt-2 text-xs font-semibold text-muted">Username and email are supported. / 支援 username 與 email。</div></div>
        <div><FieldLabel label="Activity Stream User Query Mode" sub="Activity Stream 使用者查詢模式" /><select data-testid="activity-stream-query-mode" className="field" value={userAnalysis.activityStreamQueryMode} onChange={(event) => { const value = event.target.value as typeof userAnalysis.activityStreamQueryMode; logAction("USER_ACTION", `Activity Stream Query Mode changed: value=${value}`); patchState({ activityStreamQueryMode: value }); }}><option value="auto">Auto / 自動（建議）</option><option value="username">Username only / 只用帳號</option><option value="email">Email only / 只用 Email</option><option value="custom">Custom only / 只用自訂輸入</option></select><div className="mt-2 text-xs font-semibold leading-relaxed text-muted">Auto tries username, escaped username, and email variants without duplicates. / 自動模式會依序測試帳號、跳脫帳號與 Email。</div></div>
        <div className="grid grid-cols-2 gap-2"><div><FieldLabel label="Start Date" sub="開始日期" /><input className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} /></div><div><FieldLabel label="End Date" sub="結束日期" /><input className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} /></div></div>
        <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input className="field" value={userAnalysis.precisionProjectScope} placeholder="COPGEN1, FW" onChange={(event) => patchState({ precisionProjectScope: event.target.value })} /></div>
        <div><FieldLabel label="Probe Max Results" sub="測試最大筆數" /><select data-testid="probe-max-results" className="field" value={userAnalysis.precisionProbeMaxResults} onChange={(event) => { const value = Number(event.target.value) as 0 | 10 | 20 | 50; logAction("USER_ACTION", `Probe Max Results changed: value=${value}`); patchState({ precisionProbeMaxResults: value }); }}>{[0, 10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <label className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-bold text-ink"><input type="checkbox" checked={userAnalysis.activityStreamRelativeLinks} onChange={(event) => patchState({ activityStreamRelativeLinks: event.target.checked })} />Use relativeLinks=true / 使用 relativeLinks=true</label>
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">Activity Stream request range: {userAnalysis.startDate || "-"} .. {endExclusive || "-"}<br />activityStreamDateSemantics: unknown</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button data-testid="run-activity-stream" className="btn" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => void runActivityStreamOnly()}><Radio size={16} />Run Activity Stream Probe / 執行 Activity Stream 測試</button><button data-testid="run-precision-probe" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => void runPrecisionProbe()}><Play size={16} />Run Precision Probe / 執行精準查詢測試</button><button data-testid="save-precision-probe" className="btn" type="button" disabled={userAnalysis.saving || userAnalysis.isActivityStreamRunning || (userAnalysis.precisionProbeResults.length === 0 && stream.status === "not_run")} onClick={() => void saveResult()}><Download size={16} />Save Precision Probe Result / 儲存精準查詢測試結果</button><button data-testid="add-precision-queue" className="btn" type="button" disabled={userAnalysis.isActivityStreamRunning || userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length === 0} onClick={addToFetchQueue}><DatabaseZap size={16} />Add Recommended Keys to Fetch Queue / 加入建議 Jira 到抓取佇列</button></div>
      {userAnalysis.isActivityStreamRunning ? <div data-testid="activity-stream-running" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Running Activity Stream Probe...<br />Run ID: {userAnalysis.currentActivityStreamRunId}</div> : null}
      {userAnalysis.notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{userAnalysis.notice}</div> : null}
    </SectionCard>

    <SectionCard title="Manual Activity Stream URL Replay" subtitle="手動 Activity Stream URL 重放" className="mb-4">
      <FieldLabel label="Manual Activity Stream URL" sub="手動 Activity Stream URL" />
      <textarea data-testid="manual-activity-stream-url" className="field min-h-24 break-all" value={userAnalysis.manualActivityStreamUrl} placeholder="https://jira.example.com/plugins/servlet/streams?maxResults=10&relativeLinks=true&streams=user+IS+roger%5C_hsieh" onChange={(event) => { logAction("USER_ACTION", "Manual Activity Stream URL changed"); patchState({ manualActivityStreamUrl: event.target.value }); }} />
      <div className="mt-3 flex flex-wrap items-center gap-3"><button data-testid="run-manual-activity-stream" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.isActivityStreamRunning} onClick={() => void runManualUrlReplay()}><Radio size={16} />Run Manual URL Replay / 執行手動 URL 重放</button>{userAnalysis.manualUrlReplayDiagnostics.manualUrlProvided ? <StatusBadge>{userAnalysis.manualUrlReplayDiagnostics.manualUrlAccepted ? "Manual URL validated / 手動 URL 驗證通過" : "Manual URL rejected / 手動 URL 被拒絕"}</StatusBadge> : null}</div>
      {userAnalysis.manualUrlReplayDiagnostics.rejectReason ? <div data-testid="manual-replay-reject" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Reject reason / 拒絕原因：{userAnalysis.manualUrlReplayDiagnostics.rejectReason}</div> : null}
      {userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized ? <div className="mt-3 break-all rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-900">{userAnalysis.manualUrlReplayDiagnostics.requestUrlSanitized}</div> : null}
    </SectionCard>

    <SectionCard title="Activity Stream Result" subtitle="Activity Stream 結果" className="mb-4">
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"><MiniStat label="Overall Status / 整體狀態" value={stream.overallStatus} /><MiniStat label="Reachable / 可連線" value={stream.reachable ? "yes" : "no"} /><MiniStat label="Supported / 是否支援" value={stream.supported} /><MiniStat label="Parsed / 已解析" value={stream.parsed ? "yes" : "no"} /><MiniStat label="Diagnosis / 診斷" value={stream.diagnosis} /><MiniStat label="Best Variant / 最佳變體" value={userAnalysis.manualActivityStreamResult?.parsed ? "manual_url" : stream.bestVariant || "-"} /><MiniStat label="Atom Entries / Atom 項目" value={stream.atomEntryCount} /><MiniStat label="Parsed Activities / 活動數" value={stream.parsedActivityCount} /><MiniStat label="Parsed Issue Keys / 解析 Jira 數" value={userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length} /></div>
      <div className="mb-3 break-all rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold text-muted">GET {stream.requestUrlSanitized || "/plugins/servlet/streams?..."}<br />Date semantics / 日期語意：{stream.activityStreamDateSemantics}</div>
      <h3 className="mb-2 text-sm font-black text-ink">Query Variants / 查詢變體</h3>
      <ResponsiveTableContainer className="mb-4"><table className="table min-w-[1200px]" data-testid="activity-stream-variants"><thead><tr>{["Variant", "User", "HTTP", "Content Type", "Reachable", "Supported", "Atom Entries", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{[...stream.variantResults.filter((item) => item.variant !== "manual_url"), ...(userAnalysis.manualActivityStreamResult ? [userAnalysis.manualActivityStreamResult] : [])].map((result) => <tr key={`${result.variant}-${result.activityStreamUser}`}><td className="font-bold">{result.variant}</td><td>{result.activityStreamUser}</td><td>{result.httpStatus}</td><td>{result.contentType || "-"}</td><td>{result.reachable ? "yes" : "no"}</td><td>{result.supported}</td><td>{result.atomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.parsedIssueKeys.join(", ") || "-"}</td><td><StatusBadge>{result.diagnosis}</StatusBadge></td></tr>)}{stream.variantResults.length === 0 && !userAnalysis.manualActivityStreamResult ? <tr><td colSpan={10} className="text-center text-muted">No query variants yet / 尚無查詢變體</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      <h3 className="mb-2 text-sm font-black text-ink">Parser Diagnostics / 解析診斷</h3>
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="parser-diagnostics"><MiniStat label="Atom Entries" value={stream.parserDiagnostics.atomEntryCount} /><MiniStat label="Parsed Entries" value={stream.parserDiagnostics.parsedEntryCount} /><MiniStat label="Skipped Entries" value={stream.parserDiagnostics.skippedEntryCount} /><MiniStat label="Without Issue Key" value={stream.parserDiagnostics.entriesWithoutIssueKeyCount} /><MiniStat label="Without Author" value={stream.parserDiagnostics.entriesWithoutAuthorCount} /><MiniStat label="Without Time" value={stream.parserDiagnostics.entriesWithoutTimeCount} /><MiniStat label="Multiple Keys" value={stream.parserDiagnostics.entriesWithMultipleIssueKeysCount} /></div>
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
      </div><div className="mt-3 flex flex-wrap items-center gap-3"><button data-testid="reset-entry-filters" className="btn" type="button" onClick={() => patchState({ parsedEntriesFilter: { activityTypes: [], issueKeyQuery: "", onlyWithIssueKey: false, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, variants: [], sources: [], authorQuery: "" } })}>Reset Filters / 重設篩選</button><span className="text-sm font-bold text-muted">Total Parsed Entries / 全部解析項目：{filterStats.totalParsedEntries} · Filtered Entries / 篩選後項目：{filterStats.filteredEntries} · Unique Issue Keys / 去重 Jira：{filterStats.uniqueIssueKeyCount}</span></div><div className="mt-2 text-xs font-semibold text-muted">Activity Types / 活動類型統計：{Object.entries(filterStats.activityTypeCounts).map(([type, count]) => `${type}: ${count}`).join(" · ") || "-"}</div></div>
      <ResponsiveTableContainer><table className="table min-w-[1400px]" data-testid="activity-stream-results"><thead><tr>{["Run ID", "Variant", "Source / 來源", "Activity Type / 活動類型", "Issue Key / Jira", "Time / 時間", "Author / 作者", "Author Email", "Title / 標題"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{filteredEntries.map((entry, index) => <tr key={`${entry.runId}-${entry.issueKey}-${entry.activityTime}-${index}`}><td>{entry.runId || "-"}</td><td>{entry.variant || "-"}</td><td>{entry.source}</td><td>{entry.activityType}</td><td className="font-black text-blue-700">{entry.issueKey || "-"}</td><td>{entry.activityTime || "-"}</td><td>{entry.activityAuthor || "-"}</td><td>{entry.activityAuthorEmail || "-"}</td><td><span className="block max-w-[360px] truncate" title={entry.activityTitle} data-allow-truncate="true">{entry.activityTitle || "-"}</span></td></tr>)}{filteredEntries.length === 0 ? <tr><td colSpan={9} className="text-center text-muted">No entries match the current filters / 沒有符合目前篩選條件的項目</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      {stream.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{stream.error}</div> : null}
    </SectionCard>

    <SectionCard title="Activity Stream Run History" subtitle="最近 5 次執行" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1150px]" data-testid="activity-stream-run-history"><thead><tr>{["Run ID", "Started", "Mode", "User", "Max", "Best Variant", "Atom", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.activityStreamRunHistory.map((run) => <tr key={run.runId}><td>{run.runId}</td><td>{run.startedAt}</td><td>{run.mode}</td><td>{run.activityStreamUser}</td><td>{run.maxResults}</td><td>{run.bestVariant || "-"}</td><td>{run.atomEntryCount}</td><td>{run.parsedActivityCount}</td><td>{run.parsedIssueKeyCount}</td><td>{run.diagnosis}</td></tr>)}{userAnalysis.activityStreamRunHistory.length === 0 ? <tr><td colSpan={10} className="text-center text-muted">No runs yet / 尚無執行紀錄</td></tr> : null}</tbody></table></ResponsiveTableContainer></SectionCard>

    {userAnalysis.precisionProbeResults.length > 0 ? <><SectionCard title="Precision Probe Summary" subtitle="精準查詢測試摘要" className="mb-4"><div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"><MiniStat label="updatedBy Candidate / 候選來源" value={userAnalysis.precisionProbeSummary.updatedBySupported} /><MiniStat label="Activity Stream" value={userAnalysis.precisionProbeSummary.activityStreamSupported} /><MiniStat label="CHANGED BY" value={userAnalysis.precisionProbeSummary.changedBySupported} /><MiniStat label="Broad Baseline / 寬鬆基準" value={userAnalysis.precisionProbeSummary.broadCandidateCount} /><MiniStat label="Recommended Jira / 建議 Jira" value={userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length} /><MiniStat label="Potential Reduction / 預估減少" value={userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent === null ? "N/A" : `${userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent}%`} /></div><div data-testid="precision-recommendation" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Recommended Stage 1 Mode / 建議第一階段模式：{userAnalysis.precisionProbeSummary.recommendedStage1Mode}<br />Recommended Issue Keys / 建議 Jira：{userAnalysis.precisionIssueKeySets.recommendedIssueKeys.join(", ") || "-"}</div><div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-900">Candidate Issue Keys / 候選 Jira（updatedBy）：{userAnalysis.precisionIssueKeySets.updatedByCandidateIssueKeys.join(", ") || "-"}<br />updatedBy may not exactly match Activity Stream user actions in this Jira environment.<br />updatedBy 在此 Jira 環境中不一定等同於 Activity Stream 實際使用者操作紀錄。</div></SectionCard><SectionCard title="Probe Results" subtitle="測試結果" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1280px]" data-testid="precision-results-table"><thead><tr>{["Probe Method / 測試方法", "Status / 狀態", "HTTP", "Supported / 支援", "Count / 數量", "Sample Issue Keys", "Candidate Source", "Error", "Recommendation"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.precisionProbeResults.map((result) => <tr key={result.candidateSource}><td className="font-bold">{result.method}</td><td><StatusBadge>{result.status}</StatusBadge></td><td>{result.httpStatus}</td><td>{result.supported}</td><td className="font-black">{result.resultCount}</td><td>{result.sampleIssueKeys.join(", ") || "-"}</td><td>{result.candidateSource}</td><td>{result.error || "-"}</td><td>{result.recommendation}</td></tr>)}</tbody></table></ResponsiveTableContainer></SectionCard></> : null}
    {[...userAnalysis.precisionProbeWarnings, ...userAnalysis.precisionProbeErrors].map((message) => <div key={message} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{message}</div>)}
  </>;
}
