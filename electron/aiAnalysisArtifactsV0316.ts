import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, emptyTokenUsage, type AiAnalysisRun, type AiDiffAnalysisResult, type AiRulesSnapshot } from "../shared/aiAnalysisContract.js";
import type { CompactPayload } from "./aiAnalysisSingleRunV0311.js";
import { assertAppPath } from "./appPaths.js";

export const AI_DECISION_SCHEMA_VERSION = "ai-analysis-decisions-v1" as const;
export const AI_ARTIFACT_CONTRACT_VERSION = "ai-analysis-artifacts-v0.3.16" as const;
export const PROVIDER_PERFORMANCE_WARNING_MS = 855_000;
export const PROVIDER_HARD_TIMEOUT_MS = 1_200_000;
export type DecisionStatus = "MATCHED" | "EXCLUDED" | "UNKNOWN" | "CATALOG_DETAIL_MISSING" | "NEEDS_REVIEW";
export type AiDecision = { recordIndex: number; status: DecisionStatus; skillIds: string[]; confidence: number; positiveEvidence: string[]; negativeChecks: string[]; unknownReasons: string[]; rationale: string };
export type AiDecisionDocument = { schemaVersion: typeof AI_DECISION_SCHEMA_VERSION; runId: string; sourceSha256: string; rulesSnapshotId: string; expectedRecordCount: number; decisions: AiDecision[] };
export type DecisionFinding = { code: string; path: string; recordIndex: number | null; expected: unknown; actual: unknown; message: string };
export type DecisionValidation = { valid: boolean; expectedCount: number; actualCount: number; semanticValidCount: number; findings: DecisionFinding[]; warnings: string[]; distribution: Record<DecisionStatus, number>; allUnknown: boolean; allSameStatus: boolean; evidenceCoverage: number; rationaleDuplicateRatio: number; unknownReasonDuplicateRatio: number };
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

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : []; }
function duplicateRatio(values: string[]) { if (!values.length) return 0; return 1 - new Set(values.map((item) => item.trim().toLowerCase())).size / values.length; }
function finding(findings: DecisionFinding[], code: string, pathValue: string, recordIndex: number | null, expected: unknown, actual: unknown, message: string) { findings.push({ code, path: pathValue, recordIndex, expected, actual, message }); }

export function parseAndValidateDecisions(raw: string, expected: { runId: string; sourceSha256: string; rulesSnapshotId: string; recordCount: number; catalogSkillIds: string[] }): { document: AiDecisionDocument; validation: DecisionValidation } {
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch (error) { throw new AiAnalysisError("AI_DECISION_JSON_INVALID", `ai-analysis-decisions.json is not pure valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const root = object(parsed); const findings: DecisionFinding[] = [];
  if (root.schemaVersion !== AI_DECISION_SCHEMA_VERSION) finding(findings, "AI_DECISION_SCHEMA_INVALID", "schemaVersion", null, AI_DECISION_SCHEMA_VERSION, root.schemaVersion, "Decision schemaVersion is invalid.");
  if (root.runId !== expected.runId) finding(findings, "AI_DECISION_SCHEMA_INVALID", "runId", null, expected.runId, root.runId, "Decision runId does not match the Canonical Run.");
  if (root.sourceSha256 !== expected.sourceSha256) finding(findings, "AI_DECISION_SOURCE_HASH_MISMATCH", "sourceSha256", null, expected.sourceSha256, root.sourceSha256, "Decision source hash does not match the verified input.");
  if (root.rulesSnapshotId !== expected.rulesSnapshotId) finding(findings, "AI_DECISION_RULES_SNAPSHOT_MISMATCH", "rulesSnapshotId", null, expected.rulesSnapshotId, root.rulesSnapshotId, "Decision rules snapshot does not match this Run.");
  if (root.expectedRecordCount !== expected.recordCount) finding(findings, "AI_DECISION_COUNT_MISMATCH", "expectedRecordCount", null, expected.recordCount, root.expectedRecordCount, "Decision expected count does not match this Run.");
  const rawDecisions = Array.isArray(root.decisions) ? root.decisions : [];
  if (!Array.isArray(root.decisions)) finding(findings, "AI_DECISION_SCHEMA_INVALID", "decisions", null, "array", typeof root.decisions, "decisions must be an array.");
  if (rawDecisions.length !== expected.recordCount) finding(findings, "AI_DECISION_COUNT_MISMATCH", "decisions.length", null, expected.recordCount, rawDecisions.length, "Decision count does not match input count.");
  const catalog = new Set(expected.catalogSkillIds); const seen = new Set<number>();
  const statuses: DecisionStatus[] = ["MATCHED", "EXCLUDED", "UNKNOWN", "CATALOG_DETAIL_MISSING", "NEEDS_REVIEW"];
  const decisions = rawDecisions.map((rawDecision, outputIndex): AiDecision => {
    const item = object(rawDecision); const recordIndex = typeof item.recordIndex === "number" && Number.isInteger(item.recordIndex) ? item.recordIndex : -1;
    const status = String(item.status ?? "") as DecisionStatus; const skillIds = strings(item.skillIds); const confidence = typeof item.confidence === "number" ? item.confidence : Number.NaN;
    const positiveEvidence = strings(item.positiveEvidence); const negativeChecks = strings(item.negativeChecks); const unknownReasons = strings(item.unknownReasons); const rationale = typeof item.rationale === "string" ? item.rationale.trim() : "";
    const base = `decisions[${outputIndex}]`;
    if (recordIndex < 0 || recordIndex >= expected.recordCount) finding(findings, "AI_DECISION_INDEX_MISSING", `${base}.recordIndex`, recordIndex, `integer 0..${expected.recordCount - 1}`, item.recordIndex, "recordIndex is missing or out of range.");
    else if (seen.has(recordIndex)) finding(findings, "AI_DECISION_INDEX_DUPLICATE", `${base}.recordIndex`, recordIndex, "unique index", recordIndex, "recordIndex is duplicated."); else seen.add(recordIndex);
    if (recordIndex !== outputIndex) finding(findings, "AI_DECISION_SCHEMA_INVALID", `${base}.recordIndex`, recordIndex, outputIndex, recordIndex, "Decision order must match source order.");
    if (!statuses.includes(status)) finding(findings, "AI_DECISION_SCHEMA_INVALID", `${base}.status`, recordIndex, statuses, item.status, "Decision status is invalid.");
    for (const skillId of skillIds) if (!catalog.has(skillId)) finding(findings, "AI_DECISION_SKILL_ID_INVALID", `${base}.skillIds`, recordIndex, "exact Catalog Skill ID", skillId, `Unknown Skill ID: ${skillId}`);
    if (status === "MATCHED" && skillIds.length === 0) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${base}.skillIds`, recordIndex, ">= 1", 0, "MATCHED requires at least one Skill ID.");
    if (["EXCLUDED", "UNKNOWN"].includes(status) && skillIds.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${base}.skillIds`, recordIndex, 0, skillIds.length, `${status} must not contain Skill IDs.`);
    if (status === "UNKNOWN" && unknownReasons.length === 0) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${base}.unknownReasons`, recordIndex, ">= 1", 0, "UNKNOWN requires at least one unknown reason; negativeChecks may be empty.");
    if (status !== "UNKNOWN" && unknownReasons.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${base}.unknownReasons`, recordIndex, 0, unknownReasons.length, "unknownReasons are only valid for UNKNOWN.");
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${base}.confidence`, recordIndex, "finite 0..1", item.confidence, "confidence must be a finite value from 0 through 1.");
    if (!rationale || /^(n\/a|none|unknown|todo|placeholder)$/i.test(rationale)) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${base}.rationale`, recordIndex, "meaningful non-empty text", item.rationale, "rationale is empty or placeholder text.");
    return { recordIndex, status, skillIds, confidence, positiveEvidence, negativeChecks, unknownReasons, rationale };
  });
  for (let index = 0; index < expected.recordCount; index += 1) if (!seen.has(index)) finding(findings, "AI_DECISION_INDEX_MISSING", "decisions", index, index, null, `recordIndex ${index} is missing.`);
  const distribution = Object.fromEntries(statuses.map((status) => [status, decisions.filter((item) => item.status === status).length])) as Record<DecisionStatus, number>;
  const semanticInvalid = new Set(findings.filter((item) => item.recordIndex !== null).map((item) => item.recordIndex));
  const allUnknown = decisions.length === expected.recordCount && decisions.every((item) => item.status === "UNKNOWN");
  const allSameStatus = decisions.length > 0 && new Set(decisions.map((item) => item.status)).size === 1;
  const warnings = [...(allUnknown ? ["ALL_RECORDS_UNKNOWN"] : []), ...(allSameStatus && !allUnknown ? ["ALL_RECORDS_SAME_STATUS"] : []), ...(decisions.every((item) => item.skillIds.length === 0) ? ["ALL_SKILL_IDS_EMPTY"] : []), ...(decisions.every((item) => item.positiveEvidence.length === 0) ? ["ALL_POSITIVE_EVIDENCE_EMPTY"] : [])];
  const validation: DecisionValidation = { valid: findings.length === 0, expectedCount: expected.recordCount, actualCount: decisions.length, semanticValidCount: Math.max(0, decisions.length - semanticInvalid.size), findings, warnings, distribution, allUnknown, allSameStatus, evidenceCoverage: decisions.length ? decisions.filter((item) => item.positiveEvidence.length || item.negativeChecks.length || item.unknownReasons.length).length / decisions.length : 0, rationaleDuplicateRatio: duplicateRatio(decisions.map((item) => item.rationale)), unknownReasonDuplicateRatio: duplicateRatio(decisions.flatMap((item) => item.unknownReasons)) };
  return { document: { schemaVersion: AI_DECISION_SCHEMA_VERSION, runId: String(root.runId ?? ""), sourceSha256: String(root.sourceSha256 ?? ""), rulesSnapshotId: String(root.rulesSnapshotId ?? ""), expectedRecordCount: Number(root.expectedRecordCount), decisions }, validation };
}

export function readPublishedArtifacts(paths: CanonicalRunPaths) {
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

export function assembleCanonicalResults(compact: CompactPayload, decisions: AiDecisionDocument, rules: AiRulesSnapshot, analyzerVersion: string, requestTraceId: string | null, usage = emptyTokenUsage("actual")): AiDiffAnalysisResult[] {
  const catalog = new Map(rules.catalog.map((skill) => [skill.id, skill]));
  return decisions.decisions.map((decision, index) => {
    const source = compact.records[index]; if (!source || decision.recordIndex !== index) throw new AiAnalysisError("AI_DECISION_INDEX_MISSING", `Cannot assemble decision recordIndex ${decision.recordIndex}; expected ${index}.`);
    const candidates = decision.skillIds.map((skillId) => { const skill = catalog.get(skillId); if (!skill) throw new AiAnalysisError("AI_DECISION_SKILL_ID_INVALID", `recordIndex ${index}: ${skillId}`); return { skillId, skillName: skill.name, group: skill.group, score: Math.round(decision.confidence * 100), confidence: decision.confidence, confidenceLabel: decision.confidence >= .8 ? "High" as const : decision.confidence >= .5 ? "Medium" as const : "Low" as const, confidenceReason: decision.rationale, positiveSignals: decision.positiveEvidence, positiveEvidenceRefs: decision.positiveEvidence.length ? [source.evidenceId] : [], negativeChecks: decision.negativeChecks.map((detail, checkIndex) => ({ ruleId: `AI_CHECK_${checkIndex + 1}`, passed: false, detail, evidenceRefs: [source.evidenceId] })), negativeEvidenceRefs: decision.negativeChecks.length ? [source.evidenceId] : [], rejectedNearSkills: [], evidenceQuote: decision.positiveEvidence[0] ?? "", matchedRuleIds: [], reason: decision.rationale, status: "PENDING_REVIEW" as const, candidateStatus: (decision.status === "MATCHED" ? "MATCHED" : decision.status) as "MATCHED" | "EXCLUDED" | "CATALOG_DETAIL_MISSING" | "NEEDS_REVIEW", statusReason: decision.rationale, catalogDetailAvailable: decision.status !== "CATALOG_DETAIL_MISSING" }; });
    return { resultId: `result_${sha256(`${source.sourceRecordStableId}:${rules.snapshotId ?? rules.ruleSetId}`).slice(0, 20)}`, sourceDiffId: source.sourceRecordStableId, sourceContentHash: source.sourceContentHash, evidenceRefs: [source.evidenceId], recordIndex: index, sourceRecordStableId: source.sourceRecordStableId, activityEventId: source.activityEventId, evidenceId: source.evidenceId, classificationStatus: decision.status, reviewStatus: "PENDING_REVIEW", reviewAttention: ["CATALOG_DETAIL_MISSING", "NEEDS_REVIEW"].includes(decision.status) ? "NEEDS_REVIEW" : "STANDARD_REVIEW", dispositionReason: decision.rationale, exclusionReason: decision.status === "EXCLUDED" ? decision.rationale : null, unknownReason: decision.status === "UNKNOWN" ? decision.unknownReasons.join("; ") : null, reviewReason: decision.status === "NEEDS_REVIEW" ? decision.rationale : null, matchedRuleIds: [], negativeChecks: decision.negativeChecks.map((detail, checkIndex) => ({ ruleId: `AI_CHECK_${checkIndex + 1}`, passed: false, detail, evidenceRefs: [source.evidenceId] })), candidates, status: decision.status === "UNKNOWN" ? "UNKNOWN" : decision.status === "EXCLUDED" ? "EXCLUDED" : decision.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "PENDING_REVIEW", analyzerVersion, requestTraceId, usage, rawResultAvailable: true, reviewNote: "", reviewedAt: null };
  });
}

export function atomicWriteCanonical(filePath: string, value: unknown) { const target = contained(path.dirname(filePath), filePath, true); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; const text = stableJson(value) + "\n"; fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, target); return { filePath: target, sizeBytes: Buffer.byteLength(text), sha256: sha256(text) }; }

export function warningPersistenceGate(input: { structuralValidationPassed: boolean; warnings: string[]; acceptedWarnings?: string[] }) { const accepted = new Set(input.acceptedWarnings ?? []); const pending = input.warnings.filter((warning) => !accepted.has(warning)); return { sqliteEligible: input.structuralValidationPassed && pending.length === 0, requiresHumanAcceptance: input.structuralValidationPassed && pending.length > 0, pendingWarnings: pending, acceptedWarnings: [...accepted] }; }

export function buildCompletionManifest(input: { run: AiAnalysisRun; paths: CanonicalRunPaths; validation: DecisionValidation; decisionSha256: string; canonicalResultSha256: string; canonicalCount: number; sqliteEligible: boolean }) { return { schemaVersion: "ai-analysis-completion-manifest-v1", runId: input.run.runId, decisionFile: "ai-output/ai-analysis-decisions.json", reportFile: "ai-output/analysis-report.md", finalAssistantMessageFile: "ai-output/final-assistant-message.txt", canonicalResultFile: "canonical-output/analysis-result.json", expectedRecordCount: input.validation.expectedCount, actualDecisionCount: input.validation.actualCount, actualCanonicalCount: input.canonicalCount, decisionSha256: input.decisionSha256, canonicalResultSha256: input.canonicalResultSha256, schemaValidationPassed: input.validation.valid, semanticValidationPassed: input.validation.valid, warnings: input.validation.warnings, finalStatus: input.validation.warnings.length ? "completed_with_warnings" : "completed", sqliteEligible: input.sqliteEligible, generatedAt: new Date().toISOString() }; }