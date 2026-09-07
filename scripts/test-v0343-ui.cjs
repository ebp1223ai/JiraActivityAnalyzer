const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('@playwright/test');
const { root, seedRaw } = require('./v0343-test-helpers.cjs');
const work = path.resolve(process.env.JAA_UI_EVIDENCE || path.join(root, 'test-artifacts/v0.3.43', `ui-${Date.now()}`));
const appRoot = path.resolve(process.env.JAA_UI_APP_ROOT || path.join(work, 'app-root'));
const exe = process.env.JAA_UI_EXECUTABLE || require('electron');
const packaged = Boolean(process.env.JAA_UI_EXECUTABLE);
const fixtures = path.join(root, 'tests/fixtures/v0.3.43/v201');
const ai = path.join(appRoot, 'databases/ai-analysis/synthetic.sqlite');
const raw = path.join(appRoot, 'databases/raw.sqlite');
const pkg = path.join(fixtures, 'package-ai-only-55.json');
const screens = path.join(work, 'screenshots');
fs.mkdirSync(screens, { recursive: true });
if (!fs.existsSync(path.join(appRoot, '.env'))) { fs.mkdirSync(appRoot,{recursive:true}); fs.writeFileSync(path.join(appRoot,'.env'),'# Synthetic isolated UI test configuration\\n'.replace('\\n','\n')); }
if (!fs.existsSync(raw)) seedRaw(raw, JSON.parse(fs.readFileSync(pkg)).records, work);
const report = { version: '0.3.43', packaged, exe, appRoot, captureMethod: 'Playwright Electron BrowserWindow.capturePage stayHidden (renderer only)', manualGui: 'PENDING', states: [], checks: [], errors: [] };
let app, page;
const start=Date.now();
async function main() {
  app = await electron.launch({ executablePath: exe, args: packaged ? [] : [root], cwd: root, env: { ...process.env, ELECTRON_UI_SMOKE: '0', JAA_DEV_APP_ROOT: appRoot, JAA_V043_BACKGROUND: '1', OPEN_DEVTOOLS: '0' }, timeout: 45000 });
  app.process().stdout?.on('data', data => fs.appendFileSync(path.join(work, 'stdout.log'), data));
  app.process().stderr?.on('data', data => fs.appendFileSync(path.join(work, 'stderr.log'), data));
  page=await app.firstWindow();
  page.on('pageerror', e=>report.errors.push(e.message));
  await page.waitForFunction(()=>Boolean(window.desktopApp?.aiDatabase), { timeout: 15000 });
  await app.evaluate(({ BrowserWindow }) => { const w=BrowserWindow.getAllWindows()[0]; w.setMinimumSize(400,300); w.hide(); });
  const actual=await app.evaluate(({ app })=>({version:app.getVersion(),userData:app.getPath('userData'),exe:app.getPath('exe')}));
  assert.equal(actual.version,'0.3.43');report.runtime=actual;report.sourceCommit=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(process.env.JAA_UI_REOPEN_ONLY==='1') {
    const resumed=await page.evaluate(()=>window.desktopApp.aiDatabase.lifecycle({requestId:'ui-reopen'}));assert.equal(resumed.snapshot.canQuery,true,JSON.stringify(resumed));assert.ok(resumed.snapshot.databasePath.startsWith(appRoot),JSON.stringify(resumed));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,720));
    for(const name of ['ai-database','ai-results','integrated-results']) {await route(name);await capture(name,'relocated-reopen',1280,720);}
    const rows=await page.evaluate(()=>window.desktopApp.aiDatabase.queryIntegrated({requestId:'ui-reopen-query',page:1,pageSize:100}));assert.equal(rows.ok,true,JSON.stringify(rows));assert.equal(rows.totalCount,55);
    report.checks.push({name:'existing-relative-AI-Raw-settings-reopen',status:'PASS',rows:rows.totalCount});report.status='PASS';return;
  }
  const select=await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),raw);assert.equal(select.saved,true,JSON.stringify(select));
  const initial=await page.evaluate(()=>window.desktopApp.aiDatabase.lifecycle({requestId:'ui-initial'}));
  if (!initial.snapshot.canQuery) {
    const rawOnly=await page.evaluate(()=>window.desktopApp.aiDatabase.queryIntegrated({requestId:'ui-raw-only',page:1,pageSize:100}));assert.equal(rawOnly.ok,true,JSON.stringify(rawOnly));assert.equal(rawOnly.totalCount,55);
    const facet=await page.evaluate(()=>window.desktopApp.aiDatabase.distinct({requestId:'ui-raw-facet',kind:'integrated',field:'issueKey',query:{}}));assert.equal(facet.ok,true,JSON.stringify(facet));assert.ok(facet.values.length>0);
    report.checks.push({name:'real-IPC-Raw-only-query-and-facet-with-AI-closed',status:'PASS'});
    const created=await page.evaluate(filePath=>window.desktopApp.aiDatabase.create({requestId:'ui-create',filePath}),ai);assert.equal(created.ok,true,JSON.stringify(created));
  }
  const preflight=await page.evaluate(filePath=>window.desktopApp.aiDatabase.preflight({requestId:'ui-preflight',filePath}),pkg);assert.equal(preflight.ok,true,JSON.stringify(preflight));
  const imported=await page.evaluate(filePath=>window.desktopApp.aiDatabase.importPackage({requestId:'ui-import',filePath,confirmed:true}),pkg);assert.equal(imported.ok,true,JSON.stringify(imported));
  const links=await page.evaluate(()=>window.desktopApp.aiDatabase.relink({requestId:'ui-relink'}));assert.equal(links.ok,true,JSON.stringify(links));assert.equal(links.counts.PRIMARY_MATCHED,55,JSON.stringify(links));
  report.checks.push({name:'real-preload-import-relink',status:'PASS',counts:links.counts});
  async function route(name) {
    await page.evaluate(name=>{ location.hash=`#/${name}`; },name);
    await page.waitForFunction(name=>location.hash===`#/${name}` && document.querySelector('h1'),name);
    const headings={'ai-results':'AI 結果檢視','integrated-results':'整合顯示結果','ai-database':'AI 分析資料庫'}; if(headings[name]) await page.locator('h1').filter({hasText:headings[name]}).waitFor();
    if(['ai-results','integrated-results'].includes(name)) { await page.waitForSelector('tr.activity-event-summary-row',{timeout:20000}); await page.waitForFunction(()=>!document.querySelector('[data-table-id][aria-busy="true"]')); }
    await page.waitForTimeout(150);
  }
  async function capture(name,state,width,height) {
    const filename=`${name}-${state}-${width}x${height}.png`;
    await app.evaluate(async ({BrowserWindow})=>{ await BrowserWindow.getAllWindows()[0].capturePage(undefined,{stayHidden:true}); });
    await page.waitForTimeout(100);
    const png=await app.evaluate(async ({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage(undefined,{stayHidden:true})).toPNG().toString('base64')); fs.writeFileSync(path.join(screens,filename),Buffer.from(png,'base64'));
    const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,sidebar:!!document.querySelector('aside'),heading:document.querySelector('h1')?.textContent}));
    assert.ok(dimensions.html<=dimensions.width+1 && dimensions.body<=dimensions.width+1,JSON.stringify(dimensions));
    report.states.push({filename,state,page:name,...dimensions});
  }
  const sizes=process.env.JAA_UI_SHORT==='1'?[[1280,720]]:[[1920,1080],[1440,900],[1280,720],[1024,768],[800,600]];
  for(const [width,height] of sizes) {
    await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
    for(const name of ['ai-database','ai-results','integrated-results']) { await route(name); await capture(name,'normal',width,height); }
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,720));
  await route('ai-results');
  await page.getByLabel('每頁').selectOption('100');
  await page.waitForFunction(()=>document.querySelectorAll('tr.activity-event-summary-row').length===55);
  assert.ok(await page.locator('tbody').innerText().then(s=>s.includes('FTL_ERROR_HANDLE')));
  await page.getByTitle('Filter AI 分類狀態',{exact:true}).click();
  await page.getByRole('dialog').getByText('已分類 / CLASSIFIED',{exact:true}).waitFor();
  await capture('ai-results','filter',1280,720);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'查看來源與分析'}).first().click();
  await page.getByRole('tab',{name:'已配對原始事件'}).click();
  await capture('ai-results','source-tabs',1280,720);
  await page.getByRole('button',{name:'欄位',exact:true}).click();await capture('ai-results','column-chooser',1280,720);
  const css=async()=>page.locator('.btn').first().evaluate(element=>{const s=getComputedStyle(element);return {height:element.getBoundingClientRect().height,padding:s.padding,font:s.font,fontFamily:s.fontFamily,radius:s.borderRadius,display:s.display,align:s.alignItems,gap:s.gap};});
  await route('database');const original=await css();await capture('database','shared-controls',1280,720);
  await route('ai-database');const current=await css();
  const primary=page.getByRole('button',{name:'匯入 Package v2'});await primary.hover();await capture('ai-database','primary-hover',1280,720);await primary.focus();await capture('ai-database','primary-focus',1280,720);
  for(const key of ['padding','fontFamily','radius','display','align','gap']) assert.equal(current[key],original[key],key);
  assert.ok(Math.abs(current.height-original.height)<=1,JSON.stringify({original,current}));report.styles={original,current};
  for(const name of ['connections','users','issues','settings']) {await route(name);report.checks.push({name:`original-route-${name}`,status:'PASS',heading:await page.locator('h1').innerText()});}
  // Restore query/page/scroll across routes and database identities via the real preferences bridge.
  await route('ai-results');await page.getByLabel('每頁').selectOption('25');await page.getByTitle('Next page',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-table-id]')?.textContent.includes('2／3'));
  const tableScroll=page.locator('[data-table-scroll-container]');await tableScroll.evaluate(e=>{e.scrollLeft=300;});await page.waitForTimeout(350);
  await route('database');await route('ai-results');assert.equal(await page.getByLabel('每頁').inputValue(),'25');assert.ok(await page.locator('[data-table-id]').innerText().then(t=>t.includes('2／3')));
  const b=path.join(appRoot,'databases/ai-analysis/empty-b.sqlite');
  const bCreate=await page.evaluate(filePath=>window.desktopApp.aiDatabase.create({requestId:'ui-create-b',filePath}),b);assert.equal(bCreate.ok,true);
  await route('ai-database');await capture('ai-database','empty-database',1280,720);
  await page.evaluate(()=>{location.hash='#/ai-results';});await page.getByText('找不到符合篩選條件的資料 / No matching records',{exact:true}).waitFor();await capture('ai-results','empty-database',1280,720);
  const back=await page.evaluate(filePath=>window.desktopApp.aiDatabase.openSwitch({requestId:'ui-back-a',filePath}),ai);assert.equal(back.ok,true);
  await route('database');await route('ai-results');assert.equal(await page.getByLabel('每頁').inputValue(),'25');assert.ok(await page.locator('[data-table-id]').innerText().then(t=>t.includes('2／3')));
  await page.getByTitle('Filter Issue Key',{exact:true}).click();await page.getByRole('tab',{name:'文字條件',exact:true}).click();
  const input=page.getByPlaceholder('實際文字條件');await input.fill('NO_MATCH_中文_%');
  await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});assert.equal(await page.getByRole('dialog').count(),1);
  await input.press('Enter');await page.getByText('找不到符合篩選條件的資料 / No matching records',{exact:true}).waitFor();await capture('ai-results','empty-filter',1280,720);
  await page.getByRole('button',{name:'Clear All Filters / 清除全部篩選'}).click();await page.waitForSelector('tr.activity-event-summary-row');
  report.checks.push({name:'route-db-A-B-A-page-scroll-and-IME-filter',status:'PASS'});
  // Negative query/facet faults alter only this test's isolated Raw DB, never mock successful DTOs.
  const {DatabaseSync}=require('node:sqlite');const rawDb=new DatabaseSync(raw);rawDb.exec('ALTER TABLE activity_events RENAME TO hidden_events');rawDb.close();
  try {
    await page.getByTitle('Filter AI 分類狀態',{exact:true}).click();await page.getByRole('alert').filter({hasText:'候選查詢失敗'}).waitFor();await capture('ai-results','facet-error',1280,720);await page.keyboard.press('Escape');
    await page.evaluate(()=>{location.hash='#/integrated-results';});await page.getByText(/no such table: activity_events/).first().waitFor();await capture('integrated-results','query-error',1280,720);
  }finally{const db=new DatabaseSync(raw);db.exec('ALTER TABLE hidden_events RENAME TO activity_events');db.close();}
  await route('ai-database');await page.getByText('更多操作',{exact:true}).click();await capture('ai-database','more-menu',1280,720);
  for(const factor of [1.25,1.5]){await app.evaluate(({BrowserWindow},factor)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor),factor);await capture('ai-database',`renderer-zoom-${factor}`,1280,720);}await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await page.getByText('更多操作',{exact:true}).click();
  const badFile=path.join(work,'invalid-package.json');fs.writeFileSync(badFile,JSON.stringify({schemaName:'jira-activity-analyzer.pending-analysis'}));
  await app.evaluate(({dialog},file)=>{globalThis.v043OriginalPicker=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},badFile);
  try{await page.getByRole('button',{name:'匯入 Package v2'}).click();await page.getByText('Preflight Failed',{exact:true}).waitFor();await capture('ai-database','import-error',1280,720);}finally{await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.v043OriginalPicker;});}
  const partial=JSON.parse(fs.readFileSync(path.join(fixtures,'package-review-partial-55.json')));partial.packageId+='-ui-conflict';partial.records[0].sourceTrace.diff.fullText={before:'Synthetic original text',after:'Synthetic analysis-time text'};
  const partialFile=path.join(work,'partial-conflict.json');fs.writeFileSync(partialFile,JSON.stringify(partial));
  const p=await page.evaluate(filePath=>window.desktopApp.aiDatabase.preflight({requestId:'ui-partial-preflight',filePath}),partialFile);assert.equal(p.ok,true,JSON.stringify(p.errors));
  const receipt=await page.evaluate(filePath=>window.desktopApp.aiDatabase.importPackage({requestId:'ui-partial-import',filePath,confirmed:true}),partialFile);assert.equal(receipt.ok,true);
  await route('database');await route('ai-results');await page.getByLabel('每頁').selectOption('100');await page.waitForFunction(()=>document.querySelectorAll('tr.activity-event-summary-row').length===55);
  await page.getByRole('button',{name:'查看來源與分析'}).last().click();await page.getByText('來源內容不同，分析快照與原始事件分開保留。',{exact:true}).waitFor();await capture('ai-results','source-conflict-partial-review',1280,720);
  report.checks.push({name:'invalid-import-picker-and-real-partial-conflict-package',status:'PASS',picker:'test-only deterministic file selection; actual preflight/import IPC'});
  report.dpiNote='Renderer zoom scenarios are not an OS Windows DPI change; native Windows 125%/150% remains a manual gate.';
  report.checks.push({name:'real-SQL-query-facet-error-ui-and-menu',status:'PASS'});
  assert.equal(report.errors.length,0,report.errors.join('\n'));
  report.status='PASS';
}
main().catch(error=>{report.status='FAIL';report.errors.push(error.stack||String(error));console.error(error);process.exitCode=1;}).finally(async()=>{if(page) { report.dom=await page.locator('body').innerText().catch(()=> 'unavailable'); } if(app)await app.close().catch(()=>{});report.durationMs=Date.now()-start;fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log(`UI evidence: ${work}`);});
