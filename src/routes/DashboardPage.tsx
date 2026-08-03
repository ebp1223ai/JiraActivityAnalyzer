import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Copy, Database, FileClock, FileInput, FileText, HeartPulse, MessageSquare, Plus, RefreshCw, Wrench } from "lucide-react";
import { DatabaseIssueTable, DEFAULT_DATABASE_COLUMNS } from "../components/DatabaseIssueTable";
import { DateRangeControl } from "../components/DateRangeControl";
import { FilterPresetControl } from "../components/FilterPresetControl";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { DistributionPanel } from "../components/DistributionPanel";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { recordTableRequest } from "../diagnostics/tableDiagnostics";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import type { DatabaseIssueDistributions, DatabaseIssueQuery, DatabaseIssueQueryResult } from "../types/databaseQuery";
import type { DatabaseIssueListPreferences, FilterPreset } from "../types/uiPreferences";
import { ALL_TIME_DATE_RANGE } from "../types/dateRange";

type Overview = {
  status?: string;
  database?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  latestRun?: Record<string, unknown>;
};

const defaultQuery: DatabaseIssueQuery = { page: 1, pageSize: 50, sort: { field: "jiraUpdatedAt", direction: "desc" }, filters: {}, dateMode: "activity", dateRange: ALL_TIME_DATE_RANGE, revision: 0 };
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
  const { state, setDatabaseLoadStatus, retryDatabase, selectExistingDatabase, createNewDatabase } = useRuntimeStatus();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [issues, setIssues] = useState<DatabaseIssueQueryResult>(emptyIssues);
  const [distributions, setDistributions] = useState<DatabaseIssueDistributions | null>(null);
  const [query, setQuery] = useState<DatabaseIssueQuery>(defaultQuery);
  const [preferences, setPreferences] = useState<DatabaseIssueListPreferences>(defaultPreferences);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [overviewStatus, setOverviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [issueStatus, setIssueStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [distributionStatus, setDistributionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [issueInteractionReady, setIssueInteractionReady] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);
  const overviewRequest = useRef(0);
  const issueRequest = useRef(0);
  const distributionRequest = useRef(0);
  const databaseIdentity = `${state.database.requestId}:${state.database.path}:${state.database.databaseId}:${refreshToken}`;

  const refresh = useCallback(async () => {
    if (!state.database.canRead) return;
    setRefreshToken((value) => value + 1);
  }, [state.database.canRead]);

  useEffect(() => {
    const requestId = ++overviewRequest.current;
    issueRequest.current += 1;
    distributionRequest.current += 1;
    setIssueInteractionReady(false);
    setOverview(null);
    setIssues(emptyIssues);
    setDistributions(null);
    setDistributionStatus("idle");
    setNotice("");
    if (!state.database.canRead) {
      setOverviewStatus("idle");
      setIssueStatus("idle");
      return;
    }
    setDatabaseLoadStatus("loading");
    setOverviewStatus("loading");
    void window.desktopApp?.databaseViewer?.overview().then((summary) => {
      if (requestId !== overviewRequest.current) return;
      setOverview(summary ?? null);
      setOverviewStatus("ready");
    }).catch((reason) => {
      if (requestId !== overviewRequest.current) return;
      setNotice(reason instanceof Error ? reason.message : String(reason));
      setOverviewStatus("error");
    });
  }, [databaseIdentity, state.database.canRead]);

  useEffect(() => {
    if (!state.database.canRead || overviewStatus !== "ready") return;
    const requestId = ++issueRequest.current;
    const startedAt = performance.now();
    recordTableRequest("started", { requestId, tableId: "databaseIssueList", query, startedAt });
    setIssueStatus("loading");
    void window.desktopApp?.databaseViewer?.listIssues(query).then((issueList) => {
      if (requestId !== issueRequest.current) {
        recordTableRequest("stale", { requestId, tableId: "databaseIssueList", query, startedAt });
        return;
      }
      setIssues(issueList ?? emptyIssues);
      recordTableRequest("completed", { requestId, tableId: "databaseIssueList", query, startedAt, resultCount: issueList?.items.length ?? 0 });
      setIssueStatus("ready");
      setIssueInteractionReady(true);
    }).catch((reason) => {
      if (requestId !== issueRequest.current) {
        recordTableRequest("stale", { requestId, tableId: "databaseIssueList", query, startedAt });
        return;
      }
      recordTableRequest("failed", { requestId, tableId: "databaseIssueList", query, startedAt, error: reason });
      setNotice(reason instanceof Error ? reason.message : String(reason));
      setIssueStatus("error");
    });
  }, [query, overviewStatus, state.database.canRead, databaseIdentity]);

  useEffect(() => {
    if (!state.database.canRead || !issueInteractionReady) return;
    const requestId = ++distributionRequest.current;
    setDistributionStatus("loading");
    void window.desktopApp?.databaseViewer?.issueDistributions(query).then((result) => {
      if (requestId !== distributionRequest.current) return;
      setDistributions(result ?? null);
      setDistributionStatus("ready");
      setDatabaseLoadStatus("ready");
    }).catch((reason) => {
      if (requestId !== distributionRequest.current) return;
      setNotice(reason instanceof Error ? reason.message : String(reason));
      setDistributionStatus("error");
      setDatabaseLoadStatus("error");
    });
  }, [databaseIdentity, issueInteractionReady, query, state.database.canRead]);
  useEffect(() => { void refresh(); }, [refresh, state.database.requestId]);
  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((loaded) => {
      const next = loaded?.preferences.databaseIssueList as DatabaseIssueListPreferences | undefined;
      setFilterPresets(loaded?.preferences.filterPresets ?? []);
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

  function saveFilterPresets(next: FilterPreset[]) {
    setFilterPresets(next);
    void window.desktopApp?.uiPreferences?.update({ section: "filterPresets", value: next }).then((loaded) => setFilterPresets(loaded.preferences.filterPresets));
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
        <button className="btn" type="button" disabled={!state.database.canRead || issueStatus === "loading"} onClick={() => void refresh()}><RefreshCw size={16} />快速重新整理 / Refresh</button>
        <button className="btn" type="button" disabled={!state.database.canRead || healthRunning} onClick={() => void fullHealthCheck()}><Wrench size={16} />{healthRunning ? "檢查中..." : "完整健康檢查 / Health"}</button>
        <button className="btn" type="button" disabled={!state.database.path} onClick={() => void copyDatabasePath()}><Copy size={16} />複製路徑 / Copy Path</button>
      </div>

      {notice ? <div className={`mb-4 rounded-md border p-4 text-sm font-bold ${overviewStatus === "error" || issueStatus === "error" || distributionStatus === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{notice}</div> : null}

      <SectionCard title="目前資料庫" subtitle="Current Database">
        <div className="grid min-w-0 grid-cols-1 gap-3 text-sm font-semibold md:grid-cols-2 xl:grid-cols-4">
          <div><b>Status：</b>{state.database.status === "CHECKING" ? "Connecting" : !state.database.canRead ? (state.database.status === "NOT_CONFIGURED" ? "Not configured" : "Error") : issueInteractionReady && distributionStatus === "ready" ? "Ready" : "Loading"}</div>
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

          {distributions ? <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-4">
            {(["projectKey", "issueType", "status", "priority"] as const).map((field) => <DistributionPanel key={field} title={field === "projectKey" ? "Project 分布" : field === "issueType" ? "類型分布" : field === "status" ? "狀態分布" : "優先級分布"} subtitle={`${field} · ${distributions.total} issues`} total={distributions.total} items={distributions[field]} onSelect={(value) => setQuery((current) => ({ ...current, page: 1, filters: { ...current.filters, [field]: { values: [value === "未設定" ? "__UNSET__" : value] } } }))} />)}
          </div> : distributionStatus === "loading" ? <div className="mt-4 rounded-md border border-line bg-white p-5 text-sm font-bold text-muted">Loading distributions...</div> : null}

          <SectionCard className="mt-4" title="Issue 範圍" subtitle="Issue Scope">
            <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
              <label className="min-w-0"><span className="mb-1 block text-xs font-black text-muted">Date Mode / 日期依據</span><select className="field" value={query.dateMode ?? "activity"} onChange={(event) => setQuery((current) => ({ ...current, page: 1, dateMode: event.currentTarget.value as DatabaseIssueQuery["dateMode"], revision: (current.revision ?? 0) + 1 }))}><option value="activity">Activity Events Date / 活動事件日期</option><option value="created">Jira Created Date / 建立日期</option><option value="updated">Jira Last Updated Date / 最後更新日期</option></select></label>
              <DateRangeControl value={query.dateRange ?? ALL_TIME_DATE_RANGE} onChange={(dateRange) => setQuery((current) => ({ ...current, page: 1, dateRange, revision: (current.revision ?? 0) + 1 }))} />
            </div>
            <div className="mt-3"><FilterPresetControl viewerId="databaseOverview" tabId="issueList" query={query} presets={filterPresets} onApply={(next) => setQuery(next as DatabaseIssueQuery)} onPresetsChange={saveFilterPresets} /></div>
          </SectionCard>
          <SectionCard className="mt-4" title="Issue 清單" subtitle="Issue List">
            <SectionErrorBoundary context="database-overview-issue-list" resetKey={databaseIdentity}>
            <DatabaseIssueTable
              result={issues}
              query={query}
              preferences={preferences}
              loading={issueStatus === "loading"}
              disabled={!issueInteractionReady}
              onQueryChange={(next) => setQuery((current) => ({ ...next, revision: (current.revision ?? 0) + 1 }))}
              onPreferencesChange={savePreferences}
              loadDistinct={async (field, search) => (await window.desktopApp?.databaseViewer?.distinctValues({ source: "databaseIssues", subjectId: "", field, search, limit: 100, query })) ?? { field, values: [], truncated: false }}
            />
            </SectionErrorBoundary>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
