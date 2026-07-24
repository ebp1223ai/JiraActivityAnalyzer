import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  shell: "electron",
  nodeAccess: false,
  uiSmoke: process.env.ELECTRON_UI_SMOKE === "1",
  appDiagnostics: {
    reportRendererEvent: (payload: unknown) => ipcRenderer.invoke("diagnostics:renderer-event", payload),
    reportTransition: (payload: unknown) => ipcRenderer.invoke("diagnostics:transition", payload),
    getContext: () => ipcRenderer.invoke("diagnostics:get-context"),
    openLogsFolder: () => ipcRenderer.invoke("diagnostics:open-logs")
  },
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
    activityStreamStabilityProbe: (payload: unknown) => ipcRenderer.invoke("user-analysis:activity-stream-stability-probe", payload),
    cancelStabilityProbe: () => ipcRenderer.invoke("user-analysis:cancel-stability-probe"),
    updateStabilityUiState: (payload: unknown) => ipcRenderer.invoke("user-analysis:update-stability-ui-state", payload),
    onStabilityProbeProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on("user-analysis:stability-probe-progress", listener);
      return () => ipcRenderer.removeListener("user-analysis:stability-probe-progress", listener);
    },
    activityStreamBenchmark: (payload: unknown) => ipcRenderer.invoke("user-analysis:activity-stream-benchmark", payload),
    cancelActivityStreamBenchmark: () => ipcRenderer.invoke("user-analysis:cancel-activity-stream-benchmark"),
    onActivityStreamBenchmarkProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on("user-analysis:activity-stream-benchmark-progress", listener);
      return () => ipcRenderer.removeListener("user-analysis:activity-stream-benchmark-progress", listener);
    },
    buildActivityTimeline: (payload: unknown) => ipcRenderer.invoke("user-analysis:build-activity-timeline", payload),
    cancelActivityTimeline: () => ipcRenderer.invoke("user-analysis:cancel-activity-timeline"),
    onActivityTimelineProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on("user-analysis:activity-timeline-progress", listener);
      return () => ipcRenderer.removeListener("user-analysis:activity-timeline-progress", listener);
    },
    activityStreamManualReplay: (payload: unknown) => ipcRenderer.invoke("user-analysis:activity-stream-manual-replay", payload),
    precisionProbe: (payload: unknown) => ipcRenderer.invoke("user-analysis:precision-probe", payload),
    fullFetch: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch", payload),
    previewSourceArchive: (payload: unknown) => ipcRenderer.invoke("user-analysis:preview-source-archive", payload),
    exportSourceArchive: (payload: unknown) => ipcRenderer.invoke("user-analysis:export-source-archive", payload),
    cancelFullFetch: () => ipcRenderer.invoke("user-analysis:cancel-full-fetch"),
    scanFullFetchStaging: () => ipcRenderer.invoke("user-analysis:scan-full-fetch-staging"),
    fullFetchStagingAction: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch-staging-action", payload),
    logAction: (payload: { category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO"; message: string }) => ipcRenderer.invoke("user-analysis:log-action", payload),
    updateWorkflowSnapshot: (payload: unknown) => ipcRenderer.invoke("user-analysis:update-workflow-snapshot", payload),
    loadWorkflowSnapshot: () => ipcRenderer.invoke("user-analysis:load-workflow-snapshot"),
    actionLogDiagnostics: () => ipcRenderer.invoke("user-analysis:action-log-diagnostics"),
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
    saveFullFetchResult: (payload: { runId: string }) => ipcRenderer.invoke("user-analysis:save-full-fetch-result", payload),
    openExportFolder: (payload?: { folderPath?: string }) => ipcRenderer.invoke("user-analysis:open-export-folder", payload),
    autoSaveRun: (payload: unknown) => ipcRenderer.invoke("user-analysis:auto-save-run", payload)
  },
  appDebug: {
    saveTextFile: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("debug-log:save-text", payload),
    saveBundle: (payload: { debugLog: string; currentPage: string }) => ipcRenderer.invoke("debug-log:save-bundle", payload),
    openFolder: (payload: { folderPath: string }) => ipcRenderer.invoke("debug-log:open-folder", payload)
  }
});
