import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { DiffCell } from "../components/DiffCell";
import { ActivityEventDetailPanel } from "../components/ActivityEventDetailPanel";
import { JiraContent } from "../components/JiraContent";
import { BeforeAfterDiff } from "../components/BeforeAfterDiff";
import { CommentCard } from "../components/CommentCard";
import { ReadableContentCell } from "../components/ReadableContentCell";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { DateRangeControl } from "../components/DateRangeControl";
import { SqliteDataTable, type SqliteTableColumn } from "../components/SqliteDataTable";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import type { ViewerSection } from "../types/databaseViewer";
import type { UiPreferences } from "../types/uiPreferences";
import { activityEventAfter, activityEventBefore, formatActivityActor, formatActivityEventType, formatActivityEventValue, formatActivitySource } from "../utils/activityEventDisplay";
import { formatDisplayTime } from "../utils/displayTime";
import { queryFromTablePreferences } from "../utils/preferenceQuery";
import { normalizeViewerTableSession, setViewerRowExpanded, stableViewerRowId, viewerQueryCacheKey } from "../utils/viewerSessionState";
import { recordTableRequest } from "../diagnostics/tableDiagnostics";
import { dateRangeBounds } from "../types/dateRange";
import { isDescriptionField } from "../utils/contentChange";
import { localDistinctValues, queryLocalTable, type LocalQueryColumn } from "../utils/localTableQuery";
import { isDescriptionDiffRow } from "../components/DescriptionDiffCell";
import { DescriptionOriginalPreviewCell } from "../components/DescriptionOriginalPreviewCell";

let issueViewerRequestSequence = 0;
let latestIssueSnapshotRequest = 0;
let latestIssueActivityRequest = 0;

function includeDescriptionChange(row: Record<string, unknown>, includeBeforeUnavailable: boolean): boolean {
  if (!isDescriptionDiffRow(row)) return false;
  const status = String((row.descriptionDiff as Record<string, unknown> | undefined)?.status ?? "source-mismatch");
  return status === "changed" || (includeBeforeUnavailable && status === "before-unavailable");
}

const tabs = ["Overview", "Description", "Changelog", "Comments", "Worklogs", "Attachments Metadata", "Issue Links", "Remote Links", "Activity Events", "Raw Evidence"] as const;

const activityEventColumns: SqliteTableColumn[] = [
  { id: "eventTime", label: "Time", kind: "date", required: true, width: 170, minWidth: 150, maxWidth: 240, render: (row) => <span className="whitespace-nowrap">{formatDisplayTime(row.eventTime)}</span> },
  { id: "displayName", queryField: "actor", label: "Actor", kind: "multi", width: 180, render: (row) => formatActivityActor(row) },
  { id: "eventType", queryField: "action", label: "Action", kind: "multi", required: true, width: 140, render: (row) => formatActivityEventType(row.eventType) },
  { id: "fieldName", queryField: "field", label: "Field", kind: "multi", width: 180, render: (row) => formatActivityEventValue(row.fieldName, "Not applicable") },
  { id: "before", label: "Before", kind: "text", width: 320, render: (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="before" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={activityEventBefore(row)} missing="No previous value" /> },
  { id: "after", label: "After", kind: "text", width: 320, render: (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="after" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={activityEventAfter(row)} formatHint={String(row.commentBodyFormat ?? "")} /> },
  { id: "diff", label: "Diff", kind: "text", width: 400, render: (row, context) => <DiffCell row={row} expanded={context.expanded} onExpandedChange={context.setExpanded} /> },
  { id: "sourceProvenance", queryField: "source", label: "Source", kind: "multi", width: 140, render: (row) => formatActivitySource(row.sourceProvenance) }
];

const changelogQueryColumns: Record<string, LocalQueryColumn> = {
  created: { expression: "created", kind: "date" },
  author: { expression: "author", kind: "multi" },
  field: { expression: "field", kind: "multi" },
  before: { expression: "before", kind: "text" },
  after: { expression: "after", kind: "text" },
  source: { expression: "source", kind: "multi" }
};

const changelogColumns: SqliteTableColumn[] = [
  { id: "created", label: "Time", kind: "date", required: true, width: 180, render: (row) => formatDisplayTime(row.created) },
  { id: "author", label: "Actor", kind: "multi", width: 180 },
  { id: "field", label: "Field", kind: "multi", required: true, width: 160 },
  { id: "before", label: "Before", kind: "text", width: 320, render: (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="before" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={row.before} missing={row.beforeAvailable === false ? "Before unavailable" : "Empty"} /> },
  { id: "after", label: "After", kind: "text", width: 320, render: (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="after" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={row.after} missing={row.afterAvailable === false ? "After unavailable" : "Empty"} /> },
  { id: "diff", label: "Diff", kind: "text", width: 520, render: (row, context) => isDescriptionDiffRow(row) ? <DiffCell row={row} expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <span className="text-xs text-muted">Not a Description event</span> },
  { id: "source", label: "Source", kind: "multi", width: 130 }
];
function text(value: unknown, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function sectionState(section: ViewerSection<Record<string, unknown>>, label: string) {
  if (section.status === "ready") return null;
  const danger = section.status === "error" || section.status === "unavailable";
  return <div className={`rounded-md border p-6 text-center text-sm font-bold ${danger ? "border-rose-300 bg-rose-50 text-rose-800" : section.status === "not_collected" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-50 text-muted"}`} data-section-status={section.status}>
    {section.message || `${label}: No records`}
  </div>;
}

export function IssueViewerPage() {
  const { state } = useRuntimeStatus();
  const { issueViewer, setIssueViewer } = useSessionState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);
  const result = issueViewer.result;
  const overview = result?.overview ?? {};

  const databaseIdentity = state.database.sourceBinding || `database-request:${state.database.requestId}`;
  const routeKey = searchParams.get("key")?.trim().toUpperCase() ?? "";

  function patch(patchValue: Partial<typeof issueViewer>) {
    setIssueViewer((current) => ({ ...current, ...patchValue }));
  }

  function setTableState(tableId: string, value: ReturnType<typeof normalizeViewerTableSession>) {
    setIssueViewer((current) => ({ ...current, tableStates: { ...current.tableStates, [tableId]: value } }));
  }

  async function load(keyInput = issueViewer.issueKey) {
    const issueKey = keyInput.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) {
      patch({ issueKey, status: "error", message: "Issue Key 格式無效 / Invalid issue key" });
      return;
    }
    const requestId = ++issueViewerRequestSequence;
    latestIssueSnapshotRequest = requestId;
    latestIssueActivityRequest = ++issueViewerRequestSequence;
    const startedAt = performance.now();
    const query = { issueKey: "[masked-key]" };
    recordTableRequest("started", { requestId, tableId: "issueViewerSnapshot", query, startedAt });
    setIssueViewer((current) => {
      const changingIssue = current.loadedIssueKey !== issueKey;
      return {
        ...current,
        issueKey,
        databaseIdentity,
        status: "loading",
        message: "",
        pendingSnapshotRequestId: requestId,
        ...(changingIssue ? {
          loadedIssueKey: "",
          result: null,
          activeTab: "Overview",
          payloadFilter: "",
          payloadPage: 1,
          activityEventsResult: null,
          activityEventsStatus: "idle" as const,
          activityEventsMessage: "",
          activityEventsCacheKey: "",
          tableStates: {}
        } : {})
      };
    });
    try {
      const next = await window.desktopApp?.databaseViewer?.getIssue({ issueKey });
      if (requestId !== latestIssueSnapshotRequest) {
        recordTableRequest("stale", { requestId, tableId: "issueViewerSnapshot", query, startedAt });
        return;
      }
      if (!next) {
        recordTableRequest("failed", { requestId, tableId: "issueViewerSnapshot", query, startedAt, error: "IPC unavailable" });
        setIssueViewer((current) => current.pendingSnapshotRequestId === requestId ? { ...current, status: "error", message: "Issue Viewer IPC unavailable." } : current);
        return;
      }
      recordTableRequest("completed", { requestId, tableId: "issueViewerSnapshot", query, startedAt, resultCount: next.status === "ready" ? 1 : 0 });
      setIssueViewer((current) => current.pendingSnapshotRequestId !== requestId ? current : {
        ...current,
        result: next,
        loadedIssueKey: issueKey,
        status: next.status === "ready" ? "ready" : next.status === "not_found" ? "not-found" : next.status === "query_failed" ? "error" : "unavailable",
        message: next.message
      });
      setSearchParams({ key: issueKey });
    } catch (error) {
      recordTableRequest("failed", { requestId, tableId: "issueViewerSnapshot", query, startedAt, error });
      if (requestId === latestIssueSnapshotRequest) setIssueViewer((current) => current.pendingSnapshotRequestId === requestId ? { ...current, status: "error", message: error instanceof Error ? error.message : "Issue Viewer query failed." } : current);
    }
  }

  useEffect(() => {
    if (!state.database.canRead) return;
    if (issueViewer.databaseIdentity && issueViewer.databaseIdentity !== databaseIdentity) {
      latestIssueSnapshotRequest = ++issueViewerRequestSequence;
      latestIssueActivityRequest = ++issueViewerRequestSequence;
      setIssueViewer((current) => ({
        ...current,
        databaseIdentity,
        loadedIssueKey: "",
        result: null,
        status: "initial",
        message: "",
        activityEventsResult: null,
        activityEventsStatus: "idle",
        activityEventsMessage: "",
        activityEventsCacheKey: "",
        tableStates: {}
      }));
      if (routeKey) void load(routeKey);
      return;
    }
    if (!issueViewer.databaseIdentity) patch({ databaseIdentity });
    if (routeKey && (issueViewer.loadedIssueKey !== routeKey || !issueViewer.result) && issueViewer.status !== "loading") void load(routeKey);
  }, [state.database.canRead, databaseIdentity, routeKey]);

  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((response) => {
      if (!response) return;
      setPreferences(response.preferences);
      setIssueViewer((current) => ({ ...current, activityEventsQuery: current.activityEventsResult ? current.activityEventsQuery : queryFromTablePreferences(current.activityEventsQuery, response.preferences.issueActivityEvents) }));
    });
  }, []);

  useEffect(() => {
    if (issueViewer.activeTab !== "Activity Events" || issueViewer.status !== "ready" || !issueViewer.loadedIssueKey) return;
    const query = issueViewer.activityEventsQuery;
    const cacheKey = viewerQueryCacheKey(databaseIdentity, issueViewer.loadedIssueKey, "issueActivityEvents", query);
    if (issueViewer.activityEventsResult && issueViewer.activityEventsCacheKey === cacheKey) return;
    const requestId = ++issueViewerRequestSequence;
    latestIssueActivityRequest = requestId;
    const startedAt = performance.now();
    recordTableRequest("started", { requestId, tableId: "issueActivityEvents", query, startedAt });
    patch({ pendingActivityRequestId: requestId, activityEventsStatus: "loading", activityEventsMessage: "" });
    void window.desktopApp?.databaseViewer?.issueEvents({ issueKey: issueViewer.loadedIssueKey, query }).then((next) => {
      if (requestId !== latestIssueActivityRequest) {
        recordTableRequest("stale", { requestId, tableId: "issueActivityEvents", query, startedAt });
        return;
      }
      if (!next) {
        recordTableRequest("failed", { requestId, tableId: "issueActivityEvents", query, startedAt, error: "IPC unavailable" });
        setIssueViewer((current) => current.pendingActivityRequestId === requestId ? { ...current, activityEventsStatus: "error", activityEventsMessage: "Issue Activity Events IPC unavailable." } : current);
        return;
      }
      recordTableRequest("completed", { requestId, tableId: "issueActivityEvents", query, startedAt, resultCount: next.rows.length });
      setIssueViewer((current) => current.pendingActivityRequestId !== requestId ? current : { ...current, activityEventsResult: next, activityEventsStatus: "ready", activityEventsMessage: "", activityEventsCacheKey: cacheKey });
    }).catch((error: unknown) => {
      recordTableRequest("failed", { requestId, tableId: "issueActivityEvents", query, startedAt, error });
      if (requestId === latestIssueActivityRequest) setIssueViewer((current) => current.pendingActivityRequestId === requestId ? { ...current, activityEventsStatus: "error", activityEventsMessage: error instanceof Error ? error.message : "Issue Activity Events query failed." } : current);
    });
  }, [issueViewer.activeTab, issueViewer.status, issueViewer.loadedIssueKey, issueViewer.activityEventsQuery, databaseIdentity]);
  const overviewRows = useMemo(() => [
    ["Issue Key", text(overview.issueKey)],
    ["Summary", text(overview.summary)],
    ["Project", text(overview.projectKey)],
    ["Type", text(overview.issue_type)],
    ["Status", text(overview.status)],
    ["Priority", text(overview.priority)],
    ["Assignee", text(overview.assignee)],
    ["Reporter", text(overview.reporter)],
    ["Creator", text(overview.creator)],
    ["Labels", array(overview.labels).map(String).join(", ") || "Unavailable"],
    ["Start / Due Date", `${text(overview.start_date)} / ${text(overview.due_date)}`],
    ["Updated", formatDisplayTime(overview.jira_updated_at)],
    ["Resolution", text(overview.resolution)],
    ["Snapshot Time", formatDisplayTime(overview.snapshot_updated_at)],
    ["Save Outcome", text(overview.saveOutcome)],
    ["Fetch Result", result?.status === "ready" ? "Success" : text(result?.status)],
    ["Coverage Status", Object.keys((overview.coverage ?? {}) as object).length ? "Available" : "Unavailable"]
  ], [overview, result?.status]);

  if (!state.database.canRead) {
    return <div><PageHeader title="Issue 檢視" subtitle="Issue Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  const section = result && issueViewer.activeTab === "Changelog" ? result.changelog
    : result && issueViewer.activeTab === "Comments" ? result.comments
      : result && issueViewer.activeTab === "Worklogs" ? result.worklogs
        : result && issueViewer.activeTab === "Attachments Metadata" ? result.attachments
        : result && issueViewer.activeTab === "Issue Links" ? result.issueLinks
          : result && issueViewer.activeTab === "Remote Links" ? result.remoteLinks
            : null;

  const payloadRecords = section?.status === "ready" ? section.records : [];
  const normalizedPayloadFilter = issueViewer.payloadFilter.trim().toLowerCase();
  const activePayloadQuery = issueViewer.activeTab === "Changelog" ? issueViewer.changelogQuery : issueViewer.commentsQuery;
  const payloadBounds = dateRangeBounds(activePayloadQuery.dateRange);
  const commentsMissingDateCount = issueViewer.activeTab === "Comments" ? payloadRecords.filter((item) => !item.created && !item.updated).length : 0;
  const filteredPayloadRecords = payloadRecords.filter((item) => {
    if (normalizedPayloadFilter && !JSON.stringify(item).toLowerCase().includes(normalizedPayloadFilter)) return false;
    const timestamp = issueViewer.activeTab === "Comments"
      ? (issueViewer.commentsQuery.commentDateMode ?? "created") === "updated" ? String(item.updated || item.created || "") : String(item.created || "")
      : String(item.created || "");
    if (payloadBounds.startInclusive && timestamp < payloadBounds.startInclusive) return false;
    if (payloadBounds.endExclusive && timestamp >= payloadBounds.endExclusive) return false;
    if (issueViewer.activeTab === "Changelog" && (issueViewer.changelogQuery.descriptionChangedOnly ?? false)) {
      if (!isDescriptionField(item.fieldId, item.field)) return false;
      return includeDescriptionChange(item, issueViewer.changelogQuery.includeBeforeUnavailable ?? false);
    }
    return true;
  });
  const changelogRecords: Array<Record<string, unknown>> = payloadRecords.map((item) => ({ ...(item as Record<string, unknown>), source: String(item.source ?? "jira payload") }));
  const changelogScopedRecords = !(issueViewer.changelogQuery.descriptionChangedOnly ?? false) ? changelogRecords : changelogRecords.filter((item) => {
    if (!isDescriptionField(item.fieldId, item.field)) return false;
    return includeDescriptionChange(item, issueViewer.changelogQuery.includeBeforeUnavailable ?? false);
  });
  const changelogResult = queryLocalTable(changelogScopedRecords, issueViewer.changelogQuery, changelogQueryColumns, "created");
  const payloadPageCount = Math.max(1, Math.ceil(filteredPayloadRecords.length / 50));
  const visiblePayloadRecords = filteredPayloadRecords.slice((Math.min(issueViewer.payloadPage, payloadPageCount) - 1) * 50, Math.min(issueViewer.payloadPage, payloadPageCount) * 50);
  return (
    <div className="min-w-0">
      <PageHeader title="Issue 檢視" subtitle="Issue Viewer · Local Database Only" connected={false} />
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1 block text-xs font-black text-muted">Issue Key</span>
            <input className="field uppercase" value={issueViewer.issueKey} onChange={(event) => patch({ issueKey: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="PROJECT-123" />
          </label>
          <button className="btn btn-primary" type="button" disabled={issueViewer.status === "loading"} onClick={() => void load()}><Search size={16} />查詢本機資料庫 / Search Local DB</button>
        </div>
        <p className="mt-3 text-xs font-semibold text-muted">只讀 Local SQLite。此 Viewer 不會呼叫 Jira API，也不會修改資料庫。</p>
      </SectionCard>
      {issueViewer.status === "initial" ? <div className="mt-4 rounded-md border border-dashed border-slate-300 p-12 text-center font-bold text-muted">輸入 Issue Key 開始查詢 / Enter an issue key</div> : null}
      {issueViewer.status === "loading" ? <div className="mt-4 p-12 text-center font-bold text-muted">Loading...</div> : null}
      {issueViewer.status === "not-found" ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">{issueViewer.message}</div> : null}
      {["error", "unavailable"].includes(issueViewer.status) ? <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-5 font-bold text-rose-800"><AlertTriangle className="mr-2 inline" size={18} />{issueViewer.message}</div> : null}
      {issueViewer.status === "ready" && result ? (
        <SectionCard className="mt-4" title={`${result.issueKey} · ${text(overview.summary)}`} subtitle={`Snapshot ${text(overview.snapshot_updated_at)}`}>
          <div className="thin-scroll mb-4 flex overflow-x-auto border-b border-line" role="tablist" aria-label="Issue Viewer sections">
            {tabs.map((item) => <button key={item} role="tab" aria-selected={issueViewer.activeTab === item} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${issueViewer.activeTab === item ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => patch({ activeTab: item })}>{item}</button>)}
          </div>
          <SectionErrorBoundary context={`issue-viewer:${issueViewer.activeTab}`} resetKey={`${state.database.requestId}:${result.issueKey}:${issueViewer.activeTab}`} safeText={result.description.plainText}>
          <div role="tabpanel" aria-label={issueViewer.activeTab}>
            {issueViewer.activeTab === "Overview" ? <DataTable headers={["Field", "Value"]} rows={overviewRows} /> : null}
            {issueViewer.activeTab === "Description" ? result.description.status === "ready"
              ? <JiraContent className="rounded-md bg-slate-50 p-4" content={result.description.content || result.description.plainText} format={result.description.format} />
              : <div className="rounded-md border border-slate-300 bg-slate-50 p-6 text-center font-bold text-muted">{result.description.message}</div> : null}
            {section ? sectionState(section, issueViewer.activeTab) : null}
            {section?.status === "ready" && ["Changelog", "Comments"].includes(issueViewer.activeTab) ? <div className="mb-3 space-y-3"><DateRangeControl value={issueViewer.activeTab === "Changelog" ? issueViewer.changelogQuery.dateRange ?? issueViewer.payloadDateRange : issueViewer.commentsQuery.dateRange ?? issueViewer.payloadDateRange} onChange={(payloadDateRange) => issueViewer.activeTab === "Changelog" ? patch({ changelogQuery: { ...issueViewer.changelogQuery, page: 1, dateRange: payloadDateRange, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 } }) : patch({ commentsQuery: { ...issueViewer.commentsQuery, page: 1, dateRange: payloadDateRange, revision: (issueViewer.commentsQuery.revision ?? 0) + 1 }, payloadDateRange, payloadPage: 1 })} label={issueViewer.activeTab === "Changelog" ? "Changelog Time / 變更時間" : (issueViewer.commentsQuery.commentDateMode ?? "created") === "created" ? "Comments Created / 留言建立時間" : "Comments Last Updated / 留言最後更新"} />{issueViewer.activeTab === "Comments" ? <label className="block max-w-sm"><span className="mb-1 block text-xs font-black text-muted">Comment Date Mode / 留言日期依據</span><select className="field" value={issueViewer.commentsQuery.commentDateMode ?? "created"} onChange={(event) => patch({ commentsQuery: { ...issueViewer.commentsQuery, page: 1, commentDateMode: event.currentTarget.value as "created" | "updated", revision: (issueViewer.commentsQuery.revision ?? 0) + 1 }, commentDateMode: event.currentTarget.value as "created" | "updated", payloadPage: 1 })}><option value="created">Created (default) / 建立時間</option><option value="updated">Last Updated / 最後更新</option></select></label> : <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={issueViewer.changelogQuery.descriptionChangedOnly ?? false} onChange={(event) => patch({ changelogQuery: { ...issueViewer.changelogQuery, page: 1, descriptionChangedOnly: event.currentTarget.checked, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 }, descriptionChangedOnly: event.currentTarget.checked, payloadPage: 1 })} />Description Changed Only / 僅 Description 變更</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={issueViewer.changelogQuery.includeBeforeUnavailable ?? false} onChange={(event) => patch({ changelogQuery: { ...issueViewer.changelogQuery, page: 1, includeBeforeUnavailable: event.currentTarget.checked, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 }, includeBeforeUnavailable: event.currentTarget.checked, payloadPage: 1 })} />Include Before unavailable / 包含缺少 Before</label></div>}</div> : null}            {section?.status === "ready" && issueViewer.activeTab === "Comments" ? <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-slate-50 p-3"><label className="min-w-[240px] flex-1"><span className="mb-1 block text-xs font-black text-muted">Filter current payload section</span><input className="field" value={issueViewer.payloadFilter} onChange={(event) => patch({ payloadFilter: event.currentTarget.value, payloadPage: 1 })} placeholder="Author, field, value, or comment text" /></label><div className="text-xs font-bold text-muted">Filtered {filteredPayloadRecords.length.toLocaleString()} / Total {payloadRecords.length.toLocaleString()} / 50 per page {commentsMissingDateCount ? <span> · Missing both dates excluded: {commentsMissingDateCount}</span> : null}</div></div> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Changelog" ? <SqliteDataTable tableId="issueChangelog" columns={changelogColumns} result={changelogResult} query={issueViewer.changelogQuery} preferences={preferences?.issueChangelog} onPreferencesChange={(value) => void window.desktopApp?.uiPreferences?.update({ section: "issueChangelog", value }).then((response) => { if (response) setPreferences(response.preferences); })} onQueryChange={(query) => patch({ changelogQuery: { ...query, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 } })} sessionState={issueViewer.tableStates.issueChangelog} onSessionStateChange={(value) => setTableState("issueChangelog", value)} getRowId={(row) => stableViewerRowId(row)} renderExpandedRow={(row) => isDescriptionDiffRow(row) ? <ActivityEventDetailPanel row={row} /> : <BeforeAfterDiff before={row.before} after={row.after} expanded={true} onExpandedChange={() => undefined} />} loadDistinct={async (field, search) => localDistinctValues(changelogScopedRecords, issueViewer.changelogQuery, changelogQueryColumns, field, search)} /> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Comments" ? <div className="space-y-3">{visiblePayloadRecords.map((item) => <CommentCard key={text(item.id)} comment={{ ...item, dateModeFallback: (issueViewer.commentsQuery.commentDateMode ?? "created") === "updated" && !item.updated && Boolean(item.created) }} />)}</div> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Worklogs" ? <DataTable headers={["Started", "Author", "Time Spent", "Comment", "Worklog ID"]} rows={section.records.map((item) => [formatDisplayTime(item.startedAt ?? item.started), text(item.authorDisplayName ?? (item.author as Record<string, unknown> | undefined)?.displayName), text(item.timeSpent), <ReadableContentCell value={item.commentText ?? item.comment} />, text(item.worklogId ?? item.id)])} /> : null}
            {section?.status === "ready" && ["Changelog", "Comments"].includes(issueViewer.activeTab) && payloadPageCount > 1 ? <div className="my-3 flex items-center justify-end gap-2"><button className="btn" type="button" disabled={issueViewer.payloadPage <= 1} onClick={() => patch({ payloadPage: Math.max(1, issueViewer.payloadPage - 1) })}>Previous</button><span className="text-xs font-bold">Page {Math.min(issueViewer.payloadPage, payloadPageCount)} / {payloadPageCount}</span><button className="btn" type="button" disabled={issueViewer.payloadPage >= payloadPageCount} onClick={() => patch({ payloadPage: Math.min(payloadPageCount, issueViewer.payloadPage + 1) })}>Next</button></div> : null}            {section?.status === "ready" && issueViewer.activeTab === "Attachments Metadata" ? <DataTable headers={["Filename", "Size", "Mime Type", "Created", "Author"]} rows={section.records.map((item) => [text(item.filename), text(item.size), text(item.mimeType), text(item.created), text((item.author as Record<string, unknown> | undefined)?.displayName)])} /> : null}
            {section?.status === "ready" && ["Issue Links", "Remote Links"].includes(issueViewer.activeTab) ? <DataTable headers={["Type", "Direction / Object", "Issue / URL"]} rows={section.records.map((item) => [text((item.type as Record<string, unknown> | undefined)?.name ?? item.relationship), text(item.inwardIssue ? "Inward" : item.outwardIssue ? "Outward" : item.title), text((item.inwardIssue as Record<string, unknown> | undefined)?.key ?? (item.outwardIssue as Record<string, unknown> | undefined)?.key ?? item.url)])} /> : null}
            {issueViewer.activeTab === "Activity Events" ? <div className="space-y-3"><DateRangeControl value={issueViewer.activityEventsQuery.dateRange ?? { shortcut: "all", startDate: "", endDate: "" }} onChange={(dateRange) => patch({ activityEventsQuery: { ...issueViewer.activityEventsQuery, page: 1, dateRange, revision: (issueViewer.activityEventsQuery.revision ?? 0) + 1 }, activityEventsResult: null, activityEventsCacheKey: "" })} label="Activity Events Time / 活動事件時間" /><div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">All local SQLite activity events for this Issue Key. No Jira request is sent.</div><SqliteDataTable tableId="issueActivityEvents" columns={activityEventColumns} result={issueViewer.activityEventsResult ?? { rows: [], filteredCount: 0, totalCount: 0, page: 1, pageSize: 50, pageCount: 1 }} query={issueViewer.activityEventsQuery} loading={issueViewer.activityEventsStatus === "loading"} error={issueViewer.activityEventsMessage} preferences={preferences?.issueActivityEvents} onPreferencesChange={(value) => void window.desktopApp?.uiPreferences?.update({ section: "issueActivityEvents", value }).then((response) => { if (response) setPreferences(response.preferences); })} onQueryChange={(activityEventsQuery) => patch({ activityEventsQuery: { ...activityEventsQuery, revision: (issueViewer.activityEventsQuery.revision ?? 0) + 1 }, activityEventsResult: null, activityEventsCacheKey: "" })} sessionState={issueViewer.tableStates.issueActivityEvents} onSessionStateChange={(value) => setTableState("issueActivityEvents", value)} renderExpandedRow={(row) => <ActivityEventDetailPanel row={row} />} loadDistinct={async (field, search) => (await window.desktopApp?.databaseViewer?.distinctValues({ source: "issueEvents", subjectId: issueViewer.loadedIssueKey, field, search, limit: 100, query: issueViewer.activityEventsQuery })) ?? { field, values: [], truncated: false }} /></div> : null}
            {issueViewer.activeTab === "Raw Evidence" ? <div><div className="mb-3 text-xs font-bold text-muted">Schema: {result.rawEvidence.schemaVersion} · Payload Format: {text(result.rawEvidence.payloadFormatVersion)} · Saved: {text(result.rawEvidence.payloadSavedAt)}</div><pre className="thin-scroll max-h-[560px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-4 text-xs text-slate-100">{result.rawEvidence.preview}</pre>{result.rawEvidence.message ? <p className="mt-2 text-xs font-bold text-amber-700">{result.rawEvidence.message}</p> : null}</div> : null}
          </div>
          </SectionErrorBoundary>
        </SectionCard>
      ) : null}
    </div>
  );
}
