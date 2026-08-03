import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFullFetchAttempt, evaluateFullFetchEligibility, type FullFetchAttempt, type TimelineRunEligibilityRecord } from "../electron/fullFetchEligibility";
import { FullFetchRunRegistry, type FullFetchRunIdentity, type FullFetchSaveEvidence } from "../electron/fullFetchRunRegistry";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (name: string, fn: () => void) => { fn(); checks += 1; console.log(`ok ${checks} - ${name}`); };

const timeline: TimelineRunEligibilityRecord = {
  timelineRunId: "timeline-synthetic", status: "completed", selectedUser: "sample.user",
  dateRange: { start: "2026-01-01", end: "2026-01-02" }, serverIdentity: "synthetic-server",
  roundExecutionMode: "force_all_rounds", mergeStrategy: "union", expectedRoundCount: 3,
  completedRoundCount: 3, mergedEventCount: 2, reconciliationStatus: "reconciled",
  canonicalCompleted: true, completedAt: "2026-01-02T00:00:00.000Z"
};
const eligibility = () => evaluateFullFetchEligibility({ selectedTimelineRunId: timeline.timelineRunId, queueTimelineRunId: timeline.timelineRunId, timelineRun: timeline });
function runningAttempt(attemptId: string, runId: string, stagingId: string): FullFetchAttempt {
  return {
    ...createFullFetchAttempt({ selectedTimelineRunId: timeline.timelineRunId, queueTimelineRunId: timeline.timelineRunId, selectedIssueKeys: ["SYN-1", "SYN-2"], eligibility: eligibility(), now: "2026-01-02T00:00:00.000Z", attemptId }),
    fullFetchRunCreated: true, fullFetchRunId: runId, stagingId, attemptStatus: "running", stagingAvailable: true
  };
}
function identity(attempt: FullFetchAttempt): FullFetchRunIdentity {
  return { attemptId: attempt.attemptId, selectedTimelineRunId: attempt.selectedTimelineRunId, fullFetchRunId: attempt.fullFetchRunId, stagingId: attempt.stagingId };
}
function evidence(operationId: string): FullFetchSaveEvidence {
  return {
    operationId, savedAt: "2026-01-02T01:01:00.000Z", filePath: `C:/synthetic/${operationId}.json`, folderPath: "C:/synthetic",
    fileSize: 128, sha256: `sha-${operationId}`, fileSave: { status: "completed", operationId },
    databaseWrite: { ok: true, status: "completed", operationId, readbackVerified: true, foreignKeyCheck: "passed", summary: { issuesCreated: 2, eventsCreated: 4 } }
  };
}
function complete(registry: FullFetchRunRegistry, attempt: FullFetchAttempt, dir: string) {
  registry.attachRun(attempt, dir);
  return registry.publishTerminal({ identity: identity(attempt), status: "completed", countReconciliationPassed: true, issueKeyReconciliation: "MATCH", result: { runId: attempt.fullFetchRunId, document: { runId: attempt.fullFetchRunId }, savedPath: "", generatedAutomatically: false }, completedAt: "2026-01-02T01:00:00.000Z" });
}

check("eligible Timeline passes", () => assert.equal(eligibility().eligible, true));
check("queue mismatch is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: timeline.timelineRunId, queueTimelineRunId: "other", timelineRun: timeline }).eligible, false));
check("partial Timeline is blocked", () => assert.equal(evaluateFullFetchEligibility({ selectedTimelineRunId: timeline.timelineRunId, queueTimelineRunId: timeline.timelineRunId, timelineRun: { ...timeline, status: "partial", canonicalCompleted: false } }).eligible, false));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0257-"));
try {
  const registry = new FullFetchRunRegistry();
  const dirA = fs.mkdirSync(path.join(tempRoot, "run-a"), { recursive: true });
  const attemptA = runningAttempt("attempt-a", "run-a", "staging-a");
  const completedA = complete(registry, attemptA, dirA);
  const tupleA = identity(attemptA);
  check("attempt registered only when attached", () => assert.equal(registry.getAttempt("attempt-a")?.attemptId, "attempt-a"));
  check("run records exact attemptId", () => assert.equal(completedA.attemptId, tupleA.attemptId));
  check("run records exact timelineRunId", () => assert.equal(completedA.selectedTimelineRunId, tupleA.selectedTimelineRunId));
  check("run records exact fullFetchRunId", () => assert.equal(completedA.fullFetchRunId, tupleA.fullFetchRunId));
  check("run records exact stagingId", () => assert.equal(completedA.stagingId, tupleA.stagingId));
  check("terminal status is completed", () => assert.equal(completedA.attempt.attemptStatus, "completed"));
  check("terminal staging remains available", () => assert.equal(completedA.attempt.stagingAvailable, true));
  check("count reconciliation passed", () => assert.equal(completedA.attempt.countReconciliation, "PASSED"));
  check("issue-key reconciliation matched", () => assert.equal(completedA.attempt.issueKeyReconciliation, "MATCH"));
  check("completed result is save eligible", () => assert.equal(completedA.attempt.saveEligible, true));
  check("initial save request is ready", () => assert.equal(registry.resolveSaveRequest(tupleA).status, "ready"));
  check("identity lookup is stable", () => assert.deepEqual(identity(registry.resolve(tupleA).attempt), tupleA));
  check("attempt lookup resolves same run", () => assert.equal(registry.resolveByAttemptId(tupleA.attemptId)?.fullFetchRunId, tupleA.fullFetchRunId));
  check("result belongs to same run", () => assert.equal(completedA.result?.runId, tupleA.fullFetchRunId));
  check("unsaved record has no evidence", () => assert.equal(completedA.saveEvidence, null));

  const badEvidence = evidence("bad-save");
  badEvidence.databaseWrite = { ok: false, status: "failed", readbackVerified: false, foreignKeyCheck: "failed" };
  check("failed database commit cannot mark saved", () => assert.throws(() => registry.markSaved(tupleA, badEvidence), /SAVE_NOT_COMMITTED/));
  check("failed save leaves attempt completed", () => assert.equal(registry.resolve(tupleA).attempt.attemptStatus, "completed"));
  check("failed save leaves evidence empty", () => assert.equal(registry.resolve(tupleA).saveEvidence, null));
  const saveA = evidence("save-a");
  const savedA = registry.markSaved(tupleA, saveA);
  check("committed save marks attempt saved", () => assert.equal(savedA.attempt.attemptStatus, "saved"));
  check("saved result keeps tuple", () => assert.equal(savedA.fullFetchRunId, tupleA.fullFetchRunId));
  check("saved result records original operation", () => assert.equal(savedA.saveEvidence?.operationId, "save-a"));
  check("saved result records database evidence", () => assert.equal(savedA.saveEvidence?.databaseWrite.status, "completed"));
  const repeated = registry.resolveSaveRequest(tupleA);
  check("second save is already_saved", () => assert.equal(repeated.status, "already_saved"));
  check("second save returns original operation", () => assert.equal(repeated.status === "already_saved" ? repeated.evidence.operationId : "", "save-a"));
  check("second save returns original file path", () => assert.equal(repeated.status === "already_saved" ? repeated.evidence.filePath : "", saveA.filePath));
  check("second save returns original database evidence", () => assert.equal(repeated.status === "already_saved" ? repeated.evidence.databaseWrite.operationId : "", "save-a"));
  let jsonWrites = 0; let databaseTransactions = 0;
  const saveIfReady = () => { const resolution = registry.resolveSaveRequest(tupleA); if (resolution.status === "ready") { jsonWrites += 1; databaseTransactions += 1; } return resolution.status; };
  check("already-saved path starts no JSON write", () => assert.equal(saveIfReady(), "already_saved"));
  check("JSON write count remains zero", () => assert.equal(jsonWrites, 0));
  check("database transaction count remains zero", () => assert.equal(databaseTransactions, 0));
  check("repeat save preserves saved status", () => assert.equal(registry.resolve(tupleA).attempt.attemptStatus, "saved"));

  check("attempt mismatch fails closed", () => assert.throws(() => registry.resolve({ ...tupleA, attemptId: "attempt-b" }), /IDENTITY_MISMATCH/));
  check("timeline mismatch fails closed", () => assert.throws(() => registry.resolve({ ...tupleA, selectedTimelineRunId: "timeline-b" }), /IDENTITY_MISMATCH/));
  check("staging mismatch fails closed", () => assert.throws(() => registry.resolve({ ...tupleA, stagingId: "staging-b" }), /IDENTITY_MISMATCH/));
  check("unknown run fails closed", () => assert.throws(() => registry.resolve({ ...tupleA, fullFetchRunId: "run-b" }), /NOT_AVAILABLE/));

  const partialRegistry = new FullFetchRunRegistry(); const partialDir = fs.mkdirSync(path.join(tempRoot, "partial"), { recursive: true }); const partial = runningAttempt("attempt-partial", "run-partial", "staging-partial"); partialRegistry.attachRun(partial, partialDir); partialRegistry.publishTerminal({ identity: identity(partial), status: "partial", countReconciliationPassed: true, issueKeyReconciliation: "MATCH", result: { runId: partial.fullFetchRunId, document: {}, savedPath: "", generatedAutomatically: false }, completedAt: "2026-01-02T02:00:00.000Z" });
  check("partial result cannot save", () => assert.throws(() => partialRegistry.resolveSaveRequest(identity(partial)), /NOT_SAVE_ELIGIBLE/));
  const failedRegistry = new FullFetchRunRegistry(); const failedDir = fs.mkdirSync(path.join(tempRoot, "failed"), { recursive: true }); const failed = runningAttempt("attempt-failed", "run-failed", "staging-failed"); failedRegistry.attachRun(failed, failedDir); failedRegistry.publishTerminal({ identity: identity(failed), status: "failed", countReconciliationPassed: false, issueKeyReconciliation: "MISMATCH", result: null, completedAt: "2026-01-02T03:00:00.000Z" });
  check("failed result cannot save", () => assert.throws(() => failedRegistry.resolveSaveRequest(identity(failed)), /NOT_SAVE_ELIGIBLE/));
  const cancelledRegistry = new FullFetchRunRegistry(); const cancelledDir = fs.mkdirSync(path.join(tempRoot, "cancelled"), { recursive: true }); const cancelled = runningAttempt("attempt-cancelled", "run-cancelled", "staging-cancelled"); cancelledRegistry.attachRun(cancelled, cancelledDir); cancelledRegistry.publishTerminal({ identity: identity(cancelled), status: "cancelled", countReconciliationPassed: false, issueKeyReconciliation: "MISMATCH", result: null, completedAt: "2026-01-02T04:00:00.000Z" });
  check("cancelled result cannot save", () => assert.throws(() => cancelledRegistry.resolveSaveRequest(identity(cancelled)), /NOT_SAVE_ELIGIBLE/));
  fs.rmSync(dirA, { recursive: true, force: true });
  check("missing staging is stale", () => assert.throws(() => registry.resolveSaveRequest(tupleA), /RESULT_STALE/));

  const main = read("electron/main.ts");
  const preflight = main.slice(main.indexOf('ipcMain.handle("user-analysis:full-fetch-preflight"'), main.indexOf('ipcMain.handle("user-analysis:full-fetch"'));
  const run = main.slice(main.indexOf('ipcMain.handle("user-analysis:full-fetch"'), main.indexOf('ipcMain.handle("user-analysis:get-active-full-fetch-run"'));
  const save = main.slice(main.indexOf('ipcMain.handle("user-analysis:save-full-fetch-result"'), main.indexOf('ipcMain.handle("user-analysis:open-export-folder"'));
  const debug = main.slice(main.indexOf('ipcMain.handle("debug-log:save-bundle"'));
  const renderer = read("src/routes/AnalysisPage.tsx");
  check("preflight returns no attempt", () => assert.match(preflight, /attempt:\s*null/));
  check("preflight does not create attempt", () => assert.doesNotMatch(preflight, /createFullFetchAttempt|registerAttempt/));
  check("run gates eligibility before attempt creation", () => assert.ok(run.indexOf("if (!eligibility.eligible)") < run.indexOf("createFullFetchAttempt")));
  check("run gates queue before attempt creation", () => assert.ok(run.indexOf("if (!queuePreflight.ok)") < run.indexOf("createFullFetchAttempt")));
  check("run returns terminal identity", () => assert.match(run, /identity:\s*\{\s*attemptId:/));
  check("Save resolves exact save request", () => assert.match(save, /resolveSaveRequest\(identity\)/));
  check("already saved is returned before JSON writer", () => assert.ok(save.indexOf('status === "already_saved"') < save.indexOf("saveFullFetchResult(")));
  check("already saved reason is explicit", () => assert.match(save, /reasonCode:\s*"ALREADY_SAVED"/));
  check("saved transition follows database commit gate", () => assert.ok(save.indexOf("databaseSaveCommitted") < save.indexOf("markSaved(identity")));
  check("Debug database evidence is run scoped", () => assert.match(debug, /currentRunRecord\?\.saveEvidence\?\.databaseWrite/));
  check("renderer preserves completed identity across non-eligible attempts", () => assert.match(renderer, /const completedIdentity = terminalSaveEligible \? terminalIdentity : userAnalysis\.completedFullFetchIdentity/));
  check("renderer Save uses completed identity", () => assert.match(renderer, /const completedIdentity = userAnalysis\.completedFullFetchIdentity;[\s\S]*saveFullFetchResult/));
  check("renderer Debug uses completed identity", () => assert.match(renderer, /fullFetchIdentity:\s*userAnalysis\.completedFullFetchIdentity/));
  check("schema remains v3", () => assert.match(read("electron/currentStateArchive.ts"), /CURRENT_STATE_SCHEMA_VERSION = 3/));
  check("event identity remains v3", () => assert.match(read("electron/activityEvents.ts"), /EVENT_IDENTITY_POLICY_VERSION = 3/));
} finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }

assert.equal(checks, 56);
console.log("v0.2.57 focused checks passed: 56/56");