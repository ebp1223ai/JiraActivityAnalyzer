type Json = Record<string, any>;
// Keep preferences only. Rows, source traces and response bodies must never enter this store.
export function normalizeAiViewerScopesV043(input: unknown): Record<string, Json> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, Json> = Object.create(null);
  for (const [scope, raw] of Object.entries(input)) {
    if (!scope.startsWith("v043|") || scope.length > 2048 || !raw || typeof raw !== "object") continue;
    const p = raw as Json, prefs = p.preferences ?? {}, session = p.session ?? {};
    const strings = (v: any) => Array.isArray(v) ? v.filter((s: any) => typeof s === "string") : [];
    const filters: Json = Object.create(null);
    for (const [field, candidate] of Object.entries(p.query?.filters ?? prefs.filters ?? {})) {
      if (!candidate || typeof candidate !== "object") continue;
      const f = candidate as Json;
      filters[field] = Object.fromEntries(Object.entries(f).filter(([key, value]) => ["text", "operator", "from", "to"].includes(key) ? typeof value === "string" : key === "values" ? Array.isArray(value) && value.every(v => typeof v === "string") : ["min", "max"].includes(key) && typeof value === "number" && Number.isFinite(value)));
    }
    const q = p.query ?? {}, size = [25, 50, 100, 200].includes(q.pageSize ?? prefs.pageSize) ? (q.pageSize ?? prefs.pageSize) : 50;
    const query = { page: Number.isSafeInteger(q.page) && q.page > 0 ? q.page : 1, pageSize: size, sort: q.sort?.field && ["asc", "desc"].includes(q.sort.direction) ? { field: String(q.sort.field), direction: q.sort.direction } : null, filters, diffQuickFilters: Object.fromEntries(Object.entries(q.diffQuickFilters ?? {}).filter(([k, v]) => ["hideNoChange", "hideZeroAdded", "hideZeroDeleted", "hideBeforeUnavailable"].includes(k) && typeof v === "boolean")) };
    result[scope] = { query, preferences: { visibleColumns: strings(prefs.visibleColumns), columnOrder: strings(prefs.columnOrder), columnWidths: Object.fromEntries(Object.entries(prefs.columnWidths ?? {}).filter(([, v]) => typeof v === "number" && v >= 72 && v <= 640)), pageSize: size, sort: query.sort, filters }, session: { scrollLeft: Math.max(0, Number(session.scrollLeft) || 0), scrollTop: Math.max(0, Number(session.scrollTop) || 0), expandedRowIds: strings(session.expandedRowIds) } };
  }
  return result;
}
