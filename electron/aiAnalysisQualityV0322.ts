import type { AiDecision } from "./aiAnalysisDecisionContractV0322.js";

export const QUALITY_CONTRACT_VERSION = "jaa-ai-analysis-quality-v1" as const;
export const QUALITY_THRESHOLDS = { exactDuplicateRatioWarning: 0.5, excessiveSkillFindingWarning: 5 } as const;
export type QualityStatus = "PASSED" | "WARNING" | "BLOCKED" | "LEGACY_UNVERIFIED";
export type RatioMetric = { numerator: number; denominator: number; ratio: number; normalization: "trim-lowercase"; excludedCases: string[] };
export type QualityReport = { contractVersion: typeof QUALITY_CONTRACT_VERSION; status: QualityStatus; metrics: { evidenceExplanationExactDuplicateRatio: RatioMetric; skillRationaleExactDuplicateRatio: RatioMetric; unknownReasonExactDuplicateRatio: RatioMetric; multiSkillRecordCount: number; multiSkillMissingIndependentFindingCount: number; excessiveSkillFindingCount: number; maxSkillFindings: number; untraceableEvidenceQuoteCount: number; genericEvidenceExplanationCount: number; legacyUnverifiedRecordCount: number }; warnings: string[]; blockers: string[]; sqliteGate: "ELIGIBLE" | "REQUIRES_MANUAL_ACCEPTANCE" | "BLOCKED" };

function ratio(values: string[]): RatioMetric {
  const normalized = values.map((value) => value.trim().toLocaleLowerCase("en-US")).filter(Boolean); const duplicates = normalized.length - new Set(normalized).size;
  return { numerator: Math.max(0, duplicates), denominator: normalized.length, ratio: normalized.length ? duplicates / normalized.length : 0, normalization: "trim-lowercase", excludedCases: ["empty strings"] };
}

export function evaluateDecisionQuality(decisions: AiDecision[], options: { untraceableEvidenceQuoteCount?: number; legacy?: boolean } = {}): QualityReport {
  const findings = decisions.flatMap((decision) => decision.skillFindings); const explanationRatio = ratio(findings.map((finding) => finding.evidenceExplanation)); const rationaleRatio = ratio(findings.map((finding) => finding.rationale)); const unknownRatio = ratio(decisions.flatMap((decision) => decision.unknownReasons));
  const multiSkill = decisions.filter((decision) => decision.skillFindings.length > 1); const missingIndependent = multiSkill.filter((decision) => decision.skillFindings.some((finding) => !finding.evidenceQuotes.length || !finding.evidenceExplanation || !finding.rationale || !Array.isArray(finding.negativeChecks))).length;
  const excessive = decisions.filter((decision) => decision.skillFindings.length > QUALITY_THRESHOLDS.excessiveSkillFindingWarning).length; const generic = findings.filter((finding) => /^(matches? the skill|relevant evidence|符合技能|有相關證據)[。. ]*$/i.test(finding.evidenceExplanation.trim())).length; const untraceable = options.untraceableEvidenceQuoteCount ?? 0;
  const metrics = { evidenceExplanationExactDuplicateRatio: explanationRatio, skillRationaleExactDuplicateRatio: rationaleRatio, unknownReasonExactDuplicateRatio: unknownRatio, multiSkillRecordCount: multiSkill.length, multiSkillMissingIndependentFindingCount: missingIndependent, excessiveSkillFindingCount: excessive, maxSkillFindings: Math.max(0, ...decisions.map((decision) => decision.skillFindings.length)), untraceableEvidenceQuoteCount: untraceable, genericEvidenceExplanationCount: generic, legacyUnverifiedRecordCount: options.legacy ? decisions.length : 0 };
  if (options.legacy) return { contractVersion: QUALITY_CONTRACT_VERSION, status: "LEGACY_UNVERIFIED", metrics, warnings: ["LEGACY_DECISION_V2_UNVERIFIED"], blockers: [], sqliteGate: "BLOCKED" };
  const blockers = [...(missingIndependent ? ["MULTI_SKILL_INDEPENDENT_FINDING_MISSING"] : []), ...(untraceable ? ["UNTRACEABLE_EVIDENCE_QUOTE"] : [])];
  const warnings = [...(explanationRatio.ratio > QUALITY_THRESHOLDS.exactDuplicateRatioWarning ? ["EVIDENCE_EXPLANATION_EXACT_DUPLICATE_RATIO"] : []), ...(rationaleRatio.ratio > QUALITY_THRESHOLDS.exactDuplicateRatioWarning ? ["SKILL_RATIONALE_EXACT_DUPLICATE_RATIO"] : []), ...(unknownRatio.ratio > QUALITY_THRESHOLDS.exactDuplicateRatioWarning ? ["UNKNOWN_REASON_EXACT_DUPLICATE_RATIO"] : []), ...(excessive ? ["EXCESSIVE_SKILL_FINDING_COUNT"] : []), ...(generic ? ["GENERIC_EVIDENCE_EXPLANATION"] : [])];
  const status: QualityStatus = blockers.length ? "BLOCKED" : warnings.length ? "WARNING" : "PASSED";
  return { contractVersion: QUALITY_CONTRACT_VERSION, status, metrics, warnings, blockers, sqliteGate: status === "PASSED" ? "ELIGIBLE" : status === "WARNING" ? "REQUIRES_MANUAL_ACCEPTANCE" : "BLOCKED" };
}

export function sqliteQualityGate(report: QualityReport, acceptance?: { accepted: boolean; canonicalSha256: string; runId: string; acceptedAt: string }) {
  if (report.status === "PASSED") return { eligible: true, reason: "QUALITY_PASSED" };
  if (report.status === "WARNING" && acceptance?.accepted) return { eligible: true, reason: "QUALITY_WARNING_DURABLY_ACCEPTED", acceptance };
  return { eligible: false, reason: report.status === "WARNING" ? "QUALITY_WARNING_ACCEPTANCE_REQUIRED" : "QUALITY_BLOCKED" };
}
