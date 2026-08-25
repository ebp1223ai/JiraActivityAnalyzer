import fs from "node:fs";
import path from "node:path";
import { durableWriteBytesV0337, durableWriteJsonV0337, sha256BytesV0337 } from "./durableIoV0337.js";
import { ReducerFactJournalV0337 } from "./reducerFactJournalV0337.js";

export const ARTIFACT_PERSISTENCE_VERSION_V0337 = "jaa-artifact-persistence-v1" as const;
export function persistProviderArtifactV0337(input: { runDirectory: string; runId: string; artifactBytes: Buffer; artifactFileName?: string; validateBinding: () => void; onLifecycleAdvance?: (receipt: Record<string, unknown>) => void; schedulePostArtifact?: (receipt: Record<string, unknown>) => void }) {
  input.validateBinding();
  const artifactPath = path.join(input.runDirectory, "artifact-attempts", input.artifactFileName ?? "ai-submitted-artifact-attempt-1.json");
  const artifactSha256 = sha256BytesV0337(input.artifactBytes);
  const journal = new ReducerFactJournalV0337(input.runDirectory, input.runId);
  journal.append("ARTIFACT_RECEIVED", "artifact-persistence-v0337", { artifactFileName: path.basename(artifactPath) });
  const artifact = durableWriteBytesV0337(artifactPath, input.artifactBytes);
  const receipt = { schemaVersion: "jaa-artifact-durable-receipt-v1", status: "persisted", runId: input.runId, artifactPath, artifactBytes: artifact.bytes, artifactSha256: artifact.sha256, persistedAtUtc: new Date().toISOString(), ordering: ["WRITE_TMP", "FSYNC_FILE", "ATOMIC_RENAME", "FSYNC_PARENT_IF_SUPPORTED", "REOPEN_VERIFY", "WRITE_RECEIPT", "APPEND_FACT"] };
  const receiptPath = path.join(input.runDirectory, "progress", "artifact-receipt.json");
  durableWriteJsonV0337(receiptPath, receipt);
  journal.append("ARTIFACT_PERSISTED", "artifact-persistence-v0337", { artifactPath, artifactBytes: artifact.bytes, artifactSha256: artifact.sha256, receiptPath });
  input.onLifecycleAdvance?.(receipt);
  input.schedulePostArtifact?.(receipt);
  return Object.freeze({ ...receipt, receiptPath });
}

export function verifyArtifactPersistenceOrderingV0337(sourceText: string) {
  const ordered = ["durableWriteBytesV0337", "durableWriteJsonV0337", 'journal.append("ARTIFACT_PERSISTED"', "onLifecycleAdvance", "schedulePostArtifact"];
  let previous = -1;
  for (const marker of ordered) { const position = sourceText.indexOf(marker); if (position <= previous) return false; previous = position; }
  return true;
}
