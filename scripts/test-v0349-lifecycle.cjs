const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{root,load}=require('./v0343-test-helpers.cjs');
const {seed,importAndLink}=require('./v0348-test-seed.cjs');
const work=path.join(root,'test-artifacts/v0.3.49','lifecycle-'+Date.now());fs.mkdirSync(work,{recursive:true});
process.env.JAA_PROJECTION_ROOT=path.join(work,'sidecar');process.env.JAA_UI_TEST_MODE='1';
const q=load('electron/aiResultsQueryV043.ts',work),s=importAndLink(work,seed(work)),results=[];
const worker=path.join(work,'worker.cjs');require('esbuild').buildSync({entryPoints:[path.join(root,'electron/aiResultsWorkerV044.ts')],outfile:worker,bundle:true,platform:'node',format:'cjs',packages:'external'});
const {AiResultsServiceV044}=load('electron/aiResultsServiceV044.ts',work),service=new AiResultsServiceV044(worker);
const input=id=>({requestId:id,action:'query',kind:'integrated',ai:s.ai,raw:s.raw,query:{pageSize:25,visibleFields:[]}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await wait(10);}throw Error('BOUNDED_WAIT_TIMEOUT');}
async function test(name,fn){const start=performance.now();try{await fn();results.push({name,status:'PASS',ms:performance.now()-start});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.stack});throw error;}}
(async()=>{try{
 await test('stale generation / forced rebuild / old generation retained',()=>{
  const first=q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]});const db=new DatabaseSync(s.raw);db.exec("UPDATE activity_events SET actor_display_name='Synthetic Revision' WHERE id='raw-60'");db.close();
  const stale=q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]});assert.equal(stale.projectionStale,true);assert.equal(stale.generation,first.generation);
  q.configureReadProjectionV049('',true);const next=q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]});q.configureReadProjectionV049('',false);assert.notEqual(next.generation,first.generation);assert.equal(next.projectionStale,false);
  assert.ok(fs.existsSync(path.join(process.env.JAA_PROJECTION_ROOT,first.generation+'.sqlite')));
 });
 await test('corrupt/missing/incompatible/incomplete projection recovery',()=>{
  q.invalidateAiResultsV043();const dir=process.env.JAA_PROJECTION_ROOT;
  const catalog=fs.readdirSync(dir).find(f=>f.endsWith('.catalog.sqlite'));const read=()=>{const d=new DatabaseSync(path.join(dir,catalog));try{return JSON.parse(d.prepare('SELECT body FROM projection_metadata').get().body);}finally{d.close();}};
  let metadata=read();fs.writeFileSync(path.join(dir,metadata.activeFile),'synthetic corrupt projection');assert.equal(q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]}).totalCount,120);
  q.invalidateAiResultsV043();metadata=read();fs.unlinkSync(path.join(dir,metadata.activeFile));assert.equal(q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]}).totalCount,120);
  q.invalidateAiResultsV043();metadata=read();const d=new DatabaseSync(path.join(dir,catalog));metadata.projection_format_version='incompatible';metadata.build_generation='unfinished';metadata.build_status='BUILDING';d.prepare('UPDATE projection_metadata SET body=?').run(JSON.stringify(metadata));d.close();assert.equal(q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]}).projectionStale,false);assert.notEqual(read().projection_format_version,'incompatible');
 });
 await test('real worker cancellation and facet lane isolation',async()=>{
  service.holdTestQuery();const pending=service.run(1,input('held')).then(()=>{throw Error('Unexpected success');},e=>e.message);await until(()=>service.testQueryState().entered>0);
  const facet=await service.run(1,{...input('facet'),action:'facet',field:'issueKey',search:''});assert.ok(facet.values.length);
  assert.equal((await service.cancel(1,'held')).executorStopped,true);assert.equal(await pending,'CANCELLED');service.releaseTestQuery();assert.equal(service.diagnostics().pendingCount,0);
 });
 await test('cancelled rebuild leaves prior active readable',async()=>{
  await service.run(2,input('initial'));
  const db=new DatabaseSync(s.raw);db.exec("UPDATE activity_events SET actor_display_name='Synthetic Next' WHERE id='raw-61'");db.close();
  let cancellation;
  const stale=await service.run(2,input('stale'),stage=>{if(stage.event==='projection-build'&&stage.phase==='START')cancellation=service.cancel(2,'stale-rebuild');return true;});assert.equal(stale.projectionStale,true);
  await until(()=>Boolean(cancellation));await cancellation;await service.close();
  q.invalidateAiResultsV043();const old=q.queryResultsV043('integrated',s.ai,s.raw,{visibleFields:[]});assert.equal(old.generation,stale.generation);assert.equal(old.projectionStale,true);
 });
}catch(error){console.error(error);process.exitCode=1;}finally{service.releaseTestQuery();await service.close();q.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({work,results},null,2));console.log('Evidence '+work);}})();
