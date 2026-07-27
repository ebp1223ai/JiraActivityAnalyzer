import crypto from "node:crypto";
import type { CoverageProfile } from "./coverageProfile.js";

export const STABLE_HASH_POLICY_VERSION = 2;
export const DEVELOPMENT_IDENTITY_NORMALIZATION_VERSION = 1;

export const VOLATILE_FIELD_DISPLAY_NAMES = [
  "Actual Duration",
  "Delta Duedate",
  "Review Time",
  "FA Review Time",
  "Actual Duration Working Days",
  "Delta Duedate Working Days",
  "Review Time Working Days",
  "FA Review Time Working Days"
] as const;

export type VolatileFieldPolicy = {
  resolvedFieldIds: string[];
  missingDisplayNames: string[];
  ambiguousDisplayNames: Array<{ displayName: string; fieldIds: string[] }>;
  warnings: Array<{ code: "AMBIGUOUS_VOLATILE_FIELD_MAPPING" | "VOLATILE_FIELD_MAPPING_NOT_FOUND"; displayName: string; fieldIds: string[] }>;
  descriptor: string;
  descriptorHash: string;
};

export type StableIssueContentV2Result = {
  policyVersion: 2;
  projection: Record<string, unknown>;
  canonicalJson: string;
  stableHash: string;
  policy: VolatileFieldPolicy;
  excludedPaths: string[];
  normalizedPaths: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const valueRecord = record(value);
  for (const key of ["items", "values", "comments", "attachments", "links"]) {
    if (Array.isArray(valueRecord[key])) return valueRecord[key] as unknown[];
  }
  return [];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, canonicalValue(source[key])]));
  }
  return value;
}

export function canonicalJsonV2(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function identity(value: unknown, keys: string[]) {
  const valueRecord = record(value);
  for (const key of keys) {
    const candidate = valueRecord[key];
    if (candidate !== undefined && candidate !== null && String(candidate)) return String(candidate);
  }
  return canonicalJsonV2(value);
}

function sorted(values: unknown[], keys: string[]) {
  return values.map(normalizeRuntimeIdentity).sort((left, right) =>
    identity(left, keys).localeCompare(identity(right, keys)) || canonicalJsonV2(left).localeCompare(canonicalJsonV2(right)));
}

// Jira plugin values occasionally contain Java Object.toString identities. Remove only the hex identity suffix.
function normalizeRuntimeIdentity(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)@[0-9a-fA-F]{4,}\b/g, "$1");
  }
  if (Array.isArray(value)) return value.map(normalizeRuntimeIdentity);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, normalizeRuntimeIdentity(source[key])]));
  }
  return value;
}

export function resolveVolatileFieldPolicy(
  namesValue: unknown,
  configuredNames: readonly string[] = VOLATILE_FIELD_DISPLAY_NAMES
): VolatileFieldPolicy {
  const names = record(namesValue);
  const resolvedFieldIds: string[] = [];
  const missingDisplayNames: string[] = [];
  const ambiguousDisplayNames: Array<{ displayName: string; fieldIds: string[] }> = [];
  const warnings: VolatileFieldPolicy["warnings"] = [];
  for (const displayName of configuredNames) {
    const ids = Object.keys(names).filter((fieldId) => String(names[fieldId]).trim() === displayName).sort();
    if (ids.length === 1) resolvedFieldIds.push(ids[0]);
    else if (ids.length === 0) {
      missingDisplayNames.push(displayName);
      warnings.push({ code: "VOLATILE_FIELD_MAPPING_NOT_FOUND", displayName, fieldIds: [] });
    } else {
      ambiguousDisplayNames.push({ displayName, fieldIds: ids });
      warnings.push({ code: "AMBIGUOUS_VOLATILE_FIELD_MAPPING", displayName, fieldIds: ids });
    }
  }
  const descriptorValue = {
    stableHashPolicyVersion: STABLE_HASH_POLICY_VERSION,
    developmentIdentityNormalizationVersion: DEVELOPMENT_IDENTITY_NORMALIZATION_VERSION,
    configuredDisplayNames: [...configuredNames],
    resolvedFieldIds: [...new Set(resolvedFieldIds)].sort(),
    ambiguousDisplayNames
  };
  const descriptor = canonicalJsonV2(descriptorValue);
  return {
    resolvedFieldIds: descriptorValue.resolvedFieldIds,
    missingDisplayNames,
    ambiguousDisplayNames,
    warnings,
    descriptor,
    descriptorHash: crypto.createHash("sha256").update(descriptor, "utf8").digest("hex")
  };
}

function stableUser(value: unknown) {
  const user = record(value);
  if (!Object.keys(user).length) return value ?? null;
  return normalizeRuntimeIdentity({
    accountId: user.accountId ?? null,
    key: user.key ?? null,
    name: user.name ?? null,
    displayName: user.displayName ?? null,
    active: user.active ?? null
  });
}

function coverageMarkers(profile: CoverageProfile) {
  return {
    fetchProfileVersion: profile.fetchProfileVersion,
    coreFields: profile.coreFields,
    changelog: profile.changelog,
    comments: profile.comments,
    attachmentsMetadata: profile.attachmentsMetadata,
    issueLinks: profile.issueLinks,
    remoteLinks: profile.remoteLinks,
    parentSubtasks: profile.parentSubtasks,
    relatedIssues: profile.relatedIssues
  };
}

export function buildStableIssueContentV2(rawValue: unknown, coverage: CoverageProfile, serverIdentity = ""): StableIssueContentV2Result {
  const raw = record(rawValue);
  const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw;
  const fields = { ...record(issue.fields) };
  const policy = resolveVolatileFieldPolicy(issue.names ?? raw.names);
  const excludedPaths = [
    "fetchedAt", "runId", "queue", "queueMetadata", "evidence", "exportPath", "stagingPath",
    "issue.names", "issue.schema", "issue.renderedFields", "issue.fields.updated",
    ...policy.resolvedFieldIds.map((fieldId) => `issue.fields.${fieldId}`)
  ];
  for (const fieldId of policy.resolvedFieldIds) delete fields[fieldId];
  delete fields.updated;
  delete fields.comment;
  delete fields.comments;
  delete fields.attachment;
  delete fields.attachments;
  delete fields.issuelinks;
  delete fields.subtasks;
  delete fields.parent;

  const comments = list(raw.comments ?? record(fields.comment).comments);
  const changelog = list(raw.changelog ?? fields.changelog);
  delete fields.changelog;
  const attachments = list(raw.attachments ?? (issue.fields && record(issue.fields).attachment));
  const issueLinks = list(raw.issueLinks ?? (issue.fields && record(issue.fields).issuelinks));
  const subtasks = list(raw.subtasks ?? (issue.fields && record(issue.fields).subtasks));
  const remoteLinks = list(raw.remoteLinks);

  for (const key of ["assignee", "reporter", "creator"]) {
    if (key in fields) fields[key] = stableUser(fields[key]);
  }
  if (Array.isArray(fields.labels)) fields.labels = [...new Set(fields.labels.map(String))].sort();
  if (Array.isArray(fields.components)) fields.components = sorted(fields.components, ["id", "name"]);
  if (Array.isArray(fields.fixVersions)) fields.fixVersions = sorted(fields.fixVersions, ["id", "name"]);
  if (Array.isArray(fields.versions)) fields.versions = sorted(fields.versions, ["id", "name"]);
  if (Array.isArray(fields.versionsAffected)) fields.versionsAffected = sorted(fields.versionsAffected, ["id", "name"]);

  const projection = normalizeRuntimeIdentity({
    stableHashPolicyVersion: STABLE_HASH_POLICY_VERSION,
    sourceSystem: "jira",
    serverIdentity,
    jiraIssueId: issue.id ?? null,
    issueKey: issue.key ?? raw.issueKey ?? null,
    fields,
    comments: sorted(comments, ["id", "created"]),
    changelog: sorted(changelog, ["id", "created"]),
    attachments: sorted(attachments, ["id", "filename"]),
    issueLinks: sorted(issueLinks, ["id", "type", "key"]),
    parent: normalizeRuntimeIdentity(raw.parent ?? record(issue.fields).parent ?? null),
    subtasks: sorted(subtasks, ["id", "key"]),
    remoteLinks: sorted(remoteLinks, ["id", "self", "url"]),
    coverage: coverageMarkers(coverage)
  }) as Record<string, unknown>;
  const canonicalJson = canonicalJsonV2(projection);
  return {
    policyVersion: STABLE_HASH_POLICY_VERSION,
    projection,
    canonicalJson,
    stableHash: crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
    policy,
    excludedPaths,
    normalizedPaths: ["java_object_identity_suffix"]
  };
}

export function changedProjectionPaths(previous: unknown, candidate: unknown, path = "$"): string[] {
  if (canonicalJsonV2(previous) === canonicalJsonV2(candidate)) return [];
  if (Array.isArray(previous) && Array.isArray(candidate)) {
    const length = Math.max(previous.length, candidate.length);
    return Array.from({ length }, (_, index) => index)
      .flatMap((index) => index >= previous.length || index >= candidate.length
        ? [`${path}[${index}]`]
        : changedProjectionPaths(previous[index], candidate[index], `${path}[${index}]`));
  }
  if (previous && candidate && typeof previous === "object" && typeof candidate === "object") {
    const left = previous as Record<string, unknown>;
    const right = candidate as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap((key) =>
      !(key in left) || !(key in right) ? [`${path}.${key}`] : changedProjectionPaths(left[key], right[key], `${path}.${key}`));
  }
  return [path];
}
