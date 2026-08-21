import crypto from "node:crypto";
import { TextDecoder } from "node:util";

export const SEGMENT_PLANNER_VERSION_V0331 = "jaa-protected-token-safe-segment-planner-v1" as const;
export const SEGMENT_SCHEMA_VERSION_V0331 = "jaa-model-input-segment-v3" as const;
export const SEGMENT_BOUNDARY_RECEIPT_VERSION_V0331 = "jaa-segment-boundary-safety-receipt-v1" as const;
export const PROVIDER_TRANSPORT_V0331 = "bridge-resumable-v4" as const;

export type ProtectedTokenTypeV0331 =
  | "EVIDENCE_QUOTE_ID" | "SKILL_ID" | "RECORD_INDEX_LITERAL" | "DECISION_STATUS_LITERAL"
  | "CONFIDENCE_LITERAL" | "CONTRACT_IDENTITY" | "VERSION_IDENTITY" | "SHA256_LITERAL"
  | "SOURCE_RECORD_STABLE_ID" | "EVIDENCE_SEGMENT_ID" | "EVIDENCE_REF";

export type ProtectedTokenSpanV0331 = {
  fileId: string;
  tokenType: ProtectedTokenTypeV0331;
  startByte: number;
  endByteExclusive: number;
  tokenBytes: number;
  tokenSha256: string;
  jsonPointerOrSource: string;
  value: string;
};

export type SafeSegmentV0331 = {
  index: number;
  startByte: number;
  endByteExclusive: number;
  bytes: Buffer;
  sha256: string;
  boundaryBefore: BoundarySafetyV0331;
  boundaryAfter: BoundarySafetyV0331;
};

export type BoundarySafetyV0331 = { offset: number; utf8Safe: boolean; escapeSafe: boolean; protectedTokenSafe: boolean };

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const strictUtf8 = (bytes: Buffer) => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw Object.assign(new Error("AI_INPUT_UTF8_INVALID:Model input is not valid UTF-8."), { code: "AI_INPUT_UTF8_INVALID" }); }
};
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };
const stable = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`
    : JSON.stringify(value);

function byteOffset(text: string, characterOffset: number) { return Buffer.byteLength(text.slice(0, characterOffset), "utf8"); }

function addMatches(output: ProtectedTokenSpanV0331[], text: string, fileId: string, tokenType: ProtectedTokenTypeV0331, pattern: RegExp, source: string) {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
    const value = match[0]; const characterStart = match.index ?? 0; const startByte = byteOffset(text, characterStart); const tokenBytes = Buffer.byteLength(value, "utf8");
    output.push({ fileId, tokenType, startByte, endByteExclusive: startByte + tokenBytes, tokenBytes, tokenSha256: sha256(value), jsonPointerOrSource: source, value });
  }
}

export function extractProtectedTokenSpansV0331(bytes: Buffer, input: { fileId: string; catalogSkillIds: readonly string[]; requireJson?: boolean }) {
  const text = strictUtf8(bytes);
  if (input.requireJson) try { JSON.parse(text); } catch { fail("AI_MODEL_INPUT_PROTECTED_TOKEN_DISCOVERY_FAILED", `${input.fileId} is malformed JSON.`); }
  const spans: ProtectedTokenSpanV0331[] = [];
  addMatches(spans, text, input.fileId, "EVIDENCE_QUOTE_ID", /eq_[a-f0-9]{32}/gi, "evidenceQuoteId");
  addMatches(spans, text, input.fileId, "EVIDENCE_SEGMENT_ID", /seg_[a-f0-9]+/gi, "segmentId");
  addMatches(spans, text, input.fileId, "SHA256_LITERAL", /\b[a-f0-9]{64}\b/gi, "sha256");
  addMatches(spans, text, input.fileId, "SOURCE_RECORD_STABLE_ID", /\b(?:sourceRecordStableId|sourceDiffId)\s*[=:]\s*["']?([A-Za-z0-9_.:-]+)/gi, "sourceRecordStableId");
  addMatches(spans, text, input.fileId, "EVIDENCE_REF", /\b(?:evidenceRef|evidenceId)\s*[=:]\s*["']?([A-Za-z0-9_.:-]+)/gi, "evidenceRef");
  addMatches(spans, text, input.fileId, "RECORD_INDEX_LITERAL", /"recordIndex"\s*:\s*\d+/g, "recordIndex");
  addMatches(spans, text, input.fileId, "DECISION_STATUS_LITERAL", /\b(?:CLASSIFIED|UNKNOWN|INSUFFICIENT_EVIDENCE|NOT_APPLICABLE)\b/g, "decisionStatus");
  addMatches(spans, text, input.fileId, "CONFIDENCE_LITERAL", /"confidence"\s*:\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\b/g, "confidence");
  addMatches(spans, text, input.fileId, "CONTRACT_IDENTITY", /\bjaa-[a-z0-9.-]+-v\d+(?:\.\d+)*\b/gi, "contractIdentity");
  addMatches(spans, text, input.fileId, "VERSION_IDENTITY", /\b(?:JAA-[A-Z0-9_.-]+|\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)\b/g, "versionIdentity");
  for (const skillId of [...new Set(input.catalogSkillIds)].sort()) {
    if (!skillId) continue;
    let from = 0;
    while ((from = text.indexOf(skillId, from)) >= 0) {
      const before = text[from - 1] ?? ""; const after = text[from + skillId.length] ?? "";
      if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) {
        const startByte = byteOffset(text, from); const tokenBytes = Buffer.byteLength(skillId);
        spans.push({ fileId: input.fileId, tokenType: "SKILL_ID", startByte, endByteExclusive: startByte + tokenBytes, tokenBytes, tokenSha256: sha256(skillId), jsonPointerOrSource: "validatedCatalogExactSet", value: skillId });
      }
      from += skillId.length;
    }
  }
  const unique = new Map<string, ProtectedTokenSpanV0331>();
  for (const span of spans) unique.set(`${span.tokenType}:${span.startByte}:${span.endByteExclusive}`, span);
  return [...unique.values()].sort((a, b) => a.startByte - b.startByte || a.endByteExclusive - b.endByteExclusive || a.tokenType.localeCompare(b.tokenType));
}

function safeBoundarySets(text: string, spans: readonly ProtectedTokenSpanV0331[]) {
  const utf8 = new Set<number>([0]); let bytes = 0;
  for (const point of text) { bytes += Buffer.byteLength(point); utf8.add(bytes); }
  const escapeUnsafe = new Set<number>();
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\r" && text[index + 1] === "\n") escapeUnsafe.add(byteOffset(text, index + 1));
    if (text[index] !== "\\") continue;
    const length = text[index + 1] === "u" && /^[a-f0-9]{4}$/i.test(text.slice(index + 2, index + 6)) ? 6 : 2;
    for (let inner = 1; inner < length; inner += 1) escapeUnsafe.add(byteOffset(text, index + inner));
  }
  const protectedUnsafe = new Set<number>();
  for (const span of spans) for (let offset = span.startByte + 1; offset < span.endByteExclusive; offset += 1) protectedUnsafe.add(offset);
  return { utf8, escapeUnsafe, protectedUnsafe };
}

export function planProtectedTokenSafeSegmentsV1(bytes: Buffer, protectedSpans: readonly ProtectedTokenSpanV0331[], byteLimit = 4096) {
  if (!Number.isInteger(byteLimit) || byteLimit <= 0) fail("AI_MODEL_INPUT_SEGMENT_PLAN_INVALID", "Segment byte limit must be a positive integer.");
  for (const span of protectedSpans) if (span.tokenBytes > byteLimit) fail("AI_PROTECTED_TOKEN_EXCEEDS_SEGMENT_LIMIT", `${span.tokenType} token exceeds ${byteLimit} bytes.`);
  const text = strictUtf8(bytes); const safety = safeBoundarySets(text, protectedSpans); const segments: SafeSegmentV0331[] = [];
  const at = (offset: number): BoundarySafetyV0331 => ({ offset, utf8Safe: safety.utf8.has(offset), escapeSafe: !safety.escapeUnsafe.has(offset), protectedTokenSafe: !safety.protectedUnsafe.has(offset) });
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + byteLimit, bytes.length);
    while (end > start && (!safety.utf8.has(end) || safety.escapeUnsafe.has(end) || safety.protectedUnsafe.has(end))) end -= 1;
    if (end <= start) fail("AI_MODEL_INPUT_SEGMENT_BOUNDARY_UNSAFE", `No safe segment boundary after byte ${start}.`);
    const part = bytes.subarray(start, end); const before = at(start); const after = at(end);
    if (!before.utf8Safe || !before.escapeSafe || !before.protectedTokenSafe || !after.utf8Safe || !after.escapeSafe || !after.protectedTokenSafe) fail("AI_MODEL_INPUT_SEGMENT_BOUNDARY_UNSAFE", `Unsafe boundary at ${start}..${end}.`);
    segments.push({ index: segments.length, startByte: start, endByteExclusive: end, bytes: part, sha256: sha256(part), boundaryBefore: before, boundaryAfter: after }); start = end;
  }
  const reassembled = Buffer.concat(segments.map((segment) => segment.bytes));
  if (!reassembled.equals(bytes)) fail("AI_MODEL_INPUT_SEGMENT_REASSEMBLY_MISMATCH", "Segment reassembly does not match source bytes.");
  const planValue = segments.map(({ bytes: _bytes, ...segment }) => segment);
  const segmentPlanSha256 = sha256(stable({ plannerVersion: SEGMENT_PLANNER_VERSION_V0331, byteLimit, sourceBytes: bytes.length, sourceSha256: sha256(bytes), segments: planValue }));
  return { plannerVersion: SEGMENT_PLANNER_VERSION_V0331, byteLimit, sourceBytes: bytes.length, sourceSha256: sha256(bytes), protectedTokenCount: protectedSpans.length, protectedTokenCutCount: 0, reassemblyBytes: reassembled.length, reassemblySha256: sha256(reassembled), reassemblyVerified: true, segments, segmentPlanSha256 };
}

export function createBoundarySafetyReceiptV0331(runId: string, files: Array<{ fileId: string; plan: ReturnType<typeof planProtectedTokenSafeSegmentsV1>; spans: readonly ProtectedTokenSpanV0331[] }>, createdAtUtc = new Date().toISOString()) {
  const totalSegments = files.reduce((sum, file) => sum + file.plan.segments.length, 0);
  const totalBytes = files.reduce((sum, file) => sum + file.plan.sourceBytes, 0);
  const protectedTokenCount = files.reduce((sum, file) => sum + file.spans.length, 0);
  const fileReceipts = files.map((file) => ({ fileId: file.fileId, sourceBytes: file.plan.sourceBytes, sourceSha256: file.plan.sourceSha256, segmentCount: file.plan.segments.length, protectedTokenCount: file.spans.length, protectedTokenCutCount: 0, reassemblyBytes: file.plan.reassemblyBytes, reassemblySha256: file.plan.reassemblySha256, reassemblyVerified: true, segmentPlanSha256: file.plan.segmentPlanSha256, status: "passed" }));
  const segmentPlanSha256 = sha256(stable(fileReceipts.map((file) => ({ fileId: file.fileId, segmentPlanSha256: file.segmentPlanSha256 }))));
  const core = { schemaVersion: SEGMENT_BOUNDARY_RECEIPT_VERSION_V0331, runId, transportProtocol: PROVIDER_TRANSPORT_V0331, segmentSchemaVersion: SEGMENT_SCHEMA_VERSION_V0331, plannerVersion: SEGMENT_PLANNER_VERSION_V0331, byteLimit: files[0]?.plan.byteLimit ?? 4096, fileCount: files.length, totalBytes, totalSegments, protectedTokenCount, boundaryCount: Math.max(0, totalSegments - files.length), unsafeUtf8BoundaryCount: 0, unsafeEscapeBoundaryCount: 0, protectedTokenCutCount: 0, coverageGapCount: 0, coverageOverlapCount: 0, reassemblyVerified: files.every((file) => file.plan.reassemblyVerified), segmentPlanSha256, files: fileReceipts, status: "passed", providerDispatchAllowed: true } as const;
  return { ...core, boundarySafetyReceiptSha256: sha256(stable(core)), createdAtUtc };
}
