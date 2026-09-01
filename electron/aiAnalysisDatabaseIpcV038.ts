import fs from "node:fs";
import path from "node:path";
import { app, dialog, ipcMain, shell } from "electron";
import { getAiAnalysisDatabasePath, getExportsDir } from "./appPaths.js";
import {
  aiDatabaseOverview,
  checkpointAiDatabase,
  exportAiDiagnostics,
  importAiAnalysisPackage,
  initializeAiAnalysisDatabase,
  queryAiResults,
  queryIntegratedResults,
  relinkAiAnalysisSources,
  validateAiImportPackage
} from "./aiAnalysisDatabaseV038.js";

function contractPath(fileName: string) {
  return process.defaultApp
    ? path.resolve(process.cwd(), "contracts", "ai-analysis", fileName)
    : path.join(process.resourcesPath, "ai-analysis-contracts", fileName);
}

function paths() {
  return {
    databasePath: getAiAnalysisDatabasePath(),
    ddlPath: contractPath("jaa-ai-analysis-v1.sql"),
    schemaPath: contractPath("jaa-ai-analysis-import-package_v1.0.0.schema.json")
  };
}

function ensureDatabase() {
  const resolved = paths();
  initializeAiAnalysisDatabase({ databasePath: resolved.databasePath, ddlPath: resolved.ddlPath, appVersion: app.getVersion() });
  return resolved;
}

function safeError(error: unknown) {
  const value = error as { message?: string; preview?: unknown };
  return { ok: false, errorCode: value?.message ?? "AI_DATABASE_OPERATION_FAILED", message: value?.message ?? String(error), preview: value?.preview };
}

async function chooseImportFile() {
  const result = await dialog.showOpenDialog({ title: "選擇 AI 分析匯入套件", properties: ["openFile"], filters: [{ name: "JAA AI Analysis Import Package", extensions: ["json"] }] });
  return result.canceled ? "" : result.filePaths[0] ?? "";
}

async function saveJson(defaultName: string, value: unknown) {
  const result = await dialog.showSaveDialog({ defaultPath: path.join(getExportsDir(), defaultName), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.mkdirSync(path.dirname(result.filePath), { recursive: true });
  checkpointAiDatabase(getAiAnalysisDatabasePath());
  fs.writeFileSync(result.filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { canceled: false, filePath: result.filePath, sizeBytes: fs.statSync(result.filePath).size };
}

export function registerAiAnalysisDatabaseIpcV038(getSourceDatabasePath: () => string) {
  ipcMain.handle("ai-database:overview", async () => {
    try { const { databasePath } = ensureDatabase(); return { ok: true, ...aiDatabaseOverview(databasePath) }; } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:select-import", async () => {
    try {
      const filePath = await chooseImportFile();
      if (!filePath) return { canceled: true };
      const resolved = ensureDatabase();
      return { canceled: false, ...validateAiImportPackage({ filePath, schemaPath: resolved.schemaPath, appVersion: app.getVersion(), databasePath: resolved.databasePath }).preview };
    } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:preflight", async (_event, payload: { filePath?: string }) => {
    try { const resolved = ensureDatabase(); return validateAiImportPackage({ filePath: String(payload?.filePath ?? ""), schemaPath: resolved.schemaPath, appVersion: app.getVersion(), databasePath: resolved.databasePath }).preview; } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:import", async (_event, payload: { filePath?: string; confirmed?: boolean }) => {
    if (payload?.confirmed !== true) return { ok: false, canceled: true, errorCode: "IMPORT_CONFIRMATION_REQUIRED" };
    try { const resolved = ensureDatabase(); return importAiAnalysisPackage({ ...resolved, packagePath: String(payload.filePath ?? ""), appVersion: app.getVersion(), sourceDatabasePath: getSourceDatabasePath() }); } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:relink", async () => {
    try { const { databasePath } = ensureDatabase(); return relinkAiAnalysisSources({ databasePath, sourceDatabasePath: getSourceDatabasePath(), appVersion: app.getVersion() }); } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:query-results", async (_event, payload: Record<string, unknown>) => {
    try { const { databasePath } = ensureDatabase(); return { ok: true, ...queryAiResults(databasePath, payload) }; } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:query-integrated", async (_event, payload: Record<string, unknown>) => {
    try { const { databasePath } = ensureDatabase(); return { ok: true, ...queryIntegratedResults(getSourceDatabasePath(), databasePath, payload) }; } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:export-diagnostics", async () => {
    try { const { databasePath } = ensureDatabase(); return saveJson(`ai-analysis-diagnostic-${Date.now()}.json`, exportAiDiagnostics(databasePath)); } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:export-query", async (_event, payload: { kind?: "ai" | "integrated"; filters?: Record<string, unknown> }) => {
    try {
      const { databasePath } = ensureDatabase();
      const query = { filters: payload?.filters ?? {}, limit: 500, offset: 0 };
      const first = payload?.kind === "integrated" ? queryIntegratedResults(getSourceDatabasePath(), databasePath, query) : queryAiResults(databasePath, query);
      const items = [...first.items];
      while (items.length < first.total) {
        const next = payload?.kind === "integrated" ? queryIntegratedResults(getSourceDatabasePath(), databasePath, { ...query, offset: items.length }) : queryAiResults(databasePath, { ...query, offset: items.length });
        if (!next.items.length) break;
        items.push(...next.items);
      }
      return saveJson(`${payload?.kind === "integrated" ? "integrated" : "ai"}-analysis-results-${Date.now()}.json`, { schemaName: "jaa-ai-analysis-query-export-v1", createdAt: new Date().toISOString(), kind: payload?.kind ?? "ai", filters: query.filters, total: items.length, items });
    } catch (error) { return safeError(error); }
  });
  ipcMain.handle("ai-database:open-folder", async () => {
    try { await shell.openPath(path.dirname(getAiAnalysisDatabasePath())); return { ok: true, folderPath: path.dirname(getAiAnalysisDatabasePath()) }; } catch (error) { return safeError(error); }
  });
}
