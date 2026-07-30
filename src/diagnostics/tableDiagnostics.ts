import { reportRendererDiagnostic } from "./rendererDiagnostics";

type TableRequestEvent = "started" | "completed" | "failed" | "stale" | "aborted";

function querySummary(query: unknown) {
  const source = query && typeof query === "object" && !Array.isArray(query) ? query as Record<string, unknown> : {};
  const filters = source.filters && typeof source.filters === "object" && !Array.isArray(source.filters)
    ? source.filters as Record<string, unknown>
    : {};
  return {
    page: Number(source.page ?? 1),
    pageSize: Number(source.pageSize ?? 0),
    sort: source.sort ?? null,
    filterIds: Object.keys(filters),
    filterCount: Object.keys(filters).length
  };
}

export function recordTableRequest(
  event: TableRequestEvent,
  details: {
    requestId: number;
    tableId: string;
    query: unknown;
    startedAt: number;
    resultCount?: number;
    error?: unknown;
  }
) {
  const now = performance.now();
  reportRendererDiagnostic("table_request", {
    status: event,
    requestId: details.requestId,
    tableId: details.tableId,
    query: querySummary(details.query),
    startedAt: details.startedAt,
    endedAt: now,
    durationMs: Math.max(0, Math.round(now - details.startedAt)),
    resultCount: details.resultCount ?? null,
    error: details.error instanceof Error
      ? { name: details.error.name, message: details.error.message }
      : details.error ? String(details.error) : null
  });
}
