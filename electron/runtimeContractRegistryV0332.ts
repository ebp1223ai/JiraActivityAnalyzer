import crypto from "node:crypto";

export const RUNTIME_CONTRACT_REGISTRY_VERSION_V0332 = "jaa-runtime-contract-registry-v1" as const;

const registryValue = {
  schemaVersion: RUNTIME_CONTRACT_REGISTRY_VERSION_V0332,
  applicationVersion: "0.3.32",
  promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.32",
  promptTemplateVersion: "0.3.32-zh-TW-v13",
  bridgeIdentity: "0.3.31-bridge-v13",
  bridgeSchemaVersion: "jaa-analysis-bridge-v10",
  providerTransport: "bridge-resumable-v4",
  modelInputManifestSchema: "jaa-model-input-manifest-v3",
  modelInputSegmentSchema: "jaa-model-input-segment-v3",
  segmentPlanner: "jaa-protected-token-safe-segment-planner-v1",
  segmentBoundaryReceipt: "jaa-segment-boundary-safety-receipt-v1",
  modelDeliveryHandleContract: "jaa-model-delivery-handle-v1",
  artifactSubmissionTokenContract: "jaa-artifact-submission-token-v1",
  decisionContract: "jaa-ai-analysis-decisions-v5",
  qualityContract: "jaa-ai-analysis-quality-v3",
  multiSkillIndependence: "jaa-multi-skill-quote-independence-v1",
  validationStageReceipt: "jaa-validation-stage-receipt-v2",
  artifactSubmissionResult: "jaa-artifact-submission-result-v2",
  terminalEvent: "jaa-run-terminal-event-v1",
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

export const RUNTIME_CONTRACT_V0332 = deepFreeze({
  ...registryValue,
  registryHash: crypto.createHash("sha256").update(JSON.stringify(registryValue)).digest("hex")
});

export type RuntimeContractV0332 = typeof RUNTIME_CONTRACT_V0332;
