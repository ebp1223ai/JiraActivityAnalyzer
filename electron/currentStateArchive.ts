import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  EVENT_IDENTITY_POLICY_FINGERPRINT,
  EVENT_IDENTITY_POLICY_JSON,
  EVENT_IDENTITY_POLICY_VERSION,
  extractActivityEventsV2
} from "./activityEvents.js";
import {
  compareCoverage,
  defaultCompleteCoverage,
  isCoverageProfile,
  validateIssueLinksCoverage,
  validateCoverage,
  type CoverageComparison,
  type CoverageProfile
} from "./coverageProfile.js";
import {
  buildStableIssueContentV3,
  canonicalJsonV3,
  changedProjectionPaths,
  extractCurrentObservedMetrics,
  resolveEffectiveStableHashPolicyV3,
  stablePolicyFingerprint,
  STABLE_HASH_POLICY_VERSION,
  type EffectiveStableHashPolicyV3
} from "./stableIssueContentV3.js";
import type { DatabaseRuntimeState, DatabaseRuntimeStatus } from "./runtimeStatus.js";

export const CURRENT_STATE_SCHEMA_VERSION = 2;
export const CURRENT_STATE_STORAGE_MODEL = "current_state";
export const CURRENT_STATE_STORAGE_MODEL_VERSION = 1;
export const CURRENT_STATE_DATABASE_TYPE = "current_state_archive_db";
export const CURRENT_STATE_PRODUCT_ID = "jira_activity_analyzer";
export const CURRENT_STATE_TABLES = [
  "database_metadata",
  "source_objects",
  "current_issue_snapshots",
  "current_full_fetch_payloads",
  "issue_sync_states",
  "current_observed_metrics",
  "activity_events",
  "database_run_state"
] as const;
export const LEGACY_HISTORY_TABLES = ["source_object_versions", "source_payloads", "source_import_refs"] as const;

export const CURRENT_STATE_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA auto_vacuum = INCREMENTAL;

CREATE TABLE database_metadata (
  metadata_key TEXT PRIMARY KEY CHECK (metadata_key = 'primary'),
  database_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  database_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  storage_model TEXT NOT NULL,
  storage_model_version INTEGER NOT NULL,
  stable_hash_policy_version INTEGER NOT NULL,
  stable_hash_policy_fingerprint TEXT NOT NULL,
  stable_hash_policy_json TEXT NOT NULL,
  stable_hash_policy_initialized INTEGER NOT NULL CHECK (stable_hash_policy_initialized IN (0, 1)),
  event_identity_policy_version INTEGER NOT NULL,
  event_identity_policy_fingerprint TEXT NOT NULL,
  event_identity_policy_json TEXT NOT NULL,
  jira_server_url TEXT NOT NULL,
  jira_server_identity_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  application_version_created TEXT NOT NULL,
  last_integrity_check_at TEXT
);

CREATE TABLE source_objects (
  id TEXT PRIMARY KEY,
  jira_issue_id TEXT NOT NULL UNIQUE,
  issue_key TEXT NOT NULL UNIQUE,
  project_key TEXT NOT NULL,
  first_saved_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE current_issue_snapshots (
  source_object_id TEXT PRIMARY KEY,
  summary TEXT,
  status TEXT,
  issue_type TEXT,
  priority TEXT,
  resolution TEXT,
  assignee TEXT,
  reporter TEXT,
  creator TEXT,
  labels_json TEXT NOT NULL,
  components_json TEXT NOT NULL,
  versions_json TEXT NOT NULL,
  start_date TEXT,
  due_date TEXT,
  jira_updated_at TEXT,
  snapshot_json TEXT NOT NULL,
  snapshot_updated_at TEXT NOT NULL,
  FOREIGN KEY (source_object_id) REFERENCES source_objects(id) ON DELETE CASCADE
);

CREATE TABLE current_full_fetch_payloads (
  source_object_id TEXT PRIMARY KEY,
  payload_gzip BLOB NOT NULL,
  archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),
  uncompressed_bytes INTEGER NOT NULL CHECK (uncompressed_bytes >= 0),
  compressed_bytes INTEGER NOT NULL CHECK (compressed_bytes >= 0),
  payload_format_version INTEGER NOT NULL,
  payload_saved_at TEXT NOT NULL,
  FOREIGN KEY (source_object_id) REFERENCES source_objects(id) ON DELETE CASCADE
);

CREATE TABLE issue_sync_states (
  source_object_id TEXT PRIMARY KEY,
  stable_hash TEXT NOT NULL CHECK (length(stable_hash) = 64),
  stable_hash_policy_version INTEGER NOT NULL,
  stable_hash_policy_fingerprint TEXT NOT NULL CHECK (length(stable_hash_policy_fingerprint) = 64),
  fetch_profile_hash TEXT NOT NULL CHECK (length(fetch_profile_hash) = 64),
  coverage_profile_json TEXT NOT NULL,
  stable_projection_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision >= 1),
  successful_fetch_count INTEGER NOT NULL CHECK (successful_fetch_count >= 1),
  first_successful_fetch_at TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  last_content_changed_at TEXT NOT NULL,
  last_successful_run_id TEXT NOT NULL,
  last_jira_updated_at TEXT,
  last_outcome TEXT NOT NULL,
  last_update_reason TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),
  payload_updated_at TEXT NOT NULL,
  FOREIGN KEY (source_object_id) REFERENCES source_objects(id) ON DELETE CASCADE
);

CREATE TABLE current_observed_metrics (
  source_object_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  value_type TEXT NOT NULL,
  value_json TEXT,
  is_present INTEGER NOT NULL CHECK (is_present IN (0, 1)),
  observed_at TEXT NOT NULL,
  last_successful_run_id TEXT NOT NULL,
  PRIMARY KEY (source_object_id, field_id),
  FOREIGN KEY (source_object_id) REFERENCES source_objects(id) ON DELETE CASCADE
);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  source_object_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  actor_account_id TEXT,
  actor_display_name TEXT,
  field_id TEXT,
  field_name TEXT,
  from_value_json TEXT,
  to_value_json TEXT,
  source_record_id TEXT NOT NULL,
  event_identity_hash TEXT NOT NULL CHECK (length(event_identity_hash) = 64),
  event_identity_policy_version INTEGER NOT NULL,
  identity_key_type TEXT NOT NULL,
  jira_native_source_id TEXT NOT NULL,
  source_provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_object_id) REFERENCES source_objects(id) ON DELETE CASCADE,
  UNIQUE (source_object_id, event_identity_hash)
);

CREATE TABLE database_run_state (
  state_key TEXT PRIMARY KEY CHECK (state_key = 'latest'),
  last_run_id TEXT NOT NULL,
  last_started_at TEXT NOT NULL,
  last_completed_at TEXT,
  last_status TEXT NOT NULL,
  last_selected_count INTEGER NOT NULL,
  last_new_issue_count INTEGER NOT NULL,
  last_updated_issue_count INTEGER NOT NULL,
  last_existing_count INTEGER NOT NULL,
  last_coverage_blocked_count INTEGER NOT NULL,
  last_excluded_count INTEGER NOT NULL,
  last_database_failure_count INTEGER NOT NULL,
  last_new_activity_event_count INTEGER NOT NULL,
  last_existing_activity_event_count INTEGER NOT NULL,
  latest_diagnostic_file_path TEXT
);

CREATE INDEX idx_source_objects_project_key ON source_objects(project_key, issue_key);
CREATE INDEX idx_activity_events_object_time ON activity_events(source_object_id, event_time, id);
CREATE INDEX idx_activity_events_type_time ON activity_events(event_type, event_time);
`;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("SOURCE_SERVER_IDENTITY_MISSING");
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
}

function serverIdentityHash(baseUrl: string, identity: string) {
  return crypto.createHash("sha256").update(`${normalizeBaseUrl(baseUrl)}\n${identity.trim()}`, "utf8").digest("hex");
}

function baseState(status: DatabaseRuntimeStatus, databasePath: string, message: string): Omit<DatabaseRuntimeState, "requestId"> {
  return {
    status,
    reasonCode: status,
    message,
    checkedAt: new Date().toISOString(),
    path: databasePath ? path.resolve(databasePath) : "",
    databaseId: "",
    schemaVersion: null,
    sourceBinding: "",
    canRead: false,
    canWrite: false,
    bindingComparison: "UNAVAILABLE"
  };
}

function sqliteHeaderValid(filePath: string) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    fs.readSync(descriptor, header, 0, 16, 0);
    return header.toString("utf8") === "SQLite format 3\u0000";
  } finally {
    fs.closeSync(descriptor);
  }
}

export type CurrentStateInspection = Omit<DatabaseRuntimeState, "requestId"> & {
  storageModel?: string;
  stableHashPolicyVersion?: number;
  legacyReadOnly?: boolean;
};

export function checkCurrentStateDatabaseCompatibility(databasePath: string, currentJiraIdentity = ""): CurrentStateInspection {
  if (!databasePath.trim()) return baseState("NOT_CONFIGURED", "", "LOCAL_DATABASE_PATH is not configured.");
  const resolved = path.resolve(databasePath);
  if (!fs.existsSync(resolved)) return baseState("MISSING", resolved, "Database file does not exist.");
  if (!sqliteHeaderValid(resolved)) return baseState("INVALID_SQLITE", resolved, "SQLite header is invalid.");
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(resolved, { readOnly: true });
    db.exec("PRAGMA query_only = ON; PRAGMA foreign_keys = ON;");
    const integrity = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    if (integrity.quick_check !== "ok") return baseState("CORRUPTED", resolved, "PRAGMA quick_check failed.");
    const tableNames = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
    if (LEGACY_HISTORY_TABLES.some((table) => tableNames.has(table))) {
      return {
        ...baseState("MIGRATION_REQUIRED", resolved, "Legacy v0.2.39 database detected. It is read-only and cannot be migrated or used for Current-State writes."),
        canRead: true,
        legacyReadOnly: true,
        storageModel: "legacy_history"
      };
    }
    const metadata = tableNames.has("database_metadata")
      ? db.prepare("SELECT * FROM database_metadata WHERE metadata_key='primary'").get() as Record<string, unknown> | undefined
      : undefined;
    if (metadata
      && metadata.product_id === CURRENT_STATE_PRODUCT_ID
      && metadata.database_type === CURRENT_STATE_DATABASE_TYPE
      && Number(metadata.stable_hash_policy_version) < STABLE_HASH_POLICY_VERSION) {
      return {
        ...baseState("MIGRATION_REQUIRED", resolved, "v0.2.40 Current-State V2 database detected. It is read-only; create a new v0.2.41 V3 database."),
        databaseId: text(metadata.database_id),
        schemaVersion: Number(metadata.schema_version),
        sourceBinding: text(metadata.jira_server_identity_hash),
        canRead: true,
        canWrite: false,
        legacyReadOnly: true,
        storageModel: text(metadata.storage_model),
        stableHashPolicyVersion: Number(metadata.stable_hash_policy_version)
      };
    }
    if (!CURRENT_STATE_TABLES.every((table) => tableNames.has(table))) {
      return baseState("SCHEMA_INCOMPLETE", resolved, "Current-State schema is incomplete.");
    }
    if (!metadata || metadata.product_id !== CURRENT_STATE_PRODUCT_ID || metadata.database_type !== CURRENT_STATE_DATABASE_TYPE) {
      return baseState("FOREIGN_DATABASE", resolved, "Database is not a Jira Activity Analyzer Current-State database.");
    }
    const schemaVersion = Number(metadata.schema_version);
    if (schemaVersion > CURRENT_STATE_SCHEMA_VERSION) {
      return { ...baseState("TOO_NEW", resolved, "Database schema is newer than this application."), schemaVersion };
    }
    if (schemaVersion !== CURRENT_STATE_SCHEMA_VERSION
      || metadata.storage_model !== CURRENT_STATE_STORAGE_MODEL
      || Number(metadata.storage_model_version) !== CURRENT_STATE_STORAGE_MODEL_VERSION
      || Number(metadata.stable_hash_policy_version) !== STABLE_HASH_POLICY_VERSION
      || Number(metadata.event_identity_policy_version) !== EVENT_IDENTITY_POLICY_VERSION
      || text(metadata.event_identity_policy_fingerprint) !== EVENT_IDENTITY_POLICY_FINGERPRINT) {
      return { ...baseState("SCHEMA_INCOMPLETE", resolved, "Current-State policy metadata is incompatible."), schemaVersion };
    }
    try {
      const stablePolicy = JSON.parse(text(metadata.stable_hash_policy_json)) as EffectiveStableHashPolicyV3;
      if (stablePolicyFingerprint(stablePolicy).fingerprint !== text(metadata.stable_hash_policy_fingerprint)) {
        return { ...baseState("SCHEMA_INCOMPLETE", resolved, "Stable Hash policy fingerprint is inconsistent."), schemaVersion };
      }
    } catch {
      return { ...baseState("SCHEMA_INCOMPLETE", resolved, "Stable Hash policy JSON is invalid."), schemaVersion };
    }
    const sourceBinding = text(metadata.jira_server_identity_hash);
    const expectedIdentity = currentJiraIdentity.trim();
    if (expectedIdentity && sourceBinding !== expectedIdentity
      && sourceBinding !== crypto.createHash("sha256").update(expectedIdentity).digest("hex")) {
      return {
        ...baseState("JIRA_INSTANCE_MISMATCH", resolved, "Database Jira Server Identity does not match the active Jira connection."),
        databaseId: text(metadata.database_id),
        schemaVersion,
        sourceBinding,
        canRead: true,
        bindingComparison: "MISMATCH",
        storageModel: CURRENT_STATE_STORAGE_MODEL,
        stableHashPolicyVersion: STABLE_HASH_POLICY_VERSION
      };
    }
    let canWrite = true;
    try { fs.accessSync(resolved, fs.constants.W_OK); } catch { canWrite = false; }
    return {
      ...baseState(canWrite ? "READY" : "READY_READ_ONLY", resolved, canWrite ? "Current-State database is ready." : "Current-State database is read-only."),
      databaseId: text(metadata.database_id),
      schemaVersion,
      sourceBinding,
      canRead: true,
      canWrite,
      bindingComparison: expectedIdentity ? "MATCH" : "UNAVAILABLE",
      storageModel: CURRENT_STATE_STORAGE_MODEL,
      stableHashPolicyVersion: STABLE_HASH_POLICY_VERSION
    };
  } catch (error) {
    return baseState("UNKNOWN_ERROR", resolved, `Current-State database check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try { db?.close(); } catch { /* read-only inspection cleanup */ }
  }
}

export function createCurrentStateDatabase(input: {
  targetPath: string;
  appVersion: string;
  binding?: { serverIdentity: string; baseUrlNormalized: string };
  now?: string;
  databaseId?: string;
}) {
  const targetPath = path.resolve(input.targetPath);
  if (fs.existsSync(targetPath)) throw new Error("DATABASE_ALREADY_EXISTS");
  if (!input.binding?.serverIdentity || !input.binding.baseUrlNormalized) throw new Error("SOURCE_SERVER_IDENTITY_MISSING");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  const now = new Date(input.now ?? Date.now()).toISOString();
  const databaseId = input.databaseId ?? crypto.randomUUID();
  const policy = resolveEffectiveStableHashPolicyV3({}, {});
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(temporaryPath);
    db.exec(CURRENT_STATE_SCHEMA_SQL);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
    db.prepare(`INSERT INTO database_metadata
      (metadata_key, database_id, product_id, database_type, schema_version, storage_model, storage_model_version,
       stable_hash_policy_version, stable_hash_policy_fingerprint, stable_hash_policy_json, stable_hash_policy_initialized,
       event_identity_policy_version, event_identity_policy_fingerprint, event_identity_policy_json,
       jira_server_url, jira_server_identity_hash, created_at, application_version_created, last_integrity_check_at)
      VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      databaseId,
      CURRENT_STATE_PRODUCT_ID,
      CURRENT_STATE_DATABASE_TYPE,
      CURRENT_STATE_SCHEMA_VERSION,
      CURRENT_STATE_STORAGE_MODEL,
      CURRENT_STATE_STORAGE_MODEL_VERSION,
      STABLE_HASH_POLICY_VERSION,
      policy.fingerprint,
      policy.canonicalJson,
      EVENT_IDENTITY_POLICY_VERSION,
      EVENT_IDENTITY_POLICY_FINGERPRINT,
      EVENT_IDENTITY_POLICY_JSON,
      normalizeBaseUrl(input.binding.baseUrlNormalized),
      input.binding.serverIdentity,
      now,
      input.appVersion,
      now
    );
    const check = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string };
    if (check.integrity_check !== "ok") throw new Error("DATABASE_INTEGRITY_FAILED");
    db.close();
    db = undefined;
    // WAL sidecars must be checkpointed before the atomic file activation.
    for (const suffix of ["-wal", "-shm"]) {
      try { fs.unlinkSync(`${temporaryPath}${suffix}`); } catch { /* absent after clean close */ }
    }
    fs.renameSync(temporaryPath, targetPath);
    return {
      databasePath: targetPath,
      databaseId,
      validation: checkCurrentStateDatabaseCompatibility(targetPath)
    };
  } catch (error) {
    try { db?.close(); } catch { /* preserve original failure */ }
    for (const candidate of [temporaryPath, `${temporaryPath}-wal`, `${temporaryPath}-shm`]) {
      try { fs.unlinkSync(candidate); } catch { /* creation cleanup */ }
    }
    throw error;
  }
}

export function createAndActivateCurrentStateDatabase(input: {
  targetPath: string;
  appVersion: string;
  binding: { serverIdentity: string; baseUrlNormalized: string };
  activate: (databasePath: string) => void;
}) {
  const created = createCurrentStateDatabase(input);
  try {
    input.activate(created.databasePath);
    return { ...created, activated: true as const, reasonCode: "CURRENT_STATE_DATABASE_ACTIVATED" };
  } catch (error) {
    return {
      ...created,
      activated: false as const,
      reasonCode: "CURRENT_STATE_DATABASE_ACTIVATION_FAILED",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export type CurrentStateCandidate = {
  issueKey: string;
  eligibility: "eligible" | "partial" | "failed" | "invalid";
  rawJson?: unknown;
  loadRawJson?: () => unknown;
  coverage?: CoverageProfile;
  observedAt?: string;
  simulateFailureAt?: "after_snapshot" | "during_events";
};

export type CurrentStateOutcome = {
  objectKey: string;
  outcome: "new" | "updated" | "existing" | "coverage_blocked" | "excluded" | "invalid" | "failed_rolled_back";
  reasonCode: string;
  sourceObjectId: string;
  jiraIssueId: string;
  stableHash: string;
  previousStableHash: string;
  archiveSha256: string;
  previousArchiveSha256: string;
  coverageComparison: CoverageComparison | "not_run";
  coverageEvidence: unknown;
  meaningfulChangedPaths: string[];
  ignoredRawDifferencePaths: string[];
  volatileMetricDiffs: string[];
  policyDiffs: string[];
  snapshotWritten: boolean;
  payloadDecision: "created" | "replaced" | "unchanged" | "not_written";
  activityEventsInserted: number;
  activityEventsExisting: number;
  activityEventsInsertedByType: Record<string, number>;
  activityEventsExistingByType: Record<string, number>;
  observedMetrics: { inserted: number; updated: number; unchanged: number; blocked: number };
  mappingWarnings: unknown[];
  eventWarnings: unknown[];
};

function emptySummary() {
  return {
    eligible: 0,
    newIssues: 0,
    updatedIssues: 0,
    existingIssues: 0,
    payloadsCreated: 0,
    payloadsReplaced: 0,
    payloadsUnchanged: 0,
    coverageDowngradeBlocked: 0,
    coverageIncomparableBlocked: 0,
    excludedPartial: 0,
    excludedFailed: 0,
    invalid: 0,
    writeFailed: 0,
    rolledBack: 0,
    activityEventsInserted: 0,
    activityEventsExisting: 0,
    storageModel: "Current-State V1",
    observedMetricsInserted: 0,
    observedMetricsUpdated: 0,
    observedMetricsUnchanged: 0,
    stableHashPolicy: "V3",
    eventIdentityPolicy: "V2"
  };
}

function defaultCoverage(rawValue: unknown): CoverageProfile {
  const raw = record(rawValue);
  const issue = record(raw.issue);
  const fields = record(issue.fields);
  const count = (value: unknown) => Array.isArray(value) ? value.length : Array.isArray(record(value).values) ? (record(value).values as unknown[]).length : 0;
  return defaultCompleteCoverage({
    changelog: count(raw.changelog),
    comments: count(raw.comments),
    attachments: count(raw.attachments ?? fields.attachment),
    issueLinks: count(fields.issuelinks)
  });
}

function payloadPrevalidation(rawValue: unknown) {
  const canonical = canonicalJsonV3(rawValue);
  const bytes = Buffer.from(canonical, "utf8");
  const archiveSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const gzip = gzipSync(bytes, { level: 9 });
  const roundTrip = gunzipSync(gzip);
  if (!roundTrip.equals(bytes)) throw new Error("PAYLOAD_GZIP_ROUNDTRIP_FAILED");
  if (crypto.createHash("sha256").update(roundTrip).digest("hex") !== archiveSha256) throw new Error("PAYLOAD_ARCHIVE_HASH_MISMATCH");
  JSON.parse(roundTrip.toString("utf8"));
  return { canonical, bytes, gzip, archiveSha256 };
}

function fieldLabel(value: unknown) {
  const valueRecord = record(value);
  return text(valueRecord.displayName ?? valueRecord.name ?? valueRecord.value ?? valueRecord.key ?? value);
}

function snapshotJson(rawValue: unknown) {
  const raw = record(rawValue);
  const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw;
  const fields = record(issue.fields);
  const snapshot = {
    jiraIssueId: text(issue.id),
    issueKey: text(issue.key ?? raw.issueKey).toUpperCase(),
    summary: text(fields.summary),
    status: fieldLabel(fields.status),
    issueType: fieldLabel(fields.issuetype),
    priority: fieldLabel(fields.priority),
    resolution: fieldLabel(fields.resolution),
    assignee: fieldLabel(fields.assignee),
    reporter: fieldLabel(fields.reporter),
    creator: fieldLabel(fields.creator),
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    components: Array.isArray(fields.components) ? fields.components : [],
    versions: Array.isArray(fields.fixVersions) ? fields.fixVersions : [],
    startDate: fields.customfield_10015 ?? fields.startdate ?? null,
    dueDate: fields.duedate ?? null,
    jiraUpdatedAt: fields.updated ?? null
  };
  return { issue, fields, snapshot, json: canonicalJsonV3(snapshot) };
}

function insertEvents(db: DatabaseSync, sourceObjectId: string, raw: unknown, serverIdentity: string, issueKey: string, now: string, fail = false) {
  let inserted = 0;
  let existing = 0;
  const insertedByType: Record<string, number> = {};
  const existingByType: Record<string, number> = {};
  const extraction = extractActivityEventsV2(raw, serverIdentity, issueKey);
  for (const event of extraction.events) {
    if (fail) throw new Error("SIMULATED_FAILURE_DURING_EVENTS");
    const result = db.prepare(`INSERT OR IGNORE INTO activity_events
      (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name,
       from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version,
       identity_key_type, jira_native_source_id, source_provenance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      sourceObjectId,
      event.eventType,
      event.eventTime,
      event.actorAccountId,
      event.actorDisplayName,
      event.fieldId,
      event.fieldName,
      event.fromValueJson,
      event.toValueJson,
      event.sourceRecordId,
      event.eventIdentityHash,
      EVENT_IDENTITY_POLICY_VERSION,
      event.identityKeyType,
      event.jiraNativeSourceId,
      event.sourceProvenance,
      now
    );
    if (Number(result.changes) > 0) {
      inserted += 1;
      insertedByType[event.eventType] = (insertedByType[event.eventType] ?? 0) + 1;
    } else {
      existing += 1;
      existingByType[event.eventType] = (existingByType[event.eventType] ?? 0) + 1;
    }
  }
  return { inserted, existing, insertedByType, existingByType, warnings: extraction.warnings };
}

function effectivePolicyForCandidate(db: DatabaseSync, rawValue: unknown) {
  const metadata = db.prepare("SELECT * FROM database_metadata WHERE metadata_key='primary'").get() as Record<string, unknown>;
  if (Number(metadata.event_identity_policy_version) !== EVENT_IDENTITY_POLICY_VERSION
    || text(metadata.event_identity_policy_fingerprint) !== EVENT_IDENTITY_POLICY_FINGERPRINT
    || text(metadata.event_identity_policy_json) !== EVENT_IDENTITY_POLICY_JSON) {
    throw new Error("EVENT_IDENTITY_POLICY_MISMATCH");
  }
  const raw = record(rawValue);
  const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw;
  if (!Number(metadata.stable_hash_policy_initialized)) {
    const resolved = resolveEffectiveStableHashPolicyV3(issue.names ?? raw.names, issue.schema ?? raw.schema);
    db.prepare(`UPDATE database_metadata
      SET stable_hash_policy_json=?, stable_hash_policy_fingerprint=?, stable_hash_policy_initialized=1
      WHERE metadata_key='primary'`).run(resolved.canonicalJson, resolved.fingerprint);
    return { ...resolved, initializedNow: true };
  }
  const policy = JSON.parse(text(metadata.stable_hash_policy_json)) as EffectiveStableHashPolicyV3;
  const computed = stablePolicyFingerprint(policy);
  if (policy.policyVersion !== STABLE_HASH_POLICY_VERSION
    || computed.fingerprint !== text(metadata.stable_hash_policy_fingerprint)) {
    throw new Error("STABLE_HASH_POLICY_MISMATCH");
  }
  const currentNames = record(issue.names ?? raw.names);
  for (const resolved of policy.resolvedVolatileFields) {
    if (currentNames[resolved.fieldId] !== undefined
      && String(currentNames[resolved.fieldId]) !== resolved.jiraDisplayName) {
      throw new Error("STABLE_HASH_POLICY_SERVER_METADATA_CONTRADICTION");
    }
  }
  const warnings = [
    ...policy.unresolvedVolatileFields.map((configuredName) => ({
      code: "VOLATILE_FIELD_MAPPING_NOT_FOUND" as const,
      configuredName,
      fieldIds: [] as string[]
    })),
    ...policy.ambiguousVolatileFields.map((item) => ({
      code: "VOLATILE_FIELD_MAPPING_AMBIGUOUS" as const,
      configuredName: item.configuredName,
      fieldIds: item.fieldIds
    }))
  ];
  return {
    policy,
    canonicalJson: computed.canonicalJson,
    fingerprint: computed.fingerprint,
    warnings,
    initializedNow: false
  };
}

function upsertObservedMetrics(
  db: DatabaseSync,
  sourceObjectId: string,
  metrics: ReturnType<typeof extractCurrentObservedMetrics>
) {
  const counts = { inserted: 0, updated: 0, unchanged: 0, blocked: 0 };
  const select = db.prepare(`SELECT display_name, value_type, value_json, is_present
    FROM current_observed_metrics WHERE source_object_id=? AND field_id=?`);
  const upsert = db.prepare(`INSERT INTO current_observed_metrics
    (source_object_id, field_id, display_name, value_type, value_json, is_present, observed_at, last_successful_run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_object_id, field_id) DO UPDATE SET
      display_name=excluded.display_name, value_type=excluded.value_type, value_json=excluded.value_json,
      is_present=excluded.is_present, observed_at=excluded.observed_at,
      last_successful_run_id=excluded.last_successful_run_id`);
  for (const metric of metrics) {
    const previous = select.get(sourceObjectId, metric.fieldId) as Record<string, unknown> | undefined;
    const changed = !previous
      || text(previous.display_name) !== metric.displayName
      || text(previous.value_type) !== metric.valueType
      || (previous.value_json ?? null) !== metric.valueJson
      || Number(previous.is_present) !== Number(metric.isPresent);
    upsert.run(
      sourceObjectId,
      metric.fieldId,
      metric.displayName,
      metric.valueType,
      metric.valueJson,
      metric.isPresent ? 1 : 0,
      metric.observedAt,
      metric.lastSuccessfulRunId
    );
    if (!previous) counts.inserted += 1;
    else if (changed) counts.updated += 1;
    else counts.unchanged += 1;
  }
  return counts;
}

function issueOutcome(db: DatabaseSync, candidate: CurrentStateCandidate, input: CurrentStateBatchInput): CurrentStateOutcome {
  const now = new Date(candidate.observedAt ?? input.observedAt ?? Date.now()).toISOString();
  const raw = candidate.loadRawJson ? candidate.loadRawJson() : candidate.rawJson;
  if (!raw || typeof raw !== "object") throw new Error("PAYLOAD_PARSE_FAILED");
  const coverage = candidate.coverage ?? defaultCoverage(raw);
  if (!isCoverageProfile(coverage)) throw new Error("COVERAGE_INVALID");
  const coverageValidation = validateCoverage(coverage);
  if (!coverageValidation.valid) throw new Error(coverageValidation.reasonCode);
  const issueLinksValidation = validateIssueLinksCoverage(coverage, raw);
  if (!issueLinksValidation.valid) throw new Error(issueLinksValidation.reasonCode);
  const snapshot = snapshotJson(raw);
  const jiraIssueId = text(snapshot.issue.id);
  const issueKey = text(snapshot.issue.key ?? candidate.issueKey).trim().toUpperCase();
  if (!jiraIssueId) throw new Error("JIRA_ISSUE_ID_MISSING");
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) throw new Error("ISSUE_KEY_INVALID");
  const projectKey = issueKey.slice(0, issueKey.lastIndexOf("-"));
  const prepared = payloadPrevalidation(raw);
  const effectivePolicy = effectivePolicyForCandidate(db, raw);
  const stable = buildStableIssueContentV3(raw, coverage, effectivePolicy.policy, input.jira.serverIdentity);
  const fetchProfileHash = crypto.createHash("sha256").update(canonicalJsonV3(coverage), "utf8").digest("hex");

  const byId = db.prepare("SELECT id, issue_key FROM source_objects WHERE jira_issue_id=?").get(jiraIssueId) as { id: string; issue_key: string } | undefined;
  const byKey = db.prepare("SELECT id, jira_issue_id FROM source_objects WHERE issue_key=?").get(issueKey) as { id: string; jira_issue_id: string } | undefined;
  if ((byId && byKey && byId.id !== byKey.id) || (byKey && byKey.jira_issue_id !== jiraIssueId)) throw new Error("JIRA_ISSUE_ID_KEY_COLLISION");
  const sourceObjectId = byId?.id ?? byKey?.id ?? crypto.randomUUID();
  const sync = db.prepare("SELECT * FROM issue_sync_states WHERE source_object_id=?").get(sourceObjectId) as Record<string, unknown> | undefined;
  if (sync && (Number(sync.stable_hash_policy_version) !== STABLE_HASH_POLICY_VERSION
    || text(sync.stable_hash_policy_fingerprint) !== stable.policyFingerprint)) {
    throw new Error("STABLE_HASH_POLICY_MISMATCH");
  }
  const storedCoverage = sync ? JSON.parse(text(sync.coverage_profile_json)) as CoverageProfile : null;
  const coverageComparison = compareCoverage(storedCoverage, coverage);
  if (coverageComparison === "Downgrade" || coverageComparison === "Incomparable" || coverageComparison === "Invalid") {
    return {
      objectKey: issueKey,
      outcome: "coverage_blocked",
      reasonCode: `COVERAGE_${coverageComparison.toUpperCase()}_BLOCKED`,
      sourceObjectId,
      jiraIssueId,
      stableHash: stable.stableHash,
      previousStableHash: text(sync?.stable_hash),
      archiveSha256: prepared.archiveSha256,
      previousArchiveSha256: text(sync?.archive_sha256),
      coverageComparison,
      coverageEvidence: coverage.evidence ?? {},
      meaningfulChangedPaths: [],
      ignoredRawDifferencePaths: [],
      volatileMetricDiffs: [],
      policyDiffs: [],
      snapshotWritten: false,
      payloadDecision: "not_written",
      activityEventsInserted: 0,
      activityEventsExisting: 0,
      activityEventsInsertedByType: {},
      activityEventsExistingByType: {},
      observedMetrics: { inserted: 0, updated: 0, unchanged: 0, blocked: effectivePolicy.policy.resolvedVolatileFields.length },
      mappingWarnings: effectivePolicy.warnings,
      eventWarnings: []
    };
  }
  const isNew = !sync;
  const stableEqual = !isNew
    && text(sync.stable_hash) === stable.stableHash
    && Number(sync.stable_hash_policy_version) === STABLE_HASH_POLICY_VERSION
    && text(sync.stable_hash_policy_fingerprint) === stable.policyFingerprint;
  const existingStable = stableEqual && coverageComparison === "Equivalent";
  const coverageUpgradeOnly = stableEqual && coverageComparison === "Upgrade";
  const previousProjection = sync ? JSON.parse(text(sync.stable_projection_json)) : null;
  const changedPaths = isNew ? ["$"] : changedProjectionPaths(previousProjection, stable.projection);
  const ignoredRawDifferencePaths = existingStable && text(sync.archive_sha256) !== prepared.archiveSha256
    ? ["raw_payload_diff_ignored_stable_equal"]
    : [];

  if (!byId && !byKey) {
    db.prepare(`INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(sourceObjectId, jiraIssueId, issueKey, projectKey, now, now);
  } else if (byId?.issue_key !== issueKey) {
    db.prepare("UPDATE source_objects SET issue_key=?, project_key=? WHERE id=?").run(issueKey, projectKey, sourceObjectId);
  }

  if (!existingStable) {
    db.prepare(`INSERT INTO current_issue_snapshots
      (source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator,
       labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_object_id) DO UPDATE SET
       summary=excluded.summary, status=excluded.status, issue_type=excluded.issue_type, priority=excluded.priority,
       resolution=excluded.resolution, assignee=excluded.assignee, reporter=excluded.reporter, creator=excluded.creator,
       labels_json=excluded.labels_json, components_json=excluded.components_json, versions_json=excluded.versions_json,
       start_date=excluded.start_date, due_date=excluded.due_date, jira_updated_at=excluded.jira_updated_at,
       snapshot_json=excluded.snapshot_json, snapshot_updated_at=excluded.snapshot_updated_at`).run(
      sourceObjectId,
      snapshot.snapshot.summary,
      snapshot.snapshot.status,
      snapshot.snapshot.issueType,
      snapshot.snapshot.priority,
      snapshot.snapshot.resolution,
      snapshot.snapshot.assignee,
      snapshot.snapshot.reporter,
      snapshot.snapshot.creator,
      canonicalJsonV3(snapshot.snapshot.labels),
      canonicalJsonV3(snapshot.snapshot.components),
      canonicalJsonV3(snapshot.snapshot.versions),
      text(snapshot.snapshot.startDate) || null,
      text(snapshot.snapshot.dueDate) || null,
      text(snapshot.snapshot.jiraUpdatedAt) || null,
      snapshot.json,
      now
    );
    if (candidate.simulateFailureAt === "after_snapshot") throw new Error("SIMULATED_FAILURE_AFTER_SNAPSHOT");
    db.prepare(`INSERT INTO current_full_fetch_payloads
      (source_object_id, payload_gzip, archive_sha256, uncompressed_bytes, compressed_bytes, payload_format_version, payload_saved_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(source_object_id) DO UPDATE SET payload_gzip=excluded.payload_gzip, archive_sha256=excluded.archive_sha256,
       uncompressed_bytes=excluded.uncompressed_bytes, compressed_bytes=excluded.compressed_bytes,
       payload_format_version=excluded.payload_format_version, payload_saved_at=excluded.payload_saved_at`).run(
      sourceObjectId,
      prepared.gzip,
      prepared.archiveSha256,
      prepared.bytes.byteLength,
      prepared.gzip.byteLength,
      now
    );
  }

  const activity = insertEvents(db, sourceObjectId, raw, input.jira.serverIdentity, issueKey, now, candidate.simulateFailureAt === "during_events");
  const metrics = extractCurrentObservedMetrics(raw, effectivePolicy.policy, now, input.runId);
  const previousMetrics = new Map((db.prepare(`SELECT field_id, value_type, value_json, is_present
    FROM current_observed_metrics WHERE source_object_id=?`).all(sourceObjectId) as Array<Record<string, unknown>>)
    .map((row) => [text(row.field_id), row]));
  const volatileMetricDiffs = metrics.filter((metric) => {
    const previous = previousMetrics.get(metric.fieldId);
    return !previous
      || text(previous.value_type) !== metric.valueType
      || (previous.value_json ?? null) !== metric.valueJson
      || Number(previous.is_present) !== Number(metric.isPresent);
  }).map((metric) => `issue.fields.${metric.fieldId}`);
  const observedMetrics = upsertObservedMetrics(db, sourceObjectId, metrics);
  const revision = isNew ? 1 : Number(sync.content_revision) + (existingStable || coverageUpgradeOnly ? 0 : 1);
  const successfulFetchCount = isNew ? 1 : Number(sync.successful_fetch_count) + 1;
  const firstSuccessfulFetchAt = isNew ? now : text(sync.first_successful_fetch_at);
  const changedAt = existingStable || coverageUpgradeOnly ? text(sync.last_content_changed_at) : now;
  const payloadUpdatedAt = existingStable ? text(sync.payload_updated_at) : now;
  const persistedArchiveSha = existingStable ? text(sync.archive_sha256) : prepared.archiveSha256;
  db.prepare(`INSERT INTO issue_sync_states
    (source_object_id, stable_hash, stable_hash_policy_version, stable_hash_policy_fingerprint, fetch_profile_hash, coverage_profile_json,
     stable_projection_json, content_revision, successful_fetch_count, first_successful_fetch_at, last_checked_at,
     last_content_changed_at, last_successful_run_id, last_jira_updated_at, last_outcome, last_update_reason, archive_sha256, payload_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_object_id) DO UPDATE SET
     stable_hash=excluded.stable_hash, stable_hash_policy_version=excluded.stable_hash_policy_version,
     stable_hash_policy_fingerprint=excluded.stable_hash_policy_fingerprint,
     fetch_profile_hash=excluded.fetch_profile_hash, coverage_profile_json=excluded.coverage_profile_json,
     stable_projection_json=excluded.stable_projection_json, content_revision=excluded.content_revision,
     successful_fetch_count=excluded.successful_fetch_count, first_successful_fetch_at=excluded.first_successful_fetch_at,
     last_checked_at=excluded.last_checked_at, last_content_changed_at=excluded.last_content_changed_at,
     last_successful_run_id=excluded.last_successful_run_id, last_jira_updated_at=excluded.last_jira_updated_at,
     last_outcome=excluded.last_outcome, last_update_reason=excluded.last_update_reason,
     archive_sha256=excluded.archive_sha256, payload_updated_at=excluded.payload_updated_at`).run(
    sourceObjectId,
    stable.stableHash,
    STABLE_HASH_POLICY_VERSION,
    stable.policyFingerprint,
    fetchProfileHash,
    canonicalJsonV3(coverage),
    stable.canonicalJson,
    revision,
    successfulFetchCount,
    firstSuccessfulFetchAt,
    now,
    changedAt,
    input.runId,
    text(snapshot.snapshot.jiraUpdatedAt) || null,
    isNew ? "new" : existingStable ? "existing" : "updated",
    isNew ? "current_state_created" : existingStable ? "stable_equal" : coverageUpgradeOnly ? "coverage_upgraded" : "meaningful_content_changed",
    persistedArchiveSha,
    payloadUpdatedAt
  );
  return {
    objectKey: issueKey,
    outcome: isNew ? "new" : existingStable ? "existing" : "updated",
    reasonCode: isNew ? "CURRENT_STATE_CREATED" : existingStable ? "STABLE_EQUAL" : coverageUpgradeOnly ? "COVERAGE_UPGRADED" : "MEANINGFUL_CONTENT_CHANGED",
    sourceObjectId,
    jiraIssueId,
    stableHash: stable.stableHash,
    previousStableHash: text(sync?.stable_hash),
    archiveSha256: persistedArchiveSha,
    previousArchiveSha256: text(sync?.archive_sha256),
    coverageComparison,
    coverageEvidence: coverage.evidence ?? {},
    meaningfulChangedPaths: coverageUpgradeOnly ? [] : changedPaths,
    ignoredRawDifferencePaths,
    volatileMetricDiffs,
    policyDiffs: [],
    snapshotWritten: !existingStable,
    payloadDecision: isNew ? "created" : existingStable ? "unchanged" : "replaced",
    activityEventsInserted: activity.inserted,
    activityEventsExisting: activity.existing,
    activityEventsInsertedByType: activity.insertedByType,
    activityEventsExistingByType: activity.existingByType,
    observedMetrics,
    mappingWarnings: effectivePolicy.warnings,
    eventWarnings: activity.warnings
  };
}

export type CurrentStateBatchInput = {
  operationId: string;
  runId: string;
  databasePath: string;
  jira: { serverIdentity: string; baseUrlNormalized: string };
  items: CurrentStateCandidate[];
  observedAt?: string;
  diagnosticFilePath?: string;
};

export function writeCurrentStateBatch(input: CurrentStateBatchInput) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const databasePath = path.resolve(input.databasePath);
  const compatibility = checkCurrentStateDatabaseCompatibility(databasePath, input.jira.serverIdentity);
  const summary = emptySummary();
  const outcomes: CurrentStateOutcome[] = [];
  if (compatibility.status !== "READY") {
    return {
      ok: false,
      operationId: input.operationId,
      status: "preflight_failed",
      reasonCode: compatibility.legacyReadOnly ? "LEGACY_DATABASE_READ_ONLY" : compatibility.status,
      message: compatibility.message,
      targetDatabase: databasePath,
      databaseId: compatibility.databaseId,
      preflightStatus: compatibility.status,
      outcomes,
      summary,
      readbackVerified: false,
      foreignKeyCheck: "not_run",
      durationMs: Date.now() - startedMs
    };
  }
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(databasePath);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
    for (const item of input.items) {
      if (item.eligibility !== "eligible") {
        if (item.eligibility === "partial") summary.excludedPartial += 1;
        else if (item.eligibility === "failed") summary.excludedFailed += 1;
        else summary.invalid += 1;
        outcomes.push({
          objectKey: item.issueKey,
          outcome: item.eligibility === "invalid" ? "invalid" : "excluded",
          reasonCode: item.eligibility === "partial" ? "ISSUE_PARTIAL_EXCLUDED" : item.eligibility === "failed" ? "ISSUE_FAILED_EXCLUDED" : "ISSUE_INVALID",
          sourceObjectId: "",
          jiraIssueId: "",
          stableHash: "",
          previousStableHash: "",
          archiveSha256: "",
          previousArchiveSha256: "",
          coverageComparison: "not_run",
          coverageEvidence: {},
          meaningfulChangedPaths: [],
          ignoredRawDifferencePaths: [],
          volatileMetricDiffs: [],
          policyDiffs: [],
          snapshotWritten: false,
          payloadDecision: "not_written",
          activityEventsInserted: 0,
          activityEventsExisting: 0,
          activityEventsInsertedByType: {},
          activityEventsExistingByType: {},
          observedMetrics: { inserted: 0, updated: 0, unchanged: 0, blocked: 0 },
          mappingWarnings: [],
          eventWarnings: []
        });
        continue;
      }
      summary.eligible += 1;
      db.exec("BEGIN IMMEDIATE");
      try {
        const outcome = issueOutcome(db, item, input);
        if (outcome.outcome === "coverage_blocked") {
          db.exec("ROLLBACK");
          if (outcome.coverageComparison === "Downgrade") summary.coverageDowngradeBlocked += 1;
          else summary.coverageIncomparableBlocked += 1;
        } else {
          db.exec("COMMIT");
          if (outcome.outcome === "new") summary.newIssues += 1;
          if (outcome.outcome === "updated") summary.updatedIssues += 1;
          if (outcome.outcome === "existing") summary.existingIssues += 1;
          if (outcome.payloadDecision === "created") summary.payloadsCreated += 1;
          if (outcome.payloadDecision === "replaced") summary.payloadsReplaced += 1;
          if (outcome.payloadDecision === "unchanged") summary.payloadsUnchanged += 1;
          summary.activityEventsInserted += outcome.activityEventsInserted;
          summary.activityEventsExisting += outcome.activityEventsExisting;
          summary.observedMetricsInserted += outcome.observedMetrics.inserted;
          summary.observedMetricsUpdated += outcome.observedMetrics.updated;
          summary.observedMetricsUnchanged += outcome.observedMetrics.unchanged;
        }
        outcomes.push(outcome);
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* transaction may already be closed */ }
        summary.writeFailed += 1;
        summary.rolledBack += 1;
        outcomes.push({
          objectKey: item.issueKey,
          outcome: "failed_rolled_back",
          reasonCode: error instanceof Error ? error.message.split(":")[0] : "DATABASE_WRITE_FAILED",
          sourceObjectId: "",
          jiraIssueId: "",
          stableHash: "",
          previousStableHash: "",
          archiveSha256: "",
          previousArchiveSha256: "",
          coverageComparison: "not_run",
          coverageEvidence: {},
          meaningfulChangedPaths: [],
          ignoredRawDifferencePaths: [],
          volatileMetricDiffs: [],
          policyDiffs: [],
          snapshotWritten: false,
          payloadDecision: "not_written",
          activityEventsInserted: 0,
          activityEventsExisting: 0,
          activityEventsInsertedByType: {},
          activityEventsExistingByType: {},
          observedMetrics: { inserted: 0, updated: 0, unchanged: 0, blocked: 0 },
          mappingWarnings: [],
          eventWarnings: []
        });
      }
    }
    const completedAt = new Date().toISOString();
    db.prepare(`INSERT INTO database_run_state
      (state_key, last_run_id, last_started_at, last_completed_at, last_status, last_selected_count,
       last_new_issue_count, last_updated_issue_count, last_existing_count, last_coverage_blocked_count,
       last_excluded_count, last_database_failure_count, last_new_activity_event_count,
       last_existing_activity_event_count, latest_diagnostic_file_path)
      VALUES ('latest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
       last_run_id=excluded.last_run_id, last_started_at=excluded.last_started_at,
       last_completed_at=excluded.last_completed_at, last_status=excluded.last_status,
       last_selected_count=excluded.last_selected_count, last_new_issue_count=excluded.last_new_issue_count,
       last_updated_issue_count=excluded.last_updated_issue_count, last_existing_count=excluded.last_existing_count,
       last_coverage_blocked_count=excluded.last_coverage_blocked_count, last_excluded_count=excluded.last_excluded_count,
       last_database_failure_count=excluded.last_database_failure_count,
       last_new_activity_event_count=excluded.last_new_activity_event_count,
       last_existing_activity_event_count=excluded.last_existing_activity_event_count,
       latest_diagnostic_file_path=excluded.latest_diagnostic_file_path`).run(
      input.runId,
      startedAt,
      completedAt,
      summary.writeFailed ? "partial_failure" : "completed",
      input.items.length,
      summary.newIssues,
      summary.updatedIssues,
      summary.existingIssues,
      summary.coverageDowngradeBlocked + summary.coverageIncomparableBlocked,
      summary.excludedPartial + summary.excludedFailed + summary.invalid,
      summary.writeFailed,
      summary.activityEventsInserted,
      summary.activityEventsExisting,
      input.diagnosticFilePath ?? null
    );
    db.prepare("UPDATE database_metadata SET last_integrity_check_at=? WHERE metadata_key='primary'").run(completedAt);
    const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string };
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const checkpoint = db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get();
    const page = db.prepare("PRAGMA page_count").get() as { page_count?: number };
    const free = db.prepare("PRAGMA freelist_count").get() as { freelist_count?: number };
    if (Number(free.freelist_count) > 128 && Number(free.freelist_count) > Number(page.page_count) * 0.1) {
      db.exec("PRAGMA incremental_vacuum(64)");
    }
    return {
      ok: summary.writeFailed === 0,
      operationId: input.operationId,
      status: summary.writeFailed ? "completed_with_errors" : "completed",
      reasonCode: summary.writeFailed ? "ISSUE_TRANSACTION_FAILURES" : "CURRENT_STATE_SAVE_COMPLETED",
      message: summary.writeFailed
        ? "Current-State save completed with rolled-back Issue failures. / Current-State 儲存完成，但部分 Issue 已完整回滾。"
        : "Current-State save completed. Existing Issues did not rewrite large Payloads. / Current-State 儲存完成；Existing Issues 未重寫大型 Payload。",
      targetDatabase: databasePath,
      databaseId: compatibility.databaseId,
      baseUrlNormalized: normalizeBaseUrl(input.jira.baseUrlNormalized),
      preflightStatus: compatibility.status,
      schemaVersion: CURRENT_STATE_SCHEMA_VERSION,
      storageModel: "Current-State V1",
      stableHashPolicy: "V3",
      eventIdentityPolicy: "V2",
      stablePolicyFingerprint: text((db.prepare("SELECT stable_hash_policy_fingerprint FROM database_metadata WHERE metadata_key='primary'").get() as Record<string, unknown>).stable_hash_policy_fingerprint),
      eventPolicyFingerprint: EVENT_IDENTITY_POLICY_FINGERPRINT,
      outcomes,
      summary,
      readbackVerified: integrity.integrity_check === "ok",
      foreignKeyCheck: foreignKeys.length === 0 ? "ok" : `failed:${foreignKeys.length}`,
      checkpoint,
      durationMs: Date.now() - startedMs
    };
  } finally {
    try { db?.close(); } catch { /* preserve completed result */ }
  }
}

export function currentStateCounts(databasePath: string) {
  const db = new DatabaseSync(path.resolve(databasePath), { readOnly: true });
  try {
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return Object.fromEntries(CURRENT_STATE_TABLES.map((table) => [table, count(table)]));
  } finally {
    db.close();
  }
}
