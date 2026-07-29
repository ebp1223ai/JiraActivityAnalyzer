import { useCallback, useEffect, useState } from "react";
import { Activity, Copy, Database, FileClock, FileInput, FileText, HeartPulse, MessageSquare, Plus, RefreshCw, Wrench } from "lucide-react";
import { DatabaseIssueTable, DEFAULT_DATABASE_COLUMNS } from "../components/DatabaseIssueTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import type { DatabaseIssueDistributions, DatabaseIssueQuery, DatabaseIssueQueryResult } from "../types/databaseQuery";
import type { DatabaseIssueListPreferences } from "../types/uiPreferences";

type Overview = {
  status?: string;
  database?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  latestRun?: Record<string, unknown>;
};

const defaultQuery: DatabaseIssueQuery = { page: 1, pageSize: 50, sort: { field: "jiraUpdatedAt", direction: "desc" }, filters: {} };
const defaultPreferences: DatabaseIssueListPreferences = {
  visibleColumns: [...DEFAULT_DATABASE_COLUMNS],
  columnOrder: [...DEFAULT_DATABASE_COLUMNS],
  columnWidths: {},
  pageSize: 50
};
const emptyIssues: DatabaseIssueQueryResult = { databaseTotal: 0, filteredTotal: 0, page: 1, pageSize: 50, pageCount: 1, items: [] };

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
  const [issues, setIssues] = useState<DatabaseIssueQueryResult>(emptyIssues);
  const [distributions, setDistributions] = useState<DatabaseIssueDistributions | null>(null);
  const [query, setQuery] = useState<DatabaseIssueQuery>(defaultQuery);
  const [preferences, setPreferences] = useState<DatabaseIssueListPreferences>(defaultPreferences);
  const [status, setStatus] = useState<"initial" | "loading" | "ready" | "error">("initial");
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!state.database.canRead) return;
    setStatus("loading");
    setNotice("");
    try {
      const [summary, issueList, distributionList] = await Promise.all([
        window.desktopApp?.databaseViewer?.overview(),
        window.desktopApp?.databaseViewer?.listIssues(query),
        window.desktopApp?.databaseViewer?.issueDistributions()
      ]);
      setOverview(summary ?? null);
      setIssues(issueList ?? emptyIssues);
      setDistributions(distributionList ?? null);
      setStatus("ready");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    }
  }, [query, state.database.canRead]);

  useEffect(() => { void refresh(); }, [refresh, state.database.requestId]);
  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((loaded) => {
      const next = loaded?.preferences.databaseIssueList as DatabaseIssueListPreferences | undefined;
      if (next) {
        setPreferences(next);
        setQuery((current) => ({ ...current, pageSize: next.pageSize }));
      }
      if (loaded?.warning) setNotice(loaded.warning);
    });
  }, []);

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

  async function copyDatabasePath() {
    const databasePath = state.database.path || "";
    if (!databasePath) return;
    await navigator.clipboard.writeText(databasePath);
    setNotice("資料庫路徑已複製 / Database path copied.");
  }

  function savePreferences(next: DatabaseIssueListPreferences) {
    setPreferences(next);
    void window.desktopApp?.uiPreferences?.update({ section: "databaseIssueList", value: next }).then((loaded) => {
      if (loaded.warning) setNotice(loaded.warning);
    });
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
        <button className="btn" type="button" disabled={!state.database.path} onClick={() => void copyDatabasePath()}><Copy size={16} />複製路徑 / Copy Path</button>
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

          {distributions ? <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
            {(["issueType", "status", "priority"] as const).map((field) => <SectionCard key={field} title={field === "issueType" ? "類型分布" : field === "status" ? "狀態分布" : "優先級分布"} subtitle={`${field} · ${distributions.total} issues`}>
              <div className="space-y-2">
                {distributions[field].slice(0, 8).map((item) => <button key={item.value} className="flex w-full items-center gap-3 text-left text-xs font-bold" type="button" onClick={() => setQuery((current) => ({ ...current, page: 1, filters: { ...current.filters, [field]: { values: [item.value === "未設定" ? "__UNSET__" : item.value] } } }))}>
                  <span className="min-w-0 flex-1 truncate" title={item.value}>{item.value}</span>
                  <span>{item.count.toLocaleString()}</span>
                  <span className="h-2 w-24 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-blue-500" style={{ width: `${distributions.total ? Math.max(2, item.count / distributions.total * 100) : 0}%` }} /></span>
                </button>)}
              </div>
            </SectionCard>)}
          </div> : null}

          <SectionCard className="mt-4" title="Issue 清單" subtitle="Issue List">
            {status === "loading" ? <div className="py-10 text-center font-bold text-muted">Loading...</div> : (
              <DatabaseIssueTable result={issues} query={query} preferences={preferences} onQueryChange={setQuery} onPreferencesChange={savePreferences} />
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
