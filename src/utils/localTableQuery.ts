import { dateRangeBounds } from "../types/dateRange";
import type { ViewerDistinctResult, ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";

export type LocalQueryColumn = { expression: string; kind: "text" | "multi" | "date" | "number" };

function value(row: Record<string, unknown>, expression: string) {
  return row[expression];
}

function matches(row: Record<string, unknown>, field: string, filter: ViewerTableQuery["filters"][string], columns: Record<string, LocalQueryColumn>) {
  const column = columns[field];
  if (!column) return true;
  const candidate = value(row, column.expression);
  if (column.kind === "text") return !filter.text?.trim() || String(candidate ?? "").toLowerCase().includes(filter.text.trim().toLowerCase());
  if (column.kind === "multi") return !filter.values?.length || filter.values.some((item) => item === "__UNSET__" ? !String(candidate ?? "").trim() : item === String(candidate ?? ""));
  if (column.kind === "date") {
    const timestamp = String(candidate ?? "");
    if (!timestamp) return false;
    if (filter.from && timestamp < filter.from + "T00:00:00") return false;
    if (filter.to) {
      const end = new Date(filter.to + "T00:00:00");
      end.setDate(end.getDate() + 1);
      const exclusive = String(end.getFullYear()) + "-" + String(end.getMonth() + 1).padStart(2, "0") + "-" + String(end.getDate()).padStart(2, "0") + "T00:00:00";
      if (timestamp >= exclusive) return false;
    }
    return true;
  }
  const numeric = Number(candidate);
  return (!Number.isFinite(filter.min) || numeric >= Number(filter.min)) && (!Number.isFinite(filter.max) || numeric <= Number(filter.max));
}

function filterLocalRows(rows: Array<Record<string, unknown>>, query: ViewerTableQuery, columns: Record<string, LocalQueryColumn>, dateField: string) {
  const bounds = dateRangeBounds(query.dateRange);
  return rows.filter((row) => {
    const timestamp = String(value(row, columns[dateField]?.expression ?? dateField) ?? "");
    if (bounds.startInclusive && timestamp < bounds.startInclusive) return false;
    if (bounds.endExclusive && timestamp >= bounds.endExclusive) return false;
    return Object.entries(query.filters).every(([field, filter]) => matches(row, field, filter, columns));
  });
}

export function queryLocalTable(rows: Array<Record<string, unknown>>, query: ViewerTableQuery, columns: Record<string, LocalQueryColumn>, defaultSort: string): ViewerTableResult {
  const filtered = filterLocalRows(rows, query, columns, defaultSort);
  const field = query.sort?.field && columns[query.sort.field] ? query.sort.field : defaultSort;
  const direction = query.sort?.direction === "asc" ? 1 : -1;
  const sorted = filtered.map((row, index) => ({ row, index })).sort((left, right) => {
    const compared = String(value(left.row, columns[field]?.expression ?? field) ?? "").localeCompare(String(value(right.row, columns[field]?.expression ?? field) ?? ""));
    return compared ? compared * direction : left.index - right.index;
  }).map((item) => item.row);
  const pageCount = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  return {
    rows: sorted.slice((page - 1) * query.pageSize, page * query.pageSize),
    filteredCount: sorted.length,
    totalCount: rows.length,
    page,
    pageSize: query.pageSize,
    pageCount
  };
}

export function localDistinctValues(rows: Array<Record<string, unknown>>, query: ViewerTableQuery, columns: Record<string, LocalQueryColumn>, field: string, search: string, limit = 200): ViewerDistinctResult {
  const column = columns[field];
  if (!column) return { field, values: [], truncated: false };
  const scoped = { ...query, filters: { ...query.filters } };
  delete scoped.filters[field];
  const dateField = Object.keys(columns).find((candidate) => columns[candidate].kind === "date") ?? field;
  const filtered = filterLocalRows(rows, scoped, columns, dateField);
  const counts = new Map<string, number>();
  for (const row of filtered) {
    const raw = String(value(row, column.expression) ?? "").trim() || "未設定";
    if (search && !raw.toLowerCase().includes(search.toLowerCase())) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  const values = Array.from(counts, ([candidate, count]) => ({ value: candidate, count })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  return { field, values: values.slice(0, limit), truncated: values.length > limit };
}
