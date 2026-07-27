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
};

const dimensions: Array<keyof Omit<CoverageProfile, "fetchProfileVersion" | "conservationPassed">> = [
  "coreFields",
  "changelog",
  "comments",
  "attachmentsMetadata",
  "issueLinks",
  "remoteLinks",
  "parentSubtasks",
  "relatedIssues"
];

const mandatory: Array<keyof CoverageProfile> = ["coreFields", "changelog", "comments"];
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
    && dimensions.every((key) => COVERAGE_STATES.includes(profile[key] as CoverageState));
}

export function validateCoverage(profile: CoverageProfile) {
  if (!profile.conservationPassed) return { valid: false, reasonCode: "COVERAGE_CONSERVATION_FAILED" };
  for (const key of mandatory) {
    if (profile[key] === "Failed" || profile[key] === "Partial" || profile[key] === "Disabled" || profile[key] === "Skipped") {
      return { valid: false, reasonCode: `COVERAGE_MANDATORY_${String(key).toUpperCase()}_${String(profile[key]).toUpperCase()}` };
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
  return {
    fetchProfileVersion: 1,
    coreFields: "CompleteNonEmpty",
    changelog: complete(input.changelog),
    comments: complete(input.comments),
    attachmentsMetadata: complete(input.attachments),
    issueLinks: complete(input.issueLinks),
    remoteLinks: input.remoteLinksEnabled ? complete(input.remoteLinks) : "Disabled",
    parentSubtasks: "CompleteEmpty",
    relatedIssues: input.relatedIssuesEnabled ? complete(input.relatedIssues) : "Disabled",
    conservationPassed: true
  };
}
