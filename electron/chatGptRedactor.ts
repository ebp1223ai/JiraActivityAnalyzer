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

export function redactChatGptText(value: unknown) {
  return redactChatGptTextComplete(value).slice(0, 8192);
}

export function sanitizedError(error: unknown) {
  return redactChatGptText(error instanceof Error ? error.message : error);
}
