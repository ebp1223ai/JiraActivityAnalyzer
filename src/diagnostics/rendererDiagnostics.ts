import { buildInfo } from "../buildInfo";

let lastSafeUserAction = "renderer_boot";
let reportingFailure = false;

export function createIncidentId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `renderer-${Date.now()}-${random}`;
}

export function maskRendererDiagnosticText(value: string) {
  return value
    .replace(/(Authorization\s*[:=]\s*)[^\r\n]+/gi, "$1[masked]")
    .replace(/((?:api[_-]?token|token|password|secret|cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[masked]")
    .replace(/(Basic|Bearer)\s+[A-Za-z0-9+/=._-]+/gi, "$1 [masked]")
    .slice(0, 12000);
}

export function safeDiagnosticValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 6) return "[max-depth]";
  if (value instanceof Error) return {
    name: value.name,
    message: maskRendererDiagnosticText(value.message),
    stack: maskRendererDiagnosticText(value.stack ?? "")
  };
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();
  if (!value || typeof value !== "object") return typeof value === "string" ? maskRendererDiagnosticText(value) : value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => safeDiagnosticValue(item, seen, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 200)) output[key] = safeDiagnosticValue(item, seen, depth + 1);
  return output;
}

export function rememberSafeUserAction(action: string) {
  lastSafeUserAction = maskRendererDiagnosticText(action).slice(0, 500);
}

export function reportRendererDiagnostic(event: string, details: unknown, incidentId = createIncidentId()) {
  if (reportingFailure) return incidentId;
  reportingFailure = true;
  try {
    const payload = {
      event,
      incidentId,
      timestamp: new Date().toISOString(),
      currentRoute: window.location.hash || "#/",
      currentStep: document.querySelector("[data-workflow-active-step]")?.getAttribute("data-workflow-active-step") ?? "",
      lastSafeUserAction,
      build: buildInfo,
      details: safeDiagnosticValue(details)
    };
    void window.desktopApp?.appDiagnostics?.reportRendererEvent(payload).catch(() => {
      // The persistent writer owns its own fallback; renderer reporting must not recurse.
    });
  } catch {
    // Error reporting must never become a second renderer failure.
  } finally {
    reportingFailure = false;
  }
  return incidentId;
}

export function reportQueueTransition(details: Record<string, unknown>) {
  try {
    void window.desktopApp?.appDiagnostics?.reportTransition({
      ...details,
      currentRoute: window.location.hash || "#/",
      lastSafeUserAction,
      timestamp: new Date().toISOString()
    }).catch(() => {
      // Transition diagnostics are best effort and may not block the atomic UI update.
    });
  } catch {
    // Diagnostics must not block the workflow.
  }
}

export function installRendererDiagnostics() {
  window.addEventListener("error", (event) => {
    reportRendererDiagnostic("window.error", {
      error: event.error instanceof Error ? event.error : { name: "ErrorEvent", message: event.message },
      filename: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportRendererDiagnostic("window.unhandledrejection", {
      rejectionType: event.reason instanceof Error ? "Error" : typeof event.reason,
      reason: safeDiagnosticValue(event.reason)
    });
  });
  reportRendererDiagnostic("renderer_boot", { readyState: document.readyState });
}
