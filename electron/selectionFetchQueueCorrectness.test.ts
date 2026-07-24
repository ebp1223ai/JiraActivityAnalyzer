import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { preflightFullFetchQueue } from "./fullFetchPreflight.js";
import {
  buildTimelineQueueTransition,
  reconcileIssueKeySets,
  type FetchQueueMetadata,
  type QueueCandidateLike
} from "./userAnalysisWorkflow.js";

type Candidate = QueueCandidateLike & { id: string };

function group(issueKey: string, trusted = true) {
  return {
    issueKey,
    source: "activity_timeline",
    isJiraRelated: trusted,
    hasJiraIssueKey: trusted,
    timelineEventIds: [`event-${issueKey}`],
    activityTypes: ["comment"],
    confidenceSummary: { high: 1, medium: 0, low: 0 },
    issueKeyRole: "primary"
  };
}

function candidate(issueKey: string, metadata?: FetchQueueMetadata): Candidate {
  return {
    id: issueKey,
    key: issueKey,
    matchedReason: "selected_from_activity_timeline",
    queueMetadata: metadata ?? {
      sources: ["activity_timeline"],
      matchedReasons: ["selected_from_activity_timeline"],
      selectedUser: "test.user",
      dateRange: { start: "2026-07-01", end: "2026-07-23" },
      timelineEventIds: [],
      activityTypes: [],
      confidenceSummary: { high: 0, medium: 0, low: 0 },
      issueKeyRole: "primary",
      addedAt: "2026-07-23T00:00:00.000Z"
    }
  };
}

function transition(input: {
  selected: string[];
  groups: ReturnType<typeof group>[];
  candidates?: Candidate[];
  oldQueue?: string[];
}) {
  return buildTimelineQueueTransition<Candidate>({
    groups: input.groups,
    selectedIssueKeys: input.selected,
    candidateIssues: input.candidates ?? [],
    selectedForFetch: input.oldQueue ?? [],
    selectedUser: "test.user",
    dateRange: { start: "2026-07-01", end: "2026-07-23" },
    addedAt: "2026-07-23T00:00:00.000Z",
    createCandidate: (issueKey, metadata) => candidate(issueKey, metadata)
  });
}

const groups = [group("COPGEN1-100"), group("COPGEN1-101"), group("NDS-4316")];
const crossProject = transition({
  selected: [" copgen1-100 ", "COPGEN1-101", "nds-4316"],
  groups
});
assert.equal(crossProject.ok, true);
assert.deepEqual(crossProject.selectedForFetch, ["COPGEN1-100", "COPGEN1-101", "NDS-4316"]);
assert.equal(new Set(crossProject.selectedForFetch).size, 3);

const removeOne = transition({
  selected: ["COPGEN1-101", "NDS-4316"],
  groups,
  candidates: crossProject.candidateIssues,
  oldQueue: crossProject.selectedForFetch
});
assert.deepEqual(removeOne.selectedForFetch, ["COPGEN1-101", "NDS-4316"]);

const replaceOldQueue = transition({
  selected: ["COPGEN1-100", "NDS-4316"],
  groups,
  candidates: [candidate("COPGEN1-125806"), candidate("COPGEN1-OLD"), ...crossProject.candidateIssues],
  oldQueue: ["COPGEN1-125806", "COPGEN1-OLD"]
});
assert.deepEqual(replaceOldQueue.selectedForFetch, ["COPGEN1-100", "NDS-4316"]);
assert.equal(replaceOldQueue.selectedForFetch.includes("COPGEN1-125806"), false);
assert.equal(replaceOldQueue.selectedForFetch.includes("COPGEN1-OLD"), false);

const rebuilt = transition({
  selected: ["COPGEN1-100", "NDS-4316", "copgen1-100"],
  groups,
  candidates: replaceOldQueue.candidateIssues,
  oldQueue: replaceOldQueue.selectedForFetch
});
assert.deepEqual(rebuilt.selectedForFetch, ["COPGEN1-100", "NDS-4316"]);

const crossProjectPreflight = preflightFullFetchQueue({
  candidates: rebuilt.selectedForFetch.map((issueKey) => rebuilt.candidateIssues.find((item) => item.key === issueKey)!),
  projectScope: "COPGEN1"
});
assert.deepEqual(crossProjectPreflight.accepted.map((item) => item.key), ["COPGEN1-100", "NDS-4316"]);
assert.equal(crossProjectPreflight.excluded.some((item) => item.reasonCode === "PROJECT_SCOPE_MISMATCH"), false);

const untrustedImage = transition({
  selected: ["IMAGE-2026"],
  groups: [group("IMAGE-2026", false)]
});
assert.equal(untrustedImage.ok, false);
assert.deepEqual(untrustedImage.rejections.map((item) => item.reason), ["UNVERIFIED_JIRA_PROVENANCE"]);

const sameCountDifferentKeys = reconcileIssueKeySets({
  selectedIssueKeys: ["COPGEN1-100", "NDS-4316"],
  fetchQueueIssueKeys: ["COPGEN1-100", "COPGEN1-125806"],
  attemptedIssueKeys: ["COPGEN1-100", "COPGEN1-125806"],
  completedIssueKeys: ["COPGEN1-100", "COPGEN1-125806"],
  partialIssueKeys: [],
  failedIssueKeys: []
});
assert.equal(sameCountDifferentKeys.status, "MISMATCH");
assert.deepEqual(sameCountDifferentKeys.differences.missingFromQueue, ["NDS-4316"]);
assert.deepEqual(sameCountDifferentKeys.differences.unexpectedInQueue, ["COPGEN1-125806"]);

const match = reconcileIssueKeySets({
  selectedIssueKeys: [" copgen1-100 ", "nds-4316", "COPGEN1-102"],
  fetchQueueIssueKeys: ["COPGEN1-100", "NDS-4316", "COPGEN1-102"],
  attemptedIssueKeys: ["copgen1-100", "NDS-4316", "COPGEN1-102"],
  completedIssueKeys: ["COPGEN1-100"],
  partialIssueKeys: [" nds-4316 "],
  failedIssueKeys: ["COPGEN1-102"]
});
assert.equal(match.status, "MATCH");

const outcomeMismatch = reconcileIssueKeySets({
  selectedIssueKeys: ["A-1", "A-2"],
  fetchQueueIssueKeys: ["A-1", "A-2"],
  attemptedIssueKeys: ["A-1", "A-2"],
  completedIssueKeys: ["A-1", "A-1", "A-3"],
  partialIssueKeys: ["A-1"],
  failedIssueKeys: []
});
assert.equal(outcomeMismatch.status, "MISMATCH");
assert.deepEqual(outcomeMismatch.differences.missingOutcome, ["A-2"]);
assert.deepEqual(outcomeMismatch.differences.unexpectedOutcome, ["A-3"]);
assert.deepEqual(outcomeMismatch.differences.duplicateOutcomeKeys, ["A-1"]);
assert.deepEqual(outcomeMismatch.differences.multiOutcomeKeys, ["A-1"]);

const root = process.cwd();
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
assert.equal(analysisSource.includes('data-testid="analysis-setup-project"'), false);
assert.match(analysisSource, /buildActivityTimeline\(\{ connection: activeConnection, selectedUser:[\s\S]*?startDate:[\s\S]*?endDate:[\s\S]*?requestWindow:/);
assert.match(mainSource, /ActivityStreamStabilityConfigV2 = \{[\s\S]*?projectScope: ""/);

console.log("v0.2.34 Selection / Fetch Queue correctness tests passed.");
