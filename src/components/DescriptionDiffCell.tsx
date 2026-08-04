import { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DescriptionDiffResult, DescriptionFullContextResult, DiffLine } from "../../shared/descriptionDiff";

let fullContextRequestSequence = 0;

const statusText: Record<DescriptionDiffResult["status"], string> = {
  changed: "Changed",
  unchanged: "No change",
  "whitespace-only": "No substantive change",
  "before-unavailable": "Before unavailable — cannot calculate diff",
  "after-unavailable": "After unavailable — cannot calculate diff",
  "source-mismatch": "Description source mismatch",
  unparseable: "Content cannot be parsed safely",
  "diff-too-large": "Diff too large; use explicit full context"
};

export function isDescriptionDiffRow(row: Record<string, unknown>) {
  return Boolean(row.descriptionDiff && typeof row.descriptionDiff === "object");
}

function inlineLine(line: DiffLine) {
  if (!line.inlineSegments?.length) return line.text;
  return line.inlineSegments.map((segment, index) => (
    <span key={`${segment.kind}-${index}`} className={segment.kind === "delete" ? "bg-rose-200 font-bold" : segment.kind === "insert" ? "bg-emerald-200 font-bold" : undefined}>{segment.text}</span>
  ));
}

function Hunk({ result, index }: { result: DescriptionDiffResult; index: number }) {
  const hunk = result.hunks[index];
  return <div className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
    <div className="bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-600">@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</div>
    <div className="thin-scroll max-h-72 overflow-auto font-mono text-[11px] leading-5">
      {hunk.lines.map((line, lineIndex) => <div key={`${hunk.id}:${lineIndex}`} className={`grid min-w-max grid-cols-[2.5rem_2.5rem_1.25rem_minmax(16rem,1fr)] ${line.kind === "delete" ? "bg-rose-50 text-rose-900" : line.kind === "insert" ? "bg-emerald-50 text-emerald-900" : "text-slate-700"}`}>
        <span className="select-none border-r border-slate-200 px-1 text-right text-slate-400">{line.oldLineNumber ?? ""}</span>
        <span className="select-none border-r border-slate-200 px-1 text-right text-slate-400">{line.newLineNumber ?? ""}</span>
        <span className="select-none text-center font-black">{line.kind === "delete" ? "-" : line.kind === "insert" ? "+" : " "}</span>
        <span className="whitespace-pre-wrap break-words pr-2">{inlineLine(line)}</span>
      </div>)}
    </div>
  </div>;
}

export function DescriptionDiffCell({ row, expanded = false, onExpandedChange }: { row: Record<string, unknown>; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void }) {
  const result = row.descriptionDiff as DescriptionDiffResult;
  const [mode, setMode] = useState<"compact" | "before" | "after" | "full">("compact");
  const [context, setContext] = useState<DescriptionFullContextResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllHunks, setShowAllHunks] = useState(false);
  const latestRequest = useRef(0);
  const canLoad = result.status !== "source-mismatch" && result.status !== "unparseable" && result.status !== "before-unavailable" && result.status !== "after-unavailable";
  const visibleHunks = showAllHunks ? result.hunks.length : Math.min(result.hunks.length, 3);

  async function selectMode(next: "before" | "after" | "full") {
    if (!canLoad) return;
    if (context?.eventId === result.eventId) { setMode(next); return; }
    const requestId = ++fullContextRequestSequence;
    latestRequest.current = requestId;
    setLoading(true);
    try {
      const response = await window.desktopApp?.databaseViewer?.descriptionFullContext({ eventId: result.eventId, issueKey: result.issueKey, requestId, revision: Number(row.revision ?? 0) });
      if (response && latestRequest.current === requestId && response.requestId === requestId && response.eventId === result.eventId) { setContext(response); setMode(next); }
    } finally { if (latestRequest.current === requestId) setLoading(false); }
  }

  const panel = (label: string, value: string | null, available: boolean, tone: string) => <div className={`min-w-0 rounded border p-3 ${tone}`}><b className="mb-2 block text-xs">{label}</b><pre className="thin-scroll max-h-[55vh] overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{available ? value || "Empty" : `${label} unavailable`}</pre></div>;
  return <div className="min-w-0 space-y-2" data-description-event={result.eventId}>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded px-2 py-1 text-[11px] font-black ${result.status === "changed" ? "bg-blue-100 text-blue-800" : result.status === "source-mismatch" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>DESCRIPTION DIFF</span>
      <span className="text-xs font-bold">{statusText[result.status]}</span>
      {result.status === "changed" ? <span className="text-xs font-black text-slate-700">+{result.addedLines} / -{result.deletedLines}</span> : null}
    </div>
    {result.status === "changed" && mode === "compact" ? <div className="space-y-2">{Array.from({ length: visibleHunks }, (_, index) => <Hunk key={result.hunks[index].id} result={result} index={index} />)}{result.hunks.length > 3 ? <button className="inline-flex items-center gap-1 text-xs font-bold text-blue-700" type="button" onClick={() => setShowAllHunks((value) => !value)}>{showAllHunks ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{showAllHunks ? "Collapse hunks" : `Show all ${result.hunks.length} hunks`}</button> : null}</div> : null}
    {context && mode === "before" ? panel("Before", context.beforeText, context.beforeAvailable, "border-rose-200 bg-rose-50 text-rose-900") : null}
    {context && mode === "after" ? panel("After", context.afterText, context.afterAvailable, "border-emerald-200 bg-emerald-50 text-emerald-900") : null}
    {context && mode === "full" ? <div className="space-y-3"><div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">{panel("Before", context.beforeText, context.beforeAvailable, "border-rose-200 bg-rose-50 text-rose-900")}{panel("After", context.afterText, context.afterAvailable, "border-emerald-200 bg-emerald-50 text-emerald-900")}</div>{result.status === "changed" ? <div className="space-y-2">{result.hunks.map((_, index) => <Hunk key={result.hunks[index].id} result={result} index={index} />)}</div> : null}</div> : null}
    <div className="flex flex-wrap gap-2">
      <button className="btn px-2 py-1 text-xs" disabled={!canLoad || loading} type="button" onClick={() => void selectMode("before")}>Before</button>
      <button className="btn px-2 py-1 text-xs" disabled={!canLoad || loading} type="button" onClick={() => void selectMode("after")}>After</button>
      <button className="btn px-2 py-1 text-xs" disabled={!canLoad || loading} type="button" onClick={() => mode === "full" ? setMode("compact") : void selectMode("full")}>{mode === "full" ? "Hide Full Context" : "Show Full Context"}</button>
      {expanded ? <button className="btn px-2 py-1 text-xs" type="button" onClick={() => onExpandedChange?.(false)}>Collapse row</button> : null}
    </div>
  </div>;
}
