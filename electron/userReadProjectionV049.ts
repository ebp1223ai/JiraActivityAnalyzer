import fs from './businessIoDiagnosticsV044.js';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { projectionRootV049, projectionSourceV049 } from './readProjectionV049.js';

type Row = Record<string, any>;
type Control = { isCancelled?: () => boolean; onProgress?: (progress: any) => void; requestId: string };
// User quick filters have a different historical policy from Integrated Results.
// Persist their existing classifier outcomes, never substitute AI display metrics.
export async function userReadProjectionV049(file: string, classify: (row: Row) => {status: string; mask: number}, control: Control) {
  const revision = projectionSourceV049(file);
  const key = createHash('sha256').update(JSON.stringify(['user-metrics-1',revision.identity,revision.digest])).digest('hex');
  const root = projectionRootV049(); fs.mkdirSync(root,{recursive:true});
  const target=path.join(root,'user-'+key+'.sqlite');
  if(fs.existsSync(target)) {
    let check: DatabaseSync | undefined;
    try { check=new DatabaseSync(target,{readOnly:true});if((check.prepare('PRAGMA quick_check').get() as Row).quick_check==='ok' && (check.prepare('SELECT revision FROM metadata').get() as Row)?.revision===revision.digest) return target; }
    catch(error){if(!/malformed|not a database|no such table/i.test(String(error)))throw error;}
    finally {check?.close();}
    fs.renameSync(target,target+'.corrupt-'+randomUUID());
  }
  const partial=target+'.'+randomUUID()+'.partial';
  const source=new DatabaseSync(file,{readOnly:true}),db=new DatabaseSync(partial);
  const started=performance.now();
  try {
    source.exec('PRAGMA query_only=ON; BEGIN');
    db.exec('PRAGMA cache_size=-8192; CREATE TABLE metrics(id TEXT PRIMARY KEY,status TEXT NOT NULL,mask INTEGER NOT NULL,tie_rank INTEGER); CREATE TABLE metadata(revision TEXT NOT NULL); BEGIN');
    const total=Number((source.prepare('SELECT COUNT(*) n FROM activity_events').get() as Row).n);
    const insert=db.prepare('INSERT INTO metrics(id,status,mask) VALUES(?,?,?)');
    let cursor='',processed=0;
    while(true){
      if(control.isCancelled?.())throw Error('VIEWER_REQUEST_CANCELLED');
      const batch=source.prepare(`SELECT e.id eventId,o.issue_key issueKey,e.field_id fieldId,e.field_name fieldName,e.from_value_json before,e.to_value_json after,e.source_record_id sourceRecordId,e.jira_native_source_id jiraNativeSourceId,e.source_provenance sourceProvenance FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id WHERE e.id>? ORDER BY e.id LIMIT 100`).all(cursor) as Row[];
      if(!batch.length)break;
      for(const row of batch){const value=classify(row);insert.run(row.eventId,value.status,value.mask);cursor=row.eventId;processed++;}
      control.onProgress?.({requestId:control.requestId,status:'filtering',scanned:processed,total,matched:0,percentage:total?Math.round(processed/total*100):100,elapsedMs:performance.now()-started,batchSize:100,checkpoint:'projection-build'});
      await new Promise<void>(resolve=>setImmediate(resolve));
    }
    const ids=(db.prepare('SELECT id FROM metrics').all() as Row[]).map(r=>r.id as string).sort((a,b)=>a.localeCompare(b));
    const tie=db.prepare('UPDATE metrics SET tie_rank=? WHERE id=?');ids.forEach((id,i)=>tie.run(i,id));
    db.prepare('INSERT INTO metadata VALUES(?)').run(revision.digest);
    db.exec('COMMIT; CREATE INDEX metrics_filter ON metrics(mask,status,id)');
    if((db.prepare('PRAGMA quick_check').get() as Row).quick_check!=='ok')throw Error('USER_PROJECTION_INTEGRITY_FAILED');
    if(control.isCancelled?.())throw Error('VIEWER_REQUEST_CANCELLED');
    if(projectionSourceV049(file).digest!==revision.digest)throw Error('PROJECTION_SOURCE_CHANGED_DURING_BUILD');
  }finally{source.close();db.close();}
  try {fs.renameSync(partial,target);}catch(error){if(!fs.existsSync(target))throw error;}
  return target;
}
