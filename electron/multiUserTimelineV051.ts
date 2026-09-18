import { buildUserActivityTimeline, type UserActivityTimelineBuild, type UserActivityTimelineEvent } from './userActivityTimeline.js';
import { mergeCollectionEventsV051 } from '../shared/multiUserCollectionV051.js';
import type { ActivityTimelineRunContext } from './activityTimelineRunContext.js';

type Part = { userId: string; timeline: UserActivityTimelineBuild; stableIds: Map<string, string> };
export function combineUserTimelinesV051(context: ActivityTimelineRunContext, parts: Part[]) {
  const merged = mergeCollectionEventsV051(parts.map(part => ({
    userId: part.userId, events: part.timeline.events,
    // The existing round-first pipeline supplies identity; no title/time-only heuristic.
    identity: (event: UserActivityTimelineEvent) => part.stableIds.get(event.rawRef.entryFingerprint.replace(/^sha256:/, '')) ?? event.eventId
  })));
  const events = merged.events.sort((a, b) => b.eventTime.localeCompare(a.eventTime));
  const empty = buildUserActivityTimeline({ timelineRunId: context.runId, builtAt: new Date().toISOString(),
    selectedUser: context.selectedUser, dateRange: { start: context.effectiveStartDate, end: context.effectiveEndDate },
    projectScope: '', sourceRunId: context.runId, sourceParsedActivityCount: 0, sourceIssueKeys: [],
    activityStreamQueryUser: '', entries: [], baseline: { classification: 'stability_probe_merged', retryTriggered: false,
      retryRecovered: false, baselineBestParsedActivityCount: 0, currentParsedActivityCount: 0, knownEntryFingerprints: [] } });
  const summary = empty.summary;
  const unique = (values: string[]) => [...new Set(values.map(value => value.trim().toUpperCase()).filter(Boolean))].sort();
  const counts = (values: string[]) => { const result: Record<string, number> = {}; for (const value of values) result[value] = (result[value] ?? 0) + 1; return result; };
  const primary = unique(events.map(event => event.issueKey));
  const all = unique(events.flatMap(event => event.allIssueKeys));
  const sourceKeys = unique(parts.flatMap(part => part.timeline.summary.integrity.sourceIssueKeys));
  const sourceCount = parts.reduce((n, part) => n + part.timeline.summary.integrity.sourceParsedActivityCount, 0);
  const skipped = parts.reduce((n, part) => n + part.timeline.summary.integrity.skippedEntryCount, 0);
  const dedup = parts.reduce((n, part) => n + part.timeline.summary.integrity.deduplicatedEntryCount, merged.duplicateDiscoveryCount);
  const unexplained = parts.reduce((n, part) => n + part.timeline.summary.eventCountReconciliation.unexplainedDifferenceCount, 0);
  summary.totalEvents = events.length;
  summary.issueKeyCount = summary.allIssueKeyCount = all.length;
  summary.primaryIssueKeyCount = primary.length;
  summary.eventTypeCounts = counts(events.map(event => event.eventType));
  summary.sourceCounts = counts(events.map(event => event.source));
  summary.sourceDetailCounts = counts(events.map(event => event.sourceDetail));
  summary.confidenceCounts = counts(events.map(event => event.sourceConfidence));
  for (const event of events) {
    summary.sourceSystemCounts[event.sourceSystem]++;
    summary.sourceApplicationCounts[event.sourceApplication]++;
    summary.jiraRelationCounts[event.isJiraRelated ? 'jiraRelated' : 'nonJiraRelated']++;
    if (event.hasJiraIssueKey) summary.jiraRelationCounts.hasJiraIssueKey++;
    if (event.jiraRelationReason === 'unknown') summary.jiraRelationCounts.unknownRelation++;
    if (event.jiraRelationReason === 'confluence_link_to_jira_issue') summary.confluenceLinkedToJiraCount++;
    if (event.evidence.baselineGuard.entryFingerprintMatched) summary.confidenceDiagnostics.eventLevelBaselineMatchedCount++;
  }
  summary.confidenceDiagnostics.eventLevelBaselineMissingCount = events.length - summary.confidenceDiagnostics.eventLevelBaselineMatchedCount;
  summary.sourceSystemDiagnostics.unknownSamples = parts.flatMap(part => part.timeline.summary.sourceSystemDiagnostics.unknownSamples).slice(0, 20);
  summary.jiraRelationDiagnostics.confluenceLinkedToJiraIssueGroups = unique(events.filter(event => event.jiraRelationReason === 'confluence_link_to_jira_issue').flatMap(event => event.allIssueKeys));
  summary.integrity = { ...summary.integrity, sourceParsedActivityCount: sourceCount, timelineEventCount: events.length,
    convertedEventCount: events.length, skippedEntryCount: skipped, deduplicatedEntryCount: dedup,
    sourceParsedIssueKeyCount: sourceKeys.length, timelinePrimaryIssueKeyCount: primary.length, timelineAllIssueKeyCount: all.length,
    sourceIssueKeys: sourceKeys, timelinePrimaryIssueKeys: primary, timelineAllIssueKeys: all,
    missingIssueKeysFromTimeline: sourceKeys.filter(key => !all.includes(key)),
    missingIssueKeysFromPrimaryTimeline: sourceKeys.filter(key => !primary.includes(key)),
    eventIdCollisionCount: parts.reduce((n, part) => n + part.timeline.summary.integrity.eventIdCollisionCount, 0),
    skipReasons: parts.flatMap(part => part.timeline.summary.integrity.skipReasons),
    dedupReasons: [...parts.flatMap(part => part.timeline.summary.integrity.dedupReasons), { reason: 'same_stable_event_across_users', count: merged.duplicateDiscoveryCount }],
    warnings: [...new Set(parts.flatMap(part => part.timeline.summary.integrity.warnings))] };
  summary.eventCountReconciliation = { sourceParsedActivityCount: sourceCount, timelineEventCount: events.length,
    difference: sourceCount - events.length, deduplicatedEntryCount: dedup, skippedEntryCount: skipped,
    unexplainedDifferenceCount: unexplained, status: unexplained === 0 && sourceCount - events.length === skipped + dedup ? 'reconciled' : 'unreconciled' };
  summary.dedupDiagnostics = { enabled: true, deduplicatedEntryCount: dedup, dedupGroups: parts.flatMap(part => part.timeline.summary.dedupDiagnostics.dedupGroups).slice(0, 20) };
  return { timelineRunId: context.runId, events, summary, discoveredBy: merged.discoveredBy, duplicateDiscoveryCount: merged.duplicateDiscoveryCount };
}
