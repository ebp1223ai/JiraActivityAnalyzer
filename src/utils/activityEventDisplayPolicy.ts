import { commentTextV046, isCommentV046 } from "../../shared/activityPresentationV046";
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
  const commentId = firstText(row, ["commentId", "sourceCommentId", "source_comment_id"]);
  const isComment = isCommentV046(row) || Boolean(commentId);
  if (!isComment) {
    const change = normalizeActivityChange(row);
    const content = change.contentDisplay.displayText ?? change.afterDisplayText ?? change.afterText ?? "";
    return { kind: "change", operation: null, content, preview: content.slice(0, 180), metadata: [] };
  }

  const operation: CommentOperation = /created|added|create/.test(eventType)
    ? "CREATE"
    : /updated|edited|update/.test(eventType)
      ? "UPDATE"
      : "COMMENT";
  const content = commentTextV046(row.commentBody ?? row.after ?? row.toValueText ?? row.afterText) ?? "Comment content unavailable";
  const metadata = [
    { label: "Comment ID", value: commentId },
    { label: "Author", value: firstText(row, ["displayName", "actorDisplayName", "authorDisplayName", "actor"]) },
    { label: "Created", value: firstText(row, ["commentCreated", "createdAt", "created"]) },
    { label: "Updated", value: firstText(row, ["commentUpdated", "updatedAt", "updated", "eventTime"]) }
  ].filter((item) => item.value);
  return { kind: "comment", operation, content, preview: content.slice(0, 180), metadata };
}
