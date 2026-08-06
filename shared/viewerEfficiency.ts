import { buildDescriptionDiff, type DescriptionDiffStatus } from "./descriptionDiff.js";

export type DiffQuickFilters = {
  hideNoChange: boolean;
  hideZeroAdded: boolean;
  hideZeroDeleted: boolean;
  hideBeforeUnavailable: boolean;
};

export const DEFAULT_DIFF_QUICK_FILTERS: DiffQuickFilters = {
  hideNoChange: true,
  hideZeroAdded: false,
  hideZeroDeleted: false,
  hideBeforeUnavailable: false
};

export type ViewerDiffStatus = DescriptionDiffStatus | "non-comparison";
export type ViewerDiffClassification = {
  status: ViewerDiffStatus;
  comparisonValidated: boolean;
  addedCount: number | null;
  deletedCount: number | null;
};

export type ViewerDiffInput = {
  eventId: string;
  issueKey: string;
  fieldId?: string | null;
  fieldName?: string | null;
  before: unknown;
  after: unknown;
  sourceType?: string | null;
  sourceId?: string | null;
  jiraNativeSourceId?: string | null;
};

function storedValue(value: unknown) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function canonicalText(value: unknown, seen = new Set<object>()): string {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (typeof value !== "object") throw new Error("UNPARSEABLE_CONTENT");
  if (seen.has(value)) throw new Error("CYCLIC_CONTENT");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalText(item, seen)).join("\n");
    const source = value as Record<string, unknown>;
    if (typeof source.text === "string") return source.text;
    return Object.entries(source)
      .filter(([key]) => !["type", "attrs", "marks", "version"].includes(key))
      .map(([, item]) => canonicalText(item, seen))
      .filter(Boolean)
      .join("\n");
  } finally { seen.delete(value); }
}

function normalized(value: unknown) {
  return canonicalText(storedValue(value)).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function isDescription(fieldId: unknown, fieldName: unknown) {
  const id = String(fieldId ?? "").trim().toLowerCase();
  const name = String(fieldName ?? "").trim().toLowerCase();
  return id === "description" || (!id && name === "description");
}

export function classifyViewerDiff(input: ViewerDiffInput): ViewerDiffClassification {
  const beforeAvailable = input.before !== null && input.before !== undefined;
  const afterAvailable = input.after !== null && input.after !== undefined;
  if (!beforeAvailable && !afterAvailable) return { status: "non-comparison", comparisonValidated: false, addedCount: null, deletedCount: null };
  if (isDescription(input.fieldId, input.fieldName)) {
    const sourceId = String(input.sourceId ?? "") || null;
    const itemMatch = /^(.*):(\d+)$/.exec(sourceId ?? "");
    const result = buildDescriptionDiff({
      eventId: input.eventId,
      issueKey: input.issueKey,
      fieldId: input.fieldId,
      fieldName: input.fieldName,
      sourceType: String(input.sourceType ?? ""),
      sourceId,
      changelogHistoryId: String(input.jiraNativeSourceId ?? itemMatch?.[1] ?? "") || null,
      changelogItemIndex: itemMatch ? Number(itemMatch[2]) : null,
      candidateCount: 1,
      before: { available: beforeAvailable, complete: beforeAvailable, value: storedValue(input.before), raw: typeof input.before === "string" ? input.before : null },
      after: { available: afterAvailable, complete: afterAvailable, value: storedValue(input.after), raw: typeof input.after === "string" ? input.after : null }
    });
    const validated = ["changed", "unchanged", "whitespace-only"].includes(result.status);
    return { status: result.status, comparisonValidated: validated, addedCount: validated ? result.addedLines : null, deletedCount: validated ? result.deletedLines : null };
  }
  if (!beforeAvailable) return { status: "before-unavailable", comparisonValidated: false, addedCount: null, deletedCount: null };
  if (!afterAvailable) return { status: "after-unavailable", comparisonValidated: false, addedCount: null, deletedCount: null };
  try {
    const before = normalized(input.before);
    const after = normalized(input.after);
    if (before === after) return { status: "unchanged", comparisonValidated: true, addedCount: 0, deletedCount: 0 };
    if (before.replace(/\s+/g, "") === after.replace(/\s+/g, "")) return { status: "whitespace-only", comparisonValidated: true, addedCount: 0, deletedCount: 0 };
    return { status: "changed", comparisonValidated: true, addedCount: after ? 1 : 0, deletedCount: before ? 1 : 0 };
  } catch {
    return { status: "unparseable", comparisonValidated: false, addedCount: null, deletedCount: null };
  }
}

export function normalizeDiffQuickFilters(value: unknown): DiffQuickFilters {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    hideNoChange: typeof source.hideNoChange === "boolean" ? source.hideNoChange : DEFAULT_DIFF_QUICK_FILTERS.hideNoChange,
    hideZeroAdded: typeof source.hideZeroAdded === "boolean" ? source.hideZeroAdded : DEFAULT_DIFF_QUICK_FILTERS.hideZeroAdded,
    hideZeroDeleted: typeof source.hideZeroDeleted === "boolean" ? source.hideZeroDeleted : DEFAULT_DIFF_QUICK_FILTERS.hideZeroDeleted,
    hideBeforeUnavailable: typeof source.hideBeforeUnavailable === "boolean" ? source.hideBeforeUnavailable : DEFAULT_DIFF_QUICK_FILTERS.hideBeforeUnavailable
  };
}

export function viewerDiffPassesFilters(diff: ViewerDiffClassification, filters: DiffQuickFilters) {
  if (filters.hideNoChange && (diff.status === "unchanged" || diff.status === "whitespace-only" || (diff.comparisonValidated && diff.addedCount === 0 && diff.deletedCount === 0))) return false;
  if (filters.hideZeroAdded && diff.comparisonValidated && diff.addedCount === 0) return false;
  if (filters.hideZeroDeleted && diff.comparisonValidated && diff.deletedCount === 0) return false;
  if (filters.hideBeforeUnavailable && diff.status === "before-unavailable") return false;
  return true;
}
