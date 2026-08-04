import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ACTIVITY_VIEWER_COLUMNS_BY_SCOPE, activityViewerRegistryForScope } from "../shared/activityViewerColumns.js";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { queryDatabaseDistinctValues, queryDatabaseIssueChangelog, queryDatabaseIssueEvents, queryDatabaseUserEvents } from "../electron/databaseViewer.js";
import { normalizeUiPreferences } from "../electron/uiPreferences.js";
import { activityComparisonColumns } from "../src/components/ActivityComparisonTable.js";
import { normalizeTablePreferences, resetTableLayout } from "../src/utils/tablePreferences.js";

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.63 must not change the SQLite schema");
for (const scope of ["issueActivityEvents", "issueChangelog", "userAllActivityEvents"] as const) {
  const registry = activityViewerRegistryForScope(scope);
  assert.deepEqual(registry.slice(0, 2).map((column) => column.id), ["eventTime", "action"]);
  assert.ok(registry[0].required && registry[1].required);
  assert.equal(new Set(registry.map((column) => column.id)).size, registry.length);
}
assert.deepEqual(ACTIVITY_VIEWER_COLUMNS_BY_SCOPE.issueChangelog.slice(-3), ["historyId", "itemIndex", "sourceProvenance"]);

for (const mode of ["issue-events", "issue-changelog", "user-events"] as const) {
  const columns = activityComparisonColumns(mode);
  const normalized = normalizeTablePreferences({
    visibleColumns: columns.map((column) => column.id).filter((id) => id !== "eventTime" && id !== "action"),
    columnOrder: [...columns.map((column) => column.id).reverse(), "unknown", "before"],
    columnWidths: {}, pageSize: 50, pageIndex: 1, sort: null, filters: {}
  }, columns.map((column) => ({ id: column.id, queryField: column.queryField, required: column.required, defaultVisible: column.defaultVisible, defaultWidth: column.width })));
  assert.deepEqual(normalized.columnOrder.slice(0, 2), ["eventTime", "action"]);
  assert.ok(normalized.visibleColumns.includes("eventTime"));
  assert.ok(normalized.visibleColumns.includes("action"));
  assert.equal(normalized.columnOrder.filter((id) => id === "before").length, 1);
  const reset = resetTableLayout({ ...normalized, filters: { projectKey: { values: ["ALPHA"] } }, sort: { field: "eventTime", direction: "desc" }, pageIndex: 4 }, columns);
  assert.deepEqual(reset.filters, { projectKey: { values: ["ALPHA"] } });
  assert.deepEqual(reset.sort, { field: "eventTime", direction: "desc" });
  assert.equal(reset.pageIndex, 4);
}

const migrated = normalizeUiPreferences({
  issueChangelog: {
    visibleColumns: ["created", "author", "eventType", "field", "diff", "sourceProvenance"],
    columnOrder: ["author", "created", "eventType", "field", "before", "after", "diff", "sourceProvenance", "unknown", "before"],
    columnWidths: { created: 210, before: 355 }, pageSize: 100, pageIndex: 3,
    sort: { field: "itemIndex", direction: "desc" }, filters: { field: { values: ["Status"] }, historyId: { text: "history" } }
  }
});
assert.deepEqual(migrated.issueChangelog.columnOrder.slice(0, 2), ["eventTime", "action"]);
assert.ok(migrated.issueChangelog.visibleColumns.includes("eventTime"));
assert.ok(migrated.issueChangelog.visibleColumns.includes("action"));
assert.ok(!migrated.issueChangelog.visibleColumns.includes("before"), "hidden Before preference must remain hidden");
assert.ok(!migrated.issueChangelog.visibleColumns.includes("after"), "hidden After preference must remain hidden");
assert.equal(migrated.issueChangelog.columnWidths.eventTime, 210);
assert.equal(migrated.issueChangelog.columnWidths.before, 355);
assert.equal(migrated.issueChangelog.pageIndex, 3);
assert.deepEqual(migrated.issueChangelog.filters.field, { values: ["Status"] });

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0263-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.63-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0263-db",
    now: "2026-08-04T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    const insertObject = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSnapshot = db.prepare("INSERT INTO current_issue_snapshots (source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator, labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)");
    const insertEvent = db.prepare("INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 'jira_native', ?, ?, ?)");
    for (const issue of [
      ["SYNTH-1", "ALPHA", "Open", "Bug", "High"],
      ["SYNTH-2", "BETA", "Done", "Task", "Low"]
    ]) {
      const [key, project, status, issueType, priority] = issue;
      const id = `jira:issue:${key}`;
      insertObject.run(id, `native-${key}`, key, project, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      insertSnapshot.run(id, `Synthetic ${key}`, status, issueType, priority, "2026-08-04T00:00:00.000Z", "2026-08-04T00:00:00.000Z");
    }
    const events = [
      ["event-1", "jira:issue:SYNTH-1", "status_changed", "2026-08-01T10:00:00.000Z", "user-a", "Alice", "status", "Status", "To Do", "Open", "history-1:0", "1".repeat(64), "history-1", "jira_changelog"],
      ["event-2", "jira:issue:SYNTH-1", "field_changed", "2026-08-01T11:00:00.000Z", "user-b", "Bob", "priority", "Priority", "Medium", "High", "history-2:1", "2".repeat(64), "history-2", "jira_changelog"],
      ["event-3", "jira:issue:SYNTH-1", "comment_created", "2026-08-01T12:00:00.000Z", "user-a", "Alice", null, null, null, "Comment", "comment-1", "3".repeat(64), "comment-1", "jira_api"],
      ["event-4", "jira:issue:SYNTH-2", "status_changed", "2026-08-02T10:00:00.000Z", "user-a", "Alice", "status", "Status", "Open", "Done", "history-3:0", "4".repeat(64), "history-3", "jira_changelog"]
    ];
    for (const event of events) insertEvent.run(...event, event[3]);
  } finally {
    db.close();
  }

  const allDate = { shortcut: "all", startDate: "", endDate: "" } as const;
  const baseQuery = { page: 1, pageSize: 25 as const, sort: { field: "eventTime", direction: "asc" as const }, filters: {}, dateRange: allDate };
  const issueEvents = queryDatabaseIssueEvents(databasePath, "SYNTH-1", baseQuery);
  const changelog = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", baseQuery);
  assert.equal(issueEvents.filteredCount, 3);
  assert.equal(changelog.filteredCount, 2);
  assert.deepEqual(changelog.rows.map((row) => row.eventId), ["event-1", "event-2"]);
  assert.ok(changelog.rows.every((row) => row.sourceProvenance === "jira_changelog"));
  const row = changelog.rows[0];
  assert.equal(row.action, "status_changed");
  assert.equal(row.eventType, "status_changed");
  assert.equal(row.projectKey, "ALPHA");
  assert.equal(row.issueTypeName, "Bug");
  assert.equal(row.currentStatusName, "Open");
  assert.equal(row.currentPriorityName, "High");
  assert.equal(row.historyId, "history-1");
  assert.equal(row.itemIndex, 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(row, "snapshot_json"));

  const filtered = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", { ...baseQuery, filters: { currentPriorityName: { values: ["High"] }, projectKey: { values: ["ALPHA"] } } });
  assert.equal(filtered.filteredCount, 2);
  const sorted = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", { ...baseQuery, sort: { field: "itemIndex", direction: "desc" } });
  assert.deepEqual(sorted.rows.map((item) => item.itemIndex), [1, 0]);
  const statuses = queryDatabaseDistinctValues(databasePath, { source: "issueChangelog", subjectId: "SYNTH-1", field: "currentStatusName", limit: 100, query: baseQuery });
  assert.deepEqual(statuses.values, [{ value: "Open", count: 2 }]);
  const allUsers = queryDatabaseUserEvents(databasePath, { kind: "all" }, { ...baseQuery, filters: { projectKey: { values: ["BETA"] } } });
  assert.equal(allUsers.filteredCount, 1);
  assert.equal(allUsers.rows[0].issueKey, "SYNTH-2");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const root = process.cwd();
const issueRoute = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
assert.match(issueRoute, /databaseViewer\?\.issueChangelog/);
assert.match(issueRoute, /databaseViewer\?\.issueEvents/);
assert.match(issueRoute, /"issueChangelog"/);
assert.match(issueRoute, /"issueActivityEvents"/);
assert.doesNotMatch(issueRoute, /Worklogs|Attachments Metadata|Remote Links/);

console.log("v0.2.63 analyzer evidence UI and metadata tests passed.");
