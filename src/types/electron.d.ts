import type { JiraProbeRequest, JiraProbeResult } from "./jiraProbe";
import type { ConnectionStatePayload, JiraConnection } from "./connection";
import type { RuntimeState } from "./runtime";
import type { IssueViewerDto, UserViewerDistributions } from "./databaseViewer";
import type { DatabaseIssueDistributions, DatabaseIssueQuery, DatabaseIssueQueryResult } from "./databaseQuery";
import type { UiPreferencesLoadResult, UiPreferencesUpdate } from "./uiPreferences";
import type { ActivityTimelineRunContext } from "../../electron/activityTimelineRunContext";
import type { ActivityViewerTableResult, ViewerDistinctResult, ViewerProgressDto, ViewerTableQuery, ViewerTableResult } from "./activityViewerQuery";
import type { DescriptionFullContextResult } from "../../shared/descriptionDiff";
import type { DescriptionComparisonPayload, DescriptionPreviewBatchResponse } from "../../shared/descriptionComparison";
import type { UserViewerScope } from "../../shared/userViewerScope";

declare global {
  interface Window {
    desktopApp?: {
      platform: string;
      shell: string;
      nodeAccess: boolean;
      uiSmoke?: boolean;
      appDiagnostics?: {
        reportRendererEvent: (payload: Record<string, unknown>) => Promise<{ ok: boolean; incidentId: string }>;
        reportTransition: (payload: Record<string, unknown>) => Promise<{ ok: boolean; incidentId: string }>;
        getContext: () => Promise<{ sessionId: string; previousSessionId: string; logsDir: string; appRoot: string }>;
        openLogsFolder: () => Promise<{ ok: boolean; folderPath: string; error?: string }>;
      };
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
        test: (connection: JiraConnection) => Promise<{ connection: JiraConnection; logs: string[]; result: unknown; runtime?: RuntimeState; state?: ConnectionStatePayload }>;
        onStateChanged: (callback: (state: ConnectionStatePayload) => void) => () => void;
      };
      runtime?: {
        getState: () => Promise<RuntimeState>;
        retryJira: () => Promise<RuntimeState>;
        retryDatabase: () => Promise<RuntimeState>;
        onStateChanged: (callback: (state: RuntimeState) => void) => () => void;
      };
      databases?: {
        checkPath: (payload?: { filePath?: string }) => Promise<RuntimeState["database"]>;
        selectExisting: (payload?: { filePath?: string }) => Promise<{ canceled: boolean; saved: boolean; validation?: RuntimeState["database"]; state: RuntimeState; error?: string }>;
        createNew: (payload?: { filePath?: string }) => Promise<{ canceled: boolean; saved: boolean; created?: { databasePath: string; databaseId: string; validation: RuntimeState["database"] }; state: RuntimeState; error?: string }>;
      };
      databaseViewer?: {
        overview: () => Promise<Record<string, unknown>>;
        healthCheck: () => Promise<Record<string, unknown>>;
        listIssues: (payload?: DatabaseIssueQuery) => Promise<DatabaseIssueQueryResult>;
        issueDistributions: (payload?: DatabaseIssueQuery) => Promise<DatabaseIssueDistributions>;
        getIssue: (payload: { issueKey: string }) => Promise<IssueViewerDto>;
        listUsers: (payload?: { search?: string; limit?: number; offset?: number; userIds?: string[] }) => Promise<{ total: number; limit: number; offset: number; items: Array<Record<string, unknown>> }>;
        getUser: (payload: { userId: string; limit?: number; offset?: number }) => Promise<Record<string, unknown>>;
userDistributions: (payload: { scope: UserViewerScope; query?: ViewerTableQuery }) => Promise<UserViewerDistributions>;
        userRelatedIssues: (payload: { scope: UserViewerScope; query: ViewerTableQuery }) => Promise<ViewerTableResult>;
        userEvents: (payload: { requestId: string; scope: UserViewerScope; query: ViewerTableQuery }) => Promise<ActivityViewerTableResult>;
        issueEvents: (payload: { requestId: string; issueKey: string; query: ViewerTableQuery }) => Promise<ActivityViewerTableResult>;
        issueChangelog: (payload: { requestId: string; issueKey: string; query: ViewerTableQuery }) => Promise<ActivityViewerTableResult>;
        cancel: (payload: { requestId: string; target: "user-events" | "issue-events" | "issue-changelog" }) => Promise<{ cancelled: boolean; requestId: string }>;
        onProgress: (listener: (progress: ViewerProgressDto) => void) => () => void;
        descriptionFullContext: (payload: { eventId: string; issueKey: string; requestId: number; revision: number }) => Promise<DescriptionFullContextResult & { requestId: number; revision: number }>;
        descriptionOriginalPreviews: (payload: { requestId: string; generation: string; databaseIdentity: string; eventIds: string[] }) => Promise<DescriptionPreviewBatchResponse>;
        descriptionComparison: (payload: { requestId: string; generation: string; databaseIdentity: string; eventId: string; issueKey?: string }) => Promise<DescriptionComparisonPayload>;
        distinctValues: (payload: { source: "databaseIssues" | "userRelatedIssues" | "userEvents" | "issueEvents" | "issueChangelog"; scope?: UserViewerScope; subjectId?: string; field: string; search?: string; limit?: number; query?: DatabaseIssueQuery | ViewerTableQuery }) => Promise<ViewerDistinctResult>;
      };
      uiPreferences?: {
        get: () => Promise<UiPreferencesLoadResult>;
        update: (payload: UiPreferencesUpdate) => Promise<UiPreferencesLoadResult>;
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
        buildActivityTimeline: (payload: { connection: JiraConnection; runContext: ActivityTimelineRunContext }) => Promise<Record<string, unknown>>;
        cancelActivityTimeline: () => Promise<{ ok: boolean; runId?: string; message?: string }>;
        onActivityTimelineProgress: (callback: (progress: Record<string, unknown>) => void) => () => void;
        activityStreamManualReplay: (payload: { connection: JiraConnection; manualUrl: string; runId: string }) => Promise<Record<string, unknown>>;
        precisionProbe: (payload: { connection: JiraConnection; selectedUsers: string[]; startInclusive: string; endExclusive: string; activityStreamEndInclusive: string; projectScope: string; activityStreamUser: string; activityStreamQueryMode: "auto" | "username" | "escaped_username" | "email" | "custom"; activityStreamRelativeLinks: boolean; activityStreamRunId: string; activityStreamDateQueryMode: "none" | "startDate_endDate" | "update_date_after_before" | "both"; activityStreamChunkingMode?: "off" | "auto" | "monthly" | "weekly" | "custom_days"; activityStreamCustomChunkDays?: number; maxResults: number; maxResultsSource: "custom" | "quick"; largeMaxResultsConfirmed: boolean; standardFlow?: boolean; advancedOverrideUsed?: boolean; broadJql: string }) => Promise<Record<string, unknown>>;
      fullFetchPreflight: (payload: { fetchQueue: unknown[]; selectedTimelineRunId: string; queueTimelineRunId: string }) => Promise<Record<string, unknown>>;
      fullFetch: (payload: { connection: JiraConnection; fetchQueue: unknown[]; selectedTimelineRunId?: string; queueTimelineRunId?: string; rawDataMode: "auto_save_raw_per_issue"; selectedUser: string; startDate: string; endDate: string; jql: string; candidateIssues: unknown[]; selectedIssues: string[]; relatedIssuesStatus: string; fetchRemoteLinks: boolean; directIssueKeys: string[] }) => Promise<Record<string, unknown>>;
        getActiveFullFetchRun: () => Promise<Record<string, unknown> | null>;
        getFullFetchRunStatus: (runId: string) => Promise<Record<string, unknown> | null>;
        previewSourceArchive: (payload: { rawData?: unknown; confluenceRawData?: unknown[]; selectedUser?: string; stagingId?: string }) => Promise<Record<string, unknown>>;
        exportSourceArchive: (payload: { rawData?: unknown; confluenceRawData?: unknown[]; selectedUser?: string; stagingId?: string }) => Promise<Record<string, unknown>>;
        cancelFullFetch: (runId?: string) => Promise<{ ok: boolean; runId?: string; stagingId?: string; message?: string }>;
      scanFullFetchStaging: () => Promise<{ found: boolean; runs?: Array<{ state: Record<string, unknown>; preview: Record<string, unknown> }>; latest?: { state: Record<string, unknown>; preview: Record<string, unknown> } | null }>;
      fullFetchStagingAction: (payload: { stagingId: string; action: "open_folder" | "export_completed" | "delete_failed" }) => Promise<Record<string, unknown>>;
        logAction: (payload: { category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO"; message: string }) => Promise<{ ok: boolean; appLogPath?: string; actionLogPath?: string; actionLogAvailable?: boolean; fullFetchLogPath?: string; error?: string }>;
        updateWorkflowSnapshot: (payload: Record<string, unknown>) => Promise<{ ok: boolean; outputDir: string; files: Record<string, string> }>;
        loadWorkflowSnapshot: () => Promise<{ found: boolean; filePath: string; snapshot?: Record<string, unknown>; error?: string }>;
        actionLogDiagnostics: () => Promise<{ actionLogPath: string; actionLogAvailable: boolean; actionLogNote: string }>;
        openDiagnosticsFolder: (payload?: { filePath?: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
        onFullFetchProgress: (runId: string, callback: (progress: Record<string, unknown>) => void) => () => void;
        onFullFetchLog: (runId: string, callback: (line: string) => void) => () => void;
        saveExport: (payload: { category: "user-analysis" | "raw-data"; defaultFileName: string; data: unknown }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string }>;
        saveFullFetchResult: (payload: { attemptId: string; selectedTimelineRunId: string; fullFetchRunId: string; stagingId: string }) => Promise<{ canceled: boolean; alreadySaved?: boolean; reasonCode?: string; operationId?: string; filePath?: string; folderPath?: string; fileSize?: number; sha256?: string; staging?: Record<string, unknown>; fileSave?: Record<string, unknown>; databaseWrite?: Record<string, unknown>; logs?: string[] }>;
        openExportFolder: (payload?: { folderPath?: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
        autoSaveRun: (payload: { resultType: "activity_stream_run" | "precision_probe_run" | "manual_url_replay_run" | "maxresults_cap_test"; runId: string; status: string; data: unknown }) => Promise<{ canceled: boolean; runId: string; resultType: string; status: string; savedAt: string; filePath: string; folderPath: string; resultTracking: Record<"latestRunResult" | "lastSuccessfulResult" | "lastParsedResult" | "latestNoEntriesResult", { runId: string; resultType: string; status: string; diagnosis: string; parsedActivityCount: number; savedAt: string; path: string; folderPath: string } | null> }>;
      };
      appDebug?: {
        saveTextFile: (payload: { defaultFileName: string; content: string }) => Promise<{ canceled: boolean; filePath?: string; folderPath?: string; actionLogPath?: string; actionLogAvailable?: boolean }>;
        saveBundle: (payload: { debugLog: string; currentPage: string; fullFetchIdentity?: { attemptId: string; selectedTimelineRunId: string; fullFetchRunId: string; stagingId: string } }) => Promise<{ canceled: boolean; status?: "completed" | "completed_with_errors" | "failed"; filePath?: string; folderPath?: string; createdAt?: string; bundleSizeBytes?: number; successfulFileCount?: number; unavailableOrNotRunCount?: number; sourcesNotObserved?: number; featuresNotRun?: number; sourcesMissing?: number; placeholderFilesCreated?: number; failedFileCount?: number; errorCode?: string; stage?: string; includedFiles?: string[]; fullFetchResult?: Record<string, unknown>; crossPageDebugBundleTodo?: string[] }>;
        openFolder: (payload: { folderPath: string }) => Promise<{ ok: boolean; folderPath?: string; error?: string }>;
      };
    };
  }
}

export {};
