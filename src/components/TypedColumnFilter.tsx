import { useRef, useState } from "react";
import type { ViewerDistinctResult } from "../types/activityViewerQuery";
import { ExcelFilterPopover } from "./ExcelFilterPopover";
import { TextColumnFilter } from "./TextColumnFilter";

type FilterValue = { text?: string; operator?: string; values?: string[]; from?: string; to?: string; min?: number; max?: number };
export function TypedColumnFilter({ label, kind, emptySelectionIsNone = false, container = false, filter, result, loading, error, search, onSearch, onApply, onClose }: { label: string; kind: string; emptySelectionIsNone?: boolean; container?: boolean; filter: FilterValue; result: ViewerDistinctResult | null; loading: boolean; error: string; search: string; onSearch: (value: string) => void; onApply: (value: FilterValue) => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState(filter.text ? "text" : kind === "date" || kind === "number" ? "range" : "set");
  const [draft, setDraft] = useState<FilterValue>(filter);
  const [preciseDate, setPreciseDate] = useState(Boolean(filter.from?.includes('T') || filter.to?.includes('T')));
  const [validation, setValidation] = useState("");
  const apply = () => {
    const next = mode === "presence" ? { operator: draft.operator ?? "exists" } : mode === "text" ? { text: root.current?.querySelector<HTMLInputElement>('input[placeholder="實際文字條件"]')?.value ?? draft.text, operator: draft.operator ?? "contains" } : kind === "date" ? { from: draft.from, to: draft.to } : { min: draft.min, max: draft.max };
    if ((draft.from && draft.to && draft.from > draft.to) || (draft.min !== undefined && draft.max !== undefined && draft.min > draft.max)) { setValidation("起始值不可大於結束值"); return; }
    onApply(next); onClose();
  };
  return <div ref={root} className="space-y-3" onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && mode !== "set") { e.preventDefault(); apply(); } }}>
    <div className="flex gap-1" role="tablist" aria-label="篩選模式">{(emptySelectionIsNone ? ["set"] : ["set", container ? "presence" : "text", ...(kind === "date" || kind === "number" ? ["range"] : [])]).map(m => <button type="button" key={m} className={`btn ${mode === m ? "btn-primary" : ""}`} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setValidation(""); }}>{m === "set" ? "候選值" : m === "text" ? "文字條件" : m === "presence" ? "存在條件" : "範圍"}</button>)}</div>
    {error ? <div role="alert" className="text-sm text-rose-800">候選查詢失敗：{error}</div> : null}
    {mode === "set" ? <><div className="text-xs text-muted">{emptySelectionIsNone ? "空集合為 0 筆；與上方 AI 狀態同步。" : "未勾選表示不限；與文字條件互斥。"}</div>{!error ? <ExcelFilterPopover label={label} selected={filter.values ?? []} search={search} result={result} loading={loading} onSearchChange={onSearch} onApply={values => { onApply({ values }); onClose(); }} onCancel={onClose} /> : null}</> : <>
      {mode === "presence" ? <select className="field" aria-label="容器條件" value={draft.operator ?? "exists"} onChange={e => setDraft({ ...draft, operator: e.target.value })}><option value="exists">欄位存在</option><option value="is-empty">空容器／null</option></select> : mode === "text" ? <><select className="field" aria-label="文字比對方式" value={draft.operator ?? "contains"} onChange={e => setDraft({ ...draft, operator: e.target.value })}><option value="contains">包含</option><option value="exact">完全相同</option></select><TextColumnFilter value={draft.text ?? ""} debounceMs={0} onApply={text => setDraft(d => ({ ...d, text }))} placeholder="實際文字條件" /></> : kind === "date" ? <div className="grid gap-2"><label><input type="checkbox" checked={preciseDate} onChange={e => { setPreciseDate(e.target.checked); setDraft({}); }} /> 精確日期時間</label><label>起日<input className="field" type={preciseDate ? "datetime-local" : "date"} step={preciseDate ? "0.001" : undefined} value={draft.from ?? ""} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label><label>迄日<input className="field" type={preciseDate ? "datetime-local" : "date"} step={preciseDate ? "0.001" : undefined} value={draft.to ?? ""} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label><small>{preciseDate ? "依本機時區，包含輸入的結束時間。" : "依本機時區，包含完整結束日。"}</small></div> : <div className="grid grid-cols-2 gap-2"><label>最小<input className="field" type="number" value={draft.min ?? ""} onChange={e => setDraft({ ...draft, min: e.target.value === "" ? undefined : Number(e.target.value) })} /></label><label>最大<input className="field" type="number" value={draft.max ?? ""} onChange={e => setDraft({ ...draft, max: e.target.value === "" ? undefined : Number(e.target.value) })} /></label></div>}
      {validation ? <p role="alert" className="text-rose-800">{validation}</p> : null}<div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => { onApply({}); onClose(); }}>清除此欄</button><button type="button" className="btn btn-primary" onClick={apply}>套用</button></div>
    </>}
  </div>;
}
