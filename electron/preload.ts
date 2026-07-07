import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  shell: "electron",
  nodeAccess: false,
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
    fullFetch: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch", payload),
    saveExport: (payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => ipcRenderer.invoke("user-analysis:save-export", payload),
    openExportFolder: (payload?: { folderPath?: string }) => ipcRenderer.invoke("user-analysis:open-export-folder", payload)
  },
  appDebug: {
    saveTextFile: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("debug-log:save-text", payload)
  }
});
