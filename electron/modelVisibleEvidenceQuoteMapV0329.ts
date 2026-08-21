import crypto from "node:crypto";
import type { CompactPayload } from "./aiAnalysisSingleRunV0311.js";
import type { EvidenceSegmentCatalogV0324 } from "./aiAnalysisEvidenceSegmenterV0324.js";
import type { EvidenceQuoteCatalog, EvidenceQuoteCatalogEntry } from "./evidenceQuoteCatalogV0326.js";

export const MODEL_VISIBLE_QUOTE_MAP_VERSION_V0329 = "JAA-MODEL-VISIBLE-EVIDENCE-QUOTE-MAP-1.0.0" as const;
export const MODEL_VISIBLE_QUOTE_RECEIPT_VERSION_V0329 = "jaa-model-visible-evidence-quote-receipt-v1" as const;

export type ModelVisibleEvidenceQuoteV0329 = {
  evidenceQuoteId: string;
  text: string;
  evidenceRoleEligibility: Array<"PRIMARY_CHANGE" | "SUPPORTING_CONTEXT">;
  containerEvidenceSegmentId: string;
};

export type ModelVisibleQuoteMapV0329 = {
  schemaVersion: "jaa-model-visible-evidence-quote-map-v1";
  quoteMapVersion: typeof MODEL_VISIBLE_QUOTE_MAP_VERSION_V0329;
  records: Array<{ recordIndex: number; evidenceQuotes: ModelVisibleEvidenceQuoteV0329[] }>;
};

const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
const serialize = (value: unknown) => JSON.stringify(stable(value));
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };

function minimalQuote(entry: EvidenceQuoteCatalogEntry): ModelVisibleEvidenceQuoteV0329 {
  return { evidenceQuoteId: entry.evidenceQuoteId, text: entry.displayText, evidenceRoleEligibility: [...entry.evidenceRoleEligibility], containerEvidenceSegmentId: entry.containerEvidenceSegmentId };
}

export function buildModelVisibleEvidenceQuoteMapV0329(recordCount: number, segments: EvidenceSegmentCatalogV0324, catalog: EvidenceQuoteCatalog): ModelVisibleQuoteMapV0329 {
  const segmentOrder = new Map(segments.segments.map((segment, index) => [segment.evidenceSegmentId, index]));
  const sorted = [...catalog.entries].sort((a, b) => a.recordIndex - b.recordIndex || (segmentOrder.get(a.containerEvidenceSegmentId) ?? Number.MAX_SAFE_INTEGER) - (segmentOrder.get(b.containerEvidenceSegmentId) ?? Number.MAX_SAFE_INTEGER) || a.quoteOrdinal - b.quoteOrdinal || a.evidenceQuoteId.localeCompare(b.evidenceQuoteId));
  return { schemaVersion: "jaa-model-visible-evidence-quote-map-v1", quoteMapVersion: MODEL_VISIBLE_QUOTE_MAP_VERSION_V0329, records: Array.from({ length: recordCount }, (_, recordIndex) => ({ recordIndex, evidenceQuotes: sorted.filter((entry) => entry.recordIndex === recordIndex).map(minimalQuote) })) };
}

export function projectModelPayloadV0329(compact: CompactPayload, segments: EvidenceSegmentCatalogV0324, quoteMap: ModelVisibleQuoteMapV0329) {
  const groupedSegments = new Map<number, typeof segments.segments>();
  for (const segment of segments.segments) groupedSegments.set(segment.recordIndex, [...(groupedSegments.get(segment.recordIndex) ?? []), segment]);
  const quotes = new Map(quoteMap.records.map((record) => [record.recordIndex, record.evidenceQuotes]));
  return { ...compact, schemaVersion: "ai-analysis-compact-payload-v2" as const, buildAlgorithmVersion: "compact-builder-v2" as const, evidenceSegmenterVersion: segments.segmenterVersion, evidenceSegmentCatalogSha256: segments.catalogSha256, evidenceQuoteMapVersion: quoteMap.quoteMapVersion, records: compact.records.map((record, index) => ({ ...record, evidenceSegments: groupedSegments.get(index) ?? [], evidenceQuotes: quotes.get(index) ?? [] })) };
}

export function validateModelVisibleQuoteCoverageV0329(input: { runId: string; payload: ReturnType<typeof projectModelPayloadV0329>; quoteMap: ModelVisibleQuoteMapV0329; segments: EvidenceSegmentCatalogV0324; catalog: EvidenceQuoteCatalog }) {
  const started = Date.now();
  const catalogById = new Map(input.catalog.entries.map((entry) => [entry.evidenceQuoteId, entry]));
  const segmentById = new Map(input.segments.segments.map((entry) => [entry.evidenceSegmentId, entry]));
  const seen = new Map<string, number>(); const duplicateQuoteIds = new Set<string>(); const crossRecordQuoteIds = new Set<string>();
  for (const record of input.quoteMap.records) for (const quote of record.evidenceQuotes) {
    const prior = seen.get(quote.evidenceQuoteId); if (prior !== undefined) { duplicateQuoteIds.add(quote.evidenceQuoteId); if (prior !== record.recordIndex) crossRecordQuoteIds.add(quote.evidenceQuoteId); }
    seen.set(quote.evidenceQuoteId, record.recordIndex);
    const source = catalogById.get(quote.evidenceQuoteId); if (!source) return fail("AI_MODEL_VISIBLE_QUOTE_MAP_MISSING", `Quote ${quote.evidenceQuoteId} is absent from the frozen catalog.`);
    if (source.recordIndex !== record.recordIndex) fail("AI_MODEL_VISIBLE_QUOTE_CROSS_RECORD", `Quote ${quote.evidenceQuoteId} crossed records.`);
    if (source.containerEvidenceSegmentId !== quote.containerEvidenceSegmentId || !segmentById.has(quote.containerEvidenceSegmentId)) fail("AI_MODEL_VISIBLE_QUOTE_SEGMENT_MISMATCH", `Quote ${quote.evidenceQuoteId} segment mismatch.`);
    if (source.displayText !== quote.text) fail("AI_MODEL_VISIBLE_QUOTE_TEXT_MISMATCH", `Quote ${quote.evidenceQuoteId} text mismatch.`);
    if (serialize(source.evidenceRoleEligibility) !== serialize(quote.evidenceRoleEligibility)) fail("AI_MODEL_VISIBLE_QUOTE_ROLE_MISMATCH", `Quote ${quote.evidenceQuoteId} role mismatch.`);
  }
  if (duplicateQuoteIds.size) fail("AI_MODEL_VISIBLE_QUOTE_ID_DUPLICATE", [...duplicateQuoteIds].join(","));
  const primaryRecords = new Set(input.segments.segments.filter((item) => item.evidenceRoleEligibility === "PRIMARY_CHANGE").map((item) => item.recordIndex));
  const primaryQuoteRecords = new Set(input.quoteMap.records.filter((record) => record.evidenceQuotes.some((quote) => quote.evidenceRoleEligibility.includes("PRIMARY_CHANGE"))).map((record) => record.recordIndex));
  const missing = [...primaryRecords].filter((recordIndex) => !primaryQuoteRecords.has(recordIndex));
  if (missing.length) fail("AI_MODEL_VISIBLE_QUOTE_COVERAGE_INCOMPLETE", `Missing PRIMARY_CHANGE quote for records ${missing.join(",")}.`);
  const decoded = JSON.parse(JSON.stringify(input.quoteMap));
  const projectionSha256 = sha256(serialize(input.quoteMap)); if (projectionSha256 !== sha256(serialize(decoded))) fail("AI_MODEL_VISIBLE_QUOTE_PROJECTION_HASH_MISMATCH", "Projection changed after JSON encode/decode.");
  const payloadSha256 = sha256(serialize(input.payload));
  return { schemaVersion: MODEL_VISIBLE_QUOTE_RECEIPT_VERSION_V0329, runId: input.runId, quoteMapVersion: input.quoteMap.quoteMapVersion, sourceCatalogVersion: input.catalog.catalogVersion, sourceCatalogSha256: input.catalog.catalogSha256, sourceCatalogQuoteCount: input.catalog.quoteCount, modelVisibleQuoteCount: seen.size, recordCount: input.quoteMap.records.length, recordsWithEvidenceSegments: new Set(input.segments.segments.map((item) => item.recordIndex)).size, recordsWithPrimaryChangeSegments: primaryRecords.size, recordsWithQuotes: input.quoteMap.records.filter((record) => record.evidenceQuotes.length > 0).length, recordsWithPrimaryQuotes: primaryQuoteRecords.size, recordsMissingRequiredPrimaryQuote: missing, duplicateQuoteIds: [...duplicateQuoteIds], crossRecordQuoteIds: [...crossRecordQuoteIds], projectionSha256, payloadSha256, coveragePassed: true, providerDispatchAllowed: true, projectionBuildAndValidationDurationMs: Date.now() - started, createdAtUtc: new Date().toISOString() };
}
