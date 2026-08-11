import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Database, Download, FolderOpen, LoaderCircle, MessageSquare, Play, RefreshCw, Save, Send, Settings2, ShieldCheck, Sparkles, Square, Upload } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AiAnalysisSnapshot, AiAnalyzerMode, AiChatMessage, AiDiagnosticRun, AiPublicSettings, AiServiceKey } from "../../shared/aiAnalysisContract";
import type { AppOutletContext } from "../components/AppLayout";

type Tab = "diagnostics" | "workspace" | "results";
const emptySnapshot: AiAnalysisSnapshot | null = null;

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const colors = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800" };
  return <span className={`inline-flex max-w-full items-center rounded px-2 py-1 text-[11px] font-black ${colors[tone]}`}>{children}</span>;
}

function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <section className="min-w-0 rounded-md border border-line bg-white p-4 shadow-sm"><div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-base font-black text-ink">{title}</h2>{subtitle ? <p className="mt-1 break-words text-xs font-semibold leading-relaxed text-muted">{subtitle}</p> : null}</div>{actions}</div>{children}</section>;
}

function Field({ label, value, type = "text", onChange, placeholder }: { label: string; value: string; type?: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="min-w-0 text-xs font-black text-slate-700"><span className="mb-1 block">{label}</span><input className="field w-full" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ServiceSettings({ service, env, onChanged }: { service: AiServiceKey; env: AiAnalysisSnapshot["env"]; onChanged: (snapshot: AiAnalysisSnapshot, message: string) => void }) {
  const source = service === "cloud" ? env.cloud : env.local;
  const [form, setForm] = useState(() => ({ ...source, secret: "" }));
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ ...source, secret: "" }), [source.configFingerprint]);
  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    const api = window.desktopApp?.aiAnalysis; if (!api) return;
    setBusy(true);
    const result = await api.saveSettings({ service, provider: form.provider, endpoint: form.endpoint, model: form.model, apiContract: form.apiContract,
      authType: form.authType, organization: form.organization, project: form.project, contextWindow: form.contextWindow,
      timeoutMs: form.timeoutMs, maxOutputTokens: form.maxOutputTokens, maxRetries: form.maxRetries,
      secret: form.secret, preserveSecret: !form.secret, expectedEnvSha256: env.sha256, expectedEnvMtimeMs: env.mtimeMs });
    setBusy(false);
    if (result.ok && result.snapshot) onChanged(result.snapshot, "設定已安全寫入本機 .env；密鑰不會傳到 renderer。 / Settings saved locally.");
    else onChanged({ ...({ env } as AiAnalysisSnapshot) }, `${result.errorCode}: ${result.message}`);
  }
  return <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
    <Field label="Provider" value={form.provider} onChange={(value) => update("provider", value)} />
    <Field label="Endpoint" value={form.endpoint} placeholder="https://api.openai.com/v1" onChange={(value) => update("endpoint", value)} />
    <Field label="Model" value={form.model} onChange={(value) => update("model", value)} />
    <label className="text-xs font-black text-slate-700"><span className="mb-1 block">API Contract</span><select className="field" value={form.apiContract} onChange={(event) => update("apiContract", event.target.value)}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions</option></select></label>
    <label className="text-xs font-black text-slate-700"><span className="mb-1 block">Auth Type</span><select className="field" value={form.authType} onChange={(event) => update("authType", event.target.value)}><option value="bearer">Bearer</option><option value="api_key">API Key</option></select></label>
    <Field label={source.secretConfigured ? "Secret（已設定，留空即保留）" : "Secret"} type="password" value={form.secret} onChange={(value) => update("secret", value)} />
    <Field label="Organization（optional）" value={form.organization} onChange={(value) => update("organization", value)} />
    <Field label="Project（optional）" value={form.project} onChange={(value) => update("project", value)} />
    <Field label="Context Window" type="number" value={String(form.contextWindow ?? "")} onChange={(value) => update("contextWindow", value ? Number(value) : null)} />
    <Field label="Timeout (ms)" type="number" value={String(form.timeoutMs)} onChange={(value) => update("timeoutMs", Number(value))} />
    <Field label="Max Output Tokens" type="number" value={String(form.maxOutputTokens ?? "")} onChange={(value) => update("maxOutputTokens", value ? Number(value) : null)} />
    <Field label="Max Retries" type="number" value={String(form.maxRetries)} onChange={(value) => update("maxRetries", Number(value))} />
    <div className="flex items-end"><button className="btn btn-primary w-full" type="button" disabled={busy || !env.found || !env.supported} onClick={save}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}儲存設定 / Save</button></div>
  </div>;
}

function Diagnostics({ snapshot, setSnapshot, notice }: { snapshot: AiAnalysisSnapshot; setSnapshot: (value: AiAnalysisSnapshot) => void; notice: (value: string) => void }) {
  const [service, setService] = useState<AiServiceKey>("local");
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<AiDiagnosticRun | null>(null);
  const [chat, setChat] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const current = service === "cloud" ? snapshot.env.cloud : snapshot.env.local;
  const api = window.desktopApp?.aiAnalysis;
  async function reload() { if (api) setSnapshot(await api.reloadEnv()); }
  async function test() { if (!api) return; setBusy(true); const result = await api.testConnection(service); setBusy(false); notice(result.ok ? `連線成功，耗時 ${result.elapsedMs} ms。` : `${result.errorCode}: ${result.message}`); }
  async function diagnose() { if (!api) return; setBusy(true); const result = await api.diagnose(service); setDiagnostic(result); setBusy(false); notice(result.status === "passed" ? "七項診斷全部通過。" : "診斷失敗，已保存去敏感診斷資料。"); }
  async function send() {
    if (!api || !input.trim()) return; const user: AiChatMessage = { id: crypto.randomUUID(), sessionId: "ui-session", role: "user", service, provider: current.provider, model: current.model, createdAt: new Date().toISOString(), elapsedMs: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, availability: "unavailable", estimatedInputTokens: null }, text: input.trim() };
    const next = [...chat, user]; setChat(next); setInput(""); setBusy(true);
    const result = await api.chat({ service, sessionId: "ui-session", messages: next.map((item) => ({ role: item.role, text: item.text })) }); setBusy(false);
    if (result.ok && result.message) setChat([...next, result.message]); else notice(`${result.errorCode}: ${String(result.message ?? "Chat failed")}`);
  }
  return <div className="space-y-4">
    {!snapshot.env.found || !snapshot.env.supported ? <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950"><AlertTriangle className="mr-2 inline" size={17} />{snapshot.env.message}<div className="mt-2 break-all font-mono text-xs">{snapshot.env.envPath}</div></div> : null}
    <Panel title="AI 服務設定 / AI Service Configuration" subtitle="密鑰只由 Electron main process 讀取；renderer 僅看到是否已設定。" actions={<div className="flex gap-2"><button className={`btn ${service === "cloud" ? "btn-primary" : ""}`} onClick={() => setService("cloud")}>Cloud</button><button className={`btn ${service === "local" ? "btn-primary" : ""}`} onClick={() => setService("local")}>Local</button><button className="btn" onClick={reload}><RefreshCw size={14} />Reload</button></div>}>
      <div className="mb-4 flex flex-wrap gap-2"><Pill tone={current.secretConfigured ? "green" : "amber"}>{current.secretConfigured ? "Secret configured" : "Secret missing"}</Pill><Pill>{current.apiContract}</Pill><Pill>{current.connectionStatus}</Pill><Pill>Fingerprint {current.configFingerprint.slice(0, 10)}</Pill></div>
      <ServiceSettings service={service} env={snapshot.env} onChanged={(next, message) => { if (next.ipcVersion) setSnapshot(next); notice(message); }} />
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy} onClick={test}><ShieldCheck size={15} />Test Connection</button><button className="btn" disabled={busy} onClick={diagnose}><Settings2 size={15} />Run 7-step Diagnostics</button></div>
    </Panel>
    {diagnostic ? <Panel title="診斷結果 / Diagnostics" subtitle={`Run ${diagnostic.runId}`}><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{diagnostic.steps.map((step) => <div key={step.id} className="min-w-0 rounded-md border border-line p-3"><div className="flex justify-between gap-2"><b className="text-xs">{step.name}</b><Pill tone={step.status === "passed" ? "green" : step.status === "failed" ? "red" : "slate"}>{step.status}</Pill></div><p className="mt-2 break-words text-xs text-muted">{step.message}</p></div>)}</div><pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs text-slate-100">{diagnostic.copySummary}</pre></Panel> : null}
    <Panel title="Plain-text Chat" subtitle="用於驗證目前 service、model 與 multi-turn contract；不保存密鑰。" actions={<button className="btn" onClick={() => setChat([])}>New Session</button>}><div className="thin-scroll max-h-72 space-y-2 overflow-y-auto rounded-md border border-line bg-slate-50 p-3">{chat.length ? chat.map((message) => <div key={message.id} className={`max-w-[88%] rounded-md p-3 text-sm ${message.role === "user" ? "ml-auto bg-blue-600 text-white" : "bg-white text-slate-800"}`}><b className="mb-1 block text-[10px] uppercase">{message.role} · {message.model}</b><span className="whitespace-pre-wrap break-words">{message.text}</span></div>) : <div className="py-8 text-center text-sm font-semibold text-muted"><MessageSquare className="mx-auto mb-2" />尚無訊息 / No messages</div>}</div><div className="mt-3 flex min-w-0 gap-2"><textarea className="field min-h-20 flex-1 resize-y" value={input} onChange={(event) => setInput(event.target.value)} /><button className="btn btn-primary self-end" disabled={busy || !input.trim()} onClick={send}><Send size={15} />Send</button></div></Panel>
  </div>;
}

function Workspace({ snapshot, setSnapshot, notice, goResults }: { snapshot: AiAnalysisSnapshot; setSnapshot: (value: AiAnalysisSnapshot) => void; notice: (value: string) => void; goResults: () => void }) {
  const [mode, setMode] = useState<AiAnalyzerMode>("OFFLINE_RULE");
  const dataset = snapshot.pendingDatasets.find((item) => item.datasetId === snapshot.selectedPendingDatasetId) ?? snapshot.pendingDatasets[0] ?? null;
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (dataset) setSelected(dataset.diffs.filter((item) => item.substantive).map((item) => item.sourceDiffId)); }, [dataset?.datasetId]);
  const api = window.desktopApp?.aiAnalysis;
  async function chooseRules() { if (!api) return; const result = await api.chooseRules(); setSnapshot(result.snapshot); if (!result.canceled) notice(result.ok === false ? `${result.errorCode}: ${result.message}` : "規則快照已驗證並凍結。 / Rules verified."); }
  async function choosePending() { if (!api) return; const result = await api.choosePending(); setSnapshot(result.snapshot); if (!result.canceled) notice(result.ok === false ? `${result.errorCode}: ${result.message}` : "Pending-analysis JSON 已通過 schema 與 integrity 驗證。"); }
  async function start() { if (!api || !dataset) return; setBusy(true); const result = await api.start({ mode, datasetId: dataset.datasetId, selectedDiffIds: selected, service: mode === "CLOUD_AI" ? "cloud" : "local" }); setBusy(false); if (result.snapshot) setSnapshot(result.snapshot); notice(result.ok ? "分析完成；所有候選結果均待人工覆核。" : `${result.errorCode ?? result.run?.progress.errorCode}: ${result.message ?? result.run?.progress.message}`); if (result.run) goResults(); }
  return <div className="space-y-4">
    <Panel title="分析模式 / Analyzer Mode" subtitle="Cloud 與 Local 使用 main-process provider；Offline 使用 deterministic field-aware rules。"><div className="grid gap-3 md:grid-cols-3">{(["CLOUD_AI", "LOCAL_AI", "OFFLINE_RULE"] as AiAnalyzerMode[]).map((item) => <button key={item} className={`min-w-0 rounded-md border p-4 text-left ${mode === item ? "border-blue-500 bg-blue-50" : "border-line bg-white"}`} onClick={() => setMode(item)}><b className="block text-sm">{item.replace(/_/g, " ")}</b><span className="mt-1 block text-xs font-semibold text-muted">{item === "OFFLINE_RULE" ? "No network request" : "Validated provider connection required"}</span></button>)}</div></Panel>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2"><Panel title="規則基礎 / Analysis Rules" actions={<button className="btn" onClick={chooseRules}><FolderOpen size={15} />選擇資料夾</button>}>{snapshot.rules ? <div><div className="flex flex-wrap gap-2"><Pill tone={snapshot.rules.valid ? "green" : "red"}>{snapshot.rules.valid ? "Verified" : "Invalid"}</Pill><Pill>{snapshot.rules.catalogCount} skills</Pill><Pill>{snapshot.rules.ruleSetId}</Pill></div><div className="mt-3 space-y-2">{snapshot.rules.files.map((file) => <div key={file.fileName} className="min-w-0 rounded border border-line p-2 text-xs"><b>{file.kind}: {file.fileName}</b><div className="mt-1 truncate font-mono text-muted" title={file.sha256}>{file.sha256}</div></div>)}</div></div> : <p className="text-sm font-semibold text-muted">尚未載入規則資料夾。</p>}</Panel>
    <Panel title="待分析資料 / Pending Analysis" actions={<button className="btn" onClick={choosePending}><Upload size={15} />選擇 JSON</button>}>{dataset ? <div><div className="flex flex-wrap gap-2"><Pill tone="green">Integrity verified</Pill><Pill>{dataset.eventCount} events</Pill><Pill>{dataset.issues} issues</Pill><Pill>{dataset.projects} projects</Pill></div><p className="mt-3 break-all text-xs font-black">{dataset.fileName}</p><p className="mt-1 truncate font-mono text-[10px] text-muted" title={dataset.sourceFileSha256}>{dataset.sourceFileSha256}</p></div> : <p className="text-sm font-semibold text-muted">尚未選擇 pending-analysis JSON。</p>}</Panel></div>
    {dataset ? <Panel title="Diff 選擇 / Evidence Selection" subtitle={`已選 ${selected.length} / ${dataset.diffs.length}；只有選取項目會送入分析。`} actions={<div className="flex gap-2"><button className="btn" onClick={() => setSelected(dataset.diffs.map((item) => item.sourceDiffId))}>Select all</button><button className="btn" onClick={() => setSelected([])}>Clear</button></div>}><div className="thin-scroll max-h-80 overflow-auto rounded-md border border-line"><table className="table min-w-[760px]"><thead><tr><th className="w-12"></th><th>Issue</th><th>Actor</th><th>Field</th><th>Changed</th><th>Evidence</th></tr></thead><tbody>{dataset.diffs.map((diff) => <tr key={diff.sourceDiffId}><td><input type="checkbox" checked={selected.includes(diff.sourceDiffId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, diff.sourceDiffId] : current.filter((id) => id !== diff.sourceDiffId))} /></td><td>{diff.issueKey}</td><td>{diff.actorDisplayName || diff.actorId || "-"}</td><td>{diff.fieldName || diff.fieldId}</td><td>+{diff.addedLineCount} / -{diff.removedLineCount}</td><td className="max-w-64 truncate font-mono text-[10px]" title={diff.evidenceId}>{diff.evidenceId}</td></tr>)}</tbody></table></div><div className="mt-4 flex justify-end"><button className="btn btn-primary" disabled={busy || !snapshot.rules?.valid || !selected.length} onClick={start}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}開始分析 / Start Analysis</button></div></Panel> : null}
  </div>;
}

function Results({ snapshot, setSnapshot, notice }: { snapshot: AiAnalysisSnapshot; setSnapshot: (value: AiAnalysisSnapshot) => void; notice: (value: string) => void }) {
  const run = snapshot.runs.find((item) => item.runId === snapshot.selectedRunId) ?? snapshot.runs[0] ?? null;
  const api = window.desktopApp?.aiAnalysis;
  async function review(resultId: string, status: "CONFIRMED" | "REJECTED" | "PENDING_REVIEW") { if (!api || !run) return; const result = await api.review({ runId: run.runId, resultId, status, note: status === "CONFIRMED" ? "Confirmed in UI" : "" }); if (result.snapshot) setSnapshot(result.snapshot); }
  async function exportRun(format: "json" | "csv" | "html") { if (!api || !run) return; const result = await api.exportRun({ runId: run.runId, format }); notice(result.canceled ? "已取消匯出。" : result.errorCode ? `${result.errorCode}: ${result.message}` : `匯出完成：${result.filePath}`); }
  if (!run) return <Panel title="分析結果 / Analysis Results"><div className="py-16 text-center text-sm font-semibold text-muted">尚無正式分析結果。請先至 Analysis Workspace 執行分析。</div></Panel>;
  return <div className="space-y-4"><Panel title="Run Summary" subtitle={run.runId} actions={<div className="flex flex-wrap gap-2"><button className="btn" disabled={run.status !== "completed"} onClick={() => exportRun("json")}><Download size={14} />JSON</button><button className="btn" disabled={run.status !== "completed"} onClick={() => exportRun("csv")}><Download size={14} />CSV</button><button className="btn" disabled={run.status !== "completed"} onClick={() => exportRun("html")}><Download size={14} />HTML</button></div>}><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><div><span className="text-[10px] font-black text-muted">STATUS</span><div className="mt-1"><Pill tone={run.status === "completed" ? "green" : run.status === "failed" ? "red" : "blue"}>{run.status}</Pill></div></div><div><span className="text-[10px] font-black text-muted">MODE</span><b className="mt-1 block text-sm">{run.analyzerMode}</b></div><div><span className="text-[10px] font-black text-muted">RESULTS</span><b className="mt-1 block text-xl">{run.results.length}</b></div><div><span className="text-[10px] font-black text-muted">PROGRESS</span><b className="mt-1 block text-xl">{run.progress.completedDiffs}/{run.progress.totalDiffs}</b></div></div>{run.progress.errorCode ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{run.progress.errorCode}: {run.progress.message}</div> : null}</Panel>
    <Panel title="逐筆結果與人工覆核 / Per-diff Review" subtitle="AI 與規則引擎結果預設為 PENDING_REVIEW；只有使用者可以確認。"><div className="space-y-3">{run.results.map((result) => <article key={result.resultId} className="min-w-0 rounded-md border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><b className="break-all font-mono text-xs text-blue-700">{result.sourceDiffId}</b><div className="mt-2 flex flex-wrap gap-2"><Pill tone={result.status === "CONFIRMED" ? "green" : result.status === "REJECTED" ? "red" : "amber"}>{result.status}</Pill><Pill>{result.candidates.length} candidates</Pill></div></div><div className="flex gap-2"><button className="btn py-2" onClick={() => review(result.resultId, "CONFIRMED")}><Check size={14} />Confirm</button><button className="btn py-2" onClick={() => review(result.resultId, "REJECTED")}><Square size={14} />Reject</button></div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{result.candidates.map((candidate) => <div key={candidate.skillId} className="rounded-md bg-slate-50 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-xs">{candidate.skillId} · {candidate.skillName}</b><span className="text-xs font-black text-blue-700">{candidate.score ?? "-"}</span></div><p className="mt-2 break-words text-xs font-semibold leading-relaxed text-muted">{candidate.reason}</p></div>)}</div></article>)}</div></Panel></div>;
}

export function AiAnalysisFunctionalPage() {
  const [snapshot, setSnapshot] = useState<AiAnalysisSnapshot | null>(emptySnapshot);
  const [activeTab, setActiveTab] = useState<Tab>("diagnostics");
  const [message, setMessage] = useState<string | null>(null);
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  useEffect(() => {
    const api = window.desktopApp?.aiAnalysis; if (!api) return;
    void api.getSnapshot().then(setSnapshot).catch((error) => setMessage(String(error)));
    return api.onSnapshotChanged(setSnapshot);
  }, []);
  useEffect(() => { if (message) appendDebugLog("analysis", [`[INFO] ${message.replace(/(?:token|authorization)\s*[:=]\s*\S+/gi, "$1: [masked]")}`]); }, [message]);
  const tabs = useMemo(() => [{ id: "diagnostics" as const, label: "AI 連線與診斷", sub: "AI Diagnostics" }, { id: "workspace" as const, label: "分析工作區", sub: "Analysis Workspace" }, { id: "results" as const, label: "分析結果", sub: "Analysis Results" }], []);
  return <div className="min-w-0 pb-8"><header className="mb-4 flex min-w-0 items-start gap-3"><span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white"><Sparkles size={20} /></span><div className="min-w-0"><div className="text-[10px] font-black uppercase text-blue-600">Skill Analysis Workspace</div><h1 className="mt-1 text-2xl font-black leading-tight text-ink">AI Analysis</h1><p className="mt-1 max-w-4xl text-sm font-semibold leading-relaxed text-muted">從已驗證的 pending-analysis evidence 執行可追溯分析、人工覆核與安全匯出。</p></div></header>
    <div className="mb-4 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3" role="tablist">{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`min-w-0 rounded-md border px-4 py-3 text-left ${activeTab === tab.id ? "border-blue-500 bg-blue-50 text-blue-800" : "border-line bg-white text-slate-700"}`} onClick={() => setActiveTab(tab.id)}><b className="block text-sm">{tab.label}</b><span className="text-[11px] font-semibold">{tab.sub}</span></button>)}</div>
    {message ? <div className="mb-4 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900"><Check className="mt-0.5 shrink-0" size={15} /><span className="min-w-0 flex-1 break-words">{message}</span><button onClick={() => setMessage(null)}>×</button></div> : null}
    {!snapshot ? <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="animate-spin text-blue-600" /></div> : activeTab === "diagnostics" ? <Diagnostics snapshot={snapshot} setSnapshot={setSnapshot} notice={setMessage} /> : activeTab === "workspace" ? <Workspace snapshot={snapshot} setSnapshot={setSnapshot} notice={setMessage} goResults={() => setActiveTab("results")} /> : <Results snapshot={snapshot} setSnapshot={setSnapshot} notice={setMessage} />}
    <footer className="mt-5 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600"><Database size={14} />AI results use a separate SQLite database. Source Jira and Current-State databases remain read-only.</footer>
  </div>;
}
