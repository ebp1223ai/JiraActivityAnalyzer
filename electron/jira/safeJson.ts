import type { JiraHttpResult } from "./jiraTypes.js";

export function messageForHttpStatus(status: number | "-") {
  if (status === 401) return "Unauthorized. Check username, token, and auth type.";
  if (status === 403) return "Forbidden. Token may be valid but lacks project or issue permission.";
  if (status === 404) return "Issue or endpoint not found. Check Issue Key / ID, Base URL, and API version.";
  if (status === "-") return "Network error. Check VPN, proxy, certificate, and base URL.";
  return `HTTP ${status} response received.`;
}

export function sanitizeBodyPreview(value: string) {
  return sanitizeResponseText(value).replace(/\s+/g, " ").trim().slice(0, 300);
}

export function sanitizeResponseText(value: string) {
  return value
    .replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [masked]")
    .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/gi, "Bearer [masked]")
    .replace(/authorization[=:]\s*[^&\s"'<>]+/gi, "authorization=[masked]")
    .replace(/api[-_ ]?token[=:]\s*[^&\s"'<>]+/gi, "apiToken=[masked]")
    .replace(/token[=:]\s*[^&\s"'<>]+/gi, "token=[masked]")
    .replace(/password[=:]\s*[^&\s"'<>]+/gi, "password=[masked]")
    .replace(/cookie[=:]\s*[^\r\n<>]+/gi, "cookie=[masked]")
    .replace(/session[=:]\s*[^&\s"'<>]+/gi, "session=[masked]")
    .slice(0, 512000);
}

export function sanitizeRawJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeRawJson);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|token|password|apiToken/i.test(key)) {
        output[key] = "[redacted]";
      } else if (key === "content" && typeof child === "string" && child.includes("/attachment/content/")) {
        output[key] = "[attachment content url redacted]";
      } else {
        output[key] = sanitizeRawJson(child);
      }
    }
    return output;
  }
  return value;
}

export function parseJiraResponse(status: number, contentType: string, text: string, ok: boolean, allowNonJson = false): JiraHttpResult {
  const looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype\s+html/i.test(text) || /^\s*<html[\s>]/i.test(text);
  const isJson = /application\/json/i.test(contentType) || /^\s*[\[{]/.test(text);

  if (looksLikeHtml || !isJson) {
    const acceptedNonJson = allowNonJson && !looksLikeHtml && ok;
    return {
      ok: acceptedNonJson,
      status,
      contentType,
      json: null,
      errorType: acceptedNonJson ? undefined : "NON_JSON_RESPONSE",
      message: looksLikeHtml
        ? "Expected Jira data but received HTML. This may be a Jira login page, SSO redirect, proxy response, wrong path, or authentication failure."
        : acceptedNonJson ? undefined : ok ? "Expected JSON but received a non-JSON response." : messageForHttpStatus(status),
      bodyPreview: sanitizeBodyPreview(text),
      bodyTextSanitized: allowNonJson && !looksLikeHtml ? sanitizeResponseText(text) : undefined
    };
  }

  try {
    const json = text ? JSON.parse(text) : null;
    return {
      ok,
      status,
      contentType,
      json,
      errorType: ok ? undefined : "HTTP_ERROR",
      message: ok ? undefined : messageForHttpStatus(status),
      bodyPreview: ok ? undefined : sanitizeBodyPreview(text)
    };
  } catch {
    return {
      ok: false,
      status,
      contentType,
      json: null,
      errorType: "INVALID_JSON",
      message: "Expected JSON but received invalid JSON.",
      bodyPreview: sanitizeBodyPreview(text)
    };
  }
}
