import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Database,
  FileCheck2,
  FileJson,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  LogIn,
  LogOut,
  MessageSquareText,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  XCircle
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type {
  AiAnalysisRun,
  AiAnalysisConversationEvent,
  AiAnalysisSnapshot,
  AiAnalyzerMode,
  AiChatMessage,
  AiDiagnosticRun,
  AiServiceKey,
  AiSettingsUpdate,
  ChatGptStatus
} from "../../shared/aiAnalysisContract";
import type { AppOutletContext } from "../components/AppLayout";
import type { AiInstructionMode } from "../../shared/analysisInstructionContract";

type Tab = "diagnostics" | "workspace" | "results";
type Tone = "neutral" | "blue" | "green" | "amber" | "red";

const tabItems: Array<{ id: Tab; number: string; label: string }> = [
  { id: "diagnostics", number: "01", label: "AI 連線與診斷" },
  { id: "workspace", number: "02", label: "分析工作區" },
  { id: "results", number: "03", label: "Activity Events 分析結果" }
];

function toneClasses(tone: Tone) {
  return {
    neutral: "border-slate-200 bg-slate-100 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800"
  }[tone];
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-[11px] font-extrabold ${toneClasses(tone)}`}>{children}</span>;
}

function Section({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="text-[10px] font-black uppercase text-blue-600">{eyebrow}</div> : null}
          <h2 className="mt-0.5 text-base font-black text-slate-900">{title}</h2>
          {description ? <p className="mt-1 max-w-4xl break-words text-xs font-semibold leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-w-0 p-5">{children}</div>
    </section>
  );
}

function PathValue({ label, value, copy = true }: { label: string; value: string | null | undefined; copy?: boolean }) {
  const display = value || "Unavailable";
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase text-slate-500">{label}</div>
      <div className="mt-1 flex min-w-0 items-start gap-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded bg-slate-50 px-2 py-1.5 text-[11px] font-bold leading-relaxed text-slate-700" title={display}>{display}</code>
        {copy && value ? <button className="btn shrink-0 px-2 py-1.5 text-xs" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(value)}>Copy</button> : null}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <div className="min-w-0 rounded border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><div className="mt-1 break-words text-lg font-black leading-tight text-slate-900" data-no-clip="true">{value}</div>{detail ? <div className="mt-1 break-words text-[11px] font-semibold text-slate-500">{detail}</div> : null}</div>;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

function formatDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-TW");
}

function runtimeTone(state: ChatGptStatus["state"]): Tone {
  if (state === "connected") return "green";
  if (state === "login_pending" || state === "usage_limited" || state === "starting") return "amber";
  if (state === "runtime_error") return "red";
  return "neutral";
}

function accountLabel(status: ChatGptStatus) {
  if (status.state === "login_pending") return "Signing in";
  if (status.state === "connected") return status.accountEmailMasked ? "Signed in · Connected" : "Connected";
  if (status.state === "signed_out") return "Signed out";
  if (status.state === "runtime_error") return "Error";
  if (!status.runtimeFound || status.state === "stopped") return "Unavailable";
  return status.state;
}

function quotaLabel(limit: ChatGptStatus["primaryRateLimit"]) {
  if (!limit || limit.usedPercent === null) return "Unavailable";
  return `${Math.round(limit.usedPercent)}% used${limit.resetsAt ? ` · resets ${formatDate(limit.resetsAt)}` : ""}`;
}

function ChatGptConnection({ snapshot, update, notify }: { snapshot: AiAnalysisSnapshot; update: (value: AiAnalysisSnapshot) => void; notify: (message: string, tone?: Tone) => void }) {
  const api = window.desktopApp?.aiAnalysis;
  const status = snapshot.chatgpt;
  const [busy, setBusy] = useState(false);
  async function run(action: "start" | "login" | "cancel" | "refresh" | "logout") {
    if (!api) return;
    setBusy(true);
    const result = action === "start" ? await api.startChatGpt()
      : action === "login" ? await api.loginChatGpt()
      : action === "cancel" ? await api.cancelChatGptLogin()
      : action === "logout" ? await api.logoutChatGpt()
      : await api.refreshChatGpt();
    update(await api.getSnapshot());
    setBusy(false);
    const failure = result as { errorCode?: string; message?: string };
    notify(result.ok ? "ChatGPT 帳號與 runtime 狀態已更新。" : `${failure.errorCode ?? "CHATGPT_ERROR"}: ${failure.message ?? "Operation failed."}`, result.ok ? "green" : "red");
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-600 text-white"><Bot size={20} /></span><div className="min-w-0"><div className="text-sm font-black text-slate-900">ChatGPT</div><div className="text-xs font-semibold text-slate-500">Bundled Codex App Server · managed ChatGPT authentication</div></div></div>
        <Badge tone={runtimeTone(status.state)}>{accountLabel(status)}</Badge>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Account" value={status.accountEmailMasked ?? "Signed out"} detail={status.authMode === "chatgpt" ? "Managed by ChatGPT" : "No credential exposed to renderer"} />
        <Metric label="Plan" value={status.planType ?? "Unavailable"} />
        <Metric label="Codex Runtime" value={status.runtimeFound ? status.runtimeVersion : "Unavailable"} detail={status.runtimeSource === "bundled" ? "Bundled only" : "Not started"} /><Metric label="Runtime Integrity" value={status.runtimeIntegrity} detail={status.runtimeSha256 ? status.runtimeSha256.slice(0, 16) + "..." : "Hash unavailable"} />
        <Metric label="Quota" value={quotaLabel(status.primaryRateLimit)} detail={`Updated ${formatDate(status.lastRefreshAt)}`} />
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Model</span><select className="field" disabled={status.state !== "connected"} value={status.selectedModel ?? ""} onChange={async (event) => { if (!api) return; await api.selectChatGptModel(event.target.value || null); update(await api.getSnapshot()); }}><option value="">Auto</option>{status.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select></label>
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <button className="btn" disabled={busy} onClick={() => void run(status.state === "stopped" || status.state === "runtime_error" ? "start" : "refresh")}><RefreshCw className={busy ? "animate-spin" : ""} size={15} />重新載入 ChatGPT 帳號</button>
          {status.state === "signed_out" ? <button className="btn btn-primary" disabled={busy} onClick={() => void run("login")}><LogIn size={15} />使用 ChatGPT 登入</button> : null}
          {status.state === "login_pending" ? <button className="btn" disabled={busy} onClick={() => void run("cancel")}><Square size={15} />取消登入</button> : null}
          {status.authMode === "chatgpt" ? <button className="btn" disabled={busy} onClick={() => void run("logout")}><LogOut size={15} />登出</button> : null}
        </div>
      </div>
      <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-relaxed text-blue-900"><ShieldCheck className="mt-0.5 shrink-0" size={16} /><span>ChatGPT 登入用於 Codex 模型授權。AI 分析對話保存在 Jira Activity Analyzer 本機，不會出現在 ChatGPT 網頁聊天紀錄。正式分析由內建 Runtime 在本次唯讀四檔工作區中讀檔；外部 Codex、MCP、Plugin 與網路工具均停用。</span></div>
      {status.lastErrorMessage ? <div className="rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"><div>{status.lastErrorCode ?? "CHATGPT_ERROR"}</div><div className="mt-1 break-words">{status.lastErrorMessage}</div></div> : null}
    </div>
  );
}

function AiNexusConnection({ snapshot, update, notify }: { snapshot: AiAnalysisSnapshot; update: (value: AiAnalysisSnapshot) => void; notify: (message: string, tone?: Tone) => void }) {
  const source = snapshot.env.aiNexus;
  const [form, setForm] = useState(() => ({ ...source, secret: "" }));
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ ...source, secret: "" }), [source.configFingerprint]);
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    const api = window.desktopApp?.aiAnalysis;
    if (!api) return;
    setBusy(true);
    const payload: AiSettingsUpdate = {
      service: "ai_nexus", provider: form.provider || "AI Nexus", endpoint: form.endpoint, model: form.model,
      apiContract: form.apiContract, authType: form.authType, organization: form.organization, project: form.project,
      contextWindow: form.contextWindow, timeoutMs: form.timeoutMs, maxOutputTokens: form.maxOutputTokens, maxRetries: form.maxRetries,
      secret: form.secret, preserveSecret: !form.secret, expectedEnvSha256: snapshot.env.sha256, expectedEnvMtimeMs: snapshot.env.mtimeMs
    };
    const result = await api.saveSettings(payload);
    setBusy(false);
    if (result.snapshot) update(result.snapshot);
    notify(result.ok ? "AI Nexus 設定已安全寫入執行檔同目錄的 .env。" : `${result.errorCode}: ${result.message}`, result.ok ? "green" : "red");
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-violet-600 text-white"><HardDrive size={20} /></span><div><div className="text-sm font-black text-slate-900">地端 AI／AI Nexus</div><div className="text-xs font-semibold text-slate-500">Provider-neutral Chat Completions／Responses codec</div></div></div><Badge tone={source.connectionStatus === "passed" ? "green" : source.connectionStatus === "failed" ? "red" : "neutral"}>{source.connectionStatus}</Badge></div>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Runtime／Provider</span><input className="field" value={form.provider} onChange={(event) => set("provider", event.target.value)} /></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Endpoint URL</span><input className="field" value={form.endpoint} onChange={(event) => set("endpoint", event.target.value)} /></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Model ID</span><input className="field" value={form.model} onChange={(event) => set("model", event.target.value)} /></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">API Contract</span><select className="field" value={form.apiContract} onChange={(event) => set("apiContract", event.target.value)}><option value="chat_completions">Chat Completions</option><option value="responses">Responses compatible</option></select></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Auth Type</span><select className="field" value={form.authType} onChange={(event) => set("authType", event.target.value)}><option value="bearer">Bearer Token</option><option value="api_key">API Key Header</option></select></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Access Token {source.secretConfigured ? "(leave blank to keep)" : ""}</span><input className="field" type="password" autoComplete="off" value={form.secret} onChange={(event) => set("secret", event.target.value)} /></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Context Window</span><input className="field" type="number" value={form.contextWindow ?? ""} onChange={(event) => set("contextWindow", event.target.value ? Number(event.target.value) : null)} /></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Request Timeout (ms)</span><input className="field" type="number" value={form.timeoutMs} onChange={(event) => set("timeoutMs", Number(event.target.value))} /></label>
        <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Max Output Tokens</span><input className="field" type="number" value={form.maxOutputTokens ?? ""} onChange={(event) => set("maxOutputTokens", event.target.value ? Number(event.target.value) : null)} /></label>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><PathValue label="ENV PATH" value={snapshot.env.envPath} /><div className="flex flex-wrap gap-2"><button className="btn" disabled={busy} onClick={async () => { const latest = await window.desktopApp?.aiAnalysis?.reloadEnv(); if (latest) update(latest); }}><RefreshCw size={15} />Reload Env</button><button className="btn btn-primary" disabled={busy || !snapshot.env.found || !snapshot.env.supported} onClick={() => void save()}><Save size={15} />儲存設定</button></div></div>
    </div>
  );
}

function DiagnosticsPage({ snapshot, update, notify }: PageProps) {
  const [service, setService] = useState<AiServiceKey>("chatgpt");
  const [diagnostic, setDiagnostic] = useState<AiDiagnosticRun | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [chatText, setChatText] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const ready = service === "chatgpt" ? snapshot.chatgpt.state === "connected" : snapshot.env.aiNexus.connectionStatus === "passed";
  async function diagnose() {
    setDiagnosing(true);
    const result = await window.desktopApp?.aiAnalysis?.diagnose(service);
    if (result) setDiagnostic(result);
    setDiagnosing(false);
  }
  async function send() {
    const api = window.desktopApp?.aiAnalysis;
    const text = chatText.trim();
    if (!api || !text || !ready) return;
    if (/(authorization\s*:|bearer\s+[a-z0-9._-]{8,}|token\s*[:=]|password\s*[:=])/i.test(text)) {
      notify("SENSITIVE_FORMAT_BLOCKED: 訊息疑似包含憑證格式，未送出。", "red");
      return;
    }
    const user: AiChatMessage = { id: crypto.randomUUID(), sessionId: "v0310-safe-chat", role: "user", service, provider: service, model: service === "chatgpt" ? snapshot.chatgpt.selectedModel ?? "auto" : snapshot.env.aiNexus.model, createdAt: new Date().toISOString(), elapsedMs: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, availability: "unavailable", estimatedInputTokens: null }, text };
    setMessages((current) => [...current, user]);
    setChatText("");
    setChatBusy(true);
    const result = await api.chat({ service, sessionId: user.sessionId, messages: [...messages, user].map((message) => ({ role: message.role, text: message.text })) });
    setChatBusy(false);
    if (result.message) setMessages((current) => [...current, result.message!]);
    else notify(`${result.errorCode ?? "CHAT_ERROR"}: ${result.messageText ?? "Request failed."}`, "red");
  }
  const diagnosticFiles = diagnostic?.folderPath ? ["diagnostic-summary.json", "event-log.jsonl", "request-sanitized.json", "response-sanitized.json", "environment.txt"] : [];
  return <div className="space-y-4">
    <Section eyebrow="AI Connectivity & Trace Diagnostics" title="AI 連線與診斷" description="獨立驗證 ChatGPT 與地端 AI。固定診斷資料不含 Jira、Activity Event、技能表、Token 或 Authorization Header。" actions={<div className="inline-flex rounded border border-slate-200 bg-slate-50 p-1"><button className={`rounded px-3 py-2 text-xs font-black ${service === "chatgpt" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`} onClick={() => setService("chatgpt")}>ChatGPT</button><button className={`rounded px-3 py-2 text-xs font-black ${service === "ai_nexus" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`} onClick={() => setService("ai_nexus")}>地端 AI</button></div>}>
      {service === "chatgpt" ? <ChatGptConnection snapshot={snapshot} update={update} notify={notify} /> : <AiNexusConnection snapshot={snapshot} update={update} notify={notify} />}
    </Section>
    <Section eyebrow="Seven-stage verification" title="完整診斷" description="每一階段由真實 runtime／network／contract 結果產生，失敗與 skipped 不會被當成成功。" actions={diagnosing ? <button className="btn btn-danger" onClick={() => void window.desktopApp?.aiAnalysis?.cancelDiagnostic()}><Square size={15} />取消診斷</button> : <button className="btn btn-primary" onClick={() => void diagnose()}><ShieldCheck size={15} />執行完整診斷</button>}>
      {diagnostic ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Run ID" value={diagnostic.runId} /><Metric label="Provider" value={diagnostic.service === "chatgpt" ? "ChatGPT" : "AI Nexus"} /><Metric label="Status" value={diagnostic.status} /><Metric label="Duration" value={diagnostic.completedAt ? `${Math.max(0, Date.parse(diagnostic.completedAt) - Date.parse(diagnostic.startedAt))} ms` : "Running"} /></div><div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">Stage</th><th className="p-3">Status</th><th className="p-3">Duration</th><th className="p-3">Result</th></tr></thead><tbody>{diagnostic.steps.map((step, index) => <tr className="border-t border-slate-200" key={step.id}><td className="p-3 font-bold">{index + 1}. {step.name}</td><td className="p-3"><Badge tone={step.status === "passed" ? "green" : step.status === "failed" ? "red" : step.status === "running" ? "blue" : "neutral"}>{step.status}</Badge></td><td className="p-3 font-mono">{step.durationMs === null ? "-" : `${step.durationMs} ms`}</td><td className="p-3"><div className="font-semibold">{step.errorCode ? `${step.errorCode}: ` : ""}{step.message}</div></td></tr>)}</tbody></table></div><PathValue label="DIAGNOSTIC FOLDER" value={diagnostic.folderPath} />{diagnosticFiles.map((name) => <PathValue key={name} label={name} value={`${diagnostic.folderPath}\\${name}`} />)}</div> : <div className="flex min-h-28 items-center justify-center rounded border border-dashed border-slate-300 text-sm font-semibold text-slate-500">尚未執行診斷</div>}
    </Section>
    <Section eyebrow="Manual plain-text conversation" title="手動純文字對話測試" description="Dedicated、ephemeral、read-only thread，不附加 Jira 或規則資料。送出前會阻擋常見憑證格式。" actions={<Badge tone={ready ? "green" : "amber"}>{ready ? "Provider ready" : "Provider not ready"}</Badge>}>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-4">{messages.length ? messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded p-3 text-sm ${message.role === "user" ? "ml-auto bg-blue-600 text-white" : "bg-white text-slate-800 shadow-sm"}`}><div className="mb-1 text-[10px] font-black uppercase opacity-70">{message.role === "user" ? "You" : message.provider}</div><div className="whitespace-pre-wrap break-words">{message.text}</div>{message.elapsedMs !== null ? <div className="mt-2 text-[10px] font-bold opacity-70">{message.elapsedMs} ms · {message.usage.totalTokens ?? "token usage unavailable"}</div> : null}{message.traceFolderPath ? <code className="mt-2 block break-all text-[10px] opacity-70">{message.traceFolderPath}</code> : null}</div>) : <div className="py-10 text-center text-xs font-semibold text-slate-500">No conversation yet</div>}</div>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2"><textarea className="field min-h-20 flex-1 resize-y" value={chatText} disabled={!ready || chatBusy} onChange={(event) => setChatText(event.target.value)} placeholder={ready ? "輸入不含機密資料的測試訊息" : "Selected provider is not ready"} />{chatBusy ? <button className="btn btn-danger self-end" onClick={async () => { await window.desktopApp?.aiAnalysis?.cancelChat(); }}><Square size={15} />取消</button> : <button className="btn btn-primary self-end" disabled={!ready || !chatText.trim()} onClick={() => void send()}><Send size={15} />送出訊息</button>}</div>
    </Section>
  </div>;
}

type PageProps = { snapshot: AiAnalysisSnapshot; update: (value: AiAnalysisSnapshot) => void; notify: (message: string, tone?: Tone) => void };

function WorkspacePage({ snapshot, update, notify, goResults }: PageProps & { goResults: () => void }) {
  const api = window.desktopApp?.aiAnalysis;
  const [mode, setMode] = useState<AiAnalyzerMode>(() => (sessionStorage.getItem("jaa-ai-analyzer") as AiAnalyzerMode | null) ?? "OFFLINE_RULE");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [capacityPrompt, setCapacityPrompt] = useState<{ run: AiAnalysisRun; payload: { mode: AiAnalyzerMode; datasetId: string; selectedDiffIds: string[]; service: AiServiceKey; supplementalInstruction?: string; instructionMode: AiInstructionMode; userAdditionalInstruction?: string; userCustomInstruction?: string } } | null>(null);
  const [supplementalInstruction, setSupplementalInstruction] = useState("");
  const [instructionMode, setInstructionMode] = useState<AiInstructionMode>(() => (sessionStorage.getItem("jaa-instruction-mode") as AiInstructionMode) || "STANDARD_FORMAL");
  const [templateName, setTemplateName] = useState("");
  const [instructionTemplates, setInstructionTemplates] = useState<Array<{ name: string; mode: AiInstructionMode; text: string }>>(() => { try { return JSON.parse(localStorage.getItem("jaa-instruction-templates-v1") || "[]"); } catch { return []; } });
  const [conversation, setConversation] = useState<AiAnalysisConversationEvent[]>([]);
  const [conversationFilter, setConversationFilter] = useState<"all" | "chatgpt" | "app">("all");
  const [conversationNextOffset, setConversationNextOffset] = useState(0);
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const workspaceRun = snapshot.runs.find((item) => item.runId === snapshot.activeRunId) ?? snapshot.runs.find((item) => item.runId === snapshot.selectedRunId) ?? snapshot.runs[0] ?? null;
  useEffect(() => { if (!api || !workspaceRun?.runDirectory) { setConversation([]); setConversationNextOffset(0); setConversationHasMore(false); return; } let live = true; void api.getConversation({ runId: workspaceRun.runId, offset: 0, limit: 200 }).then((value) => { if (live && value.ok) { setConversation(value.events ?? []); setConversationNextOffset(value.nextOffset ?? 0); setConversationHasMore(Boolean(value.hasMore)); } }); return () => { live = false; }; }, [api, workspaceRun?.runId, workspaceRun?.progress.stage, workspaceRun?.progress.elapsedMs]);
  const dataset = snapshot.pendingDatasets.find((item) => item.datasetId === snapshot.selectedPendingDatasetId) ?? null;
  useEffect(() => setSelected(dataset?.diffs.filter((item) => item.substantive).map((item) => item.sourceDiffId) ?? []), [dataset?.datasetId]);
  function chooseMode(value: AiAnalyzerMode) { setMode(value); sessionStorage.setItem("jaa-ai-analyzer", value); }
  function chooseInstructionMode(value: AiInstructionMode) { setInstructionMode(value); sessionStorage.setItem("jaa-instruction-mode", value); if (value === "STANDARD_FORMAL") setSupplementalInstruction(""); }
  function saveInstructionTemplate() { const name = templateName.trim(); if (!name || instructionMode === "STANDARD_FORMAL") return; const next = [...instructionTemplates.filter((item) => item.name !== name), { name, mode: instructionMode, text: supplementalInstruction }]; setInstructionTemplates(next); localStorage.setItem("jaa-instruction-templates-v1", JSON.stringify(next)); }
  function deleteInstructionTemplate(name: string) { const next = instructionTemplates.filter((item) => item.name !== name); setInstructionTemplates(next); localStorage.setItem("jaa-instruction-templates-v1", JSON.stringify(next)); }
  const instructionPreview = instructionMode === "STANDARD_FORMAL" ? "JAA Safety Wrapper + Artifact Token + bridge-resumable-v3 + Standard Formal Contract + Final Response Contract" : instructionMode === "STANDARD_PLUS_USER_INSTRUCTION" ? "JAA Safety Wrapper + Artifact Token + bridge-resumable-v3 + Standard Formal Contract\n\nUser additional instruction:\n" + (supplementalInstruction || "（尚未輸入）") : "JAA Safety Wrapper + Artifact Token + bridge-resumable-v3\n\nCUSTOM_DIAGNOSTIC: no canonical result, Golden HTML, or SQLite\n\nUser custom instruction:\n" + (supplementalInstruction || "（尚未輸入）");
  const providerConfigured = mode === "OFFLINE_RULE" || mode === "CHATGPT" ? snapshot.chatgpt.runtimeFound : Boolean(snapshot.env.aiNexus.endpoint && snapshot.env.aiNexus.model && snapshot.env.aiNexus.secretConfigured);
  const providerAuthenticated = mode === "OFFLINE_RULE" || mode === "CHATGPT" ? snapshot.chatgpt.authMode === "chatgpt" : snapshot.env.aiNexus.secretConfigured;
  const providerConnected = mode === "OFFLINE_RULE" || mode === "CHATGPT" ? snapshot.chatgpt.state === "connected" : snapshot.env.aiNexus.connectionStatus === "passed";
  const modelAvailable = mode === "OFFLINE_RULE" || mode === "CHATGPT" ? snapshot.chatgpt.state === "connected" && (snapshot.chatgpt.selectedModel === null || snapshot.chatgpt.models.some((model) => model.id === snapshot.chatgpt.selectedModel)) : Boolean(snapshot.env.aiNexus.model);
  const readiness = [
    { id: "rulesReady", label: "分析依據已驗證", ok: Boolean(snapshot.rules?.valid) },
    { id: "datasetReady", label: "Pending Dataset 已驗證且已選取 Evidence", ok: Boolean(dataset?.integrityStatus === "verified" && selected.length) },
    { id: "providerConfigured", label: "Provider 已設定", ok: providerConfigured },
    { id: "providerAuthenticated", label: "Provider 已認證", ok: providerAuthenticated },
    { id: "providerConnected", label: "Provider 已連線", ok: providerConnected },
    { id: "modelAvailable", label: "Model 可用", ok: modelAvailable },
    { id: "databaseReady", label: "AI Analysis SQLite 可建立", ok: true },
    { id: "noActiveRun", label: "沒有其他分析執行中", ok: !snapshot.activeRunId }
  ].filter((item) => mode !== "OFFLINE_RULE" || !["providerConfigured", "providerAuthenticated", "providerConnected", "modelAvailable"].includes(item.id));
  const blockers = readiness.filter((item) => !item.ok);
  const ruleDocuments = snapshot.rules?.roleDocuments ?? snapshot.rules?.files.map((file) => ({ role: file.kind === "rules" ? "common_rules" : file.kind, fileName: file.fileName, fullPath: file.fullPath ?? "", version: file.version, sha256: file.sha256, sizeBytes: file.sizeBytes ?? 0, status: file.status, providerVisible: true })) ?? [];
  async function chooseRuleRole(role: "manifest" | "common_rules" | "catalog" | "html_template") { const result = await api?.chooseRuleRole(role); if (result?.snapshot) update(result.snapshot); if (result && !result.canceled && !result.ok) notify((result.errorCode ?? "AI_RULE_SELECTION_FAILED") + ": " + (result.message ?? ""), "red"); }
  async function cancelRuleDraft() { const result = await api?.cancelRuleDraft(); if (result?.snapshot) update(result.snapshot); }
  async function useBundledRules() { const result = await api?.useBundledRules(); if (result?.snapshot) update(result.snapshot); notify(result?.ok ? "Bundled v0.3.26 Rule Set 已原子啟用。" : (result?.errorCode ?? "AI_RULE_SELECTION_FAILED") + ": " + (result?.message ?? ""), result?.ok ? "green" : "red"); }
  async function reloadRules() { const result = await api?.loadRules(); if (result?.snapshot) update(result.snapshot); notify(result?.ok ? "分析依據已重新讀檔並計算 SHA-256。" : `${result?.errorCode}: ${result?.message}`, result?.ok ? "green" : "red"); }
  async function choosePending() { const result = await api?.choosePending(); if (result?.snapshot) update(result.snapshot); if (result && !result.canceled && !result.ok) notify(`${result.errorCode}: ${result.message}`, "red"); }
  async function verifyPending() { if (!dataset) return; const result = await api?.verifyPending(dataset.datasetId); if (result?.snapshot) update(result.snapshot); notify(result?.ok ? "Pending Dataset 完整性已重新驗證。" : `${result?.errorCode}: ${result?.message}`, result?.ok ? "green" : "red"); }
  async function start() {
    if (!api || !dataset || blockers.length || busy) return;
    const service: AiServiceKey = mode === "CHATGPT" ? "chatgpt" : "ai_nexus";
    const request = { mode, datasetId: dataset.datasetId, selectedDiffIds: selected, service, supplementalInstruction: supplementalInstruction.trim() || undefined, instructionMode, userAdditionalInstruction: instructionMode === "STANDARD_PLUS_USER_INSTRUCTION" ? supplementalInstruction.trim() || undefined : undefined, userCustomInstruction: instructionMode === "CUSTOM_DIAGNOSTIC" ? supplementalInstruction.trim() || undefined : undefined };
    setBusy(true);
    const result = await api.start(request);
    setBusy(false);
    if (result.snapshot) update(result.snapshot);
    if (result.requiresCapacityConfirmation && result.run) { setCapacityPrompt({ run: result.run, payload: request }); return; }
    if (result.navigationDecision?.decision === "ALLOW") goResults();
    notify(result.run?.status === "completed_with_persistence_error" ? "分析產物與 HTML 已完成，但 SQLite 寫入失敗；可在結果頁重試。" : result.ok ? "分析完成，Canonical JSON、HTML 與 SQLite commit 已建立。" : `${result.errorCode ?? result.run?.progress.errorCode}: ${result.message ?? result.run?.progress.message}`, result.run?.status === "completed_with_persistence_error" ? "amber" : result.ok ? "green" : "red");
  }
  async function confirmCapacity() {
    if (!api || !capacityPrompt || busy) return;
    const current = capacityPrompt; setCapacityPrompt(null); setBusy(true);
    const result = await api.start({ ...current.payload, analysisRunId: current.run.runId, capacityConfirmation: true });
    setBusy(false); if (result.snapshot) update(result.snapshot);
    if (result.navigationDecision?.decision === "ALLOW") goResults();
    notify(result.run?.status === "completed_with_persistence_error" ? "分析產物與 HTML 已完成，但 SQLite 寫入失敗；可在結果頁重試。" : result.ok ? "分析完成，Canonical JSON、HTML 與 SQLite commit 已建立。" : `${result.errorCode ?? result.run?.progress.errorCode}: ${result.message ?? result.run?.progress.message}`, result.run?.status === "completed_with_persistence_error" ? "amber" : result.ok ? "green" : "red");
  }
  async function cancelCapacity() {
    if (!api || !capacityPrompt) return;
    const result = await api.cancelCapacityWarning(capacityPrompt.run.runId);
    if (result.snapshot) update(result.snapshot); setCapacityPrompt(null);
    notify("已取消容量警告；未建立 Provider request、Thread 或 Turn。", "amber");
  }
  const analyzers = [
    { id: "CHATGPT" as const, title: "ChatGPT 分析", description: "Codex App Server · ChatGPT subscription", icon: Bot },
    { id: "AI_NEXUS" as const, title: "地端 AI 分析", description: "AI Nexus · internal compatible runtime", icon: HardDrive },
    { id: "OFFLINE_RULE" as const, title: "離線分析", description: "Offline Rule Analyzer · deterministic", icon: CircleSlash2 }
  ];
  return <div className="space-y-4">
    <Section eyebrow="Rule Selection Transaction v1" title="共用分析依據" description="四個角色各自選檔；只有 4/4 驗證與 Manifest binding 全部通過才會原子替換 Active Set。" actions={<><button className="btn" onClick={() => void useBundledRules()}><ShieldCheck size={15} />使用 Bundled Set</button><button className="btn" disabled={!snapshot.ruleSelection?.draftSet} onClick={() => void cancelRuleDraft()}><XCircle size={15} />取消 Draft</button><button className="btn" disabled={!snapshot.rules} onClick={() => void reloadRules()}><RefreshCw size={15} />重新驗證 Active</button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["manifest", "common_rules", "catalog", "html_template"] as const).map((role) => {
            const active = snapshot.ruleSelection?.activeSet?.roles.find((item) => item.role === role);
            const draft = snapshot.ruleSelection?.draftSet?.roles.find((item) => item.role === role);
            return <div key={role} className="min-w-0 rounded border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2"><span className="break-words text-xs font-black text-slate-800">{role}</span><Badge tone={draft?.state === "INVALID" ? "red" : draft?.state === "VALID" ? "green" : active ? "blue" : "neutral"}>{draft?.state ?? (active ? "ACTIVE" : "EMPTY")}</Badge></div>
              <div className="mt-2 break-all text-[10px] font-semibold text-slate-500" title={draft?.selectedPath ?? active?.fullPath ?? ""}>{draft?.selectedPath ?? active?.fullPath ?? "尚未選取"}</div>
              <button className="btn mt-3 w-full" onClick={() => void chooseRuleRole(role)}><FolderOpen size={14} />選擇此角色</button>
            </div>;
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active Set" value={snapshot.ruleSelection?.activeSet?.activeSetId ?? "None"} /><Metric label="Selection Mode" value={snapshot.ruleSelection?.activeSet?.mode ?? "None"} /><Metric label="Draft Binding" value={snapshot.ruleSelection?.draftSet?.aggregateBindingState ?? "NONE"} /><Metric label="Catalog records" value={snapshot.rules?.catalogCount ?? 0} /></div>
        {snapshot.ruleSelection?.activeFindings?.map((finding) => <div key={finding.attemptId + "-" + finding.errorCode} className="rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{finding.errorCode}: {finding.messageZhTw}</div>)}
      </div>
    </Section>    <Section eyebrow="Analyzer" title="選擇分析方式" description="Provider readiness 與 rules／dataset readiness 分開計算，切換 Analyzer 不清除目前選擇。"><div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{analyzers.map((item) => <button key={item.id} className={`min-w-0 rounded border p-4 text-left transition ${mode === item.id ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`} onClick={() => chooseMode(item.id)}><div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${mode === item.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><item.icon size={18} /></span><div className="min-w-0"><div className="text-sm font-black text-slate-900">{item.title}</div><div className="mt-1 break-words text-xs font-semibold text-slate-500">{item.description}</div></div></div></button>)}</div></Section>
    <Section eyebrow="Pending analysis dataset" title="選擇資料檔" description="只接受 Pending Analysis Dataset JSON；完整路徑由 Electron main process file dialog 提供。" actions={<><button className="btn" onClick={() => void choosePending()}><Upload size={15} />匯入 Pending JSON</button><button className="btn" disabled={!dataset} onClick={() => void verifyPending()}><FileCheck2 size={15} />檢查檔案完整性</button></>}>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]"><div className="max-h-96 space-y-2 overflow-y-auto">{snapshot.pendingDatasets.length ? snapshot.pendingDatasets.map((item) => <button key={item.datasetId} className={`w-full min-w-0 rounded border p-3 text-left ${item.datasetId === snapshot.selectedPendingDatasetId ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`} onClick={async () => { const result = await api?.selectPending(item.datasetId); if (result?.snapshot) update(result.snapshot); }}><div className="truncate text-xs font-black" title={item.fileName}>{item.fileName}</div><div className="mt-1 text-[11px] font-semibold text-slate-500">{item.diffs[0]?.actorDisplayName || "Unknown actor"} · {item.eventCount} Events</div><div className="mt-1 text-[10px] text-slate-400">Imported {formatDate(item.importedAt)}</div></button>) : <div className="rounded border border-dashed border-slate-300 p-8 text-center text-xs font-semibold text-slate-500">No pending datasets</div>}</div>{dataset ? <div className="min-w-0 space-y-4"><PathValue label="PENDING DATASET FULL PATH" value={dataset.sourceFilePath} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Analysis target" value={dataset.diffs[0]?.actorDisplayName || "Unknown"} /><Metric label="Activity Events" value={dataset.eventCount} /><Metric label="Issues / Projects" value={`${dataset.issues} / ${dataset.projects}`} /><Metric label="Integrity" value={dataset.integrityStatus} /></div><div className="grid gap-3 md:grid-cols-2"><PathValue label="JIRA SERVER" value={dataset.jiraServerHost} copy={false} /><PathValue label="SOURCE DATABASE ID" value={dataset.sourceDatabaseId} /><PathValue label="FILE SHA-256" value={dataset.sourceFileSha256} /><PathValue label="FILE SIZE" value={formatBytes(dataset.sourceFileSizeBytes)} copy={false} /></div><div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="w-14 p-3">Use</th><th className="p-3">Issue</th><th className="p-3">Field</th><th className="p-3">Actor</th><th className="p-3">Event time</th></tr></thead><tbody>{dataset.diffs.slice(0, 4).map((diff) => <tr className="border-t border-slate-200" key={diff.sourceDiffId}><td className="p-3"><input aria-label={`Select ${diff.sourceDiffId}`} type="checkbox" checked={selected.includes(diff.sourceDiffId)} onChange={() => setSelected((current) => current.includes(diff.sourceDiffId) ? current.filter((id) => id !== diff.sourceDiffId) : [...current, diff.sourceDiffId])} /></td><td className="p-3 font-mono">{diff.issueKey}</td><td className="p-3">{diff.fieldName}</td><td className="p-3">{diff.actorDisplayName}</td><td className="p-3">{formatDate(diff.eventTime)}</td></tr>)}</tbody></table></div><div className="text-[11px] font-semibold text-slate-500">Preview shows the first 4 records from the actual file. {selected.length} of {dataset.diffs.length} Evidence records selected.</div></div> : <div className="flex min-h-64 items-center justify-center rounded border border-dashed border-slate-300 text-sm font-semibold text-slate-500">尚未選擇 Pending Dataset</div>}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Provider input" value="1 JSON + 3 MD" /><Metric label="Local renderer input" value="1 Template MD" /><Metric label="Template sent to ChatGPT" value="No" /></div><div className="mt-5 flex min-w-0 flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4"><div className="min-w-0"><div className="text-xs font-black text-slate-700">Preflight readiness</div><div className="mt-2 flex flex-wrap gap-2">{readiness.map((item) => <Badge key={item.id} tone={item.ok ? "green" : "red"}>{item.ok ? <Check size={12} /> : <XCircle size={12} />}{item.label}</Badge>)}</div>{blockers.length ? <div className="mt-3 text-xs font-bold text-red-700">尚未通過：{blockers.map((item) => item.label).join("、")}</div> : null}</div><button className="btn btn-primary" disabled={busy || blockers.length > 0} onClick={() => void start()}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Play size={15} />}使用 {analyzers.find((item) => item.id === mode)?.title} 開始分析</button></div>
    </Section>
    {workspaceRun ? <Section eyebrow="Artifact lifecycle v0.3.27" title="分析產物生命週期" description="Provider、提交、驗證與正式產物分開顯示；診斷產物不會取代 Active Result。">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Provider" value={workspaceRun.lifecycle?.providerTurnStatus ?? workspaceRun.status} />
        <Metric label="Input Delivery" value={workspaceRun.bridgeEvidence?.modelDeliveryReceipt ? "DELIVERED" : workspaceRun.lifecycle?.inputStatus ?? "PENDING"} />
        <Metric label="AI Submission" value={workspaceRun.lifecycle?.artifactStatus === "submission_rejected" ? "AI_SUBMITTED / REJECTED" : workspaceRun.bridgeEvidence?.artifactReceipt ? "AI_SUBMITTED / ACCEPTED" : workspaceRun.lifecycle?.artifactStatus ?? "SUBMISSION_MISSING"} />
        <Metric label="Validation" value={workspaceRun.lifecycle?.validationStatus ?? "NOT_STARTED"} />
        <Metric label="Canonical" value={workspaceRun.lifecycle?.canonicalStatus ?? "NOT_CREATED"} />
        <Metric label="Analyzed Result" value={workspaceRun.analyzedFilePath ? "PUBLISHED" : "NOT_CREATED"} />
        <Metric label="Active Result" value={snapshot.activeResult?.runId === workspaceRun.runId ? "COMMITTED" : "UNCHANGED"} />
        <Metric label="Package / HTML" value={`${workspaceRun.reportDataPackagePath ? "READY" : "NOT_CREATED"} / ${workspaceRun.reportFilePath ? "READY" : "NOT_CREATED"}`} />
        <Metric label="SQLite" value={workspaceRun.databaseCommitReceiptPath ? "COMMITTED" : workspaceRun.databaseWriteStatus || "DENIED / NOT_STARTED"} />
      </div>
      {workspaceRun.lifecycle?.rootErrorCode ? <div className="mt-4 rounded border border-red-300 bg-red-50 p-4 text-sm font-bold leading-relaxed text-red-950" data-testid="analysis-root-error"><div>根因錯誤：{workspaceRun.lifecycle.rootErrorCode}</div><div className="mt-1 break-words text-xs font-semibold">階段：{workspaceRun.lifecycle.rootErrorStage ?? workspaceRun.lifecycle.firstFailedStage ?? "UNKNOWN"} · {workspaceRun.lifecycle.rootErrorMessage ?? "分析執行失敗，請開啟 Debug Folder 查看完整證據。"}</div>{workspaceRun.lifecycle.derivedErrorCodes?.length ? <div className="mt-2 break-words text-xs font-semibold text-amber-900">衍生結果：{workspaceRun.lifecycle.derivedErrorCodes.join("、")}</div> : null}</div> : null}
      {workspaceRun.lifecycle?.artifactStatus === "submission_rejected" || workspaceRun.progress.errorCode === "AI_ARTIFACT_SUBMISSION_REJECTED" ? <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-950"><div>已收到 AI 提交，正式驗證失敗。</div><div className="mt-1 text-xs font-semibold">AI submission、聚合 findings 與 DIAGNOSTIC_NON_CANONICAL HTML 已保留於本次 Run；Canonical、Active Result、Results 導頁與 SQLite 均被禁止。</div><button className="btn mt-3" onClick={() => void api?.openFolder(workspaceRun.runDirectory!)}><FolderOpen size={15} />開啟 Submission / Findings / Diagnostic</button></div> : null}
    </Section> : null}
    <Section eyebrow="Request transparency and durable conversation" title="AI 請求與完整對話" description="每次開始都建立唯一 Canonical Run。內建 Codex Runtime 在唯讀 Local File Workspace 讀取四檔；不是 ChatGPT 網頁附件、Files API 或 Inline 全文。">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric label="Delivery mode" value={workspaceRun?.requestPackage?.deliveryMode ?? (mode === "CHATGPT" ? "LOCAL_FILE_WORKSPACE" : "Not applicable")} /><Metric label="Workspace files" value={workspaceRun?.requestPackage?.workspaceFileCount ?? (mode === "CHATGPT" ? 4 : 0)} detail="1 JSON + 3 MD" /><Metric label="Inline / Native attachments" value={(workspaceRun?.requestPackage?.inlineFileContentCount ?? 0) + " / " + (workspaceRun?.requestPackage?.nativeInputFileCount ?? 0)} /><Metric label="Instruction bytes" value={formatBytes(workspaceRun?.requestPackage?.finalProviderPayloadBytes)} /><Metric label="Runtime" value={snapshot.chatgpt.runtimeSource + " / " + snapshot.chatgpt.runtimeIntegrity} detail={snapshot.chatgpt.runtimeVersion} /><Metric label="Run retention" value={workspaceRun?.runDirectory ? "Persistent" : "Created on Start"} /></div>
        <details className="rounded border border-slate-200 p-3" open><summary className="cursor-pointer text-xs font-black text-slate-800">固定核心分析需求 / Immutable core instruction</summary><div className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">使用同一 Request Package 的三份規則，由 JAA 持有 identity，模型只引用 frozen Evidence Quote ID；Catalog detail 缺少時保留 candidate；依 status-aware matrix 輸出 negativeChecks；輸入與輸出 records 必須守恆並符合 Strict Schema。</div><div className="mt-2 font-mono text-[10px] text-slate-500">jira-activity-analysis-local-workspace-instruction / 0.3.27-zh-TW-v8 · one Thread / one primary Turn / no Batch / no Repair</div></details>
        <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4" data-testid="instruction-mode-panel">
  <div className="text-xs font-black text-slate-800">Instruction Mode / 指令模式</div>
  <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Instruction mode">{([["STANDARD_FORMAL", "標準正式分析", "固定正式分析契約"], ["STANDARD_PLUS_USER_INSTRUCTION", "標準 + 使用者指令", "保留正式契約並加入分析重點"], ["CUSTOM_DIAGNOSTIC", "自訂診斷", "只回覆診斷，不建立正式結果"]] as const).map(([value, title, detail]) => <button key={value} type="button" role="radio" aria-checked={instructionMode === value} className={"min-w-0 rounded border p-3 text-left " + (instructionMode === value ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white")} onClick={() => chooseInstructionMode(value)} disabled={mode !== "CHATGPT" || Boolean(snapshot.activeRunId)}><span className="block break-words text-xs font-black text-slate-900">{title}</span><span className="mt-1 block break-words text-[10px] font-semibold text-slate-500">{detail}</span></button>)}</div>
  {instructionMode === "CUSTOM_DIAGNOSTIC" ? <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-950">自訂診斷不會建立 Canonical Result、Golden HTML 或 SQLite 資料。完成後可使用「以此要求建立正式分析」切換為標準 + 使用者指令並建立新的 Run。</div> : null}
  {instructionMode !== "STANDARD_FORMAL" ? <label className="block text-xs font-black text-slate-700"><span className="mb-1 block">{instructionMode === "CUSTOM_DIAGNOSTIC" ? "自訂診斷要求" : "使用者附加分析要求"}</span><textarea className="field min-h-28 resize-y" maxLength={8000} value={supplementalInstruction} onChange={(event) => setSupplementalInstruction(event.target.value)} disabled={Boolean(snapshot.activeRunId)} /><span className="mt-1 block text-[10px] font-semibold text-slate-500">{supplementalInstruction.length} / 8000 characters</span></label> : null}
  <details className="rounded border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-black text-slate-800">Effective Instruction Preview / 最終指令預覽</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700">{instructionPreview}</pre><button className="btn mt-2" type="button" onClick={() => void navigator.clipboard.writeText(instructionPreview)}>Copy Preview</button></details>
  {instructionMode !== "STANDARD_FORMAL" ? <div className="flex flex-wrap items-end gap-2"><label className="min-w-48 flex-1 text-[10px] font-black text-slate-600">TEMPLATE NAME<input className="field mt-1" value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={80} /></label><button className="btn" type="button" disabled={!templateName.trim()} onClick={saveInstructionTemplate}><Save size={14} />Save Template</button>{instructionMode === "CUSTOM_DIAGNOSTIC" ? <button className="btn btn-primary" type="button" onClick={() => chooseInstructionMode("STANDARD_PLUS_USER_INSTRUCTION")}>以此要求建立正式分析</button> : null}</div> : null}
  {instructionTemplates.length ? <div className="flex flex-wrap gap-2">{instructionTemplates.map((item) => <span key={item.name} className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold"><button className="max-w-40 truncate" title={item.name} type="button" onClick={() => { chooseInstructionMode(item.mode); setSupplementalInstruction(item.text); }}>{item.name}</button><button type="button" aria-label={"Delete template " + item.name} onClick={() => deleteInstructionTemplate(item.name)}><XCircle size={13} /></button></span>)}</div> : null}
</div>
        {workspaceRun?.requestPackage ? <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-3">Role</th><th className="p-3">Original filename</th><th className="p-3">Bytes</th><th className="p-3">SHA-256</th><th className="p-3">Visible</th><th className="p-3">Integrity</th></tr></thead><tbody>{workspaceRun.requestPackage.documents.map((document) => <tr key={document.role} className="border-t border-slate-200"><td className="p-3 font-black">{document.role}</td><td className="max-w-60 truncate p-3" title={document.originalFileName}>{document.originalFileName}</td><td className="p-3 font-mono">{document.snapshotByteLength.toLocaleString()}</td><td className="p-3"><code className="block max-w-52 break-all text-[10px]">{document.snapshotSha256}</code></td><td className="p-3">{document.modelVisible ? "Yes" : "Schema channel"}</td><td className="p-3"><Badge tone={document.byteIdentical && document.complete && !document.truncated ? "green" : "red"}>{document.byteIdentical && document.complete && !document.truncated ? "Exact / Complete" : "Blocked"}</Badge></td></tr>)}</tbody></table></div> : <div className="rounded border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500">Request Package preview will be frozen and hashed when Start is accepted.</div>}
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-black text-slate-800">Conversation / 對話紀錄</div><div className="flex gap-1">{(["all", "chatgpt", "app"] as const).map((value) => <button key={value} className={`btn px-2 py-1 text-[10px] ${conversationFilter === value ? "border-blue-500 bg-blue-50" : ""}`} onClick={() => setConversationFilter(value)}>{value === "all" ? "全部" : value === "chatgpt" ? "ChatGPT 可見" : "App 事件"}</button>)}</div></div>
        <div className="max-h-[520px] space-y-2 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3">{conversation.filter((item) => conversationFilter === "all" || (conversationFilter === "chatgpt" ? item.visibility === "CHATGPT_VISIBLE" : item.visibility === "APP_ONLY")).map((item) => <article key={item.sequence} className={`rounded border p-3 ${item.visibility === "CHATGPT_VISIBLE" ? "border-blue-200 bg-white" : "border-slate-200 bg-slate-100"}`}><div className="flex flex-wrap justify-between gap-2 text-[10px] font-black uppercase text-slate-500"><span>#{item.sequence} · {item.type} · {item.visibility}</span><span>{formatDate(item.atUtc)}</span></div><details className="mt-2" open={item.type !== "user_message"}><summary className="cursor-pointer text-xs font-bold text-slate-700">{item.type === "user_message" ? "完整短指令（不含四檔全文）" : "內容"}</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700">{item.content}</pre></details></article>)}{!conversation.length ? <div className="py-10 text-center text-xs font-semibold text-slate-500">尚無 Run 對話。按下開始後，軟體事件與 ChatGPT 串流會即時寫入本機。</div> : null}</div>
        {conversationHasMore && workspaceRun ? <button className="btn" onClick={async () => { const page = await api?.getConversation({ runId: workspaceRun.runId, offset: conversationNextOffset, limit: 200 }); if (page?.ok) { setConversation((current) => [...current, ...(page.events ?? [])]); setConversationNextOffset(page.nextOffset ?? conversationNextOffset); setConversationHasMore(Boolean(page.hasMore)); } }}>載入更多對話事件</button> : null}
        {workspaceRun?.runDirectory ? <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => void api?.openFolder(workspaceRun.runDirectory!)}><FolderOpen size={15} />開啟 Run 資料夾</button><button className="btn" onClick={() => void api?.openFolder(`${workspaceRun.runDirectory!}\\conversation.md`)}><FileCheck2 size={15} />開啟 conversation.md</button><PathValue label="RUN DIRECTORY" value={workspaceRun.runDirectory} /></div> : null}
      </div>
    </Section>
    {capacityPrompt?.run.capacitySnapshot ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="capacity-warning-title">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border border-amber-300 bg-white shadow-2xl">
        <header className="border-b border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={22} /><div className="min-w-0"><h2 id="capacity-warning-title" className="text-lg font-black text-amber-950">容量警告 / Capacity warning</h2><p className="mt-1 text-sm font-semibold leading-relaxed text-amber-900">{capacityPrompt.run.capacityWarningCode === "ANALYSIS_MODEL_CONTEXT_CAPACITY_UNAVAILABLE" ? "目前無法取得此 Provider／Model 組合的容量界線，因此無法計算剩餘容量或超出量；以下仍顯示本次 Prompt 的完整估算。此狀況不代表已證明輸入超出限制。" : "本次估算需求高於已取得的 Provider／Model 容量。仍可確認後送出唯一一次單次分析。"}</p></div></div></header>
        <div className="space-y-4 p-5 text-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Metric label="Provider / Model" value={`${capacityPrompt.run.capacitySnapshot.providerDisplayName} / ${capacityPrompt.run.capacitySnapshot.modelDisplayName}`} /><Metric label="Capacity source" value={capacityPrompt.run.capacitySnapshot.capacitySource} detail={capacityPrompt.run.capacitySnapshot.capacitySourceStatus} /><Metric label="Provider capacity" value={capacityPrompt.run.capacitySnapshot.capacityTokens?.toLocaleString() ?? "Unavailable"} /></div>
          <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-3">Calculation item</th><th className="p-3 text-right">Tokens</th><th className="p-3">Formula / source</th></tr></thead><tbody>{[
            ["Estimated final input", capacityPrompt.run.capacitySnapshot.estimatedFinalInputTokens, `ceil(${capacityPrompt.run.capacitySnapshot.finalSerializedPromptBytesUtf8.toLocaleString()} UTF-8 bytes / 3)`],
            ["Visible output reserve", capacityPrompt.run.capacitySnapshot.estimatedVisibleOutputReserveTokens, `max(8,192, ${capacityPrompt.run.capacitySnapshot.recordCount} × 640)`],
            ["Reasoning reserve", capacityPrompt.run.capacitySnapshot.reasoningReserveTokens, "Configured reserve"],
            ["Safety margin", capacityPrompt.run.capacitySnapshot.safetyMarginTokens, "max(4,096, capacity × 8%); estimated input × 8% fallback when unavailable"],
            ["Other reserve", capacityPrompt.run.capacitySnapshot.otherReserveTokens, "Configured reserve"],
            ["Estimated required total", capacityPrompt.run.capacitySnapshot.estimatedRequiredTotalTokens, "final input + output/reasoning reserve"],
            ["Remaining after input", capacityPrompt.run.capacitySnapshot.remainingAfterInputTokens, "capacity - final input"],
            ["Estimated margin", capacityPrompt.run.capacitySnapshot.estimatedMarginTokens, "capacity - required total"],
            ["Estimated overage", capacityPrompt.run.capacitySnapshot.estimatedOverageTokens, "max(0, required total - capacity)"]
          ].map(([label, value, formula]) => <tr className="border-t border-slate-200" key={String(label)}><td className="p-3 font-bold">{label}</td><td className="p-3 text-right font-mono font-black">{typeof value === "number" ? value.toLocaleString() : "Unavailable"}</td><td className="p-3 font-mono text-[11px] text-slate-600">{formula}</td></tr>)}</tbody></table></div>
          <details className="rounded border border-slate-200 p-3"><summary className="cursor-pointer font-black text-slate-800">完整估算明細</summary><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><PathValue label="Snapshot SHA-256" value={capacityPrompt.run.capacitySnapshotHash} /><PathValue label="Estimator" value={`${capacityPrompt.run.capacitySnapshot.estimatorName} ${capacityPrompt.run.capacitySnapshot.estimatorVersion} · ${capacityPrompt.run.capacitySnapshot.estimatorMethod} · ${capacityPrompt.run.capacitySnapshot.roundingRule}`} /><PathValue label="Rules UTF-8 bytes" value={capacityPrompt.run.capacitySnapshot.rulesBytesUtf8.toLocaleString()} copy={false} /><PathValue label="Pending payload UTF-8 bytes" value={capacityPrompt.run.capacitySnapshot.pendingPayloadBytesUtf8.toLocaleString()} copy={false} /><PathValue label="Wrapper UTF-8 bytes" value={capacityPrompt.run.capacitySnapshot.wrapperInstructionsBytesUtf8.toLocaleString()} copy={false} /><PathValue label="Final prompt UTF-8 bytes" value={capacityPrompt.run.capacitySnapshot.finalSerializedPromptBytesUtf8.toLocaleString()} copy={false} /></div><p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500">UTF-8 bytes ratio is a fallback estimate, not an official Provider token count. Subsection estimates can differ from the whole serialized prompt because of tokenizer boundaries.</p></details>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button className="btn" disabled={busy} onClick={() => void cancelCapacity()}>取消</button><button className="btn btn-primary" disabled={busy} onClick={() => void confirmCapacity()}><Play size={15} />仍然執行單次分析</button></footer>
      </div>
    </div> : null}
  </div>;
}

function resultTone(status: string): Tone { return status === "CONFIRMED" || status === "MATCHED" ? "green" : status === "REJECTED" ? "red" : status === "UNKNOWN" || status === "EXCLUDED" ? "neutral" : "amber"; }

function ResultsPage({ snapshot, update, notify }: PageProps) {
  const api = window.desktopApp?.aiAnalysis;
  const active = snapshot.activeResult;
  const run = active ? snapshot.runs.find((item) => item.runId === active.runId) ?? snapshot.runs.find((item) => item.analyzedFileSha256 === active.analyzedResultSha256) ?? null : null;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const results = useMemo(() => (run?.results ?? []).filter((result) => (status === "all" || result.status === status) && (!query.trim() || (result.sourceDiffId + " " + result.candidates.map((candidate) => candidate.skillId + " " + candidate.skillName + " " + candidate.reason).join(" ")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [run, query, status]);
  async function chooseAnalyzed() { const result = await api?.chooseAnalyzed(); if (result?.snapshot) update(result.snapshot); if (result && !result.canceled && !result.ok) notify((result.errorCode ?? "ANALYSIS_INPUT_INVALID") + ": " + (result.message ?? ""), "red"); }
  async function activate(activeResultId: string) { const result = await api?.activateResult(activeResultId); if (result?.snapshot) update(result.snapshot); notify(result?.ok ? "Active Result 已切換。" : (result?.errorCode ?? "ANALYSIS_INPUT_INVALID") + ": " + (result?.message ?? ""), result?.ok ? "green" : "red"); }
  async function review(resultId: string, nextStatus: "CONFIRMED" | "REJECTED") { if (!run) return; const result = await api?.review({ runId: run.runId, resultId, status: nextStatus, note: reviewNotes[resultId] ?? "" }); if (result?.snapshot) update(result.snapshot); notify(result?.ok ? "Review saved: " + nextStatus : (result?.errorCode ?? "ANALYSIS_INPUT_INVALID") + ": " + (result?.message ?? ""), result?.ok ? "green" : "red"); }
  async function report(format: "csv" | "html") { if (!run) return; const result = await api?.exportRun({ runId: run.runId, format }); notify(result?.canceled ? "Report export cancelled." : result?.filePath ? "Report saved: " + result.filePath : (result?.errorCode ?? "ANALYSIS_INPUT_INVALID") + ": " + (result?.message ?? ""), result?.filePath ? "green" : "red"); }
  async function openHtml() { if (!run) return; const result = await api?.openHtml(run.runId); notify(result?.ok ? "HTML opened: " + result.filePath : (result?.errorCode ?? "AI_HTML_RENDER_FAILED") + ": " + (result?.message ?? result?.error ?? ""), result?.ok ? "green" : "red"); }
  return <div className="space-y-4">
    <Section eyebrow="Active Analysis Result v1" title="Activity Events 分析結果" description="此頁只顯示已通過 durable commit 的 Active Dataset 與成功歷史；失敗診斷與對話保留在分析工作區。" actions={<button className="btn" onClick={() => void chooseAnalyzed()}><FileJson size={15} />匯入已分析 JSON</button>}>
      {!active || !run ? <div className="flex min-h-44 items-center justify-center rounded border border-dashed border-slate-300 text-sm font-semibold text-slate-500">尚無可顯示的成功 Active Result</div> : <div className="space-y-4">
        <div className="flex min-w-0 flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-[10px] font-black text-slate-600">SUCCESSFUL RESULT HISTORY<select className="field mt-1" value={active.activeResultId} onChange={(event) => void activate(event.target.value)}>{(snapshot.successfulResults ?? []).map((item) => <option key={item.activeResultId} value={item.activeResultId}>{item.authoritativeCompletedAtUtc + " · " + item.recordCount + " records · " + item.sourceKind}</option>)}</select></label><Badge tone="green">ACTIVE / VERIFIED</Badge></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Records" value={active.recordCount} /><Metric label="Events (Package)" value={active.statistics.eventCount ?? "Unavailable"} /><Metric label="Unique Issues (Package)" value={active.statistics.uniqueIssueCount ?? "Unavailable"} /><Metric label="Skill Findings (Package)" value={active.statistics.skillFindingCount ?? "Unavailable"} /><Metric label="Package" value={active.packageState} /><Metric label="HTML" value={active.htmlState} /><Metric label="SQLite" value={active.sqliteState} /><Metric label="Completed" value={formatDate(active.authoritativeCompletedAtUtc)} /></div>
        <div className="grid gap-3 md:grid-cols-2"><PathValue label="ACTIVE ANALYZED RESULT" value={active.analyzedResultPath} /><PathValue label="SHA-256" value={active.analyzedResultSha256} /><PathValue label="RULE SET ID" value={active.ruleSetId} /><PathValue label="SOURCE DATASET SHA-256" value={active.sourceDatasetSha256} /></div>
        <div className="flex flex-wrap gap-2"><button className="btn" disabled={!active.htmlPath} onClick={() => void openHtml()}><FolderOpen size={15} />開啟 HTML</button><button className="btn" onClick={() => void report("csv")}>CSV</button><button className="btn btn-primary" onClick={() => void report("html")}>產生 HTML 報告</button></div>
      </div>}
    </Section>
    {active && run ? <Section eyebrow="Active Dataset review" title="分類結果" description={active.activeResultId + " · " + active.recordCount + " records"}>
      <div className="mb-4 flex min-w-0 flex-wrap gap-2"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={15} /><input className="field pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋 Issue、Skill ID、名稱或理由" /></label><select className="field w-auto min-w-44" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部分析判定狀態</option><option value="PENDING_REVIEW">Pending review</option><option value="NEEDS_REVIEW">Needs review</option><option value="CONFIRMED">Confirmed</option><option value="REJECTED">Rejected</option><option value="UNKNOWN">Unknown</option></select></div>
      <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-3">Evidence / Source Diff</th><th className="p-3">Status</th><th className="p-3">Skill candidates</th><th className="w-72 p-3">Review</th></tr></thead><tbody>{results.map((result) => <tr className="border-t border-slate-200 align-top" key={result.resultId}><td className="p-3"><code className="block max-w-64 break-all text-[10px] font-bold text-blue-700">{result.sourceDiffId}</code></td><td className="p-3"><Badge tone={resultTone(result.status)}>{result.status}</Badge></td><td className="p-3">{result.candidates.length ? result.candidates.map((candidate) => <div className="mb-2 rounded bg-slate-50 p-2 last:mb-0" key={candidate.skillId}><div className="font-black">{candidate.skillId} · {candidate.skillName}</div><div className="mt-1 break-words text-[11px] text-slate-600">{candidate.reason}</div></div>) : <span className="text-slate-500">No candidate</span>}</td><td className="p-3"><input className="field py-2 text-xs" value={reviewNotes[result.resultId] ?? result.reviewNote} onChange={(event) => setReviewNotes((current) => ({ ...current, [result.resultId]: event.target.value }))} placeholder="Review note" /><div className="mt-2 flex gap-2"><button className="btn flex-1 py-2" onClick={() => void review(result.resultId, "CONFIRMED")}><Check size={13} />Confirm</button><button className="btn flex-1 py-2" onClick={() => void review(result.resultId, "REJECTED")}><XCircle size={13} />Reject</button></div></td></tr>)}</tbody></table></div>
      {!results.length ? <div className="py-12 text-center text-sm font-semibold text-slate-500">No matching analysis results</div> : null}
    </Section> : null}
  </div>;
}
export function AiAnalysisReconstructedPage() {
  const [snapshot, setSnapshot] = useState<AiAnalysisSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => (sessionStorage.getItem("jaa-ai-tab") as Tab | null) ?? "diagnostics");
  const [notice, setNotice] = useState<{ message: string; tone: Tone } | null>(null);
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  useEffect(() => {
    const api = window.desktopApp?.aiAnalysis;
    if (!api) { setNotice({ message: "AI_ANALYSIS_BRIDGE_UNAVAILABLE: Electron preload bridge is unavailable.", tone: "red" }); return; }
    void api.getSnapshot().then(async (value) => {
      setSnapshot(value);
      if (value.chatgpt.state === "stopped") { await api.startChatGpt(); setSnapshot(await api.getSnapshot()); }
    }).catch((error) => setNotice({ message: error instanceof Error ? error.message : String(error), tone: "red" }));
    return api.onSnapshotChanged(setSnapshot);
  }, []);
  useEffect(() => {
    if (!notice) return;
    appendDebugLog("analysis", [`[${notice.tone === "red" ? "ERROR" : "INFO"}] ${notice.message.replace(/(?:token|authorization)\s*[:=]\s*\S+/gi, "$1: [masked]")}`]);
  }, [notice, appendDebugLog]);
  function chooseTab(tab: Tab) { setActiveTab(tab); sessionStorage.setItem("jaa-ai-tab", tab); }
  function notify(message: string, tone: Tone = "blue") { setNotice({ message, tone }); }
  return (
    <div className="min-w-0 pb-8" data-ui-version="0.3.26">
      <header className="mb-4 flex min-w-0 items-start gap-3"><span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-600 text-white"><Sparkles size={20} /></span><div className="min-w-0"><div className="text-[10px] font-black uppercase text-blue-600">Skill Analysis Workspace</div><h1 className="mt-1 text-2xl font-black leading-tight text-slate-900">AI Analysis</h1><p className="mt-1 max-w-4xl break-words text-sm font-semibold leading-relaxed text-slate-500">匯入已挑選的 Activity Events，選擇分析方式，檢視結果並產出技能分析報告。</p></div></header>
      <div className="mb-4 grid min-w-0 grid-cols-1 overflow-hidden rounded-md border border-slate-200 bg-white md:grid-cols-3" role="tablist">{tabItems.map((tab) => <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`flex min-w-0 items-center gap-3 border-b border-slate-200 px-4 py-3 text-left last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${activeTab === tab.id ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => chooseTab(tab.id)}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-black ${activeTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{tab.number}</span><span className="min-w-0 flex-1 break-words text-sm font-black">{tab.label}</span>{tab.id === "results" && snapshot?.successfulResults?.length ? <Badge tone="blue">{snapshot.successfulResults.length}</Badge> : <ChevronRight className="shrink-0 opacity-40" size={15} />}</button>)}</div>
      {notice ? <div className={`mb-4 flex items-start gap-2 rounded border p-3 text-xs font-bold ${toneClasses(notice.tone)}`}>{notice.tone === "red" ? <AlertTriangle className="mt-0.5 shrink-0" size={15} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={15} />}<span className="min-w-0 flex-1 break-words">{notice.message}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}>×</button></div> : null}
      {!snapshot ? <div className="flex min-h-80 items-center justify-center rounded border border-slate-200 bg-white"><LoaderCircle className="animate-spin text-blue-600" size={24} /></div> : activeTab === "diagnostics" ? <DiagnosticsPage snapshot={snapshot} update={setSnapshot} notify={notify} /> : activeTab === "workspace" ? <WorkspacePage snapshot={snapshot} update={setSnapshot} notify={notify} goResults={() => chooseTab("results")} /> : <ResultsPage snapshot={snapshot} update={setSnapshot} notify={notify} />}
      <footer className="mt-5 flex min-w-0 flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600"><Database size={14} /><span>Only completed analysis results use the separate AI Analysis SQLite database. Jira source databases remain read-only.</span><Clock3 className="ml-auto" size={14} /></footer>
    </div>
  );
}
