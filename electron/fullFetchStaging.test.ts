import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBackedWriteError } from "./fileBackedJson.js";
import { resolveFullFetchStagingRoot } from "./fullFetchStagingPath.js";
import { buildCurrentIssueSnapshot, normalizeCurrentIssueFields } from "./normalizedCurrentFields.js";
import {
  cleanupExpiredStaging,
  completeTarget,
  createStagingRun,
  deleteFailedStaging,
  exportStaging,
  failStagingRun,
  finalizeStagingRun,
  isStagingMutationLocked,
  listStagingRuns,
  loadStagingRun,
  previewStaging,
  recoverStaleStaging,
  setStagingStatus,
  stagingDebugIndex,
  stagingPaths,
  startTarget
} from "./fullFetchStaging.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0230-staging-"));
const stagingRoot = path.join(root, "full-fetch-staging");
const exportsDir = path.join(root, "exports");

function envelope(issueKey: string, description = "safe fixture") {
  return {
    issue: {
      id: issueKey.replace(/\D/g, "") || "1",
      key: issueKey,
      self: `https://jira.example.invalid/rest/api/2/issue/${issueKey}`,
      fields: {
        summary: description,
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        status: { name: "In Progress" },
        labels: ["full-fetch", "v0.2.30"],
        customfield_12345: "2026-07-01",
        duedate: "2026-07-31",
        created: "2026-07-01T08:00:00.000+0800",
        updated: "2026-07-22T08:00:00.000+0800"
      },
      names: { customfield_12345: "Start Date" },
      schema: { customfield_12345: { type: "date", custom: "com.atlassian.jira.plugin.system.customfieldtypes:datepicker" } },
      renderedFields: {}
    },
    changelogHistories: [{ id: "1", items: [{ field: "status", fromString: "Open", toString: "In Progress" }] }],
    comments: [{ id: "1", body: description }],
    worklogs: [],
    worklogCompleteness: { status: "complete", reportedTotal: 0, fetchedCount: 0, uniqueWorklogCount: 0, duplicateCount: 0, paginationComplete: true, permissionRestricted: false, unsupported: false, fetchError: "", parseErrorCount: 0 },
    attachments: [{ id: "1", filename: "fixture.txt", size: 42 }],
    parsedUsers: ["fixture.user"],
    evidenceEvents: [{ evidenceId: "fixture", issueKey }],
    issueLinks: [],
    remoteLinks: [],
    endpointMetadata: [
      { method: "GET", endpoint: `/issue/${issueKey}`, status: 200, attempts: 1, fetchedAt: "2026-07-22T00:00:00.000Z" },
      { method: "GET", endpoint: `/issue/${issueKey}/changelog`, status: 200, attempts: 1, fetchedAt: "2026-07-22T00:00:00.000Z" },
      { method: "GET", endpoint: `/issue/${issueKey}/comment`, status: 200, attempts: 1, fetchedAt: "2026-07-22T00:00:00.000Z" },
      { method: "GET", endpoint: `/issue/${issueKey}/worklog`, status: 200, attempts: 1, fetchedAt: "2026-07-22T00:00:00.000Z" }
    ],
    requestMetadata: { apiVersion: "v2", fetchedAt: "2026-07-22T00:00:00.000Z", fetchRemoteLinks: false },
    paginationMetadata: {
      comments: { reportedTotal: 1, fetchedCount: 1, rawFetchedCount: 1, pageCount: 1, duplicateCount: 0, paginationComplete: true, complete: true },
      worklogs: { reportedTotal: 0, fetchedCount: 0, rawFetchedCount: 0, pageCount: 1, duplicateCount: 0, paginationComplete: true, complete: true },
      changelog: { reportedTotal: 1, fetchedCount: 1, rawFetchedCount: 1, pageCount: 1, duplicateCount: 0, paginationComplete: true, complete: true }
    },
    completenessMetadata: { requiredMissingSections: [] }
  };
}

try {
  assert.equal(resolveFullFetchStagingRoot({ appRoot: root }), path.join(root, "full-fetch-staging"));
  assert.equal(resolveFullFetchStagingRoot({ appRoot: root, override: path.join(root, "ignored") }), path.join(root, "full-fetch-staging"));
  assert.equal(resolveFullFetchStagingRoot({ appRoot: root, override: path.join(root, "custom"), allowDevelopmentOverride: true }), path.join(root, "custom"));

  const normalizedFixture = normalizeCurrentIssueFields(buildCurrentIssueSnapshot({
    key: "FIELD-1",
    fields: { duedate: null, customfield_date_a: "2026-07-01", customfield_date_b: "2026-07-02", customfield_text: "not a date" },
    names: { customfield_date_a: "Start Date", customfield_date_b: " start date ", customfield_text: "Start Date" },
    schema: { customfield_date_a: { type: "date" }, customfield_date_b: { type: "datetime" }, customfield_text: { type: "string" } }
  }, "2026-07-22T00:00:00.000Z"));
  assert.equal(normalizedFixture.fields.find((field) => field.key === "dueDate")?.valueStatus, "present_empty");
  assert.equal(normalizedFixture.fields.find((field) => field.key === "startDate")?.valueStatus, "field_ambiguous");
  assert.equal(normalizedFixture.fields.find((field) => field.key === "startDate")?.semanticStatus, "ambiguous");
  assert.deepEqual(normalizedFixture.fields.find((field) => field.key === "startDate")?.candidateFieldIds, ["customfield_date_a", "customfield_date_b"]);
  const unresolvedStart = normalizeCurrentIssueFields(buildCurrentIssueSnapshot({ key: "FIELD-2", fields: {}, names: {}, schema: {} }));
  assert.equal(unresolvedStart.fields.find((field) => field.key === "startDate")?.valueStatus, "field_unresolved");
  assert.equal(unresolvedStart.fields.find((field) => field.key === "startDate")?.semanticStatus, "absent");
  const unparseableStart = normalizeCurrentIssueFields(buildCurrentIssueSnapshot({ key: "FIELD-3", fields: { customfield_bad: "not-a-date" }, names: { customfield_bad: "Start Date" }, schema: { customfield_bad: { type: "date" } } }));
  assert.equal(unparseableStart.fields.find((field) => field.key === "startDate")?.semanticStatus, "unparseable");

  const complete = createStagingRun(stagingRoot, {
    runId: "run-complete",
    selectedUser: "fixture.user",
    queue: [{ key: "ABC-1" }, { key: "ABC-2" }],
    runContext: { projectScope: "ABC", dateRange: { start: "2026-07-01", end: "2026-07-22" }, selectedIssues: ["ABC-1", "ABC-2"] }
  });
  setStagingStatus(complete, "running");
  startTarget(complete, "ABC-1");
  const first = completeTarget(complete, "ABC-1", { status: "eligible", rawEnvelope: envelope("ABC-1", "x".repeat(256 * 1024)) });
  assert.equal(first.status, "eligible");
  assert.ok(first.sizeBytes > 512 * 1024, "canonical files should stream values larger than the writer chunk size");
  assert.ok(first.currentIssueSnapshotRef && fs.existsSync(path.join(complete.dir, first.currentIssueSnapshotRef.path)));
  assert.equal(first.normalizedCurrentFields.find((field) => field.key === "startDate")?.value, "2026-07-01");
  assert.equal(first.normalizedCurrentFields.find((field) => field.key === "startDate")?.valueStatus, "present_value");
  assert.equal(first.normalizedCurrentFields.find((field) => field.key === "resolution")?.valueStatus, "not_returned");
  const runPreview = previewStaging(complete);
  assert.equal(Object.prototype.hasOwnProperty.call(runPreview, "issueSummaries"), false, "normal staging preview must not expose per-Issue rows");

  startTarget(complete, "ABC-2");
  const remoteWarningEnvelope = envelope("ABC-2") as Record<string, unknown>;
  (remoteWarningEnvelope.requestMetadata as Record<string, unknown>).fetchRemoteLinks = true;
  remoteWarningEnvelope.remoteLinks = null;
  const remoteWarning = completeTarget(complete, "ABC-2", { status: "eligible", rawEnvelope: remoteWarningEnvelope, optionalEndpointStatus: { remoteLinks: { enabled: true, status: "permission_denied", archiveBlocking: false, retryable: false, warning: "Remote Links permission denied.", httpStatus: 403, errorCode: "HTTP_403", attemptCount: 1, fetchedAt: "2026-07-22T00:00:00.000Z" } }, optionalWarnings: ["Remote Links permission denied."] });
  assert.equal(remoteWarning.status, "eligible", "Remote Links failure must not block Eligible");
  assert.equal(remoteWarning.optionalEndpointStatus.remoteLinks.status, "permission_denied");
  const completeState = finalizeStagingRun(complete);
  assert.equal(completeState.status, "completed");
  assert.equal(completeState.remaining, 0);
  assert.equal(completeState.archiveEligible, 2);
  const exported = exportStaging(complete, exportsDir);
  assert.equal(exported.packageStatus, "complete");
  assert.equal(exported.safeForAutomaticImport, true);
  assert.equal(exported.verification.zipReopenVerified, true);
  assert.equal(exported.verification.hashMatchedCount, exported.verification.entryCount);
  assert.equal(isStagingMutationLocked(complete.state.stagingId), false);
  assert.ok(fs.existsSync(exported.packagePath));

  const coreIncomplete = createStagingRun(stagingRoot, { runId: "run-core-incomplete", selectedUser: "fixture.user", queue: [{ key: "CORE-1" }] });
  setStagingStatus(coreIncomplete, "running"); startTarget(coreIncomplete, "CORE-1");
  const incompleteEnvelope = envelope("CORE-1") as Record<string, unknown>;
  (incompleteEnvelope.paginationMetadata as Record<string, Record<string, unknown>>).comments.paginationComplete = false;
  const incompleteTarget = completeTarget(coreIncomplete, "CORE-1", { status: "eligible", rawEnvelope: incompleteEnvelope });
  assert.equal(incompleteTarget.status, "partial");
  assert.ok(incompleteTarget.currentIssueSnapshotRef && fs.existsSync(path.join(coreIncomplete.dir, incompleteTarget.currentIssueSnapshotRef.path)), "Raw must be retained when core validation fails");
  assert.equal(finalizeStagingRun(coreIncomplete).status, "completed_with_partial");

  const partial = createStagingRun(stagingRoot, { runId: "run-partial", selectedUser: "fixture.user", queue: [{ key: "PART-1" }] });
  setStagingStatus(partial, "running");
  startTarget(partial, "PART-1");
  completeTarget(partial, "PART-1", { status: "partial", rawEnvelope: envelope("PART-1"), missingSections: ["comments"], failedEndpoints: ["/comment"], classification: "partial" });
  assert.equal(finalizeStagingRun(partial).status, "completed_with_partial");
  assert.throws(() => exportStaging(partial, exportsDir), /Only a complete Full Fetch run/);
  assert.equal(isStagingMutationLocked(partial.state.stagingId), false);

  const largeQueue = Array.from({ length: 100 }, (_, index) => ({ key: `BIG-${index + 1}` }));
  const failed = createStagingRun(stagingRoot, { runId: "run-failed-at-20", selectedUser: "fixture.user", queue: largeQueue });
  setStagingStatus(failed, "running");
  for (let index = 0; index < 19; index += 1) {
    startTarget(failed, largeQueue[index].key);
    completeTarget(failed, largeQueue[index].key, { status: "excluded", classification: "lightweight_test_fixture" });
  }
  startTarget(failed, "BIG-20");
  const failedState = failStagingRun(failed, "BIG-20", new FileBackedWriteError("json_value_range_error", "Canonical JSON value exceeded the writer range.", new RangeError("fixture")), "full_fetch_pipeline");
  assert.equal(failedState.status, "failed");
  assert.equal(failedState.runError?.code, "json_value_range_error");
  assert.equal(failedState.runError?.stage, "canonical_write");
  assert.equal(failedState.faultingObjectKey, "BIG-20");
  assert.equal(failedState.notAttempted, 80);
  assert.equal(failed.index.targets.find((target) => target.objectKey === "BIG-20")?.status, "failed_final");
  assert.equal(isStagingMutationLocked(failed.state.stagingId), false);
  assert.throws(() => exportStaging(failed, exportsDir), /Only a complete Full Fetch run/);
  const independentRun = createStagingRun(stagingRoot, { runId: "run-after-failure", selectedUser: "fixture.user", queue: [{ key: "NEXT-1" }] });
  assert.equal(independentRun.state.status, "created");
  assert.notEqual(independentRun.state.stagingId, failed.state.stagingId);

  const stale = createStagingRun(stagingRoot, { runId: "run-stale", selectedUser: "fixture.user", queue: [{ key: "STALE-1" }, { key: "STALE-2" }] });
  setStagingStatus(stale, "running");
  startTarget(stale, "STALE-1");
  const recovered = recoverStaleStaging(stagingRoot).find((run) => run.state.stagingId === stale.state.stagingId);
  assert.equal(recovered?.state.status, "failed");
  assert.equal(recovered?.index.targets[0].status, "failed_final");
  assert.equal(recovered?.index.targets[1].status, "not_attempted_due_to_run_failure");

  const legacyRoot = path.join(root, "legacy-full-fetch-staging");
  const legacyDir = path.join(legacyRoot, "FFS-LEGACY");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, "staging-state.json"), JSON.stringify({ stagingId: "FFS-LEGACY", fullFetchRunId: "legacy-run", selectedUser: "legacy.user", createdAt: "2026-07-01T00:00:00.000Z" }), "utf8");
  fs.writeFileSync(path.join(legacyDir, "queue-checkpoint.json"), JSON.stringify({ targets: [{ objectKey: "OLD-1", status: "interrupted" }] }), "utf8");
  const legacy = loadStagingRun(legacyDir);
  assert.equal(legacy.state.status, "legacy_incomplete");
  assert.equal(legacy.state.legacyReadOnly, true);
  assert.match(legacy.state.legacyMessage, /Resume is no longer supported/);
  assert.throws(() => exportStaging(legacy, exportsDir), /read-only|Only a complete/i);

  const v0230 = createStagingRun(stagingRoot, { runId: "run-v0230-compat", selectedUser: "fixture.user", queue: [{ key: "OLD-230" }] });
  const v0230Paths = stagingPaths(v0230);
  const v0230State = JSON.parse(fs.readFileSync(v0230Paths.state, "utf8"));
  const v0230Index = JSON.parse(fs.readFileSync(v0230Paths.index, "utf8"));
  v0230State.schemaVersion = "full_fetch_staging_v2";
  v0230Index.schemaVersion = "full_fetch_run_index_v2";
  fs.writeFileSync(v0230Paths.state, JSON.stringify(v0230State), "utf8");
  fs.writeFileSync(v0230Paths.index, JSON.stringify(v0230Index), "utf8");
  const v0230StateBefore = fs.readFileSync(v0230Paths.state);
  const v0230IndexBefore = fs.readFileSync(v0230Paths.index);
  const loadedV0230 = loadStagingRun(v0230.dir);
  assert.equal(loadedV0230.state.legacyReadOnly, true);
  assert.match(loadedV0230.state.legacyMessage, /v0\.2\.30/);
  assert.deepEqual(fs.readFileSync(v0230Paths.state), v0230StateBefore);
  assert.deepEqual(fs.readFileSync(v0230Paths.index), v0230IndexBefore);
  assert.throws(() => setStagingStatus(loadedV0230, "running"), /read-only/i);

  const listed = listStagingRuns(stagingRoot, legacyRoot);
  assert.ok(listed.some((run) => run.state.stagingId === complete.state.stagingId));
  assert.ok(listed.some((run) => run.state.stagingId === "FFS-LEGACY" && run.state.legacyReadOnly));
  const debug = stagingDebugIndex(failed);
  assert.equal(debug.stagingAvailable, true);
  assert.equal(debug.status, "failed");
  assert.equal(debug.faultingIssue, "BIG-20");
  assert.ok(debug.includedFiles.includes("run-errors.json"));

  assert.throws(() => deleteFailedStaging(stagingRoot, "../escape"), /Invalid staging ID/);
  const deleted = deleteFailedStaging(stagingRoot, failed.state.stagingId);
  assert.equal(deleted.ok, true);
  assert.equal(fs.existsSync(failed.dir), false);
  assert.throws(() => deleteFailedStaging(stagingRoot, complete.state.stagingId), /Only failed, partial, or discarded/);

  const cancelled = createStagingRun(stagingRoot, { runId: "run-cancelled", selectedUser: "fixture.user", queue: [{ key: "STOP-1" }] });
  setStagingStatus(cancelled, "running");
  assert.equal(finalizeStagingRun(cancelled, true).status, "cancelled");

  const exportFailure = createStagingRun(stagingRoot, { runId: "run-export-failure", selectedUser: "fixture.user", queue: [{ key: "EXP-1" }] });
  setStagingStatus(exportFailure, "running"); startTarget(exportFailure, "EXP-1"); completeTarget(exportFailure, "EXP-1", { status: "eligible", rawEnvelope: envelope("EXP-1") }); finalizeStagingRun(exportFailure);
  const invalidOutput = path.join(root, "not-a-directory"); fs.writeFileSync(invalidOutput, "fixture", "utf8");
  assert.throws(() => exportStaging(exportFailure, invalidOutput, false, "2026-07-22T00:00:00.000Z"));
  assert.equal(exportFailure.state.safeToCleanup, false); assert.equal((exportFailure.state.exportError?.code.length ?? 0) > 0, true);
  fs.rmSync(invalidOutput);
  const retryExport = exportStaging(exportFailure, exportsDir, false, "2026-08-01T00:00:00.000Z");
  assert.equal(exportFailure.state.exportError, null); assert.equal(exportFailure.state.successfulExportAt, "2026-08-01T00:00:00.000Z");

  const retention = cleanupExpiredStaging(stagingRoot, new Date("2030-01-01T00:00:00.000Z"));
  assert.ok(retention.some((item) => item.stagingId === partial.state.stagingId && item.reason === "fetch_failure_permanent_retention"));
  assert.ok(retention.some((item) => item.stagingId === cancelled.state.stagingId && item.reason === "cancelled_retention_expired" && item.removed));
  assert.ok(retention.some((item) => item.stagingId === exportFailure.state.stagingId && item.reason === "verified_export_retention_expired" && item.removed));
  assert.ok(fs.existsSync(retryExport.packagePath), "cleanup must not delete formal Export ZIP outside staging");
  assert.equal(previewStaging(partial).stagingSizeBytes > 0, true);
  assert.ok(fs.existsSync(stagingPaths(partial).result));

  console.log("Full Fetch v0.2.33 file-backed staging tests passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
