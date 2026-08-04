import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ExternalLink, Filter, RotateCcw, Settings2, X } from "lucide-react";
import type { DatabaseIssueColumn, DatabaseIssueFilters, DatabaseIssueQuery, DatabaseIssueQueryResult } from "../types/databaseQuery";
import { DATABASE_ISSUE_PAGE_SIZES } from "../types/databaseQuery";
import type { ViewerDistinctResult } from "../types/activityViewerQuery";
import type { DatabaseIssueListPreferences } from "../types/uiPreferences";
import { ExcelFilterPopover } from "./ExcelFilterPopover";
import { TextColumnFilter } from "./TextColumnFilter";
import { formatDisplayTime } from "../utils/displayTime";

export const DATABASE_ISSUE_COLUMN_LABELS: Record<DatabaseIssueColumn, string> = {
  issueKey: "Key", summary: "Summary", projectKey: "Project", issueType: "Type", status: "Status",
  priority: "Priority", assignee: "Assignee", reporter: "Reporter", creator: "Creator",
  createdAt: "Created", jiraUpdatedAt: "Updated", snapshotTime: "Snapshot",
  saveOutcome: "Save Outcome", eventCount: "Events", commentCount: "Comments", attachmentCount: "Attachments"
};

export const DEFAULT_DATABASE_COLUMNS = Object.keys(DATABASE_ISSUE_COLUMN_LABELS) as DatabaseIssueColumn[];
const FIXED_COLUMNS = new Set<DatabaseIssueColumn>(["issueKey"]);
const textFields = new Set<DatabaseIssueColumn>(["issueKey", "summary"]);
const dateFields = new Set<DatabaseIssueColumn>(["createdAt", "jiraUpdatedAt", "snapshotTime"]);
const numberFields = new Set<DatabaseIssueColumn>(["eventCount", "commentCount", "attachmentCount"]);
const discreteFields = new Set<DatabaseIssueColumn>(["projectKey", "issueType", "status", "priority", "assignee", "reporter", "creator", "saveOutcome"]);

function display(value: unknown) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

function hasFilter(filters: DatabaseIssueFilters, column: DatabaseIssueColumn) {
  const filter = filters[column] as Record<string, unknown> | undefined;
  return Boolean(filter && Object.values(filter).some((value) => Array.isArray(value) ? value.length : value !== "" && value !== undefined));
}

type Props = {
  result: DatabaseIssueQueryResult;
  query: DatabaseIssueQuery;
  preferences: DatabaseIssueListPreferences;
  onQueryChange: (query: DatabaseIssueQuery) => void;
  onPreferencesChange: (preferences: DatabaseIssueListPreferences) => void;
  loadDistinct?: (field: string, search: string) => Promise<ViewerDistinctResult>;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  onRetry?: () => void;
};

export function DatabaseIssueTable({ result, query, preferences, onQueryChange, onPreferencesChange, loadDistinct, loading = false, disabled = false, error = "", onRetry }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState<DatabaseIssueColumn | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResult, setCandidateResult] = useState<ViewerDistinctResult | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const candidateRequest = useRef(0);
  const columns = useMemo(() => preferences.columnOrder.filter((column) => preferences.visibleColumns.includes(column)), [preferences]);

  useEffect(() => {
    if (!filterColumn || !discreteFields.has(filterColumn) || !loadDistinct || disabled) return;
    const requestId = ++candidateRequest.current;
    setCandidateLoading(true);
    const timer = window.setTimeout(() => void loadDistinct(filterColumn, candidateSearch).then((next) => {
      if (requestId === candidateRequest.current) setCandidateResult(next);
    }).catch(() => {
      if (requestId === candidateRequest.current) setCandidateResult({ field: filterColumn, values: [], truncated: false });
    }).finally(() => {
      if (requestId === candidateRequest.current) setCandidateLoading(false);
    }), 250);
    return () => {
      window.clearTimeout(timer);
      candidateRequest.current += 1;
    };
  }, [filterColumn, candidateSearch, loadDistinct, disabled]);

  function setFilter(column: DatabaseIssueColumn, filter: Record<string, unknown> | undefined) {
    if (disabled) return;
    const filters = { ...query.filters };
    if (!filter || !Object.values(filter).some((item) => Array.isArray(item) ? item.length : item !== "" && item !== undefined)) delete filters[column];
    else Object.assign(filters, { [column]: filter });
    onQueryChange({ ...query, page: 1, filters });
  }

  function cycleSort(column: DatabaseIssueColumn) {
    if (disabled) return;
    const direction = query.sort.field === column && query.sort.direction === "asc" ? "desc" : "asc";
    onQueryChange({ ...query, page: 1, sort: { field: column, direction } });
  }

  function move(column: DatabaseIssueColumn, delta: number) {
    const order = [...preferences.columnOrder];
    const current = order.indexOf(column);
    const target = Math.max(0, Math.min(order.length - 1, current + delta));
    order.splice(current, 1);
    order.splice(target, 0, column);
    onPreferencesChange({ ...preferences, columnOrder: order });
  }

  function clearFilters() {
    if (disabled) return;
    onQueryChange({ ...query, page: 1, filters: {} });
  }

  function openFilter(column: DatabaseIssueColumn) {
    setFilterColumn((current) => current === column ? null : column);
    setCandidateSearch("");
    setCandidateResult(null);
  }

  function filterControl(column: DatabaseIssueColumn) {
    const filter = (query.filters[column] ?? {}) as Record<string, unknown>;
    if (textFields.has(column)) {
      return <TextColumnFilter autoFocus value={String(filter.value ?? "")} onApply={(value) => setFilter(column, value ? { value } : undefined)} placeholder={`Filter ${DATABASE_ISSUE_COLUMN_LABELS[column]}...`} />;
    }
    if (dateFields.has(column)) {
      return <div className="grid gap-1"><input aria-label={`Filter ${column} from`} className="field !px-1 !py-1 text-[11px]" type="date" value={String(filter.from ?? "")} onChange={(event) => setFilter(column, { ...filter, from: event.currentTarget.value })} /><input aria-label={`Filter ${column} to`} className="field !px-1 !py-1 text-[11px]" type="date" value={String(filter.to ?? "")} onChange={(event) => setFilter(column, { ...filter, to: event.currentTarget.value })} /></div>;
    }
    if (numberFields.has(column)) {
      return <div className="grid grid-cols-2 gap-1"><input aria-label={`Filter ${column} min`} className="field !px-1 !py-1" type="number" min={0} placeholder="Min" value={filter.min as number ?? ""} onChange={(event) => setFilter(column, { ...filter, min: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })} /><input aria-label={`Filter ${column} max`} className="field !px-1 !py-1" type="number" min={0} placeholder="Max" value={filter.max as number ?? ""} onChange={(event) => setFilter(column, { ...filter, max: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })} /></div>;
    }
    return <ExcelFilterPopover label={DATABASE_ISSUE_COLUMN_LABELS[column]} selected={(filter.values as string[] | undefined) ?? []} search={candidateSearch} result={candidateResult} loading={candidateLoading} onSearchChange={setCandidateSearch} onCancel={() => setFilterColumn(null)} onApply={(values) => { setFilter(column, { values }); setFilterColumn(null); }} />;
  }

  return (
    <div className="min-w-0" aria-busy={loading} data-table-id="databaseIssueList">
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white py-2">
        <div className="text-xs font-bold text-muted">{disabled ? "正在準備 Issue 清單 / Preparing Issue List" : <>Filtered {result.filteredTotal.toLocaleString()} / Database {result.databaseTotal.toLocaleString()}</>}</div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(query.filters).length ? <button className="btn" disabled={disabled} type="button" onClick={clearFilters}><X size={15} />Clear Filters</button> : null}
          <button className="btn" disabled={disabled} type="button" onClick={() => setSettingsOpen((value) => !value)}><Settings2 size={15} />Columns</button>
        </div>
      </div>

      {error ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800"><span>{error}</span>{onRetry ? <button className="btn" type="button" onClick={onRetry}>Retry</button> : null}</div> : null}

      {settingsOpen && !disabled ? <div className="mb-3 rounded-md border border-line bg-slate-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-3"><b className="text-sm">欄位設定 / Column Settings</b><button className="btn" type="button" onClick={() => onPreferencesChange({ ...preferences, visibleColumns: [...DEFAULT_DATABASE_COLUMNS], columnOrder: [...DEFAULT_DATABASE_COLUMNS], columnWidths: {} })}><RotateCcw size={15} />Reset Table Layout / 重設表格版面</button></div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">{preferences.columnOrder.map((column, index) => <div key={column} className="flex min-w-0 items-center gap-2 rounded border border-line bg-white p-2 text-sm"><input type="checkbox" checked={preferences.visibleColumns.includes(column)} disabled={FIXED_COLUMNS.has(column)} onChange={(event) => onPreferencesChange({ ...preferences, visibleColumns: event.currentTarget.checked ? [...preferences.visibleColumns, column] : preferences.visibleColumns.filter((item) => item !== column) })} /><span className="min-w-0 flex-1 font-bold">{DATABASE_ISSUE_COLUMN_LABELS[column]}</span><input aria-label={`${column} width`} className="field !w-20 !py-1" type="number" min={72} max={640} value={preferences.columnWidths[column] ?? ""} placeholder="auto" onChange={(event) => onPreferencesChange({ ...preferences, columnWidths: { ...preferences.columnWidths, [column]: event.currentTarget.value ? Number(event.currentTarget.value) : undefined } })} /><button className="icon-btn" type="button" disabled={index === 0} onClick={() => move(column, -1)} title="Move left"><ArrowUp size={14} /></button><button className="icon-btn" type="button" disabled={index === preferences.columnOrder.length - 1} onClick={() => move(column, 1)} title="Move right"><ArrowDown size={14} /></button></div>)}</div>
      </div> : null}

      <div className="thin-scroll max-w-full min-w-0 overflow-x-auto rounded-md border border-line" data-table-scroll-container="true">
        <table className="w-max min-w-full table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>{columns.map((column) => <th key={column} style={{ width: preferences.columnWidths[column] ?? (column === "summary" ? 300 : 150) }} className="relative border-b border-line px-3 py-2 align-top"><div className="flex items-center gap-1"><button disabled={disabled} type="button" className="flex min-w-0 flex-1 items-center gap-1 font-black" onClick={() => cycleSort(column)}><span className="min-w-0 truncate">{DATABASE_ISSUE_COLUMN_LABELS[column]}</span>{query.sort.field === column ? query.sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}</button><button className={`icon-btn ${hasFilter(query.filters, column) ? "!text-blue-700" : ""}`} disabled={disabled} type="button" title={`Filter ${DATABASE_ISSUE_COLUMN_LABELS[column]}`} onClick={() => openFilter(column)}><Filter size={13} /></button></div></th>)}<th className="sticky right-0 z-20 w-24 border-b border-line bg-slate-50 px-3 py-2 font-black">Action</th></tr>
            {filterColumn ? <tr data-table-filter-row="layout"><th className="border-b border-blue-200 bg-blue-50/70 p-2 align-top" colSpan={columns.length + 1}><div className="grid min-w-0 gap-2" style={{ gridTemplateColumns: columns.map((column) => `${preferences.columnWidths[column] ?? (column === "summary" ? 300 : 150)}px`).concat("96px").join(" ") }}>{columns.map((column) => <div key={column} className="min-w-0">{filterColumn === column ? <div className="min-w-0" data-filter-column={column}>{filterControl(column)}{!discreteFields.has(column) ? <div className="mt-2 flex flex-wrap justify-end gap-2"><button className="btn" type="button" onClick={() => setFilter(column, undefined)}>Clear</button><button className="btn" type="button" onClick={() => setFilterColumn(null)}>Close</button></div> : null}</div> : null}</div>)}<div /></div></th></tr> : null}
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={columns.length + 1} className="h-1 bg-blue-500 p-0" aria-label="Loading database issues" /></tr> : null}
            {result.items.map((item) => <tr key={display(item.issueKey)} className="border-b border-line last:border-b-0 hover:bg-blue-50/40">{columns.map((column) => <td key={column} className="max-w-0 px-3 py-2">{column === "issueKey" ? <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(display(item.issueKey))}`}>{display(item[column])}</a> : dateFields.has(column) ? <span className="block whitespace-nowrap">{formatDisplayTime(item[column])}</span> : <span className="block truncate" title={display(item[column])}>{display(item[column])}</span>}</td>)}<td className="sticky right-0 bg-white px-3 py-2"><a className="icon-btn" href={`#/issues?key=${encodeURIComponent(display(item.issueKey))}`} title={`Open ${display(item.issueKey)}`}><ExternalLink size={14} /></a></td></tr>)}
            {!loading && !result.items.length ? <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center font-bold text-muted">{disabled ? "正在準備 Issue 清單 / Preparing Issue List" : "找不到符合條件的 Issue / No issues found"}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold"><label className="flex items-center gap-2">Rows<select disabled={disabled} className="field !w-auto !py-1" value={query.pageSize} onChange={(event) => { const pageSize = Number(event.currentTarget.value) as DatabaseIssueQuery["pageSize"]; onPreferencesChange({ ...preferences, pageSize }); onQueryChange({ ...query, page: 1, pageSize }); }}>{DATABASE_ISSUE_PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label><div className="flex items-center gap-2"><button className="icon-btn" type="button" disabled={disabled || result.page <= 1} onClick={() => onQueryChange({ ...query, page: 1 })} title="First page"><ChevronFirst size={16} /></button><button className="icon-btn" type="button" disabled={disabled || result.page <= 1} onClick={() => onQueryChange({ ...query, page: result.page - 1 })} title="Previous page"><ChevronLeft size={16} /></button><span>Page {result.page} / {result.pageCount}</span><button className="icon-btn" type="button" disabled={disabled || result.page >= result.pageCount} onClick={() => onQueryChange({ ...query, page: result.page + 1 })} title="Next page"><ChevronRight size={16} /></button><button className="icon-btn" type="button" disabled={disabled || result.page >= result.pageCount} onClick={() => onQueryChange({ ...query, page: result.pageCount })} title="Last page"><ChevronLast size={16} /></button></div></div>
    </div>
  );
}