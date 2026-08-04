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
    onStateChanged: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("connection-state:changed", listener);
      return () => ipcRenderer.removeListener("connection-state:changed", listener);
    }
  },
  runtime: {
    getState: () => ipcRenderer.invoke("runtime:get-state"),
    retryJira: () => ipcRenderer.invoke("runtime:retry-jira"),
    retryDatabase: () => ipcRenderer.invoke("runtime:retry-database"),
    onStateChanged: (callback: (state: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("runtime-state:changed", listener);
      return () => ipcRenderer.removeListener("runtime-state:changed", listener);
    }
  },
  databases: {
    checkPath: (payload?: { filePath?: string }) => ipcRenderer.invoke("database:check-path", payload),
    selectExisting: (payload?: { filePath?: string }) => ipcRenderer.invoke("database:select-existing", payload),
    createNew: (payload?: { filePath?: string }) => ipcRenderer.invoke("database:create-new", payload)
  },
  databaseViewer: {
    overview: () => ipcRenderer.invoke("database-viewer:overview"),
    healthCheck: () => ipcRenderer.invoke("database-viewer:health-check"),
    listIssues: (payload?: unknown) => ipcRenderer.invoke("database-viewer:list-issues", payload),
    issueDistributions: (payload?: unknown) => ipcRenderer.invoke("database-viewer:issue-distributions", payload),
    getIssue: (payload: { issueKey: string }) => ipcRenderer.invoke("database-viewer:get-issue", payload),
    listUsers: (payload?: unknown) => ipcRenderer.invoke("database-viewer:list-users", payload),
    getUser: (payload: { userId: string; limit?: number; offset?: number }) => ipcRenderer.invoke("database-viewer:get-user", payload),
    userDistributions: (payload: unknown) => ipcRenderer.invoke("database-viewer:user-distributions", payload),
    userRelatedIssues: (payload: unknown) => ipcRenderer.invoke("database-viewer:user-related-issues", payload),
    userEvents: (payload: unknown) => ipcRenderer.invoke("database-viewer:user-events", payload),
    issueEvents: (payload: unknown) => ipcRenderer.invoke("database-viewer:issue-events", payload),
    issueChangelog: (payload: unknown) => ipcRenderer.invoke("database-viewer:issue-changelog", payload),
    descriptionFullContext: (payload: unknown) => ipcRenderer.invoke("database-viewer:description-full-context", payload),
    descriptionOriginalPreviews: (payload: unknown) => ipcRenderer.invoke("database-viewer:description-original-previews", payload),
    descriptionComparison: (payload: unknown) => ipcRenderer.invoke("database-viewer:description-comparison", payload),
    distinctValues: (payload: unknown) => ipcRenderer.invoke("database-viewer:distinct-values", payload)
  },
  uiPreferences: {
    get: () => ipcRenderer.invoke("ui-preferences:get"),
    update: (payload: unknown) => ipcRenderer.invoke("ui-preferences:update", payload)
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
    fullFetchPreflight: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch-preflight", payload),
    fullFetch: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch", payload),
    getActiveFullFetchRun: () => ipcRenderer.invoke("user-analysis:get-active-full-fetch-run"),
    getFullFetchRunStatus: (runId: string) => ipcRenderer.invoke("user-analysis:get-full-fetch-run-status", { runId }),
    previewSourceArchive: (payload: unknown) => ipcRenderer.invoke("user-analysis:preview-source-archive", payload),
    exportSourceArchive: (payload: unknown) => ipcRenderer.invoke("user-analysis:export-source-archive", payload),
    cancelFullFetch: (runId?: string) => ipcRenderer.invoke("user-analysis:cancel-full-fetch", { runId }),
    scanFullFetchStaging: () => ipcRenderer.invoke("user-analysis:scan-full-fetch-staging"),
    fullFetchStagingAction: (payload: unknown) => ipcRenderer.invoke("user-analysis:full-fetch-staging-action", payload),
    logAction: (payload: { category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO"; message: string }) => ipcRenderer.invoke("user-analysis:log-action", payload),
    updateWorkflowSnapshot: (payload: unknown) => ipcRenderer.invoke("user-analysis:update-workflow-snapshot", payload),
    loadWorkflowSnapshot: () => ipcRenderer.invoke("user-analysis:load-workflow-snapshot"),
    actionLogDiagnostics: () => ipcRenderer.invoke("user-analysis:action-log-diagnostics"),
    openDiagnosticsFolder: (payload?: { filePath?: string }) => ipcRenderer.invoke("user-analysis:open-diagnostics-folder", payload),
    onFullFetchProgress: (runId: string, callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
        const payload = progress as { runId?: string };
        if (!runId || payload?.runId === runId) callback(progress);
      };
      ipcRenderer.on("user-analysis:full-fetch-progress", listener);
      return () => ipcRenderer.removeListener("user-analysis:full-fetch-progress", listener);
    },
    onFullFetchLog: (runId: string, callback: (line: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: { runId?: string; line?: string } | string) => {
        const payload = typeof value === "string" ? { runId: "", line: value } : value;
        if ((!runId || payload.runId === runId) && payload.line) callback(payload.line);
      };
      ipcRenderer.on("user-analysis:full-fetch-log", listener);
      return () => ipcRenderer.removeListener("user-analysis:full-fetch-log", listener);
    },
    saveExport: (payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => ipcRenderer.invoke("user-analysis:save-export", payload),
    saveFullFetchResult: (payload: { attemptId: string; selectedTimelineRunId: string; fullFetchRunId: string; stagingId: string }) => ipcRenderer.invoke("user-analysis:save-full-fetch-result", payload),
    openExportFolder: (payload?: { folderPath?: string }) => ipcRenderer.invoke("user-analysis:open-export-folder", payload),
    autoSaveRun: (payload: unknown) => ipcRenderer.invoke("user-analysis:auto-save-run", payload)
  },
  appDebug: {
    saveTextFile: (payload: { defaultFileName: string; content: string }) => ipcRenderer.invoke("debug-log:save-text", payload),
    saveBundle: (payload: { debugLog: string; currentPage: string; fullFetchIdentity?: { attemptId: string; selectedTimelineRunId: string; fullFetchRunId: string; stagingId: string } }) => ipcRenderer.invoke("debug-log:save-bundle", payload),
    openFolder: (payload: { folderPath: string }) => ipcRenderer.invoke("debug-log:open-folder", payload)
  }
});
