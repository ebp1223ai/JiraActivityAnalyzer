const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({page,control,route,report,work,appRoot,raw,ai,until,settled,clear,total,button})=>{
 const target=path.join(appRoot,'exports/synthetic-table-export.json');
 const preserve=n=>{if(fs.existsSync(target))fs.renameSync(target,path.join(work,n+'.json'));};
 const open=async()=>{await page.getByText('匯出表格',{exact:true}).click();};
 const hold=async()=>{await control('/hold-test-export');await open();await button('顯示欄位').click();await until(async()=>(await(await control('/test-export-state')).json()).pending);};
 const finish=()=>button('取消匯出').waitFor({state:'hidden',timeout:30000});
 preserve('previous-ui-export');
 await hold();await button('取消匯出').click();await control('/release-test-export');await finish();assert.ok(!fs.existsSync(target));await open();
 await hold();await control('/cancel-test-export');await finish();assert.ok(!fs.existsSync(target));await open();
 await hold();await page.getByRole('checkbox',{name:'UNKNOWN',exact:true}).uncheck();await settled();await control('/release-test-export');await finish();assert.equal(JSON.parse(fs.readFileSync(target)).rows.length,55);preserve('picker-snapshot-55');await open();
 // A database switch while the real native picker waits invalidates publication.
 await hold();const other=path.join(appRoot,'databases/other-v047.sqlite');
 await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),other);await settled();
 await control('/release-test-export');await finish();assert.ok(!fs.existsSync(target));
 await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),raw);await settled();await route('connections');await route('integrated-results');await settled();
 report.checks.push({name:'T47-17 actual picker cancellation, status snapshot and Raw database invalidation',status:'PASS'});
 await clear();
 if(Number(process.env.JAA_UI_EXPECT_TOTAL)>=39281){
  const sentinel=path.join(appRoot,'exports/unrelated-v047.partial');fs.writeFileSync(sentinel,'synthetic preserve');
  await control('/select-test-export');await open();await button('全部欄位 JSON').click();
  await until(()=>fs.readdirSync(path.dirname(target)).some(n=>n.startsWith('synthetic-table-export.json.')&&n.endsWith('.partial')),30000);
  await button('取消匯出').evaluate(b=>b.click());await finish();assert.ok(!fs.existsSync(target));assert.equal(fs.readdirSync(path.dirname(target)).filter(n=>n.startsWith('synthetic-table-export.json.')&&n.endsWith('.partial')).length,0);assert.equal(fs.readFileSync(sentinel,'utf8'),'synthetic preserve');await open();
  report.checks.push({name:'T47-17 actual writing cancellation over39281 rows and own-partial cleanup',status:'PASS'});
 }
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const samples=[];
 for(let i=0;i<20;i++){
  await route('ai-results');await route('integrated-results');await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).setChecked(i%2===0);await settled();
  const a=await page.evaluate(()=>window.desktopApp.appDiagnostics.automaticState());const q=a.queryResources;assert.ok(!a.writerFailed);assert.ok(q.executorCount<=4);assert.equal(q.pendingCount,0);
  for(const e of q.executors){assert.equal(e.pendingCount,0);assert.ok(e.cacheBytes<=e.cacheBudgetBytes);for(const n of Object.values(e.listeners))assert.ok(n<=2);}
  const m=await cdp.send('Performance.getMetrics');samples.push({cycle:i+1,resources:q,rendererHeap:m.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,heapUnit:'bytes',rss:'per unique PID; do not sum worker RSS'});
 }
 await cdp.detach();report.checks.push({name:'T47-20 twenty actual route/status cycles; bounded executors, cache and listeners',status:'PASS',samples});
 await button('取消全選 AI').click();await settled();await until(async()=>Object.values((await page.evaluate(()=>window.desktopApp.uiPreferences.get())).preferences.aiViewerScopes).some(s=>Array.isArray(s.query?.filters?.analysisStatus?.values)&&s.query.filters.analysisStatus.values.length===0));
 await page.reload();await page.waitForFunction(()=>Boolean(window.desktopApp));await route('integrated-results');await settled();assert.equal(await total(),0);assert.equal(await page.locator('[data-ai-status-filter] input:checked').count(),0);
 report.checks.push({name:'T47-06 disk persisted explicit-empty survives renderer restart',status:'PASS'});
 await clear();
};
