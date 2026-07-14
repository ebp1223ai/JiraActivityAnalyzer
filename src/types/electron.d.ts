import type { JiraProbeRequest, JiraProbeResult } from "./jiraProbe";
import type { ConnectionStatePayload, JiraConnection } from "./connection";

declare global {
  interface Window {
    desktopApp?: {
      platform: string;
      shell: string;
      nodeAccess: boolean;
      uiSmoke?: boolean;
      jiraProbe?: {
        run: (request: JiraProbeRequest) => Promise<JiraProbeResult>;
        loadEnv: () => Promise<{
          found: boolean;
          created?: boolean;
          status?: "loaded" | "created";
          sourcePath?: string;
          envPath?: string;
          currentEnvPath?: string;
          defaultEnvPath?: string;
          appConfigPath?: string;
          lastEnvLoadedAt?: string;
          checkedPaths?: string[];
          loadedAt?: string;
          createdAt?: string;
          paths?: {
            runtimeDir: string;
            dataDir: string;
            logsDir: string;
            exportsDir: string;
            rawDataDir?: string;
            probeResultsDir: string;
            backupsDir: string;
            configDir: string;
          };
          config: {
            baseUrl: string;
            email: string;
            username: string;
            apiToken: string;
            hasToken: boolean;
            authType: string;
            apiVersion: string;
            issueKey: string;
            depth: string;
            mockMode: boolean;
            logLevel: string;
          };
        }>;
        saveResult: (payload: { defaultFileName: string; content: string }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string }>;
        saveRawData: (payload: { defaultFileName: string; data: unknown }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string }>;
      };
      connections?: {
        loadEnv: () => Promise<ConnectionStatePayload>;
        chooseEnv: () => Promise<{ canceled: boolean; state: ConnectionStatePayload }>;
        list: () => Promise<ConnectionStatePayload>;
        test: (connection: JiraConnection) => Promise<{ connection: JiraConnection; logs: string[]; result: unknown }>;
        save: (connection: JiraConnection) => Promise<ConnectionStatePayload>;
        setActive: (id: string) => Promise<ConnectionStatePayload>;
      };
      jiraAnalysis?: {
        load: (payload: { connection: JiraConnection; issueKey: string }) => Promise<Record<string, unknown>>;
        saveExport: (payload: { category: "jira-analysis" | "raw-data" | "debug-bundles"; defaultFileName: string; data: unknown }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string }>;
      };
      userAnalysis?: {
        discoverCandidates: (payload: { connection: JiraConnection; jql: string; safetyLimit: number; selectedUsers: string[] }) => Promise<Record<string, unknown>>;
        activityStreamProbe: (payload: { connection: JiraConnection; selectedUsers: string[]; activityStreamUser: string; queryMode: "auto" | "username" | "email" | "custom"; startDate: string; endDate: string; maxResults: number; maxResultsSource: "custom" | "quick"; largeMaxResultsConfirmed: boolean; dateQueryMode: "none" | "startDate_endDate" | "update_date_after_before" | "both"; relativeLinks: boolean; runId: string }) => Promise<Record<string, unknown>>;
        activityStreamManualReplay: (payload: { connection: JiraConnection; manualUrl: string; runId: string }) => Promise<Record<string, unknown>>;
        precisionProbe: (payload: { connection: JiraConnection; selectedUsers: string[]; startInclusive: string; endExclusive: string; activityStreamEndInclusive: string; projectScope: string; activityStreamUser: string; activityStreamQueryMode: "auto" | "username" | "email" | "custom"; activityStreamRelativeLinks: boolean; activityStreamRunId: string; activityStreamDateQueryMode: "none" | "startDate_endDate" | "update_date_after_before" | "both"; maxResults: number; maxResultsSource: "custom" | "quick"; largeMaxResultsConfirmed: boolean; broadJql: string }) => Promise<Record<string, unknown>>;
        fullFetch: (payload: { connection: JiraConnection; fetchQueue: unknown[]; fetchLimit: number; batchSize: number | "all"; rawDataMode: "summary_only" | "auto_save_raw_per_issue" | "full_raw_in_memory" }) => Promise<Record<string, unknown>>;
        pauseFullFetch: () => Promise<{ ok: boolean; runId?: string; message?: string }>;
        logAction: (payload: { category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO"; message: string }) => Promise<{ ok: boolean; appLogPath?: string; actionLogPath?: string; actionLogAvailable?: boolean; fullFetchLogPath?: string; error?: string }>;
        actionLogDiagnostics: () => Promise<{ actionLogPath: string; actionLogAvailable: boolean; actionLogNote: string }>;
        latestFullFetchCheckpoint: () => Promise<{ found: boolean; unfinished?: boolean; checkpointPath?: string; checkpoint?: Record<string, unknown>; error?: string }>;
        openDiagnosticsFolder: (payload?: { filePath?: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
        onFullFetchProgress: (callback: (progress: Record<string, unknown>) => void) => () => void;
        onFullFetchLog: (callback: (line: string) => void) => () => void;
        saveExport: (payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string }>;
        openExportFolder: (payload?: { folderPath?: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
        autoSaveRun: (payload: { resultType: "activity_stream_run" | "precision_probe_run" | "manual_url_replay_run" | "maxresults_cap_test"; runId: string; status: string; data: unknown }) => Promise<{ canceled: boolean; runId: string; resultType: string; status: string; savedAt: string; filePath: string; folderPath: string }>;
      };
      appDebug?: {
        saveTextFile: (payload: { defaultFileName: string; content: string }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string; actionLogPath?: string; actionLogAvailable?: boolean }>;
        saveBundle: (payload: { debugLog: string; currentPage: string }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string; createdAt?: string; includedFiles?: string[]; crossPageDebugBundleTodo?: string[] }>;
        openFolder: (payload: { folderPath: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
      };
    };
  }
}

export {};
