import {
  type AnalysisProviderAdapterV0337,
  type ProviderAnalysisRequestV0337,
  type ProviderAnalysisResultV0337,
  type ProviderCapabilitiesV0337,
  type ProviderEventSinkV0337
} from "./providerAnalysisContractsV0337.js";

export const CHATGPT_CODEX_PROVIDER_ID_V0337 = "chatgpt-codex" as const;

export type ChatGptTransportResultV0337 = {
  text: string;
  requestId: string | null;
  threadId: string;
  turnId: string;
  usage?: { inputTokens?: number | null; cachedInputTokens?: number | null; outputTokens?: number | null; reasoningTokens?: number | null; totalTokens?: number | null };
  [key: string]: unknown;
};

export type ChatGptAdapterResultV0337<T extends ChatGptTransportResultV0337> = ProviderAnalysisResultV0337 & { transportResult: T };

export class ChatGptCodexProviderAdapterV0337<T extends ChatGptTransportResultV0337> implements AnalysisProviderAdapterV0337<ChatGptAdapterResultV0337<T>> {
  readonly id = CHATGPT_CODEX_PROVIDER_ID_V0337;
  constructor(
    private readonly transport: (request: ProviderAnalysisRequestV0337, sink: ProviderEventSinkV0337) => Promise<T>,
    private readonly cancelTransport: (runId: string, reason: string) => Promise<boolean>,
    private readonly ready: () => boolean
  ) {}
  async getCapabilities(): Promise<ProviderCapabilitiesV0337> {
    return { providerId: this.id, displayName: "ChatGPT / Bundled Codex", networkRequired: true, authenticationRequired: true, productionSelectable: true, supportsCancellation: true };
  }
  async preflight(_request: ProviderAnalysisRequestV0337) {
    const capability = await this.getCapabilities();
    return { ok: this.ready(), providerId: this.id, capability, findingCode: this.ready() ? null : "CHATGPT_SIGN_IN_REQUIRED" } as const;
  }
  async analyze(request: ProviderAnalysisRequestV0337, sink: ProviderEventSinkV0337): Promise<ChatGptAdapterResultV0337<T>> {
    const preflight = await this.preflight(request);
    if (!preflight.ok) throw Object.assign(new Error(preflight.findingCode ?? "PROVIDER_PREFLIGHT_FAILED"), { code: preflight.findingCode ?? "PROVIDER_PREFLIGHT_FAILED" });
    await sink.append({ type: "prepared", runId: request.runId, atUtc: new Date().toISOString(), nonSensitivePayload: { providerId: this.id } });
    const transportResult = await this.transport(request, sink);
    await sink.append({ type: "completed", runId: request.runId, atUtc: new Date().toISOString(), nonSensitivePayload: { providerId: this.id } });
    return { providerId: this.id, terminal: "completed", artifact: null, warningCodes: [], transportResult };
  }
  async cancel(runId: string, reason: string) { return { cancelled: await this.cancelTransport(runId, reason), runId, reason }; }
}

export class AnalysisProviderRegistryV0337 {
  private readonly adapters = new Map<string, AnalysisProviderAdapterV0337>();
  register(adapter: AnalysisProviderAdapterV0337) {
    if (this.adapters.has(adapter.id)) throw new Error(`PROVIDER_ADAPTER_DUPLICATE:${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
    return this;
  }
  require(providerId: string) {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw Object.assign(new Error(`PROVIDER_ADAPTER_NOT_REGISTERED:${providerId}`), { code: "PROVIDER_ADAPTER_NOT_REGISTERED" });
    return adapter;
  }
  async productionCapabilities() {
    const all = await Promise.all([...this.adapters.values()].map((adapter) => adapter.getCapabilities()));
    return all.filter((item) => item.productionSelectable);
  }
}
