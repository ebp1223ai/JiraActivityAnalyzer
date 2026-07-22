export type CanonicalIssueStatus = "eligible" | "partial" | "failed_final" | "not_attempted_due_to_run_failure";
export type CanonicalRunStatus = "completed" | "completed_with_partial" | "completed_with_errors" | "failed";

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
