import type { DateRangeState } from "./dateRange";
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
};

export type ViewerTableResult = {
  rows: Array<Record<string, unknown>>;
  filteredCount: number;
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sourceStatus?: "confirmed" | "no_records" | "source_unidentifiable";
  unidentifiableSourceCount?: number;
};

export type ViewerDistinctResult = {
  field: string;
  values: Array<{ value: string; count: number }>;
  truncated: boolean;
};
