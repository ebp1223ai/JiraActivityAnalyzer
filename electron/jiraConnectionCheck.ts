import crypto from "node:crypto";
import type { JiraRuntimeState, JiraRuntimeStatus } from "./runtimeStatus.js";

export type JiraConnectionCheckInput = {
  baseUrl: string;
  username: string;
  email: string;
  apiToken: string;
  authMode: "basic" | "bearer";
  apiVersion: "auto" | "v2" | "v3";
};

type FetchLike = typeof fetch;

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_URL");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function authorization(input: JiraConnectionCheckInput) {
  return input.authMode === "bearer"
    ? `Bearer ${input.apiToken}`
    : `Basic ${Buffer.from(`${input.email || input.username}:${input.apiToken}`).toString("base64")}`;
}

function statusForError(error: unknown): JiraRuntimeStatus {
  const value = `${error instanceof Error ? `${error.name} ${error.message} ${(error.cause as { code?: string } | undefined)?.code ?? ""}` : String(error)}`.toLowerCase();
  if (value.includes("abort") || value.includes("timeout")) return "TIMEOUT";
  if (value.includes("enotfound") || value.includes("eai_again") || value.includes("dns")) return "DNS_ERROR";
  if (value.includes("certificate") || value.includes("tls") || value.includes("ssl")) return "TLS_ERROR";
  return "NETWORK_ERROR";
}

function httpStatus(status: number): JiraRuntimeStatus {
  if (status === 401) return "AUTH_FAILED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNSUPPORTED_RESPONSE";
}

function result(status: JiraRuntimeStatus, overrides: Partial<Omit<JiraRuntimeState, "requestId">> = {}): Omit<JiraRuntimeState, "requestId"> {
  return {
    status,
    reasonCode: status,
    message: overrides.message ?? status.replaceAll("_", " ").toLowerCase(),
    checkedAt: new Date().toISOString(),
    lastSuccessAt: status === "CONNECTED" ? new Date().toISOString() : "",
    latencyMs: overrides.latencyMs ?? null,
    baseUrlNormalized: overrides.baseUrlNormalized ?? "",
    accountDisplayName: overrides.accountDisplayName ?? "",
    username: overrides.username ?? "",
    serverIdentity: overrides.serverIdentity ?? ""
  };
}

async function fetchJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* Classified by caller. */ }
    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkJiraConnection(
  input: JiraConnectionCheckInput,
  options: { fetchImpl?: FetchLike; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<Omit<JiraRuntimeState, "requestId">> {
  if (!input.baseUrl.trim() || !input.apiToken.trim() || !(input.username || input.email).trim()) {
    return result("NOT_CONFIGURED", { message: "Jira URL, account, or token is not configured." });
  }
  let baseUrlNormalized = "";
  try {
    baseUrlNormalized = normalizeBaseUrl(input.baseUrl);
  } catch {
    return result("INVALID_URL", { message: "Jira URL must use http or https." });
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const apiVersions = input.apiVersion === "auto" ? ["3", "2"] : [input.apiVersion.replace("v", "")];
  const headers = { Accept: "application/json", Authorization: authorization(input) };
  const started = Date.now();
  let lastStatus: JiraRuntimeStatus = "UNKNOWN_ERROR";
  let myself: { response: Response; text: string; json: Record<string, unknown> } | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      myself = await fetchJson(fetchImpl, `${baseUrlNormalized}/rest/api/${apiVersions[0]}/myself`, headers, timeoutMs);
      if (myself.response.ok) break;
      lastStatus = httpStatus(myself.response.status);
      if (input.apiVersion === "auto" && myself.response.status === 404) {
        myself = await fetchJson(fetchImpl, `${baseUrlNormalized}/rest/api/${apiVersions[1]}/myself`, headers, timeoutMs);
        if (myself.response.ok) break;
        lastStatus = httpStatus(myself.response.status);
      }
      if (lastStatus !== "SERVER_ERROR" || attempt === 2) {
        return result(lastStatus, { baseUrlNormalized, latencyMs: Date.now() - started, message: `Jira returned HTTP ${myself.response.status}.` });
      }
    } catch (error) {
      lastStatus = statusForError(error);
      if (!["NETWORK_ERROR", "DNS_ERROR", "TIMEOUT", "TLS_ERROR"].includes(lastStatus) || attempt === 2) {
        return result(lastStatus, { baseUrlNormalized, latencyMs: Date.now() - started, message: `Jira connection failed: ${lastStatus}.` });
      }
    }
    await (options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(200);
  }

  if (!myself?.response.ok || !myself.text || Object.keys(myself.json).length === 0) {
    return result("UNSUPPORTED_RESPONSE", { baseUrlNormalized, latencyMs: Date.now() - started, message: "Jira returned an unsupported identity response." });
  }

  let serverInfo: Record<string, unknown> = {};
  try {
    const info = await fetchJson(fetchImpl, `${baseUrlNormalized}/rest/api/2/serverInfo`, headers, timeoutMs);
    if (info.response.ok) serverInfo = info.json;
  } catch { /* Stable fallback identity is documented and deterministic. */ }
  const stableIdentitySource = String(serverInfo.serverId ?? "").trim()
    || JSON.stringify({
      baseUrl: String(serverInfo.baseUrl ?? baseUrlNormalized).replace(/\/+$/, "").toLowerCase(),
      deploymentType: serverInfo.deploymentType ?? "",
      version: serverInfo.version ?? "",
      serverTitle: serverInfo.serverTitle ?? ""
    });
  const serverIdentity = String(serverInfo.serverId ?? "").trim()
    ? `jira:${stableIdentitySource}`
    : `jira:fallback:${crypto.createHash("sha256").update(stableIdentitySource).digest("hex")}`;
  return result("CONNECTED", {
    message: "Jira connection is ready.",
    baseUrlNormalized,
    latencyMs: Date.now() - started,
    accountDisplayName: String(myself.json.displayName ?? myself.json.name ?? myself.json.emailAddress ?? "Authenticated"),
    username: String(myself.json.name ?? myself.json.accountId ?? input.username),
    serverIdentity
  });
}
