import { RotateCcw, X } from 'lucide-react';
import { AI_STATUSES_V047, AI_STATUS_DEFINITIONS_V047, statusTokenV047 } from '../../shared/integratedDisplayV047';
import { aiStatusLabelV043 } from '../../shared/aiResultProjectionV043';

type Props = {
  selection: readonly string[]; result: Record<string, any>; loading: boolean;
  onChange: (values: readonly string[]) => void; onClear: () => void; onReset: () => void;
};
export function AiStatusFilterV047({selection,result,loading,onChange,onClear,onReset}: Props) {
  return <fieldset className="min-w-0 space-y-2 border-b border-line pb-3" data-ai-status-filter="true">
    <legend className="text-sm font-bold">AI 分類狀態 / AI Classification</legend>
    <div className="flex flex-wrap gap-x-5 gap-y-3">{AI_STATUSES_V047.map((status, i) =>
      <label key={status} title={AI_STATUS_DEFINITIONS_V047[i]} className="flex min-w-0 items-start gap-2 text-xs">
        <input type="checkbox" className="mt-1 shrink-0" aria-label={status} checked={selection.includes(status)} onChange={e => onChange(e.target.checked ? [...selection,status] : selection.filter(s=>s!==status))} />
        <span className="break-words"><b>{aiStatusLabelV043(status)}</b> · {loading ? '待計算' : result.statusCounts?.find((c: Record<string,any>)=>c.value===statusTokenV047(status))?.count ?? 0}
          <small className="block max-w-64 text-muted">{AI_STATUS_DEFINITIONS_V047[i]}</small>
        </span>
      </label>)}</div>
    <div className="flex flex-wrap gap-2">
      <button className="btn" onClick={onClear}><X size={14} />清除全部篩選</button>
      <button className="btn" onClick={onReset}><RotateCcw size={14} />恢復預設</button>
      <button className="btn" onClick={()=>onChange([])}><X size={14} />取消全選 AI</button>
    </div>
    <p className="text-xs" data-result-counts="true">本頁 {result.rows.length}／符合全部篩選 {result.filteredCount}／Raw 總筆數 {result.totalCount}</p>
    <p className="text-xs">未配對 AI：{result.unmatchedAiCount ?? '待計算'} · 配對歧義：{result.ambiguousLinkCount ?? '待計算'} · 身分衝突：{result.ambiguousCount ?? '待計算'} · <a className="text-blue-700 underline" href="#/ai-database">來源配對</a></p>
    {result.statusCounts?.some((c: Record<string,any>)=>!AI_STATUSES_V047.some(s=>c.value===statusTokenV047(s))) ? <p role="alert" className="text-amber-800">存在未識別 AI 狀態；未將其假定為未分析。</p> : null}
  </fieldset>;
}
