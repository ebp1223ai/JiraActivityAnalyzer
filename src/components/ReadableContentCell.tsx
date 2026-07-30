import { useState } from "react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { readableContentSummary, readableContentText } from "../utils/richContent";
import { JiraContent } from "./JiraContent";
import { SectionErrorBoundary } from "./SectionErrorBoundary";

export function ReadableContentCell({ value, formatHint, missing = "Not available in source data" }: { value: unknown; formatHint?: string; missing?: string }) {
  const [expanded, setExpanded] = useState(false);
  const fullText = readableContentText(value, formatHint);
  const summary = readableContentSummary(value, formatHint, 220);
  if (!fullText) return <span className="text-muted">{missing}</span>;
  return (
    <SectionErrorBoundary context="readable-content-cell" resetKey={`${formatHint}:${fullText.length}`} safeText={summary}>
      <div className="min-w-0 max-w-[360px]">
        {expanded ? <div className="max-h-72 overflow-auto rounded bg-slate-50 p-2"><JiraContent content={value} formatHint={formatHint} /></div> : <span className="line-clamp-3 break-words" title={fullText}>{summary}</span>}
        {fullText.length > summary.length ? <div className="mt-1 flex gap-2">
          <button className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700" type="button" onClick={() => setExpanded((current) => !current)}>{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{expanded ? "Collapse" : "Expand"}</button>
          <button className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700" type="button" onClick={() => void navigator.clipboard?.writeText(fullText)}><Copy size={12} />Copy</button>
        </div> : null}
      </div>
    </SectionErrorBoundary>
  );
}
