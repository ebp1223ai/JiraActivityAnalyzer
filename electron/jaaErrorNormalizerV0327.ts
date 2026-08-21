import crypto from "node:crypto";

export type JaaErrorContext = {
  stage?: string;
  source?: string;
  fallbackCode?: string;
  safeDetails?: Record<string, unknown>;
  occurredAtUtc?: string;
};

export type NormalizedJaaError = {
  errorId: string;
  errorCode: string;
  messageZhTw: string;
  technicalMessage: string;
  stage: string;
  source: string;
  occurredAtUtc: string;
  causeCode: string | null;
  safeDetails: Record<string, unknown>;
};

const CODE_PATTERN = /^([A-Z][A-Z0-9_]{2,})(?::|\b)/;
const SECRET_KEY = /token|authorization|cookie|secret|password|credential|nonce|api.?key/i;
const SECRET_VALUE = /\bBearer\s+\S+|\bBasic\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi;

function safeText(value: unknown) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.replace(SECRET_VALUE, "[masked]").slice(0, 8192);
}

function safeRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["errorCode", "code", "stage", "source", "status", "causeCode", "callId", "toolName", "argumentNames", "contextResolutionStatus"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => allowed.has(key) && !SECRET_KEY.test(key))
    .map(([key, child]) => [key, typeof child === "string" || typeof child === "number" || typeof child === "boolean" || child === null ? safeText(child) : "[complex-value-omitted]"]));
}

function errorParts(error: unknown, fallbackCode: string) {
  if (error instanceof Error) {
    const ownCode = typeof (error as Error & { code?: unknown }).code === "string" ? String((error as Error & { code?: unknown }).code) : "";
    const message = safeText(error.message) || "收到沒有訊息的 Error。";
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeMessage = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
    return { code: ownCode || CODE_PATTERN.exec(message)?.[1] || fallbackCode, message, causeCode: CODE_PATTERN.exec(safeText(causeMessage))?.[1] ?? null, details: {} };
  }
  if (typeof error === "string") {
    const message = safeText(error) || "收到空白錯誤字串。";
    return { code: CODE_PATTERN.exec(message)?.[1] || fallbackCode, message, causeCode: null, details: {} };
  }
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const code = safeText(value.errorCode ?? value.code) || fallbackCode;
    const message = safeText(value.messageZhTw ?? value.message ?? value.technicalMessage) || "收到沒有訊息的結構化錯誤物件。";
    return { code, message, causeCode: safeText(value.causeCode) || null, details: safeRecord(value) };
  }
  return { code: "UNEXPECTED_ERROR_SHAPE", message: "收到非標準錯誤物件。", causeCode: null, details: { receivedType: error === null ? "null" : typeof error } };
}

export function normalizeJaaError(error: unknown, context: JaaErrorContext = {}): NormalizedJaaError {
  const fallbackCode = context.fallbackCode || "JAA_UNEXPECTED_ERROR";
  const parts = errorParts(error, fallbackCode);
  const technicalMessage = safeText(parts.message).replace(/^([A-Z][A-Z0-9_]{2,}):\s*/, "") || "收到非標準錯誤物件。";
  const occurredAtUtc = context.occurredAtUtc ?? new Date().toISOString();
  const safeDetails = { ...parts.details, ...safeRecord(context.safeDetails) };
  const identity = JSON.stringify({ code: parts.code, stage: context.stage ?? "UNKNOWN", source: context.source ?? "UNKNOWN", technicalMessage, safeDetails });
  return {
    errorId: `err_${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24)}`,
    errorCode: parts.code || fallbackCode,
    messageZhTw: technicalMessage || "收到非標準錯誤物件。",
    technicalMessage: technicalMessage || "Non-standard error object received.",
    stage: context.stage ?? "UNKNOWN",
    source: context.source ?? "UNKNOWN",
    occurredAtUtc,
    causeCode: parts.causeCode,
    safeDetails
  };
}

export class JaaErrorDeduplicatorV0327 {
  private readonly entries = new Map<string, NormalizedJaaError & { occurrenceCount: number; firstOccurredAtUtc: string; lastOccurredAtUtc: string }>();

  add(error: NormalizedJaaError) {
    const key = crypto.createHash("sha256").update(JSON.stringify({ errorId: error.errorId, stage: error.stage, code: error.errorCode, safeDetails: error.safeDetails })).digest("hex");
    const current = this.entries.get(key);
    if (current) {
      current.occurrenceCount += 1;
      current.lastOccurredAtUtc = error.occurredAtUtc;
      return structuredClone(current);
    }
    const created = { ...error, occurrenceCount: 1, firstOccurredAtUtc: error.occurredAtUtc, lastOccurredAtUtc: error.occurredAtUtc };
    this.entries.set(key, created);
    return structuredClone(created);
  }

  snapshot() { return [...this.entries.values()].map((entry) => structuredClone(entry)); }
}
