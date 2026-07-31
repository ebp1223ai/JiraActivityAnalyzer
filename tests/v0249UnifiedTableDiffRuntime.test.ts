import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { queryDatabaseDistinctValues, queryDatabaseIssueEvents } from "../electron/databaseViewer.js";
import { createPersistentDiagnostics } from "../electron/persistentDiagnostics.js";
import { normalizeUiPreferences } from "../electron/uiPreferences.js";
import { compactDiff, normalizeActivityChange } from "../src/utils/normalizedChange.js";
import { clampColumnWidth, normalizeTablePreferences } from "../src/utils/tablePreferences.js";

const root = process.cwd();
const databaseTableSource = fs.readFileSync(path.join(root, "src", "components", "DatabaseIssueTable.tsx"), "utf8");
const sqliteTableSource = fs.readFileSync(path.join(root, "src", "components", "SqliteDataTable.tsx"), "utf8");
const issueViewerSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const userViewerSource = fs.readFileSync(path.join(root, "src", "routes", "UserViewerPage.tsx"), "utf8");
const backendSource = fs.readFileSync(path.join(root, "electron", "databaseViewer.ts"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.53 requires Current-State schema v3 for Worklogs");
assert.match(databaseTableSource, /TextColumnFilter/);
assert.doesNotMatch(databaseTableSource, /setDraftText\(\(current\)[\s\S]{0,120}event\.(?:currentTarget|target)\.value/);
assert.match(sqliteTableSource, /TextColumnFilter/);
assert.match(sqliteTableSource, /queryField/);
assert.match(sqliteTableSource, /role="separator"/);
assert.match(issueViewerSource, /queryField: "actor"/);
assert.match(issueViewerSource, /queryField: "action"/);
assert.match(issueViewerSource, /queryField: "source"/);
assert.match(userViewerSource, /id: "diff"/);
assert.match(backendSource, /actor: \{ expression: "e\.actor_display_name"/);
assert.match(backendSource, /action: \{ expression: "e\.event_type"/);
assert.match(backendSource, /source: \{ expression: "e\.source_provenance"/);
assert.match(mainSource, /debugBundleStatus = copyFailures\.length === 0 \? "completed" : "completed_with_errors"/);

const columns = [
  { id: "time", required: true, defaultWidth: 170, minWidth: 140, maxWidth: 240 },
  { id: "actor", defaultWidth: 180 },
  { id: "diff", defaultVisible: true, defaultWidth: 400 }
];
const normalized = normalizeTablePreferences({
  visibleColumns: null,
  columnOrder: ["unknown", "actor"],
  columnWidths: { time: 10, diff: 9999 },
  pageSize: 200
}, columns);
assert.deepEqual(normalized.visibleColumns, ["time", "actor", "diff"]);
assert.deepEqual(normalized.columnOrder, ["actor", "time", "diff"]);
assert.equal(normalized.columnWidths.time, 140);
assert.equal(normalized.columnWidths.diff, 640);
assert.equal(normalized.pageSize, 50);
assert.equal(clampColumnWidth(500, columns[0]), 240);

const legacy = normalizeUiPreferences({
  formatVersion: 1,
  databaseIssueList: null,
  userAllActivityEvents: { visibleColumns: null, columnOrder: null, columnWidths: null, pageSize: null },
  issueActivityStream: { visibleColumns: ["bad"] }
});
assert.equal(legacy.formatVersion, 2);
assert.ok(legacy.databaseIssueList.visibleColumns.includes("issueKey"));
assert.ok(legacy.userAllActivityEvents.visibleColumns.includes("eventTime"));
assert.ok(legacy.userAllActivityEvents.visibleColumns.includes("issueKey"));
assert.ok(legacy.userAllActivityEvents.visibleColumns.includes("eventType"));
assert.equal("issueActivityStream" in legacy, false);

const scalar = normalizeActivityChange({ issueKey: "SYNTH-1", fieldName: "status", before: "\"Open\"", after: "\"Done\"", sourceProvenance: "jira_changelog" });
assert.equal(scalar.diffKind, "scalar");
assert.deepEqual(compactDiff(scalar).map((item) => item.kind), ["removed", "added"]);
const setChange = normalizeActivityChange({ fieldName: "labels", before: "[\"a\",\"b\"]", after: "[\"b\",\"c\"]" });
assert.equal(setChange.diffKind, "set");
assert.deepEqual(compactDiff(setChange).map((item) => [item.kind, item.text]), [["removed", "a"], ["added", "c"]]);
const textChange = normalizeActivityChange({ fieldName: "description", before: "\"same\\nold\\nend\"", after: "\"same\\nnew\\nend\"" });
assert.equal(textChange.diffKind, "text");
assert.ok(compactDiff(textChange).some((item) => item.kind === "removed" && item.text.includes("old")));
assert.ok(compactDiff(textChange).some((item) => item.kind === "added" && item.text.includes("new")));
assert.equal(normalizeActivityChange({ fieldName: "unknown" }).diffKind, "none");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0249-"));
try {
  const logsDir = path.join(tempRoot, "logs");
  const diagnostics = createPersistentDiagnostics({
    logsDir,
    sessionId: "v0249-session",
    appRoot: tempRoot,
    build: { version: "0.2.49-test", buildTime: "test", gitCommit: "test", gitBranch: "test" },
    sanitizeText: (value) => value
  });
  for (let index = 0; index < 5; index += 1) diagnostics.write("renderer", "table_request", { requestId: index });
  diagnostics.close();
  const summary = JSON.parse(fs.readFileSync(diagnostics.summaryPath, "utf8"));
  assert.equal(summary.writerFailed, false);
  assert.equal(diagnostics.snapshot().writerFailed, false);

  const databasePath = path.join(tempRoot, "viewer.sqlite");
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.49-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0249-db",
    now: "2026-07-30T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("jira:issue:SYNTH-1", "native-1", "SYNTH-1", "SYNTH", "2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z");
    db.prepare(`INSERT INTO current_issue_snapshots (
      source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator,
      labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)`)
      .run("jira:issue:SYNTH-1", "Synthetic", "Done", "Task", "Medium", "2026-07-30T00:00:00.000Z", "2026-07-30T00:00:00.000Z");
    db.prepare(`INSERT INTO activity_events (
      id, source_object_id, event_type, event_time, actor_account_id, actor_display_name,
      field_id, field_name, from_value_json, to_value_json, source_record_id,
      event_identity_hash, event_identity_policy_version, identity_key_type,
      jira_native_source_id, source_provenance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 'jira_changelog_history_item', ?, ?, ?)`)
      .run("event-1", "jira:issue:SYNTH-1", "status_changed", "2026-07-30T01:00:00.000Z", "user-1", "測試使用者",
        "status", "Status", "\"Open\"", "\"Done\"", "history-1:0",
        crypto.createHash("sha256").update("event-1").digest("hex"), "history-1", "jira_changelog", "2026-07-30T01:00:00.000Z");
  } finally {
    db.close();
  }
  const filtered = queryDatabaseIssueEvents(databasePath, "SYNTH-1", {
    page: 1,
    pageSize: 25,
    sort: { field: "eventTime", direction: "asc" },
    filters: {
      actor: { values: ["測試使用者"] },
      action: { values: ["status_changed"] },
      field: { values: ["Status"] },
      source: { values: ["jira_changelog"] }
    }
  });
  assert.equal(filtered.filteredCount, 1);
  assert.equal(filtered.rows[0].fieldId, "status");
  assert.equal(filtered.rows[0].sourceRecordId, "history-1:0");
  const actors = queryDatabaseDistinctValues(databasePath, { source: "issueEvents", subjectId: "SYNTH-1", field: "actor", search: "測試", limit: 20 });
  assert.deepEqual(actors.values, [{ value: "測試使用者", count: 1 }]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.49 unified table, filter contract, diff, preferences, and diagnostics tests passed.");
