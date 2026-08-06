import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { assertAppPath, ensureDir, getActivityStreamBaselinesDir, getAppDataDir, getAppLogsDir, getAppRuntimeDir, getBackupsDir, getCacheDir, getConfigDir, getConfigPath, getConnectionsPath, getCrashDumpsDir, getCrashLogsDir, getDatabaseDir, getDebugFoldersDir, getDefaultEnvPath, getEnvPath, getExportsDir, getFullFetchLogsDir, getFullFetchRawRunsDir, getFullFetchResultsDir, getFullFetchStagingDir, getLegacyFullFetchStagingDir, getLogsDir, getProbeResultsDir, getRawDataDir, getSessionDataDir, getSourceArchivesDir, getTempDir, initializeAppRoot } from "./appPaths.js";
import { createCollisionSafeDirectory, getConfiguredAppRoot, isPathInsideRoot, resolveCanonicalAppRoot } from "./appRoot.js";
import { applyPortableElectronPaths } from "./electronPortablePaths.js";
import { baselineFileName, compareBaselineObservation, entryFingerprint as createEntryFingerprint, loadBaselineSnapshot, saveBaselineSnapshot, selectBaselineGuardOutcome, sha256, type ActivityStreamBaselineComparison, type ActivityStreamBaselineSnapshot, type BaselineObservation } from "./activityStreamBaseline.js";
import { buildUserActivityTimeline, classifyJiraRelation, classifyTimelineSource, timelineCsv, timelineEventSchema, type UserActivityTimelineBuild } from "./userActivityTimeline.js";
import { resolveActivityIssueKeys } from "./activityIssueKeys.js";
import { buildTimelineIssueGroups, defaultWorkflowSteps, extractRelatedIssues, mergeQueueMetadata, reconcileIssueKeySets, relatedIssueScopeSummary, relatedIssueSummary, type RelatedCandidateIssue, type WorkflowStepStatus } from "./userAnalysisWorkflow.js";
import { analysisRoadmap, extractJiraEvidenceFromIssue, jiraEvidenceSchema, summarizeJiraEvidence, type JiraEvidenceEvent, type JiraEvidenceExcludedSummary, type JiraEvidenceSummary } from "./jiraEvidence.js";
import { classifyWindowStability, csvCell, finalizeAttemptDiffs, fingerprintSet, mergeProbeAttempts, normalizeStabilityEvent, recommendStabilitySettings, splitActivityStreamWindows, type ActivityStreamProbeAttempt, type ActivityStreamProbeRun, type ActivityStreamProbeWindow, type ActivityStreamStabilityProbeConfig } from "./activityStreamStability.js";
import { classifyActivityStreamResult, executeRoundFirstStability, type ActivityStreamProbeRunV2, type ActivityStreamRound, type ActivityStreamRoundWindowResult, type ActivityStreamStabilityConfigV2, type PhysicalHttpRequestDiagnostic, type RoundWindowFetchResult } from "./activityStreamRoundStability.js";
import { benchmarkCsv, executeActivityStreamBenchmark, type ActivityStreamBenchmarkConfig, type ActivityStreamBenchmarkRun } from "./activityStreamBenchmark.js";
import { buildSourceArchivePackage } from "./sourceArchiveExporter.js";
import { appendStagingDiagnostic, cleanupExpiredStaging, completeTarget, configureFullFetchBuildIdentity, createStagingRun, deleteFailedStaging, exportStaging, failStagingRun, finalizeStagingRun, listStagingRuns, loadStagingRun, previewStaging, readFullFetchResultIndex, recordStep5Action, recoverStaleStaging, setStagingStatus, stagingDebugIndex, stagingPaths, startTarget, updateStagingWorkflow, type OptionalEndpointStatus, type StagingRun } from "./fullFetchStaging.js";
import { buildFullFetchResultDocument, saveFullFetchResult } from "./fullFetchResult.js";
import { createJiraClient } from "./jira/jiraClient.js";
import { jiraGetWithRetry } from "./jira/jiraGetRetry.js";
import { fetchJiraPages } from "./jira/jiraPagination.js";
import { jiraFailureCode } from "./jira/jiraErrorCode.js";
import { classifyWorklogCompleteness, normalizeWorklogs } from "./worklogCompleteness.js";
import { assertReadOnlyRequest, ReadOnlyViolationError } from "./jira/jiraReadOnlyGuard.js";
import { createCanonicalQueueSnapshot, preflightFullFetchQueue } from "./fullFetchPreflight.js";
import { createFullFetchAttempt, evaluateFullFetchEligibility, type FullFetchAttempt, type TimelineRunEligibilityRecord } from "./fullFetchEligibility.js";
import { FullFetchRunRegistry, type FullFetchRunIdentity, type FullFetchRunRecord } from "./fullFetchRunRegistry.js";
import { evaluateEmbeddedChangelog } from "./changelogCompatibility.js";
import { ensureExportFolders, saveExportJson } from "./export/exportService.js";
import { sanitizeExportData, sanitizeTextForBundle } from "./export/sanitizeExport.js";
import { collectDebugFolderSources, describeFullFetchFailureEvidence, listDebugFolderFiles, summarizeDebugEvidence, type DebugEvidenceEntry, type DebugFolderEntry } from "./debugFolderCollector.js";
import { createPersistentDiagnostics } from "./persistentDiagnostics.js";
import { buildPathAudit } from "./pathAudit.js";
import { runApiProbe } from "./jira/jiraProbeRunner.js";
import { sanitizeRawJson, sanitizeResponseText } from "./jira/safeJson.js";
import type { JiraHttpResult, ProbeRequest } from "./jira/jiraTypes.js";
import { databasePathForEnv, resolveLocalDatabasePath } from "./appPathResolver.js";
import { DEFAULT_ENV_TEXT as defaultEnvText, atomicPatchEnv, ensureDefaultRuntimeEnv, loadRuntimeConfig, parseEnvText } from "./runtimeConfig.js";
import { checkJiraConnection } from "./jiraConnectionCheck.js";
import {
  checkCurrentStateDatabaseCompatibility as checkDatabaseCompatibility,
  createCurrentStateDatabase as createSourceArchiveDatabase,
  writeCurrentStateBatch
} from "./currentStateArchive.js";
import {
  buildSourceVersionProjectionDiagnostics,
  writeFullFetchStagingToCurrentDatabase
} from "./sourceArchiveDatabaseWrite.js";
import { StartupCheckCoordinator, initialRuntimeState, type RuntimeState } from "./runtimeStatus.js";
import { assertFormalDatabaseWriteAllowed, evaluateStabilityGate, type StabilityGateDecision } from "./stabilityGate.js";
import { reconcileRunChain } from "./runReconciliation.js";
import { StartupMilestoneRecorder, type StartupMilestoneName } from "./startupMilestones.js";
import { validateAndSaveDatabaseSelection } from "./startupIntegration.js";
import { issueViewerFailure } from "./databaseViewer.js";
import { DatabaseViewerCoordinator, type ViewerWorkerLane } from "./databaseViewerCoordinator.js";
import type { ViewerWorkerOperation } from "./databaseViewerWorker.js";
import { loadUiPreferences, updateUiPreferences } from "./uiPreferences.js";
import { validateActivityTimelineRunContext, type ActivityTimelineRunContext } from "./activityTimelineRunContext.js";

declare const __MAIN_APP_VERSION__: string;
declare const __MAIN_BUILD_TIME__: string;
declare const __MAIN_GIT_COMMIT__: string;
declare const __MAIN_GIT_BRANCH__: string;

configureFullFetchBuildIdentity({
  appVersion: __MAIN_APP_VERSION__,
  packagedSourceCommit: __MAIN_GIT_COMMIT__,
  buildTime: __MAIN_BUILD_TIME__
});

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === "1";
const isUiSmoke = process.env.ELECTRON_UI_SMOKE === "1";
const shouldCaptureUi = process.env.ELECTRON_UI_CAPTURE === "1";
const shouldSimulateCrashDiagnostic = process.env.JAA_SIMULATE_CRASH_DIAGNOSTIC === "1";
const appSessionId = `app-session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const databaseViewerCoordinator = new DatabaseViewerCoordinator(path.join(__dirname, "database-viewer-worker.cjs"));

const resolvedAppRoot = resolveCanonicalAppRoot({
  isPackaged: app.isPackaged,
  execPath: process.execPath,
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
  portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
  developmentRoot: process.env.JAA_DEV_APP_ROOT || path.resolve(__dirname, "../.runtime"),
  testRoot: isUiSmoke ? path.resolve(process.cwd(), "test-artifacts", `electron-ui-app-root-${process.pid}`) : undefined
});
const captureDir = app.isPackaged
  ? path.join(resolvedAppRoot, "test-artifacts", "screenshots")
  : process.env.ELECTRON_UI_CAPTURE_DIR
    ? path.resolve(process.env.ELECTRON_UI_CAPTURE_DIR)
    : path.resolve(process.cwd(), "test-artifacts/screenshots");

try {
  const appDirectories = initializeAppRoot(resolvedAppRoot);
  const appliedPaths = applyPortableElectronPaths(app, appDirectories);
  console.info("[app-root]", {
    appRoot: appDirectories.root,
    appData: appDirectories.appData,
    cache: appDirectories.cache,
    crashDumps: appDirectories.crashDumps,
    fullFetchStaging: appDirectories.fullFetchStaging,
    logs: appDirectories.logs,
    sessionData: appDirectories.sessionData,
    temp: appDirectories.temp,
    exports: appDirectories.exports,
    fallbackAttempted: appliedPaths.fallbackAttempted
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[app-root write-preflight failed]", { appRoot: resolvedAppRoot, fallbackAttempted: false, error: message });
  dialog.showErrorBox("Unable to write application data", message);
  app.exit(1);
  throw error;
}

type AutoSaveResultType = "activity_stream_run" | "precision_probe_run" | "manual_url_replay_run" | "maxresults_cap_test";
type AutoSavedRun = { runId: string; resultType: AutoSaveResultType; status: string; savedAt: string; filePath: string; folderPath: string; data: Record<string, unknown> };
const latestAutoSavedRuns = new Map<AutoSaveResultType, AutoSavedRun>();
const autoSavedRunHistory: AutoSavedRun[] = [];
const sessionStartTime = new Date().toISOString();
const startupMilestones = new StartupMilestoneRecorder();
const sessionUserActions: Array<{ time: string; level: string; message: string; raw: string }> = [];
type BaselineGuardRetrySummary = { triggered: boolean; maxRetries: number; attempts: Array<{ attempt: number; runId: string; classification: string; parsedActivityCount: number; issueKeyCount: number; missingIssueKeyCount: number; missingEntryFingerprintCount: number }>; finalAcceptedRunId: string; finalClassification: string; baselineUpdated: boolean; retryRecovered: boolean };
type BaselineGuardSessionRecord = { time: string; runId: string; comparison: ActivityStreamBaselineComparison; retry: BaselineGuardRetrySummary; snapshot: ActivityStreamBaselineSnapshot };
const activityStreamBaselineGuardHistory: BaselineGuardSessionRecord[] = [];
let latestActivityStreamBaselineGuardRecord: BaselineGuardSessionRecord | null = null;
let latestStabilityGateDecision: StabilityGateDecision = evaluateStabilityGate({ evaluationCompleted: false });

function refreshStabilityGateDecision() {
  const record = latestActivityStreamBaselineGuardRecord;
  const workflowState = latestUserAnalysisWorkflow?.uiState ?? {};
  const accepted = workflowState.stabilityContinueAccepted === true;
  latestStabilityGateDecision = evaluateStabilityGate({
    comparison: record?.comparison ?? null,
    retryRecovered: record?.retry.retryRecovered ?? false,
    evaluationCompleted: Boolean(record),
    allRoundsCompleted: Boolean(record),
    requestFailureCount: 0,
    reconciliationPassed: Boolean(record?.snapshot.snapshotKey),
    fingerprintConsistent: Boolean(record?.snapshot.requestSignatureHash),
    userContinueDecision: accepted ? { accepted: true, decidedAt: String(workflowState.stabilityContinueDecidedAt ?? new Date().toISOString()) } : null
  });
  return latestStabilityGateDecision;
}
let latestUserActivityTimeline: (UserActivityTimelineBuild & { exportedFiles: { jsonPath: string; csvPath: string; summaryPath: string } }) | null = null;
const timelineEligibilityRuns = new Map<string, TimelineRunEligibilityRecord>();
const timelineRunResults = new Map<string, UserActivityTimelineBuild & { exportedFiles: { jsonPath: string; csvPath: string; summaryPath: string } }>();
const fullFetchRunRegistry = new FullFetchRunRegistry();
let latestFullFetchAttempt: FullFetchAttempt | null = null;
let latestUserAnalysisWorkflow: { steps: WorkflowStepStatus; timelineIssueGroups: unknown[]; timelineSelectedIssues: string[]; fetchQueue: unknown[]; relatedCandidateIssues: RelatedCandidateIssue[]; addedTimelineIssuesToFetchQueueCount: number; addedRelatedIssuesToFetchQueueCount: number; addedRecommendedRelatedIssuesToFetchQueueCount: number; addedOptionalRelatedIssuesToFetchQueueCount: number; uiState: Record<string, unknown>; updatedAt: string } | null = null;
type FullFetchFailedIssue = { issueKey: string; errorCode: string; httpStatus: number | null; message: string; stage: "issue_full_fetch"; retryCount: number; source: string; matchedReason: string; occurredAt: string };
let latestFullFetchFailedIssues: FullFetchFailedIssue[] = [];
let latestFullFetchCoverageDiagnostics: Record<string, unknown> | null = null;
let latestJiraEvidence: { eventsDocument: Record<string, unknown>; events: JiraEvidenceEvent[]; summary: JiraEvidenceSummary; excluded: JiraEvidenceExcludedSummary; files: Record<string, string> } | null = null;
let latestActivityStreamStabilityProbe: (ActivityStreamProbeRun & { files: Record<string, string> }) | null = null;
let latestActivityStreamStabilityProbeV2: (ActivityStreamProbeRunV2 & { files: Record<string, string> }) | null = null;
let latestActivityStreamBenchmark: (ActivityStreamBenchmarkRun & { files: Record<string, string> }) | null = null;
let latestStabilityUiState: Record<string, unknown> = { activeTab: "stability", filters: {}, sort: {}, visibleColumns: {}, latestProbeRunId: "", statePersistedAt: "" };
let latestSourceArchiveExport: { fileName: string; filePath: string; exportRunId: string; selectedUser: string; createdAt: string; sizeBytes: number; sha256: string; jiraObjectCount: number; confluenceObjectCount: number; packageStatus?: string; safeForAutomaticImport?: boolean; verification?: Record<string, unknown> } | null = null;
let latestSourceArchiveDatabaseWrite: Record<string, unknown> | null = null;
let latestSourceArchiveMigration: unknown = null;
const activeSourceArchiveDatabaseWrites = new Set<string>();
let activeStabilityProbe: { runId: string; cancelled: boolean } | null = null;
let activeActivityStreamBenchmark: { runId: string; cancelled: boolean } | null = null;
let activeTimelineBuild: { runId: string; cancelled: boolean } | null = null;
let lastActivityStreamQueryAt = "";
let latestRunResult: AutoSavedRun | null = null;
let lastSuccessfulResult: AutoSavedRun | null = null;
let lastParsedResult: AutoSavedRun | null = null;
let latestNoEntriesResult: AutoSavedRun | null = null;
let lastDebugBundle = { path: "", createdAt: "" };
const crossPageDebugBundleTodo = [
  "Jira Probe: verify debug bundle includes latest probe result",
  "Jira Analysis: verify debug bundle includes latest analysis result",
  "Candidate Discovery: verify debug bundle includes latest candidate result",
  "Fetch Queue: verify run history and latest queue snapshot",
  "Full Fetch: verify debug bundle includes latest fetch report",
  "Connections / Data Source Test: verify latest connection test result"
];

if (isUiSmoke) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}

const uiRoutes = [
  { name: "connections", hash: "#/connections", title: "Jira Connection" },
  { name: "database", hash: "#/database", title: "Database Overview" },
  { name: "collection", hash: "#/collection", title: "Data Collection" },
  { name: "issues", hash: "#/issues", title: "Issue Viewer" },
  { name: "users", hash: "#/users", title: "User Viewer" },
  { name: "activity-stream-probe", hash: "#/activity-stream-probe", title: "Activity Stream" },
  { name: "jira-probe", hash: "#/jira-probe", title: "Jira Probe" },
  { name: "settings", hash: "#/settings", title: "Settings" }
];

const uiViewports = [
  { width: 1024, height: 768, capture: true },
  { width: 1280, height: 720, capture: true },
  { width: 1366, height: 768, capture: true },
  { width: 1600, height: 900, capture: true },
  { width: 1920, height: 1080, capture: true }
];

const debugStates = ["expanded", "collapsed"] as const;

function formatLocalDateTime(date = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatLocalLogTimestamp(date = new Date()) {
  return `${formatLocalDateTime(date)}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function fileTimestamp(date = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function dateStamp(date = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

type FullFetchMemory = {
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  systemFreeMB: number;
  rawDataEstimateMB: number;
};

type ActiveFullFetchDiagnostics = {
  sessionId: string;
  runId: string;
  status: string;
  queueCount: number;
  currentIndex: number;
  currentIssueKey: string;
  currentStage: string;
  lastCompletedIndex: number;
  lastCompletedIssueKey: string;
  success: number;
  partial: number;
  failed: number;
  skipped: number;
  startedAtMs: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string;
  autoLogPath: string;
  runManifestPath: string;
  lastLogs: string[];
  memory: FullFetchMemory;
  cancelRequested: boolean;
  stagingDir: string;
};

let activeFullFetch: ActiveFullFetchDiagnostics | null = null;
let latestFullFetchRunSnapshot: Record<string, unknown> | null = null;
let latestFullFetchStaging: StagingRun | null = null;
let latestFullFetchResult: { runId: string; document: Record<string, unknown>; savedPath: string; generatedAutomatically: boolean } | null = null;

function memorySnapshot(rawBytes = 0): FullFetchMemory {
  const memory = process.memoryUsage();
  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  return {
    rssMB: mb(memory.rss),
    heapUsedMB: mb(memory.heapUsed),
    heapTotalMB: mb(memory.heapTotal),
    externalMB: mb(memory.external),
    systemFreeMB: mb(os.freemem()),
    rawDataEstimateMB: mb(rawBytes)
  };
}

function maskDiagnosticText(value: string) {
  return sanitizeTextForBundle(value)
    .replace(/(Authorization\s*[:=]\s*)[^\r\n]+/gi, "$1[masked]")
    .replace(/((?:api[_-]?token|token|password|secret|cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[masked]");
}

const persistentDiagnostics = createPersistentDiagnostics({
  logsDir: ensureDir(getLogsDir()),
  sessionId: appSessionId,
  appRoot: getAppRuntimeDir(),
  build: {
    version: __MAIN_APP_VERSION__ || app.getVersion(),
    buildTime: __MAIN_BUILD_TIME__,
    gitCommit: __MAIN_GIT_COMMIT__,
    gitBranch: __MAIN_GIT_BRANCH__
  },
  sanitizeText: maskDiagnosticText,
  retentionSessions: 12
});

function appendRuntimeLog(filePath: string, level: string, message: string) {
  const line = `${formatLocalLogTimestamp()} [${level}] ${maskDiagnosticText(message)}`;
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
  if (activeFullFetch?.autoLogPath === filePath) {
    activeFullFetch.lastLogs = [...activeFullFetch.lastLogs, line].slice(-100);
  }
  return line;
}

function getUserActionLogPath(date = new Date()) {
  return path.join(ensureDir(getAppLogsDir()), `user-actions-${dateStamp(date)}.log`);
}

function getActionLogDiagnostics() {
  const actionLogPath = getUserActionLogPath();
  return {
    actionLogPath,
    actionLogAvailable: fs.existsSync(actionLogPath),
    actionLogNote: "USER_ACTION / GUARD / UI_MODAL are persisted separately to avoid UI debug buffer truncation."
  };
}

function appendUserActionLog(level: string, message: string) {
  const raw = appendRuntimeLog(getUserActionLogPath(), level, message);
  sessionUserActions.push({ time: new Date().toISOString(), level, message: maskDiagnosticText(message), raw });
  return raw;
}

function buildDebugLogExportContent(content: string) {
  const diagnostics = getActionLogDiagnostics();
  const actionTimeline = diagnostics.actionLogAvailable
    ? fs.readFileSync(diagnostics.actionLogPath, "utf8").trimEnd()
    : "No user action log entries are available for today. / 今日尚無使用者操作紀錄。";
  return {
    diagnostics,
    mergedContent: [
      maskDiagnosticText(content).trimEnd(),
      "",
      "===== User Action Timeline / 使用者操作時間線 =====",
      `User Action Log Path / 使用者操作紀錄路徑: ${diagnostics.actionLogPath}`,
      "",
      maskDiagnosticText(actionTimeline),
      ""
    ].join("\n")
  };
}

function writeJsonAtomic(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const body = JSON.stringify(sanitizeRawJson(data), null, 2);
  const descriptor = fs.openSync(temporaryPath, "wx");
  try {
    fs.writeFileSync(descriptor, body, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  const delays = [0, 50, 100, 250, 500];
  let lastError: unknown;
  try {
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) sleepSync(delays[attempt]);
      try {
        fs.renameSync(temporaryPath, filePath);
        return;
      } catch (error) {
        lastError = error;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
        const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES" || code === "EEXIST";
        if (!retryable) throw error;
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          fs.renameSync(temporaryPath, filePath);
          return;
        } catch (replaceError) {
          lastError = replaceError;
        }
      }
    }
    throw lastError;
  } finally {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* Temporary file cleanup is best effort. */ }
  }
}

function sleepSync(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function crashDiagnostic(reason: string, details: Record<string, unknown> = {}) {
  try {
    const crashDir = ensureDir(getCrashLogsDir());
    const crashPath = path.join(crashDir, `crash-${fileTimestamp()}.log`);
    const active = activeFullFetch;
    const incidentId = persistentDiagnostics.write("main", reason, details);
    const payload = {
      timestamp: new Date().toISOString(),
      localTimestamp: formatLocalLogTimestamp(),
      appVersion: __MAIN_APP_VERSION__ || app.getVersion(),
      buildTime: __MAIN_BUILD_TIME__,
      gitCommit: __MAIN_GIT_COMMIT__,
      gitBranch: __MAIN_GIT_BRANCH__,
      reason,
      sessionId: appSessionId,
      incidentId,
      details: sanitizeRawJson(details),
      activeFullFetch: active ? {
        runId: active.runId,
        status: active.status,
        currentIndex: active.currentIndex,
        total: active.queueCount,
        currentIssueKey: active.currentIssueKey,
        lastCompletedIssueKey: active.lastCompletedIssueKey,
        success: active.success,
        failed: active.failed,
        skipped: active.skipped,
        memory: active.memory,
        autoLogPath: active.autoLogPath,
        runManifestPath: active.runManifestPath
      } : null,
      lastDebugLogLines: active?.lastLogs ?? []
    };
    fs.writeFileSync(crashPath, maskDiagnosticText(JSON.stringify(payload, null, 2)), "utf8");
    if (active) {
      appendRuntimeLog(active.autoLogPath, "ERROR", `Crash diagnostic written: ${crashPath}`);
      try {
        const stagingRun = loadStagingRun(active.stagingDir);
        failStagingRun(stagingRun, active.currentIssueKey, new Error(`Process failure: ${reason}`), "process_crash");
        appendStagingDiagnostic(stagingRun.dir, "process_crash", { stagingId: stagingRun.state.stagingId, runId: stagingRun.state.fullFetchRunId, errorType: reason, errorMessage: JSON.stringify(details) });
      } catch (stagingError) {
        console.error("[staging crash diagnostic failed]", stagingError);
      }
    }
    return crashPath;
  } catch (error) {
    console.error("[crash diagnostic write failed]", error);
    return "";
  }
}

type AppConfig = {
  currentEnvPath?: string;
  lastEnvLoadedAt?: string;
};

function readAppConfig(): AppConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as AppConfig;
  } catch {
    return {};
  }
}

function writeAppConfig(config: AppConfig) {
  ensureDir(getConfigDir());
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

function resolveCurrentEnvPath() {
  const config = readAppConfig();
  if (config.currentEnvPath && fs.existsSync(config.currentEnvPath)) return config.currentEnvPath;
  return getDefaultEnvPath();
}

function setCurrentEnvPath(envPath: string) {
  const timestamp = formatLocalDateTime();
  writeAppConfig({ ...readAppConfig(), currentEnvPath: envPath, lastEnvLoadedAt: timestamp });
  return timestamp;
}

function ensureRuntimeFolders() {
  const folders = {
    runtimeDir: ensureDir(getAppRuntimeDir()),
    dataDir: ensureDir(getDatabaseDir()),
    logsDir: ensureDir(getLogsDir()),
    exportsDir: ensureDir(getExportsDir()),
    rawDataDir: ensureDir(getRawDataDir()),
    probeResultsDir: ensureDir(getProbeResultsDir()),
    backupsDir: ensureDir(getBackupsDir()),
    configDir: ensureDir(getConfigDir())
  };
  ensureExportFolders();
  return folders;
}

type AppConnection = {
  id: string;
  name: string;
  baseUrl: string;
  authType: "basic" | "bearer";
  apiVersion: "auto" | "v3" | "v2";
  username: string;
  email: string;
  apiToken?: string;
  tokenSource: "env" | "session" | "encrypted-store";
  tokenMasked: string;
  status: "connected" | "failed" | "not_tested";
  lastTestedAt: string;
  authenticatedUser: string;
  accessibleProjectsCount: number;
  active?: boolean;
};

function maskToken(token: string) {
  if (!token) return "";
  return token.length <= 4 ? "****" : `****${token.slice(-4)}`;
}

function connectionFromEnv(env: Record<string, string>): AppConnection {
  const name = "Current .env Jira Connection";
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "jira-production";
  const token = env.JIRA_API_TOKEN ?? "";
  const envApiVersion = (env.JIRA_API_VERSION ?? "2").toLowerCase();
  const authMode = (env.JIRA_AUTH_MODE ?? env.JIRA_AUTH_TYPE ?? "bearer").toLowerCase();
  return {
    id,
    name,
    baseUrl: env.JIRA_BASE_URL ?? "",
    authType: authMode === "basic" ? "basic" : "bearer",
    apiVersion: envApiVersion === "auto" ? "auto" : envApiVersion.replace(/^v/, "") === "3" ? "v3" : "v2",
    username: env.JIRA_USERNAME ?? "",
    email: env.JIRA_EMAIL ?? env.JIRA_USERNAME ?? "",
    apiToken: token,
    tokenSource: token ? "env" : "session",
    tokenMasked: maskToken(token),
    status: "not_tested",
    lastTestedAt: "",
    authenticatedUser: "",
    accessibleProjectsCount: 0,
    active: true
  };
}

function readConnectionFile() {
  const filePath = getConnectionsPath();
  if (!fs.existsSync(filePath)) return { activeConnectionId: "", connections: [] as AppConnection[] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { activeConnectionId?: string; connections?: AppConnection[] };
    return { activeConnectionId: parsed.activeConnectionId ?? "", connections: parsed.connections ?? [] };
  } catch {
    return { activeConnectionId: "", connections: [] as AppConnection[] };
  }
}

function writeConnectionFile(data: { activeConnectionId: string; connections: AppConnection[] }) {
  ensureDir(getConfigDir());
  const sanitized = {
    activeConnectionId: data.activeConnectionId,
    connections: data.connections.map(({ apiToken: _apiToken, ...connection }) => connection)
  };
  fs.writeFileSync(getConnectionsPath(), JSON.stringify(sanitized, null, 2), "utf8");
}

function loadConnectionState() {
  const envState = ensureProbeEnv();
  const env = parseEnvText(fs.readFileSync(envState.envPath, "utf8"));
  const envConnection = connectionFromEnv(
    isUiSmoke && !env.JIRA_BASE_URL
      ? {
          ...env,
          JIRA_BASE_URL: "https://jira-ui-smoke.invalid",
          JIRA_USERNAME: "ui-smoke",
          JIRA_EMAIL: "ui-smoke@example.invalid"
        }
      : env
  );
  const connections = [envConnection].map((item) => ({
    ...item,
    active: true
  }));
  return {
    env: envState,
    activeConnectionId: envConnection.id,
    activeConnection: connections.find((item) => item.active) ?? envConnection,
    connections
  };
}

function toProbeEnvConfig(env: Record<string, string>, sourcePath: string, status: "loaded" | "created") {
  const token = env.JIRA_API_TOKEN ?? "";
  const timestamp = formatLocalDateTime();
  const appConfig = readAppConfig();
  return {
    found: status === "loaded",
    created: status === "created",
    status,
    sourcePath,
    envPath: sourcePath,
    currentEnvPath: sourcePath,
    defaultEnvPath: getDefaultEnvPath(),
    appConfigPath: getConfigPath(),
    lastEnvLoadedAt: appConfig.lastEnvLoadedAt,
    loadedAt: status === "loaded" ? timestamp : undefined,
    createdAt: status === "created" ? timestamp : undefined,
    paths: ensureRuntimeFolders(),
    config: {
      baseUrl: env.JIRA_BASE_URL ?? "",
      email: env.JIRA_EMAIL ?? env.JIRA_USERNAME ?? "",
      username: env.JIRA_USERNAME ?? "",
      apiToken: token,
      hasToken: Boolean(token),
      envFormatVersion: env.ENV_FORMAT_VERSION ?? "2",
      authType: (env.JIRA_AUTH_MODE ?? env.JIRA_AUTH_TYPE ?? "bearer").toLowerCase(),
      apiVersion: (env.JIRA_API_VERSION ?? "2").toLowerCase().replace(/^v/, ""),
      localDatabasePath: env.LOCAL_DATABASE_PATH ?? "",
      issueKey: env.JIRA_PROBE_DEFAULT_ISSUE ?? "",
      depth: "standard",
      mockMode: (env.JIRA_PROBE_MOCK_MODE ?? "false").toLowerCase() === "true",
      logLevel: (env.JIRA_PROBE_LOG_LEVEL ?? "DEBUG").toUpperCase()
    }
  };
}

function ensureProbeEnv() {
  const paths = ensureRuntimeFolders();
  const envPath = resolveCurrentEnvPath();
  if (fs.existsSync(envPath)) {
    setCurrentEnvPath(envPath);
    return toProbeEnvConfig(parseEnvText(fs.readFileSync(envPath, "utf8")), envPath, "loaded");
  }
  const defaultEnvPath = getDefaultEnvPath();
  ensureDefaultRuntimeEnv(defaultEnvPath);
  setCurrentEnvPath(defaultEnvPath);
  return {
    ...toProbeEnvConfig(parseEnvText(defaultEnvText), defaultEnvPath, "created"),
    paths
  };
}

let runtimeCoordinator: StartupCheckCoordinator | null = null;

function runtimeStateWithoutRequestId<T extends { requestId: number }>(value: T): Omit<T, "requestId"> {
  const { requestId: _requestId, ...rest } = value;
  return rest;
}

function jiraConnectionStateFromRuntime(state: RuntimeState, source: "startup" | "manual" | "restored" = "startup") {
  const status = state.jira.status === "CONNECTED" ? "connected" : state.jira.status === "CHECKING" ? "testing" : state.jira.status === "NOT_CONFIGURED" ? "offline" : state.jira.checkedAt ? "failed" : "not_tested";
  return { status, serverUrl: state.jira.baseUrlNormalized || null, testedAt: state.jira.checkedAt || null, errorCode: status === "connected" ? null : state.jira.reasonCode || null, source, sequence: state.jira.requestId };
}

function hydratedConnectionState(state: RuntimeState = runtimeCoordinator?.snapshot() ?? initialRuntimeState(), source: "startup" | "manual" | "restored" = "restored") {
  const base = loadConnectionState();
  const jiraState = jiraConnectionStateFromRuntime(state, source);
  const activeConnection = { ...base.activeConnection, status: jiraState.status, lastTestedAt: jiraState.testedAt ?? base.activeConnection.lastTestedAt };
  return { ...base, activeConnection, connections: base.connections.map((item) => item.id === activeConnection.id ? activeConnection : item), jiraState };
}

function broadcastRuntimeState(state: RuntimeState) {
  const connectionState = hydratedConnectionState(state, "startup");
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) { window.webContents.send("runtime-state:changed", state); window.webContents.send("connection-state:changed", connectionState); }
  }
}

function currentJiraSettingsIdentity() {
  const config = loadRuntimeConfig(resolveCurrentEnvPath());
  let baseUrlNormalized = config.jiraBaseUrl.trim().replace(/\/+$/, "");
  try { baseUrlNormalized = new URL(config.jiraBaseUrl.trim()).toString().replace(/\/$/, ""); } catch { /* Classified by the connection check. */ }
  const settingsFingerprint = crypto.createHash("sha256").update(JSON.stringify({
    baseUrlNormalized,
    username: (config.jiraEmail || config.jiraUsername).trim().toLowerCase(),
    authType: config.jiraAuthMode,
    apiVersion: config.jiraApiVersion,
    credentialFingerprint: crypto.createHash("sha256").update(config.jiraApiToken, "utf8").digest("hex")
  }), "utf8").digest("hex");
  return { config, baseUrlNormalized, settingsFingerprint };
}

function markRuntimeJiraSettingsChanged() {
  const { config, baseUrlNormalized, settingsFingerprint } = currentJiraSettingsIdentity();
  return getRuntimeCoordinator().markJiraSettingsChanged({ settingsFingerprint, baseUrlNormalized, username: config.jiraEmail || config.jiraUsername, authType: config.jiraAuthMode });
}
async function runJiraStartupCheck() {
  if (isUiSmoke) {
    return {
      ...runtimeStateWithoutRequestId(initialRuntimeState().jira),
      status: "NOT_CONFIGURED" as const,
      reasonCode: "NOT_CONFIGURED" as const,
      message: "UI smoke uses offline fixtures.",
      checkedAt: new Date().toISOString()
    };
  }
  try {
    const { config, settingsFingerprint } = currentJiraSettingsIdentity();
    const checked = await checkJiraConnection({
      baseUrl: config.jiraBaseUrl,
      username: config.jiraUsername,
      email: config.jiraEmail,
      apiToken: config.jiraApiToken,
      authMode: config.jiraAuthMode,
      apiVersion: config.jiraApiVersion
    });
    return {
      ...checked,
      connectionStatus: checked.status === "CONNECTED" ? "connected" : checked.connectionStatus,
      authType: config.jiraAuthMode,
      testedAt: checked.checkedAt,
      errorCode: checked.status === "CONNECTED" ? "" : checked.reasonCode,
      errorMessage: checked.status === "CONNECTED" ? "" : checked.message,
      settingsFingerprint
    };
  } catch {
    return {
      ...runtimeStateWithoutRequestId(initialRuntimeState().jira),
      status: "UNKNOWN_ERROR" as const,
      reasonCode: "UNKNOWN_ERROR" as const,
      message: "Runtime Jira configuration could not be loaded.",
      checkedAt: new Date().toISOString()
    };
  }
}

async function runDatabaseStartupCheck() {
  try {
    const config = loadRuntimeConfig(resolveCurrentEnvPath());
    const databasePath = resolveLocalDatabasePath(getAppRuntimeDir(), config.localDatabasePath);
    const jiraIdentity = runtimeCoordinator?.snapshot().jira.status === "CONNECTED"
      ? runtimeCoordinator.snapshot().jira.serverIdentity
      : "";
    const compatibility = checkDatabaseCompatibility(databasePath, jiraIdentity);
    return { ...compatibility, migration: latestSourceArchiveMigration };
  } catch {
    return {
      ...runtimeStateWithoutRequestId(initialRuntimeState().database),
      status: "UNKNOWN_ERROR" as const,
      reasonCode: "UNKNOWN_ERROR" as const,
      message: "Runtime database configuration could not be loaded.",
      checkedAt: new Date().toISOString()
    };
  }
}

function getRuntimeCoordinator() {
  if (!runtimeCoordinator) {
    runtimeCoordinator = new StartupCheckCoordinator(
      async () => runJiraStartupCheck(),
      async () => runDatabaseStartupCheck(),
      broadcastRuntimeState
    );
  }
  return runtimeCoordinator;
}

async function startBackgroundChecks() {
  const coordinator = getRuntimeCoordinator();
  await coordinator.startParallel();
  const state = coordinator.snapshot();
  if (state.jira.status === "CONNECTED" && state.database.path) await coordinator.retryDatabase();
  startupMilestones.mark("Database Ready", coordinator.snapshot().database.status);
  startupMilestones.mark("App Interactive");
}

ipcMain.handle("runtime:get-state", async () => getRuntimeCoordinator().snapshot());
ipcMain.handle("runtime:get-startup-milestones", async () => startupMilestones.snapshot());
ipcMain.handle("runtime:retry-jira", async () => getRuntimeCoordinator().retryJira());
ipcMain.handle("runtime:retry-database", async () => getRuntimeCoordinator().retryDatabase());

function currentReadableDatabasePath() {
  const database = getRuntimeCoordinator().snapshot().database;
  if (!database.canRead || !database.path) throw new Error(`DATABASE_UNAVAILABLE:${database.reasonCode}`);
  return database.path;
}

function runDatabaseViewer(lane: ViewerWorkerLane, operation: ViewerWorkerOperation, ...args: unknown[]) {
  return databaseViewerCoordinator.run(lane, operation, currentReadableDatabasePath(), ...args);
}

function progressiveRequestId(value: unknown) {
  const requestId = String(value ?? "").trim();
  if (!/^[a-z0-9:_-]{1,160}$/i.test(requestId)) throw new Error("VIEWER_REQUEST_ID_INVALID");
  return requestId;
}

function runProgressiveDatabaseViewer(event: Electron.IpcMainInvokeEvent, lane: ViewerWorkerLane, operation: ViewerWorkerOperation, requestIdInput: unknown, ...args: unknown[]) {
  const requestId = progressiveRequestId(requestIdInput);
  return databaseViewerCoordinator.runProgressive(lane, operation, currentReadableDatabasePath(), requestId,
    (progress) => { if (!event.sender.isDestroyed()) event.sender.send("database-viewer:progress", progress); }, ...args);
}

ipcMain.handle("database-viewer:overview", async () => runDatabaseViewer("database", "overview"));
ipcMain.handle("database-viewer:health-check", async () => runDatabaseViewer("database", "healthCheck"));
ipcMain.handle("database-viewer:list-issues", async (_event, payload?: Record<string, unknown>) =>
  runDatabaseViewer("database-table", "listIssues", payload));
ipcMain.handle("database-viewer:issue-distributions", async () =>
  runDatabaseViewer("database-distributions", "issueDistributions"));
ipcMain.handle("database-viewer:get-issue", async (_event, payload: { issueKey?: string }) => {
  const issueKey = String(payload?.issueKey ?? "").trim().toUpperCase();
  try {
    return await runDatabaseViewer("issue", "getIssue", issueKey);
  } catch (error) {
    return issueViewerFailure(issueKey, "query_failed", error instanceof Error ? error.message : "Issue Viewer query failed.");
  }
});
ipcMain.handle("database-viewer:list-users", async (_event, payload?: { search?: string; limit?: number; offset?: number }) =>
  runDatabaseViewer("user-directory", "listUsers", payload));
ipcMain.handle("database-viewer:get-user", async (_event, payload: { userId?: string; limit?: number; offset?: number }) =>
  runDatabaseViewer("user-directory", "getUser", String(payload?.userId ?? ""), payload));
ipcMain.handle("database-viewer:user-distributions", async (_event, payload: { scope?: unknown; query?: Record<string, unknown> }) =>
  runDatabaseViewer("user-distributions", "userDistributions", payload?.scope, payload?.query));
ipcMain.handle("database-viewer:user-related-issues", async (_event, payload: { scope?: unknown; query?: Record<string, unknown> }) =>
  runDatabaseViewer("user", "userRelatedIssues", payload?.scope, payload?.query));
ipcMain.handle("database-viewer:user-events", async (event, payload: { requestId?: unknown; scope?: unknown; query?: Record<string, unknown> }) =>
  runProgressiveDatabaseViewer(event, "user", "userEvents", payload?.requestId, payload?.scope, payload?.query));
ipcMain.handle("database-viewer:issue-events", async (event, payload: { requestId?: unknown; issueKey?: string; query?: Record<string, unknown> }) =>
  runProgressiveDatabaseViewer(event, "issue-table", "issueEvents", payload?.requestId, String(payload?.issueKey ?? ""), payload?.query));
ipcMain.handle("database-viewer:issue-changelog", async (event, payload: { requestId?: unknown; issueKey?: string; query?: Record<string, unknown> }) =>
  runProgressiveDatabaseViewer(event, "issue-table", "issueChangelog", payload?.requestId, String(payload?.issueKey ?? ""), payload?.query));
ipcMain.handle("database-viewer:cancel", async (_event, payload: { requestId?: unknown; target?: unknown }) => {
  const requestId = progressiveRequestId(payload?.requestId);
  const target = String(payload?.target ?? "");
  const lane = target === "user-events" ? "user" : target === "issue-events" || target === "issue-changelog" ? "issue-table" : null;
  if (!lane) throw new Error("VIEWER_CANCEL_TARGET_INVALID");
  return { cancelled: databaseViewerCoordinator.cancel(lane, requestId), requestId };
});
ipcMain.handle("database-viewer:description-full-context", async (_event, payload: { eventId?: unknown; issueKey?: unknown; requestId?: unknown; revision?: unknown }) =>
  runDatabaseViewer("detail", "descriptionFullContext", payload));
ipcMain.handle("database-viewer:description-original-previews", async (_event, payload: Record<string, unknown>) =>
  runDatabaseViewer("detail", "descriptionOriginalPreviews", payload));
ipcMain.handle("database-viewer:description-comparison", async (_event, payload: Record<string, unknown>) =>
  runDatabaseViewer("detail", "descriptionComparison", payload));
ipcMain.handle("database-viewer:distinct-values", async (_event, payload: Record<string, unknown>) =>
  runDatabaseViewer("distinct", "distinctValues", payload));
ipcMain.handle("ui-preferences:get", async () => loadUiPreferences(getConfiguredAppRoot()));
ipcMain.handle("ui-preferences:update", async (_event, payload: { section?: unknown; value?: unknown }) => {
  const section = String(payload?.section ?? "");
  const allowedSections = new Set([
    "databaseIssueList", "timelineEventList", "userRelatedIssues", "userAllActivityEvents",
    "issueActivityEvents", "issueChangelog", "issueComments", "filterPresets"
  ]);
  if (!allowedSections.has(section)) throw new Error("INVALID_UI_PREFERENCE_SECTION");
  return updateUiPreferences(getConfiguredAppRoot(), section as Parameters<typeof updateUiPreferences>[1], payload?.value);
});

ipcMain.handle("jira-probe:run", async (_event, request: ProbeRequest) => {
  if (!request || request.useMock) {
    throw new Error("Jira Probe IPC only runs real read-only API probes.");
  }
  return runApiProbe(request);
});

ipcMain.handle("connection:load-env", async () => {
  const state = loadConnectionState();
  const runtime = markRuntimeJiraSettingsChanged();
  return { ...hydratedConnectionState(runtime, "restored"), runtime };
});

ipcMain.handle("connection:list", async () => hydratedConnectionState());

ipcMain.handle("connection:choose-env", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose Env File",
    defaultPath: path.dirname(resolveCurrentEnvPath()),
    properties: ["openFile"],
    filters: [
      { name: "Environment Files", extensions: ["env"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, state: hydratedConnectionState() };
  }
  const envPath = result.filePaths[0];
  if (path.basename(envPath).toLowerCase() === ".env.version") {
    return { canceled: true, error: ".env.Version is a template and cannot be used as runtime configuration.", state: hydratedConnectionState() };
  }
  setCurrentEnvPath(envPath);
  const state = loadConnectionState();
  const runtime = markRuntimeJiraSettingsChanged();
  return { canceled: false, state: hydratedConnectionState(runtime, "restored"), runtime };
});

ipcMain.handle("database:check-path", async (_event, payload?: { filePath?: string }) => {
  const configuredPath = payload?.filePath ?? loadRuntimeConfig(resolveCurrentEnvPath()).localDatabasePath;
  const resolved = resolveLocalDatabasePath(getAppRuntimeDir(), configuredPath);
  const jiraIdentity = getRuntimeCoordinator().snapshot().jira.status === "CONNECTED"
    ? getRuntimeCoordinator().snapshot().jira.serverIdentity
    : "";
  return checkDatabaseCompatibility(resolved, jiraIdentity);
});

ipcMain.handle("database:select-existing", async (_event, payload?: { filePath?: string }) => {
  let selectedPath = payload?.filePath ?? "";
  if (!selectedPath) {
    const result = await dialog.showOpenDialog({
      title: "Select Existing Source Archive Database / 選擇既有來源封存資料庫",
      properties: ["openFile"],
      filters: [
        { name: "SQLite Database", extensions: ["sqlite", "sqlite3", "db"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, saved: false, state: getRuntimeCoordinator().snapshot() };
    selectedPath = result.filePaths[0];
  }
  const jiraIdentity = getRuntimeCoordinator().snapshot().jira.status === "CONNECTED"
    ? getRuntimeCoordinator().snapshot().jira.serverIdentity
    : "";
  const selected = validateAndSaveDatabaseSelection({
    appRoot: getAppRuntimeDir(),
    envPath: resolveCurrentEnvPath(),
    selectedPath,
    currentJiraIdentity: jiraIdentity,
    check: checkDatabaseCompatibility
  });
  const validation = selected.validation;
  if (!selected.saved) {
    return { canceled: false, saved: false, validation, state: getRuntimeCoordinator().snapshot() };
  }
  const state = await getRuntimeCoordinator().retryDatabase();
  return { canceled: false, saved: true, validation, state };
});

ipcMain.handle("database:create-new", async (_event, payload?: { filePath?: string }) => {
  let targetPath = payload?.filePath ?? "";
  if (!targetPath) {
    const result = await dialog.showSaveDialog({
      title: "Create Source Archive Database / 建立來源封存資料庫",
      defaultPath: path.join(getDatabaseDir(), "jira-activity-analyzer.sqlite"),
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "sqlite3", "db"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true, saved: false, state: getRuntimeCoordinator().snapshot() };
    targetPath = result.filePath;
  }
  const jira = getRuntimeCoordinator().snapshot().jira;
  const connectionLabel = loadConnectionState().activeConnection.name;
  const smokeRuntimeConfig = isUiSmoke ? loadRuntimeConfig(resolveCurrentEnvPath()) : null;
  const effectiveBaseUrl = jira.baseUrlNormalized || smokeRuntimeConfig?.jiraBaseUrl || "";
  const effectiveServerIdentity = jira.serverIdentity || (isUiSmoke && effectiveBaseUrl
    ? `ui-smoke:${crypto.createHash("sha256").update(effectiveBaseUrl).digest("hex")}`
    : "");
  const binding = (jira.status === "CONNECTED" || isUiSmoke) && effectiveServerIdentity && effectiveBaseUrl
    ? {
        sourceSystem: "jira" as const,
        serverIdentity: effectiveServerIdentity,
        baseUrlNormalized: effectiveBaseUrl,
        serverTitle: jira.serverTitle,
        serverTitleStatus: jira.serverTitleStatus,
        connectionLabel
      }
    : undefined;
  try {
    const created = createSourceArchiveDatabase({
      targetPath,
      appVersion: __MAIN_APP_VERSION__,
      binding
    });
    atomicPatchEnv(resolveCurrentEnvPath(), {
      ENV_FORMAT_VERSION: "2",
      LOCAL_DATABASE_PATH: databasePathForEnv(getAppRuntimeDir(), created.databasePath)
    });
    const state = await getRuntimeCoordinator().retryDatabase();
    return { canceled: false, saved: true, created, state };
  } catch (error) {
    return {
      canceled: false,
      saved: false,
      error: error instanceof Error ? error.message : "Database creation failed.",
      state: getRuntimeCoordinator().snapshot()
    };
  }
});

ipcMain.handle("connection:test", async (_event, connection: AppConnection) => {
  const requestedVersion = connection.apiVersion ?? "v2";
  const prefixes = requestedVersion === "auto" ? ["/rest/api/3", "/rest/api/2"] : [requestedVersion === "v3" ? "/rest/api/3" : "/rest/api/2"];
  const logs = [
    "[INFO] Test connection started",
    `[INFO] Base URL: ${connection.baseUrl}`,
    `[INFO] Auth Type: ${connection.authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"}`,
    `[INFO] API Version: ${connection.apiVersion}`,
    "[INFO] Authorization: [masked]",
    `[INFO] Credential status: ${connection.apiToken ? "present (masked)" : "missing"}`,
    `[DEBUG] GET ${prefixes[0]}/myself`
  ];
  const client = createJiraClient({
    baseUrl: connection.baseUrl,
    email: connection.email || connection.username,
    apiToken: connection.apiToken ?? "",
    authType: connection.authType
  });
  let myself = await client.get(`${prefixes[0]}/myself`);
  if (!myself.ok && prefixes.length > 1) {
    logs.push(`[DEBUG] Response status: ${myself.status}`);
    logs.push("[WARN] v3 connection test failed; trying v2");
    logs.push(`[DEBUG] GET ${prefixes[1]}/myself`);
    myself = await client.get(`${prefixes[1]}/myself`);
  }
  logs.push(`[DEBUG] Response status: ${myself.status}`);
  const now = formatLocalDateTime();
  if (!myself.ok) {
    logs.push(`[ERROR] Connection test failed: ${myself.message ?? myself.status}`);
    logs.push("[INFO] No database write performed");
    const runtime = await getRuntimeCoordinator().retryJira();
    return {
      runtime,
      state: hydratedConnectionState(runtime, "manual"),
      connection: { ...connection, status: "failed", lastTestedAt: now, tokenMasked: maskToken(connection.apiToken ?? "") },
      logs,
      result: myself
    };
  }
  const user = myself.json && typeof myself.json === "object" ? myself.json as Record<string, unknown> : {};
  logs.push("[INFO] Authenticated user resolved");
  const projectPrefix = prefixes.length > 1 && myself.ok && prefixes[0].includes("/3") ? "/rest/api/2" : prefixes.at(-1) ?? "/rest/api/2";
  logs.push(`[DEBUG] GET ${projectPrefix}/project`);
  const projects = await client.get(`${projectPrefix}/project`);
  const accessibleProjectsCount = projects.ok && Array.isArray(projects.json) ? projects.json.length : 0;
  if (!projects.ok) logs.push("[WARN] Project list endpoint failed; connection auth still succeeded");
  logs.push("[INFO] Connection test successful");
  logs.push("[INFO] No database write performed");
  const runtime = await getRuntimeCoordinator().retryJira();
  return {
    runtime,
    state: hydratedConnectionState(runtime, "manual"),
    connection: {
      ...connection,
      status: "connected",
      lastTestedAt: now,
      authenticatedUser: String(user.displayName ?? user.name ?? user.emailAddress ?? "Authenticated"),
      accessibleProjectsCount,
      tokenMasked: maskToken(connection.apiToken ?? "")
    },
    logs,
    result: myself
  };
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).join(", ") || "-";
  const record = asRecord(value);
  return String(record.displayName ?? record.name ?? record.key ?? record.value ?? JSON.stringify(value).slice(0, 160));
}

function formatDateTime(input: unknown): string {
  const value = text(input);
  if (value === "-") return "-";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "-";
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatJiraDate(input: unknown): string {
  const value = text(input);
  if (value === "-") return "-";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateSortValue(input: unknown): number {
  const timestamp = Date.parse(text(input));
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function fileType(mimeType: unknown, filename: unknown): string {
  const mime = text(mimeType).toLowerCase();
  const file = text(filename).toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(file)) return "image";
  if (/log|text\/plain/.test(mime) || /\.(log|txt)$/.test(file)) return "log";
  if (/spreadsheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/.test(file)) return "excel";
  if (/zip|compressed|archive/.test(mime) || /\.(zip|7z|rar|gz|tar)$/.test(file)) return "zip";
  return "other";
}

function candidateFromIssue(issue: Record<string, unknown>, selectedUsers: string[]) {
  const fields = asRecord(issue.fields);
  const project = asRecord(fields.project);
  const matched: string[] = [];
  const assignee = text(fields.assignee);
  const reporter = text(fields.reporter);
  const creator = text(fields.creator);
  const normalizedUsers = selectedUsers.map((user) => user.toLowerCase());
  const fieldMatches = (value: string) => normalizedUsers.filter((user) => value.toLowerCase().includes(user));
  for (const user of fieldMatches(assignee)) matched.push(`Assignee matched ${user}`);
  for (const user of fieldMatches(reporter)) matched.push(`Reporter matched ${user}`);
  for (const user of fieldMatches(creator)) matched.push(`Creator matched ${user}`);
  return {
    id: text(issue.id),
    key: text(issue.key),
    summary: text(fields.summary),
    status: text(asRecord(fields.status).name),
    assignee,
    reporter,
    creator,
    updated: formatJiraDate(fields.updated),
    created: formatJiraDate(fields.created),
    issueType: text(asRecord(fields.issuetype).name),
    priority: text(asRecord(fields.priority).name),
    project: `${text(project.key)} / ${text(project.name)}`,
    matchedReason: [...matched.slice(0, 3), "Matched by base JQL", "Exact updatedBy actor requires Stage 2 Full Fetch"].join("; ")
  };
}

function jiraSearchErrorDetails(response: { json: unknown | null; bodyPreview?: string; status: number | "-"; message?: string; errorType?: string }) {
  const json = asRecord(response.json);
  const messages = Array.isArray(json.errorMessages) ? json.errorMessages.map(text).filter((item) => item !== "-") : [];
  const errors = asRecord(json.errors);
  const fieldErrors = Object.entries(errors).map(([key, value]) => `${key}: ${text(value)}`);
  const details = [...messages, ...fieldErrors];
  if (details.length > 0) {
    return {
      message: `Candidate Discovery failed: HTTP ${response.status}. Jira errorMessages: ${details.join("; ")}`,
      logLines: [`[ERROR] Candidate Discovery failed: HTTP ${response.status}`, `[ERROR] Jira errorMessages: ${details.join("; ")}`],
      body: sanitizeRawJson(response.json)
    };
  }
  const bodyPreview = response.bodyPreview ? response.bodyPreview.slice(0, 1000) : "";
  return {
    message: `Candidate Discovery failed: HTTP ${response.status}. ${bodyPreview ? `Jira response body: ${bodyPreview}` : response.message ?? response.errorType ?? "Search request failed."}`,
    logLines: [
      `[ERROR] Candidate Discovery failed: HTTP ${response.status}`,
      bodyPreview ? `[ERROR] Jira response body: ${bodyPreview}` : `[ERROR] ${response.message ?? response.errorType ?? "Search request failed."}`
    ],
    body: response.json ? sanitizeRawJson(response.json) : bodyPreview
  };
}

ipcMain.handle("user-analysis:discover-candidates", async (_event, payload: { connection: AppConnection; jql: string; safetyLimit: number; selectedUsers?: string[] }) => {
  const connection = payload.connection;
  const safetyLimit = Math.min(Math.max(Number(payload.safetyLimit) || 1000, 1), 1000);
  const apiPrefix = connection.apiVersion === "v3" ? "/rest/api/3" : "/rest/api/2";
  const fields = "key,summary,status,assignee,reporter,creator,updated,created,issuetype,priority,project";
  const maxResults = 100;
  const selectedUsers = Array.isArray(payload.selectedUsers) ? payload.selectedUsers.map(String) : [];
  let startAt = 0;
  let total = 0;
  const issues: Record<string, unknown>[] = [];
  const pages: Array<{ startAt: number; count: number; total: number; status: string | number }> = [];
  const logs = [
    "[INFO] Candidate Discovery started",
    "[INFO] Data Source Mode: Live Jira API",
    "[INFO] Connection Source: Current .env Jira Connection",
    `[INFO] API Version: ${connection.apiVersion === "v3" ? "Jira Cloud v3" : "Jira Server/Data Center v2"}`,
    `[INFO] Auth Type: ${connection.authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"}`,
    "[INFO] Authorization: [masked]",
    "[INFO] Search API method: GET only",
    "[INFO] JQL Strategy: base search without updatedBy",
    "[INFO] updatedBy status: disabled"
  ];
  const warnings: string[] = [];

  const client = createJiraClient({
    baseUrl: connection.baseUrl,
    email: connection.email || connection.username,
    apiToken: connection.apiToken ?? "",
    authType: connection.authType
  });

  while (issues.length < safetyLimit) {
    const pathName = `${apiPrefix}/search?jql=${encodeURIComponent(payload.jql)}&fields=${encodeURIComponent(fields)}&startAt=${startAt}&maxResults=${maxResults}`;
    logs.push(`[DEBUG] GET ${apiPrefix}/search?startAt=${startAt}&maxResults=${maxResults}`);
    const response = await client.get(pathName);
    if (!response.ok) {
      const details = jiraSearchErrorDetails(response);
      logs.push(...details.logLines);
      logs.push("[INFO] No database write performed");
      return {
        ok: false,
        message: details.message,
        status: response.status,
        contentType: response.contentType,
        errorType: response.errorType,
        logs,
        warnings,
        jqlStrategy: "base search without updatedBy",
        updatedByStatus: "disabled",
        candidates: [],
        metadata: {
          method: "GET",
          endpoint: `${apiPrefix}/search`,
          startAt,
          maxResults,
          total,
          pages,
          rawResponseSanitized: details.body
        }
      };
    }

    const json = asRecord(response.json);
    const pageIssues = Array.isArray(json.issues) ? json.issues as Record<string, unknown>[] : [];
    total = Number(json.total ?? pageIssues.length) || pageIssues.length;
    pages.push({ startAt, count: pageIssues.length, total, status: response.status });
    logs.push(`[INFO] Candidate page loaded: startAt=${startAt}, count=${pageIssues.length}, total=${total}`);
    issues.push(...pageIssues.slice(0, Math.max(0, safetyLimit - issues.length)));

    if (total > safetyLimit && !warnings.includes("Candidate result exceeded safety limit 1000. Please narrow users or date range.")) {
      warnings.push("Candidate result exceeded safety limit 1000. Please narrow users or date range.");
      logs.push(`[WARN] Candidate total exceeded safety limit: total=${total}, limit=${safetyLimit}`);
    }

    startAt += pageIssues.length;
    if (pageIssues.length === 0 || startAt >= total || issues.length >= safetyLimit) break;
  }

  const candidates = issues
    .map((issue) => candidateFromIssue(issue, selectedUsers))
    .sort((a, b) => {
      const updated = Date.parse(b.updated) - Date.parse(a.updated);
      if (updated !== 0) return updated;
      const created = Date.parse(b.created) - Date.parse(a.created);
      if (created !== 0) return created;
      return b.key.localeCompare(a.key);
    });

  logs.push(`[INFO] Candidate Discovery completed: candidates=${candidates.length}`);
  logs.push("[INFO] No database write performed");

  return {
    ok: true,
    candidates,
    warnings,
    logs,
    jqlStrategy: "base search without updatedBy",
    updatedByStatus: "disabled",
    metadata: {
      method: "GET",
      endpoint: `${apiPrefix}/search`,
      fields,
      maxResults,
      candidateSafetyLimit: safetyLimit,
      total,
      returned: candidates.length,
      pages,
      rawResponseSanitized: {
        total,
        returned: candidates.length,
        pages
      }
    }
  };
});

type PrecisionProbeResult = {
  method: string;
  status: "success" | "unsupported" | "failed" | "partial";
  httpStatus: string;
  supported: "yes" | "no" | "unknown";
  resultCount: number;
  sampleIssueKeys: string[];
  candidateSource: string;
  error: string;
  recommendation: string;
  contentType?: string;
  jql?: string;
  rawSummary?: string;
};

function precisionError(response: { status: number | "-"; message?: string; errorType?: string; bodyPreview?: string }) {
  return String(response.message || response.errorType || response.bodyPreview || `HTTP ${response.status}`).slice(0, 300);
}

function scopedJql(jql: string, projectScope: string) {
  const projects = projectScope.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  if (projects.length === 0) return jql;
  const orderIndex = jql.toUpperCase().lastIndexOf("ORDER BY");
  const body = orderIndex >= 0 ? jql.slice(0, orderIndex).trim() : jql.trim();
  const order = orderIndex >= 0 ? jql.slice(orderIndex).trim() : "";
  const projectClause = projects.length === 1
    ? `project = "${projects[0].replace(/"/g, "\\\"")}"`
    : `project in (${projects.map((item) => `"${item.replace(/"/g, "\\\"")}"`).join(", ")})`;
  return `${projectClause} AND (${body})${order ? ` ${order}` : ""}`;
}

function issueKeysFrom(value: unknown) {
  const matches = JSON.stringify(value ?? "").match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [];
  return Array.from(new Set(matches));
}

type ActivityStreamEntry = {
  runId: string;
  issueKey: string;
  activityTitle: string;
  activityAuthor: string;
  activityAuthorEmail: string;
  activityTime: string;
  activityType: "link" | "comment" | "attachment" | "status_change" | "resolution_change" | "assignee_change" | "field_change" | "description_update" | "page" | "unknown";
  activityTypeClassifier: ActivityTypeClassifierResult;
  source: "activity_stream" | "manual_url";
  variant: string;
  extractedIssueKeysPerEntry: string[];
  mentionedIssueKeys: string[];
  relatedIssueKeys: string[];
  issueKeyResolutionSource: string;
  issueKeyAmbiguous: boolean;
  rawTitle: string;
  rawSummary: string;
  rawContent: string;
  activityApplication: "Jira" | "Confluence" | "Other";
  objectType: string;
  target: string;
  links: string[];
  entryIndex: number;
  entryFingerprint: string;
};

type ActivityTypeClassifierResult = {
  matchedRule: string;
  matchedText: string;
  priority: number;
  sourceField: "title" | "rawTitle" | "application" | "objectType" | "rawContent" | "previousType" | "";
  previousType: string;
  finalType: ActivityStreamEntry["activityType"];
};

type ActivityStreamQueryMode = "auto" | "username" | "escaped_username" | "email" | "custom";
type ActivityStreamDiagnosis = "parsed" | "parsed_no_issue_keys" | "parsed_confluence_only" | "no_entries" | "parser_failed" | "html_login" | "http_error" | "blocked" | "unknown";
type ActivityStreamVariant = { variant: "username" | "escaped_username" | "email" | "custom" | "manual_url"; user: string };
type ActivityStreamDateQueryMode = "none" | "startDate_endDate" | "update_date_after_before" | "both";
type ActivityStreamDateTestMode = Exclude<ActivityStreamDateQueryMode, "both">;
type ActivityStreamDateEffectiveness = true | false | "likely_true" | "unknown";
type ActivityStreamChunkingMode = "off" | "auto" | "monthly" | "weekly" | "custom_days";

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function xmlTag(block: string, tag: string) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  return match ? decodeXmlText(match[1]) : "";
}

function legacyActivityType(value: string) {
  const lower = value.toLowerCase();
  if (/created a link from|linked to|issue-link|建立.*連結/.test(lower)) return "link";
  if (/attached (?:one|\d+|a)?\s*files?|attachment|附件/.test(lower)) return "attachment";
  if (/changed (?:the )?status|status (?:changed|to)|transition|狀態/.test(lower)) return "status";
  if (/changed (?:the )?assignee|assignee to|指派/.test(lower)) return "assignee_change";
  if (/updated (?:the )?description|description (?:updated|changed)|更新.*描述/.test(lower)) return "description_update";
  if (/commented on|\bcomment\b|留言|評論/.test(lower)) return "comment";
  if (/category[^>]*page|application[^>]*confluence|\bconfluence\b|\bpage\b|頁面/.test(lower)) return "page";
  if (/(?:updated|changed) (?:the )?\w+|field (?:updated|changed)|欄位.*(?:更新|變更|修改)/.test(lower)) return "field_change";
  return "unknown";
}

function normalizedPreviousActivityType(value: string): ActivityStreamEntry["activityType"] | "" {
  const normalized = value === "status" ? "status_change" : value;
  const validTypes: ActivityStreamEntry["activityType"][] = ["link", "comment", "attachment", "status_change", "resolution_change", "assignee_change", "field_change", "description_update", "page"];
  return validTypes.includes(normalized as ActivityStreamEntry["activityType"])
    ? normalized as ActivityStreamEntry["activityType"]
    : "";
}

function classifyActivityType(values: { title?: string; rawTitle?: string; application?: string; objectType?: string; combined?: string; previousType?: string }): ActivityTypeClassifierResult {
  const title = sanitizeResponseText(values.title || "");
  const rawTitle = sanitizeResponseText(values.rawTitle || "");
  const sourceField: ActivityTypeClassifierResult["sourceField"] = title ? "title" : rawTitle ? "rawTitle" : "";
  const source = (title || rawTitle).toLowerCase().replace(/\s+/g, " ").trim();
  const application = String(values.application || "").toLowerCase();
  const objectType = String(values.objectType || "").toLowerCase();
  const combined = String(values.combined || source);
  const previousType = normalizedPreviousActivityType(values.previousType ?? legacyActivityType(combined));
  const match = (matchedRule: string, pattern: RegExp, finalType: ActivityStreamEntry["activityType"], priority: number, condition = true): ActivityTypeClassifierResult | null => {
    if (!condition) return null;
    const found = source.match(pattern);
    return found ? { matchedRule, matchedText: found[0], priority, sourceField, previousType, finalType } : null;
  };
  return match("commented_on", /commented on/, "comment", 100)
    || match("comment_action", /added a comment|updated comment|deleted comment/, "comment", 100)
    || match("attachment_action", /attached(?: file| files)?|uploaded|added attachment/, "attachment", 90)
    || match("link_action", /linked|created (?:a )?link|added (?:a )?link|related to/, "link", 80)
    || match("confluence_page_action", /created page|added page|edited page|updated page|page edited/, "page", 70, /confluence/.test(application))
    || (/confluence/.test(application) && (
      /\bpage\b/.test(objectType)
      || previousType === "page"
      || /category[^>]*(?:term|title)=["']?page\b/i.test(combined)
      || /<title>\s*page\s*<\/title>/i.test(combined)
    ) ? {
      matchedRule: "confluence_page_object",
      matchedText: /\bpage\b/.test(objectType) ? objectType : previousType === "page" ? "page" : "Confluence page metadata",
      priority: 70,
      sourceField: /\bpage\b/.test(objectType) ? "objectType" : previousType === "page" ? "previousType" : "rawContent",
      previousType,
      finalType: "page"
    } : null)
    || match("assignee_change", /changed the assignee|updated the assignee/, "assignee_change", 60)
    || match("status_change", /changed the status|updated the status|transitioned/, "status_change", 55)
    || match("resolution_change", /changed the resolution|updated the resolution/, "resolution_change", 50)
    || match("field_change", /changed the|updated the|updated \d+ fields?|set the|cleared the/, "field_change", 40, /jira/.test(application) || /issue/.test(objectType))
    || (previousType ? { matchedRule: "preserve_previous_type", matchedText: previousType, priority: 10, sourceField: "previousType", previousType, finalType: previousType } : null)
    || { matchedRule: "fallback_unknown", matchedText: "", priority: 0, sourceField: "", previousType: "", finalType: "unknown" };
}

function activityType(value: string, application = "Jira", objectType = "issue"): ActivityStreamEntry["activityType"] {
  return classifyActivityType({ title: value, rawTitle: value, application, objectType, combined: value }).finalType;
}

function activityTypeClassifierDiagnostics(entries: ActivityStreamEntry[]) {
  const matchedRuleCounts: Record<string, number> = {};
  const finalTypeCounts: Record<string, number> = {};
  let correctedEntryCount = 0;
  let preservedEntryCount = 0;
  let inferredEntryCount = 0;
  let fallbackUnknownCount = 0;
  for (const entry of entries) {
    const diagnostic = entry.activityTypeClassifier;
    matchedRuleCounts[diagnostic.matchedRule] = (matchedRuleCounts[diagnostic.matchedRule] || 0) + 1;
    finalTypeCounts[diagnostic.finalType] = (finalTypeCounts[diagnostic.finalType] || 0) + 1;
    if (diagnostic.previousType && diagnostic.previousType !== diagnostic.finalType && diagnostic.priority >= 40) correctedEntryCount += 1;
    if (diagnostic.previousType && diagnostic.previousType === diagnostic.finalType) preservedEntryCount += 1;
    if (!diagnostic.previousType && diagnostic.finalType !== "unknown") inferredEntryCount += 1;
    if (diagnostic.matchedRule === "fallback_unknown") fallbackUnknownCount += 1;
  }
  return { enabled: true, rulesVersion: "1.1", commentPriorityHigherThanAttachment: true, totalEntries: entries.length, correctedEntryCount, preservedEntryCount, inferredEntryCount, fallbackUnknownCount, matchedRuleCounts, finalTypeCounts };
}

function activityEntry(values: { entryId?: unknown; title?: unknown; author?: unknown; authorEmail?: unknown; time?: unknown; content?: unknown; link?: unknown; raw?: unknown; application?: unknown; objectType?: unknown; target?: unknown; issueKey?: unknown; restIssueKey?: unknown; relatedIssueKeys?: unknown[] }, variant: string, runId: string, entryIndex: number): ActivityStreamEntry {
  const title = sanitizeResponseText(typeof values.title === "string" ? values.title : text(asRecord(values.title).value ?? asRecord(values.title).text ?? values.title));
  const authorRecord = asRecord(values.author);
  const author = sanitizeResponseText(typeof values.author === "string" ? values.author : text(authorRecord.name ?? authorRecord.displayName ?? authorRecord.email ?? authorRecord.username));
  const authorEmail = sanitizeResponseText(text(values.authorEmail ?? authorRecord.email));
  const time = text(values.time);
  const content = typeof values.content === "string" ? values.content : JSON.stringify(values.content ?? "");
  const link = typeof values.link === "string" ? values.link : JSON.stringify(values.link ?? "");
  const raw = typeof values.raw === "string" ? values.raw : JSON.stringify(values.raw ?? "");
  const combined = `${title} ${content} ${link} ${raw}`;
  const issueResolution = resolveActivityIssueKeys({ linkHref: link, rawHtml: raw, structuredIssueKey: values.issueKey, restIssueKey: values.restIssueKey, title, summary: content, relatedIssueKeys: values.relatedIssueKeys });
  const extractedIssueKeysPerEntry = issueResolution.allIssueKeys;
  const applicationText = sanitizeResponseText(text(values.application));
  const activityApplication = /confluence/i.test(`${applicationText} ${raw}`) ? "Confluence" : extractedIssueKeysPerEntry.length > 0 || /jira/i.test(applicationText) ? "Jira" : "Other";
  const objectType = sanitizeResponseText(text(values.objectType)).slice(0, 300);
  const activityTypeClassifier = classifyActivityType({ title, rawTitle: title, application: activityApplication, objectType, combined });
  const entryFingerprint = createEntryFingerprint({ entryId: sanitizeResponseText(text(values.entryId)) === "-" ? "" : sanitizeResponseText(text(values.entryId)), source: "activity_stream", activityTime: time === "-" ? "" : time, activityAuthorEmail: authorEmail === "-" ? "" : authorEmail, activityTitle: title === "-" ? "" : title, issueKey: issueResolution.issueKey, firstLinkHref: sanitizeResponseText(link) === "-" ? "" : sanitizeResponseText(link) });
  return {
    runId,
    issueKey: issueResolution.issueKey,
    activityTitle: title === "-" ? "" : title.slice(0, 1000),
    activityAuthor: author === "-" ? "" : author.slice(0, 300),
    activityAuthorEmail: authorEmail === "-" ? "" : authorEmail.slice(0, 300),
    activityTime: time === "-" ? "" : time,
    activityType: activityTypeClassifier.finalType,
    activityTypeClassifier,
    source: variant === "manual_url" ? "manual_url" : "activity_stream",
    variant,
    extractedIssueKeysPerEntry,
    mentionedIssueKeys: issueResolution.mentionedIssueKeys,
    relatedIssueKeys: issueResolution.relatedIssueKeys,
    issueKeyResolutionSource: issueResolution.source,
    issueKeyAmbiguous: issueResolution.ambiguous,
    rawTitle: title === "-" ? "" : title.slice(0, 2000),
    rawSummary: sanitizeResponseText(content).slice(0, 2000),
    rawContent: sanitizeResponseText(`${content} ${raw}`).slice(0, 4000),
    activityApplication,
    objectType,
    target: sanitizeResponseText(text(values.target)).slice(0, 500),
    links: [sanitizeResponseText(link)].filter((item) => item && item !== "-").slice(0, 10),
    entryIndex,
    entryFingerprint
  };
}

function sanitizedFirstEntry(entry: Record<string, unknown>) {
  const authorRecord = asRecord(entry.author);
  const rawText = JSON.stringify(entry);
  return {
    rawTitleText: sanitizeResponseText(text(entry.title)).slice(0, 500),
    rawAuthorText: sanitizeResponseText(text(authorRecord.name ?? authorRecord.email ?? authorRecord.displayName ?? entry.author)).slice(0, 500),
    rawUpdatedText: sanitizeResponseText(text(entry.updated ?? entry.timestamp ?? entry.date)).slice(0, 500),
    rawPublishedText: sanitizeResponseText(text(entry.published)).slice(0, 500),
    rawLinkHref: sanitizeResponseText(text(entry.link ?? entry.url)).slice(0, 500),
    rawSummaryText: sanitizeResponseText(text(entry.summary ?? entry.content ?? entry.description)).slice(0, 500),
    extractedIssueKeys: issueKeysFrom(rawText).sort()
  };
}

function parseActivityJson(value: unknown, variant: string, runId: string) {
  const root = asRecord(value);
  const feed = asRecord(root.feed);
  const candidateCollections = [root.entries, root.entry, root.activities, feed.entries, feed.entry];
  const records = candidateCollections.flatMap((collection) => Array.isArray(collection) ? collection : collection ? [collection] : []).filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  return {
    rawEntryCount: records.length,
    atomEntryCount: 0,
    firstEntriesSanitized: records.slice(0, 3).map(sanitizedFirstEntry),
    entries: records.map((entry, entryIndex) => activityEntry({
    entryId: entry.id,
    title: entry.title,
    author: entry.author,
    authorEmail: asRecord(entry.author).email,
    time: entry.updated ?? entry.published ?? entry.timestamp ?? entry.date,
    content: entry.summary ?? entry.content ?? entry.description,
    link: entry.link ?? entry.url,
    raw: entry,
    application: entry.application,
    objectType: entry.objectType ?? entry.type,
    target: entry.target,
    issueKey: entry.issueKey ?? asRecord(entry.issue).key ?? asRecord(entry.object).key,
    restIssueKey: entry.key,
    relatedIssueKeys: Array.isArray(entry.relatedIssueKeys) ? entry.relatedIssueKeys : []
  }, variant, runId, entryIndex))
  };
}

function parseActivityAtom(xml: string, variant: string, runId: string) {
  const blocks = Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)).map((match) => match[1]);
  const firstEntriesSanitized = blocks.slice(0, 3).map((block) => ({
    rawTitleText: xmlTag(block, "title").slice(0, 500),
    rawAuthorText: xmlTag(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(block)?.[1] ?? "", "name").slice(0, 500) || xmlTag(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(block)?.[1] ?? "", "email").slice(0, 500),
    rawUpdatedText: xmlTag(block, "updated").slice(0, 500),
    rawPublishedText: xmlTag(block, "published").slice(0, 500),
    rawLinkHref: sanitizeResponseText(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] ?? "").slice(0, 500),
    rawSummaryText: (xmlTag(block, "summary") || xmlTag(block, "content")).slice(0, 500),
    extractedIssueKeys: issueKeysFrom(block).sort()
  }));
  return { rawEntryCount: blocks.length, atomEntryCount: blocks.length, firstEntriesSanitized, entries: blocks.map((block, entryIndex) => {
    const authorBlock = /<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(block)?.[1] ?? "";
    const title = xmlTag(block, "title");
    const content = xmlTag(block, "summary") || xmlTag(block, "content");
    const link = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] ?? "";
    const application = /(?:activity:)?application(?:\s[^>]*)?>([\s\S]*?)<\/(?:activity:)?application>/i.exec(block)?.[1] ?? "";
    const objectType = /<(?:activity:)?object-type(?:\s[^>]*)?>([\s\S]*?)<\/(?:activity:)?object-type>/i.exec(block)?.[1] ?? "";
    const target = /<(?:activity:)?target(?:\s[^>]*)?>([\s\S]*?)<\/(?:activity:)?target>/i.exec(block)?.[1] ?? "";
    return activityEntry({ entryId: xmlTag(block, "id"), title, author: xmlTag(authorBlock, "name") || xmlTag(authorBlock, "email") || decodeXmlText(authorBlock), authorEmail: xmlTag(authorBlock, "email"), time: xmlTag(block, "updated") || xmlTag(block, "published") || xmlTag(block, "date"), content, link, raw: block, application, objectType: decodeXmlText(objectType), target: decodeXmlText(target) }, variant, runId, entryIndex);
  }) };
}

function activityStreamResult(response: JiraHttpResult, requestUrlSanitized: string, user: string, variant: ActivityStreamVariant["variant"] = "custom", runId = "") {
  const contentType = response.contentType || "";
  const isHtml = /text\/html/i.test(contentType) || /html|login page|SSO/i.test(response.message ?? "");
  const bodyText = response.bodyTextSanitized ?? "";
  const parsedFeed = response.json
    ? parseActivityJson(response.json, variant, runId)
    : /atom|xml/i.test(contentType) || /^\s*<feed\b/i.test(bodyText) ? parseActivityAtom(bodyText, variant, runId) : { rawEntryCount: 0, atomEntryCount: 0, firstEntriesSanitized: [], entries: [] as ActivityStreamEntry[] };
  const parsedIssueKeys = Array.from(new Set(parsedFeed.entries.map((entry) => entry.issueKey).filter(Boolean))).sort();
  const endpointUnavailable = response.status === 403 || response.status === 404;
  const blocked = /blocked|read.only|guard/i.test(`${response.errorType ?? ""} ${response.message ?? ""}`);
  const parsedEntries = parsedFeed.entries.filter((entry) => Boolean(entry.activityTitle || entry.activityAuthor || entry.activityTime || entry.activityType !== "unknown"));
  const skippedEntries = parsedFeed.entries.map((entry, entryIndex) => ({ entry, entryIndex })).filter(({ entry }) => !parsedEntries.includes(entry));
  const entriesWithIssueKey = parsedEntries.filter((entry) => Boolean(entry.issueKey));
  const entriesWithoutIssueKey = parsedEntries.filter((entry) => !entry.issueKey);
  const confluenceOnlyEntries = entriesWithoutIssueKey.filter((entry) => entry.activityApplication === "Confluence");
  const parsedRatio = parsedFeed.atomEntryCount > 0 ? parsedEntries.length / parsedFeed.atomEntryCount : 1;
  const parserAnomaly = parsedFeed.atomEntryCount > 0 && parsedRatio < 0.5 || parsedFeed.atomEntryCount >= 20 && parsedEntries.length <= 1;
  const parserDiagnostics = {
    atomEntryCount: parsedFeed.atomEntryCount,
    parsedEntryCount: parsedEntries.length,
    skippedEntryCount: skippedEntries.length,
    entriesWithoutIssueKeyCount: entriesWithoutIssueKey.length,
    entriesWithIssueKeyCount: entriesWithIssueKey.length,
    confluenceOnlyEntryCount: confluenceOnlyEntries.length,
    entriesWithoutAuthorCount: parsedFeed.entries.filter((entry) => !entry.activityAuthor && !entry.activityAuthorEmail).length,
    entriesWithoutTimeCount: parsedFeed.entries.filter((entry) => !entry.activityTime).length,
    entriesWithoutTitleCount: parsedFeed.entries.filter((entry) => !entry.activityTitle).length,
    entriesWithMultipleIssueKeysCount: parsedFeed.entries.filter((entry) => entry.extractedIssueKeysPerEntry.length > 1).length,
    entriesWithMentionedIssueKeysCount: parsedFeed.entries.filter((entry) => entry.mentionedIssueKeys.length > 0).length,
    ambiguousIssueKeyCount: parsedFeed.entries.filter((entry) => entry.issueKeyAmbiguous).length,
    parserErrorCount: 0,
    parserErrorsSanitized: [] as string[],
    skippedEntriesSanitized: skippedEntries.slice(0, 5).map(({ entry, entryIndex }) => ({ entryIndex, reason: "missing_activity_fields", rawTitleText: entry.activityTitle.slice(0, 500), rawUpdatedText: entry.activityTime.slice(0, 500), rawAuthorText: (entry.activityAuthor || entry.activityAuthorEmail).slice(0, 500) })),
    parserAnomaly,
    parserAnomalyReason: parserAnomaly ? "Parsed entry ratio below 50%" : ""
  };
  const diagnosis: ActivityStreamDiagnosis = blocked ? "blocked" : isHtml ? "html_login" : !response.ok ? "http_error" : parsedEntries.length > 0 && entriesWithIssueKey.length > 0 ? "parsed" : parsedEntries.length > 0 && confluenceOnlyEntries.length === parsedEntries.length ? "parsed_confluence_only" : parsedEntries.length > 0 ? "parsed_no_issue_keys" : parsedFeed.rawEntryCount > 0 ? "parser_failed" : "no_entries";
  const status = diagnosis.startsWith("parsed") || diagnosis === "no_entries" ? "success" : endpointUnavailable || blocked ? "unsupported" : "failed";
  const activityEntryStats = { totalAtomEntries: parsedFeed.atomEntryCount, parsedActivityEntryCount: parsedEntries.length, parsedIssueActivityCount: entriesWithIssueKey.length, entriesWithIssueKeyCount: entriesWithIssueKey.length, entriesWithoutIssueKeyCount: entriesWithoutIssueKey.length, confluenceOnlyEntryCount: confluenceOnlyEntries.length, nonJiraEntryCount: entriesWithoutIssueKey.length, jiraIssueEntryCount: entriesWithIssueKey.length, uniqueIssueKeyCount: parsedIssueKeys.length };
  const classifierDiagnostics = activityTypeClassifierDiagnostics(parsedFeed.entries);
  return {
    runId,
    variant,
    reachable: !blocked && response.status !== "-",
    parsed: diagnosis.startsWith("parsed"),
    diagnosis,
    status,
    supported: response.ok ? "yes" : endpointUnavailable || blocked ? "no" : "unknown",
    httpStatus: String(response.status),
    contentType,
    requestUrlSanitized,
    activityStreamUser: user,
    activityStreamDateSemantics: "unknown" as const,
    atomEntryCount: parsedFeed.atomEntryCount,
    parsedActivityCount: parsedEntries.length,
    parsedIssueKeys,
    entriesSanitized: parsedFeed.entries,
    firstEntriesSanitized: parsedFeed.firstEntriesSanitized,
    error: response.ok ? (diagnosis === "parser_failed" ? "Activity Stream entries were found, but required activity fields could not be parsed." : "") : isHtml ? "Activity Stream returned HTML or a login page." : precisionError(response),
    rawSummary: response.bodyPreview ?? "",
    parserDiagnostics,
    activityTypeClassifierDiagnostics: classifierDiagnostics,
    activityEntryStats
  };
}

function escapeActivityStreamUser(user: string) {
  return user.replace(/(^|[^\\])_/g, "$1\\_");
}

function createActivityStreamRunId() {
  const now = new Date();
  const stamp = now.toISOString().split("-").join("").split(":").join("").replace("T", "").replace("Z", "").slice(0, 17);
  return `asrun-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function activityStreamVariants(connection: AppConnection, selectedUsers: string[], customUser: string, mode: ActivityStreamQueryMode): ActivityStreamVariant[] {
  const selected = selectedUsers.map((item) => item.trim()).filter(Boolean);
  const seed = customUser.trim() || selected[0] || connection.email || connection.username || "";
  const username = seed.includes("@") ? seed.split("@")[0] : seed;
  const escapedUsername = escapeActivityStreamUser(username);
  const knownEmail = [customUser, ...selected, connection.email, connection.username].find((item) => String(item || "").includes("@")) || "";
  const email = seed.includes("@") ? seed : knownEmail ? `${username}@${String(knownEmail).split("@")[1]}` : "";
  const candidates: ActivityStreamVariant[] = mode === "custom"
    ? [{ variant: "custom", user: customUser.trim() }]
    : mode === "username" ? [{ variant: "username", user: username }]
      : mode === "escaped_username" ? [{ variant: "escaped_username", user: escapedUsername }]
      : mode === "email" ? [{ variant: "email", user: email }]
        : seed.includes("@") ? [{ variant: "email", user: email }, { variant: "username", user: username }, { variant: "escaped_username", user: escapedUsername }]
          : [{ variant: "username", user: username }, { variant: "escaped_username", user: escapedUsername }, { variant: "email", user: email }];
  const seen = new Set<string>();
  return candidates.filter((candidate) => candidate.user && !seen.has(candidate.user.toLowerCase()) && seen.add(candidate.user.toLowerCase()));
}

function aggregateActivityStream(variantResults: ReturnType<typeof activityStreamResult>[], fallbackUser: string) {
  const diagnosisRank = (result: ReturnType<typeof activityStreamResult>) => result.diagnosis === "parsed" ? 4 : result.diagnosis === "parsed_confluence_only" || result.diagnosis === "parsed_no_issue_keys" ? 3 : result.diagnosis === "no_entries" ? 2 : 1;
  const variantRank = (variant: string) => variant === "escaped_username" ? 3 : variant === "username" ? 2 : variant === "email" ? 1 : 0;
  const ranked = [...variantResults].sort((a, b) => diagnosisRank(b) - diagnosisRank(a) || b.parsedActivityCount - a.parsedActivityCount || b.atomEntryCount - a.atomEntryCount || variantRank(b.variant) - variantRank(a.variant));
  const allVariantsNoEntries = variantResults.length > 0 && variantResults.every((result) => result.diagnosis === "no_entries");
  const best = allVariantsNoEntries ? undefined : ranked[0];
  const activityStreamIssueKeys = Array.from(new Set(variantResults.flatMap((result) => result.parsedIssueKeys))).sort();
  const parsed = variantResults.some((result) => result.parsed);
  const reachable = variantResults.some((result) => result.reachable);
  const supported = variantResults.some((result) => result.supported === "yes") ? "yes" : variantResults.every((result) => result.supported === "no") ? "no" : "unknown";
  const diagnosis: ActivityStreamDiagnosis = allVariantsNoEntries ? "no_entries" : best?.diagnosis ?? (variantResults.some((result) => result.diagnosis === "no_entries") ? "no_entries" : "unknown");
  const overallStatus = parsed ? "success" : diagnosis === "no_entries" ? "no_entries" : reachable && supported === "yes" ? "partial" : "failed";
  const entriesSanitized = variantResults.flatMap((result) => result.entriesSanitized);
  return {
    runId: best?.runId ?? variantResults[0]?.runId ?? "",
    status: parsed || diagnosis === "no_entries" ? "success" : supported === "no" ? "unsupported" : "failed",
    overallStatus,
    reachable,
    supported,
    parsed,
    diagnosis,
    bestVariant: best?.variant ?? "",
    bestVariantReason: allVariantsNoEntries ? "all_variants_no_entries" : best ? "ranked_by_parse_quality" : "no_variant_available",
    bestActivityStreamUser: best?.activityStreamUser ?? fallbackUser,
    bestParsedIssueKeys: best?.parsedIssueKeys ?? [],
    httpStatus: best?.httpStatus ?? "-",
    contentType: best?.contentType ?? "",
    requestUrlSanitized: best?.requestUrlSanitized ?? "",
    activityStreamUser: fallbackUser,
    activityStreamDateSemantics: "unknown" as const,
    parsedActivityCount: best?.parsedActivityCount ?? 0,
    parsedIssueKeys: activityStreamIssueKeys,
    atomEntryCount: best?.atomEntryCount ?? 0,
    variantResults,
    activityStreamIssueKeys,
    entriesSanitized,
    firstEntriesSanitized: best?.firstEntriesSanitized ?? [],
    error: parsed || diagnosis === "no_entries" ? "" : best?.error || "Activity Stream could not be parsed.",
    rawSummary: best?.rawSummary ?? "",
    parserDiagnostics: best?.parserDiagnostics ?? { atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0, entriesWithIssueKeyCount: 0, confluenceOnlyEntryCount: 0, entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0, entriesWithMultipleIssueKeysCount: 0, entriesWithMentionedIssueKeysCount: 0, ambiguousIssueKeyCount: 0, parserErrorCount: 0, parserErrorsSanitized: [], skippedEntriesSanitized: [], parserAnomaly: false, parserAnomalyReason: "" },
    activityTypeClassifierDiagnostics: activityTypeClassifierDiagnostics(entriesSanitized),
    activityEntryStats: best?.activityEntryStats ?? { totalAtomEntries: 0, parsedActivityEntryCount: 0, parsedIssueActivityCount: 0, entriesWithIssueKeyCount: 0, entriesWithoutIssueKeyCount: 0, confluenceOnlyEntryCount: 0, nonJiraEntryCount: 0, jiraIssueEntryCount: 0, uniqueIssueKeyCount: 0 }
  };
}

function activityEntryDedupKey(entry: ActivityStreamEntry) {
  const normalizedTitle = entry.activityTitle.toLowerCase().replace(/\s+/g, " ").trim();
  return [entry.activityTime, entry.activityAuthorEmail.toLowerCase(), normalizedTitle, entry.links[0] ?? ""].join("|");
}

function mergeVariantChunkResults(results: ReturnType<typeof activityStreamResult>[], variant: ActivityStreamVariant) {
  if (results.length === 1) return results[0];
  const first = results[0];
  const uniqueEntries = new Map<string, ActivityStreamEntry>();
  for (const entry of results.flatMap((result) => result.entriesSanitized)) {
    const key = activityEntryDedupKey(entry);
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry);
  }
  const entries = Array.from(uniqueEntries.values());
  const issueKeys = Array.from(new Set(entries.map((entry) => entry.issueKey).filter(Boolean))).sort();
  const withIssueKey = entries.filter((entry) => Boolean(entry.issueKey));
  const withoutIssueKey = entries.filter((entry) => !entry.issueKey);
  const confluenceOnly = withoutIssueKey.filter((entry) => entry.activityApplication === "Confluence");
  const anyParsed = entries.length > 0;
  const allNoEntries = results.every((result) => result.diagnosis === "no_entries");
  const diagnosis: Exclude<ActivityStreamDiagnosis, "unknown"> = anyParsed && withIssueKey.length > 0 ? "parsed" : anyParsed && confluenceOnly.length === entries.length ? "parsed_confluence_only" : anyParsed ? "parsed_no_issue_keys" : allNoEntries ? "no_entries" : results.find((result) => result.diagnosis !== "no_entries")?.diagnosis ?? "http_error";
  const totalAtomEntries = results.reduce((sum, result) => sum + result.atomEntryCount, 0);
  const skippedEntryCount = results.reduce((sum, result) => sum + result.parserDiagnostics.skippedEntryCount, 0);
  const parserAnomaly = results.some((result) => result.parserDiagnostics.parserAnomaly);
  return {
    ...first,
    variant: variant.variant,
    activityStreamUser: variant.user,
    parsed: diagnosis.startsWith("parsed"),
    diagnosis,
    status: diagnosis.startsWith("parsed") || diagnosis === "no_entries" ? "success" as const : results.every((result) => result.status === "unsupported") ? "unsupported" as const : "failed" as const,
    reachable: results.some((result) => result.reachable),
    supported: results.some((result) => result.supported === "yes") ? "yes" as const : results.every((result) => result.supported === "no") ? "no" as const : "unknown" as const,
    httpStatus: Array.from(new Set(results.map((result) => result.httpStatus))).join(","),
    requestUrlSanitized: results.map((result) => result.requestUrlSanitized).join("\n"),
    atomEntryCount: totalAtomEntries,
    parsedActivityCount: entries.length,
    parsedIssueKeys: issueKeys,
    entriesSanitized: entries,
    firstEntriesSanitized: results.flatMap((result) => result.firstEntriesSanitized).slice(0, 3),
    error: diagnosis.startsWith("parsed") || diagnosis === "no_entries" ? "" : results.map((result) => result.error).filter(Boolean).join("; "),
    parserDiagnostics: {
      atomEntryCount: totalAtomEntries,
      parsedEntryCount: entries.length,
      skippedEntryCount,
      entriesWithoutIssueKeyCount: withoutIssueKey.length,
      entriesWithIssueKeyCount: withIssueKey.length,
      confluenceOnlyEntryCount: confluenceOnly.length,
      entriesWithoutAuthorCount: entries.filter((entry) => !entry.activityAuthor && !entry.activityAuthorEmail).length,
      entriesWithoutTimeCount: entries.filter((entry) => !entry.activityTime).length,
      entriesWithoutTitleCount: entries.filter((entry) => !entry.activityTitle).length,
      entriesWithMultipleIssueKeysCount: entries.filter((entry) => entry.extractedIssueKeysPerEntry.length > 1).length,
      entriesWithMentionedIssueKeysCount: entries.filter((entry) => entry.mentionedIssueKeys.length > 0).length,
      ambiguousIssueKeyCount: entries.filter((entry) => entry.issueKeyAmbiguous).length,
      parserErrorCount: results.reduce((sum, result) => sum + result.parserDiagnostics.parserErrorCount, 0),
      parserErrorsSanitized: results.flatMap((result) => result.parserDiagnostics.parserErrorsSanitized).slice(0, 5),
      skippedEntriesSanitized: results.flatMap((result) => result.parserDiagnostics.skippedEntriesSanitized).slice(0, 5),
      parserAnomaly,
      parserAnomalyReason: parserAnomaly ? "One or more chunks reported a parser anomaly" : ""
    },
    activityTypeClassifierDiagnostics: activityTypeClassifierDiagnostics(entries),
    activityEntryStats: { totalAtomEntries, parsedActivityEntryCount: entries.length, parsedIssueActivityCount: withIssueKey.length, entriesWithIssueKeyCount: withIssueKey.length, entriesWithoutIssueKeyCount: withoutIssueKey.length, confluenceOnlyEntryCount: confluenceOnly.length, nonJiraEntryCount: withoutIssueKey.length, jiraIssueEntryCount: withIssueKey.length, uniqueIssueKeyCount: issueKeys.length }
  };
}

function taipeiEpochMs(dateText: string) {
  return Date.parse(`${dateText}T00:00:00+08:00`);
}

function addIsoDays(dateText: string, days: number) {
  const value = new Date(`${dateText}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addIsoMonths(dateText: string, months: number) {
  const value = new Date(`${dateText}T00:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return value.toISOString().slice(0, 10);
}

function requestedDateRange(start: string, end: string) {
  const endExclusive = addIsoDays(end, 1);
  return { start, end, endInclusive: true as const, timezone: "Asia/Taipei" as const, startEpochMs: taipeiEpochMs(start), endExclusiveEpochMs: taipeiEpochMs(endExclusive), endExclusive };
}

function buildDateRangeChunking(range: ReturnType<typeof requestedDateRange>, requestedMode: ActivityStreamChunkingMode, customDays: number) {
  if (!Number.isInteger(customDays) || customDays < 1 || customDays > 31) throw new Error("Custom chunk days must be between 1 and 31.");
  const totalDays = Math.max(1, Math.round((range.endExclusiveEpochMs - range.startEpochMs) / 86400000));
  const mode: Exclude<ActivityStreamChunkingMode, "auto"> = requestedMode === "auto" ? totalDays <= 31 ? "off" : "monthly" : requestedMode;
  const enabled = mode !== "off";
  const chunks: Array<{ chunkIndex: number; chunkStart: string; chunkEndExclusive: string; startEpochMs: number; endEpochMs: number }> = [];
  let cursor = range.start;
  while (cursor < range.endExclusive) {
    const proposedEnd = mode === "monthly" ? addIsoMonths(cursor, 1) : mode === "weekly" ? addIsoDays(cursor, 7) : mode === "custom_days" ? addIsoDays(cursor, customDays) : range.endExclusive;
    const chunkEndExclusive = proposedEnd < range.endExclusive ? proposedEnd : range.endExclusive;
    chunks.push({ chunkIndex: chunks.length + 1, chunkStart: cursor, chunkEndExclusive, startEpochMs: taipeiEpochMs(cursor), endEpochMs: taipeiEpochMs(chunkEndExclusive) });
    cursor = chunkEndExclusive;
  }
  return {
    enabled,
    requestedMode,
    mode,
    chunkCount: chunks.length,
    chunkSizeDays: mode === "custom_days" ? customDays : mode === "weekly" ? 7 : null,
    requestedDateRange: { start: range.start, end: range.end, endExclusive: range.endExclusive, timezone: range.timezone },
    largeRangeWarning: totalDays > 180,
    chunks
  };
}

function chunkOverallStatus(chunks: Array<{ status?: unknown; diagnosis?: unknown }>) {
  if (chunks.length === 0) return "success" as const;
  const successful = chunks.filter((chunk) => String(chunk.status) === "success" && String(chunk.diagnosis) !== "no_entries").length;
  const noEntries = chunks.filter((chunk) => String(chunk.diagnosis) === "no_entries").length;
  const failed = chunks.length - successful - noEntries;
  if (successful === 0 && noEntries === chunks.length) return "no_entries" as const;
  if (successful === 0 && failed > 0) return "failed" as const;
  if (failed > 0 || noEntries > 0) return "partial" as const;
  return "success" as const;
}

function activityStreamDateModes(mode: ActivityStreamDateQueryMode): ActivityStreamDateTestMode[] {
  if (mode === "both") return ["startDate_endDate", "update_date_after_before"];
  return [mode];
}

function activityStreamRequestPath(maxResults: number, relativeLinks: boolean, user: string, mode: ActivityStreamDateTestMode, range: ReturnType<typeof requestedDateRange>) {
  const params = new URLSearchParams({ maxResults: String(maxResults), relativeLinks: String(relativeLinks) });
  params.append("streams", `user IS ${user}`);
  if (mode === "startDate_endDate") {
    params.set("startDate", range.start);
    params.set("endDate", range.endExclusive);
  } else if (mode === "update_date_after_before") {
    params.append("streams", `update-date AFTER ${range.startEpochMs}`);
    params.append("streams", `update-date BEFORE ${range.endExclusiveEpochMs}`);
  }
  return `/plugins/servlet/streams?${params.toString()}`;
}

function dateQueryDiagnostics(mode: ActivityStreamDateTestMode, runId: string, stream: ReturnType<typeof aggregateActivityStream>, range: ReturnType<typeof requestedDateRange>) {
  const diagnosticEntries = stream.entriesSanitized.filter((entry) => !stream.bestVariant || entry.variant === stream.bestVariant);
  const times = diagnosticEntries.map((entry) => entry.activityTime).filter(Boolean).sort();
  const inside = times.filter((time) => {
    const epoch = Date.parse(time);
    return Number.isFinite(epoch) && epoch >= range.startEpochMs && epoch < range.endExclusiveEpochMs;
  }).length;
  const outside = Math.max(stream.parsedActivityCount - inside, 0);
  let effective: ActivityStreamDateEffectiveness = "unknown";
  if (mode !== "none" && stream.atomEntryCount > 0 && stream.parsedActivityCount > 0) {
    effective = outside === 0 ? true : false;
  }
  const warnings = mode === "startDate_endDate" && outside > 0
    ? ["startDate/endDate returned entries outside requested range; server date filter may be ignored. / startDate/endDate 回傳了指定日期外的資料，server 可能忽略此日期條件。"]
    : [];
  return {
    mode,
    runId,
    requestUrlSanitized: stream.requestUrlSanitized,
    dateFilterKeyTested: mode === "update_date_after_before" ? "update-date" as const : "" as const,
    dateParameterSemantics: mode === "startDate_endDate" ? "end_exclusive" as const : "none" as const,
    atomEntryCount: stream.atomEntryCount,
    parsedActivityCount: stream.parsedActivityCount,
    entriesInsideRequestedRange: inside,
    entriesOutsideRequestedRange: outside,
    newestEntryTime: times.at(-1) ?? "",
    oldestEntryTime: times[0] ?? "",
    dateFilterEffective: effective,
    warnings
  };
}

async function runActivityStreamProbeAttempt(connection: AppConnection, selectedUsers: string[], user: string, queryMode: ActivityStreamQueryMode, startDate: string, endDate: string, maxResults: number, relativeLinks = true, requestedRunId?: string, dateQueryMode: ActivityStreamDateQueryMode = "both", maxResultsSource: "custom" | "quick" = "custom", largeMaxResultsConfirmed = false, chunkingMode: ActivityStreamChunkingMode = "auto", customChunkDays = 14, standardFlow = false, advancedOverrideUsed = false) {
  const normalizedSelectedUsers = Array.from(new Set(selectedUsers.map((item) => item.trim()).filter(Boolean)));
  if (standardFlow) {
    if (normalizedSelectedUsers.length !== 1) throw new Error("Activity Stream standard flow requires exactly one selected user.");
    user = normalizedSelectedUsers[0];
    queryMode = "escaped_username";
    dateQueryMode = "update_date_after_before";
    chunkingMode = "auto";
    maxResults = 500;
    maxResultsSource = "custom";
    largeMaxResultsConfirmed = false;
    advancedOverrideUsed = false;
  }
  const runId = requestedRunId || createActivityStreamRunId();
  const startedAt = new Date().toISOString();
  const requestMaxResults = Math.trunc(maxResults);
  if (requestMaxResults < 1 || requestMaxResults > 65535) throw new Error("maxResults must be between 1 and 65535. / maxResults 必須介於 1 到 65535。");
  const range = requestedDateRange(startDate, endDate);
  const dateRangeChunking = buildDateRangeChunking(range, chunkingMode, customChunkDays);
  const variants = activityStreamVariants(connection, selectedUsers, user, queryMode);
  const dateModes = activityStreamDateModes(dateQueryMode);
  const selectedUser = normalizedSelectedUsers[0] || "";
  const queryUser = standardFlow ? escapeActivityStreamUser(selectedUser) : variants[0]?.user || user;
  const standardActivityStreamFlow = {
    enabled: standardFlow,
    selectedUser,
    activityStreamQueryUser: queryUser,
    activityStreamQueryUserEncoded: encodeURIComponent(queryUser),
    variant: standardFlow ? "escaped_username" : variants[0]?.variant || "",
    dateQueryMode: standardFlow ? "update_date_after_before" : dateQueryMode,
    chunkingMode: standardFlow ? "auto" : chunkingMode,
    perChunkMaxResults: requestMaxResults,
    advancedOverrideUsed
  };
  const logs = [
    `[USER_ACTION] Run Activity Stream Probe: runId=${runId} mode=${queryMode} user=${user || "auto"}`,
    `[INFO] Activity Stream probe started: runId=${runId} mode=${queryMode} variants=${variants.map((item) => `${item.variant}:${item.user}`).join(",")} date=${startDate}..${endDate}`,
    `[INFO] Activity Stream date query mode: ${dateQueryMode}`,
    `[INFO] Date range chunking: requested=${chunkingMode} resolved=${dateRangeChunking.mode} enabled=${dateRangeChunking.enabled} chunks=${dateRangeChunking.chunkCount}`,
    `[INFO] Requested date range: ${startDate}..${range.endExclusive} timezone=Asia/Taipei startEpochMs=${range.startEpochMs} endEpochMs=${range.endExclusiveEpochMs}`,
    `[INFO] Activity Stream variants planned: ${variants.map((item) => `${item.variant}=${item.user}`).join(" ")}`,
    "[INFO] Authorization: [masked]",
    "[INFO] Token: [masked]"
  ];
  if (requestMaxResults > 500) logs.push(`[WARN] Large maxResults requested: ${requestMaxResults}`);
  if (requestMaxResults > 10000) logs.push("[WARN] Very large maxResults may cause timeout, UI stalls, or increased Jira server load.");
  const client = isUiSmoke ? null : createJiraClient({ baseUrl: connection.baseUrl, email: connection.email || connection.username, apiToken: connection.apiToken ?? "", authType: connection.authType });
  const modeRuns: Array<{ mode: ActivityStreamDateTestMode; stream: ReturnType<typeof aggregateActivityStream>; variants: ReturnType<typeof activityStreamResult>[]; chunkResults: Array<Record<string, unknown>> }> = [];
  let responseBytes = 0;
  const requestStartedAt = Date.now();
  const physicalRequests: PhysicalHttpRequestDiagnostic[] = [];
  for (const dateMode of dateModes) {
    const variantResults = [] as ReturnType<typeof activityStreamResult>[];
    const useChunks = dateMode === "update_date_after_before" && dateRangeChunking.enabled;
    const requestRanges = useChunks ? dateRangeChunking.chunks : [{ chunkIndex: 1, chunkStart: range.start, chunkEndExclusive: range.endExclusive, startEpochMs: range.startEpochMs, endEpochMs: range.endExclusiveEpochMs }];
    const resultsByVariant = new Map<string, ReturnType<typeof activityStreamResult>[]>();
    const chunkResults: Array<Record<string, unknown>> = [];
    for (const chunk of requestRanges) {
      const chunkRange = { ...range, start: chunk.chunkStart, end: addIsoDays(chunk.chunkEndExclusive, -1), endExclusive: chunk.chunkEndExclusive, startEpochMs: chunk.startEpochMs, endExclusiveEpochMs: chunk.endEpochMs };
      const currentChunkResults = [] as ReturnType<typeof activityStreamResult>[];
      for (const variant of variants) {
        if (isUiSmoke) await new Promise((resolve) => setTimeout(resolve, 10));
        const requestUrlSanitized = activityStreamRequestPath(requestMaxResults, relativeLinks, variant.user, dateMode, chunkRange);
        logs.push(`[INFO] Activity Stream chunk started: chunk=${chunk.chunkIndex}/${requestRanges.length} variant=${variant.variant} dateMode=${dateMode} range=${chunk.chunkStart}..${chunk.chunkEndExclusive}`, `[DEBUG] GET ${requestUrlSanitized} (credentials masked)`);
        let response: JiraHttpResult;
        const physicalStartedMs = Date.now();
        if (isUiSmoke) {
          const chunkedEntry = `<entry><title>updated Smoke Confluence chunk ${chunk.chunkIndex}</title><author><name>Smoke User</name><email>smoke.user@example.com</email></author><updated>${chunk.chunkStart}T10:00:00+08:00</updated><activity:application>com.atlassian.confluence</activity:application><activity:object-type>page</activity:object-type><summary>Chunk ${chunk.chunkIndex}</summary></entry>`;
          const duplicateEntry = `<entry><title>shared Smoke Confluence activity</title><author><name>Smoke User</name><email>smoke.user@example.com</email></author><updated>${range.start}T09:00:00+08:00</updated><activity:application>com.atlassian.confluence</activity:application><activity:object-type>page</activity:object-type><summary>Duplicate across chunks</summary></entry>`;
          const insideEntry = `<entry><title type="html">created a link from <a href="/browse/SMOKE-101">SMOKE-101</a></title><author><name>Smoke User</name><email>smoke.user@example.com</email></author><published>2026-07-02T09:00:00Z</published><activity:object><title>SMOKE-101</title><summary>Smoke fixture</summary></activity:object></entry>`;
          const confluenceEntries = Array.from({ length: Math.max(0, Math.min(requestMaxResults, 67) - 1) }, (_, index) => `<entry><title>attached a file to Smoke Confluence page ${index + 1}</title><author><name>Smoke User</name><email>smoke.user@example.com</email></author><updated>2026-07-${String(index % 6 + 1).padStart(2, "0")}T10:00:00Z</updated><activity:application>com.atlassian.confluence</activity:application><activity:object-type>page</activity:object-type><summary>Long sanitized detail ${"x".repeat(300)} ${index + 1}</summary></entry>`).join("");
          const outsideEntry = `<entry><title>commented on SMOKE-099</title><author><name>Smoke User</name></author><updated>2026-06-18T02:28:51Z</updated><summary>Outside requested range</summary></entry>`;
          const timelineOutsideEntry = `<entry><title>edited Confluence page outside range</title><author><name>Smoke User</name></author><updated>2026-06-18T02:28:51Z</updated><activity:application>com.atlassian.confluence</activity:application><activity:object-type>page</activity:object-type><summary>Outside requested range</summary></entry>`;
          const timelineIntegrityEntries = runId.includes("timeline") ? `<entry><title>created a link from <a href="/browse/COPGEN1-125695">COPGEN1-125695</a> to <a href="/browse/COPGEN1-125806">COPGEN1-125806</a></title><author><name>Smoke User</name><email>smoke.user@example.com</email></author><updated>2026-07-02T11:00:00Z</updated><summary>Secondary issue key integrity fixture</summary></entry>${timelineOutsideEntry}` : "";
          const body = variant.variant === "escaped_username" ? useChunks ? `<feed>${chunkedEntry}${duplicateEntry}</feed>` : `<feed>${insideEntry}${confluenceEntries}${timelineIntegrityEntries}${dateMode === "startDate_endDate" ? outsideEntry : ""}</feed>` : "<feed></feed>";
          response = { ok: true, status: 200, contentType: "application/atom+xml", bodyTextSanitized: body, bodyPreview: "", json: null } as JiraHttpResult;
        } else {
          response = await client!.get(requestUrlSanitized);
        }
        responseBytes += Buffer.byteLength(String(response.bodyTextSanitized ?? response.bodyPreview ?? JSON.stringify(response.json ?? "")), "utf8");
        const result = { ...activityStreamResult(response, requestUrlSanitized, variant.user, variant.variant, runId), dateQueryMode: dateMode };
        const physicalCompletedMs = Date.now();
        const physicalRequestId = `${runId}-http-${String(physicalRequests.length + 1).padStart(3, "0")}`;
        physicalRequests.push({
          physicalRequestId, probeRunId: runId, roundNumber: 0, windowNumber: chunk.chunkIndex,
          requestWindowStart: chunk.chunkStart, requestWindowEnd: addIsoDays(chunk.chunkEndExclusive, -1), variant: "escaped_username",
          requestStartedAt: response.requestStartedAt || new Date(physicalStartedMs).toISOString(), requestSentAt: response.requestSentAt || new Date(physicalStartedMs).toISOString(),
          responseHeadersReceivedAt: response.responseHeadersReceivedAt || "", responseBodyCompletedAt: response.responseBodyCompletedAt || new Date(physicalCompletedMs).toISOString(), requestCompletedAt: response.requestCompletedAt || new Date(physicalCompletedMs).toISOString(),
          httpStatus: String(response.status), responseBytes: response.responseBytes ?? Buffer.byteLength(String(response.bodyTextSanitized ?? response.bodyPreview ?? JSON.stringify(response.json ?? "")), "utf8"), atomEntryCount: result.atomEntryCount, parsedEventCount: result.parsedActivityCount,
          timeout: response.timeout === true, aborted: response.aborted === true, errorType: response.timeout ? "timeout" : result.diagnosis, errorMessageSanitized: maskDiagnosticText(result.error).slice(0, 300),
          httpDurationMs: response.httpDurationMs ?? Math.max(0, physicalCompletedMs - physicalStartedMs), timeToFirstByteMs: response.timeToFirstByteMs ?? null, timeToFirstByteAvailable: response.timeToFirstByteAvailable === true, responseDownloadMs: response.responseDownloadMs ?? 0,
          pagination: chunk.chunkIndex > 1, retry: false
        });
        currentChunkResults.push(result);
        resultsByVariant.set(variant.variant, [...(resultsByVariant.get(variant.variant) ?? []), result]);
        logs.push(`${result.parsed ? "[INFO]" : "[WARN]"} Activity Stream chunk completed: chunk=${chunk.chunkIndex} variant=${variant.variant} diagnosis=${result.diagnosis} atomEntries=${result.atomEntryCount} parsedActivities=${result.parsedActivityCount}`);
      }
      if (useChunks) {
        const chunkStream = aggregateActivityStream(currentChunkResults, user);
        chunkResults.push({ chunkIndex: chunk.chunkIndex, chunkStart: chunk.chunkStart, chunkEndExclusive: chunk.chunkEndExclusive, startEpochMs: chunk.startEpochMs, endEpochMs: chunk.endEpochMs, requestUrlSanitized: chunkStream.requestUrlSanitized, httpStatus: chunkStream.httpStatus, diagnosis: chunkStream.diagnosis, status: chunkStream.overallStatus, atomEntryCount: chunkStream.atomEntryCount, parsedActivityCount: chunkStream.parsedActivityCount, entriesWithIssueKeyCount: chunkStream.activityEntryStats.entriesWithIssueKeyCount, confluenceOnlyEntryCount: chunkStream.activityEntryStats.confluenceOnlyEntryCount, uniqueIssueKeyCount: chunkStream.activityEntryStats.uniqueIssueKeyCount, error: chunkStream.error });
      }
    }
    for (const variant of variants) variantResults.push(mergeVariantChunkResults(resultsByVariant.get(variant.variant) ?? [], variant));
    const stream = aggregateActivityStream(variantResults, user);
    if (useChunks) stream.overallStatus = chunkOverallStatus(chunkResults);
    modeRuns.push({ mode: dateMode, variants: variantResults, stream, chunkResults });
  }
  const dateQueryResults = modeRuns.map((item) => dateQueryDiagnostics(item.mode, runId, item.stream, range));
  const effectivenessRank = (value: ActivityStreamDateEffectiveness) => value === true ? 3 : value === "likely_true" ? 2 : value === "unknown" ? 1 : 0;
  const selectedModeRun = [...modeRuns].sort((a, b) => effectivenessRank(dateQueryDiagnostics(b.mode, runId, b.stream, range).dateFilterEffective) - effectivenessRank(dateQueryDiagnostics(a.mode, runId, a.stream, range).dateFilterEffective))[0];
  const activityStream = selectedModeRun?.stream ?? aggregateActivityStream([], user);
  const activityStreamChunkResults = selectedModeRun?.chunkResults ?? [];
  const selectedDateResult = dateQueryResults.find((item) => item.mode === selectedModeRun?.mode) ?? dateQueryResults[0];
  const clientDateFilteredEntriesSanitized = activityStream.entriesSanitized.filter((entry) => {
    if (activityStream.bestVariant && entry.variant !== activityStream.bestVariant) return false;
    const epoch = Date.parse(entry.activityTime);
    return Number.isFinite(epoch) && epoch >= range.startEpochMs && epoch < range.endExclusiveEpochMs;
  });
  const dateWarnings = dateQueryResults.flatMap((item) => item.warnings);
  for (const result of dateQueryResults) logs.push(`[INFO] Date semantics result: mode=${result.mode} atomEntries=${result.atomEntryCount} insideRange=${result.entriesInsideRequestedRange} outsideRange=${result.entriesOutsideRequestedRange} effective=${result.dateFilterEffective}`, ...result.warnings.map((warning) => `[WARN] ${warning}`));
  const bestDateQueryMode = selectedDateResult?.dateFilterEffective === true ? selectedDateResult.mode : "client_side_only";
  const dateSemantics = { requestedDateRange: { start: range.start, end: range.end, endInclusive: range.endInclusive, timezone: range.timezone, startEpochMs: range.startEpochMs, endExclusiveEpochMs: range.endExclusiveEpochMs }, dateQueryModesTested: dateModes, bestDateQueryMode, serverDateFilterEffective: selectedDateResult?.dateFilterEffective ?? "unknown", clientDateFilterApplied: true, rawReturnedEntries: activityStream.parsedActivityCount, clientDateFilteredEntries: clientDateFilteredEntriesSanitized.length, warnings: dateWarnings };
  const maxResultsDiagnostics = { requestedMaxResults: requestMaxResults, maxResultsSource, actualAtomEntryCount: activityStream.atomEntryCount, parsedActivityCount: activityStream.parsedActivityCount, serverCapDetected: "unknown" as const, serverCapValueEstimated: null, responseTimeMs: Date.now() - requestStartedAt, responseSizeKB: Number((responseBytes / 1024).toFixed(2)), largeMaxResultsWarningShown: requestMaxResults > 500, largeMaxResultsConfirmed, warnings: [...(requestMaxResults > 500 ? ["Large maxResults requested."] : []), ...(requestMaxResults > 10000 ? ["Very large maxResults may timeout, stall the UI, or increase Jira server load."] : [])] };
  const totalChunkAtomEntries = activityStreamChunkResults.reduce((sum, item) => sum + Number(item.atomEntryCount || 0), 0);
  const totalChunkParsedEntries = activityStreamChunkResults.reduce((sum, item) => sum + Number(item.parsedActivityCount || 0), 0);
  const chunkMergeStats = { totalChunkAtomEntries, mergedActivityEntries: activityStream.parsedActivityCount, duplicateEntriesRemoved: Math.max(0, totalChunkParsedEntries - activityStream.parsedActivityCount), mergedEntriesWithIssueKeyCount: activityStream.activityEntryStats.entriesWithIssueKeyCount, mergedConfluenceOnlyEntryCount: activityStream.activityEntryStats.confluenceOnlyEntryCount, uniqueIssueKeyCount: activityStream.activityEntryStats.uniqueIssueKeyCount, successfulChunks: activityStreamChunkResults.filter((item) => String(item.status) === "success").length, noEntryChunks: activityStreamChunkResults.filter((item) => String(item.diagnosis) === "no_entries").length, failedChunks: activityStreamChunkResults.filter((item) => !["success", "no_entries"].includes(String(item.status))).length };
  logs.push(`[INFO] Activity Stream best variant: ${activityStream.bestVariant || "none"}`, `[INFO] Activity Stream probe completed: overallStatus=${activityStream.overallStatus} bestVariant=${activityStream.bestVariant || "none"} diagnosis=${activityStream.diagnosis} parsedIssueKeys=${activityStream.activityStreamIssueKeys.length}`, "[INFO] No database write performed", "[INFO] No Jira write performed");
  const completedAt = new Date().toISOString();
  const totalElapsedMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
  const totalHttpDurationMs = physicalRequests.reduce((sum, request) => sum + request.httpDurationMs, 0);
  return { runId, startedAt, completedAt, activityStream, dateSemantics, dateQueryResults, maxResultsDiagnostics, dateRangeChunking, activityStreamChunkResults, chunkMergeStats, clientDateFilteredEntriesSanitized, standardActivityStreamFlow, advancedDiagnosticsUsed: !standardFlow, activityTypeClassifierDiagnostics: activityStream.activityTypeClassifierDiagnostics, physicalRequests, totalHttpDurationMs, totalProcessingDurationMs: Math.max(0, totalElapsedMs - totalHttpDurationMs), logs };
}

function baselineObservationFromRun(run: Awaited<ReturnType<typeof runActivityStreamProbeAttempt>>, selectedUsers: string[], startDate: string, endDate: string, maxResults: number, relativeLinks: boolean): BaselineObservation {
  const flow = run.standardActivityStreamFlow;
  const stream = run.activityStream;
  const range = requestedDateRange(startDate, endDate);
  const entries = stream.entriesSanitized.filter((entry) => !stream.bestVariant || entry.variant === stream.bestVariant);
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.entryFingerprint, entry])).values());
  const requestSignatureHash = sha256(JSON.stringify({ source: "activity_stream", selectedUser: flow.selectedUser, queryUser: flow.activityStreamQueryUser, variant: flow.variant, dateQueryMode: flow.dateQueryMode, periodStart: range.start, periodEndExclusive: range.endExclusive, maxResults, relativeLinks }));
  return {
    runId: run.runId,
    observedAt: run.completedAt,
    source: "activity_stream",
    selectedUser: flow.selectedUser || selectedUsers[0] || "",
    queryUser: flow.activityStreamQueryUser,
    queryUserEncoded: flow.activityStreamQueryUserEncoded,
    variant: flow.variant,
    dateQueryMode: flow.dateQueryMode,
    periodStart: range.start,
    periodEndExclusive: range.endExclusive,
    granularity: "exact_range",
    requestSignatureHash,
    atomEntryCount: stream.atomEntryCount,
    parsedActivityCount: stream.parsedActivityCount,
    issueKeys: stream.activityStreamIssueKeys,
    entries: uniqueEntries.map((entry) => ({ entryFingerprint: entry.entryFingerprint, activityTime: entry.activityTime, activityAuthorEmail: entry.activityAuthorEmail, activityType: entry.activityType, issueKey: entry.issueKey, activityTitle: entry.activityTitle }))
  };
}

async function runActivityStreamProbe(connection: AppConnection, selectedUsers: string[], user: string, queryMode: ActivityStreamQueryMode, startDate: string, endDate: string, maxResults: number, relativeLinks = true, requestedRunId?: string, dateQueryMode: ActivityStreamDateQueryMode = "both", maxResultsSource: "custom" | "quick" = "custom", largeMaxResultsConfirmed = false, chunkingMode: ActivityStreamChunkingMode = "auto", customChunkDays = 14, standardFlow = false, advancedOverrideUsed = false) {
  if (!standardFlow) return runActivityStreamProbeAttempt(connection, selectedUsers, user, queryMode, startDate, endDate, maxResults, relativeLinks, requestedRunId, dateQueryMode, maxResultsSource, largeMaxResultsConfirmed, chunkingMode, customChunkDays, standardFlow, advancedOverrideUsed);
  const originalRunId = requestedRunId || createActivityStreamRunId();
  const maxBaselineGuardRetries = 2;
  const evaluated: Array<{ run: Awaited<ReturnType<typeof runActivityStreamProbeAttempt>>; comparison: ActivityStreamBaselineComparison; snapshot: ActivityStreamBaselineSnapshot; baselinePath: string }> = [];
  for (let attempt = 0; attempt <= maxBaselineGuardRetries; attempt += 1) {
    const attemptRunId = attempt === 0 ? originalRunId : `${originalRunId}-retry${attempt}`;
    const run = await runActivityStreamProbeAttempt(connection, selectedUsers, user, queryMode, startDate, endDate, maxResults, relativeLinks, attemptRunId, dateQueryMode, maxResultsSource, largeMaxResultsConfirmed, chunkingMode, customChunkDays, standardFlow, advancedOverrideUsed);
    const observation = baselineObservationFromRun(run, selectedUsers, startDate, endDate, 500, relativeLinks);
    const baselinePath = path.join(ensureDir(getActivityStreamBaselinesDir()), baselineFileName(observation));
    const existing = loadBaselineSnapshot(baselinePath);
    const { comparison, snapshot } = compareBaselineObservation(existing, observation, baselinePath);
    saveBaselineSnapshot(baselinePath, snapshot);
    evaluated.push({ run, comparison, snapshot, baselinePath });
    run.logs.push(`[INFO] Activity Stream Baseline Guard: classification=${comparison.classification} shouldRetry=${comparison.shouldRetry} baselineFound=${comparison.baselineFound}`, `[INFO] Baseline counts: parsed=${comparison.baselineCounts.bestParsedActivityCount} issueKeys=${comparison.baselineCounts.bestIssueKeyCount} entries=${comparison.baselineCounts.bestEntryFingerprintCount}`, `[INFO] Current counts: parsed=${comparison.currentCounts.parsedActivityCount} issueKeys=${comparison.currentCounts.issueKeyCount} entries=${comparison.currentCounts.entryFingerprintCount}`);
    if (!comparison.shouldRetry || attempt === maxBaselineGuardRetries) break;
    run.logs.push(`[WARN] Current result is below local baseline. Retry ${attempt + 1}/${maxBaselineGuardRetries} triggered.`, `[WARN] Missing issue keys: ${comparison.missingIssueKeys.join(", ") || "none"}; missing entries=${comparison.missingEntryFingerprints.length}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const outcome = selectBaselineGuardOutcome(evaluated.map((item) => ({ shouldRetry: item.comparison.shouldRetry, parsedActivityCount: item.run.activityStream.parsedActivityCount, issueKeyCount: item.run.activityStream.activityStreamIssueKeys.length })));
  const firstWasRegression = evaluated[0]?.comparison.shouldRetry === true;
  const recovered = outcome.retryRecovered ? evaluated[outcome.selectedIndex] : undefined;
  const selected = evaluated[outcome.selectedIndex];
  const finalComparison = selected.comparison;
  const stillIncomplete = outcome.resultIncompleteCandidate;
  const retry: BaselineGuardRetrySummary = {
    triggered: firstWasRegression,
    maxRetries: maxBaselineGuardRetries,
    attempts: evaluated.map((item, attempt) => ({ attempt, runId: item.run.runId, classification: item.comparison.classification, parsedActivityCount: item.run.activityStream.parsedActivityCount, issueKeyCount: item.run.activityStream.activityStreamIssueKeys.length, missingIssueKeyCount: item.comparison.missingIssueKeys.length, missingEntryFingerprintCount: item.comparison.missingEntryFingerprints.length })),
    finalAcceptedRunId: stillIncomplete ? "" : selected.run.runId,
    finalClassification: stillIncomplete ? "result_incomplete_candidate" : finalComparison.classification,
    baselineUpdated: finalComparison.baselineUpdated,
    retryRecovered: Boolean(recovered)
  };
  for (const item of evaluated) activityStreamBaselineGuardHistory.push({ time: item.run.completedAt, runId: item.run.runId, comparison: item.comparison, retry, snapshot: item.snapshot });
  latestActivityStreamBaselineGuardRecord = { time: selected.run.completedAt, runId: selected.run.runId, comparison: selected.comparison, retry, snapshot: selected.snapshot };
  refreshStabilityGateDecision();
  if (activityStreamBaselineGuardHistory.length > 100) activityStreamBaselineGuardHistory.splice(0, activityStreamBaselineGuardHistory.length - 100);
  selected.run.logs.push(recovered ? "[INFO] Retry recovered a better result. / 重試後取得較完整結果。" : stillIncomplete ? "[WARN] Result is still below baseline after retries. Baseline was not overwritten. / 重試後仍低於基準，本次結果未覆蓋 baseline。" : `[INFO] Baseline Guard accepted: ${finalComparison.classification}`);
  const normalizeRunId = <T extends { runId: string }>(value: T) => ({ ...value, runId: originalRunId });
  const baselineGuardAttemptResults = evaluated.map((item) => ({ runId: item.run.runId, startedAt: item.run.startedAt, completedAt: item.run.completedAt, classification: item.comparison.classification, atomEntryCount: item.run.activityStream.atomEntryCount, parsedActivityCount: item.run.activityStream.parsedActivityCount, issueKeys: item.run.activityStream.activityStreamIssueKeys, entryFingerprintCount: item.comparison.currentCounts.entryFingerprintCount, missingIssueKeys: item.comparison.missingIssueKeys, missingEntryFingerprintCount: item.comparison.missingEntryFingerprints.length }));
  const activityStream = {
    ...selected.run.activityStream,
    runId: originalRunId,
    entriesSanitized: selected.run.activityStream.entriesSanitized.map(normalizeRunId),
    variantResults: selected.run.activityStream.variantResults.map((variant) => ({ ...variant, runId: originalRunId, entriesSanitized: variant.entriesSanitized.map(normalizeRunId) })),
    baselineComparison: finalComparison,
    baselineGuardRetry: retry,
    baselineGuardAttemptResults,
    lowConfidenceObservation: stillIncomplete ? { runId: selected.run.runId, reason: "below_baseline", missingIssueKeys: finalComparison.missingIssueKeys, missingEntryCount: finalComparison.missingEntryFingerprints.length } : null
  };
  return { ...selected.run, runId: originalRunId, activityStream, baselineComparison: finalComparison, baselineGuardRetry: retry, baselineSnapshot: selected.snapshot, baselinePath: selected.baselinePath, baselineGuardAttemptResults };
}

ipcMain.handle("user-analysis:activity-stream-probe", async (_event, payload: { connection: AppConnection; selectedUsers?: string[]; activityStreamUser: string; queryMode?: ActivityStreamQueryMode; startDate: string; endDate: string; maxResults: number; maxResultsSource?: "custom" | "quick"; largeMaxResultsConfirmed?: boolean; dateQueryMode?: ActivityStreamDateQueryMode; relativeLinks?: boolean; runId?: string; chunkingMode?: ActivityStreamChunkingMode; customChunkDays?: number; standardFlow?: boolean; advancedOverrideUsed?: boolean }) => {
  return runActivityStreamProbe(payload.connection, payload.selectedUsers ?? [], String(payload.activityStreamUser || "").trim(), payload.queryMode ?? "auto", payload.startDate, payload.endDate, Number(payload.maxResults), payload.relativeLinks !== false, payload.runId, payload.dateQueryMode ?? "both", payload.maxResultsSource ?? "custom", payload.largeMaxResultsConfirmed === true, payload.chunkingMode ?? "auto", Number(payload.customChunkDays ?? 14), payload.standardFlow === true, payload.advancedOverrideUsed === true);
});

function stabilityAttemptCsv(attempts: ActivityStreamProbeAttempt[]) {
  const fields: Array<keyof ActivityStreamProbeAttempt> = ["windowId", "attemptNumber", "httpStatus", "durationMs", "rawEventCount", "normalizedEventCount", "uniqueEventCount", "jiraIssueKeyCount", "newEventsComparedWithPreviousAttempt", "missingEventsComparedWithPreviousAttempt", "newEventsComparedWithCurrentUnion", "missingEventsComparedWithFinalUnion", "eventSetFingerprint", "issueKeySetFingerprint", "coldStartSuspected", "errorType", "errorMessage"];
  return `\uFEFF${fields.join(",")}\r\n${attempts.map((attempt) => fields.map((field) => csvCell(attempt[field])).join(",")).join("\r\n")}\r\n`;
}

function stabilityWindowCsv(windows: ActivityStreamProbeWindow[]) {
  const header = ["windowId", "start", "end", "attemptCount", "firstStableAttempt", "finalUnionEventCount", "finalUnionJiraKeyCount", "finalIntersectionEventCount", "stabilityStatus", "recommendedRetryCount"];
  return `\uFEFF${header.join(",")}\r\n${windows.map((window) => [window.windowId, window.start, window.end, window.attempts.length, window.stability.firstStableAttempt ?? "", window.finalUnionEventCount, window.finalUnionJiraKeyCount, window.finalIntersectionEventCount, window.stability.classification, window.recommendedRetryCount].map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function writeStabilityProbeFiles(run: ActivityStreamProbeRun) {
  const folder = ensureDir(path.join(getExportsDir(), "user-analysis", "stability-probe", run.probeRunId));
  const files = {
    probe: path.join(folder, "activity-stream-stability-probe.json"),
    attempts: path.join(folder, "activity-stream-attempts.json"),
    attemptComparison: path.join(folder, "activity-stream-attempt-comparison.csv"),
    windowSummary: path.join(folder, "activity-stream-window-summary.csv"),
    recommendation: path.join(folder, "activity-stream-stability-recommendation.json")
  };
  writeJsonAtomic(files.probe, sanitizeExportData({ app: { version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__ }, ...run, attempts: undefined }));
  writeJsonAtomic(files.attempts, { schemaVersion: "activity_stream_stability_attempts_v1", probeRunId: run.probeRunId, attempts: run.attempts });
  fs.writeFileSync(files.attemptComparison, stabilityAttemptCsv(run.attempts), "utf8");
  fs.writeFileSync(files.windowSummary, stabilityWindowCsv(run.windows), "utf8");
  writeJsonAtomic(files.recommendation, { schemaVersion: "activity_stream_stability_recommendation_v1", probeRunId: run.probeRunId, recommendation: run.recommendation });
  return files;
}

ipcMain.handle("user-analysis:cancel-stability-probe", async () => {
  if (!activeStabilityProbe) return { ok: false, message: "No Stability Probe is running." };
  activeStabilityProbe.cancelled = true;
  return { ok: true, runId: activeStabilityProbe.runId };
});

ipcMain.handle("user-analysis:activity-stream-stability-probe-v1-legacy", async (ipcEvent, payload: { connection: AppConnection; config: ActivityStreamStabilityProbeConfig; confirmedLargeRun?: boolean }) => {
  if (activeStabilityProbe) throw new Error("Another Activity Stream Stability Probe is already running.");
  const config = payload.config;
  const forcedRetryCount = Math.max(1, Math.min(32, Math.trunc(Number(config.forcedRetryCount))));
  if (forcedRetryCount !== config.forcedRetryCount) throw new Error("Forced Retry Count must be an integer from 1 to 32.");
  if (![0, 1000, 2000, 3000, 5000].includes(config.retryDelayMs)) throw new Error("Retry Delay is invalid.");
  const windows = splitActivityStreamWindows(config.dateRange.start, config.dateRange.end, config.requestWindow.type, config.requestWindow.customDays ?? 7);
  const totalRequests = windows.length * forcedRetryCount;
  if (totalRequests > 500 && payload.confirmedLargeRun !== true) throw new Error("CONFIRM_REQUIRED: More than 500 sequential requests require confirmation.");
  const probeRunId = `ASP-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const idleGapSeconds = lastActivityStreamQueryAt ? Math.max(0, Math.round((Date.parse(startedAt) - Date.parse(lastActivityStreamQueryAt)) / 1000)) : 0;
  const coldStartSuspected = !lastActivityStreamQueryAt || idleGapSeconds > 1800;
  const jiraConnectionSessionId = `jira-session:${sha256(String(payload.connection.baseUrl || "")).slice(0, 16)}`;
  activeStabilityProbe = { runId: probeRunId, cancelled: false };
  const attempts: ActivityStreamProbeAttempt[] = [];
  const probeWindows: ActivityStreamProbeWindow[] = [];
  const send = (stage: string, message: string, windowIndex: number, attemptNumber: number, extra: Record<string, unknown> = {}) => ipcEvent.sender.send("user-analysis:stability-probe-progress", { probeRunId, stage, message, windowIndex, windowCount: windows.length, attemptNumber, totalAttempts: forcedRetryCount, totalRequests, ...extra });
  send("start", "Activity Stream Stability Probe started", 0, 0, { startedAt, idleGapSeconds, coldStartSuspected });
  try {
    for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
      const requestWindow = windows[windowIndex];
      const windowAttempts: ActivityStreamProbeAttempt[] = [];
      for (let attemptIndex = 0; attemptIndex < forcedRetryCount; attemptIndex += 1) {
        if (activeStabilityProbe.cancelled) break;
        const attemptNumber = attemptIndex + 1;
        const attemptId = `${requestWindow.windowId}-attempt-${String(attemptNumber).padStart(2, "0")}`;
        const attemptStarted = new Date().toISOString();
        send("fetch", "Activity Stream request started", windowIndex + 1, attemptNumber, { windowId: requestWindow.windowId, requestWindowStart: requestWindow.start, requestWindowEnd: requestWindow.end, attemptId });
        let run: Awaited<ReturnType<typeof runActivityStreamProbe>> | null = null;
        let errorMessage = "";
        const startedMs = Date.now();
        try {
          run = await runActivityStreamProbe(payload.connection, [config.selectedUser], config.selectedUser, "auto", requestWindow.start, requestWindow.end, 500, true, `${probeRunId}-${attemptId}`, "update_date_after_before", "quick", false, "off", 7, false, true);
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
        lastActivityStreamQueryAt = new Date().toISOString();
        const entries = run?.activityStream.entriesSanitized ?? [];
        const normalizedEvents = Array.from(new Map(entries.map((entry) => normalizeStabilityEvent(entry as unknown as Record<string, unknown>)).map((entry) => [entry.stableEventId, entry])).values());
        const issueKeys = Array.from(new Set(normalizedEvents.flatMap((entry) => entry.issueKeys))).sort();
        const completedAt = new Date().toISOString();
        const attempt: ActivityStreamProbeAttempt = {
          probeRunId, windowId: requestWindow.windowId, attemptId, requestWindowStart: requestWindow.start, requestWindowEnd: requestWindow.end, attemptNumber, totalAttempts: forcedRetryCount,
          startedAt: attemptStarted, completedAt, durationMs: Date.now() - startedMs, httpStatus: String(run?.activityStream.httpStatus ?? "-"), requestSucceeded: Boolean(run && run.activityStream.status !== "failed"),
          rawEventCount: Number(run?.activityStream.atomEntryCount ?? 0), normalizedEventCount: entries.length, uniqueEventCount: normalizedEvents.length, jiraIssueKeyCount: issueKeys.length,
          confluenceEventCount: normalizedEvents.filter((entry) => entry.system === "confluence").length, duplicateCount: Math.max(0, entries.length - normalizedEvents.length),
          newEventsComparedWithPreviousAttempt: 0, missingEventsComparedWithPreviousAttempt: 0, newEventsComparedWithCurrentUnion: 0, missingEventsComparedWithFinalUnion: 0,
          eventSetFingerprint: fingerprintSet(normalizedEvents.map((entry) => entry.stableEventId)), issueKeySetFingerprint: fingerprintSet(issueKeys), errorType: errorMessage ? "request_error" : "", errorMessage: errorMessage.slice(0, 300),
          idleGapSeconds: windowIndex === 0 && attemptIndex === 0 ? idleGapSeconds : Math.max(0, Math.round((Date.parse(attemptStarted) - Date.parse(lastActivityStreamQueryAt)) / 1000)), coldStartSuspected: windowIndex === 0 && attemptIndex === 0 && coldStartSuspected,
          normalizedEvents, rawResultSanitized: sanitizeExportData({ runId: run?.runId ?? "", status: run?.activityStream.status ?? "failed", diagnosis: run?.activityStream.diagnosis ?? "unknown", bestVariant: run?.activityStream.bestVariant ?? "", requestUrlSanitized: run?.activityStream.requestUrlSanitized ?? "", atomEntryCount: run?.activityStream.atomEntryCount ?? 0, parsedActivityCount: run?.activityStream.parsedActivityCount ?? 0, issueKeys }) as Record<string, unknown>
        };
        windowAttempts.push(attempt);
        attempts.push(attempt);
        const interim = classifyWindowStability(windowAttempts);
        send("compare", "Activity Stream request completed", windowIndex + 1, attemptNumber, { windowId: requestWindow.windowId, attemptId, httpStatus: attempt.httpStatus, rawEventCount: attempt.rawEventCount, uniqueEventCount: attempt.uniqueEventCount, jiraIssueKeyCount: attempt.jiraIssueKeyCount, stability: interim.classification });
        if (config.stopEarlyWhenStable && !config.forceRunAllAttempts && interim.classification === "stable") break;
        if (attemptIndex + 1 < forcedRetryCount && config.retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs));
      }
      const finalized = finalizeAttemptDiffs(windowAttempts);
      attempts.splice(attempts.length - windowAttempts.length, windowAttempts.length, ...finalized);
      const stability = classifyWindowStability(finalized);
      const unionIds = new Set(finalized.flatMap((attempt) => attempt.normalizedEvents.map((entry) => entry.stableEventId)));
      const intersection = finalized.length ? finalized.map((attempt) => new Set(attempt.normalizedEvents.map((entry) => entry.stableEventId))).reduce((left, right) => new Set([...left].filter((id) => right.has(id)))) : new Set<string>();
      const unionKeys = new Set(finalized.flatMap((attempt) => attempt.normalizedEvents.flatMap((entry) => entry.issueKeys)));
      probeWindows.push({ windowId: requestWindow.windowId, start: requestWindow.start, end: requestWindow.end, attempts: finalized, stability, finalUnionEventCount: unionIds.size, finalUnionJiraKeyCount: unionKeys.size, finalIntersectionEventCount: intersection.size, recommendedRetryCount: Math.min(32, Math.max(2, (stability.firstStableAttempt ?? finalized.length) + 1)) });
      if (activeStabilityProbe.cancelled) break;
    }
    const mergedPerWindow = probeWindows.flatMap((window) => mergeProbeAttempts(window.attempts, config.mergeStrategy, config.noStableFallback).events);
    const mergedEvents = Array.from(new Map(mergedPerWindow.map((entry) => [entry.stableEventId, entry])).values());
    const fallbackReasons = probeWindows.map((window) => mergeProbeAttempts(window.attempts, config.mergeStrategy, config.noStableFallback).fallbackReason).filter(Boolean);
    const recommendation = recommendStabilitySettings(probeWindows, config.requestWindow.type);
    const status = activeStabilityProbe.cancelled ? "cancelled" : "completed";
    const run: ActivityStreamProbeRun = { schemaVersion: "activity_stream_stability_probe_v1", probeRunId, config, selectedUser: config.selectedUser, dateRange: config.dateRange, startedAt, completedAt: new Date().toISOString(), status, appSessionId, jiraConnectionSessionId, lastActivityStreamQueryAt, currentQueryStartedAt: startedAt, idleGapSeconds, coldStartSuspected, concurrency: 1, windows: probeWindows, attempts, mergedEvents, mergeFallbackReason: fallbackReasons.join(" "), recommendation };
    const files = writeStabilityProbeFiles(run);
    latestActivityStreamStabilityProbe = { ...run, files };
    send(status, `Activity Stream Stability Probe ${status}`, probeWindows.length, attempts.at(-1)?.attemptNumber ?? 0, { completedAt: run.completedAt, files, recommendation });
    return { ...run, files };
  } finally {
    activeStabilityProbe = null;
  }
});

function roundComparisonCsv(rounds: ActivityStreamRound[]) {
  const headers = ["Round", "Status", "DurationMs", "RawEvents", "UniqueEvents", "PrimaryJiraKeys", "ReferencedJiraKeys", "AllJiraLikeKeys", "NewEventsVsPrevious", "MissingEventsVsPrevious", "EventFingerprint", "PrimaryJiraFingerprint", "ColdStart"];
  const rows = rounds.map((round) => [round.roundNumber, round.status, round.durationMs, round.rawEventCount, round.uniqueEventCount, round.primaryJiraKeyCount, round.referencedJiraKeyCount, round.allJiraLikeKeyCount, round.newEventsComparedWithPreviousRound, round.missingEventsComparedWithPreviousRound, round.roundEventSetFingerprint, round.roundPrimaryJiraKeySetFingerprint, round.coldStartSuspected]);
  return `\uFEFF${headers.join(",")}\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function windowDiagnosticsCsv(windows: ActivityStreamRoundWindowResult[]) {
  const headers = ["Round", "Window", "DateStart", "DateEnd", "Status", "Classification", "HttpStatus", "LogicalFetchDurationMs", "PhysicalHttpRequestCount", "PhysicalHttpDurationMs", "PaginationRequestCount", "RetryRequestCount", "ProcessingDurationMs", "TotalWindowDurationMs", "RawEvents", "UniqueEvents", "PrimaryJiraKeys", "ReferencedJiraKeys", "NewEvents", "MissingEvents", "EventFingerprint"];
  const rows = windows.map((window) => [window.roundNumber, window.windowNumber, window.requestWindowStart, window.requestWindowEnd, window.status, window.classification, window.httpStatus, window.logicalFetchDurationMs, window.physicalHttpRequestCount, window.physicalRequests.reduce((sum, request) => sum + request.httpDurationMs, 0), window.paginationRequestCount, window.retryRequestCount, window.processingTiming.totalProcessingMs, window.totalRequestDurationMs, window.rawEventCount, window.uniqueEventCount, window.primaryJiraKeyCount, window.referencedJiraKeyCount, window.newEventsComparedWithPreviousRound, window.missingEventsComparedWithPreviousRound, window.eventSetFingerprint]);
  return `\uFEFF${headers.join(",")}\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function writeRoundStabilityFiles(run: ActivityStreamProbeRunV2) {
  const folder = ensureDir(path.join(getExportsDir(), "user-analysis", "stability-probe-v2", run.probeRunId));
  const files = {
    probe: path.join(folder, "activity-stream-stability-probe-v2.json"),
    setup: path.join(folder, "activity-stream-stability-setup.json"),
    rounds: path.join(folder, "activity-stream-rounds.json"),
    roundComparisonJson: path.join(folder, "activity-stream-round-comparison.json"),
    roundComparison: path.join(folder, "activity-stream-round-comparison.csv"),
    windowDiagnosticsJson: path.join(folder, "activity-stream-window-diagnostics.json"),
    windowDiagnostics: path.join(folder, "activity-stream-window-diagnostics.csv"),
    rawDiagnostics: path.join(folder, "activity-stream-raw-diagnostics.json"),
    uiState: path.join(folder, "activity-stream-stability-ui-state.json"),
    recommendation: path.join(folder, "activity-stream-stability-recommendation-v2.json")
  };
  writeJsonAtomic(files.probe, sanitizeExportData({ app: { version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__ }, ...run }));
  writeJsonAtomic(files.setup, { selectedUser: run.selectedUser, dateRange: run.dateRange, requestWindow: run.config.requestWindow, fullScanRoundCount: run.config.fullScanRoundCount, delayBetweenRounds: run.config.delayBetweenRoundsMs, roundExecutionMode: run.config.roundExecutionMode, mergeStrategy: run.config.mergeStrategy, createdAt: run.startedAt, latestProbeRunId: run.probeRunId });
  writeJsonAtomic(files.rounds, { schemaVersion: "activity_stream_rounds_v2", probeRunId: run.probeRunId, executionOrder: run.executionOrder, rounds: run.rounds });
  writeJsonAtomic(files.roundComparisonJson, { schemaVersion: "activity_stream_round_comparison_v2", probeRunId: run.probeRunId, comparison: run.comparison, rounds: run.rounds });
  fs.writeFileSync(files.roundComparison, roundComparisonCsv(run.rounds), "utf8");
  writeJsonAtomic(files.windowDiagnosticsJson, { schemaVersion: "activity_stream_window_diagnostics_v2", probeRunId: run.probeRunId, logicalWindowRequestCount: run.windowDiagnostics.length, physicalHttpRequestCount: run.windowDiagnostics.reduce((sum, item) => sum + item.physicalHttpRequestCount, 0), paginationRequestCount: run.windowDiagnostics.reduce((sum, item) => sum + item.paginationRequestCount, 0), retryRequestCount: run.windowDiagnostics.reduce((sum, item) => sum + item.retryRequestCount, 0), windows: run.windowDiagnostics });
  fs.writeFileSync(files.windowDiagnostics, windowDiagnosticsCsv(run.windowDiagnostics), "utf8");
  writeJsonAtomic(files.rawDiagnostics, { schemaVersion: "activity_stream_raw_diagnostics_v2", probeRunId: run.probeRunId, diagnostics: run.windowDiagnostics.map((item) => ({ logicalRequestId: item.logicalRequestId, classification: item.classification, physicalRequests: item.physicalRequests, processingTiming: item.processingTiming, rawResultSanitized: item.rawResultSanitized })) });
  writeJsonAtomic(files.uiState, { ...latestStabilityUiState, latestProbeRunId: run.probeRunId, statePersistedAt: new Date().toISOString() });
  writeJsonAtomic(files.recommendation, { schemaVersion: "activity_stream_stability_recommendation_v2", probeRunId: run.probeRunId, recommendation: run.recommendation });
  return files;
}

async function fetchReliabilityWindow(connection: AppConnection, selectedUser: string, start: string, end: string, runId: string, roundNumber: number, windowNumber: number): Promise<RoundWindowFetchResult & { sourceRun: Awaited<ReturnType<typeof runActivityStreamProbeAttempt>> }> {
  const logicalStarted = Date.now();
  try {
    const sourceRun = await runActivityStreamProbeAttempt(connection, [selectedUser], selectedUser, "escaped_username", start, end, 500, true, runId, "update_date_after_before", "custom", false, "off", 7, true, false);
    lastActivityStreamQueryAt = new Date().toISOString();
    const stream = sourceRun.activityStream;
    const physicalRequests = sourceRun.physicalRequests.map((request) => ({ ...request, probeRunId: runId, roundNumber, windowNumber, requestWindowStart: start, requestWindowEnd: end, variant: "escaped_username" as const }));
    const responseBytes = physicalRequests.reduce((sum, request) => sum + request.responseBytes, 0);
    const classification = classifyActivityStreamResult({ httpStatus: String(stream.httpStatus ?? "-"), atomEntryCount: Number(stream.atomEntryCount ?? 0), parsedEventCount: stream.entriesSanitized.length, responseBytes, timeout: physicalRequests.some((item) => item.timeout), aborted: physicalRequests.some((item) => item.aborted), errorType: stream.status === "failed" ? stream.diagnosis : "" });
    return { sourceRun, httpStatus: String(stream.httpStatus ?? "-"), requestSucceeded: classification === "http_200_with_entries" || classification === "http_200_no_entries", classification, rawEventCount: Number(stream.atomEntryCount ?? 0), entries: stream.entriesSanitized as unknown as Record<string, unknown>[], apiDurationMs: sourceRun.totalHttpDurationMs, logicalFetchDurationMs: sourceRun.totalHttpDurationMs, physicalRequests, processingDurationMs: sourceRun.totalProcessingDurationMs, errorType: stream.status === "failed" ? stream.diagnosis : "", errorMessage: stream.error, rawResultSanitized: sanitizeExportData({ runId: sourceRun.runId, status: stream.status, diagnosis: stream.diagnosis, variant: "escaped_username", requestUrlSanitized: stream.requestUrlSanitized, atomEntryCount: stream.atomEntryCount, parsedActivityCount: stream.parsedActivityCount, logicalElapsedMs: Date.now() - logicalStarted }) as Record<string, unknown> };
  } catch (error) {
    const duration = Date.now() - logicalStarted;
    return { sourceRun: null as never, httpStatus: "-", requestSucceeded: false, classification: "network_error", rawEventCount: 0, entries: [], apiDurationMs: duration, logicalFetchDurationMs: duration, physicalRequests: [], processingDurationMs: 0, errorType: "network_error", errorMessage: error instanceof Error ? error.message : String(error), rawResultSanitized: {} };
  }
}

ipcMain.handle("user-analysis:update-stability-ui-state", async (_event, payload: Record<string, unknown>) => {
  latestStabilityUiState = sanitizeExportData({ ...payload, statePersistedAt: new Date().toISOString() }) as Record<string, unknown>;
  return { ok: true };
});

ipcMain.handle("user-analysis:activity-stream-stability-probe", async (ipcEvent, payload: { connection: AppConnection; config: ActivityStreamStabilityConfigV2 & Record<string, unknown>; confirmedLargeRun?: boolean }) => {
  if (activeStabilityProbe) throw new Error("Another Activity Stream Stability Probe is already running. / 另一個穩定性測試正在執行。");
  const source = payload.config;
  const roundExecutionMode = source.roundExecutionMode === "stop_when_stable" || source.roundExecutionMode === "force_all_rounds"
    ? source.roundExecutionMode
    : source.forceRunAllAttempts === true ? "force_all_rounds" : source.stopEarlyWhenStable === true ? "stop_when_stable" : "force_all_rounds";
  const config: ActivityStreamStabilityConfigV2 = {
    selectedUser: String(source.selectedUser || "").trim(),
    dateRange: source.dateRange,
    projectScope: String(source.projectScope || ""),
    requestWindow: source.requestWindow,
    fullScanRoundCount: Number(source.fullScanRoundCount ?? source.forcedRetryCount ?? 3),
    delayBetweenRoundsMs: Number(source.delayBetweenRoundsMs ?? source.retryDelayMs ?? 1000),
    mergeStrategy: source.mergeStrategy,
    roundExecutionMode
  };
  const windows = splitActivityStreamWindows(config.dateRange.start, config.dateRange.end, config.requestWindow.type, config.requestWindow.customDays ?? 7);
  const totalRequests = windows.length * config.fullScanRoundCount;
  if (totalRequests > 500 && payload.confirmedLargeRun !== true) throw new Error("CONFIRM_REQUIRED: More than 500 sequential requests require confirmation.");
  const probeRunId = `ASR-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = new Date().toISOString();
  const idleGapSeconds = lastActivityStreamQueryAt ? Math.max(0, Math.round((Date.parse(startedAt) - Date.parse(lastActivityStreamQueryAt)) / 1000)) : 0;
  const coldStartSuspected = !lastActivityStreamQueryAt || idleGapSeconds > 1800;
  const jiraConnectionSessionId = `jira-session:${sha256(String(payload.connection.baseUrl || "")).slice(0, 16)}`;
  activeStabilityProbe = { runId: probeRunId, cancelled: false };
  try {
    const run = await executeRoundFirstStability(config, {
      probeRunId,
      appSessionId,
      jiraConnectionSessionId,
      coldStartSuspected,
      shouldCancel: () => activeStabilityProbe?.cancelled === true,
      onProgress: (progress) => ipcEvent.sender.send("user-analysis:stability-probe-progress", progress),
      fetchWindow: async ({ roundNumber, roundId, windowNumber, windowId, start, end }) => {
        const runId = `${probeRunId}-${roundId}-${windowId}`;
        return fetchReliabilityWindow(payload.connection, config.selectedUser, start, end, runId, roundNumber, windowNumber);
      }
    });
    const requestLogs = run.windowDiagnostics.flatMap((window) => window.physicalRequests.map((request) => `[INFO][activity-stream] probeRunId=${run.probeRunId} roundNumber=${window.roundNumber} windowNumber=${window.windowNumber} logicalRequestId=${window.logicalRequestId} physicalRequestId=${request.physicalRequestId} stage=response_completed durationMs=${request.httpDurationMs} httpStatus=${request.httpStatus} classification=${window.classification}`));
    const files = writeRoundStabilityFiles(run);
    latestActivityStreamStabilityProbeV2 = { ...run, files };
    return { ...run, files, logs: [...requestLogs, "[INFO] Authorization: [masked]", "[INFO] Token: [masked]", "[INFO] No database write performed", "[INFO] No Jira write performed"], migrationWarning: source.forceRunAllAttempts === true && source.stopEarlyWhenStable === true ? "Legacy settings conflict; Force All Rounds was selected. / 舊設定衝突，已採用強制執行全部輪次。" : "" };
  } finally {
    activeStabilityProbe = null;
  }
});

function writeBenchmarkFiles(run: ActivityStreamBenchmarkRun) {
  const folderPath = ensureDir(path.join(getExportsDir(), "user-analysis", "activity-stream-benchmark", run.benchmarkRunId));
  const files = {
    json: path.join(folderPath, "activity-stream-benchmark.json"),
    csv: path.join(folderPath, "activity-stream-benchmark.csv"),
    summary: path.join(folderPath, "activity-stream-benchmark-summary.json")
  };
  writeJsonAtomic(files.json, { app: { version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__ }, ...run });
  fs.writeFileSync(files.csv, benchmarkCsv(run), "utf8");
  writeJsonAtomic(files.summary, { schemaVersion: "activity_stream_benchmark_summary_v1", benchmarkRunId: run.benchmarkRunId, status: run.status, config: run.config, summary: run.summary });
  return files;
}

ipcMain.handle("user-analysis:activity-stream-benchmark", async (ipcEvent, payload: { connection: AppConnection; config: ActivityStreamBenchmarkConfig }) => {
  if (activeActivityStreamBenchmark) throw new Error("Another benchmark is already running. / 另一個效能基準正在執行。");
  const config: ActivityStreamBenchmarkConfig = { selectedUser: String(payload.config.selectedUser || "").trim(), startDate: payload.config.startDate, endDate: payload.config.endDate, runs: Math.trunc(Number(payload.config.runs)), variant: "escaped_username", concurrency: 1 };
  const benchmarkRunId = `ASB-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  activeActivityStreamBenchmark = { runId: benchmarkRunId, cancelled: false };
  try {
    const run = await executeActivityStreamBenchmark(config, {
      benchmarkRunId,
      shouldCancel: () => activeActivityStreamBenchmark?.cancelled === true,
      onProgress: (progress) => ipcEvent.sender.send("user-analysis:activity-stream-benchmark-progress", progress),
      fetchSample: async (runNumber) => fetchReliabilityWindow(payload.connection, config.selectedUser, config.startDate, config.endDate, `${benchmarkRunId}-sample-${String(runNumber).padStart(2, "0")}`, runNumber, 1)
    });
    const files = writeBenchmarkFiles(run);
    latestActivityStreamBenchmark = { ...run, files };
    const requestLogs = run.samples.flatMap((sample) => sample.physicalRequests.map((request) => `[INFO][benchmark] benchmarkRunId=${benchmarkRunId} roundNumber=${sample.runNumber} windowNumber=1 logicalRequestId=${benchmarkRunId}-sample-${sample.runNumber} physicalRequestId=${request.physicalRequestId} stage=response_completed durationMs=${request.httpDurationMs} httpStatus=${request.httpStatus} classification=${sample.resultClassification}`));
    return { ...run, files, logs: [...requestLogs, `[INFO] benchmarkRunId=${benchmarkRunId} stage=completed durationMs=${Date.parse(run.completedAt) - Date.parse(run.startedAt)} classification=${run.status}`, `[INFO] Physical HTTP requests=${run.samples.reduce((sum, sample) => sum + sample.physicalHttpRequestCount, 0)}`, "[INFO] Variant: escaped_username", "[INFO] Authorization: [masked]", "[INFO] Token: [masked]", "[INFO] No database write performed", "[INFO] No Jira write performed"] };
  } finally {
    activeActivityStreamBenchmark = null;
  }
});

ipcMain.handle("user-analysis:cancel-activity-stream-benchmark", async () => {
  if (!activeActivityStreamBenchmark) return { ok: false, message: "No benchmark is running. / 目前沒有執行中的效能基準。" };
  activeActivityStreamBenchmark.cancelled = true;
  return { ok: true, benchmarkRunId: activeActivityStreamBenchmark.runId };
});

ipcMain.handle("user-analysis:cancel-activity-timeline", async () => {
  if (!activeTimelineBuild) return { ok: false, message: "No timeline build is running." };
  activeTimelineBuild.cancelled = true;
  return { ok: true, runId: activeTimelineBuild.runId };
});

ipcMain.handle("user-analysis:build-activity-timeline", async (ipcEvent, payload: { connection: AppConnection; runContext: ActivityTimelineRunContext }) => {
  const runContext = validateActivityTimelineRunContext(payload.runContext);
  const selectedUser = runContext.selectedUser;
  const timelineRunId = runContext.runId;
  const sourceRunId = `${runContext.runId}-activity-stream`;
  const requestWindow = runContext.requestWindow;
  const fullScanRoundCount = runContext.fullScanRounds;
  const delayBetweenRoundsMs = isUiSmoke ? 0 : runContext.delayBetweenRounds;
  const roundExecutionMode = runContext.roundExecutionMode;
  const mergeStrategy = runContext.mergeStrategy;
  const config: ActivityStreamStabilityConfigV2 = { selectedUser, dateRange: { start: runContext.effectiveStartDate, end: runContext.effectiveEndDate }, projectScope: "", requestWindow, fullScanRoundCount, delayBetweenRoundsMs, mergeStrategy, roundExecutionMode };
  const runLogs: string[] = [
    `[INFO] Timeline Run Context: sessionId=${runContext.sessionId} runId=${runContext.runId} selected=${runContext.selectedStartDate}..${runContext.selectedEndDate} effective=${runContext.effectiveStartDate}..${runContext.effectiveEndDate}`,
    `[INFO] Timeline request windows: ${runContext.requestWindows.map((window) => `${window.start}..${window.end}`).join(",")}`,
    `[INFO] Timeline round settings: requestWindow=${requestWindow.type} fullScanRoundCount=${fullScanRoundCount} roundExecutionMode=${roundExecutionMode} mergeStrategy=${mergeStrategy}`,
    "[INFO] Round-first execution; concurrency=1"
  ];
  let lastRun: Awaited<ReturnType<typeof runActivityStreamProbe>> | null = null;
  activeTimelineBuild = { runId: timelineRunId, cancelled: false };
  const jiraConnectionSessionId = `jira-session:${sha256(String(payload.connection.baseUrl || "")).slice(0, 16)}`;
  const roundRun = await executeRoundFirstStability(config, {
    probeRunId: sourceRunId,
    appSessionId,
    jiraConnectionSessionId,
    coldStartSuspected: !lastActivityStreamQueryAt || Date.now() - Date.parse(lastActivityStreamQueryAt) > 1_800_000,
    shouldCancel: () => activeTimelineBuild?.cancelled === true,
    onProgress: (progress) => ipcEvent.sender.send("user-analysis:activity-timeline-progress", progress),
    fetchWindow: async ({ roundNumber, roundId, windowNumber, windowId, start, end }) => {
      const fetched = await fetchReliabilityWindow(payload.connection, selectedUser, start, end, `${sourceRunId}-${roundId}-${windowId}`, roundNumber, windowNumber);
      lastRun = fetched.sourceRun;
      if (fetched.sourceRun) runLogs.push(...fetched.sourceRun.logs, `[INFO] Timeline ${roundId} ${windowId}: events=${fetched.entries.length} status=${fetched.classification}`);
      return fetched;
    }
  }).finally(() => { activeTimelineBuild = null; });
  const completedRun = lastRun as Awaited<ReturnType<typeof runActivityStreamProbe>> | null;
  if (!completedRun) throw new Error("Activity Stream returned no completed request.");
  const entries = roundRun.mergedEvents.map((entry) => entry.raw as unknown as ActivityStreamEntry);
  const sourceIssueKeys = Array.from(new Set(entries.flatMap((entry) => entry.extractedIssueKeysPerEntry))).sort();
  const run = { ...completedRun, runId: sourceRunId, logs: [...completedRun.logs, ...runLogs], activityStream: { ...completedRun.activityStream, runId: sourceRunId, entriesSanitized: entries, parsedActivityCount: entries.length, parsedIssueKeys: sourceIssueKeys, activityStreamIssueKeys: sourceIssueKeys } };
  const comparison: ActivityStreamBaselineComparison = { enabled: true, baselineFound: false, snapshotKey: `stability:${sourceRunId}`, classification: "stability_probe_merged", confidence: "high", shouldRetry: false, retryReason: "", baselineCounts: { bestAtomEntryCount: entries.length, bestParsedActivityCount: entries.length, bestIssueKeyCount: sourceIssueKeys.length, bestEntryFingerprintCount: entries.length }, currentCounts: { atomEntryCount: entries.length, parsedActivityCount: entries.length, issueKeyCount: sourceIssueKeys.length, entryFingerprintCount: entries.length }, missingIssueKeys: [], missingEntryFingerprints: [], newIssueKeys: [], newEntryFingerprints: [], baselineUpdated: false, baselineUpdateReason: "formal_timeline_stability_merge", baselinePath: "" };
  const retry: BaselineGuardRetrySummary = { triggered: fullScanRoundCount > 1, maxRetries: fullScanRoundCount - 1, attempts: [], finalAcceptedRunId: sourceRunId, finalClassification: "stability_probe_merged", baselineUpdated: false, retryRecovered: false };
  const guardedRun = { baselineSnapshot: { knownEntryFingerprints: entries.map((entry) => entry.entryFingerprint) } } as { baselineSnapshot: ActivityStreamBaselineSnapshot };
  const builtAt = new Date().toISOString();
  const timeline = buildUserActivityTimeline({
    timelineRunId,
    builtAt,
    selectedUser,
    dateRange: { start: runContext.effectiveStartDate, end: runContext.effectiveEndDate },
    projectScope: "",
    sourceRunId: run.runId,
    sourceParsedActivityCount: run.activityStream.parsedActivityCount,
    sourceIssueKeys: run.activityStream.activityStreamIssueKeys,
    activityStreamQueryUser: run.standardActivityStreamFlow.activityStreamQueryUser,
    entries,
    baseline: {
      classification: retry.finalClassification || comparison.classification,
      retryTriggered: retry.triggered,
      retryRecovered: retry.retryRecovered,
      baselineBestParsedActivityCount: comparison.baselineCounts.bestParsedActivityCount,
      currentParsedActivityCount: comparison.currentCounts.parsedActivityCount,
      knownEntryFingerprints: guardedRun.baselineSnapshot.knownEntryFingerprints
    }
  });
  const folderPath = ensureDir(path.join(getExportsDir(), "user-analysis", "timeline"));
  const suffix = `${fileTimestamp()}_${timelineRunId}`;
  const jsonPath = path.join(folderPath, `user-activity-timeline-${suffix}.json`);
  const csvPath = path.join(folderPath, `user-activity-timeline-${suffix}.csv`);
  const summaryPath = path.join(folderPath, `timeline-build-summary-${suffix}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(sanitizeExportData({ app: { version: __MAIN_APP_VERSION__, gitCommit: __MAIN_GIT_COMMIT__ }, ...timeline }), null, 2)}\n`, "utf8");
  fs.writeFileSync(csvPath, timelineCsv(timeline.events), "utf8");
  fs.writeFileSync(summaryPath, `${JSON.stringify(sanitizeExportData(timeline.summary), null, 2)}\n`, "utf8");
  latestUserActivityTimeline = { ...timeline, exportedFiles: { jsonPath, csvPath, summaryPath } };
  timelineRunResults.set(timelineRunId, latestUserActivityTimeline);
  const completedRoundCount = roundRun.rounds.filter((round) => round.status === "completed").length;
  timelineEligibilityRuns.set(timelineRunId, {
    timelineRunId,
    status: roundRun.status === "cancelled" ? "cancelled" : roundRun.status === "failed" ? "failed" : completedRoundCount === fullScanRoundCount ? "completed" : "partial",
    selectedUser,
    dateRange: { start: runContext.effectiveStartDate, end: runContext.effectiveEndDate },
    serverIdentity: sha256(String(payload.connection.baseUrl || "")).slice(0, 24),
    roundExecutionMode,
    mergeStrategy,
    expectedRoundCount: fullScanRoundCount,
    completedRoundCount,
    mergedEventCount: roundRun.mergedEvents.length,
    reconciliationStatus: timeline.summary.eventCountReconciliation.status,
    canonicalCompleted: roundRun.status === "completed" && completedRoundCount === fullScanRoundCount && roundRun.mergedEvents.length > 0 && timeline.summary.eventCountReconciliation.status === "reconciled",
    completedAt: roundRun.completedAt
  });
  const integrityLogs = timeline.summary.integrity.warnings.map((warning) => `[WARN] ${warning}`);
  return { ...timeline, runContext, exportedFiles: { jsonPath, csvPath, summaryPath }, roundStability: roundRun, activityStream: run.activityStream, standardActivityStreamFlow: run.standardActivityStreamFlow, logs: [...run.logs, ...runLogs, `[INFO] User Activity Timeline built: timelineRunId=${timelineRunId} totalEvents=${timeline.summary.totalEvents}`, `[INFO] Timeline integrity: source=${timeline.summary.integrity.sourceParsedActivityCount} events=${timeline.summary.integrity.timelineEventCount} dedup=${timeline.summary.integrity.deduplicatedEntryCount} skipped=${timeline.summary.integrity.skippedEntryCount} unexplained=${timeline.summary.eventCountReconciliation.unexplainedDifferenceCount}`, ...integrityLogs, `[INFO] Timeline JSON auto-saved: ${jsonPath}`, `[INFO] Timeline CSV auto-saved: ${csvPath}`, "[INFO] No database write performed", "[INFO] No Jira write performed"] };
});

const sensitiveReplayQueryKey = /token|password|passwd|secret|session|cookie|authorization|auth_token/i;

function validateManualActivityStreamUrl(baseUrl: string, input: string) {
  const diagnostics = { manualUrlProvided: Boolean(input.trim()), manualUrlAccepted: false, rejectReason: "", requestUrlSanitized: "" };
  if (!diagnostics.manualUrlProvided) return { diagnostics: { ...diagnostics, rejectReason: "empty_url" }, pathName: "" };
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(input.trim(), base);
    if (!/^https?:$/.test(candidate.protocol)) return { diagnostics: { ...diagnostics, rejectReason: "invalid_scheme" }, pathName: "" };
    if (candidate.origin !== base.origin) return { diagnostics: { ...diagnostics, rejectReason: "external_origin" }, pathName: "" };
    if (candidate.pathname !== "/plugins/servlet/streams") return { diagnostics: { ...diagnostics, rejectReason: "invalid_path" }, pathName: "" };
    if (Array.from(candidate.searchParams.keys()).some((key) => sensitiveReplayQueryKey.test(key))) return { diagnostics: { ...diagnostics, rejectReason: "sensitive_query_key" }, pathName: "" };
    const pathName = `${candidate.pathname}${candidate.search}`;
    assertReadOnlyRequest("GET", pathName);
    return { diagnostics: { ...diagnostics, manualUrlAccepted: true, requestUrlSanitized: pathName }, pathName };
  } catch (error) {
    return { diagnostics: { ...diagnostics, rejectReason: error instanceof ReadOnlyViolationError ? "query_not_allowed" : "invalid_url" }, pathName: "" };
  }
}

ipcMain.handle("user-analysis:activity-stream-manual-replay", async (_event, payload: { connection: AppConnection; manualUrl: string; runId?: string }) => {
  const runId = payload.runId || createActivityStreamRunId();
  const startedAt = new Date().toISOString();
  const validated = validateManualActivityStreamUrl(payload.connection.baseUrl, String(payload.manualUrl || ""));
  const logs = ["[USER_ACTION] Button clicked: Run Manual URL Replay / 執行手動 URL 重放", "[INFO] Authorization: [masked]", "[INFO] Token: [masked]"];
  if (!validated.diagnostics.manualUrlAccepted) {
    logs.push(`[WARN] Manual URL replay rejected: reason=${validated.diagnostics.rejectReason}`, "[INFO] No database write performed", "[INFO] No Jira write performed");
    return { ok: false, runId, startedAt, completedAt: new Date().toISOString(), manualUrlReplayDiagnostics: validated.diagnostics, variantResult: null, logs };
  }
  logs.push("[INFO] Manual URL replay accepted: path=/plugins/servlet/streams", `[DEBUG] GET ${validated.pathName} (credentials masked)`);
  const response = isUiSmoke
    ? { ok: true, status: 200, contentType: "application/atom+xml;charset=UTF-8", json: null, bodyTextSanitized: `<feed><entry><title type="html">Smoke User created a link from <a href="/browse/COPGEN1-138930" class="issue-link">COPGEN1-138930</a></title><author><name>謝正洪(roger_hsieh)</name><email>roger_hsieh@phison.com</email><usr:username>roger_hsieh</usr:username></author><published>2026-07-09T05:36:18.000Z</published><updated>2026-07-09T05:36:18.000Z</updated><activity:object><title type="text">COPGEN1-138930</title><summary type="text">[JACKSONQLC-3024] IOFULLSEQWRT Failure</summary></activity:object></entry></feed>`, bodyPreview: "" } as JiraHttpResult
    : await createJiraClient({ baseUrl: payload.connection.baseUrl, email: payload.connection.email || payload.connection.username, apiToken: payload.connection.apiToken ?? "", authType: payload.connection.authType }).get(validated.pathName);
  const variantResult = activityStreamResult(response, validated.pathName, "manual", "manual_url", runId);
  const activityStream = { ...aggregateActivityStream([variantResult], "manual"), manualReplay: { enabled: true, status: variantResult.status, requestUrlSanitized: validated.pathName } };
  logs.push(`${variantResult.parsed ? "[INFO]" : "[WARN]"} Manual URL replay completed: httpStatus=${variantResult.httpStatus} atomEntryCount=${variantResult.atomEntryCount} parsedIssueKeys=${variantResult.parsedIssueKeys.length} diagnosis=${variantResult.diagnosis}`, "[INFO] No database write performed", "[INFO] No Jira write performed");
  return { ok: variantResult.parsed, runId, startedAt, completedAt: new Date().toISOString(), manualUrlReplayDiagnostics: validated.diagnostics, variantResult, activityStream, logs };
});

ipcMain.handle("user-analysis:precision-probe", async (_event, payload: {
  connection: AppConnection;
  selectedUsers: string[];
  startInclusive: string;
  endExclusive: string;
  projectScope: string;
  activityStreamUser?: string;
  activityStreamQueryMode?: ActivityStreamQueryMode;
  activityStreamRelativeLinks?: boolean;
  activityStreamRunId?: string;
  activityStreamEndInclusive?: string;
  activityStreamDateQueryMode?: ActivityStreamDateQueryMode;
  activityStreamChunkingMode?: ActivityStreamChunkingMode;
  activityStreamCustomChunkDays?: number;
  maxResults: number;
  maxResultsSource?: "custom" | "quick";
  largeMaxResultsConfirmed?: boolean;
  standardFlow?: boolean;
  advancedOverrideUsed?: boolean;
  broadJql: string;
}) => {
  const selectedUsers = Array.from(new Set((payload.selectedUsers ?? []).map(String).map((item) => item.trim()).filter(Boolean)));
  const requestedMaxResults = Math.trunc(Number(payload.maxResults));
  if (requestedMaxResults < 1 || requestedMaxResults > 65535) throw new Error("maxResults must be between 1 and 65535. / maxResults 必須介於 1 到 65535。");
  const requestMaxResults = requestedMaxResults;
  const connection = payload.connection;
  const apiPrefix = connection.apiVersion === "v3" ? "/rest/api/3" : "/rest/api/2";
  const logs = [
    `[INFO] Precision Probe started: users=${selectedUsers.length} date=${payload.startInclusive}..${payload.endExclusive} project=${payload.projectScope || "all"}`,
    `[INFO] Probe Max Results: ${requestedMaxResults}${requestedMaxResults === 0 ? " (Jira request fallback maxResults=1)" : ""}`,
    "[INFO] Authorization: [masked]",
    "[INFO] Token: [masked]",
    "[INFO] Read-only GET requests only"
  ];

  if (isUiSmoke) {
    const activityStreamRun = await runActivityStreamProbe(connection, selectedUsers, payload.activityStreamUser || "smoke.user@example.com", payload.activityStreamQueryMode ?? "auto", payload.startInclusive, payload.activityStreamEndInclusive ?? addIsoDays(payload.endExclusive, -1), requestedMaxResults, payload.activityStreamRelativeLinks !== false, payload.activityStreamRunId, payload.activityStreamDateQueryMode ?? "both", payload.maxResultsSource ?? "custom", payload.largeMaxResultsConfirmed === true, payload.activityStreamChunkingMode ?? "auto", Number(payload.activityStreamCustomChunkDays ?? 14), payload.standardFlow === true, payload.advancedOverrideUsed === true);
    const activityStream = activityStreamRun.activityStream;
    const results: PrecisionProbeResult[] = [
      { method: "updatedBy Candidate JQL", status: "success", httpStatus: "200", supported: "yes", resultCount: 113, sampleIssueKeys: ["SMOKE-101", "SMOKE-102"], candidateSource: "updatedBy_candidate", error: "", recommendation: "Potential precision source; validate against Activity Stream", jql: "updatedBy(\"smoke.user\") ..." },
      { method: "status CHANGED BY", status: "success", httpStatus: "200", supported: "yes", resultCount: 1, sampleIssueKeys: ["SMOKE-102"], candidateSource: "status_changed_by", error: "", recommendation: "Can be used as supplemental precision source" },
      { method: "assignee CHANGED BY", status: "unsupported", httpStatus: "400", supported: "no", resultCount: 0, sampleIssueKeys: [], candidateSource: "assignee_changed_by", error: "JQL syntax is not supported", recommendation: "Unsupported in this Jira environment" },
      { method: "priority CHANGED BY", status: "success", httpStatus: "200", supported: "yes", resultCount: 0, sampleIssueKeys: [], candidateSource: "priority_changed_by", error: "", recommendation: "Can be used as supplemental precision source" },
      { method: "Activity Stream", status: "success", httpStatus: "200", supported: "yes", resultCount: 1, sampleIssueKeys: ["SMOKE-101"], candidateSource: "activity_stream", error: "", recommendation: "Preferred actual activity validation source", contentType: "application/atom+xml" },
      { method: "Broad Candidate Baseline", status: "success", httpStatus: "200", supported: "yes", resultCount: 93, sampleIssueKeys: ["SMOKE-101", "SMOKE-102"], candidateSource: "broad_role_baseline", error: "", recommendation: "Fallback only" }
    ];
    const issueKeySets = { activityStreamIssueKeys: ["SMOKE-101"], manualActivityStreamIssueKeys: [], updatedByCandidateIssueKeys: ["SMOKE-101", "SMOKE-102"], changedByIssueKeys: ["SMOKE-102"], broadBaselineIssueKeys: ["SMOKE-101", "SMOKE-102"], recommendedIssueKeys: ["SMOKE-101"] };
    logs.push(...activityStreamRun.logs, "[DEBUG] Precision Probe updatedBy variant fallback validated", "[WARN] Precision Probe assignee CHANGED BY unsupported: httpStatus=400 error=JQL syntax is not supported", "[WARN] updatedBy differs from Activity Stream: updatedByCount=113 activityStreamIssueCount=1", "[INFO] Precision Probe recommendation: activity_stream", "[INFO] No database write performed");
    return {
      ok: true,
      status: "partial",
      results,
      summary: { overallStatus: "partial", updatedBySupported: "yes", activityStreamSupported: "yes", changedBySupported: "partial", broadCandidateCount: 93, uniquePreciseIssueCount: 2, potentialFullFetchReductionPercent: 97.8, recommendedStage1Mode: "activity_stream" },
      activityStream,
      dateSemantics: activityStreamRun.dateSemantics,
      dateQueryResults: activityStreamRun.dateQueryResults,
      maxResultsDiagnostics: activityStreamRun.maxResultsDiagnostics,
      dateRangeChunking: activityStreamRun.dateRangeChunking,
      activityStreamChunkResults: activityStreamRun.activityStreamChunkResults,
      chunkMergeStats: activityStreamRun.chunkMergeStats,
      clientDateFilteredEntriesSanitized: activityStreamRun.clientDateFilteredEntriesSanitized,
      standardActivityStreamFlow: activityStreamRun.standardActivityStreamFlow,
      advancedDiagnosticsUsed: activityStreamRun.advancedDiagnosticsUsed,
      activityTypeClassifierDiagnostics: activityStreamRun.activityTypeClassifierDiagnostics,
      issueKeySets,
      uniquePreciseIssueKeys: issueKeySets.recommendedIssueKeys,
      issueSources: { "SMOKE-101": ["activity_stream"] },
      warnings: ["updatedBy result count differs from Activity Stream parsed issue count. Do not treat updatedBy as exact user activity without validation. / updatedBy 結果數與 Activity Stream 解析 Jira 數差異較大，請勿直接把 updatedBy 視為精準使用者活動。"], errors: [], logs
    };
  }

  const client = createJiraClient({ baseUrl: connection.baseUrl, email: connection.email || connection.username, apiToken: connection.apiToken ?? "", authType: connection.authType });
  const fields = "key";

  async function search(jql: string) {
    const finalJql = scopedJql(jql, payload.projectScope || "");
    logs.push(`[DEBUG] Precision Probe JQL: ${finalJql}`);
    const pathName = `${apiPrefix}/search?jql=${encodeURIComponent(finalJql)}&fields=${fields}&startAt=0&maxResults=${requestMaxResults}`;
    const response = await client.get(pathName);
    const json = asRecord(response.json);
    const issues = Array.isArray(json.issues) ? json.issues as Record<string, unknown>[] : [];
    const keys = issues.map((issue) => text(issue.key)).filter((key) => key !== "-");
    return { response, finalJql, keys, total: Number(json.total ?? keys.length) || keys.length };
  }

  async function runJqlMethod(method: string, source: string, build: (user: string) => string, fallback?: (user: string) => string): Promise<PrecisionProbeResult> {
    const keys = new Set<string>();
    let total = 0;
    let success = 0;
    const failures: Array<{ status: number | "-"; error: string }> = [];
    let lastJql = "";
    for (const user of selectedUsers) {
      let attempt = await search(build(user));
      if (!attempt.response.ok && fallback) {
        logs.push(`[WARN] Precision Probe ${method} primary syntax failed: httpStatus=${attempt.response.status}; trying variant`);
        attempt = await search(fallback(user));
      }
      lastJql = attempt.finalJql;
      if (attempt.response.ok) {
        success += 1;
        total += attempt.total;
        attempt.keys.forEach((key) => keys.add(key));
      } else {
        failures.push({ status: attempt.response.status, error: precisionError(attempt.response) });
      }
    }
    const unsupported = success === 0 && failures.length > 0 && failures.every((item) => item.status === 400 || item.status === 404);
    const status = success > 0 && failures.length > 0 ? "partial" : success > 0 ? "success" : unsupported ? "unsupported" : "failed";
    const supported = success > 0 ? "yes" : unsupported ? "no" : "unknown";
    const httpStatus = success > 0 ? (failures.length ? "200 / mixed" : "200") : String(failures[0]?.status ?? "-");
    const error = failures.map((item) => item.error).join("; ");
    logs.push(`${status === "unsupported" || status === "failed" ? "[WARN]" : "[INFO]"} Precision Probe ${method} completed: status=${status} httpStatus=${httpStatus} count=${total}${error ? ` error=${error}` : ""}`);
    return { method, status, httpStatus, supported, resultCount: total, sampleIssueKeys: Array.from(keys).slice(0, requestedMaxResults || 0), candidateSource: source, error, recommendation: source === "updatedBy_candidate" && supported === "yes" ? "Potential precision source; validate against Activity Stream" : supported === "yes" ? "Can be used as supplemental precision source" : supported === "no" ? "Unsupported in this Jira environment" : "Fallback only", jql: lastJql };
  }

  const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  const dates = `AFTER "${payload.startInclusive}" BEFORE "${payload.endExclusive}" ORDER BY updated DESC`;
  const updatedDates = `AND updated >= "${payload.startInclusive}" AND updated < "${payload.endExclusive}" ORDER BY updated DESC`;
  const results: PrecisionProbeResult[] = [];
  results.push(await runJqlMethod("updatedBy Candidate JQL", "updatedBy_candidate", (user) => `updatedBy(${quoted(user)}) ${updatedDates}`, (user) => `issue in updatedBy(${quoted(user)}) ${updatedDates}`));
  results.push(await runJqlMethod("status CHANGED BY", "status_changed_by", (user) => `status CHANGED BY ${quoted(user)} ${dates}`));
  results.push(await runJqlMethod("assignee CHANGED BY", "assignee_changed_by", (user) => `assignee CHANGED BY ${quoted(user)} ${dates}`));
  results.push(await runJqlMethod("priority CHANGED BY", "priority_changed_by", (user) => `priority CHANGED BY ${quoted(user)} ${dates}`));

  const activityStreamUser = String(payload.activityStreamUser || selectedUsers[0] || "").trim();
  const activityStreamRun = await runActivityStreamProbe(connection, selectedUsers, activityStreamUser, payload.activityStreamQueryMode ?? "auto", payload.startInclusive, payload.activityStreamEndInclusive ?? addIsoDays(payload.endExclusive, -1), requestedMaxResults, payload.activityStreamRelativeLinks !== false, payload.activityStreamRunId, payload.activityStreamDateQueryMode ?? "both", payload.maxResultsSource ?? "custom", payload.largeMaxResultsConfirmed === true, payload.activityStreamChunkingMode ?? "auto", Number(payload.activityStreamCustomChunkDays ?? 14), payload.standardFlow === true, payload.advancedOverrideUsed === true);
  const activityStreamData = activityStreamRun.activityStream;
  logs.push(...activityStreamRun.logs);
  results.push({
    method: "Activity Stream",
    status: activityStreamData.status === "success" ? "success" : activityStreamData.status === "unsupported" ? "unsupported" : "failed",
    httpStatus: activityStreamData.httpStatus,
    supported: activityStreamData.supported as "yes" | "no" | "unknown",
    resultCount: activityStreamData.activityStreamIssueKeys.length,
    sampleIssueKeys: activityStreamData.activityStreamIssueKeys.slice(0, requestedMaxResults || 0),
    candidateSource: "activity_stream",
    error: activityStreamData.error,
    recommendation: activityStreamData.supported === "yes" ? "Preferred actual activity validation source" : activityStreamData.supported === "no" ? "Unsupported in this Jira environment" : "Activity Stream returned HTML, login page, or an unverified response",
    contentType: activityStreamData.contentType,
    rawSummary: activityStreamData.rawSummary
  });

  const baseline = await search(payload.broadJql);
  results.push({ method: "Broad Candidate Baseline", status: baseline.response.ok ? "success" : "failed", httpStatus: String(baseline.response.status), supported: baseline.response.ok ? "yes" : "unknown", resultCount: baseline.response.ok ? baseline.total : 0, sampleIssueKeys: baseline.keys.slice(0, requestedMaxResults || 0), candidateSource: "broad_role_baseline", error: baseline.response.ok ? "" : precisionError(baseline.response), recommendation: "Fallback only", jql: baseline.finalJql });

  const updatedBy = results[0];
  const activityStreamProbe = results[4];
  const changed = results.slice(1, 4);
  const broadCandidateCount = results[5].resultCount;
  const issueKeySets = {
    activityStreamIssueKeys: activityStreamData.activityStreamIssueKeys,
    manualActivityStreamIssueKeys: [] as string[],
    updatedByCandidateIssueKeys: updatedBy.sampleIssueKeys,
    changedByIssueKeys: Array.from(new Set(changed.flatMap((item) => item.sampleIssueKeys))).sort(),
    broadBaselineIssueKeys: results[5].sampleIssueKeys,
    recommendedIssueKeys: activityStreamData.activityStreamIssueKeys.length > 0 ? activityStreamData.activityStreamIssueKeys : []
  };
  const issueSources: Record<string, string[]> = {};
  for (const key of issueKeySets.recommendedIssueKeys) issueSources[key] = activityStreamData.activityStreamIssueKeys.includes(key) ? ["activity_stream"] : ["updatedBy_candidate"];
  const uniquePreciseIssueKeys = issueKeySets.recommendedIssueKeys;
  const changedSupported = changed.every((item) => item.supported === "yes") ? "yes" : changed.some((item) => item.supported === "yes") ? "partial" : changed.every((item) => item.supported === "no") ? "no" : "unknown";
  const recommendedStage1Mode = activityStreamData.parsed ? "activity_stream" : "no_activity_found";
  const failedCount = results.filter((item) => item.status === "failed" || item.status === "unsupported" || item.status === "partial").length;
  const overallStatus = failedCount === 0 ? "success" : failedCount < results.length ? "partial" : "failed";
  const reduction = broadCandidateCount > 0 ? Math.max(0, Math.round((1 - uniquePreciseIssueKeys.length / broadCandidateCount) * 1000) / 10) : null;
  const countDiffers = updatedBy.supported === "yes" && activityStreamProbe.supported === "yes" && Math.abs(updatedBy.resultCount - activityStreamProbe.resultCount) > Math.max(5, activityStreamProbe.resultCount * 0.5);
  const activityEmptyWarning = "updatedBy returned issues, but Activity Stream returned no entries. Treat updatedBy only as candidate source. / updatedBy 有結果，但 Activity Stream 沒有活動紀錄，請只把 updatedBy 當候選來源。";
  const differenceWarning = "updatedBy result count differs from Activity Stream parsed issue count. Do not treat updatedBy as exact user activity without validation. / updatedBy 結果數與 Activity Stream 解析 Jira 數差異較大，請勿直接把 updatedBy 視為精準使用者活動。";
  if (countDiffers) logs.push(`[WARN] updatedBy differs from Activity Stream: updatedByCount=${updatedBy.resultCount} activityStreamIssueCount=${activityStreamProbe.resultCount}`);
  if (updatedBy.resultCount > 0 && activityStreamData.diagnosis === "no_entries") logs.push(`[WARN] ${activityEmptyWarning}`);
  logs.push(`[INFO] Precision Probe recommendation: ${recommendedStage1Mode}`, "[INFO] No database write performed", "[INFO] No Jira write performed", "[INFO] No attachment body downloaded");
  return {
    ok: overallStatus !== "failed",
    status: overallStatus,
    results,
    summary: { overallStatus, updatedBySupported: updatedBy.supported, activityStreamSupported: activityStreamProbe.supported, changedBySupported: changedSupported, broadCandidateCount, uniquePreciseIssueCount: uniquePreciseIssueKeys.length, potentialFullFetchReductionPercent: reduction, recommendedStage1Mode },
    activityStream: activityStreamData,
    dateSemantics: activityStreamRun.dateSemantics,
    dateQueryResults: activityStreamRun.dateQueryResults,
    maxResultsDiagnostics: activityStreamRun.maxResultsDiagnostics,
    dateRangeChunking: activityStreamRun.dateRangeChunking,
    activityStreamChunkResults: activityStreamRun.activityStreamChunkResults,
    chunkMergeStats: activityStreamRun.chunkMergeStats,
    clientDateFilteredEntriesSanitized: activityStreamRun.clientDateFilteredEntriesSanitized,
    standardActivityStreamFlow: activityStreamRun.standardActivityStreamFlow,
    advancedDiagnosticsUsed: activityStreamRun.advancedDiagnosticsUsed,
    activityTypeClassifierDiagnostics: activityStreamRun.activityTypeClassifierDiagnostics,
    issueKeySets,
    uniquePreciseIssueKeys,
    issueSources,
    warnings: [...results.filter((item) => item.status === "unsupported" || item.status === "partial").map((item) => `${item.method}: ${item.error || item.status}`), ...(countDiffers ? [differenceWarning] : []), ...(updatedBy.resultCount > 0 && activityStreamData.diagnosis === "no_entries" ? [activityEmptyWarning] : [])],
    errors: results.filter((item) => item.status === "failed").map((item) => `${item.method}: ${item.error || item.status}`),
    logs
  };
});

function uniqueUserNames(values: unknown[]) {
  return Array.from(new Set(values.map(text).filter((item) => item && item !== "-"))).sort();
}

function countChangeItems(histories: Record<string, unknown>[]) {
  return histories.reduce((sum, history) => sum + (Array.isArray(history.items) ? history.items.length : 0), 0);
}

function buildFullFetchReport(issueKey: string, candidate: Record<string, unknown>, result: Record<string, unknown>, startedAt: number, status: "success" | "partial" | "failed", error = "") {
  const issue = asRecord(result.issue);
  const fields = asRecord(issue.fields);
  const histories = Array.isArray(result.changelogHistories) ? result.changelogHistories as Record<string, unknown>[] : [];
  const comments = Array.isArray(result.comments) ? result.comments as Record<string, unknown>[] : [];
  const attachments = Array.isArray(result.attachments) ? result.attachments as Record<string, unknown>[] : [];
  const links = Array.isArray(result.links) ? result.links as Record<string, unknown>[] : [];
  const parsedUsers = Array.isArray(result.parsedUsers) ? result.parsedUsers as string[] : [];
  const estimatedEvents = 1 + countChangeItems(histories) + comments.length + attachments.length + links.length;
  const queueMetadata = asRecord(candidate.queueMetadata);
  const sources = Array.isArray(queueMetadata.sources) ? queueMetadata.sources.map(text).filter(Boolean) : [];
  const matchedReasons = Array.isArray(queueMetadata.matchedReasons) ? queueMetadata.matchedReasons.map(text).filter(Boolean) : [];
  const numericStatus = Number(result.httpStatus);
  const httpStatus = Number.isFinite(numericStatus) && numericStatus > 0 ? numericStatus : null;
  const errorCode = status === "failed" ? (httpStatus ? `HTTP_${httpStatus}` : text(result.errorCode ?? result.errorType) || "UNKNOWN_ERROR") : status === "partial" ? text(result.errorCode) || "REQUIRED_DATA_INCOMPLETE" : "";
  const changelogMetadata = asRecord(result.changelogMetadata);
  const commentsMetadata = asRecord(result.commentsMetadata);
  return {
    issueKey,
    summary: text(fields.summary ?? candidate.summary),
    status: text(asRecord(fields.status).name ?? candidate.status),
    fetchStatus: status,
    httpStatus: httpStatus === null ? "-" : String(httpStatus),
    errorCode,
    stage: "issue_full_fetch",
    source: sources[0] ?? "manual",
    matchedReason: matchedReasons[0] ?? text(candidate.matchedReason) ?? "",
    retryCount: 0,
    occurredAt: status === "failed" ? new Date().toISOString() : "",
    changelogHistories: histories.length,
    changelogFetchedCount: Number(changelogMetadata.fetchedCount ?? histories.length),
    changelogTotal: typeof changelogMetadata.total === "number" ? changelogMetadata.total : null,
    changelogStatusCode: text(changelogMetadata.statusCode) || (status === "failed" ? "" : "CHANGELOG_INVALID"),
    changelogItems: countChangeItems(histories),
    comments: comments.length,
    commentsFetchedCount: Number(commentsMetadata.fetchedCount ?? comments.length),
    commentsTotal: typeof commentsMetadata.reportedTotal === "number" ? commentsMetadata.reportedTotal : null,
    partialReasons: Array.isArray(result.partialReasons) ? result.partialReasons : [],
    attachmentsMetadata: attachments.length,
    issueLinks: links.length,
    parsedUsers: parsedUsers.length,
    estimatedEvents,
    duration: `${Date.now() - startedAt}ms`,
    error,
    lastFetchedAt: formatLocalDateTime()
  };
}

function fullFetchFailureSummary(items: FullFetchFailedIssue[]) {
  const count = (values: Array<string | number | null>) => values.reduce<Record<string, number>>((result, value) => {
    const key = value === null || value === "" ? "unknown" : String(value);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  return { failedCount: items.length, byHttpStatus: count(items.map((item) => item.httpStatus)), byErrorCode: count(items.map((item) => item.errorCode)), byStage: count(items.map((item) => item.stage)), bySource: count(items.map((item) => item.source)) };
}

ipcMain.handle("user-analysis:full-fetch-preflight", async (_event, payload: { fetchQueue?: Record<string, unknown>[]; selectedTimelineRunId?: string; queueTimelineRunId?: string }) => {
  const requestedQueue = Array.isArray(payload.fetchQueue) ? payload.fetchQueue : [];
  const queuePreflight = preflightFullFetchQueue({ candidates: requestedQueue });
  const selectedTimelineRunId = text(payload.selectedTimelineRunId) === "-" ? "" : text(payload.selectedTimelineRunId);
  const queueTimelineRunId = text(payload.queueTimelineRunId) === "-" ? "" : text(payload.queueTimelineRunId);
  const eligibility = evaluateFullFetchEligibility({ selectedTimelineRunId, queueTimelineRunId, timelineRun: timelineEligibilityRuns.get(selectedTimelineRunId) ?? null });
  return {
    ok: eligibility.eligible && queuePreflight.ok,
    status: !eligibility.eligible ? eligibility.status : queuePreflight.ok ? "ELIGIBLE" : "QUEUE_INVALID",
    preflight: { ...eligibility, queue: queuePreflight },
    attempt: null
  };
});
ipcMain.handle("user-analysis:full-fetch", async (_event, payload: {
  connection: AppConnection; fetchQueue: Record<string, unknown>[];
  rawDataMode?: "auto_save_raw_per_issue"; selectedUser?: string; startDate?: string; endDate?: string;
  projectScope?: string; jql?: string; candidateIssues?: Record<string, unknown>[]; selectedIssues?: string[]; relatedIssuesStatus?: string;
  fetchRemoteLinks?: boolean; directIssueKeys?: string[]; selectedTimelineRunId?: string; queueTimelineRunId?: string;
}) => {
  if (activeFullFetch) throw new Error("A Full Fetch staging mutation is already active. / 已有 Full Fetch 暫存作業進行中。");
  const requestedQueue = Array.isArray(payload.fetchQueue) ? payload.fetchQueue : [];
  const queuePreflight = preflightFullFetchQueue({ candidates: requestedQueue });
  const selectedIssueKeysForAttempt = queuePreflight.accepted.map((item) => text(item.key)).filter(Boolean);
  const selectedTimelineRunId = text(payload.selectedTimelineRunId) === "-" ? "" : text(payload.selectedTimelineRunId);
  const queueTimelineRunId = text(payload.queueTimelineRunId) === "-" ? "" : text(payload.queueTimelineRunId);
  const eligibility = evaluateFullFetchEligibility({ selectedTimelineRunId, queueTimelineRunId, timelineRun: timelineEligibilityRuns.get(selectedTimelineRunId) ?? null });
  if (!eligibility.eligible) {
    return {
      ok: false,
      status: "PRE_FLIGHT_BLOCKED",
      preflight: eligibility,
      attempt: null,
      run: null,
      stagingSummary: null,
      summary: { queueTotal: queuePreflight.queueTotal, totalIssues: 0, attempted: 0, completed: 0, eligible: 0, excluded: queuePreflight.excludedCount, invalid: queuePreflight.invalidCount, partial: 0, failed: 0, notAttempted: 0, countReconciliation: "NOT_RUN", issueKeyReconciliation: "NOT_RUN", countReconciliationPassed: false, fullFetchRunCreated: false },
      logs: ["[ERROR] Full Fetch eligibility check failed.", "[INFO] No attempt, run, or staging was created."],
      errors: [eligibility.reasonMessage],
      warnings: []
    };
  }
  const preflight = queuePreflight;
  if (!preflight.ok) {
    return {
      ok: false,
      status: "PRE_FLIGHT_BLOCKED",
      preflight,
      attempt: null,
      run: null,
      stagingSummary: null,
      summary: { queueTotal: preflight.queueTotal, totalIssues: 0, attempted: 0, completed: 0, eligible: 0, excluded: preflight.excludedCount, invalid: preflight.invalidCount, partial: 0, failed: 0, notAttempted: 0, countReconciliation: "NOT_RUN", issueKeyReconciliation: "NOT_RUN", countReconciliationPassed: false, fullFetchRunCreated: false },
      logs: ["[ERROR] Preflight validation failed / 抓取前驗證失敗", "[INFO] No attempt, Full Fetch run, or staging was created."],
      errors: [preflight.message],
      warnings: [...preflight.excluded, ...preflight.invalid].map((item) => `${item.key || `(row ${item.index + 1})`}: ${item.reasonCode}`)
    };
  }
  const attempt = createFullFetchAttempt({ selectedTimelineRunId, queueTimelineRunId, selectedIssueKeys: selectedIssueKeysForAttempt, eligibility });
  fullFetchRunRegistry.registerAttempt(attempt);
  latestFullFetchAttempt = attempt;
  const connection = payload.connection;
  const apiPrefix = connection.apiVersion === "v3" ? "/rest/api/3" : "/rest/api/2";
  const selectedUser = text(payload.selectedUser) === "-" ? "" : text(payload.selectedUser);
  const startDate = text(payload.startDate) === "-" ? "" : text(payload.startDate);
  const endDate = text(payload.endDate) === "-" ? "" : text(payload.endDate);
  // Kept as an empty compatibility field in persisted run documents. Selection
  // is the explicit authorization for cross-project Full Fetch in v0.2.34.
  const projectScope = "";
  const fetchQueue = preflight.accepted;
  const stagingRoot = ensureDir(getFullFetchStagingDir());
  const runId = `full-fetch-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const generatedJql = text(payload.jql);
  const selectedIssues = Array.isArray(payload.selectedIssues) ? payload.selectedIssues.map(text).filter(Boolean) : fetchQueue.map((item) => text(item.key)).filter(Boolean);
  const fetchRemoteLinks = payload.fetchRemoteLinks === true;
  const relatedIssuesStatus = text(payload.relatedIssuesStatus) || "not_started";
  const originalDirectIssueKeys = Array.isArray(payload.directIssueKeys) ? payload.directIssueKeys.map(text).filter(Boolean) : [];
  const startedAt = new Date().toISOString();
  const queueSnapshot = createCanonicalQueueSnapshot(preflight, startedAt);
  const runStartedMs = Date.now();
  const rawDataMode = "auto_save_raw_per_issue" as const;
  const autoLogPath = path.join(ensureDir(getFullFetchLogsDir()), `full-fetch-${fileTimestamp()}.log`);
  fs.writeFileSync(autoLogPath, "", "utf8");
  const runtimeJira = getRuntimeCoordinator().snapshot().jira;
  const activeConnectionLabel = loadConnectionState().activeConnection.name;
  const sourceProvenance = runtimeJira.status === "CONNECTED"
    ? {
        sourceSystem: "jira" as const,
        serverIdentity: runtimeJira.serverIdentity,
        baseUrlNormalized: runtimeJira.baseUrlNormalized,
        serverTitle: runtimeJira.serverTitle,
        serverTitleStatus: runtimeJira.serverTitleStatus,
        connectionLabel: activeConnectionLabel
      }
    : { sourceSystem: "jira" as const, serverIdentity: "", baseUrlNormalized: "", serverTitle: "", serverTitleStatus: "unverified" as const, connectionLabel: activeConnectionLabel };
  const stagingRun = createStagingRun(stagingRoot, { runId, selectedUser, queue: fetchQueue, createdAt: startedAt, runContext: { attemptId: attempt.attemptId, selectedTimelineRunId, queueTimelineRunId, selectedUser, projectScope, dateRange: { start: startDate, end: endDate }, jql: generatedJql, selectedIssues, directIssueKeys: originalDirectIssueKeys, relatedIssuesStatus, fetchRemoteLinks, queueSnapshot, sourceProvenance } });
  const runningAttempt: FullFetchAttempt = { ...attempt, fullFetchRunCreated: true, fullFetchRunId: runId, stagingId: stagingRun.state.stagingId, attemptStatus: "running", stagingAvailable: true, stagingReference: { stagingId: stagingRun.state.stagingId, fullFetchRunId: runId, stagingDir: stagingRun.dir }, updatedAt: startedAt };
  fullFetchRunRegistry.registerAttempt(runningAttempt);
  latestFullFetchAttempt = runningAttempt;
  fullFetchRunRegistry.attachRun(runningAttempt, stagingRun.dir);
  latestFullFetchStaging = stagingRun;
  setStagingStatus(stagingRun, "running");
  const runManifestPath = stagingPaths(stagingRun).state;
  const logs: string[] = [];
  const issueStatus: Record<string, unknown>[] = [];
  const report: Record<string, unknown>[] = [];
  const issueResults: Record<string, unknown>[] = [];
  const attemptedIssueKeys: string[] = [];
  const relatedCandidateIssues: RelatedCandidateIssue[] = [];
  const warnings: string[] = [...preflight.excluded, ...preflight.invalid].map((item) => `${item.key || `(row ${item.index + 1})`}: ${item.reasonCode} - ${item.detail}`);
  const errors: string[] = [];
  const directIssueKeys = new Set(originalDirectIssueKeys.map((key) => key.toUpperCase()));
  const fullFetchedIssueKeys: string[] = [];
  const evidenceExcludedByReason: Record<string, number> = {};
  const evidenceTypeCounts: Record<string, number> = {};
  const activityTypeCounts: Record<string, number> = {};
  const issueEvidenceCounts: Record<string, { directEvidenceCount: number; contextEvidenceCount: number; activityTypes: string[] }> = {};
  let directEvidenceCount = 0; let contextEvidenceCount = 0; let relatedContextEvidenceCount = 0;
  let peakRssMB = 0; let peakHeapUsedMB = 0; let peakRawDataEstimateMB = 0;
  let aggregate = { totalChangelogHistories: 0, totalChangelogItems: 0, totalComments: 0, totalWorklogs: 0, worklogsComplete: 0, worklogsIncomplete: 0, worklogsPermissionRestricted: 0, worklogsUnsupported: 0, totalAttachmentsMetadata: 0, totalIssueLinks: 0, totalParsedUsers: 0, totalEstimatedEvents: 0 };
  activeFullFetch = { sessionId: appSessionId, runId, status: "running", queueCount: fetchQueue.length, currentIndex: 0, currentIssueKey: "", currentStage: "Issue Snapshot", lastCompletedIndex: 0, lastCompletedIssueKey: "", success: 0, partial: 0, failed: 0, skipped: 0, startedAtMs: runStartedMs, startedAt, updatedAt: startedAt, finishedAt: "", autoLogPath, runManifestPath, lastLogs: [], memory: memorySnapshot(), cancelRequested: false, stagingDir: stagingRun.dir };
  const log = (level: string, message: string) => {
    const rendererLine = `[${level}] ${maskDiagnosticText(message)}`;
    logs.push(rendererLine); if (logs.length > 500) logs.shift();
    if (activeFullFetch) activeFullFetch.lastLogs = logs.slice(-100);
    appendRuntimeLog(autoLogPath, level, message);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("user-analysis:full-fetch-log", { runId, line: rendererLine });
    }
  };
  const updateMemory = (context: string) => {
    const stagingBytes = previewStaging(stagingRun).stagingSizeBytes;
    const memory = memorySnapshot(stagingBytes);
    if (activeFullFetch) activeFullFetch.memory = memory;
    peakRssMB = Math.max(peakRssMB, memory.rssMB); peakHeapUsedMB = Math.max(peakHeapUsedMB, memory.heapUsedMB); peakRawDataEstimateMB = Math.max(peakRawDataEstimateMB, memory.rawDataEstimateMB);
    log("MEMORY", `${context} rss=${memory.rssMB}MB heapUsed=${memory.heapUsedMB}MB stagingBytes=${stagingBytes}`); return memory;
  };
  const progressPayload = () => {
    const active = activeFullFetch!; const elapsedMs = Date.now() - active.startedAtMs; const completed = active.success + active.partial + active.failed + active.skipped; const averageMsPerIssue = completed ? Math.round(elapsedMs / completed) : 0;
    return { sessionId: active.sessionId, runId, status: active.status, queueTotal: preflight.queueTotal, total: active.queueCount, planned: preflight.plannedCount, excluded: preflight.excludedCount, invalid: preflight.invalidCount, currentIndex: active.currentIndex, currentIssueKey: active.currentIssueKey, currentStage: active.currentStage, lastCompletedIndex: active.lastCompletedIndex, lastCompletedIssueKey: active.lastCompletedIssueKey, success: active.success, eligible: preflight.eligibleCount, partial: active.partial, failed: active.failed, skipped: active.skipped, notAttempted: active.skipped, elapsedMs, averageMsPerIssue, estimatedRemainingMs: averageMsPerIssue * Math.max(0, active.queueCount - completed), rawDataMode, memory: active.memory, autoLogPath, runManifestPath, issueStatus: issueStatus.map((item) => ({ ...item })), staging: previewStaging(stagingRun), cancelRequested: active.cancelRequested, startedAt: active.startedAt, updatedAt: active.updatedAt, finishedAt: active.finishedAt };
  };
  const sendProgress = (status = activeFullFetch?.status ?? "running") => {
    if (!activeFullFetch) return;
    activeFullFetch.status = status;
    activeFullFetch.updatedAt = new Date().toISOString();
    if (["completed", "completed_with_errors", "cancelled", "failed"].includes(status)) activeFullFetch.finishedAt = activeFullFetch.updatedAt;
    const payload = progressPayload();
    latestFullFetchRunSnapshot = payload;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("user-analysis:full-fetch-progress", payload);
    }
  };
  const client = createJiraClient({ baseUrl: connection.baseUrl, email: connection.email || connection.username, apiToken: connection.apiToken ?? "", authType: connection.authType });
  const getWithRetry = async (urlPath: string, issueKey: string, stage: string) => jiraGetWithRetry(() => client.get(urlPath), { onAttempt: ({ attempt, status, errorCode, waitMs }) => log(waitMs ? "WARN" : "DEBUG", `GET attempt=${attempt} issue=${issueKey} stage=${stage} status=${status} error=${errorCode} waitMs=${waitMs}`) });
  try {
    log("INFO", `Full Fetch started: runId=${runId} stagingId=${stagingRun.state.stagingId} queue=${fetchQueue.length}`);
    log("INFO", `Queue preflight: queueTotal=${preflight.queueTotal} eligible=${preflight.eligibleCount} excluded=${preflight.excludedCount} invalid=${preflight.invalidCount} planned=${preflight.plannedCount}`);
    log("INFO", `Staging Path: ${stagingRun.dir}`); log("INFO", "Raw mode: file-backed per-Issue canonical storage"); log("INFO", "Authorization: [masked]");
    updateMemory("Full Fetch started"); sendProgress();
    for (let queueIndex = 0; queueIndex < fetchQueue.length; queueIndex += 1) {
      if (activeFullFetch?.cancelRequested) break;
      const candidate = fetchQueue[queueIndex]; const issueKey = text(candidate.key).toUpperCase(); const issueStarted = Date.now();
      attemptedIssueKeys.push(issueKey);
      startTarget(stagingRun, issueKey);
      if (activeFullFetch) { activeFullFetch.currentIndex = queueIndex + 1; activeFullFetch.currentIssueKey = issueKey; activeFullFetch.currentStage = "Issue Snapshot"; }
      issueStatus.push({ index: queueIndex + 1, issueKey, status: "running", startedAt: new Date().toISOString() }); sendProgress();
      const targetEndpointMetadata: Record<string, unknown>[] = [];
      const issuePath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names,schema,renderedFields,changelog`;
      const issueAttempt = await getWithRetry(issuePath, issueKey, "issue"); const issue = issueAttempt.result;
      targetEndpointMetadata.push({ endpoint: issuePath, method: "GET", status: issue.status, contentType: issue.contentType, attempts: issueAttempt.attempts, required: true, fetchedAt: new Date().toISOString() });
      if (!issue.ok) {
        const message = `HTTP ${issue.status} ${issue.message ?? issue.errorType ?? ""}`.trim();
        completeTarget(stagingRun, issueKey, { status: "failed", classification: "issue_scoped_failure", errorType: jiraFailureCode(issue), errorMessage: message });
        const row = buildFullFetchReport(issueKey, candidate, { issue: {}, httpStatus: issue.status, changelogHistories: [], comments: [], attachments: [], links: [], parsedUsers: [] }, issueStarted, "failed", message);
        report.push({ ...row, retryCount: Math.max(0, issueAttempt.attempts - 1) }); issueResults.push({ issueKey, fetchStatus: "failed", error: message }); errors.push(`${issueKey}: ${message}`);
        if (activeFullFetch) { activeFullFetch.failed += 1; activeFullFetch.lastCompletedIndex = queueIndex + 1; activeFullFetch.lastCompletedIssueKey = issueKey; }
        issueStatus[issueStatus.length - 1] = { index: queueIndex + 1, issueKey, status: "failed", durationMs: Date.now() - issueStarted, error: message }; updateMemory(`after failed issue ${issueKey}`); sendProgress();
        if (activeFullFetch?.cancelRequested) break; continue;
      }
      const issueJson = asRecord(issue.json); const fields = asRecord(issueJson.fields);
      const embeddedChangelog = evaluateEmbeddedChangelog(issueJson.changelog);
      const changelogHistories = embeddedChangelog.histories;
      const commentMax = 100;
      const commentPageResult = await fetchJiraPages<Record<string, unknown>>({
        itemFields: ["comments"],
        pageSize: commentMax,
        fetchPage: async (startAt, maxResults) => getWithRetry(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${maxResults}`, issueKey, "comments")
      });
      const comments = commentPageResult.items;
      if (activeFullFetch) { activeFullFetch.currentStage = "Worklogs"; sendProgress(); }
      const worklogPageResult = await fetchJiraPages<Record<string, unknown>>({
        itemFields: ["worklogs"],
        pageSize: 100,
        fetchPage: async (startAt, maxResults) => getWithRetry(`/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog?startAt=${startAt}&maxResults=${maxResults}`, issueKey, "worklogs")
      });
      const normalizedWorklogs = normalizeWorklogs({ worklogs: worklogPageResult.items, issueId: text(issueJson.id), issueKey, sourceRunId: runId });
      const worklogs = normalizedWorklogs.records;
      const worklogCompleteness = classifyWorklogCompleteness(worklogPageResult.metadata, worklogPageResult.metadata.pages.map((page) => page.status), normalizedWorklogs.parseErrorCount);
      for (const page of commentPageResult.metadata.pages) targetEndpointMetadata.push({ endpoint: `${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?startAt=${page.startAt}&maxResults=${page.requestedMaxResults}`, method: "GET", status: page.status, contentType: page.contentType, attempts: page.attempts, required: true, fetchedAt: page.fetchedAt, pageNumber: page.pageNumber, returnedCount: page.returnedCount, reportedTotal: page.reportedTotal, errorCode: page.errorCode });
for (const page of worklogPageResult.metadata.pages) targetEndpointMetadata.push({ endpoint: `/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog?startAt=${page.startAt}&maxResults=${page.requestedMaxResults}`, method: "GET", status: page.status, contentType: page.contentType, attempts: page.attempts, required: true, fetchedAt: page.fetchedAt, pageNumber: page.pageNumber, returnedCount: page.returnedCount, reportedTotal: page.reportedTotal, errorCode: page.errorCode });
      const attachments = Array.isArray(fields.attachment) ? fields.attachment as Record<string, unknown>[] : [];
      const links = Array.isArray(fields.issuelinks) ? fields.issuelinks as Record<string, unknown>[] : [];
      let remoteLinks: unknown[] | null = null; let remoteLinkStatus: OptionalEndpointStatus = { enabled: fetchRemoteLinks, status: "not_attempted", archiveBlocking: false, retryable: false, warning: null, httpStatus: null, errorCode: "", attemptCount: 0, fetchedAt: null };
      if (fetchRemoteLinks) {
        const remotePath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}/remotelink`; const remoteAttempt = await getWithRetry(remotePath, issueKey, "remote_links"); const response = remoteAttempt.result;
        const fetchedAt = new Date().toISOString(); targetEndpointMetadata.push({ endpoint: remotePath, method: "GET", status: response.status, contentType: response.contentType, attempts: remoteAttempt.attempts, required: false, fetchedAt });
        if (response.ok && Array.isArray(response.json)) { remoteLinks = response.json; remoteLinkStatus = { enabled: true, status: "available", archiveBlocking: false, retryable: false, warning: null, httpStatus: response.status, errorCode: "", attemptCount: remoteAttempt.attempts, fetchedAt }; }
        else { const warning = `Remote Links optional request failed for ${issueKey}: HTTP ${response.status}.`; warnings.push(warning); const numericStatus = typeof response.status === "number" ? response.status : null; const status = numericStatus === 401 || numericStatus === 403 ? "permission_denied" : numericStatus === 400 || numericStatus === 404 ? "unsupported" : "temporarily_unavailable"; remoteLinkStatus = { enabled: true, status, archiveBlocking: false, retryable: false, warning, httpStatus: response.status, errorCode: jiraFailureCode(response), attemptCount: remoteAttempt.attempts, fetchedAt }; }
      }
      const parsedUsers = uniqueUserNames([fields.assignee, fields.reporter, fields.creator, ...changelogHistories.map((history) => asRecord(history).author), ...comments.map((comment) => asRecord(comment).author), ...worklogs.flatMap((worklog) => [asRecord(worklog).authorDisplayName, asRecord(worklog).updateAuthorDisplayName]), ...attachments.map((attachment) => asRecord(attachment).author)]);
      const changeItems = countChangeItems(changelogHistories); const estimatedEvents = 1 + changeItems + comments.length + worklogs.length + attachments.length + links.length;
      const queueMetadata = asRecord(candidate.queueMetadata); const queueSources = Array.isArray(queueMetadata.sources) ? queueMetadata.sources.map(text) : [];
      const directActivityIssue = directIssueKeys.has(issueKey) || queueSources.includes("activity_timeline"); if (directActivityIssue) directIssueKeys.add(issueKey);
      const relatedTimelineEventIds = Array.isArray(queueMetadata.timelineEventIds) ? queueMetadata.timelineEventIds.map(text).filter(Boolean) : [];
      const extractedEvidence = extractJiraEvidenceFromIssue({ selectedUser, startDate, endDate, issueKey, directActivityIssue, relatedTimelineEventIds, issue: issueJson, changelogHistories, comments, attachments, links, remoteLinks: (remoteLinks ?? []).map(asRecord) });
      for (const evidence of extractedEvidence.events) { evidenceTypeCounts[evidence.evidenceType] = (evidenceTypeCounts[evidence.evidenceType] ?? 0) + 1; activityTypeCounts[evidence.activityType] = (activityTypeCounts[evidence.activityType] ?? 0) + 1; const item = issueEvidenceCounts[issueKey] ?? { directEvidenceCount: 0, contextEvidenceCount: 0, activityTypes: [] }; if (evidence.evidenceScope === "direct") { item.directEvidenceCount += 1; directEvidenceCount += 1; } else { item.contextEvidenceCount += 1; if (evidence.evidenceScope === "related_context") relatedContextEvidenceCount += 1; else contextEvidenceCount += 1; } if (!item.activityTypes.includes(evidence.activityType)) item.activityTypes.push(evidence.activityType); issueEvidenceCounts[issueKey] = item; }
      for (const [reason, count] of Object.entries(extractedEvidence.excluded.byReason)) evidenceExcludedByReason[reason] = (evidenceExcludedByReason[reason] ?? 0) + count;
      fullFetchedIssueKeys.push(issueKey);
      const failedEndpoints = targetEndpointMetadata.filter((item) => item.required !== false && !(Number(item.status) >= 200 && Number(item.status) < 300)).map((item) => text(item.endpoint));
      const missingSections = Array.from(new Set([...failedEndpoints.map((endpoint) => endpoint.includes("comment") ? "comments" : "issue"), ...(!embeddedChangelog.metadata.paginationComplete ? ["changelog"] : []), ...(!commentPageResult.metadata.paginationComplete ? ["comments"] : []), ...(worklogCompleteness.status !== "complete" ? ["worklogs"] : [])]));
      const commentPartialReasons = commentPageResult.metadata.paginationComplete ? [] : [{ component: "comments", code: commentPageResult.metadata.errorCode || "COMMENTS_INCOMPLETE", fetchedCount: commentPageResult.metadata.fetchedCount, expectedTotal: commentPageResult.metadata.reportedTotal, message: `Observed ${commentPageResult.metadata.fetchedCount} of ${commentPageResult.metadata.reportedTotal} comments.` }];
      const worklogPartialReasons = worklogCompleteness.status === "complete" ? [] : [{ component: "worklogs", code: `WORKLOGS_${worklogCompleteness.status.toUpperCase()}`, fetchedCount: worklogCompleteness.uniqueWorklogCount, expectedTotal: worklogCompleteness.reportedTotal, message: `Worklogs ${worklogCompleteness.status}: ${worklogCompleteness.uniqueWorklogCount} of ${worklogCompleteness.reportedTotal ?? "unknown"}.` }];
      const partialReasons = [...embeddedChangelog.partialReasons, ...commentPartialReasons, ...worklogPartialReasons];
      const stagedTarget = completeTarget(stagingRun, issueKey, { status: missingSections.length ? "partial" : "eligible", rawEnvelope: { issue: issueJson, changelogHistories, comments, worklogs, worklogCompleteness, attachments, parsedUsers, evidenceEvents: extractedEvidence.events, issueLinks: links, remoteLinks, endpointMetadata: targetEndpointMetadata, requestMetadata: { apiVersion: connection.apiVersion, executionMode: "sequential_read_only", fetchedAt: new Date().toISOString(), fetchRemoteLinks, expandedChangelogObservedCount: embeddedChangelog.metadata.fetchedCount, embeddedChangelogAuthoritative: true, changelogStatusCode: embeddedChangelog.metadata.statusCode }, paginationMetadata: { comments: { ...commentPageResult.metadata, complete: commentPageResult.metadata.paginationComplete }, worklogs: { ...worklogPageResult.metadata, complete: worklogPageResult.metadata.paginationComplete }, changelog: embeddedChangelog.metadata }, completenessMetadata: { requiredMissingSections: missingSections, partialReasons, optionalWarningCount: remoteLinkStatus.warning ? 1 : 0 } }, missingSections, partialReasons, failedEndpoints, optionalEndpointStatus: { remoteLinks: remoteLinkStatus }, optionalWarnings: remoteLinkStatus.warning ? [remoteLinkStatus.warning] : [], classification: missingSections.length ? "partial" : remoteLinkStatus.warning ? "eligible_optional_warning" : "complete", errorType: missingSections.length ? "REQUIRED_DATA_INCOMPLETE" : "", errorMessage: missingSections.length ? partialReasons.map((item) => `${item.component}:${item.code}`).join(", ") || `Required sections incomplete: ${missingSections.join(", ")}` : "" });
      const resultForReport = { issue: issueJson, httpStatus: issue.status, changelogHistories, changelogMetadata: embeddedChangelog.metadata, comments, commentsMetadata: commentPageResult.metadata, worklogs, worklogsMetadata: worklogCompleteness, attachments, links, parsedUsers, estimatedEvents, partialReasons };
      const eligible = stagedTarget.status === "eligible";
      const reportError = eligible ? "" : stagedTarget.lastError || `Required sections incomplete: ${missingSections.join(", ")}`;
      const reportRow = buildFullFetchReport(issueKey, candidate, resultForReport, issueStarted, eligible ? "success" : "partial", reportError); report.push(reportRow);
      issueResults.push({ issueKey, fetchStatus: stagedTarget.status === "eligible" ? "success" : "partial", status: stagedTarget.status, partialReasons: stagedTarget.partialReasons, changelog: embeddedChangelog.metadata, comments: { fetchedCount: commentPageResult.metadata.fetchedCount, total: commentPageResult.metadata.reportedTotal, paginationComplete: commentPageResult.metadata.paginationComplete }, worklogs: worklogCompleteness, sizeBytes: stagedTarget.sizeBytes, snapshotFetchedAt: stagedTarget.snapshotFetchedAt, currentIssueSnapshotRef: stagedTarget.currentIssueSnapshotRef, normalizedCurrentFieldsRef: stagedTarget.normalizedCurrentFieldsRef, issueManifestRef: stagedTarget.issueManifestRef, canonicalFiles: stagedTarget.canonicalFiles, coverage: stagedTarget.coverage });
      relatedCandidateIssues.push(...extractRelatedIssues({ issueKey, issue: issueJson, changelogHistories, links, remoteLinks: remoteLinks ?? [], observedAt: new Date().toISOString() }));
      aggregate = { totalChangelogHistories: aggregate.totalChangelogHistories + changelogHistories.length, totalChangelogItems: aggregate.totalChangelogItems + changeItems, totalComments: aggregate.totalComments + comments.length, totalWorklogs: aggregate.totalWorklogs + worklogs.length, worklogsComplete: aggregate.worklogsComplete + (worklogCompleteness.status === "complete" ? 1 : 0), worklogsIncomplete: aggregate.worklogsIncomplete + (["incomplete", "failed"].includes(worklogCompleteness.status) ? 1 : 0), worklogsPermissionRestricted: aggregate.worklogsPermissionRestricted + (worklogCompleteness.status === "permission_restricted" ? 1 : 0), worklogsUnsupported: aggregate.worklogsUnsupported + (worklogCompleteness.status === "unsupported" ? 1 : 0), totalAttachmentsMetadata: aggregate.totalAttachmentsMetadata + attachments.length, totalIssueLinks: aggregate.totalIssueLinks + links.length, totalParsedUsers: aggregate.totalParsedUsers + parsedUsers.length, totalEstimatedEvents: aggregate.totalEstimatedEvents + estimatedEvents };
      if (activeFullFetch) { if (eligible) activeFullFetch.success += 1; else activeFullFetch.partial += 1; activeFullFetch.lastCompletedIndex = queueIndex + 1; activeFullFetch.lastCompletedIssueKey = issueKey; }
      issueStatus[issueStatus.length - 1] = { index: queueIndex + 1, issueKey, status: eligible ? "success" : "partial", durationMs: Date.now() - issueStarted, sizeBytes: stagedTarget.sizeBytes };
      log("SUCCESS", `Issue committed: ${issueKey} durationMs=${Date.now() - issueStarted} issueBytes=${stagedTarget.sizeBytes} stagingBytes=${previewStaging(stagingRun).stagingSizeBytes}`); updateMemory(`after issue ${issueKey}`); sendProgress();
      if (activeFullFetch?.cancelRequested) break;
    }
    const cancelled = activeFullFetch?.cancelRequested === true;
    if (activeFullFetch) { activeFullFetch.currentStage = "Staging Finalization"; sendProgress(); }
    const state = finalizeStagingRun(stagingRun, cancelled); updateStagingWorkflow(stagingRun, { relatedDiscovery: "completed" });
    const success = state.eligible; const partial = state.partial; const failed = state.failed; const skipped = state.notAttempted;
    const attempted = success + partial + failed;
    const completedIssueKeys = stagingRun.index.targets.filter((target) => target.status === "eligible").map((target) => target.objectKey);
    const partialIssueKeys = stagingRun.index.targets.filter((target) => ["partial", "required_partial"].includes(target.status)).map((target) => target.objectKey);
    const failedIssueKeys = stagingRun.index.targets.filter((target) => ["failed_issue", "failed_final"].includes(target.status)).map((target) => target.objectKey);
    const issueKeyReconciliation = reconcileIssueKeySets({
      selectedIssueKeys: selectedIssues,
      fetchQueueIssueKeys: fetchQueue.map((item) => item.key),
      attemptedIssueKeys,
      completedIssueKeys,
      partialIssueKeys,
      failedIssueKeys
    });
    appendStagingDiagnostic(stagingRun.dir, "issue_key_reconciliation", issueKeyReconciliation);
    const archiveBlockedReasons = [
      ...(partial > 0 ? [`${partial} issue(s) contain incomplete required data.`] : []),
      ...(failed > 0 ? [`${failed} issue(s) failed.`] : []),
      ...(state.notAttempted > 0 ? [`${state.notAttempted} issue(s) were not attempted.`] : []),
      ...(!state.countReconciliationPassed ? state.countReconciliation.errors.map((item) => `${item.code}: ${item.formula}; expected=${item.expected}; actual=${item.actual}`) : [])
    ];
    const summary = { queueTotal: preflight.queueTotal, totalIssues: state.total, total: state.total, planned: preflight.plannedCount, eligible: preflight.eligibleCount, excluded: preflight.excludedCount, invalid: preflight.invalidCount, attempted, completed: success, pending: state.notAttempted, running: 0, success, partial, failed, skipped, notAttempted: state.notAttempted, countReconciliationPassed: state.countReconciliationPassed, countReconciliation: state.countReconciliation, issueKeyReconciliation, archiveEligible: state.status === "completed" && state.countReconciliationPassed && state.eligible === state.total && partial === 0 && failed === 0 && state.notAttempted === 0, archiveBlockedReasons, ...aggregate };
    latestFullFetchFailedIssues = report.filter((item) => item.fetchStatus === "failed").map((item) => ({ issueKey: text(item.issueKey), errorCode: text(item.errorCode) || "ISSUE_FETCH_FAILED", httpStatus: Number.isFinite(Number(item.httpStatus)) ? Number(item.httpStatus) : null, message: text(item.error), stage: "issue_full_fetch", retryCount: Number(item.retryCount ?? 0), source: text(item.source) || "manual", matchedReason: text(item.matchedReason), occurredAt: text(item.occurredAt) || new Date().toISOString() }));
    const evidenceExcluded: JiraEvidenceExcludedSummary = { schemaVersion: "jira_evidence_excluded_summary_v1", excludedCount: Object.values(evidenceExcludedByReason).reduce((sum, count) => sum + count, 0), byReason: evidenceExcludedByReason };
    const evidenceSummary: JiraEvidenceSummary = { schemaVersion: "jira_evidence_summary_v1", selectedUser, dateRange: { start: startDate, end: endDate }, directIssueCount: directIssueKeys.size, fullFetchedIssueCount: fullFetchedIssueKeys.length, failedIssueCount: latestFullFetchFailedIssues.length, directEvidenceCount, contextEvidenceCount, relatedContextEvidenceCount, excludedEvidenceCount: evidenceExcluded.excludedCount, byEvidenceType: evidenceTypeCounts, byActivityType: activityTypeCounts, byIssueKey: issueEvidenceCounts, coverage: { issuesWithEvidence: Object.keys(issueEvidenceCounts).length, issuesWithoutDirectEvidence: fullFetchedIssueKeys.filter((key) => !issueEvidenceCounts[key]?.directEvidenceCount).length, failedIssues: latestFullFetchFailedIssues.map((item) => item.issueKey) }, relatedIssueExpansionPolicy: { recursive: false, maxDepth: 1, relatedIssuesAsPrimaryEvidence: false } };
    const evidenceFiles = { events: "per-issue evidence.ndjson", summary: stagingPaths(stagingRun).result, excludedSummary: stagingPaths(stagingRun).result, schema: "embedded schema reference", roadmap: "v0.2.34" };
    latestJiraEvidence = { eventsDocument: { schemaVersion: "jira_evidence_file_backed_v1", runId, stagingId: state.stagingId, canonicalStorage: "issues/<issueKey>/evidence.ndjson" }, events: [], summary: evidenceSummary, excluded: evidenceExcluded, files: evidenceFiles };
    if (!state.countReconciliationPassed) log("ERROR", `FULL_FETCH_COUNT_RECONCILIATION_FAILED ${JSON.stringify(state.countReconciliation.errors)}`);
    const diagnostics = { autoLogPath, runManifestPath, rawDataMode, queueSnapshot, countReconciliation: state.countReconciliation, issueKeyReconciliation, memorySummary: { peakRssMB, peakHeapUsedMB, peakRawDataEstimateMB }, finalMemory: activeFullFetch?.memory ?? memorySnapshot(state.stagingSizeBytes), staging: previewStaging(stagingRun), ...getActionLogDiagnostics() };
    const response = { ok: state.status !== "failed", preflight, attempt: runningAttempt, identity: { attemptId: runningAttempt.attemptId, selectedTimelineRunId: runningAttempt.selectedTimelineRunId, fullFetchRunId: runId, stagingId: state.stagingId }, logs, run: { runId, startedAt, finishedAt: state.finishedAt, status: state.status, executionMode: "sequential_file_backed", diagnostics }, summary, stagingSummary: state, fetchReport: [], issueResults: [], relatedCandidateIssues, relatedIssueExpansionSummary: { ...relatedIssueSummary(relatedCandidateIssues), ...relatedIssueScopeSummary(relatedCandidateIssues) }, jiraEvidenceEvents: [], jiraEvidenceSummary: evidenceSummary, jiraEvidenceExcludedSummary: evidenceExcluded, jiraEvidenceFiles: null, rawData: { exportType: "user-analysis-full-fetch-file-reference-manifest", rawDataMode, stagingId: state.stagingId, stagingDir: stagingRun.dir, stagingSizeBytes: state.stagingSizeBytes, issueCount: issueResults.length, message: "Canonical files are persisted by main process. Per-Issue Raw/Snapshot/Evidence references are not sent through normal renderer IPC." }, diagnostics, warnings, errors };
    const indexDocument = readFullFetchResultIndex(stagingRun);
    const fullFetchResultDocument = buildFullFetchResultDocument({ app: { name: "Jira Activity Analyzer", version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__ }, run: response.run, requestContext: { selectedUser, projectScope, dateRange: { start: startDate, end: endDate, endInclusive: true }, jql: generatedJql, selectedIssues, fetchQueue: state.runContext.fetchQueue, directIssueKeys: Array.from(directIssueKeys), fetchRemoteLinks, relatedIssuesStatus }, stagingReference: { stagingId: state.stagingId, fullFetchRunId: runId, stagingDir: stagingRun.dir, resultIndex: stagingPaths(stagingRun).result }, summary: { ...summary, stagingSizeBytes: state.stagingSizeBytes, archiveEligible: state.archiveEligible }, fetchReport: report, issueResults: Array.isArray(indexDocument.issues) ? indexDocument.issues : issueResults, directJiraEvidence: { summary: evidenceSummary, excludedSummary: evidenceExcluded, files: evidenceFiles }, relatedCandidateIssues, warnings, errors, diagnostics, debugLogSanitized: logs });
    const resultRecord = { runId, document: fullFetchResultDocument, savedPath: "", generatedAutomatically: false };
    const terminalStatus = cancelled ? "cancelled" : state.status === "failed" ? "failed" : (partial > 0 || failed > 0 || state.notAttempted > 0) ? "partial" : "completed";
    const terminalRecord = fullFetchRunRegistry.publishTerminal({
      identity: { attemptId: runningAttempt.attemptId, selectedTimelineRunId: runningAttempt.selectedTimelineRunId, fullFetchRunId: runId, stagingId: state.stagingId },
      status: terminalStatus,
      countReconciliationPassed: state.countReconciliationPassed,
      issueKeyReconciliation: issueKeyReconciliation.status === "MATCH" ? "MATCH" : "MISMATCH",
      result: resultRecord,
      completedAt: state.finishedAt ?? new Date().toISOString()
    });
    fullFetchRunRegistry.registerAttempt(terminalRecord.attempt);
    latestFullFetchAttempt = terminalRecord.attempt;
    latestFullFetchResult = resultRecord;
    response.attempt = terminalRecord.attempt;
    log(issueKeyReconciliation.status === "MATCH" ? "SUCCESS" : "ERROR", `Issue Key reconciliation=${issueKeyReconciliation.status} selected=${issueKeyReconciliation.sets.selected.count} queue=${issueKeyReconciliation.sets.fetchQueue.count} attempted=${issueKeyReconciliation.sets.attempted.count} outcomes=${issueKeyReconciliation.sets.completed.count + issueKeyReconciliation.sets.partial.count + issueKeyReconciliation.sets.failed.count}`);
    if (activeFullFetch) {
      activeFullFetch.skipped = state.notAttempted;
      activeFullFetch.currentIssueKey = "";
    }
    log(state.countReconciliationPassed ? "SUCCESS" : "ERROR", `Full Fetch terminal status=${state.status} queueTotal=${preflight.queueTotal} planned=${preflight.plannedCount} attempted=${attempted} completed=${success} partial=${partial} failed=${failed} notAttempted=${state.notAttempted} reconciliation=${state.countReconciliationPassed}`);
    sendProgress(state.status);
    return response;
  } catch (error) {
    const faultingIssue = activeFullFetch?.currentIssueKey ?? ""; const state = failStagingRun(stagingRun, faultingIssue, error, "full_fetch_pipeline");
    log("ERROR", `Full Fetch failed code=${state.runError?.code} stage=${state.runError?.stage} issue=${faultingIssue} message=${state.runError?.message}`);
    try { sendProgress("failed"); } catch { /* Renderer may already be gone. */ }
    const issueKeyReconciliation = reconcileIssueKeySets({
      selectedIssueKeys: selectedIssues,
      fetchQueueIssueKeys: fetchQueue.map((item) => item.key),
      attemptedIssueKeys,
      completedIssueKeys: stagingRun.index.targets.filter((target) => target.status === "eligible").map((target) => target.objectKey),
      partialIssueKeys: stagingRun.index.targets.filter((target) => ["partial", "required_partial"].includes(target.status)).map((target) => target.objectKey),
      failedIssueKeys: stagingRun.index.targets.filter((target) => ["failed_issue", "failed_final"].includes(target.status)).map((target) => target.objectKey)
    });
    appendStagingDiagnostic(stagingRun.dir, "issue_key_reconciliation", issueKeyReconciliation);
    const failedRecord = fullFetchRunRegistry.publishTerminal({
      identity: { attemptId: runningAttempt.attemptId, selectedTimelineRunId: runningAttempt.selectedTimelineRunId, fullFetchRunId: runId, stagingId: state.stagingId },
      status: "failed",
      countReconciliationPassed: state.countReconciliationPassed,
      issueKeyReconciliation: issueKeyReconciliation.status === "MATCH" ? "MATCH" : "MISMATCH",
      result: null,
      completedAt: state.finishedAt ?? new Date().toISOString()
    });
    fullFetchRunRegistry.registerAttempt(failedRecord.attempt);
    latestFullFetchAttempt = failedRecord.attempt;
    const diagnostics = { autoLogPath, runManifestPath, issueKeyReconciliation, staging: previewStaging(stagingRun), finalMemory: memorySnapshot(state.stagingSizeBytes) };
    return { ok: false, preflight, attempt: failedRecord.attempt, identity: { attemptId: failedRecord.attempt.attemptId, selectedTimelineRunId: failedRecord.attempt.selectedTimelineRunId, fullFetchRunId: runId, stagingId: state.stagingId }, logs, run: { runId, startedAt, finishedAt: state.finishedAt, status: "failed", diagnostics, error: state.runError }, summary: { queueTotal: preflight.queueTotal, totalIssues: state.total, total: state.total, planned: preflight.plannedCount, eligible: preflight.eligibleCount, excluded: preflight.excludedCount, invalid: preflight.invalidCount, attempted: state.eligible + state.partial + state.failed, completed: state.eligible, pending: state.notAttempted, running: 0, success: state.eligible, partial: state.partial, failed: state.failed, skipped: state.notAttempted, notAttempted: state.notAttempted, countReconciliationPassed: state.countReconciliationPassed, countReconciliation: state.countReconciliation, issueKeyReconciliation, archiveEligible: false, archiveBlockedReasons: [state.runError?.message ?? "Full Fetch failed."], ...aggregate }, stagingSummary: state, fetchReport: [], issueResults: [], relatedCandidateIssues, jiraEvidenceEvents: [], diagnostics, warnings, errors: [...errors, state.runError?.message ?? "Full Fetch failed."] };
  } finally {
    if (activeFullFetch && !latestFullFetchRunSnapshot) latestFullFetchRunSnapshot = progressPayload();
    activeFullFetch = null;
  }
});

ipcMain.handle("user-analysis:get-active-full-fetch-run", async () => activeFullFetch ? latestFullFetchRunSnapshot : null);

ipcMain.handle("user-analysis:get-full-fetch-run-status", async (_event, payload: { runId?: string }) => {
  const runId = text(payload?.runId);
  return latestFullFetchRunSnapshot?.runId === runId ? latestFullFetchRunSnapshot : null;
});

ipcMain.handle("user-analysis:cancel-full-fetch", async (_event, payload?: { runId?: string }) => {
  if (payload?.runId && activeFullFetch && payload.runId !== activeFullFetch.runId) return { ok: false, message: "The requested Full Fetch run is no longer active." };
  if (!activeFullFetch || activeFullFetch.status !== "running") return { ok: false, message: "No Full Fetch is currently running. / 目前沒有執行中的 Full Fetch。" };
  activeFullFetch.cancelRequested = true;
  activeFullFetch.status = "cancel_requested";
  activeFullFetch.updatedAt = new Date().toISOString();
  latestFullFetchRunSnapshot = { ...(latestFullFetchRunSnapshot ?? {}), runId: activeFullFetch.runId, status: activeFullFetch.status, cancelRequested: true, updatedAt: activeFullFetch.updatedAt };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("user-analysis:full-fetch-progress", latestFullFetchRunSnapshot);
  }
  const run = loadStagingRun(activeFullFetch.stagingDir);
  appendStagingDiagnostic(run.dir, "cancel_requested", { stagingId: run.state.stagingId, runId: run.state.fullFetchRunId });
  appendRuntimeLog(activeFullFetch.autoLogPath, "INFO", "Cancel requested. No new target will be scheduled; the active target will finish safely.");
  return { ok: true, runId: activeFullFetch.runId, stagingId: run.state.stagingId };
});

ipcMain.handle("user-analysis:scan-full-fetch-staging", async () => {
  const root = ensureDir(getFullFetchStagingDir());
  recoverStaleStaging(root);
  const runs = listStagingRuns(root, getLegacyFullFetchStagingDir());
  latestFullFetchStaging = runs.find((run) => !run.state.legacyReadOnly) ?? null;
  return {
    found: runs.length > 0,
    runs: runs.map((run) => ({ state: run.state, preview: previewStaging(run) })),
    latest: runs[0] ? { state: runs[0].state, preview: previewStaging(runs[0]) } : null
  };
});

ipcMain.handle("user-analysis:full-fetch-staging-action", async (_event, payload: { stagingId: string; action: "open_folder" | "export_completed" | "delete_failed" }) => {
  const root = ensureDir(getFullFetchStagingDir());
  const run = loadStagingRun(path.join(root, path.basename(payload.stagingId)));
  latestFullFetchStaging = run;
  if (payload.action === "open_folder") {
    const error = await shell.openPath(run.dir);
    return { ok: !error, action: payload.action, state: run.state, folderPath: run.dir, error };
  }
  if (payload.action === "delete_failed") {
    const result = deleteFailedStaging(root, run.state.stagingId);
    if (latestFullFetchStaging?.state.stagingId === run.state.stagingId) latestFullFetchStaging = null;
    return { ok: true, action: payload.action, result };
  }
  if (payload.action === "export_completed") {
    const result = exportStaging(run, ensureDir(getSourceArchivesDir()));
    latestSourceArchiveExport = { fileName: path.basename(result.packagePath), filePath: result.packagePath, exportRunId: `staging-export-${Date.now()}`, selectedUser: run.state.selectedUser, createdAt: result.exportedAt, sizeBytes: Number(result.fileSize), sha256: result.packageSha256, jiraObjectCount: run.state.eligible, confluenceObjectCount: 0, packageStatus: result.packageStatus, safeForAutomaticImport: result.safeForAutomaticImport, verification: result.verification };
    return { ok: true, action: payload.action, state: run.state, result };
  }
  return { ok: false, action: payload.action, state: run.state, error: "Unsupported staging action." };
});

function sourceArchivePayloads(rawData: unknown): unknown[] {
  const source = asRecord(rawData);
  if (Array.isArray(source.rawIssueResponsesSanitized)) {
    const issueResponses = source.rawIssueResponsesSanitized.map(asRecord);
    const commentResponses = Array.isArray(source.rawCommentResponsesSanitized) ? source.rawCommentResponsesSanitized.map(asRecord) : [];
    const issueKeys = Array.from(new Set(issueResponses.map((item) => text(item.issueKey)).filter(Boolean)));
    return issueKeys.map((issueKey) => {
      const primary = issueResponses.find((item) => text(item.issueKey) === issueKey && text(item.endpoint) === "issue");
      const supplemental = issueResponses.filter((item) => text(item.issueKey) === issueKey && text(item.endpoint) !== "issue").map((item) => ({ endpoint: text(item.endpoint), status: item.status, json: item.json }));
      const commentPages = commentResponses.filter((item) => text(item.issueKey) === issueKey).map((item) => ({ startAt: item.startAt, status: item.status, json: item.json }));
      return { issueKey, rawPayload: { issue: primary?.json ?? {}, supplementalIssueResponses: supplemental, commentPages }, sourceFileName: `${issueKey}.raw.json`, sourceJsonPath: `$.issues[${JSON.stringify(issueKey)}]` };
    });
  }
  if (!Array.isArray(source.issues)) return [];
  const root = path.resolve(getFullFetchRawRunsDir());
  return source.issues.flatMap((item) => {
    const filePath = path.resolve(text(asRecord(item).rawFilePath));
    if (!isPathInsideRoot(root, filePath) || !fs.existsSync(filePath)) return [];
    try {
      const saved = asRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
      const issue = asRecord(saved.issue);
      return [{ issueKey: text(asRecord(item).issueKey) || text(issue.issueKey), rawPayload: { issue: issue.json ?? {}, fullFetchResult: saved.result ?? {} }, sourceFileName: path.basename(filePath), sourceJsonPath: "$" }];
    } catch { return []; }
  });
}

function prepareSourceArchive(payload: { rawData?: unknown; confluenceRawData?: unknown[]; selectedUser?: string }) {
  return buildSourceArchivePackage({
    jiraPayloads: sourceArchivePayloads(payload.rawData),
    confluencePayloads: Array.isArray(payload.confluenceRawData) ? payload.confluenceRawData : [],
    selectedUser: payload.selectedUser,
    buildInfo: {
      appVersion: __MAIN_APP_VERSION__,
      packagedSourceCommit: __MAIN_GIT_COMMIT__,
      buildTime: __MAIN_BUILD_TIME__
    }
  });
}

ipcMain.handle("user-analysis:preview-source-archive", async (_event, payload: { rawData?: unknown; confluenceRawData?: unknown[]; selectedUser?: string; stagingId?: string }) => {
  if (payload.stagingId) {
    const run = loadStagingRun(path.join(ensureDir(getFullFetchStagingDir()), path.basename(payload.stagingId)));
    const preview = previewStaging(run);
    return { ok: true, fileName: `source-archive-import-package-${run.state.stagingId}.zip`, manifest: { schemaVersion: "source_archive_import_package_v2", packageStatus: run.state.remaining ? "partial" : "ready_for_verification", safeForAutomaticImport: false }, summary: { ...preview, jiraFullFetchObjectCount: run.state.eligible, confluenceFullFetchObjectCount: 0, missingObjectKeyCount: 0 }, errors: [], logs: ["[INFO] Preview read lightweight Full Fetch staging summaries", "[INFO] Final integrity status is assigned only after ZIP reopen verification", "[INFO] No raw payload collection was transmitted to renderer", "[INFO] No Source Archive database write performed"] };
  }
  return { ok: false, fileName: "", manifest: { packageStatus: "blocked", safeForAutomaticImport: false }, summary: {}, errors: [{ code: "staging_id_required", message: "Source Archive Export requires an explicit Full Fetch staging ID." }], logs: ["[ERROR] Source Archive preview blocked: staging ID is required", "[INFO] Renderer memory is not accepted as an archive source", "[INFO] No database write performed"] };
});

ipcMain.handle("user-analysis:export-source-archive", async (_event, payload: { rawData?: unknown; confluenceRawData?: unknown[]; selectedUser?: string; stagingId?: string }) => {
  if (payload.stagingId) {
    const run = loadStagingRun(path.join(ensureDir(getFullFetchStagingDir()), path.basename(payload.stagingId)));
    const result = exportStaging(run, ensureDir(getSourceArchivesDir()));
    latestFullFetchStaging = run;
    latestSourceArchiveExport = { fileName: path.basename(result.packagePath), filePath: result.packagePath, exportRunId: `staging-export-${Date.now()}`, selectedUser: run.state.selectedUser, createdAt: result.exportedAt, sizeBytes: Number(result.fileSize), sha256: result.packageSha256, jiraObjectCount: run.state.eligible, confluenceObjectCount: 0, packageStatus: result.packageStatus, safeForAutomaticImport: result.safeForAutomaticImport, verification: result.verification };
    return { ok: result.packageStatus === "complete", exportRunId: latestSourceArchiveExport.exportRunId, fileName: latestSourceArchiveExport.fileName, filePath: result.packagePath, folderPath: path.dirname(result.packagePath), manifest: { packageStatus: result.packageStatus, safeForAutomaticImport: result.safeForAutomaticImport }, summary: run.state, verification: result.verification, errors: result.errors, logs: ["[INFO] Source Archive export rebuilt from this Run's Full Fetch staging raw files", `[INFO] Package status: ${result.packageStatus}`, `[INFO] Package SHA-256: ${result.packageSha256}`, `[INFO] safeForAutomaticImport=${result.safeForAutomaticImport}`, "[INFO] No database write performed"] };
  }
  return { ok: false, exportRunId: "", fileName: "", filePath: "", folderPath: "", manifest: { packageStatus: "blocked", safeForAutomaticImport: false }, summary: {}, errors: [{ code: "staging_id_required", message: "Source Archive Export requires an explicit Full Fetch staging ID." }], logs: ["[ERROR] Source Archive export blocked: staging ID is required", "[INFO] Renderer memory is not accepted as an archive source", "[INFO] No database write performed"] };
});

ipcMain.handle("diagnostics:renderer-event", async (_event, payload: Record<string, unknown>) => {
  const event = text(payload?.event) || "renderer_event";
  if (event === "startup_milestone") startupMilestones.mark(String(payload?.milestone ?? "") as StartupMilestoneName);
  const incidentId = text(payload?.incidentId);
  const resolvedIncidentId = persistentDiagnostics.write("renderer", event, payload, incidentId);
  return { ok: true, incidentId: resolvedIncidentId };
});

ipcMain.handle("diagnostics:transition", async (_event, payload: Record<string, unknown>) => {
  const event = text(payload?.event) || "queue_transition";
  const incidentId = text(payload?.incidentId);
  const resolvedIncidentId = persistentDiagnostics.write("transitions", event, payload, incidentId);
  return { ok: true, incidentId: resolvedIncidentId };
});

ipcMain.handle("diagnostics:get-context", async () => ({
  sessionId: appSessionId,
  previousSessionId: persistentDiagnostics.previousSessionId,
  logsDir: getLogsDir(),
  appRoot: getAppRuntimeDir()
}));

ipcMain.handle("diagnostics:open-logs", async () => {
  const folderPath = ensureDir(getLogsDir());
  const error = await shell.openPath(folderPath);
  return { ok: !error, folderPath, error };
});

ipcMain.handle("user-analysis:log-action", async (_event, payload: { category?: string; message?: string }) => {
  const allowedCategories = new Set(["USER_ACTION", "GUARD", "UI_MODAL", "INFO"]);
  const category = allowedCategories.has(text(payload?.category)) ? text(payload.category) : "USER_ACTION";
  const message = maskDiagnosticText(text(payload?.message)).slice(0, 2000);
  if (!message) return { ok: false, error: "Action message is required." };
  const appLogPath = path.join(ensureDir(getAppLogsDir()), `app-${dateStamp()}.log`);
  appendRuntimeLog(appLogPath, category, message);
  appendUserActionLog(category, message);
  persistentDiagnostics.write("main", "user_action", { category, message });
  if (activeFullFetch) appendRuntimeLog(activeFullFetch.autoLogPath, category, message);
  return { ok: true, appLogPath, ...getActionLogDiagnostics(), fullFetchLogPath: activeFullFetch?.autoLogPath ?? "" };
});

ipcMain.handle("user-analysis:update-workflow-snapshot", async (_event, payload: Record<string, unknown>) => {
  const now = new Date().toISOString();
  const steps = asRecord(payload.steps) as WorkflowStepStatus;
  const timelineIssueGroups = Array.isArray(payload.timelineIssueGroups) ? sanitizeRawJson(payload.timelineIssueGroups) as unknown[] : [];
  const timelineSelectedIssues = Array.isArray(payload.timelineSelectedIssues) ? payload.timelineSelectedIssues.map(text).filter(Boolean) : [];
  const fetchQueue = Array.isArray(payload.fetchQueue) ? sanitizeRawJson(payload.fetchQueue) as unknown[] : [];
  const relatedCandidateIssues = Array.isArray(payload.relatedCandidateIssues) ? sanitizeRawJson(payload.relatedCandidateIssues) as RelatedCandidateIssue[] : [];
  const uiState = sanitizeRawJson(asRecord(payload.uiState)) as Record<string, unknown>;
  latestUserAnalysisWorkflow = {
    steps,
    timelineIssueGroups,
    timelineSelectedIssues,
    fetchQueue,
    relatedCandidateIssues,
    addedTimelineIssuesToFetchQueueCount: Number(payload.addedTimelineIssuesToFetchQueueCount ?? 0),
    addedRelatedIssuesToFetchQueueCount: Number(payload.addedRelatedIssuesToFetchQueueCount ?? 0),
    addedRecommendedRelatedIssuesToFetchQueueCount: Number(payload.addedRecommendedRelatedIssuesToFetchQueueCount ?? 0),
    addedOptionalRelatedIssuesToFetchQueueCount: Number(payload.addedOptionalRelatedIssuesToFetchQueueCount ?? 0),
    uiState,
    updatedAt: now
  };
  const outputDir = ensureDir(path.join(getExportsDir(), "user-analysis", "workflow"));
  const summary = relatedIssueSummary(relatedCandidateIssues);
  const files: Record<string, string> = {
    workflowSnapshot: path.join(outputDir, "user-analysis-workflow-snapshot.json"),
    timelineIssueGroups: path.join(outputDir, "timeline-issue-groups.json"),
    timelineSelectedIssues: path.join(outputDir, "timeline-selected-issues.json"),
    fetchQueue: path.join(outputDir, "fetch-queue.json"),
    relatedCandidateIssues: path.join(outputDir, "related-candidate-issues.json"),
    relatedIssueExpansionSummary: path.join(outputDir, "related-issue-expansion-summary.json"),
    timelineEventListUiState: path.join(outputDir, "timeline-event-list-ui-state.json"),
    selectIssuesUiState: path.join(outputDir, "select-issues-ui-state.json")
  };
  writeJsonAtomic(files.workflowSnapshot, { schemaVersion: "user_analysis_workflow_snapshot_v2", appVersion: __MAIN_APP_VERSION__, ...latestUserAnalysisWorkflow });
  writeJsonAtomic(files.timelineIssueGroups, timelineIssueGroups);
  writeJsonAtomic(files.timelineSelectedIssues, { selectedIssueKeys: timelineSelectedIssues, count: timelineSelectedIssues.length });
  writeJsonAtomic(files.fetchQueue, fetchQueue);
  writeJsonAtomic(files.relatedCandidateIssues, relatedCandidateIssues);
  writeJsonAtomic(files.relatedIssueExpansionSummary, { ...summary, ...relatedIssueScopeSummary(relatedCandidateIssues, latestUserAnalysisWorkflow.addedRecommendedRelatedIssuesToFetchQueueCount, latestUserAnalysisWorkflow.addedOptionalRelatedIssuesToFetchQueueCount), addedRelatedIssuesToFetchQueueCount: latestUserAnalysisWorkflow.addedRelatedIssuesToFetchQueueCount });
  writeJsonAtomic(files.timelineEventListUiState, asRecord(uiState.timeline));
  writeJsonAtomic(files.selectIssuesUiState, asRecord(uiState.selectIssues));
  const action = text(payload.sessionEvent);
  if (action === "timeline_issues_added_to_fetch_queue" || action === "related_issues_expanded") {
    sessionUserActions.push({ time: now, level: "INFO", message: action, raw: `${now} [INFO] ${action}` });
  }
  return { ok: true, outputDir, files };
});

ipcMain.handle("user-analysis:load-workflow-snapshot", async () => {
  const filePath = path.join(getExportsDir(), "user-analysis", "workflow", "user-analysis-workflow-snapshot.json");
  if (isUiSmoke) return { found: false, filePath };
  if (!fs.existsSync(filePath)) return { found: false, filePath };
  try {
    const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    if (snapshot.schemaVersion !== "user_analysis_workflow_snapshot_v2") return { found: false, filePath, error: "Unsupported workflow snapshot schema." };
    latestUserAnalysisWorkflow = {
      steps: { ...defaultWorkflowSteps(), ...asRecord(snapshot.steps) } as WorkflowStepStatus,
      timelineIssueGroups: Array.isArray(snapshot.timelineIssueGroups) ? snapshot.timelineIssueGroups : [],
      timelineSelectedIssues: Array.isArray(snapshot.timelineSelectedIssues) ? snapshot.timelineSelectedIssues.map(text).filter(Boolean) : [],
      fetchQueue: Array.isArray(snapshot.fetchQueue) ? snapshot.fetchQueue : [],
      relatedCandidateIssues: Array.isArray(snapshot.relatedCandidateIssues) ? snapshot.relatedCandidateIssues as RelatedCandidateIssue[] : [],
      addedTimelineIssuesToFetchQueueCount: Number(snapshot.addedTimelineIssuesToFetchQueueCount ?? 0),
      addedRelatedIssuesToFetchQueueCount: Number(snapshot.addedRelatedIssuesToFetchQueueCount ?? 0),
      addedRecommendedRelatedIssuesToFetchQueueCount: Number(snapshot.addedRecommendedRelatedIssuesToFetchQueueCount ?? 0),
      addedOptionalRelatedIssuesToFetchQueueCount: Number(snapshot.addedOptionalRelatedIssuesToFetchQueueCount ?? 0),
      uiState: asRecord(snapshot.uiState),
      updatedAt: text(snapshot.updatedAt)
    };
    return { found: true, filePath, snapshot: latestUserAnalysisWorkflow };
  } catch (error) {
    return { found: false, filePath, error: maskDiagnosticText(error instanceof Error ? error.message : String(error)) };
  }
});

ipcMain.handle("user-analysis:action-log-diagnostics", async () => getActionLogDiagnostics());

ipcMain.handle("user-analysis:open-diagnostics-folder", async (_event, payload?: { filePath?: string }) => {
  const logsRoot = path.resolve(getLogsDir());
  const target = path.resolve(payload?.filePath ? path.dirname(payload.filePath) : getFullFetchLogsDir());
  const relative = path.relative(logsRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false, error: "Diagnostics folder must be inside logs." };
  ensureDir(target);
  const error = await shell.openPath(target);
  return error ? { ok: false, folderPath: target, error } : { ok: true, folderPath: target };
});

ipcMain.handle("user-analysis:save-export", async (_event, payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => {
  return saveExportJson(payload);
});

ipcMain.handle("user-analysis:save-full-fetch-result", async (_event, payload: FullFetchRunIdentity) => {
  const identity: FullFetchRunIdentity = {
    attemptId: text(payload?.attemptId),
    selectedTimelineRunId: text(payload?.selectedTimelineRunId),
    fullFetchRunId: text(payload?.fullFetchRunId),
    stagingId: text(payload?.stagingId)
  };
  const runId = identity.fullFetchRunId;
  const saveResolution = fullFetchRunRegistry.resolveSaveRequest(identity);
  const runRecord = saveResolution.record;
  if (!runRecord.result) throw new Error("FULL_FETCH_RESULT_NOT_AVAILABLE: The requested result document is unavailable.");
  if (saveResolution.status === "already_saved") {
    const evidence = saveResolution.evidence;
    const resolvedStaging = loadStagingRun(runRecord.stagingDir);
    return {
      canceled: false,
      alreadySaved: true,
      reasonCode: "ALREADY_SAVED",
      operationId: evidence.operationId,
      filePath: evidence.filePath,
      folderPath: evidence.folderPath,
      fileSize: evidence.fileSize,
      sha256: evidence.sha256,
      staging: resolvedStaging.state,
      fileSave: evidence.fileSave,
      databaseWrite: evidence.databaseWrite,
      logs: [
        "[INFO] ALREADY_SAVED: The requested Full Fetch result was already committed.",
        "[INFO] No second JSON export or SQLite write transaction was started.",
        `[INFO] Original Save Operation ID: ${evidence.operationId}`
      ]
    };
  }
  const resolvedStaging = loadStagingRun(runRecord.stagingDir);
  const runContext = resolvedStaging.state.runContext;
  if (resolvedStaging.state.fullFetchRunId !== identity.fullFetchRunId
    || resolvedStaging.state.stagingId !== identity.stagingId
    || text(runContext.attemptId) !== identity.attemptId
    || text(runContext.selectedTimelineRunId) !== identity.selectedTimelineRunId) {
    throw new Error("FULL_FETCH_IDENTITY_MISMATCH: Staging metadata does not match the requested Full Fetch run.");
  }
  if (activeSourceArchiveDatabaseWrites.has(runId)) throw new Error("A Save Full Fetch Result operation is already active for this run.");
  activeSourceArchiveDatabaseWrites.add(runId);
  const operationId = `save-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  try {
    const outputDir = ensureDir(getFullFetchResultsDir());
    const saved = saveFullFetchResult(runRecord.result.document, outputDir, `user-analysis-full-fetch-${fileTimestamp()}.json`);
    const savedAt = new Date().toISOString();
    recordStep5Action(resolvedStaging, { action: "full_fetch_json_saved", timestamp: savedAt, runId, outputPath: saved.filePath, fileSize: saved.fileSize, sha256: saved.sha256, issueCount: resolvedStaging.state.total, eligibleCount: resolvedStaging.state.eligible, result: "completed", error: "", generatedAutomatically: false });

    const config = loadRuntimeConfig(resolveCurrentEnvPath());
    const databasePath = resolveLocalDatabasePath(getAppRuntimeDir(), config.localDatabasePath);
    const currentJira = getRuntimeCoordinator().snapshot().jira;
    const formalDatabaseWriteAllowed = runRecord.attempt.preflightStatus === "eligible"
      && runRecord.attempt.saveEligible
      && runRecord.fullFetchRunId === resolvedStaging.state.fullFetchRunId;
    const databaseWriteResult = formalDatabaseWriteAllowed
      ? writeFullFetchStagingToCurrentDatabase({
        operationId,
        databasePath,
        run: resolvedStaging,
        diagnosticsDir: getFullFetchResultsDir(),
        currentJira: {
          sourceSystem: "jira",
          serverIdentity: currentJira.status === "CONNECTED" ? currentJira.serverIdentity : "",
          baseUrlNormalized: currentJira.status === "CONNECTED" ? currentJira.baseUrlNormalized : "",
          serverTitle: currentJira.status === "CONNECTED" ? currentJira.serverTitle : "",
          serverTitleStatus: currentJira.status === "CONNECTED" ? currentJira.serverTitleStatus : "unverified",
          connectionLabel: loadConnectionState().activeConnection.name
        }
      })
      : {
        ok: false,
        status: "blocked",
        reasonCode: "STABILITY_GATE_DATABASE_WRITE_BLOCKED",
        targetDatabase: databasePath,
        databaseId: "",
        boundJiraServer: "",
        preflightStatus: "blocked",
        summary: {},
        retries: 0,
        readbackVerified: false,
        foreignKeyCheck: "not_run",
        durationMs: 0,
        outcomes: [],
        eligibility: { attemptId: runRecord.attempt.attemptId, selectedTimelineRunId: runRecord.attempt.selectedTimelineRunId, preflightStatus: runRecord.attempt.preflightStatus }
      };
    const databaseWrite = {
      ...databaseWriteResult,
      operationType: "full_fetch_save",
      runId,
      fullFetchRunId: runId,
      identity,
      completedAt: new Date().toISOString()
    };
    latestSourceArchiveDatabaseWrite = databaseWrite;
    appendStagingDiagnostic(resolvedStaging.dir, "source_archive_database_write", {
      operationId,
      status: databaseWrite.status,
      reasonCode: databaseWrite.reasonCode,
      targetDatabase: databaseWrite.targetDatabase,
      databaseId: databaseWrite.databaseId,
      boundJiraServer: databaseWrite.boundJiraServer,
      preflightStatus: databaseWrite.preflightStatus,
      summary: databaseWrite.summary,
      retries: databaseWrite.retries,
      readbackVerified: databaseWrite.readbackVerified,
      foreignKeyCheck: databaseWrite.foreignKeyCheck,
      durationMs: databaseWrite.durationMs,
      outcomes: databaseWrite.outcomes
    });
    await getRuntimeCoordinator().retryDatabase();
    const archiveForRun = latestSourceArchiveExport?.fileName.includes(resolvedStaging.state.stagingId)
      ? latestSourceArchiveExport
      : null;
    const fileSave = {
      fullFetchJson: { status: "success", filePath: saved.filePath, fileSize: saved.fileSize, sha256: saved.sha256 },
      sourceArchiveZip: archiveForRun
        ? { status: archiveForRun.safeForAutomaticImport ? "success" : "failed", filePath: archiveForRun.filePath, sha256: archiveForRun.sha256 }
        : { status: "skipped", reasonCode: "SOURCE_ARCHIVE_NOT_EXPORTED" },
      archiveVerification: archiveForRun?.safeForAutomaticImport ? "success" : "skipped"
    };
    const databaseSaveCommitted = databaseWrite.ok === true
      && databaseWrite.status === "completed"
      && databaseWrite.readbackVerified === true
      && databaseWrite.foreignKeyCheck === "passed";
    if (databaseSaveCommitted) {
      const savedRecord = fullFetchRunRegistry.markSaved(identity, {
        operationId,
        savedAt,
        filePath: saved.filePath,
        folderPath: saved.folderPath,
        fileSize: saved.fileSize,
        sha256: saved.sha256,
        fileSave,
        databaseWrite
      });
      latestFullFetchResult = savedRecord.result;
      latestFullFetchAttempt = savedRecord.attempt;
      recordStep5Action(resolvedStaging, { action: "full_fetch_database_saved", timestamp: savedAt, runId, outputPath: saved.filePath, fileSize: saved.fileSize, sha256: saved.sha256, issueCount: resolvedStaging.state.total, eligibleCount: resolvedStaging.state.eligible, result: "completed", error: "", generatedAutomatically: false });
    }
    const logs = [
      `[INFO] Save Operation ID: ${operationId}`,
      `[INFO] Full Fetch JSON: Success (${saved.fileSize} bytes)`,
      `[INFO] Source Archive ZIP: ${archiveForRun?.safeForAutomaticImport ? "Success and verified" : "Skipped (use Export Source Archive Import Package)"}`,
      `[INFO] Database Write: ${databaseWrite.status}`,
      `[INFO] Database Reason Code: ${databaseWrite.reasonCode}`,
      `[INFO] Database counts: ${JSON.stringify(databaseWrite.summary)}`,
      `[INFO] Database readback verified: ${databaseWrite.readbackVerified}`,
      `[INFO] Foreign key check: ${databaseWrite.foreignKeyCheck}`
    ];
    if (!databaseWrite.ok) logs.push(`[WARN] No database write performed or only partial success. Reason Code: ${databaseWrite.reasonCode}`);
    return {
      canceled: false,
      operationId,
      ...saved,
      staging: resolvedStaging.state,
      alreadySaved: false,
      reasonCode: databaseSaveCommitted ? "SAVED" : String(databaseWrite.reasonCode ?? "DATABASE_WRITE_FAILED"),
      fileSave,
      databaseWrite,
      logs
    };
  } finally {
    activeSourceArchiveDatabaseWrites.delete(runId);
  }
});

ipcMain.handle("user-analysis:open-export-folder", async (_event, payload?: { folderPath?: string }) => {
  const exportsRoot = path.resolve(getExportsDir());
  const folderPath = path.resolve(payload?.folderPath || getFullFetchResultsDir());
  const relative = path.relative(exportsRoot, folderPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, folderPath, error: "Export folder must be inside the application exports directory." };
  }
  ensureDir(folderPath);
  const error = await shell.openPath(folderPath);
  return error ? { ok: false, folderPath, error } : { ok: true, folderPath };
});

ipcMain.handle("jira-analysis:load", async (_event, payload: { connection: AppConnection; issueKey: string }) => {
  const issueKey = String(payload.issueKey || "").trim().toUpperCase();
  const connection = payload.connection;
  const apiPrefix = connection.apiVersion === "v3" ? "/rest/api/3" : "/rest/api/2";
  const logs = [
    "[INFO] Jira Analysis load started",
    `[INFO] Active connection: ${connection.name}`,
    `[INFO] Base URL: ${connection.baseUrl}`,
    `[INFO] Auth Type: ${connection.authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"}`,
    `[INFO] API Version: ${connection.apiVersion}`,
    "[INFO] Authorization: [masked]",
    `[INFO] Issue Key: ${issueKey}`,
    `[DEBUG] GET ${apiPrefix}/myself`
  ];
  const client = createJiraClient({
    baseUrl: connection.baseUrl,
    email: connection.email || connection.username,
    apiToken: connection.apiToken ?? "",
    authType: connection.authType
  });
  const myself = await client.get(`${apiPrefix}/myself`);
  if (!myself.ok) {
    logs.push(`[ERROR] Authentication failed: ${myself.message ?? myself.status}`);
    logs.push("[INFO] No database write performed");
    return { ok: false, message: myself.message ?? "Authentication failed.", logs };
  }

  const issuePath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names,schema,renderedFields,changelog`;
  logs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}`);
  const issue = await client.get(issuePath);
  if (!issue.ok) {
    logs.push(`[ERROR] Issue load failed: ${issue.message ?? issue.status}`);
    logs.push("[INFO] No database write performed");
    return { ok: false, message: issue.message ?? "Issue load failed.", logs };
  }

  logs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}?expand=changelog`);
  const changelog = connection.apiVersion === "v2"
    ? { ok: true, json: asRecord(issue.json).changelog ?? null }
    : await client.get(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}/changelog?maxResults=100`);
  logs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/comment`);
  const commentsResponse = await client.get(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?maxResults=100`);
  const changelogStatus = "status" in changelog ? changelog.status : changelog.ok ? 200 : "-";

  const issueJson = asRecord(issue.json);
  const fields = asRecord(issueJson.fields);
  const project = asRecord(fields.project);
  const issueType = asRecord(fields.issuetype);
  const status = asRecord(fields.status);
  const priority = asRecord(fields.priority);
  const resolution = asRecord(fields.resolution);
  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  const changelogRoot = asRecord(changelog.json);
  const histories = Array.isArray(changelogRoot.histories) ? changelogRoot.histories as Record<string, unknown>[] : Array.isArray(changelogRoot.values) ? changelogRoot.values as Record<string, unknown>[] : [];
  const changeItems = histories.flatMap((history) => {
    const items = Array.isArray(history.items) ? history.items as Record<string, unknown>[] : [];
    return items.map((item) => ({ history, item }));
  });
  const comments = commentsResponse.ok && Array.isArray(asRecord(commentsResponse.json).comments) ? asRecord(commentsResponse.json).comments as Record<string, unknown>[] : [];
  const participants = new Map<string, { events: number; changelog: number; comments: number; attachments: number; status: number; first: string; last: string }>();
  const addParticipant = (name: string, type: "changelog" | "comments" | "attachments" | "status", time: string) => {
    if (!name || name === "-") return;
    const current = participants.get(name) ?? { events: 0, changelog: 0, comments: 0, attachments: 0, status: 0, first: time, last: time };
    current.events += 1;
    current[type] += 1;
    current.first = [current.first, time].filter(Boolean).sort()[0] ?? time;
    current.last = [current.last, time].filter(Boolean).sort().at(-1) ?? time;
    participants.set(name, current);
  };
  histories.forEach((history) => {
    const author = text(asRecord(history).author);
    const created = text(history.created);
    const items = Array.isArray(history.items) ? history.items as Record<string, unknown>[] : [];
    items.forEach((item) => addParticipant(author, text(item.field) === "status" ? "status" : "changelog", created));
  });
  comments.forEach((comment) => addParticipant(text(comment.author), "comments", text(comment.created)));
  attachments.forEach((attachment) => addParticipant(text(asRecord(attachment).author), "attachments", text(asRecord(attachment).created)));
  const fieldCounts = new Map<string, number>();
  changeItems.forEach(({ item }) => fieldCounts.set(text(item.field), (fieldCounts.get(text(item.field)) ?? 0) + 1));
  const statusTransitions = new Map<string, { count: number; first: string; last: string; actors: Set<string> }>();
  changeItems.filter(({ item }) => text(item.field) === "status").forEach(({ history, item }) => {
    const key = `${text(item.fromString)} -> ${text(item.toString)}`;
    const created = text(history.created);
    const entry = statusTransitions.get(key) ?? { count: 0, first: created, last: created, actors: new Set<string>() };
    entry.count += 1;
    entry.first = [entry.first, created].sort()[0];
    entry.last = [entry.last, created].sort().at(-1) ?? created;
    entry.actors.add(text(history.author));
    statusTransitions.set(key, entry);
  });
  const fieldChanges = changeItems
    .map(({ history, item }, index) => [
      formatDateTime(history.created),
      text(history.author),
      text(item.field),
      text(item.fromString ?? item.from),
      text(item.toString ?? item.to),
      text(history.id),
      String(index + 1)
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const commentRows = comments
    .map((comment) => [
      formatDateTime(comment.created),
      formatDateTime(comment.updated),
      text(comment.author),
      text(comment.body),
      text(comment.created) !== text(comment.updated) ? "Yes" : "No",
      text(comment.id),
      "View / Copy"
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const attachmentRows = attachments
    .map((item) => {
      const record = asRecord(item);
      return [
        formatDateTime(record.created),
        text(record.filename),
        text(record.author),
        text(record.mimeType),
        text(record.size),
        record.content ? "Yes" : "No",
        record.thumbnail ? "Yes" : "No",
        fileType(record.mimeType, record.filename),
        "Copy / Metadata"
      ];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const activityTimeline = [
    { time: text(fields.created), actor: text(fields.creator), event: "issue_created", details: text(fields.summary), source: "Issue", confidence: "High" },
    ...changeItems.map(({ history, item }) => ({
      time: text(history.created),
      actor: text(history.author),
      event: text(item.field) === "status" ? "status_changed" : "field_changed",
      details: `${text(item.field)}: ${text(item.fromString ?? item.from)} -> ${text(item.toString ?? item.to)}`,
      source: "Changelog",
      confidence: "High"
    })),
    ...comments.map((comment) => ({ time: text(comment.created), actor: text(comment.author), event: "comment_created", details: text(comment.body), source: "Comment", confidence: "High" })),
    ...attachments.map((attachment) => {
      const record = asRecord(attachment);
      return { time: text(record.created), actor: text(record.author), event: "attachment_added", details: text(record.filename), source: "Attachment", confidence: "High" };
    })
  ]
    .sort((a, b) => dateSortValue(a.time) - dateSortValue(b.time))
    .map((item) => [formatDateTime(item.time), item.actor, item.event, item.details, item.source, item.confidence]);

  const rawData = [
    { name: "Get Myself", method: "GET", path: `${apiPrefix}/myself`, status: text(myself.status), records: "1", json: sanitizeRawJson(myself.json) },
    { name: "Get Issue", method: "GET", path: `${apiPrefix}/issue/${issueKey}`, status: text(issue.status), records: "1", json: sanitizeRawJson(issue.json) },
    { name: "Get Changelog", method: "GET", path: `${apiPrefix}/issue/${issueKey}/changelog`, status: text(changelogStatus), records: String(histories.length), json: sanitizeRawJson(changelog.json) },
    { name: "Get Comments", method: "GET", path: `${apiPrefix}/issue/${issueKey}/comment`, status: text(commentsResponse.status ?? "-"), records: String(comments.length), json: sanitizeRawJson(commentsResponse.json) },
    { name: "Attachment Metadata", method: "READ", path: "fields.attachment", status: "-", records: String(attachments.length), json: sanitizeRawJson(attachments) },
    { name: "Issue Links", method: "READ", path: "fields.issuelinks", status: "-", records: String(links.length), json: sanitizeRawJson(links) }
  ];

  logs.push("[INFO] Issue loaded");
  logs.push(`[INFO] Parsed fields: ${Object.keys(fields).length}`);
  logs.push(`[INFO] Parsed changelog: ${histories.length} histories / ${changeItems.length} items`);
  logs.push(`[INFO] Parsed comments: ${comments.length}`);
  logs.push(`[INFO] Parsed attachments: ${attachments.length}`);
  logs.push(`[INFO] Parsed issue links: ${links.length}`);
  logs.push(`[INFO] Parsed participants: ${participants.size}`);
  logs.push("[INFO] Analysis tabs ready");
  logs.push("[INFO] No database write performed");
  logs.push("[SUCCESS] Jira Analysis ready");

  return {
    ok: true,
    logs,
    issue: {
      key: text(issueJson.key ?? issueKey),
      id: text(issueJson.id),
      summary: text(fields.summary),
      status: text(status.name),
      priority: text(priority.name),
      issueType: text(issueType.name),
      projectKey: text(project.key),
      projectName: text(project.name),
      assignee: text(fields.assignee),
      reporter: text(fields.reporter),
      creator: text(fields.creator),
      created: formatDateTime(fields.created),
      updated: formatDateTime(fields.updated),
      resolution: text(resolution.name),
      labels: text(fields.labels),
      components: text(fields.components),
      versions: text(fields.versions),
      fixVersions: text(fields.fixVersions),
      linkedIssuesCount: links.length,
      attachmentCount: attachments.length,
      commentCount: comments.length
    },
    overview: [
      ["Issue Key", text(issueJson.key ?? issueKey)],
      ["Issue ID", text(issueJson.id)],
      ["Project", `${text(project.key)} / ${text(project.name)}`],
      ["Issue Type", text(issueType.name)],
      ["Summary", text(fields.summary)],
      ["Status", text(status.name)],
      ["Priority", text(priority.name)],
      ["Resolution", text(resolution.name)],
      ["Assignee", text(fields.assignee)],
      ["Reporter", text(fields.reporter)],
      ["Creator", text(fields.creator)],
      ["Created", formatDateTime(fields.created)],
      ["Updated", formatDateTime(fields.updated)],
      ["Labels", text(fields.labels)],
      ["Components", text(fields.components)],
      ["Affected Versions", text(fields.versions)],
      ["Fix Versions", text(fields.fixVersions)],
      ["Attachment Count", String(attachments.length)],
      ["Comment Count", String(comments.length)],
      ["Link Count", String(links.length)],
      ["Changelog Count", String(changeItems.length)]
    ],
    summary: {
      totalEvents: activityTimeline.length,
      participants: participants.size,
      comments: comments.length,
      attachments: attachments.length,
      statusChanges: Array.from(fieldCounts.entries()).find(([field]) => field === "status")?.[1] ?? 0,
      leadTime: `${Math.max(0, Math.ceil((Date.parse(text(fields.updated)) - Date.parse(text(fields.created))) / 86400000))}d`
    },
    lifecycle: [["Created", formatDateTime(fields.created), "-"], ["Updated", formatDateTime(fields.updated), "-"], ["Resolved", text(resolution.name) === "-" ? "-" : formatDateTime(fields.resolutiondate), "-"]],
    participants: Array.from(participants.entries()).map(([name, stats]) => [name, String(stats.events), String(stats.changelog), String(stats.comments), String(stats.attachments), String(stats.status), formatDateTime(stats.first), formatDateTime(stats.last)]),
    transitions: Array.from(statusTransitions.entries()).map(([key, value]) => {
      const [from, to] = key.split(" -> ");
      return [from, to, String(value.count), formatDateTime(value.first), formatDateTime(value.last), Array.from(value.actors).join(", ")];
    }),
    fields: Array.from(fieldCounts.entries()).sort((a, b) => b[1] - a[1]).map(([field, count]) => [field, String(count), `${Math.round(count / Math.max(1, changeItems.length) * 100)}%`, "-", "-"]),
    fieldChanges,
    comments: [
      ["Comment Count", String(comments.length)],
      ["Comment Authors Count", String(new Set(comments.map((item) => text(item.author))).size)],
      ["First Comment Time", formatDateTime(comments[0]?.created)],
      ["Last Comment Time", formatDateTime(comments.at(-1)?.created)],
      ["Edited Comments Count", String(comments.filter((item) => text(item.created) !== text(item.updated)).length)]
    ],
    commentRows,
    attachments: attachmentRows,
    links: links.map((item) => {
      const record = asRecord(item);
      const linked = asRecord(record.outwardIssue ?? record.inwardIssue);
      const linkedFields = asRecord(linked.fields);
      return [text(record.id), text(asRecord(record.type).name), record.outwardIssue ? "outward" : "inward", text(linked.key), text(linkedFields.summary), text(asRecord(linkedFields.status).name), text(asRecord(linkedFields.issuetype).name)];
    }),
    risks: [
      comments.length === 0 ? "No comments found" : "",
      (fieldCounts.get("status") ?? 0) > 8 ? "Many status changes" : "",
      (fieldCounts.get("assignee") ?? 0) > 3 ? "Many assignee changes" : "",
      attachments.length > 10 ? "Many attachments" : "",
      "No database write performed"
    ].filter(Boolean),
    timeline: activityTimeline,
    rawData
  };
});

ipcMain.handle("jira-analysis:save-export", async (_event, payload: { category: "jira-analysis" | "raw-data" | "debug-bundles"; defaultFileName: string; data: unknown }) => {
  return saveExportJson(payload);
});

ipcMain.handle("jira-probe:load-env", async () => {
  return ensureProbeEnv();
});

ipcMain.handle("jira-probe:save-result", async (_event, payload: { defaultFileName: string; content: string }) => {
  return saveExportJson({
    category: "jira-probe",
    defaultFileName: payload.defaultFileName,
    data: JSON.parse(payload.content)
  });
});

ipcMain.handle("jira-probe:save-raw-data", async (_event, payload: { defaultFileName: string; data: unknown }) => {
  return saveExportJson({
    category: "raw-data",
    defaultFileName: payload.defaultFileName,
    data: payload.data
  });
});

function autoSaveRun(payload: { resultType: AutoSaveResultType; runId: string; status: string; data: unknown }) {
  const directoryByType: Record<AutoSaveResultType, string> = {
    activity_stream_run: "activity-stream-runs",
    precision_probe_run: "precision-probe-runs",
    manual_url_replay_run: "manual-url-replay-runs",
    maxresults_cap_test: "maxresults-cap-tests"
  };
  const prefixByType: Record<AutoSaveResultType, string> = {
    activity_stream_run: "activity-stream-run",
    precision_probe_run: "precision-probe-run",
    manual_url_replay_run: "manual-url-replay-run",
    maxresults_cap_test: "maxresults-cap-test"
  };
  const savedAt = new Date().toISOString();
  const stamp = fileTimestamp();
  const safeRunId = String(payload.runId || "missing-run-id").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
  const folderPath = ensureDir(path.join(getExportsDir(), "user-analysis", directoryByType[payload.resultType]));
  const filePath = path.join(folderPath, `${prefixByType[payload.resultType]}-${stamp}_${safeRunId}.json`);
  const data = asRecord(payload.data);
  const document = sanitizeExportData({
    ...data,
    runId: payload.runId,
    resultStatus: payload.status,
    autoSave: { enabled: true, savedAt, path: filePath, resultType: payload.resultType },
    debugBundleHints: { includeInDebugBundle: true, resultType: payload.resultType, latestResult: true },
    debugBundle: { lastBundlePath: lastDebugBundle.path, lastBundleCreatedAt: lastDebugBundle.createdAt },
    crossPageDebugBundleTodo
  }) as Record<string, unknown>;
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  const saved = { runId: payload.runId, resultType: payload.resultType, status: payload.status, savedAt, filePath, folderPath, data: document };
  latestAutoSavedRuns.delete(payload.resultType);
  latestAutoSavedRuns.set(payload.resultType, saved);
  autoSavedRunHistory.unshift(saved);
  if (autoSavedRunHistory.length > 50) autoSavedRunHistory.length = 50;
  const stream = asRecord(document.activityStream);
  const diagnosis = String(stream.diagnosis ?? document.diagnosis ?? "unknown");
  const parsedActivityCount = Number(stream.parsedActivityCount ?? document.parsedActivityCount ?? 0);
  latestRunResult = saved;
  if (["parsed", "parsed_confluence_only", "parsed_no_issue_keys"].includes(diagnosis)) lastSuccessfulResult = saved;
  if (parsedActivityCount > 0) lastParsedResult = saved;
  if (diagnosis === "no_entries") latestNoEntriesResult = saved;
  const summarize = (run: AutoSavedRun | null) => run ? { runId: run.runId, resultType: run.resultType, status: run.status, diagnosis: String(asRecord(run.data.activityStream).diagnosis ?? run.data.diagnosis ?? "unknown"), parsedActivityCount: Number(asRecord(run.data.activityStream).parsedActivityCount ?? run.data.parsedActivityCount ?? 0), savedAt: run.savedAt, path: run.filePath, folderPath: run.folderPath } : null;
  return { canceled: false, ...saved, data: undefined, resultTracking: { latestRunResult: summarize(latestRunResult), lastSuccessfulResult: summarize(lastSuccessfulResult), lastParsedResult: summarize(lastParsedResult), latestNoEntriesResult: summarize(latestNoEntriesResult) } };
}

ipcMain.handle("user-analysis:auto-save-run", async (_event, payload: { resultType: AutoSaveResultType; runId: string; status: string; data: unknown }) => autoSaveRun(payload));

function writeBundleJson(folderPath: string, fileName: string, data: unknown) {
  fs.writeFileSync(path.join(folderPath, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function summarizeAutoSavedRun(run: AutoSavedRun | null) {
  return run ? {
    runId: run.runId,
    resultType: run.resultType,
    status: run.status,
    diagnosis: String(asRecord(run.data.activityStream).diagnosis ?? run.data.diagnosis ?? "unknown"),
    parsedActivityCount: Number(asRecord(run.data.activityStream).parsedActivityCount ?? run.data.parsedActivityCount ?? 0),
    savedAt: run.savedAt,
    path: run.filePath,
    folderPath: run.folderPath
  } : null;
}

function collectSessionAutoSavedRuns() {
  const candidates = [
    ...autoSavedRunHistory,
    ...Array.from(latestAutoSavedRuns.values()),
    latestRunResult,
    lastSuccessfulResult,
    lastParsedResult,
    latestNoEntriesResult
  ].filter((run): run is AutoSavedRun => Boolean(run));
  const paths = new Set<string>();
  const runIds = new Set<string>();
  const basenames = new Set<string>();
  return candidates.filter((run) => {
    const resolvedPath = path.resolve(run.filePath).toLowerCase();
    const basename = path.basename(run.filePath).toLowerCase();
    if (paths.has(resolvedPath) || runIds.has(run.runId) || basenames.has(basename)) return false;
    paths.add(resolvedPath);
    runIds.add(run.runId);
    basenames.add(basename);
    return true;
  });
}

function debugLogTimeline(debugLog: string) {
  return maskDiagnosticText(debugLog).split(/\r?\n/).filter(Boolean).map((line, index) => {
    const matched = /^(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/.exec(line);
    const time = matched
      ? new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), Number(matched[4]), Number(matched[5]), Number(matched[6]), Number(matched[7] || 0)).toISOString()
      : sessionStartTime;
    return { time, source: "debug_log", type: "debug", sequence: index, message: line };
  });
}

ipcMain.handle("debug-log:save-bundle", async (_event, payload: { debugLog: string; currentPage: string; fullFetchIdentity?: Partial<FullFetchRunIdentity> }) => {
  const createdAt = new Date().toISOString();
  const outputRoot = ensureDir(getDebugFoldersDir());
  const folderPath = createCollisionSafeDirectory(
    getAppRuntimeDir(),
    outputRoot,
    `jira-activity-analyzer-debug-folder-${fileTimestamp()}`
  );
  const requestedFullFetchIdentity = payload.fullFetchIdentity;
  let currentRunRecord: FullFetchRunRecord | null = null;
  if (requestedFullFetchIdentity?.attemptId && requestedFullFetchIdentity.selectedTimelineRunId && requestedFullFetchIdentity.fullFetchRunId && requestedFullFetchIdentity.stagingId) {
    try {
      currentRunRecord = fullFetchRunRegistry.resolve(requestedFullFetchIdentity as FullFetchRunIdentity);
    } catch {
      currentRunRecord = null;
    }
  } else if (!requestedFullFetchIdentity && latestFullFetchAttempt) {
    currentRunRecord = fullFetchRunRegistry.resolveByAttemptId(latestFullFetchAttempt.attemptId);
  }
  const currentAttempt = currentRunRecord?.attempt ?? (requestedFullFetchIdentity ? null : latestFullFetchAttempt);
  const timelineForBundle = currentAttempt ? timelineRunResults.get(currentAttempt.selectedTimelineRunId) ?? null : latestUserActivityTimeline;
  const copiedEntries: DebugFolderEntry[] = [];
  const evidenceEntries: DebugEvidenceEntry[] = [];
  const savedRuns = Array.from(latestAutoSavedRuns.values());
  const latest = latestRunResult;
  const unavailable = { status: "not_available", message: "No matching auto-saved result available" };
  const summarize = summarizeAutoSavedRun;
  const runHistory = autoSavedRunHistory.map((run) => summarize(run));
  const activityStreamHistory = autoSavedRunHistory.filter((run) => run.resultType === "activity_stream_run").map((run) => summarize(run));
  const autoSavedCandidates = collectSessionAutoSavedRuns();
  const pathTracking = { latestRunResult: summarize(latestRunResult), lastSuccessfulResult: summarize(lastSuccessfulResult), lastParsedResult: summarize(lastParsedResult), latestNoEntriesResult: summarize(latestNoEntriesResult), autoSavedResultPaths: autoSavedCandidates.map((run) => summarize(run)) };
  const actionLog = sessionUserActions.length > 0 ? sessionUserActions.map((action) => action.raw).join("\n") : "No user action log entries are available for this session.";
  const debugContent = `${maskDiagnosticText(payload.debugLog).trimEnd()}\n`;
  const bundleLogsDir = ensureDir(path.join(folderPath, "logs"));
  const environmentDir = ensureDir(path.join(folderPath, "environment"));
  const diagnosticSnapshot = persistentDiagnostics.snapshot();
  const collectDiagnosticFile = (id: string, sourcePath: string, relativePath: string, missingStatus: "not_observed" | "source_missing" = "not_observed") => {
    if (!fs.existsSync(sourcePath)) {
      evidenceEntries.push({ id, status: missingStatus, sourcePath, relativePath, reason: missingStatus === "not_observed" ? "No matching event was observed in this session." : "Expected source file does not exist." });
      return;
    }
    const copied = collectDebugFolderSources(folderPath, [{ sourcePath, relativePath }]);
    copiedEntries.push(...copied.entries);
    const result = copied.entries[0];
    evidenceEntries.push({
      id,
      status: result?.status ?? "copy_failed",
      sourcePath,
      relativePath,
      reason: result?.reason ?? "No copy result was produced."
    });
  };
  for (const fileName of ["main.ndjson", "renderer.ndjson", "transitions.ndjson", "session-summary.json"]) {
    collectDiagnosticFile(`current_session_${fileName}`, path.join(diagnosticSnapshot.sessionDir, fileName), `sessions/current/${fileName}`);
  }
  if (diagnosticSnapshot.previousSessionId) {
    const previousDir = path.join(diagnosticSnapshot.sessionsDir, diagnosticSnapshot.previousSessionId);
    for (const fileName of ["main.ndjson", "renderer.ndjson", "transitions.ndjson", "session-summary.json"]) {
      collectDiagnosticFile(`previous_session_${fileName}`, path.join(previousDir, fileName), `sessions/previous/${fileName}`);
    }
  } else {
    evidenceEntries.push({ id: "previous_session", status: "source_missing", reason: "No previous diagnostic session is available yet." });
  }
  collectDiagnosticFile("latest_session_pointer", diagnosticSnapshot.latestPath, "sessions/latest-session.json", "source_missing");

  const diagnosticText = ["main.ndjson", "renderer.ndjson", "transitions.ndjson"]
    .flatMap((fileName) => [
      path.join(diagnosticSnapshot.sessionDir, fileName),
      diagnosticSnapshot.previousSessionId ? path.join(diagnosticSnapshot.sessionsDir, diagnosticSnapshot.previousSessionId, fileName) : ""
    ])
    .filter((filePath) => filePath && fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  for (const eventName of ["react_error_boundary", "window.error", "window.unhandledrejection", "render-process-gone", "did-fail-load", "unresponsive", "responsive"]) {
    evidenceEntries.push({
      id: eventName,
      status: diagnosticText.includes(`"event":"${eventName}"`) ? "copied" : "not_observed",
      reason: diagnosticText.includes(`"event":"${eventName}"`) ? "Event is present in collected session diagnostics." : "No matching event was observed."
    });
  }

  const pathAudit = buildPathAudit({
    appRoot: getAppRuntimeDir(),
    executablePath: process.execPath,
    isPackaged: app.isPackaged,
    checkedAt: createdAt,
    paths: {
      userData: getAppDataDir(),
      sessionData: getSessionDataDir(),
      cache: getCacheDir(),
      logs: getLogsDir(),
      crashDumps: getCrashDumpsDir(),
      temp: getTempDir(),
      fullFetchStaging: getFullFetchStagingDir(),
      exports: getExportsDir(),
      sourceArchive: getSourceArchivesDir(),
      debugFolders: getDebugFoldersDir()
    }
  });
  writeBundleJson(folderPath, "path-audit.json", pathAudit);
  evidenceEntries.push({ id: "path_audit", status: "copied", relativePath: "path-audit.json", reason: pathAudit.containment.allInsideAppRoot ? "Path audit generated; all controlled paths are inside APP_ROOT." : "Path audit generated with containment violations." });
  fs.writeFileSync(path.join(folderPath, "debug-log.txt"), debugContent, "utf8");
  fs.writeFileSync(path.join(folderPath, "user-action-log.txt"), `${maskDiagnosticText(actionLog).trimEnd()}\n`, "utf8");
  fs.writeFileSync(path.join(bundleLogsDir, "debug-log.txt"), debugContent, "utf8");
  fs.writeFileSync(path.join(bundleLogsDir, "user-action-log.txt"), `${maskDiagnosticText(actionLog).trimEnd()}\n`, "utf8");
  writeBundleJson(folderPath, "app-metadata.json", { name: "Jira Activity Analyzer", version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__, sessionStartTime, generatedAt: createdAt, currentPage: payload.currentPage });
  writeBundleJson(environmentDir, "app-metadata.json", { name: "Jira Activity Analyzer", version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__, sessionStartTime, generatedAt: createdAt, currentPage: payload.currentPage, platform: process.platform, arch: process.arch });
  writeBundleJson(folderPath, "request-context.json", asRecord(latest?.data.requestContext));
  writeBundleJson(folderPath, "latest-result.json", latest?.data ?? unavailable);
  writeBundleJson(folderPath, "latest-run-result.json", latest?.data ?? unavailable);
  writeBundleJson(folderPath, "last-successful-result.json", lastSuccessfulResult?.data ?? unavailable);
  writeBundleJson(folderPath, "last-parsed-result.json", lastParsedResult?.data ?? unavailable);
  writeBundleJson(folderPath, "latest-no-entries-result.json", latestNoEntriesResult?.data ?? unavailable);
  writeBundleJson(folderPath, "run-history.json", runHistory);
  writeBundleJson(folderPath, "activity-stream-run-history.json", activityStreamHistory);
  writeBundleJson(folderPath, "auto-saved-result-paths.json", pathTracking);
  const autoSavedResultsFolder = ensureDir(path.join(folderPath, "auto-saved-results"));
  const autoSavedResultsIncluded: Array<Record<string, unknown>> = [];
  const autoSavedResultsMissing: Array<Record<string, unknown>> = [];
  const exportsRoot = path.resolve(getExportsDir());
  for (const run of autoSavedCandidates) {
    const sourcePath = path.resolve(run.filePath);
    if (!isPathInsideRoot(exportsRoot, sourcePath)) {
      autoSavedResultsMissing.push({ runId: run.runId, path: sourcePath, sourcePath, reason: "outside_exports_directory" });
      continue;
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      autoSavedResultsMissing.push({ runId: run.runId, path: sourcePath, sourcePath, reason: "file_not_found" });
      continue;
    }
    try {
      const bundleFileName = path.basename(sourcePath);
      const copied = collectDebugFolderSources(folderPath, [{ sourcePath, relativePath: `auto-saved-results/${bundleFileName}` }]);
      copiedEntries.push(...copied.entries);
      if (copied.failed.length > 0) throw new Error(copied.failed[0]?.reason || "copy failed");
      autoSavedResultsIncluded.push({ ...summarize(run), sourcePath, bundlePath: `auto-saved-results/${bundleFileName}` });
    } catch (error) {
      autoSavedResultsMissing.push({ runId: run.runId, path: sourcePath, sourcePath, reason: `copy_failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  writeBundleJson(folderPath, "auto-saved-results-index.json", { included: autoSavedResultsIncluded, missing: autoSavedResultsMissing });
  const latestBaselineRecord = latestActivityStreamBaselineGuardRecord;
  const unavailableTimeline = { status: "not_available", message: "No User Activity Timeline has been built in this session." };
  writeBundleJson(folderPath, "user-activity-timeline.json", timelineForBundle ? { app: { version: __MAIN_APP_VERSION__, gitCommit: __MAIN_GIT_COMMIT__ }, timelineRunId: timelineForBundle.timelineRunId, summary: timelineForBundle.summary, events: timelineForBundle.events } : unavailableTimeline);
  fs.writeFileSync(path.join(folderPath, "user-activity-timeline.csv"), timelineForBundle ? timelineCsv(timelineForBundle.events) : "\uFEFFstatus,message\r\nnot_available,No User Activity Timeline has been built in this session.\r\n", "utf8");
  writeBundleJson(folderPath, "timeline-build-summary.json", timelineForBundle?.summary ?? unavailableTimeline);
  writeBundleJson(folderPath, "timeline-event-schema.json", timelineEventSchema);
  writeBundleJson(folderPath, "timeline-integrity-diagnostics.json", timelineForBundle?.summary.integrity ?? unavailableTimeline);
  writeBundleJson(folderPath, "timeline-dedup-diagnostics.json", timelineForBundle?.summary.dedupDiagnostics ?? unavailableTimeline);
  writeBundleJson(folderPath, "timeline-issue-key-diagnostics.json", timelineForBundle ? { sourceParsedIssueKeyCount: timelineForBundle.summary.integrity.sourceParsedIssueKeyCount, timelinePrimaryIssueKeyCount: timelineForBundle.summary.integrity.timelinePrimaryIssueKeyCount, timelineAllIssueKeyCount: timelineForBundle.summary.integrity.timelineAllIssueKeyCount, sourceIssueKeys: timelineForBundle.summary.integrity.sourceIssueKeys, timelinePrimaryIssueKeys: timelineForBundle.summary.integrity.timelinePrimaryIssueKeys, timelineAllIssueKeys: timelineForBundle.summary.integrity.timelineAllIssueKeys, missingIssueKeysFromTimeline: timelineForBundle.summary.integrity.missingIssueKeysFromTimeline, missingIssueKeysFromPrimaryTimeline: timelineForBundle.summary.integrity.missingIssueKeysFromPrimaryTimeline } : unavailableTimeline);
  const timelineSourceSystemDiagnostics = timelineForBundle ? { available: true, sourceSystemCounts: timelineForBundle.summary.sourceSystemCounts, sourceDetailCounts: timelineForBundle.summary.sourceDetailCounts, unknownSamples: timelineForBundle.summary.sourceSystemDiagnostics.unknownSamples, classificationRulesVersion: timelineForBundle.summary.sourceSystemDiagnostics.classificationRulesVersion } : { available: false, sourceSystemCounts: { jira: 0, confluence: 0, other: 0, unknown: 0 }, sourceDetailCounts: {}, unknownSamples: [], classificationRulesVersion: "v0.2.21" };
  writeBundleJson(folderPath, "timeline-source-system-diagnostics.json", timelineSourceSystemDiagnostics);
  const timelineJiraRelationDiagnostics = timelineForBundle ? { available: true, jiraRelationCounts: timelineForBundle.summary.jiraRelationCounts, sourceApplicationCounts: timelineForBundle.summary.sourceApplicationCounts, confluenceLinkedToJiraCount: timelineForBundle.summary.confluenceLinkedToJiraCount, confluenceLinkedToJiraIssueGroups: timelineForBundle.summary.jiraRelationDiagnostics.confluenceLinkedToJiraIssueGroups, defaultSelectIssuesFilter: { jiraRelation: ["jira_related"], sourceApplication: ["jira", "confluence"] }, classificationRulesVersion: "v0.2.22" } : { available: false, jiraRelationCounts: { jiraRelated: 0, nonJiraRelated: 0, hasJiraIssueKey: 0, unknownRelation: 0 }, sourceApplicationCounts: { jira: 0, confluence: 0, other: 0, unknown: 0 }, confluenceLinkedToJiraCount: 0, confluenceLinkedToJiraIssueGroups: [], defaultSelectIssuesFilter: { jiraRelation: ["jira_related"], sourceApplication: ["jira", "confluence"] }, classificationRulesVersion: "v0.2.22" };
  writeBundleJson(folderPath, "timeline-jira-relation-diagnostics.json", timelineJiraRelationDiagnostics);
  writeBundleJson(folderPath, "full-fetch-attempt.json", currentAttempt ? { ...currentAttempt, historicalStagingIncluded: false } : { attemptStatus: "not_available", fullFetchRunCreated: false, stagingAvailable: false, historicalStagingIncluded: false });
  const fullFetchWasRun = currentAttempt?.fullFetchRunCreated === true;
  const failureEvidence = describeFullFetchFailureEvidence(fullFetchWasRun, latestFullFetchFailedIssues.length);
  const failureSummary = fullFetchWasRun
    ? { ...fullFetchFailureSummary(latestFullFetchFailedIssues), ...failureEvidence }
    : { ...failureEvidence, byHttpStatus: {}, byErrorCode: {}, byStage: {}, bySource: {} };
  if (fullFetchWasRun) writeBundleJson(folderPath, "full-fetch-failed-issues.json", latestFullFetchFailedIssues);
  writeBundleJson(folderPath, "full-fetch-failure-summary.json", failureSummary);
  evidenceEntries.push({
    id: "full_fetch",
    status: fullFetchWasRun ? "copied" : "not_run",
    relativePath: "full-fetch-failure-summary.json",
    reason: fullFetchWasRun ? "Full Fetch diagnostics were generated for an executed run." : "Full Fetch was not executed in this session."
  });
  let stagingForBundle: StagingRun | null = null;
  if (currentRunRecord) {
    try {
      stagingForBundle = loadStagingRun(currentRunRecord.stagingDir);
      if (stagingForBundle.state.fullFetchRunId !== currentRunRecord.fullFetchRunId || stagingForBundle.state.stagingId !== currentRunRecord.stagingId) stagingForBundle = null;
    } catch {
      stagingForBundle = null;
    }
  }
  const jiraEvidenceForBundle = fullFetchWasRun && String(latestJiraEvidence?.eventsDocument.runId ?? "") === currentAttempt?.fullFetchRunId ? latestJiraEvidence : null;
  const sourceArchiveForBundle = stagingForBundle && latestSourceArchiveExport?.fileName.includes(stagingForBundle.state.stagingId) ? latestSourceArchiveExport : null;
  const databaseWriteForBundle = currentRunRecord?.saveEvidence?.databaseWrite ?? null;
  const coverageDiagnosticsForBundle = fullFetchWasRun ? latestFullFetchCoverageDiagnostics : null;
  const fullFetchStagingIndex = stagingDebugIndex(stagingForBundle);
  writeBundleJson(folderPath, "full-fetch-staging-index.json", fullFetchStagingIndex);
  const stagingMetadataDir = ensureDir(path.join(folderPath, "staging-metadata"));
  writeBundleJson(stagingMetadataDir, "full-fetch-staging-index.json", fullFetchStagingIndex);
  if (stagingForBundle) {
    const stagingBundleDir = ensureDir(path.join(folderPath, "full-fetch-staging"));
    const stagingFiles = stagingPaths(stagingForBundle);
    const copyEntries = [
      [stagingFiles.state, "manifest.json"], [stagingFiles.index, "run-index.json"],
      [stagingFiles.result, "full-fetch-result.json"], [stagingFiles.exportResult, "export-result.json"],
      [stagingFiles.errors, "run-errors.json"], [stagingFiles.diagnostics, "staging-diagnostics.ndjson"]
    ];
    const stagingSources = copyEntries.filter(([source]) => fs.existsSync(source)).map(([source, name]) => ({ sourcePath: source, relativePath: `full-fetch-staging/${name}` }));
    if (fs.existsSync(path.join(stagingForBundle.dir, "issues"))) stagingSources.push({ sourcePath: path.join(stagingForBundle.dir, "issues"), relativePath: "full-fetch-staging/issues" });
    copiedEntries.push(...collectDebugFolderSources(folderPath, stagingSources).entries);
    const partialRecords = stagingForBundle.index.targets.filter((target) => target.status === "partial" || target.status === "required_partial").map((target) => ({ objectKey: target.objectKey, status: target.status, classification: target.classification, errorType: target.errorType, errorMessage: target.lastError, canonicalFiles: target.canonicalFiles }));
    writeBundleJson(stagingBundleDir, "partial-records-summary.json", { count: partialRecords.length, records: partialRecords });
    writeBundleJson(stagingMetadataDir, "staging-state.json", stagingForBundle.state);
    writeBundleJson(stagingMetadataDir, "queue-summary.json", { stagingId: stagingForBundle.state.stagingId, fullFetchRunId: stagingForBundle.state.fullFetchRunId, originalQueueOrder: stagingForBundle.index.originalQueueOrder, targets: stagingForBundle.index.targets.map((target) => ({ objectKey: target.objectKey, status: target.status, attemptCount: target.attemptCount, sizeBytes: target.sizeBytes, issueManifestRef: target.issueManifestRef, canonicalFiles: target.canonicalFiles })) });
  }
  let fullFetchResultMetadata: Record<string, unknown> = { included: false, status: "not_available", reason: "No Full Fetch Result is available for the current run." };
  let debugBundleStatus: "completed" | "completed_with_errors" = "completed";
  const expectedFullFetchRunId = currentAttempt?.fullFetchRunId ?? "";
  const resultFolder = ensureDir(path.join(folderPath, "full-fetch-result"));
  let fullFetchResultForBundle = currentRunRecord?.result ?? null;
  if (fullFetchResultForBundle && fullFetchResultForBundle.runId === expectedFullFetchRunId) {
    try {
      let sourcePath = fullFetchResultForBundle.savedPath;
      let generatedAutomatically = fullFetchResultForBundle.generatedAutomatically;
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        const saved = saveFullFetchResult(fullFetchResultForBundle.document, ensureDir(getFullFetchResultsDir()), `user-analysis-full-fetch-${fileTimestamp()}.json`);
        sourcePath = saved.filePath;
        generatedAutomatically = true;
        fullFetchResultForBundle = { ...fullFetchResultForBundle, savedPath: sourcePath, generatedAutomatically: true };
        if (currentRunRecord) currentRunRecord.result = fullFetchResultForBundle;
        if (latestFullFetchResult?.runId === expectedFullFetchRunId) latestFullFetchResult = fullFetchResultForBundle;
      }
      const targetName = path.basename(sourcePath);
      const copied = collectDebugFolderSources(folderPath, [{ sourcePath, relativePath: `full-fetch-result/${targetName}` }]);
      copiedEntries.push(...copied.entries);
      if (copied.failed.length > 0) throw new Error(copied.failed[0]?.reason || "Full Fetch Result copy failed");
      fullFetchResultMetadata = { included: true, status: "copied", runId: expectedFullFetchRunId, sourcePath: path.basename(sourcePath), bundlePath: `full-fetch-result/${targetName}`, generatedAutomatically };
    } catch (error) {
      debugBundleStatus = "completed_with_errors";
      fullFetchResultMetadata = { included: false, status: "copy_failed", runId: expectedFullFetchRunId, error: maskDiagnosticText(error instanceof Error ? error.message : String(error)) };
    }
  } else if (expectedFullFetchRunId) {
    debugBundleStatus = "completed_with_errors";
    fullFetchResultMetadata = { included: false, status: "run_mismatch", expectedRunId: expectedFullFetchRunId, availableRunId: fullFetchResultForBundle?.runId ?? "", error: "No matching Full Fetch Result document is available." };
  }
  writeBundleJson(resultFolder, "full-fetch-result-metadata.json", fullFetchResultMetadata);
  writeBundleJson(folderPath, "full-fetch-result-index.json", fullFetchResultMetadata);
  const unavailableEvidence = { status: "not_available", message: "No Direct Jira Evidence dataset has been extracted in this session." };
  writeBundleJson(folderPath, "jira-evidence-events.json", jiraEvidenceForBundle?.eventsDocument ?? unavailableEvidence);
  writeBundleJson(folderPath, "jira-evidence-summary.json", jiraEvidenceForBundle?.summary ?? unavailableEvidence);
  writeBundleJson(folderPath, "jira-evidence-excluded-summary.json", jiraEvidenceForBundle?.excluded ?? unavailableEvidence);
  writeBundleJson(folderPath, "jira-evidence-schema.json", jiraEvidenceSchema);
  writeBundleJson(folderPath, "analysis-roadmap.json", analysisRoadmap);
  const unavailableStabilityProbe = { status: "not_available", message: "No Activity Stream Stability Probe has run in this session." };
  writeBundleJson(folderPath, "activity-stream-stability-probe.json", latestActivityStreamStabilityProbeV2 ? { status: "legacy_v1_not_applicable", message: "V2 Round-first Stability data is authoritative. / V2 Round-first Stability 資料為正式依據。", authoritativeFile: "activity-stream-stability-probe-v2.json" } : latestActivityStreamStabilityProbe ?? unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-attempts.json", latestActivityStreamStabilityProbe ? { schemaVersion: "activity_stream_stability_attempts_v1", probeRunId: latestActivityStreamStabilityProbe.probeRunId, attempts: latestActivityStreamStabilityProbe.attempts } : unavailableStabilityProbe);
  fs.writeFileSync(path.join(folderPath, "activity-stream-attempt-comparison.csv"), latestActivityStreamStabilityProbe ? stabilityAttemptCsv(latestActivityStreamStabilityProbe.attempts) : "\uFEFFstatus,message\r\nnot_available,No Stability Probe result\r\n", "utf8");
  fs.writeFileSync(path.join(folderPath, "activity-stream-window-summary.csv"), latestActivityStreamStabilityProbe ? stabilityWindowCsv(latestActivityStreamStabilityProbe.windows) : "\uFEFFstatus,message\r\nnot_available,No Stability Probe result\r\n", "utf8");
  writeBundleJson(folderPath, "activity-stream-stability-recommendation.json", latestActivityStreamStabilityProbe ? { schemaVersion: "activity_stream_stability_recommendation_v1", probeRunId: latestActivityStreamStabilityProbe.probeRunId, recommendation: latestActivityStreamStabilityProbe.recommendation } : unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-stability-probe-v2.json", latestActivityStreamStabilityProbeV2 ?? unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-stability-setup.json", latestActivityStreamStabilityProbeV2 ? { selectedUser: latestActivityStreamStabilityProbeV2.selectedUser, dateRange: latestActivityStreamStabilityProbeV2.dateRange, requestWindow: latestActivityStreamStabilityProbeV2.config.requestWindow, fullScanRoundCount: latestActivityStreamStabilityProbeV2.config.fullScanRoundCount, delayBetweenRounds: latestActivityStreamStabilityProbeV2.config.delayBetweenRoundsMs, roundExecutionMode: latestActivityStreamStabilityProbeV2.config.roundExecutionMode, mergeStrategy: latestActivityStreamStabilityProbeV2.config.mergeStrategy, createdAt: latestActivityStreamStabilityProbeV2.startedAt, latestProbeRunId: latestActivityStreamStabilityProbeV2.probeRunId } : unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-rounds.json", latestActivityStreamStabilityProbeV2 ? { schemaVersion: "activity_stream_rounds_v2", probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, rounds: latestActivityStreamStabilityProbeV2.rounds } : unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-round-comparison.json", latestActivityStreamStabilityProbeV2 ? { schemaVersion: "activity_stream_round_comparison_v2", probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, comparison: latestActivityStreamStabilityProbeV2.comparison, rounds: latestActivityStreamStabilityProbeV2.rounds } : unavailableStabilityProbe);
  fs.writeFileSync(path.join(folderPath, "activity-stream-round-comparison.csv"), latestActivityStreamStabilityProbeV2 ? roundComparisonCsv(latestActivityStreamStabilityProbeV2.rounds) : "\uFEFFstatus,message\r\nnot_available,No V2 Stability Probe result\r\n", "utf8");
  fs.writeFileSync(path.join(folderPath, "activity-stream-window-diagnostics.csv"), latestActivityStreamStabilityProbeV2 ? windowDiagnosticsCsv(latestActivityStreamStabilityProbeV2.windowDiagnostics) : "\uFEFFstatus,message\r\nnot_available,No V2 Stability Probe result\r\n", "utf8");
  writeBundleJson(folderPath, "activity-stream-window-diagnostics.json", latestActivityStreamStabilityProbeV2 ? { schemaVersion: "activity_stream_window_diagnostics_v2", probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, windows: latestActivityStreamStabilityProbeV2.windowDiagnostics } : unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-raw-diagnostics.json", latestActivityStreamStabilityProbeV2 ? { schemaVersion: "activity_stream_raw_diagnostics_v2", probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, diagnostics: latestActivityStreamStabilityProbeV2.windowDiagnostics.map((item) => ({ logicalRequestId: item.logicalRequestId, classification: item.classification, physicalRequests: item.physicalRequests, processingTiming: item.processingTiming, rawResultSanitized: item.rawResultSanitized })) } : unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-stability-ui-state.json", { ...latestStabilityUiState, latestProbeRunId: latestActivityStreamStabilityProbeV2?.probeRunId ?? "", statePersistedAt: new Date().toISOString() });
  writeBundleJson(folderPath, "activity-stream-stability-recommendation-v2.json", latestActivityStreamStabilityProbeV2 ? { schemaVersion: "activity_stream_stability_recommendation_v2", probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, recommendation: latestActivityStreamStabilityProbeV2.recommendation } : unavailableStabilityProbe);
  writeBundleJson(folderPath, "activity-stream-benchmark.json", latestActivityStreamBenchmark ?? { status: "not_available", message: "No Activity Stream Benchmark has run in this session. / 本次工作階段尚未執行 Activity Stream 效能基準。" });
  fs.writeFileSync(path.join(folderPath, "activity-stream-benchmark.csv"), latestActivityStreamBenchmark ? benchmarkCsv(latestActivityStreamBenchmark) : "\uFEFFstatus,message\r\nnot_available,No Activity Stream Benchmark result\r\n", "utf8");
  writeBundleJson(folderPath, "activity-stream-benchmark-summary.json", latestActivityStreamBenchmark ? { schemaVersion: "activity_stream_benchmark_summary_v1", benchmarkRunId: latestActivityStreamBenchmark.benchmarkRunId, status: latestActivityStreamBenchmark.status, config: latestActivityStreamBenchmark.config, summary: latestActivityStreamBenchmark.summary } : { status: "not_available" });
  const sourceArchiveIndex = { ...(sourceArchiveForBundle ?? { fileName: "", exportRunId: "", selectedUser: "", createdAt: "", sizeBytes: 0, sha256: "", jiraObjectCount: 0, confluenceObjectCount: 0 }), includedInDebugBundle: false, excludeReason: sourceArchiveForBundle ? "source_archive_payload_omitted_by_policy" : "not_available", sourcePathSanitized: sourceArchiveForBundle ? path.basename(sourceArchiveForBundle.filePath) : "", metadataOnly: true };
  writeBundleJson(folderPath, "source-archive-export-index.json", sourceArchiveIndex);
  writeBundleJson(folderPath, "source-archive-database-write.json", databaseWriteForBundle ?? {
    status: "not_run",
    reasonCode: "DATABASE_WRITE_NOT_RUN",
    message: "No Stage 5 database write was observed in this session."
  });
  const databaseWriteOutcomes = Array.isArray(databaseWriteForBundle?.outcomes)
    ? databaseWriteForBundle.outcomes.map(asRecord)
    : [];
  writeBundleJson(folderPath, "volatile-field-candidates.json", {
    schemaVersion: "volatile_field_candidates_v1",
    stableHashPolicyVersion: "V4",
    generatedAt: createdAt,
    policyMutationPerformed: false,
    candidates: databaseWriteOutcomes.flatMap((outcome) =>
      Array.isArray(outcome.volatileFieldCandidates) ? outcome.volatileFieldCandidates : [])
  });
  writeBundleJson(folderPath, "stable-hash-field-diff.json", {
    schemaVersion: "stable_hash_field_diff_v1",
    stableHashPolicyVersion: "V4",
    generatedAt: createdAt,
    issues: databaseWriteOutcomes
      .map((outcome) => outcome.stableHashFieldDiff)
      .filter((value) => value && typeof value === "object")
  });
  writeBundleJson(folderPath, "source-archive-migration.json", latestSourceArchiveMigration ?? {
    status: "not_run",
    reasonCode: "MIGRATION_NOT_RUN",
    message: "No Source Archive schema migration was observed in this session."
  });
  const sourceVersionProjectionDir = ensureDir(path.join(folderPath, "source-version-projection"));
  const sourceVersionDiagnostics = stagingForBundle && databaseWriteForBundle
    ? buildSourceVersionProjectionDiagnostics(stagingForBundle, databaseWriteForBundle)
    : [];
  for (const diagnostic of sourceVersionDiagnostics) {
    const issueKey = diagnostic.issueKey.toUpperCase().replace(/[^A-Z0-9_-]+/g, "_");
    writeBundleJson(sourceVersionProjectionDir, `${issueKey}-stable-projection.json`, diagnostic.projection);
    writeBundleJson(sourceVersionProjectionDir, `${issueKey}-hash-input.json`, diagnostic.hashInput);
    writeBundleJson(sourceVersionProjectionDir, `${issueKey}-version-decision.json`, diagnostic.decision);
  }
  const sourceArchiveMetadataDir = ensureDir(path.join(folderPath, "source-archive-metadata"));
  writeBundleJson(sourceArchiveMetadataDir, "source-archive-export-index.json", sourceArchiveIndex);
  writeBundleJson(sourceArchiveMetadataDir, "source-archive-verification.json", sourceArchiveForBundle?.verification ?? { status: "not_available" });
  const exportHistoryDir = ensureDir(path.join(folderPath, "export-history"));
  writeBundleJson(exportHistoryDir, "step-5-history.json", { fullFetchRunId: expectedFullFetchRunId, actions: stagingForBundle?.state.step5History ?? [], note: "Source payloads and attachment files are omitted by policy." });
  writeBundleJson(folderPath, "full-fetch-coverage-diagnostics.json", coverageDiagnosticsForBundle ?? { status: "not_available", jira: {}, confluence: {} });
  const worklogCompletenessReport = stagingForBundle ? stagingForBundle.index.targets.map((target) => ({
    issueKey: target.objectKey,
    targetStatus: target.status,
    worklogs: target.coverage.find((entry) => entry.category === "worklogs") ?? { status: "not_collected", recordCount: 0 },
    blockingReasons: target.partialReasons.filter((reason) => String(reason.component ?? "") === "worklogs")
  })) : [];
  writeBundleJson(folderPath, "worklog-completeness-report.json", { schemaVersion: "worklog_completeness_report_v1", runId: expectedFullFetchRunId, issues: worklogCompletenessReport });
  const contentDisplayDecisions = databaseWriteOutcomes.flatMap((outcome) => Array.isArray(outcome.contentDisplayDecisions) ? outcome.contentDisplayDecisions.map(asRecord) : []);
  writeBundleJson(folderPath, "content-display-decision-report.json", { schemaVersion: "content_display_decision_report_v1", runId: expectedFullFetchRunId, decisions: contentDisplayDecisions });
  const contentDecisionColumns = ["Display Mode", "Display Content", "Content Source", "Before Complete", "After Complete", "Parse Status", "Comment ID", "Worklog ID"];
  const contentDecisionRows = contentDisplayDecisions.map((decision) => [decision.displayMode, decision.displayText, decision.contentSource, decision.beforeComplete, decision.afterComplete, decision.parseStatus, decision.commentId, decision.worklogId].map(csvCell).join(","));
  fs.writeFileSync(path.join(folderPath, "content-display-decisions.csv"), `\uFEFF${contentDecisionColumns.join(",")}\r\n${contentDecisionRows.join("\r\n")}\r\n`, "utf8");
  writeBundleJson(folderPath, "content-parse-failure-evidence.json", { schemaVersion: "content_parse_failure_evidence_v1", failures: contentDisplayDecisions.filter((decision) => decision.parseStatus === "failed") });
  writeBundleJson(folderPath, "source-archive-file-assessment.json", {
    schemaVersion: "source_archive_file_assessment_v1",
    generatedAt: createdAt,
    files: [
      { file: "full-fetch raw issue payloads", eligibility: "full", includePaths: ["$.issue.json", "$.rawIssueResponsesSanitized[*].json"], excludePaths: ["$.endpointMetadata", "$.bodyPreview"], reason: "Jira Full Fetch raw JSON is eligible. / Jira 完整抓取原始 JSON 可納入。" },
      { file: "confluence full-fetch raw page payloads", eligibility: "full", includePaths: ["$.rawPayload"], excludePaths: [], reason: "Confluence Full Fetch raw JSON is eligible when available. / Confluence 完整抓取原始 JSON 可於存在時納入。" },
      { file: "full-fetch result", eligibility: "partial", includePaths: ["raw Full Fetch payload only"], excludePaths: ["report", "evidence", "coverageDiagnostics", "endpointMetadata"], reason: "Only source raw payloads are eligible. / 僅來源原始 payload 可納入。" },
      { file: "activity-stream-stability-probe-v2.json", eligibility: "not_applicable", includePaths: [], excludePaths: ["$"], reason: "Probe data is excluded from Source Archive packages. / Probe 資料不得納入來源封存套件。" },
      { file: "user-activity-timeline.json", eligibility: "reference_only", includePaths: [], excludePaths: ["$"], reason: "Timeline may guide selection but is never archived as source raw data. / Timeline 僅供選取參考，不作為來源原始資料封存。" }
    ]
  });
  const unavailableWorkflow = { status: "not_available", message: "No User Analysis workflow snapshot is available." };
  const defaultUserAnalysisUiState = {
    workflowStepCount: 5,
    advancedToolsVisible: false,
    fullFetchProgressLocation: "step3_full_fetch",
    timeline: { visibleColumns: ["time", "user", "issueKey", "activityType", "sourceApplication"], requiredColumns: ["time", "user", "issueKey", "activityType", "sourceApplication"], optionalColumns: [], filters: {}, filteredCount: 0, totalCount: 0 },
    selectIssues: { visibleColumns: ["selected", "issueKey", "sourceApplications", "eventCount", "firstSeen", "lastSeen"], requiredColumns: ["selected", "issueKey", "sourceApplications", "eventCount", "firstSeen", "lastSeen"], optionalColumns: [], filters: {}, filteredCount: 0, totalCount: 0 }
  };
  const userAnalysisUiState = Object.keys(latestUserAnalysisWorkflow?.uiState ?? {}).length > 0 ? latestUserAnalysisWorkflow!.uiState : defaultUserAnalysisUiState;
  writeBundleJson(folderPath, "user-analysis-steps.json", latestUserAnalysisWorkflow?.steps ?? unavailableWorkflow);
  writeBundleJson(folderPath, "timeline-issue-groups.json", latestUserAnalysisWorkflow?.timelineIssueGroups ?? unavailableWorkflow);
  writeBundleJson(folderPath, "timeline-selected-issues.json", latestUserAnalysisWorkflow ? { selectedIssueKeys: latestUserAnalysisWorkflow.timelineSelectedIssues, count: latestUserAnalysisWorkflow.timelineSelectedIssues.length } : unavailableWorkflow);
  writeBundleJson(folderPath, "fetch-queue.json", latestUserAnalysisWorkflow?.fetchQueue ?? unavailableWorkflow);
  writeBundleJson(folderPath, "related-candidate-issues.json", latestUserAnalysisWorkflow?.relatedCandidateIssues ?? unavailableWorkflow);
  writeBundleJson(folderPath, "timeline-event-list-ui-state.json", asRecord(userAnalysisUiState.timeline));
  writeBundleJson(folderPath, "select-issues-ui-state.json", asRecord(userAnalysisUiState.selectIssues));
  const workflowRelatedScope = latestUserAnalysisWorkflow ? relatedIssueScopeSummary(latestUserAnalysisWorkflow.relatedCandidateIssues, latestUserAnalysisWorkflow.addedRecommendedRelatedIssuesToFetchQueueCount, latestUserAnalysisWorkflow.addedOptionalRelatedIssuesToFetchQueueCount) : unavailableWorkflow;
  writeBundleJson(folderPath, "related-issue-expansion-summary.json", latestUserAnalysisWorkflow ? { ...relatedIssueSummary(latestUserAnalysisWorkflow.relatedCandidateIssues), ...workflowRelatedScope, addedRelatedIssuesToFetchQueueCount: latestUserAnalysisWorkflow.addedRelatedIssuesToFetchQueueCount } : unavailableWorkflow);
  const sessionTimeline = [
    ...sessionUserActions.map((action, index) => ({ time: action.time, source: "user_action", type: "user_action", sequence: index, action: action.message, page: payload.currentPage })),
    ...debugLogTimeline(payload.debugLog),
    ...autoSavedRunHistory.map((run, index) => ({ time: run.savedAt, source: "activity_run_history", type: "activity_stream_result", sequence: index, runId: run.runId, status: run.status, diagnosis: String(asRecord(run.data.activityStream).diagnosis ?? run.data.diagnosis ?? "unknown"), parsedActivityCount: Number(asRecord(run.data.activityStream).parsedActivityCount ?? run.data.parsedActivityCount ?? 0), autoSavedPath: run.filePath })),
    ...autoSavedCandidates.map((run, index) => ({ time: run.savedAt, source: "auto_save_path", type: "auto_save_path", sequence: index, runId: run.runId, path: run.filePath })),
    ...activityStreamBaselineGuardHistory.map((record, index) => ({ time: record.time, source: "activity_stream_baseline_guard", type: "activity_stream_baseline_guard", sequence: index, runId: record.runId, classification: record.comparison.classification, shouldRetry: record.comparison.shouldRetry, retryTriggered: record.retry.triggered })),
    ...(timelineForBundle ? [{ time: timelineForBundle.summary.builtAt, source: "user_analysis", type: "user_activity_timeline_built", sequence: 0, timelineRunId: timelineForBundle.timelineRunId, totalEvents: timelineForBundle.summary.totalEvents, issueKeyCount: timelineForBundle.summary.issueKeyCount }] : [])
    ,...sessionUserActions.filter((action) => action.message === "timeline_issues_added_to_fetch_queue" || action.message === "related_issues_expanded").map((action, index) => ({ time: action.time, source: "user_analysis", type: action.message, sequence: index }))
  ].sort((left, right) => left.time.localeCompare(right.time));
  writeBundleJson(folderPath, "session-timeline.json", sessionTimeline);
  const latestChunkedRun = autoSavedRunHistory.find((run) => Array.isArray(run.data.activityStreamChunkResults) && run.data.activityStreamChunkResults.length > 0 && Number(asRecord(run.data.activityStream).parsedActivityCount ?? 0) > 0)
    ?? autoSavedRunHistory.find((run) => Array.isArray(run.data.activityStreamChunkResults) && run.data.activityStreamChunkResults.length > 0);
  writeBundleJson(folderPath, "activity-stream-chunk-results.json", latestChunkedRun?.data.activityStreamChunkResults ?? []);
  writeBundleJson(folderPath, "activity-stream-merged-result.json", latestChunkedRun ? { runId: latestChunkedRun.runId, dateRangeChunking: latestChunkedRun.data.dateRangeChunking, chunkMergeStats: latestChunkedRun.data.chunkMergeStats, activityStream: latestChunkedRun.data.activityStream } : unavailable);
  const diagnosticsRun = autoSavedRunHistory.find((run) => asRecord(run.data.standardActivityStreamFlow).enabled === true) ?? latest;
  const standardActivityStreamFlow = asRecord(diagnosticsRun?.data.standardActivityStreamFlow);
  const classifierDiagnostics = asRecord(diagnosticsRun?.data.activityTypeClassifierDiagnostics ?? asRecord(diagnosticsRun?.data.activityStream).activityTypeClassifierDiagnostics);
  const advancedDiagnosticsUsed = diagnosticsRun?.data.advancedDiagnosticsUsed === true;
  writeBundleJson(folderPath, "standard-activity-stream-flow.json", Object.keys(standardActivityStreamFlow).length > 0 ? standardActivityStreamFlow : unavailable);
  writeBundleJson(folderPath, "activity-type-classifier-diagnostics.json", Object.keys(classifierDiagnostics).length > 0 ? classifierDiagnostics : unavailable);
  writeBundleJson(folderPath, "activity-stream-baseline-comparison.json", latestBaselineRecord?.comparison ?? unavailable);
  writeBundleJson(folderPath, "activity-stream-baseline-snapshot.json", latestBaselineRecord?.snapshot ?? unavailable);
  writeBundleJson(folderPath, "activity-stream-baseline-history.json", latestBaselineRecord?.snapshot.baselineHistory ?? []);
  writeBundleJson(folderPath, "activity-stream-baseline-comparisons.json", activityStreamBaselineGuardHistory.map((record) => ({ time: record.time, runId: record.runId, comparison: record.comparison, retry: record.retry })));
  const activityStreamBaselineGuard = latestBaselineRecord ? { enabled: true, latestClassification: latestBaselineRecord.retry.finalClassification, shouldRetry: latestBaselineRecord.comparison.shouldRetry, retryTriggered: latestBaselineRecord.retry.triggered, retryRecovered: latestBaselineRecord.retry.retryRecovered, baselinePath: latestBaselineRecord.comparison.baselinePath, baselineBestParsedActivityCount: latestBaselineRecord.comparison.baselineCounts.bestParsedActivityCount, currentParsedActivityCount: latestBaselineRecord.comparison.currentCounts.parsedActivityCount, missingIssueKeyCount: latestBaselineRecord.comparison.missingIssueKeys.length, missingEntryFingerprintCount: latestBaselineRecord.comparison.missingEntryFingerprints.length } : { enabled: true, latestClassification: "not_run", shouldRetry: false, retryTriggered: false, retryRecovered: false, baselinePath: "", baselineBestParsedActivityCount: 0, currentParsedActivityCount: 0, missingIssueKeyCount: 0, missingEntryFingerprintCount: 0 };
  const userActivityTimeline = timelineForBundle ? { available: true, timelineRunId: timelineForBundle.timelineRunId, totalEvents: timelineForBundle.summary.totalEvents, issueKeyCount: timelineForBundle.summary.issueKeyCount, eventTypeCounts: timelineForBundle.summary.eventTypeCounts, confidenceCounts: timelineForBundle.summary.confidenceCounts, jsonPath: "user-activity-timeline.json", csvPath: "user-activity-timeline.csv" } : { available: false };
  const timelineIntegrity = timelineForBundle ? { available: true, sourceParsedActivityCount: timelineForBundle.summary.integrity.sourceParsedActivityCount, timelineEventCount: timelineForBundle.summary.integrity.timelineEventCount, difference: timelineForBundle.summary.eventCountReconciliation.difference, deduplicatedEntryCount: timelineForBundle.summary.integrity.deduplicatedEntryCount, skippedEntryCount: timelineForBundle.summary.integrity.skippedEntryCount, unexplainedDifferenceCount: timelineForBundle.summary.eventCountReconciliation.unexplainedDifferenceCount, sourceParsedIssueKeyCount: timelineForBundle.summary.integrity.sourceParsedIssueKeyCount, timelinePrimaryIssueKeyCount: timelineForBundle.summary.integrity.timelinePrimaryIssueKeyCount, timelineAllIssueKeyCount: timelineForBundle.summary.integrity.timelineAllIssueKeyCount, missingIssueKeysFromTimeline: timelineForBundle.summary.integrity.missingIssueKeysFromTimeline, missingIssueKeysFromPrimaryTimeline: timelineForBundle.summary.integrity.missingIssueKeysFromPrimaryTimeline } : { available: false };
  writeBundleJson(folderPath, "debug-bundle-summary.json", { generatedAt: createdAt, currentPage: payload.currentPage, latestRunResult: summarize(latestRunResult), lastSuccessfulResult: summarize(lastSuccessfulResult), latestNoEntriesResult: summarize(latestNoEntriesResult), runHistoryCount: runHistory.length, snapshotConsistent: !latestRunResult || runHistory.some((run) => run?.runId === latestRunResult?.runId), dateRangeChunking: latestChunkedRun?.data.dateRangeChunking ?? { enabled: false }, chunkMergeStats: latestChunkedRun?.data.chunkMergeStats ?? {}, standardActivityStreamFlow, activityTypeClassifierDiagnostics: classifierDiagnostics, activityStreamBaselineGuard, userActivityTimeline, timelineIntegrity, timelineSourceSystem: { available: timelineSourceSystemDiagnostics.available, ...timelineSourceSystemDiagnostics.sourceSystemCounts, defaultSelectIssuesFilter: "jira" }, timelineJiraRelation: { available: timelineJiraRelationDiagnostics.available, ...timelineJiraRelationDiagnostics.jiraRelationCounts, confluenceLinkedToJiraCount: timelineJiraRelationDiagnostics.confluenceLinkedToJiraCount, defaultSelectIssuesFilter: "jira_related" }, fullFetchFailures: { available: fullFetchWasRun, runStatus: failureSummary.runStatus, failedCount: failureSummary.failedCount, hasFailedIssuesFile: failureSummary.hasFailedIssuesFile }, directJiraEvidence: jiraEvidenceForBundle ? { available: true, directEvidenceCount: jiraEvidenceForBundle.summary.directEvidenceCount, contextEvidenceCount: jiraEvidenceForBundle.summary.contextEvidenceCount, relatedContextEvidenceCount: jiraEvidenceForBundle.summary.relatedContextEvidenceCount, excludedEvidenceCount: jiraEvidenceForBundle.summary.excludedEvidenceCount, issuesWithEvidence: jiraEvidenceForBundle.summary.coverage.issuesWithEvidence, issuesWithoutDirectEvidence: jiraEvidenceForBundle.summary.coverage.issuesWithoutDirectEvidence, failedIssueCount: jiraEvidenceForBundle.summary.failedIssueCount } : { available: false, directEvidenceCount: 0, contextEvidenceCount: 0, relatedContextEvidenceCount: 0, excludedEvidenceCount: 0, issuesWithEvidence: 0, issuesWithoutDirectEvidence: 0, failedIssueCount: fullFetchWasRun ? failureSummary.failedCount : null }, userAnalysisWorkflow: latestUserAnalysisWorkflow ?? unavailableWorkflow, userAnalysisUiState: { workflowStepCount: Number(userAnalysisUiState.workflowStepCount ?? 5), advancedToolsVisible: userAnalysisUiState.advancedToolsVisible === true, fullFetchProgressLocation: String(userAnalysisUiState.fullFetchProgressLocation ?? "step3_full_fetch"), timelineVisibleColumnCount: Array.isArray(asRecord(userAnalysisUiState.timeline).visibleColumns) ? (asRecord(userAnalysisUiState.timeline).visibleColumns as unknown[]).length : 0, selectIssuesVisibleColumnCount: Array.isArray(asRecord(userAnalysisUiState.selectIssues).visibleColumns) ? (asRecord(userAnalysisUiState.selectIssues).visibleColumns as unknown[]).length : 0 }, relatedIssueScopeSummary: workflowRelatedScope, advancedDiagnosticsUsed, includedAutoSavedResults: autoSavedResultsIncluded, missingAutoSavedResults: autoSavedResultsMissing, fullSessionBundle: { enabled: true, sessionStartTime, bundleGeneratedAt: createdAt, totalUserActions: sessionUserActions.length, totalRuns: runHistory.length, totalAutoSavedResults: autoSavedCandidates.length, includedAutoSavedResultCount: autoSavedResultsIncluded.length, missingAutoSavedResultCount: autoSavedResultsMissing.length } });
  const debugBundleSummaryPath = path.join(folderPath, "debug-bundle-summary.json");
  const debugBundleSummaryBody = JSON.parse(fs.readFileSync(debugBundleSummaryPath, "utf8")) as Record<string, unknown>;
  writeBundleJson(folderPath, "debug-bundle-summary.json", { ...debugBundleSummaryBody, lastParsedResult: summarize(lastParsedResult), activityStreamStabilityProbe: latestActivityStreamStabilityProbeV2 ? { available: true, authoritativeVersion: "v2", probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, windowCount: latestActivityStreamStabilityProbeV2.windowDiagnostics.length, roundCount: latestActivityStreamStabilityProbeV2.rounds.length, stability: latestActivityStreamStabilityProbeV2.comparison.stability } : latestActivityStreamStabilityProbe ? { available: true, authoritativeVersion: "legacy_v1", probeRunId: latestActivityStreamStabilityProbe.probeRunId } : { available: false, authoritativeVersion: "none", probeRunId: "" } });
  const summaryWithV1 = JSON.parse(fs.readFileSync(debugBundleSummaryPath, "utf8")) as Record<string, unknown>;
  writeBundleJson(folderPath, "debug-bundle-summary.json", { ...summaryWithV1, stabilityProbeAvailable: Boolean(latestActivityStreamStabilityProbeV2), stabilitySetupIncluded: true, roundComparisonIncluded: true, windowDiagnosticsIncluded: true, rawDiagnosticsIncluded: true, sourceArchivePackageAvailable: Boolean(sourceArchiveForBundle), sourceArchivePackageIncluded: sourceArchiveIndex.includedInDebugBundle, activityStreamRoundStabilityV2: latestActivityStreamStabilityProbeV2 ? { available: true, schemaVersion: latestActivityStreamStabilityProbeV2.schemaVersion, executionOrder: latestActivityStreamStabilityProbeV2.executionOrder, probeRunId: latestActivityStreamStabilityProbeV2.probeRunId, roundCount: latestActivityStreamStabilityProbeV2.rounds.length, windowDiagnosticCount: latestActivityStreamStabilityProbeV2.windowDiagnostics.length, stability: latestActivityStreamStabilityProbeV2.comparison.stability, roundUnionEventCount: latestActivityStreamStabilityProbeV2.comparison.roundUnionEventCount, roundIntersectionEventCount: latestActivityStreamStabilityProbeV2.comparison.roundIntersectionEventCount, variableEventCount: latestActivityStreamStabilityProbeV2.comparison.variableEventCount, consistencyRate: latestActivityStreamStabilityProbeV2.comparison.consistencyRate, recommendedRoundCount: latestActivityStreamStabilityProbeV2.recommendation.recommendedRoundCount } : { available: false }, activityStreamBenchmark: latestActivityStreamBenchmark ? { available: true, benchmarkRunId: latestActivityStreamBenchmark.benchmarkRunId, status: latestActivityStreamBenchmark.status, runCount: latestActivityStreamBenchmark.summary.runCount } : { available: false }, fullFetchCoverageDiagnostics: coverageDiagnosticsForBundle ?? { status: "not_available" }, sourceArchiveExporter: { version: __MAIN_APP_VERSION__, packageIncludedInDebugBundle: sourceArchiveIndex.includedInDebugBundle, assessmentFile: "source-archive-file-assessment.json", indexFile: "source-archive-export-index.json" } });
  const summaryWithStaging = JSON.parse(fs.readFileSync(debugBundleSummaryPath, "utf8")) as Record<string, unknown>;
  writeBundleJson(folderPath, "debug-bundle-summary.json", { ...summaryWithStaging, debugBundleStatus, fullFetchStaging: fullFetchStagingIndex, fullFetchResult: fullFetchResultMetadata, sourceArchiveExporter: { ...asRecord(summaryWithStaging.sourceArchiveExporter), version: __MAIN_APP_VERSION__ } });
  const bundleFiles: Partial<Record<AutoSaveResultType, string>> = { activity_stream_run: "latest-activity-stream-result.json", precision_probe_run: "latest-precision-probe-result.json", manual_url_replay_run: "latest-manual-url-replay-result.json", maxresults_cap_test: "latest-maxresults-cap-test.json" };
  for (const [resultType, fileName] of Object.entries(bundleFiles) as Array<[AutoSaveResultType, string]>) {
    const run = latestAutoSavedRuns.get(resultType);
    if (run) writeBundleJson(folderPath, fileName, run.data);
  }
  const runChain = {
    activityStream: latestBaselineRecord ? { runId: latestBaselineRecord.runId, status: latestBaselineRecord.retry.finalClassification, count: latestBaselineRecord.comparison.currentCounts.parsedActivityCount } : null,
    timeline: timelineForBundle ? { runId: timelineForBundle.timelineRunId, parentRunId: String((timelineForBundle as unknown as Record<string, unknown>).parentRunId ?? ""), status: "completed", count: timelineForBundle.summary.totalEvents } : null,
    fullFetch: stagingForBundle ? { runId: stagingForBundle.state.fullFetchRunId, parentRunId: String((stagingForBundle.state as unknown as Record<string, unknown>).parentRunId ?? ""), status: stagingForBundle.state.status, count: stagingForBundle.state.total } : null,
    databaseSave: databaseWriteForBundle ? { runId: String(databaseWriteForBundle.operationId ?? ""), parentRunId: String(databaseWriteForBundle.runId ?? ""), status: String(databaseWriteForBundle.status ?? ""), count: Number(asRecord(databaseWriteForBundle.summary).eventsCreated ?? 0) } : null
  };
  const runConsistency = reconcileRunChain(runChain);
  writeBundleJson(folderPath, "run-reconciliation.json", { createdAt, runs: runChain, consistency: runConsistency, stabilityGate: refreshStabilityGateDecision() });
  writeBundleJson(folderPath, "run-manifest-v0.2.52.json", { debugSessionId: path.basename(folderPath), createdAt, appVersion: __MAIN_APP_VERSION__, sourceCommit: __MAIN_GIT_COMMIT__, packagedCommit: __MAIN_GIT_COMMIT__, runs: { activityStreamRunId: runChain.activityStream?.runId ?? "unavailable", timelineRunId: runChain.timeline?.runId ?? "unavailable", fullFetchRunId: runChain.fullFetch?.runId ?? "unavailable", databaseSaveRunId: runChain.databaseSave?.runId ?? "unavailable" }, consistency: runConsistency });
  const included = fs.readdirSync(folderPath);
  const missing = (Object.entries(bundleFiles) as Array<[AutoSaveResultType, string]>).filter(([type]) => !latestAutoSavedRuns.has(type)).map(([, fileName]) => `${fileName}: not_run / no result available`);
  const trackingLines = (label: string, run: AutoSavedRun | null) => run ? [`${label}:`, `- runId: ${run.runId}`, `- status: ${run.status}`, `- diagnosis: ${String(asRecord(run.data.activityStream).diagnosis ?? "unknown")}`, `- parsedActivityCount: ${Number(asRecord(run.data.activityStream).parsedActivityCount ?? 0)}`, `- path: ${run.filePath}`] : [`${label}:`, "- not_available"];
  const chunking = asRecord(latestChunkedRun?.data.dateRangeChunking);
  const mergeStats = asRecord(latestChunkedRun?.data.chunkMergeStats);
  fs.writeFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Jira Activity Analyzer Debug Bundle", `Version: ${__MAIN_APP_VERSION__}`, `Build Time: ${__MAIN_BUILD_TIME__}`, `Git Commit: ${__MAIN_GIT_COMMIT__}`, `Session Start: ${sessionStartTime}`, `Generated At: ${createdAt}`, `Current Page: ${payload.currentPage}`, ...trackingLines("Latest Run Result", latestRunResult), ...trackingLines("Last Successful Result", lastSuccessfulResult), ...trackingLines("Last Parsed Result", lastParsedResult), ...trackingLines("Latest No Entries Result", latestNoEntriesResult), "Full Session Debug Bundle:", `- sessionStartTime: ${sessionStartTime}`, `- bundleGeneratedAt: ${createdAt}`, `- totalUserActions: ${sessionUserActions.length}`, `- totalRuns: ${runHistory.length}`, `- totalAutoSavedResults: ${autoSavedCandidates.length}`, `- includedAutoSavedResults: ${autoSavedResultsIncluded.length}`, `- missingAutoSavedResults: ${autoSavedResultsMissing.length}`, "Session Timeline:", "- file: session-timeline.json", "- combines user actions, renderer debug log, Activity Stream run history, and auto-save paths in chronological order.", "Auto-Saved Result Bodies:", "- Full sanitized JSON bodies are under auto-saved-results/.", ...autoSavedResultsIncluded.map((entry) => `- included: ${String(entry.runId)} -> ${String(entry.bundlePath)}`), ...autoSavedResultsMissing.map((entry) => `- missing: ${String(entry.runId)} -> ${String(entry.sourcePath)} (${String(entry.reason)})`), "Standard Activity Stream Flow:", `- selectedUser: ${String(standardActivityStreamFlow.selectedUser ?? "not_available")}`, `- queryUser: ${String(standardActivityStreamFlow.activityStreamQueryUser ?? "not_available")}`, `- variant: ${String(standardActivityStreamFlow.variant ?? "not_available")}`, `- dateQueryMode: ${String(standardActivityStreamFlow.dateQueryMode ?? "not_available")}`, `- chunkingMode: ${String(standardActivityStreamFlow.chunkingMode ?? "not_available")}`, `- perChunkMaxResults: ${Number(standardActivityStreamFlow.perChunkMaxResults ?? 0)}`, `- advancedOverrideUsed: ${Boolean(standardActivityStreamFlow.advancedOverrideUsed)}`, `- advancedDiagnosticsUsed: ${advancedDiagnosticsUsed}`, "Activity Type Classifier:", `- enabled: ${classifierDiagnostics.enabled !== false}`, `- rulesVersion: ${String(classifierDiagnostics.rulesVersion ?? "1.1")}`, `- correctedEntryCount: ${Number(classifierDiagnostics.correctedEntryCount ?? 0)}`, `- preservedEntryCount: ${Number(classifierDiagnostics.preservedEntryCount ?? 0)}`, `- inferredEntryCount: ${Number(classifierDiagnostics.inferredEntryCount ?? 0)}`, `- fallbackUnknownCount: ${Number(classifierDiagnostics.fallbackUnknownCount ?? 0)}`, `- commentPriorityHigherThanAttachment: ${classifierDiagnostics.commentPriorityHigherThanAttachment !== false}`, "Date Range Chunking:", `- enabled: ${Boolean(chunking.enabled)}`, `- mode: ${String(chunking.mode ?? "off")}`, `- chunkCount: ${Number(chunking.chunkCount ?? 0)}`, `- successfulChunks: ${Number(mergeStats.successfulChunks ?? 0)}`, `- failedChunks: ${Number(mergeStats.failedChunks ?? 0)}`, `- mergedActivityEntries: ${Number(mergeStats.mergedActivityEntries ?? 0)}`, "Included Files:", ...included.map((file) => `- ${file}`), "How to analyze:", "- Check debug-bundle-summary.json", "- Check session-timeline.json", "- Check auto-saved-results-index.json", "- Check auto-saved-results/", "- Check run-history.json", "- Check debug-log.txt", "- Check user-action-log.txt", "Security:", "- token / Authorization / cookie are masked or not included", "Known missing files:", ...(missing.length ? missing : ["- none"]), "Cross-page TODO:", ...crossPageDebugBundleTodo.map((item) => `- ${item}`)].join("\n"), "utf8");
  const debugFolderReadmePath = path.join(folderPath, "README_for_GPT.txt");
  const debugFolderReadme = fs.readFileSync(debugFolderReadmePath, "utf8")
    .replace("Jira Activity Analyzer Debug Bundle", "Jira Activity Analyzer Debug Folder")
    .replace("Full Session Debug Bundle:", "Full Session Debug Folder:")
    .replace("bundleGeneratedAt:", "folderGeneratedAt:")
    .replace("Full sanitized JSON bodies are under auto-saved-results/.", "Source JSON files are copied unchanged under auto-saved-results/.")
    .replace("Security:\n- token / Authorization / cookie are masked or not included", "Sharing notice:\n- Files are copied without compression or content rewriting. Review the folder before sharing.");
  fs.writeFileSync(debugFolderReadmePath, debugFolderReadme, "utf8");
  fs.appendFileSync(debugFolderReadmePath, ["", "Activity Stream Baseline Guard:", `- enabled: ${activityStreamBaselineGuard.enabled}`, `- latestClassification: ${activityStreamBaselineGuard.latestClassification}`, `- shouldRetry: ${activityStreamBaselineGuard.shouldRetry}`, `- retryTriggered: ${activityStreamBaselineGuard.retryTriggered}`, `- retryRecovered: ${activityStreamBaselineGuard.retryRecovered}`, `- baselinePath: ${activityStreamBaselineGuard.baselinePath || "not_available"}`, `- baselineBestParsedActivityCount: ${activityStreamBaselineGuard.baselineBestParsedActivityCount}`, `- currentParsedActivityCount: ${activityStreamBaselineGuard.currentParsedActivityCount}`, `- missingIssueKeys: ${latestBaselineRecord?.comparison.missingIssueKeys.join(", ") || "none"}`, `- missingEntryCount: ${activityStreamBaselineGuard.missingEntryFingerprintCount}`, "- files:", "  - activity-stream-baseline-comparison.json", "  - activity-stream-baseline-snapshot.json", "  - activity-stream-baseline-history.json", ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["User Activity Timeline:", `- timelineRunId: ${timelineForBundle?.timelineRunId ?? "not_available"}`, `- selectedUser: ${timelineForBundle?.summary.selectedUser ?? "not_available"}`, `- dateRange: ${timelineForBundle ? `${timelineForBundle.summary.dateRange.start}..${timelineForBundle.summary.dateRange.end}` : "not_available"}`, `- totalEvents: ${timelineForBundle?.summary.totalEvents ?? 0}`, `- issueKeyCount: ${timelineForBundle?.summary.issueKeyCount ?? 0}`, `- eventTypeCounts: ${JSON.stringify(timelineForBundle?.summary.eventTypeCounts ?? {})}`, `- confidenceCounts: ${JSON.stringify(timelineForBundle?.summary.confidenceCounts ?? {})}`, `- exportedFiles: ${JSON.stringify(timelineForBundle?.exportedFiles ?? {})}`, ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Timeline Integrity:", `- sourceParsedActivityCount: ${timelineForBundle?.summary.integrity.sourceParsedActivityCount ?? 0}`, `- timelineEventCount: ${timelineForBundle?.summary.integrity.timelineEventCount ?? 0}`, `- difference: ${timelineForBundle?.summary.eventCountReconciliation.difference ?? 0}`, `- deduplicatedEntryCount: ${timelineForBundle?.summary.integrity.deduplicatedEntryCount ?? 0}`, `- skippedEntryCount: ${timelineForBundle?.summary.integrity.skippedEntryCount ?? 0}`, `- unexplainedDifferenceCount: ${timelineForBundle?.summary.eventCountReconciliation.unexplainedDifferenceCount ?? 0}`, `- sourceParsedIssueKeyCount: ${timelineForBundle?.summary.integrity.sourceParsedIssueKeyCount ?? 0}`, `- timelinePrimaryIssueKeyCount: ${timelineForBundle?.summary.integrity.timelinePrimaryIssueKeyCount ?? 0}`, `- timelineAllIssueKeyCount: ${timelineForBundle?.summary.integrity.timelineAllIssueKeyCount ?? 0}`, `- missingIssueKeysFromTimeline: ${timelineForBundle?.summary.integrity.missingIssueKeysFromTimeline.join(", ") || "none"}`, `- missingIssueKeysFromPrimaryTimeline: ${timelineForBundle?.summary.integrity.missingIssueKeysFromPrimaryTimeline.join(", ") || "none"}`, `- eventIdCollisionCount: ${timelineForBundle?.summary.integrity.eventIdCollisionCount ?? 0}`, ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Timeline Source System:", `- Jira: ${timelineSourceSystemDiagnostics.sourceSystemCounts.jira}`, `- Confluence: ${timelineSourceSystemDiagnostics.sourceSystemCounts.confluence}`, `- Other: ${timelineSourceSystemDiagnostics.sourceSystemCounts.other}`, `- Unknown: ${timelineSourceSystemDiagnostics.sourceSystemCounts.unknown}`, "- Default Select Issues filter: jira", "- diagnostics: timeline-source-system-diagnostics.json", ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Jira Relation:", `- Jira-related: ${timelineJiraRelationDiagnostics.jiraRelationCounts.jiraRelated}`, `- Non-Jira: ${timelineJiraRelationDiagnostics.jiraRelationCounts.nonJiraRelated}`, `- Has Jira Issue Key: ${timelineJiraRelationDiagnostics.jiraRelationCounts.hasJiraIssueKey}`, `- Unknown relation: ${timelineJiraRelationDiagnostics.jiraRelationCounts.unknownRelation}`, `- Confluence linked to Jira: ${timelineJiraRelationDiagnostics.confluenceLinkedToJiraCount}`, "- Default Select Issues filter: jira_related + jira/confluence", "- diagnostics: timeline-jira-relation-diagnostics.json", "", "Full Fetch Failures:", `- runStatus: ${failureSummary.runStatus}`, `- failedCount: ${failureSummary.failedCount ?? "not_run"}`, `- full-fetch-failed-issues.json: ${failureSummary.hasFailedIssuesFile ? "included" : "not created (Full Fetch not run)"}`, "- full-fetch-failure-summary.json: included", ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["", "User Analysis Workflow:", ...Object.entries(latestUserAnalysisWorkflow?.steps ?? {}).map(([step, status]) => `- ${step}: ${status}`), "Timeline Issue Selection:", `- totalIssueGroups: ${latestUserAnalysisWorkflow?.timelineIssueGroups.length ?? 0}`, `- selectedIssueCount: ${latestUserAnalysisWorkflow?.timelineSelectedIssues.length ?? 0}`, `- addedToFetchQueueCount: ${latestUserAnalysisWorkflow?.addedTimelineIssuesToFetchQueueCount ?? 0}`, "Related Issue Expansion:", `- relatedIssueCount: ${latestUserAnalysisWorkflow ? relatedIssueSummary(latestUserAnalysisWorkflow.relatedCandidateIssues).relatedIssueCount : 0}`, `- relationTypeCounts: ${JSON.stringify(latestUserAnalysisWorkflow ? relatedIssueSummary(latestUserAnalysisWorkflow.relatedCandidateIssues).relationTypeCounts : {})}`, `- Recommended: ${JSON.stringify(asRecord(workflowRelatedScope).recommended ?? {})}`, `- Optional: ${JSON.stringify(asRecord(workflowRelatedScope).optional ?? {})}`, `- addedRecommendedToFetchQueueCount: ${Number(asRecord(workflowRelatedScope).addedRecommendedToFetchQueueCount ?? 0)}`, `- addedOptionalToFetchQueueCount: ${Number(asRecord(workflowRelatedScope).addedOptionalToFetchQueueCount ?? 0)}`, `- addedRelatedIssuesToFetchQueueCount: ${latestUserAnalysisWorkflow?.addedRelatedIssuesToFetchQueueCount ?? 0}`, ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["User Analysis UI State:", "- Workflow steps: 5", `- Timeline visible columns: ${JSON.stringify(asRecord(userAnalysisUiState.timeline).visibleColumns ?? [])}`, `- Timeline filters: ${JSON.stringify(asRecord(userAnalysisUiState.timeline).filters ?? {})}`, `- Select Issues visible columns: ${JSON.stringify(asRecord(userAnalysisUiState.selectIssues).visibleColumns ?? [])}`, `- Select Issues filters: ${JSON.stringify(asRecord(userAnalysisUiState.selectIssues).filters ?? {})}`, "- Advanced Tools visible: false", "- Full Fetch Progress location: Step 3 Full Fetch", ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Direct Jira Evidence:", `- directEvidenceCount: ${jiraEvidenceForBundle?.summary.directEvidenceCount ?? 0}`, `- contextEvidenceCount: ${jiraEvidenceForBundle?.summary.contextEvidenceCount ?? 0}`, `- relatedContextEvidenceCount: ${jiraEvidenceForBundle?.summary.relatedContextEvidenceCount ?? 0}`, `- excludedEvidenceCount: ${jiraEvidenceForBundle?.summary.excludedEvidenceCount ?? 0}`, `- issuesWithEvidence: ${jiraEvidenceForBundle?.summary.coverage.issuesWithEvidence ?? 0}`, `- issuesWithoutDirectEvidence: ${jiraEvidenceForBundle?.summary.coverage.issuesWithoutDirectEvidence ?? 0}`, `- failedIssues: ${jiraEvidenceForBundle?.summary.coverage.failedIssues.join(", ") || "none"}`, "", "Related Issue Expansion Policy:", "- recursive: false", "- maxDepth: 1", "- relatedIssuesAsPrimaryEvidence: false", "", "Analyzer Roadmap:", "- Cloud AI Analyzer: planned", "- Local AI Analyzer: planned", "- Offline Rule Analyzer: planned", "", "Data Source Runtime:", "- Live API: current", `- Local Database: ${databaseWriteForBundle ? String(databaseWriteForBundle.status ?? "implemented") : "implemented_not_run"}`, "- Hybrid: planned", "- diagnostics: source-archive-database-write.json", "", "Product Goals:", "1. Jira activity analysis", "2. Confluence activity analysis", "3. Jira + Confluence combined analysis", ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["", "Activity Stream Stability Probe:", `- available: ${Boolean(latestActivityStreamStabilityProbe)}`, `- probeRunId: ${latestActivityStreamStabilityProbe?.probeRunId ?? "not_available"}`, `- selectedUser: ${latestActivityStreamStabilityProbe?.selectedUser ?? "not_available"}`, `- dateRange: ${latestActivityStreamStabilityProbe ? `${latestActivityStreamStabilityProbe.dateRange.start}..${latestActivityStreamStabilityProbe.dateRange.end}` : "not_available"}`, `- requestWindow: ${latestActivityStreamStabilityProbe?.config.requestWindow.type ?? "not_available"}`, `- forcedRetryCount: ${latestActivityStreamStabilityProbe?.config.forcedRetryCount ?? 0}`, `- mergeStrategy: ${latestActivityStreamStabilityProbe?.config.mergeStrategy ?? "not_available"}`, `- stableWindowCount: ${latestActivityStreamStabilityProbe?.windows.filter((window) => window.stability.classification === "stable").length ?? 0}`, `- unstableWindowCount: ${latestActivityStreamStabilityProbe?.recommendation.unstableWindowCount ?? 0}`, `- recommendedRetryCount: ${latestActivityStreamStabilityProbe?.recommendation.recommendedRetryCount ?? 0}`, `- coldStartSuspected: ${latestActivityStreamStabilityProbe?.coldStartSuspected ?? false}`, "- concurrency: 1", "- files:", "  - activity-stream-stability-probe.json", "  - activity-stream-attempts.json", "  - activity-stream-attempt-comparison.csv", "  - activity-stream-window-summary.csv", "  - activity-stream-stability-recommendation.json", ""].join("\n"), "utf8");
  const copyFailures = copiedEntries.filter((entry) => entry.status === "copy_failed");
  debugBundleStatus = copyFailures.length === 0 ? "completed" : "completed_with_errors";
  const finalDebugBundleSummary = JSON.parse(fs.readFileSync(debugBundleSummaryPath, "utf8")) as Record<string, unknown>;
  writeBundleJson(folderPath, "debug-bundle-summary.json", {
    ...finalDebugBundleSummary,
    debugBundleStatus,
    failedFileCount: copyFailures.length
  });
  const manifestEntries = listDebugFolderFiles(folderPath);
  for (const entry of copiedEntries) {
    if (evidenceEntries.some((evidence) => evidence.relativePath === entry.relativePath)) continue;
    evidenceEntries.push({
      id: `copied_source_${evidenceEntries.length + 1}`,
      status: entry.status,
      sourcePath: entry.sourcePath,
      relativePath: entry.relativePath,
      reason: entry.reason || "Existing diagnostic source copied."
    });
  }
  let placeholderFilesCreated = 0;
  for (const entry of manifestEntries) {
    if (entry.relativePath === "manifest.json" || evidenceEntries.some((evidence) => evidence.relativePath === entry.relativePath)) continue;
    const absolute = path.join(folderPath, ...entry.relativePath.split("/"));
    let placeholder = false;
    if (entry.size <= 512 * 1024 && !entry.relativePath.startsWith("auto-saved-results/")) {
      try {
        const content = fs.readFileSync(absolute, "utf8");
        placeholder = /"status"\s*:\s*"(?:not_available|not_run)"/.test(content)
          || /(?:^|[\r\n,])not_available(?:,|[\r\n])/.test(content);
      } catch {
        placeholder = false;
      }
    }
    if (placeholder) {
      placeholderFilesCreated += 1;
      evidenceEntries.push({ id: `placeholder_${entry.relativePath}`, status: "not_observed", relativePath: entry.relativePath, reason: "Placeholder describes unavailable evidence and is not counted as collected evidence." });
    } else {
      evidenceEntries.push({ id: `generated_${entry.relativePath}`, status: "copied", relativePath: entry.relativePath, reason: "Diagnostic file generated from current application state." });
    }
  }
  const evidenceSummary = summarizeDebugEvidence(evidenceEntries, placeholderFilesCreated);
  const debugBundleManifestPath = path.join(folderPath, "manifest.json");
  writeJsonAtomic(debugBundleManifestPath, {
    schemaVersion: "debug_folder_manifest_v1",
    appVersion: __MAIN_APP_VERSION__,
    status: debugBundleStatus,
    generatedAt: createdAt,
    currentPage: payload.currentPage,
    context: {
      fullFetchRunId: expectedFullFetchRunId,
      stagingId: stagingForBundle?.state.stagingId ?? "",
      canonicalStagingIncluded: Boolean(stagingForBundle),
      fullFetchResultStatus: String(fullFetchResultMetadata.status ?? "not_available"),
      sourceArchiveMetadataAvailable: Boolean(sourceArchiveForBundle)
    },
    successfulFileCount: evidenceSummary.filesCopied,
    failedFileCount: evidenceSummary.copyFailures,
    ...evidenceSummary,
    entries: manifestEntries,
    evidence: evidenceEntries,
    copyResults: copiedEntries,
    failures: copyFailures
  });
  const finalFiles = listDebugFolderFiles(folderPath);
  const bundleSize = finalFiles.reduce((sum, entry) => sum + entry.size, 0);
  if (stagingForBundle) {
    recordStep5Action(stagingForBundle, { action: "debug_bundle_generated", timestamp: createdAt, runId: stagingForBundle.state.fullFetchRunId, outputPath: folderPath, fileSize: bundleSize, sha256: "", issueCount: stagingForBundle.state.total, eligibleCount: stagingForBundle.state.eligible, result: debugBundleStatus, error: debugBundleStatus === "completed" ? "" : `${copyFailures.length} file(s) failed to copy`, generatedAutomatically: Boolean(fullFetchResultMetadata.generatedAutomatically) });
  }
  lastDebugBundle = { path: folderPath, createdAt };
  return {
    canceled: false,
    status: debugBundleStatus,
    folderPath,
    filePath: "",
    createdAt,
    bundleSizeBytes: bundleSize,
    successfulFileCount: evidenceSummary.filesCopied,
    unavailableOrNotRunCount: evidenceSummary.sourcesNotObserved + evidenceSummary.featuresNotRun + evidenceSummary.sourcesMissing,
    sourcesNotObserved: evidenceSummary.sourcesNotObserved,
    featuresNotRun: evidenceSummary.featuresNotRun,
    sourcesMissing: evidenceSummary.sourcesMissing,
    placeholderFilesCreated: evidenceSummary.placeholderFilesCreated,
    failedFileCount: evidenceSummary.copyFailures,
    includedFiles: finalFiles.map((entry) => entry.relativePath),
    fullFetchResult: fullFetchResultMetadata,
    crossPageDebugBundleTodo
  };
});

ipcMain.handle("debug-log:open-folder", async (_event, payload: { folderPath: string }) => {
  const target = path.resolve(payload.folderPath || getExportsDir());
  try {
    assertAppPath(target);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const error = await shell.openPath(target);
  return { ok: !error, folderPath: target, error };
});

ipcMain.handle("debug-log:save-text", async (_event, payload: { defaultFileName: string; content: string }) => {
  const outputDir = ensureDir(getLogsDir());
  const requestedBaseName = path.basename(String(payload.defaultFileName || "debug-log.txt"));
  const safeBaseName = requestedBaseName.replace(/[^a-zA-Z0-9._-]/g, "_") || "debug-log.txt";
  const extension = path.extname(safeBaseName) || ".txt";
  const stem = path.basename(safeBaseName, path.extname(safeBaseName));
  let filePath = path.join(outputDir, `${stem}${extension}`);
  let collision = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(outputDir, `${stem}-${String(collision).padStart(2, "0")}${extension}`);
    collision += 1;
  }
  const { diagnostics, mergedContent } = buildDebugLogExportContent(payload.content);
  assertAppPath(filePath);
  fs.writeFileSync(filePath, mergedContent, "utf8");
  return { canceled: false, filePath, folderPath: outputDir, ...diagnostics };
});

function getRendererEntry() {
  return path.join(__dirname, "../dist/index.html");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function navigateUiSmoke(window: BrowserWindow, hash: string, readySelector: string, timeoutMs = 5000) {
  await window.webContents.executeJavaScript(`(() => {
    const hash = ${JSON.stringify(hash)};
    const link = Array.from(document.querySelectorAll("nav a")).find((element) => element.getAttribute("href") === hash);
    if (link instanceof HTMLElement) link.click();
    else window.location.hash = hash;
  })()`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await window.webContents.executeJavaScript(`(() => ({
      hash: window.location.hash,
      selectorReady: Boolean(document.querySelector(${JSON.stringify(readySelector)}))
    }))()`);
    if (ready.hash === hash && ready.selectorReady) return;
    await wait(100);
  }
  throw new Error(`UI smoke route did not become ready: ${hash} (${readySelector})`);
}

async function openAnalysisUiSmoke(window: BrowserWindow) {
  await navigateUiSmoke(window, "#/analysis", "[data-testid='workflow-timeline']");
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-timeline']")?.click()`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector("[data-testid='analysis-setup-user']"))`);
    if (ready) return;
    await wait(100);
  }
  throw new Error("UI smoke Analysis Step 1 did not become ready");
}

async function runUiSmoke(window: BrowserWindow) {
  if (shouldCaptureUi) {
    fs.rmSync(captureDir, { recursive: true, force: true });
    await wait(150);
    fs.mkdirSync(captureDir, { recursive: true });
  }

  const failures: string[] = [];
  const smokeDatabasePath = path.join(getTempDir(), `v0237-ui-smoke-${process.pid}.sqlite`);
  try {
    if (fs.existsSync(smokeDatabasePath)) fs.rmSync(smokeDatabasePath, { force: true });
    const startupReadinessAudit = await window.webContents.executeJavaScript(`(async () => {
      const initial = await window.desktopApp.runtime.getState();
      const blankDatabase = await window.desktopApp.databases.checkPath({ filePath: "" });
      const jiraSave = await window.desktopApp.connections.testAndSave({
        id: "env",
        name: "UI Smoke Jira",
        baseUrl: "https://jira-ui-smoke.invalid",
        username: "ui-smoke",
        email: "ui-smoke@example.invalid",
        apiToken: "ui-smoke-runtime-token",
        authType: "bearer",
        apiVersion: "v2",
        isActive: true,
        status: "untested"
      });
      const created = await window.desktopApp.databases.createNew({ filePath: ${JSON.stringify(smokeDatabasePath)} });
      const selected = await window.desktopApp.databases.selectExisting({ filePath: ${JSON.stringify(smokeDatabasePath)} });
      window.location.hash = "#/connections";
      await new Promise((resolve) => setTimeout(resolve, 180));
      const body = document.body.innerText || "";
      return {
        initial,
        blankDatabase,
        jiraSaved: jiraSave.saved,
        jiraRuntimeStatus: jiraSave.runtime?.status,
        createdSaved: created.saved,
        createdError: created.error,
        createdStatus: created.state?.database?.status,
        selectedSaved: selected.saved,
        selectedStatus: selected.validation?.status,
        hasGlobalStatus: Boolean(document.querySelector("[data-testid='global-runtime-status']")),
        hasDatabaseActions: Boolean(document.querySelector("[data-testid='select-existing-database']")) &&
          Boolean(document.querySelector("[data-testid='create-new-database']")),
        noTokenInUi: !body.includes("ui-smoke-runtime-token"),
        noTokenInResults: !JSON.stringify({ initial, blankDatabase, created, selected }).includes("ui-smoke-runtime-token")
      };
    })()`);
    if (
      startupReadinessAudit.blankDatabase?.status !== "NOT_CONFIGURED" ||
      !startupReadinessAudit.jiraSaved ||
      startupReadinessAudit.jiraRuntimeStatus !== "CONNECTED" ||
      !startupReadinessAudit.createdSaved ||
      startupReadinessAudit.createdStatus !== "READY" ||
      !startupReadinessAudit.selectedSaved ||
      startupReadinessAudit.selectedStatus !== "READY" ||
      !startupReadinessAudit.hasGlobalStatus ||
      !startupReadinessAudit.hasDatabaseActions ||
      !startupReadinessAudit.noTokenInUi ||
      !startupReadinessAudit.noTokenInResults
    ) {
      failures.push(`v0.2.37 startup/database UI and IPC audit failed ${JSON.stringify(startupReadinessAudit)}`);
    }
  } catch (error) {
    failures.push(`v0.2.37 startup/database UI and IPC audit threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  const evidenceFixtureInput = {
    selectedUser: "roger_hsieh",
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    issueKey: "COPGEN1-126606",
    directActivityIssue: true,
    relatedTimelineEventIds: ["sha256:timeline-fixture"],
    issue: { id: "126606", fields: { summary: "Evidence fixture", description: "Safe fixture", status: { name: "In Progress" }, updated: "2026-07-07T01:00:00.000Z" } },
    comments: [
      { id: "c1", author: { name: "roger_hsieh" }, created: "2026-07-02T01:00:00.000Z", body: "Direct evidence comment" },
      { id: "c2", author: { name: "other_user" }, created: "2026-07-02T01:00:00.000Z", body: "Excluded actor" },
      { id: "c3", author: { name: "roger_hsieh" }, created: "2026-06-20T01:00:00.000Z", body: "Excluded date" }
    ],
    changelogHistories: [{ id: "h1", author: { name: "roger_hsieh" }, created: "2026-07-03T02:00:00.000Z", items: [{ field: "status", fromString: "To Do", toString: "In Progress" }, { field: "assignee", fromString: "alice", toString: "roger_hsieh" }] }],
    attachments: [{ id: "a1", author: { name: "roger_hsieh" }, created: "2026-07-04T03:00:00.000Z", filename: "evidence.txt", size: 42, mimeType: "text/plain" }],
    links: [{ id: "l1", type: { name: "Blocks" }, outwardIssue: { key: "COPGEN1-100" } }],
    remoteLinks: [{ id: "r1", object: { title: "Confluence reference", url: "https://example.invalid/context" } }]
  };
  const evidenceFixture = extractJiraEvidenceFromIssue(evidenceFixtureInput);
  const evidenceFixtureRepeat = extractJiraEvidenceFromIssue(evidenceFixtureInput);
  const relatedEvidenceFixture = extractJiraEvidenceFromIssue({ ...evidenceFixtureInput, issueKey: "COPGEN1-69506", directActivityIssue: false, relatedTimelineEventIds: [] });
  const evidenceFixtureSummary = summarizeJiraEvidence({ selectedUser: evidenceFixtureInput.selectedUser, startDate: evidenceFixtureInput.startDate, endDate: evidenceFixtureInput.endDate, directIssueKeys: [evidenceFixtureInput.issueKey], fullFetchedIssueKeys: [evidenceFixtureInput.issueKey, "COPGEN1-69506"], failedIssueKeys: ["SMOKE-404"], events: [...evidenceFixture.events, ...relatedEvidenceFixture.events], excluded: evidenceFixture.excluded });
  const directFixtureTypes = new Set(evidenceFixture.events.filter((item) => item.evidenceScope === "direct").map((item) => `${item.evidenceType}:${item.activityType}`));
  if (!directFixtureTypes.has("jira_comment:comment") || !directFixtureTypes.has("jira_changelog:status_change") || !directFixtureTypes.has("jira_changelog:assignee_change") || !directFixtureTypes.has("jira_attachment_metadata:attachment")) failures.push(`direct Jira evidence extraction fixture failed ${JSON.stringify([...directFixtureTypes])}`);
  if (!evidenceFixture.events.some((item) => item.evidenceType === "jira_issue_link_context" && item.evidenceScope === "context") || !evidenceFixture.events.some((item) => item.evidenceType === "jira_remote_link_context" && item.evidenceScope === "context") || !evidenceFixture.events.some((item) => item.evidenceType === "jira_issue_snapshot_context" && item.evidenceScope === "context")) failures.push("direct Jira context extraction fixture failed");
  if (relatedEvidenceFixture.events.some((item) => item.evidenceScope !== "related_context") || relatedEvidenceFixture.events.some((item) => item.evidenceScope === "direct")) failures.push("related Jira evidence was incorrectly promoted to direct evidence");
  if (evidenceFixture.excluded.byReason.actor_not_selected_user !== 1 || evidenceFixture.excluded.byReason.outside_date_range !== 1 || evidenceFixture.events.map((item) => item.evidenceId).join("|") !== evidenceFixtureRepeat.events.map((item) => item.evidenceId).join("|") || evidenceFixture.events.some((item) => !/^sha256:[0-9a-f]{64}$/.test(item.evidenceId))) failures.push(`Jira evidence exclusion/stable ID fixture failed ${JSON.stringify(evidenceFixture.excluded)}`);
  if (evidenceFixtureSummary.relatedIssueExpansionPolicy.recursive !== false || evidenceFixtureSummary.relatedIssueExpansionPolicy.maxDepth !== 1 || evidenceFixtureSummary.relatedIssueExpansionPolicy.relatedIssuesAsPrimaryEvidence !== false || evidenceFixtureSummary.directEvidenceCount < 4 || evidenceFixtureSummary.relatedContextEvidenceCount < 1) failures.push(`Jira evidence summary/policy fixture failed ${JSON.stringify(evidenceFixtureSummary)}`);
  latestJiraEvidence = { eventsDocument: { schemaVersion: "jira_evidence_events_v1", generatedAt: "2026-07-17T00:00:00.000Z", selectedUser: evidenceFixtureInput.selectedUser, dateRange: { start: evidenceFixtureInput.startDate, end: evidenceFixtureInput.endDate }, events: [...evidenceFixture.events, ...relatedEvidenceFixture.events] }, events: [...evidenceFixture.events, ...relatedEvidenceFixture.events], summary: evidenceFixtureSummary, excluded: evidenceFixture.excluded, files: {} };
  const classifierFixtures = [
    classifyActivityType({ title: "roger edited Person - date range", application: "Confluence", objectType: "", combined: '<category term="page" />', previousType: "page" }),
    classifyActivityType({ title: "roger added Person - date range", application: "Confluence", objectType: "page", combined: "Confluence activity", previousType: "page" }),
    classifyActivityType({ title: "changed an unrecognized object", application: "Other", previousType: "attachment" }),
    classifyActivityType({ title: "unrecognized activity", application: "Other", previousType: "unknown" }),
    classifyActivityType({ title: "commented on COPGEN1-138930 and attached a file", application: "Jira", objectType: "issue", previousType: "attachment" }),
    classifyActivityType({ title: "roger edited Person - date range", application: "Confluence", objectType: "page", previousType: "unknown" }),
    classifyActivityType({ title: "uploaded a file", application: "Jira", objectType: "issue" }),
    classifyActivityType({ title: "linked COPGEN1-1 to COPGEN1-2", application: "Jira", objectType: "issue" }),
    classifyActivityType({ title: "updated the priority", application: "Jira", objectType: "issue" }),
    classifyActivityType({ title: "changed the assignee", application: "Jira", objectType: "issue" }),
    classifyActivityType({ title: "changed the status", application: "Jira", objectType: "issue" }),
    classifyActivityType({ title: "changed the resolution", application: "Jira", objectType: "issue" })
  ];
  const classifierFixtureDiagnostics = activityTypeClassifierDiagnostics(classifierFixtures.map((activityTypeClassifier, entryIndex) => ({ activityTypeClassifier, activityType: activityTypeClassifier.finalType, entryIndex } as ActivityStreamEntry)));
  if (classifierFixtures[0].finalType !== "page" || classifierFixtures[0].matchedRule !== "confluence_page_object" || classifierFixtures[1].finalType !== "page" || classifierFixtures[2].matchedRule !== "preserve_previous_type" || classifierFixtures[2].finalType !== "attachment" || classifierFixtures[3].matchedRule !== "fallback_unknown" || classifierFixtures[4].finalType !== "comment" || classifierFixtures[4].matchedRule !== "commented_on" || classifierFixtures[5].finalType !== "page" || classifierFixtures[6].finalType !== "attachment" || classifierFixtures[7].finalType !== "link" || classifierFixtures[8].finalType !== "field_change" || classifierFixtures[9].finalType !== "assignee_change" || classifierFixtures[10].finalType !== "status_change" || classifierFixtures[11].finalType !== "resolution_change" || classifierFixtureDiagnostics.correctedEntryCount !== 2 || classifierFixtureDiagnostics.preservedEntryCount !== 6 || classifierFixtureDiagnostics.inferredEntryCount !== 3 || classifierFixtureDiagnostics.fallbackUnknownCount !== 1) failures.push(`classifier fallback fixtures failed ${JSON.stringify({ classifierFixtures, classifierFixtureDiagnostics })}`);
  const sourceClassifierFixtures = {
    jira: classifyTimelineSource({ activityApplication: "Jira", issueKey: "COPGEN1-1" }),
    confluence: classifyTimelineSource({ activityApplication: "Confluence", issueKey: "" }),
    jiraIssueKeyFallback: classifyTimelineSource({ activityApplication: "", issueKey: "COPGEN1-2" }),
    relatedIssueExpansion: classifyTimelineSource({ source: "related_issue_expansion", issueKey: "COPGEN1-3" }),
    fullFetch: classifyTimelineSource({ source: "full_fetch", issueKey: "COPGEN1-4" }),
    unknown: classifyTimelineSource({ activityApplication: "", issueKey: "" })
  };
  if (sourceClassifierFixtures.jira.sourceSystem !== "jira" || sourceClassifierFixtures.confluence.sourceSystem !== "confluence" || sourceClassifierFixtures.jiraIssueKeyFallback.sourceSystem !== "jira" || sourceClassifierFixtures.relatedIssueExpansion.sourceDetail !== "related_issue_expansion" || sourceClassifierFixtures.fullFetch.sourceDetail !== "jira_full_fetch" || sourceClassifierFixtures.unknown.sourceSystem !== "unknown") failures.push(`timeline source classifier fixtures failed ${JSON.stringify(sourceClassifierFixtures)}`);
  const jiraRelationFixtures = {
    jiraApplication: classifyJiraRelation({ sourceApplication: "jira", sourceDetail: "jira_activity_stream", issueKey: "", allIssueKeys: [] }),
    confluenceLink: classifyJiraRelation({ sourceApplication: "confluence", sourceDetail: "confluence_activity_stream", issueKey: "COPGEN1-1", allIssueKeys: ["COPGEN1-1"] }),
    confluenceOnly: classifyJiraRelation({ sourceApplication: "confluence", sourceDetail: "confluence_activity_stream", issueKey: "", allIssueKeys: [] }),
    unknown: classifyJiraRelation({ sourceApplication: "unknown", sourceDetail: "unknown", issueKey: "", allIssueKeys: [] })
  };
  if (!jiraRelationFixtures.jiraApplication.isJiraRelated || jiraRelationFixtures.jiraApplication.jiraRelationReason !== "source_application_jira" || !jiraRelationFixtures.confluenceLink.isJiraRelated || !jiraRelationFixtures.confluenceLink.relatedSystems.includes("confluence") || !jiraRelationFixtures.confluenceLink.relatedSystems.includes("jira") || jiraRelationFixtures.confluenceLink.jiraRelationReason !== "confluence_link_to_jira_issue" || jiraRelationFixtures.confluenceOnly.isJiraRelated || jiraRelationFixtures.confluenceOnly.jiraRelationReason !== "not_jira_related" || jiraRelationFixtures.unknown.isJiraRelated || jiraRelationFixtures.unknown.jiraRelationReason !== "unknown") failures.push(`timeline Jira relation classifier fixtures failed ${JSON.stringify(jiraRelationFixtures)}`);
  const timelineFixture = buildUserActivityTimeline({
    timelineRunId: "tlrun-fixture",
    builtAt: "2026-07-02T06:00:00.000Z",
    selectedUser: "roger_hsieh",
    dateRange: { start: "2026-07-02", end: "2026-07-02" },
    projectScope: "COPGEN1",
    sourceRunId: "asrun-timeline-fixture",
    sourceParsedActivityCount: 7,
    sourceIssueKeys: ["COPGEN1-138930", "COPGEN1-125695", "COPGEN1-125806"],
    activityStreamQueryUser: "roger\\_hsieh",
    baseline: { classification: "accepted_equal", retryTriggered: true, retryRecovered: true, baselineBestParsedActivityCount: 17, currentParsedActivityCount: 17, knownEntryFingerprints: ["sha256:fixture-comment", "sha256:fixture-link", "sha256:fixture-secondary"] },
    entries: [
      { issueKey: "COPGEN1-138930", extractedIssueKeysPerEntry: ["COPGEN1-138930", "JACKSONQLC-3024"], activityTime: "2026-07-02T05:41:09.000Z", activityType: "comment", activityApplication: "Jira", activityTitle: "謝正洪(roger_hsieh) commented on COPGEN1-138930", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "commented_on", finalType: "comment" }, entryFingerprint: "sha256:fixture-comment", variant: "escaped_username" },
      { issueKey: "COPGEN1-138930", extractedIssueKeysPerEntry: ["COPGEN1-138930"], activityTime: "2026-07-02T05:42:09.000Z", activityType: "link", activityApplication: "Jira", activityTitle: "created a link from COPGEN1-138930", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "link_action", finalType: "link" }, entryFingerprint: "sha256:fixture-link", variant: "escaped_username" },
      { issueKey: "", extractedIssueKeysPerEntry: [], activityTime: "2026-07-02T05:43:09.000Z", activityType: "page", activityApplication: "Confluence", activityTitle: "edited page Weekly Report", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "confluence_page_object", finalType: "page" }, entryFingerprint: "sha256:fixture-page", variant: "escaped_username" },
      { issueKey: "COPGEN1-125695", relatedIssueKeys: ["COPGEN1-125806"], extractedIssueKeysPerEntry: ["COPGEN1-125695", "COPGEN1-125806"], activityTime: "2026-07-02T05:44:09.000Z", activityType: "link", activityApplication: "Jira", activityTitle: "linked COPGEN1-125695 to COPGEN1-125806", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "link_action", finalType: "link" }, entryFingerprint: "sha256:fixture-secondary", variant: "escaped_username", entryIndex: 3 },
      { issueKey: "COPGEN1-125695", relatedIssueKeys: ["COPGEN1-125806"], extractedIssueKeysPerEntry: ["COPGEN1-125695", "COPGEN1-125806"], activityTime: "2026-07-02T05:44:09.000Z", activityType: "link", activityApplication: "Jira", activityTitle: "linked COPGEN1-125695 to COPGEN1-125806", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "link_action", finalType: "link" }, entryFingerprint: "sha256:fixture-secondary", variant: "escaped_username", entryIndex: 4 },
      { issueKey: "COPGEN1-OUTSIDE", extractedIssueKeysPerEntry: ["COPGEN1-OUTSIDE"], activityTime: "2026-06-30T05:44:09.000Z", activityType: "comment", activityTitle: "outside range", entryFingerprint: "sha256:fixture-outside", entryIndex: 5 },
      { issueKey: "", extractedIssueKeysPerEntry: [], activityTime: "2026-07-02T05:45:09.000Z", activityType: "unknown", activityTitle: "unclassified activity", activityApplication: "", activityTypeClassifier: { matchedRule: "fallback_unknown", finalType: "unknown" }, entryFingerprint: "sha256:fixture-unknown", variant: "escaped_username", entryIndex: 6 }
    ]
  });
  const incompleteConfidenceFixture = buildUserActivityTimeline({ timelineRunId: "tlrun-incomplete", builtAt: "2026-07-02T06:00:00.000Z", selectedUser: "roger_hsieh", dateRange: { start: "2026-07-02", end: "2026-07-02" }, projectScope: "COPGEN1", sourceRunId: "asrun-incomplete", sourceParsedActivityCount: 2, sourceIssueKeys: ["COPGEN1-1", "COPGEN1-2"], activityStreamQueryUser: "roger\\_hsieh", baseline: { classification: "result_incomplete_candidate", retryTriggered: true, retryRecovered: false, baselineBestParsedActivityCount: 3, currentParsedActivityCount: 2, knownEntryFingerprints: ["sha256:known"] }, entries: [{ issueKey: "COPGEN1-1", extractedIssueKeysPerEntry: ["COPGEN1-1"], activityTime: "2026-07-02T01:00:00Z", activityType: "comment", activityTitle: "known comment", activityTypeClassifier: { matchedRule: "commented_on", finalType: "comment" }, entryFingerprint: "sha256:known" }, { issueKey: "COPGEN1-2", extractedIssueKeysPerEntry: ["COPGEN1-2"], activityTime: "2026-07-02T02:00:00Z", activityType: "comment", activityTitle: "new comment", activityTypeClassifier: { matchedRule: "commented_on", finalType: "comment" }, entryFingerprint: "sha256:new" }] });
  const timelineFixtureCsv = timelineCsv(timelineFixture.events);
  const timelineIssueGroupFixture = buildTimelineIssueGroups(timelineFixture.events);
  const secondaryIssueGroupFixture = timelineIssueGroupFixture.find((group) => group.issueKey === "COPGEN1-125806");
  const queueMergeFixture = mergeQueueMetadata(mergeQueueMetadata(undefined, { source: "activity_timeline", matchedReason: "selected_from_activity_timeline", timelineEventIds: ["event-1"], activityTypes: ["link"], confidenceSummary: { high: 1, medium: 0, low: 0 }, issueKeyRole: "secondary", selectedUser: "roger_hsieh", dateRange: { start: "2026-07-02", end: "2026-07-02" }, addedAt: "2026-07-02T06:00:00.000Z" }), { source: "advanced_candidate_search", matchedReason: "assignee_match", timelineEventIds: ["event-2"], activityTypes: ["comment"], confidenceSummary: { high: 0, medium: 1, low: 0 } });
  const relatedFixture = extractRelatedIssues({ issueKey: "COPGEN1-126606", observedAt: "2026-07-02T06:00:00.000Z", issue: { fields: { parent: { key: "COPGEN1-69506" }, issuelinks: [{ outwardIssue: { key: "COPGEN1-125806" } }] } }, changelogHistories: [{ items: [{ field: "Epic Link", toString: "COPGEN1-69506" }] }] });
  const relatedScopeFixture = relatedIssueScopeSummary(relatedFixture, 1, 0);
  if (secondaryIssueGroupFixture || queueMergeFixture.sources.length !== 2 || queueMergeFixture.timelineEventIds.length !== 2 || !relatedFixture.some((item) => item.issueKey === "COPGEN1-69506" && item.scope === "recommended" && (item.relationType === "parent_link" || item.relationType === "epic_link_parent")) || !relatedFixture.some((item) => item.issueKey === "COPGEN1-125806" && item.scope === "optional") || relatedScopeFixture.recommended.uniqueIssueCount < 1 || relatedScopeFixture.optional.uniqueIssueCount < 1 || relatedScopeFixture.addedRecommendedRelatedIssuesToFetchQueueCount !== 1) failures.push(`user analysis workflow fixtures failed ${JSON.stringify({ timelineIssueGroupFixture, queueMergeFixture, relatedFixture, relatedScopeFixture })}`);
  const secondaryFixtureEvent = timelineFixture.events.find((event) => event.issueKey === "COPGEN1-125695");
  const knownIncompleteEvent = incompleteConfidenceFixture.events.find((event) => event.rawRef.entryFingerprint === "sha256:known");
  const newIncompleteEvent = incompleteConfidenceFixture.events.find((event) => event.rawRef.entryFingerprint === "sha256:new");
  if (timelineFixture.events.length !== 5 || !timelineFixture.events.some((event) => event.eventType === "comment" && event.issueKey === "COPGEN1-138930" && event.sourceConfidence === "high" && event.sourceSystem === "jira") || !timelineFixture.events.some((event) => event.eventType === "page" && event.sourceConfidence === "medium" && event.sourceSystem === "confluence") || !secondaryFixtureEvent || secondaryFixtureEvent.allIssueKeys.join(";") !== "COPGEN1-125695;COPGEN1-125806" || timelineFixture.summary.issueKeyCount !== 3 || timelineFixture.summary.allIssueKeyCount !== 3 || timelineFixture.summary.primaryIssueKeyCount !== 2 || timelineFixture.summary.sourceSystemCounts.jira !== 3 || timelineFixture.summary.sourceSystemCounts.confluence !== 1 || timelineFixture.summary.sourceSystemCounts.unknown !== 1 || timelineFixture.summary.sourceSystemDiagnostics.unknownSamples.length !== 1 || timelineFixture.summary.sourceSystemDiagnostics.unknownSamples[0]?.reason !== "no activityApplication and no issueKey" || timelineFixture.summary.integrity.missingIssueKeysFromTimeline.length !== 0 || !timelineFixture.summary.integrity.missingIssueKeysFromPrimaryTimeline.includes("COPGEN1-125806") || timelineFixture.summary.integrity.deduplicatedEntryCount !== 1 || timelineFixture.summary.integrity.skippedEntryCount !== 1 || timelineFixture.summary.eventCountReconciliation.unexplainedDifferenceCount !== 0 || timelineFixture.summary.eventCountReconciliation.status !== "reconciled" || timelineFixture.summary.dedupDiagnostics.dedupGroups.length !== 1 || timelineFixture.events.some((event) => !/^sha256:[0-9a-f]{64}$/.test(event.eventId) || event.eventId.startsWith("sha256:sha256:") || !event.rawRef.entryFingerprint || event.evidence.baselineGuard.classification !== "accepted_equal") || !timelineFixtureCsv.startsWith("\uFEFF") || !timelineFixtureCsv.includes("sourceSystem,sourceDetail") || !timelineFixtureCsv.includes("COPGEN1-125695;COPGEN1-125806") || knownIncompleteEvent?.sourceConfidence !== "high" || newIncompleteEvent?.sourceConfidence !== "low" || incompleteConfidenceFixture.summary.confidenceDiagnostics.eventLevelBaselineMatchedCount !== 1 || incompleteConfidenceFixture.summary.confidenceDiagnostics.forcedLowDueToRunIncompleteCount !== 1) failures.push(`timeline integrity fixtures failed ${JSON.stringify({ timelineFixture, incompleteConfidenceFixture })}`);
  const baselineFixtureEntries = Array.from({ length: 10 }, (_, index) => ({ entryFingerprint: sha256(`baseline-entry-${index}`), activityTime: `2026-07-02T${String(index).padStart(2, "0")}:00:00.000Z`, activityAuthorEmail: "smoke@example.com", activityType: index === 0 ? "comment" : "page", issueKey: index < 2 ? `SMOKE-${index + 1}` : "", activityTitle: `Baseline activity ${index}` }));
  const baselineFixtureObservation = (runId: string, overrides: Partial<BaselineObservation> = {}): BaselineObservation => ({ runId, observedAt: new Date().toISOString(), source: "activity_stream", selectedUser: "baseline_smoke", queryUser: "baseline\\_smoke", queryUserEncoded: "baseline%5C_smoke", variant: "escaped_username", dateQueryMode: "update_date_after_before", periodStart: "2026-07-02", periodEndExclusive: "2026-07-03", granularity: "exact_range", requestSignatureHash: sha256("baseline-fixture-request"), atomEntryCount: 10, parsedActivityCount: 10, issueKeys: ["SMOKE-1", "SMOKE-2"], entries: baselineFixtureEntries, ...overrides });
  if (!timelineFixture.events.every((event) => typeof event.sourceApplication === "string" && typeof event.hasJiraIssueKey === "boolean" && typeof event.isJiraRelated === "boolean" && Array.isArray(event.relatedSystems) && Boolean(event.jiraRelationReason)) || timelineFixture.summary.jiraRelationCounts.jiraRelated !== 3 || timelineFixture.summary.jiraRelationCounts.nonJiraRelated !== 2 || timelineFixture.summary.confluenceLinkedToJiraCount !== 0 || !["sourceApplication", "hasJiraIssueKey", "isJiraRelated", "relatedSystems", "jiraRelationReason"].every((column) => timelineFixtureCsv.split("\r\n")[0].includes(column)) || secondaryIssueGroupFixture) failures.push(`timeline Jira relation fixtures failed ${JSON.stringify({ timelineFixture, timelineIssueGroupFixture })}`);
  const fixtureBaselinePath = path.join(process.cwd(), "test-artifacts", "baseline-guard-fixtures", baselineFileName(baselineFixtureObservation("fixture-first")));
  const firstBaselineFixture = compareBaselineObservation(null, baselineFixtureObservation("fixture-first"), fixtureBaselinePath);
  saveBaselineSnapshot(fixtureBaselinePath, firstBaselineFixture.snapshot);
  const loadedBaselineFixture = loadBaselineSnapshot(fixtureBaselinePath);
  const equalBaselineFixture = compareBaselineObservation(firstBaselineFixture.snapshot, baselineFixtureObservation("fixture-equal"), fixtureBaselinePath);
  const improvedEntry = { entryFingerprint: sha256("baseline-entry-new"), activityTime: "2026-07-02T12:00:00.000Z", activityAuthorEmail: "smoke@example.com", activityType: "comment", issueKey: "SMOKE-3", activityTitle: "New baseline activity" };
  const improvedBaselineFixture = compareBaselineObservation(firstBaselineFixture.snapshot, baselineFixtureObservation("fixture-improved", { atomEntryCount: 11, parsedActivityCount: 11, issueKeys: ["SMOKE-1", "SMOKE-2", "SMOKE-3"], entries: [...baselineFixtureEntries, improvedEntry] }), fixtureBaselinePath);
  const countRegressionFixture = compareBaselineObservation(firstBaselineFixture.snapshot, baselineFixtureObservation("fixture-count", { atomEntryCount: 3, parsedActivityCount: 3 }), fixtureBaselinePath);
  const keyRegressionFixture = compareBaselineObservation(firstBaselineFixture.snapshot, baselineFixtureObservation("fixture-keys", { issueKeys: ["SMOKE-1"] }), fixtureBaselinePath);
  const entryRegressionFixture = compareBaselineObservation(firstBaselineFixture.snapshot, baselineFixtureObservation("fixture-entries", { entries: baselineFixtureEntries.slice(0, 9) }), fixtureBaselinePath);
  const mixedRegressionFixture = compareBaselineObservation(firstBaselineFixture.snapshot, baselineFixtureObservation("fixture-mixed", { atomEntryCount: 3, parsedActivityCount: 3, issueKeys: [], entries: baselineFixtureEntries.slice(0, 3) }), fixtureBaselinePath);
  const recoveredRetryFixture = selectBaselineGuardOutcome([{ shouldRetry: true, parsedActivityCount: 3, issueKeyCount: 0 }, { shouldRetry: false, parsedActivityCount: 10, issueKeyCount: 2 }]);
  const incompleteRetryFixture = selectBaselineGuardOutcome([{ shouldRetry: true, parsedActivityCount: 3, issueKeyCount: 0 }, { shouldRetry: true, parsedActivityCount: 4, issueKeyCount: 0 }, { shouldRetry: true, parsedActivityCount: 3, issueKeyCount: 0 }]);
  const baselineFixtureText = fs.readFileSync(fixtureBaselinePath, "utf8");
  if (!loadedBaselineFixture || firstBaselineFixture.comparison.classification !== "first_observation" || !firstBaselineFixture.comparison.baselineUpdated || equalBaselineFixture.comparison.classification !== "accepted_equal" || equalBaselineFixture.comparison.baselineUpdated || improvedBaselineFixture.comparison.classification !== "accepted_improved" || !improvedBaselineFixture.comparison.baselineUpdated || !improvedBaselineFixture.snapshot.knownIssueKeys.includes("SMOKE-3") || countRegressionFixture.comparison.classification !== "suspicious_count_regression" || !countRegressionFixture.comparison.shouldRetry || keyRegressionFixture.comparison.classification !== "suspicious_known_issue_keys_missing" || !keyRegressionFixture.comparison.shouldRetry || entryRegressionFixture.comparison.classification !== "suspicious_known_entries_missing" || !entryRegressionFixture.comparison.shouldRetry || mixedRegressionFixture.comparison.classification !== "suspicious_mixed_regression" || mixedRegressionFixture.comparison.confidence !== "high" || !mixedRegressionFixture.comparison.shouldRetry || mixedRegressionFixture.snapshot.knownIssueKeys.length !== firstBaselineFixture.snapshot.knownIssueKeys.length || mixedRegressionFixture.snapshot.knownEntryFingerprints.length !== firstBaselineFixture.snapshot.knownEntryFingerprints.length || mixedRegressionFixture.snapshot.lowConfidenceObservations.length !== 1 || recoveredRetryFixture.selectedIndex !== 1 || !recoveredRetryFixture.retryRecovered || recoveredRetryFixture.resultIncompleteCandidate || incompleteRetryFixture.selectedIndex !== 1 || incompleteRetryFixture.retryRecovered || !incompleteRetryFixture.resultIncompleteCandidate || /Authorization\s*:\s*(?!\[masked\])|Bearer\s+(?!\[masked\])|Basic\s+(?!\[masked\])|JSESSIONID|apiToken|password/i.test(baselineFixtureText)) failures.push(`baseline guard fixtures failed ${JSON.stringify({ first: firstBaselineFixture.comparison, equal: equalBaselineFixture.comparison, improved: improvedBaselineFixture.comparison, count: countRegressionFixture.comparison, keys: keyRegressionFixture.comparison, entries: entryRegressionFixture.comparison, mixed: mixedRegressionFixture.comparison, recoveredRetryFixture, incompleteRetryFixture })}`);

  for (const viewport of uiViewports) {
    window.setSize(viewport.width, viewport.height, false);
    await wait(250);

    for (const debugState of debugStates) {
      await window.webContents.executeJavaScript(`
        (() => {
          const desired = ${JSON.stringify(debugState)};
          const panel = document.querySelector("[data-debug-panel-state]");
          if (panel && panel.getAttribute("data-debug-panel-state") !== desired) {
            const button = panel.querySelector("button");
            if (button) button.click();
          }
        })()
      `);
      await wait(250);

      for (const route of uiRoutes) {
        await window.webContents.executeJavaScript(`(() => { const link = Array.from(document.querySelectorAll("nav a")).find((element) => element.getAttribute("href") === ${JSON.stringify(route.hash)}); if (link instanceof HTMLElement) link.click(); else window.location.hash = ${JSON.stringify(route.hash)}; })()`);
        const expectedPath = route.hash;
        let routeReady = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const state = await window.webContents.executeJavaScript(`(() => { const active = Array.from(document.querySelectorAll("nav a")).find((element) => String(element.className).includes("bg-blue-50")); return { hash: window.location.hash, title: document.querySelector("h1")?.textContent || "", activePath: active?.getAttribute("href") || "" }; })()`);
          if (state.hash === route.hash && String(state.title).includes(route.title) && state.activePath === expectedPath) {
            routeReady = true;
            break;
          }
          await wait(100);
        }
        if (!routeReady) failures.push(`${viewport.width}x${viewport.height} ${debugState} ${route.name}: route did not settle before audit`);
        await wait(180);

        const audit = await window.webContents.executeJavaScript(`
        (() => {
          const tolerance = 2;
          const vw = document.documentElement.clientWidth;
          const rootOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const bodyOverflow = document.body.scrollWidth - document.body.clientWidth;
          const bodyText = document.body.innerText || "";
          const offenders = [];
          for (const el of Array.from(document.querySelectorAll("body *"))) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isAllowedScroller = style.overflowX === "auto" || style.overflowX === "scroll";
            if (!isAllowedScroller && rect.width > 0 && rect.right > vw + 1) {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                className: String(el.className || "").slice(0, 120),
                text: String(el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 100),
                right: Math.round(rect.right),
                width: Math.round(rect.width)
              });
            }
            if (offenders.length >= 8) break;
          }
          const clippingTargets = Array.from(document.querySelectorAll([
            "[data-no-clip='true']",
            "[data-ui='metric-card'] [data-no-clip='true']",
            "button",
            ".btn",
            ".chip",
            "nav a span",
            "[data-debug-panel-state] label"
          ].join(",")));
          const clipping = [];
          for (const el of clippingTargets) {
            if (el.closest("[data-allow-truncate='true']") || el.getAttribute("data-allow-truncate") === "true") continue;
            if (el.classList && el.classList.contains("sr-only")) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            const overflowX = el.scrollWidth - el.clientWidth;
            const overflowY = el.scrollHeight - el.clientHeight;
            if (overflowX > tolerance || overflowY > tolerance) {
              clipping.push({
                tag: el.tagName.toLowerCase(),
                attr: el.getAttribute("data-no-clip") === "true" ? "data-no-clip" : "",
                className: String(el.className || "").slice(0, 120),
                text: String(el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 100),
                overflowX,
                overflowY,
                clientWidth: el.clientWidth,
                scrollWidth: el.scrollWidth,
                clientHeight: el.clientHeight,
                scrollHeight: el.scrollHeight
              });
            }
            if (clipping.length >= 12) break;
          }
          const noClipCount = document.querySelectorAll("[data-no-clip='true']").length;
          const allowTruncateCount = document.querySelectorAll("[data-allow-truncate='true']").length;
          return {
            hash: window.location.hash,
            rootOverflow,
            bodyOverflow,
            hasSidebar: bodyText.includes("Dashboard") && bodyText.includes("Settings"),
            hasDebugLog: bodyText.includes("Debug Log"),
            hasBuildTime: bodyText.includes("Build Time"),
            hasTitle: bodyText.includes(${JSON.stringify(route.title)}),
            debugState: document.querySelector("[data-debug-panel-state]")?.getAttribute("data-debug-panel-state"),
            clipping,
            noClipCount,
            allowTruncateCount,
            offenders
          };
        })()
      `);

        const context = `${viewport.width}x${viewport.height} ${debugState} ${route.name}`;
        if (audit.rootOverflow > 1 || audit.bodyOverflow > 1) {
          failures.push(`${context}: global horizontal overflow root=${audit.rootOverflow}, body=${audit.bodyOverflow}, offenders=${JSON.stringify(audit.offenders)}`);
        }
        if (audit.debugState !== debugState) {
          failures.push(`${context}: expected debug panel ${debugState}, got ${audit.debugState}`);
        }
        if (!audit.hasSidebar) {
          failures.push(`${context}: sidebar text not found`);
        }
        if (debugState === "expanded" && !audit.hasDebugLog) {
          failures.push(`${context}: debug log panel not found`);
        }
        if (!audit.hasBuildTime) {
          failures.push(`${context}: Build Time not found`);
        }
        if (!audit.hasTitle) {
          failures.push(`${context}: page title ${route.title} not found`);
        }
        if (audit.clipping.length > 0) {
          failures.push(`${context}: internal clipping detected ${JSON.stringify(audit.clipping)}`);
        }

        if (shouldCaptureUi && viewport.capture) {
          await window.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`);
          await wait(180);
          const image = await window.capturePage();
          const filename = `${viewport.width}x${viewport.height}-${debugState}-${route.name}.png`;
          fs.writeFileSync(path.join(captureDir, filename), image.toPNG());
        }
      }
    }
  }

  const precisionExportDir = path.join(getExportsDir(), "user-analysis");
  ensureDir(precisionExportDir);
  const autoSaveDirs = {
    activity_stream_run: ensureDir(path.join(precisionExportDir, "activity-stream-runs")),
    precision_probe_run: ensureDir(path.join(precisionExportDir, "precision-probe-runs")),
    manual_url_replay_run: ensureDir(path.join(precisionExportDir, "manual-url-replay-runs")),
    maxresults_cap_test: ensureDir(path.join(precisionExportDir, "maxresults-cap-tests"))
  };
  const autoSaveFilesBefore = Object.fromEntries(Object.entries(autoSaveDirs).map(([type, dir]) => [type, new Set(fs.readdirSync(dir))])) as Record<AutoSaveResultType, Set<string>>;
  const debugBundlesDir = ensureDir(getDebugFoldersDir());
  const debugBundlesBefore = new Set(fs.readdirSync(debugBundlesDir));
  const precisionExportsBefore = new Set(fs.readdirSync(precisionExportDir));
  const precisionFullFetchFilesBefore = fs.existsSync(getFullFetchLogsDir()) ? new Set(fs.readdirSync(getFullFetchLogsDir())) : new Set<string>();
  const precisionActionLogPath = getUserActionLogPath();
  const precisionActionLogStartSize = fs.existsSync(precisionActionLogPath) ? fs.statSync(precisionActionLogPath).size : 0;
  try {
    assertReadOnlyRequest("GET", "/plugins/servlet/streams?maxResults=10&relativeLinks=true&streams=user%20IS%20smoke.user&startDate=2026-07-01&endDate=2026-07-08&_=1784004289793");
  } catch (error) {
    failures.push(`activity stream guard rejected valid GET: ${String(error)}`);
  }
  const escapedVariants = activityStreamVariants({ baseUrl: "https://jira.example.invalid", email: "roger_hsieh@phison.com" } as AppConnection, ["roger_hsieh"], "roger_hsieh", "auto");
  const escapedVariant = escapedVariants.find((item) => item.variant === "escaped_username");
  const escapedParams = new URLSearchParams({ streams: `user IS ${escapedVariant?.user ?? ""}` });
  if (escapedVariant?.user !== "roger\\_hsieh" || !escapedParams.toString().includes("roger%5C_hsieh")) failures.push(`escaped username variant failed ${JSON.stringify({ escapedVariants, encoded: escapedParams.toString() })}`);
  const standardFlowFixture = await runActivityStreamProbe({ baseUrl: "https://jira.example.invalid", email: "roger_hsieh@phison.com" } as AppConnection, ["roger_hsieh"], "ignored_override", "auto", "2026-07-01", "2026-07-07", 10, true, "asrun-standard-flow", "both", "quick", false, "off", 14, true, false);
  if (standardFlowFixture.standardActivityStreamFlow.selectedUser !== "roger_hsieh" || standardFlowFixture.standardActivityStreamFlow.activityStreamQueryUser !== "roger\\_hsieh" || standardFlowFixture.standardActivityStreamFlow.activityStreamQueryUserEncoded !== "roger%5C_hsieh" || standardFlowFixture.standardActivityStreamFlow.variant !== "escaped_username" || standardFlowFixture.standardActivityStreamFlow.dateQueryMode !== "update_date_after_before" || standardFlowFixture.standardActivityStreamFlow.chunkingMode !== "auto" || standardFlowFixture.standardActivityStreamFlow.perChunkMaxResults !== 500 || standardFlowFixture.activityStream.variantResults.length !== 1 || !standardFlowFixture.activityStream.requestUrlSanitized.includes("roger%5C_hsieh") || !standardFlowFixture.activityStream.requestUrlSanitized.includes("maxResults=500") || !standardFlowFixture.activityStream.requestUrlSanitized.includes("update-date+AFTER") || !standardFlowFixture.activityStream.requestUrlSanitized.includes("update-date+BEFORE")) failures.push(`standard Activity Stream flow failed: ${JSON.stringify(standardFlowFixture.standardActivityStreamFlow)}`);
  const epochFixture = requestedDateRange("2026-01-01", "2026-01-31");
  if (epochFixture.startEpochMs !== 1767196800000 || epochFixture.endExclusiveEpochMs !== 1769875200000) failures.push(`Asia/Taipei epoch conversion failed ${JSON.stringify(epochFixture)}`);
  const startEndPathFixture = activityStreamRequestPath(50, true, "roger\\_hsieh", "startDate_endDate", epochFixture);
  const updateDatePathFixture = activityStreamRequestPath(50, true, "roger\\_hsieh", "update_date_after_before", epochFixture);
  if (!startEndPathFixture.includes("startDate=2026-01-01") || !startEndPathFixture.includes("endDate=2026-02-01")) failures.push(`startDate/endDate URL failed ${startEndPathFixture}`);
  if ((updateDatePathFixture.match(/streams=/g) ?? []).length !== 3 || !updateDatePathFixture.includes("update-date+AFTER+1767196800000") || !updateDatePathFixture.includes("update-date+BEFORE+1769875200000")) failures.push(`update-date multiple streams URL failed ${updateDatePathFixture}`);
  const dateFixtureRunId = "asrun-date-fixture";
  const insideDateFixture = activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed><entry><title>commented on SMOKE-301</title><author><name>Smoke</name></author><updated>2026-01-15T12:00:00+08:00</updated></entry></feed>" }, updateDatePathFixture, "roger\\_hsieh", "escaped_username", dateFixtureRunId);
  const outsideDateFixture = activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed><entry><title>commented on SMOKE-301</title><author><name>Smoke</name></author><updated>2026-01-15T12:00:00+08:00</updated></entry><entry><title>commented on SMOKE-302</title><author><name>Smoke</name></author><updated>2025-12-15T12:00:00+08:00</updated></entry></feed>" }, startEndPathFixture, "roger\\_hsieh", "escaped_username", dateFixtureRunId);
  const effectiveDateFixture = dateQueryDiagnostics("update_date_after_before", dateFixtureRunId, aggregateActivityStream([insideDateFixture], "roger_hsieh"), epochFixture);
  const ineffectiveDateFixture = dateQueryDiagnostics("startDate_endDate", dateFixtureRunId, aggregateActivityStream([outsideDateFixture], "roger_hsieh"), epochFixture);
  if (effectiveDateFixture.dateFilterEffective !== true || effectiveDateFixture.entriesInsideRequestedRange !== 1 || ineffectiveDateFixture.dateFilterEffective !== false || ineffectiveDateFixture.entriesOutsideRequestedRange !== 1) failures.push(`date effectiveness diagnostics failed ${JSON.stringify({ effectiveDateFixture, ineffectiveDateFixture })}`);
  const acceptedReplay = validateManualActivityStreamUrl("https://jira.example.invalid", "https://jira.example.invalid/plugins/servlet/streams?maxResults=10&relativeLinks=true&streams=user+IS+roger%5C_hsieh&_=1784004289793");
  const rejectedExternal = validateManualActivityStreamUrl("https://jira.example.invalid", "https://example.com/plugins/servlet/streams?maxResults=10");
  const rejectedPath = validateManualActivityStreamUrl("https://jira.example.invalid", "https://jira.example.invalid/rest/api/2/myself");
  const rejectedSensitive = validateManualActivityStreamUrl("https://jira.example.invalid", "https://jira.example.invalid/plugins/servlet/streams?token=secret");
  if (!acceptedReplay.diagnostics.manualUrlAccepted || acceptedReplay.pathName.includes("jira.example.invalid") || rejectedExternal.diagnostics.rejectReason !== "external_origin" || rejectedPath.diagnostics.rejectReason !== "invalid_path" || rejectedSensitive.diagnostics.rejectReason !== "sensitive_query_key") failures.push(`manual replay URL validation failed ${JSON.stringify({ acceptedReplay, rejectedExternal, rejectedPath, rejectedSensitive })}`);
  for (const blocked of [
    { method: "POST", pathName: "/plugins/servlet/streams?maxResults=10" },
    { method: "GET", pathName: "/plugins/servlet/streams?unsafeUrl=https://example.com" },
    { method: "GET", pathName: "https://example.com/plugins/servlet/streams" }
  ]) {
    try {
      assertReadOnlyRequest(blocked.method, blocked.pathName);
      failures.push(`activity stream guard allowed blocked request: ${blocked.method} ${blocked.pathName}`);
    } catch {
      // Expected read-only guard rejection.
    }
  }
  const parserFixtures: Array<{ name: string; response: JiraHttpResult; expectedStatus: string; expectedIssueCount: number; expectedDiagnosis: ActivityStreamDiagnosis; expectedAtomEntries: number }> = [
    { name: "json", response: { ok: true, status: 200, contentType: "application/json", json: { entries: [{ issueKey: "SMOKE-201", title: "SMOKE-201 updated", author: { email: "smoke@example.com" }, updated: "2026-07-02T10:00:00Z" }] } }, expectedStatus: "success", expectedIssueCount: 1, expectedDiagnosis: "parsed", expectedAtomEntries: 0 },
    { name: "atom", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: '<feed><entry><title>Commented on SMOKE-202</title><link href="/browse/SMOKE-202"/><author><email>smoke@example.com</email></author><updated>2026-07-02T11:00:00Z</updated><summary>comment added</summary></entry></feed>' }, expectedStatus: "success", expectedIssueCount: 1, expectedDiagnosis: "parsed", expectedAtomEntries: 1 },
    { name: "manual_atom", response: { ok: true, status: 200, contentType: "application/atom+xml;charset=UTF-8", json: null, bodyTextSanitized: `<feed><entry><title type="html">created a link from <a href="/browse/SMOKE-203" class="issue-link">SMOKE-203</a></title><author><name>Smoke User(smoke.user)</name><email>smoke.user@example.invalid</email></author><published>2026-07-09T05:36:18.000Z</published><activity:object><title type="text">SMOKE-203</title><summary type="text">[SMOKE-204] Synthetic parser fixture</summary></activity:object></entry></feed>` }, expectedStatus: "success", expectedIssueCount: 2, expectedDiagnosis: "parsed", expectedAtomEntries: 1 },
    { name: "no_entries", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed></feed>" }, expectedStatus: "success", expectedIssueCount: 0, expectedDiagnosis: "no_entries", expectedAtomEntries: 0 },
    { name: "parser_failed", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed><entry><title></title></entry></feed>" }, expectedStatus: "failed", expectedIssueCount: 0, expectedDiagnosis: "parser_failed", expectedAtomEntries: 1 },
    { name: "html", response: { ok: false, status: 200, contentType: "text/html", json: null, errorType: "NON_JSON_RESPONSE", message: "HTML login page", bodyPreview: "login" }, expectedStatus: "failed", expectedIssueCount: 0, expectedDiagnosis: "html_login", expectedAtomEntries: 0 },
    { name: "403", response: { ok: false, status: 403, contentType: "application/json", json: { error: "forbidden" }, errorType: "HTTP_ERROR", message: "Forbidden" }, expectedStatus: "unsupported", expectedIssueCount: 0, expectedDiagnosis: "http_error", expectedAtomEntries: 0 },
    { name: "404", response: { ok: false, status: 404, contentType: "text/plain", json: null, errorType: "NON_JSON_RESPONSE", message: "Not found", bodyPreview: "Not found" }, expectedStatus: "unsupported", expectedIssueCount: 0, expectedDiagnosis: "http_error", expectedAtomEntries: 0 }
  ];
  for (const fixture of parserFixtures) {
    const parsed = activityStreamResult(fixture.response, "/plugins/servlet/streams?maxResults=10", "smoke@example.com");
    const expectedIssueCount = fixture.name === "manual_atom" ? 1 : fixture.expectedIssueCount;
    if (parsed.status !== fixture.expectedStatus || parsed.parsedIssueKeys.length !== expectedIssueCount || parsed.diagnosis !== fixture.expectedDiagnosis || parsed.atomEntryCount !== fixture.expectedAtomEntries) failures.push(`activity stream ${fixture.name} parser failed: ${JSON.stringify(parsed)}`);
    if (fixture.name === "manual_atom" && (parsed.parsedIssueKeys[0] !== "SMOKE-203" || parsed.entriesSanitized[0]?.activityType !== "link" || !parsed.entriesSanitized[0]?.activityAuthorEmail)) failures.push(`activity stream manual Atom fields failed: ${JSON.stringify(parsed)}`);
    if (fixture.name === "html" && (parsed as Record<string, unknown>).bodyTextSanitized) failures.push("activity stream HTML parser retained full body");
  }
  const anomalyXml = `<feed>${Array.from({ length: 20 }, (_, index) => `<entry><title>${index === 0 ? "SMOKE-999 updated" : `Entry without key ${index}`}</title><author><name>Smoke User</name></author><updated>2026-07-02T11:00:00Z</updated></entry>`).join("")}</feed>`;
  const anomalyResult = activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: anomalyXml }, "/plugins/servlet/streams?maxResults=20", "smoke_user", "escaped_username", "asrun-anomaly");
  if (anomalyResult.parserDiagnostics.parserAnomaly || anomalyResult.parserDiagnostics.atomEntryCount !== 20 || anomalyResult.parserDiagnostics.parsedEntryCount !== 20 || anomalyResult.parserDiagnostics.skippedEntryCount !== 0 || anomalyResult.diagnosis !== "parsed_no_issue_keys") failures.push(`activity stream no-key activity diagnostics failed: ${JSON.stringify(anomalyResult.parserDiagnostics)}`);
  const trueAnomalyXml = `<feed><entry><title>SMOKE-998 updated</title><author><name>Smoke User</name></author><updated>2026-07-02T11:00:00Z</updated></entry>${Array.from({ length: 19 }, () => "<entry><title></title></entry>").join("")}</feed>`;
  const trueAnomalyResult = activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: trueAnomalyXml }, "/plugins/servlet/streams?maxResults=20", "smoke_user", "escaped_username", "asrun-true-anomaly");
  if (!trueAnomalyResult.parserDiagnostics.parserAnomaly || trueAnomalyResult.parserDiagnostics.parsedEntryCount !== 1 || trueAnomalyResult.parserDiagnostics.skippedEntryCount !== 19 || trueAnomalyResult.parserDiagnostics.skippedEntriesSanitized.length !== 5) failures.push(`activity stream true parser anomaly diagnostics failed: ${JSON.stringify(trueAnomalyResult.parserDiagnostics)}`);
  const confluenceOnlyXml = `<feed>${Array.from({ length: 67 }, (_, index) => `<entry><title>attached a file to E33 SSV9Q Sustain page ${index + 1}</title><author><name>Smoke Confluence User</name><email>smoke.confluence@example.com</email></author><updated>2026-01-${String(index % 28 + 1).padStart(2, "0")}T08:00:00+08:00</updated><activity:application>com.atlassian.confluence</activity:application><activity:object-type>page</activity:object-type><summary>Confluence-only activity ${index + 1}</summary></entry>`).join("")}</feed>`;
  const confluenceOnlyResult = activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: confluenceOnlyXml }, "/plugins/servlet/streams?maxResults=67", "smoke_user", "escaped_username", "asrun-confluence-67");
  if (confluenceOnlyResult.diagnosis !== "parsed_confluence_only" || !confluenceOnlyResult.parsed || confluenceOnlyResult.parsedActivityCount !== 67 || confluenceOnlyResult.parsedIssueKeys.length !== 0 || confluenceOnlyResult.parserDiagnostics.parsedEntryCount !== 67 || confluenceOnlyResult.parserDiagnostics.skippedEntryCount !== 0 || confluenceOnlyResult.parserDiagnostics.entriesWithoutIssueKeyCount !== 67 || confluenceOnlyResult.parserDiagnostics.confluenceOnlyEntryCount !== 67 || confluenceOnlyResult.parserDiagnostics.parserAnomaly || confluenceOnlyResult.activityEntryStats.confluenceOnlyEntryCount !== 67) failures.push(`67-entry Confluence-only diagnosis failed: ${JSON.stringify({ diagnosis: confluenceOnlyResult.diagnosis, parserDiagnostics: confluenceOnlyResult.parserDiagnostics, activityEntryStats: confluenceOnlyResult.activityEntryStats })}`);
  const noEntryVariants = (["username", "escaped_username", "email"] as const).map((variant) => activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed></feed>" }, `/plugins/servlet/streams?variant=${variant}`, variant, variant, "asrun-all-empty"));
  const allNoEntries = aggregateActivityStream(noEntryVariants, "smoke_user");
  if (allNoEntries.bestVariant !== "" || allNoEntries.bestVariantReason !== "all_variants_no_entries" || allNoEntries.bestActivityStreamUser !== "smoke_user" || allNoEntries.diagnosis !== "no_entries" || allNoEntries.overallStatus !== "no_entries") failures.push(`all-no-entries aggregation failed: ${JSON.stringify(allNoEntries)}`);
  const longChunkPlan = buildDateRangeChunking(requestedDateRange("2026-01-01", "2026-07-14"), "auto", 14);
  const shortChunkPlan = buildDateRangeChunking(requestedDateRange("2026-07-01", "2026-07-14"), "auto", 14);
  const weeklyChunkPlan = buildDateRangeChunking(requestedDateRange("2026-07-01", "2026-07-31"), "weekly", 14);
  const customChunkPlan = buildDateRangeChunking(requestedDateRange("2026-07-01", "2026-07-31"), "custom_days", 10);
  if (!longChunkPlan.enabled || longChunkPlan.mode !== "monthly" || longChunkPlan.chunkCount !== 7 || shortChunkPlan.enabled || weeklyChunkPlan.chunkCount !== 5 || customChunkPlan.chunkCount !== 4) failures.push(`date chunk planner failed: ${JSON.stringify({ longChunkPlan, shortChunkPlan, weeklyChunkPlan, customChunkPlan })}`);
  let invalidCustomDaysRejected = false;
  try { buildDateRangeChunking(requestedDateRange("2026-07-01", "2026-07-31"), "custom_days", 32); } catch { invalidCustomDaysRejected = true; }
  if (!invalidCustomDaysRejected) failures.push("custom chunk days validation did not reject values above 31");
  if (chunkOverallStatus([{ status: "success", diagnosis: "parsed" }, { status: "failed", diagnosis: "http_error" }]) !== "partial" || chunkOverallStatus([{ status: "success", diagnosis: "no_entries" }]) !== "no_entries" || chunkOverallStatus([{ status: "failed", diagnosis: "http_error" }]) !== "failed") failures.push("partial/no_entries/failed chunk status classification failed");
  const typeFixtures: Array<{ title: string; expected: ActivityStreamEntry["activityType"]; application?: string; objectType?: string }> = [
    { title: "commented on COPGEN1-138930", expected: "comment" },
    { title: "attached file to COPGEN1-138930", expected: "attachment" },
    { title: "created a link from COPGEN1-138930 to Confluence Page", expected: "link" },
    { title: "edited page Weekly Report", expected: "page", application: "Confluence", objectType: "page" },
    { title: "changed the Assignee", expected: "assignee_change" },
    { title: "changed the Status", expected: "status_change" },
    { title: "changed the Resolution", expected: "resolution_change" },
    { title: "updated 4 fields", expected: "field_change" },
    { title: "performed an activity", expected: "unknown" }
  ];
  for (const fixture of typeFixtures) {
    const actual = activityType(fixture.title, fixture.application ?? "Jira", fixture.objectType ?? "issue");
    if (actual !== fixture.expected) failures.push(`activity type classification failed: ${fixture.title} => ${actual} expected ${fixture.expected}`);
  }
  const commentRegressionEntry = activityEntry({ issueKey: "COPGEN1-138930", title: "謝正洪(roger_hsieh) commented on COPGEN1-138930 - [JACKSONQLC-3024] IOFULLSEQWRT Failure", content: "attachment metadata exists elsewhere", raw: "<activity:object-type>attachment</activity:object-type>", application: "Jira", objectType: "issue" }, "escaped_username", "asrun-classifier", 0);
  if (commentRegressionEntry.activityType !== "comment" || commentRegressionEntry.issueKey !== "COPGEN1-138930" || commentRegressionEntry.activityApplication !== "Jira" || commentRegressionEntry.activityTypeClassifier.matchedRule !== "commented_on" || commentRegressionEntry.activityTypeClassifier.finalType !== "comment" || commentRegressionEntry.activityTypeClassifier.priority !== 100) failures.push(`commented-on classifier regression failed: ${JSON.stringify(commentRegressionEntry)}`);
  window.setSize(1280, 720, false);
  await navigateUiSmoke(window, "#/precision-probe", "[data-testid='probe-mode-stability']");
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-stability']")?.click();`);
  await wait(120);
  const stabilitySetupAudit = await window.webContents.executeJavaScript(`(() => ({ modes: document.querySelectorAll("[data-testid^='probe-mode-']").length, setup: Boolean(document.querySelector("[data-testid='run-stability-probe']")), requestWindow: Boolean(document.querySelector("[data-testid='stability-request-window']")), rounds: Boolean(document.querySelector("[data-testid='stability-round-count']")), delay: Boolean(document.querySelector("[data-testid='stability-round-delay']")), stopMode: Boolean(document.querySelector("[data-testid='round-mode-stop_when_stable']")), forceMode: Boolean(document.querySelector("[data-testid='round-mode-force_all_rounds']")), currentMode: Boolean(document.querySelector("[data-testid='current-round-mode']")), merge: Boolean(document.querySelector("[data-testid='stability-merge-strategy']")), noLocalLogLevel: !(document.body.innerText || "").includes("Stability Probe Log Level") }))()`);
  await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return; const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='stability-start-date']", "2026-07-07"); set("[data-testid='stability-end-date']", "2026-07-07"); set("[data-testid='stability-request-window']", "1_day"); set("[data-testid='stability-round-count']", "3"); set("[data-testid='stability-round-delay']", "0"); set("[data-testid='stability-merge-strategy']", "union"); document.querySelector("[data-testid='round-mode-force_all_rounds']")?.click(); })()`);
  await wait(80);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-stability-probe']")?.click();`);
  await wait(1800);
  await window.webContents.executeJavaScript(`document.querySelector("[data-debug-panel-state='collapsed'] button")?.click();`);
  await wait(80);
  const stabilityResultAudit = await window.webContents.executeJavaScript(`(() => { const text = document.body.textContent || ""; const progressText = document.querySelector("[data-testid='stability-progress-v2']")?.textContent || ""; const debugText = document.querySelector("[data-debug-panel-state='expanded']")?.textContent || ""; return { progress: Boolean(document.querySelector("[data-testid='stability-progress-v2']")), recommendation: text.includes("Round Stability Recommendation") && text.includes("輪次穩定性建議"), completed: text.includes("Round Union Events") && text.includes("Consistency Rate"), elapsed: progressText.includes("Elapsed Time") && progressText.includes("Estimated Completion Time"), globalLog: debugText.includes("[stability-probe]") }; })()`);
  if (shouldCaptureUi) {
    const stabilityImage = await window.capturePage();
    fs.writeFileSync(path.join(captureDir, "1280x720-expanded-stability-probe-result.png"), stabilityImage.toPNG());
  }
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-roundComparison']")?.click();`);
  await wait(120);
  const stabilityComparisonAudit = await window.webContents.executeJavaScript(`(() => { const table = document.querySelector("[data-testid='stability-round-comparison']"); const text = table?.textContent || ""; return { table: Boolean(table), rows: table?.querySelectorAll("tbody tr").length || 0, headers: ["Round", "Status", "Duration", "Raw Events", "Unique Events", "Primary Jira Keys", "Referenced Jira Keys", "New Events vs Previous", "Missing Events vs Previous", "Event Fingerprint", "Primary Jira Fingerprint", "Consistency", "Cold Start"].every((label) => text.includes(label)), filter: Boolean(document.querySelector("[data-testid='round-status-filter']")), sort: Boolean(document.querySelector("[data-testid='round-sort']")), columns: Boolean(document.querySelector("[data-testid='round-columns']")), copy: Boolean(document.querySelector("[data-testid='copy-round-comparison']")) }; })()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-raw']")?.click();`);
  await wait(100);
  const stabilityRawAudit = await window.webContents.executeJavaScript(`document.querySelectorAll("[data-testid='stability-raw-results'] details").length`);
  if (Object.values(stabilitySetupAudit).some((value) => value === false) || stabilitySetupAudit.modes !== 6 || !stabilityResultAudit.progress || !stabilityResultAudit.recommendation || !stabilityResultAudit.completed || !stabilityResultAudit.elapsed || !stabilityResultAudit.globalLog || !stabilityComparisonAudit.table || stabilityComparisonAudit.rows < 2 || !stabilityComparisonAudit.headers || !stabilityComparisonAudit.filter || !stabilityComparisonAudit.sort || !stabilityComparisonAudit.columns || !stabilityComparisonAudit.copy || stabilityRawAudit < 2) failures.push(`Activity Stream Stability Probe UI/run audit failed ${JSON.stringify({ stabilitySetupAudit, stabilityResultAudit, stabilityComparisonAudit, stabilityRawAudit })}`);
  await navigateUiSmoke(window, "#/", "h1");
  await navigateUiSmoke(window, "#/precision-probe", "[data-testid='probe-mode-raw']");
  const stabilityPersistenceAudit = await window.webContents.executeJavaScript(`(() => ({ activeRaw: document.querySelector("[data-testid='probe-mode-raw']")?.classList.contains("btn-primary") === true, rawRounds: document.querySelectorAll("[data-testid='stability-raw-results'] details").length }))()`);
  if (!stabilityPersistenceAudit.activeRaw || stabilityPersistenceAudit.rawRounds < 2) failures.push(`Stability session persistence audit failed ${JSON.stringify(stabilityPersistenceAudit)}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-benchmark']")?.click();`);
  await wait(80);
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector("[data-testid='benchmark-runs']"); if (input instanceof HTMLInputElement) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "1"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); } document.querySelector("[data-testid='run-benchmark']")?.click(); })()`);
  await wait(900);
  const benchmarkAudit = await window.webContents.executeJavaScript(`(() => ({ samples: document.querySelectorAll("[data-testid='benchmark-samples'] tbody tr").length, text: document.body.textContent || "" }))()`);
  if (benchmarkAudit.samples < 1 || !benchmarkAudit.text.includes("escaped_username") || !benchmarkAudit.text.includes("Activity Stream 效能基準")) failures.push(`Activity Stream Benchmark audit failed ${JSON.stringify(benchmarkAudit)}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-stability']")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return; const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='stability-round-count']", "32"); set("[data-testid='stability-round-delay']", "1000"); document.querySelector("[data-testid='round-mode-force_all_rounds']")?.click(); })()`);
  await wait(80);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-stability-probe']")?.click();`);
  await wait(150);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='cancel-stability-probe']")?.click();`);
  await wait(1300);
  const stabilityCancellationAudit = await window.webContents.executeJavaScript(`(() => { const text = document.body.textContent || ""; return { cancelled: text.includes("cancelled"), runEnabled: !(document.querySelector("[data-testid='run-stability-probe']") instanceof HTMLButtonElement) || !document.querySelector("[data-testid='run-stability-probe']").disabled, cancelDisabled: document.querySelector("[data-testid='cancel-stability-probe']") instanceof HTMLButtonElement && document.querySelector("[data-testid='cancel-stability-probe']").disabled }; })()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-raw']")?.click();`);
  await wait(80);
  const cancelledRoundAudit = await window.webContents.executeJavaScript(`(() => ({ count: document.querySelectorAll("[data-testid='stability-raw-results'] details").length, cancelled: (document.querySelector("[data-testid='stability-raw-results']")?.textContent || "").includes("cancelled") }))()`);
  if (!(stabilityCancellationAudit.cancelled || cancelledRoundAudit.cancelled) || !stabilityCancellationAudit.runEnabled || !stabilityCancellationAudit.cancelDisabled || cancelledRoundAudit.count < 1 || cancelledRoundAudit.count >= 32) failures.push(`Activity Stream Stability Probe cancellation audit failed ${JSON.stringify({ stabilityCancellationAudit, cancelledRoundAudit })}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-stability']")?.click();`);
  await wait(80);
  await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return; const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='stability-round-count']", "3"); set("[data-testid='stability-round-delay']", "0"); })()`);
  await wait(80);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-stability-probe']")?.click();`);
  await wait(1800);
  await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return; const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='stability-start-date']", "2026-07-01"); set("[data-testid='stability-end-date']", "2026-07-07"); set("[data-testid='stability-request-window']", "7_days"); set("[data-testid='stability-round-count']", "3"); set("[data-testid='stability-merge-strategy']", "union"); })()`);
  await wait(100);
  await openAnalysisUiSmoke(window);
  const analysisWorkflowAudit = await window.webContents.executeJavaScript(`(() => {
    const cards = Array.from(document.querySelectorAll("[data-testid^='workflow-']"));
    const count = cards.length;
    const labels = cards.map((el) => el.textContent || "");
    const selectIssues = document.querySelector("[data-testid='workflow-selectIssues']");
    const related = document.querySelector("[data-testid='workflow-relatedIssues']");
    const body = document.body.innerText || "";
    return { count, labels, states: cards.map((el) => el.getAttribute("data-step-state")), colorBars: cards.every((el) => el.className.includes("border-l-4")), badges: cards.every((el) => (el.textContent || "").includes("Status:")), reasons: cards.every((el) => Boolean(el.querySelector("[data-step-reason]")?.textContent?.trim())), setup: Boolean(document.querySelector("[data-testid='analysis-setup-user']")), selectBlocked: selectIssues instanceof HTMLButtonElement && selectIssues.disabled, relatedBlocked: related instanceof HTMLButtonElement && related.disabled, advancedHidden: !document.querySelector("[data-testid='advanced-tools-toggle']") && !document.querySelector("#candidate-search") && !body.includes("Advanced Candidate Search") && !body.includes("Preview JQL"), hasPrecisionTab: Boolean(document.querySelector("[data-testid='workflow-precision']")), stepLabels: ["Setup & Build Timeline", "Select Issues", "Full Fetch", "Related Issues", "Export"].every((label) => labels.some((text) => text.includes(label))) };
  })()`);
  if (analysisWorkflowAudit.count !== 5 || !analysisWorkflowAudit.setup || !analysisWorkflowAudit.selectBlocked || !analysisWorkflowAudit.relatedBlocked || !analysisWorkflowAudit.advancedHidden || analysisWorkflowAudit.hasPrecisionTab || !analysisWorkflowAudit.stepLabels || !analysisWorkflowAudit.states.includes("current") || !analysisWorkflowAudit.states.includes("blocked") || !analysisWorkflowAudit.colorBars || !analysisWorkflowAudit.badges || !analysisWorkflowAudit.reasons) failures.push(`User Analysis workflow visual state audit failed: ${JSON.stringify(analysisWorkflowAudit)}`);
  const simplifiedTimelineSetupAudit = await window.webContents.executeJavaScript(`(() => { const status = document.querySelector("[data-testid='analysis-setup-status']")?.textContent || ""; return { requestWindow: document.querySelector("[data-testid='analysis-request-window']")?.value === "7_days", rounds: document.querySelector("[data-testid='analysis-full-scan-round-count']")?.value === "3", delay: Boolean(document.querySelector("[data-testid='analysis-round-delay']")), mode: document.querySelector("[data-testid='analysis-round-mode']")?.value === "force_all_rounds", merge: document.querySelector("[data-testid='analysis-merge-strategy']")?.value === "union", openProbe: Boolean(document.querySelector("[data-testid='open-stability-probe']")), duplicateRemoved: !document.querySelector("[data-testid='setup-build-activity-timeline']"), statusOnly: status.includes("Setup is ready. Build Activity Timeline"), lowerBuild: Boolean(document.querySelector("[data-testid='build-activity-timeline']")) }; })()`);
  if (!simplifiedTimelineSetupAudit.requestWindow || !simplifiedTimelineSetupAudit.rounds || !simplifiedTimelineSetupAudit.delay || !simplifiedTimelineSetupAudit.mode || !simplifiedTimelineSetupAudit.merge || !simplifiedTimelineSetupAudit.openProbe || !simplifiedTimelineSetupAudit.duplicateRemoved || !simplifiedTimelineSetupAudit.statusOnly || !simplifiedTimelineSetupAudit.lowerBuild) failures.push(`User Analysis Stability settings/duplicate build audit failed ${JSON.stringify(simplifiedTimelineSetupAudit)}`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-workflow-visual-state", { detail: { state: "failed" } }));`);
  await wait(100);
  const failedStepAudit = await window.webContents.executeJavaScript(`(() => { const card = document.querySelector("[data-testid='workflow-timeline']"); return { state: card?.getAttribute("data-step-state"), reason: card?.querySelector("[data-step-reason]")?.textContent || "", style: card?.className || "" }; })()`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-workflow-visual-state", { detail: { state: "warning" } }));`);
  await wait(100);
  const warningStepAudit = await window.webContents.executeJavaScript(`(() => { const card = document.querySelector("[data-testid='workflow-queue']"); return { state: card?.getAttribute("data-step-state"), reason: card?.querySelector("[data-step-reason]")?.textContent || "", style: card?.className || "" }; })()`);
  const fullFetchProgressStep3 = await window.webContents.executeJavaScript(`Boolean(document.querySelector("#full-fetch-progress"))`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-relatedIssues']")?.click();`);
  await wait(80);
  const fullFetchProgressStep4 = await window.webContents.executeJavaScript(`Boolean(document.querySelector("#full-fetch-progress"))`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-exports']")?.click();`);
  await wait(80);
  const fullFetchProgressStep5 = await window.webContents.executeJavaScript(`Boolean(document.querySelector("#full-fetch-progress"))`);
  if (failedStepAudit.state !== "failed" || !failedStepAudit.reason || !failedStepAudit.style.includes("bg-red-50") || warningStepAudit.state !== "warning" || !warningStepAudit.reason || !warningStepAudit.style.includes("bg-amber-50") || !fullFetchProgressStep3 || fullFetchProgressStep4 || fullFetchProgressStep5) failures.push(`User Analysis warning/failed/progress state audit failed: ${JSON.stringify({ failedStepAudit, warningStepAudit, fullFetchProgressStep3, fullFetchProgressStep4, fullFetchProgressStep5 })}`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-workflow-visual-state", { detail: { state: "reset" } }));`);
  await wait(100);
  await navigateUiSmoke(window, "#/precision-probe", "[data-testid='probe-mode-precision']");
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='probe-mode-precision']")?.click();`);
  await wait(120);
  const standardFlowUiAudit = await window.webContents.executeJavaScript(`(() => ({ panel: Boolean(document.querySelector("[data-testid='standard-activity-stream-flow']")), selected: document.querySelector("[data-testid='standard-activity-stream-flow']")?.textContent?.includes("roger_hsieh"), escaped: document.querySelector("[data-testid='standard-activity-stream-flow']")?.textContent?.includes("roger\\_hsieh"), date: document.querySelector("[data-testid='standard-activity-stream-flow']")?.textContent?.includes("update-date AFTER/BEFORE"), chunking: document.querySelector("[data-testid='standard-activity-stream-flow']")?.textContent?.includes("Auto"), limit: document.querySelector("[data-testid='standard-activity-stream-flow']")?.textContent?.includes("500"), advancedClosed: !document.querySelector("[data-testid='advanced-diagnostics']"), noMainUserInput: !document.querySelector("[data-testid='activity-stream-user']"), noMainQueryMode: !document.querySelector("[data-testid='activity-stream-query-mode']"), noMainDateMode: !document.querySelector("[data-testid='activity-stream-date-query-mode']"), noMainMax: !document.querySelector("[data-testid='probe-max-results']") }))()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-activity-stream']")?.click();`);
  await wait(700);
  const standardFlowRunAudit = await window.webContents.executeJavaScript(`(() => { const baseline = document.querySelector("[data-testid='activity-stream-baseline-guard']"); return { variants: document.querySelectorAll("[data-testid='activity-stream-variants'] tbody tr").length, escaped: document.body.innerText.includes("escaped_username"), encoded: (document.body.innerText || "").includes("roger%5C_hsieh"), classifier: Boolean(document.querySelector("[data-testid='activity-type-classifier-diagnostics']")), baseline: Boolean(baseline), baselineCounts: baseline?.textContent?.includes("Baseline Entries") && baseline?.textContent?.includes("Current Entries"), retryLimit: baseline?.textContent?.includes("Retry Attempts") }; })()`);
  const standardSelectionGuardAudit = await window.webContents.executeJavaScript(`(async () => {
    const input = document.querySelector("[data-testid='selected-users']");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    const setUsers = async (value) => { if (input instanceof HTMLTextAreaElement) { setter?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 80)); } };
    await setUsers("");
    document.querySelector("[data-testid='run-activity-stream']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const noUser = Boolean(document.querySelector("[data-testid='standard-flow-no-user']")) && document.body.innerText.includes("Please enter at least one selected user");
    await setUsers("roger_hsieh\\nch_kao");
    document.querySelector("[data-testid='run-activity-stream']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const multiUser = Boolean(document.querySelector("[data-testid='standard-flow-multi-user-warning']")) && document.body.innerText.includes("currently supports one selected user");
    await setUsers("roger_hsieh");
    return { noUser, multiUser };
  })()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='toggle-advanced-diagnostics']")?.click();`);
  await wait(100);
  const advancedFlowUiAudit = await window.webContents.executeJavaScript(`(() => ({ open: Boolean(document.querySelector("[data-testid='advanced-diagnostics']")), user: Boolean(document.querySelector("[data-testid='activity-stream-user']")), query: Boolean(document.querySelector("[data-testid='activity-stream-query-mode']")), date: Boolean(document.querySelector("[data-testid='activity-stream-date-query-mode']")), max: Boolean(document.querySelector("[data-testid='probe-max-results']")), manual: Boolean(document.querySelector("[data-testid='manual-activity-stream-url']")), cap: Boolean(document.querySelector("[data-testid='run-cap-test']")) }))()`);
  await window.webContents.executeJavaScript(`
    (() => {
      const mode = document.querySelector("[data-testid='activity-stream-query-mode']");
      if (mode instanceof HTMLSelectElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(mode, "username");
        mode.dispatchEvent(new Event("change", { bubbles: true }));
        setter?.call(mode, "auto");
        mode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const input = document.querySelector("[data-testid='activity-stream-user']");
      if (input instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "smoke_user@example.com");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()
  `);
  await wait(150);
  const maxValidationAudit = await window.webContents.executeJavaScript(`
    (async () => {
      const max = document.querySelector("[data-testid='probe-max-results']");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      const setMax = (value) => { if (max instanceof HTMLInputElement) { setter?.call(max, value); max.dispatchEvent(new Event("input", { bubbles: true })); max.dispatchEvent(new Event("change", { bubbles: true })); } };
      setMax("0"); document.querySelector("[data-testid='run-advanced-activity-stream']")?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const rejectsLow = document.body.innerText.includes("maxResults must be between 1 and 65535");
      setMax("65536"); document.querySelector("[data-testid='run-advanced-activity-stream']")?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const rejectsHigh = document.body.innerText.includes("maxResults must be between 1 and 65535");
      document.querySelector("[data-testid='max-quick-10']")?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { rejectsLow, rejectsHigh, quickValue: max instanceof HTMLInputElement ? max.value : "", quickCount: document.querySelectorAll("[data-testid^='max-quick-']").length, dateMode: document.querySelector("[data-testid='activity-stream-date-query-mode']")?.value };
    })()
  `);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-advanced-activity-stream']")?.click();`);
  await wait(10);
  const runningAudit = await window.webContents.executeJavaScript(`(() => ({ banner: Boolean(document.querySelector("[data-testid='activity-stream-running']")), runId: document.body.innerText.includes("asrun-"), autoDisabled: document.querySelector("[data-testid='run-advanced-activity-stream']")?.disabled === true, precisionDisabled: document.querySelector("[data-testid='run-advanced-precision-probe']")?.disabled === true, manualDisabled: document.querySelector("[data-testid='run-manual-activity-stream']")?.disabled === true }))()`);
  await wait(350);
  const activityStreamAudit = await window.webContents.executeJavaScript(`(() => ({ rows: document.querySelectorAll("[data-testid='activity-stream-results'] tbody tr").length, variantRows: document.querySelectorAll("[data-testid='activity-stream-variants'] tbody tr").length, mode: document.querySelector("[data-testid='activity-stream-query-mode']")?.value, hasEmailInput: Boolean(document.querySelector("[data-testid='activity-stream-user']")), overrideWarning: Boolean(document.querySelector("[data-testid='advanced-override-warning']")), issueKey: document.body.innerText.includes("SMOKE-101"), hasUsername: document.body.innerText.includes("username"), hasEscaped: document.body.innerText.includes("escaped_username"), hasEmail: document.body.innerText.includes("email"), relativeLinks: document.body.innerText.includes("relativeLinks=true"), diagnosis: document.body.innerText.includes("no_entries") && document.body.innerText.includes("parsed"), contentType: document.body.innerText.includes("application/atom+xml") }))()`);
  await window.webContents.executeJavaScript(`
    (() => {
      const max = document.querySelector("[data-testid='probe-max-results']");
      if (max instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(max, "20"); max.dispatchEvent(new Event("input", { bubbles: true })); max.dispatchEvent(new Event("change", { bubbles: true })); }
      const end = document.querySelector("[data-testid='filter-end']");
      if (end instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(end, "2026-07-14"); end.dispatchEvent(new Event("input", { bubbles: true })); }
    })()
  `);
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector("[data-testid='manual-activity-stream-url']");
      if (input instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(input, "/plugins/servlet/streams?maxResults=10&relativeLinks=true&streams=user+IS+roger%5C_hsieh&_=1784004289793");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()
  `);
  await wait(150);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-manual-activity-stream']")?.click();`);
  await wait(350);
  const manualReplayAudit = await window.webContents.executeJavaScript(`(async () => { const base = { accepted: document.body.innerText.includes("Manual URL validated"), manualVariant: document.body.innerText.includes("manual_url"), escapedVariant: document.body.innerText.includes("escaped_username"), issueKey: document.body.innerText.includes("COPGEN1-138930"), linkType: document.body.innerText.includes("link") }; document.querySelector("[data-testid='entry-detail-0']")?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); const authorEmail = document.body.innerText.includes("roger_hsieh@phison.com"); document.querySelector("[data-testid='entry-detail-0']")?.click(); return { ...base, authorEmail }; })()`);
  await window.webContents.executeJavaScript(`(() => { const max = document.querySelector("[data-testid='probe-max-results']"); if (max instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(max, "5000"); max.dispatchEvent(new Event("input", { bubbles: true })); max.dispatchEvent(new Event("change", { bubbles: true })); } document.querySelector("[data-testid='run-cap-test']")?.click(); })()`);
  await wait(150);
  const largeMaxModalAudit = await window.webContents.executeJavaScript(`(() => { const input = document.querySelector("[data-testid='large-max-confirm-input']"); if (input instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(input, "WRONG"); input.dispatchEvent(new Event("input", { bubbles: true })); } document.querySelector("[data-testid='confirm-large-max']")?.click(); return { modal: document.body.innerText.includes("Large Activity Stream Query Confirmation"), warning: Boolean(document.querySelector("[data-testid='large-max-warning']")) }; })()`);
  await wait(100);
  const largeMaxRejectAudit = await window.webContents.executeJavaScript(`(() => { const rejected = document.body.innerText.includes("Please type CONFIRM exactly"); const input = document.querySelector("[data-testid='large-max-confirm-input']"); if (input instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(input, "CONFIRM"); input.dispatchEvent(new Event("input", { bubbles: true })); } document.querySelector("[data-testid='confirm-large-max']")?.click(); return { rejected }; })()`);
  await wait(450);
  await window.webContents.executeJavaScript(`(() => { const max = document.querySelector("[data-testid='probe-max-results']"); if (max instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(max, "10001"); max.dispatchEvent(new Event("input", { bubbles: true })); max.dispatchEvent(new Event("change", { bubbles: true })); } document.querySelector("[data-testid='run-cap-test']")?.click(); })()`);
  await wait(150);
  const strongWarningAudit = await window.webContents.executeJavaScript(`(() => { const warning = document.querySelector("[data-testid='large-max-warning']")?.textContent || ""; const input = document.querySelector("[data-testid='large-max-confirm-input']"); if (input instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(input, "CONFIRM"); input.dispatchEvent(new Event("input", { bubbles: true })); } document.querySelector("[data-testid='confirm-large-max']")?.click(); return { strong: warning.includes("Strong warning") }; })()`);
  await wait(450);
  const capTestAudit = await window.webContents.executeJavaScript(`(() => ({ rows: document.querySelectorAll("[data-testid='cap-test-results'] tbody tr").length, likely: document.querySelector("[data-testid='max-results-diagnostics']")?.textContent?.includes("likely"), estimated: document.querySelector("[data-testid='max-results-diagnostics']")?.textContent?.includes("1") }))()`);
  await window.webContents.executeJavaScript(`(() => { const max = document.querySelector("[data-testid='probe-max-results']"); if (max instanceof HTMLInputElement) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; setter?.call(max, "50"); max.dispatchEvent(new Event("input", { bubbles: true })); max.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-advanced-precision-probe']")?.click();`);
  await wait(750);
  const precisionAudit = await window.webContents.executeJavaScript(`
    (() => ({
      panel: document.body.innerText.includes("User Activity Precision Probe"),
      rows: document.querySelectorAll("[data-testid='precision-results-table'] tbody tr").length,
      recommendation: document.querySelector("[data-testid='precision-recommendation']")?.textContent || "",
      hasUpdatedBy: document.body.innerText.includes("updatedBy Candidate JQL"),
      hasUnsupported: document.body.innerText.includes("unsupported"),
      preciseCount: document.body.innerText.includes("SMOKE-101") && document.body.innerText.includes("SMOKE-102"),
      dateRows: document.querySelectorAll("[data-testid='date-query-results'] tbody tr").length,
      bestDateMode: document.querySelector("[data-testid='date-semantics-result']")?.textContent?.includes("update_date_after_before"),
      effective: document.querySelector("[data-testid='date-query-results']")?.textContent?.includes("true") && document.querySelector("[data-testid='date-query-results']")?.textContent?.includes("false"),
      clientFilter: document.querySelector("[data-testid='apply-client-date-filter']")?.checked === true
    }))()
  `);
  const paginationAudit = await window.webContents.executeJavaScript(`
    (async () => {
      const firstPageRows = document.querySelectorAll("[data-testid='activity-stream-results'] tbody > tr").length;
      const pageSize = document.querySelector("[data-testid='parsed-page-size']");
      const optionCount = pageSize instanceof HTMLSelectElement ? pageSize.options.length : 0;
      document.querySelector("[data-testid='parsed-next-page']")?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const secondPageRows = document.querySelectorAll("[data-testid='activity-stream-results'] tbody > tr").length;
      const pageTwo = document.querySelector("[data-testid='parsed-entries-pagination']")?.textContent?.includes("Page 2 of 2");
      const detailButton = document.querySelector("[data-testid='entry-detail-0']");
      detailButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const detailVisible = Boolean(document.querySelector("[data-testid='entry-detail-panel']"));
      const copyVisible = Boolean(document.querySelector("[data-testid='copy-entry-0']"));
      detailButton?.click();
      if (pageSize instanceof HTMLSelectElement) { const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set; setter?.call(pageSize, "10"); pageSize.dispatchEvent(new Event("change", { bubbles: true })); }
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { firstPageRows, secondPageRows, pageTwo, detailVisible, copyVisible, optionCount, resetToPageOne: document.querySelector("[data-testid='parsed-entries-pagination']")?.textContent?.includes("Page 1 of 5"), tenRows: document.querySelectorAll("[data-testid='activity-stream-results'] tbody > tr").length };
    })()
  `);
  await window.webContents.executeJavaScript(`
    (() => {
      const setInput = (selector, value) => {
        const input = document.querySelector(selector);
        if (input instanceof HTMLInputElement) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      const setMulti = (selector, values) => {
        const select = document.querySelector(selector);
        if (select instanceof HTMLSelectElement) {
          Array.from(select.options).forEach((option) => { option.selected = values.includes(option.value); });
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      setInput("[data-testid='filter-issue-key']", "SMOKE-101");
      setInput("[data-testid='filter-author']", "Smoke User");
      setInput("[data-testid='filter-start']", "2026-07-01");
      setInput("[data-testid='filter-end']", "2026-07-14");
      setMulti("[data-testid='filter-activity-types']", ["link"]);
      setMulti("[data-testid='filter-variants']", ["escaped_username"]);
      setMulti("[data-testid='filter-sources']", ["activity_stream"]);
      const onlyKey = document.querySelector("[data-testid='filter-only-key']");
      if (onlyKey instanceof HTMLInputElement && !onlyKey.checked) onlyKey.click();
    })()
  `);
  await wait(250);
  const filterAudit = await window.webContents.executeJavaScript(`(() => ({ rows: document.querySelectorAll("[data-testid='activity-stream-results'] tbody tr").length, hasFilteredStats: document.body.innerText.includes("Filtered Entries / 篩選後項目：1"), issue: document.querySelector("[data-testid='filter-issue-key']")?.value, author: document.querySelector("[data-testid='filter-author']")?.value, onlyKey: document.querySelector("[data-testid='filter-only-key']")?.checked, activityTypes: Array.from(document.querySelector("[data-testid='filter-activity-types']")?.selectedOptions || []).map((item) => item.value), variants: Array.from(document.querySelector("[data-testid='filter-variants']")?.selectedOptions || []).map((item) => item.value), sources: Array.from(document.querySelector("[data-testid='filter-sources']")?.selectedOptions || []).map((item) => item.value) }))()`);
  const historyAudit = await window.webContents.executeJavaScript(`(() => ({ rows: document.querySelectorAll("[data-testid='activity-stream-run-history'] tbody tr").length, text: document.querySelector("[data-testid='activity-stream-run-history']")?.innerText || "" }))()`);
  if (shouldCaptureUi) {
    const precisionImage = await window.capturePage();
    fs.writeFileSync(path.join(captureDir, "1280x720-expanded-precision-probe-result.png"), precisionImage.toPNG());
  }
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='add-precision-queue']")?.click();`);
  await wait(200);
  const precisionQueueAudit = await window.webContents.executeJavaScript(`
    (() => ({
      noAutoFetch: document.body.innerText.includes("Full Fetch was not started") || document.body.innerText.includes("未自動執行完整抓取"),
      addEnabled: !(document.querySelector("[data-testid='add-precision-queue']") instanceof HTMLButtonElement) || !document.querySelector("[data-testid='add-precision-queue']").disabled
    }))()
  `);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='save-precision-probe']")?.click();`);
  await wait(350);
  const precisionExportFiles = fs.readdirSync(precisionExportDir).filter((name) => !precisionExportsBefore.has(name) && name.startsWith("user-activity-precision-probe-") && name.endsWith(".json"));
  const precisionExport = precisionExportFiles.length > 0 ? JSON.parse(fs.readFileSync(path.join(precisionExportDir, precisionExportFiles[0]), "utf8")) as Record<string, unknown> : null;
  const precisionSource = asRecord(precisionExport?.source);
  const precisionActionDiagnostics = asRecord(precisionExport?.actionLogDiagnostics);
  const precisionActivityStream = asRecord(precisionExport?.activityStream);
  const precisionParserDiagnostics = asRecord(precisionActivityStream.parserDiagnostics);
  const precisionFilter = asRecord(precisionExport?.parsedEntriesFilter);
  const precisionFilterStats = asRecord(precisionExport?.parsedEntriesFilterStats);
  const precisionDateSemantics = asRecord(precisionExport?.dateSemantics);
  const precisionRequestedDateRange = asRecord(precisionDateSemantics.requestedDateRange);
  const precisionMaxDiagnostics = asRecord(precisionExport?.maxResultsDiagnostics);
  const precisionStandardFlow = asRecord(precisionExport?.standardActivityStreamFlow);
  const precisionClassifierDiagnostics = asRecord(precisionExport?.activityTypeClassifierDiagnostics);
  const precisionFullFetchFilesAfter = fs.existsSync(getFullFetchLogsDir()) ? fs.readdirSync(getFullFetchLogsDir()) : [];
  const precisionActionLogBuffer = fs.existsSync(precisionActionLogPath) ? fs.readFileSync(precisionActionLogPath) : Buffer.alloc(0);
  const precisionActionTimeline = precisionActionLogBuffer.subarray(precisionActionLogStartSize).toString("utf8");
  const precisionUnexpectedFullFetchFiles = precisionFullFetchFilesAfter.filter((name) => !precisionFullFetchFilesBefore.has(name));
  if (!standardFlowUiAudit.panel || !standardFlowUiAudit.selected || !standardFlowUiAudit.escaped || !standardFlowUiAudit.date || !standardFlowUiAudit.chunking || !standardFlowUiAudit.limit || !standardFlowUiAudit.advancedClosed || !standardFlowUiAudit.noMainUserInput || !standardFlowUiAudit.noMainQueryMode || !standardFlowUiAudit.noMainDateMode || !standardFlowUiAudit.noMainMax) failures.push(`standard flow UI audit failed ${JSON.stringify(standardFlowUiAudit)}`);
  if (standardFlowRunAudit.variants !== 1 || !standardFlowRunAudit.escaped || !standardFlowRunAudit.encoded || !standardFlowRunAudit.classifier || !standardFlowRunAudit.baseline || !standardFlowRunAudit.baselineCounts || !standardFlowRunAudit.retryLimit) failures.push(`standard flow run audit failed ${JSON.stringify(standardFlowRunAudit)}`);
  if (!standardSelectionGuardAudit.noUser || !standardSelectionGuardAudit.multiUser) failures.push(`standard flow selected-user guard audit failed ${JSON.stringify(standardSelectionGuardAudit)}`);
  if (!advancedFlowUiAudit.open || !advancedFlowUiAudit.user || !advancedFlowUiAudit.query || !advancedFlowUiAudit.date || !advancedFlowUiAudit.max || !advancedFlowUiAudit.manual || !advancedFlowUiAudit.cap) failures.push(`advanced diagnostics UI audit failed ${JSON.stringify(advancedFlowUiAudit)}`);
  if (!maxValidationAudit.rejectsLow || !maxValidationAudit.rejectsHigh || maxValidationAudit.quickValue !== "10" || maxValidationAudit.quickCount !== 7 || maxValidationAudit.dateMode !== "both") failures.push(`maxResults validation/quick values audit failed ${JSON.stringify(maxValidationAudit)}`);
  if (!runningAudit.banner || !runningAudit.runId || !runningAudit.autoDisabled || !runningAudit.precisionDisabled || !runningAudit.manualDisabled) failures.push(`activity stream running lock audit failed ${JSON.stringify(runningAudit)}`);
  if (!activityStreamAudit.hasEmailInput || !activityStreamAudit.overrideWarning || activityStreamAudit.mode !== "auto" || !activityStreamAudit.issueKey || !activityStreamAudit.contentType || !activityStreamAudit.hasUsername || !activityStreamAudit.hasEscaped || !activityStreamAudit.hasEmail || !activityStreamAudit.relativeLinks || !activityStreamAudit.diagnosis || activityStreamAudit.rows !== 10 || activityStreamAudit.variantRows !== 3) failures.push(`activity stream UI audit failed ${JSON.stringify(activityStreamAudit)}`);
  if (!manualReplayAudit.accepted || !manualReplayAudit.manualVariant || !manualReplayAudit.escapedVariant || !manualReplayAudit.issueKey || !manualReplayAudit.authorEmail || !manualReplayAudit.linkType) failures.push(`manual replay UI audit failed ${JSON.stringify(manualReplayAudit)}`);
  if (!largeMaxModalAudit.modal || !largeMaxModalAudit.warning || !largeMaxRejectAudit.rejected || !strongWarningAudit.strong || capTestAudit.rows !== 2 || !capTestAudit.likely || !capTestAudit.estimated) failures.push(`large maxResults/cap test UI audit failed ${JSON.stringify({ largeMaxModalAudit, largeMaxRejectAudit, strongWarningAudit, capTestAudit })}`);
  if (paginationAudit.firstPageRows !== 40 || paginationAudit.secondPageRows !== 10 || !paginationAudit.pageTwo || !paginationAudit.detailVisible || !paginationAudit.copyVisible || paginationAudit.optionCount !== 5 || !paginationAudit.resetToPageOne || paginationAudit.tenRows !== 10) failures.push(`parsed entries pagination/detail audit failed ${JSON.stringify(paginationAudit)}`);
  if (!precisionAudit.panel || precisionAudit.rows !== 6 || !precisionAudit.recommendation.includes("activity_stream") || !precisionAudit.hasUpdatedBy || !precisionAudit.hasUnsupported || !precisionAudit.preciseCount || precisionAudit.dateRows !== 2 || !precisionAudit.bestDateMode || !precisionAudit.effective || !precisionAudit.clientFilter) failures.push(`precision probe UI audit failed ${JSON.stringify(precisionAudit)}`);
  if (filterAudit.rows !== 1 || !filterAudit.hasFilteredStats || filterAudit.issue !== "SMOKE-101" || filterAudit.author !== "Smoke User" || !filterAudit.onlyKey || !filterAudit.activityTypes.includes("link") || !filterAudit.variants.includes("escaped_username") || !filterAudit.sources.includes("activity_stream")) failures.push(`parsed entries filter UI audit failed ${JSON.stringify(filterAudit)}`);
  if (historyAudit.rows !== 5 || !historyAudit.text.includes("10") || !historyAudit.text.includes("20") || !historyAudit.text.includes("50") || !historyAudit.text.includes("5000") || !historyAudit.text.includes("10001") || !historyAudit.text.includes("manual") || !historyAudit.text.includes("precision")) failures.push(`activity stream run history audit failed ${JSON.stringify(historyAudit)}`);
  if (!precisionQueueAudit.noAutoFetch || !precisionQueueAudit.addEnabled) failures.push(`precision probe queue audit failed ${JSON.stringify(precisionQueueAudit)}`);
  if (precisionUnexpectedFullFetchFiles.length > 0) failures.push(`precision probe add-to-queue started Full Fetch ${JSON.stringify(precisionUnexpectedFullFetchFiles)}`);
  const precisionIssueKeySets = asRecord(precisionExport?.issueKeySets);
  const exportedVariants = Array.isArray(precisionActivityStream.variantResults) ? precisionActivityStream.variantResults.map(asRecord) : [];
  const precisionActivityStats = asRecord(precisionExport?.activityEntryStats);
  const precisionTableState = asRecord(precisionExport?.parsedEntriesTableState);
  if (!precisionExport || precisionExport.exportType !== "user-activity-precision-probe" || !Array.isArray(precisionExport.probeResults) || !precisionExport.summary || !precisionExport.requestContext || !precisionExport.debugLogNote || !precisionActionDiagnostics.actionLogPath || !String(precisionActivityStream.runId).startsWith("asrun-") || Number(precisionActivityStream.parsedActivityCount) !== 50 || !Array.isArray(precisionActivityStream.entriesSanitized) || exportedVariants.length !== 3 || exportedVariants.some((variant) => variant.runId !== precisionActivityStream.runId) || Number(precisionParserDiagnostics.parsedEntryCount) !== 50 || Number(precisionParserDiagnostics.skippedEntryCount) !== 0 || Number(precisionActivityStats.parsedActivityEntryCount) !== 50 || Number(precisionActivityStats.entriesWithIssueKeyCount) !== 1 || Number(precisionActivityStats.confluenceOnlyEntryCount) !== 49 || Number(precisionTableState.pageSize) !== 10 || Number(precisionTableState.currentPage) !== 1 || !Array.isArray(precisionIssueKeySets.recommendedIssueKeys) || !precisionIssueKeySets.recommendedIssueKeys.includes("SMOKE-101") || !Array.isArray(precisionExport.activityStreamRunHistory) || precisionExport.activityStreamRunHistory.length !== 5 || !Array.isArray(precisionExport.filteredEntriesSanitized) || precisionExport.filteredEntriesSanitized.length !== 1 || !Array.isArray(precisionExport.clientDateFilteredEntriesSanitized) || precisionExport.clientDateFilteredEntriesSanitized.length !== 50 || !Array.isArray(precisionExport.dateQueryResults) || precisionExport.dateQueryResults.length !== 2 || !Array.isArray(precisionExport.maxResultsCapTestResults) || precisionExport.maxResultsCapTestResults.length !== 2 || !Array.isArray(precisionExport.crossPageDebugBundleTodo) || precisionDateSemantics.bestDateQueryMode !== "update_date_after_before" || Number(precisionRequestedDateRange.startEpochMs) !== 1782835200000 || Number(precisionRequestedDateRange.endExclusiveEpochMs) !== 1783440000000 || Number(precisionMaxDiagnostics.requestedMaxResults) !== 50 || precisionFilter.issueKeyQuery !== "SMOKE-101" || Number(precisionFilterStats.filteredEntries) !== 1 || !precisionStandardFlow.variant || precisionExport.advancedDiagnosticsUsed !== true || precisionClassifierDiagnostics.enabled !== true || precisionClassifierDiagnostics.commentPriorityHigherThanAttachment !== true) failures.push(`precision probe export structure failed files=${JSON.stringify(precisionExportFiles)}`);
  const precisionEntries = Array.isArray(precisionActivityStream.entriesSanitized) ? precisionActivityStream.entriesSanitized.map(asRecord) : [];
  if (precisionEntries.some((entry) => !String(entry.entryFingerprint || "").startsWith("sha256:"))) failures.push("activity stream entry fingerprint export audit failed");
  if (precisionSource.token !== "[masked]" || precisionSource.authorization !== "[masked]" || precisionSource.readOnly !== true || precisionSource.databaseWrite !== false || precisionSource.attachmentDownload !== false) failures.push(`precision probe export safety flags/masking failed ${JSON.stringify(precisionSource)}`);
  const requiredPrecisionActions = ["Navigation clicked: User Activity Precision Probe", "Activity Stream Query Mode changed: value=auto", "Activity Stream User Override changed: value=user-", "Button clicked: Run Activity Stream Probe", "Manual Activity Stream URL changed", "Button clicked: Run Manual URL Replay", "Button clicked: Run Precision Probe", "Button clicked: Add Precise Candidates to Fetch Queue", "Button clicked: Save Precision Probe Result"];
  const missingPrecisionActions = requiredPrecisionActions.filter((entry) => !precisionActionTimeline.includes(entry));
  if (missingPrecisionActions.length > 0) failures.push(`precision probe action log missing ${JSON.stringify(missingPrecisionActions)}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='reset-entry-filters']")?.click();`);
  await wait(150);
  const resetFilterAudit = await window.webContents.executeJavaScript(`(() => ({ issue: document.querySelector("[data-testid='filter-issue-key']")?.value, author: document.querySelector("[data-testid='filter-author']")?.value, onlyKey: document.querySelector("[data-testid='filter-only-key']")?.checked, activityTypes: document.querySelector("[data-testid='filter-activity-types']")?.selectedOptions.length, variants: document.querySelector("[data-testid='filter-variants']")?.selectedOptions.length, sources: document.querySelector("[data-testid='filter-sources']")?.selectedOptions.length, rows: document.querySelectorAll("[data-testid='activity-stream-results'] tbody tr").length }))()`);
  if (resetFilterAudit.issue !== "" || resetFilterAudit.author !== "" || resetFilterAudit.onlyKey || resetFilterAudit.activityTypes !== 0 || resetFilterAudit.variants !== 0 || resetFilterAudit.sources !== 0 || resetFilterAudit.rows < 1) failures.push(`parsed entries filter reset audit failed ${JSON.stringify(resetFilterAudit)}`);
  await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) { const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); } }; set("[data-testid='activity-stream-start-date']", "2026-01-01"); set("[data-testid='activity-stream-end-date']", "2026-07-14"); set("[data-testid='activity-stream-date-query-mode']", "update_date_after_before"); set("[data-testid='activity-stream-chunking-mode']", "auto"); set("[data-testid='activity-stream-query-mode']", "auto"); })()`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-advanced-activity-stream']")?.click();`);
  await wait(1200);
  const chunkingUiAudit = await window.webContents.executeJavaScript(`(() => { const summary = document.querySelector("[data-testid='chunking-summary']")?.textContent || ""; const requests = Array.from(document.querySelectorAll("[data-testid='activity-stream-chunk-results'] tbody tr")).map((row) => row.textContent || ""); return { rows: requests.length, monthly: summary.includes("monthly"), seven: summary.includes("7"), merged: summary.includes("8"), duplicates: summary.includes("6"), urls: requests.every((text) => text.includes("update-date+AFTER") && text.includes("update-date+BEFORE")) }; })()`);
  if (chunkingUiAudit.rows !== 7 || !chunkingUiAudit.monthly || !chunkingUiAudit.seven || !chunkingUiAudit.merged || !chunkingUiAudit.duplicates || !chunkingUiAudit.urls) failures.push(`date range chunking UI/merge audit failed ${JSON.stringify(chunkingUiAudit)}`);
  await window.webContents.executeJavaScript(`(() => { const select = document.querySelector("[data-testid='activity-stream-query-mode']"); if (select instanceof HTMLSelectElement) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "custom"); select.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-advanced-activity-stream']")?.click();`);
  await wait(900);
  const trackingDefaultCollapsed = await window.webContents.executeJavaScript(`(() => ({ expanded: document.querySelector("[data-testid='toggle-result-tracking-details']")?.getAttribute("aria-expanded"), panel: Boolean(document.querySelector("[data-testid='auto-save-result-tracking']")) }))()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='toggle-result-tracking-details']")?.click();`);
  await wait(100);
  const noEntriesTrackingAudit = await window.webContents.executeJavaScript(`(() => { const panel = document.querySelector("[data-testid='auto-save-result-tracking']"); const cards = Array.from(panel?.children || []); const runIds = cards.map((card) => card.getAttribute("data-testid")?.replace("result-tracking-run-", "") || ""); return { banner: Boolean(document.querySelector("[data-testid='all-variants-no-entries']")), detailsOpen: Boolean(panel), text: panel?.textContent || "", cardCount: cards.length, uniqueRunIds: new Set(runIds).size }; })()`);
  if (trackingDefaultCollapsed.expanded !== "false" || trackingDefaultCollapsed.panel || !noEntriesTrackingAudit.banner || !noEntriesTrackingAudit.detailsOpen || !noEntriesTrackingAudit.text.includes("Latest No Entries Result") || !noEntriesTrackingAudit.text.includes("no_entries") || !noEntriesTrackingAudit.text.includes("parsed_confluence_only") || noEntriesTrackingAudit.cardCount !== noEntriesTrackingAudit.uniqueRunIds) failures.push(`no_entries/result tracking UI audit failed ${JSON.stringify({ trackingDefaultCollapsed, noEntriesTrackingAudit })}`);
  const autoSaveUiAudit = await window.webContents.executeJavaScript(`(() => { const text = document.querySelector("[data-testid='last-auto-saved-result']")?.textContent || ""; return { visible: Boolean(text), activity: text.includes("activity_stream_run"), path: text.includes("activity-stream-runs"), open: Boolean(document.querySelector("[data-testid='open-auto-save-folder']")), copy: Boolean(document.querySelector("[data-testid='copy-auto-save-path']")) }; })()`);
  await openAnalysisUiSmoke(window);
  await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement)) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='analysis-setup-user']", "roger_hsieh"); set("[data-testid='analysis-setup-start']", "2026-07-01"); set("[data-testid='analysis-setup-end']", "2026-07-07"); set("[data-testid='analysis-setup-project']", "COPGEN1"); })()`);
  await wait(150);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-timeline']")?.click();`);
  await wait(150);
  const timelineTabAudit = await window.webContents.executeJavaScript(`(() => ({ panel: Boolean(document.querySelector("[data-testid='activity-timeline-panel']")), button: Boolean(document.querySelector("[data-testid='build-activity-timeline']")) }))()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='build-activity-timeline']")?.click();`);
  await wait(2200);
  const timelineUiAudit = await window.webContents.executeJavaScript(`(() => { const table = document.querySelector("[data-testid='timeline-events-table']"); const text = document.body.innerText || ""; const rows = table?.querySelectorAll("tbody > tr").length || 0; const header = table?.querySelector("thead")?.textContent || ""; table?.querySelector("tbody button")?.click(); return { rows, issue: text.includes("SMOKE-101"), link: text.includes("link"), pureConfluenceExcluded: !text.includes("edited page Weekly Report"), requiredColumns: ["Time", "User", "Issue Key", "Activity Type", "Source Application"].every((label) => header.includes(label)), longColumnsHidden: !header.includes("Event ID") && !header.includes("Entry Fingerprint") && !header.includes("Raw Title"), columnSettings: Boolean(document.querySelector("[data-testid='timeline-column-settings-toggle']")), export: text.includes("user-activity-timeline-") && text.includes("timeline-build-summary-"), integrity: Boolean(document.querySelector("[data-testid='timeline-integrity-diagnostics']")), countWarning: Boolean(document.querySelector("[data-testid='timeline-integrity-count-warning']")), secondaryInfo: Boolean(document.querySelector("[data-testid='timeline-integrity-secondary-info']")) }; })()`);
  await wait(100);
  const timelineDetailAudit = await window.webContents.executeJavaScript(`(() => { const text = document.querySelector("[data-testid='timeline-events-table']")?.textContent || ""; return { eventId: text.includes("eventId:"), fingerprint: text.includes("entryFingerprint:"), baseline: text.includes("baseline:"), retry: text.includes("retry:") }; })()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='timeline-column-settings-toggle']")?.click();`);
  await wait(80);
  const timelineColumnAudit = await window.webContents.executeJavaScript(`(() => { const panel = document.querySelector("[data-testid='timeline-column-settings']"); const inputs = Array.from(panel?.querySelectorAll("input[type='checkbox']") || []); const sourceDetail = Array.from(panel?.querySelectorAll("label") || []).find((label) => label.textContent?.includes("Source Detail"))?.querySelector("input"); sourceDetail?.click(); return { requiredDisabled: inputs.filter((input) => input instanceof HTMLInputElement && input.disabled && input.checked).length, optionalCount: inputs.filter((input) => input instanceof HTMLInputElement && !input.disabled).length }; })()`);
  await wait(80);
  const optionalTimelineColumnVisible = await window.webContents.executeJavaScript(`(document.querySelector("[data-testid='timeline-events-table'] thead")?.textContent || "").includes("Source Detail")`);
  const timelineFilterAudit = await window.webContents.executeJavaScript(`(() => { const clickLabel = (id, text) => Array.from(document.querySelectorAll("[data-testid='" + id + "'] label")).find((label) => label.textContent?.trim() === text)?.querySelector("input")?.click(); const source = Array.from(document.querySelectorAll("[data-testid='timeline-filter-source-applications'] input")).map((input) => input instanceof HTMLInputElement && input.checked); const relation = Array.from(document.querySelectorAll("[data-testid='timeline-filter-jira-relations'] input")).map((input) => input instanceof HTMLInputElement && input.checked); clickLabel("timeline-filter-project-keys", "SMOKE"); clickLabel("timeline-filter-issue-keys", "SMOKE-101"); clickLabel("timeline-filter-activity-types", "link"); return { groups: ["timeline-filter-activity-types", "timeline-filter-source-applications", "timeline-filter-jira-relations", "timeline-filter-confidences", "timeline-filter-issue-keys", "timeline-filter-project-keys", "timeline-filter-users"].every((id) => Boolean(document.querySelector("[data-testid='" + id + "']"))), source, relation, summary: Boolean(document.querySelector("[data-testid='timeline-event-filter-summary']")), clear: Boolean(document.querySelector("[data-testid='clear-all-timeline-filters']")), reset: Boolean(document.querySelector("[data-testid='reset-timeline-filters']")) }; })()`);
  await wait(100);
  const timelineFilteredRows = await window.webContents.executeJavaScript(`document.querySelectorAll("[data-testid='timeline-events-table'] tbody > tr").length`);
  const timelineExportAudit = latestUserActivityTimeline ? {
    json: fs.existsSync(latestUserActivityTimeline.exportedFiles.jsonPath),
    csv: fs.existsSync(latestUserActivityTimeline.exportedFiles.csvPath),
    summary: fs.existsSync(latestUserActivityTimeline.exportedFiles.summaryPath),
    bom: fs.readFileSync(latestUserActivityTimeline.exportedFiles.csvPath).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    eventIds: latestUserActivityTimeline.events.every((event) => /^sha256:[0-9a-f]{64}$/.test(event.eventId) && !event.eventId.startsWith("sha256:sha256:") && event.rawRef.entryFingerprint && event.evidence.baselineGuard.classification && event.sourceSystem && event.sourceDetail),
    sourceCounts: Object.values(latestUserActivityTimeline.summary.sourceSystemCounts).reduce((sum, value) => sum + value, 0) === latestUserActivityTimeline.events.length,
    secondary: latestUserActivityTimeline.events.some((event) => event.issueKey === "COPGEN1-125695" && event.allIssueKeys.includes("COPGEN1-125806")) && latestUserActivityTimeline.summary.integrity.timelineAllIssueKeys.includes("COPGEN1-125806") && !latestUserActivityTimeline.summary.integrity.missingIssueKeysFromTimeline.includes("COPGEN1-125806") && latestUserActivityTimeline.summary.integrity.missingIssueKeysFromPrimaryTimeline.includes("COPGEN1-125806"),
    reconciliation: latestUserActivityTimeline.summary.eventCountReconciliation.status === "reconciled" && latestUserActivityTimeline.summary.integrity.skippedEntryCount >= 1 && latestUserActivityTimeline.summary.eventCountReconciliation.unexplainedDifferenceCount === 0,
    sensitive: /Authorization\s*:\s*(?!\[masked\])|Bearer\s+(?!\[masked\])|Basic\s+(?!\[masked\])|JSESSIONID|apiToken|password/i.test(fs.readFileSync(latestUserActivityTimeline.exportedFiles.jsonPath, "utf8"))
  } : null;
  if (!timelineTabAudit.panel || !timelineTabAudit.button || timelineUiAudit.rows < 1 || !timelineUiAudit.issue || !timelineUiAudit.link || !timelineUiAudit.pureConfluenceExcluded || !timelineUiAudit.requiredColumns || !timelineUiAudit.longColumnsHidden || !timelineUiAudit.columnSettings || !timelineUiAudit.export || !timelineUiAudit.integrity || !timelineUiAudit.countWarning || !timelineUiAudit.secondaryInfo || !timelineDetailAudit.eventId || !timelineDetailAudit.fingerprint || !timelineDetailAudit.baseline || !timelineDetailAudit.retry || timelineColumnAudit.requiredDisabled !== 5 || timelineColumnAudit.optionalCount !== 12 || !optionalTimelineColumnVisible || !timelineFilterAudit.groups || JSON.stringify(timelineFilterAudit.source) !== JSON.stringify([true, true,false, false]) || JSON.stringify(timelineFilterAudit.relation) !== JSON.stringify([true, false, false, false]) || !timelineFilterAudit.summary || !timelineFilterAudit.clear || !timelineFilterAudit.reset || timelineFilteredRows < 1 || timelineFilteredRows > 2 || !timelineExportAudit?.json || !timelineExportAudit.csv || !timelineExportAudit.summary || !timelineExportAudit.bom || !timelineExportAudit.eventIds || !timelineExportAudit.sourceCounts || !timelineExportAudit.secondary || !timelineExportAudit.reconciliation || timelineExportAudit.sensitive) failures.push(`activity timeline UI/export audit failed ${JSON.stringify({ timelineTabAudit, timelineUiAudit, timelineDetailAudit, timelineColumnAudit, optionalTimelineColumnVisible, timelineFilterAudit, timelineFilteredRows, timelineExportAudit })}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-selectIssues']")?.click();`);
  await wait(100);
  const timelineIssueFilterAudit = await window.webContents.executeJavaScript(`(async () => {
    const groups = ["filter-jira-relation", "filter-activity-type", "filter-confidence", "filter-role", "filter-source-application", "filter-project-key", "filter-selected-state"];
    const relationChecks = Array.from(document.querySelectorAll("[data-testid='filter-jira-relation'] input[type='checkbox']"));
    const sourceChecks = Array.from(document.querySelectorAll("[data-testid='filter-source-application'] input[type='checkbox']"));
    const relationInitial = relationChecks.map((input) => input instanceof HTMLInputElement && input.checked);
    const initial = sourceChecks.map((input) => input instanceof HTMLInputElement && input.checked);
    const activityChecks = Array.from(document.querySelectorAll("[data-testid='filter-activity-type'] input[type='checkbox']")).slice(0, 2);
    const confidenceChecks = Array.from(document.querySelectorAll("[data-testid='filter-confidence'] input[type='checkbox']")).slice(0, 2);
    activityChecks.forEach((input) => input instanceof HTMLInputElement && input.click());
    confidenceChecks.forEach((input) => input instanceof HTMLInputElement && input.click());
    await new Promise((resolve) => setTimeout(resolve, 100));
    const summaryAfterMulti = document.querySelector("[data-testid='timeline-issue-filter-summary']")?.textContent || "";
    document.querySelector("[data-testid='filter-activity-type'] button")?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const activityCleared = Array.from(document.querySelectorAll("[data-testid='filter-activity-type'] input[type='checkbox']")).every((input) => input instanceof HTMLInputElement && !input.checked);
    document.querySelector("[data-testid='clear-all-issue-filters']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const allCleared = groups.every((id) => Array.from(document.querySelectorAll("[data-testid='" + id + "'] input[type='checkbox']")).every((input) => input instanceof HTMLInputElement && !input.checked));
    document.querySelector("[data-testid='select-all-visible']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    document.querySelector("[data-testid='reset-issue-filters']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const resetRelation = Array.from(document.querySelectorAll("[data-testid='filter-jira-relation'] input[type='checkbox']")).map((input) => input instanceof HTMLInputElement && input.checked);
    const resetSource = Array.from(document.querySelectorAll("[data-testid='filter-source-application'] input[type='checkbox']")).map((input) => input instanceof HTMLInputElement && input.checked);
    document.querySelector("[data-testid='select-all-visible']")?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const rows = document.querySelectorAll("[data-testid='timeline-issue-groups-table'] tbody tr").length;
    const selected = Array.from(document.querySelectorAll("[data-testid='timeline-issue-groups-table'] tbody input[type='checkbox']")).filter((input) => input instanceof HTMLInputElement && input.checked).length;
    const tableHeader = document.querySelector("[data-testid='timeline-issue-groups-table'] thead")?.textContent || "";
    return { groups: groups.every((id) => Boolean(document.querySelector("[data-testid='" + id + "']"))), relationInitial, initial, defaultNote: Boolean(document.querySelector("[data-testid='jira-default-filter-note']")), requiredColumns: ["Selected", "Issue Key", "Source Applications", "Event Count", "First Seen", "Last Seen"].every((label) => tableHeader.includes(label)), longColumnsHidden: !tableHeader.includes("Timeline Event IDs") && !tableHeader.includes("Matched Reasons"), columnSettings: Boolean(document.querySelector("[data-testid='issue-group-column-settings-toggle']")), summaryAfterMulti, sameCategoryOr: summaryAfterMulti.includes(" OR "), categoriesAnd: summaryAfterMulti.includes(" AND "), activityCleared, allCleared, resetRelation, resetSource, rows, selected };
  })()`);
  if (!timelineIssueFilterAudit.groups || JSON.stringify(timelineIssueFilterAudit.relationInitial) !== JSON.stringify([true, false, false, false]) || JSON.stringify(timelineIssueFilterAudit.initial) !== JSON.stringify([true, true, false, false]) || !timelineIssueFilterAudit.defaultNote || !timelineIssueFilterAudit.requiredColumns || !timelineIssueFilterAudit.longColumnsHidden || !timelineIssueFilterAudit.columnSettings || !timelineIssueFilterAudit.sameCategoryOr || !timelineIssueFilterAudit.categoriesAnd || !timelineIssueFilterAudit.activityCleared || !timelineIssueFilterAudit.allCleared || JSON.stringify(timelineIssueFilterAudit.resetRelation) !== JSON.stringify([true, false, false, false]) || JSON.stringify(timelineIssueFilterAudit.resetSource) !== JSON.stringify([true, true, false, false]) || timelineIssueFilterAudit.rows < 1 || timelineIssueFilterAudit.selected !== timelineIssueFilterAudit.rows) failures.push(`timeline issue multi-select filter audit failed ${JSON.stringify(timelineIssueFilterAudit)}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='issue-group-column-settings-toggle']")?.click();`);
  await wait(80);
  const issueGroupColumnAudit = await window.webContents.executeJavaScript(`(() => { const panel = document.querySelector("[data-testid='issue-group-column-settings']"); const inputs = Array.from(panel?.querySelectorAll("input[type='checkbox']") || []); const activityTypes = Array.from(panel?.querySelectorAll("label") || []).find((label) => label.textContent?.includes("Activity Types"))?.querySelector("input"); activityTypes?.click(); return { requiredDisabled: inputs.filter((input) => input instanceof HTMLInputElement && input.disabled && input.checked).length, optionalCount: inputs.filter((input) => input instanceof HTMLInputElement && !input.disabled).length }; })()`);
  await wait(80);
  const issueGroupDetailAudit = await window.webContents.executeJavaScript(`(() => { const table = document.querySelector("[data-testid='timeline-issue-groups-table']"); const optionalVisible = (table?.querySelector("thead")?.textContent || "").includes("Activity Types"); table?.querySelector("tbody button")?.click(); return { optionalVisible }; })()`);
  await wait(80);
  const issueGroupDetailVisible = await window.webContents.executeJavaScript(`(() => { const text = document.querySelector("[data-testid='timeline-issue-groups-table']")?.textContent || ""; return text.includes("Timeline Event IDs:") && text.includes("Matched Reasons:") && text.includes("Confidence Summary:"); })()`);
  if (issueGroupColumnAudit.requiredDisabled !== 6 || issueGroupColumnAudit.optionalCount !== 10 || !issueGroupDetailAudit.optionalVisible || !issueGroupDetailVisible) failures.push(`timeline issue column/detail audit failed ${JSON.stringify({ issueGroupColumnAudit, issueGroupDetailAudit, issueGroupDetailVisible })}`);
  const timelineQueueUiAudit = await window.webContents.executeJavaScript(`(async () => {
    const checkbox = document.querySelector("[data-testid='timeline-issue-groups-table'] tbody input[type='checkbox']");
    const add = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Add Selected Issues, then go to Step 3"));
    add?.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const body = document.body.innerText || "";
    return { checkbox: Boolean(checkbox), add: Boolean(add), queue: body.includes("activity_timeline") && body.includes("selected_from_activity_timeline") };
  })()`);
  if (!timelineQueueUiAudit.checkbox || !timelineQueueUiAudit.add || !timelineQueueUiAudit.queue) failures.push(`timeline issue selection/queue UI audit failed ${JSON.stringify(timelineQueueUiAudit)}`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-queue-transition-regression"));`);
  await wait(120);
  const queueTransition51Audit = await window.webContents.executeJavaScript(`(async () => {
    const add = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Add Selected Issues, then go to Step 3"));
    add?.click();
    await new Promise((resolve) => setTimeout(resolve, 180));
    const rows = document.querySelectorAll("[data-testid='fetch-queue-table'] tbody tr");
    const body = document.body.innerText || "";
    return {
      add: Boolean(add),
      rowCount: rows.length,
      step: document.querySelector("[data-workflow-active-step]")?.getAttribute("data-workflow-active-step"),
      sidebar: Boolean(document.querySelector("aside")),
      debugLog: body.includes("Debug Log"),
      noErrorBoundary: !document.querySelector("[data-testid='app-error-boundary']"),
      noRemovedUi: !body.includes("Issue Preview") && !body.includes("Direct Jira Evidence")
    };
  })()`);
  if (!queueTransition51Audit.add || queueTransition51Audit.rowCount !== 51 || queueTransition51Audit.step !== "3" || !queueTransition51Audit.sidebar || !queueTransition51Audit.debugLog || !queueTransition51Audit.noErrorBoundary || !queueTransition51Audit.noRemovedUi) {
    failures.push(`51-item Step 2 to Step 3 renderer regression failed ${JSON.stringify(queueTransition51Audit)}`);
  }
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-related-scope"));`);
  await wait(120);
  const relatedScopeUiAudit = await window.webContents.executeJavaScript(`(() => { const body = document.body.innerText || ""; return { recommended: Boolean(document.querySelector("[data-testid='recommended-related-issues']")), optional: Boolean(document.querySelector("[data-testid='optional-related-issues']")), addRecommended: Boolean(document.querySelector("[data-testid='add-recommended-related']")), addOptional: Boolean(document.querySelector("[data-testid='add-optional-related']")), noOptionalAddAll: !body.includes("Add All Optional") }; })()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='add-recommended-related']")?.click();`);
  await wait(120);
  const recommendedQueueAudit = await window.webContents.executeJavaScript(`(() => { const text = document.body.innerText || ""; return { source: text.includes("recommended_related_issue"), summary: Boolean(document.querySelector("[data-testid='queue-add-summary']")) && text.includes("Run Related Issues in Step 3: Full Fetch") }; })()`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-related-scope"));`);
  await wait(120);
  await window.webContents.executeJavaScript(`(async () => { document.querySelector("[data-testid='optional-related-issues'] input[type='checkbox']")?.click(); await new Promise((resolve) => setTimeout(resolve, 80)); document.querySelector("[data-testid='add-optional-related']")?.click(); })()`);
  await wait(120);
  const optionalQueueAudit = await window.webContents.executeJavaScript(`(document.body.innerText || "").includes("optional_related_issue")`);
  if (!relatedScopeUiAudit.recommended || !relatedScopeUiAudit.optional || !relatedScopeUiAudit.addRecommended || !relatedScopeUiAudit.addOptional || !relatedScopeUiAudit.noOptionalAddAll || !recommendedQueueAudit.source || !recommendedQueueAudit.summary || !optionalQueueAudit) failures.push(`related scope guided UI audit failed ${JSON.stringify({ relatedScopeUiAudit, recommendedQueueAudit, optionalQueueAudit })}`);
  await window.webContents.executeJavaScript(`window.desktopApp?.userAnalysis?.updateWorkflowSnapshot?.({ steps: { activityTimeline: "completed", timelineIssueSelection: "completed", fetchQueue: "ready", fullFetch: "completed", relatedIssues: "completed", exports: "not_run" }, timelineIssueGroups: [{ issueKey: "COPGEN1-125806", source: "activity_timeline", issueKeyRole: "secondary", sourceSystemSummary: { jira: 1, confluence: 0, other: 0, unknown: 0 }, sourceDetails: { jira_activity_stream: 1 } }], timelineSelectedIssues: ["COPGEN1-125806"], fetchQueue: [{ key: "COPGEN1-125806", queueMetadata: { sources: ["activity_timeline"] } }], relatedCandidateIssues: [{ issueKey: "COPGEN1-69506", relationType: "parent_link", scope: "recommended", discoveredFromIssueKey: "COPGEN1-126606", source: "related_issue_expansion", field: "parent", reason: "parent_link discovered from COPGEN1-126606", confidence: "high", firstSeen: "2026-07-02T06:00:00.000Z", lastSeen: "2026-07-02T06:00:00.000Z", evidenceCount: 1, selected: false }], addedTimelineIssuesToFetchQueueCount: 1, addedRelatedIssuesToFetchQueueCount: 1, addedRecommendedRelatedIssuesToFetchQueueCount: 1, addedOptionalRelatedIssuesToFetchQueueCount: 0, uiState: { workflowStepCount: 5, advancedToolsVisible: false, fullFetchProgressLocation: "step3_full_fetch", timeline: { visibleColumns: ["time", "user", "issueKey", "activityType", "sourceApplication", "sourceDetail"], requiredColumns: ["time", "user", "issueKey", "activityType", "sourceApplication"], optionalColumns: ["title", "allIssueKeys", "sourceDetail", "jiraRelation", "confidence", "eventId", "entryFingerprint", "relatedSystems", "jiraRelationReason", "rawTitle", "sourceVariant", "baselineStatus"], filters: { activityTypes: ["link"], sourceApplications: ["jira", "confluence"], jiraRelations: ["jira_related"], issueKeys: ["SMOKE-101"], projectKeys: ["SMOKE"] }, filteredCount: 1, totalCount: 4 }, selectIssues: { visibleColumns: ["selected", "issueKey", "sourceApplications", "eventCount", "firstSeen", "lastSeen"], requiredColumns: ["selected", "issueKey", "sourceApplications", "eventCount", "firstSeen", "lastSeen"], optionalColumns: ["activityTypes", "confidence", "issueKeyRole", "projectKey", "jiraRelation", "relatedSystems", "sourceDetails", "timelineEventIds", "allIssueKeys", "matchedReasons"], filters: { jiraRelations: ["jira_related"], sourceApplications: ["jira", "confluence"] }, filteredCount: 1, totalCount: 2 } }, sessionEvent: "related_issues_expanded" });`);
  await wait(120);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-missing-analysis-input"));`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-timeline']")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`window.desktopApp?.userAnalysis?.updateWorkflowSnapshot?.({ steps: { activityTimeline: "completed", timelineIssueSelection: "completed", fetchQueue: "ready", fullFetch: "completed", relatedIssues: "completed", exports: "not_run" }, timelineIssueGroups: [{ issueKey: "COPGEN1-125806", source: "activity_timeline", issueKeyRole: "secondary", isJiraRelated: true, hasJiraIssueKey: true, sourceSystemSummary: { jira: 1, confluence: 0, other: 0, unknown: 0 }, sourceDetails: { jira_activity_stream: 1 }, jiraRelationSummary: { jiraRelatedEventCount: 1, nonJiraRelatedEventCount: 0, hasJiraIssueKeyCount: 1, sourceApplicationCounts: { jira: 1, confluence: 0, other: 0, unknown: 0 }, relatedSystemsCounts: { jira: 1 }, jiraRelationReasons: { has_jira_issue_key: 1 } } }], timelineSelectedIssues: ["COPGEN1-125806"], fetchQueue: [{ key: "COPGEN1-125806", queueMetadata: { sources: ["activity_timeline"] } }], relatedCandidateIssues: [{ issueKey: "COPGEN1-69506", relationType: "parent_link", scope: "recommended", discoveredFromIssueKey: "COPGEN1-126606", source: "related_issue_expansion", field: "parent", reason: "parent_link discovered from COPGEN1-126606", confidence: "high", firstSeen: "2026-07-02T06:00:00.000Z", lastSeen: "2026-07-02T06:00:00.000Z", evidenceCount: 1, selected: false }], addedTimelineIssuesToFetchQueueCount: 1, addedRelatedIssuesToFetchQueueCount: 1, addedRecommendedRelatedIssuesToFetchQueueCount: 1, addedOptionalRelatedIssuesToFetchQueueCount: 0, uiState: { workflowStepCount: 5, advancedToolsVisible: false, fullFetchProgressLocation: "step3_full_fetch", timeline: { visibleColumns: ["time", "user", "issueKey", "activityType", "sourceApplication"], requiredColumns: ["time", "user", "issueKey", "activityType", "sourceApplication"], optionalColumns: [], filters: { sourceApplications: ["jira", "confluence"], jiraRelations: ["jira_related"] }, filteredCount: 1, totalCount: 4 }, selectIssues: { visibleColumns: ["selected", "issueKey", "sourceApplications", "eventCount", "firstSeen", "lastSeen"], requiredColumns: ["selected", "issueKey", "sourceApplications", "eventCount", "firstSeen", "lastSeen"], optionalColumns: [], filters: { jiraRelations: ["jira_related"], sourceApplications: ["jira", "confluence"] }, filteredCount: 1, totalCount: 2 } } });`);
  const timelineInputGuardAudit = await window.webContents.executeJavaScript(`(() => { const button = document.querySelector("[data-testid='build-activity-timeline']"); return Boolean(document.querySelector("[data-testid='analysis-setup-blocked']")) && button instanceof HTMLButtonElement && button.disabled; })()`);
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector("[data-testid='analysis-setup-user']"); if (input instanceof HTMLInputElement) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "roger_hsieh"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  if (!timelineInputGuardAudit) failures.push("activity timeline missing selected user/date guard audit failed");
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-full-fetch-failure"));`);
  await wait(120);
  const fullFetchConciseAudit = await window.webContents.executeJavaScript(`(() => { const summary = document.querySelector("[data-testid='full-fetch-concise-summary']"); const text = summary?.textContent || ""; return { summary: Boolean(summary), failedCount: text.includes("Failed") && text.includes("1"), noPerIssueSnapshots: !document.querySelector("[data-testid='current-issue-snapshots']"), noFailedIssueTable: !document.querySelector("[data-testid='full-fetch-failed-issues']") }; })()`);
  if (!fullFetchConciseAudit.summary || !fullFetchConciseAudit.failedCount || !fullFetchConciseAudit.noPerIssueSnapshots || !fullFetchConciseAudit.noFailedIssueTable) failures.push(`Full Fetch concise result UI audit failed ${JSON.stringify(fullFetchConciseAudit)}`);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-jira-evidence"));`);
  await wait(150);
  const evidenceUiAudit = await window.webContents.executeJavaScript(`(() => { const summary = document.querySelector("[data-testid='full-fetch-evidence-counts']"); const text = summary?.textContent || ""; return { summary: Boolean(summary), counts: text.includes("Direct Evidence") && text.includes("Context Evidence"), noBrowser: !document.querySelector("[data-testid='jira-evidence-review']"), noTable: !document.querySelector("[data-testid='jira-evidence-table']"), noFilters: document.querySelectorAll("[data-testid^='evidence-filter-']").length === 0 }; })()`);
  if (!evidenceUiAudit.summary || !evidenceUiAudit.counts || !evidenceUiAudit.noBrowser || !evidenceUiAudit.noTable || !evidenceUiAudit.noFilters) failures.push(`Jira evidence concise summary audit failed ${JSON.stringify(evidenceUiAudit)}`);
  const missingSmokeRun: AutoSavedRun = { runId: "smoke-missing-auto-save", resultType: "activity_stream_run", status: "completed", savedAt: new Date().toISOString(), filePath: path.join(getExportsDir(), "user-analysis", "activity-stream-runs", "smoke-missing-auto-save.json"), folderPath: path.join(getExportsDir(), "user-analysis", "activity-stream-runs"), data: { runId: "smoke-missing-auto-save", diagnosis: "no_entries" } };
  autoSavedRunHistory.unshift(missingSmokeRun);
  const failedIssueFixture: FullFetchFailedIssue = { issueKey: "SMOKE-404", errorCode: "HTTP_404", httpStatus: 404, message: "Issue not found", stage: "issue_full_fetch", retryCount: 2, source: "recommended_related_issue", matchedReason: "parent_link", occurredAt: "2026-07-02T06:00:00.000Z" };
  latestFullFetchFailedIssues = [failedIssueFixture];
  const failedIssueSummaryFixture = fullFetchFailureSummary(latestFullFetchFailedIssues);
  const emptyFailedIssueSummaryFixture = fullFetchFailureSummary([]);
  if (failedIssueSummaryFixture.failedCount !== 1 || failedIssueSummaryFixture.byHttpStatus["404"] !== 1 || failedIssueSummaryFixture.byErrorCode.HTTP_404 !== 1 || failedIssueSummaryFixture.byStage.issue_full_fetch !== 1 || failedIssueSummaryFixture.bySource.recommended_related_issue !== 1 || emptyFailedIssueSummaryFixture.failedCount !== 0) failures.push(`full fetch failure summary fixtures failed ${JSON.stringify({ failedIssueSummaryFixture, emptyFailedIssueSummaryFixture })}`);
  const smokeStaging = createStagingRun(ensureDir(getFullFetchStagingDir()), { runId: `ui-smoke-${Date.now()}`, selectedUser: "roger_hsieh", queue: [{ key: "SMOKE-101" }, { key: "SMOKE-102" }, { key: "SMOKE-503" }] });
  startTarget(smokeStaging, "SMOKE-101");
  completeTarget(smokeStaging, "SMOKE-101", { status: "eligible", rawEnvelope: {
    issue: { id: "101", key: "SMOKE-101", fields: { summary: "Source archive smoke fixture", updated: "2026-07-21T01:00:00.000Z" }, names: {}, schema: {}, renderedFields: {} },
    changelogHistories: [], comments: [], attachments: [], parsedUsers: [], evidenceEvents: [], issueLinks: [], remoteLinks: [],
    endpointMetadata: [
      { method: "GET", endpoint: "/issue/SMOKE-101", status: 200, attempts: 1, fetchedAt: "2026-07-21T01:00:00.000Z" },
      { method: "GET", endpoint: "/issue/SMOKE-101/changelog", status: 200, attempts: 1, fetchedAt: "2026-07-21T01:00:00.000Z" },
      { method: "GET", endpoint: "/issue/SMOKE-101/comment", status: 200, attempts: 1, fetchedAt: "2026-07-21T01:00:00.000Z" }
    ],
    requestMetadata: { apiVersion: "v2", fetchedAt: "2026-07-21T01:00:00.000Z", fetchRemoteLinks: false },
    paginationMetadata: { changelog: { reportedTotal: 0, fetchedCount: 0, pageCount: 1, paginationComplete: true, duplicateCount: 0 }, comments: { reportedTotal: 0, fetchedCount: 0, pageCount: 1, paginationComplete: true, duplicateCount: 0 } },
    completenessMetadata: { requiredMissingSections: [] }
  }, classification: "complete" });
  startTarget(smokeStaging, "SMOKE-102");
  completeTarget(smokeStaging, "SMOKE-102", { status: "partial", rawEnvelope: { issue: { id: "102", key: "SMOKE-102", fields: { summary: "Partial smoke fixture", updated: "2026-07-21T01:00:00.000Z" }, names: {}, schema: {}, renderedFields: {} }, changelogHistories: [], comments: [], attachments: [], parsedUsers: [], evidenceEvents: [], issueLinks: [], remoteLinks: [], requestMetadata: { apiVersion: "v2", fetchedAt: "2026-07-21T01:00:00.000Z", fetchRemoteLinks: false }, paginationMetadata: { changelog: { reportedTotal: 0, fetchedCount: 0, pageCount: 1, paginationComplete: true, duplicateCount: 0 }, comments: { reportedTotal: 1, fetchedCount: 0, pageCount: 1, paginationComplete: false, duplicateCount: 0, errorCode: "PAGINATION_INCOMPLETE" } } }, missingSections: ["comments"], failedEndpoints: ["/comment"], classification: "partial_response" });
  startTarget(smokeStaging, "SMOKE-503");
  completeTarget(smokeStaging, "SMOKE-503", { status: "failed", classification: "http_503", errorType: "http_503", errorMessage: "temporary smoke failure" });
  finalizeStagingRun(smokeStaging);
  latestFullFetchStaging = smokeStaging;
  const databaseSmokeJira = { sourceSystem: "jira" as const, serverIdentity: "jira:ui-smoke-v0238", baseUrlNormalized: "https://jira-ui-smoke.invalid", serverTitle: "UI Smoke Jira" };
  const databaseSmokeRun = createStagingRun(ensureDir(getFullFetchStagingDir()), {
    runId: `ui-smoke-database-${Date.now()}`,
    selectedUser: "ui-smoke-user",
    queue: [{ key: "SMOKE-801" }],
    runContext: { sourceProvenance: databaseSmokeJira }
  });
  startTarget(databaseSmokeRun, "SMOKE-801");
  completeTarget(databaseSmokeRun, "SMOKE-801", { status: "eligible", rawEnvelope: {
    issue: { id: "801", key: "SMOKE-801", fields: { summary: "Packaged database write fixture", created: "2026-07-26T01:00:00.000Z", updated: "2026-07-27T01:00:00.000Z" }, names: {}, schema: {}, renderedFields: {} },
    changelogHistories: [], comments: [{ id: "smoke-comment-1", created: "2026-07-27T00:00:00.000Z", body: "Synthetic packaged comment" }], attachments: [], parsedUsers: [], evidenceEvents: [], issueLinks: [], remoteLinks: [],
    endpointMetadata: [{ method: "GET", endpoint: "/issue/SMOKE-801", status: 200, attempts: 1, fetchedAt: "2026-07-27T01:00:00.000Z" }],
    requestMetadata: { apiVersion: "v2", fetchedAt: "2026-07-27T01:00:00.000Z", fetchRemoteLinks: false },
    paginationMetadata: { changelog: { reportedTotal: 0, fetchedCount: 0, pageCount: 1, paginationComplete: true, duplicateCount: 0 }, comments: { reportedTotal: 0, fetchedCount: 0, pageCount: 1, paginationComplete: true, duplicateCount: 0 } },
    completenessMetadata: { requiredMissingSections: [] }
  }, classification: "complete" });
  finalizeStagingRun(databaseSmokeRun);
  const databaseSmokePath = path.join(ensureDir(getTempDir()), `v0238-source-archive-smoke-${Date.now()}.sqlite`);
  createSourceArchiveDatabase({
    targetPath: databaseSmokePath,
    appVersion: __MAIN_APP_VERSION__,
    binding: {
      serverIdentity: databaseSmokeJira.serverIdentity,
      baseUrlNormalized: databaseSmokeJira.baseUrlNormalized
    }
  });
  const databaseSmokeWrite = writeFullFetchStagingToCurrentDatabase({
    operationId: `ui-smoke-dbwrite-${Date.now()}`,
    databasePath: databaseSmokePath,
    run: databaseSmokeRun,
    currentJira: databaseSmokeJira
  });
  latestSourceArchiveDatabaseWrite = databaseSmokeWrite;
  if (databaseSmokeWrite.status !== "completed" || databaseSmokeWrite.summary.newIssues !== 1
    || databaseSmokeWrite.summary.payloadsCreated !== 1 || !databaseSmokeWrite.readbackVerified
    || databaseSmokeWrite.foreignKeyCheck !== "ok") {
    failures.push(`v0.2.41 packaged Current-State database write smoke failed ${JSON.stringify(databaseSmokeWrite)}`);
  }
  const changedSmokePayload = {
    issue: {
      id: "801",
      key: "SMOKE-801",
      fields: {
        summary: "Packaged database write fixture",
        created: "2026-07-26T01:00:00.000Z",
        updated: "2026-07-27T02:00:00.000Z",
        status: { id: "5", name: "Resolved" },
        issuelinks: []
      }
    },
    changelog: [{
      id: "smoke-history-1",
      created: "2026-07-27T02:00:00.000Z",
      items: [{ fieldId: "status", field: "status", fromString: "Open", toString: "Resolved" }]
    }],
    comments: [
      { id: "smoke-comment-1", created: "2026-07-27T00:00:00.000Z", body: "Synthetic packaged comment" },
      { id: "smoke-comment-2", created: "2026-07-27T02:30:00.000Z", body: "Synthetic packaged resolution" }
    ],
    attachments: [],
    users: [],
    issueLinks: [],
    remoteLinks: [],
    normalizedCurrentFields: { fetchedAt: "2026-07-27T03:00:00.000Z" },
    evidence: []
  };
  const smokeCoverage = {
    fetchProfileVersion: 1,
    coreFields: "CompleteNonEmpty" as const,
    changelog: "CompleteNonEmpty" as const,
    comments: "CompleteNonEmpty" as const,
    attachmentsMetadata: "CompleteEmpty" as const,
    issueLinks: "CompleteEmpty" as const,
    remoteLinks: "Disabled" as const,
    parentSubtasks: "CompleteEmpty" as const,
    relatedIssues: "Disabled" as const,
    conservationPassed: true,
    evidence: {
      coreFields: { status: "CompleteNonEmpty" as const, itemCount: 1, source: "issue.fields", requestCompleted: true, validationResult: "passed" as const, reasonCode: "CORE_FIELDS_COMPLETE" },
      changelog: { status: "CompleteNonEmpty" as const, itemCount: 1, source: "changelog", requestCompleted: true, validationResult: "passed" as const, reasonCode: "CHANGELOG_COMPLETE" },
      comments: { status: "CompleteNonEmpty" as const, itemCount: 2, source: "comments", requestCompleted: true, validationResult: "passed" as const, reasonCode: "COMMENTS_COMPLETE" },
      attachmentsMetadata: { status: "CompleteEmpty" as const, itemCount: 0, source: "issue.fields.attachment", requestCompleted: true, validationResult: "passed" as const, reasonCode: "ATTACHMENTS_COMPLETE" },
      issueLinks: { status: "CompleteEmpty" as const, itemCount: 0, source: "issue.fields.issuelinks", requestCompleted: true, validationResult: "passed" as const, reasonCode: "ISSUE_LINKS_FIELD_COMPLETE" },
      remoteLinks: { status: "Disabled" as const, itemCount: 0, source: "remoteLinks", requestCompleted: false, validationResult: "not_applicable" as const, reasonCode: "REMOTE_LINKS_DISABLED" },
      parentSubtasks: { status: "CompleteEmpty" as const, itemCount: 0, source: "issue.fields.parent/subtasks", requestCompleted: true, validationResult: "passed" as const, reasonCode: "PARENT_SUBTASKS_COMPLETE" },
      relatedIssues: { status: "Disabled" as const, itemCount: 0, source: "relatedIssuesDiscovery", requestCompleted: false, validationResult: "not_applicable" as const, reasonCode: "RELATED_ISSUES_DISABLED" }
    }
  };
  const changedSmokeWrite = writeCurrentStateBatch({
    operationId: `ui-smoke-dbwrite-changed-${Date.now()}`,
    runId: "ui-smoke-changed",
    databasePath: databaseSmokePath,
    jira: databaseSmokeJira,
    items: [{
      issueKey: "SMOKE-801",
      rawJson: changedSmokePayload,
      coverage: smokeCoverage,
      eligibility: "eligible"
    }]
  });
  const duplicateSmokeWrite = writeCurrentStateBatch({
    operationId: `ui-smoke-dbwrite-duplicate-${Date.now()}`,
    runId: "ui-smoke-duplicate",
    databasePath: databaseSmokePath,
    jira: databaseSmokeJira,
    items: [{
      issueKey: "SMOKE-801",
      rawJson: { ...changedSmokePayload, normalizedCurrentFields: { fetchedAt: "2026-07-27T04:00:00.000Z" } },
      coverage: smokeCoverage,
      eligibility: "eligible",
    }]
  });
  if (changedSmokeWrite.outcomes[0]?.outcome !== "updated"
    || duplicateSmokeWrite.outcomes[0]?.outcome !== "existing"
    || duplicateSmokeWrite.summary.updatedIssues !== 0
    || duplicateSmokeWrite.summary.activityEventsInserted !== 0) {
    failures.push(`v0.2.41 packaged current-state smoke failed ${JSON.stringify({ changedSmokeWrite, duplicateSmokeWrite })}`);
  }
  await window.webContents.executeJavaScript(`window.desktopApp?.userAnalysis?.exportSourceArchive?.({ selectedUser: "roger_hsieh", rawData: { rawIssueResponsesSanitized: [{ issueKey: "SMOKE-101", json: { id: "101", key: "SMOKE-101", fields: { updated: "2026-07-02T09:00:00.000Z", summary: "Source archive smoke fixture" } } }] } });`);
  await wait(180);
  await window.webContents.executeJavaScript(`document.querySelector("[data-debug-panel-state='collapsed']")?.querySelector("button")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.title?.includes("Export Debug Folder"))?.click();`);
  await wait(500);
  const missingSmokeIndex = autoSavedRunHistory.indexOf(missingSmokeRun);
  if (missingSmokeIndex >= 0) autoSavedRunHistory.splice(missingSmokeIndex, 1);
  const debugBundleUiAudit = await window.webContents.executeJavaScript(`(() => ({ path: document.querySelector("[data-testid='last-debug-bundle-path']")?.textContent || "", open: Boolean(document.querySelector("[data-testid='open-debug-bundle']")), copy: Boolean(document.querySelector("[data-testid='copy-debug-bundle-path']")), close: Boolean(document.querySelector("[data-testid='close-debug-bundle-result']")), completion: Boolean(document.querySelector("[data-testid='debug-folder-completion']")) }))()`);
  const autoSavedFiles = Object.fromEntries(Object.entries(autoSaveDirs).map(([type, dir]) => [type, fs.readdirSync(dir).filter((name) => !autoSaveFilesBefore[type as AutoSaveResultType].has(name))])) as Record<AutoSaveResultType, string[]>;
  for (const [type, files] of Object.entries(autoSavedFiles)) if (files.length < 1) failures.push(`auto-save missing for ${type}: ${JSON.stringify(files)}`);
  const autoSavedDocuments = Object.entries(autoSavedFiles).flatMap(([type, files]) => files.map((name) => JSON.parse(fs.readFileSync(path.join(autoSaveDirs[type as AutoSaveResultType], name), "utf8")) as Record<string, unknown>));
  if (autoSavedDocuments.some((document) => !asRecord(document.autoSave).path || asRecord(document.autoSave).enabled !== true || asRecord(document.debugBundleHints).includeInDebugBundle !== true || !Array.isArray(document.crossPageDebugBundleTodo))) failures.push("auto-save metadata/debug bundle hints audit failed");
  const standardBaselineAutoSave = autoSavedDocuments.find((document) => asRecord(document.standardActivityStreamFlow).enabled === true && asRecord(asRecord(document.activityStream).baselineComparison).enabled === true);
  const standardBaselineRetry = asRecord(asRecord(standardBaselineAutoSave?.activityStream).baselineGuardRetry);
  const standardBaselineComparison = asRecord(asRecord(standardBaselineAutoSave?.activityStream).baselineComparison);
  const standardBaselineAttempts = asRecord(standardBaselineAutoSave?.activityStream).baselineGuardAttemptResults;
  if (!standardBaselineAutoSave || !standardBaselineComparison.snapshotKey || !standardBaselineComparison.baselineCounts || !standardBaselineComparison.currentCounts || Number(standardBaselineRetry.maxRetries) !== 2 || !Array.isArray(standardBaselineRetry.attempts) || standardBaselineRetry.attempts.length > 3 || !Array.isArray(standardBaselineAttempts) || standardBaselineAttempts.length !== standardBaselineRetry.attempts.length) failures.push(`standard baseline auto-save audit failed ${JSON.stringify({ standardBaselineComparison, standardBaselineRetry, standardBaselineAttempts })}`);
  const newDebugBundles = fs.readdirSync(debugBundlesDir).filter((name) => !debugBundlesBefore.has(name));
  const debugBundleFolderName = newDebugBundles.find((name) => fs.statSync(path.join(debugBundlesDir, name)).isDirectory());
  const debugBundlePath = debugBundleFolderName ? path.join(debugBundlesDir, debugBundleFolderName) : "";
  const requiredBundleFiles = ["debug-log.txt", "user-action-log.txt", "app-metadata.json", "request-context.json", "latest-result.json", "latest-run-result.json", "last-successful-result.json", "last-parsed-result.json", "latest-no-entries-result.json", "latest-activity-stream-result.json", "latest-precision-probe-result.json", "latest-manual-url-replay-result.json", "latest-maxresults-cap-test.json", "run-history.json", "activity-stream-run-history.json", "auto-saved-result-paths.json", "auto-saved-results", "auto-saved-results-index.json", "session-timeline.json", "activity-stream-chunk-results.json", "activity-stream-merged-result.json", "standard-activity-stream-flow.json", "activity-type-classifier-diagnostics.json", "activity-stream-baseline-comparison.json", "activity-stream-baseline-snapshot.json", "activity-stream-baseline-history.json", "activity-stream-baseline-comparisons.json", "user-activity-timeline.json", "user-activity-timeline.csv", "timeline-build-summary.json", "timeline-event-schema.json", "timeline-integrity-diagnostics.json", "timeline-dedup-diagnostics.json", "timeline-issue-key-diagnostics.json", "timeline-source-system-diagnostics.json", "debug-bundle-summary.json", "README_for_GPT.txt"];
  requiredBundleFiles.push("user-analysis-steps.json", "timeline-issue-groups.json", "timeline-selected-issues.json", "fetch-queue.json", "related-candidate-issues.json", "related-issue-expansion-summary.json", "timeline-jira-relation-diagnostics.json", "full-fetch-failed-issues.json", "full-fetch-failure-summary.json", "timeline-event-list-ui-state.json", "select-issues-ui-state.json");
  requiredBundleFiles.push("jira-evidence-events.json", "jira-evidence-summary.json", "jira-evidence-excluded-summary.json", "jira-evidence-schema.json", "analysis-roadmap.json");
  requiredBundleFiles.push("activity-stream-stability-probe.json", "activity-stream-attempts.json", "activity-stream-attempt-comparison.csv", "activity-stream-window-summary.csv", "activity-stream-stability-recommendation.json");
  requiredBundleFiles.push("activity-stream-stability-probe-v2.json", "activity-stream-stability-setup.json", "activity-stream-rounds.json", "activity-stream-round-comparison.json", "activity-stream-round-comparison.csv", "activity-stream-window-diagnostics.json", "activity-stream-window-diagnostics.csv", "activity-stream-raw-diagnostics.json", "activity-stream-stability-ui-state.json", "activity-stream-stability-recommendation-v2.json", "activity-stream-benchmark.json", "activity-stream-benchmark.csv", "activity-stream-benchmark-summary.json", "full-fetch-coverage-diagnostics.json", "source-archive-file-assessment.json", "source-archive-export-index.json", "source-archive-database-write.json", "source-archive-migration.json", "source-version-projection");
  requiredBundleFiles.push("volatile-field-candidates.json", "stable-hash-field-diff.json");
  requiredBundleFiles.push("worklog-completeness-report.json", "content-display-decision-report.json", "content-display-decisions.csv", "content-parse-failure-evidence.json");
  requiredBundleFiles.push("full-fetch-staging-index.json", "full-fetch-staging", "full-fetch-result", "logs", "staging-metadata", "source-archive-metadata", "export-history", "environment", "sessions", "path-audit.json", "manifest.json");
  const actualBundleFiles = debugBundlePath ? fs.readdirSync(debugBundlePath) : [];
  const missingBundleFiles = requiredBundleFiles.filter((name) => !actualBundleFiles.includes(name));
  const bundleText = debugBundlePath ? actualBundleFiles.filter((name) => fs.statSync(path.join(debugBundlePath, name)).isFile()).map((name) => fs.readFileSync(path.join(debugBundlePath, name), "utf8")).join("\n") : "";
  if (!autoSaveUiAudit.visible || !autoSaveUiAudit.activity || !autoSaveUiAudit.path || !autoSaveUiAudit.open || !autoSaveUiAudit.copy) failures.push(`last auto-save UI audit failed ${JSON.stringify(autoSaveUiAudit)}`);
  if (!debugBundleUiAudit.path || !debugBundleUiAudit.open || !debugBundleUiAudit.copy || !debugBundleUiAudit.close || !debugBundleUiAudit.completion || !debugBundlePath || !fs.statSync(debugBundlePath).isDirectory() || missingBundleFiles.length > 0) failures.push(`debug folder UI/files audit failed ${JSON.stringify({ debugBundleUiAudit, debugBundlePath, missingBundleFiles })}`);
  const generatedDebugLogText = debugBundlePath && fs.existsSync(path.join(debugBundlePath, "debug-log.txt"))
    ? fs.readFileSync(path.join(debugBundlePath, "debug-log.txt"), "utf8")
    : "";
  const hasUnmaskedBundleCredential = generatedDebugLogText.split(/\r?\n/).some((line) =>
    (/Authorization:/i.test(line) && !/Authorization:\s*\[masked\]/i.test(line))
    || (/JSESSIONID:/i.test(line) && !/JSESSIONID:\s*\[masked\]/i.test(line))
  );
  if (!bundleText.includes("Jira Activity Analyzer Debug Folder") || !bundleText.includes("Standard Activity Stream Flow:") || !bundleText.includes("Activity Type Classifier:") || !bundleText.includes("commentPriorityHigherThanAttachment: true") || !bundleText.includes("Cross-page TODO")) failures.push("debug folder README/classifier audit failed");
  if (hasUnmaskedBundleCredential) failures.push("generated debug log contains an unmasked credential");
  if (debugBundlePath) {
    const latestBundleResult = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "latest-run-result.json"), "utf8")));
    const bundleHistory = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "run-history.json"), "utf8")) as Array<Record<string, unknown>>;
    const bundlePaths = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "auto-saved-result-paths.json"), "utf8")));
    const bundleSummary = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "debug-bundle-summary.json"), "utf8")));
    const bundleStandardFlow = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "standard-activity-stream-flow.json"), "utf8")));
    const bundleClassifier = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-type-classifier-diagnostics.json"), "utf8")));
    const bundleChunks = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-chunk-results.json"), "utf8")) as Array<Record<string, unknown>>;
    const bundleMerged = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-merged-result.json"), "utf8")));
    const bundleBaselineComparison = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-baseline-comparison.json"), "utf8")));
    const bundleBaselineSnapshot = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-baseline-snapshot.json"), "utf8")));
    const bundleBaselineHistory = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-baseline-history.json"), "utf8")) as Array<Record<string, unknown>>;
    const bundleUserTimeline = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "user-activity-timeline.json"), "utf8")));
    const bundleTimelineSummary = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-build-summary.json"), "utf8")));
    const bundleTimelineSchema = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-event-schema.json"), "utf8")));
    const bundleTimelineIntegrity = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-integrity-diagnostics.json"), "utf8")));
    const bundleTimelineDedup = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-dedup-diagnostics.json"), "utf8")));
    const bundleTimelineIssueKeys = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-issue-key-diagnostics.json"), "utf8")));
    const bundleTimelineSourceSystems = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-source-system-diagnostics.json"), "utf8")));
    const bundleTimelineJiraRelation = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-jira-relation-diagnostics.json"), "utf8")));
    const bundleFailedIssues = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "full-fetch-failed-issues.json"), "utf8")) as Array<Record<string, unknown>>;
    const bundleFailureSummary = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "full-fetch-failure-summary.json"), "utf8")));
    const bundleJiraEvidenceEvents = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "jira-evidence-events.json"), "utf8")));
    const bundleJiraEvidenceSummary = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "jira-evidence-summary.json"), "utf8")));
    const bundleJiraEvidenceExcluded = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "jira-evidence-excluded-summary.json"), "utf8")));
    const bundleJiraEvidenceSchema = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "jira-evidence-schema.json"), "utf8")));
    const bundleAnalysisRoadmap = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "analysis-roadmap.json"), "utf8")));
    const bundleStabilityProbe = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-stability-probe.json"), "utf8")));
    const bundleStabilityAttempts = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-attempts.json"), "utf8")));
    const bundleStabilityRecommendation = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-stability-recommendation.json"), "utf8")));
    const bundleStabilityProbeV2 = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-stability-probe-v2.json"), "utf8")));
    const bundleStabilityRoundsV2 = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-rounds.json"), "utf8")));
    const bundleStabilityRecommendationV2 = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-stability-recommendation-v2.json"), "utf8")));
    const bundleSourceArchiveAssessment = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "source-archive-file-assessment.json"), "utf8")));
    const bundleSourceArchiveIndex = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "source-archive-export-index.json"), "utf8")));
    const bundleSourceArchiveDatabaseWrite = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "source-archive-database-write.json"), "utf8")));
    const bundleFullFetchStagingIndex = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "full-fetch-staging-index.json"), "utf8")));
    const bundleStagingState = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "full-fetch-staging", "manifest.json"), "utf8")));
    const bundleStagingRunIndex = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "full-fetch-staging", "run-index.json"), "utf8")));
    const bundleStagingPartialSummary = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "full-fetch-staging", "partial-records-summary.json"), "utf8")));
    const bundleStabilityUiState = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-stability-ui-state.json"), "utf8")));
    const bundleWindowDiagnostics = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-window-diagnostics.json"), "utf8")));
    const bundleBenchmark = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "activity-stream-benchmark.json"), "utf8")));
    const bundleTimelineCsv = fs.readFileSync(path.join(debugBundlePath, "user-activity-timeline.csv"));
    const bundleAutoSavedIndex = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "auto-saved-results-index.json"), "utf8")));
    const bundleTimeline = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "session-timeline.json"), "utf8") as string) as Array<Record<string, unknown>>;
    const bundleWorkflowSteps = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "user-analysis-steps.json"), "utf8")));
    const bundleTimelineGroups = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-issue-groups.json"), "utf8")) as Array<Record<string, unknown>>;
    const bundleRelatedIssues = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "related-candidate-issues.json"), "utf8")) as Array<Record<string, unknown>>;
    const bundleRelatedScope = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "related-issue-expansion-summary.json"), "utf8")));
    const bundleTimelineUiState = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "timeline-event-list-ui-state.json"), "utf8")));
    const bundleSelectIssuesUiState = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "select-issues-ui-state.json"), "utf8")));
    const bundleManifest = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "manifest.json"), "utf8")));
    const bundlePathAudit = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "path-audit.json"), "utf8")));
    const fullSessionBundle = asRecord(bundleSummary.fullSessionBundle);
    const bundleBaselineGuard = asRecord(bundleSummary.activityStreamBaselineGuard);
    const latestBundleRunId = String(latestBundleResult.runId || "");
    const bundleEvidenceEvents = Array.isArray(bundleJiraEvidenceEvents.events) ? bundleJiraEvidenceEvents.events.map(asRecord) : [];
    const bundleEvidencePolicy = asRecord(bundleJiraEvidenceSummary.relatedIssueExpansionPolicy);
    const bundleRoadmapAnalyzers = asRecord(bundleAnalysisRoadmap.analyzers);
    const bundleStabilitySummaryV2 = asRecord(bundleSummary.activityStreamRoundStabilityV2);
    const manifestEvidence = Array.isArray(bundleManifest.evidence) ? bundleManifest.evidence.map(asRecord) : [];
    const allowedEvidenceStatuses = new Set(["copied", "not_observed", "not_run", "source_missing", "copy_failed"]);
    const sessionMainCopied = fs.existsSync(path.join(debugBundlePath, "sessions", "current", "main.ndjson"));
    if (bundleManifest.schemaVersion !== "debug_folder_manifest_v1" || manifestEvidence.length < 1 || manifestEvidence.some((entry) => !allowedEvidenceStatuses.has(String(entry.status))) || Number(bundleManifest.filesCopied) !== manifestEvidence.filter((entry) => entry.status === "copied").length || Number(bundleManifest.sourcesNotObserved) !== manifestEvidence.filter((entry) => entry.status === "not_observed").length || Number(bundleManifest.featuresNotRun) !== manifestEvidence.filter((entry) => entry.status === "not_run").length || Number(bundleManifest.sourcesMissing) !== manifestEvidence.filter((entry) => entry.status === "source_missing").length || Number(bundleManifest.copyFailures) !== manifestEvidence.filter((entry) => entry.status === "copy_failed").length || asRecord(bundlePathAudit.containment).allInsideAppRoot !== true || asRecord(bundlePathAudit.writablePreflight).status !== "passed" || !sessionMainCopied) failures.push(`Hotfix Debug Folder status/path/session audit failed ${JSON.stringify({ bundleManifest, bundlePathAudit, sessionMainCopied })}`);
    const stabilityRoundRows = Array.isArray(bundleStabilityRoundsV2.rounds) ? bundleStabilityRoundsV2.rounds.map(asRecord) : [];
    if (bundleStabilityProbeV2.schemaVersion !== "activity_stream_stability_probe_v2" || bundleStabilityProbeV2.executionOrder !== "round_first" || !String(bundleStabilityProbeV2.probeRunId).startsWith("ASR-") || stabilityRoundRows.length < 2 || stabilityRoundRows.some((round) => !round.roundEventSetFingerprint || !round.roundPrimaryJiraKeySetFingerprint || Number(round.totalRounds) < 1) || !asRecord(bundleStabilityRecommendationV2.recommendation).recommendedRoundCount || bundleStabilitySummaryV2.available !== true || Number(bundleStabilitySummaryV2.roundCount) < 2 || bundleSourceArchiveAssessment.schemaVersion !== "source_archive_file_assessment_v1") failures.push(`debug bundle Round Stability V2 audit failed ${JSON.stringify({ probe: bundleStabilityProbeV2.probeRunId, rounds: stabilityRoundRows.length, recommendation: bundleStabilityRecommendationV2, summary: bundleStabilitySummaryV2 })}`);
    const diagnosticWindows = Array.isArray(bundleWindowDiagnostics.windows) ? bundleWindowDiagnostics.windows.map(asRecord) : [];
    const canonicalSnapshotInBundle = fs.existsSync(path.join(debugBundlePath, "full-fetch-staging", "issues", "SMOKE-101", "current-issue-snapshot.json"));
    if (bundleFullFetchStagingIndex.stagingAvailable !== true || bundleFullFetchStagingIndex.status !== "completed_with_errors" || Number(asRecord(bundleFullFetchStagingIndex.counts).eligible) !== 1 || Number(asRecord(bundleFullFetchStagingIndex.counts).requiredPartial) !== 1 || Number(asRecord(bundleFullFetchStagingIndex.counts).failed) !== 1 || bundleStagingState.schemaVersion !== "full_fetch_staging_v4" || bundleStagingRunIndex.schemaVersion !== "full_fetch_run_index_v4" || Number(bundleStagingPartialSummary.count) !== 1 || !canonicalSnapshotInBundle) failures.push(`Full Fetch staging Debug Bundle audit failed ${JSON.stringify({ index: bundleFullFetchStagingIndex, state: bundleStagingState, runIndex: bundleStagingRunIndex.schemaVersion, partial: bundleStagingPartialSummary, canonicalSnapshotInBundle })}`);
    if (bundleStabilityProbe.status !== "legacy_v1_not_applicable" || !bundleStabilityUiState.latestProbeRunId || diagnosticWindows.length < 1 || diagnosticWindows.some((item) => !item.logicalRequestId || !item.classification || Number(item.physicalHttpRequestCount) < 1 || !item.processingTiming) || bundleBenchmark.schemaVersion !== "activity_stream_benchmark_v1" || Number(asRecord(bundleBenchmark.summary).runCount) < 1 || bundleSourceArchiveIndex.includedInDebugBundle !== false || bundleSourceArchiveIndex.metadataOnly !== true) failures.push(`v0.2.31 reliability bundle audit failed ${JSON.stringify({ legacy: bundleStabilityProbe, uiState: bundleStabilityUiState, diagnosticWindows: diagnosticWindows.length, benchmark: bundleBenchmark.benchmarkRunId, sourceArchive: bundleSourceArchiveIndex })}`);
    if (bundleEvidenceEvents.length < 1 || bundleEvidenceEvents.some((item) => !/^sha256:[0-9a-f]{64}$/.test(String(item.evidenceId)) || !item.evidenceScope || !item.evidenceType || !item.activityType) || Number(bundleJiraEvidenceSummary.directEvidenceCount) < 1 || Number(bundleJiraEvidenceExcluded.excludedCount) < 1 || bundleEvidencePolicy.recursive !== false || Number(bundleEvidencePolicy.maxDepth) !== 1 || bundleEvidencePolicy.relatedIssuesAsPrimaryEvidence !== false || bundleJiraEvidenceSchema.schemaVersion !== "jira_evidence_event_v1" || bundleRoadmapAnalyzers.cloudAiAnalyzer !== "planned" || bundleSourceArchiveDatabaseWrite.status !== "completed" || Number(asRecord(bundleSourceArchiveDatabaseWrite.summary).newIssues) !== 1 || bundleSourceArchiveDatabaseWrite.readbackVerified !== true || bundleSourceArchiveDatabaseWrite.foreignKeyCheck !== "ok" || !bundleText.includes("Direct Jira Evidence:") || !bundleText.includes("Related Issue Expansion Policy:") || !bundleText.includes("Analyzer Roadmap:") || !bundleText.includes("Data Source Runtime:") || !bundleText.includes("Local Database: completed") || !bundleText.includes("Product Goals:")) failures.push(`debug bundle direct Jira evidence/database write audit failed ${JSON.stringify({ events: bundleEvidenceEvents.length, summary: bundleJiraEvidenceSummary, excluded: bundleJiraEvidenceExcluded, policy: bundleEvidencePolicy, schema: bundleJiraEvidenceSchema.schemaVersion, roadmap: bundleRoadmapAnalyzers, databaseWrite: bundleSourceArchiveDatabaseWrite })}`);
    if (!latestBundleRunId || !bundleHistory.some((run) => String(run?.runId || "") === latestBundleRunId) || String(asRecord(bundlePaths.latestRunResult).runId || "") !== latestBundleRunId || bundleSummary.snapshotConsistent !== true) failures.push(`debug bundle snapshot consistency failed: latest=${latestBundleRunId}`);
    if (bundleStandardFlow.enabled !== true || bundleStandardFlow.variant !== "escaped_username" || bundleStandardFlow.activityStreamQueryUser !== "roger\\_hsieh" || Number(bundleStandardFlow.perChunkMaxResults) !== 500 || bundleClassifier.enabled !== true || bundleClassifier.commentPriorityHigherThanAttachment !== true || bundleClassifier.rulesVersion !== "1.1" || !asRecord(bundleSummary.standardActivityStreamFlow).selectedUser || !bundleSummary.activityTypeClassifierDiagnostics) failures.push(`debug bundle standard flow/classifier diagnostics failed: ${JSON.stringify({ bundleStandardFlow, bundleClassifier })}`);
    if (bundleBaselineGuard.enabled !== true || bundleBaselineComparison.enabled !== true || bundleBaselineSnapshot.schemaVersion !== 1 || !String(bundleBaselineSnapshot.snapshotKey || "").includes("activity_stream|") || bundleBaselineHistory.length < 1 || !bundleTimeline.some((entry) => entry.type === "activity_stream_baseline_guard") || !bundleText.includes("Activity Stream Baseline Guard:") || !bundleText.includes("activity-stream-baseline-comparison.json")) failures.push(`debug bundle baseline guard audit failed: ${JSON.stringify({ bundleBaselineGuard, bundleBaselineComparison, snapshotKey: bundleBaselineSnapshot.snapshotKey, history: bundleBaselineHistory.length })}`);
    const bundleUserTimelineSummary = asRecord(bundleSummary.userActivityTimeline);
    const bundleUserTimelineEvents = Array.isArray(bundleUserTimeline.events) ? bundleUserTimeline.events.map(asRecord) : [];
    const bundleTimelineIntegritySummary = asRecord(bundleSummary.timelineIntegrity);
    const bundleUserAnalysisUiSummary = asRecord(bundleSummary.userAnalysisUiState);
    if (bundleWorkflowSteps.activityTimeline !== "completed" || "advancedCandidateSearch" in bundleWorkflowSteps || !bundleTimelineGroups.some((group) => group.issueKey === "COPGEN1-125806" && group.issueKeyRole === "secondary" && Number(asRecord(group.sourceSystemSummary).jira) === 1) || !bundleRelatedIssues.some((item) => item.issueKey === "COPGEN1-69506" && item.relationType === "parent_link" && item.scope === "recommended") || Number(asRecord(bundleRelatedScope.recommended).uniqueIssueCount) < 1 || Number(asRecord(asRecord(bundleSummary.relatedIssueScopeSummary).recommended).uniqueIssueCount) < 1 || !bundleSummary.userAnalysisWorkflow || Number(bundleUserAnalysisUiSummary.workflowStepCount) !== 5 || bundleUserAnalysisUiSummary.advancedToolsVisible !== false || bundleUserAnalysisUiSummary.fullFetchProgressLocation !== "step3_full_fetch" || !Array.isArray(bundleTimelineUiState.visibleColumns) || !Array.isArray(bundleSelectIssuesUiState.visibleColumns) || !asRecord(bundleTimelineUiState.filters).sourceApplications || !asRecord(bundleSelectIssuesUiState.filters).jiraRelations || !bundleTimeline.some((entry) => entry.type === "timeline_issues_added_to_fetch_queue") || !bundleTimeline.some((entry) => entry.type === "related_issues_expanded") || !bundleText.includes("User Analysis Workflow:") || !bundleText.includes("User Analysis UI State:") || !bundleText.includes("Timeline visible columns:") || !bundleText.includes("Select Issues filters:") || !bundleText.includes("Recommended:") || !bundleText.includes("Optional:")) failures.push(`debug bundle User Analysis workflow/UI state audit failed: ${JSON.stringify({ bundleWorkflowSteps, bundleTimelineGroups, bundleRelatedIssues, bundleRelatedScope, bundleUserAnalysisUiSummary, bundleTimelineUiState, bundleSelectIssuesUiState, summaryScope: bundleSummary.relatedIssueScopeSummary })}`);
    const bundleTimelineSourceSummary = asRecord(bundleSummary.timelineSourceSystem);
    const bundleRelationGroup = bundleTimelineGroups.find((group) => group.issueKey === "COPGEN1-125806");
    if (!bundleRelationGroup || bundleRelationGroup.isJiraRelated !== true || bundleRelationGroup.hasJiraIssueKey !== true || Number(asRecord(bundleRelationGroup.jiraRelationSummary).jiraRelatedEventCount) !== 1) failures.push(`debug bundle timeline Jira relation group audit failed: ${JSON.stringify(bundleRelationGroup)}`);
    if (bundleUserTimelineSummary.available !== true || !String(bundleUserTimeline.timelineRunId).startsWith("tlrun-") || Number(bundleTimelineSummary.totalEvents) < 1 || Number(bundleTimelineSchema.schemaVersion) !== 4 || bundleUserTimelineEvents.some((event) => !/^sha256:[0-9a-f]{64}$/.test(String(event.eventId)) || String(event.eventId).startsWith("sha256:sha256:") || !event.sourceSystem || !event.sourceDetail || !event.sourceApplication || typeof event.hasJiraIssueKey !== "boolean" || typeof event.isJiraRelated !== "boolean" || !Array.isArray(event.relatedSystems) || !event.jiraRelationReason) || !bundleTimelineCsv.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || !bundleTimeline.some((entry) => entry.type === "user_activity_timeline_built") || !bundleText.includes("User Activity Timeline:") || !bundleText.includes("Timeline Integrity:") || !bundleText.includes("Timeline Source System:") || bundleTimelineIntegritySummary.available !== true || Number(bundleTimelineIntegrity.unexplainedDifferenceCount ?? asRecord(bundleTimelineSummary.eventCountReconciliation).unexplainedDifferenceCount) !== 0 || Number(bundleTimelineIssueKeys.timelineAllIssueKeyCount) < Number(bundleTimelineIssueKeys.timelinePrimaryIssueKeyCount) || !Array.isArray(bundleTimelineDedup.dedupGroups) || !bundleTimelineSourceSystems.sourceSystemCounts || bundleTimelineSourceSummary.available !== true || bundleTimelineSourceSummary.defaultSelectIssuesFilter !== "jira" || Number(bundleTimelineSourceSummary.jira) < 1) failures.push(`debug bundle timeline audit failed: ${JSON.stringify({ bundleUserTimelineSummary, bundleTimelineIntegritySummary, timelineRunId: bundleUserTimeline.timelineRunId, totalEvents: bundleTimelineSummary.totalEvents, schemaVersion: bundleTimelineSchema.schemaVersion, bundleTimelineSourceSystems, bundleTimelineSourceSummary })}`);
    const bundleJiraRelationSummary = asRecord(bundleSummary.timelineJiraRelation);
    const bundleFullFetchFailureSummary = asRecord(bundleSummary.fullFetchFailures);
    if (bundleTimelineJiraRelation.classificationRulesVersion !== "v0.2.22" || !bundleTimelineJiraRelation.jiraRelationCounts || bundleJiraRelationSummary.available !== true || !bundleText.includes("Jira Relation:") || !bundleFailedIssues.some((item) => item.issueKey === "SMOKE-404" && item.errorCode === "HTTP_404" && Number(item.retryCount) === 2 && item.source === "recommended_related_issue" && item.matchedReason === "parent_link") || Number(bundleFailureSummary.failedCount) !== 1 || Number(asRecord(bundleFailureSummary.byHttpStatus)["404"]) !== 1 || Number(bundleFullFetchFailureSummary.failedCount) !== 1 || !bundleText.includes("Full Fetch Failures:")) failures.push(`debug bundle Jira relation/full fetch failure audit failed: ${JSON.stringify({ bundleTimelineJiraRelation, bundleJiraRelationSummary, bundleFailedIssues, bundleFailureSummary, bundleFullFetchFailureSummary })}`);
    const includedAutoSavedResults = Array.isArray(bundleAutoSavedIndex.included) ? bundleAutoSavedIndex.included.map(asRecord) : [];
    const missingAutoSavedResults = Array.isArray(bundleAutoSavedIndex.missing) ? bundleAutoSavedIndex.missing.map(asRecord) : [];
    const copiedAutoSavedFiles = fs.readdirSync(path.join(debugBundlePath, "auto-saved-results"));
    if (fullSessionBundle.enabled !== true || !fullSessionBundle.sessionStartTime || !fullSessionBundle.bundleGeneratedAt || Number(fullSessionBundle.totalUserActions) < 1 || Number(fullSessionBundle.totalRuns) < 1 || Number(fullSessionBundle.totalAutoSavedResults) !== includedAutoSavedResults.length + missingAutoSavedResults.length || Number(fullSessionBundle.includedAutoSavedResultCount) !== includedAutoSavedResults.length || Number(fullSessionBundle.missingAutoSavedResultCount) !== missingAutoSavedResults.length || !Array.isArray(bundleSummary.includedAutoSavedResults) || !Array.isArray(bundleSummary.missingAutoSavedResults) || includedAutoSavedResults.length < 4 || copiedAutoSavedFiles.length !== includedAutoSavedResults.length || !missingAutoSavedResults.some((entry) => entry.runId === "smoke-missing-auto-save" && entry.reason === "file_not_found") || !bundleTimeline.some((entry) => entry.source === "user_action" && entry.type === "user_action" && entry.action) || !bundleTimeline.some((entry) => entry.source === "debug_log") || !bundleTimeline.some((entry) => entry.source === "activity_run_history" && entry.type === "activity_stream_result") || !bundleTimeline.some((entry) => entry.source === "auto_save_path")) failures.push(`full session bundle audit failed: ${JSON.stringify({ fullSessionBundle, included: includedAutoSavedResults.length, missing: missingAutoSavedResults, copied: copiedAutoSavedFiles.length, timeline: bundleTimeline.length })}`);
    const lastSuccessfulBundle = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "last-successful-result.json"), "utf8")));
    if (String(asRecord(latestBundleResult.activityStream).diagnosis) !== "no_entries" || !["parsed", "parsed_confluence_only", "parsed_no_issue_keys"].includes(String(asRecord(lastSuccessfulBundle.activityStream).diagnosis))) failures.push("latest no_entries overwrote or invalidated last successful result");
    if (bundleChunks.length !== 7 || Number(asRecord(bundleMerged.chunkMergeStats).duplicateEntriesRemoved) !== 6 || Number(asRecord(bundleMerged.chunkMergeStats).mergedActivityEntries) !== 8) failures.push(`debug bundle chunk result audit failed: chunks=${bundleChunks.length} merge=${JSON.stringify(bundleMerged.chunkMergeStats)}`);
  }

  const fullFetchFilesBeforeConfirmationTest = fs.existsSync(getFullFetchLogsDir())
    ? new Set(fs.readdirSync(getFullFetchLogsDir()))
    : new Set<string>();
  const actionLogPath = getUserActionLogPath();
  const actionLogStartSize = fs.existsSync(actionLogPath) ? fs.statSync(actionLogPath).size : 0;
  window.setSize(1280, 720, false);
  await openAnalysisUiSmoke(window);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-large-queue", { detail: { count: 41 } }));`);
  await wait(250);
  const largeQueueOpened = await window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector("[data-debug-panel-state='collapsed']");
      panel?.querySelector("button")?.click();
      const runButton = document.querySelector("[data-testid='run-full-fetch']");
      const disabled = runButton instanceof HTMLButtonElement ? runButton.disabled : true;
      runButton?.click();
      return { found: Boolean(runButton), disabled };
    })()
  `);
  await wait(250);
  const largeQueueRejected = await window.webContents.executeJavaScript(`
    (() => {
      const modalVisible = document.body.innerText.includes("Full Fetch Confirmation");
      const input = Array.from(document.querySelectorAll("input")).find((element) => element.getAttribute("placeholder") === "CONFIRM");
      if (input instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "WRONG");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const confirmButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Confirm and Run Full Fetch"));
      confirmButton?.click();
      return { modalVisible, hasInput: Boolean(input), hasConfirmButton: Boolean(confirmButton) };
    })()
  `);
  await wait(250);
  const largeQueueCancelled = await window.webContents.executeJavaScript(`
    (() => {
      const rejected = document.body.innerText.includes("Please type CONFIRM exactly");
      const cancelButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Cancel / 取消"));
      cancelButton?.click();
      return { rejected, hasCancelButton: Boolean(cancelButton) };
    })()
  `);
  await wait(250);
  const largeQueueFinal = await window.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText;
      return {
        modalClosed: !text.includes("Full Fetch Confirmation"),
        hasUserAction: text.includes("[USER_ACTION]"),
        hasGuard: text.includes("[GUARD]"),
        hasUiModal: text.includes("[UI_MODAL]")
      };
    })()
  `);
  await window.webContents.executeJavaScript(`
    document.querySelector("[data-testid='run-full-fetch']")?.click();
  `);
  await wait(150);
  await window.webContents.executeJavaScript(`
    (() => {
      const input = Array.from(document.querySelectorAll("input")).find((element) => element.getAttribute("placeholder") === "CONFIRM");
      if (input instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "CONFIRM");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()
  `);
  await wait(150);
  await window.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Confirm and Run Full Fetch"))?.click();
  `);
  await wait(250);
  const largeQueueConfirmed = await window.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText;
      return {
        modalClosed: !text.includes("Full Fetch Confirmation"),
        confirmedLog: text.includes("Large queue confirmation confirmed"),
        matchedLog: text.includes("confirmInputMatched=true")
      };
    })()
  `);
  await wait(500);
  const actionLogBuffer = fs.existsSync(actionLogPath) ? fs.readFileSync(actionLogPath) : Buffer.alloc(0);
  const retainedActionTimeline = actionLogBuffer.subarray(actionLogStartSize).toString("utf8");
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:churn-debug-log"));`);
  await wait(150);
  const retentionAudit = await window.webContents.executeJavaScript(`
    (() => {
      const text = document.body.innerText;
      return {
        earlyActionStillInUiBuffer: text.includes("Button clicked: Run Full Fetch from Queue"),
        latestProgressVisible: text.includes("Retention smoke progress 220/220")
      };
    })()
  `);
  await window.webContents.executeJavaScript(`
    document.querySelector("[data-testid='workflow-exports']")?.click();
  `);
  await wait(200);
  const actionLogUiAudit = await window.webContents.executeJavaScript(`
    (() => {
      const openButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Open Action Log Folder"));
      const copyButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Copy Action Log Path"));
      openButton?.click();
      copyButton?.click();
      return {
        pathVisible: document.body.innerText.includes(${JSON.stringify(actionLogPath)}),
        openEnabled: openButton instanceof HTMLButtonElement && !openButton.disabled,
        copyEnabled: copyButton instanceof HTMLButtonElement && !copyButton.disabled
      };
    })()
  `);
  await wait(300);
  const finalActionTimeline = fs.existsSync(actionLogPath) ? fs.readFileSync(actionLogPath, "utf8") : "";
  const debugExportAudit = buildDebugLogExportContent("2026/07/13 18:00:00.000 [INFO] UI buffer sample\nAuthorization: secret-value\ntoken: secret-value").mergedContent;
  const fullFetchFilesAfterConfirmationTest = fs.existsSync(getFullFetchLogsDir()) ? fs.readdirSync(getFullFetchLogsDir()) : [];
  const unexpectedFullFetchFiles = fullFetchFilesAfterConfirmationTest.filter((name) => !fullFetchFilesBeforeConfirmationTest.has(name));
  if (!largeQueueOpened.found || largeQueueOpened.disabled) failures.push(`large queue confirmation: Run Full Fetch button unavailable ${JSON.stringify(largeQueueOpened)}`);
  if (!largeQueueRejected.modalVisible || !largeQueueRejected.hasInput || !largeQueueRejected.hasConfirmButton) failures.push(`large queue confirmation: modal did not open correctly ${JSON.stringify(largeQueueRejected)}`);
  if (!largeQueueCancelled.rejected || !largeQueueCancelled.hasCancelButton) failures.push(`large queue confirmation: invalid input was not rejected ${JSON.stringify(largeQueueCancelled)}`);
  if (!largeQueueFinal.modalClosed || !largeQueueFinal.hasUserAction || !largeQueueFinal.hasGuard || !largeQueueFinal.hasUiModal) failures.push(`large queue confirmation: close/log audit failed ${JSON.stringify(largeQueueFinal)}`);
  if (!largeQueueConfirmed.modalClosed || !largeQueueConfirmed.confirmedLog || !largeQueueConfirmed.matchedLog) failures.push(`large queue confirmation: CONFIRM path failed ${JSON.stringify(largeQueueConfirmed)}`);
  if (unexpectedFullFetchFiles.length > 0) failures.push(`large queue confirmation: cancel created Full Fetch runtime files ${JSON.stringify(unexpectedFullFetchFiles)}`);
  const requiredRetainedActions = [
    "[USER_ACTION] Button clicked: Run Full Fetch from Queue",
    "[GUARD] Full Fetch confirmation required",
    "[UI_MODAL] Full Fetch confirmation opened",
    "confirmInputMatched=false",
    "Large queue confirmation rejected",
    "Large queue confirmation cancelled",
    "Full Fetch cancelled before start",
    "confirmInputMatched=true",
    "Large queue confirmed by user",
    "Full Fetch started after large queue confirmation"
  ];
  const missingRetainedActions = requiredRetainedActions.filter((entry) => !retainedActionTimeline.includes(entry));
  if (missingRetainedActions.length > 0) failures.push(`action log retention: missing ${JSON.stringify(missingRetainedActions)} in ${actionLogPath}`);
  if (!/user-actions-\d{8}\.log$/.test(actionLogPath)) failures.push(`action log retention: unexpected path ${actionLogPath}`);
  if (retentionAudit.earlyActionStillInUiBuffer || !retentionAudit.latestProgressVisible) failures.push(`action log retention: UI buffer churn was not demonstrated ${JSON.stringify(retentionAudit)}`);
  if (!actionLogUiAudit.pathVisible || !actionLogUiAudit.openEnabled || !actionLogUiAudit.copyEnabled) failures.push(`action log diagnostics UI failed ${JSON.stringify(actionLogUiAudit)}`);
  if (!finalActionTimeline.includes("Open Action Log Folder clicked") || !finalActionTimeline.includes("Copy Action Log Path clicked")) failures.push("action log diagnostics buttons did not persist USER_ACTION");
  if (!debugExportAudit.includes("===== User Action Timeline / 使用者操作時間線 =====") || !debugExportAudit.includes(actionLogPath) || debugExportAudit.includes("secret-value")) failures.push("Save Debug Log merge/masking audit failed");

  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:test-error-boundary"));`);
  await wait(180);
  const errorBoundaryAudit = await window.webContents.executeJavaScript(`(() => {
    const fallback = document.querySelector("[data-testid='app-error-boundary']");
    const reference = document.querySelector("[data-testid='error-incident-id']")?.textContent || "";
    const body = document.body.innerText || "";
    return {
      fallback: Boolean(fallback),
      incident: /renderer-\\d+-[a-z0-9-]+/i.test(reference),
      notBlank: body.length > 100,
      noSecret: !body.includes("ui-smoke-secret"),
      hasRecovery: body.includes("Reload application") && body.includes("Return to Dashboard") && body.includes("Open logs folder")
    };
  })()`);
  await wait(100);
  const rendererDiagnosticPath = persistentDiagnostics.fileFor("renderer");
  const rendererDiagnosticText = fs.existsSync(rendererDiagnosticPath) ? fs.readFileSync(rendererDiagnosticPath, "utf8") : "";
  if (!errorBoundaryAudit.fallback || !errorBoundaryAudit.incident || !errorBoundaryAudit.notBlank || !errorBoundaryAudit.noSecret || !errorBoundaryAudit.hasRecovery || !rendererDiagnosticText.includes("react_error_boundary") || rendererDiagnosticText.includes("ui-smoke-secret")) {
    failures.push(`Error Boundary/persistent renderer diagnostic audit failed ${JSON.stringify({ errorBoundaryAudit, rendererDiagnosticPath })}`);
  }

  try { fs.rmSync(smokeStaging.dir, { recursive: true, force: true }); } catch { /* UI smoke cleanup is best effort. */ }

  const uiSmokeLogPath = path.join(ensureDir(getAppLogsDir()), `ui-smoke-${fileTimestamp()}.log`);
  if (failures.length > 0) {
    console.error("[electron ui smoke failed]");
    appendRuntimeLog(uiSmokeLogPath, "ERROR", `Electron UI smoke failed: ${failures.length} failure(s)`);
    for (const failure of failures) {
      console.error(failure);
      appendRuntimeLog(uiSmokeLogPath, "ERROR", failure);
    }
    app.exit(1);
    return;
  }

  const successMessage = `Electron UI smoke passed: routes=${uiRoutes.length}, viewports=${uiViewports.length}, screenshots=${shouldCaptureUi ? captureDir : "disabled"}`;
  appendRuntimeLog(uiSmokeLogPath, "INFO", successMessage);
  console.log(`[electron ui smoke passed] routes=${uiRoutes.length}, viewports=${uiViewports.length}, screenshots=${shouldCaptureUi ? captureDir : "disabled"}`);
  app.exit(0);
}

let persistedRendererConsoleMessages = 0;
let postRendererStartupStarted = false;

function startPostRendererStartup() {
  if (postRendererStartupStarted) return;
  postRendererStartupStarted = true;
  setImmediate(() => {
    try {
      const cleanup = cleanupExpiredStaging(ensureDir(getFullFetchStagingDir()));
      console.log("[full-fetch-staging cleanup]", cleanup);
      const stagingRoot = ensureDir(getFullFetchStagingDir());
      recoverStaleStaging(stagingRoot);
      latestFullFetchStaging = listStagingRuns(stagingRoot, getLegacyFullFetchStagingDir()).find((run) => !run.state.legacyReadOnly) ?? null;
    } catch (error) {
      console.error("[full-fetch-staging startup scan failed]", error);
    }
    const envState = ensureProbeEnv();
    console.log(envState.status === "created" ? "[env] Default env file created" : "[env] Env file loaded", envState.envPath);
    void startBackgroundChecks().catch((error) => {
      persistentDiagnostics.write("main", "startup-background-check-failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 680,
    title: `Jira Activity Analyzer v${app.getVersion()}`,
    backgroundColor: "#f6f9fd",
    show: !isUiSmoke,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error("[renderer did-fail-load]", { errorCode, errorDescription, validatedURL });
    persistentDiagnostics.write("main", "did-fail-load", { errorCode, errorDescription, validatedURL, isMainFrame, currentRoute: window.webContents.getURL() });
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer render-process-gone]", details);
    persistentDiagnostics.write("main", "render-process-gone", { reason: details.reason, exitCode: details.exitCode, processType: "renderer", currentRoute: window.webContents.getURL() });
    crashDiagnostic("render-process-gone", { reason: details.reason, exitCode: details.exitCode, processType: "renderer", currentRoute: window.webContents.getURL() });
  });

  window.on("unresponsive", () => {
    console.error("[window unresponsive]");
    persistentDiagnostics.write("main", "unresponsive", { processType: "renderer", currentRoute: window.webContents.getURL() });
    crashDiagnostic("window-unresponsive", { processType: "renderer", currentRoute: window.webContents.getURL() });
  });

  window.on("responsive", () => {
    console.log("[window responsive]");
    persistentDiagnostics.write("main", "responsive", { processType: "renderer", currentRoute: window.webContents.getURL() });
  });

  window.webContents.on("console-message", (details) => {
    const message = maskDiagnosticText(details.message).slice(0, 2000);
    const sourceId = maskDiagnosticText(details.sourceId).slice(0, 500);
    console.log("[renderer console-message]", { level: details.level, message, line: details.lineNumber, sourceId });
    if (persistedRendererConsoleMessages < 500) {
      persistedRendererConsoleMessages += 1;
      persistentDiagnostics.write("renderer", "console-message", {
        level: details.level,
        message,
        line: details.lineNumber,
        sourceId
      });
    }
  });

  startupMilestones.mark("BrowserWindow Created");
  window.webContents.on("dom-ready", () => startupMilestones.mark("Renderer DOM Ready"));

  window.webContents.on("did-finish-load", () => {
    console.log("[renderer did-finish-load]", window.webContents.getURL());
    startupMilestones.mark("Initial Route Ready", window.webContents.getURL());
    persistentDiagnostics.write("main", "did-finish-load", { currentRoute: window.webContents.getURL() });
    startPostRendererStartup();
    if (isUiSmoke) {
      void runUiSmoke(window).catch((error) => {
        console.error("[electron ui smoke error]", error);
        app.exit(1);
      });
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const isDevUrl = devServerUrl && url.startsWith(devServerUrl);
    const isAppFile = url.startsWith("file://");
    if (!isDevUrl && !isAppFile) {
      event.preventDefault();
    }
  });

  if (devServerUrl) {
    console.log("[electron] loading dev renderer", devServerUrl);
    void window.loadURL(devServerUrl).catch((error) => {
      console.error("[electron loadURL failed]", error);
    });
    if (!isUiSmoke) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const rendererEntry = getRendererEntry();
    console.log("[electron] loading packaged renderer", rendererEntry);
    void window.loadFile(rendererEntry).catch((error) => {
      console.error("[electron loadFile failed]", { rendererEntry, error });
    });
    if (shouldOpenDevTools) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  }
}

process.on("uncaughtException", (error) => {
  console.error("[main uncaughtException]", error);
  persistentDiagnostics.write("main", "uncaughtException", { processType: "main", error });
  crashDiagnostic("uncaughtException", { processType: "main", error: error.stack ?? error.message });
});

process.on("unhandledRejection", (reason) => {
  console.error("[main unhandledRejection]", reason);
  persistentDiagnostics.write("main", "unhandledRejection", { processType: "main", reason });
  crashDiagnostic("unhandledRejection", { processType: "main", error: reason instanceof Error ? reason.stack ?? reason.message : String(reason) });
});

app.on("render-process-gone", (_event, webContents, details) => {
  persistentDiagnostics.write("main", "app-render-process-gone", { processType: "renderer", reason: details.reason, exitCode: details.exitCode, currentRoute: webContents.getURL() });
  crashDiagnostic("app-render-process-gone", { processType: "renderer", reason: details.reason, exitCode: details.exitCode, currentRoute: webContents.getURL() });
});

app.on("child-process-gone", (_event, details) => {
  persistentDiagnostics.write("main", "child-process-gone", { processType: details.type, reason: details.reason, exitCode: details.exitCode, serviceName: details.serviceName });
  crashDiagnostic("child-process-gone", { processType: details.type, reason: details.reason, exitCode: details.exitCode, serviceName: details.serviceName });
});

app.on("before-quit", () => {
  void databaseViewerCoordinator.close();
  persistentDiagnostics.close("closed");
});

app.whenReady().then(() => {
  if (app.isPackaged || isUiSmoke) {
    Menu.setApplicationMenu(null);
  }


  if (shouldSimulateCrashDiagnostic) {
    setTimeout(() => {
      void Promise.reject(new Error("Simulated unhandled rejection for crash diagnostic verification"));
      setTimeout(() => app.quit(), 500);
    }, 100);
    return;
  }


  createMainWindow();


  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
