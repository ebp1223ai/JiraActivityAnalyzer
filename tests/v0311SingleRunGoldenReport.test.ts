import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadRulesSnapshot } from "../electron/aiAnalysisCore.js";
import {
  adaptLegacyAnalyzedRun,
  buildCompactPayload,
  buildDistributionDiagnostics,
  buildSingleRunPrompt,
  goldenHtmlForRun,
  parseSingleRunResponse,
  preflightSingleRunCapacity,
  stageVisibleProviderResponse,
  validateGoldenHtml
} from "../electron/aiAnalysisSingleRunV0311.js";
import { emptyTokenUsage, type AiAnalysisRun, type AiPendingDataset } from "../shared/aiAnalysisContract.js";

function rulesFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0311-rules-"));
  fs.writeFileSync(path.join(root, "Rule_Set_Manifest.md"), `# Manifest
| Binding | Value | Status |
|---|---|---|
| \`manifest_schema_version\` | \`1.0\` | approved |
| \`rule_set_id\` | \`SYNTHETIC-RULESET\` | approved |
| \`common_rules_version\` | \`1.1.0\` | approved |
| \`common_rules_file\` | \`Common_Rules.md\` | approved |
| \`skill_catalog_version\` | \`0.3.0\` | approved |
| \`skill_catalog_file\` | \`Skill_Catalog.md\` | approved |
`, "utf8");
  fs.writeFileSync(path.join(root, "Skill_Catalog.md"), `# Catalog
| Skill ID | Skill Name | Group | Detail Description |
|---|---|---|---|
| TEST_001 | First Placeholder | Test | Must never be a fallback. |
| TEST_002 | Exact Evidence Skill | Test | Selected only by exact evidence. |
| OTHER_001 | Rejected Near Skill | Other | A nearby but rejected skill. |
`, "utf8");
  fs.writeFileSync(path.join(root, "Common_Rules.md"), "# Common Rules\n- RULE-ATTRIBUTION: Evidence must be attributable.\n- RULE-NEGATIVE: Automation and historical attribution must be excluded.\n", "utf8");
  return root;
}

function dataset(count = 117): AiPendingDataset {
  return {
    datasetId: "dataset_synthetic", fileName: "pending-analysis_synthetic.json", sourceFilePath: "C:\\synthetic\\pending-analysis_synthetic.json", sourceFileSizeBytes: 1000,
    importedAt: "2026-08-12T00:00:00.000Z", schemaVersion: "0.3.3-draft.1", sourceFileSha256: "a".repeat(64), sourceDatabaseId: "db_synthetic", jiraServerFingerprint: "jira_synthetic", jiraServerHost: "jira.example.invalid", sourceSchemaVersion: 3,
    sourceView: "USER_ALL_ACTIVITY_EVENTS", createdAt: "2026-08-12T00:00:00.000Z", eventCount: count, eligibleCount: count, issues: count, projects: 1, integrityStatus: "verified", errors: [],
    diffs: Array.from({ length: count }, (_, index) => ({ sourceDiffId: `stable-${index}`, sourceContentHash: index.toString(16).padStart(64, "0"), evidenceId: `evidence-${index}`, activityEventId: `event-${index}`, issueKey: `SYN-${index + 1}`, projectKey: "SYN", actorId: `actor-${index % 3}`, actorDisplayName: `Synthetic User ${index % 3}`, fieldId: "description", fieldName: "Description", eventTime: "2026-08-12T00:00:00.000Z", sourceProvenance: "synthetic-fixture", diffStatus: "changed", substantive: true, addedLineCount: 1, removedLineCount: 1, diffHunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ type: "delete", text: `old <unsafe> ${index}` }, { type: "insert", text: `implemented exact evidence ${index}` }] }] }))
  };
}

function providerResponse(compact: ReturnType<typeof buildCompactPayload>["payload"]) {
  return JSON.stringify({ schemaVersion: "ai-analysis-output-v2", records: compact.records.map((record) => {
    const classificationStatus = record.recordIndex % 11 === 0 ? "EXCLUDED" : record.recordIndex % 7 === 0 ? "UNKNOWN" : "MATCHED";
    const check = { ruleId: "RULE-ATTRIBUTION", passed: classificationStatus !== "EXCLUDED", detail: classificationStatus === "EXCLUDED" ? "Historical or automation evidence triggered exclusion." : "Evidence is attributable to the actor.", evidenceRefs: [record.evidenceId] };
    return { recordIndex: record.recordIndex, sourceRecordStableId: record.sourceRecordStableId, activityEventId: record.activityEventId, evidenceId: record.evidenceId, sourceContentHash: record.sourceContentHash, classificationStatus, reviewStatus: "PENDING_REVIEW", reviewAttention: classificationStatus === "UNKNOWN" ? "NEEDS_REVIEW" : "STANDARD_REVIEW", dispositionReason: `${classificationStatus} by auditable synthetic evidence.`, exclusionReason: classificationStatus === "EXCLUDED" ? "RULE-NEGATIVE triggered." : null, unknownReason: classificationStatus === "UNKNOWN" ? "Evidence is insufficient." : null, matchedRuleIds: ["RULE-ATTRIBUTION"], negativeChecks: [check], analyses: classificationStatus === "MATCHED" ? [{ skillId: "TEST_002", score: 88, confidence: "High", confidenceReason: "Exact positive evidence and attribution.", scoreComponents: { evidence: 60, attribution: 28 }, positiveSignals: ["exact evidence"], positiveEvidenceRefs: [record.evidenceId], negativeChecks: [check], negativeEvidenceRefs: [record.evidenceId], rejectedNearSkills: [{ skillId: "OTHER_001", reason: "Different evidence scope." }], evidenceQuote: record.addedText[0] }] : [] };
  }) });
}

test("117 records become one deterministic compact payload and rules occur once", () => {
  const root = rulesFixture();
  const rules = loadRulesSnapshot(root, [root]);
  const data = dataset();
  const compact = buildCompactPayload(data, data.diffs.map((item) => item.sourceDiffId), rules);
  assert.equal(compact.payload.eventCount, 117);
  assert.equal(compact.payload.records.length, 117);
  assert.ok(compact.sizeBytes < 1_000_000);
  assert.doesNotMatch(compact.json, /sourceFilePath|sourceDatabaseId|jiraServerFingerprint|C:\\\\synthetic/);
  const request = buildSingleRunPrompt(compact, rules);
  for (const marker of ["[MANIFEST_BEGIN]", "[COMMON_RULES_BEGIN]", "[SKILL_CATALOG_BEGIN]", "[COMPACT_ACTIVITY_EVENTS_BEGIN]"]) assert.equal(request.prompt.split(marker).length - 1, 1);
  assert.equal(request.prompt.split(compact.json).length - 1, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("compact payload rejects duplicate source identity before provider work", () => {
  const root = rulesFixture();
  const rules = loadRulesSnapshot(root, [root]);
  const data = dataset(2);
  data.diffs[1].activityEventId = data.diffs[0].activityEventId;
  assert.throws(
    () => buildCompactPayload(data, data.diffs.map((item) => item.sourceDiffId), rules),
    /activityEventId must be present and unique/
  );
  fs.rmSync(root, { recursive: true, force: true });
});
test("capacity preflight fails closed without verified capacity or for oversized input", () => {
  const base = { promptBytes: 30_000, compactPayloadBytes: 20_000, compactPayloadSha256: "b".repeat(64), eventCount: 117 };
  assert.equal(preflightSingleRunCapacity({ ...base, modelCapacityTokens: null }).errorCode, "ANALYSIS_INPUT_CONTEXT_TOO_LARGE");
  assert.equal(preflightSingleRunCapacity({ ...base, promptBytes: 900_000, modelCapacityTokens: 128_000 }).ok, false);
  assert.equal(preflightSingleRunCapacity({ ...base, modelCapacityTokens: 200_000 }).ok, true);
});

test("strict parser conserves 117 identities and performs exact non-first Skill lookup", () => {
  const root = rulesFixture(); const rules = loadRulesSnapshot(root, [root]); const data = dataset();
  const compact = buildCompactPayload(data, data.diffs.map((item) => item.sourceDiffId), rules);
  const response = providerResponse(compact.payload);
  const results = parseSingleRunResponse(response, compact.payload, rules, "synthetic-model", "turn-1", emptyTokenUsage("actual"));
  assert.equal(results.length, 117);
  assert.ok(results.some((item) => item.classificationStatus === "EXCLUDED"));
  assert.ok(results.some((item) => item.classificationStatus === "UNKNOWN"));
  assert.ok(results.flatMap((item) => item.candidates).every((candidate) => candidate.skillId === "TEST_002"));
  const distribution = buildDistributionDiagnostics(results, rules);
  assert.equal(distribution.groupFirstCandidateCount, 0);
  assert.equal(distribution.suffix001CandidateCount, 0);
  assert.equal(distribution.bySkill[0].skillId, "TEST_002");
  const invalid = response.replace('"skillId":"TEST_002"', '"skillId":"MISSING_001"');
  assert.throws(() => parseSingleRunResponse(invalid, compact.payload, rules, "synthetic-model", "turn-1", emptyTokenUsage("actual")), /not an exact Catalog ID/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("visible provider response is gzip staged with verified round trip", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0311-provider-"));
  const response = JSON.stringify({ records: [{ text: "繁體中文 evidence" }] });
  const artifact = stageVisibleProviderResponse(root, response);
  assert.ok(fs.existsSync(artifact.filePath));
  assert.match(artifact.rawSha256, /^[a-f0-9]{64}$/);
  assert.match(artifact.gzipSha256, /^[a-f0-9]{64}$/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("Golden HTML is offline, escaped, interactive, printable, and conserves 117 records", () => {
  const root = rulesFixture(); const rules = loadRulesSnapshot(root, [root]); const data = dataset();
  const compact = buildCompactPayload(data, data.diffs.map((item) => item.sourceDiffId), rules);
  const results = parseSingleRunResponse(providerResponse(compact.payload), compact.payload, rules, "synthetic-model", "turn-1", emptyTokenUsage("actual"));
  const run = { runId: "analysis_synthetic", revision: 1, status: "completed", analyzerMode: "CHATGPT", sourceDatasetId: data.datasetId, sourceFileName: data.fileName, sourceFilePath: data.sourceFilePath, sourceFileSha256: data.sourceFileSha256, sourceDatabaseId: data.sourceDatabaseId, jiraServerFingerprint: data.jiraServerFingerprint, selectedDiffIds: data.diffs.map((item) => item.sourceDiffId), provider: "chatgpt_codex", model: "synthetic-model", apiContract: "responses", configFingerprint: null, rules, startedAt: data.createdAt, completedAt: data.createdAt, progress: { runId: "analysis_synthetic", status: "completed", stage: "completed", totalBatches: 1, completedBatches: 1, failedBatches: 0, currentBatch: 1, totalDiffs: 117, completedDiffs: 117, requestCount: 1, retryCount: 0, threadCount: 1, turnCount: 1, mainPayloadCount: 1, rulesTransmissionCount: 1, payloadRecordCount: 117, resultRecordCount: 117, elapsedMs: 1000, usage: emptyTokenUsage("actual"), message: "Completed", errorCode: null }, results, analyzedFileName: "analysis.json", analyzedFilePath: null, databasePath: null } as AiAnalysisRun;
  run.distributionDiagnostics = buildDistributionDiagnostics(results, rules);
  const html = goldenHtmlForRun(run, data);
  assert.deepEqual(validateGoldenHtml(html, 117), { valid: true, eventCount: 117, externalAssets: false, semanticSections: 12 });
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /Skill Ranking/);
  assert.match(html, /Distribution:/);
  for (const id of ["actor", "issue", "group", "status", "attention"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-groups=/);
  assert.match(html, /Negative Checks/);
  assert.match(html, /Rejected OTHER_001/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("legacy v0.3.10 run is adapted with explicit warning and unavailable evidence", () => {
  const data = dataset(1); const root = rulesFixture(); const rules = loadRulesSnapshot(root, [root]);
  const legacy = { runId: "legacy", revision: 1, status: "completed", analyzerMode: "CHATGPT", sourceDatasetId: data.datasetId, sourceFileName: data.fileName, sourceFileSha256: data.sourceFileSha256, sourceDatabaseId: data.sourceDatabaseId, jiraServerFingerprint: data.jiraServerFingerprint, selectedDiffIds: ["stable-0"], provider: "chatgpt_codex", model: "legacy", apiContract: "responses", configFingerprint: null, rules, startedAt: data.createdAt, completedAt: data.createdAt, progress: { runId: "legacy", status: "completed", totalBatches: 1, completedBatches: 1, failedBatches: 0, currentBatch: 1, totalDiffs: 1, completedDiffs: 1, requestCount: 1, retryCount: 0, elapsedMs: 1, usage: emptyTokenUsage(), message: "done", errorCode: null }, results: [{ resultId: "result", sourceDiffId: "stable-0", sourceContentHash: data.diffs[0].sourceContentHash, evidenceRefs: ["evidence-0"], candidates: [], status: "NEEDS_REVIEW", analyzerVersion: "legacy", requestTraceId: null, usage: emptyTokenUsage(), rawResultAvailable: false, reviewNote: "", reviewedAt: null }], analyzedFileName: "legacy.json", analyzedFilePath: null, databasePath: null } as AiAnalysisRun;
  const adapted = adaptLegacyAnalyzedRun(legacy, "0.3.9-v1");
  assert.equal(adapted.legacySchemaVersion, "0.3.9-v1");
  assert.match(adapted.results[0].legacyCompatibilityWarning ?? "", /legacy schema|Imported from/);
  assert.equal(adapted.results[0].classificationStatus, "UNKNOWN");
  fs.rmSync(root, { recursive: true, force: true });
});