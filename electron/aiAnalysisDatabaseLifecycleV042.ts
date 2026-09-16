import crypto from "node:crypto";
import fs from "./businessIoDiagnosticsV044.js";
import path from "node:path";
import { resolveInsideRoot } from "./appRoot.js";
import { initializeAiDatabaseV042, inspectAiDatabaseV042 } from "./aiAnalysisDatabaseV042.js";

type Descriptor = { mode: "APP_ROOT_RELATIVE" | "ABSOLUTE"; value: string; databaseId: string; fileName: string; lastOpenedAtUtc: string };
type Settings = { formatVersion: 2; active: Descriptor | null; recent: Descriptor[] };
const now = () => new Date().toISOString();

function atomicJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, filePath); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ } }
}

export class AiAnalysisDatabaseStoreV042 {
  private readonly settingsPath: string;
  private settings: Settings;

  constructor(private readonly input: { appRoot: string; defaultDatabasePath: string; backupDirectory: string }) {
    this.settingsPath = resolveInsideRoot(input.appRoot, "app-data", "settings", "ai-analysis-database.json");
    this.settings = this.load();
    if (!this.settings.active && fs.existsSync(input.defaultDatabasePath)) this.activate(input.defaultDatabasePath, false);
  }

  private load(): Settings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
      const normalize = (item: any): Descriptor | null => item && typeof item.value === "string" ? { mode: item.mode === "APP_ROOT_RELATIVE" ? "APP_ROOT_RELATIVE" : "ABSOLUTE", value: item.value, databaseId: String(item.databaseId ?? ""), fileName: String(item.fileName ?? path.basename(item.value)), lastOpenedAtUtc: String(item.lastOpenedAtUtc ?? now()) } : null;
      return { formatVersion: 2, active: normalize(parsed.active), recent: (Array.isArray(parsed.recent) ? parsed.recent.map(normalize).filter(Boolean) : []).slice(0, 20) } as Settings;
    } catch { return { formatVersion: 2, active: null, recent: [] }; }
  }

  private save(settings: Settings) { atomicJson(this.settingsPath, settings); this.settings = settings; }
  resolve(descriptor: Descriptor) { return descriptor.mode === "APP_ROOT_RELATIVE" ? path.resolve(this.input.appRoot, descriptor.value) : path.resolve(descriptor.value); }
  private describe(filePath: string): Descriptor {
    const resolved = path.resolve(filePath);
    const relative = path.relative(path.resolve(this.input.appRoot), resolved);
    const inside = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    return { mode: inside ? "APP_ROOT_RELATIVE" : "ABSOLUTE", value: inside ? relative : resolved, databaseId: crypto.createHash("sha256").update(resolved.toLowerCase()).digest("hex"), fileName: path.basename(resolved), lastOpenedAtUtc: now() };
  }
  private activate(filePath: string, persist = true) {
    const descriptor = this.describe(filePath);
    const recent = [descriptor, ...this.settings.recent.filter((item) => item.databaseId !== descriptor.databaseId)].slice(0, 20);
    if (persist) this.save({ formatVersion: 2, active: descriptor, recent }); else this.settings = { formatVersion: 2, active: descriptor, recent };
    return this.lifecycle();
  }

  lifecycle() {
    const active = this.settings.active;
    if (!active) return { lifecycleState: "NOT_SELECTED", databasePath: "", databaseFileName: "", exists: false, canCreate: true, canImport: false, canQuery: false, schemaVersion: 2, databaseId: "", recentDatabases: this.recent() };
    const resolved = this.resolve(active);
    if (!fs.existsSync(resolved)) return { lifecycleState: "FILE_NOT_FOUND", databasePath: resolved, databaseFileName: active.fileName, exists: false, canCreate: false, canImport: false, canQuery: false, schemaVersion: 2, databaseId: active.databaseId, pathMode: active.mode, recentDatabases: this.recent() };
    return { ...inspectAiDatabaseV042(resolved), databaseId: active.databaseId, pathMode: active.mode, lastOpenedAtUtc: active.lastOpenedAtUtc, recentDatabases: this.recent() };
  }
  private recent() { return this.settings.recent.map((item) => ({ ...item, resolvedPath: this.resolve(item), exists: fs.existsSync(this.resolve(item)), active: item.databaseId === this.settings.active?.databaseId })); }
  activePath() { const snapshot = this.lifecycle(); if (!snapshot.canQuery) throw new Error("AI_DATABASE_NOT_READY"); return snapshot.databasePath; }
  createAndActivate(filePath: string) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) throw new Error("AI_DATABASE_ALREADY_EXISTS");
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${crypto.randomUUID()}.tmp`);
    try { initializeAiDatabaseV042({ databasePath: temporary }); fs.renameSync(temporary, resolved); return { ok: true, snapshot: this.activate(resolved) }; }
    catch (error) { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ } throw error; }
  }
  async createAndActivateAsyncV050(filePath: string, initialize: (temporary: string) => Promise<unknown>) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) throw new Error("AI_DATABASE_ALREADY_EXISTS");
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${crypto.randomUUID()}.tmp`);
    const selection = this.settings;
    try {
      await initialize(temporary);
      if (this.settings !== selection) throw new Error("SUPERSEDED");
      // Exclusive publication cannot overwrite a destination created while the worker ran.
      fs.linkSync(temporary, resolved);
      return { ok: true, snapshot: this.activate(resolved) };
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  openAndActivate(filePath: string) {
    const inspected = inspectAiDatabaseV042(path.resolve(filePath));
    if (inspected.lifecycleState === "MIGRATION_REQUIRED") throw Object.assign(new Error("AI_DATABASE_V1_MIGRATION_NOT_AVAILABLE_IN_V042"), { snapshot: inspected });
    const ready = inspectAiDatabaseV042(path.resolve(filePath));
    if (!ready.canQuery) throw Object.assign(new Error(String(ready.errorCode ?? "AI_DATABASE_OPEN_FAILED")), { snapshot: ready });
    return this.activate(filePath);
  }
  forget(databaseId: string) {
    this.save({ formatVersion: 2, active: this.settings.active?.databaseId === databaseId ? null : this.settings.active, recent: this.settings.recent.filter((item) => item.databaseId !== databaseId) });
    return this.lifecycle();
  }
  backup(backupDirectory: string) {
    const source = this.activePath(); fs.mkdirSync(backupDirectory, { recursive: true });
    const target = path.join(backupDirectory, `jaa-ai-analysis-v2_${Date.now()}.sqlite`);
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    return { ok: true, backupPath: target, sizeBytes: fs.statSync(target).size, createdAt: now() };
  }
}
