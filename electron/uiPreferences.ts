import fs from "node:fs";
import path from "node:path";
import { activityViewerRegistryForScope } from "../shared/activityViewerColumns.js";
import { assertPathInsideRoot, resolveInsideRoot } from "./appRoot.js";

export type TableFilterPreference = {
  text?: string;
  values?: string[];
  from?: string;
  to?: string;
  min?: number;
  max?: number;
};

export type TablePreferences = {
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pageSize: number;
  pageIndex: number;
  sort: { field: string; direction: "asc" | "desc" } | null;
  filters: Record<string, TableFilterPreference>;
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
  filterPresets: Array<Record<string, unknown>>;
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

export const ISSUE_ACTIVITY_EVENT_COLUMNS = activityViewerRegistryForScope("issueActivityEvents").map((column) => column.id);
export const ISSUE_CHANGELOG_COLUMNS = activityViewerRegistryForScope("issueChangelog").map((column) => column.id);
export const USER_ACTIVITY_EVENT_COLUMNS = activityViewerRegistryForScope("userAllActivityEvents").map((column) => column.id);

export const ISSUE_COMMENT_COLUMNS = ["author", "created", "updated", "body"] as const;

const PAGE_SIZES = new Set([25, 50, 100]);
const ACTIVITY_QUERY_FIELDS = Array.from(new Set(["issueActivityEvents", "issueChangelog", "userAllActivityEvents"].flatMap((scope) =>
  activityViewerRegistryForScope(scope as "issueActivityEvents" | "issueChangelog" | "userAllActivityEvents").map((column) => column.queryField)
)));

function defaultTable(columns: readonly string[], pageSize = 50): TablePreferences {
  return { visibleColumns: [...columns], columnOrder: [...columns], columnWidths: {}, pageSize, pageIndex: 1, sort: null, filters: {} };
}

export function defaultUiPreferences(): UiPreferences {
  return {
    formatVersion: 2,
    databaseIssueList: defaultTable(DATABASE_ISSUE_COLUMNS, 50),
    timelineEventList: defaultTable(TIMELINE_EVENT_COLUMNS),
    userRelatedIssues: defaultTable(USER_RELATED_ISSUE_COLUMNS),
    userAllActivityEvents: { ...defaultTable(USER_ACTIVITY_EVENT_COLUMNS), visibleColumns: USER_ACTIVITY_EVENT_COLUMNS.filter((column) => !["before", "after"].includes(column)) },
    issueActivityEvents: defaultTable(ISSUE_ACTIVITY_EVENT_COLUMNS),
    issueChangelog: defaultTable(ISSUE_CHANGELOG_COLUMNS),
    issueComments: defaultTable(ISSUE_COMMENT_COLUMNS),
    filterPresets: []
  };
}

function uniqueAllowed(value: unknown, allowed: readonly string[], fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const allowedSet = new Set(allowed);
  const result = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && allowedSet.has(item))));
  return result.length ? result : fallback;
}

function boundedText(value: unknown, limit = 256) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function normalizeFilter(value: unknown): TableFilterPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: TableFilterPreference = {};
  const text = boundedText(source.text);
  const from = boundedText(source.from, 64);
  const to = boundedText(source.to, 64);
  if (text) result.text = text;
  if (from) result.from = from;
  if (to) result.to = to;
  if (Array.isArray(source.values)) {
    const values = Array.from(new Set(source.values.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 256)).filter(Boolean))).slice(0, 100);
    if (values.length) result.values = values;
  }
  const min = Number(source.min);
  const max = Number(source.max);
  if (Number.isFinite(min)) result.min = min;
  if (Number.isFinite(max)) result.max = max;
  return Object.keys(result).length ? result : null;
}

const LEGACY_ACTIVITY_COLUMN_IDS: Record<string, string> = {
  created: "eventTime",
  author: "displayName",
  field: "fieldName",
  added: "after",
  removed: "before"
};

function migrateActivityPreferences(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const mapIds = (candidate: unknown) => Array.isArray(candidate)
    ? candidate.map((id) => typeof id === "string" ? (LEGACY_ACTIVITY_COLUMN_IDS[id] ?? id) : id)
    : candidate;
  const columnOrder = mapIds(source.columnOrder);
  const visibleColumns = mapIds(source.visibleColumns);
  const order = Array.isArray(columnOrder) ? [...columnOrder] : [];
  if (!order.includes("action") && order.includes("eventType")) order.splice(order.indexOf("eventType"), 0, "action");
  const widths = source.columnWidths && typeof source.columnWidths === "object" && !Array.isArray(source.columnWidths)
    ? { ...(source.columnWidths as Record<string, unknown>) }
    : {};
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_ACTIVITY_COLUMN_IDS)) {
    if (widths[canonicalId] === undefined && widths[legacyId] !== undefined) widths[canonicalId] = widths[legacyId];
    delete widths[legacyId];
  }
  if (widths.action === undefined && widths.eventType !== undefined && !Array.isArray(source.columnOrder)) widths.action = widths.eventType;
  return { ...source, columnOrder: order, visibleColumns, columnWidths: widths };
}
function normalizeTable(value: unknown, columns: readonly string[], fallback: TablePreferences, required: readonly string[] = [], queryFields: readonly string[] = columns): TablePreferences {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const persistedOrder = uniqueAllowed(source.columnOrder, columns, fallback.columnOrder);
  const requiredSet = new Set(required.filter((column) => columns.includes(column)));
  const columnOrder = [...requiredSet, ...persistedOrder.filter((column) => !requiredSet.has(column))];
  for (const column of columns) if (!columnOrder.includes(column)) columnOrder.push(column);
  const visibleColumns = uniqueAllowed(source.visibleColumns, columns, fallback.visibleColumns);
  const rawOrder = Array.isArray(source.columnOrder) ? source.columnOrder.filter((column): column is string => typeof column === "string") : [];
  for (const column of fallback.visibleColumns) if (!rawOrder.includes(column) && !visibleColumns.includes(column)) visibleColumns.push(column);
  for (const column of requiredSet) if (!visibleColumns.includes(column)) visibleColumns.push(column);
  const widthsSource = source.columnWidths && typeof source.columnWidths === "object" && !Array.isArray(source.columnWidths)
    ? source.columnWidths as Record<string, unknown> : {};
  const columnWidths: Record<string, number> = {};
  for (const column of columns) {
    const width = Number(widthsSource[column]);
    if (Number.isFinite(width) && width >= 72 && width <= 640) columnWidths[column] = Math.trunc(width);
  }
  const pageSize = PAGE_SIZES.has(Number(source.pageSize)) ? Number(source.pageSize) : fallback.pageSize;
  const rawPageIndex = Number(source.pageIndex);
  const pageIndex = Number.isSafeInteger(rawPageIndex) && rawPageIndex >= 1 && rawPageIndex <= 1_000_000 ? rawPageIndex : 1;
  const allowedQueryFields = new Set(queryFields);
  const rawSort = source.sort && typeof source.sort === "object" && !Array.isArray(source.sort) ? source.sort as Record<string, unknown> : null;
  const sortField = typeof rawSort?.field === "string" && allowedQueryFields.has(rawSort.field) ? rawSort.field : "";
  const sort = sortField ? { field: sortField, direction: rawSort?.direction === "desc" ? "desc" as const : "asc" as const } : null;
  const rawFilters = source.filters && typeof source.filters === "object" && !Array.isArray(source.filters) ? source.filters as Record<string, unknown> : {};
  const filters: Record<string, TableFilterPreference> = {};
  for (const [field, candidate] of Object.entries(rawFilters)) {
    if (!allowedQueryFields.has(field)) continue;
    const filter = normalizeFilter(candidate);
    if (filter) filters[field] = filter;
  }
  return { visibleColumns, columnOrder, columnWidths, pageSize, pageIndex, sort, filters };
}

function normalizeFilterPresets(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const id = boundedText(source.id, 128);
    const viewerId = boundedText(source.viewerId, 64);
    const tabId = boundedText(source.tabId, 64);
    const name = boundedText(source.name, 80).trim();
    const key = viewerId + ":" + tabId + ":" + name.toLowerCase();
    if (!id || !viewerId || !tabId || !name || seen.has(key)) continue;
    seen.add(key);
    const querySource = source.query && typeof source.query === "object" && !Array.isArray(source.query) ? source.query as Record<string, unknown> : {};
    const filters: Record<string, TableFilterPreference> = {};
    const rawFilters = querySource.filters && typeof querySource.filters === "object" && !Array.isArray(querySource.filters) ? querySource.filters as Record<string, unknown> : {};
    for (const [field, candidate] of Object.entries(rawFilters).slice(0, 100)) {
      const filter = normalizeFilter(candidate);
      if (filter) filters[field.slice(0, 128)] = filter;
    }
    const query: Record<string, unknown> = { filters };
    if (["activity", "created", "updated"].includes(String(querySource.dateMode))) query.dateMode = querySource.dateMode;
    if (querySource.dateRange && typeof querySource.dateRange === "object") query.dateRange = querySource.dateRange;
    if (querySource.sort === null || (querySource.sort && typeof querySource.sort === "object")) query.sort = querySource.sort;
    if ([25, 50, 100, 200].includes(Number(querySource.pageSize))) query.pageSize = Number(querySource.pageSize);
    if (["created", "updated"].includes(String(querySource.commentDateMode))) query.commentDateMode = querySource.commentDateMode;
    if (typeof querySource.descriptionChangedOnly === "boolean") query.descriptionChangedOnly = querySource.descriptionChangedOnly;
    if (typeof querySource.includeBeforeUnavailable === "boolean") query.includeBeforeUnavailable = querySource.includeBeforeUnavailable;
    result.push({ schemaVersion: 1, id, viewerId, tabId, name, query, updatedAt: boundedText(source.updatedAt, 64) || new Date(0).toISOString() });
  }
  return result;
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
    userAllActivityEvents: normalizeTable(migrateActivityPreferences(source.userAllActivityEvents), USER_ACTIVITY_EVENT_COLUMNS, defaults.userAllActivityEvents, ["eventTime", "action", "issueKey"], ACTIVITY_QUERY_FIELDS),
    issueActivityEvents: normalizeTable(migrateActivityPreferences(source.issueActivityEvents), ISSUE_ACTIVITY_EVENT_COLUMNS, defaults.issueActivityEvents, ["eventTime", "action"], ACTIVITY_QUERY_FIELDS),
    issueChangelog: normalizeTable(migrateActivityPreferences(source.issueChangelog), ISSUE_CHANGELOG_COLUMNS, defaults.issueChangelog, ["eventTime", "action"], ACTIVITY_QUERY_FIELDS),
    issueComments: normalizeTable(source.issueComments, ISSUE_COMMENT_COLUMNS, defaults.issueComments, ["created", "author"]),
    filterPresets: normalizeFilterPresets(source.filterPresets)
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
    try {
      fs.renameSync(temporary, filePath);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (!["EEXIST", "EPERM", "EACCES"].includes(code)) throw error;
      fs.copyFileSync(temporary, filePath);
      fs.unlinkSync(temporary);
    }
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
  | "issueActivityEvents" | "issueChangelog" | "issueComments" | "filterPresets";

export function updateUiPreferences(appRoot: string, section: UiPreferenceSection, value: unknown) {
  const loaded = loadUiPreferences(appRoot);
  const merged = normalizeUiPreferences({ ...loaded.preferences, [section]: value });
  writeJsonAtomic(loaded.filePath, merged);
  return { preferences: merged, filePath: loaded.filePath, warning: "" };
}
