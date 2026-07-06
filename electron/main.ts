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

async function jiraGet(baseUrl: string, pathName: string, email: string, apiToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const authorization = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const response = await fetch(`${baseUrl}${pathName}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`
      },
      signal: controller.signal
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

function endpoint(endpoint: string, status: EndpointStatus, httpCode: number | "-", records: string, usefulLevel: "High" | "Medium" | "Low", notes: string) {
  return { endpoint, status, httpCode, records, usefulLevel, notes };
}

async function runApiProbe(request: ProbeRequest) {
  const baseUrl = request.connection.baseUrl.trim().replace(/\/+$/, "");
  const issueKey = normalizeIssueKey(request.issueKey);
  const email = request.connection.email.trim();
  const apiToken = request.connection.apiToken;
  const endpoints = [];
  const debugLogs = [
    "[INFO] Initialize Jira Probe page",
    `[INFO] Selected connection: ${request.connection.name || "Custom Jira Cloud"}`,
    "[INFO] Running read-only Jira Probe",
    "[INFO] Token: [masked]",
    "[INFO] Authorization: [masked]",
    "[INFO] No database write performed",
    `[INFO] Running probe for ${issueKey}`
  ];

  if (!baseUrl || !email || !apiToken || !issueKey) {
    throw new Error("Base URL, email, token, and issue key are required.");
  }

  debugLogs.push("[DEBUG] GET /rest/api/3/myself");
  const myself = await jiraGet(baseUrl, "/rest/api/3/myself", email, apiToken);
  endpoints.push(endpoint("Get Myself", myself.ok ? "success" : myself.status === 403 ? "forbidden" : "failed", myself.status, myself.ok ? "1" : "0", "High", myself.ok ? "Token can resolve current user" : "Authentication or permission failed"));

  debugLogs.push(`[DEBUG] GET /rest/api/3/issue/${issueKey}`);
  const issue = await jiraGet(baseUrl, `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names,schema,renderedFields`, email, apiToken);
  endpoints.push(endpoint("Get Issue", issue.ok ? "success" : issue.status === 403 ? "forbidden" : "failed", issue.status, issue.ok ? "1" : "0", "High", issue.ok ? "Basic fields available" : "Issue not found or not readable"));

  const fields = issue.ok && issue.json && typeof issue.json === "object" ? (issue.json as { fields?: Record<string, unknown> }).fields ?? {} : {};
  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  let changelogTotal = 0;
  let changelogItems = 0;
  let commentCount = 0;
  const worklogCount = 0;

  let changelog: Awaited<ReturnType<typeof jiraGet>> | null = null;
  if (request.depth !== "basic") {
    debugLogs.push(`[DEBUG] GET /rest/api/3/issue/${issueKey}/changelog`);
    changelog = await jiraGet(baseUrl, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?maxResults=100`, email, apiToken);
    const values = changelog.ok && changelog.json && typeof changelog.json === "object" && Array.isArray((changelog.json as { values?: unknown[] }).values) ? (changelog.json as { values: Array<{ items?: unknown[] }> }).values : [];
    changelogTotal = values.length;
    changelogItems = values.reduce((total, history) => total + (Array.isArray(history.items) ? history.items.length : 0), 0);
    endpoints.push(endpoint("Changelog", changelog.ok ? "success" : changelog.status === 403 ? "forbidden" : "failed", changelog.status, `${changelogTotal} histories / ${changelogItems} items`, "High", changelog.ok ? "Can build field_changed events" : "Changelog unavailable"));

    debugLogs.push(`[DEBUG] GET /rest/api/3/issue/${issueKey}/comment`);
    const comments = await jiraGet(baseUrl, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?maxResults=100`, email, apiToken);
    commentCount = comments.ok && comments.json && typeof comments.json === "object" && Array.isArray((comments.json as { comments?: unknown[] }).comments) ? (comments.json as { comments: unknown[] }).comments.length : 0;
    endpoints.push(endpoint("Comments", comments.ok ? "success" : comments.status === 403 ? "forbidden" : "failed", comments.status, String(commentCount), "High", comments.ok ? "Can build comment events" : "Comments unavailable"));
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

  debugLogs.push(`[SUCCESS] Probe completed. Coverage Score: ${coverageScore}%`);

  return {
    mode: "api",
    issueKey,
    depth: request.depth,
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
