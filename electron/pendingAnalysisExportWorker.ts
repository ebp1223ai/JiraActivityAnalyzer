import { parentPort } from "node:worker_threads";
import { runPendingAnalysisExport } from "./pendingAnalysisExport.js";

if (!parentPort) throw new Error("PENDING_ANALYSIS_WORKER_PORT_MISSING");
let cancelled = false;
parentPort.on("message", async (message: { type: string; input?: Parameters<typeof runPendingAnalysisExport>[0] }) => {
  if (message.type === "cancel") { cancelled = true; return; }
  if (message.type !== "start" || !message.input) return;
  try {
    const result = await runPendingAnalysisExport(message.input, {
      isCancelled: () => cancelled,
      onProgress: (progress) => parentPort!.postMessage({ type: "progress", progress })
    });
    parentPort!.postMessage({ type: "completed", result });
  } catch (error) {
    parentPort!.postMessage({ type: "failed", error: {
      code: error && typeof error === "object" && "code" in error ? String(error.code) : "EXPORT_WRITE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      integrityReason: error && typeof error === "object" && "integrityReason" in error ? String(error.integrityReason ?? "") : undefined,
      offendingJsonPath: error && typeof error === "object" && "offendingJsonPath" in error ? String(error.offendingJsonPath ?? "") : undefined
    } });
  }
});
