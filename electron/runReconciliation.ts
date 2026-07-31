export type RunReference = { runId: string; parentRunId?: string; status?: string; count?: number | null };
export type RunChain = { activityStream?: RunReference | null; timeline?: RunReference | null; fullFetch?: RunReference | null; databaseSave?: RunReference | null };

export function reconcileRunChain(chain: RunChain) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ordered = [chain.activityStream, chain.timeline, chain.fullFetch, chain.databaseSave].filter(Boolean) as RunReference[];
  for (const run of ordered) {
    if (!run.runId) errors.push("run_id_missing");
    if (run.count !== undefined && run.count !== null && (!Number.isFinite(run.count) || run.count < 0)) errors.push(`invalid_count:${run.runId || "unknown"}`);
  }
  const checkParent = (child: RunReference | null | undefined, parent: RunReference | null | undefined, label: string) => {
    if (!child || !parent) return;
    if (!child.parentRunId) warnings.push(`${label}_parent_unavailable`);
    else if (child.parentRunId !== parent.runId) errors.push(`${label}_parent_mismatch`);
  };
  checkParent(chain.timeline, chain.activityStream, "timeline");
  checkParent(chain.fullFetch, chain.timeline, "full_fetch");
  checkParent(chain.databaseSave, chain.fullFetch, "database_save");
  return { status: errors.length ? "failed" as const : warnings.length ? "passed_with_unavailable_links" as const : "passed" as const, errors, warnings };
}