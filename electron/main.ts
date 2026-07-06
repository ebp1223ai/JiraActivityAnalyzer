import { app, BrowserWindow, Menu, shell } from "electron";
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
  { name: "settings", hash: "#/settings", title: "Settings" }
];

const uiViewports = [
  { width: 1280, height: 720, capture: false },
  { width: 1366, height: 768, capture: true },
  { width: 1440, height: 900, capture: false },
  { width: 1600, height: 900, capture: true },
  { width: 1920, height: 1080, capture: true }
];

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

    for (const route of uiRoutes) {
      await window.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(route.hash)};`);
      await wait(350);

      const audit = await window.webContents.executeJavaScript(`
        (() => {
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
          return {
            hash: window.location.hash,
            rootOverflow,
            bodyOverflow,
            hasSidebar: bodyText.includes("Dashboard") && bodyText.includes("Settings"),
            hasDebugLog: bodyText.includes("Debug Log"),
            hasBuildTime: bodyText.includes("Build Time"),
            hasTitle: bodyText.includes(${JSON.stringify(route.title)}),
            offenders
          };
        })()
      `);

      const context = `${viewport.width}x${viewport.height} ${route.name}`;
      if (audit.rootOverflow > 1 || audit.bodyOverflow > 1) {
        failures.push(`${context}: global horizontal overflow root=${audit.rootOverflow}, body=${audit.bodyOverflow}, offenders=${JSON.stringify(audit.offenders)}`);
      }
      if (!audit.hasSidebar) {
        failures.push(`${context}: sidebar text not found`);
      }
      if (!audit.hasDebugLog) {
        failures.push(`${context}: debug log panel not found`);
      }
      if (!audit.hasBuildTime) {
        failures.push(`${context}: Build Time not found`);
      }
      if (!audit.hasTitle) {
        failures.push(`${context}: page title ${route.title} not found`);
      }

      if (shouldCaptureUi && viewport.capture) {
        const image = await window.capturePage();
        const filename = `${viewport.width}x${viewport.height}-${route.name}.png`;
        fs.writeFileSync(path.join(captureDir, filename), image.toPNG());
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
    minWidth: 1180,
    minHeight: 760,
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
