const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,load,seedRaw}=require('./v0343-test-helpers.cjs');
const {DatabaseSync}=require('node:sqlite');
const work=path.join(root,'test-artifacts/v0.3.44',`correctness-${Date.now()}`);
const store=load('electron/aiAnalysisDatabaseV042.ts',work),query=load('electron/aiResultsQueryV043.ts',work);
const {AiWriteServiceV044}=load('electron/aiWriteServiceV044.ts',work),{AiResultsServiceV044}=load('electron/aiResultsServiceV044.ts',work);
const {AutomaticDiagnosticsV044}=load('electron/automaticDiagnosticsV044.ts',work),{recoverDiagnosticSessionV044}=load('electron/diagnosticRecoveryV044.ts',work);
const {tableCsvV043}=load('electron/aiTableExportV043.ts',work);
const opts={packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
const pkg=path.join(root,'tests/fixtures/v0.3.43/v201/package-ai-only-55.json');
const results=[],writers=[],services=[];
async function test(name,fn){const at=performance.now();try{const detail=await fn();results.push({name,status:'PASS',durationMs:performance.now()-at,detail});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',durationMs:performance.now()-at,error:e.stack});throw e;}}
const ai=path.join(work,'ai.sqlite'),raw=path.join(work,'raw.sqlite');
async function main(){
  await test('Transaction cancellation after writes rolls back all tables',()=>{
    store.initializeAiDatabaseV042({databasePath:ai});let points=0;
    assert.throws(()=>store.importAiAnalysisPackageV042({...opts,databasePath:ai,packagePath:pkg,isCancelled:()=>++points===20}),/CANCELLED/);
    assert.equal(store.inspectAiDatabaseV042(ai).recordCount,0);
    const db=new DatabaseSync(ai,{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_import_batches').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
  });
  await test('Commit-barrier cancellation rolls back; successful retry exact 55/130',()=>{
    assert.throws(()=>store.importAiAnalysisPackageV042({...opts,databasePath:ai,packagePath:pkg,beforeCommit:()=>{throw Error('CANCELLED');}}),/CANCELLED/);
    assert.equal(store.inspectAiDatabaseV042(ai).recordCount,0);
    const result=store.importAiAnalysisPackageV042({...opts,databasePath:ai,packagePath:pkg});assert.equal(result.readBack.traces,55);assert.equal(result.readBack.findings,130);
  });
  await test('Production worker cancellation acknowledges request separately and leaves DB intact',async()=>{
    const db=path.join(work,'cancel.sqlite');store.initializeAiDatabaseV042({databasePath:db});
    const service=new AiWriteServiceV044(path.join(root,'dist-electron/ai-write-worker-v044.cjs'));services.push(service);
    const result=service.run(1,{requestId:'cancel-before-open',action:'import',input:{...opts,databasePath:db,packagePath:pkg}}).then(()=>null,e=>e.message);
    const cancel=service.cancel(1,'cancel-before-open');assert.equal(cancel.requested,true);assert.equal(cancel.cancelled,false);assert.equal(await result,'CANCELLED');assert.equal(store.inspectAiDatabaseV042(db).recordCount,0);
    assert.equal(service.state().running,false);
    let late;
    const committed=await service.run(1,{requestId:'commit-late',action:'import',input:{...opts,databasePath:db,packagePath:pkg}},progress=>{if(progress.stage==='commit-barrier')late=service.cancel(1,'commit-late');});
    assert.equal(late.requested,false);assert.equal(late.reason,'CANCEL_TOO_LATE_COMMIT_BARRIER');assert.equal(committed.insertedCount,55);assert.equal(store.inspectAiDatabaseV042(db).recordCount,55);
  });
  await test('Streaming JSON / CSV exactly preserve filtered full-scope export contract',()=>{
    seedRaw(raw,JSON.parse(fs.readFileSync(pkg)).records,work);
    const filter={page:2,pageSize:25,sort:{field:'issueKey',direction:'asc'}};
    const fields=['issueKey','confidence','sourceTrace'];
    const expected=query.exportResultsV043('ai',ai,raw,filter,fields);
    const json=path.join(work,'export.json.partial'),csv=path.join(work,'export.csv.partial');
    const receipt=query.writeQueryExportV044('ai',ai,raw,filter,fields,json,'json');assert.equal(receipt.filteredCount,55);
    assert.deepEqual(JSON.parse(fs.readFileSync(json)),expected);
    query.writeQueryExportV044('ai',ai,raw,filter,fields,csv,'csv');assert.equal(fs.readFileSync(csv,'utf8'),tableCsvV043(expected));
  });
  await test('Worker stage START durable before SQL with real worker producer identity',async()=>{
    const logsDir=path.join(work,'durability');const diag=new AutomaticDiagnosticsV044({logsDir,sessionId:'app-session-worker-ack',build:{version:'0.3.44',sourceCommit:null,buildTime:null},filename:path.join(root,'dist-electron/diagnostic-writer-v044.cjs')});writers.push(diag);assert.equal(await diag.ready,true);
    const service=new AiResultsServiceV044(path.join(root,'dist-electron/ai-results-worker-v044.cjs'));services.push(service);
    let starts=0;
    await service.run(1,{requestId:'durable',action:'query',kind:'integrated',ai,raw,query:{pageSize:25,visibleFields:[]},diagnostic:{...diag.config,instanceId:diag.instanceId,context:{operationId:'operation',spanId:'ipc-span',parentSpanId:null,route:'/integrated-results'}}},async stage=>{
      const result=await diag.stage(undefined,stage);
      if(stage.phase==='START') {starts++;const summary=JSON.parse(fs.readFileSync(path.join(logsDir,'sessions','app-session-worker-ack','automatic-summary.json')));assert.ok(summary.openSpans[stage.envelope.spanId]);assert.equal(stage.envelope.processType,'worker');}
      return result;
    });assert.ok(starts>=2);return {durableStageStarts:starts};
  });
  await test('Recovery reads complete UTF-8 lines, ignores truncated tail without rewriting evidence',()=>{
    const dir=path.join(work,'partial');fs.mkdirSync(dir);const file=path.join(dir,'automatic-0001.ndjson');
    const event={schemaVersion:'jaa-diagnostic-event-v1',sessionId:'app-session-partial',instanceId:'one',timestampUtc:'2026-09-07T00:00:00Z',phase:'START',spanId:'s',route:'/database',details:{value:'資料'.repeat(12000)}};
    const body=JSON.stringify(event)+'\n{"incomplete":';fs.writeFileSync(file,body);const result=recoverDiagnosticSessionV044(dir);assert.equal(result.openSpans.s.details.value,event.details.value);assert.equal(result.malformedLines,1);assert.equal(fs.readFileSync(file,'utf8'),body);
  });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{query.invalidateAiResultsV043();for(const s of services)await s.close();for(const w of writers)await w.close();fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({results},null,2));console.log('Evidence '+work);});
