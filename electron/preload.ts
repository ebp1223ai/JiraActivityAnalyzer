import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  shell: "electron",
  nodeAccess: false,
  jiraProbe: {
    run: (request: unknown) => ipcRenderer.invoke("jira-probe:run", request),
    loadEnv: () => ipcRenderer.invoke("jira-probe:load-env"),
    saveResult: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("jira-probe:save-result", payload)
  },
  connections: {
    loadEnv: () => ipcRenderer.invoke("connection:load-env"),
    list: () => ipcRenderer.invoke("connection:list"),
    test: (connection: unknown) => ipcRenderer.invoke("connection:test", connection),
    save: (connection: unknown) => ipcRenderer.invoke("connection:save", connection),
    setActive: (id: string) => ipcRenderer.invoke("connection:set-active", id)
  },
  jiraAnalysis: {
    load: (payload: unknown) => ipcRenderer.invoke("jira-analysis:load", payload)
  },
  appDebug: {
    saveTextFile: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("debug-log:save-text", payload)
  }
});
