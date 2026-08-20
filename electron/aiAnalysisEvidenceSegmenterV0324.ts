import crypto from "node:crypto";
import type { AiPendingDataset } from "../shared/aiAnalysisContract.js";
import type { CompactPayload } from "./aiAnalysisSingleRunV0311.js";

export const EVIDENCE_SEGMENTER_VERSION = "JAA-EVIDENCE-SEGMENTER-1.0.0" as const;
export const EVIDENCE_SEGMENT_CATALOG_SCHEMA = "jaa-evidence-segment-catalog-v1" as const;
export type EvidenceRoleEligibility = "PRIMARY_CHANGE" | "SUPPORTING_CONTEXT" | "INELIGIBLE";
export type EvidenceSegmentV0324 = {
  evidenceSegmentId: string; recordIndex: number; sourceRecordStableId: string; evidenceRef: string; hunkId: string | null;
  lineType: "ADDED" | "REMOVED" | "CONTEXT" | "UNKNOWN"; oldLineNumber: number | null; newLineNumber: number | null;
  exactText: string; evidenceRoleEligibility: EvidenceRoleEligibility; sourceJsonPointer: string; segmentSha256: string;
};
export type EvidenceSegmentCatalogV0324 = { schemaVersion: typeof EVIDENCE_SEGMENT_CATALOG_SCHEMA; segmenterVersion: typeof EVIDENCE_SEGMENTER_VERSION; runId: string; generatedAt: string; recordCount: number; segmentCount: number; segments: EvidenceSegmentV0324[]; catalogSha256: string };

const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])])) : value;
function classifyLine(type: string) { const value = type.trim().toLowerCase(); if (["+", "add", "added", "insert"].includes(value)) return { lineType: "ADDED" as const, role: "PRIMARY_CHANGE" as const }; if (["-", "remove", "removed", "delete", "deleted"].includes(value)) return { lineType: "REMOVED" as const, role: "PRIMARY_CHANGE" as const }; if ([" ", "context", "unchanged", "same"].includes(value) || !value) return { lineType: "CONTEXT" as const, role: "SUPPORTING_CONTEXT" as const }; return { lineType: "UNKNOWN" as const, role: "INELIGIBLE" as const }; }

export function buildEvidenceSegmentCatalogV0324(runId: string, dataset: AiPendingDataset, compact: CompactPayload): EvidenceSegmentCatalogV0324 {
  const sourceById = new Map(dataset.diffs.map((diff) => [diff.sourceDiffId, diff])); const segments: EvidenceSegmentV0324[] = [];
  compact.records.forEach((record, recordIndex) => {
    const source = sourceById.get(record.sourceRecordStableId); if (!source) return;
    const append = (input: Omit<EvidenceSegmentV0324, "evidenceSegmentId" | "segmentSha256">) => { const identity = JSON.stringify(canonical(input)); const segmentSha256 = sha256(identity); segments.push({ ...input, evidenceSegmentId: `seg_${segmentSha256.slice(0, 24)}`, segmentSha256 }); };
    source.diffHunks.forEach((hunk, hunkIndex) => {
      let oldLine = hunk.oldStart, newLine = hunk.newStart; const hunkId = `hunk_${recordIndex}_${hunkIndex + 1}`;
      hunk.lines.forEach((line, lineIndex) => {
        const classification = classifyLine(line.type); const oldLineNumber = classification.lineType === "ADDED" ? null : oldLine; const newLineNumber = classification.lineType === "REMOVED" ? null : newLine;
        append({ recordIndex, sourceRecordStableId: record.sourceRecordStableId, evidenceRef: record.evidenceId, hunkId, lineType: classification.lineType, oldLineNumber, newLineNumber, exactText: line.text, evidenceRoleEligibility: classification.role, sourceJsonPointer: `/diffs/${dataset.diffs.indexOf(source)}/diffHunks/${hunkIndex}/lines/${lineIndex}` });
        if (classification.lineType !== "ADDED") oldLine += 1; if (classification.lineType !== "REMOVED") newLine += 1;
      });
    });
    if (!source.diffHunks.length) {
      source.addedLineCount && record.addedText.forEach((text, index) => append({ recordIndex, sourceRecordStableId: record.sourceRecordStableId, evidenceRef: record.evidenceId, hunkId: null, lineType: "ADDED", oldLineNumber: null, newLineNumber: index + 1, exactText: text, evidenceRoleEligibility: "PRIMARY_CHANGE", sourceJsonPointer: `/diffs/${dataset.diffs.indexOf(source)}/addedText/${index}` }));
      source.removedLineCount && record.removedText.forEach((text, index) => append({ recordIndex, sourceRecordStableId: record.sourceRecordStableId, evidenceRef: record.evidenceId, hunkId: null, lineType: "REMOVED", oldLineNumber: index + 1, newLineNumber: null, exactText: text, evidenceRoleEligibility: "PRIMARY_CHANGE", sourceJsonPointer: `/diffs/${dataset.diffs.indexOf(source)}/removedText/${index}` }));
    }
  });
  const base = { schemaVersion: EVIDENCE_SEGMENT_CATALOG_SCHEMA, segmenterVersion: EVIDENCE_SEGMENTER_VERSION, runId, generatedAt: new Date().toISOString(), recordCount: compact.records.length, segmentCount: segments.length, segments } as const;
  return { ...base, catalogSha256: sha256(JSON.stringify(canonical(base))) };
}

export function modelPayloadWithSegmentsV0324(compact: CompactPayload, catalog: EvidenceSegmentCatalogV0324) {
  const grouped = new Map<number, EvidenceSegmentV0324[]>(); for (const segment of catalog.segments) grouped.set(segment.recordIndex, [...(grouped.get(segment.recordIndex) ?? []), segment]);
  return { ...compact, evidenceSegmenterVersion: catalog.segmenterVersion, evidenceSegmentCatalogSha256: catalog.catalogSha256, records: compact.records.map((record, index) => ({ ...record, evidenceSegments: grouped.get(index) ?? [] })) };
}