import crypto from "node:crypto";
import type { AiCatalogEntry } from "../shared/aiAnalysisContract.js";
import type { DecisionValidationV0324, ValidationFindingV0324 } from "./aiAnalysisDecisionContractV0324.js";
import type { DecisionV0326 } from "./aiAnalysisDecisionContractV0326.js";
import type { EvidenceQuoteCatalog, EvidenceQuoteCatalogEntry } from "./evidenceQuoteCatalogV0326.js";

export const QUALITY_CONTRACT_VERSION_V0333 = "jaa-ai-analysis-quality-v4" as const;
export const MULTI_SKILL_COVERAGE_VERSION_V0333 = "jaa-multi-skill-evidence-coverage-v2" as const;
export const MODEL_PROSE_DUPLICATE_THRESHOLD_V0333 = 0.5;

export type QualityFindingV0333 = ValidationFindingV0324 & {
  fieldName?: string;
  jsonPointers?: string[];
  fingerprint?: string;
  affectedRecordIndexes?: number[];
  affectedSkillIds?: string[];
  duplicateCount?: number;
  population?: number;
  actualRatio?: number;
  threshold?: number;
  representativeProse?: string;
  evidenceQuoteIds?: string[];
  quoteIdentityKeyHashes?: string[];
  sharedUsers?: string[];
  comparisonFields?: string[];
};

export type QualityReportV0333 = {
  contractVersion: typeof QUALITY_CONTRACT_VERSION_V0333;
  multiSkillCoverageVersion: typeof MULTI_SKILL_COVERAGE_VERSION_V0333;
  status: "PASSED" | "WARNING" | "BLOCKED";
  warnings: string[];
  blockers: string[];
  metrics: Record<string, number>;
  findings: QualityFindingV0333[];
  sqliteGate: "ELIGIBLE" | "REQUIRES_MANUAL_ACCEPTANCE" | "BLOCKED";
};

type ModelText = { fieldName: string; pointer: string; value: string; recordIndex: number; sourceRecordStableId: string | null; skillId: string | null };
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const unique = <T>(values: T[]) => [...new Set(values)];
const proseSkeleton = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("zh-TW")
  .replace(/eq_[a-f0-9]{32}/gi, "<quote>")
  .replace(/\b(?:[a-z][a-z0-9]+_\d{3}|record|skill)[-_ ]?\d+\b/gi, "<id>")
  .replace(/\b\d+(?:\.\d+)?\b/g, "<n>")
  .replace(/\s+/g, " ");
const shortened = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 180);

export const quoteIdentityKeyV0333 = (quote: EvidenceQuoteCatalogEntry) => [
  quote.sourceRecordStableId,
  quote.sourceJsonPointer,
  quote.rawStartOffset,
  quote.rawEndOffset,
  quote.quoteSha256
].join("\u001f");

const exactProse = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("zh-TW").replace(/\s+/g, " ");
type DuplicateModeV0333 = "EXACT" | "BOILERPLATE";
function duplicateFinding(fieldName: string, values: ModelText[], mode: DuplicateModeV0333): { ratio: number; finding: QualityFindingV0333 | null } {
  const populated = values.filter((item) => item.value.trim()).map((item) => ({ ...item, fingerprintText: mode === "EXACT" ? exactProse(item.value) : proseSkeleton(item.value) }));
  if (!populated.length) return { ratio: 0, finding: null };
  const groups = new Map<string, typeof populated>();
  for (const item of populated) groups.set(item.fingerprintText, [...(groups.get(item.fingerprintText) ?? []), item]);
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const duplicateCount = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
  const ratio = duplicateCount / populated.length;
  if (ratio <= MODEL_PROSE_DUPLICATE_THRESHOLD_V0333) return { ratio, finding: null };
  const largest = duplicateGroups.sort((a, b) => b.length - a.length)[0] ?? [];
  const fingerprint = sha256(largest[0]?.fingerprintText ?? fieldName + ":" + ratio);
  const exact = mode === "EXACT";
  return {
    ratio,
    finding: {
      code: exact ? "MODEL_PROSE_EXACT_DUPLICATE_RATIO_HIGH" : "MODEL_PROSE_BOILERPLATE_PATTERN",
      severity: "WARNING",
      stage: "QUALITY_GATE",
      recordIndex: largest[0]?.recordIndex ?? null,
      sourceRecordStableId: largest[0]?.sourceRecordStableId ?? null,
      skillId: largest[0]?.skillId ?? null,
      evidenceSegmentId: null,
      jsonPointer: largest[0]?.pointer ?? "/records",
      expected: (exact ? "exactDuplicateRatio" : "boilerplateRatio") + " <= " + MODEL_PROSE_DUPLICATE_THRESHOLD_V0333,
      observed: ratio,
      message: "模型撰寫欄位 " + fieldName + (exact ? " 的精確重複率" : " 的模板骨架重複率") + " 超過 0.50，SQLite 必須等待人工接受。",
      fieldName,
      jsonPointers: largest.map((item) => item.pointer),
      fingerprint,
      affectedRecordIndexes: unique(largest.map((item) => item.recordIndex)).sort((a, b) => a - b),
      affectedSkillIds: unique(largest.flatMap((item) => item.skillId ? [item.skillId] : [])),
      duplicateCount,
      population: populated.length,
      actualRatio: ratio,
      threshold: MODEL_PROSE_DUPLICATE_THRESHOLD_V0333,
      representativeProse: shortened(largest[0]?.value ?? "")
    }
  };
}

function skillProse(decision: DecisionV0326, skillIndex: number) {
  const skill = decision.skillFindings[skillIndex];
  return proseSkeleton([skill.evidenceExplanation, ...skill.negativeChecks, skill.rationale].join("\n"));
}

export function evaluateDecisionQualityV0333(input: {
  decisions: DecisionV0326[];
  quoteCatalog: EvidenceQuoteCatalog;
  catalog: AiCatalogEntry[];
  legacyValidation?: DecisionValidationV0324;
}): QualityReportV0333 {
  const findings: QualityFindingV0333[] = [];
  const quoteMap = new Map(input.quoteCatalog.entries.map((quote) => [quote.evidenceQuoteId, quote]));
  const catalogMap = new Map(input.catalog.map((skill) => [skill.id, skill]));
  const modelTexts: ModelText[] = [];
  let multiSkillRecordCount = 0;
  let sharedPrimaryQuoteRecordCount = 0;
  let independentPrimaryQuoteSkillCount = 0;
  let missingPrimaryQuoteSkillCount = 0;

  for (const decision of input.decisions) {
    const stableId = input.quoteCatalog.entries.find((quote) => quote.recordIndex === decision.recordIndex)?.sourceRecordStableId ?? null;
    modelTexts.push({ fieldName: "recordRationale", pointer: `/records/${decision.recordIndex}/rationale`, value: decision.rationale, recordIndex: decision.recordIndex, sourceRecordStableId: stableId, skillId: null });
    decision.recordNegativeChecks.forEach((value, index) => modelTexts.push({ fieldName: "recordNegativeChecks", pointer: `/records/${decision.recordIndex}/recordNegativeChecks/${index}`, value, recordIndex: decision.recordIndex, sourceRecordStableId: stableId, skillId: null }));
    decision.unknownReasons.forEach((value, index) => modelTexts.push({ fieldName: "unknownReasons", pointer: `/records/${decision.recordIndex}/unknownReasons/${index}`, value, recordIndex: decision.recordIndex, sourceRecordStableId: stableId, skillId: null }));

    decision.skillFindings.forEach((skill, skillIndex) => {
      const base = `/records/${decision.recordIndex}/skillFindings/${skillIndex}`;
      modelTexts.push({ fieldName: "evidenceExplanation", pointer: `${base}/evidenceExplanation`, value: skill.evidenceExplanation, recordIndex: decision.recordIndex, sourceRecordStableId: stableId, skillId: skill.skillId });
      modelTexts.push({ fieldName: "skillRationale", pointer: `${base}/rationale`, value: skill.rationale, recordIndex: decision.recordIndex, sourceRecordStableId: stableId, skillId: skill.skillId });
      skill.negativeChecks.forEach((value, index) => modelTexts.push({ fieldName: "skillNegativeChecks", pointer: `${base}/negativeChecks/${index}`, value, recordIndex: decision.recordIndex, sourceRecordStableId: stableId, skillId: skill.skillId }));
      const catalogSkill = catalogMap.get(skill.skillId);
      if (decision.status === "CLASSIFIED" && (!catalogSkill || catalogSkill.catalogStatus === "review-draft" && !catalogSkill.detailDescription?.trim())) findings.push({
        code: "CATALOG_DETAIL_STATUS_MISMATCH", severity: "ERROR", stage: "QUALITY_GATE", recordIndex: decision.recordIndex,
        sourceRecordStableId: stableId, skillId: skill.skillId, evidenceSegmentId: null, jsonPointer: `/records/${decision.recordIndex}/status`,
        expected: "CATALOG_DETAIL_MISSING when any retained Skill lacks required Catalog detail", observed: decision.status,
        message: "保留的 Skill 缺少正式 Catalog Detail，模型不得標記為 CLASSIFIED；Host 不會改寫原始狀態。"
      });
    });

    if (decision.skillFindings.length <= 1) continue;
    multiSkillRecordCount += 1;
    const owners = new Map<string, number[]>();
    const keysBySkill = decision.skillFindings.map((skill, skillIndex) => {
      const keys = unique(skill.evidenceQuoteIds.map((id) => quoteMap.get(id)).filter((quote): quote is EvidenceQuoteCatalogEntry => Boolean(quote && quote.recordIndex === decision.recordIndex && quote.evidenceRoleEligibility.includes("PRIMARY_CHANGE"))).map(quoteIdentityKeyV0333));
      keys.forEach((key) => owners.set(key, [...(owners.get(key) ?? []), skillIndex]));
      return keys;
    });
    keysBySkill.forEach((keys, skillIndex) => {
      const skill = decision.skillFindings[skillIndex];
      if (!keys.length) {
        missingPrimaryQuoteSkillCount += 1;
        findings.push({
          code: "MULTI_SKILL_PRIMARY_CHANGE_QUOTE_MISSING",
          severity: "ERROR",
          stage: "QUALITY_GATE",
          recordIndex: decision.recordIndex,
          sourceRecordStableId: stableId,
          skillId: skill.skillId,
          evidenceSegmentId: null,
          jsonPointer: "/records/" + decision.recordIndex + "/skillFindings/" + skillIndex + "/evidenceQuoteIds",
          expected: "at least one PRIMARY_CHANGE eligible QuoteIdentityKey",
          observed: "no valid PRIMARY_CHANGE QuoteIdentityKey",
          message: "Multi-skill Record 中的每個 Skill 都必須有至少一個 PRIMARY_CHANGE 來源片段；Host 不會自動刪除或改寫 Skill。",
          evidenceQuoteIds: skill.evidenceQuoteIds,
          quoteIdentityKeyHashes: []
        });
      }
      if (keys.some((key) => (owners.get(key)?.length ?? 0) === 1)) independentPrimaryQuoteSkillCount += 1;
    });
    const sharedKeys = [...owners.entries()].filter(([, users]) => users.length > 1);
    if (!sharedKeys.length) continue;
    sharedPrimaryQuoteRecordCount += 1;
    for (const [key, userIndexes] of sharedKeys) {
      const prose = userIndexes.map((index) => skillProse(decision, index));
      const indistinguishable = new Set(prose).size < prose.length;
      for (const skillIndex of userIndexes) {
        const skill = decision.skillFindings[skillIndex];
        const keyHash = sha256(key);
        findings.push({
          code: indistinguishable ? "MULTI_SKILL_SHARED_QUOTE_UNDISTINGUISHED" : "MULTI_SKILL_SHARED_PRIMARY_QUOTE_REVIEW",
          severity: indistinguishable ? "ERROR" : "WARNING",
          stage: "QUALITY_GATE",
          recordIndex: decision.recordIndex,
          sourceRecordStableId: stableId,
          skillId: skill.skillId,
          evidenceSegmentId: null,
          jsonPointer: `/records/${decision.recordIndex}/skillFindings/${skillIndex}/evidenceQuoteIds`,
          expected: "shared PRIMARY_CHANGE Quote must have distinct, skill-specific model prose",
          observed: indistinguishable ? "shared Quote and indistinguishable Skill prose" : "shared Quote with distinguishable Skill prose; review required",
          message: indistinguishable ? "多個 Skill 共用同一來源片段，且模型說明無法區分技術面向。" : "多個 Skill 共用同一 PRIMARY_CHANGE 來源片段；說明可區分，但需人工複核。",
          evidenceQuoteIds: skill.evidenceQuoteIds.filter((id) => {
            const quote = quoteMap.get(id);
            return Boolean(quote && quoteIdentityKeyV0333(quote) === key);
          }),
          quoteIdentityKeyHashes: [keyHash],
          sharedUsers: userIndexes.map((index) => decision.skillFindings[index].skillId),
          comparisonFields: ["evidenceExplanation", "negativeChecks", "rationale"],
          fingerprint: sha256(prose[skillIndex === userIndexes[0] ? 0 : userIndexes.indexOf(skillIndex)])
        });
      }
    }
  }

  const ratios: Record<string, number> = {};
  for (const fieldName of unique(modelTexts.map((item) => item.fieldName))) {
    const fieldValues = modelTexts.filter((item) => item.fieldName === fieldName);
    const exact = duplicateFinding(fieldName, fieldValues, "EXACT");
    const boilerplate = duplicateFinding(fieldName, fieldValues, "BOILERPLATE");
    ratios[fieldName + "ExactDuplicateRatio"] = exact.ratio;
    ratios[fieldName + "BoilerplateRatio"] = boilerplate.ratio;
    if (exact.finding) findings.push(exact.finding);
    if (boilerplate.finding) findings.push(boilerplate.finding);
  }
  const legacyErrors = input.legacyValidation?.findings.filter((finding) => finding.severity === "ERROR").map((finding) => finding.code) ?? [];
  const blockers = unique([...legacyErrors, ...findings.filter((finding) => finding.severity === "ERROR").map((finding) => finding.code)]);
  const warnings = unique(findings.filter((finding) => finding.severity === "WARNING").map((finding) => finding.code));
  const status = blockers.length ? "BLOCKED" : warnings.length ? "WARNING" : "PASSED";
  return {
    contractVersion: QUALITY_CONTRACT_VERSION_V0333,
    multiSkillCoverageVersion: MULTI_SKILL_COVERAGE_VERSION_V0333,
    status,
    warnings,
    blockers,
    metrics: { ...ratios, multiSkillRecordCount, sharedPrimaryQuoteRecordCount, independentPrimaryQuoteSkillCount, missingPrimaryQuoteSkillCount, qualityFindingCount: findings.length },
    findings,
    sqliteGate: status === "PASSED" ? "ELIGIBLE" : status === "WARNING" ? "REQUIRES_MANUAL_ACCEPTANCE" : "BLOCKED"
  };
}

export function sqliteQualityGateV0333(report: QualityReportV0333, acceptance?: { accepted: boolean; runId: string; findingsHash: string; acceptedAtUtc: string; auditId: string }) {
  if (report.status === "PASSED") return { eligible: true, reason: "QUALITY_PASSED", acceptance: null };
  if (report.status === "WARNING" && acceptance?.accepted) return { eligible: true, reason: "QUALITY_WARNING_DURABLY_ACCEPTED", acceptance };
  return { eligible: false, reason: report.status === "WARNING" ? "QUALITY_WARNING_ACCEPTANCE_REQUIRED" : "QUALITY_BLOCKED", acceptance: null };
}
