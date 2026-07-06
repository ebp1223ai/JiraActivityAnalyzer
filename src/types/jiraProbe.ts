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
  method?: string;
  urlPath?: string;
  status: JiraProbeStatus;
  httpCode: number | "-";
  contentType?: string;
  records: string;
  duration?: string;
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

export type JiraProbeInspector = {
  overview: Array<[string, string]>;
  issueFields: Array<[string, string, string, string, string, string, string]>;
  description: {
    rendered: string;
    plainText: string;
    raw: string;
  };
  changelog: {
    summary: Array<[string, string]>;
    rows: Array<[string, string, string, string, string, string, string]>;
    partial: boolean;
  };
  comments: {
    summary: Array<[string, string]>;
    rows: Array<[string, string, string, string, string, string, string]>;
  };
  attachments: {
    summary: Array<[string, string]>;
    rows: Array<[string, string, string, string, string, string, string, string]>;
  };
  links: {
    summary: Array<[string, string]>;
    rows: Array<[string, string, string, string, string, string, string]>;
  };
  users: Array<[string, string, string, string, string, string]>;
  activityEstimate: Array<[string, string, string, string, string]>;
  rawJson: Record<string, unknown>;
  manualCompare: Array<[string, string, string, string, string]>;
};

export type JiraProbeAuthDiagnostics = {
  baseUrl: string;
  apiVersionTried: string[];
  authType: string;
  v3MyselfStatus: string;
  v2MyselfStatus: string;
  contentType: string;
  selectedApiVersion: "v3" | "v2" | null;
  recommendedNextAction: string[];
};

export type JiraProbeResult = {
  mode: "mock" | "api";
  status: "success" | "error";
  issueKey: string;
  depth: JiraProbeDepth;
  apiVersion: "v3" | "v2" | "mock" | null;
  message?: string;
  localizedMessage?: {
    zh: string;
    en: string;
  };
  authDiagnostics?: JiraProbeAuthDiagnostics;
  summary: JiraProbeSummary;
  endpoints: JiraProbeEndpointResult[];
  eventEstimates: JiraProbeEventEstimate[];
  preview: JiraProbePreview;
  inspector?: JiraProbeInspector;
  hints: string[];
  debugLogs: string[];
  rawJsonEnabled: boolean;
};

export type JiraProbeApi = {
  run: (request: JiraProbeRequest) => Promise<JiraProbeResult>;
};
