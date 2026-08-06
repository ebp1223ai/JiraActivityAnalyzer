import type { ActivityViewerRow } from "../../shared/activityViewerTypes";
import type { DateRangeState } from "./dateRange";
import type { DiffQuickFilters } from "../../shared/viewerEfficiency";
export type ViewerSortDirection = "asc" | "desc";
export type ViewerTableQuery = {
  page: number;
  pageSize: 25 | 50 | 100 | 200;
  sort: { field: string; direction: ViewerSortDirection } | null;
  filters: Record<string, {
    text?: string;
    values?: string[];
    from?: string;
    to?: string;
    min?: number;
    max?: number;
  }>;
  dateRange?: DateRangeState;
  revision?: number;
  commentDateMode?: "created" | "updated";
  descriptionChangedOnly?: boolean;
  includeBeforeUnavailable?: boolean;
  diffQuickFilters?: DiffQuickFilters;
};

export type ViewerTableResult<TRow extends Record<string, unknown> = Record<string, unknown>> = {
  rows: TRow[];
  filteredCount: number;
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sourceStatus?: "confirmed" | "no_records" | "source_unidentifiable";
  unidentifiableSourceCount?: number;
};

export type ActivityViewerTableResult = ViewerTableResult<ActivityViewerRow>;

export type ViewerDistinctResult = {
  field: string;
  values: Array<{ value: string; count: number }>;
  truncated: boolean;
};
