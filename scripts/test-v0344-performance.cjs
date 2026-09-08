const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {root,load,seedRaw}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.44',`performance-${Date.now()}`);
const {AiResultsServiceV044}=load('electron/aiResultsServiceV044.ts',work),{AutomaticDiagnosticsV044}=load('electron/automaticDiagnosticsV044.ts',work);
const result={results:[],hardware:{cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),node:process.version,os:os.release()}};
const services=[],writers=[];
const service=()=>{const s=new AiResultsServiceV044(path.join(root,'dist-electron/ai-results-worker-v044.cjs'));services.push(s);return s;};
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
async function test(name,fn){const started=performance.now();try{const detail=await fn();result.results.push({name,status:'PASS',durationMs:performance.now()-started,detail});console.log('PASS '+name);}catch(e){result.results.push({name,status:'FAIL',durationMs:performance.now()-started,error:e.stack});throw e;}}
async function main(){
  const base=path.join(root,'test-artifacts/v0.3.44');
  const latest=fs.readdirSync(base).filter(n=>n.startsWith('services-')&&fs.existsSync(path.join(base,n,'ai55.sqlite'))&&fs.existsSync(path.join(base,n,'results.json'))).sort().at(-1);assert.ok(latest,'run test:v0.3.44 first');
  const raw=path.join(base,latest,'100k.sqlite'),ai=path.join(base,latest,'ai55.sqlite');
  await test('T44-30 five paired 100k/55 cold-worker production diagnostics ON/OFF',async()=>{
    const pairs=[];
    for(let i=0;i<5;i++){
      const pair={};
      for(const enabled of i%2?[true,false]:[false,true]){
        const s=service(),d=enabled?new AutomaticDiagnosticsV044({logsDir:path.join(work,'logs-'+i),sessionId:'app-session-pair-'+i,build:{version:'0.3.44',sourceCommit:null,buildTime:null},filename:path.join(root,'dist-electron/diagnostic-writer-v044.cjs')}):null;
        if(d){writers.push(d);assert.equal(await d.ready,true);}
        const at=performance.now(),cpu=process.cpuUsage();
        const query=await s.run(1,{requestId:'pair-'+i+'-'+enabled,kind:'integrated',action:'query',raw,ai,query:{pageSize:25,visibleFields:[]},diagnostic:d?{...d.config,instanceId:d.instanceId,context:{operationId:'pair-'+i,spanId:'root',parentSpanId:null,route:'/integrated-results'}}:null},stage=>d?.stage(undefined,stage));
        const elapsed=performance.now()-at;assert.equal(query.totalCount,100000);assert.equal(query.matchedCount,55);
        pair[enabled?'on':'off']={elapsedMs:elapsed,cpu:process.cpuUsage(cpu),memory:s.diagnostics().memory};await s.close();await d?.close();
      }
      pairs.push(pair);
    }
    const on=median(pairs.map(p=>p.on.elapsedMs)),off=median(pairs.map(p=>p.off.elapsedMs)),overheadMs=on-off,overheadPercent=100*overheadMs/off;
    fs.writeFileSync(path.join(work,'overhead.json'),JSON.stringify({pairs,on,off,overheadMs,overheadPercent},null,2));
    assert.ok(off<100?overheadMs<=10:overheadPercent<=10,JSON.stringify({on,off,overheadPercent}));return {pairs,medianOnMs:on,medianOffMs:off,overheadPercent};
  });
  await test('T44-29 twenty query/filter/cancel executor cycles have bounded resources',async()=>{
    const s=service();const query=async(id,filter)=>s.run(1,{requestId:id,kind:'integrated',action:'query',raw,ai,query:{pageSize:25,visibleFields:[],filters:filter?{issueKey:{text:'SYN-99999',operator:'exact'}}:{}}});
    await query('warm',true);const before=s.diagnostics().memory;const samples=[];
    for(let i=0;i<20;i++){const q=await query('loop-'+i,i%2);assert.equal(q.totalCount,100000);assert.equal(s.diagnostics().pendingCount,0);samples.push(s.diagnostics().memory);}
    const after=samples.at(-1),growth=after.heapUsed-before.heapUsed,limit=Math.max(before.heapUsed*.2,32*1024**2);assert.ok(growth<=limit,JSON.stringify({before,after,growth,limit}));
    for(let i=0;i<20;i++){const pending=s.run(2,{requestId:'stop-'+i,kind:'integrated',action:'query',raw,ai,query:{visibleFields:[]}}).catch(e=>e.message);await s.cancel(2,'stop-'+i);assert.equal(await pending,'CANCELLED');assert.equal(s.diagnostics().executorCount,1);}
    return {before,after,growth,limit,samples,remainingExecutors:s.diagnostics().executorCount,pending:s.diagnostics().pendingCount};
  });
  await test('T44-28 1000 events with 64KiB before/after remain lossless and page-bounded',async()=>{
    const longRaw=path.join(work,'long.sqlite'),before='0123456789abcdef'.repeat(4096),after=before.slice(0,-8)+'MODIFIED';
    seedRaw(longRaw,Array.from({length:1000},(_,i)=>({id:'long-'+i,issue:'LONG-'+i,actor:'Synthetic',eventTime:'2026-09-07T00:00:00Z',before,after,fieldId:'description',fieldName:'Description',eventType:'field_changed',sourceProvenance:'Jira Changelog'})),work,'long-diff');
    const s=service(),at=performance.now();const q=await s.run(3,{requestId:'long',kind:'integrated',action:'query',raw:longRaw,ai:null,query:{pageSize:25,visibleFields:[]}});
    assert.equal(q.totalCount,1000);assert.equal(q.rows.length,25);assert.equal(q.rows[0].before,before);assert.equal(q.rows[0].after,after);return {firstPageMs:performance.now()-at,bytesPerSide:Buffer.byteLength(before),memory:s.diagnostics().memory,rawBytes:fs.statSync(longRaw).size,rendererLazyDiff:'requires separate UI assertion'};
  });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const s of services)await s.close();for(const d of writers)await d.close();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(result,null,2));console.log('Evidence '+work);});
