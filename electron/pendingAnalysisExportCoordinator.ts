import { Worker } from "node:worker_threads";
import type { PendingAnalysisExportRequest, PendingAnalysisProgress } from "../shared/pendingAnalysisContract.js";

export class PendingAnalysisExportCoordinator {
  private worker: Worker | null = null;
  private status: PendingAnalysisProgress | null = null;
  constructor(private readonly workerPath: string) {}

  current() { return this.status ? structuredClone(this.status) : null; }

  start(input: PendingAnalysisExportRequest & { exportId: string; databasePath: string; appRoot: string; appVersion: string }, onProgress: (progress: PendingAnalysisProgress) => void) {
    if (this.worker) throw Object.assign(new Error("Pending-analysis export is already running."), { code: "EXPORT_ALREADY_RUNNING" });
    this.status = { exportId: input.exportId, status: "preparing", sourceView: input.sourceView, filteredCount: input.expectedFilteredCount, exportedCount: 0, percentage: 0, elapsedMs: 0, message: "Preparing export / 準備匯出" };
    const worker = new Worker(this.workerPath);
    this.worker = worker;
    return new Promise((resolve, reject) => {
      worker.on("message", (message: { type: string; progress?: PendingAnalysisProgress; result?: unknown; error?: { code: string; message: string } }) => {
        if (message.type === "progress" && message.progress) { this.status = message.progress; onProgress(message.progress); }
        if (message.type === "completed") { this.status = { ...this.status!, status: "completed", percentage: 100, result: message.result as PendingAnalysisProgress["result"] }; onProgress(this.status); resolve(message.result); void worker.terminate(); this.worker = null; }
        if (message.type === "failed") { const cancelled = message.error?.code === "EXPORT_CANCELLED"; this.status = { ...this.status!, status: cancelled ? "cancelled" : "failed", errorCode: message.error?.code as PendingAnalysisProgress["errorCode"], message: message.error?.message ?? "Export failed." }; onProgress(this.status); reject(Object.assign(new Error(message.error?.message), { code: message.error?.code })); void worker.terminate(); this.worker = null; }
      });
      worker.on("error", (error: Error) => { this.status = { ...this.status!, status: "failed", errorCode: "EXPORT_WRITE_FAILED", message: error.message }; this.worker = null; reject(error); });
      worker.postMessage({ type: "start", input });
    });
  }

  cancel(exportId: string) {
    if (!this.worker || this.status?.exportId !== exportId) return false;
    this.worker.postMessage({ type: "cancel" });
    return true;
  }
}
