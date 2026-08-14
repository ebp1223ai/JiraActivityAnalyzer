import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { initializeAppRoot } from "../electron/appPaths.js";
import { AI_DECISION_SCHEMA_VERSION, atomicWriteCanonical, assembleCanonicalResults, createArtifactWorkspaces, parseAndValidateDecisions, readPublishedArtifacts, stableJson, warningPersistenceGate } from "../electron/aiAnalysisArtifactsV0316.js";
import { AiAnalysisRunArchive, DURABLE_FLUSH_INTERVAL_MS, MAX_DURABLE_FLUSH_INTERVAL_MS, loadArchivedRuns, verifyConversationLog } from "../electron/aiAnalysisRunArchiveV0314.js";

const root = fs.mkdtempSync(path.join(process.cwd(), "test-artifacts", "v0316-"));
initializeAppRoot(root);
const runId = "analysis_v0316_test";
const sourceSha256 = "a".repeat(64);
const rulesSnapshotId = "rules-v0316";
const recordCount = 117;
const records = Array.from({ length: recordCount }, (_, recordIndex) => ({
  recordIndex, sourceRecordStableId: `stable-${recordIndex}`, activityEventId: `event-${recordIndex}`,
  evidenceId: `evidence-${recordIndex}`, sourceContentHash: `hash-${recordIndex}`,
  issueKey: `TEST-${recordIndex + 1}`, fieldId: "description", fieldName: "Description",
  eventTime: "2026-08-13T00:00:00.000Z", sourceProvenance: "test", changedContent: "synthetic evidence"
}));
const compact: any = { schemaVersion: "compact-v1", eventCount: recordCount, records };
const rules: any = { snapshotId: rulesSnapshotId, ruleSetId: rulesSnapshotId, catalog: [{ id: "SKILL_1", name: "Skill One", group: "Synthetic" }] };
const decisionDocument = {
  schemaVersion: "ai-analysis-decisions-v1", runId, sourceSha256, rulesSnapshotId, expectedRecordCount: recordCount,
  decisions: records.map(({ recordIndex }) => ({ recordIndex, status: "UNKNOWN", skillIds: [], confidence: 0.2, positiveEvidence: [], negativeChecks: [], unknownReasons: [`Insufficient technical evidence for record ${recordIndex}`], rationale: `Rules were checked for record ${recordIndex}, but reliable classification evidence was unavailable.` }))
};

try {
  const expected = { runId, sourceSha256, rulesSnapshotId, recordCount, catalogSkillIds: ["SKILL_1"] };
  const parsed = parseAndValidateDecisions(JSON.stringify(decisionDocument), expected);
  assert.equal(parsed.validation.valid, true);
  assert.equal(parsed.validation.actualCount, 117);
  assert.equal(parsed.validation.semanticValidCount, 117);
  assert.equal(parsed.validation.allUnknown, true);
  assert.ok(parsed.validation.warnings.includes("ALL_RECORDS_UNKNOWN"));

  const invalidCases: Array<[unknown, string]> = [
    [{ ...decisionDocument, decisions: decisionDocument.decisions.slice(1) }, "AI_DECISION_COUNT_MISMATCH"],
    [{ ...decisionDocument, sourceSha256: "b".repeat(64) }, "AI_DECISION_SOURCE_HASH_MISMATCH"],
    [{ ...decisionDocument, rulesSnapshotId: "wrong" }, "AI_DECISION_RULES_SNAPSHOT_MISMATCH"],
    [{ ...decisionDocument, decisions: decisionDocument.decisions.map((item, index) => index === 0 ? { ...item, recordIndex: 1 } : item) }, "AI_DECISION_INDEX_SET_MISMATCH"],
    [{ ...decisionDocument, decisions: decisionDocument.decisions.map((item, index) => index === 0 ? { ...item, unknownReasons: [] } : item) }, "AI_DECISION_SEMANTIC_VALIDATION_FAILED"],
    [{ ...decisionDocument, decisions: decisionDocument.decisions.map((item, index) => index === 0 ? { ...item, rationale: "" } : item) }, "AI_DECISION_SEMANTIC_VALIDATION_FAILED"],
    [{ ...decisionDocument, decisions: decisionDocument.decisions.map((item, index) => index === 0 ? { ...item, confidence: 2 } : item) }, "AI_DECISION_SEMANTIC_VALIDATION_FAILED"],
    [{ ...decisionDocument, decisions: decisionDocument.decisions.map((item, index) => index === 0 ? { ...item, status: "MATCHED", skillIds: ["INVALID"] } : item) }, "AI_DECISION_SKILL_ID_INVALID"]
  ];
  for (const [value, expectedCode] of invalidCases) {
    const validation = parseAndValidateDecisions(JSON.stringify(value), expected).validation;
    assert.equal(validation.valid, false);
    assert.ok(validation.findings.some((finding) => finding.code === expectedCode), expectedCode);
  }

  const canonicalA = assembleCanonicalResults(compact, parsed.document, rules, "v0.3.16-test", null);
  const canonicalB = assembleCanonicalResults(compact, parsed.document, rules, "v0.3.16-test", null);
  assert.equal(canonicalA.length, 117);
  assert.equal(stableJson(canonicalA), stableJson(canonicalB));
  assert.equal(canonicalA[0].sourceRecordStableId, "stable-0");
  assert.equal(canonicalA[0].sourceContentHash, "hash-0");
  assert.equal(canonicalA[0].classificationStatus, "UNKNOWN");

  const pendingGate = warningPersistenceGate({ structuralValidationPassed: true, warnings: parsed.validation.warnings });
  assert.equal(pendingGate.sqliteEligible, false);
  assert.equal(pendingGate.requiresHumanAcceptance, true);
  assert.equal(warningPersistenceGate({ structuralValidationPassed: true, warnings: parsed.validation.warnings, acceptedWarnings: parsed.validation.warnings }).sqliteEligible, true);
  assert.equal(warningPersistenceGate({ structuralValidationPassed: false, warnings: [], acceptedWarnings: [] }).sqliteEligible, false);

  const artifactRun = path.join(root, "artifact-run");
  fs.mkdirSync(path.join(artifactRun, "input-workspace"), { recursive: true });
  const paths = createArtifactWorkspaces(artifactRun);
  fs.writeFileSync(paths.decisions + ".tmp", JSON.stringify(decisionDocument));
  fs.writeFileSync(paths.report + ".tmp", "# Analysis report\n\n117 records");
  assert.throws(() => readPublishedArtifacts(paths), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "AI_OUTPUT_PUBLISH_INCOMPLETE"));
  fs.renameSync(paths.decisions + ".tmp", paths.decisions);
  fs.renameSync(paths.report + ".tmp", paths.report);
  fs.writeFileSync(paths.finalMessage, "117 records analyzed; artifacts published.");
  const artifacts = readPublishedArtifacts(paths);
  assert.doesNotThrow(() => JSON.parse(artifacts.decisionsText));
  const canonicalFileA = atomicWriteCanonical(paths.canonicalResult, canonicalA);
  fs.unlinkSync(paths.canonicalResult);
  const canonicalFileB = atomicWriteCanonical(paths.canonicalResult, canonicalB);
  assert.equal(canonicalFileA.sha256, canonicalFileB.sha256);

  assert.equal(DURABLE_FLUSH_INTERVAL_MS <= MAX_DURABLE_FLUSH_INTERVAL_MS, true);
  assert.equal(MAX_DURABLE_FLUSH_INTERVAL_MS, 2_000);
  const started = Date.now();
  const archive = new AiAnalysisRunArchive("analysis_high_event_test");
  archive.append("user_message", "CHATGPT_VISIBLE", "Analyze the four immutable input files.");
  for (let index = 0; index < 44_815; index += 1) archive.appendProviderEvent({ type: "raw_event", index, delta: "x" });
  for (let index = 0; index < 22_295; index += 1) archive.append("assistant_delta", "CHATGPT_VISIBLE", "x");
  archive.append("assistant_message", "CHATGPT_VISIBLE", "Artifacts published.");
  const flush = archive.flush("performance_test");
  archive.close("performance_test");
  const elapsedMs = Date.now() - started;
  assert.equal(flush.failed, false);
  const providerLines = fs.readFileSync(path.join(archive.directory, "logs", "provider-stream.jsonl"), "utf8").trim().split(/\r?\n/);
  assert.equal(providerLines.length, 44_815);
  const conversation = verifyConversationLog(path.join(archive.directory, "logs", "conversation.jsonl"));
  assert.equal(conversation.valid, true);
  assert.equal(conversation.eventCount, 2);
  assert.ok(elapsedMs < 30_000, `Buffered logging regression: ${elapsedMs}ms`);

  const orphan = new AiAnalysisRunArchive("analysis_orphan_test");
  const orphanRun: any = { runId: "analysis_orphan_test", status: "running", runDirectory: orphan.directory, progress: { status: "running", stage: "waiting_response", errorCode: null, message: "running" }, startedAt: new Date().toISOString() };
  orphan.writeManifest(orphanRun);
  orphan.close("simulated_crash");
  const recovered = loadArchivedRuns().find((run) => run.runId === orphanRun.runId);
  assert.equal(recovered?.status, "recovered_interrupted");
  assert.equal(recovered?.databaseWriteStatus, "Not written - recovered interrupted Run");

  const ipc = fs.readFileSync(path.join(process.cwd(), "electron", "aiAnalysisIpc.ts"), "utf8");
  assert.match(ipc, /PROVIDER_HARD_TIMEOUT_MS/);
  assert.match(ipc, /PROVIDER_PERFORMANCE_WARNING_MS/);
  assert.match(ipc, /ai-analysis:accept-warnings/);
  assert.doesNotMatch(ipc, /assistant_delta", "CHATGPT_VISIBLE"/);
  const service = fs.readFileSync(path.join(process.cwd(), "electron", "chatGptService.ts"), "utf8");
  assert.match(service, /sandbox: "read-only"/);
  assert.match(service, /dynamicTools/);
  const main = fs.readFileSync(path.join(process.cwd(), "electron", "main.ts"), "utf8");
  assert.match(main, /debug-completeness\.json/);
  assert.match(main, /debug-file-manifest\.json/);
  assert.match(main, /flushRunArchive/);

  console.log(JSON.stringify({ status: "passed", recordCount, providerEventCount: providerLines.length, conversationEventCount: conversation.eventCount, bufferedLoggingElapsedMs: elapsedMs }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
