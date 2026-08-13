import type { AiCandidateClassificationStatus, AiClassificationStatus, AiSemanticFinding } from "../shared/aiAnalysisContract.js";

export const CANONICAL_RESPONSE_CONTRACT_VERSION = "ai-analysis-response-v0.3.14" as const;
export const RECORD_SEMANTIC_POLICY = {
  MATCHED: { analyses: "required", recordChecks: "optional" },
  EXCLUDED: { analyses: "forbidden", recordChecks: "required" },
  UNKNOWN: { analyses: "forbidden", recordChecks: "optional" },
  CATALOG_DETAIL_MISSING: { analyses: "required", recordChecks: "candidate-audit" },
  NEEDS_REVIEW: { analyses: "conditional", recordChecks: "audit-trail" }
} as const;
export const CANDIDATE_SEMANTIC_POLICY = {
  MATCHED: { checks: "optional", positiveEvidence: "required" },
  EXCLUDED: { checks: "required", positiveEvidence: "optional" },
  CATALOG_DETAIL_MISSING: { checks: "failed-catalog-detail", positiveEvidence: "required" },
  NEEDS_REVIEW: { checks: "audit-trail", positiveEvidence: "conditional" }
} as const;

const recordStatuses = Object.keys(RECORD_SEMANTIC_POLICY) as AiClassificationStatus[];
const candidateStatuses = Object.keys(CANDIDATE_SEMANTIC_POLICY) as AiCandidateClassificationStatus[];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const pointer = (path: string) => `/${path.replace(/\[(\d+)\]/g, "/$1").replace(/\./g, "/")}`;

export function validateCanonicalResponseSemantics(value: unknown): { valid: boolean; findings: AiSemanticFinding[]; semanticValidRecordCount: number } {
  const records = array(object(value).records);
  const findings: AiSemanticFinding[] = [];
  let semanticValidRecordCount = 0;
  const add = (recordIndex: number, record: Record<string, unknown>, path: string, code: AiSemanticFinding["code"], message: string, expected: unknown, actual: unknown, candidateIndex: number | null = null, skillId: string | null = null, ruleId: string | null = null) => findings.push({
    code, severity: "error", path, jsonPath: `$.${path}`, jsonPointer: pointer(path), recordIndex,
    sourceRecordStableId: text(record.sourceRecordStableId) || null, candidateIndex, skillId, message, expected, actual, ruleId
  });

  records.forEach((raw, index) => {
    const record = object(raw);
    const start = findings.length;
    const status = String(record.classificationStatus) as AiClassificationStatus;
    const analyses = array(record.analyses);
    const checks = array(record.negativeChecks);
    const recordPath = `records[${index}]`;
    if (!recordStatuses.includes(status)) add(index, record, `${recordPath}.classificationStatus`, "SEMANTIC_STATUS_INVALID", "Unsupported classification status.", recordStatuses, status);
    if (status === "MATCHED") {
      if (analyses.length === 0) add(index, record, `${recordPath}.analyses`, "SEMANTIC_CANDIDATE_REQUIRED", "MATCHED requires at least one candidate.", ">= 1", 0);
      if (!analyses.some((item) => object(item).candidateStatus === "MATCHED")) add(index, record, `${recordPath}.analyses`, "SEMANTIC_CANDIDATE_REQUIRED", "MATCHED requires at least one MATCHED candidate.", "candidateStatus=MATCHED", analyses.map((item) => object(item).candidateStatus));
      if (array(record.matchedRuleIds).length === 0) add(index, record, `${recordPath}.matchedRuleIds`, "SEMANTIC_MATCHED_RULE_REQUIRED", "MATCHED requires at least one matched rule.", ">= 1", 0);
    }
    if (["EXCLUDED", "UNKNOWN"].includes(status) && analyses.length !== 0) add(index, record, `${recordPath}.analyses`, "SEMANTIC_CANDIDATE_FORBIDDEN", `${status} must not contain candidates.`, 0, analyses.length);
    if (status === "EXCLUDED" && checks.length === 0) add(index, record, `${recordPath}.negativeChecks`, "SEMANTIC_NEGATIVE_CHECK_REQUIRED", `${recordPath}.negativeChecks is empty for EXCLUDED status.`, ">= 1", 0);
    if (status === "EXCLUDED" && !text(record.exclusionReason)) add(index, record, `${recordPath}.exclusionReason`, "SEMANTIC_REASON_REQUIRED", "EXCLUDED requires exclusionReason.", "non-empty string", record.exclusionReason ?? null);
    if (status === "UNKNOWN" && !text(record.unknownReason)) add(index, record, `${recordPath}.unknownReason`, "SEMANTIC_REASON_REQUIRED", "UNKNOWN requires unknownReason.", "non-empty string", record.unknownReason ?? null);
    if (status === "CATALOG_DETAIL_MISSING") {
      if (analyses.length === 0) add(index, record, `${recordPath}.analyses`, "SEMANTIC_CATALOG_CANDIDATE_LOST", `${recordPath} lost CATALOG_DETAIL_MISSING candidates.`, ">= 1", 0);
      if (record.reviewAttention !== "NEEDS_REVIEW") add(index, record, `${recordPath}.reviewAttention`, "SEMANTIC_REVIEW_ATTENTION_REQUIRED", "CATALOG_DETAIL_MISSING requires NEEDS_REVIEW attention.", "NEEDS_REVIEW", record.reviewAttention ?? null);
    }
    if (status === "NEEDS_REVIEW" && !text(record.reviewReason ?? record.dispositionReason)) add(index, record, `${recordPath}.reviewReason`, "SEMANTIC_REVIEW_REASON_REQUIRED", "NEEDS_REVIEW requires a review reason.", "non-empty string", record.reviewReason ?? null);

    analyses.forEach((rawCandidate, candidateIndex) => {
      const candidate = object(rawCandidate);
      const candidateStatus = String(candidate.candidateStatus) as AiCandidateClassificationStatus;
      const candidateChecks = array(candidate.negativeChecks);
      const positiveRefs = array(candidate.positiveEvidenceRefs);
      const candidatePath = `${recordPath}.analyses[${candidateIndex}]`;
      const skillId = text(candidate.skillId) || null;
      if (!skillId) add(index, record, `${candidatePath}.skillId`, "SEMANTIC_CANDIDATE_ID_REQUIRED", "Candidate requires an exact Catalog Skill ID.", "non-empty string", candidate.skillId ?? null, candidateIndex, skillId);
      if (!candidateStatuses.includes(candidateStatus)) add(index, record, `${candidatePath}.candidateStatus`, "SEMANTIC_CANDIDATE_STATUS_INVALID", "Unsupported candidate status.", candidateStatuses, candidate.candidateStatus ?? null, candidateIndex, skillId);
      if (candidateStatus === "MATCHED" && positiveRefs.length === 0) add(index, record, `${candidatePath}.positiveEvidenceRefs`, "SEMANTIC_POSITIVE_EVIDENCE_REQUIRED", "MATCHED candidate requires positive evidence.", ">= 1", 0, candidateIndex, skillId);
      if (candidateStatus === "EXCLUDED" && candidateChecks.length === 0) add(index, record, `${candidatePath}.negativeChecks`, "SEMANTIC_NEGATIVE_CHECK_REQUIRED", "EXCLUDED candidate requires an exclusion audit check.", ">= 1", 0, candidateIndex, skillId);
      if (candidateStatus === "CATALOG_DETAIL_MISSING") {
        const catalogCheck = candidateChecks.find((item) => { const check = object(item); return /CATALOG.*DETAIL/i.test(String(check.ruleId ?? "")) && check.passed === false; });
        if (!catalogCheck) add(index, record, `${candidatePath}.negativeChecks`, "SEMANTIC_CATALOG_CHECK_REQUIRED", `${candidatePath}.negativeChecks requires a failed Catalog detail audit check.`, "failed CATALOG_DETAIL check", candidateChecks, candidateIndex, skillId, "CATALOG_DETAIL_REQUIRED");
        if (candidate.catalogDetailAvailable !== false) add(index, record, `${candidatePath}.catalogDetailAvailable`, "SEMANTIC_CATALOG_DETAIL_FLAG_INVALID", "CATALOG_DETAIL_MISSING requires catalogDetailAvailable=false.", false, candidate.catalogDetailAvailable ?? null, candidateIndex, skillId, "CATALOG_DETAIL_REQUIRED");
        if (positiveRefs.length === 0) add(index, record, `${candidatePath}.positiveEvidenceRefs`, "SEMANTIC_POSITIVE_EVIDENCE_REQUIRED", "CATALOG_DETAIL_MISSING must preserve candidate evidence.", ">= 1", 0, candidateIndex, skillId);
      }
      if (candidateStatus === "NEEDS_REVIEW") {
        if (!text(candidate.statusReason ?? candidate.confidenceReason)) add(index, record, `${candidatePath}.statusReason`, "SEMANTIC_REVIEW_REASON_REQUIRED", "NEEDS_REVIEW candidate requires a reason.", "non-empty string", candidate.statusReason ?? null, candidateIndex, skillId);
        if (positiveRefs.length === 0 && candidateChecks.length === 0) add(index, record, `${candidatePath}.negativeChecks`, "SEMANTIC_AUDIT_TRAIL_REQUIRED", "NEEDS_REVIEW candidate requires evidence or an audit check.", "positive evidence or negative check", { positiveEvidenceRefs: positiveRefs.length, negativeChecks: candidateChecks.length }, candidateIndex, skillId);
      }
    });
    if (findings.length === start) semanticValidRecordCount += 1;
  });
  return { valid: findings.length === 0, findings, semanticValidRecordCount };
}