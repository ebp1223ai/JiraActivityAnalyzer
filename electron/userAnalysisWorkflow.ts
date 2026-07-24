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

export type QueueTransitionRejection = {
  issueKey: string;
  reason: "INVALID_ISSUE_KEY" | "CANDIDATE_GROUP_NOT_FOUND" | "UNVERIFIED_JIRA_PROVENANCE";
};

export type QueueCandidateLike = {
  key: string;
  matchedReason: string;
  queueMetadata?: FetchQueueMetadata;
};

export type TimelineQueueTransitionResult<T extends QueueCandidateLike> = {
  ok: boolean;
  error: string;
  candidateIssues: T[];
  selectedForFetch: string[];
  acceptedIssueKeys: string[];
  rejections: QueueTransitionRejection[];
  selectedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  deduplicatedCount: number;
  addedCount: number;
  mergedCount: number;
  queueCountBefore: number;
  queueCountAfter: number;
};

export type IssueKeySetReconciliation = {
  schemaVersion: "selection_fetch_queue_reconciliation_v1";
  status: "MATCH" | "MISMATCH";
  sets: {
    selected: { count: number; issueKeys: string[] };
    fetchQueue: { count: number; issueKeys: string[] };
    attempted: { count: number; issueKeys: string[] };
    completed: { count: number; issueKeys: string[] };
    partial: { count: number; issueKeys: string[] };
    failed: { count: number; issueKeys: string[] };
  };
  differences: {
    missingFromQueue: string[];
    unexpectedInQueue: string[];
    missingFromAttempted: string[];
    unexpectedInAttempted: string[];
    missingOutcome: string[];
    unexpectedOutcome: string[];
    duplicateOutcomeKeys: string[];
    multiOutcomeKeys: string[];
  };
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

function unique<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? unique(value.map(text).filter(Boolean)) : [];
}

function finiteCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
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
    const keys = primary ? [primary] : [];
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

export function normalizeFetchQueueMetadata(value: unknown): FetchQueueMetadata {
  const input = record(value);
  const dateRange = record(input.dateRange);
  const confidence = record(input.confidenceSummary);
  const sources = stringArray(input.sources).filter((source): source is FetchQueueSource =>
    ["activity_timeline", "advanced_candidate_search", "recommended_related_issue", "optional_related_issue", "manual"].includes(source)
  );
  const issueKeyRole = text(input.issueKeyRole);
  return {
    sources,
    matchedReasons: stringArray(input.matchedReasons),
    selectedUser: text(input.selectedUser),
    dateRange: { start: text(dateRange.start), end: text(dateRange.end) },
    timelineEventIds: stringArray(input.timelineEventIds),
    activityTypes: stringArray(input.activityTypes),
    confidenceSummary: {
      high: finiteCount(confidence.high),
      medium: finiteCount(confidence.medium),
      low: finiteCount(confidence.low)
    },
    issueKeyRole: ["primary", "secondary", "primary_and_secondary"].includes(issueKeyRole)
      ? issueKeyRole as TimelineIssueGroup["issueKeyRole"]
      : "unknown",
    addedAt: text(input.addedAt)
  };
}

export function mergeQueueMetadata(current: FetchQueueMetadata | Partial<FetchQueueMetadata> | null | undefined, incoming: Partial<FetchQueueMetadata> & { source: FetchQueueSource; matchedReason: string }): FetchQueueMetadata {
  const normalized = normalizeFetchQueueMetadata(current);
  const incomingNormalized = normalizeFetchQueueMetadata(incoming);
  return {
    sources: unique([...normalized.sources, incoming.source]),
    matchedReasons: unique([...normalized.matchedReasons, incoming.matchedReason]),
    selectedUser: incomingNormalized.selectedUser || normalized.selectedUser,
    dateRange: incomingNormalized.dateRange.start || incomingNormalized.dateRange.end ? incomingNormalized.dateRange : normalized.dateRange,
    timelineEventIds: unique([...normalized.timelineEventIds, ...incomingNormalized.timelineEventIds]),
    activityTypes: unique([...normalized.activityTypes, ...incomingNormalized.activityTypes]),
    confidenceSummary: {
      high: Math.max(normalized.confidenceSummary.high, incomingNormalized.confidenceSummary.high),
      medium: Math.max(normalized.confidenceSummary.medium, incomingNormalized.confidenceSummary.medium),
      low: Math.max(normalized.confidenceSummary.low, incomingNormalized.confidenceSummary.low)
    },
    issueKeyRole: incomingNormalized.issueKeyRole !== "unknown" ? incomingNormalized.issueKeyRole : normalized.issueKeyRole,
    addedAt: normalized.addedAt || incomingNormalized.addedAt || new Date().toISOString()
  };
}

const exactIssueKeyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;

export function normalizeIssueKey(value: unknown) {
  const issueKey = text(value).trim().toUpperCase();
  return exactIssueKeyPattern.test(issueKey) ? issueKey : "";
}

export function buildTimelineQueueTransition<T extends QueueCandidateLike>(input: {
  groups: readonly unknown[];
  selectedIssueKeys: readonly string[];
  candidateIssues: readonly T[];
  selectedForFetch: readonly string[];
  selectedUser: string;
  dateRange: { start: string; end: string };
  addedAt?: string;
  createCandidate: (issueKey: string, metadata: FetchQueueMetadata) => T;
}): TimelineQueueTransitionResult<T> {
  const selectedRaw = input.selectedIssueKeys.map((key) => text(key).trim().toUpperCase()).filter(Boolean);
  const selectedKeys = unique(selectedRaw);
  const groupByKey = new Map<string, Record<string, unknown>>();
  let duplicateGroups = 0;
  for (const value of input.groups) {
    const group = record(value);
    const issueKey = text(group.issueKey).trim().toUpperCase();
    if (!issueKey || !selectedKeys.includes(issueKey)) continue;
    if (groupByKey.has(issueKey)) duplicateGroups += 1;
    else groupByKey.set(issueKey, group);
  }

  const existing = new Map<string, T>();
  let duplicateExisting = 0;
  for (const candidate of input.candidateIssues) {
    const issueKey = text(candidate.key).trim().toUpperCase();
    if (!issueKey) continue;
    const normalized = {
      ...candidate,
      key: issueKey,
      queueMetadata: normalizeFetchQueueMetadata(candidate.queueMetadata)
    };
    if (existing.has(issueKey)) duplicateExisting += 1;
    else existing.set(issueKey, normalized);
  }

  const acceptedIssueKeys: string[] = [];
  const rejections: QueueTransitionRejection[] = [];
  let addedCount = 0;
  let mergedCount = 0;
  const addedAt = input.addedAt ?? new Date().toISOString();

  for (const issueKey of selectedKeys) {
    if (!exactIssueKeyPattern.test(issueKey)) {
      rejections.push({ issueKey, reason: "INVALID_ISSUE_KEY" });
      continue;
    }
    const group = groupByKey.get(issueKey);
    if (!group) {
      rejections.push({ issueKey, reason: "CANDIDATE_GROUP_NOT_FOUND" });
      continue;
    }
    if (group.isJiraRelated !== true || group.hasJiraIssueKey !== true) {
      rejections.push({ issueKey, reason: "UNVERIFIED_JIRA_PROVENANCE" });
      continue;
    }

    const current = existing.get(issueKey);
    const metadata = mergeQueueMetadata(current?.queueMetadata, {
      source: "activity_timeline",
      matchedReason: "selected_from_activity_timeline",
      selectedUser: input.selectedUser,
      dateRange: input.dateRange,
      timelineEventIds: stringArray(group.timelineEventIds),
      activityTypes: stringArray(group.activityTypes),
      confidenceSummary: normalizeFetchQueueMetadata({ confidenceSummary: group.confidenceSummary }).confidenceSummary,
      issueKeyRole: normalizeFetchQueueMetadata({ issueKeyRole: group.issueKeyRole }).issueKeyRole,
      addedAt
    });
    if (current) {
      existing.set(issueKey, { ...current, matchedReason: metadata.matchedReasons.join(", "), queueMetadata: metadata });
      mergedCount += 1;
    } else {
      existing.set(issueKey, input.createCandidate(issueKey, metadata));
      addedCount += 1;
    }
    acceptedIssueKeys.push(issueKey);
  }

  // A Step 2 confirmation starts a new queue. Candidate records may be reused for
  // metadata, but keys from a previous queue are never carried into this run.
  const selectedForFetch = [...acceptedIssueKeys];
  const candidateIssues = Array.from(existing.values());
  const ok = selectedKeys.length > 0 && acceptedIssueKeys.length > 0;
  return {
    ok,
    error: selectedKeys.length === 0
      ? "No Candidate Issue Groups were selected."
      : acceptedIssueKeys.length === 0
        ? "No selected Candidate Issue Group passed Jira provenance validation."
        : "",
    candidateIssues,
    selectedForFetch,
    acceptedIssueKeys,
    rejections,
    selectedCount: selectedKeys.length,
    acceptedCount: acceptedIssueKeys.length,
    rejectedCount: rejections.length,
    deduplicatedCount: selectedRaw.length - selectedKeys.length + duplicateGroups + duplicateExisting,
    addedCount,
    mergedCount,
    queueCountBefore: unique(input.selectedForFetch).length,
    queueCountAfter: selectedForFetch.length
  };
}

function normalizedIssueKeys(values: readonly unknown[]) {
  const issueKeys: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const issueKey = normalizeIssueKey(value);
    if (!issueKey) continue;
    if (seen.has(issueKey)) duplicates.add(issueKey);
    else {
      seen.add(issueKey);
      issueKeys.push(issueKey);
    }
  }
  return { issueKeys, duplicates: Array.from(duplicates) };
}

function difference(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right);
  return left.filter((issueKey) => !rightSet.has(issueKey));
}

export function reconcileIssueKeySets(input: {
  selectedIssueKeys: readonly unknown[];
  fetchQueueIssueKeys: readonly unknown[];
  attemptedIssueKeys: readonly unknown[];
  completedIssueKeys: readonly unknown[];
  partialIssueKeys: readonly unknown[];
  failedIssueKeys: readonly unknown[];
}): IssueKeySetReconciliation {
  const selected = normalizedIssueKeys(input.selectedIssueKeys);
  const fetchQueue = normalizedIssueKeys(input.fetchQueueIssueKeys);
  const attempted = normalizedIssueKeys(input.attemptedIssueKeys);
  const completed = normalizedIssueKeys(input.completedIssueKeys);
  const partial = normalizedIssueKeys(input.partialIssueKeys);
  const failed = normalizedIssueKeys(input.failedIssueKeys);
  const outcomeUnion = unique([...completed.issueKeys, ...partial.issueKeys, ...failed.issueKeys]);
  const outcomeMembership = new Map<string, number>();
  for (const issueKey of [...completed.issueKeys, ...partial.issueKeys, ...failed.issueKeys]) {
    outcomeMembership.set(issueKey, (outcomeMembership.get(issueKey) ?? 0) + 1);
  }
  const differences = {
    missingFromQueue: difference(selected.issueKeys, fetchQueue.issueKeys),
    unexpectedInQueue: difference(fetchQueue.issueKeys, selected.issueKeys),
    missingFromAttempted: difference(fetchQueue.issueKeys, attempted.issueKeys),
    unexpectedInAttempted: difference(attempted.issueKeys, fetchQueue.issueKeys),
    missingOutcome: difference(attempted.issueKeys, outcomeUnion),
    unexpectedOutcome: difference(outcomeUnion, attempted.issueKeys),
    duplicateOutcomeKeys: unique([...completed.duplicates, ...partial.duplicates, ...failed.duplicates]),
    multiOutcomeKeys: Array.from(outcomeMembership.entries()).filter(([, count]) => count > 1).map(([issueKey]) => issueKey)
  };
  const status = Object.values(differences).every((values) => values.length === 0) ? "MATCH" : "MISMATCH";
  return {
    schemaVersion: "selection_fetch_queue_reconciliation_v1",
    status,
    sets: {
      selected: { count: selected.issueKeys.length, issueKeys: selected.issueKeys },
      fetchQueue: { count: fetchQueue.issueKeys.length, issueKeys: fetchQueue.issueKeys },
      attempted: { count: attempted.issueKeys.length, issueKeys: attempted.issueKeys },
      completed: { count: completed.issueKeys.length, issueKeys: completed.issueKeys },
      partial: { count: partial.issueKeys.length, issueKeys: partial.issueKeys },
      failed: { count: failed.issueKeys.length, issueKeys: failed.issueKeys }
    },
    differences
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
