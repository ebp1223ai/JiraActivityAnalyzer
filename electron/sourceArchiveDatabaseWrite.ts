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
  writeCurrentStateBatch,
  type CurrentStateCandidate
} from "./currentStateArchive.js";
import type { StagingRun, StagingTarget } from "./fullFetchStaging.js";
import { buildStableIssueContentV4, resolveEffectiveStableHashPolicyV4 } from "./stableIssueContentV4.js";
import type { CoverageEvidence, CoverageProfile, CoverageState } from "./coverageProfile.js";

export type JiraSourceProvenance = {
  sourceSystem: "jira";
  serverIdentity: string;
  baseUrlNormalized: string;
  serverTitle: string;
  serverTitleStatus?: "verified" | "unverified";
  connectionLabel?: string;
};

type DatabaseWriteInput = {
  operationId?: string;
  databasePath: string;
  run: StagingRun;
  currentJira: JiraSourceProvenance;
  observedAt?: string;
  diagnosticsDir?: string;
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
  const issueLinks = readCanonical(run, target, "issueLinks");
  const fields = { ...record(current.fields) };
  if (!Object.prototype.hasOwnProperty.call(fields, "issuelinks") && Array.isArray(issueLinks)) {
    fields.issuelinks = issueLinks;
  }
  const issue = {
    id: current.id ?? null,
    key: current.key ?? target.objectKey,
    self: current.self ?? null,
    fields,
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
    issueLinks,
    remoteLinks: readCanonical(run, target, "remoteLinks"),
    evidence: readCanonical(run, target, "evidence", true),
    normalizedCurrentFields: readCanonical(run, target, "normalizedCurrentFields")
  };
}

function coverageState(target: StagingTarget, names: string[], disabled = false): CoverageState {
  if (disabled) return "Disabled";
  const entry = target.coverage.find((item) => names.some((name) => item.category.toLowerCase().includes(name)));
  if (!entry) return "Skipped";
  if (entry.status === "failed") return "Failed";
  if (["partial", "permission_limited", "unsupported"].includes(entry.status)) return "Partial";
  if (!entry.requested && !entry.attempted) return "Skipped";
  return Number(entry.recordCount) > 0 ? "CompleteNonEmpty" : "CompleteEmpty";
}

function coverageEvidence(
  target: StagingTarget,
  names: string[],
  source: string,
  disabled = false
): CoverageEvidence {
  const status = coverageState(target, names, disabled);
  const entry = target.coverage.find((item) => names.some((name) => item.category.toLowerCase().includes(name)));
  return {
    status,
    itemCount: disabled ? 0 : Number(entry?.recordCount ?? 0),
    source,
    requestCompleted: status === "CompleteEmpty" || status === "CompleteNonEmpty",
    validationResult: status === "Disabled" || status === "Skipped" ? "not_applicable"
      : status === "CompleteEmpty" || status === "CompleteNonEmpty" ? "passed" : "failed",
    reasonCode: disabled ? `${source.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_DISABLED`
      : entry?.status === "complete" ? `${source.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_COMPLETE`
        : `${source.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${status.toUpperCase()}`
  };
}

function targetCoverage(run: StagingRun, target: StagingTarget): CoverageProfile {
  const remoteLinksEnabled = Boolean(run.state.runContext.fetchRemoteLinks);
  const issueLinksValue = target.status === "eligible" ? readCanonical(run, target, "issueLinks") : null;
  const issueLinksValid = Array.isArray(issueLinksValue);
  const issueLinksState: CoverageState = !issueLinksValid
    ? "Partial"
    : issueLinksValue.length > 0 ? "CompleteNonEmpty" : "CompleteEmpty";
  const profile: CoverageProfile = {
    fetchProfileVersion: 1,
    coreFields: target.status === "eligible" ? "CompleteNonEmpty" : "Partial",
    changelog: coverageState(target, ["changelog", "history"]),
    comments: coverageState(target, ["comment"]),
    attachmentsMetadata: coverageState(target, ["attachment"]),
    issueLinks: issueLinksState,
    remoteLinks: coverageState(target, ["remote link", "remotelink"], !remoteLinksEnabled),
    parentSubtasks: coverageState(target, ["parent", "subtask"]),
    relatedIssues: run.state.runContext.relatedIssuesStatus === "skipped"
      ? "Skipped"
      : coverageState(target, ["related"]),
    conservationPassed: target.status === "eligible" && target.partialReasons.length === 0
  };
  profile.evidence = {
    coreFields: {
      status: profile.coreFields,
      itemCount: profile.coreFields === "CompleteNonEmpty" ? 1 : 0,
      source: "issue.fields",
      requestCompleted: target.status === "eligible",
      validationResult: target.status === "eligible" ? "passed" : "failed",
      reasonCode: target.status === "eligible" ? "CORE_FIELDS_COMPLETE" : "CORE_FIELDS_INCOMPLETE"
    },
    changelog: coverageEvidence(target, ["changelog", "history"], "changelog"),
    comments: coverageEvidence(target, ["comment"], "comments"),
    attachmentsMetadata: coverageEvidence(target, ["attachment"], "issue.fields.attachment"),
    issueLinks: {
      status: issueLinksState,
      itemCount: issueLinksValid ? issueLinksValue.length : 0,
      source: "issue.fields.issuelinks",
      requestCompleted: issueLinksValid,
      validationResult: issueLinksValid ? "passed" : "failed",
      reasonCode: issueLinksValid ? "ISSUE_LINKS_FIELD_COMPLETE" : "ISSUE_LINKS_FIELD_INVALID"
    },
    remoteLinks: coverageEvidence(target, ["remote link", "remotelink"], "remoteLinks", !remoteLinksEnabled),
    parentSubtasks: coverageEvidence(target, ["parent", "subtask"], "issue.fields.parent/subtasks"),
    relatedIssues: run.state.runContext.relatedIssuesStatus === "skipped"
      ? {
          status: "Skipped",
          itemCount: 0,
          source: "relatedIssuesDiscovery",
          requestCompleted: false,
          validationResult: "not_applicable",
          reasonCode: "RELATED_ISSUES_DISCOVERY_SKIPPED"
        }
      : coverageEvidence(target, ["related"], "relatedIssuesDiscovery")
  };
  return profile;
}

export function buildSourceVersionProjectionDiagnostics(
  run: StagingRun,
  databaseWrite: { outcomes?: unknown[] }
) {
  const outcomes = new Map((Array.isArray(databaseWrite.outcomes) ? databaseWrite.outcomes : [])
    .map(record)
    .map((outcome) => [String(outcome.objectKey ?? "").toUpperCase(), outcome]));
  const serverIdentity = String(run.state.runContext.sourceProvenance?.serverIdentity ?? "");
  return run.index.targets
    .filter((target) => target.status === "eligible")
    .map((target) => {
      const payload = loadIssuePayload(run, target);
      const issue = record(record(payload).issue);
      const resolvedPolicy = resolveEffectiveStableHashPolicyV4(issue.names, issue.schema);
      const projection = buildStableIssueContentV4(payload, targetCoverage(run, target), resolvedPolicy.policy, serverIdentity);
      const outcome = outcomes.get(target.objectKey.toUpperCase()) ?? {};
      return {
        issueKey: target.objectKey,
        projection: projection.projection,
        hashInput: {
          algorithm: "SHA-256",
          canonicalJson: projection.canonicalJson,
          stableVersionHash: projection.stableHash
        },
        decision: {
          issueKey: target.objectKey,
          decision: outcome.outcome ?? "not_available",
          archivePayloadSha256: outcome.archiveSha256 ?? "",
          stableVersionHash: outcome.stableHash ?? projection.stableHash,
          matchedExistingVersionId: outcome.matchedExistingVersionId ?? null,
          comparedVersionId: outcome.comparedVersionId ?? null,
          excludedPaths: outcome.excludedPaths ?? projection.excludedPaths,
          normalizedPaths: outcome.normalizedPaths ?? projection.normalizedPaths,
          volatileRulesApplied: outcome.volatileRulesApplied ?? projection.policy,
          meaningfulChangedPaths: outcome.meaningfulChangedPaths ?? []
        }
      };
    });
}

function eligibility(target: StagingTarget): CurrentStateCandidate["eligibility"] {
  if (target.status === "eligible") return "eligible";
  if (target.status === "partial" || target.status === "required_partial") return "partial";
  if (target.status === "failed_issue" || target.status === "failed_final"
    || target.status === "not_attempted_due_to_run_failure") return "failed";
  return "invalid";
}

function blocked(input: DatabaseWriteInput, reasonCode: string, message: string): any {
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
      duplicates: 0,
      excludedPartial: input.run.index.targets.filter((target) => ["partial", "required_partial"].includes(target.status)).length,
      excludedFailed: input.run.index.targets.filter((target) => ["failed_issue", "failed_final", "not_attempted_due_to_run_failure"].includes(target.status)).length,
      invalid: input.run.index.targets.filter((target) => ["pending", "in_progress", "excluded"].includes(target.status)).length,
      writeFailed: 0,
      rolledBack: 0,
      activityEventsInserted: 0,
      activityEventsExisting: 0
    },
    retries: 0,
    readbackVerified: false,
    foreignKeyCheck: "not_run",
    startedAt: now,
    finishedAt: now,
    durationMs: 0
  };
}

export function writeFullFetchStagingToCurrentDatabase(input: DatabaseWriteInput): any {
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

  const items: CurrentStateCandidate[] = input.run.index.targets.map((target) => ({
    issueKey: target.objectKey,
    loadRawJson: target.status === "eligible" ? () => loadIssuePayload(input.run, target) : undefined,
    observedAt: input.observedAt,
    coverage: targetCoverage(input.run, target),
    eligibility: eligibility(target)
  }));
  const diagnosticFilePath = input.diagnosticsDir
    ? path.join(path.resolve(input.diagnosticsDir), `current-state-save-diagnostics-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.json`)
    : "";
  const result = writeCurrentStateBatch({
    operationId,
    runId: input.run.state.fullFetchRunId,
    databasePath: input.databasePath,
    jira: {
      serverIdentity: provenance.serverIdentity,
      baseUrlNormalized: provenance.baseUrlNormalized
    },
    items,
    observedAt: input.observedAt,
    diagnosticFilePath
  });
  if (diagnosticFilePath) {
    fs.mkdirSync(path.dirname(diagnosticFilePath), { recursive: true });
    fs.writeFileSync(diagnosticFilePath, `${JSON.stringify({
      schemaVersion: "current_state_save_diagnostics_v2",
      createdAt: new Date().toISOString(),
      operationId,
      runId: input.run.state.fullFetchRunId,
      status: result.status,
      reasonCode: result.reasonCode,
      databasePath: result.targetDatabase,
      storageModel: result.storageModel ?? "Current-State V1",
      stableHashPolicy: result.stableHashPolicy ?? "V4",
      stablePolicyFingerprint: result.stablePolicyFingerprint ?? "",
      eventIdentityPolicy: result.eventIdentityPolicy ?? "V2",
      eventPolicyFingerprint: result.eventPolicyFingerprint ?? "",
      summary: result.summary,
      issues: result.outcomes,
      security: {
        tokenIncluded: false,
        authorizationIncluded: false,
        fullDescriptionIncluded: false,
        fullCommentBodyIncluded: false,
        fullPayloadIncluded: false
      }
    }, null, 2)}\n`, "utf8");
    return { ...result, diagnosticFilePath };
  }
  return result;
}
