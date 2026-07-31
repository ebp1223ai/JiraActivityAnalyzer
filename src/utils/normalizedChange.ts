import { canonicalizeRichContent, readableContentText } from "./richContent";
import { contentDisplayFromActivityRow, type ContentDisplayResult } from "./contentDisplay";

export type ValueAvailability = "available" | "empty" | "unavailable" | "not_applicable" | "parse_failed";
export type DiffStatus = "changed" | "unchanged" | "unavailable" | "fallback_full_after";
export type DiffBasis = "before_after" | "after_only" | "after_full_display" | "not_available";
export type DiffSegment = { kind: "same" | "added" | "removed"; text: string };

export type NormalizedChange = {
  fieldId?: string;
  fieldName: string;
  beforeRaw?: unknown;
  afterRaw?: unknown;
  beforeText?: string;
  afterText?: string;
  beforeDisplayText?: string;
  afterDisplayText?: string;
  beforeCanonical: string | null;
  afterCanonical: string | null;
  beforeAvailability: ValueAvailability;
  afterAvailability: ValueAvailability;
  diffStatus: DiffStatus;
  diffBasis: DiffBasis;
  diff: DiffSegment[] | null;
  displayContent: string | null;
  availabilityReason?: string;
  normalizationWarnings: string[];
  diffKind: "text" | "scalar" | "set" | "none";
  contentDisplay: ContentDisplayResult;
  provenance: {
    issueKey: string;
    changelogId?: string;
    historyItemIndex?: number;
    source: string;
  };
};

function parseStoredValue(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isScalar(value: unknown) {
  return value === null || ["string", "number", "boolean", "undefined"].includes(typeof value);
}

function stringSet(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.map((item) => readableContentText(item)).filter(Boolean);
}

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function sourceValue(row: Record<string, unknown>, primary: string, fallback: string) {
  if (hasOwn(row, primary)) return { present: true, value: row[primary] };
  if (hasOwn(row, fallback)) return { present: true, value: row[fallback] };
  return { present: false, value: undefined };
}

function classifyAvailability(present: boolean, value: unknown, canonical: ReturnType<typeof canonicalizeRichContent>, notApplicable: boolean): ValueAvailability {
  if (notApplicable) return "not_applicable";
  if (!present || value === undefined || value === null) return "unavailable";
  if (canonical.parseFailed) return "parse_failed";
  if (canonical.canonicalVisibleText === "") return "empty";
  return "available";
}

export function normalizeActivityChange(row: Record<string, unknown>): NormalizedChange {
  const beforeSource = sourceValue(row, "before", "fromValueJson");
  const afterSource = sourceValue(row, "after", "toValueJson");
  const beforeRaw = parseStoredValue(beforeSource.value);
  const afterRaw = parseStoredValue(afterSource.value);
  const beforeContent = canonicalizeRichContent(beforeRaw);
  const afterContent = canonicalizeRichContent(afterRaw);
  const beforeText = beforeContent.canonicalVisibleText;
  const afterText = afterContent.canonicalVisibleText;
  const beforeSet = stringSet(beforeRaw);
  const afterSet = stringSet(afterRaw);
  const fieldName = String(row.fieldName ?? row.field ?? "Not applicable");
  const eventName = String(row.eventType ?? row.activityType ?? row.action ?? row.type ?? "").toLowerCase();
  const isComment = /comment/i.test(fieldName) || /comment/.test(eventName);
  const isDescription = /description/i.test(fieldName);
  const isCreated = /created|added/.test(eventName);
  const isDeleted = /deleted|removed/.test(eventName);
  const richTextField = isComment || isDescription;
  const beforeAvailability = classifyAvailability(beforeSource.present, beforeRaw, beforeContent, isCreated);
  const afterAvailability = classifyAvailability(afterSource.present, afterRaw, afterContent, isDeleted);
  const diffKind = beforeText === afterText
    ? "none"
    : beforeSet && afterSet
      ? "set"
      : isScalar(beforeRaw) && isScalar(afterRaw) && !richTextField
        ? "scalar"
        : "text";

  const contentDisplay = contentDisplayFromActivityRow(row);
  const diffStatus: DiffStatus = contentDisplay.mode === "diff"
    ? beforeText === afterText ? "unchanged" : "changed"
    : contentDisplay.mode === "latest_content" ? "fallback_full_after" : "unavailable";
  const diffBasis: DiffBasis = contentDisplay.mode === "diff"
    ? "before_after"
    : contentDisplay.mode === "latest_content" ? "after_only" : "not_available";
  const displayContent = contentDisplay.displayText;
  const availabilityReason = contentDisplay.completenessReason ?? undefined;

  const normalized: NormalizedChange = {
    fieldId: String(row.fieldId ?? "") || undefined,
    fieldName,
    beforeRaw,
    afterRaw,
    beforeText: beforeText || undefined,
    afterText: afterText || undefined,
    beforeDisplayText: beforeContent.displayText || undefined,
    afterDisplayText: afterContent.displayText || undefined,
    beforeCanonical: beforeText || null,
    afterCanonical: afterText || null,
    beforeAvailability,
    afterAvailability,
    diffStatus,
    diffBasis,
    diff: null,
    displayContent,
    availabilityReason,
    normalizationWarnings: [...beforeContent.warnings, ...afterContent.warnings],
    diffKind,
    contentDisplay,
    provenance: {
      issueKey: String(row.issueKey ?? ""),
      changelogId: String(row.changelogId ?? row.commentId ?? "") || undefined,
      historyItemIndex: Number.isSafeInteger(Number(row.historyItemIndex)) ? Number(row.historyItemIndex) : undefined,
      source: String(row.sourceProvenance ?? row.source ?? "unknown")
    }
  };
  normalized.diff = contentDisplay.mode === "diff" ? compactDiff(normalized) : null;
  return normalized;
}

function compactSingleLineDiff(before: string, after: string): DiffSegment[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const context = 48;
  const segments: DiffSegment[] = [];
  const prefixText = before.slice(Math.max(0, prefix - context), prefix);
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  const suffixText = after.slice(after.length - suffix, Math.min(after.length, after.length - suffix + context));
  if (prefixText) segments.push({ kind: "same", text: prefixText });
  if (removed) segments.push({ kind: "removed", text: removed });
  if (added) segments.push({ kind: "added", text: added });
  if (suffixText) segments.push({ kind: "same", text: suffixText });
  return segments;
}

export function compactDiff(change: NormalizedChange): DiffSegment[] {
  const before = change.beforeText ?? "";
  const after = change.afterText ?? "";
  if ((!before && !after) || before === after || change.diffKind === "none") return [];
  if (change.diffKind === "set") {
    const beforeSet = new Set(stringSet(change.beforeRaw) ?? []);
    const afterSet = new Set(stringSet(change.afterRaw) ?? []);
    return [
      ...Array.from(beforeSet).filter((item) => !afterSet.has(item)).map((text) => ({ kind: "removed" as const, text })),
      ...Array.from(afterSet).filter((item) => !beforeSet.has(item)).map((text) => ({ kind: "added" as const, text }))
    ];
  }
  if (!before) return [{ kind: "added", text: after }];
  if (!after) return [{ kind: "removed", text: before }];
  if (change.diffKind === "scalar") return [{ kind: "removed", text: before }, { kind: "added", text: after }];
  if (!before.includes("\n") && !after.includes("\n")) return compactSingleLineDiff(before, after);

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]) suffix += 1;
  const segments: DiffSegment[] = [];
  if (prefix) segments.push({ kind: "same", text: beforeLines.slice(Math.max(0, prefix - 2), prefix).join("\n") });
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix).join("\n");
  const added = afterLines.slice(prefix, afterLines.length - suffix).join("\n");
  if (removed) segments.push({ kind: "removed", text: removed });
  if (added) segments.push({ kind: "added", text: added });
  if (suffix) segments.push({ kind: "same", text: afterLines.slice(afterLines.length - suffix, afterLines.length - Math.max(0, suffix - 2)).join("\n") });
  return segments;
}