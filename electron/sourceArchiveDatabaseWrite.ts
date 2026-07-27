import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  resolveInside,
  validateGeneratedJsonFile,
  verifyFileReference,
  type FileReference
} from "./fileBackedJson.js";
import {
  writeSourceArchiveBatch,
  type SourceArchiveBatchItem
} from "./sourceArchiveDatabase.js";
import type { StagingRun, StagingTarget } from "./fullFetchStaging.js";

export type JiraSourceProvenance = {
  sourceSystem: "jira";
  serverIdentity: string;
  baseUrlNormalized: string;
  serverTitle: string;
};

type DatabaseWriteInput = {
  operationId?: string;
  databasePath: string;
  run: StagingRun;
  currentJira: JiraSourceProvenance;
  observedAt?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeBaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function readNdjson(filePath: string) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

function verifiedPath(run: StagingRun, reference: FileReference) {
  const verification = verifyFileReference(run.dir, reference);
  if (!verification.ok) throw new Error(`SOURCE_ARCHIVE_UNSAFE:${reference.path}:${verification.errorCode}`);
  const ndjson = reference.path.endsWith(".ndjson");
  if (!validateGeneratedJsonFile(verification.filePath, ndjson)) {
    throw new Error(`SOURCE_ARCHIVE_UNSAFE:${reference.path}:canonical_json_unreadable`);
  }
  return verification.filePath;
}

function readCanonical(run: StagingRun, target: StagingTarget, key: string, ndjson = false) {
  const reference = target.canonicalFiles[key];
  if (!reference) throw new Error(`RAW_PAYLOAD_MISSING:${target.objectKey}:${key}`);
  const filePath = verifiedPath(run, reference);
  return ndjson ? readNdjson(filePath) : readJson(filePath);
}

function loadIssuePayload(run: StagingRun, target: StagingTarget) {
  const current = record(readCanonical(run, target, "currentIssueSnapshot"));
  const issue = {
    id: current.id ?? null,
    key: current.key ?? target.objectKey,
    self: current.self ?? null,
    fields: record(current.fields),
    renderedFields: record(current.renderedFields),
    names: record(current.names),
    schema: record(current.schema)
  };
  return {
    schemaVersion: "jira_issue_source_snapshot_v1",
    sourceSystem: "jira",
    objectType: "issue",
    issueKey: target.objectKey,
    issue,
    changelog: readCanonical(run, target, "changelog", true),
    comments: readCanonical(run, target, "comments", true),
    attachments: readCanonical(run, target, "attachments"),
    users: readCanonical(run, target, "users"),
    issueLinks: readCanonical(run, target, "issueLinks"),
    remoteLinks: readCanonical(run, target, "remoteLinks"),
    evidence: readCanonical(run, target, "evidence", true),
    normalizedCurrentFields: readCanonical(run, target, "normalizedCurrentFields")
  };
}

function eligibility(target: StagingTarget): SourceArchiveBatchItem["eligibility"] {
  if (target.status === "eligible") return "eligible";
  if (target.status === "partial" || target.status === "required_partial") return "partial";
  if (target.status === "failed_issue" || target.status === "failed_final"
    || target.status === "not_attempted_due_to_run_failure") return "failed";
  return "invalid";
}

function blocked(input: DatabaseWriteInput, reasonCode: string, message: string) {
  const now = new Date().toISOString();
  return {
    ok: false,
    operationId: input.operationId ?? "",
    status: "preflight_failed",
    reasonCode,
    message,
    targetDatabase: input.databasePath ? path.resolve(input.databasePath) : "",
    databaseId: "",
    boundJiraServer: "",
    preflightStatus: "BLOCKED",
    outcomes: [],
    summary: {
      eligible: 0,
      newObjects: 0,
      newVersions: 0,
      newPayloads: 0,
      newImportRefs: 0,
      existing: 0,
      excludedPartial: input.run.index.targets.filter((target) => ["partial", "required_partial"].includes(target.status)).length,
      excludedFailed: input.run.index.targets.filter((target) => ["failed_issue", "failed_final", "not_attempted_due_to_run_failure"].includes(target.status)).length,
      invalid: input.run.index.targets.filter((target) => ["pending", "in_progress", "excluded"].includes(target.status)).length,
      writeFailed: 0,
      rolledBack: 0
    },
    retries: 0,
    readbackVerified: false,
    foreignKeyCheck: "not_run",
    startedAt: now,
    finishedAt: now,
    durationMs: 0
  };
}

export function writeFullFetchStagingToCurrentDatabase(input: DatabaseWriteInput) {
  const operationId = input.operationId ?? `dbwrite-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const operation = { ...input, operationId };
  if (!path.isAbsolute(input.databasePath || "")) {
    return blocked(operation, "DATABASE_PATH_MISSING", "Current database path is missing or is not absolute.");
  }
  if (input.run.state.fullFetchRunId !== input.run.state.runContext.fullFetchRunId
    || input.run.state.stagingId !== input.run.state.runContext.stagingId) {
    return blocked(operation, "FULL_FETCH_RESULT_STALE", "Full Fetch staging identity is inconsistent.");
  }
  if (!input.run.state.countReconciliationPassed || input.run.state.remaining > 0
    || ["created", "running", "cancelled", "failed", "aborted_on_restart", "legacy_incomplete"].includes(input.run.state.status)) {
    return blocked(operation, "SOURCE_ARCHIVE_UNSAFE", "Full Fetch staging has not passed its integrity and completion gates.");
  }
  const provenance = input.run.state.runContext.sourceProvenance;
  if (!provenance?.serverIdentity || !provenance.baseUrlNormalized
    || !input.currentJira.serverIdentity || !input.currentJira.baseUrlNormalized) {
    return blocked(operation, "SOURCE_SERVER_IDENTITY_MISSING", "Verified Jira server provenance is missing.");
  }
  if (provenance.serverIdentity !== input.currentJira.serverIdentity
    || normalizeBaseUrl(provenance.baseUrlNormalized) !== normalizeBaseUrl(input.currentJira.baseUrlNormalized)) {
    return blocked(operation, "SOURCE_SERVER_MISMATCH", "Full Fetch provenance does not match the current Jira server.");
  }

  try {
    for (const target of input.run.index.targets.filter((item) => item.status === "eligible")) {
      if (!target.issueManifestRef) throw new Error(`SOURCE_ARCHIVE_UNSAFE:${target.objectKey}:manifest_missing`);
      verifiedPath(input.run, target.issueManifestRef);
      for (const reference of Object.values(target.canonicalFiles)) verifiedPath(input.run, reference);
    }
  } catch {
    return blocked(operation, "SOURCE_ARCHIVE_UNSAFE", "One or more eligible canonical files failed integrity verification.");
  }

  const items: SourceArchiveBatchItem[] = input.run.index.targets.map((target) => ({
    sourceSystem: "jira",
    objectType: "issue",
    objectKey: target.objectKey,
    rawJson: undefined,
    loadRawJson: target.status === "eligible" ? () => loadIssuePayload(input.run, target) : undefined,
    observedAt: input.observedAt,
    importRef: {
      sourceBundleName: input.run.state.stagingId,
      sourceFileName: `${target.objectKey}.source-snapshot.json`,
      sourceJsonPath: "$"
    },
    eligibility: eligibility(target)
  }));
  return writeSourceArchiveBatch({
    operationId,
    databasePath: input.databasePath,
    jira: {
      serverIdentity: provenance.serverIdentity,
      baseUrlNormalized: provenance.baseUrlNormalized,
      serverTitle: provenance.serverTitle
    },
    items,
    observedAt: input.observedAt
  });
}
