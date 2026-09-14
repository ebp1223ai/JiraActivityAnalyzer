const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {chromium}=require('@playwright/test');
const {root,seedRaw}=require('./v0343-test-helpers.cjs');
const version=process.env.JAA_UI_EXPECT_VERSION||'0.3.44';
const work=path.resolve(process.env.JAA_UI_EVIDENCE||path.join(root,'test-artifacts','v'+version,`ui-${Date.now()}`));
const appRoot=path.resolve(process.env.JAA_UI_APP_ROOT||path.join(work,'測試 App Root'));
const exe=process.env.JAA_UI_EXECUTABLE||require('electron');
const pkg=process.env.JAA_UI_PACKAGE||path.join(root,'tests/fixtures/v0.3.43/v201/package-ai-only-55.json');
const raw=path.join(appRoot,'databases','raw.sqlite'),ai=path.join(appRoot,'databases','ai-analysis','synthetic.sqlite');
const report={version,exe,appRoot,status:'RUNNING',manualGui:'PENDING',checks:[],errors:[],screenshots:[],startedAt:new Date().toISOString(),captureMethod:'BrowserWindow.capturePage only; no desktop capture; normal Electron spawn + nonce gated loopback CDP'};
const nonce=crypto.randomBytes(32).toString('hex');
fs.mkdirSync(path.join(work,'screenshots'),{recursive:true});fs.mkdirSync(appRoot,{recursive:true});
fs.writeFileSync(path.join(appRoot,'.jaa-ui-test.json'),JSON.stringify({nonce,syntheticOnly:true}));
if(fs.existsSync(path.join(appRoot,'.jaa-ui-ready.json')))fs.unlinkSync(path.join(appRoot,'.jaa-ui-ready.json'));
if(!fs.existsSync(path.join(appRoot,'.env')))fs.writeFileSync(path.join(appRoot,'.env'),'# isolated synthetic test; no Jira credentials\n');
fs.mkdirSync(path.dirname(raw),{recursive:true});
if(!fs.existsSync(raw)){if(process.env.JAA_UI_STRESS_RAW)fs.copyFileSync(process.env.JAA_UI_STRESS_RAW,raw);else seedRaw(raw,JSON.parse(fs.readFileSync(pkg)).records,work);}
const expectedTotal=Number(process.env.JAA_UI_EXPECT_TOTAL||55),expectedMatched=Number(process.env.JAA_UI_EXPECT_MATCHED||55);report.dataset={expectedRawTotal:expectedTotal,expectedMatched,synthetic:true};
let child,browser,controlPort,page;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const started=Date.now();let last;while(Date.now()-started<ms){try {const result=await fn();if(result)return result;}catch(e){last=e;}await wait(100);}throw last||Error('WAIT_TIMEOUT');}
async function control(url){const response=await fetch(`http://127.0.0.1:${controlPort}${url}`,{headers:{'x-jaa-test-nonce':nonce},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`CONTROL_${response.status}`);return response;}
const headings={'ai-database':'AI Analysis Database','ai-results':'AI Results Viewer','integrated-results':'Integrated Results',database:'Database Overview',connections:'Connections',collection:'Data Collection',issues:'Issue Viewer',users:'User Viewer','activity-stream-probe':'Activity Stream Probe','jira-probe':'Jira Probe',settings:'Settings'};
async function route(name){const at=performance.now();await page.evaluate(name=>{location.hash='#/'+name;},name);await page.waitForFunction(expected=>document.querySelector('h1')?.textContent?.includes(expected),headings[name],{timeout:15000,polling:25});if(['ai-results','integrated-results'].includes(name)){if(['0.3.47','0.3.48'].includes(version))await page.locator('[data-table-id]').first().waitFor({timeout:20000});else await page.locator('tr.activity-event-summary-row').first().waitFor({timeout:20000});await page.waitForFunction(()=>!document.querySelector('[data-table-id][aria-busy="true"]'),null,{polling:25});}if(version!=='0.3.45')await wait(150);report.checks.push({name:'route-ready:'+name,status:'PASS',durationMs:performance.now()-at});}
async function main(){
  const begin=Date.now();
  child=spawn(exe,process.env.JAA_UI_EXECUTABLE?[]:[root],{cwd:root,windowsHide:true,env:{...process.env,JAA_DEV_APP_ROOT:appRoot,JAA_UI_TEST_MODE:'1',JAA_UI_TEST_NONCE:nonce,JAA_V043_BACKGROUND:'1',JAA_UI_IO_AUDIT:'1',OPEN_DEVTOOLS:'0',ELECTRON_UI_SMOKE:'0'}});
  report.launcherPid=child.pid;child.stdout.on('data',b=>fs.appendFileSync(path.join(work,'stdout.log'),b));child.stderr.on('data',b=>fs.appendFileSync(path.join(work,'stderr.log'),b));
  child.on('error',e=>report.errors.push(e.message));child.on('exit',(code,signal)=>{report.launcherExit={code,signal};});
  await until(()=>{const r=JSON.parse(fs.readFileSync(path.join(appRoot,'.jaa-ui-ready.json')));controlPort=r.controlPort;return r;});
  const ready=await until(async()=>{const r=await(await control('/ready')).json();return r.ready&&r.port?r:null;});report.runtime=ready;report.launchToReadyMs=Date.now()-begin;
  report.readyNonceMatched=true;report.actualAppPid=ready.pid;report.actualAppExecutable=ready.exe;
  assert.equal(ready.version,version);assert.equal(path.resolve(ready.appRoot),appRoot);
  assert.equal((await fetch(`http://127.0.0.1:${controlPort}/ready`)).status,403);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${ready.port}`);page=browser.contexts()[0].pages()[0];
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')report.errors.push(msg.text());});
  await page.waitForFunction(()=>Boolean(window.desktopApp?.aiDatabase));
  const bridge=await page.evaluate(()=>({node:typeof window.require,isolated:window.desktopApp.nodeAccess}));assert.equal(bridge.node,'undefined');assert.equal(bridge.isolated,false);
  if(process.env.JAA_UI_REOPEN_ONLY==='1') { const restored=await page.evaluate(()=>window.desktopApp.aiDatabase.lifecycle({requestId:'restored'}));assert.equal(restored.snapshot.canQuery,true);assert.equal(path.resolve(restored.snapshot.databasePath),ai);report.restored=restored.snapshot; }
  const selected=await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),raw);assert.equal(selected.saved,true,JSON.stringify(selected));report.selectedDatabase=selected.state.database;assert.equal(selected.state.database.canRead,true,JSON.stringify(selected.state.database));
  let life=await page.evaluate(()=>window.desktopApp.aiDatabase.lifecycle({requestId:'ui-lifecycle'}));
  if(!life.snapshot.canQuery){const created=await page.evaluate(filePath=>window.desktopApp.aiDatabase.create({requestId:'ui-create',filePath}),ai);assert.equal(created.ok,true,JSON.stringify(created));}
  if(process.env.JAA_UI_REOPEN_ONLY!=='1'){
  const preflight=await page.evaluate(filePath=>window.desktopApp.aiDatabase.preflight({requestId:'ui-preflight',filePath}),pkg);assert.equal(preflight.ok,true,JSON.stringify(preflight));
  const imported=await page.evaluate(filePath=>window.desktopApp.aiDatabase.importPackage({requestId:'ui-import',filePath,confirmed:true}),pkg);assert.equal(imported.ok,true,JSON.stringify(imported));
  const links=await page.evaluate(()=>window.desktopApp.aiDatabase.relink({requestId:'ui-relink'}));assert.equal(links.ok,true,JSON.stringify(links));assert.equal(links.counts.PRIMARY_MATCHED??0,expectedMatched);
  }
  const result=await page.evaluate(()=>window.desktopApp.aiDatabase.queryIntegrated({requestId:'ui-query',page:1,pageSize:100,visibleFields:[]}));assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.totalCount,expectedTotal);assert.equal(result.matchedCount,expectedMatched);
  report.checks.push({name:'real-preload-IPC-Raw-AI-create-import-relink-query',status:'PASS'});
  const sizes=['0.3.45','0.3.46','0.3.47','0.3.48'].includes(version)?[[1366,768],[1920,1080]]:process.env.JAA_UI_SHORT==='1'?[[1280,720]]:[[800,600],[1024,768],[1280,720],[1366,768],[1440,900],[1600,900],[1920,1080]];
  for(const [width,height] of sizes){await control(`/resize?width=${width}&height=${height}`);for(const name of ['ai-database','ai-results','integrated-results']){await route(name);await control('/capture');await wait(100);const png=Buffer.from(await(await control('/capture')).arrayBuffer());const file=path.join(work,'screenshots',`${name}-${width}x${height}.png`);fs.writeFileSync(file,png);const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1,heading:document.querySelector('h1')?.textContent,sidebar:!!document.querySelector('aside')}));assert.equal(layout.overflow,false,JSON.stringify(layout));assert.ok(layout.sidebar);assert.ok(png.length>10000,'blank capture');report.screenshots.push({file,...layout});
    if(name==='integrated-results') {
      await page.getByRole('button',{name:/Debug Log/}).click();const panel=page.getByRole('dialog',{name:/全域除錯日誌/});await panel.waitFor();
      const bounds=await panel.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,clippedButtons:[...el.querySelectorAll('button')].filter(b=>b.scrollWidth>b.clientWidth+2).map(b=>b.textContent)};});assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1);assert.deepEqual(bounds.clippedButtons,[]);
      const debugFile=path.join(work,'screenshots','debug-'+width+'x'+height+'.png');fs.writeFileSync(debugFile,Buffer.from(await(await control('/capture')).arrayBuffer()));report.screenshots.push({file:debugFile,debugExpanded:true,...bounds});await panel.getByTitle('Close',{exact:true}).click();
    }
  }}
  if(process.env.JAA_UI_DEEP==='1') {
    await route('integrated-results');const firstKey=await page.locator('tr.activity-event-summary-row a[href^="#/issues?key="]').first().textContent();
    await page.getByTitle('Filter Issue Key',{exact:true}).click();const filter=page.locator('[data-filter-column="issueKey"]');await filter.getByRole('tab',{name:'文字條件',exact:true}).click();await filter.getByLabel('文字比對方式').selectOption('exact');await filter.getByPlaceholder('實際文字條件').fill(firstKey);await filter.getByRole('button',{name:'套用',exact:true}).click();
    await page.waitForFunction(key=>{const links=[...document.querySelectorAll('tr.activity-event-summary-row a[href^="#/issues?key="]')];return links.length>0&&links.every(a=>a.textContent===key)&&!document.querySelector('[aria-label="Loading table rows"]');},firstKey);
    await route('ai-results');await route('integrated-results');assert.equal(await page.locator('tr.activity-event-summary-row a[href^="#/issues?key="]').first().textContent(),firstKey);
    await page.getByRole('button',{name:/Clear All Filters/}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Loading table rows"]'));
    for(let i=0;i<20;i++){await route(i%2?'integrated-results':'ai-results');}
    report.checks.push({name:'real-header-filter-route-hydration-and-20-route-loop',status:'PASS'});
  }
  if(version==='0.3.49') await require('./v0349-ui-checks.cjs')({page,control,route,report,work,appRoot,raw,ai,until});
  if(version==='0.3.48') await require('./v0348-ui-checks.cjs')({page,control,route,report,work,appRoot,raw,ai,until});
  if(version==='0.3.47') await require(process.env.JAA_V047_UI_FOCUS==='delivery'?'./v0347-ui-delivery.cjs':'./v0347-ui-checks.cjs')({page,control,route,report,work,appRoot,raw,ai,until});
  if(version==='0.3.46') await require(process.env.JAA_V046_UI_FOCUS==='edges'?'./v0346-ui-edgechecks.cjs':'./v0346-ui-checks.cjs')({page,control,route,report,work,appRoot,raw,ai,until});
  if(version==='0.3.45' && process.env.JAA_UI_V045_CHECKS!=='0') await require('./v0345-ui-checks.cjs')({page,control,route,report,work,appRoot,raw,ai,until});
  for(const name of (['0.3.45','0.3.46','0.3.47','0.3.48'].includes(version)?['users']:['database','connections','collection','issues','users','activity-stream-probe','jira-probe','settings'])){await route(name);report.checks.push({name:`route:${name}`,status:'PASS',heading:await page.locator('h1').first().textContent()});}
  if(process.env.JAA_UI_EXPORT==='1') {
    await route('integrated-results');await control('/select-test-export');await page.getByText('匯出表格',{exact:true}).click();await page.getByRole('button',{name:'全部欄位 JSON',exact:true}).click();
    const target=path.join(appRoot,'exports','synthetic-table-export.json');
    if(process.env.JAA_UI_EXPORT_CANCEL==='1') {
      await until(()=>fs.readdirSync(path.dirname(target)).some(n=>n.startsWith('synthetic-table-export.json.')&&n.endsWith('.partial')));
      await route('connections');await page.evaluate(()=>{location.hash='#/integrated-results';});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('取消匯出')),null,{polling:25});
      const cancelAt=performance.now(); await page.getByRole('button',{name:'取消匯出',exact:true}).evaluate(button=>button.click());await page.waitForFunction(()=>document.body.textContent.includes('正在取消匯出')||![...document.querySelectorAll('button')].some(b=>b.textContent.includes('取消匯出')),null,{polling:25});const cancelUiMs=performance.now()-cancelAt;if(version==='0.3.45')assert.ok(cancelUiMs<=250,'cancel UI feedback exceeded 250ms: '+cancelUiMs);report.cancelUiMs=cancelUiMs;await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent.includes('取消匯出')),null,{polling:25});report.cancelStopMs=performance.now()-cancelAt;if(version==='0.3.45')assert.ok(report.cancelStopMs<=2000,'read job cancellation exceeded 2000ms');
      assert.equal(fs.existsSync(target),false);assert.equal(fs.readdirSync(path.dirname(target)).some(n=>n.startsWith('synthetic-table-export.json.')&&n.endsWith('.partial')),false);report.checks.push({name:'UI-cancel-export-real-executor-no-publication-no-partial',status:'PASS'});
    } else {
      await until(()=>fs.existsSync(target));const exported=JSON.parse(fs.readFileSync(target));assert.equal(exported.rows.length,expectedTotal);report.checks.push({name:'UI-full-scope-export',status:'PASS',rows:exported.rows.length,bytes:fs.statSync(target).size});
    }
  }
  if(process.env.JAA_UI_WORKBENCH==='1') {
    for(const [version,relative,count] of [['2.0.1','v201/package-ai-only-55.json',55],['2.0.0','legacy_v200/jaa-ai-analysis-package-v2__ai-only__golden-44.json',44]]) {
      const waiting=browser.contexts()[0].waitForEvent('page');await control('/workbench?version='+version);const wb=await waiting;
      wb.on('pageerror',e=>report.errors.push(e.message));wb.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
      const input=path.join(root,'tests/fixtures/v0.3.43',relative),source=JSON.parse(fs.readFileSync(input));
      await wb.locator('#file').setInputFiles(input);await wb.locator('#workspace').waitFor();assert.equal(await wb.locator('#recordList .record').count(),count);
      await wb.locator('#recordNotes').fill('Synthetic manual partial review');await wb.locator('#export').click();
      const state=await until(async()=>{const s=await(await control('/workbench-state')).json();return s.status==='completed'?s:null;});
      const exported=JSON.parse(fs.readFileSync(state.output));assert.equal(exported.reviewRank,'REVIEW_PARTIAL');assert.equal(exported.schemaVersion,version);assert.deepEqual(exported.rulesBinding,source.rulesBinding);
      for(let i=0;i<count;i++){assert.deepEqual(exported.records[i].sourceTrace,source.records[i].sourceTrace);assert.deepEqual(exported.records[i].aiAnalysis,source.records[i].aiAnalysis);}
      report.checks.push({name:'frozen-workbench-'+version,status:'PASS',records:count,immutableSource:true,output:state.output});
      fs.copyFileSync(state.output,state.output+'.partial-review.json');
      for(let i=0;i<count;i++){await wb.getByRole('button',{name:'接受 AI 此筆全部判定',exact:true}).click();await wb.getByRole('button',{name:'完成此筆並下一筆',exact:true}).click();}
      await wb.locator('#export').click();
      const completed=await until(()=>{const p=JSON.parse(fs.readFileSync(state.output));return p.reviewRank==='REVIEW_COMPLETED'?p:null;});assert.equal(completed.schemaVersion,version);assert.deepEqual(completed.rulesBinding,source.rulesBinding);
      for(let i=0;i<count;i++){assert.deepEqual(completed.records[i].sourceTrace,source.records[i].sourceTrace);assert.deepEqual(completed.records[i].aiAnalysis,source.records[i].aiAnalysis);assert.equal(completed.records[i].manualReview.completed,true);}
      report.checks.push({name:'frozen-workbench-completed-'+version,status:'PASS',records:count,immutableSource:true,output:state.output});await control('/workbench-close');
    }
  }
  if(process.env.JAA_UI_LONG_DIFF==='1') {
    if(process.env.JAA_UI_EXPORT_CANCEL==='1') await page.getByRole('button',{name:'重新整理',exact:true}).evaluate(button=>button.click());
    await route('integrated-results');const row=page.locator('tr.activity-event-summary-row').first();
    const buttons=await row.locator('button').evaluateAll(bs=>bs.map(b=>({text:b.textContent,title:b.title,aria:b.getAttribute('aria-label')})));report.longDiffButtons=buttons;
    const expand=row.getByRole('button',{name:/展開|Expand|View |查看/}).first();await expand.click();await page.locator('tr.activity-event-detail-row').first().waitFor();
    const text=await page.locator('tr.activity-event-detail-row').first().textContent();assert.ok(text.includes('MODIFIED'));assert.ok(text.includes('0123456789abcdef'));report.checks.push({name:'long-content-real-lazy-expansion',status:'PASS'});
  }
  const diagnostic=await page.evaluate(()=>window.desktopApp.appDiagnostics.automaticState());assert.equal(diagnostic.writerFailed,false,JSON.stringify(diagnostic));report.diagnostic=diagnostic;
  const registered=['electron/main.ts','electron/aiAnalysisDatabaseIpcV042.ts'].flatMap(f=>[...fs.readFileSync(path.join(root,f),'utf8').matchAll(/instrumentedHandleV044\("([^"\n]+)"/g)].map(m=>m[1])).sort();assert.deepEqual(diagnostic.registeredChannels,registered);report.checks.push({name:'runtime-IPC-registry-bidirectional-exact',status:'PASS',channels:registered.length});
  assert.deepEqual(report.errors,[]);
  await control('/quit');await until(()=>{ if(!report.launcherExit)return false; try { process.kill(report.actualAppPid,0); return false; } catch (error) { return error.code==='ESRCH'; } },20000);report.actualAppExited=true;
  const sessions=path.join(appRoot,'logs','sessions');
  const errors=[];for(const dir of fs.readdirSync(sessions)){const p=path.join(sessions,dir,'renderer.ndjson');if(fs.existsSync(p))for(const line of fs.readFileSync(p,'utf8').split('\n').filter(Boolean)){const e=JSON.parse(line);if(e.event==='console-message'&&['error',3].includes(e.details?.level))errors.push(e);}}
  assert.deepEqual(errors,[],'startup console errors (including before CDP attachment)');
  const events=fs.readdirSync(sessions).flatMap(dir=>fs.readdirSync(path.join(sessions,dir)).filter(n=>/^automatic-\d+\.ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(sessions,dir,n),'utf8').split('\n').filter(Boolean).map(JSON.parse)));
  for (const stage of ['source-read','mapping-aggregation','field-discovery','sql-query','row-mapping','renderer-result-commit']) assert.ok(events.some(e=>e.event===stage),'Missing real pipeline stage '+stage);
  assert.ok(events.some(e=>e.event==='file-io'&&e.details?.path),'Production IO observation missing');
  report.checks.push({name:'production-file-io-and-complete-streaming-pipeline',status:'PASS'});
  const spans=new Map(),seq=new Map();for(const e of events){assert.equal(e.schemaVersion,'jaa-diagnostic-event-v1');const producer=e.sessionId+':'+e.producerId;assert.ok(e.producerSeq>(seq.get(producer)||0),'producer sequence regression');seq.set(producer,e.producerSeq);if(e.phase==='START'||e.phase==='END'){assert.ok(e.operationId&&e.spanId);const state=spans.get(e.spanId)||{start:[],end:[]};state[e.phase==='START'?'start':'end'].push(e);spans.set(e.spanId,state);}}
  const unfinished=[];for(const [id,state] of spans){assert.equal(state.start.length,1,'missing or duplicate START '+id);assert.ok(state.end.length<=1,'duplicate END '+id);if(!state.end.length)unfinished.push({spanId:id,event:state.start[0].event,operationId:state.start[0].operationId,producer:state.start[0].processType});}
  const explained=unfinished.map(span=>({...span,terminalOperation:events.find(e=>e.operationId===span.operationId&&e.phase==='END'&&['CANCELLED','SUPERSEDED'].includes(e.outcome))?.outcome||null}));
  assert.deepEqual(version==='0.3.48'?explained:explained.filter(s=>s.producer!=='worker'||!s.terminalOperation),[],'unexplained normal-path open spans');
  report.traceAudit={events:events.length,producers:seq.size,spans:spans.size,terminatedReadWorkerSpans:explained,stageNames:[...new Set(events.map(e=>e.event))]};
  const ioFiles=fs.readdirSync(path.join(appRoot,'logs')).filter(n=>n.startsWith('io-audit-')&&n.endsWith('.ndjson'));
  const io=ioFiles.flatMap(n=>fs.readFileSync(path.join(appRoot,'logs',n),'utf8').split('\n').filter(Boolean).map(JSON.parse));
  assert.ok(io.length>0,'I/O audit missing');assert.deepEqual(io.filter(e=>e.policy==='EXTERNAL_WRITE_REQUIRES_REVIEW'),[],'unexpected JS/SQLite business write outside APP_ROOT');
  report.ioAudit={files:ioFiles,invocations:io.length,externalReads:io.filter(e=>e.policy==='EXTERNAL_READ_REQUIRES_REVIEW'),coverage:'Node fs APIs + SQLite connection paths in main/query/write/diagnostic isolates; Chromium native cache writes are checked by APP_ROOT paths, not OS syscall tracing'};
  report.status='PASS';
}
main().catch(e=>{report.status='FAIL';report.error=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{if(controlPort&&!report.launcherExit){try{await control('/quit');await until(()=>report.launcherExit,10000);}catch{if(child&&!child.killed)child.kill();}}await browser?.close().catch(()=>{});report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log('UI evidence '+work);});
