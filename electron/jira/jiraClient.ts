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
    try {
      const response = await fetch(`${baseUrl}${pathName}`, {
        headers: {
          Accept: "application/json",
          Authorization: authorizationHeader(options.email, options.apiToken, options.authType)
        },
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      return parseJiraResponse(response.status, contentType, text, response.ok, pathName.startsWith("/plugins/servlet/streams"));
    } catch {
      return {
        ok: false,
        status: "-",
        contentType: "network-error",
        json: null,
        errorType: "NETWORK_ERROR",
        message: "Network error. Check VPN, proxy, certificate, and base URL."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { get };
}
