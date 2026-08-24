import type { AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";
import { convergeTerminalLifecycleV0332, persistTerminalLifecycleV0332 } from "./analysisLifecycleV0332.js";
import type { TerminalLifecycleInputV0331 } from "./analysisLifecycleV0331.js";

export type TerminalStateV0333 = TerminalLifecycleInputV0331["terminalState"] | "completed_with_report_error";

export function convergeTerminalLifecycleV0333(current: AnalysisLifecycleSummary, input: Omit<TerminalLifecycleInputV0331, "terminalState"> & {
  terminalState: TerminalStateV0333;
  rootErrorStage?: string | null;
  terminalAtUtc?: string;
}) {
  const completed = input.terminalState === "completed" || input.terminalState === "completed_with_warnings" || input.terminalState === "completed_with_report_error";
  const normalized = {
    ...input,
    terminalState: input.terminalState === "completed_with_report_error" ? "completed_with_warnings" as const : input.terminalState,
    rootErrorCode: completed ? null : input.rootErrorCode,
    firstFailedValidationStage: completed ? null : input.firstFailedValidationStage,
    rootErrorStage: completed ? null : input.rootErrorStage
  };
  const lifecycle = convergeTerminalLifecycleV0332(current, normalized);
  const overallStatus: AnalysisLifecycleSummary["overallStatus"] = input.terminalState === "completed_with_report_error" ? "completed_with_report_error"
    : input.terminalState === "completed_with_warnings" ? "completed_with_warnings"
      : input.terminalState === "completed_with_persistence_error" ? "completed_with_persistence_error"
        : input.terminalState === "completed" ? "completed"
          : input.terminalState === "interrupted" ? "interrupted" : "failed";
  return {
    ...lifecycle,
    terminalState: input.terminalState,
    overallStatus,
    firstFailedStage: completed ? null : lifecycle.firstFailedStage,
    firstFailedValidationStage: completed ? null : lifecycle.firstFailedValidationStage,
    rootErrorCode: completed ? null : lifecycle.rootErrorCode,
    rootErrorStage: completed ? null : lifecycle.rootErrorStage,
    rootErrorMessage: completed ? null : lifecycle.rootErrorMessage,
    duplicateProgressEventsIgnored: true
  };
}

export function persistTerminalLifecycleV0333(directory: string, lifecycle: ReturnType<typeof convergeTerminalLifecycleV0333>) {
  return persistTerminalLifecycleV0332(directory, lifecycle as never);
}
