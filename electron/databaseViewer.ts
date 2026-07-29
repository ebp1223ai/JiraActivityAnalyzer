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

export function normalizeIssueViewerPayload(
  rawValue: unknown,
  metadata: { payloadFormatVersion: number; payloadSavedAt: string; coverageProfile?: unknown },
  activityEvents: Row[]
): Omit<IssueViewerDto, "found" | "status" | "issueKey" | "message" | "overview"> {
  const raw = record(rawValue);
  const issue = record(raw.issue);
  const fields = record(issue.fields);
  const renderedFields = record(issue.renderedFields);
  const renderedDescription = plainText(renderedFields.description);
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
      ? { status: "ready", source: "rendered", plainText: renderedDescription, message: "" }
      : fallbackDescription
        ? { status: "ready", source: "plain", plainText: fallbackDescription, message: "" }
        : { status: "no_records", source: "none", plainText: "", message: "No description / 無 Description" },
    changelog: section(changelog),
    comments: section(comments),
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
    description: { status: "unavailable", source: "none", plainText: "", message },
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

export function listDatabaseIssues(databasePath: string, input: { search?: string; project?: string; limit?: number; offset?: number } = {}) {
  const { db } = openReadOnly(databasePath);
  try {
    const limit = boundedLimit(input.limit);
    const offset = boundedOffset(input.offset);
    const search = String(input.search ?? "").trim();
    const project = String(input.project ?? "").trim().toUpperCase();
    const where: string[] = [];
    const parameters: Array<string | number> = [];
    if (search) {
      where.push("(o.issue_key LIKE ? OR s.summary LIKE ?)");
      parameters.push(`%${search.toUpperCase()}%`, `%${search}%`);
    }
    if (project) {
      where.push("o.project_key = ?");
      parameters.push(project);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(row(db.prepare(`
      SELECT COUNT(*) AS count
      FROM source_objects o
      LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id
      ${clause}
    `).get(...parameters)).count ?? 0);
    const items = rows(db.prepare(`
      SELECT o.issue_key AS issueKey, o.project_key AS projectKey, s.summary, s.issue_type AS issueType,
             s.status, s.jira_updated_at AS jiraUpdatedAt, s.snapshot_updated_at AS snapshotTime,
             y.last_outcome AS saveOutcome, y.last_update_reason AS updateReason,
             y.last_successful_run_id AS runId,
             (SELECT COUNT(*) FROM activity_events e WHERE e.source_object_id = o.id) AS eventCount
      FROM source_objects o
      LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id
      LEFT JOIN issue_sync_states y ON y.source_object_id = o.id
      ${clause}
      ORDER BY COALESCE(s.jira_updated_at, s.snapshot_updated_at, o.first_saved_at) DESC, o.issue_key
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset));
    return { total, limit, offset, items };
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
