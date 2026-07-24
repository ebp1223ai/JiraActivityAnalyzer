export type CanonicalIssueStatus = "eligible" | "partial" | "failed_final" | "not_attempted_due_to_run_failure";
export type CanonicalRunStatus = "completed" | "completed_with_partial" | "completed_with_errors" | "failed";

export type FullFetchReconciliationInput = {
  queueTotal: number;
  eligible: number;
  excluded: number;
  invalid: number;
  planned: number;
  attempted: number;
  completed: number;
  partial: number;
  failed: number;
  notAttempted: number;
};

export function reconcileFullFetchCounts(input: FullFetchReconciliationInput) {
  const checks = [
    { code: "QUEUE_TOTAL_MISMATCH", formula: "queueTotal = eligible + excluded + invalid", expected: input.eligible + input.excluded + input.invalid, actual: input.queueTotal },
    { code: "PLANNED_ELIGIBLE_MISMATCH", formula: "planned = eligible", expected: input.eligible, actual: input.planned },
    { code: "ELIGIBLE_ATTEMPT_MISMATCH", formula: "eligible = attempted + notAttempted", expected: input.attempted + input.notAttempted, actual: input.eligible },
    { code: "ATTEMPT_OUTCOME_MISMATCH", formula: "attempted = completed + partial + failed", expected: input.completed + input.partial + input.failed, actual: input.attempted }
  ].map((check) => ({ ...check, passed: check.expected === check.actual }));
  return {
    ...input,
    countReconciliationPassed: checks.every((check) => check.passed),
    checks,
    errors: checks.filter((check) => !check.passed)
  };
}

export function canonicalIssueStatus(status: string): CanonicalIssueStatus | null {
  if (status === "eligible") return "eligible";
  if (status === "partial" || status === "required_partial") return "partial";
  if (status === "failed_final" || status === "failed_issue") return "failed_final";
  if (status === "not_attempted_due_to_run_failure") return status;
  return null;
}

export function aggregateFullFetchStatus(statuses: string[], runFailed = false) {
  const counts = { total: 0, completed: 0, eligible: 0, partial: 0, failed: 0, notAttempted: 0 };
  for (const value of statuses) {
    const status = canonicalIssueStatus(value);
    if (!status) continue;
    counts.total += 1;
    if (status !== "not_attempted_due_to_run_failure") counts.completed += 1;
    if (status === "eligible") counts.eligible += 1;
    if (status === "partial") counts.partial += 1;
    if (status === "failed_final") counts.failed += 1;
    if (status === "not_attempted_due_to_run_failure") counts.notAttempted += 1;
  }
  const status: CanonicalRunStatus = runFailed || counts.notAttempted > 0
    ? "failed"
    : counts.failed > 0
      ? "completed_with_errors"
      : counts.partial > 0
        ? "completed_with_partial"
        : "completed";
  return {
    ...counts,
    status,
    archiveEligible: counts.total > 0 && counts.eligible === counts.total && counts.partial === 0 && counts.failed === 0 && counts.notAttempted === 0,
    invariantsValid: counts.total === counts.eligible + counts.partial + counts.failed + counts.notAttempted
      && counts.completed === counts.eligible + counts.partial + counts.failed
  };
}
