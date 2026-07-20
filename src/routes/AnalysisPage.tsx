import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Clock3, Columns3, Copy, DatabaseZap, Download, Eye, FolderOpen, HelpCircle, PauseCircle, Play, RotateCcw, Search, Trash2 } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel, MockModal } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type JiraEvidenceEvent, type JiraEvidenceSummary, type UserActivityTimelineEvent, type UserActivityTimelineSummary, type UserAnalysisCandidateIssue, type UserAnalysisFullFetchMemory, type UserAnalysisFullFetchProgress, type UserAnalysisFullFetchReportRow, type UserAnalysisPrecisionProbeResult, type UserAnalysisPrecisionProbeSummary } from "../state/SessionStateContext";
import { buildTimelineIssueGroups, isRecommendedRelationType, mergeQueueMetadata, type FetchQueueMetadata, type FetchQueueSource } from "../../electron/userAnalysisWorkflow";

const fetchLimitOptions = [10, 20, 40, 80, 160];
const pageSizeOptions = [10, 20, 40, 80, 160];
const timelineRequiredColumns = [{ value: "time", label: "Time" }, { value: "user", label: "User" }, { value: "issueKey", label: "Issue Key" }, { value: "activityType", label: "Activity Type" }, { value: "sourceApplication", label: "Source Application" }];
const timelineOptionalColumns = [{ value: "title", label: "Title / Summary" }, { value: "allIssueKeys", label: "All Issue Keys" }, { value: "sourceDetail", label: "Source Detail" }, { value: "jiraRelation", label: "Jira Relation" }, { value: "confidence", label: "Confidence" }, { value: "eventId", label: "Event ID" }, { value: "entryFingerprint", label: "Entry Fingerprint" }, { value: "relatedSystems", label: "Related Systems" }, { value: "jiraRelationReason", label: "Jira Relation Reason" }, { value: "rawTitle", label: "Raw Title" }, { value: "sourceVariant", label: "Chunk / Source Variant" }, { value: "baselineStatus", label: "Baseline Status" }];
const issueGroupRequiredColumns = [{ value: "selected", label: "Selected" }, { value: "issueKey", label: "Issue Key" }, { value: "sourceApplications", label: "Source Applications" }, { value: "eventCount", label: "Event Count" }, { value: "firstSeen", label: "First Seen" }, { value: "lastSeen", label: "Last Seen" }];
const issueGroupOptionalColumns = [{ value: "activityTypes", label: "Activity Types" }, { value: "confidence", label: "Confidence Summary" }, { value: "issueKeyRole", label: "Issue Key Role" }, { value: "projectKey", label: "Project Key" }, { value: "jiraRelation", label: "Jira Relation" }, { value: "relatedSystems", label: "Related Systems" }, { value: "sourceDetails", label: "Source Details" }, { value: "timelineEventIds", label: "Timeline Event IDs" }, { value: "allIssueKeys", label: "All Issue Keys" }, { value: "matchedReasons", label: "Matched Reasons" }];
type WorkflowVisualState = "current" | "completed" | "ready" | "blocked" | "warning" | "failed" | "advanced";
const workflowStateStyles: Record<WorkflowVisualState, string> = {
  current: "border-blue-300 border-l-blue-600 bg-blue-50",
  completed: "border-emerald-300 border-l-emerald-600 bg-emerald-50",
  ready: "border-slate-300 border-l-slate-500 bg-slate-50",
  blocked: "border-slate-200 border-l-slate-300 bg-slate-50 opacity-80",
  warning: "border-amber-300 border-l-amber-500 bg-amber-50",
  failed: "border-red-300 border-l-red-600 bg-red-50",
  advanced: "border-violet-300 border-l-violet-600 bg-violet-50"
};
const workflowStateTones: Record<WorkflowVisualState, "green" | "blue" | "amber" | "red" | "gray"> = { current: "blue", completed: "green", ready: "gray", blocked: "gray", warning: "amber", failed: "red", advanced: "blue" };

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

function MultiSelectFilter({ testId, label, options, selected, onToggle, onClear }: { testId: string; label: string; options: Array<{ value: string; label: string }>; selected: string[]; onToggle: (value: string) => void; onClear: () => void }) {
  return <fieldset data-testid={testId} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
    <legend className="px-1 text-xs font-black text-ink">{label} <span className="text-muted">({selected.length || "All"})</span></legend>
    <div className="mt-1 flex min-w-0 flex-wrap gap-2">
      {options.map((option) => <label key={option.value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-bold ${selected.includes(option.value) ? "border-blue-300 bg-blue-50 text-blue-800" : "border-line bg-white text-muted"}`}>
        <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />{option.label}
      </label>)}
    </div>
    <button className="mt-2 text-xs font-bold text-blue-700 disabled:text-slate-400" type="button" disabled={selected.length === 0} onClick={onClear}>Clear filter / 清除篩選</button>
  </fieldset>;
}

function ColumnSettings({ testId, required, optional, visible, onToggle }: { testId: string; required: Array<{ value: string; label: string }>; optional: Array<{ value: string; label: string }>; visible: string[]; onToggle: (value: string) => void }) {
  return <div data-testid={testId} className="mt-3 grid min-w-0 grid-cols-1 gap-4 rounded-lg border border-line bg-slate-50 p-4 lg:grid-cols-3">
    <fieldset><legend className="text-xs font-black uppercase text-muted">Required columns / 必要欄位</legend><div className="mt-2 space-y-2">{required.map((column) => <label key={column.value} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked disabled />{column.label}</label>)}</div></fieldset>
    <fieldset><legend className="text-xs font-black uppercase text-muted">Optional columns / 可選欄位</legend><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{optional.map((column) => <label key={column.value} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={visible.includes(column.value)} onChange={() => onToggle(column.value)} />{column.label}</label>)}</div></fieldset>
    <div><div className="text-xs font-black uppercase text-muted">Hidden in details / 收合欄位</div><p className="mt-2 text-sm font-semibold leading-relaxed text-muted">Long identifiers, raw titles, diagnostics, and evidence remain available from each row's Details button.</p></div>
  </div>;
}

function sourceSystemLabel(summary: Record<"jira" | "confluence" | "other" | "unknown", number>) {
  return Object.entries(summary).filter(([, count]) => count > 0).map(([system, count]) => `${system.charAt(0).toUpperCase()}${system.slice(1)} ${count}`).join(" / ") || "Unknown 0";
}

export function AnalysisPage() {
  const { activeConnection } = useConnectionContext();
  const { appendDebugLog, getDebugLogs } = useOutletContext<AppOutletContext>();
  const { userAnalysis, setUserAnalysis } = useSessionState();
  const [sourceArchivePreview, setSourceArchivePreview] = useState<Record<string, unknown> | null>(null);
  const [sourceArchiveBusy, setSourceArchiveBusy] = useState(false);
  const [timelineRoundProgress, setTimelineRoundProgress] = useState<Record<string, unknown>>({});

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
  const failedFullFetchIssues = userAnalysis.fullFetchReport.filter((row) => row.fetchStatus === "failed");
  const filteredJiraEvidence = userAnalysis.jiraEvidenceEvents.filter((item) => {
    const filters = userAnalysis.jiraEvidenceFilters;
    return (filters.evidenceTypes.length === 0 || filters.evidenceTypes.includes(item.evidenceType))
      && (filters.activityTypes.length === 0 || filters.activityTypes.includes(item.activityType))
      && (filters.issueKeys.length === 0 || filters.issueKeys.includes(item.issueKey))
      && (filters.scopes.length === 0 || filters.scopes.includes(item.evidenceScope))
      && (filters.confidences.length === 0 || filters.confidences.includes(item.confidence))
      && (filters.actors.length === 0 || filters.actors.includes(item.actor));
  });
  const jiraEvidenceFilterOptions = {
    evidenceTypes: Array.from(new Set(userAnalysis.jiraEvidenceEvents.map((item) => item.evidenceType))).sort(),
    activityTypes: Array.from(new Set(userAnalysis.jiraEvidenceEvents.map((item) => item.activityType))).sort(),
    issueKeys: Array.from(new Set(userAnalysis.jiraEvidenceEvents.map((item) => item.issueKey))).sort(),
    scopes: Array.from(new Set(userAnalysis.jiraEvidenceEvents.map((item) => item.evidenceScope))).sort(),
    confidences: Array.from(new Set(userAnalysis.jiraEvidenceEvents.map((item) => item.confidence))).sort(),
    actors: Array.from(new Set(userAnalysis.jiraEvidenceEvents.map((item) => item.actor).filter(Boolean))).sort()
  };
  const filteredTimelineEvents = userAnalysis.timelineEvents.filter((event) => {
    const filter = userAnalysis.timelineFilters;
    const relation = event.isJiraRelated ? "jira_related" : event.jiraRelationReason === "unknown" ? "unknown_relation" : "non_jira";
    return (filter.activityTypes.length === 0 || filter.activityTypes.includes(event.eventType))
      && (filter.sourceApplications.length === 0 || filter.sourceApplications.includes(event.sourceApplication))
      && (filter.jiraRelations.length === 0 || filter.jiraRelations.includes(relation) || (filter.jiraRelations.includes("has_jira_issue_key") && event.hasJiraIssueKey))
      && (filter.confidences.length === 0 || filter.confidences.includes(event.sourceConfidence))
      && (filter.issueKeys.length === 0 || filter.issueKeys.some((value) => event.allIssueKeys.includes(value)))
      && (filter.projectKeys.length === 0 || filter.projectKeys.includes(event.projectKey))
      && (filter.users.length === 0 || filter.users.includes(event.userKey));
  });
  const filteredTimelineIssueGroups = userAnalysis.timelineIssueGroups.filter((group) => {
    const filter = userAnalysis.timelineIssueFilters;
    const jiraRelationMatches = filter.jiraRelations.length === 0 || filter.jiraRelations.some((value) => value === "jira_related" ? group.isJiraRelated : value === "has_jira_issue_key" ? group.hasJiraIssueKey : value === "non_jira" ? !group.isJiraRelated : Number(group.jiraRelationSummary.jiraRelationReasons.unknown ?? 0) > 0);
    return jiraRelationMatches
      && (filter.activityTypes.length === 0 || filter.activityTypes.some((value) => group.activityTypes.includes(value)))
      && (filter.confidences.length === 0 || filter.confidences.some((value) => group.confidenceSummary[value as "high" | "medium" | "low"] > 0))
      && (filter.issueKeyRoles.length === 0 || filter.issueKeyRoles.includes(group.issueKeyRole))
      && (filter.sourceApplications.length === 0 || filter.sourceApplications.some((value) => group.jiraRelationSummary.sourceApplicationCounts[value] > 0))
      && (filter.projectKeys.length === 0 || filter.projectKeys.includes(group.projectKey))
      && (filter.selectedStates.length === 0 || filter.selectedStates.includes(userAnalysis.selectedTimelineIssueKeys.includes(group.issueKey) ? "selected" : "unselected"))
      && (!filter.query.trim() || group.issueKey.toLowerCase().includes(filter.query.trim().toLowerCase()));
  });
  const timelineFilterOptions = {
    activityTypes: Array.from(new Set(userAnalysis.timelineEvents.map((event) => event.eventType))).sort(),
    issueKeys: Array.from(new Set(userAnalysis.timelineEvents.flatMap((event) => event.allIssueKeys))).sort(),
    projectKeys: Array.from(new Set(userAnalysis.timelineEvents.map((event) => event.projectKey).filter(Boolean))).sort(),
    users: Array.from(new Set(userAnalysis.timelineEvents.map((event) => event.userKey).filter(Boolean))).sort()
  };
  const timelineIssueFilterOptions = {
    activityTypes: Array.from(new Set(userAnalysis.timelineIssueGroups.flatMap((group) => group.activityTypes))).sort(),
    projectKeys: Array.from(new Set(userAnalysis.timelineIssueGroups.map((group) => group.projectKey).filter(Boolean))).sort()
  };
  const activeTimelineIssueFilters = [
    userAnalysis.timelineIssueFilters.jiraRelations.length ? `Jira Relation = ${userAnalysis.timelineIssueFilters.jiraRelations.join(" OR ")}` : "",
    userAnalysis.timelineIssueFilters.activityTypes.length ? `Activity Type = ${userAnalysis.timelineIssueFilters.activityTypes.join(" OR ")}` : "",
    userAnalysis.timelineIssueFilters.confidences.length ? `Confidence = ${userAnalysis.timelineIssueFilters.confidences.join(" OR ")}` : "",
    userAnalysis.timelineIssueFilters.issueKeyRoles.length ? `Role = ${userAnalysis.timelineIssueFilters.issueKeyRoles.join(" OR ")}` : "",
    userAnalysis.timelineIssueFilters.sourceApplications.length ? `Source Application = ${userAnalysis.timelineIssueFilters.sourceApplications.join(" OR ")}` : "",
    userAnalysis.timelineIssueFilters.projectKeys.length ? `Project Key = ${userAnalysis.timelineIssueFilters.projectKeys.join(" OR ")}` : "",
    userAnalysis.timelineIssueFilters.selectedStates.length ? `Selected State = ${userAnalysis.timelineIssueFilters.selectedStates.join(" OR ")}` : ""
  ].filter(Boolean);
  const filteredRelatedIssues = userAnalysis.relatedCandidateIssues.filter((item) =>
    (userAnalysis.relatedIssueFilters.relationType === "all" || item.relationType === userAnalysis.relatedIssueFilters.relationType)
    && (userAnalysis.relatedIssueFilters.confidence === "all" || item.confidence === userAnalysis.relatedIssueFilters.confidence)
  );
  const recommendedRelatedIssues = userAnalysis.relatedCandidateIssues.filter((item) => item.scope === "recommended" || isRecommendedRelationType(item.relationType));
  const optionalRelatedIssues = filteredRelatedIssues.filter((item) => item.scope === "optional" || !isRecommendedRelationType(item.relationType));
  const setupReady = selectedUsers.length === 1 && Boolean(userAnalysis.startDate && userAnalysis.endDate) && userAnalysis.startDate <= userAnalysis.endDate;
  const queueSourceCounts = fetchQueue.reduce((counts, issue) => {
    const sources = issue.queueMetadata?.sources.length ? issue.queueMetadata.sources : ["manual" as const];
    for (const source of sources) counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {} as Record<FetchQueueSource, number>);
  const fetchReportPageCount = Math.max(1, Math.ceil(filteredFetchReport.length / userAnalysis.fetchReportPageSize));
  const fetchReportPage = Math.min(userAnalysis.fetchReportPage, fetchReportPageCount);
  const pagedFetchReport = filteredFetchReport.slice((fetchReportPage - 1) * userAnalysis.fetchReportPageSize, fetchReportPage * userAnalysis.fetchReportPageSize);
  const hasFullFetchResult = userAnalysis.fullFetchStatus === "paused" || userAnalysis.fullFetchStatus === "completed" || userAnalysis.fullFetchStatus === "completed_with_errors" || userAnalysis.fullFetchStatus === "failed";
  const exportReady = Boolean(userAnalysis.timelineSummary || hasFullFetchResult || userAnalysis.relatedCandidateIssues.length > 0);
  const dateRangeDays = userAnalysis.startDate && userAnalysis.endDate
    ? Math.round((Date.parse(userAnalysis.endDate) - Date.parse(userAnalysis.startDate)) / 86400000) + 1
    : 0;
  const dateRangeWarning = dateRangeDays > 90 ? "Date range is over 90 days. User Analysis may take longer; narrow the range if possible." : "";
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

  function workflowStepState(step: string): { state: WorkflowVisualState; reason: string } {
    const active = (step === "timeline" && userAnalysis.activeTab === "timeline") || (step === "selectIssues" && userAnalysis.activeTab === "selectIssues") || (step === "queue" && ["queue", "fetchReport"].includes(userAnalysis.activeTab)) || (step === "relatedIssues" && userAnalysis.activeTab === "relatedIssues") || (step === "exports" && userAnalysis.activeTab === "exports");
    if (step === "timeline") {
      if (userAnalysis.timelineStatus === "failed") return { state: "failed", reason: userAnalysis.errors[0] || "Timeline build failed. / 時間線建立失敗。" };
      if (active) return { state: "current", reason: "Build direct activity evidence. / 建立直接操作證據。" };
      if (userAnalysis.timelineStatus === "completed") return { state: "completed", reason: "Timeline is available. / 時間線已建立。" };
      return setupReady ? { state: "ready", reason: "Ready to build Timeline. / 可建立時間線。" } : { state: "blocked", reason: "Set one user and a valid date range in Step 1. / 請在 Step 1 設定一位使用者與有效日期範圍。" };
    }
    if (step === "selectIssues") {
      if (active) return { state: "current", reason: "Filter and select Timeline issue groups. / 篩選並選擇 Jira 群組。" };
      if (userAnalysis.workflowSteps.timelineIssueSelection === "completed") return { state: "completed", reason: "Timeline issues were reviewed. / 已檢視時間線 Jira。" };
      return userAnalysis.timelineStatus === "completed" ? { state: "ready", reason: "Timeline issue groups are ready. / Jira 群組已就緒。" } : { state: "blocked", reason: "Build Activity Timeline first. / 請先建立活動時間線。" };
    }
    if (step === "queue") {
      if (userAnalysis.fullFetchStatus === "failed") return { state: "failed", reason: "Full Fetch failed. Review the report and logs. / 完整抓取失敗，請檢查報告。" };
      if (userAnalysis.fullFetchStatus === "completed_with_errors" || userAnalysis.fullFetchStatus === "paused") return { state: "warning", reason: "Full Fetch completed with warnings or is paused. / 完整抓取有警告或已暫停。" };
      if (active) return { state: "current", reason: "Review queue and run Full Fetch. / 檢查佇列並執行完整抓取。" };
      if (userAnalysis.fullFetchStatus === "completed") return { state: "completed", reason: "Full Fetch completed. / 完整抓取已完成。" };
      return fetchQueue.length > 0 ? { state: "ready", reason: `${fetchQueue.length} issue(s) ready. / ${fetchQueue.length} 張 Jira 已就緒。` } : { state: "blocked", reason: "Select timeline issues and add them to Fetch Queue first. / 請先選擇 Jira 並加入抓取佇列。" };
    }
    if (step === "relatedIssues") {
      if (active) return { state: "current", reason: "Review Recommended and Optional scope. / 檢視建議與選填範圍。" };
      if (userAnalysis.workflowSteps.relatedIssues === "completed") return { state: "completed", reason: "Related issues were reviewed. / 已檢視關聯 Jira。" };
      return hasFullFetchResult ? { state: "ready", reason: "Related issue evidence is ready. / 關聯證據已就緒。" } : { state: "blocked", reason: "Run Full Fetch first to discover related issues. / 請先執行完整抓取。" };
    }
    if (active) return { state: "current", reason: "Review and export available results. / 檢視並匯出結果。" };
    if (userAnalysis.workflowSteps.exports === "completed") return { state: "completed", reason: "Results were exported. / 結果已匯出。" };
    return exportReady ? { state: "ready", reason: "Exportable evidence is available. / 已有可匯出證據。" } : { state: "blocked", reason: "No exportable User Analysis results yet. / 目前尚無可匯出結果。" };
  }

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
  }

  async function previewSourceArchive() {
    setSourceArchiveBusy(true);
    try {
      const result = await window.desktopApp?.userAnalysis?.previewSourceArchive?.({ rawData: userAnalysis.fullFetchRawDataByIssueSanitized, selectedUser: selectedUsers[0] });
      if (!result) throw new Error("Source Archive preview is unavailable.");
      setSourceArchivePreview(result);
      appendDebugLog("analysis", Array.isArray(result.logs) ? result.logs.map(String) : ["[INFO] Source Archive package preview completed"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source Archive preview failed.";
      patchState({ errors: [message] });
      appendDebugLog("analysis", [`[ERROR] ${message}`]);
    } finally { setSourceArchiveBusy(false); }
  }

  async function exportSourceArchive() {
    setSourceArchiveBusy(true);
    try {
      const result = await window.desktopApp?.userAnalysis?.exportSourceArchive?.({ rawData: userAnalysis.fullFetchRawDataByIssueSanitized, selectedUser: selectedUsers[0] });
      if (!result?.ok) throw new Error("Source Archive export failed.");
      patchState({ notice: `Source Archive package exported / 來源封存套件已匯出：${String(result.filePath ?? "")}`, errors: [] });
      appendDebugLog("analysis", Array.isArray(result.logs) ? result.logs.map(String) : [`[INFO] Source Archive import package saved: ${String(result.filePath ?? "")}`]);
      setSourceArchivePreview(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source Archive export failed.";
      patchState({ errors: [message] });
      appendDebugLog("analysis", [`[ERROR] ${message}`]);
    } finally { setSourceArchiveBusy(false); }
  }

  function toggleTimelineIssueFilter(key: "jiraRelations" | "activityTypes" | "confidences" | "issueKeyRoles" | "sourceApplications" | "projectKeys" | "selectedStates", value: string) {
    const current = userAnalysis.timelineIssueFilters[key] as string[];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    patchState({ timelineIssueFilters: { ...userAnalysis.timelineIssueFilters, [key]: next } as typeof userAnalysis.timelineIssueFilters });
  }

  function clearTimelineIssueFilter(key: "jiraRelations" | "activityTypes" | "confidences" | "issueKeyRoles" | "sourceApplications" | "projectKeys" | "selectedStates") {
    patchState({ timelineIssueFilters: { ...userAnalysis.timelineIssueFilters, [key]: [] } as typeof userAnalysis.timelineIssueFilters });
  }

  function toggleTimelineFilter(key: keyof typeof userAnalysis.timelineFilters, value: string) {
    const current = userAnalysis.timelineFilters[key];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    patchState({ timelineFilters: { ...userAnalysis.timelineFilters, [key]: next } });
  }

  function toggleVisibleColumn(table: "timeline" | "issueGroup", value: string) {
    if (table === "timeline") {
      const current = userAnalysis.timelineVisibleColumns;
      patchState({ timelineVisibleColumns: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
    } else {
      const current = userAnalysis.issueGroupVisibleColumns;
      patchState({ issueGroupVisibleColumns: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
    }
  }

  function toggleIssueGroupDetail(issueKey: string) {
    const expanded = new Set(userAnalysis.expandedTimelineIssueGroups);
    if (expanded.has(issueKey)) expanded.delete(issueKey); else expanded.add(issueKey);
    patchState({ expandedTimelineIssueGroups: Array.from(expanded) });
  }

  function toggleJiraEvidenceFilter(key: keyof typeof userAnalysis.jiraEvidenceFilters, value: string) {
    const current = userAnalysis.jiraEvidenceFilters[key];
    patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] } });
  }

  function toggleJiraEvidenceDetail(evidenceId: string) {
    const expanded = new Set(userAnalysis.expandedJiraEvidence);
    if (expanded.has(evidenceId)) expanded.delete(evidenceId); else expanded.add(evidenceId);
    patchState({ expandedJiraEvidence: Array.from(expanded) });
  }

  function SetupSummary() {
    return <div data-testid="analysis-setup-summary" className="mb-4 grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold text-muted sm:grid-cols-2 xl:grid-cols-4"><span><b>User:</b> {selectedUsers[0] || "Not set"}</span><span><b>Date Range:</b> {userAnalysis.startDate || "-"} ~ {userAnalysis.endDate || "-"}</span><span><b>Project Scope:</b> {userAnalysis.precisionProjectScope || "All projects"}</span><span><b>Source:</b> Live Jira API</span></div>;
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
    const seedRelatedScope = () => {
      setUserAnalysis((current) => ({
        ...current,
        fullFetchStatus: "completed",
        activeTab: "relatedIssues",
        relatedCandidateIssues: [
          { issueKey: "SMOKE-200", relationType: "parent_link", scope: "recommended", discoveredFromIssueKey: "SMOKE-101", source: "related_issue_expansion", field: "parent", reason: "parent hierarchy", confidence: "high", firstSeen: "2026-07-07T00:00:00.000Z", lastSeen: "2026-07-07T00:00:00.000Z", evidenceCount: 1, selected: false },
          { issueKey: "SMOKE-300", relationType: "mentioned_issue_key", scope: "optional", discoveredFromIssueKey: "SMOKE-101", source: "related_issue_expansion", field: "description", reason: "mentioned in description", confidence: "medium", firstSeen: "2026-07-07T00:00:00.000Z", lastSeen: "2026-07-07T00:00:00.000Z", evidenceCount: 1, selected: false }
        ]
      }));
    };
    const seedWorkflowVisualState = (event: Event) => {
      const state = (event as CustomEvent<{ state?: "warning" | "failed" | "reset" }>).detail?.state;
      if (state === "reset") {
        setUserAnalysis((current) => ({ ...current, activeTab: "timeline", timelineStatus: "idle", fullFetchStatus: "idle", selectedForFetch: [], autoLogPath: "", errors: [] }));
        return;
      }
      setUserAnalysis((current) => state === "failed"
        ? { ...current, activeTab: "timeline", timelineStatus: "failed", errors: ["UI smoke timeline failure reason"] }
        : { ...current, activeTab: "queue", fullFetchStatus: "completed_with_errors", autoLogPath: "smoke-full-fetch.log", errors: [], selectedForFetch: current.selectedForFetch.length ? current.selectedForFetch : ["SMOKE-101"] });
    };
    const seedFullFetchFailure = () => setUserAnalysis((current) => ({
      ...current,
      activeTab: "fetchReport",
      fullFetchStatus: "completed_with_errors",
      fullFetchSummary: { ...current.fullFetchSummary, totalIssues: 1, failed: 1 },
      fullFetchReport: [{ issueKey: "SMOKE-404", summary: "Missing issue", status: "-", fetchStatus: "failed", httpStatus: "404", errorCode: "HTTP_404", stage: "issue_full_fetch", source: "recommended_related_issue", matchedReason: "epic_link_parent", retryCount: 0, occurredAt: "2026-07-16T08:00:00.000Z", changelogHistories: 0, changelogItems: 0, comments: 0, attachmentsMetadata: 0, issueLinks: 0, parsedUsers: 0, estimatedEvents: 0, duration: "12ms", error: "HTTP 404 Not Found", lastFetchedAt: "2026-07-16 16:00:00" }]
    }));
    const seedJiraEvidence = () => {
      const base = { schemaVersion: "jira_evidence_event_v1" as const, system: "jira" as const, selectedUser: "roger_hsieh", source: "jira_full_fetch" as const, sourceIssueKey: "COPGEN1-126606", relatedToTimelineEventIds: ["sha256:timeline-smoke"], withinSelectedDateRange: true, confidence: "high" as const };
      const evidence: JiraEvidenceEvent[] = [
        { ...base, evidenceId: "sha256:evidence-comment", evidenceScope: "direct", evidenceType: "jira_comment", activityType: "comment", issueKey: "COPGEN1-126606", projectKey: "COPGEN1", actor: "roger_hsieh", eventTime: "2026-07-02T03:00:00.000Z", sourceLayer: "direct_activity_issue", field: "comment", fromValue: "", toValue: "", title: "Added Jira comment", contentSummary: "Direct comment evidence", rawTextPreview: "Direct comment evidence", extractionReason: "actor and date matched", rawRef: { type: "comment", commentId: "1001" } },
        { ...base, evidenceId: "sha256:evidence-status", evidenceScope: "direct", evidenceType: "jira_changelog", activityType: "status_change", issueKey: "COPGEN1-126606", projectKey: "COPGEN1", actor: "roger_hsieh", eventTime: "2026-07-03T04:00:00.000Z", sourceLayer: "direct_activity_issue", field: "status", fromValue: "To Do", toValue: "In Progress", title: "Changed status", contentSummary: "status: To Do -> In Progress", rawTextPreview: "status change", extractionReason: "actor and date matched", rawRef: { type: "changelog", historyId: "2001" } },
        { ...base, evidenceId: "sha256:evidence-attachment", evidenceScope: "direct", evidenceType: "jira_attachment_metadata", activityType: "attachment", issueKey: "COPGEN1-126606", projectKey: "COPGEN1", actor: "roger_hsieh", eventTime: "2026-07-04T05:00:00.000Z", sourceLayer: "direct_activity_issue", field: "attachment", fromValue: "", toValue: "evidence.txt", title: "Added attachment metadata", contentSummary: "filename=evidence.txt", rawTextPreview: "evidence.txt", extractionReason: "actor and date matched; metadata only", rawRef: { type: "attachment_metadata", attachmentId: "3001" } },
        { ...base, evidenceId: "sha256:evidence-link", evidenceScope: "context", evidenceType: "jira_issue_link_context", activityType: "issue_link", issueKey: "COPGEN1-126606", projectKey: "COPGEN1", actor: "", eventTime: "", sourceLayer: "direct_activity_issue", withinSelectedDateRange: false, confidence: "medium", field: "issue_link", fromValue: "", toValue: "COPGEN1-100", title: "Issue link context", contentSummary: "blocks COPGEN1-100", rawTextPreview: "blocks COPGEN1-100", extractionReason: "no attributable actor/time; context only", rawRef: { type: "issue_link", linkId: "4001" } },
        { ...base, evidenceId: "sha256:evidence-related", evidenceScope: "related_context", evidenceType: "jira_issue_snapshot_context", activityType: "issue_snapshot", issueKey: "COPGEN1-69506", projectKey: "COPGEN1", actor: "", eventTime: "2026-07-04T06:00:00.000Z", sourceIssueKey: "COPGEN1-69506", sourceLayer: "evidence_related_issue", confidence: "medium", field: "issue_fields_snapshot", fromValue: "", toValue: "", title: "Related issue snapshot", contentSummary: "Context only", rawTextPreview: "Context only", extractionReason: "related issue is not primary evidence", rawRef: { type: "issue_snapshot", issueId: "5001" } }
      ];
      const summary: JiraEvidenceSummary = { schemaVersion: "jira_evidence_summary_v1", selectedUser: "roger_hsieh", dateRange: { start: "2026-07-01", end: "2026-07-07" }, directIssueCount: 1, fullFetchedIssueCount: 2, failedIssueCount: 1, directEvidenceCount: 3, contextEvidenceCount: 1, relatedContextEvidenceCount: 1, excludedEvidenceCount: 2, byEvidenceType: { jira_comment: 1, jira_changelog: 1, jira_attachment_metadata: 1, jira_issue_link_context: 1, jira_issue_snapshot_context: 1 }, byActivityType: { comment: 1, status_change: 1, attachment: 1, issue_link: 1, issue_snapshot: 1 }, byIssueKey: { "COPGEN1-126606": { directEvidenceCount: 3, contextEvidenceCount: 1, activityTypes: ["attachment", "comment", "issue_link", "status_change"] }, "COPGEN1-69506": { directEvidenceCount: 0, contextEvidenceCount: 1, activityTypes: ["issue_snapshot"] } }, coverage: { issuesWithEvidence: 1, issuesWithoutDirectEvidence: 0, failedIssues: ["SMOKE-404"] }, relatedIssueExpansionPolicy: { recursive: false, maxDepth: 1, relatedIssuesAsPrimaryEvidence: false } };
      setUserAnalysis((current) => ({ ...current, activeTab: "fetchReport", jiraEvidenceEvents: evidence, jiraEvidenceSummary: summary, jiraEvidenceExcludedSummary: { schemaVersion: "jira_evidence_excluded_summary_v1", excludedCount: 2, byReason: { actor_not_selected_user: 1, outside_date_range: 1 } }, jiraEvidenceFiles: { events: "smoke/jira-evidence-events.json", summary: "smoke/jira-evidence-summary.json", excludedSummary: "smoke/jira-evidence-excluded-summary.json", schema: "smoke/jira-evidence-schema.json", roadmap: "smoke/analysis-roadmap.json" }, jiraEvidenceFilters: { evidenceTypes: [], activityTypes: [], issueKeys: [], scopes: ["direct"], confidences: [], actors: ["roger_hsieh"] }, expandedJiraEvidence: [] }));
    };
    const seedMissingAnalysisInput = () => setUserAnalysis((current) => ({ ...current, activeTab: "timeline", selectedUsersText: "" }));
    window.addEventListener("jaa:seed-large-queue", seedLargeQueue);
    window.addEventListener("jaa:churn-debug-log", churnDebugLog);
    window.addEventListener("jaa:seed-related-scope", seedRelatedScope);
    window.addEventListener("jaa:seed-workflow-visual-state", seedWorkflowVisualState);
    window.addEventListener("jaa:seed-full-fetch-failure", seedFullFetchFailure);
    window.addEventListener("jaa:seed-jira-evidence", seedJiraEvidence);
    window.addEventListener("jaa:seed-missing-analysis-input", seedMissingAnalysisInput);
    return () => {
      window.removeEventListener("jaa:seed-large-queue", seedLargeQueue);
      window.removeEventListener("jaa:churn-debug-log", churnDebugLog);
      window.removeEventListener("jaa:seed-related-scope", seedRelatedScope);
      window.removeEventListener("jaa:seed-workflow-visual-state", seedWorkflowVisualState);
      window.removeEventListener("jaa:seed-full-fetch-failure", seedFullFetchFailure);
      window.removeEventListener("jaa:seed-jira-evidence", seedJiraEvidence);
      window.removeEventListener("jaa:seed-missing-analysis-input", seedMissingAnalysisInput);
    };
  }, [appendDebugLog, setUserAnalysis]);

  useEffect(() => {
    const subscribe = window.desktopApp?.userAnalysis?.onFullFetchLog;
    if (!subscribe) return;
    return subscribe((line) => appendDebugLog("analysis", [line]));
  }, [appendDebugLog]);

  useEffect(() => window.desktopApp?.userAnalysis?.onActivityTimelineProgress?.((progress) => {
    setTimelineRoundProgress(progress);
    appendDebugLog("analysis", [`[INFO][timeline-round] runId=${String(progress.probeRunId ?? "-")} round=${String(progress.currentRound ?? 0)}/${String(progress.totalRounds ?? 0)} window=${String(progress.currentWindow ?? 0)}/${String(progress.totalWindows ?? 0)} stage=${String(progress.stage ?? "-")} duration=${String(progress.currentApiDurationMs ?? 0)}ms`]);
  }), [appendDebugLog]);

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

  function showStep(step: "timeline" | "selectIssues" | "queue" | "fetchReport" | "relatedIssues" | "exports" | "candidate") {
    const labels = {
      selectIssues: "Select Issues / 選取議題",
      relatedIssues: "Related Issues / 關聯議題",
      candidate: "Candidate Search / 候選搜尋",
      queue: "Fetch Queue / 抓取佇列",
      fetchReport: "Full Fetch Report / 完整抓取報告",
      timeline: "Activity Timeline / 活動時間線",
      exports: "Exports / 匯出"
    };
    logAnalysisAction("USER_ACTION", `Workflow tab changed: ${labels[step]}`);
    patchState({ activeTab: step === "candidate" ? "candidates" : step });
  }

  async function handleBuildTimeline() {
    logAnalysisAction("USER_ACTION", "Button clicked: Build Activity Timeline / 建立活動時間線");
    if (selectedUsers.length !== 1 || !userAnalysis.startDate || !userAnalysis.endDate) {
      const message = "Please select a user and date range first. / 請先選擇使用者與日期範圍。";
      patchState({ errors: [message], notice: "" });
      appendDebugLog("analysis", [`[WARN] ${message}`]);
      return;
    }
    if (!activeConnection) {
      patchState({ errors: ["No active Jira connection. Reload .env in Connections first."], notice: "" });
      return;
    }
    setTimelineRoundProgress({ stage: "starting" });
    patchState({ timelineStatus: "running", errors: [], notice: "Building Activity Timeline... / 正在建立活動時間線..." });
    try {
      const response = await window.desktopApp?.userAnalysis?.buildActivityTimeline({ connection: activeConnection, selectedUser: selectedUsers[0], startDate: userAnalysis.startDate, endDate: userAnalysis.endDate, projectScope: userAnalysis.precisionProjectScope, requestWindow: { type: userAnalysis.activityStreamRequestWindow, customDays: userAnalysis.activityStreamRequestWindow === "custom_days" ? userAnalysis.activityStreamCustomWindowDays : null }, fullScanRoundCount: userAnalysis.activityStreamFullScanRoundCount, delayBetweenRoundsMs: userAnalysis.activityStreamDelayBetweenRoundsMs, roundExecutionMode: userAnalysis.activityStreamRoundExecutionMode, mergeStrategy: userAnalysis.activityStreamMergeStrategy });
      if (!response) throw new Error("Timeline builder is unavailable.");
      const events = Array.isArray(response.events) ? response.events as UserActivityTimelineEvent[] : [];
      const summary = response.summary as UserActivityTimelineSummary;
      const exportedFiles = response.exportedFiles as { jsonPath: string; csvPath: string; summaryPath: string };
      const groups = buildTimelineIssueGroups(events);
      const steps = { ...userAnalysis.workflowSteps, activityTimeline: "completed" as const, timelineIssueSelection: "not_run" as const };
      patchState({ timelineStatus: "completed", timelineEvents: events, timelineSummary: summary, timelineIssueGroups: groups, selectedTimelineIssueKeys: [], timelineIssueFilters: { ...userAnalysis.timelineIssueFilters, projectKeys: userAnalysis.precisionProjectScope ? [userAnalysis.precisionProjectScope.toUpperCase()] : userAnalysis.timelineIssueFilters.projectKeys }, workflowSteps: steps, timelineExportPaths: exportedFiles, expandedTimelineEvents: [], notice: `Activity Timeline built: ${events.length} events; ${groups.length} issue groups.`, errors: [] });
      void persistWorkflowSnapshot({ steps, timelineIssueGroups: groups });
      appendDebugLog("analysis", Array.isArray(response.logs) ? response.logs.map(String) : [`[INFO] Activity Timeline built: ${events.length} events`]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activity Timeline build failed.";
      patchState({ timelineStatus: "failed", workflowSteps: { ...userAnalysis.workflowSteps, activityTimeline: "failed" }, errors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] Activity Timeline build failed: ${message}`, "[INFO] No database write performed", "[INFO] No Jira write performed"]);
    }
  }

  function toggleTimelineDetail(eventId: string) {
    const expanded = new Set(userAnalysis.expandedTimelineEvents);
    if (expanded.has(eventId)) expanded.delete(eventId); else expanded.add(eventId);
    patchState({ expandedTimelineEvents: Array.from(expanded) });
  }

  function persistWorkflowSnapshot(overrides: Record<string, unknown> = {}) {
    return window.desktopApp?.userAnalysis?.updateWorkflowSnapshot?.({
      steps: userAnalysis.workflowSteps,
      timelineIssueGroups: userAnalysis.timelineIssueGroups,
      timelineSelectedIssues: userAnalysis.selectedTimelineIssueKeys,
      fetchQueue,
      relatedCandidateIssues: userAnalysis.relatedCandidateIssues,
      addedTimelineIssuesToFetchQueueCount: userAnalysis.addedTimelineIssuesToFetchQueueCount,
      addedRelatedIssuesToFetchQueueCount: userAnalysis.addedRelatedIssuesToFetchQueueCount,
      addedRecommendedRelatedIssuesToFetchQueueCount: userAnalysis.addedRecommendedRelatedIssuesToFetchQueueCount,
      addedOptionalRelatedIssuesToFetchQueueCount: userAnalysis.addedOptionalRelatedIssuesToFetchQueueCount,
      uiState: {
        workflowStepCount: 5,
        advancedToolsVisible: false,
        fullFetchProgressLocation: "step3_full_fetch",
        timeline: {
          visibleColumns: userAnalysis.timelineVisibleColumns,
          requiredColumns: timelineRequiredColumns.map((column) => column.value),
          optionalColumns: timelineOptionalColumns.map((column) => column.value),
          filters: userAnalysis.timelineFilters,
          filteredCount: filteredTimelineEvents.length,
          totalCount: userAnalysis.timelineEvents.length
        },
        selectIssues: {
          visibleColumns: userAnalysis.issueGroupVisibleColumns,
          requiredColumns: issueGroupRequiredColumns.map((column) => column.value),
          optionalColumns: issueGroupOptionalColumns.map((column) => column.value),
          filters: userAnalysis.timelineIssueFilters,
          filteredCount: filteredTimelineIssueGroups.length,
          totalCount: userAnalysis.timelineIssueGroups.length
        }
      },
      ...overrides
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void persistWorkflowSnapshot(); }, 120);
    return () => window.clearTimeout(timer);
  }, [userAnalysis.timelineFilters, userAnalysis.timelineVisibleColumns, userAnalysis.timelineIssueFilters, userAnalysis.issueGroupVisibleColumns, userAnalysis.selectedTimelineIssueKeys]);

  function queueCandidate(issueKey: string, matchedReason: string, source: FetchQueueSource, metadata: Partial<FetchQueueMetadata>): UserAnalysisCandidateIssue {
    return { id: issueKey, key: issueKey, summary: "Queued from User Analysis workflow", status: "Pending", assignee: "-", reporter: "-", creator: "-", updated: "", created: "", issueType: "Unknown", priority: "-", project: issueKey.split("-")[0] ?? "", matchedReason, queueMetadata: mergeQueueMetadata(undefined, { ...metadata, source, matchedReason }) };
  }

  function toggleTimelineIssue(issueKey: string, checked: boolean) {
    const selected = new Set(userAnalysis.selectedTimelineIssueKeys);
    if (checked) selected.add(issueKey); else selected.delete(issueKey);
    patchState({ selectedTimelineIssueKeys: Array.from(selected), workflowSteps: { ...userAnalysis.workflowSteps, timelineIssueSelection: "completed" } });
  }

  function selectTimelineIssues(mode: "filtered" | "high" | "clear") {
    const keys = mode === "clear" ? [] : filteredTimelineIssueGroups.filter((group) => mode !== "high" || group.confidenceSummary.high > 0).map((group) => group.issueKey);
    patchState({ selectedTimelineIssueKeys: keys, workflowSteps: { ...userAnalysis.workflowSteps, timelineIssueSelection: "completed" } });
  }

  function addTimelineIssuesToQueue() {
    const groups = userAnalysis.timelineIssueGroups.filter((group) => userAnalysis.selectedTimelineIssueKeys.includes(group.issueKey));
    const existing = new Map(userAnalysis.candidateIssues.map((issue) => [issue.key, issue]));
    const added = groups.filter((group) => !existing.has(group.issueKey)).length;
    const merged = groups.length - added;
    for (const group of groups) {
      const current = existing.get(group.issueKey);
      const metadata = mergeQueueMetadata(current?.queueMetadata, { source: "activity_timeline", matchedReason: "selected_from_activity_timeline", selectedUser: selectedUsers[0] ?? "", dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, timelineEventIds: group.timelineEventIds, activityTypes: group.activityTypes, confidenceSummary: group.confidenceSummary, issueKeyRole: group.issueKeyRole, addedAt: new Date().toISOString() });
      existing.set(group.issueKey, current ? { ...current, matchedReason: metadata.matchedReasons.join(", "), queueMetadata: metadata } : queueCandidate(group.issueKey, "selected_from_activity_timeline", "activity_timeline", metadata));
    }
    const candidateIssues = Array.from(existing.values());
    const selectedForFetch = Array.from(new Set([...userAnalysis.selectedForFetch, ...groups.map((group) => group.issueKey)]));
    const count = userAnalysis.addedTimelineIssuesToFetchQueueCount + groups.length;
    const steps = { ...userAnalysis.workflowSteps, timelineIssueSelection: "completed" as const, fetchQueue: selectedForFetch.length ? "ready" as const : "empty" as const };
    patchState({ candidateIssues, selectedForFetch, addedTimelineIssuesToFetchQueueCount: count, lastQueueAddSummary: { kind: "timeline", added, merged, total: selectedForFetch.length }, workflowSteps: steps, activeTab: "queue", notice: `${groups.length} timeline issue(s) added to Fetch Queue.` });
    void persistWorkflowSnapshot({ steps, timelineIssueGroups: userAnalysis.timelineIssueGroups, timelineSelectedIssues: userAnalysis.selectedTimelineIssueKeys, fetchQueue: candidateIssues.filter((issue) => selectedForFetch.includes(issue.key)), addedTimelineIssuesToFetchQueueCount: count, sessionEvent: "timeline_issues_added_to_fetch_queue" });
  }

  function addRelatedIssuesToQueue(scope: "recommended" | "optional") {
    const related = scope === "recommended"
      ? recommendedRelatedIssues
      : optionalRelatedIssues.filter((item) => userAnalysis.selectedRelatedIssueKeys.includes(item.issueKey));
    const existing = new Map(userAnalysis.candidateIssues.map((issue) => [issue.key, issue]));
    const uniqueRelatedKeys = Array.from(new Set(related.map((item) => item.issueKey)));
    const added = uniqueRelatedKeys.filter((key) => !existing.has(key)).length;
    const merged = uniqueRelatedKeys.length - added;
    for (const item of related) {
      const current = existing.get(item.issueKey);
      const source: FetchQueueSource = scope === "recommended" ? "recommended_related_issue" : "optional_related_issue";
      const metadata = mergeQueueMetadata(current?.queueMetadata, { source, matchedReason: item.relationType, selectedUser: selectedUsers[0] ?? "", dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate }, addedAt: new Date().toISOString() });
      existing.set(item.issueKey, current ? { ...current, matchedReason: metadata.matchedReasons.join(", "), queueMetadata: metadata } : queueCandidate(item.issueKey, item.relationType, source, metadata));
    }
    const candidateIssues = Array.from(existing.values());
    const selectedForFetch = Array.from(new Set([...userAnalysis.selectedForFetch, ...related.map((item) => item.issueKey)]));
    const count = userAnalysis.addedRelatedIssuesToFetchQueueCount + uniqueRelatedKeys.length;
    const recommendedCount = userAnalysis.addedRecommendedRelatedIssuesToFetchQueueCount + (scope === "recommended" ? uniqueRelatedKeys.length : 0);
    const optionalCount = userAnalysis.addedOptionalRelatedIssuesToFetchQueueCount + (scope === "optional" ? uniqueRelatedKeys.length : 0);
    const steps = { ...userAnalysis.workflowSteps, fetchQueue: "ready" as const };
    patchState({ candidateIssues, selectedForFetch, addedRelatedIssuesToFetchQueueCount: count, addedRecommendedRelatedIssuesToFetchQueueCount: recommendedCount, addedOptionalRelatedIssuesToFetchQueueCount: optionalCount, lastQueueAddSummary: { kind: scope, added, merged, total: selectedForFetch.length }, workflowSteps: steps, activeTab: "queue", notice: `${uniqueRelatedKeys.length} ${scope} related issue(s) added to Fetch Queue.` });
    void persistWorkflowSnapshot({ steps, fetchQueue: candidateIssues.filter((issue) => selectedForFetch.includes(issue.key)), addedRelatedIssuesToFetchQueueCount: count, addedRecommendedRelatedIssuesToFetchQueueCount: recommendedCount, addedOptionalRelatedIssuesToFetchQueueCount: optionalCount });
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
    logAnalysisAction("USER_ACTION", "Button clicked: Run Advanced Candidate Search / 執行進階候選搜尋");
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
        const message = String(response.message ?? "Advanced Candidate Search failed.");
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
      const discovered = (Array.isArray(response.candidates) ? response.candidates : []) as UserAnalysisCandidateIssue[];
      const existingCandidates = new Map(userAnalysis.candidateIssues.map((issue) => [issue.key, issue]));
      const candidates: UserAnalysisCandidateIssue[] = discovered.map((issue) => ({
        ...issue,
        queueMetadata: mergeQueueMetadata(existingCandidates.get(issue.key)?.queueMetadata, {
          source: "advanced_candidate_search",
          matchedReason: issue.matchedReason || "assignee_reporter_creator_jql_match",
          selectedUser: selectedUsers.join(", "),
          dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate },
          addedAt: new Date().toISOString()
        })
      }));
      for (const issue of userAnalysis.candidateIssues) if (!candidates.some((candidate) => candidate.key === issue.key)) candidates.push(issue);
      const warnings = [...(dateRangeWarning ? [dateRangeWarning] : []), updatedByWarning, ...(Array.isArray(response.warnings) ? response.warnings as string[] : [])];
      const selectedForFetch = Array.from(new Set([...userAnalysis.selectedForFetch, ...discovered.slice(0, userAnalysis.fetchLimit).map((issue) => issue.key)]));
      patchState({
        loading: false,
        candidateIssues: candidates,
        selectedForFetch,
        workflowSteps: { ...userAnalysis.workflowSteps, fetchQueue: selectedForFetch.length ? "ready" : userAnalysis.workflowSteps.fetchQueue },
        excludedIssues: [],
        activeTab: "candidates",
        page: 1,
        errors: [],
        warnings,
        jqlStrategy: String(response.jqlStrategy ?? "base search without updatedBy") as typeof userAnalysis.jqlStrategy,
        updatedByStatus: String(response.updatedByStatus ?? "disabled") as typeof userAnalysis.updatedByStatus,
        lastDiscoveryAt: new Date().toISOString(),
        rawSearchMetadata: response.metadata ?? null,
        notice: `Advanced Candidate Search completed: ${candidates.length} issues.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Advanced Candidate Search failed.";
      patchState({ loading: false, errors: [message], warnings: dateRangeWarning ? [dateRangeWarning, updatedByWarning] : [updatedByWarning], notice: "" });
      appendDebugLog("analysis", [`[ERROR] ${message}`, "[INFO] No database write performed"]);
    }
  }

  async function handleRunPrecisionProbe() {
    logAnalysisAction("USER_ACTION", "Button clicked: Run Precision Probe / 執行精準查詢測試");
    const error = validate();
    if (error) {
      patchState({ precisionProbeErrors: [error], notice: "" });
      appendDebugLog("analysis", [`[WARN] ${error}`]);
      return;
    }
    const probeConnection = activeConnection ?? (window.desktopApp?.uiSmoke ? {
      id: "ui-smoke",
      name: "UI Smoke Connection",
      baseUrl: "https://jira.example.invalid",
      authType: "bearer" as const,
      apiVersion: "v2" as const,
      username: "smoke.user",
      email: "smoke.user@example.invalid",
      apiToken: "ui-smoke-masked",
      tokenSource: "session" as const,
      tokenMasked: "****",
      status: "not_tested" as const,
      lastTestedAt: "",
      authenticatedUser: "",
      accessibleProjectsCount: 0,
      active: true
    } : null);
    if (!probeConnection) {
      const message = "No active Jira connection. Reload .env in Connections first.";
      patchState({ precisionProbeErrors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] ${message}`]);
      return;
    }
    patchState({ precisionProbeStatus: "running", precisionProbeErrors: [], precisionProbeWarnings: [], notice: "" });
    try {
      const response = await window.desktopApp?.userAnalysis?.precisionProbe?.({
        connection: probeConnection,
        selectedUsers,
        startInclusive: currentJqlDateRange.startInclusive,
        endExclusive: currentJqlDateRange.endExclusive,
        activityStreamEndInclusive: userAnalysis.endDate,
        projectScope: userAnalysis.precisionProjectScope,
        activityStreamUser: userAnalysis.activityStreamUser,
        activityStreamQueryMode: userAnalysis.activityStreamQueryMode,
        activityStreamRelativeLinks: userAnalysis.activityStreamRelativeLinks,
        activityStreamRunId: `asrun-${Date.now()}-analysis`,
        activityStreamDateQueryMode: userAnalysis.activityStreamDateQueryMode,
        maxResults: userAnalysis.precisionProbeMaxResults,
        maxResultsSource: userAnalysis.precisionProbeMaxResultsSource,
        largeMaxResultsConfirmed: false,
        broadJql: buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate)
      });
      if (!response) throw new Error("Electron Precision Probe API is not available.");
      appendDebugLog("analysis", Array.isArray(response.logs) ? response.logs as string[] : []);
      const summary = response.summary as unknown as UserAnalysisPrecisionProbeSummary;
      const status = String(response.status ?? "failed");
      patchState({
        precisionProbeStatus: status === "success" ? "completed" : status === "partial" ? "partial" : "failed",
        precisionProbeResults: (Array.isArray(response.results) ? response.results : []) as UserAnalysisPrecisionProbeResult[],
        precisionProbeSummary: summary,
        uniquePreciseIssueKeys: (Array.isArray(response.uniquePreciseIssueKeys) ? response.uniquePreciseIssueKeys : []) as string[],
        precisionIssueSources: (response.issueSources ?? {}) as Record<string, string[]>,
        precisionProbeWarnings: (Array.isArray(response.warnings) ? response.warnings : []) as string[],
        precisionProbeErrors: (Array.isArray(response.errors) ? response.errors : []) as string[],
        precisionProbeLastRunAt: new Date().toISOString(),
        notice: `Precision Probe completed: ${summary?.uniquePreciseIssueCount ?? 0} unique precise issue(s). / 精準查詢測試完成。`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Precision Probe failed.";
      patchState({ precisionProbeStatus: "failed", precisionProbeErrors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] ${message}`, "[INFO] No database write performed"]);
    }
  }

  function addPreciseCandidatesToQueue() {
    logAnalysisAction("USER_ACTION", "Button clicked: Add Precise Candidates to Fetch Queue / 加入精準候選到抓取佇列");
    setUserAnalysis((current) => {
      const existingByKey = new Map(current.candidateIssues.map((issue) => [issue.key, issue]));
      for (const key of current.uniquePreciseIssueKeys) {
        const sources = current.precisionIssueSources[key] ?? [];
        const matchedReason = `Precision Probe matched: ${sources.join(", ") || "unknown"}`;
        const existing = existingByKey.get(key);
        existingByKey.set(key, existing ? { ...existing, matchedReason: existing.matchedReason.includes(matchedReason) ? existing.matchedReason : `${existing.matchedReason}; ${matchedReason}` } : {
          id: key,
          key,
          summary: "",
          status: "",
          assignee: "",
          reporter: "",
          creator: "",
          updated: "",
          created: "",
          issueType: "",
          priority: "",
          project: key.split("-")[0] ?? "",
          matchedReason
        });
      }
      return {
        ...current,
        candidateIssues: Array.from(existingByKey.values()),
        selectedForFetch: Array.from(new Set([...current.selectedForFetch, ...current.uniquePreciseIssueKeys])),
        excludedIssues: current.excludedIssues.filter((key) => !current.uniquePreciseIssueKeys.includes(key)),
        notice: `${current.uniquePreciseIssueKeys.length} precise candidate(s) added to Fetch Queue. Full Fetch was not started. / 已加入精準候選，未自動執行完整抓取。`
      };
    });
    appendDebugLog("analysis", ["[INFO] Precise candidates appended to Fetch Queue", "[INFO] Full Fetch not started"]);
  }

  function precisionProbePayload() {
    return {
      exportType: "user-activity-precision-probe",
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
        dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate, endInclusive: true },
        jqlDateRange: currentJqlDateRange,
        projectScope: userAnalysis.precisionProjectScope,
        probeMaxResults: userAnalysis.precisionProbeMaxResults
      },
      summary: userAnalysis.precisionProbeSummary,
      probeResults: userAnalysis.precisionProbeResults,
      uniquePreciseIssueKeys: userAnalysis.uniquePreciseIssueKeys,
      recommendations: [`Recommended Stage 1 Mode: ${userAnalysis.precisionProbeSummary.recommendedStage1Mode}`],
      warnings: userAnalysis.precisionProbeWarnings,
      errors: userAnalysis.precisionProbeErrors,
      debugLogSanitized: getDebugLogs("analysis"),
      debugLogNote: "debugLogSanitized may contain the recent UI debug buffer only. See actionLogDiagnostics.actionLogPath for complete USER_ACTION / GUARD / UI_MODAL timeline.",
      actionLogDiagnostics: {
        actionLogPath: userAnalysis.actionLogPath,
        actionLogAvailable: userAnalysis.actionLogAvailable
      }
    };
  }

  async function savePrecisionProbeResult() {
    logAnalysisAction("USER_ACTION", "Button clicked: Save Precision Probe Result / 儲存精準查詢測試結果");
    if (userAnalysis.precisionProbeResults.length === 0) {
      logAnalysisAction("GUARD", "Action blocked: No Precision Probe result yet / 尚無精準查詢測試結果");
      return;
    }
    patchState({ saving: true, notice: "" });
    try {
      const result = await window.desktopApp?.userAnalysis?.saveExport?.({ category: "user-analysis", defaultFileName: `user-activity-precision-probe-${stamp()}.json`, data: precisionProbePayload() });
      if (!result) throw new Error("Electron export API is not available.");
      if (result.canceled) {
        patchState({ saving: false, notice: "Save canceled." });
        return;
      }
      patchState({ saving: false, lastSavedPrecisionProbePath: result.filePath ?? "", lastSavedExportFolderPath: result.folderPath ?? userAnalysis.lastSavedExportFolderPath, notice: `Saved to: ${result.filePath}`, errors: [] });
      appendDebugLog("analysis", [`[INFO] Precision Probe result saved: ${result.filePath}`, "[INFO] Token: [masked]", "[INFO] Authorization: [masked]"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      patchState({ saving: false, errors: [message], notice: "" });
      appendDebugLog("analysis", [`[ERROR] Save Precision Probe Result failed: ${message}`]);
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
      activeTab: "timeline",
      workflowSteps: { activityTimeline: "not_run", timelineIssueSelection: "not_run", fetchQueue: "empty", fullFetch: "not_run", relatedIssues: "not_run", exports: "not_run" },
      timelineIssueGroups: [],
      selectedTimelineIssueKeys: [],
      timelineIssueFilters: { jiraRelations: ["jira_related"], activityTypes: [], confidences: [], issueKeyRoles: [], sourceApplications: ["jira", "confluence"], projectKeys: [], selectedStates: [], query: "" },
      relatedCandidateIssues: [],
      selectedRelatedIssueKeys: [],
      addedTimelineIssuesToFetchQueueCount: 0,
      addedRelatedIssuesToFetchQueueCount: 0,
      addedRecommendedRelatedIssuesToFetchQueueCount: 0,
      addedOptionalRelatedIssuesToFetchQueueCount: 0,
      lastQueueAddSummary: { kind: "", added: 0, merged: 0, total: 0 },
      advancedToolsOpen: false,
      previousFullFetchOpen: false,
      timelineFilters: { activityTypes: [], sourceApplications: ["jira", "confluence"], jiraRelations: ["jira_related"], confidences: [], issueKeys: [], projectKeys: [], users: [] },
      timelineVisibleColumns: timelineRequiredColumns.map((column) => column.value),
      issueGroupVisibleColumns: issueGroupRequiredColumns.map((column) => column.value),
      expandedTimelineEvents: [],
      expandedTimelineIssueGroups: [],
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
      jiraEvidenceEvents: [],
      jiraEvidenceSummary: null,
      jiraEvidenceExcludedSummary: null,
      jiraEvidenceFiles: null,
      jiraEvidenceFilters: { evidenceTypes: [], activityTypes: [], issueKeys: [], scopes: ["direct"], confidences: [], actors: selectedUsers.length === 1 ? [selectedUsers[0]] : [] },
      expandedJiraEvidence: [],
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
      jiraEvidenceEvents: [],
      jiraEvidenceSummary: null,
      jiraEvidenceExcludedSummary: null,
      jiraEvidenceFiles: null,
      jiraEvidenceFilters: { evidenceTypes: [], activityTypes: [], issueKeys: [], scopes: ["direct"], confidences: [], actors: selectedUsers.length === 1 ? [selectedUsers[0]] : [] },
      expandedJiraEvidence: [],
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
        rawDataMode: userAnalysis.rawDataMode,
        selectedUser: selectedUsers[0] ?? "",
        startDate: userAnalysis.startDate,
        endDate: userAnalysis.endDate,
        directIssueKeys: userAnalysis.selectedTimelineIssueKeys
      });
      if (!response) throw new Error("Electron User Analysis Full Fetch API is not available.");
      const run = (response.run ?? {}) as Record<string, unknown>;
      const diagnostics = (response.diagnostics ?? run.diagnostics ?? {}) as Record<string, unknown>;
      const finalMemory = (diagnostics.finalMemory ?? {}) as UserAnalysisFullFetchMemory;
      const status = String(run.status ?? (response.ok ? "completed" : "failed")) as typeof userAnalysis.fullFetchStatus;
      const relatedCandidateIssues = (Array.isArray(response.relatedCandidateIssues) ? response.relatedCandidateIssues : []) as typeof userAnalysis.relatedCandidateIssues;
      const jiraEvidenceSummary = response.jiraEvidenceSummary as JiraEvidenceSummary | undefined;
      const workflowSteps = {
        ...userAnalysis.workflowSteps,
        fetchQueue: "completed" as const,
        fullFetch: status === "failed" ? "failed" as const : "completed" as const,
        relatedIssues: relatedCandidateIssues.length > 0 ? "completed" as const : "empty" as const
      };
      patchState({
        fullFetchRunId: String(run.runId ?? ""),
        fullFetchStartedAt: String(run.startedAt ?? ""),
        fullFetchFinishedAt: String(run.finishedAt ?? new Date().toISOString()),
        fullFetchStatus: status,
        fullFetchSummary: response.summary as typeof userAnalysis.fullFetchSummary,
        fullFetchReport: (Array.isArray(response.fetchReport) ? response.fetchReport : []) as UserAnalysisFullFetchReportRow[],
        fullFetchResultsByIssue: Array.isArray(response.issueResults) ? response.issueResults : [],
        jiraEvidenceEvents: (Array.isArray(response.jiraEvidenceEvents) ? response.jiraEvidenceEvents : []) as JiraEvidenceEvent[],
        jiraEvidenceSummary: jiraEvidenceSummary ?? null,
        jiraEvidenceExcludedSummary: response.jiraEvidenceExcludedSummary as typeof userAnalysis.jiraEvidenceExcludedSummary,
        jiraEvidenceFiles: response.jiraEvidenceFiles as typeof userAnalysis.jiraEvidenceFiles,
        jiraEvidenceFilters: { evidenceTypes: [], activityTypes: [], issueKeys: [], scopes: ["direct"], confidences: [], actors: jiraEvidenceSummary?.selectedUser ? [jiraEvidenceSummary.selectedUser] : [] },
        expandedJiraEvidence: [],
        relatedCandidateIssues,
        selectedRelatedIssueKeys: [],
        workflowSteps,
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
      void persistWorkflowSnapshot({ steps: workflowSteps, relatedCandidateIssues, sessionEvent: "related_issues_expanded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Full Fetch failed.";
      patchState({
        fullFetchStatus: "failed",
        workflowSteps: { ...userAnalysis.workflowSteps, fullFetch: "failed" },
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
      directJiraEvidence: {
        events: userAnalysis.jiraEvidenceEvents,
        summary: userAnalysis.jiraEvidenceSummary,
        excludedSummary: userAnalysis.jiraEvidenceExcludedSummary,
        files: userAnalysis.jiraEvidenceFiles
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
        Follow the guided workflow from Timeline evidence to Full Fetch and scoped Related Issues.<br />
        依引導式流程，從活動時間線證據逐步完成 Jira 完整抓取與關聯範圍檢視。
      </p>

      {userAnalysis.activeTab === "timeline" ? <SectionCard id="analysis-setup" title="Step 1. Setup & Build Timeline" subtitle="設定並建立活動時間線" className="mb-4">
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><FieldLabel label="Activity Stream Request Window" sub="Activity Stream 請求視窗" /><select data-testid="analysis-request-window" className="field" value={userAnalysis.activityStreamRequestWindow} onChange={(event) => patchState({ activityStreamRequestWindow: event.target.value as typeof userAnalysis.activityStreamRequestWindow })}><option value="1_day">1 Day</option><option value="7_days">7 Days</option><option value="14_days">14 Days</option><option value="calendar_month">1 Calendar Month</option><option value="custom_days">Custom</option></select>{userAnalysis.activityStreamRequestWindow === "custom_days" ? <input data-testid="analysis-custom-window-days" className="field mt-2" type="number" min={1} max={31} value={userAnalysis.activityStreamCustomWindowDays} onChange={(event) => patchState({ activityStreamCustomWindowDays: Math.max(1, Math.min(31, Math.trunc(Number(event.target.value)))) })} /> : null}</div>
          <div><FieldLabel label="Full Scan Round Count" sub="完整掃描輪數（1-32）" /><input data-testid="analysis-full-scan-round-count" className="field" type="number" min={1} max={32} value={userAnalysis.activityStreamFullScanRoundCount} onChange={(event) => patchState({ activityStreamFullScanRoundCount: Math.max(1, Math.min(32, Math.trunc(Number(event.target.value)))) })} /></div>
          <div><FieldLabel label="Delay Between Rounds" sub="輪次間隔" /><select data-testid="analysis-round-delay" className="field" value={userAnalysis.activityStreamDelayBetweenRoundsMs} onChange={(event) => patchState({ activityStreamDelayBetweenRoundsMs: Number(event.target.value) })}>{[0,1000,2000,3000,5000].map((value) => <option key={value} value={value}>{value} ms</option>)}</select></div>
          <div><FieldLabel label="Round Execution Mode" sub="輪次執行模式" /><select data-testid="analysis-round-mode" className="field" value={userAnalysis.activityStreamRoundExecutionMode} onChange={(event) => patchState({ activityStreamRoundExecutionMode: event.target.value as typeof userAnalysis.activityStreamRoundExecutionMode })}><option value="stop_when_stable">Stop When Stable / 穩定後停止</option><option value="force_all_rounds">Force All Rounds / 執行全部輪次</option></select></div>
          <div><FieldLabel label="Merge Strategy" sub="合併策略" /><select data-testid="analysis-merge-strategy" className="field" value={userAnalysis.activityStreamMergeStrategy} onChange={(event) => patchState({ activityStreamMergeStrategy: event.target.value as typeof userAnalysis.activityStreamMergeStrategy })}><option value="union">Union</option><option value="last_stable">Last Stable</option></select></div>
          <div className="flex items-end"><a data-testid="open-stability-probe" className="btn w-full justify-center" href="#/precision-probe?mode=stability">Open Stability Probe / 開啟穩定性測試</a></div>
          <div><FieldLabel label="Selected User" sub="選擇使用者" /><input data-testid="analysis-setup-user" className="field" value={userAnalysis.selectedUsersText} onChange={(event) => patchState({ selectedUsersText: event.target.value.replace(/[\n,;].*$/, "") })} placeholder="roger_hsieh" /></div>
          <div><FieldLabel label="Date Range Start" sub="開始日期" /><input data-testid="analysis-setup-start" className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} /></div>
          <div><FieldLabel label="Date Range End" sub="結束日期" /><input data-testid="analysis-setup-end" className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} /></div>
          <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input data-testid="analysis-setup-project" className="field" value={userAnalysis.precisionProjectScope} onChange={(event) => patchState({ precisionProjectScope: event.target.value })} placeholder="COPGEN1" /></div>
          <div><FieldLabel label="Data Source Mode" sub="資料來源模式" /><div className="field bg-slate-50 font-bold">Live Jira API</div><div className="mt-1 text-xs font-semibold text-muted">Local Database: coming later</div></div>
        </div>
        {!setupReady ? <div data-testid="analysis-setup-blocked" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">Please set Selected User and Date Range before building timeline.<br />請先設定使用者與日期範圍，再建立活動時間線。</div> : <div data-testid="analysis-setup-status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{userAnalysis.timelineStatus === "completed" ? <><span>Timeline is ready. Continue to Step 2: Select Issues.</span><br /><span>活動時間線已完成，可繼續進入 Step 2。</span></> : <><span>Setup is ready. Build Activity Timeline to continue to Step 2.</span><br /><span>設定完成。請建立活動時間線以繼續進入 Step 2。</span></>}</div>}
      </SectionCard> : null}

      {userAnalysis.previousUnfinishedRun && !userAnalysis.previousUnfinishedDismissed && (userAnalysis.activeTab === "queue" || userAnalysis.activeTab === "fetchReport") ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black">Previous Full Fetch may be unfinished / 前次完整抓取可能未完成</div>
              {userAnalysis.previousFullFetchOpen ? <>
              <div className="mt-1 break-words">Last completed: {String(userAnalysis.previousUnfinishedRun.lastCompletedIndex ?? 0)} / {String(userAnalysis.previousUnfinishedRun.total ?? userAnalysis.previousUnfinishedRun.queueCount ?? 0)} · {String(userAnalysis.previousUnfinishedRun.lastCompletedIssueKey ?? "-")}</div>
              <div className="mt-1 break-words">Crash or exit likely occurred near / 可能中斷於：{String(userAnalysis.previousUnfinishedRun.currentIssueKey ?? "-")}</div>
              <div className="mt-1 break-all text-xs" title={String(userAnalysis.previousUnfinishedRun.autoLogPath ?? "")}>{String(userAnalysis.previousUnfinishedRun.autoLogPath ?? "")}</div>
              <div className="mt-1 break-all text-xs" title={String(userAnalysis.previousUnfinishedRun.checkpointPath ?? "")}>{String(userAnalysis.previousUnfinishedRun.checkpointPath ?? "")}</div>
              <div className="mt-2 font-semibold">Automatic resume is not performed. Review the checkpoint before starting a new run. / 系統不會自動續跑，請先檢查 checkpoint。</div>
              </> : <div className="mt-1 text-xs font-semibold">Collapsed by default. Open only when you need checkpoint diagnostics. / 預設收合，需要時再展開檢查。</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="button" onClick={() => patchState({ previousFullFetchOpen: !userAnalysis.previousFullFetchOpen })}>{userAnalysis.previousFullFetchOpen ? "Collapse / 收合" : "Review / 檢視"}</button>
              <button className="btn" type="button" onClick={() => void openDiagnosticsFolder(String(userAnalysis.previousUnfinishedRun?.checkpointPath ?? ""))}><FolderOpen size={15} />Open Diagnostics / 開啟診斷</button>
              <button className="btn" type="button" disabled={!userAnalysis.previousUnfinishedRun.autoLogPath} onClick={() => void copyDiagnosticsPath(String(userAnalysis.previousUnfinishedRun?.autoLogPath ?? ""))}><Copy size={15} />Copy Log Path / 複製 Log 路徑</button>
              <button className="btn" type="button" disabled={!userAnalysis.previousUnfinishedRun.checkpointPath} onClick={() => void copyDiagnosticsPath(String(userAnalysis.previousUnfinishedRun?.checkpointPath ?? ""))}><Copy size={15} />Copy Checkpoint Path / 複製 Checkpoint 路徑</button>
              <button className="btn" type="button" onClick={() => patchState({ previousUnfinishedDismissed: true })}>Dismiss / 關閉</button>
            </div>
          </div>
        </div>
      ) : null}

      <SectionCard className="mb-4">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["timeline", "1", "Setup & Build Timeline", "設定並建立活動時間線"],
            ["selectIssues", "2", "Select Issues", "選擇 Jira"],
            ["queue", "3", "Full Fetch", "完整抓取"],
            ["relatedIssues", "4", "Related Issues", "關聯 Jira"],
            ["exports", "5", "Export", "匯出"]
          ].map(([step, number, title, subtitle]) => {
            const visual = workflowStepState(step);
            const blocked = visual.state === "blocked";
            return <button key={step} data-testid={`workflow-${step}`} data-step-state={visual.state} className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border border-l-4 p-3 text-left transition ${workflowStateStyles[visual.state]} ${blocked ? "cursor-not-allowed" : "hover:shadow-sm"}`} type="button" disabled={blocked} title={visual.reason} aria-current={visual.state === "current" ? "step" : undefined} onClick={() => showStep(step as "timeline" | "selectIssues" | "queue" | "relatedIssues" | "exports")}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black ${visual.state === "current" ? "bg-blue-600 text-white" : visual.state === "completed" ? "bg-emerald-600 text-white" : "bg-white text-slate-600"}`}>{number}</span>
              <span className="min-w-0 flex-1 text-sm font-black leading-snug text-ink"><span>Step {number}: {title}</span><br /><span className="text-xs font-semibold text-muted">{subtitle}</span><span data-step-reason className="mt-2 block text-xs font-semibold leading-snug text-muted">{visual.reason}</span></span>
              <span className="col-start-2 min-w-0"><StatusBadge tone={workflowStateTones[visual.state]}>Status: {visual.state}</StatusBadge></span>
            </button>;
          })}
        </div>
      </SectionCard>

      {(userAnalysis.activeTab === "queue" || userAnalysis.activeTab === "fetchReport") && (userAnalysis.fullFetchStatus === "running" || userAnalysis.fullFetchStatus === "paused" || userAnalysis.autoLogPath) ? (
        <SectionCard id="full-fetch-progress" title="Full Fetch Progress" subtitle="完整抓取進度" className="mb-4">
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
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg bg-blue-50 p-3 text-sm leading-relaxed"><b>1. Setup & Build Timeline</b><br />Set one user and date range, then build and inspect Timeline events.</div>
            <div className="rounded-lg bg-violet-50 p-3 text-sm leading-relaxed"><b>2. Select Issues</b><br />Filter and select issue groups derived from Timeline evidence.</div>
            <div className="rounded-lg bg-emerald-50 p-3 text-sm leading-relaxed"><b>3. Full Fetch</b><br />Fetch selected issues sequentially with read-only Jira GET requests.</div>
            <div className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed"><b>4. Related Issues</b><br />Review recommended and explicitly selected optional relations.</div>
            <div className="rounded-lg bg-slate-100 p-3 text-sm leading-relaxed"><b>5. Export</b><br />Save completed analysis evidence and diagnostics.</div>
          </div>
          <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">
            Stage 1 Candidate Result / 第一階段候選結果:<br />exports/user-analysis/user-analysis-candidates-YYYYMMDD_HHmmss.json<br /><br />
            Stage 1 Candidate Raw Data / 第一階段候選 Raw Data:<br />exports/raw-data/user-analysis-candidates-raw-YYYYMMDD_HHmmss.json<br /><br />
            Stage 2 Full Fetch Result / 第二階段完整抓取結果:<br />exports/user-analysis/user-analysis-full-fetch-YYYYMMDD_HHmmss.json<br /><br />
            Stage 2 Full Fetch Raw Data / 第二階段完整抓取 Raw Data:<br />exports/raw-data/user-analysis-full-fetch-raw-YYYYMMDD_HHmmss.json
          </div>
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-relaxed text-emerald-900">
            <b>Safety / 安全性</b><br />The guided workflow uses read-only Jira GET requests. / 引導流程只使用唯讀 Jira GET 請求。<br />It does not write to Jira or the local database. / 不會寫入 Jira 或本地資料庫。<br />It does not download attachment file bodies. / 不會下載附件本體。<br />Tokens and Authorization values are masked in debug logs and exports. / Debug Log 與匯出檔會遮蔽 token 與 Authorization。
          </div>
        </SectionCard>
      ) : null}

      {false ? <SectionCard title="Advanced Tools" subtitle="進階工具" className="mb-4">
        <div data-step-state="advanced" className={`flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-l-4 p-3 ${workflowStateStyles.advanced}`}>
          <div className="min-w-0 text-sm font-semibold leading-relaxed text-muted">
            <StatusBadge tone={workflowStateTones.advanced}>advanced</StatusBadge><div className="mt-2">Advanced Candidate Search is supplementary evidence and is not part of the guided workflow.<br />
            進階候選搜尋僅提供補充證據，不屬於主要引導流程。
            </div>
          </div>
          <button data-testid="advanced-tools-toggle" className="btn" type="button" aria-expanded={userAnalysis.advancedToolsOpen} onClick={() => patchState({ advancedToolsOpen: !userAnalysis.advancedToolsOpen })}>
            {userAnalysis.advancedToolsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {userAnalysis.advancedToolsOpen ? "Hide Advanced Tools / 收合進階工具" : "Show Advanced Tools / 展開進階工具"}
          </button>
        </div>
      </SectionCard> : null}

      {false ? <>
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-950">
        <span>Advanced Candidate Search uses assignee, reporter, creator, and JQL matches as supplementary evidence. It is not direct activity evidence and does not build the Activity Timeline.<br />進階候選搜尋是補充證據，不代表使用者直接活動，也不會建立活動時間線。</span>
        <button className="btn bg-white" type="button" onClick={() => showStep("timeline")}><Clock3 size={15} />Go to Step 2: Build Timeline / 前往 Step 2：建立活動時間線</button>
      </div>
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
          Advanced Candidate Search uses read-only Jira JQL search. These matches are supplementary evidence, not direct activity evidence. Local Database mode is disabled for User Analysis.
        </div>
      </SectionCard>

      <SectionCard id="candidate-search" title="Advanced Candidate Search" subtitle="進階候選搜尋" className="mb-4">
        {userAnalysis.showHelpTips ? <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">Use this step to search for Jira issues related to selected users and date range.<br />本步驟用來依使用者與日期範圍搜尋可能相關的 Jira。<br /><br /><b>Result / 結果：</b><br />This only creates a candidate issue list. Full comments, attachments, and changelog are not fully fetched yet.<br />這裡只會產生候選 Jira 清單，尚不會完整抓取 comments、attachments、changelog。</div> : null}
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <FieldLabel label="Selected Users" sub="選擇使用者" />
            <textarea
              data-testid="analysis-selected-users"
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
              <input data-testid="analysis-start-date" className="field" type="date" value={userAnalysis.startDate} onChange={(event) => { logAnalysisAction("USER_ACTION", `Date Range changed / 日期範圍變更: startDate=${event.target.value}`); patchState({ startDate: event.target.value }); }} />
            </div>
            <div>
              <FieldLabel label="End Date" sub="結束日期" />
              <input data-testid="analysis-end-date" className="field" type="date" value={userAnalysis.endDate} onChange={(event) => { logAnalysisAction("USER_ACTION", `Date Range changed / 日期範圍變更: endDate=${event.target.value}`); patchState({ endDate: event.target.value }); }} />
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
            <Play size={16} />{userAnalysis.loading ? "Running / 執行中..." : "Run Advanced Candidate Search / 執行進階候選搜尋"}
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
        <button className="btn btn-primary" type="button" onClick={() => showStep("queue")} disabled={userAnalysis.candidateIssues.length === 0}><DatabaseZap size={16} />Go to Step 4: Full Fetch / 前往 Step 4：完整抓取</button>
      </div>
      </> : null}

      {false ? (
        <div data-testid="precision-probe-panel">
          <SectionCard title="User Activity Precision Probe" subtitle="使用者活動精準查詢測試" className="mb-4">
            <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-relaxed text-cyan-950">
              This read-only tool tests lower-cost activity queries without replacing Broad Candidate Discovery. / 此唯讀工具測試較低成本的活動查詢，不會取代既有寬鬆候選搜尋。<br />
              No Jira write, database write, or attachment body download. / 不寫入 Jira、不寫入資料庫，也不下載附件本體。
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div><FieldLabel label="Selected Users" sub="選擇使用者" /><div className="field min-h-11 break-words bg-slate-50">{selectedUsers.join(", ") || "-"}</div></div>
              <div><FieldLabel label="Date Range" sub="日期範圍" /><div className="field min-h-11 bg-slate-50">{userAnalysis.startDate || "-"} ~ {userAnalysis.endDate || "-"}</div></div>
              <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input className="field" value={userAnalysis.precisionProjectScope} placeholder="COPGEN1, FW" onChange={(event) => { logAnalysisAction("USER_ACTION", `Project Scope changed / 專案範圍變更: projectCount=${event.target.value.split(/[\s,;]+/).filter(Boolean).length}`); patchState({ precisionProjectScope: event.target.value }); }} /></div>
              <div><FieldLabel label="Probe Max Results" sub="測試最大筆數" /><select data-testid="precision-max-results" className="field" value={userAnalysis.precisionProbeMaxResults} onChange={(event) => { const value = Number(event.target.value) as 0 | 10 | 20 | 50; logAnalysisAction("USER_ACTION", `Probe Max Results changed: value=${value}`); patchState({ precisionProbeMaxResults: value }); }}>{[0, 10, 20, 50].map((value) => <option key={value} value={value}>{value}{value === 0 ? " - syntax/count only / 僅語法與數量" : ""}</option>)}</select></div>
            </div>
            <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">
              Connection / 連線：{activeConnection?.name || "Not ready / 尚未就緒"} · API {activeConnection?.apiVersion || "-"} · {activeConnection?.authType === "basic" ? "Basic Auth" : "Bearer Token / PAT"}<br />
              Probe Max Results 0 requests one record only when Jira cannot reliably validate with maxResults=0; sample keys remain hidden. / Jira 無法可靠支援 maxResults=0 時會以 1 筆驗證，但不顯示範例 Jira。
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button data-testid="run-precision-probe" className="btn btn-primary" type="button" disabled={userAnalysis.precisionProbeStatus === "running" || !connectionReady} onClick={() => void handleRunPrecisionProbe()}><Play size={16} />{userAnalysis.precisionProbeStatus === "running" ? "Running... / 執行中..." : "Run Precision Probe / 執行精準查詢測試"}</button>
              <button data-testid="save-precision-probe" className="btn" type="button" disabled={userAnalysis.precisionProbeResults.length === 0 || userAnalysis.saving} onClick={() => void savePrecisionProbeResult()}><Download size={16} />Save Precision Probe Result / 儲存精準查詢測試結果</button>
              <button data-testid="add-precision-queue" className="btn" type="button" disabled={userAnalysis.uniquePreciseIssueKeys.length === 0} onClick={addPreciseCandidatesToQueue}><DatabaseZap size={16} />Add Precise Candidates to Fetch Queue / 加入精準候選到抓取佇列</button>
            </div>
            {userAnalysis.notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold leading-relaxed text-green-800">{userAnalysis.notice}</div> : null}
          </SectionCard>

          {userAnalysis.precisionProbeResults.length > 0 ? <>
            <SectionCard title="Precision Probe Summary" subtitle="精準查詢測試摘要" className="mb-4">
              <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                <MiniStat label="updatedBy Supported / 是否支援" value={userAnalysis.precisionProbeSummary.updatedBySupported} />
                <MiniStat label="Activity Stream / 活動串流" value={userAnalysis.precisionProbeSummary.activityStreamSupported} />
                <MiniStat label="CHANGED BY / 欄位歷程" value={userAnalysis.precisionProbeSummary.changedBySupported} />
                <MiniStat label="Broad Baseline / 寬鬆基準" value={userAnalysis.precisionProbeSummary.broadCandidateCount} />
                <MiniStat label="Unique Precise Issues / 精準去重" value={userAnalysis.precisionProbeSummary.uniquePreciseIssueCount} />
                <MiniStat label="Potential Reduction / 預估減少" value={userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent === null ? "N/A" : `${userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent}%`} />
              </div>
              <div data-testid="precision-recommendation" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold leading-relaxed text-emerald-900">
                Recommended Stage 1 Mode / 建議第一階段模式：<span data-no-clip="true">{userAnalysis.precisionProbeSummary.recommendedStage1Mode}</span>
              </div>
            </SectionCard>

            <SectionCard title="Probe Results" subtitle="測試結果" className="mb-4">
              <ResponsiveTableContainer>
                <table className="table min-w-[1280px]" data-testid="precision-results-table">
                  <thead><tr>{["Probe Method / 測試方法", "Status / 狀態", "HTTP Status", "Supported / 支援", "Result Count / 數量", "Sample Issue Keys / 範例 Jira", "Candidate Source / 候選來源", "Error / 錯誤", "Recommendation / 建議"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
                  <tbody>{userAnalysis.precisionProbeResults.map((result) => <tr key={result.candidateSource}>
                    <td className="font-bold">{result.method}</td>
                    <td><StatusBadge>{result.status}</StatusBadge></td>
                    <td>{result.httpStatus}</td>
                    <td>{result.supported}</td>
                    <td data-no-clip="true" className="font-black">{result.resultCount}</td>
                    <td><span className="block max-w-[220px] truncate" title={result.sampleIssueKeys.join(", ")} data-allow-truncate="true">{result.sampleIssueKeys.join(", ") || "-"}</span></td>
                    <td>{result.candidateSource}</td>
                    <td><span className="block max-w-[260px] truncate" title={result.error} data-allow-truncate="true">{result.error || "-"}</span></td>
                    <td><span className="block max-w-[280px] whitespace-normal leading-snug">{result.recommendation}</span></td>
                  </tr>)}</tbody>
                </table>
              </ResponsiveTableContainer>
              {userAnalysis.uniquePreciseIssueKeys.length > 0 ? <div className="mt-3 break-words rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold">Unique Precise Issue Keys / 精準候選 Jira 去重：{userAnalysis.uniquePreciseIssueKeys.join(", ")}</div> : null}
            </SectionCard>
          </> : <SectionCard title="Probe Results" subtitle="測試結果" className="mb-4"><div className="text-sm font-semibold text-muted">Run Precision Probe to test Jira query support. / 執行精準查詢測試以確認 Jira 查詢支援狀態。</div></SectionCard>}

          {[...userAnalysis.precisionProbeErrors.map((item) => ({ kind: "error", item })), ...userAnalysis.precisionProbeWarnings.map((item) => ({ kind: "warning", item }))].map(({ kind, item }) => <div key={`${kind}-${item}`} className={`mb-3 rounded-lg border p-3 text-sm font-bold ${kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{item}</div>)}
          {userAnalysis.lastSavedPrecisionProbePath ? <div className="mb-4 break-all rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800">Saved / 已儲存：{userAnalysis.lastSavedPrecisionProbePath}</div> : null}
        </div>
      ) : null}

      {false ? (
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
        title={userAnalysis.activeTab === "queue" ? "Selected Issues for Full Fetch" : "Full Fetch Report"}
        subtitle={userAnalysis.activeTab === "queue" ? "準備完整抓取的 Jira" : "完整抓取報告"}
      >
        <SetupSummary />
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
            {fetchQueue.length === 0 ? <div data-testid="full-fetch-blocked" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">Select timeline issues and add them to the Fetch Queue first.<br />請先從活動時間線選擇 Jira 並加入抓取佇列。</div> : null}
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900">
              <b>Fetch Queue / 抓取佇列</b><br />Only issues in the Fetch Queue will be processed by Full Fetch. / 只有抓取佇列中的 Jira 會被完整抓取。
            </div>
            <div className="mb-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3" data-testid="fetch-queue-source-summary">
              <MiniStat label="Ready / 準備完成" value={fetchQueue.length} />
              <MiniStat label="Timeline / 時間線" value={queueSourceCounts.activity_timeline ?? 0} />
              <MiniStat label="Recommended / 建議關聯" value={queueSourceCounts.recommended_related_issue ?? 0} />
              <MiniStat label="Optional / 選擇性關聯" value={queueSourceCounts.optional_related_issue ?? 0} />
              <MiniStat label="Advanced / 進階搜尋" value={queueSourceCounts.advanced_candidate_search ?? 0} />
              <MiniStat label="Manual / 手動" value={queueSourceCounts.manual ?? 0} />
            </div>
            {userAnalysis.lastQueueAddSummary.kind ? <div data-testid="queue-add-summary" className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-relaxed text-emerald-950"><div className="min-w-0"><b>{userAnalysis.lastQueueAddSummary.kind === "timeline" ? "Selected issues added to Fetch Queue." : userAnalysis.lastQueueAddSummary.kind === "recommended" ? "Recommended related issues added to Fetch Queue." : "Selected optional related issues added to Fetch Queue."}</b><br />Added: {userAnalysis.lastQueueAddSummary.added} · Merged: {userAnalysis.lastQueueAddSummary.merged} · Total Queue: {userAnalysis.lastQueueAddSummary.total}</div><button className="btn btn-primary" type="button" onClick={() => document.querySelector("[data-testid='run-full-fetch']")?.scrollIntoView({ behavior: "smooth", block: "center" })}>{userAnalysis.lastQueueAddSummary.kind === "timeline" ? "Go to Step 3: Full Fetch / 前往 Step 3：完整抓取" : "Run Related Issues in Step 3: Full Fetch / 在 Step 3 抓取關聯 Jira"}</button></div> : null}
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
              <table className="table min-w-[1540px]">
                <thead>
                  <tr>
                    {["Issue Key / Jira 編號", "Source / 來源", "Matched Reason / 符合原因", "Timeline Events", "Activity Types", "Confidence", "Added At", "Fetch Status / 抓取狀態", "Remove / 移除"].map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {fetchQueue.map((issue) => (
                    <tr key={issue.key}>
                      <td className="font-black text-blue-700">{issue.key}</td>
                      <td>{issue.queueMetadata?.sources.join(", ") || "manual"}</td>
                      <td><span className="block max-w-[300px] truncate" title={issue.matchedReason} data-allow-truncate="true">{issue.matchedReason}</span></td>
                      <td>{issue.queueMetadata?.timelineEventIds.length ?? 0}</td>
                      <td>{issue.queueMetadata?.activityTypes.join(", ") || "-"}</td>
                      <td>{issue.queueMetadata ? `H ${issue.queueMetadata.confidenceSummary.high} / M ${issue.queueMetadata.confidenceSummary.medium} / L ${issue.queueMetadata.confidenceSummary.low}` : "-"}</td>
                      <td className="whitespace-nowrap">{issue.queueMetadata?.addedAt || "-"}</td>
                      <td><StatusBadge>{fetchQueueRuntimeStatus(issue.key)}</StatusBadge></td>
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
            <button data-testid="run-full-fetch" className="btn btn-primary mt-3" type="button" onClick={() => void handleRunFullFetchClick()} disabled={Boolean(fullFetchDisabledReason)} title={fullFetchDisabledReason || "Run a sequential read-only fetch for the current queue"}>
              <Play size={16} />{userAnalysis.fullFetchStatus === "running" ? "Running Full Fetch / 完整抓取中..." : hasFullFetchResult ? "Re-run Full Fetch from Queue / 依佇列重新完整抓取" : "Run Full Fetch from Queue / 依佇列執行完整抓取"}
            </button>
            {fullFetchDisabledReason ? <div className="mt-2 text-sm font-bold text-amber-800">Disabled reason / 無法執行原因：{fullFetchDisabledReason}</div> : null}
            {hasFullFetchResult ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><span>Full Fetch completed. Review the Step 3 report.<br />完整抓取已完成，請檢視 Step 3 報告。</span><button className="btn" type="button" onClick={() => showStep("fetchReport")}>Go to Step 3: Full Fetch Report / 前往 Step 3：完整抓取報告</button></div> : null}
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
            <div data-testid="full-fetch-failed-issues" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-red-950">Failed Issues / 失敗 Jira</h3><StatusBadge tone={failedFullFetchIssues.length ? "red" : "green"}>{failedFullFetchIssues.length}</StatusBadge></div>
              {failedFullFetchIssues.length ? <ResponsiveTableContainer className="mt-3"><table className="data-table min-w-[1120px]"><thead><tr><th>Issue Key</th><th>HTTP Status / Error Code</th><th>Stage</th><th>Source</th><th>Matched Reason</th><th>Message</th><th>Retry Count</th></tr></thead><tbody>{failedFullFetchIssues.map((row) => <tr key={`failed-${row.issueKey}`}><td className="font-black text-red-700">{row.issueKey}</td><td>{row.httpStatus || "-"} / {row.errorCode || "UNKNOWN_ERROR"}</td><td>{row.stage || "issue_full_fetch"}</td><td>{row.source || "manual"}</td><td>{row.matchedReason || "-"}</td><td className="max-w-[360px] break-words">{row.error || "-"}</td><td>{row.retryCount ?? 0}</td></tr>)}</tbody></table></ResponsiveTableContainer> : <div className="mt-2 text-sm font-semibold text-emerald-800">No failed issues in the current Full Fetch report. / 本次完整抓取沒有失敗 Jira。</div>}
            </div>
            <div data-testid="jira-evidence-review" className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="font-black text-blue-950">Direct Jira Evidence / 直接 Jira 證據</h3><p className="mt-1 text-sm font-semibold leading-relaxed text-blue-900">Evidence is extracted from direct Activity Timeline issues and filtered by selected user and date range. Related issues remain context only.<br />證據僅從直接活動 Jira 抽取並依使用者與日期範圍篩選；關聯 Jira 只保留為 context。</p></div>
                <StatusBadge tone={userAnalysis.jiraEvidenceSummary ? "green" : "gray"}>{userAnalysis.jiraEvidenceSummary ? "Extracted" : "Not available"}</StatusBadge>
              </div>
              <div data-testid="jira-evidence-summary" className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                <MiniStat label="Direct Evidence / 直接證據" value={userAnalysis.jiraEvidenceSummary?.directEvidenceCount ?? 0} />
                <MiniStat label="Context Evidence / 情境證據" value={userAnalysis.jiraEvidenceSummary?.contextEvidenceCount ?? 0} />
                <MiniStat label="Issues with Evidence / 有證據 Jira" value={userAnalysis.jiraEvidenceSummary?.coverage.issuesWithEvidence ?? 0} />
                <MiniStat label="Without Direct Evidence / 無直接證據" value={userAnalysis.jiraEvidenceSummary?.coverage.issuesWithoutDirectEvidence ?? 0} />
                <MiniStat label="Failed Issues / 失敗 Jira" value={userAnalysis.jiraEvidenceSummary?.failedIssueCount ?? failedFullFetchIssues.length} />
              </div>
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MultiSelectFilter testId="evidence-filter-types" label="Evidence Type / 證據類型" options={jiraEvidenceFilterOptions.evidenceTypes.map((value) => ({ value, label: value }))} selected={userAnalysis.jiraEvidenceFilters.evidenceTypes} onToggle={(value) => toggleJiraEvidenceFilter("evidenceTypes", value)} onClear={() => patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, evidenceTypes: [] } })} />
                <MultiSelectFilter testId="evidence-filter-activity-types" label="Activity Type / 活動類型" options={jiraEvidenceFilterOptions.activityTypes.map((value) => ({ value, label: value }))} selected={userAnalysis.jiraEvidenceFilters.activityTypes} onToggle={(value) => toggleJiraEvidenceFilter("activityTypes", value)} onClear={() => patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, activityTypes: [] } })} />
                <MultiSelectFilter testId="evidence-filter-issue-keys" label="Issue Key / Jira 編號" options={jiraEvidenceFilterOptions.issueKeys.map((value) => ({ value, label: value }))} selected={userAnalysis.jiraEvidenceFilters.issueKeys} onToggle={(value) => toggleJiraEvidenceFilter("issueKeys", value)} onClear={() => patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, issueKeys: [] } })} />
                <MultiSelectFilter testId="evidence-filter-scopes" label="Scope / 證據範圍" options={jiraEvidenceFilterOptions.scopes.map((value) => ({ value, label: value }))} selected={userAnalysis.jiraEvidenceFilters.scopes} onToggle={(value) => toggleJiraEvidenceFilter("scopes", value)} onClear={() => patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, scopes: [] } })} />
                <MultiSelectFilter testId="evidence-filter-confidences" label="Confidence / 信心" options={jiraEvidenceFilterOptions.confidences.map((value) => ({ value, label: value }))} selected={userAnalysis.jiraEvidenceFilters.confidences} onToggle={(value) => toggleJiraEvidenceFilter("confidences", value)} onClear={() => patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, confidences: [] } })} />
                <MultiSelectFilter testId="evidence-filter-actors" label="Actor / 操作者" options={jiraEvidenceFilterOptions.actors.map((value) => ({ value, label: value }))} selected={userAnalysis.jiraEvidenceFilters.actors} onToggle={(value) => toggleJiraEvidenceFilter("actors", value)} onClear={() => patchState({ jiraEvidenceFilters: { ...userAnalysis.jiraEvidenceFilters, actors: [] } })} />
              </div>
              <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 text-sm font-semibold text-muted"><span data-testid="jira-evidence-filter-summary">Showing {filteredJiraEvidence.length} of {userAnalysis.jiraEvidenceEvents.length} evidence events. Values within a filter use OR; filter groups use AND.</span><div className="flex flex-wrap gap-2"><button data-testid="clear-all-evidence-filters" className="btn" type="button" onClick={() => patchState({ jiraEvidenceFilters: { evidenceTypes: [], activityTypes: [], issueKeys: [], scopes: [], confidences: [], actors: [] } })}>Clear all / 清除全部</button><button data-testid="reset-evidence-filters" className="btn" type="button" onClick={() => patchState({ jiraEvidenceFilters: { evidenceTypes: [], activityTypes: [], issueKeys: [], scopes: ["direct"], confidences: [], actors: userAnalysis.jiraEvidenceSummary?.selectedUser ? [userAnalysis.jiraEvidenceSummary.selectedUser] : [] } })}>Reset direct evidence / 重設直接證據</button></div></div>
              <ResponsiveTableContainer className="mt-4" data-testid="jira-evidence-table"><table className="data-table min-w-[1320px]"><thead><tr><th>Time</th><th>Issue Key</th><th>Evidence Type</th><th>Activity Type</th><th>Actor</th><th>Summary</th><th>Confidence</th><th>Scope</th><th>Details</th></tr></thead><tbody>{filteredJiraEvidence.map((item) => <Fragment key={item.evidenceId}><tr><td className="whitespace-nowrap">{item.eventTime || "-"}</td><td className="font-black text-blue-700">{item.issueKey}</td><td>{item.evidenceType}</td><td>{item.activityType}</td><td>{item.actor || "-"}</td><td className="max-w-[300px]"><span className="block truncate" title={item.title} data-allow-truncate="true">{item.title}</span></td><td><StatusBadge tone={item.confidence === "high" ? "green" : item.confidence === "low" ? "red" : "amber"}>{item.confidence}</StatusBadge></td><td><StatusBadge tone={item.evidenceScope === "direct" ? "blue" : "gray"}>{item.evidenceScope}</StatusBadge></td><td><button className="btn px-3 py-2" type="button" onClick={() => toggleJiraEvidenceDetail(item.evidenceId)}>{userAnalysis.expandedJiraEvidence.includes(item.evidenceId) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}Details</button></td></tr>{userAnalysis.expandedJiraEvidence.includes(item.evidenceId) ? <tr><td colSpan={9} className="whitespace-normal bg-slate-50"><div className="grid min-w-0 grid-cols-1 gap-2 p-3 text-xs leading-relaxed md:grid-cols-2"><div><b>Field:</b> {item.field || "-"}</div><div><b>From / To:</b> {item.fromValue || "-"} → {item.toValue || "-"}</div><div><b>Source:</b> {item.source} / {item.sourceLayer}</div><div><b>Related Timeline Events:</b> {item.relatedToTimelineEventIds.length}</div><div className="md:col-span-2"><b>Content Summary:</b> <span className="break-words">{item.contentSummary || "-"}</span></div><div className="md:col-span-2"><b>Extraction Reason:</b> {item.extractionReason}</div><div className="md:col-span-2"><b>Evidence ID:</b> <span className="break-all">{item.evidenceId}</span></div><div className="md:col-span-2"><b>Raw Ref:</b> <span className="break-all">{JSON.stringify(item.rawRef)}</span></div></div></td></tr> : null}</Fragment>)}{filteredJiraEvidence.length === 0 ? <tr><td colSpan={9} className="text-center text-muted">No evidence matches the current filters. Run Full Fetch for selected direct issues first. / 目前沒有符合篩選的證據，請先完整抓取直接活動 Jira。</td></tr> : null}</tbody></table></ResponsiveTableContainer>
              {userAnalysis.jiraEvidenceFiles ? <div data-testid="jira-evidence-files" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-relaxed text-emerald-900"><b>Evidence files / 證據檔案</b><br />{Object.values(userAnalysis.jiraEvidenceFiles).map((filePath) => <div key={filePath} className="break-all">{filePath}</div>)}</div> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-muted">Showing / 顯示 {pagedFetchReport.length} of / 共 {filteredFetchReport.length} fetch report rows / 筆抓取報告。</div>
              <div className="flex gap-2">
                <button className="btn px-3 py-2" type="button" disabled={fetchReportPage <= 1} onClick={() => { logAnalysisAction("USER_ACTION", `Page changed / 分頁變更: page=${fetchReportPage - 1}`); patchState({ fetchReportPage: fetchReportPage - 1 }); }}>Prev / 上一頁</button>
                <button className="btn px-3 py-2" type="button" disabled={fetchReportPage >= fetchReportPageCount} onClick={() => { logAnalysisAction("USER_ACTION", `Page changed / 分頁變更: page=${fetchReportPage + 1}`); patchState({ fetchReportPage: fetchReportPage + 1 }); }}>Next / 下一頁</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold text-muted"><span>This will replace the current Full Fetch session result.<br />這會取代目前的完整抓取工作階段結果。</span><button className="btn" type="button" onClick={() => void handleRunFullFetchClick()} disabled={Boolean(fullFetchDisabledReason)} title={fullFetchDisabledReason}><Play size={15} />Re-run Full Fetch from Queue / 依佇列重新完整抓取</button></div>
            {hasFullFetchResult ? <div data-testid="full-fetch-next-action" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950"><div className="min-w-0"><b>Full Fetch completed. Go to Step 4: Related Issues. / 完整抓取完成，前往 Step 4：關聯 Jira。</b><br />Success: {userAnalysis.fullFetchSummary.success} · Failed: {userAnalysis.fullFetchSummary.failed} · Related Issues Discovered: {userAnalysis.relatedCandidateIssues.length} · Recommended: {recommendedRelatedIssues.length} · Optional: {userAnalysis.relatedCandidateIssues.length - recommendedRelatedIssues.length}</div><button className="btn btn-primary" type="button" onClick={() => showStep("relatedIssues")}>Next → Step 4: Related Issues / 下一步 → Step 4：關聯 Jira</button></div> : null}
          </>
        )}
      </SectionCard> : null}

      {userAnalysis.activeTab === "selectIssues" ? <SectionCard title="Issue Groups from Timeline" subtitle="來自活動時間線的 Jira 群組">
        <SetupSummary />
        {userAnalysis.timelineStatus !== "completed" ? <div data-testid="select-issues-blocked" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">Build Activity Timeline first.<br />請先建立活動時間線。</div> : null}
        <div data-testid="jira-default-filter-note" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Default view: Jira-related activities.<br />預設顯示 Jira 相關活動。<div className="mt-1 text-xs font-semibold">Includes Jira events and Confluence events that reference Jira issues.<br />包含 Jira 事件，以及有引用 Jira issue 的 Confluence 事件。</div></div>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-3"><FieldLabel label="Issue Key" sub="文字搜尋" /><input data-testid="timeline-issue-query" className="field" value={userAnalysis.timelineIssueFilters.query} onChange={(event) => patchState({ timelineIssueFilters: { ...userAnalysis.timelineIssueFilters, query: event.target.value } })} placeholder="COPGEN1-125806" /></div>
          <MultiSelectFilter testId="filter-jira-relation" label="Jira Relation / Jira 關聯性" options={[{ value: "jira_related", label: "Jira-related only" }, { value: "has_jira_issue_key", label: "Has Jira Issue Key" }, { value: "non_jira", label: "Non-Jira only" }, { value: "unknown_relation", label: "Unknown relation" }]} selected={userAnalysis.timelineIssueFilters.jiraRelations} onToggle={(value) => toggleTimelineIssueFilter("jiraRelations", value)} onClear={() => clearTimelineIssueFilter("jiraRelations")} />
          <MultiSelectFilter testId="filter-activity-type" label="Activity Type / 活動類型" options={timelineIssueFilterOptions.activityTypes.map((value) => ({ value, label: value }))} selected={userAnalysis.timelineIssueFilters.activityTypes} onToggle={(value) => toggleTimelineIssueFilter("activityTypes", value)} onClear={() => clearTimelineIssueFilter("activityTypes")} />
          <MultiSelectFilter testId="filter-confidence" label="Confidence / 信心等級" options={["high", "medium", "low"].map((value) => ({ value, label: value }))} selected={userAnalysis.timelineIssueFilters.confidences} onToggle={(value) => toggleTimelineIssueFilter("confidences", value)} onClear={() => clearTimelineIssueFilter("confidences")} />
          <MultiSelectFilter testId="filter-role" label="Issue Key Role / 議題角色" options={["primary", "secondary", "primary_and_secondary"].map((value) => ({ value, label: value }))} selected={userAnalysis.timelineIssueFilters.issueKeyRoles} onToggle={(value) => toggleTimelineIssueFilter("issueKeyRoles", value)} onClear={() => clearTimelineIssueFilter("issueKeyRoles")} />
          <MultiSelectFilter testId="filter-source-application" label="Source Application / 來源應用" options={["jira", "confluence", "other", "unknown"].map((value) => ({ value, label: value }))} selected={userAnalysis.timelineIssueFilters.sourceApplications} onToggle={(value) => toggleTimelineIssueFilter("sourceApplications", value)} onClear={() => clearTimelineIssueFilter("sourceApplications")} />
          <MultiSelectFilter testId="filter-project-key" label="Project Key / 專案" options={timelineIssueFilterOptions.projectKeys.map((value) => ({ value, label: value }))} selected={userAnalysis.timelineIssueFilters.projectKeys} onToggle={(value) => toggleTimelineIssueFilter("projectKeys", value)} onClear={() => clearTimelineIssueFilter("projectKeys")} />
          <MultiSelectFilter testId="filter-selected-state" label="Selected State / 選取狀態" options={[{ value: "selected", label: "Selected" }, { value: "unselected", label: "Unselected" }]} selected={userAnalysis.timelineIssueFilters.selectedStates} onToggle={(value) => toggleTimelineIssueFilter("selectedStates", value)} onClear={() => clearTimelineIssueFilter("selectedStates")} />
        </div>
        <div data-testid="timeline-issue-filter-summary" className="mt-3 rounded-lg border border-line bg-white p-3 text-sm font-semibold text-muted">Showing {filteredTimelineIssueGroups.length} of {userAnalysis.timelineIssueGroups.length} issue groups<br />Filtered by: {activeTimelineIssueFilters.join(" AND ") || "None"}</div>
        <div className="mt-3 flex flex-wrap gap-2"><button data-testid="select-all-visible" className="btn" type="button" onClick={() => selectTimelineIssues("filtered")}>Select all visible / 全選目前結果</button><button className="btn" type="button" onClick={() => selectTimelineIssues("high")}>Select visible High Confidence / 選取高信心</button><button className="btn" type="button" onClick={() => selectTimelineIssues("clear")}>Clear issue selection / 清除 Jira 選取</button><button data-testid="clear-all-issue-filters" className="btn" type="button" onClick={() => patchState({ timelineIssueFilters: { jiraRelations: [], activityTypes: [], confidences: [], issueKeyRoles: [], sourceApplications: [], projectKeys: [], selectedStates: [], query: "" } })}>Clear all filters / 清除全部篩選</button><button data-testid="reset-issue-filters" className="btn" type="button" onClick={() => patchState({ timelineIssueFilters: { jiraRelations: ["jira_related"], activityTypes: [], confidences: [], issueKeyRoles: [], sourceApplications: ["jira", "confluence"], projectKeys: userAnalysis.precisionProjectScope ? [userAnalysis.precisionProjectScope.toUpperCase()] : [], selectedStates: [], query: "" } })}>Reset Jira-related View / 重設 Jira 關聯檢視</button><button data-testid="issue-group-column-settings-toggle" className="btn" type="button" onClick={() => patchState({ issueGroupColumnSettingsOpen: !userAnalysis.issueGroupColumnSettingsOpen })}><Columns3 size={16} />Column Settings / 欄位設定</button></div>
        {userAnalysis.issueGroupColumnSettingsOpen ? <ColumnSettings testId="issue-group-column-settings" required={issueGroupRequiredColumns} optional={issueGroupOptionalColumns} visible={userAnalysis.issueGroupVisibleColumns} onToggle={(value) => toggleVisibleColumn("issueGroup", value)} /> : null}
        <ResponsiveTableContainer className="mt-4"><table className="data-table min-w-[1050px]" data-testid="timeline-issue-groups-table"><thead><tr>{issueGroupRequiredColumns.map((column) => <th key={column.value}>{column.label}</th>)}{issueGroupOptionalColumns.filter((column) => userAnalysis.issueGroupVisibleColumns.includes(column.value)).map((column) => <th key={column.value}>{column.label}</th>)}<th>Details</th></tr></thead><tbody>{filteredTimelineIssueGroups.map((group) => <Fragment key={group.issueKey}><tr><td><input type="checkbox" checked={userAnalysis.selectedTimelineIssueKeys.includes(group.issueKey)} onChange={(event) => toggleTimelineIssue(group.issueKey, event.target.checked)} /></td><td className="font-black text-blue-700">{group.issueKey}</td><td>{sourceSystemLabel(group.jiraRelationSummary.sourceApplicationCounts)}</td><td>{group.eventCount}</td><td className="whitespace-nowrap">{group.firstSeen || "-"}</td><td className="whitespace-nowrap">{group.lastSeen || "-"}</td>
          {userAnalysis.issueGroupVisibleColumns.includes("activityTypes") ? <td>{group.activityTypes.join(", ")}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("confidence") ? <td>H {group.confidenceSummary.high} / M {group.confidenceSummary.medium} / L {group.confidenceSummary.low}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("issueKeyRole") ? <td>{group.issueKeyRole}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("projectKey") ? <td>{group.projectKey}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("jiraRelation") ? <td><StatusBadge tone={group.isJiraRelated ? "green" : "amber"}>{group.isJiraRelated ? "Jira-related" : "Non-Jira"}</StatusBadge></td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("relatedSystems") ? <td>{Object.keys(group.jiraRelationSummary.relatedSystemsCounts).join(", ") || "-"}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("sourceDetails") ? <td>{Object.entries(group.sourceDetails).map(([key, count]) => `${key} ${count}`).join(", ")}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("timelineEventIds") ? <td className="max-w-[200px] truncate" title={group.timelineEventIds.join(", ")}>{group.timelineEventIds.join(", ")}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("allIssueKeys") ? <td>{group.issueKey}</td> : null}
          {userAnalysis.issueGroupVisibleColumns.includes("matchedReasons") ? <td>{Object.keys(group.jiraRelationSummary.jiraRelationReasons).join(", ")}</td> : null}
          <td><button className="btn px-3 py-2" type="button" onClick={() => toggleIssueGroupDetail(group.issueKey)}>{userAnalysis.expandedTimelineIssueGroups.includes(group.issueKey) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}Details</button></td></tr>
          {userAnalysis.expandedTimelineIssueGroups.includes(group.issueKey) ? <tr><td colSpan={userAnalysis.issueGroupVisibleColumns.length + 1}><div className="grid min-w-0 grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed md:grid-cols-2"><div><b>Activity Types count:</b> {group.activityTypes.join(", ")}</div><div><b>Source Applications count:</b> {sourceSystemLabel(group.jiraRelationSummary.sourceApplicationCounts)}</div><div><b>Source Details count:</b> {JSON.stringify(group.sourceDetails)}</div><div><b>Confidence Summary:</b> H {group.confidenceSummary.high} / M {group.confidenceSummary.medium} / L {group.confidenceSummary.low}</div><div><b>Issue Key Role:</b> {group.issueKeyRole}</div><div><b>Project Key:</b> {group.projectKey}</div><div><b>Related Systems:</b> {JSON.stringify(group.jiraRelationSummary.relatedSystemsCounts)}</div><div><b>All Issue Keys:</b> {group.issueKey}</div><div className="md:col-span-2"><b>Timeline Event IDs:</b> <span className="break-all">{group.timelineEventIds.join(", ")}</span></div><div className="md:col-span-2"><b>Matched Reasons:</b> {JSON.stringify(group.jiraRelationSummary.jiraRelationReasons)}</div></div></td></tr> : null}</Fragment>)}</tbody></table></ResponsiveTableContainer>
        {userAnalysis.timelineIssueGroups.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm font-semibold text-muted">Build Timeline first to create issue groups.</div> : null}
        <button className="btn btn-primary mt-4" type="button" disabled={userAnalysis.selectedTimelineIssueKeys.length === 0} onClick={addTimelineIssuesToQueue}>Add Selected Issues, then go to Step 3: Full Fetch / 加入選取 Jira，然後前往 Step 3：完整抓取</button>
      </SectionCard> : null}

      {userAnalysis.activeTab === "relatedIssues" ? <SectionCard title="Review Related Issues" subtitle="檢視關聯 Jira 範圍">
        <SetupSummary />
        {!hasFullFetchResult ? <div data-testid="related-issues-blocked" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">Run Full Fetch first to discover related issues.<br />請先執行完整抓取以探索關聯 Jira。</div> : null}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-950">Related candidates are derived from read-only Full Fetch metadata. Recommended hierarchy relations are separated from optional links and mentions. No Jira write, database write, or attachment download is performed.</div>

        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="recommended-related-issues">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-black text-emerald-950">Recommended Related Issues / 建議加入</h3><p className="mt-1 text-sm font-semibold leading-relaxed text-emerald-900">These are parent / epic / hierarchy related issues and are recommended for follow-up Full Fetch.<br />這些是 parent / epic / hierarchy 關聯 Jira，建議後續完整抓取。</p></div><button data-testid="add-recommended-related" className="btn btn-primary" type="button" disabled={recommendedRelatedIssues.length === 0} onClick={() => addRelatedIssuesToQueue("recommended")}>Add Recommended Related Issues, then go to Step 3: Full Fetch / 加入建議關聯 Jira，然後前往 Step 3：完整抓取</button></div>
          <ResponsiveTableContainer className="mt-3"><table className="data-table min-w-[860px]"><thead><tr><th>Issue Key</th><th>Relation</th><th>From Issue</th><th>Field</th><th>Confidence</th><th>Evidence</th><th>Reason</th></tr></thead><tbody>{recommendedRelatedIssues.map((item) => <tr key={`${item.issueKey}-${item.relationType}-${item.discoveredFromIssueKey}`}><td className="font-black text-blue-700">{item.issueKey}</td><td>{item.relationType}</td><td>{item.discoveredFromIssueKey}</td><td>{item.field}</td><td>{item.confidence}</td><td>{item.evidenceCount}</td><td>{item.reason}</td></tr>)}{recommendedRelatedIssues.length === 0 ? <tr><td colSpan={7} className="text-center text-muted">No recommended hierarchy issues found.</td></tr> : null}</tbody></table></ResponsiveTableContainer>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="optional-related-issues">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-black text-amber-950">Optional Related Issues / 選填參考</h3><p className="mt-1 text-sm font-semibold leading-relaxed text-amber-900">These are linked, mentioned, or remote issues. Review before adding to Fetch Queue.<br />這些是連結、提及或遠端關聯 Jira，請檢查後再加入抓取佇列。</p></div><button className="btn" type="button" disabled={userAnalysis.selectedRelatedIssueKeys.length === 0} onClick={() => patchState({ selectedRelatedIssueKeys: [] })}>Clear Selection / 清除選取</button></div>
          <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2"><div><FieldLabel label="Relation Type" sub="關聯類型" /><select className="field" value={userAnalysis.relatedIssueFilters.relationType} onChange={(event) => patchState({ relatedIssueFilters: { ...userAnalysis.relatedIssueFilters, relationType: event.target.value } })}><option value="all">All</option>{Array.from(new Set(userAnalysis.relatedCandidateIssues.filter((item) => item.scope === "optional").map((item) => item.relationType))).map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div><FieldLabel label="Confidence" sub="信心等級" /><select className="field" value={userAnalysis.relatedIssueFilters.confidence} onChange={(event) => patchState({ relatedIssueFilters: { ...userAnalysis.relatedIssueFilters, confidence: event.target.value } })}><option value="all">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div></div>
          <ResponsiveTableContainer className="mt-3"><table className="data-table min-w-[980px]"><thead><tr><th>Selected</th><th>Issue Key</th><th>Relation</th><th>From Issue</th><th>Field</th><th>Confidence</th><th>Evidence</th><th>Reason</th></tr></thead><tbody>{optionalRelatedIssues.map((item) => <tr key={`${item.issueKey}-${item.relationType}-${item.discoveredFromIssueKey}`}><td><input type="checkbox" checked={userAnalysis.selectedRelatedIssueKeys.includes(item.issueKey)} onChange={(event) => { const selected = new Set(userAnalysis.selectedRelatedIssueKeys); if (event.target.checked) selected.add(item.issueKey); else selected.delete(item.issueKey); patchState({ selectedRelatedIssueKeys: Array.from(selected) }); }} /></td><td className="font-black text-blue-700">{item.issueKey}</td><td>{item.relationType}</td><td>{item.discoveredFromIssueKey}</td><td>{item.field}</td><td>{item.confidence}</td><td>{item.evidenceCount}</td><td>{item.reason}</td></tr>)}{optionalRelatedIssues.length === 0 ? <tr><td colSpan={8} className="text-center text-muted">No optional related issues match the current filters.</td></tr> : null}</tbody></table></ResponsiveTableContainer>
          <button data-testid="add-optional-related" className="btn btn-primary mt-4" type="button" disabled={userAnalysis.selectedRelatedIssueKeys.length === 0} onClick={() => addRelatedIssuesToQueue("optional")}>Add Selected Optional Issues, then go to Step 3: Full Fetch / 加入選填 Jira，然後前往 Step 3：完整抓取</button>
        </div>
        {hasFullFetchResult && userAnalysis.relatedCandidateIssues.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm font-semibold text-muted">No related issues were found in the Full Fetch result.</div> : null}
        <div className="mt-4 flex justify-end"><button data-testid="related-to-export" className="btn btn-primary" type="button" disabled={!exportReady} onClick={() => showStep("exports")}>Go to Step 5: Export / 前往 Step 5：匯出</button></div>
      </SectionCard> : null}

      {userAnalysis.activeTab === "timeline" ? <div className="space-y-4" data-testid="activity-timeline-panel">
        {userAnalysis.errors.length > 0 ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold leading-relaxed text-red-800" role="alert">{userAnalysis.errors.map((error) => <div key={error}>{error}</div>)}</div> : null}
        <SetupSummary />
        <SectionCard title="Activity Timeline" subtitle="活動時間線">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 text-sm font-semibold leading-relaxed text-muted">
              Uses the selected user, date range, standard Activity Stream flow, classifier, and Baseline Guard.<br />
              使用目前選定使用者、日期範圍、標準 Activity Stream 流程、分類器與 Baseline Guard。
            </div>
            <div className="flex flex-wrap gap-2"><button data-testid="build-activity-timeline" className="btn btn-primary" type="button" disabled={!setupReady || userAnalysis.timelineStatus === "running"} title={!setupReady ? "Please set Selected User and Date Range before building timeline." : undefined} onClick={() => void handleBuildTimeline()}>
              <Clock3 size={16} />{userAnalysis.timelineStatus === "running" ? "Building... / 建立中..." : "Build Activity Timeline / 建立活動時間線"}
            </button>{userAnalysis.timelineStatus === "running" ? <button data-testid="cancel-activity-timeline" className="btn" type="button" onClick={() => void window.desktopApp?.userAnalysis?.cancelActivityTimeline?.()}><PauseCircle size={16} />Cancel / 取消</button> : null}</div>
          </div>
          {userAnalysis.timelineStatus === "running" || Object.keys(timelineRoundProgress).length > 1 ? <div data-testid="timeline-round-progress" className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3"><MiniStat label="Current Round / Total Rounds / 目前輪次" value={`${String(timelineRoundProgress.currentRound ?? 0)} / ${String(timelineRoundProgress.totalRounds ?? userAnalysis.activityStreamFullScanRoundCount)}`} /><MiniStat label="Current Window / Total Windows / 目前視窗" value={`${String(timelineRoundProgress.currentWindow ?? 0)} / ${String(timelineRoundProgress.totalWindows ?? 0)}`} /><MiniStat label="Completed Requests / Total Requests / 已完成請求" value={`${String(timelineRoundProgress.completedRequests ?? 0)} / ${String(timelineRoundProgress.totalRequests ?? 0)}`} /><MiniStat label="Current Date Window / 目前日期視窗" value={`${String(timelineRoundProgress.requestWindowStart ?? "-")} ~ ${String(timelineRoundProgress.requestWindowEnd ?? "-")}`} /><MiniStat label="Current API Duration / 目前 API 耗時" value={`${String(timelineRoundProgress.currentApiDurationMs ?? 0)} ms`} /><MiniStat label="Average API Duration / 平均 API 耗時" value={`${String(timelineRoundProgress.averageApiDurationMs ?? 0)} ms`} /><MiniStat label="Average Processing Duration / 平均處理耗時" value={`${String(timelineRoundProgress.averageProcessingDurationMs ?? 0)} ms`} /><MiniStat label="Elapsed Time / 已用時間" value={`${String(timelineRoundProgress.elapsedMs ?? 0)} ms`} /><MiniStat label="Estimated Remaining Time / 預估剩餘時間" value={`${String(timelineRoundProgress.estimatedRemainingMs ?? 0)} ms`} /><MiniStat label="Estimated Completion Time / 預估完成時間" value={String(timelineRoundProgress.estimatedCompletionTime ?? "-")} /><MiniStat label="Current Stability / 目前穩定度" value={String(timelineRoundProgress.currentStability ?? timelineRoundProgress.stage ?? "-")} /></div> : null}
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Events / 事件" value={userAnalysis.timelineSummary?.totalEvents ?? 0} />
            <MiniStat label="Issue Keys" value={userAnalysis.timelineSummary?.issueKeyCount ?? 0} />
            <MiniStat label="Baseline" value={userAnalysis.timelineSummary?.baselineGuard.classification ?? "Not built"} />
            <MiniStat label="Source" value="Activity Stream" />
          </div>
          {userAnalysis.timelineStatus === "completed" ? <div data-testid="timeline-next-action" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"><div className="font-black">Timeline built successfully. / 活動時間線已成功建立。</div><div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5"><span>Events: {userAnalysis.timelineSummary?.totalEvents ?? 0}</span><span>Issue Groups: {userAnalysis.timelineIssueGroups.length}</span><span>High: {userAnalysis.timelineSummary?.confidenceCounts.high ?? 0}</span><span>Medium: {userAnalysis.timelineSummary?.confidenceCounts.medium ?? 0}</span><span>Low: {userAnalysis.timelineSummary?.confidenceCounts.low ?? 0}</span></div><button className="btn btn-primary mt-3" type="button" onClick={() => showStep("selectIssues")}>Next → Step 2: Select Issues / 下一步 → Step 2：選擇 Jira</button></div> : null}
          {userAnalysis.timelineSummary && userAnalysis.timelineSummary.integrity.sourceParsedActivityCount !== userAnalysis.timelineSummary.integrity.timelineEventCount ? <div data-testid="timeline-integrity-count-warning" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-relaxed text-amber-950">Timeline count differs from source parsed activities. See integrity diagnostics.<br />時間線筆數與來源 parsed activities 不一致，請查看完整性診斷。</div> : null}
          {userAnalysis.timelineSummary && userAnalysis.timelineSummary.integrity.missingIssueKeysFromTimeline.length > 0 ? <div data-testid="timeline-integrity-missing-warning" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold leading-relaxed text-red-900">Some source issue keys are missing from timeline.<br />部分來源 issue keys 未進入 timeline。<div className="mt-1 break-words text-xs">{userAnalysis.timelineSummary.integrity.missingIssueKeysFromTimeline.join(", ")}</div></div> : null}
          {userAnalysis.timelineSummary && userAnalysis.timelineSummary.integrity.missingIssueKeysFromTimeline.length === 0 && userAnalysis.timelineSummary.integrity.missingIssueKeysFromPrimaryTimeline.length > 0 ? <div data-testid="timeline-integrity-secondary-info" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-950">Some issue keys are secondary issue keys and appear only in allIssueKeys.<br />部分 issue keys 是次要 issue key，僅出現在 allIssueKeys。<div className="mt-1 break-words text-xs">{userAnalysis.timelineSummary.integrity.missingIssueKeysFromPrimaryTimeline.join(", ")}</div></div> : null}
          {userAnalysis.timelineSummary ? <div data-testid="timeline-integrity-diagnostics" className="mt-4 grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-line bg-slate-50 p-3 md:grid-cols-4">
            <MiniStat label="Source Parsed" value={userAnalysis.timelineSummary.integrity.sourceParsedActivityCount} />
            <MiniStat label="Timeline Events" value={userAnalysis.timelineSummary.integrity.timelineEventCount} />
            <MiniStat label="Deduplicated" value={userAnalysis.timelineSummary.integrity.deduplicatedEntryCount} />
            <MiniStat label="Skipped" value={userAnalysis.timelineSummary.integrity.skippedEntryCount} />
            <MiniStat label="Source Keys" value={userAnalysis.timelineSummary.integrity.sourceParsedIssueKeyCount} />
            <MiniStat label="Primary Keys" value={userAnalysis.timelineSummary.integrity.timelinePrimaryIssueKeyCount} />
            <MiniStat label="All Keys" value={userAnalysis.timelineSummary.integrity.timelineAllIssueKeyCount} />
            <MiniStat label="Unexplained" value={userAnalysis.timelineSummary.eventCountReconciliation.unexplainedDifferenceCount} />
          </div> : null}
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-relaxed text-emerald-950">
            Read-only: no Jira write, no database write, and no attachment body download.<br />唯讀：不寫入 Jira、不寫入資料庫、不下載附件本體。
          </div>
        </SectionCard>

        <SectionCard title="Timeline Event Filters" subtitle="活動事件複選篩選">
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MultiSelectFilter testId="timeline-filter-activity-types" label="Activity Type" options={timelineFilterOptions.activityTypes.map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.activityTypes} onToggle={(value) => toggleTimelineFilter("activityTypes", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, activityTypes: [] } })} />
            <MultiSelectFilter testId="timeline-filter-source-applications" label="Source Application" options={["jira", "confluence", "other", "unknown"].map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.sourceApplications} onToggle={(value) => toggleTimelineFilter("sourceApplications", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, sourceApplications: [] } })} />
            <MultiSelectFilter testId="timeline-filter-jira-relations" label="Jira Relation" options={["jira_related", "has_jira_issue_key", "non_jira", "unknown_relation"].map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.jiraRelations} onToggle={(value) => toggleTimelineFilter("jiraRelations", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, jiraRelations: [] } })} />
            <MultiSelectFilter testId="timeline-filter-confidences" label="Confidence" options={["high", "medium", "low"].map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.confidences} onToggle={(value) => toggleTimelineFilter("confidences", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, confidences: [] } })} />
            <MultiSelectFilter testId="timeline-filter-issue-keys" label="Issue Key" options={timelineFilterOptions.issueKeys.map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.issueKeys} onToggle={(value) => toggleTimelineFilter("issueKeys", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, issueKeys: [] } })} />
            <MultiSelectFilter testId="timeline-filter-project-keys" label="Project Key" options={timelineFilterOptions.projectKeys.map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.projectKeys} onToggle={(value) => toggleTimelineFilter("projectKeys", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, projectKeys: [] } })} />
            <MultiSelectFilter testId="timeline-filter-users" label="User" options={timelineFilterOptions.users.map((value) => ({ value, label: value }))} selected={userAnalysis.timelineFilters.users} onToggle={(value) => toggleTimelineFilter("users", value)} onClear={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, users: [] } })} />
          </div>
          <div data-testid="timeline-event-filter-summary" className="mt-3 rounded-lg border border-line bg-white p-3 text-sm font-semibold text-muted">Showing {filteredTimelineEvents.length} of {userAnalysis.timelineEvents.length} timeline events. Empty filters mean All; values within a filter use OR and filter groups use AND.</div>
          <div className="mt-3 flex flex-wrap gap-2"><button data-testid="clear-all-timeline-filters" className="btn" type="button" onClick={() => patchState({ timelineFilters: { activityTypes: [], sourceApplications: [], jiraRelations: [], confidences: [], issueKeys: [], projectKeys: [], users: [] } })}>Clear all filters / 清除全部篩選</button><button data-testid="reset-timeline-filters" className="btn" type="button" onClick={() => patchState({ timelineFilters: { ...userAnalysis.timelineFilters, sourceApplications: ["jira", "confluence"], jiraRelations: ["jira_related"] } })}>Reset Jira-related default / 重設 Jira 關聯預設</button></div>
        </SectionCard>

        <SectionCard title="Timeline Event List" subtitle={`Showing ${filteredTimelineEvents.length} of ${userAnalysis.timelineEvents.length} events`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-semibold text-muted">Required columns stay visible; long evidence is available in Details.</div><button data-testid="timeline-column-settings-toggle" className="btn" type="button" onClick={() => patchState({ timelineColumnSettingsOpen: !userAnalysis.timelineColumnSettingsOpen })}><Columns3 size={16} />Column Settings / 欄位設定</button></div>
          {userAnalysis.timelineColumnSettingsOpen ? <ColumnSettings testId="timeline-column-settings" required={timelineRequiredColumns} optional={timelineOptionalColumns} visible={userAnalysis.timelineVisibleColumns} onToggle={(value) => toggleVisibleColumn("timeline", value)} /> : null}
          {userAnalysis.timelineEvents.length === 0 ? <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm font-semibold text-muted">Build an Activity Timeline to view events. / 建立活動時間線後即可檢視事件。</div> : (
            <ResponsiveTableContainer data-testid="timeline-events-table">
              <table className="data-table min-w-[980px]"><thead><tr>{timelineRequiredColumns.map((column) => <th key={column.value}>{column.label}</th>)}{timelineOptionalColumns.filter((column) => userAnalysis.timelineVisibleColumns.includes(column.value)).map((column) => <th key={column.value}>{column.label}</th>)}<th>Details</th></tr></thead><tbody>
                {filteredTimelineEvents.map((event) => <Fragment key={event.eventId}>
                  <tr><td className="whitespace-nowrap">{event.eventTime || "-"}</td><td title={`${event.displayName} (${event.userKey})`}>{event.displayName}</td><td>{event.issueKey || "-"}</td><td><StatusBadge tone={event.eventType === "unknown" ? "amber" : "blue"}>{event.eventType}</StatusBadge></td><td><StatusBadge tone={event.sourceApplication === "jira" ? "blue" : event.sourceApplication === "confluence" ? "green" : "amber"}>{event.sourceApplication}</StatusBadge></td>
                    {userAnalysis.timelineVisibleColumns.includes("title") ? <td className="max-w-[320px]"><div className="truncate" data-allow-truncate="true" title={event.eventTitle}>{event.eventTitle}</div></td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("allIssueKeys") ? <td>{event.allIssueKeys.join(", ") || "-"}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("sourceDetail") ? <td>{event.sourceDetail}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("jiraRelation") ? <td><StatusBadge tone={event.isJiraRelated ? "green" : "amber"}>{event.isJiraRelated ? "Jira-related" : "Non-Jira"}</StatusBadge></td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("confidence") ? <td><StatusBadge tone={event.sourceConfidence === "high" ? "green" : event.sourceConfidence === "low" ? "red" : "amber"}>{event.sourceConfidence}</StatusBadge></td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("eventId") ? <td className="max-w-[180px] truncate" title={event.eventId}>{event.eventId}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("entryFingerprint") ? <td className="max-w-[180px] truncate" title={event.rawRef.entryFingerprint}>{event.rawRef.entryFingerprint}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("relatedSystems") ? <td>{event.relatedSystems.join(", ")}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("jiraRelationReason") ? <td>{event.jiraRelationReason}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("rawTitle") ? <td className="max-w-[320px] truncate" title={event.rawTitle}>{event.rawTitle}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("sourceVariant") ? <td>{event.rawRef.variant}</td> : null}
                    {userAnalysis.timelineVisibleColumns.includes("baselineStatus") ? <td>{event.evidence.baselineGuard.classification}</td> : null}
                    <td><button className="btn px-3 py-2" type="button" onClick={() => toggleTimelineDetail(event.eventId)}>{userAnalysis.expandedTimelineEvents.includes(event.eventId) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}Details</button></td></tr>
                  {userAnalysis.expandedTimelineEvents.includes(event.eventId) ? <tr><td colSpan={userAnalysis.timelineVisibleColumns.length + 1}><div className="grid min-w-0 grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed md:grid-cols-2"><div className="md:col-span-2"><b>Full Title:</b> <span className="break-words">{event.eventTitle}</span></div><div><b>eventId:</b> <span className="break-all">{event.eventId}</span></div><div><b>allIssueKeys:</b> {event.allIssueKeys.join(", ") || "-"}</div><div><b>sourceDetail:</b> {event.sourceDetail}</div><div><b>sourceRunId / chunk:</b> {event.sourceRunId} / {event.rawRef.variant}</div><div><b>jiraRelationReason:</b> {event.jiraRelationReason}</div><div><b>relatedSystems:</b> {event.relatedSystems.join(", ")}</div><div><b>confidence:</b> {event.sourceConfidence}</div><div><b>entryFingerprint:</b> <span className="break-all">{event.rawRef.entryFingerprint}</span></div><div><b>matchedRule:</b> {event.evidence.activityTypeClassifier.matchedRule}</div><div><b>baseline:</b> {event.evidence.baselineGuard.classification}</div><div><b>retry:</b> triggered={String(event.evidence.baselineGuard.retryTriggered)}, recovered={String(event.evidence.baselineGuard.retryRecovered)}</div><div className="md:col-span-2"><b>raw title:</b> <span className="break-words">{event.rawTitle}</span></div><div className="md:col-span-2"><b>diagnostics:</b> <span className="break-words">{event.sanitizedSummary}</span></div></div></td></tr> : null}
                </Fragment>)}
              </tbody></table>
            </ResponsiveTableContainer>
          )}
        </SectionCard>

        {userAnalysis.timelineSummary ? <SectionCard title="Auto-saved Timeline Exports" subtitle="自動儲存時間線匯出">
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3">{Object.entries(userAnalysis.timelineExportPaths).map(([key, value]) => <div key={key} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3"><div className="text-xs font-black uppercase text-muted">{key}</div><div className="mt-1 break-all text-xs font-bold" title={value}>{value || "-"}</div></div>)}</div>
          <button className="btn mt-3" type="button" disabled={!userAnalysis.timelineExportPaths.jsonPath} onClick={() => void window.desktopApp?.userAnalysis?.openExportFolder({ folderPath: parentFolder(userAnalysis.timelineExportPaths.jsonPath) })}><FolderOpen size={15} />Open Timeline Export Folder / 開啟時間線匯出資料夾</button>
        </SectionCard> : null}
      </div> : null}

      {userAnalysis.activeTab === "exports" ? <div id="analysis-exports" className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0 xl:col-span-2">
          <SetupSummary />
          {!exportReady ? <div data-testid="export-blocked" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">No exportable User Analysis results yet.<br />目前尚無可匯出的使用者分析結果。</div> : null}
        </div>
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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="source-archive-exporter">
              <div className="font-black text-emerald-950">Source Archive Import Package / 來源封存匯入套件</div>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-emerald-900">Exports Jira and Confluence Full Fetch raw JSON only. It does not create or write a Source Archive database.<br />僅匯出 Jira 與 Confluence Full Fetch 原始 JSON；不會建立或寫入來源封存資料庫。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button data-testid="preview-source-archive" className="btn" type="button" disabled={sourceArchiveBusy || !userAnalysis.fullFetchRawDataByIssueSanitized} onClick={() => void previewSourceArchive()}><Eye size={16} />Preview Package / 預覽套件</button>
                <button data-testid="export-source-archive" className="btn btn-primary" type="button" disabled={sourceArchiveBusy || !sourceArchivePreview} onClick={() => void exportSourceArchive()}><Download size={16} />Export Source Archive Import Package / 匯出來源封存匯入套件</button>
              </div>
              {sourceArchivePreview ? (() => { const summary = sourceArchivePreview.summary as Record<string, unknown> | undefined; const errors = Array.isArray(sourceArchivePreview.errors) ? sourceArchivePreview.errors : []; return <div data-testid="source-archive-preview" className="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2"><MiniStat label="Jira Full Fetch / Jira 完整抓取" value={String(summary?.jiraFullFetchObjectCount ?? 0)} /><MiniStat label="Confluence Full Fetch / Confluence 完整抓取" value={String(summary?.confluenceFullFetchObjectCount ?? 0)} /><MiniStat label="Missing Keys / 缺少編號" value={String(summary?.missingObjectKeyCount ?? 0)} /><MiniStat label="Errors / 錯誤" value={String(errors.length)} /><div className="min-w-0 rounded-lg border border-emerald-200 bg-white p-3"><div className="text-xs font-black text-muted">Package File / 套件檔名</div><div className="mt-1 break-all text-sm font-bold" title={String(sourceArchivePreview.fileName ?? "")}>{String(sourceArchivePreview.fileName ?? "-")}</div></div></div>; })() : <div className="mt-3 text-sm font-semibold text-emerald-800">Preview the package before export. / 匯出前請先預覽套件內容。</div>}
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
