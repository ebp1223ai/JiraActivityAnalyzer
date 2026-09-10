import { isDescriptionV046, presentationMetricsV046 } from './activityPresentationV046.js';
import { traceContentV043 } from './aiResultProjectionV043.js';

type Json = Record<string, any>;
export const DISPLAY_POLICY_V047 = 'v048-bounded-description-1';
export const AI_STATUSES_V047 = ['CLASSIFIED', 'UNKNOWN', 'EXCLUDED', 'FAILED', 'NOT_ANALYZED'] as const;
export const DEFAULT_AI_STATUSES_V047 = AI_STATUSES_V047.slice(0, 4);
export const AI_STATUS_DEFINITIONS_V047 = [
  '已分類：AI 已提供技能分類，不表示人工已確認。',
  '尚無法分類：已有 AI 判定，尚無法確定技能。',
  '已排除：AI 判定不列入技能分類。',
  '分析失敗：已有 AI 分析失敗紀錄。',
  '尚未分析：目前無可用的已配對 AI 分析。'
];
export const statusTokenV047 = (status: string) => 'string:' + JSON.stringify(status);
export function normalizeAiSelectionV047(input: unknown) {
  if (input === undefined) return { values: [...DEFAULT_AI_STATUSES_V047], warning: '' };
  if (!Array.isArray(input)) return { values: [...DEFAULT_AI_STATUSES_V047], warning: 'AI 狀態設定無效，已恢復預設。' };
  const decoded = input.map(value => {
    if (typeof value !== 'string') return null;
    if (!value.startsWith('string:')) return value;
    try { return JSON.parse(value.slice(7)); } catch { return null; }
  });
  const values = AI_STATUSES_V047.filter(s => decoded.includes(s));
  const invalid = decoded.some(s => !AI_STATUSES_V047.includes(s));
  return { values: values.length || !input.length ? values : [...DEFAULT_AI_STATUSES_V047], warning: invalid ? 'AI 狀態含無效值；保留合法選擇，全無效時恢復預設。' : '' };
}
export function integratedQueryV047<T extends Json>(query: T, missing: readonly string[] = DEFAULT_AI_STATUSES_V047): T {
  const filters = { ...query.filters };
  const alias = 'computed:["analysisStatus"]';
  const filter = filters.analysisStatus ?? filters[alias];
  const selected = normalizeAiSelectionV047(filter && Object.prototype.hasOwnProperty.call(filter, 'values') ? filter.values : filter ? [] : missing);
  delete filters[alias];
  filters.analysisStatus = { values: selected.values.map(statusTokenV047) };
  return { ...query, filters };
}

// Derived presentation only: authoritative Raw/AI documents are never mutated.
export function descriptionDisplayV047(row: Json, diagnosticHash?: (text: string) => string) {
  if (!isDescriptionV046(row)) return presentationMetricsV046(row);
  const ai = Boolean(row.aiRecordId);
  const content = ai ? traceContentV043(row.sourceTrace ?? {}) : row;
  const hasFull = content.before != null && content.after != null;
  const lines = (content.diffHunks ?? []).flatMap((h: Json) => h.lines ?? []);
  const compact = lines.length > 0 && lines.every((l: Json) => ['insert','delete','context','add','remove'].includes(l.kind) && typeof l.text === 'string');
  const invalid = ['MISMATCH','INVALID','UNVERIFIABLE'].includes(row.integrityStatus) || ['MISMATCH','INVALID','UNVERIFIABLE'].includes(content.diff?.integrityStatus);
  const verified = row.integrityStatus === 'VERIFIED' || content.diff?.integrityStatus === 'VERIFIED';
  const reason = ai && invalid ? 'AI_DIFF_INTEGRITY' : ai && !hasFull && !compact ? 'AI_DIFF_MISSING' : ai && !verified ? 'AI_DIFF_INTEGRITY' : '';
  const selected = { ...row, ...content, contentSource: ai ? 'ANALYSIS_TIME' : 'RAW_EVENT' };
  const metrics = presentationMetricsV046(reason ? { ...selected, before:null, after:null, diffHunks:[] } : selected, diagnosticHash);
  return { ...metrics, before:reason?null:content.before, after:reason?null:content.after,
    diffHunks:reason?[]:'computedDiffHunks' in metrics ? metrics.computedDiffHunks : [],
    contentSource:selected.contentSource, contentAvailability:reason?'UNAVAILABLE':content.contentAvailability ?? 'RAW_EVENT',
    displaySourceKind:ai?'AI':'RAW', displaySourcePolicy:DISPLAY_POLICY_V047,
    displayAvailability:reason?'UNAVAILABLE':hasFull?'FULL':compact?'COMPACT_ONLY':'PARTIAL',
    displayReason:reason, displayAnalysisId:ai?row.analysisId:null };
}
