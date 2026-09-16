const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {root,load}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.50','focused-'+Date.now());fs.mkdirSync(work,{recursive:true});
const identity=load('shared/viewerQueryIdentityV050.ts',work),cache=load('src/state/aiResultCacheV045.ts',work),results=[];
async function test(name,fn){const start=performance.now();try{await fn();results.push({name,status:'PASS',ms:performance.now()-start});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.stack});throw error;}}
async function main(){
 await test('semantic identity ignores transport/reference/order, preserves timezone/date/generation',()=>{
  const a={requestId:'a',revision:1,filters:{issueKey:{values:['T-2','T-1']}},visibleFields:['a','b'],generation:'g1',timeZone:'UTC'};
  const b={...a,requestId:'b',revision:2,filters:{issueKey:{values:['T-1','T-2','T-1']}},visibleFields:['b','a']};
  assert.equal(identity.semanticQueryV050(a),identity.semanticQueryV050(b));
  for(const change of [{generation:'g2'},{timeZone:'Asia/Taipei'},{page:2},{filters:{issueKey:{values:['T-1']}}}])assert.notEqual(identity.semanticQueryV050(a),identity.semanticQueryV050({...a,...change}));
  assert.deepEqual(identity.VIEWER_DEFAULT_COLUMNS_V050,['eventTime','action','issueKey','analysisStatus','skillIds','manual']);
 });
 await test('completed/in-flight reuse, cancelling exclusion and late cancelled result',async()=>{
  let finish,calls=0;const execute=()=>{calls++;return new Promise(r=>finish=r);};
  const a=cache.acquireAiResultV045('scope','key','one',execute),b=cache.acquireAiResultV045('scope','key','two',execute);assert.equal(b.entry,a.entry);assert.equal(calls,1);
  cache.cancellingAiResultV050('one');
  const c=cache.acquireAiResultV045('scope','key','three',async()=>({ok:true,requestId:'three',generation:'g'}));assert.equal(c.reused,false);
  finish({ok:true,requestId:'one'});await a.entry.promise;await c.entry.promise;
  const d=cache.acquireAiResultV045('scope','key','four',execute);assert.equal(d.entry.id,'three');assert.equal(d.reused,true);
 });
 await test('stale results not cached and cache budgets unchanged',async()=>{
  await cache.acquireAiResultV045('scope','stale','s',async()=>({ok:true,projectionStale:true})).entry.promise;
  assert.equal(cache.acquireAiResultV045('scope','stale','fresh',async()=>({ok:true})).reused,false);
  const state=cache.aiResultCacheStateV045();assert.equal(state.maxBytes,8*1024*1024);assert.equal(state.maxPending,4);
 });
 const seed=require('./v0348-test-seed.cjs').seed(path.join(work,'seed'),120);
 await test('read-only first connection empty WAL is not a revision; nonempty WAL invalidates',()=>{
  const {compatibilityObservationV050:observe}=load('electron/databaseCompatibilityObservationV050.ts',work);
  const file=path.join(work,'wal.sqlite');fs.copyFileSync(seed.raw,file);
  const before=observe(file),db=new DatabaseSync(file,{readOnly:true});db.prepare('SELECT name FROM sqlite_master').all();
  assert.equal(observe(file),before);db.close();
  fs.writeFileSync(file+'-wal','synthetic changed WAL');assert.notEqual(observe(file),before);
 });
 await test('critical compatibility preserves policy and disables writes pending health',()=>{
  const {checkCurrentStateDatabaseCompatibility:check}=load('electron/currentStateArchive.ts',work);
  const critical=check(seed.raw,'',{criticalOnly:true}),full=check(seed.raw);
  assert.equal(critical.canRead,true);assert.equal(critical.canWrite,false);assert.equal(full.canRead,true);assert.equal(full.canWrite,true);assert.equal(critical.databaseId,full.databaseId);
  const invalid=path.join(work,'bad.sqlite');fs.writeFileSync(invalid,'not sqlite');assert.equal(check(invalid,'',{criticalOnly:true}).canRead,false);
 });
 await test('worker critical result/health/reuse keep event loop responsive',async()=>{
  const worker=path.join(work,'compat.cjs');require('esbuild').buildSync({entryPoints:[path.join(root,'electron/databaseCompatibilityWorkerV050.ts')],outfile:worker,bundle:true,platform:'node',format:'cjs',packages:'external'});
  const {DatabaseCompatibilityV050}=load('electron/databaseCompatibilityV050.ts',work);let health,beats=0;const events=[];
  const coordinator=new DatabaseCompatibilityV050(worker,v=>health=v,(stage,details)=>events.push({stage,...details}));
  const timer=setInterval(()=>beats++,5);
  try{const critical=await coordinator.open(seed.raw,'');assert.equal(critical.canRead,true);assert.equal(critical.canWrite,false);
   for(let i=0;i<300&&!health;i++)await new Promise(r=>setTimeout(r,10));
   assert.equal(health?.canWrite,true);await coordinator.open(seed.raw,'');
   assert.equal(events.filter(e=>e.stage==='compatibility-critical-start').length,1);assert.ok(beats>0);
  }finally{clearInterval(timer);await coordinator.cancel();}
 });
 await test('sidecar receipt rejects changed bytes and corrupted SQLite',()=>{
  const {validateProjectionIntegrityV050:check}=load('electron/projectionIntegrityV050.ts',work),file=path.join(work,'sidecar.sqlite');
  let db=new DatabaseSync(file);db.exec('CREATE TABLE t(x);INSERT INTO t VALUES(1)');check(db,file);db.close();
  const receipt=JSON.parse(fs.readFileSync(file+'.integrity-v050.json'));
  db=new DatabaseSync(file);check(db,file);assert.deepEqual(JSON.parse(fs.readFileSync(file+'.integrity-v050.json')),receipt);
  db.exec('INSERT INTO t VALUES(2)');check(db,file);db.close();assert.notEqual(JSON.parse(fs.readFileSync(file+'.integrity-v050.json')).digest,receipt.digest);
  fs.writeFileSync(file,'corrupt');assert.throws(()=>{db=new DatabaseSync(file);try{check(db,file);}finally{db.close();}});
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({work,results},null,2));console.log('Evidence '+work);});
