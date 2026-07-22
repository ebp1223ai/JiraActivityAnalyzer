import crypto from "node:crypto";

const sensitiveKeyPattern = /authorization|token|apiToken|password|masterKey|cookie|set-cookie|session|sessionId|JSESSIONID|atl\.xsrf\.token|csrf|secret/i;
const safeSessionMetadataKeys = new Set(["fullSessionBundle", "sessionStartTime", "appSessionId", "jiraConnectionSessionId"]);
const identityKeyPattern = /^(email|emailAddress|accountId|accountName|displayName|userName|username|userKey)$/i;
const pseudonymPattern = /^user-[a-f0-9]{12}$/i;

export type SanitizationContext = {
  profile: "debug-bundle-v1" | "export-v1";
  sanitizeText: (value: string) => string;
  sanitizeData: (value: unknown) => unknown;
};

function contextFromSecret(secret: Buffer | string, profile: SanitizationContext["profile"]): SanitizationContext {
  const pseudonym = (value: string) => {
    if (pseudonymPattern.test(value)) return value.toLowerCase();
    const digest = crypto.createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex").slice(0, 12);
    return `user-${digest}`;
  };

  const sanitizeString = (value: string) => value
    .replace(/("(?:email|emailAddress|accountId|accountName|displayName|userName|username|userKey)"\s*:\s*")((?:\\.|[^"\\])*)"/gi, (_match, prefix: string, identity: string) => `${prefix}${pseudonym(identity)}"`)
    .replace(/Basic\s+(?!\[masked\])[A-Za-z0-9+/=._-]+/gi, "Basic [masked]")
    .replace(/Bearer\s+(?!\[masked\])[A-Za-z0-9+/=._-]+/gi, "Bearer [masked]")
    .replace(/((?:authorization|api[_ -]?token|token|password|cookie|set-cookie|session[_ -]?token|sessionid|jsessionid|csrf)\s*[:=]\s*)(?!\[masked\])([^\s,;"',}\]]+)/gi, "$1[masked]")
    .replace(/([?&](?:access_token|api_token|token|password|session|credential)=)(?!\[masked\])[^&#\s"',}\]]*/gi, "$1[masked]")
    .replace(/\b[A-Z]:[\\/]+Users[\\/]+([^\\/\s"'<>]+)/gi, (fullPath, user: string) => fullPath.replace(user, pseudonym(user)))
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) => pseudonym(email));

  const sanitize = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        output[childKey] = sensitiveKeyPattern.test(childKey) && !safeSessionMetadataKeys.has(childKey)
          ? "[masked]"
          : identityKeyPattern.test(childKey) && typeof child === "string" && child
            ? pseudonym(child)
            : sanitize(child, childKey);
      }
      return output;
    }
    if (typeof value === "string") {
      if (identityKeyPattern.test(key) && value) return pseudonym(value);
      return sanitizeString(value);
    }
    return value;
  };

  return { profile, sanitizeText: sanitizeString, sanitizeData: sanitize };
}

const defaultContext = contextFromSecret("jira-activity-analyzer-export-v1", "export-v1");

export function createSanitizationContext(secret: Buffer | string = crypto.randomBytes(32)): SanitizationContext {
  return contextFromSecret(secret, "debug-bundle-v1");
}

export function sanitizeTextForBundle(value: string, context: SanitizationContext = defaultContext) { return context.sanitizeText(value); }
export function sanitizeExportData(value: unknown, context: SanitizationContext = defaultContext): unknown { return context.sanitizeData(value); }

export function sanitizeDebugLines(lines: unknown, context: SanitizationContext = defaultContext): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => String(sanitizeExportData(String(line), context)));
}
