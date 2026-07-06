import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  shell: "electron",
  nodeAccess: false,
  jiraProbe: {
    run: (request: unknown) => ipcRenderer.invoke("jira-probe:run", request)
  },
  appDebug: {
    saveTextFile: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("debug-log:save-text", payload)
  }
});
