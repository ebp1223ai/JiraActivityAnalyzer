import fs from "node:fs";
import path from "node:path";
import { assertPathInsideRoot, resolveInsideRoot } from "./appRoot.js";

export type TablePreferences = {
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pageSize: number;
};

export type UiPreferences = {
  formatVersion: 2;
  databaseIssueList: TablePreferences;
  timelineEventList: TablePreferences;
  userRelatedIssues: TablePreferences;
  userAllActivityEvents: TablePreferences;
  issueActivityEvents: TablePreferences;
  issueChangelog: TablePreferences;
  issueComments: TablePreferences;
  [key: string]: unknown;
};

export const DATABASE_ISSUE_COLUMNS = [
  "issueKey", "summary", "projectKey", "issueType", "status", "priority", "assignee",
  "reporter", "creator", "createdAt", "jiraUpdatedAt", "snapshotTime", "saveOutcome",
  "eventCount", "commentCount", "attachmentCount"
] as const;

export const TIMELINE_EVENT_COLUMNS = [
  "time", "user", "issueKey", "activityType", "sourceApplication", "title", "allIssueKeys",
  "sourceDetail", "jiraRelation", "confidence", "eventId", "entryFingerprint", "relatedSystems",
  "jiraRelationReason", "rawTitle", "sourceVariant", "baselineStatus"
] as const;

export const USER_RELATED_ISSUE_COLUMNS = [
  "issueKey", "summary", "projectKey", "issueType", "status", "priority",
  "userActivities", "comments", "fieldChanges", "firstActivity", "lastActivity"
] as const;

export const ACTIVITY_VIEWER_COLUMNS = [
  "eventTime", "userId", "displayName", "issueKey", "eventType", "fieldName",
  "before", "after", "diff", "summary", "sourceProvenance"
] as const;

export const ISSUE_CHANGELOG_COLUMNS = [
  "created", "author", "field", "before", "after", "added", "removed"
] as const;

export const ISSUE_COMMENT_COLUMNS = ["author", "created", "updated", "body"] as const;

const PAGE_SIZES = new Set([25, 50, 100]);

function defaultTable(columns: readonly string[], pageSize = 50): TablePreferences {
  return { visibleColumns: [...columns], columnOrder: [...columns], columnWidths: {}, pageSize };
}

export function defaultUiPreferences(): UiPreferences {
  return {
    formatVersion: 2,
    databaseIssueList: defaultTable(DATABASE_ISSUE_COLUMNS, 50),
    timelineEventList: defaultTable(TIMELINE_EVENT_COLUMNS),
    userRelatedIssues: defaultTable(USER_RELATED_ISSUE_COLUMNS),
    userAllActivityEvents: { ...defaultTable(ACTIVITY_VIEWER_COLUMNS), visibleColumns: ACTIVITY_VIEWER_COLUMNS.filter((column) => !["before", "after"].includes(column)) },
    issueActivityEvents: defaultTable(ACTIVITY_VIEWER_COLUMNS),
    issueChangelog: defaultTable(ISSUE_CHANGELOG_COLUMNS),
    issueComments: defaultTable(ISSUE_COMMENT_COLUMNS)
  };
}

function uniqueAllowed(value: unknown, allowed: readonly string[], fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const allowedSet = new Set(allowed);
  const result = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && allowedSet.has(item))));
  return result.length ? result : fallback;
}

function normalizeTable(value: unknown, columns: readonly string[], fallback: TablePreferences, required: readonly string[] = []): TablePreferences {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const columnOrder = uniqueAllowed(source.columnOrder, columns, fallback.columnOrder);
  for (const column of columns) if (!columnOrder.includes(column)) columnOrder.push(column);
  const visibleColumns = uniqueAllowed(source.visibleColumns, columns, fallback.visibleColumns);
  for (const column of required) if (columns.includes(column) && !visibleColumns.includes(column)) visibleColumns.push(column);
  const widthsSource = source.columnWidths && typeof source.columnWidths === "object" && !Array.isArray(source.columnWidths)
    ? source.columnWidths as Record<string, unknown> : {};
  const columnWidths: Record<string, number> = {};
  for (const column of columns) {
    const width = Number(widthsSource[column]);
    if (Number.isFinite(width) && width >= 72 && width <= 640) columnWidths[column] = Math.trunc(width);
  }
  const pageSize = PAGE_SIZES.has(Number(source.pageSize)) ? Number(source.pageSize) : fallback.pageSize;
  return { visibleColumns, columnOrder, columnWidths, pageSize };
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  const defaults = defaultUiPreferences();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const retained = { ...source };
  delete retained.userActivityStream;
  delete retained.issueActivityStream;
  return {
    ...retained,
    formatVersion: 2,
    databaseIssueList: normalizeTable(source.databaseIssueList, DATABASE_ISSUE_COLUMNS, defaults.databaseIssueList, ["issueKey"]),
    timelineEventList: normalizeTable(source.timelineEventList, TIMELINE_EVENT_COLUMNS, defaults.timelineEventList),
    userRelatedIssues: normalizeTable(source.userRelatedIssues, USER_RELATED_ISSUE_COLUMNS, defaults.userRelatedIssues, ["issueKey"]),
    userAllActivityEvents: normalizeTable(source.userAllActivityEvents, ACTIVITY_VIEWER_COLUMNS, defaults.userAllActivityEvents, ["eventTime", "issueKey", "eventType"]),
    issueActivityEvents: normalizeTable(source.issueActivityEvents, ACTIVITY_VIEWER_COLUMNS, defaults.issueActivityEvents, ["eventTime", "eventType"]),
    issueChangelog: normalizeTable(source.issueChangelog, ISSUE_CHANGELOG_COLUMNS, defaults.issueChangelog, ["created", "field"]),
    issueComments: normalizeTable(source.issueComments, ISSUE_COMMENT_COLUMNS, defaults.issueComments, ["created", "author"])
  };
}

export function uiPreferencesPath(appRoot: string) {
  return resolveInsideRoot(appRoot, "app-data", "settings", "ui-preferences.json");
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, filePath);
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* Best effort cleanup. */ }
  }
}

export function loadUiPreferences(appRoot: string) {
  const filePath = assertPathInsideRoot(appRoot, uiPreferencesPath(appRoot));
  if (!fs.existsSync(filePath)) return { preferences: defaultUiPreferences(), filePath, warning: "" };
  try {
    return { preferences: normalizeUiPreferences(JSON.parse(fs.readFileSync(filePath, "utf8"))), filePath, warning: "" };
  } catch {
    return {
      preferences: defaultUiPreferences(),
      filePath,
      warning: "UI preferences were corrupt and safe defaults were loaded. / UI 偏好設定損毀，已載入安全預設值。"
    };
  }
}

export type UiPreferenceSection = "databaseIssueList" | "timelineEventList" | "userRelatedIssues" | "userAllActivityEvents"
  | "issueActivityEvents" | "issueChangelog" | "issueComments";

export function updateUiPreferences(appRoot: string, section: UiPreferenceSection, value: unknown) {
  const loaded = loadUiPreferences(appRoot);
  const merged = normalizeUiPreferences({ ...loaded.preferences, [section]: value });
  writeJsonAtomic(loaded.filePath, merged);
  return { preferences: merged, filePath: loaded.filePath, warning: "" };
}
