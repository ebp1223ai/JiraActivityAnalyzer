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
  formatVersion: 1;
  databaseIssueList: TablePreferences;
  timelineEventList: TablePreferences;
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

const PAGE_SIZES = new Set([25, 50, 100, 200]);

function defaultTable(columns: readonly string[], pageSize = 50): TablePreferences {
  return { visibleColumns: [...columns], columnOrder: [...columns], columnWidths: {}, pageSize };
}

export function defaultUiPreferences(): UiPreferences {
  return {
    formatVersion: 1,
    databaseIssueList: defaultTable(DATABASE_ISSUE_COLUMNS),
    timelineEventList: defaultTable(TIMELINE_EVENT_COLUMNS)
  };
}

function uniqueAllowed(value: unknown, allowed: readonly string[], fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const allowedSet = new Set(allowed);
  const result = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && allowedSet.has(item))));
  return result.length ? result : fallback;
}

function normalizeTable(value: unknown, columns: readonly string[], fallback: TablePreferences): TablePreferences {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const columnOrder = uniqueAllowed(source.columnOrder, columns, fallback.columnOrder);
  for (const column of columns) if (!columnOrder.includes(column)) columnOrder.push(column);
  const visibleColumns = uniqueAllowed(source.visibleColumns, columns, fallback.visibleColumns);
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
  return {
    ...source,
    formatVersion: 1,
    databaseIssueList: normalizeTable(source.databaseIssueList, DATABASE_ISSUE_COLUMNS, defaults.databaseIssueList),
    timelineEventList: normalizeTable(source.timelineEventList, TIMELINE_EVENT_COLUMNS, defaults.timelineEventList)
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

export function updateUiPreferences(appRoot: string, section: "databaseIssueList" | "timelineEventList", value: unknown) {
  const loaded = loadUiPreferences(appRoot);
  const merged = normalizeUiPreferences({ ...loaded.preferences, [section]: value });
  writeJsonAtomic(loaded.filePath, merged);
  return { preferences: merged, filePath: loaded.filePath, warning: "" };
}
