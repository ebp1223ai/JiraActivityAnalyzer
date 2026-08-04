export type ActivityViewerColumnId =
  | "eventTime"
  | "action"
  | "eventType"
  | "displayName"
  | "issueKey"
  | "summary"
  | "projectKey"
  | "issueTypeName"
  | "currentStatusName"
  | "currentPriorityName"
  | "fieldName"
  | "before"
  | "after"
  | "diff"
  | "historyId"
  | "itemIndex"
  | "sourceProvenance";

export type ActivityViewerColumnDefinition = {
  id: ActivityViewerColumnId;
  label: string;
  required: boolean;
  defaultVisible: boolean;
  defaultOrder: number;
  defaultWidth: number;
  sortable: boolean;
  filterable: boolean;
  queryField: string;
};

export const ACTIVITY_VIEWER_COLUMN_REGISTRY: readonly ActivityViewerColumnDefinition[] = [
  { id: "eventTime", label: "Time", required: true, defaultVisible: true, defaultOrder: 0, defaultWidth: 170, sortable: true, filterable: true, queryField: "eventTime" },
  { id: "action", label: "Action", required: true, defaultVisible: true, defaultOrder: 1, defaultWidth: 150, sortable: true, filterable: true, queryField: "action" },
  { id: "eventType", label: "Event Type", required: false, defaultVisible: true, defaultOrder: 2, defaultWidth: 170, sortable: true, filterable: true, queryField: "eventType" },
  { id: "displayName", label: "Actor", required: false, defaultVisible: true, defaultOrder: 3, defaultWidth: 180, sortable: true, filterable: true, queryField: "actor" },
  { id: "issueKey", label: "Issue Key", required: false, defaultVisible: true, defaultOrder: 4, defaultWidth: 150, sortable: true, filterable: true, queryField: "issueKey" },
  { id: "summary", label: "Summary", required: false, defaultVisible: false, defaultOrder: 5, defaultWidth: 260, sortable: true, filterable: true, queryField: "summary" },
  { id: "projectKey", label: "Project", required: false, defaultVisible: true, defaultOrder: 6, defaultWidth: 130, sortable: true, filterable: true, queryField: "projectKey" },
  { id: "issueTypeName", label: "Issue Type", required: false, defaultVisible: true, defaultOrder: 7, defaultWidth: 150, sortable: true, filterable: true, queryField: "issueTypeName" },
  { id: "currentStatusName", label: "Status", required: false, defaultVisible: true, defaultOrder: 8, defaultWidth: 150, sortable: true, filterable: true, queryField: "currentStatusName" },
  { id: "currentPriorityName", label: "Priority", required: false, defaultVisible: true, defaultOrder: 9, defaultWidth: 140, sortable: true, filterable: true, queryField: "currentPriorityName" },
  { id: "fieldName", label: "Field", required: false, defaultVisible: true, defaultOrder: 10, defaultWidth: 180, sortable: true, filterable: true, queryField: "field" },
  { id: "before", label: "Before", required: false, defaultVisible: true, defaultOrder: 11, defaultWidth: 320, sortable: true, filterable: true, queryField: "before" },
  { id: "after", label: "After", required: false, defaultVisible: true, defaultOrder: 12, defaultWidth: 320, sortable: true, filterable: true, queryField: "after" },
  { id: "diff", label: "Diff", required: false, defaultVisible: true, defaultOrder: 13, defaultWidth: 400, sortable: true, filterable: true, queryField: "diff" },
  { id: "historyId", label: "History ID", required: false, defaultVisible: true, defaultOrder: 14, defaultWidth: 180, sortable: true, filterable: true, queryField: "historyId" },
  { id: "itemIndex", label: "Item", required: false, defaultVisible: true, defaultOrder: 15, defaultWidth: 90, sortable: true, filterable: true, queryField: "itemIndex" },
  { id: "sourceProvenance", label: "Source", required: false, defaultVisible: true, defaultOrder: 16, defaultWidth: 140, sortable: true, filterable: true, queryField: "source" }
] as const;

export const REQUIRED_ACTIVITY_COLUMN_IDS = ["eventTime", "action"] as const;

const COMMON_ACTIVITY_COLUMN_IDS: readonly ActivityViewerColumnId[] = [
  "eventTime", "action", "eventType", "displayName", "projectKey", "issueTypeName",
  "currentStatusName", "currentPriorityName", "fieldName", "before", "after", "diff", "sourceProvenance"
];

export const ACTIVITY_VIEWER_COLUMNS_BY_SCOPE = {
  issueActivityEvents: COMMON_ACTIVITY_COLUMN_IDS,
  issueChangelog: [...COMMON_ACTIVITY_COLUMN_IDS.slice(0, -1), "historyId", "itemIndex", "sourceProvenance"],
  userAllActivityEvents: ["eventTime", "action", "eventType", "displayName", "issueKey", "summary", ...COMMON_ACTIVITY_COLUMN_IDS.slice(4)]
} as const satisfies Record<string, readonly ActivityViewerColumnId[]>;

export function activityViewerRegistryForScope(scope: keyof typeof ACTIVITY_VIEWER_COLUMNS_BY_SCOPE) {
  const allowed = new Set<ActivityViewerColumnId>(ACTIVITY_VIEWER_COLUMNS_BY_SCOPE[scope]);
  return ACTIVITY_VIEWER_COLUMN_REGISTRY.filter((column) => allowed.has(column.id));
}
