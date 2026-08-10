import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { PROGRESSIVE_DIFF_CONFIG, queryDatabaseIssueChangelog, queryDatabaseIssueEventsProgressive, type ProgressiveCheckpoint, type ViewerProgressDto } from "../electron/databaseViewer.js";
import { DatabaseViewerCoordinator } from "../electron/databaseViewerCoordinator.js";
import { classifyViewerDiff, VIEWER_DIFF_CLASSIFIER_VERSION } from "../shared/viewerEfficiency.js";

const EVENT_COUNT = 20_000;
const LARGE_SCOPE_COUNT = 8_520;
const DESCRIPTION_COUNT = 6_338;
const workerPath = path.resolve("dist-electron/database-viewer-worker.cjs");
const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function createFixture(root: string, name: string, count = EVENT_COUNT) {
  const databasePath = path.join(root, name);
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.67-test", binding: { serverIdentity: "synthetic", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: name, now: "2026-08-06T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  let beforeUnavailable = 0;
  let unchanged = 0;
  try {
    db.exec("BEGIN");
    const object = db.prepare("INSERT INTO source_objects (id,jira_issue_id,issue_key,project_key,first_saved_at,created_at) VALUES (?,?,?,?,?,?)");
    const snapshot = db.prepare("INSERT INTO current_issue_snapshots (source_object_id,summary,status,issue_type,priority,resolution,assignee,reporter,creator,labels_json,components_json,versions_json,start_date,due_date,jira_updated_at,snapshot_json,snapshot_updated_at) VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,'[]','[]','[]',NULL,NULL,?,'{}',?)");
    for (let issue = 1; issue <= 20; issue += 1) {
      const key = issue === 1 ? "SYNTH-1" : `SYNTH-${issue}`;
      object.run(`jira:issue:${key}`, `native-${issue}`, key, `PROJECT-${issue % 4}`, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      snapshot.run(`jira:issue:${key}`, `Synthetic issue ${issue}`, issue % 2 ? "Open" : "Done", "Task", "Medium", "2026-08-06T00:00:00.000Z", "2026-08-06T00:00:00.000Z");
    }
    const event = db.prepare("INSERT INTO activity_events (id,source_object_id,event_type,event_time,actor_account_id,actor_display_name,field_id,field_name,from_value_json,to_value_json,source_record_id,event_identity_hash,event_identity_policy_version,identity_key_type,jira_native_source_id,source_provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,3,'jira_native',?,'jira_changelog',?)");
    for (let index = 0; index < count; index += 1) {
      const inLargeScope = index < Math.min(count, LARGE_SCOPE_COUNT);
      const description = inLargeScope && index < DESCRIPTION_COUNT;
      const mode = index % 5;
      let before: string | null;
      let after: string | null;
      if (description) {
        before = mode === 0 ? "null" : mode === 1 ? "same" : mode === 3 ? `old-${index}` : `before-${index}`;
        const longText = index % 997 === 0 ? "updated line\n".repeat(1_500) : `after-${index}`;
        after = mode === 1 ? "same" : mode === 3 ? "null" : longText;
        if (mode === 0) beforeUnavailable += 1;
        if (mode === 1) unchanged += 1;
      } else {
        before = null;
        after = index % 11 === 0 ? "Before unavailable - cannot calculate diff appears in a comment body" : `comment-${index}`;
      }
      const issueKey = inLargeScope ? "SYNTH-1" : `SYNTH-${index % 19 + 2}`;
      const eventType = description ? "field_changed" : "comment_updated";
      const timestamp = inLargeScope ? "2026-08-02T12:00:00.000Z" : new Date(Date.UTC(2026, 7, 3, 0, 0, index % 86_400)).toISOString();
      event.run(`event-${String(index).padStart(6, "0")}`, `jira:issue:${issueKey}`, eventType, timestamp,
        inLargeScope ? "target-user" : `user-${index % 100}`, inLargeScope ? "Target User" : `Synthetic User ${index % 100}`,
        description ? "description" : "comment", description ? "Description" : "Comment",
        before, after, `history-${index}:0`, sha(`event-${index}`), `history-${index}`, timestamp);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
  return { databasePath, beforeUnavailable, unchanged };
}

function digest(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all();
    const rows = db.prepare("SELECT id,source_object_id,event_time,field_id,from_value_json,to_value_json FROM activity_events ORDER BY id").all();
    return { schema: sha(JSON.stringify(schema)), logical: sha(JSON.stringify(rows)), count: rows.length };
  } finally { db.close(); }
}

function assertMonotonic(progress: ViewerProgressDto[]) {
  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index].scanned >= progress[index - 1].scanned);
    assert.ok(progress[index].matched >= progress[index - 1].matched);
    assert.ok(progress[index].elapsedMs >= progress[index - 1].elapsedMs);
  }
  assert.ok(progress.every((item) => item.batchSize >= 50 && item.batchSize <= 100));
}

async function run() {
  assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
  assert.equal(VIEWER_DIFF_CLASSIFIER_VERSION, "v3");
  assert.deepEqual(PROGRESSIVE_DIFF_CONFIG, { defaultBatchSize: 100, reducedBatchSize: 50, targetBatchMs: 250, maxMatchingBytes: 32 * 1024 * 1024 });
  assert.ok(fs.existsSync(workerPath));
  const canonical = classifyViewerDiff({ eventId: "canonical", issueKey: "SYNTH-1", fieldId: "description", fieldName: "Description", before: "null", after: "new", sourceType: "jira_changelog", sourceId: "history:0", jiraNativeSourceId: "history" });
  assert.equal(canonical.status, "before-unavailable");
  assert.equal(canonical.descriptionDiff?.status, "before-unavailable");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0267-progressive-"));
  const fixture = createFixture(root, "realistic.sqlite");
  const second = createFixture(root, "second.sqlite", 200);
  const beforeDigest = digest(fixture.databasePath);
  const coordinator = new DatabaseViewerCoordinator(workerPath, 30_000);
  const noHide = { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false, hideBeforeUnavailable: false };
  const query = { page: 1, pageSize: 100, sort: { field: "eventTime", direction: "asc" }, filters: {}, dateRange: { shortcut: "all", startDate: "", endDate: "" }, diffQuickFilters: { ...noHide, hideBeforeUnavailable: true } };
  const memoryBefore = process.memoryUsage();
  try {
    const directParity = queryDatabaseIssueChangelog(second.databasePath, "SYNTH-1", query);
    assert.equal(directParity.filteredCount, 160);
    assert.ok(directParity.rows.every((row) => row.diffStatus !== "before-unavailable"));

    let checkpoint: ProgressiveCheckpoint = { cursor: "", scanned: 0, elapsedMs: 0, matching: [] };
    let checkpointCancelled = false;
    await assert.rejects(queryDatabaseIssueEventsProgressive(second.databasePath, "SYNTH-1", query, {
      requestId: "checkpoint-first-pass",
      isCancelled: () => checkpointCancelled,
      onCheckpoint: (delta) => {
        checkpoint = { cursor: delta.cursor, scanned: delta.scanned, elapsedMs: delta.elapsedMs, matching: [...checkpoint.matching, ...delta.matches] };
        checkpointCancelled = true;
      }
    }), (error: Error & { code?: string }) => error.code === "VIEWER_REQUEST_CANCELLED");
    assert.equal(checkpoint.scanned, 100);
    const resumed = await queryDatabaseIssueEventsProgressive(second.databasePath, "SYNTH-1", query, { requestId: "checkpoint-resume", resume: checkpoint });
    assert.equal(resumed.filteredCount, directParity.filteredCount);
    assert.deepEqual(resumed.rows.map((row) => row.eventId), directParity.rows.map((row) => row.eventId));

    const issueProgress: ViewerProgressDto[] = [];
    const startedAt = performance.now();
    const issueResult = await coordinator.runProgressive("issue-table", "issueChangelog", fixture.databasePath, "issue-changelog-main", (item) => issueProgress.push(item), "SYNTH-1", query) as { rows: Array<Record<string, unknown>>; filteredCount: number; pageCount: number };
    const completionMs = performance.now() - startedAt;
    assert.equal(issueResult.filteredCount, LARGE_SCOPE_COUNT - fixture.beforeUnavailable, "non-Description rows with unavailable Before must remain visible");
    assert.equal(issueResult.pageCount, Math.ceil(issueResult.filteredCount / 100));
    assert.ok(issueResult.rows.every((row) => row.diffStatus !== "before-unavailable"));
    assert.ok(issueProgress.length > 2);
    assertMonotonic(issueProgress);
    assert.equal(issueProgress.at(-1)?.status, "completed");
    assert.equal(issueProgress.at(-1)?.scanned, LARGE_SCOPE_COUNT);

    const issueEvents = await coordinator.runProgressive("issue-table", "issueEvents", fixture.databasePath, "issue-events-main", () => {}, "SYNTH-1", query) as { filteredCount: number };
    assert.equal(issueEvents.filteredCount, issueResult.filteredCount);
    const userEvents = await coordinator.runProgressive("user", "userEvents", fixture.databasePath, "user-events-main", () => {}, { kind: "selected-users", userIds: ["target-user"] }, query) as { filteredCount: number };
    assert.equal(userEvents.filteredCount, issueResult.filteredCount);

    const combinedQuery = { ...query, diffQuickFilters: { ...query.diffQuickFilters, hideNoChange: true } };
    const directCombined = queryDatabaseIssueChangelog(fixture.databasePath, "SYNTH-1", combinedQuery);
    const combined = await coordinator.runProgressive("user", "userEvents", fixture.databasePath, "user-events-combined", () => {}, { kind: "selected-users", userIds: ["target-user"] }, combinedQuery) as { filteredCount: number };
    assert.equal(combined.filteredCount, directCombined.filteredCount, "SQL and progressive canonical predicates must match");

    let fakeNow = 0;
    const simulatedProgress: ViewerProgressDto[] = [];
    const overTwentySeconds = await queryDatabaseIssueEventsProgressive(fixture.databasePath, "SYNTH-1", query, { requestId: "fake-clock", now: () => (fakeNow += 21_000), onProgress: (item) => simulatedProgress.push(item) });
    assert.equal(overTwentySeconds.filteredCount, issueResult.filteredCount);
    assert.ok(simulatedProgress.at(-1)!.elapsedMs > 20_000);

    let cancelRequested = false;
    const cancelled = coordinator.runProgressive("user", "userEvents", fixture.databasePath, "cancel-me", (item) => {
      if (!cancelRequested && item.scanned >= 100) { cancelRequested = true; coordinator.cancel("user", "cancel-me"); }
    }, { kind: "selected-users", userIds: ["target-user"] }, { ...query, revision: 91 });
    await assert.rejects(cancelled, (error: Error & { code?: string }) => error.code === "VIEWER_REQUEST_CANCELLED");

    const rapid = Array.from({ length: 30 }, (_, revision) => coordinator.runProgressive("user", "userEvents", fixture.databasePath, `rapid-${revision}`, () => {}, { kind: "selected-users", userIds: ["target-user"] }, { ...query, revision: 100 + revision }));
    assert.deepEqual(coordinator.snapshot().user, { active: 1, pending: 1, databasePath: path.resolve(fixture.databasePath) });
    const rapidSettled = await Promise.allSettled(rapid);
    assert.equal(rapidSettled.at(-1)?.status, "fulfilled");
    assert.ok(rapidSettled.slice(0, -1).every((item) => item.status === "rejected" && item.reason?.code === "VIEWER_REQUEST_SUPERSEDED"));

    const switching = coordinator.runProgressive("issue-table", "issueEvents", fixture.databasePath, "old-database", () => {}, "SYNTH-1", { ...query, revision: 999 });
    const switched = coordinator.runProgressive("issue-table", "issueEvents", second.databasePath, "new-database", () => {}, "SYNTH-1", { ...query, revision: 1000 });
    await assert.rejects(switching, (error: Error & { code?: string }) => error.code === "VIEWER_DATABASE_SWITCHED");
    await switched;

    const readOnly = await coordinator.run("database", "assertReadOnly", fixture.databasePath) as { queryOnly: number; rejected: string[] };
    assert.equal(readOnly.queryOnly, 1);
    assert.deepEqual(readOnly.rejected.sort(), ["CREATE", "DELETE"]);
    assert.deepEqual(digest(fixture.databasePath), beforeDigest);
    const cache = await coordinator.run("user", "cacheDiagnostics", fixture.databasePath) as { entries: number; bytes: number; entryLimit: number; bytesLimit: number };
    assert.ok(cache.entries <= cache.entryLimit && cache.bytes <= cache.bytesLimit);
    const maxProgressBytes = Math.max(...issueProgress.map((item) => Buffer.byteLength(JSON.stringify(item))));
    const maxPageBytes = Buffer.byteLength(JSON.stringify(issueResult));
    assert.ok(maxProgressBytes < 2_048);
    assert.ok(maxPageBytes < 2 * 1024 * 1024);
    const memoryAfter = process.memoryUsage();
    console.log("v0.2.67 progressive diff filtering passed", JSON.stringify({ fixture: { events: EVENT_COUNT, largeScopeEvents: LARGE_SCOPE_COUNT, fieldChanges: DESCRIPTION_COUNT }, beforeUnavailable: fixture.beforeUnavailable, unchanged: fixture.unchanged, batches: issueProgress.length, completionMs, firstProgressMs: issueProgress[0]?.elapsedMs ?? 0, maxProgressBytes, maxPageBytes, queue: { active: 1, pending: 1 }, cache, memory: { rssBefore: memoryBefore.rss, rssAfter: memoryAfter.rss, heapBefore: memoryBefore.heapUsed, heapAfter: memoryAfter.heapUsed } }));
  } finally {
    await coordinator.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
