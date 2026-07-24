import assert from "node:assert/strict";
import { resolveActivityIssueKeys } from "./activityIssueKeys.js";
import { buildUserActivityTimeline } from "./userActivityTimeline.js";

const attachmentLike = resolveActivityIssueKeys({
  title: "IMAGE-2026",
  summary: "Uploaded IMAGE-2026 screenshot",
  linkHref: "/secure/attachment/123/image-2026.png"
});
assert.equal(attachmentLike.issueKey, "");
assert.deepEqual(attachmentLike.allIssueKeys, []);
assert.deepEqual(attachmentLike.mentionedIssueKeys, []);
assert.deepEqual(attachmentLike.rejectedCandidateIssueKeys, [{
  issueKey: "IMAGE-2026",
  provenance: "title_text",
  reason: "unstructured_text_is_not_authoritative"
}]);

for (const rawText of [
  "attachment filename IMAGE-2026.png",
  "https://confluence.example/download/attachments/123/IMAGE-2026.png",
  '<img src="/download/attachments/123/IMAGE-2026.png">',
  "![screenshot](IMAGE-2026.png)",
  "comment text mentions IMAGE-2026 without a Jira link"
]) {
  const rejected = resolveActivityIssueKeys({ title: rawText });
  assert.deepEqual(rejected.allIssueKeys, [], rawText);
  assert.equal(rejected.rejectedCandidateIssueKeys[0]?.issueKey, "IMAGE-2026", rawText);
}

const accepted = resolveActivityIssueKeys({
  linkHref: "https://jira.example/browse/COPGEN1-135244",
  title: "COPGEN1-135244 - IMAGE-2026",
  relatedIssueKeys: ["RELATED-7"]
});
assert.equal(accepted.issueKey, "COPGEN1-135244");
assert.deepEqual(accepted.allIssueKeys, ["COPGEN1-135244", "RELATED-7"]);
assert.deepEqual(accepted.rejectedCandidateIssueKeys.map((item) => item.issueKey), ["IMAGE-2026"]);
assert.equal(resolveActivityIssueKeys({ structuredIssueKey: "IMAGE-2026" }).issueKey, "IMAGE-2026", "valid structured keys are not blacklisted by name");
assert.equal(resolveActivityIssueKeys({ restIssueKey: "REST-42" }).issueKey, "REST-42");
const linkedPair = resolveActivityIssueKeys({
  linkHref: '<a href="/browse/COPGEN1-125695">source</a><a href="/browse/COPGEN1-125806">target</a>',
  title: "linked COPGEN1-125695 to COPGEN1-125806"
});
assert.equal(linkedPair.issueKey, "COPGEN1-125695");
assert.deepEqual(linkedPair.relatedIssueKeys, ["COPGEN1-125806"]);
assert.deepEqual(linkedPair.allIssueKeys, ["COPGEN1-125695", "COPGEN1-125806"]);

const timeline = buildUserActivityTimeline({
  timelineRunId: "timeline-provenance-test",
  builtAt: "2026-07-23T00:00:00.000Z",
  selectedUser: "tester",
  dateRange: { start: "2026-07-01", end: "2026-07-31" },
  projectScope: "",
  sourceRunId: "source-provenance-test",
  sourceParsedActivityCount: 1,
  sourceIssueKeys: ["COPGEN1-135244", "RELATED-7", "IMAGE-2026"],
  activityStreamQueryUser: "tester",
  entries: [{
    issueKey: "COPGEN1-135244",
    relatedIssueKeys: ["RELATED-7"],
    extractedIssueKeysPerEntry: ["COPGEN1-135244", "RELATED-7", "IMAGE-2026"],
    mentionedIssueKeys: ["IMAGE-2026"],
    activityTime: "2026-07-12T12:00:00.000Z",
    activityType: "attachment",
    activityTitle: "Uploaded IMAGE-2026",
    activityAuthor: "Tester",
    activityApplication: "Jira",
    entryFingerprint: "provenance-entry"
  }],
  baseline: {
    classification: "first_observation",
    retryTriggered: false,
    retryRecovered: false,
    baselineBestParsedActivityCount: 0,
    currentParsedActivityCount: 1,
    knownEntryFingerprints: []
  }
});

assert.deepEqual(timeline.events[0]?.allIssueKeys, ["COPGEN1-135244", "RELATED-7"]);
assert.deepEqual(timeline.events[0]?.mentionedIssueKeys, []);
assert.equal(timeline.events[0]?.allIssueKeys.includes("IMAGE-2026"), false);
assert.deepEqual(timeline.summary.integrity.sourceIssueKeys, ["COPGEN1-135244", "RELATED-7"]);
assert.equal(timeline.summary.integrity.timelineAllIssueKeys.includes("IMAGE-2026"), false);
assert.equal(timeline.summary.integrity.missingIssueKeysFromTimeline.includes("IMAGE-2026"), false);
assert.equal(timeline.summary.integrity.missingIssueKeysFromPrimaryTimeline.includes("IMAGE-2026"), false);
assert.equal(timeline.summary.integrity.warnings.some((warning) => warning.includes("IMAGE-2026")), false);

console.log("Issue-key provenance tests passed.");
