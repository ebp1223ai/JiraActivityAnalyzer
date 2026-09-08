import { aiWriteServiceV044 } from "./aiWriteServiceV044.js";
import { instrumentedHandleV044 } from "./instrumentedIpcV044.js";
import fs from "./businessIoDiagnosticsV044.js";
import crypto from "node:crypto";
import { aiResultsServiceV044 } from "./aiResultsServiceV044.js";
import { automaticDiagnosticsV044, diagnosticContextV044 } from "./automaticDiagnosticsV044.js";
import { safeAiAuditV043, safeAiDatabaseDiagnosticV043 } from "./aiDiagnosticsV043.js";
import { tableCsvV043 } from "./aiTableExportV043.js";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app, dialog, ipcMain, shell } from "electron";
import { getAiAnalysisDatabasePath, getAppRuntimeDir, getBackupsDir, getExportsDir } from "./appPaths.js";
import { aiDatabaseDiagnosticsV042, importAiAnalysisPackageV042, recordSourceLinkAttemptV042, validateAiAnalysisPackageV042 } from "./aiAnalysisDatabaseV042.js";
import { AiAnalysisDatabaseStoreV042 } from "./aiAnalysisDatabaseLifecycleV042.js";
import { exportAiQueryV043, distinctAiResultsV042, latestAiQueryDiagnosticsV042, queryAiResultsV042, queryIntegratedResultsV042 } from "./aiResultsBridgeAdapterV043.js";

type Json = Record<string, any>;
let activeStore: AiAnalysisDatabaseStoreV042 | null = null;
let latestStaleDiagnostics: Json[] = [];

function asset(fileName: string) { return process.defaultApp ? path.resolve(process.cwd(), "contracts", "ai-analysis", fileName) : path.join(process.resourcesPath, "ai-analysis-contracts", fileName); }
const packageSchemaPath = () => asset("jaa-ai-analysis-package_v2.0.0.schema.json");
const traceSchemaPath = () => asset("jaa-source-trace_v1.0.0.schema.json");
function id(payload: unknown) { const value = String((payload as Json | null)?.requestId ?? ""); if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw new Error("INVALID_REQUEST_ID"); return value; }
function fail(error: unknown, requestId = "") { const value = error as Json; return { ok: false, requestId, diagnosticId: `AI043-${requestId || Date.now()}`, errorCode: value?.message ?? "AI_DATABASE_OPERATION_FAILED", message: value?.message ?? String(error), preview: value?.preview, snapshot: value?.snapshot }; }
function filePath(payload: unknown) { const value = String((payload as Json | null)?.filePath ?? "").trim(); if (!value || value.includes("\0") || value.length > 32767) throw new Error("INVALID_FILE_PATH"); return path.resolve(value); }
async function choose(title: string, extensions: string[]) { const result = await dialog.showOpenDialog({ title, properties: ["openFile"], filters: [{ name: title, extensions }] }); return result.canceled ? "" : result.filePaths[0] ?? ""; }
function writeAtomic(target: string, value: unknown, plain = false) { fs.mkdirSync(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${Date.now()}.tmp`; try { fs.writeFileSync(temporary, plain ? String(value) : JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, target); } finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ } } }
async function save(defaultName: string, value: unknown, csv = false) { const result = await dialog.showSaveDialog({ defaultPath: path.join(getExportsDir(), defaultName), filters: [{ name: csv ? "CSV (JSON encoded cells)" : "JSON", extensions: [csv ? "csv" : "json"] }] }); if (result.canceled || !result.filePath) return { canceled: true }; writeAtomic(result.filePath, value, csv); return { canceled: false, filePath: result.filePath, sizeBytes: fs.statSync(result.filePath).size }; }

export function getActiveAiDatabasePathV042() { const snapshot = activeStore?.lifecycle(); return snapshot?.canQuery ? snapshot.databasePath : ""; }
export function getAiDatabaseV042Diagnostics() { return { schemaName: "jaa-ai-analysis-diagnostics-v0.3.43", createdAtUtc: new Date().toISOString(), activeDatabase: safeAiDatabaseDiagnosticV043(activeStore?.lifecycle() ?? null), queryReceipts: aiResultsServiceV044.diagnostics(), staleResponseDiscards: latestStaleDiagnostics.slice(-100), latestSwitchFailure: null }; }

export function registerAiAnalysisDatabaseIpcV042(getRawDatabasePath: () => string) {
  const store = new AiAnalysisDatabaseStoreV042({ appRoot: getAppRuntimeDir(), defaultDatabasePath: getAiAnalysisDatabasePath(), backupDirectory: path.join(getBackupsDir(), "ai-analysis", "migration") });
  activeStore = store;
  let preview: Json | null = null;
  const lifecycle = () => store.lifecycle();

  instrumentedHandleV044("ai-database:lifecycle", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); return { ok: true, requestId, snapshot: lifecycle() }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:create", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const supplied = String((payload as Json)?.filePath ?? ""); const result = supplied ? { canceled: false, filePath: supplied } : await dialog.showSaveDialog({ title: "建立 AI 分析資料庫 v2", defaultPath: path.join(getAppRuntimeDir(), "databases", "ai-analysis", "jaa-ai-analysis-v2.sqlite"), filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }] }); if (result.canceled || !result.filePath) return { ok: true, requestId, canceled: true, snapshot: lifecycle() }; return { ...store.createAndActivate(result.filePath), requestId, canceled: false }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:open-switch", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const selected = String((payload as Json)?.filePath ?? "") || await choose("開啟／切換 AI 分析資料庫", ["sqlite", "db"]); if (!selected) return { ok: true, requestId, canceled: true, snapshot: lifecycle() }; return { ok: true, requestId, canceled: false, snapshot: store.openAndActivate(selected) }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:forget", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const databaseId = String((payload as Json)?.databaseId ?? ""); if (!databaseId) throw new Error("AI_DATABASE_IDENTITY_REQUIRED"); return { ok: true, requestId, snapshot: store.forget(databaseId) }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:health-check", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); return { ok: true, requestId, snapshot: lifecycle() }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:backup", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); return { ...store.backup(path.join(getBackupsDir(), "ai-analysis")), requestId }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:select-import", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const selected = await choose("選擇 AI Analysis Package v2", ["json"]); if (!selected) return { ok: true, requestId, canceled: true }; const databasePath = store.activePath(); const result = await aiWriteServiceV044.run(_event.sender.id, { requestId, action: "preflight", input: { filePath: selected, packageSchemaPath: packageSchemaPath(), sourceTraceSchemaPath: traceSchemaPath(), databasePath } }); if (store.activePath() !== databasePath) throw Error("SUPERSEDED"); preview = result.ok ? { ...result, databasePath } : null; return { ...result, requestId, canceled: false }; } catch (error) { preview = null; return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:preflight", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const selected = filePath(payload); const databasePath = store.activePath(); const result = await aiWriteServiceV044.run(_event.sender.id, { requestId, action: "preflight", input: { filePath: selected, packageSchemaPath: packageSchemaPath(), sourceTraceSchemaPath: traceSchemaPath(), databasePath } }); if (store.activePath() !== databasePath) throw Error("SUPERSEDED"); preview = result.ok ? { ...result, databasePath } : null; return { ...result, requestId }; } catch (error) { preview = null; return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:cancel-preflight", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); preview = null; return { ok: true, requestId, canceled: true }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:import", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); if ((payload as Json)?.confirmed !== true) throw new Error("IMPORT_CONFIRMATION_REQUIRED"); const selected = filePath(payload), databasePath = store.activePath(); if (!preview?.ok || preview.databasePath !== databasePath || path.resolve(preview.filePath) !== selected) throw new Error("IMPORT_PREFLIGHT_REQUIRED"); const receipt = await aiWriteServiceV044.run(_event.sender.id, { requestId, action: "import", input: { databasePath, packageSchemaPath: packageSchemaPath(), sourceTraceSchemaPath: traceSchemaPath(), packagePath: selected, expectedPackageSha256: preview.packageSha256 } }); preview = null; return { ...receipt, requestId, snapshot: lifecycle() }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:relink", async (event, payload) => { let requestId = ""; try { requestId = id(payload); const result = await aiWriteServiceV044.run(event.sender.id, { requestId, action: "relink", databasePath: store.activePath(), rawPath: getRawDatabasePath() }); return { ...result, requestId, snapshot: lifecycle() }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:cancel-write", async (event, payload) => { const requestId = id(payload); await automaticDiagnosticsV044()?.event("cancel-requested", "POINT", { requestId, type: "transaction" }); return { ok: true, requestId, ...aiWriteServiceV044.cancel(event.sender.id, requestId) }; });
  instrumentedHandleV044("ai-database:write-state", () => aiWriteServiceV044.state());
  const runQuery = async (event: Electron.IpcMainInvokeEvent, payload: Json, action: string, kind: string) => {
    const requestId = id(payload), context = diagnosticContextV044.getStore();
    if (payload.__trustedOutput && action !== "export-file") throw Error("INVALID_QUERY_ARGUMENT");
    const snapshot = lifecycle(), raw = getRawDatabasePath() || null;
    const value = await aiResultsServiceV044.run(event.sender.id, { requestId, action, kind, ai: snapshot.canQuery ? store.activePath() : null, raw, query: action === "query" ? payload : payload.query ?? {}, field: payload.field, search: payload.search ?? "", diagnostic: automaticDiagnosticsV044() ? { ...automaticDiagnosticsV044()!.config, instanceId: automaticDiagnosticsV044()!.instanceId, context } : null, output: payload.__trustedOutput, format: payload.format, visible: payload.exportScope === "visible" ? payload.visibleFields ?? [] : undefined }, async stage => {
      const persisted = await automaticDiagnosticsV044()?.stage(context, stage);
      if (!event.sender.isDestroyed()) event.sender.send("ai-database:query-progress", { requestId, stage: stage.event, phase: stage.phase, ...stage.details });
      return persisted;
    });
    if (lifecycle().databaseId !== snapshot.databaseId || (getRawDatabasePath() || null) !== raw) throw new Error("SUPERSEDED");
    await automaticDiagnosticsV044()?.event("ipc-result-ready", "POINT", { requestId, rowCount: value.rows?.length ?? null }, context);
    return { ok: true, requestId, diagnosticContext: context ?? null, aiDatabaseIdentity: snapshot.databaseId ?? "", ...value };
  };
  instrumentedHandleV044("ai-database:query-results", async (event, payload) => { try { return await runQuery(event, payload, "query", "ai"); } catch (error) { return fail(error, String(payload?.requestId ?? "")); } });
  instrumentedHandleV044("ai-database:query-integrated", async (event, payload) => { try { return await runQuery(event, payload, "query", "integrated"); } catch (error) { return fail(error, String(payload?.requestId ?? "")); } });
  instrumentedHandleV044("ai-database:distinct", async (event, payload) => { try { return await runQuery(event, payload, "facet", payload?.kind === "integrated" ? "integrated" : "ai"); } catch (error) { return fail(error, String(payload?.requestId ?? "")); } });
  instrumentedHandleV044("ai-database:cancel-query", async (event, payload) => { const requestId = id(payload); await automaticDiagnosticsV044()?.event("cancel-requested", "POINT", { requestId }); return { ok: true, requestId, ...await aiResultsServiceV044.cancel(event.sender.id, requestId) }; });
  instrumentedHandleV044("ai-database:report-stale", async (_event, payload) => { const event = { at: new Date().toISOString(), ...(payload as Json), reason: "STALE_RESPONSE_DISCARDED" }; latestStaleDiagnostics.push(event); latestStaleDiagnostics = latestStaleDiagnostics.slice(-100); return { ok: true }; });
  instrumentedHandleV044("ai-database:export-query", async (event, payload) => {
    let requestId = "", temporary = "";
    try {
      requestId = id(payload); if (payload?.__trustedOutput) throw Error("INVALID_QUERY_ARGUMENT");
      const kind = payload?.kind === "integrated" ? "integrated" : "ai", csv = payload?.format === "csv";
      const picked = await dialog.showSaveDialog({ defaultPath: path.join(getExportsDir(), kind + '-table-results-' + Date.now() + (csv ? '.csv' : '.json')), filters: [{ name: csv ? 'CSV' : 'JSON', extensions: [csv ? 'csv' : 'json'] }] });
      if (picked.canceled || !picked.filePath) return { ok: true, requestId, canceled: true };
      temporary = picked.filePath + '.' + crypto.randomUUID() + '.partial';
      const result = await runQuery(event, { ...payload, __trustedOutput: temporary }, "export-file", kind);
      await fs.promises.rename(temporary, picked.filePath);
      return { ok: true, requestId, canceled: false, filePath: picked.filePath, sizeBytes: result.sizeBytes, filteredCount: result.filteredCount };
    } catch (error) { return fail(error, requestId); }
    finally { if (temporary) await fs.promises.unlink(temporary).catch(() => {}); }
  });
  instrumentedHandleV044("ai-database:export-diagnostics", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const database = lifecycle().canQuery ? aiDatabaseDiagnosticsV042(store.activePath()) : null; return { ok: true, requestId, ...(await save(`ai-analysis-diagnostic-${Date.now()}.json`, { ...getAiDatabaseV042Diagnostics(), database: safeAiAuditV043(database) })) }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:open-folder", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const target = path.dirname(lifecycle().databasePath || getAiAnalysisDatabasePath()); const error = await shell.openPath(target); if (error) throw new Error("OPEN_AI_DATABASE_FOLDER_FAILED"); return { ok: true, requestId, folderPath: target }; } catch (error) { return fail(error, requestId); } });
  instrumentedHandleV044("ai-database:open-workbench", async (_event, payload) => { let requestId = ""; try { requestId = id(payload); const target = asset("Skill_Analysis_Review_Workbench_v1.13.2.html"); const error = await shell.openPath(target); if (error) throw new Error("OPEN_WORKBENCH_FAILED"); return { ok: true, requestId, filePath: target }; } catch (error) { return fail(error, requestId); } });
}
