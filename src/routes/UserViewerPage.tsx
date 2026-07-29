import { useEffect, useMemo } from "react";
import { Database, Search, UserRound } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";

function text(value: unknown, fallback = "-") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function UserViewerPage() {
  const { state } = useRuntimeStatus();
  const { userViewer, setUserViewer } = useSessionState();
  const patch = (value: Partial<typeof userViewer>) => setUserViewer((current) => ({ ...current, ...value }));

  async function loadUsers() {
    if (!state.database.canRead) return;
    patch({ status: "loading", message: "" });
    try {
      const result = await window.desktopApp?.databaseViewer?.listUsers({ search: userViewer.search, limit: 100, offset: 0 });
      patch({ users: result?.items ?? [], status: "ready" });
    } catch (reason) {
      patch({ message: reason instanceof Error ? reason.message : String(reason), status: "error" });
    }
  }

  async function loadUser(userId: string) {
    patch({ selectedUserId: userId, status: "loading", message: "" });
    try {
      const detail = await window.desktopApp?.databaseViewer?.getUser({ userId, limit: 200, offset: 0 }) ?? null;
      patch({ detail, status: "ready" });
    } catch (reason) {
      patch({ message: reason instanceof Error ? reason.message : String(reason), status: "error" });
    }
  }

  useEffect(() => {
    if (state.database.canRead && userViewer.status === "initial") void loadUsers();
  }, [state.database.canRead, state.database.requestId]);

  if (!state.database.canRead) {
    return <div><PageHeader title="使用者檢視" subtitle="User Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  const summary = (userViewer.detail?.summary ?? {}) as Record<string, unknown>;
  const rawEvents = Array.isArray(userViewer.detail?.events) ? userViewer.detail.events as Array<Record<string, unknown>> : [];
  const projects = Array.isArray(userViewer.detail?.projects) ? userViewer.detail.projects as Array<Record<string, unknown>> : [];
  const eventTypes = Array.isArray(userViewer.detail?.eventTypes) ? userViewer.detail.eventTypes as Array<Record<string, unknown>> : [];
  const events = useMemo(() => rawEvents
    .filter((event) => userViewer.startDate === "" || text(event.eventTime) >= userViewer.startDate)
    .filter((event) => userViewer.endDate === "" || text(event.eventTime) <= `${userViewer.endDate}T23:59:59.999Z`)
    .filter((event) => userViewer.eventType === "all" || event.eventType === userViewer.eventType)
    .filter((event) => userViewer.project === "all" || event.projectKey === userViewer.project)
    .sort((a, b) => userViewer.sort === "newest" ? text(b.eventTime).localeCompare(text(a.eventTime)) : text(a.eventTime).localeCompare(text(b.eventTime))),
  [rawEvents, userViewer.endDate, userViewer.eventType, userViewer.project, userViewer.sort, userViewer.startDate]);

  return (
    <div className="min-w-0">
      <PageHeader title="使用者檢視" subtitle="User Viewer · Local Database Only" connected={false} />
      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
        以 stable Account ID／Username 區分使用者；Display Name 不作唯一識別。此頁不呼叫 Jira API。
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard title="本機使用者" subtitle="Local Users">
          <label className="relative mb-3 block">
            <Search className="absolute left-3 top-3 text-muted" size={16} />
            <input className="field pl-9" value={userViewer.search} onChange={(event) => patch({ search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void loadUsers(); }} placeholder="Stable ID 或 Display Name" />
          </label>
          <div className="thin-scroll max-h-[640px] space-y-2 overflow-y-auto">
            {userViewer.status === "loading" ? <div className="py-8 text-center text-sm font-bold text-muted">Loading...</div> : null}
            {userViewer.status === "error" ? <div className="rounded-md bg-rose-50 p-3 text-sm font-bold text-rose-700">{userViewer.message}</div> : null}
            {userViewer.status === "ready" && !userViewer.users.length ? <div className="py-8 text-center text-sm font-bold text-muted">沒有具 stable ID 的活動使用者 / No stable users</div> : null}
            {userViewer.users.map((user) => <button key={text(user.userId)} className={`w-full rounded-md border p-3 text-left ${userViewer.selectedUserId === user.userId ? "border-blue-400 bg-blue-50" : "border-line bg-white"}`} type="button" onClick={() => void loadUser(text(user.userId))}><div className="font-black">{text(user.displayName, "Unknown display name")}</div><div className="mt-1 break-all text-xs font-semibold text-muted">{text(user.userId)}</div><div className="mt-2 text-xs font-bold text-blue-700">{text(user.totalEvents, "0")} events · {text(user.totalIssues, "0")} issues</div></button>)}
          </div>
        </SectionCard>
        <div className="min-w-0">
          {!userViewer.detail ? <SectionCard><div className="py-20 text-center"><UserRound className="mx-auto mb-4 text-slate-300" size={42} /><b>選擇一位使用者 / Select a user</b></div></SectionCard> : null}
          {userViewer.detail?.found ? <>
            <SectionCard title={text(summary.displayName, "Unknown user")} subtitle={text(summary.userId)}>
              <div className="mb-4 flex border-b border-line" role="tablist" aria-label="User Viewer sections">
                {["Summary", "Activity"].map((tab) => <button key={tab} role="tab" aria-selected={userViewer.activeTab === tab} className={`border-b-2 px-4 py-3 text-sm font-black ${userViewer.activeTab === tab ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} onClick={() => patch({ activeTab: tab })}>{tab}</button>)}
              </div>
              {userViewer.activeTab === "Summary" ? <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2"><div><dt className="font-bold text-muted">Stable User ID</dt><dd className="break-all font-black">{text(summary.userId)}</dd></div><div><dt className="font-bold text-muted">Jira Server</dt><dd className="break-all font-semibold">{state.database.sourceBinding || "Unavailable"}</dd></div><div><dt className="font-bold text-muted">Earliest Event</dt><dd>{text(summary.earliestEvent)}</dd></div><div><dt className="font-bold text-muted">Latest Event</dt><dd>{text(summary.latestEvent)}</dd></div></dl> : null}
              {userViewer.activeTab === "Activity" ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"><input className="field" type="date" value={userViewer.startDate} onChange={(event) => patch({ startDate: event.target.value })} /><input className="field" type="date" value={userViewer.endDate} onChange={(event) => patch({ endDate: event.target.value })} /><select className="field" value={userViewer.eventType} onChange={(event) => patch({ eventType: event.target.value })}><option value="all">All Event Types</option>{eventTypes.map((item) => <option key={text(item.eventType)} value={text(item.eventType)}>{text(item.eventType)}</option>)}</select><select className="field" value={userViewer.project} onChange={(event) => patch({ project: event.target.value })}><option value="all">All Projects</option>{projects.map((item) => <option key={text(item.projectKey)} value={text(item.projectKey)}>{text(item.projectKey)}</option>)}</select><select className="field" value={userViewer.sort} onChange={(event) => patch({ sort: event.target.value as "newest" | "oldest" })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div> : null}
            </SectionCard>
            {userViewer.activeTab === "Summary" ? <><ResponsiveMetricGrid min={170} className="mt-4"><MetricCard label="Issue" sub="Total Issues" value={text(summary.totalIssues, "0")} icon={Database} /><MetricCard label="事件" sub="Total Events" value={text(summary.totalEvents, "0")} icon={UserRound} /><MetricCard label="留言" sub="Comments" value={text(summary.comments, "0")} icon={UserRound} /><MetricCard label="欄位變更" sub="Field Changes" value={text(summary.fieldChanges, "0")} icon={UserRound} /><MetricCard label="附件中繼資料" sub="Attachment Metadata" value={text(summary.attachments, "0")} icon={UserRound} /></ResponsiveMetricGrid><div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"><SectionCard title="Project 分布" subtitle="Project Distribution"><DataTable headers={["Project", "Events"]} rows={projects.map((item) => [text(item.projectKey), text(item.count)])} /></SectionCard><SectionCard title="事件類型分布" subtitle="Event Type Distribution"><DataTable headers={["Event Type", "Count"]} rows={eventTypes.map((item) => [text(item.eventType), text(item.count)])} /></SectionCard></div></> : null}
            {userViewer.activeTab === "Activity" ? <SectionCard className="mt-4" title="活動紀錄" subtitle={`Activity Records · ${events.length}`}><DataTable headers={["Time", "Issue", "Project", "Event Type", "Field", "From", "To"]} rows={events.map((item) => [text(item.eventTime), text(item.issueKey), text(item.projectKey), text(item.eventType), text(item.fieldName), text(item.fromValueJson), text(item.toValueJson)])} /></SectionCard> : null}
          </> : null}
        </div>
      </div>
    </div>
  );
}
