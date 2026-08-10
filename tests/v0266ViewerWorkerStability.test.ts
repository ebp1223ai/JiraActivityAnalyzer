import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { DatabaseViewerCoordinator } from "../electron/databaseViewerCoordinator.js";

const EVENT_COUNT = 20_000;
const workerPath = path.resolve("dist-electron/database-viewer-worker.cjs");
process.env.JAA_VIEWER_WORKER_TEST_MODE = "1";
const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const percentile = (values: number[], ratio: number) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;

function fixture(root: string, name: string, eventCount: number) {
  const databasePath = path.join(root, name);
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.66-worker-test", binding: { serverIdentity: "synthetic", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: name, now: "2026-08-06T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("BEGIN");
    const object = db.prepare("INSERT INTO source_objects (id,jira_issue_id,issue_key,project_key,first_saved_at,created_at) VALUES (?,?,?,?,?,?)");
    const snapshot = db.prepare("INSERT INTO current_issue_snapshots (source_object_id,summary,status,issue_type,priority,resolution,assignee,reporter,creator,labels_json,components_json,versions_json,start_date,due_date,jira_updated_at,snapshot_json,snapshot_updated_at) VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,'[]','[]','[]',NULL,NULL,?,'{}',?)");
    for (let issue = 1; issue <= 20; issue += 1) {
      object.run(`jira:issue:SYNTH-${issue}`, `native-${issue}`, `SYNTH-${issue}`, `PROJECT-${issue % 4}`, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      snapshot.run(`jira:issue:SYNTH-${issue}`, `Synthetic issue ${issue}`, issue % 2 ? "Open" : "Done", "Task", "Medium", "2026-08-06T00:00:00.000Z", "2026-08-06T00:00:00.000Z");
    }
    const event = db.prepare("INSERT INTO activity_events (id,source_object_id,event_type,event_time,actor_account_id,actor_display_name,field_id,field_name,from_value_json,to_value_json,source_record_id,event_identity_hash,event_identity_policy_version,identity_key_type,jira_native_source_id,source_provenance,created_at) VALUES (?,?,'field_changed',?,?,?,'description','Description',?,?,?,?,3,'jira_native',?,'jira_changelog',?)");
    for (let index = 0; index < eventCount; index += 1) {
      const mode = index % 5;
      const before = mode === 0 ? null : mode === 1 ? "same" : mode === 2 ? "old" : mode === 3 ? "" : `old-${index}`;
      const after = mode === 0 ? `new-${index}` : mode === 1 ? "same" : mode === 2 ? "" : mode === 3 ? "new" : index === 4 ? "Before unavailable appears in body" : `new-${index}`;
      const time = new Date(Date.UTC(2026, 7, 1, 0, 0, index % 86_400)).toISOString();
      event.run(`event-${index}`, `jira:issue:SYNTH-${index % 20 + 1}`, time, `user-${index % 100}`, `Synthetic User ${index % 100}`, before, after, `history-${index}:0`, sha(`event-${index}`), `history-${index}`, time);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; } finally { db.close(); }
  return databasePath;
}

function digest(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all();
    const events = db.prepare("SELECT id,source_object_id,event_time,from_value_json,to_value_json FROM activity_events ORDER BY id").all();
    return { schema: sha(JSON.stringify(schema)), events: sha(JSON.stringify(events)), count: events.length };
  } finally { db.close(); }
}

async function run() {
  assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
  assert.ok(fs.existsSync(workerPath));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0266-worker-"));
  const databasePath = fixture(root, "large.sqlite", EVENT_COUNT);
  const secondPath = fixture(root, "second.sqlite", 200);
  const before = digest(databasePath);
  const coordinator = new DatabaseViewerCoordinator(workerPath, 20_000);
  const query = { page: 1, pageSize: 100, sort: { field: "eventTime", direction: "asc" }, filters: {}, dateRange: { shortcut: "all", startDate: "", endDate: "" }, diffQuickFilters: { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false, hideBeforeUnavailable: false } };
  const timings: number[] = [];
  const memoryBefore = process.memoryUsage();
  try {
    let heartbeat = 0;
    const timer = setInterval(() => { heartbeat += 1; }, 1);
    const started = performance.now();
    const all = await coordinator.run("user", "userEvents", databasePath, { kind: "all" }, query) as { rows: unknown[]; filteredCount: number };
    timings.push(performance.now() - started);
    clearInterval(timer);
    assert.equal(all.filteredCount, EVENT_COUNT);
    assert.equal(all.rows.length, 100);
    assert.ok(heartbeat > 0);
    const payloadBytes = Buffer.byteLength(JSON.stringify(all));
    assert.ok(payloadBytes < 2 * 1024 * 1024);
    const hidden = await coordinator.run("user", "userEvents", databasePath, { kind: "all" }, { ...query, diffQuickFilters: { ...query.diffQuickFilters, hideBeforeUnavailable: true } }) as { rows: Array<{ diffStatus?: string }>; filteredCount: number };
    assert.equal(hidden.filteredCount, EVENT_COUNT - EVENT_COUNT / 5);
    assert.ok(hidden.rows.every((row) => row.diffStatus !== "before-unavailable"));
    const phrase = await coordinator.run("issue", "issueChangelog", databasePath, "SYNTH-5", { ...query, filters: { after: { text: "Before unavailable appears in body" } }, diffQuickFilters: { ...query.diffQuickFilters, hideBeforeUnavailable: true } }) as { filteredCount: number };
    assert.equal(phrase.filteredCount, 1);

    const active = coordinator.run("database", "__testDelay", databasePath, 150);
    const rapid = Array.from({ length: 29 }, (_, revision) => coordinator.run("database", "listIssues", databasePath, { page: 1, pageSize: 25, revision }));
    assert.deepEqual(coordinator.snapshot().database, { active: 1, pending: 1, databasePath: path.resolve(databasePath) });
    const settled = await Promise.allSettled([active, ...rapid]);
    assert.equal(settled.at(-1)?.status, "fulfilled");
    assert.ok(settled.slice(1, -1).every((item) => item.status === "rejected" && (item.reason as Error & { code?: string }).code === "VIEWER_REQUEST_SUPERSEDED"));

    for (let revision = 0; revision < 40; revision += 1) {
      const tick = performance.now();
      await coordinator.run("user", "userEvents", databasePath, { kind: "all" }, { ...query, page: revision % 5 + 1, revision });
      timings.push(performance.now() - tick);
    }
    const cache = await coordinator.run("user", "cacheDiagnostics", databasePath) as { entries: number; bytes: number; entryLimit: number; bytesLimit: number };
    assert.ok(cache.entries <= cache.entryLimit && cache.bytes <= cache.bytesLimit);
    const readOnly = await coordinator.run("database", "assertReadOnly", databasePath) as { queryOnly: number; rejected: string[] };
    assert.equal(readOnly.queryOnly, 1);
    assert.deepEqual(readOnly.rejected.sort(), ["CREATE", "DELETE"]);

    await assert.rejects(coordinator.run("detail", "__testCrash", databasePath), (error: Error & { code?: string }) => error.code === "VIEWER_WORKER_EXITED");
    assert.equal((await coordinator.run("detail", "overview", databasePath) as { database: { schema_version: number } }).database.schema_version, 3);
    const timeout = new DatabaseViewerCoordinator(workerPath, 250);
    await assert.rejects(timeout.run("database", "__testDelay", databasePath, 1_000), (error: Error & { code?: string }) => error.code === "VIEWER_WORKER_STALLED" && /Retry/.test(error.message));
    assert.equal((await timeout.run("database", "overview", databasePath) as { database: { schema_version: number } }).database.schema_version, 3);
    await timeout.close();
    const switching = coordinator.run("issue", "__testDelay", databasePath, 150);
    const switched = coordinator.run("issue", "overview", secondPath);
    await assert.rejects(switching, (error: Error & { code?: string }) => error.code === "VIEWER_DATABASE_SWITCHED");
    assert.equal((await switched as { database: { schema_version: number } }).database.schema_version, 3);
    assert.deepEqual(digest(databasePath), before);
    const afterMemory = process.memoryUsage();
    console.log("v0.2.66 worker stability passed", JSON.stringify({ fixture: { events: EVENT_COUNT, users: 100, issues: 20 }, queryMs: { p50: percentile(timings, 0.5), p95: percentile(timings, 0.95), max: Math.max(...timings) }, payloadBytes, queue: { active: 1, pending: 1 }, cache, heartbeat, memory: { rssBefore: memoryBefore.rss, rssAfter: afterMemory.rss, heapBefore: memoryBefore.heapUsed, heapAfter: afterMemory.heapUsed }, workerPath }));
  } finally { await coordinator.close(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
