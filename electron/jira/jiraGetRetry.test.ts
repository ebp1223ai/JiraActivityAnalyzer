import assert from "node:assert/strict";
import { jiraGetWithRetry, jiraRetryDelayMs, shouldRetryJiraGet } from "./jiraGetRetry.js";
import type { JiraHttpResult } from "./jiraTypes.js";

const result = (status: number | "-", extra: Partial<JiraHttpResult> = {}): JiraHttpResult => ({
  ok: typeof status === "number" && status >= 200 && status < 300,
  status,
  contentType: "application/json",
  json: null,
  ...extra
});

assert.equal(shouldRetryJiraGet(result(429)), true);
assert.equal(shouldRetryJiraGet(result(503)), true);
assert.equal(shouldRetryJiraGet(result("-", { errorType: "NETWORK_ERROR" })), true);
assert.equal(shouldRetryJiraGet(result(400)), false);
assert.equal(shouldRetryJiraGet(result(401)), false);
assert.equal(shouldRetryJiraGet(result(403)), false);
assert.equal(shouldRetryJiraGet(result(404)), false);
assert.equal(jiraRetryDelayMs(result(429, { retryAfterSeconds: 2 }), 1), 2000);
assert.equal(jiraRetryDelayMs(result(503), 2), 800);

async function main() {
  const waits: number[] = [];
  let attempts = 0;
  const recovered = await jiraGetWithRetry(async () => {
    attempts += 1;
    return attempts < 3 ? result(503, { errorType: "HTTP_ERROR" }) : result(200);
  }, { sleep: async (ms) => { waits.push(ms); } });
  assert.equal(recovered.result.ok, true);
  assert.equal(recovered.attempts, 3);
  assert.deepEqual(waits, [400, 800]);

  let unauthorizedAttempts = 0;
  const unauthorized = await jiraGetWithRetry(async () => {
    unauthorizedAttempts += 1;
    return result(401, { errorType: "HTTP_ERROR" });
  }, { sleep: async () => { throw new Error("401 must not sleep"); } });
  assert.equal(unauthorized.attempts, 1);
  assert.equal(unauthorizedAttempts, 1);

  for (const retryableStatus of [408, 500, 502, 503, 504]) {
    let statusAttempts = 0;
    const exhausted = await jiraGetWithRetry(async () => {
      statusAttempts += 1;
      return result(retryableStatus, { errorType: "HTTP_ERROR" });
    }, { sleep: async () => undefined });
    assert.equal(exhausted.attempts, 3, `${retryableStatus} should use at most three same-run attempts`);
    assert.equal(statusAttempts, 3);
  }

  for (const transportFailure of [{ errorType: "NETWORK_ERROR" as const }, { timeout: true }]) {
    let transportAttempts = 0;
    const exhausted = await jiraGetWithRetry(async () => {
      transportAttempts += 1;
      return result("-", transportFailure);
    }, { sleep: async () => undefined });
    assert.equal(exhausted.attempts, 3);
    assert.equal(transportAttempts, 3);
  }

  let rateLimitAttempts = 0;
  const rateLimited = await jiraGetWithRetry(async () => {
    rateLimitAttempts += 1;
    return result(429, { errorType: "HTTP_ERROR", retryAfterSeconds: 0 });
  }, { sleep: async (ms) => { waits.push(ms); } });
  assert.equal(rateLimited.attempts, 3);
  assert.equal(rateLimitAttempts, 3);
  console.log("Jira GET retry policy tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
