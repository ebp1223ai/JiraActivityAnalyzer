import { buildCanonicalLineDiff, buildDescriptionDiff, type DescriptionDiffInput, type DescriptionDiffResult, type DescriptionDiffStatus, type DiffHunk } from "./descriptionDiff.js";

export const VIEWER_DIFF_CLASSIFIER_VERSION = "v3";

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
  beforeAvailable: boolean;
  afterAvailable: boolean;
  isSubstantiveChange: boolean;
  diffHunks: DiffHunk[];
  descriptionDiff?: DescriptionDiffResult;
  descriptionComparison?: boolean;
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

function originalDescriptionRaw(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return String(value);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || parsed === undefined) return null;
    return typeof parsed === "string" ? parsed : value;
  } catch { return value; }
}

function stableValue(value: unknown, seen = new Set<object>(), sortArrays = false): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (value === undefined) return null;
  if (typeof value !== "object") throw new Error("UNPARSEABLE_CONTENT");
  if (seen.has(value)) throw new Error("CYCLIC_CONTENT");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.map((item) => stableValue(item, seen, sortArrays));
      return sortArrays ? items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))) : items;
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item, seen, sortArrays)]));
  } finally { seen.delete(value); }
}

function isSetLikeField(fieldId: unknown, fieldName: unknown) {
  const identities = [fieldId, fieldName].map((value) => String(value ?? "").trim().toLowerCase().replace(/[ _-]+/g, ""));
  return identities.some((identity) => /^(labels?|components?|fixversions?|affectedversions?|versions?)$/.test(identity));
}

function isStructuredReferenceField(fieldId: unknown, fieldName: unknown) {
  const identities = [fieldId, fieldName].map((value) => String(value ?? "").trim().toLowerCase().replace(/[ _-]+/g, ""));
  return identities.some((identity) => /(?:attachment|issuelink|remoteissuelink|weblink)/.test(identity));
}

function withoutRuntimePathMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRuntimePathMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/^(?:(?:local|temp|runtime|absolute|download|staging|cache|file)[_-]?)?path$/i.test(key))
    .map(([key, item]) => [key, withoutRuntimePathMetadata(item)]));
}

function canonicalText(value: unknown, sortArrays = false, stripRuntimePaths = false): string {
  const stored = storedValue(value);
  const parsed = stableValue(stripRuntimePaths ? withoutRuntimePathMetadata(stored) : stored, new Set(), sortArrays);
  const renderArrayItem = (item: unknown) => typeof item === "string" ? item
    : typeof item === "number" || typeof item === "boolean" ? String(item)
    : item === null ? "<null>" : JSON.stringify(item);
  const text = parsed === null ? "<null>" : parsed === "" ? "<empty string>"
    : Array.isArray(parsed) ? parsed.length ? parsed.map(renderArrayItem).join("\n") : "[]"
    : typeof parsed === "string" ? parsed
    : typeof parsed === "number" || typeof parsed === "boolean" ? String(parsed)
    : JSON.stringify(parsed, null, 2);
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function substantiveText(value: string) {
  return value.split("\n").map((line) => line.replace(/\t/g, " ").replace(/[ \u00a0]+/g, " ").trim()).filter(Boolean).join("\n");
}

function isDescription(fieldId: unknown, fieldName: unknown) {
  const id = String(fieldId ?? "").trim().toLowerCase();
  const name = String(fieldName ?? "").trim().toLowerCase();
  return id === "description" || (!id && name === "description");
}

function classification(status: ViewerDiffStatus, beforeAvailable: boolean, afterAvailable: boolean, options: Partial<ViewerDiffClassification> = {}): ViewerDiffClassification {
  return {
    status, beforeAvailable, afterAvailable,
    comparisonValidated: false, addedCount: null, deletedCount: null,
    isSubstantiveChange: status === "changed", diffHunks: [], ...options
  };
}

export function descriptionDiffInputForViewer(input: ViewerDiffInput): DescriptionDiffInput {
  const sourceId = String(input.sourceId ?? "") || null;
  const itemMatch = /^(.*):(\d+)$/.exec(sourceId ?? "");
  const beforeRaw = originalDescriptionRaw(input.before);
  const afterRaw = originalDescriptionRaw(input.after);
  return {
    eventId: input.eventId, issueKey: input.issueKey, fieldId: input.fieldId, fieldName: input.fieldName,
    sourceType: String(input.sourceType ?? ""), sourceId,
    changelogHistoryId: String(input.jiraNativeSourceId ?? itemMatch?.[1] ?? "") || null,
    changelogItemIndex: itemMatch ? Number(itemMatch[2]) : null, candidateCount: 1,
    before: { available: beforeRaw !== null, complete: beforeRaw !== null, value: storedValue(input.before), raw: beforeRaw },
    after: { available: afterRaw !== null, complete: afterRaw !== null, value: storedValue(input.after), raw: afterRaw }
  };
}

export function classifyViewerDiff(input: ViewerDiffInput): ViewerDiffClassification {
  const beforeAvailable = input.before !== null && input.before !== undefined;
  const afterAvailable = input.after !== null && input.after !== undefined;
  if (!beforeAvailable && !afterAvailable) return classification("non-comparison", false, false);
  if (isDescription(input.fieldId, input.fieldName)) {
    const result = buildDescriptionDiff(descriptionDiffInputForViewer(input));
    const validated = ["changed", "unchanged", "whitespace-only"].includes(result.status);
    return classification(result.status, result.beforeAvailable && result.beforeComplete, result.afterAvailable && result.afterComplete, {
      comparisonValidated: validated, addedCount: validated ? result.addedLines : null,
      deletedCount: validated ? result.deletedLines : null, isSubstantiveChange: result.status === "changed",
      diffHunks: result.hunks, descriptionDiff: result, descriptionComparison: true
    });
  }
  try {
    const sortArrays = isSetLikeField(input.fieldId, input.fieldName);
    const stripRuntimePaths = isStructuredReferenceField(input.fieldId, input.fieldName);
    const before = beforeAvailable ? canonicalText(input.before, sortArrays, stripRuntimePaths) : "";
    const after = afterAvailable ? canonicalText(input.after, sortArrays, stripRuntimePaths) : "";
    if (before === after) return classification("unchanged", beforeAvailable, afterAvailable, { comparisonValidated: true, addedCount: 0, deletedCount: 0 });
    if (substantiveText(before) === substantiveText(after)) return classification("whitespace-only", beforeAvailable, afterAvailable, { comparisonValidated: true, addedCount: 0, deletedCount: 0 });
    const diffHunks = buildCanonicalLineDiff(input.eventId, before, after);
    const lines = diffHunks.flatMap((hunk) => hunk.lines);
    const addedCount = lines.filter((line) => line.kind === "insert").length;
    const deletedCount = lines.filter((line) => line.kind === "delete").length;
    return classification("changed", beforeAvailable, afterAvailable, { comparisonValidated: true, addedCount, deletedCount, isSubstantiveChange: true, diffHunks });
  } catch { return classification("unparseable", beforeAvailable, afterAvailable); }
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
  if (filters.hideNoChange && diff.isSubstantiveChange !== true) return false;
  if (filters.hideZeroAdded && (diff.addedCount === null || diff.addedCount <= 0)) return false;
  if (filters.hideZeroDeleted && (diff.deletedCount === null || diff.deletedCount <= 0)) return false;
  if (filters.hideBeforeUnavailable && diff.beforeAvailable !== true) return false;
  return true;
}
