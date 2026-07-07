const sensitiveKeyPattern = /authorization|token|apiToken|password|masterKey|cookie|set-cookie|session|sessionId|JSESSIONID|atl\.xsrf\.token|csrf|secret/i;

export function sanitizeExportData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExportData(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sensitiveKeyPattern.test(key) ? "[masked]" : sanitizeExportData(child);
    }
    return output;
  }

  if (typeof value === "string") {
    return value
      .replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [masked]")
      .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/gi, "Bearer [masked]");
  }

  return value;
}

export function sanitizeDebugLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => String(sanitizeExportData(String(line))));
}
