import fs from "node:fs";
import path from "node:path";
import { app, dialog, ipcMain, shell } from "electron";
import { getAiAnalysisDatabasePath, getBackupsDir, getExportsDir, getAppRuntimeDir } from "./appPaths.js";
import { exportAiDiagnostics, importAiAnalysisPackage, relinkAiAnalysisSources, validateAiImportPackage } from "./aiAnalysisDatabaseV038.js";
import { AiAnalysisDatabaseStoreV040 } from "./aiAnalysisDatabaseLifecycleV040.js";
import { latestAiDatabaseQueryDiagnostics, queryAiResultsV040, queryIntegratedResultsV040, type StructuredQueryRequest } from "./aiAnalysisDatabaseQueryV040.js";

type RecordValue = Record<string, unknown>;
let activeStore: AiAnalysisDatabaseStoreV040 | null = null;
let latestSwitchFailure: RecordValue | null = null;

function contractPath(fileName: string) {
  return process.defaultApp ? path.resolve(process.cwd(), "contracts", "ai-analysis", fileName) : path.join(process.resourcesPath, "ai-analysis-contracts", fileName);
}
function requestId(payload: unknown) {
  const value = String((payload as RecordValue | null)?.requestId ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw new Error("INVALID_REQUEST_ID");
  return value;
}
function safeFilePath(payload: unknown) {
  const value = String((payload as RecordValue | null)?.filePath ?? "").trim();
  if (!value || value.length > 32767 || value.includes("\0")) throw new Error("INVALID_FILE_PATH");
  return path.resolve(value);
}
function safeError(error: unknown, id = "") {
  const value = error as { message?: string; preview?: unknown; snapshot?: unknown };
  return { ok: false, requestId: id, errorCode: value?.message ?? "AI_DATABASE_OPERATION_FAILED", message: value?.message ?? String(error), preview: value?.preview, snapshot: value?.snapshot };
}
async function chooseImportFile() {
  const result = await dialog.showOpenDialog({ title: "選擇 AI 分析匯入套件", properties: ["openFile"], filters: [{ name: "JAA AI Analysis Import Package", extensions: ["json"] }] });
  return result.canceled ? "" : result.filePaths[0] ?? "";
}
async function chooseExistingDatabase() {
  const result = await dialog.showOpenDialog({ title: "開啟／切換 AI 分析資料庫", properties: ["openFile"], filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }] });
  return result.canceled ? "" : result.filePaths[0] ?? "";
}
async function chooseNewDatabase() {
  const result = await dialog.showSaveDialog({ title: "建立新 AI 分析資料庫", defaultPath: path.join(getAppRuntimeDir(), "databases", "ai-analysis", "jaa-ai-analysis.sqlite"), filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }] });
  return result.canceled ? "" : result.filePath ?? "";
}
function writeJsonAtomic(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = filePath + "." + process.pid + "." + Date.now() + ".tmp";
  try { fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" }); fs.renameSync(temporaryPath, filePath); }
  finally { try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* Best effort. */ } }
}
async function saveJson(defaultName: string, value: unknown) {
  const result = await dialog.showSaveDialog({ defaultPath: path.join(getExportsDir(), defaultName), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  writeJsonAtomic(result.filePath, value);
  return { canceled: false, filePath: result.filePath, sizeBytes: fs.statSync(result.filePath).size };
}
export function getAiDatabaseV040Diagnostics() {
  const snapshot = activeStore?.lifecycle() ?? null;
  const sanitizedSnapshot = snapshot ? { ...snapshot, batches: undefined, sourceContexts: undefined, recentDatabases: snapshot.recentDatabases.map((item) => ({ ...item, resolvedPath: item.mode === "APP_ROOT_RELATIVE" ? item.value : "[external path]" })) } : null;
  return { schemaName: "jaa-ai-analysis-diagnostics-v0.3.40", createdAtUtc: new Date().toISOString(), activeDatabase: sanitizedSnapshot, queryReceipts: latestAiDatabaseQueryDiagnostics(), latestSwitchFailure };
}

export function getActiveAiDatabasePathV040() {
  const snapshot = activeStore?.lifecycle();
  return snapshot?.canQuery ? snapshot.databasePath : "";
}

export function registerAiAnalysisDatabaseIpcV040(getSourceDatabasePath: () => string) {
  const store = new AiAnalysisDatabaseStoreV040({ appRoot: getAppRuntimeDir(), defaultDatabasePath: getAiAnalysisDatabasePath(), ddlPath: contractPath("jaa-ai-analysis-v1.sql"), appVersion: app.getVersion() });
  activeStore = store;
  let activeOperation: { kind: "CREATE" | "SWITCH" | "PREFLIGHT" | "IMPORT" | "BACKUP" | "RELINK"; requestId: string } | null = null;
  let selectedPreview: RecordValue | null = null;
  const begin = (kind: typeof activeOperation extends infer _T ? "CREATE" | "SWITCH" | "PREFLIGHT" | "IMPORT" | "BACKUP" | "RELINK" : never, id: string) => {
    if (activeOperation) throw new Error("AI_DATABASE_BUSY_" + activeOperation.kind);
    activeOperation = { kind, requestId: id };
  };
  const end = (id: string) => { if (activeOperation?.requestId === id) activeOperation = null; };
  const lifecycle = () => ({ ...store.lifecycle(), activeOperation: activeOperation?.kind ?? null, activeRequestId: activeOperation?.requestId ?? "" });

  ipcMain.handle("ai-database:lifecycle", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); return { ok: true, requestId: id, snapshot: lifecycle() }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:create", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("CREATE", id);
      const supplied = String((payload as RecordValue | null)?.filePath ?? "").trim();
      const filePath = supplied ? path.resolve(supplied) : await chooseNewDatabase();
      if (!filePath) return { ok: true, requestId: id, canceled: true, snapshot: lifecycle() };
      const result = store.createAndActivate(filePath);
      return { ...result, requestId: id, canceled: false };
    } catch (error) { return safeError(error, id); } finally { end(id); }
  });
  ipcMain.handle("ai-database:open-switch", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("SWITCH", id);
      const supplied = String((payload as RecordValue | null)?.filePath ?? "").trim();
      const filePath = supplied ? path.resolve(supplied) : await chooseExistingDatabase();
      if (!filePath) return { ok: true, requestId: id, canceled: true, snapshot: lifecycle() };
      const snapshot = store.openAndActivate(filePath);
      latestSwitchFailure = null;
      return { ok: true, requestId: id, canceled: false, snapshot };
    } catch (error) {
      latestSwitchFailure = { occurredAtUtc: new Date().toISOString(), errorCode: error instanceof Error ? error.message : String(error), retainedActiveDatabaseId: store.lifecycle().databaseId };
      return safeError(error, id);
    } finally { end(id); }
  });
  ipcMain.handle("ai-database:forget", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); const databaseId = String((payload as RecordValue | null)?.databaseId ?? ""); if (!databaseId) throw new Error("AI_DATABASE_IDENTITY_REQUIRED"); return { ok: true, requestId: id, snapshot: store.forget(databaseId) }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:health-check", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); return { ok: true, requestId: id, snapshot: lifecycle() }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:backup", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); begin("BACKUP", id); return { ...store.backup(path.join(getBackupsDir(), "ai-analysis")), requestId: id }; } catch (error) { return safeError(error, id); } finally { end(id); }
  });
  ipcMain.handle("ai-database:select-import", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("PREFLIGHT", id); const databasePath = store.activePath(); const filePath = await chooseImportFile();
      if (!filePath) return { ok: true, requestId: id, canceled: true };
      const preview = validateAiImportPackage({ filePath, schemaPath: contractPath("jaa-ai-analysis-import-package_v1.0.0.schema.json"), appVersion: app.getVersion(), databasePath }).preview;
      selectedPreview = preview.ok ? { ...preview, databasePath } : null;
      return { ...preview, requestId: id, canceled: false, lifecycleState: preview.ok ? "PREVIEW_READY" : "PREFLIGHT_FAILED" };
    } catch (error) { selectedPreview = null; return safeError(error, id); } finally { end(id); }
  });
  ipcMain.handle("ai-database:preflight", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("PREFLIGHT", id); const databasePath = store.activePath(); const filePath = safeFilePath(payload);
      const preview = validateAiImportPackage({ filePath, schemaPath: contractPath("jaa-ai-analysis-import-package_v1.0.0.schema.json"), appVersion: app.getVersion(), databasePath }).preview;
      selectedPreview = preview.ok ? { ...preview, databasePath } : null;
      return { ...preview, requestId: id, lifecycleState: preview.ok ? "PREVIEW_READY" : "PREFLIGHT_FAILED" };
    } catch (error) { selectedPreview = null; return safeError(error, id); } finally { end(id); }
  });
  ipcMain.handle("ai-database:cancel-preflight", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); selectedPreview = null; return { ok: true, requestId: id, canceled: true, snapshot: lifecycle() }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:import", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); if ((payload as RecordValue | null)?.confirmed !== true) throw new Error("IMPORT_CONFIRMATION_REQUIRED");
      const filePath = safeFilePath(payload), databasePath = store.activePath();
      if (!selectedPreview?.ok || path.resolve(String(selectedPreview.filePath)) !== filePath || selectedPreview.databasePath !== databasePath) throw new Error("IMPORT_PREFLIGHT_REQUIRED");
      begin("IMPORT", id);
      const receipt = importAiAnalysisPackage({ databasePath, ddlPath: contractPath("jaa-ai-analysis-v1.sql"), schemaPath: contractPath("jaa-ai-analysis-import-package_v1.0.0.schema.json"), packagePath: filePath, appVersion: app.getVersion(), sourceDatabasePath: getSourceDatabasePath() });
      selectedPreview = null;
      return { ...receipt, requestId: id, snapshot: lifecycle() };
    } catch (error) { return safeError(error, id); } finally { end(id); }
  });
  ipcMain.handle("ai-database:relink", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); begin("RELINK", id); const databasePath = store.activePath(); return { ...relinkAiAnalysisSources({ databasePath, sourceDatabasePath: getSourceDatabasePath(), appVersion: app.getVersion() }), requestId: id, snapshot: lifecycle() }; } catch (error) { return safeError(error, id); } finally { end(id); }
  });
  ipcMain.handle("ai-database:query-results", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); return { ok: true, requestId: id, ...queryAiResultsV040(store.activePath(), payload as StructuredQueryRequest) }; } catch (error) { return { ...safeError(error, id), totalCount: 0, filteredCount: 0, rows: [] }; }
  });
  ipcMain.handle("ai-database:query-integrated", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); const snapshot = store.lifecycle(); const aiPath = snapshot.canQuery ? snapshot.databasePath : null; return { requestId: id, ...queryIntegratedResultsV040(getSourceDatabasePath(), aiPath, payload as StructuredQueryRequest) }; } catch (error) { return { ...safeError(error, id), totalCount: 0, filteredCount: 0, rows: [], integrationState: "QUERY_ERROR" }; }
  });
  ipcMain.handle("ai-database:export-query", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); const value = payload as RecordValue; const kind = value.kind === "integrated" ? "integrated" : "ai";
      const query: StructuredQueryRequest = { ...(value.query as StructuredQueryRequest ?? {}), page: 1, pageSize: 500 };
      const allRows: Row[] = []; let page = 1, filteredCount = 0, appliedFilters: string[] = [];
      do {
        const result = kind === "integrated" ? queryIntegratedResultsV040(getSourceDatabasePath(), store.lifecycle().canQuery ? store.activePath() : null, { ...query, page }) : queryAiResultsV040(store.activePath(), { ...query, page });
        if ("errorCode" in result && result.errorCode) throw new Error(result.errorCode);
        const rows = result.rows as Row[]; allRows.push(...rows); filteredCount = result.filteredCount; appliedFilters = "appliedFilters" in result && Array.isArray(result.appliedFilters) ? result.appliedFilters : []; page += 1;
        if (!rows.length) break;
      } while (allRows.length < filteredCount);
      const document = { schemaName: "jaa-ai-analysis-query-export-v0.3.40", createdAtUtc: new Date().toISOString(), kind, query: value.query ?? {}, appliedFilters, total: allRows.length, rows: allRows };
      return { ok: true, requestId: id, ...(await saveJson((kind === "integrated" ? "integrated" : "ai") + "-analysis-results-" + Date.now() + ".json", document)) };
    } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:export-diagnostics", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); const snapshot = store.lifecycle();
      const database = snapshot.canQuery ? exportAiDiagnostics(snapshot.databasePath) : null;
      return { ok: true, requestId: id, ...(await saveJson("ai-analysis-diagnostic-" + Date.now() + ".json", { ...getAiDatabaseV040Diagnostics(), database })) };
    } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:open-folder", async (_event, payload: unknown) => {
    let id = ""; try { id = requestId(payload); const folderPath = path.dirname(store.lifecycle().databasePath || getAiAnalysisDatabasePath()); const error = await shell.openPath(folderPath); if (error) throw new Error("OPEN_AI_DATABASE_FOLDER_FAILED"); return { ok: true, requestId: id, folderPath }; } catch (error) { return safeError(error, id); }
  });
}

type Row = Record<string, unknown>;
