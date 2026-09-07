import { queryResultsV043, distinctResultsV043, latestQueryDiagnosticsV043, exportResultsV043 } from "./aiResultsQueryV043.js";
import type { QueryV043 } from "./aiResultsQueryV043.js";

export const queryAiResultsV042 = (ai: string, query: QueryV043 = {}, raw: string | null = null) => queryResultsV043("ai", ai, raw, query);
export const queryIntegratedResultsV042 = (raw: string, ai: string | null, query: QueryV043 = {}) => queryResultsV043("integrated", ai, raw, query);
export const distinctAiResultsV042 = (ai: string | null, field: string, search = "", _legacyLimit = 100, query: QueryV043 = {}, kind: "ai" | "integrated" = "ai", raw: string | null = null) => distinctResultsV043(kind, ai, raw, field, query, search);
export const latestAiQueryDiagnosticsV042 = latestQueryDiagnosticsV043;
export const exportAiQueryV043 = exportResultsV043;
