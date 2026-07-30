import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { JiraContent } from "./JiraContent";
import { readableContentSummary, preciseMissingValue } from "../utils/richContent";

export function BeforeAfterDiff({ before, after }: { before: unknown; after: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const beforeSummary = readableContentSummary(before) || preciseMissingValue("previous");
  const afterSummary = readableContentSummary(after) || preciseMissingValue("source");
  return (
    <div className="min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="line-clamp-3 break-words rounded bg-rose-50 p-2 text-rose-900" title={beforeSummary}>{beforeSummary}</div>
        <div className="line-clamp-3 break-words rounded bg-emerald-50 p-2 text-emerald-900" title={afterSummary}>{afterSummary}</div>
      </div>
      <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700" type="button" onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合比較" : "展開比較"}
      </button>
      {expanded ? <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 rounded-md border border-line bg-slate-50 p-3 lg:grid-cols-2">
        <div className="min-w-0"><b className="mb-2 block text-xs text-rose-800">Before</b><JiraContent content={before} /></div>
        <div className="min-w-0"><b className="mb-2 block text-xs text-emerald-800">After</b><JiraContent content={after} /></div>
      </div> : null}
    </div>
  );
}
