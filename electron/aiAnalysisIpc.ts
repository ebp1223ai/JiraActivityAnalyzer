import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import {
  AI_ANALYSIS_IPC_VERSION,
  AiAnalysisError,
  emptyTokenUsage,
  type AiAnalysisRun,
  type AiAnalysisSnapshot,
  type AiAnalyzerMode,
  type AiDiagnosticRun,
  type AiDiagnosticStep,
  type AiExportFormat,
  type AiPendingDataset,
  type AiRulesSnapshot,
  type AiServiceKey,
  type AiSettingsUpdate
} from "../shared/aiAnalysisContract.js";
import {
  analyzedDocument,
  atomicExport,
  callAiProvider,
  classifyOffline,
  initializeAiDatabase,
  loadAiEnvironment,
  loadPendingDataset,
  loadRulesSnapshot,
  persistCompletedRun,
  persistReview,
  saveAiSettings,
  sha256Text
} from "./aiAnalysisCore.js";
import { ensureDir, getAppDataDir, getAppRuntimeDir, getExportsDir } from "./appPaths.js";

type Environment = ReturnType<typeof loadAiEnvironment>;
const handlers = [
  "ai-analysis:snapshot", "ai-analysis:reload-env", "ai-analysis:save-settings", "ai-analysis:test-connection",
  "ai-analysis:diagnose", "ai-analysis:chat", "ai-analysis:choose-rules", "ai-analysis:load-rules",
  "ai-analysis:choose-pending", "ai-analysis:start", "ai-analysis:cancel", "ai-analysis:review",
  "ai-analysis:export", "ai-analysis:open-folder"
];

function now() { return new Date().toISOString(); }
function errorPayload(error: unknown) {
  const value = error instanceof AiAnalysisError ? error : new AiAnalysisError("AI_RESPONSE_INVALID", error instanceof Error ? error.message : String(error));
  return { ok: false, errorCode: value.code, message: value.message };
}

function publicEnv(environment: Environment) {
  const { values: _values, ...summary } = environment;
  return summary;
}

function resolveConfiguredPath(value: string | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(getAppRuntimeDir(), value);
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, "\"\"")}"`; }
function csvForRun(run: AiAnalysisRun) {
  const header = ["run_id", "source_diff_id", "status", "skill_id", "skill_name", "score", "confidence", "reason"];
  const rows = run.results.flatMap((result) => result.candidates.length
    ? result.candidates.map((candidate) => [run.runId, result.sourceDiffId, result.status, candidate.skillId, candidate.skillName, candidate.score, candidate.confidence, candidate.reason])
    : [[run.runId, result.sourceDiffId, result.status, "", "", "", "", ""]]);
  return "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function htmlForRun(run: AiAnalysisRun) {
  const rows = run.results.map((result) => `<tr><td>${escapeHtml(result.sourceDiffId)}</td><td>${escapeHtml(result.status)}</td><td>${result.candidates.map((candidate) => `${escapeHtml(candidate.skillId)} (${candidate.score ?? "-"})`).join("<br>") || "-"}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI Analysis ${escapeHtml(run.runId)}</title><style>body{font:14px system-ui;margin:32px;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5e2;padding:8px;text-align:left}th{background:#edf3fa}code{word-break:break-all}</style><h1>AI Analysis Report</h1><p>Run: <code>${escapeHtml(run.runId)}</code></p><p>Mode: ${escapeHtml(run.analyzerMode)} | Status: ${escapeHtml(run.status)}</p><table><thead><tr><th>Source Diff</th><th>Status</th><th>Skill Candidates</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}
function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!); }

export function registerAiAnalysisIpc() {
  handlers.forEach((channel) => ipcMain.removeHandler(channel));
  const envPath = path.join(getAppRuntimeDir(), ".env");
  const templatePath = path.join(getAppRuntimeDir(), ".env.version");
  let environment = loadAiEnvironment(envPath, templatePath);
  let rules: AiRulesSnapshot | null = null;
  const pendingDatasets: AiPendingDataset[] = [];
  const runs: AiAnalysisRun[] = [];
  let selectedPendingDatasetId: string | null = null;
  let selectedRunId: string | null = null;
  let activeRunId: string | null = null;
  const abortControllers = new Map<string, AbortController>();

  const snapshot = (): AiAnalysisSnapshot => ({
    ipcVersion: AI_ANALYSIS_IPC_VERSION, env: publicEnv(environment), rules,
    pendingDatasets, selectedPendingDatasetId, runs, selectedRunId, activeRunId
  });
  const notify = (event: IpcMainInvokeEvent) => event.sender.send("ai-analysis:snapshot-changed", snapshot());
  const settingsAndSecret = (service: AiServiceKey) => ({
    settings: service === "cloud" ? environment.cloud : environment.local,
    secret: environment.values[service === "cloud" ? "AI_CLOUD_API_KEY" : "AI_LOCAL_TOKEN"] ?? environment.values.AI_LOCAL_AUTH_TOKEN ?? ""
  });

  ipcMain.handle("ai-analysis:snapshot", async () => snapshot());
  ipcMain.handle("ai-analysis:reload-env", async () => {
    environment = loadAiEnvironment(envPath, templatePath);
    return snapshot();
  });
  ipcMain.handle("ai-analysis:save-settings", async (_event, update: AiSettingsUpdate) => {
    try { environment = saveAiSettings(envPath, update); return { ok: true, snapshot: snapshot() }; }
    catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:test-connection", async (_event, service: AiServiceKey) => {
    try {
      const { settings, secret } = settingsAndSecret(service);
      const result = await callAiProvider(settings, secret, "Reply with exactly: OK");
      settings.connectionStatus = "passed";
      settings.testedFingerprint = settings.configFingerprint;
      return result;
    } catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:diagnose", async (_event, service: AiServiceKey) => {
    const startedAt = now();
    const stepNames: Array<[AiDiagnosticStep["id"], string]> = [
      ["configuration", "Configuration"], ["network", "Network"], ["tls", "TLS"], ["authentication", "Authentication"],
      ["model", "Model"], ["contract", "API contract"], ["persistence", "Diagnostic persistence"]
    ];
    const steps: AiDiagnosticStep[] = stepNames.map(([id, name]) => ({ id, name, status: "pending", startedAt: null, completedAt: null, durationMs: null, errorCode: null, message: "Pending", requestSummary: {}, responseSummary: {} }));
    const diagnostic: AiDiagnosticRun = { runId: `diag_${crypto.randomUUID()}`, service, status: "running", startedAt, completedAt: null, testedFingerprint: settingsAndSecret(service).settings.configFingerprint, steps, folderPath: null, copySummary: "" };
    const folder = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", diagnostic.runId));
    try {
      const { settings, secret } = settingsAndSecret(service);
      if (!environment.found || !environment.supported) throw new AiAnalysisError(environment.errorCode ?? "ENV_PARSE_ERROR", environment.message);
      const result = await callAiProvider(settings, secret, "Reply with exactly: DIAGNOSTIC_OK");
      const completedAt = now();
      diagnostic.steps = steps.map((step) => ({ ...step, status: step.id === "tls" && !settings.endpoint.startsWith("https:") ? "skipped" : "passed", startedAt, completedAt, durationMs: result.elapsedMs, message: "Passed", requestSummary: { endpoint: settings.endpoint, model: settings.model, authorization: "[masked]" }, responseSummary: result.sanitizedResponse }));
      diagnostic.status = "passed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder;
      diagnostic.copySummary = `Service: ${service}\nStatus: passed\nModel: ${settings.model}\nAuthorization: [masked]\nRequest ID: ${result.requestId ?? "unavailable"}`;
    } catch (error) {
      const value = error instanceof AiAnalysisError ? error : new AiAnalysisError("AI_RESPONSE_INVALID", String(error));
      const completedAt = now();
      diagnostic.steps = steps.map((step, index) => ({ ...step, status: index === 0 && value.code.startsWith("ENV_") ? "failed" : index < 6 ? "failed" : "passed", startedAt, completedAt, durationMs: Date.now() - Date.parse(startedAt), errorCode: index < 6 ? value.code : null, message: index < 6 ? value.message : "Failure diagnostics persisted.", requestSummary: { authorization: "[masked]" }, responseSummary: {} }));
      diagnostic.status = "failed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder;
      diagnostic.copySummary = `Service: ${service}\nStatus: failed\nError: ${value.code}\nAuthorization: [masked]`;
    }
    atomicExport(path.join(folder, "diagnostic-summary.json"), JSON.stringify(diagnostic, null, 2));
    atomicExport(path.join(folder, "event-log.jsonl"), diagnostic.steps.map((step) => JSON.stringify({ time: step.completedAt, step: step.id, status: step.status, errorCode: step.errorCode })).join("\n") + "\n");
    atomicExport(path.join(folder, "request-sanitized.json"), JSON.stringify({ service, authorization: "[masked]", fingerprint: diagnostic.testedFingerprint }, null, 2));
    atomicExport(path.join(folder, "response-sanitized.json"), JSON.stringify({ status: diagnostic.status, steps: diagnostic.steps.map((step) => step.responseSummary) }, null, 2));
    atomicExport(path.join(folder, "environment.txt"), `ENV_FORMAT_VERSION=${environment.formatVersion ?? "missing"}\nSecret=[masked]\n`);
    return diagnostic;
  });
  ipcMain.handle("ai-analysis:chat", async (_event, payload: { service: AiServiceKey; sessionId: string; messages: Array<{ role: "user" | "assistant"; text: string }> }) => {
    try {
      const { settings, secret } = settingsAndSecret(payload.service);
      const prompt = payload.messages.slice(-12).map((item) => `${item.role.toUpperCase()}: ${item.text}`).join("\n") + "\nASSISTANT:";
      const result = await callAiProvider(settings, secret, prompt);
      return { ok: true, message: { id: crypto.randomUUID(), sessionId: payload.sessionId, role: "assistant", service: payload.service, provider: settings.provider, model: settings.model, createdAt: now(), elapsedMs: result.elapsedMs, usage: result.usage, text: result.text } };
    } catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:choose-rules", async () => {
    const choice = await dialog.showOpenDialog({ title: "Select AI analysis rules folder", properties: ["openDirectory"] });
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    try { rules = loadRulesSnapshot(choice.filePaths[0], [choice.filePaths[0], getAppRuntimeDir()]); return { canceled: false, snapshot: snapshot() }; }
    catch (error) { return { canceled: false, ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:load-rules", async (_event, folderPath?: string) => {
    try {
      const configured = folderPath || environment.values.AI_ANALYSIS_RULES_DIR;
      if (!configured) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "AI_ANALYSIS_RULES_DIR is not configured.");
      const resolved = resolveConfiguredPath(configured, "");
      rules = loadRulesSnapshot(resolved, [resolved, getAppRuntimeDir()]);
      return { ok: true, snapshot: snapshot() };
    } catch (error) { return { ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:choose-pending", async () => {
    const choice = await dialog.showOpenDialog({ title: "Open pending-analysis JSON", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    try {
      const dataset = loadPendingDataset(choice.filePaths[0]);
      const existing = pendingDatasets.findIndex((item) => item.sourceFileSha256 === dataset.sourceFileSha256);
      if (existing >= 0) pendingDatasets.splice(existing, 1);
      pendingDatasets.unshift(dataset); selectedPendingDatasetId = dataset.datasetId;
      return { canceled: false, snapshot: snapshot() };
    } catch (error) { return { canceled: false, ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:start", async (event, payload: { mode: AiAnalyzerMode; datasetId: string; selectedDiffIds: string[]; service?: AiServiceKey }) => {
    if (activeRunId) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another analysis run is active."));
    const dataset = pendingDatasets.find((item) => item.datasetId === payload.datasetId);
    if (!dataset || !rules?.valid || !payload.selectedDiffIds.length) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "A verified dataset, rules snapshot, and at least one diff are required."));
    if (payload.selectedDiffIds.some((id) => !dataset.diffs.some((diff) => diff.sourceDiffId === id))) return errorPayload(new AiAnalysisError("SOURCE_MISMATCH", "Selected diff does not belong to the selected dataset."));
    const service = payload.service ?? (payload.mode === "CLOUD_AI" ? "cloud" : "local");
    const provider = payload.mode === "OFFLINE_RULE" ? "Offline Rule Analyzer" : settingsAndSecret(service).settings.provider;
    const model = payload.mode === "OFFLINE_RULE" ? rules.classificationEngineVersion : settingsAndSecret(service).settings.model;
    const runId = `analysis_${crypto.randomUUID()}`;
    const startedAt = now();
    const run: AiAnalysisRun = {
      runId, revision: runs.filter((item) => item.sourceDatasetId === dataset.datasetId).length + 1, status: "running", analyzerMode: payload.mode,
      sourceDatasetId: dataset.datasetId, sourceFileName: dataset.fileName, sourceFileSha256: dataset.sourceFileSha256,
      sourceDatabaseId: dataset.sourceDatabaseId, jiraServerFingerprint: dataset.jiraServerFingerprint, selectedDiffIds: [...payload.selectedDiffIds],
      provider, model, apiContract: payload.mode === "OFFLINE_RULE" ? "offline" : settingsAndSecret(service).settings.apiContract,
      configFingerprint: payload.mode === "OFFLINE_RULE" ? null : settingsAndSecret(service).settings.configFingerprint,
      rules: structuredClone(rules), startedAt, completedAt: null,
      progress: { runId, status: "running", totalBatches: payload.mode === "OFFLINE_RULE" ? 1 : payload.selectedDiffIds.length, completedBatches: 0, failedBatches: 0, currentBatch: 1, totalDiffs: payload.selectedDiffIds.length, completedDiffs: 0, requestCount: 0, retryCount: 0, elapsedMs: 0, usage: emptyTokenUsage(payload.mode === "OFFLINE_RULE" ? "not_applicable" : "unavailable"), message: "Analysis started.", errorCode: null },
      results: [], analyzedFileName: `analyzed-${dataset.fileName.replace(/^pending-analysis[-_]?/i, "").replace(/\.json$/i, "")}-${Date.now()}.json`, analyzedFilePath: null, databasePath: null
    };
    runs.unshift(run); activeRunId = runId; selectedRunId = runId;
    const controller = new AbortController(); abortControllers.set(runId, controller); notify(event);
    try {
      if (payload.mode === "OFFLINE_RULE") run.results = classifyOffline(dataset, payload.selectedDiffIds, run.rules);
      else {
        const { settings, secret } = settingsAndSecret(service);
        const selected = dataset.diffs.filter((diff) => payload.selectedDiffIds.includes(diff.sourceDiffId));
        for (let index = 0; index < selected.length; index += 1) {
          if (controller.signal.aborted) throw new AiAnalysisError("RUN_CANCELLED", "Run cancelled.");
          const diff = selected[index];
          run.progress.currentBatch = index + 1;
          const prompt = `Return one compact JSON object with candidates array. Each candidate: skillId, score 0-100, confidence 0-1, reason. Use only catalog IDs: ${run.rules.catalog.map((item) => item.id).join(",")}. Evidence: ${JSON.stringify(diff)}`;
          if (settings.contextWindow && Math.ceil(prompt.length / 4) > settings.contextWindow) throw new AiAnalysisError("INPUT_TOO_LARGE", "A selected diff exceeds the configured context window.");
          const response = await callAiProvider(settings, secret, prompt, controller.signal);
          run.progress.requestCount += 1;
          let parsed: { candidates?: Array<{ skillId?: string; score?: number; confidence?: number; reason?: string }> } = {};
          try { parsed = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, "")); } catch { throw new AiAnalysisError("AI_RESPONSE_INVALID", "Analyzer returned invalid JSON."); }
          const candidates = (parsed.candidates ?? []).filter((item) => run.rules.catalog.some((skill) => skill.id === item.skillId)).map((item) => {
            const skill = run.rules.catalog.find((value) => value.id === item.skillId)!;
            return { skillId: skill.id, skillName: skill.name, group: skill.group, score: typeof item.score === "number" ? item.score : null, confidence: typeof item.confidence === "number" ? item.confidence : null, positiveEvidenceRefs: [diff.evidenceId], negativeEvidenceRefs: [], matchedRuleIds: [], reason: item.reason ?? "Provider candidate", status: "PENDING_REVIEW" as const };
          });
          run.results.push({ resultId: `result_${crypto.randomUUID()}`, sourceDiffId: diff.sourceDiffId, sourceContentHash: diff.sourceContentHash, evidenceRefs: [diff.evidenceId], candidates, status: candidates.length ? "PENDING_REVIEW" : "NEEDS_REVIEW", analyzerVersion: model, requestTraceId: response.requestId, usage: response.usage, rawResultAvailable: true, reviewNote: "", reviewedAt: null });
          run.progress.completedDiffs = index + 1; run.progress.completedBatches = index + 1; run.progress.elapsedMs = Date.now() - Date.parse(startedAt); notify(event);
        }
      }
      run.status = "completed"; run.completedAt = now(); run.progress.status = "completed"; run.progress.completedBatches = 1; run.progress.completedDiffs = run.results.length; run.progress.elapsedMs = Date.now() - Date.parse(startedAt); run.progress.message = "Analysis completed. Results require human review.";
      const dbPath = resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, path.join(getAppDataDir(), "ai-analysis", "ai-analysis.sqlite3"));
      initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run); run.databasePath = dbPath;
      const outputDir = ensureDir(path.join(getExportsDir(), "ai-analysis"));
      const exported = atomicExport(path.join(outputDir, run.analyzedFileName), JSON.stringify(analyzedDocument(run), null, 2)); run.analyzedFilePath = exported.filePath;
    } catch (error) {
      const value = error instanceof AiAnalysisError ? error : new AiAnalysisError("AI_RESPONSE_INVALID", error instanceof Error ? error.message : String(error));
      run.status = value.code === "RUN_CANCELLED" ? "cancelled" : "failed"; run.completedAt = now(); run.progress.status = run.status; run.progress.errorCode = value.code; run.progress.message = value.message; run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
    } finally { activeRunId = null; abortControllers.delete(runId); notify(event); }
    return { ok: run.status === "completed", run, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:cancel", async (_event, runId: string) => {
    const controller = abortControllers.get(runId); if (!controller) return { ok: false, message: "Run is not active." };
    controller.abort(); return { ok: true };
  });
  ipcMain.handle("ai-analysis:review", async (_event, payload: { runId: string; resultId: string; status: "CONFIRMED" | "REJECTED" | "PENDING_REVIEW"; note: string }) => {
    const run = runs.find((item) => item.runId === payload.runId); const result = run?.results.find((item) => item.resultId === payload.resultId);
    if (!run || !result) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Analysis result was not found."));
    const priorStatus = result.status;
    result.status = payload.status; result.reviewNote = payload.note; result.reviewedAt = now();
    if (run.databasePath) persistReview(run.databasePath, run.runId, result.resultId, priorStatus, payload.status, payload.note);
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:export", async (_event, payload: { runId: string; format: AiExportFormat }) => {
    const run = runs.find((item) => item.runId === payload.runId);
    if (!run || run.status !== "completed") return errorPayload(new AiAnalysisError("PARTIAL_RESULT_FORBIDDEN", "Only completed runs may be exported."));
    const extension = payload.format; const fileName = run.analyzedFileName.replace(/\.json$/i, `.${extension}`);
    const choice = await dialog.showSaveDialog({ defaultPath: path.join(ensureDir(path.join(getExportsDir(), "ai-analysis")), fileName), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    const content = payload.format === "json" ? JSON.stringify(analyzedDocument(run), null, 2) : payload.format === "csv" ? csvForRun(run) : htmlForRun(run);
    return { canceled: false, ...atomicExport(choice.filePath, content) };
  });
  ipcMain.handle("ai-analysis:open-folder", async (_event, folderPath?: string) => {
    const folder = folderPath || ensureDir(path.join(getExportsDir(), "ai-analysis"));
    const error = await shell.openPath(folder); return { ok: !error, folderPath: folder, error: error || undefined };
  });

  if (environment.supported && environment.values.AI_ANALYSIS_RULES_DIR) {
    try { const resolved = resolveConfiguredPath(environment.values.AI_ANALYSIS_RULES_DIR, ""); rules = loadRulesSnapshot(resolved, [resolved, getAppRuntimeDir()]); } catch { /* surfaced in UI */ }
  }
  if (environment.supported && environment.values.AI_ANALYSIS_DB_PATH) {
    try { initializeAiDatabase(resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, "")); } catch { /* fail closed on use */ }
  }
}
