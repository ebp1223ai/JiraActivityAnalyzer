export const COVERAGE_STATES = [
  "Disabled",
  "Skipped",
  "Failed",
  "Partial",
  "CompleteEmpty",
  "CompleteNonEmpty"
] as const;

export type CoverageState = (typeof COVERAGE_STATES)[number];
export type CoverageComparison = "Equivalent" | "Upgrade" | "Downgrade" | "Incomparable" | "Invalid";
export type CoverageDimension = "coreFields" | "changelog" | "comments" | "attachmentsMetadata"
  | "issueLinks" | "remoteLinks" | "parentSubtasks" | "relatedIssues";

export type CoverageEvidence = {
  status: CoverageState;
  itemCount: number;
  source: string;
  requestCompleted: boolean;
  validationResult: "passed" | "failed" | "not_applicable";
  reasonCode: string;
};

export type CoverageProfile = {
  fetchProfileVersion: number;
  coreFields: CoverageState;
  changelog: CoverageState;
  comments: CoverageState;
  attachmentsMetadata: CoverageState;
  issueLinks: CoverageState;
  remoteLinks: CoverageState;
  parentSubtasks: CoverageState;
  relatedIssues: CoverageState;
  conservationPassed: boolean;
  evidence?: Partial<Record<CoverageDimension, CoverageEvidence>>;
};

const dimensions: CoverageDimension[] = [
  "coreFields",
  "changelog",
  "comments",
  "attachmentsMetadata",
  "issueLinks",
  "remoteLinks",
  "parentSubtasks",
  "relatedIssues"
];

const mandatory: CoverageDimension[] = ["coreFields", "changelog", "comments"];
const rank: Record<CoverageState, number | null> = {
  Disabled: 0,
  Skipped: 0,
  Failed: null,
  Partial: null,
  CompleteEmpty: 1,
  CompleteNonEmpty: 1
};

export function isCoverageProfile(value: unknown): value is CoverageProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return Number.isInteger(profile.fetchProfileVersion)
    && typeof profile.conservationPassed === "boolean"
    && dimensions.every((key) => COVERAGE_STATES.includes(profile[key] as CoverageState))
    && (profile.evidence === undefined || Boolean(profile.evidence) && typeof profile.evidence === "object");
}

export function validateCoverage(profile: CoverageProfile) {
  if (!profile.conservationPassed) return { valid: false, reasonCode: "COVERAGE_CONSERVATION_FAILED" };
  for (const key of mandatory) {
    if (profile[key] === "Failed" || profile[key] === "Partial" || profile[key] === "Disabled" || profile[key] === "Skipped") {
      return { valid: false, reasonCode: `COVERAGE_MANDATORY_${String(key).toUpperCase()}_${String(profile[key]).toUpperCase()}` };
    }
  }
  for (const key of dimensions) {
    const evidence = profile.evidence?.[key];
    if (!evidence) continue;
    if (evidence.status !== profile[key]) return { valid: false, reasonCode: `COVERAGE_${key.toUpperCase()}_STATE_EVIDENCE_MISMATCH` };
    if (!Number.isInteger(evidence.itemCount) || evidence.itemCount < 0) {
      return { valid: false, reasonCode: `COVERAGE_${key.toUpperCase()}_COUNT_INVALID` };
    }
    if (["CompleteEmpty", "CompleteNonEmpty"].includes(evidence.status)
      && (!evidence.requestCompleted || evidence.validationResult !== "passed")) {
      return { valid: false, reasonCode: `COVERAGE_${key.toUpperCase()}_COMPLETENESS_UNPROVEN` };
    }
    if (evidence.status === "CompleteEmpty" && evidence.itemCount !== 0) {
      return { valid: false, reasonCode: `COVERAGE_${key.toUpperCase()}_EMPTY_COUNT_MISMATCH` };
    }
    if (evidence.status === "CompleteNonEmpty" && evidence.itemCount === 0) {
      return { valid: false, reasonCode: `COVERAGE_${key.toUpperCase()}_NONEMPTY_COUNT_MISMATCH` };
    }
  }
  return { valid: true, reasonCode: "COVERAGE_VALID" };
}

export function compareCoverage(stored: CoverageProfile | null, candidate: CoverageProfile): CoverageComparison {
  if (!validateCoverage(candidate).valid) return "Invalid";
  if (!stored) return "Upgrade";
  if (!validateCoverage(stored).valid || stored.fetchProfileVersion !== candidate.fetchProfileVersion) return "Incomparable";

  let broader = false;
  let narrower = false;
  for (const key of dimensions) {
    const before = rank[stored[key]];
    const after = rank[candidate[key]];
    if (before === null || after === null) return "Invalid";
    if (after > before) broader = true;
    if (after < before) narrower = true;
    // Empty and non-empty are equally authoritative; the Stable Projection carries their semantic difference.
  }
  if (broader && narrower) return "Incomparable";
  if (narrower) return "Downgrade";
  if (broader) return "Upgrade";
  return "Equivalent";
}

export function defaultCompleteCoverage(input: {
  comments?: number;
  changelog?: number;
  attachments?: number;
  issueLinks?: number;
  remoteLinksEnabled?: boolean;
  remoteLinks?: number;
  relatedIssuesEnabled?: boolean;
  relatedIssues?: number;
} = {}): CoverageProfile {
  const complete = (count = 0): CoverageState => count > 0 ? "CompleteNonEmpty" : "CompleteEmpty";
  const evidence = (
    status: CoverageState,
    count: number,
    source: string,
    reasonCode: string
  ): CoverageEvidence => ({
    status,
    itemCount: count,
    source,
    requestCompleted: status === "CompleteEmpty" || status === "CompleteNonEmpty",
    validationResult: status === "Disabled" ? "not_applicable" : "passed",
    reasonCode
  });
  const issueLinks = complete(input.issueLinks);
  const remoteLinks = input.remoteLinksEnabled ? complete(input.remoteLinks) : "Disabled";
  const relatedIssues = input.relatedIssuesEnabled ? complete(input.relatedIssues) : "Disabled";
  return {
    fetchProfileVersion: 1,
    coreFields: "CompleteNonEmpty",
    changelog: complete(input.changelog),
    comments: complete(input.comments),
    attachmentsMetadata: complete(input.attachments),
    issueLinks,
    remoteLinks,
    parentSubtasks: "CompleteEmpty",
    relatedIssues,
    conservationPassed: true,
    evidence: {
      coreFields: evidence("CompleteNonEmpty", 1, "issue.fields", "CORE_FIELDS_COMPLETE"),
      changelog: evidence(complete(input.changelog), input.changelog ?? 0, "changelog", "CHANGELOG_COMPLETE"),
      comments: evidence(complete(input.comments), input.comments ?? 0, "comments", "COMMENTS_COMPLETE"),
      attachmentsMetadata: evidence(complete(input.attachments), input.attachments ?? 0, "issue.fields.attachment", "ATTACHMENTS_COMPLETE"),
      issueLinks: evidence(issueLinks, input.issueLinks ?? 0, "issue.fields.issuelinks", "ISSUE_LINKS_FIELD_COMPLETE"),
      remoteLinks: evidence(remoteLinks, input.remoteLinks ?? 0, "remoteLinks", remoteLinks === "Disabled" ? "REMOTE_LINKS_DISABLED" : "REMOTE_LINKS_COMPLETE"),
      parentSubtasks: evidence("CompleteEmpty", 0, "issue.fields.parent/subtasks", "PARENT_SUBTASKS_COMPLETE"),
      relatedIssues: evidence(relatedIssues, input.relatedIssues ?? 0, "relatedIssuesDiscovery", relatedIssues === "Disabled" ? "RELATED_ISSUES_DISABLED" : "RELATED_ISSUES_COMPLETE")
    }
  };
}

export function validateIssueLinksCoverage(profile: CoverageProfile, rawValue: unknown) {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  const issue = raw.issue && typeof raw.issue === "object" && !Array.isArray(raw.issue)
    ? raw.issue as Record<string, unknown>
    : raw;
  const fields = issue.fields && typeof issue.fields === "object" && !Array.isArray(issue.fields)
    ? issue.fields as Record<string, unknown>
    : {};
  const linksValue = fields.issuelinks;
  const evidence = profile.evidence?.issueLinks;
  if (!evidence) return { valid: false, reasonCode: "ISSUE_LINKS_EVIDENCE_MISSING" };
  if (!Array.isArray(linksValue)) return { valid: false, reasonCode: "ISSUE_LINKS_FIELD_INVALID" };
  if (evidence.source !== "issue.fields.issuelinks") return { valid: false, reasonCode: "ISSUE_LINKS_SOURCE_INVALID" };
  if (evidence.itemCount !== linksValue.length) return { valid: false, reasonCode: "ISSUE_LINKS_COUNT_MISMATCH" };
  const expected = linksValue.length > 0 ? "CompleteNonEmpty" : "CompleteEmpty";
  if (evidence.status !== expected || profile.issueLinks !== expected) {
    return { valid: false, reasonCode: "ISSUE_LINKS_STATUS_MISMATCH" };
  }
  return { valid: true, reasonCode: "ISSUE_LINKS_EVIDENCE_VALID", itemCount: linksValue.length };
}
