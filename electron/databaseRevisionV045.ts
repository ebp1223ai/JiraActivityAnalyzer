import fs from './businessIoDiagnosticsV044.js';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

type Watch = { db: DatabaseSync; identity: string; epoch: number; dataVersion?: number; fingerprint?: string; ai: boolean };
const watches = new Map<string, Watch>();
let epoch = 0;

// A persistent read-only connection observes committed external writes, including WAL.
// Opening, health checks and filesystem timestamps alone do not change data_version.
export function databaseRevisionV045(file: string | null): string {
  if (!file) return 'CLOSED';
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    watches.get(resolved)?.db.close(); watches.delete(resolved); return 'MISSING';
  }
  const stat = fs.statSync(resolved);
  const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
  let watch = watches.get(resolved);
  if (watch && watch.identity !== identity) { watch.db.close(); watches.delete(resolved); watch = undefined; }
  if (!watch) {
    if (watches.size >= 4) { const oldest = watches.keys().next().value!; watches.get(oldest)!.db.close(); watches.delete(oldest); }
    watch = { db: new DatabaseSync(resolved, { readOnly: true }), identity, epoch: ++epoch, ai: false };
    watch.db.exec('PRAGMA query_only=ON'); watches.set(resolved, watch);
    watch.ai = Boolean(watch.db.prepare("SELECT 1 FROM sqlite_master WHERE name='ai_schema_metadata'").get());
  }
  const version = watch.db.prepare('PRAGMA data_version').get() as { data_version: number };
  if (watch.ai && watch.dataVersion !== version.data_version) {
    // Inactive imports and repeated relink audit attempts are not active result changes.
    const hash = createHash('sha256');
    const sql = `SELECT r.ai_record_id,r.source_database_id,r.activity_event_id,r.active_analysis_id,r.active_review_id,r.source_link_status,r.integrity_status,
      a.analysis_json,t.source_trace_json,v.review_json,(SELECT json_group_array(f.finding_json) FROM ai_skill_findings f WHERE f.analysis_id=a.analysis_id ORDER BY f.rowid) findings,l.raw_database_identity,l.link_status,l.matched_activity_event_id,l.candidate_count,l.database_generation_status
      FROM ai_records r JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id
      JOIN ai_record_source_traces t ON t.ai_record_id=r.ai_record_id AND t.import_batch_id=a.import_batch_id
      LEFT JOIN ai_record_reviews v ON v.review_id=r.active_review_id
      LEFT JOIN source_link_attempts l ON l.rowid=(SELECT MAX(x.rowid) FROM source_link_attempts x WHERE x.ai_record_id=r.ai_record_id)
      ORDER BY r.ai_record_id`;
    for (const row of watch.db.prepare(sql).iterate()) hash.update(JSON.stringify(row));
    watch.fingerprint = hash.digest('hex'); watch.dataVersion = version.data_version;
  }
  return `${resolved}|${identity}|${watch.epoch}|${watch.ai ? watch.fingerprint : version.data_version}`;
}

export function closeDatabaseRevisionsV045() {
  for (const watch of watches.values()) watch.db.close();
  watches.clear();
}
