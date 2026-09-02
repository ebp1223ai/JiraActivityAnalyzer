import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ActivityComparisonTable } from "../components/ActivityComparisonTable";
import type { SqliteTableColumn } from "../components/SqliteDataTable";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { useAiViewerState, type AiViewerRouteKey } from "../state/AiViewerStateContext";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import type { ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { TablePreferences } from "../types/uiPreferences";

type Variant = "ai" | "integrated";
const makeRequestId = (route: string) => `v042-${route}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const value = (row: Record<string, unknown>, field: string) => <span className="break-words">{row[field] === null || row[field] === undefined || row[field] === "" ? "—" : String(row[field])}</span>;
const metadataColumns = (integrated: boolean): SqliteTableColumn[] => [
  ...(integrated ? [{ id: "analysisState", queryField: "analysisState", label: "Analysis / 分析", kind: "multi" as const, width: 120, defaultVisible: true, render: (row: Record<string, unknown>) => value(row, "analysisState") }] : []),
  { id: "analysisStatus", queryField: "analysisStatus", label: "AI Status", kind: "multi", width: 120, defaultVisible: true, render: (row) => value(row, "analysisStatus") },
  { id: "reviewRank", queryField: "reviewRank", label: "Review Rank", kind: "multi", width: 150, defaultVisible: true, render: (row) => value(row, "reviewRank") },
  { id: "sourceTraceStatus", queryField: "sourceTraceStatus", label: "Trace", kind: "multi", width: 110, defaultVisible: true, render: (row) => value(row, "sourceTraceStatus") },
  { id: "sourceLinkStatus", queryField: "sourceLinkStatus", label: "Link", kind: "multi", width: 150, defaultVisible: true, render: (row) => value(row, "sourceLinkStatus") },
  { id: "integrityStatus", queryField: "integrityStatus", label: "Integrity", kind: "multi", width: 120, defaultVisible: true, render: (row) => value(row, "integrityStatus") },
  { id: "confidence", queryField: "confidence", label: "Confidence", kind: "number", width: 105, defaultVisible: true, render: (row) => value(row, "confidence") },
  { id: "skillIds", queryField: "skillId", label: "Skills", kind: "multi", width: 180, defaultVisible: !integrated, render: (row) => value(row, "skillIds") },
  { id: "rationale", queryField: "rationale", label: "Rationale", kind: "text", width: 320, defaultVisible: false, render: (row) => value(row, "rationale") }
];

function StateBanner({ integrated, result, error }: { integrated: boolean; result: Record<string, unknown>; error: string }) {
  const state = String(result.integrationState ?? "");
  if (!error && (!integrated || !state || state === "READY")) return null;
  const message = error || (state === "BLOCKED_RAW_DB" ? "Raw Database is closed or incompatible." : state === "AI_DATABASE_CLOSED" ? "AI Database is not selected." : state === "READY_NO_MATCH" ? "Both databases are ready, but no identity match exists. Hash is not used as a link gate." : state);
  return <div className={`rounded-md border p-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{message}</div>;
}

function Viewer({ variant }: { variant: Variant }) {
  const integrated = variant === "integrated";
  const route: AiViewerRouteKey = integrated ? "integrated-results" : "ai-results";
  const { state, patch } = useAiViewerState(route);
  const runtime = useRuntimeStatus();
  const [preferences, setPreferences] = useState<TablePreferences | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const latest = useRef("");
  const mounted = useRef(true);
  const rawIdentity = runtime.state.database.databaseId || "RAW_DB_CLOSED";

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { void window.desktopApp?.uiPreferences?.get().then((loaded) => { const next = loaded?.preferences[integrated ? "integratedResults" : "aiResults"] as TablePreferences | undefined; if (next) { setPreferences(next); patch((current) => ({ query: { ...current.query, pageSize: next.pageSize as 25 | 50 | 100 | 200, sort: next.sort ?? current.query.sort, filters: next.filters ?? current.query.filters } })); } if (loaded?.warning) setNotice(loaded.warning); }); }, [integrated]);

  const load = useCallback(async () => {
    const api = window.desktopApp?.aiDatabase;
    if (!api) return;
    const requestId = makeRequestId(route);
    latest.current = requestId;
    setLoading(true); setError("");
    const lifecycle = await api.lifecycle({ requestId: makeRequestId("identity") });
    const aiIdentity = String(lifecycle?.snapshot?.databaseId ?? "AI_DB_CLOSED");
    patch({ latestRequestId: requestId, rawDatabaseIdentity: rawIdentity, aiDatabaseIdentity: aiIdentity });
    try {
      const response = integrated
        ? await api.queryIntegrated({ ...state.query, requestId, rawDatabaseIdentity: rawIdentity, aiDatabaseIdentity: aiIdentity })
        : await api.queryResults({ ...state.query, requestId, rawDatabaseIdentity: rawIdentity, aiDatabaseIdentity: aiIdentity });
      const stale = !mounted.current || latest.current !== requestId || response.requestId !== requestId || response.aiDatabaseIdentity !== aiIdentity || (integrated && response.rawDatabaseIdentity !== rawIdentity);
      if (stale) { await api.reportStale({ route, requestId, latestRequestId: latest.current, expectedRawDatabaseIdentity: rawIdentity, responseRawDatabaseIdentity: response.rawDatabaseIdentity, expectedAiDatabaseIdentity: aiIdentity, responseAiDatabaseIdentity: response.aiDatabaseIdentity }); return; }
      if (response.ok === false) setError(`${response.errorCode ?? "QUERY_FAILED"}: ${response.message ?? "Query failed"}`);
      else patch({ result: response as ViewerTableResult, lastSuccessfulRequestId: requestId });
    } catch (reason) { if (mounted.current && latest.current === requestId) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (mounted.current && latest.current === requestId) setLoading(false); }
  }, [integrated, rawIdentity, route, state.query]);
  useEffect(() => { void load(); }, [load]);

  function queryChange(query: ViewerTableQuery) { patch({ query: { ...query, revision: (state.query.revision ?? 0) + 1 } }); }
  function preferencesChange(next: TablePreferences) { setPreferences(next); void window.desktopApp?.uiPreferences?.update({ section: integrated ? "integratedResults" : "aiResults", value: next }).then((loaded) => { if (loaded.warning) setNotice(loaded.warning); }); }
  const columns = useMemo(() => {
    const fixed = metadataColumns(integrated);
    const fixedFields = new Set(fixed.map((column) => column.queryField ?? column.id));
    const dynamic = (state.result.fieldCatalog ?? []).filter((field) => !fixedFields.has(field.path) && !fixedFields.has(field.path.replace(/^computed\./, ""))).map((field): SqliteTableColumn => ({
      id: `dynamic:${field.path}`,
      queryField: field.path,
      label: field.path,
      group: field.group,
      kind: field.filterType,
      width: field.dataType === "json" ? 300 : field.dataType === "date" ? 190 : 170,
      defaultVisible: false,
      render: (row) => {
        const fieldValues = row.fieldValues && typeof row.fieldValues === "object" ? row.fieldValues as Record<string, unknown> : {};
        const raw = fieldValues[field.path];
        const display = raw === null || raw === undefined || raw === "" ? "—" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
        return <span className="block max-w-full break-words" title={display}>{display}</span>;
      }
    }));
    return [...fixed, ...dynamic];
  }, [integrated, state.result.fieldCatalog]);

  return <div className="min-w-0 space-y-4" data-testid={`${route}-page`}>
    <PageHeader title={integrated ? "整合顯示結果" : "AI 結果檢視"} subtitle={integrated ? "Integrated Results" : "AI Results Viewer"} connected={!error} />
    <StateBanner integrated={integrated} result={state.result} error={error} />
    {notice ? <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">{notice}</div> : null}
    <SectionCard title={`${state.result.filteredCount.toLocaleString()} / ${state.result.totalCount.toLocaleString()} records`} subtitle={integrated ? "Raw Activity Events LEFT JOIN Active AI Record" : "AI SQLite only"} action={<div className="flex flex-wrap gap-2"><button className="btn" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />Refresh</button><details className="relative"><summary className="btn cursor-pointer list-none"><Download size={15} />Export</summary><div className="absolute right-0 top-10 z-20 grid w-44 gap-1 rounded-md border border-line bg-white p-2 shadow-lg"><button className="btn justify-start" type="button" onClick={() => void window.desktopApp?.aiDatabase?.exportQuery({ requestId: makeRequestId("export-visible"), kind: variant, exportScope: "visible", visibleFields: preferences?.visibleColumns ?? [], query: state.query })}>Visible columns</button><button className="btn justify-start" type="button" onClick={() => void window.desktopApp?.aiDatabase?.exportQuery({ requestId: makeRequestId("export-all"), kind: variant, exportScope: "all", query: state.query })}>All fields</button></div></details></div>}>
      <ActivityComparisonTable tableId={route} mode="user-events" additionalColumns={columns} result={state.result} query={state.query} loading={loading} error={error} onQueryChange={queryChange} preferences={preferences} onPreferencesChange={preferencesChange} sessionState={state.session} onSessionStateChange={(session) => patch({ session })} loadDistinct={integrated ? undefined : async (field, search) => { const response = await window.desktopApp?.aiDatabase?.distinct({ requestId: makeRequestId("distinct"), field, search, limit: 100 }); return { field, values: response?.values ?? [], truncated: Boolean(response?.truncated) }; }} />
    </SectionCard>
  </div>;
}

export function AiResultsPageV042() { return <Viewer variant="ai" />; }
export function IntegratedResultsPageV042() { return <Viewer variant="integrated" />; }
