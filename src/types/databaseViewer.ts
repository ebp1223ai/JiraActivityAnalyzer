import type { UserViewerScope } from "../../shared/userViewerScope";
import type { ViewerTableQuery, ViewerTableResult } from "./activityViewerQuery";

export type ViewerSectionStatus = "ready" | "no_records" | "not_collected" | "unavailable" | "error";

export type ViewerSection<T> = {
  status: ViewerSectionStatus;
  records: T[];
  message: string;
  total: number;
};

export type IssueViewerDto = {
  found: boolean;
  status: "ready" | "not_found" | "payload_unavailable" | "payload_decode_failed" | "payload_invalid" | "payload_unsupported" | "query_failed";
  issueKey: string;
  message: string;
  overview: Record<string, unknown> | null;
  description: {
    status: ViewerSectionStatus;
    source: "rendered" | "plain" | "none";
    plainText: string;
    content: string;
    format: "html" | "wiki" | "plain";
    message: string;
  };
  comments: ViewerSection<Record<string, unknown>>;
  issueLinks: ViewerSection<Record<string, unknown>>;
  rawEvidence: {
    status: ViewerSectionStatus;
    schemaVersion: string;
    payloadFormatVersion: number | null;
    payloadSavedAt: string;
    preview: string;
    message: string;
  };
};

export type ViewerTableSessionState = {
  expandedRowIds: string[];
  scrollLeft: number;
  scrollTop: number;
};

export type UserViewerDistributionItem = { value: string; count: number };
export type UserViewerDistributions = {
  totalRelatedIssues: number;
  totalEvents: number;
  comments: number;
  fieldChanges: number;
  attachments: number;
  earliestEvent: string;
  latestEvent: string;
  projectKey: UserViewerDistributionItem[];
  issueType: UserViewerDistributionItem[];
  status: UserViewerDistributionItem[];
  priority: UserViewerDistributionItem[];
};

export type IssueViewerSessionState = {
  issueKey: string;
  loadedIssueKey: string;
  databaseIdentity: string;
  result: IssueViewerDto | null;
  status: "initial" | "loading" | "ready" | "not-found" | "unavailable" | "error";
  message: string;
  activeTab: string;
  payloadFilter: string;
  payloadPage: number;
  changelogQuery: ViewerTableQuery;
  changelogResult: ViewerTableResult | null;
  changelogStatus: "idle" | "loading" | "ready" | "error";
  changelogMessage: string;
  changelogCacheKey: string;
  commentsQuery: ViewerTableQuery;
  payloadDateRange: import("./dateRange").DateRangeState;
  commentDateMode: "created" | "updated";
  descriptionChangedOnly: boolean;
  includeBeforeUnavailable: boolean;
  activityEventsQuery: ViewerTableQuery;
  activityEventsResult: ViewerTableResult | null;
  activityEventsStatus: "idle" | "loading" | "ready" | "error";
  activityEventsMessage: string;
  activityEventsCacheKey: string;
  pendingSnapshotRequestId: number;
  pendingChangelogRequestId: number;
  pendingActivityRequestId: number;
  tableStates: Record<string, ViewerTableSessionState>;
};

export type UserViewerSessionState = {
  search: string;
  selectionScope: UserViewerScope | null;
  loadedScopeKey: string;
  databaseIdentity: string;
  users: Array<Record<string, unknown>>;
  detail: Record<string, unknown> | null;
  distributions: UserViewerDistributions | null;
  status: "initial" | "loading" | "ready" | "error";
  message: string;
  activeTab: "Related Issues" | "All Activity Events";
  startDate: string;
  endDate: string;
  eventType: string;
  project: string;
  sort: "newest" | "oldest";
  relatedQuery: ViewerTableQuery;
  eventQuery: ViewerTableQuery;
  relatedResult: ViewerTableResult | null;
  allEventsResult: ViewerTableResult | null;
  relatedCacheKey: string;
  eventCacheKey: string;
  pendingRequestId: number;
  tableStates: Record<string, ViewerTableSessionState>;
};