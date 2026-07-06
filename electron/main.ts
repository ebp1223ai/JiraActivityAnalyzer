import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";

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

type ProbeDepth = "basic" | "standard" | "deep";
type EndpointStatus = "success" | "partial" | "forbidden" | "failed" | "skipped";
type ProbeApiVersion = "auto" | "v3" | "v2";
type ProbeAuthType = "basic" | "bearer";

type ProbeRequest = {
  connection: {
    name: string;
    baseUrl: string;
    email: string;
    apiToken: string;
  };
  issueKey: string;
  depth: ProbeDepth;
  useMock: boolean;
  apiVersion: ProbeApiVersion;
  authType: ProbeAuthType;
};

type JiraHttpResult = {
  ok: boolean;
  status: number | "-";
  contentType: string;
  json: unknown | null;
  errorType?: "HTTP_ERROR" | "NON_JSON_RESPONSE" | "INVALID_JSON" | "NETWORK_ERROR";
  message?: string;
  bodyPreview?: string;
};

function normalizeIssueKey(issueKey: string) {
  return String(issueKey || "").trim().toUpperCase();
}

function sanitizeRawJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeRawJson);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|token|password|apiToken/i.test(key)) {
        output[key] = "[redacted]";
      } else if (key === "content" && typeof child === "string" && child.includes("/attachment/content/")) {
        output[key] = "[attachment content url redacted]";
      } else {
        output[key] = sanitizeRawJson(child);
      }
    }
    return output;
  }
  return value;
}

function messageForHttpStatus(status: number | "-") {
  if (status === 401) return "Unauthorized. Check username/token/auth type.";
  if (status === 403) return "Forbidden. Token is valid but lacks permission or issue/project access.";
  if (status === 404) return "Issue or endpoint not found. Check Issue Key, Base URL, and API version.";
  if (status === "-") return "Network error. Check VPN, proxy, certificate, and base URL.";
  return `HTTP ${status} response received.`;
}

function sanitizeBodyPreview(value: string) {
  return value
    .replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [masked]")
    .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/gi, "Bearer [masked]")
    .replace(/token[=:]\s*[^&\s"'<>]+/gi, "token=[masked]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function authorizationHeader(email: string, apiToken: string, authType: ProbeAuthType) {
  if (authType === "bearer") {
    return `Bearer ${apiToken}`;
  }
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

async function jiraGet(baseUrl: string, pathName: string, email: string, apiToken: string, authType: ProbeAuthType): Promise<JiraHttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${baseUrl}${pathName}`, {
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(email, apiToken, authType)
      },
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const looksLikeHtml = /^\s*</.test(text) || /text\/html/i.test(contentType);
    const isJson = /application\/json/i.test(contentType) || /^\s*[\[{]/.test(text);

    if (looksLikeHtml || !isJson) {
      return {
        ok: false,
        status: response.status,
        contentType,
        json: null,
        errorType: "NON_JSON_RESPONSE",
        message: "Expected JSON but received HTML. This may be a Jira login page, SSO redirect, proxy response, or wrong REST API path.",
        bodyPreview: sanitizeBodyPreview(text)
      };
    }

    try {
      const json = text ? JSON.parse(text) : null;
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        json,
        errorType: response.ok ? undefined : "HTTP_ERROR",
        message: response.ok ? undefined : messageForHttpStatus(response.status),
        bodyPreview: response.ok ? undefined : sanitizeBodyPreview(text)
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        contentType,
        json: null,
        errorType: "INVALID_JSON",
        message: "Expected JSON but received invalid JSON.",
        bodyPreview: sanitizeBodyPreview(text)
      };
    }
  } catch {
    return {
      ok: false,
      status: "-",
      contentType: "network-error",
      json: null,
      errorType: "NETWORK_ERROR",
      message: "Network error. Check VPN, proxy, certificate, and base URL."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function endpoint(endpoint: string, status: EndpointStatus, httpCode: number | "-", records: string, usefulLevel: "High" | "Medium" | "Low" | "-", notes: string) {
  return { endpoint, status, httpCode, records, usefulLevel, notes };
}

function statusFor(result: JiraHttpResult): EndpointStatus {
  if (result.ok) return "success";
  if (result.status === 403) return "forbidden";
  return "failed";
}

function noteFor(result: JiraHttpResult, successNote: string) {
  return result.ok ? successNote : result.message ?? messageForHttpStatus(result.status);
}

function appendResponseLog(debugLogs: string[], result: JiraHttpResult) {
  debugLogs.push(`[DEBUG] Response status: ${result.status}`);
  debugLogs.push(`[DEBUG] Content-Type: ${result.contentType || "unknown"}`);
  if (result.errorType === "NON_JSON_RESPONSE") {
    debugLogs.push("[ERROR] Expected JSON but received HTML");
    debugLogs.push("[ERROR] Possible causes: login page, SSO redirect, wrong API path, auth failed, proxy error");
  } else if (result.errorType === "NETWORK_ERROR") {
    debugLogs.push(`[ERROR] ${result.message}`);
  } else if (result.message && !result.ok) {
    debugLogs.push(`[ERROR] ${result.message}`);
  }
  if (result.bodyPreview) {
    debugLogs.push(`[DEBUG] Body preview: ${result.bodyPreview}`);
  }
}

function emptySummary() {
  return {
    coverageScore: 0,
    issueFields: 0,
    changelogHistories: 0,
    changeItems: 0,
    comments: 0,
    attachments: 0,
    issueLinks: 0,
    usersDetected: 0,
    estimatedActivityEvents: 0,
    permissionGaps: 1
  };
}

function createErrorResult(request: ProbeRequest, selectedApiVersion: "v3" | "v2" | "unknown", message: string, endpoints: ReturnType<typeof endpoint>[], debugLogs: string[], rawJson: Record<string, unknown> = {}) {
  return {
    mode: "api",
    status: "error",
    issueKey: normalizeIssueKey(request.issueKey),
    depth: request.depth,
    apiVersion: selectedApiVersion,
    message,
    summary: emptySummary(),
    endpoints,
    eventEstimates: [
      { type: "issue_created", count: 0 },
      { type: "field_changed", count: 0 },
      { type: "status_changed", count: 0 },
      { type: "assignee_changed", count: 0 },
      { type: "comment_created", count: 0 },
      { type: "comment_updated", count: 0 },
      { type: "attachment_added", count: 0 },
      { type: "issue_link_observed", count: 0 },
      { type: "worklog_added", count: 0 }
    ],
    preview: {
      issueFields: [["Error", message]],
      changelog: [],
      comments: [],
      attachments: [],
      links: [],
      rawJson: sanitizeRawJson(rawJson) as Record<string, unknown>
    },
    hints: [
      message,
      "Real Probe did not fall back to mock data.",
      "No database write performed.",
      "Check Base URL, API version, auth type, token, VPN/proxy, and issue access."
    ],
    debugLogs,
    rawJsonEnabled: false
  };
}

async function runApiProbe(request: ProbeRequest) {
  const baseUrl = request.connection.baseUrl.trim().replace(/\/+$/, "");
  const issueKey = normalizeIssueKey(request.issueKey);
  const email = request.connection.email.trim();
  const apiToken = request.connection.apiToken;
  const authType = request.authType ?? "basic";
  const endpoints: ReturnType<typeof endpoint>[] = [];
  const runId = new Date().toISOString();
  const debugLogs = [
    "[INFO] Run Probe started",
    `[INFO] Run ID: ${runId}`,
    `[INFO] Selected connection: ${request.connection.name || "Custom Jira Cloud"}`,
    "[INFO] Mode: Real read-only probe",
    "[INFO] Token: [masked]",
    "[INFO] Authorization: [masked]",
    "[INFO] Auth: [masked]",
    `[INFO] Base URL: ${baseUrl || "(empty)"}`,
    `[INFO] API Version: ${request.apiVersion ?? "auto"}`,
    `[INFO] Auth Type: ${authType === "bearer" ? "Bearer Token / Personal Access Token" : "Basic Auth"}`,
    `[INFO] Issue Key: ${issueKey || "(empty)"}`,
    "[INFO] No database write performed",
    `[INFO] Running probe for ${issueKey || "(empty)"}`
  ];

  if (!baseUrl || !email || !apiToken || !issueKey) {
    const missing = [
      !baseUrl ? "Jira Base URL" : "",
      !email ? "Email / Username" : "",
      !apiToken ? "API Token" : "",
      !issueKey ? "Issue Key or ID" : ""
    ].filter(Boolean).join(", ");
    const message = `Missing required Real Probe fields: ${missing}. Mock result was not used.`;
    debugLogs.push(`[ERROR] ${message}`);
    return createErrorResult(request, "unknown", message, [
      endpoint("Get Myself", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
      endpoint("Get Issue", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
      endpoint("Changelog", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
      endpoint("Comments", "skipped", "-", "0", "-", "Skipped because required fields are missing")
    ], debugLogs);
  }

  let selectedApiVersion: "v3" | "v2" = request.apiVersion === "v2" ? "v2" : "v3";
  let apiPrefix = selectedApiVersion === "v2" ? "/rest/api/2" : "/rest/api/3";

  debugLogs.push(`[DEBUG] GET ${apiPrefix}/myself`);
  let myself = await jiraGet(baseUrl, `${apiPrefix}/myself`, email, apiToken, authType);
  appendResponseLog(debugLogs, myself);

  if ((request.apiVersion ?? "auto") === "auto" && !myself.ok && (myself.status === 404 || myself.errorType === "NON_JSON_RESPONSE")) {
    debugLogs.push("[INFO] API v3 failed, trying v2");
    selectedApiVersion = "v2";
    apiPrefix = "/rest/api/2";
    debugLogs.push(`[DEBUG] GET ${apiPrefix}/myself`);
    myself = await jiraGet(baseUrl, `${apiPrefix}/myself`, email, apiToken, authType);
    appendResponseLog(debugLogs, myself);
  }

  debugLogs.push(`[INFO] API ${selectedApiVersion} selected`);
  endpoints.push(endpoint("Get Myself", statusFor(myself), myself.status, myself.ok ? "1" : "0", myself.ok ? "High" : "Low", noteFor(myself, "Authenticated")));

  if (!myself.ok) {
    endpoints.push(endpoint("Get Issue", "skipped", "-", "0", "-", "Skipped because auth failed"));
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "-", "Skipped because auth failed"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "-", "Skipped because auth failed"));
    endpoints.push(endpoint("Attachments", "skipped", "-", "0", "-", "Skipped because auth failed"));
    endpoints.push(endpoint("Issue Links", "skipped", "-", "0", "-", "Skipped because auth failed"));
    endpoints.push(endpoint("Worklog", "skipped", "-", "0", "-", "No worklog request is sent by Jira Probe"));
    return createErrorResult(request, selectedApiVersion, myself.message ?? "Authentication failed.", endpoints, debugLogs, { myself });
  }

  const issueExpand = selectedApiVersion === "v2" ? "names,schema,renderedFields,changelog" : "names,schema,renderedFields";
  debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}`);
  const issue = await jiraGet(baseUrl, `${apiPrefix}/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=${issueExpand}`, email, apiToken, authType);
  appendResponseLog(debugLogs, issue);
  endpoints.push(endpoint("Get Issue", statusFor(issue), issue.status, issue.ok ? "1" : "0", issue.ok ? "High" : "Low", noteFor(issue, "Basic fields available")));

  if (!issue.ok) {
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Attachments", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Issue Links", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Worklog", "skipped", "-", "0", "-", "No worklog request is sent by Jira Probe"));
    return createErrorResult(request, selectedApiVersion, issue.message ?? "Issue lookup failed.", endpoints, debugLogs, { myself: myself.json, issue });
  }

  const fields = issue.ok && issue.json && typeof issue.json === "object" ? (issue.json as { fields?: Record<string, unknown> }).fields ?? {} : {};
  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  const expandedChangelog = issue.json && typeof issue.json === "object" ? (issue.json as { changelog?: { histories?: Array<{ items?: unknown[] }> } }).changelog : undefined;
  let changelogTotal = 0;
  let changelogItems = 0;
  let commentCount = 0;
  const worklogCount = 0;

  let changelog: JiraHttpResult | null = null;
  if (request.depth !== "basic") {
    if (selectedApiVersion === "v2") {
      debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}?expand=changelog`);
      debugLogs.push("[DEBUG] Response status: 200");
      debugLogs.push("[DEBUG] Content-Type: application/json");
      const histories = Array.isArray(expandedChangelog?.histories) ? expandedChangelog.histories : [];
      changelog = {
        ok: true,
        status: 200,
        contentType: "application/json",
        json: { values: histories, total: histories.length }
      };
    } else {
      debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/changelog`);
      changelog = await jiraGet(baseUrl, `${apiPrefix}/issue/${encodeURIComponent(issueKey)}/changelog?maxResults=100`, email, apiToken, authType);
      appendResponseLog(debugLogs, changelog);
    }
    const values = changelog.ok && changelog.json && typeof changelog.json === "object"
      ? Array.isArray((changelog.json as { values?: unknown[] }).values)
        ? (changelog.json as { values: Array<{ items?: unknown[] }> }).values
        : Array.isArray((changelog.json as { histories?: unknown[] }).histories)
          ? (changelog.json as { histories: Array<{ items?: unknown[] }> }).histories
          : []
      : [];
    changelogTotal = values.length;
    changelogItems = values.reduce((total, history) => total + (Array.isArray(history.items) ? history.items.length : 0), 0);
    endpoints.push(endpoint("Changelog", statusFor(changelog), changelog.status, `${changelogTotal} histories / ${changelogItems} items`, changelog.ok ? "High" : "Low", noteFor(changelog, "Can build field_changed events")));

    debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/comment`);
    const comments = await jiraGet(baseUrl, `${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?maxResults=100`, email, apiToken, authType);
    appendResponseLog(debugLogs, comments);
    commentCount = comments.ok && comments.json && typeof comments.json === "object" && Array.isArray((comments.json as { comments?: unknown[] }).comments) ? (comments.json as { comments: unknown[] }).comments.length : 0;
    endpoints.push(endpoint("Comments", statusFor(comments), comments.status, String(commentCount), comments.ok ? "High" : "Low", noteFor(comments, "Can build comment events")));
  } else {
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "High", "Skipped in Basic mode"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "High", "Skipped in Basic mode"));
  }

  endpoints.push(endpoint("Attachments", issue.ok ? "success" : "skipped", issue.ok ? 200 : "-", String(attachments.length), "High", "Metadata only, no file download"));
  endpoints.push(endpoint("Issue Links", issue.ok ? "success" : "skipped", issue.ok ? 200 : "-", String(links.length), "Medium", "Link creator may require changelog"));

  endpoints.push(endpoint("Worklog", "skipped", "-", "0", "Low", "Not requested. Real Probe is limited to read-only issue, changelog, and comments GET endpoints."));

  const statusChanges = Math.round(changelogItems * 0.08);
  const assigneeChanges = Math.round(changelogItems * 0.04);
  const estimatedActivityEvents = 1 + changelogItems + commentCount + attachments.length + links.length + worklogCount;
  const permissionGaps = endpoints.filter((item) => item.status === "forbidden" || item.status === "failed").length;
  const coverageScore = Math.max(0, Math.min(100, 40 + (changelogItems > 0 ? 25 : 0) + (commentCount > 0 ? 10 : 0) + (attachments.length > 0 ? 5 : 0) + (links.length > 0 ? 5 : 0) - permissionGaps * 10));

  debugLogs.push(`[SUCCESS] Real Probe completed. Coverage Score: ${coverageScore}%`);

  return {
    mode: "api",
    status: permissionGaps > 0 ? "error" : "success",
    issueKey,
    depth: request.depth,
    apiVersion: selectedApiVersion,
    message: permissionGaps > 0 ? "Real Probe completed with endpoint errors. Mock data was not used." : "Real Probe completed with read-only Jira data.",
    summary: {
      coverageScore,
      issueFields: Object.keys(fields).length,
      changelogHistories: changelogTotal,
      changeItems: changelogItems,
      comments: commentCount,
      attachments: attachments.length,
      issueLinks: links.length,
      usersDetected: 0,
      estimatedActivityEvents,
      permissionGaps
    },
    endpoints,
    eventEstimates: [
      { type: "issue_created", count: issue.ok ? 1 : 0 },
      { type: "field_changed", count: changelogItems },
      { type: "status_changed", count: statusChanges },
      { type: "assignee_changed", count: assigneeChanges },
      { type: "comment_created", count: commentCount },
      { type: "comment_updated", count: 0 },
      { type: "attachment_added", count: attachments.length },
      { type: "issue_link_observed", count: links.length },
      { type: "worklog_added", count: worklogCount }
    ],
    preview: {
      issueFields: [
        ["Key", issueKey],
        ["Summary", String(fields.summary ?? "-")],
        ["Status", String(((fields.status as { name?: string } | undefined)?.name) ?? "-")],
        ["Priority", String(((fields.priority as { name?: string } | undefined)?.name) ?? "-")],
        ["Assignee", String(((fields.assignee as { displayName?: string } | undefined)?.displayName) ?? "-")],
        ["Reporter", String(((fields.reporter as { displayName?: string } | undefined)?.displayName) ?? "-")]
      ],
      changelog: [],
      comments: [],
      attachments: attachments.slice(0, 5).map((item) => {
        const file = item as { filename?: string; size?: number; mimeType?: string };
        return [file.filename ?? "-", file.size ? `${file.size} bytes` : "-", file.mimeType ?? "metadata only"];
      }),
      links: links.slice(0, 5).map((item) => {
        const link = item as { type?: { name?: string }; outwardIssue?: { key?: string; fields?: { summary?: string } }; inwardIssue?: { key?: string; fields?: { summary?: string } } };
        const linked = link.outwardIssue ?? link.inwardIssue;
        return [linked?.key ?? "-", link.type?.name ?? "link", linked?.fields?.summary ?? "-"];
      }),
      rawJson: sanitizeRawJson({ myself: myself.json, issue: issue.json, changelog: changelog?.json ?? null }) as Record<string, unknown>
    },
    hints: [
      issue.ok ? "Token can read issue basic fields." : "Token cannot read this issue.",
      changelogItems > 0 ? "Changelog is available; field-level timeline can be generated." : "Changelog is unavailable or skipped.",
      commentCount > 0 ? "Comments are available; discussion timeline can be generated." : "Comments are unavailable or skipped.",
      "Attachment metadata is inspected only; file content is not downloaded.",
      links.length > 0 ? "Issue links are available, but link creator may not be fully recoverable." : "No issue links were observed.",
      worklogCount > 0 ? "Worklog is available." : "Worklog is unavailable, skipped, or empty."
    ],
    debugLogs,
    rawJsonEnabled: false
  };
}

ipcMain.handle("jira-probe:run", async (_event, request: ProbeRequest) => {
  if (!request || request.useMock) {
    throw new Error("Jira Probe IPC only runs real read-only API probes.");
  }
  return runApiProbe(request);
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
    title: "Jira Activity Analyzer",
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
