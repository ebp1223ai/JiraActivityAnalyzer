import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { compactDiff, normalizeActivityChange } from "../utils/normalizedChange";
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
  const segments = useMemo(() => compactDiff(change), [change]);
  const hasRawValue = change.beforeRaw !== undefined || change.afterRaw !== undefined;
  if (!segments.length) return <span className="text-muted">{hasRawValue ? "無實質變更 / No material change" : "—"}</span>;
  const visible = expanded ? segments : segments.slice(0, 3);
  const setExpanded = (value: boolean) => {
    if (onExpandedChange) onExpandedChange(value);
    else setLocalExpanded(value);
  };
  return (
    <SectionErrorBoundary context="activity-diff" safeText={`${change.beforeText ?? ""}\n${change.afterText ?? ""}`}>
      <div className="min-w-0 space-y-1 text-xs leading-relaxed">
        {visible.map((segment, index) => <div key={`${segment.kind}-${index}`} className={`max-w-full whitespace-pre-wrap break-words rounded px-2 py-1 ${segment.kind === "added" ? "bg-emerald-50 text-emerald-800" : segment.kind === "removed" ? "bg-rose-50 text-rose-800 line-through" : "bg-slate-50 text-slate-500"}`}>{segment.kind === "added" ? "+ " : segment.kind === "removed" ? "- " : "  "}{segment.text}</div>)}
        {segments.length > 3 ? <button className="inline-flex items-center gap-1 font-bold text-blue-700" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合完整差異" : "展開完整差異"}</button> : null}
      </div>
    </SectionErrorBoundary>
  );
}