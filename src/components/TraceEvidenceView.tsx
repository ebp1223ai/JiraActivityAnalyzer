import { commentTextV046, isCommentV046 } from "../../shared/activityPresentationV046";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ReadableContentCell } from "./ReadableContentCell";
import { ContentDiffViewer } from "./ContentDiffViewer";
import { normalizeActivityChange } from "../utils/normalizedChange";
import { traceContentV043 } from "../../shared/aiResultProjectionV043";

type Json = Record<string, any>;
export function TraceDiffLines({ row, expanded = false }: { row: Json; expanded?: boolean }) {
  const trace = row.contentSource === "RAW_EVENT" ? null : row.sourceTrace;
  const content = row.displaySourcePolicy ? row : trace ? traceContentV043(trace) : row;
  if (row.displayReason) return <div role="status" data-source-content="true" className="space-y-2 text-amber-800"><b>AI 差異不可用 / AI Snapshot</b><p>{row.displayReason === "AI_DIFF_INTEGRITY" ? "完整性無法確認，不使用 Raw 代替 AI 差異。" : "分析時差異未提供，不使用 Raw 代替 AI 差異。"}</p><span className="text-xs">新增 未知 · 移除 未知</span></div>;
  if (isCommentV046(row)) return <div data-comment-full="true" className="space-y-2"><div className="text-xs text-muted">留言全文 · {String(row.eventType ?? row.action ?? "")} · {row.contentSource === "RAW_EVENT" ? "原始事件" : "分析當時內容"} · {String((content.after as Json)?.provenance ?? row.sourceProvenance ?? "")}</div><pre className={`whitespace-pre-wrap break-words overflow-auto ${expanded ? "max-h-96" : "max-h-40"}`}>{commentTextV046(content.after) ?? "未取得留言全文"}</pre><span className="text-xs">分析範圍：全文 · 差異行數：不適用</span></div>;
  const hunks = content.diffHunks ?? [];
  const normalized = normalizeActivityChange({ ...row, before: content.before, after: content.after });
  const lines = hunks.flatMap((h: Json) => h.lines ?? [h]);
  return <div className="min-w-0 space-y-2" data-source-content="true">
    <div className="text-xs text-muted">{row.contentSource === "RAW_EVENT" ? "原始事件 / Raw Event" : content.contentAvailability === "COMPACT_ONLY" ? "僅包含差異片段" : "分析當時內容"}{content.before === null ? " · 未提供變更前內容" : ""}</div>
    {content.before !== null && content.after !== null && normalized.contentDisplay.mode === "diff" ? <ContentDiffViewer result={normalized.contentDisplay} segments={normalized.diff ?? []} /> : lines.length ? <div className={`thin-scroll min-w-0 overflow-auto ${expanded ? "max-h-96" : "max-h-40"}`}>{lines.map((line: Json, index: number) => <pre key={index} className={`m-0 whitespace-pre-wrap break-words px-2 py-1 font-mono text-xs ${["insert", "add"].includes(line.kind) ? "bg-emerald-50 text-emerald-900" : ["delete", "remove"].includes(line.kind) ? "bg-rose-50 text-rose-900" : "bg-slate-50"}`}><span aria-hidden="true">{["insert", "add"].includes(line.kind) ? "+ " : ["delete", "remove"].includes(line.kind) ? "- " : "  "}</span>{String(line.text ?? "")}</pre>)}</div> : content.diffText ? <pre className="whitespace-pre-wrap break-words text-xs">{content.diffText}</pre> : <div className="grid min-w-0 gap-3 md:grid-cols-2"><div><b>變更前</b><ReadableContentCell value={content.before} missing="未提供變更前內容" /></div><div><b>變更後</b><ReadableContentCell value={content.after} missing="未提供變更後內容" /></div></div>}
    <span className="text-xs">新增 {content.addedLineCount ?? "未知"} · 移除 {content.removedLineCount ?? "未知"}</span>
  </div>;
}

export function TraceEvidenceView({ row }: { row: Json }) {
  const [tab, setTab] = useState(row.contentSource === "RAW_EVENT" ? "raw" : "trace");
  const raw = row.rawSupplement ?? (row.contentSource === "RAW_EVENT" ? row : null);
  return <section className="min-w-0 space-y-3" aria-label="事件來源與分析詳細資料">
    <div role="tablist" className="flex flex-wrap gap-2"><button className="btn" role="tab" aria-selected={tab === "trace"} onClick={() => setTab("trace")}>分析當時內容</button><button className="btn" role="tab" aria-selected={tab === "raw"} disabled={!raw} title={!raw ? "原始資料庫未開啟或尚無唯一配對事件" : "唯一配對的原始事件"} onClick={() => setTab("raw")}>已配對原始事件</button></div>
    {row.sourceConflict ? <div className="flex gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><AlertTriangle size={18} className="shrink-0" />來源內容不同，分析快照與原始事件分開保留。</div> : null}
    {tab === "trace" ? <TraceDiffLines row={{ ...row, contentSource: "ANALYSIS_TIME" }} expanded /> : raw ? <div className="grid gap-3 md:grid-cols-2"><div><b>原始事件：變更前</b><ReadableContentCell value={raw.before} missing="未提供變更前內容" /></div><div><b>原始事件：變更後</b><ReadableContentCell value={raw.after} missing="未提供變更後內容" /></div></div> : null}
    <details><summary className="cursor-pointer font-bold">AI 建議與人工驗收明細</summary><div className="space-y-3 py-3">{(row.skillFindings ?? []).map((f: Json) => <section key={f.skillId} className="border-b py-2"><b>{f.skillId} · {f.skillName}</b><p className="whitespace-pre-wrap break-words text-sm">{f.rationale}</p>{f.evidence.map((e: Json, i: number) => <blockquote key={i} className="my-2 border-l-2 pl-3"><pre className="whitespace-pre-wrap break-words text-xs">{e.quote}</pre><small className="break-all">{e.sourceJsonPointer}</small></blockquote>)}</section>)}<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(row.manual ?? { state: "AI_ONLY", confirmed: [] }, null, 2)}</pre></div></details>
  </section>;
}
