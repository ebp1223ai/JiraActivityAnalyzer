import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { extractActivityEventsV2 } from "../electron/activityEvents.js";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { listDatabaseIssues, queryDatabaseDistinctValues } from "../electron/databaseViewer.js";
import { formatDisplayTime } from "../src/utils/displayTime.js";
import { createRequestGate } from "../src/utils/requestGate.js";
import {
  detectReadableContentFormat,
  preciseMissingValue,
  readableContentSummary,
  readableContentText
} from "../src/utils/richContent.js";

const root = process.cwd();
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const databaseSource = fs.readFileSync(path.join(root, "electron", "sourceArchiveDatabase.ts"), "utf8");
const dashboardSource = fs.readFileSync(path.join(root, "src", "routes", "DashboardPage.tsx"), "utf8");
const issueViewerSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const userViewerSource = fs.readFileSync(path.join(root, "src", "routes", "UserViewerPage.tsx"), "utf8");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.53 requires Current-State schema v3 for Worklogs");
assert.match(mainSource, /did-finish-load[\s\S]*startPostRendererStartup/);
assert.doesNotMatch(databaseSource, /function checkDatabaseCompatibility[\s\S]{0,1400}quick_check/);
assert.match(dashboardSource, /issueInteractionReady/);
assert.match(dashboardSource, /issueRequest\.current/);
assert.match(dashboardSource, /distributionRequest\.current/);
assert.match(issueViewerSource, /SectionErrorBoundary/);
assert.match(userViewerSource, /SectionErrorBoundary/);
assert.doesNotMatch(issueViewerSource, /Activity Stream/);
assert.doesNotMatch(userViewerSource, /Activity Stream/);

assert.equal(
  formatDisplayTime("2026-07-28T17:22:37.000Z", "Asia/Taipei"),
  "2026/07/29 01:22:37"
);
assert.equal(detectReadableContentFormat("<p>Hello</p>"), "html");
assert.equal(detectReadableContentFormat("h2. Heading"), "wiki");
assert.equal(detectReadableContentFormat({ type: "doc", content: [] }), "adf");
assert.equal(readableContentText("<script>alert(1)</script><p>A &amp; B</p>"), "A & B");
assert.equal(
  readableContentText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ADF text" }] }] }),
  "ADF text"
);
assert.doesNotThrow(() => readableContentText("&#999999999; malformed"));
assert.equal(readableContentSummary("x".repeat(300), undefined, 20).length, 20);
assert.equal(preciseMissingValue("model"), "Not persisted by current data model");

const gate = createRequestGate();
const stale = gate.next();
const current = gate.next();
assert.equal(gate.isCurrent(stale), false);
assert.equal(gate.isCurrent(current), true);
gate.invalidate();
assert.equal(gate.isCurrent(current), false);

const extraction = extractActivityEventsV2({
  issue: {
    id: "10001",
    key: "SYNTH-1",
    fields: { created: "2026-07-28T17:22:37.000Z" }
  },
  comments: [{
    id: "comment-1",
    created: "2026-07-28T17:23:37.000Z",
    author: { accountId: "synthetic-user", displayName: "Synthetic User" },
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Readable comment" }] }] }
  }]
}, "synthetic-server", "SYNTH-1");
const commentEvent = extraction.events.find((event) => event.eventType === "comment_created");
assert.ok(commentEvent);
assert.match(String(commentEvent.toValueJson), /Readable comment/);
assert.match(String(commentEvent.toValueJson), /"contentStatus":"available"/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0248-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.48-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0248-db",
    now: "2026-07-29T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    const insertObject = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSnapshot = db.prepare(`INSERT INTO current_issue_snapshots (
      source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator,
      labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)`);
    for (let index = 1; index <= 225; index += 1) {
      const issueKey = `SYNTH-${String(index).padStart(3, "0")}`;
      const sourceId = `jira:issue:${issueKey}`;
      const project = index <= 200 ? "ALPHA" : "BETA";
      const timestamp = "2026-07-29T00:00:00.000Z";
      insertObject.run(sourceId, `native-${index}`, issueKey, project, timestamp, timestamp);
      insertSnapshot.run(sourceId, `Synthetic issue ${index}`, "Open", "Task", "Medium", timestamp, timestamp);
    }
  } finally {
    db.close();
  }

  const first = listDatabaseIssues(databasePath, {
    page: 1, pageSize: 50, sort: { field: "issueKey", direction: "asc" }, filters: {}
  });
  const last = listDatabaseIssues(databasePath, {
    page: 5, pageSize: 50, sort: { field: "issueKey", direction: "asc" }, filters: {}
  });
  assert.equal(first.databaseTotal, 225);
  assert.equal(first.items.length, 50);
  assert.equal(last.items.length, 25);
  assert.equal(last.items.at(-1)?.issueKey, "SYNTH-225");

  const filtered = listDatabaseIssues(databasePath, {
    page: 1,
    pageSize: 25,
    sort: { field: "issueKey", direction: "desc" },
    filters: { projectKey: { values: ["BETA"] } }
  });
  assert.equal(filtered.filteredTotal, 25);
  assert.equal(filtered.items[0].issueKey, "SYNTH-225");

  const distinct = queryDatabaseDistinctValues(databasePath, {
    source: "databaseIssues", field: "projectKey", search: "bet", limit: 100
  });
  assert.deepEqual(distinct.values, [{ value: "BETA", count: 25 }]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.48 database loading and readable viewer focused tests passed.");
