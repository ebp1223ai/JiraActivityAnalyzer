import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Filter, Settings2, X } from "lucide-react";
import type { ViewerDistinctResult, ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { TablePreferences } from "../types/uiPreferences";

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
  const [filterColumn, setFilterColumn] = useState<string>("");
  const [distinctSearch, setDistinctSearch] = useState("");
  const [distinct, setDistinct] = useState<ViewerDistinctResult | null>(null);
  const [draftValues, setDraftValues] = useState<string[]>([]);
  const [visible, setVisible] = useState(preferences?.visibleColumns ?? columns.map((column) => column.id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const distinctRequest = useRef(0);
  const shown = useMemo(() => {
    const order = preferences?.columnOrder ?? columns.map((column) => column.id);
    return order.map((id) => columns.find((column) => column.id === id))
      .filter((column): column is SqliteTableColumn => Boolean(column && visible.includes(column.id)));
  }, [columns, preferences?.columnOrder, visible]);
  const activeColumn = columns.find((column) => column.id === filterColumn);

  useEffect(() => {
    if (!activeColumn || activeColumn.kind !== "multi" || !loadDistinct) return;
    const requestId = ++distinctRequest.current;
    const timer = window.setTimeout(() => void loadDistinct(activeColumn.id, distinctSearch).then((next) => {
      if (requestId === distinctRequest.current) setDistinct(next);
    }), 150);
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
    const next = current?.field !== column.id
      ? { field: column.id, direction: "asc" as const }
      : current.direction === "asc"
        ? { field: column.id, direction: "desc" as const }
        : null;
    onQueryChange({ ...query, page: 1, sort: next });
  }

  function clearFilter(column: string) {
    const filters = { ...query.filters };
    delete filters[column];
    onQueryChange({ ...query, page: 1, filters });
    setFilterColumn("");
  }

  function applyMulti() {
    onQueryChange({ ...query, page: 1, filters: { ...query.filters, [filterColumn]: { values: draftValues } } });
    setFilterColumn("");
  }

  function openFilter(column: SqliteTableColumn) {
    setFilterColumn(column.id);
    setDistinctSearch("");
    setDistinct(null);
    setDraftValues(query.filters[column.id]?.values ?? []);
  }

  return (
    <div className="min-w-0">
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
                <button className="flex min-w-0 flex-1 items-center gap-1 font-black" type="button" onClick={() => sort(column)}>
                  <span className="truncate">{column.label}</span>
                  {query.sort?.field === column.id ? query.sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ChevronsUpDown size={13} className="text-slate-400" />}
                </button>
                <button className={`icon-btn ${query.filters[column.id] ? "!text-blue-700" : ""}`} type="button" onClick={() => openFilter(column)} title={`Filter ${column.label}`}><Filter size={13} /></button>
              </div>
              {filterColumn === column.id ? <div className="absolute left-2 top-full z-30 mt-1 w-72 rounded-md border border-line bg-white p-3 shadow-xl">
                {column.kind === "multi" ? <>
                  <input className="field mb-2 !py-1" value={distinctSearch} onChange={(event) => setDistinctSearch(event.target.value)} placeholder="搜尋值..." />
                  <div className="mb-2 flex gap-2"><button className="text-xs font-bold text-blue-700" type="button" onClick={() => setDraftValues(distinct?.values.map((item) => item.value === "未設定" ? "__UNSET__" : item.value) ?? [])}>全選</button><button className="text-xs font-bold text-blue-700" type="button" onClick={() => setDraftValues([])}>取消全選</button><span className="ml-auto text-xs text-muted">已選 {draftValues.length}</span></div>
                  <div className="thin-scroll max-h-52 space-y-1 overflow-y-auto">{distinct?.values.map((item) => { const value = item.value === "未設定" ? "__UNSET__" : item.value; return <label key={value} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50"><input type="checkbox" checked={draftValues.includes(value)} onChange={(event) => setDraftValues(event.target.checked ? [...draftValues, value] : draftValues.filter((candidate) => candidate !== value))} /><span className="min-w-0 flex-1 truncate" title={item.value}>{item.value}</span><span>{item.count}</span></label>; })}</div>
                  <div className="mt-3 flex justify-end gap-2"><button className="btn" type="button" onClick={() => setFilterColumn("")}>取消</button><button className="btn btn-primary" type="button" onClick={applyMulti}>套用</button></div>
                </> : column.kind === "date" ? <div className="space-y-2"><input className="field" type="date" value={query.filters[column.id]?.from ?? ""} onChange={(event) => onQueryChange({ ...query, page: 1, filters: { ...query.filters, [column.id]: { ...query.filters[column.id], from: event.target.value } } })} /><input className="field" type="date" value={query.filters[column.id]?.to ?? ""} onChange={(event) => onQueryChange({ ...query, page: 1, filters: { ...query.filters, [column.id]: { ...query.filters[column.id], to: event.target.value } } })} /></div> : <input autoFocus className="field" value={query.filters[column.id]?.text ?? ""} onChange={(event) => onQueryChange({ ...query, page: 1, filters: { ...query.filters, [column.id]: { text: event.target.value } } })} placeholder="關鍵字..." />}
                <button className="mt-2 text-xs font-bold text-rose-700" type="button" onClick={() => clearFilter(column.id)}>清除此欄篩選</button>
              </div> : null}
            </th>)}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={shown.length} className="p-10 text-center font-bold text-muted">Loading...</td></tr> : null}
            {!loading && !result.rows.length ? <tr><td colSpan={shown.length} className="p-10 text-center font-bold text-muted">沒有符合條件的資料 / No matching records</td></tr> : null}
            {!loading ? result.rows.map((row, rowIndex) => <tr key={String(row.eventId ?? row.issueKey ?? rowIndex)} className="border-b border-line last:border-0 hover:bg-blue-50/30">{shown.map((column) => <td key={column.id} className="max-w-0 px-3 py-2">{column.render ? column.render(row) : <span className="block truncate" title={text(row[column.id])}>{text(row[column.id])}</span>}</td>)}</tr>) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
        <label className="flex items-center gap-2">每頁<select className="field !w-auto !py-1" value={query.pageSize} onChange={(event) => {
          const pageSize = Number(event.target.value) as ViewerTableQuery["pageSize"];
          onQueryChange({ ...query, page: 1, pageSize });
          if (preferences && onPreferencesChange) onPreferencesChange({ ...preferences, pageSize });
        }}>{[25, 50, 100, 200].map((size) => <option key={size}>{size}</option>)}</select></label>
        <div className="flex items-center gap-2"><button className="icon-btn" type="button" disabled={result.page <= 1} onClick={() => onQueryChange({ ...query, page: result.page - 1 })}><ChevronLeft size={16} /></button><span>{result.page}／{result.pageCount}</span><button className="icon-btn" type="button" disabled={result.page >= result.pageCount} onClick={() => onQueryChange({ ...query, page: result.page + 1 })}><ChevronRight size={16} /></button></div>
      </div>
    </div>
  );
}
