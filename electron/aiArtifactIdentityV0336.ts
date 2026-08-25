import crypto from "node:crypto";
import { persistAiSubmittedArtifact, type ArtifactSubmissionV0326 } from "./aiArtifactIdentityV0326.js";
import { RUNTIME_CONTRACT_V0336, type RuntimeContractV0336 } from "./runtimeContractRegistryV0336.js";

export const ARTIFACT_IDENTITY_RECEIPT_VERSION_V0336 = "jaa-artifact-identity-receipt-v1" as const;

export type RunIdentityFieldsV0336 = {
  analysisAttemptId: string; runId: string; requestId: string; threadId: string; turnId: string;
  provider: string; model: string; sourceDatasetSha256: string; sourceDatasetBytes: number;
  sourceRecordCount: number; rulesSnapshotId: string; manifestSha256: string;
  commonRulesSha256: string; catalogSha256: string; outputSchemaSha256: string;
};

export type ArtifactIdentityV0336 = Readonly<RunIdentityFieldsV0336 & {
  identityVersion: "jaa-approved-artifact-identity-v2";
  applicationVersion: string; promptIdentity: string; promptTemplateVersion: string;
  pipelineIdentity: string; bridgeIdentity: string; transportIdentity: string;
  decisionContract: string; registryHash: string; createdAtUtc: string;
}>;
export type ArtifactSubmissionV0336 = ArtifactSubmissionV0326;

function fromRegistry(registry: RuntimeContractV0336, input: RunIdentityFieldsV0336, createdAtUtc: string): ArtifactIdentityV0336 {
  return Object.freeze({ identityVersion: "jaa-approved-artifact-identity-v2", ...input,
    applicationVersion: registry.applicationVersion, promptIdentity: registry.promptIdentity,
    promptTemplateVersion: registry.promptTemplateVersion, pipelineIdentity: registry.pipelineIdentity,
    bridgeIdentity: registry.bridgeIdentity, transportIdentity: registry.providerTransport,
    decisionContract: registry.decisionContract, registryHash: registry.registryHash, createdAtUtc });
}

export function sealDispatchExpectedIdentityV0336(input: RunIdentityFieldsV0336, registry: RuntimeContractV0336 = RUNTIME_CONTRACT_V0336) {
  return fromRegistry(registry, input, new Date().toISOString());
}

export function injectArtifactActualIdentityV0336(input: RunIdentityFieldsV0336, createdAtUtc: string, registry: RuntimeContractV0336 = RUNTIME_CONTRACT_V0336) {
  return fromRegistry(registry, input, createdAtUtc);
}

export function buildArtifactIdentityReceiptV0336(expected: ArtifactIdentityV0336, observed: ArtifactIdentityV0336, tokenBindingResult: string) {
  const fields = ["applicationVersion", "promptIdentity", "promptTemplateVersion", "pipelineIdentity", "bridgeIdentity", "transportIdentity", "decisionContract", "registryHash",
    "analysisAttemptId", "runId", "requestId", "threadId", "turnId", "provider", "model", "sourceDatasetSha256", "sourceDatasetBytes", "sourceRecordCount", "rulesSnapshotId", "manifestSha256", "commonRulesSha256", "catalogSha256", "outputSchemaSha256"] as const;
  const comparisons = fields.map((field) => ({ field, expected: expected[field], observed: observed[field], match: expected[field] === observed[field], expectedSource: "dispatch-time-frozen-registry", observedSource: "artifact-time-host-registry-injection" }));
  const firstMismatch = comparisons.find((entry) => !entry.match) ?? null;
  return Object.freeze({ schemaVersion: ARTIFACT_IDENTITY_RECEIPT_VERSION_V0336, accepted: !firstMismatch && tokenBindingResult === "MATCH", tokenBindingResult,
    firstMismatchCode: firstMismatch ? "IDENTITY_MISMATCH" : null, comparisons,
    expectedIdentitySha256: sha256(expected), observedIdentitySha256: sha256(observed), checkedAtUtc: new Date().toISOString() });
}

export function persistAiSubmittedArtifactV0336(runDirectory: string, attemptNumber: number, submission: ArtifactSubmissionV0336, identity: ArtifactIdentityV0336) {
  return persistAiSubmittedArtifact(runDirectory, attemptNumber, submission, identity as never);
}

function sha256(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
