export type CurrentFieldValueStatus = "present_value" | "present_empty" | "not_returned" | "field_unresolved" | "field_ambiguous" | "unsupported_external_field";

export type NormalizedCurrentField = {
  key: string;
  fieldId: string | null;
  fieldName: string;
  value: unknown;
  valueStatus: CurrentFieldValueStatus;
  semanticStatus?: "present" | "absent" | "unparseable" | "ambiguous";
  candidateFieldIds?: string[];
  snapshotPath: string;
};

export type CurrentIssueSnapshot = {
  fetchedAt: string;
  id: unknown;
  key: unknown;
  self: unknown;
  fields: Record<string, unknown>;
  renderedFields: Record<string, unknown>;
  names: Record<string, unknown>;
  schema: Record<string, unknown>;
  sectionStatus: Record<string, "returned" | "not_returned">;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedObject);
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  for (const key of ["displayName", "name", "value", "key", "emailAddress", "id"]) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== "") return item[key];
  }
  return Object.fromEntries(Object.entries(item).slice(0, 12).map(([key, child]) => [key, normalizedObject(child)]));
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function field(snapshot: CurrentIssueSnapshot, key: string, fieldId: string, fieldName: string): NormalizedCurrentField {
  const exists = Object.prototype.hasOwnProperty.call(snapshot.fields, fieldId);
  const value = snapshot.fields[fieldId];
  return {
    key,
    fieldId,
    fieldName: String(snapshot.names[fieldId] ?? fieldName),
    value: exists && !isEmpty(value) ? normalizedObject(value) : null,
    valueStatus: !exists ? "not_returned" : isEmpty(value) ? "present_empty" : "present_value",
    snapshotPath: `$.fields.${fieldId}`
  };
}

function startDateField(snapshot: CurrentIssueSnapshot): NormalizedCurrentField {
  const candidates = Object.entries(snapshot.names)
    .filter(([, name]) => String(name).trim().toLowerCase() === "start date")
    .map(([fieldId]) => fieldId)
    .filter((fieldId) => {
      const definition = record(snapshot.schema[fieldId]);
      const type = String(definition.type ?? "").trim().toLowerCase();
      const custom = String(definition.custom ?? "").trim().toLowerCase();
      return type === "date" || type === "datetime" || /(^|:)date(time)?$/.test(custom);
    });
  if (candidates.length === 0) return { key: "startDate", fieldId: null, fieldName: "Start Date", value: null, valueStatus: "field_unresolved", semanticStatus: "absent", candidateFieldIds: [], snapshotPath: "$.fields" };
  if (candidates.length > 1) return { key: "startDate", fieldId: null, fieldName: "Start Date", value: null, valueStatus: "field_ambiguous", semanticStatus: "ambiguous", candidateFieldIds: candidates, snapshotPath: "$.fields" };
  const resolved = field(snapshot, "startDate", candidates[0], String(snapshot.names[candidates[0]] ?? "Start Date"));
  if (resolved.valueStatus !== "present_value") return { ...resolved, semanticStatus: "absent", candidateFieldIds: candidates };
  const raw = String(snapshot.fields[candidates[0]] ?? "").trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(raw) || (!Number.isNaN(Date.parse(raw)) && /^\d{4}-\d{2}-\d{2}T/.test(raw));
  return { ...resolved, semanticStatus: valid ? "present" : "unparseable", candidateFieldIds: candidates };
}

export function buildCurrentIssueSnapshot(issueResponse: unknown, fetchedAt = new Date().toISOString()): CurrentIssueSnapshot {
  const source = record(issueResponse);
  const section = (name: string) => Object.prototype.hasOwnProperty.call(source, name) ? "returned" as const : "not_returned" as const;
  return {
    fetchedAt,
    id: source.id ?? null,
    key: source.key ?? null,
    self: source.self ?? null,
    fields: record(source.fields),
    renderedFields: record(source.renderedFields),
    names: record(source.names),
    schema: record(source.schema),
    sectionStatus: { fields: section("fields"), renderedFields: section("renderedFields"), names: section("names"), schema: section("schema") }
  };
}

export function normalizeCurrentIssueFields(snapshot: CurrentIssueSnapshot) {
  const fields: NormalizedCurrentField[] = [
    field(snapshot, "issueType", "issuetype", "Issue Type"),
    field(snapshot, "priority", "priority", "Priority"),
    field(snapshot, "labels", "labels", "Labels"),
    field(snapshot, "status", "status", "Status"),
    field(snapshot, "resolution", "resolution", "Resolution"),
    startDateField(snapshot),
    field(snapshot, "dueDate", "duedate", "Due Date"),
    field(snapshot, "creator", "creator", "Creator"),
    field(snapshot, "reporter", "reporter", "Reporter"),
    field(snapshot, "assignee", "assignee", "Assignee"),
    field(snapshot, "components", "components", "Components"),
    field(snapshot, "fixVersions", "fixVersions", "Fix Versions"),
    field(snapshot, "affectedVersions", "versions", "Affected Versions"),
    field(snapshot, "createdTime", "created", "Created Time"),
    field(snapshot, "updatedTime", "updated", "Updated Time"),
    field(snapshot, "resolutionTime", "resolutiondate", "Resolution Time"),
    field(snapshot, "parentIssue", "parent", "Parent Issue"),
    field(snapshot, "project", "project", "Project")
  ];
  return { schemaVersion: "normalized_current_fields_v1", issueKey: String(snapshot.key ?? ""), fetchedAt: snapshot.fetchedAt, fields };
}
