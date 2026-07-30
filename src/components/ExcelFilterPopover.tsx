import { useEffect, useRef, useState } from "react";
import type { ViewerDistinctResult } from "../types/activityViewerQuery";

type Props = {
  label: string;
  selected: string[];
  search: string;
  result: ViewerDistinctResult | null;
  loading?: boolean;
  onSearchChange: (value: string) => void;
  onApply: (values: string[]) => void;
  onCancel: () => void;
};

function normalizedValue(value: string) {
  return value === "未設定" || value === "Unknown" ? "__UNSET__" : value;
}

export function ExcelFilterPopover({ label, selected, search, result, loading, onSearchChange, onApply, onCancel }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(selected);

  useEffect(() => setDraft(selected), [selected]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) onCancel();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [onCancel]);

  const visibleValues = result?.values.map((item) => normalizedValue(item.value)) ?? [];
  return (
    <div ref={root} className="absolute right-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-white p-3 text-left shadow-xl">
      <label className="mb-2 block text-xs font-black">{label}</label>
      <input autoFocus className="field mb-2 !py-1" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜尋候選值..." />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <button className="font-bold text-blue-700" type="button" onClick={() => setDraft(Array.from(new Set([...draft, ...visibleValues])))}>全選搜尋結果</button>
        <button className="font-bold text-blue-700" type="button" onClick={() => setDraft([])}>清除選取</button>
        <span className="ml-auto text-muted">已選 {draft.length}</span>
      </div>
      <div className="thin-scroll max-h-56 space-y-1 overflow-y-auto">
        {loading ? <div className="p-3 text-center text-xs font-bold text-muted">Loading candidates...</div> : null}
        {!loading && !result?.values.length ? <div className="p-3 text-center text-xs text-muted">No values</div> : null}
        {!loading ? result?.values.map((item) => {
          const value = normalizedValue(item.value);
          return <label key={value} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50">
            <input type="checkbox" checked={draft.includes(value)} onChange={(event) => setDraft(event.target.checked ? Array.from(new Set([...draft, value])) : draft.filter((candidate) => candidate !== value))} />
            <span className="min-w-0 flex-1 truncate" title={item.value}>{item.value}</span>
            <span className="text-muted">{item.count}</span>
          </label>;
        }) : null}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn" type="button" onClick={onCancel}>取消</button>
        <button className="btn btn-primary" type="button" onClick={() => onApply(draft)}>套用</button>
      </div>
    </div>
  );
}
