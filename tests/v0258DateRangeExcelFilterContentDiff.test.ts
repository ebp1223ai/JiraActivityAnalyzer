import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import {
  listDatabaseIssues,
  loadDatabaseIssueDistributions,
  queryDatabaseDistinctValues,
  queryDatabaseIssueEvents,
  queryDatabaseUserDistributions,
  queryDatabaseUserEvents,
  queryDatabaseUserRelatedIssues
} from "../electron/databaseViewer.js";
import { dateRangeBounds, dateRangeForShortcut } from "../src/types/dateRange.js";
import { canonicalizeContent, classifyContentChange, isDescriptionField } from "../src/utils/contentChange.js";
import { defaultUiPreferences, loadUiPreferences, updateUiPreferences } from "../electron/uiPreferences.js";
import { localDistinctValues, queryLocalTable } from "../src/utils/localTableQuery.js";

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
assert.deepEqual(dateRangeForShortcut("today", new Date(2026, 7, 3, 12)), { shortcut: "today", startDate: "2026-08-03", endDate: "2026-08-03" });
assert.deepEqual(dateRangeForShortcut("last7", new Date(2026, 7, 3, 12)), { shortcut: "last7", startDate: "2026-07-28", endDate: "2026-08-03" });
assert.deepEqual(dateRangeBounds({ shortcut: "custom", startDate: "2026-07-01", endDate: "2026-07-31" }), {
  startInclusive: "2026-07-01T00:00:00",
  endExclusive: "2026-08-01T00:00:00"
});
assert.throws(() => dateRangeBounds({ shortcut: "custom", startDate: "2026-08-02", endDate: "2026-08-01" }), /DATE_RANGE_INVALID/);

assert.equal(canonicalizeContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] }).text, "Hello");
assert.equal(classifyContentChange("A  B", "A B"), "whitespace-only");
assert.equal(classifyContentChange("A", "B"), "changed");
assert.equal(classifyContentChange(undefined, "B", false, true), "before-unavailable");
assert.equal(classifyContentChange("", "", true, true), "unchanged");
assert.equal(isDescriptionField("description", "Description"), true);
assert.equal(isDescriptionField("summary", "Contains description words"), false);
const localRows = [
  { id: "1", created: "2026-07-01T00:00:00", actor: "Alice", field: "description", before: "A", after: "B" },
  { id: "2", created: "2026-07-02T00:00:00", actor: "Bob", field: "status", before: "Open", after: "Done" },
  { id: "3", created: "2026-08-01T00:00:00", actor: "Alice", field: "summary", before: "One", after: "Two" }
];
const localColumns = {
  created: { expression: "created", kind: "date" as const },
  actor: { expression: "actor", kind: "multi" as const },
  field: { expression: "field", kind: "multi" as const },
  before: { expression: "before", kind: "text" as const },
  after: { expression: "after", kind: "text" as const }
};
const localQuery = { page: 1, pageSize: 25 as const, sort: { field: "created", direction: "asc" as const }, filters: { actor: { values: ["Alice"] } }, dateRange: { shortcut: "custom" as const, startDate: "2026-07-01", endDate: "2026-07-31" } };
assert.deepEqual(queryLocalTable(localRows, localQuery, localColumns, "created").rows.map((row) => row.id), ["1"]);
assert.deepEqual(localDistinctValues(localRows, { ...localQuery, dateRange: { shortcut: "all", startDate: "", endDate: "" } }, localColumns, "actor", "").values.map((item) => item.value).sort(), ["Alice", "Bob"]);

const root = process.cwd();
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const issueSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const excelSource = fs.readFileSync(path.join(root, "src", "components", "ExcelFilterPopover.tsx"), "utf8");
const commentSource = fs.readFileSync(path.join(root, "src", "components", "CommentCard.tsx"), "utf8");
assert.match(analysisSource, /Select All Filtered Results/);
assert.match(analysisSource, /Deselect All Filtered Results/);
assert.match(excelSource, /Select All Search Results/);
assert.match(excelSource, /event\.key === "Escape"/);
assert.match(issueSource, /Description Changed Only/);
assert.match(commentSource, /Updated unavailable/);
assert.doesNotMatch(issueSource, /comment.*revision inference/i);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0258-"));
const databasePath = path.join(tempRoot, "date-filter.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.58-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0258-db",
    now: "2026-07-01T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    const object = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const snapshot = db.prepare("INSERT INTO current_issue_snapshots (source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator, labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, '[]', '[]', '[]', NULL, NULL, ?, ?, ?)");
    const event = db.prepare("INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 'jira_native', ?, 'jira_api', ?)");
    const issues = [
      ["SYNTH-1", "ALPHA", "2026-07-01T10:00:00.000Z", "2026-07-10T10:00:00.000Z", "Open"],
      ["SYNTH-2", "ALPHA", "2026-07-15T10:00:00.000Z", "2026-07-20T10:00:00.000Z", "Done"],
      ["SYNTH-3", "BETA", "2026-08-01T10:00:00.000Z", "2026-08-02T10:00:00.000Z", "Open"]
    ];
    issues.forEach(([key, project, created, updated, status], index) => {
      const id = "jira:issue:" + key;
      object.run(id, "native-" + index, key, project, created, created);
      snapshot.run(id, "Synthetic " + key, status, "Task", "Medium", "Synthetic User", "Synthetic Reporter", "Synthetic Creator", updated, JSON.stringify({ fields: { created } }), updated);
      const eventTime = index === 0 ? "2026-07-05T12:00:00.000Z" : index === 1 ? "2026-07-31T23:59:59.000Z" : "2026-08-01T00:00:00.000Z";
      event.run("event-" + index, id, index === 1 ? "comment_created" : "field_changed", eventTime, "user-1", "Synthetic User", "description", "Description", "before", "after", "record-" + index, String(index + 1).padStart(64, "0"), "native-event-" + index, eventTime);
    });
  } finally {
    db.close();
  }

  const july = { shortcut: "custom" as const, startDate: "2026-07-01", endDate: "2026-07-31" };
  const activity = listDatabaseIssues(databasePath, { page: 1, pageSize: 25, sort: { field: "issueKey", direction: "asc" }, filters: {}, dateMode: "activity", dateRange: july, revision: 4 });
  assert.deepEqual(activity.items.map((item) => item.issueKey), ["SYNTH-1", "SYNTH-2"]);
  const created = listDatabaseIssues(databasePath, { page: 1, pageSize: 25, sort: { field: "issueKey", direction: "asc" }, filters: {}, dateMode: "created", dateRange: july });
  assert.equal(created.filteredTotal, 2);
  const updated = listDatabaseIssues(databasePath, { page: 1, pageSize: 25, sort: { field: "issueKey", direction: "asc" }, filters: {}, dateMode: "updated", dateRange: july });
  assert.equal(updated.filteredTotal, 2);
  const distributions = loadDatabaseIssueDistributions(databasePath, { page: 1, pageSize: 25, sort: { field: "issueKey", direction: "asc" }, filters: { status: { values: ["Open"] } }, dateMode: "activity", dateRange: july });
  assert.equal(distributions.total, 1);
  assert.deepEqual(distributions.projectKey.map((item) => ({ value: String(item.value), count: Number(item.count) })), [{ value: "ALPHA", count: 1 }]);

  const relatedQuery = { page: 1, pageSize: 25 as const, sort: { field: "lastActivity", direction: "desc" as const }, filters: {}, dateRange: july, revision: 8 };
  const related = queryDatabaseUserRelatedIssues(databasePath, { kind: "single-user", userId: "user-1" }, relatedQuery);
  assert.equal(related.filteredCount, 2);
  const userDistributions = queryDatabaseUserDistributions(databasePath, { kind: "single-user", userId: "user-1" }, { ...relatedQuery, filters: { status: { values: ["Open"] } } });
  assert.equal(userDistributions.totalRelatedIssues, 1);
  assert.deepEqual(userDistributions.projectKey.map((item) => ({ value: String(item.value), count: Number(item.count) })), [{ value: "ALPHA", count: 1 }]);
  const userEvents = queryDatabaseUserEvents(databasePath, { kind: "single-user", userId: "user-1" }, { page: 1, pageSize: 25, sort: { field: "eventTime", direction: "asc" }, filters: {}, dateRange: july, revision: 10 });
  assert.equal(userEvents.filteredCount, 2);
  const issueEvents = queryDatabaseIssueEvents(databasePath, "SYNTH-3", { page: 1, pageSize: 25, sort: { field: "eventTime", direction: "asc" }, filters: {}, dateRange: july });
  assert.equal(issueEvents.filteredCount, 0);

  const candidates = queryDatabaseDistinctValues(databasePath, {
    source: "databaseIssues",
    field: "projectKey",
    search: "",
    limit: 100,
    query: { page: 1, pageSize: 25, sort: { field: "issueKey", direction: "asc" }, filters: { projectKey: { values: ["ALPHA"] }, status: { values: ["Open"] } }, dateMode: "activity", dateRange: { shortcut: "all", startDate: "", endDate: "" } }
  });
  assert.deepEqual(candidates.values.map((item) => item.value).sort(), ["ALPHA", "BETA"]);

  const defaults = defaultUiPreferences();
  assert.deepEqual(defaults.filterPresets, []);
  const preset = { schemaVersion: 1, id: "overview:one", viewerId: "databaseOverview", tabId: "issueList", name: "July Open", query: { filters: { status: { values: ["Open"] } }, dateMode: "activity", dateRange: july, pageSize: 25 }, updatedAt: "2026-08-03T00:00:00.000Z" };
  updateUiPreferences(tempRoot, "filterPresets", [preset, { ...preset, id: "duplicate" }]);
  const loaded = loadUiPreferences(tempRoot);
  assert.equal(loaded.preferences.filterPresets.length, 1);
  assert.equal(loaded.preferences.filterPresets[0].name, "July Open");
  assert.equal(fs.existsSync(path.join(tempRoot, "app-data", "settings", "ui-preferences.json")), true);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.58 date range, Excel filtering, selection, content diff, comments, and preset tests passed.");
