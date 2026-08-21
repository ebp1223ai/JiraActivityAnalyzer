import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AnalysisLifecycleSummary } from "../shared/analysisBridgeContract.js";

export const ANALYSIS_LIFECYCLE_VERSION_V0331 = "jaa-analysis-lifecycle-v1" as const;
export type TerminalStateV0331 = "completed" | "completed_with_warnings" | "completed_with_persistence_error" | "failed" | "cancelled" | "timed_out" | "interrupted";

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "terminalSnapshotHash").sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`
    : JSON.stringify(value);

export type TerminalLifecycleInputV0331 = {
  terminalState: TerminalStateV0331;
  rootErrorCode: string | null;
  artifactReceived: boolean;
  artifactAccepted: boolean;
  validationStarted: boolean;
  validationPassed: boolean;
  firstFailedValidationStage: string | null;
  canonicalCreated: boolean;
  analyzedResultCreated: boolean;
  activeResultChanged: boolean;
  formalReportPackageCreated: boolean;
  formalHtmlCreated: boolean;
  diagnosticReportPackageCreated: boolean;
  diagnosticHtmlCreated: boolean;
  sqliteStatus: AnalysisLifecycleSummary["sqliteStatus"];
  updatedAtUtc?: string;
};

export function convergeTerminalLifecycleV0331(current: AnalysisLifecycleSummary, input: TerminalLifecycleInputV0331) {
  const artifactStatus: AnalysisLifecycleSummary["artifactStatus"] = input.artifactAccepted ? "accepted" : input.artifactReceived ? "rejected" : current.artifactStatus;
  const validationStatus: AnalysisLifecycleSummary["validationStatus"] = input.validationPassed ? "passed" : input.validationStarted ? "failed" : "not_started";
  const snapshot = {
    ...current,
    schemaVersion: ANALYSIS_LIFECYCLE_VERSION_V0331,
    artifactStatus,
    artifactAttemptStatus: input.artifactReceived ? "received" as const : "not_started" as const,
    validationStatus,
    firstFailedValidationStage: input.firstFailedValidationStage,
    canonicalStatus: input.canonicalCreated ? "created" as const : "not_created" as const,
    analyzedResultStatus: input.analyzedResultCreated ? "created" as const : "not_created" as const,
    activeResultStatus: input.activeResultChanged ? "changed" as const : "unchanged" as const,
    formalReportPackageStatus: input.formalReportPackageCreated ? "created" as const : "not_created" as const,
    formalHtmlStatus: input.formalHtmlCreated ? "created" as const : "not_started" as const,
    diagnosticReportPackageStatus: input.diagnosticReportPackageCreated ? "created" as const : "not_created" as const,
    diagnosticHtmlStatus: input.diagnosticHtmlCreated ? "created" as const : "not_created" as const,
    sqliteStatus: input.sqliteStatus,
    overallStatus: input.terminalState === "cancelled" || input.terminalState === "timed_out" || input.terminalState === "interrupted" ? "interrupted" as const : input.terminalState,
    terminalState: input.terminalState,
    terminalIdempotencyKey: `${current.runId}:${input.terminalState}:${input.rootErrorCode ?? "none"}`,
    rootErrorCode: input.rootErrorCode,
    updatedAtUtc: input.updatedAtUtc ?? new Date().toISOString()
  };
  return { ...snapshot, terminalSnapshotHash: sha256(stable(snapshot)) };
}

export function persistTerminalLifecycleSnapshotV0331(runDirectory: string, lifecycle: ReturnType<typeof convergeTerminalLifecycleV0331>) {
  const body = JSON.stringify(lifecycle, null, 2) + "\n";
  for (const relative of ["progress/lifecycle-summary.json", "debug/lifecycle-summary.json"]) {
    const target = path.join(runDirectory, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body, "utf8");
  }
  return lifecycle.terminalSnapshotHash;
}

export function firstFailedValidationStageV0331(runDirectory: string) {
  const directory = path.join(runDirectory, "validation-stage-receipts");
  if (!fs.existsSync(directory)) return null;
  for (const name of fs.readdirSync(directory).sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const receipt = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
      if (String(receipt.status ?? receipt.result ?? "").toLowerCase() === "failed" || receipt.passed === false || receipt.valid === false) return String(receipt.stage ?? name.replace(/^\d+-?/, "").replace(/\.json$/, "")).toUpperCase();
    } catch { /* The validator owns malformed receipt handling. */ }
  }
  return null;
}
