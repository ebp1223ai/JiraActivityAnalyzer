import { useEffect, useState } from "react";
import { Activity, Database, MessageSquare, Search, UserRound, Wrench } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { DistributionPanel } from "../components/DistributionPanel";
import { DiffCell } from "../components/DiffCell";
import { ReadableContentCell } from "../components/ReadableContentCell";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { SqliteDataTable, type SqliteTableColumn } from "../components/SqliteDataTable";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import type { ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { UserViewerDistributions } from "../types/databaseViewer";
import type { TablePreferences, UiPreferences, UiPreferencesUpdate } from "../types/uiPreferences";
import { activityEventAfter, activityEventBefore, formatActivityActor, formatActivityEventType, formatActivityEventValue, formatActivitySource } from "../utils/activityEventDisplay";
import { formatDisplayTime } from "../utils/displayTime";
import { queryFromTablePreferences } from "../utils/preferenceQuery";
import { viewerQueryCacheKey } from "../utils/viewerSessionState";
import { recordTableRequest } from "../diagnostics/tableDiagnostics";

function text(value: unknown, fallback = "—") {
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
  { id: "userActivityCount", label: "User Activities", kind: "number", width: 120 },
  { id: "commentCount", label: "Comments", kind: "number", width: 100 },
  { id: "fieldChangeCount", label: "Field Changes", kind: "number", width: 110 },
  { id: "firstActivity", label: "First Activity", kind: "date", width: 180, render: (row) => formatDisplayTime(row.firstActivity) },
  { id: "lastActivity", label: "Last Activity", kind: "date", width: 180, render: (row) => formatDisplayTime(row.lastActivity) }
];
const eventColumns: SqliteTableColumn[] = [
  { id: "eventTime", label: "Time", kind: "date", required: true, width: 170, minWidth: 150, maxWidth: 240, render: (row) => <span className="whitespace-nowrap">{formatDisplayTime(row.eventTime)}</span> },
  { id: "issueKey", label: "Issue Key", kind: "text", required: true, width: 150, render: (row) => <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(text(row.issueKey, ""))}&sourcePage=users`}>{text(row.issueKey)}</a> },
  { id: "eventType", queryField: "action", label: "Action", kind: "multi", required: true, width: 140, render: (row) => formatActivityEventType(row.eventType) },
  { id: "displayName", queryField: "actor", label: "Actor", kind: "multi", width: 180, render: (row) => formatActivityActor(row) },
  { id: "fieldName", queryField: "field", label: "Field", kind: "multi", width: 180, render: (row) => formatActivityEventValue(row.fieldName, "Not applicable") },
  { id: "before", label: "Before", kind: "text", defaultVisible: false, width: 320, render: (row) => <ReadableContentCell value={activityEventBefore(row)} missing="No previous value" /> },
  { id: "after", label: "After", kind: "text", defaultVisible: false, width: 320, render: (row) => <ReadableContentCell value={row.commentBody ?? activityEventAfter(row)} formatHint={String(row.commentBodyFormat ?? "")} /> },
  { id: "diff", label: "Diff", kind: "text", width: 400, render: (row, context) => <DiffCell row={row} expanded={context.expanded} onExpandedChange={context.setExpanded} /> },
  { id: "sourceProvenance", queryField: "source", label: "Source", kind: "multi", width: 140, render: (row) => formatActivitySource(row.sourceProvenance) }
];

let userViewerRequestSequence = 0;
let latestUserViewerRequest = 0;
export function UserViewerPage() {
  const { state } = useRuntimeStatus();
  const { userViewer, setUserViewer } = useSessionState();
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);
  const databaseIdentity = state.database.sourceBinding || `database-request:${state.database.requestId}`;
  const patch = (value: Partial<typeof userViewer>) => setUserViewer((current) => ({ ...current, ...value }));

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
      if (requestId !== latestUserViewerRequest) {
        recordTableRequest("stale", { requestId, tableId: "userList", query, startedAt });
        return;
      }
      recordTableRequest("completed", { requestId, tableId: "userList", query, startedAt, resultCount: result?.items.length ?? 0 });
      setUserViewer((current) => current.pendingRequestId === requestId ? { ...current, users: result?.items ?? [], status: "ready" } : current);
    } catch (reason) {
      recordTableRequest("failed", { requestId, tableId: "userList", query, startedAt, error: reason });
      if (requestId === latestUserViewerRequest) setUserViewer((current) => current.pendingRequestId === requestId ? { ...current, message: reason instanceof Error ? reason.message : String(reason), status: "error" } : current);
    }
  }

  async function queryTab(userId: string, tab = userViewer.activeTab, queryOverride?: ViewerTableQuery) {
    const query = queryOverride ?? (tab === "Related Issues" ? userViewer.relatedQuery : userViewer.eventQuery);
    const tableId = tab === "Related Issues" ? "userRelatedIssues" : "userAllActivityEvents";
    const cacheKey = viewerQueryCacheKey(databaseIdentity, userId, tableId, query);
    const cachedResult = tab === "Related Issues" ? userViewer.relatedResult : userViewer.allEventsResult;
    const cachedKey = tab === "Related Issues" ? userViewer.relatedCacheKey : userViewer.eventCacheKey;
    if (userViewer.loadedUserId === userId && cachedResult && cachedKey === cacheKey) {
      patch({ selectedUserId: userId, activeTab: tab, status: "ready", message: "" });
      return;
    }

    const requestId = ++userViewerRequestSequence;
    latestUserViewerRequest = requestId;
    const startedAt = performance.now();
    recordTableRequest("started", { requestId, tableId, query, startedAt });
    setUserViewer((current) => {
      const changingUser = current.loadedUserId !== userId;
      return {
        ...current,
        selectedUserId: userId,
        databaseIdentity,
        activeTab: tab,
        status: "loading",
        message: "",
        pendingRequestId: requestId,
        ...(changingUser ? {
          loadedUserId: "",
          detail: null,
          distributions: null,
          relatedResult: null,
          allEventsResult: null,
          relatedCacheKey: "",
          eventCacheKey: "",
          tableStates: {}
        } : {})
      };
    });
    try {
      const detailPromise = window.desktopApp?.databaseViewer?.getUser({ userId, limit: 1, offset: 0 });
      const resultPromise = tab === "Related Issues" ? window.desktopApp?.databaseViewer?.userRelatedIssues({ userId, query }) : window.desktopApp?.databaseViewer?.userEvents({ userId, query });
      const distributionPromise = window.desktopApp?.databaseViewer?.userDistributions({ userId });
      const [detail, result, distributions] = await Promise.all([detailPromise, resultPromise, distributionPromise]);
      if (requestId !== latestUserViewerRequest) {
        recordTableRequest("stale", { requestId, tableId, query, startedAt });
        return;
      }
      recordTableRequest("completed", { requestId, tableId, query, startedAt, resultCount: result?.rows.length ?? 0 });
      setUserViewer((current) => current.pendingRequestId !== requestId ? current : {
        ...current,
        detail: detail ?? null,
        distributions: (distributions ?? current.distributions) as UserViewerDistributions | null,
        loadedUserId: userId,
        ...(tab === "Related Issues" ? { relatedResult: result ?? emptyResult, relatedCacheKey: cacheKey } : { allEventsResult: result ?? emptyResult, eventCacheKey: cacheKey }),
        status: "ready"
      });
    } catch (reason) {
      recordTableRequest("failed", { requestId, tableId, query, startedAt, error: reason });
      if (requestId === latestUserViewerRequest) setUserViewer((current) => current.pendingRequestId === requestId ? { ...current, message: reason instanceof Error ? reason.message : String(reason), status: "error" } : current);
    }
  }

  useEffect(() => {
    if (!state.database.canRead) return;
    if (userViewer.databaseIdentity && userViewer.databaseIdentity !== databaseIdentity) {
      latestUserViewerRequest = ++userViewerRequestSequence;
      setUserViewer((current) => ({
        ...current,
        databaseIdentity,
        selectedUserId: "",
        loadedUserId: "",
        users: [],
        detail: null,
        distributions: null,
        relatedResult: null,
        allEventsResult: null,
        relatedCacheKey: "",
        eventCacheKey: "",
        tableStates: {},
        status: "initial",
        message: ""
      }));
      void loadUsers();
      return;
    }
    if (!userViewer.databaseIdentity) patch({ databaseIdentity });
    if (!userViewer.users.length && userViewer.status !== "loading") void loadUsers();
  }, [state.database.canRead, databaseIdentity]);

  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((response) => {
      if (!response) return;
      setPreferences(response.preferences);
      setUserViewer((current) => ({
        ...current,
        relatedQuery: current.relatedResult ? current.relatedQuery : queryFromTablePreferences(current.relatedQuery, response.preferences.userRelatedIssues),
        eventQuery: current.allEventsResult ? current.eventQuery : queryFromTablePreferences(current.eventQuery, response.preferences.userAllActivityEvents)
      }));
    });
  }, []);
  if (!state.database.canRead) {
    return <div><PageHeader title="使用者檢視" subtitle="User Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  const summary = (userViewer.detail?.summary ?? {}) as Record<string, unknown>;
  const activeResult = userViewer.activeTab === "Related Issues" ? userViewer.relatedResult : userViewer.allEventsResult;
  const activeQuery = userViewer.activeTab === "Related Issues" ? userViewer.relatedQuery : userViewer.eventQuery;
  const distributions = userViewer.distributions;

  function updateQuery(query: ViewerTableQuery) {
    if (!userViewer.selectedUserId) return;
    patch(userViewer.activeTab === "Related Issues" ? { relatedQuery: query } : { eventQuery: query });
    void queryTab(userViewer.selectedUserId, userViewer.activeTab, query);
  }

  async function saveTablePreferences(section: UiPreferencesUpdate["section"], value: TablePreferences) {
    const response = await window.desktopApp?.uiPreferences?.update({ section, value });
    if (response) setPreferences(response.preferences);
  }

  const preferenceSection = userViewer.activeTab === "Related Issues" ? "userRelatedIssues" : "userAllActivityEvents";

  function applyDistributionFilter(field: "projectKey" | "issueType" | "status" | "priority", value: string) {
    if (!userViewer.selectedUserId) return;
    const query: ViewerTableQuery = {
      ...userViewer.relatedQuery,
      page: 1,
      filters: { ...userViewer.relatedQuery.filters, [field]: { values: [value] } }
    };
    patch({ relatedQuery: query });
    void queryTab(userViewer.selectedUserId, "Related Issues", query);
  }
  return (
    <div className="min-w-0">
      <PageHeader title="使用者檢視" subtitle="User Viewer · Local Database / Read Only" connected={false} />
      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
        Stable User ID 是活動關聯主鍵；Display Name 只用於搜尋與顯示，不會合併同名使用者。Viewer 不呼叫 Jira API。
      </div>
      <SectionCard title="選擇使用者" subtitle="Select User">
        <div className="flex flex-wrap gap-2"><label className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-3 text-muted" size={16} /><input className="field pl-9" value={userViewer.search} onChange={(event) => patch({ search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void loadUsers(); }} placeholder="Display Name / Username / Stable User ID" /></label><button className="btn" type="button" onClick={() => void loadUsers()}><Search size={15} />搜尋</button></div>
        <div className="thin-scroll mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">{userViewer.users.map((user) => <button key={text(user.userId)} className={`min-w-[250px] rounded-md border p-3 text-left ${userViewer.selectedUserId === user.userId ? "border-blue-400 bg-blue-50" : "border-line bg-white"}`} type="button" onClick={() => void queryTab(text(user.userId))}><div className="font-black">{text(user.displayName, "Unknown display name")}</div><div className="truncate text-xs font-semibold text-muted" title={text(user.userId)}>{text(user.userId)}</div><div className="mt-2 text-xs font-bold text-blue-700">{text(user.totalIssues, "0")} issues / {text(user.totalEvents, "0")} events</div></button>)}</div>
      </SectionCard>

      {!userViewer.selectedUserId ? <SectionCard className="mt-4"><div className="py-16 text-center"><UserRound className="mx-auto mb-3 text-slate-300" size={42} /><b>選擇一位使用者 / Select a user</b></div></SectionCard> : <>
        <SectionCard className="mt-4" title={text(summary.displayName, "Unknown user")} subtitle={`Stable User ID · ${text(summary.userId)}`}>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3"><div><b>Earliest：</b>{formatDisplayTime(summary.earliestEvent)}</div><div><b>Latest：</b>{formatDisplayTime(summary.latestEvent)}</div><div className="break-all"><b>Database：</b>{state.database.sourceBinding || "Unavailable"}</div></div>
        </SectionCard>
        <ResponsiveMetricGrid min={170} className="mt-4">
          <MetricCard label="相關 Issue" sub="Related Issues" value={text(summary.totalIssues, "0")} icon={Database} />
          <MetricCard label="全部事件" sub="All Activity Events" value={text(summary.totalEvents, "0")} icon={UserRound} />
          <MetricCard label="留言" sub="Comments" value={text(summary.comments, "0")} icon={MessageSquare} />
          <MetricCard label="欄位變更" sub="Field Changes" value={text(summary.fieldChanges, "0")} icon={Wrench} />
        </ResponsiveMetricGrid>
        <SectionCard className="mt-4" title="Related Issue Distributions" subtitle={`${distributions?.totalRelatedIssues ?? 0} distinct issues / Unknown values are explicit`}>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {([["Project", "projectKey", distributions?.projectKey ?? []], ["Issue Type", "issueType", distributions?.issueType ?? []], ["Status", "status", distributions?.status ?? []], ["Priority", "priority", distributions?.priority ?? []]] as const).map(([label, field, items]) => <DistributionPanel key={field} title={label} subtitle={`${distributions?.totalRelatedIssues ?? 0} related issues`} total={distributions?.totalRelatedIssues ?? 0} items={items} onSelect={(value) => applyDistributionFilter(field, value)} />)}
          </div>
        </SectionCard>        <SectionCard className="mt-4">
          <div className="mb-4 flex max-w-full overflow-x-auto border-b border-line" role="tablist">
            {(["Related Issues", "All Activity Events"] as const).map((tab) => <button key={tab} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${userViewer.activeTab === tab ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => void queryTab(userViewer.selectedUserId, tab)}>{tab}</button>)}
          </div>
          {userViewer.activeTab === "All Activity Events" ? <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold">All local SQLite activity events for this Stable User ID. Includes Issue Key, readable event details, and source.</div> : null}
          <SectionErrorBoundary context={`user-viewer:${userViewer.activeTab}`} resetKey={`${state.database.requestId}:${userViewer.selectedUserId}:${userViewer.activeTab}`}>
          <SqliteDataTable
            tableId={userViewer.activeTab === "Related Issues" ? "userRelatedIssues" : "userAllActivityEvents"}
            columns={userViewer.activeTab === "Related Issues" ? issueColumns : eventColumns}
            result={activeResult ?? emptyResult}
            query={activeQuery}
            loading={userViewer.status === "loading"}
            error={userViewer.status === "error" ? userViewer.message : ""}
            preferences={preferences?.[preferenceSection]}
            onPreferencesChange={(value) => void saveTablePreferences(preferenceSection, value)}
            onQueryChange={updateQuery}
            sessionState={userViewer.tableStates[preferenceSection]}
            onSessionStateChange={(value) => setUserViewer((current) => ({ ...current, tableStates: { ...current.tableStates, [preferenceSection]: value } }))}
            loadDistinct={(field, search) => window.desktopApp!.databaseViewer!.distinctValues({
              source: userViewer.activeTab === "Related Issues" ? "userRelatedIssues" : "userEvents",
              subjectId: userViewer.selectedUserId,
              field,
              search,
              limit: 200
            })}
          />
          </SectionErrorBoundary>
        </SectionCard>
      </>}
    </div>
  );
}
