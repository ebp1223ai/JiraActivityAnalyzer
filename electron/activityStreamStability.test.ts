import assert from "node:assert/strict";
import { classifyWindowStability, finalizeAttemptDiffs, fingerprintSet, mergeProbeAttempts, normalizeStabilityEvent, recommendStabilitySettings, splitActivityStreamWindows, type ActivityStreamProbeAttempt } from "./activityStreamStability.js";

const event = (key: string, title = key) => normalizeStabilityEvent({ activityApplication: "Jira", activityType: "comment", activityAuthor: "roger", activityTime: "2026-02-01T00:00:00Z", objectType: "issue", issueKey: key, extractedIssueKeysPerEntry: [key], activityTitle: title, entryFingerprint: `source-${key}-${title}` });
const attempt = (number: number, events: ReturnType<typeof event>[]): ActivityStreamProbeAttempt => ({ probeRunId: "ASP-test", windowId: "window-1", attemptId: `attempt-${number}`, requestWindowStart: "2026-02-01", requestWindowEnd: "2026-02-07", attemptNumber: number, totalAttempts: 3, startedAt: "", completedAt: "", durationMs: 1, httpStatus: "200", requestSucceeded: true, rawEventCount: events.length, normalizedEventCount: events.length, uniqueEventCount: events.length, jiraIssueKeyCount: new Set(events.flatMap((item) => item.issueKeys)).size, confluenceEventCount: 0, duplicateCount: 0, newEventsComparedWithPreviousAttempt: 0, missingEventsComparedWithPreviousAttempt: 0, newEventsComparedWithCurrentUnion: 0, missingEventsComparedWithFinalUnion: 0, eventSetFingerprint: fingerprintSet(events.map((item) => item.stableEventId)), issueKeySetFingerprint: fingerprintSet(events.flatMap((item) => item.issueKeys)), errorType: "", errorMessage: "", idleGapSeconds: 0, coldStartSuspected: false, normalizedEvents: events, rawResultSanitized: {} });

assert.equal(splitActivityStreamWindows("2026-01-01", "2026-01-01", "1_day").length, 1);
assert.deepEqual(splitActivityStreamWindows("2026-01-01", "2026-01-15", "7_days").map((item) => [item.start, item.end]), [["2026-01-01", "2026-01-07"], ["2026-01-08", "2026-01-14"], ["2026-01-15", "2026-01-15"]]);
assert.deepEqual(splitActivityStreamWindows("2024-02-01", "2024-03-02", "calendar_month").map((item) => [item.start, item.end]), [["2024-02-01", "2024-02-29"], ["2024-03-01", "2024-03-02"]]);
assert.equal(splitActivityStreamWindows("2026-01-01", "2026-01-31", "14_days").length, 3);
assert.equal(splitActivityStreamWindows("2026-01-01", "2026-01-31", "custom_days", 5).length, 7);
assert.throws(() => splitActivityStreamWindows("2026-02-02", "2026-02-01", "7_days"));
assert.throws(() => splitActivityStreamWindows("2026-02-01", "2026-02-02", "custom_days", 32));

const a = event("ABC-1", "A");
const b = event("ABC-2", "B");
const c = event("ABC-1", "C");
const aWithVolatileMetadata = normalizeStabilityEvent({ activityApplication: "Jira", activityType: "comment", activityAuthor: "roger", activityTime: "2026-02-01T00:00:00Z", objectType: "issue", issueKey: "ABC-1", extractedIssueKeysPerEntry: ["ABC-1"], activityTitle: "A", entryFingerprint: "source-ABC-1-A", volatileRequestId: "different" });
assert.equal(classifyWindowStability([attempt(1, [a])]).classification, "insufficient_attempts");
assert.equal(classifyWindowStability([attempt(1, [a]), attempt(2, [a])]).classification, "stable");
assert.equal(classifyWindowStability([attempt(1, [a]), attempt(2, [c])]).classification, "probably_stable");
assert.equal(classifyWindowStability([attempt(1, [a]), attempt(2, [b])]).classification, "unstable");
assert.equal(classifyWindowStability([attempt(1, [a]), attempt(2, [a]), attempt(3, [b])]).classification, "unstable");
const failedAttempt = { ...attempt(2, []), requestSucceeded: false, httpStatus: "503", errorType: "HTTP_ERROR", errorMessage: "Service unavailable" };
assert.equal(classifyWindowStability([{ ...failedAttempt, attemptNumber: 1 }, failedAttempt]).classification, "unstable");
assert.equal(a.stableEventId, aWithVolatileMetadata.stableEventId);
const diffs = finalizeAttemptDiffs([attempt(1, [a]), attempt(2, [a, b])]);
assert.equal(diffs[1].newEventsComparedWithPreviousAttempt, 1);
assert.equal(diffs[0].missingEventsComparedWithFinalUnion, 1);
assert.equal(mergeProbeAttempts([attempt(1, [a]), attempt(2, [a, b])], "union", "union").events.length, 2);
assert.equal(mergeProbeAttempts([attempt(1, [a, aWithVolatileMetadata]), attempt(2, [a])], "union", "union").events.length, 1);
assert.equal(mergeProbeAttempts([attempt(1, [a]), attempt(2, [a])], "last_stable", "union").events.length, 1);
assert.match(mergeProbeAttempts([attempt(1, [a]), attempt(2, [b])], "last_stable", "union").fallbackReason, /Union/);
assert.match(mergeProbeAttempts([attempt(1, [a]), attempt(2, [b])], "last_stable", "last_attempt").fallbackReason, /last attempt/);
const recommendation = recommendStabilitySettings([{ windowId: "w", start: "", end: "", attempts: [attempt(1, [a]), attempt(2, [a])], stability: classifyWindowStability([attempt(1, [a]), attempt(2, [a])]), finalUnionEventCount: 1, finalUnionJiraKeyCount: 1, finalIntersectionEventCount: 1, recommendedRetryCount: 3 }], "7_days");
assert.equal(recommendation.recommendedRequestWindow, "7_days");
assert.ok(recommendation.recommendedRetryCount >= 2);
console.log("[activity-stream-stability unit tests passed]");
