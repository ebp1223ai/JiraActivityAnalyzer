import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AnalysisBridgeV0318 } from "../electron/analysisBridgeRuntimeV0318.js";
import { buildCoreAnalysisInstruction, CORE_INSTRUCTION_VERSION } from "../electron/aiAnalysisRequestPackageV0314.js";
import { parseAndValidateDecisions, warningPersistenceGate } from "../electron/aiAnalysisArtifactsV0316.js";

const hash = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const root = fs.mkdtempSync(path.join(process.cwd(), "test-artifacts", "v0318-bridge-"));
const runId = `analysis_${crypto.randomUUID()}`;
const sessionNonce = crypto.randomBytes(32).toString("hex");
const roles = [
  ["PENDING_ANALYSIS_JSON", "pending-analysis.json", JSON.stringify({ marker: "繁體中文活動證據", records: Array.from({ length: 17 }, (_, recordIndex) => ({ recordIndex, text: `技能分類第${recordIndex + 1}筆` })) })],
  ["COMMON_RULES", "common-rules.md", "# 共通規則\n\n繁體中文完整讀取，不可出現亂碼。\n"],
  ["SKILL_CATALOG", "skill-catalog.md", "# 技能目錄\n\n- SKILL_SYNTHETIC：合成技能\n"],
  ["RULE_SET_MANIFEST_OR_SCORING_RULES", "rule-set-manifest.md", "# 規則集 Manifest\n\n規則版本：測試版\n"]
] as const;

function fixtureRun(folder: string, overrides: Record<string, unknown> = {}) {
  const input = path.join(folder, "input-workspace"); fs.mkdirSync(input, { recursive: true }); fs.mkdirSync(path.join(folder, "ai-output"), { recursive: true });
  const documents = roles.map(([role, fileName, content]) => { const bytes = Buffer.from(content, "utf8"); fs.writeFileSync(path.join(input, fileName), bytes); return { role, snapshotRelativePath: `input-workspace/${fileName}`, originalFileName: fileName, mimeType: fileName.endsWith(".json") ? "application/json" : "text/markdown", encoding: "utf-8", snapshotByteLength: bytes.length, snapshotSha256: hash(bytes), complete: true, truncated: false, byteIdentical: true }; });
  return new AnalysisBridgeV0318({ runId, sessionNonce, runDirectory: folder, requestPackage: { runId, pendingSourceSha256: "a".repeat(64), inputRecordCount: 17, documents }, rulesSnapshotId: "rules-test", catalogSkillIds: ["SKILL_SYNTHETIC"], ...overrides });
}

const context = { runId, sessionNonce, threadId: "thread-test", turnId: "turn-test", callId: "call-test" };
try {
  const bridge = fixtureRun(path.join(root, "success"));
  const specs = bridge.toolSpecs();
  assert.deepEqual(specs.map((item) => item.name), ["jaa_read_analysis_inputs", "jaa_report_analysis_progress", "jaa_publish_analysis_artifacts"]);
  assert.equal(JSON.stringify(specs).includes("path"), false, "tool schemas must not accept arbitrary paths");
  const preflight = bridge.preflight();
  assert.equal(preflight.utf8, true); assert.equal(preflight.atomicRename, true); assert.equal(preflight.cleanup, "passed");
  const receipt = bridge.handle("jaa_read_analysis_inputs", { runId }, context) as { allInputsReady: boolean; documents: Array<{ content: string; utf8Valid: boolean; hashMatch: boolean }> };
  assert.equal(receipt.allInputsReady, true); assert.equal(receipt.documents.length, 4); assert.ok(receipt.documents.every((item) => item.utf8Valid && item.hashMatch));
  assert.match(receipt.documents.map((item) => item.content).join("\n"), /繁體中文活動證據/); assert.doesNotMatch(receipt.documents.map((item) => item.content).join("\n"), /ç¹é«|ä¸­æ–‡/);
  assert.throws(() => bridge.handle("jaa_read_analysis_inputs", { runId }, context), /AI_INPUT_TOOL_FAILED/);
  assert.throws(() => bridge.handle("jaa_report_analysis_progress", { runId, stage: "ANALYSIS_STARTED", expectedCount: 17, completedCount: 0, decisionPreparedCount: 0, message: "開始" }, context), /AI_ANALYSIS_INCOMPLETE/);
  bridge.handle("jaa_report_analysis_progress", { runId, stage: "INPUT_READY", expectedCount: 17, completedCount: 0, decisionPreparedCount: 0, statusDistribution: null, message: "輸入完成" }, context);
  bridge.handle("jaa_report_analysis_progress", { runId, stage: "ANALYSIS_STARTED", expectedCount: 17, completedCount: 0, decisionPreparedCount: 0, statusDistribution: null, message: "開始分析" }, context);
  assert.throws(() => bridge.handle("jaa_report_analysis_progress", { runId, stage: "ANALYSIS_COMPLETED", expectedCount: 17, completedCount: 16, decisionPreparedCount: 17, statusDistribution: { UNKNOWN: 17 }, message: "錯誤完成" }, context), /AI_ANALYSIS_INCOMPLETE/);
  bridge.handle("jaa_report_analysis_progress", { runId, stage: "ANALYSIS_COMPLETED", expectedCount: 17, completedCount: 17, decisionPreparedCount: 17, statusDistribution: { UNKNOWN: 17 }, message: "全部分析完成" }, context);
  bridge.handle("jaa_report_analysis_progress", { runId, stage: "ARTIFACT_SUBMISSION_STARTED", expectedCount: 17, completedCount: 17, decisionPreparedCount: 17, statusDistribution: { UNKNOWN: 17 }, message: "提交產物" }, context);
  const decisions = Array.from({ length: 17 }, (_, recordIndex) => ({ recordIndex, status: "UNKNOWN", skillIds: [], confidence: 0.3, positiveEvidence: [], negativeChecks: [], unknownReasons: [`第${recordIndex + 1}筆證據不足`], rationale: `依規則檢查第${recordIndex + 1}筆後，資訊不足以匹配技能。` }));
  const decisionsDocument = { schemaVersion: "ai-analysis-decisions-v1", runId, sourceSha256: "a".repeat(64), rulesSnapshotId: "rules-test", expectedRecordCount: 17, decisions };
  const artifactReceipt = bridge.handle("jaa_publish_analysis_artifacts", { schemaVersion: "jaa-analysis-artifact-submission-v1", runId, sourceSha256: "a".repeat(64), rulesSnapshotId: "rules-test", expectedRecordCount: 17, decisionsDocument, analysisReportMarkdown: "# 分析報告\n\n已完成十七筆資料。", finalSummaryTraditionalChinese: "輸入、分析與產物提交均已完成；共十七筆 UNKNOWN，需人工檢視證據完整性。" }, context) as { status: string; decisionCount: number; artifacts: Array<{ durable: boolean; reopenVerified: boolean }> };
  assert.equal(artifactReceipt.status, "published"); assert.equal(artifactReceipt.decisionCount, 17); assert.ok(artifactReceipt.artifacts.every((item) => item.durable && item.reopenVerified));
  const snapshot = bridge.snapshot(); assert.equal(snapshot.lifecycle.analysisStarted, true); assert.equal(snapshot.lifecycle.analysisCompleted, true); assert.equal(snapshot.lifecycle.artifactStatus, "published");
  const validated = parseAndValidateDecisions(fs.readFileSync(path.join(root, "success", "ai-output", "ai-analysis-decisions.json"), "utf8"), { runId, sourceSha256: "a".repeat(64), rulesSnapshotId: "rules-test", recordCount: 17, catalogSkillIds: ["SKILL_SYNTHETIC"] });
  assert.equal(validated.validation.valid, true); assert.equal(validated.validation.actualCount, 17); assert.equal(warningPersistenceGate({ structuralValidationPassed: true, warnings: validated.validation.warnings }).sqliteEligible, false);

  const badUtfFolder = path.join(root, "bad-utf8"); const badUtf = fixtureRun(badUtfFolder); fs.writeFileSync(path.join(badUtfFolder, "input-workspace", "common-rules.md"), Buffer.from([0xc3, 0x28])); const badManifest = (badUtf as unknown as { config: { requestPackage: { documents: Array<{ role: string; snapshotByteLength: number; snapshotSha256: string }> } } }).config.requestPackage.documents.find((item) => item.role === "COMMON_RULES")!; badManifest.snapshotByteLength = 2; badManifest.snapshotSha256 = hash(Buffer.from([0xc3, 0x28])); assert.throws(() => badUtf.handle("jaa_read_analysis_inputs", { runId }, context), /AI_INPUT_UTF8_INVALID/);

  const traversalFolder = path.join(root, "traversal"); const traversal = fixtureRun(traversalFolder); const traversalManifest = (traversal as unknown as { config: { requestPackage: { documents: Array<{ role: string; snapshotRelativePath: string }> } } }).config.requestPackage.documents.find((item) => item.role === "COMMON_RULES")!; traversalManifest.snapshotRelativePath = "../outside.md"; assert.throws(() => traversal.handle("jaa_read_analysis_inputs", { runId }, context), /AI_BRIDGE_CONTRACT_MISMATCH/);

  const renameFolder = path.join(root, "rename-failure"); const renameFailure = fixtureRun(renameFolder, { testHooks: { failRename: true } }); renameFailure.preflight(); renameFailure.handle("jaa_read_analysis_inputs", { runId }, context); for (const stage of ["INPUT_READY", "ANALYSIS_STARTED", "ANALYSIS_COMPLETED", "ARTIFACT_SUBMISSION_STARTED"] as const) renameFailure.handle("jaa_report_analysis_progress", { runId, stage, expectedCount: 17, completedCount: stage === "ANALYSIS_COMPLETED" || stage === "ARTIFACT_SUBMISSION_STARTED" ? 17 : 0, decisionPreparedCount: stage === "ANALYSIS_COMPLETED" || stage === "ARTIFACT_SUBMISSION_STARTED" ? 17 : 0, statusDistribution: stage === "ANALYSIS_COMPLETED" || stage === "ARTIFACT_SUBMISSION_STARTED" ? { UNKNOWN: 17 } : null, message: stage }, context); assert.throws(() => renameFailure.handle("jaa_publish_analysis_artifacts", { schemaVersion: "jaa-analysis-artifact-submission-v1", runId, sourceSha256: "a".repeat(64), rulesSnapshotId: "rules-test", expectedRecordCount: 17, decisionsDocument, analysisReportMarkdown: "報告", finalSummaryTraditionalChinese: "摘要" }, context), /AI_ARTIFACT_PUBLISH_FAILED/); assert.equal(renameFailure.snapshot().lifecycle.providerTurnStatus, "not_started"); assert.equal(renameFailure.snapshot().lifecycle.artifactStatus, "failed");

  const prompt = buildCoreAnalysisInstruction(17, "保留我的原文", runId, "a".repeat(64), "rules-test"); assert.equal(CORE_INSTRUCTION_VERSION, "0.3.18-zh-TW-v1"); assert.match(prompt, /繁體中文/); assert.match(prompt, /保留我的原文/); assert.match(prompt, /jaa_read_analysis_inputs/); assert.doesNotMatch(prompt, /300/);
  const service = fs.readFileSync(path.join(process.cwd(), "electron", "chatGptService.ts"), "utf8"); assert.match(service, /dynamicTools/); assert.match(service, /sandbox: "read-only"/); assert.doesNotMatch(service, /Get-Content|Set-Content|Move-Item|command\/exec|preflightWritableArtifactPipeline/);
  const loader = fs.readFileSync(path.join(process.cwd(), "electron", "analysisBridgeLoaderV0318.ts"), "utf8"); assert.match(loader, /AI_BRIDGE_UNAVAILABLE/); assert.match(loader, /AI_BRIDGE_INTEGRITY_MISMATCH/); assert.match(loader, /externalFallback !== false/); assert.doesNotMatch(loader, /process\.env\.PATH|which|where\.exe/);
  const bundle = path.join(process.cwd(), "dist-electron", "analysis-bridge-v0318.cjs"); const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "dist-electron", "analysis-bridge-manifest.json"), "utf8")); assert.equal(manifest.version, "0.3.18-bridge-v1"); assert.equal(manifest.sha256, hash(fs.readFileSync(bundle))); assert.equal(manifest.externalFallback, false);
  const archive = fs.readFileSync(path.join(process.cwd(), "electron", "aiAnalysisRunArchiveV0314.ts"), "utf8"); assert.match(archive, /originalPayloadBytes/); assert.match(archive, /originalPayloadSha256/); assert.match(archive, /SANITIZATION_FAILED_PAYLOAD_OMITTED/);
  const ui = fs.readFileSync(path.join(process.cwd(), "src", "ai-analysis", "AiAnalysisReconstructedPage.tsx"), "utf8"); assert.match(ui, /AI 分析結果/); assert.match(ui, /AI 分析診斷結果/); assert.match(ui, /analysisStarted/); assert.match(ui, /analysisCompleted/);
  console.log(JSON.stringify({ status: "passed", bridgeVersion: bridge.version, utf8Documents: receipt.documents.length, decisions: artifactReceipt.decisionCount, lifecycle: snapshot.lifecycle }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
