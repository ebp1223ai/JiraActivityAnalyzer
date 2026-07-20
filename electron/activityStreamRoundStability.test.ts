import assert from "node:assert/strict";
import { compareCompletedRounds, executeRoundFirstStability, migrateLegacyStabilityRunV1, normalizeRoundEvent, type ActivityStreamStabilityConfigV2, type RoundWindowFetchResult } from "./activityStreamRoundStability.js";

const baseConfig: ActivityStreamStabilityConfigV2 = { selectedUser: "roger", dateRange: { start: "2026-07-01", end: "2026-07-20" }, projectScope: "", requestWindow: { type: "7_days", customDays: null }, fullScanRoundCount: 3, delayBetweenRoundsMs: 3000, mergeStrategy: "union", roundExecutionMode: "force_all_rounds" };
const entry = (primary: string, referenced = "", action = "updated") => ({ activityApplication: "Jira", activityType: "field_change", activityAuthor: "roger", activityTime: "2026-07-01T00:00:00Z", objectType: "issue", issueKey: primary, extractedIssueKeysPerEntry: [primary, referenced].filter(Boolean), activityTitle: `${action} ${primary} ${referenced}`.trim(), entryFingerprint: `${primary}-${action}` });
const fetchResult = (entries: Record<string, unknown>[]): RoundWindowFetchResult => ({ httpStatus: "200", requestSucceeded: true, rawEventCount: entries.length, entries, apiDurationMs: 10 });

async function main() {
const order: string[] = [];
const delays: number[] = [];
const run = await executeRoundFirstStability(baseConfig, { probeRunId: "round-test", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: true, fetchWindow: async ({ roundNumber, windowNumber }) => { order.push(`${roundNumber}.${windowNumber}`); return fetchResult([entry(`ABC-${windowNumber}`)]); }, delay: async (milliseconds) => { delays.push(milliseconds); } });
assert.deepEqual(order, ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "3.1", "3.2", "3.3"]);
assert.deepEqual(delays, [3000, 3000]);
assert.equal(run.rounds.length, 3);
assert.equal(run.comparison.stability, "stable");
assert.equal(run.comparison.roundUnionEventCount, 3);
assert.equal(run.comparison.roundIntersectionEventCount, 3);
assert.equal(run.comparison.variableEventCount, 0);
assert.equal(run.comparison.consistencyRate, 1);

const oneWindowOrder: string[] = [];
await executeRoundFirstStability({ ...baseConfig, dateRange: { start: "2026-07-01", end: "2026-07-01" }, requestWindow: { type: "1_day", customDays: null } }, { probeRunId: "one-window", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async ({ roundNumber, windowNumber }) => { oneWindowOrder.push(`${roundNumber}.${windowNumber}`); return fetchResult([]); }, delay: async () => undefined });
assert.deepEqual(oneWindowOrder, ["1.1", "2.1", "3.1"]);

const oneRound = await executeRoundFirstStability({ ...baseConfig, fullScanRoundCount: 1, delayBetweenRoundsMs: 0 }, { probeRunId: "one-round", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async ({ windowNumber }) => fetchResult([entry(`ABC-${windowNumber}`)]) });
assert.equal(oneRound.rounds[0].windows.length, 3);
assert.equal(oneRound.comparison.stability, "insufficient_rounds");

let cancelChecks = 0;
const cancelled = await executeRoundFirstStability(baseConfig, { probeRunId: "cancel", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, shouldCancel: () => { cancelChecks += 1; return cancelChecks > 6; }, fetchWindow: async ({ roundNumber, windowNumber }) => fetchResult([entry(`ABC-${roundNumber}${windowNumber}`)]), delay: async () => undefined });
assert.equal(cancelled.status, "cancelled");
assert.ok(cancelled.rounds.length >= 1 && cancelled.rounds.length < 3);

const stopOrder: string[] = [];
const stopped = await executeRoundFirstStability({ ...baseConfig, fullScanRoundCount: 5, delayBetweenRoundsMs: 0, roundExecutionMode: "stop_when_stable" }, { probeRunId: "stop", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async ({ roundNumber, windowNumber }) => { stopOrder.push(`${roundNumber}.${windowNumber}`); return fetchResult([entry(`ABC-${windowNumber}`)]); } });
assert.equal(stopped.rounds.length, 2);
assert.equal(stopOrder.length, 6);

const forced = await executeRoundFirstStability({ ...baseConfig, fullScanRoundCount: 3, delayBetweenRoundsMs: 0, roundExecutionMode: "force_all_rounds" }, { probeRunId: "force", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async ({ windowNumber }) => fetchResult([entry(`ABC-${windowNumber}`)]) });
assert.equal(forced.rounds.length, 3);

const variable = await executeRoundFirstStability({ ...baseConfig, dateRange: { start: "2026-07-01", end: "2026-07-01" }, requestWindow: { type: "1_day", customDays: null }, delayBetweenRoundsMs: 0 }, { probeRunId: "variable", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async ({ roundNumber }) => fetchResult(roundNumber === 1 ? [entry("ABC-1")] : roundNumber === 2 ? [entry("ABC-1"), entry("ABC-2")] : [entry("ABC-2")]) });
assert.equal(variable.comparison.stability, "unstable");
assert.equal(variable.comparison.roundUnionEventCount, 2);
assert.equal(variable.comparison.roundIntersectionEventCount, 0);
assert.equal(variable.comparison.variableEventCount, 2);
assert.equal(variable.comparison.consistencyRate, 0);

const probably = await executeRoundFirstStability({ ...baseConfig, dateRange: { start: "2026-07-01", end: "2026-07-01" }, requestWindow: { type: "1_day", customDays: null }, fullScanRoundCount: 2, delayBetweenRoundsMs: 0 }, { probeRunId: "probably", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async ({ roundNumber }) => fetchResult([entry("ABC-1", "REF-2", roundNumber === 1 ? "created" : "updated")]) });
assert.equal(probably.comparison.stability, "probably_stable");

const noEvents = await executeRoundFirstStability({ ...baseConfig, dateRange: { start: "2026-07-01", end: "2026-07-01" }, requestWindow: { type: "1_day", customDays: null }, fullScanRoundCount: 2, delayBetweenRoundsMs: 0 }, { probeRunId: "empty", appSessionId: "app", jiraConnectionSessionId: "jira", coldStartSuspected: false, fetchWindow: async () => fetchResult([]) });
assert.equal(noEvents.comparison.consistencyRate, null);
assert.equal(noEvents.comparison.stability, "stable");

const keys = normalizeRoundEvent(entry("COPGEN1-138930", "JACKSONQLC-3024"));
assert.deepEqual(keys.primaryJiraKeys, ["COPGEN1-138930"]);
assert.deepEqual(keys.referencedJiraKeys, ["JACKSONQLC-3024"]);
assert.deepEqual(keys.allJiraLikeKeys, ["COPGEN1-138930", "JACKSONQLC-3024"]);
const sameKey = normalizeRoundEvent(entry("COPGEN1-138930", "COPGEN1-138930"));
assert.deepEqual(sameKey.referencedJiraKeys, []);
const noPrimary = normalizeRoundEvent({ ...entry("COPGEN1-1", "REF-2"), issueKey: "", target: "", activityTitle: "referenced context", rawTitle: "", rawSummary: "REF-2 REF-3", extractedIssueKeysPerEntry: ["REF-2", "REF-3"] });
assert.deepEqual(noPrimary.primaryJiraKeys, []);
assert.deepEqual(noPrimary.referencedJiraKeys, ["REF-2", "REF-3"]);

assert.equal(compareCompletedRounds([]).stability, "insufficient_rounds");
const legacy = migrateLegacyStabilityRunV1({ schemaVersion: "activity_stream_stability_probe_v1", attempts: [] });
assert.equal(legacy.legacyExecutionOrder, "window_first");
assert.equal(legacy.migrationStatus, "not_round_first");
console.log("[activity-stream-round-stability unit tests passed]");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
