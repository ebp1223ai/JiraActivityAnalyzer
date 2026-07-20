import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sanitizeExportData } from "./export/sanitizeExport.js";

export type BaselineClassification =
  | "first_observation"
  | "accepted_equal"
  | "accepted_improved"
  | "stability_probe_merged"
  | "suspicious_count_regression"
  | "suspicious_known_issue_keys_missing"
  | "suspicious_known_entries_missing"
  | "suspicious_mixed_regression";

export type BaselineEntry = {
  entryFingerprint: string;
  activityTime: string;
  activityAuthorEmail: string;
  activityType: string;
  issueKey: string;
  activityTitle: string;
};

export type BaselineObservation = {
  runId: string;
  observedAt: string;
  source: "activity_stream";
  selectedUser: string;
  queryUser: string;
  queryUserEncoded: string;
  variant: string;
  dateQueryMode: string;
  periodStart: string;
  periodEndExclusive: string;
  granularity: "exact_range";
  requestSignatureHash: string;
  atomEntryCount: number;
  parsedActivityCount: number;
  issueKeys: string[];
  entries: BaselineEntry[];
};

export type BaselineHistoryEntry = {
  runId: string;
  observedAt: string;
  atomEntryCount: number;
  parsedActivityCount: number;
  issueKeyCount: number;
  entryFingerprintCount: number;
  classification: BaselineClassification;
};

export type ActivityStreamBaselineSnapshot = {
  schemaVersion: 1;
  snapshotKey: string;
  source: "activity_stream";
  selectedUser: string;
  queryUser: string;
  queryUserEncoded: string;
  variant: string;
  dateQueryMode: string;
  periodStart: string;
  periodEndExclusive: string;
  granularity: "exact_range";
  requestSignatureHash: string;
  bestRunId: string;
  bestObservedAt: string;
  bestAtomEntryCount: number;
  bestParsedActivityCount: number;
  bestIssueKeyCount: number;
  bestEntryFingerprintCount: number;
  knownIssueKeys: string[];
  knownEntryFingerprints: string[];
  entrySummaries: Array<{
    fingerprint: string;
    activityTime: string;
    activityAuthorEmail: string;
    activityType: string;
    issueKey: string;
    titleText: string;
    firstSeenRunId: string;
    lastSeenRunId: string;
    seenCount: number;
  }>;
  baselineHistory: BaselineHistoryEntry[];
  lowConfidenceObservations: Array<{
    runId: string;
    observedAt: string;
    reason: "below_baseline";
    classification: BaselineClassification;
    missingIssueKeys: string[];
    missingEntryCount: number;
  }>;
};

export type ActivityStreamBaselineComparison = {
  enabled: true;
  baselineFound: boolean;
  snapshotKey: string;
  classification: BaselineClassification;
  confidence: "normal" | "high";
  shouldRetry: boolean;
  retryReason: string;
  baselineCounts: {
    bestAtomEntryCount: number;
    bestParsedActivityCount: number;
    bestIssueKeyCount: number;
    bestEntryFingerprintCount: number;
  };
  currentCounts: {
    atomEntryCount: number;
    parsedActivityCount: number;
    issueKeyCount: number;
    entryFingerprintCount: number;
  };
  missingIssueKeys: string[];
  missingEntryFingerprints: string[];
  newIssueKeys: string[];
  newEntryFingerprints: string[];
  baselineUpdated: boolean;
  baselineUpdateReason: string;
  baselinePath: string;
};

export function sha256(value: string) {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function entryFingerprint(values: { entryId?: string; source?: string; activityTime?: string; activityAuthorEmail?: string; activityTitle?: string; issueKey?: string; firstLinkHref?: string }) {
  const entryId = String(values.entryId || "").trim();
  const parts = entryId
    ? [values.source || "activity_stream", "atom_id", entryId]
    : [values.source || "activity_stream", values.activityTime || "", String(values.activityAuthorEmail || "").toLowerCase(), String(values.activityTitle || "").toLowerCase().replace(/\s+/g, " ").trim(), values.issueKey || "", values.firstLinkHref || ""];
  return sha256(parts.join("|"));
}

export function baselineSnapshotKey(observation: Pick<BaselineObservation, "source" | "selectedUser" | "queryUser" | "variant" | "dateQueryMode" | "periodStart" | "periodEndExclusive" | "granularity" | "requestSignatureHash">) {
  return [observation.source, observation.selectedUser, observation.queryUser, observation.variant, observation.dateQueryMode, observation.periodStart, observation.periodEndExclusive, observation.granularity, observation.requestSignatureHash].join("|");
}

export function baselineFileName(observation: BaselineObservation) {
  const safeUser = observation.selectedUser.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "unknown";
  const shortHash = observation.requestSignatureHash.replace(/^sha256:/, "").slice(0, 12);
  return `activity-stream-baseline_${safeUser}_${observation.periodStart}_${observation.periodEndExclusive}_${shortHash}.json`;
}

function counts(snapshot: ActivityStreamBaselineSnapshot | null) {
  return {
    bestAtomEntryCount: snapshot?.bestAtomEntryCount ?? 0,
    bestParsedActivityCount: snapshot?.bestParsedActivityCount ?? 0,
    bestIssueKeyCount: snapshot?.bestIssueKeyCount ?? 0,
    bestEntryFingerprintCount: snapshot?.bestEntryFingerprintCount ?? 0
  };
}

function historyEntry(observation: BaselineObservation, classification: BaselineClassification): BaselineHistoryEntry {
  return { runId: observation.runId, observedAt: observation.observedAt, atomEntryCount: observation.atomEntryCount, parsedActivityCount: observation.parsedActivityCount, issueKeyCount: observation.issueKeys.length, entryFingerprintCount: observation.entries.length, classification };
}

function createSnapshot(observation: BaselineObservation, classification: BaselineClassification): ActivityStreamBaselineSnapshot {
  return {
    schemaVersion: 1,
    snapshotKey: baselineSnapshotKey(observation),
    source: observation.source,
    selectedUser: observation.selectedUser,
    queryUser: observation.queryUser,
    queryUserEncoded: observation.queryUserEncoded,
    variant: observation.variant,
    dateQueryMode: observation.dateQueryMode,
    periodStart: observation.periodStart,
    periodEndExclusive: observation.periodEndExclusive,
    granularity: observation.granularity,
    requestSignatureHash: observation.requestSignatureHash,
    bestRunId: observation.runId,
    bestObservedAt: observation.observedAt,
    bestAtomEntryCount: observation.atomEntryCount,
    bestParsedActivityCount: observation.parsedActivityCount,
    bestIssueKeyCount: observation.issueKeys.length,
    bestEntryFingerprintCount: observation.entries.length,
    knownIssueKeys: [...new Set(observation.issueKeys)].sort(),
    knownEntryFingerprints: [...new Set(observation.entries.map((entry) => entry.entryFingerprint))].sort(),
    entrySummaries: observation.entries.map((entry) => ({ fingerprint: entry.entryFingerprint, activityTime: entry.activityTime, activityAuthorEmail: entry.activityAuthorEmail, activityType: entry.activityType, issueKey: entry.issueKey, titleText: entry.activityTitle.slice(0, 500), firstSeenRunId: observation.runId, lastSeenRunId: observation.runId, seenCount: 1 })),
    baselineHistory: [historyEntry(observation, classification)],
    lowConfidenceObservations: []
  };
}

export function compareBaselineObservation(baseline: ActivityStreamBaselineSnapshot | null, observation: BaselineObservation, baselinePath: string) {
  const snapshotKey = baselineSnapshotKey(observation);
  const currentIssueKeys = [...new Set(observation.issueKeys)].sort();
  const currentFingerprints = [...new Set(observation.entries.map((entry) => entry.entryFingerprint))].sort();
  if (!baseline) {
    const snapshot = createSnapshot(observation, "first_observation");
    const comparison: ActivityStreamBaselineComparison = { enabled: true, baselineFound: false, snapshotKey, classification: "first_observation", confidence: "normal", shouldRetry: false, retryReason: "", baselineCounts: counts(null), currentCounts: { atomEntryCount: observation.atomEntryCount, parsedActivityCount: observation.parsedActivityCount, issueKeyCount: currentIssueKeys.length, entryFingerprintCount: currentFingerprints.length }, missingIssueKeys: [], missingEntryFingerprints: [], newIssueKeys: currentIssueKeys, newEntryFingerprints: currentFingerprints, baselineUpdated: true, baselineUpdateReason: "first_observation", baselinePath };
    return { comparison, snapshot };
  }

  const baselineIssueKeys = new Set(baseline.knownIssueKeys);
  const baselineFingerprints = new Set(baseline.knownEntryFingerprints);
  const currentIssueSet = new Set(currentIssueKeys);
  const currentFingerprintSet = new Set(currentFingerprints);
  const missingIssueKeys = baseline.knownIssueKeys.filter((key) => !currentIssueSet.has(key));
  const missingEntryFingerprints = baseline.knownEntryFingerprints.filter((fingerprint) => !currentFingerprintSet.has(fingerprint));
  const newIssueKeys = currentIssueKeys.filter((key) => !baselineIssueKeys.has(key));
  const newEntryFingerprints = currentFingerprints.filter((fingerprint) => !baselineFingerprints.has(fingerprint));
  const countLoss = baseline.bestParsedActivityCount - observation.parsedActivityCount;
  const countRegression = countLoss > 0 && (countLoss > 5 || countLoss / Math.max(1, baseline.bestParsedActivityCount) > 0.2);
  const keysMissing = missingIssueKeys.length > 0;
  const entriesMissing = missingEntryFingerprints.length > 0;
  let classification: BaselineClassification;
  if (countRegression && keysMissing && entriesMissing) classification = "suspicious_mixed_regression";
  else if (keysMissing) classification = "suspicious_known_issue_keys_missing";
  else if (entriesMissing) classification = "suspicious_known_entries_missing";
  else if (countRegression) classification = "suspicious_count_regression";
  else if (newIssueKeys.length > 0 || newEntryFingerprints.length > 0 || observation.parsedActivityCount > baseline.bestParsedActivityCount) classification = "accepted_improved";
  else classification = "accepted_equal";
  const shouldRetry = classification.startsWith("suspicious_");
  const baselineUpdated = classification === "accepted_improved";
  const comparison: ActivityStreamBaselineComparison = { enabled: true, baselineFound: true, snapshotKey, classification, confidence: classification === "suspicious_mixed_regression" ? "high" : "normal", shouldRetry, retryReason: shouldRetry ? classification : "", baselineCounts: counts(baseline), currentCounts: { atomEntryCount: observation.atomEntryCount, parsedActivityCount: observation.parsedActivityCount, issueKeyCount: currentIssueKeys.length, entryFingerprintCount: currentFingerprints.length }, missingIssueKeys, missingEntryFingerprints, newIssueKeys, newEntryFingerprints, baselineUpdated, baselineUpdateReason: baselineUpdated ? "current_result_contains_new_entries" : "", baselinePath };

  const snapshot: ActivityStreamBaselineSnapshot = JSON.parse(JSON.stringify(baseline)) as ActivityStreamBaselineSnapshot;
  snapshot.baselineHistory = [...snapshot.baselineHistory, historyEntry(observation, classification)].slice(-100);
  if (shouldRetry) {
    snapshot.lowConfidenceObservations = [...snapshot.lowConfidenceObservations, { runId: observation.runId, observedAt: observation.observedAt, reason: "below_baseline" as const, classification, missingIssueKeys, missingEntryCount: missingEntryFingerprints.length }].slice(-50);
  } else {
    const summaries = new Map(snapshot.entrySummaries.map((entry) => [entry.fingerprint, entry]));
    for (const entry of observation.entries) {
      const existing = summaries.get(entry.entryFingerprint);
      if (existing) {
        existing.lastSeenRunId = observation.runId;
        existing.seenCount += 1;
      } else {
        summaries.set(entry.entryFingerprint, { fingerprint: entry.entryFingerprint, activityTime: entry.activityTime, activityAuthorEmail: entry.activityAuthorEmail, activityType: entry.activityType, issueKey: entry.issueKey, titleText: entry.activityTitle.slice(0, 500), firstSeenRunId: observation.runId, lastSeenRunId: observation.runId, seenCount: 1 });
      }
    }
    snapshot.entrySummaries = Array.from(summaries.values());
    snapshot.knownIssueKeys = [...new Set([...snapshot.knownIssueKeys, ...currentIssueKeys])].sort();
    snapshot.knownEntryFingerprints = [...new Set([...snapshot.knownEntryFingerprints, ...currentFingerprints])].sort();
    snapshot.bestIssueKeyCount = snapshot.knownIssueKeys.length;
    snapshot.bestEntryFingerprintCount = snapshot.knownEntryFingerprints.length;
    if (baselineUpdated) {
      snapshot.bestRunId = observation.runId;
      snapshot.bestObservedAt = observation.observedAt;
      snapshot.bestAtomEntryCount = Math.max(snapshot.bestAtomEntryCount, observation.atomEntryCount);
      snapshot.bestParsedActivityCount = Math.max(snapshot.bestParsedActivityCount, observation.parsedActivityCount);
    }
  }
  return { comparison, snapshot };
}

export function loadBaselineSnapshot(filePath: string): ActivityStreamBaselineSnapshot | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ActivityStreamBaselineSnapshot;
    return parsed?.schemaVersion === 1 && typeof parsed.snapshotKey === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBaselineSnapshot(filePath: string, snapshot: ActivityStreamBaselineSnapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitizeExportData(snapshot), null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

export function selectBaselineGuardOutcome(attempts: Array<{ shouldRetry: boolean; parsedActivityCount: number; issueKeyCount: number }>) {
  const firstWasRegression = attempts[0]?.shouldRetry === true;
  const recoveredIndex = firstWasRegression ? attempts.findIndex((attempt, index) => index > 0 && !attempt.shouldRetry) : -1;
  const selectedIndex = recoveredIndex >= 0
    ? recoveredIndex
    : attempts.map((attempt, index) => ({ ...attempt, index })).sort((left, right) => right.parsedActivityCount - left.parsedActivityCount || right.issueKeyCount - left.issueKeyCount)[0]?.index ?? 0;
  return { selectedIndex, retryRecovered: recoveredIndex >= 0, resultIncompleteCandidate: firstWasRegression && recoveredIndex < 0 };
}
