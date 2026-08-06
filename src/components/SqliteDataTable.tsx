import { Fragment, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUpDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Filter, RotateCcw, Settings2, X } from "lucide-react";
import type { ViewerDistinctResult, ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { ViewerTableSessionState } from "../types/databaseViewer";
import type { TablePreferences } from "../types/uiPreferences";
import { rememberSafeUserAction } from "../diagnostics/rendererDiagnostics";
import { clampColumnWidth, normalizeTablePreferences, resetTableLayout } from "../utils/tablePreferences";
import { normalizeViewerTableSession, setViewerRowExpanded, stableViewerRowId } from "../utils/viewerSessionState";
import { normalizeDiffQuickFilters } from "../../shared/viewerEfficiency";
import { ExcelFilterPopover } from "./ExcelFilterPopover";
import { TextColumnFilter } from "./TextColumnFilter";

export type SqliteTableRenderContext = {
  rowId: string;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

export type SqliteTableColumn = {
  id: string;
  label: string;
  kind: "text" | "multi" | "date" | "number";
  queryField?: string;
  required?: boolean;
  defaultVisible?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  render?: (row: Record<string, unknown>, context: SqliteTableRenderContext) => ReactNode;
};

type Props = {
  tableId?: string;
  columns: SqliteTableColumn[];
  result: ViewerTableResult;
  query: ViewerTableQuery;
  loading?: boolean;
  error?: string;
  onQueryChange: (query: ViewerTableQuery) => void;
  loadDistinct?: (field: string, search: string) => Promise<ViewerDistinctResult>;
  preferences?: TablePreferences;
  onPreferencesChange?: (preferences: TablePreferences) => void;
  sessionState?: ViewerTableSessionState;
  onSessionStateChange?: (state: ViewerTableSessionState) => void;
  getRowId?: (row: Record<string, unknown>) => string;
  renderExpandedRow?: (row: Record<string, unknown>, context: SqliteTableRenderContext) => ReactNode;
};

function text(value: unknown) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

export function SqliteDataTable({ tableId = "sqlite-table", columns, result, query, loading, error, onQueryChange, loadDistinct, preferences, onPreferencesChange, sessionState, onSessionStateChange, getRowId = stableViewerRowId, renderExpandedRow }: Props) {
  const normalized = useMemo(() => normalizeTablePreferences(preferences, columns.map((column) => ({ id: column.id, queryField: column.queryField, required: column.required, defaultVisible: column.defaultVisible, defaultWidth: column.width, minWidth: column.minWidth, maxWidth: column.maxWidth }))), [columns, preferences]);
  const normalizedSession = useMemo(() => normalizeViewerTableSession(sessionState), [sessionState]);
  const [filterColumn, setFilterColumn] = useState("");
  const [distinctSearch, setDistinctSearch] = useState("");
  const [distinct, setDistinct] = useState<ViewerDistinctResult | null>(null);
  const [distinctLoading, setDistinctLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const distinctRequest = useRef(0);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const restoredTable = useRef("");
  const orderedColumns = useMemo(() => normalized.columnOrder.map((id) => columns.find((column) => column.id === id)).filter((column): column is SqliteTableColumn => Boolean(column)), [columns, normalized.columnOrder]);
  const shown = useMemo(() => orderedColumns.filter((column) => normalized.visibleColumns.includes(column.id)), [orderedColumns, normalized.visibleColumns]);
  const activeColumn = columns.find((column) => column.id === filterColumn);
  const queryField = (column: SqliteTableColumn) => column.queryField ?? column.id;
  const diffQuickFilters = normalizeDiffQuickFilters(query.diffQuickFilters);
  const hasQuickFilters = diffQuickFilters.hideNoChange || diffQuickFilters.hideZeroAdded || diffQuickFilters.hideZeroDeleted;

  useLayoutEffect(() => {
    if (!scrollContainer.current || restoredTable.current === tableId) return;
    restoredTable.current = tableId;
    scrollContainer.current.scrollLeft = normalizedSession.scrollLeft;
    scrollContainer.current.scrollTop = normalizedSession.scrollTop;
  }, [tableId, normalizedSession.scrollLeft, normalizedSession.scrollTop]);

  function log(action: string, details = "") {
    rememberSafeUserAction(`${action} tableId=${tableId}${details ? ` ${details}` : ""}`);
    void window.desktopApp?.userAnalysis?.logAction?.({ category: "USER_ACTION", message: `${action} tableId=${tableId}${details ? ` ${details}` : ""}` });
  }

  function changeQuery(next: ViewerTableQuery, action: string) {
    log(action, `page=${next.page} pageSize=${next.pageSize} sort=${next.sort?.field ?? "none"}`);
    onPreferencesChange?.({ ...normalized, pageSize: next.pageSize, pageIndex: next.page, sort: next.sort, filters: next.filters, diffQuickFilters: normalizeDiffQuickFilters(next.diffQuickFilters) });
    onQueryChange(next);
  }

  useEffect(() => {
    if (!activeColumn || activeColumn.kind !== "multi" || !loadDistinct) return;
    const requestId = ++distinctRequest.current;
    const field = queryField(activeColumn);
    setDistinctLoading(true);
    const timer = window.setTimeout(() => void loadDistinct(field, distinctSearch).then((next) => {
      if (requestId === distinctRequest.current) setDistinct(next);
    }).catch(() => {
      if (requestId === distinctRequest.current) setDistinct({ field, values: [], truncated: false });
    }).finally(() => {
      if (requestId === distinctRequest.current) setDistinctLoading(false);
    }), 250);
    return () => {
      window.clearTimeout(timer);
      distinctRequest.current += 1;
    };
  }, [activeColumn?.id, activeColumn?.kind, distinctSearch, loadDistinct]);

  function savePreferences(next: TablePreferences, action: string) {
    log(action);
    onPreferencesChange?.(normalizeTablePreferences(next, columns.map((column) => ({ id: column.id, queryField: column.queryField, required: column.required, defaultVisible: column.defaultVisible, defaultWidth: column.width, minWidth: column.minWidth, maxWidth: column.maxWidth }))));
  }

  function setColumnVisible(column: SqliteTableColumn, checked: boolean) {
    if (column.required && !checked) return;
    const next = checked ? Array.from(new Set([...normalized.visibleColumns, column.id])) : normalized.visibleColumns.filter((id) => id !== column.id);
    savePreferences({ ...normalized, visibleColumns: next }, `column_visibility column=${column.id} visible=${checked}`);
  }

  function moveColumn(column: SqliteTableColumn, direction: -1 | 1) {
    if (column.required) return;
    const order = [...normalized.columnOrder];
    const currentIndex = order.indexOf(column.id);
    const targetIndex = currentIndex + direction;
    const requiredCount = columns.filter((candidate) => candidate.required).length;
    if (currentIndex < 0 || targetIndex < requiredCount || targetIndex >= order.length) return;
    [order[currentIndex], order[targetIndex]] = [order[targetIndex], order[currentIndex]];
    savePreferences({ ...normalized, columnOrder: order }, "column_reorder column=" + column.id + " direction=" + direction);
  }

  function sort(column: SqliteTableColumn) {
    const field = queryField(column);
    const nextSort = query.sort?.field !== field ? { field, direction: "asc" as const } : query.sort.direction === "asc" ? { field, direction: "desc" as const } : null;
    changeQuery({ ...query, page: 1, sort: nextSort }, `sort column=${column.id}`);
  }

  function clearFilter(column: SqliteTableColumn) {
    const filters = { ...query.filters };
    delete filters[queryField(column)];
    changeQuery({ ...query, page: 1, filters }, `filter_clear column=${column.id}`);
  }

  function setFilter(column: SqliteTableColumn, value: Record<string, unknown>) {
    const field = queryField(column);
    const filters = { ...query.filters };
    const active = Object.values(value).some((item) => Array.isArray(item) ? item.length > 0 : item !== "" && item !== undefined && item !== null);
    if (active) filters[field] = value;
    else delete filters[field];
    changeQuery({ ...query, page: 1, filters }, `filter_apply column=${column.id}`);
  }

  function openFilter(column: SqliteTableColumn) {
    log(`filter_open column=${column.id}`);
    setFilterColumn((current) => current === column.id ? "" : column.id);
    setDistinctSearch("");
    setDistinct(null);
  }

  function startResize(column: SqliteTableColumn, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = normalized.columnWidths[column.id] ?? clampColumnWidth(column.width, { id: column.id, defaultWidth: column.width, minWidth: column.minWidth, maxWidth: column.maxWidth });
    const move = (pointer: PointerEvent) => {
      const width = clampColumnWidth(startWidth + pointer.clientX - startX, { id: column.id, defaultWidth: column.width, minWidth: column.minWidth, maxWidth: column.maxWidth });
      onPreferencesChange?.({ ...normalized, columnWidths: { ...normalized.columnWidths, [column.id]: width } });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      log(`column_resize column=${column.id}`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  function filterControl(column: SqliteTableColumn) {
    const filter = query.filters[queryField(column)] ?? {};
    if (column.kind === "multi") return <ExcelFilterPopover label={column.label} selected={filter.values ?? []} search={distinctSearch} result={distinct} loading={distinctLoading} onSearchChange={setDistinctSearch} onCancel={() => setFilterColumn("")} onApply={(values) => { setFilter(column, { values }); setFilterColumn(""); }} />;
    if (column.kind === "date") return <div className="grid gap-1"><input className="field !px-1 !py-1 text-[11px]" type="date" value={filter.from ?? ""} onChange={(event) => setFilter(column, { ...filter, from: event.currentTarget.value })} /><input className="field !px-1 !py-1 text-[11px]" type="date" value={filter.to ?? ""} onChange={(event) => setFilter(column, { ...filter, to: event.currentTarget.value })} /></div>;
    if (column.kind === "number") return <div className="grid grid-cols-2 gap-1"><input className="field !px-1 !py-1" type="number" placeholder="Min" value={filter.min ?? ""} onChange={(event) => setFilter(column, { ...filter, min: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })} /><input className="field !px-1 !py-1" type="number" placeholder="Max" value={filter.max ?? ""} onChange={(event) => setFilter(column, { ...filter, max: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })} /></div>;
    return <TextColumnFilter autoFocus value={filter.text ?? ""} onApply={(value) => setFilter(column, { text: value })} />;
  }

  return (
    <div className="min-w-0" aria-busy={loading} data-table-id={tableId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold"><span>篩選後 {result.filteredCount.toLocaleString()}，全部 {result.totalCount.toLocaleString()}</span><div className="flex gap-2">{Object.keys(query.filters).length || hasQuickFilters ? <button className="btn" type="button" onClick={() => changeQuery({ ...query, page: 1, filters: {}, diffQuickFilters: { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false } }, "filter_clear_all")}><X size={14} />{"Clear All Filters / \u6e05\u9664\u5168\u90e8\u7be9\u9078"}</button> : null}<button className="btn" type="button" onClick={() => { log("columns_toggle"); setSettingsOpen((value) => !value); }}><Settings2 size={14} />欄位</button></div></div>
      {settingsOpen ? <div className="mb-3 rounded-md border border-line bg-slate-50 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><b className="text-xs">Columns / 欄位</b><div className="flex flex-wrap gap-2"><button className="btn" type="button" onClick={() => savePreferences({ ...normalized, columnWidths: {} }, "column_widths_reset")}><RotateCcw size={14} />Reset Widths / 重設欄寬</button><button className="btn" type="button" onClick={() => savePreferences(resetTableLayout(normalized, columns.map((column) => ({ id: column.id, queryField: column.queryField, required: column.required, defaultVisible: column.defaultVisible, defaultWidth: column.width, minWidth: column.minWidth, maxWidth: column.maxWidth }))), "table_layout_reset")}><RotateCcw size={14} />Reset Table Layout / 重設表格版面</button></div></div><div className="flex flex-wrap gap-3">{orderedColumns.map((column, index) => <div key={column.id} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={normalized.visibleColumns.includes(column.id)} disabled={column.required} onChange={(event) => setColumnVisible(column, event.currentTarget.checked)} />{column.label}{column.required ? <span className="text-[10px] text-blue-700">Required／必要</span> : null}</label>{column.required ? null : <div className="ml-1 flex gap-1"><button className="icon-btn !h-6 !w-6" type="button" disabled={index <= columns.filter((candidate) => candidate.required).length} title={"Move " + column.label + " left"} onClick={() => moveColumn(column, -1)}><ArrowLeft size={12} /></button><button className="icon-btn !h-6 !w-6" type="button" disabled={index >= orderedColumns.length - 1} title={"Move " + column.label + " right"} onClick={() => moveColumn(column, 1)}><ArrowRight size={12} /></button></div>}</div>)}</div></div> : null}
      {error ? <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div> : null}
      <div ref={scrollContainer} className="thin-scroll max-w-full overflow-x-auto rounded-md border border-line" data-table-scroll-container="true" onScroll={(event) => onSessionStateChange?.({ ...normalizedSession, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop })}>
        <table className="w-max min-w-full table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>{shown.map((column) => { const field = queryField(column); return <th key={column.id} className="relative border-b border-line px-3 py-2" style={{ width: normalized.columnWidths[column.id] ?? column.width ?? 150, minWidth: column.minWidth ?? 72, maxWidth: column.maxWidth ?? 640 }}><div className="flex items-center gap-1"><button className="flex min-w-0 flex-1 items-center gap-1 font-black" type="button" onClick={() => sort(column)}><span className="truncate">{column.label}</span>{query.sort?.field === field ? query.sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ChevronsUpDown size={13} className="text-slate-400" />}</button><button className={`icon-btn ${query.filters[field] ? "!text-blue-700" : ""}`} type="button" onClick={() => openFilter(column)} title={`Filter ${column.label}`}><Filter size={13} /></button></div><div className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none" role="separator" aria-label={`Resize ${column.label}`} onPointerDown={(event) => startResize(column, event)} /></th>; })}</tr>
            {activeColumn ? <tr data-table-filter-row="layout"><th className="border-b border-blue-200 bg-blue-50/70 p-2 align-top" colSpan={shown.length}><div className="grid min-w-0 gap-2" style={{ gridTemplateColumns: shown.map((column) => `${normalized.columnWidths[column.id] ?? column.width ?? 150}px`).join(" ") }}>{shown.map((column) => <div key={column.id} className="min-w-0">{activeColumn.id === column.id ? <div className="min-w-0" data-filter-column={column.id}>{filterControl(column)}{column.kind !== "multi" ? <div className="mt-2 flex flex-wrap justify-end gap-2"><button className="btn" type="button" onClick={() => clearFilter(column)}>Clear</button><button className="btn" type="button" onClick={() => setFilterColumn("")}>Close</button></div> : null}</div> : null}</div>)}</div></th></tr> : null}
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={shown.length} className="h-1 bg-blue-500 p-0" aria-label="Loading table rows" /></tr> : null}
            {!loading && !result.rows.length ? <tr><td colSpan={shown.length} className="p-10 text-center font-bold text-muted">找不到符合篩選條件的資料 / No matching records</td></tr> : null}
            {result.rows.map((row, rowIndex) => { const rowId = getRowId(row); const expanded = rowId ? normalizedSession.expandedRowIds.includes(rowId) : false; const context: SqliteTableRenderContext = { rowId, expanded, setExpanded: (value) => rowId && onSessionStateChange?.(setViewerRowExpanded(normalizedSession, rowId, value)) }; return <Fragment key={rowId || `unidentified-${rowIndex}`}><tr className="activity-event-summary-row border-b border-line last:border-0 hover:bg-blue-50/30">{shown.map((column) => <td key={column.id} className="max-w-0 px-3 py-2 align-top">{column.render ? column.render(row, context) : <span className="block truncate" title={text(row[column.id])}>{text(row[column.id])}</span>}</td>)}</tr>{expanded && renderExpandedRow ? <tr className="activity-event-detail-row border-b border-line bg-slate-50/70"><td className="min-w-0 max-w-0 p-3" colSpan={shown.length}>{renderExpandedRow(row, context)}</td></tr> : null}</Fragment>; })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold"><label className="flex items-center gap-2">每頁<select className="field !w-auto !py-1" value={query.pageSize} onChange={(event) => { const pageSize = Number(event.currentTarget.value) as ViewerTableQuery["pageSize"]; changeQuery({ ...query, page: 1, pageSize }, "page_size"); savePreferences({ ...normalized, pageSize }, "page_size_preference"); }}>{[25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label><div className="flex items-center gap-2"><button className="icon-btn" type="button" disabled={result.page <= 1} onClick={() => changeQuery({ ...query, page: 1 }, "page_first")} title="First page"><ChevronFirst size={16} /></button><button className="icon-btn" type="button" disabled={result.page <= 1} onClick={() => changeQuery({ ...query, page: result.page - 1 }, "page_previous")} title="Previous page"><ChevronLeft size={16} /></button><span>{result.page}／{result.pageCount}</span><button className="icon-btn" type="button" disabled={result.page >= result.pageCount} onClick={() => changeQuery({ ...query, page: result.page + 1 }, "page_next")} title="Next page"><ChevronRight size={16} /></button><button className="icon-btn" type="button" disabled={result.page >= result.pageCount} onClick={() => changeQuery({ ...query, page: result.pageCount }, "page_last")} title="Last page"><ChevronLast size={16} /></button></div></div>
    </div>
  );
}