import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  SOURCE_ARCHIVE_V1_SCHEMA_SQL,
  createSourceArchiveDatabase,
  migrateSourceArchiveDatabase,
  updateJiraBindingMetadata,
  writeSourceArchiveBatch
} from "./sourceArchiveDatabase.js";
import {
  buildStableSourceProjection,
  meaningfulChangedPaths
} from "./stableSourceProjection.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0239-"));
const jira = {
  sourceSystem: "jira" as const,
  serverIdentity: "jira:synthetic-v0239",
  baseUrlNormalized: "https://jira.synthetic.invalid",
  serverTitle: "Synthetic Jira Server",
  serverTitleStatus: "verified" as const,
  connectionLabel: "Synthetic Production"
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function payload() {
  return {
    schemaVersion: "jira_issue_source_snapshot_v1",
    sourceSystem: "jira",
    objectType: "issue",
    issueKey: "SYN-239",
    issue: {
      id: "239",
      key: "SYN-239",
      fields: {
        summary: "Stable source fixture",
        description: "Initial description",
        created: "2026-07-01T01:00:00+08:00",
        updated: "2026-07-27T01:00:00+08:00",
        status: { id: "3", name: "In Progress" },
        assignee: { accountId: "user-1", displayName: "Synthetic User" },
        creator: { accountId: "user-2", displayName: "Synthetic Creator" },
        labels: ["beta", "alpha"],
        customfield_10900: "com.synthetic.PluginValue@7a3f91c2",
        customfield_20000: "meaningful custom value"
      }
    },
    changelog: [{
      id: "history-1",
      created: "2026-07-27T01:00:00Z",
      author: { accountId: "user-1", displayName: "Synthetic User" },
      items: [{ fieldId: "status", field: "status", fromString: "Open", toString: "In Progress" }]
    }],
    comments: [{
      id: "comment-1",
      created: "2026-07-27T02:00:00Z",
      updated: "2026-07-27T02:00:00Z",
      author: { accountId: "user-1", displayName: "Synthetic User" },
      body: "Initial comment"
    }],
    attachments: [{
      id: "attachment-1",
      created: "2026-07-27T03:00:00Z",
      filename: "fixture.txt",
      size: 42
    }],
    users: [{ accountId: "user-1", displayName: "Synthetic User" }],
    issueLinks: [{ id: "link-1", type: "relates to", issueKey: "SYN-240" }],
    remoteLinks: [],
    normalizedCurrentFields: { fetchedAt: "2026-07-27T04:00:00Z", status: "In Progress" },
    evidence: [{ selectedUser: "user-1", reason: "fixture" }]
  };
}

function item(rawJson: unknown, bundle: string) {
  return {
    sourceSystem: "jira" as const,
    objectType: "issue" as const,
    objectKey: "SYN-239",
    rawJson,
    eligibility: "eligible" as const,
    importRef: {
      sourceBundleName: bundle,
      sourceFileName: "SYN-239.json",
      sourceJsonPath: "$"
    }
  };
}

function counts(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return {
      objects: count("source_objects"),
      versions: count("source_object_versions"),
      payloads: count("source_payloads"),
      refs: count("source_import_refs"),
      events: count("activity_events")
    };
  } finally {
    db.close();
  }
}

function createV1Database(databasePath: string, payloads: unknown[]) {
  const db = new DatabaseSync(databasePath);
  const now = "2026-07-27T00:00:00.000Z";
  const databaseId = "database-v1-fixture";
  const sourceObjectId = "object-v1-fixture";
  db.exec(SOURCE_ARCHIVE_V1_SCHEMA_SQL);
  db.prepare("INSERT INTO database_metadata VALUES ('primary', ?, 'jira_activity_analyzer', 'source_archive_db', 1, ?, ?, '0.2.38')")
    .run(databaseId, now, now);
  db.prepare("INSERT INTO source_system_bindings VALUES (?, ?, 'jira', ?, ?, ?, ?, ?)")
    .run("binding-v1", databaseId, jira.serverIdentity, jira.baseUrlNormalized, jira.connectionLabel, now, now);
  db.prepare("INSERT INTO source_objects VALUES (?, 'jira', 'issue', 'SYN-239', ?, ?, ?)")
    .run(sourceObjectId, now, now, now);
  const originalBytes: Buffer[] = [];
  payloads.forEach((rawJson, index) => {
    const bytes = Buffer.from(JSON.stringify(rawJson), "utf8");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const versionId = `version-v1-${index + 1}`;
    originalBytes.push(bytes);
    db.prepare("INSERT INTO source_object_versions VALUES (?, ?, ?, NULL, ?, ?, ?, ?)")
      .run(versionId, sourceObjectId, hash, now, now, now, now);
    const compressed = gzipSync(bytes);
    db.prepare("INSERT INTO source_payloads VALUES (?, ?, 'json', 'utf-8', 'gzip', ?, ?, ?, ?)")
      .run(`payload-v1-${index + 1}`, versionId, compressed, bytes.byteLength, compressed.byteLength, now);
    db.prepare("INSERT INTO source_import_refs VALUES (?, ?, ?, ?, '$', ?)")
      .run(`ref-v1-${index + 1}`, versionId, `bundle-${index + 1}`, "SYN-239.json", now);
  });
  db.close();
  return originalBytes;
}

try {
  const base = payload();
  const stable = buildStableSourceProjection(base, jira.serverIdentity);
  const volatileOnly = clone(base);
  volatileOnly.normalizedCurrentFields.fetchedAt = "2026-07-27T09:00:00Z";
  volatileOnly.evidence = [{ selectedUser: "another-user", reason: "another filter" }];
  volatileOnly.issue.fields.customfield_10900 = "com.synthetic.PluginValue@abcdef12";
  assert.equal(buildStableSourceProjection(volatileOnly, jira.serverIdentity).stableVersionHash, stable.stableVersionHash);

  const ordinaryAtSign = clone(base);
  ordinaryAtSign.issue.fields.customfield_10900 = "person@example.invalid";
  assert.notEqual(buildStableSourceProjection(ordinaryAtSign, jira.serverIdentity).stableVersionHash, stable.stableVersionHash);
  const meaningfulCustom = clone(base);
  meaningfulCustom.issue.fields.customfield_20000 = "changed custom value";
  assert.notEqual(buildStableSourceProjection(meaningfulCustom, jira.serverIdentity).stableVersionHash, stable.stableVersionHash);
  const reordered = clone(base);
  reordered.issue.fields.labels.reverse();
  reordered.comments.reverse();
  assert.equal(buildStableSourceProjection(reordered, jira.serverIdentity).stableVersionHash, stable.stableVersionHash);
  const changedDescription = clone(base);
  changedDescription.issue.fields.description = "Changed description";
  const changedProjection = buildStableSourceProjection(changedDescription, jira.serverIdentity);
  assert.notEqual(changedProjection.stableVersionHash, stable.stableVersionHash);
  assert.ok(meaningfulChangedPaths(stable.projection, changedProjection.projection).includes("issue.fields.description"));
  assert.deepEqual(stable.excludedPaths, ["evidence", "normalizedCurrentFields.fetchedAt"]);
  assert.ok(stable.normalizedPaths.includes("issue.fields.customfield_10900"));

  const databasePath = path.join(root, "source-archive-v2.sqlite");
  createSourceArchiveDatabase({ targetPath: databasePath, appVersion: "0.2.39" });
  const first = writeSourceArchiveBatch({ operationId: "v0239-first", databasePath, jira, items: [item(base, "first")] });
  assert.equal(first.outcomes[0]?.outcome, "new_object");
  assert.equal(first.summary.activityEventsInserted, 5);
  const firstCounts = counts(databasePath);
  assert.deepEqual(firstCounts, { objects: 1, versions: 1, payloads: 1, refs: 1, events: 5 });

  const duplicate = writeSourceArchiveBatch({ operationId: "v0239-duplicate", databasePath, jira, items: [item(volatileOnly, "duplicate")] });
  assert.equal(duplicate.outcomes[0]?.outcome, "duplicate");
  assert.equal(duplicate.summary.duplicates, 1);
  assert.equal(duplicate.summary.newVersions, 0);
  assert.equal(duplicate.summary.activityEventsInserted, 0);
  assert.deepEqual(counts(databasePath), firstCounts);

  const realChange = clone(base);
  realChange.issue.fields.status = { id: "5", name: "Resolved" };
  realChange.changelog.push({
    id: "history-2",
    created: "2026-07-27T10:00:00Z",
    author: { accountId: "user-1", displayName: "Synthetic User" },
    items: [{ fieldId: "status", field: "status", fromString: "In Progress", toString: "Resolved" }]
  });
  realChange.comments.push({
    id: "comment-2",
    created: "2026-07-27T10:30:00Z",
    updated: "2026-07-27T10:30:00Z",
    author: { accountId: "user-1", displayName: "Synthetic User" },
    body: "Resolution verified"
  });
  const second = writeSourceArchiveBatch({ operationId: "v0239-changed", databasePath, jira, items: [item(realChange, "changed")] });
  assert.equal(second.outcomes[0]?.outcome, "new_version");
  assert.ok(second.outcomes[0]?.meaningfulChangedPaths?.some((entry) => entry.includes("status")));
  assert.deepEqual(counts(databasePath), { objects: 1, versions: 2, payloads: 2, refs: 2, events: 7 });

  const legacyPath = path.join(root, "legacy-v1.sqlite");
  const legacyVolatile = clone(base);
  legacyVolatile.evidence = [{ selectedUser: "legacy-other", reason: "legacy fixture" }];
  const originalBytes = createV1Database(legacyPath, [base, legacyVolatile]);
  const migration = migrateSourceArchiveDatabase({
    databasePath: legacyPath,
    appVersion: "0.2.39",
    now: "2026-07-27T11:00:00.000Z"
  });
  assert.equal(migration.status, "completed");
  assert.equal(migration.backupValidated, true);
  assert.equal(migration.stableHashBackfilled, 2);
  assert.equal(migration.legacyDuplicateGroups.length, 1);
  assert.ok(fs.existsSync(migration.backupPath));
  const migrated = new DatabaseSync(legacyPath, { readOnly: true });
  assert.equal((migrated.prepare("SELECT schema_version FROM database_metadata").get() as { schema_version: number }).schema_version, 2);
  assert.equal((migrated.prepare("SELECT connection_label FROM source_system_bindings").get() as { connection_label: string }).connection_label, jira.connectionLabel);
  assert.equal((migrated.prepare("SELECT server_title FROM source_system_bindings").get() as { server_title: string | null }).server_title, null);
  assert.equal((migrated.prepare("SELECT COUNT(*) AS count FROM source_object_versions WHERE version_identity_status='legacy_unverified'").get() as { count: number }).count, 2);
  const migratedBytes = (migrated.prepare("SELECT compressed_payload FROM source_payloads ORDER BY source_payload_id").all() as Array<{ compressed_payload: Uint8Array }>)
    .map((row) => Buffer.from(row.compressed_payload));
  migrated.close();
  const backup = new DatabaseSync(migration.backupPath, { readOnly: true });
  const backupBytes = (backup.prepare("SELECT compressed_payload FROM source_payloads ORDER BY source_payload_id").all() as Array<{ compressed_payload: Uint8Array }>)
    .map((row) => Buffer.from(row.compressed_payload));
  backup.close();
  assert.deepEqual(migratedBytes, backupBytes);
  assert.equal(originalBytes.length, migratedBytes.length);
  assert.equal(migrateSourceArchiveDatabase({ databasePath: legacyPath, appVersion: "0.2.39" }).status, "not_required");
  assert.deepEqual(updateJiraBindingMetadata({
    databasePath: legacyPath,
    serverIdentity: jira.serverIdentity,
    serverTitle: "Verified Synthetic Jira",
    serverTitleStatus: "verified",
    connectionLabel: jira.connectionLabel
  }), { ok: true, reasonCode: "BINDING_METADATA_UPDATED" });
  const titleDb = new DatabaseSync(legacyPath, { readOnly: true });
  const titleRow = titleDb.prepare("SELECT server_title, connection_label, server_title_status FROM source_system_bindings").get();
  titleDb.close();
  const titleRecord = titleRow as { server_title: string; connection_label: string; server_title_status: string };
  assert.equal(titleRecord.server_title, "Verified Synthetic Jira");
  assert.equal(titleRecord.connection_label, jira.connectionLabel);
  assert.equal(titleRecord.server_title_status, "verified");

  const rollbackPath = path.join(root, "legacy-rollback.sqlite");
  createV1Database(rollbackPath, [base]);
  const rollback = migrateSourceArchiveDatabase({
    databasePath: rollbackPath,
    appVersion: "0.2.39",
    simulateFailureAfterBackfill: true
  });
  assert.equal(rollback.status, "failed");
  assert.equal(rollback.reasonCode, "MIGRATION_FAILED");
  assert.ok(fs.existsSync(rollback.backupPath));
  const rollbackDb = new DatabaseSync(rollbackPath, { readOnly: true });
  assert.equal((rollbackDb.prepare("SELECT schema_version FROM database_metadata").get() as { schema_version: number }).schema_version, 1);
  assert.equal((rollbackDb.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('source_object_versions') WHERE name='stable_version_hash'").get() as { count: number }).count, 0);
  rollbackDb.close();

  const backupFailurePath = path.join(root, "legacy-backup-failure.sqlite");
  createV1Database(backupFailurePath, [base]);
  const backupFailure = migrateSourceArchiveDatabase({
    databasePath: backupFailurePath,
    appVersion: "0.2.39",
    simulateBackupFailure: true
  });
  assert.equal(backupFailure.reasonCode, "MIGRATION_BACKUP_FAILED");
  assert.equal(backupFailure.backupPath, "");

  const validationFailurePath = path.join(root, "legacy-backup-validation-failure.sqlite");
  createV1Database(validationFailurePath, [base]);
  const validationFailure = migrateSourceArchiveDatabase({
    databasePath: validationFailurePath,
    appVersion: "0.2.39",
    simulateBackupValidationFailure: true
  });
  assert.equal(validationFailure.reasonCode, "MIGRATION_BACKUP_VALIDATION_FAILED");
  assert.ok(fs.existsSync(validationFailure.backupPath));
  const validationFailureDb = new DatabaseSync(validationFailurePath, { readOnly: true });
  assert.equal((validationFailureDb.prepare("SELECT schema_version FROM database_metadata").get() as { schema_version: number }).schema_version, 1);
  validationFailureDb.close();

  const corruptPath = path.join(root, "legacy-corrupt-payload.sqlite");
  createV1Database(corruptPath, [base]);
  const corruptDb = new DatabaseSync(corruptPath);
  corruptDb.prepare("UPDATE source_object_versions SET content_hash=?").run("0".repeat(64));
  corruptDb.close();
  const corruptMigration = migrateSourceArchiveDatabase({ databasePath: corruptPath, appVersion: "0.2.39" });
  assert.equal(corruptMigration.status, "failed");
  assert.match(corruptMigration.message, /PAYLOAD_ARCHIVE_HASH_MISMATCH/);
  const corruptAfter = new DatabaseSync(corruptPath, { readOnly: true });
  assert.equal((corruptAfter.prepare("SELECT schema_version FROM database_metadata").get() as { schema_version: number }).schema_version, 1);
  corruptAfter.close();

  console.log("v0.2.39 stable Source Archive, activity events, and migration tests passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
