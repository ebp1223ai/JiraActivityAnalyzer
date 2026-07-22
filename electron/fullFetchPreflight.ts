export type QueueExclusionReason = "invalid_issue_key" | "untrusted_source" | "duplicate" | "outside_project_scope" | "already_fetched" | "fetch_limit";
export type QueueCandidate = Record<string, unknown>;
export type QueuePreflightExclusion = { key: string; index: number; reason: QueueExclusionReason; detail: string };

const issueKeyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
const trustedSources = new Set(["activity_timeline", "advanced_candidate_search", "recommended_related_issue", "optional_related_issue", "manual"]);

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function preflightFullFetchQueue(input: {
  candidates: QueueCandidate[];
  fetchLimit: number;
  projectScope?: string;
  alreadyFetchedKeys?: string[];
}) {
  const accepted: QueueCandidate[] = [];
  const excluded: QueuePreflightExclusion[] = [];
  const seen = new Set<string>();
  const alreadyFetched = new Set((input.alreadyFetchedKeys ?? []).map((key) => key.toUpperCase()));
  const scope = new Set(text(input.projectScope).split(/[\s,;]+/).map((key) => key.toUpperCase()).filter(Boolean));
  const limit = Math.max(0, Math.trunc(Number(input.fetchLimit) || 0));

  input.candidates.forEach((candidate, index) => {
    const key = text(candidate.key).toUpperCase();
    const queueMetadata = record(candidate.queueMetadata);
    const sources = Array.isArray(queueMetadata.sources) ? queueMetadata.sources.map(text).filter(Boolean) : [text(candidate.source) || "manual"];
    let reason: QueueExclusionReason | null = null;
    let detail = "";
    if (!issueKeyPattern.test(key)) { reason = "invalid_issue_key"; detail = "Issue key format is invalid."; }
    else if (!sources.length || sources.some((source) => !trustedSources.has(source))) { reason = "untrusted_source"; detail = `Queue source is not trusted: ${sources.join(", ") || "missing"}.`; }
    else if (seen.has(key)) { reason = "duplicate"; detail = "Duplicate issue key."; }
    else if (scope.size > 0 && !scope.has(key.split("-")[0])) { reason = "outside_project_scope"; detail = "Issue is outside the selected project scope."; }
    else if (alreadyFetched.has(key)) { reason = "already_fetched"; detail = "Issue was already fetched for this workflow."; }
    else if (accepted.length >= limit) { reason = "fetch_limit"; detail = `Fetch limit ${limit} reached.`; }
    if (reason) excluded.push({ key, index, reason, detail });
    else { seen.add(key); accepted.push({ ...candidate, key }); }
  });

  return {
    ok: accepted.length > 0,
    accepted,
    excluded,
    requestedCount: input.candidates.length,
    acceptedCount: accepted.length,
    excludedCount: excluded.length,
    message: accepted.length > 0
      ? `${accepted.length} issue(s) accepted; ${excluded.length} excluded.`
      : "Preflight validation failed / 抓取前驗證失敗"
  };
}
