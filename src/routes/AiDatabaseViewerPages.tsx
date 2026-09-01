import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Filter, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";

type Variant = "ai" | "integrated";
type QueryResult = { ok?: boolean; total?: number; limit?: number; offset?: number; items?: Array<Record<string, any>>; sourceAvailable?: boolean; message?: string };
const initialFilters = { actor: "", issue: "", field: "", aiStatus: "", effectiveStatus: "", reviewState: "", linkStatus: "", analysisState: "ALL", startDate: "", endDate: "" };
const makeRequestId = (kind: string) => `v039-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function Cell({ value, title }: { value: unknown; title?: string }) {
  const text = value === null || value === undefined || value === "" ? "-" : String(value);
  return <td className="max-w-[240px] break-words p-2 align-top" title={title ?? text}>{text}</td>;
}

function Viewer({ variant }: { variant: Variant }) {
  const api = window.desktopApp?.aiDatabase;
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<QueryResult>({ total: 0, items: [], limit: 100, offset: 0 });
  const [busy, setBusy] = useState(false);
  const limit = 100;
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const requestId = makeRequestId("query");
      const response = variant === "integrated" ? await api?.queryIntegrated({ requestId, filters: applied, limit, offset }) : await api?.queryResults({ requestId, filters: applied, limit, offset });
      setResult(response ?? { total: 0, items: [], limit, offset });
    } finally { setBusy(false); }
  }, [api, applied, offset, variant]);
  useEffect(() => { void load(); }, [load]);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(Number(result.total ?? 0) / limit));
  const fields = useMemo(() => [
    ["actor", "人員 / Actor"], ["issue", "Issue"], ["field", "Field"], ["startDate", "開始日期"], ["endDate", "結束日期"]
  ] as const, []);

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title={variant === "ai" ? "AI 結果檢視" : "整合顯示結果"} subtitle={variant === "ai" ? "AI Results Viewer" : "Integrated Results"} connected={false} />
      <SectionCard title="Filters" subtitle="篩選條件" action={<div className="flex flex-wrap gap-2"><button className="btn-primary" type="button" onClick={() => { setOffset(0); setApplied({ ...filters }); }}><Filter size={16} /> Apply</button><button className="btn-secondary" type="button" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button><button className="btn-secondary" type="button" onClick={() => void api?.exportQuery({ requestId: makeRequestId("export"), kind: variant, filters: applied })}><Download size={16} /> Export JSON</button></div>}>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {fields.map(([key, label]) => <label className="min-w-0 text-xs font-bold text-muted" key={key}>{label}<input className="input mt-1 w-full min-w-0" type={key.endsWith("Date") ? "date" : "text"} value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          {variant === "integrated" ? <label className="text-xs font-bold text-muted">Analysis State<select className="input mt-1 w-full" value={filters.analysisState} onChange={(event) => setFilters((current) => ({ ...current, analysisState: event.target.value }))}><option value="ALL">All</option><option value="ANALYZED">Analyzed</option><option value="UNANALYZED">Unanalyzed</option></select></label> : null}
          <label className="text-xs font-bold text-muted">AI Status<select className="input mt-1 w-full" value={filters.aiStatus} onChange={(event) => setFilters((current) => ({ ...current, aiStatus: event.target.value }))}><option value="">All</option>{["CLASSIFIED", "UNKNOWN", "EXCLUDED", "FAILED"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-bold text-muted">Review State<select className="input mt-1 w-full" value={filters.reviewState} onChange={(event) => setFilters((current) => ({ ...current, reviewState: event.target.value }))}><option value="">All</option>{["AI_ONLY", "REVIEW_PARTIAL", "REVIEW_COMPLETED"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-xs font-bold text-muted">Link Status<select className="input mt-1 w-full" value={filters.linkStatus} onChange={(event) => setFilters((current) => ({ ...current, linkStatus: event.target.value }))}><option value="">All</option>{["MATCHED", "SOURCE_DATABASE_NOT_AVAILABLE", "SOURCE_RECORD_NOT_FOUND", "AMBIGUOUS", "SOURCE_IDENTITY_MISMATCH", "SOURCE_CONTENT_MISMATCH", "LINK_ERROR", "NOT_ATTEMPTED"].map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      </SectionCard>
      <SectionCard title={`${Number(result.total ?? 0).toLocaleString()} records`} subtitle={variant === "integrated" ? "Raw Activity Events LEFT JOIN Current AI" : "AI SQLite only"} action={<div className="flex items-center gap-2 text-xs font-bold"><button className="icon-button" title="Previous page" type="button" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={17} /></button><span data-no-clip="true">{page} / {pages}</span><button className="icon-button" title="Next page" type="button" disabled={page >= pages || busy} onClick={() => setOffset(offset + limit)}><ChevronRight size={17} /></button></div>}>
        {variant === "integrated" && result.sourceAvailable === false ? <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold">原始資料庫尚未開啟，整合顯示目前不可用。AI 資料仍可在「AI 結果檢視」查看。</div> : null}
        {result.ok === false ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold">{result.message ?? "Query failed"}</div> : null}
        <ResponsiveTableContainer>
          {variant === "ai" ? (
            <table className="w-full min-w-[1320px] text-left text-xs"><thead><tr className="border-b text-muted">{["Time", "Actor", "Issue", "Field", "AI Status", "Effective", "Review", "Skills", "Link", "Confidence", "Rationale"].map((name) => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>{(result.items ?? []).map((item) => <tr className="border-b" key={item.ai_record_id}><Cell value={item.event_time_utc} /><Cell value={item.actor_display_value} /><Cell value={item.issue_key} /><Cell value={item.field_name} /><Cell value={item.ai_status} /><Cell value={item.effective_status} /><Cell value={item.review_state} /><Cell value={item.skill_ids} /><Cell value={item.link_status} /><Cell value={item.ai_confidence} /><Cell value={item.ai_rationale} /></tr>)}</tbody></table>
          ) : (
            <table className="w-full min-w-[1280px] text-left text-xs"><thead><tr className="border-b text-muted">{["Time", "Actor", "Issue", "Field", "Analysis State", "AI Status", "Effective", "Review", "Link", "Before", "After"].map((name) => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>{(result.items ?? []).map((item) => <tr className="border-b" key={item.activity_event_id}><Cell value={item.event_time} /><Cell value={item.actor_display_name || item.actor_account_id} /><Cell value={item.issue_key} /><Cell value={item.field_name} /><Cell value={item.analysis_state} /><Cell value={item.ai_status} /><Cell value={item.effective_status} /><Cell value={item.review_state} /><Cell value={item.link_status} /><Cell value={item.from_value_json} /><Cell value={item.to_value_json} /></tr>)}</tbody></table>
          )}
        </ResponsiveTableContainer>
      </SectionCard>
    </div>
  );
}

export function AiResultsPage() { return <Viewer variant="ai" />; }
export function IntegratedResultsPage() { return <Viewer variant="integrated" />; }
