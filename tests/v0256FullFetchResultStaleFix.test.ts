import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFullFetchAttempt, evaluateFullFetchEligibility, type FullFetchAttempt, type TimelineRunEligibilityRecord } from "../electron/fullFetchEligibility";
import { FullFetchRunRegistry, type FullFetchRunIdentity } from "../electron/fullFetchRunRegistry";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks += 1;
  console.log("ok " + checks + " - " + name);
};

const timeline: TimelineRunEligibilityRecord = {
  timelineRunId: "timeline-current",
  status: "completed",
  selectedUser: "sample.user",
  dateRange: { start: "2026-01-01", end: "2026-01-02" },
  serverIdentity: "synthetic-server",
  roundExecutionMode: "force_all_rounds",
  mergeStrategy: "union",
  expectedRoundCount: 3,
  completedRoundCount: 3,
  mergedEventCount: 2,
  reconciliationStatus: "reconciled",
  canonicalCompleted: true,
  completedAt: "2026-01-02T00:00:00.000Z"
};

function runningAttempt(attemptId: string, fullFetchRunId: string, stagingId: string): FullFetchAttempt {
  const eligibility = evaluateFullFetchEligibility({
    selectedTimelineRunId: timeline.timelineRunId,
    queueTimelineRunId: timeline.timelineRunId,
    timelineRun: timeline
  });
  return {
    ...createFullFetchAttempt({
      selectedTimelineRunId: timeline.timelineRunId,
      queueTimelineRunId: timeline.timelineRunId,
      selectedIssueKeys: ["SYN-1", "SYN-2"],
      eligibility,
      now: "2026-01-02T00:00:00.000Z",
      attemptId
    }),
    fullFetchRunCreated: true,
    fullFetchRunId,
    stagingId,
    attemptStatus: "running",
    stagingAvailable: true
  };
}

function identity(attempt: FullFetchAttempt): FullFetchRunIdentity {
  return {
    attemptId: attempt.attemptId,
    selectedTimelineRunId: attempt.selectedTimelineRunId,
    fullFetchRunId: attempt.fullFetchRunId,
    stagingId: attempt.stagingId
  };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0256-"));
try {
  const registry = new FullFetchRunRegistry();
  const currentDir = fs.mkdirSync(path.join(tempRoot, "current"), { recursive: true });
  const current = runningAttempt("attempt-current", "run-current", "staging-current");
  registry.attachRun(current, currentDir);
  const completed = registry.publishTerminal({
    identity: identity(current),
    status: "completed",
    countReconciliationPassed: true,
    issueKeyReconciliation: "MATCH",
    result: { runId: current.fullFetchRunId, document: { runId: current.fullFetchRunId }, savedPath: "", generatedAutomatically: false },
    completedAt: "2026-01-02T01:00:00.000Z"
  });

  check("completed attempt leaves running state", () => assert.equal(completed.attempt.attemptStatus, "completed"));
  check("completed attempt exposes persisted staging", () => assert.equal(completed.attempt.stagingAvailable, true));
  check("completed attempt stores exact staging reference", () => assert.equal(completed.attempt.stagingReference?.stagingId, "staging-current"));
  check("completed attempt stores passed count reconciliation", () => assert.equal(completed.attempt.countReconciliation, "PASSED"));
  check("completed attempt stores matching issue reconciliation", () => assert.equal(completed.attempt.issueKeyReconciliation, "MATCH"));
  check("completed reconciled run is save eligible", () => assert.equal(completed.attempt.saveEligible, true));
  check("save resolves exact current identity", () => assert.equal(registry.resolveForSave(identity(current)).fullFetchRunId, "run-current"));

  const historyDir = fs.mkdirSync(path.join(tempRoot, "history-newer-mtime"), { recursive: true });
  fs.utimesSync(historyDir, new Date("2035-01-01"), new Date("2035-01-01"));
  const historical = runningAttempt("attempt-history", "run-history", "staging-history");
  registry.attachRun(historical, historyDir);
  check("newer historical staging mtime cannot replace current run", () => assert.equal(registry.resolveForSave(identity(current)).stagingDir, currentDir));

  check("run identity mismatch fails closed", () => assert.throws(
    () => registry.resolveForSave({ ...identity(current), stagingId: "staging-history" }),
    /FULL_FETCH_IDENTITY_MISMATCH/
  ));

  const savedOnce = registry.markSaved(identity(current), path.join(tempRoot, "result.json"), "2026-01-02T01:01:00.000Z");
  const savedTwice = registry.markSaved(identity(current), path.join(tempRoot, "result-2.json"), "2026-01-02T01:02:00.000Z");
  check("first save records saved state", () => assert.equal(savedOnce.attempt.attemptStatus, "saved"));
  check("repeated save remains eligible for database dedupe path", () => assert.equal(savedTwice.attempt.saveEligible, true));
  check("repeated save preserves the same run identity", () => assert.equal(savedTwice.fullFetchRunId, "run-current"));

  const partialRegistry = new FullFetchRunRegistry();
  const partialDir = fs.mkdirSync(path.join(tempRoot, "partial"), { recursive: true });
  const partial = runningAttempt("attempt-partial", "run-partial", "staging-partial");
  partialRegistry.attachRun(partial, partialDir);
  partialRegistry.publishTerminal({ identity: identity(partial), status: "partial", countReconciliationPassed: true, issueKeyReconciliation: "MATCH", result: { runId: partial.fullFetchRunId, document: {}, savedPath: "", generatedAutomatically: false }, completedAt: "2026-01-02T02:00:00.000Z" });
  check("partial result is excluded from save", () => assert.throws(() => partialRegistry.resolveForSave(identity(partial)), /NOT_SAVE_ELIGIBLE/));

  const failedRegistry = new FullFetchRunRegistry();
  const failedDir = fs.mkdirSync(path.join(tempRoot, "failed"), { recursive: true });
  const failed = runningAttempt("attempt-failed", "run-failed", "staging-failed");
  failedRegistry.attachRun(failed, failedDir);
  failedRegistry.publishTerminal({ identity: identity(failed), status: "failed", countReconciliationPassed: false, issueKeyReconciliation: "MISMATCH", result: null, completedAt: "2026-01-02T03:00:00.000Z" });
  check("failed result is excluded from save", () => assert.throws(() => failedRegistry.resolveForSave(identity(failed)), /NOT_SAVE_ELIGIBLE/));

  fs.rmSync(currentDir, { recursive: true, force: true });
  check("missing matching completed staging is the stale condition", () => assert.throws(() => registry.resolveForSave(identity(current)), /FULL_FETCH_RESULT_STALE/));

  const main = read("electron/main.ts");
  const saveHandler = main.slice(main.indexOf('ipcMain.handle("user-analysis:save-full-fetch-result"'), main.indexOf('ipcMain.handle("user-analysis:open-export-folder"'));
  const debugHandler = main.slice(main.indexOf('ipcMain.handle("debug-log:save-bundle"'));
  check("Save IPC resolves registry identity", () => assert.match(saveHandler, /fullFetchRunRegistry\.resolveForSave\(identity\)/));
  check("Save IPC loads the registry staging directory", () => assert.match(saveHandler, /loadStagingRun\(runRecord\.stagingDir\)/));
  check("Save IPC does not depend on global latest staging", () => assert.doesNotMatch(saveHandler, /latestFullFetchStaging/));
  check("Debug Folder resolves current run registry identity", () => assert.match(debugHandler, /fullFetchRunRegistry\.resolve/));
  check("Debug Folder staging comes from current run record", () => assert.match(debugHandler, /loadStagingRun\(currentRunRecord\.stagingDir\)/));
  check("renderer Save sends complete identity", () => assert.match(read("src/routes/AnalysisPage.tsx"), /saveFullFetchResult\?\.\(\{ attemptId:[\s\S]*selectedTimelineRunId:[\s\S]*fullFetchRunId:[\s\S]*stagingId:/));
  check("preload Save contract requires complete identity", () => assert.match(read("electron/preload.ts"), /saveFullFetchResult: \(payload: \{ attemptId: string; selectedTimelineRunId: string; fullFetchRunId: string; stagingId: string \}\)/));
  check("SQLite schema remains v3", () => assert.match(read("electron/currentStateArchive.ts"), /CURRENT_STATE_SCHEMA_VERSION = 3/));
  check("event identity remains v3", () => assert.match(read("electron/activityEvents.ts"), /EVENT_IDENTITY_POLICY_VERSION = 3/));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

assert.equal(checks, 24);
console.log("v0.2.56 focused checks passed: 24/24");