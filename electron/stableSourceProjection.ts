import crypto from "node:crypto";

export interface VolatileFieldRule {
  fieldId?: string;
  jsonPath?: string;
  reason: string;
  action: "exclude" | "normalize";
}

export const STABLE_PROJECTION_VERSION = 1;

export const VOLATILE_FIELD_REGISTRY: readonly VolatileFieldRule[] = [
  {
    jsonPath: "evidence",
    reason: "Evidence is derived from the selected user, date range, and analysis conditions.",
    action: "exclude"
  },
  {
    jsonPath: "normalizedCurrentFields.fetchedAt",
    reason: "Fetch time is acquisition metadata, not Jira source state.",
    action: "exclude"
  },
  {
    fieldId: "customfield_10900",
    jsonPath: "issue.fields.customfield_10900",
    reason: "Observed Jira plugin value may end in a Java Object.toString memory identity suffix.",
    action: "normalize"
  }
] as const;

export type AppliedVolatileRule = VolatileFieldRule & {
  path: string;
  beforeSummary: string;
  afterSummary: string;
};

export type StableProjectionResult = {
  projectionVersion: number;
  projection: unknown;
  canonicalJson: string;
  stableVersionHash: string;
  excludedPaths: string[];
  normalizedPaths: string[];
  volatileRulesApplied: AppliedVolatileRule[];
};

const javaObjectIdentity = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)@[0-9a-fA-F]+$/;
const orderedArrayKeys = new Set(["items"]);
const setArrayKeys = new Set([
  "labels", "components", "fixVersions", "versions", "affectedVersions",
  "users", "attachments", "issueLinks", "remoteLinks", "comments", "changelog"
]);
const dateKeys = new Set([
  "created", "updated", "started", "resolved", "resolutiondate", "duedate",
  "startDate", "eventTime", "event_time"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function summarize(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? String(value)).slice(0, 160);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]));
  }
  return value === undefined ? null : value;
}

export function stableCanonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function stableArrayIdentity(value: unknown) {
  if (!isRecord(value)) return stableCanonicalJson(value);
  const id = value.id ?? value.accountId ?? value.key ?? value.name ?? value.filename ?? value.self;
  const secondary = value.created ?? value.updated ?? value.fieldId ?? value.field ?? value.type ?? "";
  return `${String(id ?? "")}\u0000${String(secondary)}\u0000${stableCanonicalJson(value)}`;
}

function normalizeInstant(value: string) {
  if (!/[T:]/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : value;
}

type ProjectionContext = {
  excludedPaths: string[];
  normalizedPaths: string[];
  applied: AppliedVolatileRule[];
};

function normalizeJavaObjectIdentity(value: unknown, path: string, context: ProjectionContext): unknown {
  if (typeof value === "string") {
    const match = javaObjectIdentity.exec(value);
    if (!match) return value;
    const normalized = match[1];
    const rule = VOLATILE_FIELD_REGISTRY.find((item) => item.fieldId === "customfield_10900")!;
    context.normalizedPaths.push(path);
    context.applied.push({
      ...rule,
      path,
      beforeSummary: summarize(value),
      afterSummary: summarize(normalized)
    });
    return normalized;
  }
  if (Array.isArray(value)) return value.map((entry, index) => normalizeJavaObjectIdentity(entry, `${path}[${index}]`, context));
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      normalizeJavaObjectIdentity(value[key], `${path}.${key}`, context)
    ]));
  }
  return value;
}

function normalizeProjectionValue(value: unknown, path: string, key: string, context: ProjectionContext): unknown {
  if (path === "issue.fields.customfield_10900") {
    return normalizeJavaObjectIdentity(value, path, context);
  }
  if (Array.isArray(value)) {
    const normalized = value.map((entry, index) => normalizeProjectionValue(entry, `${path}[${index}]`, key, context));
    if (setArrayKeys.has(key) && !orderedArrayKeys.has(key)) {
      return [...normalized].sort((left, right) => stableArrayIdentity(left).localeCompare(stableArrayIdentity(right)));
    }
    return normalized;
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value)
      .filter((childKey) => value[childKey] !== undefined)
      .sort()
      .map((childKey) => {
        const childPath = path ? `${path}.${childKey}` : childKey;
        return [childKey, normalizeProjectionValue(value[childKey], childPath, childKey, context)];
      }));
  }
  if (typeof value === "string" && dateKeys.has(key)) return normalizeInstant(value);
  return value === undefined ? null : value;
}

function copyNormalized(root: Record<string, unknown>, key: string, context: ProjectionContext) {
  return normalizeProjectionValue(root[key], key, key, context);
}

export function buildStableSourceProjection(rawJson: unknown, serverIdentity = ""): StableProjectionResult {
  if (!isRecord(rawJson)) throw new Error("STABLE_PROJECTION_FAILED:payload_not_object");
  const directIssue = isRecord(rawJson.fields) || rawJson.key
    ? {
        id: rawJson.id ?? null,
        key: rawJson.key ?? null,
        self: rawJson.self ?? null,
        fields: rawJson.fields ?? {},
        renderedFields: rawJson.renderedFields ?? {},
        names: rawJson.names ?? {},
        schema: rawJson.schema ?? {}
      }
    : {};
  const issue = isRecord(rawJson.issue) ? rawJson.issue : directIssue;
  const issueFields = isRecord(issue.fields) ? issue.fields : {};
  const context: ProjectionContext = { excludedPaths: [], normalizedPaths: [], applied: [] };
  const projection: Record<string, unknown> = {
    projectionVersion: STABLE_PROJECTION_VERSION,
    sourceSystem: "jira",
    serverIdentity,
    objectType: "issue",
    issueKey: rawJson.issueKey ?? issue.key ?? null,
    issue: normalizeProjectionValue(issue, "issue", "issue", context),
    changelog: copyNormalized(rawJson, "changelog", context)
      ?? normalizeProjectionValue(issueFields.changelog ?? [], "changelog", "changelog", context),
    comments: copyNormalized(rawJson, "comments", context)
      ?? normalizeProjectionValue(issueFields.comments ?? [], "comments", "comments", context),
    attachments: copyNormalized(rawJson, "attachments", context)
      ?? normalizeProjectionValue(issueFields.attachment ?? issueFields.attachments ?? [], "attachments", "attachments", context),
    users: copyNormalized(rawJson, "users", context) ?? [],
    issueLinks: copyNormalized(rawJson, "issueLinks", context)
      ?? normalizeProjectionValue(issueFields.issuelinks ?? [], "issueLinks", "issueLinks", context),
    remoteLinks: copyNormalized(rawJson, "remoteLinks", context) ?? [],
    normalizedCurrentFields: (() => {
      const normalized = isRecord(rawJson.normalizedCurrentFields)
        ? { ...rawJson.normalizedCurrentFields }
        : {};
      if ("fetchedAt" in normalized) {
        delete normalized.fetchedAt;
        context.excludedPaths.push("normalizedCurrentFields.fetchedAt");
        const rule = VOLATILE_FIELD_REGISTRY.find((item) => item.jsonPath === "normalizedCurrentFields.fetchedAt")!;
        context.applied.push({ ...rule, path: rule.jsonPath!, beforeSummary: "[fetch timestamp]", afterSummary: "[excluded]" });
      }
      return normalizeProjectionValue(normalized, "normalizedCurrentFields", "normalizedCurrentFields", context);
    })()
  };
  if ("evidence" in rawJson) {
    context.excludedPaths.push("evidence");
    const rule = VOLATILE_FIELD_REGISTRY.find((item) => item.jsonPath === "evidence")!;
    context.applied.push({ ...rule, path: "evidence", beforeSummary: "[derived evidence]", afterSummary: "[excluded]" });
  }
  const canonicalJson = stableCanonicalJson(projection);
  return {
    projectionVersion: STABLE_PROJECTION_VERSION,
    projection,
    canonicalJson,
    stableVersionHash: crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
    excludedPaths: [...new Set(context.excludedPaths)].sort(),
    normalizedPaths: [...new Set(context.normalizedPaths)].sort(),
    volatileRulesApplied: context.applied
  };
}

function selector(value: unknown, index: number) {
  if (!isRecord(value)) return `[${index}]`;
  for (const key of ["id", "accountId", "key", "name", "filename"]) {
    if (value[key] !== undefined && value[key] !== null && String(value[key])) {
      return `[${key}=${String(value[key])}]`;
    }
  }
  if (value.fieldId ?? value.field) return `[fieldId=${String(value.fieldId ?? value.field)}]`;
  return `[${index}]`;
}

export function meaningfulChangedPaths(previous: unknown, current: unknown, path = ""): string[] {
  if (stableCanonicalJson(previous) === stableCanonicalJson(current)) return [];
  if (Array.isArray(previous) && Array.isArray(current)) {
    const previousMap = new Map(previous.map((value, index) => [selector(value, index), value]));
    const currentMap = new Map(current.map((value, index) => [selector(value, index), value]));
    const keys = [...new Set([...previousMap.keys(), ...currentMap.keys()])].sort();
    return keys.flatMap((key) => {
      const childPath = `${path}${key}`;
      if (!previousMap.has(key) || !currentMap.has(key)) return [childPath];
      return meaningfulChangedPaths(previousMap.get(key), currentMap.get(key), childPath);
    });
  }
  if (isRecord(previous) && isRecord(current)) {
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
    return keys.flatMap((key) => {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in previous) || !(key in current)) return [childPath];
      return meaningfulChangedPaths(previous[key], current[key], childPath);
    });
  }
  return [path || "$"];
}
