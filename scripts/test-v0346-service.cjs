const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {root,load,seedRaw}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.46','worker-'+Date.now());fs.mkdirSync(work,{recursive:true});
const {AiResultsServiceV044}=load('electron/aiResultsServiceV044.ts',work);
const {presentationMetricsV046,commentTextV046}=load('shared/activityPresentationV046.ts',work);
const projection=load('shared/aiResultProjectionV043.ts',work);
const query=load('electron/aiResultsQueryV043.ts',work);
const cache=load('src/state/aiResultCacheV045.ts',work);
const store=load('electron/aiAnalysisDatabaseV042.ts',work);
const service=new AiResultsServiceV044(path.join(root,'dist-electron/ai-results-worker-v044.cjs'));
const checks=[];
async function test(name,fn){const at=performance.now();const detail=await fn();checks.push({name,status:'PASS',durationMs:performance.now()-at,detail});}
async function main(){

 await test('R46-13 committed revisions ignore rollback/protected/noop; Raw metadata remains DB-scoped',()=>{
  const {databaseRevisionV045:revision,closeDatabaseRevisionsV045:close}=load('electron/databaseRevisionV045.ts',work);
  try {
   const a=path.join(work,'revision-raw-a.sqlite'),b=path.join(work,'revision-raw-b.sqlite');
   for(const [file,identity,status,type,priority] of [[a,'A','Confirmed','Bug Fix','Normal'],[b,'B','Open','Task','High']]){
    seedRaw(file,[{id:'same-id',issue:'SAME-1',eventTime:'2026-09-01T00:00:00Z'}],work,identity);
    const db=new DatabaseSync(file);db.prepare("INSERT INTO current_issue_snapshots(source_object_id,summary,status,issue_type,priority,labels_json,components_json,versions_json,snapshot_json,snapshot_updated_at) SELECT id,'Synthetic',?,?,?,'[]','[]','[]','{}','2026-09-01T00:00:00Z' FROM source_objects").run(status,type,priority);db.close();
    const row=query.queryResultsV043('integrated',null,file,{visibleFields:[]}).rows[0];assert.deepEqual([row.currentStatusName,row.issueTypeName,row.currentPriorityName],[status,type,priority]);assert.equal(query.distinctResultsV043('integrated',null,file,'issueTypeName').values[0].label,type);
    const exported=query.exportResultsV043('integrated',null,file,{},['currentStatusName','issueTypeName','currentPriorityName']);assert.equal(exported.rows.length,1);
   }
   const first=revision(a),db=new DatabaseSync(a);db.exec("BEGIN; UPDATE current_issue_snapshots SET status='Transient'; ROLLBACK");assert.equal(revision(a),first);db.exec("UPDATE current_issue_snapshots SET status='Committed'");assert.notEqual(revision(a),first);db.close();
   const ai=path.join(work,'revision-ai.sqlite'),base=path.join(root,'tests/fixtures/v0.3.43/v201');
   const options={databasePath:ai,packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
   store.initializeAiDatabaseV042({databasePath:ai});const empty=revision(ai);store.importAiAnalysisPackageV042({...options,packagePath:path.join(base,'package-review-completed-55.json')});const complete=revision(ai);assert.notEqual(complete,empty);
   for(let i=0;i<2;i++){store.importAiAnalysisPackageV042({...options,packagePath:path.join(base,'package-ai-only-55.json')});assert.equal(revision(ai),complete);}
  } finally {close();}
 });

 await test('R46-04 current and legacy preference scopes survive normalization',()=>{
  const {normalizeAiViewerScopesV043}=load('shared/aiViewerPreferencesV043.ts',work);
  for(const prefix of ['v043','v045']){const key=prefix+'|ai|raw|ai|2',saved={query:{page:2,pageSize:25},preferences:{visibleColumns:['issueTypeName'],columnWidths:{issueTypeName:233}}};const normalized=normalizeAiViewerScopesV043({[key]:saved});assert.equal(normalized[key].query.page,2);assert.deepEqual(normalized[key].preferences.visibleColumns,['issueTypeName']);assert.equal(normalized[key].preferences.columnWidths.issueTypeName,233);}
 });
 const raw=path.join(work,'raw.sqlite');seedRaw(raw,Array.from({length:80},(_,i)=>({id:'e'+i,issue:'SYN-'+i,eventTime:'2026-09-01T12:00:00Z',fieldId:'description',fieldName:'Description',eventType:'field_changed',before:'old',after:'new'})),work);
 await test('R46-01 ADF, literal source, compact-only and original trace identity',()=>{
  assert.equal(commentTextV046({body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'hello'}]},{type:'paragraph',content:[{type:'text',text:'world'}]}]}}),'hello\nworld');
  assert.equal(commentTextV046({body:'literal \\r\\n <img onerror=x>'}),'literal \\r\\n <img onerror=x>');
  const trace={reference:{fieldName:'Description',eventType:'field_changed'},diff:{diffHunks:[{lines:[{kind:'delete',text:'old'},{kind:'insert',text:'new'}]}]}};
  const original=JSON.stringify(trace),row={id:'compact',fieldName:'Description',contentSource:'ANALYSIS_TIME',...projection.traceContentV043(trace)};
  const m=presentationMetricsV046(row);assert.equal(m.addedLineCount,1);assert.equal(m.removedLineCount,1);assert.equal(m.beforeAvailability,'UNAVAILABLE');assert.equal(JSON.stringify(trace),original);
  assert.equal(presentationMetricsV046({...row,contentSource:'RAW_EVENT'}).addedLineCount,null);
 });
 await test('R46-04 same pending promise, valid cache reuse and explicit invalidation',async()=>{
  let jobs=0;const execute=()=>{jobs++;return service.run(1,{requestId:'pending',kind:'integrated',action:'query',raw,ai:null,query:{visibleFields:[]}});};
  const a=cache.acquireAiResultV045('a','same','pending',execute),b=cache.acquireAiResultV045('a','same','duplicate',execute);assert.equal(a.entry.promise,b.entry.promise);await a.entry.promise;
  assert.equal(cache.acquireAiResultV045('a','same','again',execute).reused,true);assert.equal(jobs,1);
  const refreshed=cache.acquireAiResultV045('a','same','pending',execute,true);await refreshed.entry.promise;assert.equal(jobs,2);
  return {jobs,cache:cache.aiResultCacheStateV045()};
 });
 await test('R46-06 stopped cancellation target vs superseded queued work and real SQL error',async()=>{
  const base={kind:'integrated',action:'query',raw,ai:null,query:{visibleFields:[]}};
  const outcomes=[service.run(2,{...base,requestId:'cancel-target'}),service.run(2,{...base,requestId:'queued'})].map(p=>p.then(()=> 'SUCCEEDED',e=>e.message));
  const receipt=await service.cancel(2,'cancel-target');assert.equal(receipt.executorStopped,true);assert.deepEqual(await Promise.all(outcomes),['CANCELLED','SUPERSEDED']);
  const invalid=path.join(work,'invalid.sqlite');new DatabaseSync(invalid).close();
  await assert.rejects(service.run(3,{...base,raw:invalid,requestId:'sql-error'}),/no such table/);
  return {receipt,outcomes:['CANCELLED','SUPERSEDED'],sqlFailurePreserved:true};
 });
 await test('R46-07 all four export scopes/formats preserve before/after and reject stale snapshot',()=>{
  const q={pageSize:20,visibleFields:[]},page=query.queryResultsV043('integrated',null,raw,q);
  for(const format of ['json','csv'])for(const visible of [['issueKey','before','after'],undefined]){
   const file=path.join(work,`${format}-${visible?'visible':'all'}.${format}.partial`);const receipt=query.writeQueryExportV044('integrated',null,raw,{...q,expectedSnapshot:page.generation},visible,file,format);assert.equal(receipt.filteredCount,80);
   if(format==='json'){const result=JSON.parse(fs.readFileSync(file));assert.equal(result.rows.length,80);assert.equal(result.scope,visible?'visible-columns':'all-fields');if(visible)assert.equal(result.fields.length,3);}
  }
  assert.throws(()=>query.writeQueryExportV044('integrated',null,raw,{...q,expectedSnapshot:'stale'},undefined,path.join(work,'invalid.json.partial'),'json'),/EXPORT_SNAPSHOT_CHANGED/);
 });
 await test('R46-07 both Golden package versions use real importer, transaction and trace readback',()=>{
  const base=path.join(root,'tests/fixtures/v0.3.43');
  for(const [name,count] of [['v201/package-review-completed-55.json',55],['legacy_v200/jaa-ai-analysis-package-v2__ai-only__golden-44.json',44]]){
   const ai=path.join(work,'ai-'+count+'.sqlite');store.initializeAiDatabaseV042({databasePath:ai});
   const options={databasePath:ai,packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json'),packagePath:path.join(base,name)};
   store.importAiAnalysisPackageV042(options);store.importAiAnalysisPackageV042(options);
   const db=new DatabaseSync(ai,{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_records').get().n,count);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
   const input=JSON.parse(fs.readFileSync(options.packagePath));const traces=db.prepare('SELECT source_trace_json FROM ai_record_source_traces').all().map(r=>JSON.parse(r.source_trace_json));for(const r of input.records)assert.ok(traces.some(t=>JSON.stringify(t)===JSON.stringify(r.sourceTrace)));db.close();
   query.queryResultsV043('ai',ai,null,{visibleFields:[]});
  }
 });
}
main().catch(e=>{checks.push({status:'FAIL',error:e.stack});process.exitCode=1;}).finally(async()=>{query.invalidateAiResultsV043();await service.close();const report={checks,resources:service.diagnostics(),finishedAt:new Date().toISOString()};fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({work,...report},null,2));});
