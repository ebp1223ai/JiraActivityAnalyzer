const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
module.exports = async ({page,control,route,report,appRoot,until}) => {
  const events = () => {
    const base=path.join(appRoot,'logs/sessions');
    return fs.readdirSync(base).flatMap(dir=>fs.readdirSync(path.join(base,dir)).filter(n=>/^automatic-\d+\.ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(base,dir,n),'utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}})));
  };
  const jobCount=()=>events().filter(e=>e.phase==='START'&&/^ipc.ai-database:query-(integrated|results)$/.test(e.event)).length;
  await route('ai-results');
  assert.equal(await page.locator('th').filter({hasText:'Issue Type'}).count(),0,'AI new default includes absent source field');
  await route('integrated-results');
  let expectedExportRows=report.dataset.expectedRawTotal;
  if(report.dataset.expectedRawTotal===39281) {
    await page.getByTitle('Filter Actor',{exact:true}).click(); const filter=page.locator('[data-filter-column="displayName"]');
    await filter.getByRole('tab',{name:'文字條件',exact:true}).click(); await filter.getByLabel('文字比對方式').selectOption('exact'); await filter.getByPlaceholder('實際文字條件').fill('Export User'); await filter.getByRole('button',{name:'套用',exact:true}).click();
    await page.waitForFunction(()=>document.body.textContent.includes('40 / 39,281 筆')&&!document.querySelector('[data-table-id][aria-busy="true"]'),null,{polling:25}); expectedExportRows=40;
  }
  const samples=[];
  for(let i=0;i<5;i++) {
    await route('ai-results'); const before=jobCount(),start=performance.now();
    await page.evaluate(()=>{location.hash='#/integrated-results';});
    await page.waitForFunction(()=>document.querySelector('[data-testid="integrated-results-page"] tr.activity-event-summary-row') && !document.querySelector('[data-table-id][aria-busy="true"]'),null,{polling:25});
    await control('/capture');
    const elapsedMs=performance.now()-start,after=jobCount();
    assert.equal(after,before,'navigation started a duplicate query');assert.ok(elapsedMs<=1000,'cache restore '+elapsedMs);
    samples.push({elapsedMs,newQueryJobs:after-before});
  }
  report.checks.push({name:'v045-five-real-cache-restores-zero-query-jobs',status:'PASS',samples});
  const exported=[];
  for(let i=0;i<5;i++) {
    const target=path.join(appRoot,'exports/synthetic-table-export.json');
    if(fs.existsSync(target))fs.renameSync(target,path.join(appRoot,'exports',`previous-synthetic-export-${Date.now()}-${i}.json`));
    await control('/select-test-export');
    await page.getByText('匯出表格',{exact:true}).click();
    await page.getByRole('button',{name:'顯示欄位',exact:true}).evaluate(button=>button.addEventListener('click',()=>{window.__v045ExportClick=performance.timeOrigin+performance.now();},{once:true,capture:true}));
    const at=performance.now(); await page.getByRole('button',{name:'顯示欄位',exact:true}).click();
    await until(()=>fs.existsSync(target));
    const endedAt=performance.timeOrigin+performance.now(); const clickAt=await page.evaluate(()=>window.__v045ExportClick); assert.ok(Number.isFinite(clickAt));
    const elapsedMs=endedAt-clickAt, data=JSON.parse(fs.readFileSync(target));
    assert.equal(data.rows.length,expectedExportRows); assert.equal(data.fields.length,17); if(expectedExportRows===40)assert.ok(fs.statSync(target).size>=30*1024&&fs.statSync(target).size<=40*1024,'32KiB export profile');
    assert.ok(elapsedMs<=2000,'ready export '+elapsedMs);
    exported.push({elapsedMs,actionPreparationAndProcessingMs:performance.now()-at,rows:data.rows.length,columns:data.fields.length,bytes:fs.statSync(target).size});
    await page.getByRole('button',{name:'取消匯出',exact:true}).waitFor({state:'hidden'});
    await page.getByText('匯出表格',{exact:true}).click();
  }
  report.checks.push({name:'v045-five-UI-ready-complete-exports',status:'PASS',samples:exported,picker:'nonce-isolated automatic picker; actual picker span retained'});
  const debug=await page.evaluate(()=>window.desktopApp.appDebug.saveBundle({debugLog:'Synthetic v045 diagnostics test',currentPage:'/integrated-results'}));
  report.debugExport=debug;
  const root=path.join(appRoot,'exports/debug-folders');
  const dirs=fs.readdirSync(root).map(n=>path.join(root,n)).filter(p=>fs.statSync(p).isDirectory());
  const summaries=dirs.map(p=>path.join(p,'automatic-diagnostics/current/snapshot-summary.json')).filter(p=>fs.existsSync(p));
  assert.ok(summaries.length>0,'debug collector omitted automatic journal');
  const snapshot=JSON.parse(fs.readFileSync(summaries.at(-1)));
  assert.equal(snapshot.completeness,'COMPLETE_THROUGH_WATERMARK');
  assert.ok(snapshot.files.some(f=>/^automatic-\d+\.ndjson$/.test(f.file)));
  assert.ok(events().some(e=>e.event==='export-completed'));
  const snapshotDir=path.dirname(summaries.at(-1)); const legacy=JSON.parse(fs.readFileSync(path.join(snapshotDir,'session-summary.json'))); const legacyCounts={};
  for(const channel of ['main','renderer','transitions']) { const files=fs.readdirSync(snapshotDir).filter(name=>name===channel+'.ndjson'||name.startsWith(channel+'.ndjson.')&&name.endsWith('.rotated')); const count=files.reduce((n,file)=>n+fs.readFileSync(path.join(snapshotDir,file),'utf8').split('\n').filter(Boolean).length,0); legacyCounts[channel]=count; assert.equal(legacy.eventCounts[channel]??0,count,'stale legacy count '+channel); }
  report.legacyCutoffCounts=legacyCounts;
  const cdp=await page.context().newCDPSession(page); await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1.25,mobile:false}); await route('integrated-results'); await control('/capture'); assert.equal(await page.evaluate(()=>devicePixelRatio),1.25); await cdp.send('Emulation.clearDeviceMetricsOverride'); await cdp.detach();
  report.checks.push({name:'v045-renderer-125-percent-scale',status:'PASS',method:'Chromium device metrics emulation, not Windows system DPI'});
  report.checks.push({name:'v045-real-debug-export-cutoff',status:'PASS',cutoffUtc:snapshot.cutoffUtc,files:snapshot.files.length,gaps:snapshot.gaps.length});
};
