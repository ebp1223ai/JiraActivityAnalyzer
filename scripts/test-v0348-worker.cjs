const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{root,load}=require('./v0343-test-helpers.cjs');
const {seed,importAndLink,boundaries}=require('./v0348-test-seed.cjs');
const work=path.join(root,'test-artifacts/v0.3.48','worker-'+Date.now());fs.mkdirSync(work,{recursive:true});
const worker=path.join(work,'worker.cjs');require('esbuild').buildSync({entryPoints:[path.join(root,'electron/aiResultsWorkerV044.ts')],outfile:worker,bundle:true,platform:'node',format:'cjs',packages:'external'});
const {AiResultsServiceV044}=load('electron/aiResultsServiceV044.ts',work),service=new AiResultsServiceV044(worker),results=[];
const s=importAndLink(work,seed(work));const db=new DatabaseSync(s.raw),guard=boundaries.find(c=>c.source==='RAW'&&c.expected.distance===1414);
for(let i=65;i<90;i++)db.prepare("UPDATE activity_events SET field_id='description',field_name='Description',event_type='field_changed',from_value_json=?,to_value_json=? WHERE id=?").run(JSON.stringify(guard.before),JSON.stringify(guard.after),'raw-'+i);db.close();
const input=id=>({requestId:id,action:'query',kind:'integrated',ai:s.ai,raw:s.raw,query:{pageSize:25,visibleFields:[]},diagnostic:{sessionId:'synthetic',instanceId:'synthetic',build:{appVersion:'0.3.48'},context:{operationId:randomUUID(),spanId:randomUUID(),parentSpanId:null}}});
function complete(stages){const open=new Set();for(const e of stages){const id=e.envelope?.spanId||e.event;if(e.phase==='START'){assert.ok(!open.has(id));open.add(id);}if(e.phase==='END'){assert.ok(open.delete(id),'unmatched END '+e.event);}}assert.equal(open.size,0,'open children');}
(async()=>{try{
 let stages=[];const t=performance.now(),r=await service.run(1,input('normal'),e=>{stages.push(e);return true;});assert.equal(r.totalCount,120);assert.equal(r.warningCount,28);complete(stages);
 const samples=stages.filter(e=>e.event==='description-diff-guard');assert.equal(samples.length,20);const summary=stages.find(e=>e.event==='description-diff-summary');assert.ok(summary);assert.equal(summary.details.totalGuardCount,28);assert.equal(summary.details.truncatedCount,8);
 assert.ok(samples.every(e=>e.details.beforeSha256&&e.details.afterSha256&&e.details.distance===1414));assert.ok(!JSON.stringify(samples).includes(guard.before));results.push({name:'T48-16/18 actual worker success terminal spans and bounded guard log',status:'PASS',ms:performance.now()-t,samples:samples.map(e=>e.details),summary:summary.details});
 await service.close();
 for(const reason of ['CANCELLED','SUPERSEDED']){
  stages=[];let stop,scheduled=false;const a=service.run(2,input('stop-'+reason),e=>{stages.push(e);if(e.phase==='START'&&!scheduled){scheduled=true;stop=new Promise(resolve=>setImmediate(()=>resolve(service.cancel(2,'stop-'+reason,reason))));}return true;}).then(()=>{throw Error('unexpected success')},e=>e.message);
  const b=service.run(2,input('queued-'+reason),()=>true).then(()=>{throw Error('unexpected queued success')},e=>e.message);
  assert.equal(await a,reason);assert.equal(await b,'SUPERSEDED');await stop;complete(stages);assert.ok(stages.some(e=>e.phase==='END'&&e.details.executorStopped===true));assert.equal(service.diagnostics().pendingCount,0);assert.equal(service.diagnostics().executorCount,0);
  results.push({name:'T48-16/17 '+reason+' real executor termination, queued supersession, no late result',status:'PASS',stages:stages.map(e=>({event:e.event,phase:e.phase,envelope:e.envelope,details:e.details}))});
 }
 const broken=new AiResultsServiceV044(path.join(work,'missing-worker.cjs'));await assert.rejects(broken.run(3,input('crash')),/Cannot find module/);await broken.close();results.push({name:'T48-16 abnormal worker startup exit is not success',status:'PASS'});
}catch(e){results.push({name:'worker',status:'FAIL',error:e.stack});console.error(e);process.exitCode=1;}finally{await service.close();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({work,results},null,2));console.log('Evidence '+work);}})();
