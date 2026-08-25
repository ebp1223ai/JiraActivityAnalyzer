import crypto from "node:crypto";
import { persistAiSubmittedArtifact, type ArtifactSubmissionV0326 } from "./aiArtifactIdentityV0326.js";
import { RUNTIME_CONTRACT_V0337, type RuntimeContractV0337 } from "./runtimeContractRegistryV0337.js";

export const ARTIFACT_IDENTITY_RECEIPT_VERSION_V0337 = "jaa-artifact-identity-receipt-v1" as const;

export type RunIdentityFieldsV0337 = {
  analysisAttemptId: string; runId: string; requestId: string; threadId: string; turnId: string;
  provider: string; model: string; sourceDatasetSha256: string; sourceDatasetBytes: number;
  sourceRecordCount: number; rulesSnapshotId: string; manifestSha256: string;
  commonRulesSha256: string; catalogSha256: string; outputSchemaSha256: string;
};

export type ArtifactIdentityV0337 = Readonly<RunIdentityFieldsV0337 & {
  identityVersion: "jaa-approved-artifact-identity-v2";
  applicationVersion: string; promptIdentity: string; promptTemplateVersion: string;
  pipelineIdentity: string; bridgeIdentity: string; transportIdentity: string;
  decisionContract: string; registryHash: string; createdAtUtc: string;
}>;
export type ArtifactSubmissionV0337 = ArtifactSubmissionV0326;

function fromRegistry(registry: RuntimeContractV0337, input: RunIdentityFieldsV0337, createdAtUtc: string): ArtifactIdentityV0337 {
  return Object.freeze({ identityVersion: "jaa-approved-artifact-identity-v2", ...input,
    applicationVersion: registry.applicationVersion, promptIdentity: registry.promptIdentity,
    promptTemplateVersion: registry.promptTemplateVersion, pipelineIdentity: registry.pipelineIdentity,
    bridgeIdentity: registry.bridgeIdentity, transportIdentity: registry.providerTransport,
    decisionContract: registry.decisionContract, registryHash: registry.registryHash, createdAtUtc });
}

export function sealDispatchExpectedIdentityV0337(input: RunIdentityFieldsV0337, registry: RuntimeContractV0337 = RUNTIME_CONTRACT_V0337) {
  return fromRegistry(registry, input, new Date().toISOString());
}

export function injectArtifactActualIdentityV0337(input: RunIdentityFieldsV0337, createdAtUtc: string, registry: RuntimeContractV0337 = RUNTIME_CONTRACT_V0337) {
  return fromRegistry(registry, input, createdAtUtc);
}

export function buildArtifactIdentityReceiptV0337(expected: ArtifactIdentityV0337, observed: ArtifactIdentityV0337, tokenBindingResult: string) {
  const fields = ["applicationVersion", "promptIdentity", "promptTemplateVersion", "pipelineIdentity", "bridgeIdentity", "transportIdentity", "decisionContract", "registryHash",
    "analysisAttemptId", "runId", "requestId", "threadId", "turnId", "provider", "model", "sourceDatasetSha256", "sourceDatasetBytes", "sourceRecordCount", "rulesSnapshotId", "manifestSha256", "commonRulesSha256", "catalogSha256", "outputSchemaSha256"] as const;
  const comparisons = fields.map((field) => ({ field, expected: expected[field], observed: observed[field], match: expected[field] === observed[field], expectedSource: "dispatch-time-frozen-registry", observedSource: "artifact-time-host-registry-injection" }));
  const firstMismatch = comparisons.find((entry) => !entry.match) ?? null;
  return Object.freeze({ schemaVersion: ARTIFACT_IDENTITY_RECEIPT_VERSION_V0337, accepted: !firstMismatch && tokenBindingResult === "MATCH", tokenBindingResult,
    firstMismatchCode: firstMismatch ? "IDENTITY_MISMATCH" : null, comparisons,
    expectedIdentitySha256: sha256(expected), observedIdentitySha256: sha256(observed), checkedAtUtc: new Date().toISOString() });
}

export function persistAiSubmittedArtifactV0337(runDirectory: string, attemptNumber: number, submission: ArtifactSubmissionV0337, identity: ArtifactIdentityV0337) {
  return persistAiSubmittedArtifact(runDirectory, attemptNumber, submission, identity as never);
}

function sha256(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
