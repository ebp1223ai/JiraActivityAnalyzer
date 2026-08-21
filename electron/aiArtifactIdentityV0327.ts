import crypto from "node:crypto";
import { buildIdentityReceipt as buildV0326Receipt, persistAiSubmittedArtifact as persistV0326Submission, type ArtifactSubmissionV0326 } from "./aiArtifactIdentityV0326.js";

export type ApprovedArtifactIdentityV0327 = Readonly<{
  identityVersion: "jaa-approved-artifact-identity-v1";
  analysisAttemptId: string;
  runId: string;
  requestId: string;
  threadId: string;
  turnId: string;
  provider: string;
  model: string;
  sourceDatasetSha256: string;
  sourceDatasetBytes: number;
  sourceRecordCount: number;
  rulesSnapshotId: string;
  manifestSha256: string;
  commonRulesSha256: string;
  catalogSha256: string;
  decisionContract: "jaa-ai-analysis-decisions-v5";
  outputSchemaSha256: string;
  promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.27";
  bridgeIdentity: "0.3.27-bridge-v9";
  createdAtUtc: string;
}>;

export type ArtifactSubmissionV0327 = ArtifactSubmissionV0326;

export function createApprovedArtifactIdentityV0327(input: Omit<ApprovedArtifactIdentityV0327, "identityVersion" | "decisionContract" | "promptIdentity" | "bridgeIdentity" | "createdAtUtc"> & { createdAtUtc?: string }) {
  return Object.freeze({
    identityVersion: "jaa-approved-artifact-identity-v1",
    ...input,
    decisionContract: "jaa-ai-analysis-decisions-v5",
    promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.27",
    bridgeIdentity: "0.3.27-bridge-v9",
    createdAtUtc: input.createdAtUtc ?? new Date().toISOString()
  }) as ApprovedArtifactIdentityV0327;
}

export function artifactIdentityHashV0327(identity: ApprovedArtifactIdentityV0327) {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
  return crypto.createHash("sha256").update(JSON.stringify(stable(identity))).digest("hex");
}

export function buildIdentityReceiptV0327(identity: ApprovedArtifactIdentityV0327, actual: ApprovedArtifactIdentityV0327, tokenBindingResult: string) {
  return buildV0326Receipt(identity as never, actual as never, tokenBindingResult);
}

export function persistAiSubmittedArtifactV0327(runDirectory: string, attemptNumber: number, submission: ArtifactSubmissionV0327, identity: ApprovedArtifactIdentityV0327) {
  return persistV0326Submission(runDirectory, attemptNumber, submission, identity as never);
}
