import assert from "node:assert/strict";
import { resolveActivityIssueKeys } from "./activityIssueKeys.js";
import { createCanonicalQueueSnapshot, preflightFullFetchQueue } from "./fullFetchPreflight.js";
import { aggregateFullFetchStatus, canonicalIssueStatus, reconcileFullFetchCounts } from "./fullFetchStatus.js";
import { evaluateEmbeddedChangelog } from "./changelogCompatibility.js";
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
assert.deepEqual(firstExample.allIssueKeys, ["COPGEN1-135244"]);
assert.deepEqual(firstExample.mentionedIssueKeys, []);
assert.deepEqual(firstExample.rejectedCandidateIssueKeys.map((item) => item.issueKey), ["EXFMC0E0-0004"]);

const secondExample = resolveActivityIssueKeys({
  linkHref: "/browse/COPGEN1-138930",
  title: "COPGEN1-138930 - [JACKSONQLC-3024] IOFULLSEQWRT Failure"
});
assert.equal(secondExample.issueKey, "COPGEN1-138930");
assert.deepEqual(secondExample.allIssueKeys, ["COPGEN1-138930"]);
assert.deepEqual(secondExample.mentionedIssueKeys, []);
assert.deepEqual(secondExample.rejectedCandidateIssueKeys.map((item) => item.issueKey), ["JACKSONQLC-3024"]);
assert.equal(resolveActivityIssueKeys({ structuredIssueKey: "STRUCT-2", title: "TEXT-9" }).issueKey, "STRUCT-2");
assert.equal(resolveActivityIssueKeys({ title: "ONLY-7" }).source, "unresolved");
assert.deepEqual(resolveActivityIssueKeys({ title: "ONLY-7" }).candidateIssueKeys, ["ONLY-7"]);
assert.equal(resolveActivityIssueKeys({ title: "  lower-8 &amp; duplicate lower-8  " }).issueKey, "");
assert.equal(resolveActivityIssueKeys({ title: "image-2026-screenshot.png" }).issueKey, "");
assert.equal(resolveActivityIssueKeys({ title: "IMAGE-2026", linkHref: "/secure/attachment/123/image-2026.png" }).issueKey, "");
assert.deepEqual(resolveActivityIssueKeys({ title: "IMAGE-2026", linkHref: "/secure/attachment/123/image-2026.png" }).allIssueKeys, []);
assert.equal(resolveActivityIssueKeys({ linkHref: "https://jira.example/browse/COPGEN1-98700" }).issueKey, "COPGEN1-98700");
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
  projectScope: "DEMO"
});
assert.equal(preflight.ok, true);
assert.deepEqual(preflight.accepted.map((item) => item.key), ["DEMO-1", "OTHER-2", "DEMO-4"]);
assert.deepEqual(preflight.invalid.map((item) => item.reasonCode), ["INVALID_ISSUE_KEY"]);
assert.deepEqual(preflight.excluded.map((item) => item.reasonCode), ["DUPLICATE_ISSUE_KEY", "UNTRUSTED_SOURCE"]);
const rejected = preflightFullFetchQueue({ candidates: [{ key: "not-valid" }] });
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

const completeChangelog = evaluateEmbeddedChangelog({ startAt: 0, maxResults: 2, total: 2, histories: [{ id: "1" }, { id: "2" }] });
assert.equal(completeChangelog.metadata.statusCode, "CHANGELOG_COMPLETE");
assert.equal(completeChangelog.metadata.paginationComplete, true);
assert.equal(completeChangelog.histories.length, 2);
const partialChangelog = evaluateEmbeddedChangelog({ startAt: 0, maxResults: 100, total: 387, histories: Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1) })) });
assert.equal(partialChangelog.metadata.statusCode, "CHANGELOG_INCOMPLETE");
assert.equal(partialChangelog.histories.length, 100, "observed histories must be preserved when incomplete");
assert.equal(partialChangelog.partialReasons[0]?.expectedTotal, 387);
const unverifiedChangelog = evaluateEmbeddedChangelog({ histories: [{ id: "kept" }] });
assert.equal(unverifiedChangelog.metadata.statusCode, "CHANGELOG_TOTAL_UNAVAILABLE");
assert.equal(unverifiedChangelog.histories[0]?.id, "kept");
assert.equal(evaluateEmbeddedChangelog({ total: 0, histories: [] }).metadata.statusCode, "CHANGELOG_COMPLETE");
assert.equal(evaluateEmbeddedChangelog(undefined).metadata.statusCode, "CHANGELOG_MISSING");
assert.equal(evaluateEmbeddedChangelog({ histories: "invalid" }).metadata.statusCode, "CHANGELOG_INVALID");
const unsupportedDedicatedEndpoint = response(null, 404);
assert.equal(jiraFailureCode(unsupportedDedicatedEndpoint), "HTTP_404");
assert.equal(partialChangelog.histories.length, 100, "a separate endpoint failure must never replace embedded histories");

const queue43 = [
  ...Array.from({ length: 40 }, (_, index) => ({ key: `COPGEN1-${100000 + index}`, queueMetadata: { sources: ["manual"] } })),
  { key: "COPGEN1-125233", queueMetadata: { sources: ["manual"] } },
  { key: "COPGEN1-98700", queueMetadata: { sources: ["manual"] } },
  { key: "NDS-4316", queueMetadata: { sources: ["manual"] } }
];
const legacyQueueRequest = { candidates: queue43, projectScope: "COPGEN1", fetchLimit: 40 };
const queue43Preflight = preflightFullFetchQueue(legacyQueueRequest);
assert.equal(queue43Preflight.queueTotal, 43);
assert.equal(queue43Preflight.eligibleCount, 43);
assert.equal(queue43Preflight.excludedCount, 0);
assert.equal(queue43Preflight.invalidCount, 0);
assert.equal(queue43Preflight.plannedCount, 43);
assert.deepEqual(queue43Preflight.accepted.slice(-3).map((item) => item.key), ["COPGEN1-125233", "COPGEN1-98700", "NDS-4316"]);
const queueSnapshot = createCanonicalQueueSnapshot(queue43Preflight, "2026-07-23T00:00:00.000Z");
assert.equal(queueSnapshot.plannedCount, 43);
assert.equal(Object.isFrozen(queueSnapshot), true);
assert.equal(Object.isFrozen(queueSnapshot.items), true);
assert.equal(Object.isFrozen(queueSnapshot.items[0]), true);
assert.equal(Object.isFrozen(queueSnapshot.items[0]?.originalValue), true);
assert.equal(Object.isFrozen((queueSnapshot.items[0]?.originalValue as { queueMetadata?: unknown }).queueMetadata), true);
const reconciled = reconcileFullFetchCounts({ queueTotal: 43, eligible: 42, excluded: 1, invalid: 0, planned: 42, attempted: 42, completed: 40, partial: 1, failed: 1, notAttempted: 0 });
assert.equal(reconciled.countReconciliationPassed, true);
assert.equal(reconcileFullFetchCounts({ ...reconciled, attempted: 40 }).countReconciliationPassed, false);

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
  assert.equal(jiraFailureCode(response({}, 200)), "");
  assert.equal(jiraFailureCode(response(null, 204)), "");
  assert.equal(jiraFailureCode({ ...response(null, "-"), timeout: true }), "TIMEOUT");
  const missingIdentity = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["values"],
    fetchPage: async () => ({ result: response({ total: 1, values: [{ value: "no-id" }] }), attempts: 1 })
  });
  assert.equal(missingIdentity.metadata.errorCode, "INVALID_RESPONSE");
  console.log("Full Fetch correctness tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
