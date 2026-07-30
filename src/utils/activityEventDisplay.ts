const EVENT_LABELS: Record<string, string> = {
  issue_created: "Issue created",
  field_changed: "Field changed",
  status_changed: "Status changed",
  assignee_changed: "Assignee changed",
  comment_created: "Comment created",
  comment_updated: "Comment updated",
  attachment_added: "Attachment added",
  attachment_removed: "Attachment removed",
  issue_link_added: "Issue link added",
  issue_link_removed: "Issue link removed",
  remote_link_added: "Remote link added",
  worklog_added: "Worklog added"
};

export function formatActivityEventType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Unknown event";
  return EVENT_LABELS[normalized] ?? normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readableObject(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not captured";
  if (Array.isArray(value)) return value.length ? value.map(readableObject).join(", ") : "Empty list";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["displayName", "name", "value", "key", "title", "filename"]) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== "") return String(record[key]);
    }
    return Object.entries(record).map(([key, item]) => `${key}: ${readableObject(item)}`).join("; ") || "Empty object";
  }
  return String(value);
}

export function formatActivityEventValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not captured";
  if (typeof value !== "string") return readableObject(value);
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return "Not captured";
  try {
    return readableObject(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

export function formatActivityActor(row: Record<string, unknown>) {
  return String(row.displayName ?? "").trim() || String(row.userId ?? "").trim() || "Unknown actor";
}

export function formatActivitySource(value: unknown) {
  const source = String(value ?? "").trim();
  return source ? source.replace(/[_:]+/g, " ") : "Unknown source";
}
