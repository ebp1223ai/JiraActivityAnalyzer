import fs from './businessIoDiagnosticsV044.js';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { measureQueryStageV050 as measured, queryStageV044 } from './aiResultsIndexV044.js';

function byteDigest(file: string) {
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
  for (const name of [file, file + '-wal']) {
    if (!fs.existsSync(name)) continue;
    hash.update(name === file ? 'database' : 'wal');
    const fd = fs.openSync(name, 'r');
    try { let n: number; while ((n = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, n)); }
    finally { fs.closeSync(fd); }
  }
  return hash.digest('hex');
}
export function validateProjectionIntegrityV050(db: DatabaseSync, file: string) {
  // A receipt binds a completed full check to exact derived bytes, never just a path/mtime.
  const receipt = file + '.integrity-v050.json';
  const before = measured('sidecar-integrity-fingerprint', () => byteDigest(file));
  let prior: { digest?: string; version?: number } | undefined;
  try { prior = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch { /* Old projections have no receipt. */ }
  if (prior?.version === 1 && prior.digest === before) {
    queryStageV044('quick-check-reused', 'POINT', { reason: 'EXACT_VERIFIED_BYTES' });
    return;
  }
  const result = measured('quick-check', () => db.prepare('PRAGMA quick_check').get()) as { quick_check: string };
  if (result.quick_check !== 'ok') throw Error('PROJECTION_INTEGRITY_FAILED');
  const after = measured('sidecar-integrity-fingerprint', () => byteDigest(file));
  if (before !== after) throw Error('PROJECTION_CHANGED_DURING_INTEGRITY_CHECK');
  const temporary = receipt + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, digest: after, fullCheck: 'quick_check', completedAt: new Date().toISOString() }), { flag: 'wx' }); fs.renameSync(temporary, receipt); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
