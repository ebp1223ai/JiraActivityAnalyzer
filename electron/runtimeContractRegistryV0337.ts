import crypto from "node:crypto";

export const RUNTIME_CONTRACT_REGISTRY_VERSION_V0337 = "jaa-runtime-contract-registry-v2" as const;
const registryValue = {
  schemaVersion: RUNTIME_CONTRACT_REGISTRY_VERSION_V0337,
  applicationVersion: "0.3.37", promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.37", promptTemplateVersion: "0.3.37-zh-TW-v18",
  pipelineIdentity: "JAA-ANALYSIS-PIPELINE-0.3.37", bridgeIdentity: "0.3.37-bridge-v17", bridgeSchemaVersion: "jaa-analysis-bridge-v11",
  providerTransport: "bridge-resumable-v4", hostLifecycleContract: "jaa-host-control-lifecycle-v3", terminalOutcomeReducer: "jaa-terminal-outcome-reducer-v1",
  providerAdapter: "jaa-analysis-provider-adapter-v1", providerRequest: "jaa-provider-analysis-request-v1", providerArtifact: "jaa-provider-analysis-artifact-v1",
  durableArtifactTruthResolver: "jaa-durable-artifact-truth-resolver-v1", reducerFactJournal: "jaa-reducer-fact-journal-v1", terminalContradictionGuard: "jaa-terminal-contradiction-guard-v1", recoverySupersession: "jaa-recovery-supersession-receipt-v1",
  postArtifactPipeline: "jaa-post-artifact-pipeline-v1", analysisTelemetryContract: "jaa-analysis-telemetry-v1", artifactCompletionContract: "jaa-artifact-completion-boundary-v1",
  artifactSubmissionResult: "jaa-artifact-submission-result-v3", artifactIdentityReceipt: "jaa-artifact-identity-receipt-v1",
  modelInputManifestSchema: "jaa-model-input-manifest-v3", modelInputSegmentSchema: "jaa-model-input-segment-v3", segmentPlanner: "jaa-protected-token-safe-segment-planner-v1",
  segmentBoundaryReceipt: "jaa-segment-boundary-safety-receipt-v1", modelDeliveryHandleContract: "jaa-model-delivery-handle-v1", artifactSubmissionTokenContract: "jaa-artifact-submission-token-v1",
  decisionContract: "jaa-ai-analysis-decisions-v5", qualityContract: "jaa-ai-analysis-quality-v4", multiSkillIndependence: "jaa-multi-skill-evidence-coverage-v2",
  validationStageReceipt: "jaa-validation-stage-receipt-v2", terminalEvent: "jaa-run-terminal-event-v1", modelAnalysisPayload: "ai-analysis-compact-payload-v2",
  compactPayloadBuilder: "compact-builder-v2", modelVisibleQuoteMap: "JAA-MODEL-VISIBLE-EVIDENCE-QUOTE-MAP-1.0.0", quoteCoverageReceipt: "jaa-model-visible-evidence-quote-receipt-v1",
  systemicNoResultGate: "jaa-systemic-no-result-gate-v1", evidenceQuoteCatalog: "JAA-EVIDENCE-QUOTE-CATALOG-1.0.0", canonicalContract: "jaa-canonical-analysis-result-v5",
  reportDataPackageContract: "jaa-analysis-report-data-package-v1", htmlTemplateContract: "jaa-html-report-template-v6", htmlRenderer: "JAA-LOCAL-HTML-RENDERER-1.5.1",
  requiredReportCapability: "LAYERED_VALIDATION_RECEIPTS_V2", manifestFactoryVersion: "jaa-model-input-manifest-factory-v3.2", dispatchGateVersion: "jaa-provider-dispatch-identity-gate-v2",
  manifestReceiptVersion: "jaa-runtime-manifest-receipt-v1", rules: Object.freeze({ manifestVersion: "0.8.6", commonRulesVersion: "1.6.6", catalogVersion: "0.3.1", htmlTemplateVersion: "1.5.1" })
} as const;
function deepFreeze<T>(value: T): Readonly<T> { if (value && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }
export const RUNTIME_CONTRACT_V0337 = deepFreeze({ ...registryValue, registryHash: crypto.createHash("sha256").update(JSON.stringify(registryValue)).digest("hex") });
export type RuntimeContractV0337 = typeof RUNTIME_CONTRACT_V0337;
export function validateDispatchIdentityV0337(input: { applicationVersion: string; promptIdentity: string; promptTemplateVersion: string; decisionContract: string; qualityContract: string; bridgeIdentity: string; providerTransport: string; outputSchemaSha256: string; expectedOutputSchemaSha256: string; rulesSnapshotId: string; requestRulesSnapshotId: string }) {
  const expected = RUNTIME_CONTRACT_V0337;
  const mismatches = [["applicationVersion", expected.applicationVersion, input.applicationVersion], ["promptIdentity", expected.promptIdentity, input.promptIdentity], ["promptTemplateVersion", expected.promptTemplateVersion, input.promptTemplateVersion], ["decisionContract", expected.decisionContract, input.decisionContract], ["qualityContract", expected.qualityContract, input.qualityContract], ["bridgeIdentity", expected.bridgeIdentity, input.bridgeIdentity], ["providerTransport", expected.providerTransport, input.providerTransport], ["outputSchemaSha256", input.expectedOutputSchemaSha256, input.outputSchemaSha256], ["rulesSnapshotId", input.rulesSnapshotId, input.requestRulesSnapshotId]].filter(([, expectedValue, observed]) => expectedValue !== observed).map(([field, expectedValue, observed]) => ({ field, expected: expectedValue, observed }));
  if (mismatches.length) throw Object.assign(new Error(`AI_RUNTIME_CONTRACT_REGISTRY_MISMATCH:${JSON.stringify(mismatches)}`), { code: "AI_RUNTIME_CONTRACT_REGISTRY_MISMATCH", mismatches });
  return Object.freeze({ schemaVersion: "jaa-provider-dispatch-identity-receipt-v2", status: "PASSED", registryHash: expected.registryHash, checkedAtUtc: new Date().toISOString(), identities: structuredClone(input) });
}
