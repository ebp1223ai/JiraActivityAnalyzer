import { useCallback, useEffect, useState } from "react";
import { Activity, Database, FileClock, FileText, HeartPulse, MessageSquare, RefreshCw, Search, Wrench } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

type Overview = {
  status?: string;
  database?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  latestRun?: Record<string, unknown>;
};

type IssueList = {
  total: number;
  items: Array<Record<string, unknown>>;
};

function value(record: Record<string, unknown> | undefined, key: string, fallback = "-") {
  const result = record?.[key];
  return result === undefined || result === null || result === "" ? fallback : String(result);
}

function size(bytes: unknown) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function DashboardPage() {
  const { state } = useRuntimeStatus();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [issues, setIssues] = useState<IssueList>({ total: 0, items: [] });
  const [status, setStatus] = useState<"initial" | "loading" | "ready" | "error">("initial");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!state.database.canRead) return;
    setStatus("loading");
    setError("");
    try {
      const [summary, issueList] = await Promise.all([
        window.desktopApp?.databaseViewer?.overview(),
        window.desktopApp?.databaseViewer?.listIssues({ search, limit: 25, offset: 0 })
      ]);
      setOverview(summary ?? null);
      setIssues(issueList ?? { total: 0, items: [] });
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    }
  }, [search, state.database.canRead]);

  useEffect(() => { void refresh(); }, [refresh, state.database.requestId]);

  async function fullHealthCheck() {
    setHealthRunning(true);
    try {
      setHealth(await window.desktopApp?.databaseViewer?.healthCheck() ?? null);
    } catch (reason) {
      setHealth({ status: "error", message: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setHealthRunning(false);
    }
  }

  if (!state.database.canRead) {
    return (
      <div className="min-w-0">
        <PageHeader title="資料庫總覽" subtitle="Database Overview" connected={false} />
        <SectionCard>
          <div className="py-14 text-center">
            <Database className="mx-auto mb-4 text-slate-300" size={42} />
            <h2 className="text-lg font-black">本機資料庫目前不可用 / Local database unavailable</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-muted">{state.database.message}</p>
            <p className="mt-2 text-xs font-bold text-muted">Reason: {state.database.reasonCode}</p>
          </div>
        </SectionCard>
      </div>
    );
  }

  const counts = overview?.counts;
  const database = overview?.database;
  const latestRun = overview?.latestRun;
  return (
    <div className="min-w-0">
      <PageHeader title="資料庫總覽" subtitle="Database Overview" connected={false} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn" type="button" disabled={status === "loading"} onClick={() => void refresh()}><RefreshCw size={16} />快速重新整理 / Quick Refresh</button>
        <button className="btn" type="button" disabled={healthRunning} onClick={() => void fullHealthCheck()}><Wrench size={16} />{healthRunning ? "檢查中..." : "完整健康檢查 / Full Health Check"}</button>
      </div>
      {error ? <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}
      <ResponsiveMetricGrid min={190}>
        <MetricCard label="Issue 總數" sub="Total Issues" value={value(counts, "totalIssues", "0")} icon={FileText} />
        <MetricCard label="快照總數" sub="Snapshots" value={value(counts, "totalSnapshots", "0")} icon={FileClock} />
        <MetricCard label="活動事件" sub="Activity Events" value={value(counts, "totalEvents", "0")} icon={Activity} />
        <MetricCard label="留言事件" sub="Comments" value={value(counts, "comments", "0")} icon={MessageSquare} />
        <MetricCard label="欄位變更" sub="Field Changes" value={value(counts, "fieldChanges", "0")} icon={RefreshCw} />
      </ResponsiveMetricGrid>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="資料庫資訊" subtitle="Database Information">
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            <dt className="font-bold text-muted">Filename</dt><dd className="break-all font-black">{value(database, "filename")}</dd>
            <dt className="font-bold text-muted">Path</dt><dd className="break-all font-semibold">{value(database, "path")}</dd>
            <dt className="font-bold text-muted">Jira Server</dt><dd className="break-all font-semibold">{value(database, "jira_server_url")}</dd>
            <dt className="font-bold text-muted">Schema</dt><dd className="font-semibold">{value(database, "schema_version")}</dd>
            <dt className="font-bold text-muted">Size</dt><dd className="font-semibold">{size(database?.sizeBytes)}</dd>
            <dt className="font-bold text-muted">Created At</dt><dd className="font-semibold">{value(database, "created_at")}</dd>
            <dt className="font-bold text-muted">Last Write</dt><dd className="font-semibold">{value(latestRun, "last_completed_at")}</dd>
          </dl>
        </SectionCard>
        <SectionCard title="健康狀態" subtitle="Health">
          <div className="flex items-start gap-3">
            <HeartPulse className={health?.status === "error" ? "text-rose-500" : "text-emerald-500"} />
            <div>
              <div className="font-black">{health ? value(health, "status") : "尚未執行 / Not run"}</div>
              <div className="mt-1 text-sm font-semibold text-muted">Full Health Check 只在手動觸發時執行，不會在啟動時掃描全表。</div>
            </div>
          </div>
          {health ? <dl className="mt-4 grid grid-cols-[170px_1fr] gap-2 text-sm">
            <dt>Quick Check</dt><dd>{value(health, "quickCheck")}</dd>
            <dt>Foreign Key Violations</dt><dd>{value(health, "foreignKeyViolationCount", "0")}</dd>
            <dt>Started</dt><dd>{value(health, "startedAt")}</dd>
            <dt>Completed</dt><dd>{value(health, "completedAt")}</dd>
          </dl> : null}
        </SectionCard>
      </div>
      <SectionCard className="mt-4" title="Issue 清單" subtitle="Issue List" action={
        <label className="relative block w-[min(320px,100%)]">
          <Search className="absolute left-3 top-3 text-muted" size={16} />
          <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Issue Key 或 Summary" />
        </label>
      }>
        {status === "loading" ? <div className="py-10 text-center font-bold text-muted">Loading...</div> : issues.items.length ? (
          <>
            <DataTable
              headers={["Key", "Summary", "Project", "Type", "Status", "Updated", "Snapshot", "Save Outcome", "Events", "Action"]}
              rows={issues.items.map((item) => [
                <span className="font-black text-blue-700">{value(item, "issueKey")}</span>,
                <span title={value(item, "summary")} className="inline-block max-w-[340px] truncate align-bottom">{value(item, "summary")}</span>,
                value(item, "projectKey"),
                value(item, "issueType"),
                value(item, "status"),
                value(item, "jiraUpdatedAt"),
                value(item, "snapshotTime"),
                value(item, "saveOutcome", "Unavailable"),
                value(item, "eventCount", "0"),
                <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(value(item, "issueKey"))}`}>Open</a>
              ])}
            />
            <div className="mt-3 text-xs font-bold text-muted">{issues.total} total issues</div>
          </>
        ) : <div className="py-10 text-center font-bold text-muted">沒有符合條件的 Issue / No issues found</div>}
      </SectionCard>
    </div>
  );
}
