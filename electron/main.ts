import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, getAppLogsDir, getAppRuntimeDir, getBackupsDir, getConfigDir, getConfigPath, getConnectionsPath, getCrashLogsDir, getDatabaseDir, getDefaultEnvPath, getEnvPath, getExportsDir, getFullFetchLogsDir, getFullFetchRawRunsDir, getLogsDir, getProbeResultsDir, getRawDataDir } from "./appPaths.js";
import { createJiraClient } from "./jira/jiraClient.js";
import { assertReadOnlyRequest, ReadOnlyViolationError } from "./jira/jiraReadOnlyGuard.js";
import { ensureExportFolders, saveExportJson } from "./export/exportService.js";
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
  return appendRuntimeLog(getUserActionLogPath(), level, message);
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
  activityType: "link" | "comment" | "attachment" | "status" | "assignee_change" | "field_change" | "description_update" | "page" | "unknown";
  source: "activity_stream" | "manual_url";
  variant: string;
  extractedIssueKeysPerEntry: string[];
};

type ActivityStreamQueryMode = "auto" | "username" | "email" | "custom";
type ActivityStreamDiagnosis = "parsed" | "no_entries" | "parser_failed" | "html_login" | "http_error" | "blocked" | "unknown";
type ActivityStreamVariant = { variant: "username" | "escaped_username" | "email" | "custom" | "manual_url"; user: string };

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

function activityType(value: string): ActivityStreamEntry["activityType"] {
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

function activityEntry(values: { title?: unknown; author?: unknown; authorEmail?: unknown; time?: unknown; content?: unknown; link?: unknown; raw?: unknown }, variant: string, runId: string): ActivityStreamEntry {
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
  return {
    runId,
    issueKey: extractedIssueKeysPerEntry[0] ?? "",
    activityTitle: title === "-" ? "" : title.slice(0, 1000),
    activityAuthor: author === "-" ? "" : author.slice(0, 300),
    activityAuthorEmail: authorEmail === "-" ? "" : authorEmail.slice(0, 300),
    activityTime: time === "-" ? "" : time,
    activityType: activityType(combined),
    source: variant === "manual_url" ? "manual_url" : "activity_stream",
    variant,
    extractedIssueKeysPerEntry
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
    entries: records.map((entry) => activityEntry({
    title: entry.title,
    author: entry.author,
    authorEmail: asRecord(entry.author).email,
    time: entry.updated ?? entry.published ?? entry.timestamp ?? entry.date,
    content: entry.summary ?? entry.content ?? entry.description,
    link: entry.link ?? entry.url,
    raw: entry
  }, variant, runId))
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
  return { rawEntryCount: blocks.length, atomEntryCount: blocks.length, firstEntriesSanitized, entries: blocks.map((block) => {
    const authorBlock = /<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(block)?.[1] ?? "";
    const title = xmlTag(block, "title");
    const content = xmlTag(block, "summary") || xmlTag(block, "content");
    const link = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] ?? "";
    return activityEntry({ title, author: xmlTag(authorBlock, "name") || xmlTag(authorBlock, "email") || decodeXmlText(authorBlock), authorEmail: xmlTag(authorBlock, "email"), time: xmlTag(block, "updated") || xmlTag(block, "published") || xmlTag(block, "date"), content, link, raw: block }, variant, runId);
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
  const parsedEntries = parsedFeed.entries.filter((entry) => entry.extractedIssueKeysPerEntry.length > 0);
  const skippedEntries = parsedFeed.entries.map((entry, entryIndex) => ({ entry, entryIndex })).filter(({ entry }) => entry.extractedIssueKeysPerEntry.length === 0);
  const parsedRatio = parsedFeed.atomEntryCount > 0 ? parsedEntries.length / parsedFeed.atomEntryCount : 1;
  const parserAnomaly = parsedFeed.atomEntryCount > 0 && parsedRatio < 0.5 || parsedFeed.atomEntryCount >= 20 && parsedEntries.length <= 1;
  const parserDiagnostics = {
    atomEntryCount: parsedFeed.atomEntryCount,
    parsedEntryCount: parsedEntries.length,
    skippedEntryCount: skippedEntries.length,
    entriesWithoutIssueKeyCount: skippedEntries.length,
    entriesWithoutAuthorCount: parsedFeed.entries.filter((entry) => !entry.activityAuthor && !entry.activityAuthorEmail).length,
    entriesWithoutTimeCount: parsedFeed.entries.filter((entry) => !entry.activityTime).length,
    entriesWithoutTitleCount: parsedFeed.entries.filter((entry) => !entry.activityTitle).length,
    entriesWithMultipleIssueKeysCount: parsedFeed.entries.filter((entry) => entry.extractedIssueKeysPerEntry.length > 1).length,
    parserErrorCount: 0,
    parserErrorsSanitized: [] as string[],
    skippedEntriesSanitized: skippedEntries.slice(0, 5).map(({ entry, entryIndex }) => ({ entryIndex, reason: "no_issue_key", rawTitleText: entry.activityTitle.slice(0, 500), rawUpdatedText: entry.activityTime.slice(0, 500), rawAuthorText: (entry.activityAuthor || entry.activityAuthorEmail).slice(0, 500) })),
    parserAnomaly,
    parserAnomalyReason: parserAnomaly ? "Parsed entry ratio below 50%" : ""
  };
  const diagnosis: ActivityStreamDiagnosis = blocked ? "blocked" : isHtml ? "html_login" : !response.ok ? "http_error" : parsedEntries.length > 0 ? "parsed" : parsedFeed.rawEntryCount > 0 ? "parser_failed" : "no_entries";
  const status = diagnosis === "parsed" || diagnosis === "no_entries" ? "success" : endpointUnavailable || blocked ? "unsupported" : "failed";
  return {
    runId,
    variant,
    reachable: !blocked && response.status !== "-",
    parsed: diagnosis === "parsed",
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
    error: response.ok ? (diagnosis === "parser_failed" ? "Activity Stream entries were found, but no Jira issue keys could be parsed." : "") : isHtml ? "Activity Stream returned HTML or a login page." : precisionError(response),
    rawSummary: response.bodyPreview ?? "",
    parserDiagnostics
  };
}

function escapeActivityStreamUser(user: string) {
  return user.replace(/(^|[^\\])_/g, "$1\\_");
}

function createActivityStreamRunId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ]/g, "").slice(0, 17);
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
      : mode === "email" ? [{ variant: "email", user: email }]
        : seed.includes("@") ? [{ variant: "email", user: email }, { variant: "username", user: username }, { variant: "escaped_username", user: escapedUsername }]
          : [{ variant: "username", user: username }, { variant: "escaped_username", user: escapedUsername }, { variant: "email", user: email }];
  const seen = new Set<string>();
  return candidates.filter((candidate) => candidate.user && !seen.has(candidate.user.toLowerCase()) && seen.add(candidate.user.toLowerCase()));
}

function aggregateActivityStream(variantResults: ReturnType<typeof activityStreamResult>[], fallbackUser: string) {
  const ranked = [...variantResults].sort((a, b) => Number(b.parsed) - Number(a.parsed) || b.atomEntryCount - a.atomEntryCount || Number(b.reachable) - Number(a.reachable));
  const best = ranked[0];
  const activityStreamIssueKeys = Array.from(new Set(variantResults.flatMap((result) => result.parsedIssueKeys))).sort();
  const parsed = activityStreamIssueKeys.length > 0;
  const reachable = variantResults.some((result) => result.reachable);
  const supported = variantResults.some((result) => result.supported === "yes") ? "yes" : variantResults.every((result) => result.supported === "no") ? "no" : "unknown";
  const diagnosis: ActivityStreamDiagnosis = parsed ? "parsed" : variantResults.some((result) => result.diagnosis === "no_entries") ? "no_entries" : best?.diagnosis ?? "unknown";
  const overallStatus = parsed ? "success" : reachable && supported === "yes" ? "partial" : "failed";
  return {
    runId: best?.runId ?? variantResults[0]?.runId ?? "",
    status: parsed || diagnosis === "no_entries" ? "success" : supported === "no" ? "unsupported" : "failed",
    overallStatus,
    reachable,
    supported,
    parsed,
    diagnosis,
    bestVariant: best?.variant ?? "",
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
    entriesSanitized: variantResults.flatMap((result) => result.entriesSanitized),
    firstEntriesSanitized: best?.firstEntriesSanitized ?? [],
    error: parsed || diagnosis === "no_entries" ? "" : best?.error || "Activity Stream could not be parsed.",
    rawSummary: best?.rawSummary ?? "",
    parserDiagnostics: best?.parserDiagnostics ?? { atomEntryCount: 0, parsedEntryCount: 0, skippedEntryCount: 0, entriesWithoutIssueKeyCount: 0, entriesWithoutAuthorCount: 0, entriesWithoutTimeCount: 0, entriesWithoutTitleCount: 0, entriesWithMultipleIssueKeysCount: 0, parserErrorCount: 0, parserErrorsSanitized: [], skippedEntriesSanitized: [], parserAnomaly: false, parserAnomalyReason: "" }
  };
}

async function runActivityStreamProbe(connection: AppConnection, selectedUsers: string[], user: string, queryMode: ActivityStreamQueryMode, startDate: string, endDate: string, maxResults: number, relativeLinks = true, requestedRunId?: string) {
  const runId = requestedRunId || createActivityStreamRunId();
  const startedAt = new Date().toISOString();
  const requestMaxResults = maxResults === 0 ? 1 : Math.min(Math.max(maxResults || 10, 1), 50);
  const variants = activityStreamVariants(connection, selectedUsers, user, queryMode);
  const logs = [
    `[USER_ACTION] Run Activity Stream Probe: runId=${runId} mode=${queryMode} user=${user || "auto"}`,
    `[INFO] Activity Stream probe started: runId=${runId} mode=${queryMode} variants=${variants.map((item) => `${item.variant}:${item.user}`).join(",")} date=${startDate}..${endDate}`,
    `[INFO] Activity Stream variants planned: ${variants.map((item) => `${item.variant}=${item.user}`).join(" ")}`,
    "[INFO] Authorization: [masked]",
    "[INFO] Token: [masked]"
  ];
  const client = isUiSmoke ? null : createJiraClient({ baseUrl: connection.baseUrl, email: connection.email || connection.username, apiToken: connection.apiToken ?? "", authType: connection.authType });
  const variantResults = [] as ReturnType<typeof activityStreamResult>[];
  for (const variant of variants) {
    if (isUiSmoke) await new Promise((resolve) => setTimeout(resolve, 25));
    const params = new URLSearchParams({ maxResults: String(requestMaxResults), relativeLinks: String(relativeLinks), streams: `user IS ${variant.user}`, startDate, endDate });
    const requestUrlSanitized = `/plugins/servlet/streams?${params.toString()}`;
    logs.push(`[INFO] Activity Stream variant started: variant=${variant.variant} user=${variant.user}`, `[DEBUG] GET ${requestUrlSanitized} (credentials masked)`);
    let result: ReturnType<typeof activityStreamResult>;
    if (isUiSmoke) {
      const response = variant.variant === "escaped_username"
        ? { ok: true, status: 200, contentType: "application/atom+xml", bodyTextSanitized: `<feed><entry><title type="html">created a link from <a href="/browse/SMOKE-101">SMOKE-101</a></title><author><name>Smoke User</name><email>smoke.user@example.com</email></author><published>2026-07-02T09:00:00Z</published><activity:object><title>SMOKE-101</title><summary>Smoke fixture</summary></activity:object></entry></feed>`, bodyPreview: "", json: null } as JiraHttpResult
        : variant.variant === "username"
        ? { ok: true, status: 200, contentType: "application/atom+xml", bodyTextSanitized: "<feed></feed>", bodyPreview: "", json: null } as JiraHttpResult
        : { ok: true, status: 200, contentType: "application/atom+xml", bodyTextSanitized: "<feed></feed>", bodyPreview: "", json: null } as JiraHttpResult;
      result = activityStreamResult(response, requestUrlSanitized, variant.user, variant.variant, runId);
    } else {
      result = activityStreamResult(await client!.get(requestUrlSanitized), requestUrlSanitized, variant.user, variant.variant, runId);
    }
    variantResults.push(result);
    logs.push(`${result.parsed ? "[INFO]" : "[WARN]"} Activity Stream variant completed: variant=${variant.variant} httpStatus=${result.httpStatus} diagnosis=${result.diagnosis} atomEntries=${result.atomEntryCount} parsedActivities=${result.parsedActivityCount} parsedIssueKeys=${result.parsedIssueKeys.length}`);
  }
  const activityStream = aggregateActivityStream(variantResults, user);
  logs.push(`[INFO] Activity Stream best variant: ${activityStream.bestVariant || "none"}`, `[INFO] Activity Stream probe completed: overallStatus=${activityStream.overallStatus} bestVariant=${activityStream.bestVariant || "none"} diagnosis=${activityStream.diagnosis} parsedIssueKeys=${activityStream.activityStreamIssueKeys.length}`, "[INFO] No database write performed", "[INFO] No Jira write performed");
  return { runId, startedAt, completedAt: new Date().toISOString(), activityStream, logs };
}

ipcMain.handle("user-analysis:activity-stream-probe", async (_event, payload: { connection: AppConnection; selectedUsers?: string[]; activityStreamUser: string; queryMode?: ActivityStreamQueryMode; startDate: string; endDate: string; maxResults: 0 | 10 | 20 | 50; relativeLinks?: boolean; runId?: string }) => {
  return runActivityStreamProbe(payload.connection, payload.selectedUsers ?? [], String(payload.activityStreamUser || "").trim(), payload.queryMode ?? "auto", payload.startDate, payload.endDate, Number(payload.maxResults), payload.relativeLinks !== false, payload.runId);
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
  maxResults: 0 | 10 | 20 | 50;
  broadJql: string;
}) => {
  const selectedUsers = Array.from(new Set((payload.selectedUsers ?? []).map(String).map((item) => item.trim()).filter(Boolean)));
  const requestedMaxResults = [0, 10, 20, 50].includes(Number(payload.maxResults)) ? Number(payload.maxResults) : 10;
  const requestMaxResults = requestedMaxResults === 0 ? 1 : requestedMaxResults;
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
    const activityStreamRun = await runActivityStreamProbe(connection, selectedUsers, payload.activityStreamUser || "smoke.user@example.com", payload.activityStreamQueryMode ?? "auto", payload.startInclusive, payload.endExclusive, requestedMaxResults, payload.activityStreamRelativeLinks !== false, payload.activityStreamRunId);
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
  const activityStreamRun = await runActivityStreamProbe(connection, selectedUsers, activityStreamUser, payload.activityStreamQueryMode ?? "auto", payload.startInclusive, payload.endExclusive, requestedMaxResults, payload.activityStreamRelativeLinks !== false, payload.activityStreamRunId);
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
    { name: "parser_failed", response: { ok: true, status: 200, contentType: "application/atom+xml", json: null, bodyTextSanitized: "<feed><entry><title>Updated an issue</title><summary>No key in this fixture</summary></entry></feed>" }, expectedStatus: "failed", expectedIssueCount: 0, expectedDiagnosis: "parser_failed", expectedAtomEntries: 1 },
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
  if (!anomalyResult.parserDiagnostics.parserAnomaly || anomalyResult.parserDiagnostics.atomEntryCount !== 20 || anomalyResult.parserDiagnostics.parsedEntryCount !== 1 || anomalyResult.parserDiagnostics.skippedEntryCount !== 19 || anomalyResult.parserDiagnostics.skippedEntriesSanitized.length !== 5) failures.push(`activity stream parser anomaly diagnostics failed: ${JSON.stringify(anomalyResult.parserDiagnostics)}`);
  const typeFixtures: Array<[string, ActivityStreamEntry["activityType"]]> = [["attached one file to COPGEN1-1", "attachment"], ["changed the status", "status"], ["changed the Assignee", "assignee_change"], ["updated the Description", "description_update"], ["updated the Priority", "field_change"], ["commented on COPGEN1-1", "comment"], ["created a link from COPGEN1-1", "link"], ["Confluence page edited", "page"], ["performed an activity", "unknown"]];
  for (const [textValue, expected] of typeFixtures) if (activityType(textValue) !== expected) failures.push(`activity type classification failed: ${textValue} => ${activityType(textValue)} expected ${expected}`);
  window.setSize(1280, 720, false);
  await window.webContents.executeJavaScript(`window.location.hash = "#/analysis";`);
  await wait(350);
  const analysisWorkflowAudit = await window.webContents.executeJavaScript(`(() => ({ count: document.querySelectorAll("[data-testid^='workflow-']").length, hasPrecisionTab: Boolean(document.querySelector("[data-testid='workflow-precision']")) }))()`);
  if (analysisWorkflowAudit.count !== 4 || analysisWorkflowAudit.hasPrecisionTab) failures.push(`User Analysis workflow was not restored to four steps: ${JSON.stringify(analysisWorkflowAudit)}`);
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("a")).find((link) => link.getAttribute("href") === "#/precision-probe")?.click();`);
  await wait(350);
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
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-activity-stream']")?.click();`);
  await wait(10);
  const runningAudit = await window.webContents.executeJavaScript(`(() => ({ banner: Boolean(document.querySelector("[data-testid='activity-stream-running']")), runId: document.body.innerText.includes("asrun-"), autoDisabled: document.querySelector("[data-testid='run-activity-stream']")?.disabled === true, precisionDisabled: document.querySelector("[data-testid='run-precision-probe']")?.disabled === true, manualDisabled: document.querySelector("[data-testid='run-manual-activity-stream']")?.disabled === true }))()`);
  await wait(350);
  const activityStreamAudit = await window.webContents.executeJavaScript(`(() => ({ rows: document.querySelectorAll("[data-testid='activity-stream-results'] tbody tr").length, variantRows: document.querySelectorAll("[data-testid='activity-stream-variants'] tbody tr").length, mode: document.querySelector("[data-testid='activity-stream-query-mode']")?.value, hasEmailInput: Boolean(document.querySelector("[data-testid='activity-stream-user']")), issueKey: document.body.innerText.includes("SMOKE-101"), hasUsername: document.body.innerText.includes("username"), hasEscaped: document.body.innerText.includes("escaped_username"), hasEmail: document.body.innerText.includes("email"), relativeLinks: document.body.innerText.includes("relativeLinks=true"), diagnosis: document.body.innerText.includes("no_entries") && document.body.innerText.includes("parsed"), contentType: document.body.innerText.includes("application/atom+xml") }))()`);
  await window.webContents.executeJavaScript(`
    (() => {
      const max = document.querySelector("[data-testid='probe-max-results']");
      if (max instanceof HTMLSelectElement) { const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set; setter?.call(max, "20"); max.dispatchEvent(new Event("change", { bubbles: true })); }
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
  const manualReplayAudit = await window.webContents.executeJavaScript(`(() => ({ accepted: document.body.innerText.includes("Manual URL validated"), manualVariant: document.body.innerText.includes("manual_url"), escapedVariant: document.body.innerText.includes("escaped_username"), issueKey: document.body.innerText.includes("COPGEN1-138930"), authorEmail: document.body.innerText.includes("roger_hsieh@phison.com"), linkType: document.body.innerText.includes("link") }))()`);
  await window.webContents.executeJavaScript(`(() => { const max = document.querySelector("[data-testid='probe-max-results']"); if (max instanceof HTMLSelectElement) { const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set; setter?.call(max, "50"); max.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
  await wait(100);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='run-precision-probe']")?.click();`);
  await wait(750);
  const precisionAudit = await window.webContents.executeJavaScript(`
    (() => ({
      panel: document.body.innerText.includes("User Activity Precision Probe"),
      rows: document.querySelectorAll("[data-testid='precision-results-table'] tbody tr").length,
      recommendation: document.querySelector("[data-testid='precision-recommendation']")?.textContent || "",
      hasUpdatedBy: document.body.innerText.includes("updatedBy Candidate JQL"),
      hasUnsupported: document.body.innerText.includes("unsupported"),
      preciseCount: document.body.innerText.includes("SMOKE-101") && document.body.innerText.includes("SMOKE-102")
    }))()
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
  const precisionFullFetchFilesAfter = fs.existsSync(getFullFetchLogsDir()) ? fs.readdirSync(getFullFetchLogsDir()) : [];
  const precisionActionLogBuffer = fs.existsSync(precisionActionLogPath) ? fs.readFileSync(precisionActionLogPath) : Buffer.alloc(0);
  const precisionActionTimeline = precisionActionLogBuffer.subarray(precisionActionLogStartSize).toString("utf8");
  const precisionUnexpectedFullFetchFiles = precisionFullFetchFilesAfter.filter((name) => !precisionFullFetchFilesBefore.has(name));
  if (!runningAudit.banner || !runningAudit.runId || !runningAudit.autoDisabled || !runningAudit.precisionDisabled || !runningAudit.manualDisabled) failures.push(`activity stream running lock audit failed ${JSON.stringify(runningAudit)}`);
  if (!activityStreamAudit.hasEmailInput || activityStreamAudit.mode !== "auto" || !activityStreamAudit.issueKey || !activityStreamAudit.contentType || !activityStreamAudit.hasUsername || !activityStreamAudit.hasEscaped || !activityStreamAudit.hasEmail || !activityStreamAudit.relativeLinks || !activityStreamAudit.diagnosis || activityStreamAudit.rows !== 1 || activityStreamAudit.variantRows !== 3) failures.push(`activity stream UI audit failed ${JSON.stringify(activityStreamAudit)}`);
  if (!manualReplayAudit.accepted || !manualReplayAudit.manualVariant || !manualReplayAudit.escapedVariant || !manualReplayAudit.issueKey || !manualReplayAudit.authorEmail || !manualReplayAudit.linkType) failures.push(`manual replay UI audit failed ${JSON.stringify(manualReplayAudit)}`);
  if (!precisionAudit.panel || precisionAudit.rows !== 6 || !precisionAudit.recommendation.includes("activity_stream") || !precisionAudit.hasUpdatedBy || !precisionAudit.hasUnsupported || !precisionAudit.preciseCount) failures.push(`precision probe UI audit failed ${JSON.stringify(precisionAudit)}`);
  if (filterAudit.rows !== 1 || !filterAudit.hasFilteredStats || filterAudit.issue !== "SMOKE-101" || filterAudit.author !== "Smoke User" || !filterAudit.onlyKey || !filterAudit.activityTypes.includes("link") || !filterAudit.variants.includes("escaped_username") || !filterAudit.sources.includes("activity_stream")) failures.push(`parsed entries filter UI audit failed ${JSON.stringify(filterAudit)}`);
  if (historyAudit.rows !== 3 || !historyAudit.text.includes("10") || !historyAudit.text.includes("20") || !historyAudit.text.includes("50") || !historyAudit.text.includes("manual") || !historyAudit.text.includes("precision")) failures.push(`activity stream run history audit failed ${JSON.stringify(historyAudit)}`);
  if (!precisionQueueAudit.noAutoFetch || !precisionQueueAudit.addEnabled) failures.push(`precision probe queue audit failed ${JSON.stringify(precisionQueueAudit)}`);
  if (precisionUnexpectedFullFetchFiles.length > 0) failures.push(`precision probe add-to-queue started Full Fetch ${JSON.stringify(precisionUnexpectedFullFetchFiles)}`);
  const precisionIssueKeySets = asRecord(precisionExport?.issueKeySets);
  const exportedVariants = Array.isArray(precisionActivityStream.variantResults) ? precisionActivityStream.variantResults.map(asRecord) : [];
  if (!precisionExport || precisionExport.exportType !== "user-activity-precision-probe" || !Array.isArray(precisionExport.probeResults) || !precisionExport.summary || !precisionExport.requestContext || !precisionExport.debugLogNote || !precisionActionDiagnostics.actionLogPath || !String(precisionActivityStream.runId).startsWith("asrun-") || Number(precisionActivityStream.parsedActivityCount) < 1 || !Array.isArray(precisionActivityStream.entriesSanitized) || exportedVariants.length !== 3 || exportedVariants.some((variant) => variant.runId !== precisionActivityStream.runId) || Number(precisionParserDiagnostics.parsedEntryCount) !== 1 || !Array.isArray(precisionIssueKeySets.recommendedIssueKeys) || !precisionIssueKeySets.recommendedIssueKeys.includes("SMOKE-101") || !Array.isArray(precisionExport.activityStreamRunHistory) || precisionExport.activityStreamRunHistory.length !== 3 || !Array.isArray(precisionExport.filteredEntriesSanitized) || precisionExport.filteredEntriesSanitized.length !== 1 || precisionFilter.issueKeyQuery !== "SMOKE-101" || Number(precisionFilterStats.filteredEntries) !== 1) failures.push(`precision probe export structure failed files=${JSON.stringify(precisionExportFiles)}`);
  if (precisionSource.token !== "[masked]" || precisionSource.authorization !== "[masked]" || precisionSource.readOnly !== true || precisionSource.databaseWrite !== false || precisionSource.attachmentDownload !== false) failures.push(`precision probe export safety flags/masking failed ${JSON.stringify(precisionSource)}`);
  const requiredPrecisionActions = ["Navigation clicked: User Activity Precision Probe", "Activity Stream Query Mode changed: value=auto", "Activity Stream User changed: value=smoke_user@example.com", "Button clicked: Run Activity Stream Probe", "Manual Activity Stream URL changed", "Button clicked: Run Manual URL Replay", "Button clicked: Run Precision Probe", "Button clicked: Add Precise Candidates to Fetch Queue", "Button clicked: Save Precision Probe Result"];
  const missingPrecisionActions = requiredPrecisionActions.filter((entry) => !precisionActionTimeline.includes(entry));
  if (missingPrecisionActions.length > 0) failures.push(`precision probe action log missing ${JSON.stringify(missingPrecisionActions)}`);
  await window.webContents.executeJavaScript(`document.querySelector("[data-testid='reset-entry-filters']")?.click();`);
  await wait(150);
  const resetFilterAudit = await window.webContents.executeJavaScript(`(() => ({ issue: document.querySelector("[data-testid='filter-issue-key']")?.value, author: document.querySelector("[data-testid='filter-author']")?.value, onlyKey: document.querySelector("[data-testid='filter-only-key']")?.checked, activityTypes: document.querySelector("[data-testid='filter-activity-types']")?.selectedOptions.length, variants: document.querySelector("[data-testid='filter-variants']")?.selectedOptions.length, sources: document.querySelector("[data-testid='filter-sources']")?.selectedOptions.length, rows: document.querySelectorAll("[data-testid='activity-stream-results'] tbody tr").length }))()`);
  if (resetFilterAudit.issue !== "" || resetFilterAudit.author !== "" || resetFilterAudit.onlyKey || resetFilterAudit.activityTypes !== 0 || resetFilterAudit.variants !== 0 || resetFilterAudit.sources !== 0 || resetFilterAudit.rows < 1) failures.push(`parsed entries filter reset audit failed ${JSON.stringify(resetFilterAudit)}`);

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
