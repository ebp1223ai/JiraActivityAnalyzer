import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { normalizeSourceObjectKey } from "./sourceArchiveDatabase.js";
import { dateRangeBounds, normalizeDateRange } from "./dateRange.js";
import { buildDescriptionDiff, resolveDescriptionFullContext, type DescriptionDiffInput, type DescriptionDiffResult } from "../shared/descriptionDiff.js";
type ViewerSectionStatus = "ready" | "no_records" | "not_collected" | "unavailable" | "error";

interface ViewerSection<T = unknown> {
  status: ViewerSectionStatus;
  records: T[];
  message: string;
  total: number;
}

interface IssueViewerDto {
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
  worklogs: ViewerSection<Record<string, unknown>>;
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
}

type Row = Record<string, unknown>;
const MAX_VIEWER_PAYLOAD_BYTES = 64 * 1024 * 1024;
const MAX_RAW_PREVIEW_CHARS = 24000;
const ISSUE_PAGE_SIZES = new Set([25, 50, 100, 200]);
const ISSUE_COLUMN_SQL = {
  issueKey: "o.issue_key",
  summary: "s.summary",
  projectKey: "o.project_key",
  issueType: "s.issue_type",
  status: "s.status",
  priority: "s.priority",
  assignee: "s.assignee",
  reporter: "s.reporter",
  creator: "s.creator",
  createdAt: "json_extract(s.snapshot_json, '$.fields.created')",
  jiraUpdatedAt: "s.jira_updated_at",
  snapshotTime: "s.snapshot_updated_at",
  saveOutcome: "y.last_outcome",
  eventCount: "COALESCE(ec.event_count, 0)",
  commentCount: "COALESCE(ec.comment_count, 0)",
  attachmentCount: "COALESCE(ec.attachment_count, 0)"
} as const;
type IssueColumn = keyof typeof ISSUE_COLUMN_SQL;
type IssueQuery = {
  page?: unknown;
  pageSize?: unknown;
  sort?: unknown;
  filters?: unknown;
  dateMode?: unknown;
  dateRange?: unknown;
  revision?: unknown;
};

function openReadOnly(databasePath: string) {
  const resolved = path.resolve(databasePath);
  if (!fs.existsSync(resolved)) throw new Error("DATABASE_MISSING");
  const db = new DatabaseSync(resolved, { readOnly: true });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA query_only = ON; PRAGMA busy_timeout = 3000;");
  return { db, resolved };
}

function rows(value: unknown) {
  return value as Row[];
}

function row(value: unknown) {
  return (value ?? {}) as Row;
}

function boundedLimit(value: unknown, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.trunc(parsed))) : fallback;
}

function boundedOffset(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function databaseSize(databasePath: string) {
  try {
    return fs.statSync(databasePath).size;
  } catch {
    return 0;
  }
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function plainText(value: unknown): string {
  if (typeof value === "string") {
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join("\n");
  const valueRecord = record(value);
  if (!Object.keys(valueRecord).length) return "";
  if (typeof valueRecord.text === "string") return valueRecord.text;
  return Object.values(valueRecord).map(plainText).filter(Boolean).join("\n");
}

function section(records: Row[], status: ViewerSection<Row>["status"] = records.length ? "ready" : "no_records", message = ""): ViewerSection<Row> {
  return { status, records, total: records.length, message: message || (records.length ? "" : "No records / 無資料") };
}

function unavailableSection(message: string): ViewerSection<Row> {
  return section([], "unavailable", message);
}

function displayName(value: unknown) {
  const actor = record(value);
  return String(actor.displayName ?? actor.name ?? actor.emailAddress ?? actor.accountId ?? "");
}

function normalizeChangelogRecords(value: Row[], issueKey: string, activityEvents: Row[]) {
  const bySourceRecord = new Map<string, Row[]>();
  for (const event of activityEvents) {
    const sourceRecordId = String(event.sourceRecordId ?? "");
    if (!sourceRecordId) continue;
    const candidates = bySourceRecord.get(sourceRecordId) ?? [];
    candidates.push(event);
    bySourceRecord.set(sourceRecordId, candidates);
  }
  return value.flatMap((history, historyIndex) => {
    const historyId = String(history.id ?? `history-${historyIndex + 1}`);
    const created = String(history.created ?? history.time ?? "");
    const author = displayName(history.author);
    const items = Array.isArray(history.items) ? history.items.map(record) : [history];
    return items.map((item, itemIndex) => {
      const fieldId = String(item.fieldId ?? "").trim();
      const fieldName = String(item.field ?? item.fieldId ?? "Unknown field");
      const isDescription = fieldId.toLowerCase() === "description" || (!fieldId && fieldName.trim().toLowerCase() === "description");
      const beforePresent = Object.prototype.hasOwnProperty.call(item, "fromString") || Object.prototype.hasOwnProperty.call(item, "from");
      const afterPresent = Object.prototype.hasOwnProperty.call(item, "toString") || Object.prototype.hasOwnProperty.call(item, "to");
      const beforeRaw = Object.prototype.hasOwnProperty.call(item, "fromString") ? item.fromString : item.from;
      const afterRaw = Object.prototype.hasOwnProperty.call(item, "toString") ? item.toString : item.to;
      const before = plainText(beforeRaw ?? "");
      const after = plainText(afterRaw ?? "");
      const sourceRecordId = `${historyId}:${itemIndex}`;
      const candidates = bySourceRecord.get(sourceRecordId) ?? [];
      const matched = candidates.length === 1 ? candidates[0] : null;
      const descriptionDiff: DescriptionDiffResult | undefined = !isDescription ? undefined : (matched?.descriptionDiff as DescriptionDiffResult | undefined) ?? buildDescriptionDiff({
        eventId: String(matched?.eventId ?? ""), issueKey, fieldId, fieldName,
        sourceType: String(matched?.sourceProvenance ?? "jira_changelog"), sourceId: sourceRecordId,
        changelogHistoryId: historyId, changelogItemIndex: itemIndex, candidateCount: candidates.length,
        before: { available: beforePresent, complete: beforePresent, value: beforeRaw },
        after: { available: afterPresent, complete: afterPresent, value: afterRaw }
      });
      return {
        historyId, itemId: sourceRecordId, itemIndex, eventId: matched?.eventId,
        issueKey, created, author, fieldId, fieldName, field: fieldName,
        before: isDescription ? undefined : before, after: isDescription ? undefined : after,
        beforeAvailable: isDescription ? descriptionDiff?.beforeAvailable : beforePresent,
        afterAvailable: isDescription ? descriptionDiff?.afterAvailable : afterPresent,
        descriptionDiff,
        source: isDescription ? (descriptionDiff?.status === "source-mismatch" ? "Description source mismatch" : "Jira Changelog") : "Jira Changelog",
        changeKind: isDescription ? descriptionDiff?.status : before && after ? "changed" : after ? "added" : before ? "removed" : "recorded"
      };
    });
  });
}
function normalizeCommentRecords(value: Row[]) {
  return value.map((comment, index) => {
    const bodyValue = comment.renderedBody ?? comment.body ?? "";
    const body = typeof bodyValue === "string" ? bodyValue : plainText(bodyValue);
    const format = typeof comment.renderedBody === "string" && /<\/?[a-z][\s\S]*>/i.test(comment.renderedBody)
      ? "html" : typeof bodyValue === "string" ? "wiki" : "plain";
    const created = String(comment.created ?? "");
    const updated = String(comment.updated ?? "");
    return {
      id: String(comment.id ?? `comment-${index + 1}`),
      author: displayName(comment.author),
      created,
      updated,
      edited: Boolean(updated && created && updated !== created),
      body,
      bodyFormat: format
    };
  });
}

export function normalizeIssueViewerPayload(
  rawValue: unknown,
  issueKeyOrMetadata: string | { payloadFormatVersion: number; payloadSavedAt: string; coverageProfile?: unknown },
  metadataOrActivityEvents: { payloadFormatVersion: number; payloadSavedAt: string; coverageProfile?: unknown } | Row[],
  explicitActivityEvents: Row[] = []
): Omit<IssueViewerDto, "found" | "status" | "issueKey" | "message" | "overview"> {
  const issueKey = typeof issueKeyOrMetadata === "string" ? issueKeyOrMetadata : "";
  const metadata = (typeof issueKeyOrMetadata === "string" ? metadataOrActivityEvents : issueKeyOrMetadata) as { payloadFormatVersion: number; payloadSavedAt: string; coverageProfile?: unknown };
  const activityEvents = (typeof issueKeyOrMetadata === "string" ? explicitActivityEvents : metadataOrActivityEvents) as Row[];
  const raw = record(rawValue);
  const issue = record(raw.issue);
  const fields = record(issue.fields);
  const renderedFields = record(issue.renderedFields);
  const renderedDescriptionValue = typeof renderedFields.description === "string" ? renderedFields.description : "";
  const renderedDescription = plainText(renderedDescriptionValue);
  const fallbackDescription = plainText(fields.description);
  const changelog = list(raw.changelog ?? record(issue.changelog).histories);
  const comments = list(raw.comments ?? record(fields.comment).comments);
  const worklogs = list(raw.worklogs ?? fields.worklog);
  const attachments = list(raw.attachments ?? fields.attachment);
  const issueLinks = list(raw.issueLinks ?? fields.issuelinks);
  const remoteValue = raw.remoteLinks;
  const remoteRecord = record(remoteValue);
  const remoteStatus = record(remoteRecord.sectionStatus);
  const remoteRecords = Array.isArray(remoteValue) ? list(remoteValue) : list(remoteRecord.records);
  const coverageProfile = record(metadata.coverageProfile);
  const remoteDisabled = remoteStatus.enabled === false
    || String(remoteStatus.status ?? "").toLowerCase() === "not_attempted"
    || record(raw.coverage).remoteLinks === "Disabled"
    || coverageProfile.remoteLinks === "Disabled";
  const rawSerialized = JSON.stringify(raw);
  return {
    description: renderedDescription
      ? { status: "ready", source: "rendered", plainText: renderedDescription, content: renderedDescriptionValue, format: "html" as const, message: "" }
      : fallbackDescription
        ? { status: "ready", source: "plain", plainText: fallbackDescription, content: fallbackDescription, format: "plain" as const, message: "" }
        : { status: "no_records", source: "none", plainText: "", content: "", format: "plain" as const, message: "No description / 無 Description" },
    changelog: section(normalizeChangelogRecords(changelog, issueKey, activityEvents)),
    comments: section(normalizeCommentRecords(comments)),
    worklogs: section(worklogs),
    attachments: section(attachments),
    issueLinks: section(issueLinks),
    remoteLinks: remoteDisabled
      ? section([], "not_collected", "Not collected because Remote Links is disabled.")
      : section(remoteRecords),
    activityEvents: section(activityEvents),
    rawEvidence: {
      status: "ready",
      schemaVersion: String(raw.schemaVersion ?? "unknown"),
      payloadFormatVersion: metadata.payloadFormatVersion,
      payloadSavedAt: metadata.payloadSavedAt,
      preview: rawSerialized.length > MAX_RAW_PREVIEW_CHARS ? `${rawSerialized.slice(0, MAX_RAW_PREVIEW_CHARS)}\n… preview truncated` : rawSerialized,
      message: rawSerialized.length > MAX_RAW_PREVIEW_CHARS ? "Preview truncated; authoritative payload remains in SQLite." : ""
    }
  };
}

export function issueViewerFailure(issueKey: string, status: IssueViewerDto["status"], message: string, overview: Row | null = null): IssueViewerDto {
  const unavailable = unavailableSection(message);
  return {
    found: status !== "not_found",
    status,
    issueKey,
    message,
    overview,
    description: { status: "unavailable", source: "none", plainText: "", content: "", format: "plain", message },
    changelog: unavailable,
    comments: unavailable,
    worklogs: unavailable,
    attachments: unavailable,
    issueLinks: unavailable,
    remoteLinks: unavailable,
    activityEvents: unavailable,
    rawEvidence: { status: "unavailable", schemaVersion: "", payloadFormatVersion: null, payloadSavedAt: "", preview: "", message }
  };
}

export function loadDatabaseOverview(databasePath: string) {
  const { db, resolved } = openReadOnly(databasePath);
  const startedAt = new Date().toISOString();
  try {
    const metadata = row(db.prepare(`
      SELECT database_id, schema_version, storage_model, storage_model_version,
             jira_server_url, created_at, last_integrity_check_at
      FROM database_metadata WHERE metadata_key = 'primary'
    `).get());
    const counts = row(db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM source_objects) AS totalIssues,
        (SELECT COUNT(*) FROM current_issue_snapshots) AS totalSnapshots,
        (SELECT COUNT(*) FROM current_full_fetch_payloads) AS totalPayloads,
        (SELECT COUNT(*) FROM activity_events) AS totalEvents,
        (SELECT COUNT(*) FROM activity_events WHERE event_type IN ('comment_created', 'comment_updated')) AS comments,
        (SELECT COUNT(*) FROM activity_events WHERE event_type IN ('field_changed', 'status_changed', 'assignee_changed')) AS fieldChanges,
        (SELECT COUNT(*) FROM activity_events WHERE event_type = 'attachment_added') AS attachments
    `).get());
    const latestRun = row(db.prepare("SELECT * FROM database_run_state WHERE state_key = 'latest'").get());
    return {
      status: "ready",
      startedAt,
      completedAt: new Date().toISOString(),
      database: {
        path: resolved,
        filename: path.basename(resolved),
        sizeBytes: databaseSize(resolved),
        ...metadata
      },
      counts,
      latestRun
    };
  } finally {
    db.close();
  }
}

export function runDatabaseHealthCheck(databasePath: string) {
  const { db, resolved } = openReadOnly(databasePath);
  const startedAt = new Date().toISOString();
  try {
    const quickCheck = row(db.prepare("PRAGMA quick_check").get()).quick_check ?? "unknown";
    const foreignKeys = rows(db.prepare("PRAGMA foreign_key_check").all());
    return {
      status: quickCheck === "ok" && foreignKeys.length === 0 ? "healthy" : "error",
      databasePath: resolved,
      quickCheck,
      foreignKeyViolationCount: foreignKeys.length,
      startedAt,
      completedAt: new Date().toISOString()
    };
  } finally {
    db.close();
  }
}

function plainRecord(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_QUERY_OBJECT");
  return value as Row;
}

function assertOnlyKeys(value: Row, allowed: readonly string[], label: string) {
  const invalid = Object.keys(value).filter((key) => !allowed.includes(key));
  if (invalid.length) throw new Error(`${label}_UNSUPPORTED_FIELDS:${invalid.join(",")}`);
}

function queryDate(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new Error(`${label}_INVALID_DATE`);
  return text;
}

function queryNumber(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label}_INVALID_NUMBER`);
  return number;
}

function normalizeIssueQuery(input: IssueQuery = {}) {
  const page = Number(input.page ?? 1);
  const pageSize = Number(input.pageSize ?? 50);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("INVALID_PAGE");
  if (!ISSUE_PAGE_SIZES.has(pageSize)) throw new Error("INVALID_PAGE_SIZE");
  const sort = input.sort === undefined ? {} : plainRecord(input.sort);
  assertOnlyKeys(sort, ["field", "direction"], "SORT");
  const sortField = String(sort.field ?? "jiraUpdatedAt") as IssueColumn;
  const sortDirection = String(sort.direction ?? "desc").toLowerCase();
  if (!(sortField in ISSUE_COLUMN_SQL)) throw new Error("INVALID_SORT_FIELD");
  if (sortDirection !== "asc" && sortDirection !== "desc") throw new Error("INVALID_SORT_DIRECTION");
  const filters = input.filters === undefined ? {} : plainRecord(input.filters);
  assertOnlyKeys(filters, Object.keys(ISSUE_COLUMN_SQL), "FILTER");
  const dateMode = ["activity", "created", "updated"].includes(String(input.dateMode)) ? String(input.dateMode) as "activity" | "created" | "updated" : "activity";
  const dateRange = normalizeDateRange(input.dateRange);
  const revision = Number.isSafeInteger(Number(input.revision)) ? Number(input.revision) : 0;
  return { page, pageSize, sortField, sortDirection, filters, dateMode, dateRange, revision };
}

function appendDateBounds(where: string[], parameters: Array<string | number>, expression: string, range: unknown) {
  const bounds = dateRangeBounds(range);
  if (bounds.startInclusive) {
    where.push("datetime(" + expression + ") >= datetime(?)");
    parameters.push(bounds.startInclusive);
  }
  if (bounds.endExclusive) {
    where.push("datetime(" + expression + ") < datetime(?)");
    parameters.push(bounds.endExclusive);
  }
}

function issueDateScope(query: ReturnType<typeof normalizeIssueQuery>) {
  const where: string[] = [];
  const parameters: Array<string | number> = [];
  const bounds = dateRangeBounds(query.dateRange);
  if (!bounds.startInclusive && !bounds.endExclusive) return { where, parameters };
  if (query.dateMode === "activity") {
    const eventWhere: string[] = [];
    appendDateBounds(eventWhere, parameters, "range_event.event_time", query.dateRange);
    where.push("EXISTS (SELECT 1 FROM activity_events range_event WHERE range_event.source_object_id=o.id AND " + eventWhere.join(" AND ") + ")");
  } else {
    appendDateBounds(where, parameters, query.dateMode === "created" ? ISSUE_COLUMN_SQL.createdAt : ISSUE_COLUMN_SQL.jiraUpdatedAt, query.dateRange);
  }
  return { where, parameters };
}
function issueFilterSql(filters: Row) {
  const where: string[] = [];
  const parameters: Array<string | number> = [];
  const textColumns = new Set<IssueColumn>(["issueKey", "summary"]);
  const multiColumns = new Set<IssueColumn>(["projectKey", "issueType", "status", "priority", "assignee", "reporter", "creator", "saveOutcome"]);
  const dateColumns = new Set<IssueColumn>(["createdAt", "jiraUpdatedAt", "snapshotTime"]);
  const numberColumns = new Set<IssueColumn>(["eventCount", "commentCount", "attachmentCount"]);
  for (const [fieldValue, rawFilter] of Object.entries(filters)) {
    const field = fieldValue as IssueColumn;
    const expression = ISSUE_COLUMN_SQL[field];
    const filter = plainRecord(rawFilter);
    if (textColumns.has(field)) {
      assertOnlyKeys(filter, ["value"], `FILTER_${field}`);
      const value = String(filter.value ?? "").trim();
      if (value) {
        where.push(`LOWER(COALESCE(${expression}, '')) LIKE LOWER(?) ESCAPE '\\'`);
        parameters.push(`%${value.replace(/[\\%_]/g, "\\$&")}%`);
      }
    } else if (multiColumns.has(field)) {
      assertOnlyKeys(filter, ["values"], `FILTER_${field}`);
      if (!Array.isArray(filter.values) || filter.values.some((item) => typeof item !== "string")) throw new Error(`FILTER_${field}_INVALID_VALUES`);
      const values = Array.from(new Set(filter.values.map((item) => String(item).trim()).filter(Boolean))).slice(0, 100);
      if (values.length) {
        const includesUnset = values.includes("__UNSET__");
        const actual = values.filter((item) => item !== "__UNSET__");
        const parts: string[] = [];
        if (actual.length) {
          parts.push(`${expression} IN (${actual.map(() => "?").join(",")})`);
          parameters.push(...actual);
        }
        if (includesUnset) parts.push(`COALESCE(TRIM(${expression}), '') = ''`);
        where.push(`(${parts.join(" OR ")})`);
      }
    } else if (dateColumns.has(field)) {
      assertOnlyKeys(filter, ["from", "to"], `FILTER_${field}`);
      const from = queryDate(filter.from, `${field}_FROM`);
      const to = queryDate(filter.to, `${field}_TO`);
      if (from && to && from > to) throw new Error(`FILTER_${field}_RANGE`);
      if (from) { where.push(`date(${expression}) >= date(?)`); parameters.push(from); }
      if (to) { where.push(`date(${expression}) <= date(?)`); parameters.push(to); }
    } else if (numberColumns.has(field)) {
      assertOnlyKeys(filter, ["min", "max"], `FILTER_${field}`);
      const min = queryNumber(filter.min, `${field}_MIN`);
      const max = queryNumber(filter.max, `${field}_MAX`);
      if (min !== null && max !== null && min > max) throw new Error(`FILTER_${field}_RANGE`);
      if (min !== null) { where.push(`${expression} >= ?`); parameters.push(min); }
      if (max !== null) { where.push(`${expression} <= ?`); parameters.push(max); }
    }
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", parameters };
}

const ISSUE_QUERY_FROM = `
  FROM source_objects o
  LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id
  LEFT JOIN issue_sync_states y ON y.source_object_id = o.id
  LEFT JOIN (
    SELECT source_object_id,
      COUNT(*) AS event_count,
      SUM(CASE WHEN event_type IN ('comment_created', 'comment_updated') THEN 1 ELSE 0 END) AS comment_count,
      SUM(CASE WHEN event_type = 'attachment_added' THEN 1 ELSE 0 END) AS attachment_count
    FROM activity_events GROUP BY source_object_id
  ) ec ON ec.source_object_id = o.id
`;

const CONFIRMED_ACTIVITY_STREAM_PROVENANCE = ["jira_activity_stream", "activity_stream", "jira:activity_stream"] as const;

export function isConfirmedActivityStreamProvenance(value: unknown) {
  return CONFIRMED_ACTIVITY_STREAM_PROVENANCE.includes(String(value ?? "").trim().toLowerCase() as typeof CONFIRMED_ACTIVITY_STREAM_PROVENANCE[number]);
}

type ViewerQueryInput = {
  page?: unknown;
  pageSize?: unknown;
  sort?: unknown;
  filters?: unknown;
  dateRange?: unknown;
  revision?: unknown;
};

function normalizeViewerQuery(input: ViewerQueryInput, sortColumns: Record<string, string>, defaultSort: string) {
  const page = Number(input.page ?? 1);
  const pageSize = Number(input.pageSize ?? 50);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("INVALID_PAGE");
  if (!ISSUE_PAGE_SIZES.has(pageSize)) throw new Error("INVALID_PAGE_SIZE");
  const filters = input.filters === undefined ? {} : plainRecord(input.filters);
  const unsupportedFilter = Object.keys(filters).find((field) => !(field in sortColumns));
  if (unsupportedFilter) throw new Error(`FILTER_UNSUPPORTED_FIELD:${unsupportedFilter}`);
  const sort = input.sort === null || input.sort === undefined ? { field: defaultSort, direction: "desc" } : plainRecord(input.sort);
  assertOnlyKeys(sort, ["field", "direction"], "SORT");
  const field = String(sort.field ?? defaultSort);
  const direction = String(sort.direction ?? "desc").toLowerCase();
  if (!(field in sortColumns)) throw new Error("INVALID_SORT_FIELD");
  if (direction !== "asc" && direction !== "desc") throw new Error("INVALID_SORT_DIRECTION");
  const dateRange = normalizeDateRange(input.dateRange);
  const revision = Number.isSafeInteger(Number(input.revision)) ? Number(input.revision) : 0;
  return { page, pageSize, filters, sortField: field, sortDirection: direction, dateRange, revision };
}

function viewerFilterSql(filters: Row, columns: Record<string, { expression: string; kind: "text" | "multi" | "date" | "number" }>) {
  const where: string[] = [];
  const parameters: Array<string | number> = [];
  for (const [field, raw] of Object.entries(filters)) {
    const column = columns[field];
    if (!column) throw new Error(`FILTER_UNSUPPORTED_FIELD:${field}`);
    const filter = plainRecord(raw);
    assertOnlyKeys(filter, ["text", "values", "from", "to", "min", "max"], `FILTER_${field}`);
    if (column.kind === "text") {
      const text = String(filter.text ?? "").trim();
      if (text) {
        where.push(`LOWER(COALESCE(${column.expression}, '')) LIKE LOWER(?) ESCAPE '\\'`);
        parameters.push(`%${text.replace(/[\\%_]/g, "\\$&")}%`);
      }
    } else if (column.kind === "multi") {
      if (filter.values !== undefined && (!Array.isArray(filter.values) || filter.values.some((item) => typeof item !== "string"))) throw new Error(`FILTER_${field}_INVALID_VALUES`);
      const values = Array.from(new Set((filter.values as string[] | undefined ?? []).map((item) => item.trim()).filter(Boolean))).slice(0, 200);
      if (values.length) {
        const unset = values.includes("__UNSET__");
        const actual = values.filter((value) => value !== "__UNSET__");
        const clauses: string[] = [];
        if (actual.length) {
          clauses.push(`${column.expression} IN (${actual.map(() => "?").join(",")})`);
          parameters.push(...actual);
        }
        if (unset) clauses.push(`COALESCE(TRIM(${column.expression}), '') = ''`);
        where.push(`(${clauses.join(" OR ")})`);
      }
    } else if (column.kind === "date") {
      const from = queryDate(filter.from, `${field}_FROM`);
      const to = queryDate(filter.to, `${field}_TO`);
      if (from && to && from > to) throw new Error(`FILTER_${field}_RANGE`);
      if (from) { where.push(`datetime(${column.expression}) >= datetime(?)`); parameters.push(`${from}T00:00:00`); }
      if (to) { where.push(`datetime(${column.expression}) <= datetime(?)`); parameters.push(`${to}T23:59:59.999`); }
    } else {
      const min = queryNumber(filter.min, `${field}_MIN`);
      const max = queryNumber(filter.max, `${field}_MAX`);
      if (min !== null && max !== null && min > max) throw new Error(`FILTER_${field}_RANGE`);
      if (min !== null) { where.push(`${column.expression} >= ?`); parameters.push(min); }
      if (max !== null) { where.push(`${column.expression} <= ?`); parameters.push(max); }
    }
  }
  return { where, parameters };
}

const USER_RELATED_COLUMNS = {
  issueKey: { expression: "o.issue_key", kind: "text" },
  summary: { expression: "s.summary", kind: "text" },
  projectKey: { expression: "o.project_key", kind: "multi" },
  issueType: { expression: "s.issue_type", kind: "multi" },
  status: { expression: "s.status", kind: "multi" },
  priority: { expression: "s.priority", kind: "multi" },
  userActivityCount: { expression: "COUNT(*)", kind: "number" },
  commentCount: { expression: "SUM(CASE WHEN e.event_type IN ('comment_created','comment_updated') THEN 1 ELSE 0 END)", kind: "number" },
  fieldChangeCount: { expression: "SUM(CASE WHEN e.event_type IN ('field_changed','status_changed','assignee_changed') THEN 1 ELSE 0 END)", kind: "number" },
  firstActivity: { expression: "MIN(e.event_time)", kind: "date" },
  lastActivity: { expression: "MAX(e.event_time)", kind: "date" }
} as const;

export function queryDatabaseUserRelatedIssues(databasePath: string, userIdInput: string, input: ViewerQueryInput = {}) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
  const sortColumns = Object.fromEntries(Object.entries(USER_RELATED_COLUMNS).map(([key, value]) => [key, value.expression]));
  const query = normalizeViewerQuery(input, sortColumns, "lastActivity");
  const filters = viewerFilterSql(query.filters, USER_RELATED_COLUMNS);
  const dateWhere: string[] = [];
  const dateParameters: Array<string | number> = [];
  appendDateBounds(dateWhere, dateParameters, "e.event_time", query.dateRange);
  const baseParameters: Array<string | number> = [userId, ...dateParameters];
  const having = filters.where;
  const from = [
    "FROM activity_events e",
    "JOIN source_objects o ON o.id = e.source_object_id",
    "LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id",
    "WHERE e.actor_account_id = ?" + (dateWhere.length ? " AND " + dateWhere.join(" AND ") : ""),
    "GROUP BY o.id, o.issue_key, o.project_key, s.summary, s.issue_type, s.status, s.priority",
    having.length ? "HAVING " + having.join(" AND ") : ""
  ].join(" ");
  const parameters = [...baseParameters, ...filters.parameters];
  const periodWhere = "actor_account_id = ?" + (dateWhere.length ? " AND " + dateWhere.join(" AND ") : "");
  const { db } = openReadOnly(databasePath);
  try {
    const totalCount = Number(row(db.prepare("SELECT COUNT(DISTINCT source_object_id) AS count FROM activity_events e WHERE " + periodWhere).get(...baseParameters)).count ?? 0);
    const filteredCount = Number(row(db.prepare("SELECT COUNT(*) AS count FROM (SELECT o.id " + from + ")").get(...parameters)).count ?? 0);
    const pageCount = Math.max(1, Math.ceil(filteredCount / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const rowsResult = rows(db.prepare([
      "SELECT o.issue_key AS issueKey, s.summary, o.project_key AS projectKey, s.issue_type AS issueType,",
      "s.status, s.priority, COUNT(*) AS userActivityCount,",
      "SUM(CASE WHEN e.event_type IN ('comment_created','comment_updated') THEN 1 ELSE 0 END) AS commentCount,",
      "SUM(CASE WHEN e.event_type IN ('field_changed','status_changed','assignee_changed') THEN 1 ELSE 0 END) AS fieldChangeCount,",
      "MIN(e.event_time) AS firstActivity, MAX(e.event_time) AS lastActivity",
      from,
      "ORDER BY " + sortColumns[query.sortField] + " " + query.sortDirection.toUpperCase() + ", o.issue_key ASC",
      "LIMIT ? OFFSET ?"
    ].join(" ")).all(...parameters, query.pageSize, (page - 1) * query.pageSize));
    return { rows: rowsResult, filteredCount, totalCount, page, pageSize: query.pageSize, pageCount, revision: query.revision };
  } finally {
    db.close();
  }
}

export function queryDatabaseUserDistributions(databasePath: string, userIdInput: string, input: ViewerQueryInput = {}) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
  const sortColumns = Object.fromEntries(Object.entries(USER_RELATED_COLUMNS).map(([key, value]) => [key, value.expression]));
  const query = normalizeViewerQuery(input, sortColumns, "lastActivity");
  const filters = viewerFilterSql(query.filters, USER_RELATED_COLUMNS);
  const dateWhere: string[] = [];
  const dateParameters: Array<string | number> = [];
  appendDateBounds(dateWhere, dateParameters, "e.event_time", query.dateRange);
  const issueScope = [
    "SELECT o.id FROM activity_events e",
    "JOIN source_objects o ON o.id=e.source_object_id",
    "LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id",
    "WHERE e.actor_account_id = ?" + (dateWhere.length ? " AND " + dateWhere.join(" AND ") : ""),
    "GROUP BY o.id, o.issue_key, o.project_key, s.summary, s.issue_type, s.status, s.priority",
    filters.where.length ? "HAVING " + filters.where.join(" AND ") : ""
  ].join(" ");
  const parameters: Array<string | number> = [userId, ...dateParameters, ...filters.parameters];
  const dimensions = {
    projectKey: "o.project_key",
    issueType: "s.issue_type",
    status: "s.status",
    priority: "s.priority"
  } as const;
  const { db } = openReadOnly(databasePath);
  try {
    const totalRelatedIssues = Number(row(db.prepare("SELECT COUNT(*) AS count FROM (" + issueScope + ")").get(...parameters)).count ?? 0);
    const result: Record<string, Array<{ value: string; count: number }>> = {};
    for (const [key, expression] of Object.entries(dimensions)) {
      const sql = [
        "SELECT COALESCE(NULLIF(TRIM(" + expression + "), ''), 'Unknown') AS value, COUNT(*) AS count",
        "FROM source_objects o LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id",
        "WHERE o.id IN (" + issueScope + ")",
        "GROUP BY COALESCE(NULLIF(TRIM(" + expression + "), ''), 'Unknown')",
        "ORDER BY count DESC, value ASC"
      ].join(" ");
      result[key] = rows(db.prepare(sql).all(...parameters)) as Array<{ value: string; count: number }>;
    }
    return {
      totalRelatedIssues,
      projectKey: result.projectKey ?? [],
      issueType: result.issueType ?? [],
      status: result.status ?? [],
      priority: result.priority ?? [],
      revision: query.revision
    };
  } finally {
    db.close();
  }
}
type StoredPayloadRow = {
  sourceObjectId: string;
  payloadGzip: Uint8Array | Buffer;
  compressedBytes: number;
  uncompressedBytes: number;
  archiveSha256: string;
  payloadFormatVersion: number;
};

function decodeStoredPayload(payload: StoredPayloadRow): unknown | null {
  const buffer = Buffer.isBuffer(payload.payloadGzip) ? payload.payloadGzip : Buffer.from(payload.payloadGzip);
  if (payload.payloadFormatVersion !== 1
    || payload.compressedBytes !== buffer.byteLength
    || payload.compressedBytes < 0 || payload.uncompressedBytes < 0
    || payload.compressedBytes > MAX_VIEWER_PAYLOAD_BYTES || payload.uncompressedBytes > MAX_VIEWER_PAYLOAD_BYTES) return null;
  try {
    const decoded = gunzipSync(buffer, { maxOutputLength: MAX_VIEWER_PAYLOAD_BYTES });
    if (decoded.byteLength !== payload.uncompressedBytes
      || crypto.createHash("sha256").update(decoded).digest("hex") !== payload.archiveSha256) return null;
    return JSON.parse(decoded.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function commentIndexFromPayload(value: unknown) {
  const raw = record(value);
  const issue = record(raw.issue);
  const fields = record(issue.fields);
  const comments = list(raw.comments ?? record(fields.comment).comments);
  const worklogs = list(raw.worklogs ?? fields.worklog);
  return new Map(normalizeCommentRecords(comments).map((comment) => [String(comment.id), comment]));
}

function parseDescriptionStoredValue(value: unknown) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function descriptionInputFromEventRow(event: Row): DescriptionDiffInput {
  const sourceRecordId = String(event.sourceRecordId ?? "");
  const itemMatch = /^(.*):(\d+)$/.exec(sourceRecordId);
  const beforeAvailable = event.before !== null && event.before !== undefined;
  const afterAvailable = event.after !== null && event.after !== undefined;
  return {
    eventId: String(event.eventId ?? ""), issueKey: String(event.issueKey ?? ""),
    fieldId: event.fieldId == null ? null : String(event.fieldId), fieldName: event.fieldName == null ? null : String(event.fieldName),
    sourceType: String(event.sourceProvenance ?? ""), sourceId: sourceRecordId || null,
    changelogHistoryId: String(event.jiraNativeSourceId ?? itemMatch?.[1] ?? "") || null,
    changelogItemIndex: itemMatch ? Number(itemMatch[2]) : null, candidateCount: 1,
    before: { available: beforeAvailable, complete: beforeAvailable, value: parseDescriptionStoredValue(event.before) },
    after: { available: afterAvailable, complete: afterAvailable, value: parseDescriptionStoredValue(event.after) }
  };
}

function isDescriptionEventRow(event: Row) {
  const fieldId = String(event.fieldId ?? "").trim().toLowerCase();
  const fieldName = String(event.fieldName ?? "").trim().toLowerCase();
  return fieldId === "description" || (!fieldId && fieldName === "description");
}

function attachDescriptionDiffRows(eventRows: Row[]) {
  return eventRows.map((event) => {
    if (!isDescriptionEventRow(event)) return event;
    const compact: Row = { ...event, descriptionDiff: buildDescriptionDiff(descriptionInputFromEventRow(event)), commentId: null };
    delete compact.commentBody; delete compact.commentBodyFormat; delete compact.commentCreated; delete compact.commentUpdated;
    delete compact.before; delete compact.after;
    return compact;
  });
}
function enrichCommentEventRows(db: DatabaseSync, eventRows: Row[]) {
  const relevant = eventRows.filter((event) => ["comment_created", "comment_updated"].includes(String(event.eventType)));
  const sourceObjectIds = Array.from(new Set(relevant.map((event) => String(event.sourceObjectId ?? "")).filter(Boolean)));
  if (!sourceObjectIds.length) return eventRows;
  const placeholders = sourceObjectIds.map(() => "?").join(",");
  const payloads = rows(db.prepare(`
    SELECT source_object_id AS sourceObjectId, payload_gzip AS payloadGzip,
      compressed_bytes AS compressedBytes, uncompressed_bytes AS uncompressedBytes,
      archive_sha256 AS archiveSha256, payload_format_version AS payloadFormatVersion
    FROM current_full_fetch_payloads WHERE source_object_id IN (${placeholders})
  `).all(...sourceObjectIds)) as unknown as StoredPayloadRow[];
  const indexes = new Map<string, Map<string, Row>>();
  for (const payload of payloads) {
    const decoded = decodeStoredPayload(payload);
    if (decoded) indexes.set(String(payload.sourceObjectId), commentIndexFromPayload(decoded));
  }
  return eventRows.map((event) => {
    if (!["comment_created", "comment_updated"].includes(String(event.eventType))) return event;
    const comment = indexes.get(String(event.sourceObjectId))?.get(String(event.commentId));
    if (!comment) return { ...event, commentContentStatus: indexes.has(String(event.sourceObjectId)) ? "not_available_in_source_data" : "not_persisted_by_current_data_model" };
    return {
      ...event,
      commentId: comment.id,
      commentBody: comment.body,
      commentBodyFormat: comment.bodyFormat,
      commentCreated: comment.created,
      commentUpdated: comment.updated,
      commentContentStatus: comment.body ? "available" : "not_available_in_source_data"
    };
  });
}
const USER_EVENT_COLUMNS = {
  eventTime: { expression: "e.event_time", kind: "date" },
  issueKey: { expression: "o.issue_key", kind: "text" },
  actor: { expression: "e.actor_display_name", kind: "multi" },
  action: { expression: "e.event_type", kind: "multi" },
  field: { expression: "e.field_name", kind: "multi" },
  source: { expression: "e.source_provenance", kind: "multi" },
  eventType: { expression: "e.event_type", kind: "multi" },
  fieldName: { expression: "e.field_name", kind: "multi" },
  before: { expression: "e.from_value_json", kind: "text" },
  after: { expression: "e.to_value_json", kind: "text" },
  diff: { expression: "COALESCE(e.from_value_json, '') || ' ' || COALESCE(e.to_value_json, '')", kind: "text" },
  summary: { expression: "s.summary", kind: "text" },
  sourceProvenance: { expression: "e.source_provenance", kind: "multi" }
} as const;

export function queryDatabaseUserEvents(databasePath: string, userIdInput: string, input: ViewerQueryInput = {}) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
  return queryDatabaseEvents(databasePath, { userId, issueKey: "" }, input);
}

export function queryDatabaseIssueEvents(databasePath: string, issueKeyInput: string, input: ViewerQueryInput = {}) {
  const issueKey = normalizeSourceObjectKey("jira", "issue", issueKeyInput);
  return queryDatabaseEvents(databasePath, { userId: "", issueKey }, input);
}

type EventQueryResult = {
  rows: Row[];
  filteredCount: number;
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  diagnostics: {
    queryFingerprint: string;
    sqlExecutionMs: number;
    rowMappingAndPayloadNormalizationMs: number;
    totalMs: number;
    cacheHit: boolean;
    slow: boolean;
    queryPlan: Row[];
  };
};
const EVENT_QUERY_CACHE_TTL_MS = 2_000;
const EVENT_QUERY_CACHE_LIMIT = 32;
const eventQueryCache = new Map<string, { expiresAt: number; value: EventQueryResult }>();

function queryDatabaseEvents(databasePath: string, subject: { userId: string; issueKey: string }, input: ViewerQueryInput): EventQueryResult {
  const sourceStat = fs.statSync(databasePath);
  const queryFingerprint = crypto.createHash("sha256").update(JSON.stringify({ databasePath: path.resolve(databasePath), sourceSize: sourceStat.size, sourceMtimeMs: sourceStat.mtimeMs, subject, input }), "utf8").digest("hex");
  const cached = eventQueryCache.get(queryFingerprint);
  if (cached && cached.expiresAt >= Date.now()) {
    return { ...structuredClone(cached.value), diagnostics: { ...cached.value.diagnostics, cacheHit: true } };
  }
  const startedAt = performance.now();
  const sortColumns = Object.fromEntries(Object.entries(USER_EVENT_COLUMNS).map(([key, value]) => [key, value.expression]));
  const query = normalizeViewerQuery(input, sortColumns, "eventTime");
  const filter = viewerFilterSql(query.filters, USER_EVENT_COLUMNS);
  appendDateBounds(filter.where, filter.parameters, "e.event_time", query.dateRange);
  const subjectWhere = subject.userId ? "e.actor_account_id = ?" : "o.issue_key = ?";
  const subjectValue = subject.userId || subject.issueKey;
  const where = `${subjectWhere} ${filter.where.length ? `AND ${filter.where.join(" AND ")}` : ""}`;
  const parameters: Array<string | number> = [subjectValue, ...filter.parameters];
  const { db } = openReadOnly(databasePath);
  try {
    const sqlStartedAt = performance.now();
    const totalCount = Number(row(db.prepare(`
      SELECT COUNT(*) AS count FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id
      WHERE ${subjectWhere}
    `).get(subjectValue)).count ?? 0);
    const filteredCount = Number(row(db.prepare(`
      SELECT COUNT(*) AS count FROM activity_events e
      JOIN source_objects o ON o.id=e.source_object_id
      LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id WHERE ${where}
    `).get(...parameters)).count ?? 0);
    const pageCount = Math.max(1, Math.ceil(filteredCount / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const rowsSql = `
      SELECT e.id AS eventId, e.source_object_id AS sourceObjectId, e.event_time AS eventTime, e.actor_account_id AS userId,
        e.actor_display_name AS displayName, o.issue_key AS issueKey, e.event_type AS eventType,
        e.field_id AS fieldId, e.field_name AS fieldName, e.from_value_json AS before, e.to_value_json AS after, e.source_record_id AS sourceRecordId,
        e.jira_native_source_id AS jiraNativeSourceId,
        CASE WHEN e.event_type IN ('comment_created','comment_updated') THEN e.jira_native_source_id ELSE NULL END AS commentId,
        e.identity_key_type AS identityKeyType, s.summary, e.source_provenance AS sourceProvenance
      FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id
      LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id
      WHERE ${where}
      ORDER BY ${sortColumns[query.sortField]} ${query.sortDirection.toUpperCase()}, e.id ASC
      LIMIT ? OFFSET ?`;
    const rowsResult = rows(db.prepare(rowsSql).all(...parameters, query.pageSize, (page - 1) * query.pageSize));
    const sqlExecutionMs = performance.now() - sqlStartedAt;
    const mappingStartedAt = performance.now();
    const enrichedRows = attachDescriptionDiffRows(enrichCommentEventRows(db, rowsResult));
    const rowMappingMs = performance.now() - mappingStartedAt;
    const totalMs = performance.now() - startedAt;
    const slow = totalMs > 1_000;
    const queryPlan = totalMs > 3_000
      ? rows(db.prepare(`EXPLAIN QUERY PLAN ${rowsSql}`).all(...parameters, query.pageSize, (page - 1) * query.pageSize))
      : [];
    const value = {
      rows: enrichedRows,
      filteredCount,
      totalCount,
      page,
      pageSize: query.pageSize,
      pageCount,
      diagnostics: {
        queryFingerprint,
        sqlExecutionMs: Math.round(sqlExecutionMs * 100) / 100,
        rowMappingAndPayloadNormalizationMs: Math.round(rowMappingMs * 100) / 100,
        totalMs: Math.round(totalMs * 100) / 100,
        cacheHit: false,
        slow,
        queryPlan
      }
    };
    eventQueryCache.set(queryFingerprint, { expiresAt: Date.now() + EVENT_QUERY_CACHE_TTL_MS, value });
    while (eventQueryCache.size > EVENT_QUERY_CACHE_LIMIT) eventQueryCache.delete(eventQueryCache.keys().next().value as string);
    return value;
  } finally {
    db.close();
  }
}

export function queryDescriptionFullContext(databasePath: string, input: { eventId?: unknown; issueKey?: unknown; requestId?: unknown; revision?: unknown }) {
  const eventId = String(input.eventId ?? "").trim();
  const issueKey = normalizeSourceObjectKey("jira", "issue", String(input.issueKey ?? ""));
  const requestId = Number.isSafeInteger(Number(input.requestId)) ? Number(input.requestId) : 0;
  const revision = Number.isSafeInteger(Number(input.revision)) ? Number(input.revision) : 0;
  if (!eventId) throw new Error("DESCRIPTION_EVENT_ID_REQUIRED");
  const { db } = openReadOnly(databasePath);
  try {
    const event = row(db.prepare(`
      SELECT e.id AS eventId, o.issue_key AS issueKey, e.field_id AS fieldId, e.field_name AS fieldName,
        e.from_value_json AS before, e.to_value_json AS after, e.source_record_id AS sourceRecordId,
        e.jira_native_source_id AS jiraNativeSourceId, e.source_provenance AS sourceProvenance
      FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id
      WHERE e.id=? AND o.issue_key=?
    `).get(eventId, issueKey));
    if (!event.eventId) return { requestId, revision, eventId, issueKey, status: "source-mismatch", diffStatus: "source-mismatch", beforeText: null, afterText: null, beforeAvailable: false, afterAvailable: false, beforeComplete: false, afterComplete: false, diagnosticsCode: "DESCRIPTION_EVENT_IDENTITY_MISMATCH" };
    return { requestId, revision, ...resolveDescriptionFullContext(descriptionInputFromEventRow(event), eventId) };
  } finally { db.close(); }
}
export function listDatabaseIssues(databasePath: string, input: IssueQuery = {}) {
  const { db } = openReadOnly(databasePath);
  try {
    const query = normalizeIssueQuery(input);
    const filters = issueFilterSql(query.filters);
    const scope = issueDateScope(query);
    const where = [filters.clause ? filters.clause.slice(6) : "", ...scope.where].filter(Boolean);
    const clause = where.length ? "WHERE " + where.join(" AND ") : "";
    const parameters = [...filters.parameters, ...scope.parameters];
    const databaseTotal = Number(row(db.prepare("SELECT COUNT(*) AS count FROM source_objects").get()).count ?? 0);
    const filteredTotal = Number(row(db.prepare(`SELECT COUNT(*) AS count ${ISSUE_QUERY_FROM} ${clause}`).get(...parameters)).count ?? 0);
    const pageCount = Math.max(1, Math.ceil(filteredTotal / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const offset = (page - 1) * query.pageSize;
    const orderExpression = ISSUE_COLUMN_SQL[query.sortField];
    const items = rows(db.prepare(`
      SELECT o.issue_key AS issueKey, o.project_key AS projectKey, s.summary, s.issue_type AS issueType,
             s.status, s.priority, s.assignee, s.reporter, s.creator,
             json_extract(s.snapshot_json, '$.fields.created') AS createdAt,
             s.jira_updated_at AS jiraUpdatedAt, s.snapshot_updated_at AS snapshotTime,
             y.last_outcome AS saveOutcome, y.last_update_reason AS updateReason,
             y.last_successful_run_id AS runId,
             COALESCE(ec.event_count, 0) AS eventCount,
             COALESCE(ec.comment_count, 0) AS commentCount,
             COALESCE(ec.attachment_count, 0) AS attachmentCount
      ${ISSUE_QUERY_FROM}
      ${clause}
      ORDER BY ${orderExpression} ${query.sortDirection.toUpperCase()}, o.issue_key ASC
      LIMIT ? OFFSET ?
    `).all(...parameters, query.pageSize, offset));
    return {
      databaseTotal,
      filteredTotal,
      page,
      pageSize: query.pageSize,
      pageCount,
      items,
      // Retained for v0.2.43 callers; new UI uses the explicit filteredTotal field.
      total: filteredTotal,
      limit: query.pageSize,
      offset
    };
  } finally {
    db.close();
  }
}

export function loadDatabaseIssueDistributions(databasePath: string, input: IssueQuery = {}) {
  const { db } = openReadOnly(databasePath);
  try {
    const query = normalizeIssueQuery(input);
    const filters = issueFilterSql(query.filters);
    const scope = issueDateScope(query);
    const where = [filters.clause ? filters.clause.slice(6) : "", ...scope.where].filter(Boolean);
    const clause = where.length ? "WHERE " + where.join(" AND ") : "";
    const parameters = [...filters.parameters, ...scope.parameters];
    const distribution = (expression: string) => {
      const sql = [
        "SELECT COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定') AS value, COUNT(*) AS count",
        ISSUE_QUERY_FROM,
        clause,
        "GROUP BY COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定')",
        "ORDER BY count DESC, value ASC"
      ].join(" ");
      return rows(db.prepare(sql).all(...parameters)).map((item) => ({ value: String(item.value), count: Number(item.count) }));
    };
    return {
      total: Number(row(db.prepare("SELECT COUNT(*) AS count " + ISSUE_QUERY_FROM + " " + clause).get(...parameters)).count ?? 0),
      projectKey: distribution("o.project_key"),
      issueType: distribution("s.issue_type"),
      status: distribution("s.status"),
      priority: distribution("s.priority"),
      revision: query.revision
    };
  } finally {
    db.close();
  }
}
export function loadDatabaseIssue(databasePath: string, issueKeyInput: string) {
  const issueKey = normalizeSourceObjectKey("jira", "issue", issueKeyInput);
  const { db } = openReadOnly(databasePath);
  try {
    const issue = row(db.prepare(`
      SELECT o.id AS sourceObjectId, o.issue_key AS issueKey, o.project_key AS projectKey,
             o.first_saved_at AS firstSavedAt, s.*, y.coverage_profile_json AS coverageProfileJson,
             y.last_outcome AS saveOutcome, y.last_update_reason AS updateReason,
             y.last_successful_run_id AS runId, y.last_checked_at AS lastCheckedAt,
             p.payload_gzip AS payloadGzip, p.payload_saved_at AS payloadSavedAt,
             p.archive_sha256 AS archiveSha256, p.uncompressed_bytes AS uncompressedBytes,
             p.compressed_bytes AS compressedBytes, p.payload_format_version AS payloadFormatVersion
      FROM source_objects o
      LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id
      LEFT JOIN issue_sync_states y ON y.source_object_id = o.id
      LEFT JOIN current_full_fetch_payloads p ON p.source_object_id = o.id
      WHERE o.issue_key = ?
    `).get(issueKey));
    if (!issue.sourceObjectId) return issueViewerFailure(issueKey, "not_found", "Issue not found in local database.");
    issue.labels = parseJson(issue.labels_json, []);
    issue.components = parseJson(issue.components_json, []);
    issue.versions = parseJson(issue.versions_json, []);
    issue.snapshot = parseJson(issue.snapshot_json, {});
    issue.coverage = parseJson(issue.coverageProfileJson, {});
    const overview = { ...issue };
    delete overview.payloadGzip;
    const payloadBuffer = Buffer.isBuffer(issue.payloadGzip)
      ? issue.payloadGzip
      : issue.payloadGzip instanceof Uint8Array
        ? Buffer.from(issue.payloadGzip)
        : null;
    const events = attachDescriptionDiffRows(rows(db.prepare(`
      SELECT id AS eventId, event_type AS eventType, event_time AS eventTime, actor_account_id AS actorAccountId,
             actor_display_name AS actorDisplayName, field_id AS fieldId, field_name AS fieldName,
             from_value_json AS before, to_value_json AS after, source_record_id AS sourceRecordId,
             jira_native_source_id AS jiraNativeSourceId, identity_key_type AS identityKeyType, source_provenance AS sourceProvenance
      FROM activity_events WHERE source_object_id = ? ORDER BY event_time DESC, id DESC LIMIT 500
    `).all(String(issue.sourceObjectId))).map((event) => ({ ...event, issueKey })));
    if (!payloadBuffer) return issueViewerFailure(issueKey, "payload_unavailable", "Full Fetch payload is unavailable.", overview);
    const compressedBytes = Number(issue.compressedBytes);
    const uncompressedBytes = Number(issue.uncompressedBytes);
    const payloadFormatVersion = Number(issue.payloadFormatVersion);
    if (payloadFormatVersion !== 1) return issueViewerFailure(issueKey, "payload_unsupported", `Unsupported payload format version: ${payloadFormatVersion}.`, overview);
    if (!Number.isSafeInteger(compressedBytes) || !Number.isSafeInteger(uncompressedBytes)
      || compressedBytes < 0 || uncompressedBytes < 0
      || compressedBytes > MAX_VIEWER_PAYLOAD_BYTES || uncompressedBytes > MAX_VIEWER_PAYLOAD_BYTES
      || payloadBuffer.byteLength !== compressedBytes) {
      return issueViewerFailure(issueKey, "payload_decode_failed", "Payload size validation failed.", overview);
    }
    let decoded: Buffer;
    try {
      decoded = gunzipSync(payloadBuffer, { maxOutputLength: MAX_VIEWER_PAYLOAD_BYTES });
    } catch {
      return issueViewerFailure(issueKey, "payload_decode_failed", "Payload decode failed.", overview);
    }
    if (decoded.byteLength !== uncompressedBytes
      || crypto.createHash("sha256").update(decoded).digest("hex") !== String(issue.archiveSha256 ?? "")) {
      return issueViewerFailure(issueKey, "payload_decode_failed", "Payload integrity validation failed.", overview);
    }
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(decoded.toString("utf8")) as unknown;
    } catch {
      return issueViewerFailure(issueKey, "payload_invalid", "Payload JSON is malformed.", overview);
    }
    const normalized = normalizeIssueViewerPayload(rawPayload, issueKey, {
      payloadFormatVersion,
      payloadSavedAt: String(issue.payloadSavedAt ?? ""),
      coverageProfile: issue.coverage
    }, events);
    return { found: true, status: "ready", issueKey, message: "", overview, ...normalized } satisfies IssueViewerDto;
  } finally {
    db.close();
  }
}

export function listDatabaseUsers(databasePath: string, input: { search?: string; limit?: number; offset?: number } = {}) {
  const { db } = openReadOnly(databasePath);
  try {
    const limit = boundedLimit(input.limit);
    const offset = boundedOffset(input.offset);
    const search = String(input.search ?? "").trim();
    const where = search ? "WHERE actor_account_id LIKE ? OR actor_display_name LIKE ?" : "";
    const parameters = search ? [`%${search}%`, `%${search}%`] : [];
    const stableActor = "actor_account_id IS NOT NULL AND actor_account_id <> ''";
    const total = Number(row(db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT actor_account_id FROM activity_events
        WHERE ${stableActor} ${search ? `AND (${where.slice(6)})` : ""}
        GROUP BY actor_account_id
      )
    `).get(...parameters)).count ?? 0);
    const items = rows(db.prepare(`
      SELECT actor_account_id AS userId, MAX(COALESCE(actor_display_name, '')) AS displayName,
             MIN(event_time) AS earliestEvent, MAX(event_time) AS latestEvent,
             COUNT(*) AS totalEvents,
             COUNT(DISTINCT source_object_id) AS totalIssues,
             SUM(CASE WHEN LOWER(source_provenance) IN ('jira_activity_stream','activity_stream','jira:activity_stream') THEN 1 ELSE 0 END) AS activityStreamCount,
             SUM(CASE WHEN event_type IN ('comment_created', 'comment_updated') THEN 1 ELSE 0 END) AS comments,
             SUM(CASE WHEN event_type IN ('field_changed', 'status_changed', 'assignee_changed') THEN 1 ELSE 0 END) AS fieldChanges,
             SUM(CASE WHEN event_type = 'attachment_added' THEN 1 ELSE 0 END) AS attachments
      FROM activity_events
      WHERE ${stableActor} ${search ? `AND (${where.slice(6)})` : ""}
      GROUP BY actor_account_id
      ORDER BY latestEvent DESC, actor_account_id
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset));
    return { total, limit, offset, items };
  } finally {
    db.close();
  }
}

export function queryDatabaseDistinctValues(
  databasePath: string,
  input: { source?: unknown; subjectId?: unknown; field?: unknown; search?: unknown; limit?: unknown; query?: unknown }
) {
  const source = String(input.source ?? "");
  const subjectId = String(input.subjectId ?? "").trim();
  const field = String(input.field ?? "");
  const search = String(input.search ?? "").trim();
  const limit = Math.max(1, Math.min(500, Number(input.limit ?? 100)));
  const searchClause = (expression: string, where: string[], parameters: Array<string | number>) => {
    if (!search) return;
    where.push("LOWER(COALESCE(" + expression + ", '')) LIKE LOWER(?) ESCAPE '\\'");
    parameters.push("%" + search.replace(/[\\%_]/g, "\\$&") + "%");
  };
  let sql = "";
  let parameters: Array<string | number> = [];
  let expression = "";
  if (source === "databaseIssues") {
    const query = normalizeIssueQuery(input.query as IssueQuery);
    const scopedFilters = { ...query.filters };
    delete scopedFilters[field];
    const filters = issueFilterSql(scopedFilters);
    const scope = issueDateScope(query);
    const where = [filters.clause ? filters.clause.slice(6) : "", ...scope.where].filter(Boolean);
    parameters = [...filters.parameters, ...scope.parameters];
    expression = ({ projectKey: "o.project_key", issueType: "s.issue_type", status: "s.status", priority: "s.priority", issueKey: "o.issue_key" } as Record<string, string>)[field] ?? "";
    if (!expression) throw new Error("INVALID_DISTINCT_FIELD");
    searchClause(expression, where, parameters);
    sql = "SELECT COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定') AS value, COUNT(*) AS count " + ISSUE_QUERY_FROM
      + (where.length ? " WHERE " + where.join(" AND ") : "")
      + " GROUP BY COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定') ORDER BY count DESC, value ASC LIMIT ?";
  } else if (source === "userRelatedIssues") {
    if (!subjectId) throw new Error("DISTINCT_SUBJECT_REQUIRED");
    expression = ({ projectKey: "o.project_key", issueType: "s.issue_type", status: "s.status", priority: "s.priority", issueKey: "o.issue_key" } as Record<string, string>)[field] ?? "";
    if (!expression) throw new Error("INVALID_DISTINCT_FIELD");
    const sortColumns = Object.fromEntries(Object.entries(USER_RELATED_COLUMNS).map(([key, value]) => [key, value.expression]));
    const query = normalizeViewerQuery(input.query as ViewerQueryInput ?? {}, sortColumns, "lastActivity");
    const scopedFilters = { ...query.filters };
    delete scopedFilters[field];
    const filters = viewerFilterSql(scopedFilters, USER_RELATED_COLUMNS);
    const dateWhere: string[] = [];
    const dateParameters: Array<string | number> = [];
    appendDateBounds(dateWhere, dateParameters, "e.event_time", query.dateRange);
    const candidateSearch: string[] = [];
    const searchParameters: Array<string | number> = [];
    searchClause(expression, candidateSearch, searchParameters);
    parameters = [subjectId, ...dateParameters, ...filters.parameters, ...searchParameters];
    const scoped = [
      "SELECT COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定') AS value",
      "FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id",
      "LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id",
      "WHERE e.actor_account_id = ?" + (dateWhere.length ? " AND " + dateWhere.join(" AND ") : "") + (candidateSearch.length ? " AND " + candidateSearch.join(" AND ") : ""),
      "GROUP BY o.id, o.issue_key, o.project_key, s.summary, s.issue_type, s.status, s.priority",
      filters.where.length ? "HAVING " + filters.where.join(" AND ") : ""
    ].join(" ");
    sql = "SELECT value, COUNT(*) AS count FROM (" + scoped + ") GROUP BY value ORDER BY count DESC, value ASC LIMIT ?";
  } else if (source === "userEvents" || source === "issueEvents") {
    if (!subjectId) throw new Error("DISTINCT_SUBJECT_REQUIRED");
    expression = (source === "userEvents"
      ? { actor: "e.actor_display_name", action: "e.event_type", field: "e.field_name", source: "e.source_provenance", eventType: "e.event_type", fieldName: "e.field_name", sourceProvenance: "e.source_provenance", issueKey: "o.issue_key" }
      : { actor: "e.actor_display_name", action: "e.event_type", field: "e.field_name", source: "e.source_provenance", eventType: "e.event_type", fieldName: "e.field_name", sourceProvenance: "e.source_provenance", userId: "e.actor_account_id", displayName: "e.actor_display_name" } as Record<string, string>)[field] ?? "";
    if (!expression) throw new Error("INVALID_DISTINCT_FIELD");
    const query = normalizeViewerQuery(input.query as ViewerQueryInput ?? {}, Object.fromEntries(Object.entries(USER_EVENT_COLUMNS).map(([key, value]) => [key, value.expression])), "eventTime");
    const scopedFilters = { ...query.filters };
    delete scopedFilters[field];
    const filters = viewerFilterSql(scopedFilters, USER_EVENT_COLUMNS);
    appendDateBounds(filters.where, filters.parameters, "e.event_time", query.dateRange);
    const where = [source === "userEvents" ? "e.actor_account_id = ?" : "o.issue_key = ?", ...filters.where];
    parameters = [subjectId, ...filters.parameters];
    searchClause(expression, where, parameters);
    sql = "SELECT COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定') AS value, COUNT(*) AS count "
      + "FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id "
      + "WHERE " + where.join(" AND ") + " GROUP BY COALESCE(NULLIF(TRIM(" + expression + "), ''), '未設定') ORDER BY count DESC, value ASC LIMIT ?";
  } else {
    throw new Error("INVALID_DISTINCT_SOURCE");
  }
  const { db } = openReadOnly(databasePath);
  try {
    const values = rows(db.prepare(sql).all(...parameters, limit + 1));
    return {
      field,
      values: values.slice(0, limit).map((item) => ({ value: String(item.value), count: Number(item.count) })),
      truncated: values.length > limit
    };
  } finally {
    db.close();
  }
}
export function loadDatabaseUser(databasePath: string, userIdInput: string, input: { limit?: number; offset?: number } = {}) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
  const { db } = openReadOnly(databasePath);
  try {
    const limit = boundedLimit(input.limit);
    const offset = boundedOffset(input.offset);
    const summary = row(db.prepare(`
      SELECT actor_account_id AS userId, MAX(COALESCE(actor_display_name, '')) AS displayName,
             MIN(event_time) AS earliestEvent, MAX(event_time) AS latestEvent,
             COUNT(*) AS totalEvents, COUNT(DISTINCT source_object_id) AS totalIssues,
             SUM(CASE WHEN LOWER(source_provenance) IN ('jira_activity_stream','activity_stream','jira:activity_stream') THEN 1 ELSE 0 END) AS activityStreamCount,
             SUM(CASE WHEN event_type IN ('comment_created', 'comment_updated') THEN 1 ELSE 0 END) AS comments,
             SUM(CASE WHEN event_type IN ('field_changed', 'status_changed', 'assignee_changed') THEN 1 ELSE 0 END) AS fieldChanges,
             SUM(CASE WHEN event_type = 'attachment_added' THEN 1 ELSE 0 END) AS attachments
      FROM activity_events WHERE actor_account_id = ? GROUP BY actor_account_id
    `).get(userId));
    if (!summary.userId) return { found: false, userId };
    const eventTypes = rows(db.prepare(`
      SELECT event_type AS eventType, COUNT(*) AS count
      FROM activity_events WHERE actor_account_id = ? GROUP BY event_type ORDER BY count DESC
    `).all(userId));
    const projects = rows(db.prepare(`
      SELECT o.project_key AS projectKey, COUNT(*) AS count
      FROM activity_events e JOIN source_objects o ON o.id = e.source_object_id
      WHERE e.actor_account_id = ? GROUP BY o.project_key ORDER BY count DESC
    `).all(userId));
    const events = rows(db.prepare(`
      SELECT e.event_time AS eventTime, e.event_type AS eventType, o.issue_key AS issueKey,
             o.project_key AS projectKey, e.actor_display_name AS displayName,
             e.field_name AS fieldName, e.from_value_json AS fromValueJson,
             e.to_value_json AS toValueJson, e.source_provenance AS sourceProvenance
      FROM activity_events e JOIN source_objects o ON o.id = e.source_object_id
      WHERE e.actor_account_id = ? ORDER BY e.event_time DESC, e.id DESC LIMIT ? OFFSET ?
    `).all(userId, limit, offset));
    return { found: true, userId, summary, eventTypes, projects, events, limit, offset };
  } finally {
    db.close();
  }
}
