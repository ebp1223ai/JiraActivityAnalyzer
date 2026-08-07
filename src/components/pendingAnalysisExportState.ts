import type { PendingAnalysisProgress } from "../../shared/pendingAnalysisContract";

const activeStatuses = new Set<PendingAnalysisProgress["status"]>(["preparing", "filtering", "writing", "finalizing"]);
let rendererStartClaimed = false;

export function isPendingAnalysisActive(progress: PendingAnalysisProgress | null) {
  return Boolean(progress && activeStatuses.has(progress.status));
}

export function claimPendingAnalysisRendererStart() {
  if (rendererStartClaimed) return false;
  rendererStartClaimed = true;
  return true;
}

export function releasePendingAnalysisRendererStart() {
  rendererStartClaimed = false;
}

export function shouldAcceptPendingAnalysisProgress(activeRunId: string, incoming: PendingAnalysisProgress) {
  return !activeRunId || activeRunId === incoming.exportId;
}

export function isPendingAnalysisTerminal(progress: PendingAnalysisProgress) {
  return progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled";
}
