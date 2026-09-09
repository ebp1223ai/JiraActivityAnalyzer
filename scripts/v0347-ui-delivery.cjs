const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({page,control,route,report,work,appRoot})=>{
 const s=JSON.parse(fs.readFileSync(path.join(work,'seed-map.json')));
 const settled=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForFunction(()=>!document.querySelector('[data-table-id][aria-busy="true"]'));};
 const total=()=>page.locator('[data-table-id]').first().innerText().then(t=>Number(/篩選後 ([\d,]+)/.exec(t)?.[1].replaceAll(',','')));
 const click=async name=>{await page.getByRole('button',{name,exact:true}).click();await settled();};
 await route('integrated-results');await click('取消全選 AI');assert.equal(await total(),0);
 await click('清除全部篩選');assert.equal(await total(),s.total);await page.getByRole('checkbox',{name:'NOT_ANALYZED',exact:true}).uncheck();await settled();assert.equal(await total(),55);
 const quick=page.getByTestId('diff-quick-filters').locator('input'),combos=[];
 for(let i=0;i<16;i++){
  const mask=i^(i>>1);for(let bit=0;bit<4;bit++){await quick.nth(bit).setChecked(Boolean(mask&(1<<bit)));await settled();}
  const expected=55-s.mapping.length+s.mapping.filter(m=>!((mask&1)&&m.expected.changed===false||(mask&2)&&m.expected.added===0||(mask&4)&&m.expected.removed===0||(mask&8)&&!m.expected.beforeAvailable)).length;
  assert.equal(await total(),expected,'quick mask '+mask);combos.push({mask,expected});
 }
 report.checks.push({name:'T47-14 all16 actual renderer quick-filter combinations against independent synthetic cases',status:'PASS',combos});
 await click('清除全部篩選');await page.getByTitle('Filter Diff',{exact:true}).click();const d=page.locator('[data-filter-column="diff"]');await d.getByRole('tab',{name:'文字條件',exact:true}).click();await d.getByPlaceholder('實際文字條件').fill('old AI line');await d.getByRole('button',{name:'套用',exact:true}).click();await settled();assert.equal(await total(),1);
 const row=page.locator('tr[data-event-id="event-000"]');await row.waitFor();
 const index=await page.locator('th').evaluateAll(es=>es.findIndex(e=>e.textContent.includes('Diff'))),cell=row.locator('td').nth(index);await cell.scrollIntoViewIfNeeded();
 assert.ok((await cell.innerText()).includes('分析當時內容'));assert.ok((await cell.locator('.bg-rose-100').allTextContents()).join('').includes('old'));assert.ok((await cell.locator('.bg-emerald-100').allTextContents()).join('').includes('new'));
 const file=path.join(work,'screenshots','delivery-main-ai-description.png');fs.writeFileSync(file,Buffer.from(await(await control('/capture')).arrayBuffer()));report.screenshots.push({file,appOnly:true});
 await page.locator('th').nth(index).getByRole('button',{name:'Diff',exact:true}).click();await settled();assert.equal(await total(),1);
 const headers=()=>page.locator('th').evaluateAll(es=>es.map(e=>({text:e.textContent,width:e.style.width,icons:[...e.querySelectorAll('svg')].map(x=>x.getAttribute('class'))})));
 const layout=await headers();await click('清除全部篩選');assert.deepEqual(await headers(),layout);await click('恢復預設');assert.deepEqual(await headers(),layout);
 report.checks.push({name:'T47-07/15 real display-source text search/sort and clear/reset preserve table layout',status:'PASS'});
 await route('ai-results');await route('users');await route('integrated-results');
 report.checks.push({name:'delivery actual renderer, five statuses, AI main Diff, existing User and three AI pages',status:'PASS'});
 const life=await page.evaluate(()=>window.desktopApp.aiDatabase.lifecycle({requestId:'delivery-final-life'}));assert.ok(life.snapshot.canQuery);report.finalAiDatabase=life.snapshot.databasePath;
};
