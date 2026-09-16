type Json = Record<string, any>;
export const VIEWER_DEFAULT_COLUMNS_V050 = ['eventTime', 'action', 'issueKey', 'analysisStatus', 'skillIds', 'manual'];

function canonical(value: any, field = ''): any {
  if (Array.isArray(value)) {
    const items = value.map(item => canonical(item));
    return ['values', 'visibleFields'].includes(field) ? [...new Set(items.map(item => JSON.stringify(item)))].sort().map(item => JSON.parse(item)) : items;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key], key)]));
  return value;
}
export function semanticQueryV050(query: Json) {
  const { requestId: _request, revision: _revision, ...semantic } = query;
  return JSON.stringify(canonical(semantic));
}
export function diagnosticHashV050(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function viewerLoadReasonV050(previous: Json | undefined, next: Json, force: boolean, preferenceRestore: boolean) {
  if (force) return 'FORCE_REFRESH';
  if (!previous) return preferenceRestore ? 'PREFERENCE_RESTORE' : 'INITIAL_MOUNT';
  if (previous.scope !== next.scope) return 'DB_CHANGE';
  if (previous.contentRevision !== next.contentRevision) return 'REVISION_CHANGE';
  if (previous.generation !== next.generation) return 'GENERATION_CHANGE';
  const a = previous.query ?? {}, b = next.query ?? {};
  const differs = (keys: string[]) => semanticQueryV050(Object.fromEntries(keys.map(k => [k,a[k]]))) !== semanticQueryV050(Object.fromEntries(keys.map(k => [k,b[k]])));
  if (differs(['filters','diffQuickFilters','dateRange','timeZone'])) return 'FILTER_CHANGE';
  if (differs(['sort'])) return 'SORT_CHANGE';
  if (differs(['page','pageSize'])) return 'PAGE_CHANGE';
  if (differs(['visibleFields'])) return 'COLUMN_CHANGE';
  return 'ROUTE_REATTACH';
}
