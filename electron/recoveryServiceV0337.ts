import fs from "node:fs";
import path from "node:path";
import { durableWriteJsonV0337, sha256BytesV0337 } from "./durableIoV0337.js";
import { discoverArtifactTruthPathsV0337, resolveDurableArtifactTruthV0337 } from "./durableArtifactTruthResolverV0337.js";
import { POST_ARTIFACT_STAGES_V0337, PostArtifactPipelineV0337, type PostArtifactStageV0337, type StageActionResultV0337 } from "./postArtifactPipelineV0337.js";
import { ReducerFactJournalV0337 } from "./reducerFactJournalV0337.js";

export const RECOVERY_SUPERSESSION_RECEIPT_VERSION_V0337 = "jaa-recovery-supersession-receipt-v1" as const;
export type RecoveryActionsV0337 = Partial<Record<PostArtifactStageV0337, () => StageActionResultV0337>>;

export function inspectRecoveryCandidateV0337(runDirectory: string, runId: string) {
  const paths = discoverArtifactTruthPathsV0337(runDirectory);
  if (!paths) return Object.freeze({ runId, eligible: false, reason: "ARTIFACT_NOT_FOUND", resolver: null, nextStage: null });
  const resolver = resolveDurableArtifactTruthV0337(runId, paths);
  const pipeline = resolver.status === "PERSISTED_VALID" ? new PostArtifactPipelineV0337(runDirectory, runId, resolver.artifactSha256!) : null;
  const nextStage = pipeline?.snapshot().nextStage ?? null;
  return Object.freeze({ runId, eligible: resolver.status === "PERSISTED_VALID" && Boolean(nextStage), reason: resolver.status === "PERSISTED_VALID" ? nextStage ? "POST_ARTIFACT_INCOMPLETE" : "ALREADY_COMPLETE" : resolver.status, resolver, nextStage });
}

export function recoverPersistedArtifactV0337(input: { runDirectory: string; runId: string; actions: RecoveryActionsV0337; sqliteIsolation: boolean; oldTerminalPath?: string | null }) {
  const candidate = inspectRecoveryCandidateV0337(input.runDirectory, input.runId);
  if (candidate.reason === "ALREADY_COMPLETE" && candidate.resolver?.artifactSha256) {
    const pipeline = new PostArtifactPipelineV0337(input.runDirectory, input.runId, candidate.resolver.artifactSha256).snapshot();
    return Object.freeze({ attemptId: null, resolver: candidate.resolver, pipeline, recoveryTerminalPath: null, supersessionReceiptPath: null, providerContacted: false, providerTokenDelta: 0, idempotentReplay: true });
  }
  if (!candidate.eligible || !candidate.resolver?.artifactSha256) throw Object.assign(new Error(`RECOVERY_NOT_ELIGIBLE:${candidate.reason}`), { code: "RECOVERY_NOT_ELIGIBLE", candidate });
  const journal = new ReducerFactJournalV0337(input.runDirectory, input.runId);
  const attemptId = `recovery_${cryptoId(input.runId + candidate.resolver.artifactSha256).slice(0, 24)}`;
  journal.append("RECOVERY_STARTED", "recovery-service-v0337", { attemptId, artifactSha256: candidate.resolver.artifactSha256, providerContacted: false });
  const pipeline = new PostArtifactPipelineV0337(input.runDirectory, input.runId, candidate.resolver.artifactSha256);
  const snapshot = pipeline.runAll(input.actions, { sqliteIsolation: input.sqliteIsolation });
  const recoveryTerminal = { schemaVersion: "jaa-recovery-terminal-event-v1", attemptId, runId: input.runId, artifactSha256: candidate.resolver.artifactSha256, outcome: snapshot.completed ? "SUCCEEDED" : "FAILED", providerContacted: false, providerTokenDelta: 0, completedAtUtc: new Date().toISOString() };
  const recoveryTerminalPath = path.join(input.runDirectory, "recovery", attemptId, "recovery-terminal.json"); durableWriteJsonV0337(recoveryTerminalPath, recoveryTerminal);
  let supersessionReceiptPath: string | null = null;
  if (input.oldTerminalPath && fs.existsSync(input.oldTerminalPath)) {
    const oldBytes = fs.readFileSync(input.oldTerminalPath); const oldTerminalHash = sha256BytesV0337(oldBytes); const newTerminalHash = sha256BytesV0337(fs.readFileSync(recoveryTerminalPath));
    const receipt = { schemaVersion: RECOVERY_SUPERSESSION_RECEIPT_VERSION_V0337, status: "superseded_by_recovery", runId: input.runId, artifactSha256: candidate.resolver.artifactSha256, oldTerminalHash, newTerminalHash, reason: "Durable Artifact recovered through the idempotent post-artifact pipeline.", createdAtUtc: new Date().toISOString() };
    supersessionReceiptPath = path.join(input.runDirectory, "recovery", attemptId, "supersession-receipt.json"); durableWriteJsonV0337(supersessionReceiptPath, receipt);
  }
  journal.append("RECOVERY_COMPLETED", "recovery-service-v0337", { attemptId, artifactSha256: candidate.resolver.artifactSha256, outcome: recoveryTerminal.outcome, recoveryTerminalPath, supersessionReceiptPath });
  return Object.freeze({ attemptId, resolver: candidate.resolver, pipeline: snapshot, recoveryTerminalPath, supersessionReceiptPath, providerContacted: false, providerTokenDelta: 0 });
}

export function scanRecoveryCandidatesV0337(rootDirectory: string) {
  if (!fs.existsSync(rootDirectory)) return [];
  return fs.readdirSync(rootDirectory, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => inspectRecoveryCandidateV0337(path.join(rootDirectory, item.name), item.name)).filter((item) => item.eligible);
}

function cryptoId(value: string) { return sha256BytesV0337(value); }

export function buildIsolatedRecoveryActionsV0337(runDirectory: string, runId: string, artifactSha256: string): RecoveryActionsV0337 {
  const output = path.join(runDirectory, "recovery-output"); fs.mkdirSync(output, { recursive: true });
  const actions: RecoveryActionsV0337 = {};
  for (const stage of POST_ARTIFACT_STAGES_V0337.filter((item) => item !== "SQLITE")) actions[stage] = () => {
    const filePath = path.join(output, `${stage.toLowerCase()}.json`); const value = { runId, artifactSha256, stage, testIsolation: true }; const written = durableWriteJsonV0337(filePath, value); return { evidencePath: filePath, evidenceSha256: written.sha256 };
  };
  return actions;
}
