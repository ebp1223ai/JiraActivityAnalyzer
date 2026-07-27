export type JiraRuntimeStatus =
  | "CHECKING" | "CONNECTED" | "NOT_CONFIGURED" | "INVALID_URL" | "DNS_ERROR"
  | "NETWORK_ERROR" | "TIMEOUT" | "TLS_ERROR" | "AUTH_FAILED" | "PERMISSION_DENIED"
  | "SERVER_ERROR" | "UNSUPPORTED_RESPONSE" | "UNKNOWN_ERROR";

export type DatabaseRuntimeStatus =
  | "CHECKING" | "READY" | "READY_READ_ONLY" | "NOT_CONFIGURED" | "MISSING"
  | "INVALID_SQLITE" | "FOREIGN_DATABASE" | "SCHEMA_INCOMPLETE" | "MIGRATION_REQUIRED"
  | "MIGRATION_FAILED"
  | "TOO_NEW" | "JIRA_INSTANCE_MISMATCH" | "CORRUPTED" | "LOCKED"
  | "PERMISSION_DENIED" | "UNKNOWN_ERROR";

export type RuntimeState = {
  jira: {
    status: JiraRuntimeStatus;
    reasonCode: JiraRuntimeStatus;
    message: string;
    checkedAt: string;
    lastSuccessAt: string;
    latencyMs: number | null;
    baseUrlNormalized: string;
    accountDisplayName: string;
    username: string;
    serverIdentity: string;
    serverTitle: string;
    serverTitleStatus: "verified" | "unverified";
    requestId: number;
  };
  database: {
    status: DatabaseRuntimeStatus;
    reasonCode: DatabaseRuntimeStatus;
    message: string;
    checkedAt: string;
    path: string;
    databaseId: string;
    schemaVersion: number | null;
    sourceBinding: string;
    canRead: boolean;
    canWrite: boolean;
    bindingComparison: "MATCH" | "MISMATCH" | "UNAVAILABLE" | "UNBOUND";
    migration?: unknown;
    requestId: number;
  };
  capabilities: {
    jiraSearch: boolean;
    candidateDiscovery: boolean;
    fullFetchStaging: boolean;
    databaseRead: boolean;
    databaseWrite: boolean;
    databaseImport: boolean;
    offlineAnalysis: boolean;
    settings: boolean;
  };
  startedAt: string;
};
