const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..'),work=path.join(root,'test-artifacts/v0.3.44',`faults-${Date.now()}`),appRoot=path.join(work,'isolated 故障 App');
fs.mkdirSync(appRoot,{recursive:true});fs.writeFileSync(path.join(appRoot,'.env'),'# synthetic no credentials\n');
const results=[];let current;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const at=Date.now();while(Date.now()-at<ms){try{const v=await fn();if(v)return v;}catch{}await wait(100);}throw Error('FAULT_TEST_WAIT_TIMEOUT');}
async function launch(){
  const nonce=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(appRoot,'.jaa-ui-test.json'),JSON.stringify({nonce,syntheticOnly:true}));
  const readyFile=path.join(appRoot,'.jaa-ui-ready.json');if(fs.existsSync(readyFile))fs.unlinkSync(readyFile);
  const child=spawn(require('electron'),[root],{cwd:root,windowsHide:true,env:{...process.env,JAA_DEV_APP_ROOT:appRoot,JAA_UI_TEST_MODE:'1',JAA_UI_TEST_NONCE:nonce,JAA_V043_BACKGROUND:'1',OPEN_DEVTOOLS:'0'}});
  const item={child,exited:false,browser:null};current=item;child.on('exit',(code)=>{item.exited=true;item.exitCode=code;});child.on('error',e=>{item.error=e.message;});
  child.stdout.on('data',b=>fs.appendFileSync(path.join(work,'stdout.log'),b));child.stderr.on('data',b=>fs.appendFileSync(path.join(work,'stderr.log'),b));
  const ready=await until(()=>JSON.parse(fs.readFileSync(readyFile)));
  item.control=async(url)=>{const r=await fetch(`http://127.0.0.1:${ready.controlPort}${url}`,{headers:{'x-jaa-test-nonce':nonce},signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error('HTTP_'+r.status);return r;};
  const runtime=await until(async()=>{const r=await(await item.control('/ready')).json();return r.ready?r:null;});item.pid=runtime.pid;
  item.browser=await chromium.connectOverCDP(`http://127.0.0.1:${runtime.port}`);item.page=item.browser.contexts()[0].pages()[0];
  await item.page.waitForFunction(()=>window.desktopApp?.appDiagnostics);item.state=await until(async()=>{const state=await item.page.evaluate(()=>window.desktopApp.appDiagnostics.automaticState());return state.sessionId ? state : null;});
  item.session=path.join(appRoot,'logs','sessions',item.state.sessionId);return item;
}
function events(item){return fs.readdirSync(item.session).filter(n=>/^automatic-\d+\.ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(item.session,n),'utf8').split('\n').filter(Boolean).flatMap(s=>{try{return[JSON.parse(s)];}catch{return[];}}));}
async function stop(item){if(!item.exited){await item.control('/quit');await until(()=>item.exited);}await item.browser?.close().catch(()=>{});}
async function test(name,fn){const at=performance.now();try{const detail=await fn();results.push({name,status:'PASS',durationMs:performance.now()-at,detail});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',durationMs:performance.now()-at,error:e.stack});throw e;}}
async function main(){
  const first=await launch();
  await test('T44-18 independent writer records missed main heartbeat during main loop block',async()=>{
    await first.control('/fault/main-hang');
    const event=await until(()=>events(first).find(e=>e.event==='heartbeat-missed'&&e.details.producer==='main'),19000);
    assert.equal(event.details.rootCause,'UNKNOWN');assert.notEqual(event.pid,first.pid);
    await until(()=>events(first).some(e=>e.event==='heartbeat-recovered'&&e.details.producer==='main'),10000);
    return {mainPid:first.pid,monitorPid:event.pid,eventId:event.eventId};
  });
  await test('T44-17 renderer hang is observed independently while main remains alive',async()=>{
    await wait(2500); const priorIds = new Set(events(first).map(e=>e.eventId));
    await first.control('/fault/renderer-hang');
    const event=await until(()=>events(first).find(e=>!priorIds.has(e.eventId)&&e.event==='heartbeat-missed'&&e.details.producer.startsWith('renderer:')),19000);
    const ready=await(await first.control('/ready')).json();assert.equal(ready.pid,first.pid);
    await until(()=>events(first).some(e=>!priorIds.has(e.eventId)&&e.event==='heartbeat-recovered'&&e.details.producer.startsWith('renderer:')),10000);
    return {eventId:event.eventId,mainAlive:true};
  });
  await test('T44-20 abrupt main exit preserves unclean session; restart uses safe page',async()=>{
    await first.control('/fault/exit-after-durable-start');
    void first.page.evaluate(()=>window.desktopApp.aiDatabase.queryIntegrated({requestId:'kill-after-start',page:1,pageSize:25,visibleFields:[]})).catch(()=>{});
    await until(()=>first.exited);await first.browser.close().catch(()=>{});
    const interrupted=JSON.parse(fs.readFileSync(path.join(first.session,'automatic-summary.json')));assert.ok(['running','unclean'].includes(interrupted.status));assert.ok(events(first).some(e=>e.phase==='START'&&e.processType==='worker'));assert.equal(first.exitCode,74);
    // Windows may terminate the process tree before a disconnect handler can run. Recovery must not require a final write.
    const next=await launch();await next.page.waitForFunction(()=>location.hash==='#/database');
    const state=await next.page.evaluate(()=>window.desktopApp.appDiagnostics.automaticState());assert.equal(state.previous.status,'unclean');assert.equal(state.previous.rootCause,'UNKNOWN');assert.equal(state.previous.autoReplay,false);
    const exported=await next.page.evaluate(()=>window.desktopApp.appDiagnostics.exportPrevious());assert.equal(exported.ok,true,JSON.stringify(exported));assert.ok(fs.existsSync(path.join(exported.folderPath,'manifest.json')));
    await stop(next);return {exitCode:first.exitCode,previousSession:state.previous.sessionId,exported:exported.folderPath};
  });
  await test('T44-22 clean restart has no unclean banner and closes monitor',async()=>{
    const item=await launch();const state=await item.page.evaluate(()=>window.desktopApp.appDiagnostics.automaticState());assert.equal(state.previous,null);const pid=state.writerPid;await stop(item);
    await until(()=>{try{process.kill(pid,0);return false;}catch{return true;}},5000);
    assert.equal(JSON.parse(fs.readFileSync(path.join(item.session,'automatic-summary.json'))).status,'closed');return {monitorPid:pid};
  });
  await test('T44-19 renderer crash records real process reason and main stays responsive',async()=>{
    const item=await launch();await item.control('/fault/renderer-crash');
    const recorded=await until(()=>{const p=path.join(item.session,'main.ndjson');if(!fs.existsSync(p))return;return fs.readFileSync(p,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).find(e=>e.event==='app-render-process-gone');});
    assert.ok(recorded.details.reason);assert.equal((await(await item.control('/ready')).json()).pid,item.pid);await stop(item);return {reason:recorded.details.reason,expectedFault:true};
  });
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(current&&!current.exited){try{await stop(current);}catch{current.child.kill();}}fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({results,expectedFaults:true,realServicesContacted:false},null,2));console.log('Evidence '+work);});
