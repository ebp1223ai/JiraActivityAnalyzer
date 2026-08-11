import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout";
import { AiAnalysisTabs } from "../ai-analysis/AiAnalysisTabs";
import { AiDiagnosticsTab } from "../ai-analysis/AiDiagnosticsTab";
import { AnalysisWorkspaceTab } from "../ai-analysis/AnalysisWorkspaceTab";
import { AnalysisResultsTab } from "../ai-analysis/AnalysisResultsTab";
import { analysisBasisFiles, analysisRecordsFixture, analyzedDatasetFixture } from "../ai-analysis/fixtures";
import { analysisBlockers, analyzedFileName, serviceLabel } from "../ai-analysis/helpers";
import { useAiAnalysisState } from "../ai-analysis/state";
import type { AnalysisRunState, AnalyzedDataset } from "../ai-analysis/types";

export function AiAnalysisPage() {
  const [state, dispatch] = useAiAnalysisState();
  const [generatingReport, setGeneratingReport] = useState(false);
  const timers = useRef<number[]>([]);
  const { appendDebugLog } = useOutletContext<AppOutletContext>();

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function schedule(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function runDiagnostic(serviceKey: "cloud" | "local") {
    const service = state.services[serviceKey];
    if (!service.configured) {
      dispatch({ type: "notice", message: "請先儲存設定，再執行完整診斷。" });
      return;
    }
    const runId = "DIAG-" + serviceKey.toUpperCase() + "-MOCK-" + Date.now();
    const now = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    dispatch({ type: "diagnostic_start", service: serviceKey, runId, at: now });
    appendDebugLog("analysis", ["[INFO] Static UI mock diagnostic started", "[INFO] Service: " + serviceKey, "[INFO] Authorization: [masked]", "[INFO] No network request sent"]);
    state.services[serviceKey].diagnosticSteps.forEach((step, index) => {
      schedule(() => dispatch({ type: "diagnostic_step", service: serviceKey, stepId: step.id, status: "running", at: new Date().toLocaleTimeString("zh-TW", { hour12: false }) }), index * 180 + 80);
      schedule(() => dispatch({ type: "diagnostic_step", service: serviceKey, stepId: step.id, status: "passed", at: new Date().toLocaleTimeString("zh-TW", { hour12: false }), durationMs: 72 + index * 83 }), index * 180 + 220);
    });
    schedule(() => {
      dispatch({ type: "diagnostic_complete", service: serviceKey, at: new Date().toLocaleString("zh-TW") });
      appendDebugLog("analysis", ["[INFO] Static UI mock diagnostic passed", "[INFO] 7 / 7 simulated checks passed", "[INFO] Token: [masked]"]);
    }, 7 * 180 + 280);
  }

  function startAnalysis() {
    const pending = state.pendingDatasets.find((item) => item.id === state.selectedPendingId) ?? null;
    const service = state.analysisMode === "offline" ? null : state.services[state.analysisMode];
    const blockers = analysisBlockers(state.analysisMode, service, pending, state.basisFiles);
    if (state.activeRun?.status === "running") blockers.push("已有 mock Analysis Run 執行中");
    if (blockers.length || !pending) {
      dispatch({ type: "notice", message: blockers.join("；") || "目前無法開始分析。" });
      return;
    }
    const createdAt = new Date().toISOString();
    const runId = "ANALYSIS-MOCK-" + Date.now();
    const outputId = "analyzed-mock-" + Date.now();
    const snapshot = state.analysisMode === "offline"
      ? { mode: "offline" as const, provider: "Offline Rules", model: "Catalog 0.3.0", settingsVersion: null, basisVersions: analysisBasisFiles.map((item) => item.version), basisHashes: analysisBasisFiles.map((item) => item.sha256) }
      : { mode: state.analysisMode, provider: service?.form.provider ?? "-", model: service?.form.model ?? "-", settingsVersion: service?.settingsVersion ?? null, basisVersions: analysisBasisFiles.map((item) => item.version), basisHashes: analysisBasisFiles.map((item) => item.sha256) };
    const dataset: AnalyzedDataset = {
      ...analyzedDatasetFixture,
      id: outputId,
      fileName: analyzedFileName(pending.fileName),
      status: "running",
      sourcePendingFileName: pending.fileName,
      subject: pending.subject,
      dateRange: pending.dateRange,
      eventCount: pending.eventCount,
      diffCount: pending.eventCount,
      issueCount: pending.issueCount,
      projectCount: pending.projectCount,
      jiraServer: pending.jiraServer,
      sourceDatabase: pending.sourceDatabase,
      importedAt: "剛剛",
      progress: 4,
      currentStep: "建立 frozen run snapshot",
      snapshot,
      records: analysisRecordsFixture.map((record) => ({ ...record, skills: record.skills.map((skill) => ({ ...skill })) }))
    };
    const run: AnalysisRunState = { id: runId, status: "running", sourcePendingId: pending.id, outputAnalyzedId: outputId, snapshot, progress: 4, currentStep: "建立 frozen run snapshot", startedAt: createdAt, completedAt: null };
    dispatch({ type: "start_analysis", run, dataset });
    appendDebugLog("analysis", ["[INFO] Static UI mock Analysis Run started", "[INFO] Mode: " + state.analysisMode, "[INFO] Source: " + pending.fileName, "[INFO] No AI request sent", "[INFO] No database write performed"]);
    [[28, "驗證 117 筆 Evidence identity"], [56, "套用 Skill Catalog 與 Common Rules"], [82, "建立逐筆 mock analysis records"], [100, "完成 static UI mock output"]].forEach(([progress, step], index) => schedule(() => {
      dispatch({ type: "run_progress", runId, progress: Number(progress), step: String(step) });
      if (progress === 100) {
        dispatch({ type: "run_complete", runId, completedAt: new Date().toISOString() });
        appendDebugLog("analysis", ["[INFO] Static UI mock Analysis Run completed", "[INFO] Output: " + dataset.fileName, "[INFO] Result is simulated"]);
      }
    }, 350 + index * 400));
  }

  function generateReport(datasetId: string) {
    if (generatingReport) return;
    setGeneratingReport(true);
    schedule(() => {
      dispatch({ type: "report_generated", datasetId });
      setGeneratingReport(false);
      appendDebugLog("analysis", ["[INFO] Self-contained static report generated in renderer memory", "[INFO] No filesystem write performed"]);
    }, 550);
  }

  return <div className="min-w-0 pb-8">
    <header className="mb-4 flex min-w-0 items-start gap-3"><span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white"><Sparkles size={20} /></span><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-wider text-blue-600">Skill Analysis Workspace</div><h1 className="mt-1 text-2xl font-black leading-tight text-ink">AI Analysis</h1><p className="mt-1 max-w-4xl break-words text-sm font-semibold leading-relaxed text-muted">匯入已整理的 Activity Events、選擇分析方式、檢視結果並產出技能分析報告。</p></div></header>
    <AiAnalysisTabs active={state.activeTab} analyzedCount={state.analyzedDatasets.length} onChange={(tab) => dispatch({ type: "select_tab", tab })} />
    {state.notice ? <div className="mb-4 flex min-w-0 items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900"><Check className="mt-0.5 shrink-0" size={16} /><span className="min-w-0 flex-1 break-words">{state.notice}</span><button type="button" className="shrink-0 rounded p-1 hover:bg-blue-100" aria-label="關閉通知" onClick={() => dispatch({ type: "notice", message: null })}><X size={15} /></button></div> : null}
    {state.activeTab === "diagnostics" ? <AiDiagnosticsTab state={state} dispatch={dispatch} onDiagnose={runDiagnostic} /> : null}
    {state.activeTab === "workspace" ? <AnalysisWorkspaceTab state={state} dispatch={dispatch} onStart={startAnalysis} /> : null}
    {state.activeTab === "results" ? <AnalysisResultsTab state={state} dispatch={dispatch} onGenerateReport={generateReport} generatingReport={generatingReport} /> : null}
    <footer className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-600"><b>Phase 1 · Static Interactive UI Only：</b>設定、診斷、對話、分析、檔案清單與輸出皆為 mock。沒有呼叫 AI／Jira、沒有讀寫 SQLite，也沒有建立 backend queue 或 IPC。</footer>
  </div>;
}
