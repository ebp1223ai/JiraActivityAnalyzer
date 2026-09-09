const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,seedRaw}=require('./v0343-test-helpers.cjs');
module.exports=async({page,control,route,report,work,appRoot,raw,until})=>{
 const target=path.join(appRoot,'exports/synthetic-table-export.json');
 await route('integrated-results');
 const hold=async()=>{await control('/hold-test-export');await page.getByText('匯出表格',{exact:true}).click();await page.getByRole('button',{name:'顯示欄位',exact:true}).click();await until(async()=>(await(await control('/test-export-state')).json()).pending);};
 const finished=()=>page.getByRole('button',{name:'取消匯出',exact:true}).waitFor({state:'hidden',timeout:30000});
 await hold();await page.getByRole('button',{name:'取消匯出',exact:true}).click();await control('/release-test-export');await finished();
 assert.equal(fs.existsSync(target),false,'Cancel while picker waits must never publish');
 report.checks.push({name:'T46-23 cancel during held picker prevents publication',status:'PASS'});
 await page.getByText('匯出表格',{exact:true}).click();
 await hold();await control('/cancel-test-export');await finished();assert.equal(fs.existsSync(target),false);
 await page.getByText('匯出表格',{exact:true}).click();
 const other=path.join(appRoot,'databases/edge-other.sqlite');
 seedRaw(other,[{id:'edge-other',issue:'OTHER-2',actor:'Other DB',eventTime:'2026-09-01T00:00:00Z'}],work,'edge-other-db');
 await hold();await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),other);await page.waitForFunction(()=>document.body.textContent.includes('1 / 1 筆'));
 await control('/release-test-export');await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),raw);await route('integrated-results');await finished();assert.equal(fs.existsSync(target),false);
 report.checks.push({name:'T46-23 native-picker cancel and DB change reject stale publication',status:'PASS'});


 const filterActor=async text=>{await page.getByTitle('Filter Actor',{exact:true}).click();const d=page.locator('[data-filter-column="displayName"]');await d.getByRole('tab',{name:'文字條件',exact:true}).click();await d.getByLabel('文字比對方式').selectOption('exact');await d.getByPlaceholder('實際文字條件').fill(text);await d.getByRole('button',{name:'套用',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-table-id][aria-busy="true"]'));};
 await filterActor('Export User');await page.waitForFunction(()=>document.body.textContent.includes('40 / 39,281 筆'));
 await hold();await filterActor('Other User');await page.waitForFunction(n=>document.body.textContent.includes(n.toLocaleString()+' / 39,281 筆'),39281-55-28-JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v0.3.46/05_fixtures/v046/presentation-cases.json'))).cases.length);await control('/release-test-export');await finished();assert.equal(JSON.parse(fs.readFileSync(target)).rows.length,40);
 fs.renameSync(target,path.join(work,'picker-original-query.json'));await page.getByText('匯出表格',{exact:true}).click();
 report.checks.push({name:'T46-23 filter change during picker keeps original 40-row snapshot',status:'PASS'});
 const sentinel=path.join(appRoot,'exports/unrelated-job.partial');fs.writeFileSync(sentinel,'synthetic preserve');
 await control('/select-test-export');await page.getByText('匯出表格',{exact:true}).click();await page.getByRole('button',{name:'全部欄位 JSON',exact:true}).click();
 await until(()=>fs.readdirSync(path.dirname(target)).some(n=>n.startsWith('synthetic-table-export.json.')&&n.endsWith('.partial')),30000);
 await page.getByRole('button',{name:'取消匯出',exact:true}).evaluate(b=>b.click());await finished();assert.equal(fs.existsSync(target),false);assert.equal(fs.readdirSync(path.dirname(target)).filter(n=>n.startsWith('synthetic-table-export.json.')&&n.endsWith('.partial')).length,0);assert.equal(fs.readFileSync(sentinel,'utf8'),'synthetic preserve');
 report.checks.push({name:'T46-23 real in-flight full export cancel stops worker and cleans only own partial',status:'PASS'});

 await route('connections');
 const pkg=path.join(root,'tests/fixtures/v0.3.43/v201/package-ai-only-55.json');
 for(const source of ['manual','unknown']){
  const ai=path.join(appRoot,'databases/ai-analysis/legacy-'+source+'.sqlite');
  const created=await page.evaluate(filePath=>window.desktopApp.aiDatabase.create({requestId:'legacy-create',filePath}),ai);assert.equal(created.ok,true);
  const preflight=await page.evaluate(filePath=>window.desktopApp.aiDatabase.preflight({requestId:'legacy-preflight',filePath}),pkg);assert.equal(preflight.ok,true);
  const imported=await page.evaluate(filePath=>window.desktopApp.aiDatabase.importPackage({requestId:'legacy-import',filePath,confirmed:true}),pkg);assert.equal(imported.ok,true);
  const id=imported.snapshot.databaseId,scope='v043|ai|'+report.selectedDatabase.databaseId+'|'+id+'|old|2';
  const columns=['eventTime','action','issueKey','issueTypeName','currentStatusName','currentPriorityName','obsolete-column'];
  const saved={query:{page:2,pageSize:25,sort:{field:'eventTime',direction:'asc'},filters:{}},preferences:{visibleColumns:columns,columnOrder:columns,columnWidths:{issueTypeName:233}},session:{scrollLeft:0,scrollTop:0,expandedRowIds:[]}};
  await page.evaluate(({scope,saved})=>window.desktopApp.uiPreferences.update({section:'aiViewerScopes',value:{[scope]:saved}}),{scope,saved});
  await route('ai-results');assert.equal(await page.getByLabel('每頁').inputValue(),'25');assert.ok((await page.locator('[data-table-id]').innerText()).includes('2／3'));
  for(const label of ['Issue Type','Status','Priority'])assert.equal(await page.locator('th').filter({hasText:label}).count(),1);
  const width=await page.locator('th').filter({hasText:'Issue Type'}).evaluate(el=>el.style.width);assert.equal(width,'233px');
  await until(async()=>Object.keys((await page.evaluate(()=>window.desktopApp.uiPreferences.get())).preferences.aiViewerScopes).some(k=>k.startsWith('v045|ai|')&&k.includes(id)));
  await page.reload();await page.waitForFunction(()=>Boolean(window.desktopApp));await route('ai-results');assert.equal(await page.getByLabel('每頁').inputValue(),'25');assert.ok((await page.locator('[data-table-id]').innerText()).includes('2／3'));
  report.checks.push({name:'T46-20 old '+source+' preferences real UI + persisted current scope reload',status:'PASS'});
  await route('connections');
 }

};
