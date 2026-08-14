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
  type AiAnalysisErrorCode,
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
import { redactChatGptText, redactChatGptTextComplete } from "./chatGptRedactor.js";
import { buildRequestPackage, loadRequestPackage } from "./aiAnalysisRequestPackageV0314.js";
import { AiAnalysisRunArchive, deleteRunArchive, loadArchivedRuns, readConversationPage } from "./aiAnalysisRunArchiveV0314.js";
import { validateCanonicalResponseSemantics } from "./aiAnalysisResponseContractV0314.js";
import {
  adaptLegacyAnalyzedRun,
  buildCompactPayload,
  buildDistributionDiagnostics,
  buildSingleRunPrompt,
  goldenHtmlForRun,
  parseSingleRunResponse,
  SINGLE_RUN_PROMPT_VERSION,
  stageVisibleProviderResponse,
  validateGoldenHtml
} from "./aiAnalysisSingleRunV0311.js";
import {
  PROVIDER_HARD_TIMEOUT_MS,
  PROVIDER_PERFORMANCE_WARNING_MS,
  assembleCanonicalResults,
  atomicWriteCanonical,
  buildCompletionManifest,
  createArtifactWorkspaces,
  parseAndValidateDecisions,
  readPublishedArtifacts,
  stableJson,
  verifyInputWorkspaceUnchanged,
  warningPersistenceGate
} from "./aiAnalysisArtifactsV0316.js";
import {
  AnalysisDispatchGuard,
  AnalysisErrorDeduplicator,
  buildCapacityCalculationSnapshot,
  capacitySnapshotHash,
  capacityWarning,
  evaluateFormalPersistenceGate
} from "./aiAnalysisV0312.js";

declare const __MAIN_APP_VERSION__: string;
declare const __MAIN_BUILD_TIME__: string;
declare const __MAIN_GIT_COMMIT__: string;
type Environment = ReturnType<typeof loadAiEnvironment>;
const handlers = [
  "ai-analysis:snapshot", "ai-analysis:reload-env", "ai-analysis:save-settings", "ai-analysis:test-connection",
  "ai-analysis:diagnose", "ai-analysis:cancel-diagnostic", "ai-analysis:chat", "ai-analysis:choose-rules", "ai-analysis:load-rules",
  "ai-analysis:choose-pending", "ai-analysis:verify-pending", "ai-analysis:select-pending", "ai-analysis:choose-analyzed", "ai-analysis:select-run", "ai-analysis:start", "ai-analysis:accept-warnings", "ai-analysis:cancel-capacity-warning", "ai-analysis:cancel", "ai-analysis:review",
  "ai-analysis:export", "ai-analysis:open-folder", "ai-analysis:conversation", "ai-analysis:delete-run", "ai-analysis:chatgpt-start", "ai-analysis:chatgpt-login",
  "ai-analysis:chatgpt-cancel-login", "ai-analysis:chatgpt-logout", "ai-analysis:chatgpt-refresh", "ai-analysis:chatgpt-select-model", "ai-analysis:cancel-chat"
];

function now() { return new Date().toISOString(); }
function asAnalysisError(error: unknown) {
  if (error instanceof AiAnalysisError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("OUTCOME_UNKNOWN:")) return new AiAnalysisError("OUTCOME_UNKNOWN", message.slice("OUTCOME_UNKNOWN:".length));
  if (message.startsWith("RUN_CANCELLED:")) return new AiAnalysisError("RUN_CANCELLED", message.slice("RUN_CANCELLED:".length));
  const directCode = /^(AI_DECISION_[A-Z_]+|AI_ANALYSIS_REPORT_MISSING|AI_FINAL_SUMMARY_MISSING|AI_CODEX_[A-Z_]+|AI_SANDBOX_POLICY_MISMATCH|AI_OUTPUT_WRITE_[A-Z_]+|AI_ARTIFACT_[A-Z_]+|AI_OUTPUT_PATH_ESCAPE_BLOCKED|AI_OUTPUT_PUBLISH_INCOMPLETE|AI_PROVIDER_TIMEOUT|AI_LOG_FLUSH_FAILED|AI_REQUIRED_INPUT_FILE_MISSING|AI_INPUT_FILE_HASH_MISMATCH|AI_INPUT_PACKAGE_INVALID|AI_REQUIRED_FILE_NOT_OBSERVED|CODEX_BUNDLED_RUNTIME_MISSING|CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH|CODEX_BUNDLED_RUNTIME_HASH_MISMATCH|CODEX_BUNDLED_RUNTIME_START_FAILED)/.exec(message)?.[1] as AiAnalysisErrorCode | undefined;
  if (directCode) return new AiAnalysisError(directCode, message);
  if (message.includes("CHATGPT_USAGE_LIMITED")) return new AiAnalysisError("CHATGPT_USAGE_LIMITED", "ChatGPT usage limit has been reached.");
  if (message.includes("CHATGPT_SIGN_IN_REQUIRED")) return new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "Sign in with ChatGPT before analysis.");
  if (/invalid_json_schema|invalid schema|output schema/i.test(message)) return new AiAnalysisError("AI_OUTPUT_SCHEMA_PROVIDER_REJECTED", message);
  if (/CHATGPT_TURN_FAILED|incomplete|truncated|refusal/i.test(message)) return new AiAnalysisError("AI_PROVIDER_RESPONSE_INCOMPLETE", message);
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

function persistRunDebugEvidence(stagingFolder: string, run: AiAnalysisRun, requestSanitized: unknown, responseSanitized: unknown, events: unknown[], actions: string[]) {
  const folder = ensureDir(path.join(stagingFolder, "debug"));
  const writeJson = (name: string, value: unknown) => fs.writeFileSync(path.join(folder, name), redactChatGptTextComplete(JSON.stringify(value, null, 2)), "utf8");
  writeJson("run-manifest.json", { run, artifacts: { formalJson: run.analyzedFilePath ? "written" : run.databaseWriteStatus ?? "not_written", goldenHtml: run.reportFilePath ? "written" : run.databaseWriteStatus ?? "not_written", sqlite: run.databaseWriteStatus ?? "not_started" } });
  if (run.status === "failed") writeJson("failed-run-manifest.json", { runId: run.runId, status: run.status, errorCode: run.progress.errorCode, message: run.progress.message });
  if (run.capacitySnapshot) writeJson("capacity-snapshot.json", run.capacitySnapshot);
  const runtimeDiagnostics = { provider: run.provider, model: run.model, runtimeSource: run.runtimeSource ?? "bundled", runtimeIntegrity: run.runtimeIntegrity ?? null, runtimeVersion: run.providerRuntimeVersion ?? null, requestCount: run.progress.requestCount, providerDispatchCount: run.progress.providerDispatchCount ?? run.progress.requestCount, threadStartAttemptCount: run.progress.threadStartAttemptCount ?? 0, threadCreatedCount: run.progress.threadCreatedCount ?? run.progress.threadCount ?? 0, turnStartAttemptCount: run.progress.turnStartAttemptCount ?? 0, acceptedTurnCount: run.progress.acceptedTurnCount ?? run.progress.turnCount ?? 0, turnCompletedCount: run.progress.turnCompletedCount ?? 0, retryCount: run.progress.retryCount, repairTurnCount: run.progress.repairTurnCount ?? 0, fallbackRequestCount: run.progress.fallbackRequestCount ?? 0, outputSchemaSha256: run.outputSchemaSha256 ?? null };
  writeJson("provider-diagnostics.json", runtimeDiagnostics);
  writeJson("runtime-diagnostics.json", runtimeDiagnostics);
  if (requestSanitized !== undefined) writeJson("request-sanitized.json", requestSanitized);
  if (responseSanitized !== undefined) writeJson("response-sanitized.json", responseSanitized);
  writeJson("validation-result.json", run.validationGate ?? { passed: false, status: "not_run", reason: run.progress.message });
  writeJson("token-usage.json", run.progress.usage);
  writeJson("execution-time.json", { startedAt: run.startedAt, completedAt: run.completedAt, durationMs: run.progress.elapsedMs });
  fs.writeFileSync(path.join(folder, "event-log.jsonl"), events.map((item) => redactChatGptText(JSON.stringify(item))).join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(folder, "user-action-log.txt"), actions.map((item) => redactChatGptText(item)).join("\n") + "\n", "utf8");
  if (run.providerResponseRawPath && fs.existsSync(run.providerResponseRawPath)) {
    const debugCopy = path.join(folder, "provider-response.raw.json");
    fs.copyFileSync(run.providerResponseRawPath, debugCopy);
    const debugCopyResponseSha256 = sha256Text(fs.readFileSync(debugCopy, "utf8"));
    if (debugCopyResponseSha256 !== run.providerResponseSha256) throw new AiAnalysisError("AI_PROVIDER_RESPONSE_EVIDENCE_MISMATCH", "Debug response copy does not match canonical raw response hash.");
    writeJson("response-evidence.json", { manifestResponseSha256: run.providerResponseSha256, debugCopyResponseSha256, canonicalResponseSha256: run.providerResponseCanonicalSha256 ?? null, gzipResponseSha256: run.providerResponseGzipSha256 ?? null });
  }
  for (const name of ["output-schema-sanitized.json", "output-schema-canonical.json", "output-schema-validation.json", "output-schema.sha256", "provider-response.canonical.json", "semantic-validation.json"]) {
    const source = path.join(stagingFolder, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(folder, name));
  }
  return folder;
}
let selectedCanonicalAiRunDirectory: string | null = null;
export function getSelectedCanonicalAiRunDirectory() { return selectedCanonicalAiRunDirectory; }
export function registerAiAnalysisIpc() {
  handlers.forEach((channel) => ipcMain.removeHandler(channel));
  const envPath = path.join(getAppRuntimeDir(), ".env");
  const templatePath = path.join(getAppRuntimeDir(), ".env.version");
  let environment = loadAiEnvironment(envPath, templatePath);
  const chatgpt = getChatGptService();
  chatgpt.subscribeStatus(() => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("ai-analysis:snapshot-changed", snapshot())));
  let rules: AiRulesSnapshot | null = null;
  const pendingDatasets: AiPendingDataset[] = [];
  const runs: AiAnalysisRun[] = loadArchivedRuns();
  const runArchives = new Map<string, AiAnalysisRunArchive>(runs.filter((run) => run.runDirectory && run.progress.errorCode !== "AI_RUN_ARCHIVE_FAILED").map((run) => [run.runId, AiAnalysisRunArchive.reopen(run.runId, run.runDirectory!)]));
  let selectedPendingDatasetId: string | null = null;
  let selectedRunId: string | null = null;
  let activeRunId: string | null = null;
  const abortControllers = new Map<string, AbortController>();
  const dispatchGuard = new AnalysisDispatchGuard();
  const errorDeduplicator = new AnalysisErrorDeduplicator();
  const analysisUserActions: string[] = [];
  const providerFailureEvidence = new Map<string, { visibleText: string; usage: ReturnType<typeof emptyTokenUsage>; errorCode: string; message: string }>();
  const observedWorkspaceFiles = new Map<string, Set<string>>();
  const requiredWorkspaceFiles = ["pending-analysis.json", "common-rules.md", "skill-catalog.md", "rule-set-manifest.md"] as const;
  const lastProviderUiNotifyAt = new Map<string, number>();
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
    const archive = runArchives.get(run.runId);
    try {
      if (providerEvent.type === "provider_event") archive?.appendProviderEvent(providerEvent);
      else if (providerEvent.type === "completed") archive?.append("assistant_message", "CHATGPT_VISIBLE", providerEvent.text, { elapsedMs: providerEvent.elapsedMs });
      else if (providerEvent.type !== "delta") archive?.append("provider_event", "APP_ONLY", providerEvent.type, { ...providerEvent, ...(providerEvent.type === "failed" ? { visibleText: "[persisted-separately]" } : {}) });
      if (providerEvent.type === "provider_event") {
        const serialized = JSON.stringify(providerEvent.params); const observed = observedWorkspaceFiles.get(run.runId);
        run.telemetry = { ...(run.telemetry ?? {}), firstProviderEventAt: run.telemetry?.firstProviderEventAt ?? now(), lastProviderActivityAt: now(), firstAiOutputActivityAt: run.telemetry?.firstAiOutputActivityAt ?? (serialized.includes("ai-output") ? now() : null) };
        for (const fileName of requiredWorkspaceFiles) if (serialized.includes(fileName)) observed?.add(fileName);
        run.observedFileAccess = [...(observed ?? [])].sort();
      }
    } catch (error) {
      run.progress.errorCode = "AI_RUN_ARCHIVE_FAILED"; run.progress.message = `Run archive persistence failed: ${error instanceof Error ? error.message : String(error)}`;
      abortControllers.get(run.runId)?.abort(); return;
    }
    if (providerEvent.type === "preflight_completed") {
      run.codexPreflight = providerEvent.evidence;
      run.progress.message = "Bundled Codex write probe passed with matching Probe / Thread / Turn policy.";
    } else if (providerEvent.type === "thread_starting") {
      run.progress.providerDispatchCount = (run.progress.providerDispatchCount ?? 0) + 1;
      run.progress.requestCount = run.progress.providerDispatchCount;
      run.progress.stage = "starting_thread";
      run.progress.threadStartAttemptCount = (run.progress.threadStartAttemptCount ?? 0) + 1;
      run.progress.message = "Starting the single dedicated provider thread.";
    } else if (providerEvent.type === "thread_created") {
      run.threadId = providerEvent.threadId;
      run.progress.threadCreatedCount = (run.progress.threadCreatedCount ?? 0) + 1;
      run.progress.threadCount = run.progress.threadCreatedCount;
      run.progress.message = "Dedicated thread created; preparing the single analysis turn.";
    } else if (providerEvent.type === "turn_starting") {
      run.progress.stage = "starting_turn";
      run.progress.turnStartAttemptCount = (run.progress.turnStartAttemptCount ?? 0) + 1;
    } else if (providerEvent.type === "turn_started") {
      run.turnId = providerEvent.turnId;
      run.progress.acceptedTurnCount = (run.progress.acceptedTurnCount ?? 0) + 1;
      run.progress.turnCount = run.progress.acceptedTurnCount;
      run.progress.stage = "waiting_response";
      run.progress.message = "Provider accepted the single analysis turn.";
    } else if (providerEvent.type === "delta") {
      run.progress.stage = "receiving_response";
      run.progress.message = "Provider is active; waiting for Decision JSON and Analysis Report publication.";
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
    } else if (providerEvent.type === "failed") {
      providerFailureEvidence.set(providerEvent.runId, { visibleText: providerEvent.visibleText, usage: { ...providerEvent.usage, availability: "partial", estimatedInputTokens: run.progress.usage.estimatedInputTokens }, errorCode: providerEvent.errorCode, message: providerEvent.message });
    } else if (providerEvent.type === "completed") {
      run.progress.turnCompletedCount = (run.progress.turnCompletedCount ?? 0) + 1;
      run.progress.stage = "validating_response_schema";
      run.progress.message = "Provider turn completed; validating the canonical response schema.";
    }
    const highVolume = providerEvent.type === "provider_event" || providerEvent.type === "delta" || providerEvent.type === "usage";
    const current = Date.now(); const lastUi = lastProviderUiNotifyAt.get(run.runId) ?? 0;
    if (!highVolume || current - lastUi >= 250) { lastProviderUiNotifyAt.set(run.runId, current); BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("ai-analysis:snapshot-changed", snapshot())); }
    if (!highVolume) archive?.writeManifest(run);
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
    analysisUserActions.push(`${now()} Provider diagnostics requested: ${service}`);
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
        const result = await chatgpt.runAnalysis({ prompt, requestPurpose: "MANUAL_CHAT" }, chatController.signal);
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
    analysisUserActions.push(`${now()} Select rules requested`);
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
    analysisUserActions.push(`${now()} Select Pending JSON requested`);
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
    selectedCanonicalAiRunDirectory = runs.find((item) => item.runId === runId)?.runDirectory ?? null;
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:start", async (event, payload: { mode: AiAnalyzerMode; datasetId: string; selectedDiffIds: string[]; service?: AiServiceKey; supplementalInstruction?: string; analysisRunId?: string; capacityConfirmation?: boolean }) => {
    const resumedRun = payload.analysisRunId ? runs.find((item) => item.runId === payload.analysisRunId) ?? null : null;
    if (activeRunId) {
      if (payload.analysisRunId === activeRunId && resumedRun) return { ok: false, run: resumedRun, snapshot: snapshot(), alreadyDispatching: true };
      return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another analysis run is active."));
    }
    if (payload.analysisRunId && (!resumedRun || resumedRun.progress.stage !== "waiting_capacity_confirmation")) return resumedRun ? { ok: resumedRun.status === "completed", run: resumedRun, snapshot: snapshot(), alreadyTerminal: true } : errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Prepared analysis run was not found."));
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
    if (payload.mode !== "CHATGPT") try { initializeAiDatabase(dbPath); } catch (error) { return errorPayload(new AiAnalysisError("AI_DB_MIGRATION_FAILED", error instanceof Error ? error.message : String(error))); }
    const model = payload.mode === "OFFLINE_RULE" ? rules.classificationEngineVersion : payload.mode === "CHATGPT" ? (chatgpt.getStatus().selectedModel ?? "auto") : settingsAndSecret(service).settings.model;
    const runId = resumedRun?.runId ?? `analysis_${crypto.randomUUID()}`;
    analysisUserActions.push(`${now()} ${resumedRun ? "Capacity confirmation resumed" : "Start analysis requested"}: ${runId}`);
    const startedAt = resumedRun?.startedAt ?? now();
    const run: AiAnalysisRun = resumedRun ?? {
      runId, revision: runs.filter((item) => item.sourceDatasetId === dataset.datasetId).length + 1, status: "running", analyzerMode: payload.mode,
      sourceDatasetId: dataset.datasetId, sourceFileName: dataset.fileName, sourceFilePath: dataset.sourceFilePath, sourceFileSha256: dataset.sourceFileSha256,
      sourceDatabaseId: dataset.sourceDatabaseId, jiraServerFingerprint: dataset.jiraServerFingerprint, selectedDiffIds: [...payload.selectedDiffIds],
      provider, model, apiContract: payload.mode === "OFFLINE_RULE" ? "offline" : payload.mode === "CHATGPT" ? "responses" : settingsAndSecret(service).settings.apiContract,
      configFingerprint: payload.mode === "OFFLINE_RULE" ? null : payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeSha256 : settingsAndSecret(service).settings.configFingerprint,
      rules: structuredClone(rules), startedAt, completedAt: null, appVersion: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, packagedSourceCommit: __MAIN_GIT_COMMIT__, runtimeSource: payload.mode === "CHATGPT" ? "bundled" : null, runtimeIntegrity: payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeIntegrity : null, providerRuntimeVersion: payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeVersion : null,
      progress: { runId, status: "running", stage: "validating_source", totalBatches: payload.mode === "AI_NEXUS" ? payload.selectedDiffIds.length : payload.mode === "CHATGPT" ? 0 : 1, completedBatches: 0, failedBatches: 0, currentBatch: 1, totalDiffs: payload.selectedDiffIds.length, completedDiffs: 0, requestCount: 0, providerDispatchCount: 0, threadStartAttemptCount: 0, threadCreatedCount: 0, turnStartAttemptCount: 0, acceptedTurnCount: 0, turnCompletedCount: 0, retryCount: 0, repairTurnCount: 0, fallbackRequestCount: 0, threadCount: 0, turnCount: 0, mainPayloadCount: 0, rulesTransmissionCount: 0, payloadRecordCount: 0, resultRecordCount: 0, elapsedMs: 0, usage: emptyTokenUsage(payload.mode === "OFFLINE_RULE" ? "not_applicable" : "unavailable"), message: "Analysis started.", errorCode: null },
      results: [], supplementalInstruction: payload.supplementalInstruction?.trim() || null, providerReturnedRecordCount: 0, parsedRecordCount: 0, schemaValidRecordCount: 0, semanticValidRecordCount: 0, formalArtifactRecordCount: 0, sqliteCommittedRecordCount: 0, analyzedFileName: safeAnalyzedFileName(dataset.fileName, runId), plannedAnalyzedFilePath: null, analyzedFilePath: null, analyzedFileSizeBytes: null, analyzedFileSha256: null, databasePath: null
    };
    if (!resumedRun) {
      try { const archive = new AiAnalysisRunArchive(runId, new Date(startedAt)); runArchives.set(runId, archive); run.runDirectory = archive.directory; archive.append("system_event", "APP_ONLY", "Analysis Run created before Provider dispatch.", { runId, localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); archive.writeManifest(run); }
      catch (error) { return errorPayload(new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", error instanceof Error ? error.message : String(error))); }
    }
    const outputDir = ensureDir(path.join(getExportsDir(), "ai-analysis"));
    run.plannedAnalyzedFilePath = path.join(outputDir, run.analyzedFileName);
    if (!resumedRun) runs.unshift(run);
    run.status = "running"; run.progress.status = "running"; activeRunId = runId; selectedRunId = runId; selectedCanonicalAiRunDirectory = run.runDirectory ?? null;
    if (payload.mode === "CHATGPT") observedWorkspaceFiles.set(runId, new Set());
    const controller = new AbortController(); abortControllers.set(runId, controller); notify(event);
    let providerVisibleResponse: string | null = null;
    let runStagingFolder: string | null = null;
    let requestEvidence: Record<string, unknown> | undefined;
    try {
      if (payload.mode === "OFFLINE_RULE") {
        run.progress.stage = "validating_response";
        run.results = classifyOffline(dataset, payload.selectedDiffIds, run.rules);
        run.progress.mainPayloadCount = 1;
        run.progress.payloadRecordCount = payload.selectedDiffIds.length;
        run.progress.resultRecordCount = run.results.length;
      } else if (payload.mode === "CHATGPT") {
        run.progress.stage = "building_payload";
        run.progress.message = "Preparing the run-scoped read-only local file workspace.";
        notify(event);
        const compact = buildCompactPayload(dataset, payload.selectedDiffIds, run.rules);
        if (!run.runDirectory) throw new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", "Canonical Run directory is unavailable.");
        const stagingFolder = ensureDir(run.runDirectory);
        runStagingFolder = stagingFolder;
        const compactArtifact = resumedRun && run.compactPayloadPath && run.compactPayloadSha256 && run.compactPayloadSizeBytes !== null && run.compactPayloadSizeBytes !== undefined
          ? { filePath: run.compactPayloadPath, sha256: run.compactPayloadSha256, sizeBytes: run.compactPayloadSizeBytes }
          : atomicExport(path.join(ensureDir(path.join(stagingFolder, "derived")), "compact-analysis-payload.json"), compact.json);
        run.compactPayloadPath = compactArtifact.filePath;
        run.compactPayloadSha256 = compactArtifact.sha256;
        run.compactPayloadSizeBytes = compactArtifact.sizeBytes;
        run.progress.payloadRecordCount = compact.payload.eventCount;
        run.progress.mainPayloadCount = 1;
        run.progress.rulesTransmissionCount = 1;
        run.progress.stage = "preparing_artifacts";
        run.progress.message = "Preparing the Decision JSON and Analysis Report artifact contract.";
        const decisionContract = stableJson({ schemaVersion: "ai-analysis-decisions-v1", expectedRecordCount: compact.payload.eventCount, fields: ["recordIndex", "status", "skillIds", "confidence", "positiveEvidence", "negativeChecks", "unknownReasons", "rationale"], finalAssistantMessage: "brief natural-language summary; never JSON" });
        const request = resumedRun ? loadRequestPackage(stagingFolder) : buildRequestPackage({ runId, runDirectory: stagingFolder, dataset, rules: run.rules, selectedRecordCount: compact.payload.eventCount, supplementalInstruction: run.supplementalInstruction ?? undefined, outputSchemaCanonicalJson: decisionContract });
        const artifactPaths = createArtifactWorkspaces(stagingFolder);
        run.artifactPaths = { input: artifactPaths.input, output: artifactPaths.output, canonical: artifactPaths.canonical, logs: artifactPaths.logs };
        run.expectedDecisionCount = compact.payload.eventCount; run.receivedDecisionCount = 0; run.canonicalRecordCount = 0; run.finalAcceptedRecordCount = 0;
        run.requestPackage = request.requestPackage; run.promptTemplateVersion = request.requestPackage.coreInstructionVersion; run.promptSha256 = request.requestPackage.finalProviderPayloadSha256; run.outputSchemaName = null; run.outputSchemaSha256 = null; run.outputSchemaBytesUtf8 = null; run.outputSchemaValidation = null;
        const archive = runArchives.get(runId); if (!resumedRun) archive?.append("system_event", "APP_ONLY", "Artifact Request Package prepared before Provider dispatch.", { deliveryMode: request.requestPackage.deliveryMode, documentCount: request.requestPackage.documents.length, outputWorkspace: "ai-output", finalResponseMode: "brief_text" }); archive?.writeManifest(run);
        run.progress.stage = "preflighting_capacity";
        const capability = run.capacitySnapshot ? null : await chatgpt.readSelectedModelCapacity();
        const rulesBytes = request.requestPackage.documents.filter((item) => ["COMMON_RULES", "SKILL_CATALOG", "RULE_SET_MANIFEST_OR_SCORING_RULES"].includes(item.role)).reduce((sum, item) => sum + item.snapshotByteLength, 0);
        const pendingBytes = request.requestPackage.documents.find((item) => item.role === "PENDING_ANALYSIS_JSON")?.snapshotByteLength ?? compact.sizeBytes;
        const capacitySnapshot = run.capacitySnapshot ?? buildCapacityCalculationSnapshot({ capacity: { providerId: capability!.providerId, providerDisplayName: capability!.providerDisplayName, modelId: capability!.modelId, modelDisplayName: capability!.modelDisplayName, source: capability!.capacitySource, status: capability!.capacitySourceStatus, tokens: capability!.capacityTokens, rawSanitized: capability!.capacityRawResponseSanitized }, rulesBytesUtf8: rulesBytes, pendingPayloadBytesUtf8: pendingBytes, wrapperInstructionsBytesUtf8: request.requestPackage.finalProviderPayloadBytes, finalSerializedPromptBytesUtf8: request.requestPackage.finalProviderPayloadBytes, recordCount: compact.payload.eventCount });
        const warningCode = capacityWarning(capacitySnapshot); const snapshotHash = capacitySnapshotHash(capacitySnapshot);
        if (!resumedRun) atomicExport(path.join(stagingFolder, "capacity-snapshot.json"), JSON.stringify(capacitySnapshot, null, 2));
        run.capacitySnapshot = capacitySnapshot; run.capacityWarningCode = warningCode; run.capacitySnapshotHash = snapshotHash;
        run.capacityPreflight = { inputEstimateTokens: capacitySnapshot.estimatedFinalInputTokens, modelCapacityTokens: capacitySnapshot.capacityTokens, reservedOutputTokens: capacitySnapshot.estimatedVisibleOutputReserveTokens, safetyMarginTokens: capacitySnapshot.safetyMarginTokens, requiredContextTokens: capacitySnapshot.estimatedRequiredTotalTokens };
        run.progress.usage.estimatedInputTokens = capacitySnapshot.estimatedFinalInputTokens; dispatchGuard.register(runId, Boolean(warningCode));
        if (warningCode && !payload.capacityConfirmation) {
          run.status = "queued"; run.progress.status = "queued"; run.progress.stage = "waiting_capacity_confirmation"; run.progress.message = "Capacity telemetry requires one explicit confirmation before the single artifact-producing turn.";
          run.capacityConfirmation = { analysisRunId: runId, warningCode, capacitySnapshotHash: snapshotHash, confirmedAt: null, confirmationAction: "pending" }; analysisUserActions.push(`${now()} Capacity warning shown: ${runId} ${warningCode}`); archive?.writeManifest(run); return { ok: false, requiresCapacityConfirmation: true, warningCode, capacitySnapshot, capacitySnapshotHash: snapshotHash, run, snapshot: snapshot() };
        }
        if (warningCode) { dispatchGuard.confirm(runId); run.capacityConfirmation = { analysisRunId: runId, warningCode, capacitySnapshotHash: snapshotHash, confirmedAt: now(), confirmationAction: "confirmed" }; analysisUserActions.push(`${run.capacityConfirmation.confirmedAt} Capacity warning confirmed: ${runId}`); }
        if (!dispatchGuard.begin(runId)) return { ok: false, run, snapshot: snapshot(), alreadyDispatching: true };
        archive?.append("user_message", "CHATGPT_VISIBLE", request.prompt, { dispatchStatus: "sent", deliveryMode: request.requestPackage.deliveryMode, workspaceFileCount: 4, outputWorkspace: "ai-output", inlineFileContentCount: 0, nativeInputFileCount: 0, payloadSha256: request.requestPackage.finalProviderPayloadSha256 }); archive?.writeManifest(run);
        run.status = "running"; run.progress.status = "running"; run.progress.stage = "starting_thread"; run.progress.message = "Dispatching one artifact-producing ChatGPT thread and one turn.";
        const providerDispatchAt = Date.now(); run.telemetry = { runCreatedAt: startedAt, inputPreparedAt: now(), providerDispatchAt: new Date(providerDispatchAt).toISOString(), providerDurationMs: null, localOrchestrationMs: null, durableLoggingMs: null, validationMs: null, canonicalAssemblyMs: null, sqliteWriteMs: null };
        requestEvidence = { runId, model: chatgpt.getStatus().selectedModel, deliveryMode: request.requestPackage.deliveryMode, workspaceFileCount: 4, outputWorkspace: "ai-output", inlineFileContentCount: 0, nativeInputFileCount: 0, instructionSha256: request.requestPackage.finalProviderPayloadSha256, instructionBytes: request.requestPackage.finalProviderPayloadBytes, finalAssistantResponse: "brief_text", authorization: "[masked]" };
        notify(event);
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const providerPromise = chatgpt.runAnalysis({ runId, requestPurpose: "FORMAL_ANALYSIS", prompt: request.prompt, model: chatgpt.getStatus().selectedModel, deliveryMode: "LOCAL_FILE_WORKSPACE", runDirectory: stagingFolder, workspacePath: request.workspace, outputWorkspacePath: request.output, allowedReadRoots: [request.workspace], finalProviderPayloadSha256: request.requestPackage.finalProviderPayloadSha256, outputSchema: null, outputSchemaSha256: null }, controller.signal);
        const timeoutPromise = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new AiAnalysisError("AI_PROVIDER_TIMEOUT", `Provider exceeded the ${PROVIDER_HARD_TIMEOUT_MS} ms hard timeout. No retry or repair was started.`)); }, PROVIDER_HARD_TIMEOUT_MS); timeout.unref?.(); });
        let response: Awaited<typeof providerPromise>; try { response = await Promise.race([providerPromise, timeoutPromise]); } finally { if (timeout) clearTimeout(timeout); }
        providerVisibleResponse = response.text; run.threadId = response.threadId; run.providerRuntimeVersion = response.runtimeVersion; run.turnId = response.turnId; run.progress.threadCount = run.progress.threadCreatedCount ?? 0; run.progress.turnCount = run.progress.acceptedTurnCount ?? 0;
        run.progress.usage = { ...response.usage, availability: response.tokenTelemetry.availability, estimatedInputTokens: null, turnCumulative: response.tokenTelemetry.turnCumulative, lastModelCall: response.tokenTelemetry.lastModelCall, modelContextWindow: response.tokenTelemetry.modelContextWindow, maxObservedSingleCallTokens: response.tokenTelemetry.maxObservedSingleCallTokens, maxObservedContextUtilizationPercent: response.tokenTelemetry.maxObservedContextUtilizationPercent, usageEventCount: response.tokenTelemetry.usageEventCount, telemetryAnomalies: response.tokenTelemetry.anomalies }; run.telemetry.providerDurationMs = response.elapsedMs; run.telemetry.turnCompletedAt = now();
        if (response.elapsedMs >= PROVIDER_PERFORMANCE_WARNING_MS) run.anomalyWarnings = ["AI_PROVIDER_PERFORMANCE_WARNING"];
        if (response.text.trim()) { fs.writeFileSync(artifactPaths.finalMessage, response.text.trim() + "\n", { encoding: "utf8", flag: "wx" }); run.finalAssistantMessagePath = artifactPaths.finalMessage; }
        const logFlushStarted = Date.now(); archive?.flush("provider_completed"); run.telemetry.durableLoggingMs = Date.now() - logFlushStarted; run.telemetry.logsFlushedAt = now();
        verifyInputWorkspaceUnchanged(stagingFolder, request.requestPackage.documents);
        run.progress.stage = "waiting_artifacts"; const artifacts = readPublishedArtifacts(artifactPaths); run.analysisReportPath = artifacts.reportText ? artifactPaths.report : null;
        const missingObserved = requiredWorkspaceFiles.filter((fileName) => !observedWorkspaceFiles.get(runId)?.has(fileName));
        if (missingObserved.length) throw new AiAnalysisError("AI_INPUT_FILE_HASH_MISMATCH", `Provider file-read evidence is incomplete: missing ${missingObserved.join(", ")}.`);
        run.analysisReportContent = artifacts.reportText; run.finalAssistantMessage = artifacts.finalText;
        const raw = stageVisibleProviderResponse(stagingFolder, response.text); run.providerResponseRawPath = raw.rawFilePath; run.providerResponseGzipPath = raw.filePath; run.providerResponseSha256 = raw.rawSha256; run.providerResponseGzipSha256 = raw.gzipSha256;
        const validationStarted = Date.now(); run.status = "validating"; run.progress.status = "validating"; run.progress.stage = "validating_artifacts_v0316";
        const validated = parseAndValidateDecisions(artifacts.decisionsText, { runId, sourceSha256: dataset.sourceFileSha256, rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId, recordCount: compact.payload.eventCount, catalogSkillIds: run.rules.catalog.map((item) => item.id) });
        run.receivedDecisionCount = validated.validation.actualCount; run.providerReturnedRecordCount = validated.validation.actualCount; run.parsedRecordCount = validated.validation.actualCount; run.schemaValidRecordCount = validated.validation.valid ? validated.validation.actualCount : 0; run.semanticValidRecordCount = validated.validation.semanticValidCount; run.progress.resultRecordCount = validated.validation.actualCount; run.progress.completedDiffs = validated.validation.actualCount; notify(event);
        atomicWriteCanonical(artifactPaths.validationReport, { schemaVersion: "ai-analysis-validation-report-v1", runId, sourceSha256: dataset.sourceFileSha256, rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId, decisionSha256: artifacts.hashes.decisions, expectedCount: compact.payload.eventCount, actualCount: validated.validation.actualCount, findings: validated.validation.findings, warnings: validated.validation.warnings, distribution: validated.validation.distribution, evidenceCoverage: validated.validation.evidenceCoverage, reportPresent: Boolean(artifacts.reportText), finalMessagePresent: Boolean(artifacts.finalText), validatedAt: now(), validationDurationMs: Date.now() - validationStarted }); run.validationReportPath = artifactPaths.validationReport;
        if (!validated.validation.valid) { const finding = validated.validation.findings[0]; throw new AiAnalysisError(finding.code as AiAnalysisErrorCode, `${finding.path}: ${finding.message} expected=${JSON.stringify(finding.expected)} actual=${JSON.stringify(finding.actual)}`); }
        run.telemetry.validationMs = Date.now() - validationStarted; const assemblyStarted = Date.now(); run.progress.stage = "assembling_canonical";
        run.results = assembleCanonicalResults(compact.payload, validated.document, run.rules, model, response.requestId, run.progress.usage); run.canonicalRecordCount = run.results.length; run.progress.resultRecordCount = run.results.length; run.progress.completedDiffs = run.results.length;

        run.anomalyWarnings = [...new Set([...(run.anomalyWarnings ?? []), ...validated.validation.warnings, ...artifacts.warnings])]; const warningGate = warningPersistenceGate({ structuralValidationPassed: true, warnings: run.anomalyWarnings });
        run.status = warningGate.requiresHumanAcceptance ? "completed_with_warnings" : "completed"; run.progress.status = run.status; run.finalAcceptedRecordCount = warningGate.sqliteEligible ? run.results.length : 0; run.databaseWriteStatus = warningGate.sqliteEligible ? "Eligible - awaiting local commit" : `Not written - manual acceptance required for ${warningGate.pendingWarnings.join(", ")}`;
        const canonicalArtifact = atomicWriteCanonical(artifactPaths.canonicalResult, analyzedDocument(run)); run.analyzedFilePath = canonicalArtifact.filePath; run.analyzedFileSizeBytes = canonicalArtifact.sizeBytes; run.analyzedFileSha256 = canonicalArtifact.sha256; run.formalArtifactRecordCount = run.results.length; run.telemetry.canonicalAssemblyMs = Date.now() - assemblyStarted; run.telemetry.canonicalOutputCompletedAt = now();
        atomicWriteCanonical(artifactPaths.validationReport, { schemaVersion: "ai-analysis-validation-report-v1", runId, finalStatus: run.status, finalValidationStatus: "passed", sourceSha256: dataset.sourceFileSha256, rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId, decisionSha256: artifacts.hashes.decisions, reportSha256: artifacts.hashes.report, finalAssistantMessageSha256: artifacts.hashes.finalMessage, canonicalOutputSha256: canonicalArtifact.sha256, expectedCount: compact.payload.eventCount, actualDecisionCount: validated.validation.actualCount, canonicalRecordCount: run.results.length, indexCompleteUniqueOrdered: validated.validation.findings.every((finding) => !["AI_DECISION_INDEX_DUPLICATE", "AI_DECISION_INDEX_MISSING"].includes(finding.code)), schemaValidationPassed: validated.validation.valid, semanticValidationPassed: validated.validation.valid, semanticValidCount: validated.validation.semanticValidCount, findings: validated.validation.findings, warnings: run.anomalyWarnings, distribution: validated.validation.distribution, evidenceCoverage: validated.validation.evidenceCoverage, rationaleDuplicateRatio: validated.validation.rationaleDuplicateRatio, unknownReasonDuplicateRatio: validated.validation.unknownReasonDuplicateRatio, reportPresent: Boolean(artifacts.reportText), finalMessagePresent: Boolean(artifacts.finalText), sqliteEligibility: warningGate, validatedAt: now(), validationDurationMs: Date.now() - validationStarted, canonicalAssemblyMs: run.telemetry.canonicalAssemblyMs });
        const completion = buildCompletionManifest({ run, paths: artifactPaths, validation: validated.validation, decisionSha256: artifacts.hashes.decisions, canonicalResultSha256: canonicalArtifact.sha256, canonicalCount: run.results.length, sqliteEligible: warningGate.sqliteEligible }); atomicWriteCanonical(artifactPaths.completionManifest, completion); run.completionManifestPath = artifactPaths.completionManifest;
        archive?.append("artifact_event", "APP_ONLY", "AI decisions, analysis report, final summary, validation report, canonical result, and completion manifest published.", { decisions: validated.validation.actualCount, canonical: run.results.length, warnings: run.anomalyWarnings, sqliteEligible: warningGate.sqliteEligible });
        archive?.append("validation_event", "APP_ONLY", "Decision and canonical validation completed.", { valid: true, semanticValidCount: validated.validation.semanticValidCount, warnings: run.anomalyWarnings });
        run.progress.completedBatches = 0; run.progress.message = warningGate.requiresHumanAcceptance ? "Analysis completed with warnings. Review the report and explicitly accept warnings before SQLite write." : "Analysis artifacts validated and canonical output assembled.";
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
      run.distributionDiagnostics = buildDistributionDiagnostics(run.results, run.rules); run.progress.resultRecordCount = run.results.length;
      if (run.results.length !== run.selectedDiffIds.length) throw new AiAnalysisError("AI_RESULT_COUNT_MISMATCH", `Completed result count mismatch: expected=${run.selectedDiffIds.length} actual=${run.results.length}.`);
      run.validationGate = evaluateFormalPersistenceGate({ providerStatus: "completed", inputIds: run.selectedDiffIds, outputIds: run.results.map((item) => item.sourceDiffId), catalogInvalidSkillIds: [], responseSaved: payload.mode !== "CHATGPT" || Boolean(run.providerResponseGzipPath), jsonValid: true });
      if (!run.validationGate.passed) throw new AiAnalysisError("AI_RESULT_IDENTITY_VALIDATION_FAILED", "Formal persistence gate rejected incomplete or invalid result identity.");
      run.completedAt = now(); run.progress.completedBatches = payload.mode === "CHATGPT" ? 0 : 1; run.progress.completedDiffs = run.results.length; run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
      if (payload.mode === "CHATGPT") {
        run.progress.stage = "writing_formal_artifacts";
        if (run.status === "completed_with_warnings") {
          run.progress.status = "completed_with_warnings"; run.progress.stage = "completed"; run.validationGate.sqliteAllowed = false; run.validationGate.goldenHtmlAllowed = false; run.databasePath = null; run.sqliteCommittedRecordCount = 0; run.finalAcceptedRecordCount = 0;
          run.warningAcceptance = { accepted: false, acceptedAt: null, warnings: run.anomalyWarnings ?? [], auditFilePath: null };
          run.progress.message = `Completed with warnings (${(run.anomalyWarnings ?? []).join(", ")}). SQLite and Golden HTML require explicit warning acceptance.`;
        } else {
          const reportPath = path.join(run.runDirectory!, "canonical-output", "analysis-result.html"); const html = goldenHtmlForRun(run, dataset); validateGoldenHtml(html, run.results.length); const report = atomicExport(reportPath, html); run.reportFilePath = report.filePath; run.reportFileSizeBytes = report.sizeBytes; run.reportFileSha256 = report.sha256;
          const sqliteStarted = Date.now(); run.progress.stage = "committing_database"; initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run); run.telemetry = { ...(run.telemetry ?? {}), sqliteWriteMs: Date.now() - sqliteStarted, sqliteCompletedAt: now() }; run.databasePath = dbPath; run.databaseWriteStatus = `Written - ${run.results.length} validated records`; run.sqliteCommittedRecordCount = run.results.length; run.finalAcceptedRecordCount = run.results.length; run.progress.stage = "completed"; run.progress.status = "completed"; run.progress.message = "Analysis artifacts, canonical output, Golden HTML, and SQLite commit completed.";
        }
        if (runStagingFolder) persistRunDebugEvidence(runStagingFolder, run, requestEvidence, { providerResponseSha256: run.providerResponseSha256, finalAssistantMessagePath: run.finalAssistantMessagePath, analysisReportPath: run.analysisReportPath }, [{ at: run.startedAt, type: "analysis_started" }, { at: run.completedAt, type: "analysis_completed", warnings: run.anomalyWarnings ?? [] }], analysisUserActions);
      } else {
        run.status = "completed"; run.progress.status = "completed"; run.progress.stage = "writing_staging"; run.progress.message = "Analysis completed. Results require human review.";
        const reportPath = run.plannedAnalyzedFilePath!.replace(/\.json$/i, ".html"); const html = goldenHtmlForRun(run, dataset); validateGoldenHtml(html, run.results.length); let exported: ReturnType<typeof atomicExport> | null = null; let report: ReturnType<typeof atomicExport> | null = null;
        try { exported = atomicExport(run.plannedAnalyzedFilePath!, JSON.stringify(analyzedDocument(run), null, 2)); report = atomicExport(reportPath, html); run.analyzedFilePath = exported.filePath; run.analyzedFileSizeBytes = exported.sizeBytes; run.analyzedFileSha256 = exported.sha256; run.formalArtifactRecordCount = run.results.length; run.reportFilePath = report.filePath; run.reportFileSizeBytes = report.sizeBytes; run.reportFileSha256 = report.sha256; run.progress.stage = "committing_database"; initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run); run.databasePath = dbPath; run.databaseWriteStatus = `Written - ${run.results.length} validated records`; run.sqliteCommittedRecordCount = run.results.length; run.progress.stage = "completed"; }
        catch (error) { if (exported) try { fs.unlinkSync(exported.filePath); } catch {} if (report) try { fs.unlinkSync(report.filePath); } catch {} throw error; }
      }
    } catch (error) {
      const value = asAnalysisError(error);
      const providerFailure = providerFailureEvidence.get(runId);
      if (providerFailure) { providerVisibleResponse = providerFailure.visibleText || null; run.progress.usage = providerFailure.usage; }
      const zeroDispatchFailure = ["AI_CODEX_SANDBOX_CONFIGURATION_REJECTED", "AI_CODEX_WORKSPACE_WRITE_NOT_ALLOWED", "AI_SANDBOX_POLICY_MISMATCH", "AI_OUTPUT_WRITE_PROBE_CREATE_FAILED", "AI_OUTPUT_WRITE_PROBE_CONTENT_MISMATCH", "AI_OUTPUT_WRITE_PROBE_RENAME_FAILED", "AI_OUTPUT_WRITE_PROBE_FAILED"].includes(value.code);
      if (zeroDispatchFailure) run.progress.usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, availability: "actual_zero_no_model_dispatch", estimatedInputTokens: run.progress.usage.estimatedInputTokens, turnCumulative: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }, lastModelCall: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }, usageEventCount: 0 };
      const failedStage = run.progress.stage ?? "failed";
      const validationFailure = value.code.startsWith("AI_DECISION_") || ["AI_ANALYSIS_REPORT_MISSING", "AI_FINAL_SUMMARY_MISSING", "AI_OUTPUT_PATH_ESCAPE_BLOCKED", "AI_OUTPUT_PUBLISH_INCOMPLETE", "AI_RESULT_COUNT_MISMATCH", "AI_RESULT_IDENTITY_VALIDATION_FAILED"].includes(value.code);
      run.status = value.code === "RUN_CANCELLED" ? "cancelled" : value.code === "AI_PROVIDER_TIMEOUT" ? "provider_timeout" : zeroDispatchFailure ? "failed" : validationFailure ? "failed_validation" : "provider_failed"; run.completedAt = now(); run.progress.status = run.status; run.progress.stage = run.status === "cancelled" ? "cancelled" : "failed"; run.progress.errorCode = value.code; run.progress.message = value.message; run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
      run.databaseWriteStatus = value.code === "AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED" ? "Not written — local output schema validation failed before provider request"
        : value.code === "AI_OUTPUT_SCHEMA_PROVIDER_REJECTED" ? "Not written — Provider rejected output schema before turn start"
        : value.code === "AI_PROVIDER_RESPONSE_INCOMPLETE" ? "Not written — Provider response incomplete"
        : value.code === "AI_PROVIDER_RESPONSE_JSON_INVALID" ? "Not written — Provider response JSON invalid"
        : value.code === "AI_PROVIDER_RESPONSE_SCHEMA_INVALID" ? "Not written — response schema validation failed"
        : value.code === "AI_RESULT_IDENTITY_VALIDATION_FAILED" ? "Not written — result identity validation failed"
        : value.code === "AI_RESULT_CATALOG_VALIDATION_FAILED" ? "Not written — Catalog validation failed"
        : failedStage === "starting_thread" || failedStage === "preflighting_capacity" || failedStage === "building_payload" || failedStage === "building_output_schema" || failedStage === "validating_output_schema" ? "Not written — failed before provider request"
        : failedStage === "receiving_response" || failedStage === "waiting_response" ? "Not written — Provider response incomplete"
        : "Not written — result validation failed";
      const deduped = errorDeduplicator.record(runId, failedStage, value.code, value.message);
      if (payload.mode === "CHATGPT" && runStagingFolder) {
        try {
          run.failedStagingPath = null;
          if (run.artifactPaths) { const failedValidationPath = path.join(run.artifactPaths.canonical, "validation-report.json"); atomicWriteCanonical(failedValidationPath, { schemaVersion: "ai-analysis-validation-report-v1", runId, finalStatus: run.status, failedStage, rootErrorCode: value.code, message: value.message, aiTurnCompleted: (run.progress.turnCompletedCount ?? 0) > 0, aiReportedCount: run.providerReturnedRecordCount ?? 0, authoritativeDecisionCount: run.receivedDecisionCount ?? 0, canonicalRecordCount: run.canonicalRecordCount ?? 0, assemblyAllowed: false, sqliteAllowed: false, generatedAt: now() }); run.validationReportPath = failedValidationPath; }
          persistRunDebugEvidence(runStagingFolder, run, requestEvidence, providerVisibleResponse === null ? undefined : { text: redactChatGptTextComplete(providerVisibleResponse) }, [{ at: startedAt, type: "analysis_started", runId }, { at: deduped.lastOccurredAt, type: "primary_error", ...deduped }], analysisUserActions);
          atomicExport(path.join(runStagingFolder, "failed-run-manifest.json"), JSON.stringify({ runId, status: run.status, failedStage, errorCode: value.code, message: value.message, databaseWriteStatus: run.databaseWriteStatus, completedAt: run.completedAt }, null, 2));
        } catch (stagingError) { run.progress.message += " Canonical evidence finalization failed: " + (stagingError instanceof Error ? stagingError.message : String(stagingError)); }
      }
    } finally { const archive = runArchives.get(runId); try { archive?.writeManifest(run); if (!["queued", "running", "validating", "retrying", "cancelling"].includes(run.status)) archive?.close("terminal"); } catch (archiveError) { run.progress.errorCode = "AI_RUN_ARCHIVE_FAILED"; run.progress.message += ` Archive finalization failed: ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`; } if (run.status !== "queued") dispatchGuard.finish(runId); providerFailureEvidence.delete(runId); activeRunId = null; abortControllers.delete(runId); observedWorkspaceFiles.delete(runId); lastProviderUiNotifyAt.delete(runId); notify(event); }
    return { ok: run.status === "completed" || run.status === "completed_with_warnings", run, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:accept-warnings", async (event, payload: { runId: string; accept: boolean }) => {
    const run = runs.find((item) => item.runId === payload.runId); const dataset = run ? pendingDatasets.find((item) => item.datasetId === run.sourceDatasetId) : null;
    if (!run || !dataset || !run.runDirectory || run.status !== "completed_with_warnings" || !run.validationGate?.passed || !run.anomalyWarnings?.length) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Only a structurally valid completed_with_warnings Run can be accepted."));
    if (payload.accept) { const options = { type: "warning" as const, buttons: ["Cancel", "Accept Warnings and Write"], defaultId: 0, cancelId: 0, title: "Accept AI Analysis Warnings", message: `Accept warnings for ${run.runId}?`, detail: `Warnings: ${run.anomalyWarnings.join(", ")}\nThis does not bypass schema, count, hash, identity, or semantic validation.` }; const owner = BrowserWindow.fromWebContents(event.sender); const choice = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options); if (choice.response !== 1) return { ok: false, canceled: true, snapshot: snapshot() }; }
    const acceptedAt = now(); const auditPath = path.join(run.runDirectory, "canonical-output", "warning-acceptance-audit.jsonl"); const audit = { schemaVersion: "ai-warning-acceptance-v1", runId: run.runId, accepted: payload.accept, warnings: run.anomalyWarnings, acceptedAtLocal: new Date().toLocaleString("sv-SE"), acceptedAtUtc: acceptedAt };
    const descriptor = fs.openSync(auditPath, "a"); try { fs.writeSync(descriptor, JSON.stringify(audit) + "\n"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    run.warningAcceptance = { accepted: payload.accept, acceptedAt, warnings: [...run.anomalyWarnings], auditFilePath: auditPath }; analysisUserActions.push(`${acceptedAt} Warning acceptance ${payload.accept ? "confirmed" : "rejected"}: ${run.runId} ${run.anomalyWarnings.join(",")}`);
    const archive = runArchives.get(run.runId) ?? AiAnalysisRunArchive.reopen(run.runId, run.runDirectory); runArchives.set(run.runId, archive);
    if (!payload.accept) { run.databaseWriteStatus = "Not written - warnings rejected by user"; archive.append("validation_event", "APP_ONLY", "Warning acceptance rejected; SQLite remains blocked.", audit); archive.writeManifest(run); return { ok: true, accepted: false, snapshot: snapshot() }; }
    const gate = warningPersistenceGate({ structuralValidationPassed: run.validationGate.passed, warnings: run.anomalyWarnings, acceptedWarnings: run.anomalyWarnings }); if (!gate.sqliteEligible) return errorPayload(new AiAnalysisError("AI_SQLITE_TRANSACTION_FAILED", "Warning acceptance cannot bypass structural validation."));
    run.validationGate.sqliteAllowed = true; run.validationGate.goldenHtmlAllowed = true;
    const dbPath = resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, path.join(getAppDataDir(), "ai-analysis.sqlite3")); const sqliteStarted = Date.now(); initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run); run.databasePath = dbPath; run.sqliteCommittedRecordCount = run.results.length; run.finalAcceptedRecordCount = run.results.length; run.databaseWriteStatus = `Written after explicit warning acceptance - ${run.results.length} validated records`; run.telemetry = { ...(run.telemetry ?? {}), sqliteWriteMs: Date.now() - sqliteStarted, sqliteCompletedAt: now() };
    const htmlPath = path.join(run.runDirectory, "canonical-output", "analysis-result.html"); const html = goldenHtmlForRun(run, dataset); validateGoldenHtml(html, run.results.length); const report = atomicExport(htmlPath, html); run.reportFilePath = report.filePath; run.reportFileSizeBytes = report.sizeBytes; run.reportFileSha256 = report.sha256;
    if (run.completionManifestPath && fs.existsSync(run.completionManifestPath)) { const manifest = JSON.parse(fs.readFileSync(run.completionManifestPath, "utf8")); atomicWriteCanonical(run.completionManifestPath, { ...manifest, sqliteEligible: true, warningAcceptance: audit, sqliteCommittedRecordCount: run.results.length }); }
    archive.append("validation_event", "APP_ONLY", "Warnings explicitly accepted; validated results committed to SQLite.", audit); archive.writeManifest(run); archive.close("warning_acceptance"); return { ok: true, accepted: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:cancel-capacity-warning", async (event, runId: string) => {
    const run = runs.find((item) => item.runId === runId);
    if (!run || run.progress.stage !== "waiting_capacity_confirmation" || !run.capacityConfirmation) return { ok: false, message: "Capacity confirmation is not pending.", snapshot: snapshot() };
    run.capacityConfirmation = { ...run.capacityConfirmation, confirmationAction: "cancelled", confirmedAt: now() };
    run.status = "cancelled"; run.completedAt = now(); run.progress.status = "cancelled"; run.progress.stage = "cancelled";
    run.progress.message = "Capacity warning cancelled. No provider request, thread, or turn was created.";
    run.databaseWriteStatus = "Not written — cancelled before provider request";
    analysisUserActions.push(`${run.capacityConfirmation.confirmedAt} Capacity warning cancelled: ${runId}`);
    if (run.compactPayloadPath) persistRunDebugEvidence(path.dirname(run.compactPayloadPath), run, undefined, undefined, [{ at: run.capacityConfirmation.confirmedAt, type: "capacity_cancelled" }], analysisUserActions);
    dispatchGuard.finish(runId); notify(event);
    return { ok: true, run, snapshot: snapshot() };
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
  ipcMain.handle("ai-analysis:conversation", async (_event, payload: { runId: string; offset?: number; limit?: number }) => {
    const run = runs.find((item) => item.runId === payload.runId);
    if (!run?.runDirectory) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Run archive was not found."));
    try { return { ok: true, ...readConversationPage(run.runDirectory, payload.offset, payload.limit) }; } catch (error) { return errorPayload(new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", error instanceof Error ? error.message : String(error))); }
  });
  ipcMain.handle("ai-analysis:delete-run", async (event, runId: string) => {
    const index = runs.findIndex((item) => item.runId === runId); const run = runs[index];
    if (!run?.runDirectory || activeRunId === runId || ["running", "queued", "retrying", "cancelling"].includes(run.status)) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Only a terminal Run archive can be deleted."));
    const options = { type: "warning" as const, buttons: ["Cancel", "Delete Run Archive"], defaultId: 0, cancelId: 0, title: "Delete Run Archive", message: `Delete local Run archive ${runId}?`, detail: "This removes only the local Run archive. It does not delete formal JSON, HTML, or SQLite records." };
    const owner = BrowserWindow.fromWebContents(event.sender); const choice = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
    if (choice.response !== 1) return { ok: false, canceled: true, snapshot: snapshot() };
    try { deleteRunArchive(run.runDirectory); runs.splice(index, 1); runArchives.delete(runId); if (selectedRunId === runId) selectedRunId = runs[0]?.runId ?? null; return { ok: true, canceled: false, snapshot: snapshot() }; } catch (error) { return errorPayload(new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", error instanceof Error ? error.message : String(error))); }
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
