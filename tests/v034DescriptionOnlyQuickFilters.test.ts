import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { queryDatabaseIssueEvents, queryDatabaseIssueEventsProgressive, queryDatabaseUserEventsProgressive } from "../electron/databaseViewer.js";
import { runPendingAnalysisExport } from "../electron/pendingAnalysisExport.js";
import { normalizeUiPreferences } from "../electron/uiPreferences.js";
import { PENDING_ANALYSIS_SCHEMA_VERSION, assertPendingAnalysisDocument } from "../shared/pendingAnalysisContract.js";
import { isCanonicalDescriptionField, type DiffQuickFilters } from "../shared/viewerEfficiency.js";

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const off: DiffQuickFilters = { hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false, hideBeforeUnavailable: false };
const allOn: DiffQuickFilters = { hideNoChange: true, hideZeroAdded: true, hideZeroDeleted: true, hideBeforeUnavailable: true };
const combinations: DiffQuickFilters[] = [off,
  { ...off, hideNoChange: true }, { ...off, hideZeroAdded: true }, { ...off, hideZeroDeleted: true },
  { ...off, hideBeforeUnavailable: true }, allOn];

function buildFixture(root: string) {
  const databasePath = path.join(root, "mixed.sqlite");
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.3.4-test", binding: { serverIdentity: "synthetic-v034", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: "synthetic-v034-db", now: "2026-08-10T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("BEGIN");
    db.prepare("INSERT INTO source_objects (id,jira_issue_id,issue_key,project_key,first_saved_at,created_at) VALUES (?,?,?,?,?,?)")
      .run("jira:issue:SYNTH-340", "native-340", "SYNTH-340", "SYNTH", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO current_issue_snapshots (source_object_id,summary,status,issue_type,priority,resolution,assignee,reporter,creator,labels_json,components_json,versions_json,start_date,due_date,jira_updated_at,snapshot_json,snapshot_updated_at) VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,'[]','[]','[]',NULL,NULL,?,'{}',?)")
      .run("jira:issue:SYNTH-340", "Synthetic mixed quick filters", "Open", "Task", "Medium", "2026-08-10T00:00:00.000Z", "2026-08-10T00:00:00.000Z");
    const insert = db.prepare("INSERT INTO activity_events (id,source_object_id,event_type,event_time,actor_account_id,actor_display_name,field_id,field_name,from_value_json,to_value_json,source_record_id,event_identity_hash,event_identity_policy_version,identity_key_type,jira_native_source_id,source_provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,3,'jira_native',?,?,?)");
    let sequence = 0;
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const rows: Array<[string, string, string | null, string, string | null, string | null, string]> = [
        ["desc-pass", "field_changed", "description", "Description", "old", "new", "jira_changelog"],
        ["desc-unchanged", "field_changed", "description", "Description", "same", "same", "jira_changelog"],
        ["desc-before", "field_changed", "description", "Description", null, "new", "jira_changelog"],
        ["desc-zero-added", "field_changed", "description", "Description", "old", "", "jira_changelog"],
        ["desc-zero-deleted", "field_changed", "description", "Description", "", "new", "jira_changelog"],
        ["desc-fallback", "field_changed", null, "Description", "before", "after", "jira_changelog"],
        ["comment-created", "comment_created", "comment", "Comment", null, "created body", "jira_comment"],
        ["comment-updated", "comment_updated", "comment", "Comment", "old body", "new body", "jira_comment"],
        ["comment-unavailable", "comment_updated", "comment", "Comment", null, null, "jira_comment"],
        ["custom-exact", "field_changed", "customfield_10001", "Description", "same", "same", "jira_changelog"],
        ["custom-containing", "field_changed", "customfield_10002", "Long Description Notes", "same", "same", "jira_changelog"],
        ["status-unchanged", "field_changed", "status", "Status", "Open", "Open", "jira_changelog"]
      ];
      for (const [kind, eventType, fieldId, fieldName, before, after, provenance] of rows) {
        const id = `v034-${String(cycle).padStart(2, "0")}-${kind}`;
        const nativeId = `native-${sequence}`;
        const sourceRecordId = provenance === "jira_changelog" ? `${nativeId}:0` : nativeId;
        const time = new Date(Date.UTC(2026, 7, 10, 0, sequence)).toISOString();
        insert.run(id, "jira:issue:SYNTH-340", eventType, time, "user-034", "Synthetic User", fieldId, fieldName,
          before, after, sourceRecordId, sha(id), nativeId, provenance, time);
        sequence += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; } finally { db.close(); }
  return databasePath;
}

async function run() {
  assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
  assert.equal(PENDING_ANALYSIS_SCHEMA_VERSION, "0.3.3-draft.1", "Compact Export schema must not change in v0.3.4");
  assert.equal(isCanonicalDescriptionField(" DESCRIPTION ", "ignored"), true);
  assert.equal(isCanonicalDescriptionField(null, " Description "), true);
  assert.equal(isCanonicalDescriptionField("comment", "Description"), false);
  assert.equal(isCanonicalDescriptionField("customfield_10001", "Description"), false);
  assert.equal(isCanonicalDescriptionField(null, "Long Description Notes"), false);
  assert.equal(isCanonicalDescriptionField(null, "comments"), false);
  const hydrated = normalizeUiPreferences({ userAllActivityEvents: { diffQuickFilters: allOn } });
  assert.deepEqual(hydrated.userAllActivityEvents.diffQuickFilters, allOn, "Preferences stay checked; semantics are Description-only");
  const ui = fs.readFileSync(path.resolve("src/components/DiffQuickFilters.tsx"), "utf8");
  assert.equal(ui.includes("Description Diff Quick Filters / Description 差異快速篩選"), true);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v034-"));
  const appRoot = path.join(tempRoot, "app-root");
  const databasePath = buildFixture(tempRoot);
  const baseQuery = { page: 1, pageSize: 25, sort: { field: "eventTime", direction: "asc" }, filters: {}, dateRange: { shortcut: "all", startDate: "", endDate: "" }, diffQuickFilters: off };
  try {
    for (const diffQuickFilters of combinations) {
      const commentOnly = queryDatabaseIssueEvents(databasePath, "SYNTH-340", { ...baseQuery, filters: { fieldName: { values: ["Comment"] } }, diffQuickFilters });
      assert.equal(commentOnly.filteredCount, 18, "Comment-only count must ignore every Description Quick Filter combination");
      assert.equal(commentOnly.rows.length, 18);
    }

    const mixedQuery = { ...baseQuery, filters: { fieldName: { values: ["Description", "Comment"] } }, diffQuickFilters: allOn };
    const directPage1 = queryDatabaseIssueEvents(databasePath, "SYNTH-340", mixedQuery);
    const directPage2 = queryDatabaseIssueEvents(databasePath, "SYNTH-340", { ...mixedQuery, page: 2 });
    assert.equal(directPage1.filteredCount, 36);
    assert.equal(directPage1.rows.length, 25);
    assert.equal(directPage2.rows.length, 11);
    const directIds = [...directPage1.rows, ...directPage2.rows].map((row) => String(row.eventId));
    assert.equal(new Set(directIds).size, 36);
    assert.equal(directIds.filter((id) => id.includes("comment-")).length, 18, "all Comment records remain");
    assert.equal(directIds.filter((id) => id.includes("custom-exact")).length, 6, "non-Description ID wins over display name");
    assert.equal(directIds.some((id) => /desc-(unchanged|before|zero-added|zero-deleted)/.test(id)), false);

    const issuePage1 = await queryDatabaseIssueEventsProgressive(databasePath, "SYNTH-340", mixedQuery, { requestId: "v034-issue-1" });
    const issuePage2 = await queryDatabaseIssueEventsProgressive(databasePath, "SYNTH-340", { ...mixedQuery, page: 2 }, { requestId: "v034-issue-2" });
    const issueIds = [...issuePage1.rows, ...issuePage2.rows].map((row) => String(row.eventId));
    assert.deepEqual(issueIds, directIds, "SQL count/rows and progressive pagination must use the same predicate");
    const scope = { kind: "selected-users" as const, userIds: ["user-034"] };
    const userPage1 = await queryDatabaseUserEventsProgressive(databasePath, scope, mixedQuery, { requestId: "v034-user-1" });
    const userPage2 = await queryDatabaseUserEventsProgressive(databasePath, scope, { ...mixedQuery, page: 2 }, { requestId: "v034-user-2" });
    assert.deepEqual([...userPage1.rows, ...userPage2.rows].map((row) => String(row.eventId)), directIds);

    const issueExport = await runPendingAnalysisExport({ exportId: "v034-issue-export", sourceView: "ISSUE_ACTIVITY_EVENTS", query: mixedQuery, issueKey: "SYNTH-340", expectedFilteredCount: 36, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.4" });
    const userExport = await runPendingAnalysisExport({ exportId: "v034-user-export", sourceView: "USER_ALL_ACTIVITY_EVENTS", query: mixedQuery, userScope: scope, expectedFilteredCount: 36, expectedDatabaseIdentity: "", databasePath, appRoot, appVersion: "0.3.4" });
    const issueDocument = JSON.parse(fs.readFileSync(issueExport.filePath, "utf8"));
    const userDocument = JSON.parse(fs.readFileSync(userExport.filePath, "utf8"));
    assertPendingAnalysisDocument(issueDocument);
    assertPendingAnalysisDocument(userDocument);
    assert.deepEqual(issueDocument.records.map((record: any) => record.reference.activityEventId), directIds);
    assert.deepEqual(userDocument.records.map((record: any) => record.reference.activityEventId), directIds);
    assert.deepEqual(issueDocument.records, userDocument.records, "Issue/User Viewer must share record serialization and hashes");
    assert.deepEqual(issueDocument.querySnapshot.query.diffQuickFilters, allOn);
    assert.equal(issueDocument.counts.filteredCountAtStart, 36);
    assert.equal(issueDocument.counts.exportedCount, 36);
    assert.equal(issueDocument.counts.diffCoverageComplete, true);
    assert.equal(new Set(issueDocument.records.map((record: any) => record.reference.evidenceId)).size, 36);
    assert.equal(issueDocument.records.filter((record: any) => record.reference.fieldId === "comment").length, 18);
    assert.ok(issueDocument.records.filter((record: any) => record.reference.fieldId === "comment").every((record: any) => record.diff.beforeAvailability === "UNAVAILABLE" || record.diff.beforeAvailability === "AVAILABLE"));
    assert.doesNotMatch(JSON.stringify(issueDocument), /beforeRaw|afterRaw|fromString|toString|oldValue|newValue/);
    console.log("v0.3.4 Description-only Quick Filters tests passed", JSON.stringify({ candidates: 54, filtered: 36, comments: 18, pages: 2, schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION }));
  } finally { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
