import crypto from "node:crypto";
import { stableCanonicalJson } from "./stableSourceProjection.js";

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
  eventHash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function list(value: unknown) {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ["items", "values", "comments", "attachments", "links"]) {
      if (Array.isArray(value[key])) return value[key] as unknown[];
    }
  }
  return [] as unknown[];
}

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function actor(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    id: text(record.accountId ?? record.key ?? record.name) || null,
    name: text(record.displayName ?? record.name ?? record.emailAddress) || null
  };
}

function eventTime(value: unknown, fallback: unknown) {
  const candidate = text(value || fallback);
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : candidate;
}

function fallbackId(kind: string, value: unknown) {
  return `fallback:${kind}:${crypto.createHash("sha256").update(stableCanonicalJson(value)).digest("hex")}`;
}

function eventHash(serverIdentity: string, issueKey: string, event: Omit<ActivityEvent, "id" | "eventHash">) {
  return crypto.createHash("sha256").update(stableCanonicalJson({
    serverIdentity,
    issueKey,
    eventType: event.eventType,
    sourceRecordId: event.sourceRecordId,
    eventTime: event.eventTime,
    actorAccountId: event.actorAccountId,
    fieldId: event.fieldId,
    fromValueJson: event.fromValueJson,
    toValueJson: event.toValueJson
  })).digest("hex");
}

function finish(serverIdentity: string, issueKey: string, event: Omit<ActivityEvent, "id" | "eventHash">): ActivityEvent {
  const hash = eventHash(serverIdentity, issueKey, event);
  return { ...event, id: `event:${hash}`, eventHash: hash };
}

export function extractActivityEvents(rawJson: unknown, serverIdentity: string, issueKey: string) {
  if (!isRecord(rawJson)) throw new Error("ACTIVITY_EVENT_PARSE_FAILED:payload_not_object");
  const issue = isRecord(rawJson.issue)
    ? rawJson.issue
    : isRecord(rawJson.fields) || rawJson.key ? rawJson : {};
  const fields = isRecord(issue.fields) ? issue.fields : {};
  const events: ActivityEvent[] = [];
  const issueActor = actor(fields.creator);
  const created = text(fields.created);
  if (created) {
    events.push(finish(serverIdentity, issueKey, {
      eventType: "issue_created",
      eventTime: eventTime(created, ""),
      actorAccountId: issueActor.id,
      actorDisplayName: issueActor.name,
      fieldId: null,
      fieldName: null,
      fromValueJson: null,
      toValueJson: stableCanonicalJson({ key: issueKey }),
      sourceRecordId: text(issue.id) || fallbackId("issue", { issueKey, created })
    }));
  }

  for (const historyValue of list(rawJson.changelog ?? fields.changelog)) {
    if (!isRecord(historyValue)) continue;
    const historyActor = actor(historyValue.author);
    const historyId = text(historyValue.id) || fallbackId("changelog", historyValue);
    for (const itemValue of list(historyValue.items)) {
      if (!isRecord(itemValue)) continue;
      const fieldId = text(itemValue.fieldId ?? itemValue.field) || null;
      const fieldName = text(itemValue.field) || fieldId;
      const normalizedField = text(fieldId).toLowerCase();
      const type = normalizedField === "status" ? "status_changed"
        : normalizedField === "assignee" ? "assignee_changed"
          : "field_changed";
      const sourceRecordId = `${historyId}:${fieldId ?? fallbackId("field", itemValue)}`;
      events.push(finish(serverIdentity, issueKey, {
        eventType: type,
        eventTime: eventTime(historyValue.created, fields.updated),
        actorAccountId: historyActor.id,
        actorDisplayName: historyActor.name,
        fieldId,
        fieldName,
        fromValueJson: stableCanonicalJson(itemValue.from ?? itemValue.fromString ?? null),
        toValueJson: stableCanonicalJson(itemValue.to ?? itemValue.toString ?? null),
        sourceRecordId
      }));
    }
  }

  for (const commentValue of list(rawJson.comments ?? fields.comments)) {
    if (!isRecord(commentValue)) continue;
    const author = actor(commentValue.author ?? commentValue.updateAuthor);
    const id = text(commentValue.id) || fallbackId("comment", commentValue);
    const createdAt = eventTime(commentValue.created, fields.updated);
    const updatedAt = eventTime(commentValue.updated, commentValue.created);
    events.push(finish(serverIdentity, issueKey, {
      eventType: "comment_created",
      eventTime: createdAt,
      actorAccountId: author.id,
      actorDisplayName: author.name,
      fieldId: null,
      fieldName: null,
      fromValueJson: null,
      toValueJson: stableCanonicalJson(commentValue.body ?? null),
      sourceRecordId: id
    }));
    if (updatedAt && createdAt && updatedAt !== createdAt) {
      events.push(finish(serverIdentity, issueKey, {
        eventType: "comment_updated",
        eventTime: updatedAt,
        actorAccountId: author.id,
        actorDisplayName: author.name,
        fieldId: null,
        fieldName: null,
        fromValueJson: null,
        toValueJson: stableCanonicalJson(commentValue.body ?? null),
        sourceRecordId: `${id}:updated:${updatedAt}`
      }));
    }
  }

  for (const attachmentValue of list(rawJson.attachments ?? fields.attachment ?? fields.attachments)) {
    if (!isRecord(attachmentValue)) continue;
    const author = actor(attachmentValue.author);
    const id = text(attachmentValue.id) || fallbackId("attachment", attachmentValue);
    events.push(finish(serverIdentity, issueKey, {
      eventType: "attachment_added",
      eventTime: eventTime(attachmentValue.created, fields.updated),
      actorAccountId: author.id,
      actorDisplayName: author.name,
      fieldId: null,
      fieldName: null,
      fromValueJson: null,
      toValueJson: stableCanonicalJson({
        id: attachmentValue.id ?? null,
        filename: attachmentValue.filename ?? null,
        size: attachmentValue.size ?? null,
        mimeType: attachmentValue.mimeType ?? null
      }),
      sourceRecordId: id
    }));
  }

  for (const linkValue of list(rawJson.issueLinks ?? fields.issuelinks)) {
    if (!isRecord(linkValue)) continue;
    const id = text(linkValue.id) || fallbackId("issue-link", linkValue);
    events.push(finish(serverIdentity, issueKey, {
      eventType: "issue_link_changed",
      eventTime: eventTime(linkValue.created ?? linkValue.updated, fields.updated),
      actorAccountId: null,
      actorDisplayName: null,
      fieldId: "issuelinks",
      fieldName: "Issue Links",
      fromValueJson: null,
      toValueJson: stableCanonicalJson(linkValue),
      sourceRecordId: id
    }));
  }
  return [...new Map(events.map((event) => [event.eventHash, event])).values()]
    .sort((left, right) => left.eventTime.localeCompare(right.eventTime) || left.eventHash.localeCompare(right.eventHash));
}
