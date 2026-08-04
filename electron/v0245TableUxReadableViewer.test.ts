import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "./currentStateArchive.js";
import { listDatabaseIssues, loadDatabaseIssueDistributions, normalizeIssueViewerPayload } from "./databaseViewer.js";
import { defaultUiPreferences, loadUiPreferences, updateUiPreferences } from "./uiPreferences.js";

const root = process.cwd();
const dashboardSource = fs.readFileSync(path.join(root, "src", "routes", "DashboardPage.tsx"), "utf8");
const tableSource = fs.readFileSync(path.join(root, "src", "components", "DatabaseIssueTable.tsx"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const viewerSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src", "components", "JiraContent.tsx"), "utf8");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.53 requires Current-State schema v3 for Worklogs");
assert.doesNotMatch(dashboardSource, /Open Folder|databaseViewer\?\.openFolder/);
assert.match(dashboardSource, /Copy Path|複製路徑/);
assert.match(tableSource, /DATABASE_ISSUE_PAGE_SIZES/);
assert.match(tableSource, /Filtered/);
assert.match(analysisSource, /analysis-setup-start-v245/);
assert.match(analysisSource, /analysis-setup-end-v245/);
assert.match(analysisSource, /Remote Links \(Locked\)/);
assert.doesNotMatch(analysisSource, /title="Timeline Event Filters"/);
assert.doesNotMatch(analysisSource, /timeline-header-filters/);
assert.doesNotMatch(viewerSource, /JSON\.stringify\(item\.items|JSON\.stringify\(item\.body/);
assert.doesNotMatch(contentSource, /dangerouslySetInnerHTML/);
assert.match(contentSource, /case "script"/);
assert.match(contentSource, /case "img"/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0245-"));
const databasePath = path.join(tempRoot, "query-fixture.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.45-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0245-db",
    now: "2026-07-29T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    const insertObject = db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const insertSnapshot = db.prepare(`INSERT INTO current_issue_snapshots (
      source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator,
      labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, '[]', '[]', '[]', NULL, NULL, ?, ?, ?)`);
    db.exec("BEGIN");
    for (let index = 1; index <= 225; index += 1) {
      const issueKey = `SYNTH-${String(index).padStart(4, "0")}`;
      const sourceId = `jira:issue:${issueKey}`;
      const day = String((index % 28) + 1).padStart(2, "0");
      const timestamp = `2026-07-${day}T10:00:00.000Z`;
      insertObject.run(sourceId, `native-${index}`, issueKey, index % 2 ? "SYNTH" : "TOOLS", timestamp, timestamp);
      insertSnapshot.run(
        sourceId, `Synthetic issue ${String(index).padStart(4, "0")}`,
        index % 3 ? "Open" : "Done", index % 2 ? "Task" : "Bug", index % 5 ? "Medium" : null,
        index % 4 ? "Sample Assignee" : null, "Sample Reporter", "Sample Creator", timestamp,
        JSON.stringify({ fields: { created: timestamp } }), timestamp
      );
    }
    db.exec("COMMIT");
  } finally {
    db.close();
  }

  const first = listDatabaseIssues(databasePath, { page: 1, pageSize: 50, sort: { field: "issueKey", direction: "asc" }, filters: {} });
  assert.equal(first.databaseTotal, 225);
  assert.equal(first.filteredTotal, 225);
  assert.equal(first.items.length, 50);
  assert.equal(first.pageCount, 5);
  assert.equal(first.items[0].issueKey, "SYNTH-0001");
  const last = listDatabaseIssues(databasePath, { page: 5, pageSize: 50, sort: { field: "issueKey", direction: "asc" }, filters: {} });
  assert.equal(last.items.length, 25);
  assert.equal(last.items[24].issueKey, "SYNTH-0225");
  const filtered = listDatabaseIssues(databasePath, {
    page: 1, pageSize: 25, sort: { field: "summary", direction: "desc" },
    filters: { projectKey: { values: ["TOOLS"] }, status: { values: ["Done"] } }
  });
  assert(filtered.filteredTotal > 0 && filtered.filteredTotal < 225);
  assert(filtered.items.every((item) => item.projectKey === "TOOLS" && item.status === "Done"));
  assert.throws(() => listDatabaseIssues(databasePath, { page: 1, pageSize: 50, sort: { field: "issueKey; DROP TABLE source_objects" }, filters: {} }), /INVALID_SORT_FIELD/);
  assert.throws(() => listDatabaseIssues(databasePath, { page: 1, pageSize: 50, sort: { field: "issueKey", direction: "asc" }, filters: { unknown: { value: "x" } } }), /FILTER_UNSUPPORTED_FIELDS/);
  const distributions = loadDatabaseIssueDistributions(databasePath);
  assert.equal(distributions.total, 225);
  assert.equal(distributions.priority.reduce((sum, item) => sum + item.count, 0), 225);
  assert(distributions.priority.some((item) => item.value === "未設定"));

  const initial = loadUiPreferences(tempRoot);
  assert.deepEqual(initial.preferences, defaultUiPreferences());
  updateUiPreferences(tempRoot, "databaseIssueList", {
    ...initial.preferences.databaseIssueList,
    visibleColumns: ["issueKey", "summary"],
    columnOrder: ["summary", "issueKey"],
    columnWidths: { summary: 420 },
    pageSize: 100
  });
  const persisted = loadUiPreferences(tempRoot);
  assert.equal(persisted.preferences.databaseIssueList.pageSize, 100);
  assert.equal(persisted.preferences.databaseIssueList.columnWidths.summary, 420);
  fs.writeFileSync(persisted.filePath, "{invalid", "utf8");
  const recovered = loadUiPreferences(tempRoot);
  assert.match(recovered.warning, /corrupt|損毀/i);
  assert.equal(recovered.preferences.databaseIssueList.pageSize, 200);

  const normalized = normalizeIssueViewerPayload({
    issue: {
      fields: { description: "Fallback", comment: { comments: [{ id: "c1", author: { displayName: "Sample" }, created: "2026-01-01", updated: "2026-01-02", body: "* safe comment" }] } },
      renderedFields: { description: "<p><strong>Readable</strong></p><script>blocked()</script><img src='https://example.invalid/track'>" }
    },
    changelog: [{ id: "h1", created: "2026-01-02", author: { displayName: "Sample" }, items: [{ field: "status", fromString: "Open", toString: "Done" }] }]
  }, { payloadFormatVersion: 1, payloadSavedAt: "2026-01-02" });
  assert.equal(normalized.description.format, "html");
  assert.equal(normalized.comments.records[0].edited, true);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.45 table UX, query safety, preferences, Step 1, and readable Viewer tests passed.");
