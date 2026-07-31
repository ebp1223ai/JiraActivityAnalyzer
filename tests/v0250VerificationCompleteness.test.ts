import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { queryDatabaseIssueEvents } from "../electron/databaseViewer.js";
import { loadUiPreferences, normalizeUiPreferences, updateUiPreferences } from "../electron/uiPreferences.js";
import { createPersistentDiagnostics } from "../electron/persistentDiagnostics.js";
import { createImeFilterState, reduceImeFilterState } from "../src/utils/imeFilterState.js";
import { compactDiff, normalizeActivityChange } from "../src/utils/normalizedChange.js";
import { queryFromTablePreferences } from "../src/utils/preferenceQuery.js";
import { readableContentText } from "../src/utils/richContent.js";
import { normalizeTablePreferences } from "../src/utils/tablePreferences.js";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.53 requires Current-State schema v3 for Worklogs");
assert.match(source("src/components/TextColumnFilter.tsx"), /reduceImeFilterState/);
assert.match(source("src/routes/IssueViewerPage.tsx"), /recordTableRequest\("completed"[\s\S]+tableId: "issueActivityEvents"/);
assert.match(source("src/routes/UserViewerPage.tsx"), /tableId = tab === "Related Issues"/);
assert.match(source("electron/databaseViewer.ts"), /FILTER_UNSUPPORTED_FIELD:\$\{field\}/);
assert.match(source("electron/main.ts"), /debugBundleStatus = copyFailures\.length === 0 \? "completed" : "completed_with_errors"/);

let ime = createImeFilterState("");
ime = reduceImeFilterState(ime, { type: "composition-start" });
for (let index = 0; index < 20; index += 1) {
  ime = reduceImeFilterState(ime, { type: "composition-update", value: `中文${index}` });
  assert.equal(ime.composing, true);
  assert.equal(ime.revision, 0, "composition updates must not become query revisions");
}
ime = reduceImeFilterState(ime, { type: "composition-end", value: "中文完成" });
assert.equal(ime.draft, "中文完成");
assert.equal(ime.composing, false);
assert.equal(ime.revision, 1);
ime = reduceImeFilterState(ime, { type: "input", value: "" });
assert.equal(ime.revision, 2);
assert.equal(reduceImeFilterState(ime, { type: "external", value: null }).draft, "");

const html = readableContentText("<p>安全中文</p><script>alert(1)</script><img alt=\"diagram.png\" src=\"javascript:bad\">", "html");
assert.match(html, /安全中文/);
assert.match(html, /\[Attachment: diagram\.png\]/);
assert.doesNotMatch(html, /alert\(1\)|javascript:/);
const wiki = readableContentText("h2. 標題\n* 項目\n!image.png!\n[Link|https://example.invalid]", "wiki");
assert.match(wiki, /標題/);
assert.match(wiki, /\[Attachment image: image\.png\]/);
const adf = readableContentText({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "ADF 中文" }] }]
}, "adf");
assert.match(adf, /ADF 中文/);
const bounded = readableContentText("x".repeat(250_000), "plain");
assert.ok(bounded.length <= 200_000);
assert.match(bounded, /Content truncated by safety limit/);

const columns = [
  { id: "eventTime", queryField: "eventTime", required: true, defaultWidth: 170, minWidth: 140, maxWidth: 240 },
  { id: "displayName", queryField: "actor", defaultWidth: 180 },
  { id: "diff", queryField: "diff", defaultWidth: 400 }
];
const normalized = normalizeTablePreferences({
  visibleColumns: ["displayName", "unknown"],
  columnOrder: ["unknown", "diff"],
  columnWidths: { eventTime: 1, diff: 9000 },
  pageSize: 100,
  pageIndex: 9,
  sort: { field: "actor", direction: "desc" },
  filters: {
    actor: { text: "中文", values: ["A", "A", "B"] },
    displayName: { text: "must be discarded" },
    diff: null
  }
}, columns);
assert.ok(normalized.visibleColumns.includes("eventTime"));
assert.deepEqual(normalized.columnOrder, ["diff", "eventTime", "displayName"]);
assert.equal(normalized.columnWidths.eventTime, 140);
assert.equal(normalized.columnWidths.diff, 640);
assert.equal(normalized.pageSize, 100);
assert.equal(normalized.pageIndex, 9);
assert.deepEqual(normalized.sort, { field: "actor", direction: "desc" });
assert.deepEqual(normalized.filters?.actor?.values, ["A", "B"]);
assert.equal("displayName" in (normalized.filters ?? {}), false);

const restored = queryFromTablePreferences(
  { page: 1, pageSize: 25, sort: null, filters: {} },
  normalized
);
assert.equal(restored.page, 9);
assert.equal(restored.pageSize, 100);
assert.deepEqual(restored.sort, { field: "actor", direction: "desc" });

const scalar = normalizeActivityChange({
  issueKey: "SYNTH-1",
  fieldId: "status",
  fieldName: "Status",
  before: "\"Open\"",
  after: "\"Done\"",
  sourceRecordId: "history-1:0",
  sourceProvenance: "jira_changelog"
});
const changelogEquivalent = normalizeActivityChange({
  issueKey: "SYNTH-1",
  fieldId: "status",
  fieldName: "Status",
  before: "Open",
  after: "Done",
  changelogId: "history-1",
  historyItemIndex: 0,
  source: "jira_changelog"
});
assert.equal(scalar.beforeText, changelogEquivalent.beforeText);
assert.equal(scalar.afterText, changelogEquivalent.afterText);
assert.deepEqual(compactDiff(scalar).map((item) => item.kind), ["removed", "added"]);
const setDiff = normalizeActivityChange({ fieldName: "labels", before: "[\"one\",\"two\"]", after: "[\"two\",\"three\"]" });
assert.deepEqual(compactDiff(setDiff).map((item) => [item.kind, item.text]), [["removed", "one"], ["added", "three"]]);
assert.equal(normalizeActivityChange({ fieldName: "missing" }).diffKind, "none");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0250-"));
try {
  const corruptPath = path.join(tempRoot, "app-data", "settings", "ui-preferences.json");
  fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
  fs.writeFileSync(corruptPath, "{corrupt", "utf8");
  const corrupt = loadUiPreferences(tempRoot);
  assert.match(corrupt.warning, /損毀/);
  assert.equal(corrupt.preferences.formatVersion, 2);

  updateUiPreferences(tempRoot, "issueActivityEvents", {
    ...normalized,
    filters: { actor: { values: ["測試使用者"] } }
  });
  updateUiPreferences(tempRoot, "issueActivityEvents", {
    ...normalized,
    pageIndex: 2,
    filters: { action: { values: ["status_changed"] } }
  });
  const persisted = loadUiPreferences(tempRoot);
  assert.equal(persisted.preferences.issueActivityEvents.pageIndex, 2);
  assert.deepEqual(persisted.preferences.issueActivityEvents.filters.action.values, ["status_changed"]);
  assert.equal(fs.readdirSync(path.dirname(corruptPath)).some((name) => name.endsWith(".tmp")), false);

  const legacy = normalizeUiPreferences({
    formatVersion: 1,
    issueActivityStream: { visibleColumns: ["bad"] },
    userAllActivityEvents: null
  });
  assert.equal(legacy.formatVersion, 2);
  assert.equal("issueActivityStream" in legacy, false);
  assert.ok(legacy.userAllActivityEvents.visibleColumns.includes("diff"));
  assert.equal(legacy.userAllActivityEvents.visibleColumns.includes("before"), false);

  const diagnostics = createPersistentDiagnostics({
    logsDir: path.join(tempRoot, "logs"),
    sessionId: "v0250-session",
    appRoot: tempRoot,
    build: { version: "0.2.50-test", buildTime: "test", gitCommit: "test", gitBranch: "test" },
    sanitizeText: (value) => value
  });
  for (let index = 0; index < 10; index += 1) diagnostics.write("renderer", "table_request", {
    requestId: index,
    tableId: "issueActivityEvents",
    filterIds: ["actor"]
  });
  diagnostics.close();
  assert.equal(JSON.parse(fs.readFileSync(diagnostics.summaryPath, "utf8")).writerFailed, false);

  const databasePath = path.join(tempRoot, "viewer.sqlite");
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.50-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0250-db",
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
    const insert = db.prepare(`INSERT INTO activity_events (
      id, source_object_id, event_type, event_time, actor_account_id, actor_display_name,
      field_id, field_name, from_value_json, to_value_json, source_record_id,
      event_identity_hash, event_identity_policy_version, identity_key_type,
      jira_native_source_id, source_provenance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 'jira_changelog_history_item', ?, ?, ?)`);
    for (let index = 0; index < 30; index += 1) {
      const id = `event-${String(index).padStart(2, "0")}`;
      const eventType = index % 2 ? "status_changed" : "field_changed";
      insert.run(
        id,
        "jira:issue:SYNTH-1",
        eventType,
        `2026-07-30T${String(Math.floor(index / 2)).padStart(2, "0")}:${String((index % 2) * 30).padStart(2, "0")}:00.000Z`,
        "user-1",
        "測試使用者",
        "status",
        "Status",
        "\"Open\"",
        "\"Done\"",
        `history-${index}:0`,
        crypto.createHash("sha256").update(id).digest("hex"),
        `history-${index}`,
        index === 29 ? "" : "jira_changelog",
        "2026-07-30T00:00:00.000Z"
      );
    }
  } finally {
    db.close();
  }

  const firstPage = queryDatabaseIssueEvents(databasePath, "SYNTH-1", {
    page: 1,
    pageSize: 25,
    sort: { field: "eventTime", direction: "asc" },
    filters: { actor: { values: ["測試使用者"] } }
  });
  const secondPage = queryDatabaseIssueEvents(databasePath, "SYNTH-1", {
    page: 2,
    pageSize: 25,
    sort: { field: "eventTime", direction: "asc" },
    filters: { actor: { values: ["測試使用者"] } }
  });
  assert.equal(firstPage.filteredCount, 30);
  assert.equal(firstPage.rows.length, 25);
  assert.equal(secondPage.rows.length, 5);
  assert.equal(new Set([...firstPage.rows, ...secondPage.rows].map((row) => row.eventId)).size, 30);

  const multiOr = queryDatabaseIssueEvents(databasePath, "SYNTH-1", {
    page: 1,
    pageSize: 100,
    filters: { action: { values: ["status_changed", "field_changed"] } }
  });
  assert.equal(multiOr.filteredCount, 30, "multi-select values use OR within a field");
  const combinedAnd = queryDatabaseIssueEvents(databasePath, "SYNTH-1", {
    page: 1,
    pageSize: 100,
    filters: {
      actor: { values: ["測試使用者"] },
      action: { values: ["status_changed"] },
      before: { text: "Open" },
      after: { text: "Done" },
      diff: { text: "Open" }
    }
  });
  assert.equal(combinedAnd.filteredCount, 15, "different fields combine with AND");
  assert.throws(
    () => queryDatabaseIssueEvents(databasePath, "SYNTH-1", { filters: { displayName: { text: "測試" } } }),
    /FILTER_UNSUPPORTED_FIELD:displayName/
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.50 verification, preference, rich-content, diagnostics, and SQLite contracts passed.");
