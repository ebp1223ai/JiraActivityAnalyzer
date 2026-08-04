import crypto from "node:crypto";
import type { DescriptionDiffResult } from "./descriptionDiff.js";

export const DESCRIPTION_PREVIEW_LIMITS = { maxBatchSize: 100, maxLines: 6, maxCodePoints: 800 } as const;
export type OriginalContentAvailability = "available" | "available-empty" | "unavailable" | "source-mismatch";
export type OriginalContentValue = {
  availability: OriginalContentAvailability;
  raw: string | null;
  charCount: number | null;
  byteCountUtf8: number | null;
  lineCount: number | null;
  sha256Utf8: string | null;
};
export type OriginalContentPreviewValue = Omit<OriginalContentValue, "raw"> & {
  preview: string | null;
  truncated: boolean;
};
export type DescriptionComparisonPayload = {
  requestId: string;
  generation: string;
  databaseIdentity: string;
  activityEventId: string;
  issueKey: string;
  historyId: string | null;
  itemIndex: number | null;
  canonicalFieldId: string;
  sourceType: string;
  sourceId: string | null;
  before: OriginalContentValue;
  after: OriginalContentValue;
  diff: DescriptionDiffResult;
  diffInputBeforeSha256: string | null;
  diffInputAfterSha256: string | null;
  integrityStatus: "verified" | "not-applicable" | "mismatch";
  diagnosticsCode: string | null;
};
export type DescriptionOriginalPreviewPayload = Omit<DescriptionComparisonPayload, "before" | "after"> & {
  before: OriginalContentPreviewValue;
  after: OriginalContentPreviewValue;
};
export type DescriptionPreviewBatchResponse = {
  requestId: string;
  generation: string;
  databaseIdentity: string;
  items: DescriptionOriginalPreviewPayload[];
  errors: Array<{ activityEventId: string; code: string }>;
};

export function sha256Utf8(raw: string) {
  return crypto.createHash("sha256").update(Buffer.from(raw, "utf8")).digest("hex");
}

export function originalLineCount(raw: string) {
  return raw === "" ? 0 : (raw.match(/\r\n|\r|\n/g)?.length ?? 0) + 1;
}

export function originalContentMetadata(raw: string | null, availability?: OriginalContentAvailability): OriginalContentValue {
  const resolvedAvailability = availability ?? (raw === null ? "unavailable" : raw === "" ? "available-empty" : "available");
  if (raw === null || resolvedAvailability === "unavailable" || resolvedAvailability === "source-mismatch") {
    return { availability: resolvedAvailability, raw: null, charCount: null, byteCountUtf8: null, lineCount: null, sha256Utf8: null };
  }
  return {
    availability: resolvedAvailability,
    raw,
    charCount: Array.from(raw).length,
    byteCountUtf8: Buffer.byteLength(raw, "utf8"),
    lineCount: originalLineCount(raw),
    sha256Utf8: sha256Utf8(raw)
  };
}

type SegmenterLike = new (locale?: string, options?: { granularity: "grapheme" }) => {
  segment(value: string): Iterable<{ segment: string; index: number }>;
};

function graphemeCut(raw: string, maxCodePoints: number) {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterLike }).Segmenter;
  if (!Segmenter) {
    const points = Array.from(raw);
    return points.length <= maxCodePoints ? raw.length : points.slice(0, maxCodePoints).join("").length;
  }
  let count = 0;
  for (const part of new Segmenter(undefined, { granularity: "grapheme" }).segment(raw)) {
    const next = count + Array.from(part.segment).length;
    if (next > maxCodePoints) return part.index;
    count = next;
  }
  return raw.length;
}

function logicalLineCut(raw: string, maxLines: number) {
  const separators = /\r\n|\r|\n/g;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = separators.exec(raw))) {
    count += 1;
    if (count >= maxLines) return match.index;
  }
  return raw.length;
}

export function originalContentPreview(raw: string | null, availability?: OriginalContentAvailability): OriginalContentPreviewValue {
  const metadata = originalContentMetadata(raw, availability);
  if (metadata.raw === null) {
    return { availability: metadata.availability, preview: null, truncated: false, charCount: null, byteCountUtf8: null, lineCount: null, sha256Utf8: null };
  }
  const cut = Math.min(
    graphemeCut(metadata.raw, DESCRIPTION_PREVIEW_LIMITS.maxCodePoints),
    logicalLineCut(metadata.raw, DESCRIPTION_PREVIEW_LIMITS.maxLines)
  );
  return {
    availability: metadata.availability,
    preview: metadata.raw.slice(0, cut),
    truncated: cut < metadata.raw.length,
    charCount: metadata.charCount,
    byteCountUtf8: metadata.byteCountUtf8,
    lineCount: metadata.lineCount,
    sha256Utf8: metadata.sha256Utf8
  };
}

export function comparisonIntegrity(
  before: OriginalContentValue,
  after: OriginalContentValue,
  diff: DescriptionDiffResult
): { status: "verified" | "not-applicable" | "mismatch"; code: string | null } {
  if (diff.status === "source-mismatch") return { status: "not-applicable", code: diff.diagnosticsCode };
  const checks: boolean[] = [];
  if (before.sha256Utf8 !== null) checks.push(before.sha256Utf8 === diff.diffInputBeforeSha256);
  if (after.sha256Utf8 !== null) checks.push(after.sha256Utf8 === diff.diffInputAfterSha256);
  if (!checks.length) return { status: "not-applicable", code: diff.diagnosticsCode };
  return checks.every(Boolean)
    ? { status: "verified", code: diff.diagnosticsCode }
    : { status: "mismatch", code: "DESCRIPTION_COMPARISON_INTEGRITY_MISMATCH" };
}

export function previewFromComparison(payload: DescriptionComparisonPayload): DescriptionOriginalPreviewPayload {
  return {
    ...payload,
    before: originalContentPreview(payload.before.raw, payload.before.availability),
    after: originalContentPreview(payload.after.raw, payload.after.availability)
  };
}
