import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  SourceArchiveRepository,
  createSourceArchiveDatabase,
  writeSourceArchiveBatch
} from "./sourceArchiveDatabase.js";
import {
  completeTarget,
  createStagingRun,
  finalizeStagingRun,
  startTarget
} from "./fullFetchStaging.js";
import { writeFullFetchStagingToCurrentDatabase } from "./sourceArchiveDatabaseWrite.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0238-"));
const jira = {
  sourceSystem: "jira" as const,
  serverIdentity: "jira:synthetic-server-a",
  baseUrlNormalized: "https://jira.synthetic.invalid",
  serverTitle: "Synthetic Jira A"
};

function count(databasePath: string, table: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  } finally {
    db.close();
  }
}

function counts(databasePath: string) {
  return {
    bindings: count(databasePath, "source_system_bindings"),
    objects: count(databasePath, "source_objects"),
    versions: count(databasePath, "source_object_versions"),
    payloads: count(databasePath, "source_payloads"),
    refs: count(databasePath, "source_import_refs")
  };
}

function pagination(total = 0) {
  return { reportedTotal: total, fetchedCount: total, pageCount: 1, paginationComplete: true, duplicateCount: 0 };
}

function envelope(issueKey: string, summary: string, projectKey: string) {
  return {
    issue: {
      id: issueKey.replace(/\D/g, "") || "1",
      key: issueKey,
      self: `https://jira.synthetic.invalid/rest/api/2/issue/${issueKey}`,
      fields: {
        summary,
        description: `Description for ${issueKey}`,
        status: { name: "In Progress" },
        assignee: { displayName: "Synthetic Assignee" },
        reporter: { displayName: "Synthetic Reporter" },
        creator: { displayName: "Synthetic Creator" },
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        labels: ["synthetic", projectKey.toLowerCase()],
        project: { key: projectKey },
        customfield_10000: "2026-07-01",
        duedate: "2026-08-01",
        updated: "2026-07-25T12:00:00.000Z"
      },
      names: { customfield_10000: "Start Date" },
      schema: { customfield_10000: { type: "date" } },
      renderedFields: {}
    },
    changelogHistories: [{ id: "ch-1", items: [{ field: "status", fromString: "Open", toString: "In Progress" }] }],
    comments: [{ id: "comment-1", body: "Synthetic comment" }],
    attachments: [{ id: "attachment-1", filename: "synthetic.txt", size: 123 }],
    parsedUsers: [{ accountId: "synthetic-user", displayName: "Synthetic User" }],
    evidenceEvents: [{ type: "comment", issueKey }],
    issueLinks: [{ type: "relates to", issueKey: "SYN-999" }],
    remoteLinks: [],
    endpointMetadata: [
      { method: "GET", endpoint: `/issue/${issueKey}`, status: 200 },
      { method: "GET", endpoint: `/issue/${issueKey}/comment`, status: 200 }
    ],
    requestMetadata: { apiVersion: "v2", fetchedAt: "2026-07-25T12:01:00.000Z" },
    paginationMetadata: { changelog: pagination(1), comments: pagination(1) },
    completenessMetadata: { requiredMissingSections: [] }
  };
}

function complete(run: ReturnType<typeof createStagingRun>, issueKey: string, summary: string, projectKey: string, status: "eligible" | "partial" = "eligible") {
  startTarget(run, issueKey);
  completeTarget(run, issueKey, {
    status,
    rawEnvelope: envelope(issueKey, summary, projectKey),
    missingSections: status === "partial" ? ["comments"] : [],
    classification: status === "eligible" ? "complete" : "partial_response"
  });
}

function createFixtureRun(name: string, entries: Array<{ key: string; status: "eligible" | "partial" | "failed"; summary?: string; project?: string }>) {
  const run = createStagingRun(path.join(root, "staging"), {
    runId: name,
    selectedUser: "synthetic-user",
    queue: entries.map((entry) => ({ key: entry.key })),
    runContext: { sourceProvenance: jira }
  });
  for (const entry of entries) {
    if (entry.status === "failed") {
      startTarget(run, entry.key);
      completeTarget(run, entry.key, { status: "failed", errorType: "synthetic_failure", errorMessage: "Synthetic failure" });
    } else {
      complete(run, entry.key, entry.summary ?? `Summary ${entry.key}`, entry.project ?? entry.key.split("-")[0], entry.status);
    }
  }
  finalizeStagingRun(run);
  return run;
}

try {
  fs.mkdirSync(path.join(root, "staging"), { recursive: true });
  const databasePath = path.join(root, "source-archive.sqlite");
  createSourceArchiveDatabase({ targetPath: databasePath, appVersion: "0.2.37", now: "2026-07-25T00:00:00.000Z" });
  assert.deepEqual(counts(databasePath), { bindings: 0, objects: 0, versions: 0, payloads: 0, refs: 0 });

  const mixed = createFixtureRun("synthetic-first", [
    { key: "SYN-101", status: "eligible", project: "SYN" },
    { key: "ALT-202", status: "eligible", project: "ALT" },
    { key: "SYN-303", status: "partial" },
    { key: "SYN-404", status: "failed" }
  ]);
  const first = writeFullFetchStagingToCurrentDatabase({
    operationId: "operation-first",
    databasePath,
    run: mixed,
    currentJira: jira,
    observedAt: "2026-07-25T13:00:00.000Z"
  });
  assert.equal(first.status, "completed");
  assert.equal(first.summary.eligible, 2);
  assert.equal(first.summary.excludedPartial, 1);
  assert.equal(first.summary.excludedFailed, 1);
  assert.equal(first.summary.invalid, 0);
  assert.equal(first.summary.newObjects, 2);
  assert.equal(first.readbackVerified, true);
  assert.deepEqual(counts(databasePath), { bindings: 1, objects: 2, versions: 2, payloads: 2, refs: 2 });

  const beforeInvalid = counts(databasePath);
  const invalid = writeSourceArchiveBatch({
    operationId: "operation-invalid",
    databasePath,
    jira,
    items: [{
      sourceSystem: "jira", objectType: "issue", objectKey: "INVALID", rawJson: { issue: { key: "INVALID", fields: {} } },
      eligibility: "invalid", importRef: { sourceBundleName: "invalid", sourceFileName: "invalid.json", sourceJsonPath: "$" }
    }]
  });
  assert.equal(invalid.summary.invalid, 1);
  assert.deepEqual(counts(databasePath), beforeInvalid);

  const firstSeenDb = new DatabaseSync(databasePath, { readOnly: true });
  const firstSeen = firstSeenDb.prepare("SELECT first_seen_at, last_seen_at FROM source_objects WHERE object_key='SYN-101'").get() as { first_seen_at: string; last_seen_at: string };
  const jiraVersion = firstSeenDb.prepare(`SELECT source_version_number FROM source_object_versions v
    JOIN source_objects o ON o.source_object_id=v.source_object_id WHERE o.object_key='SYN-101'`).get() as { source_version_number: number | null };
  assert.equal(jiraVersion.source_version_number, null);
  assert.deepEqual(firstSeenDb.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((firstSeenDb.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  firstSeenDb.close();

  const duplicate = writeFullFetchStagingToCurrentDatabase({
    operationId: "operation-duplicate",
    databasePath,
    run: mixed,
    currentJira: jira,
    observedAt: "2026-07-25T14:00:00.000Z"
  });
  assert.equal(duplicate.summary.existing, 2);
  assert.equal(duplicate.summary.newVersions, 0);
  assert.deepEqual(counts(databasePath), { bindings: 1, objects: 2, versions: 2, payloads: 2, refs: 2 });
  const duplicateDb = new DatabaseSync(databasePath, { readOnly: true });
  const afterDuplicate = duplicateDb.prepare("SELECT first_seen_at, last_seen_at FROM source_objects WHERE object_key='SYN-101'").get() as { first_seen_at: string; last_seen_at: string };
  duplicateDb.close();
  assert.equal(afterDuplicate.first_seen_at, firstSeen.first_seen_at);
  assert.notEqual(afterDuplicate.last_seen_at, firstSeen.last_seen_at);

  const changed = createFixtureRun("synthetic-changed", [
    { key: "SYN-101", status: "eligible", summary: "Meaningfully changed summary", project: "SYN" }
  ]);
  const changedResult = writeFullFetchStagingToCurrentDatabase({
    databasePath,
    run: changed,
    currentJira: jira,
    observedAt: "2026-07-25T15:00:00.000Z"
  });
  assert.equal(changedResult.summary.newObjects, 0);
  assert.equal(changedResult.summary.newVersions, 1);
  assert.deepEqual(counts(databasePath), { bindings: 1, objects: 2, versions: 3, payloads: 3, refs: 3 });
  const repository = new SourceArchiveRepository(databasePath);
  const versionIdsDb = new DatabaseSync(databasePath, { readOnly: true });
  const versionIds = versionIdsDb.prepare(`SELECT v.source_object_version_id FROM source_object_versions v
    JOIN source_objects o ON o.source_object_id=v.source_object_id WHERE o.object_key='SYN-101' ORDER BY v.first_seen_at`).all() as Array<{ source_object_version_id: string }>;
  versionIdsDb.close();
  assert.equal(versionIds.length, 2);
  const oldSnapshot = repository.readSnapshot(versionIds[0].source_object_version_id)!;
  const newSnapshot = repository.readSnapshot(versionIds[1].source_object_version_id)!;
  assert.notEqual(oldSnapshot.contentHash, newSnapshot.contentHash);
  assert.equal((record(record(newSnapshot.rawJson).issue).fields as Record<string, unknown>).summary, "Meaningfully changed summary");
  assert.equal(Array.isArray(record(newSnapshot.rawJson).comments), true);
  assert.equal(Array.isArray(record(newSnapshot.rawJson).changelog), true);
  repository.close();

  const beforeFault = counts(databasePath);
  const fault = writeSourceArchiveBatch({
    operationId: "operation-fault",
    databasePath,
    jira,
    observedAt: "2026-07-25T16:00:00.000Z",
    items: [
      {
        sourceSystem: "jira", objectType: "issue", objectKey: "SYN-500", rawJson: { issue: { key: "SYN-500", fields: { summary: "success" } } },
        eligibility: "eligible", importRef: { sourceBundleName: "fault", sourceFileName: "SYN-500.json", sourceJsonPath: "$" }
      },
      {
        sourceSystem: "jira", objectType: "issue", objectKey: "SYN-501", rawJson: { issue: { key: "SYN-501", fields: { summary: "rollback" } } },
        eligibility: "eligible", importRef: { sourceBundleName: "fault", sourceFileName: "SYN-501.json", sourceJsonPath: "$" },
        simulateFailureAfterPayload: true
      }
    ]
  });
  assert.equal(fault.status, "completed_with_errors");
  assert.equal(fault.summary.rolledBack, 1);
  assert.equal(count(databasePath, "source_objects"), beforeFault.objects + 1);
  const faultDb = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal((faultDb.prepare("SELECT COUNT(*) AS count FROM source_objects WHERE object_key='SYN-501'").get() as { count: number }).count, 0);
  assert.deepEqual(faultDb.prepare("PRAGMA foreign_key_check").all(), []);
  faultDb.close();

  const unboundFailurePath = path.join(root, "unbound-failure.sqlite");
  createSourceArchiveDatabase({ targetPath: unboundFailurePath, appVersion: "0.2.37" });
  const allFailed = writeSourceArchiveBatch({
    operationId: "operation-all-failed",
    databasePath: unboundFailurePath,
    jira,
    items: [{
      sourceSystem: "jira", objectType: "issue", objectKey: "SYN-600", rawJson: { issue: { key: "SYN-600", fields: {} } },
      eligibility: "eligible", importRef: { sourceBundleName: "all-failed", sourceFileName: "SYN-600.json", sourceJsonPath: "$" },
      simulateFailureAtImportRef: true
    }]
  });
  assert.equal(allFailed.reasonCode, "TRANSACTION_ROLLED_BACK");
  assert.deepEqual(counts(unboundFailurePath), { bindings: 0, objects: 0, versions: 0, payloads: 0, refs: 0 });

  const beforeMismatch = counts(databasePath);
  const mismatch = writeSourceArchiveBatch({
    operationId: "operation-mismatch",
    databasePath,
    jira: { ...jira, serverIdentity: "jira:synthetic-server-b", baseUrlNormalized: "https://jira-b.synthetic.invalid" },
    items: [{
      sourceSystem: "jira", objectType: "issue", objectKey: "SYN-700", rawJson: { issue: { key: "SYN-700", fields: {} } },
      eligibility: "eligible", importRef: { sourceBundleName: "mismatch", sourceFileName: "SYN-700.json", sourceJsonPath: "$" }
    }]
  });
  assert.equal(mismatch.reasonCode, "SOURCE_SERVER_MISMATCH");
  assert.deepEqual(counts(databasePath), beforeMismatch);

  const missing = writeSourceArchiveBatch({
    operationId: "operation-missing",
    databasePath: path.join(root, "does-not-exist.sqlite"),
    jira,
    items: []
  });
  assert.equal(missing.reasonCode, "DATABASE_PATH_MISSING");

  const mainSource = fs.readFileSync(path.join(process.cwd(), "electron", "main.ts"), "utf8");
  const preloadSource = fs.readFileSync(path.join(process.cwd(), "electron", "preload.ts"), "utf8");
  const rendererSource = fs.readFileSync(path.join(process.cwd(), "src", "routes", "AnalysisPage.tsx"), "utf8");
  assert.match(mainSource, /writeFullFetchStagingToCurrentDatabase/);
  assert.match(mainSource, /user-analysis:save-full-fetch-result/);
  assert.match(preloadSource, /saveFullFetchResult/);
  assert.match(rendererSource, /stage5-database-write-result/);
  assert.match(rendererSource, /lastDatabaseWriteResult/);
  assert.doesNotMatch(JSON.stringify({ first, duplicate, changedResult, fault }), /fixture-token|Authorization|compressed_payload|Synthetic comment/);

  console.log("v0.2.38 Source Archive database write correctness tests passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
