const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { root, load, seedRaw } = require('./v0343-test-helpers.cjs');
const { DatabaseSync } = require('node:sqlite');
const version = process.env.JAA_TEST_VERSION || '0.3.44';
const work = path.join(root, 'test-artifacts', 'v'+version, `services-${Date.now()}`);
const query = load('electron/aiResultsQueryV043.ts', work);
const { AiResultsServiceV044 } = load('electron/aiResultsServiceV044.ts', work);
const { DiagnosticWriterV044 } = load('electron/diagnosticWriterV044.ts', work);
const { createEnvelopeProducerV044, redactDiagnosticsV044 } = load('electron/diagnosticEnvelopeV044.ts', work);
const results = [];
async function test(name, fn) { const start=performance.now(); try { const detail=await fn(); results.push({name,status:'PASS',durationMs:performance.now()-start,detail}); console.log('PASS '+name); } catch(error) { results.push({name,status:'FAIL',durationMs:performance.now()-start,error:error.stack}); throw error; } }
const build={version,sourceCommit:null,buildTime:null};
const producer=createEnvelopeProducerV044({sessionId:'app-session-test',instanceId:'instance-test',processType:'main',build});
const context={operationId:'op',spanId:'span',parentSpanId:null,route:'/integrated-results'};
const writers=[];
let service;
async function main(){
  await test('D44 redaction bounded cyclic/BigInt/oversize and schema envelope',()=>{
    const data={token:'secret-canary',authorization:'Bearer another-canary',before:'private Jira content',list:[],n:3n}; data.list.push(data);
    const safe=JSON.stringify(redactDiagnosticsV044(data)); assert.ok(!safe.includes('secret-canary')&&!safe.includes('private Jira'));
    assert.ok(Buffer.byteLength(JSON.stringify(redactDiagnosticsV044({value:'x'.repeat(100000)})))<16384);
    const e=producer('read','START',context); assert.equal(e.schemaVersion,'jaa-diagnostic-event-v1');assert.equal(e.operationId,'op');assert.ok(e.producerSeq>0);
  });
  await test('D44 critical fsync, incomplete recovery and live-instance distinction',async()=>{
    const logsDir=path.join(work,'logs');
    const first=new DiagnosticWriterV044({logsDir,sessionId:'app-session-one',instanceId:'one',mainPid:process.pid,build});writers.push(first);await first.start();
    assert.equal(first.record(producer('query','START',context),true),true);
    const live=new DiagnosticWriterV044({logsDir,sessionId:'app-session-two',instanceId:'two',mainPid:process.pid,build});writers.push(live);await live.start();assert.equal(live.summary.previous,null);live.close(true);
    first.close(false);
    const next=new DiagnosticWriterV044({logsDir,sessionId:'app-session-three',instanceId:'three',mainPid:process.pid,build});writers.push(next);await next.start();assert.equal(next.summary.previous.rootCause,'UNKNOWN');assert.ok(next.summary.previous.openSpans.span);assert.equal(next.summary.previous.autoReplay,false);next.close(true);
  });
  await test('D44 ENOSPC degraded rather than crashing',async()=>{
    const writer=new DiagnosticWriterV044({logsDir:path.join(work,'full'),sessionId:'app-session-full',instanceId:'full',mainPid:process.pid,build,testMode:true,failWrites:true});writers.push(writer);await writer.start();assert.equal(writer.record(producer('start','START',context),true),false);assert.equal(writer.summary.writerFailed,true);assert.ok(writer.summary.writeErrorCount>0);writer.close(false);
  });
  const raw=path.join(work,'100k.sqlite'), ai100=path.join(work,'ai55.sqlite');
  const store=load('electron/aiAnalysisDatabaseV042.ts',work),fixture=path.join(root,'tests/fixtures/v0.3.43/v201/package-ai-only-55.json'),package55=JSON.parse(fs.readFileSync(fixture));
  await test('T44-27 seed true production Raw 100000, late-only field at 100000',()=>{
    const records=Array.from({length:100000},(_,i)=>({id:`stress-${i}`,issue:`SYN-${i}`,actor:`User-${i%100}`,eventTime:new Date(1788739200000+i*1000).toISOString(),before:'original',after:i===99999?{value:'after',lateOnly:'tail-100000'}:'after'}));
    records.splice(0,55,...package55.records);
    seedRaw(raw,records,work,'synthetic-v043-db');
    store.initializeAiDatabaseV042({databasePath:ai100});
    store.importAiAnalysisPackageV042({databasePath:ai100,packagePath:fixture,packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')});
    const aiDB=new DatabaseSync(ai100);for(const row of aiDB.prepare('SELECT ai_record_id,record_index FROM ai_records').all()){const record=package55.records[row.record_index];store.recordSourceLinkAttemptV042({databasePath:ai100,aiRecordId:row.ai_record_id,rawDatabaseIdentity:'synthetic-v043-db',record,candidates:[{activityEventId:record.sourceTrace.reference.activityEventId}]});}aiDB.close(); const db=new DatabaseSync(raw,{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM activity_events').get().n,100000);db.close();
  });
  await test('T44-27 complete Raw first page worker/main responsiveness + timing',async()=>{
    service=new AiResultsServiceV044(path.join(root,'dist-electron/ai-results-worker-v044.cjs'));
    const stages=[],delays=[];let last=performance.now();const tick=setInterval(()=>{const now=performance.now();delays.push(now-last-20);last=now;},20);
    const started=performance.now();const result=await service.run(1,{requestId:'stress100k',kind:'integrated',action:'query',ai:ai100,raw,query:{page:1,pageSize:25,visibleFields:[]}},s=>stages.push({event:s.event,phase:s.phase,details:s.details}));clearInterval(tick);
    const durationMs=performance.now()-started;assert.equal(result.totalCount,100000);assert.equal(result.matchedCount,55);assert.equal(result.rows.length,25);assert.ok(result.fieldCatalog.some(f=>f.label.endsWith('lateOnly')));assert.ok(durationMs<=5000,'100k/55 first-page exceeded 5 seconds: '+durationMs);assert.ok(delays.length>0);assert.ok(Math.max(...delays)<1000,'main event loop blocked');
    for (const name of ['source-read','mapping-aggregation','field-discovery','snapshot-build']) { assert.equal(stages.filter(s=>s.event===name&&s.phase==='START').length,1); assert.equal(stages.filter(s=>s.event===name&&s.phase==='END').length,1); }
    return {durationMs,targetMs:5000,targetMet:durationMs<=5000,maxEventLoopDelayMs:Math.max(...delays),stages};
  });
  await test('T44-04 complete high-cardinality facet, tail filter and self-exclusion',async()=>{
    const value=await service.run(1,{requestId:'facet100k',kind:'integrated',action:'facet',ai:null,raw,query:{},field:'issueKey',search:''});const check=new DatabaseSync(raw,{readOnly:true});const expected=check.prepare('SELECT COUNT(DISTINCT issue_key) n FROM source_objects').get().n;check.close();assert.equal(value.values.length,expected);assert.ok(expected>99000);
    const result=await service.run(1,{requestId:'tail100k',kind:'integrated',action:'query',ai:null,raw,query:{filters:{issueKey:{text:'SYN-99999',operator:'exact'}},visibleFields:[]}});assert.equal(result.filteredCount,1);assert.equal(result.rows[0].id,'stress-99999');
  });
  await test('T44-06 cancel stops read executor (not only late-response discard)',async()=>{
    const promise=service.run(2,{requestId:'cancel100k',kind:'integrated',action:'query',ai:null,raw,query:{visibleFields:[]}}).then(()=>({unexpected:true}),e=>({error:e.message}));
    await new Promise(r=>setTimeout(r,100));const started=performance.now();const cancelled=await service.cancel(2,'cancel100k');const result=await promise;assert.equal(cancelled.executorStopped,true);assert.equal(result.error,'CANCELLED');assert.ok(performance.now()-started<2000);return {cancelMs:performance.now()-started};
  });
}
main().then(()=>{console.log('v0.3.44 focused services PASS');}).catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{query.invalidateAiResultsV043();await service?.close();for(const writer of writers)writer.close(true);fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({results,hardware:{node:process.version,platform:process.platform,memoryBytes:require('node:os').totalmem(),cpu:require('node:os').cpus()[0].model}},null,2));console.log('Evidence '+work);});
