import assert from "node:assert/strict";
import { resolveActivityIssueKeys } from "./activityIssueKeys.js";
import { preflightFullFetchQueue } from "./fullFetchPreflight.js";
import { aggregateFullFetchStatus, canonicalIssueStatus } from "./fullFetchStatus.js";
import { buildTimelineIssueGroups } from "./userAnalysisWorkflow.js";
import { fetchJiraPages } from "./jira/jiraPagination.js";
import { jiraFailureCode } from "./jira/jiraErrorCode.js";
import { assertReadOnlyRequest, ReadOnlyViolationError } from "./jira/jiraReadOnlyGuard.js";
import type { JiraHttpResult } from "./jira/jiraTypes.js";

const response = (json: unknown, status: number | "-" = 200): JiraHttpResult => ({
  ok: typeof status === "number" && status >= 200 && status < 300,
  status,
  contentType: "application/json",
  json,
  errorType: status === 200 ? undefined : status === "-" ? "NETWORK_ERROR" : "HTTP_ERROR"
});

assert.doesNotThrow(() => assertReadOnlyRequest("GET", "/rest/api/2/issue/DEMO-1/changelog?startAt=0&maxResults=100"));
assert.doesNotThrow(() => assertReadOnlyRequest("GET", "/rest/api/3/issue/DEMO-1/changelog?maxResults=50"));
for (const pathName of [
  "/rest/api/2/issue/DEMO-1/changelog?expand=all",
  "/rest/api/2/issue/DEMO-1/changelog?startAt=0&token=secret"
]) assert.throws(() => assertReadOnlyRequest("GET", pathName), ReadOnlyViolationError);
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.throws(() => assertReadOnlyRequest(method, "/rest/api/2/issue/DEMO-1/changelog"), ReadOnlyViolationError);

const firstExample = resolveActivityIssueKeys({
  linkHref: "/browse/COPGEN1-135244",
  title: "COPGEN1-135244 - EXFMC0E0-0004"
});
assert.equal(firstExample.issueKey, "COPGEN1-135244");
assert.deepEqual(firstExample.mentionedIssueKeys, ["EXFMC0E0-0004"]);

const secondExample = resolveActivityIssueKeys({
  linkHref: "/browse/COPGEN1-138930",
  title: "COPGEN1-138930 - [JACKSONQLC-3024] IOFULLSEQWRT Failure"
});
assert.equal(secondExample.issueKey, "COPGEN1-138930");
assert.deepEqual(secondExample.mentionedIssueKeys, ["JACKSONQLC-3024"]);
assert.equal(resolveActivityIssueKeys({ structuredIssueKey: "STRUCT-2", title: "TEXT-9" }).issueKey, "STRUCT-2");
assert.equal(resolveActivityIssueKeys({ title: "ONLY-7" }).source, "unique_fallback");
assert.equal(resolveActivityIssueKeys({ title: "  lower-8 &amp; duplicate lower-8  " }).issueKey, "LOWER-8");
assert.equal(resolveActivityIssueKeys({ title: "ONE-1 and TWO-2" }).issueKey, "");
assert.equal(resolveActivityIssueKeys({ title: "ONE-1 and TWO-2" }).ambiguous, true);
const timelineGroups = buildTimelineIssueGroups([{ eventId: "event-1", issueKey: "COPGEN1-138930", allIssueKeys: ["COPGEN1-138930", "JACKSONQLC-3024"], eventTime: "2026-07-02T00:00:00.000Z", eventType: "link", sourceConfidence: "high" }]);
assert.deepEqual(timelineGroups.map((group) => group.issueKey), ["COPGEN1-138930"], "allIssueKeys must never create Fetch Queue groups");

const preflight = preflightFullFetchQueue({
  candidates: [
    { key: "DEMO-1", queueMetadata: { sources: ["activity_timeline"] } },
    { key: "bad key", queueMetadata: { sources: ["manual"] } },
    { key: "DEMO-1", queueMetadata: { sources: ["manual"] } },
    { key: "OTHER-2", queueMetadata: { sources: ["manual"] } },
    { key: "DEMO-3", queueMetadata: { sources: ["unknown"] } },
    { key: "DEMO-4", queueMetadata: { sources: ["manual"] } }
  ],
  fetchLimit: 1,
  projectScope: "DEMO"
});
assert.equal(preflight.ok, true);
assert.deepEqual(preflight.accepted.map((item) => item.key), ["DEMO-1"]);
assert.deepEqual(preflight.excluded.map((item) => item.reason), ["invalid_issue_key", "duplicate", "outside_project_scope", "untrusted_source", "fetch_limit"]);
const rejected = preflightFullFetchQueue({ candidates: [{ key: "not-valid" }], fetchLimit: 10 });
assert.equal(rejected.ok, false);
assert.equal(rejected.message, "Preflight validation failed / 抓取前驗證失敗");

assert.equal(canonicalIssueStatus("required_partial"), "partial");
assert.equal(canonicalIssueStatus("failed_issue"), "failed_final");
assert.deepEqual(aggregateFullFetchStatus(["eligible", "eligible"]), {
  total: 2, completed: 2, eligible: 2, partial: 0, failed: 0, notAttempted: 0,
  status: "completed", archiveEligible: true, invariantsValid: true
});
assert.equal(aggregateFullFetchStatus(["eligible", "partial"]).status, "completed_with_partial");
assert.equal(aggregateFullFetchStatus(["eligible", "failed_final"]).status, "completed_with_errors");
assert.equal(aggregateFullFetchStatus(["failed_final", "not_attempted_due_to_run_failure"], true).status, "failed");

async function main() {
  const empty = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"],
    fetchPage: async () => ({ result: response({ total: 0, values: [] }), attempts: 1 })
  });
  assert.equal(empty.metadata.paginationComplete, true);
  assert.equal(empty.metadata.pageCount, 1);

  const data = [{ id: "1" }, { id: "2" }, { id: "3" }];
  const shrunk = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"], pageSize: 100,
    fetchPage: async (startAt) => ({ result: response({ total: 3, values: data.slice(startAt, startAt + 1) }), attempts: 1 })
  });
  assert.equal(shrunk.metadata.paginationComplete, true);
  assert.equal(shrunk.metadata.pageCount, 3);
  assert.equal(shrunk.metadata.fetchedCount, 3);

  const duplicate = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["comments"], pageSize: 2,
    fetchPage: async (startAt) => ({ result: response({ total: 3, comments: startAt === 0 ? [{ id: "1" }, { id: "2" }] : [{ id: "2" }] }), attempts: 1 })
  });
  assert.equal(duplicate.metadata.paginationComplete, false);
  assert.equal(duplicate.metadata.duplicateCount, 1);
  assert.equal(duplicate.metadata.errorCode, "PAGINATION_DUPLICATE_RECORDS");

  const mismatch = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"], pageSize: 1,
    fetchPage: async (startAt) => ({ result: response({ total: startAt === 0 ? 2 : 3, values: [{ id: String(startAt + 1) }] }), attempts: 1 })
  });
  assert.equal(mismatch.metadata.errorCode, "PAGINATION_TOTAL_CHANGED");

  const invalid = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"],
    fetchPage: async () => ({ result: response({ total: "invalid", values: {} }), attempts: 1 })
  });
  assert.equal(invalid.metadata.errorCode, "INVALID_RESPONSE");
  assert.equal(invalid.metadata.paginationComplete, false);

  const forbidden = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"],
    fetchPage: async () => ({ result: response(null, 403), attempts: 1 })
  });
  assert.equal(forbidden.metadata.errorCode, "HTTP_403");
  assert.equal(forbidden.metadata.paginationComplete, false);
  assert.equal(jiraFailureCode(response(null, 401)), "HTTP_401");
  assert.equal(jiraFailureCode({ ...response(null, "-"), timeout: true }), "TIMEOUT");
  const missingIdentity = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"],
    fetchPage: async () => ({ result: response({ total: 1, values: [{ value: "no-id" }] }), attempts: 1 })
  });
  assert.equal(missingIdentity.metadata.errorCode, "INVALID_RESPONSE");
  console.log("Full Fetch correctness tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
