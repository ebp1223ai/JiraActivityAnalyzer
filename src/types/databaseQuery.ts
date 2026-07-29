export const DATABASE_ISSUE_PAGE_SIZES = [25, 50, 100, 200] as const;

export type DatabaseIssuePageSize = typeof DATABASE_ISSUE_PAGE_SIZES[number];
export type DatabaseIssueSortDirection = "asc" | "desc";
export type DatabaseIssueColumn =
  | "issueKey" | "summary" | "projectKey" | "issueType" | "status" | "priority"
  | "assignee" | "reporter" | "creator" | "createdAt" | "jiraUpdatedAt"
  | "snapshotTime" | "saveOutcome" | "eventCount" | "commentCount" | "attachmentCount";

export type DatabaseTextFilter = { value: string };
export type DatabaseMultiFilter = { values: string[] };
export type DatabaseDateFilter = { from?: string; to?: string };
export type DatabaseNumberFilter = { min?: number; max?: number };

export type DatabaseIssueFilters = Partial<{
  issueKey: DatabaseTextFilter;
  summary: DatabaseTextFilter;
  projectKey: DatabaseMultiFilter;
  issueType: DatabaseMultiFilter;
  status: DatabaseMultiFilter;
  priority: DatabaseMultiFilter;
  assignee: DatabaseMultiFilter;
  reporter: DatabaseMultiFilter;
  creator: DatabaseMultiFilter;
  createdAt: DatabaseDateFilter;
  jiraUpdatedAt: DatabaseDateFilter;
  snapshotTime: DatabaseDateFilter;
  saveOutcome: DatabaseMultiFilter;
  eventCount: DatabaseNumberFilter;
  commentCount: DatabaseNumberFilter;
  attachmentCount: DatabaseNumberFilter;
}>;

export type DatabaseIssueQuery = {
  page: number;
  pageSize: DatabaseIssuePageSize;
  sort: { field: DatabaseIssueColumn; direction: DatabaseIssueSortDirection };
  filters: DatabaseIssueFilters;
};

export type DatabaseIssueQueryResult = {
  databaseTotal: number;
  filteredTotal: number;
  page: number;
  pageSize: DatabaseIssuePageSize;
  pageCount: number;
  items: Array<Record<string, unknown>>;
};

export type DatabaseDistributionItem = { value: string; count: number };
export type DatabaseIssueDistributions = {
  total: number;
  projectKey: DatabaseDistributionItem[];
  issueType: DatabaseDistributionItem[];
  status: DatabaseDistributionItem[];
  priority: DatabaseDistributionItem[];
};
