import path from "node:path";
import type { PendingAnalysisIntegrityReason, PendingAnalysisProgress, PendingAnalysisSourceView } from "../shared/pendingAnalysisContract.js";

export type PendingAnalysisDiagnosticEvent =
  | "pending_analysis_export_started"
  | "pending_analysis_export_progress"
  | "pending_analysis_export_completed"
  | "pending_analysis_export_failed"
  | "pending_analysis_export_cancelled";

export type PendingAnalysisDiagnosticSnapshot = {
  runId: string;
  sourceView: PendingAnalysisSourceView;
  filterSnapshotHash: string;
  totalRecords: number;
  processedRecords: number;
  serializedRecords: number;
  writtenRecords: number;
  stage: PendingAnalysisProgress["stage"];
  elapsedMs: number;
  publicReason?: string;
  internalReason?: string;
  integrityReason?: PendingAnalysisIntegrityReason;
  offendingJsonPath?: string;
  outputFileName?: string;
};

type DiagnosticWriter = (event: PendingAnalysisDiagnosticEvent, details: Record<string, unknown>) => void;

const publicReasons: Record<string, string> = {
  NO_FILTERED_RECORDS: "No filtered records are available.",
  SOURCE_DATABASE_NOT_READY: "The source database is not ready.",
  SOURCE_DATABASE_CHANGED: "The source database changed during export.",
  FILTER_SNAPSHOT_INVALID: "The frozen filter snapshot is invalid.",
  COUNT_EXPORT_MISMATCH: "The frozen and processed record counts do not match.",
  SOURCE_IDENTITY_INCOMPLETE: "The source identity is incomplete.",
  EXPORT_CANCELLED: "The export was cancelled.",
  EXPORT_PATH_NOT_WRITABLE: "The export destination is not writable.",
  EXPORT_WRITE_FAILED: "The export could not be written.",
  EXPORT_FINALIZE_FAILED: "The export could not be finalized.",
  EXPORT_INTEGRITY_FAILED: "The export failed its integrity policy."
};

export function pendingAnalysisPublicReason(code: string) {
  return publicReasons[code] ?? "The export failed.";
}

function safeCode(value: unknown) {
  const text = String(value ?? "");
  return /^[A-Z][A-Z0-9_]{1,80}$/.test(text) ? text : "";
}

function safeJsonPath(value: unknown) {
  const text = String(value ?? "");
  return /^\$(?:\.[A-Za-z0-9_-]+|\[[0-9]+\])*$/.test(text) ? text : "";
}

function safeHash(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function count(value: unknown, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.trunc(Number(value) || 0)));
}

export function sanitizedPendingAnalysisDiagnostic(snapshot: PendingAnalysisDiagnosticSnapshot) {
  const totalRecords = Math.max(0, Math.trunc(snapshot.totalRecords));
  const outputBasename = snapshot.outputFileName
    ? path.basename(snapshot.outputFileName.replace(/\\/g, "/")).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 180)
    : "";
  const details: Record<string, unknown> = {
    runId: String(snapshot.runId).replace(/[^A-Za-z0-9-]/g, "").slice(0, 80),
    viewerSource: snapshot.sourceView,
    filterSnapshotHash: safeHash(snapshot.filterSnapshotHash),
    frozenCount: totalRecords,
    processedCount: count(snapshot.processedRecords, totalRecords),
    serializedCount: count(snapshot.serializedRecords, totalRecords),
    writtenCount: count(snapshot.writtenRecords, totalRecords),
    stage: snapshot.stage,
    elapsedMs: Math.max(0, Math.round(snapshot.elapsedMs))
  };
  const requestedPublicReason = snapshot.publicReason ? String(snapshot.publicReason) : "";
  const publicReason = Object.values(publicReasons).includes(requestedPublicReason) ? requestedPublicReason : "";
  const internalReason = safeCode(snapshot.internalReason);
  const integrityReason = safeCode(snapshot.integrityReason);
  const offendingJsonPath = safeJsonPath(snapshot.offendingJsonPath);
  if (publicReason) details.publicReason = publicReason;
  if (internalReason) details.internalReason = internalReason;
  if (integrityReason) details.integrityReason = integrityReason;
  if (offendingJsonPath) details.offendingJsonPath = offendingJsonPath;
  if (outputBasename) {
    details.outputBasename = outputBasename;
    details.outputRelativeIdentity = "exports/pending-analysis/" + outputBasename;
  }
  return details;
}

export function createPendingAnalysisExportDiagnostics(write: DiagnosticWriter, throttleMs = 1_000) {
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  let lastProgressStage = "";
  const emit = (event: PendingAnalysisDiagnosticEvent, snapshot: PendingAnalysisDiagnosticSnapshot) =>
    write(event, sanitizedPendingAnalysisDiagnostic(snapshot));
  return {
    started: (snapshot: PendingAnalysisDiagnosticSnapshot) => emit("pending_analysis_export_started", snapshot),
    progress: (snapshot: PendingAnalysisDiagnosticSnapshot) => {
      const stageChanged = snapshot.stage !== lastProgressStage;
      if (!stageChanged && snapshot.elapsedMs - lastProgressAt < throttleMs) return false;
      lastProgressAt = snapshot.elapsedMs;
      lastProgressStage = snapshot.stage;
      emit("pending_analysis_export_progress", snapshot);
      return true;
    },
    completed: (snapshot: PendingAnalysisDiagnosticSnapshot) => emit("pending_analysis_export_completed", snapshot),
    failed: (snapshot: PendingAnalysisDiagnosticSnapshot) => emit("pending_analysis_export_failed", snapshot),
    cancelled: (snapshot: PendingAnalysisDiagnosticSnapshot) => emit("pending_analysis_export_cancelled", snapshot)
  };
}
