import type { ActivityStreamBaselineComparison } from "./activityStreamBaseline.js";

export type StabilityOutcome = "stable_initial" | "stable_after_retry" | "unstable_usable" | "unstable_blocked" | "not_evaluated";

export type StabilityGateInput = {
  comparison?: ActivityStreamBaselineComparison | null;
  retryRecovered?: boolean;
  evaluationCompleted?: boolean;
  allRoundsCompleted?: boolean;
  requestFailureCount?: number;
  reconciliationPassed?: boolean;
  fingerprintConsistent?: boolean;
  userContinueDecision?: { accepted: boolean; decidedAt: string } | null;
};

export type StabilityGateDecision = {
  outcome: StabilityOutcome;
  evaluatedAt: string;
  reasonCodes: string[];
  formalDatabaseWriteAllowed: boolean;
  workflowAllowed: boolean;
  fetchQueueAllowed: boolean;
  requiresExplicitContinue: boolean;
  comparisonSummary: {
    classification: string;
    missingIssueKeyCount: number;
    missingEntryCount: number;
    missingEntryRatio: number;
  };
  userContinueDecision: StabilityGateInput["userContinueDecision"];
};

const STABLE_CLASSIFICATIONS = new Set(["first_observation", "accepted_equal", "accepted_improved", "stability_probe_merged"]);

export function evaluateStabilityGate(input: StabilityGateInput): StabilityGateDecision {
  const comparison = input.comparison ?? null;
  const missingIssueKeyCount = comparison?.missingIssueKeys.length ?? 0;
  const missingEntryCount = comparison?.missingEntryFingerprints.length ?? 0;
  const baselineEntryCount = comparison?.baselineCounts.bestEntryFingerprintCount ?? 0;
  const missingEntryRatio = baselineEntryCount > 0 ? missingEntryCount / baselineEntryCount : 0;
  const summary = {
    classification: comparison?.classification ?? "not_evaluated",
    missingIssueKeyCount,
    missingEntryCount,
    missingEntryRatio
  };
  const base = {
    evaluatedAt: new Date().toISOString(),
    comparisonSummary: summary,
    userContinueDecision: input.userContinueDecision ?? null
  };
  if (!comparison || input.evaluationCompleted === false) {
    return { ...base, outcome: "not_evaluated", reasonCodes: ["stability_not_evaluated"], formalDatabaseWriteAllowed: false, workflowAllowed: false, fetchQueueAllowed: false, requiresExplicitContinue: false };
  }
  if (input.retryRecovered) {
    return { ...base, outcome: "stable_after_retry", reasonCodes: ["retry_recovered"], formalDatabaseWriteAllowed: true, workflowAllowed: true, fetchQueueAllowed: true, requiresExplicitContinue: false };
  }
  if (STABLE_CLASSIFICATIONS.has(comparison.classification)) {
    return { ...base, outcome: "stable_initial", reasonCodes: [comparison.classification], formalDatabaseWriteAllowed: true, workflowAllowed: true, fetchQueueAllowed: true, requiresExplicitContinue: false };
  }

  const operationallyComplete = input.allRoundsCompleted === true
    && (input.requestFailureCount ?? 0) === 0
    && input.reconciliationPassed === true
    && input.fingerprintConsistent === true;
  const withinConservativeDifference = missingIssueKeyCount <= 1 && missingEntryCount <= 5 && missingEntryRatio <= 0.05;
  const explicitContinue = input.userContinueDecision?.accepted === true && Boolean(input.userContinueDecision.decidedAt);
  if (operationallyComplete && withinConservativeDifference && explicitContinue) {
    return { ...base, outcome: "unstable_usable", reasonCodes: [comparison.classification, "explicit_user_continue"], formalDatabaseWriteAllowed: false, workflowAllowed: true, fetchQueueAllowed: true, requiresExplicitContinue: true };
  }
  return {
    ...base,
    outcome: "unstable_blocked",
    reasonCodes: [comparison.classification, operationallyComplete ? "difference_exceeds_conservative_threshold" : "run_incomplete_or_inconsistent", ...(explicitContinue ? [] : ["explicit_continue_required"])],
    formalDatabaseWriteAllowed: false,
    workflowAllowed: false,
    fetchQueueAllowed: false,
    requiresExplicitContinue: true
  };
}

export function assertFormalDatabaseWriteAllowed(decision: StabilityGateDecision) {
  if (decision.formalDatabaseWriteAllowed) return;
  const error = new Error(`Formal database write blocked by stability gate: ${decision.outcome}`) as Error & { code?: string; decision?: StabilityGateDecision };
  error.code = "STABILITY_GATE_DATABASE_WRITE_BLOCKED";
  error.decision = decision;
  throw error;
}