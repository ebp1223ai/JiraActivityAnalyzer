export const PROVIDER_ADAPTER_CONTRACT_V0337 = "jaa-analysis-provider-adapter-v1" as const;
export const PROVIDER_REQUEST_CONTRACT_V0337 = "jaa-provider-analysis-request-v1" as const;
export const PROVIDER_ARTIFACT_CONTRACT_V0337 = "jaa-provider-analysis-artifact-v1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ProviderInputBindingV0337 = Readonly<{
  role: string;
  fileName: string;
  bytes: number;
  sha256: string;
  providerVisible: boolean;
}>;

export interface ProviderAnalysisRequestV0337 {
  schemaVersion: typeof PROVIDER_REQUEST_CONTRACT_V0337;
  runId: string;
  providerId: string;
  inputBindings: ProviderInputBindingV0337[];
  effectiveInstruction: { text: string; bytes: number; sha256: string; identity: string };
  expectedRecordCount: number;
  decisionContract: string;
  artifactContract: string;
  locale: "zh-TW";
  cancellation: AbortSignal;
  options: Record<string, JsonValue>;
}

export interface ProviderAnalysisArtifactV0337 {
  schemaVersion: typeof PROVIDER_ARTIFACT_CONTRACT_V0337;
  providerId: string;
  decisions: unknown;
  analysisReportMarkdown?: string;
  finalAssistantSummary?: string;
  providerReceiptRef: string;
  usage?: ProviderUsageTelemetryV0337;
}

export type ProviderUsageTelemetryV0337 = Readonly<{
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}>;

export type ProviderEventV0337 = Readonly<{
  type: "prepared" | "sent" | "accepted" | "completed" | "failed" | "cancelled";
  runId: string;
  atUtc: string;
  nonSensitivePayload?: Record<string, JsonValue>;
}>;

export interface ProviderEventSinkV0337 {
  append(event: ProviderEventV0337): void | Promise<void>;
}

export type ProviderCapabilitiesV0337 = Readonly<{
  providerId: string;
  displayName: string;
  networkRequired: boolean;
  authenticationRequired: boolean;
  productionSelectable: boolean;
  supportsCancellation: boolean;
}>;

export type ProviderPreflightResultV0337 = Readonly<{
  ok: boolean;
  providerId: string;
  capability: ProviderCapabilitiesV0337;
  findingCode: string | null;
}>;

export type ProviderAnalysisResultV0337 = Readonly<{
  providerId: string;
  terminal: "completed" | "failed" | "cancelled";
  artifact: ProviderAnalysisArtifactV0337 | null;
  warningCodes: string[];
}>;

export interface AnalysisProviderAdapterV0337<TResult extends ProviderAnalysisResultV0337 = ProviderAnalysisResultV0337> {
  readonly id: string;
  getCapabilities(): Promise<ProviderCapabilitiesV0337>;
  preflight(request: ProviderAnalysisRequestV0337): Promise<ProviderPreflightResultV0337>;
  analyze(request: ProviderAnalysisRequestV0337, sink: ProviderEventSinkV0337): Promise<TResult>;
  cancel(runId: string, reason: string): Promise<{ cancelled: boolean; runId: string; reason: string }>;
}

export function assertProviderArtifactBoundaryV0337(value: ProviderAnalysisArtifactV0337) {
  const forbidden = ["canonicalResult", "analyzedResult", "reportPackage", "html", "sqlite", "hostIdentity", "durableReceipt"];
  const record = value as unknown as Record<string, unknown>;
  const present = forbidden.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (present.length) throw Object.assign(new Error(`PROVIDER_ARTIFACT_HOST_FIELD_FORBIDDEN:${present.join(",")}`), { code: "PROVIDER_ARTIFACT_HOST_FIELD_FORBIDDEN", fields: present });
  return true;
}
