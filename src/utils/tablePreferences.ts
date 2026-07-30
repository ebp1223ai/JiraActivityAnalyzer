import type { TablePreferences } from "../types/uiPreferences";

export type TablePreferenceColumn = {
  id: string;
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

export function normalizeTablePreferences(
  value: unknown,
  columns: TablePreferenceColumn[],
  fallbackPageSize = 50
): TablePreferences {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const allowed = new Set(columns.map((column) => column.id));
  const sourceOrder = Array.isArray(source.columnOrder) ? source.columnOrder : [];
  const columnOrder = Array.from(new Set(sourceOrder.filter((id): id is string => typeof id === "string" && allowed.has(id))));
  for (const column of columns) if (!columnOrder.includes(column.id)) columnOrder.push(column.id);

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
  const allowedPageSizes = new Set([25, 50, 100]);
  const pageSize = allowedPageSizes.has(Number(source.pageSize)) ? Number(source.pageSize) : fallbackPageSize;
  return { visibleColumns, columnOrder, columnWidths, pageSize };
}
