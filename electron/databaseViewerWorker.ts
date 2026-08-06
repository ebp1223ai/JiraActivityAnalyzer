import { parentPort } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import {
  listDatabaseIssues, listDatabaseUsers, loadDatabaseIssue, loadDatabaseIssueDistributions,
  loadDatabaseOverview, loadDatabaseUser, queryDatabaseDistinctValues,
  queryDatabaseIssueChangelogProgressive, queryDatabaseIssueEventsProgressive,
  queryDatabaseUserDistributions, queryDatabaseUserEventsProgressive, queryDatabaseUserRelatedIssues,
  queryDescriptionComparison, queryDescriptionFullContext, queryDescriptionOriginalPreviews,
  runDatabaseHealthCheck, databaseViewerCacheDiagnostics, clearDatabaseViewerCache,
  type ProgressiveCheckpoint, type ProgressiveCheckpointDelta, type ViewerProgressDto
} from "./databaseViewer.js";

export type ViewerWorkerOperation =
  | "overview" | "healthCheck" | "listIssues" | "issueDistributions" | "getIssue"
  | "listUsers" | "getUser" | "userDistributions" | "userRelatedIssues" | "userEvents"
  | "issueEvents" | "issueChangelog" | "descriptionFullContext"
  | "descriptionOriginalPreviews" | "descriptionComparison" | "distinctValues" | "assertReadOnly"
  | "cacheDiagnostics" | "clearCache" | "__testDelay" | "__testCrash";

type WorkerRunRequest = { type?: "run"; id: number; requestId: string; operation: ViewerWorkerOperation; databasePath: string; args: unknown[]; batchSize?: number; resume?: ProgressiveCheckpoint };
type WorkerCancelRequest = { type: "cancel"; id: number; requestId: string };
type WorkerRequest = WorkerRunRequest | WorkerCancelRequest;
type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: { code: string; message: string } };

const cancelled = new Set<number>();
const workerPort = parentPort!;
if (!workerPort) throw new Error("VIEWER_WORKER_PARENT_PORT_MISSING");

async function dispatch(request: WorkerRunRequest) {
  const [first, second] = request.args;
  const control = {
    requestId: request.requestId,
    batchSize: request.batchSize,
    resume: request.resume,
    isCancelled: () => cancelled.has(request.id),
    onCheckpoint: (checkpoint: ProgressiveCheckpointDelta) => workerPort.postMessage({ type: "checkpoint", id: request.id, checkpoint }),
    onProgress: (progress: ViewerProgressDto) => workerPort.postMessage({ type: "progress", id: request.id, progress })
  };
  switch (request.operation) {
    case "overview": return loadDatabaseOverview(request.databasePath);
    case "healthCheck": return runDatabaseHealthCheck(request.databasePath);
    case "listIssues": return listDatabaseIssues(request.databasePath, first as Record<string, unknown> | undefined);
    case "issueDistributions": return loadDatabaseIssueDistributions(request.databasePath, first as Record<string, unknown> | undefined);
    case "getIssue": return loadDatabaseIssue(request.databasePath, String(first ?? ""));
    case "listUsers": return listDatabaseUsers(request.databasePath, first as { search?: string; limit?: number; offset?: number } | undefined);
    case "getUser": return loadDatabaseUser(request.databasePath, String(first ?? ""), second as { limit?: number; offset?: number } | undefined);
    case "userDistributions": return queryDatabaseUserDistributions(request.databasePath, first, second as Record<string, unknown> | undefined);
    case "userRelatedIssues": return queryDatabaseUserRelatedIssues(request.databasePath, first, second as Record<string, unknown> | undefined);
    case "userEvents": return queryDatabaseUserEventsProgressive(request.databasePath, first, second as Record<string, unknown> | undefined, control);
    case "issueEvents": return queryDatabaseIssueEventsProgressive(request.databasePath, String(first ?? ""), second as Record<string, unknown> | undefined, control);
    case "issueChangelog": return queryDatabaseIssueChangelogProgressive(request.databasePath, String(first ?? ""), second as Record<string, unknown> | undefined, control);
    case "descriptionFullContext": return queryDescriptionFullContext(request.databasePath, first as Record<string, unknown>);
    case "descriptionOriginalPreviews": return queryDescriptionOriginalPreviews(request.databasePath, first as Record<string, unknown>);
    case "descriptionComparison": return queryDescriptionComparison(request.databasePath, first as Record<string, unknown>);
    case "distinctValues": return queryDatabaseDistinctValues(request.databasePath, first as Record<string, unknown>);
    case "cacheDiagnostics": return databaseViewerCacheDiagnostics();
    case "clearCache": clearDatabaseViewerCache(); return databaseViewerCacheDiagnostics();
    case "__testDelay": {
      if (process.env.JAA_VIEWER_WORKER_TEST_MODE !== "1") throw new Error("VIEWER_WORKER_TEST_MODE_REQUIRED");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, Math.min(30_000, Number(first) || 0)));
      return { delayedMs: Number(first) || 0 };
    }
    case "__testCrash": {
      if (process.env.JAA_VIEWER_WORKER_TEST_MODE !== "1") throw new Error("VIEWER_WORKER_TEST_MODE_REQUIRED");
      process.exit(97);
    }
    case "assertReadOnly": {
      const db = new DatabaseSync(request.databasePath, { readOnly: true });
      try {
        db.exec("PRAGMA query_only = ON");
        const rejected: string[] = [];
        for (const sql of ["CREATE TABLE jaa_worker_write_probe(id INTEGER)", "DELETE FROM source_objects"]) {
          try { db.exec(sql); } catch { rejected.push(sql.split(" ")[0]); }
        }
        return { queryOnly: Number((db.prepare("PRAGMA query_only").get() as { query_only?: number }).query_only ?? 0), rejected };
      } finally { db.close(); }
    }
  }
}

workerPort.on("message", (request: WorkerRequest) => {
  if (request.type === "cancel") {
    cancelled.add(request.id);
    return;
  }
  void dispatch(request).then((value) => {
    const response: WorkerResponse = { id: request.id, ok: true, value };
    workerPort.postMessage(response);
  }).catch((error: unknown) => {
    const candidate = error as { code?: string; message?: string };
    const response: WorkerResponse = { id: request.id, ok: false, error: { code: candidate.code ?? "VIEWER_WORKER_QUERY_FAILED", message: candidate.message ?? String(error) } };
    workerPort.postMessage(response);
  }).finally(() => cancelled.delete(request.id));
});
