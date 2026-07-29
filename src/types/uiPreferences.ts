import type { DatabaseIssueColumn, DatabaseIssuePageSize } from "./databaseQuery";

export type TablePreferences<TColumn extends string = string> = {
  visibleColumns: TColumn[];
  columnOrder: TColumn[];
  columnWidths: Partial<Record<TColumn, number>>;
  pageSize: number;
};

export type UiPreferences = {
  formatVersion: 1;
  databaseIssueList: TablePreferences<DatabaseIssueColumn>;
  timelineEventList: TablePreferences;
  userRelatedIssues: TablePreferences;
  userActivityStream: TablePreferences;
  userAllActivityEvents: TablePreferences;
  issueActivityStream: TablePreferences;
};

export type UiPreferencesLoadResult = {
  preferences: UiPreferences;
  filePath: string;
  warning: string;
};

export type UiPreferencesUpdate = {
  section: "databaseIssueList" | "timelineEventList" | "userRelatedIssues"
    | "userActivityStream" | "userAllActivityEvents" | "issueActivityStream";
  value: TablePreferences<DatabaseIssueColumn> | TablePreferences;
};

export type DatabaseIssueListPreferences = TablePreferences<DatabaseIssueColumn> & {
  pageSize: DatabaseIssuePageSize;
};
