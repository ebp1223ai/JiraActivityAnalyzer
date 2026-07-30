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
  queryDatabaseIssueEvents,
  queryDatabaseUserDistributions,
  queryDatabaseUserEvents,
  queryDatabaseUserRelatedIssues
} from "./databaseViewer.js";
import { defaultUiPreferences, loadUiPreferences, updateUiPreferences } from "./uiPreferences.js";

const root = process.cwd();
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const connectionSource = fs.readFileSync(path.join(root, "src", "routes", "ConnectionsPage.tsx"), "utf8");
const userViewerSource = fs.readFileSync(path.join(root, "src", "routes", "UserViewerPage.tsx"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");
const issueViewerSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src", "components", "JiraContent.tsx"), "utf8");
const databaseTableSource = fs.readFileSync(path.join(root, "src", "components", "DatabaseIssueTable.tsx"), "utf8");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 2, "v0.2.47 must not change Current-State schema v2");
assert.doesNotMatch(analysisSource, /startDate:\s*"2026-01-01"/);
assert.match(analysisSource, /createActivityTimelineRunContext/);
assert.doesNotMatch(connectionSource, /testAndSaveConnection|Save Jira Settings|Update Jira Settings/);
assert.doesNotMatch(connectionSource, /<input|<select/);
assert.match(connectionSource, /testConnection\(activeConnection\)/);
assert.doesNotMatch(issueViewerSource, /"Activity Stream"/);
assert.doesNotMatch(issueViewerSource, /issueActivityStream/);
assert.match(issueViewerSource, /issueEvents/);
assert.doesNotMatch(userViewerSource, /"Activity Stream"/);
assert.match(userViewerSource, /Related Issue Distributions/);
assert.match(mainSource, /user-analysis:get-active-full-fetch-run/);
assert.match(mainSource, /user-analysis:get-full-fetch-run-status/);
assert.match(mainSource, /BrowserWindow\.getAllWindows\(\)/);
assert.match(preloadSource, /getActiveFullFetchRun/);
assert.match(preloadSource, /onFullFetchProgress: \(runId:/);
assert.match(analysisSource, /getActiveFullFetchRun/);
assert.match(analysisSource, /isFullFetchActive/);
assert.match(databaseTableSource, /draftText/);
assert.match(databaseTableSource, /onCompositionStart/);
assert.match(databaseTableSource, /Loading database issues/);
assert.doesNotMatch(issueViewerSource, /source: "issueActivityStream"/);
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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0247-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.47-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0247-db",
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

  const allEvents = queryDatabaseUserEvents(databasePath, "synthetic-account", {
    page: 1, pageSize: 50, sort: { field: "eventTime", direction: "asc" }, filters: {}
  });
  assert.equal(allEvents.totalCount, 2);
  assert.deepEqual(allEvents.rows.map((row) => row.issueKey), ["SYNTH-1", "SYNTH-2"]);

  const issueEvents = queryDatabaseIssueEvents(databasePath, "SYNTH-1", {
    page: 1, pageSize: 50, sort: { field: "eventTime", direction: "asc" }, filters: {}
  });
  assert.equal(issueEvents.totalCount, 1);
  assert.equal(issueEvents.rows[0].sourceProvenance, "jira_changelog");

  const distributions = queryDatabaseUserDistributions(databasePath, "synthetic-account");
  assert.equal(distributions.totalRelatedIssues, 2);
  assert.deepEqual(distributions.projectKey.map((item) => [item.value, item.count]), [["SYNTH", 2]]);

  const distinct = queryDatabaseDistinctValues(databasePath, {
    source: "issueEvents", subjectId: "SYNTH-1", field: "sourceProvenance", search: "jira", limit: 100
  });
  assert.equal(distinct.values.length, 1);

  const defaults = defaultUiPreferences();
  assert.equal(defaults.databaseIssueList.pageSize, 50);
  assert.equal(defaults.issueActivityEvents.pageSize, 50);
  assert.equal("issueActivityStream" in defaults, false);
  assert.equal("userActivityStream" in defaults, false);
  updateUiPreferences(tempRoot, "issueActivityEvents", { ...defaults.issueActivityEvents, visibleColumns: ["eventTime", "eventType"], pageSize: 100 });
  const persisted = loadUiPreferences(tempRoot);
  assert.equal(persisted.preferences.issueActivityEvents.pageSize, 100);
  assert.deepEqual(persisted.preferences.issueActivityEvents.visibleColumns, ["eventTime", "eventType"]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.47 background run context, SQLite Activity Events, distributions, and preferences tests passed.");
