import type { TableFilterPreference, TablePreferences } from "../types/uiPreferences";
import { normalizeDiffQuickFilters } from "../../shared/viewerEfficiency";

export type TablePreferenceColumn = {
  id: string;
  queryField?: string;
  required?: boolean;
  defaultVisible?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
};

export function clampColumnWidth(value: unknown, column: TablePreferenceColumn) {
  const fallback = column.defaultWidth ?? 150;
  const min = column.minWidth ?? 72;
  const max = column.maxWidth ?? 640;
  const numeric = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(numeric) ? Math.round(numeric) : fallback));
}

function boundedText(value: unknown, limit = 256) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function normalizeFilter(value: unknown): TableFilterPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const filter: TableFilterPreference = {};
  const text = boundedText(source.text);
  const from = boundedText(source.from, 64);
  const to = boundedText(source.to, 64);
  if (text) filter.text = text;
  if (from) filter.from = from;
  if (to) filter.to = to;
  if (Array.isArray(source.values)) {
    const values = Array.from(new Set(source.values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.slice(0, 256))
      .filter(Boolean))).slice(0, 100);
    if (values.length) filter.values = values;
  }
  const min = Number(source.min);
  const max = Number(source.max);
  if (Number.isFinite(min)) filter.min = min;
  if (Number.isFinite(max)) filter.max = max;
  return Object.keys(filter).length ? filter : null;
}

export function normalizeTablePreferences(
  value: unknown,
  columns: TablePreferenceColumn[],
  fallbackPageSize = 50
): TablePreferences {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const allowed = new Set(columns.map((column) => column.id));
  const queryFields = new Set(columns.map((column) => column.queryField ?? column.id));
  const requiredIds = columns.filter((column) => column.required).map((column) => column.id);
  const requiredSet = new Set(requiredIds);
  const sourceOrder = Array.isArray(source.columnOrder) ? source.columnOrder : [];
  const optionalOrder = Array.from(new Set(sourceOrder.filter((id): id is string => typeof id === "string" && allowed.has(id) && !requiredSet.has(id))));
  for (const column of columns) if (!requiredSet.has(column.id) && !optionalOrder.includes(column.id)) optionalOrder.push(column.id);
  const columnOrder = [...requiredIds, ...optionalOrder];

  const sourceVisible = Array.isArray(source.visibleColumns) ? source.visibleColumns : [];
  const visibleColumns = Array.from(new Set(sourceVisible.filter((id): id is string => typeof id === "string" && allowed.has(id))));
  if (!visibleColumns.length) {
    for (const column of columns) if (column.defaultVisible !== false || column.required) visibleColumns.push(column.id);
  }
  for (const column of columns) if (column.required && !visibleColumns.includes(column.id)) visibleColumns.push(column.id);

  const sourceWidths = source.columnWidths && typeof source.columnWidths === "object" && !Array.isArray(source.columnWidths)
    ? source.columnWidths as Record<string, unknown>
    : {};
  const columnWidths: Record<string, number> = {};
  for (const column of columns) {
    if (sourceWidths[column.id] !== undefined) columnWidths[column.id] = clampColumnWidth(sourceWidths[column.id], column);
  }
  const allowedPageSizes = new Set([25, 50, 100, 200]);
  const pageSize = allowedPageSizes.has(Number(source.pageSize)) ? Number(source.pageSize) : fallbackPageSize;
  const pageIndexValue = Number(source.pageIndex);
  const pageIndex = Number.isSafeInteger(pageIndexValue) && pageIndexValue >= 1 && pageIndexValue <= 1_000_000 ? pageIndexValue : 1;
  const sourceSort = source.sort && typeof source.sort === "object" && !Array.isArray(source.sort) ? source.sort as Record<string, unknown> : null;
  const sortField = typeof sourceSort?.field === "string" && queryFields.has(sourceSort.field) ? sourceSort.field : "";
  const direction = sourceSort?.direction === "desc" ? "desc" as const : "asc" as const;
  const sort = sortField ? { field: sortField, direction } : null;
  const sourceFilters = source.filters && typeof source.filters === "object" && !Array.isArray(source.filters)
    ? source.filters as Record<string, unknown>
    : {};
  const filters: Record<string, TableFilterPreference> = {};
  for (const [field, candidate] of Object.entries(sourceFilters)) {
    if (!queryFields.has(field)) continue;
    const filter = normalizeFilter(candidate);
    if (filter) filters[field] = filter;
  }
  const diffQuickFilters = source.diffQuickFilters !== undefined ? normalizeDiffQuickFilters(source.diffQuickFilters) : undefined;
  const selectedUserIds = Array.isArray(source.selectedUserIds) && source.selectedUserIds.length <= 10_000
    ? Array.from(new Set(source.selectedUserIds.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0 && item.length <= 512)))
    : undefined;
  const userScopeMode = source.userScopeMode === "all" ? "all" as const : source.userScopeMode === "selected" ? "selected" as const : undefined;
  return {
    visibleColumns, columnOrder, columnWidths, pageSize, pageIndex, sort, filters,
    ...(diffQuickFilters ? { diffQuickFilters } : {}),
    ...(userScopeMode ? { userScopeMode, selectedUserIds: selectedUserIds ?? [] } : {})
  };
}
export function resetTableLayout(
  preferences: TablePreferences,
  columns: TablePreferenceColumn[]
): TablePreferences {
  const defaults = normalizeTablePreferences(null, columns, preferences.pageSize);
  return {
    ...preferences,
    visibleColumns: defaults.visibleColumns,
    columnOrder: defaults.columnOrder,
    columnWidths: {}
  };
}
