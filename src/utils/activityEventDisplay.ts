import { preciseMissingValue, readableContentSummary } from "./richContent";

const EVENT_LABELS: Record<string, string> = {
  issue_created: "Issue created", field_changed: "Field changed", status_changed: "Status changed",
  assignee_changed: "Assignee changed", comment_created: "Comment created", comment_updated: "Comment updated",
  attachment_added: "Attachment added", attachment_removed: "Attachment removed", issue_link_added: "Issue link added",
  issue_link_removed: "Issue link removed", remote_link_added: "Remote link added", worklog_added: "Worklog added"
};

export function formatActivityEventType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Unknown event";
  return EVENT_LABELS[normalized] ?? normalized.split(/[_-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function readableObject(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.length ? value.map(readableObject).filter(Boolean).join(", ") : "Empty list";
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    if (source.body !== undefined) return readableContentSummary(source.body, undefined, 320) || preciseCommentStatus(source.contentStatus);
    for (const key of ["displayName", "name", "value", "key", "title", "filename"]) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") return String(source[key]);
    }
    return Object.entries(source).filter(([key]) => key !== "provenance").map(([key, item]) => `${key}: ${readableObject(item)}`).filter((item) => !item.endsWith(": ")).join("; ");
  }
  return String(value);
}

function preciseCommentStatus(value: unknown) {
  const status = String(value ?? "");
  if (status === "omitted_by_size_policy") return preciseMissingValue("safety");
  if (status === "not_persisted_by_current_data_model") return preciseMissingValue("model");
  return preciseMissingValue("source");
}

export function formatActivityEventValue(value: unknown, missing = preciseMissingValue("source")) {
  if (value === null || value === undefined || value === "") return missing;
  if (typeof value !== "string") return readableObject(value) || missing;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return missing;
  try {
    return readableObject(JSON.parse(trimmed)) || missing;
  } catch {
    return readableContentSummary(trimmed, undefined, 320) || missing;
  }
}

export function activityEventBefore(row: Record<string, unknown>) {
  return formatActivityEventValue(row.before, preciseMissingValue("previous"));
}

export function activityEventAfter(row: Record<string, unknown>) {
  if (["comment_created", "comment_updated"].includes(String(row.eventType))) {
    if (row.commentBody) return readableContentSummary(row.commentBody, String(row.commentBodyFormat ?? ""), 320);
    if (row.commentContentStatus) return preciseCommentStatus(row.commentContentStatus);
  }
  return formatActivityEventValue(row.after, preciseMissingValue("source"));
}

export function formatActivityActor(row: Record<string, unknown>) {
  return String(row.displayName ?? "").trim() || String(row.userId ?? "").trim() || "Unknown actor";
}

export function formatActivitySource(value: unknown) {
  const source = String(value ?? "").trim();
  return source ? source.replace(/[_:]+/g, " ") : "Unknown source";
}