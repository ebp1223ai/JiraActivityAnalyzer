import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ActivityComparisonTable } from "../components/ActivityComparisonTable";
import { CommentCard } from "../components/CommentCard";
import { DataTable } from "../components/DataTable";
import { DateRangeControl } from "../components/DateRangeControl";
import { JiraContent } from "../components/JiraContent";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import { dateRangeBounds } from "../types/dateRange";
import type { ViewerSection } from "../types/databaseViewer";
import type { UiPreferences } from "../types/uiPreferences";
import { recordTableRequest } from "../diagnostics/tableDiagnostics";
import { formatDisplayTime } from "../utils/displayTime";
import { ISSUE_VIEWER_TABS, normalizeIssueViewerTab } from "../utils/issueViewerTabs";
import { queryFromTablePreferences } from "../utils/preferenceQuery";
import { normalizeViewerTableSession, viewerQueryCacheKey } from "../utils/viewerSessionState";

let issueViewerRequestSequence = 0;
let latestIssueSnapshotRequest = 0;
let latestIssueChangelogRequest = 0;
let latestIssueActivityRequest = 0;

function text(value: unknown, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function sectionState(section: ViewerSection<Record<string, unknown>>, label: string) {
  if (section.status === "ready") return null;
  const danger = section.status === "error" || section.status === "unavailable";
  const color = danger ? "border-rose-300 bg-rose-50 text-rose-800" : section.status === "not_collected" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-50 text-muted";
  return <div className={`rounded-md border p-6 text-center text-sm font-bold ${color}`} data-section-status={section.status}>{section.message || `${label}: No records`}</div>;
}

const emptyTable = { rows: [], filteredCount: 0, totalCount: 0, page: 1, pageSize: 50, pageCount: 1 };

export function IssueViewerPage() {
  const { state } = useRuntimeStatus();
  const { issueViewer, setIssueViewer } = useSessionState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);
  const result = issueViewer.result;
  const overview = result?.overview ?? {};
  const activeTab = normalizeIssueViewerTab(issueViewer.activeTab);
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
    latestIssueChangelogRequest = ++issueViewerRequestSequence;
    latestIssueActivityRequest = ++issueViewerRequestSequence;
    const startedAt = performance.now();
    const diagnosticsQuery = { issueKey: "[masked-key]" };
    recordTableRequest("started", { requestId, tableId: "issueViewerSnapshot", query: diagnosticsQuery, startedAt });
    setIssueViewer((current) => {
      const changingIssue = current.loadedIssueKey !== issueKey;
      return {
        ...current, issueKey, databaseIdentity, status: "loading", message: "", pendingSnapshotRequestId: requestId,
        ...(changingIssue ? {
          loadedIssueKey: "", result: null, activeTab: "Overview", payloadFilter: "", payloadPage: 1,
          changelogResult: null, changelogStatus: "idle" as const, changelogMessage: "", changelogCacheKey: "",
          activityEventsResult: null, activityEventsStatus: "idle" as const, activityEventsMessage: "", activityEventsCacheKey: "",
          tableStates: {}
        } : {})
      };
    });
    try {
      const next = await window.desktopApp?.databaseViewer?.getIssue({ issueKey });
      if (requestId !== latestIssueSnapshotRequest) {
        recordTableRequest("stale", { requestId, tableId: "issueViewerSnapshot", query: diagnosticsQuery, startedAt });
        return;
      }
      if (!next) throw new Error("Issue Viewer IPC unavailable.");
      recordTableRequest("completed", { requestId, tableId: "issueViewerSnapshot", query: diagnosticsQuery, startedAt, resultCount: next.status === "ready" ? 1 : 0 });
      setIssueViewer((current) => current.pendingSnapshotRequestId !== requestId ? current : {
        ...current, result: next, loadedIssueKey: issueKey,
        status: next.status === "ready" ? "ready" : next.status === "not_found" ? "not-found" : next.status === "query_failed" ? "error" : "unavailable",
        message: next.message
      });
      setSearchParams({ key: issueKey });
    } catch (error) {
      recordTableRequest("failed", { requestId, tableId: "issueViewerSnapshot", query: diagnosticsQuery, startedAt, error });
      if (requestId === latestIssueSnapshotRequest) setIssueViewer((current) => current.pendingSnapshotRequestId === requestId ? { ...current, status: "error", message: error instanceof Error ? error.message : "Issue Viewer query failed." } : current);
    }
  }

  useEffect(() => {
    if (activeTab !== issueViewer.activeTab) patch({ activeTab });
  }, [activeTab, issueViewer.activeTab]);

  useEffect(() => {
    if (!state.database.canRead) return;
    if (issueViewer.databaseIdentity && issueViewer.databaseIdentity !== databaseIdentity) {
      latestIssueSnapshotRequest = ++issueViewerRequestSequence;
      latestIssueChangelogRequest = ++issueViewerRequestSequence;
      latestIssueActivityRequest = ++issueViewerRequestSequence;
      setIssueViewer((current) => ({
        ...current, databaseIdentity, loadedIssueKey: "", result: null, status: "initial", message: "",
        changelogResult: null, changelogStatus: "idle", changelogMessage: "", changelogCacheKey: "",
        activityEventsResult: null, activityEventsStatus: "idle", activityEventsMessage: "", activityEventsCacheKey: "", tableStates: {}
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
      setIssueViewer((current) => ({
        ...current,
        changelogQuery: current.changelogResult ? current.changelogQuery : queryFromTablePreferences(current.changelogQuery, response.preferences.issueChangelog),
        activityEventsQuery: current.activityEventsResult ? current.activityEventsQuery : queryFromTablePreferences(current.activityEventsQuery, response.preferences.issueActivityEvents)
      }));
    });
  }, []);

  useEffect(() => {
    if (activeTab !== "Changelog" || issueViewer.status !== "ready" || !issueViewer.loadedIssueKey) return;
    const query = issueViewer.changelogQuery;
    const cacheKey = viewerQueryCacheKey(databaseIdentity, issueViewer.loadedIssueKey, "issueChangelog", query);
    if (issueViewer.changelogResult && issueViewer.changelogCacheKey === cacheKey) return;
    const requestId = ++issueViewerRequestSequence;
    latestIssueChangelogRequest = requestId;
    const startedAt = performance.now();
    recordTableRequest("started", { requestId, tableId: "issueChangelog", query, startedAt });
    patch({ pendingChangelogRequestId: requestId, changelogStatus: "loading", changelogMessage: "" });
    void window.desktopApp?.databaseViewer?.issueChangelog({ issueKey: issueViewer.loadedIssueKey, query }).then((next) => {
      if (requestId !== latestIssueChangelogRequest) return recordTableRequest("stale", { requestId, tableId: "issueChangelog", query, startedAt });
      if (!next) throw new Error("Issue Changelog IPC unavailable.");
      recordTableRequest("completed", { requestId, tableId: "issueChangelog", query, startedAt, resultCount: next.rows.length });
      setIssueViewer((current) => current.pendingChangelogRequestId !== requestId ? current : { ...current, changelogResult: next, changelogStatus: "ready", changelogMessage: "", changelogCacheKey: cacheKey });
    }).catch((error: unknown) => {
      recordTableRequest("failed", { requestId, tableId: "issueChangelog", query, startedAt, error });
      if (requestId === latestIssueChangelogRequest) setIssueViewer((current) => current.pendingChangelogRequestId === requestId ? { ...current, changelogStatus: "error", changelogMessage: error instanceof Error ? error.message : "Issue Changelog query failed." } : current);
    });
  }, [activeTab, issueViewer.status, issueViewer.loadedIssueKey, issueViewer.changelogQuery, databaseIdentity]);

  useEffect(() => {
    if (activeTab !== "Activity Events" || issueViewer.status !== "ready" || !issueViewer.loadedIssueKey) return;
    const query = issueViewer.activityEventsQuery;
    const cacheKey = viewerQueryCacheKey(databaseIdentity, issueViewer.loadedIssueKey, "issueActivityEvents", query);
    if (issueViewer.activityEventsResult && issueViewer.activityEventsCacheKey === cacheKey) return;
    const requestId = ++issueViewerRequestSequence;
    latestIssueActivityRequest = requestId;
    const startedAt = performance.now();
    recordTableRequest("started", { requestId, tableId: "issueActivityEvents", query, startedAt });
    patch({ pendingActivityRequestId: requestId, activityEventsStatus: "loading", activityEventsMessage: "" });
    void window.desktopApp?.databaseViewer?.issueEvents({ issueKey: issueViewer.loadedIssueKey, query }).then((next) => {
      if (requestId !== latestIssueActivityRequest) return recordTableRequest("stale", { requestId, tableId: "issueActivityEvents", query, startedAt });
      if (!next) throw new Error("Issue Activity Events IPC unavailable.");
      recordTableRequest("completed", { requestId, tableId: "issueActivityEvents", query, startedAt, resultCount: next.rows.length });
      setIssueViewer((current) => current.pendingActivityRequestId !== requestId ? current : { ...current, activityEventsResult: next, activityEventsStatus: "ready", activityEventsMessage: "", activityEventsCacheKey: cacheKey });
    }).catch((error: unknown) => {
      recordTableRequest("failed", { requestId, tableId: "issueActivityEvents", query, startedAt, error });
      if (requestId === latestIssueActivityRequest) setIssueViewer((current) => current.pendingActivityRequestId === requestId ? { ...current, activityEventsStatus: "error", activityEventsMessage: error instanceof Error ? error.message : "Issue Activity Events query failed." } : current);
    });
  }, [activeTab, issueViewer.status, issueViewer.loadedIssueKey, issueViewer.activityEventsQuery, databaseIdentity]);

  const overviewRows = useMemo(() => [
    ["Issue Key", text(overview.issueKey)], ["Summary", text(overview.summary)], ["Project", text(overview.projectKey)],
    ["Type", text(overview.issue_type)], ["Status", text(overview.status)], ["Priority", text(overview.priority)],
    ["Assignee", text(overview.assignee)], ["Reporter", text(overview.reporter)], ["Creator", text(overview.creator)],
    ["Labels", array(overview.labels).map(String).join(", ") || "Unavailable"],
    ["Start / Due Date", `${text(overview.start_date)} / ${text(overview.due_date)}`], ["Updated", formatDisplayTime(overview.jira_updated_at)],
    ["Resolution", text(overview.resolution)], ["Snapshot Time", formatDisplayTime(overview.snapshot_updated_at)],
    ["Save Outcome", text(overview.saveOutcome)], ["Fetch Result", result?.status === "ready" ? "Success" : text(result?.status)],
    ["Coverage Status", Object.keys((overview.coverage ?? {}) as object).length ? "Available" : "Unavailable"]
  ], [overview, result?.status]);

  if (!state.database.canRead) return <div><PageHeader title="Issue 檢視" subtitle="Issue Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;

  const section = result && activeTab === "Comments" ? result.comments : result && activeTab === "Issue Links" ? result.issueLinks : null;
  const payloadRecords = section?.status === "ready" ? section.records : [];
  const normalizedPayloadFilter = issueViewer.payloadFilter.trim().toLowerCase();
  const payloadBounds = dateRangeBounds(issueViewer.commentsQuery.dateRange);
  const commentsMissingDateCount = activeTab === "Comments" ? payloadRecords.filter((item) => !item.created && !item.updated).length : 0;
  const filteredPayloadRecords = payloadRecords.filter((item) => {
    if (normalizedPayloadFilter && !JSON.stringify(item).toLowerCase().includes(normalizedPayloadFilter)) return false;
    const timestamp = (issueViewer.commentsQuery.commentDateMode ?? "created") === "updated" ? String(item.updated || item.created || "") : String(item.created || "");
    if (payloadBounds.startInclusive && timestamp < payloadBounds.startInclusive) return false;
    if (payloadBounds.endExclusive && timestamp >= payloadBounds.endExclusive) return false;
    return true;
  });
  const payloadPageCount = Math.max(1, Math.ceil(filteredPayloadRecords.length / 50));
  const payloadPage = Math.min(issueViewer.payloadPage, payloadPageCount);
  const visiblePayloadRecords = filteredPayloadRecords.slice((payloadPage - 1) * 50, payloadPage * 50);

  return <div className="min-w-0">
    <PageHeader title="Issue 檢視" subtitle="Issue Viewer · Local Database Only" connected={false} />
    <SectionCard>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-[240px] flex-1"><span className="mb-1 block text-xs font-black text-muted">Issue Key</span><input className="field uppercase" value={issueViewer.issueKey} onChange={(event) => patch({ issueKey: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="PROJECT-123" /></label><button className="btn btn-primary" type="button" disabled={issueViewer.status === "loading"} onClick={() => void load()}><Search size={16} />搜尋本機資料庫 / Search Local DB</button></div>
      <p className="mt-3 text-xs font-semibold text-muted">僅查詢 Local SQLite，不會呼叫 Jira API，也不會修改資料。</p>
    </SectionCard>
    {issueViewer.status === "initial" ? <div className="mt-4 rounded-md border border-dashed border-slate-300 p-12 text-center font-bold text-muted">輸入 Issue Key 後搜尋 / Enter an issue key</div> : null}
    {issueViewer.status === "loading" ? <div className="mt-4 p-12 text-center font-bold text-muted">Loading...</div> : null}
    {issueViewer.status === "not-found" ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">{issueViewer.message}</div> : null}
    {["error", "unavailable"].includes(issueViewer.status) ? <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-5 font-bold text-rose-800"><AlertTriangle className="mr-2 inline" size={18} />{issueViewer.message}</div> : null}
    {issueViewer.status === "ready" && result ? <SectionCard className="mt-4" title={`${result.issueKey} · ${text(overview.summary)}`} subtitle={`Snapshot ${text(overview.snapshot_updated_at)}`}>
      <div className="thin-scroll mb-4 flex overflow-x-auto border-b border-line" role="tablist" aria-label="Issue Viewer sections">{ISSUE_VIEWER_TABS.map((item) => <button key={item} role="tab" aria-selected={activeTab === item} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${activeTab === item ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => patch({ activeTab: item })}>{item}</button>)}</div>
      <SectionErrorBoundary context={`issue-viewer:${activeTab}`} resetKey={`${state.database.requestId}:${result.issueKey}:${activeTab}`} safeText={result.description.plainText}>
        <div role="tabpanel" aria-label={activeTab}>
          {activeTab === "Overview" ? <DataTable headers={["Field", "Value"]} rows={overviewRows} /> : null}
          {activeTab === "Description" ? result.description.status === "ready" ? <JiraContent className="rounded-md bg-slate-50 p-4" content={result.description.content || result.description.plainText} format={result.description.format} /> : <div className="rounded-md border border-slate-300 bg-slate-50 p-6 text-center font-bold text-muted">{result.description.message}</div> : null}
          {section ? sectionState(section, activeTab) : null}
          {activeTab === "Changelog" ? <div className="space-y-3"><DateRangeControl value={issueViewer.changelogQuery.dateRange ?? { shortcut: "all", startDate: "", endDate: "" }} onChange={(dateRange) => patch({ changelogQuery: { ...issueViewer.changelogQuery, page: 1, dateRange, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 }, changelogResult: null, changelogCacheKey: "" })} label="Changelog Time / 變更時間" /><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={issueViewer.changelogQuery.descriptionChangedOnly ?? false} onChange={(event) => patch({ changelogQuery: { ...issueViewer.changelogQuery, page: 1, descriptionChangedOnly: event.currentTarget.checked, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 }, changelogResult: null, changelogCacheKey: "" })} />Description Changed Only / 僅 Description 變更</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={issueViewer.changelogQuery.includeBeforeUnavailable ?? false} onChange={(event) => patch({ changelogQuery: { ...issueViewer.changelogQuery, page: 1, includeBeforeUnavailable: event.currentTarget.checked, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 }, changelogResult: null, changelogCacheKey: "" })} />Include Before unavailable / 包含缺少 Before</label></div><ActivityComparisonTable mode="issue-changelog" tableId="issueChangelog" result={issueViewer.changelogResult ?? emptyTable} query={issueViewer.changelogQuery} loading={issueViewer.changelogStatus === "loading"} error={issueViewer.changelogMessage} preferences={preferences?.issueChangelog} onPreferencesChange={(value) => void window.desktopApp?.uiPreferences?.update({ section: "issueChangelog", value }).then((response) => { if (response) setPreferences(response.preferences); })} onQueryChange={(changelogQuery) => patch({ changelogQuery: { ...changelogQuery, revision: (issueViewer.changelogQuery.revision ?? 0) + 1 }, changelogResult: null, changelogCacheKey: "" })} sessionState={issueViewer.tableStates.issueChangelog} onSessionStateChange={(value) => setTableState("issueChangelog", value)} loadDistinct={async (field, search) => (await window.desktopApp?.databaseViewer?.distinctValues({ source: "issueChangelog", subjectId: issueViewer.loadedIssueKey, field, search, limit: 100, query: issueViewer.changelogQuery })) ?? { field, values: [], truncated: false }} /></div> : null}
          {section?.status === "ready" && activeTab === "Comments" ? <div className="space-y-3"><DateRangeControl value={issueViewer.commentsQuery.dateRange ?? { shortcut: "all", startDate: "", endDate: "" }} onChange={(dateRange) => patch({ commentsQuery: { ...issueViewer.commentsQuery, page: 1, dateRange, revision: (issueViewer.commentsQuery.revision ?? 0) + 1 }, payloadPage: 1 })} label="Comments Date / 留言日期" /><label className="block max-w-sm"><span className="mb-1 block text-xs font-black text-muted">Comment Date Mode / 留言日期模式</span><select className="field" value={issueViewer.commentsQuery.commentDateMode ?? "created"} onChange={(event) => patch({ commentsQuery: { ...issueViewer.commentsQuery, page: 1, commentDateMode: event.currentTarget.value as "created" | "updated", revision: (issueViewer.commentsQuery.revision ?? 0) + 1 }, payloadPage: 1 })}><option value="created">Created / 建立時間</option><option value="updated">Last Updated / 最後更新</option></select></label><div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-slate-50 p-3"><label className="min-w-[240px] flex-1"><span className="mb-1 block text-xs font-black text-muted">Filter current payload section</span><input className="field" value={issueViewer.payloadFilter} onChange={(event) => patch({ payloadFilter: event.currentTarget.value, payloadPage: 1 })} placeholder="Author or comment text" /></label><div className="text-xs font-bold text-muted">Filtered {filteredPayloadRecords.length.toLocaleString()} / Total {payloadRecords.length.toLocaleString()}{commentsMissingDateCount ? ` · Missing dates: ${commentsMissingDateCount}` : ""}</div></div><div className="space-y-3">{visiblePayloadRecords.map((item) => <CommentCard key={text(item.id)} comment={{ ...item, dateModeFallback: (issueViewer.commentsQuery.commentDateMode ?? "created") === "updated" && !item.updated && Boolean(item.created) }} />)}</div>{payloadPageCount > 1 ? <div className="flex items-center justify-end gap-2"><button className="btn" type="button" disabled={payloadPage <= 1} onClick={() => patch({ payloadPage: payloadPage - 1 })}>Previous</button><span className="text-xs font-bold">Page {payloadPage} / {payloadPageCount}</span><button className="btn" type="button" disabled={payloadPage >= payloadPageCount} onClick={() => patch({ payloadPage: payloadPage + 1 })}>Next</button></div> : null}</div> : null}
          {section?.status === "ready" && activeTab === "Issue Links" ? <DataTable headers={["Type", "Direction", "Issue"]} rows={section.records.map((item) => [text((item.type as Record<string, unknown> | undefined)?.name), text(item.inwardIssue ? "Inward" : "Outward"), text((item.inwardIssue as Record<string, unknown> | undefined)?.key ?? (item.outwardIssue as Record<string, unknown> | undefined)?.key)])} /> : null}
          {activeTab === "Activity Events" ? <div className="space-y-3"><DateRangeControl value={issueViewer.activityEventsQuery.dateRange ?? { shortcut: "all", startDate: "", endDate: "" }} onChange={(dateRange) => patch({ activityEventsQuery: { ...issueViewer.activityEventsQuery, page: 1, dateRange, revision: (issueViewer.activityEventsQuery.revision ?? 0) + 1 }, activityEventsResult: null, activityEventsCacheKey: "" })} label="Activity Events Time / 活動事件時間" /><div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">All local SQLite activity events for this Issue Key. No Jira request is sent.</div><ActivityComparisonTable mode="issue-events" tableId="issueActivityEvents" result={issueViewer.activityEventsResult ?? emptyTable} query={issueViewer.activityEventsQuery} loading={issueViewer.activityEventsStatus === "loading"} error={issueViewer.activityEventsMessage} preferences={preferences?.issueActivityEvents} onPreferencesChange={(value) => void window.desktopApp?.uiPreferences?.update({ section: "issueActivityEvents", value }).then((response) => { if (response) setPreferences(response.preferences); })} onQueryChange={(activityEventsQuery) => patch({ activityEventsQuery: { ...activityEventsQuery, revision: (issueViewer.activityEventsQuery.revision ?? 0) + 1 }, activityEventsResult: null, activityEventsCacheKey: "" })} sessionState={issueViewer.tableStates.issueActivityEvents} onSessionStateChange={(value) => setTableState("issueActivityEvents", value)} loadDistinct={async (field, search) => (await window.desktopApp?.databaseViewer?.distinctValues({ source: "issueEvents", subjectId: issueViewer.loadedIssueKey, field, search, limit: 100, query: issueViewer.activityEventsQuery })) ?? { field, values: [], truncated: false }} /></div> : null}
          {activeTab === "Raw Evidence" ? <div><div className="mb-3 text-xs font-bold text-muted">Schema: {result.rawEvidence.schemaVersion} · Payload Format: {text(result.rawEvidence.payloadFormatVersion)} · Saved: {text(result.rawEvidence.payloadSavedAt)}</div><pre className="thin-scroll max-h-[560px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-4 text-xs text-slate-100">{result.rawEvidence.preview}</pre>{result.rawEvidence.message ? <p className="mt-2 text-xs font-bold text-amber-700">{result.rawEvidence.message}</p> : null}</div> : null}
        </div>
      </SectionErrorBoundary>
    </SectionCard> : null}
  </div>;
}