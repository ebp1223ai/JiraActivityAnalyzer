import crypto from "node:crypto";

export type TimelineEligibilityStatus = "completed" | "partial" | "failed" | "cancelled";

export type TimelineRunEligibilityRecord = {
  timelineRunId: string;
  status: TimelineEligibilityStatus;
  selectedUser: string;
  dateRange: { start: string; end: string };
  serverIdentity: string;
  roundExecutionMode: string;
  mergeStrategy: string;
  expectedRoundCount: number;
  completedRoundCount: number;
  mergedEventCount: number;
  reconciliationStatus: string;
  canonicalCompleted: boolean;
  completedAt: string;
};

export type FullFetchBlockReason =
  | "TIMELINE_RUN_ID_MISSING"
  | "TIMELINE_RUN_NOT_FOUND"
  | "TIMELINE_RUN_MISMATCH"
  | "TIMELINE_RUN_PARTIAL"
  | "TIMELINE_RUN_FAILED"
  | "TIMELINE_RUN_CANCELLED"
  | "TIMELINE_RUN_INCOMPLETE";

export type FullFetchEligibility = {
  eligible: boolean;
  status: "eligible" | "blocked";
  reasonCode: "ELIGIBLE" | FullFetchBlockReason;
  reasonMessage: string;
  selectedTimelineRunId: string;
  queueTimelineRunId: string;
  timelineRun: TimelineRunEligibilityRecord | null;
  advancedProbeBlocking: false;
};

export type FullFetchAttempt = {
  attemptId: string;
  selectedTimelineRunId: string;
  queueTimelineRunId: string;
  selectedIssueKeys: string[];
  queueTotal: number;
  preflightStatus: "eligible" | "blocked";
  blockedAt: string;
  blockReasonCode: "" | FullFetchBlockReason;
  blockReasonMessage: string;
  fullFetchRunCreated: boolean;
  fullFetchRunId: string;
  stagingId: string;
  attemptStatus: "created" | "preflight_blocked" | "run_created" | "running" | "completed" | "partial" | "failed" | "cancelled" | "saved";
  stagingAvailable: boolean;
  stagingReference: { stagingId: string; fullFetchRunId: string; stagingDir: string } | null;
  countReconciliation: "NOT_RUN" | "PASSED" | "FAILED";
  issueKeyReconciliation: "NOT_RUN" | "MATCH" | "MISMATCH";
  saveEligible: boolean;
  completedAt: string;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function evaluateFullFetchEligibility(input: {
  selectedTimelineRunId?: string;
  queueTimelineRunId?: string;
  timelineRun?: TimelineRunEligibilityRecord | null;
}): FullFetchEligibility {
  const selectedTimelineRunId = String(input.selectedTimelineRunId ?? "").trim();
  const queueTimelineRunId = String(input.queueTimelineRunId ?? "").trim();
  const blocked = (reasonCode: FullFetchBlockReason, reasonMessage: string): FullFetchEligibility => ({
    eligible: false,
    status: "blocked",
    reasonCode,
    reasonMessage,
    selectedTimelineRunId,
    queueTimelineRunId,
    timelineRun: input.timelineRun ?? null,
    advancedProbeBlocking: false
  });

  if (!selectedTimelineRunId || !queueTimelineRunId) return blocked("TIMELINE_RUN_ID_MISSING", "Timeline Run ID is missing. Rebuild the Activity Timeline before Full Fetch.");
  if (selectedTimelineRunId !== queueTimelineRunId) return blocked("TIMELINE_RUN_MISMATCH", "The Fetch Queue belongs to a different Timeline Run. Rebuild or reselect the queue.");
  if (!input.timelineRun || input.timelineRun.timelineRunId !== selectedTimelineRunId) return blocked("TIMELINE_RUN_NOT_FOUND", "The selected Timeline Run is not available. Rebuild the Activity Timeline.");
  if (input.timelineRun.status === "partial") return blocked("TIMELINE_RUN_PARTIAL", "The selected Timeline Run is partial and cannot authorize Full Fetch.");
  if (input.timelineRun.status === "failed") return blocked("TIMELINE_RUN_FAILED", "The selected Timeline Run failed and cannot authorize Full Fetch.");
  if (input.timelineRun.status === "cancelled") return blocked("TIMELINE_RUN_CANCELLED", "The selected Timeline Run was cancelled and cannot authorize Full Fetch.");
  if (!input.timelineRun.canonicalCompleted) return blocked("TIMELINE_RUN_INCOMPLETE", "The selected Timeline Run did not complete its canonical rounds, merge, and reconciliation.");
  return {
    eligible: true,
    status: "eligible",
    reasonCode: "ELIGIBLE",
    reasonMessage: "The selected standard Timeline Run completed its canonical rounds, merge, and reconciliation.",
    selectedTimelineRunId,
    queueTimelineRunId,
    timelineRun: input.timelineRun,
    advancedProbeBlocking: false
  };
}

export function createFullFetchAttempt(input: {
  selectedTimelineRunId?: string;
  queueTimelineRunId?: string;
  selectedIssueKeys: string[];
  eligibility: FullFetchEligibility;
  now?: string;
  attemptId?: string;
}): FullFetchAttempt {
  const now = input.now ?? new Date().toISOString();
  const selectedIssueKeys = Array.from(new Set(input.selectedIssueKeys.map((key) => key.trim().toUpperCase()).filter(Boolean)));
  return {
    attemptId: input.attemptId ?? `full-fetch-attempt-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    selectedTimelineRunId: String(input.selectedTimelineRunId ?? ""),
    queueTimelineRunId: String(input.queueTimelineRunId ?? ""),
    selectedIssueKeys,
    queueTotal: selectedIssueKeys.length,
    preflightStatus: input.eligibility.status,
    blockedAt: input.eligibility.eligible ? "" : now,
    blockReasonCode: input.eligibility.eligible ? "" : input.eligibility.reasonCode as FullFetchBlockReason,
    blockReasonMessage: input.eligibility.eligible ? "" : input.eligibility.reasonMessage,
    fullFetchRunCreated: false,
    fullFetchRunId: "",
    stagingId: "",
    attemptStatus: input.eligibility.eligible ? "created" : "preflight_blocked",
    stagingAvailable: false,
    stagingReference: null,
    countReconciliation: "NOT_RUN",
    issueKeyReconciliation: "NOT_RUN",
    saveEligible: false,
    completedAt: "",
    savedAt: "",
    createdAt: now,
    updatedAt: now
  };
}

export function blockedFullFetchResponse(attempt: FullFetchAttempt, eligibility: FullFetchEligibility) {
  return {
    ok: false,
    status: "PRE_FLIGHT_BLOCKED" as const,
    preflight: { ok: false, ...eligibility, status: "PRE_FLIGHT_BLOCKED" as const },
    attempt,
    run: null,
    stagingSummary: null,
    summary: {
      queueTotal: attempt.queueTotal,
      totalIssues: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      countReconciliation: "NOT_RUN" as const,
      issueKeyReconciliation: "NOT_RUN" as const,
      countReconciliationPassed: false,
      fullFetchRunCreated: false
    },
    logs: [
      `[WARN] Full Fetch preflight blocked: ${eligibility.reasonCode}`,
      `[INFO] Queue preserved: ${attempt.queueTotal} issue(s)`,
      "[INFO] No Full Fetch run or staging was created."
    ],
    errors: [eligibility.reasonMessage],
    warnings: [] as string[]
  };
}
