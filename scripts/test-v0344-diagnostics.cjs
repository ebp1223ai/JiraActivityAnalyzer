const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,load}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.44',`diagnostics-${Date.now()}`),results=[],writers=[];
const {DiagnosticWriterV044}=load('electron/diagnosticWriterV044.ts',work),{AutomaticDiagnosticsV044}=load('electron/automaticDiagnosticsV044.ts',work),{createEnvelopeProducerV044}=load('electron/diagnosticEnvelopeV044.ts',work);
const build={version:'0.3.44',sourceCommit:null,buildTime:null};
const producer=createEnvelopeProducerV044({sessionId:'app-session-cap',instanceId:'active',processType:'main',build});
const bytes=p=>fs.statSync(p).isDirectory()?fs.readdirSync(p).reduce((sum,n)=>sum+bytes(path.join(p,n)),0):fs.statSync(p).size;
async function test(name,fn){const started=performance.now();try{const detail=await fn();results.push({name,status:'PASS',durationMs:performance.now()-started,detail});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',durationMs:performance.now()-started,error:e.stack});throw e;}}
async function main(){
  await test('Normal shutdown drains in-flight IPC and cancels interrupted renderer exactly once',async()=>{
    const logsDir=path.join(work,'shutdown');const d=new AutomaticDiagnosticsV044({logsDir,sessionId:'app-session-shutdown',build,filename:path.join(root,'dist-electron/diagnostic-writer-v044.cjs')});assert.equal(await d.ready,true);
    const context={operationId:'navigation',spanId:'navigation-span',parentSpanId:null,route:'/database'};
    await d.event('navigation-shell','START',{},context);
    const task=d.operation('synthetic-async-command',async()=>{await new Promise(r=>setTimeout(r,150));return {ok:true};});
    await new Promise(r=>setTimeout(r,30));d.beginShutdown();await d.close();assert.equal((await task).ok,true);
    assert.equal(await d.event('navigation-shell','END',{},context,'SUCCEEDED'),false,'late END must not duplicate shutdown terminal');
    const dir=path.join(logsDir,'sessions','app-session-shutdown');const summary=JSON.parse(fs.readFileSync(path.join(dir,'automatic-summary.json')));assert.equal(summary.status,'closed');assert.deepEqual(summary.openSpans,{});
    const events=fs.readdirSync(dir).filter(n=>/^automatic-.*ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(dir,n),'utf8').trim().split('\n').map(JSON.parse));
    const ends=events.filter(e=>e.event==='navigation-shell'&&e.phase==='END');assert.equal(ends.length,1);assert.equal(ends[0].outcome,'CANCELLED');
    assert.ok(events.some(e=>e.event==='synthetic-async-command'&&e.phase==='END'&&e.outcome==='SUCCEEDED'));
  });
  await test('Windows summary sharing denial retries bounded; persistent EACCES remains degraded',async()=>{
    const writer=new DiagnosticWriterV044({logsDir:path.join(work,'rename-test'),sessionId:'app-session-rename',instanceId:'rename',mainPid:process.pid,build:{version:'0.3.44',sourceCommit:null,buildTime:null}});await writer.start();
    const original=fs.renameSync;let attempts=0;const event={schemaVersion:'jaa-diagnostic-event-v1',phase:'POINT',event:'synthetic-rename'};
    try{fs.renameSync=(a,b)=>{if(String(b).endsWith('automatic-summary.json')&&attempts++<2)throw Object.assign(Error('SYNTHETIC_SHARING_DENIAL'),{code:'EPERM'});return original(a,b);};assert.equal(writer.record(event,true),true);assert.ok(attempts>=3);
      fs.renameSync=()=>{throw Object.assign(Error('SYNTHETIC_READ_ONLY'),{code:'EACCES'});};const at=performance.now();assert.equal(writer.record(event,true),false);assert.ok(performance.now()-at<1000);assert.equal(writer.summary.writerFailed,true);assert.equal(writer.summary.lastError,'EACCES');
    }finally{fs.renameSync=original;writer.close(true);}
  });
  await test('T44-14/15 stalled writer bounded 4MiB queue, 2s degradation, dropped counters',async()=>{
    const d=new AutomaticDiagnosticsV044({logsDir:path.join(work,'stalled'),sessionId:'app-session-stalled',build,filename:path.join(root,'tests/fixtures/v0.3.44/stalled-diagnostic-writer.cjs')});writers.push(d);assert.equal(await d.ready,true);
    const payload={values:Array.from({length:8},()=> 'x'.repeat(1300))};const start=performance.now();
    const outcomes=await Promise.all(Array.from({length:600},()=>d.event('queue-test','PROGRESS',payload)));
    const state=d.snapshot();assert.ok(outcomes.includes(false));assert.equal(state.status,'DIAGNOSTICS_DEGRADED');assert.ok(state.droppedEventCount>0);assert.ok(state.flushTimeout>0);assert.ok(state.queueHighWater<=4*1024**2);assert.equal(state.queueBytes,0);assert.ok(performance.now()-start<4000);
    return {dropped:state.droppedEventCount,timeouts:state.flushTimeout,highWater:state.queueHighWater,elapsedMs:performance.now()-start};
  });
  await test('T44-23 reduced quota cleans normal then old abnormal, preserves live and audit',async()=>{
    const logsDir=path.join(work,'quota');
    for(const [id,status,startedAt] of [['normal','closed','2026-01-01T00:00:00Z'],['abnormal','unclean','2026-01-02T00:00:00Z'],['latest','closed',new Date().toISOString()]]){
      const dir=path.join(logsDir,'sessions','app-session-'+id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'automatic-summary.json'),JSON.stringify({sessionId:'app-session-'+id,instanceId:id,status,startedAt}));fs.writeFileSync(path.join(dir,'automatic-0001.ndjson'),'x'.repeat(128*1024));
    }
    const old=path.join(logsDir,'old.log');fs.writeFileSync(old,'old ordinary log');fs.utimesSync(old,new Date('2025-01-01'),new Date('2025-01-01'));
    const writer=new DiagnosticWriterV044({logsDir,sessionId:'app-session-cap',instanceId:'active',mainPid:process.pid,build,testMode:true,limits:{quotaBytes:256*1024,reserveBytes:32*1024,chunkBytes:8*1024,normalCount:1,abnormalCount:0}});writers.push(writer);await writer.start();
    assert.equal(writer.summary.cleanup[0].reason,'GLOBAL_LOG_AGE');assert.equal(fs.existsSync(old),false);assert.ok(writer.summary.cleanup.some(e=>e.sessionId==='app-session-normal'));assert.ok(writer.summary.cleanup.some(e=>e.sessionId==='app-session-abnormal'));
    assert.ok(fs.existsSync(writer.sessionDir));
    for(let i=0;i<400;i++)writer.record(producer('quota-progress','POINT',null,{data:'x'.repeat(1000)}));
    assert.ok(writer.summary.droppedEventCount>0);assert.ok(bytes(logsDir)<=256*1024);
    await writer.retention();assert.ok(writer.summary.cleanup.some(e=>e.reason==='ACTIVE_COMPLETED_CHUNK_QUOTA'));assert.ok(fs.existsSync(path.join(writer.sessionDir,'automatic-summary.json')));assert.equal(writer.summary.retainedTimelineIsPartial,true);
    return {bytes:bytes(logsDir),dropped:writer.summary.droppedEventCount,cleanup:writer.summary.cleanup};
  });
  await test('T44-21 suspend/resume observations remain unknown rather than invented crash',async()=>{
    const writer=new DiagnosticWriterV044({logsDir:path.join(work,'sleep'),sessionId:'app-session-sleep',instanceId:'sleep',mainPid:process.pid,build});writers.push(writer);await writer.start();writer.suspend(true);writer.tick();writer.suspend(false);writer.tick();assert.equal(writer.summary.rootCause,'UNKNOWN');assert.equal(writer.summary.status,'running');
  });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const w of writers)await w.close(true);fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({results},null,2));console.log('Evidence '+work);});
