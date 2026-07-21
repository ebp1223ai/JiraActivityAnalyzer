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
        activityStreamProbe: (payload: { connection: JiraConnection; selectedUsers: string[]; activityStreamUser: string; queryMode: "auto" | "username" | "escaped_username" | "email" | "custom"; startDate: string; endDate: string; maxResults: number; maxResultsSource: "custom" | "quick"; largeMaxResultsConfirmed: boolean; dateQueryMode: "none" | "startDate_endDate" | "update_date_after_before" | "both"; chunkingMode: "off" | "auto" | "monthly" | "weekly" | "custom_days"; customChunkDays: number; relativeLinks: boolean; runId: string; standardFlow?: boolean; advancedOverrideUsed?: boolean }) => Promise<Record<string, unknown>>;
        activityStreamStabilityProbe: (payload: { connection: JiraConnection; config: Record<string, unknown>; confirmedLargeRun?: boolean }) => Promise<Record<string, unknown>>;
        cancelStabilityProbe: () => Promise<{ ok: boolean; runId?: string; message?: string }>;
        updateStabilityUiState: (payload: Record<string, unknown>) => Promise<{ ok: boolean }>;
        onStabilityProbeProgress: (callback: (progress: Record<string, unknown>) => void) => () => void;
        activityStreamBenchmark: (payload: { connection: JiraConnection; config: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        cancelActivityStreamBenchmark: () => Promise<{ ok: boolean; benchmarkRunId?: string; message?: string }>;
        onActivityStreamBenchmarkProgress: (callback: (progress: Record<string, unknown>) => void) => () => void;
        buildActivityTimeline: (payload: { connection: JiraConnection; selectedUser: string; startDate: string; endDate: string; projectScope: string; requestWindow: { type: "1_day" | "7_days" | "14_days" | "calendar_month" | "custom_days"; customDays: number | null }; fullScanRoundCount: number; delayBetweenRoundsMs: number; roundExecutionMode: "stop_when_stable" | "force_all_rounds"; mergeStrategy: "union" | "last_stable" }) => Promise<Record<string, unknown>>;
        cancelActivityTimeline: () => Promise<{ ok: boolean; runId?: string; message?: string }>;
        onActivityTimelineProgress: (callback: (progress: Record<string, unknown>) => void) => () => void;
        activityStreamManualReplay: (payload: { connection: JiraConnection; manualUrl: string; runId: string }) => Promise<Record<string, unknown>>;
        precisionProbe: (payload: { connection: JiraConnection; selectedUsers: string[]; startInclusive: string; endExclusive: string; activityStreamEndInclusive: string; projectScope: string; activityStreamUser: string; activityStreamQueryMode: "auto" | "username" | "escaped_username" | "email" | "custom"; activityStreamRelativeLinks: boolean; activityStreamRunId: string; activityStreamDateQueryMode: "none" | "startDate_endDate" | "update_date_after_before" | "both"; activityStreamChunkingMode?: "off" | "auto" | "monthly" | "weekly" | "custom_days"; activityStreamCustomChunkDays?: number; maxResults: number; maxResultsSource: "custom" | "quick"; largeMaxResultsConfirmed: boolean; standardFlow?: boolean; advancedOverrideUsed?: boolean; broadJql: string }) => Promise<Record<string, unknown>>;
        fullFetch: (payload: { connection: JiraConnection; fetchQueue: unknown[]; fetchLimit: number; batchSize: number | "all"; rawDataMode: "summary_only" | "auto_save_raw_per_issue" | "full_raw_in_memory"; selectedUser: string; startDate: string; endDate: string; directIssueKeys: string[] }) => Promise<Record<string, unknown>>;
        previewSourceArchive: (payload: { rawData: unknown; confluenceRawData?: unknown[]; selectedUser?: string }) => Promise<Record<string, unknown>>;
        exportSourceArchive: (payload: { rawData: unknown; confluenceRawData?: unknown[]; selectedUser?: string }) => Promise<Record<string, unknown>>;
        pauseFullFetch: () => Promise<{ ok: boolean; runId?: string; message?: string }>;
        logAction: (payload: { category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO"; message: string }) => Promise<{ ok: boolean; appLogPath?: string; actionLogPath?: string; actionLogAvailable?: boolean; fullFetchLogPath?: string; error?: string }>;
        updateWorkflowSnapshot: (payload: Record<string, unknown>) => Promise<{ ok: boolean; outputDir: string; files: Record<string, string> }>;
        actionLogDiagnostics: () => Promise<{ actionLogPath: string; actionLogAvailable: boolean; actionLogNote: string }>;
        latestFullFetchCheckpoint: () => Promise<{ found: boolean; unfinished?: boolean; checkpointPath?: string; checkpoint?: Record<string, unknown>; error?: string }>;
        openDiagnosticsFolder: (payload?: { filePath?: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
        onFullFetchProgress: (callback: (progress: Record<string, unknown>) => void) => () => void;
        onFullFetchLog: (callback: (line: string) => void) => () => void;
        saveExport: (payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string }>;
        openExportFolder: (payload?: { folderPath?: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
        autoSaveRun: (payload: { resultType: "activity_stream_run" | "precision_probe_run" | "manual_url_replay_run" | "maxresults_cap_test"; runId: string; status: string; data: unknown }) => Promise<{ canceled: boolean; runId: string; resultType: string; status: string; savedAt: string; filePath: string; folderPath: string; resultTracking: Record<"latestRunResult" | "lastSuccessfulResult" | "lastParsedResult" | "latestNoEntriesResult", { runId: string; resultType: string; status: string; diagnosis: string; parsedActivityCount: number; savedAt: string; path: string; folderPath: string } | null> }>;
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
