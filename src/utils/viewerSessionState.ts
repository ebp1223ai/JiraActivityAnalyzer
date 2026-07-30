import type { ViewerTableQuery } from "../types/activityViewerQuery";
import type { ViewerTableSessionState } from "../types/databaseViewer";

export const EMPTY_VIEWER_TABLE_SESSION: ViewerTableSessionState = {
  expandedRowIds: [],
  scrollLeft: 0,
  scrollTop: 0
};

export function normalizeViewerTableSession(value: unknown): ViewerTableSessionState {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const expandedRowIds = Array.isArray(source.expandedRowIds)
    ? Array.from(new Set(source.expandedRowIds.filter((item): item is string => typeof item === "string" && item.length > 0))).slice(0, 2_000)
    : [];
  const finitePosition = (candidate: unknown) => {
    const numeric = Number(candidate);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.min(10_000_000, Math.round(numeric)) : 0;
  };
  return { expandedRowIds, scrollLeft: finitePosition(source.scrollLeft), scrollTop: finitePosition(source.scrollTop) };
}

export function setViewerRowExpanded(state: ViewerTableSessionState | undefined, rowId: string, expanded: boolean) {
  const current = normalizeViewerTableSession(state);
  if (!rowId) return current;
  return {
    ...current,
    expandedRowIds: expanded
      ? Array.from(new Set([...current.expandedRowIds, rowId]))
      : current.expandedRowIds.filter((candidate) => candidate !== rowId)
  };
}

export function stableViewerRowId(row: Record<string, unknown>) {
  for (const key of ["eventId", "id", "commentId"]) {
    const value = String(row[key] ?? "").trim();
    if (value) return `${key}:${value}`;
  }
  const changelogId = String(row.changelogId ?? row.sourceRecordId ?? "").trim();
  const historyItemIndex = Number(row.historyItemIndex);
  if (changelogId) return `changelog:${changelogId}:${Number.isSafeInteger(historyItemIndex) ? historyItemIndex : "item"}`;
  const eventIdentity = [row.issueKey, row.created ?? row.eventTime, row.field ?? row.fieldName, row.sourceProvenance]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("|");
  if (eventIdentity) return `event:${eventIdentity}`;
  for (const key of ["userId", "issueKey"]) {
    const value = String(row[key] ?? "").trim();
    if (value) return `${key}:${value}`;
  }
  return "";
}
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, candidate]) => [key, stableValue(candidate)]));
}

export function viewerQueryCacheKey(databaseIdentity: string, subjectId: string, tableId: string, query: ViewerTableQuery) {
  return JSON.stringify({ databaseIdentity, subjectId, tableId, query: stableValue(query) });
}