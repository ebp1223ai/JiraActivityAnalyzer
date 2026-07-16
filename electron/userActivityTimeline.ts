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
  entryIndex?: number;
};

export type TimelineIntegrityDiagnostics = {
  sourceParsedActivityCount: number;
  timelineEventCount: number;
  convertedEventCount: number;
  skippedEntryCount: number;
  deduplicatedEntryCount: number;
  sourceParsedIssueKeyCount: number;
  timelinePrimaryIssueKeyCount: number;
  timelineAllIssueKeyCount: number;
  sourceIssueKeys: string[];
  timelinePrimaryIssueKeys: string[];
  timelineAllIssueKeys: string[];
  missingIssueKeysFromTimeline: string[];
  missingIssueKeysFromPrimaryTimeline: string[];
  eventIdCollisionCount: number;
  skipReasons: Array<{ reason: string; count: number }>;
  dedupReasons: Array<{ reason: string; count: number }>;
  warnings: string[];
};

export type TimelineDedupDiagnostics = {
  enabled: true;
  deduplicatedEntryCount: number;
  dedupGroups: Array<{ eventId: string; keptEntryIndex: number; deduplicatedEntryIndexes: number[]; reason: "same_event_id"; issueKeys: string[]; eventTime: string }>;
};

export type TimelineEventCountReconciliation = {
  sourceParsedActivityCount: number;
  timelineEventCount: number;
  difference: number;
  deduplicatedEntryCount: number;
  skippedEntryCount: number;
  unexplainedDifferenceCount: number;
  status: "reconciled" | "unreconciled";
};

export type TimelineConfidenceDiagnostics = {
  runLevelClassification: string;
  eventLevelBaselineMatchedCount: number;
  eventLevelBaselineMissingCount: number;
  forcedLowDueToRunIncompleteCount: number;
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
      entryFingerprintMatched: boolean;
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
  primaryIssueKeyCount: number;
  allIssueKeyCount: number;
  eventTypeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  confidenceCounts: Record<string, number>;
  baselineGuard: { classification: string; retryTriggered: boolean; retryRecovered: boolean };
  integrity: TimelineIntegrityDiagnostics;
  eventCountReconciliation: TimelineEventCountReconciliation;
  dedupDiagnostics: TimelineDedupDiagnostics;
  confidenceDiagnostics: TimelineConfidenceDiagnostics;
};

export type UserActivityTimelineBuild = { timelineRunId: string; summary: UserActivityTimelineSummary; events: UserActivityTimelineEvent[] };

const eventTypes = new Set<TimelineEventType>(["comment", "attachment", "link", "page", "field_change", "status_change", "assignee_change", "resolution_change", "unknown"]);

function mappedType(value: string): TimelineEventType {
  return eventTypes.has(value as TimelineEventType) ? value as TimelineEventType : "unknown";
}

function normalizeSha256Id(value: string) {
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function uniqueInOrder(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of values) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function eventConfidence(eventType: TimelineEventType, issueKey: string, classification: string, fingerprintMatched: boolean): TimelineConfidence {
  if (eventType === "unknown" || (!issueKey && eventType !== "page") || classification.includes("stale")) return "low";
  if (fingerprintMatched && issueKey) return "high";
  if (["accepted_equal", "accepted_improved"].includes(classification) && issueKey) return "high";
  if (eventType === "page" || (issueKey && ["first_observation", "accepted_equal", "accepted_improved"].includes(classification))) return "medium";
  if (classification === "result_incomplete_candidate" && !fingerprintMatched) return "low";
  return issueKey ? "medium" : "low";
}

function dateRangeStatus(value: string, start: string, end: string): "inside" | "outside" | "missing" | "invalid" {
  if (!value) return "missing";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "invalid";
  const startTime = Date.parse(`${start}T00:00:00`);
  const endTime = Date.parse(`${end}T23:59:59.999`);
  return time >= startTime && time <= endTime ? "inside" : "outside";
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});
}

function reasonCounts(values: string[]) {
  return Object.entries(countBy(values)).map(([reason, count]) => ({ reason, count }));
}

export function buildUserActivityTimeline(input: {
  timelineRunId: string;
  builtAt: string;
  selectedUser: string;
  dateRange: { start: string; end: string };
  projectScope: string;
  sourceRunId: string;
  sourceParsedActivityCount: number;
  sourceIssueKeys: string[];
  activityStreamQueryUser: string;
  entries: TimelineSourceEntry[];
  baseline: {
    classification: string;
    retryTriggered: boolean;
    retryRecovered: boolean;
    baselineBestParsedActivityCount: number;
    currentParsedActivityCount: number;
    knownEntryFingerprints: string[];
  };
}): UserActivityTimelineBuild {
  const eventsById = new Map<string, { event: UserActivityTimelineEvent; entryIndex: number }>();
  const dedupGroups = new Map<string, TimelineDedupDiagnostics["dedupGroups"][number]>();
  const skipReasonList: string[] = [];
  const baselineFingerprints = new Set(input.baseline.knownEntryFingerprints);
  let eventIdCollisionCount = 0;

  input.entries.forEach((entry, arrayIndex) => {
    const entryIndex = Number.isFinite(entry.entryIndex) ? Number(entry.entryIndex) : arrayIndex;
    const dateStatus = dateRangeStatus(String(entry.activityTime ?? ""), input.dateRange.start, input.dateRange.end);
    if (dateStatus !== "inside") {
      skipReasonList.push(dateStatus === "outside" ? "outside_requested_date_range" : dateStatus === "missing" ? "missing_event_time" : "invalid_event_time");
      return;
    }
    try {
      const eventType = mappedType(String(entry.activityTypeClassifier?.finalType ?? entry.activityType ?? "unknown"));
      const extractedIssueKeys = uniqueInOrder(entry.extractedIssueKeysPerEntry ?? []);
      const issueKey = String(entry.issueKey ?? extractedIssueKeys[0] ?? "").trim();
      const allIssueKeys = extractedIssueKeys.length > 0 ? extractedIssueKeys : uniqueInOrder([issueKey]);
      const fingerprint = normalizeSha256Id(String(entry.entryFingerprint || sha256(JSON.stringify(entry))));
      const fingerprintMatched = baselineFingerprints.has(fingerprint);
      const eventTime = String(entry.activityTime);
      const eventId = normalizeSha256Id(sha256(["activity_stream", input.selectedUser, issueKey || "-", eventTime, eventType, fingerprint.replace(/^sha256:/, "")].join("|")));
      const event: UserActivityTimelineEvent = {
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
        sourceConfidence: eventConfidence(eventType, issueKey, input.baseline.classification, fingerprintMatched),
        projectKey: issueKey.includes("-") ? issueKey.split("-")[0] : "",
        evidence: { activityTypeClassifier: { matchedRule: String(entry.activityTypeClassifier?.matchedRule ?? "unknown"), finalType: eventType }, baselineGuard: { classification: input.baseline.classification, retryTriggered: input.baseline.retryTriggered, retryRecovered: input.baseline.retryRecovered, baselineBestParsedActivityCount: input.baseline.baselineBestParsedActivityCount, currentParsedActivityCount: input.baseline.currentParsedActivityCount, entryFingerprintMatched: fingerprintMatched } },
        rawRef: { entryFingerprint: fingerprint, variant: String(entry.variant ?? "escaped_username"), activityStreamQueryUser: input.activityStreamQueryUser },
        rawTitle: String(entry.rawTitle || entry.activityTitle || ""),
        sanitizedSummary: String(entry.rawSummary || entry.activityTitle || "")
      };
      const existing = eventsById.get(eventId);
      if (!existing) {
        eventsById.set(eventId, { event, entryIndex });
        return;
      }
      if (existing.event.rawRef.entryFingerprint !== fingerprint) eventIdCollisionCount += 1;
      const group = dedupGroups.get(eventId) ?? { eventId, keptEntryIndex: existing.entryIndex, deduplicatedEntryIndexes: [], reason: "same_event_id" as const, issueKeys: existing.event.allIssueKeys, eventTime: existing.event.eventTime };
      group.deduplicatedEntryIndexes.push(entryIndex);
      dedupGroups.set(eventId, group);
    } catch {
      skipReasonList.push("mapping_failed");
    }
  });

  const events = Array.from(eventsById.values()).map(({ event }) => event).sort((left, right) => right.eventTime.localeCompare(left.eventTime));
  const sourceIssueKeys = uniqueInOrder(input.sourceIssueKeys);
  const primaryIssueKeys = uniqueInOrder(events.map((event) => event.issueKey));
  const allIssueKeys = uniqueInOrder(events.flatMap((event) => event.allIssueKeys));
  const missingIssueKeysFromTimeline = sourceIssueKeys.filter((key) => !allIssueKeys.includes(key));
  const missingIssueKeysFromPrimaryTimeline = sourceIssueKeys.filter((key) => !primaryIssueKeys.includes(key));
  const deduplicatedEntryCount = Array.from(dedupGroups.values()).reduce((sum, group) => sum + group.deduplicatedEntryIndexes.length, 0);
  const skippedEntryCount = skipReasonList.length;
  const difference = input.sourceParsedActivityCount - events.length;
  const unexplainedDifferenceCount = Math.max(0, difference - deduplicatedEntryCount - skippedEntryCount);
  const warnings: string[] = [];
  if (missingIssueKeysFromTimeline.length > 0) warnings.push("WARNING: Some source parsed issue keys are missing from timeline allIssueKeys.");
  if (unexplainedDifferenceCount > 0) warnings.push("Timeline event count differs from source parsed activity count without skip/dedup explanation.");
  if (eventIdCollisionCount > 0) warnings.push("Timeline eventId collision detected.");
  const skipReasons = reasonCounts(skipReasonList);
  const dedupReasons = deduplicatedEntryCount > 0 ? [{ reason: "same_event_id", count: deduplicatedEntryCount }] : [];
  const integrity: TimelineIntegrityDiagnostics = { sourceParsedActivityCount: input.sourceParsedActivityCount, timelineEventCount: events.length, convertedEventCount: events.length, skippedEntryCount, deduplicatedEntryCount, sourceParsedIssueKeyCount: sourceIssueKeys.length, timelinePrimaryIssueKeyCount: primaryIssueKeys.length, timelineAllIssueKeyCount: allIssueKeys.length, sourceIssueKeys, timelinePrimaryIssueKeys: primaryIssueKeys, timelineAllIssueKeys: allIssueKeys, missingIssueKeysFromTimeline, missingIssueKeysFromPrimaryTimeline, eventIdCollisionCount, skipReasons, dedupReasons, warnings };
  const eventCountReconciliation: TimelineEventCountReconciliation = { sourceParsedActivityCount: input.sourceParsedActivityCount, timelineEventCount: events.length, difference, deduplicatedEntryCount, skippedEntryCount, unexplainedDifferenceCount, status: unexplainedDifferenceCount === 0 ? "reconciled" : "unreconciled" };
  const baselineMatchedCount = events.filter((event) => event.evidence.baselineGuard.entryFingerprintMatched).length;
  const confidenceDiagnostics: TimelineConfidenceDiagnostics = { runLevelClassification: input.baseline.classification, eventLevelBaselineMatchedCount: baselineMatchedCount, eventLevelBaselineMissingCount: events.length - baselineMatchedCount, forcedLowDueToRunIncompleteCount: events.filter((event) => input.baseline.classification === "result_incomplete_candidate" && !event.evidence.baselineGuard.entryFingerprintMatched && event.sourceConfidence === "low").length };
  const dedupDiagnostics: TimelineDedupDiagnostics = { enabled: true, deduplicatedEntryCount, dedupGroups: Array.from(dedupGroups.values()).slice(0, 20) };

  return { timelineRunId: input.timelineRunId, summary: { timelineRunId: input.timelineRunId, builtAt: input.builtAt, selectedUser: input.selectedUser, dateRange: input.dateRange, projectScope: input.projectScope, source: "activity_stream", sourceRunId: input.sourceRunId, totalEvents: events.length, issueKeyCount: allIssueKeys.length, primaryIssueKeyCount: primaryIssueKeys.length, allIssueKeyCount: allIssueKeys.length, eventTypeCounts: countBy(events.map((event) => event.eventType)), sourceCounts: countBy(events.map((event) => event.source)), confidenceCounts: countBy(events.map((event) => event.sourceConfidence)), baselineGuard: { classification: input.baseline.classification, retryTriggered: input.baseline.retryTriggered, retryRecovered: input.baseline.retryRecovered }, integrity, eventCountReconciliation, dedupDiagnostics, confidenceDiagnostics }, events };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function timelineCsv(events: UserActivityTimelineEvent[]) {
  const columns = ["eventTime", "userKey", "displayName", "issueKey", "allIssueKeys", "eventType", "eventTitle", "source", "sourceRunId", "sourceConfidence", "matchedRule", "entryFingerprint", "baselineClassification", "retryTriggered", "retryRecovered"];
  const rows = events.map((event) => [event.eventTime, event.userKey, event.displayName, event.issueKey, event.allIssueKeys.join(";"), event.eventType, event.eventTitle, event.source, event.sourceRunId, event.sourceConfidence, event.evidence.activityTypeClassifier.matchedRule, event.rawRef.entryFingerprint, event.evidence.baselineGuard.classification, event.evidence.baselineGuard.retryTriggered, event.evidence.baselineGuard.retryRecovered].map(csvCell).join(","));
  return `\uFEFF${columns.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export const timelineEventSchema = { schemaVersion: 2, required: ["eventId", "userKey", "displayName", "eventTime", "eventType", "source", "sourceRunId", "sourceConfidence", "evidence", "rawRef"], eventTypes: Array.from(eventTypes), confidenceValues: ["high", "medium", "low"] };
