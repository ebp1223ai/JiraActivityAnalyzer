import { useState } from "react";
import { Check, Clipboard, Cloud, Cpu, FileSearch, FolderOpen, MessageSquare, Play, Plus, Save, ShieldCheck } from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { sanitizeDiagnosticPayload } from "./helpers";
import type { AiAnalysisAction, AiAnalysisState } from "./state";
import type { AiServiceState } from "./types";

function serviceStatus(service: AiServiceState) {
  if (!service.configured) return { label: "尚未設定", tone: "gray" as const };
  if (service.testStatus === "passed" && service.testedSettingsVersion === service.settingsVersion) return { label: "測試通過", tone: "green" as const };
  if (service.testStatus === "failed") return { label: "測試失敗", tone: "red" as const };
  if (service.testStatus === "running") return { label: "診斷中", tone: "blue" as const };
  return { label: "已設定、尚未測試", tone: "amber" as const };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-black text-slate-700">{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span> : null}</label>;
}

function SettingsForm({ service, dispatch, onDiagnose }: { service: AiServiceState; dispatch: React.Dispatch<AiAnalysisAction>; onDiagnose: (service: "cloud" | "local") => void }) {
  const status = serviceStatus(service);
  const update = (field: keyof AiServiceState["form"], value: string) => dispatch({ type: "update_setting", service: service.mode, field, value });
  return <SectionCard
    title={service.mode === "cloud" ? "雲端 AI 設定" : "地端 AI 設定"}
    subtitle={service.mode === "cloud" ? "Cloud AI Connection" : "Local AI Connection"}
    action={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
  >
    <p className="mb-4 text-sm font-semibold leading-relaxed text-muted">設定只保存於本頁前端 state。修改 Endpoint、Model 或其他欄位後，既有診斷結果會立即失效。</p>
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <Field label="Runtime / Provider"><select className="field" value={service.form.provider} onChange={(event) => update("provider", event.target.value)}><option>{service.mode === "cloud" ? "OpenAI Cloud" : "AI Nexus"}</option><option>{service.mode === "cloud" ? "OpenAI-compatible Cloud" : "Ollama"}</option></select></Field>
      <Field label="Endpoint URL"><input className="field" value={service.form.endpoint} onChange={(event) => update("endpoint", event.target.value)} /></Field>
      <Field label="Model / Model ID"><input className="field" value={service.form.model} onChange={(event) => update("model", event.target.value)} /></Field>
      <Field label="API Contract"><select className="field" value={service.form.apiContract} onChange={(event) => update("apiContract", event.target.value)}><option>Responses API</option><option>OpenAI-compatible · Chat Completions</option><option>OpenAI-compatible · Responses</option></select></Field>
      <Field label="Authentication type"><select className="field" value={service.form.authType} onChange={(event) => update("authType", event.target.value)}><option>API Key</option><option>Bearer Token</option><option>None · 內網信任</option><option>Custom Header</option></select></Field>
      <Field label="Access Token" hint="靜態 UI 不保存此欄位；畫面及 log 永遠遮罩。"><input className="field" type="password" autoComplete="off" placeholder="[masked placeholder]" value={service.form.accessToken} onChange={(event) => update("accessToken", event.target.value)} /></Field>
      <Field label="Context Window (tokens)"><input className="field" inputMode="numeric" value={service.form.contextWindow} onChange={(event) => update("contextWindow", event.target.value)} /></Field>
      <Field label="Request Timeout (seconds)"><input className="field" inputMode="numeric" value={service.form.timeoutSeconds} onChange={(event) => update("timeoutSeconds", event.target.value)} /></Field>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700 md:grid-cols-3">
      <span>Provider：<b>{service.form.provider}</b></span><span>Model：<b>{service.form.model}</b></span><span>設定版本：<b>v{service.settingsVersion}</b></span>
    </div>
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button className="btn" type="button" disabled={!service.configured || service.testStatus === "running"} onClick={() => onDiagnose(service.mode)}><ShieldCheck size={16} />執行完整診斷</button>
      <button className="btn btn-primary" type="button" onClick={() => dispatch({ type: "save_settings", service: service.mode, at: new Date().toLocaleString("zh-TW") })}><Save size={16} />儲存設定</button>
    </div>
  </SectionCard>;
}

function DiagnosticRunner({ service, dispatch, onDiagnose }: { service: AiServiceState; dispatch: React.Dispatch<AiAnalysisAction>; onDiagnose: (service: "cloud" | "local") => void }) {
  const [detailView, setDetailView] = useState<"summary" | "request" | "response">("summary");
  const passed = service.diagnosticSteps.filter((step) => step.status === "passed").length;
  const sanitized = sanitizeDiagnosticPayload({ diagnosticRunId: service.diagnosticRunId, provider: service.form.provider, model: service.form.model, authorization: "Bearer mock-value", token: "mock-value", result: service.testStatus, checks: { passed, total: 7 }, secretsRecorded: false });
  return <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
    <SectionCard title="完整診斷流程" subtitle={service.diagnosticRunId ?? "尚未建立 Diagnostic Run"} action={<button className="btn btn-primary" type="button" disabled={!service.configured || service.testStatus === "running"} onClick={() => onDiagnose(service.mode)}><Play size={15} />執行完整診斷</button>}>
      <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-relaxed text-blue-900"><ShieldCheck className="mr-2 inline" size={16} />安全診斷模式固定使用非機密測試內容；本輪不會送出網路請求。</div>
      <div className="space-y-2" data-testid="diagnostic-steps">
        {service.diagnosticSteps.map((step, index) => <div key={step.id} className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-line bg-white p-3">
          <span className={"flex h-7 w-7 items-center justify-center rounded-full text-xs font-black " + (step.status === "passed" ? "bg-emerald-100 text-emerald-700" : step.status === "running" ? "bg-blue-100 text-blue-700" : step.status === "failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500")}>{step.status === "passed" ? <Check size={15} /> : index + 1}</span>
          <div><div className="font-black text-ink">{step.name}</div><div className="mt-0.5 break-words text-xs leading-snug text-muted">{step.message}</div>{step.errorCategory ? <div className="mt-1 text-xs font-bold text-red-700">{step.errorCategory}</div> : null}</div>
          <div className="text-right"><StatusBadge tone={step.status === "passed" ? "green" : step.status === "running" ? "blue" : step.status === "failed" ? "red" : "gray"}>{step.status}</StatusBadge><div className="mt-1 text-[10px] text-muted">{step.durationMs === null ? "-" : step.durationMs + " ms"}</div></div>
        </div>)}
      </div>
    </SectionCard>
    <SectionCard title="診斷紀錄包" subtitle="GPT-ready mock package">
      <div className="flex flex-wrap gap-2">{(["summary", "request", "response"] as const).map((view) => <button key={view} type="button" className={"rounded-md px-3 py-2 text-xs font-black " + (detailView === view ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")} onClick={() => setDetailView(view)}>{view === "summary" ? "摘要" : view === "request" ? "Request" : "Response"}</button>)}</div>
      <pre className="thin-scroll mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">{detailView === "summary" ? JSON.stringify(sanitized, null, 2) : detailView === "request" ? JSON.stringify(sanitizeDiagnosticPayload({ prompt: "Reply with a fixed health-check JSON.", authorization: "Bearer [masked]", attachments: [] }), null, 2) : JSON.stringify({ simulated: true, status: 200, body: { status: "ok", contractVersion: "skill-analysis-v1" } }, null, 2)}</pre>
      <div className="mt-3 space-y-1 text-xs font-semibold text-slate-700">{["diagnostic-summary.json", "event-log.jsonl", "request-sanitized.json", "response-raw.json", "environment.txt"].map((file) => <div key={file} className="rounded bg-slate-50 px-2 py-1.5">{file}</div>)}</div>
      <div className="mt-4 grid gap-2"><button className="btn" type="button" onClick={() => dispatch({ type: "notice", message: "Mock：正式版將開啟診斷紀錄資料夾；本輪沒有建立資料夾。" })}><FolderOpen size={15} />開啟診斷紀錄資料夾</button><button className="btn" type="button" onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(sanitized, null, 2)); dispatch({ type: "notice", message: "已複製遮罩後的 GPT 診斷摘要。" }); }}><Clipboard size={15} />複製 GPT 診斷摘要</button></div>
    </SectionCard>
  </div>;
}

function ManualChatTester({ state, dispatch }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction> }) {
  const [input, setInput] = useState("");
  const serviceKey = state.selectedService;
  const service = state.services[serviceKey];
  const messages = state.chatMessages[serviceKey];
  const send = () => {
    const message = input.trim();
    if (!message) return;
    const now = new Date();
    const time = now.toLocaleTimeString("zh-TW", { hour12: false });
    dispatch({ type: "append_chat", service: serviceKey, messages: [
      { id: "user-" + now.getTime(), role: "user", service: serviceKey, provider: service.form.provider, model: service.form.model, createdAt: time, durationMs: null, tokenUsage: null, text: String(sanitizeDiagnosticPayload(message)), simulated: true },
      { id: "assistant-" + now.getTime(), role: "assistant", service: serviceKey, provider: service.form.provider, model: service.form.model, createdAt: time, durationMs: 640, tokenUsage: 34, text: "模擬回覆：已收到純文字測試訊息。這是 static UI simulated response，沒有呼叫真實 AI。", simulated: true }
    ] });
    setInput("");
  };
  return <SectionCard className="mt-4" title="手動純文字對話測試" subtitle="Manual plain-text conversation" action={<button className="btn" type="button" onClick={() => dispatch({ type: "new_chat", service: serviceKey, sessionId: "CHAT-" + serviceKey.toUpperCase() + "-" + Date.now() })}><Plus size={15} />新對話</button>}>
    <div className={"mb-3 rounded-md border p-3 text-sm font-semibold leading-relaxed " + (serviceKey === "cloud" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>{serviceKey === "cloud" ? "雲端 AI 正式版會把訊息送往公司外部。禁止輸入 Jira、公司機密、Token 或憑證。" : "地端 AI 正式版使用公司內網服務。仍禁止輸入 Token、密碼或 Authorization Header。"}<div className="mt-1 text-xs">純文字模式，不附加 Jira、SQLite、待分析 JSON 或分析依據檔案。</div></div>
    <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
      <div><div className="thin-scroll min-h-48 max-h-80 space-y-3 overflow-y-auto rounded-md border border-line bg-slate-50 p-3">{messages.length ? messages.map((message) => <div key={message.id} className={"max-w-[88%] rounded-md border p-3 " + (message.role === "user" ? "ml-auto border-blue-200 bg-blue-50" : "border-emerald-200 bg-white")}><div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-black uppercase text-muted"><span>{message.role === "user" ? "你" : message.provider + " · MOCK"}</span><span>{message.createdAt}</span></div><p className="mt-2 break-words text-sm font-semibold leading-relaxed text-slate-800">{message.text}</p>{message.durationMs ? <div className="mt-2 text-[10px] text-muted">Simulated · {message.durationMs} ms · {message.tokenUsage} mock tokens</div> : null}</div>) : <div className="flex min-h-40 items-center justify-center text-sm font-semibold text-muted"><MessageSquare className="mr-2" size={18} />尚無對話訊息</div>}</div>
        <div className="mt-3 flex min-w-0 items-end gap-2"><textarea className="field min-h-20 resize-y" value={input} placeholder="輸入純文字；Enter 送出，Shift + Enter 換行" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="btn btn-primary shrink-0" type="button" disabled={!input.trim()} onClick={send}>送出訊息</button></div></div>
      <div className="rounded-md border border-line bg-white p-3"><div className="text-xs font-black uppercase text-muted">Session trace</div><div className="mt-2 break-words text-sm font-black text-ink">{state.chatSessionIds[serviceKey]}</div><dl className="mt-4 space-y-3 text-xs"><div><dt className="font-black text-muted">Provider / Model</dt><dd className="mt-1 break-words font-bold text-slate-800">{service.form.provider} / {service.form.model}</dd></div><div><dt className="font-black text-muted">Messages</dt><dd className="mt-1 font-bold">{messages.length}</dd></div><div><dt className="font-black text-muted">Recording</dt><dd className="mt-1 font-bold text-emerald-700">Mock structure ready</dd></div></dl></div>
    </div>
  </SectionCard>;
}

export function AiDiagnosticsTab({ state, dispatch, onDiagnose }: { state: AiAnalysisState; dispatch: React.Dispatch<AiAnalysisAction>; onDiagnose: (service: "cloud" | "local") => void }) {
  const service = state.services[state.selectedService];
  return <div data-testid="ai-diagnostics-tab">
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-blue-600">AI connectivity & trace diagnostics</div><h2 className="mt-1 text-xl font-black text-ink">AI 連線與診斷</h2><p className="mt-1 text-sm font-semibold text-muted">獨立管理雲端與地端 AI 的設定、完整診斷與手動純文字對話。</p></div><StatusBadge tone={serviceStatus(service).tone}>{serviceStatus(service).label}</StatusBadge></div>
    <SectionCard title="選擇要測試的 AI 服務" subtitle="Independent service state">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{(["cloud", "local"] as const).map((key) => { const item = state.services[key]; const status = serviceStatus(item); const Icon = key === "cloud" ? Cloud : Cpu; return <button key={key} type="button" data-testid={"service-" + key} className={"flex min-w-0 items-center gap-3 rounded-md border p-4 text-left transition " + (state.selectedService === key ? key === "cloud" ? "border-blue-400 bg-blue-50" : "border-emerald-400 bg-emerald-50" : "border-line bg-white hover:bg-slate-50")} onClick={() => dispatch({ type: "select_service", service: key })}><span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-md " + (key === "cloud" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}><Icon size={20} /></span><span className="min-w-0 flex-1"><b className="block text-sm text-ink">{key === "cloud" ? "雲端 AI" : "地端 AI"}</b><span className="mt-0.5 block break-words text-xs text-muted">{item.form.provider} · {item.form.model}</span></span><StatusBadge tone={status.tone}>{status.label}</StatusBadge></button>; })}</div>
    </SectionCard>
    <div className="mt-4"><SettingsForm service={service} dispatch={dispatch} onDiagnose={onDiagnose} /></div>
    <ManualChatTester state={state} dispatch={dispatch} />
    <DiagnosticRunner service={service} dispatch={dispatch} onDiagnose={onDiagnose} />
  </div>;
}
