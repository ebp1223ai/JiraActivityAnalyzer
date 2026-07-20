import crypto from "node:crypto";

export type ActivityStreamRequestWindowType = "1_day" | "7_days" | "14_days" | "calendar_month" | "custom_days";
export type ActivityStreamMergeStrategy = "union" | "last_stable";
export type ActivityStreamStability = "insufficient_attempts" | "unstable" | "probably_stable" | "stable";

export type ActivityStreamStabilityProbeConfig = {
  selectedUser: string;
  dateRange: { start: string; end: string };
  projectScope: string;
  requestWindow: { type: ActivityStreamRequestWindowType; customDays: number | null };
  forcedRetryCount: number;
  retryDelayMs: number;
  stopEarlyWhenStable: boolean;
  forceRunAllAttempts: boolean;
  mergeStrategy: ActivityStreamMergeStrategy;
  noStableFallback: "union" | "last_attempt";
};

export type ActivityStreamNormalizedEvent = {
  stableEventId: string;
  system: string;
  eventType: string;
  actor: string;
  eventTime: string;
  targetType: string;
  targetKey: string;
  normalizedAction: string;
  sourceReference: string;
  issueKeys: string[];
  raw: Record<string, unknown>;
};

export type ActivityStreamProbeAttempt = {
  probeRunId: string;
  windowId: string;
  attemptId: string;
  requestWindowStart: string;
  requestWindowEnd: string;
  attemptNumber: number;
  totalAttempts: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  httpStatus: string;
  requestSucceeded: boolean;
  rawEventCount: number;
  normalizedEventCount: number;
  uniqueEventCount: number;
  jiraIssueKeyCount: number;
  confluenceEventCount: number;
  duplicateCount: number;
  newEventsComparedWithPreviousAttempt: number;
  missingEventsComparedWithPreviousAttempt: number;
  newEventsComparedWithCurrentUnion: number;
  missingEventsComparedWithFinalUnion: number;
  eventSetFingerprint: string;
  issueKeySetFingerprint: string;
  errorType: string;
  errorMessage: string;
  idleGapSeconds: number;
  coldStartSuspected: boolean;
  normalizedEvents: ActivityStreamNormalizedEvent[];
  rawResultSanitized: Record<string, unknown>;
};

export type ActivityStreamAttemptDiff = Pick<ActivityStreamProbeAttempt, "newEventsComparedWithPreviousAttempt" | "missingEventsComparedWithPreviousAttempt" | "newEventsComparedWithCurrentUnion" | "missingEventsComparedWithFinalUnion">;

export type ActivityStreamWindowStability = {
  classification: ActivityStreamStability;
  reason: string;
  firstStableAttempt: number | null;
  stablePairAttempts: [number, number] | null;
};

export type ActivityStreamProbeWindow = {
  windowId: string;
  start: string;
  end: string;
  attempts: ActivityStreamProbeAttempt[];
  stability: ActivityStreamWindowStability;
  finalUnionEventCount: number;
  finalUnionJiraKeyCount: number;
  finalIntersectionEventCount: number;
  recommendedRetryCount: number;
};

export type ActivityStreamProbeRecommendation = {
  recommendedRequestWindow: ActivityStreamRequestWindowType;
  recommendedRetryCount: number;
  observedStableAttemptP50: number | null;
  observedStableAttemptMax: number | null;
  unstableWindowCount: number;
  coldStartAffectedWindowCount: number;
  recommendationReason: string;
};

export type ActivityStreamProbeRun = {
  schemaVersion: "activity_stream_stability_probe_v1";
  probeRunId: string;
  config: ActivityStreamStabilityProbeConfig;
  selectedUser: string;
  dateRange: { start: string; end: string };
  startedAt: string;
  completedAt: string;
  status: "running" | "completed" | "cancelled" | "failed";
  appSessionId: string;
  jiraConnectionSessionId: string;
  lastActivityStreamQueryAt: string;
  currentQueryStartedAt: string;
  idleGapSeconds: number;
  coldStartSuspected: boolean;
  concurrency: 1;
  windows: ActivityStreamProbeWindow[];
  attempts: ActivityStreamProbeAttempt[];
  mergedEvents: ActivityStreamNormalizedEvent[];
  mergeFallbackReason: string;
  recommendation: ActivityStreamProbeRecommendation;
};

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date {
  const match = datePattern.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatDate(date) !== value) throw new Error(`Invalid date: ${value}`);
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function splitActivityStreamWindows(start: string, end: string, type: ActivityStreamRequestWindowType, customDays = 7): Array<{ windowId: string; start: string; end: string }> {
  const first = parseDate(start);
  const last = parseDate(end);
  if (first > last) throw new Error("Start date must be on or before end date.");
  if (!Number.isInteger(customDays) || customDays < 1 || customDays > 31) throw new Error("Custom window days must be an integer from 1 to 31.");
  const days = type === "1_day" ? 1 : type === "7_days" ? 7 : type === "14_days" ? 14 : type === "custom_days" ? customDays : 0;
  const windows: Array<{ windowId: string; start: string; end: string }> = [];
  let cursor = first;
  while (cursor <= last) {
    let windowEnd: Date;
    if (type === "calendar_month") windowEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    else windowEnd = addDays(cursor, days - 1);
    if (windowEnd > last) windowEnd = last;
    const windowStartText = formatDate(cursor);
    const windowEndText = formatDate(windowEnd);
    windows.push({ windowId: `window-${String(windows.length + 1).padStart(3, "0")}-${windowStartText}-${windowEndText}`, start: windowStartText, end: windowEndText });
    cursor = addDays(windowEnd, 1);
  }
  return windows;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function sha256Fingerprint(values: string[]): string {
  return `sha256:${crypto.createHash("sha256").update(values.join("|")).digest("hex")}`;
}

export function normalizeStabilityEvent(entry: Record<string, unknown>): ActivityStreamNormalizedEvent {
  const issueKeys = Array.from(new Set((Array.isArray(entry.extractedIssueKeysPerEntry) ? entry.extractedIssueKeysPerEntry : [entry.issueKey]).map(String).filter(Boolean))).sort();
  const fields = {
    system: String(entry.activityApplication || "Other").toLowerCase(),
    eventType: String(entry.activityType || "unknown"),
    actor: String(entry.activityAuthorEmail || entry.activityAuthor || ""),
    eventTime: String(entry.activityTime || ""),
    targetType: String(entry.objectType || ""),
    targetKey: String(issueKeys[0] || entry.target || ""),
    normalizedAction: String(entry.activityTitle || entry.rawTitle || "").replace(/\s+/g, " ").trim(),
    sourceReference: String(entry.entryFingerprint || entry.target || entry.links || "")
  };
  return { stableEventId: sha256Fingerprint(Object.values(fields)), ...fields, issueKeys, raw: entry };
}

export function fingerprintSet(values: string[]): string {
  return sha256Fingerprint(Array.from(new Set(values)).sort());
}

export function classifyWindowStability(attempts: ActivityStreamProbeAttempt[]): ActivityStreamWindowStability {
  if (attempts.length < 2) return { classification: "insufficient_attempts", reason: "At least two completed attempts are required.", firstStableAttempt: null, stablePairAttempts: null };
  let firstPair: [number, number] | null = null;
  for (let index = 1; index < attempts.length; index += 1) {
    if (attempts[index - 1].requestSucceeded && attempts[index].requestSucceeded && attempts[index - 1].eventSetFingerprint === attempts[index].eventSetFingerprint && !firstPair) firstPair = [attempts[index - 1].attemptNumber, attempts[index].attemptNumber];
  }
  const previous = attempts[attempts.length - 2];
  const latest = attempts[attempts.length - 1];
  if (!previous.requestSucceeded || !latest.requestSucceeded) return { classification: "unstable", reason: "The final attempt pair contains an HTTP or network failure.", firstStableAttempt: firstPair?.[1] ?? null, stablePairAttempts: firstPair };
  if (previous.eventSetFingerprint === latest.eventSetFingerprint) return { classification: "stable", reason: "The final two event sets are identical.", firstStableAttempt: firstPair?.[1] ?? latest.attemptNumber, stablePairAttempts: [previous.attemptNumber, latest.attemptNumber] };
  if (previous.issueKeySetFingerprint === latest.issueKeySetFingerprint) return { classification: "probably_stable", reason: "The final issue-key sets match, but event fingerprints still differ.", firstStableAttempt: firstPair?.[1] ?? null, stablePairAttempts: firstPair };
  return { classification: "unstable", reason: firstPair ? "An earlier stable pair changed in later attempts." : "The final event and issue-key sets still differ.", firstStableAttempt: firstPair?.[1] ?? null, stablePairAttempts: firstPair };
}

export function finalizeAttemptDiffs(attempts: ActivityStreamProbeAttempt[]): ActivityStreamProbeAttempt[] {
  const union = new Set(attempts.flatMap((attempt) => attempt.normalizedEvents.map((event) => event.stableEventId)));
  let currentUnion = new Set<string>();
  return attempts.map((attempt, index) => {
    const ids = new Set(attempt.normalizedEvents.map((event) => event.stableEventId));
    const previous = new Set(index ? attempts[index - 1].normalizedEvents.map((event) => event.stableEventId) : []);
    const newPrevious = [...ids].filter((id) => !previous.has(id)).length;
    const missingPrevious = [...previous].filter((id) => !ids.has(id)).length;
    const newUnion = [...ids].filter((id) => !currentUnion.has(id)).length;
    currentUnion = new Set([...currentUnion, ...ids]);
    return { ...attempt, newEventsComparedWithPreviousAttempt: index ? newPrevious : ids.size, missingEventsComparedWithPreviousAttempt: index ? missingPrevious : 0, newEventsComparedWithCurrentUnion: newUnion, missingEventsComparedWithFinalUnion: [...union].filter((id) => !ids.has(id)).length };
  });
}

export function mergeProbeAttempts(attempts: ActivityStreamProbeAttempt[], strategy: ActivityStreamMergeStrategy, fallback: "union" | "last_attempt"): { events: ActivityStreamNormalizedEvent[]; fallbackReason: string } {
  const union = () => Array.from(new Map(attempts.flatMap((attempt) => attempt.normalizedEvents).map((event) => [event.stableEventId, event])).values());
  if (strategy === "union") return { events: union(), fallbackReason: "" };
  for (let index = attempts.length - 1; index > 0; index -= 1) {
    if (attempts[index - 1].requestSucceeded && attempts[index].requestSucceeded && attempts[index - 1].eventSetFingerprint === attempts[index].eventSetFingerprint) return { events: attempts[index].normalizedEvents, fallbackReason: "" };
  }
  return fallback === "last_attempt"
    ? { events: attempts[attempts.length - 1]?.normalizedEvents ?? [], fallbackReason: "No stable attempt pair was found; used the last attempt." }
    : { events: union(), fallbackReason: "No stable attempt pair was found; used Union." };
}

export function recommendStabilitySettings(windows: ActivityStreamProbeWindow[], requestWindow: ActivityStreamRequestWindowType): ActivityStreamProbeRecommendation {
  const stableAttempts = windows.map((window) => window.stability.firstStableAttempt).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const p50 = stableAttempts.length ? stableAttempts[Math.floor((stableAttempts.length - 1) / 2)] : null;
  const max = stableAttempts.length ? Math.max(...stableAttempts) : null;
  const unstable = windows.filter((window) => window.stability.classification === "unstable").length;
  const cold = windows.filter((window) => window.attempts.some((attempt) => attempt.coldStartSuspected)).length;
  const retry = Math.min(32, Math.max(2, (max ?? 4) + 1));
  return { recommendedRequestWindow: requestWindow, recommendedRetryCount: retry, observedStableAttemptP50: p50, observedStableAttemptMax: max, unstableWindowCount: unstable, coldStartAffectedWindowCount: cold, recommendationReason: unstable ? `${unstable} window(s) remained unstable; keep Union and increase observation attempts.` : `Observed stable attempts support ${retry} retries with early stop.` };
}

export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
