import { useEffect, useState } from "react";
import { Database, Search, UserRound } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

function text(value: unknown, fallback = "-") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function UserViewerPage() {
  const { state } = useRuntimeStatus();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  async function loadUsers() {
    if (!state.database.canRead) return;
    setStatus("loading");
    try {
      const result = await window.desktopApp?.databaseViewer?.listUsers({ search, limit: 100, offset: 0 });
      setUsers(result?.items ?? []);
      setStatus("ready");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    }
  }

  async function loadUser(userId: string) {
    setSelectedUserId(userId);
    setDetail(await window.desktopApp?.databaseViewer?.getUser({ userId, limit: 100, offset: 0 }) ?? null);
  }

  useEffect(() => { void loadUsers(); }, [state.database.canRead, state.database.requestId]);

  if (!state.database.canRead) {
    return <div><PageHeader title="使用者檢視" subtitle="User Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  const summary = (detail?.summary ?? {}) as Record<string, unknown>;
  const events = Array.isArray(detail?.events) ? detail.events as Array<Record<string, unknown>> : [];
  const projects = Array.isArray(detail?.projects) ? detail.projects as Array<Record<string, unknown>> : [];
  const eventTypes = Array.isArray(detail?.eventTypes) ? detail.eventTypes as Array<Record<string, unknown>> : [];
  return (
    <div className="min-w-0">
      <PageHeader title="使用者檢視" subtitle="User Viewer" connected={false} />
      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
        本頁只讀 Local SQLite，並以 stable Account ID／Username 區分使用者；同名但 ID 不同不會合併。結果可能不包含尚未擷取、超出擷取範圍，或未通過完整性驗證的 Jira 資料。
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard title="本機使用者" subtitle="Local Users">
          <label className="relative mb-3 block">
            <Search className="absolute left-3 top-3 text-muted" size={16} />
            <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadUsers(); }} placeholder="Stable ID 或 Display Name" />
          </label>
          <div className="thin-scroll max-h-[640px] space-y-2 overflow-y-auto">
            {status === "loading" ? <div className="py-8 text-center text-sm font-bold text-muted">Loading...</div> : null}
            {status === "error" ? <div className="rounded-md bg-rose-50 p-3 text-sm font-bold text-rose-700">{message}</div> : null}
            {status === "ready" && !users.length ? <div className="py-8 text-center text-sm font-bold text-muted">沒有具 stable ID 的活動使用者 / No stable users</div> : null}
            {users.map((user) => (
              <button key={text(user.userId)} className={`w-full rounded-md border p-3 text-left ${selectedUserId === user.userId ? "border-blue-400 bg-blue-50" : "border-line bg-white"}`} type="button" onClick={() => void loadUser(text(user.userId))}>
                <div className="font-black">{text(user.displayName, "Unknown display name")}</div>
                <div className="mt-1 break-all text-xs font-semibold text-muted">{text(user.userId)}</div>
                <div className="mt-2 text-xs font-bold text-blue-700">{text(user.totalEvents, "0")} events · {text(user.totalIssues, "0")} issues</div>
              </button>
            ))}
          </div>
        </SectionCard>
        <div className="min-w-0">
          {!detail ? <SectionCard><div className="py-20 text-center"><UserRound className="mx-auto mb-4 text-slate-300" size={42} /><b>選擇一位使用者 / Select a user</b></div></SectionCard> : null}
          {detail && !detail.found ? <SectionCard><div className="py-12 text-center font-bold text-muted">User not found</div></SectionCard> : null}
          {detail?.found ? (
            <>
              <SectionCard title={text(summary.displayName, "Unknown user")} subtitle={text(summary.userId)}>
                <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div><dt className="font-bold text-muted">Stable User ID</dt><dd className="break-all font-black">{text(summary.userId)}</dd></div>
                  <div><dt className="font-bold text-muted">Jira Server</dt><dd className="break-all font-semibold">{state.database.sourceBinding || "Unavailable"}</dd></div>
                  <div><dt className="font-bold text-muted">Earliest Event</dt><dd>{text(summary.earliestEvent)}</dd></div>
                  <div><dt className="font-bold text-muted">Latest Event</dt><dd>{text(summary.latestEvent)}</dd></div>
                  <div><dt className="font-bold text-muted">Time Zone</dt><dd>Stored timestamps / no inferred user zone</dd></div>
                </dl>
              </SectionCard>
              <ResponsiveMetricGrid min={170} className="mt-4">
                <MetricCard label="Issue" sub="Total Issues" value={text(summary.totalIssues, "0")} icon={Database} />
                <MetricCard label="事件" sub="Total Events" value={text(summary.totalEvents, "0")} icon={UserRound} />
                <MetricCard label="留言" sub="Comments" value={text(summary.comments, "0")} icon={UserRound} />
                <MetricCard label="欄位變更" sub="Field Changes" value={text(summary.fieldChanges, "0")} icon={UserRound} />
                <MetricCard label="附件中繼資料" sub="Attachment Metadata" value={text(summary.attachments, "0")} icon={UserRound} />
              </ResponsiveMetricGrid>
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
                <SectionCard title="Project 分布" subtitle="Project Distribution"><DataTable headers={["Project", "Events"]} rows={projects.map((item) => [text(item.projectKey), text(item.count)])} /></SectionCard>
                <SectionCard title="事件類型分布" subtitle="Event Type Distribution"><DataTable headers={["Event Type", "Count"]} rows={eventTypes.map((item) => [text(item.eventType), text(item.count)])} /></SectionCard>
              </div>
              <SectionCard className="mt-4" title="活動紀錄" subtitle="Activity Records">
                <DataTable headers={["Time", "Issue", "Project", "Event Type", "Field", "From", "To"]} rows={events.map((item) => [text(item.eventTime), text(item.issueKey), text(item.projectKey), text(item.eventType), text(item.fieldName), text(item.fromValueJson), text(item.toValueJson)])} />
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
