import { useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { activityEventDisplayPolicy } from "../utils/activityEventDisplayPolicy";
import { DescriptionDiffCell, isDescriptionDiffRow } from "./DescriptionDiffCell";

type Props = {
  row: Record<string, unknown>;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function DiffCell({ row, expanded = false, onExpandedChange }: Props) {
  const policy = useMemo(() => activityEventDisplayPolicy(row), [row]);
  if (isDescriptionDiffRow(row)) return <DescriptionDiffCell row={row} expanded={expanded} onExpandedChange={onExpandedChange} />;
  const label = policy.kind === "comment" ? `${policy.operation} Comment` : "Diff preview";
  return (
    <div className="min-w-0 text-xs leading-relaxed">
      <div className="mb-1 flex items-start gap-2">
        {policy.operation ? <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-black">{policy.operation}</span> : null}
        <span className="line-clamp-2 min-w-0 break-words" title={policy.content}>{policy.preview || "View event details"}</span>
      </div>
      <button
        className="inline-flex items-center gap-1 font-bold text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "View"} ${label}`}
        onClick={() => onExpandedChange?.(!expanded)}
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {expanded ? "收合詳細資料" : "查看詳細資料"}
      </button>
    </div>
  );
}
