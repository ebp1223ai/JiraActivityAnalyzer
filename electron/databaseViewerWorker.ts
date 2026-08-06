import { parentPort } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import {
  listDatabaseIssues,
  listDatabaseUsers,
  loadDatabaseIssue,
  loadDatabaseIssueDistributions,
  loadDatabaseOverview,
  loadDatabaseUser,
  queryDatabaseDistinctValues,
  queryDatabaseIssueChangelog,
  queryDatabaseIssueEvents,
  queryDatabaseUserDistributions,
  queryDatabaseUserEvents,
  queryDatabaseUserRelatedIssues,
  queryDescriptionComparison,
  queryDescriptionFullContext,
  queryDescriptionOriginalPreviews,
  runDatabaseHealthCheck,
  databaseViewerCacheDiagnostics,
  clearDatabaseViewerCache
} from "./databaseViewer.js";

export type ViewerWorkerOperation =
  | "overview" | "healthCheck" | "listIssues" | "issueDistributions" | "getIssue"
  | "listUsers" | "getUser" | "userDistributions" | "userRelatedIssues" | "userEvents"
  | "issueEvents" | "issueChangelog" | "descriptionFullContext"
  | "descriptionOriginalPreviews" | "descriptionComparison" | "distinctValues" | "assertReadOnly"
  | "cacheDiagnostics" | "clearCache" | "__testDelay" | "__testCrash";

type WorkerRequest = { id: number; operation: ViewerWorkerOperation; databasePath: string; args: unknown[] };
type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: { code: string; message: string } };

function dispatch(request: WorkerRequest) {
  const [first, second] = request.args;
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
    case "userEvents": return queryDatabaseUserEvents(request.databasePath, first, second as Record<string, unknown> | undefined);
    case "issueEvents": return queryDatabaseIssueEvents(request.databasePath, String(first ?? ""), second as Record<string, unknown> | undefined);
    case "issueChangelog": return queryDatabaseIssueChangelog(request.databasePath, String(first ?? ""), second as Record<string, unknown> | undefined);
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

const port = parentPort;
if (!port) throw new Error("VIEWER_WORKER_PARENT_PORT_MISSING");
port.on("message", (request: WorkerRequest) => {
  try {
    const response: WorkerResponse = { id: request.id, ok: true, value: dispatch(request) };
    port.postMessage(response);
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    const response: WorkerResponse = { id: request.id, ok: false, error: { code: candidate.code ?? "VIEWER_WORKER_QUERY_FAILED", message: candidate.message ?? String(error) } };
    port.postMessage(response);
  }
});
