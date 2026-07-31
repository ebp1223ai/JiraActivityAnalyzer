import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ContentDisplayResult } from "../utils/contentDisplay";
import type { DiffSegment } from "../utils/normalizedChange";

type ViewerMode = "inline" | "side-by-side" | "before" | "after" | "latest";

export function ContentDiffViewer({ result, segments }: { result: ContentDisplayResult; segments: DiffSegment[] }) {
  const [mode, setMode] = useState<ViewerMode>(result.mode === "diff" ? "inline" : "latest");
  const [copied, setCopied] = useState(false);
  const choices = result.mode === "diff"
    ? [["inline", "Inline"], ["side-by-side", "Side by side"], ["before", "Before"], ["after", "After"]] as const
    : [["latest", "Latest content"]] as const;
  const copyText = useMemo(() => mode === "before" ? result.beforeText ?? "" : mode === "after" ? result.afterText ?? "" : result.displayText ?? result.afterText ?? "", [mode, result]);
  if (result.mode === "empty" || result.mode === "parse_failed" || result.mode === "not_applicable") return <span aria-label="No content">—</span>;
  const panel = (label: string, value: string | null, tone: string) => (
    <div className={`min-w-0 rounded border p-3 ${tone}`}>
      <b className="mb-2 block text-xs">{label}</b>
      <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{value ?? "—"}</pre>
    </div>
  );
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded border border-line bg-white p-1">
          {choices.map(([value, label]) => <button key={value} className={`px-3 py-1 text-xs font-bold ${mode === value ? "bg-blue-600 text-white" : "text-slate-700"}`} type="button" onClick={() => setMode(value)}>{label}</button>)}
        </div>
        <button className="btn ml-auto" type="button" onClick={() => void navigator.clipboard.writeText(copyText).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}
        </button>
      </div>
      {result.mode === "latest_content" ? panel("Latest content", result.displayText, "border-slate-200 bg-slate-50 text-slate-800") : null}
      {result.mode === "diff" && mode === "inline" ? <div className="max-h-[55vh] overflow-auto rounded border border-line bg-white p-3 text-xs leading-relaxed">{segments.length ? segments.map((segment, index) => <span key={`${segment.kind}-${index}`} className={`whitespace-pre-wrap break-words ${segment.kind === "added" ? "bg-emerald-100 text-emerald-900" : segment.kind === "removed" ? "bg-rose-100 text-rose-900 line-through" : "text-slate-700"}`}>{segment.text}</span>) : <pre className="whitespace-pre-wrap break-words font-sans">{result.afterText || "—"}</pre>}</div> : null}
      {result.mode === "diff" && mode === "side-by-side" ? <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">{panel("Before", result.beforeText, "border-rose-200 bg-rose-50 text-rose-900")}{panel("After", result.afterText, "border-emerald-200 bg-emerald-50 text-emerald-900")}</div> : null}
      {result.mode === "diff" && mode === "before" ? panel("Before", result.beforeText, "border-rose-200 bg-rose-50 text-rose-900") : null}
      {result.mode === "diff" && mode === "after" ? panel("After", result.afterText, "border-emerald-200 bg-emerald-50 text-emerald-900") : null}
    </div>
  );
}
