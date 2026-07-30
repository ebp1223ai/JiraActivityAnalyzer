import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Filter, Settings2, X } from "lucide-react";
import type { ViewerDistinctResult, ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { TablePreferences } from "../types/uiPreferences";
import { ExcelFilterPopover } from "./ExcelFilterPopover";

export type SqliteTableColumn = {
  id: string;
  label: string;
  kind: "text" | "multi" | "date" | "number";
  width?: number;
  render?: (row: Record<string, unknown>) => ReactNode;
};

type Props = {
  columns: SqliteTableColumn[];
  result: ViewerTableResult;
  query: ViewerTableQuery;
  loading?: boolean;
  error?: string;
  onQueryChange: (query: ViewerTableQuery) => void;
  loadDistinct?: (field: string, search: string) => Promise<ViewerDistinctResult>;
  preferences?: TablePreferences;
  onPreferencesChange?: (preferences: TablePreferences) => void;
};

function text(value: unknown) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

export function SqliteDataTable({ columns, result, query, loading, error, onQueryChange, loadDistinct, preferences, onPreferencesChange }: Props) {
  const [filterColumn, setFilterColumn] = useState("");
  const [distinctSearch, setDistinctSearch] = useState("");
  const [distinct, setDistinct] = useState<ViewerDistinctResult | null>(null);
  const [distinctLoading, setDistinctLoading] = useState(false);
  const [visible, setVisible] = useState(preferences?.visibleColumns ?? columns.map((column) => column.id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const distinctRequest = useRef(0);
  const shown = useMemo(() => {
    const order = preferences?.columnOrder ?? columns.map((column) => column.id);
    return order.map((id) => columns.find((column) => column.id === id)).filter((column): column is SqliteTableColumn => Boolean(column && visible.includes(column.id)));
  }, [columns, preferences?.columnOrder, visible]);
  const activeColumn = columns.find((column) => column.id === filterColumn);

  useEffect(() => {
    if (!activeColumn || activeColumn.kind !== "multi" || !loadDistinct) return;
    const requestId = ++distinctRequest.current;
    setDistinctLoading(true);
    const timer = window.setTimeout(() => void loadDistinct(activeColumn.id, distinctSearch).then((next) => {
      if (requestId === distinctRequest.current) setDistinct(next);
    }).catch(() => {
      if (requestId === distinctRequest.current) setDistinct({ field: activeColumn.id, values: [], truncated: false });
    }).finally(() => {
      if (requestId === distinctRequest.current) setDistinctLoading(false);
    }), 250);
    return () => window.clearTimeout(timer);
  }, [activeColumn?.id, activeColumn?.kind, distinctSearch, loadDistinct]);

  useEffect(() => {
    if (preferences) setVisible(preferences.visibleColumns);
  }, [preferences?.visibleColumns]);

  function setColumnVisible(columnId: string, checked: boolean) {
    const next = checked ? Array.from(new Set([...visible, columnId])) : visible.filter((id) => id !== columnId);
    setVisible(next);
    if (preferences && onPreferencesChange) onPreferencesChange({ ...preferences, visibleColumns: next });
  }

  function sort(column: SqliteTableColumn) {
    const current = query.sort;
    const next = current?.field !== column.id ? { field: column.id, direction: "asc" as const } : current.direction === "asc" ? { field: column.id, direction: "desc" as const } : null;
    onQueryChange({ ...query, page: 1, sort: next });
  }

  function clearFilter(column: string) {
    const filters = { ...query.filters };
    delete filters[column];
    onQueryChange({ ...query, page: 1, filters });
    setFilterColumn("");
  }

  function setFilter(column: string, value: Record<string, unknown>) {
    onQueryChange({ ...query, page: 1, filters: { ...query.filters, [column]: value } });
  }

  function openFilter(column: SqliteTableColumn) {
    setFilterColumn(column.id);
    setDistinctSearch("");
    setDistinct(null);
  }

  return (
    <div className="min-w-0" aria-busy={loading}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
        <span>篩選後 {result.filteredCount.toLocaleString()}／全部 {result.totalCount.toLocaleString()}</span>
        <div className="flex gap-2">
          {Object.keys(query.filters).length ? <button className="btn" type="button" onClick={() => onQueryChange({ ...query, page: 1, filters: {} })}><X size={14} />清除全部篩選</button> : null}
          <button className="btn" type="button" onClick={() => setSettingsOpen((value) => !value)}><Settings2 size={14} />欄位</button>
        </div>
      </div>
      {settingsOpen ? <div className="mb-3 flex flex-wrap gap-3 rounded-md border border-line bg-slate-50 p-3">{columns.map((column) => <label key={column.id} className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={visible.includes(column.id)} onChange={(event) => setColumnVisible(column.id, event.target.checked)} />{column.label}</label>)}</div> : null}
      {error ? <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div> : null}
      <div className="thin-scroll max-w-full overflow-x-auto rounded-md border border-line" data-table-scroll-container="true">
        <table className="w-max min-w-full table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>{shown.map((column) => <th key={column.id} className="relative border-b border-line px-3 py-2" style={{ width: preferences?.columnWidths[column.id] ?? column.width ?? 150 }}>
              <div className="flex items-center gap-1">
                <button className="flex min-w-0 flex-1 items-center gap-1 font-black" type="button" onClick={() => sort(column)}><span className="truncate">{column.label}</span>{query.sort?.field === column.id ? query.sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ChevronsUpDown size={13} className="text-slate-400" />}</button>
                <button className={`icon-btn ${query.filters[column.id] ? "!text-blue-700" : ""}`} type="button" onClick={() => openFilter(column)} title={`Filter ${column.label}`}><Filter size={13} /></button>
              </div>
              {filterColumn === column.id && column.kind === "multi" ? <ExcelFilterPopover label={column.label} selected={query.filters[column.id]?.values ?? []} search={distinctSearch} result={distinct} loading={distinctLoading} onSearchChange={setDistinctSearch} onCancel={() => setFilterColumn("")} onApply={(values) => { setFilter(column.id, { values }); setFilterColumn(""); }} /> : null}
              {filterColumn === column.id && column.kind !== "multi" ? <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-line bg-white p-3 shadow-xl">
                {column.kind === "date" ? <div className="space-y-2"><input className="field" type="date" value={query.filters[column.id]?.from ?? ""} onChange={(event) => setFilter(column.id, { ...query.filters[column.id], from: event.target.value })} /><input className="field" type="date" value={query.filters[column.id]?.to ?? ""} onChange={(event) => setFilter(column.id, { ...query.filters[column.id], to: event.target.value })} /></div> : column.kind === "number" ? <div className="grid grid-cols-2 gap-2"><input className="field" type="number" placeholder="Min" value={query.filters[column.id]?.min ?? ""} onChange={(event) => setFilter(column.id, { ...query.filters[column.id], min: event.target.value })} /><input className="field" type="number" placeholder="Max" value={query.filters[column.id]?.max ?? ""} onChange={(event) => setFilter(column.id, { ...query.filters[column.id], max: event.target.value })} /></div> : <input autoFocus className="field" value={query.filters[column.id]?.text ?? ""} onChange={(event) => setFilter(column.id, { text: event.target.value })} placeholder="關鍵字..." />}
                <div className="mt-3 flex justify-between"><button className="text-xs font-bold text-rose-700" type="button" onClick={() => clearFilter(column.id)}>清除此欄</button><button className="btn" type="button" onClick={() => setFilterColumn("")}>完成</button></div>
              </div> : null}
            </th>)}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={shown.length} className="h-1 bg-blue-500 p-0" aria-label="Loading table rows" /></tr> : null}
            {!loading && !result.rows.length ? <tr><td colSpan={shown.length} className="p-10 text-center font-bold text-muted">沒有符合條件的資料 / No matching records</td></tr> : null}
            {result.rows.map((row, rowIndex) => <tr key={String(row.eventId ?? row.issueKey ?? rowIndex)} className="border-b border-line last:border-0 hover:bg-blue-50/30">{shown.map((column) => <td key={column.id} className="max-w-0 px-3 py-2 align-top">{column.render ? column.render(row) : <span className="block truncate" title={text(row[column.id])}>{text(row[column.id])}</span>}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
        <label className="flex items-center gap-2">每頁<select className="field !w-auto !py-1" value={query.pageSize} onChange={(event) => { const pageSize = Number(event.target.value) as ViewerTableQuery["pageSize"]; onQueryChange({ ...query, page: 1, pageSize }); if (preferences && onPreferencesChange) onPreferencesChange({ ...preferences, pageSize }); }}>{[25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label>
        <div className="flex items-center gap-2">
          <button className="icon-btn" type="button" disabled={result.page <= 1} onClick={() => onQueryChange({ ...query, page: 1 })} title="First page"><ChevronFirst size={16} /></button>
          <button className="icon-btn" type="button" disabled={result.page <= 1} onClick={() => onQueryChange({ ...query, page: result.page - 1 })} title="Previous page"><ChevronLeft size={16} /></button>
          <span>{result.page}／{result.pageCount}</span>
          <button className="icon-btn" type="button" disabled={result.page >= result.pageCount} onClick={() => onQueryChange({ ...query, page: result.page + 1 })} title="Next page"><ChevronRight size={16} /></button>
          <button className="icon-btn" type="button" disabled={result.page >= result.pageCount} onClick={() => onQueryChange({ ...query, page: result.pageCount })} title="Last page"><ChevronLast size={16} /></button>
        </div>
      </div>
    </div>
  );
}