export type JiraProbeDepth = "basic" | "standard" | "deep";

export type JiraProbeStatus = "success" | "partial" | "forbidden" | "failed" | "skipped";

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
};

export type JiraProbeEndpointResult = {
  endpoint: string;
  status: JiraProbeStatus;
  httpCode: number | "-";
  records: string;
  usefulLevel: "High" | "Medium" | "Low";
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
  issueKey: string;
  depth: JiraProbeDepth;
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
