import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeOutputSchema,
  canonicalScoreComponentsToLegacyDisplay,
  createSingleRunOutputSchema,
  legacyScoreComponentMapToCanonical,
  prepareSingleRunOutputSchema,
  validateStrictOutputSchema,
  validateValueAgainstOutputSchema
} from "../electron/aiAnalysisOutputSchemaV0313.js";

function clone<T>(value: T): T { return structuredClone(value); }
function candidate(schema: any) { return schema.properties.records.items.properties.analyses.items; }

const prepared = prepareSingleRunOutputSchema();
const schema = prepared.schema as any;
const scoreComponents = candidate(schema).properties.scoreComponents;
assert.equal(prepared.validation.isValid, true);
assert.equal(prepared.validation.findingCount, 0);
assert.equal(scoreComponents.type, "array");
assert.equal(scoreComponents.items.type, "object");
assert.equal(scoreComponents.items.additionalProperties, false);
assert.deepEqual(scoreComponents.items.required, ["componentKey", "score", "explanation"]);
assert.deepEqual(Object.keys(scoreComponents.items.properties), ["componentKey", "explanation", "score"]);

const v0312Invalid = clone(schema);
delete candidate(v0312Invalid).properties.scoreComponents;
const oldFailure = validateStrictOutputSchema(v0312Invalid);
assert.equal(oldFailure.isValid, false);
assert.ok(oldFailure.findings.some((item) => item.code === "SCHEMA_REQUIRED_KEY_NOT_IN_PROPERTIES"
  && item.jsonPointer === "/properties/records/items/properties/analyses/items/required"
  && item.key === "scoreComponents"));

const dictionary = clone(schema);
candidate(dictionary).properties.scoreComponents = { type: "object", additionalProperties: { type: "number" }, properties: {}, required: [] };
assert.ok(validateStrictOutputSchema(dictionary).findings.some((item) => item.code === "SCHEMA_DICTIONARY_NOT_SUPPORTED"));

const propertyNotRequired = clone(schema);
candidate(propertyNotRequired).required = candidate(propertyNotRequired).required.filter((key: string) => key !== "evidenceQuote");
assert.ok(validateStrictOutputSchema(propertyNotRequired).findings.some((item) => item.code === "SCHEMA_PROPERTY_NOT_REQUIRED"));

const duplicateRequired = clone(schema);
candidate(duplicateRequired).required.push("skillId");
assert.ok(validateStrictOutputSchema(duplicateRequired).findings.some((item) => item.code === "SCHEMA_REQUIRED_DUPLICATE"));

const missingAdditional = clone(schema);
delete candidate(missingAdditional).additionalProperties;
assert.ok(validateStrictOutputSchema(missingAdditional).findings.some((item) => item.code === "SCHEMA_ADDITIONAL_PROPERTIES_MUST_BE_FALSE"));

const trueAdditional = clone(schema);
candidate(trueAdditional).additionalProperties = true;
assert.ok(validateStrictOutputSchema(trueAdditional).findings.some((item) => item.code === "SCHEMA_ADDITIONAL_PROPERTIES_MUST_BE_FALSE"));

const unsupported = clone(schema);
candidate(unsupported).patternProperties = {};
assert.ok(validateStrictOutputSchema(unsupported).findings.some((item) => item.code === "SCHEMA_UNSUPPORTED_KEYWORD" && item.keyword === "patternProperties"));

const invalidAnyOf = clone(schema);
candidate(invalidAnyOf).properties.evidenceQuote = { anyOf: [{ type: "object", properties: {}, required: [] }] };
assert.ok(validateStrictOutputSchema(invalidAnyOf).findings.some((item) => item.code === "SCHEMA_ADDITIONAL_PROPERTIES_MUST_BE_FALSE"));

let deep: any = { type: "string" };
for (let index = 0; index < 11; index += 1) deep = { type: "object", properties: { child: deep }, required: ["child"], additionalProperties: false };
assert.ok(validateStrictOutputSchema(deep).findings.some((item) => item.code === "SCHEMA_DEPTH_LIMIT_EXCEEDED"));

const tooManyProperties = Object.fromEntries(Array.from({ length: 5_001 }, (_, index) => [`p${index}`, { type: "string" }]));
const propertyLimitSchema = { type: "object", properties: tooManyProperties, required: Object.keys(tooManyProperties), additionalProperties: false };
assert.ok(validateStrictOutputSchema(propertyLimitSchema).findings.some((item) => item.code === "SCHEMA_PROPERTY_LIMIT_EXCEEDED"));

const enumLimitSchema = { type: "object", properties: { value: { type: "string", enum: Array.from({ length: 1_001 }, (_, index) => `v${index}`) } }, required: ["value"], additionalProperties: false };
assert.ok(validateStrictOutputSchema(enumLimitSchema).findings.some((item) => item.code === "SCHEMA_ENUM_LIMIT_EXCEEDED"));

const reordered = { required: ["value"], properties: { value: { type: "string" } }, type: "object", additionalProperties: false };
const ordered = { type: "object", additionalProperties: false, properties: { value: { type: "string" } }, required: ["value"] };
assert.equal(canonicalizeOutputSchema(reordered), canonicalizeOutputSchema(ordered));
assert.equal(prepareSingleRunOutputSchema().sha256, prepared.sha256);
const changed = createSingleRunOutputSchema() as any;
changed.properties.schemaVersion.const += "-changed";
assert.notEqual(validateStrictOutputSchema(changed).schemaSha256, prepared.sha256);
assert.equal(Object.isFrozen(prepared.schema), true);
assert.equal(Object.isFrozen((prepared.schema as any).properties.records.items), true);

const canonicalComponents = legacyScoreComponentMapToCanonical({ evidence: 60, attribution: 28 });
assert.deepEqual(canonicalComponents, [
  { componentKey: "attribution", score: 28, explanation: null },
  { componentKey: "evidence", score: 60, explanation: null }
]);
assert.deepEqual(canonicalScoreComponentsToLegacyDisplay(canonicalComponents), { attribution: 28, evidence: 60 });
assert.throws(() => canonicalScoreComponentsToLegacyDisplay([
  { componentKey: "evidence", score: 1, explanation: null },
  { componentKey: "evidence", score: 2, explanation: "duplicate" }
]));

const minimalResponse = { schemaVersion: "ai-analysis-output-v3", records: [] };
assert.equal(validateValueAgainstOutputSchema(minimalResponse, schema).isValid, true);
assert.equal(validateValueAgainstOutputSchema({ ...minimalResponse, unexpected: true }, schema).isValid, false);

const root = process.cwd();
const ipc = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
const startHandler = ipc.slice(ipc.indexOf("ipcMain.handle(\"ai-analysis:start\""));
assert.ok(startHandler.indexOf("prepareSingleRunOutputSchema()") < startHandler.indexOf("readSelectedModelCapacity()"));
assert.ok(startHandler.indexOf("readSelectedModelCapacity()") < startHandler.indexOf("await chatgpt.runAnalysis"));
assert.match(ipc, /providerDispatchCount: 0/);
assert.match(ipc, /threadStartAttemptCount: 0/);
assert.match(ipc, /acceptedTurnCount: 0/);
assert.match(ipc, /AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED/);
assert.match(ipc, /outputSchema: preparedOutputSchema\.schema/);

const layout = fs.readFileSync(path.join(root, "src", "components", "AppLayout.tsx"), "utf8");
assert.match(layout, /const appendDebugLog = useCallback/);
assert.doesNotMatch(layout, /appendDebugLog: \(targetPage, lines\) =>/);

console.log("v0.3.13 structured output schema tests passed (35 assertions)");
