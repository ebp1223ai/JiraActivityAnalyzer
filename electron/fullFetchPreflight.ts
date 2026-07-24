export type QueueReasonCode =
  | "INVALID_QUEUE_ITEM"
  | "INVALID_ISSUE_KEY"
  | "UNTRUSTED_SOURCE"
  | "DUPLICATE_ISSUE_KEY"
  | "PROJECT_SCOPE_MISMATCH"
  | "ALREADY_FETCHED";

export type QueueCandidate = Record<string, unknown>;
export type QueueClassification = "eligible" | "excluded" | "invalid";
export type QueuePreflightEntry = {
  index: number;
  originalValue: unknown;
  canonicalIssueKey: string;
  key: string;
  classification: QueueClassification;
  reasonCode: QueueReasonCode | "ELIGIBLE";
  reason: QueueReasonCode | "ELIGIBLE";
  message: string;
  detail: string;
  expected: string;
  actual: string;
};

export type FullFetchQueuePreflight = ReturnType<typeof preflightFullFetchQueue>;

const issueKeyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
const trustedSources = new Set(["activity_timeline", "advanced_candidate_search", "recommended_related_issue", "optional_related_issue", "manual"]);

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

function immutableCopy(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  const source = record(value);
  if (!source) return value;
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, item]) => [key, immutableCopy(item)])));
}

function entry(index: number, originalValue: unknown, canonicalIssueKey: string, classification: QueueClassification, reasonCode: QueuePreflightEntry["reasonCode"], message: string, expected = "", actual = ""): QueuePreflightEntry {
  return { index, originalValue, canonicalIssueKey, key: canonicalIssueKey, classification, reasonCode, reason: reasonCode, message, detail: message, expected, actual };
}

export function preflightFullFetchQueue(input: {
  candidates: unknown[];
  // Retained for legacy request compatibility. New selections authorize
  // cross-project Full Fetch and this value is not an eligibility rule.
  projectScope?: string;
  alreadyFetchedKeys?: string[];
}) {
  const accepted: QueueCandidate[] = [];
  const eligibleItems: QueuePreflightEntry[] = [];
  const excluded: QueuePreflightEntry[] = [];
  const invalid: QueuePreflightEntry[] = [];
  const all: QueuePreflightEntry[] = [];
  const seen = new Set<string>();
  const alreadyFetched = new Set((input.alreadyFetchedKeys ?? []).map((key) => key.toUpperCase()));

  input.candidates.forEach((candidateValue, index) => {
    const candidate = record(candidateValue);
    if (!candidate) {
      const result = entry(index, candidateValue, "", "invalid", "INVALID_QUEUE_ITEM", "Queue item must be an object containing an Issue Key.", "object", Array.isArray(candidateValue) ? "array" : typeof candidateValue);
      invalid.push(result); all.push(result); return;
    }
    const key = text(candidate.key).toUpperCase();
    if (!issueKeyPattern.test(key)) {
      const result = entry(index, candidateValue, key, "invalid", "INVALID_ISSUE_KEY", "Issue Key format is invalid.", "PROJECT-123", key || "missing");
      invalid.push(result); all.push(result); return;
    }
    const queueMetadata = record(candidate.queueMetadata) ?? {};
    const sources = Array.isArray(queueMetadata.sources) ? queueMetadata.sources.map(text).filter(Boolean) : [text(candidate.source) || "manual"];
    let result: QueuePreflightEntry | null = null;
    if (!sources.length || sources.some((source) => !trustedSources.has(source))) {
      result = entry(index, candidateValue, key, "excluded", "UNTRUSTED_SOURCE", `Queue source is not trusted: ${sources.join(", ") || "missing"}.`, "trusted queue source", sources.join(", ") || "missing");
    } else if (seen.has(key)) {
      result = entry(index, candidateValue, key, "excluded", "DUPLICATE_ISSUE_KEY", "Duplicate Issue Key.", "unique Issue Key", key);
    } else if (alreadyFetched.has(key)) {
      result = entry(index, candidateValue, key, "excluded", "ALREADY_FETCHED", "Issue was already fetched for this workflow.", "not previously fetched", key);
    }
    if (result) {
      excluded.push(result); all.push(result); return;
    }
    seen.add(key);
    const acceptedCandidate = { ...candidate, key };
    accepted.push(acceptedCandidate);
    const eligible = entry(index, candidateValue, key, "eligible", "ELIGIBLE", "Eligible for Full Fetch.");
    eligibleItems.push(eligible); all.push(eligible);
  });

  return {
    ok: accepted.length > 0,
    accepted,
    eligible: accepted,
    eligibleItems,
    excluded,
    invalid,
    items: all.sort((a, b) => a.index - b.index),
    requestedCount: input.candidates.length,
    queueTotal: input.candidates.length,
    acceptedCount: accepted.length,
    eligibleCount: accepted.length,
    plannedCount: accepted.length,
    excludedCount: excluded.length,
    invalidCount: invalid.length,
    message: accepted.length > 0
      ? `${accepted.length} issue(s) eligible; ${excluded.length} excluded; ${invalid.length} invalid.`
      : "Preflight validation failed / 抓取前驗證失敗"
  };
}

export function createCanonicalQueueSnapshot(preflight: FullFetchQueuePreflight, confirmedAt = new Date().toISOString()) {
  const items = preflight.items.map((item) => Object.freeze({ ...item, originalValue: immutableCopy(item.originalValue) }));
  const originalQueueOrder = Object.freeze(items.map((item) => item.canonicalIssueKey || `(row ${item.index + 1})`));
  const snapshot = {
    schemaVersion: "full_fetch_queue_snapshot_v1",
    confirmedAt,
    queueTotal: preflight.queueTotal,
    eligibleCount: preflight.eligibleCount,
    excludedCount: preflight.excludedCount,
    invalidCount: preflight.invalidCount,
    plannedCount: preflight.plannedCount,
    originalQueueOrder,
    items: Object.freeze(items)
  };
  return Object.freeze(snapshot);
}
