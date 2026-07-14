import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  shell: "electron",
  nodeAccess: false,
  uiSmoke: process.env.ELECTRON_UI_SMOKE === "1",
  jiraProbe: {
    run: (request: unknown) => ipcRenderer.invoke("jira-probe:run", request),
    loadEnv: () => ipcRenderer.invoke("jira-probe:load-env"),
    saveResult: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("jira-probe:save-result", payload),
    saveRawData: (payload: { defaultFileName: string; data: unknown }) => ipcRenderer.invoke("jira-probe:save-raw-data", payload)
  },
  connections: {
    loadEnv: () => ipcRenderer.invoke("connection:load-env"),
    chooseEnv: () => ipcRenderer.invoke("connection:choose-env"),
    list: () => ipcRenderer.invoke("connection:list"),
    test: (connection: unknown) => ipcRenderer.invoke("connection:test", connection),
    save: (connection: unknown) => ipcRenderer.invoke("connection:save", connection),
    setActive: (id: string) => ipcRenderer.invoke("connection:set-active", id)
  },
  jiraAnalysis: {
    load: (payload: unknown) => ipcRenderer.invoke("jira-analysis:load", payload),
    saveExport: (payload: { category: "jira-analysis" | "raw-data" | "debug-bundles"; defaultFileName: string; data: unknown }) => ipcRenderer.invoke("jira-analysis:save-export", payload)
  },
  userAnalysis: {
    discoverCandidates: (payload: unknown) => ipcRenderer.invoke("user-analysis:discover-candidates", payload),
    activityStreamProbe: (payload: unknown) => ipcRenderer.invoke("user-analysis:activity-stream-probe", payload),
    precisionProbe: (payload: unknown) => ipcRenderer.invoke("user-analysis:precision-probe", payload),
    fullFetch: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch", payload),
    pauseFullFetch: () => ipcRenderer.invoke("user-analysis:pause-full-fetch"),
    logAction: (payload: { category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO"; message: string }) => ipcRenderer.invoke("user-analysis:log-action", payload),
    actionLogDiagnostics: () => ipcRenderer.invoke("user-analysis:action-log-diagnostics"),
    latestFullFetchCheckpoint: () => ipcRenderer.invoke("user-analysis:latest-full-fetch-checkpoint"),
    openDiagnosticsFolder: (payload?: { filePath?: string }) => ipcRenderer.invoke("user-analysis:open-diagnostics-folder", payload),
    onFullFetchProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on("user-analysis:full-fetch-progress", listener);
      return () => ipcRenderer.removeListener("user-analysis:full-fetch-progress", listener);
    },
    onFullFetchLog: (callback: (line: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, line: string) => callback(line);
      ipcRenderer.on("user-analysis:full-fetch-log", listener);
      return () => ipcRenderer.removeListener("user-analysis:full-fetch-log", listener);
    },
    saveExport: (payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => ipcRenderer.invoke("user-analysis:save-export", payload),
    openExportFolder: (payload?: { folderPath?: string }) => ipcRenderer.invoke("user-analysis:open-export-folder", payload)
  },
  appDebug: {
    saveTextFile: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("debug-log:save-text", payload)
  }
});
