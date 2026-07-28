import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultCompleteCoverage, type CoverageProfile } from "./coverageProfile.js";
import {
  checkCurrentStateDatabaseCompatibility,
  createCurrentStateDatabase,
  writeCurrentStateBatch
} from "./currentStateArchive.js";
import {
  configureFullFetchBuildIdentity,
  createStagingRun,
  readFullFetchResultIndex
} from "./fullFetchStaging.js";
import {
  buildStableIssueContentV4,
  canonicalJsonV4,
  resolveEffectiveStableHashPolicyV4,
  stablePolicyFingerprint,
  STABLE_HASH_POLICY_VERSION
} from "./stableIssueContentV4.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0242-"));
const databasePath = path.join(root, "v0242.sqlite");
const jira = {
  serverIdentity: "synthetic-jira-v0242",
  baseUrlNormalized: "https://jira.synthetic.invalid"
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fixture() {
  const names: Record<string, string> = {
    customfield_12201: "Actual Duration",
    customfield_12401: "Review Time",
    customfield_20001: "Planned Duration",
    customfield_20002: "Planned Duration (Working Days)",
    customfield_20003: "verification time (max)",
    customfield_20004: "FA Review Time",
    customfield_13200: "Debug Time",
    customfield_26801: "FA Debugging Time",
    customfield_41610: "Debug Time(Working Days)",
    customfield_41604: "Delta Duedate(Working Days)",
    customfield_50000: "Debug Timeline"
  };
  const schema = Object.fromEntries(Object.keys(names).map((fieldId) => [
    fieldId,
    { type: fieldId === "customfield_50000" ? "string" : "number", custom: "synthetic:field" }
  ]));
  return {
    schemaVersion: "jira_issue_source_snapshot_v2",
    fetchedAt: "2026-07-28T01:00:00.000Z",
    runId: "run-1",
    issue: {
      id: "242",
      key: "SYN-242",
      names,
      schema,
      fields: {
        summary: "Stable Hash V4 synthetic fixture",
        description: "Meaningful description",
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
        labels: ["stable", "v4"],
        components: [],
        fixVersions: [],
        customfield_12201: 526.56,
        customfield_12401: 12,
        customfield_20001: 20,
        customfield_20002: 3,
        customfield_20003: 5,
        customfield_20004: 7,
        customfield_13200: 8,
        customfield_26801: 9,
        customfield_41610: 10,
        customfield_41604: 11,
        customfield_50000: "stable business content",
        issuelinks: [],
        attachment: []
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
      body: "Synthetic comment"
    }],
    attachments: [],
    issueLinks: [],
    remoteLinks: []
  };
}

function coverage(raw: ReturnType<typeof fixture>): CoverageProfile {
  return defaultCompleteCoverage({
    changelog: raw.changelog.length,
    comments: raw.comments.length,
    attachments: raw.attachments.length,
    issueLinks: raw.issueLinks.length,
    remoteLinksEnabled: false,
    remoteLinks: 0
  });
}

function write(raw: ReturnType<typeof fixture>, runId: string) {
  return writeCurrentStateBatch({
    operationId: `operation-${runId}`,
    runId,
    databasePath,
    jira,
    observedAt: "2026-07-28T02:00:00.000Z",
    items: [{ issueKey: raw.issue.key, rawJson: raw, coverage: coverage(raw), eligibility: "eligible" }]
  });
}

function facts() {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      metadata: db.prepare("SELECT * FROM database_metadata").get() as Record<string, unknown>,
      sync: db.prepare("SELECT * FROM issue_sync_states").get() as Record<string, unknown>,
      payload: db.prepare("SELECT archive_sha256, payload_saved_at, length(payload_gzip) AS bytes FROM current_full_fetch_payloads").get() as Record<string, unknown>,
      metrics: db.prepare("SELECT field_id, value_type, value_json, observed_at FROM current_observed_metrics ORDER BY field_id").all() as Array<Record<string, unknown>>,
      events: db.prepare("SELECT event_identity_hash FROM activity_events ORDER BY event_identity_hash").all()
    };
  } finally {
    db.close();
  }
}

try {
  const syntheticCommit = "4".repeat(40);
  configureFullFetchBuildIdentity({
    appVersion: "0.2.42",
    packagedSourceCommit: syntheticCommit,
    buildTime: "2026/07/28 13:30:00"
  });
  const staging = createStagingRun(path.join(root, "staging"), {
    runId: "metadata",
    selectedUser: "synthetic-user",
    queue: []
  });
  const resultIndex = readFullFetchResultIndex(staging);
  assert.equal(resultIndex.appVersion, "0.2.42");
  assert.equal(resultIndex.packagedSourceCommit, syntheticCommit);
  assert.equal(resultIndex.buildTime, "2026/07/28 13:30:00");

  const base = fixture();
  const resolved = resolveEffectiveStableHashPolicyV4(base.issue.names, base.issue.schema);
  assert.equal(STABLE_HASH_POLICY_VERSION, 4);
  assert.equal(resolved.policy.policyVersion, 4);
  assert.equal(stablePolicyFingerprint(resolved.policy).fingerprint, resolved.fingerprint);
  assert.equal(canonicalJsonV4({ b: 2, a: 1 }), canonicalJsonV4({ a: 1, b: 2 }));
  assert.equal(resolved.policy.resolvedVolatileFields.find((entry) => entry.fieldId === "customfield_12201")?.displayName, "Actual Duration");
  assert.equal(resolved.policy.resolvedVolatileFields.find((entry) => entry.fieldId === "customfield_12401")?.displayName, "Review Time");
  assert.ok(!resolved.policy.resolvedVolatileFields.some((entry) => entry.fieldId === "customfield_50000"));
  assert.ok(resolved.policy.resolvedVolatileFields.every((entry) => /^[a-f0-9]{64}$/.test(entry.metadataFingerprint)));

  const cosmeticallyRenamed = clone(resolved.policy);
  cosmeticallyRenamed.resolvedVolatileFields[0].displayName = ` ${cosmeticallyRenamed.resolvedVolatileFields[0].displayName.toUpperCase()} `;
  assert.equal(stablePolicyFingerprint(cosmeticallyRenamed).fingerprint, resolved.fingerprint);

  const baseline = buildStableIssueContentV4(base, coverage(base), resolved.policy, jira.serverIdentity);
  const metricOnly = clone(base);
  metricOnly.runId = "run-2";
  metricOnly.fetchedAt = "2026-07-28T02:00:00.000Z";
  metricOnly.issue.fields.lastViewed = "2026-07-28T02:01:00.000Z";
  for (const entry of resolved.policy.resolvedVolatileFields) {
    metricOnly.issue.fields[entry.fieldId as keyof typeof metricOnly.issue.fields] = 999 as never;
  }
  metricOnly.issue.fields.customfield_12201 = "526.56" as unknown as number;
  assert.equal(buildStableIssueContentV4(metricOnly, coverage(metricOnly), resolved.policy, jira.serverIdentity).stableHash, baseline.stableHash);

  const unknownTimeField = clone(base);
  unknownTimeField.issue.names.customfield_50001 = "Completely New Time";
  unknownTimeField.issue.schema.customfield_50001 = { type: "number", custom: "synthetic:field" };
  (unknownTimeField.issue.fields as Record<string, unknown>).customfield_50001 = 1;
  const unknownPolicy = resolveEffectiveStableHashPolicyV4(unknownTimeField.issue.names, unknownTimeField.issue.schema);
  assert.ok(!unknownPolicy.policy.resolvedVolatileFields.some((entry) => entry.fieldId === "customfield_50001"));

  const meaningful = clone(base);
  meaningful.issue.fields.customfield_50000 = "changed business content";
  assert.notEqual(buildStableIssueContentV4(meaningful, coverage(meaningful), resolved.policy, jira.serverIdentity).stableHash, baseline.stableHash);

  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.42", binding: jira });
  const created = write(base, "new");
  assert.equal(created.outcomes[0].outcome, "new");
  const first = facts();
  assert.equal(first.metadata.stable_hash_policy_version, 4);

  const existing = write(metricOnly, "metric-only");
  assert.equal(existing.outcomes[0].outcome, "existing");
  assert.ok(existing.outcomes[0].observedMetrics.updated > 0);
  assert.equal(existing.outcomes[0].activityEventsInserted, 0);
  const second = facts();
  assert.equal(second.sync.content_revision, 1);
  assert.equal(second.payload.archive_sha256, first.payload.archive_sha256);
  assert.equal(second.payload.payload_saved_at, first.payload.payload_saved_at);
  assert.equal(second.payload.bytes, first.payload.bytes);
  assert.equal(second.events.length, first.events.length);
  assert.equal(second.metrics.find((row) => row.field_id === "customfield_12201")?.value_type, "number");
  assert.equal(second.metrics.find((row) => row.field_id === "customfield_12201")?.value_json, "526.56");

  const candidate = clone(metricOnly);
  candidate.issue.fields.customfield_50000 = "possible calculated value";
  const updated = write(candidate, "candidate");
  assert.equal(updated.outcomes[0].outcome, "updated");
  assert.equal(updated.outcomes[0].volatileFieldCandidates?.[0]?.fieldId, "customfield_50000");
  assert.equal(updated.outcomes[0].stableHashFieldDiff?.policyMutationPerformed, false);

  const legacyPath = path.join(root, "v0241-read-only.sqlite");
  fs.copyFileSync(databasePath, legacyPath);
  const legacyDb = new DatabaseSync(legacyPath);
  legacyDb.prepare("UPDATE database_metadata SET stable_hash_policy_version=3").run();
  legacyDb.close();
  const before = crypto.createHash("sha256").update(fs.readFileSync(legacyPath)).digest("hex");
  const inspection = checkCurrentStateDatabaseCompatibility(legacyPath, jira.serverIdentity);
  const after = crypto.createHash("sha256").update(fs.readFileSync(legacyPath)).digest("hex");
  assert.equal(inspection.status, "MIGRATION_REQUIRED");
  assert.equal(inspection.legacyReadOnly, true);
  assert.equal(after, before);

  console.log("v0.2.42 Stable Hash V4, exact registry, metrics, diagnostics, and V3 read-only tests passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
