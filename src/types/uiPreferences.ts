import type { DatabaseIssueColumn, DatabaseIssuePageSize } from "./databaseQuery";

export type TableFilterPreference = {
  text?: string;
  values?: string[];
  from?: string;
  to?: string;
  min?: number;
  max?: number;
};

export type TablePreferences<TColumn extends string = string> = {
  visibleColumns: TColumn[];
  columnOrder: TColumn[];
  columnWidths: Partial<Record<TColumn, number>>;
  pageSize: number;
  pageIndex?: number;
  sort?: { field: string; direction: "asc" | "desc" } | null;
  filters?: Record<string, TableFilterPreference>;
};

export type UiPreferences = {
  formatVersion: 2;
  databaseIssueList: TablePreferences<DatabaseIssueColumn>;
  timelineEventList: TablePreferences;
  userRelatedIssues: TablePreferences;
  userAllActivityEvents: TablePreferences;
  issueActivityEvents: TablePreferences;
  issueChangelog: TablePreferences;
  issueComments: TablePreferences;
};

export type UiPreferencesLoadResult = {
  preferences: UiPreferences;
  filePath: string;
  warning: string;
};

export type UiPreferencesUpdate = {
  section: "databaseIssueList" | "timelineEventList" | "userRelatedIssues"
    | "userAllActivityEvents" | "issueActivityEvents" | "issueChangelog" | "issueComments";
  value: TablePreferences<DatabaseIssueColumn> | TablePreferences;
};

export type DatabaseIssueListPreferences = TablePreferences<DatabaseIssueColumn> & {
  pageSize: DatabaseIssuePageSize;
};
