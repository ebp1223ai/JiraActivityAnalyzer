export type JiraProbeDepth = "basic" | "standard" | "deep";

export type JiraProbeStatus = "success" | "partial" | "forbidden" | "failed" | "skipped";

export type JiraProbeRunState = "idle" | "loading" | "success" | "error";

export type JiraProbeApiVersion = "auto" | "v3" | "v2";

export type JiraProbeAuthType = "basic" | "bearer";

export type JiraProbeConnection = {
  name: string;
  baseUrl: string;
  email: string;
  apiToken: string;
};

export type JiraProbeRequest = {
  connection: JiraProbeConnection;
  issueKey: string;
  depth: JiraProbeDepth;
  useMock: boolean;
  apiVersion: JiraProbeApiVersion;
  authType: JiraProbeAuthType;
};

export type JiraProbeEndpointResult = {
  endpoint: string;
  status: JiraProbeStatus;
  httpCode: number | "-";
  records: string;
  usefulLevel: "High" | "Medium" | "Low" | "-";
  notes: string;
};

export type JiraProbeSummary = {
  coverageScore: number;
  issueFields: number;
  changelogHistories: number;
  changeItems: number;
  comments: number;
  attachments: number;
  issueLinks: number;
  usersDetected: number;
  estimatedActivityEvents: number;
  permissionGaps: number;
};

export type JiraProbeEventEstimate = {
  type: string;
  count: number;
};

export type JiraProbePreview = {
  issueFields: Array<[string, string]>;
  changelog: Array<[string, string, string]>;
  comments: Array<[string, string, string]>;
  attachments: Array<[string, string, string]>;
  links: Array<[string, string, string]>;
  rawJson: Record<string, unknown>;
};

export type JiraProbeResult = {
  mode: "mock" | "api";
  status: "success" | "error";
  issueKey: string;
  depth: JiraProbeDepth;
  apiVersion: "v3" | "v2" | "mock" | "unknown";
  message?: string;
  summary: JiraProbeSummary;
  endpoints: JiraProbeEndpointResult[];
  eventEstimates: JiraProbeEventEstimate[];
  preview: JiraProbePreview;
  hints: string[];
  debugLogs: string[];
  rawJsonEnabled: boolean;
};

export type JiraProbeApi = {
  run: (request: JiraProbeRequest) => Promise<JiraProbeResult>;
};
