import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, Copy, DatabaseZap, Download, Eye, FolderOpen, ListChecks, Play, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserAnalysisCandidateIssue } from "../state/SessionStateContext";

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
  const dateRangeDays = userAnalysis.startDate && userAnalysis.endDate
    ? Math.round((Date.parse(userAnalysis.endDate) - Date.parse(userAnalysis.startDate)) / 86400000) + 1
    : 0;
  const dateRangeWarning = dateRangeDays > 90 ? "Date range is over 90 days. Candidate Discovery may be slow; narrow the range if possible." : "";

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
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

  async function openSavedFolder(kind: "result" | "raw") {
    const filePath = kind === "result" ? userAnalysis.lastSavedCandidateResultPath : userAnalysis.lastSavedCandidateRawDataPath;
    const folderPath = parentFolder(filePath);
    if (!folderPath) return;
    try {
      const result = await window.desktopApp?.userAnalysis?.openExportFolder?.({ folderPath });
      if (!result) throw new Error("Electron open folder API is not available.");
      const label = kind === "result" ? "candidate result" : "candidate raw data";
      patchState({ notice: result.ok ? `Opened ${label} folder: ${result.folderPath}` : `Open ${label} folder failed: ${result.error}`, errors: result.ok ? [] : [result.error ?? `Open ${label} folder failed.`] });
      appendDebugLog("analysis", [result.ok ? `[INFO] Candidate ${kind === "result" ? "result" : "raw data"} folder opened: ${result.folderPath}` : `[ERROR] Open candidate ${kind === "result" ? "result" : "raw data"} folder failed: ${result.error}`]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Open export folder failed.";
      patchState({ errors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] Open candidate ${kind === "result" ? "result" : "raw data"} folder failed: ${message}`]);
    }
  }

  async function copySavedPath(kind: "result" | "raw") {
    const filePath = kind === "result" ? userAnalysis.lastSavedCandidateResultPath : userAnalysis.lastSavedCandidateRawDataPath;
    if (!filePath) return;
    try {
      await navigator.clipboard.writeText(filePath);
      patchState({ notice: kind === "result" ? "Candidate result path copied." : "Candidate raw data path copied.", errors: [] });
      appendDebugLog("analysis", [kind === "result" ? "[INFO] Candidate result path copied" : "[INFO] Candidate raw data path copied"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Copy path failed.";
      patchState({ errors: [message], notice: "" });
      appendDebugLog("analysis", [kind === "result" ? `[ERROR] Copy candidate result path failed: ${message}` : `[ERROR] Copy candidate raw data path failed: ${message}`]);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="使用者分析" subtitle="User Analysis" />
      <p className="mb-4 max-w-3xl text-sm font-semibold leading-relaxed text-muted">
        Find Jira issues touched by selected users in a date range. Stage 1 discovers candidate issues and prepares a fetch queue for Stage 2.
      </p>

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

      <SectionCard title="Candidate Discovery" subtitle="候選 Issue 搜尋" className="mb-4">
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <FieldLabel label="Selected Users" sub="使用者" />
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
              <FieldLabel label="Candidate Safety Limit" />
              <input className="field" value={userAnalysis.candidateSafetyLimit} readOnly />
            </div>
            <div>
              <FieldLabel label="Fetch Limit" />
              <select className="field" value={userAnalysis.fetchLimit} onChange={(event) => patchState({ fetchLimit: Number(event.target.value) })}>
                {fetchLimitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="rounded-lg border border-line bg-white p-3 text-xs font-semibold leading-relaxed text-muted">
              updatedBy is disabled in Stage 1. Exact updatedBy actor requires Stage 2 Full Fetch.
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn" type="button" onClick={handlePreviewJql}><Eye size={16} />Preview JQL</button>
          <button className="btn btn-primary" type="button" onClick={handleRunDiscovery} disabled={userAnalysis.loading}>
            <Play size={16} />{userAnalysis.loading ? "Running..." : "Run Candidate Discovery"}
          </button>
          <button className="btn" type="button" onClick={clearSession}><RotateCcw size={16} />Clear Candidate Session</button>
        </div>
      </SectionCard>

      <SectionCard title="Advanced / Debug" subtitle="Generated JQL" className="mb-4">
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
        <MiniStat label="Candidate Issues" value={userAnalysis.candidateIssues.length} />
        <MiniStat label="Fetch Queue" value={fetchQueue.length} />
        <MiniStat label="Fetch Limit" value={userAnalysis.fetchLimit} />
        <MiniStat label="Safety Limit" value={userAnalysis.candidateSafetyLimit} />
      </div>

      <SectionCard
        title="Stage 1 Results"
        subtitle="Candidate Issues / Fetch Queue"
        action={
          <div className="flex flex-wrap gap-2">
            <button className={`btn ${userAnalysis.activeTab === "candidates" ? "btn-primary" : ""}`} type="button" onClick={() => patchState({ activeTab: "candidates" })}><ListChecks size={16} />Candidate Issues</button>
            <button className={`btn ${userAnalysis.activeTab === "queue" ? "btn-primary" : ""}`} type="button" onClick={() => patchState({ activeTab: "queue" })}><DatabaseZap size={16} />Fetch Queue</button>
          </div>
        }
      >
        {userAnalysis.activeTab === "candidates" ? (
          <>
            <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px_220px]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-3 text-muted" size={16} />
                <input className="field pl-9" value={userAnalysis.search} placeholder="Filter issue key, summary, assignee, reporter, creator..." onChange={(event) => patchState({ search: event.target.value, page: 1 })} />
              </div>
              <select className="field" value={userAnalysis.pageSize} onChange={(event) => patchState({ pageSize: Number(event.target.value), page: 1 })}>
                {pageSizeOptions.map((option) => <option key={option} value={option}>{option} rows</option>)}
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
        ) : (
          <>
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">
              Fetch Queue prepares selected issues for Stage 2 Full Fetch. Full Fetch will be implemented in Stage 2.
            </div>
            <ResponsiveTableContainer>
              <table className="table min-w-[980px]">
                <thead>
                  <tr>
                    {["Issue Key", "Summary", "Status", "Assignee", "Updated", "Matched Reason", "Remove"].map((header) => <th key={header}>{header}</th>)}
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
                      <td><button className="btn px-3 py-2" type="button" onClick={() => removeFromQueue(issue.key)}><Trash2 size={14} />Remove</button></td>
                    </tr>
                  ))}
                  {fetchQueue.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted">No issues selected for Fetch Queue.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            <button className="btn mt-3 opacity-60" type="button" disabled><Plus size={16} />Run Full Fetch - Stage 2 coming later</button>
          </>
        )}
      </SectionCard>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Save Candidate Result" subtitle="Stage 1 Export">
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" type="button" onClick={() => void saveCandidateResult(false)} disabled={userAnalysis.saving}>
              <Download size={16} />Save Candidate Result
            </button>
            <button className="btn" type="button" onClick={() => void saveCandidateResult(true)} disabled={userAnalysis.saving}>
              <Download size={16} />Save Candidate Raw Data
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
                  <FolderOpen size={15} />Open Result Folder
                </button>
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedCandidateResultPath} onClick={() => void copySavedPath("result")}>
                  <Copy size={15} />Copy Result Path
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
                  <FolderOpen size={15} />Open Raw Data Folder
                </button>
                <button className="btn px-3 py-2" type="button" disabled={!userAnalysis.lastSavedCandidateRawDataPath} onClick={() => void copySavedPath("raw")}>
                  <Copy size={15} />Copy Raw Data Path
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 text-sm font-semibold leading-relaxed text-muted">
            Exports include globalDataSourceMode, masked source metadata, generatedJql, generatedBaseJql, jqlStrategy, updatedByStatus, candidateIssues, selectedForFetch, warnings, errors, and sanitized debug logs.
          </div>
        </SectionCard>
        <SectionCard title="Stage 2 Placeholder" subtitle="Full Fetch">
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            <span>Full Fetch, changelog, comments, attachments metadata, issue links, and user-focused statistics will be implemented in Stage 2.</span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
