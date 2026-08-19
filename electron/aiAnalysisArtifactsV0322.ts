import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, emptyTokenUsage, type AiAnalysisRun, type AiDiffAnalysisResult, type AiRulesSnapshot } from "../shared/aiAnalysisContract.js";
import type { CompactPayload } from "./aiAnalysisSingleRunV0311.js";
import { assertAppPath } from "./appPaths.js";
import { AI_DECISION_CONTRACT_VERSION, AI_DECISION_STATUSES, validateDecisionArray, type DecisionValidation, type ValidatedDecisionDocument } from "./aiAnalysisDecisionContractV0322.js";

export const AI_DECISION_SCHEMA_VERSION = AI_DECISION_CONTRACT_VERSION;
export const AI_ARTIFACT_CONTRACT_VERSION = "ai-analysis-artifacts-v0.3.22" as const;
export const PROVIDER_PERFORMANCE_WARNING_MS = 855_000;
export const PROVIDER_HARD_TIMEOUT_MS = 1_200_000;
export type { AiDecision, DecisionFinding, DecisionStatus, DecisionValidation } from "./aiAnalysisDecisionContractV0322.js";
export type AiDecisionDocument = ValidatedDecisionDocument;
export type CanonicalRunPaths = { root: string; input: string; output: string; canonical: string; logs: string; decisions: string; report: string; finalMessage: string; canonicalResult: string; validationReport: string; completionManifest: string };

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : typeof value === "number" && !Number.isFinite(value) ? null : value;
export const stableJson = (value: unknown) => JSON.stringify(stable(value));
export const hashFile = (filePath: string) => sha256(fs.readFileSync(filePath));

function contained(root: string, candidate: string, allowMissing = false) {
  const safeRoot = fs.realpathSync.native(assertAppPath(root));
  const resolved = path.resolve(candidate);
  const parent = fs.realpathSync.native(path.dirname(resolved));
  const relativeParent = path.relative(safeRoot, parent);
  if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent)) throw new AiAnalysisError("AI_OUTPUT_PATH_ESCAPE_BLOCKED", `Output path escapes this Run: ${candidate}`);
  if (!allowMissing && !fs.existsSync(resolved)) throw new AiAnalysisError("AI_DECISION_FILE_MISSING", `Required artifact is missing: ${path.basename(candidate)}`);
  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new AiAnalysisError("AI_OUTPUT_PATH_ESCAPE_BLOCKED", `Artifact must be a regular non-link file: ${candidate}`);
    const real = fs.realpathSync.native(resolved);
    const relative = path.relative(safeRoot, real);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new AiAnalysisError("AI_OUTPUT_PATH_ESCAPE_BLOCKED", `Artifact resolved outside this Run: ${candidate}`);
  }
  return resolved;
}

export function createArtifactWorkspaces(runDirectory: string): CanonicalRunPaths {
  const root = fs.realpathSync.native(assertAppPath(runDirectory));
  const input = path.join(root, "input-workspace");
  const output = path.join(root, "ai-output");
  const canonical = path.join(root, "canonical-output");
  const logs = path.join(root, "logs");
  for (const folder of [output, canonical, logs]) fs.mkdirSync(folder, { recursive: true });
  return { root, input, output, canonical, logs, decisions: path.join(output, "ai-analysis-decisions.json"), report: path.join(output, "analysis-report.md"), finalMessage: path.join(output, "final-assistant-message.txt"), canonicalResult: path.join(canonical, "analysis-result.json"), validationReport: path.join(canonical, "validation-report.json"), completionManifest: path.join(canonical, "completion-manifest.json") };
}

export function verifyInputWorkspaceUnchanged(runDirectory: string, documents: Array<{ snapshotRelativePath: string; snapshotSha256: string; snapshotByteLength: number }>) {
  for (const document of documents) {
    const filePath = contained(runDirectory, path.join(runDirectory, document.snapshotRelativePath));
    const bytes = fs.readFileSync(filePath);
    if (bytes.length !== document.snapshotByteLength || sha256(bytes) !== document.snapshotSha256) throw new AiAnalysisError("AI_INPUT_FILE_HASH_MISMATCH", `Input changed during Provider turn: ${document.snapshotRelativePath}`);
  }
}

export function parseAndValidateDecisions(raw: string, expected: { runId: string; sourceSha256: string; rulesSnapshotId: string; recordCount: number; catalogSkillIds: string[]; evidenceByRecord?: Array<Array<{ evidenceRef: string; normalizedText: string }>> }): { document: AiDecisionDocument; validation: DecisionValidation } {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (error) { throw new AiAnalysisError("AI_DECISION_JSON_INVALID", `ai-analysis-decisions.json is not pure valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const validation = validateDecisionArray(parsed, { recordCount: expected.recordCount, catalogSkillIds: expected.catalogSkillIds, evidenceByRecord: expected.evidenceByRecord });
  return { document: { contractVersion: AI_DECISION_CONTRACT_VERSION, contractSha256: validation.contractSha256, runId: expected.runId, sourceSha256: expected.sourceSha256, rulesSnapshotId: expected.rulesSnapshotId, expectedRecordCount: expected.recordCount, decisions: validation.decisions }, validation };
}export function readPublishedArtifacts(paths: CanonicalRunPaths) {
  for (const temporary of [paths.decisions + ".tmp", paths.decisions + ".partial"]) if (fs.existsSync(temporary)) throw new AiAnalysisError("AI_OUTPUT_PUBLISH_INCOMPLETE", `Temporary Decision artifact still exists: ${path.basename(temporary)}`);
  if (!fs.existsSync(paths.decisions)) throw new AiAnalysisError("AI_DECISION_FILE_MISSING", "ai-analysis-decisions.json is missing.");
  const decisions = contained(paths.output, paths.decisions);
  const report = fs.existsSync(paths.report) ? contained(paths.output, paths.report) : null;
  const finalMessage = fs.existsSync(paths.finalMessage) ? contained(paths.output, paths.finalMessage) : null;
  const reportText = report ? fs.readFileSync(report, "utf8").trim() || null : null;
  const finalText = finalMessage ? fs.readFileSync(finalMessage, "utf8").trim() || null : null;
  const warnings = [...(!reportText ? ["AI_ANALYSIS_REPORT_MISSING"] : []), ...(!finalText ? ["AI_FINAL_SUMMARY_MISSING"] : [])];
  return { decisionsText: fs.readFileSync(decisions, "utf8"), reportText, finalText, warnings, hashes: { decisions: hashFile(decisions), report: reportText && report ? hashFile(report) : null, finalMessage: finalText && finalMessage ? hashFile(finalMessage) : null } };
}

export function compareAnalysisReportCounts(reportText: string | null, distribution: Record<string, number>) {
  if (!reportText) return [];
  const warnings: string[] = [];
  for (const status of AI_DECISION_STATUSES) {
    const matcher = new RegExp("\\b" + status + "\\s*[:=]\\s*(\\d+)\\b", "gi");
    for (const match of reportText.matchAll(matcher)) {
      const reported = Number(match[1]); const authoritative = distribution[status] ?? 0;
      if (reported !== authoritative) warnings.push("AI_REPORT_COUNT_MISMATCH:" + status + ":reported=" + reported + ":authoritative=" + authoritative);
    }
  }
  return [...new Set(warnings)];
}

export function assembleCanonicalResults(compact: CompactPayload, decisions: AiDecisionDocument, rules: AiRulesSnapshot, analyzerVersion: string, requestTraceId: string | null, usage = emptyTokenUsage("actual")): AiDiffAnalysisResult[] {
  const catalog = new Map(rules.catalog.map((skill) => [skill.id, skill]));
  return decisions.decisions.map((decision, index) => {
    const source = compact.records[index]; if (!source || decision.recordIndex !== index) throw new AiAnalysisError("AI_DECISION_INDEX_MISSING", `Cannot assemble decision recordIndex ${decision.recordIndex}; expected ${index}.`);
    const candidates = decision.skillFindings.map((finding) => {
      const skill = catalog.get(finding.skillId); if (!skill) throw new AiAnalysisError("AI_DECISION_SKILL_ID_INVALID", `recordIndex ${index}: ${finding.skillId}`);
      return { skillId: finding.skillId, skillName: skill.name, group: skill.group, score: Math.round(finding.confidence * 100), confidence: finding.confidence, confidenceLabel: finding.confidence >= .9 ? "High" as const : finding.confidence >= .6 ? "Medium" as const : "Low" as const, confidenceReason: finding.rationale, positiveSignals: finding.evidenceQuotes.map((quote) => quote.quote), positiveEvidenceRefs: finding.evidenceQuotes.map((quote) => quote.evidenceRef), negativeChecks: finding.negativeChecks.map((detail, checkIndex) => ({ ruleId: `AI_SKILL_CHECK_${checkIndex + 1}`, passed: false, detail, evidenceRefs: finding.evidenceQuotes.map((quote) => quote.evidenceRef) })), negativeEvidenceRefs: finding.evidenceQuotes.map((quote) => quote.evidenceRef), rejectedNearSkills: [], evidenceQuote: finding.evidenceQuotes[0]?.quote ?? "", evidenceQuotes: finding.evidenceQuotes, evidenceExplanation: finding.evidenceExplanation, skillRationale: finding.rationale, matchedRuleIds: [], reason: finding.rationale, status: "PENDING_REVIEW" as const, candidateStatus: (decision.status === "CLASSIFIED" ? "MATCHED" : decision.status === "FAILED" ? "NEEDS_REVIEW" : decision.status) as "MATCHED" | "EXCLUDED" | "CATALOG_DETAIL_MISSING" | "NEEDS_REVIEW", statusReason: finding.rationale, catalogDetailAvailable: decision.status !== "CATALOG_DETAIL_MISSING" };
    });
    return { resultId: `result_${sha256(`${decisions.runId}:${source.sourceRecordStableId}:${source.sourceContentHash}:${rules.snapshotId ?? rules.ruleSetId}`).slice(0, 24)}`, sourceDiffId: source.sourceRecordStableId, sourceContentHash: source.sourceContentHash, sourceEvidenceSnapshot: { issueKey: source.issueKey, actor: source.actor, eventTimestamp: source.eventTimestamp, fieldName: source.fieldName, sourceProvenance: source.sourceProvenance, addedText: [...source.addedText], removedText: [...source.removedText] }, evidenceRefs: [...new Set(decision.skillFindings.flatMap((finding) => finding.evidenceQuotes.map((quote) => quote.evidenceRef)))], recordIndex: index, sourceRecordStableId: source.sourceRecordStableId, activityEventId: source.activityEventId, evidenceId: source.evidenceId, decisionConfidence: decision.confidence, decisionRationale: decision.rationale, recordNegativeChecks: decision.recordNegativeChecks, derivedSkillIds: decision.skillFindings.map((finding) => finding.skillId), classificationStatus: decision.status === "CLASSIFIED" ? "MATCHED" : decision.status === "FAILED" ? "NEEDS_REVIEW" : decision.status, reviewStatus: "PENDING_REVIEW", reviewAttention: ["CATALOG_DETAIL_MISSING", "NEEDS_REVIEW", "FAILED"].includes(decision.status) ? "NEEDS_REVIEW" : "STANDARD_REVIEW", dispositionReason: decision.rationale, exclusionReason: decision.status === "EXCLUDED" ? decision.rationale : null, unknownReason: decision.status === "UNKNOWN" ? decision.unknownReasons.join("; ") : null, reviewReason: ["NEEDS_REVIEW", "FAILED"].includes(decision.status) ? decision.rationale : null, matchedRuleIds: [], negativeChecks: decision.recordNegativeChecks.map((detail, checkIndex) => ({ ruleId: `AI_RECORD_CHECK_${checkIndex + 1}`, passed: false, detail, evidenceRefs: [source.evidenceId] })), candidates, status: decision.status === "UNKNOWN" ? "UNKNOWN" : decision.status === "EXCLUDED" ? "EXCLUDED" : ["NEEDS_REVIEW", "FAILED"].includes(decision.status) ? "NEEDS_REVIEW" : "PENDING_REVIEW", analyzerVersion, requestTraceId, usage, rawResultAvailable: true, reviewNote: "", reviewedAt: null };
  });
}
export function atomicWriteCanonical(filePath: string, value: unknown) { const target = contained(path.dirname(filePath), filePath, true); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; const text = stableJson(value) + "\n"; fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, target); return { filePath: target, sizeBytes: Buffer.byteLength(text), sha256: sha256(text) }; }

export function warningPersistenceGate(input: { structuralValidationPassed: boolean; warnings: string[]; acceptedWarnings?: string[] }) { const accepted = new Set(input.acceptedWarnings ?? []); const pending = input.warnings.filter((warning) => !accepted.has(warning)); return { sqliteEligible: input.structuralValidationPassed && pending.length === 0, requiresHumanAcceptance: input.structuralValidationPassed && pending.length > 0, pendingWarnings: pending, acceptedWarnings: [...accepted] }; }

export function buildCompletionManifest(input: { run: AiAnalysisRun; paths: CanonicalRunPaths; validation: DecisionValidation; decisionSha256: string; canonicalResultSha256: string; canonicalCount: number; sqliteEligible: boolean }) { return { schemaVersion: "ai-analysis-completion-manifest-v2", runId: input.run.runId, decisionFile: "ai-output/ai-analysis-decisions.json", reportFile: "ai-output/analysis-report.md", finalAssistantMessageFile: "ai-output/final-assistant-message.txt", canonicalResultFile: "canonical-output/analysis-result.json", expectedRecordCount: input.validation.expectedCount, actualDecisionCount: input.validation.actualCount, actualCanonicalCount: input.canonicalCount, decisionSha256: input.decisionSha256, canonicalResultSha256: input.canonicalResultSha256, schemaValidationPassed: input.validation.schemaValid, semanticValidationPassed: input.validation.semanticValid, warnings: input.validation.warnings, finalStatus: input.validation.warnings.length ? "completed_with_warnings" : "completed", sqliteEligible: input.sqliteEligible, generatedAt: new Date().toISOString() }; }