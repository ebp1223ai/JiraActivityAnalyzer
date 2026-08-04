import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "./currentStateArchive.js";
import { loadDatabaseIssue, loadDatabaseOverview } from "./databaseViewer.js";
import { USER_ANALYSIS_DEFAULTS } from "./analysisDefaults.js";

const root = process.cwd();
const connectionsSource = fs.readFileSync(path.join(root, "src", "routes", "ConnectionsPage.tsx"), "utf8");
const dashboardSource = fs.readFileSync(path.join(root, "src", "routes", "DashboardPage.tsx"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const sessionSource = fs.readFileSync(path.join(root, "src", "state", "SessionStateContext.tsx"), "utf8");
const issueViewerSource = fs.readFileSync(path.join(root, "src", "routes", "IssueViewerPage.tsx"), "utf8");

assert.doesNotMatch(connectionsSource, /selectExistingDatabase|createNewDatabase|Global Data Source Mode|Current Local Database/);
assert.match(connectionsSource, /Jira API 連線設定/);
assert.match(dashboardSource, /selectExistingDatabase/);
assert.match(dashboardSource, /createNewDatabase/);
assert.doesNotMatch(dashboardSource, /databaseViewer\?\.openFolder/);
assert.match(dashboardSource, /totalPayloads/);

for (const title of ["Build Activity Stream", "Select Issues", "Full Fetch", "Validate History", "Save & Export"]) {
  assert.match(analysisSource, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const color of ["#F5D1D3", "#F6D9BF", "#F9E9A5", "#DDD2E8", "#C9E5F4"]) {
  assert.match(analysisSource, new RegExp(color, "i"));
}
assert.match(analysisSource, /role="tablist"/);
assert.match(analysisSource, /role="tab"/);
assert.match(analysisSource, /ArrowLeft/);
assert.match(analysisSource, /delayBetweenRoundsMs: 5000/);
assert.match(analysisSource, /startDate: "2026-01-01"/);
assert.match(analysisSource, /requestWindow: \{ type: "calendar_month"/);
assert.match(analysisSource, /workflowSteps: defaultWorkflowSteps\(\)/);
assert.match(analysisSource, /stage5-file-save-result/);
assert.match(analysisSource, /stage5-database-write-result/);
assert.match(sessionSource, /issueViewer, setIssueViewer/);
assert.match(sessionSource, /userViewer, setUserViewer/);
assert.doesNotMatch(sessionSource, /issueKey: "COPGEN1-138930"/);
assert.doesNotMatch(issueViewerSource, /dangerouslySetInnerHTML/);
assert.equal(USER_ANALYSIS_DEFAULTS.delayBetweenRoundsMs, 5000);
assert.equal(USER_ANALYSIS_DEFAULTS.requestWindow, "calendar_month");
assert.equal(USER_ANALYSIS_DEFAULTS.roundExecutionMode, "force_all_rounds");
assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3, "v0.2.53 requires Current-State schema v3 for Worklogs");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0244-"));
const databasePath = path.join(tempRoot, "synthetic-viewer.sqlite");
const issueKey = "SYNTH-138930";
const sourceObjectId = "jira:issue:SYNTH-138930";
const now = "2026-07-29T02:00:00.000Z";

function objects(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}`, body: `${prefix} sample ${index + 1}` }));
}

try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.44-test",
    binding: {
      serverIdentity: "synthetic-server-id",
      baseUrlNormalized: "https://jira.example.invalid"
    },
    now,
    databaseId: "synthetic-v0244-db"
  });

  const payload = {
    schemaVersion: "synthetic_full_fetch_v1",
    issue: {
      key: issueKey,
      fields: {
        summary: "Synthetic viewer correctness fixture",
        description: "Plain fallback description",
        comment: { comments: objects(48, "comment") },
        attachment: objects(142, "attachment"),
        issuelinks: objects(2, "issue-link")
      },
      renderedFields: {
        description: "<p>Rendered safe description</p><script>window.bad = true</script>"
      }
    },
    changelog: objects(140, "history"),
    remoteLinks: {
      records: [],
      sectionStatus: { enabled: false, status: "not_attempted" }
    }
  };
  const decoded = Buffer.from(JSON.stringify(payload), "utf8");
  const compressed = gzipSync(decoded);
  const archiveHash = crypto.createHash("sha256").update(decoded).digest("hex");
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.prepare(`
      INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sourceObjectId, "synthetic-138930", issueKey, "SYNTH", now, now);
    db.prepare(`
      INSERT INTO current_issue_snapshots (
        source_object_id, summary, status, issue_type, priority, resolution,
        assignee, reporter, creator, labels_json, components_json, versions_json,
        start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceObjectId, "Synthetic viewer correctness fixture", "In Progress", "Task", "Medium", null,
      "Sample Assignee", "Sample Reporter", "Sample Creator", "[]", "[]", "[]",
      null, null, now, JSON.stringify({ key: issueKey }), now
    );
    db.prepare(`
      INSERT INTO current_full_fetch_payloads (
        source_object_id, payload_gzip, archive_sha256, uncompressed_bytes,
        compressed_bytes, payload_format_version, payload_saved_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(sourceObjectId, compressed, archiveHash, decoded.byteLength, compressed.byteLength, now);
    const sixtyFour = "a".repeat(64);
    db.prepare(`
      INSERT INTO issue_sync_states (
        source_object_id, stable_hash, stable_hash_policy_version, stable_hash_policy_fingerprint,
        fetch_profile_hash, coverage_profile_json, stable_projection_json, content_revision,
        successful_fetch_count, first_successful_fetch_at, last_checked_at, last_content_changed_at,
        last_successful_run_id, last_jira_updated_at, last_outcome, last_update_reason,
        archive_sha256, payload_updated_at
      ) VALUES (?, ?, 4, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceObjectId, sixtyFour, sixtyFour, sixtyFour,
      JSON.stringify({ remoteLinks: "Disabled" }), "{}",
      now, now, now, "synthetic-run", now, "inserted", "synthetic fixture",
      archiveHash, now
    );
    const insertEvent = db.prepare(`
      INSERT INTO activity_events (
        id, source_object_id, event_type, event_time, actor_account_id, actor_display_name,
        field_id, field_name, from_value_json, to_value_json, source_record_id,
        event_identity_hash, event_identity_policy_version, identity_key_type,
        jira_native_source_id, source_provenance, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (let index = 0; index < 453; index += 1) {
      const identity = crypto.createHash("sha256").update(`synthetic-event-${index}`).digest("hex");
      insertEvent.run(
        `event-${index}`, sourceObjectId, "field_changed", now, "synthetic-account",
        "Synthetic User", "status", "Status", "\"Open\"", "\"In Progress\"",
        `record-${index}`, identity, 2, "synthetic", `native-${index}`,
        "synthetic_fixture", now
      );
    }
  } finally {
    db.close();
  }

  const overview = loadDatabaseOverview(databasePath);
  assert.equal(overview.counts.totalPayloads, 1);
  assert.equal(overview.counts.totalEvents, 453);

  const result = loadDatabaseIssue(databasePath, issueKey);
  assert.equal(result.status, "ready");
  assert.equal(result.comments.total, 48);
  assert.equal(result.issueLinks.total, 2);
  assert.equal(result.description.source, "rendered");
  assert.match(result.description.plainText, /Rendered safe description/);
  assert.doesNotMatch(result.description.plainText, /<script|window\.bad|<p>/i);

  const mutationDb = new DatabaseSync(databasePath);
  try {
    const corrupt = Buffer.from("not-gzip", "utf8");
    mutationDb.prepare("UPDATE current_full_fetch_payloads SET payload_gzip = ?, compressed_bytes = ? WHERE source_object_id = ?")
      .run(corrupt, corrupt.byteLength, sourceObjectId);
    assert.equal(loadDatabaseIssue(databasePath, issueKey).status, "payload_decode_failed");

    const malformed = Buffer.from("{not-json", "utf8");
    const malformedGzip = gzipSync(malformed);
    const malformedHash = crypto.createHash("sha256").update(malformed).digest("hex");
    mutationDb.prepare(`
      UPDATE current_full_fetch_payloads
      SET payload_gzip = ?, archive_sha256 = ?, uncompressed_bytes = ?, compressed_bytes = ?
      WHERE source_object_id = ?
    `).run(malformedGzip, malformedHash, malformed.byteLength, malformedGzip.byteLength, sourceObjectId);
    assert.equal(loadDatabaseIssue(databasePath, issueKey).status, "payload_invalid");
  } finally {
    mutationDb.close();
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("v0.2.44 UI integration and Viewer correctness fixture tests passed.");
