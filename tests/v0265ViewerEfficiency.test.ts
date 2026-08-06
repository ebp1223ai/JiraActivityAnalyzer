import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { listDatabaseUsers, queryDatabaseIssueChangelog, queryDatabaseUserDistributions, queryDatabaseUserEvents, queryDatabaseUserRelatedIssues } from "../electron/databaseViewer.js";
import { normalizeUiPreferences } from "../electron/uiPreferences.js";
import { classifyViewerDiff, DEFAULT_DIFF_QUICK_FILTERS, viewerDiffPassesFilters } from "../shared/viewerEfficiency.js";
import { normalizeUserViewerScope, userViewerScopeKey } from "../shared/userViewerScope.js";
import { activityComparisonColumns } from "../src/components/ActivityComparisonTable.js";
import { normalizeTablePreferences, resetTableLayout } from "../src/utils/tablePreferences.js";

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.65 must keep schema v3");
assert.deepEqual(DEFAULT_DIFF_QUICK_FILTERS, { hideNoChange: true, hideZeroAdded: false, hideZeroDeleted: false });

const classify = (before: unknown, after: unknown) => classifyViewerDiff({
  eventId: "synthetic", issueKey: "SYNTH-1", fieldId: "status", fieldName: "Status", before, after,
  sourceType: "jira_changelog", sourceId: "history:0", jiraNativeSourceId: "history"
});
const unchanged = classify("same", "same");
const whitespace = classify("same value", "same   value");
const zeroAdded = classify("old", "");
const zeroDeleted = classify("", "new");
const unavailable = classify(null, "new");
const nonComparison = classify(null, null);
assert.equal(unchanged.status, "unchanged");
assert.equal(whitespace.status, "whitespace-only");
assert.deepEqual([zeroAdded.addedCount, zeroAdded.deletedCount], [0, 1]);
assert.deepEqual([zeroDeleted.addedCount, zeroDeleted.deletedCount], [1, 0]);
assert.equal(viewerDiffPassesFilters(unavailable, { hideNoChange: true, hideZeroAdded: true, hideZeroDeleted: true }), true);
assert.equal(viewerDiffPassesFilters(nonComparison, { hideNoChange: true, hideZeroAdded: true, hideZeroDeleted: true }), true);
assert.equal(viewerDiffPassesFilters(zeroAdded, { hideNoChange: false, hideZeroAdded: true, hideZeroDeleted: false }), false);
assert.equal(viewerDiffPassesFilters(zeroDeleted, { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: true }), false);

assert.deepEqual(normalizeUserViewerScope("user-a"), { kind: "selected-users", userIds: ["user-a"] });
assert.deepEqual(normalizeUserViewerScope({ kind: "selected-users", userIds: ["user-b", "user-a", "user-b"] }), { kind: "selected-users", userIds: ["user-b", "user-a"] });
assert.equal(userViewerScopeKey({ kind: "selected-users", userIds: ["user-b", "user-a"] }), userViewerScopeKey({ kind: "selected-users", userIds: ["user-a", "user-b"] }));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0265-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.65-test", binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: "synthetic-v0265-db", now: "2026-08-05T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  try {
    const insertObject = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSnapshot = db.prepare("INSERT INTO current_issue_snapshots (source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator, labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)");
    const insertEvent = db.prepare("INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 'jira_native', ?, ?, ?)");
    for (const [key, project, status, issueType, priority] of [["SYNTH-1", "ALPHA", "Open", "Bug", "High"], ["SYNTH-2", "BETA", "Done", "Task", "Low"]]) {
      const id = `jira:issue:${key}`;
      insertObject.run(id, `native-${key}`, key, project, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      insertSnapshot.run(id, `Synthetic ${key}`, status, issueType, priority, "2026-08-05T00:00:00.000Z", "2026-08-05T00:00:00.000Z");
    }
    const events = [
      ["e-change", "jira:issue:SYNTH-1", "status_changed", "2026-08-01T10:00:00.000Z", "user-a", "Same Name", "status", "Status", "To Do", "Open"],
      ["e-unchanged", "jira:issue:SYNTH-1", "field_changed", "2026-08-01T11:00:00.000Z", "user-a", "Same Name", "priority", "Priority", "High", "High"],
      ["e-whitespace", "jira:issue:SYNTH-1", "field_changed", "2026-08-01T12:00:00.000Z", "user-b", "Same Name", "labels", "Labels", "same value", "same   value"],
      ["e-zero-add", "jira:issue:SYNTH-1", "field_changed", "2026-08-01T13:00:00.000Z", "user-b", "Same Name", "resolution", "Resolution", "old", ""],
      ["e-zero-del", "jira:issue:SYNTH-1", "field_changed", "2026-08-01T14:00:00.000Z", "user-a", "Same Name", "assignee", "Assignee", "", "new"],
      ["e-unavailable", "jira:issue:SYNTH-2", "field_changed", "2026-08-02T10:00:00.000Z", "user-c", "Casey", "status", "Status", null, "Done"],
      ["e-comment", "jira:issue:SYNTH-2", "comment_created", "2026-08-02T11:00:00.000Z", "user-c", "Casey", null, null, null, null]
    ];
    events.forEach((event, index) => insertEvent.run(...event, `history-${index}:0`, String(index + 1).repeat(64).slice(0, 64), `history-${index}`, "jira_changelog", event[3]));
  } finally { db.close(); }

  const allDate = { shortcut: "all", startDate: "", endDate: "" } as const;
  const baseQuery = { page: 1, pageSize: 25 as const, sort: { field: "eventTime", direction: "asc" as const }, filters: {}, dateRange: allDate };
  const noQuick = { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false };
  const allRows = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", { ...baseQuery, diffQuickFilters: noQuick });
  assert.equal(allRows.filteredCount, 5);
  const defaultRows = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", baseQuery);
  assert.equal(defaultRows.filteredCount, 3);
  assert.deepEqual(defaultRows.rows.map((row) => row.eventId), ["e-change", "e-zero-add", "e-zero-del"]);
  const addedRows = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", { ...baseQuery, diffQuickFilters: { ...noQuick, hideZeroAdded: true } });
  assert.deepEqual(addedRows.rows.map((row) => row.eventId), ["e-change", "e-zero-del"]);
  const deletedRows = queryDatabaseIssueChangelog(databasePath, "SYNTH-1", { ...baseQuery, diffQuickFilters: { ...noQuick, hideZeroDeleted: true } });
  assert.deepEqual(deletedRows.rows.map((row) => row.eventId), ["e-change", "e-zero-add"]);
  const diagnosticRows = queryDatabaseUserEvents(databasePath, { kind: "selected-users", userIds: ["user-c"] }, { ...baseQuery, diffQuickFilters: { hideNoChange: true, hideZeroAdded: true, hideZeroDeleted: true } });
  assert.equal(diagnosticRows.filteredCount, 2, "unavailable and non-comparison rows must survive all quick filters");
  assert.ok(diagnosticRows.rows.some((row) => row.eventId === "e-comment" && row.comparisonValidated === 0));

  const selectedScope = { kind: "selected-users", userIds: ["user-a", "user-b"] } as const;
  const selectedEvents = queryDatabaseUserEvents(databasePath, selectedScope, { ...baseQuery, diffQuickFilters: noQuick });
  assert.equal(selectedEvents.filteredCount, 5);
  assert.equal(new Set(selectedEvents.rows.map((row) => row.eventId)).size, 5);
  const related = queryDatabaseUserRelatedIssues(databasePath, selectedScope, { ...baseQuery, sort: { field: "lastActivity", direction: "desc" } });
  assert.equal(related.filteredCount, 1, "same issue touched by two users is one union issue");
  const distributions = queryDatabaseUserDistributions(databasePath, selectedScope, { ...baseQuery, sort: { field: "lastActivity", direction: "desc" } });
  assert.equal(distributions.totalRelatedIssues, 1);
  assert.equal(distributions.totalEvents, 5);
  assert.equal(distributions.comparison.length, 2);
  assert.deepEqual(distributions.comparison.map((item) => [item.userId, item.eventCount, item.distinctRelatedIssues]), [["user-a", 3, 1], ["user-b", 2, 1]]);
  assert.ok(distributions.comparison.every((item) => item.displayName === "Same Name"), "same display names remain separate by stable ID");
  const allUsers = queryDatabaseUserEvents(databasePath, { kind: "all" }, { ...baseQuery, diffQuickFilters: noQuick });
  assert.equal(allUsers.filteredCount, 7);
  const allDistributions = queryDatabaseUserDistributions(databasePath, { kind: "all" }, { ...baseQuery, sort: { field: "lastActivity", direction: "desc" } });
  assert.deepEqual(allDistributions.comparison, [], "All Users must not render an unbounded comparison list");
  const restoredUsers = listDatabaseUsers(databasePath, { userIds: ["user-b", "missing", "user-a"], limit: 3 });
  assert.deepEqual(new Set(restoredUsers.items.map((item) => item.userId)), new Set(["user-a", "user-b"]));
} finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }

const defaults = normalizeUiPreferences({});
assert.deepEqual(defaults.issueChangelog.diffQuickFilters, DEFAULT_DIFF_QUICK_FILTERS);
assert.deepEqual(defaults.issueActivityEvents.diffQuickFilters, DEFAULT_DIFF_QUICK_FILTERS);
assert.deepEqual(defaults.userAllActivityEvents.diffQuickFilters, DEFAULT_DIFF_QUICK_FILTERS);
assert.equal(defaults.userAllActivityEvents.userScopeMode, "selected");
const migrated = normalizeUiPreferences({ userAllActivityEvents: { selectedUserIds: ["b", "a", "b", ""], userScopeMode: "all", diffQuickFilters: { hideNoChange: false, hideZeroAdded: true, hideZeroDeleted: false } } });
assert.deepEqual(migrated.userAllActivityEvents.selectedUserIds, ["b", "a"]);
assert.equal(migrated.userAllActivityEvents.userScopeMode, "all");
const columns = activityComparisonColumns("user-events");
const table = normalizeTablePreferences({ ...migrated.userAllActivityEvents, filters: { actor: { values: ["Same Name"] } } }, columns);
const reset = resetTableLayout(table, columns);
assert.deepEqual(reset.diffQuickFilters, table.diffQuickFilters);
assert.deepEqual(reset.selectedUserIds, table.selectedUserIds);
assert.deepEqual(reset.filters, table.filters);

const root = process.cwd();
const quickUi = fs.readFileSync(path.join(root, "src", "components", "DiffQuickFilters.tsx"), "utf8");
assert.match(quickUi, /Hide No Change/);
assert.match(quickUi, /Hide \+ = 0/);
assert.match(quickUi, /Hide − = 0/);
const userUi = fs.readFileSync(path.join(root, "src", "routes", "UserViewerPage.tsx"), "utf8");
assert.match(userUi, /Selected Users/);
assert.match(userUi, /onCompositionStart/);
assert.match(userUi, /Clear Selected/);
const issueUi = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
assert.doesNotMatch(issueUi, /Comments[\s\S]{0,300}DiffQuickFilters/);
for (const relative of ["src/routes/UserViewerPage.tsx", "src/routes/IssueViewerPage.tsx", "electron/main.ts", "electron/preload.ts"]) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  assert.doesNotMatch(source, /All Issues by Last Updated Date|LAST_UPDATED_IN_RANGE|Fetch Issues by Last Updated Date/);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
assert.equal(packageJson.version, "0.2.65");
console.log("v0.2.65 viewer efficiency, multi-user union, Diff filters, and preference tests passed.");
