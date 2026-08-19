import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AI_ARTIFACT_SUBMISSION_VERSION,
  AI_DECISION_CONTRACT_VERSION,
  buildDecisionFixture,
  createArtifactSubmissionSchema,
  getDecisionContractDescriptor,
  primaryDecisionError,
  stableDecisionJson,
  validateDecisionArray
} from "../electron/aiAnalysisDecisionContractV0321.js";
import { compareAnalysisReportCounts } from "../electron/aiAnalysisArtifactsV0316.js";
import { composeEffectiveInstruction, DEFAULT_ANALYSIS_INSTRUCTION } from "../electron/aiAnalysisInstructionV0320.js";
import { loadV0320RulesSnapshot } from "../electron/aiAnalysisCore.js";
import { AnalysisBridgeV0319, MODEL_DELIVERY_PROTOCOL } from "../electron/analysisBridgeRuntimeV0319.js";

const sha256 = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const contextFor = (runId: string, callId = "call-test") => ({ runId, sessionNonce: "a".repeat(64), threadId: "thread-test", turnId: "turn-test", callId });

function fixture(recordCount = 17) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0320-"));
  fs.mkdirSync(path.join(root, "input-workspace"));
  fs.mkdirSync(path.join(root, "ai-output"));
  fs.mkdirSync(path.join(root, "progress"));
  const inputs = [
    ["PENDING_ANALYSIS_JSON", "pending-analysis.json", JSON.stringify({ records: Array.from({ length: recordCount }, (_, recordIndex) => ({ recordIndex, text: `synthetic-${recordIndex}` })) })],
    ["COMMON_RULES", "common-rules.md", "# Synthetic Common Rules\n"],
    ["SKILL_CATALOG", "skill-catalog.md", "# Synthetic Skill Catalog\n\nSKILL_001\n"],
    ["RULE_SET_MANIFEST_OR_SCORING_RULES", "rule-set-manifest.md", "# Synthetic Manifest\n"]
  ] as const;
  const documents = inputs.map(([role, name, content]) => {
    const bytes = Buffer.from(content, "utf8");
    fs.writeFileSync(path.join(root, "input-workspace", name), bytes);
    return { role, snapshotRelativePath: `input-workspace/${name}`, originalFileName: name, mimeType: name.endsWith("json") ? "application/json" : "text/markdown", encoding: "utf-8", snapshotByteLength: bytes.length, snapshotSha256: sha256(bytes), complete: true, truncated: false, byteIdentical: true };
  });
  const runId = `analysis_${crypto.randomUUID()}`;
  const bridge = new AnalysisBridgeV0319({ runId, sessionNonce: "a".repeat(64), runDirectory: root, requestPackage: { runId, pendingSourceSha256: documents[0].snapshotSha256, inputRecordCount: recordCount, documents }, rulesSnapshotId: "rules-synthetic", catalogSkillIds: ["SKILL_001"], instructionMode: "STANDARD_FORMAL" });
  return { root, runId, bridge, context: contextFor(runId), sourceSha256: documents[0].snapshotSha256 };
}

function prepare(value: ReturnType<typeof fixture>) {
  const manifest = value.bridge.handle("jaa_get_input_manifest", { runId: value.runId }, value.context) as any;
  assert.equal(manifest.transportProtocol, MODEL_DELIVERY_PROTOCOL);
  for (const file of manifest.files) for (const item of file.segments) {
    const segment = value.bridge.handle("jaa_read_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: item.segmentIndex, cursor: item.startByte }, value.context) as any;
    value.bridge.handle("jaa_ack_input_segment", { runId: value.runId, fileId: file.fileId, segmentIndex: item.segmentIndex, deliveredBytes: segment.deliveredBytes, segmentSha256: segment.segmentSha256, receiptToken: segment.receiptToken }, value.context);
  }
  const receipt = value.bridge.handle("jaa_finalize_input_delivery", { runId: value.runId }, value.context) as any;
  assert.equal(receipt.modelInputDelivered, true);
  for (const [stage, completed] of [["INPUT_READY", 0], ["ANALYSIS_STARTED", 0], ["ANALYSIS_COMPLETED", 17], ["ARTIFACT_SUBMISSION_STARTED", 17]] as const) {
    value.bridge.handle("jaa_report_analysis_progress", { runId: value.runId, stage, expectedCount: 17, completedCount: completed, decisionPreparedCount: completed, statusDistribution: stage === "ANALYSIS_COMPLETED" ? { UNKNOWN: 17 } : null, message: `Synthetic ${stage}` }, value.context);
  }
}

const descriptor = getDecisionContractDescriptor(17);
assert.equal(descriptor.schemaVersion, AI_DECISION_CONTRACT_VERSION);
assert.equal(sha256(descriptor.canonicalJson), descriptor.sha256);
assert.deepEqual(createArtifactSubmissionSchema(17).properties.decisionsDocument, descriptor.schema);

{
  const value = fixture();
  try {
    prepare(value);
    const tool = value.bridge.toolSpecs().find((item: any) => item.name === "jaa_publish_analysis_artifacts") as any;
    assert.equal(stableDecisionJson(tool.inputSchema.properties.decisionsDocument), stableDecisionJson(descriptor.schema));
    const decisions = buildDecisionFixture(17);
    const receipt = value.bridge.handle("jaa_publish_analysis_artifacts", { schemaVersion: AI_ARTIFACT_SUBMISSION_VERSION, runId: value.runId, sourceSha256: value.sourceSha256, rulesSnapshotId: "rules-synthetic", expectedRecordCount: 17, decisionContractVersion: descriptor.schemaVersion, decisionContractSha256: descriptor.sha256, decisionsDocument: decisions, analysisReportMarkdown: "# Synthetic report\nUNKNOWN=17", finalSummaryTraditionalChinese: "合成測試完成。" }, { ...value.context, callId: "publish-accepted" }) as any;
    assert.equal(receipt.status, "published");
    assert.equal(receipt.decisionCount, 17);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(value.root, "ai-output", "ai-analysis-decisions.json"), "utf8")), decisions);
    assert.ok(fs.existsSync(path.join(value.root, "progress", "artifact-submission-attempts", "artifact-submission-attempt-001.json")));
    const result = JSON.parse(fs.readFileSync(path.join(value.root, "progress", "artifact-submission-attempts", "artifact-submission-result-001.json"), "utf8"));
    assert.equal(result.accepted, true);
    assert.equal(value.bridge.snapshot().lifecycle.artifactStatus, "published");
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
}

{
  const value = fixture();
  try {
    prepare(value);
    assert.throws(() => value.bridge.handle("jaa_publish_analysis_artifacts", { schemaVersion: AI_ARTIFACT_SUBMISSION_VERSION, runId: value.runId, sourceSha256: value.sourceSha256, rulesSnapshotId: "rules-synthetic", expectedRecordCount: 17, decisionContractVersion: descriptor.schemaVersion, decisionContractSha256: descriptor.sha256, decisionsDocument: buildDecisionFixture(16), analysisReportMarkdown: "# Rejected", finalSummaryTraditionalChinese: "應拒絕。" }, { ...value.context, callId: "publish-rejected" }), /AI_DECISION_COUNT_MISMATCH/);
    value.bridge.setProviderTurnStatus("completed");
    value.bridge.fail("ARTIFACT_SUBMISSION_VALIDATION", "AI_ARTIFACT_SUBMISSION_MISSING");
    const lifecycle = value.bridge.snapshot().lifecycle;
    assert.equal(lifecycle.providerTurnStatus, "completed");
    assert.equal(lifecycle.analysisStatus, "completed");
    assert.equal(lifecycle.artifactStatus, "submission_rejected");
    assert.equal(lifecycle.firstFailedStage, "ARTIFACT_SUBMISSION_VALIDATION");
    assert.equal(lifecycle.rootErrorCode, "AI_DECISION_COUNT_MISMATCH");
    assert.deepEqual(lifecycle.derivedStatusCodes, ["AI_ARTIFACT_SUBMISSION_MISSING"]);
    const attempt = JSON.parse(fs.readFileSync(path.join(value.root, "progress", "artifact-submission-attempts", "artifact-submission-attempt-001.json"), "utf8"));
    const result = JSON.parse(fs.readFileSync(path.join(value.root, "progress", "artifact-submission-attempts", "artifact-submission-result-001.json"), "utf8"));
    assert.equal(attempt.decisionsDocument.runtimeType, "array");
    assert.equal(attempt.decisionsDocument.observedCount, 16);
    assert.equal(result.errorCode, "AI_DECISION_COUNT_MISMATCH");
    assert.equal(result.finding.jsonPointer, "/decisionsDocument");
  } finally { fs.rmSync(value.root, { recursive: true, force: true }); }
}

const expected = { recordCount: 17, catalogSkillIds: ["SKILL_001"] };
assert.equal(primaryDecisionError(validateDecisionArray({ decisions: buildDecisionFixture(17) }, expected))?.code, "AI_DECISION_ROOT_TYPE_MISMATCH");
assert.equal(primaryDecisionError(validateDecisionArray(buildDecisionFixture(16), expected))?.code, "AI_DECISION_COUNT_MISMATCH");
{
  const decisions = buildDecisionFixture(17); decisions[16].recordIndex = 15;
  assert.equal(primaryDecisionError(validateDecisionArray(decisions, expected))?.code, "AI_DECISION_INDEX_SET_MISMATCH");
}
{
  const decisions = buildDecisionFixture(17) as Array<Record<string, unknown>>; decisions[0].extra = true;
  assert.equal(primaryDecisionError(validateDecisionArray(decisions, expected))?.code, "AI_DECISION_SCHEMA_MISMATCH");
}
assert.equal(primaryDecisionError(validateDecisionArray(buildDecisionFixture(17, { status: "CLASSIFIED", skillIds: ["MISSING"], positiveEvidence: ["evidence"] }), expected))?.code, "AI_DECISION_SKILL_ID_INVALID");
assert.equal(primaryDecisionError(validateDecisionArray(buildDecisionFixture(17, { status: "CLASSIFIED", skillIds: ["SKILL_001"], positiveEvidence: [] }), expected))?.code, "AI_DECISION_SEMANTIC_VALIDATION_FAILED");
assert.equal(validateDecisionArray(buildDecisionFixture(17), expected).valid, true, "UNKNOWN with negativeChecks=[] remains valid");

const warnings = compareAnalysisReportCounts("CLASSIFIED=14\nUNKNOWN=2", { CLASSIFIED: 14, UNKNOWN: 3 });
assert.deepEqual(warnings, ["AI_REPORT_COUNT_MISMATCH:UNKNOWN:reported=2:authoritative=3"]);

for (const mode of ["STANDARD_FORMAL", "STANDARD_PLUS_USER_INSTRUCTION", "CUSTOM_DIAGNOSTIC"] as const) {
  const first = composeEffectiveInstruction({ mode, runId: "analysis_test", recordCount: 17, sourceSha256: "source", rulesSnapshotId: "rules", userAdditionalInstruction: "只補充合成背景。", userCustomInstruction: "只做合成診斷。" });
  const second = composeEffectiveInstruction({ mode, runId: "analysis_test", recordCount: 17, sourceSha256: "source", rulesSnapshotId: "rules", userAdditionalInstruction: "只補充合成背景。", userCustomInstruction: "只做合成診斷。" });
  assert.equal(first.effectiveInstructionSha256, second.effectiveInstructionSha256);
  assert.equal(first.sqliteEligible, mode !== "CUSTOM_DIAGNOSTIC");
  assert.ok(first.effectiveInstruction.includes("JAA 不可變安全規範"));
  if (mode !== "CUSTOM_DIAGNOSTIC") assert.ok(first.effectiveInstruction.includes(AI_DECISION_CONTRACT_VERSION));
}
assert.ok(DEFAULT_ANALYSIS_INSTRUCTION.includes("multi-skill"));
assert.ok(DEFAULT_ANALYSIS_INSTRUCTION.includes("DEBUG_001"));
assert.ok(!/\?{3,}|銝|雿|嚗/.test(DEFAULT_ANALYSIS_INSTRUCTION), "Standard Formal instruction must be valid UTF-8 Traditional Chinese");

const rulesDirectory = path.resolve("rules", "v0.3.20");
const rules = loadV0320RulesSnapshot(rulesDirectory, [rulesDirectory]);
assert.equal(rules.ruleSetId, "JAA-SKILL-RULESET-2026-08-14-DRAFT-02");
assert.equal(rules.manifestSchemaVersion, "0.2.0");
assert.equal(rules.commonRulesVersion, "1.2.0");
assert.equal(rules.catalogVersion, "0.3.1");
assert.equal(rules.modelDecisionSchemaVersion, AI_DECISION_CONTRACT_VERSION);
assert.equal(rules.valid, true);

console.log("v0.3.20 artifact contract, lifecycle, instruction, report count, and Rule Set tests passed");
