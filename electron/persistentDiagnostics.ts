import fs from "node:fs";
import path from "node:path";

export type DiagnosticChannel = "main" | "renderer" | "transitions";

export type DiagnosticBuild = {
  version: string;
  buildTime: string;
  gitCommit: string;
  gitBranch: string;
};

export type PersistentDiagnostics = ReturnType<typeof createPersistentDiagnostics>;

type DiagnosticOptions = {
  logsDir: string;
  sessionId: string;
  build: DiagnosticBuild;
  appRoot: string;
  sanitizeText: (value: string) => string;
  now?: () => Date;
  retentionSessions?: number;
};

function safeValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 6) return "[max-depth]";
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack ?? "" };
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => safeValue(item, seen, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 200)) output[key] = safeValue(item, seen, depth + 1);
  return output;
}

function safeReadJson(filePath: string): Record<string, unknown> {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function maskCommonSecrets(value: string) {
  return value
    .replace(/("(?:authorization|cookie|password|secret|api[_-]?token|token)"\s*:\s*")([^"]*)(")/gi, "$1[masked]$3")
    .replace(/((?:Authorization|Cookie|Password|Secret|API[_-]?Token|Token)\s*[:=]\s*)([^\s,;]+)/gi, "$1[masked]")
    .replace(/(Basic|Bearer)\s+[A-Za-z0-9+/=._-]+/gi, "$1 [masked]");
}

function atomicJson(filePath: string, value: unknown) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, filePath);
}

export function createPersistentDiagnostics(options: DiagnosticOptions) {
  const now = options.now ?? (() => new Date());
  const sessionsDir = path.join(options.logsDir, "sessions");
  const sessionDir = path.join(sessionsDir, options.sessionId);
  const latestPath = path.join(options.logsDir, "latest-session.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  const previousPointer = safeReadJson(latestPath);
  const previousSessionId = typeof previousPointer.currentSessionId === "string" && previousPointer.currentSessionId !== options.sessionId
    ? previousPointer.currentSessionId
    : "";
  const startedAt = now().toISOString();
  const counts: Record<DiagnosticChannel, number> = { main: 0, renderer: 0, transitions: 0 };
  let writerFailed = false;

  const fileFor = (channel: DiagnosticChannel) => path.join(sessionDir, `${channel}.ndjson`);
  const summaryPath = path.join(sessionDir, "session-summary.json");

  const updateSummary = (status = "running") => {
    const summary = {
      schemaVersion: "diagnostic_session_v1",
      sessionId: options.sessionId,
      previousSessionId: previousSessionId || null,
      startedAt,
      updatedAt: now().toISOString(),
      status,
      appRoot: options.appRoot,
      build: options.build,
      eventCounts: counts,
      writerFailed
    };
    atomicJson(summaryPath, summary);
    atomicJson(latestPath, {
      currentSessionId: options.sessionId,
      previousSessionId: previousSessionId || null,
      updatedAt: summary.updatedAt,
      currentSessionDir: sessionDir,
      previousSessionDir: previousSessionId ? path.join(sessionsDir, previousSessionId) : null
    });
  };

  const write = (channel: DiagnosticChannel, event: string, details: unknown = {}, incidentId = "") => {
    const resolvedIncidentId = incidentId || `incident-${now().getTime()}-${Math.random().toString(16).slice(2, 8)}`;
    try {
      const record = {
        timestamp: now().toISOString(),
        sessionId: options.sessionId,
        incidentId: resolvedIncidentId,
        channel,
        event,
        build: options.build,
        appRoot: options.appRoot,
        details: safeValue(details)
      };
      const sanitized = options.sanitizeText(maskCommonSecrets(JSON.stringify(record)));
      fs.appendFileSync(fileFor(channel), `${sanitized}\n`, "utf8");
      counts[channel] += 1;
      updateSummary();
    } catch (error) {
      writerFailed = true;
      try {
        fs.appendFileSync(path.join(options.logsDir, "diagnostic-writer-failures.log"), `${now().toISOString()} ${String(error)}\n`, "utf8");
      } catch {
        // Diagnostics must never recursively crash the application.
      }
    }
    return resolvedIncidentId;
  };

  const retention = () => {
    const keep = Math.max(2, options.retentionSessions ?? 12);
    try {
      const directories = fs.readdirSync(sessionsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== options.sessionId)
        .map((entry) => ({ name: entry.name, path: path.join(sessionsDir, entry.name), modified: fs.statSync(path.join(sessionsDir, entry.name)).mtimeMs }))
        .sort((left, right) => right.modified - left.modified);
      const removed: string[] = [];
      for (const entry of directories.slice(keep - 1)) {
        fs.rmSync(entry.path, { recursive: true, force: true });
        removed.push(entry.name);
      }
      write("main", "session_retention", { policy: `keep_latest_${keep}`, removed });
    } catch (error) {
      write("main", "session_retention_failed", { error });
    }
  };

  updateSummary();
  write("main", "session_started", { previousSessionId: previousSessionId || null });
  retention();

  return {
    sessionId: options.sessionId,
    previousSessionId,
    logsDir: options.logsDir,
    sessionsDir,
    sessionDir,
    summaryPath,
    latestPath,
    fileFor,
    write,
    close: (status = "closed") => {
      try { updateSummary(status); } catch { /* best effort during shutdown */ }
    },
    snapshot: () => ({
      sessionId: options.sessionId,
      previousSessionId,
      logsDir: options.logsDir,
      sessionsDir,
      sessionDir,
      summaryPath,
      latestPath,
      eventCounts: { ...counts }
    })
  };
}
