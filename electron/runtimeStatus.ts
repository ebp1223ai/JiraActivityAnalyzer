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

export type JiraRuntimeState = {
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

export type DatabaseRuntimeState = {
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

export type RuntimeState = {
  jira: JiraRuntimeState;
  database: DatabaseRuntimeState;
  capabilities: RuntimeCapabilities;
  startedAt: string;
};

export type RuntimeCapabilities = {
  jiraSearch: boolean;
  candidateDiscovery: boolean;
  fullFetchStaging: boolean;
  databaseRead: boolean;
  databaseWrite: boolean;
  databaseImport: boolean;
  offlineAnalysis: boolean;
  settings: boolean;
};

const jiraConnected = (status: JiraRuntimeStatus) => status === "CONNECTED";
const databaseReadable = (status: DatabaseRuntimeStatus) => ["READY", "READY_READ_ONLY", "JIRA_INSTANCE_MISMATCH"].includes(status);

export function selectRuntimeCapabilities(jiraStatus: JiraRuntimeStatus, databaseStatus: DatabaseRuntimeStatus): RuntimeCapabilities {
  const jira = jiraConnected(jiraStatus);
  const databaseRead = databaseReadable(databaseStatus);
  const databaseWrite = databaseStatus === "READY";
  const mismatch = databaseStatus === "JIRA_INSTANCE_MISMATCH";
  return {
    jiraSearch: jira,
    candidateDiscovery: jira,
    fullFetchStaging: jira,
    databaseRead,
    databaseWrite,
    databaseImport: jira && databaseWrite && !mismatch,
    offlineAnalysis: databaseRead,
    settings: true
  };
}

export function initialRuntimeState(): RuntimeState {
  const startedAt = new Date().toISOString();
  const jira: JiraRuntimeState = {
    status: "CHECKING", reasonCode: "CHECKING", message: "Checking Jira connection.",
    checkedAt: "", lastSuccessAt: "", latencyMs: null, baseUrlNormalized: "",
    accountDisplayName: "", username: "", serverIdentity: "", serverTitle: "",
    serverTitleStatus: "unverified", requestId: 0
  };
  const database: DatabaseRuntimeState = {
    status: "CHECKING", reasonCode: "CHECKING", message: "Checking current local database.",
    checkedAt: "", path: "", databaseId: "", schemaVersion: null, sourceBinding: "",
    canRead: false, canWrite: false, bindingComparison: "UNAVAILABLE", requestId: 0
  };
  return { jira, database, capabilities: selectRuntimeCapabilities(jira.status, database.status), startedAt };
}

export class StartupCheckCoordinator {
  private state = initialRuntimeState();
  private jiraRequestId = 0;
  private databaseRequestId = 0;

  constructor(
    private readonly checkJira: (requestId: number) => Promise<Omit<JiraRuntimeState, "requestId">>,
    private readonly checkDatabase: (requestId: number) => Promise<Omit<DatabaseRuntimeState, "requestId">>,
    private readonly onChange: (state: RuntimeState) => void = () => {}
  ) {}

  snapshot() {
    return structuredClone(this.state);
  }

  private emit() {
    this.state.capabilities = selectRuntimeCapabilities(this.state.jira.status, this.state.database.status);
    this.onChange(this.snapshot());
  }

  async retryJira() {
    const requestId = ++this.jiraRequestId;
    this.state.jira = { ...this.state.jira, status: "CHECKING", reasonCode: "CHECKING", message: "Checking Jira connection.", requestId };
    this.emit();
    const result = await this.checkJira(requestId);
    if (requestId !== this.jiraRequestId) return this.snapshot();
    this.state.jira = { ...result, requestId };
    this.emit();
    return this.snapshot();
  }

  async retryDatabase() {
    const requestId = ++this.databaseRequestId;
    this.state.database = { ...this.state.database, status: "CHECKING", reasonCode: "CHECKING", message: "Checking current local database.", requestId };
    this.emit();
    const result = await this.checkDatabase(requestId);
    if (requestId !== this.databaseRequestId) return this.snapshot();
    this.state.database = { ...result, requestId };
    this.emit();
    return this.snapshot();
  }

  async startParallel() {
    await Promise.allSettled([this.retryJira(), this.retryDatabase()]);
    return this.snapshot();
  }
}
