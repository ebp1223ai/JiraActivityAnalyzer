import crypto from "node:crypto";

export const EVIDENCE_NORMALIZER_VERSION = "JAA-EVIDENCE-NORMALIZER-1.0.0" as const;
export type NormalizedEvidence = { evidenceRef: string; rawText: string; normalizedText: string; mode: "parsed" | "plain" | "fallback"; provenance: Array<{ normalizedStart: number; normalizedEnd: number; rawPointer: string }> ; diagnostics: string[] };
export type EvidenceNormalizationReceipt = { schemaVersion: "jaa-evidence-normalization-receipt-v1"; normalizerVersion: typeof EVIDENCE_NORMALIZER_VERSION; recordCount: number; successCount: number; fallbackCount: number; failureCount: number; inputIdentitySha256: string; outputIdentitySha256: string; diagnostics: Array<{ evidenceRef: string; messages: string[] }> };

const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
const decodeEscapes = (value: string) => value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
const jiraMarkup = (value: string) => value
  .replace(/!([^!|]+)(?:\|[^!]*)?!/g, "[圖片: $1]")
  .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$1 ($2)")
  .replace(/\{(?:code|noformat)(?::[^}]*)?\}([\s\S]*?)\{(?:code|noformat)\}/gi, "$1");

function humanContent(value: unknown, pointer = "$"): Array<{ text: string; pointer: string }> {
  if (typeof value === "string") return [{ text: value, pointer }];
  if (Array.isArray(value)) return value.flatMap((entry, index) => humanContent(entry, `${pointer}/${index}`));
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of ["body", "text", "content", "value", "description", "comment"]) if (key in row) {
    const found = humanContent(row[key], `${pointer}/${key}`); if (found.length) return found;
  }
  return [];
}

export function normalizeEvidence(input: { evidenceRef: string; rawText: string; sourceProvenance?: string; fieldName?: string }): NormalizedEvidence {
  const rawText = String(input.rawText ?? ""); const diagnostics: string[] = []; let parts: Array<{ text: string; pointer: string }> = []; let mode: NormalizedEvidence["mode"] = "plain";
  const trimmed = rawText.trim();
  if (/^[\[{]/.test(trimmed)) {
    try { parts = humanContent(JSON.parse(trimmed)); mode = parts.length ? "parsed" : "fallback"; if (!parts.length) diagnostics.push("NO_APPROVED_HUMAN_CONTENT_FIELD"); }
    catch { mode = "fallback"; diagnostics.push("JSON_PARSE_FAILED_RAW_FALLBACK"); }
  }
  if (!parts.length) parts = [{ text: rawText, pointer: "$" }];
  const normalizedText = parts.map((part) => jiraMarkup(decodeEscapes(part.text)).replace(/\r\n?/g, "\n").trim()).filter(Boolean).join("\n\n");
  let cursor = 0; const provenance = parts.map((part) => { const value = jiraMarkup(decodeEscapes(part.text)).replace(/\r\n?/g, "\n").trim(); const item = { normalizedStart: cursor, normalizedEnd: cursor + value.length, rawPointer: part.pointer }; cursor += value.length + 2; return item; });
  return { evidenceRef: input.evidenceRef, rawText, normalizedText, mode, provenance, diagnostics };
}

export function normalizeEvidenceSet(inputs: Array<{ evidenceRef: string; rawText: string; sourceProvenance?: string; fieldName?: string }>) {
  const records = inputs.map(normalizeEvidence);
  const receipt: EvidenceNormalizationReceipt = {
    schemaVersion: "jaa-evidence-normalization-receipt-v1", normalizerVersion: EVIDENCE_NORMALIZER_VERSION, recordCount: records.length,
    successCount: records.filter((item) => item.mode !== "fallback").length, fallbackCount: records.filter((item) => item.mode === "fallback").length, failureCount: 0,
    inputIdentitySha256: sha256(JSON.stringify(stable(inputs))), outputIdentitySha256: sha256(JSON.stringify(stable(records.map(({ rawText: _raw, ...item }) => item)))),
    diagnostics: records.filter((item) => item.diagnostics.length).map((item) => ({ evidenceRef: item.evidenceRef, messages: item.diagnostics }))
  };
  return { records, receipt };
}

export function quoteIsTraceable(evidence: NormalizedEvidence, quote: string) { return Boolean(quote) && evidence.normalizedText.includes(quote); }
