import crypto from "node:crypto";
import fs from "node:fs";

export const LIFECYCLE_RECONCILIATION_VERSION_V0336 = "jaa-lifecycle-reconciliation-v1" as const;
export function reconcileLifecycleV0336(input: { controlState: string; artifactStatus: string; artifactPath?: string | null; artifactBytes?: number | null; artifactSha256?: string | null; validationReceipts: Array<{ stage: string; outcome?: string; result?: string }>; firstFailedStage?: string | null; rootErrorCode?: string | null; terminalOutcome?: string | null }) {
  const findings: Array<Record<string, unknown>> = [];
  let durableArtifact = false;
  if (input.artifactPath && input.artifactBytes != null && input.artifactSha256) try { const bytes = fs.readFileSync(input.artifactPath); const hash = crypto.createHash("sha256").update(bytes).digest("hex"); durableArtifact = bytes.length === input.artifactBytes && hash === input.artifactSha256; if (!durableArtifact) findings.push({ code: "ARTIFACT_EVIDENCE_MISMATCH", expectedBytes: input.artifactBytes, observedBytes: bytes.length, expectedSha256: input.artifactSha256, observedSha256: hash }); } catch { findings.push({ code: "ARTIFACT_EVIDENCE_MISSING", path: input.artifactPath }); }
  const failed = input.validationReceipts.find((receipt) => (receipt.outcome ?? receipt.result) === "FAILED")?.stage ?? null;
  if ((input.firstFailedStage ?? null) !== failed) findings.push({ code: "FIRST_FAILED_STAGE_MISMATCH", expected: failed, observed: input.firstFailedStage ?? null });
  if (["completed", "completed_with_warnings"].includes(input.terminalOutcome ?? "") && input.rootErrorCode) findings.push({ code: "SUCCESS_ROOT_ERROR_CONFLICT", observed: input.rootErrorCode });
  if (durableArtifact && ["not_started", "received"].includes(input.artifactStatus)) findings.push({ code: "ARTIFACT_STATUS_STALE", expected: "persisted", observed: input.artifactStatus });
  return Object.freeze({ schemaVersion: LIFECYCLE_RECONCILIATION_VERSION_V0336, valid: findings.length === 0, durableArtifact, derivedAnalysisStarted: durableArtifact, derivedAnalysisCompleted: durableArtifact, firstFailedStage: failed, findings });
}
