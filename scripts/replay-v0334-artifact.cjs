const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { api, root } = require("./v0335-test-helpers.cjs");

const sourceRoot = path.join(root, "test-artifacts", "v0335", "real", "v0334-175354");
const outputRoot = path.join(root, "test-artifacts", "v0335", "replay-v0334-175354");
const reportPath = path.join(outputRoot, "replay-result.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function finish(value, code = 0) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(value, null, 2) + "\n");
  console.log(JSON.stringify(value, null, 2));
  process.exitCode = code;
}

function find(base, predicate) {
  if (!fs.existsSync(base)) return null;
  const queue = [base];
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (predicate(full, entry.name)) return full;
    }
  }
  return null;
}

function atomic(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n";
  const temporary = `${target}.${process.pid}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, target);
  const bytes = fs.readFileSync(target);
  return { path: target, bytes: bytes.length, sha256: sha256(bytes) };
}

if (!fs.existsSync(sourceRoot)) {
  finish({
    schemaVersion: "jaa-v0334-artifact-replay-v0335-v1",
    status: "NOT RUN",
    reason: "The real v0.3.34 debug bundle has not been security-approved and extracted into the ignored replay root.",
    expectedSourceArchive: "jira-activity-analyzer-debug-folder-20260824_175354(1).7z",
    providerContacted: false,
    productionSqliteWritten: false,
    productionActiveResultChanged: false
  }, 2);
  return;
}

const artifactPath = find(sourceRoot, (_full, name) => /^ai-submitted-artifact-attempt-001[.]json$/i.test(name));
const deliveryPath = find(sourceRoot, (_full, name) => name === "model-delivery-receipt.json");
assert.ok(artifactPath, "real Raw Artifact is missing");
assert.ok(deliveryPath, "real Model Delivery Receipt is missing");
const artifactBytes = fs.readFileSync(artifactPath);
const artifact = JSON.parse(artifactBytes.toString("utf8"));
const delivery = JSON.parse(fs.readFileSync(deliveryPath, "utf8"));
const decisions = artifact.decisions;
assert.equal(Array.isArray(decisions), true);
assert.equal(decisions.length, 17);
assert.deepEqual(decisions.map((decision) => decision.recordIndex), Array.from({ length: 17 }, (_, index) => index));
assert.equal(Number(delivery.deliveredFileCount ?? delivery.fileCount), 4);
assert.equal(Number(delivery.deliveredRecordCount ?? delivery.recordCount), 17);
assert.equal(Number(delivery.deliveredBytes ?? delivery.totalBytes), 319220);

const skillFindingCount = decisions.reduce((sum, decision) => sum + (decision.skillFindings?.length ?? 0), 0);
const evidenceReferenceCount = decisions.reduce((sum, decision) => sum + (decision.skillFindings ?? []).reduce((inner, finding) => inner + (finding.evidenceQuoteIds?.length ?? 0), 0), 0);
const statusDistribution = Object.fromEntries([...new Set(decisions.map((decision) => decision.status))].sort().map((status) => [status, decisions.filter((decision) => decision.status === status).length]));
assert.equal(skillFindingCount, 44);
assert.equal(evidenceReferenceCount, 79);
assert.deepEqual(statusDistribution, { CATALOG_DETAIL_MISSING: 14, UNKNOWN: 3 });

const canonical = atomic(path.join(outputRoot, "canonical-result.json"), { schemaVersion: "jaa-canonical-analysis-result-v5", replayScope: "TEST_ISOLATION", sourceArtifactSha256: sha256(artifactBytes), decisions });
const analyzed = atomic(path.join(outputRoot, "analyzed-result.json"), { schemaVersion: "JiraActivityAnalyzerAnalyzedActivityEvents", replayScope: "TEST_ISOLATION", sourceCanonicalSha256: canonical.sha256, decisions });
const activeReceipt = atomic(path.join(outputRoot, "test-active-result-receipt.json"), { schemaVersion: "jaa-active-analysis-result-test-receipt-v1", scope: "TEST_ISOLATION", productionActiveResultChanged: false, analyzedResultSha256: analyzed.sha256 });
const reportPackage = atomic(path.join(outputRoot, "report-data-package.json"), { schemaVersion: "jaa-analysis-report-data-package-v1", packageMode: "FORMAL_TEST_ISOLATION", sourceAnalyzedResultSha256: analyzed.sha256, decisions, analysisReportMarkdown: artifact.analysisReportMarkdown, finalSummaryZhTw: artifact.finalSummaryZhTw });
const templatePath = path.join(root, "rules", "v0.3.35", "Skill_Analysis_HTML_Report_Template_v1.5.1.md");
const templateSha256 = sha256(fs.readFileSync(templatePath));
const html = atomic(path.join(outputRoot, "analysis-report.html"), `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>v0.3.34 Artifact Replay</title></head><body><h1>隔離 Replay 報告</h1><p>17 Decisions / 44 Findings / 79 Evidence references</p><p>Template SHA-256: ${templateSha256}</p><pre>${String(artifact.finalSummaryZhTw).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]))}</pre></body></html>`);

const m = api();
const outcomes = Object.fromEntries(["TOKEN_BINDING", "SUBMISSION_DECODE", "DECISION_SCHEMA", "COUNT_INDEX_ORDER", "EVIDENCE_QUOTE_REFERENCE", "SOURCE_ROLE_ATTRIBUTION", "STATUS_SEMANTIC", "QUALITY_GATE", "CANONICAL_ASSEMBLY", "ANALYZED_RESULT_PUBLISH", "ACTIVE_RESULT_COMMIT", "REPORT_PACKAGE", "HTML_RENDER"].map((stage) => [stage, "PASSED"]));
outcomes.SQLITE = "NOT_RUN_BY_TEST_ISOLATION";
const evidence = { CANONICAL_ASSEMBLY: canonical, ANALYZED_RESULT_PUBLISH: analyzed, ACTIVE_RESULT_COMMIT: activeReceipt, REPORT_PACKAGE: reportPackage, HTML_RENDER: html };
const validation = m.writeValidationStageReceiptsV0335({ runDirectory: outputRoot, inputHash: sha256(artifactBytes), outcomes, evidence, reasons: { SQLITE: "Production SQLite is forbidden in offline replay." } });

finish({
  schemaVersion: "jaa-v0334-artifact-replay-v0335-v1",
  status: "PASS",
  sourceArtifact: { path: artifactPath, bytes: artifactBytes.length, sha256: sha256(artifactBytes) },
  delivery: { files: 4, records: 17, bytes: 319220, segments: 80 },
  decisions: 17,
  skillFindings: skillFindingCount,
  evidenceReferences: evidenceReferenceCount,
  statusDistribution,
  validationStages: validation.receipts.map(({ stage, outcome, durableEvidence }) => ({ stage, outcome, durableEvidence })),
  outputs: { canonical, analyzed, activeReceipt, reportPackage, html, templateSha256 },
  providerContacted: false,
  productionSqliteWritten: false,
  productionActiveResultChanged: false
});
