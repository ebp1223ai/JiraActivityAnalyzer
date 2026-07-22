import { assertReadOnlyRequest, ReadOnlyViolationError } from "./jiraReadOnlyGuard.js";
import { parseJiraResponse } from "./safeJson.js";
import type { JiraHttpResult, ProbeAuthType } from "./jiraTypes.js";

type JiraClientOptions = {
  baseUrl: string;
  email: string;
  apiToken: string;
  authType: ProbeAuthType;
};

export function authorizationHeader(email: string, apiToken: string, authType: ProbeAuthType) {
  if (authType === "bearer") {
    return `Bearer ${apiToken}`;
  }
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

export function createJiraClient(options: JiraClientOptions) {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");

  async function get(pathName: string): Promise<JiraHttpResult> {
    try {
      assertReadOnlyRequest("GET", pathName);
    } catch (error) {
      const message = error instanceof ReadOnlyViolationError ? error.message : "Blocked by read-only guard.";
      return {
        ok: false,
        status: "-",
        contentType: "read-only-guard",
        json: null,
        errorType: "READ_ONLY_VIOLATION",
        message
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    const requestStartedAt = new Date().toISOString();
    const requestSentMs = Date.now();
    const requestSentAt = new Date(requestSentMs).toISOString();
    try {
      const response = await fetch(`${baseUrl}${pathName}`, {
        headers: {
          Accept: "application/json",
          Authorization: authorizationHeader(options.email, options.apiToken, options.authType)
        },
        signal: controller.signal
      });
      const headersMs = Date.now();
      const contentType = response.headers.get("content-type") ?? "";
      const retryAfterHeader = response.headers.get("retry-after") ?? "";
      const retryAfterValue = retryAfterHeader.trim();
      const retryAfterDate = Date.parse(retryAfterValue);
      const retryAfterSeconds = /^\d+(?:\.\d+)?$/.test(retryAfterValue)
        ? Number(retryAfterValue)
        : Number.isFinite(retryAfterDate)
          ? Math.max(0, Math.ceil((retryAfterDate - Date.now()) / 1000))
          : undefined;
      const text = await response.text();
      const bodyCompletedMs = Date.now();
      return {
        ...parseJiraResponse(response.status, contentType, text, response.ok, pathName.startsWith("/plugins/servlet/streams")),
        requestStartedAt,
        requestSentAt,
        responseHeadersReceivedAt: new Date(headersMs).toISOString(),
        responseBodyCompletedAt: new Date(bodyCompletedMs).toISOString(),
        requestCompletedAt: new Date(bodyCompletedMs).toISOString(),
        httpDurationMs: bodyCompletedMs - requestSentMs,
        timeToFirstByteMs: headersMs - requestSentMs,
        timeToFirstByteAvailable: true,
        responseDownloadMs: bodyCompletedMs - headersMs,
        responseBytes: Buffer.byteLength(text, "utf8"),
        timeout: false,
        aborted: false,
        retryAfterSeconds
      };
    } catch (error) {
      const completedMs = Date.now();
      const aborted = controller.signal.aborted;
      return {
        ok: false,
        status: "-",
        contentType: aborted ? "timeout" : "network-error",
        json: null,
        errorType: "NETWORK_ERROR",
        message: aborted ? "Request timed out after 18000 ms." : `Network error. ${error instanceof Error ? error.message : "Check VPN, proxy, certificate, and base URL."}`,
        requestStartedAt,
        requestSentAt,
        responseHeadersReceivedAt: "",
        responseBodyCompletedAt: "",
        requestCompletedAt: new Date(completedMs).toISOString(),
        httpDurationMs: completedMs - requestSentMs,
        timeToFirstByteMs: null,
        timeToFirstByteAvailable: false,
        responseDownloadMs: 0,
        responseBytes: 0,
        timeout: aborted,
        aborted
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { get };
}
