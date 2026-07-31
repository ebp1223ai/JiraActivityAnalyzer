import crypto from "node:crypto";
import { canonicalJsonV3 } from "./stableIssueContentV3.js";
import { decideCommentContent, decideContentDisplay, decideDescriptionContent, decideWorklogContent, type ContentDisplayResult, type ContentValue, type ExactCurrentRecord } from "./contentDisplayDecision.js";

export const EVENT_IDENTITY_POLICY_VERSION = 3;
export const EFFECTIVE_EVENT_IDENTITY_POLICY_V3 = {
  policyVersion: EVENT_IDENTITY_POLICY_VERSION,
  canonicalJsonVersion: 1,
  identities: {
    issueCreated: "issue_created:<jiraIssueId>",
    commentCreated: "comment_created:<commentId>",
    commentUpdated: "comment_updated:<commentId>:<normalizedUpdatedTimestamp>",
    worklogCurrent: "worklog_current:<worklogId>",
    worklogUpdated: "worklog_updated:<worklogId>:<normalizedUpdatedTimestamp>",
    changelog: "jira_changelog:<historyId>:<itemIndex>:<normalizedFieldIdentity>",
    attachmentAdded: "attachment_added:<attachmentId>"
  },
  rejectionBehavior: "skip_missing_jira_native_identity",
  timestampNormalization: "ISO-8601",
  hashAlgorithm: "SHA-256",
  byteEncoding: "UTF-8"
} as const;
export const EVENT_IDENTITY_POLICY_JSON = canonicalJsonV3(EFFECTIVE_EVENT_IDENTITY_POLICY_V3);
export const EVENT_IDENTITY_POLICY_FINGERPRINT = crypto.createHash("sha256").update(EVENT_IDENTITY_POLICY_JSON, "utf8").digest("hex");

export type ActivityEvent = {
  id: string;
  eventType: "issue_created" | "field_changed" | "status_changed" | "assignee_changed" | "comment_created" | "comment_updated" | "attachment_added" | "issue_link_changed" | "worklog_created" | "worklog_updated" | "worklog_deleted" | "worklog_current";
  eventTime: string;
  actorAccountId: string | null;
  actorDisplayName: string | null;
  fieldId: string | null;
  fieldName: string | null;
  fromValueJson: string | null;
  toValueJson: string | null;
  sourceRecordId: string;
  eventIdentityHash: string;
  eventHash: string;
  identityKeyType: string;
  jiraNativeSourceId: string;
  sourceProvenance: "jira_issue" | "jira_changelog" | "jira_comment" | "jira_attachment" | "jira_worklog";
  contentDisplayMode: ContentDisplayResult["mode"];
  contentSource: ContentDisplayResult["source"];
  beforeComplete: boolean;
  afterComplete: boolean;
  displayText: string | null;
  parseStatus: ContentDisplayResult["parseStatus"];
  sourceCommentId: string | null;
  sourceWorklogId: string | null;
};
export type ActivityEventExtraction = { events: ActivityEvent[]; warnings: Array<{ code: string; source: string }> };

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function list(value: unknown): unknown[] { if (Array.isArray(value)) return value; const source = record(value); for (const key of ["items", "values", "comments", "worklogs", "attachments", "links"]) if (Array.isArray(source[key])) return source[key] as unknown[]; return []; }
function text(value: unknown) { return value === undefined || value === null ? "" : String(value); }
function hasOwn(value: Record<string, unknown>, key: string) { return Object.prototype.hasOwnProperty.call(value, key); }
function actor(value: unknown) { const source = record(value); return { id: text(source.accountId ?? source.key ?? source.name) || null, name: text(source.displayName ?? source.name ?? source.emailAddress) || null }; }
function normalizedTimestamp(value: unknown) { const raw = text(value); if (!raw) return ""; const parsed = new Date(raw); return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : ""; }
function hashIdentity(serverIdentity: string, issueKey: string, identity: string) { return crypto.createHash("sha256").update(canonicalJsonV3({ serverIdentity, issueKey, identity }), "utf8").digest("hex"); }
function readable(value: unknown, depth = 0): string { if (depth > 32 || value === null || value === undefined) return ""; if (["string", "number", "boolean"].includes(typeof value)) return String(value); if (Array.isArray(value)) return value.map((item) => readable(item, depth + 1)).filter(Boolean).join("\n"); const source = record(value); if (typeof source.text === "string") return source.text; if (source.content !== undefined) return readable(source.content, depth + 1); if (source.body !== undefined) return readable(source.body, depth + 1); if (source.commentText !== undefined) return text(source.commentText); return ""; }
function value(source: ContentValue["source"], sourceId: string | null, present: boolean, raw: unknown, complete = true): ContentValue { return { present, text: present ? readable(raw) : null, complete: present && complete, source, sourceId }; }
function noContent(): ContentDisplayResult { return { mode: "not_applicable", beforeText: null, afterText: null, displayText: null, beforeAvailable: false, afterAvailable: false, beforeComplete: false, afterComplete: false, source: "none", sourceId: null, parseStatus: "success", completenessReason: null }; }
function event(serverIdentity: string, issueKey: string, identity: string, input: Omit<ActivityEvent, "id" | "eventIdentityHash" | "eventHash">): ActivityEvent { const eventIdentityHash = hashIdentity(serverIdentity, issueKey, identity); return { ...input, id: `event:${eventIdentityHash}`, eventIdentityHash, eventHash: eventIdentityHash }; }
function withDisplay(base: Omit<ActivityEvent, "id" | "eventIdentityHash" | "eventHash" | "contentDisplayMode" | "contentSource" | "beforeComplete" | "afterComplete" | "displayText" | "parseStatus" | "sourceCommentId" | "sourceWorklogId">, display = noContent(), ids: { commentId?: string; worklogId?: string } = {}): Omit<ActivityEvent, "id" | "eventIdentityHash" | "eventHash"> { return { ...base, contentDisplayMode: display.mode, contentSource: display.source, beforeComplete: display.beforeComplete, afterComplete: display.afterComplete, displayText: display.displayText, parseStatus: display.parseStatus, sourceCommentId: ids.commentId ?? null, sourceWorklogId: ids.worklogId ?? null }; }
function changelogEventType(fieldIdentity: string, beforePresent: boolean, afterPresent: boolean): ActivityEvent["eventType"] { if (fieldIdentity === "status") return "status_changed"; if (fieldIdentity === "assignee") return "assignee_changed"; if (["issuelinks", "issuelink", "link", "linked issues"].includes(fieldIdentity)) return "issue_link_changed"; if (fieldIdentity.includes("worklog")) return !beforePresent && afterPresent ? "worklog_created" : beforePresent && !afterPresent ? "worklog_deleted" : "worklog_updated"; return "field_changed"; }

export function extractActivityEventsV2(rawJson: unknown, serverIdentity: string, issueKey: string): ActivityEventExtraction {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) throw new Error("ACTIVITY_EVENT_PARSE_FAILED:payload_not_object");
  const raw = record(rawJson); const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw; const fields = record(issue.fields); const renderedFields = record(issue.renderedFields);
  const comments = list(raw.comments ?? record(fields.comment).comments ?? fields.comments).map(record);
  const worklogs = list(raw.worklogs ?? fields.worklog).map(record);
  const commentRecords: ExactCurrentRecord[] = comments.flatMap((item) => text(item.id) ? [{ id: text(item.id), text: readable(item.renderedBody ?? item.body), complete: true }] : []);
  const worklogRecords: ExactCurrentRecord[] = worklogs.flatMap((item) => { const id = text(item.worklogId ?? item.id); return id ? [{ id, text: readable(item.commentText ?? item.comment), complete: item.parseStatus !== "failed", parseFailed: item.parseStatus === "failed" }] : []; });
  const events: ActivityEvent[] = []; const warnings: ActivityEventExtraction["warnings"] = [];
  const jiraIssueId = text(issue.id); const issueCreatedAt = normalizedTimestamp(fields.created);
  if (jiraIssueId && issueCreatedAt) { const createdBy = actor(fields.creator); events.push(event(serverIdentity, issueKey, `issue_created:${jiraIssueId}`, withDisplay({ eventType: "issue_created", eventTime: issueCreatedAt, actorAccountId: createdBy.id, actorDisplayName: createdBy.name, fieldId: null, fieldName: null, fromValueJson: null, toValueJson: canonicalJsonV3({ key: issueKey }), sourceRecordId: jiraIssueId, identityKeyType: "jira_issue_id", jiraNativeSourceId: jiraIssueId, sourceProvenance: "jira_issue" }))); }
  for (const historyValue of list(raw.changelog ?? fields.changelog)) {
    const history = record(historyValue); const historyId = text(history.id); if (!historyId) { warnings.push({ code: "CHANGELOG_HISTORY_ID_MISSING", source: "changelog" }); continue; }
    const historyTime = normalizedTimestamp(history.created); const historyActor = actor(history.author);
    list(history.items).forEach((itemValue, itemIndex) => {
      const item = record(itemValue); const fieldIdentity = text(item.fieldId ?? item.field).trim().toLocaleLowerCase("en-US"); if (!fieldIdentity) { warnings.push({ code: "CHANGELOG_FIELD_IDENTITY_MISSING", source: historyId }); return; }
      const beforePresent = hasOwn(item, "from") || hasOwn(item, "fromString"); const afterPresent = hasOwn(item, "to") || hasOwn(item, "toString"); const beforeRaw = hasOwn(item, "fromString") ? item.fromString : item.from; const afterRaw = hasOwn(item, "toString") ? item.toString : item.to;
      const nativeId = text(item.to ?? item.from); const sourceId = /^\d+$/.test(nativeId) ? nativeId : null;
      const before = value("changelog", sourceId, beforePresent, beforeRaw); const after = value("changelog", sourceId, afterPresent, afterRaw);
      const display = fieldIdentity.includes("description") ? decideDescriptionContent({ before, after, currentDescription: value("current_issue_field", jiraIssueId, hasOwn(fields, "description"), fields.description), renderedDescription: value("current_issue_field", jiraIssueId, hasOwn(renderedFields, "description"), renderedFields.description) })
        : fieldIdentity.includes("comment") ? decideCommentContent({ commentId: sourceId, before, after, comments: commentRecords })
          : fieldIdentity.includes("worklog") ? decideWorklogContent({ worklogId: sourceId, before, after, worklogs: worklogRecords, deleted: beforePresent && !afterPresent })
            : decideContentDisplay({ before, after });
      events.push(event(serverIdentity, issueKey, `jira_changelog:${historyId}:${itemIndex}:${fieldIdentity}`, withDisplay({ eventType: changelogEventType(fieldIdentity, beforePresent, afterPresent), eventTime: historyTime, actorAccountId: historyActor.id, actorDisplayName: historyActor.name, fieldId: text(item.fieldId) || null, fieldName: text(item.field) || text(item.fieldId) || null, fromValueJson: beforePresent ? canonicalJsonV3(beforeRaw ?? null) : null, toValueJson: afterPresent ? canonicalJsonV3(afterRaw ?? null) : null, sourceRecordId: `${historyId}:${itemIndex}`, identityKeyType: "jira_changelog_history_item", jiraNativeSourceId: historyId, sourceProvenance: "jira_changelog" }, display, { commentId: fieldIdentity.includes("comment") ? sourceId ?? undefined : undefined, worklogId: fieldIdentity.includes("worklog") ? sourceId ?? undefined : undefined })));
    });
  }
  for (const comment of comments) {
    const commentId = text(comment.id); if (!commentId) { warnings.push({ code: "COMMENT_ID_MISSING", source: "comments" }); continue; }
    const createdAt = normalizedTimestamp(comment.created); const updatedAt = normalizedTimestamp(comment.updated); const commentAuthor = actor(comment.author ?? comment.updateAuthor); const body = comment.renderedBody ?? comment.body ?? null; const serializedBody = body === null ? "" : canonicalJsonV3(body); const bodyValue = serializedBody.length > 256 * 1024 ? { contentStatus: "omitted_by_size_policy", commentId } : { contentStatus: body === null ? "not_available_in_source_data" : "available", commentId, body }; const display = decideCommentContent({ commentId, comments: commentRecords });
    if (createdAt) events.push(event(serverIdentity, issueKey, `comment_created:${commentId}`, withDisplay({ eventType: "comment_created", eventTime: createdAt, actorAccountId: commentAuthor.id, actorDisplayName: commentAuthor.name, fieldId: null, fieldName: "Comment", fromValueJson: null, toValueJson: canonicalJsonV3({ provenance: "current_at_first_observation", ...bodyValue }), sourceRecordId: commentId, identityKeyType: "jira_comment_id", jiraNativeSourceId: commentId, sourceProvenance: "jira_comment" }, display, { commentId })));
    if (createdAt && updatedAt && Date.parse(updatedAt) > Date.parse(createdAt)) events.push(event(serverIdentity, issueKey, `comment_updated:${commentId}:${updatedAt}`, withDisplay({ eventType: "comment_updated", eventTime: updatedAt, actorAccountId: commentAuthor.id, actorDisplayName: commentAuthor.name, fieldId: null, fieldName: "Comment", fromValueJson: null, toValueJson: canonicalJsonV3({ provenance: "current_at_observation", ...bodyValue }), sourceRecordId: `${commentId}:${updatedAt}`, identityKeyType: "jira_comment_id_updated_timestamp", jiraNativeSourceId: commentId, sourceProvenance: "jira_comment" }, display, { commentId })));
  }
  for (const worklog of worklogs) {
    const worklogId = text(worklog.worklogId ?? worklog.id); if (!worklogId) { warnings.push({ code: "WORKLOG_ID_MISSING", source: "worklogs" }); continue; }
    const createdAt = normalizedTimestamp(worklog.createdAt ?? worklog.created); const updatedAt = normalizedTimestamp(worklog.updatedAt ?? worklog.updated); const worklogAuthor = { id: text(worklog.authorAccountId) || actor(worklog.author).id, name: text(worklog.authorDisplayName) || actor(worklog.author).name }; const comment = worklog.commentText ?? worklog.comment ?? null; const display = decideWorklogContent({ worklogId, worklogs: worklogRecords });
    events.push(event(serverIdentity, issueKey, `worklog_current:${worklogId}`, withDisplay({ eventType: "worklog_current", eventTime: updatedAt || createdAt, actorAccountId: worklogAuthor.id, actorDisplayName: worklogAuthor.name, fieldId: "worklog", fieldName: "Worklog", fromValueJson: null, toValueJson: canonicalJsonV3(comment), sourceRecordId: worklogId, identityKeyType: "jira_worklog_id", jiraNativeSourceId: worklogId, sourceProvenance: "jira_worklog" }, display, { worklogId })));
    if (createdAt) events.push(event(serverIdentity, issueKey, `worklog_created:${worklogId}`, withDisplay({ eventType: "worklog_created", eventTime: createdAt, actorAccountId: worklogAuthor.id, actorDisplayName: worklogAuthor.name, fieldId: "worklog", fieldName: "Worklog", fromValueJson: null, toValueJson: canonicalJsonV3(comment), sourceRecordId: worklogId, identityKeyType: "jira_worklog_id", jiraNativeSourceId: worklogId, sourceProvenance: "jira_worklog" }, display, { worklogId })));
    if (createdAt && updatedAt && Date.parse(updatedAt) > Date.parse(createdAt)) events.push(event(serverIdentity, issueKey, `worklog_updated:${worklogId}:${updatedAt}`, withDisplay({ eventType: "worklog_updated", eventTime: updatedAt, actorAccountId: worklogAuthor.id, actorDisplayName: worklogAuthor.name, fieldId: "worklog", fieldName: "Worklog", fromValueJson: null, toValueJson: canonicalJsonV3(comment), sourceRecordId: `${worklogId}:${updatedAt}`, identityKeyType: "jira_worklog_id_updated_timestamp", jiraNativeSourceId: worklogId, sourceProvenance: "jira_worklog" }, display, { worklogId })));
  }
  for (const attachmentValue of list(raw.attachments ?? fields.attachment)) { const attachment = record(attachmentValue); const attachmentId = text(attachment.id); if (!attachmentId) { warnings.push({ code: "ATTACHMENT_ID_MISSING", source: "attachments" }); continue; } events.push(event(serverIdentity, issueKey, `attachment_added:${attachmentId}`, withDisplay({ eventType: "attachment_added", eventTime: normalizedTimestamp(attachment.created), actorAccountId: actor(attachment.author).id, actorDisplayName: actor(attachment.author).name, fieldId: null, fieldName: null, fromValueJson: null, toValueJson: canonicalJsonV3({ filename: attachment.filename ?? null, mimeType: attachment.mimeType ?? null, size: attachment.size ?? null }), sourceRecordId: attachmentId, identityKeyType: "jira_attachment_id", jiraNativeSourceId: attachmentId, sourceProvenance: "jira_attachment" }))); }
  return { events, warnings };
}
export function extractActivityEvents(rawJson: unknown, serverIdentity: string, issueKey: string) { return extractActivityEventsV2(rawJson, serverIdentity, issueKey).events; }
