const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,load}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.44',`business-io-${Date.now()}`);
const mod=load('electron/businessIoDiagnosticsV044.ts',work),io=mod.default,events=[];
async function main(){
  const original=fs.writeFileSync;
  mod.configureBusinessIoV044(e=>events.push(e),work);
  const file=path.join(work,'synthetic.txt');io.writeFileSync(file,'SYNTHETIC_SECRET_CONTENT');assert.equal(io.readFileSync(file,'utf8'),'SYNTHETIC_SECRET_CONTENT');
  const fd=io.openSync(file,'r');io.closeSync(fd);
  await io.promises.writeFile(file,'promise');assert.equal(await io.promises.readFile(file,'utf8'),'promise');
  await new Promise((resolve,reject)=>io.readFile(file,'utf8',(err,value)=>{if(err)return reject(err);assert.equal(value,'promise');resolve();}));
  assert.throws(()=>io.readFileSync(path.join(work,'missing.txt')),/ENOENT/);
  assert.ok(events.some(e=>e.phase==='FAILED'&&e.errorCode==='ENOENT'));
  assert.ok(events.some(e=>e.operation==='closeSync'&&e.path===file&&e.phase==='END'));
  assert.ok(events.every(e=>e.pathPolicy==='APP_ROOT'));
  assert.ok(!JSON.stringify(events).includes('SYNTHETIC_SECRET_CONTENT'));
  assert.equal(fs.writeFileSync,original,'Node global fs changed');
  const before=events.length;for(let i=0;i<10000;i++)io.readFileSync(file);assert.ok(events.length-before<=2,'I/O chunk log flood');
  mod.configureBusinessIoV044(()=>{throw Error('OBSERVER_FAILURE');});io.writeFileSync(file,'still works');assert.equal(fs.readFileSync(file,'utf8'),'still works');
  fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({status:'PASS',events,checks:['sync/promise/callback results unchanged','fd close path preserved','failure code observed','no payload','no global monkey patch','10000 coalesced reads bounded','observer failure cannot affect IO']},null,2));
  console.log('PASS scoped business IO '+work);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
