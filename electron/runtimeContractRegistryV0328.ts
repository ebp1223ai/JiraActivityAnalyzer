import crypto from "node:crypto";

export const RUNTIME_CONTRACT_REGISTRY_VERSION_V0328 = "jaa-runtime-contract-registry-v1" as const;

const registryValue = {
  schemaVersion: RUNTIME_CONTRACT_REGISTRY_VERSION_V0328,
  applicationVersion: "0.3.29",
  promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.29",
  promptTemplateVersion: "0.3.29-zh-TW-v10",
  bridgeIdentity: "0.3.29-bridge-v11",
  bridgeSchemaVersion: "jaa-analysis-bridge-v10",
  providerTransport: "bridge-resumable-v3",
  modelInputManifestSchema: "jaa-model-input-manifest-v3",
  modelDeliveryHandleContract: "jaa-model-delivery-handle-v1",
  artifactSubmissionTokenContract: "jaa-artifact-submission-token-v1",
  decisionContract: "jaa-ai-analysis-decisions-v5",
  modelAnalysisPayload: "ai-analysis-compact-payload-v2",
  compactPayloadBuilder: "compact-builder-v2",
  modelVisibleQuoteMap: "JAA-MODEL-VISIBLE-EVIDENCE-QUOTE-MAP-1.0.0",
  quoteCoverageReceipt: "jaa-model-visible-evidence-quote-receipt-v1",
  systemicNoResultGate: "jaa-systemic-no-result-gate-v1",
  evidenceQuoteCatalog: "JAA-EVIDENCE-QUOTE-CATALOG-1.0.0",
  canonicalContract: "jaa-canonical-analysis-result-v5",
  reportDataPackageContract: "jaa-analysis-report-data-package-v1",
  htmlTemplateContract: "jaa-html-report-template-v6",
  htmlRenderer: "JAA-LOCAL-HTML-RENDERER-1.5.0",
  manifestFactoryVersion: "jaa-model-input-manifest-factory-v3.2",
  dispatchGateVersion: "jaa-provider-dispatch-gate-v1",
  manifestReceiptVersion: "jaa-runtime-manifest-receipt-v1"
} as const;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const RUNTIME_CONTRACT_V0328 = deepFreeze({
  ...registryValue,
  registryHash: crypto.createHash("sha256").update(JSON.stringify(registryValue)).digest("hex")
});

export type RuntimeContractV0328 = typeof RUNTIME_CONTRACT_V0328;
