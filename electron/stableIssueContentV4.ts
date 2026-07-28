import crypto from "node:crypto";
import type { CoverageProfile } from "./coverageProfile.js";

export const STABLE_HASH_POLICY_VERSION = 4;
export const STABLE_CANONICAL_JSON_VERSION = 1;

export const VOLATILE_FIELD_DISPLAY_NAMES = [
  "Actual Duration",
  "Review Time",
  "Planned Duration",
  "Planned Duration (Working Days)",
  "verification time (max)",
  "FA Review Time",
  "Debug Time",
  "FA Debugging Time",
  "Debug Time(Working Days)",
  "Actual Duration(Working Days)",
  "Delta Duedate(Working Days)",
  "Review Time(Working Days)",
  "FA Review Time(Working Days)"
] as const;

const CONFIRMED_VOLATILE_FIELD_IDS: Readonly<Record<string, string>> = {
  customfield_12201: "Actual Duration",
  customfield_12401: "Review Time"
};

export type VolatileFieldRegistryEntry = {
  fieldId: string;
  displayName: string;
  normalizedName: string;
  classification: "volatile_metric";
  exclusionReason: "metric_observed_outside_stable_content";
  resolverSource: "confirmed_field_id_and_metadata" | "jira_field_metadata_exact_name";
  metadataFingerprint: string;
  schemaSummary: Record<string, unknown>;
};

export type EffectiveStableHashPolicyV4 = {
  policyVersion: 4;
  canonicalJsonVersion: 1;
  includedContentFamilies: string[];
  exactFixedExclusionPaths: string[];
  configuredVolatileDisplayNames: string[];
  resolvedVolatileFields: VolatileFieldRegistryEntry[];
  unresolvedVolatileFields: string[];
  ambiguousVolatileFields: Array<{ configuredName: string; fieldIds: string[] }>;
  arrayRules: Record<string, "ordered" | "set">;
  nullMissingRule: string;
  unicodeNormalization: "NFC";
  runtimeIdentityNormalizationVersion: 1;
  hashAlgorithm: "SHA-256";
  byteEncoding: "UTF-8";
};

export type StablePolicyWarning = {
  code: "VOLATILE_FIELD_MAPPING_NOT_FOUND" | "VOLATILE_FIELD_MAPPING_AMBIGUOUS";
  configuredName: string;
  fieldIds: string[];
};

export type StableIssueContentV4Result = {
  policyVersion: 4;
  policy: EffectiveStableHashPolicyV4;
  policyCanonicalJson: string;
  policyFingerprint: string;
  projection: Record<string, unknown>;
  canonicalJson: string;
  stableHash: string;
  excludedPaths: string[];
  normalizedPaths: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const source = record(value);
  for (const key of ["items", "values", "comments", "attachments", "links"]) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function normalizeRuntimeIdentity(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("STABLE_HASH_INVALID_NUMBER");
  if (typeof value === "string") {
    return value.normalize("NFC")
      .replace(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)@[0-9a-fA-F]{4,}\b/g, "$1");
  }
  if (Array.isArray(value)) return value.map(normalizeRuntimeIdentity);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, normalizeRuntimeIdentity(source[key])]));
  }
  return value;
}

export function canonicalJsonV4(value: unknown) {
  return JSON.stringify(normalizeRuntimeIdentity(value));
}

export function normalizeVolatileDisplayName(value: string) {
  return value.normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .toLocaleLowerCase("en-US");
}

function schemaSummary(value: unknown) {
  const schema = record(value);
  return Object.fromEntries(["type", "custom", "system", "items"]
    .filter((key) => schema[key] !== undefined)
    .map((key) => [key, schema[key]]));
}

export function volatileFieldMetadataFingerprint(fieldId: string, schemaValue: unknown) {
  const summary = schemaSummary(schemaValue);
  return crypto.createHash("sha256")
    .update(canonicalJsonV4({ fieldId, schemaSummary: summary }), "utf8")
    .digest("hex");
}

export function resolveEffectiveStableHashPolicyV4(
  namesValue: unknown,
  schemaValue: unknown,
  configuredNames: readonly string[] = VOLATILE_FIELD_DISPLAY_NAMES
) {
  const names = record(namesValue);
  const schemas = record(schemaValue);
  const resolvedVolatileFields: VolatileFieldRegistryEntry[] = [];
  const unresolvedVolatileFields: string[] = [];
  const ambiguousVolatileFields: EffectiveStableHashPolicyV4["ambiguousVolatileFields"] = [];
  const warnings: StablePolicyWarning[] = [];

  for (const configuredName of configuredNames) {
    const normalizedName = normalizeVolatileDisplayName(configuredName);
    const confirmedFieldId = Object.entries(CONFIRMED_VOLATILE_FIELD_IDS)
      .find(([, displayName]) => normalizeVolatileDisplayName(displayName) === normalizedName)?.[0];
    const fieldIds = confirmedFieldId
      ? normalizeVolatileDisplayName(String(names[confirmedFieldId] ?? "")) === normalizedName
        ? [confirmedFieldId]
        : []
      : Object.keys(names)
        .filter((fieldId) => normalizeVolatileDisplayName(String(names[fieldId])) === normalizedName)
        .sort();
    if (fieldIds.length === 1) {
      const fieldId = fieldIds[0];
      const summary = schemaSummary(schemas[fieldId]);
      resolvedVolatileFields.push({
        fieldId,
        displayName: String(names[fieldId]),
        normalizedName,
        classification: "volatile_metric",
        exclusionReason: "metric_observed_outside_stable_content",
        resolverSource: CONFIRMED_VOLATILE_FIELD_IDS[fieldId] === configuredName
          ? "confirmed_field_id_and_metadata"
          : "jira_field_metadata_exact_name",
        metadataFingerprint: volatileFieldMetadataFingerprint(fieldId, schemas[fieldId]),
        schemaSummary: summary
      });
    } else if (fieldIds.length === 0) {
      unresolvedVolatileFields.push(configuredName);
      warnings.push({ code: "VOLATILE_FIELD_MAPPING_NOT_FOUND", configuredName, fieldIds: [] });
    } else {
      ambiguousVolatileFields.push({ configuredName, fieldIds });
      warnings.push({ code: "VOLATILE_FIELD_MAPPING_AMBIGUOUS", configuredName, fieldIds });
    }
  }

  const policy: EffectiveStableHashPolicyV4 = {
    policyVersion: STABLE_HASH_POLICY_VERSION,
    canonicalJsonVersion: STABLE_CANONICAL_JSON_VERSION,
    includedContentFamilies: [
      "attachments", "changelog", "comments", "issue_fields", "issue_links",
      "parent_subtasks", "remote_links", "stable_issue_identity"
    ],
    exactFixedExclusionPaths: [
      "evidence", "fetchDiagnostics", "fetchedAt", "issue.names", "issue.renderedFields",
      "issue.schema", "issue.fields.lastViewed", "issue.fields.updated", "queueMetadata",
      "requestDuration", "requestEndedAt", "requestStartedAt", "runId", "stagingPath"
    ],
    configuredVolatileDisplayNames: [...configuredNames].sort(),
    resolvedVolatileFields: resolvedVolatileFields.sort((left, right) => left.fieldId.localeCompare(right.fieldId)),
    unresolvedVolatileFields: unresolvedVolatileFields.sort(),
    ambiguousVolatileFields: ambiguousVolatileFields.sort((left, right) => left.configuredName.localeCompare(right.configuredName)),
    arrayRules: {
      attachments: "set",
      changelog: "set",
      comments: "set",
      components: "set",
      descriptionAdfContent: "ordered",
      fixVersions: "set",
      issueLinks: "set",
      labels: "set",
      remoteLinks: "set",
      versions: "set"
    },
    nullMissingRule: "Preserve null, missing, empty, scalar type, and array order distinctions.",
    unicodeNormalization: "NFC",
    runtimeIdentityNormalizationVersion: 1,
    hashAlgorithm: "SHA-256",
    byteEncoding: "UTF-8"
  };
  const canonicalJson = canonicalJsonV4(policy);
  const fingerprint = stablePolicyFingerprint(policy).fingerprint;
  return {
    policy,
    canonicalJson,
    fingerprint,
    warnings
  };
}

export function stablePolicyFingerprint(policy: EffectiveStableHashPolicyV4) {
  const fingerprintPolicy = {
    policyVersion: policy.policyVersion,
    canonicalJsonVersion: policy.canonicalJsonVersion,
    includedContentFamilies: policy.includedContentFamilies,
    exactFixedExclusionPaths: policy.exactFixedExclusionPaths,
    configuredVolatileNames: policy.configuredVolatileDisplayNames.map(normalizeVolatileDisplayName).sort(),
    volatileFieldRegistry: policy.resolvedVolatileFields.map((entry) => ({
      fieldId: entry.fieldId,
      classification: entry.classification,
      exclusionReason: entry.exclusionReason,
      metadataFingerprint: entry.metadataFingerprint
    })).sort((left, right) => left.fieldId.localeCompare(right.fieldId)),
    unresolvedVolatileNames: policy.unresolvedVolatileFields.map(normalizeVolatileDisplayName).sort(),
    ambiguousVolatileFields: policy.ambiguousVolatileFields.map((entry) => ({
      normalizedName: normalizeVolatileDisplayName(entry.configuredName),
      fieldIds: [...entry.fieldIds].sort()
    })).sort((left, right) => left.normalizedName.localeCompare(right.normalizedName)),
    arrayRules: policy.arrayRules,
    nullMissingRule: policy.nullMissingRule,
    unicodeNormalization: policy.unicodeNormalization,
    runtimeIdentityNormalizationVersion: policy.runtimeIdentityNormalizationVersion,
    hashAlgorithm: policy.hashAlgorithm,
    byteEncoding: policy.byteEncoding
  };
  const canonicalJson = canonicalJsonV4(fingerprintPolicy);
  return {
    canonicalJson,
    fingerprint: crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex")
  };
}

function identity(value: unknown, keys: string[]) {
  const source = record(value);
  for (const key of keys) {
    const candidate = source[key];
    if (candidate !== undefined && candidate !== null && String(candidate)) return String(candidate);
  }
  return canonicalJsonV4(value);
}

function sorted(values: unknown[], keys: string[]) {
  return values.map(normalizeRuntimeIdentity).sort((left, right) =>
    identity(left, keys).localeCompare(identity(right, keys))
      || canonicalJsonV4(left).localeCompare(canonicalJsonV4(right)));
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

export function buildStableIssueContentV4(
  rawValue: unknown,
  coverage: CoverageProfile,
  policy: EffectiveStableHashPolicyV4,
  serverIdentity = ""
): StableIssueContentV4Result {
  const policyDetails = stablePolicyFingerprint(policy);
  const raw = record(rawValue);
  const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw;
  const originalFields = record(issue.fields);
  const fields = { ...originalFields };
  const excludedPaths = [...policy.exactFixedExclusionPaths];
  for (const resolved of policy.resolvedVolatileFields) {
    delete fields[resolved.fieldId];
    excludedPaths.push(`issue.fields.${resolved.fieldId}`);
  }
  delete fields.updated;
  delete fields.lastViewed;
  delete fields.comment;
  delete fields.comments;
  delete fields.attachment;
  delete fields.attachments;
  delete fields.issuelinks;
  delete fields.subtasks;
  delete fields.parent;
  delete fields.changelog;

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
    comments: sorted(list(raw.comments ?? record(originalFields.comment).comments), ["id", "created"]),
    changelog: sorted(list(raw.changelog ?? originalFields.changelog), ["id", "created"]),
    attachments: sorted(list(raw.attachments ?? originalFields.attachment), ["id", "filename"]),
    issueLinks: sorted(list(raw.issueLinks ?? originalFields.issuelinks), ["id", "type", "key"]),
    parent: normalizeRuntimeIdentity(raw.parent ?? originalFields.parent ?? null),
    subtasks: sorted(list(raw.subtasks ?? originalFields.subtasks), ["id", "key"]),
    remoteLinks: sorted(list(raw.remoteLinks), ["id", "self", "url"])
  }) as Record<string, unknown>;
  const canonicalJson = canonicalJsonV4(projection);
  return {
    policyVersion: STABLE_HASH_POLICY_VERSION,
    policy,
    policyCanonicalJson: policyDetails.canonicalJson,
    policyFingerprint: policyDetails.fingerprint,
    projection,
    canonicalJson,
    stableHash: crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
    excludedPaths: [...new Set(excludedPaths)].sort(),
    normalizedPaths: ["java_object_identity_suffix", "unicode_nfc", "volatile_display_name_nfkc"]
  };
}

export function extractCurrentObservedMetrics(
  rawValue: unknown,
  policy: EffectiveStableHashPolicyV4,
  observedAt: string,
  runId: string
) {
  const raw = record(rawValue);
  const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw;
  const fields = record(issue.fields);
  return policy.resolvedVolatileFields.map((resolved) => {
    const present = Object.prototype.hasOwnProperty.call(fields, resolved.fieldId);
    const rawValue = fields[resolved.fieldId];
    const value = resolved.schemaSummary.type === "number"
      && typeof rawValue === "string"
      && rawValue.trim() !== ""
      && Number.isFinite(Number(rawValue))
      ? Number(rawValue)
      : rawValue;
    return {
      fieldId: resolved.fieldId,
      displayName: resolved.displayName,
      valueType: !present ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
      valueJson: present ? canonicalJsonV4(value) : null,
      isPresent: present,
      observedAt,
      lastSuccessfulRunId: runId
    };
  });
}

export function changedProjectionPaths(previous: unknown, candidate: unknown, path = "$"): string[] {
  if (canonicalJsonV4(previous) === canonicalJsonV4(candidate)) return [];
  if (Array.isArray(previous) && Array.isArray(candidate)) {
    const length = Math.max(previous.length, candidate.length);
    return Array.from({ length }, (_, index) => index).flatMap((index) =>
      index >= previous.length || index >= candidate.length
        ? [`${path}[${index}]`]
        : changedProjectionPaths(previous[index], candidate[index], `${path}[${index}]`));
  }
  if (previous && candidate && typeof previous === "object" && typeof candidate === "object") {
    const left = previous as Record<string, unknown>;
    const right = candidate as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap((key) =>
      !(key in left) || !(key in right)
        ? [`${path}.${key}`]
        : changedProjectionPaths(left[key], right[key], `${path}.${key}`));
  }
  return [path];
}
