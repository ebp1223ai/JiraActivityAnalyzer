import crypto from "node:crypto";
import {
  PROVIDER_ARTIFACT_CONTRACT_V0337,
  type AnalysisProviderAdapterV0337,
  type ProviderAnalysisArtifactV0337,
  type ProviderAnalysisRequestV0337,
  type ProviderAnalysisResultV0337,
  type ProviderCapabilitiesV0337,
  type ProviderEventSinkV0337
} from "./providerAnalysisContractsV0337.js";

export const MOCK_PROVIDER_ID_V0337 = "mock-analysis-test-only" as const;
export type MockScenarioV0337 = "completed" | "failed" | "cancelled" | "delayed" | "artifact_before_terminal" | "terminal_before_post_artifact";

export class MockAnalysisProviderAdapterV0337 implements AnalysisProviderAdapterV0337 {
  readonly id = MOCK_PROVIDER_ID_V0337;
  private readonly cancelled = new Set<string>();

  constructor(private readonly scenario: MockScenarioV0337 = "completed") {}

  async getCapabilities(): Promise<ProviderCapabilitiesV0337> {
    return { providerId: this.id, displayName: "Mock Analysis Provider", networkRequired: false, authenticationRequired: false, productionSelectable: false, supportsCancellation: true };
  }

  async preflight(_request: ProviderAnalysisRequestV0337) {
    return { ok: true, providerId: this.id, capability: await this.getCapabilities(), findingCode: null } as const;
  }

  async analyze(request: ProviderAnalysisRequestV0337, sink: ProviderEventSinkV0337): Promise<ProviderAnalysisResultV0337> {
    await sink.append({ type: "prepared", runId: request.runId, atUtc: new Date().toISOString() });
    if (this.cancelled.has(request.runId) || this.scenario === "cancelled") return { providerId: this.id, terminal: "cancelled", artifact: null, warningCodes: [] };
    if (this.scenario === "failed") return { providerId: this.id, terminal: "failed", artifact: null, warningCodes: ["MOCK_PROVIDER_FAILED"] };
    const decisions = Array.from({ length: request.expectedRecordCount }, (_, recordIndex) => ({ recordIndex, status: "UNKNOWN", skillFindings: [], rationale: "Deterministic test-only fixture.", recordNegativeChecks: [] }));
    const providerReceiptRef = `mock_${crypto.createHash("sha256").update(`${request.runId}:${JSON.stringify(decisions)}`).digest("hex").slice(0, 24)}`;
    const artifact: ProviderAnalysisArtifactV0337 = { schemaVersion: PROVIDER_ARTIFACT_CONTRACT_V0337, providerId: this.id, decisions, analysisReportMarkdown: "# Mock analysis\n\nTest-only deterministic artifact.\n", finalAssistantSummary: "模擬分析完成。", providerReceiptRef, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 } };
    await sink.append({ type: "accepted", runId: request.runId, atUtc: new Date().toISOString(), nonSensitivePayload: { providerReceiptRef } });
    return { providerId: this.id, terminal: "completed", artifact, warningCodes: [] };
  }

  async cancel(runId: string, reason: string) {
    this.cancelled.add(runId);
    return { cancelled: true, runId, reason };
  }
}