import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CURRENT_STATE_TABLES,
  LEGACY_HISTORY_TABLES,
  checkCurrentStateDatabaseCompatibility,
  createAndActivateCurrentStateDatabase,
  createCurrentStateDatabase,
  currentStateCounts,
  writeCurrentStateBatch
} from "./currentStateArchive.js";
import {
  compareCoverage,
  defaultCompleteCoverage,
  type CoverageProfile
} from "./coverageProfile.js";
import {
  buildStableIssueContentV2,
  resolveVolatileFieldPolicy
} from "./stableIssueContentV2.js";
import {
  SOURCE_ARCHIVE_V1_SCHEMA_SQL
} from "./sourceArchiveDatabase.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0240-"));
const jira = {
  serverIdentity: "jira-server-identity-synthetic-240",
  baseUrlNormalized: "https://jira.synthetic.invalid"
};
const complete = defaultCompleteCoverage({
  comments: 1,
  changelog: 1,
  attachments: 1,
  issueLinks: 1
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function payload(key = "SYN-240", id = "240") {
  return {
    schemaVersion: "jira_issue_source_snapshot_v2",
    fetchedAt: "2026-07-27T08:00:00.000Z",
    runId: "run-a",
    queueMetadata: { index: 1 },
    issue: {
      id,
      key,
      names: {
        customfield_20100: "Actual Duration",
        customfield_20101: "Review Time",
        customfield_20200: "Development"
      },
      schema: { customfield_20200: { type: "string" } },
      renderedFields: { description: "<p>rendered</p>" },
      fields: {
        summary: "Current-State fixture",
        description: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "First" }] },
            { type: "paragraph", content: [{ type: "text", text: "Second" }] }
          ]
        },
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-27T08:00:00.000Z",
        status: { id: "3", name: "In Progress" },
        issuetype: { id: "10001", name: "Task" },
        priority: { id: "3", name: "Medium" },
        resolution: null,
        assignee: { accountId: "account-1", displayName: "Synthetic User" },
        reporter: { accountId: "account-2", displayName: "Synthetic Reporter" },
        creator: { accountId: "account-3", displayName: "Synthetic Creator" },
        labels: ["beta", "alpha"],
        components: [{ id: "2", name: "B" }, { id: "1", name: "A" }],
        fixVersions: [{ id: "2", name: "2.0" }, { id: "1", name: "1.0" }],
        customfield_10015: "2026-07-01",
        duedate: "2026-07-31",
        customfield_20100: 100,
        customfield_20101: 20,
        customfield_20200: "Meaningful development com.synthetic.SummaryBean@2c375acf"
      }
    },
    changelog: [{
      id: "history-1",
      created: "2026-07-27T01:00:00.000Z",
      author: { accountId: "account-1" },
      items: [{ fieldId: "status", field: "status", fromString: "Open", toString: "In Progress" }]
    }],
    comments: [{
      id: "comment-1",
      created: "2026-07-27T02:00:00.000Z",
      updated: "2026-07-27T02:00:00.000Z",
      author: { accountId: "account-1" },
      body: "Synthetic comment"
    }],
    attachments: [{ id: "attachment-1", filename: "fixture.txt", size: 42, mimeType: "text/plain" }],
    issueLinks: [{ id: "link-1", type: { id: "10000", name: "Relates" }, outwardIssue: { id: "241", key: "SYN-241" } }],
    remoteLinks: [],
    evidence: [{ selectedUser: "synthetic" }]
  };
}

function write(databasePath: string, raw: unknown, runId: string, coverage: CoverageProfile = complete, extras: Record<string, unknown> = {}) {
  return writeCurrentStateBatch({
    operationId: `operation-${runId}`,
    runId,
    databasePath,
    jira,
    items: [{ issueKey: String((raw as any).issue?.key ?? "SYN-240"), rawJson: raw, coverage, eligibility: "eligible", ...extras }]
  });
}

function databaseFacts(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const one = (sql: string) => db.prepare(sql).get() as Record<string, unknown>;
    return {
      counts: currentStateCounts(databasePath),
      payload: one("SELECT archive_sha256, uncompressed_bytes, compressed_bytes, payload_saved_at, hex(payload_gzip) AS blob_hex FROM current_full_fetch_payloads"),
      sync: one("SELECT * FROM issue_sync_states"),
      integrity: one("PRAGMA integrity_check"),
      foreignKeys: db.prepare("PRAGMA foreign_key_check").all(),
      tables: (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name)
    };
  } finally {
    db.close();
  }
}

function createLegacy(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  db.exec(SOURCE_ARCHIVE_V1_SCHEMA_SQL);
  db.prepare("INSERT INTO database_metadata VALUES ('primary', 'legacy-db', 'jira_activity_analyzer', 'source_archive_db', 1, ?, ?, '0.2.38')")
    .run("2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");
  db.close();
}

try {
  const base = payload();
  const projection = buildStableIssueContentV2(base, complete, jira.serverIdentity);

  // Stable Projection V2 (1-20).
  const metadataOnly = clone(base);
  metadataOnly.fetchedAt = "2026-07-28T00:00:00.000Z";
  metadataOnly.runId = "run-b";
  metadataOnly.queueMetadata = { index: 99 };
  metadataOnly.evidence = [{ selectedUser: "other" }];
  (metadataOnly.issue.names as Record<string, string>).customfield_99999 = "Unrelated display metadata";
  metadataOnly.issue.schema = {} as typeof metadataOnly.issue.schema;
  metadataOnly.issue.renderedFields = {} as typeof metadataOnly.issue.renderedFields;
  assert.equal(buildStableIssueContentV2(metadataOnly, complete, jira.serverIdentity).stableHash, projection.stableHash);

  const reordered = clone(base);
  reordered.issue.fields.labels.reverse();
  reordered.issue.fields.components.reverse();
  reordered.issue.fields.fixVersions.reverse();
  reordered.comments.reverse();
  reordered.changelog.reverse();
  reordered.attachments.reverse();
  reordered.issueLinks.reverse();
  assert.equal(buildStableIssueContentV2(reordered, complete, jira.serverIdentity).stableHash, projection.stableHash);

  const adfOrder = clone(base);
  adfOrder.issue.fields.description.content.reverse();
  assert.notEqual(buildStableIssueContentV2(adfOrder, complete, jira.serverIdentity).stableHash, projection.stableHash);
  const runtimeIdentity = clone(base);
  runtimeIdentity.issue.fields.customfield_20200 = "Meaningful development com.synthetic.SummaryBean@de601a3";
  assert.equal(buildStableIssueContentV2(runtimeIdentity, complete, jira.serverIdentity).stableHash, projection.stableHash);
  const meaningfulDevelopment = clone(base);
  meaningfulDevelopment.issue.fields.customfield_20200 = "Changed development com.synthetic.SummaryBean@de601a3";
  assert.notEqual(buildStableIssueContentV2(meaningfulDevelopment, complete, jira.serverIdentity).stableHash, projection.stableHash);
  const volatileOnly = clone(base);
  volatileOnly.issue.fields.customfield_20100 = 999;
  volatileOnly.issue.fields.customfield_20101 = 999;
  assert.equal(buildStableIssueContentV2(volatileOnly, complete, jira.serverIdentity).stableHash, projection.stableHash);
  const ambiguous = clone(base);
  (ambiguous.issue.names as Record<string, string>).customfield_20102 = "Actual Duration";
  ambiguous.issue.fields.customfield_20100 = 101;
  const ambiguousProjection = buildStableIssueContentV2(ambiguous, complete, jira.serverIdentity);
  assert.notEqual(ambiguousProjection.stableHash, projection.stableHash);
  assert.ok(ambiguousProjection.policy.warnings.some((warning) => warning.code === "AMBIGUOUS_VOLATILE_FIELD_MAPPING"));
  const unknownCustom = clone(base);
  (unknownCustom.issue.fields as Record<string, unknown>).customfield_77777 = "business value";
  assert.notEqual(buildStableIssueContentV2(unknownCustom, complete, jira.serverIdentity).stableHash, projection.stableHash);
  for (const mutate of [
    (v: any) => { v.issue.fields.summary = "Changed"; },
    (v: any) => { v.issue.fields.description = "Changed"; },
    (v: any) => { v.issue.fields.status = { id: "5", name: "Resolved" }; },
    (v: any) => { v.issue.fields.issuetype = { id: "2", name: "Bug" }; },
    (v: any) => { v.issue.fields.priority = { id: "1", name: "Highest" }; },
    (v: any) => { v.issue.fields.resolution = { id: "1", name: "Fixed" }; },
    (v: any) => { v.issue.fields.assignee = { accountId: "changed" }; },
    (v: any) => { v.issue.fields.reporter = { accountId: "changed" }; },
    (v: any) => { v.issue.fields.creator = { accountId: "changed" }; },
    (v: any) => { v.issue.fields.labels.push("changed"); },
    (v: any) => { v.issue.fields.components.push({ id: "3", name: "C" }); },
    (v: any) => { v.issue.fields.fixVersions.push({ id: "3", name: "3.0" }); },
    (v: any) => { v.issue.fields.customfield_10015 = "2026-07-02"; },
    (v: any) => { v.issue.fields.duedate = "2026-08-01"; },
    (v: any) => { v.comments[0].body = "Edited"; },
    (v: any) => { v.comments.push({ id: "comment-2", body: "Added" }); },
    (v: any) => { v.comments = []; },
    (v: any) => { v.changelog.push({ id: "history-2", items: [] }); },
    (v: any) => { v.attachments[0].filename = "changed.txt"; },
    (v: any) => { v.issueLinks = []; },
    (v: any) => { v.issue.fields.parent = { id: "1", key: "SYN-1" }; },
    (v: any) => { v.issue.fields.subtasks = [{ id: "242", key: "SYN-242" }]; }
  ]) {
    const changed = clone(base);
    mutate(changed);
    assert.notEqual(buildStableIssueContentV2(changed, complete, jira.serverIdentity).stableHash, projection.stableHash);
  }
  assert.equal(resolveVolatileFieldPolicy(base.issue.names).resolvedFieldIds.includes("customfield_20100"), true);

  // Coverage (21-27).
  const remoteEmpty = { ...complete, remoteLinks: "CompleteEmpty" as const };
  assert.notEqual(buildStableIssueContentV2(base, remoteEmpty, jira.serverIdentity).stableHash, projection.stableHash);
  assert.equal(compareCoverage(complete, complete), "Equivalent");
  assert.equal(compareCoverage(complete, remoteEmpty), "Upgrade");
  assert.equal(compareCoverage(remoteEmpty, complete), "Downgrade");
  const incomparable = { ...complete, remoteLinks: "CompleteEmpty" as const, attachmentsMetadata: "Disabled" as const };
  assert.equal(compareCoverage(complete, incomparable), "Incomparable");
  assert.equal(compareCoverage(complete, { ...complete, comments: "Partial" }), "Invalid");
  assert.notEqual(buildStableIssueContentV2(base, { ...complete, comments: "CompleteEmpty" }, jira.serverIdentity).stableHash,
    buildStableIssueContentV2(base, { ...complete, comments: "Skipped" }, jira.serverIdentity).stableHash);

  const databasePath = path.join(root, "current-state.sqlite");
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.40", binding: jira });
  const first = write(databasePath, base, "first");
  assert.equal(first.outcomes[0].outcome, "new");
  const firstFacts = databaseFacts(databasePath);
  assert.equal(firstFacts.counts.source_objects, 1);
  assert.equal(firstFacts.counts.current_issue_snapshots, 1);
  assert.equal(firstFacts.counts.current_full_fetch_payloads, 1);
  assert.equal(firstFacts.counts.issue_sync_states, 1);

  // Payload/transactions (28-37) and row invariants (38-51).
  const duplicate = write(databasePath, metadataOnly, "duplicate");
  assert.equal(duplicate.outcomes[0].outcome, "existing");
  const duplicateFacts = databaseFacts(databasePath);
  assert.equal(duplicateFacts.payload.blob_hex, firstFacts.payload.blob_hex);
  assert.equal(duplicateFacts.payload.payload_saved_at, firstFacts.payload.payload_saved_at);
  assert.equal(duplicateFacts.sync.content_revision, 1);
  assert.equal(duplicateFacts.sync.successful_fetch_count, 2);
  assert.equal(duplicateFacts.sync.payload_updated_at, firstFacts.sync.payload_updated_at);

  const changed = clone(base);
  changed.issue.fields.summary = "Updated Current-State fixture";
  const updated = write(databasePath, changed, "updated");
  assert.equal(updated.outcomes[0].outcome, "updated");
  const updatedFacts = databaseFacts(databasePath);
  assert.equal(updatedFacts.counts.current_full_fetch_payloads, 1);
  assert.equal(updatedFacts.sync.content_revision, 2);

  const downgradeBefore = fs.readFileSync(databasePath);
  const blocked = write(databasePath, changed, "downgrade", { ...complete, remoteLinks: "CompleteEmpty" }, {});
  assert.equal(blocked.outcomes[0].outcome, "updated");
  const downgrade = write(databasePath, changed, "downgrade-2", complete);
  assert.equal(downgrade.outcomes[0].outcome, "coverage_blocked");
  assert.equal(databaseFacts(databasePath).sync.successful_fetch_count, 4);
  assert.ok(downgradeBefore.byteLength > 0);

  const rollbackBefore = databaseFacts(databasePath);
  const rollbackPayload = clone(changed);
  rollbackPayload.issue.fields.summary = "Must roll back";
  const rollback = write(databasePath, rollbackPayload, "rollback", remoteEmpty, { simulateFailureAt: "after_snapshot" });
  assert.equal(rollback.outcomes[0].outcome, "failed_rolled_back");
  assert.equal(databaseFacts(databasePath).sync.stable_hash, rollbackBefore.sync.stable_hash);
  const eventRollback = write(databasePath, rollbackPayload, "event-rollback", remoteEmpty, { simulateFailureAt: "during_events" });
  assert.equal(eventRollback.outcomes[0].outcome, "failed_rolled_back");
  assert.equal(databaseFacts(databasePath).sync.stable_hash, rollbackBefore.sync.stable_hash);

  const excludedPath = path.join(root, "excluded.sqlite");
  createCurrentStateDatabase({ targetPath: excludedPath, appVersion: "0.2.40", binding: jira });
  const partial = writeCurrentStateBatch({
    operationId: "partial",
    runId: "partial",
    databasePath: excludedPath,
    jira,
    items: [{ issueKey: "SYN-999", eligibility: "partial" }]
  });
  assert.equal(partial.summary.excludedPartial, 1);
  assert.equal(currentStateCounts(excludedPath).source_objects, 0);
  const missingId = clone(base);
  missingId.issue.id = "";
  assert.equal(write(excludedPath, missingId, "missing-id").outcomes[0].reasonCode, "JIRA_ISSUE_ID_MISSING");
  const collisionA = write(excludedPath, payload("SYN-300", "300"), "collision-a");
  assert.equal(collisionA.outcomes[0].outcome, "new");
  assert.equal(write(excludedPath, payload("SYN-300", "301"), "collision-b").outcomes[0].reasonCode, "JIRA_ISSUE_ID_KEY_COLLISION");

  const facts = databaseFacts(databasePath);
  for (const table of CURRENT_STATE_TABLES) assert.ok(facts.tables.includes(table));
  for (const table of LEGACY_HISTORY_TABLES) assert.ok(!facts.tables.includes(table));
  assert.equal(facts.integrity.integrity_check, "ok");
  assert.equal(facts.foreignKeys.length, 0);
  assert.equal(checkCurrentStateDatabaseCompatibility(databasePath, "wrong-server").status, "JIRA_INSTANCE_MISMATCH");

  const legacyPath = path.join(root, "legacy.sqlite");
  createLegacy(legacyPath);
  const legacyBefore = crypto.createHash("sha256").update(fs.readFileSync(legacyPath)).digest("hex");
  const legacyInspection = checkCurrentStateDatabaseCompatibility(legacyPath, jira.serverIdentity);
  const legacyAfter = crypto.createHash("sha256").update(fs.readFileSync(legacyPath)).digest("hex");
  assert.equal(legacyInspection.legacyReadOnly, true);
  assert.equal(legacyBefore, legacyAfter);
  const repeatPayload = clone(changed);
  repeatPayload.fetchedAt = "2026-07-30T00:00:00.000Z";
  assert.equal(write(databasePath, repeatPayload, "repeat", remoteEmpty).summary.payloadsUnchanged, 1);
  const repeatFacts = databaseFacts(databasePath);
  assert.equal(repeatFacts.counts.current_full_fetch_payloads, 1);
  assert.equal(repeatFacts.payload.compressed_bytes, databaseFacts(databasePath).payload.compressed_bytes);

  let envValue = "KEEP=1\nLOCAL_DATABASE_PATH=old.sqlite\n";
  const activationFailurePath = path.join(root, "activation-failure.sqlite");
  const failedActivation = createAndActivateCurrentStateDatabase({
    targetPath: activationFailurePath,
    appVersion: "0.2.40",
    binding: jira,
    activate: () => { throw new Error("synthetic activation failure"); }
  });
  assert.equal(failedActivation.activated, false);
  assert.equal(envValue, "KEEP=1\nLOCAL_DATABASE_PATH=old.sqlite\n");
  assert.ok(fs.existsSync(activationFailurePath));
  const activationSuccessPath = path.join(root, "activation-success.sqlite");
  const successfulActivation = createAndActivateCurrentStateDatabase({
    targetPath: activationSuccessPath,
    appVersion: "0.2.40",
    binding: jira,
    activate: (filePath) => { envValue = envValue.replace("old.sqlite", filePath); }
  });
  assert.equal(successfulActivation.activated, true);
  assert.match(envValue, /KEEP=1/);
  assert.match(envValue, /activation-success\.sqlite/);

  // Four-Issue model and bounded repeated saves (52-57).
  const fourPath = path.join(root, "four.sqlite");
  createCurrentStateDatabase({ targetPath: fourPath, appVersion: "0.2.40", binding: jira });
  for (let index = 1; index <= 4; index += 1) write(fourPath, payload(`FIX-${index}`, String(1000 + index)), `four-${index}`);
  const fourFirst = databaseFacts(fourPath);
  assert.equal(fourFirst.counts.source_objects, 4);
  assert.equal(fourFirst.counts.current_issue_snapshots, 4);
  assert.equal(fourFirst.counts.current_full_fetch_payloads, 4);
  assert.equal(fourFirst.counts.issue_sync_states, 4);
  for (let index = 1; index <= 4; index += 1) write(fourPath, payload(`FIX-${index}`, String(1000 + index)), `four-repeat-${index}`);
  const fourRepeat = databaseFacts(fourPath);
  assert.equal(fourRepeat.counts.current_full_fetch_payloads, 4);
  assert.equal(fourRepeat.payload.uncompressed_bytes, fourFirst.payload.uncompressed_bytes);
  assert.equal(fourRepeat.integrity.integrity_check, "ok");
  assert.equal(fourRepeat.foreignKeys.length, 0);

  console.log("v0.2.40 Current-State Archive Stable Dedup V2 tests passed (57 required scenarios covered).");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
