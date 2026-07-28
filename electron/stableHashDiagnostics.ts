import crypto from "node:crypto";
import { canonicalJsonV4, changedProjectionPaths, type EffectiveStableHashPolicyV4 } from "./stableIssueContentV4.js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function issue(value: unknown) {
  const root = record(value);
  return Object.keys(record(root.issue)).length ? record(root.issue) : root;
}

function collection(value: unknown, fallback: unknown) {
  if (Array.isArray(value)) return value;
  const source = record(value);
  for (const key of ["items", "values", "comments"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  return Array.isArray(fallback) ? fallback : [];
}

function sha256(value: unknown) {
  return crypto.createHash("sha256").update(canonicalJsonV4(value), "utf8").digest("hex");
}

function safeValueSummary(value: unknown) {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const json = canonicalJsonV4(value);
  const scalar = ["string", "number", "boolean", "undefined"].includes(type);
  return {
    type,
    length: json?.length ?? 0,
    sha256: sha256(value),
    preview: scalar ? String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 80) : `[${type}]`
  };
}

function unchangedEvidence(previous: unknown, candidate: unknown) {
  const previousRoot = record(previous);
  const candidateRoot = record(candidate);
  const previousIssue = issue(previous);
  const candidateIssue = issue(candidate);
  const previousFields = record(previousIssue.fields);
  const candidateFields = record(candidateIssue.fields);
  return {
    jiraUpdatedUnchanged: canonicalJsonV4(previousFields.updated) === canonicalJsonV4(candidateFields.updated),
    changelogUnchanged: canonicalJsonV4(collection(previousRoot.changelog, previousFields.changelog))
      === canonicalJsonV4(collection(candidateRoot.changelog, candidateFields.changelog)),
    commentsUnchanged: canonicalJsonV4(collection(previousRoot.comments, record(previousFields.comment).comments))
      === canonicalJsonV4(collection(candidateRoot.comments, record(candidateFields.comment).comments))
  };
}

export type VolatileFieldCandidate = {
  issueKey: string;
  fieldId: string;
  fieldName: string;
  previous: ReturnType<typeof safeValueSummary>;
  candidate: ReturnType<typeof safeValueSummary>;
  includedInStableHash: boolean;
  inVolatileRegistry: false;
  changelogOrCommentEvidence: false;
  candidateReason: "field_changed_without_jira_updated_changelog_or_comment_evidence";
  resolution: "unresolved";
};

export function detectVolatileFieldCandidates(input: {
  issueKey: string;
  previousRaw: unknown;
  candidateRaw: unknown;
  policy: EffectiveStableHashPolicyV4;
}) {
  const evidence = unchangedEvidence(input.previousRaw, input.candidateRaw);
  if (!evidence.jiraUpdatedUnchanged || !evidence.changelogUnchanged || !evidence.commentsUnchanged) return [];
  const previousIssue = issue(input.previousRaw);
  const candidateIssue = issue(input.candidateRaw);
  const previousFields = record(previousIssue.fields);
  const candidateFields = record(candidateIssue.fields);
  const names = { ...record(previousIssue.names), ...record(candidateIssue.names) };
  const registered = new Set(input.policy.resolvedVolatileFields.map((entry) => entry.fieldId));
  const fixed = new Set(["updated", "lastViewed", "comment", "comments", "attachment", "attachments", "issuelinks", "changelog"]);

  return [...new Set([...Object.keys(previousFields), ...Object.keys(candidateFields)])]
    .sort()
    .filter((fieldId) => !fixed.has(fieldId) && !registered.has(fieldId))
    .filter((fieldId) => canonicalJsonV4(previousFields[fieldId]) !== canonicalJsonV4(candidateFields[fieldId]))
    .map((fieldId): VolatileFieldCandidate => ({
      issueKey: input.issueKey,
      fieldId,
      fieldName: String(names[fieldId] ?? ""),
      previous: safeValueSummary(previousFields[fieldId]),
      candidate: safeValueSummary(candidateFields[fieldId]),
      includedInStableHash: true,
      inVolatileRegistry: false,
      changelogOrCommentEvidence: false,
      candidateReason: "field_changed_without_jira_updated_changelog_or_comment_evidence",
      resolution: "unresolved"
    }));
}

export function buildStableHashFieldDiff(input: {
  issueKey: string;
  previousStableHash: string;
  candidateStableHash: string;
  previousProjection: unknown;
  candidateProjection: unknown;
  metricDiffs: string[];
  candidates: VolatileFieldCandidate[];
}) {
  return {
    issueKey: input.issueKey,
    stableHashChanged: input.previousStableHash !== input.candidateStableHash,
    previousStableHash: input.previousStableHash,
    candidateStableHash: input.candidateStableHash,
    changedStableProjectionPaths: changedProjectionPaths(input.previousProjection, input.candidateProjection),
    volatileMetricDiffs: input.metricDiffs,
    unresolvedCandidateFieldIds: input.candidates.map((entry) => entry.fieldId),
    policyMutationPerformed: false
  };
}
