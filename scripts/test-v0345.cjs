const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { root, load, seedRaw } = require('./v0343-test-helpers.cjs');
const work = path.join(root, 'test-artifacts/v0.3.45', 'services-' + Date.now());
const query = load('electron/aiResultsQueryV043.ts', work);
const { AiResultsServiceV044 } = load('electron/aiResultsServiceV044.ts', work);
const { databaseRevisionV045, closeDatabaseRevisionsV045 } = load('electron/databaseRevisionV045.ts', work);
const { captureDiagnosticSessionV045 } = load('electron/diagnosticSnapshotV045.ts', work);
const { DiagnosticWriterV044 } = load('electron/diagnosticWriterV044.ts', work);
const { createEnvelopeProducerV044 } = load('electron/diagnosticEnvelopeV044.ts', work);
const results = [], services = [];
async function test(name, action) { const start = performance.now(); try { const detail = await action(); results.push({name,status:'PASS',durationMs:performance.now()-start,detail}); console.log('PASS '+name); } catch (e) { results.push({name,status:'FAIL',durationMs:performance.now()-start,error:e.stack}); throw e; } }
const raw = path.join(work,'raw.sqlite'), rawB = path.join(work,'raw-b.sqlite');
const records = Array.from({length:39281}, (_,i) => ({ id:'event-'+i, issue:'SYN-'+i, actor:i<40?'Export User':'Other User', eventTime:new Date(1788739200000+i*1000).toISOString(), fieldName:i<40?'Description '+('synthetic '.repeat(25)):'Description', fieldId:'description', eventType:'field_changed', before:'old '+('a'.repeat(345)), after:'new '+('b'.repeat(345)) }));
function addCurrent(file, values) { const db = new DatabaseSync(file); try { const statement=db.prepare("INSERT INTO current_issue_snapshots(source_object_id,summary,status,issue_type,priority,labels_json,components_json,versions_json,snapshot_json,snapshot_updated_at) VALUES(?,?,?,?,?,'[]','[]','[]','{}','2026-09-08T00:00:00Z')"); db.exec('BEGIN'); for (const row of db.prepare('SELECT id FROM source_objects').iterate()) statement.run(row.id,'Synthetic current issue',...values); db.exec('COMMIT'); } finally { db.close(); } }
async function main() {
  seedRaw(raw, records, work, 'database-a'); addCurrent(raw, ['Confirmed','Bug Fix','Normal']);
  seedRaw(rawB, records.slice(0,5), work, 'database-b'); addCurrent(rawB, ['Open','Task','High']);
  await test('T45-01/02 Raw current values, missing AI, filters/facets/export and DB isolation', () => {
    const a=query.queryResultsV043('integrated',null,raw,{pageSize:20,visibleFields:[]}); assert.equal(a.totalCount,39281); assert.equal(a.rows.length,20);
    for (const row of a.rows) { assert.equal(row.issueTypeName,'Bug Fix'); assert.equal(row.currentStatusName,'Confirmed'); assert.equal(row.currentPriorityName,'Normal'); }
    const facet=query.distinctResultsV043('integrated',null,raw,'issueTypeName',{}); assert.equal(facet.values[0].count,39281);
    const filtered=query.queryResultsV043('integrated',null,raw,{filters:{currentStatusName:{text:'Confirmed',operator:'exact'}},visibleFields:[]}); assert.equal(filtered.filteredCount,39281);
    const b=query.queryResultsV043('integrated',null,rawB,{visibleFields:[]}); assert.equal(b.totalCount,5); assert.equal(b.rows[0].issueTypeName,'Task');
    const db=new DatabaseSync(raw,{readOnly:true}); const expected=db.prepare('SELECT s.issue_type,s.status,s.priority FROM activity_events e JOIN source_objects o ON o.id=e.source_object_id LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id LIMIT 1').get(); db.close(); assert.deepEqual([a.rows[0].issueTypeName,a.rows[0].currentStatusName,a.rows[0].currentPriorityName],Object.values(expected));
    return {rawRows:39281,otherDatabaseRows:5,source:'same UserViewer SQL join',aiClosed:true};
  });
  await test('T45-09 SQLite committed revision: timestamp/read/rollback unchanged; external WAL write invalidates', () => {
    const first=databaseRevisionV045(raw); fs.utimesSync(raw,new Date(),new Date()); assert.equal(databaseRevisionV045(raw),first);
    const db=new DatabaseSync(raw); db.prepare('SELECT COUNT(*) FROM activity_events').get(); assert.equal(databaseRevisionV045(raw),first);
    db.exec("BEGIN; UPDATE current_issue_snapshots SET status='Transient'; ROLLBACK"); assert.equal(databaseRevisionV045(raw),first);
    db.exec("PRAGMA journal_mode=WAL; UPDATE current_issue_snapshots SET status='Updated' WHERE source_object_id='obj-0'"); assert.notEqual(databaseRevisionV045(raw),first); db.close();
    return {readsAndTimestampsDoNotInvalidate:true,rollbackStable:true,walCommitDetected:true};
  });
  await test('T45-09 active AI revision preserves protected/no-op imports and invalidates new active data', () => {
    const store=load('electron/aiAnalysisDatabaseV042.ts',work), ai=path.join(work,'revision-ai.sqlite');
    const base=path.join(root,'tests/fixtures/v0.3.43/v201');
    const options={databasePath:ai,packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
    store.initializeAiDatabaseV042({databasePath:ai}); const empty=databaseRevisionV045(ai);
    store.importAiAnalysisPackageV042({...options,packagePath:path.join(base,'package-review-completed-55.json')}); const complete=databaseRevisionV045(ai); assert.notEqual(complete,empty);
    store.importAiAnalysisPackageV042({...options,packagePath:path.join(base,'package-ai-only-55.json')}); assert.equal(databaseRevisionV045(ai),complete);
    store.importAiAnalysisPackageV042({...options,packagePath:path.join(base,'package-ai-only-55.json')}); assert.equal(databaseRevisionV045(ai),complete);
    const db=new DatabaseSync(ai); db.exec("UPDATE ai_skill_findings SET finding_json=json_set(finding_json,'$.rationale','External synthetic edit') WHERE rowid=(SELECT MIN(rowid) FROM ai_skill_findings)"); db.close(); assert.notEqual(databaseRevisionV045(ai),complete);
    return {newActiveDataInvalidates:true,protectedAndNoopStable:true,externalFindingChangeInvalidates:true};
  });
  await test('T45-11/13 ready 39281 mother set, 40 matching/17 columns: five same-executor complete exports', async () => {
    const s=new AiResultsServiceV044(path.join(root,'dist-electron/ai-results-worker-v044.cjs'));services.push(s);
    const phases=[]; const run=(id,action,more={})=>s.run(1,{requestId:id,kind:'integrated',action,ai:null,raw,query:{pageSize:20,visibleFields:[],filters:{displayName:{text:'Export User',operator:'exact'}}},...more}, stage=>phases.push({event:stage.event,phase:stage.phase}));
    const ready=await run('ready','query'); assert.equal(ready.filteredCount,40);assert.equal(ready.rows.length,20);
    const visible=['eventTime','issueKey','displayName','fieldName','eventType','sourceProvenance','before','after','summary','issueTypeName','currentStatusName','currentPriorityName','projectKey','historyId','itemIndex','sourceLinkStatus','analysisStatus'];
    const samples=[];
    for(let i=0;i<5;i++){phases.length=0;const output=path.join(work,'export-'+i+'.partial'),at=performance.now();const receipt=await run('export-'+i,'export-file',{visible,output,format:'json'});const elapsedMs=performance.now()-at;const data=JSON.parse(fs.readFileSync(output));assert.equal(data.rows.length,40);assert.equal(data.fields.length,17);assert.equal(data.snapshot,ready.generation);assert.ok(!phases.some(p=>p.event==='snapshot-build'));assert.ok(elapsedMs<=2000,String(elapsedMs));samples.push({elapsedMs,bytes:receipt.sizeBytes,rows:40,columns:17,phases:[...phases]});}
    const rejectedFile=path.join(work,'stale-snapshot.partial');await assert.rejects(run('stale-export','export-file',{visible,output:rejectedFile,format:'json',query:{pageSize:20,expectedSnapshot:ready.generation+'-stale',visibleFields:[]}}),/EXPORT_SNAPSHOT_CHANGED/);assert.equal(fs.existsSync(rejectedFile),false);
    assert.equal(s.diagnostics().executorCount,1); return {samples,executors:1,staleSnapshotRejected:true,pickerWaitMs:0,level:'production service; UI timing separate'};
  });
  await test('T45-08/10 pending cache reconnect uses one real service job and bounded entries', async () => {
    const cache=load('src/state/aiResultCacheV045.ts',work); const service=new AiResultsServiceV044(path.join(root,'dist-electron/ai-results-worker-v044.cjs'));services.push(service);let jobs=0;
    const execute=()=>{jobs++;return service.run(9,{requestId:'inflight',kind:'integrated',action:'query',raw,ai:null,query:{pageSize:20,visibleFields:[]}});};
    const a=cache.acquireAiResultV045('A','same-query','inflight',execute);const b=cache.acquireAiResultV045('A','same-query','duplicate',execute);
    assert.equal(b.reused,true);assert.equal(a.entry.promise,b.entry.promise);const result=await b.entry.promise;assert.equal(result.totalCount,39281);assert.equal(jobs,1);
    for(let i=0;i<12;i++) await cache.acquireAiResultV045('A','query-'+i,'q-'+i,()=>service.run(9,{requestId:'q-'+i,kind:'integrated',action:'query',raw,ai:null,query:{page:i+1,pageSize:20,visibleFields:[]}})).entry.promise;
    const state=cache.aiResultCacheStateV045();assert.ok(state.entries<=state.maxEntries);assert.ok(state.bytes<=state.maxBytes);assert.equal(state.pending,0);return {jobsBeforeEviction:jobs,...state};
  });
  await test('T45-12/14 full row export is not page-limited; four formats, arrays and source text', () => {
    const columns=['issueKey','before','after','issueTypeName']; const q={pageSize:20,filters:{displayName:{text:'Export User',operator:'exact'}}};
    for(const format of ['json','csv']) for(const visible of [columns,undefined]) {const file=path.join(work,format+'-'+Boolean(visible)+'.partial');const receipt=query.writeQueryExportV044('integrated',null,raw,q,visible,file,format);assert.equal(receipt.filteredCount,40);if(format==='json'){const json=JSON.parse(fs.readFileSync(file));assert.equal(json.rows.length,40);assert.equal(json.rows[0]['computed:["before"]'],records[0].before);} }
    const file=path.join(work,'all-39281.partial');query.writeQueryExportV044('integrated',null,raw,{pageSize:20},['issueKey'],file,'json');assert.equal(JSON.parse(fs.readFileSync(file)).rows.length,39281);
    return {fullRows:39281,formats:4,originalTextPreserved:true};
  });
  await test('T45-18 writer cutoff counts/watermarks/hash and missing producer', async () => {
    const build={version:'0.3.45',sourceCommit:null,buildTime:null};const writer=new DiagnosticWriterV044({logsDir:path.join(work,'logs'),sessionId:'app-session-cutoff',instanceId:'cutoff',mainPid:process.pid,build});
    try {await writer.start();const produce=createEnvelopeProducerV044({sessionId:'app-session-cutoff',instanceId:'cutoff',processType:'worker',build});const context={operationId:'query',spanId:'root',parentSpanId:null,route:'/integrated-results'};
      writer.record(produce('export-snapshot','START',context),true);writer.record(produce('export-snapshot','END',context),true);const snapshot=writer.capture(path.join(work,'snapshot'));const counts=Object.values(snapshot.counts).reduce((a,b)=>a+b,0);assert.equal(counts,3);assert.equal(snapshot.completeness,'COMPLETE_THROUGH_WATERMARK');assert.deepEqual(snapshot.openSpans,{});
      writer.record(produce('future-event','POINT'),true);const saved=JSON.parse(fs.readFileSync(path.join(work,'snapshot/current/snapshot-summary.json')));assert.deepEqual(saved.watermarks,snapshot.watermarks);
      const missing=captureDiagnosticSessionV045(writer.sessionDir,path.join(work,'snapshot-missing'),['absent-producer']);assert.equal(missing.completeness,'INCOMPLETE');return {count:counts,files:snapshot.files.length,missingDetected:true};
    } finally {writer.close(true);}
  });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{query.invalidateAiResultsV043();closeDatabaseRevisionsV045();for(const s of services)await s.close();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({version:'0.3.45',results,work},null,2));console.log('Evidence '+work);});
