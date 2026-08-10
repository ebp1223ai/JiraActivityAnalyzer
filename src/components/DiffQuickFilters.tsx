import type { DiffQuickFilters as DiffQuickFilterState } from "../../shared/viewerEfficiency";

const controls: Array<[keyof DiffQuickFilterState, string, string]> = [
  ["hideNoChange", "Hide No Change", "隱藏無變更"],
  ["hideZeroAdded", "Hide + = 0", "隱藏新增為 0"],
  ["hideZeroDeleted", "Hide − = 0", "隱藏刪除為 0"],
  ["hideBeforeUnavailable", "Hide Before unavailable", "隱藏缺少 Before"]
];

export function DiffQuickFilters({ value, disabled = false, onChange }: { value: DiffQuickFilterState; disabled?: boolean; onChange: (value: DiffQuickFilterState) => void }) {
  return (
    <fieldset className="min-w-0 rounded-md border border-line bg-slate-50 p-3" disabled={disabled} data-testid="diff-quick-filters">
      <legend className="px-1 text-xs font-black text-muted">Description Diff Quick Filters / Description 差異快速篩選</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {controls.map(([key, label, sub]) => (
          <label key={key} className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.currentTarget.checked })} />
            <span>{label}<span className="ml-1 text-xs text-muted">/ {sub}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
