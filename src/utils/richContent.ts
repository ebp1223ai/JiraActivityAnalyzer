export type ReadableContentFormat = "html" | "wiki" | "adf" | "plain";
export type CanonicalRichContent = {
  rawValue: unknown;
  displayText: string;
  canonicalVisibleText: string;
};

const MAX_CANONICAL_CHARS = 200_000;
const MAX_CONTENT_DEPTH = 64;
const MAX_CONTENT_NODES = 20_000;
const TRUNCATED_MARKER = "\n[Content truncated by safety limit]";
const INVISIBLE_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bounded(value: string, limit = MAX_CANONICAL_CHARS) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - TRUNCATED_MARKER.length)).trimEnd()}${TRUNCATED_MARKER}`;
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#")) {
      const radix = entity.startsWith("#x") ? 16 : 10;
      const offset = entity.startsWith("#x") ? 2 : 1;
      const codePoint = Number.parseInt(entity.slice(offset), radix);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function structuredText(value: unknown, state = { nodes: 0 }, depth = 0): string {
  if (depth > MAX_CONTENT_DEPTH || state.nodes >= MAX_CONTENT_NODES) return TRUNCATED_MARKER.trim();
  state.nodes += 1;
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return bounded(String(value));
  if (Array.isArray(value)) return bounded(value.map((item) => structuredText(item, state, depth + 1)).filter(Boolean).join("\n"));

  const source = record(value);
  const type = String(source.type ?? "");
  const attrs = record(source.attrs);
  if (["image", "media", "attachment", "mediaSingle"].includes(type)) {
    const label = attrs.alt ?? attrs.title ?? attrs.filename ?? source.filename ?? source.name ?? "attachment";
    return `[Attachment: ${structuredText(label, state, depth + 1) || "attachment"}]`;
  }

  const ownText = typeof source.text === "string" ? source.text : "";
  const children = source.content !== undefined ? structuredText(source.content, state, depth + 1) : "";
  if (ownText || children) {
    const blockTypes = new Set(["doc", "paragraph", "heading", "listItem", "bulletList", "orderedList", "table", "tableRow", "tableCell", "blockquote", "codeBlock"]);
    return bounded([ownText, children].filter(Boolean).join(blockTypes.has(type) ? "\n" : ""));
  }

  const preferredKeys = ["body", "value", "description", "comment", "title", "name", "displayName", "label", "items", "children"];
  const visible = preferredKeys
    .filter((key) => source[key] !== undefined)
    .map((key) => structuredText(source[key], state, depth + 1))
    .filter(Boolean);
  return bounded(visible.join("\n"));
}

function normalizeVisibleText(value: string) {
  return bounded(decodeEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(INVISIBLE_CONTROLS, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

export function detectReadableContentFormat(value: unknown, hint?: string): ReadableContentFormat {
  if (hint === "html" || hint === "wiki" || hint === "adf" || hint === "plain") return hint;
  if (value && typeof value === "object") return record(value).type === "doc" ? "adf" : "plain";
  const text = String(value ?? "").trim();
  if (/^<[a-z][\s\S]*>/i.test(text) || /<\/[a-z]+>/i.test(text)) return "html";
  if (/^(h[1-6]\.|bq\.|\{code|[*-]\s)|(\[~[^\]]+\]|\[\^[^\]]+\]|![^!]+!)/m.test(text)) return "wiki";
  if ((text.startsWith("{") || text.startsWith("[")) && /"type"\s*:\s*"doc"/.test(text)) return "adf";
  return "plain";
}

export function readableContentText(value: unknown, hint?: string): string {
  if (value === undefined || value === null || value === "") return "";
  const format = detectReadableContentFormat(value, hint);
  if (format === "adf") {
    try {
      const serialized = typeof value === "string" ? bounded(value) : value;
      const parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
      return normalizeVisibleText(structuredText(parsed));
    } catch {
      return normalizeVisibleText(typeof value === "string" ? value : structuredText(value));
    }
  }

  let text = typeof value === "object" ? structuredText(value) : bounded(String(value));
  if (format === "html") {
    text = text
      .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<img[^>]*(?:alt|title)=["']([^"']+)["'][^>]*>/gi, " [Attachment: $1] ")
      .replace(/<[^>]+>/g, " ");
  } else if (format === "wiki") {
    text = text
      .replace(/\{code(?::[^}]*)?\}/gi, "\n")
      .replace(/^h[1-6]\.\s+/gm, "")
      .replace(/^bq\.\s+/gm, "")
      .replace(/\[~([^\]]+)\]/g, "@$1")
      .replace(/\[\^([^\]]+)\]/g, "[Attachment: $1]")
      .replace(/!([^!|]+)(?:\|[^!]*)?!/g, "[Attachment image: $1]")
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$1 ($2)")
      .replace(/\{\{([^}]+)\}\}/g, "$1")
      .replace(/(^|[\s])\*([^*\n]+)\*/g, "$1$2");
  }
  return normalizeVisibleText(text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n"));
}

export function canonicalizeRichContent(value: unknown, hint?: string): CanonicalRichContent {
  const displayText = readableContentText(value, hint);
  return { rawValue: value, displayText, canonicalVisibleText: normalizeVisibleText(displayText) };
}

export function readableContentSummary(value: unknown, hint?: string, limit = 240) {
  const text = readableContentText(value, hint);
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

export function preciseMissingValue(reason: "previous" | "source" | "model" | "safety" | "empty") {
  if (reason === "previous") return "No previous value";
  if (reason === "source") return "Not available in source data";
  if (reason === "model") return "Not persisted by current data model";
  if (reason === "safety") return "Content omitted by size/safety policy";
  return "Empty value";
}