import type { JiraHttpResult } from "./jiraTypes.js";

export function jiraFailureCode(result: JiraHttpResult) {
  if (result.errorType === "READ_ONLY_VIOLATION") return "READ_ONLY_VIOLATION";
  if (result.timeout === true) return "TIMEOUT";
  if (result.errorType === "NON_JSON_RESPONSE" || result.errorType === "INVALID_JSON") return result.errorType;
  if (typeof result.status === "number") return `HTTP_${result.status}`;
  return result.errorType || "NETWORK_ERROR";
}
