import { useEffect, useRef, useState } from "react";
import { Activity, Database, MessageSquare, Search, UserRound, Wrench } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { SqliteDataTable, type SqliteTableColumn } from "../components/SqliteDataTable";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import type { ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { TablePreferences, UiPreferences, UiPreferencesUpdate } from "../types/uiPreferences";

function text(value: unknown, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

const emptyResult: ViewerTableResult = { rows: [], filteredCount: 0, totalCount: 0, page: 1, pageSize: 50, pageCount: 1 };
const issueColumns: SqliteTableColumn[] = [
  { id: "issueKey", label: "Key", kind: "text", width: 130, render: (row) => <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(text(row.issueKey, ""))}&sourcePage=users&sourceTab=Related%20Issues`}>{text(row.issueKey)}</a> },
  { id: "summary", label: "Summary", kind: "text", width: 300 },
  { id: "projectKey", label: "Project", kind: "multi", width: 120 },
  { id: "issueType", label: "Type", kind: "multi", width: 120 },
  { id: "status", label: "Status", kind: "multi", width: 130 },
  { id: "priority", label: "Priority", kind: "multi", width: 110 },
  { id: "userActivityCount", label: "User Activities", kind: "number", width: 120 },
  { id: "commentCount", label: "Comments", kind: "number", width: 100 },
  { id: "fieldChangeCount", label: "Field Changes", kind: "number", width: 110 },
  { id: "firstActivity", label: "First Activity", kind: "date", width: 180 },
  { id: "lastActivity", label: "Last Activity", kind: "date", width: 180 }
];
const eventColumns: SqliteTableColumn[] = [
  { id: "eventTime", label: "Time", kind: "date", width: 180 },
  { id: "issueKey", label: "Issue Key", kind: "text", width: 130, render: (row) => <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(text(row.issueKey, ""))}&sourcePage=users`}>{text(row.issueKey)}</a> },
  { id: "eventType", label: "Activity Type", kind: "multi", width: 150 },
  { id: "fieldName", label: "Field", kind: "multi", width: 140 },
  { id: "before", label: "Before", kind: "text", width: 220 },
  { id: "after", label: "After", kind: "text", width: 220 },
  { id: "summary", label: "Title / Summary", kind: "text", width: 300 },
  { id: "sourceProvenance", label: "Source", kind: "multi", width: 170 }
];

export function UserViewerPage() {
  const { state } = useRuntimeStatus();
  const { userViewer, setUserViewer } = useSessionState();
  const requestSequence = useRef(0);
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);
  const patch = (value: Partial<typeof userViewer>) => setUserViewer((current) => ({ ...current, ...value }));

  async function loadUsers() {
    if (!state.database.canRead) return;
    const requestId = ++requestSequence.current;
    patch({ status: "loading", message: "" });
    try {
      const result = await window.desktopApp?.databaseViewer?.listUsers({ search: userViewer.search, limit: 100, offset: 0 });
      if (requestId !== requestSequence.current) return;
      patch({ users: result?.items ?? [], status: "ready" });
    } catch (reason) {
      if (requestId === requestSequence.current) patch({ message: reason instanceof Error ? reason.message : String(reason), status: "error" });
    }
  }

  async function queryTab(userId: string, tab = userViewer.activeTab, queryOverride?: ViewerTableQuery) {
    const requestId = ++requestSequence.current;
    patch({ selectedUserId: userId, activeTab: tab, status: "loading", message: "" });
    try {
      const detailPromise = window.desktopApp?.databaseViewer?.getUser({ userId, limit: 1, offset: 0 });
      const query = queryOverride ?? (tab === "Related Issues" ? userViewer.relatedQuery : userViewer.eventQuery);
      const resultPromise = tab === "Related Issues"
        ? window.desktopApp?.databaseViewer?.userRelatedIssues({ userId, query })
        : window.desktopApp?.databaseViewer?.userEvents({ userId, scope: tab === "Activity Stream" ? "activity_stream" : "all", query });
      const [detail, result] = await Promise.all([detailPromise, resultPromise]);
      if (requestId !== requestSequence.current) return;
      const resultKey = tab === "Related Issues" ? "relatedResult" : tab === "Activity Stream" ? "activityStreamResult" : "allEventsResult";
      patch({ detail: detail ?? null, [resultKey]: result ?? emptyResult, status: "ready" });
    } catch (reason) {
      if (requestId === requestSequence.current) patch({ message: reason instanceof Error ? reason.message : String(reason), status: "error" });
    }
  }

  useEffect(() => {
    if (state.database.canRead && userViewer.status === "initial") void loadUsers();
  }, [state.database.canRead, state.database.requestId]);

  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((response) => {
      if (response) setPreferences(response.preferences);
    });
  }, []);

  if (!state.database.canRead) {
    return <div><PageHeader title="使用者檢視" subtitle="User Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  const summary = (userViewer.detail?.summary ?? {}) as Record<string, unknown>;
  const activeResult = userViewer.activeTab === "Related Issues" ? userViewer.relatedResult : userViewer.activeTab === "Activity Stream" ? userViewer.activityStreamResult : userViewer.allEventsResult;
  const activeQuery = userViewer.activeTab === "Related Issues" ? userViewer.relatedQuery : userViewer.eventQuery;

  function updateQuery(query: ViewerTableQuery) {
    if (!userViewer.selectedUserId) return;
    patch(userViewer.activeTab === "Related Issues" ? { relatedQuery: query } : { eventQuery: query });
    void queryTab(userViewer.selectedUserId, userViewer.activeTab, query);
  }

  async function saveTablePreferences(section: UiPreferencesUpdate["section"], value: TablePreferences) {
    const response = await window.desktopApp?.uiPreferences?.update({ section, value });
    if (response) setPreferences(response.preferences);
  }

  const preferenceSection = userViewer.activeTab === "Related Issues"
    ? "userRelatedIssues"
    : userViewer.activeTab === "Activity Stream"
      ? "userActivityStream"
      : "userAllActivityEvents";

  return (
    <div className="min-w-0">
      <PageHeader title="使用者檢視" subtitle="User Viewer · Local Database / Read Only" connected={false} />
      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
        Stable User ID 是活動關聯主鍵；Display Name 只用於搜尋與顯示，不會合併同名使用者。Viewer 不呼叫 Jira API。
      </div>
      <SectionCard title="選擇使用者" subtitle="Select User">
        <div className="flex flex-wrap gap-2"><label className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-3 text-muted" size={16} /><input className="field pl-9" value={userViewer.search} onChange={(event) => patch({ search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void loadUsers(); }} placeholder="Display Name / Username / Stable User ID" /></label><button className="btn" type="button" onClick={() => void loadUsers()}><Search size={15} />搜尋</button></div>
        <div className="thin-scroll mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">{userViewer.users.map((user) => <button key={text(user.userId)} className={`min-w-[250px] rounded-md border p-3 text-left ${userViewer.selectedUserId === user.userId ? "border-blue-400 bg-blue-50" : "border-line bg-white"}`} type="button" onClick={() => void queryTab(text(user.userId))}><div className="font-black">{text(user.displayName, "Unknown display name")}</div><div className="truncate text-xs font-semibold text-muted" title={text(user.userId)}>{text(user.userId)}</div><div className="mt-2 text-xs font-bold text-blue-700">{text(user.totalIssues, "0")} issues · {text(user.activityStreamCount, "0")} stream · {text(user.totalEvents, "0")} all</div></button>)}</div>
      </SectionCard>

      {!userViewer.selectedUserId ? <SectionCard className="mt-4"><div className="py-16 text-center"><UserRound className="mx-auto mb-3 text-slate-300" size={42} /><b>選擇一位使用者 / Select a user</b></div></SectionCard> : <>
        <SectionCard className="mt-4" title={text(summary.displayName, "Unknown user")} subtitle={`Stable User ID · ${text(summary.userId)}`}>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3"><div><b>Earliest：</b>{text(summary.earliestEvent)}</div><div><b>Latest：</b>{text(summary.latestEvent)}</div><div className="break-all"><b>Database：</b>{state.database.sourceBinding || "Unavailable"}</div></div>
        </SectionCard>
        <ResponsiveMetricGrid min={170} className="mt-4">
          <MetricCard label="相關 Issue" sub="Related Issues" value={text(summary.totalIssues, "0")} icon={Database} />
          <MetricCard label="活動串流" sub="Confirmed Activity Stream" value={text(summary.activityStreamCount, "0")} icon={Activity} />
          <MetricCard label="全部事件" sub="All Activity Events" value={text(summary.totalEvents, "0")} icon={UserRound} />
          <MetricCard label="留言" sub="Comments" value={text(summary.comments, "0")} icon={MessageSquare} />
          <MetricCard label="欄位變更" sub="Field Changes" value={text(summary.fieldChanges, "0")} icon={Wrench} />
        </ResponsiveMetricGrid>
        <SectionCard className="mt-4">
          <div className="mb-4 flex max-w-full overflow-x-auto border-b border-line" role="tablist">
            {(["Related Issues", "Activity Stream", "All Activity Events"] as const).map((tab) => <button key={tab} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${userViewer.activeTab === tab ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => void queryTab(userViewer.selectedUserId, tab)}>{tab}</button>)}
          </div>
          {userViewer.activeTab === "Activity Stream" ? <div className={`mb-3 rounded-md border p-3 text-sm font-semibold ${activeResult?.sourceStatus === "source_unidentifiable" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
            Local Database / Read Only · Activity Stream Records: {activeResult?.totalCount ?? 0}<br />
            {activeResult?.sourceStatus === "source_unidentifiable" ? `來源無法識別 / Source cannot be identified (${activeResult.unidentifiableSourceCount ?? 0} local events).` : "僅顯示本機已保存且來源可確認的 Jira Activity Stream，不代表 Jira 即時或完整歷史。"}
          </div> : null}
          {userViewer.activeTab === "All Activity Events" ? <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold">包含此 Stable User ID 的所有本機正規化事件；範圍可能大於 Activity Stream。</div> : null}
          <SqliteDataTable
            columns={userViewer.activeTab === "Related Issues" ? issueColumns : eventColumns}
            result={activeResult ?? emptyResult}
            query={activeQuery}
            loading={userViewer.status === "loading"}
            error={userViewer.status === "error" ? userViewer.message : ""}
            preferences={preferences?.[preferenceSection]}
            onPreferencesChange={(value) => void saveTablePreferences(preferenceSection, value)}
            onQueryChange={updateQuery}
            loadDistinct={(field, search) => window.desktopApp!.databaseViewer!.distinctValues({
              source: userViewer.activeTab === "Related Issues" ? "userRelatedIssues" : userViewer.activeTab === "Activity Stream" ? "userActivityStream" : "userEvents",
              subjectId: userViewer.selectedUserId,
              field,
              search,
              limit: 200
            })}
          />
        </SectionCard>
      </>}
    </div>
  );
}
