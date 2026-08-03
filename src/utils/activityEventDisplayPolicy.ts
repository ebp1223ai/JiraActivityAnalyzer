import { normalizeActivityChange } from "./normalizedChange";

export type CommentOperation = "CREATE" | "UPDATE" | "COMMENT";

export type ActivityEventDisplayPolicy = {
  kind: "comment" | "change";
  operation: CommentOperation | null;
  content: string;
  preview: string;
  metadata: Array<{ label: string; value: string }>;
};

function firstText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function activityEventDisplayPolicy(row: Record<string, unknown>): ActivityEventDisplayPolicy {
  const eventType = firstText(row, ["eventType", "activityType", "action", "type"]).toLowerCase();
  const fieldName = firstText(row, ["fieldName", "field"]).toLowerCase();
  const commentId = firstText(row, ["commentId", "sourceCommentId", "source_comment_id"]);
  const isComment = eventType.includes("comment") || fieldName.includes("comment") || Boolean(commentId);
  const change = normalizeActivityChange(row);
  if (!isComment) {
    const content = change.contentDisplay.displayText ?? change.afterDisplayText ?? change.afterText ?? "";
    return { kind: "change", operation: null, content, preview: content.slice(0, 180), metadata: [] };
  }

  const operation: CommentOperation = /created|added|create/.test(eventType)
    ? "CREATE"
    : /updated|edited|update/.test(eventType)
      ? "UPDATE"
      : "COMMENT";
  const content = firstText(row, ["commentBody", "displayText", "toValueText", "afterText"])
    || change.contentDisplay.displayText
    || change.afterDisplayText
    || change.afterText
    || "Comment content unavailable";
  const metadata = [
    { label: "Comment ID", value: commentId },
    { label: "Author", value: firstText(row, ["displayName", "actorDisplayName", "authorDisplayName", "actor"]) },
    { label: "Created", value: firstText(row, ["commentCreated", "createdAt", "created"]) },
    { label: "Updated", value: firstText(row, ["commentUpdated", "updatedAt", "updated", "eventTime"]) }
  ].filter((item) => item.value);
  return { kind: "comment", operation, content, preview: content.slice(0, 180), metadata };
}
