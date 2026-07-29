import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { normalizeSourceObjectKey } from "./sourceArchiveDatabase.js";
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

function normalizeChangelogRecords(value: Row[]) {
  return value.flatMap((history, historyIndex) => {
    const historyId = String(history.id ?? `history-${historyIndex + 1}`);
    const created = String(history.created ?? history.time ?? "");
    const author = displayName(history.author);
    const items = Array.isArray(history.items) ? history.items.map(record) : [history];
    return items.map((item, itemIndex) => {
      const before = plainText(item.fromString ?? item.from ?? "");
      const after = plainText(item.toString ?? item.to ?? "");
      return {
        historyId,
        itemId: `${historyId}-${itemIndex + 1}`,
        created,
        author,
        field: String(item.field ?? item.fieldId ?? "Unknown field"),
        before,
        after,
        changeKind: before && after ? "changed" : after ? "added" : before ? "removed" : "recorded"
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
  metadata: { payloadFormatVersion: number; payloadSavedAt: string; coverageProfile?: unknown },
  activityEvents: Row[]
): Omit<IssueViewerDto, "found" | "status" | "issueKey" | "message" | "overview"> {
  const raw = record(rawValue);
  const issue = record(raw.issue);
  const fields = record(issue.fields);
  const renderedFields = record(issue.renderedFields);
  const renderedDescriptionValue = typeof renderedFields.description === "string" ? renderedFields.description : "";
  const renderedDescription = plainText(renderedDescriptionValue);
  const fallbackDescription = plainText(fields.description);
  const changelog = list(raw.changelog ?? record(issue.changelog).histories);
  const comments = list(raw.comments ?? record(fields.comment).comments);
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
    changelog: section(normalizeChangelogRecords(changelog)),
    comments: section(normalizeCommentRecords(comments)),
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
  return { page, pageSize, sortField, sortDirection, filters };
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

export function listDatabaseIssues(databasePath: string, input: IssueQuery = {}) {
  const { db } = openReadOnly(databasePath);
  try {
    const query = normalizeIssueQuery(input);
    const { clause, parameters } = issueFilterSql(query.filters);
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

export function loadDatabaseIssueDistributions(databasePath: string) {
  const { db } = openReadOnly(databasePath);
  try {
    const distribution = (expression: string) => rows(db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(${expression}), ''), '未設定') AS value, COUNT(*) AS count
      FROM source_objects o LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id
      GROUP BY COALESCE(NULLIF(TRIM(${expression}), ''), '未設定')
      ORDER BY count DESC, value ASC
    `).all()).map((item) => ({ value: String(item.value), count: Number(item.count) }));
    return {
      total: Number(row(db.prepare("SELECT COUNT(*) AS count FROM source_objects").get()).count ?? 0),
      issueType: distribution("s.issue_type"),
      status: distribution("s.status"),
      priority: distribution("s.priority")
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
    const events = rows(db.prepare(`
      SELECT event_type AS eventType, event_time AS eventTime, actor_account_id AS actorAccountId,
             actor_display_name AS actorDisplayName, field_id AS fieldId, field_name AS fieldName,
             from_value_json AS fromValueJson, to_value_json AS toValueJson, source_provenance AS sourceProvenance
      FROM activity_events WHERE source_object_id = ? ORDER BY event_time DESC, id DESC LIMIT 500
    `).all(String(issue.sourceObjectId)));
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
    const normalized = normalizeIssueViewerPayload(rawPayload, {
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
