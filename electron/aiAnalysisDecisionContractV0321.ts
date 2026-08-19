import crypto from "node:crypto";

export const AI_DECISION_CONTRACT_VERSION = "jaa-ai-analysis-decisions-v2" as const;
export const AI_ARTIFACT_SUBMISSION_VERSION = "jaa-analysis-artifact-submission-v2" as const;
export const AI_DECISION_FIELDS = [
  "recordIndex",
  "status",
  "skillIds",
  "confidence",
  "positiveEvidence",
  "negativeChecks",
  "unknownReasons",
  "rationale"
] as const;
export const AI_DECISION_STATUSES = ["CLASSIFIED", "UNKNOWN", "NEEDS_REVIEW", "EXCLUDED", "CATALOG_DETAIL_MISSING", "FAILED"] as const;

export type DecisionStatus = typeof AI_DECISION_STATUSES[number];
export type AiDecision = {
  recordIndex: number;
  status: DecisionStatus;
  skillIds: string[];
  confidence: number;
  positiveEvidence: string[];
  negativeChecks: string[];
  unknownReasons: string[];
  rationale: string;
};
export type ValidatedDecisionDocument = {
  contractVersion: typeof AI_DECISION_CONTRACT_VERSION;
  contractSha256: string;
  runId: string;
  sourceSha256: string;
  rulesSnapshotId: string;
  expectedRecordCount: number;
  decisions: AiDecision[];
};
export type DecisionFinding = {
  code: string;
  jsonPointer: string;
  recordIndex: number | null;
  status: DecisionStatus | null;
  expected: unknown;
  observed: unknown;
  message: string;
};
export type DecisionValidation = {
  contractVersion: typeof AI_DECISION_CONTRACT_VERSION;
  contractSha256: string;
  valid: boolean;
  expectedCount: number;
  actualCount: number;
  semanticValidCount: number;
  decisions: AiDecision[];
  findings: DecisionFinding[];
  warnings: string[];
  distribution: Record<DecisionStatus, number>;
  allUnknown: boolean;
  allSameStatus: boolean;
  evidenceCoverage: number;
  rationaleDuplicateRatio: number;
  unknownReasonDuplicateRatio: number;
};

type ExpectedDecisionContract = { recordCount: number; catalogSkillIds: string[] };
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const uniqueStrings = (value: unknown) => [...new Set(strings(value))];
const duplicateRatio = (values: string[]) => values.length ? 1 - new Set(values.map((item) => item.trim().toLowerCase())).size / values.length : 0;
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export const stableDecisionJson = (value: unknown) => JSON.stringify(canonical(value));
const hash = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

function stringArraySchema() {
  return { type: "array", items: { type: "string" } };
}

const emptyArraySchema = { type: "array", maxItems: 0 } as const;
const nonEmptyArraySchema = { type: "array", minItems: 1 } as const;

export const AI_DECISION_STATUS_MATRIX = {
  CLASSIFIED: { skillIds: "non_empty", positiveEvidence: "non_empty", unknownReasons: "empty" },
  UNKNOWN: { skillIds: "empty", positiveEvidence: "empty", unknownReasons: "non_empty" },
  NEEDS_REVIEW: { skillIds: "optional", positiveEvidence: "required_with_candidates", unknownReasons: "empty" },
  EXCLUDED: { skillIds: "empty", positiveEvidence: "empty", unknownReasons: "empty" },
  CATALOG_DETAIL_MISSING: { skillIds: "non_empty", positiveEvidence: "non_empty", unknownReasons: "empty" },
  FAILED: { skillIds: "empty", positiveEvidence: "empty", unknownReasons: "empty" }
} as const;

function statusCondition(status: DecisionStatus, properties: Record<string, unknown>) {
  return { if: { properties: { status: { const: status } }, required: ["status"] }, then: { properties } };
}

export function createDecisionArraySchema(expectedRecordCount: number) {
  if (!Number.isInteger(expectedRecordCount) || expectedRecordCount < 0) throw new Error("AI_DECISION_COUNT_MISMATCH: expectedRecordCount must be a non-negative integer.");
  return {
    type: "array",
    minItems: expectedRecordCount,
    maxItems: expectedRecordCount,
    items: {
      type: "object",
      additionalProperties: false,
      required: [...AI_DECISION_FIELDS],
      allOf: [
        statusCondition("CLASSIFIED", { skillIds: nonEmptyArraySchema, positiveEvidence: nonEmptyArraySchema, unknownReasons: emptyArraySchema }),
        statusCondition("UNKNOWN", { skillIds: emptyArraySchema, positiveEvidence: emptyArraySchema, unknownReasons: nonEmptyArraySchema }),
        {
          if: { properties: { status: { const: "NEEDS_REVIEW" }, skillIds: nonEmptyArraySchema }, required: ["status", "skillIds"] },
          then: { properties: { positiveEvidence: nonEmptyArraySchema, unknownReasons: emptyArraySchema } },
          else: { if: { properties: { status: { const: "NEEDS_REVIEW" } }, required: ["status"] }, then: { properties: { unknownReasons: emptyArraySchema } } }
        },
        statusCondition("EXCLUDED", { skillIds: emptyArraySchema, positiveEvidence: emptyArraySchema, unknownReasons: emptyArraySchema }),
        statusCondition("CATALOG_DETAIL_MISSING", { skillIds: nonEmptyArraySchema, positiveEvidence: nonEmptyArraySchema, unknownReasons: emptyArraySchema }),
        statusCondition("FAILED", { skillIds: emptyArraySchema, positiveEvidence: emptyArraySchema, unknownReasons: emptyArraySchema })
      ],
      properties: {
        recordIndex: { type: "integer", minimum: 0, maximum: Math.max(0, expectedRecordCount - 1) },
        status: { type: "string", enum: [...AI_DECISION_STATUSES] },
        skillIds: { type: "array", uniqueItems: true, items: { type: "string" } },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        positiveEvidence: stringArraySchema(),
        negativeChecks: stringArraySchema(),
        unknownReasons: stringArraySchema(),
        rationale: { type: "string", minLength: 1 }
      }
    }
  } as const;
}

export function createArtifactSubmissionSchema(expectedRecordCount: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "runId", "sourceSha256", "rulesSnapshotId", "expectedRecordCount", "decisionContractVersion", "decisionContractSha256", "decisionsDocument", "analysisReportMarkdown", "finalSummaryTraditionalChinese"],
    properties: {
      schemaVersion: { const: AI_ARTIFACT_SUBMISSION_VERSION },
      runId: { type: "string" },
      sourceSha256: { type: "string" },
      rulesSnapshotId: { type: "string" },
      expectedRecordCount: { const: expectedRecordCount },
      decisionContractVersion: { const: AI_DECISION_CONTRACT_VERSION },
      decisionContractSha256: { const: getDecisionContractDescriptor(expectedRecordCount).sha256 },
      decisionsDocument: createDecisionArraySchema(expectedRecordCount),
      analysisReportMarkdown: { type: "string", minLength: 1 },
      finalSummaryTraditionalChinese: { type: "string", minLength: 1 }
    }
  } as const;
}

export function getDecisionContractDescriptor(expectedRecordCount: number) {
  const schema = createDecisionArraySchema(expectedRecordCount);
  const canonicalJson = stableDecisionJson({ schemaVersion: AI_DECISION_CONTRACT_VERSION, schema });
  return { schemaVersion: AI_DECISION_CONTRACT_VERSION, schema, canonicalJson, bytes: Buffer.byteLength(canonicalJson), sha256: hash(canonicalJson), fields: [...AI_DECISION_FIELDS], statuses: [...AI_DECISION_STATUSES] };
}

function finding(findings: DecisionFinding[], code: string, jsonPointer: string, recordIndex: number | null, expected: unknown, observed: unknown, message: string) {
  findings.push({ code, jsonPointer, recordIndex, status: null, expected, observed, message });
}

export function observeDecisionDocument(value: unknown, expectedRecordCount: number) {
  const runtimeType = value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : typeof value === "string" ? "string" : typeof value;
  const records = Array.isArray(value) ? value : [];
  const indexes = records.map((item) => isObject(item) && Number.isInteger(item.recordIndex) ? Number(item.recordIndex) : null);
  const numeric = indexes.filter((item): item is number => item !== null);
  const counts = new Map<number, number>();
  numeric.forEach((index) => counts.set(index, (counts.get(index) ?? 0) + 1));
  return {
    runtimeType,
    observedCount: Array.isArray(value) ? value.length : null,
    expectedCount: expectedRecordCount,
    firstRecordIndex: numeric[0] ?? null,
    lastRecordIndex: numeric.at(-1) ?? null,
    uniqueIndexCount: new Set(numeric).size,
    missingIndexes: Array.from({ length: expectedRecordCount }, (_, index) => index).filter((index) => !counts.has(index)),
    duplicateIndexes: [...counts.entries()].filter(([, count]) => count > 1).map(([index]) => index),
    outOfRangeIndexes: [...new Set(numeric.filter((index) => index < 0 || index >= expectedRecordCount))]
  };
}

export function validateDecisionArray(value: unknown, expected: ExpectedDecisionContract): DecisionValidation {
  const descriptor = getDecisionContractDescriptor(expected.recordCount);
  const findings: DecisionFinding[] = [];
  const observed = observeDecisionDocument(value, expected.recordCount);
  if (!Array.isArray(value)) {
    finding(findings, "AI_DECISION_ROOT_TYPE_MISMATCH", "/decisionsDocument", null, "array", observed.runtimeType, "decisionsDocument must be a direct JSON array; wrappers and JSON strings are forbidden.");
  }
  const rawDecisions = Array.isArray(value) ? value : [];
  if (rawDecisions.length !== expected.recordCount) finding(findings, "AI_DECISION_COUNT_MISMATCH", "/decisionsDocument", null, expected.recordCount, rawDecisions.length, "Decision array length does not match this Run.");
  const catalog = new Set(expected.catalogSkillIds);
  const seen = new Set<number>();
  const decisions = rawDecisions.map((raw, outputIndex): AiDecision => {
    const item = isObject(raw) ? raw : {};
    const pointer = `/decisionsDocument/${outputIndex}`;
    if (!isObject(raw)) finding(findings, "AI_DECISION_SCHEMA_MISMATCH", pointer, null, "object", Array.isArray(raw) ? "array" : typeof raw, "Each Decision must be an object.");
    const keys = Object.keys(item);
    for (const key of AI_DECISION_FIELDS) if (!Object.prototype.hasOwnProperty.call(item, key)) finding(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/${key}`, outputIndex, "required", "missing", `Required Decision field is missing: ${key}.`);
    for (const key of keys.filter((key) => !AI_DECISION_FIELDS.includes(key as typeof AI_DECISION_FIELDS[number]))) finding(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/${key}`, outputIndex, AI_DECISION_FIELDS, key, "Additional Decision properties are forbidden.");
    const recordIndex = Number.isInteger(item.recordIndex) ? Number(item.recordIndex) : -1;
    if (recordIndex < 0 || recordIndex >= expected.recordCount) finding(findings, "AI_DECISION_INDEX_SET_MISMATCH", `${pointer}/recordIndex`, recordIndex, `integer 0..${expected.recordCount - 1}`, item.recordIndex, "recordIndex is missing or out of range.");
    else if (seen.has(recordIndex)) finding(findings, "AI_DECISION_INDEX_SET_MISMATCH", `${pointer}/recordIndex`, recordIndex, "unique index", recordIndex, "recordIndex is duplicated.");
    else seen.add(recordIndex);
    if (recordIndex !== outputIndex) finding(findings, "AI_DECISION_INDEX_SET_MISMATCH", `${pointer}/recordIndex`, recordIndex, outputIndex, recordIndex, "Decision order must exactly match source order.");
    const status = String(item.status ?? "") as DecisionStatus;
    if (!AI_DECISION_STATUSES.includes(status)) finding(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/status`, recordIndex, AI_DECISION_STATUSES, item.status, "Decision status is invalid.");
    const skillIds = uniqueStrings(item.skillIds);
    if (!Array.isArray(item.skillIds) || skillIds.length !== (item.skillIds as unknown[]).length) finding(findings, "AI_DECISION_SCHEMA_MISMATCH", `${pointer}/skillIds`, recordIndex, "unique string[]", item.skillIds, "skillIds must contain unique non-empty strings.");
    for (const skillId of skillIds) if (!catalog.has(skillId)) finding(findings, "AI_DECISION_SKILL_ID_INVALID", `${pointer}/skillIds`, recordIndex, "Skill ID from bound Catalog", skillId, `Unknown Skill ID: ${skillId}.`);
    const confidence = typeof item.confidence === "number" ? item.confidence : Number.NaN;
    const positiveEvidence = strings(item.positiveEvidence);
    const negativeChecks = strings(item.negativeChecks);
    const unknownReasons = strings(item.unknownReasons);
    const rationale = typeof item.rationale === "string" ? item.rationale.trim() : "";
    for (const [field, rawValue, normalized] of [["positiveEvidence", item.positiveEvidence, positiveEvidence], ["negativeChecks", item.negativeChecks, negativeChecks], ["unknownReasons", item.unknownReasons, unknownReasons]] as const) {
      if (!Array.isArray(rawValue) || normalized.length !== rawValue.length) finding(findings, "AI_DECISION_SCHEMA_MISMATCH", pointer + "/" + field, recordIndex, "string[]", rawValue, field + " must be an array of non-empty strings.");
    }
    if (typeof item.confidence !== "number") finding(findings, "AI_DECISION_SCHEMA_MISMATCH", pointer + "/confidence", recordIndex, "number", item.confidence, "confidence must be a number.");
    if (typeof item.rationale !== "string") finding(findings, "AI_DECISION_SCHEMA_MISMATCH", pointer + "/rationale", recordIndex, "string", item.rationale, "rationale must be a string.");
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/confidence`, recordIndex, "finite number 0..1", item.confidence, "confidence is outside the contract.");
    if (!rationale || /^(n\/a|none|unknown|todo|placeholder)$/i.test(rationale)) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/rationale`, recordIndex, "meaningful non-empty text", item.rationale, "rationale is empty or placeholder text.");
    if (["CLASSIFIED", "CATALOG_DETAIL_MISSING"].includes(status) && (!skillIds.length || !positiveEvidence.length)) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", pointer, recordIndex, "skillIds and positiveEvidence >= 1", { skillIds: skillIds.length, positiveEvidence: positiveEvidence.length }, `${status} requires actual Skill candidates and positive evidence.`);
    if (["UNKNOWN", "EXCLUDED", "FAILED"].includes(status) && skillIds.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/skillIds`, recordIndex, [], skillIds, `${status} must not contain Skill IDs.`);
    if (["UNKNOWN", "EXCLUDED", "FAILED"].includes(status) && positiveEvidence.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/positiveEvidence`, recordIndex, [], positiveEvidence, `${status} must not contain positiveEvidence.`);
    if (status === "NEEDS_REVIEW" && skillIds.length && !positiveEvidence.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/positiveEvidence`, recordIndex, ">= 1 when skillIds are present", 0, "NEEDS_REVIEW requires positive evidence when candidates are present.");
    if (status === "UNKNOWN" && !unknownReasons.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/unknownReasons`, recordIndex, ">= 1", 0, "UNKNOWN requires a reason; negativeChecks may be empty.");
    if (status !== "UNKNOWN" && unknownReasons.length) finding(findings, "AI_DECISION_SEMANTIC_VALIDATION_FAILED", `${pointer}/unknownReasons`, recordIndex, [], unknownReasons, "unknownReasons are only valid for UNKNOWN.");
    return { recordIndex, status, skillIds, confidence, positiveEvidence, negativeChecks, unknownReasons, rationale };
  });
  for (const item of findings) item.status = item.recordIndex === null ? null : decisions.find((decision) => decision.recordIndex === item.recordIndex)?.status ?? null;
  for (let index = 0; index < expected.recordCount; index += 1) if (!seen.has(index)) finding(findings, "AI_DECISION_INDEX_SET_MISMATCH", "/decisionsDocument", index, index, null, `recordIndex ${index} is missing.`);
  const distribution = Object.fromEntries(AI_DECISION_STATUSES.map((status) => [status, decisions.filter((item) => item.status === status).length])) as Record<DecisionStatus, number>;
  const invalidIndexes = new Set(findings.filter((item) => item.recordIndex !== null).map((item) => item.recordIndex));
  const allUnknown = decisions.length === expected.recordCount && decisions.every((item) => item.status === "UNKNOWN");
  const allSameStatus = decisions.length > 0 && new Set(decisions.map((item) => item.status)).size === 1;
  const warnings = [...(allUnknown ? ["ALL_RECORDS_UNKNOWN"] : []), ...(allSameStatus && !allUnknown ? ["ALL_RECORDS_SAME_STATUS"] : [])];
  return { contractVersion: AI_DECISION_CONTRACT_VERSION, contractSha256: descriptor.sha256, valid: findings.length === 0, expectedCount: expected.recordCount, actualCount: decisions.length, semanticValidCount: Math.max(0, decisions.length - invalidIndexes.size), decisions, findings, warnings, distribution, allUnknown, allSameStatus, evidenceCoverage: decisions.length ? decisions.filter((item) => item.positiveEvidence.length || item.negativeChecks.length || item.unknownReasons.length).length / decisions.length : 0, rationaleDuplicateRatio: duplicateRatio(decisions.map((item) => item.rationale)), unknownReasonDuplicateRatio: duplicateRatio(decisions.flatMap((item) => item.unknownReasons)) };
}

export function primaryDecisionError(validation: DecisionValidation) {
  const priority = ["AI_DECISION_ROOT_TYPE_MISMATCH", "AI_DECISION_COUNT_MISMATCH", "AI_DECISION_INDEX_SET_MISMATCH", "AI_DECISION_SCHEMA_MISMATCH", "AI_DECISION_SKILL_ID_INVALID", "AI_DECISION_SEMANTIC_VALIDATION_FAILED"];
  return priority.map((code) => validation.findings.find((item) => item.code === code)).find(Boolean) ?? validation.findings[0] ?? null;
}

export function buildDecisionFixture(count: number, overrides: Partial<AiDecision> = {}): AiDecision[] {
  return Array.from({ length: count }, (_, recordIndex) => ({ recordIndex, status: "UNKNOWN", skillIds: [], confidence: 0.25, positiveEvidence: [], negativeChecks: [], unknownReasons: [`Synthetic evidence ${recordIndex} is insufficient.`], rationale: `Synthetic fixture Decision ${recordIndex}.`, ...overrides }));
}
