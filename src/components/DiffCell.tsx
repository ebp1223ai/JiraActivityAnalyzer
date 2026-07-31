import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { normalizeActivityChange } from "../utils/normalizedChange";
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
  const segments = change.diff ?? [];
  if (change.diffStatus === "unavailable") {
    return <span className="whitespace-normal break-words text-amber-700">{change.availabilityReason ?? "Diff unavailable / 無法產生差異"}</span>;
  }
  if (change.diffStatus === "fallback_full_after" || change.diffStatus === "unchanged") {
    const fallback = change.diffStatus === "fallback_full_after";
    return (
      <div className="min-w-0 space-y-1 text-xs leading-relaxed">
        <div className={`rounded px-2 py-1 ${fallback ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
          {fallback
            ? "Previous content unavailable; showing full After / 前一版內容不可用，以下顯示完整 After"
            : "No semantic change; showing full After / 內容相同，以下顯示完整 After"}
        </div>
        <div className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 px-2 py-1 text-slate-700">
          {change.displayContent || "Empty value / 空值"}
        </div>
      </div>
    );
  }
  if (!segments.length) return <span className="text-muted">Empty value / 空值</span>;
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