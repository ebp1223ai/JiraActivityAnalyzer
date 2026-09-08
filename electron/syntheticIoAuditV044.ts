import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadId } from 'node:worker_threads';
import * as sqlite from 'node:sqlite';

// Capability-gated observation only. No payload, SQL, credentials or file contents are recorded.
export function installSyntheticIoAuditV044(root: string) {
  if (process.env.JAA_UI_IO_AUDIT !== '1' || process.env.JAA_UI_TEST_MODE !== '1') return;
  const nonce = process.env.JAA_UI_TEST_NONCE ?? '';
  if (!/^[a-f0-9]{64}$/.test(nonce)) return;
  try { const marker = JSON.parse(fs.readFileSync(path.join(root, '.jaa-ui-test.json'), 'utf8')); if (marker.nonce !== nonce || marker.syntheticOnly !== true) return; } catch { return; }
  const global = globalThis as typeof globalThis & { __jaaIoAuditV044?: boolean };
  if (global.__jaaIoAuditV044) return;
  global.__jaaIoAuditV044 = true;
  process.env.JAA_UI_AUDIT_ROOT = root;
  const append = fs.appendFileSync.bind(fs), mkdir = fs.mkdirSync.bind(fs);
  mkdir(path.join(root, 'logs'), { recursive: true });
  const output = path.join(root, 'logs', `io-audit-${process.pid}-${threadId}.ndjson`), seen = new Set<string>();
  const record = (operation: string, input: unknown, writes: boolean) => {
    let target: string;
    try { target = input instanceof URL ? fileURLToPath(input) : typeof input === 'string' ? input : Buffer.isBuffer(input) ? input.toString() : ''; } catch { return; }
    if (!target || target === ':memory:') return;
    target = path.resolve(target); const key = operation + ':' + target;
    if (seen.has(key) || seen.size >= 10000) return; seen.add(key);
    const rel = path.relative(path.resolve(root), target), inside = !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep);
    try { append(output, JSON.stringify({ timestampUtc: new Date().toISOString(), pid: process.pid, threadId, operation, path: target, writes, policy: inside ? 'APP_ROOT' : writes ? 'EXTERNAL_WRITE_REQUIRES_REVIEW' : 'EXTERNAL_READ_REQUIRES_REVIEW', observation: 'API invocation; may fail; no content captured' }) + '\n'); } catch { /* Test audit cannot alter the observed API outcome. */ }
  };
  const wrap = (object: any, name: string, writes: boolean, twoPaths = false) => {
    const original = object[name]; if (typeof original !== 'function') return;
    object[name] = function (...args: unknown[]) { record(name, args[0], writes); if (twoPaths) record(name + '-destination', args[1], true); return original.apply(this, args); };
  };
  for (const name of ['readFile','readFileSync','readdir','readdirSync','stat','statSync','access','accessSync','createReadStream']) wrap(fs, name, false);
  for (const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','unlink','unlinkSync','rm','rmSync','createWriteStream']) wrap(fs, name, true);
  for (const name of ['rename','renameSync']) wrap(fs, name, true, true);
  for (const name of ['copyFile','copyFileSync','cp','cpSync']) wrap(fs, name, false, true);
  for (const name of ['readFile','readdir','stat','access']) wrap(fs.promises, name, false);
  for (const name of ['writeFile','appendFile','mkdir','unlink','rm']) wrap(fs.promises, name, true);
  for (const name of ['rename']) wrap(fs.promises, name, true, true);
  for (const name of ['copyFile','cp']) wrap(fs.promises, name, false, true);
  for (const object of [fs, fs.promises]) for (const name of object === fs ? ['open','openSync'] : ['open']) {
    const original = (object as any)[name];
    (object as any)[name] = function (...args: any[]) { const flags = args[1] ?? 'r'; record(name, args[0], typeof flags === 'number' ? (flags & 3) !== 0 : /[wa+]/.test(String(flags))); return original.apply(this,args); };
  }
  const original = sqlite.DatabaseSync;
  // Node builtin exports are shared with worker/service imports within this isolate.
  const builtin = require('node:sqlite') as typeof sqlite;
  builtin.DatabaseSync = new Proxy(original, { construct(target, args, constructor) { record('sqlite-open', args[0], args[1]?.readOnly !== true); return Reflect.construct(target, args, constructor); } });
}

if (process.env.JAA_UI_AUDIT_ROOT) installSyntheticIoAuditV044(process.env.JAA_UI_AUDIT_ROOT);
