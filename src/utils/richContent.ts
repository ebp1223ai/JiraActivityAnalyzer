export type ReadableContentFormat = "html" | "wiki" | "adf" | "plain";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " "
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#")) {
      const radix = entity.startsWith("#x") ? 16 : 10;
      const offset = entity.startsWith("#x") ? 2 : 1;
      const codePoint = Number.parseInt(entity.slice(offset), radix);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function adfText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(adfText).filter(Boolean).join(" ");
  const source = record(value);
  const ownText = typeof source.text === "string" ? source.text : "";
  const children = adfText(source.content);
  const separator = ["paragraph", "heading", "listItem", "tableRow"].includes(String(source.type)) ? "\n" : "";
  return [ownText, children].filter(Boolean).join(separator);
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
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return adfText(parsed).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } catch {
      return decodeEntities(String(value)).trim();
    }
  }
  let text = String(value);
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
  return decodeEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
