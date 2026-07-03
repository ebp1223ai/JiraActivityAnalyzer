import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === "1";

function getRendererEntry() {
  return path.join(__dirname, "../dist/index.html");
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Jira Activity Analyzer",
    backgroundColor: "#f6f9fd",
    show: true,
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
    window.webContents.openDevTools({ mode: "detach" });
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
  if (app.isPackaged) {
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
