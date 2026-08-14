import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { ANALYSIS_BRIDGE_SCHEMA_VERSION, ANALYSIS_BRIDGE_VERSION, type AnalysisBridgeToolContext, type AnalysisLifecycleStage, type AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";

type JsonObject = Record<string, unknown>;
type RequestDocument = { role: string; snapshotRelativePath: string; originalFileName: string; mimeType: string; encoding: string; snapshotByteLength: number; snapshotSha256: string; complete: boolean; truncated: boolean; byteIdentical: boolean };
type BridgeConfig = {
  runId: string;
  sessionNonce: string;
  runDirectory: string;
  requestPackage: { runId: string; pendingSourceSha256: string; inputRecordCount: number; documents: RequestDocument[] };
  rulesSnapshotId: string;
  catalogSkillIds: string[];
  testHooks?: { failWrite?: boolean; failRename?: boolean };
};

const INPUT_ROLES = ["PENDING_ANALYSIS_JSON", "COMMON_RULES", "SKILL_CATALOG", "RULE_SET_MANIFEST_OR_SCORING_RULES"] as const;
const PROGRESS_STAGES = ["INPUT_READY", "ANALYSIS_STARTED", "ANALYSIS_COMPLETED", "ARTIFACT_SUBMISSION_STARTED"] as const;
const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_ARTIFACT_SUBMISSION_BYTES = 48 * 1024 * 1024;

function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function sha256(value: string | Buffer) { return crypto.createHash("sha256").update(value).digest("hex"); }
function localAndUtc() { const date = new Date(); return { local: date.toLocaleString("sv-SE", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), utc: date.toISOString() }; }
function fail(code: string, message: string): never { throw new Error(`${code}:${message}`); }
function strictUtf8(bytes: Buffer, role: string) { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail("AI_INPUT_UTF8_INVALID", `${role} is not valid UTF-8.`); } }
function stable(value: unknown): unknown { return Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : value; }
function stableJson(value: unknown) { return JSON.stringify(stable(value)); }

function containedRegularFile(root: string, relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes(":")) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Absolute paths and alternate data streams are forbidden.");
  const canonicalRoot = fs.realpathSync.native(root);
  const candidate = path.resolve(canonicalRoot, relativePath);
  const relative = path.relative(canonicalRoot, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Input path escaped the Run allowlist.");
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Input must be a regular non-link file.");
  const real = fs.realpathSync.native(candidate);
  const realRelative = path.relative(canonicalRoot, real);
  if (realRelative.startsWith(`..${path.sep}`) || realRelative === ".." || path.isAbsolute(realRelative)) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Input reparse target escaped the Run.");
  return real;
}

function durableWrite(target: string, content: string, hooks: BridgeConfig["testHooks"] = {}) {
  const parent = fs.realpathSync.native(path.dirname(target));
  const resolved = path.resolve(target);
  if (path.dirname(resolved).toLowerCase() !== parent.toLowerCase() || path.basename(resolved).includes(":")) fail("AI_ARTIFACT_PUBLISH_FAILED", "Artifact target is outside the fixed output directory.");
  const temporary = `${resolved}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor: number | null = null;
  try {
    if (hooks.failWrite) fail("AI_ARTIFACT_PUBLISH_FAILED", "Forced writer failure.");
    descriptor = fs.openSync(temporary, "wx");
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = null;
    if (hooks.failRename) fail("AI_ARTIFACT_PUBLISH_FAILED", "Forced atomic rename failure.");
    fs.renameSync(temporary, resolved);
    const reopened = fs.readFileSync(resolved);
    const expected = Buffer.from(content, "utf8");
    if (reopened.length !== expected.length || sha256(reopened) !== sha256(expected)) fail("AI_ARTIFACT_RECEIPT_INVALID", "Reopen/hash verification failed.");
    return { relativePath: `ai-output/${path.basename(resolved)}`, sizeBytes: reopened.length, sha256: sha256(reopened), durable: true, reopenVerified: true };
  } catch (error) {
    if (descriptor !== null) try { fs.closeSync(descriptor); } catch {}
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function appendDurable(filePath: string, value: unknown) {
  const descriptor = fs.openSync(filePath, "a");
  try { fs.writeSync(descriptor, JSON.stringify(value) + "\n"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export class AnalysisBridgeV0318 {
  readonly version = ANALYSIS_BRIDGE_VERSION;
  readonly schemaVersion = ANALYSIS_BRIDGE_SCHEMA_VERSION;
  readonly transport = "codex_dynamic_tools_stdio" as const;
  private sequence = 0;
  private inputRead = false;
  private progressIndex = -1;
  private artifactReceipt: JsonObject | null = null;
  private inputReceipt: JsonObject | null = null;
  private readonly progressDirectory: string;
  private readonly outputDirectory: string;
  private lifecycle: AnalysisLifecycleSummary;

  constructor(private readonly config: BridgeConfig) {
    if (config.runId !== config.requestPackage.runId || !/^analysis_[0-9a-f-]+$/i.test(config.runId) || config.sessionNonce.length < 32) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Run identity or session nonce is invalid.");
    const root = fs.realpathSync.native(config.runDirectory);
    this.progressDirectory = path.join(root, "progress");
    this.outputDirectory = path.join(root, "ai-output");
    fs.mkdirSync(this.progressDirectory, { recursive: true });
    fs.mkdirSync(this.outputDirectory, { recursive: true });
    const time = localAndUtc();
    this.lifecycle = { schemaVersion: "jaa-analysis-lifecycle-v1", runId: config.runId, providerTurnStatus: "not_started", inputStatus: "not_started", analysisStatus: "not_started", artifactStatus: "not_started", validationStatus: "not_started", canonicalAssemblyStatus: "not_started", sqliteStatus: "blocked", overallStatus: "running", lastSuccessfulStage: "INPUT_PREPARED", firstFailedStage: null, rootErrorCode: null, analysisStarted: false, analysisCompleted: false, completedCount: null, decisionPreparedCount: null, updatedAtLocal: time.local, updatedAtUtc: time.utc };
    this.writeLifecycle();
  }

  toolSpecs() {
    return [
      { type: "function", name: "jaa_read_analysis_inputs", description: "完整讀取並驗證本次 Run 固定的 1 個 JSON 與 3 個 UTF-8 Markdown。不得傳入路徑。", inputSchema: { type: "object", additionalProperties: false, required: ["runId"], properties: { runId: { type: "string", description: "本次 Analysis Run ID" } } } },
      { type: "function", name: "jaa_report_analysis_progress", description: "回報受控分析生命週期 checkpoint。只有完成全部資料後才能回報 ANALYSIS_COMPLETED。", inputSchema: { type: "object", additionalProperties: false, required: ["runId", "stage", "expectedCount", "completedCount", "decisionPreparedCount", "message"], properties: { runId: { type: "string" }, stage: { type: "string", enum: [...PROGRESS_STAGES] }, expectedCount: { type: "integer", minimum: 0 }, completedCount: { type: "integer", minimum: 0 }, decisionPreparedCount: { type: "integer", minimum: 0 }, statusDistribution: { type: ["object", "null"], additionalProperties: { type: "integer", minimum: 0 } }, message: { type: "string", minLength: 1, maxLength: 2000 } } } },
      { type: "function", name: "jaa_publish_analysis_artifacts", description: "一次提交 Decision JSON、繁體中文 Analysis Report 與繁體中文最終摘要；JAA 驗證後以 durable atomic writer 發布。不得傳入輸出路徑。", inputSchema: { type: "object", additionalProperties: false, required: ["schemaVersion", "runId", "sourceSha256", "rulesSnapshotId", "expectedRecordCount", "decisionsDocument", "analysisReportMarkdown", "finalSummaryTraditionalChinese"], properties: { schemaVersion: { const: "jaa-analysis-artifact-submission-v1" }, runId: { type: "string" }, sourceSha256: { type: "string" }, rulesSnapshotId: { type: "string" }, expectedRecordCount: { type: "integer", minimum: 0 }, decisionsDocument: { type: "object" }, analysisReportMarkdown: { type: "string", minLength: 1 }, finalSummaryTraditionalChinese: { type: "string", minLength: 1 } } } }
    ];
  }

  preflight() {
    const root = path.join(this.progressDirectory, `.bridge-preflight-${crypto.randomUUID()}`);
    fs.mkdirSync(root, { recursive: false });
    const marker = "繁體中文完整性驗證：技能分類與證據鏈";
    const fixture = Buffer.from(marker, "utf8");
    const decoded = strictUtf8(fixture, "PREFLIGHT_UTF8");
    const output = path.join(root, "representative.json");
    const markdown = path.join(root, "representative.md");
    try {
      const jsonReceipt = durableWrite(output, stableJson({ schemaVersion: "jaa-analysis-bridge-preflight-v1", marker: decoded, decisions: [{ recordIndex: 0, status: "UNKNOWN", skillIds: [], confidence: 0, positiveEvidence: [], negativeChecks: [], unknownReasons: ["合成測試"], rationale: "代表性結構化提交" }] }) + "\n");
      const markdownReceipt = durableWrite(markdown, `# Bridge Preflight\n\n${marker}\n`);
      const result = { schemaVersion: "jaa-analysis-bridge-preflight-v1", version: this.version, transport: this.transport, localOnly: true, sessionNonceValidated: true, runContainment: true, utf8: decoded === marker, structuredSubmission: true, tmpWrite: true, fsync: true, atomicRename: true, reopenHash: jsonReceipt.reopenVerified && markdownReceipt.reopenVerified, cleanup: "pending", completedAt: new Date().toISOString() };
      fs.rmSync(root, { recursive: true, force: true });
      result.cleanup = "passed";
      this.advance("BRIDGE_PREFLIGHT_COMPLETED");
      return result;
    } catch (error) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
      this.markFailure("BRIDGE_PREFLIGHT_COMPLETED", /^AI_[A-Z_]+/.exec(String(error))?.[0] ?? "AI_BRIDGE_UNAVAILABLE");
      throw error;
    }
  }

  handle(tool: string, argsValue: unknown, context: AnalysisBridgeToolContext) {
    this.validateContext(context);
    const args = object(argsValue);
    if (args.runId !== this.config.runId) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Tool Run ID mismatch.");
    if (tool === "jaa_read_analysis_inputs") return this.readInputs(args);
    if (tool === "jaa_report_analysis_progress") return this.reportProgress(args);
    if (tool === "jaa_publish_analysis_artifacts") return this.publish(args);
    return fail("AI_BRIDGE_CONTRACT_MISMATCH", `Unknown Analysis Bridge tool: ${tool}`);
  }

  setProviderTurnStatus(status: AnalysisLifecycleSummary["providerTurnStatus"]) { this.lifecycle.providerTurnStatus = status; this.writeLifecycle(); }
  setSqliteStatus(status: AnalysisLifecycleSummary["sqliteStatus"]) { this.lifecycle.sqliteStatus = status; this.writeLifecycle(); }
  setPostBridgeStage(stage: "VALIDATION_COMPLETED" | "CANONICAL_ASSEMBLY_COMPLETED" | "RUN_COMPLETED", status: "completed" | "failed") {
    if (stage === "VALIDATION_COMPLETED") this.lifecycle.validationStatus = status;
    if (stage === "CANONICAL_ASSEMBLY_COMPLETED") this.lifecycle.canonicalAssemblyStatus = status;
    if (stage === "RUN_COMPLETED") this.lifecycle.overallStatus = status;
    if (status === "completed") this.advance(stage); else this.markFailure(stage, stage === "VALIDATION_COMPLETED" ? "AI_DECISION_SEMANTIC_INVALID" : "AI_CANONICAL_ASSEMBLY_FAILED");
  }
  fail(stage: AnalysisLifecycleStage, code: string) { this.markFailure(stage, code); }
  snapshot() { return { inputReceipt: this.inputReceipt, artifactReceipt: this.artifactReceipt, lifecycle: structuredClone(this.lifecycle) }; }

  private validateContext(context: AnalysisBridgeToolContext) {
    if (context.runId !== this.config.runId || context.sessionNonce !== this.config.sessionNonce || !context.threadId || !context.turnId || !context.callId) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Tool session context mismatch.");
  }

  private readInputs(args: JsonObject) {
    if (Object.keys(args).some((key) => key !== "runId")) fail("AI_BRIDGE_CONTRACT_MISMATCH", "Input tool does not accept paths or extra properties.");
    if (this.inputRead) fail("AI_INPUT_TOOL_FAILED", "Analysis inputs may be read exactly once.");
    this.lifecycle.inputStatus = "reading"; this.advance("INPUT_READING");
    const documents = this.config.requestPackage.documents.filter((item) => INPUT_ROLES.includes(item.role as typeof INPUT_ROLES[number]));
    if (documents.length !== 4 || new Set(documents.map((item) => item.role)).size !== 4) fail("AI_INPUT_RECEIPT_INCOMPLETE", "Request package must contain exactly four model-visible inputs.");
    let totalBytes = 0;
    const returned = documents.map((document) => {
      if (document.encoding.toLowerCase() !== "utf-8" || !document.complete || document.truncated || !document.byteIdentical) fail("AI_INPUT_RECEIPT_INCOMPLETE", `${document.role} manifest is incomplete.`);
      const filePath = containedRegularFile(this.config.runDirectory, document.snapshotRelativePath);
      const bytes = fs.readFileSync(filePath); totalBytes += bytes.length;
      if (bytes.length > MAX_DOCUMENT_BYTES || totalBytes > MAX_TOTAL_INPUT_BYTES) fail("AI_INPUT_RECEIPT_INCOMPLETE", "Bridge engineering transport safety limit exceeded before model delivery.");
      if (bytes.length !== document.snapshotByteLength || sha256(bytes) !== document.snapshotSha256) fail("AI_INPUT_HASH_MISMATCH", `${document.role} hash or byte length mismatch.`);
      const content = strictUtf8(bytes, document.role);
      return { role: document.role, fileName: document.originalFileName, encoding: "utf-8", utf8Valid: true, byteLength: bytes.length, sha256: sha256(bytes), hashMatch: true, complete: true, truncated: false, receiptToken: sha256(`${this.config.sessionNonce}:${document.role}:${document.snapshotSha256}`), content };
    });
    this.inputRead = true;
    const receipt = { schemaVersion: "jaa-analysis-input-receipt-v1", runId: this.config.runId, allInputsReady: true, documentCount: returned.length, totalByteLength: totalBytes, documents: returned.map(({ content: _content, ...metadata }) => metadata), createdAt: new Date().toISOString() };
    durableWrite(path.join(this.progressDirectory, "input-receipt.json"), stableJson(receipt) + "\n");
    this.inputReceipt = receipt; this.lifecycle.inputStatus = "ready"; this.advance("INPUT_READY");
    return { ...receipt, documents: returned };
  }

  private reportProgress(args: JsonObject) {
    const stage = String(args.stage ?? "") as typeof PROGRESS_STAGES[number];
    const index = PROGRESS_STAGES.indexOf(stage);
    if (index < 0 || index !== this.progressIndex + 1) fail("AI_ANALYSIS_INCOMPLETE", `Illegal lifecycle transition to ${stage}.`);
    const expected = Number(args.expectedCount); const completed = Number(args.completedCount); const prepared = Number(args.decisionPreparedCount);
    if (![expected, completed, prepared].every(Number.isInteger) || expected !== this.config.requestPackage.inputRecordCount || completed < 0 || prepared < 0 || completed > expected || prepared > expected) fail("AI_ANALYSIS_INCOMPLETE", "Progress counts are invalid.");
    if (stage === "INPUT_READY" && (!this.inputRead || completed !== 0 || prepared !== 0)) fail("AI_INPUT_RECEIPT_INCOMPLETE", "INPUT_READY requires a valid receipt and zero analysis counts.");
    if (stage === "ANALYSIS_STARTED" && completed !== 0) fail("AI_ANALYSIS_INCOMPLETE", "ANALYSIS_STARTED cannot claim completed records.");
    if (stage === "ANALYSIS_COMPLETED" && (completed !== expected || prepared !== expected || !args.statusDistribution || typeof args.statusDistribution !== "object")) fail("AI_ANALYSIS_INCOMPLETE", "ANALYSIS_COMPLETED requires exact counts and distribution.");
    this.progressIndex = index; this.sequence += 1;
    const time = localAndUtc(); const event = { schemaVersion: "jaa-analysis-progress-v1", runId: this.config.runId, sequence: this.sequence, atLocal: time.local, atUtc: time.utc, stage, expectedCount: expected, completedCount: completed, decisionPreparedCount: prepared, statusDistribution: args.statusDistribution ?? null, message: String(args.message ?? "") };
    appendDurable(path.join(this.progressDirectory, "analysis-progress.jsonl"), event);
    if (stage === "ANALYSIS_STARTED") { this.lifecycle.analysisStatus = "running"; this.lifecycle.analysisStarted = true; }
    if (stage === "ANALYSIS_COMPLETED") { this.lifecycle.analysisStatus = "completed"; this.lifecycle.analysisCompleted = true; this.lifecycle.completedCount = completed; this.lifecycle.decisionPreparedCount = prepared; }
    if (stage === "ARTIFACT_SUBMISSION_STARTED") this.lifecycle.artifactStatus = "submitting";
    this.advance(stage);
    return { accepted: true, runId: this.config.runId, sequence: this.sequence, stage };
  }

  private publish(args: JsonObject) {
    if (this.progressIndex !== PROGRESS_STAGES.indexOf("ARTIFACT_SUBMISSION_STARTED") || !this.lifecycle.analysisCompleted) fail("AI_ANALYSIS_INCOMPLETE", "Artifacts require authoritative ANALYSIS_COMPLETED and submission checkpoint.");
    if (args.schemaVersion !== "jaa-analysis-artifact-submission-v1" || args.sourceSha256 !== this.config.requestPackage.pendingSourceSha256 || args.rulesSnapshotId !== this.config.rulesSnapshotId || Number(args.expectedRecordCount) !== this.config.requestPackage.inputRecordCount) fail("AI_ARTIFACT_RECEIPT_INVALID", "Artifact submission identity mismatch.");
    const document = object(args.decisionsDocument); const decisions = Array.isArray(document.decisions) ? document.decisions : [];
    if (document.schemaVersion !== "ai-analysis-decisions-v1" || document.runId !== this.config.runId || document.sourceSha256 !== this.config.requestPackage.pendingSourceSha256 || document.rulesSnapshotId !== this.config.rulesSnapshotId || Number(document.expectedRecordCount) !== this.config.requestPackage.inputRecordCount || decisions.length !== this.config.requestPackage.inputRecordCount) fail("AI_DECISION_COUNT_MISMATCH", "Decision document root or exact count mismatch.");
    const catalog = new Set(this.config.catalogSkillIds); const seen = new Set<number>();
    decisions.forEach((raw, outputIndex) => { const decision = object(raw); const recordIndex = Number(decision.recordIndex); if (!Number.isInteger(recordIndex) || recordIndex !== outputIndex || seen.has(recordIndex)) fail("AI_DECISION_SCHEMA_INVALID", `recordIndex ${recordIndex} is missing, duplicate, or out of order.`); seen.add(recordIndex); if (Array.isArray(decision.skillIds) && decision.skillIds.some((id) => typeof id !== "string" || !catalog.has(id))) fail("AI_DECISION_SEMANTIC_INVALID", `recordIndex ${recordIndex} contains an unknown Skill ID.`); if (decision.status === "UNKNOWN" && (!Array.isArray(decision.unknownReasons) || decision.unknownReasons.length === 0)) fail("AI_DECISION_SEMANTIC_INVALID", `recordIndex ${recordIndex} UNKNOWN requires unknownReasons.`); });
    const report = String(args.analysisReportMarkdown ?? "").trim(); const summary = String(args.finalSummaryTraditionalChinese ?? "").trim();
    if (!report || !summary) fail("AI_ARTIFACT_RECEIPT_INVALID", "Analysis Report and final Traditional Chinese summary are required.");
    const decisionText = stableJson(document) + "\n";
    if (Buffer.byteLength(decisionText) + Buffer.byteLength(report) + Buffer.byteLength(summary) > MAX_ARTIFACT_SUBMISSION_BYTES) fail("AI_ARTIFACT_PUBLISH_FAILED", "Artifact submission exceeds the documented engineering safety limit.");
    try {
      const artifacts = [
        { role: "DECISIONS_JSON", ...durableWrite(path.join(this.outputDirectory, "ai-analysis-decisions.json"), decisionText, this.config.testHooks) },
        { role: "ANALYSIS_REPORT", ...durableWrite(path.join(this.outputDirectory, "analysis-report.md"), report + "\n", this.config.testHooks) },
        { role: "FINAL_ASSISTANT_MESSAGE", ...durableWrite(path.join(this.outputDirectory, "final-assistant-message.txt"), summary + "\n", this.config.testHooks) }
      ];
      const receipt = { schemaVersion: "jaa-analysis-artifact-receipt-v1", runId: this.config.runId, status: "published", decisionCount: decisions.length, artifacts, publishedAt: new Date().toISOString() };
      durableWrite(path.join(this.progressDirectory, "artifact-receipt.json"), stableJson(receipt) + "\n");
      this.artifactReceipt = receipt; this.lifecycle.artifactStatus = "published"; this.advance("ARTIFACT_PUBLISHED");
      return receipt;
    } catch (error) {
      this.lifecycle.artifactStatus = "failed"; this.markFailure("ARTIFACT_SUBMISSION_STARTED", /^AI_[A-Z_]+/.exec(String(error))?.[0] ?? "AI_ARTIFACT_PUBLISH_FAILED"); throw error;
    }
  }

  private advance(stage: AnalysisLifecycleStage) { const time = localAndUtc(); this.lifecycle.lastSuccessfulStage = stage; this.lifecycle.updatedAtLocal = time.local; this.lifecycle.updatedAtUtc = time.utc; this.writeLifecycle(); }
  private markFailure(stage: AnalysisLifecycleStage, code: string) { const time = localAndUtc(); this.lifecycle.firstFailedStage ??= stage; this.lifecycle.rootErrorCode ??= code; this.lifecycle.overallStatus = "failed"; this.lifecycle.updatedAtLocal = time.local; this.lifecycle.updatedAtUtc = time.utc; this.writeLifecycle(); }
  private writeLifecycle() { fs.mkdirSync(this.progressDirectory, { recursive: true }); const target = path.join(this.progressDirectory, "lifecycle-summary.json"); const temporary = `${target}.${process.pid}.tmp`; fs.writeFileSync(temporary, stableJson(this.lifecycle) + "\n", "utf8"); const descriptor = fs.openSync(temporary, "r+"); try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); } fs.renameSync(temporary, target); }
}

export function createAnalysisBridge(config: BridgeConfig) { return new AnalysisBridgeV0318(config); }
