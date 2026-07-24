import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import type { DatabaseRuntimeState, DatabaseRuntimeStatus } from "./runtimeStatus.js";

export const SOURCE_ARCHIVE_SCHEMA_VERSION = 1;
export const SOURCE_ARCHIVE_PRODUCT_ID = "jira_activity_analyzer";
export const SOURCE_ARCHIVE_DATABASE_TYPE = "source_archive_db";

export const SOURCE_ARCHIVE_TABLES = [
  "database_metadata",
  "schema_migrations",
  "source_system_bindings",
  "source_objects",
  "source_object_versions",
  "source_payloads",
  "source_import_refs"
] as const;

const schemaSql = `
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

const volatileCanonicalKeys = new Set([
  "exportedAt", "generatedAt", "bundleName", "fileName", "jsonPath",
  "packagePath", "outputPath", "executionTimeMs", "durationMs"
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

function validateSchema(db: DatabaseSync) {
  const tableRows = rows<{ name: string }>(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
  const tableNames = new Set(tableRows.map((row) => row.name));
  const missingTables = SOURCE_ARCHIVE_TABLES.filter((name) => !tableNames.has(name));
  if (missingTables.length) return { ok: false as const, missing: missingTables, reason: "SCHEMA_INCOMPLETE" as const };

  const requiredIndexes = [
    "idx_schema_migrations_database",
    "idx_source_bindings_identity",
    "idx_source_objects_last_seen",
    "idx_source_versions_object_seen",
    "idx_source_versions_updated",
    "idx_source_import_refs_bundle"
  ];
  const indexRows = rows<{ name: string }>(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all());
  const indexNames = new Set(indexRows.map((row) => row.name));
  const missingIndexes = requiredIndexes.filter((name) => !indexNames.has(name));
  if (missingIndexes.length) return { ok: false as const, missing: missingIndexes, reason: "SCHEMA_INCOMPLETE" as const };

  const foreignKeyTables = ["schema_migrations", "source_system_bindings", "source_object_versions", "source_payloads", "source_import_refs"];
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
    const schema = validateSchema(db);
    if (!schema.ok) return baseDatabaseState(schema.reason, resolved, `Required schema objects are missing: ${schema.missing.join(", ")}.`);
    const metadataRows = rows<{
      database_id: string; product_id: string; database_type: string; schema_version: number;
    }>(db.prepare("SELECT database_id, product_id, database_type, schema_version FROM database_metadata").all());
    if (metadataRows.length !== 1 || metadataRows[0].product_id !== SOURCE_ARCHIVE_PRODUCT_ID || metadataRows[0].database_type !== SOURCE_ARCHIVE_DATABASE_TYPE) {
      return baseDatabaseState("FOREIGN_DATABASE", resolved, "Database product metadata does not identify Jira Activity Analyzer Source Archive.");
    }
    const metadata = metadataRows[0];
    if (metadata.schema_version < SOURCE_ARCHIVE_SCHEMA_VERSION) {
      return { ...baseDatabaseState("MIGRATION_REQUIRED", resolved, "Database schema is older; migration is required but is not available in this version."), databaseId: metadata.database_id, schemaVersion: metadata.schema_version, canRead: true };
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
    db.exec(schemaSql);
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
      crypto.createHash("sha256").update(schemaSql).digest("hex"), now, input.appVersion
    );
    if (input.binding?.serverIdentity) {
      db.prepare(`INSERT INTO source_system_bindings
        (binding_id, database_id, source_system, server_identity, base_url_normalized, server_title, first_bound_at, last_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        crypto.randomUUID(), databaseId, input.binding.sourceSystem, input.binding.serverIdentity,
        input.binding.baseUrlNormalized, input.binding.serverTitle ?? null, now, now
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

export type StoreSourceSnapshotInput = {
  sourceSystem: "jira" | "confluence";
  objectType: "issue" | "page";
  objectKey: string;
  rawJson: unknown;
  sourceVersionNumber?: number | null;
  sourceUpdatedAt?: string | null;
  observedAt?: string;
  importRef: {
    sourceBundleName: string;
    sourceFileName: string;
    sourceJsonPath: string;
  };
  simulateFailureAfterPayload?: boolean;
};

export class SourceArchiveRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(path.resolve(databasePath));
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  close() {
    this.db.close();
  }

  storeSnapshot(input: StoreSourceSnapshotInput) {
    const objectKey = normalizeSourceObjectKey(input.sourceSystem, input.objectType, input.objectKey);
    const observedAt = utcTimestamp(input.observedAt);
    const canonical = canonicalJson(input.rawJson);
    const uncompressed = Buffer.from(canonical, "utf8");
    const compressed = gzipSync(uncompressed);
    const contentHash = crypto.createHash("sha256").update(uncompressed).digest("hex");
    const sourceVersionNumber = input.sourceSystem === "jira" ? null : input.sourceVersionNumber ?? null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO source_objects
        (source_object_id, source_system, object_type, object_key, first_seen_at, last_seen_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_system, object_type, object_key) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(
        crypto.randomUUID(), input.sourceSystem, input.objectType, objectKey, observedAt, observedAt, observedAt
      );
      const object = this.db.prepare(`SELECT source_object_id FROM source_objects
        WHERE source_system=? AND object_type=? AND object_key=?`).get(
        input.sourceSystem, input.objectType, objectKey
      ) as { source_object_id: string };
      const existingVersion = this.db.prepare(`SELECT source_object_version_id FROM source_object_versions
        WHERE source_object_id=? AND content_hash=?`).get(object.source_object_id, contentHash) as { source_object_version_id: string } | undefined;
      const versionId = existingVersion?.source_object_version_id ?? crypto.randomUUID();
      if (existingVersion) {
        this.db.prepare("UPDATE source_object_versions SET last_seen_at=? WHERE source_object_version_id=?").run(observedAt, versionId);
      } else {
        this.db.prepare(`INSERT INTO source_object_versions
          (source_object_version_id, source_object_id, content_hash, source_version_number, source_updated_at, first_seen_at, last_seen_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          versionId, object.source_object_id, contentHash, sourceVersionNumber,
          input.sourceUpdatedAt ? utcTimestamp(input.sourceUpdatedAt) : null,
          observedAt, observedAt, observedAt
        );
        this.db.prepare(`INSERT INTO source_payloads
          (source_payload_id, source_object_version_id, payload_format, text_encoding, compression, compressed_payload,
           uncompressed_size_bytes, compressed_size_bytes, stored_at)
          VALUES (?, ?, 'json', 'utf-8', 'gzip', ?, ?, ?, ?)`).run(
          crypto.randomUUID(), versionId, compressed, uncompressed.byteLength, compressed.byteLength, observedAt
        );
      }
      if (input.simulateFailureAfterPayload) throw new Error("SIMULATED_TRANSACTION_FAILURE");
      this.db.prepare(`INSERT OR IGNORE INTO source_import_refs
        (source_import_ref_id, source_object_version_id, source_bundle_name, source_file_name, source_json_path, first_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
        crypto.randomUUID(), versionId, input.importRef.sourceBundleName,
        input.importRef.sourceFileName, input.importRef.sourceJsonPath, observedAt
      );
      const payload = this.db.prepare("SELECT compressed_payload FROM source_payloads WHERE source_object_version_id=?").get(versionId) as { compressed_payload: Uint8Array };
      if (gunzipSync(Buffer.from(payload.compressed_payload)).toString("utf8") !== canonical) {
        throw new Error("PAYLOAD_VERIFICATION_FAILED");
      }
      this.db.exec("COMMIT");
      return {
        sourceObjectId: object.source_object_id,
        sourceObjectVersionId: versionId,
        contentHash,
        createdVersion: !existingVersion,
        uncompressedSizeBytes: uncompressed.byteLength,
        compressedSizeBytes: compressed.byteLength
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  readSnapshot(sourceObjectVersionId: string) {
    const row = this.db.prepare(`SELECT v.content_hash, v.source_version_number, v.source_updated_at,
      p.compressed_payload, p.uncompressed_size_bytes, p.compressed_size_bytes
      FROM source_object_versions v
      JOIN source_payloads p ON p.source_object_version_id=v.source_object_version_id
      WHERE v.source_object_version_id=?`).get(sourceObjectVersionId) as {
        content_hash: string;
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
