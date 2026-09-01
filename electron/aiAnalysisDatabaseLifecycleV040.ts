import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveInsideRoot } from "./appRoot.js";
import {
  backupAiAnalysisDatabase,
  createAiAnalysisDatabaseAtomic,
  inspectAiAnalysisDatabase,
  type AiDatabaseLifecycleSnapshot
} from "./aiAnalysisDatabaseLifecycleV039.js";

export type AiDatabasePathMode = "APP_ROOT_RELATIVE" | "ABSOLUTE";

export type AiDatabasePathDescriptor = {
  mode: AiDatabasePathMode;
  value: string;
  databaseId: string;
  fileName: string;
  lastOpenedAtUtc: string;
};

type AiDatabaseSettings = {
  formatVersion: 1;
  active: AiDatabasePathDescriptor | null;
  recent: AiDatabasePathDescriptor[];
};

export type AiDatabaseV040Snapshot = Omit<AiDatabaseLifecycleSnapshot, "lifecycleState"> & {
  lifecycleState: AiDatabaseLifecycleSnapshot["lifecycleState"] | "NOT_SELECTED" | "FILE_NOT_FOUND" | "SCHEMA_ERROR" | "INTEGRITY_ERROR" | "READ_ONLY";
  pathMode: AiDatabasePathMode | null;
  databaseId: string;
  lastKnownPath: string;
  recentDatabases: Array<AiDatabasePathDescriptor & { resolvedPath: string; exists: boolean; active: boolean }>;
};

const EMPTY_COUNTS = {
  recordCount: 0,
  findingCount: 0,
  reviewedCount: 0,
  matchedCount: 0,
  sourceContextCount: 0,
  importBatchCount: 0,
  batches: [],
  sourceContexts: []
};

function nowIso() {
  return new Date().toISOString();
}

function isInside(rootPath: string, candidatePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertDatabaseExtension(candidatePath: string) {
  if (![".sqlite", ".db"].includes(path.extname(candidatePath).toLowerCase())) throw new Error("AI_DATABASE_EXTENSION_NOT_ALLOWED");
  if (candidatePath.includes("\0") || candidatePath.length > 32767) throw new Error("AI_DATABASE_PATH_INVALID");
  return path.resolve(candidatePath);
}

function writeJsonAtomic(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* Best effort only. */ }
  }
}

function emptySnapshot(state: "NOT_SELECTED" | "FILE_NOT_FOUND", descriptor: AiDatabasePathDescriptor | null, resolvedPath = ""): AiDatabaseV040Snapshot {
  const databasePath = resolvedPath || (descriptor?.value ?? "");
  return {
    lifecycleState: state,
    databasePath,
    lastKnownPath: databasePath,
    databaseDirectory: databasePath ? path.dirname(databasePath) : "",
    databaseFileName: descriptor?.fileName ?? (databasePath ? path.basename(databasePath) : ""),
    schemaName: "jaa-ai-analysis-sqlite",
    schemaVersion: 1,
    exists: false,
    readOnly: false,
    canCreate: state === "NOT_SELECTED",
    canImport: false,
    canQuery: false,
    pathMode: descriptor?.mode ?? null,
    databaseId: descriptor?.databaseId ?? "",
    recentDatabases: [],
    ...EMPTY_COUNTS
  };
}

export class AiAnalysisDatabaseStoreV040 {
  private readonly settingsPath: string;
  private settings: AiDatabaseSettings;

  constructor(private readonly input: { appRoot: string; defaultDatabasePath: string; ddlPath: string; appVersion: string }) {
    this.settingsPath = resolveInsideRoot(input.appRoot, "app-data", "settings", "ai-analysis-database.json");
    this.settings = this.loadSettings();
    if (!this.settings.active && fs.existsSync(input.defaultDatabasePath)) {
      const snapshot = this.inspectCandidate(input.defaultDatabasePath);
      if (snapshot.canQuery) this.activateDescriptor(this.describe(input.defaultDatabasePath, String(snapshot.databaseId ?? "")), false);
    }
  }

  private loadSettings(): AiDatabaseSettings {
    if (!fs.existsSync(this.settingsPath)) return { formatVersion: 1, active: null, recent: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")) as Partial<AiDatabaseSettings>;
      return {
        formatVersion: 1,
        active: parsed.active && typeof parsed.active.value === "string" ? parsed.active : null,
        recent: Array.isArray(parsed.recent) ? parsed.recent.filter((item) => item && typeof item.value === "string").slice(0, 20) : []
      };
    } catch {
      return { formatVersion: 1, active: null, recent: [] };
    }
  }

  private saveSettings(next: AiDatabaseSettings) {
    writeJsonAtomic(this.settingsPath, next);
    this.settings = next;
  }

  resolve(descriptor: AiDatabasePathDescriptor) {
    return descriptor.mode === "APP_ROOT_RELATIVE"
      ? path.resolve(this.input.appRoot, descriptor.value)
      : path.resolve(descriptor.value);
  }

  describe(databasePath: string, databaseId: string): AiDatabasePathDescriptor {
    const resolved = assertDatabaseExtension(databasePath);
    const mode: AiDatabasePathMode = isInside(this.input.appRoot, resolved) ? "APP_ROOT_RELATIVE" : "ABSOLUTE";
    return {
      mode,
      value: mode === "APP_ROOT_RELATIVE" ? path.relative(this.input.appRoot, resolved) : resolved,
      databaseId,
      fileName: path.basename(resolved),
      lastOpenedAtUtc: nowIso()
    };
  }

  private recent() {
    return this.settings.recent.map((item) => {
      const resolvedPath = this.resolve(item);
      return { ...item, resolvedPath, exists: fs.existsSync(resolvedPath), active: this.settings.active?.databaseId === item.databaseId && this.settings.active?.value === item.value };
    });
  }

  private decorate(snapshot: AiDatabaseLifecycleSnapshot, descriptor: AiDatabasePathDescriptor): AiDatabaseV040Snapshot {
    const healthState = snapshot.errorCode === "AI_DATABASE_SCHEMA_UNSUPPORTED" || snapshot.errorCode === "AI_DATABASE_METADATA_INVALID"
      ? "SCHEMA_ERROR"
      : snapshot.errorCode === "AI_DATABASE_HEALTH_FAILED" ? "INTEGRITY_ERROR" : snapshot.lifecycleState;
    let linkDiagnostics: Record<string, unknown> = { linkOutcomeCounts: {}, recentLinkAttempts: [] };
    if (snapshot.canQuery) {
      const databasePath = this.resolve(descriptor);
      const db = new DatabaseSync(databasePath, { readOnly: true });
      try {
        db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000;");
        const outcomeRows = db.prepare("SELECT link_status,COUNT(*) count FROM ai_source_links GROUP BY link_status ORDER BY link_status").all() as Array<{ link_status: string; count: number }>;
        const sourceContexts = db.prepare("SELECT source_database_id,jira_server_fingerprint,jira_server_host,pending_file_name,pending_sha256,COUNT(*) batch_count,SUM(validated_record_count) record_count,MAX(completed_at_utc) last_imported_at_utc FROM ai_import_batches WHERE status='COMPLETED' GROUP BY source_database_id,jira_server_fingerprint,jira_server_host,pending_file_name,pending_sha256 ORDER BY last_imported_at_utc DESC").all();
        const recentLinkAttempts = db.prepare("SELECT attempted_at_utc,result_status,diagnostic_code,result_method,candidate_count,duration_ms FROM ai_source_link_attempts ORDER BY attempted_at_utc DESC LIMIT 20").all();
        linkDiagnostics = { linkOutcomeCounts: Object.fromEntries(outcomeRows.map((row) => [row.link_status, Number(row.count)])), recentLinkAttempts, sourceContexts, sourceContextCount: sourceContexts.length };
      } finally { db.close(); }
    }
    return {
      ...snapshot,
      ...linkDiagnostics,
      lifecycleState: healthState,
      pathMode: descriptor.mode,
      databaseId: String(snapshot.databaseId ?? descriptor.databaseId ?? ""),
      lastKnownPath: this.resolve(descriptor),
      recentDatabases: this.recent()
    };
  }

  lifecycle(): AiDatabaseV040Snapshot {
    const active = this.settings.active;
    if (!active) return { ...emptySnapshot("NOT_SELECTED", null), recentDatabases: this.recent() };
    const databasePath = this.resolve(active);
    if (!fs.existsSync(databasePath)) return { ...emptySnapshot("FILE_NOT_FOUND", active, databasePath), recentDatabases: this.recent() };
    return this.decorate(this.inspectCandidate(databasePath), active);
  }

  activePath() {
    const snapshot = this.lifecycle();
    if (!snapshot.canQuery) throw new Error("AI_DATABASE_NOT_READY");
    return snapshot.databasePath;
  }

  inspectCandidate(databasePath: string) {
    const resolved = assertDatabaseExtension(databasePath);
    const stat = fs.existsSync(resolved) ? fs.lstatSync(resolved) : null;
    if (stat?.isSymbolicLink()) throw new Error("AI_DATABASE_SYMLINK_NOT_ALLOWED");
    if (stat && !stat.isFile()) throw new Error("AI_DATABASE_NOT_REGULAR_FILE");
    const snapshot = inspectAiAnalysisDatabase({ databasePath: resolved, allowedRoot: path.dirname(resolved) });
    if (snapshot.canQuery) {
      let writable: DatabaseSync | undefined;
      try {
        writable = new DatabaseSync(resolved);
        writable.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE; ROLLBACK;");
      } catch {
        return { ...snapshot, lifecycleState: "READ_ONLY_DIAGNOSTIC" as const, readOnly: true, canImport: false, errorCode: "AI_DATABASE_READ_ONLY", message: "The candidate database is valid but is not writable." };
      } finally { writable?.close(); }
    }
    return snapshot;
  }

  private activateDescriptor(descriptor: AiDatabasePathDescriptor, verifyIdentity = true) {
    const databasePath = this.resolve(descriptor);
    const snapshot = this.inspectCandidate(databasePath);
    if (!snapshot.canQuery || snapshot.readOnly) throw Object.assign(new Error(snapshot.errorCode ?? "AI_DATABASE_SWITCH_PREFLIGHT_FAILED"), { snapshot });
    const actualIdentity = String(snapshot.databaseId ?? "");
    if (!actualIdentity) throw new Error("AI_DATABASE_IDENTITY_MISSING");
    if (verifyIdentity && descriptor.databaseId && descriptor.databaseId !== actualIdentity) throw new Error("AI_DATABASE_IDENTITY_MISMATCH");
    const nextDescriptor = this.describe(databasePath, actualIdentity);
    const recent = [nextDescriptor, ...this.settings.recent.filter((item) => item.databaseId !== actualIdentity && this.resolve(item) !== databasePath)].slice(0, 20);
    this.saveSettings({ formatVersion: 1, active: nextDescriptor, recent });
    return this.decorate(snapshot, nextDescriptor);
  }

  openAndActivate(databasePath: string) {
    const candidate = this.inspectCandidate(databasePath);
    if (!candidate.canQuery || candidate.readOnly) throw Object.assign(new Error(candidate.errorCode ?? "AI_DATABASE_SWITCH_PREFLIGHT_FAILED"), { snapshot: candidate });
    return this.activateDescriptor(this.describe(databasePath, String(candidate.databaseId ?? "")));
  }

  createAndActivate(databasePath: string) {
    const resolved = assertDatabaseExtension(databasePath);
    const result = createAiAnalysisDatabaseAtomic({
      databasePath: resolved,
      allowedRoot: path.dirname(resolved),
      ddlPath: this.input.ddlPath,
      appVersion: this.input.appVersion
    });
    return { ...result, snapshot: this.openAndActivate(resolved) };
  }

  forget(databaseId: string) {
    const recent = this.settings.recent.filter((item) => item.databaseId !== databaseId);
    const active = this.settings.active?.databaseId === databaseId ? null : this.settings.active;
    this.saveSettings({ formatVersion: 1, active, recent });
    return this.lifecycle();
  }

  backup(backupDirectory: string) {
    const databasePath = this.activePath();
    return backupAiAnalysisDatabase({ databasePath, allowedRoot: path.dirname(databasePath), backupDirectory });
  }

  settingsFilePath() {
    return this.settingsPath;
  }
}
