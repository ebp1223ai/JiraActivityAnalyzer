import fs from "node:fs";
import path from "node:path";
import { sha256BytesV0337 } from "./durableIoV0337.js";
import { verifyReducerFactJournalV0337 } from "./reducerFactJournalV0337.js";

export const DURABLE_ARTIFACT_TRUTH_RESOLVER_VERSION_V0337 = "jaa-durable-artifact-truth-resolver-v1" as const;
export type DurableArtifactTruthStatusV0337 = "PERSISTED_VALID" | "NOT_FOUND" | "CONTRADICTORY" | "CORRUPT";
export type ArtifactTruthPathsV0337 = { artifactPath: string; receiptPath: string; runManifestPath?: string | null; factJournalPath?: string | null; bridgeEvidencePath?: string | null };

const readJson = (filePath: string) => { try { return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, any>; } catch { return null; } };
const pickHash = (value: Record<string, any> | null) => value?.artifactSha256 ?? value?.aiSubmittedArtifactSha256 ?? value?.submissionSha256 ?? value?.sha256 ?? value?.bridgeEvidence?.artifactReceipt?.aiSubmittedArtifactSha256 ?? value?.bridgeEvidence?.artifactReceipt?.artifactSha256 ?? value?.run?.bridgeEvidence?.artifactReceipt?.aiSubmittedArtifactSha256 ?? value?.run?.bridgeEvidence?.artifactReceipt?.artifactSha256 ?? null;
const pickBytes = (value: Record<string, any> | null) => value?.artifactBytes ?? value?.submissionBytes ?? value?.bytes ?? null;

export function resolveDurableArtifactTruthV0337(runId: string, paths: ArtifactTruthPathsV0337) {
  const evidence: Array<Record<string, unknown>> = [];
  const findings: Array<Record<string, unknown>> = [];
  const artifactExists = fs.existsSync(paths.artifactPath);
  const receipt = fs.existsSync(paths.receiptPath) ? readJson(paths.receiptPath) : null;
  const manifest = paths.runManifestPath && fs.existsSync(paths.runManifestPath) ? readJson(paths.runManifestPath) : null;
  const bridge = paths.bridgeEvidencePath && fs.existsSync(paths.bridgeEvidencePath) ? readJson(paths.bridgeEvidencePath) : null;
  const journal = paths.factJournalPath ? verifyReducerFactJournalV0337(paths.factJournalPath, runId) : { valid: true, facts: [], findings: [] as string[] };
  const persistedFact = journal.facts.find((fact) => fact.factType === "ARTIFACT_PERSISTED") ?? null;
  const positiveEvidence = Boolean(receipt || pickHash(manifest) || pickHash(bridge) || persistedFact);
  if (!journal.valid) findings.push({ code: "REDUCER_FACT_JOURNAL_CORRUPT", findings: journal.findings });
  if (!artifactExists) {
    if (positiveEvidence) findings.push({ code: "ARTIFACT_FILE_MISSING_WITH_POSITIVE_DURABLE_EVIDENCE" });
    return Object.freeze({ schemaVersion: DURABLE_ARTIFACT_TRUTH_RESOLVER_VERSION_V0337, runId, status: positiveEvidence ? "CONTRADICTORY" as const : "NOT_FOUND" as const, artifactPath: paths.artifactPath, artifactBytes: null, artifactSha256: null, evidence, findings });
  }
  const bytes = fs.readFileSync(paths.artifactPath); const observedSha256 = sha256BytesV0337(bytes);
  evidence.push({ source: "artifact_file", path: paths.artifactPath, bytes: bytes.length, sha256: observedSha256 });
  const expectedHashes = [pickHash(receipt), pickHash(manifest), pickHash(bridge), persistedFact?.nonSensitivePayload?.artifactSha256].filter((value): value is string => typeof value === "string");
  const expectedBytes = [pickBytes(receipt), pickBytes(manifest), pickBytes(bridge), persistedFact?.nonSensitivePayload?.artifactBytes].filter((value): value is number => typeof value === "number");
  const journalExpected = Boolean(paths.factJournalPath && fs.existsSync(paths.factJournalPath));
  if (!receipt || (journalExpected && !persistedFact)) findings.push({ code: "ARTIFACT_DURABLE_BINDING_INCOMPLETE", receiptPresent: Boolean(receipt), persistedFactPresent: Boolean(persistedFact), journalExpected });
  if (expectedHashes.some((value) => value !== observedSha256)) findings.push({ code: "ARTIFACT_HASH_MISMATCH", expected: expectedHashes, observed: observedSha256 });
  if (expectedBytes.some((value) => value !== bytes.length)) findings.push({ code: "ARTIFACT_BYTES_MISMATCH", expected: expectedBytes, observed: bytes.length });
  const corrupt = !journal.valid || findings.some((item) => String(item.code).includes("HASH_MISMATCH") || String(item.code).includes("BYTES_MISMATCH"));
  const contradictory = !corrupt && findings.length > 0;
  return Object.freeze({ schemaVersion: DURABLE_ARTIFACT_TRUTH_RESOLVER_VERSION_V0337, runId, status: corrupt ? "CORRUPT" as const : contradictory ? "CONTRADICTORY" as const : "PERSISTED_VALID" as const, artifactPath: paths.artifactPath, artifactBytes: bytes.length, artifactSha256: observedSha256, evidence, findings });
}

export function discoverArtifactTruthPathsV0337(runDirectory: string): ArtifactTruthPathsV0337 | null {
  const artifactDirectory = path.join(runDirectory, "artifact-attempts");
  if (!fs.existsSync(artifactDirectory)) return null;
  const artifactName = fs.readdirSync(artifactDirectory).filter((name) => /^ai-submitted-artifact-attempt-\d+[.]json$/i.test(name)).sort().at(-1);
  if (!artifactName) return null;
  return { artifactPath: path.join(artifactDirectory, artifactName), receiptPath: path.join(runDirectory, "progress", "artifact-receipt.json"), runManifestPath: path.join(runDirectory, "run-manifest.json"), factJournalPath: path.join(runDirectory, "progress", "reducer-facts.jsonl"), bridgeEvidencePath: path.join(runDirectory, "debug", "bridge-evidence.json") };
}
