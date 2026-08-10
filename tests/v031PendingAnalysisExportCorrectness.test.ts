import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PendingAnalysisExportCoordinator } from "../electron/pendingAnalysisExportCoordinator.js";
import { createPendingAnalysisExportDiagnostics, pendingAnalysisPublicReason } from "../electron/pendingAnalysisExportDiagnostics.js";
import { collectDebugFolderSources } from "../electron/debugFolderCollector.js";
import { pendingAnalysisProgress, pendingAnalysisRecord } from "../electron/pendingAnalysisExport.js";
import { createPersistentDiagnostics } from "../electron/persistentDiagnostics.js";
import {
  PendingAnalysisExportError,
  PENDING_ANALYSIS_CONTRACT_STATUS,
  PENDING_ANALYSIS_SCHEMA_VERSION,
  assertPendingAnalysisRecordSafe,
  scanPendingAnalysisValue,
  type PendingAnalysisProgress,
  type PendingAnalysisProvenance
} from "../shared/pendingAnalysisContract.js";
import {
  claimPendingAnalysisRendererStart,
  releasePendingAnalysisRendererStart,
  shouldAcceptPendingAnalysisProgress
} from "../src/components/pendingAnalysisExportState.js";

const sha = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v031-correctness-"));
const runtimeIdentity = {
  appRoot: path.join(root, "APP_ROOT"),
  databasePath: path.join(root, "APP_ROOT", "database", "synthetic.sqlite"),
  executablePath: path.join(root, "program", "JiraActivityAnalyzer.exe"),
  userDataPath: path.join(root, "profile", "userData"),
  tempPath: path.join(root, "temp"),
  stagingPath: path.join(root, "APP_ROOT", "staging"),
  profilePath: path.join(root, "profile"),
  credentialValues: ["synthetic-real-env-material"]
};

function expectIntegrity(reason: string, pathValue: string, provenance: PendingAnalysisProvenance | undefined, jsonPath: string) {
  assert.throws(() => scanPendingAnalysisValue(pathValue, provenance, jsonPath, runtimeIdentity), (error: unknown) =>
    error instanceof PendingAnalysisExportError
    && error.code === "EXPORT_INTEGRITY_FAILED"
    && error.integrityReason === reason
    && error.offendingJsonPath === jsonPath
    && !error.message.includes(pathValue));
}

function progress(exportId: string, status: PendingAnalysisProgress["status"] = "filtering"): PendingAnalysisProgress {
  return {
    exportId, status, stage: status === "idle" ? "preparing" : status, sourceView: "ISSUE_ACTIVITY_EVENTS",
    totalRecords: 10, processedRecords: 0, serializedRecords: 0, writtenRecords: 0,
    filteredCount: 10, exportedCount: 0, percentage: 0, elapsedMs: 0, message: "synthetic"
  };
}

async function run() {
  assert.equal(PENDING_ANALYSIS_SCHEMA_VERSION, "0.3.3-draft.1");
  assert.equal(PENDING_ANALYSIS_CONTRACT_STATUS, "review-draft");
  const beforeRaw = JSON.stringify({ windows: "C:\\Jira\\evidence.txt", slash: "C:/Jira/evidence.txt", unc: "\\\\server\\share\\evidence.txt" });
  const afterRaw = JSON.stringify({ posix: "/var/jira/evidence.txt", relative: "../jira/evidence.txt" });
  const diffHunks = [{
    id: "event-v031:hunk:1:1:1", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
    lines: [
      { kind: "delete" as const, oldLineNumber: 1, newLineNumber: null, text: "Changed C:\\Jira\\diff.txt" },
      { kind: "insert" as const, oldLineNumber: null, newLineNumber: 1, text: "Changed /var/jira/diff.txt" }
    ]
  }];
  const record = pendingAnalysisRecord({
    eventId: "event-v031", issueId: "100", issueKey: "SYNTH-31", projectKey: "SYNTH", eventTime: "2026-08-07T00:00:00.000Z",
    eventType: "field_changed", sourceProvenance: "jira_changelog", sourceRecordId: "history-31:0",
    jiraNativeSourceId: "history-31", identityKeyType: "jira_native", fieldId: "description", fieldName: "Description",
    before: beforeRaw, after: afterRaw, beforeComplete: 1, afterComplete: 1, diffStatus: "changed", addedCount: 1, deletedCount: 1,
    descriptionDiff: {
      status: "changed", addedLines: 1, deletedLines: 1,
      diffInputBeforeSha256: sha(beforeRaw), diffInputAfterSha256: sha(afterRaw), diagnosticsCode: null, hunks: diffHunks
    },
    userId: "actor-31", displayName: "Synthetic User", parseStatus: "success"
  }, { databaseId: "synthetic-db", jiraServerFingerprint: "synthetic-server" }, runtimeIdentity);
  assert.equal(record.reference.beforeSha256, sha(beforeRaw));
  assert.equal(record.reference.afterSha256, sha(afterRaw));
  assert.equal(record.reference.activityEventId, "event-v031");
  assert.deepEqual(record.diff.diffHunks, diffHunks);
  assert.equal(record.diff.diffText, null);
  assert.equal("analysisContent" in record, false);
  assert.equal(JSON.stringify(record).includes(beforeRaw), false);
  assert.equal(JSON.stringify(record).includes(afterRaw), false);
  const allowed = assertPendingAnalysisRecordSafe(record, runtimeIdentity);
  assert.ok(allowed.some((decision) => decision.reason === "EVIDENCE_PATH_TEXT_ALLOWED" && decision.jsonPath.endsWith(".text")));

  for (const value of [
    runtimeIdentity.appRoot + "/exports/file.json", runtimeIdentity.databasePath, runtimeIdentity.userDataPath,
    runtimeIdentity.tempPath, runtimeIdentity.executablePath, runtimeIdentity.stagingPath, runtimeIdentity.profilePath,
    "Z:\\unknown-host\\runtime\\metadata.json"
  ]) expectIntegrity("RUNTIME_PATH_IN_GENERATED_METADATA", value, "RUNTIME_GENERATED_METADATA", "$.generated.path");
  expectIntegrity("UNKNOWN_FIELD_PROVENANCE", "ordinary", undefined, "$.unknown");
  for (const provenance of ["SOURCE_EVIDENCE", "DERIVED_FROM_EVIDENCE", "RUNTIME_GENERATED_METADATA"] as const) {
    for (const secret of ["Authorization: Bearer abcdef123456", "cookie=session-value", "password=synthetic-value", "synthetic-real-env-material"]) {
      expectIntegrity("CREDENTIAL_PATTERN_DETECTED", secret, provenance, "$.value");
    }
  }

  const zero = pendingAnalysisProgress({ exportId: "zero", status: "filtering", sourceView: "USER_ALL_ACTIVITY_EVENTS", totalRecords: 369, processedRecords: 0, elapsedMs: 1, message: "filtering" });
  const finalizing = pendingAnalysisProgress({ exportId: "final", status: "finalizing", sourceView: "USER_ALL_ACTIVITY_EVENTS", totalRecords: 369, processedRecords: 500, serializedRecords: 500, writtenRecords: 500, elapsedMs: 2, message: "finalizing" });
  const completed = pendingAnalysisProgress({ exportId: "done", status: "completed", sourceView: "USER_ALL_ACTIVITY_EVENTS", totalRecords: 369, processedRecords: 369, elapsedMs: 3, message: "done" });
  assert.deepEqual([zero.processedRecords, zero.totalRecords, zero.percentage], [0, 369, 0]);
  assert.deepEqual([finalizing.processedRecords, finalizing.serializedRecords, finalizing.writtenRecords, finalizing.percentage], [369, 369, 369, 99]);
  assert.equal(completed.percentage, 100);

  releasePendingAnalysisRendererStart();
  assert.equal(claimPendingAnalysisRendererStart(), true);
  assert.equal(claimPendingAnalysisRendererStart(), false);
  releasePendingAnalysisRendererStart();
  assert.equal(shouldAcceptPendingAnalysisProgress("active-run", progress("stale-run")), false);
  assert.equal(shouldAcceptPendingAnalysisProgress("active-run", progress("active-run")), true);

  const logsDir = path.join(root, "logs");
  const persistent = createPersistentDiagnostics({
    logsDir, sessionId: "synthetic-session", appRoot: runtimeIdentity.appRoot,
    build: { version: "0.3.1", buildTime: "2026/08/07 15:00:00", gitCommit: "synthetic-source", gitBranch: "synthetic-branch" },
    sanitizeText: (value) => value, retentionSessions: 2
  });
  const lifecycle = createPendingAnalysisExportDiagnostics((event, details) => persistent.writeRestricted("main", event, details), 1_000);
  const diagnosticBase = {
    runId: "run-v031", sourceView: "USER_ALL_ACTIVITY_EVENTS" as const, filterSnapshotHash: "a".repeat(64),
    totalRecords: 369, processedRecords: 0, serializedRecords: 0, writtenRecords: 0,
    stage: "preparing" as const, elapsedMs: 0
  };
  lifecycle.started(diagnosticBase);
  assert.equal(lifecycle.progress({ ...diagnosticBase, stage: "filtering", elapsedMs: 0 }), true);
  assert.equal(lifecycle.progress({ ...diagnosticBase, stage: "filtering", elapsedMs: 100 }), false);
  assert.equal(lifecycle.progress({ ...diagnosticBase, stage: "filtering", elapsedMs: 1_100 }), true);
  assert.equal(lifecycle.progress({ ...diagnosticBase, stage: "writing", elapsedMs: 1_150, processedRecords: 100, serializedRecords: 100, writtenRecords: 100 }), true);
  lifecycle.completed({ ...diagnosticBase, stage: "completed", elapsedMs: 2_000, processedRecords: 369, serializedRecords: 369, writtenRecords: 369, outputFileName: "pending-analysis_synthetic.json" });
  lifecycle.failed({ ...diagnosticBase, stage: "failed", elapsedMs: 2_100, publicReason: pendingAnalysisPublicReason("EXPORT_INTEGRITY_FAILED"), internalReason: "EXPORT_INTEGRITY_FAILED", integrityReason: "RUNTIME_PATH_IN_GENERATED_METADATA", offendingJsonPath: "$.generated.path" });
  lifecycle.cancelled({ ...diagnosticBase, stage: "cancelled", elapsedMs: 2_200, publicReason: pendingAnalysisPublicReason("EXPORT_CANCELLED"), internalReason: "EXPORT_CANCELLED" });
  persistent.close();

  const debugFolder = path.join(root, "debug-folder");
  const copied = collectDebugFolderSources(debugFolder, [{ sourcePath: persistent.sessionDir, relativePath: "sessions/current" }]);
  assert.equal(copied.failed.length, 0);
  const mainRows = fs.readFileSync(path.join(debugFolder, "sessions", "current", "main.ndjson"), "utf8")
    .trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
  const pendingRows = mainRows.filter((row) => String(row.event).startsWith("pending_analysis_export_"));
  const eventNames = pendingRows.map((row) => row.event);
  for (const eventName of ["pending_analysis_export_started", "pending_analysis_export_completed", "pending_analysis_export_failed", "pending_analysis_export_cancelled"]) {
    assert.ok(eventNames.includes(eventName), eventName + " must reach Debug Folder session diagnostics");
  }
  assert.equal(eventNames.filter((event) => event === "pending_analysis_export_progress").length, 3);
  const pendingText = JSON.stringify(pendingRows);
  assert.doesNotMatch(pendingText, /synthetic-real-env-material|beforeRaw|afterRaw|diffHunks|Description|Comment/i);
  for (const runtimeRoot of Object.values(runtimeIdentity).filter((value): value is string => typeof value === "string")) {
    assert.equal(pendingText.includes(runtimeRoot), false);
  }
  const failedRow = pendingRows.find((row) => row.event === "pending_analysis_export_failed") as Record<string, unknown>;
  const failedDetails = failedRow.details as Record<string, unknown>;
  assert.equal(failedDetails.offendingJsonPath, "$.generated.path");
  assert.equal(failedDetails.internalReason, "EXPORT_INTEGRITY_FAILED");

  const workerPath = path.join(root, "coordinator-worker.cjs");
  fs.writeFileSync(workerPath, [
    "const { parentPort } = require('node:worker_threads');",
    "parentPort.on('message', (message) => {",
    "  if (message.type === 'cancel') parentPort.postMessage({ type: 'failed', error: { code: 'EXPORT_CANCELLED', message: 'cancelled' } });",
    "});"
  ].join("\n"), "utf8");
  const coordinator = new PendingAnalysisExportCoordinator(workerPath);
  const coordinatorInput = {
    exportId: "coordinator-run", sourceView: "ISSUE_ACTIVITY_EVENTS" as const, query: {}, issueKey: "SYNTH-31",
    expectedFilteredCount: 10, expectedDatabaseIdentity: "", databasePath: path.join(root, "synthetic.sqlite"),
    appRoot: runtimeIdentity.appRoot, appVersion: "0.3.4"
  };
  const firstRun = coordinator.start(coordinatorInput, () => undefined);
  assert.throws(() => coordinator.start({ ...coordinatorInput, exportId: "duplicate-run" }, () => undefined),
    (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === "EXPORT_ALREADY_RUNNING");
  assert.equal(coordinator.cancel("coordinator-run"), true);
  await assert.rejects(firstRun, (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === "EXPORT_CANCELLED");
  assert.deepEqual({ status: coordinator.current()?.status, processed: coordinator.current()?.processedRecords, percentage: coordinator.current()?.percentage },
    { status: "cancelled", processed: 0, percentage: 0 });

  const panelText = fs.readFileSync(path.resolve("src/components/PendingAnalysisExportPanel.tsx"), "utf8");
  assert.match(panelText, /claimPendingAnalysisRendererStart/);
  assert.match(panelText, /!active \? <button className="btn btn-primary"/);
  assert.match(panelText, /run\.processedRecords\.toLocaleString\(\).*run\.totalRecords\.toLocaleString/);
  for (const viewer of ["src/routes/IssueViewerPage.tsx", "src/routes/UserViewerPage.tsx"]) {
    assert.match(fs.readFileSync(path.resolve(viewer), "utf8"), /PendingAnalysisExportPanel/);
  }

  fs.rmSync(root, { recursive: true, force: true });
  console.log("v0.3.1 pending-analysis correctness tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
