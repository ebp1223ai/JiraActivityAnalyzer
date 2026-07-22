import crypto from "node:crypto";

const sensitiveKeyPattern = /authorization|token|apiToken|password|masterKey|cookie|set-cookie|session|sessionId|JSESSIONID|atl\.xsrf\.token|csrf|secret/i;
const safeSessionMetadataKeys = new Set(["fullSessionBundle", "sessionStartTime", "appSessionId", "jiraConnectionSessionId"]);
const identityKeyPattern = /^(email|emailAddress|accountId|displayName)$/i;

function pseudonym(kind: string, value: string) {
  const digest = crypto.createHash("sha256").update(`${kind.toLowerCase()}:${value.toLowerCase()}`).digest("hex").slice(0, 12);
  return kind.toLowerCase().includes("email") ? `user-${digest}@masked.invalid` : `${kind.toLowerCase()}-${digest}`;
}

function sanitizeString(value: string) {
  return value
    .replace(/("(email|emailAddress|accountId|displayName)"\s*:\s*")((?:\\.|[^"\\])*)"/gi, (_match, prefix: string, kind: string, identity: string) => `${prefix}${pseudonym(kind, identity)}"`)
    .replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [masked]")
    .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/gi, "Bearer [masked]")
    .replace(/((?:authorization|api[_ -]?token|token|password|cookie|set-cookie|session[_ -]?token|sessionid|jsessionid|csrf)\s*[:=]\s*)(?!\[masked\])([^\s,;"',}\]]+)/gi, "$1[masked]")
    .replace(/([?&](?:access_token|api_token|token|password|session|credential)=)[^&#\s"',}\]]*/gi, "$1[masked]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => pseudonym("email", email));
}

export function sanitizeTextForBundle(value: string) { return sanitizeString(value); }

function sanitize(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, key));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sensitiveKeyPattern.test(childKey) && !safeSessionMetadataKeys.has(childKey)
        ? "[masked]"
        : identityKeyPattern.test(childKey) && typeof child === "string" && child
          ? pseudonym(childKey, child)
          : sanitize(child, childKey);
    }
    return output;
  }

  if (typeof value === "string") {
    if (identityKeyPattern.test(key) && value) return pseudonym(key, value);
    return sanitizeString(value);
  }

  return value;
}

export function sanitizeExportData(value: unknown): unknown { return sanitize(value); }

export function sanitizeDebugLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => String(sanitizeExportData(String(line))));
}
