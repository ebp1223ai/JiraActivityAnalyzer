import assert from "node:assert/strict";
import { buildTimelineQueueTransition, normalizeFetchQueueMetadata, type FetchQueueMetadata, type QueueCandidateLike } from "./userAnalysisWorkflow.js";

type Candidate = QueueCandidateLike & { id: string };

function group(issueKey: string, overrides: Record<string, unknown> = {}) {
  return {
    issueKey,
    source: "activity_timeline",
    isJiraRelated: true,
    hasJiraIssueKey: true,
    timelineEventIds: [`event-${issueKey}`],
    activityTypes: ["comment"],
    confidenceSummary: { high: 1, medium: 0, low: 0 },
    issueKeyRole: "primary",
    ...overrides
  };
}

function createCandidate(issueKey: string, metadata: FetchQueueMetadata): Candidate {
  return { id: issueKey, key: issueKey, matchedReason: "selected_from_activity_timeline", queueMetadata: metadata };
}

function transition(count: number, extra: Partial<Parameters<typeof buildTimelineQueueTransition<Candidate>>[0]> = {}) {
  const groups = Array.from({ length: count }, (_, index) => group(`HOTFIX-${index + 1}`));
  return buildTimelineQueueTransition<Candidate>({
    groups,
    selectedIssueKeys: groups.map((item) => item.issueKey),
    candidateIssues: [],
    selectedForFetch: [],
    selectedUser: "test.user",
    dateRange: { start: "2026-07-01", end: "2026-07-23" },
    addedAt: "2026-07-23T00:00:00.000Z",
    createCandidate,
    ...extra
  });
}

const noSelection = transition(0);
assert.equal(noSelection.ok, false);
assert.equal(noSelection.queueCountAfter, 0);

const one = transition(1);
assert.equal(one.ok, true);
assert.equal(one.queueCountAfter, 1);

const fiftyOne = transition(51);
assert.equal(fiftyOne.ok, true);
assert.equal(fiftyOne.selectedCount, 51);
assert.equal(fiftyOne.acceptedCount, 51);
assert.equal(fiftyOne.rejectedCount, 0);
assert.equal(fiftyOne.queueCountBefore, 0);
assert.equal(fiftyOne.queueCountAfter, 51);
assert.equal(new Set(fiftyOne.selectedForFetch).size, 51);

const oneHundred = transition(100);
assert.equal(oneHundred.queueCountAfter, 100);

const duplicate = buildTimelineQueueTransition<Candidate>({
  groups: [group("DUP-1"), group("DUP-1")],
  selectedIssueKeys: ["DUP-1", "DUP-1"],
  candidateIssues: [],
  selectedForFetch: [],
  selectedUser: "",
  dateRange: { start: "", end: "" },
  createCandidate
});
assert.equal(duplicate.queueCountAfter, 1);
assert.equal(duplicate.deduplicatedCount, 2);

const malformedLegacyMetadata = { sources: ["manual"] } as FetchQueueMetadata;
assert.throws(
  () => malformedLegacyMetadata.confidenceSummary.high,
  /undefined/,
  "The pre-hotfix Step 3 access must reproduce the legacy snapshot TypeError."
);
const repaired = buildTimelineQueueTransition<Candidate>({
  groups: [group("LEGACY-1", { timelineEventIds: undefined, activityTypes: undefined, confidenceSummary: undefined })],
  selectedIssueKeys: ["LEGACY-1"],
  candidateIssues: [{ id: "LEGACY-1", key: "LEGACY-1", matchedReason: "legacy", queueMetadata: malformedLegacyMetadata }],
  selectedForFetch: [],
  selectedUser: "",
  dateRange: { start: "", end: "" },
  createCandidate
});
assert.equal(repaired.ok, true);
const repairedMetadata = normalizeFetchQueueMetadata(repaired.candidateIssues[0]?.queueMetadata);
assert.deepEqual(repairedMetadata.timelineEventIds, []);
assert.deepEqual(repairedMetadata.activityTypes, []);
assert.deepEqual(repairedMetadata.confidenceSummary, { high: 0, medium: 0, low: 0 });
assert.doesNotThrow(() => {
  repairedMetadata.sources.join(", ");
  repairedMetadata.timelineEventIds.length;
  repairedMetadata.activityTypes.join(", ");
  repairedMetadata.confidenceSummary.high;
});

const provenance = buildTimelineQueueTransition<Candidate>({
  groups: [
    group("IMAGE-2026", { isJiraRelated: false, hasJiraIssueKey: false }),
    group("IMAGE-2027", { isJiraRelated: true, hasJiraIssueKey: true }),
    group("bad key", { isJiraRelated: true, hasJiraIssueKey: true }),
    group("MISSING-1", { isJiraRelated: true, hasJiraIssueKey: true })
  ],
  selectedIssueKeys: ["IMAGE-2026", "IMAGE-2027", "bad key", "NOGROUP-1"],
  candidateIssues: [],
  selectedForFetch: [],
  selectedUser: "",
  dateRange: { start: "", end: "" },
  createCandidate
});
assert.deepEqual(provenance.acceptedIssueKeys, ["IMAGE-2027"]);
assert.deepEqual(provenance.rejections.map((item) => item.reason), [
  "UNVERIFIED_JIRA_PROVENANCE",
  "INVALID_ISSUE_KEY",
  "CANDIDATE_GROUP_NOT_FOUND"
]);

const originalCandidates: Candidate[] = [];
const failed = buildTimelineQueueTransition<Candidate>({
  groups: [group("IMAGE-2026", { isJiraRelated: false, hasJiraIssueKey: false })],
  selectedIssueKeys: ["IMAGE-2026"],
  candidateIssues: originalCandidates,
  selectedForFetch: [],
  selectedUser: "",
  dateRange: { start: "", end: "" },
  createCandidate
});
assert.equal(failed.ok, false);
assert.equal(originalCandidates.length, 0, "Failed conversion must not mutate the prior queue.");

console.log("Queue transition hotfix tests passed: 0, 1, 51, 100, duplicate, legacy metadata, invalid and provenance cases.");
