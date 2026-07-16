import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, getActivityStreamBaselinesDir, getAppLogsDir, getAppRuntimeDir, getBackupsDir, getConfigDir, getConfigPath, getConnectionsPath, getCrashLogsDir, getDatabaseDir, getDefaultEnvPath, getEnvPath, getExportsDir, getFullFetchLogsDir, getFullFetchRawRunsDir, getLogsDir, getProbeResultsDir, getRawDataDir } from "./appPaths.js";
import { baselineFileName, compareBaselineObservation, entryFingerprint as createEntryFingerprint, loadBaselineSnapshot, saveBaselineSnapshot, selectBaselineGuardOutcome, sha256, type ActivityStreamBaselineComparison, type ActivityStreamBaselineSnapshot, type BaselineObservation } from "./activityStreamBaseline.js";
import { buildUserActivityTimeline, timelineCsv, timelineEventSchema, type UserActivityTimelineBuild } from "./userActivityTimeline.js";
import { createJiraClient } from "./jira/jiraClient.js";
import { assertReadOnlyRequest, ReadOnlyViolationError } from "./jira/jiraReadOnlyGuard.js";
import { ensureExportFolders, saveExportJson } from "./export/exportService.js";
import { sanitizeExportData } from "./export/sanitizeExport.js";
import { runApiProbe } from "./jira/jiraProbeRunner.js";
import { sanitizeRawJson, sanitizeResponseText } from "./jira/safeJson.js";
import type { JiraHttpResult, ProbeRequest } from "./jira/jiraTypes.js";

declare const __MAIN_APP_VERSION__: string;
declare const __MAIN_BUILD_TIME__: string;
declare const __MAIN_GIT_COMMIT__: string;
declare const __MAIN_GIT_BRANCH__: string;

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === "1";
const isUiSmoke = process.env.ELECTRON_UI_SMOKE === "1";
const shouldCaptureUi = process.env.ELECTRON_UI_CAPTURE === "1";
const shouldSimulateCrashDiagnostic = process.env.JAA_SIMULATE_CRASH_DIAGNOSTIC === "1";
const captureDir = process.env.ELECTRON_UI_CAPTURE_DIR
  ? path.resolve(process.env.ELECTRON_UI_CAPTURE_DIR)
  : path.resolve(process.cwd(), "test-artifacts/screenshots");

type AutoSaveResultType = "activity_stream_run" | "precision_probe_run" | "manual_url_replay_run" | "maxresults_cap_test";
type AutoSavedRun = { runId: string; resultType: AutoSaveResultType; status: string; savedAt: string; filePath: string; folderPath: string; data: Record<string, unknown> };
const latestAutoSavedRuns = new Map<AutoSaveResultType, AutoSavedRun>();
const autoSavedRunHistory: AutoSavedRun[] = [];
const sessionStartTime = new Date().toISOString();
const sessionUserActions: Array<{ time: string; level: string; message: string; raw: string }> = [];
type BaselineGuardRetrySummary = { triggered: boolean; maxRetries: number; attempts: Array<{ attempt: number; runId: string; classification: string; parsedActivityCount: number; issueKeyCount: number; missingIssueKeyCount: number; missingEntryFingerprintCount: number }>; finalAcceptedRunId: string; finalClassification: string; baselineUpdated: boolean; retryRecovered: boolean };
type BaselineGuardSessionRecord = { time: string; runId: string; comparison: ActivityStreamBaselineComparison; retry: BaselineGuardRetrySummary; snapshot: ActivityStreamBaselineSnapshot };
const activityStreamBaselineGuardHistory: BaselineGuardSessionRecord[] = [];
let latestActivityStreamBaselineGuardRecord: BaselineGuardSessionRecord | null = null;
let latestUserActivityTimeline: (UserActivityTimelineBuild & { exportedFiles: { jsonPath: string; csvPath: string; summaryPath: string } }) | null = null;
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
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.setPath("userData", path.resolve(process.cwd(), "test-artifacts/electron-ui-profile"));
}

const uiRoutes = [
  { name: "dashboard", hash: "#/", title: "Dashboard" },
  { name: "connections", hash: "#/connections", title: "Connections" },
  { name: "import", hash: "#/import", title: "Import" },
  { name: "timeline", hash: "#/timeline", title: "Timeline" },
  { name: "analysis", hash: "#/analysis", title: "Analysis" },
  { name: "precision-probe", hash: "#/precision-probe", title: "Precision Probe" },
  { name: "jira-analysis", hash: "#/jira-analysis", title: "Jira Analysis" },
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

const defaultEnvText = `# Jira Activity Analyzer local configuration
# This file is created automatically when missing.
# Fill in your Jira Server/Data Center URL and Personal Access Token.
# Do not commit this file to Git.

JIRA_BASE_URL=https://jira.example.com:8443
JIRA_EMAIL=
JIRA_USERNAME=
JIRA_API_TOKEN=
JIRA_AUTH_TYPE=bearer
JIRA_API_VERSION=v2
JIRA_PROBE_DEFAULT_ISSUE=COPGEN1-138930
JIRA_PROBE_MOCK_MODE=false
JIRA_PROBE_LOG_LEVEL=DEBUG
`;

function parseEnvText(text: string) {
  const output: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    output[key] = value;
  }
  return output;
}

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
  runId: string;
  status: string;
  queueCount: number;
  currentIndex: number;
  currentIssueKey: string;
  lastCompletedIndex: number;
  lastCompletedIssueKey: string;
  success: number;
  failed: number;
  skipped: number;
  startedAtMs: number;
  autoLogPath: string;
  checkpointPath: string;
  lastLogs: string[];
  memory: FullFetchMemory;
  pauseRequested: boolean;
};

let activeFullFetch: ActiveFullFetchDiagnostics | null = null;

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
  return value
    .replace(/(Authorization\s*:\s*)(?!\[masked\])[^\r\n]+/gi, "$1[masked]")
    .replace(/((?:api[_ -]?)?token\s*[:=]\s*)(?!\[masked\])[^\s,;]+/gi, "$1[masked]");
}

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
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(sanitizeRawJson(data), null, 2), "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function crashDiagnostic(reason: string, details: Record<string, unknown> = {}) {
  try {
    const crashDir = ensureDir(getCrashLogsDir());
    const crashPath = path.join(crashDir, `crash-${fileTimestamp()}.log`);
    const active = activeFullFetch;
    const payload = {
      timestamp: new Date().toISOString(),
      localTimestamp: formatLocalLogTimestamp(),
      appVersion: __MAIN_APP_VERSION__ || app.getVersion(),
      buildTime: __MAIN_BUILD_TIME__,
      gitCommit: __MAIN_GIT_COMMIT__,
      gitBranch: __MAIN_GIT_BRANCH__,
      reason,
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
        checkpointPath: active.checkpointPath
      } : null,
      lastDebugLogLines: active?.lastLogs ?? []
    };
    fs.writeFileSync(crashPath, maskDiagnosticText(JSON.stringify(payload, null, 2)), "utf8");
    if (active) {
      try {
        const existing = fs.existsSync(active.checkpointPath) ? JSON.parse(fs.readFileSync(active.checkpointPath, "utf8")) : {};
        writeJsonAtomic(active.checkpointPath, { ...existing, status: "crashed", lastUpdatedAt: new Date().toISOString(), crashPath, memory: active.memory });
      } catch (checkpointError) {
        console.error("[crash checkpoint update failed]", checkpointError);
      }
      appendRuntimeLog(active.autoLogPath, "ERROR", `Crash diagnostic written: ${crashPath}`);
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
  const envApiVersion = (env.JIRA_API_VERSION ?? "v2").toLowerCase();
  return {
    id,
    name,
    baseUrl: env.JIRA_BASE_URL ?? "",
    authType: ((env.JIRA_AUTH_TYPE ?? "bearer").toLowerCase() === "basic" ? "basic" : "bearer"),
    apiVersion: ["auto", "v2", "v3"].includes(envApiVersion) ? (envApiVersion as "auto" | "v2" | "v3") : "v2",
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
  const envConnection = connectionFromEnv(env);
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
      authType: (env.JIRA_AUTH_TYPE ?? "bearer").toLowerCase(),
      apiVersion: (env.JIRA_API_VERSION ?? "v2").toLowerCase(),
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
  fs.writeFileSync(defaultEnvPath, defaultEnvText, { encoding: "utf8", flag: "wx" });
  setCurrentEnvPath(defaultEnvPath);
  return {
    ...toProbeEnvConfig(parseEnvText(defaultEnvText), defaultEnvPath, "created"),
    paths
  };
}

ipcMain.handle("jira-probe:run", async (_event, request: ProbeRequest) => {
  if (!request || request.useMock) {
    throw new Error("Jira Probe IPC only runs real read-only API probes.");
  }
  return runApiProbe(request);
});

ipcMain.handle("connection:load-env", async () => loadConnectionState());

ipcMain.handle("connection:list", async () => loadConnectionState());

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
    return { canceled: true, state: loadConnectionState() };
  }
  const envPath = result.filePaths[0];
  setCurrentEnvPath(envPath);
  return { canceled: false, state: loadConnectionState() };
});

ipcMain.handle("connection:save", async (_event, connection: AppConnection) => {
  const current = readConnectionFile();
  const existing = current.connections.filter((item) => item.id !== connection.id);
  const sanitized: AppConnection = {
    ...connection,
    apiToken: undefined,
    tokenMasked: connection.tokenMasked || maskToken(connection.apiToken ?? ""),
    tokenSource: connection.tokenSource || "session"
  };
  const activeConnectionId = connection.active ? connection.id : current.activeConnectionId || connection.id;
  writeConnectionFile({ activeConnectionId, connections: [sanitized, ...existing] });
  return loadConnectionState();
});

ipcMain.handle("connection:set-active", async (_event, id: string) => {
  const current = readConnectionFile();
  writeConnectionFile({ activeConnectionId: id, connections: current.connections });
  return loadConnectionState();
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
    return {
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
  return {
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

function activityEntry(values: { entryId?: unknown; title?: unknown; author?: unknown; authorEmail?: unknown; time?: unknown; content?: unknown; link?: unknown; raw?: unknown; application?: unknown; objectType?: unknown; target?: unknown }, variant: string, runId: string, entryIndex: number): ActivityStreamEntry {
  const title = sanitizeResponseText(typeof values.title === "string" ? values.title : text(asRecord(values.title).value ?? asRecord(values.title).text ?? values.title));
  const authorRecord = asRecord(values.author);
  const author = sanitizeResponseText(typeof values.author === "string" ? values.author : text(authorRecord.name ?? authorRecord.displayName ?? authorRecord.email ?? authorRecord.username));
  const authorEmail = sanitizeResponseText(text(values.authorEmail ?? authorRecord.email));
  const time = text(values.time);
  const content = typeof values.content === "string" ? values.content : JSON.stringify(values.content ?? "");
  const link = typeof values.link === "string" ? values.link : JSON.stringify(values.link ?? "");
  const raw = typeof values.raw === "string" ? values.raw : JSON.stringify(values.raw ?? "");
  const combined = `${title} ${content} ${link} ${raw}`;
  const extractedIssueKeysPerEntry = issueKeysFrom(combined).sort();
  const applicationText = sanitizeResponseText(text(values.application));
  const activityApplication = /confluence/i.test(`${applicationText} ${raw}`) ? "Confluence" : extractedIssueKeysPerEntry.length > 0 || /jira/i.test(applicationText) ? "Jira" : "Other";
  const objectType = sanitizeResponseText(text(values.objectType)).slice(0, 300);
  const activityTypeClassifier = classifyActivityType({ title, rawTitle: title, application: activityApplication, objectType, combined });
  const entryFingerprint = createEntryFingerprint({ entryId: sanitizeResponseText(text(values.entryId)) === "-" ? "" : sanitizeResponseText(text(values.entryId)), source: "activity_stream", activityTime: time === "-" ? "" : time, activityAuthorEmail: authorEmail === "-" ? "" : authorEmail, activityTitle: title === "-" ? "" : title, issueKey: extractedIssueKeysPerEntry[0] ?? "", firstLinkHref: sanitizeResponseText(link) === "-" ? "" : sanitizeResponseText(link) });
  return {
    runId,
    issueKey: extractedIssueKeysPerEntry[0] ?? "",
    activityTitle: title === "-" ? "" : title.slice(0, 1000),
    activityAuthor: author === "-" ? "" : author.slice(0, 300),
    activityAuthorEmail: authorEmail === "-" ? "" : authorEmail.slice(0, 300),
    activityTime: time === "-" ? "" : time,
    activityType: activityTypeClassifier.finalType,
    activityTypeClassifier,
    source: variant === "manual_url" ? "manual_url" : "activity_stream",
    variant,
    extractedIssueKeysPerEntry,
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
    target: entry.target
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
  const parsedIssueKeys = Array.from(new Set(parsedFeed.entries.flatMap((entry) => entry.extractedIssueKeysPerEntry))).sort();
  const endpointUnavailable = response.status === 403 || response.status === 404;
  const blocked = /blocked|read.only|guard/i.test(`${response.errorType ?? ""} ${response.message ?? ""}`);
  const parsedEntries = parsedFeed.entries.filter((entry) => Boolean(entry.activityTitle || entry.activityAuthor || entry.activityTime || entry.activityType !== "unknown"));
  const skippedEntries = parsedFeed.entries.map((entry, entryIndex) => ({ entry, entryIndex })).filter(({ entry }) => !parsedEntries.includes(entry));
  const entriesWithIssueKey = parsedEntries.filter((entry) => entry.extractedIssueKeysPerEntry.length > 0);
  const entriesWithoutIssueKey = parsedEntries.filter((entry) => entry.extractedIssueKeysPerEntry.length === 0);
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
    parserDiagnostics: best?.parserDiagnostics ?? { atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0, entriesWithIssueKeyCount: 0, confluenceOnlyEntryCount: 0, entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0, entriesWithMultipleIssueKeysCount: 0, parserErrorCount: 0, parserErrorsSanitized: [], skippedEntriesSanitized: [], parserAnomaly: false, parserAnomalyReason: "" },
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
  const issueKeys = Array.from(new Set(entries.flatMap((entry) => entry.extractedIssueKeysPerEntry))).sort();
  const withIssueKey = entries.filter((entry) => entry.extractedIssueKeysPerEntry.length > 0);
  const withoutIssueKey = entries.filter((entry) => entry.extractedIssueKeysPerEntry.length === 0);
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
  return { runId, startedAt, completedAt: new Date().toISOString(), activityStream, dateSemantics, dateQueryResults, maxResultsDiagnostics, dateRangeChunking, activityStreamChunkResults, chunkMergeStats, clientDateFilteredEntriesSanitized, standardActivityStreamFlow, advancedDiagnosticsUsed: !standardFlow, activityTypeClassifierDiagnostics: activityStream.activityTypeClassifierDiagnostics, logs };
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

ipcMain.handle("user-analysis:build-activity-timeline", async (_event, payload: { connection: AppConnection; selectedUser: string; startDate: string; endDate: string; projectScope?: string }) => {
  const selectedUser = String(payload.selectedUser || "").trim();
  if (!selectedUser || !payload.startDate || !payload.endDate) throw new Error("Please select a user and date range first. / 請先選擇使用者與日期範圍。");
  const timelineRunId = `tlrun-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const sourceRunId = `asrun-${Date.now()}-timeline`;
  const run = await runActivityStreamProbe(payload.connection, [selectedUser], "", "auto", payload.startDate, payload.endDate, 500, true, sourceRunId, "update_date_after_before", "quick", false, "auto", 14, true, false);
  const guardedRun = run as unknown as { baselineComparison: ActivityStreamBaselineComparison; baselineGuardRetry: BaselineGuardRetrySummary; baselineSnapshot: ActivityStreamBaselineSnapshot };
  const comparison = guardedRun.baselineComparison;
  const retry = guardedRun.baselineGuardRetry;
  const entries = run.activityStream.entriesSanitized;
  const builtAt = new Date().toISOString();
  const timeline = buildUserActivityTimeline({
    timelineRunId,
    builtAt,
    selectedUser,
    dateRange: { start: payload.startDate, end: payload.endDate },
    projectScope: String(payload.projectScope || ""),
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
  const integrityLogs = timeline.summary.integrity.warnings.map((warning) => `[WARN] ${warning}`);
  return { ...timeline, exportedFiles: { jsonPath, csvPath, summaryPath }, activityStream: run.activityStream, standardActivityStreamFlow: run.standardActivityStreamFlow, logs: [...run.logs, `[INFO] User Activity Timeline built: timelineRunId=${timelineRunId} totalEvents=${timeline.summary.totalEvents}`, `[INFO] Timeline integrity: source=${timeline.summary.integrity.sourceParsedActivityCount} events=${timeline.summary.integrity.timelineEventCount} dedup=${timeline.summary.integrity.deduplicatedEntryCount} skipped=${timeline.summary.integrity.skippedEntryCount} unexplained=${timeline.summary.eventCountReconciliation.unexplainedDifferenceCount}`, ...integrityLogs, `[INFO] Timeline JSON auto-saved: ${jsonPath}`, `[INFO] Timeline CSV auto-saved: ${csvPath}`, "[INFO] No database write performed", "[INFO] No Jira write performed"] };
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

function buildFullFetchReport(issueKey: string, candidate: Record<string, unknown>, result: Record<string, unknown>, startedAt: number, status: "success" | "failed", error = "") {
  const issue = asRecord(result.issue);
  const fields = asRecord(issue.fields);
  const histories = Array.isArray(result.changelogHistories) ? result.changelogHistories as Record<string, unknown>[] : [];
  const comments = Array.isArray(result.comments) ? result.comments as Record<string, unknown>[] : [];
  const attachments = Array.isArray(result.attachments) ? result.attachments as Record<string, unknown>[] : [];
  const links = Array.isArray(result.links) ? result.links as Record<string, unknown>[] : [];
  const parsedUsers = Array.isArray(result.parsedUsers) ? result.parsedUsers as string[] : [];
  const estimatedEvents = 1 + countChangeItems(histories) + comments.length + attachments.length + links.length;
  return {
    issueKey,
    summary: text(fields.summary ?? candidate.summary),
    status: text(asRecord(fields.status).name ?? candidate.status),
    fetchStatus: status,
    httpStatus: text(result.httpStatus ?? "-"),
    changelogHistories: histories.length,
    changelogItems: countChangeItems(histories),
    comments: comments.length,
    attachmentsMetadata: attachments.length,
    issueLinks: links.length,
    parsedUsers: parsedUsers.length,
    estimatedEvents,
    duration: `${Date.now() - startedAt}ms`,
    error,
    lastFetchedAt: formatLocalDateTime()
  };
}

ipcMain.handle("user-analysis:full-fetch", async (event, payload: {
  connection: AppConnection;
  fetchQueue: Record<string, unknown>[];
  fetchLimit: number;
  batchSize?: number | "all";
  rawDataMode?: "summary_only" | "auto_save_raw_per_issue" | "full_raw_in_memory";
}) => {
  const connection = payload.connection;
  const apiPrefix = connection.apiVersion === "v3" ? "/rest/api/3" : "/rest/api/2";
  const fetchQueue = Array.isArray(payload.fetchQueue) ? payload.fetchQueue : [];
  const runId = `full-fetch-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const runStartedMs = Date.now();
  const batchSize = payload.batchSize === "all" ? Math.max(fetchQueue.length, 1) : Math.max(1, Number(payload.batchSize ?? 10));
  const rawDataMode = payload.rawDataMode ?? "auto_save_raw_per_issue";
  const runStamp = fileTimestamp();
  const fullFetchLogDir = ensureDir(getFullFetchLogsDir());
  const autoLogPath = path.join(fullFetchLogDir, `full-fetch-${runStamp}.log`);
  const checkpointPath = path.join(fullFetchLogDir, `full-fetch-${runStamp}.checkpoint.json`);
  const rawIssuesDir = rawDataMode === "auto_save_raw_per_issue"
    ? ensureDir(path.join(getFullFetchRawRunsDir(), `full-fetch-run-${runStamp}`, "issues"))
    : "";
  fs.writeFileSync(autoLogPath, "", "utf8");
  const logs: string[] = [];
  let rawDataEstimateBytes = 0;
  let peakRssMB = 0;
  let peakHeapUsedMB = 0;
  let peakRawDataEstimateMB = 0;
  const issueStatus: Record<string, unknown>[] = [];
  const rawManifest: Record<string, unknown>[] = [];
  activeFullFetch = {
    runId,
    status: "running",
    queueCount: fetchQueue.length,
    currentIndex: 0,
    currentIssueKey: "",
    lastCompletedIndex: 0,
    lastCompletedIssueKey: "",
    success: 0,
    failed: 0,
    skipped: 0,
    startedAtMs: runStartedMs,
    autoLogPath,
    checkpointPath,
    lastLogs: [],
    memory: memorySnapshot(),
    pauseRequested: false
  };
  const log = (level: string, message: string) => {
    const rendererLine = `[${level}] ${maskDiagnosticText(message)}`;
    logs.push(rendererLine);
    appendRuntimeLog(autoLogPath, level, message);
    event.sender.send("user-analysis:full-fetch-log", rendererLine);
  };
  const updateMemory = (context: string) => {
    const memory = memorySnapshot(rawDataEstimateBytes);
    if (activeFullFetch) activeFullFetch.memory = memory;
    peakRssMB = Math.max(peakRssMB, memory.rssMB);
    peakHeapUsedMB = Math.max(peakHeapUsedMB, memory.heapUsedMB);
    peakRawDataEstimateMB = Math.max(peakRawDataEstimateMB, memory.rawDataEstimateMB);
    log("MEMORY", `${context} rss=${memory.rssMB}MB heapUsed=${memory.heapUsedMB}MB heapTotal=${memory.heapTotalMB}MB external=${memory.externalMB}MB systemFree=${memory.systemFreeMB}MB rawEstimate=${memory.rawDataEstimateMB}MB`);
    return memory;
  };
  const progressPayload = () => {
    const active = activeFullFetch!;
    const elapsedMs = Date.now() - active.startedAtMs;
    const completed = active.success + active.failed + active.skipped;
    const averageMsPerIssue = completed > 0 ? Math.round(elapsedMs / completed) : 0;
    return {
      runId,
      status: active.status,
      total: active.queueCount,
      currentIndex: active.currentIndex,
      currentIssueKey: active.currentIssueKey,
      lastCompletedIndex: active.lastCompletedIndex,
      lastCompletedIssueKey: active.lastCompletedIssueKey,
      success: active.success,
      failed: active.failed,
      skipped: active.skipped,
      elapsedMs,
      averageMsPerIssue,
      estimatedRemainingMs: averageMsPerIssue * Math.max(0, active.queueCount - completed),
      batchSize,
      currentBatch: Math.min(Math.ceil(Math.max(active.currentIndex, 1) / batchSize), Math.max(1, Math.ceil(active.queueCount / batchSize))),
      totalBatches: Math.max(1, Math.ceil(active.queueCount / batchSize)),
      rawDataMode,
      memory: active.memory,
      autoLogPath,
      checkpointPath,
      issueStatus: issueStatus.map((item) => ({ ...item }))
    };
  };
  const updateCheckpoint = (status = activeFullFetch?.status ?? "running") => {
    if (!activeFullFetch) return;
    activeFullFetch.status = status;
    const progress = progressPayload();
    writeJsonAtomic(checkpointPath, {
      version: app.getVersion(),
      startedAt,
      lastUpdatedAt: new Date().toISOString(),
      queueCount: fetchQueue.length,
      ...progress,
      autoLogPath,
      checkpointPath,
      memory: activeFullFetch.memory,
      issueStatus
    });
    event.sender.send("user-analysis:full-fetch-progress", progress);
    log("INFO", `Checkpoint updated: status=${status} current=${progress.currentIndex}/${progress.total} lastCompleted=${progress.lastCompletedIndex}`);
  };
  log("INFO", "Full Fetch started");
  log("INFO", `Run ID: ${runId}`);
  log("INFO", `Queue Count: ${fetchQueue.length}`);
  log("INFO", `Batch Size: ${batchSize}`);
  log("INFO", `Raw Data Mode: ${rawDataMode}`);
  log("INFO", `Auto Log Path: ${autoLogPath}`);
  log("INFO", `Checkpoint Path: ${checkpointPath}`);
  log("USER_ACTION", `Full Fetch execution started: queueCount=${fetchQueue.length} batchSize=${batchSize} rawDataMode=${rawDataMode}`);
  log("INFO", "Data Source Mode: Live Jira API");
  log("INFO", `API Version: ${connection.apiVersion === "v3" ? "Jira Cloud v3" : "Jira Server/Data Center v2"}`);
  log("INFO", `Auth Type: ${connection.authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"}`);
  log("INFO", "Authorization: [masked]");
  log("INFO", "Execution Mode: Sequential read-only fetch");
  log("INFO", "No database write will be performed");
  log("INFO", "No Jira write will be performed");
  log("INFO", "No attachment file download will be performed");
  updateMemory("Full Fetch started");
  updateCheckpoint("running");
  const client = createJiraClient({
    baseUrl: connection.baseUrl,
    email: connection.email || connection.username,
    apiToken: connection.apiToken ?? "",
    authType: connection.authType
  });

  const report: Record<string, unknown>[] = [];
  const issueResults: Record<string, unknown>[] = [];
  const rawIssueResponsesSanitized: unknown[] = [];
  const rawCommentResponsesSanitized: unknown[] = [];
  const endpointMetadata: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let queueIndex = 0; queueIndex < fetchQueue.length; queueIndex += 1) {
    const candidate = fetchQueue[queueIndex];
    const issueKey = text(candidate.key).toUpperCase();
    const issueStarted = Date.now();
    if (activeFullFetch) {
      activeFullFetch.currentIndex = queueIndex + 1;
      activeFullFetch.currentIssueKey = issueKey;
    }
    issueStatus.push({ index: queueIndex + 1, issueKey, status: "running", startedAt: new Date().toISOString() });
    log("PROGRESS", `${queueIndex + 1}/${fetchQueue.length} started: ${issueKey}`);
    log("INFO", `Full Fetch issue started: ${issueKey}`);
    updateMemory(`before issue ${issueKey}`);
    updateCheckpoint("running");
    const issuePath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names,schema,renderedFields,changelog`;
    log("DEBUG", `GET ${apiPrefix}/issue/${issueKey}?fields=*all&expand=names,schema,renderedFields,changelog`);
    const issue = await client.get(issuePath);
    endpointMetadata.push({ issueKey, endpoint: `${apiPrefix}/issue/${issueKey}`, method: "GET", status: issue.status, contentType: issue.contentType });
    const initialRawIssue = { issueKey, endpoint: "issue", status: issue.status, json: sanitizeRawJson(issue.json), bodyPreview: issue.bodyPreview };
    rawDataEstimateBytes += Buffer.byteLength(JSON.stringify(initialRawIssue), "utf8");
    if (rawDataMode === "full_raw_in_memory") rawIssueResponsesSanitized.push(initialRawIssue);
    if (!issue.ok) {
      const message = `HTTP ${issue.status} ${issue.message ?? issue.errorType ?? ""}`.trim();
      log("ERROR", `Full Fetch issue failed: ${issueKey} ${message}`);
      log("INFO", "Continue with next issue");
      errors.push(`${issueKey}: ${message}`);
      const failedResult = { issue: {}, httpStatus: issue.status, changelogHistories: [], comments: [], attachments: [], links: [], parsedUsers: [] };
      report.push(buildFullFetchReport(issueKey, candidate, failedResult, issueStarted, "failed", message));
      issueResults.push({ issueKey, fetchStatus: "failed", error: message });
      if (activeFullFetch) {
        activeFullFetch.failed += 1;
        activeFullFetch.lastCompletedIndex = queueIndex + 1;
        activeFullFetch.lastCompletedIssueKey = issueKey;
      }
      issueStatus[issueStatus.length - 1] = { index: queueIndex + 1, issueKey, status: "failed", durationMs: Date.now() - issueStarted, error: message };
      if (rawDataMode !== "full_raw_in_memory") rawDataEstimateBytes = 0;
      updateMemory(`after failed issue ${issueKey}`);
      updateCheckpoint("running");
      if ((queueIndex + 1) % batchSize === 0 || queueIndex + 1 === fetchQueue.length) {
        const batchNumber = Math.ceil((queueIndex + 1) / batchSize);
        log("BATCH", `${batchNumber}/${Math.max(1, Math.ceil(fetchQueue.length / batchSize))} completed: success=${activeFullFetch?.success ?? 0} failed=${activeFullFetch?.failed ?? 0} skipped=${activeFullFetch?.skipped ?? 0}`);
        updateMemory(`after batch ${batchNumber}`);
        updateCheckpoint("running");
      }
      if (activeFullFetch?.pauseRequested) {
        log("INFO", `Paused after current failed issue: ${issueKey}`);
        updateCheckpoint("paused");
        break;
      }
      continue;
    }

    const issueJson = asRecord(issue.json);
    const fields = asRecord(issueJson.fields);
    let changelogRoot = asRecord(issueJson.changelog);
    let changelogHistories = Array.isArray(changelogRoot.histories) ? changelogRoot.histories as Record<string, unknown>[] : [];
    if (changelogHistories.length === 0) {
      const changelogPath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}?expand=changelog`;
      log("DEBUG", `GET ${apiPrefix}/issue/${issueKey}?expand=changelog`);
      const changelogResponse = await client.get(changelogPath);
      endpointMetadata.push({ issueKey, endpoint: `${apiPrefix}/issue/${issueKey}?expand=changelog`, method: "GET", status: changelogResponse.status, contentType: changelogResponse.contentType });
      if (changelogResponse.ok) {
        const changelogJson = asRecord(changelogResponse.json);
        changelogRoot = asRecord(changelogJson.changelog);
        changelogHistories = Array.isArray(changelogRoot.histories) ? changelogRoot.histories as Record<string, unknown>[] : [];
        const fallbackRaw = { issueKey, endpoint: "issue-changelog-fallback", status: changelogResponse.status, json: sanitizeRawJson(changelogResponse.json), bodyPreview: changelogResponse.bodyPreview };
        rawDataEstimateBytes += Buffer.byteLength(JSON.stringify(fallbackRaw), "utf8");
        if (rawDataMode === "full_raw_in_memory") rawIssueResponsesSanitized.push(fallbackRaw);
      } else {
        const message = `Changelog fallback failed for ${issueKey}: HTTP ${changelogResponse.status} ${changelogResponse.message ?? changelogResponse.errorType ?? ""}`.trim();
        warnings.push(message);
        log("WARN", message);
      }
    }
    const comments: Record<string, unknown>[] = [];
    let commentsStartAt = 0;
    const commentMax = 100;
    const commentSafetyLimit = 1000;
    while (commentsStartAt < commentSafetyLimit) {
      log("DEBUG", `GET ${apiPrefix}/issue/${issueKey}/comment?startAt=${commentsStartAt}&maxResults=${commentMax}`);
      const commentsResponse = await client.get(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?startAt=${commentsStartAt}&maxResults=${commentMax}`);
      endpointMetadata.push({ issueKey, endpoint: `${apiPrefix}/issue/${issueKey}/comment`, method: "GET", startAt: commentsStartAt, maxResults: commentMax, status: commentsResponse.status, contentType: commentsResponse.contentType });
      const commentRaw = { issueKey, startAt: commentsStartAt, status: commentsResponse.status, json: sanitizeRawJson(commentsResponse.json), bodyPreview: commentsResponse.bodyPreview };
      rawDataEstimateBytes += Buffer.byteLength(JSON.stringify(commentRaw), "utf8");
      if (rawDataMode === "full_raw_in_memory") rawCommentResponsesSanitized.push(commentRaw);
      if (!commentsResponse.ok) {
        const message = `Comments pagination failed for ${issueKey}: HTTP ${commentsResponse.status} ${commentsResponse.message ?? commentsResponse.errorType ?? ""}`.trim();
        warnings.push(message);
        log("WARN", message);
        break;
      }
      const commentJson = asRecord(commentsResponse.json);
      const pageComments = Array.isArray(commentJson.comments) ? commentJson.comments as Record<string, unknown>[] : [];
      comments.push(...pageComments);
      const total = Number(commentJson.total ?? pageComments.length) || pageComments.length;
      commentsStartAt += pageComments.length;
      if (pageComments.length === 0 || commentsStartAt >= total) break;
    }

    const attachments = Array.isArray(fields.attachment) ? fields.attachment as Record<string, unknown>[] : [];
    const links = Array.isArray(fields.issuelinks) ? fields.issuelinks as Record<string, unknown>[] : [];
    const changeItems = countChangeItems(changelogHistories);
    const parsedUsers = uniqueUserNames([
      fields.assignee,
      fields.reporter,
      fields.creator,
      ...changelogHistories.map((history) => asRecord(history).author),
      ...comments.map((comment) => asRecord(comment).author),
      ...attachments.map((attachment) => asRecord(attachment).author)
    ]);
    const result = {
      issueKey,
      fetchStatus: "success",
      httpStatus: issue.status,
      issue: issueJson,
      changelogHistories,
      comments,
      attachments,
      links,
      parsedUsers,
      estimatedEvents: 1 + changeItems + comments.length + attachments.length + links.length
    };
    log("INFO", `Issue full fields parsed: ${Object.keys(fields).length}`);
    log("INFO", `Changelog parsed: ${changelogHistories.length} histories / ${changeItems} items`);
    log("INFO", `Comments parsed: ${comments.length}`);
    log("INFO", `Attachments parsed: ${attachments.length} metadata only`);
    log("INFO", "No attachment file download performed");
    log("INFO", `Issue links parsed: ${links.length}`);
    log("INFO", `Parsed users: ${parsedUsers.length}`);
    log("INFO", `Estimated activity events: ${result.estimatedEvents}`);
    const reportRow = buildFullFetchReport(issueKey, candidate, result, issueStarted, "success");
    report.push(reportRow);
    const resultSummary = { ...reportRow, rawFilePath: "" };
    if (rawDataMode === "auto_save_raw_per_issue") {
      const rawFilePath = path.join(rawIssuesDir, `${issueKey.replace(/[^A-Z0-9_-]/g, "_")}.raw.json`);
      writeJsonAtomic(rawFilePath, { issue: initialRawIssue, result: sanitizeRawJson(result), endpointMetadata: endpointMetadata.filter((item) => item.issueKey === issueKey) });
      resultSummary.rawFilePath = rawFilePath;
      rawManifest.push({ issueKey, rawFilePath });
      log("INFO", `Raw data saved per issue: ${rawFilePath}`);
    }
    if (rawDataMode !== "full_raw_in_memory") rawDataEstimateBytes = 0;
    issueResults.push(resultSummary);
    if (activeFullFetch) {
      activeFullFetch.success += 1;
      activeFullFetch.lastCompletedIndex = queueIndex + 1;
      activeFullFetch.lastCompletedIssueKey = issueKey;
    }
    const durationMs = Date.now() - issueStarted;
    issueStatus[issueStatus.length - 1] = { index: queueIndex + 1, issueKey, status: "success", durationMs };
    const progress = progressPayload();
    log("PROGRESS", `${queueIndex + 1}/${fetchQueue.length} completed: ${issueKey} status=success duration=${durationMs}ms success=${progress.success} failed=${progress.failed} skipped=${progress.skipped} eta=${progress.estimatedRemainingMs}ms`);
    log("SUCCESS", `Full Fetch issue completed: ${issueKey}`);
    if ((queueIndex + 1) % 5 === 0 || rawDataEstimateBytes > 50 * 1024 * 1024) updateMemory(`after issue ${issueKey}`);
    updateCheckpoint("running");
    if ((queueIndex + 1) % batchSize === 0 || queueIndex + 1 === fetchQueue.length) {
      const batchNumber = Math.ceil((queueIndex + 1) / batchSize);
      log("BATCH", `${batchNumber}/${Math.max(1, Math.ceil(fetchQueue.length / batchSize))} completed: success=${activeFullFetch?.success ?? 0} failed=${activeFullFetch?.failed ?? 0} skipped=${activeFullFetch?.skipped ?? 0}`);
      updateMemory(`after batch ${batchNumber}`);
      updateCheckpoint("running");
    }
    if (activeFullFetch?.pauseRequested) {
      log("INFO", `Paused after current issue: ${issueKey}`);
      updateCheckpoint("paused");
      break;
    }
  }

  const success = activeFullFetch?.success ?? report.filter((item) => item.fetchStatus === "success").length;
  const failed = activeFullFetch?.failed ?? report.filter((item) => item.fetchStatus === "failed").length;
  const skipped = report.filter((item) => item.fetchStatus === "skipped").length;
  const paused = activeFullFetch?.status === "paused";
  const completedCount = success + failed + skipped;
  const summary = {
    totalIssues: fetchQueue.length,
    pending: Math.max(0, fetchQueue.length - completedCount),
    running: 0,
    success,
    failed,
    skipped,
    totalChangelogHistories: report.reduce((sum, item) => sum + Number(item.changelogHistories ?? 0), 0),
    totalChangelogItems: report.reduce((sum, item) => sum + Number(item.changelogItems ?? 0), 0),
    totalComments: report.reduce((sum, item) => sum + Number(item.comments ?? 0), 0),
    totalAttachmentsMetadata: report.reduce((sum, item) => sum + Number(item.attachmentsMetadata ?? 0), 0),
    totalIssueLinks: report.reduce((sum, item) => sum + Number(item.issueLinks ?? 0), 0),
    totalParsedUsers: report.reduce((sum, item) => sum + Number(item.parsedUsers ?? 0), 0),
    totalEstimatedEvents: report.reduce((sum, item) => sum + Number(item.estimatedEvents ?? 0), 0)
  };
  const status = paused ? "paused" : failed > 0 ? "completed_with_errors" : "completed";
  if (paused) {
    log("INFO", `Full Fetch paused: success=${success}, failed=${failed}, skipped=${skipped}`);
    updateCheckpoint("paused");
  } else {
    log("SUCCESS", `Full Fetch completed: success=${success}, failed=${failed}, skipped=${skipped}`);
    updateMemory("Full Fetch completed");
    updateCheckpoint("completed");
  }
  log("INFO", `Auto log saved: ${autoLogPath}`);
  log("INFO", `Checkpoint updated: status=${paused ? "paused" : "completed"}`);
  log("INFO", "No database write performed");
  const diagnostics = {
    autoLogPath,
    checkpointPath,
    batchSize,
    rawDataMode,
    rawIssuesDir,
    memorySummary: { peakRssMB, peakHeapUsedMB, peakRawDataEstimateMB },
    finalMemory: activeFullFetch?.memory ?? memorySnapshot(rawDataEstimateBytes),
    ...getActionLogDiagnostics()
  };
  const response = {
    ok: true,
    logs,
    run: {
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
      executionMode: "sequential",
      diagnostics
    },
    summary,
    fetchReport: report,
    issueResults,
    rawData: rawDataMode === "full_raw_in_memory" ? {
      exportType: "user-analysis-full-fetch-raw-data",
      rawDataMode,
      rawIssueResponsesSanitized,
      rawCommentResponsesSanitized,
      endpointMetadata
    } : rawDataMode === "auto_save_raw_per_issue" ? {
      exportType: "user-analysis-full-fetch-raw-data-manifest",
      rawDataMode,
      issues: rawManifest,
      endpointMetadata
    } : {
      exportType: "user-analysis-full-fetch-summary-only",
      rawDataMode,
      message: "Full raw responses were not retained in memory."
    },
    diagnostics,
    warnings,
    errors
  };
  activeFullFetch = null;
  return response;
});

ipcMain.handle("user-analysis:pause-full-fetch", async () => {
  if (!activeFullFetch || activeFullFetch.status !== "running") return { ok: false, message: "No Full Fetch is currently running." };
  activeFullFetch.pauseRequested = true;
  appendRuntimeLog(activeFullFetch.autoLogPath, "INFO", "Pause requested. Full Fetch will pause after the current issue.");
  return { ok: true, runId: activeFullFetch.runId };
});

ipcMain.handle("user-analysis:log-action", async (_event, payload: { category?: string; message?: string }) => {
  const allowedCategories = new Set(["USER_ACTION", "GUARD", "UI_MODAL", "INFO"]);
  const category = allowedCategories.has(text(payload?.category)) ? text(payload.category) : "USER_ACTION";
  const message = maskDiagnosticText(text(payload?.message)).slice(0, 2000);
  if (!message) return { ok: false, error: "Action message is required." };
  const appLogPath = path.join(ensureDir(getAppLogsDir()), `app-${dateStamp()}.log`);
  appendRuntimeLog(appLogPath, category, message);
  appendUserActionLog(category, message);
  if (activeFullFetch) appendRuntimeLog(activeFullFetch.autoLogPath, category, message);
  return { ok: true, appLogPath, ...getActionLogDiagnostics(), fullFetchLogPath: activeFullFetch?.autoLogPath ?? "" };
});

ipcMain.handle("user-analysis:action-log-diagnostics", async () => getActionLogDiagnostics());

ipcMain.handle("user-analysis:latest-full-fetch-checkpoint", async () => {
  const directory = ensureDir(getFullFetchLogsDir());
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".checkpoint.json"))
    .map((name) => ({ path: path.join(directory, name), modified: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
  if (files.length === 0) return { found: false };
  try {
    const checkpoint = JSON.parse(fs.readFileSync(files[0].path, "utf8")) as Record<string, unknown>;
    const status = text(checkpoint.status);
    return {
      found: true,
      unfinished: !["completed", "failed", "cancelled"].includes(status),
      checkpointPath: files[0].path,
      checkpoint: sanitizeRawJson(checkpoint)
    };
  } catch (error) {
    return { found: true, unfinished: false, checkpointPath: files[0].path, error: error instanceof Error ? error.message : String(error) };
  }
});

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

ipcMain.handle("user-analysis:open-export-folder", async (_event, payload?: { folderPath?: string }) => {
  const exportsRoot = path.resolve(getExportsDir());
  const folderPath = path.resolve(payload?.folderPath || path.join(exportsRoot, "user-analysis"));
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
  fs.writeFileSync(path.join(folderPath, fileName), `${JSON.stringify(sanitizeExportData(data), null, 2)}\n`, "utf8");
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

ipcMain.handle("debug-log:save-bundle", async (_event, payload: { debugLog: string; currentPage: string }) => {
  const createdAt = new Date().toISOString();
  const folderPath = ensureDir(path.join(getExportsDir(), "debug-bundles", `jira-activity-analyzer-debug-bundle-${fileTimestamp()}`));
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
  fs.writeFileSync(path.join(folderPath, "debug-log.txt"), debugContent, "utf8");
  fs.writeFileSync(path.join(folderPath, "user-action-log.txt"), `${maskDiagnosticText(actionLog).trimEnd()}\n`, "utf8");
  writeBundleJson(folderPath, "app-metadata.json", { name: "Jira Activity Analyzer", version: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, gitCommit: __MAIN_GIT_COMMIT__, gitBranch: __MAIN_GIT_BRANCH__, sessionStartTime, generatedAt: createdAt, currentPage: payload.currentPage });
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
    if (sourcePath !== exportsRoot && !sourcePath.startsWith(`${exportsRoot}${path.sep}`)) {
      autoSavedResultsMissing.push({ runId: run.runId, path: sourcePath, sourcePath, reason: "outside_exports_directory" });
      continue;
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      autoSavedResultsMissing.push({ runId: run.runId, path: sourcePath, sourcePath, reason: "file_not_found" });
      continue;
    }
    try {
      const body = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      const bundleFileName = path.basename(sourcePath);
      writeBundleJson(autoSavedResultsFolder, bundleFileName, body);
      autoSavedResultsIncluded.push({ ...summarize(run), sourcePath, bundlePath: `auto-saved-results/${bundleFileName}` });
    } catch (error) {
      autoSavedResultsMissing.push({ runId: run.runId, path: sourcePath, sourcePath, reason: `read_or_parse_failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  writeBundleJson(folderPath, "auto-saved-results-index.json", { included: autoSavedResultsIncluded, missing: autoSavedResultsMissing });
  const latestBaselineRecord = latestActivityStreamBaselineGuardRecord;
  const unavailableTimeline = { status: "not_available", message: "No User Activity Timeline has been built in this session." };
  writeBundleJson(folderPath, "user-activity-timeline.json", latestUserActivityTimeline ? { app: { version: __MAIN_APP_VERSION__, gitCommit: __MAIN_GIT_COMMIT__ }, timelineRunId: latestUserActivityTimeline.timelineRunId, summary: latestUserActivityTimeline.summary, events: latestUserActivityTimeline.events } : unavailableTimeline);
  fs.writeFileSync(path.join(folderPath, "user-activity-timeline.csv"), latestUserActivityTimeline ? timelineCsv(latestUserActivityTimeline.events) : "\uFEFFstatus,message\r\nnot_available,No User Activity Timeline has been built in this session.\r\n", "utf8");
  writeBundleJson(folderPath, "timeline-build-summary.json", latestUserActivityTimeline?.summary ?? unavailableTimeline);
  writeBundleJson(folderPath, "timeline-event-schema.json", timelineEventSchema);
  writeBundleJson(folderPath, "timeline-integrity-diagnostics.json", latestUserActivityTimeline?.summary.integrity ?? unavailableTimeline);
  writeBundleJson(folderPath, "timeline-dedup-diagnostics.json", latestUserActivityTimeline?.summary.dedupDiagnostics ?? unavailableTimeline);
  writeBundleJson(folderPath, "timeline-issue-key-diagnostics.json", latestUserActivityTimeline ? { sourceParsedIssueKeyCount: latestUserActivityTimeline.summary.integrity.sourceParsedIssueKeyCount, timelinePrimaryIssueKeyCount: latestUserActivityTimeline.summary.integrity.timelinePrimaryIssueKeyCount, timelineAllIssueKeyCount: latestUserActivityTimeline.summary.integrity.timelineAllIssueKeyCount, sourceIssueKeys: latestUserActivityTimeline.summary.integrity.sourceIssueKeys, timelinePrimaryIssueKeys: latestUserActivityTimeline.summary.integrity.timelinePrimaryIssueKeys, timelineAllIssueKeys: latestUserActivityTimeline.summary.integrity.timelineAllIssueKeys, missingIssueKeysFromTimeline: latestUserActivityTimeline.summary.integrity.missingIssueKeysFromTimeline, missingIssueKeysFromPrimaryTimeline: latestUserActivityTimeline.summary.integrity.missingIssueKeysFromPrimaryTimeline } : unavailableTimeline);
  const sessionTimeline = [
    ...sessionUserActions.map((action, index) => ({ time: action.time, source: "user_action", type: "user_action", sequence: index, action: action.message, page: payload.currentPage })),
    ...debugLogTimeline(payload.debugLog),
    ...autoSavedRunHistory.map((run, index) => ({ time: run.savedAt, source: "activity_run_history", type: "activity_stream_result", sequence: index, runId: run.runId, status: run.status, diagnosis: String(asRecord(run.data.activityStream).diagnosis ?? run.data.diagnosis ?? "unknown"), parsedActivityCount: Number(asRecord(run.data.activityStream).parsedActivityCount ?? run.data.parsedActivityCount ?? 0), autoSavedPath: run.filePath })),
    ...autoSavedCandidates.map((run, index) => ({ time: run.savedAt, source: "auto_save_path", type: "auto_save_path", sequence: index, runId: run.runId, path: run.filePath })),
    ...activityStreamBaselineGuardHistory.map((record, index) => ({ time: record.time, source: "activity_stream_baseline_guard", type: "activity_stream_baseline_guard", sequence: index, runId: record.runId, classification: record.comparison.classification, shouldRetry: record.comparison.shouldRetry, retryTriggered: record.retry.triggered })),
    ...(latestUserActivityTimeline ? [{ time: latestUserActivityTimeline.summary.builtAt, source: "user_analysis", type: "user_activity_timeline_built", sequence: 0, timelineRunId: latestUserActivityTimeline.timelineRunId, totalEvents: latestUserActivityTimeline.summary.totalEvents, issueKeyCount: latestUserActivityTimeline.summary.issueKeyCount }] : [])
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
  const userActivityTimeline = latestUserActivityTimeline ? { available: true, timelineRunId: latestUserActivityTimeline.timelineRunId, totalEvents: latestUserActivityTimeline.summary.totalEvents, issueKeyCount: latestUserActivityTimeline.summary.issueKeyCount, eventTypeCounts: latestUserActivityTimeline.summary.eventTypeCounts, confidenceCounts: latestUserActivityTimeline.summary.confidenceCounts, jsonPath: "user-activity-timeline.json", csvPath: "user-activity-timeline.csv" } : { available: false };
  const timelineIntegrity = latestUserActivityTimeline ? { available: true, sourceParsedActivityCount: latestUserActivityTimeline.summary.integrity.sourceParsedActivityCount, timelineEventCount: latestUserActivityTimeline.summary.integrity.timelineEventCount, difference: latestUserActivityTimeline.summary.eventCountReconciliation.difference, deduplicatedEntryCount: latestUserActivityTimeline.summary.integrity.deduplicatedEntryCount, skippedEntryCount: latestUserActivityTimeline.summary.integrity.skippedEntryCount, unexplainedDifferenceCount: latestUserActivityTimeline.summary.eventCountReconciliation.unexplainedDifferenceCount, sourceParsedIssueKeyCount: latestUserActivityTimeline.summary.integrity.sourceParsedIssueKeyCount, timelinePrimaryIssueKeyCount: latestUserActivityTimeline.summary.integrity.timelinePrimaryIssueKeyCount, timelineAllIssueKeyCount: latestUserActivityTimeline.summary.integrity.timelineAllIssueKeyCount, missingIssueKeysFromTimeline: latestUserActivityTimeline.summary.integrity.missingIssueKeysFromTimeline, missingIssueKeysFromPrimaryTimeline: latestUserActivityTimeline.summary.integrity.missingIssueKeysFromPrimaryTimeline } : { available: false };
  writeBundleJson(folderPath, "debug-bundle-summary.json", { generatedAt: createdAt, currentPage: payload.currentPage, latestRunResult: summarize(latestRunResult), lastSuccessfulResult: summarize(lastSuccessfulResult), lastParsedResult: summarize(lastParsedResult), latestNoEntriesResult: summarize(latestNoEntriesResult), runHistoryCount: runHistory.length, snapshotConsistent: !latestRunResult || runHistory.some((run) => run?.runId === latestRunResult?.runId), dateRangeChunking: latestChunkedRun?.data.dateRangeChunking ?? { enabled: false }, chunkMergeStats: latestChunkedRun?.data.chunkMergeStats ?? {}, standardActivityStreamFlow, activityTypeClassifierDiagnostics: classifierDiagnostics, activityStreamBaselineGuard, userActivityTimeline, timelineIntegrity, advancedDiagnosticsUsed, includedAutoSavedResults: autoSavedResultsIncluded, missingAutoSavedResults: autoSavedResultsMissing, fullSessionBundle: { enabled: true, sessionStartTime, bundleGeneratedAt: createdAt, totalUserActions: sessionUserActions.length, totalRuns: runHistory.length, totalAutoSavedResults: autoSavedCandidates.length, includedAutoSavedResultCount: autoSavedResultsIncluded.length, missingAutoSavedResultCount: autoSavedResultsMissing.length } });
  const bundleFiles: Partial<Record<AutoSaveResultType, string>> = { activity_stream_run: "latest-activity-stream-result.json", precision_probe_run: "latest-precision-probe-result.json", manual_url_replay_run: "latest-manual-url-replay-result.json", maxresults_cap_test: "latest-maxresults-cap-test.json" };
  for (const [resultType, fileName] of Object.entries(bundleFiles) as Array<[AutoSaveResultType, string]>) {
    const run = latestAutoSavedRuns.get(resultType);
    if (run) writeBundleJson(folderPath, fileName, run.data);
  }
  const included = fs.readdirSync(folderPath);
  const missing = (Object.entries(bundleFiles) as Array<[AutoSaveResultType, string]>).filter(([type]) => !latestAutoSavedRuns.has(type)).map(([, fileName]) => `${fileName}: not_run / no result available`);
  const trackingLines = (label: string, run: AutoSavedRun | null) => run ? [`${label}:`, `- runId: ${run.runId}`, `- status: ${run.status}`, `- diagnosis: ${String(asRecord(run.data.activityStream).diagnosis ?? "unknown")}`, `- parsedActivityCount: ${Number(asRecord(run.data.activityStream).parsedActivityCount ?? 0)}`, `- path: ${run.filePath}`] : [`${label}:`, "- not_available"];
  const chunking = asRecord(latestChunkedRun?.data.dateRangeChunking);
  const mergeStats = asRecord(latestChunkedRun?.data.chunkMergeStats);
  fs.writeFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Jira Activity Analyzer Debug Bundle", `Version: ${__MAIN_APP_VERSION__}`, `Build Time: ${__MAIN_BUILD_TIME__}`, `Git Commit: ${__MAIN_GIT_COMMIT__}`, `Session Start: ${sessionStartTime}`, `Generated At: ${createdAt}`, `Current Page: ${payload.currentPage}`, ...trackingLines("Latest Run Result", latestRunResult), ...trackingLines("Last Successful Result", lastSuccessfulResult), ...trackingLines("Last Parsed Result", lastParsedResult), ...trackingLines("Latest No Entries Result", latestNoEntriesResult), "Full Session Debug Bundle:", `- sessionStartTime: ${sessionStartTime}`, `- bundleGeneratedAt: ${createdAt}`, `- totalUserActions: ${sessionUserActions.length}`, `- totalRuns: ${runHistory.length}`, `- totalAutoSavedResults: ${autoSavedCandidates.length}`, `- includedAutoSavedResults: ${autoSavedResultsIncluded.length}`, `- missingAutoSavedResults: ${autoSavedResultsMissing.length}`, "Session Timeline:", "- file: session-timeline.json", "- combines user actions, renderer debug log, Activity Stream run history, and auto-save paths in chronological order.", "Auto-Saved Result Bodies:", "- Full sanitized JSON bodies are under auto-saved-results/.", ...autoSavedResultsIncluded.map((entry) => `- included: ${String(entry.runId)} -> ${String(entry.bundlePath)}`), ...autoSavedResultsMissing.map((entry) => `- missing: ${String(entry.runId)} -> ${String(entry.sourcePath)} (${String(entry.reason)})`), "Standard Activity Stream Flow:", `- selectedUser: ${String(standardActivityStreamFlow.selectedUser ?? "not_available")}`, `- queryUser: ${String(standardActivityStreamFlow.activityStreamQueryUser ?? "not_available")}`, `- variant: ${String(standardActivityStreamFlow.variant ?? "not_available")}`, `- dateQueryMode: ${String(standardActivityStreamFlow.dateQueryMode ?? "not_available")}`, `- chunkingMode: ${String(standardActivityStreamFlow.chunkingMode ?? "not_available")}`, `- perChunkMaxResults: ${Number(standardActivityStreamFlow.perChunkMaxResults ?? 0)}`, `- advancedOverrideUsed: ${Boolean(standardActivityStreamFlow.advancedOverrideUsed)}`, `- advancedDiagnosticsUsed: ${advancedDiagnosticsUsed}`, "Activity Type Classifier:", `- enabled: ${classifierDiagnostics.enabled !== false}`, `- rulesVersion: ${String(classifierDiagnostics.rulesVersion ?? "1.1")}`, `- correctedEntryCount: ${Number(classifierDiagnostics.correctedEntryCount ?? 0)}`, `- preservedEntryCount: ${Number(classifierDiagnostics.preservedEntryCount ?? 0)}`, `- inferredEntryCount: ${Number(classifierDiagnostics.inferredEntryCount ?? 0)}`, `- fallbackUnknownCount: ${Number(classifierDiagnostics.fallbackUnknownCount ?? 0)}`, `- commentPriorityHigherThanAttachment: ${classifierDiagnostics.commentPriorityHigherThanAttachment !== false}`, "Date Range Chunking:", `- enabled: ${Boolean(chunking.enabled)}`, `- mode: ${String(chunking.mode ?? "off")}`, `- chunkCount: ${Number(chunking.chunkCount ?? 0)}`, `- successfulChunks: ${Number(mergeStats.successfulChunks ?? 0)}`, `- failedChunks: ${Number(mergeStats.failedChunks ?? 0)}`, `- mergedActivityEntries: ${Number(mergeStats.mergedActivityEntries ?? 0)}`, "Included Files:", ...included.map((file) => `- ${file}`), "How to analyze:", "- Check debug-bundle-summary.json", "- Check session-timeline.json", "- Check auto-saved-results-index.json", "- Check auto-saved-results/", "- Check run-history.json", "- Check debug-log.txt", "- Check user-action-log.txt", "Security:", "- token / Authorization / cookie are masked or not included", "Known missing files:", ...(missing.length ? missing : ["- none"]), "Cross-page TODO:", ...crossPageDebugBundleTodo.map((item) => `- ${item}`)].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["", "Activity Stream Baseline Guard:", `- enabled: ${activityStreamBaselineGuard.enabled}`, `- latestClassification: ${activityStreamBaselineGuard.latestClassification}`, `- shouldRetry: ${activityStreamBaselineGuard.shouldRetry}`, `- retryTriggered: ${activityStreamBaselineGuard.retryTriggered}`, `- retryRecovered: ${activityStreamBaselineGuard.retryRecovered}`, `- baselinePath: ${activityStreamBaselineGuard.baselinePath || "not_available"}`, `- baselineBestParsedActivityCount: ${activityStreamBaselineGuard.baselineBestParsedActivityCount}`, `- currentParsedActivityCount: ${activityStreamBaselineGuard.currentParsedActivityCount}`, `- missingIssueKeys: ${latestBaselineRecord?.comparison.missingIssueKeys.join(", ") || "none"}`, `- missingEntryCount: ${activityStreamBaselineGuard.missingEntryFingerprintCount}`, "- files:", "  - activity-stream-baseline-comparison.json", "  - activity-stream-baseline-snapshot.json", "  - activity-stream-baseline-history.json", ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["User Activity Timeline:", `- timelineRunId: ${latestUserActivityTimeline?.timelineRunId ?? "not_available"}`, `- selectedUser: ${latestUserActivityTimeline?.summary.selectedUser ?? "not_available"}`, `- dateRange: ${latestUserActivityTimeline ? `${latestUserActivityTimeline.summary.dateRange.start}..${latestUserActivityTimeline.summary.dateRange.end}` : "not_available"}`, `- totalEvents: ${latestUserActivityTimeline?.summary.totalEvents ?? 0}`, `- issueKeyCount: ${latestUserActivityTimeline?.summary.issueKeyCount ?? 0}`, `- eventTypeCounts: ${JSON.stringify(latestUserActivityTimeline?.summary.eventTypeCounts ?? {})}`, `- confidenceCounts: ${JSON.stringify(latestUserActivityTimeline?.summary.confidenceCounts ?? {})}`, `- exportedFiles: ${JSON.stringify(latestUserActivityTimeline?.exportedFiles ?? {})}`, ""].join("\n"), "utf8");
  fs.appendFileSync(path.join(folderPath, "README_for_GPT.txt"), ["Timeline Integrity:", `- sourceParsedActivityCount: ${latestUserActivityTimeline?.summary.integrity.sourceParsedActivityCount ?? 0}`, `- timelineEventCount: ${latestUserActivityTimeline?.summary.integrity.timelineEventCount ?? 0}`, `- difference: ${latestUserActivityTimeline?.summary.eventCountReconciliation.difference ?? 0}`, `- deduplicatedEntryCount: ${latestUserActivityTimeline?.summary.integrity.deduplicatedEntryCount ?? 0}`, `- skippedEntryCount: ${latestUserActivityTimeline?.summary.integrity.skippedEntryCount ?? 0}`, `- unexplainedDifferenceCount: ${latestUserActivityTimeline?.summary.eventCountReconciliation.unexplainedDifferenceCount ?? 0}`, `- sourceParsedIssueKeyCount: ${latestUserActivityTimeline?.summary.integrity.sourceParsedIssueKeyCount ?? 0}`, `- timelinePrimaryIssueKeyCount: ${latestUserActivityTimeline?.summary.integrity.timelinePrimaryIssueKeyCount ?? 0}`, `- timelineAllIssueKeyCount: ${latestUserActivityTimeline?.summary.integrity.timelineAllIssueKeyCount ?? 0}`, `- missingIssueKeysFromTimeline: ${latestUserActivityTimeline?.summary.integrity.missingIssueKeysFromTimeline.join(", ") || "none"}`, `- missingIssueKeysFromPrimaryTimeline: ${latestUserActivityTimeline?.summary.integrity.missingIssueKeysFromPrimaryTimeline.join(", ") || "none"}`, `- eventIdCollisionCount: ${latestUserActivityTimeline?.summary.integrity.eventIdCollisionCount ?? 0}`, ""].join("\n"), "utf8");
  lastDebugBundle = { path: folderPath, createdAt };
  return { canceled: false, folderPath, filePath: folderPath, createdAt, includedFiles: fs.readdirSync(folderPath), crossPageDebugBundleTodo };
});

ipcMain.handle("debug-log:open-folder", async (_event, payload: { folderPath: string }) => {
  const target = path.resolve(payload.folderPath || getExportsDir());
  const root = path.resolve(getAppRuntimeDir());
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return { ok: false, error: "Path is outside the app runtime directory." };
  const error = await shell.openPath(target);
  return { ok: !error, folderPath: target, error };
});

ipcMain.handle("debug-log:save-text", async (_event, payload: { defaultFileName: string; content: string }) => {
  const outputDir = ensureDir(getLogsDir());
  const result = await dialog.showSaveDialog({
    title: "Save Debug Log",
    defaultPath: path.join(outputDir, payload.defaultFileName),
    filters: [{ name: "Text", extensions: ["txt"] }]
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  const { diagnostics, mergedContent } = buildDebugLogExportContent(payload.content);
  fs.writeFileSync(result.filePath, mergedContent, "utf8");
  return { canceled: false, filePath: result.filePath, folderPath: outputDir, ...diagnostics };
});

function getRendererEntry() {
  return path.join(__dirname, "../dist/index.html");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runUiSmoke(window: BrowserWindow) {
  if (shouldCaptureUi) {
    fs.rmSync(captureDir, { recursive: true, force: true });
    await wait(150);
    fs.mkdirSync(captureDir, { recursive: true });
  }

  const failures: string[] = [];
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
  const timelineFixture = buildUserActivityTimeline({
    timelineRunId: "tlrun-fixture",
    builtAt: "2026-07-02T06:00:00.000Z",
    selectedUser: "roger_hsieh",
    dateRange: { start: "2026-07-02", end: "2026-07-02" },
    projectScope: "COPGEN1",
    sourceRunId: "asrun-timeline-fixture",
    sourceParsedActivityCount: 6,
    sourceIssueKeys: ["COPGEN1-138930", "JACKSONQLC-3024", "COPGEN1-125695", "COPGEN1-125806"],
    activityStreamQueryUser: "roger\\_hsieh",
    baseline: { classification: "accepted_equal", retryTriggered: true, retryRecovered: true, baselineBestParsedActivityCount: 17, currentParsedActivityCount: 17, knownEntryFingerprints: ["sha256:fixture-comment", "sha256:fixture-link", "sha256:fixture-secondary"] },
    entries: [
      { issueKey: "COPGEN1-138930", extractedIssueKeysPerEntry: ["COPGEN1-138930", "JACKSONQLC-3024"], activityTime: "2026-07-02T05:41:09.000Z", activityType: "comment", activityTitle: "謝正洪(roger_hsieh) commented on COPGEN1-138930", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "commented_on", finalType: "comment" }, entryFingerprint: "sha256:fixture-comment", variant: "escaped_username" },
      { issueKey: "COPGEN1-138930", extractedIssueKeysPerEntry: ["COPGEN1-138930"], activityTime: "2026-07-02T05:42:09.000Z", activityType: "link", activityTitle: "created a link from COPGEN1-138930", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "link_action", finalType: "link" }, entryFingerprint: "sha256:fixture-link", variant: "escaped_username" },
      { issueKey: "", extractedIssueKeysPerEntry: [], activityTime: "2026-07-02T05:43:09.000Z", activityType: "page", activityTitle: "edited page Weekly Report", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "confluence_page_object", finalType: "page" }, entryFingerprint: "sha256:fixture-page", variant: "escaped_username" },
      { issueKey: "COPGEN1-125695", extractedIssueKeysPerEntry: ["COPGEN1-125695", "COPGEN1-125806"], activityTime: "2026-07-02T05:44:09.000Z", activityType: "link", activityTitle: "linked COPGEN1-125695 to COPGEN1-125806", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "link_action", finalType: "link" }, entryFingerprint: "sha256:fixture-secondary", variant: "escaped_username", entryIndex: 3 },
      { issueKey: "COPGEN1-125695", extractedIssueKeysPerEntry: ["COPGEN1-125695", "COPGEN1-125806"], activityTime: "2026-07-02T05:44:09.000Z", activityType: "link", activityTitle: "linked COPGEN1-125695 to COPGEN1-125806", activityAuthor: "謝正洪", activityAuthorEmail: "roger_hsieh", activityTypeClassifier: { matchedRule: "link_action", finalType: "link" }, entryFingerprint: "sha256:fixture-secondary", variant: "escaped_username", entryIndex: 4 },
      { issueKey: "COPGEN1-OUTSIDE", extractedIssueKeysPerEntry: ["COPGEN1-OUTSIDE"], activityTime: "2026-06-30T05:44:09.000Z", activityType: "comment", activityTitle: "outside range", entryFingerprint: "sha256:fixture-outside", entryIndex: 5 }
    ]
  });
  const incompleteConfidenceFixture = buildUserActivityTimeline({ timelineRunId: "tlrun-incomplete", builtAt: "2026-07-02T06:00:00.000Z", selectedUser: "roger_hsieh", dateRange: { start: "2026-07-02", end: "2026-07-02" }, projectScope: "COPGEN1", sourceRunId: "asrun-incomplete", sourceParsedActivityCount: 2, sourceIssueKeys: ["COPGEN1-1", "COPGEN1-2"], activityStreamQueryUser: "roger\\_hsieh", baseline: { classification: "result_incomplete_candidate", retryTriggered: true, retryRecovered: false, baselineBestParsedActivityCount: 3, currentParsedActivityCount: 2, knownEntryFingerprints: ["sha256:known"] }, entries: [{ issueKey: "COPGEN1-1", extractedIssueKeysPerEntry: ["COPGEN1-1"], activityTime: "2026-07-02T01:00:00Z", activityType: "comment", activityTitle: "known comment", activityTypeClassifier: { matchedRule: "commented_on", finalType: "comment" }, entryFingerprint: "sha256:known" }, { issueKey: "COPGEN1-2", extractedIssueKeysPerEntry: ["COPGEN1-2"], activityTime: "2026-07-02T02:00:00Z", activityType: "comment", activityTitle: "new comment", activityTypeClassifier: { matchedRule: "commented_on", finalType: "comment" }, entryFingerprint: "sha256:new" }] });
  const timelineFixtureCsv = timelineCsv(timelineFixture.events);
  const secondaryFixtureEvent = timelineFixture.events.find((event) => event.issueKey === "COPGEN1-125695");
  const knownIncompleteEvent = incompleteConfidenceFixture.events.find((event) => event.rawRef.entryFingerprint === "sha256:known");
  const newIncompleteEvent = incompleteConfidenceFixture.events.find((event) => event.rawRef.entryFingerprint === "sha256:new");
  if (timelineFixture.events.length !== 4 || !timelineFixture.events.some((event) => event.eventType === "comment" && event.issueKey === "COPGEN1-138930" && event.sourceConfidence === "high") || !timelineFixture.events.some((event) => event.eventType === "page" && event.sourceConfidence === "medium") || !secondaryFixtureEvent || secondaryFixtureEvent.allIssueKeys.join(";") !== "COPGEN1-125695;COPGEN1-125806" || timelineFixture.summary.issueKeyCount !== 4 || timelineFixture.summary.allIssueKeyCount !== 4 || timelineFixture.summary.primaryIssueKeyCount !== 2 || timelineFixture.summary.integrity.missingIssueKeysFromTimeline.length !== 0 || !timelineFixture.summary.integrity.missingIssueKeysFromPrimaryTimeline.includes("COPGEN1-125806") || timelineFixture.summary.integrity.deduplicatedEntryCount !== 1 || timelineFixture.summary.integrity.skippedEntryCount !== 1 || timelineFixture.summary.eventCountReconciliation.unexplainedDifferenceCount !== 0 || timelineFixture.summary.eventCountReconciliation.status !== "reconciled" || timelineFixture.summary.dedupDiagnostics.dedupGroups.length !== 1 || timelineFixture.events.some((event) => !/^sha256:[0-9a-f]{64}$/.test(event.eventId) || event.eventId.startsWith("sha256:sha256:") || !event.rawRef.entryFingerprint || event.evidence.baselineGuard.classification !== "accepted_equal") || !timelineFixtureCsv.startsWith("\uFEFF") || !timelineFixtureCsv.includes("COPGEN1-125695;COPGEN1-125806") || knownIncompleteEvent?.sourceConfidence !== "high" || newIncompleteEvent?.sourceConfidence !== "low" || incompleteConfidenceFixture.summary.confidenceDiagnostics.eventLevelBaselineMatchedCount !== 1 || incompleteConfidenceFixture.summary.confidenceDiagnostics.forcedLowDueToRunIncompleteCount !== 1) failures.push(`timeline integrity fixtures failed ${JSON.stringify({ timelineFixture, incompleteConfidenceFixture })}`);
  const baselineFixtureEntries = Array.from({ length: 10 }, (_, index) => ({ entryFingerprint: sha256(`baseline-entry-${index}`), activityTime: `2026-07-02T${String(index).padStart(2, "0")}:00:00.000Z`, activityAuthorEmail: "smoke@example.com", activityType: index === 0 ? "comment" : "page", issueKey: index < 2 ? `SMOKE-${index + 1}` : "", activityTitle: `Baseline activity ${index}` }));
  const baselineFixtureObservation = (runId: string, overrides: Partial<BaselineObservation> = {}): BaselineObservation => ({ runId, observedAt: new Date().toISOString(), source: "activity_stream", selectedUser: "baseline_smoke", queryUser: "baseline\\_smoke", queryUserEncoded: "baseline%5C_smoke", variant: "escaped_username", dateQueryMode: "update_date_after_before", periodStart: "2026-07-02", periodEndExclusive: "2026-07-03", granularity: "exact_range", requestSignatureHash: sha256("baseline-fixture-request"), atomEntryCount: 10, parsedActivityCount: 10, issueKeys: ["SMOKE-1", "SMOKE-2"], entries: baselineFixtureEntries, ...overrides });
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
        await window.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(route.hash)};`);
        await wait(350);

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
  const debugBundlesDir = ensureDir(path.join(getExportsDir(), "debug-bundles"));
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
    { name: "json", response: { ok: true, status: 200, contentType: "application/json", json: { entries: [{ title: "SMOKE-201 updated", author: { email: "smoke@example.com" }, updated: "2026-07-02T10:00:00Z" }] } }, expectedStatus: "success", expectedIssueCount: 1, expectedDiagnosis: "parsed", expectedAtomEntries: 0 },
    { name: "atom", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed><entry><title>Commented on SMOKE-202</title><author><email>smoke@example.com</email></author><updated>2026-07-02T11:00:00Z</updated><summary>comment added</summary></entry></feed>" }, expectedStatus: "success", expectedIssueCount: 1, expectedDiagnosis: "parsed", expectedAtomEntries: 1 },
    { name: "manual_atom", response: { ok: true, status: 200, contentType: "application/atom+xml;charset=UTF-8", json: null, bodyTextSanitized: `<feed><entry><title type="html">created a link from <a href="/browse/COPGEN1-138930" class="issue-link">COPGEN1-138930</a></title><author><name>謝正洪(roger_hsieh)</name><email>roger_hsieh@phison.com</email></author><published>2026-07-09T05:36:18.000Z</published><activity:object><title type="text">COPGEN1-138930</title><summary type="text">[JACKSONQLC-3024] IOFULLSEQWRT Failure</summary></activity:object></entry></feed>` }, expectedStatus: "success", expectedIssueCount: 2, expectedDiagnosis: "parsed", expectedAtomEntries: 1 },
    { name: "no_entries", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed></feed>" }, expectedStatus: "success", expectedIssueCount: 0, expectedDiagnosis: "no_entries", expectedAtomEntries: 0 },
    { name: "parser_failed", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed><entry><title></title></entry></feed>" }, expectedStatus: "failed", expectedIssueCount: 0, expectedDiagnosis: "parser_failed", expectedAtomEntries: 1 },
    { name: "html", response: { ok: false, status: 200, contentType: "text/html", json: null, errorType: "NON_JSON_RESPONSE", message: "HTML login page", bodyPreview: "login" }, expectedStatus: "failed", expectedIssueCount: 0, expectedDiagnosis: "html_login", expectedAtomEntries: 0 },
    { name: "403", response: { ok: false, status: 403, contentType: "application/json", json: { error: "forbidden" }, errorType: "HTTP_ERROR", message: "Forbidden" }, expectedStatus: "unsupported", expectedIssueCount: 0, expectedDiagnosis: "http_error", expectedAtomEntries: 0 },
    { name: "404", response: { ok: false, status: 404, contentType: "text/plain", json: null, errorType: "NON_JSON_RESPONSE", message: "Not found", bodyPreview: "Not found" }, expectedStatus: "unsupported", expectedIssueCount: 0, expectedDiagnosis: "http_error", expectedAtomEntries: 0 }
  ];
  for (const fixture of parserFixtures) {
    const parsed = activityStreamResult(fixture.response, "/plugins/servlet/streams?maxResults=10", "smoke@example.com");
    if (parsed.status !== fixture.expectedStatus || parsed.parsedIssueKeys.length !== fixture.expectedIssueCount || parsed.diagnosis !== fixture.expectedDiagnosis || parsed.atomEntryCount !== fixture.expectedAtomEntries) failures.push(`activity stream ${fixture.name} parser failed: ${JSON.stringify(parsed)}`);
    if (fixture.name === "manual_atom" && (parsed.parsedIssueKeys[0] !== "COPGEN1-138930" || parsed.entriesSanitized[0]?.activityType !== "link" || parsed.entriesSanitized[0]?.activityAuthorEmail !== "roger_hsieh@phison.com")) failures.push(`activity stream manual Atom fields failed: ${JSON.stringify(parsed)}`);
    if (fixture.name === "html" && (parsed as Record<string, unknown>).bodyTextSanitized) failures.push("activity stream HTML parser retained full body");
  }
  const anomalyXml = `<feed>${Array.from({ length: 20 }, (_, index) => `<entry><title>${index === 0 ? "SMOKE-999 updated" : `Entry without key ${index}`}</title><author><name>Smoke User</name></author><updated>2026-07-02T11:00:00Z</updated></entry>`).join("")}</feed>`;
  const anomalyResult = activityStreamResult({ ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: anomalyXml }, "/plugins/servlet/streams?maxResults=20", "smoke_user", "escaped_username", "asrun-anomaly");
  if (anomalyResult.parserDiagnostics.parserAnomaly || anomalyResult.parserDiagnostics.atomEntryCount !== 20 || anomalyResult.parserDiagnostics.parsedEntryCount !== 20 || anomalyResult.parserDiagnostics.skippedEntryCount !== 0 || anomalyResult.diagnosis !== "parsed") failures.push(`activity stream no-key activity diagnostics failed: ${JSON.stringify(anomalyResult.parserDiagnostics)}`);
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
  const commentRegressionEntry = activityEntry({ title: "謝正洪(roger_hsieh) commented on COPGEN1-138930 - [JACKSONQLC-3024] IOFULLSEQWRT Failure", content: "attachment metadata exists elsewhere", raw: "<activity:object-type>attachment</activity:object-type>", application: "Jira", objectType: "issue" }, "escaped_username", "asrun-classifier", 0);
  if (commentRegressionEntry.activityType !== "comment" || commentRegressionEntry.issueKey !== "COPGEN1-138930" || commentRegressionEntry.activityApplication !== "Jira" || commentRegressionEntry.activityTypeClassifier.matchedRule !== "commented_on" || commentRegressionEntry.activityTypeClassifier.finalType !== "comment" || commentRegressionEntry.activityTypeClassifier.priority !== 100) failures.push(`commented-on classifier regression failed: ${JSON.stringify(commentRegressionEntry)}`);
  window.setSize(1280, 720, false);
  await window.webContents.executeJavaScript(`window.location.hash = "#/analysis";`);
  await wait(350);
  const analysisWorkflowAudit = await window.webContents.executeJavaScript(`(() => ({ count: document.querySelectorAll("[data-testid^='workflow-']").length, hasPrecisionTab: Boolean(document.querySelector("[data-testid='workflow-precision']")) }))()`);
  if (analysisWorkflowAudit.count !== 5 || analysisWorkflowAudit.hasPrecisionTab) failures.push(`User Analysis workflow does not contain the expected five steps: ${JSON.stringify(analysisWorkflowAudit)}`);
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("a")).find((link) => link.getAttribute("href") === "#/precision-probe")?.click();`);
  await wait(350);
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
  const requiredPrecisionActions = ["Navigation clicked: User Activity Precision Probe", "Activity Stream Query Mode changed: value=auto", "Activity Stream User Override changed: value=smoke_user@example.com", "Button clicked: Run Activity Stream Probe", "Manual Activity Stream URL changed", "Button clicked: Run Manual URL Replay", "Button clicked: Run Precision Probe", "Button clicked: Add Precise Candidates to Fetch Queue", "Button clicked: Save Precision Probe Result"];
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
  await window.webContents.executeJavaScript(`window.location.hash = "#/analysis";`);
  await wait(350);
  await window.webContents.executeJavaScript(`(() => { document.querySelector("[data-testid='workflow-candidate']")?.click(); const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement)) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='analysis-start-date']", "2026-07-01"); set("[data-testid='analysis-end-date']", "2026-07-07"); })()`);
  await wait(150);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-timeline']")?.click();`);
  await wait(150);
  const timelineTabAudit = await window.webContents.executeJavaScript(`(() => ({ panel: Boolean(document.querySelector("[data-testid='activity-timeline-panel']")), button: Boolean(document.querySelector("[data-testid='build-activity-timeline']")) }))()`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='build-activity-timeline']")?.click();`);
  await wait(2200);
  const timelineUiAudit = await window.webContents.executeJavaScript(`(() => { const table = document.querySelector("[data-testid='timeline-events-table']"); const text = document.body.innerText || ""; const rows = table?.querySelectorAll("tbody > tr").length || 0; table?.querySelector("tbody button")?.click(); return { rows, issue: text.includes("SMOKE-101"), link: text.includes("link"), page: text.includes("page"), export: text.includes("user-activity-timeline-") && text.includes("timeline-build-summary-"), integrity: Boolean(document.querySelector("[data-testid='timeline-integrity-diagnostics']")), countWarning: Boolean(document.querySelector("[data-testid='timeline-integrity-count-warning']")), secondaryInfo: Boolean(document.querySelector("[data-testid='timeline-integrity-secondary-info']")) }; })()`);
  await wait(100);
  const timelineDetailAudit = await window.webContents.executeJavaScript(`(() => { const text = document.querySelector("[data-testid='timeline-events-table']")?.textContent || ""; return { eventId: text.includes("eventId:"), fingerprint: text.includes("entryFingerprint:"), baseline: text.includes("baseline:"), retry: text.includes("retry:") }; })()`);
  const timelineFilterAudit = await window.webContents.executeJavaScript(`(() => { const set = (selector, value) => { const element = document.querySelector(selector); if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return; const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }; set("[data-testid='timeline-filter-project']", "SMOKE"); set("[data-testid='timeline-filter-issue']", "SMOKE-101"); set("[data-testid='timeline-filter-type']", "link"); return true; })()`);
  await wait(100);
  const timelineFilteredRows = await window.webContents.executeJavaScript(`document.querySelectorAll("[data-testid='timeline-events-table'] tbody > tr").length`);
  const timelineExportAudit = latestUserActivityTimeline ? {
    json: fs.existsSync(latestUserActivityTimeline.exportedFiles.jsonPath),
    csv: fs.existsSync(latestUserActivityTimeline.exportedFiles.csvPath),
    summary: fs.existsSync(latestUserActivityTimeline.exportedFiles.summaryPath),
    bom: fs.readFileSync(latestUserActivityTimeline.exportedFiles.csvPath).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    eventIds: latestUserActivityTimeline.events.every((event) => /^sha256:[0-9a-f]{64}$/.test(event.eventId) && !event.eventId.startsWith("sha256:sha256:") && event.rawRef.entryFingerprint && event.evidence.baselineGuard.classification),
    secondary: latestUserActivityTimeline.events.some((event) => event.issueKey === "COPGEN1-125695" && event.allIssueKeys.includes("COPGEN1-125806")) && latestUserActivityTimeline.summary.integrity.timelineAllIssueKeys.includes("COPGEN1-125806") && !latestUserActivityTimeline.summary.integrity.missingIssueKeysFromTimeline.includes("COPGEN1-125806") && latestUserActivityTimeline.summary.integrity.missingIssueKeysFromPrimaryTimeline.includes("COPGEN1-125806"),
    reconciliation: latestUserActivityTimeline.summary.eventCountReconciliation.status === "reconciled" && latestUserActivityTimeline.summary.integrity.skippedEntryCount >= 1 && latestUserActivityTimeline.summary.eventCountReconciliation.unexplainedDifferenceCount === 0,
    sensitive: /Authorization\s*:\s*(?!\[masked\])|Bearer\s+(?!\[masked\])|Basic\s+(?!\[masked\])|JSESSIONID|apiToken|password/i.test(fs.readFileSync(latestUserActivityTimeline.exportedFiles.jsonPath, "utf8"))
  } : null;
  if (!timelineTabAudit.panel || !timelineTabAudit.button || timelineUiAudit.rows < 1 || !timelineUiAudit.issue || !timelineUiAudit.link || !timelineUiAudit.page || !timelineUiAudit.export || !timelineUiAudit.integrity || !timelineUiAudit.countWarning || !timelineUiAudit.secondaryInfo || !timelineDetailAudit.eventId || !timelineDetailAudit.fingerprint || !timelineDetailAudit.baseline || !timelineDetailAudit.retry || !timelineFilterAudit || timelineFilteredRows !== 1 || !timelineExportAudit?.json || !timelineExportAudit.csv || !timelineExportAudit.summary || !timelineExportAudit.bom || !timelineExportAudit.eventIds || !timelineExportAudit.secondary || !timelineExportAudit.reconciliation || timelineExportAudit.sensitive) failures.push(`activity timeline UI/export audit failed ${JSON.stringify({ timelineTabAudit, timelineUiAudit, timelineDetailAudit, timelineFilteredRows, timelineExportAudit })}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-candidate']")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector("[data-testid='analysis-selected-users']"); if (input instanceof HTMLTextAreaElement) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, ""); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-timeline']")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='build-activity-timeline']")?.click();`);
  await wait(100);
  const timelineInputGuardAudit = await window.webContents.executeJavaScript(`document.body.innerText.includes("Please select a user and date range first") && document.body.innerText.includes("請先選擇使用者與日期範圍")`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='workflow-candidate']")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector("[data-testid='analysis-selected-users']"); if (input instanceof HTMLTextAreaElement) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, "roger_hsieh"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  if (!timelineInputGuardAudit) failures.push("activity timeline missing selected user/date guard audit failed");
  const missingSmokeRun: AutoSavedRun = { runId: "smoke-missing-auto-save", resultType: "activity_stream_run", status: "completed", savedAt: new Date().toISOString(), filePath: path.join(getExportsDir(), "user-analysis", "activity-stream-runs", "smoke-missing-auto-save.json"), folderPath: path.join(getExportsDir(), "user-analysis", "activity-stream-runs"), data: { runId: "smoke-missing-auto-save", diagnosis: "no_entries" } };
  autoSavedRunHistory.unshift(missingSmokeRun);
  await window.webContents.executeJavaScript(`document.querySelector("[data-debug-panel-state='collapsed']")?.querySelector("button")?.click();`);
  await wait(100);
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("button")).find((button) => button.title?.includes("Save Debug Log"))?.click();`);
  await wait(500);
  const missingSmokeIndex = autoSavedRunHistory.indexOf(missingSmokeRun);
  if (missingSmokeIndex >= 0) autoSavedRunHistory.splice(missingSmokeIndex, 1);
  const debugBundleUiAudit = await window.webContents.executeJavaScript(`(() => ({ path: document.querySelector("[data-testid='last-debug-bundle-path']")?.textContent || "", open: Boolean(document.querySelector("[data-testid='open-debug-bundle']")), copy: Boolean(document.querySelector("[data-testid='copy-debug-bundle-path']")) }))()`);
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
  const debugBundlePath = newDebugBundles.length > 0 ? path.join(debugBundlesDir, newDebugBundles.at(-1)!) : "";
  const requiredBundleFiles = ["debug-log.txt", "user-action-log.txt", "app-metadata.json", "request-context.json", "latest-result.json", "latest-run-result.json", "last-successful-result.json", "last-parsed-result.json", "latest-no-entries-result.json", "latest-activity-stream-result.json", "latest-precision-probe-result.json", "latest-manual-url-replay-result.json", "latest-maxresults-cap-test.json", "run-history.json", "activity-stream-run-history.json", "auto-saved-result-paths.json", "auto-saved-results", "auto-saved-results-index.json", "session-timeline.json", "activity-stream-chunk-results.json", "activity-stream-merged-result.json", "standard-activity-stream-flow.json", "activity-type-classifier-diagnostics.json", "activity-stream-baseline-comparison.json", "activity-stream-baseline-snapshot.json", "activity-stream-baseline-history.json", "activity-stream-baseline-comparisons.json", "user-activity-timeline.json", "user-activity-timeline.csv", "timeline-build-summary.json", "timeline-event-schema.json", "timeline-integrity-diagnostics.json", "timeline-dedup-diagnostics.json", "timeline-issue-key-diagnostics.json", "debug-bundle-summary.json", "README_for_GPT.txt"];
  const actualBundleFiles = debugBundlePath ? fs.readdirSync(debugBundlePath) : [];
  const missingBundleFiles = requiredBundleFiles.filter((name) => !actualBundleFiles.includes(name));
  const bundleText = debugBundlePath ? actualBundleFiles.filter((name) => fs.statSync(path.join(debugBundlePath, name)).isFile()).map((name) => fs.readFileSync(path.join(debugBundlePath, name), "utf8")).join("\n") : "";
  if (!autoSaveUiAudit.visible || !autoSaveUiAudit.activity || !autoSaveUiAudit.path || !autoSaveUiAudit.open || !autoSaveUiAudit.copy) failures.push(`last auto-save UI audit failed ${JSON.stringify(autoSaveUiAudit)}`);
  if (!debugBundleUiAudit.path || !debugBundleUiAudit.open || !debugBundleUiAudit.copy || missingBundleFiles.length > 0) failures.push(`debug bundle UI/files audit failed ${JSON.stringify({ debugBundleUiAudit, missingBundleFiles })}`);
  if (!bundleText.includes("Jira Activity Analyzer Debug Bundle") || !bundleText.includes("Standard Activity Stream Flow:") || !bundleText.includes("Activity Type Classifier:") || !bundleText.includes("commentPriorityHigherThanAttachment: true") || !bundleText.includes("Cross-page TODO") || /secret-value|JSESSIONID|Authorization:\s*(?!\[masked\])/i.test(bundleText)) failures.push("debug bundle README/classifier/sensitive-data audit failed");
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
    const bundleTimelineCsv = fs.readFileSync(path.join(debugBundlePath, "user-activity-timeline.csv"));
    const bundleAutoSavedIndex = asRecord(JSON.parse(fs.readFileSync(path.join(debugBundlePath, "auto-saved-results-index.json"), "utf8")));
    const bundleTimeline = JSON.parse(fs.readFileSync(path.join(debugBundlePath, "session-timeline.json"), "utf8") as string) as Array<Record<string, unknown>>;
    const fullSessionBundle = asRecord(bundleSummary.fullSessionBundle);
    const bundleBaselineGuard = asRecord(bundleSummary.activityStreamBaselineGuard);
    const latestBundleRunId = String(latestBundleResult.runId || "");
    if (!latestBundleRunId || !bundleHistory.some((run) => String(run?.runId || "") === latestBundleRunId) || String(asRecord(bundlePaths.latestRunResult).runId || "") !== latestBundleRunId || bundleSummary.snapshotConsistent !== true) failures.push(`debug bundle snapshot consistency failed: latest=${latestBundleRunId}`);
    if (bundleStandardFlow.enabled !== true || bundleStandardFlow.variant !== "escaped_username" || bundleStandardFlow.activityStreamQueryUser !== "roger\\_hsieh" || Number(bundleStandardFlow.perChunkMaxResults) !== 500 || bundleClassifier.enabled !== true || bundleClassifier.commentPriorityHigherThanAttachment !== true || bundleClassifier.rulesVersion !== "1.1" || !asRecord(bundleSummary.standardActivityStreamFlow).selectedUser || !bundleSummary.activityTypeClassifierDiagnostics) failures.push(`debug bundle standard flow/classifier diagnostics failed: ${JSON.stringify({ bundleStandardFlow, bundleClassifier })}`);
    if (bundleBaselineGuard.enabled !== true || bundleBaselineComparison.enabled !== true || bundleBaselineSnapshot.schemaVersion !== 1 || !String(bundleBaselineSnapshot.snapshotKey || "").includes("activity_stream|") || bundleBaselineHistory.length < 1 || !bundleTimeline.some((entry) => entry.type === "activity_stream_baseline_guard") || !bundleText.includes("Activity Stream Baseline Guard:") || !bundleText.includes("activity-stream-baseline-comparison.json")) failures.push(`debug bundle baseline guard audit failed: ${JSON.stringify({ bundleBaselineGuard, bundleBaselineComparison, snapshotKey: bundleBaselineSnapshot.snapshotKey, history: bundleBaselineHistory.length })}`);
    const bundleUserTimelineSummary = asRecord(bundleSummary.userActivityTimeline);
    const bundleUserTimelineEvents = Array.isArray(bundleUserTimeline.events) ? bundleUserTimeline.events.map(asRecord) : [];
    const bundleTimelineIntegritySummary = asRecord(bundleSummary.timelineIntegrity);
    if (bundleUserTimelineSummary.available !== true || !String(bundleUserTimeline.timelineRunId).startsWith("tlrun-") || Number(bundleTimelineSummary.totalEvents) < 1 || Number(bundleTimelineSchema.schemaVersion) !== 2 || bundleUserTimelineEvents.some((event) => !/^sha256:[0-9a-f]{64}$/.test(String(event.eventId)) || String(event.eventId).startsWith("sha256:sha256:")) || !bundleTimelineCsv.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || !bundleTimeline.some((entry) => entry.type === "user_activity_timeline_built") || !bundleText.includes("User Activity Timeline:") || !bundleText.includes("Timeline Integrity:") || bundleTimelineIntegritySummary.available !== true || Number(bundleTimelineIntegrity.unexplainedDifferenceCount ?? asRecord(bundleTimelineSummary.eventCountReconciliation).unexplainedDifferenceCount) !== 0 || Number(bundleTimelineIssueKeys.timelineAllIssueKeyCount) < Number(bundleTimelineIssueKeys.timelinePrimaryIssueKeyCount) || !Array.isArray(bundleTimelineDedup.dedupGroups)) failures.push(`debug bundle timeline audit failed: ${JSON.stringify({ bundleUserTimelineSummary, bundleTimelineIntegritySummary, timelineRunId: bundleUserTimeline.timelineRunId, totalEvents: bundleTimelineSummary.totalEvents, schemaVersion: bundleTimelineSchema.schemaVersion })}`);
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
  await window.webContents.executeJavaScript(`window.location.hash = "#/analysis";`);
  await wait(350);
  await window.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent("jaa:seed-large-queue", { detail: { count: 41 } }));`);
  await wait(250);
  const largeQueueOpened = await window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector("[data-debug-panel-state='collapsed']");
      panel?.querySelector("button")?.click();
      const runButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Run Full Fetch from Queue"));
      const disabled = runButton instanceof HTMLButtonElement ? runButton.disabled : true;
      runButton?.click();
      return { found: Boolean(runButton), disabled };
    })()
  `);
  await wait(250);
  const largeQueueRejected = await window.webContents.executeJavaScript(`
    (() => {
      const modalVisible = document.body.innerText.includes("Large Full Fetch Confirmation");
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
        modalClosed: !text.includes("Large Full Fetch Confirmation"),
        hasUserAction: text.includes("[USER_ACTION]"),
        hasGuard: text.includes("[GUARD]"),
        hasUiModal: text.includes("[UI_MODAL]")
      };
    })()
  `);
  await window.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Run Full Fetch from Queue"))?.click();
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
        modalClosed: !text.includes("Large Full Fetch Confirmation"),
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
    Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Exports") && button.textContent?.includes("匯出"))?.click();
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
    "[GUARD] Large queue confirmation required",
    "[UI_MODAL] Large queue confirmation opened",
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

  if (failures.length > 0) {
    console.error("[electron ui smoke failed]");
    for (const failure of failures) {
      console.error(failure);
    }
    app.exit(1);
    return;
  }

  console.log(`[electron ui smoke passed] routes=${uiRoutes.length}, viewports=${uiViewports.length}, screenshots=${shouldCaptureUi ? captureDir : "disabled"}`);
  app.exit(0);
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

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[renderer did-fail-load]", { errorCode, errorDescription, validatedURL });
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer render-process-gone]", details);
    crashDiagnostic("render-process-gone", { reason: details.reason, exitCode: details.exitCode, processType: "renderer", currentRoute: window.webContents.getURL() });
  });

  window.on("unresponsive", () => {
    console.error("[window unresponsive]");
    crashDiagnostic("window-unresponsive", { processType: "renderer", currentRoute: window.webContents.getURL() });
  });

  window.on("responsive", () => {
    console.log("[window responsive]");
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log("[renderer console-message]", { level, message, line, sourceId });
  });

  window.webContents.on("did-finish-load", () => {
    console.log("[renderer did-finish-load]", window.webContents.getURL());
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
  crashDiagnostic("uncaughtException", { processType: "main", error: error.stack ?? error.message });
});

process.on("unhandledRejection", (reason) => {
  console.error("[main unhandledRejection]", reason);
  crashDiagnostic("unhandledRejection", { processType: "main", error: reason instanceof Error ? reason.stack ?? reason.message : String(reason) });
});

app.on("render-process-gone", (_event, webContents, details) => {
  crashDiagnostic("app-render-process-gone", { processType: "renderer", reason: details.reason, exitCode: details.exitCode, currentRoute: webContents.getURL() });
});

app.on("child-process-gone", (_event, details) => {
  crashDiagnostic("child-process-gone", { processType: details.type, reason: details.reason, exitCode: details.exitCode, serviceName: details.serviceName });
});

app.whenReady().then(() => {
  if (app.isPackaged || isUiSmoke) {
    Menu.setApplicationMenu(null);
  }

  const envState = ensureProbeEnv();
  if (envState.status === "created") {
    console.log("[env] Default env file created", envState.envPath);
  } else {
    console.log("[env] Env file loaded", envState.envPath);
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
