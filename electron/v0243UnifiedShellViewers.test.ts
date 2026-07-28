import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "./currentStateArchive.js";
import {
  listDatabaseIssues,
  listDatabaseUsers,
  loadDatabaseIssue,
  loadDatabaseOverview,
  loadDatabaseUser,
  runDatabaseHealthCheck
} from "./databaseViewer.js";

const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const layoutSource = fs.readFileSync(path.join(root, "src", "components", "AppLayout.tsx"), "utf8");
const debugSource = fs.readFileSync(path.join(root, "src", "components", "DebugLogPanel.tsx"), "utf8");
const sidebarSource = fs.readFileSync(path.join(root, "src", "components", "Sidebar.tsx"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");

for (const route of ["/connections", "/database", "/collection", "/issues", "/users", "/activity-stream-probe", "/jira-probe", "/settings"]) {
  assert.match(appSource, new RegExp(`path="${route.replace("/", "\\/")}"`), `route must exist: ${route}`);
}
assert.match(appSource, /Navigate to="\/collection"/, "legacy collection routes must redirect");
assert.match(appSource, /Navigate to="\/issues"/, "legacy Jira analysis route must redirect to Issue Viewer");
assert.match(sidebarSource, /總覽 \/ Overview/);
assert.match(sidebarSource, /資料作業 \/ Collection/);
assert.match(sidebarSource, /檢視器 \/ Viewers/);
assert.match(sidebarSource, /進階工具 \/ Advanced Tools/);
assert.match(layoutSource, /warningCount/);
assert.match(layoutSource, /line\.includes\("\[WARN\]"\) \|\| line\.includes\("\[ERROR\]"\)/);
assert.match(debugSource, /目前沒有除錯日誌/);
assert.match(debugSource, /Auto Scroll/);
assert.match(debugSource, /role="dialog"/);
assert.match(mainSource, /currentReadableDatabasePath/);
assert.match(mainSource, /database-viewer:overview/);
assert.match(mainSource, /database-viewer:get-issue/);
assert.match(mainSource, /database-viewer:get-user/);

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 2, "v0.2.43 must not change the schema version");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0243-"));
const databasePath = path.join(tempRoot, "viewer.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.43-test",
    binding: {
      serverIdentity: "synthetic-server-id",
      baseUrlNormalized: "https://jira.example.invalid"
    },
    now: "2026-07-28T00:00:00.000Z",
    databaseId: "synthetic-v0243-db"
  });
  const overview = loadDatabaseOverview(databasePath);
  const overviewDatabase = overview.database as Record<string, unknown>;
  assert.equal(overviewDatabase.database_id, "synthetic-v0243-db");
  assert.equal(overviewDatabase.schema_version, 2);
  assert.equal(overview.counts.totalIssues, 0);
  assert.equal(listDatabaseIssues(databasePath).total, 0);
  assert.equal(listDatabaseUsers(databasePath).total, 0);
  assert.deepEqual(loadDatabaseIssue(databasePath, " demo-42 "), { found: false, issueKey: "DEMO-42" });
  assert.throws(() => loadDatabaseIssue(databasePath, "invalid"), /INVALID_JIRA_ISSUE_KEY/);
  assert.throws(() => loadDatabaseUser(databasePath, " "), /STABLE_USER_ID_REQUIRED/);
  assert.equal(runDatabaseHealthCheck(databasePath).status, "healthy");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.43 unified App Shell and local-only Viewer tests passed.");
