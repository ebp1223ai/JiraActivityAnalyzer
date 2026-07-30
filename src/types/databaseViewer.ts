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
  changelog: ViewerSection<Record<string, unknown>>;
  comments: ViewerSection<Record<string, unknown>>;
  attachments: ViewerSection<Record<string, unknown>>;
  issueLinks: ViewerSection<Record<string, unknown>>;
  remoteLinks: ViewerSection<Record<string, unknown>>;
  activityEvents: ViewerSection<Record<string, unknown>>;
  rawEvidence: {
    status: ViewerSectionStatus;
    schemaVersion: string;
    payloadFormatVersion: number | null;
    payloadSavedAt: string;
    preview: string;
    message: string;
  };
};

export type IssueViewerSessionState = {
  issueKey: string;
  result: IssueViewerDto | null;
  status: "initial" | "loading" | "ready" | "not-found" | "unavailable" | "error";
  message: string;
  activeTab: string;
  activityEventsQuery: ViewerTableQuery;
  activityEventsResult: ViewerTableResult | null;
  activityEventsStatus: "idle" | "loading" | "ready" | "error";
  activityEventsMessage: string;
};

export type UserViewerSessionState = {
  search: string;
  selectedUserId: string;
  users: Array<Record<string, unknown>>;
  detail: Record<string, unknown> | null;
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
};
import type { ViewerTableQuery, ViewerTableResult } from "./activityViewerQuery";
