import { readableContentText } from "./richContent";

export type NormalizedChange = {
  fieldId?: string;
  fieldName: string;
  beforeRaw?: unknown;
  afterRaw?: unknown;
  beforeText?: string;
  afterText?: string;
  diffKind: "text" | "scalar" | "set" | "none";
  provenance: {
    issueKey: string;
    changelogId?: string;
    historyItemIndex?: number;
    source: string;
  };
};

export type DiffSegment = { kind: "same" | "added" | "removed"; text: string };

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

export function normalizeActivityChange(row: Record<string, unknown>): NormalizedChange {
  const beforeRaw = parseStoredValue(row.before ?? row.fromValueJson);
  const afterRaw = parseStoredValue(row.after ?? row.toValueJson);
  const beforeText = readableContentText(beforeRaw);
  const afterText = readableContentText(afterRaw);
  const beforeSet = stringSet(beforeRaw);
  const afterSet = stringSet(afterRaw);
  const diffKind = !beforeText && !afterText
    ? "none"
    : beforeSet && afterSet
      ? "set"
      : isScalar(beforeRaw) && isScalar(afterRaw) && !beforeText.includes("\n") && !afterText.includes("\n")
        ? "scalar"
        : "text";
  return {
    fieldId: String(row.fieldId ?? "") || undefined,
    fieldName: String(row.fieldName ?? row.field ?? "Not applicable"),
    beforeRaw,
    afterRaw,
    beforeText: beforeText || undefined,
    afterText: afterText || undefined,
    diffKind,
    provenance: {
      issueKey: String(row.issueKey ?? ""),
      changelogId: String(row.changelogId ?? row.commentId ?? "") || undefined,
      historyItemIndex: Number.isSafeInteger(Number(row.historyItemIndex)) ? Number(row.historyItemIndex) : undefined,
      source: String(row.sourceProvenance ?? row.source ?? "unknown")
    }
  };
}

export function compactDiff(change: NormalizedChange): DiffSegment[] {
  const before = change.beforeText ?? "";
  const after = change.afterText ?? "";
  if (!before && !after) return [];
  if (before === after) return [{ kind: "same", text: before }];
  if (change.diffKind === "set") {
    const beforeSet = new Set(stringSet(change.beforeRaw) ?? []);
    const afterSet = new Set(stringSet(change.afterRaw) ?? []);
    return [
      ...Array.from(beforeSet).filter((item) => !afterSet.has(item)).map((text) => ({ kind: "removed" as const, text })),
      ...Array.from(afterSet).filter((item) => !beforeSet.has(item)).map((text) => ({ kind: "added" as const, text }))
    ];
  }
  if (change.diffKind === "scalar") {
    return [
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : [])
    ];
  }
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix
    && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) suffix += 1;
  const segments: DiffSegment[] = [];
  if (prefix) segments.push({ kind: "same", text: beforeLines.slice(Math.max(0, prefix - 2), prefix).join("\n") });
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix).join("\n");
  const added = afterLines.slice(prefix, afterLines.length - suffix).join("\n");
  if (removed) segments.push({ kind: "removed", text: removed });
  if (added) segments.push({ kind: "added", text: added });
  if (suffix) segments.push({ kind: "same", text: afterLines.slice(afterLines.length - suffix, afterLines.length - Math.max(0, suffix - 2)).join("\n") });
  return segments;
}
