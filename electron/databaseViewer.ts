import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { normalizeSourceObjectKey } from "./sourceArchiveDatabase.js";

type Row = Record<string, unknown>;

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
             p.payload_gzip AS payloadGzip, p.payload_saved_at AS payloadSavedAt
      FROM source_objects o
      LEFT JOIN current_issue_snapshots s ON s.source_object_id = o.id
      LEFT JOIN issue_sync_states y ON y.source_object_id = o.id
      LEFT JOIN current_full_fetch_payloads p ON p.source_object_id = o.id
      WHERE o.issue_key = ?
    `).get(issueKey));
    if (!issue.sourceObjectId) return { found: false, issueKey };
    const payloadBuffer = Buffer.isBuffer(issue.payloadGzip) ? issue.payloadGzip : null;
    let rawEvidence: unknown = null;
    if (payloadBuffer) {
      rawEvidence = parseJson(gunzipSync(payloadBuffer).toString("utf8"), null);
    }
    const events = rows(db.prepare(`
      SELECT event_type AS eventType, event_time AS eventTime, actor_account_id AS actorAccountId,
             actor_display_name AS actorDisplayName, field_id AS fieldId, field_name AS fieldName,
             from_value_json AS fromValueJson, to_value_json AS toValueJson, source_provenance AS sourceProvenance
      FROM activity_events WHERE source_object_id = ? ORDER BY event_time DESC, id DESC LIMIT 500
    `).all(String(issue.sourceObjectId)));
    delete issue.payloadGzip;
    issue.labels = parseJson(issue.labels_json, []);
    issue.components = parseJson(issue.components_json, []);
    issue.versions = parseJson(issue.versions_json, []);
    issue.snapshot = parseJson(issue.snapshot_json, {});
    issue.coverage = parseJson(issue.coverageProfileJson, {});
    return { found: true, issueKey, issue, events, rawEvidence };
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
