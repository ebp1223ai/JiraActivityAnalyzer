import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createActivityTimelineRunContext, validateActivityTimelineRunContext } from "./activityTimelineRunContext.js";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "./currentStateArchive.js";
import {
  queryDatabaseDistinctValues,
  queryDatabaseIssueActivityStream,
  queryDatabaseUserEvents,
  queryDatabaseUserRelatedIssues
} from "./databaseViewer.js";
import { defaultUiPreferences, loadUiPreferences, updateUiPreferences } from "./uiPreferences.js";

const root = process.cwd();
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const connectionSource = fs.readFileSync(path.join(root, "src", "routes", "ConnectionsPage.tsx"), "utf8");
const issueViewerSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src", "components", "JiraContent.tsx"), "utf8");
const databaseTableSource = fs.readFileSync(path.join(root, "src", "components", "DatabaseIssueTable.tsx"), "utf8");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 2, "v0.2.46 must not change Current-State schema v2");
assert.doesNotMatch(analysisSource, /startDate:\s*"2026-01-01"/);
assert.match(analysisSource, /createActivityTimelineRunContext/);
assert.doesNotMatch(connectionSource, /testAndSaveConnection|Save Jira Settings|Update Jira Settings/);
assert.doesNotMatch(connectionSource, /<input|<select/);
assert.match(connectionSource, /testConnection\(activeConnection\)/);
assert.match(issueViewerSource, /"Activity Stream"/);
assert.match(issueViewerSource, /issueActivityStream/);
assert.doesNotMatch(contentSource, /dangerouslySetInnerHTML/);
assert.match(contentSource, /Attachment image:/);
assert.doesNotMatch(databaseTableSource, /Exact value\.\.\./);

const context = createActivityTimelineRunContext({
  sessionId: "synthetic-session",
  runId: "synthetic-run",
  selectedUser: "synthetic-account",
  selectedStartDate: "2026-01-31",
  selectedEndDate: "2026-03-01",
  createdAt: "2026-07-29T12:00:00.000Z"
});
assert.equal(Object.isFrozen(context), true);
assert.equal(context.selectedStartDate, context.effectiveStartDate);
assert.equal(context.selectedEndDate, context.effectiveEndDate);
assert.deepEqual(context.requestWindows.map((window) => [window.start, window.end]), [
  ["2026-01-31", "2026-01-31"],
  ["2026-02-01", "2026-02-28"],
  ["2026-03-01", "2026-03-01"]
]);
assert.equal(validateActivityTimelineRunContext(context).runId, context.runId);
assert.throws(() => validateActivityTimelineRunContext({ ...context, effectiveEndDate: "2026-03-02" }), /RUN_CONTEXT/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0246-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.46-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0246-db",
    now: "2026-07-29T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    const insertObject = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSnapshot = db.prepare(`INSERT INTO current_issue_snapshots (
      source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator,
      labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)`);
    const insertEvent = db.prepare(`INSERT INTO activity_events (
      id, source_object_id, event_type, event_time, actor_account_id, actor_display_name,
      field_id, field_name, from_value_json, to_value_json, source_record_id,
      event_identity_hash, event_identity_policy_version, identity_key_type,
      jira_native_source_id, source_provenance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 'synthetic', ?, ?, ?)`);
    for (let index = 1; index <= 3; index += 1) {
      const issueKey = `SYNTH-${index}`;
      const sourceId = `jira:issue:${issueKey}`;
      const timestamp = `2026-07-0${index}T10:00:00.000Z`;
      insertObject.run(sourceId, `native-issue-${index}`, issueKey, "SYNTH", timestamp, timestamp);
      insertSnapshot.run(sourceId, `Synthetic ${index}`, index === 3 ? "Done" : "Open", "Task", "Medium", timestamp, timestamp);
      const actor = index === 3 ? "other-account" : "synthetic-account";
      const provenance = index === 2 ? "jira_activity_stream" : "jira_changelog";
      insertEvent.run(
        `event-${index}`, sourceId, "field_changed", timestamp, actor, "Synthetic User",
        "status", "Status", "\"Open\"", "\"Done\"", `record-${index}`,
        crypto.createHash("sha256").update(`event-${index}`).digest("hex"),
        `native-event-${index}`, provenance, timestamp
      );
    }
  } finally {
    db.close();
  }

  const related = queryDatabaseUserRelatedIssues(databasePath, "synthetic-account", {
    page: 1, pageSize: 25, sort: { field: "issueKey", direction: "asc" }, filters: {}
  });
  assert.equal(related.totalCount, 2);
  assert.deepEqual(related.rows.map((row) => row.issueKey), ["SYNTH-1", "SYNTH-2"]);

  const allEvents = queryDatabaseUserEvents(databasePath, "synthetic-account", "all", {
    page: 1, pageSize: 50, sort: { field: "eventTime", direction: "asc" }, filters: {}
  });
  assert.equal(allEvents.totalCount, 2);
  const stream = queryDatabaseUserEvents(databasePath, "synthetic-account", "activity_stream", {
    page: 1, pageSize: 50, sort: { field: "eventTime", direction: "asc" }, filters: {}
  });
  assert.equal(stream.totalCount, 1);
  assert.equal(stream.rows[0].issueKey, "SYNTH-2");
  assert.equal(stream.sourceStatus, "confirmed");

  const unidentifiable = queryDatabaseIssueActivityStream(databasePath, "SYNTH-1", {
    page: 1, pageSize: 50, sort: { field: "eventTime", direction: "asc" }, filters: {}
  });
  assert.equal(unidentifiable.totalCount, 0);
  assert.equal(unidentifiable.sourceStatus, "source_unidentifiable");
  assert.equal(unidentifiable.unidentifiableSourceCount, 1);

  const distinct = queryDatabaseDistinctValues(databasePath, {
    source: "userEvents", subjectId: "synthetic-account", field: "sourceProvenance", search: "jira", limit: 100
  });
  assert.equal(distinct.values.length, 2);

  const defaults = defaultUiPreferences();
  assert.equal(defaults.databaseIssueList.pageSize, 200);
  assert.equal(defaults.issueActivityStream.pageSize, 50);
  updateUiPreferences(tempRoot, "issueActivityStream", { ...defaults.issueActivityStream, visibleColumns: ["eventTime", "eventType"], pageSize: 100 });
  const persisted = loadUiPreferences(tempRoot);
  assert.equal(persisted.preferences.issueActivityStream.pageSize, 100);
  assert.deepEqual(persisted.preferences.issueActivityStream.visibleColumns, ["eventTime", "eventType"]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.46 frozen run context, SQLite viewers, provenance, read-only connection, and preferences tests passed.");
