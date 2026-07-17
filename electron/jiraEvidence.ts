import crypto from "node:crypto";

export type JiraEvidenceScope = "direct" | "context" | "related_context" | "excluded";
export type JiraEvidenceType = "jira_comment" | "jira_changelog" | "jira_attachment_metadata" | "jira_issue_link" | "jira_issue_link_context" | "jira_remote_link" | "jira_remote_link_context" | "jira_issue_snapshot_context";
export type JiraEvidenceActivityType = "comment" | "field_change" | "status_change" | "assignee_change" | "resolution_change" | "priority_change" | "labels_change" | "epic_link_change" | "parent_link_change" | "attachment" | "issue_link" | "remote_link" | "issue_snapshot" | "unknown";

export type JiraEvidenceEvent = {
  evidenceId: string;
  schemaVersion: "jira_evidence_event_v1";
  system: "jira";
  evidenceScope: JiraEvidenceScope;
  evidenceType: JiraEvidenceType;
  activityType: JiraEvidenceActivityType;
  issueKey: string;
  projectKey: string;
  selectedUser: string;
  actor: string;
  eventTime: string;
  withinSelectedDateRange: boolean;
  source: "jira_full_fetch";
  sourceIssueKey: string;
  sourceLayer: "direct_activity_issue" | "evidence_related_issue";
  relatedToTimelineEventIds: string[];
  field: string;
  fromValue: string;
  toValue: string;
  title: string;
  contentSummary: string;
  rawTextPreview: string;
  confidence: "high" | "medium" | "low";
  extractionReason: string;
  rawRef: Record<string, unknown>;
};

export type JiraEvidenceExcludedSummary = {
  schemaVersion: "jira_evidence_excluded_summary_v1";
  excludedCount: number;
  byReason: Record<string, number>;
};

export type JiraEvidenceSummary = {
  schemaVersion: "jira_evidence_summary_v1";
  selectedUser: string;
  dateRange: { start: string; end: string };
  directIssueCount: number;
  fullFetchedIssueCount: number;
  failedIssueCount: number;
  directEvidenceCount: number;
  contextEvidenceCount: number;
  relatedContextEvidenceCount: number;
  excludedEvidenceCount: number;
  byEvidenceType: Record<string, number>;
  byActivityType: Record<string, number>;
  byIssueKey: Record<string, { directEvidenceCount: number; contextEvidenceCount: number; activityTypes: string[] }>;
  coverage: { issuesWithEvidence: number; issuesWithoutDirectEvidence: number; failedIssues: string[] };
  relatedIssueExpansionPolicy: { recursive: false; maxDepth: 1; relatedIssuesAsPrimaryEvidence: false };
};

export type JiraEvidenceIssueInput = {
  selectedUser: string;
  startDate: string;
  endDate: string;
  issueKey: string;
  directActivityIssue: boolean;
  relatedTimelineEventIds: string[];
  issue: Record<string, unknown>;
  changelogHistories: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
  links: Record<string, unknown>[];
  remoteLinks: Record<string, unknown>[];
};

export const jiraEvidenceSchema = {
  schemaVersion: "jira_evidence_event_v1",
  system: "jira",
  evidenceScopes: ["direct", "context", "related_context", "excluded"],
  evidenceTypes: ["jira_comment", "jira_changelog", "jira_attachment_metadata", "jira_issue_link", "jira_issue_link_context", "jira_remote_link", "jira_remote_link_context", "jira_issue_snapshot_context"],
  activityTypes: ["comment", "field_change", "status_change", "assignee_change", "resolution_change", "priority_change", "labels_change", "epic_link_change", "parent_link_change", "attachment", "issue_link", "remote_link", "issue_snapshot", "unknown"],
  evidenceIdFingerprint: "sha256(system + evidenceType + issueKey + actor + eventTime + canonical rawRef)",
  attachmentPolicy: "metadata_only_no_file_download",
  directEvidenceRule: "selected user and selected date range must match",
  relatedIssuePolicy: { recursive: false, maxDepth: 1, relatedIssuesAsPrimaryEvidence: false }
} as const;

export const analysisRoadmap = {
  analyzers: { cloudAiAnalyzer: "planned", localAiAnalyzer: "planned", offlineRuleAnalyzer: "planned" },
  dataSources: { liveApi: "current", localDatabase: "planned", hybrid: "planned" },
  productGoals: ["jira_activity_analysis", "confluence_activity_analysis", "jira_confluence_combined_analysis"]
} as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  const item = record(value);
  return String(item.displayName ?? item.name ?? item.key ?? item.accountId ?? item.emailAddress ?? item.value ?? "");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function preview(value: unknown, maxLength = 360): string {
  const plain = typeof value === "string" ? value : value === null || value === undefined ? "" : JSON.stringify(value);
  return plain
    .replace(/(authorization|token|password|cookie|session)\s*[:=]\s*[^\s,;]+/gi, "$1: [masked]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function identities(value: unknown): string[] {
  const item = record(value);
  return Array.from(new Set([valueText(value), valueText(item.accountId), valueText(item.name), valueText(item.key), valueText(item.emailAddress), valueText(item.displayName)]
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)));
}

function actorMatches(value: unknown, selectedUser: string): boolean {
  const selected = selectedUser.trim().toLowerCase();
  return Boolean(selected) && identities(value).includes(selected);
}

function dateMatches(value: unknown, startDate: string, endDate: string): boolean {
  const timestamp = Date.parse(valueText(value));
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const endExclusive = Date.parse(`${endDate}T00:00:00.000Z`) + 86400000;
  return Number.isFinite(timestamp) && Number.isFinite(start) && Number.isFinite(endExclusive) && timestamp >= start && timestamp < endExclusive;
}

function exclusionReason(actor: unknown, time: unknown, selectedUser: string, startDate: string, endDate: string): string {
  if (identities(actor).length === 0) return "missing_actor";
  if (!valueText(time)) return "missing_time";
  if (!actorMatches(actor, selectedUser)) return "actor_not_selected_user";
  if (!dateMatches(time, startDate, endDate)) return "outside_date_range";
  return "not_direct_evidence";
}

function activityTypeForField(fieldValue: unknown): JiraEvidenceActivityType {
  const field = valueText(fieldValue).trim().toLowerCase().replace(/[\s_-]+/g, "_");
  if (field === "status") return "status_change";
  if (field === "assignee") return "assignee_change";
  if (field === "resolution") return "resolution_change";
  if (field === "priority") return "priority_change";
  if (field === "labels" || field === "label") return "labels_change";
  if (field.includes("epic")) return "epic_link_change";
  if (field.includes("parent")) return "parent_link_change";
  return field ? "field_change" : "unknown";
}

function evidenceId(type: JiraEvidenceType, issueKey: string, actor: string, eventTime: string, rawRef: Record<string, unknown>): string {
  return `sha256:${crypto.createHash("sha256").update(["jira", type, issueKey, actor, eventTime, canonical(rawRef)].join("|")).digest("hex")}`;
}

function event(input: JiraEvidenceIssueInput, values: Omit<JiraEvidenceEvent, "evidenceId" | "schemaVersion" | "system" | "issueKey" | "projectKey" | "selectedUser" | "source" | "sourceIssueKey" | "sourceLayer" | "relatedToTimelineEventIds">): JiraEvidenceEvent {
  const issueKey = input.issueKey.toUpperCase();
  return {
    evidenceId: evidenceId(values.evidenceType, issueKey, values.actor, values.eventTime, values.rawRef),
    schemaVersion: "jira_evidence_event_v1",
    system: "jira",
    issueKey,
    projectKey: issueKey.split("-")[0] ?? "",
    selectedUser: input.selectedUser,
    source: "jira_full_fetch",
    sourceIssueKey: issueKey,
    sourceLayer: input.directActivityIssue ? "direct_activity_issue" : "evidence_related_issue",
    relatedToTimelineEventIds: [...input.relatedTimelineEventIds].sort(),
    ...values
  };
}

function countReason(target: Record<string, number>, reason: string) {
  target[reason] = (target[reason] ?? 0) + 1;
}

export function extractJiraEvidenceFromIssue(input: JiraEvidenceIssueInput): { events: JiraEvidenceEvent[]; excluded: JiraEvidenceExcludedSummary } {
  const events: JiraEvidenceEvent[] = [];
  const byReason: Record<string, number> = {};
  const directScope: JiraEvidenceScope = input.directActivityIssue ? "direct" : "related_context";
  const contextScope: JiraEvidenceScope = input.directActivityIssue ? "context" : "related_context";

  input.comments.forEach((comment, index) => {
    const authorMatches = actorMatches(comment.author, input.selectedUser) && dateMatches(comment.created, input.startDate, input.endDate);
    const updateMatches = actorMatches(comment.updateAuthor, input.selectedUser) && dateMatches(comment.updated, input.startDate, input.endDate);
    if (!input.directActivityIssue || (!authorMatches && !updateMatches)) {
      if (input.directActivityIssue) countReason(byReason, exclusionReason(comment.author ?? comment.updateAuthor, comment.created ?? comment.updated, input.selectedUser, input.startDate, input.endDate));
      return;
    }
    const actorSource = authorMatches ? comment.author : comment.updateAuthor;
    const eventTime = valueText(authorMatches ? comment.created : comment.updated);
    const rawRef = { type: "comment", commentId: valueText(comment.id), index };
    events.push(event(input, { evidenceScope: directScope, evidenceType: "jira_comment", activityType: "comment", actor: valueText(actorSource), eventTime, withinSelectedDateRange: true, field: "comment", fromValue: "", toValue: "", title: "Added or updated Jira comment", contentSummary: preview(comment.body), rawTextPreview: preview(comment.body), confidence: "high", extractionReason: "comment author/updateAuthor and created/updated time match selected user/date range", rawRef }));
  });

  input.changelogHistories.forEach((history, historyIndex) => {
    const items = Array.isArray(history.items) ? history.items.map(record) : [];
    if (!input.directActivityIssue || !actorMatches(history.author, input.selectedUser) || !dateMatches(history.created, input.startDate, input.endDate)) {
      if (input.directActivityIssue) for (let index = 0; index < Math.max(items.length, 1); index += 1) countReason(byReason, exclusionReason(history.author, history.created, input.selectedUser, input.startDate, input.endDate));
      return;
    }
    items.forEach((item, itemIndex) => {
      const field = valueText(item.field ?? item.fieldId);
      const fromValue = valueText(item.fromString ?? item.from);
      const toValue = valueText(item.toString ?? item.to);
      const rawRef = { type: "changelog", historyId: valueText(history.id), historyIndex, itemIndex };
      events.push(event(input, { evidenceScope: directScope, evidenceType: "jira_changelog", activityType: activityTypeForField(field), actor: valueText(history.author), eventTime: valueText(history.created), withinSelectedDateRange: true, field, fromValue, toValue, title: `Changed ${field || "field"} from ${fromValue || "(empty)"} to ${toValue || "(empty)"}`, contentSummary: `${field}: ${fromValue} -> ${toValue}`, rawTextPreview: preview(item), confidence: "high", extractionReason: "changelog author and created time match selected user/date range", rawRef }));
    });
  });

  input.attachments.forEach((attachment, index) => {
    if (!input.directActivityIssue || !actorMatches(attachment.author, input.selectedUser) || !dateMatches(attachment.created, input.startDate, input.endDate)) {
      if (input.directActivityIssue) countReason(byReason, exclusionReason(attachment.author, attachment.created, input.selectedUser, input.startDate, input.endDate));
      return;
    }
    const fileName = valueText(attachment.filename);
    const rawRef = { type: "attachment_metadata", attachmentId: valueText(attachment.id), index };
    events.push(event(input, { evidenceScope: directScope, evidenceType: "jira_attachment_metadata", activityType: "attachment", actor: valueText(attachment.author), eventTime: valueText(attachment.created), withinSelectedDateRange: true, field: "attachment", fromValue: "", toValue: fileName, title: `Added attachment metadata: ${fileName || "unnamed file"}`, contentSummary: `filename=${fileName}; size=${valueText(attachment.size)}; mimeType=${valueText(attachment.mimeType)}`, rawTextPreview: preview({ filename: fileName, size: attachment.size, mimeType: attachment.mimeType }), confidence: "high", extractionReason: "attachment author and created time match selected user/date range; metadata only", rawRef }));
  });

  const extractLink = (link: Record<string, unknown>, index: number, remote: boolean) => {
    const author = link.author ?? link.applicationUser ?? link.user;
    const time = link.created ?? link.updated;
    const hasAttribution = identities(author).length > 0 && Boolean(valueText(time));
    const matches = hasAttribution && actorMatches(author, input.selectedUser) && dateMatches(time, input.startDate, input.endDate);
    if (hasAttribution && !matches && input.directActivityIssue) {
      countReason(byReason, exclusionReason(author, time, input.selectedUser, input.startDate, input.endDate));
      return;
    }
    const evidenceType: JiraEvidenceType = remote ? (matches ? "jira_remote_link" : "jira_remote_link_context") : (matches ? "jira_issue_link" : "jira_issue_link_context");
    const rawRef = { type: remote ? "remote_link" : "issue_link", linkId: valueText(link.id), index };
    events.push(event(input, { evidenceScope: matches && input.directActivityIssue ? directScope : contextScope, evidenceType, activityType: remote ? "remote_link" : "issue_link", actor: matches ? valueText(author) : "", eventTime: matches ? valueText(time) : "", withinSelectedDateRange: matches, field: remote ? "remote_link" : "issue_link", fromValue: "", toValue: valueText(record(link.outwardIssue).key ?? record(link.inwardIssue).key ?? link.object), title: remote ? "Remote link context" : "Issue link context", contentSummary: preview(link), rawTextPreview: preview(link), confidence: matches ? "high" : "medium", extractionReason: matches ? "link author and time match selected user/date range" : "link has no attributable author/time and is retained as context only", rawRef }));
  };
  input.links.forEach((link, index) => extractLink(link, index, false));
  input.remoteLinks.forEach((link, index) => extractLink(link, index, true));

  const fields = record(input.issue.fields);
  const snapshot = { summary: fields.summary, description: fields.description, status: record(fields.status).name, assignee: fields.assignee, reporter: fields.reporter, creator: fields.creator };
  const snapshotTime = valueText(fields.updated ?? fields.created);
  const snapshotRef = { type: "issue_snapshot", issueId: valueText(input.issue.id) };
  events.push(event(input, { evidenceScope: contextScope, evidenceType: "jira_issue_snapshot_context", activityType: "issue_snapshot", actor: "", eventTime: snapshotTime, withinSelectedDateRange: dateMatches(snapshotTime, input.startDate, input.endDate), field: "issue_fields_snapshot", fromValue: "", toValue: "", title: `Issue snapshot: ${valueText(fields.summary) || input.issueKey}`, contentSummary: preview(snapshot), rawTextPreview: preview(snapshot), confidence: "medium", extractionReason: input.directActivityIssue ? "issue fields snapshot is analysis context, not direct user activity" : "related issue snapshot is related context and not primary evidence", rawRef: snapshotRef }));

  return { events, excluded: { schemaVersion: "jira_evidence_excluded_summary_v1", excludedCount: Object.values(byReason).reduce((sum, count) => sum + count, 0), byReason } };
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

export function summarizeJiraEvidence(input: { selectedUser: string; startDate: string; endDate: string; directIssueKeys: string[]; fullFetchedIssueKeys: string[]; failedIssueKeys: string[]; events: JiraEvidenceEvent[]; excluded: JiraEvidenceExcludedSummary }): JiraEvidenceSummary {
  const directKeys = Array.from(new Set(input.directIssueKeys.map((key) => key.toUpperCase()))).sort();
  const byEvidenceType: Record<string, number> = {};
  const byActivityType: Record<string, number> = {};
  const byIssueKey: JiraEvidenceSummary["byIssueKey"] = {};
  for (const item of input.events) {
    increment(byEvidenceType, item.evidenceType);
    increment(byActivityType, item.activityType);
    const current = byIssueKey[item.issueKey] ?? { directEvidenceCount: 0, contextEvidenceCount: 0, activityTypes: [] };
    if (item.evidenceScope === "direct") current.directEvidenceCount += 1;
    else current.contextEvidenceCount += 1;
    current.activityTypes = Array.from(new Set([...current.activityTypes, item.activityType])).sort();
    byIssueKey[item.issueKey] = current;
  }
  const issuesWithEvidence = directKeys.filter((key) => (byIssueKey[key]?.directEvidenceCount ?? 0) > 0);
  return {
    schemaVersion: "jira_evidence_summary_v1",
    selectedUser: input.selectedUser,
    dateRange: { start: input.startDate, end: input.endDate },
    directIssueCount: directKeys.length,
    fullFetchedIssueCount: new Set(input.fullFetchedIssueKeys.map((key) => key.toUpperCase())).size,
    failedIssueCount: input.failedIssueKeys.length,
    directEvidenceCount: input.events.filter((item) => item.evidenceScope === "direct").length,
    contextEvidenceCount: input.events.filter((item) => item.evidenceScope === "context").length,
    relatedContextEvidenceCount: input.events.filter((item) => item.evidenceScope === "related_context").length,
    excludedEvidenceCount: input.excluded.excludedCount,
    byEvidenceType,
    byActivityType,
    byIssueKey,
    coverage: { issuesWithEvidence: issuesWithEvidence.length, issuesWithoutDirectEvidence: Math.max(0, directKeys.length - issuesWithEvidence.length), failedIssues: [...input.failedIssueKeys].sort() },
    relatedIssueExpansionPolicy: { recursive: false, maxDepth: 1, relatedIssuesAsPrimaryEvidence: false }
  };
}
