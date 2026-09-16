import { semanticQueryV050, diagnosticHashV050 } from '../../shared/viewerQueryIdentityV050';
type Json = Record<string, any>;
type State = 'PENDING' | 'SUCCEEDED' | 'CANCELLING' | 'CANCELLED' | 'FAILED' | 'EVICTED';
type Entry = { id: string; promise: Promise<Json>; value?: Json; bytes: number; scope: string; state: State };
const entries = new Map<string, Entry>();
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 8;
const MAX_PENDING = 4;
let observer: (event: Json) => void = () => {};
export function observeAiCacheV050(report: (event: Json) => void) { observer = report; }
function report(key: string, entry: Entry, reason: string) {
  observer({ event: 'viewer-query', stage: 'cache-lookup', reason, evictionReason: entry.state === 'EVICTED' ? reason : undefined, state: entry.state, requestId: entry.id, keyHash: diagnosticHashV050(key), scopeHash: diagnosticHashV050(entry.scope), entryBytes: entry.bytes, cacheBytes: [...entries.values()].reduce((n,e)=>n+e.bytes,0), cacheEntries: entries.size });
}

function trim() {
  let bytes = [...entries.values()].reduce((n, e) => n + e.bytes, 0);
  for (const [key, entry] of entries) {
    if (bytes <= MAX_BYTES && entries.size <= MAX_ENTRIES) break;
    if (!entry.value) continue;
    entry.state = 'EVICTED'; report(key, entry, bytes > MAX_BYTES ? 'BYTE_BUDGET' : 'LRU'); entries.delete(key); bytes -= entry.bytes;
  }
}

export function acquireAiResultV045(scope: string, key: string, id: string, execute: () => Promise<Json>, force = false) {
  if (force) { const old = entries.get(key); if (old) { old.state = 'EVICTED'; report(key,old,'FORCE_REFRESH'); } entries.delete(key); }
  const hit = entries.get(key);
  if (hit && (hit.state === 'PENDING' || hit.state === 'SUCCEEDED')) { entries.delete(key); entries.set(key, hit); report(key,hit,'HIT'); return { entry: hit, reused: true }; }
  if ([...entries.values()].filter(e => e.state === 'PENDING').length >= MAX_PENDING) throw Error('QUERY_QUEUE_FULL');
  const entry: Entry = { id, scope, bytes: 0, state: 'PENDING', promise: Promise.resolve({}) };
  entry.promise = execute().then(value => {
    if (value.ok === false || value.projectionStale || entry.state !== 'PENDING') { entry.state = entry.state === 'CANCELLING' ? 'CANCELLED' : 'FAILED'; report(key,entry,value.projectionStale ? 'GENERATION_CHANGE' : entry.state); if (entries.get(key) === entry) entries.delete(key); return value; }
    entry.state = 'SUCCEEDED'; entry.value = value; entry.bytes = JSON.stringify(value).length * 2;
    // Completion may happen with no mounted viewer to bind its first generation.
    bindAiGenerationV050(key, value.generation); trim(); return value;
  }, error => { entry.state = entry.state === 'CANCELLING' ? 'CANCELLED' : 'FAILED'; if (entries.get(key) === entry) entries.delete(key); throw error; });
  entries.set(key, entry); report(key,entry,'MISS'); trim(); return { entry, reused: false };
}

export function cancellingAiResultV050(id: string) {
  for (const [key,entry] of entries) if (entry.id === id && entry.state === 'PENDING') { entry.state = 'CANCELLING'; report(key,entry,'CANCELLED'); }
}

export function bindAiGenerationV050(key: string, generation: string) {
  const entry = entries.get(key);
  if (!entry || entry.state !== 'SUCCEEDED' || !generation) return;
  try {
    const parsed = JSON.parse(key);
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
      const next = semanticQueryV050({ ...parsed, generation });
      entries.delete(key); entries.set(next, entry); trim();
    }
  } catch { /* Legacy callers use opaque keys. */ }
}

export function pendingAiResultV050(scope: string, exceptKey: string) {
  return [...entries].filter(([key, entry]) => entry.scope === scope && key !== exceptKey && entry.state === 'PENDING').map(([, entry]) => entry.id);
}

export function aiResultCacheStateV045() {
  return { entries: entries.size, bytes: [...entries.values()].reduce((n, e) => n + e.bytes, 0), pending: [...entries.values()].filter(e => !e.value).length, maxBytes: MAX_BYTES, maxEntries: MAX_ENTRIES, maxPending: MAX_PENDING };
}
