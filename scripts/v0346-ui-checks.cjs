const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,seedRaw}=require('./v0343-test-helpers.cjs');
module.exports=async({page,control,route,report,work,appRoot,raw,until})=>{
 const checks=report.checks;
 const settled=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>!document.querySelector('[data-table-id][aria-busy="true"]'),null,{timeout:30000,polling:25});};
 const total=()=>page.locator('[data-table-id]').first().innerText().then(t=>Number(/篩選後 ([\d,]+)/.exec(t)?.[1].replaceAll(',','')));
 const events=()=>{const dir=path.join(appRoot,'logs/sessions');return fs.readdirSync(dir).flatMap(d=>fs.readdirSync(path.join(dir,d)).filter(n=>/^automatic-\d+\.ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(dir,d,n),'utf8').split('\n').filter(Boolean).map(JSON.parse)));};
 const jobs=()=>events().filter(e=>e.phase==='START'&&e.event==='ipc.ai-database:query-integrated').length;
 const textFilter=async(label,id,text)=>{await page.getByTitle('Filter '+label,{exact:true}).click();const dialog=page.locator(`[data-filter-column="${id}"]`);await dialog.getByRole('tab',{name:'文字條件',exact:true}).click();await dialog.getByLabel('文字比對方式').selectOption('exact');await dialog.getByPlaceholder('實際文字條件').fill(text);await dialog.getByRole('button',{name:'套用',exact:true}).click();await settled();};
 await route('integrated-results');
 await textFilter('Actor','displayName','Export User');
 const quick=page.getByTestId('diff-quick-filters').locator('input');
 for(let i=0;i<4;i++){await quick.nth(i).setChecked(false);await settled();}
 assert.equal(await total(),40);
 assert.ok(await page.locator('[data-comment-full]').count()>=5);
 const body=await page.locator('[data-comment-full]').allTextContents();assert.ok(body.some(t=>t.includes('Inspect queue\nConfirm retry')));assert.ok(body.some(t=>t.includes('未取得留言全文')));assert.ok(body.some(t=>t.includes('literal \\r\\n code')));assert.equal(await page.locator('[data-comment-full] img').count(),0);
 const cases=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v0.3.46/05_fixtures/v046/quick-filter-cases.json'))).combinations;
 const ordered=Array.from({length:16},(_,i)=>{const g=i^(i>>1);return cases.find(c=>[c.flags.hideNoChange,c.flags.hideAddedZero,c.flags.hideRemovedZero,c.flags.hideBeforeUnavailable].every((v,b)=>v===Boolean(g&(1<<b))));});
 report.uiFocus=process.env.JAA_V046_UI_FOCUS||'all';
 for(const c of (report.uiFocus==='workflow'?[]:ordered)){for(const [i,value] of [c.flags.hideNoChange,c.flags.hideAddedZero,c.flags.hideRemovedZero,c.flags.hideBeforeUnavailable].entries()){if(await quick.nth(i).isChecked()!==value){await quick.nth(i).setChecked(value);await settled();}}const expected=c.expectedIds.length+28;await page.waitForFunction(n=>document.querySelector('[data-table-id]')?.textContent?.includes(`篩選後 ${n}，`)&&!document.querySelector('[data-table-id][aria-busy="true"]'),expected,{timeout:30000});assert.equal(await total(),expected,JSON.stringify(c.flags));}
 checks.push({name:report.uiFocus==='workflow'?'Comment content; quick combinations separately evidenced':'T46-01/02/03/06 actual Comment content and all16 quick-filter UI combinations',status:'PASS'});
 for(let i=0;i<4;i++){await quick.nth(i).setChecked(false);await settled();}
 const shot=path.join(work,'screenshots','v046-comment-full.png');fs.writeFileSync(shot,Buffer.from(await(await control('/capture')).arrayBuffer()));report.screenshots.push({file:shot,commentFull:true});
 for(const [from,to] of [['2026-09-01','2026-09-01'],['2026-08-31','2026-09-02'],['2026-09-01',''],['','2026-09-01']]){
  await page.getByTitle('Filter Time',{exact:true}).click();const d=page.locator('[data-filter-column="eventTime"]');await d.getByRole('tab',{name:'範圍',exact:true}).click();await d.getByLabel('起日',{exact:true}).fill(from);await d.getByLabel('迄日',{exact:true}).fill(to);await d.getByRole('button',{name:'套用',exact:true}).click();await settled();assert.equal(await total(),40);
 }
 await page.getByTitle('Filter Time',{exact:true}).click();let d=page.locator('[data-filter-column="eventTime"]');await d.getByLabel('起日',{exact:true}).fill('2026-09-03');await d.getByLabel('迄日',{exact:true}).fill('2026-09-01');await d.getByRole('button',{name:'套用',exact:true}).click();await d.getByRole('alert').waitFor();assert.equal(await total(),40);await d.getByRole('button',{name:'清除此欄',exact:true}).click();await settled();
 checks.push({name:'T46-21 actual same-day/cross-day/start-only/end-only/invalid calendar + text AND',status:'PASS'});
 await page.getByRole('button',{name:'欄位',exact:true}).click();await page.getByTitle('Move Before right',{exact:true}).click();await page.getByRole('button',{name:'欄位',exact:true}).click();
 const resize=page.getByRole('separator',{name:'Resize Actor',exact:true});await resize.scrollIntoViewIfNeeded();const box=await resize.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+10);await page.mouse.down();await page.mouse.move(box.x+80,box.y+10);await page.mouse.up();
 await page.getByLabel('每頁',{exact:false}).selectOption('25');await settled();await page.getByTitle('Next page',{exact:true}).click();await settled();
 await page.locator('[data-table-scroll-container]').evaluate(el=>{el.scrollLeft=150;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
 const state=()=>page.evaluate(()=>({headers:[...document.querySelectorAll('th')].map(e=>({text:e.textContent,width:e.style.width})),page:document.querySelector('button[title="Next page"]')?.parentElement?.textContent,scroll:document.querySelector('[data-table-scroll-container]')?.scrollLeft,rows:[...document.querySelectorAll('tr.activity-event-summary-row')].map(e=>e.textContent)}));
 const expectedState=await state(),restores=[];
 for(let i=0;i<5;i++){await route('ai-results');const before=jobs(),at=performance.now();await route('integrated-results');await settled();assert.deepEqual(await state(),expectedState);assert.equal(jobs(),before);restores.push({ms:performance.now()-at,newJobs:0});}
 checks.push({name:'T46-11 five A-B-A preserves filter/page/order/width/scroll/results zero jobs',status:'PASS',restores});
 await page.getByTitle('First page',{exact:true}).click();await settled();
 const exports=[];
 for(const name of ['顯示欄位','全部欄位 JSON','顯示欄位 CSV','全部欄位 CSV']){
  const target=path.join(appRoot,'exports/synthetic-table-export.json');if(fs.existsSync(target))fs.renameSync(target,path.join(work,'earlier-export-'+exports.length));
  await control('/select-test-export');await page.getByText('匯出表格',{exact:true}).click();const at=performance.now();await page.getByRole('button',{name,exact:true}).click();await until(()=>fs.existsSync(target),30000);await page.getByRole('button',{name:'取消匯出',exact:true}).waitFor({state:'hidden'});
  const value=fs.readFileSync(target,'utf8');if(!name.includes('CSV'))assert.equal(JSON.parse(value).rows.length,40);else assert.ok(value.includes('Inspect queue'));
  exports.push({name,ms:performance.now()-at,bytes:fs.statSync(target).size});await page.getByText('匯出表格',{exact:true}).click();
 }
 checks.push({name:'T46-22 actual JSON/CSV visible/all exports 40 matches over25 row page',status:'PASS',exports});
 // Keep renderer in-flight while navigating; the existing worker must be reused.
 await page.getByRole('button',{name:'重新整理',exact:true}).evaluate(b=>b.click());await page.waitForFunction(()=>document.querySelector('[data-table-id][aria-busy="true"]'),null,{polling:1});
 const before=jobs();await page.evaluate(()=>{location.hash='#/connections';});await page.waitForFunction(()=>document.querySelector('h1')?.textContent.includes('Connections'));await route('integrated-results');assert.equal(jobs(),before);assert.equal(await total(),40);
 checks.push({name:'T46-12 actual in-flight route reconnect no duplicate query',status:'PASS'});
 const other=path.join(appRoot,'databases/other-synthetic.sqlite');seedRaw(other,[{id:'other',issue:'OTHER-1',actor:'Other DB',eventTime:'2026-09-01T00:00:00Z',fieldName:'Comment',fieldId:'comment',eventType:'comment_created',after:{body:'Other database only'}}],work,'synthetic-other');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const samples=[];
 for(let i=0;i<20;i++){
  await route('ai-results');await route('integrated-results');await quick.nth(1).setChecked(i%2===0);await settled();
  if(i%5===0){const target=path.join(appRoot,'exports/synthetic-table-export.json');if(fs.existsSync(target))fs.renameSync(target,path.join(work,'cycle-export-'+i));await control('/select-test-export');await page.getByText('匯出表格',{exact:true}).click();await page.getByRole('button',{name:'顯示欄位',exact:true}).click();await until(()=>fs.existsSync(target),30000);await page.getByRole('button',{name:'取消匯出',exact:true}).waitFor({state:'hidden'});await page.getByText('匯出表格',{exact:true}).click();
   await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),other);await page.waitForFunction(()=>document.body.textContent.includes('1 / 1 筆'),null,{timeout:30000});assert.ok((await page.locator('tr.activity-event-summary-row').allTextContents()).every(t=>t.includes('OTHER-1')));
   await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),raw);await page.waitForFunction(()=>document.body.textContent.includes('/ 39,281 筆'),null,{timeout:30000});await settled();
  }

  if(i%5===1){await page.getByRole('button',{name:'重新整理',exact:true}).evaluate(b=>b.click());await page.waitForFunction(()=>document.querySelector('[data-table-id][aria-busy="true"]'),null,{polling:1});await page.getByRole('button',{name:'取消查詢',exact:true}).evaluate(b=>b.click());await settled();await page.getByRole('button',{name:'重新整理',exact:true}).click();await settled();}

  const metrics=await cdp.send('Performance.getMetrics');const diagnostics=await page.evaluate(()=>window.desktopApp.appDiagnostics.automaticState());const resources=diagnostics.queryResources;assert.equal(diagnostics.writerFailed,false);assert.ok(resources.executorCount<=4);assert.equal(resources.pendingCount,0);for(const executor of resources.executors){assert.equal(executor.pendingCount,0);assert.ok(executor.cacheBytes<=executor.cacheBudgetBytes);for(const count of Object.values(executor.listeners))assert.ok(count<=2);}samples.push({cycle:i+1,rendererHeap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,resources});
 }
 await cdp.detach();checks.push({name:'T46-15 twenty mixed route/filter/export/DB-switch/cancel cycles settle and bounded jobs',status:'PASS',samples});
 const debug=await page.evaluate(()=>window.desktopApp.appDebug.saveBundle({debugLog:'Synthetic v046 verification',currentPage:'/integrated-results'}));report.debugExport=debug;
 const dir=path.join(appRoot,'exports/debug-folders'),snapshots=fs.readdirSync(dir).map(n=>path.join(dir,n,'automatic-diagnostics/current/snapshot-summary.json')).filter(f=>fs.existsSync(f));assert.ok(snapshots.length);const snapshot=JSON.parse(fs.readFileSync(snapshots.at(-1)));assert.equal(snapshot.completeness,'COMPLETE_THROUGH_WATERMARK');checks.push({name:'T46-18 real diagnostic export consistent cutoff',status:'PASS',cutoff:snapshot.cutoffUtc});
};
