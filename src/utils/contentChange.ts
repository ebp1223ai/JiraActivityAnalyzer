export type CanonicalContent = {
  text: string;
  available: boolean;
  reliableEmpty: boolean;
  parseable: boolean;
};

export type ContentChangeStatus =
  | "changed"
  | "whitespace-only"
  | "unchanged"
  | "before-unavailable"
  | "after-unavailable"
  | "unparseable";

function decodeHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function collect(value: unknown, seen: Set<unknown>): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collect(item, seen));
  const source = value as Record<string, unknown>;
  if (typeof source.text === "string") return [source.text];
  return Object.entries(source)
    .filter(([key]) => !["type", "attrs", "marks", "version"].includes(key))
    .flatMap(([, item]) => collect(item, seen));
}

export function canonicalizeContent(value: unknown, available = value !== undefined && value !== null): CanonicalContent {
  if (!available) return { text: "", available: false, reliableEmpty: false, parseable: true };
  try {
    const raw = collect(value, new Set()).join("\n");
    const text = decodeHtml(raw).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
    return { text, available: true, reliableEmpty: text.length === 0, parseable: true };
  } catch {
    return { text: "", available: true, reliableEmpty: false, parseable: false };
  }
}

export function isDescriptionField(fieldId: unknown, fieldName: unknown) {
  const id = String(fieldId ?? "").trim().toLowerCase();
  const name = String(fieldName ?? "").trim().toLowerCase();
  return id === "description" || name === "description";
}

export function classifyContentChange(beforeValue: unknown, afterValue: unknown, beforeAvailable = beforeValue !== undefined && beforeValue !== null, afterAvailable = afterValue !== undefined && afterValue !== null): ContentChangeStatus {
  const before = canonicalizeContent(beforeValue, beforeAvailable);
  const after = canonicalizeContent(afterValue, afterAvailable);
  if (!before.parseable || !after.parseable) return "unparseable";
  if (!before.available) return "before-unavailable";
  if (!after.available) return "after-unavailable";
  if (before.text === after.text) return "unchanged";
  const compact = (value: string) => value.replace(/\s+/g, "");
  return compact(before.text) === compact(after.text) ? "whitespace-only" : "changed";
}
