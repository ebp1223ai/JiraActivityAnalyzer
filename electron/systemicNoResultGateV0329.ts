import crypto from "node:crypto";

export const SYSTEMIC_NO_RESULT_GATE_VERSION_V0329 = "jaa-systemic-no-result-gate-v1" as const;
type Decision = { status?: string; rationale?: string; unknownReasons?: string[]; recordNegativeChecks?: string[]; skillFindings?: Array<{ evidenceQuotes?: unknown[]; evidenceQuoteIds?: unknown[] }> };
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.trim().toLowerCase().replace(/(?:record|index|序號|記錄)\s*#?\s*\d+/giu, "record").replace(/\b\d+\b/g, "#").replace(/\s+/g, " ");
function duplicateRatio(values: string[], normalizer = (value: string) => value.trim()) { if (!values.length) return 0; const normalized = values.map(normalizer); return (normalized.length - new Set(normalized).size) / normalized.length; }

export function evaluateSystemicNoResultGateV0329(decisions: Decision[], inputHashes: Record<string, string | null> = {}) {
  const expectedRecordCount = decisions.length;
  const count = (status: string) => decisions.filter((item) => item.status === status).length;
  const skillFindingCount = decisions.reduce((sum, item) => sum + (item.skillFindings?.length ?? 0), 0);
  const recordsWithSkillFindings = decisions.filter((item) => (item.skillFindings?.length ?? 0) > 0).length;
  const recordsWithQuoteUsage = decisions.filter((item) => item.skillFindings?.some((finding) => (finding.evidenceQuotes?.length ?? finding.evidenceQuoteIds?.length ?? 0) > 0)).length;
  const rationales = decisions.map((item) => item.rationale ?? "");
  const unknownReasons = decisions.flatMap((item) => item.unknownReasons ?? []);
  const negativeChecks = decisions.map((item) => JSON.stringify(item.recordNegativeChecks ?? []));
  const normalizedRationaleDuplicateRatio = duplicateRatio(rationales, normalize);
  const unknownReasonExactDuplicateRatio = duplicateRatio(unknownReasons, normalize);
  const recordNegativeCheckDuplicateRatio = duplicateRatio(negativeChecks, normalize);
  const systemicUnknownDuplicateRatio = Math.max(normalizedRationaleDuplicateRatio, unknownReasonExactDuplicateRatio);
  const systemicContractReasonMatchCount = [...rationales, ...unknownReasons].filter((value) => /quote|evidence|證據|引文|contract|契約/i.test(value)).length;
  const metrics = { expectedRecordCount, classifiedCount: count("CLASSIFIED"), catalogDetailMissingCount: count("CATALOG_DETAIL_MISSING"), unknownCount: count("UNKNOWN"), excludedCount: count("EXCLUDED"), failedCount: count("FAILED"), skillFindingCount, recordsWithSkillFindings, recordsWithQuoteUsage, normalizedRationaleDuplicateRatio, unknownReasonExactDuplicateRatio, recordNegativeCheckDuplicateRatio, systemicContractReasonMatchCount, systemicUnknownDuplicateRatio };
  let decision: "PASS" | "WARNING_REVIEW" | "BLOCKED" = "PASS"; let reasonCode: string | null = null;
  if (metrics.failedCount === expectedRecordCount && skillFindingCount === 0 && expectedRecordCount > 0) { decision = "BLOCKED"; reasonCode = "AI_SYSTEMIC_ALL_FAILED_RESULT"; }
  else if (metrics.unknownCount === expectedRecordCount && skillFindingCount === 0 && expectedRecordCount > 0 && systemicUnknownDuplicateRatio >= 0.9) { decision = "BLOCKED"; reasonCode = "AI_SYSTEMIC_GENERIC_UNKNOWN_RESULT"; }
  else if (metrics.unknownCount === expectedRecordCount && skillFindingCount === 0 && expectedRecordCount > 0) { decision = "WARNING_REVIEW"; reasonCode = "AI_SYSTEMIC_ALL_UNKNOWN_REVIEW_REQUIRED"; }
  const report = { schemaVersion: SYSTEMIC_NO_RESULT_GATE_VERSION_V0329, threshold: 0.9, decision, reasonCode, formalAllowed: decision !== "BLOCKED", diagnosticAllowed: true, activeResultAllowed: decision === "PASS", sqliteAllowed: decision === "PASS", metrics, inputHashes, evaluatedAtUtc: new Date().toISOString() };
  return { ...report, reportSha256: sha256(JSON.stringify(report)) };
}
