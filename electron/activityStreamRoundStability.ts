import crypto from "node:crypto";
import { splitActivityStreamWindows, type ActivityStreamMergeStrategy, type ActivityStreamRequestWindowType } from "./activityStreamStability.js";

export type RoundExecutionMode = "stop_when_stable" | "force_all_rounds";
export type RoundStability = "insufficient_rounds" | "unstable" | "probably_stable" | "stable";
export type ActivityStreamResultClassification = "http_200_with_entries" | "http_200_no_entries" | "timeout" | "aborted" | "empty_response" | "partial_response" | "parse_failed" | "network_error" | "http_error";

export type PhysicalHttpRequestDiagnostic = {
  physicalRequestId: string; probeRunId: string; roundNumber: number; windowNumber: number;
  requestWindowStart: string; requestWindowEnd: string; variant: "escaped_username";
  requestStartedAt: string; requestSentAt: string; responseHeadersReceivedAt: string; responseBodyCompletedAt: string; requestCompletedAt: string;
  httpStatus: string; responseBytes: number; atomEntryCount: number; parsedEventCount: number;
  timeout: boolean; aborted: boolean; errorType: string; errorMessageSanitized: string;
  httpDurationMs: number; timeToFirstByteMs: number | null; timeToFirstByteAvailable: boolean; responseDownloadMs: number;
  pagination: boolean; retry: boolean;
};

export type ProcessingTiming = { xmlParseMs: number; eventNormalizationMs: number; jiraKeyExtractionMs: number; deduplicationMs: number; fingerprintMs: number; comparisonMs: number; resultAssemblyMs: number; totalProcessingMs: number };

export type ActivityStreamStabilityConfigV2 = {
  selectedUser: string;
  dateRange: { start: string; end: string };
  projectScope: string;
  requestWindow: { type: ActivityStreamRequestWindowType; customDays: number | null };
  fullScanRoundCount: number;
  delayBetweenRoundsMs: number;
  mergeStrategy: ActivityStreamMergeStrategy;
  roundExecutionMode: RoundExecutionMode;
};

export type RoundNormalizedEvent = {
  stableEventId: string;
  system: string;
  eventType: string;
  actor: string;
  eventTime: string;
  targetType: string;
  targetKey: string;
  normalizedAction: string;
  sourceReference: string;
  primaryJiraKeys: string[];
  referencedJiraKeys: string[];
  allJiraLikeKeys: string[];
  raw: Record<string, unknown>;
};

export type ActivityStreamRoundWindowResult = {
  roundId: string;
  roundNumber: number;
  windowId: string;
  windowNumber: number;
  windowCount: number;
  requestWindowStart: string;
  requestWindowEnd: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed" | "cancelled";
  httpStatus: string;
  requestSucceeded: boolean;
  classification: ActivityStreamResultClassification;
  logicalRequestId: string;
  logicalFetchDurationMs: number;
  logicalWindowRequestCount: 1;
  physicalHttpRequestCount: number;
  paginationRequestCount: number;
  retryRequestCount: number;
  physicalRequests: PhysicalHttpRequestDiagnostic[];
  processingTiming: ProcessingTiming;
  apiDurationMs: number;
  processingDurationMs: number;
  totalRequestDurationMs: number;
  rawEventCount: number;
  normalizedEventCount: number;
  uniqueEventCount: number;
  primaryJiraKeyCount: number;
  referencedJiraKeyCount: number;
  allJiraLikeKeyCount: number;
  eventSetFingerprint: string;
  primaryJiraKeySetFingerprint: string;
  referencedJiraKeySetFingerprint: string;
  newEventsComparedWithPreviousRound: number;
  missingEventsComparedWithPreviousRound: number;
  errorType: string;
  errorMessage: string;
  normalizedEvents: RoundNormalizedEvent[];
  rawResultSanitized: Record<string, unknown>;
};

export type ActivityStreamRound = {
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "partial" | "cancelled";
  windowCount: number;
  completedWindowCount: number;
  rawEventCount: number;
  normalizedEventCount: number;
  uniqueEventCount: number;
  primaryJiraKeyCount: number;
  referencedJiraKeyCount: number;
  allJiraLikeKeyCount: number;
  roundEventSetFingerprint: string;
  roundPrimaryJiraKeySetFingerprint: string;
  roundReferencedJiraKeySetFingerprint: string;
  newEventsComparedWithPreviousRound: number;
  missingEventsComparedWithPreviousRound: number;
  newPrimaryJiraKeysComparedWithPreviousRound: number;
  missingPrimaryJiraKeysComparedWithPreviousRound: number;
  newReferencedJiraKeysComparedWithPreviousRound: number;
  missingReferencedJiraKeysComparedWithPreviousRound: number;
  coldStartSuspected: boolean;
  apiDurationMs: number;
  processingDurationMs: number;
  roundDelayMs: number;
  windows: ActivityStreamRoundWindowResult[];
  normalizedEvents: RoundNormalizedEvent[];
};

export type ActivityStreamRoundComparison = {
  stability: RoundStability;
  reason: string;
  firstStableRound: number | null;
  stableRoundPair: [number, number] | null;
  roundUnionEventCount: number;
  roundIntersectionEventCount: number;
  variableEventCount: number;
  consistencyRate: number | null;
};

export type ActivityStreamWindowDiagnostic = ActivityStreamRoundWindowResult;

export type ActivityStreamRoundRecommendation = {
  recommendedRequestWindow: ActivityStreamRequestWindowType;
  recommendedRoundCount: number;
  recommendedExecutionMode: RoundExecutionMode;
  firstStableRound: number | null;
  stableRoundP50: number | null;
  stableRoundMax: number | null;
  roundUnionEventCount: number;
  roundIntersectionEventCount: number;
  variableEventCount: number;
  consistencyRate: number | null;
  unstableRoundCount: number;
  coldStartAffectedRoundCount: number;
  recommendationReason: string;
};

export type ActivityStreamProbeRunV2 = {
  schemaVersion: "activity_stream_stability_probe_v2";
  executionOrder: "round_first";
  probeRunId: string;
  config: ActivityStreamStabilityConfigV2;
  selectedUser: string;
  dateRange: { start: string; end: string };
  startedAt: string;
  completedAt: string;
  status: "completed" | "cancelled" | "failed";
  concurrency: 1;
  appSessionId: string;
  jiraConnectionSessionId: string;
  rounds: ActivityStreamRound[];
  windowDiagnostics: ActivityStreamWindowDiagnostic[];
  comparison: ActivityStreamRoundComparison;
  recommendation: ActivityStreamRoundRecommendation;
  mergedEvents: RoundNormalizedEvent[];
  legacyExecutionOrder?: "window_first";
};

export type RoundWindowFetchResult = {
  httpStatus: string;
  requestSucceeded: boolean;
  rawEventCount: number;
  entries: Record<string, unknown>[];
  apiDurationMs: number;
  classification?: ActivityStreamResultClassification;
  logicalFetchDurationMs?: number;
  processingDurationMs?: number;
  physicalRequests?: PhysicalHttpRequestDiagnostic[];
  errorType?: string;
  errorMessage?: string;
  rawResultSanitized?: Record<string, unknown>;
};

export type RoundProgress = {
  probeRunId: string;
  stage: "round_start" | "window_start" | "window_complete" | "round_complete" | "round_delay" | "completed" | "cancelled";
  currentRound: number;
  totalRounds: number;
  currentWindow: number;
  totalWindows: number;
  completedRequests: number;
  totalRequests: number;
  requestWindowStart: string;
  requestWindowEnd: string;
  currentApiDurationMs: number;
  averageApiDurationMs: number;
  averageLogicalFetchDurationMs: number;
  averagePhysicalHttpDurationMs: number;
  averageProcessingDurationMs: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  estimatedCompletionTime: string;
  currentStability: RoundStability;
  stableSinceRound: number | null;
};

export type RoundExecutorOptions = {
  probeRunId: string;
  appSessionId: string;
  jiraConnectionSessionId: string;
  coldStartSuspected: boolean;
  fetchWindow: (context: { roundNumber: number; roundId: string; windowNumber: number; windowId: string; start: string; end: string }) => Promise<RoundWindowFetchResult>;
  shouldCancel?: () => boolean;
  onProgress?: (progress: RoundProgress) => void;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

export function classifyActivityStreamResult(input: { httpStatus: string; atomEntryCount: number; parsedEventCount: number; responseBytes: number; timeout?: boolean; aborted?: boolean; errorType?: string }): ActivityStreamResultClassification {
  if (input.timeout) return "timeout";
  if (input.aborted) return "aborted";
  if (input.errorType === "partial_response") return "partial_response";
  if (input.errorType === "parse_failed" || input.errorType === "parser_failed") return "parse_failed";
  if (input.errorType === "network_error" || input.errorType === "NETWORK_ERROR") return "network_error";
  if (input.httpStatus !== "200") return "http_error";
  if (input.responseBytes <= 0) return "empty_response";
  return input.atomEntryCount > 0 || input.parsedEventCount > 0 ? "http_200_with_entries" : "http_200_no_entries";
}

const jiraKeyPattern = /\b[A-Z][A-Z0-9_]+-\d+\b/g;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function canonicalJsonSha256(value: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function jiraKeys(value: unknown): string[] {
  return unique(String(value ?? "").toUpperCase().match(jiraKeyPattern) ?? []);
}

export function normalizeRoundEvent(entry: Record<string, unknown>): RoundNormalizedEvent {
  const directCandidates = [entry.issueKey, entry.targetKey, entry.target, entry.objectKey].flatMap(jiraKeys);
  const primaryJiraKeys = unique(directCandidates.slice(0, 1));
  const extracted = unique([
    ...(Array.isArray(entry.extractedIssueKeysPerEntry) ? entry.extractedIssueKeysPerEntry.flatMap(jiraKeys) : []),
    ...jiraKeys(entry.activityTitle),
    ...jiraKeys(entry.rawTitle),
    ...jiraKeys(entry.rawSummary),
    ...jiraKeys(entry.rawContent)
  ]);
  const referencedJiraKeys = extracted.filter((key) => !primaryJiraKeys.includes(key));
  const allJiraLikeKeys = unique([...primaryJiraKeys, ...referencedJiraKeys]);
  const stableFields = {
    system: String(entry.activityApplication || "Other").toLowerCase(),
    eventType: String(entry.activityType || "unknown"),
    actor: String(entry.activityAuthorEmail || entry.activityAuthor || ""),
    eventTime: String(entry.activityTime || ""),
    targetType: String(entry.objectType || ""),
    targetKey: String(primaryJiraKeys[0] || entry.target || ""),
    normalizedAction: String(entry.activityTitle || entry.rawTitle || "").replace(/\s+/g, " ").trim(),
    sourceReference: String(entry.entryFingerprint || entry.target || (Array.isArray(entry.links) ? entry.links[0] : entry.links) || "")
  };
  return { stableEventId: canonicalJsonSha256(stableFields), ...stableFields, primaryJiraKeys, referencedJiraKeys, allJiraLikeKeys, raw: entry };
}

export function fingerprint(values: string[]): string {
  return canonicalJsonSha256(unique(values));
}

function setDiff(left: Set<string>, right: Set<string>): number {
  return [...left].filter((value) => !right.has(value)).length;
}

function completedRounds(rounds: ActivityStreamRound[]): ActivityStreamRound[] {
  return rounds.filter((round) => round.status === "completed" && round.completedWindowCount === round.windowCount && round.windows.every((window) => window.requestSucceeded));
}

export function compareCompletedRounds(rounds: ActivityStreamRound[]): ActivityStreamRoundComparison {
  const complete = completedRounds(rounds);
  const eventSets = complete.map((round) => new Set(round.normalizedEvents.map((event) => event.stableEventId)));
  const union = new Set(eventSets.flatMap((set) => [...set]));
  const intersection = eventSets.length ? eventSets.slice(1).reduce((current, set) => new Set([...current].filter((value) => set.has(value))), new Set(eventSets[0])) : new Set<string>();
  const variableEventCount = union.size - intersection.size;
  const consistencyRate = union.size === 0 ? null : intersection.size / union.size;
  if (complete.length < 2) return { stability: "insufficient_rounds", reason: "At least two complete rounds are required. / 至少需要兩個完整輪次。", firstStableRound: null, stableRoundPair: null, roundUnionEventCount: union.size, roundIntersectionEventCount: intersection.size, variableEventCount, consistencyRate };
  let firstPair: [number, number] | null = null;
  for (let index = 1; index < complete.length; index += 1) if (!firstPair && complete[index - 1].roundEventSetFingerprint === complete[index].roundEventSetFingerprint) firstPair = [complete[index - 1].roundNumber, complete[index].roundNumber];
  const previous = complete[complete.length - 2]!;
  const latest = complete[complete.length - 1]!;
  if (previous.roundEventSetFingerprint === latest.roundEventSetFingerprint) return { stability: "stable", reason: "The final two complete rounds have identical event sets. / 最後兩個完整輪次的事件集合相同。", firstStableRound: firstPair?.[1] ?? latest.roundNumber, stableRoundPair: [previous.roundNumber, latest.roundNumber], roundUnionEventCount: union.size, roundIntersectionEventCount: intersection.size, variableEventCount, consistencyRate };
  if (previous.roundPrimaryJiraKeySetFingerprint === latest.roundPrimaryJiraKeySetFingerprint) return { stability: "probably_stable", reason: "Primary Jira keys match, but event sets differ. / 主要 Jira 相同，但事件集合仍有差異。", firstStableRound: firstPair?.[1] ?? null, stableRoundPair: firstPair, roundUnionEventCount: union.size, roundIntersectionEventCount: intersection.size, variableEventCount, consistencyRate };
  return { stability: "unstable", reason: firstPair ? "A previously stable pair changed in a later round. / 先前穩定的輪次在後續再次變動。" : "The final complete rounds still differ. / 最後兩個完整輪次仍有差異。", firstStableRound: firstPair?.[1] ?? null, stableRoundPair: firstPair, roundUnionEventCount: union.size, roundIntersectionEventCount: intersection.size, variableEventCount, consistencyRate };
}

export function recommendRounds(rounds: ActivityStreamRound[], requestWindow: ActivityStreamRequestWindowType): ActivityStreamRoundRecommendation {
  const comparison = compareCompletedRounds(rounds);
  const stableRounds = completedRounds(rounds).map((round, index, values) => index > 0 && values[index - 1].roundEventSetFingerprint === round.roundEventSetFingerprint ? round.roundNumber : null).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const stableRoundP50 = stableRounds.length ? stableRounds[Math.floor((stableRounds.length - 1) / 2)] : null;
  const stableRoundMax = stableRounds.length ? Math.max(...stableRounds) : null;
  const recommendedRoundCount = comparison.stability === "stable" ? Math.max(2, comparison.firstStableRound ?? 2) : Math.min(32, Math.max(3, completedRounds(rounds).length + 1));
  const reason = comparison.stability === "stable"
    ? `Stable at round ${comparison.firstStableRound}; stop-when-stable is recommended. / 第 ${comparison.firstStableRound} 輪達到穩定，建議使用穩定後提前停止。`
    : "The last complete rounds still differ. Increase rounds, reduce the request window, or inspect differences. / 最後輪次仍不同，請增加輪數、縮小請求視窗或人工檢查差異。";
  return { recommendedRequestWindow: requestWindow, recommendedRoundCount, recommendedExecutionMode: "stop_when_stable", firstStableRound: comparison.firstStableRound, stableRoundP50, stableRoundMax, roundUnionEventCount: comparison.roundUnionEventCount, roundIntersectionEventCount: comparison.roundIntersectionEventCount, variableEventCount: comparison.variableEventCount, consistencyRate: comparison.consistencyRate, unstableRoundCount: comparison.stability === "unstable" ? 1 : 0, coldStartAffectedRoundCount: rounds.filter((round) => round.coldStartSuspected).length, recommendationReason: reason };
}

function validateConfig(config: ActivityStreamStabilityConfigV2): void {
  if (!Number.isInteger(config.fullScanRoundCount) || config.fullScanRoundCount < 1 || config.fullScanRoundCount > 32) throw new Error("Full Scan Round Count must be an integer from 1 to 32.");
  if (![0, 1000, 2000, 3000, 5000].includes(config.delayBetweenRoundsMs)) throw new Error("Delay Between Rounds is invalid.");
}

export async function executeRoundFirstStability(config: ActivityStreamStabilityConfigV2, options: RoundExecutorOptions): Promise<ActivityStreamProbeRunV2> {
  validateConfig(config);
  const windows = splitActivityStreamWindows(config.dateRange.start, config.dateRange.end, config.requestWindow.type, config.requestWindow.customDays ?? 7);
  const totalRequests = windows.length * config.fullScanRoundCount;
  const startedAtMs = options.now?.() ?? Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const delay = options.delay ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const rounds: ActivityStreamRound[] = [];
  let completedRequests = 0;
  let totalApiDuration = 0;
  let totalProcessingDuration = 0;
  let completedPhysicalRequests = 0;
  let totalPhysicalHttpDuration = 0;
  const progress = (stage: RoundProgress["stage"], roundNumber: number, windowNumber: number, start = "", end = "", currentApiDurationMs = 0) => {
    const now = options.now?.() ?? Date.now();
    const elapsedMs = Math.max(0, now - startedAtMs);
    const averageRequestMs = completedRequests ? (totalApiDuration + totalProcessingDuration) / completedRequests : 0;
    const remaining = Math.max(0, totalRequests - completedRequests);
    const remainingRoundDelays = Math.max(0, config.fullScanRoundCount - roundNumber) * config.delayBetweenRoundsMs;
    const estimatedRemainingMs = Math.round(averageRequestMs * remaining + remainingRoundDelays);
    const comparison = compareCompletedRounds(rounds);
    options.onProgress?.({ probeRunId: options.probeRunId, stage, currentRound: roundNumber, totalRounds: config.fullScanRoundCount, currentWindow: windowNumber, totalWindows: windows.length, completedRequests, totalRequests, requestWindowStart: start, requestWindowEnd: end, currentApiDurationMs, averageApiDurationMs: completedRequests ? Math.round(totalApiDuration / completedRequests) : 0, averageLogicalFetchDurationMs: completedRequests ? Math.round(totalApiDuration / completedRequests) : 0, averagePhysicalHttpDurationMs: completedPhysicalRequests ? Math.round(totalPhysicalHttpDuration / completedPhysicalRequests) : 0, averageProcessingDurationMs: completedRequests ? Math.round(totalProcessingDuration / completedRequests) : 0, elapsedMs, estimatedRemainingMs, estimatedCompletionTime: new Date(now + estimatedRemainingMs).toISOString(), currentStability: comparison.stability, stableSinceRound: comparison.firstStableRound });
  };
  let cancelled = false;
  for (let roundIndex = 0; roundIndex < config.fullScanRoundCount; roundIndex += 1) {
    if (options.shouldCancel?.()) { cancelled = true; break; }
    const roundNumber = roundIndex + 1;
    const roundId = `${options.probeRunId}-round-${String(roundNumber).padStart(2, "0")}`;
    const roundStartedMs = options.now?.() ?? Date.now();
    progress("round_start", roundNumber, 0);
    const roundWindows: ActivityStreamRoundWindowResult[] = [];
    for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
      if (options.shouldCancel?.()) { cancelled = true; break; }
      const window = windows[windowIndex];
      const windowNumber = windowIndex + 1;
      const windowStartedMs = options.now?.() ?? Date.now();
      progress("window_start", roundNumber, windowNumber, window.start, window.end);
      let fetched: RoundWindowFetchResult;
      try {
        fetched = await options.fetchWindow({ roundNumber, roundId, windowNumber, windowId: window.windowId, start: window.start, end: window.end });
      } catch (error) {
        fetched = { httpStatus: "-", requestSucceeded: false, rawEventCount: 0, entries: [], apiDurationMs: Math.max(0, (options.now?.() ?? Date.now()) - windowStartedMs), errorType: "request_error", errorMessage: error instanceof Error ? error.message : String(error) };
      }
      const clock = () => options.now?.() ?? Date.now();
      const processingStarted = clock();
      const parseCompleted = clock();
      const normalized = fetched.entries.map(normalizeRoundEvent);
      const normalizationCompleted = clock();
      const normalizedEvents = Array.from(new Map(normalized.map((event) => [event.stableEventId, event])).values());
      const dedupCompleted = clock();
      const primary = unique(normalizedEvents.flatMap((event) => event.primaryJiraKeys));
      const referenced = unique(normalizedEvents.flatMap((event) => event.referencedJiraKeys));
      const all = unique(normalizedEvents.flatMap((event) => event.allJiraLikeKeys));
      const keyExtractionCompleted = clock();
      const previousWindow = rounds[rounds.length - 1]?.windows.find((item) => item.windowId === window.windowId);
      const currentIds = new Set(normalizedEvents.map((event) => event.stableEventId));
      const previousIds = new Set(previousWindow?.normalizedEvents.map((event) => event.stableEventId) ?? []);
      const fingerprintStarted = clock();
      const eventSetFingerprint = fingerprint([...currentIds]);
      const primaryJiraKeySetFingerprint = fingerprint(primary);
      const referencedJiraKeySetFingerprint = fingerprint(referenced);
      const fingerprintCompleted = clock();
      const comparisonStarted = clock();
      const newEvents = previousWindow ? setDiff(currentIds, previousIds) : currentIds.size;
      const missingEvents = previousWindow ? setDiff(previousIds, currentIds) : 0;
      const comparisonCompleted = clock();
      const assemblyStarted = clock();
      const completedAtMs = clock();
      const upstreamXmlParseMs = Math.max(0, fetched.processingDurationMs ?? 0);
      const localProcessingMs = Math.max(0, completedAtMs - processingStarted);
      const processingTiming: ProcessingTiming = { xmlParseMs: upstreamXmlParseMs + Math.max(0, parseCompleted - processingStarted), eventNormalizationMs: Math.max(0, normalizationCompleted - parseCompleted), jiraKeyExtractionMs: Math.max(0, keyExtractionCompleted - dedupCompleted), deduplicationMs: Math.max(0, dedupCompleted - normalizationCompleted), fingerprintMs: Math.max(0, fingerprintCompleted - fingerprintStarted), comparisonMs: Math.max(0, comparisonCompleted - comparisonStarted), resultAssemblyMs: Math.max(0, completedAtMs - assemblyStarted), totalProcessingMs: upstreamXmlParseMs + localProcessingMs };
      const physicalRequests = fetched.physicalRequests ?? [];
      const classification = fetched.classification ?? classifyActivityStreamResult({ httpStatus: fetched.httpStatus, atomEntryCount: fetched.rawEventCount, parsedEventCount: fetched.entries.length, responseBytes: physicalRequests.reduce((sum, item) => sum + item.responseBytes, 0), errorType: fetched.errorType });
      const logicalFetchDurationMs = fetched.logicalFetchDurationMs ?? fetched.apiDurationMs;
      const result: ActivityStreamRoundWindowResult = { roundId, roundNumber, windowId: window.windowId, windowNumber, windowCount: windows.length, requestWindowStart: window.start, requestWindowEnd: window.end, startedAt: new Date(windowStartedMs).toISOString(), completedAt: new Date(completedAtMs).toISOString(), status: fetched.requestSucceeded ? "completed" : "failed", httpStatus: fetched.httpStatus, requestSucceeded: fetched.requestSucceeded, classification, logicalRequestId: `${roundId}-${window.windowId}`, logicalFetchDurationMs, logicalWindowRequestCount: 1, physicalHttpRequestCount: physicalRequests.length || 1, paginationRequestCount: physicalRequests.filter((item) => item.pagination).length, retryRequestCount: physicalRequests.filter((item) => item.retry).length, physicalRequests, processingTiming, apiDurationMs: logicalFetchDurationMs, processingDurationMs: processingTiming.totalProcessingMs, totalRequestDurationMs: logicalFetchDurationMs + processingTiming.totalProcessingMs, rawEventCount: fetched.rawEventCount, normalizedEventCount: fetched.entries.length, uniqueEventCount: normalizedEvents.length, primaryJiraKeyCount: primary.length, referencedJiraKeyCount: referenced.length, allJiraLikeKeyCount: all.length, eventSetFingerprint, primaryJiraKeySetFingerprint, referencedJiraKeySetFingerprint, newEventsComparedWithPreviousRound: newEvents, missingEventsComparedWithPreviousRound: missingEvents, errorType: fetched.errorType ?? "", errorMessage: (fetched.errorMessage ?? "").slice(0, 300), normalizedEvents, rawResultSanitized: fetched.rawResultSanitized ?? {} };
      roundWindows.push(result);
      completedRequests += 1;
      totalApiDuration += logicalFetchDurationMs;
      totalProcessingDuration += processingTiming.totalProcessingMs;
      completedPhysicalRequests += physicalRequests.length || 1;
      totalPhysicalHttpDuration += physicalRequests.length ? physicalRequests.reduce((sum, item) => sum + item.httpDurationMs, 0) : logicalFetchDurationMs;
      progress("window_complete", roundNumber, windowNumber, window.start, window.end, logicalFetchDurationMs);
    }
    const normalizedEvents = Array.from(new Map(roundWindows.flatMap((window) => window.normalizedEvents).map((event) => [event.stableEventId, event])).values());
    const currentEventIds = new Set(normalizedEvents.map((event) => event.stableEventId));
    const primary = unique(normalizedEvents.flatMap((event) => event.primaryJiraKeys));
    const referenced = unique(normalizedEvents.flatMap((event) => event.referencedJiraKeys));
    const all = unique(normalizedEvents.flatMap((event) => event.allJiraLikeKeys));
    const completeBeforeCurrent = completedRounds(rounds);
    const previous = completeBeforeCurrent[completeBeforeCurrent.length - 1];
    const previousEvents = new Set(previous?.normalizedEvents.map((event) => event.stableEventId) ?? []);
    const previousPrimary = new Set(previous?.normalizedEvents.flatMap((event) => event.primaryJiraKeys) ?? []);
    const previousReferenced = new Set(previous?.normalizedEvents.flatMap((event) => event.referencedJiraKeys) ?? []);
    const currentPrimary = new Set(primary);
    const currentReferenced = new Set(referenced);
    const roundCompletedMs = options.now?.() ?? Date.now();
    const round: ActivityStreamRound = { roundId, roundNumber, totalRounds: config.fullScanRoundCount, startedAt: new Date(roundStartedMs).toISOString(), completedAt: new Date(roundCompletedMs).toISOString(), durationMs: Math.max(0, roundCompletedMs - roundStartedMs), status: cancelled ? "cancelled" : roundWindows.length === windows.length ? "completed" : "partial", windowCount: windows.length, completedWindowCount: roundWindows.length, rawEventCount: roundWindows.reduce((sum, item) => sum + item.rawEventCount, 0), normalizedEventCount: roundWindows.reduce((sum, item) => sum + item.normalizedEventCount, 0), uniqueEventCount: normalizedEvents.length, primaryJiraKeyCount: primary.length, referencedJiraKeyCount: referenced.length, allJiraLikeKeyCount: all.length, roundEventSetFingerprint: fingerprint([...currentEventIds]), roundPrimaryJiraKeySetFingerprint: fingerprint(primary), roundReferencedJiraKeySetFingerprint: fingerprint(referenced), newEventsComparedWithPreviousRound: previous ? setDiff(currentEventIds, previousEvents) : currentEventIds.size, missingEventsComparedWithPreviousRound: previous ? setDiff(previousEvents, currentEventIds) : 0, newPrimaryJiraKeysComparedWithPreviousRound: previous ? setDiff(currentPrimary, previousPrimary) : currentPrimary.size, missingPrimaryJiraKeysComparedWithPreviousRound: previous ? setDiff(previousPrimary, currentPrimary) : 0, newReferencedJiraKeysComparedWithPreviousRound: previous ? setDiff(currentReferenced, previousReferenced) : currentReferenced.size, missingReferencedJiraKeysComparedWithPreviousRound: previous ? setDiff(previousReferenced, currentReferenced) : 0, coldStartSuspected: roundNumber === 1 && options.coldStartSuspected, apiDurationMs: roundWindows.reduce((sum, item) => sum + item.apiDurationMs, 0), processingDurationMs: roundWindows.reduce((sum, item) => sum + item.processingDurationMs, 0), roundDelayMs: 0, windows: roundWindows, normalizedEvents };
    rounds.push(round);
    progress("round_complete", roundNumber, windows.length);
    if (cancelled) break;
    const comparison = compareCompletedRounds(rounds);
    if (config.roundExecutionMode === "stop_when_stable" && comparison.stability === "stable") break;
    if (roundNumber < config.fullScanRoundCount && config.delayBetweenRoundsMs > 0) {
      round.roundDelayMs = config.delayBetweenRoundsMs;
      progress("round_delay", roundNumber, windows.length);
      await delay(config.delayBetweenRoundsMs);
    }
  }
  const complete = completedRounds(rounds);
  const mergeSource = config.mergeStrategy === "last_stable" ? complete.slice(-1) : complete;
  const mergedEvents = Array.from(new Map(mergeSource.flatMap((round) => round.normalizedEvents).map((event) => [event.stableEventId, event])).values());
  const comparison = compareCompletedRounds(rounds);
  const completedAtMs = options.now?.() ?? Date.now();
  progress(cancelled ? "cancelled" : "completed", rounds[rounds.length - 1]?.roundNumber ?? 0, rounds[rounds.length - 1]?.completedWindowCount ?? 0);
  return { schemaVersion: "activity_stream_stability_probe_v2", executionOrder: "round_first", probeRunId: options.probeRunId, config, selectedUser: config.selectedUser, dateRange: config.dateRange, startedAt, completedAt: new Date(completedAtMs).toISOString(), status: cancelled ? "cancelled" : "completed", concurrency: 1, appSessionId: options.appSessionId, jiraConnectionSessionId: options.jiraConnectionSessionId, rounds, windowDiagnostics: rounds.flatMap((round) => round.windows), comparison, recommendation: recommendRounds(rounds, config.requestWindow.type), mergedEvents };
}

export function migrateLegacyStabilityRunV1(value: Record<string, unknown>): Record<string, unknown> {
  if (value.schemaVersion !== "activity_stream_stability_probe_v1") return value;
  return { schemaVersion: "activity_stream_stability_probe_v2_legacy_view", legacyExecutionOrder: "window_first", migrationStatus: "not_round_first", message: "Legacy v1 attempts remain window-first and were not converted into synthetic rounds. / 舊版 v1 為 Window-first，不會偽裝轉換成 Round-first。", source: value };
}
