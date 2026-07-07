import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, getAppRuntimeDir, getBackupsDir, getConfigDir, getConfigPath, getConnectionsPath, getDatabaseDir, getDefaultEnvPath, getEnvPath, getExportsDir, getLogsDir, getProbeResultsDir, getRawDataDir } from "./appPaths.js";
import { createJiraClient } from "./jira/jiraClient.js";
import { ensureExportFolders, saveExportJson } from "./export/exportService.js";
import { runApiProbe } from "./jira/jiraProbeRunner.js";
import { sanitizeRawJson } from "./jira/safeJson.js";
import type { ProbeRequest } from "./jira/jiraTypes.js";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === "1";
const isUiSmoke = process.env.ELECTRON_UI_SMOKE === "1";
const shouldCaptureUi = process.env.ELECTRON_UI_CAPTURE === "1";
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

ipcMain.handle("user-analysis:save-export", async (_event, payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => {
  return saveExportJson(payload);
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
  fs.writeFileSync(result.filePath, payload.content, "utf8");
  return { canceled: false, filePath: result.filePath, folderPath: outputDir };
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
  });

  window.on("unresponsive", () => {
    console.error("[window unresponsive]");
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
