import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { blockedFullFetchResponse, createFullFetchAttempt, evaluateFullFetchEligibility, type TimelineRunEligibilityRecord } from "../electron/fullFetchEligibility";
import { activityEventDisplayPolicy } from "../src/utils/activityEventDisplayPolicy";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (name: string, fn: () => void) => { fn(); checks += 1; console.log(`ok ${checks} - ${name}`); };
const timeline = (overrides: Partial<TimelineRunEligibilityRecord> = {}): TimelineRunEligibilityRecord => ({
  timelineRunId: "timeline-1", status: "completed", selectedUser: "sample.user", dateRange: { start: "2026-01-01", end: "2026-01-02" }, serverIdentity: "server-1", roundExecutionMode: "force_all_rounds", mergeStrategy: "union", expectedRoundCount: 3, completedRoundCount: 3, mergedEventCount: 12, reconciliationStatus: "reconciled", canonicalCompleted: true, completedAt: "2026-01-02T00:00:00.000Z", ...overrides
});
const eligible = () => evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-1", timelineRun: timeline() });

check("completed standard Timeline is eligible without Advanced Probe", () => assert.equal(eligible().eligible, true));
check("Advanced Probe is explicitly non-blocking", () => assert.equal(eligible().advancedProbeBlocking, false));
check("selected Timeline Run is authoritative", () => assert.equal(eligible().timelineRun?.timelineRunId, "timeline-1"));
check("partial Timeline is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-1", timelineRun: timeline({ status: "partial", canonicalCompleted: false }) }).reasonCode, "TIMELINE_RUN_PARTIAL"));
check("failed Timeline is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-1", timelineRun: timeline({ status: "failed", canonicalCompleted: false }) }).reasonCode, "TIMELINE_RUN_FAILED"));
check("cancelled Timeline is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-1", timelineRun: timeline({ status: "cancelled", canonicalCompleted: false }) }).reasonCode, "TIMELINE_RUN_CANCELLED"));
check("missing run ID is blocked", () => assert.equal(evaluateFullFetchEligibility({ timelineRun: null }).reasonCode, "TIMELINE_RUN_ID_MISSING"));
check("missing run registry entry is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-1", timelineRun: null }).reasonCode, "TIMELINE_RUN_NOT_FOUND"));
check("queue/run mismatch is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-2", timelineRun: timeline() }).reasonCode, "TIMELINE_RUN_MISMATCH"));
check("incomplete canonical merge is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-1", timelineRun: timeline({ canonicalCompleted: false }) }).reasonCode, "TIMELINE_RUN_INCOMPLETE"));

const blockedEligibility = evaluateFullFetchEligibility({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-2", timelineRun: timeline() });
const attempt = createFullFetchAttempt({ selectedTimelineRunId: "timeline-1", queueTimelineRunId: "timeline-2", selectedIssueKeys: Array.from({ length: 15 }, (_, index) => `DEMO-${index + 1}`), eligibility: blockedEligibility, now: "2026-01-02T00:00:00.000Z", attemptId: "attempt-1" });
const blocked = blockedFullFetchResponse(attempt, blockedEligibility);
check("blocked preflight creates attempt identity", () => assert.equal(attempt.attemptId, "attempt-1"));
check("blocked queue total remains 15", () => assert.equal(blocked.summary.queueTotal, 15));
check("blocked attempted count is zero", () => assert.equal(blocked.summary.attempted, 0));
check("blocked success count is zero", () => assert.equal(blocked.summary.succeeded, 0));
check("blocked failure count is zero", () => assert.equal(blocked.summary.failed, 0));
check("count reconciliation is NOT_RUN", () => assert.equal(blocked.summary.countReconciliation, "NOT_RUN"));
check("issue-key reconciliation is NOT_RUN", () => assert.equal(blocked.summary.issueKeyReconciliation, "NOT_RUN"));
check("blocked attempt does not create run", () => assert.equal(attempt.fullFetchRunCreated, false));
check("blocked response does not create staging", () => assert.equal(blocked.stagingSummary, null));
check("selected issue snapshot is immutable normalized order", () => assert.deepEqual(attempt.selectedIssueKeys.slice(0, 2), ["DEMO-1", "DEMO-2"]));

const createComment = activityEventDisplayPolicy({ eventType: "comment_created", commentId: "100", commentBody: "First line\nSecond line", displayName: "Sample User" });
const updateComment = activityEventDisplayPolicy({ eventType: "comment_updated", commentId: "101", commentBody: "Current complete comment" });
const unknownComment = activityEventDisplayPolicy({ fieldName: "Comment", commentBody: "Neutral comment" });
check("Comment Create uses CREATE", () => assert.equal(createComment.operation, "CREATE"));
check("Comment Create preserves full text", () => assert.match(createComment.content, /First line\nSecond line/));
check("Comment Update uses UPDATE", () => assert.equal(updateComment.operation, "UPDATE"));
check("Comment Update displays current content", () => assert.equal(updateComment.content, "Current complete comment"));
check("unknown Comment operation is neutral", () => assert.equal(unknownComment.operation, "COMMENT"));
check("ordinary field change remains change policy", () => assert.equal(activityEventDisplayPolicy({ eventType: "field_changed", fieldName: "description", after: "after" }).kind, "change"));

const table = read("src/components/SqliteDataTable.tsx");
const detail = read("src/components/ActivityEventDetailPanel.tsx");
const diffCell = read("src/components/DiffCell.tsx");
const issueViewer = read("src/routes/IssueViewerPage.tsx");
const userViewer = read("src/routes/UserViewerPage.tsx");
const main = read("electron/main.ts");
const connection = read("src/state/ConnectionContext.tsx");
check("detail row uses dynamic visible column count", () => assert.match(table, /colSpan=\{shown\.length\}/));
check("detail row follows summary row", () => assert.match(table, /activity-event-summary-row[\s\S]*activity-event-detail-row/));
check("detail panel has bounded internal overflow", () => assert.match(detail, /max-h-\[28rem\][^\"]*overflow-auto/));
check("Issue Viewer uses shared detail panel", () => assert.match(issueViewer, /ActivityEventDetailPanel/));
check("User Viewer uses shared detail panel", () => assert.match(userViewer, /ActivityEventDetailPanel/));
check("expanded control exposes aria-expanded", () => assert.match(diffCell, /aria-expanded=\{expanded\}/));
check("Comment branch does not render text diff", () => assert.match(detail, /if \(policy\.kind === "comment"\)[\s\S]*return \([\s\S]*Comment details/));
check("current attempt metadata excludes historical staging", () => assert.match(main, /historicalStagingIncluded: false/));
check("staging selection uses current attempt run registry", () => assert.match(main, /loadStagingRun\(currentRunRecord\.stagingDir\)/));
check("Debug Folder writes attempt metadata", () => assert.match(main, /full-fetch-attempt\.json/));
check("connection context subscribes to authoritative state", () => assert.match(connection, /connections\?\.onStateChanged/));
check("schema remains v3", () => assert.match(read("electron/currentStateArchive.ts"), /CURRENT_STATE_SCHEMA_VERSION = 3/));
check("event identity policy remains v3", () => assert.match(read("electron/activityEvents.ts"), /EVENT_IDENTITY_POLICY_VERSION = 3/));

assert.equal(checks, 39);
console.log("v0.2.55 focused checks passed: 39/39");
