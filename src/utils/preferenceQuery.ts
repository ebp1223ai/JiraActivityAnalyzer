import type { ViewerTableQuery } from "../types/activityViewerQuery";
import type { TablePreferences } from "../types/uiPreferences";

export function queryFromTablePreferences(
  current: ViewerTableQuery,
  preferences: TablePreferences | undefined
): ViewerTableQuery {
  if (!preferences) return current;
  const pageSize = [25, 50, 100].includes(Number(preferences.pageSize))
    ? Number(preferences.pageSize) as 25 | 50 | 100
    : current.pageSize;
  return {
    page: Number.isSafeInteger(preferences.pageIndex) && Number(preferences.pageIndex) >= 1
      ? Number(preferences.pageIndex)
      : 1,
    pageSize,
    sort: preferences.sort ?? current.sort,
    filters: preferences.filters ?? current.filters
  };
}
