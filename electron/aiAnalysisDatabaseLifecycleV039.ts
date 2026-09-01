import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AI_DATABASE_SCHEMA_NAME,
  AI_DATABASE_SCHEMA_VERSION,
  aiDatabaseOverview,
  checkpointAiDatabase,
  initializeAiAnalysisDatabase
} from "./aiAnalysisDatabaseV038.js";

export type AiDatabaseLifecycleState =
  | "NOT_CREATED"
  | "CREATING"
  | "READY_EMPTY"
  | "PREFLIGHTING"
  | "PREFLIGHT_FAILED"
  | "PREVIEW_READY"
  | "IMPORTING"
  | "READY_WITH_DATA"
  | "MIGRATING"
  | "READ_ONLY_DIAGNOSTIC"
  | "ERROR";

type JsonRecord = Record<string, any>;

export type AiDatabaseLifecycleSnapshot = JsonRecord & {
  lifecycleState: AiDatabaseLifecycleState;
  databasePath: string;
  databaseDirectory: string;
  databaseFileName: string;
  schemaName: string;
  schemaVersion: number;
  exists: boolean;
  readOnly: boolean;
  canCreate: boolean;
  canImport: boolean;
  canQuery: boolean;
  errorCode?: string;
  message?: string;
};

const nowIso = () => new Date().toISOString();

function assertContained(filePath: string, rootPath: string) {
  const file = path.resolve(filePath);
  const root = path.resolve(rootPath);
  const relative = path.relative(root, file);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) return file;
  throw new Error("AI_DATABASE_PATH_OUTSIDE_APP_ROOT");
}

function scalar(db: DatabaseSync, sql: string) {
  return Number((db.prepare(sql).get() as { value: number }).value);
}

function diagnosticSnapshot(databasePath: string, errorCode: string, message: string, extra: JsonRecord = {}): AiDatabaseLifecycleSnapshot {
  return {
    lifecycleState: "READ_ONLY_DIAGNOSTIC",
    databasePath,
    databaseDirectory: path.dirname(databasePath),
    databaseFileName: path.basename(databasePath),
    schemaName: AI_DATABASE_SCHEMA_NAME,
    schemaVersion: Number(extra.schemaVersion ?? 0),
    exists: true,
    readOnly: true,
    canCreate: false,
    canImport: false,
    canQuery: false,
    errorCode,
    message,
    ...extra
  };
}

export function inspectAiAnalysisDatabase(input: { databasePath: string; allowedRoot: string }): AiDatabaseLifecycleSnapshot {
  const databasePath = assertContained(input.databasePath, input.allowedRoot);
  const base = {
    databasePath,
    databaseDirectory: path.dirname(databasePath),
    databaseFileName: path.basename(databasePath),
    schemaName: AI_DATABASE_SCHEMA_NAME
  };
  if (!fs.existsSync(databasePath)) {
    return {
      ...base,
      lifecycleState: "NOT_CREATED",
      schemaVersion: AI_DATABASE_SCHEMA_VERSION,
      exists: false,
      readOnly: false,
      canCreate: true,
      canImport: false,
      canQuery: false,
      sizeBytes: 0,
      integrity: "not-created",
      foreignKeyErrors: 0,
      invariantErrors: 0,
      recordCount: 0,
      findingCount: 0,
      reviewedCount: 0,
      matchedCount: 0,
      sourceContextCount: 0,
      importBatchCount: 0,
      batches: [],
      sourceContexts: []
    };
  }
  const stat = fs.statSync(databasePath);
  if (!stat.isFile() || stat.size === 0) return diagnosticSnapshot(databasePath, "AI_DATABASE_EMPTY_OR_NOT_FILE", "The AI Analysis database is empty or is not a regular file.", { sizeBytes: stat.size });

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
    db.exec("PRAGMA foreign_keys=ON; PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    const schemaVersion = Number((db.prepare("PRAGMA user_version").get() as JsonRecord).user_version);
    if (schemaVersion !== AI_DATABASE_SCHEMA_VERSION) return diagnosticSnapshot(databasePath, "AI_DATABASE_SCHEMA_UNSUPPORTED", `Expected schema v${AI_DATABASE_SCHEMA_VERSION}, found v${schemaVersion}.`, { schemaVersion, sizeBytes: stat.size });
    const metadata = db.prepare("SELECT * FROM ai_database_metadata WHERE singleton_id=1").get() as JsonRecord | undefined;
    if (!metadata || metadata.schema_name !== AI_DATABASE_SCHEMA_NAME || Number(metadata.schema_version) !== AI_DATABASE_SCHEMA_VERSION) {
      return diagnosticSnapshot(databasePath, "AI_DATABASE_METADATA_INVALID", "Database metadata does not match the frozen AI Analysis schema.", { schemaVersion, sizeBytes: stat.size });
    }
    const integrity = String((db.prepare("PRAGMA integrity_check").get() as JsonRecord).integrity_check);
    const foreignKeyErrors = (db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length;
    const invariantSql = [
      "SELECT COUNT(*) value FROM ai_analysis_records r LEFT JOIN ai_import_batches b ON b.import_batch_id=r.current_import_batch_id WHERE b.import_batch_id IS NULL",
      "SELECT COUNT(*) value FROM ai_skill_findings f LEFT JOIN ai_analysis_records r ON r.ai_record_id=f.ai_record_id WHERE r.ai_record_id IS NULL",
      "SELECT COUNT(*) value FROM ai_source_links l LEFT JOIN ai_analysis_records r ON r.ai_record_id=l.ai_record_id WHERE r.ai_record_id IS NULL"
    ];
    const invariantErrors = invariantSql.reduce((sum, sql) => sum + scalar(db!, sql), 0);
    if (integrity !== "ok" || foreignKeyErrors || invariantErrors) {
      return diagnosticSnapshot(databasePath, "AI_DATABASE_HEALTH_FAILED", "Integrity, foreign-key, or invariant checks failed.", { schemaVersion, sizeBytes: stat.size, integrity, foreignKeyErrors, invariantErrors });
    }
  } catch (error) {
    return diagnosticSnapshot(databasePath, "AI_DATABASE_OPEN_FAILED", error instanceof Error ? error.message : String(error), { sizeBytes: stat.size });
  } finally {
    db?.close();
  }

  const overview = aiDatabaseOverview(databasePath) as JsonRecord;
  const details = new DatabaseSync(databasePath, { readOnly: true });
  try {
    details.exec("PRAGMA foreign_keys=ON; PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
    const metadata = details.prepare("SELECT * FROM ai_database_metadata WHERE singleton_id=1").get() as JsonRecord;
    const sourceContexts = details.prepare("SELECT source_database_id,jira_server_fingerprint,jira_server_host,COUNT(*) record_count,MAX(completed_at_utc) last_imported_at_utc FROM ai_import_batches WHERE status='COMPLETED' GROUP BY source_database_id,jira_server_fingerprint,jira_server_host ORDER BY last_imported_at_utc DESC").all() as unknown[];
    const importBatchCount = scalar(details, "SELECT COUNT(*) value FROM ai_import_batches WHERE status='COMPLETED'");
    const journalMode = String((details.prepare("PRAGMA journal_mode").get() as JsonRecord).journal_mode);
    const sqliteRuntimeVersion = String((details.prepare("SELECT sqlite_version() value").get() as JsonRecord).value);
    const lastImportAtUtc = (details.prepare("SELECT MAX(completed_at_utc) value FROM ai_import_batches WHERE status='COMPLETED'").get() as JsonRecord).value ?? null;
    const state = Number(overview.recordCount) > 0 ? "READY_WITH_DATA" : "READY_EMPTY";
    return {
      ...base,
      ...overview,
      lifecycleState: state,
      schemaVersion: AI_DATABASE_SCHEMA_VERSION,
      exists: true,
      readOnly: false,
      canCreate: false,
      canImport: true,
      canQuery: true,
      foreignKeyErrors: 0,
      invariantErrors: 0,
      sourceContextCount: sourceContexts.length,
      importBatchCount,
      sourceContexts,
      databaseId: metadata.database_id,
      createdAtUtc: metadata.created_at_utc,
      modifiedAtUtc: fs.statSync(databasePath).mtime.toISOString(),
      lastOpenedAtUtc: nowIso(),
      journalMode,
      sqliteRuntimeVersion,
      lastImportAtUtc,
    };
  } finally {
    details.close();
  }
}

export function createAiAnalysisDatabaseAtomic(input: { databasePath: string; allowedRoot: string; ddlPath: string; appVersion: string; failureInjectionStage?: "AFTER_INITIALIZE" | "AFTER_VALIDATE" }) {
  const databasePath = assertContained(input.databasePath, input.allowedRoot);
  if (fs.existsSync(databasePath)) throw new Error("AI_DATABASE_ALREADY_EXISTS");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(databasePath), `.${path.basename(databasePath)}.${crypto.randomUUID()}.tmp`);
  const startedAt = nowIso();
  try {
    const initialized = initializeAiAnalysisDatabase({ databasePath: temporaryPath, ddlPath: input.ddlPath, appVersion: input.appVersion });
    if (initialized.status !== "READY") throw new Error("AI_DATABASE_CREATE_VALIDATION_FAILED");
    if (input.failureInjectionStage === "AFTER_INITIALIZE") throw new Error("SYNTHETIC_CREATE_FAILURE_AFTER_INITIALIZE");
    checkpointAiDatabase(temporaryPath);
    const checked = inspectAiAnalysisDatabase({ databasePath: temporaryPath, allowedRoot: input.allowedRoot });
    if (checked.lifecycleState !== "READY_EMPTY") throw new Error("AI_DATABASE_CREATE_INVARIANT_FAILED");
    if (input.failureInjectionStage === "AFTER_VALIDATE") throw new Error("SYNTHETIC_CREATE_FAILURE_AFTER_VALIDATE");
    for (const suffix of ["-wal", "-shm"]) if (fs.existsSync(temporaryPath + suffix)) fs.unlinkSync(temporaryPath + suffix);
    fs.renameSync(temporaryPath, databasePath);
    const snapshot = inspectAiAnalysisDatabase({ databasePath, allowedRoot: input.allowedRoot });
    return { ok: true, requestStatus: "COMPLETED", createdAt: nowIso(), startedAt, snapshot, receipt: { schemaName: AI_DATABASE_SCHEMA_NAME, schemaVersion: AI_DATABASE_SCHEMA_VERSION, databasePath, databaseId: snapshot.databaseId, atomicRename: true } };
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* Best-effort cleanup; original target is never touched. */ }
    for (const suffix of ["-wal", "-shm"]) try { if (fs.existsSync(`${temporaryPath}${suffix}`)) fs.unlinkSync(`${temporaryPath}${suffix}`); } catch { /* Best effort. */ }
    throw error;
  }
}

export function backupAiAnalysisDatabase(input: { databasePath: string; allowedRoot: string; backupDirectory: string }) {
  const snapshot = inspectAiAnalysisDatabase(input);
  if (!snapshot.canQuery) throw new Error("AI_DATABASE_NOT_READY");
  checkpointAiDatabase(snapshot.databasePath);
  fs.mkdirSync(input.backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
  const backupPath = path.join(input.backupDirectory, `jaa-ai-analysis_${timestamp}.sqlite`);
  fs.copyFileSync(snapshot.databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  return { ok: true, backupPath, sizeBytes: fs.statSync(backupPath).size, createdAt: nowIso() };
}
