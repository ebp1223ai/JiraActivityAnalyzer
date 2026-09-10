import { AiStatusFilterV047 } from "../components/AiStatusFilterV047";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_STATUSES_V047, DISPLAY_POLICY_V047, integratedQueryV047, normalizeAiSelectionV047 } from "../../shared/integratedDisplayV047";
import { DEFAULT_DIFF_QUICK_FILTERS } from "../../shared/viewerEfficiency";
import { Download, RefreshCw, X } from "lucide-react";
import { ActivityComparisonTable, activityComparisonColumns } from "../components/ActivityComparisonTable";
import type { SqliteTableColumn } from "../components/SqliteDataTable";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import type { ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { ViewerTableSessionState } from "../types/databaseViewer";
import type { TablePreferences } from "../types/uiPreferences";
import { aiStatusLabelV043 } from "../../shared/aiResultProjectionV043";
import { acquireAiResultV045 } from '../state/aiResultCacheV045';

type Json = Record<string, any>;
type Variant = "ai" | "integrated";
type Saved = { query: ViewerTableQuery; preferences?: TablePreferences; session: ViewerTableSessionState };
const sessions = new Map<string, Saved>();
const exportsInProgress = new Map<string, { id: string; startedAt: number; stage: string }>();
const exportNotices = new Map<string, string>();
const requestId = () => `v043-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const empty: ViewerTableResult = { countsKnown:false, rows: [], totalCount: 0, filteredCount: 0, page: 1, pageSize: 50, pageCount: 1 };
const initial = (kind: Variant): Saved => ({ query: kind === "integrated" ? integratedQueryV047({ page: 1, pageSize: 50 as const, sort: { field: "eventTime", direction: "desc" as const }, filters: {}, diffQuickFilters: { ...DEFAULT_DIFF_QUICK_FILTERS } }) : { page: 1, pageSize: 50, sort: { field: "eventTime", direction: "desc" }, filters: {} }, session: { scrollLeft: 0, scrollTop: 0, expandedRowIds: [] } });

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

function Viewer({ kind, scope, aiIdentity, rawIdentity, contentRevision, legacyScope }: { kind: Variant; scope: string; aiIdentity: string; rawIdentity: string; contentRevision: string; legacyScope: string }) {
  const [saved, setSaved] = useState<Saved>(() => sessions.get(scope) ?? initial(kind));
  const [hydrated, setHydrated] = useState(() => sessions.has(scope));
  const [result, setResult] = useState<ViewerTableResult & Json>(empty);
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [stage, setStage] = useState("準備查詢"), [elapsed, setElapsed] = useState(0), [cancelRequested, setCancelRequested] = useState(false);
  const sequence = useRef(0), facets = useRef(new Set<string>());
  const [exportJob, setExportJob] = useState<string | null>(null), [exportStage, setExportStage] = useState(""), [exportElapsed, setExportElapsed] = useState(0);
  const latest = useRef(""), alive = useRef(true), stateRef = useRef(saved);
  stateRef.current = saved;
  useEffect(() => {
    const refresh = () => { const job = exportsInProgress.get(scope); setExportJob(job?.id ?? null); if (job) { setExportStage(job.stage); setExportElapsed((Date.now() - job.startedAt) / 1000); } const message = exportNotices.get(scope); if (message) { setNotice(message); exportNotices.delete(scope); } };
    refresh(); const timer = window.setInterval(refresh, 250); return () => window.clearInterval(timer);
  }, [scope]);
  useEffect(() => window.desktopApp?.aiDatabase?.onQueryProgress(progress => { if (progress.requestId === latest.current) setStage(({ "snapshot-build": "讀取及整理完整資料", "facet-build": "建立完整篩選索引", "sql-query": "執行查詢", "cache-hit": "讀取快取" } as Record<string, string>)[progress.stage] ?? progress.stage); }), []);
  useEffect(() => { if (!loading) return; const started = performance.now(); setElapsed(0); const timer = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 250); return () => window.clearInterval(timer); }, [loading]);
  useEffect(() => window.desktopApp?.aiDatabase?.onQueryProgress(progress => { if (progress.requestId === exportJob) { const job = exportsInProgress.get(scope); if (job) job.stage = progress.stage === "export-write" ? "寫入完整結果" : "整理匯出資料"; } }), [exportJob]);

  const cancel = async () => { const id = latest.current; if (!id) return; setCancelRequested(true); const response = await window.desktopApp?.aiDatabase?.cancelQuery({ requestId: id }); if (response?.executorStopped) { setStage("已取消，查詢程序已停止"); setLoading(false); } setCancelRequested(false); };
  useEffect(() => {
    alive.current = true;
    void window.desktopApp?.uiPreferences?.get().then(response => {
      if (!alive.current) return;
      const storedScopes = response.preferences.aiViewerScopes ?? {};
      const oldPrefix = `v043|${kind}|${rawIdentity}|${aiIdentity}|`;
      const oldKey = Object.keys(storedScopes).filter(key => key.startsWith(oldPrefix)).sort().slice(-1)[0];
      const previous = sessions.get(scope) ?? storedScopes[scope] ?? storedScopes[legacyScope] ?? (oldKey ? storedScopes[oldKey] : undefined);
      if (previous) {
        if (kind === "integrated") {
          const stored = previous.query.filters?.analysisStatus ?? previous.query.filters?.['computed:["analysisStatus"]'];
          const warning = normalizeAiSelectionV047(stored?.values).warning;
          setSaved({ ...previous, query: integratedQueryV047(previous.query) });
          if (warning) setNotice(warning);
        } else setSaved(previous);
      }
      if (response.warning) setNotice(response.warning);
      setHydrated(true);
    }).catch(e => { if (alive.current) { setNotice(String(e)); setHydrated(true); } });
    return () => { alive.current = false; sequence.current++; facets.current.clear(); latest.current = ""; sessions.set(scope, stateRef.current); if (sessions.size > 16) sessions.delete(sessions.keys().next().value!); };
  }, [scope]);
  useEffect(() => {
    if (!hydrated) return;
    sessions.set(scope, saved);
    const timer = window.setTimeout(() => { void window.desktopApp?.uiPreferences?.update({ section: "aiViewerScopes", value: { [scope]: saved } }).catch(e => { if (alive.current) setNotice(`偏好儲存失敗：${String(e)}`); }); }, 250);
    return () => window.clearTimeout(timer);
  }, [saved, hydrated, scope]);
  const visibleProjection = JSON.stringify((saved.preferences?.visibleColumns ?? []).filter(id => id.startsWith('dynamic:')).slice().sort());
  const load = useCallback(async (force = false) => {
    if (!hydrated) return;
    const api = window.desktopApp?.aiDatabase; if (!api) return;
    const revision = ++sequence.current;
    if (loading && latest.current) await api.cancelQuery({ requestId: latest.current });
    if (!alive.current || revision !== sequence.current) return;
    let id = requestId(); latest.current = id; setLoading(true); setResult(empty); setError(""); setStage("準備查詢"); setCancelRequested(false);
    const payload = { ...saved.query, visibleFields: saved.preferences?.visibleColumns?.filter(id => id.startsWith("dynamic:")) ?? [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, requestId: id, aiDatabaseIdentity: aiIdentity, rawDatabaseIdentity: rawIdentity };
    try {
      const key = JSON.stringify([DISPLAY_POLICY_V047, scope, contentRevision, saved.query, [...(payload.visibleFields ?? [])].sort()]);
      const cached = acquireAiResultV045(scope, key, id, () => kind === 'ai' ? api.queryResults(payload) : api.queryIntegrated(payload), force);
      id = cached.entry.id; latest.current = id;
      if (cached.reused) { setStage(cached.entry.value ? '恢復有效結果' : '接回進行中的查詢'); void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: 'cache-reuse', phase: 'POINT', requestId: id, reason: cached.entry.value ? 'VALID_RESULT' : 'IN_FLIGHT' }); }
      const response = await cached.entry.promise;
      if (!alive.current || revision !== sequence.current || latest.current !== id || response.requestId !== id || (response.ok !== false && (response.aiDatabaseIdentity !== aiIdentity || (kind === "integrated" && response.rawDatabaseIdentity !== rawIdentity)))) { void api.reportStale({ requestId: id, scope, reason: "IDENTITY_OR_REQUEST_CHANGED" }); return; }
      if (response.ok === false) setError(response.errorCode === "CANCELLED" ? "已取消查詢" : `查詢未完成：${response.message ?? response.errorCode ?? "QUERY_FAILED"} · Diagnostic ID: ${response.diagnosticId ?? "UNAVAILABLE"}`); else {
        const context = response.diagnosticContext ? { ...response.diagnosticContext, spanId: crypto.randomUUID(), parentSpanId: response.diagnosticContext.spanId, route: kind === "ai" ? "/ai-results" : "/integrated-results" } : null;
        if (!Array.isArray(response.rows) || !Number.isSafeInteger(response.totalCount)) throw Error("INVALID_QUERY_RESULT");
        if (context) await window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "query-render", phase: "START", context, rowCount: response.rows?.length, requestId: id });
        if (!alive.current || latest.current !== id) { if (context) void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "query-render", phase: "END", context, requestId: id, outcome: "SUPERSEDED" }); return; }
        setResult({ ...(response as ViewerTableResult & Json), countsKnown:true, queryKey:JSON.stringify(saved.query), renderDiagnosticContext: context });
      }
    } catch (e) { if (alive.current && latest.current === id) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current && latest.current === id) setLoading(false); }
  }, [saved.query, visibleProjection, hydrated, kind, aiIdentity, rawIdentity, scope, contentRevision]);
  useEffect(() => { void load(); }, [load]);
  const loadDistinct = useCallback(async (field: string, search: string) => {
    const id = requestId();
    const revision = sequence.current; facets.current.add(id);
    const response = await window.desktopApp?.aiDatabase?.distinct({ requestId: id, field, search, kind, query: { ...saved.query, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }).finally(() => facets.current.delete(id));
    if (!alive.current || revision !== sequence.current || response?.requestId !== id) throw new Error("STALE_FACET_RESPONSE");
    if (!response?.ok) throw new Error(response?.message ?? "FACET_QUERY_FAILED");
    return { field, values: response.values.map((item: Json) => ({ ...item, label: ["analysisStatus", "reviewRank", "sourceLinkStatus", "sourceTraceStatus", "integrityStatus"].includes(field) ? aiStatusLabelV043(item.label) : item.label })), truncated: false };
  }, [saved.query, kind, scope]);
  useEffect(() => {
    if (!result.renderDiagnosticContext) return;
    let completed = false;
    const frame = requestAnimationFrame(() => { completed = true; void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "query-render", phase: "END", context: result.renderDiagnosticContext, rowCount: result.rows.length, requestId: result.requestId }); });
    return () => { cancelAnimationFrame(frame); if (!completed) void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "query-render", phase: "END", context: result.renderDiagnosticContext, requestId: result.requestId, outcome: "SUPERSEDED" }); };
  }, [result]);
  const columns = useMemo(() => [...metadataColumns(), ...(result.fieldCatalog ?? []).map((field): SqliteTableColumn => ({ id: `dynamic:${field.path}`, queryField: field.path, label: field.label, group: field.group, dataType: field.dataType, sortable: field.sortable, kind: field.filterType, width: field.dataType === "date" ? 210 : 240, defaultVisible: false, render: row => { const v = (row.fieldValues as Json)?.[field.path]; const text = v === undefined ? "未提供" : typeof v === "string" ? v : JSON.stringify(v); return <details><summary className="line-clamp-3 cursor-pointer break-words" title={text}>{text}</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{text}</pre></details>; } }))], [result.fieldCatalog]);
  async function exportRows(visible: boolean, format: "json" | "csv" = "json") {
    if (exportsInProgress.has(scope) || loading || error || !result.generation || result.queryKey !== JSON.stringify(saved.query)) { setNotice("請先完成目前條件的查詢，再匯出。"); return; }
    const defaults = [...activityComparisonColumns("user-events"), ...columns].filter(c => c.required || (c.defaultVisible && !(kind === 'ai' && ['issueTypeName','currentStatusName','currentPriorityName'].includes(c.id)))).map(c => c.id);
    const ids = saved.preferences?.visibleColumns?.length ? saved.preferences.visibleColumns : defaults;
    const allColumns = [...activityComparisonColumns("user-events"), ...columns];
    const visibleFields = ids.map(id => allColumns.find(c => c.id === id)?.queryField ?? id);
    const id = requestId(); exportsInProgress.set(scope, { id, startedAt: Date.now(), stage: "選擇匯出位置" }); setExportJob(id); setExportStage("選擇匯出位置"); setExportElapsed(0);
    try {
    const response = await window.desktopApp?.aiDatabase?.exportQuery({ requestId: id, kind, exportScope: visible ? "visible" : "all", visibleFields, format, query: { ...saved.query, expectedSnapshot: result.generation, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
    if (response?.ok === false) exportNotices.set(scope, response.errorCode === "CANCELLED" ? "匯出已取消，未發布檔案" : `匯出失敗：${response.message ?? response.errorCode}`); else if (!response?.canceled) exportNotices.set(scope, `${response?.resultStatus === "COMPLETED_WITH_WARNINGS" ? "附警告完成（含必要診斷欄）" : "表格結果已匯出"}：${response?.filePath} · 受限 ${response?.warningCount ?? 0}／搜尋未知 ${response?.searchUnknownCount ?? 0}`);
    } catch (error) { exportNotices.set(scope, `匯出失敗：${String(error)}`); } finally { exportsInProgress.delete(scope); if (alive.current) setExportJob(null); }
  }
  const displayResult = result.queryKey === JSON.stringify(saved.query) ? result : empty;
  const selection = normalizeAiSelectionV047(saved.query.filters.analysisStatus?.values).values;
  const changeStatuses = (values: readonly string[]) => setSaved(s => ({ ...s, query: integratedQueryV047({ ...s.query, page: 1, filters: { ...s.query.filters, analysisStatus: { values: [...values] } } }) }));
  const clearAll = () => setSaved(s => ({ ...s, query: integratedQueryV047({ ...s.query, page: 1, filters: {}, diffQuickFilters: { hideNoChange:false, hideZeroAdded:false, hideZeroDeleted:false, hideBeforeUnavailable:false } }, AI_STATUSES_V047) }));
  const restoreDefaults = () => setSaved(s => ({ ...s, query: { ...initial(kind).query, sort:s.query.sort, pageSize:s.query.pageSize } }));
  return <div className="min-w-0 space-y-4" data-testid={`${kind === "ai" ? "ai-results" : "integrated-results"}-page`}>
    <PageHeader title={kind === "ai" ? "AI 結果檢視" : "整合顯示結果"} subtitle={kind === "ai" ? "AI Results Viewer" : "Integrated Results"} connected={false} />
    {kind === "integrated" && result.integrationState ? <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">{aiStatusLabelV043(result.integrationState)}</div> : null}
    {kind === "integrated" ? <AiStatusFilterV047 selection={selection} result={displayResult} loading={loading} onChange={changeStatuses} onClear={clearAll} onReset={restoreDefaults} /> : null}
    {exportJob ? <div role="status" className="flex flex-wrap items-center gap-3 border-l-4 border-blue-500 bg-blue-50 p-3 text-sm"><span>{exportStage} · {exportElapsed.toFixed(1)} 秒</span><button className="btn" disabled={exportStage === "正在取消匯出…"} onClick={() => { const job = exportsInProgress.get(scope); if (job) job.stage = "正在取消匯出…"; setExportStage("正在取消匯出…"); void window.desktopApp?.aiDatabase?.cancelQuery({ requestId: exportJob }).then(r => setExportStage(r.executorStopped ? "已取消，未發布檔案" : "工作已完成或尚在選擇位置")).catch(e => setExportStage(`取消請求失敗：${String(e)}`)); }}><X size={16} />取消匯出</button></div> : null}
    {result.queryKey === JSON.stringify(saved.query) && (result.warningCount > 0 || result.searchUnknownCount > 0) ? <div role="status" data-query-warning="true" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">差異計算受限：{result.warningCount} 筆。{result.searchUnknownCount > 0 ? `搜尋範圍不完整：${result.searchUnknownCount} 筆 Diff 無法判定；清除 Diff 搜尋可查看。` : ""} 匯出會附加必要診斷欄與覆蓋資訊。</div> : null}
    {notice ? <p role="status" className="break-words text-sm">{notice}</p> : null}
    {loading ? <div role="status" className="flex flex-wrap items-center gap-3 border-l-4 border-blue-500 bg-blue-50 p-3 text-sm"><span>{stage} · {elapsed.toFixed(1)} 秒</span><button className="btn" disabled={cancelRequested} onClick={() => void cancel()}><X size={16} />{cancelRequested ? "正在取消…" : "取消查詢"}</button></div> : null}
    {error && result.rows.length > 0 ? <p role="alert" className="text-sm text-amber-800">查詢未完成，下方保留上次成功結果：{error}</p> : null}
    <SectionCard title={loading && !result.generation ? "正在查詢完整資料…" : (displayResult.countsKnown === false ? "— / — 筆" : displayResult.filteredCount.toLocaleString() + " / " + displayResult.totalCount.toLocaleString() + " 筆")} subtitle={kind === "ai" ? "分析當時的事件快照" : "原始事件與唯一配對分析"} action={<div className="flex flex-wrap gap-2"><button className="btn" disabled={loading} onClick={() => void load(true)}><RefreshCw size={16} />重新整理</button><details className="relative"><summary className="btn cursor-pointer"><Download size={16} />匯出表格</summary><div className="absolute right-0 z-30 grid w-48 gap-2 border bg-white p-2 shadow-lg"><button className="btn" disabled={loading || Boolean(error) || displayResult.countsKnown === false} onClick={() => void exportRows(true)}>顯示欄位</button><button className="btn" disabled={loading || Boolean(error) || displayResult.countsKnown === false} onClick={() => void exportRows(false)}>全部欄位 JSON</button><button className="btn" disabled={loading || Boolean(error) || displayResult.countsKnown === false} onClick={() => void exportRows(true, "csv")}>顯示欄位 CSV</button><button className="btn" disabled={loading || Boolean(error) || displayResult.countsKnown === false} onClick={() => void exportRows(false, "csv")}>全部欄位 CSV</button></div></details></div>}>
      <ActivityComparisonTable tableId={scope} fullResultFilters mode="user-events" hiddenDefaultColumns={kind === 'ai' ? ['issueTypeName','currentStatusName','currentPriorityName'] : []} additionalColumns={columns} result={displayResult} query={saved.query} loading={loading} error={error} emptySelectionFields={kind === "integrated" ? ["analysisStatus"] : []} onClearFilters={kind === "integrated" ? clearAll : undefined} onQueryChange={query => setSaved(s => ({ ...s, query: kind === "integrated" ? integratedQueryV047(query, AI_STATUSES_V047) : query }))} preferences={saved.preferences} onPreferencesChange={preferences => setSaved(s => ({ ...s, preferences }))} sessionState={saved.session} onSessionStateChange={session => setSaved(s => ({ ...s, session }))} loadDistinct={loadDistinct} />
    </SectionCard>
  </div>;
}
function ViewerHost({ kind }: { kind: Variant }) {
  const runtime = useRuntimeStatus();
  const rawIdentity = runtime.state.database.databaseId || "";
  const [identity, setIdentity] = useState<Json | null>(null), [error, setError] = useState("");
  useEffect(() => { let active = true; void window.desktopApp?.aiDatabase?.lifecycle({ requestId: requestId() }).then(response => { if (active) { if (!response.ok) setError(response.message); else setIdentity(response.snapshot); } }).catch(e => { if (active) setError(String(e)); }); return () => { active = false; }; }, [rawIdentity, kind]);
  if (!identity) return <p role="status">{error || "正在讀取資料庫狀態…"}</p>;
  const legacyScope = `v043|${kind}|${rawIdentity}|${identity.databaseId ?? ""}|${identity.modifiedAtUtc ?? ""}|${identity.schemaVersion ?? ""}`;
  const scope = `v045|${kind}|${rawIdentity}|${identity.databaseId ?? ''}|${identity.schemaVersion ?? ''}`;
  return <Viewer key={scope} kind={kind} scope={scope} legacyScope={legacyScope} contentRevision={identity.contentRevision ?? ''} aiIdentity={identity.databaseId ?? ""} rawIdentity={rawIdentity} />;
}
export function AiResultsPageV043() { return <ViewerHost kind="ai" />; }
export function IntegratedResultsPageV043() { return <ViewerHost kind="integrated" />; }
