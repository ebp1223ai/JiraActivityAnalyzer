import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  EVENT_IDENTITY_POLICY_FINGERPRINT,
  EVENT_IDENTITY_POLICY_VERSION,
  extractActivityEventsV2
} from "./activityEvents.js";
import {
  compareCoverage,
  defaultCompleteCoverage,
  validateCoverage,
  validateIssueLinksCoverage,
  type CoverageProfile
} from "./coverageProfile.js";
import {
  CURRENT_STATE_SCHEMA_VERSION,
  checkCurrentStateDatabaseCompatibility,
  createCurrentStateDatabase,
  currentStateCounts,
  writeCurrentStateBatch
} from "./currentStateArchive.js";
import {
  buildStableIssueContentV3,
  canonicalJsonV3,
  normalizeVolatileDisplayName,
  resolveEffectiveStableHashPolicyV3,
  stablePolicyFingerprint,
  STABLE_HASH_POLICY_VERSION
} from "./stableIssueContentV3.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0241-"));
const jira = {
  serverIdentity: "synthetic-jira-v0241",
  baseUrlNormalized: "https://jira.synthetic.invalid"
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fixture(key = "SYN-241", id = "241") {
  const issueLinks = [{
    id: "link-1",
    type: { id: "10000", name: "Relates" },
    outwardIssue: { id: "242", key: "SYN-242" }
  }];
  return {
    schemaVersion: "jira_issue_source_snapshot_v2",
    fetchedAt: "2026-07-28T01:00:00.000Z",
    runId: "run-1",
    queueMetadata: { index: 0 },
    issue: {
      id,
      key,
      names: {
        customfield_13200: "Debug Time",
        customfield_26801: "FA Debugging Time",
        customfield_41610: "Debug Time（ Working Days ）",
        customfield_41604: "Delta Duedate(Working Days)",
        customfield_50000: "Debug Timeline"
      },
      schema: {
        customfield_13200: { type: "number", custom: "ru.mail.jira.plugins.groovy:groovy-number-field" },
        customfield_26801: { type: "number", custom: "ru.mail.jira.plugins.groovy:groovy-number-field" },
        customfield_41610: { type: "number", custom: "ru.mail.jira.plugins.groovy:groovy-number-field" },
        customfield_41604: { type: "number", custom: "ru.mail.jira.plugins.groovy:groovy-number-field" }
      },
      fields: {
        summary: "Stable Hash V3 synthetic fixture",
        description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Meaningful" }] }] },
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-28T01:00:00.000Z",
        lastViewed: "2026-07-28T01:01:00.000Z",
        status: { id: "3", name: "In Progress" },
        issuetype: { id: "10001", name: "Task" },
        priority: { id: "3", name: "Medium" },
        resolution: null,
        assignee: { accountId: "synthetic-user-1", displayName: "Synthetic User" },
        reporter: { accountId: "synthetic-user-2", displayName: "Synthetic Reporter" },
        creator: { accountId: "synthetic-user-3", displayName: "Synthetic Creator" },
        labels: ["stable", "v3"],
        components: [{ id: "1", name: "Core" }],
        fixVersions: [],
        customfield_13200: 10,
        customfield_26801: 20,
        customfield_41610: 3,
        customfield_41604: 4,
        customfield_50000: "business value",
        issuelinks: issueLinks,
        attachment: [{ id: "attachment-1", filename: "fixture.txt", created: "2026-07-01T01:00:00.000Z" }]
      }
    },
    changelog: [{
      id: "history-1",
      created: "2026-07-02T00:00:00.000Z",
      items: [{ fieldId: "status", field: "status", fromString: "Open", toString: "In Progress" }]
    }],
    comments: [{
      id: "comment-1",
      created: "2026-07-03T00:00:00.000Z",
      updated: "2026-07-03T00:00:00.000Z",
      body: "Original body"
    }],
    attachments: [{ id: "attachment-1", filename: "fixture.txt", created: "2026-07-01T01:00:00.000Z" }],
    issueLinks,
    remoteLinks: [],
    evidence: [{ code: "safe_fixture" }]
  };
}

function coverage(raw: ReturnType<typeof fixture>, remoteLinksEnabled = false): CoverageProfile {
  return defaultCompleteCoverage({
    changelog: raw.changelog.length,
    comments: raw.comments.length,
    attachments: raw.attachments.length,
    issueLinks: raw.issue.fields.issuelinks.length,
    remoteLinksEnabled,
    remoteLinks: raw.remoteLinks.length
  });
}

function write(databasePath: string, raw: ReturnType<typeof fixture>, runId: string, profile = coverage(raw), extras: Record<string, unknown> = {}) {
  return writeCurrentStateBatch({
    operationId: `operation-${runId}`,
    runId,
    databasePath,
    jira,
    observedAt: `2026-07-28T${String(Math.min(23, runId.length)).padStart(2, "0")}:00:00.000Z`,
    items: [{ issueKey: raw.issue.key, rawJson: raw, coverage: profile, eligibility: "eligible", ...extras }]
  });
}

function facts(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const one = (sql: string) => db.prepare(sql).get() as Record<string, unknown>;
    return {
      metadata: one("SELECT * FROM database_metadata"),
      sync: one("SELECT * FROM issue_sync_states"),
      payload: one("SELECT archive_sha256, payload_saved_at, length(payload_gzip) AS bytes FROM current_full_fetch_payloads"),
      counts: currentStateCounts(databasePath),
      metrics: db.prepare("SELECT * FROM current_observed_metrics ORDER BY field_id").all() as Array<Record<string, unknown>>,
      events: db.prepare("SELECT event_type, jira_native_source_id, event_identity_hash FROM activity_events ORDER BY event_type, event_time").all() as Array<Record<string, unknown>>,
      integrity: one("PRAGMA integrity_check"),
      foreignKeys: db.prepare("PRAGMA foreign_key_check").all()
    };
  } finally {
    db.close();
  }
}

try {
  const base = fixture();
  const resolved = resolveEffectiveStableHashPolicyV3(base.issue.names, base.issue.schema);
  assert.equal(resolved.policy.policyVersion, 3);
  assert.equal(stablePolicyFingerprint(resolved.policy).fingerprint, resolved.fingerprint);
  assert.equal(canonicalJsonV3({ b: 2, a: 1 }), canonicalJsonV3({ a: 1, b: 2 }));
  assert.equal(normalizeVolatileDisplayName(" Debug Time（ Working  Days ） "), normalizeVolatileDisplayName("debug time(working days)"));
  assert.ok(resolved.policy.resolvedVolatileFields.some((field) => field.fieldId === "customfield_41610"));
  assert.ok(resolved.policy.unresolvedVolatileFields.includes("Actual Duration(Working Days)"));
  assert.ok(!resolved.policy.resolvedVolatileFields.some((field) => field.fieldId === "customfield_50000"));

  const baseProjection = buildStableIssueContentV3(base, coverage(base), resolved.policy, jira.serverIdentity);
  const volatileOnly = clone(base);
  volatileOnly.fetchedAt = "2026-07-29T00:00:00.000Z";
  volatileOnly.runId = "run-2";
  volatileOnly.issue.fields.updated = "2026-07-29T00:00:00.000Z";
  volatileOnly.issue.fields.lastViewed = "2026-07-29T00:01:00.000Z";
  volatileOnly.issue.fields.customfield_13200 = 999;
  volatileOnly.issue.fields.customfield_41610 = 999;
  assert.equal(buildStableIssueContentV3(volatileOnly, coverage(volatileOnly), resolved.policy, jira.serverIdentity).stableHash, baseProjection.stableHash);

  const commentEdit = clone(base);
  commentEdit.comments[0].body = "Edited body";
  commentEdit.comments[0].updated = "2026-07-04T00:00:00.000Z";
  assert.notEqual(buildStableIssueContentV3(commentEdit, coverage(commentEdit), resolved.policy, jira.serverIdentity).stableHash, baseProjection.stableHash);
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => { value.issue.fields.summary = "Changed"; },
    (value: ReturnType<typeof fixture>) => { value.issue.fields.labels.push("changed"); },
    (value: ReturnType<typeof fixture>) => { value.issue.fields.status = { id: "5", name: "Done" }; },
    (value: ReturnType<typeof fixture>) => { value.issue.fields.customfield_50000 = "changed business value"; }
  ]) {
    const changed = clone(base);
    mutate(changed);
    assert.notEqual(buildStableIssueContentV3(changed, coverage(changed), resolved.policy, jira.serverIdentity).stableHash, baseProjection.stableHash);
  }

  const ambiguousNames = { ...base.issue.names, customfield_99998: "Debug Time" };
  const ambiguous = resolveEffectiveStableHashPolicyV3(ambiguousNames, base.issue.schema);
  assert.ok(ambiguous.policy.ambiguousVolatileFields.some((item) => item.configuredName === "Debug Time"));
  assert.ok(!ambiguous.policy.resolvedVolatileFields.some((field) => field.fieldId === "customfield_13200"));

  assert.equal(validateCoverage(coverage(base)).valid, true);
  assert.equal(validateIssueLinksCoverage(coverage(base), base).valid, true);
  const wrongCount = clone(coverage(base));
  if (wrongCount.evidence?.issueLinks) wrongCount.evidence.issueLinks.itemCount = 2;
  assert.equal(validateIssueLinksCoverage(wrongCount, base).reasonCode, "ISSUE_LINKS_COUNT_MISMATCH");
  const missingLinks = clone(base) as any;
  delete missingLinks.issue.fields.issuelinks;
  assert.equal(validateIssueLinksCoverage(coverage(base), missingLinks).valid, false);
  const upgradedCoverage = coverage(base, true);
  assert.equal(compareCoverage(coverage(base), upgradedCoverage), "Upgrade");
  assert.equal(compareCoverage(upgradedCoverage, coverage(base)), "Downgrade");

  const currentLinksOnly = clone(base);
  currentLinksOnly.changelog = [];
  const currentLinkEvents = extractActivityEventsV2(currentLinksOnly, jira.serverIdentity, base.issue.key);
  assert.equal(currentLinkEvents.events.filter((item) => item.eventType === "issue_link_changed").length, 0);
  const editedEvents = extractActivityEventsV2(commentEdit, jira.serverIdentity, base.issue.key);
  const originalEvents = extractActivityEventsV2(base, jira.serverIdentity, base.issue.key);
  assert.equal(
    originalEvents.events.find((item) => item.eventType === "comment_created")?.eventIdentityHash,
    editedEvents.events.find((item) => item.eventType === "comment_created")?.eventIdentityHash
  );
  assert.equal(editedEvents.events.filter((item) => item.eventType === "comment_updated").length, 1);
  const linkHistory = clone(base);
  linkHistory.changelog.push({
    id: "history-link",
    created: "2026-07-04T00:00:00.000Z",
    items: [{ fieldId: "issuelinks", field: "Linked Issues", fromString: "", toString: "SYN-242" }]
  });
  assert.equal(extractActivityEventsV2(linkHistory, jira.serverIdentity, base.issue.key).events.filter((item) => item.eventType === "issue_link_changed").length, 1);

  const databasePath = path.join(root, "v0241.sqlite");
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.41", binding: jira });
  const created = write(databasePath, base, "new");
  assert.equal(created.outcomes[0].outcome, "new");
  const first = facts(databasePath);
  assert.equal(first.metadata.schema_version, CURRENT_STATE_SCHEMA_VERSION);
  assert.equal(first.metadata.stable_hash_policy_version, STABLE_HASH_POLICY_VERSION);
  assert.equal(first.metadata.event_identity_policy_version, EVENT_IDENTITY_POLICY_VERSION);
  assert.equal(first.metadata.event_identity_policy_fingerprint, EVENT_IDENTITY_POLICY_FINGERPRINT);
  assert.equal(first.metadata.stable_hash_policy_initialized, 1);
  assert.equal(first.metrics.length, resolved.policy.resolvedVolatileFields.length);

  const existing = write(databasePath, volatileOnly, "existing");
  assert.equal(existing.outcomes[0].outcome, "existing");
  assert.ok(existing.outcomes[0].observedMetrics.updated >= 1);
  const second = facts(databasePath);
  assert.equal(second.sync.content_revision, 1);
  assert.equal(second.sync.successful_fetch_count, 2);
  assert.equal(second.payload.archive_sha256, first.payload.archive_sha256);
  assert.equal(second.payload.payload_saved_at, first.payload.payload_saved_at);
  assert.equal(second.payload.bytes, first.payload.bytes);
  assert.equal(second.counts.current_full_fetch_payloads, 1);
  assert.equal(second.counts.current_observed_metrics, resolved.policy.resolvedVolatileFields.length);

  const coverageUpgrade = write(databasePath, volatileOnly, "coverage-upgrade", coverage(volatileOnly, true));
  assert.equal(coverageUpgrade.outcomes[0].reasonCode, "COVERAGE_UPGRADED");
  const afterUpgrade = facts(databasePath);
  assert.equal(afterUpgrade.sync.content_revision, 1);
  assert.notEqual(afterUpgrade.payload.archive_sha256, first.payload.archive_sha256);

  const meaningful = clone(volatileOnly);
  meaningful.issue.fields.labels.push("meaningful");
  const updated = write(databasePath, meaningful, "meaningful", coverage(meaningful, true));
  assert.equal(updated.outcomes[0].reasonCode, "MEANINGFUL_CONTENT_CHANGED");
  assert.equal(facts(databasePath).sync.content_revision, 2);

  const repeatEdited = write(databasePath, commentEdit, "comment-edit", coverage(commentEdit, true));
  assert.equal(repeatEdited.outcomes[0].activityEventsInsertedByType.comment_created ?? 0, 0);
  assert.equal(repeatEdited.outcomes[0].activityEventsInsertedByType.comment_updated ?? 0, 1);
  const repeatSameEdit = write(databasePath, commentEdit, "comment-edit-repeat", coverage(commentEdit, true));
  assert.equal(repeatSameEdit.outcomes[0].activityEventsInserted, 0);
  const eventFacts = facts(databasePath);
  assert.equal(eventFacts.events.filter((item) => item.event_type === "comment_created" && item.jira_native_source_id === "comment-1").length, 1);

  const beforeBlocked = facts(databasePath);
  const blockedCoverage = clone(coverage(commentEdit, true));
  if (blockedCoverage.evidence?.issueLinks) blockedCoverage.evidence.issueLinks.itemCount = 99;
  const blocked = write(databasePath, commentEdit, "blocked", blockedCoverage);
  assert.equal(blocked.outcomes[0].outcome, "failed_rolled_back");
  assert.equal(facts(databasePath).sync.successful_fetch_count, beforeBlocked.sync.successful_fetch_count);

  const rollbackCandidate = clone(commentEdit);
  rollbackCandidate.issue.fields.summary = "Must roll back";
  (rollbackCandidate.issue.fields as Record<string, unknown>).customfield_13200 = null;
  const rollback = write(databasePath, rollbackCandidate, "rollback", coverage(rollbackCandidate, true), { simulateFailureAt: "during_events" });
  assert.equal(rollback.outcomes[0].outcome, "failed_rolled_back");
  const afterRollback = facts(databasePath);
  assert.equal(afterRollback.sync.stable_hash, beforeBlocked.sync.stable_hash);
  assert.deepEqual(afterRollback.metrics, beforeBlocked.metrics);

  assert.equal(afterRollback.integrity.integrity_check, "ok");
  assert.equal(afterRollback.foreignKeys.length, 0);
  assert.equal(checkCurrentStateDatabaseCompatibility(databasePath, jira.serverIdentity).status, "READY");

  const oldPath = path.join(root, "v0240-read-only.sqlite");
  const oldDb = new DatabaseSync(oldPath);
  oldDb.exec(`CREATE TABLE database_metadata (
    metadata_key TEXT PRIMARY KEY, database_id TEXT, product_id TEXT, database_type TEXT,
    schema_version INTEGER, storage_model TEXT, storage_model_version INTEGER,
    stable_hash_policy_version INTEGER, jira_server_identity_hash TEXT
  )`);
  oldDb.prepare("INSERT INTO database_metadata VALUES ('primary', 'old-v2', ?, ?, 1, 'current_state', 1, 2, ?)")
    .run("jira_activity_analyzer", "current_state_archive_db", jira.serverIdentity);
  oldDb.close();
  const oldBefore = crypto.createHash("sha256").update(fs.readFileSync(oldPath)).digest("hex");
  const oldInspection = checkCurrentStateDatabaseCompatibility(oldPath, jira.serverIdentity);
  const oldAfter = crypto.createHash("sha256").update(fs.readFileSync(oldPath)).digest("hex");
  assert.equal(oldInspection.legacyReadOnly, true);
  assert.equal(oldInspection.status, "MIGRATION_REQUIRED");
  assert.equal(oldAfter, oldBefore);

  console.log("v0.2.41 Stable Hash V3, Coverage, Observed Metrics, Event Identity V2 tests passed (focused correctness suite).");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
