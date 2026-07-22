import type { JiraRelationReason, TimelineSourceDetail, TimelineSourceSystem } from "./userActivityTimeline.js";

export type WorkflowStepStatus = {
  activityTimeline: "not_run" | "completed" | "failed";
  timelineIssueSelection: "not_run" | "completed";
  fetchQueue: "empty" | "ready" | "completed";
  fullFetch: "not_run" | "completed" | "failed";
  relatedIssues: "not_run" | "completed" | "empty";
  relatedDiscovery: "not_started" | "completed";
  relatedReview: "not_started" | "completed" | "skipped";
  relatedFullFetch: "not_started" | "running" | "completed" | "skipped";
  exports: "not_run" | "completed";
};

export type TimelineIssueGroup = {
  issueKey: string;
  projectKey: string;
  eventCount: number;
  activityTypes: string[];
  firstSeen: string;
  lastSeen: string;
  confidenceSummary: { high: number; medium: number; low: number };
  source: "activity_timeline";
  timelineEventIds: string[];
  selected: boolean;
  issueKeyRole: "primary" | "secondary" | "primary_and_secondary";
  sourceSystemSummary: Record<TimelineSourceSystem, number>;
  sourceDetails: Record<string, number>;
  isJiraRelated: boolean;
  hasJiraIssueKey: boolean;
  jiraRelationSummary: { jiraRelatedEventCount: number; nonJiraRelatedEventCount: number; hasJiraIssueKeyCount: number; sourceApplicationCounts: Record<TimelineSourceSystem, number>; relatedSystemsCounts: Record<string, number>; jiraRelationReasons: Record<string, number> };
};

export type FetchQueueSource = "activity_timeline" | "advanced_candidate_search" | "recommended_related_issue" | "optional_related_issue" | "manual";

export type FetchQueueMetadata = {
  sources: FetchQueueSource[];
  matchedReasons: string[];
  selectedUser: string;
  dateRange: { start: string; end: string };
  timelineEventIds: string[];
  activityTypes: string[];
  confidenceSummary: { high: number; medium: number; low: number };
  issueKeyRole: TimelineIssueGroup["issueKeyRole"] | "unknown";
  addedAt: string;
};

export type RelatedIssueRelationType =
  | "epic_child_parent"
  | "epic_link_parent"
  | "parent_link"
  | "issue_link_inward"
  | "issue_link_outward"
  | "remote_link"
  | "confluence_link"
  | "mentioned_issue_key"
  | "unknown_relation";

export type RelatedCandidateIssue = {
  issueKey: string;
  relationType: RelatedIssueRelationType;
  discoveredFromIssueKey: string;
  source: "related_issue_expansion";
  field: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  firstSeen: string;
  lastSeen: string;
  evidenceCount: number;
  selected: boolean;
  scope: "recommended" | "optional";
};

type TimelineEventLike = {
  eventId: string;
  issueKey: string;
  allIssueKeys: string[];
  eventTime: string;
  eventType: string;
  sourceConfidence: "high" | "medium" | "low";
  sourceSystem?: TimelineSourceSystem;
  sourceApplication?: TimelineSourceSystem;
  sourceDetail?: TimelineSourceDetail;
  hasJiraIssueKey?: boolean;
  isJiraRelated?: boolean;
  relatedSystems?: TimelineSourceSystem[];
  jiraRelationReason?: JiraRelationReason;
};

const issueKeyPattern = /\b[A-Z][A-Z0-9_]*-\d+\b/g;

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function extractIssueKey(value: unknown) {
  const source = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return unique((source.match(issueKeyPattern) ?? []).map((key) => key.toUpperCase()));
}

export function isRecommendedRelationType(relationType: string) {
  return ["epic_link_parent", "epic_child_parent", "parent_link", "parent_issue", "child_issue", "hierarchy_parent"].includes(relationType);
}

export function defaultWorkflowSteps(): WorkflowStepStatus {
  return {
    activityTimeline: "not_run",
    timelineIssueSelection: "not_run",
    fetchQueue: "empty",
    fullFetch: "not_run",
    relatedIssues: "not_run",
    relatedDiscovery: "not_started",
    relatedReview: "not_started",
    relatedFullFetch: "not_started",
    exports: "not_run"
  };
}

export function buildTimelineIssueGroups(events: TimelineEventLike[]): TimelineIssueGroup[] {
  const groups = new Map<string, TimelineIssueGroup & { primary: boolean; secondary: boolean }>();
  for (const event of events) {
    const primary = event.issueKey.toUpperCase();
    const keys = unique([primary, ...(event.allIssueKeys ?? []).map((key) => key.toUpperCase())].filter(Boolean));
    for (const issueKey of keys) {
      const current = groups.get(issueKey) ?? {
        issueKey,
        projectKey: issueKey.split("-")[0] ?? "",
        eventCount: 0,
        activityTypes: [],
        firstSeen: event.eventTime,
        lastSeen: event.eventTime,
        confidenceSummary: { high: 0, medium: 0, low: 0 },
        source: "activity_timeline" as const,
        timelineEventIds: [],
        selected: false,
        issueKeyRole: "secondary" as const,
        sourceSystemSummary: { jira: 0, confluence: 0, other: 0, unknown: 0 },
        sourceDetails: {},
        isJiraRelated: false,
        hasJiraIssueKey: false,
        jiraRelationSummary: { jiraRelatedEventCount: 0, nonJiraRelatedEventCount: 0, hasJiraIssueKeyCount: 0, sourceApplicationCounts: { jira: 0, confluence: 0, other: 0, unknown: 0 }, relatedSystemsCounts: {}, jiraRelationReasons: {} },
        primary: false,
        secondary: false
      };
      current.eventCount += 1;
      current.activityTypes = unique([...current.activityTypes, event.eventType]);
      current.timelineEventIds = unique([...current.timelineEventIds, event.eventId]);
      current.firstSeen = !current.firstSeen || event.eventTime < current.firstSeen ? event.eventTime : current.firstSeen;
      current.lastSeen = !current.lastSeen || event.eventTime > current.lastSeen ? event.eventTime : current.lastSeen;
      current.confidenceSummary[event.sourceConfidence] += 1;
      const sourceSystem = event.sourceSystem ?? "unknown";
      const sourceDetail = event.sourceDetail ?? "unknown";
      current.sourceSystemSummary[sourceSystem] += 1;
      current.sourceDetails[sourceDetail] = (current.sourceDetails[sourceDetail] ?? 0) + 1;
      const sourceApplication = event.sourceApplication ?? sourceSystem;
      current.isJiraRelated ||= event.isJiraRelated === true;
      current.hasJiraIssueKey ||= event.hasJiraIssueKey === true;
      if (event.isJiraRelated) current.jiraRelationSummary.jiraRelatedEventCount += 1;
      else current.jiraRelationSummary.nonJiraRelatedEventCount += 1;
      if (event.hasJiraIssueKey) current.jiraRelationSummary.hasJiraIssueKeyCount += 1;
      current.jiraRelationSummary.sourceApplicationCounts[sourceApplication] += 1;
      for (const system of event.relatedSystems ?? []) current.jiraRelationSummary.relatedSystemsCounts[system] = (current.jiraRelationSummary.relatedSystemsCounts[system] ?? 0) + 1;
      const relationReason = event.jiraRelationReason ?? "unknown";
      current.jiraRelationSummary.jiraRelationReasons[relationReason] = (current.jiraRelationSummary.jiraRelationReasons[relationReason] ?? 0) + 1;
      current.primary ||= issueKey === primary;
      current.secondary ||= issueKey !== primary;
      groups.set(issueKey, current);
    }
  }
  return Array.from(groups.values()).map(({ primary, secondary, ...group }): TimelineIssueGroup => ({
    ...group,
    issueKeyRole: primary && secondary ? "primary_and_secondary" : primary ? "primary" : "secondary"
  })).sort((a, b) => b.eventCount - a.eventCount || a.issueKey.localeCompare(b.issueKey));
}

export function mergeQueueMetadata(current: FetchQueueMetadata | undefined, incoming: Partial<FetchQueueMetadata> & { source: FetchQueueSource; matchedReason: string }): FetchQueueMetadata {
  return {
    sources: unique([...(current?.sources ?? []), incoming.source]),
    matchedReasons: unique([...(current?.matchedReasons ?? []), incoming.matchedReason]),
    selectedUser: incoming.selectedUser ?? current?.selectedUser ?? "",
    dateRange: incoming.dateRange ?? current?.dateRange ?? { start: "", end: "" },
    timelineEventIds: unique([...(current?.timelineEventIds ?? []), ...(incoming.timelineEventIds ?? [])]),
    activityTypes: unique([...(current?.activityTypes ?? []), ...(incoming.activityTypes ?? [])]),
    confidenceSummary: {
      high: Math.max(current?.confidenceSummary.high ?? 0, incoming.confidenceSummary?.high ?? 0),
      medium: Math.max(current?.confidenceSummary.medium ?? 0, incoming.confidenceSummary?.medium ?? 0),
      low: Math.max(current?.confidenceSummary.low ?? 0, incoming.confidenceSummary?.low ?? 0)
    },
    issueKeyRole: incoming.issueKeyRole ?? current?.issueKeyRole ?? "unknown",
    addedAt: current?.addedAt ?? incoming.addedAt ?? new Date().toISOString()
  };
}

function relationFor(field: string, direction: "inward" | "outward" | "none", value: unknown): { type: RelatedIssueRelationType; confidence: RelatedCandidateIssue["confidence"] } {
  const lowered = field.toLowerCase();
  const serialized = JSON.stringify(value ?? "").toLowerCase();
  if (lowered.includes("epic child")) return { type: "epic_child_parent", confidence: "high" };
  if (lowered.includes("epic link") || lowered === "epic") return { type: "epic_link_parent", confidence: "high" };
  if (lowered.includes("parent")) return { type: "parent_link", confidence: "high" };
  if (direction === "inward") return { type: "issue_link_inward", confidence: "high" };
  if (direction === "outward") return { type: "issue_link_outward", confidence: "high" };
  if (lowered.includes("remote") && /confluence|wiki/.test(serialized)) return { type: "confluence_link", confidence: "medium" };
  if (lowered.includes("remote")) return { type: "remote_link", confidence: "medium" };
  if (extractIssueKey(value).length > 0) return { type: "mentioned_issue_key", confidence: "low" };
  return { type: "unknown_relation", confidence: "low" };
}

export function extractRelatedIssues(input: { issueKey: string; issue: unknown; changelogHistories?: unknown[]; links?: unknown[]; remoteLinks?: unknown[]; observedAt?: string }): RelatedCandidateIssue[] {
  const sourceKey = input.issueKey.toUpperCase();
  const observedAt = input.observedAt ?? new Date().toISOString();
  const candidates: RelatedCandidateIssue[] = [];
  const add = (value: unknown, field: string, direction: "inward" | "outward" | "none" = "none") => {
    const relation = relationFor(field, direction, value);
    for (const issueKey of extractIssueKey(value)) {
      if (issueKey === sourceKey) continue;
      candidates.push({ issueKey, relationType: relation.type, discoveredFromIssueKey: sourceKey, source: "related_issue_expansion", field, reason: `${relation.type} discovered from ${sourceKey}`, confidence: relation.confidence, firstSeen: observedAt, lastSeen: observedAt, evidenceCount: 1, selected: false, scope: isRecommendedRelationType(relation.type) ? "recommended" : "optional" });
    }
  };

  const issue = record(input.issue);
  const fields = record(issue.fields);
  add(fields.parent, "parent");
  for (const [field, value] of Object.entries(fields)) {
    if (/epic|parent/i.test(field)) add(value, field);
  }
  for (const linkValue of Array.isArray(fields.issuelinks) ? fields.issuelinks : input.links ?? []) {
    const link = record(linkValue);
    if (link.inwardIssue) add(record(link.inwardIssue).key ?? link.inwardIssue, "issuelinks.inwardIssue", "inward");
    if (link.outwardIssue) add(record(link.outwardIssue).key ?? link.outwardIssue, "issuelinks.outwardIssue", "outward");
  }
  for (const remote of input.remoteLinks ?? []) add(remote, "remoteLinks");
  for (const historyValue of input.changelogHistories ?? []) {
    const history = record(historyValue);
    for (const itemValue of Array.isArray(history.items) ? history.items : []) {
      const item = record(itemValue);
      const field = text(item.field) || "changelog";
      if (/epic|parent|link/i.test(field)) add([item.fromString, item.toString], `changelog.${field}`);
    }
  }

  const merged = new Map<string, RelatedCandidateIssue>();
  for (const candidate of candidates) {
    const key = `${candidate.issueKey}|${candidate.relationType}|${candidate.discoveredFromIssueKey}`;
    const current = merged.get(key);
    merged.set(key, current ? { ...current, evidenceCount: current.evidenceCount + 1, lastSeen: candidate.lastSeen } : candidate);
  }
  return Array.from(merged.values()).sort((a, b) => a.issueKey.localeCompare(b.issueKey) || a.relationType.localeCompare(b.relationType));
}

export function relatedIssueSummary(items: RelatedCandidateIssue[]) {
  const relationTypeCounts: Record<string, number> = {};
  for (const item of items) relationTypeCounts[item.relationType] = (relationTypeCounts[item.relationType] ?? 0) + 1;
  return { relatedIssueCount: unique(items.map((item) => item.issueKey)).length, relationTypeCounts };
}

export function relatedIssueScopeSummary(items: RelatedCandidateIssue[], addedRecommendedToFetchQueueCount = 0, addedOptionalToFetchQueueCount = 0) {
  const summarize = (scope: RelatedCandidateIssue["scope"]) => {
    const scoped = items.filter((item) => (item.scope ?? (isRecommendedRelationType(item.relationType) ? "recommended" : "optional")) === scope);
    const relationTypeCounts: Record<string, number> = {};
    for (const item of scoped) relationTypeCounts[item.relationType] = (relationTypeCounts[item.relationType] ?? 0) + 1;
    return { entryCount: scoped.length, uniqueIssueCount: unique(scoped.map((item) => item.issueKey)).length, relationTypeCounts };
  };
  return {
    totalRelatedEntries: items.length,
    uniqueRelatedIssueCount: unique(items.map((item) => item.issueKey)).length,
    recommended: summarize("recommended"),
    optional: summarize("optional"),
    addedRecommendedToFetchQueueCount,
    addedOptionalToFetchQueueCount,
    addedRecommendedRelatedIssuesToFetchQueueCount: addedRecommendedToFetchQueueCount,
    addedOptionalRelatedIssuesToFetchQueueCount: addedOptionalToFetchQueueCount
  };
}
