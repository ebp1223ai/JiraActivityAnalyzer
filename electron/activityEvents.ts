import crypto from "node:crypto";
import { canonicalJsonV3 } from "./stableIssueContentV3.js";

export const EVENT_IDENTITY_POLICY_VERSION = 2;

export const EFFECTIVE_EVENT_IDENTITY_POLICY_V2 = {
  policyVersion: EVENT_IDENTITY_POLICY_VERSION,
  canonicalJsonVersion: 1,
  identities: {
    issueCreated: "issue_created:<jiraIssueId>",
    commentCreated: "comment_created:<commentId>",
    commentUpdated: "comment_updated:<commentId>:<normalizedUpdatedTimestamp>",
    changelog: "jira_changelog:<historyId>:<itemIndex>:<normalizedFieldIdentity>",
    attachmentAdded: "attachment_added:<attachmentId>"
  },
  rejectionBehavior: "skip_missing_jira_native_identity",
  timestampNormalization: "ISO-8601",
  hashAlgorithm: "SHA-256",
  byteEncoding: "UTF-8"
} as const;

export const EVENT_IDENTITY_POLICY_JSON = canonicalJsonV3(EFFECTIVE_EVENT_IDENTITY_POLICY_V2);
export const EVENT_IDENTITY_POLICY_FINGERPRINT = crypto.createHash("sha256")
  .update(EVENT_IDENTITY_POLICY_JSON, "utf8")
  .digest("hex");

export type ActivityEvent = {
  id: string;
  eventType: "issue_created" | "field_changed" | "status_changed" | "assignee_changed"
    | "comment_created" | "comment_updated" | "attachment_added" | "issue_link_changed";
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
  sourceProvenance: "jira_issue" | "jira_changelog" | "jira_comment" | "jira_attachment";
};

export type ActivityEventExtraction = {
  events: ActivityEvent[];
  warnings: Array<{ code: string; source: string }>;
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

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function actor(value: unknown) {
  const source = record(value);
  return {
    id: text(source.accountId ?? source.key ?? source.name) || null,
    name: text(source.displayName ?? source.name ?? source.emailAddress) || null
  };
}

function normalizedTimestamp(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : "";
}

function hashIdentity(serverIdentity: string, issueKey: string, identity: string) {
  return crypto.createHash("sha256")
    .update(canonicalJsonV3({ serverIdentity, issueKey, identity }), "utf8")
    .digest("hex");
}

function event(
  serverIdentity: string,
  issueKey: string,
  identity: string,
  value: Omit<ActivityEvent, "id" | "eventIdentityHash" | "eventHash">
): ActivityEvent {
  const eventIdentityHash = hashIdentity(serverIdentity, issueKey, identity);
  return { ...value, id: `event:${eventIdentityHash}`, eventIdentityHash, eventHash: eventIdentityHash };
}

function changelogEventType(fieldIdentity: string): ActivityEvent["eventType"] {
  if (fieldIdentity === "status") return "status_changed";
  if (fieldIdentity === "assignee") return "assignee_changed";
  if (["issuelinks", "issuelink", "link", "linked issues"].includes(fieldIdentity)) return "issue_link_changed";
  return "field_changed";
}

export function extractActivityEventsV2(rawJson: unknown, serverIdentity: string, issueKey: string): ActivityEventExtraction {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    throw new Error("ACTIVITY_EVENT_PARSE_FAILED:payload_not_object");
  }
  const raw = record(rawJson);
  const issue = Object.keys(record(raw.issue)).length ? record(raw.issue) : raw;
  const fields = record(issue.fields);
  const events: ActivityEvent[] = [];
  const warnings: ActivityEventExtraction["warnings"] = [];

  const jiraIssueId = text(issue.id);
  const issueCreatedAt = normalizedTimestamp(fields.created);
  if (jiraIssueId && issueCreatedAt) {
    const createdBy = actor(fields.creator);
    events.push(event(serverIdentity, issueKey, `issue_created:${jiraIssueId}`, {
      eventType: "issue_created",
      eventTime: issueCreatedAt,
      actorAccountId: createdBy.id,
      actorDisplayName: createdBy.name,
      fieldId: null,
      fieldName: null,
      fromValueJson: null,
      toValueJson: canonicalJsonV3({ key: issueKey }),
      sourceRecordId: jiraIssueId,
      identityKeyType: "jira_issue_id",
      jiraNativeSourceId: jiraIssueId,
      sourceProvenance: "jira_issue"
    }));
  }

  for (const historyValue of list(raw.changelog ?? fields.changelog)) {
    const history = record(historyValue);
    const historyId = text(history.id);
    if (!historyId) {
      warnings.push({ code: "CHANGELOG_HISTORY_ID_MISSING", source: "changelog" });
      continue;
    }
    const historyTime = normalizedTimestamp(history.created);
    const historyActor = actor(history.author);
    list(history.items).forEach((itemValue, itemIndex) => {
      const item = record(itemValue);
      const fieldIdentity = text(item.fieldId ?? item.field).trim().toLocaleLowerCase("en-US");
      if (!fieldIdentity) {
        warnings.push({ code: "CHANGELOG_FIELD_IDENTITY_MISSING", source: historyId });
        return;
      }
      const identity = `jira_changelog:${historyId}:${itemIndex}:${fieldIdentity}`;
      events.push(event(serverIdentity, issueKey, identity, {
        eventType: changelogEventType(fieldIdentity),
        eventTime: historyTime,
        actorAccountId: historyActor.id,
        actorDisplayName: historyActor.name,
        fieldId: text(item.fieldId) || null,
        fieldName: text(item.field) || text(item.fieldId) || null,
        fromValueJson: canonicalJsonV3(item.from ?? item.fromString ?? null),
        toValueJson: canonicalJsonV3(item.to ?? item.toString ?? null),
        sourceRecordId: `${historyId}:${itemIndex}`,
        identityKeyType: "jira_changelog_history_item",
        jiraNativeSourceId: historyId,
        sourceProvenance: "jira_changelog"
      }));
    });
  }

  for (const commentValue of list(raw.comments ?? record(fields.comment).comments ?? fields.comments)) {
    const comment = record(commentValue);
    const commentId = text(comment.id);
    if (!commentId) {
      warnings.push({ code: "COMMENT_ID_MISSING", source: "comments" });
      continue;
    }
    const createdAt = normalizedTimestamp(comment.created);
    const updatedAt = normalizedTimestamp(comment.updated);
    const commentAuthor = actor(comment.author ?? comment.updateAuthor);
    if (createdAt) {
      events.push(event(serverIdentity, issueKey, `comment_created:${commentId}`, {
        eventType: "comment_created",
        eventTime: createdAt,
        actorAccountId: commentAuthor.id,
        actorDisplayName: commentAuthor.name,
        fieldId: null,
        fieldName: null,
        fromValueJson: null,
        toValueJson: canonicalJsonV3({ provenance: "current_at_first_observation" }),
        sourceRecordId: commentId,
        identityKeyType: "jira_comment_id",
        jiraNativeSourceId: commentId,
        sourceProvenance: "jira_comment"
      }));
    }
    if (createdAt && updatedAt && Date.parse(updatedAt) > Date.parse(createdAt)) {
      events.push(event(serverIdentity, issueKey, `comment_updated:${commentId}:${updatedAt}`, {
        eventType: "comment_updated",
        eventTime: updatedAt,
        actorAccountId: commentAuthor.id,
        actorDisplayName: commentAuthor.name,
        fieldId: null,
        fieldName: null,
        fromValueJson: null,
        toValueJson: canonicalJsonV3({ provenance: "current_at_observation" }),
        sourceRecordId: `${commentId}:${updatedAt}`,
        identityKeyType: "jira_comment_id_updated_timestamp",
        jiraNativeSourceId: commentId,
        sourceProvenance: "jira_comment"
      }));
    }
  }

  for (const attachmentValue of list(raw.attachments ?? fields.attachment)) {
    const attachment = record(attachmentValue);
    const attachmentId = text(attachment.id);
    if (!attachmentId) {
      warnings.push({ code: "ATTACHMENT_ID_MISSING", source: "attachments" });
      continue;
    }
    events.push(event(serverIdentity, issueKey, `attachment_added:${attachmentId}`, {
      eventType: "attachment_added",
      eventTime: normalizedTimestamp(attachment.created),
      actorAccountId: actor(attachment.author).id,
      actorDisplayName: actor(attachment.author).name,
      fieldId: null,
      fieldName: null,
      fromValueJson: null,
      toValueJson: canonicalJsonV3({
        filename: attachment.filename ?? null,
        mimeType: attachment.mimeType ?? null,
        size: attachment.size ?? null
      }),
      sourceRecordId: attachmentId,
      identityKeyType: "jira_attachment_id",
      jiraNativeSourceId: attachmentId,
      sourceProvenance: "jira_attachment"
    }));
  }

  return { events, warnings };
}

// Compatibility export for existing callers while V2 remains the only active policy.
export function extractActivityEvents(rawJson: unknown, serverIdentity: string, issueKey: string) {
  return extractActivityEventsV2(rawJson, serverIdentity, issueKey).events;
}
