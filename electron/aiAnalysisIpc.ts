import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import {
  AI_ANALYSIS_IPC_VERSION,
  AI_ANALYZED_FILE_SCHEMA_VERSION,
  AI_ANALYZED_LEGACY_FILE_SCHEMA_VERSIONS,
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
  callAiNexus,
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
import { getChatGptService } from "./chatGptService.js";
import {
  adaptLegacyAnalyzedRun,
  buildCompactPayload,
  buildDistributionDiagnostics,
  buildSingleRunPrompt,
  goldenHtmlForRun,
  parseSingleRunResponse,
  preflightSingleRunCapacity,
  SINGLE_RUN_PROMPT_VERSION,
  stageVisibleProviderResponse,
  validateGoldenHtml
} from "./aiAnalysisSingleRunV0311.js";

declare const __MAIN_APP_VERSION__: string;
declare const __MAIN_BUILD_TIME__: string;
declare const __MAIN_GIT_COMMIT__: string;
type Environment = ReturnType<typeof loadAiEnvironment>;
const handlers = [
  "ai-analysis:snapshot", "ai-analysis:reload-env", "ai-analysis:save-settings", "ai-analysis:test-connection",
  "ai-analysis:diagnose", "ai-analysis:cancel-diagnostic", "ai-analysis:chat", "ai-analysis:choose-rules", "ai-analysis:load-rules",
  "ai-analysis:choose-pending", "ai-analysis:verify-pending", "ai-analysis:select-pending", "ai-analysis:choose-analyzed", "ai-analysis:select-run", "ai-analysis:start", "ai-analysis:cancel", "ai-analysis:review",
  "ai-analysis:export", "ai-analysis:open-folder", "ai-analysis:chatgpt-start", "ai-analysis:chatgpt-login",
  "ai-analysis:chatgpt-cancel-login", "ai-analysis:chatgpt-logout", "ai-analysis:chatgpt-refresh", "ai-analysis:chatgpt-select-model", "ai-analysis:cancel-chat"
];

function now() { return new Date().toISOString(); }
function asAnalysisError(error: unknown) {
  if (error instanceof AiAnalysisError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("OUTCOME_UNKNOWN:")) return new AiAnalysisError("OUTCOME_UNKNOWN", message.slice("OUTCOME_UNKNOWN:".length));
  if (message.startsWith("RUN_CANCELLED:")) return new AiAnalysisError("RUN_CANCELLED", message.slice("RUN_CANCELLED:".length));
  if (message.includes("CHATGPT_USAGE_LIMITED")) return new AiAnalysisError("CHATGPT_USAGE_LIMITED", "ChatGPT usage limit has been reached.");
  if (message.includes("CHATGPT_SIGN_IN_REQUIRED")) return new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "Sign in with ChatGPT before analysis.");
  return new AiAnalysisError("AI_RESPONSE_INVALID", message);
}
function errorPayload(error: unknown) {
  const value = asAnalysisError(error);
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

function safeAnalyzedFileName(sourceFileName: string, runId: string) {
  const stem = sourceFileName.replace(/^分析-/u, "").replace(/^pending-analysis[-_]?/i, "").replace(/\.json$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 110) || "activity-events";
  return `分析-${stem}-${runId.slice(-8)}.json`;
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, "\"\"")}"`; }
function csvForRun(run: AiAnalysisRun) {
  const header = ["run_id", "source_diff_id", "status", "skill_id", "skill_name", "score", "confidence", "reason"];
  const rows = run.results.flatMap((result) => result.candidates.length
    ? result.candidates.map((candidate) => [run.runId, result.sourceDiffId, result.status, candidate.skillId, candidate.skillName, candidate.score, candidate.confidence, candidate.reason])
    : [[run.runId, result.sourceDiffId, result.status, "", "", "", "", ""]]);
  return "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function registerAiAnalysisIpc() {
  handlers.forEach((channel) => ipcMain.removeHandler(channel));
  const envPath = path.join(getAppRuntimeDir(), ".env");
  const templatePath = path.join(getAppRuntimeDir(), ".env.version");
  let environment = loadAiEnvironment(envPath, templatePath);
  const chatgpt = getChatGptService();
  chatgpt.subscribeStatus(() => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("ai-analysis:snapshot-changed", snapshot())));
  let rules: AiRulesSnapshot | null = null;
  const pendingDatasets: AiPendingDataset[] = [];
  const runs: AiAnalysisRun[] = [];
  let selectedPendingDatasetId: string | null = null;
  let selectedRunId: string | null = null;
  let activeRunId: string | null = null;
  const abortControllers = new Map<string, AbortController>();
  let activeChatController: AbortController | null = null;
  let activeDiagnosticController: AbortController | null = null;

  const snapshot = (): AiAnalysisSnapshot => ({
    ipcVersion: AI_ANALYSIS_IPC_VERSION, env: publicEnv(environment), rules,
    pendingDatasets, selectedPendingDatasetId, runs, selectedRunId, activeRunId, chatgpt: chatgpt.getStatus()
  });
  const notify = (event: IpcMainInvokeEvent) => event.sender.send("ai-analysis:snapshot-changed", snapshot());
  chatgpt.subscribeRun((providerEvent) => {
    const run = runs.find((item) => item.runId === providerEvent.runId);
    if (!run || activeRunId !== run.runId || run.status !== "running") return;
    if (providerEvent.type === "started") {
      run.progress.stage = "starting_turn";
      run.progress.threadCount = 1;
      run.progress.message = "Dedicated thread created; starting the single analysis turn.";
    } else if (providerEvent.type === "delta") {
      run.progress.stage = "receiving_response";
      run.progress.turnCount = 1;
      run.progress.message = "Receiving the single structured provider response.";
    } else if (providerEvent.type === "usage") {
      run.progress.usage = {
        inputTokens: providerEvent.inputTokens,
        cachedInputTokens: providerEvent.cachedInputTokens,
        outputTokens: providerEvent.outputTokens,
        reasoningTokens: providerEvent.reasoningTokens,
        totalTokens: providerEvent.totalTokens,
        availability: "actual",
        estimatedInputTokens: run.progress.usage.estimatedInputTokens
      };
    } else if (providerEvent.type === "completed") {
      run.progress.stage = "validating_response";
      run.progress.message = "Provider turn completed; validating identity conservation and evidence.";
    }
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("ai-analysis:snapshot-changed", snapshot()));
  });
  const settingsAndSecret = (service: AiServiceKey) => {
    if (service !== "ai_nexus") throw new AiAnalysisError("AI_NOT_CONFIGURED", "ChatGPT credentials and settings are managed by Codex App Server.");
    return { settings: environment.aiNexus, secret: environment.values.AI_NEXUS_TOKEN ?? "" };
  };

  ipcMain.handle("ai-analysis:chatgpt-start", async () => { try { return { ok: true, status: await chatgpt.start() }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:chatgpt-login", async () => { try { return { ok: true, status: await chatgpt.login() }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:chatgpt-cancel-login", async () => ({ ok: true, status: await chatgpt.cancelLogin() }));
  ipcMain.handle("ai-analysis:chatgpt-logout", async () => ({ ok: true, status: await chatgpt.logout() }));
  ipcMain.handle("ai-analysis:chatgpt-refresh", async () => { try { return { ok: true, status: await chatgpt.start() }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:chatgpt-select-model", async (_event, model: string | null) => { try { return { ok: true, status: chatgpt.selectModel(model) }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
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
      if (service === "chatgpt") {
        const started = Date.now(); const status = await chatgpt.start();
        if (status.state !== "connected") throw new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "Sign in with ChatGPT before running a test chat.");
        return { ok: true, service, testedFingerprint: status.runtimeSha256 ?? "", statusCode: null, requestId: null, elapsedMs: Date.now() - started, errorCode: null, message: "ChatGPT runtime, account, model list, and rate limits are ready.", usage: emptyTokenUsage(), sanitizedResponse: { runtimeVersion: status.runtimeVersion, modelCount: status.models.length, state: status.state } };
      }
      const { settings, secret } = settingsAndSecret(service);
      const result = await callAiNexus(settings, secret, "Reply with exactly: OK");
      settings.connectionStatus = "passed"; settings.testedFingerprint = settings.configFingerprint; return result;
    } catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:diagnose", async (_event, service: AiServiceKey) => {
    if (activeDiagnosticController) throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another diagnostic is active.");
    const diagnosticController = new AbortController();
    activeDiagnosticController = diagnosticController;
    const startedAt = now();
    const stepNames: Array<[AiDiagnosticStep["id"], string]> = [
      ["configuration", "Configuration"], ["network", "Network and runtime transport"], ["authentication", "Authentication"],
      ["model", "Model availability"], ["minimal_request", "Minimal non-secret request"], ["contract", "Response contract"], ["persistence", "Diagnostic persistence"]
    ];
    const steps: AiDiagnosticStep[] = stepNames.map(([id, name]) => ({ id, name, status: "pending", startedAt: null, completedAt: null, durationMs: null, errorCode: null, message: "Pending", requestSummary: {}, responseSummary: {} }));
    const diagnostic: AiDiagnosticRun = { runId: `diag_${crypto.randomUUID()}`, service, status: "running", startedAt, completedAt: null, testedFingerprint: service === "chatgpt" ? (chatgpt.getStatus().runtimeSha256 ?? "") : settingsAndSecret(service).settings.configFingerprint, steps, folderPath: null, copySummary: "" };
    const folder = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", diagnostic.runId));
    try {
      if (service === "chatgpt") {
        const status = await chatgpt.start();
        if (status.state !== "connected") throw new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "ChatGPT sign-in is required; account/model/quota checks were skipped.");
        const completedAt = now(); diagnostic.steps = steps.map((step) => ({ ...step, status: step.id === "persistence" ? "skipped" : "passed", startedAt, completedAt, durationMs: Date.now() - Date.parse(startedAt), message: step.id === "persistence" ? "No credential data is persisted by Jira Activity Analyzer." : "Passed", requestSummary: { runtimeVersion: status.runtimeVersion }, responseSummary: { state: status.state, modelCount: status.models.length } }));
        diagnostic.status = "passed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder; diagnostic.copySummary = `Service: ChatGPT\nStatus: passed\nRuntime: ${status.runtimeVersion}\nAccount: ${status.accountEmailMasked ?? "signed out"}`;
        throw Object.assign(new Error("CHATGPT_DIAGNOSTIC_COMPLETE"), { diagnosticComplete: true });
      }
      const { settings, secret } = settingsAndSecret(service);
      if (!environment.found || !environment.supported) throw new AiAnalysisError(environment.errorCode ?? "ENV_PARSE_ERROR", environment.message);
      const result = await callAiNexus(settings, secret, "Reply with exactly: DIAGNOSTIC_OK", diagnosticController.signal);
      const completedAt = now();
      diagnostic.steps = steps.map((step) => ({ ...step, status: step.id === "network" && !settings.endpoint.startsWith("https:") ? "skipped" : "passed", startedAt, completedAt, durationMs: result.elapsedMs, message: "Passed", requestSummary: { endpoint: settings.endpoint, model: settings.model, authorization: "[masked]" }, responseSummary: result.sanitizedResponse }));
      diagnostic.status = "passed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder;
      diagnostic.copySummary = `Service: ${service}\nStatus: passed\nModel: ${settings.model}\nAuthorization: [masked]\nRequest ID: ${result.requestId ?? "unavailable"}`;
    } catch (error) {
      if ((error as { diagnosticComplete?: boolean }).diagnosticComplete) { /* finalized above */ } else {
      const value = error instanceof AiAnalysisError ? error : new AiAnalysisError("AI_RESPONSE_INVALID", String(error));
      const completedAt = now();
      diagnostic.steps = steps.map((step, index) => ({ ...step, status: index === 0 && value.code.startsWith("ENV_") ? "failed" : index < 6 ? "failed" : "passed", startedAt, completedAt, durationMs: Date.now() - Date.parse(startedAt), errorCode: index < 6 ? value.code : null, message: index < 6 ? value.message : "Failure diagnostics persisted.", requestSummary: { authorization: "[masked]" }, responseSummary: {} }));
      diagnostic.status = "failed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder;
      diagnostic.copySummary = `Service: ${service}\nStatus: failed\nError: ${value.code}\nAuthorization: [masked]`;
      }
    }
    atomicExport(path.join(folder, "diagnostic-summary.json"), JSON.stringify(diagnostic, null, 2));
    atomicExport(path.join(folder, "event-log.jsonl"), diagnostic.steps.map((step) => JSON.stringify({ time: step.completedAt, step: step.id, status: step.status, errorCode: step.errorCode })).join("\n") + "\n");
    atomicExport(path.join(folder, "request-sanitized.json"), JSON.stringify({ service, authorization: "[masked]", fingerprint: diagnostic.testedFingerprint }, null, 2));
    atomicExport(path.join(folder, "response-sanitized.json"), JSON.stringify({ status: diagnostic.status, steps: diagnostic.steps.map((step) => step.responseSummary) }, null, 2));
    atomicExport(path.join(folder, "environment.txt"), `ENV_FORMAT_VERSION=${environment.formatVersion ?? "missing"}\nSecret=[masked]\n`);
    if (activeDiagnosticController === diagnosticController) activeDiagnosticController = null;
    return diagnostic;
  });
  ipcMain.handle("ai-analysis:cancel-diagnostic", async () => { if (!activeDiagnosticController) return { ok: false, message: "No diagnostic is active." }; activeDiagnosticController.abort(); return { ok: true }; });
  ipcMain.handle("ai-analysis:chat", async (_event, payload: { service: AiServiceKey; sessionId: string; messages: Array<{ role: "user" | "assistant"; text: string }> }) => {
    if (activeChatController) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another test conversation request is active."));
    const chatController = new AbortController();
    activeChatController = chatController;
    try {
      const prompt = payload.messages.slice(-12).map((item) => `${item.role.toUpperCase()}: ${item.text}`).join("\n") + "\nASSISTANT:";
      if (payload.service === "chatgpt") {
        const result = await chatgpt.runAnalysis({ prompt }, chatController.signal);
        const traceFolderPath = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", "manual-chat", payload.sessionId, crypto.randomUUID()));
        atomicExport(path.join(traceFolderPath, "request-sanitized.json"), JSON.stringify({ service: payload.service, messages: payload.messages, authorization: "[masked]" }, null, 2));
        atomicExport(path.join(traceFolderPath, "response-sanitized.json"), JSON.stringify({ model: result.model, text: result.text, usage: result.usage }, null, 2));
        return { ok: true, message: { id: crypto.randomUUID(), sessionId: payload.sessionId, role: "assistant", service: payload.service, provider: "chatgpt_codex", model: result.model, createdAt: now(), elapsedMs: result.elapsedMs, usage: { ...result.usage, availability: "actual", estimatedInputTokens: null }, text: result.text, traceFolderPath } };
      }
      const { settings, secret } = settingsAndSecret(payload.service); const result = await callAiNexus(settings, secret, prompt, chatController.signal);
      const traceFolderPath = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", "manual-chat", payload.sessionId, crypto.randomUUID()));
      atomicExport(path.join(traceFolderPath, "request-sanitized.json"), JSON.stringify({ service: payload.service, messages: payload.messages, endpoint: settings.endpoint, model: settings.model, authorization: "[masked]" }, null, 2));
      atomicExport(path.join(traceFolderPath, "response-sanitized.json"), JSON.stringify({ model: settings.model, text: result.text, usage: result.usage, requestId: result.requestId }, null, 2));
      return { ok: true, message: { id: crypto.randomUUID(), sessionId: payload.sessionId, role: "assistant", service: payload.service, provider: "ai_nexus", model: settings.model, createdAt: now(), elapsedMs: result.elapsedMs, usage: result.usage, text: result.text, traceFolderPath } };
    } catch (error) { return errorPayload(error); }
    finally { if (activeChatController === chatController) activeChatController = null; }
  });
  ipcMain.handle("ai-analysis:cancel-chat", async () => { if (!activeChatController) return { ok: false, message: "No test conversation request is active." }; activeChatController.abort(); return { ok: true }; });
  ipcMain.handle("ai-analysis:choose-rules", async () => {
    const choice = await dialog.showOpenDialog({ title: "Select AI analysis rules folder", properties: ["openDirectory"] });
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    try { rules = loadRulesSnapshot(choice.filePaths[0], [choice.filePaths[0], getAppRuntimeDir()]); return { canceled: false, snapshot: snapshot() }; }
    catch (error) { return { canceled: false, ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:load-rules", async () => {
    try {
      const configured = rules?.rulesDirectoryPath || environment.values.AI_ANALYSIS_RULES_DIR;
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
  ipcMain.handle("ai-analysis:verify-pending", async (_event, datasetId: string) => {
    try {
      const current = pendingDatasets.find((item) => item.datasetId === datasetId);
      if (!current?.sourceFilePath) throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Pending dataset source path is unavailable.");
      const refreshed = loadPendingDataset(current.sourceFilePath);
      const index = pendingDatasets.indexOf(current);
      pendingDatasets.splice(index, 1, refreshed);
      selectedPendingDatasetId = refreshed.datasetId;
      return { ok: true, snapshot: snapshot() };
    } catch (error) { return { ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:select-pending", async (_event, datasetId: string) => {
    if (!pendingDatasets.some((item) => item.datasetId === datasetId)) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Pending dataset was not found."));
    selectedPendingDatasetId = datasetId;
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:choose-analyzed", async () => {
    const choice = await dialog.showOpenDialog({ title: "Open analyzed Activity Events JSON", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    try {
      const filePath = fs.realpathSync.native(path.resolve(choice.filePaths[0]));
      const stat = fs.statSync(filePath);
      if (stat.size > 128 * 1024 * 1024) throw new AiAnalysisError("INPUT_TOO_LARGE", "Analyzed dataset exceeds 128 MiB.");
      const raw = fs.readFileSync(filePath, "utf8");
      const document = JSON.parse(raw) as { schemaName?: string; schemaVersion?: string; fileType?: string; run?: AiAnalysisRun };
      if (document.schemaName !== "jira-activity-analyzer.analyzed-analysis" || !document.schemaVersion || (document.schemaVersion !== AI_ANALYZED_FILE_SCHEMA_VERSION && !(AI_ANALYZED_LEGACY_FILE_SCHEMA_VERSIONS as readonly string[]).includes(document.schemaVersion)) || document.fileType !== "ANALYZED" || !document.run || document.run.status !== "completed" || document.run.results.length !== document.run.selectedDiffIds.length) {
        throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Only completed analyzed Activity Events datasets are supported.");
      }
      const imported = document.schemaVersion === AI_ANALYZED_FILE_SCHEMA_VERSION ? structuredClone(document.run) : adaptLegacyAnalyzedRun(document.run, document.schemaVersion);
      imported.analyzedFilePath = filePath;
      imported.analyzedFileName = path.basename(filePath);
      imported.analyzedFileSizeBytes = stat.size;
      imported.analyzedFileSha256 = sha256Text(raw);
      imported.importedFromFile = true;
      const existing = runs.findIndex((item) => item.runId === imported.runId);
      if (existing >= 0) runs.splice(existing, 1);
      runs.unshift(imported);
      selectedRunId = imported.runId;
      return { canceled: false, ok: true, snapshot: snapshot() };
    } catch (error) { return { canceled: false, ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:select-run", async (_event, runId: string) => {
    if (!runs.some((item) => item.runId === runId)) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Analyzed run was not found."));
    selectedRunId = runId;
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:start", async (event, payload: { mode: AiAnalyzerMode; datasetId: string; selectedDiffIds: string[]; service?: AiServiceKey }) => {
    if (activeRunId) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another analysis run is active."));
    let dataset = pendingDatasets.find((item) => item.datasetId === payload.datasetId);
    if (!dataset || !rules?.valid || !payload.selectedDiffIds.length) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "A verified dataset, rules snapshot, and at least one diff are required."));
    const selectedDataset = dataset;
    if (payload.selectedDiffIds.some((id) => !selectedDataset.diffs.some((diff) => diff.sourceDiffId === id))) return errorPayload(new AiAnalysisError("SOURCE_MISMATCH", "Selected diff does not belong to the selected dataset."));
    try {
      if (!rules.rulesDirectoryPath || !dataset.sourceFilePath) throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Rules and dataset source paths are required for preflight.");
      const refreshedRules = loadRulesSnapshot(rules.rulesDirectoryPath, [rules.rulesDirectoryPath, getAppRuntimeDir()]);
      const refreshedDataset = loadPendingDataset(dataset.sourceFilePath);
      if (!refreshedRules.valid) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", refreshedRules.errors.join(" ") || "Rules validation failed.");
      if (refreshedDataset.sourceFileSha256 !== dataset.sourceFileSha256) throw new AiAnalysisError("SOURCE_MISMATCH", "Pending Dataset changed after selection; import it again.");
      rules = refreshedRules; dataset = refreshedDataset;
    } catch (error) { return errorPayload(error); }
    const service = payload.service ?? (payload.mode === "CHATGPT" ? "chatgpt" : "ai_nexus");
    const provider = payload.mode === "OFFLINE_RULE" ? "offline_rule" : payload.mode === "CHATGPT" ? "chatgpt_codex" : "ai_nexus";
    if (payload.mode === "CHATGPT" && chatgpt.getStatus().state !== "connected") return errorPayload(new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "ChatGPT must be connected before analysis."));
    if (payload.mode === "AI_NEXUS") { const current = settingsAndSecret("ai_nexus").settings; if (current.connectionStatus !== "passed" || current.testedFingerprint !== current.configFingerprint) return errorPayload(new AiAnalysisError("AI_NOT_CONFIGURED", "AI Nexus settings must pass connection testing before analysis.")); }
    const dbPath = resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, path.join(getAppDataDir(), "ai-analysis", "ai-analysis.sqlite3"));
    try { initializeAiDatabase(dbPath); } catch (error) { return errorPayload(new AiAnalysisError("AI_DB_MIGRATION_FAILED", error instanceof Error ? error.message : String(error))); }
    const model = payload.mode === "OFFLINE_RULE" ? rules.classificationEngineVersion : payload.mode === "CHATGPT" ? (chatgpt.getStatus().selectedModel ?? "auto") : settingsAndSecret(service).settings.model;
    const runId = `analysis_${crypto.randomUUID()}`;
    const startedAt = now();
    const run: AiAnalysisRun = {
      runId, revision: runs.filter((item) => item.sourceDatasetId === dataset.datasetId).length + 1, status: "running", analyzerMode: payload.mode,
      sourceDatasetId: dataset.datasetId, sourceFileName: dataset.fileName, sourceFilePath: dataset.sourceFilePath, sourceFileSha256: dataset.sourceFileSha256,
      sourceDatabaseId: dataset.sourceDatabaseId, jiraServerFingerprint: dataset.jiraServerFingerprint, selectedDiffIds: [...payload.selectedDiffIds],
      provider, model, apiContract: payload.mode === "OFFLINE_RULE" ? "offline" : payload.mode === "CHATGPT" ? "responses" : settingsAndSecret(service).settings.apiContract,
      configFingerprint: payload.mode === "OFFLINE_RULE" ? null : payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeSha256 : settingsAndSecret(service).settings.configFingerprint,
      rules: structuredClone(rules), startedAt, completedAt: null, appVersion: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, packagedSourceCommit: __MAIN_GIT_COMMIT__,
      progress: { runId, status: "running", stage: "validating_source", totalBatches: payload.mode === "AI_NEXUS" ? payload.selectedDiffIds.length : 1, completedBatches: 0, failedBatches: 0, currentBatch: 1, totalDiffs: payload.selectedDiffIds.length, completedDiffs: 0, requestCount: 0, retryCount: 0, threadCount: 0, turnCount: 0, mainPayloadCount: 0, rulesTransmissionCount: 0, payloadRecordCount: 0, resultRecordCount: 0, elapsedMs: 0, usage: emptyTokenUsage(payload.mode === "OFFLINE_RULE" ? "not_applicable" : "unavailable"), message: "Analysis started.", errorCode: null },
      results: [], analyzedFileName: safeAnalyzedFileName(dataset.fileName, runId), plannedAnalyzedFilePath: null, analyzedFilePath: null, analyzedFileSizeBytes: null, analyzedFileSha256: null, databasePath: null
    };
    const outputDir = ensureDir(path.join(getExportsDir(), "ai-analysis"));
    run.plannedAnalyzedFilePath = path.join(outputDir, run.analyzedFileName);
    runs.unshift(run); activeRunId = runId; selectedRunId = runId;
    const controller = new AbortController(); abortControllers.set(runId, controller); notify(event);
    try {
      if (payload.mode === "OFFLINE_RULE") {
        run.progress.stage = "validating_response";
        run.results = classifyOffline(dataset, payload.selectedDiffIds, run.rules);
        run.progress.mainPayloadCount = 1;
        run.progress.payloadRecordCount = payload.selectedDiffIds.length;
        run.progress.resultRecordCount = run.results.length;
      } else if (payload.mode === "CHATGPT") {
        run.progress.stage = "building_payload";
        run.progress.message = "Building one compact payload for all selected records.";
        notify(event);
        const compact = buildCompactPayload(dataset, payload.selectedDiffIds, run.rules);
        const stagingFolder = ensureDir(path.join(getAppDataDir(), "ai-analysis", "staging", run.runId));
        const compactArtifact = atomicExport(path.join(stagingFolder, "compact-analysis-payload.json"), compact.json);
        run.compactPayloadPath = compactArtifact.filePath;
        run.compactPayloadSha256 = compactArtifact.sha256;
        run.compactPayloadSizeBytes = compactArtifact.sizeBytes;
        run.progress.payloadRecordCount = compact.payload.eventCount;
        run.progress.mainPayloadCount = 1;
        run.progress.rulesTransmissionCount = 1;
        const request = buildSingleRunPrompt(compact, run.rules);
        const selectedModel = chatgpt.getStatus().models.find((item) => item.id === chatgpt.getStatus().selectedModel);
        run.progress.stage = "preflighting_capacity";
        const capacity = preflightSingleRunCapacity({
          promptBytes: request.sizeBytes,
          compactPayloadBytes: compact.sizeBytes,
          compactPayloadSha256: compact.sha256,
          eventCount: compact.payload.eventCount,
          modelCapacityTokens: selectedModel?.contextWindow ?? null
        });
        atomicExport(path.join(stagingFolder, "capacity-preflight.json"), JSON.stringify(capacity, null, 2));
        run.promptTemplateVersion = SINGLE_RUN_PROMPT_VERSION;
        run.promptSha256 = request.sha256;
        run.capacityPreflight = { inputEstimateTokens: capacity.inputEstimateTokens, modelCapacityTokens: capacity.modelCapacityTokens, reservedOutputTokens: capacity.reservedOutputTokens, safetyMarginTokens: capacity.safetyMarginTokens, requiredContextTokens: capacity.requiredContextTokens };
        if (!capacity.ok) throw new AiAnalysisError("ANALYSIS_INPUT_CONTEXT_TOO_LARGE", capacity.message);
        run.progress.usage.estimatedInputTokens = capacity.inputEstimateTokens;
        run.progress.stage = "starting_thread";
        run.progress.message = "Starting one dedicated read-only ChatGPT thread and one analysis turn.";
        run.progress.requestCount = 1;
        notify(event);
        const response = await chatgpt.runAnalysis({ runId, prompt: request.prompt, model: chatgpt.getStatus().selectedModel, outputSchema: request.outputSchema }, controller.signal);
        run.threadId = response.threadId;
        run.providerRuntimeVersion = response.runtimeVersion;
        run.turnId = response.turnId;
        run.progress.threadCount = 1;
        run.progress.turnCount = 1;
        run.progress.stage = "receiving_response";
        const usage = { ...response.usage, availability: "actual" as const, estimatedInputTokens: capacity.inputEstimateTokens };
        run.progress.usage = usage;
        const raw = stageVisibleProviderResponse(stagingFolder, response.text);
        run.providerResponseGzipPath = raw.filePath;
        run.providerResponseSha256 = raw.rawSha256;
        run.providerResponseGzipSha256 = raw.gzipSha256;
        run.progress.stage = "validating_response";
        run.results = parseSingleRunResponse(response.text, compact.payload, run.rules, model, response.requestId, usage);
        run.progress.resultRecordCount = run.results.length;
        run.progress.completedDiffs = run.results.length;
        run.progress.completedBatches = 1;
        if (run.results.length !== payload.selectedDiffIds.length) throw new AiAnalysisError("AI_RESPONSE_INVALID", "Result record conservation failed.");
      } else {
        const settings = settingsAndSecret("ai_nexus").settings;
        const secret = settingsAndSecret("ai_nexus").secret;
        const selected = dataset.diffs.filter((diff) => payload.selectedDiffIds.includes(diff.sourceDiffId));
        for (let index = 0; index < selected.length; index += 1) {
          if (controller.signal.aborted) throw new AiAnalysisError("RUN_CANCELLED", "Run cancelled.");
          const diff = selected[index];
          run.progress.currentBatch = index + 1;
          const prompt = `Return one compact JSON object with candidates array. Each candidate: skillId, score 0-100, confidence 0-1, reason. Use only exact catalog IDs: ${run.rules.catalog.map((item) => item.id).join(",")}. Never choose by group order or _001 fallback. Evidence: ${JSON.stringify(diff)}`;
          if (settings.contextWindow && Math.ceil(prompt.length / 3) > settings.contextWindow) throw new AiAnalysisError("INPUT_TOO_LARGE", "A selected diff exceeds the configured context window.");
          const response = await callAiNexus(settings, secret, prompt, controller.signal);
          run.progress.requestCount += 1;
          let parsed: { candidates?: Array<{ skillId?: string; score?: number; confidence?: number; reason?: string }> } = {};
          try { parsed = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, "")); }
          catch { throw new AiAnalysisError("AI_RESPONSE_INVALID", "AI Nexus returned invalid JSON."); }
          const candidates = (parsed.candidates ?? []).filter((item) => run.rules.catalog.some((skill) => skill.id === item.skillId)).map((item) => {
            const skill = run.rules.catalog.find((value) => value.id === item.skillId)!;
            return { skillId: skill.id, skillName: skill.name, group: skill.group, score: typeof item.score === "number" ? item.score : null, confidence: typeof item.confidence === "number" ? item.confidence : null, positiveEvidenceRefs: [diff.evidenceId], negativeEvidenceRefs: [], matchedRuleIds: [], reason: item.reason ?? "Provider candidate", status: "PENDING_REVIEW" as const };
          });
          run.results.push({ resultId: `result_${crypto.randomUUID()}`, sourceDiffId: diff.sourceDiffId, sourceContentHash: diff.sourceContentHash, evidenceRefs: [diff.evidenceId], candidates, status: candidates.length ? "PENDING_REVIEW" : "NEEDS_REVIEW", analyzerVersion: model, requestTraceId: response.requestId, usage: { ...response.usage, availability: "actual", estimatedInputTokens: null }, rawResultAvailable: true, reviewNote: "", reviewedAt: null });
          run.progress.completedDiffs = index + 1;
          run.progress.completedBatches = index + 1;
          run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
          notify(event);
        }
        run.progress.mainPayloadCount = selected.length;
        run.progress.payloadRecordCount = selected.length;
        run.progress.resultRecordCount = run.results.length;
      }
      run.progress.stage = "merging_evidence";
      run.distributionDiagnostics = buildDistributionDiagnostics(run.results, run.rules);
      run.progress.resultRecordCount = run.results.length;
      if (run.results.length !== run.selectedDiffIds.length) throw new AiAnalysisError("AI_RESPONSE_INVALID", "Completed result count does not conserve selected records.");
      run.status = "completed"; run.completedAt = now(); run.progress.status = "completed"; run.progress.stage = "writing_staging"; run.progress.completedBatches = 1; run.progress.completedDiffs = run.results.length; run.progress.elapsedMs = Date.now() - Date.parse(startedAt); run.progress.message = "Analysis completed. Results require human review.";
      const reportPath = run.plannedAnalyzedFilePath!.replace(/\.json$/i, ".html");
      run.reportFilePath = reportPath;
      const html = goldenHtmlForRun(run, dataset);
      validateGoldenHtml(html, run.results.length);
      run.reportFileSizeBytes = Buffer.byteLength(html);
      run.reportFileSha256 = sha256Text(html);
      let exported: ReturnType<typeof atomicExport> | null = null;
      let report: ReturnType<typeof atomicExport> | null = null;
      try {
        exported = atomicExport(run.plannedAnalyzedFilePath!, JSON.stringify(analyzedDocument(run), null, 2));
        report = atomicExport(reportPath, html);
        if (report.sizeBytes !== run.reportFileSizeBytes || report.sha256 !== run.reportFileSha256) throw new AiAnalysisError("EXPORT_VALIDATION_FAILED", "Golden HTML metadata does not match the reopened artifact.");
        run.analyzedFilePath = exported.filePath; run.analyzedFileSizeBytes = exported.sizeBytes; run.analyzedFileSha256 = exported.sha256;
        run.reportFilePath = report.filePath;
        run.progress.stage = "committing_database";
        initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run); run.databasePath = dbPath; run.progress.stage = "completed";
      } catch (error) {
        if (exported) try { fs.unlinkSync(exported.filePath); } catch {}
        if (report) try { fs.unlinkSync(report.filePath); } catch {}
        run.analyzedFilePath = null; run.analyzedFileSizeBytes = null; run.analyzedFileSha256 = null; run.reportFilePath = null; run.reportFileSizeBytes = null; run.reportFileSha256 = null; throw error;
      }
    } catch (error) {
      const value = asAnalysisError(error);
      run.status = value.code === "RUN_CANCELLED" ? "cancelled" : "failed"; run.completedAt = now(); run.progress.status = run.status; run.progress.stage = run.status === "cancelled" ? "cancelled" : "failed"; run.progress.errorCode = value.code; run.progress.message = value.message; run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
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
    const selectedDataset = pendingDatasets.find((item) => item.datasetId === run.sourceDatasetId);
    const content = payload.format === "json" ? JSON.stringify(analyzedDocument(run), null, 2) : payload.format === "csv" ? csvForRun(run) : goldenHtmlForRun(run, selectedDataset);
    if (payload.format === "html") validateGoldenHtml(content, run.results.length);
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
