import crypto from "node:crypto";

export const AI_DECISION_CONTRACT_VERSION = "jaa-ai-analysis-decisions-v3" as const;
export const AI_ARTIFACT_SUBMISSION_VERSION = "jaa-analysis-artifact-submission-v3" as const;
export const AI_DECISION_CONFIDENCE_VALUES = [0, 0.3, 0.6, 0.9] as const;
export const AI_DECISION_STATUSES = ["CLASSIFIED", "UNKNOWN", "NEEDS_REVIEW", "EXCLUDED", "CATALOG_DETAIL_MISSING", "FAILED"] as const;
export const AI_DECISION_FIELDS = ["recordIndex", "status", "confidence", "skillFindings", "recordNegativeChecks", "unknownReasons", "rationale"] as const;
export const AI_SKILL_FINDING_FIELDS = ["skillId", "confidence", "evidenceQuotes", "evidenceExplanation", "negativeChecks", "rationale"] as const;

export type DecisionStatus = typeof AI_DECISION_STATUSES[number];
export type DecisionConfidence = typeof AI_DECISION_CONFIDENCE_VALUES[number];
export type EvidenceQuote = { evidenceRef: string; quote: string };
export type SkillFinding = { skillId: string; confidence: DecisionConfidence; evidenceQuotes: EvidenceQuote[]; evidenceExplanation: string; negativeChecks: string[]; rationale: string };
export type AiDecision = { recordIndex: number; status: DecisionStatus; confidence: DecisionConfidence; skillFindings: SkillFinding[]; recordNegativeChecks: string[]; unknownReasons: string[]; rationale: string };
export type DecisionFinding = { code: string; jsonPointer: string; recordIndex: number | null; status: DecisionStatus | null; expected: unknown; observed: unknown; message: string };
export type EvidenceSource = { evidenceRef: string; normalizedText: string };
export type DecisionValidation = {
  contractVersion: typeof AI_DECISION_CONTRACT_VERSION; contractSha256: string; valid: boolean; schemaValid: boolean; semanticValid: boolean;
  expectedCount: number; actualCount: number; semanticValidCount: number; decisions: AiDecision[]; findings: DecisionFinding[]; warnings: string[];
  distribution: Record<DecisionStatus, number>; derivedSkillIds: string[][]; allUnknown: boolean; allSameStatus: boolean; evidenceCoverage: number; rationaleDuplicateRatio: number; unknownReasonDuplicateRatio: number;
};
export type ValidatedDecisionDocument = { contractVersion: typeof AI_DECISION_CONTRACT_VERSION; contractSha256: string; runId: string; sourceSha256: string; rulesSnapshotId: string; expectedRecordCount: number; decisions: AiDecision[] };
type Expected = { recordCount: number; catalogSkillIds: string[]; evidenceByRecord?: Array<EvidenceSource[]> };

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const texts = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const meaningful = (value: string) => Boolean(value) && !/^(n\/a|none|unknown|todo|placeholder|same as above)$/i.test(value);
const confidence = (value: unknown): value is DecisionConfidence => typeof value === "number" && AI_DECISION_CONFIDENCE_VALUES.includes(value as DecisionConfidence);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export const stableDecisionJson = (value: unknown) => JSON.stringify(canonical(value));
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const stringArraySchema = { type: "array", items: { type: "string", minLength: 1 } } as const;
const emptyArraySchema = { type: "array", maxItems: 0 } as const;
const nonEmptyArraySchema = { type: "array", minItems: 1 } as const;

export function createDecisionArraySchema(expectedRecordCount: number) {
  if (!Number.isInteger(expectedRecordCount) || expectedRecordCount < 0) throw new Error("AI_DECISION_COUNT_MISMATCH: expectedRecordCount must be non-negative.");
  const finding = {
    type: "object", additionalProperties: false, required: [...AI_SKILL_FINDING_FIELDS],
    properties: {
      skillId: { type: "string", minLength: 1 }, confidence: { type: "number", enum: [...AI_DECISION_CONFIDENCE_VALUES] },
      evidenceQuotes: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["evidenceRef", "quote"], properties: { evidenceRef: { type: "string", minLength: 1 }, quote: { type: "string", minLength: 1 } } } },
      evidenceExplanation: { type: "string", minLength: 1 }, negativeChecks: stringArraySchema, rationale: { type: "string", minLength: 1 }
    }
  } as const;
  return {
    type: "array", minItems: expectedRecordCount, maxItems: expectedRecordCount,
    items: {
      type: "object", additionalProperties: false, required: [...AI_DECISION_FIELDS],
      properties: {
        recordIndex: { type: "integer", minimum: 0, maximum: Math.max(0, expectedRecordCount - 1) }, status: { type: "string", enum: [...AI_DECISION_STATUSES] },
        confidence: { type: "number", enum: [...AI_DECISION_CONFIDENCE_VALUES] }, skillFindings: { type: "array", items: finding },
        recordNegativeChecks: stringArraySchema, unknownReasons: stringArraySchema, rationale: { type: "string", minLength: 1 }
      },
      allOf: [
        { if: { properties: { status: { const: "CLASSIFIED" } } }, then: { properties: { skillFindings: nonEmptyArraySchema, unknownReasons: emptyArraySchema } } },
        { if: { properties: { status: { const: "CATALOG_DETAIL_MISSING" } } }, then: { properties: { skillFindings: nonEmptyArraySchema, unknownReasons: emptyArraySchema } } },
        { if: { properties: { status: { const: "UNKNOWN" } } }, then: { properties: { skillFindings: emptyArraySchema, unknownReasons: nonEmptyArraySchema } } },
        { if: { properties: { status: { enum: ["EXCLUDED", "FAILED"] } } }, then: { properties: { skillFindings: emptyArraySchema, unknownReasons: emptyArraySchema } } },
        { if: { properties: { status: { enum: ["NEEDS_REVIEW", "CLASSIFIED", "CATALOG_DETAIL_MISSING", "EXCLUDED", "FAILED"] } } }, then: { properties: { unknownReasons: emptyArraySchema } } }
      ]
    }
  } as const;
}

export function getDecisionContractDescriptor(expectedRecordCount: number) {
  const schema = createDecisionArraySchema(expectedRecordCount);
  const canonicalJson = stableDecisionJson({ schemaVersion: AI_DECISION_CONTRACT_VERSION, schema });
  return { schemaVersion: AI_DECISION_CONTRACT_VERSION, schema, canonicalJson, bytes: Buffer.byteLength(canonicalJson), sha256: sha256(canonicalJson), fields: [...AI_DECISION_FIELDS], statuses: [...AI_DECISION_STATUSES] };
}

export function createArtifactSubmissionSchema(expectedRecordCount: number) {
  return { type: "object", additionalProperties: false, required: ["schemaVersion", "runId", "sourceSha256", "rulesSnapshotId", "expectedRecordCount", "decisionContractVersion", "decisionContractSha256", "decisionsDocument", "analysisReportMarkdown", "finalSummaryTraditionalChinese"], properties: { schemaVersion: { const: AI_ARTIFACT_SUBMISSION_VERSION }, runId: { type: "string" }, sourceSha256: { type: "string" }, rulesSnapshotId: { type: "string" }, expectedRecordCount: { const: expectedRecordCount }, decisionContractVersion: { const: AI_DECISION_CONTRACT_VERSION }, decisionContractSha256: { const: getDecisionContractDescriptor(expectedRecordCount).sha256 }, decisionsDocument: createDecisionArraySchema(expectedRecordCount), analysisReportMarkdown: { type: "string", minLength: 1 }, finalSummaryTraditionalChinese: { type: "string", minLength: 1 } } } as const;
}

function add(findings: DecisionFinding[], code: string, pointer: string, index: number | null, expected: unknown, observed: unknown, message: string) {
  findings.push({ code, jsonPointer: pointer, recordIndex: index, status: null, expected, observed, message });
}

export function observeDecisionDocument(value: unknown, expectedRecordCount: number) {
  const rows = Array.isArray(value) ? value : [];
  const indexes = rows.map((row) => object(row) && Number.isInteger(row.recordIndex) ? Number(row.recordIndex) : null);
  const numeric = indexes.filter((index): index is number => index !== null);
  const counts = new Map<number, number>(); numeric.forEach((index) => counts.set(index, (counts.get(index) ?? 0) + 1));
  return { runtimeType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value, observedCount: Array.isArray(value) ? value.length : null, expectedCount: expectedRecordCount, missingIndexes: Array.from({ length: expectedRecordCount }, (_, index) => index).filter((index) => !counts.has(index)), duplicateIndexes: [...counts].filter(([, count]) => count > 1).map(([index]) => index), outOfOrder: numeric.some((index, position) => index !== position) };
}

export function validateDecisionArray(value: unknown, expected: Expected): DecisionValidation {
  const descriptor = getDecisionContractDescriptor(expected.recordCount); const findings: DecisionFinding[] = [];
  if (!Array.isArray(value)) add(findings, "AI_DECISION_ROOT_TYPE_MISMATCH", "/decisionsDocument", null, "direct JSON array", typeof value, "Wrappers, strings, and code fences are forbidden.");
  const rows = Array.isArray(value) ? value : [];
  if (rows.length !== expected.recordCount) add(findings, "AI_DECISION_COUNT_MISMATCH", "/decisionsDocument", null, expected.recordCount, rows.length, "Decision count must equal N.");
  const catalog = new Set(expected.catalogSkillIds); const seen = new Set<number>();
  const decisions = rows.map((raw, outputIndex): AiDecision => {
    const row = object(raw) ? raw : {}; const pointer = `/decisionsDocument/${outputIndex}`; const index = Number.isInteger(row.recordIndex) ? Number(row.recordIndex) : -1;
    if (!object(raw)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", pointer, null, "object", typeof raw, "Decision must be an object.");
    for (const key of AI_DECISION_FIELDS) if (!(key in row)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/${key}`, index, "required", "missing", `${key} is required.`);
    for (const key of Object.keys(row)) if (!AI_DECISION_FIELDS.includes(key as never)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/${key}`, index, AI_DECISION_FIELDS, key, "Additional properties are forbidden.");
    if (index !== outputIndex || seen.has(index) || index < 0 || index >= expected.recordCount) add(findings, "AI_DECISION_INDEX_SET_MISMATCH", `${pointer}/recordIndex`, index, outputIndex, row.recordIndex, "recordIndex must uniquely and sequentially cover 0..N-1."); else seen.add(index);
    const status = String(row.status ?? "") as DecisionStatus; if (!AI_DECISION_STATUSES.includes(status)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/status`, index, AI_DECISION_STATUSES, row.status, "Invalid status.");
    const recordConfidence = confidence(row.confidence) ? row.confidence : 0; if (!confidence(row.confidence)) add(findings, "AI_DECISION_CONFIDENCE_INVALID", `${pointer}/confidence`, index, AI_DECISION_CONFIDENCE_VALUES, row.confidence, "Confidence must use the numeric enum.");
    const rawSkillFindings = Array.isArray(row.skillFindings) ? row.skillFindings : []; if (!Array.isArray(row.skillFindings)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/skillFindings`, index, "array", row.skillFindings, "skillFindings must be an array.");
    const skillIds = new Set<string>();
    const skillFindings = rawSkillFindings.map((rawFinding, findingIndex): SkillFinding => {
      const item = object(rawFinding) ? rawFinding : {}; const fp = `${pointer}/skillFindings/${findingIndex}`;
      for (const key of AI_SKILL_FINDING_FIELDS) if (!(key in item)) add(findings, "AI_SKILL_FINDING_FIELD_MISSING", `${fp}/${key}`, index, "required", "missing", `${key} is required per Skill.`);
      for (const key of Object.keys(item)) if (!AI_SKILL_FINDING_FIELDS.includes(key as never)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", `${fp}/${key}`, index, AI_SKILL_FINDING_FIELDS, key, "Additional Skill Finding properties are forbidden.");
      const skillId = text(item.skillId); if (!catalog.has(skillId)) add(findings, "AI_DECISION_SKILL_ID_INVALID", `${fp}/skillId`, index, "bound Catalog Skill ID", skillId, "Unknown Skill ID.");
      if (skillIds.has(skillId)) add(findings, "AI_DECISION_DUPLICATE_SKILL_ID", `${fp}/skillId`, index, "unique per Record", skillId, "Duplicate Skill ID in one Record."); skillIds.add(skillId);
      const findingConfidence = confidence(item.confidence) ? item.confidence : 0; if (!confidence(item.confidence)) add(findings, "AI_DECISION_CONFIDENCE_INVALID", `${fp}/confidence`, index, AI_DECISION_CONFIDENCE_VALUES, item.confidence, "Skill confidence must use the numeric enum.");
      const evidenceQuotes = Array.isArray(item.evidenceQuotes) ? item.evidenceQuotes.map((quote, quoteIndex) => {
        const q = object(quote) ? quote : {}; const qp = `${fp}/evidenceQuotes/${quoteIndex}`;
        if (!object(quote) || Object.keys(q).some((key) => !["evidenceRef", "quote"].includes(key)) || !("evidenceRef" in q) || !("quote" in q)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", qp, index, ["evidenceRef", "quote"], Object.keys(q), "Evidence Quote has an invalid shape.");
        const evidenceRef = text(q.evidenceRef); const quoteText = text(q.quote); const source = expected.evidenceByRecord?.[index]?.find((entry) => entry.evidenceRef === evidenceRef);
        if (expected.evidenceByRecord && !source) add(findings, "AI_EVIDENCE_REF_INVALID", `${qp}/evidenceRef`, index, "approved Record evidenceRef", evidenceRef, "Evidence Ref does not belong to this Record.");
        else if (source && !source.normalizedText.includes(quoteText)) add(findings, "AI_EVIDENCE_QUOTE_UNTRACEABLE", `${qp}/quote`, index, "exact normalized source substring", quoteText, "Evidence Quote cannot be traced exactly.");
        if (!evidenceRef || !quoteText) add(findings, "AI_SKILL_FINDING_FIELD_MISSING", qp, index, "non-empty evidenceRef and quote", q, "Evidence Quote is incomplete.");
        return { evidenceRef, quote: quoteText };
      }) : [];
      if (!evidenceQuotes.length) add(findings, "AI_SKILL_FINDING_FIELD_MISSING", `${fp}/evidenceQuotes`, index, ">= 1", evidenceQuotes.length, "Each Skill needs evidence.");
      const evidenceExplanation = text(item.evidenceExplanation); const negativeChecks = texts(item.negativeChecks); const rationale = text(item.rationale);
      if (!meaningful(evidenceExplanation)) add(findings, "AI_SKILL_FINDING_FIELD_MISSING", `${fp}/evidenceExplanation`, index, "meaningful text", item.evidenceExplanation, "Per-Skill explanation is required.");
      if (!Array.isArray(item.negativeChecks)) add(findings, "AI_SKILL_FINDING_FIELD_MISSING", `${fp}/negativeChecks`, index, "string[]", item.negativeChecks, "Per-Skill negativeChecks are required.");
      if (!meaningful(rationale)) add(findings, "AI_SKILL_FINDING_FIELD_MISSING", `${fp}/rationale`, index, "meaningful text", item.rationale, "Per-Skill rationale is required.");
      return { skillId, confidence: findingConfidence, evidenceQuotes, evidenceExplanation, negativeChecks, rationale };
    });
    const recordNegativeChecks = texts(row.recordNegativeChecks); const unknownReasons = texts(row.unknownReasons); const rationale = text(row.rationale);
    if (!Array.isArray(row.recordNegativeChecks) || !Array.isArray(row.unknownReasons)) add(findings, "AI_DECISION_SCHEMA_MISMATCH", pointer, index, "array fields", row, "Record arrays are invalid.");
    if (!meaningful(rationale)) add(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/rationale`, index, "meaningful text", row.rationale, "Record rationale is required.");
    if (["CLASSIFIED", "CATALOG_DETAIL_MISSING"].includes(status) && !skillFindings.length) add(findings, "AI_DECISION_STATUS_MATRIX_INVALID", `${pointer}/skillFindings`, index, ">= 1", 0, `${status} requires Skill Findings.`);
    if (["UNKNOWN", "EXCLUDED", "FAILED"].includes(status) && skillFindings.length) add(findings, "AI_DECISION_STATUS_MATRIX_INVALID", `${pointer}/skillFindings`, index, [], skillFindings.length, `${status} forbids Skill Findings.`);
    if (status === "UNKNOWN" && !unknownReasons.length) add(findings, "AI_DECISION_STATUS_MATRIX_INVALID", `${pointer}/unknownReasons`, index, ">= 1", 0, "UNKNOWN requires unknownReasons.");
    if (status !== "UNKNOWN" && unknownReasons.length) add(findings, "AI_DECISION_STATUS_MATRIX_INVALID", `${pointer}/unknownReasons`, index, [], unknownReasons, "Only UNKNOWN permits unknownReasons.");
    return { recordIndex: index, status, confidence: recordConfidence, skillFindings, recordNegativeChecks, unknownReasons, rationale };
  });
  for (const finding of findings) finding.status = finding.recordIndex === null ? null : decisions.find((row) => row.recordIndex === finding.recordIndex)?.status ?? null;
  const schemaCodes = new Set(["AI_DECISION_ROOT_TYPE_MISMATCH", "AI_DECISION_COUNT_MISMATCH", "AI_DECISION_INDEX_SET_MISMATCH", "AI_DECISION_SCHEMA_MISMATCH", "AI_DECISION_CONFIDENCE_INVALID"]);
  const schemaValid = !findings.some((finding) => schemaCodes.has(finding.code)); const semanticValid = findings.length === 0;
  const distribution = Object.fromEntries(AI_DECISION_STATUSES.map((status) => [status, decisions.filter((row) => row.status === status).length])) as Record<DecisionStatus, number>;
  const allUnknown = decisions.length === expected.recordCount && decisions.every((row) => row.status === "UNKNOWN"); const allSameStatus = decisions.length > 0 && new Set(decisions.map((row) => row.status)).size === 1;
  const duplicateRatio = (values: string[]) => values.length ? (values.length - new Set(values.map((value) => value.trim().toLowerCase())).size) / values.length : 0;
  return { contractVersion: AI_DECISION_CONTRACT_VERSION, contractSha256: descriptor.sha256, valid: schemaValid && semanticValid, schemaValid, semanticValid, expectedCount: expected.recordCount, actualCount: decisions.length, semanticValidCount: decisions.filter((row) => !findings.some((finding) => finding.recordIndex === row.recordIndex)).length, decisions, findings, warnings: [...(allUnknown ? ["ALL_RECORDS_UNKNOWN"] : []), ...(allSameStatus && !allUnknown ? ["ALL_RECORDS_SAME_STATUS"] : [])], distribution, derivedSkillIds: decisions.map((row) => row.skillFindings.map((finding) => finding.skillId)), allUnknown, allSameStatus, evidenceCoverage: decisions.length ? decisions.filter((row) => row.skillFindings.some((finding) => finding.evidenceQuotes.length) || row.recordNegativeChecks.length || row.unknownReasons.length).length / decisions.length : 0, rationaleDuplicateRatio: duplicateRatio(decisions.map((row) => row.rationale)), unknownReasonDuplicateRatio: duplicateRatio(decisions.flatMap((row) => row.unknownReasons)) };
}

export function primaryDecisionError(validation: DecisionValidation) { return validation.findings[0] ?? null; }
export function buildDecisionFixture(count: number, overrides: Partial<AiDecision> = {}): AiDecision[] {
  return Array.from({ length: count }, (_, recordIndex) => ({ recordIndex, status: "UNKNOWN", confidence: 0.3, skillFindings: [], recordNegativeChecks: [], unknownReasons: [`Synthetic evidence ${recordIndex} is insufficient.`], rationale: `Synthetic fixture Decision ${recordIndex}.`, ...overrides }));
}
