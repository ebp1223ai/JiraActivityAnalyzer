import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { queryDatabaseIssueEventsProgressive, queryDatabaseUserEventsProgressive } from "../electron/databaseViewer.js";
import { runPendingAnalysisExport } from "../electron/pendingAnalysisExport.js";
import { PENDING_ANALYSIS_CONTRACT_STATUS, PENDING_ANALYSIS_SCHEMA_NAME, PENDING_ANALYSIS_SCHEMA_VERSION, assertNoEmbeddedFullContent, canonicalJson, sha256Canonical } from "../shared/pendingAnalysisContract.js";

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

async function run() {
  assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.3.0 must not migrate SQLite schema");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v030-export-"));
  const appRoot = path.join(root, "portable-root");
  const databasePath = path.join(root, "synthetic.sqlite");
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.3.0-test", binding: { serverIdentity: "synthetic-jira-identity", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: "synthetic-v030-database", now: "2026-08-07T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("BEGIN");
    db.prepare("INSERT INTO source_objects (id,jira_issue_id,issue_key,project_key,first_saved_at,created_at) VALUES (?,?,?,?,?,?)")
      .run("jira:issue:SYNTH-300", "native-300", "SYNTH-300", "SYNTH", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO current_issue_snapshots (source_object_id,summary,status,issue_type,priority,resolution,assignee,reporter,creator,labels_json,components_json,versions_json,start_date,due_date,jira_updated_at,snapshot_json,snapshot_updated_at) VALUES (?,?,?,?,?,NULL,?,?,?, ?,?,'[]',NULL,NULL,?,'{}',?)")
      .run("jira:issue:SYNTH-300", "UTF-8 測試 / 特殊字元 <>&\"", "進行中", "Task", "High", "account-assignee", "account-reporter", null, '["中文","alpha"]', '[{"name":"核心"}]', "2026-08-07T00:00:00.000Z", "2026-08-07T00:00:00.000Z");
    const event = db.prepare("INSERT INTO activity_events (id,source_object_id,event_type,event_time,actor_account_id,actor_display_name,field_id,field_name,from_value_json,to_value_json,source_record_id,event_identity_hash,event_identity_policy_version,identity_key_type,jira_native_source_id,source_provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,3,'jira_native',?,'jira_changelog',?)");
    for (let index = 0; index < 240; index += 1) {
      const id = `stable-event-${String(index).padStart(4, "0")}`;
      const target = index % 3 !== 0;
      const before = index % 11 === 0 ? null : JSON.stringify({ text: `之前 ${index}`, lines: ["a", "b"] });
      const after = JSON.stringify({ text: `之後 ${index} ✓`, empty: index % 7 === 0 ? "" : null });
      event.run(id, "jira:issue:SYNTH-300", "field_changed", new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(), target ? "target-user" : "other-user", target ? "測試使用者" : "Other", "description", "Description", before, after, `history-${index}:0`, sha(id), `history-${index}`, "2026-08-07T00:00:00.000Z");
    }
    db.exec("COMMIT");
  } finally { db.close(); }

  const query = { page: 2, pageSize: 50, sort: { field: "eventTime", direction: "desc" }, filters: {}, dateRange: { shortcut: "all", startDate: "", endDate: "" }, diffQuickFilters: { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false, hideBeforeUnavailable: false } };
  const scope = { kind: "selected-users" as const, userIds: ["target-user"] };
  const userView = await queryDatabaseUserEventsProgressive(databasePath, scope, query, { requestId: "v030-user-parity" });
  const issueView = await queryDatabaseIssueEventsProgressive(databasePath, "SYNTH-300", query, { requestId: "v030-issue-parity" });
  assert.equal(userView.filteredCount, 160);
  assert.equal(issueView.filteredCount, 240);

  const userExport = await runPendingAnalysisExport({ exportId: "11111111-2222-4333-8444-555555555555", sourceView: "USER_ALL_ACTIVITY_EVENTS", query, userScope: scope, expectedFilteredCount: userView.filteredCount, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.2" });
  assert.ok(userExport.filePath.startsWith(path.join(appRoot, "exports", "pending-analysis")));
  assert.equal(fs.existsSync(`${userExport.filePath}.partial`), false);
  const userBytes = fs.readFileSync(userExport.filePath);
  assert.equal(crypto.createHash("sha256").update(userBytes).digest("hex"), userExport.sha256);
  const document = JSON.parse(userBytes.toString("utf8"));
  assert.equal(document.schemaName, PENDING_ANALYSIS_SCHEMA_NAME);
  assert.equal(document.schemaVersion, PENDING_ANALYSIS_SCHEMA_VERSION);
  assert.equal(document.contractStatus, PENDING_ANALYSIS_CONTRACT_STATUS);
  assert.equal(document.appVersion, "0.3.2");
  assert.deepEqual(document.exportMetadata, { exportMode: "compact-reference", selfContained: false, fullContentIncluded: false, sourceDatabaseRequiredForFullContent: true });
  assert.equal(document.timezone, "Asia/Taipei");
  assert.equal(document.sourceDatabase.sourceDatabaseId, "synthetic-v030-database");
  assert.equal(document.sourceDatabase.jiraServerHost, "jira.example.invalid");
  assert.equal(document.counts.filteredCountAtStart, 160);
  assert.equal(document.records.length, 160, "entire filtered set, not current page");
  assert.equal(document.integrity.recordsSha256, sha256Canonical(document.records));
  assertNoEmbeddedFullContent(document.records);
  assert.equal(document.records[0].reference.sourceDatabaseId, "synthetic-v030-database");
  assert.equal(document.records[0].reference.activityEventId.startsWith("stable-event-"), true);
  assert.equal(document.records[0].diff.diffText, null);
  assert.equal("analysisContent" in document.records[0], false);
  assert.equal("currentIssueContext" in document.records[0], false);
  assert.doesNotMatch(JSON.stringify(document), /[A-Za-z]:[\\/]|authorization|apiToken|password|cookie/i);
  assert.equal(document.querySnapshot.query.page, undefined);
  assert.equal(document.querySnapshot.query.pageSize, undefined);
  assert.equal(document.querySnapshot.filterSnapshotHash, sha256Canonical({ query: document.querySnapshot.query, subject: document.querySnapshot.subject }));
  assert.ok(document.records.every((record: Record<string, any>) => record.reference.evidenceId.startsWith("pae_") && record.reference.activityEventId && record.integrity.originalEvidenceAvailable));

  const targetQuery = { ...query, filters: { actor: { values: ["測試使用者"] } }, page: 1 };
  const issueTarget = await queryDatabaseIssueEventsProgressive(databasePath, "SYNTH-300", targetQuery, { requestId: "v030-cross-view" });
  assert.equal(issueTarget.filteredCount, userView.filteredCount);
  const issueExport = await runPendingAnalysisExport({ exportId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", sourceView: "ISSUE_ACTIVITY_EVENTS", query: targetQuery, issueKey: "SYNTH-300", expectedFilteredCount: issueTarget.filteredCount, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.2" });
  const issueDocument = JSON.parse(fs.readFileSync(issueExport.filePath, "utf8"));
  assert.deepEqual(issueDocument.records.map((record: any) => canonicalJson(record)), document.records.map((record: any) => canonicalJson(record)), "cross-view event evidence must be identical");

  await assert.rejects(runPendingAnalysisExport({ exportId: "cancelled-run", sourceView: "ISSUE_ACTIVITY_EVENTS", query, issueKey: "SYNTH-300", expectedFilteredCount: issueView.filteredCount, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.2" }, { isCancelled: () => true }), (error: Error & { code?: string }) => error.code === "EXPORT_CANCELLED");
  await assert.rejects(runPendingAnalysisExport({ exportId: "count-mismatch", sourceView: "USER_ALL_ACTIVITY_EVENTS", query, userScope: scope, expectedFilteredCount: userView.filteredCount - 1, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.2" }), (error: Error & { code?: string }) => error.code === "COUNT_EXPORT_MISMATCH");
  let generationTouched = false;
  await assert.rejects(runPendingAnalysisExport({ exportId: "generation-change", sourceView: "ISSUE_ACTIVITY_EVENTS", query, issueKey: "SYNTH-300", expectedFilteredCount: issueView.filteredCount, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.2" }, { onProgress: (progress) => { if (!generationTouched && progress.status === "filtering") { generationTouched = true; const future = new Date(Date.now() + 10_000); fs.utimesSync(databasePath, future, future); } } }), (error: Error & { code?: string }) => error.code === "SOURCE_DATABASE_CHANGED");
    await assert.rejects(runPendingAnalysisExport({ exportId: "empty-empty", sourceView: "ISSUE_ACTIVITY_EVENTS", query: { ...query, filters: { actor: { values: ["missing"] } } }, issueKey: "SYNTH-300", expectedFilteredCount: 1, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.2" }), (error: Error & { code?: string }) => error.code === "NO_FILTERED_RECORDS");
  assert.equal(fs.readdirSync(path.join(appRoot, "exports", "pending-analysis")).some((name) => name.endsWith(".partial")), false);
  fs.rmSync(root, { recursive: true, force: true });
  console.log("v0.3.0 pending-analysis production-path export tests passed", JSON.stringify({ userRecords: 160, issueRecords: 160, schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION }));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
