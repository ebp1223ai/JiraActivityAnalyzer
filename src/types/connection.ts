export type ConnectionAuthType = "basic" | "bearer";
export type ConnectionApiVersion = "auto" | "v3" | "v2";
export type ConnectionStatus = "connected" | "failed" | "not_tested" | "testing" | "offline";
export type JiraConnectionState = { status: ConnectionStatus; serverUrl: string | null; testedAt: string | null; errorCode: string | null; source: "startup" | "manual" | "restored"; sequence: number };
export type TokenSource = "env" | "session" | "encrypted-store";

export type JiraConnection = {
  id: string;
  name: string;
  baseUrl: string;
  authType: ConnectionAuthType;
  apiVersion: ConnectionApiVersion;
  username: string;
  email: string;
  apiToken?: string;
  tokenSource: TokenSource;
  tokenMasked: string;
  status: ConnectionStatus;
  lastTestedAt: string;
  authenticatedUser: string;
  accessibleProjectsCount: number;
  active?: boolean;
};

export type ConnectionEnvStatus = {
  status?: "loaded" | "created";
  envPath?: string;
  currentEnvPath?: string;
  defaultEnvPath?: string;
  appConfigPath?: string;
  lastEnvLoadedAt?: string;
  loadedAt?: string;
  createdAt?: string;
};

export type ConnectionStatePayload = {
  env: ConnectionEnvStatus;
  activeConnectionId: string;
  activeConnection: JiraConnection;
  connections: JiraConnection[];
  jiraState: JiraConnectionState;
};
