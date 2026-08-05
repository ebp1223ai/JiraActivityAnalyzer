import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildLastUpdatedDateJql,
  canPublishCandidateDiscoveryResult,
  nextCalendarDate,
  validateLastUpdatedDateRange,
  type LastUpdatedDiscoveryConfig
} from "../shared/candidateDiscovery.js";
import { runLastUpdatedCandidateDiscovery, type UpdatedDiscoveryPageResponse } from "../electron/updatedCandidateDiscovery.js";

const config: LastUpdatedDiscoveryConfig = { mode: "LAST_UPDATED_DATE", startDate: "2026-07-01", endDate: "2026-07-07" };

function issue(index: number) {
  return {
    id: String(100000 + index),
    key: `SYNTH-${index + 1}`,
    fields: {
      summary: `Synthetic issue ${index + 1}`,
      status: { name: index % 2 ? "Done" : "Open" },
      assignee: { displayName: "Synthetic Assignee" },
      reporter: { displayName: "Synthetic Reporter" },
      creator: { displayName: "Synthetic Creator" },
      updated: `2026-07-${String((index % 7) + 1).padStart(2, "0")}T12:00:00.000Z`,
      created: "2026-06-01T00:00:00.000Z",
      issuetype: { name: "Task" },
      priority: { name: "Medium" },
      project: { key: "SYNTH", name: "Synthetic Project" }
    }
  };
}

function pagedSearch(total: number, serverPageSize = 100) {
  const items = Array.from({ length: total }, (_, index) => issue(index));
  return async ({ startAt }: { startAt: number }): Promise<UpdatedDiscoveryPageResponse> => ({
    ok: true,
    status: 200,
    contentType: "application/json",
    json: { startAt, maxResults: serverPageSize, total, issues: items.slice(startAt, startAt + serverPageSize) }
  });
}

async function run(total: number, serverPageSize = 100) {
  return runLastUpdatedCandidateDiscovery({ runId: `run-${total}-${serverPageSize}`, config, searchPage: pagedSearch(total, serverPageSize) });
}

async function main() {
assert.deepEqual(validateLastUpdatedDateRange("", "2026-07-07"), {
  ok: false,
  code: "UPDATED_DISCOVERY_INVALID_DATE_RANGE",
  message: "Start Date and End Date must be valid calendar dates."
});
assert.equal(validateLastUpdatedDateRange("2026-07-08", "2026-07-07").ok, false);
assert.equal(validateLastUpdatedDateRange("2026-02-30", "2026-03-01").ok, false);
assert.equal(nextCalendarDate("2024-02-29"), "2024-03-01");
assert.equal(nextCalendarDate("2026-12-31"), "2027-01-01");
const updatedJql = buildLastUpdatedDateJql(config.startDate, config.endDate);
assert.equal(updatedJql, 'updated >= "2026-07-01" AND updated < "2026-07-08" ORDER BY updated ASC, key ASC');
assert.doesNotMatch(updatedJql, /assignee|reporter|creator|updatedBy|project|window|round/i);

for (const [total, pageSize, expectedPages] of [[0, 100, 1], [37, 100, 1], [100, 100, 1], [1001, 100, 11], [3426, 100, 35], [3426, 37, 93]] as const) {
  const result = await run(total, pageSize);
  assert.equal(result.status, "COMPLETED", `${total} items with server page ${pageSize}`);
  assert.equal(result.ok, true);
  assert.equal(result.metadata.rawFetchedCount, total);
  assert.equal(result.metadata.uniqueIssueCount, total);
  assert.equal(result.metadata.pageCount, expectedPages);
  assert.equal(result.metadata.finalObservedTotal, total);
  assert.equal(result.metadata.runId, `run-${total}-${pageSize}`);
  assert.equal(result.metadata.startDate, config.startDate);
  assert.equal(result.metadata.endDate, config.endDate);
  assert.equal(result.candidates.at(-1)?.key, total ? `SYNTH-${total}` : undefined);
  assert.ok(result.candidates.every((candidate) => candidate.matchedReason === "LAST_UPDATED_IN_RANGE"));
}

let retryAttempts = 0;
const retrySuccess = await runLastUpdatedCandidateDiscovery({
  runId: "retry-success",
  config,
  retryCount: 1,
  searchPage: async ({ startAt }) => {
    retryAttempts += 1;
    if (retryAttempts === 1) return { ok: false, status: 503, message: "synthetic temporary failure" };
    return { ok: true, status: 200, json: { startAt, maxResults: 100, total: 1, issues: [issue(0)] } };
  }
});
assert.equal(retrySuccess.status, "COMPLETED");
assert.equal(retryAttempts, 2);

const retryFailure = await runLastUpdatedCandidateDiscovery({
  runId: "retry-failure",
  config,
  retryCount: 1,
  searchPage: async () => ({ ok: false, status: 503, message: "synthetic failure" })
});
assert.equal(retryFailure.status, "FAILED");
assert.equal(retryFailure.errorCode, "UPDATED_DISCOVERY_REQUEST_FAILED");

const authFailure = await runLastUpdatedCandidateDiscovery({
  runId: "auth-failure",
  config,
  searchPage: async () => ({ ok: false, status: 401, message: "Unauthorized" })
});
assert.equal(authFailure.status, "FAILED");
assert.equal(authFailure.errorCode, "UPDATED_DISCOVERY_AUTH_FAILED");

let emptyCalls = 0;
const emptyPage = await runLastUpdatedCandidateDiscovery({
  runId: "empty-page",
  config,
  searchPage: async ({ startAt }) => {
    emptyCalls += 1;
    return { ok: true, status: 200, json: { startAt, maxResults: 100, total: 150, issues: emptyCalls === 1 ? Array.from({ length: 100 }, (_, index) => issue(index)) : [] } };
  }
});
assert.equal(emptyPage.status, "PARTIAL");
assert.equal(emptyPage.errorCode, "UPDATED_DISCOVERY_PAGINATION_STALLED");
assert.equal(emptyPage.candidates.length, 0, "partial results must not be publishable");

let stalledCalls = 0;
const stalled = await runLastUpdatedCandidateDiscovery({
  runId: "stalled",
  config,
  searchPage: async ({ startAt }) => {
    stalledCalls += 1;
    return { ok: true, status: 200, json: { startAt: stalledCalls === 1 ? startAt : 0, maxResults: 100, total: 150, issues: Array.from({ length: stalledCalls === 1 ? 100 : 50 }, (_, index) => issue(index + (stalledCalls === 1 ? 0 : 100))) } };
  }
});
assert.equal(stalled.status, "PARTIAL");
assert.equal(stalled.errorCode, "UPDATED_DISCOVERY_PAGINATION_STALLED");

let duplicateCalls = 0;
const duplicate = await runLastUpdatedCandidateDiscovery({
  runId: "duplicate",
  config,
  searchPage: async ({ startAt }) => {
    duplicateCalls += 1;
    const issues = duplicateCalls === 1
      ? Array.from({ length: 100 }, (_, index) => issue(index))
      : [issue(99), ...Array.from({ length: 49 }, (_, index) => issue(index + 101))];
    return { ok: true, status: 200, json: { startAt, maxResults: 100, total: 150, issues } };
  }
});
assert.equal(duplicate.status, "PARTIAL");
assert.equal(duplicate.errorCode, "UPDATED_DISCOVERY_PARTIAL");
assert.equal(duplicate.metadata.duplicateCount, 1);
assert.equal(duplicate.candidates.length, 0);

let driftCalls = 0;
const drift = await runLastUpdatedCandidateDiscovery({
  runId: "total-drift",
  config,
  searchPage: async ({ startAt }) => {
    driftCalls += 1;
    const total = driftCalls === 1 ? 150 : 151;
    const count = driftCalls === 1 ? 100 : 51;
    return { ok: true, status: 200, json: { startAt, maxResults: 100, total, issues: Array.from({ length: count }, (_, index) => issue(startAt + index)) } };
  }
});
assert.equal(drift.status, "PARTIAL");
assert.equal(drift.errorCode, "UPDATED_DISCOVERY_CONSISTENCY_CHANGED");
assert.deepEqual(drift.metadata.observedTotals, [150, 151]);

let cancelCalls = 0;
const cancelled = await runLastUpdatedCandidateDiscovery({
  runId: "cancelled",
  config,
  isCancelled: () => cancelCalls > 0,
  searchPage: async ({ startAt }) => {
    cancelCalls += 1;
    return { ok: true, status: 200, json: { startAt, maxResults: 100, total: 200, issues: Array.from({ length: 100 }, (_, index) => issue(index)) } };
  }
});
assert.equal(cancelled.status, "CANCELLED");
assert.equal(cancelled.errorCode, "UPDATED_DISCOVERY_CANCELLED");
assert.equal(cancelled.candidates.length, 0);

const invalidResponse = await runLastUpdatedCandidateDiscovery({
  runId: "invalid-response",
  config,
  searchPage: async () => ({ ok: true, status: 200, json: { startAt: "bad", maxResults: 100, total: 1, issues: [] } })
});
assert.equal(invalidResponse.status, "FAILED");
assert.equal(invalidResponse.errorCode, "UPDATED_DISCOVERY_INVALID_RESPONSE");

assert.equal(canPublishCandidateDiscoveryResult({ status: "COMPLETED", activeRunId: "new", responseRunId: "old", activeMode: "LAST_UPDATED_DATE", responseMode: "LAST_UPDATED_DATE" }), false);
assert.equal(canPublishCandidateDiscoveryResult({ status: "PARTIAL", activeRunId: "same", responseRunId: "same", activeMode: "LAST_UPDATED_DATE", responseMode: "LAST_UPDATED_DATE" }), false);
assert.equal(canPublishCandidateDiscoveryResult({ status: "COMPLETED", activeRunId: "same", responseRunId: "same", activeMode: "LAST_UPDATED_DATE", responseMode: "USER_RELATED" }), false);
assert.equal(canPublishCandidateDiscoveryResult({ status: "COMPLETED", activeRunId: "same", responseRunId: "same", activeMode: "LAST_UPDATED_DATE", responseMode: "LAST_UPDATED_DATE" }), true);

const root = process.cwd();
const stateSource = fs.readFileSync(path.join(root, "src", "state", "SessionStateContext.tsx"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
assert.match(stateSource, /candidateDiscoveryMode: "USER_RELATED"/);
assert.match(analysisSource, /candidateDiscoveryMode === "USER_RELATED" \? <div className="min-w-0">/);
assert.match(analysisSource, /candidateDiscoveryConfigSnapshot: configSnapshot/);
assert.match(analysisSource, /mode === "LAST_UPDATED_DATE"\s*\?\s*discovered\.map/);
assert.match(analysisSource, /canPublishCandidateDiscoveryResult/);
assert.match(analysisSource, /Candidate Set was not replaced because this run was not complete/);
assert.match(mainSource, /const safetyLimit = Math\.min\(Math\.max\(Number\(payload\.safetyLimit\) \|\| 1000, 1\), 1000\)/, "User mode safety limit must remain unchanged");
assert.match(mainSource, /if \(mode === "LAST_UPDATED_DATE"\)/);
assert.match(mainSource, /runLastUpdatedCandidateDiscovery/);

console.log("v0.2.64 dual Candidate Discovery and complete pagination tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
