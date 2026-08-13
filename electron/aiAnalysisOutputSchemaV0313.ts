import crypto from "node:crypto";
import { AI_ANALYSIS_OUTPUT_SCHEMA_VERSION } from "../shared/aiAnalysisContract.js";

export const OUTPUT_SCHEMA_NAME = "jira_activity_analysis_v0315" as const;
export const OUTPUT_SCHEMA_VALIDATOR_NAME = "jira-activity-analyzer-strict-output-schema" as const;
export const OUTPUT_SCHEMA_VALIDATOR_VERSION = "1.0.0" as const;

export type StrictSchemaFinding = {
  code: string;
  severity: "error";
  jsonPointer: string;
  message: string;
  expected: unknown;
  actual: unknown;
  keyword: string;
  key?: string;
};

export type StrictSchemaValidation = {
  validatorName: typeof OUTPUT_SCHEMA_VALIDATOR_NAME;
  validatorVersion: typeof OUTPUT_SCHEMA_VALIDATOR_VERSION;
  validatedAt: string;
  schemaName: string;
  schemaBytesUtf8: number;
  schemaSha256: string;
  isValid: boolean;
  findingCount: number;
  findings: StrictSchemaFinding[];
  maxObservedDepth: number;
  totalObjectProperties: number;
  totalEnumValues: number;
  totalSchemaStringLength: number;
  unsupportedKeywords: string[];
  requiredPropertyMismatchCount: number;
  additionalPropertiesViolationCount: number;
};

export type PreparedOutputSchema = {
  schemaName: typeof OUTPUT_SCHEMA_NAME;
  schema: Readonly<Record<string, unknown>>;
  canonicalJson: string;
  canonicalBytes: Buffer;
  sha256: string;
  validation: StrictSchemaValidation;
};

const LIMITS = {
  maxDepth: 10,
  maxObjectProperties: 5_000,
  maxEnumValues: 1_000,
  maxSchemaStringLength: 120_000,
  maxLargeEnumStringLength: 15_000
} as const;

const SUPPORTED_KEYWORDS = new Set([
  "type", "properties", "required", "additionalProperties", "items", "enum", "const",
  "anyOf", "$defs", "$ref", "description", "minItems", "maxItems"
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pointerToken(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}

export function canonicalizeOutputSchema(schema: Record<string, unknown>) {
  return JSON.stringify(canonicalValue(schema));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function createSingleRunOutputSchema(expectedRecordCount?: number): Record<string, unknown> {
  if (expectedRecordCount !== undefined && (!Number.isInteger(expectedRecordCount) || expectedRecordCount < 0)) throw new Error("OUTPUT_SCHEMA_RECORD_COUNT_INVALID");
  const stringArray = () => ({ type: "array", items: { type: "string" } });
  const negativeCheck = () => ({
    type: "object", properties: {
      ruleId: { type: "string" }, passed: { type: "boolean" }, detail: { type: "string" }, evidenceRefs: stringArray()
    }, required: ["ruleId", "passed", "detail", "evidenceRefs"], additionalProperties: false
  });
  const rejectedNearSkill = () => ({
    type: "object", properties: { skillId: { type: "string" }, reason: { type: "string" } },
    required: ["skillId", "reason"], additionalProperties: false
  });
  const scoreComponent = () => ({
    type: "object", properties: {
      componentKey: { type: "string" }, score: { type: "number" }, explanation: { type: ["string", "null"] }
    }, required: ["componentKey", "score", "explanation"], additionalProperties: false
  });
  const candidate = {
    type: "object", properties: {
      skillId: { type: "string" }, candidateStatus: { type: "string", enum: ["MATCHED", "EXCLUDED", "CATALOG_DETAIL_MISSING", "NEEDS_REVIEW"] }, statusReason: { type: "string" }, catalogDetailAvailable: { type: "boolean" },
      score: { type: "number" }, confidence: { type: "string", enum: ["High", "Medium", "Low"] }, confidenceReason: { type: "string" }, scoreComponents: { type: "array", items: scoreComponent() },
      positiveSignals: stringArray(), positiveEvidenceRefs: stringArray(), negativeChecks: { type: "array", items: negativeCheck() },
      negativeEvidenceRefs: stringArray(), rejectedNearSkills: { type: "array", items: rejectedNearSkill() }, evidenceQuote: { type: "string" }
    },
    required: ["skillId", "candidateStatus", "statusReason", "catalogDetailAvailable", "score", "confidence", "confidenceReason", "scoreComponents", "positiveSignals", "positiveEvidenceRefs", "negativeChecks", "negativeEvidenceRefs", "rejectedNearSkills", "evidenceQuote"],
    additionalProperties: false
  };
  const record = {
    type: "object", properties: {
      recordIndex: { type: "integer" }, sourceRecordStableId: { type: "string" }, activityEventId: { type: "string" },
      evidenceId: { type: "string" }, sourceContentHash: { type: "string" },
      classificationStatus: { type: "string", enum: ["MATCHED", "EXCLUDED", "UNKNOWN", "CATALOG_DETAIL_MISSING", "NEEDS_REVIEW"] },
      reviewStatus: { type: "string", enum: ["PENDING_REVIEW"] },
      reviewAttention: { type: "string", enum: ["STANDARD_REVIEW", "NEEDS_REVIEW"] },
      dispositionReason: { type: "string" }, exclusionReason: { type: ["string", "null"] }, unknownReason: { type: ["string", "null"] }, reviewReason: { type: ["string", "null"] },
      matchedRuleIds: stringArray(), negativeChecks: { type: "array", items: negativeCheck() }, analyses: { type: "array", items: candidate }
    },
    required: ["recordIndex", "sourceRecordStableId", "activityEventId", "evidenceId", "sourceContentHash", "classificationStatus", "reviewStatus", "reviewAttention", "dispositionReason", "exclusionReason", "unknownReason", "reviewReason", "matchedRuleIds", "negativeChecks", "analyses"],
    additionalProperties: false
  };
  return {
    type: "object", properties: {
      schemaVersion: { type: "string", const: AI_ANALYSIS_OUTPUT_SCHEMA_VERSION },
      records: { type: "array", items: record, ...(expectedRecordCount === undefined ? {} : { minItems: expectedRecordCount, maxItems: expectedRecordCount }) }
    }, required: ["schemaVersion", "records"], additionalProperties: false
  };
}

export function validateStrictOutputSchema(schema: Record<string, unknown>, input: { schemaName?: string; validatedAt?: string } = {}): StrictSchemaValidation {
  const findings: StrictSchemaFinding[] = [];
  const unsupportedKeywords = new Set<string>();
  let maxObservedDepth = 0;
  let totalObjectProperties = 0;
  let totalEnumValues = 0;
  let totalSchemaStringLength = 0;
  let requiredPropertyMismatchCount = 0;
  let additionalPropertiesViolationCount = 0;
  const add = (finding: StrictSchemaFinding) => findings.push(finding);
  const addString = (value: unknown) => { if (typeof value === "string") totalSchemaStringLength += value.length; };

  const resolveRef = (ref: string): unknown => {
    if (ref === "#") return schema;
    if (!ref.startsWith("#/")) return undefined;
    return ref.slice(2).split("/").reduce<unknown>((current, token) => isObject(current) ? current[token.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined, schema);
  };

  const visit = (node: unknown, pointer: string, depth: number, refs: Set<string>) => {
    if (!isObject(node)) {
      add({ code: "SCHEMA_NODE_INVALID", severity: "error", jsonPointer: pointer || "/", message: "Schema node must be an object.", expected: "object", actual: Array.isArray(node) ? "array" : typeof node, keyword: "schema" });
      return;
    }
    maxObservedDepth = Math.max(maxObservedDepth, depth);
    for (const keyword of Object.keys(node)) {
      if (!SUPPORTED_KEYWORDS.has(keyword)) {
        unsupportedKeywords.add(keyword);
        add({ code: "SCHEMA_UNSUPPORTED_KEYWORD", severity: "error", jsonPointer: `${pointer}/${pointerToken(keyword)}`, message: `Unsupported Strict Structured Outputs keyword: ${keyword}.`, expected: "supported keyword", actual: keyword, keyword });
      }
    }
    if (typeof node.description === "string") addString(node.description);
    if (typeof node.const === "string") addString(node.const);
    if (Array.isArray(node.enum)) {
      totalEnumValues += node.enum.length;
      node.enum.forEach(addString);
      const enumStringLength = node.enum.reduce((sum, value) => sum + (typeof value === "string" ? value.length : 0), 0);
      if (node.enum.length > 250 && enumStringLength > LIMITS.maxLargeEnumStringLength) add({ code: "SCHEMA_ENUM_STRING_LIMIT_EXCEEDED", severity: "error", jsonPointer: `${pointer}/enum`, message: "Large enum string length exceeds the Provider limit.", expected: LIMITS.maxLargeEnumStringLength, actual: enumStringLength, keyword: "enum" });
    }
    if (typeof node.$ref === "string") {
      const ref = node.$ref;
      if (refs.has(ref)) return;
      const target = resolveRef(ref);
      if (target === undefined) add({ code: "SCHEMA_REF_UNRESOLVED", severity: "error", jsonPointer: `${pointer}/$ref`, message: "Schema reference cannot be resolved.", expected: "resolvable local reference", actual: ref, keyword: "$ref" });
      else visit(target, ref === "#" ? "" : ref.slice(1), depth + 1, new Set([...refs, ref]));
      return;
    }
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (types.includes("object")) {
      const properties = node.properties;
      const required = node.required;
      if (!isObject(properties)) add({ code: "SCHEMA_OBJECT_PROPERTIES_INVALID", severity: "error", jsonPointer: `${pointer}/properties`, message: "Object schema requires an explicit properties object.", expected: "object", actual: properties, keyword: "properties" });
      if (!Array.isArray(required) || required.some((key) => typeof key !== "string")) add({ code: "SCHEMA_REQUIRED_INVALID", severity: "error", jsonPointer: `${pointer}/required`, message: "Object schema requires a string required array.", expected: "string[]", actual: required, keyword: "required" });
      if (node.additionalProperties !== false) {
        additionalPropertiesViolationCount += 1;
        add({ code: isObject(node.additionalProperties) ? "SCHEMA_DICTIONARY_NOT_SUPPORTED" : "SCHEMA_ADDITIONAL_PROPERTIES_MUST_BE_FALSE", severity: "error", jsonPointer: `${pointer}/additionalProperties`, message: "Every object must set additionalProperties to false; arbitrary dictionaries are unsupported.", expected: false, actual: node.additionalProperties, keyword: "additionalProperties" });
      }
      if (isObject(properties)) {
        const propertyKeys = Object.keys(properties);
        totalObjectProperties += propertyKeys.length;
        propertyKeys.forEach(addString);
        if (Array.isArray(required)) {
          const requiredStrings = required.filter((key): key is string => typeof key === "string");
          const duplicates = [...new Set(requiredStrings.filter((key, index) => requiredStrings.indexOf(key) !== index))];
          for (const key of duplicates) add({ code: "SCHEMA_REQUIRED_DUPLICATE", severity: "error", jsonPointer: `${pointer}/required`, message: `Required key is duplicated: ${key}.`, expected: "unique keys", actual: key, keyword: "required", key });
          for (const key of requiredStrings.filter((key) => !propertyKeys.includes(key))) {
            requiredPropertyMismatchCount += 1;
            add({ code: "SCHEMA_REQUIRED_KEY_NOT_IN_PROPERTIES", severity: "error", jsonPointer: `${pointer}/required`, message: `Required key is absent from properties: ${key}.`, expected: propertyKeys, actual: key, keyword: "required", key });
          }
          for (const key of propertyKeys.filter((key) => !requiredStrings.includes(key))) {
            requiredPropertyMismatchCount += 1;
            add({ code: "SCHEMA_PROPERTY_NOT_REQUIRED", severity: "error", jsonPointer: `${pointer}/properties/${pointerToken(key)}`, message: `Property must be required; use a nullable type for optional semantics: ${key}.`, expected: "listed in required", actual: "not required", keyword: "required", key });
          }
        }
        for (const [key, child] of Object.entries(properties)) visit(child, `${pointer}/properties/${pointerToken(key)}`, depth + 1, refs);
      }
    }
    if (types.includes("array")) {
      if (node.minItems !== undefined && (!Number.isInteger(node.minItems) || (node.minItems as number) < 0)) add({ code: "SCHEMA_MIN_ITEMS_INVALID", severity: "error", jsonPointer: pointer + "/minItems", message: "minItems must be a non-negative integer.", expected: "non-negative integer", actual: node.minItems, keyword: "minItems" });
      if (node.maxItems !== undefined && (!Number.isInteger(node.maxItems) || (node.maxItems as number) < 0)) add({ code: "SCHEMA_MAX_ITEMS_INVALID", severity: "error", jsonPointer: pointer + "/maxItems", message: "maxItems must be a non-negative integer.", expected: "non-negative integer", actual: node.maxItems, keyword: "maxItems" });
      if (typeof node.minItems === "number" && typeof node.maxItems === "number" && node.minItems > node.maxItems) add({ code: "SCHEMA_ARRAY_RANGE_INVALID", severity: "error", jsonPointer: pointer || "/", message: "minItems cannot exceed maxItems.", expected: "<=" + node.maxItems, actual: node.minItems, keyword: "minItems" });
      if (!isObject(node.items)) add({ code: "SCHEMA_ARRAY_ITEMS_INVALID", severity: "error", jsonPointer: `${pointer}/items`, message: "Array schema requires one explicit items schema.", expected: "schema object", actual: node.items, keyword: "items" });
      else visit(node.items, `${pointer}/items`, depth + 1, refs);
    }
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((branch, index) => visit(branch, `${pointer}/anyOf/${index}`, depth + 1, refs));
    else if (node.anyOf !== undefined) add({ code: "SCHEMA_ANY_OF_INVALID", severity: "error", jsonPointer: `${pointer}/anyOf`, message: "anyOf must contain schema branches.", expected: "schema[]", actual: node.anyOf, keyword: "anyOf" });
    if (isObject(node.$defs)) {
      for (const [key, child] of Object.entries(node.$defs)) { addString(key); visit(child, `${pointer}/$defs/${pointerToken(key)}`, depth + 1, refs); }
    }
  };

  if (schema.type !== "object" || schema.anyOf !== undefined) add({ code: "SCHEMA_ROOT_MUST_BE_OBJECT", severity: "error", jsonPointer: "/", message: "Root schema must be an object and cannot use anyOf.", expected: "type=object", actual: schema.type, keyword: "type" });
  visit(schema, "", 1, new Set());
  if (maxObservedDepth > LIMITS.maxDepth) add({ code: "SCHEMA_DEPTH_LIMIT_EXCEEDED", severity: "error", jsonPointer: "/", message: "Schema nesting depth exceeds the Provider limit.", expected: LIMITS.maxDepth, actual: maxObservedDepth, keyword: "depth" });
  if (totalObjectProperties > LIMITS.maxObjectProperties) add({ code: "SCHEMA_PROPERTY_LIMIT_EXCEEDED", severity: "error", jsonPointer: "/", message: "Total object property count exceeds the Provider limit.", expected: LIMITS.maxObjectProperties, actual: totalObjectProperties, keyword: "properties" });
  if (totalEnumValues > LIMITS.maxEnumValues) add({ code: "SCHEMA_ENUM_LIMIT_EXCEEDED", severity: "error", jsonPointer: "/", message: "Total enum value count exceeds the Provider limit.", expected: LIMITS.maxEnumValues, actual: totalEnumValues, keyword: "enum" });
  if (totalSchemaStringLength > LIMITS.maxSchemaStringLength) add({ code: "SCHEMA_STRING_LIMIT_EXCEEDED", severity: "error", jsonPointer: "/", message: "Schema string length exceeds the Provider limit.", expected: LIMITS.maxSchemaStringLength, actual: totalSchemaStringLength, keyword: "strings" });
  const canonicalJson = canonicalizeOutputSchema(schema);
  const schemaSha256 = crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  return {
    validatorName: OUTPUT_SCHEMA_VALIDATOR_NAME, validatorVersion: OUTPUT_SCHEMA_VALIDATOR_VERSION,
    validatedAt: input.validatedAt ?? new Date().toISOString(), schemaName: input.schemaName ?? OUTPUT_SCHEMA_NAME,
    schemaBytesUtf8: Buffer.byteLength(canonicalJson), schemaSha256, isValid: findings.length === 0,
    findingCount: findings.length, findings, maxObservedDepth, totalObjectProperties, totalEnumValues,
    totalSchemaStringLength, unsupportedKeywords: [...unsupportedKeywords].sort(), requiredPropertyMismatchCount,
    additionalPropertiesViolationCount
  };
}

export type CanonicalScoreComponent = { componentKey: string; score: number; explanation: string | null };

export function legacyScoreComponentMapToCanonical(value: Record<string, number>): CanonicalScoreComponent[] {
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([componentKey, score]) => {
    if (!componentKey || !Number.isFinite(score)) throw new Error("INVALID_LEGACY_SCORE_COMPONENT");
    return { componentKey, score, explanation: null };
  });
}

export function canonicalScoreComponentsToLegacyDisplay(value: CanonicalScoreComponent[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const component of value) {
    if (!component.componentKey || !Number.isFinite(component.score) || Object.prototype.hasOwnProperty.call(result, component.componentKey)) throw new Error("DUPLICATE_OR_INVALID_SCORE_COMPONENT_KEY");
    result[component.componentKey] = component.score;
  }
  return result;
}
export type StructuredValueFinding = { jsonPointer: string; message: string; expected: unknown; actual: unknown };

export function validateValueAgainstOutputSchema(value: unknown, schema: Record<string, unknown>) {
  const findings: StructuredValueFinding[] = [];
  const visit = (current: unknown, node: unknown, pointer: string) => {
    if (!isObject(node)) { findings.push({ jsonPointer: pointer || "/", message: "Invalid runtime schema node.", expected: "schema object", actual: node }); return; }
    const types = (Array.isArray(node.type) ? node.type : [node.type]).filter((item): item is string => typeof item === "string");
    const actualType = current === null ? "null" : Array.isArray(current) ? "array" : Number.isInteger(current) ? "integer" : typeof current === "number" ? "number" : typeof current;
    const typeMatches = types.includes(actualType) || (actualType === "integer" && types.includes("number"));
    if (types.length && !typeMatches) { findings.push({ jsonPointer: pointer || "/", message: "Value type does not match the canonical output schema.", expected: types, actual: actualType }); return; }
    if (node.const !== undefined && current !== node.const) findings.push({ jsonPointer: pointer || "/", message: "Value does not match const.", expected: node.const, actual: current });
    if (Array.isArray(node.enum) && !node.enum.some((item) => Object.is(item, current))) findings.push({ jsonPointer: pointer || "/", message: "Value is not in enum.", expected: node.enum, actual: current });
    if (types.includes("object") && isObject(current)) {
      const properties = isObject(node.properties) ? node.properties : {};
      const required = Array.isArray(node.required) ? node.required.filter((item): item is string => typeof item === "string") : [];
      for (const key of required) if (!Object.prototype.hasOwnProperty.call(current, key)) findings.push({ jsonPointer: `${pointer}/${pointerToken(key)}`, message: "Required property is missing.", expected: "present", actual: "missing" });
      for (const key of Object.keys(current)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) findings.push({ jsonPointer: `${pointer}/${pointerToken(key)}`, message: "Unknown property is not allowed.", expected: Object.keys(properties), actual: key });
        else visit(current[key], properties[key], `${pointer}/${pointerToken(key)}`);
      }
    }
    if (types.includes("array") && Array.isArray(current)) {
      if (typeof node.minItems === "number" && current.length < node.minItems) findings.push({ jsonPointer: pointer || "/", message: "Array has fewer items than required.", expected: ">=" + node.minItems, actual: current.length });
      if (typeof node.maxItems === "number" && current.length > node.maxItems) findings.push({ jsonPointer: pointer || "/", message: "Array has more items than allowed.", expected: "<=" + node.maxItems, actual: current.length });
      current.forEach((item, index) => visit(item, node.items, pointer + "/" + index));
    }
    if (Array.isArray(node.anyOf) && !node.anyOf.some((branch) => validateValueAgainstOutputSchema(current, branch as Record<string, unknown>).isValid)) findings.push({ jsonPointer: pointer || "/", message: "Value does not match anyOf.", expected: "one valid branch", actual: current });
  };
  visit(value, schema, "");
  return { isValid: findings.length === 0, findingCount: findings.length, findings };
}
export function prepareSingleRunOutputSchema(expectedRecordCount?: number): PreparedOutputSchema {
  const canonicalJson = canonicalizeOutputSchema(createSingleRunOutputSchema(expectedRecordCount));
  const canonicalBytes = Buffer.from(canonicalJson, "utf8");
  const sha256 = crypto.createHash("sha256").update(canonicalBytes).digest("hex");
  const schema = deepFreeze(JSON.parse(canonicalJson) as Record<string, unknown>);
  const validation = validateStrictOutputSchema(schema, { schemaName: OUTPUT_SCHEMA_NAME });
  if (validation.schemaSha256 !== sha256) throw new Error("OUTPUT_SCHEMA_HASH_MISMATCH");
  return { schemaName: OUTPUT_SCHEMA_NAME, schema, canonicalJson, canonicalBytes, sha256, validation };
}
