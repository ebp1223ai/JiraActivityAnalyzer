import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ActivityComparisonTable, activityComparisonColumns } from "../components/ActivityComparisonTable";
import type { SqliteTableColumn } from "../components/SqliteDataTable";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import type { ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { ViewerTableSessionState } from "../types/databaseViewer";
import type { TablePreferences } from "../types/uiPreferences";
import { aiStatusLabelV043 } from "../../shared/aiResultProjectionV043";

type Json = Record<string, any>;
type Variant = "ai" | "integrated";
type Saved = { query: ViewerTableQuery; preferences?: TablePreferences; session: ViewerTableSessionState };
const sessions = new Map<string, Saved>();
const requestId = () => `v043-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const empty: ViewerTableResult = { rows: [], totalCount: 0, filteredCount: 0, page: 1, pageSize: 50, pageCount: 1 };
const initial = (): Saved => ({ query: { page: 1, pageSize: 50, sort: { field: "eventTime", direction: "desc" }, filters: {} }, session: { scrollLeft: 0, scrollTop: 0, expandedRowIds: [] } });

function metadataColumns(): SqliteTableColumn[] {
  const statuses = ["analysisStatus", "reviewRank", "sourceLinkStatus", "sourceTraceStatus", "integrityStatus"];
  const labels = ["AI 分類狀態", "套件驗收狀態", "來源配對", "追溯完整性", "完整性核對"];
  return [...statuses.map((id, i): SqliteTableColumn => ({ id, queryField: id, label: labels[i], kind: "multi", width: 190, defaultVisible: i < 3, render: row => <span className="break-words">{aiStatusLabelV043(row[id])}</span> })),
    { id: "confidence", queryField: "confidence", label: "AI 信心", kind: "number", width: 100, defaultVisible: false },
    { id: "skillIds", queryField: "skillId", label: "AI 建議技能", kind: "multi", width: 280, defaultVisible: true, render: row => { const skills = (row.skillFindings ?? []) as Json[]; return skills.length ? <details><summary className="cursor-pointer break-words font-bold">{skills.map(f => f.skillId).join(" · ")} ({skills.length})</summary><ul className="space-y-2 py-2">{skills.map(f => <li key={f.skillId} className="break-words">{f.skillId} · {f.skillName}</li>)}</ul></details> : "無 AI 建議"; } },
    { id: "manual", queryField: 'computed:["manual","state"]', label: "人工驗收", kind: "multi", width: 210, defaultVisible: true, render: row => { const manual = row.manual as Json | undefined; return <span>{aiStatusLabelV043(manual?.state ?? "AI_ONLY")}<br />已確認 {manual?.confirmed?.length ?? 0}{manual?.provisional ? "（暫定）" : ""}</span>; } },
    { id: "rationale", queryField: "rationale", label: "分析理由", kind: "text", width: 320, defaultVisible: false, render: row => <span className="whitespace-pre-wrap break-words">{String(row.rationale ?? "未提供")}</span> }
  ];
}

function Viewer({ kind, scope, aiIdentity, rawIdentity }: { kind: Variant; scope: string; aiIdentity: string; rawIdentity: string }) {
  const [saved, setSaved] = useState<Saved>(() => sessions.get(scope) ?? initial());
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<ViewerTableResult & Json>(empty);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const latest = useRef(""), alive = useRef(true), stateRef = useRef(saved);
  stateRef.current = saved;
  useEffect(() => {
    alive.current = true;
    void window.desktopApp?.uiPreferences?.get().then(response => {
      if (!alive.current) return;
      const previous = sessions.get(scope) ?? response.preferences.aiViewerScopes?.[scope];
      if (previous) setSaved(previous);
      if (response.warning) setNotice(response.warning);
      setHydrated(true);
    }).catch(e => { if (alive.current) { setNotice(String(e)); setHydrated(true); } });
    return () => { alive.current = false; latest.current = ""; sessions.set(scope, stateRef.current); };
  }, [scope]);
  useEffect(() => {
    if (!hydrated) return;
    sessions.set(scope, saved);
    const timer = window.setTimeout(() => { void window.desktopApp?.uiPreferences?.update({ section: "aiViewerScopes", value: { [scope]: saved } }).catch(e => { if (alive.current) setNotice(`偏好儲存失敗：${String(e)}`); }); }, 250);
    return () => window.clearTimeout(timer);
  }, [saved, hydrated, scope]);
  const load = useCallback(async () => {
    if (!hydrated) return;
    const api = window.desktopApp?.aiDatabase; if (!api) return;
    const id = requestId(); latest.current = id; setLoading(true); setError("");
    const payload = { ...saved.query, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, requestId: id, aiDatabaseIdentity: aiIdentity, rawDatabaseIdentity: rawIdentity };
    try {
      const response = await (kind === "ai" ? api.queryResults(payload) : api.queryIntegrated(payload));
      if (!alive.current || latest.current !== id || response.requestId !== id || (response.ok !== false && (response.aiDatabaseIdentity !== aiIdentity || (kind === "integrated" && response.rawDatabaseIdentity !== rawIdentity)))) { void api.reportStale({ requestId: id, scope, reason: "IDENTITY_OR_REQUEST_CHANGED" }); return; }
      if (response.ok === false) setError(response.message ?? response.errorCode ?? "查詢失敗"); else setResult(response as ViewerTableResult & Json);
    } catch (e) { if (alive.current && latest.current === id) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current && latest.current === id) setLoading(false); }
  }, [saved.query, hydrated, kind, aiIdentity, rawIdentity, scope]);
  useEffect(() => { void load(); }, [load]);
  const loadDistinct = useCallback(async (field: string, search: string) => {
    const id = requestId();
    const response = await window.desktopApp?.aiDatabase?.distinct({ requestId: id, field, search, kind, query: { ...saved.query, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
    if (!alive.current || response?.requestId !== id) throw new Error("STALE_FACET_RESPONSE");
    if (!response?.ok) throw new Error(response?.message ?? "FACET_QUERY_FAILED");
    return { field, values: response.values.map((item: Json) => ({ ...item, label: ["analysisStatus", "reviewRank", "sourceLinkStatus", "sourceTraceStatus", "integrityStatus"].includes(field) ? aiStatusLabelV043(item.label) : item.label })), truncated: false };
  }, [saved.query, kind, scope]);
  const columns = useMemo(() => [...metadataColumns(), ...(result.fieldCatalog ?? []).map((field): SqliteTableColumn => ({ id: `dynamic:${field.path}`, queryField: field.path, label: field.label, group: field.group, dataType: field.dataType, sortable: field.sortable, kind: field.filterType, width: field.dataType === "date" ? 210 : 240, defaultVisible: false, render: row => { const v = (row.fieldValues as Json)?.[field.path]; const text = v === undefined ? "未提供" : typeof v === "string" ? v : JSON.stringify(v); return <details><summary className="line-clamp-3 cursor-pointer break-words" title={text}>{text}</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{text}</pre></details>; } }))], [result.fieldCatalog]);
  async function exportRows(visible: boolean, format: "json" | "csv" = "json") {
    const defaults = [...activityComparisonColumns("user-events"), ...columns].filter(c => c.required || c.defaultVisible).map(c => c.id);
    const ids = saved.preferences?.visibleColumns?.length ? saved.preferences.visibleColumns : defaults;
    const allColumns = [...activityComparisonColumns("user-events"), ...columns];
    const visibleFields = ids.map(id => allColumns.find(c => c.id === id)?.queryField ?? id);
    const response = await window.desktopApp?.aiDatabase?.exportQuery({ requestId: requestId(), kind, exportScope: visible ? "visible" : "all", visibleFields, format, query: { ...saved.query, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
    if (response?.ok === false) setNotice(`匯出失敗：${response.message ?? response.errorCode}`); else if (!response?.canceled) setNotice(`表格結果已匯出：${response?.filePath}`);
  }
  return <div className="min-w-0 space-y-4" data-testid={`${kind === "ai" ? "ai-results" : "integrated-results"}-page`}>
    <PageHeader title={kind === "ai" ? "AI 結果檢視" : "整合顯示結果"} subtitle={kind === "ai" ? "AI Results Viewer" : "Integrated Results"} connected={false} />
    {kind === "integrated" && result.integrationState ? <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">{aiStatusLabelV043(result.integrationState)}</div> : null}
    {notice ? <p role="status" className="break-words text-sm">{notice}</p> : null}
    <SectionCard title={`${result.filteredCount.toLocaleString()} / ${result.totalCount.toLocaleString()} 筆`} subtitle={kind === "ai" ? "分析當時的事件快照" : "原始事件與唯一配對分析"} action={<div className="flex flex-wrap gap-2"><button className="btn" disabled={loading} onClick={() => void load()}><RefreshCw size={16} />重新整理</button><details className="relative"><summary className="btn cursor-pointer"><Download size={16} />匯出表格</summary><div className="absolute right-0 z-30 grid w-48 gap-2 border bg-white p-2 shadow-lg"><button className="btn" onClick={() => void exportRows(true)}>顯示欄位</button><button className="btn" onClick={() => void exportRows(false)}>全部欄位 JSON</button><button className="btn" onClick={() => void exportRows(true, "csv")}>顯示欄位 CSV</button><button className="btn" onClick={() => void exportRows(false, "csv")}>全部欄位 CSV</button></div></details></div>}>
      <ActivityComparisonTable tableId={scope} fullResultFilters mode="user-events" additionalColumns={columns} result={result} query={saved.query} loading={loading} error={error} onQueryChange={query => setSaved(s => ({ ...s, query }))} preferences={saved.preferences} onPreferencesChange={preferences => setSaved(s => ({ ...s, preferences }))} sessionState={saved.session} onSessionStateChange={session => setSaved(s => ({ ...s, session }))} loadDistinct={loadDistinct} />
    </SectionCard>
  </div>;
}
function ViewerHost({ kind }: { kind: Variant }) {
  const runtime = useRuntimeStatus();
  const rawIdentity = runtime.state.database.databaseId || "";
  const [identity, setIdentity] = useState<Json | null>(null), [error, setError] = useState("");
  useEffect(() => { let active = true; void window.desktopApp?.aiDatabase?.lifecycle({ requestId: requestId() }).then(response => { if (active) { if (!response.ok) setError(response.message); else setIdentity(response.snapshot); } }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [rawIdentity, kind]);
  if (!identity) return <p role="status">{error || "正在讀取資料庫狀態…"}</p>;
  const scope = `v043|${kind}|${rawIdentity}|${identity.databaseId ?? ""}|${identity.modifiedAtUtc ?? ""}|${identity.schemaVersion ?? ""}`;
  return <Viewer key={scope} kind={kind} scope={scope} aiIdentity={identity.databaseId ?? ""} rawIdentity={rawIdentity} />;
}
export function AiResultsPageV043() { return <ViewerHost kind="ai" />; }
export function IntegratedResultsPageV043() { return <ViewerHost kind="integrated" />; }
