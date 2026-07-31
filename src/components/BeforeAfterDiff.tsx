import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ContentDiffViewer } from "./ContentDiffViewer";
import { normalizeActivityChange } from "../utils/normalizedChange";

type Props = {
  before: unknown;
  after: unknown;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function BeforeAfterDiff({ before, after, expanded: controlledExpanded, onExpandedChange }: Props) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const change = useMemo(() => normalizeActivityChange({ before, after, sourceProvenance: "jira_changelog" }), [before, after]);
  const result = change.contentDisplay;
  const setExpanded = (value: boolean) => {
    if (onExpandedChange) onExpandedChange(value);
    else setLocalExpanded(value);
  };
  if (result.mode !== "diff") return <span className="whitespace-pre-wrap break-words">{result.displayText || "—"}</span>;
  return (
    <div className="min-w-0">
      {!expanded ? <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2"><div className="line-clamp-3 break-words rounded bg-rose-50 p-2 text-rose-900">{result.beforeText || "—"}</div><div className="line-clamp-3 break-words rounded bg-emerald-50 p-2 text-emerald-900">{result.afterText || "—"}</div></div> : <ContentDiffViewer result={result} segments={change.diff ?? []} />}
      <button className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合 Diff Viewer" : "開啟 Diff Viewer"}</button>
    </div>
  );
}
