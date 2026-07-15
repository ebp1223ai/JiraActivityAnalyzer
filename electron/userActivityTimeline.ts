import { sha256 } from "./activityStreamBaseline.js";

export type TimelineEventType = "comment" | "attachment" | "link" | "page" | "field_change" | "status_change" | "assignee_change" | "resolution_change" | "unknown";
export type TimelineConfidence = "high" | "medium" | "low";

export type TimelineSourceEntry = {
  issueKey?: string;
  extractedIssueKeysPerEntry?: string[];
  activityTime?: string;
  activityType?: string;
  activityTitle?: string;
  activityAuthor?: string;
  activityAuthorEmail?: string;
  activityTypeClassifier?: { matchedRule?: string; finalType?: string };
  rawTitle?: string;
  rawSummary?: string;
  entryFingerprint?: string;
  variant?: string;
};

export type UserActivityTimelineEvent = {
  eventId: string;
  userKey: string;
  displayName: string;
  issueKey: string;
  allIssueKeys: string[];
  eventTime: string;
  eventType: TimelineEventType;
  eventTitle: string;
  source: "activity_stream";
  sourceRunId: string;
  sourceConfidence: TimelineConfidence;
  projectKey: string;
  evidence: {
    activityTypeClassifier: { matchedRule: string; finalType: TimelineEventType };
    baselineGuard: {
      classification: string;
      retryTriggered: boolean;
      retryRecovered: boolean;
      baselineBestParsedActivityCount: number;
      currentParsedActivityCount: number;
    };
  };
  rawRef: { entryFingerprint: string; variant: string; activityStreamQueryUser: string };
  rawTitle: string;
  sanitizedSummary: string;
};

export type UserActivityTimelineSummary = {
  timelineRunId: string;
  builtAt: string;
  selectedUser: string;
  dateRange: { start: string; end: string };
  projectScope: string;
  source: "activity_stream";
  sourceRunId: string;
  totalEvents: number;
  issueKeyCount: number;
  eventTypeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  confidenceCounts: Record<string, number>;
  baselineGuard: { classification: string; retryTriggered: boolean; retryRecovered: boolean };
};

export type UserActivityTimelineBuild = {
  timelineRunId: string;
  summary: UserActivityTimelineSummary;
  events: UserActivityTimelineEvent[];
};

const eventTypes = new Set<TimelineEventType>(["comment", "attachment", "link", "page", "field_change", "status_change", "assignee_change", "resolution_change", "unknown"]);
const highTypes = new Set<TimelineEventType>(["comment", "attachment", "link", "field_change", "status_change", "assignee_change", "resolution_change"]);

function mappedType(value: string): TimelineEventType {
  if (eventTypes.has(value as TimelineEventType)) return value as TimelineEventType;
  return "unknown";
}

function sourceConfidence(eventType: TimelineEventType, issueKey: string, classification: string, retryRecovered: boolean): TimelineConfidence {
  if (eventType === "unknown" || classification === "result_incomplete_candidate" || classification.startsWith("suspicious_") || (!issueKey && eventType !== "page") || (classification.includes("stale") && !retryRecovered)) return "low";
  if (issueKey && highTypes.has(eventType) && ["accepted_equal", "accepted_improved"].includes(classification)) return "high";
  if ((issueKey && classification === "first_observation") || eventType === "page") return "medium";
  return issueKey ? "medium" : "low";
}

function inDateRange(value: string, start: string, end: string) {
  if (!value) return true;
  const time = Date.parse(value);
  const startTime = Date.parse(`${start}T00:00:00`);
  const endTime = Date.parse(`${end}T23:59:59.999`);
  return !Number.isFinite(time) || (time >= startTime && time <= endTime);
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildUserActivityTimeline(input: {
  timelineRunId: string;
  builtAt: string;
  selectedUser: string;
  dateRange: { start: string; end: string };
  projectScope: string;
  sourceRunId: string;
  activityStreamQueryUser: string;
  entries: TimelineSourceEntry[];
  baseline: {
    classification: string;
    retryTriggered: boolean;
    retryRecovered: boolean;
    baselineBestParsedActivityCount: number;
    currentParsedActivityCount: number;
  };
}): UserActivityTimelineBuild {
  const deduplicated = new Map<string, UserActivityTimelineEvent>();
  for (const entry of input.entries) {
    if (!inDateRange(String(entry.activityTime ?? ""), input.dateRange.start, input.dateRange.end)) continue;
    const eventType = mappedType(String(entry.activityTypeClassifier?.finalType ?? entry.activityType ?? "unknown"));
    const allIssueKeys = Array.from(new Set([String(entry.issueKey ?? ""), ...(entry.extractedIssueKeysPerEntry ?? [])].filter(Boolean)));
    const issueKey = String(entry.issueKey ?? allIssueKeys[0] ?? "");
    const fingerprint = String(entry.entryFingerprint ?? `sha256:${sha256(JSON.stringify(entry))}`);
    const eventTime = String(entry.activityTime ?? "");
    const eventId = `sha256:${sha256(["activity_stream", input.selectedUser, issueKey || "-", eventTime, eventType, fingerprint].join("|"))}`;
    const projectKey = issueKey.includes("-") ? issueKey.split("-")[0] : "";
    deduplicated.set(eventId, {
      eventId,
      userKey: String(entry.activityAuthorEmail || input.selectedUser),
      displayName: String(entry.activityAuthor || input.selectedUser),
      issueKey,
      allIssueKeys,
      eventTime,
      eventType,
      eventTitle: String(entry.activityTitle || entry.rawTitle || "Untitled activity"),
      source: "activity_stream",
      sourceRunId: input.sourceRunId,
      sourceConfidence: sourceConfidence(eventType, issueKey, input.baseline.classification, input.baseline.retryRecovered),
      projectKey,
      evidence: {
        activityTypeClassifier: { matchedRule: String(entry.activityTypeClassifier?.matchedRule ?? "unknown"), finalType: eventType },
        baselineGuard: { ...input.baseline }
      },
      rawRef: { entryFingerprint: fingerprint, variant: String(entry.variant ?? "escaped_username"), activityStreamQueryUser: input.activityStreamQueryUser },
      rawTitle: String(entry.rawTitle || entry.activityTitle || ""),
      sanitizedSummary: String(entry.rawSummary || entry.activityTitle || "")
    });
  }
  const events = Array.from(deduplicated.values()).sort((left, right) => right.eventTime.localeCompare(left.eventTime));
  const issueKeys = new Set(events.flatMap((event) => event.allIssueKeys));
  return {
    timelineRunId: input.timelineRunId,
    summary: {
      timelineRunId: input.timelineRunId,
      builtAt: input.builtAt,
      selectedUser: input.selectedUser,
      dateRange: input.dateRange,
      projectScope: input.projectScope,
      source: "activity_stream",
      sourceRunId: input.sourceRunId,
      totalEvents: events.length,
      issueKeyCount: issueKeys.size,
      eventTypeCounts: countBy(events.map((event) => event.eventType)),
      sourceCounts: countBy(events.map((event) => event.source)),
      confidenceCounts: countBy(events.map((event) => event.sourceConfidence)),
      baselineGuard: { classification: input.baseline.classification, retryTriggered: input.baseline.retryTriggered, retryRecovered: input.baseline.retryRecovered }
    },
    events
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function timelineCsv(events: UserActivityTimelineEvent[]) {
  const columns = ["eventTime", "userKey", "displayName", "issueKey", "allIssueKeys", "eventType", "eventTitle", "source", "sourceRunId", "sourceConfidence", "matchedRule", "entryFingerprint", "baselineClassification", "retryTriggered", "retryRecovered"];
  const rows = events.map((event) => [event.eventTime, event.userKey, event.displayName, event.issueKey, event.allIssueKeys.join(";"), event.eventType, event.eventTitle, event.source, event.sourceRunId, event.sourceConfidence, event.evidence.activityTypeClassifier.matchedRule, event.rawRef.entryFingerprint, event.evidence.baselineGuard.classification, event.evidence.baselineGuard.retryTriggered, event.evidence.baselineGuard.retryRecovered].map(csvCell).join(","));
  return `\uFEFF${columns.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export const timelineEventSchema = {
  schemaVersion: 1,
  required: ["eventId", "userKey", "displayName", "eventTime", "eventType", "source", "sourceRunId", "sourceConfidence", "evidence", "rawRef"],
  eventTypes: Array.from(eventTypes),
  confidenceValues: ["high", "medium", "low"]
};
