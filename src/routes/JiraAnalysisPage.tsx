import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Copy, ExternalLink, RefreshCw, Search } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { metricIcons } from "../data/mockData";
import { useConnectionContext } from "../state/ConnectionContext";
import type { AppOutletContext } from "../components/AppLayout";

type TableRow = ReactNode[];
type RawEndpoint = {
  name: string;
  method: string;
  path: string;
  status: string;
  records: string;
  json: unknown;
};

type JiraAnalysisResult = {
  ok: boolean;
  message?: string;
  logs?: string[];
  issue?: Record<string, string | number>;
  summary?: Record<string, string | number>;
  overview?: TableRow[];
  lifecycle?: TableRow[];
  participants?: TableRow[];
  transitions?: TableRow[];
  fields?: TableRow[];
  fieldChanges?: TableRow[];
  comments?: TableRow[];
  commentRows?: TableRow[];
  attachments?: TableRow[];
  links?: TableRow[];
  risks?: string[];
  timeline?: TableRow[];
  rawData?: RawEndpoint[];
};

type TabKey = "overview" | "lifecycle" | "participants" | "transitions" | "fieldChanges" | "comments" | "attachments" | "links" | "timeline" | "rawData";
type TabState = { page: number; pageSize: number; search: string; filter: string };

const rowsPerPageOptions = [10, 20, 40, 80, 160];
const tabLabels: Array<{ key: TabKey; label: string; sub: string }> = [
  { key: "overview", label: "Overview", sub: "總覽" },
  { key: "lifecycle", label: "Lifecycle", sub: "處理生命週期" },
  { key: "participants", label: "Participants", sub: "參與者" },
  { key: "transitions", label: "Status Transitions", sub: "狀態流轉" },
  { key: "fieldChanges", label: "Field Changes", sub: "欄位變更" },
  { key: "comments", label: "Comments", sub: "留言" },
  { key: "attachments", label: "Attachments", sub: "附件" },
  { key: "links", label: "Linked Issues", sub: "關聯 Issue" },
  { key: "timeline", label: "Activity Timeline", sub: "活動時間軸" },
  { key: "rawData", label: "Raw Data", sub: "原始資料" }
];

const defaultTabState: TabState = { page: 1, pageSize: 40, search: "", filter: "all" };

function cellText(cell: ReactNode): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") return String(cell);
  return "";
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function uniqueColumnValues(rows: TableRow[], columnIndex: number) {
  return Array.from(new Set(rows.map((row) => cellText(row[columnIndex])).filter(Boolean))).sort();
}

function LabelChips({ value }: { value: unknown }) {
  const labels = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item !== "-");
  if (labels.length === 0) return <span data-no-clip="true">-</span>;
  const visible = labels.slice(0, 6);
  const hiddenCount = labels.length - visible.length;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-2" title={labels.join(", ")}>
      {visible.map((label) => <span key={label} className="chip max-w-full break-words">{label}</span>)}
      {hiddenCount > 0 ? <span className="chip" data-no-clip="true">+{hiddenCount} more</span> : null}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: ReactNode }) {
  const title = typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  return (
    <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 max-w-full break-words font-black text-ink" title={title} data-no-clip="true">{value}</div>
    </div>
  );
}

function PaginatedTable({
  headers,
  rows,
  state,
  onStateChange,
  searchPlaceholder,
  filterLabel,
  filterOptions,
  filterColumn
}: {
  headers: string[];
  rows: TableRow[];
  state: TabState;
  onStateChange: (next: Partial<TabState>) => void;
  searchPlaceholder?: string;
  filterLabel?: string;
  filterOptions?: string[];
  filterColumn?: number;
}) {
  const filteredRows = useMemo(() => {
    const search = normalized(state.search);
    const filter = state.filter;
    return rows.filter((row) => {
      const text = normalized(row.map(cellText).join(" "));
      const matchesSearch = !search || text.includes(search);
      const matchesFilter = !filterColumn || filter === "all" || cellText(row[filterColumn]) === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filterColumn, rows, state.filter, state.search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / state.pageSize));
  const safePage = Math.min(state.page, pageCount);
  const startIndex = (safePage - 1) * state.pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + state.pageSize);
  const displayStart = filteredRows.length === 0 ? 0 : startIndex + 1;
  const displayEnd = Math.min(startIndex + state.pageSize, filteredRows.length);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <input
            className="field pr-10"
            value={state.search}
            onChange={(event) => onStateChange({ search: event.target.value, page: 1 })}
            placeholder={searchPlaceholder ?? "Search table"}
          />
          <Search className="absolute right-3 top-3 text-muted" size={18} />
        </div>
        {filterOptions?.length ? (
          <select className="field min-w-[180px] flex-none" value={state.filter} onChange={(event) => onStateChange({ filter: event.target.value, page: 1 })}>
            <option value="all">{filterLabel ?? "All"}</option>
            {filterOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        ) : null}
      </div>
      <DataTable headers={headers} rows={pageRows} />
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm font-bold text-muted">
        <span data-no-clip="true">顯示 {displayStart}-{displayEnd} / {filteredRows.length} 筆</span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span>Rows per page</span>
          <select className="field w-[92px] py-2" value={state.pageSize} onChange={(event) => onStateChange({ pageSize: Number(event.target.value), page: 1 })}>
            {rowsPerPageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button className="btn px-3 py-2" disabled={safePage <= 1} onClick={() => onStateChange({ page: safePage - 1 })}>Prev</button>
          <span data-no-clip="true">{safePage} / {pageCount}</span>
          <button className="btn px-3 py-2" disabled={safePage >= pageCount} onClick={() => onStateChange({ page: safePage + 1 })}>Next</button>
        </div>
      </div>
    </div>
  );
}

export function JiraAnalysisPage() {
  const { Activity, Clock, GitBranch, MessageSquare, Paperclip, Users } = metricIcons;
  const { activeConnection } = useConnectionContext();
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  const [issueKey, setIssueKey] = useState("COPGEN1-138930");
  const [result, setResult] = useState<JiraAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabStates, setTabStates] = useState<Partial<Record<TabKey, TabState>>>({});

  const tabState = tabStates[activeTab] ?? defaultTabState;
  const updateTabState = (next: Partial<TabState>) => setTabStates((current) => ({ ...current, [activeTab]: { ...defaultTabState, ...current[activeTab], ...next } }));

  async function handleLoad() {
    setError("");
    if (!activeConnection) {
      setError("Please configure an active Jira connection first.");
      return;
    }
    if (activeConnection.status !== "connected") {
      setError("Active connection is not verified. Please test connection first.");
      return;
    }
    setLoading(true);
    try {
      const response = await window.desktopApp?.jiraAnalysis?.load?.({ connection: activeConnection, issueKey }) as JiraAnalysisResult | undefined;
      if (!response) throw new Error("Jira Analysis IPC is not available.");
      setResult(response);
      setActiveTab("overview");
      setTabStates({});
      appendDebugLog("jira", response.logs ?? []);
      if (!response.ok) setError(response.message ?? "Jira Analysis failed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Jira Analysis failed.";
      setError(message);
      appendDebugLog("jira", [`[ERROR] ${message}`, "[INFO] No database write performed"]);
    } finally {
      setLoading(false);
    }
  }

  function openInJira() {
    if (!activeConnection || !issueKey) return;
    window.open(`${activeConnection.baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(issueKey)}`, "_blank");
  }

  function switchTab(key: TabKey) {
    setActiveTab(key);
    setTabStates((current) => ({ ...current, [key]: { ...defaultTabState, ...current[key], page: 1 } }));
  }

  const issue = result?.issue ?? {};
  const summary = result?.summary ?? {};
  const rawRows = (result?.rawData ?? []).map((endpoint) => [
    endpoint.name,
    endpoint.method,
    endpoint.path,
    endpoint.status,
    endpoint.records,
    JSON.stringify(endpoint.json, null, 2)
  ]);
  const selectedRaw = result?.rawData?.find((endpoint) => normalized(JSON.stringify(endpoint)).includes(normalized(tabState.search))) ?? result?.rawData?.[0];

  const renderTab = () => {
    if (!result?.ok) return null;
    if (activeTab === "overview") {
      return <PaginatedTable headers={["Field", "Value"]} rows={result.overview ?? []} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search overview fields" />;
    }
    if (activeTab === "lifecycle") {
      return <PaginatedTable headers={["Stage", "Time", "Duration"]} rows={result.lifecycle ?? []} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search lifecycle" />;
    }
    if (activeTab === "participants") {
      const rows = result.participants ?? [];
      return <PaginatedTable headers={["Participant", "Events", "Changelog", "Comments", "Attachments", "Status", "First", "Last"]} rows={rows} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search participants" />;
    }
    if (activeTab === "transitions") {
      return <PaginatedTable headers={["From", "To", "Count", "First", "Last", "Actors"]} rows={result.transitions ?? []} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search transitions" />;
    }
    if (activeTab === "fieldChanges") {
      const rows = result.fieldChanges ?? [];
      return <PaginatedTable headers={["Time", "Actor", "Field", "From", "To", "Changelog ID", "Item Index"]} rows={rows} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search field / actor / from / to" filterLabel="All fields" filterOptions={uniqueColumnValues(rows, 2)} filterColumn={2} />;
    }
    if (activeTab === "comments") {
      const rows = result.commentRows ?? [];
      return <PaginatedTable headers={["Created", "Updated", "Author", "Body Preview", "Edited?", "Comment ID", "Actions"]} rows={rows} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search author / body" filterLabel="All authors" filterOptions={uniqueColumnValues(rows, 2)} filterColumn={2} />;
    }
    if (activeTab === "attachments") {
      const rows = result.attachments ?? [];
      return <PaginatedTable headers={["Created", "Filename", "Author", "MIME Type", "Size", "Content URL", "Thumbnail URL", "Type", "Actions"]} rows={rows} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search filename / uploader / MIME" filterLabel="All types" filterOptions={["image", "log", "excel", "zip", "other"]} filterColumn={7} />;
    }
    if (activeTab === "links") {
      return <PaginatedTable headers={["Link ID", "Type", "Direction", "Issue Key", "Summary", "Status", "Issue Type"]} rows={result.links ?? []} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search linked issues" />;
    }
    if (activeTab === "timeline") {
      const rows = result.timeline ?? [];
      return <PaginatedTable headers={["Time", "Actor", "Event Type", "Details", "Source", "Confidence"]} rows={rows} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search actor / event / details" filterLabel="All event types" filterOptions={uniqueColumnValues(rows, 2)} filterColumn={2} />;
    }
    return (
      <div className="min-w-0">
        <PaginatedTable headers={["Endpoint", "Method", "Path", "Status", "Records", "JSON Preview"]} rows={rawRows} state={tabState} onStateChange={updateTabState} searchPlaceholder="Search endpoint name or JSON text" />
        <div className="mt-3 rounded-lg border border-line bg-slate-950 p-4 text-slate-100">
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 break-words text-sm font-black">{selectedRaw?.name ?? "No endpoint selected"}</div>
            <button className="btn bg-white text-slate-700" onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedRaw?.json ?? {}, null, 2))}><Copy size={15} />Copy JSON</button>
          </div>
          <pre className="thin-scroll max-h-[360px] min-w-0 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{JSON.stringify(selectedRaw?.json ?? {}, null, 2)}</pre>
        </div>
      </div>
    );
  };

  return (
    <div className="min-w-0">
      <PageHeader title="Jira 分析" subtitle="Jira Analysis" />

      <SectionCard className="mb-4" title="Active Connection" subtitle="read-only Jira source">
        {activeConnection ? (
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3 text-sm font-semibold">
            <InfoTile label="Connection" value={activeConnection.name} />
            <InfoTile label="Base URL" value={activeConnection.baseUrl} />
            <InfoTile label="Auth Type" value={activeConnection.authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"} />
            <InfoTile label="API Version" value={activeConnection.apiVersion} />
            <InfoTile label="Token Source" value={activeConnection.tokenSource} />
            <InfoTile label="Status" value={activeConnection.status} />
            <InfoTile label="Last Tested" value={activeConnection.lastTestedAt || "-"} />
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Please configure an active Jira connection first. Go to Connections.
          </div>
        )}
      </SectionCard>

      <div className="mb-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_110px] xl:grid-cols-[minmax(0,1fr)_110px_170px_150px]">
        <input className="field" value={issueKey} onChange={(event) => setIssueKey(event.target.value)} />
        <button className="btn btn-primary" onClick={handleLoad} disabled={loading}><Search size={16} />{loading ? "Loading" : "Load"}</button>
        <button className="btn" onClick={handleLoad} disabled={loading}><RefreshCw size={16} />Refresh from Jira</button>
        <button className="btn" onClick={openInJira} disabled={!activeConnection} title={activeConnection ? `${activeConnection.baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(issueKey)}` : undefined}><ExternalLink size={16} />Open in Jira</button>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

      <SectionCard title="Issue Summary" subtitle="real read-only Jira data">
        {result?.ok ? (
          <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-4">
            <div className="min-w-0 xl:col-span-2">
              <div className="text-sm font-bold text-muted">Issue Key / Jira 編號</div>
              <div className="break-words text-2xl font-black" data-no-clip="true">{issue.key}</div>
              <p className="mt-3 max-w-xl break-words font-semibold">{issue.summary}</p>
              <div className="mt-4 flex flex-wrap gap-3"><StatusBadge>{String(issue.status)}</StatusBadge><StatusBadge tone="red">{String(issue.priority)}</StatusBadge></div>
            </div>
            <div className="min-w-0 space-y-3 text-sm font-semibold">
              <InfoTile label="Assignee" value={issue.assignee ?? "-"} />
              <InfoTile label="Creator" value={issue.creator ?? "-"} />
              <InfoTile label="Reporter" value={issue.reporter ?? "-"} />
            </div>
            <div className="min-w-0 space-y-3 text-sm font-semibold">
              <InfoTile label="Created" value={issue.created ?? "-"} />
              <InfoTile label="Updated" value={issue.updated ?? "-"} />
              <div className="rounded-lg border border-line bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-muted">Labels</div>
                <div className="mt-2"><LabelChips value={issue.labels} /></div>
              </div>
              <InfoTile label="Linked Issues" value={issue.linkedIssuesCount ?? 0} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-muted">Load an issue to show read-only Jira analysis.</div>
        )}
      </SectionCard>

      {result?.ok ? (
        <>
          <ResponsiveMetricGrid min={210} className="mt-3">
            <MetricCard label="Total Events" sub="events" value={String(summary.totalEvents)} icon={Activity} />
            <MetricCard label="Participants" sub="users" value={String(summary.participants)} icon={Users} />
            <MetricCard label="Comments" sub="comments" value={String(summary.comments)} icon={MessageSquare} />
            <MetricCard label="Attachments" sub="metadata" value={String(summary.attachments)} icon={Paperclip} />
            <MetricCard label="Status Changes" sub="status" value={String(summary.statusChanges)} icon={GitBranch} />
            <MetricCard label="Lead Time" sub="duration" value={String(summary.leadTime)} icon={Clock} />
          </ResponsiveMetricGrid>

          <SectionCard className="mt-4" title="Analysis Details" subtitle="tabs with pagination">
            <div className="mb-4 flex min-w-0 flex-wrap gap-2 border-b border-line pb-3">
              {tabLabels.map((tab) => (
                <button
                  key={tab.key}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${activeTab === tab.key ? "border-blue-600 bg-blue-600 text-white" : "border-line bg-white text-slate-700 hover:border-blue-300"}`}
                  onClick={() => switchTab(tab.key)}
                  type="button"
                  data-no-clip="true"
                >
                  <span className="block">{tab.label}</span>
                  <span className={`block text-xs ${activeTab === tab.key ? "text-blue-100" : "text-muted"}`}>{tab.sub}</span>
                </button>
              ))}
            </div>
            {renderTab()}
          </SectionCard>

          <SectionCard className="mt-4" title="Risk & Anomaly Hints" subtitle="rules">
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3 text-sm font-semibold">
              {(result.risks ?? []).map((risk) => <div key={risk} className="rounded-lg border border-line bg-slate-50 p-3">{risk}</div>)}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
