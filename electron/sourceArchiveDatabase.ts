import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { extractActivityEvents } from "./activityEvents.js";
import {
  buildStableSourceProjection,
  meaningfulChangedPaths,
  type StableProjectionResult
} from "./stableSourceProjection.js";
import type { DatabaseRuntimeState, DatabaseRuntimeStatus } from "./runtimeStatus.js";

export const SOURCE_ARCHIVE_SCHEMA_VERSION = 2;
export const SOURCE_ARCHIVE_PRODUCT_ID = "jira_activity_analyzer";
export const SOURCE_ARCHIVE_DATABASE_TYPE = "source_archive_db";

export const SOURCE_ARCHIVE_TABLES = [
  "database_metadata",
  "schema_migrations",
  "source_system_bindings",
  "source_objects",
  "source_object_versions",
  "source_payloads",
  "source_import_refs",
  "activity_events"
] as const;

export const SOURCE_ARCHIVE_V1_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE database_metadata (
  metadata_key TEXT PRIMARY KEY CHECK (metadata_key = 'primary'),
  database_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL CHECK (product_id = '${SOURCE_ARCHIVE_PRODUCT_ID}'),
  database_type TEXT NOT NULL CHECK (database_type = '${SOURCE_ARCHIVE_DATABASE_TYPE}'),
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  app_version_created TEXT NOT NULL
);

CREATE TABLE schema_migrations (
  migration_id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  migration_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  app_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'failed')),
  FOREIGN KEY (database_id) REFERENCES database_metadata(database_id) ON DELETE CASCADE
);

CREATE TABLE source_system_bindings (
  binding_id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  source_system TEXT NOT NULL CHECK (source_system IN ('jira', 'confluence')),
  server_identity TEXT NOT NULL,
  base_url_normalized TEXT NOT NULL,
  server_title TEXT,
  first_bound_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  FOREIGN KEY (database_id) REFERENCES database_metadata(database_id) ON DELETE CASCADE,
  UNIQUE (database_id, source_system)
);

CREATE TABLE source_objects (
  source_object_id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL CHECK (source_system IN ('jira', 'confluence')),
  object_type TEXT NOT NULL CHECK (object_type IN ('issue', 'page')),
  object_key TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_system, object_type, object_key)
);

CREATE TABLE source_object_versions (
  source_object_version_id TEXT PRIMARY KEY,
  source_object_id TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  source_version_number INTEGER,
  source_updated_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_object_id) REFERENCES source_objects(source_object_id) ON DELETE CASCADE,
  UNIQUE (source_object_id, content_hash)
);

CREATE TABLE source_payloads (
  source_payload_id TEXT PRIMARY KEY,
  source_object_version_id TEXT NOT NULL UNIQUE,
  payload_format TEXT NOT NULL CHECK (payload_format = 'json'),
  text_encoding TEXT NOT NULL CHECK (text_encoding = 'utf-8'),
  compression TEXT NOT NULL CHECK (compression = 'gzip'),
  compressed_payload BLOB NOT NULL,
  uncompressed_size_bytes INTEGER NOT NULL CHECK (uncompressed_size_bytes >= 0),
  compressed_size_bytes INTEGER NOT NULL CHECK (compressed_size_bytes >= 0),
  stored_at TEXT NOT NULL,
  FOREIGN KEY (source_object_version_id) REFERENCES source_object_versions(source_object_version_id) ON DELETE CASCADE
);

CREATE TABLE source_import_refs (
  source_import_ref_id TEXT PRIMARY KEY,
  source_object_version_id TEXT NOT NULL,
  source_bundle_name TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_json_path TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  FOREIGN KEY (source_object_version_id) REFERENCES source_object_versions(source_object_version_id) ON DELETE CASCADE,
  UNIQUE (source_object_version_id, source_bundle_name, source_file_name, source_json_path)
);

CREATE INDEX idx_schema_migrations_database ON schema_migrations(database_id, applied_at);
CREATE INDEX idx_source_bindings_identity ON source_system_bindings(source_system, server_identity);
CREATE INDEX idx_source_objects_last_seen ON source_objects(last_seen_at);
CREATE INDEX idx_source_versions_object_seen ON source_object_versions(source_object_id, last_seen_at);
CREATE INDEX idx_source_versions_updated ON source_object_versions(source_updated_at);
CREATE INDEX idx_source_import_refs_bundle ON source_import_refs(source_bundle_name, source_file_name);
`;

const schemaV2Sql = `
ALTER TABLE source_system_bindings ADD COLUMN connection_label TEXT;
ALTER TABLE source_system_bindings ADD COLUMN server_title_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (server_title_status IN ('verified', 'unverified'));
ALTER TABLE source_object_versions ADD COLUMN stable_version_hash TEXT CHECK (stable_version_hash IS NULL OR length(stable_version_hash) = 64);
ALTER TABLE source_object_versions ADD COLUMN version_identity_status TEXT NOT NULL DEFAULT 'legacy_unverified'
  CHECK (version_identity_status IN ('legacy_unverified', 'stable_verified'));

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  source_object_id TEXT NOT NULL,
  object_version_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  actor_account_id TEXT,
  actor_display_name TEXT,
  field_id TEXT,
  field_name TEXT,
  from_value_json TEXT,
  to_value_json TEXT,
  source_record_id TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE CHECK (length(event_hash) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_object_id) REFERENCES source_objects(source_object_id) ON DELETE CASCADE,
  FOREIGN KEY (object_version_id) REFERENCES source_object_versions(source_object_version_id) ON DELETE CASCADE
);

CREATE INDEX idx_source_versions_stable_hash ON source_object_versions(source_object_id, stable_version_hash, created_at, source_object_version_id);
CREATE INDEX idx_activity_events_object_time ON activity_events(source_object_id, event_time, id);
CREATE INDEX idx_activity_events_version ON activity_events(object_version_id);
CREATE INDEX idx_activity_events_type_time ON activity_events(event_type, event_time);
`;

const volatileCanonicalKeys = new Set([
  "exportedAt", "generatedAt", "bundleName", "fileName", "jsonPath",
  "packagePath", "outputPath", "temporaryPath", "buildTime",
  "operationId", "saveOperationId", "executionTimeMs", "durationMs"
]);

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record)
      .filter((key) => !volatileCanonicalKeys.has(key) && record[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalValue(record[key])]));
  }
  if (value === undefined) return null;
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalContentHash(value: unknown) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function normalizeSourceObjectKey(sourceSystem: "jira" | "confluence", objectType: "issue" | "page", objectKey: string) {
  const normalized = objectKey.trim();
  if (sourceSystem === "jira" && objectType === "issue") {
    const upper = normalized.toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(upper)) throw new Error("INVALID_JIRA_ISSUE_KEY");
    return upper;
  }
  if (!normalized) throw new Error("INVALID_SOURCE_OBJECT_KEY");
  return normalized;
}

function utcTimestamp(value = new Date().toISOString()) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) throw new Error("INVALID_TIMESTAMP");
  return timestamp.toISOString();
}

function baseDatabaseState(status: DatabaseRuntimeStatus, databasePath: string, message: string): Omit<DatabaseRuntimeState, "requestId"> {
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

function errorStatus(error: unknown): DatabaseRuntimeStatus {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  if (code.includes("BUSY") || code.includes("LOCKED") || /locked|busy/i.test(message)) return "LOCKED";
  if (code === "EACCES" || code === "EPERM" || /permission/i.test(message)) return "PERMISSION_DENIED";
  if (/not a database|file is encrypted/i.test(message)) return "INVALID_SQLITE";
  if (/malformed|corrupt/i.test(message)) return "CORRUPTED";
  return "UNKNOWN_ERROR";
}

function rows<T extends Record<string, unknown>>(value: unknown) {
  return value as T[];
}

function validateSchema(db: DatabaseSync, schemaVersion = SOURCE_ARCHIVE_SCHEMA_VERSION) {
  const tableRows = rows<{ name: string }>(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
  const tableNames = new Set(tableRows.map((row) => row.name));
  const expectedTables = schemaVersion >= 2
    ? SOURCE_ARCHIVE_TABLES
    : SOURCE_ARCHIVE_TABLES.filter((name) => name !== "activity_events");
  const missingTables = expectedTables.filter((name) => !tableNames.has(name));
  if (missingTables.length) return { ok: false as const, missing: missingTables, reason: "SCHEMA_INCOMPLETE" as const };

  const requiredIndexes = [
    "idx_schema_migrations_database",
    "idx_source_bindings_identity",
    "idx_source_objects_last_seen",
    "idx_source_versions_object_seen",
    "idx_source_versions_updated",
    "idx_source_import_refs_bundle",
    ...(schemaVersion >= 2
      ? ["idx_source_versions_stable_hash", "idx_activity_events_object_time", "idx_activity_events_version", "idx_activity_events_type_time"]
      : [])
  ];
  const indexRows = rows<{ name: string }>(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all());
  const indexNames = new Set(indexRows.map((row) => row.name));
  const missingIndexes = requiredIndexes.filter((name) => !indexNames.has(name));
  if (missingIndexes.length) return { ok: false as const, missing: missingIndexes, reason: "SCHEMA_INCOMPLETE" as const };

  const foreignKeyTables = [
    "schema_migrations", "source_system_bindings", "source_object_versions", "source_payloads", "source_import_refs",
    ...(schemaVersion >= 2 ? ["activity_events"] : [])
  ];
  const missingForeignKeys = foreignKeyTables.filter((table) => rows(db.prepare(`PRAGMA foreign_key_list(${table})`).all()).length === 0);
  if (missingForeignKeys.length) return { ok: false as const, missing: missingForeignKeys, reason: "SCHEMA_INCOMPLETE" as const };
  return { ok: true as const };
}

export function checkDatabaseCompatibility(databasePath: string, currentJiraIdentity = ""): Omit<DatabaseRuntimeState, "requestId"> {
  if (!databasePath.trim()) return baseDatabaseState("NOT_CONFIGURED", "", "LOCAL_DATABASE_PATH is not configured.");
  const resolved = path.resolve(databasePath);
  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return baseDatabaseState(code === "ENOENT" ? "MISSING" : code === "EACCES" ? "PERMISSION_DENIED" : "UNKNOWN_ERROR", resolved, "Database file cannot be accessed.");
  }
  if (!stats.isFile()) return baseDatabaseState("INVALID_SQLITE", resolved, "Database path is not a regular file.");
  try {
    const descriptor = fs.openSync(resolved, "r");
    const header = Buffer.alloc(16);
    fs.readSync(descriptor, header, 0, 16, 0);
    fs.closeSync(descriptor);
    if (header.toString("utf8") !== "SQLite format 3\u0000") {
      return baseDatabaseState("INVALID_SQLITE", resolved, "SQLite header is invalid.");
    }
  } catch (error) {
    return baseDatabaseState(errorStatus(error), resolved, "Database header cannot be read.");
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(resolved, { readOnly: true });
    db.exec("PRAGMA foreign_keys = ON; PRAGMA query_only = ON;");
    const quick = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    if (quick?.quick_check !== "ok") return baseDatabaseState("CORRUPTED", resolved, "PRAGMA quick_check failed.");
    const metadataTable = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='database_metadata'").get();
    if (!metadataTable) {
      return baseDatabaseState("SCHEMA_INCOMPLETE", resolved, "Required schema object is missing: database_metadata.");
    }
    const metadataRows = rows<{
      database_id: string; product_id: string; database_type: string; schema_version: number;
    }>(db.prepare("SELECT database_id, product_id, database_type, schema_version FROM database_metadata").all());
    if (metadataRows.length !== 1 || metadataRows[0].product_id !== SOURCE_ARCHIVE_PRODUCT_ID || metadataRows[0].database_type !== SOURCE_ARCHIVE_DATABASE_TYPE) {
      return baseDatabaseState("FOREIGN_DATABASE", resolved, "Database product metadata does not identify Jira Activity Analyzer Source Archive.");
    }
    const metadata = metadataRows[0];
    const schema = validateSchema(db, metadata.schema_version);
    if (!schema.ok) return baseDatabaseState(schema.reason, resolved, `Required schema objects are missing: ${schema.missing.join(", ")}.`);
    if (metadata.schema_version < SOURCE_ARCHIVE_SCHEMA_VERSION) {
      return { ...baseDatabaseState("MIGRATION_REQUIRED", resolved, "Database schema is older and requires migration to the current version."), databaseId: metadata.database_id, schemaVersion: metadata.schema_version, canRead: true };
    }
    if (metadata.schema_version > SOURCE_ARCHIVE_SCHEMA_VERSION) {
      return { ...baseDatabaseState("TOO_NEW", resolved, "Database schema is newer than this application."), databaseId: metadata.database_id, schemaVersion: metadata.schema_version };
    }
    const migration = db.prepare("SELECT status FROM schema_migrations ORDER BY applied_at DESC LIMIT 1").get() as { status?: string } | undefined;
    if (!migration || migration.status !== "applied") {
      return { ...baseDatabaseState("SCHEMA_INCOMPLETE", resolved, "Schema migration history is missing or invalid."), databaseId: metadata.database_id, schemaVersion: metadata.schema_version };
    }
    const jiraBinding = db.prepare("SELECT server_identity FROM source_system_bindings WHERE source_system='jira'").get() as { server_identity?: string } | undefined;
    const sourceBinding = jiraBinding?.server_identity ?? "";
    const canWrite = (() => {
      try { fs.accessSync(resolved, fs.constants.W_OK); return true; } catch { return false; }
    })();
    if (currentJiraIdentity && sourceBinding && currentJiraIdentity !== sourceBinding) {
      return {
        ...baseDatabaseState("JIRA_INSTANCE_MISMATCH", resolved, "Database is bound to a different Jira instance."),
        databaseId: metadata.database_id,
        schemaVersion: metadata.schema_version,
        sourceBinding,
        canRead: true,
        canWrite: false,
        bindingComparison: "MISMATCH"
      };
    }
    const status: DatabaseRuntimeStatus = canWrite ? "READY" : "READY_READ_ONLY";
    return {
      ...baseDatabaseState(status, resolved, canWrite ? "Database is ready." : "Database is ready for read-only use."),
      databaseId: metadata.database_id,
      schemaVersion: metadata.schema_version,
      sourceBinding,
      canRead: true,
      canWrite,
      bindingComparison: currentJiraIdentity && sourceBinding ? "MATCH" : sourceBinding ? "UNAVAILABLE" : "UNBOUND"
    };
  } catch (error) {
    return baseDatabaseState(errorStatus(error), resolved, `Database compatibility check failed: ${errorStatus(error)}.`);
  } finally {
    try { db?.close(); } catch { /* Read-only validation cleanup. */ }
  }
}

export type SourceBindingInput = {
  sourceSystem: "jira" | "confluence";
  serverIdentity: string;
  baseUrlNormalized: string;
  serverTitle?: string;
  serverTitleStatus?: "verified" | "unverified";
  connectionLabel?: string;
};

export function createSourceArchiveDatabase(input: {
  targetPath: string;
  appVersion: string;
  binding?: SourceBindingInput;
  now?: string;
  databaseId?: string;
}) {
  const targetPath = path.resolve(input.targetPath);
  if (fs.existsSync(targetPath)) throw new Error("DATABASE_ALREADY_EXISTS");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  const now = utcTimestamp(input.now);
  const databaseId = input.databaseId ?? crypto.randomUUID();
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(temporaryPath);
    db.exec(SOURCE_ARCHIVE_V1_SCHEMA_SQL);
    db.exec(schemaV2Sql);
    db.exec("BEGIN IMMEDIATE");
    db.prepare(`INSERT INTO database_metadata
      (metadata_key, database_id, product_id, database_type, schema_version, created_at, updated_at, app_version_created)
      VALUES ('primary', ?, ?, ?, ?, ?, ?, ?)`).run(
      databaseId, SOURCE_ARCHIVE_PRODUCT_ID, SOURCE_ARCHIVE_DATABASE_TYPE,
      SOURCE_ARCHIVE_SCHEMA_VERSION, now, now, input.appVersion
    );
    db.prepare(`INSERT INTO schema_migrations
      (migration_id, database_id, from_version, to_version, migration_name, checksum, applied_at, app_version, status)
      VALUES (?, ?, 0, ?, 'initial_source_archive_schema', ?, ?, ?, 'applied')`).run(
      crypto.randomUUID(), databaseId, SOURCE_ARCHIVE_SCHEMA_VERSION,
      crypto.createHash("sha256").update(`${SOURCE_ARCHIVE_V1_SCHEMA_SQL}\n${schemaV2Sql}`).digest("hex"), now, input.appVersion
    );
    if (input.binding?.serverIdentity) {
      db.prepare(`INSERT INTO source_system_bindings
        (binding_id, database_id, source_system, server_identity, base_url_normalized, server_title,
         connection_label, server_title_status, first_bound_at, last_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        crypto.randomUUID(), databaseId, input.binding.sourceSystem, input.binding.serverIdentity,
        input.binding.baseUrlNormalized, input.binding.serverTitle ?? null,
        input.binding.connectionLabel ?? null, input.binding.serverTitleStatus ?? "unverified", now, now
      );
    }
    db.exec("COMMIT");
    db.close();
    db = undefined;
    const validation = checkDatabaseCompatibility(temporaryPath, input.binding?.sourceSystem === "jira" ? input.binding.serverIdentity : "");
    if (!["READY", "READY_READ_ONLY"].includes(validation.status)) {
      throw new Error(`DATABASE_VALIDATION_FAILED:${validation.status}`);
    }
    fs.renameSync(temporaryPath, targetPath);
    return { databasePath: targetPath, databaseId, validation: checkDatabaseCompatibility(targetPath, input.binding?.sourceSystem === "jira" ? input.binding.serverIdentity : "") };
  } catch (error) {
    try { db?.exec("ROLLBACK"); } catch { /* Transaction may not be active. */ }
    try { db?.close(); } catch { /* Preserve original failure. */ }
    try { fs.unlinkSync(temporaryPath); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
}

export type SourceArchiveMigrationResult = {
  status: "not_required" | "completed" | "failed";
  reasonCode: string;
  databasePath: string;
  backupPath: string;
  fromVersion: number | null;
  toVersion: number;
  backupValidated: boolean;
  scannedVersions: number;
  stableHashBackfilled: number;
  stableHashFailed: number;
  legacyDuplicateGroups: Array<{ sourceObjectId: string; stableVersionHash: string; versionIds: string[] }>;
  activityEventsInserted: number;
  activityEventsExisting: number;
  activityEventsFailed: number;
  payloadsUnmodified: number;
  startedAt: string;
  finishedAt: string;
  message: string;
};

function sqliteString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function migrationBackupPath(databasePath: string, now: Date) {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const base = `${databasePath}.pre-v0.2.39-${stamp}.sqlite.bak`;
  if (!fs.existsSync(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}.${suffix}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("MIGRATION_BACKUP_FAILED:collision_limit");
}

function validateMigrationDatabase(databasePath: string, expectedVersion: number) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON; PRAGMA foreign_keys=ON");
    const quick = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    if (quick?.quick_check !== "ok") throw new Error("MIGRATION_PREFLIGHT_FAILED:quick_check");
    if (db.prepare("PRAGMA foreign_key_check").all().length > 0) throw new Error("MIGRATION_PREFLIGHT_FAILED:foreign_key_check");
    const metadata = db.prepare("SELECT schema_version FROM database_metadata WHERE metadata_key='primary'").get() as { schema_version?: number } | undefined;
    if (Number(metadata?.schema_version) !== expectedVersion) throw new Error("MIGRATION_PREFLIGHT_FAILED:schema_version");
    const schema = validateSchema(db, expectedVersion);
    if (!schema.ok) throw new Error(`MIGRATION_PREFLIGHT_FAILED:${schema.missing.join(",")}`);
  } finally {
    db.close();
  }
}

function readDatabaseSchemaVersion(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = db.prepare("SELECT schema_version FROM database_metadata WHERE metadata_key='primary'").get() as {
      schema_version?: number;
    } | undefined;
    return Number(row?.schema_version);
  } finally {
    db.close();
  }
}

function insertActivityEvents(
  db: DatabaseSync,
  sourceObjectId: string,
  versionId: string,
  rawJson: unknown,
  serverIdentity: string,
  issueKey: string,
  createdAt: string
) {
  let events;
  try {
    events = extractActivityEvents(rawJson, serverIdentity, issueKey);
  } catch (error) {
    throw new Error(`ACTIVITY_EVENT_PARSE_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
  let inserted = 0;
  let existing = 0;
  const statement = db.prepare(`INSERT OR IGNORE INTO activity_events
    (id, source_object_id, object_version_id, event_type, event_time, actor_account_id, actor_display_name,
     field_id, field_name, from_value_json, to_value_json, source_record_id, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const event of events) {
    let result;
    try {
      result = statement.run(
        event.id, sourceObjectId, versionId, event.eventType, event.eventTime,
        event.actorAccountId, event.actorDisplayName, event.fieldId, event.fieldName,
        event.fromValueJson, event.toValueJson, event.sourceRecordId, event.eventHash, createdAt
      );
    } catch (error) {
      throw new Error(`ACTIVITY_EVENT_INSERT_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
    if (Number(result.changes) > 0) inserted += 1;
    else existing += 1;
  }
  return { inserted, existing, total: events.length };
}

export function migrateSourceArchiveDatabase(input: {
  databasePath: string;
  appVersion: string;
  now?: string;
  simulateBackupFailure?: boolean;
  simulateBackupValidationFailure?: boolean;
  simulateFailureAfterBackfill?: boolean;
}): SourceArchiveMigrationResult {
  const startedAt = new Date().toISOString();
  const databasePath = path.resolve(input.databasePath);
  const base = {
    databasePath,
    backupPath: "",
    fromVersion: null as number | null,
    toVersion: SOURCE_ARCHIVE_SCHEMA_VERSION,
    backupValidated: false,
    scannedVersions: 0,
    stableHashBackfilled: 0,
    stableHashFailed: 0,
    legacyDuplicateGroups: [] as Array<{ sourceObjectId: string; stableVersionHash: string; versionIds: string[] }>,
    activityEventsInserted: 0,
    activityEventsExisting: 0,
    activityEventsFailed: 0,
    payloadsUnmodified: 0,
    startedAt
  };
  let db: DatabaseSync | undefined;
  let transactionActive = false;
  try {
    const detectedVersion = readDatabaseSchemaVersion(databasePath);
    if (![1, SOURCE_ARCHIVE_SCHEMA_VERSION].includes(detectedVersion)) {
      throw new Error(`MIGRATION_PREFLIGHT_FAILED:unsupported_version_${detectedVersion}`);
    }
    validateMigrationDatabase(databasePath, detectedVersion);
    db = new DatabaseSync(databasePath);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000");
    const metadata = db.prepare("SELECT database_id, schema_version FROM database_metadata WHERE metadata_key='primary'").get() as {
      database_id: string;
      schema_version: number;
    };
    base.fromVersion = metadata.schema_version;
    if (metadata.schema_version === SOURCE_ARCHIVE_SCHEMA_VERSION) {
      return {
        ...base,
        status: "not_required",
        reasonCode: "MIGRATION_NOT_REQUIRED",
        backupValidated: true,
        finishedAt: new Date().toISOString(),
        message: "Source Archive schema is already current."
      };
    }
    if (metadata.schema_version !== 1) throw new Error(`MIGRATION_PREFLIGHT_FAILED:unsupported_version_${metadata.schema_version}`);
    if (input.simulateBackupFailure) throw new Error("MIGRATION_BACKUP_FAILED:simulated");
    const backupPath = migrationBackupPath(databasePath, input.now ? new Date(input.now) : new Date());
    base.backupPath = backupPath;
    db.exec(`VACUUM INTO ${sqliteString(backupPath)}`);
    if (input.simulateBackupValidationFailure) throw new Error("MIGRATION_BACKUP_VALIDATION_FAILED:simulated");
    validateMigrationDatabase(backupPath, 1);
    base.backupValidated = true;

    db.exec("BEGIN IMMEDIATE");
    transactionActive = true;
    db.exec(schemaV2Sql);
    db.prepare(`UPDATE source_system_bindings
      SET connection_label=COALESCE(connection_label, server_title),
          server_title=NULL,
          server_title_status='unverified'`).run();
    const versions = db.prepare(`SELECT v.source_object_version_id, v.source_object_id, v.content_hash,
      v.created_at, o.object_key, b.server_identity, p.compressed_payload
      FROM source_object_versions v
      JOIN source_objects o ON o.source_object_id=v.source_object_id
      JOIN source_payloads p ON p.source_object_version_id=v.source_object_version_id
      LEFT JOIN source_system_bindings b ON b.source_system=o.source_system
      ORDER BY v.created_at, v.source_object_version_id`).all() as Array<{
        source_object_version_id: string;
        source_object_id: string;
        content_hash: string;
        created_at: string;
        object_key: string;
        server_identity: string | null;
        compressed_payload: Uint8Array;
      }>;
    base.scannedVersions = versions.length;
    for (const version of versions) {
      const bytes = gunzipSync(Buffer.from(version.compressed_payload));
      const archiveHash = crypto.createHash("sha256").update(bytes).digest("hex");
      if (archiveHash !== version.content_hash) throw new Error(`PAYLOAD_ARCHIVE_HASH_MISMATCH:${version.source_object_version_id}`);
      const rawJson = JSON.parse(bytes.toString("utf8")) as unknown;
      const projection = buildStableSourceProjection(rawJson, version.server_identity ?? "");
      db.prepare(`UPDATE source_object_versions
        SET stable_version_hash=?, version_identity_status='legacy_unverified'
        WHERE source_object_version_id=?`).run(projection.stableVersionHash, version.source_object_version_id);
      base.stableHashBackfilled += 1;
      const eventResult = insertActivityEvents(
        db, version.source_object_id, version.source_object_version_id, rawJson,
        version.server_identity ?? "", version.object_key, version.created_at
      );
      base.activityEventsInserted += eventResult.inserted;
      base.activityEventsExisting += eventResult.existing;
      base.payloadsUnmodified += 1;
    }
    if (input.simulateFailureAfterBackfill) throw new Error("MIGRATION_FAILED:simulated_after_backfill");
    const groups = db.prepare(`SELECT source_object_id, stable_version_hash, GROUP_CONCAT(source_object_version_id) AS version_ids
      FROM source_object_versions
      WHERE stable_version_hash IS NOT NULL
      GROUP BY source_object_id, stable_version_hash HAVING COUNT(*) > 1
      ORDER BY source_object_id, stable_version_hash`).all() as Array<{
        source_object_id: string;
        stable_version_hash: string;
        version_ids: string;
      }>;
    base.legacyDuplicateGroups = groups.map((group) => ({
      sourceObjectId: group.source_object_id,
      stableVersionHash: group.stable_version_hash,
      versionIds: group.version_ids.split(",").sort()
    }));
    const appliedAt = utcTimestamp(input.now);
    db.prepare(`INSERT INTO schema_migrations
      (migration_id, database_id, from_version, to_version, migration_name, checksum, applied_at, app_version, status)
      VALUES (?, ?, 1, 2, 'stable_identity_and_activity_events', ?, ?, ?, 'applied')`).run(
      crypto.randomUUID(), metadata.database_id,
      crypto.createHash("sha256").update(schemaV2Sql).digest("hex"), appliedAt, input.appVersion
    );
    db.prepare("UPDATE database_metadata SET schema_version=2, updated_at=? WHERE metadata_key='primary'").run(appliedAt);
    if (db.prepare("PRAGMA foreign_key_check").all().length > 0) throw new Error("MIGRATION_FAILED:foreign_key_check");
    db.exec("COMMIT");
    transactionActive = false;
    db.close();
    db = undefined;
    validateMigrationDatabase(databasePath, SOURCE_ARCHIVE_SCHEMA_VERSION);
    return {
      ...base,
      status: "completed",
      reasonCode: "MIGRATION_COMPLETED",
      finishedAt: new Date().toISOString(),
      message: "Source Archive schema migrated from v1 to v2 with a validated backup."
    };
  } catch (error) {
    if (transactionActive) {
      try { db?.exec("ROLLBACK"); } catch { /* Preserve the migration error. */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    const reasonCode = message.startsWith("MIGRATION_BACKUP_VALIDATION_FAILED") ? "MIGRATION_BACKUP_VALIDATION_FAILED"
      : message.startsWith("MIGRATION_BACKUP_FAILED") ? "MIGRATION_BACKUP_FAILED"
        : message.startsWith("MIGRATION_PREFLIGHT_FAILED") ? "MIGRATION_PREFLIGHT_FAILED"
          : "MIGRATION_FAILED";
    return {
      ...base,
      status: "failed",
      reasonCode,
      finishedAt: new Date().toISOString(),
      message
    };
  } finally {
    try { db?.close(); } catch { /* Migration cleanup. */ }
  }
}

export function updateJiraBindingMetadata(input: {
  databasePath: string;
  serverIdentity: string;
  serverTitle?: string;
  serverTitleStatus?: "verified" | "unverified";
  connectionLabel?: string;
  observedAt?: string;
}) {
  const compatibility = checkDatabaseCompatibility(input.databasePath, input.serverIdentity);
  if (compatibility.status !== "READY") return { ok: false, reasonCode: compatibility.status };
  const db = new DatabaseSync(path.resolve(input.databasePath));
  try {
    db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
    const result = db.prepare(`UPDATE source_system_bindings
      SET connection_label=COALESCE(?, connection_label),
          server_title=CASE WHEN ?='verified' THEN ? ELSE server_title END,
          server_title_status=CASE WHEN ?='verified' THEN 'verified' ELSE server_title_status END,
          last_verified_at=?
      WHERE source_system='jira' AND server_identity=?`).run(
      input.connectionLabel || null,
      input.serverTitleStatus ?? "unverified",
      input.serverTitle || null,
      input.serverTitleStatus ?? "unverified",
      utcTimestamp(input.observedAt),
      input.serverIdentity
    );
    db.exec("COMMIT");
    return { ok: Number(result.changes) > 0, reasonCode: Number(result.changes) > 0 ? "BINDING_METADATA_UPDATED" : "BINDING_NOT_FOUND" };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Preserve the metadata update error. */ }
    return { ok: false, reasonCode: "BINDING_METADATA_UPDATE_FAILED", message: error instanceof Error ? error.message : String(error) };
  } finally {
    db.close();
  }
}

export type StoreSourceSnapshotInput = {
  sourceSystem: "jira" | "confluence";
  objectType: "issue" | "page";
  objectKey: string;
  rawJson: unknown;
  serverIdentity?: string;
  sourceVersionNumber?: number | null;
  sourceUpdatedAt?: string | null;
  observedAt?: string;
  importRef: {
    sourceBundleName: string;
    sourceFileName: string;
    sourceJsonPath: string;
  };
  simulateFailureAfterPayload?: boolean;
  simulateFailureAfterVersion?: boolean;
  simulateFailureAtImportRef?: boolean;
};

type StoredSnapshot = {
  sourceObjectId: string;
  sourceObjectVersionId: string;
  contentHash: string;
  archivePayloadSha256: string;
  stableVersionHash: string;
  createdObject: boolean;
  createdVersion: boolean;
  createdPayload: boolean;
  createdImportRef: boolean;
  matchedExistingVersionId: string | null;
  comparedVersionId: string | null;
  meaningfulChangedPaths: string[];
  stableProjection: StableProjectionResult;
  activityEventsInserted: number;
  activityEventsExisting: number;
  uncompressedSizeBytes: number;
  compressedSizeBytes: number;
};

function storeSnapshotInTransaction(db: DatabaseSync, input: StoreSourceSnapshotInput): StoredSnapshot {
  const objectKey = normalizeSourceObjectKey(input.sourceSystem, input.objectType, input.objectKey);
  const observedAt = utcTimestamp(input.observedAt);
  const canonical = canonicalJson(input.rawJson);
  const uncompressed = Buffer.from(canonical, "utf8");
  const compressed = gzipSync(uncompressed);
  const archivePayloadSha256 = crypto.createHash("sha256").update(uncompressed).digest("hex");
  const stableProjection = buildStableSourceProjection(input.rawJson, input.serverIdentity ?? "");
  const stableVersionHash = stableProjection.stableVersionHash;
  const sourceVersionNumber = input.sourceSystem === "jira" ? null : input.sourceVersionNumber ?? null;
  const existingObject = db.prepare(`SELECT source_object_id FROM source_objects
    WHERE source_system=? AND object_type=? AND object_key=?`).get(
    input.sourceSystem, input.objectType, objectKey
  ) as { source_object_id: string } | undefined;
  const sourceObjectId = existingObject?.source_object_id ?? crypto.randomUUID();
  const existingVersion = existingObject
    ? db.prepare(`SELECT source_object_version_id FROM source_object_versions
        WHERE source_object_id=? AND stable_version_hash=?
        ORDER BY created_at ASC, source_object_version_id ASC LIMIT 1`)
      .get(sourceObjectId, stableVersionHash) as { source_object_version_id: string } | undefined
    : undefined;
  if (existingVersion) {
    db.prepare("UPDATE source_objects SET last_seen_at=? WHERE source_object_id=?").run(observedAt, sourceObjectId);
    db.prepare("UPDATE source_object_versions SET last_seen_at=? WHERE source_object_version_id=?").run(
      observedAt, existingVersion.source_object_version_id
    );
    const payload = db.prepare(`SELECT p.compressed_payload, p.uncompressed_size_bytes, p.compressed_size_bytes, v.content_hash
      FROM source_payloads p JOIN source_object_versions v
      ON v.source_object_version_id=p.source_object_version_id
      WHERE p.source_object_version_id=?`).get(existingVersion.source_object_version_id) as {
        compressed_payload: Uint8Array;
        uncompressed_size_bytes: number;
        compressed_size_bytes: number;
        content_hash: string;
      } | undefined;
    if (!payload) throw new Error("PAYLOAD_READBACK_MISSING");
    const readbackBytes = gunzipSync(Buffer.from(payload.compressed_payload));
    if (crypto.createHash("sha256").update(readbackBytes).digest("hex") !== payload.content_hash) {
      throw new Error("PAYLOAD_ARCHIVE_HASH_MISMATCH");
    }
    return {
      sourceObjectId,
      sourceObjectVersionId: existingVersion.source_object_version_id,
      contentHash: payload.content_hash,
      archivePayloadSha256: payload.content_hash,
      stableVersionHash,
      createdObject: false,
      createdVersion: false,
      createdPayload: false,
      createdImportRef: false,
      matchedExistingVersionId: existingVersion.source_object_version_id,
      comparedVersionId: existingVersion.source_object_version_id,
      meaningfulChangedPaths: [],
      stableProjection,
      activityEventsInserted: 0,
      activityEventsExisting: 0,
      uncompressedSizeBytes: payload.uncompressed_size_bytes,
      compressedSizeBytes: payload.compressed_size_bytes
    };
  }

  let comparedVersionId: string | null = null;
  let changedPaths: string[] = [];
  if (existingObject) {
    const previous = db.prepare(`SELECT v.source_object_version_id, p.compressed_payload
      FROM source_object_versions v JOIN source_payloads p
      ON p.source_object_version_id=v.source_object_version_id
      WHERE v.source_object_id=?
      ORDER BY v.last_seen_at DESC, v.created_at DESC, v.source_object_version_id DESC LIMIT 1`).get(sourceObjectId) as {
        source_object_version_id: string;
        compressed_payload: Uint8Array;
      } | undefined;
    if (previous) {
      comparedVersionId = previous.source_object_version_id;
      const previousRaw = JSON.parse(gunzipSync(Buffer.from(previous.compressed_payload)).toString("utf8")) as unknown;
      const previousProjection = buildStableSourceProjection(previousRaw, input.serverIdentity ?? "");
      changedPaths = meaningfulChangedPaths(previousProjection.projection, stableProjection.projection);
      if (changedPaths.length === 0) throw new Error("STABLE_HASH_DIFF_WITHOUT_MEANINGFUL_PATH");
    }
    db.prepare("UPDATE source_objects SET last_seen_at=? WHERE source_object_id=?").run(observedAt, sourceObjectId);
  } else {
    db.prepare(`INSERT INTO source_objects
      (source_object_id, source_system, object_type, object_key, first_seen_at, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      sourceObjectId, input.sourceSystem, input.objectType, objectKey, observedAt, observedAt, observedAt
    );
  }
  const versionId = crypto.randomUUID();
  db.prepare(`INSERT INTO source_object_versions
    (source_object_version_id, source_object_id, content_hash, stable_version_hash, version_identity_status,
     source_version_number, source_updated_at, first_seen_at, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, 'stable_verified', ?, ?, ?, ?, ?)`).run(
    versionId, sourceObjectId, archivePayloadSha256, stableVersionHash, sourceVersionNumber,
    input.sourceUpdatedAt ? utcTimestamp(input.sourceUpdatedAt) : null,
    observedAt, observedAt, observedAt
  );
  if (input.simulateFailureAfterVersion) throw new Error("SIMULATED_FAILURE_AFTER_VERSION");
  db.prepare(`INSERT INTO source_payloads
    (source_payload_id, source_object_version_id, payload_format, text_encoding, compression, compressed_payload,
     uncompressed_size_bytes, compressed_size_bytes, stored_at)
    VALUES (?, ?, 'json', 'utf-8', 'gzip', ?, ?, ?, ?)`).run(
    crypto.randomUUID(), versionId, compressed, uncompressed.byteLength, compressed.byteLength, observedAt
  );
  if (input.simulateFailureAfterPayload) throw new Error("SIMULATED_TRANSACTION_FAILURE");
  if (input.simulateFailureAtImportRef) throw new Error("SIMULATED_FAILURE_AT_IMPORT_REF");
  const importRefResult = db.prepare(`INSERT INTO source_import_refs
    (source_import_ref_id, source_object_version_id, source_bundle_name, source_file_name, source_json_path, first_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), versionId, input.importRef.sourceBundleName,
    input.importRef.sourceFileName, input.importRef.sourceJsonPath, observedAt
  );
  const payload = db.prepare(`SELECT compressed_payload, uncompressed_size_bytes, compressed_size_bytes
    FROM source_payloads WHERE source_object_version_id=?`).get(versionId) as {
      compressed_payload: Uint8Array;
      uncompressed_size_bytes: number;
      compressed_size_bytes: number;
    } | undefined;
  if (!payload) throw new Error("PAYLOAD_READBACK_MISSING");
  const readback = gunzipSync(Buffer.from(payload.compressed_payload)).toString("utf8");
  if (readback !== canonical || canonicalJson(JSON.parse(readback)) !== canonical) {
    throw new Error("PAYLOAD_VERIFICATION_FAILED");
  }
  if (crypto.createHash("sha256").update(readback, "utf8").digest("hex") !== archivePayloadSha256) {
    throw new Error("PAYLOAD_ARCHIVE_HASH_MISMATCH");
  }
  if (payload.uncompressed_size_bytes !== uncompressed.byteLength
    || payload.compressed_size_bytes !== Buffer.from(payload.compressed_payload).byteLength) {
    throw new Error("PAYLOAD_SIZE_MISMATCH");
  }
  const importRef = db.prepare(`SELECT source_import_ref_id FROM source_import_refs
    WHERE source_object_version_id=? AND source_bundle_name=? AND source_file_name=? AND source_json_path=?`).get(
    versionId, input.importRef.sourceBundleName, input.importRef.sourceFileName, input.importRef.sourceJsonPath
  );
  if (!importRef) throw new Error("IMPORT_REF_READBACK_MISSING");
  const activity = input.sourceSystem === "jira"
    ? insertActivityEvents(db, sourceObjectId, versionId, input.rawJson, input.serverIdentity ?? "", objectKey, observedAt)
    : { inserted: 0, existing: 0 };
  return {
    sourceObjectId,
    sourceObjectVersionId: versionId,
    contentHash: archivePayloadSha256,
    archivePayloadSha256,
    stableVersionHash,
    createdObject: !existingObject,
    createdVersion: true,
    createdPayload: true,
    createdImportRef: Number(importRefResult.changes) > 0,
    matchedExistingVersionId: null,
    comparedVersionId,
    meaningfulChangedPaths: changedPaths,
    stableProjection,
    activityEventsInserted: activity.inserted,
    activityEventsExisting: activity.existing,
    uncompressedSizeBytes: uncompressed.byteLength,
    compressedSizeBytes: compressed.byteLength
  };
}

export class SourceArchiveRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(path.resolve(databasePath));
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000");
  }

  close() {
    this.db.close();
  }

  storeSnapshot(input: StoreSourceSnapshotInput) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const stored = storeSnapshotInTransaction(this.db, input);
      this.db.exec("COMMIT");
      return stored;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  readSnapshot(sourceObjectVersionId: string) {
    const row = this.db.prepare(`SELECT v.content_hash, v.stable_version_hash, v.version_identity_status,
      v.source_version_number, v.source_updated_at,
      p.compressed_payload, p.uncompressed_size_bytes, p.compressed_size_bytes
      FROM source_object_versions v
      JOIN source_payloads p ON p.source_object_version_id=v.source_object_version_id
      WHERE v.source_object_version_id=?`).get(sourceObjectVersionId) as {
        content_hash: string;
        stable_version_hash: string | null;
        version_identity_status: string;
        source_version_number: number | null;
        source_updated_at: string | null;
        compressed_payload: Uint8Array;
        uncompressed_size_bytes: number;
        compressed_size_bytes: number;
      } | undefined;
    if (!row) return null;
    const canonical = gunzipSync(Buffer.from(row.compressed_payload)).toString("utf8");
    if (crypto.createHash("sha256").update(canonical).digest("hex") !== row.content_hash) {
      throw new Error("PAYLOAD_HASH_MISMATCH");
    }
    return {
      rawJson: JSON.parse(canonical),
      canonicalJson: canonical,
      contentHash: row.content_hash,
      archivePayloadSha256: row.content_hash,
      stableVersionHash: row.stable_version_hash,
      versionIdentityStatus: row.version_identity_status,
      sourceVersionNumber: row.source_version_number,
      sourceUpdatedAt: row.source_updated_at,
      uncompressedSizeBytes: row.uncompressed_size_bytes,
      compressedSizeBytes: row.compressed_size_bytes
    };
  }

  counts() {
    const value = (table: string) => Number((this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return Object.fromEntries(SOURCE_ARCHIVE_TABLES.map((table) => [table, value(table)])) as Record<(typeof SOURCE_ARCHIVE_TABLES)[number], number>;
  }
}

export type SourceArchiveBatchItem = StoreSourceSnapshotInput & {
  eligibility: "eligible" | "partial" | "failed" | "invalid";
  loadRawJson?: () => unknown;
};

export type SourceArchiveBatchWriteInput = {
  operationId: string;
  databasePath: string;
  jira: {
    serverIdentity: string;
    baseUrlNormalized: string;
    serverTitle?: string;
    serverTitleStatus?: "verified" | "unverified";
    connectionLabel?: string;
  };
  items: SourceArchiveBatchItem[];
  observedAt?: string;
  busyRetryLimit?: number;
};

export type SourceArchiveBatchOutcome = {
  objectKey: string;
  outcome: "new_object" | "new_version" | "duplicate" | "excluded" | "invalid" | "failed_rolled_back";
  reasonCode: string;
  sourceObjectId: string;
  sourceObjectVersionId: string;
  contentHash: string;
  archivePayloadSha256?: string;
  stableVersionHash?: string;
  matchedExistingVersionId?: string | null;
  comparedVersionId?: string | null;
  meaningfulChangedPaths?: string[];
  excludedPaths?: string[];
  normalizedPaths?: string[];
  volatileRulesApplied?: unknown[];
  activityEventsInserted?: number;
  activityEventsExisting?: number;
};

function emptyBatchSummary() {
  return {
    eligible: 0,
    newObjects: 0,
    newVersions: 0,
    newPayloads: 0,
    newImportRefs: 0,
    existing: 0,
    duplicates: 0,
    excludedPartial: 0,
    excludedFailed: 0,
    invalid: 0,
    writeFailed: 0,
    rolledBack: 0,
    activityEventsInserted: 0,
    activityEventsExisting: 0
  };
}

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("SOURCE_SERVER_IDENTITY_MISSING");
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
}

function waitSync(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function beginImmediateWithRetry(db: DatabaseSync, retryLimit: number) {
  let retries = 0;
  for (;;) {
    try {
      db.exec("BEGIN IMMEDIATE");
      return retries;
    } catch (error) {
      if (errorStatus(error) !== "LOCKED" || retries >= retryLimit) throw error;
      waitSync(50 * (retries + 1));
      retries += 1;
    }
  }
}

function sourceUpdatedAtFromPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const issue = (value as Record<string, unknown>).issue;
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) return null;
  const fields = (issue as Record<string, unknown>).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const updated = (fields as Record<string, unknown>).updated;
  return typeof updated === "string" && updated.trim() ? updated : null;
}

export function writeSourceArchiveBatch(input: SourceArchiveBatchWriteInput) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const configuredDatabasePath = String(input.databasePath || "").trim();
  const databasePath = configuredDatabasePath ? path.resolve(configuredDatabasePath) : "";
  const operationId = String(input.operationId || "").trim();
  const serverIdentity = String(input.jira.serverIdentity || "").trim();
  if (!operationId) throw new Error("SAVE_OPERATION_INVALID");
  if (!databasePath || !path.isAbsolute(databasePath)) {
    return {
      ok: false, operationId, status: "preflight_failed", reasonCode: "DATABASE_PATH_MISSING",
      message: "Current database path is missing.", targetDatabase: databasePath, databaseId: "",
      boundJiraServer: "", preflightStatus: "NOT_CONFIGURED", outcomes: [] as SourceArchiveBatchOutcome[],
      summary: emptyBatchSummary(),
      retries: 0, readbackVerified: false, foreignKeyCheck: "not_run", startedAt,
      finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
    };
  }
  if (!serverIdentity || !String(input.jira.baseUrlNormalized || "").trim()) {
    return {
      ok: false, operationId, status: "preflight_failed", reasonCode: "SOURCE_SERVER_IDENTITY_MISSING",
      message: "Verified Jira server identity or base URL is missing.", targetDatabase: databasePath,
      databaseId: "", boundJiraServer: "", preflightStatus: "BLOCKED", outcomes: [] as SourceArchiveBatchOutcome[],
      summary: emptyBatchSummary(),
      retries: 0, readbackVerified: false, foreignKeyCheck: "not_run", startedAt,
      finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
    };
  }
  let baseUrlNormalized = "";
  try {
    baseUrlNormalized = normalizeBaseUrl(input.jira.baseUrlNormalized);
  } catch {
    return {
      ok: false, operationId, status: "preflight_failed", reasonCode: "SOURCE_SERVER_IDENTITY_MISSING",
      message: "Verified Jira base URL is invalid.", targetDatabase: databasePath,
      databaseId: "", boundJiraServer: "", preflightStatus: "BLOCKED", outcomes: [] as SourceArchiveBatchOutcome[],
      summary: emptyBatchSummary(),
      retries: 0, readbackVerified: false, foreignKeyCheck: "not_run", startedAt,
      finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
    };
  }
  const compatibility = checkDatabaseCompatibility(databasePath, serverIdentity);
  if (compatibility.status !== "READY") {
    const reasonCode = compatibility.status === "JIRA_INSTANCE_MISMATCH"
      ? "SOURCE_SERVER_MISMATCH"
      : compatibility.status === "MISSING" || compatibility.status === "NOT_CONFIGURED"
        ? "DATABASE_PATH_MISSING"
        : compatibility.status === "LOCKED"
          ? "DATABASE_BUSY"
          : compatibility.status === "PERMISSION_DENIED" || compatibility.status === "READY_READ_ONLY"
            ? "DATABASE_PERMISSION_DENIED"
            : compatibility.status === "CORRUPTED" || compatibility.status === "INVALID_SQLITE"
              ? "DATABASE_CORRUPTED"
              : compatibility.status;
    return {
      ok: false,
      operationId,
      status: "preflight_failed",
      reasonCode,
      message: compatibility.message,
      targetDatabase: databasePath,
      databaseId: compatibility.databaseId,
      boundJiraServer: compatibility.sourceBinding,
      preflightStatus: compatibility.status,
      outcomes: [] as SourceArchiveBatchOutcome[],
      summary: emptyBatchSummary(),
      retries: 0,
      readbackVerified: false,
      foreignKeyCheck: "not_run",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs
    };
  }

  const outcomes: SourceArchiveBatchOutcome[] = [];
  const summary = emptyBatchSummary();
  const eligibleItems: SourceArchiveBatchItem[] = [];
  for (const item of input.items) {
    if (item.eligibility === "eligible") {
      try {
        normalizeSourceObjectKey(item.sourceSystem, item.objectType, item.objectKey);
        eligibleItems.push(item);
        summary.eligible += 1;
      } catch {
        summary.invalid += 1;
        outcomes.push({ objectKey: item.objectKey, outcome: "invalid", reasonCode: "ISSUE_KEY_INVALID", sourceObjectId: "", sourceObjectVersionId: "", contentHash: "" });
      }
    } else if (item.eligibility === "partial") {
      summary.excludedPartial += 1;
      outcomes.push({ objectKey: item.objectKey, outcome: "excluded", reasonCode: "ISSUE_PARTIAL_EXCLUDED", sourceObjectId: "", sourceObjectVersionId: "", contentHash: "" });
    } else if (item.eligibility === "failed") {
      summary.excludedFailed += 1;
      outcomes.push({ objectKey: item.objectKey, outcome: "excluded", reasonCode: "ISSUE_FAILED_EXCLUDED", sourceObjectId: "", sourceObjectVersionId: "", contentHash: "" });
    } else {
      summary.invalid += 1;
      outcomes.push({ objectKey: item.objectKey, outcome: "invalid", reasonCode: "ISSUE_KEY_INVALID", sourceObjectId: "", sourceObjectVersionId: "", contentHash: "" });
    }
  }

  let db: DatabaseSync | undefined;
  let transactionActive = false;
  let retries = 0;
  let bindingCreated = false;
  try {
    db = new DatabaseSync(databasePath);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000");
    const foreignKeys = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number };
    if (Number(foreignKeys?.foreign_keys) !== 1) throw new Error("FOREIGN_KEYS_DISABLED");
    const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string };
    if (integrity?.integrity_check !== "ok") throw new Error("DATABASE_CORRUPTED");
    const metadata = db.prepare("SELECT database_id FROM database_metadata WHERE metadata_key='primary'").get() as { database_id: string };
    const binding = db.prepare(`SELECT binding_id, server_identity, base_url_normalized
      FROM source_system_bindings WHERE database_id=? AND source_system='jira'`).get(metadata.database_id) as {
        binding_id: string;
        server_identity: string;
        base_url_normalized: string;
      } | undefined;
    if (binding && (binding.server_identity !== serverIdentity || normalizeBaseUrl(binding.base_url_normalized) !== baseUrlNormalized)) {
      return {
        ok: false, operationId, status: "preflight_failed", reasonCode: "SOURCE_SERVER_MISMATCH",
        message: "Current database is bound to a different Jira server.", targetDatabase: databasePath,
        databaseId: metadata.database_id, boundJiraServer: binding.server_identity, preflightStatus: "SOURCE_SERVER_MISMATCH",
        outcomes: [] as SourceArchiveBatchOutcome[], summary: { ...summary, eligible: 0 }, retries: 0,
        readbackVerified: false, foreignKeyCheck: "not_run", startedAt,
        finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
      };
    }
    if (eligibleItems.length === 0) {
      return {
        ok: true, operationId, status: "completed_no_writes", reasonCode: "NO_ELIGIBLE_ISSUES",
        message: "No eligible Jira issue snapshots were available for database write.", targetDatabase: databasePath,
        databaseId: metadata.database_id, boundJiraServer: binding?.server_identity ?? "", preflightStatus: "READY",
        outcomes, summary, retries: 0, readbackVerified: true, foreignKeyCheck: "passed", startedAt,
        finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
      };
    }
    retries = beginImmediateWithRetry(db, Math.max(0, Math.min(5, input.busyRetryLimit ?? 2)));
    transactionActive = true;
    if (!binding) {
      const observedAt = utcTimestamp(input.observedAt);
      db.prepare(`INSERT INTO source_system_bindings
        (binding_id, database_id, source_system, server_identity, base_url_normalized, server_title,
         connection_label, server_title_status, first_bound_at, last_verified_at)
        VALUES (?, ?, 'jira', ?, ?, ?, ?, ?, ?, ?)`).run(
        crypto.randomUUID(), metadata.database_id, serverIdentity, baseUrlNormalized,
        input.jira.serverTitle || null, input.jira.connectionLabel || null,
        input.jira.serverTitleStatus ?? (input.jira.serverTitle ? "verified" : "unverified"), observedAt, observedAt
      );
      bindingCreated = true;
    } else {
      db.prepare(`UPDATE source_system_bindings SET last_verified_at=?,
        server_title=CASE WHEN ?='verified' THEN ? ELSE server_title END,
        server_title_status=CASE WHEN ?='verified' THEN 'verified' ELSE server_title_status END,
        connection_label=COALESCE(?, connection_label)
        WHERE binding_id=?`).run(
        utcTimestamp(input.observedAt), input.jira.serverTitleStatus ?? "unverified",
        input.jira.serverTitle || null, input.jira.serverTitleStatus ?? "unverified",
        input.jira.connectionLabel || null, binding.binding_id
      );
    }

    let successCount = 0;
    for (let index = 0; index < eligibleItems.length; index += 1) {
      const item = eligibleItems[index];
      const savepoint = `issue_${index}`;
      db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const rawJson = item.loadRawJson ? item.loadRawJson() : item.rawJson;
        if (rawJson === undefined) throw new Error("RAW_PAYLOAD_MISSING");
        const stored = storeSnapshotInTransaction(db, {
          ...item,
          rawJson,
          serverIdentity,
          sourceUpdatedAt: item.sourceUpdatedAt ?? sourceUpdatedAtFromPayload(rawJson),
          observedAt: item.observedAt ?? input.observedAt
        });
        const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
        if (foreignKeyViolations.length > 0) throw new Error("FOREIGN_KEY_CHECK_FAILED");
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        successCount += 1;
        summary.newObjects += stored.createdObject ? 1 : 0;
        summary.newVersions += stored.createdVersion ? 1 : 0;
        summary.newPayloads += stored.createdPayload ? 1 : 0;
        summary.newImportRefs += stored.createdImportRef ? 1 : 0;
        summary.existing += stored.createdVersion ? 0 : 1;
        summary.duplicates += stored.createdVersion ? 0 : 1;
        summary.activityEventsInserted += stored.activityEventsInserted;
        summary.activityEventsExisting += stored.activityEventsExisting;
        outcomes.push({
          objectKey: item.objectKey,
          outcome: stored.createdObject ? "new_object" : stored.createdVersion ? "new_version" : "duplicate",
          reasonCode: stored.createdVersion ? "DATABASE_WRITE_SUCCESS" : "DUPLICATE_EXISTING",
          sourceObjectId: stored.sourceObjectId,
          sourceObjectVersionId: stored.sourceObjectVersionId,
          contentHash: stored.contentHash,
          archivePayloadSha256: stored.archivePayloadSha256,
          stableVersionHash: stored.stableVersionHash,
          matchedExistingVersionId: stored.matchedExistingVersionId,
          comparedVersionId: stored.comparedVersionId,
          meaningfulChangedPaths: stored.meaningfulChangedPaths,
          excludedPaths: stored.stableProjection.excludedPaths,
          normalizedPaths: stored.stableProjection.normalizedPaths,
          volatileRulesApplied: stored.stableProjection.volatileRulesApplied,
          activityEventsInserted: stored.activityEventsInserted,
          activityEventsExisting: stored.activityEventsExisting
        });
      } catch (error) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
        summary.writeFailed += 1;
        summary.rolledBack += 1;
        outcomes.push({
          objectKey: item.objectKey,
          outcome: "failed_rolled_back",
          reasonCode: errorStatus(error) === "LOCKED" ? "DATABASE_BUSY"
            : error instanceof Error && error.message.startsWith("STABLE_HASH_DIFF_WITHOUT_MEANINGFUL_PATH")
              ? "STABLE_HASH_DIFF_WITHOUT_MEANINGFUL_PATH"
              : error instanceof Error && error.message.startsWith("STABLE_PROJECTION_FAILED")
                ? "STABLE_PROJECTION_FAILED"
                : error instanceof Error && error.message.startsWith("ACTIVITY_EVENT_INSERT_FAILED")
                  ? "ACTIVITY_EVENT_INSERT_FAILED"
                  : error instanceof Error && error.message.startsWith("ACTIVITY_EVENT_PARSE_FAILED")
                    ? "ACTIVITY_EVENT_PARSE_FAILED"
                    : "DATABASE_WRITE_FAILED",
          sourceObjectId: "",
          sourceObjectVersionId: "",
          contentHash: ""
        });
      }
    }
    if (successCount === 0 && bindingCreated) {
      db.exec("ROLLBACK");
      transactionActive = false;
      return {
        ok: false, operationId, status: "failed", reasonCode: "TRANSACTION_ROLLED_BACK",
        message: "All eligible issue writes failed; the first Jira binding was rolled back.", targetDatabase: databasePath,
        databaseId: metadata.database_id, boundJiraServer: "", preflightStatus: "READY", outcomes, summary,
        retries, readbackVerified: false, foreignKeyCheck: "passed", startedAt,
        finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
      };
    }
    if (successCount > 0) {
      db.prepare("UPDATE database_metadata SET updated_at=? WHERE metadata_key='primary'").run(utcTimestamp(input.observedAt));
    }
    const finalForeignKeys = db.prepare("PRAGMA foreign_key_check").all();
    if (finalForeignKeys.length > 0) throw new Error("FOREIGN_KEY_CHECK_FAILED");
    db.exec("COMMIT");
    transactionActive = false;
    const finishedAt = new Date().toISOString();
    return {
      ok: summary.writeFailed === 0,
      operationId,
      status: summary.writeFailed === 0 ? "completed" : "completed_with_errors",
      reasonCode: summary.writeFailed === 0 ? "DATABASE_WRITE_SUCCESS" : "DATABASE_WRITE_PARTIAL_SUCCESS",
      message: summary.writeFailed === 0 ? "Eligible Jira issue snapshots were stored and verified." : "Some eligible issue writes were rolled back.",
      targetDatabase: databasePath,
      databaseId: metadata.database_id,
      boundJiraServer: serverIdentity,
      baseUrlNormalized,
      preflightStatus: "READY",
      bindingCreated,
      outcomes,
      summary,
      retries,
      readbackVerified: true,
      foreignKeyCheck: "passed",
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedMs
    };
  } catch (error) {
    if (transactionActive) {
      try { db?.exec("ROLLBACK"); } catch { /* Preserve the primary failure. */ }
    }
    const reasonCode = errorStatus(error) === "LOCKED" ? "DATABASE_BUSY"
      : /CORRUPTED|integrity/i.test(error instanceof Error ? error.message : String(error)) ? "DATABASE_CORRUPTED"
        : "DATABASE_WRITE_FAILED";
    return {
      ok: false, operationId, status: "failed", reasonCode,
      message: reasonCode === "DATABASE_BUSY" ? "Current database is busy or locked." : "Database write failed and was rolled back.",
      targetDatabase: databasePath, databaseId: compatibility.databaseId, boundJiraServer: compatibility.sourceBinding,
      preflightStatus: compatibility.status, outcomes, summary, retries, readbackVerified: false,
      foreignKeyCheck: "failed", startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs
    };
  } finally {
    try { db?.close(); } catch { /* Database cleanup. */ }
  }
}
