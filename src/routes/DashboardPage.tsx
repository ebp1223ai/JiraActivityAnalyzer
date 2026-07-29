import { useCallback, useEffect, useState } from "react";
import { Activity, Database, FileClock, FileInput, FileText, FolderOpen, HeartPulse, MessageSquare, Plus, RefreshCw, Search, Wrench } from "lucide-react";
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

function formatSize(bytes: unknown) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let amount = numeric;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function DashboardPage() {
  const { state, retryDatabase, selectExistingDatabase, createNewDatabase } = useRuntimeStatus();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [issues, setIssues] = useState<IssueList>({ total: 0, items: [] });
  const [status, setStatus] = useState<"initial" | "loading" | "ready" | "error">("initial");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!state.database.canRead) return;
    setStatus("loading");
    setNotice("");
    try {
      const [summary, issueList] = await Promise.all([
        window.desktopApp?.databaseViewer?.overview(),
        window.desktopApp?.databaseViewer?.listIssues({ search, limit: 25, offset: 0 })
      ]);
      setOverview(summary ?? null);
      setIssues(issueList ?? { total: 0, items: [] });
      setStatus("ready");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    }
  }, [search, state.database.canRead]);

  useEffect(() => { void refresh(); }, [refresh, state.database.requestId]);

  async function selectDatabase() {
    const result = await selectExistingDatabase();
    if (!result || result.canceled) {
      setNotice("已取消選擇資料庫。 / Database selection cancelled.");
      return;
    }
    setNotice(result.saved
      ? "資料庫驗證成功並已設為目前資料庫。 / Database validated and selected."
      : `資料庫未變更：${result.validation?.reasonCode ?? result.error ?? "validation failed"}`);
  }

  async function createDatabase() {
    const result = await createNewDatabase();
    if (!result || result.canceled) {
      setNotice("已取消建立資料庫。 / Database creation cancelled.");
      return;
    }
    setNotice(result.saved
      ? "來源封存資料庫已建立並選用。 / Source Archive Database created and selected."
      : `資料庫未建立：${result.error ?? "validation failed"}`);
  }

  async function openFolder() {
    const result = await window.desktopApp?.databaseViewer?.openFolder();
    setNotice(result?.ok
      ? `已開啟資料夾：${result.folderPath}`
      : `無法開啟資料夾：${result?.error ?? "database unavailable"}`);
  }

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

  const counts = overview?.counts;
  const database = overview?.database;
  const latestRun = overview?.latestRun;

  return (
    <div className="min-w-0">
      <PageHeader title="資料庫總覽" subtitle="Database Overview" connected={state.database.canRead} />

      <div className="mb-4 flex flex-wrap gap-2">
        <button data-testid="select-existing-database" className="btn" type="button" onClick={() => void selectDatabase()}><FileInput size={16} />選擇既有 / Select</button>
        <button data-testid="create-new-database" className="btn btn-primary" type="button" onClick={() => void createDatabase()}><Plus size={16} />建立資料庫 / Create</button>
        <button className="btn" type="button" onClick={() => void retryDatabase()}><RefreshCw size={16} />重新驗證 / Recheck</button>
        <button className="btn" type="button" disabled={!state.database.canRead || status === "loading"} onClick={() => void refresh()}><RefreshCw size={16} />快速重新整理 / Refresh</button>
        <button className="btn" type="button" disabled={!state.database.canRead || healthRunning} onClick={() => void fullHealthCheck()}><Wrench size={16} />{healthRunning ? "檢查中..." : "完整健康檢查 / Health"}</button>
        <button className="btn" type="button" disabled={!state.database.canRead} onClick={() => void openFolder()}><FolderOpen size={16} />開啟資料夾 / Open Folder</button>
      </div>

      {notice ? <div className={`mb-4 rounded-md border p-4 text-sm font-bold ${status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{notice}</div> : null}

      <SectionCard title="目前資料庫" subtitle="Current Database">
        <div className="grid min-w-0 grid-cols-1 gap-3 text-sm font-semibold md:grid-cols-2 xl:grid-cols-4">
          <div><b>Status：</b>{state.database.status}</div>
          <div><b>Compatibility：</b>{state.database.reasonCode}</div>
          <div><b>Read：</b>{state.database.canRead ? "Available" : "Unavailable"}</div>
          <div><b>Write：</b>{state.database.canWrite ? "Available" : "Unavailable"}</div>
          <div className="break-all md:col-span-2 xl:col-span-4"><b>Path：</b>{state.database.path || "-"}</div>
          <div className="break-all md:col-span-2"><b>Database ID：</b>{state.database.databaseId || "-"}</div>
          <div><b>Schema：</b>{state.database.schemaVersion ?? "-"}</div>
          <div><b>Source Binding：</b>{state.database.sourceBinding || "Unbound"}</div>
        </div>
        {!state.database.canRead ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            本機資料庫目前不可讀；離線資料庫能力與 Jira 連線狀態彼此獨立。 / Local database availability is independent from Jira connectivity.
          </div>
        ) : null}
      </SectionCard>

      {state.database.canRead ? (
        <>
          <ResponsiveMetricGrid className="mt-4" min={180}>
            <MetricCard label="Issue 數量" sub="Total Issues" value={value(counts, "totalIssues", "0")} icon={FileText} />
            <MetricCard label="目前快照" sub="Snapshots" value={value(counts, "totalSnapshots", "0")} icon={FileClock} />
            <MetricCard label="完整 Payload" sub="Full Fetch Payloads" value={value(counts, "totalPayloads", "0")} icon={Database} />
            <MetricCard label="活動事件" sub="Activity Events" value={value(counts, "totalEvents", "0")} icon={Activity} />
            <MetricCard label="留言事件" sub="Comments" value={value(counts, "comments", "0")} icon={MessageSquare} />
            <MetricCard label="欄位變更" sub="Field Changes" value={value(counts, "fieldChanges", "0")} icon={RefreshCw} />
          </ResponsiveMetricGrid>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard title="資料庫資訊" subtitle="Database Information">
              <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
                <dt className="font-bold text-muted">Filename</dt><dd className="break-all font-black">{value(database, "filename")}</dd>
                <dt className="font-bold text-muted">Path</dt><dd className="break-all font-semibold">{value(database, "path")}</dd>
                <dt className="font-bold text-muted">Jira Server</dt><dd className="break-all font-semibold">{value(database, "jira_server_url")}</dd>
                <dt className="font-bold text-muted">Schema</dt><dd className="font-semibold">{value(database, "schema_version")}</dd>
                <dt className="font-bold text-muted">Size</dt><dd className="font-semibold">{formatSize(database?.sizeBytes)}</dd>
                <dt className="font-bold text-muted">Created</dt><dd className="font-semibold">{value(database, "created_at")}</dd>
              </dl>
            </SectionCard>

            <SectionCard title="最近寫入與完整性" subtitle="Recent Write & Integrity">
              <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 text-sm">
                <dt>Run Status</dt><dd className="font-bold">{value(latestRun, "status")}</dd>
                <dt>Completed At</dt><dd>{value(latestRun, "last_completed_at")}</dd>
                <dt>Success</dt><dd>{value(latestRun, "success_count", "0")}</dd>
                <dt>Partial</dt><dd>{value(latestRun, "partial_count", "0")}</dd>
                <dt>Failed</dt><dd>{value(latestRun, "failed_count", "0")}</dd>
                <dt>Health</dt><dd className="font-bold">{health ? value(health, "status") : "Not run"}</dd>
                {health ? <><dt>Quick Check</dt><dd>{value(health, "quickCheck")}</dd><dt>FK Violations</dt><dd>{value(health, "foreignKeyViolationCount", "0")}</dd></> : null}
              </dl>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted"><HeartPulse size={15} />完整健康檢查只讀取資料庫，不依賴 Jira。</div>
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
                    <span title={value(item, "summary")} data-allow-truncate="true" className="inline-block max-w-[340px] truncate align-bottom">{value(item, "summary")}</span>,
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
            ) : <div className="py-10 text-center font-bold text-muted">找不到符合條件的 Issue / No issues found</div>}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
