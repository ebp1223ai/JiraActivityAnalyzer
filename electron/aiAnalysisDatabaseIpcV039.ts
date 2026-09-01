import fs from "node:fs";
import path from "node:path";
import { app, dialog, ipcMain, shell } from "electron";
import { getAiAnalysisDatabasePath, getAiAnalysisDatabaseDir, getBackupsDir, getExportsDir } from "./appPaths.js";
import {
  exportAiDiagnostics,
  importAiAnalysisPackage,
  queryAiResults,
  queryIntegratedResults,
  relinkAiAnalysisSources,
  validateAiImportPackage
} from "./aiAnalysisDatabaseV038.js";
import {
  AiDatabaseLifecycleState,
  backupAiAnalysisDatabase,
  createAiAnalysisDatabaseAtomic,
  inspectAiAnalysisDatabase
} from "./aiAnalysisDatabaseLifecycleV039.js";

type JsonRecord = Record<string, any>;

function contractPath(fileName: string) {
  return process.defaultApp
    ? path.resolve(process.cwd(), "contracts", "ai-analysis", fileName)
    : path.join(process.resourcesPath, "ai-analysis-contracts", fileName);
}

function paths() {
  return {
    databasePath: getAiAnalysisDatabasePath(),
    allowedRoot: getAiAnalysisDatabaseDir(),
    ddlPath: contractPath("jaa-ai-analysis-v1.sql"),
    schemaPath: contractPath("jaa-ai-analysis-import-package_v1.0.0.schema.json")
  };
}

function requestId(payload: unknown) {
  const value = String((payload as JsonRecord | null)?.requestId ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw new Error("INVALID_REQUEST_ID");
  return value;
}

function safeFilePath(payload: unknown) {
  const value = String((payload as JsonRecord | null)?.filePath ?? "").trim();
  if (!value || value.length > 32767 || value.includes("\0")) throw new Error("INVALID_IMPORT_FILE_PATH");
  return path.resolve(value);
}

function safeError(error: unknown, id = "") {
  const value = error as { message?: string; preview?: unknown };
  return { ok: false, requestId: id, errorCode: value?.message ?? "AI_DATABASE_OPERATION_FAILED", message: value?.message ?? String(error), preview: value?.preview };
}

async function chooseImportFile() {
  const result = await dialog.showOpenDialog({ title: "選擇 AI 分析匯入套件", properties: ["openFile"], filters: [{ name: "JAA AI Analysis Import Package", extensions: ["json"] }] });
  return result.canceled ? "" : result.filePaths[0] ?? "";
}

async function saveJson(defaultName: string, value: unknown) {
  const result = await dialog.showSaveDialog({ defaultPath: path.join(getExportsDir(), defaultName), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.mkdirSync(path.dirname(result.filePath), { recursive: true });
  fs.writeFileSync(result.filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { canceled: false, filePath: result.filePath, sizeBytes: fs.statSync(result.filePath).size };
}

export function registerAiAnalysisDatabaseIpcV039(getSourceDatabasePath: () => string) {
  let activeOperation: { kind: "CREATE" | "PREFLIGHT" | "IMPORT" | "BACKUP"; requestId: string; state: AiDatabaseLifecycleState } | null = null;
  let selectedPreview: JsonRecord | null = null;

  const snapshot = () => {
    const current = inspectAiAnalysisDatabase(paths());
    return activeOperation ? { ...current, lifecycleState: activeOperation.state, activeOperation: activeOperation.kind, activeRequestId: activeOperation.requestId } : current;
  };
  const requireReady = () => {
    const current = inspectAiAnalysisDatabase(paths());
    if (!current.canImport || !current.canQuery) throw new Error("AI_DATABASE_NOT_READY");
    return { ...paths(), snapshot: current };
  };
  const begin = (kind: typeof activeOperation extends infer _T ? "CREATE" | "PREFLIGHT" | "IMPORT" | "BACKUP" : never, id: string, state: AiDatabaseLifecycleState) => {
    if (activeOperation) throw new Error(`AI_DATABASE_BUSY_${activeOperation.kind}`);
    activeOperation = { kind, requestId: id, state };
  };

  ipcMain.handle("ai-database:lifecycle", async (_event, payload: unknown) => {
    let id = "";
    try { id = requestId(payload); return { ok: true, requestId: id, snapshot: snapshot() }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:create", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("CREATE", id, "CREATING");
      const result = createAiAnalysisDatabaseAtomic({ ...paths(), appVersion: app.getVersion() });
      return { ...result, requestId: id };
    } catch (error) { return safeError(error, id); }
    finally { if (activeOperation?.requestId === id) activeOperation = null; }
  });
  ipcMain.handle("ai-database:health-check", async (_event, payload: unknown) => {
    let id = "";
    try { id = requestId(payload); return { ok: true, requestId: id, snapshot: inspectAiAnalysisDatabase(paths()) }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:backup", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("BACKUP", id, snapshot().lifecycleState);
      return { ...backupAiAnalysisDatabase({ ...paths(), backupDirectory: path.join(getBackupsDir(), "ai-analysis") }), requestId: id };
    } catch (error) { return safeError(error, id); }
    finally { if (activeOperation?.requestId === id) activeOperation = null; }
  });
  ipcMain.handle("ai-database:select-import", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); requireReady();
      const filePath = await chooseImportFile();
      if (!filePath) return { ok: true, requestId: id, canceled: true };
      begin("PREFLIGHT", id, "PREFLIGHTING");
      const resolved = requireReady();
      const preview = validateAiImportPackage({ filePath, schemaPath: resolved.schemaPath, appVersion: app.getVersion(), databasePath: resolved.databasePath }).preview;
      selectedPreview = preview.ok ? { ...preview, requestId: id } : null;
      return { ...preview, requestId: id, canceled: false, lifecycleState: preview.ok ? "PREVIEW_READY" : "PREFLIGHT_FAILED" };
    } catch (error) { selectedPreview = null; return safeError(error, id); }
    finally { if (activeOperation?.requestId === id) activeOperation = null; }
  });
  ipcMain.handle("ai-database:preflight", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload); begin("PREFLIGHT", id, "PREFLIGHTING");
      const resolved = requireReady();
      const preview = validateAiImportPackage({ filePath: safeFilePath(payload), schemaPath: resolved.schemaPath, appVersion: app.getVersion(), databasePath: resolved.databasePath }).preview;
      selectedPreview = preview.ok ? { ...preview, requestId: id } : null;
      return { ...preview, requestId: id, lifecycleState: preview.ok ? "PREVIEW_READY" : "PREFLIGHT_FAILED" };
    } catch (error) { selectedPreview = null; return safeError(error, id); }
    finally { if (activeOperation?.requestId === id) activeOperation = null; }
  });
  ipcMain.handle("ai-database:cancel-preflight", async (_event, payload: unknown) => {
    let id = "";
    try { id = requestId(payload); selectedPreview = null; return { ok: true, requestId: id, canceled: true, snapshot: snapshot() }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:import", async (_event, payload: unknown) => {
    let id = "";
    try {
      id = requestId(payload);
      if ((payload as JsonRecord | null)?.confirmed !== true) throw new Error("IMPORT_CONFIRMATION_REQUIRED");
      const filePath = safeFilePath(payload);
      if (!selectedPreview?.ok || path.resolve(selectedPreview.filePath) !== filePath) throw new Error("IMPORT_PREFLIGHT_REQUIRED");
      begin("IMPORT", id, "IMPORTING");
      const resolved = requireReady();
      const receipt = importAiAnalysisPackage({ ...resolved, packagePath: filePath, appVersion: app.getVersion(), sourceDatabasePath: getSourceDatabasePath() });
      selectedPreview = null;
      return { ...receipt, requestId: id, snapshot: inspectAiAnalysisDatabase(paths()) };
    } catch (error) { return safeError(error, id); }
    finally { if (activeOperation?.requestId === id) activeOperation = null; }
  });
  ipcMain.handle("ai-database:relink", async (_event, payload: unknown) => {
    let id = "";
    try { id = requestId(payload); const { databasePath } = requireReady(); return { ...relinkAiAnalysisSources({ databasePath, sourceDatabasePath: getSourceDatabasePath(), appVersion: app.getVersion() }), requestId: id }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:query-results", async (_event, payload: JsonRecord) => {
    let id = "";
    try { id = requestId(payload); const { databasePath } = requireReady(); return { ok: true, requestId: id, ...queryAiResults(databasePath, payload) }; } catch (error) { return { ...safeError(error, id), total: 0, limit: 100, offset: 0, items: [] }; }
  });
  ipcMain.handle("ai-database:query-integrated", async (_event, payload: JsonRecord) => {
    let id = "";
    try { id = requestId(payload); const { databasePath } = requireReady(); return { ok: true, requestId: id, ...queryIntegratedResults(getSourceDatabasePath(), databasePath, payload) }; } catch (error) { return { ...safeError(error, id), total: 0, limit: 100, offset: 0, items: [], sourceAvailable: false }; }
  });
  ipcMain.handle("ai-database:export-diagnostics", async (_event, payload: unknown) => {
    let id = "";
    try { id = requestId(payload); const current = inspectAiAnalysisDatabase(paths()); const diagnostic = current.canQuery ? exportAiDiagnostics(current.databasePath) : { schemaName: "jaa-ai-analysis-lifecycle-diagnostic-v1", createdAt: new Date().toISOString(), snapshot: current }; return { ok: true, requestId: id, ...(await saveJson(`ai-analysis-diagnostic-${Date.now()}.json`, diagnostic)) }; } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:export-query", async (_event, payload: JsonRecord) => {
    let id = "";
    try {
      id = requestId(payload); const { databasePath } = requireReady();
      const query = { filters: payload?.filters ?? {}, limit: 500, offset: 0 };
      const first = payload?.kind === "integrated" ? queryIntegratedResults(getSourceDatabasePath(), databasePath, query) : queryAiResults(databasePath, query);
      const items = [...first.items];
      while (items.length < first.total) {
        const next = payload?.kind === "integrated" ? queryIntegratedResults(getSourceDatabasePath(), databasePath, { ...query, offset: items.length }) : queryAiResults(databasePath, { ...query, offset: items.length });
        if (!next.items.length) break;
        items.push(...next.items);
      }
      return { ok: true, requestId: id, ...(await saveJson(`${payload?.kind === "integrated" ? "integrated" : "ai"}-analysis-results-${Date.now()}.json`, { schemaName: "jaa-ai-analysis-query-export-v1", createdAt: new Date().toISOString(), kind: payload?.kind ?? "ai", filters: query.filters, total: items.length, items })) };
    } catch (error) { return safeError(error, id); }
  });
  ipcMain.handle("ai-database:open-folder", async (_event, payload: unknown) => {
    let id = "";
    try { id = requestId(payload); fs.mkdirSync(getAiAnalysisDatabaseDir(), { recursive: true }); const error = await shell.openPath(getAiAnalysisDatabaseDir()); if (error) throw new Error("OPEN_AI_DATABASE_FOLDER_FAILED"); return { ok: true, requestId: id, folderPath: getAiAnalysisDatabaseDir() }; } catch (error) { return safeError(error, id); }
  });
}
