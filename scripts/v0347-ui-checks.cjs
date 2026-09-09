const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {seedRaw}=require('./v0343-test-helpers.cjs');
module.exports=async({page,control,route,report,work,appRoot,raw,ai,until})=>{
 const s=JSON.parse(fs.readFileSync(path.join(work,'seed-map.json')));
 const checks=report.checks;const push=checks.push.bind(checks);checks.push=(...items)=>{const n=push(...items);fs.writeFileSync(path.join(work,'progress.json'),JSON.stringify({at:new Date().toISOString(),checks},null,2));return n;};const statuses=['CLASSIFIED','UNKNOWN','EXCLUDED','FAILED','NOT_ANALYZED'];
 const settled=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForFunction(()=>!document.querySelector('[data-table-id][aria-busy="true"]'),null,{timeout:30000,polling:25});};
 const total=()=>page.locator('[data-table-id]').first().innerText().then(t=>Number(/篩選後 ([\d,]+)/.exec(t)?.[1].replaceAll(',','')));
 const button=n=>page.getByRole('button',{name:n,exact:true});
 const clear=async()=>{await button('清除全部篩選').click();await settled();};
 const selected=()=>page.locator('[data-ai-status-filter] input:checked').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
 const quick=page.getByTestId('diff-quick-filters').locator('input');
 const noQuick=async()=>{for(let i=0;i<4;i++){await quick.nth(i).setChecked(false);await settled();}};
 const textFilter=async(label,id,text)=>{await page.getByTitle('Filter '+label,{exact:true}).click();const d=page.locator('[data-filter-column="'+id+'"]');await d.getByRole('tab',{name:'文字條件',exact:true}).click();await d.getByLabel('文字比對方式').selectOption('exact');await d.getByPlaceholder('實際文字條件').fill(text);await d.getByRole('button',{name:'套用',exact:true}).click();await settled();};
 const date=async(from,to,precise=false,invalid=false,waitForIdle=true)=>{await page.getByTitle('Filter Time',{exact:true}).click();const d=page.locator('[data-filter-column="eventTime"]');await d.getByRole('tab',{name:'範圍',exact:true}).click();await d.getByLabel('精確日期時間',{exact:false}).setChecked(precise);await d.getByLabel('起日',{exact:true}).fill(from);await d.getByLabel('迄日',{exact:true}).fill(to);await d.getByRole('button',{name:'套用',exact:true}).click();if(invalid){await d.getByRole('alert').waitFor();await page.keyboard.press('Escape');}if(waitForIdle)await settled();};
 const events=()=>{const dir=path.join(appRoot,'logs/sessions');return fs.readdirSync(dir).flatMap(d=>fs.readdirSync(path.join(dir,d)).filter(n=>/^automatic-\d+\.ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(dir,d,n),'utf8').split('\n').filter(Boolean).map(JSON.parse)));};
 const jobs=()=>events().filter(e=>e.phase==='START'&&e.event==='ipc.ai-database:query-integrated').length;
 const snap=async(name)=>{const f=path.join(work,'screenshots',name+'.png');fs.writeFileSync(f,Buffer.from(await(await control('/capture')).arrayBuffer()));report.screenshots.push({file:f,appOnly:true});};
 await route('integrated-results');await settled();
 if(process.env.JAA_V047_UI_FOCUS!=='tail'){
 assert.deepEqual(await selected(),statuses.slice(0,4));
 await noQuick();assert.equal(await total(),55);
 await button('取消全選 AI').click();await settled();assert.equal(await total(),0);
 await route('ai-results');await route('integrated-results');assert.deepEqual(await selected(),[]);assert.equal(await total(),0);
 await clear();assert.deepEqual(await selected(),statuses);assert.equal(await total(),s.total);
 await button('恢復預設').click();await settled();assert.deepEqual(await selected(),statuses.slice(0,4));
 await noQuick();assert.equal(await total(),55);
 checks.push({name:'T47-01/06/07 actual defaults, explicit empty persistence, clear-all and reset',status:'PASS'});
 // One state model: header selection must immediately update the top checkboxes.
 await page.getByTitle('Filter AI 分類狀態',{exact:true}).click();
 let d=page.locator('[data-filter-column="analysisStatus"]');
 await d.getByRole('button',{name:'Clear Draft / 清除草稿',exact:true}).click();
 await d.locator('label').filter({hasText:'CLASSIFIED'}).getByRole('checkbox').check();
 await d.getByRole('button',{name:'套用',exact:true}).click();await settled();
 assert.deepEqual(await selected(),['CLASSIFIED']);assert.equal(await total(),s.pkg.records.filter(r=>r.aiAnalysis.status==='CLASSIFIED').length);
 await page.getByRole('checkbox',{name:'UNKNOWN',exact:true}).check();await settled();
 await page.getByTitle('Filter Actor',{exact:true}).click();d=page.locator('[data-filter-column="displayName"]');
 await d.getByRole('button',{name:'Select All Search Results / 全選搜尋結果',exact:true}).waitFor();
 await until(async()=>await d.locator('label input[type="checkbox"]').count()>=2);
 const labels=await d.locator('label').filter({has:page.locator('input[type="checkbox"]')}).allTextContents();
 // Select two actual actor values, then compute the independent seed expectation.
 const actorNames=[...new Set(s.pkg.records.map(r=>r.sourceTrace.reference.actor.displayValue))].slice(0,2);
 await d.getByRole('button',{name:'Clear Draft / 清除草稿',exact:true}).click();
 for(const a of actorNames)await d.locator('label').filter({has:page.locator('span[title="'+a+'"]')}).getByRole('checkbox').check();
 await d.getByRole('button',{name:'套用',exact:true}).click();await settled();
 const expected=s.pkg.records.filter(r=>['CLASSIFIED','UNKNOWN'].includes(r.aiAnalysis.status)&&actorNames.includes(r.sourceTrace.reference.actor.displayValue)).length;
 const tz=await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);assert.equal(tz,'Asia/Taipei');
 for(const [from,to,n] of [['2026-09-07','2026-09-07',expected],['2026-09-06','2026-09-08',expected],['2026-09-07','',expected],['','2026-09-07',expected],['2026-09-08','2026-09-08',0]]){
  await date(from,to);assert.equal(await total(),n);await route('ai-results');await route('integrated-results');assert.equal(await total(),n);
 }
 const eligible=s.pkg.records.filter(r=>['CLASSIFIED','UNKNOWN'].includes(r.aiAnalysis.status)&&actorNames.includes(r.sourceTrace.reference.actor.displayValue));
 await date('2026-09-07T08:00','2026-09-07T08:00',true);assert.equal(await total(),eligible.filter(r=>Date.parse(r.sourceTrace.reference.eventTime)===Date.parse('2026-09-07T00:00:00Z')).length);
 const afterBoundary=eligible.filter(r=>Date.parse(r.sourceTrace.reference.eventTime)>Date.parse('2026-09-07T00:00:00Z')).length;
 await date('2026-09-07T08:00:00.001','2026-09-08T08:00',true);assert.equal(await total(),afterBoundary);
 await date('2026-09-08','2026-09-06',false,true);assert.equal(await total(),afterBoundary);
 checks.push({name:'T47-08 actual date AND AI multiselect AND Actor multiselect; inclusive day/time boundary, one-sided, invalid, timezone, A-B-A',status:'PASS',actorNames,expected,tz});
 }
 await clear();await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).uncheck();await settled();
 await page.getByLabel('每頁',{exact:false}).selectOption('100');await settled();
 // Same event's main Diff on actual pages, not a formatter-only oracle.
 const mainDiff=async(eventId)=>{const r=page.locator('tr[data-event-id="'+eventId+'"]');await r.waitFor();const index=await page.locator('th').evaluateAll(es=>es.findIndex(e=>e.textContent.includes('Diff')));assert.ok(index>=0);return r.locator('td').nth(index).innerText();};
 const diffs={};report.mainDiffEvidence=diffs;
 const renderedVersions=async(eventId)=>{const r=page.locator('tr[data-event-id="'+eventId+'"]');const index=await page.locator('th').evaluateAll(es=>es.findIndex(e=>e.textContent.includes('Diff')));return r.locator('td').nth(index).evaluate(el=>{const segments=[...el.querySelectorAll('span.whitespace-pre-wrap')];if(segments.length)return {before:segments.filter(e=>!e.className.includes('bg-emerald')).map(e=>e.textContent).join(''),after:segments.filter(e=>!e.className.includes('bg-rose')).map(e=>e.textContent).join('')};return {before:el.textContent,after:el.textContent};});};
 for(const m of s.mapping){diffs[m.eventId]=await mainDiff(m.eventId);const rendered=await renderedVersions(m.eventId);if(m.expected.removedText)assert.ok(rendered.before.includes(m.expected.removedText),JSON.stringify({case:m.caseId,rendered,text:diffs[m.eventId]}));if(m.expected.addedText)assert.ok(rendered.after.includes(m.expected.addedText),JSON.stringify({case:m.caseId,rendered,text:diffs[m.eventId]}));if(m.expected.reason){assert.ok(diffs[m.eventId].includes('AI 差異不可用'));assert.ok(!diffs[m.eventId].includes(m.raw.after));}}
 await clear();await textFilter('Issue Key','issueKey','RAW-1');assert.ok((await mainDiff('raw-only-description')).includes('Raw Event'));await snap('integrated-main-ai-diff');
 await route('ai-results');await noQuick();await page.getByLabel('每頁',{exact:false}).selectOption('100');await settled();
 for(const m of s.mapping)assert.equal(await mainDiff(m.eventId),diffs[m.eventId]);
 for(const i of [7,8])assert.ok((await mainDiff(s.pkg.records[i].sourceTrace.reference.activityEventId)).includes('Synthetic full comment '+i));
 await snap('ai-main-same-diff');
 await route('users');await button('All Users / 全部使用者').click();await button('All Activity Events').click();await settled();await noQuick();
 await page.getByTitle('Filter Issue Key',{exact:true}).click();const userFilter=page.locator('[data-filter-column="issueKey"]');await userFilter.locator('input').fill(s.pkg.records[0].sourceTrace.reference.issueKey);await until(async()=>await page.locator('tr[data-event-id="'+s.mapping[0].eventId+'"]').count()>0);await settled();await userFilter.getByRole('button',{name:'關閉',exact:true}).click();
 const rawText=await mainDiff(s.mapping[0].eventId);report.userRawDiffEvidence=rawText;assert.ok(rawText.includes('current raw line'),rawText);assert.ok(!rawText.includes('old AI line'));
 assert.ok((await mainDiff('event-001')).includes('old Raw'));await snap('user-main-raw-diff');
 for(const i of [7,8]){await page.getByTitle('Filter Issue Key',{exact:true}).click();const d=page.locator('[data-filter-column="issueKey"]');await d.locator('input').fill(s.pkg.records[i].sourceTrace.reference.issueKey);await until(async()=>await page.locator('tr[data-event-id="'+s.pkg.records[i].sourceTrace.reference.activityEventId+'"]').count()>0);await settled();await d.getByRole('button',{name:'關閉',exact:true}).click();assert.ok((await mainDiff(s.pkg.records[i].sourceTrace.reference.activityEventId)).includes('Synthetic full comment '+i));}
 checks.push({name:'T47-09/10/11/13 same events actual User Raw vs AI/Integrated AI; compact and unavailable main cells',status:'PASS',events:s.mapping.map(m=>m.eventId),rawText,diffs});
 await route('integrated-results');await clear();await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).uncheck();await settled();
 await page.getByLabel('每頁',{exact:false}).selectOption('25');await settled();await page.getByTitle('Next page',{exact:true}).click();await settled();
 const state=()=>page.evaluate(()=>({rows:[...document.querySelectorAll('tr.activity-event-summary-row')].map(e=>e.textContent),headers:[...document.querySelectorAll('th')].map(e=>e.textContent),page:document.querySelector('button[title="Next page"]')?.parentElement?.textContent}));
 const wanted=await state(),restores=[];
 for(let i=0;i<5;i++){await route('ai-results');const n=jobs(),t=performance.now();await route('integrated-results');await settled();assert.deepEqual(await state(),wanted);assert.equal(jobs(),n);restores.push({durationMs:performance.now()-t,newJobs:0});}
 // Filter changes reset page, and counts remain the complete filtered set.
 await page.getByRole('checkbox',{name:'UNKNOWN',exact:true}).uncheck();await settled();assert.match((await state()).page,/1[／/]/);
 checks.push({name:'T47-18 five actual A-B-A, cache reuse, page and rows preserved; filtering resets page',status:'PASS',restores});
 await clear();await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).uncheck();await settled();
 const hold=async()=>{await control('/hold-test-query');await button('重新整理').evaluate(b=>b.click());await until(async()=>{const s=await(await control('/test-query-state')).json();return s.entered>0?s:null;});};
 const release=async()=>{await control('/release-test-query');await settled();};
 await hold();let n=jobs();await page.evaluate(()=>{location.hash='#/connections';});await page.waitForFunction(()=>document.querySelector('h1')?.textContent.includes('Connections'));await page.evaluate(()=>{location.hash='#/integrated-results';});await page.locator('[data-ai-status-filter]').waitFor();assert.equal(jobs(),n);await release();assert.equal(await total(),55);
 await hold();await page.getByRole('checkbox',{name:'UNKNOWN',exact:true}).uncheck();await release();assert.equal(await total(),s.pkg.records.filter(r=>r.aiAnalysis.status!=='UNKNOWN').length);assert.deepEqual(await selected(),['CLASSIFIED','EXCLUDED','FAILED']);
 await hold();await date('2026-09-08','2026-09-08',false,false,false);await release();assert.equal(await total(),0);await clear();await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).uncheck();await settled();await page.getByRole('checkbox',{name:'UNKNOWN',exact:true}).uncheck();await settled();
 const other=path.join(appRoot,'databases/other-v047.sqlite');seedRaw(other,[{id:'other',issue:'OTHER-1',actor:'Other',eventTime:'2026-09-07T00:00:00Z',fieldName:'Comment',eventType:'comment_created',after:{body:'Only other DB'}}],work,'other-v047');
 await hold();await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),other);await release();
 await until(async()=>await page.locator('[data-result-counts]').innerText().then(t=>t.includes('Raw 總筆數 1')));assert.equal(await total(),0);
 await clear();assert.equal(await total(),1);assert.ok((await page.locator('tr.activity-event-summary-row').innerText()).includes('OTHER-1'));
 await page.evaluate(filePath=>window.desktopApp.databases.selectExisting({filePath}),raw);await settled();await until(async()=>await total()===s.pkg.records.filter(r=>r.aiAnalysis.status!=='UNKNOWN').length);
 const emptyAi=path.join(appRoot,'databases/ai-analysis/other-v047.sqlite');
 await hold();await page.evaluate(()=>{location.hash='#/connections';});await page.waitForFunction(()=>document.querySelector('h1')?.textContent.includes('Connections'));
 const created=await page.evaluate(filePath=>window.desktopApp.aiDatabase.create({requestId:'v047-switch-ai',filePath}),emptyAi);assert.equal(created.ok,true);
 await control('/release-test-query');await route('integrated-results');await settled();assert.equal(await total(),0);
 const restored=await page.evaluate(filePath=>window.desktopApp.aiDatabase.openSwitch({requestId:'v047-restore-ai',filePath}),ai);assert.equal(restored.ok,true);await route('connections');await route('integrated-results');await settled();
 checks.push({name:'T47-19 barrier-confirmed real pending query, route reconnect, filter/Raw/AI switch, late response exclusion',status:'PASS'});
 await clear();await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).uncheck();await settled();
 const exports=[];
 for(const name of ['顯示欄位','全部欄位 JSON','顯示欄位 CSV','全部欄位 CSV']){
  const target=path.join(appRoot,'exports/synthetic-table-export.json');if(fs.existsSync(target))fs.renameSync(target,path.join(work,'earlier-export-'+exports.length));
  await control('/select-test-export');await page.getByText('匯出表格',{exact:true}).click();await button(name).click();await until(()=>fs.existsSync(target),30000);await button('取消匯出').waitFor({state:'hidden'});const value=fs.readFileSync(target,'utf8');
  if(!name.includes('CSV'))assert.equal(JSON.parse(value).rows.length,55);else assert.ok(value.includes('old AI line'));
  exports.push({name,bytes:fs.statSync(target).size,sha256:require('node:crypto').createHash('sha256').update(value).digest('hex')});await page.getByText('匯出表格',{exact:true}).click();
 }
 checks.push({name:'T47-16 four actual UI exports all55 filtered records over25 row page',status:'PASS',exports});
 await require('./v0347-ui-edgechecks.cjs')({page,control,route,report,work,appRoot,raw,ai,until,settled,clear,total,button});
 report.v047SourceUiGates={T47_08:process.env.JAA_V047_UI_FOCUS!=='tail',T47_13:true,T47_19:true};
};
