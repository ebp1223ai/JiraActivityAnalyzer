import crypto from "node:crypto";
import { buildIdentityReceipt as buildV0326Receipt, persistAiSubmittedArtifact as persistV0326Submission, type ArtifactSubmissionV0326 } from "./aiArtifactIdentityV0326.js";

export type ApprovedArtifactIdentityV0328 = Readonly<{
  identityVersion: "jaa-approved-artifact-identity-v1";
  applicationVersion: "0.3.33";
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
  promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.33";
  bridgeIdentity: "0.3.31-bridge-v13";
  createdAtUtc: string;
}>;

export type ArtifactSubmissionV0328 = ArtifactSubmissionV0326;

export function createApprovedArtifactIdentityV0328(input: Omit<ApprovedArtifactIdentityV0328, "identityVersion" | "applicationVersion" | "decisionContract" | "promptIdentity" | "bridgeIdentity" | "createdAtUtc"> & { createdAtUtc?: string }) {
  return Object.freeze({
    identityVersion: "jaa-approved-artifact-identity-v1",
    applicationVersion: "0.3.33",
    ...input,
    decisionContract: "jaa-ai-analysis-decisions-v5",
    promptIdentity: "JAA-CHATGPT-ZH-TW-0.3.33",
    bridgeIdentity: "0.3.31-bridge-v13",
    createdAtUtc: input.createdAtUtc ?? new Date().toISOString()
  }) as ApprovedArtifactIdentityV0328;
}

export function artifactIdentityHashV0328(identity: ApprovedArtifactIdentityV0328) {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
  return crypto.createHash("sha256").update(JSON.stringify(stable(identity))).digest("hex");
}

export function buildIdentityReceiptV0328(identity: ApprovedArtifactIdentityV0328, actual: ApprovedArtifactIdentityV0328, tokenBindingResult: string) {
  return buildV0326Receipt(identity as never, actual as never, tokenBindingResult);
}

export function persistAiSubmittedArtifactV0328(runDirectory: string, attemptNumber: number, submission: ArtifactSubmissionV0328, identity: ApprovedArtifactIdentityV0328) {
  return persistV0326Submission(runDirectory, attemptNumber, submission, identity as never);
}
