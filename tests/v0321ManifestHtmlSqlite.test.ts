import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AI_DECISION_STATUSES,
  buildDecisionFixture,
  createDecisionArraySchema,
  validateDecisionArray,
  type AiDecision
} from "../electron/aiAnalysisDecisionContractV0321.js";
import { DEFAULT_ANALYSIS_INSTRUCTION } from "../electron/aiAnalysisInstructionV0321.js";
import { HTML_RENDERER_VERSION, freezeBoundHtmlTemplate, renderCanonicalHtml } from "../electron/aiAnalysisHtmlRendererV0321.js";
import { loadV0321RulesSnapshot, parseHtmlReportTemplate, V0321_RULE_BINDING, V0321_RULE_HASHES } from "../electron/aiAnalysisRulesV0321.js";
import { persistCompletedRunV0321 } from "../electron/aiAnalysisSqliteV0321.js";

const root = path.resolve(__dirname, "../..");
const rulesDirectory = path.join(root, "rules", "v0.3.21");
const expected = (count: number) => ({ runId: "analysis_contract", sourceSha256: "a".repeat(64), rulesSnapshotId: "rules", recordCount: count, catalogSkillIds: ["SKILL_001"] });
const decision = (status: AiDecision["status"]): AiDecision => ({
  recordIndex: 0,
  status,
  skillIds: status === "CLASSIFIED" || status === "CATALOG_DETAIL_MISSING" || status === "NEEDS_REVIEW" ? ["SKILL_001"] : [],
  confidence: 0.8,
  positiveEvidence: status === "CLASSIFIED" || status === "CATALOG_DETAIL_MISSING" || status === "NEEDS_REVIEW" ? ["traceable evidence"] : [],
  negativeChecks: status === "EXCLUDED" ? ["clearly non-skill evidence"] : [],
  unknownReasons: status === "UNKNOWN" ? ["insufficient technical information"] : [],
  rationale: `Synthetic ${status} rationale.`
});

for (const status of AI_DECISION_STATUSES) {
  const validation = validateDecisionArray([decision(status)], expected(1));
  assert.equal(validation.valid, true, `${status} must satisfy the built-in matrix`);
}
for (const status of AI_DECISION_STATUSES.filter((value) => value !== "UNKNOWN")) {
  const invalid = { ...decision(status), unknownReasons: ["legacy workaround"] };
  assert.ok(validateDecisionArray([invalid], expected(1)).findings.some((finding) => finding.jsonPointer.endsWith("/unknownReasons")), `${status} unknownReasons must fail`);
}
assert.equal(validateDecisionArray([{ ...decision("UNKNOWN"), unknownReasons: [] }], expected(1)).valid, false);
assert.equal(validateDecisionArray([{ ...decision("CLASSIFIED"), skillIds: [], positiveEvidence: [] }], expected(1)).valid, false);
assert.equal(createDecisionArraySchema(1).items.additionalProperties, false);
assert.ok(createDecisionArraySchema(1).items.allOf.length >= 6);
assert.match(DEFAULT_ANALYSIS_INSTRUCTION, /clearly non-skill evidence.*EXCLUDED/s);
assert.match(DEFAULT_ANALYSIS_INSTRUCTION, /unknownReasons.*UNKNOWN/s);

const legacyRegression = buildDecisionFixture(28).map((item, index) => ({
  ...item,
  status: index < 24 ? "EXCLUDED" as const : "NEEDS_REVIEW" as const,
  unknownReasons: ["v0.3.20 invalid reason placement"],
  skillIds: [],
  positiveEvidence: []
}));
const regressionFindings = validateDecisionArray(legacyRegression, expected(28)).findings.filter((finding) => finding.jsonPointer.endsWith("/unknownReasons"));
assert.equal(regressionFindings.length, 28);
assert.equal(new Set(regressionFindings.map((finding) => finding.recordIndex)).size, 28);

const rules = loadV0321RulesSnapshot(rulesDirectory, [root]);
assert.equal(rules.valid, true);
assert.equal(rules.files.length, 3, "Provider-visible Rule Set remains three MD files");
assert.equal(rules.htmlReportTemplate?.providerVisible, false);
assert.equal(rules.htmlReportTemplate?.sha256, V0321_RULE_HASHES.template);
assert.equal(rules.htmlReportTemplate?.templateId, V0321_RULE_BINDING.templateId);
assert.equal(rules.htmlReportTemplate?.minimumRendererVersion, HTML_RENDERER_VERSION);

const templateText = fs.readFileSync(path.join(rulesDirectory, V0321_RULE_BINDING.templateFileName), "utf8");
assert.equal(parseHtmlReportTemplate(templateText).contract.templateVersion, "1.0.0");
assert.throws(() => parseHtmlReportTemplate(templateText.replace("<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->", "")), /markers/i);
assert.throws(() => parseHtmlReportTemplate(templateText.replace("<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->", "<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON --><!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->")), /markers/i);
assert.throws(() => parseHtmlReportTemplate(templateText.replace('"templateVersion": "1.0.0"', '"templateVersion": INVALID')), /invalid/i);

function copyRules(target: string) { fs.mkdirSync(target, { recursive: true }); for (const name of fs.readdirSync(rulesDirectory)) fs.copyFileSync(path.join(rulesDirectory, name), path.join(target, name)); }
{ const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0321-rules-missing-")); try { copyRules(missingRoot); fs.unlinkSync(path.join(missingRoot, V0321_RULE_BINDING.templateFileName)); assert.throws(() => loadV0321RulesSnapshot(missingRoot, [missingRoot]), (error: any) => error?.code === "AI_HTML_TEMPLATE_MISSING"); } finally { fs.rmSync(missingRoot, { recursive: true, force: true }); } }
{ const mismatchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0321-rules-hash-")); try { copyRules(mismatchRoot); fs.appendFileSync(path.join(mismatchRoot, V0321_RULE_BINDING.templateFileName), "\nSynthetic mutation\n"); assert.throws(() => loadV0321RulesSnapshot(mismatchRoot, [mismatchRoot]), (error: any) => error?.code === "AI_HTML_TEMPLATE_HASH_MISMATCH"); } finally { fs.rmSync(mismatchRoot, { recursive: true, force: true }); } }

function result(runId: string, index: number, skillId = "SKILL_001") {
  return {
    resultId: `result_${crypto.createHash("sha256").update(`${runId}:source-${index}:hash-${index}:rules`).digest("hex").slice(0, 24)}`,
    sourceDiffId: `source-${index}`, sourceContentHash: `hash-${index}`, evidenceRefs: [`evidence-${index}`], recordIndex: index,
    sourceRecordStableId: `source-${index}`, activityEventId: `event-${index}`, evidenceId: `evidence-${index}`,
    sourceEvidenceSnapshot: { issueKey: `SYN-${index + 1}`, actor: index === 0 ? "<img src=x onerror=alert(1)> </script>" : `Synthetic ${index}`, eventTimestamp: "2026-08-19T00:00:00.000Z", fieldName: "description", sourceProvenance: "synthetic", addedText: [index === 0 ? "<script>alert(1)</script>" : `added ${index}`], removedText: [] },
    classificationStatus: "MATCHED", reviewStatus: "PENDING_REVIEW", reviewAttention: "STANDARD_REVIEW", dispositionReason: "Synthetic traceable evidence.", exclusionReason: null, unknownReason: null, matchedRuleIds: [], negativeChecks: [],
    candidates: [{ skillId, skillName: "Synthetic Skill", group: "Synthetic", score: 90, confidence: 0.9, positiveSignals: ["evidence"], positiveEvidenceRefs: [`evidence-${index}`], negativeChecks: [], negativeEvidenceRefs: [], rejectedNearSkills: [], evidenceQuote: "evidence", matchedRuleIds: [], reason: "Synthetic reason", status: "PENDING_REVIEW", candidateStatus: "MATCHED", statusReason: "Synthetic reason", catalogDetailAvailable: true }],
    status: "PENDING_REVIEW", analyzerVersion: "test", requestTraceId: null, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, availability: "not_applicable" }, rawResultAvailable: true, reviewNote: "", reviewedAt: null
  };
}

function runFixture(runId: string, count: number, runRules: any = rules) {
  const results = Array.from({ length: count }, (_, index) => result(runId, index));
  return {
    runId, revision: 1, status: "completed", analyzerMode: "CHATGPT", sourceDatasetId: "dataset-synthetic", sourceFileName: "pending-synthetic.json", sourceFilePath: "synthetic", selectedDiffIds: results.map((item) => item.sourceDiffId), rules: runRules, provider: "chatgpt", model: "synthetic", startedAt: "2026-08-19T00:00:00.000Z", completedAt: "2026-08-19T00:01:00.000Z", appVersion: "0.3.21", buildTime: "2026/08/19 08:00:00", packagedSourceCommit: "synthetic", results, canonicalRecordCount: count, receivedDecisionCount: count, sqliteCommittedRecordCount: 0, htmlRenderStatus: "not_started", instructionMode: "STANDARD_FORMAL",
    lifecycle: { providerTurnStatus: "completed", modelInputStatus: "delivered", analysisStatus: "completed", artifactStatus: "published", validationStatus: "completed", canonicalStatus: "created", htmlRenderStatus: "not_started", sqliteStatus: "blocked" }
  } as any;
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0321-"));
try {
  const runDirectory = path.join(temp, "render-run");
  fs.mkdirSync(runDirectory, { recursive: true });
  const frozen = freezeBoundHtmlTemplate(runDirectory, rules);
  assert.throws(() => freezeBoundHtmlTemplate(path.join(temp, "incompatible"), { ...rules, htmlReportTemplate: { ...rules.htmlReportTemplate!, minimumRendererVersion: "JAA-LOCAL-HTML-RENDERER-99.0.0" } }), (error: any) => error?.code === "AI_HTML_RENDERER_INCOMPATIBLE");
  for (const count of [0, 17, 117]) {
    const canonicalPath = path.join(runDirectory, `canonical-${count}.json`);
    fs.writeFileSync(canonicalPath, JSON.stringify({ schemaName: "jira-activity-analyzer.analyzed-analysis", schemaVersion: "test", run: runFixture(`analysis_render_${count}`, count) }, null, 2));
    const first = renderCanonicalHtml({ canonicalResultPath: canonicalPath, frozenTemplatePath: frozen.filePath, outputHtmlPath: path.join(runDirectory, `result-${count}.html`), renderContext: { renderedAt: "2026-08-19T00:01:00.000Z", appVersion: "0.3.21", buildTime: "fixed", packagedSourceCommit: "fixed" } });
    const second = renderCanonicalHtml({ canonicalResultPath: canonicalPath, frozenTemplatePath: frozen.filePath, outputHtmlPath: path.join(runDirectory, `result-${count}-again.html`), renderContext: { renderedAt: "2026-08-19T00:01:00.000Z", appVersion: "0.3.21", buildTime: "fixed", packagedSourceCommit: "fixed" } });
    assert.equal(first.receipt.outputHtmlSha256, second.receipt.outputHtmlSha256);
    assert.equal((first.html.match(/class="record"/g) ?? []).length, count);
    assert.doesNotMatch(first.html, /https?:\/\//i);
    assert.doesNotMatch(first.html, /fetch\(|XMLHttpRequest|WebSocket/i);
    assert.match(first.html, /Export filtered CSV/);
    assert.match(first.html, /Copy authoritative summary/);
    assert.match(first.html, /window\.print/);
    if (count) {
      assert.doesNotMatch(first.html, /<img src=x onerror=alert\(1\)>/);
      assert.doesNotMatch(first.html, /<script>alert\(1\)<\/script>/);
      assert.match(first.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.match(first.html, /\\u003c\/script\\u003e/);
    }
  }

  const databasePath = path.join(temp, "ai-analysis.sqlite3");
  const dataset = { datasetId: "dataset-synthetic", sourceFileSha256: "b".repeat(64), sourceDatabaseId: "source-db", jiraServerFingerprint: "jira-synthetic" } as any;
  const run17 = runFixture("analysis_17", 17); run17.analyzedFilePath = path.join(temp, "canonical-17.json");
  const firstCommit = persistCompletedRunV0321(databasePath, dataset, run17);
  assert.equal(firstCommit.insertedResultCount, 17);
  const retryCommit = persistCompletedRunV0321(databasePath, dataset, run17, { attemptNumber: 2 });
  assert.equal(retryCommit.status, "already_committed");
  assert.equal(retryCommit.alreadyCommittedResultCount, 17);

  const run117 = runFixture("analysis_117", 117); run117.analyzedFilePath = path.join(temp, "canonical-117.json");
  assert.equal(persistCompletedRunV0321(databasePath, dataset, run117).committedRecordCount, 117);
  const another117 = runFixture("analysis_117_other", 117); another117.analyzedFilePath = path.join(temp, "canonical-117-other.json");
  assert.equal(persistCompletedRunV0321(databasePath, dataset, another117).committedRecordCount, 117);

  run17.results[0].candidates = [result("analysis_17", 0, "SKILL_002").candidates[0]];
  assert.equal(persistCompletedRunV0321(databasePath, dataset, run17, { attemptNumber: 3 }).updatedResultCount, 1);
  const db = new DatabaseSync(databasePath);
  try {
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM raw_results").get() as any).count, 251);
    assert.deepEqual((db.prepare("SELECT skill_id FROM classification_candidates WHERE result_id=?").all(run17.results[0].resultId) as any[]).map((row) => row.skill_id), ["SKILL_002"]);
  } finally { db.close(); }

  const rollbackRun = runFixture("analysis_rollback", 2); rollbackRun.analyzedFilePath = path.join(temp, "canonical-rollback.json");
  assert.throws(() => persistCompletedRunV0321(databasePath, dataset, rollbackRun, { failCandidateInsertAt: 2 }), /SYNTHETIC_CHILD_INSERT_FAILURE/);
  const verify = new DatabaseSync(databasePath);
  try { assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM analysis_runs WHERE run_id=?").get(rollbackRun.runId) as any).count, 0); }
  finally { verify.close(); }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("v0.3.21 manifest/contract/HTML/SQLite focused tests passed");
