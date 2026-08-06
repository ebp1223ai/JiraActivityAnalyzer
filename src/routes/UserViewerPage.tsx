import { useEffect, useState } from "react";
import { Activity, Database, MessageSquare, Search, UserRound, Wrench, X } from "lucide-react";
import type { UserViewerScope } from "../../shared/userViewerScope";
import { userViewerScopeKey } from "../../shared/userViewerScope";
import { ActivityComparisonTable } from "../components/ActivityComparisonTable";
import { DateRangeControl } from "../components/DateRangeControl";
import { DistributionPanel } from "../components/DistributionPanel";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { SqliteDataTable, type SqliteTableColumn } from "../components/SqliteDataTable";
import { recordTableRequest } from "../diagnostics/tableDiagnostics";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import type { ViewerProgressDto, ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import { ALL_TIME_DATE_RANGE } from "../types/dateRange";
import type { UserViewerDistributions } from "../types/databaseViewer";
import type { TablePreferences, UiPreferences, UiPreferencesUpdate } from "../types/uiPreferences";
import { formatDisplayTime } from "../utils/displayTime";
import { queryFromTablePreferences } from "../utils/preferenceQuery";
import { viewerQueryCacheKey } from "../utils/viewerSessionState";

function text(value: unknown, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

const emptyResult: ViewerTableResult = { rows: [], filteredCount: 0, totalCount: 0, page: 1, pageSize: 50, pageCount: 1 };
const issueColumns: SqliteTableColumn[] = [
  { id: "issueKey", label: "Key", kind: "text", required: true, width: 150, render: (row) => <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(text(row.issueKey, ""))}&sourcePage=users&sourceTab=Related%20Issues`}>{text(row.issueKey)}</a> },
  { id: "summary", label: "Summary", kind: "text", width: 300 },
  { id: "projectKey", label: "Project", kind: "multi", width: 120 },
  { id: "issueType", label: "Type", kind: "multi", width: 120 },
  { id: "status", label: "Status", kind: "multi", width: 130 },
  { id: "priority", label: "Priority", kind: "multi", width: 110 },
  { id: "userActivityCount", label: "Activities", kind: "number", width: 120 },
  { id: "commentCount", label: "Comments", kind: "number", width: 100 },
  { id: "fieldChangeCount", label: "Field Changes", kind: "number", width: 110 },
  { id: "firstActivity", label: "First Activity", kind: "date", width: 180, render: (row) => formatDisplayTime(row.firstActivity) },
  { id: "lastActivity", label: "Last Activity", kind: "date", width: 180, render: (row) => formatDisplayTime(row.lastActivity) }
];

let userViewerRequestSequence = 0;
let latestUserViewerRequest = 0;
let latestUserProgressRequest = "";

export function UserViewerPage() {
  const { state } = useRuntimeStatus();
  const { userViewer, setUserViewer } = useSessionState();
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);
  const [eventProgress, setEventProgress] = useState<ViewerProgressDto | null>(null);
  const databaseIdentity = state.database.sourceBinding || `database-request:${state.database.requestId}`;
  const selectedScope = userViewer.selectionScope;
  const selectedScopeKey = selectedScope ? userViewerScopeKey(selectedScope) : "";
  const selectedIds = userViewer.selectedUserIds;
  const selectedSet = new Set(selectedIds);
  const patch = (value: Partial<typeof userViewer>) => setUserViewer((current) => ({ ...current, ...value }));

  useEffect(() => window.desktopApp?.databaseViewer?.onProgress?.((progress) => {
    if (progress.requestId === latestUserProgressRequest) setEventProgress(progress.status === "completed" ? null : progress);
  }), []);

  async function loadUsers(searchOverride = userViewer.search) {
    if (!state.database.canRead) return;
    const requestId = ++userViewerRequestSequence;
    latestUserViewerRequest = requestId;
    const startedAt = performance.now();
    const query = { page: 1, pageSize: 100, filters: searchOverride ? { userSearch: { present: true, length: searchOverride.length } } : {} };
    recordTableRequest("started", { requestId, tableId: "userList", query, startedAt });
    patch({ databaseIdentity, pendingRequestId: requestId, status: "loading", message: "" });
    try {
      const result = await window.desktopApp?.databaseViewer?.listUsers({ search: searchOverride, limit: 100, offset: 0 });
      if (requestId !== latestUserViewerRequest) return recordTableRequest("stale", { requestId, tableId: "userList", query, startedAt });
      recordTableRequest("completed", { requestId, tableId: "userList", query, startedAt, resultCount: result?.items.length ?? 0 });
      setUserViewer((current) => current.pendingRequestId === requestId ? { ...current, users: result?.items ?? [], status: "ready" } : current);
    } catch (error) {
      recordTableRequest("failed", { requestId, tableId: "userList", query, startedAt, error });
      if (requestId === latestUserViewerRequest) setUserViewer((current) => current.pendingRequestId === requestId ? { ...current, message: error instanceof Error ? error.message : String(error), status: "error" } : current);
    }
  }

  async function queryTab(scope: UserViewerScope, tab = userViewer.activeTab, queryOverride?: ViewerTableQuery) {
    const query = queryOverride ?? (tab === "Related Issues" ? userViewer.relatedQuery : userViewer.eventQuery);
    const tableId = tab === "Related Issues" ? "userRelatedIssues" : "userAllActivityEvents";
    const scopeKey = userViewerScopeKey(scope);
    const cacheKey = viewerQueryCacheKey(databaseIdentity, scopeKey, tableId, query);
    const cachedResult = tab === "Related Issues" ? userViewer.relatedResult : userViewer.allEventsResult;
    const cachedKey = tab === "Related Issues" ? userViewer.relatedCacheKey : userViewer.eventCacheKey;
    if (userViewer.loadedScopeKey === scopeKey && cachedResult && cachedKey === cacheKey) {
      patch({ selectionScope: scope, activeTab: tab, status: "ready", message: "" });
      return;
    }
    const requestId = ++userViewerRequestSequence;
    const progressRequestId = `user-events-${requestId}-${Date.now()}`;
    latestUserViewerRequest = requestId;
    if (tab !== "Related Issues") { latestUserProgressRequest = progressRequestId; setEventProgress({ requestId: progressRequestId, status: "filtering", scanned: 0, total: null, matched: 0, percentage: null, elapsedMs: 0, batchSize: 100, checkpoint: "" }); }
    const startedAt = performance.now();
    recordTableRequest("started", { requestId, tableId, query: { ...query, scope: scope.kind }, startedAt });
    setUserViewer((current) => {
      const changingScope = current.loadedScopeKey !== scopeKey;
      return { ...current, selectionScope: scope, databaseIdentity, activeTab: tab, status: "loading", message: "", pendingRequestId: requestId,
        ...(changingScope ? { loadedScopeKey: "", detail: null, distributions: null, relatedResult: null, allEventsResult: null, relatedCacheKey: "", eventCacheKey: "", tableStates: {} } : {}) };
    });
    try {
      const oneUserId = scope.kind === "selected-users" && scope.userIds.length === 1 ? scope.userIds[0] : "";
      const detailPromise = oneUserId ? window.desktopApp?.databaseViewer?.getUser({ userId: oneUserId, limit: 1, offset: 0 }) : Promise.resolve(null);
      const resultPromise = tab === "Related Issues" ? window.desktopApp?.databaseViewer?.userRelatedIssues({ scope, query }) : window.desktopApp?.databaseViewer?.userEvents({ requestId: progressRequestId, scope, query });
      const distributionQuery = tab === "Related Issues" ? query : { ...userViewer.relatedQuery, dateRange: query.dateRange };
      const distributionPromise = window.desktopApp?.databaseViewer?.userDistributions({ scope, query: distributionQuery });
      const [detail, result, distributions] = await Promise.all([detailPromise, resultPromise, distributionPromise]);
      if (requestId !== latestUserViewerRequest) return recordTableRequest("stale", { requestId, tableId, query: { ...query, scope: scope.kind }, startedAt });
      recordTableRequest("completed", { requestId, tableId, query: { ...query, scope: scope.kind }, startedAt, resultCount: result?.rows.length ?? 0 });
      if (tab !== "Related Issues") setEventProgress(null);
      setUserViewer((current) => current.pendingRequestId !== requestId ? current : { ...current, detail: detail ?? null,
        distributions: (distributions ?? current.distributions) as UserViewerDistributions | null, loadedScopeKey: scopeKey,
        ...(tab === "Related Issues" ? { relatedResult: result ?? emptyResult, relatedCacheKey: cacheKey } : { allEventsResult: result ?? emptyResult, eventCacheKey: cacheKey }), status: "ready" });
    } catch (error) {
      recordTableRequest("failed", { requestId, tableId, query: { ...query, scope: scope.kind }, startedAt, error });
      if (requestId === latestUserViewerRequest) { const message = error instanceof Error ? error.message : String(error); const cancelled = /CANCELLED|SUPERSEDED/.test(message); if (tab !== "Related Issues") setEventProgress(null); setUserViewer((current) => current.pendingRequestId === requestId ? { ...current, message: cancelled ? "Filtering cancelled." : message, status: cancelled && current.allEventsResult ? "ready" : "error" } : current); }
    }
  }

  async function saveTablePreferences(section: UiPreferencesUpdate["section"], value: TablePreferences) {
    const response = await window.desktopApp?.uiPreferences?.update({ section, value });
    if (response) setPreferences(response.preferences);
  }

  async function saveSelection(scopeMode: "selected" | "all", userIds: string[]) {
    const current = preferences?.userAllActivityEvents;
    if (!current) return;
    await saveTablePreferences("userAllActivityEvents", { ...current, userScopeMode: scopeMode, selectedUserIds: userIds });
  }

  function activateSelection(nextIds: string[], details = userViewer.selectedUserDetails) {
    const unique = Array.from(new Set(nextIds));
    patch({ scopeMode: "selected", selectedUserIds: unique, selectedUserDetails: details.filter((item) => unique.includes(text(item.userId, ""))) });
    void saveSelection("selected", unique);
    if (!unique.length) {
      latestUserViewerRequest = ++userViewerRequestSequence;
      patch({ selectionScope: null, loadedScopeKey: "", detail: null, distributions: null, relatedResult: null, allEventsResult: null });
      return;
    }
    void queryTab({ kind: "selected-users", userIds: unique });
  }

  function toggleUser(user: Record<string, unknown>) {
    const userId = text(user.userId, "");
    if (!userId) return;
    if (selectedSet.has(userId)) return activateSelection(selectedIds.filter((id) => id !== userId));
    const detailMap = new Map(userViewer.selectedUserDetails.map((item) => [text(item.userId, ""), item]));
    detailMap.set(userId, user);
    activateSelection([...selectedIds, userId], Array.from(detailMap.values()));
  }

  function setScopeMode(mode: "selected" | "all") {
    patch({ scopeMode: mode });
    void saveSelection(mode, selectedIds);
    if (mode === "all") void queryTab({ kind: "all" });
    else if (selectedIds.length) void queryTab({ kind: "selected-users", userIds: selectedIds });
    else patch({ selectionScope: null, distributions: null, relatedResult: null, allEventsResult: null });
  }

  useEffect(() => {
    if (!state.database.canRead) return;
    if (userViewer.databaseIdentity && userViewer.databaseIdentity !== databaseIdentity) {
      latestUserViewerRequest = ++userViewerRequestSequence;
      setUserViewer((current) => ({ ...current, databaseIdentity, selectionScope: null, loadedScopeKey: "", users: [], detail: null, distributions: null, relatedResult: null, allEventsResult: null, relatedCacheKey: "", eventCacheKey: "", tableStates: {}, status: "initial", message: "" }));
      void loadUsers();
      return;
    }
    if (!userViewer.databaseIdentity) patch({ databaseIdentity });
    if (!userViewer.users.length && userViewer.status !== "loading") void loadUsers();
  }, [state.database.canRead, databaseIdentity]);

  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then(async (response) => {
      if (!response) return;
      setPreferences(response.preferences);
      const relatedQuery = queryFromTablePreferences(userViewer.relatedQuery, response.preferences.userRelatedIssues);
      const eventQuery = queryFromTablePreferences(userViewer.eventQuery, response.preferences.userAllActivityEvents);
      const saved = response.preferences.userAllActivityEvents;
      const savedIds = saved.selectedUserIds ?? [];
      let restoredDetails: Array<Record<string, unknown>> = [];
      if (state.database.canRead && savedIds.length) {
        const restored = await window.desktopApp?.databaseViewer?.listUsers({ userIds: savedIds, limit: savedIds.length, offset: 0 });
        restoredDetails = restored?.items ?? [];
      }
      const validIds = restoredDetails.map((item) => text(item.userId, "")).filter(Boolean);
      const scopeMode = saved.userScopeMode === "all" ? "all" : "selected";
      const scope: UserViewerScope | null = scopeMode === "all" ? { kind: "all" } : validIds.length ? { kind: "selected-users", userIds: validIds } : null;
      setUserViewer((current) => ({ ...current, relatedQuery: current.relatedResult ? current.relatedQuery : relatedQuery,
        eventQuery: current.allEventsResult ? current.eventQuery : eventQuery, scopeMode, selectedUserIds: validIds, selectedUserDetails: restoredDetails }));
      if (scope) void queryTab(scope, userViewer.activeTab, userViewer.activeTab === "Related Issues" ? relatedQuery : eventQuery);
    });
  }, []);

  if (!state.database.canRead) return <div><PageHeader title="使用者檢視" subtitle="User Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;

  const summary = (userViewer.detail?.summary ?? {}) as Record<string, unknown>;
  const activeResult = userViewer.activeTab === "Related Issues" ? userViewer.relatedResult : userViewer.allEventsResult;
  const activeQuery = userViewer.activeTab === "Related Issues" ? userViewer.relatedQuery : userViewer.eventQuery;
  const distributions = userViewer.distributions;
  const allUsers = selectedScope?.kind === "all";
  const selectedNames = userViewer.selectedUserDetails.map((item) => text(item.displayName, text(item.userId))).slice(0, 3);
  const scopeTitle = allUsers ? "All Users / 全部使用者" : selectedIds.length === 1 ? text(summary.displayName, selectedNames[0] ?? "Unknown user") : `${selectedIds.length} Selected Users / 已選使用者`;
  const scopeSubtitle = allUsers ? "Database-wide scope; stable account identities are preserved" : "Union scope by Stable User ID; duplicate events and issues are counted once in overall totals";

  function updateQuery(query: ViewerTableQuery) {
    if (!selectedScope) return;
    const next = { ...query, revision: (activeQuery.revision ?? 0) + 1 };
    patch(userViewer.activeTab === "Related Issues" ? { relatedQuery: next } : { eventQuery: next });
    void queryTab(selectedScope, userViewer.activeTab, next);
  }

  function updateDateRange(dateRange: NonNullable<ViewerTableQuery["dateRange"]>) {
    const revision = Math.max(userViewer.relatedQuery.revision ?? 0, userViewer.eventQuery.revision ?? 0) + 1;
    const relatedQuery = { ...userViewer.relatedQuery, page: 1, dateRange, revision };
    const eventQuery = { ...userViewer.eventQuery, page: 1, dateRange, revision };
    patch({ relatedQuery, eventQuery, relatedResult: null, allEventsResult: null, relatedCacheKey: "", eventCacheKey: "" });
    if (selectedScope) void queryTab(selectedScope, userViewer.activeTab, userViewer.activeTab === "Related Issues" ? relatedQuery : eventQuery);
  }

  function applyDistributionFilter(field: "projectKey" | "issueType" | "status" | "priority", value: string) {
    if (!selectedScope) return;
    const query: ViewerTableQuery = { ...userViewer.relatedQuery, page: 1, filters: { ...userViewer.relatedQuery.filters, [field]: { values: [value] } }, revision: (userViewer.relatedQuery.revision ?? 0) + 1 };
    patch({ relatedQuery: query, activeTab: "Related Issues" });
    void queryTab(selectedScope, "Related Issues", query);
  }

  const preferenceSection = userViewer.activeTab === "Related Issues" ? "userRelatedIssues" : "userAllActivityEvents";
  return <div className="min-w-0">
    <PageHeader title="使用者檢視" subtitle="User Viewer / Local Database / Read Only" connected={false} />
    <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">All queries run against local SQLite. Users are matched by Stable User ID, never by display name. No Jira request or database write is performed.</div>
    <SectionCard title="使用者範圍" subtitle="User Scope">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-white p-1" role="group" aria-label="User scope mode">
          <button className={`btn border-0 ${userViewer.scopeMode === "selected" ? "bg-blue-600 text-white" : ""}`} type="button" onClick={() => setScopeMode("selected")}>Selected Users / 已選使用者</button>
          <button className={`btn border-0 ${userViewer.scopeMode === "all" ? "bg-blue-600 text-white" : ""}`} type="button" onClick={() => setScopeMode("all")}>All Users / 全部使用者</button>
        </div>
        <span className="text-xs font-bold text-muted">{selectedIds.length.toLocaleString()} selected</span>
      </div>
      {userViewer.scopeMode === "selected" ? <>
        <div className="flex flex-wrap gap-2"><label className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-3 text-muted" size={16} /><input className="field pl-9" value={userViewer.search} onCompositionStart={() => patch({ searchComposing: true })} onCompositionEnd={(event) => { patch({ searchComposing: false, search: event.currentTarget.value }); }} onChange={(event) => patch({ search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !userViewer.searchComposing && !event.nativeEvent.isComposing) void loadUsers(); }} placeholder="Display Name / Username / Stable User ID" /></label><button className="btn" type="button" onClick={() => void loadUsers()}><Search size={15} />Search / 搜尋</button></div>
        {selectedIds.length ? <div className="thin-scroll mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-md border border-line bg-slate-50 p-2">{selectedIds.map((userId) => { const detail = userViewer.selectedUserDetails.find((item) => text(item.userId, "") === userId); return <span key={userId} className="inline-flex max-w-full items-center gap-2 rounded border border-blue-200 bg-white px-2 py-1 text-xs font-bold"><span className="max-w-[260px] truncate" title={userId}>{text(detail?.displayName, userId)}</span><button className="icon-btn !h-5 !w-5" type="button" title="Remove selected user" onClick={() => activateSelection(selectedIds.filter((id) => id !== userId))}><X size={12} /></button></span>; })}<button className="btn !py-1 text-xs" type="button" onClick={() => activateSelection([])}>Clear Selected / 清除選取</button></div> : null}
        <div className="thin-scroll mt-3 grid max-h-72 grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2 overflow-y-auto pr-1">
          {userViewer.users.map((user) => { const userId = text(user.userId, ""); const checked = selectedSet.has(userId); return <label key={userId} className={`min-w-0 cursor-pointer rounded-md border p-3 ${checked ? "border-blue-400 bg-blue-50" : "border-line bg-white"}`}><div className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={checked} onChange={() => toggleUser(user)} /><div className="min-w-0"><div className="break-words font-black">{text(user.displayName, "Unknown display name")}</div><div className="truncate text-xs font-semibold text-muted" title={userId}>{userId}</div><div className="mt-2 text-xs font-bold text-blue-700">{text(user.totalIssues, "0")} issues / {text(user.totalEvents, "0")} events</div></div></div></label>; })}
        </div>
      </> : <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm font-semibold">All stable account identities in the selected local database are included. The selected-user list is preserved when you switch back.</div>}
    </SectionCard>

    {!selectedScope ? <SectionCard className="mt-4"><div className="py-16 text-center"><UserRound className="mx-auto mb-3 text-slate-300" size={42} /><b>Select one or more users / 請選擇至少一位使用者</b></div></SectionCard> : <>
      <SectionCard className="mt-4" title={scopeTitle} subtitle={scopeSubtitle}><div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3"><div><b>Earliest: </b>{formatDisplayTime(distributions?.earliestEvent || summary.earliestEvent)}</div><div><b>Latest: </b>{formatDisplayTime(distributions?.latestEvent || summary.latestEvent)}</div><div className="break-all"><b>Database: </b>{state.database.sourceBinding || "Unavailable"}</div></div></SectionCard>
      <SectionCard className="mt-4" title="Selected Period" subtitle="Applied to SQLite eventTime"><DateRangeControl value={activeQuery.dateRange ?? ALL_TIME_DATE_RANGE} onChange={updateDateRange} /></SectionCard>
      <ResponsiveMetricGrid min={170} className="mt-4">
        <MetricCard label="相關 Issue" sub="Distinct Related Issues" value={text(distributions?.totalRelatedIssues, "0")} icon={Database} />
        <MetricCard label="活動事件" sub="Activity Events" value={text(distributions?.totalEvents, "0")} icon={Activity} />
        <MetricCard label="留言" sub="Comments" value={text(distributions?.comments, "0")} icon={MessageSquare} />
        <MetricCard label="欄位變更" sub="Field Changes" value={text(distributions?.fieldChanges, "0")} icon={Wrench} />
      </ResponsiveMetricGrid>
      {!allUsers && (distributions?.comparison.length ?? 0) > 1 ? <SectionCard className="mt-4" title="使用者比較" subtitle="Per-user Comparison"><div className="thin-scroll max-w-full overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>User / 使用者</th><th>Stable User ID</th><th>Events</th><th>Distinct Issues</th><th>First Activity</th><th>Last Activity</th></tr></thead><tbody>{distributions!.comparison.map((item) => <tr key={item.userId}><td>{item.displayName || "Unknown"}</td><td className="max-w-[220px] truncate" title={item.userId}>{item.userId}</td><td>{item.eventCount.toLocaleString()}</td><td>{item.distinctRelatedIssues.toLocaleString()}</td><td>{formatDisplayTime(item.firstEvent)}</td><td>{formatDisplayTime(item.lastEvent)}</td></tr>)}</tbody></table></div></SectionCard> : null}
      <SectionCard className="mt-4" title="Related Issue Distributions" subtitle={`${distributions?.totalRelatedIssues ?? 0} distinct issues / ${allUsers ? "All Users" : "Selected Users union"}`}><div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{([["Project","projectKey",distributions?.projectKey ?? []],["Issue Type","issueType",distributions?.issueType ?? []],["Status","status",distributions?.status ?? []],["Priority","priority",distributions?.priority ?? []]] as const).map(([label, field, items]) => <DistributionPanel key={field} title={label} subtitle={`${distributions?.totalRelatedIssues ?? 0} related issues`} total={distributions?.totalRelatedIssues ?? 0} items={items} onSelect={(value) => applyDistributionFilter(field, value)} />)}</div></SectionCard>
      <SectionCard className="mt-4">
        <div className="mb-4 flex max-w-full overflow-x-auto border-b border-line" role="tablist">{(["Related Issues", "All Activity Events"] as const).map((tab) => <button key={tab} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${userViewer.activeTab === tab ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => void queryTab(selectedScope, tab)}>{tab}</button>)}</div>
        {userViewer.activeTab === "All Activity Events" ? <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold">Local SQLite activity events for {scopeTitle}. Actor identity remains visible on every row.</div> : null}
        <SectionErrorBoundary context={`user-viewer:${userViewer.activeTab}`} resetKey={`${state.database.requestId}:${selectedScopeKey}:${userViewer.activeTab}`}>
          {userViewer.activeTab === "Related Issues" ? <SqliteDataTable tableId="userRelatedIssues" columns={issueColumns} result={activeResult ?? emptyResult} query={activeQuery} loading={userViewer.status === "loading"} error={userViewer.status === "error" ? userViewer.message : ""} preferences={preferences?.userRelatedIssues} onPreferencesChange={(value) => void saveTablePreferences("userRelatedIssues", value)} onQueryChange={updateQuery} sessionState={userViewer.tableStates.userRelatedIssues} onSessionStateChange={(value) => setUserViewer((current) => ({ ...current, tableStates: { ...current.tableStates, userRelatedIssues: value } }))} loadDistinct={(field, search) => window.desktopApp!.databaseViewer!.distinctValues({ source: "userRelatedIssues", scope: selectedScope, field, search, limit: 200, query: activeQuery })} /> : <ActivityComparisonTable mode="user-events" tableId="userAllActivityEvents" result={activeResult ?? emptyResult} query={activeQuery} loading={userViewer.status === "loading"} error={userViewer.status === "error" ? userViewer.message : ""} progress={eventProgress} onCancel={() => void window.desktopApp?.databaseViewer?.cancel({ requestId: latestUserProgressRequest, target: "user-events" })} preferences={preferences?.userAllActivityEvents} onPreferencesChange={(value) => void saveTablePreferences("userAllActivityEvents", value)} onQueryChange={updateQuery} sessionState={userViewer.tableStates.userAllActivityEvents} onSessionStateChange={(value) => setUserViewer((current) => ({ ...current, tableStates: { ...current.tableStates, userAllActivityEvents: value } }))} loadDistinct={(field, search) => window.desktopApp!.databaseViewer!.distinctValues({ source: "userEvents", scope: selectedScope, field, search, limit: 200, query: activeQuery })} />}
        </SectionErrorBoundary>
      </SectionCard>
    </>}
  </div>;
}
