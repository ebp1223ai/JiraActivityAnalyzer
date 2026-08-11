import { AlertTriangle, Check, Cloud, Cpu, FileCog, FileJson, FolderOpen, Play, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { analysisBlockers, pendingDatasetFromPayload, serviceLabel, serviceReady } from "./helpers";
import type { AiAnalysisAction, AiAnalysisState } from "./state";
import type { AiMode, PendingDataset } from "./types";

function SharedAnalysisBasis({ state, dispatch }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction> }) {
  const validCount = state.basisFiles.filter((item) => item.status === "verified").length;
  return <SectionCard title="共用分析依據" subtitle="Shared Analysis Basis" action={<StatusBadge tone={validCount === state.basisFiles.length ? "green" : "red"}>{validCount} / {state.basisFiles.length} 已驗證</StatusBadge>}>
    <p className="mb-3 text-sm font-semibold leading-relaxed text-muted">雲端 AI、地端 AI 與離線分析共用同一組 Catalog、Common Rules 與 Manifest；每次 Run 凍結版本及 Hash snapshot。</p>
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
      <div className="rounded-md border border-line bg-slate-50 p-3"><div className="text-xs font-black text-slate-700">分析依據資料夾</div><div className="mt-2 flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1 truncate rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold" title="F:\\JiraActivityAnalyzer\\skill-analysis-basis\\2026.08">F:\JiraActivityAnalyzer\skill-analysis-basis\2026.08</div><button className="btn shrink-0 px-3" type="button" title="瀏覽資料夾（mock）" onClick={() => dispatch({ type: "notice", message: "Mock：本輪不會開啟或保存本機分析依據資料夾。" })}><FolderOpen size={15} /></button></div><div className="mt-2 text-[11px] leading-snug text-muted">本機路徑及規則原始檔不會上傳；本輪也不會傳輸任何資料。</div></div>
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3">{state.basisFiles.map((item) => <div key={item.kind} className="min-w-0 rounded-md border border-line bg-white p-3"><div className="truncate text-xs font-black text-ink" title={item.fileName}>{item.fileName}</div><div className="mt-2 text-[11px] font-semibold text-muted">Version {item.version}</div><div className="mt-1 truncate font-mono text-[10px] text-slate-500" title={item.sha256}>SHA-256 {item.sha256}</div><div className="mt-2 text-xs font-bold text-emerald-700"><Check className="mr-1 inline" size={13} />Verified</div></div>)}</div>
    </div>
    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs font-semibold text-muted"><span>目前套用：雲端 AI · 地端 AI · 離線分析</span><button className="btn py-2" type="button" onClick={() => dispatch({ type: "notice", message: "3 / 3 分析依據已完成 mock 重新驗證。" })}><RefreshCw size={14} />重新驗證</button></div>
  </SectionCard>;
}

function ModeSelector({ state, dispatch }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction> }) {
  const modes: Array<{ id: AiMode; title: string; badge: string; description: string; icon: typeof Cloud; color: string }> = [
    { id: "cloud", title: "雲端 AI 分析", badge: "需要外網", description: "使用雲端模型執行高品質語意分類；本輪只做 mock。", icon: Cloud, color: "border-blue-400 bg-blue-50 text-blue-700" },
    { id: "local", title: "地端 AI 分析", badge: "內網可用", description: "透過公司內網模型執行；本輪不會連線。", icon: Cpu, color: "border-emerald-400 bg-emerald-50 text-emerald-700" },
    { id: "offline", title: "離線分析", badge: "無需網路", description: "使用 Catalog 與規則產生可重現的示範結果。", icon: FileCog, color: "border-amber-400 bg-amber-50 text-amber-800" }
  ];
  return <SectionCard className="mt-4" title="選擇分析方式" subtitle="Analysis Mode">
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">{modes.map((mode) => { const Icon = mode.icon; const selected = state.analysisMode === mode.id; return <button key={mode.id} type="button" data-testid={"analysis-mode-" + mode.id} className={"min-w-0 rounded-md border p-4 text-left transition " + (selected ? mode.color : "border-line bg-white text-slate-700 hover:bg-slate-50")} onClick={() => dispatch({ type: "select_mode", mode: mode.id })}><div className="flex min-w-0 items-start gap-3"><Icon className="shrink-0" size={20} /><span className="min-w-0 flex-1"><span className="block text-sm font-black">{mode.title}</span><span className="mt-1 inline-block rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-black">{mode.badge}</span><span className="mt-2 block break-words text-xs font-semibold leading-snug text-current/75">{mode.description}</span></span></div></button>; })}</div>
    {state.analysisMode !== "offline" ? <ServiceReadiness state={state} dispatch={dispatch} /> : <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"><FileCog className="mr-2 inline" size={16} />離線分析不依賴 AI 設定或診斷，只需要有效資料檔與已驗證的共用分析依據。</div>}
  </SectionCard>;
}

function ServiceReadiness({ state, dispatch }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction> }) {
  const service = state.services[state.analysisMode === "cloud" ? "cloud" : "local"];
  const ready = serviceReady(service);
  const label = !service.configured ? "尚未設定" : ready ? "測試通過" : service.testStatus === "failed" ? "測試失敗" : "已設定、尚未測試";
  return <div className={"mt-3 flex min-w-0 flex-wrap items-center gap-3 rounded-md border p-3 " + (ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}><ShieldCheck className={ready ? "text-emerald-700" : "text-amber-700"} size={18} /><div className="min-w-0 flex-1"><div className="text-sm font-black text-ink">{serviceLabel(state.analysisMode)}執行狀態：{label}</div><div className="mt-1 break-words text-xs font-semibold text-muted">{service.form.provider} · {service.form.model} · 最近測試 {service.testedAt ?? "-"}</div></div><button className="btn py-2" type="button" onClick={() => { dispatch({ type: "select_service", service: service.mode }); dispatch({ type: "select_tab", tab: "diagnostics" }); }}>前往 AI 連線與診斷</button></div>;
}

function PendingFilePanel({ state, dispatch }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction> }) {
  const selected = state.pendingDatasets.find((item) => item.id === state.selectedPendingId) ?? null;
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) { dispatch({ type: "pending_import_error", message: "只接受 JSON 待分析資料檔。" }); return; }
    try {
      const payload: unknown = JSON.parse(await file.text());
      const dataset = pendingDatasetFromPayload(file.name, payload);
      if (!dataset) throw new Error("檔案不是 Pending Analysis Dataset，或 schema／records 不完整。");
      dispatch({ type: "import_pending", dataset });
    } catch (error) { dispatch({ type: "pending_import_error", message: error instanceof Error ? error.message : "待分析檔案格式錯誤。" }); }
  };
  return <SectionCard className="mt-4" title="選擇資料檔" subtitle="Pending Analysis Dataset">
    <p className="mb-3 text-sm font-semibold text-muted">本工作區只匯入與顯示待分析資料檔；一次選取一個目前分析來源。</p>
    <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="min-w-0 rounded-md border border-line bg-slate-50 p-3">
        <label className="btn btn-primary w-full cursor-pointer"><Upload size={16} />匯入待分析資料檔<input data-testid="pending-file-input" className="hidden" type="file" accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        <div className="mt-3 text-xs font-black text-muted">目前待分析資料檔 <span className="text-blue-700">{state.pendingDatasets.length}</span></div>
        <div className="thin-scroll mt-2 max-h-80 space-y-2 overflow-y-auto">{state.pendingDatasets.length ? state.pendingDatasets.map((dataset) => <button key={dataset.id} type="button" className={"w-full min-w-0 rounded-md border p-3 text-left " + (dataset.id === state.selectedPendingId ? "border-blue-400 bg-blue-50" : "border-line bg-white hover:bg-slate-50")} onClick={() => dispatch({ type: "select_pending", id: dataset.id })}><div className="flex min-w-0 items-start gap-2"><FileJson className="shrink-0 text-blue-600" size={17} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-ink" title={dataset.fileName}>{dataset.fileName}</span><span className="mt-1 block text-[11px] font-semibold text-muted">{dataset.subject} · {dataset.eventCount} Events</span></span></div></button>) : <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-muted">尚未匯入待分析資料檔</div>}</div>
        {state.pendingImportError ? <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{state.pendingImportError}</div> : null}
      </div>
      {selected ? <PendingSummary dataset={selected} /> : <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm font-semibold text-muted">選取待分析資料檔以查看摘要</div>}
    </div>
  </SectionCard>;
}

function PendingSummary({ dataset }: { dataset: PendingDataset }) {
  return <div className="min-w-0 rounded-md border border-line bg-white p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><StatusBadge tone="amber">PENDING ANALYSIS</StatusBadge><h3 className="mt-2 break-words text-base font-black text-ink" title={dataset.fileName}>{dataset.fileName}</h3><p className="mt-1 text-xs font-semibold text-muted">{dataset.subject}</p></div><button className="btn py-2" type="button"><ShieldCheck size={14} />檢查檔案完整性 ✓</button></div>
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[["分析對象", dataset.subject], ["日期範圍", dataset.dateRange], ["Activity Events", dataset.eventCount], ["Issues / Projects", dataset.issueCount + " / " + dataset.projectCount], ["Jira Server", dataset.jiraServer], ["來源資料庫", dataset.sourceDatabase]].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-md bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-muted">{label}</div><div className="mt-1 break-words text-xs font-bold text-slate-800" title={String(value)}>{value}</div></div>)}</div>
    <div className="mt-4 text-xs font-black text-slate-700">Activity Event 內容預覽 <span className="font-semibold text-muted">· 前 {dataset.previews.length} 筆</span></div><div className="mt-2 divide-y divide-line rounded-md border border-line">{dataset.previews.map((event) => <div key={event.id} className="grid min-w-0 grid-cols-1 gap-2 p-3 md:grid-cols-[170px_minmax(0,1fr)_90px]"><div><div className="text-xs font-black text-blue-700">{event.id}</div><div className="mt-1 text-[11px] font-semibold text-muted">{event.issueKey} · {event.field}</div></div><div className="break-words text-xs font-semibold leading-relaxed text-slate-700">{event.summary}</div><div className="text-xs font-black text-emerald-700">+{event.added} <span className="text-red-600">−{event.deleted}</span></div></div>)}</div>
    <div className="mt-3 text-xs font-bold text-emerald-700"><Check className="mr-1 inline" size={14} />{dataset.eventCount} / {dataset.eventCount} Evidence 可唯一追溯</div>
  </div>;
}

export function AnalysisWorkspaceTab({ state, dispatch, onStart }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction>; onStart: () => void }) {
  const selected = state.pendingDatasets.find((item) => item.id === state.selectedPendingId) ?? null;
  const service = state.analysisMode === "offline" ? null : state.services[state.analysisMode];
  const blockers = analysisBlockers(state.analysisMode, service, selected, state.basisFiles);
  return <div data-testid="analysis-workspace-tab">
    <SharedAnalysisBasis state={state} dispatch={dispatch} />
    <ModeSelector state={state} dispatch={dispatch} />
    <PendingFilePanel state={state} dispatch={dispatch} />
    <div className="mt-4 flex min-w-0 flex-col items-stretch justify-between gap-3 rounded-md border border-line bg-white p-4 lg:flex-row lg:items-center"><div className="min-w-0">{blockers.length ? <div><div className="flex items-center gap-2 text-sm font-black text-amber-800"><AlertTriangle size={17} />目前無法開始分析</div><ul className="mt-2 space-y-1 text-xs font-semibold text-amber-800">{blockers.map((blocker) => <li key={blocker}>· {blocker}</li>)}</ul></div> : <div className="text-sm font-black text-emerald-700"><Check className="mr-2 inline" size={17} />分析條件已就緒；將建立 static UI mock run。</div>}</div><button data-testid="start-analysis" className="btn btn-primary shrink-0" type="button" disabled={blockers.length > 0} onClick={onStart}><Play size={16} />使用{serviceLabel(state.analysisMode)}開始分析 →</button></div>
  </div>;
}
