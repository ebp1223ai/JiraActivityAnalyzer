import fs from './businessIoDiagnosticsV044.js';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Snapshot } from './aiResultsQueryV043.js';
import { databaseRevisionV045 } from './databaseRevisionV045.js';
import { indexFieldsV044, queryStageV044 } from './aiResultsIndexV044.js';

type Json = Record<string, any>;
export type ProjectionBuildOptionsV049 = { file?: string; summaryOnly?: boolean; ids?: string[] };
type Builder = (options: ProjectionBuildOptionsV049) => Snapshot;
const FORMAT = 'v049-summary-1';
const snapshots = new Map<string, Snapshot>();
const selections = new Map<string,string>();
const revisions = new Map<string, { observation: string; digest: string; identity: string }>();
let root = process.env.JAA_PROJECTION_ROOT ?? path.join(os.tmpdir(), 'jaa-read-projections');
let forceBuild = false;
export function configureReadProjectionV049(appRoot: string, rebuild = false) {
  if (appRoot) root = path.join(appRoot, 'cache', 'read-projections-v049');
  forceBuild = rebuild;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

// Content digests are cached behind the existing WAL-aware observation. Neither
// location nor filesystem inode is persisted as canonical database identity.
export function projectionSourceV049(file: string | null) {
  if (!file) return { identity: 'CLOSED', digest: 'CLOSED' };
  const watched=databaseRevisionV045(file);
  const stat=fs.statSync(file),wal=fs.existsSync(file+'-wal')?fs.statSync(file+'-wal'):null;
  const observation = JSON.stringify([watched,stat.size,stat.mtimeMs,wal?.size,wal?.mtimeMs]), prior = revisions.get(file);
  if (prior?.observation === observation) return prior;
  const db = new DatabaseSync(file, { readOnly: true });
  let identity: string;
  try {
    db.exec('PRAGMA query_only=ON');
    const raw = db.prepare("SELECT 1 FROM sqlite_master WHERE name='database_metadata'").get();
    identity = raw ? String((db.prepare("SELECT database_id FROM database_metadata WHERE metadata_key='primary'").get() as Json)?.database_id ?? '') : 'ai:' + digest(JSON.stringify(db.prepare('SELECT * FROM ai_schema_metadata').all()));
    if (!identity) throw Error('PROJECTION_SOURCE_IDENTITY_MISSING');
  } finally { db.close(); }
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
  for (const input of [file, file + '-wal']) {
    if (!fs.existsSync(input)) continue;
    const fd = fs.openSync(input, 'r');
    try { let n: number; while ((n = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, n)); }
    finally { fs.closeSync(fd); }
  }
  const watchedAfter=databaseRevisionV045(file);
  const after=fs.statSync(file),afterWal=fs.existsSync(file+'-wal')?fs.statSync(file+'-wal'):null;
  if (JSON.stringify([watchedAfter,after.size,after.mtimeMs,afterWal?.size,afterWal?.mtimeMs]) !== observation) throw Error('PROJECTION_SOURCE_CHANGED_DURING_FINGERPRINT');
  const next = { observation, identity, digest: hash.digest('hex') };
  if(revisions.size>=8)revisions.delete(revisions.keys().next().value!);
  revisions.set(file, next); return next;
}
const source = projectionSourceV049;
export const projectionRootV049 = () => root;
function controlFile(key: string) { fs.mkdirSync(root, { recursive: true }); return path.join(root, key + '.catalog.sqlite'); }
function catalog(file: string) {
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS projection_metadata(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL)');
    return db;
  } catch (error) { db.close(); throw error; }
}
function validate(db: DatabaseSync) {
  const result = db.prepare('PRAGMA quick_check').get() as Json;
  if (result.quick_check !== 'ok') throw Error('PROJECTION_INTEGRITY_FAILED');
  if ((db.prepare('SELECT COUNT(*) n FROM documents').get() as Json).n !== (db.prepare('SELECT COUNT(*) n FROM projections').get() as Json).n) throw Error('PROJECTION_ROW_COUNT_MISMATCH');
}
const core = ['eventTime','action','issueKey','analysisStatus','skillId','computed:["manual","state"]','reviewRank','diffApplicability','diffStatus','diffSearchUnknown','addedLineCount','removedLineCount','isSubstantiveChange','beforeAvailability'];

export function closeReadProjectionsV049() { for (const s of snapshots.values()) s.db.close(); snapshots.clear(); revisions.clear(); selections.clear(); }
export function readProjectionV049(kind: 'ai' | 'integrated', ai: string | null, raw: string | null, build: Builder): Snapshot {
  const rawSource = source(raw), aiSource = source(ai);
  const identity = digest(JSON.stringify([FORMAT, kind, rawSource.identity, aiSource.identity]));
  const revision = digest(JSON.stringify([rawSource.digest, aiSource.digest]));
  const selection=JSON.stringify([raw,ai]),selectionChanged=selections.has(kind)&&selections.get(kind)!==selection;
  selections.set(kind,selection);
  const file = controlFile(identity);
  let control: DatabaseSync;
  try { control = catalog(file); }
  catch (error) {
    if(!/malformed|not a database|SQLITE_CORRUPT/i.test(String(error)))throw error;
    // Preserve corrupt derived evidence; never touch canonical files.
    fs.renameSync(file, file + '.corrupt-' + randomUUID()); control = catalog(file);
  }
  try {
    const stored = control.prepare('SELECT body FROM projection_metadata WHERE id=1').get() as Json | undefined;
    let metadata: Json | undefined;
    try { metadata = stored ? JSON.parse(stored.body) : undefined; } catch { metadata = undefined; }
    const activeFile = metadata?.activeFile && /^[a-f0-9-]+\.sqlite$/.test(metadata.activeFile) ? path.join(root, metadata.activeFile) : '';
    const key = activeFile;
    let s = snapshots.get(key);
    if(metadata?.projection_format_version!==FORMAT || metadata?.raw_database_identity!==rawSource.identity || metadata?.ai_database_identity!==aiSource.identity)s=undefined;
    if (!s && activeFile && fs.existsSync(activeFile) && metadata?.projection_format_version === FORMAT) {
      let db: DatabaseSync | undefined;
      try {
        db = new DatabaseSync(activeFile); db.exec('PRAGMA busy_timeout=3000; PRAGMA cache_size=-8192'); validate(db);
        const state = JSON.parse((db.prepare('SELECT body FROM projection_state WHERE id=1').get() as Json).body);
        if (state.revision !== metadata.activeRevision) throw Error('PROJECTION_GENERATION_MISMATCH');
        s = { db, registry: new Map(state.registry), indexed: new Set(state.indexed), total: state.total, key: state.generation, metadata: state.metadata, disk: true };
        if(snapshots.size>=4){const oldest=snapshots.keys().next().value!;snapshots.get(oldest)!.db.close();snapshots.delete(oldest);}
        snapshots.set(key, s);
      } catch { db?.close(); s = undefined; }
    }
    // A newly selected divergent copy is not the previous view. Paths are used
    // only for this transient switch check, never persisted as sidecar identity.
    if(selectionChanged && metadata?.activeRevision!==revision)s=undefined;
    if (s && metadata?.activeRevision !== revision && !forceBuild) {
      s.metadata = { ...s.metadata, projectionStale: true, projectionBuildRequired: true };
      // Stale summary is readable; hydrate from a different revision is forbidden.
      s.hydrate = () => { throw Error('PROJECTION_STALE_HEAVY_UNAVAILABLE'); };
      return s;
    }
    if (!s || metadata?.activeRevision !== revision) {
      const generation = randomUUID(), output = path.join(root, generation + '.sqlite');
      const startedAt = new Date().toISOString();
      queryStageV044('projection-build', 'START', { generation, requestKind: 'projection-build' });
      control.prepare('INSERT OR REPLACE INTO projection_metadata VALUES(1,?)').run(JSON.stringify({ ...metadata, projection_format_version: FORMAT, build_generation: generation, build_status: 'BUILDING', build_started_at: startedAt }));
      let building: Snapshot | undefined;
      try {
        const next = building = build({ file: output, summaryOnly: true });
        next.disk = true; next.key = generation;
        next.metadata = { ...next.metadata, projectionGeneration: generation, projectionStale: false, projectionBuildRequired: false, projectionFormatVersion: FORMAT };
        indexFieldsV044(next, core);
        next.db.exec('CREATE TABLE projection_state(id INTEGER PRIMARY KEY,body TEXT NOT NULL); CREATE INDEX cells_text ON cells(field_id,text,row_id); CREATE INDEX cells_sort ON cells(field_id,number,row_id)');
        const state = { revision, generation, total: next.total, registry: [...next.registry], indexed: [...next.indexed], metadata: next.metadata };
        next.db.prepare('INSERT INTO projection_state VALUES(1,?)').run(JSON.stringify(state));
        validate(next.db);
        if (source(raw).digest !== rawSource.digest || source(ai).digest !== aiSource.digest) throw Error('PROJECTION_SOURCE_CHANGED_DURING_BUILD');
        metadata = { projection_format_version: FORMAT, projection_schema_version: 1, raw_database_identity: rawSource.identity, raw_database_revision: rawSource.digest, ai_database_identity: aiSource.identity, ai_database_revision: aiSource.digest, active_generation: generation, activeFile: path.basename(output), activeRevision: revision, build_generation: null, build_status: 'READY', build_started_at: startedAt, build_completed_at: new Date().toISOString() };
        // A single SQLite statement is the atomic generation pointer switch.
        control.prepare('INSERT OR REPLACE INTO projection_metadata VALUES(1,?)').run(JSON.stringify(metadata));
        if(snapshots.size>=4){const oldest=snapshots.keys().next().value!;snapshots.get(oldest)!.db.close();snapshots.delete(oldest);}
        s = next; snapshots.set(output, s); building = undefined;
        queryStageV044('projection-build', 'END', { generation, rows: s.total, sizeBytes: fs.statSync(output).size });
      } catch (error) {
        building?.db.close();
        control.prepare('INSERT OR REPLACE INTO projection_metadata VALUES(1,?)').run(JSON.stringify({ ...metadata, build_status: 'FAILED', build_generation: null }));
        throw error;
      }
    }
    const snapshot = s!;
    snapshot.hydrate = ids => {
      if (!ids.length) return [];
      if (source(raw).digest !== rawSource.digest || source(ai).digest !== aiSource.digest) throw Error('PROJECTION_STALE_HEAVY_UNAVAILABLE');
      const page = build({ ids });
      snapshot.metadata.lastHydrationAiRecords=page.metadata.aiRecordCount;
      try { const rows=page.db.prepare('SELECT id,body FROM documents').all() as Json[];if(rows.length!==new Set(ids).size)throw Error('PROJECTION_CANONICAL_ROW_MISSING');if(source(raw).digest!==rawSource.digest || source(ai).digest!==aiSource.digest)throw Error('PROJECTION_STALE_HEAVY_UNAVAILABLE');return rows; }
      finally { page.db.close(); }
    };
    snapshot.persistIndex = () => snapshot.db.prepare("UPDATE projection_state SET body=json_set(body,'$.indexed',json((SELECT json_group_array(value) FROM (SELECT value FROM json_each(json_extract(projection_state.body,'$.indexed')) UNION SELECT value FROM json_each(?))))) WHERE id=1").run(JSON.stringify([...snapshot.indexed]));
    return snapshot;
  } finally { control.close(); }
}
