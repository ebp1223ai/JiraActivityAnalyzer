import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import {
  queryDatabaseDistinctValues,
  queryDatabaseIssueChangelog,
  queryDatabaseIssueEvents,
  queryDatabaseUserDistributions,
  queryDatabaseUserEvents,
  queryDatabaseUserRelatedIssues
} from "../electron/databaseViewer.js";
import { ISSUE_VIEWER_TABS, normalizeIssueViewerTab } from "../src/utils/issueViewerTabs.js";

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
const root = process.cwd();
const issueRoute = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const userRoute = fs.readFileSync(path.join(root, "src", "routes", "UserViewerPage.tsx"), "utf8");
const comparisonSource = fs.readFileSync(path.join(root, "src", "components", "ActivityComparisonTable.tsx"), "utf8");

assert.doesNotMatch(issueRoute, /Worklogs|Attachments Metadata|Remote Links/);
assert.doesNotMatch(ISSUE_VIEWER_TABS.join("|"), /Worklogs|Attachments Metadata|Remote Links/);
assert.equal(normalizeIssueViewerTab("Worklogs"), "Overview");
assert.equal(normalizeIssueViewerTab("Attachments Metadata"), "Overview");
assert.equal(normalizeIssueViewerTab("Remote Links"), "Overview");
assert.match(issueRoute, /mode="issue-changelog"/);
assert.match(issueRoute, /mode="issue-events"/);
assert.match(userRoute, /mode="user-events"/);
assert.match(comparisonSource, /DescriptionOriginalPreviewCell/);
assert.match(comparisonSource, /DiffCell/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0262-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.62-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0262-db",
    now: "2026-08-04T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    const insertObject = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSnapshot = db.prepare("INSERT INTO current_issue_snapshots (source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator, labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)");
    const insertEvent = db.prepare("INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 'jira_native', ?, ?, ?)");
    for (const [key, project, status] of [["SYNTH-1", "ALPHA", "Open"], ["SYNTH-2", "BETA", "Done"]]) {
      const id = `jira:issue:${key}`;
      insertObject.run(id, `native-${key}`, key, project, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      insertSnapshot.run(id, `Synthetic ${key}`, status, "Task", "Medium", "2026-08-04T00:00:00.000Z", "2026-08-04T00:00:00.000Z");
    }
    const events = [
      ["event-description", "jira:issue:SYNTH-1", "field_changed", "2026-08-01T10:00:00.000Z", "user-a", "Shared Name", "description", "Description", "old text", "new text", "history-1:0", "1".repeat(64), "history-1", "jira_changelog"],
      ["event-comment", "jira:issue:SYNTH-1", "comment_created", "2026-08-01T10:00:00.000Z", "user-b", "Shared Name", null, null, null, "comment", "comment-1", "2".repeat(64), "comment-1", "jira_api"],
      ["event-status", "jira:issue:SYNTH-2", "status_changed", "2026-08-02T11:00:00.000Z", "user-a", "Shared Name", "status", "Status", "Open", "Done", "history-2:1", "3".repeat(64), "history-2", "jira_changelog"],
      ["event-attachment", "jira:issue:SYNTH-2", "attachment_added", "2026-08-03T12:00:00.000Z", "deleted-user", "Unknown", null, null, null, "spec.txt", "attachment-1", "4".repeat(64), "attachment-1", "jira_api"]
    ];
    for (const event of events) insertEvent.run(...event, event[3]);
  } finally {
    db.close();
  }

  const allDate = { shortcut: "all", startDate: "", endDate: "" };
  const eventQuery = { page: 1, pageSize: 25, sort: { field: "eventTime", direction: "asc" }, filters: {}, dateRange: allDate };
  const issueEvents = queryDatabaseIssueEvents(databasePath, "SYNTH-1", eventQuery);
  const changelog = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", eventQuery);
  assert.equal(issueEvents.filteredCount, 2);
  assert.equal(changelog.filteredCount, 1);
  const activityDescription = issueEvents.rows.find((row) => row.eventId === "event-description")!;
  const changelogDescription = changelog.rows[0];
  assert.equal(changelogDescription.eventId, activityDescription.eventId);
  assert.equal(changelogDescription.databaseIdentity, activityDescription.databaseIdentity);
  assert.deepEqual(changelogDescription.descriptionDiff, activityDescription.descriptionDiff);
  assert.equal(changelogDescription.historyId, "history-1");
  assert.equal(changelogDescription.itemIndex, 0);
  assert.equal((changelogDescription.descriptionDiff as Record<string, unknown>).status, "changed");
  assert.equal(Object.prototype.hasOwnProperty.call(changelogDescription, "before"), false, "compact Description rows must not expose raw originals");

  const allScope = { kind: "all" } as const;
  const userAScope = { kind: "single-user", userId: "user-a" } as const;
  const userBScope = { kind: "single-user", userId: "user-b" } as const;
  const allEvents = queryDatabaseUserEvents(databasePath, allScope, eventQuery);
  const userAEvents = queryDatabaseUserEvents(databasePath, userAScope, eventQuery);
  assert.equal(allEvents.totalCount, 4);
  assert.equal(allEvents.filteredCount, 4);
  assert.equal(userAEvents.totalCount, 2);
  assert.deepEqual(new Set(allEvents.rows.filter((row) => row.displayName === "Shared Name").map((row) => row.userId)), new Set(["user-a", "user-b"]));

  const relatedQuery = { page: 1, pageSize: 25, sort: { field: "lastActivity", direction: "desc" }, filters: {}, dateRange: allDate };
  const allRelated = queryDatabaseUserRelatedIssues(databasePath, allScope, relatedQuery);
  const userBRelated = queryDatabaseUserRelatedIssues(databasePath, userBScope, relatedQuery);
  assert.equal(allRelated.totalCount, 2);
  assert.equal(allRelated.filteredCount, 2);
  assert.equal(userBRelated.filteredCount, 1);
  const filtered = queryDatabaseUserRelatedIssues(databasePath, allScope, { ...relatedQuery, filters: { projectKey: { values: ["ALPHA"] } } });
  assert.equal(filtered.filteredCount, 1);
  assert.equal(filtered.rows[0].issueKey, "SYNTH-1");

  const distributions = queryDatabaseUserDistributions(databasePath, allScope, relatedQuery);
  assert.equal(distributions.totalRelatedIssues, 2);
  assert.equal(distributions.totalEvents, 4);
  assert.equal(distributions.comments, 1);
  assert.equal(distributions.attachments, 1);
  const actors = queryDatabaseDistinctValues(databasePath, { source: "userEvents", scope: allScope, field: "actor", limit: 100, query: eventQuery });
  assert.equal(actors.values.find((item) => item.value === "Shared Name")?.count, 3);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.62 Issue Changelog and typed All Users scope tests passed.");
