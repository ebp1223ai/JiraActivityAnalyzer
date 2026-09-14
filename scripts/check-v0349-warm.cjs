const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,load}=require('./v0343-test-helpers.cjs');
const work=path.resolve(process.argv[2]);
if(!work.startsWith(path.join(root,'test-artifacts/v0.3.49')+path.sep))throw Error('SYNTHETIC_EVIDENCE_REQUIRED');
process.env.JAA_PROJECTION_ROOT=path.join(work,'sidecar');
const q=load('electron/aiResultsQueryV043.ts',path.join(work,'final-reader')),results=[];
const core=['eventTime','action','issueKey','analysisStatus','skillId','computed:["manual","state"]'];
try{
 for(const total of [40000,100000]){
  const seed=JSON.parse(fs.readFileSync(path.join(work,String(total),'seed-result.json')));
  const start=performance.now(),first=q.queryResultsV043('integrated',seed.ai,seed.raw,{visibleFields:core});assert.equal(first.totalCount,total);
  results.push({name:total+' reopen existing generation',status:'PASS',ms:performance.now()-start,generation:first.generation,fieldCount:first.fieldCatalog.length,memory:process.memoryUsage()});
  if(total===40000){assert.ok(first.fieldCatalog.filter(f=>f.label.includes('unused')).length>=520);results.push({name:'520 unused fields exist without page hydration',status:'PASS',heavyRows:first.readPath.heavyRowsHydrated});}
  q.distinctResultsV043('integrated',seed.ai,seed.raw,'issueKey',{});
  for(const [name,fn,limit] of [
   ['cached dropdown',()=>q.distinctResultsV043('integrated',seed.ai,seed.raw,'issueKey',{}),800],
   ['page-bounded AI and Raw heavy',()=>{const r=q.queryResultsV043('integrated',seed.ai,seed.raw,{visibleFields:[...core,'before'],pageSize:50});assert.equal(r.readPath.heavyRowsHydrated,50);assert.ok(r.readPath.aiRecordsHydrated<=50);return r;},3000],
   ['final page',i=>q.queryResultsV043('integrated',seed.ai,seed.raw,{page:i+1,visibleFields:core}),1200],
   ['uncached core dropdown',i=>q.distinctResultsV043('integrated',seed.ai,seed.raw,'action',{},'search-'+i),2000]
  ]){const samples=[];for(let i=0;i<7;i++){const t=performance.now();fn(i);samples.push(performance.now()-t);}const sorted=[...samples].sort((a,b)=>a-b);results.push({name:total+' '+name,status:sorted[6]>limit?'FAIL':'PASS',samples,p50:sorted[3],p95:sorted[6],limit});}
  results.push({name:total+' query plans',status:'PASS',diagnostics:q.latestQueryDiagnosticsV043(),memory:process.memoryUsage()});q.invalidateAiResultsV043();
 }
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}catch(error){results.push({name:'final warm checks',status:'FAIL',error:error.stack});console.error(error);process.exitCode=1;}finally{q.invalidateAiResultsV043();const report=path.join(work,'final-warm-'+Date.now()+'.json');fs.writeFileSync(report,JSON.stringify({results,work},null,2));console.log(JSON.stringify(results.filter(r=>r.p95),null,2));console.log('Warm evidence '+report);}
