export const DESCRIPTION_DIFF_LIMITS = { contextLines: 2, maxCharacters: 200_000, maxFullContextCharacters: 1_000_000, maxLines: 4_000, maxNodes: 10_000, maxDepth: 64, maxWorkUnits: 2_000_000 } as const;
export type DescriptionDiffStatus = "changed" | "unchanged" | "whitespace-only" | "before-unavailable" | "after-unavailable" | "source-mismatch" | "unparseable" | "diff-too-large";
export type DescriptionDiffDiagnosticsCode = "DESCRIPTION_SOURCE_TYPE_MISMATCH" | "DESCRIPTION_EVENT_IDENTITY_MISMATCH" | "DESCRIPTION_EVIDENCE_AMBIGUOUS" | "DESCRIPTION_BEFORE_UNAVAILABLE" | "DESCRIPTION_AFTER_UNAVAILABLE" | "DESCRIPTION_CANONICALIZE_FAILED" | "DESCRIPTION_DIFF_TOO_LARGE" | "DESCRIPTION_DIFF_BUILD_FAILED";
export type DiffLineKind = "context" | "delete" | "insert";
export type DiffInlineSegment = { kind: "equal" | "delete" | "insert"; text: string };
export type DiffLine = { kind: DiffLineKind; oldLineNumber: number | null; newLineNumber: number | null; text: string; inlineSegments?: DiffInlineSegment[] };
export type DiffHunk = { id: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] };
export type DescriptionDiffSide = { available: boolean; complete: boolean; value?: unknown };
export type DescriptionDiffInput = { eventId: string; issueKey: string; fieldId?: string | null; fieldName?: string | null; sourceType: string; sourceId: string | null; changelogHistoryId?: string | null; changelogItemIndex?: number | null; candidateCount?: number; before: DescriptionDiffSide; after: DescriptionDiffSide };
export type DescriptionDiffResult = { eventId: string; issueKey: string; fieldIdentity: string; sourceType: string; sourceId: string | null; status: DescriptionDiffStatus; hunks: DiffHunk[]; addedLines: number; deletedLines: number; changedHunks: number; beforeAvailable: boolean; afterAvailable: boolean; beforeComplete: boolean; afterComplete: boolean; beforeLength: number | null; afterLength: number | null; diagnosticsCode: DescriptionDiffDiagnosticsCode | null };
export type DescriptionFullContextResult = { eventId: string; issueKey: string; status: "ready" | Exclude<DescriptionDiffStatus, "changed" | "unchanged" | "whitespace-only">; diffStatus: DescriptionDiffStatus; beforeText: string | null; afterText: string | null; beforeAvailable: boolean; afterAvailable: boolean; beforeComplete: boolean; afterComplete: boolean; diagnosticsCode: DescriptionDiffDiagnosticsCode | null };
type CanonicalContent = { displayText: string; comparisonText: string; parseable: boolean };
type LineOperation = { kind: "equal" | "delete" | "insert"; text: string };
class DiffGuardError extends Error {}

function decodeHtml(value: string) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<(br|hr)\b[^>]*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}
function collectContent(value: unknown, state: { nodes: number; seen: Set<object> }, depth = 0): string {
  if (depth > DESCRIPTION_DIFF_LIMITS.maxDepth || ++state.nodes > DESCRIPTION_DIFF_LIMITS.maxNodes) throw new DiffGuardError("CONTENT_GUARD");
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return /<\/?[a-z][\s\S]*>/i.test(value) ? decodeHtml(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object") throw new Error("UNSUPPORTED_CONTENT");
  if (state.seen.has(value)) throw new Error("CYCLIC_CONTENT");
  state.seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => collectContent(item, state, depth + 1)).filter(Boolean).join("\n");
    const source = value as Record<string, unknown>;
    if (typeof source.text === "string") return source.text;
    if (String(source.type ?? "").toLowerCase() === "hardbreak") return "\n";
    const preferred = ["content", "body", "value", "description", "comment", "items", "children"];
    const keys = preferred.filter((key) => source[key] !== undefined);
    const selected = keys.length ? keys : Object.keys(source).filter((key) => !["type", "attrs", "marks", "version"].includes(key));
    const text = selected.map((key) => collectContent(source[key], state, depth + 1)).filter(Boolean).join("\n");
    return /^(paragraph|heading|listitem|blockquote|codeblock)$/i.test(String(source.type ?? "")) && text ? `${text}\n` : text;
  } finally { state.seen.delete(value); }
}
function substantiveText(value: string) { return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\t/g, " ").replace(/[ \u00a0]+/g, " ").trim()).filter(Boolean).join("\n").trim(); }
export function canonicalizeDescriptionContent(value: unknown): CanonicalContent {
  try { const displayText = collectContent(value, { nodes: 0, seen: new Set() }).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim(); return { displayText, comparisonText: substantiveText(displayText), parseable: true }; }
  catch { return { displayText: "", comparisonText: "", parseable: false }; }
}
function exactDescriptionIdentity(input: DescriptionDiffInput) { const fieldId = String(input.fieldId ?? "").trim().toLowerCase(); const fieldName = String(input.fieldName ?? "").trim().toLowerCase(); return fieldId === "description" || (!fieldId && fieldName === "description") ? "description" : fieldId || fieldName; }
function identityError(input: DescriptionDiffInput): DescriptionDiffDiagnosticsCode | null {
  if (!input.eventId || !input.issueKey || exactDescriptionIdentity(input) !== "description") return "DESCRIPTION_EVENT_IDENTITY_MISMATCH";
  const sourceType = String(input.sourceType).trim().toLowerCase();
  if (!new Set(["jira_changelog", "changelog"]).has(sourceType)) return "DESCRIPTION_SOURCE_TYPE_MISMATCH";
  if ((input.candidateCount ?? 1) !== 1) return "DESCRIPTION_EVIDENCE_AMBIGUOUS";
  if (!input.sourceId) return "DESCRIPTION_EVENT_IDENTITY_MISMATCH";
  if (input.changelogHistoryId != null && input.changelogItemIndex != null && input.sourceId !== `${input.changelogHistoryId}:${input.changelogItemIndex}`) return "DESCRIPTION_EVENT_IDENTITY_MISMATCH";
  return null;
}
function splitLines(value: string) { return value === "" ? [] : value.split("\n"); }
function myersLineDiff(before: string[], after: string[]): LineOperation[] {
  const max = before.length + after.length; let frontier = new Map<number, number>([[1, 0]]); const trace: Array<Map<number, number>> = [];
  for (let distance = 0; distance <= max; distance += 1) {
    if ((distance + 1) ** 2 > DESCRIPTION_DIFF_LIMITS.maxWorkUnits) throw new DiffGuardError("DIFF_WORK_GUARD");
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY; const right = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
      let x = diagonal === -distance || (diagonal !== distance && right < down) ? down : right + 1; if (!Number.isFinite(x)) x = 0; let y = x - diagonal;
      while (x < before.length && y < after.length && before[x] === after[y]) { x += 1; y += 1; }
      frontier.set(diagonal, x); if (x >= before.length && y >= after.length) return backtrack(trace, before, after);
    }
  }
  throw new Error("DESCRIPTION_DIFF_BUILD_FAILED");
}
function backtrack(trace: Array<Map<number, number>>, before: string[], after: string[]): LineOperation[] {
  let x = before.length; let y = after.length; const operations: LineOperation[] = [];
  for (let distance = trace.length - 1; distance >= 0; distance -= 1) {
    const frontier = trace[distance]; const diagonal = x - y; const down = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY; const right = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
    const previousDiagonal = diagonal === -distance || (diagonal !== distance && right < down) ? diagonal + 1 : diagonal - 1;
    const previousX = Math.max(0, frontier.get(previousDiagonal) ?? 0); const previousY = previousX - previousDiagonal;
    while (x > previousX && y > previousY) { operations.push({ kind: "equal", text: before[x - 1] }); x -= 1; y -= 1; }
    if (distance === 0) break;
    if (x === previousX) { operations.push({ kind: "insert", text: after[y - 1] }); y -= 1; } else { operations.push({ kind: "delete", text: before[x - 1] }); x -= 1; }
  }
  return operations.reverse();
}
type IntlSegmenterLike = new (locale?: string, options?: { granularity: "grapheme" }) => { segment(value: string): Iterable<{ segment: string }> };
function graphemes(value: string) {
  const Segmenter = (Intl as unknown as { Segmenter?: IntlSegmenterLike }).Segmenter;
  return Segmenter ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value), (item) => item.segment) : Array.from(value);
}
function inlineSegments(before: string, after: string) {
  const left = graphemes(before); const right = graphemes(after); let prefix = 0; while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0; while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  const start = left.slice(0, prefix).join(""); const end = left.slice(left.length - suffix).join(""); const removed = left.slice(prefix, left.length - suffix).join(""); const inserted = right.slice(prefix, right.length - suffix).join("");
  const beforeSegments: DiffInlineSegment[] = []; const afterSegments: DiffInlineSegment[] = [];
  if (start) { beforeSegments.push({ kind: "equal", text: start }); afterSegments.push({ kind: "equal", text: start }); }
  if (removed) beforeSegments.push({ kind: "delete", text: removed }); if (inserted) afterSegments.push({ kind: "insert", text: inserted });
  if (end) { beforeSegments.push({ kind: "equal", text: end }); afterSegments.push({ kind: "equal", text: end }); }
  return { beforeSegments, afterSegments };
}
function numberedLines(operations: LineOperation[]): DiffLine[] {
  let oldLine = 1; let newLine = 1;
  const lines = operations.map<DiffLine>((operation) => operation.kind === "equal" ? { kind: "context", oldLineNumber: oldLine++, newLineNumber: newLine++, text: operation.text } : operation.kind === "delete" ? { kind: "delete", oldLineNumber: oldLine++, newLineNumber: null, text: operation.text } : { kind: "insert", oldLineNumber: null, newLineNumber: newLine++, text: operation.text });
  for (let index = 0; index < lines.length;) {
    if (lines[index].kind === "context") { index += 1; continue; }
    let end = index; while (end < lines.length && lines[end].kind !== "context") end += 1;
    const deleted = lines.slice(index, end).filter((line) => line.kind === "delete"); const inserted = lines.slice(index, end).filter((line) => line.kind === "insert");
    for (let pair = 0; pair < Math.min(deleted.length, inserted.length); pair += 1) { const segments = inlineSegments(deleted[pair].text, inserted[pair].text); deleted[pair].inlineSegments = segments.beforeSegments; inserted[pair].inlineSegments = segments.afterSegments; }
    index = end;
  }
  return lines;
}
function buildHunks(eventId: string, operations: LineOperation[]) {
  const lines = numberedLines(operations); const changes = lines.flatMap((line, index) => line.kind === "context" ? [] : [index]); if (!changes.length) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  for (const change of changes) {
    let start = change; let count = 0; while (start > 0 && lines[start - 1].kind === "context" && count++ < DESCRIPTION_DIFF_LIMITS.contextLines) start -= 1;
    let end = change; count = 0; while (end + 1 < lines.length && lines[end + 1].kind === "context" && count++ < DESCRIPTION_DIFF_LIMITS.contextLines) end += 1;
    const current = ranges[ranges.length - 1]; if (current && start <= current.end + 1) current.end = Math.max(current.end, end); else ranges.push({ start, end });
  }
  return ranges.map<DiffHunk>((range, index) => { const hunkLines = lines.slice(range.start, range.end + 1); const oldStart = hunkLines.find((line) => line.oldLineNumber !== null)?.oldLineNumber ?? 1; const newStart = hunkLines.find((line) => line.newLineNumber !== null)?.newLineNumber ?? 1; return { id: `${eventId}:hunk:${index + 1}:${oldStart}:${newStart}`, oldStart, oldLines: hunkLines.filter((line) => line.kind !== "insert").length, newStart, newLines: hunkLines.filter((line) => line.kind !== "delete").length, lines: hunkLines }; });
}
function result(input: DescriptionDiffInput, status: DescriptionDiffStatus, diagnosticsCode: DescriptionDiffDiagnosticsCode | null, beforeLength: number | null, afterLength: number | null, hunks: DiffHunk[] = []): DescriptionDiffResult {
  return { eventId: input.eventId, issueKey: input.issueKey, fieldIdentity: exactDescriptionIdentity(input), sourceType: String(input.sourceType).trim().toLowerCase(), sourceId: input.sourceId, status, hunks, addedLines: hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "insert").length, deletedLines: hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === "delete").length, changedHunks: hunks.length, beforeAvailable: input.before.available, afterAvailable: input.after.available, beforeComplete: input.before.complete, afterComplete: input.after.complete, beforeLength, afterLength, diagnosticsCode };
}
export function buildDescriptionDiff(input: DescriptionDiffInput): DescriptionDiffResult {
  const mismatch = identityError(input); if (mismatch) return result(input, "source-mismatch", mismatch, null, null);
  if (!input.before.available || !input.before.complete) return result(input, "before-unavailable", "DESCRIPTION_BEFORE_UNAVAILABLE", null, null);
  if (!input.after.available || !input.after.complete) return result(input, "after-unavailable", "DESCRIPTION_AFTER_UNAVAILABLE", null, null);
  const before = canonicalizeDescriptionContent(input.before.value); const after = canonicalizeDescriptionContent(input.after.value);
  if (!before.parseable || !after.parseable) return result(input, "unparseable", "DESCRIPTION_CANONICALIZE_FAILED", null, null);
  const beforeLength = before.displayText.length; const afterLength = after.displayText.length; const beforeLines = splitLines(before.displayText); const afterLines = splitLines(after.displayText);
  if (beforeLength + afterLength > DESCRIPTION_DIFF_LIMITS.maxCharacters || beforeLines.length > DESCRIPTION_DIFF_LIMITS.maxLines || afterLines.length > DESCRIPTION_DIFF_LIMITS.maxLines) return result(input, "diff-too-large", "DESCRIPTION_DIFF_TOO_LARGE", beforeLength, afterLength);
  if (before.displayText === after.displayText) return result(input, "unchanged", null, beforeLength, afterLength);
  if (before.comparisonText === after.comparisonText) return result(input, "whitespace-only", null, beforeLength, afterLength);
  try { const hunks = buildHunks(input.eventId, myersLineDiff(beforeLines, afterLines)); return result(input, "changed", null, beforeLength, afterLength, hunks); }
  catch (error) { return result(input, error instanceof DiffGuardError ? "diff-too-large" : "unparseable", error instanceof DiffGuardError ? "DESCRIPTION_DIFF_TOO_LARGE" : "DESCRIPTION_DIFF_BUILD_FAILED", beforeLength, afterLength); }
}
export function resolveDescriptionFullContext(input: DescriptionDiffInput, expectedEventId: string): DescriptionFullContextResult {
  const checked = expectedEventId === input.eventId ? buildDescriptionDiff(input) : result(input, "source-mismatch", "DESCRIPTION_EVENT_IDENTITY_MISMATCH", null, null);
  if (["source-mismatch", "unparseable", "before-unavailable", "after-unavailable"].includes(checked.status)) return { eventId: input.eventId, issueKey: input.issueKey, status: checked.status as DescriptionFullContextResult["status"], diffStatus: checked.status, beforeText: null, afterText: null, beforeAvailable: checked.beforeAvailable, afterAvailable: checked.afterAvailable, beforeComplete: checked.beforeComplete, afterComplete: checked.afterComplete, diagnosticsCode: checked.diagnosticsCode };
  const before = canonicalizeDescriptionContent(input.before.value); const after = canonicalizeDescriptionContent(input.after.value);
  if (!before.parseable || !after.parseable || before.displayText.length + after.displayText.length > DESCRIPTION_DIFF_LIMITS.maxFullContextCharacters) return { eventId: input.eventId, issueKey: input.issueKey, status: "unparseable", diffStatus: checked.status, beforeText: null, afterText: null, beforeAvailable: true, afterAvailable: true, beforeComplete: checked.beforeComplete, afterComplete: checked.afterComplete, diagnosticsCode: "DESCRIPTION_CANONICALIZE_FAILED" };
  return { eventId: input.eventId, issueKey: input.issueKey, status: "ready", diffStatus: checked.status, beforeText: before.displayText, afterText: after.displayText, beforeAvailable: true, afterAvailable: true, beforeComplete: checked.beforeComplete, afterComplete: checked.afterComplete, diagnosticsCode: checked.diagnosticsCode };
}
