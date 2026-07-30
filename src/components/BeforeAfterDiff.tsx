import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { JiraContent } from "./JiraContent";
import { readableContentSummary, preciseMissingValue } from "../utils/richContent";

type Props = {
  before: unknown;
  after: unknown;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function BeforeAfterDiff({ before, after, expanded: controlledExpanded, onExpandedChange }: Props) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const beforeSummary = readableContentSummary(before) || preciseMissingValue("previous");
  const afterSummary = readableContentSummary(after) || preciseMissingValue("source");
  const setExpanded = (value: boolean) => {
    if (onExpandedChange) onExpandedChange(value);
    else setLocalExpanded(value);
  };
  return (
    <div className="min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="line-clamp-3 break-words rounded bg-rose-50 p-2 text-rose-900" title={beforeSummary}>{beforeSummary}</div>
        <div className="line-clamp-3 break-words rounded bg-emerald-50 p-2 text-emerald-900" title={afterSummary}>{afterSummary}</div>
      </div>
      <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合內容" : "展開內容"}</button>
      {expanded ? <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 rounded-md border border-line bg-slate-50 p-3 lg:grid-cols-2"><div className="min-w-0"><b className="mb-2 block text-xs text-rose-800">Before</b><JiraContent content={before} /></div><div className="min-w-0"><b className="mb-2 block text-xs text-emerald-800">After</b><JiraContent content={after} /></div></div> : null}
    </div>
  );
}