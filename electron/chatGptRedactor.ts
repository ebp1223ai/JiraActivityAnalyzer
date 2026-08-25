const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:token|authorization|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*[^\s,;]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /https:\/\/[^\s"']+\?[^\s"']+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
];

export function maskEmail(value: unknown) {
  const email = String(value ?? "");
  const match = email.match(/^([^@]+)@(.+)$/);
  if (!match) return null;
  const local = match[1];
  return `${local.slice(0, 1)}***@${match[2]}`;
}

export function redactChatGptTextComplete(value: unknown) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match) => match.includes("@") ? "[masked-email]" : match.startsWith("http") ? "[masked-auth-url]" : "[masked]");
  }
  return text;
}

export function sanitizeChatGptValueComplete(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactChatGptTextComplete(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeChatGptValueComplete(item, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    const numericTokenTelemetry = /token/i.test(key) && (typeof child === "number" || child === null);
    const secretField = /token|authorization|cookie|secret|password|api.?key|delivery.?handle|artifact.?handle/i.test(key);
    return [key, secretField && !numericTokenTelemetry ? "[masked]" : sanitizeChatGptValueComplete(child, seen)];
  }));
}

export function redactChatGptText(value: unknown) {
  return redactChatGptTextComplete(value).slice(0, 8192);
}

export function sanitizedError(error: unknown) {
  if (error === null || error === undefined) return "UNEXPECTED_ERROR_SHAPE:收到非標準錯誤物件。";
  if (error instanceof Error) return redactChatGptText(error.message || "UNEXPECTED_ERROR_SHAPE:收到沒有訊息的 Error。");
  if (typeof error === "object") {
    const value = error as Record<string, unknown>;
    return redactChatGptText(`${String(value.errorCode ?? value.code ?? "UNEXPECTED_ERROR_SHAPE")}:${String(value.messageZhTw ?? value.message ?? "收到非標準錯誤物件。")}`);
  }
  return redactChatGptText(String(error) || "UNEXPECTED_ERROR_SHAPE:收到非標準錯誤物件。");
}
