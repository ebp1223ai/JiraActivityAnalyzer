type Json = Record<string, any>;
type Entry = { id: string; promise: Promise<Json>; value?: Json; bytes: number; scope: string };
const entries = new Map<string, Entry>();
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 8;
const MAX_PENDING = 4;

function trim() {
  let bytes = [...entries.values()].reduce((n, e) => n + e.bytes, 0);
  for (const [key, entry] of entries) {
    if (bytes <= MAX_BYTES && entries.size <= MAX_ENTRIES) break;
    if (!entry.value) continue;
    entries.delete(key); bytes -= entry.bytes;
  }
}

export function acquireAiResultV045(scope: string, key: string, id: string, execute: () => Promise<Json>, force = false) {
  if (force) entries.delete(key);
  const hit = entries.get(key);
  if (hit) { entries.delete(key); entries.set(key, hit); return { entry: hit, reused: true }; }
  if ([...entries.values()].filter(e => !e.value).length >= MAX_PENDING) throw Error('QUERY_QUEUE_FULL');
  const entry: Entry = { id, scope, bytes: 0, promise: Promise.resolve({}) };
  entry.promise = execute().then(value => {
    if (value.ok === false) { if (entries.get(key) === entry) entries.delete(key); return value; }
    entry.value = value; entry.bytes = JSON.stringify(value).length * 2; trim(); return value;
  }, error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
  entries.set(key, entry); trim(); return { entry, reused: false };
}

export function aiResultCacheStateV045() {
  return { entries: entries.size, bytes: [...entries.values()].reduce((n, e) => n + e.bytes, 0), pending: [...entries.values()].filter(e => !e.value).length, maxBytes: MAX_BYTES, maxEntries: MAX_ENTRIES, maxPending: MAX_PENDING };
}
