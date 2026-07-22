import type { JiraHttpResult } from "./jiraTypes.js";

export type JiraGetRetryEvent = {
  attempt: number;
  status: number | "-";
  errorCode: string;
  waitMs: number;
};

const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

export function shouldRetryJiraGet(result: JiraHttpResult) {
  if (typeof result.status === "number") return retryableStatuses.has(result.status);
  return result.timeout === true || result.errorType === "NETWORK_ERROR";
}

export function jiraRetryDelayMs(result: JiraHttpResult, attempt: number) {
  const retryAfter = Number((result as JiraHttpResult & { retryAfterSeconds?: number }).retryAfterSeconds);
  if (result.status === 429 && Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, Math.round(retryAfter * 1000));
  return Math.min(4_000, 400 * (2 ** Math.max(0, attempt - 1)));
}

export async function jiraGetWithRetry(
  get: () => Promise<JiraHttpResult>,
  options: { maxAttempts?: number; sleep?: (ms: number) => Promise<void>; onAttempt?: (event: JiraGetRetryEvent) => void } = {}
) {
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let result: JiraHttpResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = await get();
    const retry = !result.ok && shouldRetryJiraGet(result) && attempt < maxAttempts;
    const waitMs = retry ? jiraRetryDelayMs(result, attempt) : 0;
    options.onAttempt?.({ attempt, status: result.status, errorCode: String(result.errorType ?? (result.status === "-" ? "NETWORK_ERROR" : `HTTP_${result.status}`)), waitMs });
    if (!retry) return { result, attempts: attempt };
    await sleep(waitMs);
  }
  return { result: result!, attempts: maxAttempts };
}
