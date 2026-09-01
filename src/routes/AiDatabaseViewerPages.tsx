import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, Filter, RefreshCw, RotateCcw, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";

type Variant = "ai" | "integrated";
type Row = Record<string, unknown>;
type QueryFilter = { field: string; operator: "EQ" | "CONTAINS" | "IN" | "GTE" | "LT"; value?: string; values?: string[] };
type QueryState = { page: number; pageSize: number; filters: QueryFilter[]; sort: Array<{ field: string; direction: "asc" | "desc" }> };
type QueryResult = { ok?: boolean; errorCode?: string; message?: string; totalCount?: number; filteredCount?: number; rows?: Row[]; page?: number; pageSize?: number; durationMs?: number; appliedFilters?: string[]; integrationState?: string; missingColumns?: string[]; matchedCount?: number; aiRecordCount?: number };
type Column = { id: string; label: string; field: string; value: (row: Row) => unknown; width: string };

type DraftFilters = { actor: string; issueKey: string; fieldName: string; aiStatus: string; reviewState: string; linkStatus: string; analysisState: string; startDate: string; endDate: string };
const EMPTY: DraftFilters = { actor: "", issueKey: "", fieldName: "", aiStatus: "", reviewState: "", linkStatus: "", analysisState: "", startDate: "", endDate: "" };
const makeRequestId = (kind: string) => `v040-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);

const AI_COLUMNS: Column[] = [
  { id: "eventTime", label: "時間", field: "eventTime", value: (row) => row.event_time_utc, width: "min-w-[150px]" },
  { id: "actor", label: "人員", field: "actor", value: (row) => row.actor_display_value, width: "min-w-[150px]" },
  { id: "issueKey", label: "Issue", field: "issueKey", value: (row) => row.issue_key, width: "min-w-[120px]" },
  { id: "fieldName", label: "Field", field: "fieldName", value: (row) => row.field_name, width: "min-w-[120px]" },
  { id: "aiStatus", label: "AI Status", field: "aiStatus", value: (row) => row.ai_status, width: "min-w-[120px]" },
  { id: "effectiveStatus", label: "Effective", field: "effectiveStatus", value: (row) => row.effective_status, width: "min-w-[120px]" },
  { id: "reviewState", label: "Review", field: "reviewState", value: (row) => row.review_state, width: "min-w-[150px]" },
  { id: "skills", label: "Skills", field: "skillId", value: (row) => row.skill_ids, width: "min-w-[180px]" },
  { id: "linkStatus", label: "Link", field: "linkStatus", value: (row) => row.link_status, width: "min-w-[160px]" },
  { id: "confidence", label: "Confidence", field: "aiStatus", value: (row) => row.ai_confidence, width: "min-w-[100px]" },
  { id: "rationale", label: "Rationale", field: "aiStatus", value: (row) => row.ai_rationale, width: "min-w-[280px]" }
];
const INTEGRATED_COLUMNS: Column[] = [
  { id: "eventTime", label: "時間", field: "eventTime", value: (row) => row.event_time, width: "min-w-[150px]" },
  { id: "actor", label: "人員", field: "actor", value: (row) => row.actor_display_name || row.actor_account_id, width: "min-w-[150px]" },
  { id: "issueKey", label: "Issue", field: "issueKey", value: (row) => row.issue_key, width: "min-w-[120px]" },
  { id: "fieldName", label: "Field", field: "fieldName", value: (row) => row.field_name, width: "min-w-[120px]" },
  { id: "analysisState", label: "Analysis State", field: "analysisState", value: (row) => row.analysis_state, width: "min-w-[140px]" },
  { id: "aiStatus", label: "AI Status", field: "aiStatus", value: (row) => row.ai_status, width: "min-w-[120px]" },
  { id: "reviewState", label: "Review", field: "reviewState", value: (row) => row.review_state, width: "min-w-[150px]" },
  { id: "linkStatus", label: "Link", field: "linkStatus", value: (row) => row.link_status || (row.analysis_state === "UNANALYZED" ? "NO_AI_RECORD" : "-"), width: "min-w-[150px]" },
  { id: "before", label: "Before", field: "fieldName", value: (row) => row.from_value_json, width: "min-w-[240px]" },
  { id: "after", label: "After", field: "fieldName", value: (row) => row.to_value_json, width: "min-w-[240px]" }
];

function filtersOf(value: DraftFilters, integrated: boolean): QueryFilter[] {
  const result: QueryFilter[] = [];
  for (const field of ["actor", "issueKey", "fieldName"] as const) if (value[field].trim()) result.push({ field, operator: "CONTAINS", value: value[field].trim() });
  for (const field of ["aiStatus", "reviewState", "linkStatus"] as const) if (value[field]) result.push({ field, operator: "EQ", value: value[field] });
  if (integrated && value.analysisState && value.analysisState !== "ALL") result.push({ field: "analysisState", operator: "EQ", value: value.analysisState });
  if (value.startDate) result.push({ field: "eventTime", operator: "GTE", value: value.startDate });
  if (value.endDate) result.push({ field: "eventTime", operator: "LT", value: value.endDate + "T23:59:59.999Z" });
  return result;
}
function StateBanner({ result }: { result: QueryResult }) {
  if (result.errorCode === "RAW_DATABASE_CLOSED") return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold" data-testid="integration-state">原始資料庫尚未開啟 / Blocked Raw DB</div>;
  if (result.errorCode === "QUERY_SCHEMA_ERROR") return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm" data-testid="integration-state"><strong>整合查詢 Schema 不相容 / QUERY_SCHEMA_ERROR</strong><div className="mt-1 break-words">缺少欄位：{result.missingColumns?.join(", ") || "unknown"}</div><div className="mt-1">這不是 DB Closed，也不是 Empty Results。</div></div>;
  if (result.errorCode) return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold" data-testid="integration-state">查詢失敗 / {result.errorCode}: {result.message}</div>;
  if (result.integrationState === "BLOCKED_AI_DB") return <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-bold" data-testid="integration-state">AI DB 尚未選擇；原始資料仍會顯示為 UNANALYZED。</div>;
  if (result.integrationState === "READY_NO_MATCH") return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold" data-testid="integration-state">整合查詢可用，但 0 / {result.aiRecordCount ?? 0} AI records 配對。原始資料仍完整顯示，請執行 Relink。</div>;
  if (result.integrationState === "READY_PARTIAL") return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold" data-testid="integration-state">部分配對：{result.matchedCount ?? 0} / {result.aiRecordCount ?? 0}。ANALYZED 與 UNANALYZED 同時保留。</div>;
  return <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold" data-testid="integration-state">整合查詢已就緒 / Integration Ready</div>;
}

function Viewer({ variant }: { variant: Variant }) {
  const integrated = variant === "integrated", columns = integrated ? INTEGRATED_COLUMNS : AI_COLUMNS;
  const preferenceSection = integrated ? "integratedResults" as const : "aiResults" as const;
  const defaultColumns = columns.filter((column) => !["rationale", "before"].includes(column.id)).map((column) => column.id);
  const allowedColumns = useMemo(() => new Set(columns.map((column) => column.id)), [columns]);
  const [draft, setDraft] = useState<DraftFilters>({ ...EMPTY, analysisState: "ALL" });
  const [query, setQuery] = useState<QueryState>({ page: 1, pageSize: 50, filters: [], sort: [{ field: "eventTime", direction: "desc" }] });
  const [result, setResult] = useState<QueryResult>({ totalCount: 0, filteredCount: 0, rows: [] });
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const preferencesLoaded = useRef(false);
  const [columnsOpen, setColumnsOpen] = useState(false), [busy, setBusy] = useState(false);
  const api = window.desktopApp?.aiDatabase;
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const request = { requestId: makeRequestId("query"), ...query, visibleColumns };
      const response = integrated ? await api?.queryIntegrated(request) : await api?.queryResults(request);
      setResult((response ?? { ok: false, errorCode: "BRIDGE_UNAVAILABLE", rows: [] }) as QueryResult);
    } finally { setBusy(false); }
  }, [api, integrated, query, visibleColumns]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    void window.desktopApp?.uiPreferences?.get().then((loaded) => {
      if (!active) return;
      const stored = loaded.preferences[preferenceSection]?.visibleColumns ?? [];
      const safe = stored.filter((item) => allowedColumns.has(item));
      if (safe.length) setVisibleColumns(safe);
      preferencesLoaded.current = true;
    });
    return () => { active = false; };
  }, [allowedColumns, preferenceSection]);
  useEffect(() => {
    if (!preferencesLoaded.current) return;
    void window.desktopApp?.uiPreferences?.update({
      section: preferenceSection,
      value: { visibleColumns, columnOrder: [...visibleColumns, ...columns.map((column) => column.id).filter((id) => !visibleColumns.includes(id))], columnWidths: {}, pageSize: query.pageSize, pageIndex: query.page, sort: query.sort[0] ?? null, filters: {} }
    });
  }, [columns, preferenceSection, query.page, query.pageSize, query.sort, visibleColumns]);
  const shown = visibleColumns.map((id) => columns.find((column) => column.id === id)).filter((column): column is Column => Boolean(column));
  const moveColumn = (id: string, offset: -1 | 1) => setVisibleColumns((current) => {
    const index = current.indexOf(id), target = index + offset;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const pages = Math.max(1, Math.ceil(Number(result.filteredCount ?? 0) / query.pageSize));
  const apply = () => setQuery((current) => ({ ...current, page: 1, filters: filtersOf(draft, integrated) }));
  const clear = () => { const next = { ...EMPTY, analysisState: "ALL" }; setDraft(next); setQuery((current) => ({ ...current, page: 1, filters: [] })); };
  const removeFilter = (index: number) => setQuery((current) => ({ ...current, page: 1, filters: current.filters.filter((_item, itemIndex) => itemIndex !== index) }));
  const toggleSort = (field: string) => setQuery((current) => ({ ...current, page: 1, sort: [{ field, direction: current.sort[0]?.field === field && current.sort[0].direction === "asc" ? "desc" : "asc" }] }));
  return <div className="min-w-0 space-y-4" data-testid={integrated ? "integrated-results-page" : "ai-results-page"}>
    <PageHeader title={integrated ? "整合顯示結果" : "AI 結果檢視"} subtitle={integrated ? "Integrated Results" : "AI Results Viewer"} connected={!result.errorCode} />
    {integrated ? <StateBanner result={result} /> : result.errorCode ? <StateBanner result={result} /> : null}
    <SectionCard title="篩選條件 / Filters" subtitle="與 User Viewer 共用套用、清除、Chips、欄位與排序操作模型" action={<div className="relative flex flex-wrap gap-2"><button className="btn-secondary" type="button" onClick={() => setColumnsOpen((value) => !value)}><Columns3 size={16} /> 選擇顯示欄位</button><button className="btn-secondary" type="button" onClick={() => void api?.exportQuery({ requestId: makeRequestId("export"), kind: variant, query })}><Download size={16} /> 匯出篩選結果</button>{columnsOpen ? <div className="absolute right-0 top-11 z-30 w-72 rounded-md border border-line bg-white p-3 shadow-xl"><div className="mb-2 font-black">顯示欄位</div>{columns.map((column) => { const visibleIndex = visibleColumns.indexOf(column.id); return <div className="flex items-center gap-2 py-1" key={column.id}><label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={visibleIndex >= 0} onChange={(event) => setVisibleColumns((current) => event.target.checked ? [...current, column.id] : current.filter((item) => item !== column.id))} /><span className="truncate" title={column.label}>{column.label}</span></label><button className="icon-button h-7 w-7" type="button" title="Move up" disabled={visibleIndex <= 0} onClick={() => moveColumn(column.id, -1)}><ArrowUp size={13} /></button><button className="icon-button h-7 w-7" type="button" title="Move down" disabled={visibleIndex < 0 || visibleIndex >= visibleColumns.length - 1} onClick={() => moveColumn(column.id, 1)}><ArrowDown size={13} /></button></div>; })}<button className="btn-secondary mt-2 w-full" type="button" onClick={() => setVisibleColumns(defaultColumns)}><RotateCcw size={15} /> 恢復預設欄位</button></div> : null}</div>}>
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <label className="text-xs font-bold text-muted">人員 / Actor<input className="input mt-1 w-full" value={draft.actor} onChange={(event) => setDraft((value) => ({ ...value, actor: event.target.value }))} /></label>
        <label className="text-xs font-bold text-muted">Issue<input className="input mt-1 w-full" value={draft.issueKey} onChange={(event) => setDraft((value) => ({ ...value, issueKey: event.target.value }))} /></label>
        <label className="text-xs font-bold text-muted">AI Status<select className="input mt-1 w-full" value={draft.aiStatus} onChange={(event) => setDraft((value) => ({ ...value, aiStatus: event.target.value }))}><option value="">全部</option>{["CLASSIFIED","EXCLUDED","UNKNOWN","FAILED"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold text-muted">Review State<select className="input mt-1 w-full" value={draft.reviewState} onChange={(event) => setDraft((value) => ({ ...value, reviewState: event.target.value }))}><option value="">全部</option>{["AI_ONLY","REVIEW_PARTIAL","REVIEW_COMPLETED"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold text-muted">Link Status<select className="input mt-1 w-full" value={draft.linkStatus} onChange={(event) => setDraft((value) => ({ ...value, linkStatus: event.target.value }))}><option value="">全部</option>{["MATCHED","NOT_ATTEMPTED","SOURCE_RECORD_NOT_FOUND","SOURCE_IDENTITY_MISMATCH","SOURCE_CONTENT_MISMATCH","LINK_ERROR", ...(integrated ? ["NO_AI_RECORD"] : [])].map((item) => <option key={item}>{item}</option>)}</select></label>
        {integrated ? <label className="text-xs font-bold text-muted">Analysis State<select className="input mt-1 w-full" value={draft.analysisState} onChange={(event) => setDraft((value) => ({ ...value, analysisState: event.target.value }))}><option value="ALL">全部</option><option value="ANALYZED">ANALYZED</option><option value="UNANALYZED">UNANALYZED</option></select></label> : <label className="text-xs font-bold text-muted">Field<input className="input mt-1 w-full" value={draft.fieldName} onChange={(event) => setDraft((value) => ({ ...value, fieldName: event.target.value }))} /></label>}
        <label className="text-xs font-bold text-muted">開始日期<input className="input mt-1 w-full" type="date" value={draft.startDate} onChange={(event) => setDraft((value) => ({ ...value, startDate: event.target.value }))} /></label>
        <label className="text-xs font-bold text-muted">結束日期<input className="input mt-1 w-full" type="date" value={draft.endDate} onChange={(event) => setDraft((value) => ({ ...value, endDate: event.target.value }))} /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap gap-2">{query.filters.length ? query.filters.map((item, index) => <button className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800" type="button" key={`${item.field}-${index}`} onClick={() => removeFilter(index)}>{item.field} {item.operator} {item.value ?? item.values?.join(", ")}<X size={12} /></button>) : <span className="text-xs text-muted">尚未套用篩選條件</span>}</div><div className="flex flex-wrap gap-2"><button className="btn-secondary" type="button" onClick={clear}>全部清除</button><button className="btn-primary" type="button" onClick={apply}><Filter size={16} /> 套用篩選</button></div></div>
    </SectionCard>
    <SectionCard title={`${Number(result.filteredCount ?? 0).toLocaleString()} / ${Number(result.totalCount ?? 0).toLocaleString()} records`} subtitle={`${integrated ? "Raw Activity Events LEFT JOIN Current AI" : "AI SQLite only"} · ${result.durationMs ?? 0} ms`} action={<div className="flex items-center gap-2"><button className="icon-button" type="button" title="Refresh" onClick={() => void load()}><RefreshCw size={16} /></button><button className="icon-button" type="button" title="Previous" disabled={query.page <= 1 || busy} onClick={() => setQuery((value) => ({ ...value, page: value.page - 1 }))}><ChevronLeft size={17} /></button><span className="text-xs font-black" data-no-clip="true">{query.page} / {pages}</span><button className="icon-button" type="button" title="Next" disabled={query.page >= pages || busy} onClick={() => setQuery((value) => ({ ...value, page: value.page + 1 }))}><ChevronRight size={17} /></button></div>}>
      <ResponsiveTableContainer><table className="w-full min-w-max text-left text-xs"><thead><tr className="border-b text-muted">{shown.map((column) => <th className={`${column.width} p-2`} key={column.id}><button className="flex items-center gap-1 font-bold" type="button" onClick={() => toggleSort(column.field)}>{column.label}<ChevronDown size={13} /></button></th>)}</tr></thead><tbody>{(result.rows ?? []).map((row, rowIndex) => <tr className="border-b" key={String(row.ai_record_id ?? row.activity_event_id ?? rowIndex)}>{shown.map((column) => { const value = text(column.value(row)); return <td className={`${column.width} max-w-[360px] break-words p-2 align-top`} title={value} key={column.id}>{value}</td>; })}</tr>)}</tbody></table></ResponsiveTableContainer>
      {!busy && !result.errorCode && !(result.rows ?? []).length ? <div className="py-8 text-center text-sm text-muted">目前篩選條件沒有結果 / No rows match the active filters.</div> : null}
    </SectionCard>
  </div>;
}
export function AiResultsPage() { return <Viewer variant="ai" />; }
export function IntegratedResultsPage() { return <Viewer variant="integrated" />; }