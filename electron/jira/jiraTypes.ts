export type ProbeDepth = "basic" | "standard" | "deep";
export type EndpointStatus = "success" | "partial" | "forbidden" | "failed" | "skipped";
export type ProbeApiVersion = "auto" | "v3" | "v2";
export type ProbeAuthType = "basic" | "bearer";

export type ProbeRequest = {
  connection: {
    name: string;
    baseUrl: string;
    email: string;
    apiToken: string;
  };
  issueKey: string;
  depth: ProbeDepth;
  useMock: boolean;
  apiVersion: ProbeApiVersion;
  authType: ProbeAuthType;
};

export type JiraHttpResult = {
  ok: boolean;
  status: number | "-";
  contentType: string;
  json: unknown | null;
  errorType?: "HTTP_ERROR" | "NON_JSON_RESPONSE" | "INVALID_JSON" | "NETWORK_ERROR" | "READ_ONLY_VIOLATION";
  message?: string;
  bodyPreview?: string;
};

export type ProbeEndpointResult = {
  endpoint: string;
  status: EndpointStatus;
  httpCode: number | "-";
  records: string;
  usefulLevel: "High" | "Medium" | "Low" | "-";
  notes: string;
};
