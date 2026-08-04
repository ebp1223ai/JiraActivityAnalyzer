import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Pilcrow, WrapText } from "lucide-react";
import type { DescriptionComparisonPayload, OriginalContentValue } from "../../shared/descriptionComparison";
import type { DescriptionDiffResult, DiffLine } from "../../shared/descriptionDiff";

let comparisonRequestSequence = 0;

const statusText: Record<DescriptionDiffResult["status"], string> = {
  changed: "Changed",
  unchanged: "No change",
  "whitespace-only": "No substantive change",
  "before-unavailable": "Before unavailable - cannot calculate diff",
  "after-unavailable": "After unavailable - cannot calculate diff",
  "source-mismatch": "Description source mismatch",
  unparseable: "Content cannot be parsed safely",
  "diff-too-large": "Diff too large; open the full comparison"
};

export function isDescriptionDiffRow(row: Record<string, unknown>) {
  return Boolean(row.descriptionDiff && typeof row.descriptionDiff === "object");
}

function inlineLine(line: DiffLine) {
  if (!line.inlineSegments?.length) return line.text;
  return line.inlineSegments.map((segment, index) => (
    <span key={segment.kind + "-" + index} className={segment.kind === "delete" ? "bg-rose-200 font-bold" : segment.kind === "insert" ? "bg-emerald-200 font-bold" : undefined}>{segment.text}</span>
  ));
}

function Hunk({ result, index }: { result: DescriptionDiffResult; index: number }) {
  const hunk = result.hunks[index];
  return <div className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
    <div className="bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-600">@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</div>
    <div className="thin-scroll max-h-72 overflow-auto font-mono text-[11px] leading-5">
      {hunk.lines.map((line, lineIndex) => <div key={hunk.id + ":" + lineIndex} className={"grid min-w-max grid-cols-[2.5rem_2.5rem_1.25rem_minmax(16rem,1fr)] " + (line.kind === "delete" ? "bg-rose-50 text-rose-900" : line.kind === "insert" ? "bg-emerald-50 text-emerald-900" : "text-slate-700")}>
        <span className="select-none border-r border-slate-200 px-1 text-right text-slate-400">{line.oldLineNumber ?? ""}</span>
        <span className="select-none border-r border-slate-200 px-1 text-right text-slate-400">{line.newLineNumber ?? ""}</span>
        <span className="select-none text-center font-black">{line.kind === "delete" ? "-" : line.kind === "insert" ? "+" : " "}</span>
        <span className="whitespace-pre-wrap break-words pr-2">{inlineLine(line)}</span>
      </div>)}
    </div>
  </div>;
}

function visibleWhitespace(raw: string) {
  return raw
    .replace(/\r\n/g, "␍␊\n")
    .replace(/\r/g, "␍\n")
    .replace(/\n/g, "␊\n")
    .replace(/\t/g, "→\t")
    .replace(/ /g, "·");
}

function availabilityText(value: OriginalContentValue, label: string) {
  if (value.availability === "available-empty") return "(Empty value)";
  if (value.availability === "unavailable") return label + " unavailable";
  return "Source mismatch";
}

function OriginalPane({ label, value, tone }: { label: string; value: OriginalContentValue; tone: string }) {
  const [wrap, setWrap] = useState(true);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [copyState, setCopyState] = useState("");
  const available = value.raw !== null && (value.availability === "available" || value.availability === "available-empty");
  async function copyOriginal() {
    if (!available) return;
    try {
      await navigator.clipboard.writeText(value.raw ?? "");
      setCopyState("Copied");
    } catch {
      setCopyState("Copy failed");
    }
  }
  return <section className={"flex min-h-[24rem] min-w-0 flex-col overflow-hidden rounded border " + tone}>
    <header className="border-b border-current/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black">{label}</h3>
        <div className="flex flex-wrap gap-1">
          <button className={"btn px-2 py-1 text-xs " + (wrap ? "border-blue-400 bg-blue-50" : "")} type="button" onClick={() => setWrap((current) => !current)} title="Toggle wrapping"><WrapText size={14} />Wrap</button>
          <button className={"btn px-2 py-1 text-xs " + (showWhitespace ? "border-blue-400 bg-blue-50" : "")} type="button" onClick={() => setShowWhitespace((current) => !current)} title="Show whitespace characters"><Pilcrow size={14} />Show Whitespace</button>
          <button className="btn px-2 py-1 text-xs" type="button" disabled={!available} onClick={() => void copyOriginal()} title="Copy exact original"><Copy size={14} />Copy Original</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold opacity-80">
        <span>Characters: {value.charCount ?? "-"}</span><span>UTF-8 bytes: {value.byteCountUtf8 ?? "-"}</span><span>Lines: {value.lineCount ?? "-"}</span><span title={value.sha256Utf8 ?? ""}>SHA-256: {value.sha256Utf8?.slice(0, 12) ?? "-"}</span>{copyState ? <span>{copyState}</span> : null}
      </div>
    </header>
    {available
      ? <pre className={"thin-scroll min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5 " + (wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>{showWhitespace ? visibleWhitespace(value.raw ?? "") : value.raw}</pre>
      : <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm font-bold">{availabilityText(value, label)}</div>}
  </section>;
}

export function DescriptionDiffCell({
  row,
  expanded = false,
  detail = false,
  onExpandedChange
}: {
  row: Record<string, unknown>;
  expanded?: boolean;
  detail?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const result = row.descriptionDiff as DescriptionDiffResult;
  const [comparison, setComparison] = useState<DescriptionComparisonPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showAllHunks, setShowAllHunks] = useState(false);
  const latestRequest = useRef("");
  const visibleHunks = showAllHunks ? result.hunks.length : Math.min(result.hunks.length, 3);
  const databaseIdentity = String(row.databaseIdentity ?? "");
  const generation = String(row.previewGeneration ?? "");

  useEffect(() => {
    if (!detail) return;
    if (result.status === "source-mismatch") {
      setLoadError("Description source mismatch. Original evidence is hidden.");
      setComparison(null);
      return;
    }
    if (!databaseIdentity || !generation || !result.eventId) {
      setLoadError("Original source identity is unavailable.");
      return;
    }
    const requestId = "description-comparison-" + ++comparisonRequestSequence;
    latestRequest.current = requestId;
    setLoading(true);
    setLoadError("");
    setComparison(null);
    void window.desktopApp?.databaseViewer?.descriptionComparison({
      requestId,
      generation,
      databaseIdentity,
      eventId: result.eventId,
      issueKey: result.issueKey
    }).then((response) => {
      if (latestRequest.current !== requestId) return;
      const stale = !response || response.requestId !== requestId || response.activityEventId !== result.eventId || response.databaseIdentity !== databaseIdentity || response.generation !== generation;
      if (stale) {
        setLoadError("Stale comparison response was rejected.");
        return;
      }
      if (response.diff.status === "source-mismatch") {
        setLoadError("Description source mismatch. Original evidence is hidden.");
        return;
      }
      if (response.integrityStatus === "mismatch") {
        setLoadError("Integrity mismatch. Original evidence and diff are hidden.");
        return;
      }
      setComparison(response);
    }).catch(() => {
      if (latestRequest.current === requestId) setLoadError("Unable to load the original comparison.");
    }).finally(() => {
      if (latestRequest.current === requestId) setLoading(false);
    });
  }, [databaseIdentity, detail, generation, result.eventId, result.issueKey, result.status, retry]);


  const badgeTone = result.status === "changed" ? "bg-blue-100 text-blue-800" : result.status === "source-mismatch" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700";
  if (detail) {
    return <div className="min-w-0 space-y-3" data-description-comparison={result.eventId}>
      <div className="flex flex-wrap items-center gap-2"><span className={"rounded px-2 py-1 text-[11px] font-black " + badgeTone}>DESCRIPTION COMPARISON</span><span className="text-xs font-bold">{statusText[result.status]}</span></div>
      <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900">Exact original evidence from the validated local SQLite event. Display controls never modify copied content.</div>
      {loading ? <div className="rounded border border-line bg-slate-50 p-4 text-sm font-bold">Loading full original comparison...</div> : null}
      {loadError ? <div className="rounded border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-800">{loadError}<button className="btn ml-3 px-2 py-1 text-xs" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div> : null}
      {comparison ? <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3">
        <OriginalPane label="Before Original" value={comparison.before} tone="border-rose-200 bg-rose-50/50 text-rose-950" />
        <OriginalPane label="After Original" value={comparison.after} tone="border-emerald-200 bg-emerald-50/50 text-emerald-950" />
        <section className="min-h-[24rem] min-w-0 overflow-hidden rounded border border-blue-200 bg-blue-50/40">
          <header className="border-b border-blue-100 p-3"><h3 className="text-sm font-black">Diff Hunks</h3><div className="mt-1 text-[11px] font-bold text-muted">History: {comparison.historyId ?? "-"} / Item: {comparison.itemIndex ?? "-"} / Field: {comparison.canonicalFieldId}</div></header>
          <div className="thin-scroll max-h-[55vh] space-y-2 overflow-auto p-3">{comparison.diff.hunks.length ? comparison.diff.hunks.map((_, index) => <Hunk key={comparison.diff.hunks[index].id} result={comparison.diff} index={index} />) : <div className="text-sm font-bold text-muted">No diff hunks.</div>}</div>
        </section>
      </div> : null}
    </div>;
  }

  return <div className="min-w-0 space-y-2" data-description-event={result.eventId}>
    <div className="flex flex-wrap items-center gap-2">
      <span className={"rounded px-2 py-1 text-[11px] font-black " + badgeTone}>DESCRIPTION DIFF</span>
      <span className="text-xs font-bold">{statusText[result.status]}</span>
      {result.status === "changed" ? <span className="text-xs font-black text-slate-700">+{result.addedLines} / -{result.deletedLines}</span> : null}
    </div>
    {result.status === "changed" ? <div className="space-y-2">{Array.from({ length: visibleHunks }, (_, index) => <Hunk key={result.hunks[index].id} result={result} index={index} />)}{result.hunks.length > 3 ? <button className="inline-flex items-center gap-1 text-xs font-bold text-blue-700" type="button" onClick={() => setShowAllHunks((value) => !value)}>{showAllHunks ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{showAllHunks ? "Collapse hunks" : "Show all " + result.hunks.length + " hunks"}</button> : null}</div> : null}
    <button className="btn px-2 py-1 text-xs" disabled={result.status === "source-mismatch"} type="button" title={expanded ? "Hide Full Original" : "Show Full Context"} onClick={() => onExpandedChange?.(!expanded)}>{expanded ? "Hide Full Original / 隱藏完整原文" : "View Full Original / 查看完整原文"}</button>
  </div>;
}
