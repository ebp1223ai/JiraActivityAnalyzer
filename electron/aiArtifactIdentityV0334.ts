import crypto from "node:crypto";
import { buildIdentityReceipt as buildV0326Receipt, persistAiSubmittedArtifact as persistV0326Submission, type ArtifactSubmissionV0326 } from "./aiArtifactIdentityV0326.js";

export type ApprovedArtifactIdentityV0334 = Readonly<{
  identityVersion: "jaa-approved-artifact-identity-v1";
  applicationVersion: "0.3.34";
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
  promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.34";
  bridgeIdentity: "0.3.34-bridge-v14";
  createdAtUtc: string;
}>;

export type ArtifactSubmissionV0334 = ArtifactSubmissionV0326;

export function createApprovedArtifactIdentityV0334(input: Omit<ApprovedArtifactIdentityV0334, "identityVersion" | "applicationVersion" | "decisionContract" | "promptIdentity" | "bridgeIdentity" | "createdAtUtc"> & { createdAtUtc?: string }) {
  return Object.freeze({
    identityVersion: "jaa-approved-artifact-identity-v1",
    applicationVersion: "0.3.34",
    ...input,
    decisionContract: "jaa-ai-analysis-decisions-v5",
    promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.34",
    bridgeIdentity: "0.3.34-bridge-v14",
    createdAtUtc: input.createdAtUtc ?? new Date().toISOString()
  }) as ApprovedArtifactIdentityV0334;
}

export function artifactIdentityHashV0334(identity: ApprovedArtifactIdentityV0334) {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
  return crypto.createHash("sha256").update(JSON.stringify(stable(identity))).digest("hex");
}

export function buildIdentityReceiptV0334(identity: ApprovedArtifactIdentityV0334, actual: ApprovedArtifactIdentityV0334, tokenBindingResult: string) {
  return buildV0326Receipt(identity as never, actual as never, tokenBindingResult);
}

export function persistAiSubmittedArtifactV0334(runDirectory: string, attemptNumber: number, submission: ArtifactSubmissionV0334, identity: ApprovedArtifactIdentityV0334) {
  return persistV0326Submission(runDirectory, attemptNumber, submission, identity as never);
}
