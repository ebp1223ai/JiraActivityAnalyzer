import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { normalizeActivityChange } from "../utils/normalizedChange";
import { ContentDiffViewer } from "./ContentDiffViewer";
import { SectionErrorBoundary } from "./SectionErrorBoundary";

type Props = {
  row: Record<string, unknown>;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function DiffCell({ row, expanded: controlledExpanded, onExpandedChange }: Props) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const change = useMemo(() => normalizeActivityChange(row), [row]);
  const result = change.contentDisplay;
  const setExpanded = (value: boolean) => {
    if (onExpandedChange) onExpandedChange(value);
    else setLocalExpanded(value);
  };
  if (result.mode === "empty" || result.mode === "parse_failed" || result.mode === "not_applicable") {
    return <span className="text-muted" aria-label="No content">—</span>;
  }
  if (result.mode === "latest_content") {
    const value = result.displayText ?? "—";
    const long = value.length > 180 || value.includes("\n");
    return (
      <div className="min-w-0 text-xs leading-relaxed">
        {!expanded ? <div className="line-clamp-4 whitespace-pre-wrap break-words text-slate-800" title={value}>{value}</div> : <ContentDiffViewer result={result} segments={[]} />}
        {long ? <button className="mt-1 inline-flex items-center gap-1 font-bold text-blue-700" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合完整內容" : "查看完整內容"}</button> : null}
      </div>
    );
  }
  const segments = change.diff ?? [];
  return (
    <SectionErrorBoundary context="activity-diff" safeText={`${result.beforeText ?? ""}\n${result.afterText ?? ""}`}>
      <div className="min-w-0 text-xs leading-relaxed">
        {!expanded ? <div className="space-y-1">
          {(segments.length ? segments.slice(0, 4) : [{ kind: "same" as const, text: result.afterText ?? "—" }]).map((segment, index) => <div key={`${segment.kind}-${index}`} className={`max-w-full whitespace-pre-wrap break-words rounded px-2 py-1 ${segment.kind === "added" ? "bg-emerald-50 text-emerald-800" : segment.kind === "removed" ? "bg-rose-50 text-rose-800 line-through" : "bg-slate-50 text-slate-700"}`}>{segment.text}</div>)}
        </div> : <ContentDiffViewer result={result} segments={segments} />}
        <button className="mt-1 inline-flex items-center gap-1 font-bold text-blue-700" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合 Diff Viewer" : "開啟 Diff Viewer"}</button>
      </div>
    </SectionErrorBoundary>
  );
}
