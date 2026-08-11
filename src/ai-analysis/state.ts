import { useReducer } from "react";
import { analysisBasisFiles, analyzedDatasetFixture, diagnosticStepTemplate, pendingDatasetFixtures } from "./fixtures";
import type { AiMainTab, AiMode, AiServiceState, AnalysisBasisFile, AnalysisRunState, AnalyzedDataset, ChatMessage, DiagnosticStepStatus, PendingDataset, ResultsView } from "./types";

export type AiAnalysisState = {
  activeTab: AiMainTab;
  selectedService: "cloud" | "local";
  analysisMode: AiMode;
  services: Record<"cloud" | "local", AiServiceState>;
  basisFiles: AnalysisBasisFile[];
  pendingDatasets: PendingDataset[];
  selectedPendingId: string | null;
  pendingImportError: string | null;
  analyzedDatasets: AnalyzedDataset[];
  selectedAnalyzedId: string | null;
  analyzedImportError: string | null;
  activeRun: AnalysisRunState | null;
  resultsView: ResultsView;
  generatedReportIds: string[];
  chatSessionIds: Record<"cloud" | "local", string>;
  chatMessages: Record<"cloud" | "local", ChatMessage[]>;
  notice: string | null;
};

export type AiAnalysisAction =
  | { type: "select_tab"; tab: AiMainTab }
  | { type: "select_service"; service: "cloud" | "local" }
  | { type: "select_mode"; mode: AiMode }
  | { type: "update_setting"; service: "cloud" | "local"; field: keyof AiServiceState["form"]; value: string }
  | { type: "save_settings"; service: "cloud" | "local"; at: string }
  | { type: "diagnostic_start"; service: "cloud" | "local"; runId: string; at: string }
  | { type: "diagnostic_step"; service: "cloud" | "local"; stepId: string; status: DiagnosticStepStatus; at: string; durationMs?: number }
  | { type: "diagnostic_complete"; service: "cloud" | "local"; at: string }
  | { type: "diagnostic_failed"; service: "cloud" | "local"; stepId: string; at: string; message: string }
  | { type: "select_pending"; id: string }
  | { type: "import_pending"; dataset: PendingDataset }
  | { type: "pending_import_error"; message: string | null }
  | { type: "select_analyzed"; id: string }
  | { type: "import_analyzed"; dataset: AnalyzedDataset }
  | { type: "analyzed_import_error"; message: string | null }
  | { type: "start_analysis"; run: AnalysisRunState; dataset: AnalyzedDataset }
  | { type: "run_progress"; runId: string; progress: number; step: string }
  | { type: "run_complete"; runId: string; completedAt: string }
  | { type: "select_results_view"; view: ResultsView }
  | { type: "report_generated"; datasetId: string }
  | { type: "new_chat"; service: "cloud" | "local"; sessionId: string }
  | { type: "append_chat"; service: "cloud" | "local"; messages: ChatMessage[] }
  | { type: "notice"; message: string | null };

function initialService(mode: "cloud" | "local"): AiServiceState {
  const local = mode === "local";
  return {
    mode,
    configured: local,
    savedAt: local ? "今天 11:40" : null,
    tested: local,
    testStatus: local ? "passed" : "not_configured",
    testedAt: local ? "今天 11:42" : null,
    settingsVersion: 1,
    testedSettingsVersion: local ? 1 : null,
    diagnosticRunId: local ? "DIAG-LOCAL-DEMO-017" : null,
    diagnosticSteps: diagnosticStepTemplate.map((step, index) => local ? { ...step, status: "passed", startedAt: "11:42:" + String(16 + index).padStart(2, "0"), completedAt: "11:42:" + String(17 + index).padStart(2, "0"), durationMs: 72 + index * 83, responseSummary: "HTTP 200 · sanitized mock response" } : { ...step }),
    form: local ? {
      provider: "AI Nexus", endpoint: "https://ai.example.internal/v1", model: "Qwen3-30B", apiContract: "OpenAI-compatible · Chat Completions", authType: "Bearer Token", accessToken: "", contextWindow: "32768", timeoutSeconds: "180"
    } : {
      provider: "OpenAI Cloud", endpoint: "https://api.openai.example/v1", model: "GPT-5", apiContract: "Responses API", authType: "API Key", accessToken: "", contextWindow: "128000", timeoutSeconds: "120"
    }
  };
}

export const initialAiAnalysisState: AiAnalysisState = {
  activeTab: "diagnostics",
  selectedService: "local",
  analysisMode: "local",
  services: { cloud: initialService("cloud"), local: initialService("local") },
  basisFiles: analysisBasisFiles.map((item) => ({ ...item })),
  pendingDatasets: pendingDatasetFixtures.map((item) => ({ ...item, previews: item.previews.map((preview) => ({ ...preview })) })),
  selectedPendingId: pendingDatasetFixtures[0].id,
  pendingImportError: null,
  analyzedDatasets: [{ ...analyzedDatasetFixture, records: analyzedDatasetFixture.records.map((record) => ({ ...record, skills: record.skills.map((skill) => ({ ...skill })) })) }],
  selectedAnalyzedId: analyzedDatasetFixture.id,
  analyzedImportError: null,
  activeRun: null,
  resultsView: "records",
  generatedReportIds: [],
  chatSessionIds: { cloud: "CHAT-CLOUD-DEMO-001", local: "CHAT-LOCAL-DEMO-017" },
  chatMessages: { cloud: [], local: [
    { id: "message-demo-1", role: "user", service: "local", provider: "AI Nexus", model: "Qwen3-30B", createdAt: "11:46:03", durationMs: null, tokenUsage: null, text: "請用一句話說明目前使用的模型，並回覆連線是否正常。", simulated: true },
    { id: "message-demo-2", role: "assistant", service: "local", provider: "AI Nexus", model: "Qwen3-30B", createdAt: "11:46:04", durationMs: 816, tokenUsage: 39, text: "模擬回覆：目前使用 Qwen3-30B；本次靜態連線示範正常，未送出任何網路請求。", simulated: true }
  ] },
  notice: null
};

function updateService(state: AiAnalysisState, service: "cloud" | "local", update: (value: AiServiceState) => AiServiceState) {
  return { ...state, services: { ...state.services, [service]: update(state.services[service]) } };
}

export function aiAnalysisReducer(state: AiAnalysisState, action: AiAnalysisAction): AiAnalysisState {
  switch (action.type) {
    case "select_tab": return { ...state, activeTab: action.tab, notice: null };
    case "select_service": return { ...state, selectedService: action.service, notice: null };
    case "select_mode": return { ...state, analysisMode: action.mode, notice: null };
    case "update_setting": return updateService(state, action.service, (service) => ({ ...service, form: { ...service.form, [action.field]: action.value }, settingsVersion: service.settingsVersion + 1, tested: false, testStatus: service.configured ? "not_tested" : "not_configured", testedSettingsVersion: null, testedAt: null }));
    case "save_settings": return { ...updateService(state, action.service, (service) => ({ ...service, configured: true, savedAt: action.at, tested: false, testStatus: "not_tested", testedSettingsVersion: null, testedAt: null })), notice: "設定已保存於本頁前端 state；尚未寫入本機檔案。" };
    case "diagnostic_start": return updateService({ ...state, notice: null }, action.service, (service) => ({ ...service, tested: false, testStatus: "running", diagnosticRunId: action.runId, diagnosticSteps: diagnosticStepTemplate.map((step) => ({ ...step })) }));
    case "diagnostic_step": return updateService(state, action.service, (service) => ({ ...service, diagnosticSteps: service.diagnosticSteps.map((step) => step.id === action.stepId ? { ...step, status: action.status, startedAt: step.startedAt ?? action.at, completedAt: action.status === "running" ? null : action.at, durationMs: action.durationMs ?? null, responseSummary: action.status === "passed" ? "HTTP 200 · sanitized simulated response" : step.responseSummary } : step) }));
    case "diagnostic_complete": return { ...updateService(state, action.service, (service) => ({ ...service, tested: true, testStatus: "passed", testedAt: action.at, testedSettingsVersion: service.settingsVersion })), notice: "完整 mock 診斷已通過；未發送任何網路請求。" };
    case "diagnostic_failed": return { ...updateService(state, action.service, (service) => ({ ...service, tested: true, testStatus: "failed", testedAt: action.at, testedSettingsVersion: service.settingsVersion, diagnosticSteps: service.diagnosticSteps.map((step) => step.id === action.stepId ? { ...step, status: "failed", completedAt: action.at, errorCategory: "SIMULATED_FAILURE", message: action.message } : step) })), notice: action.message };
    case "select_pending": return { ...state, selectedPendingId: action.id, pendingImportError: null };
    case "import_pending": return { ...state, pendingDatasets: [action.dataset, ...state.pendingDatasets], selectedPendingId: action.dataset.id, pendingImportError: null };
    case "pending_import_error": return { ...state, pendingImportError: action.message };
    case "select_analyzed": return { ...state, selectedAnalyzedId: action.id, analyzedImportError: null, resultsView: "records" };
    case "import_analyzed": return { ...state, analyzedDatasets: [action.dataset, ...state.analyzedDatasets], selectedAnalyzedId: action.dataset.id, analyzedImportError: null, resultsView: "records" };
    case "analyzed_import_error": return { ...state, analyzedImportError: action.message };
    case "start_analysis": return { ...state, activeTab: "results", analyzedDatasets: [action.dataset, ...state.analyzedDatasets], selectedAnalyzedId: action.dataset.id, activeRun: action.run, resultsView: "records", notice: "Mock Analysis Run 已建立；未呼叫真實 AI。" };
    case "run_progress": return { ...state, activeRun: state.activeRun?.id === action.runId ? { ...state.activeRun, progress: action.progress, currentStep: action.step } : state.activeRun, analyzedDatasets: state.analyzedDatasets.map((dataset) => dataset.id === state.activeRun?.outputAnalyzedId ? { ...dataset, progress: action.progress, currentStep: action.step } : dataset) };
    case "run_complete": return { ...state, activeRun: state.activeRun?.id === action.runId ? { ...state.activeRun, status: "completed", progress: 100, currentStep: "已分析完畢", completedAt: action.completedAt } : state.activeRun, analyzedDatasets: state.analyzedDatasets.map((dataset) => dataset.id === state.activeRun?.outputAnalyzedId ? { ...dataset, status: "completed", progress: 100, currentStep: "已分析完畢" } : dataset), notice: "Static UI mock analysis completed；結果並非真實 AI 產出。" };
    case "select_results_view": return { ...state, resultsView: action.view };
    case "report_generated": return { ...state, generatedReportIds: Array.from(new Set([...state.generatedReportIds, action.datasetId])), notice: "自包含 HTML 報告已在前端產生。" };
    case "new_chat": return { ...state, chatSessionIds: { ...state.chatSessionIds, [action.service]: action.sessionId }, chatMessages: { ...state.chatMessages, [action.service]: [] }, notice: "已建立新的 mock 對話 Session。" };
    case "append_chat": return { ...state, chatMessages: { ...state.chatMessages, [action.service]: [...state.chatMessages[action.service], ...action.messages] } };
    case "notice": return { ...state, notice: action.message };
    default: return state;
  }
}

export function useAiAnalysisState() {
  return useReducer(aiAnalysisReducer, initialAiAnalysisState);
}
