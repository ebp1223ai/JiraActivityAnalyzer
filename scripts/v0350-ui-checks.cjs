const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({page,report,route,control,appRoot,until})=>{
 const events=()=>{const root=path.join(appRoot,'logs','sessions');return fs.readdirSync(root).flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(n=>/^automatic-\d+\.ndjson$/.test(n)).flatMap(n=>fs.readFileSync(path.join(root,dir,n),'utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}})));};
 const queries=()=>events().filter(e=>e.phase==='START'&&/^ipc.ai-database:query-(integrated|results)$/.test(e.event)).length;
 const settle=async()=>{await page.waitForFunction(()=>document.querySelector('tr.activity-event-summary-row')&&!document.querySelector('[data-table-id][aria-busy="true"]'),null,{polling:10});};
 for(const name of ['ai-results','integrated-results']){
  await route(name);await settle();
  const headers=await page.locator('[data-table-id] thead th').allTextContents();
  assert.ok(!headers.some(h=>/^Diff/.test(h.trim())),JSON.stringify(headers));
  assert.ok(headers.some(h=>h.includes('AI 建議技能')));report.checks.push({name:name+' fresh six/default Diff OFF',status:'PASS',headers});
  await route('connections');const before=queries(),start=performance.now();
  await page.evaluate(name=>{location.hash='#/'+name;},name);await settle();
  const elapsed=performance.now()-start,after=queries();assert.equal(after,before,name+' revisit issued query');
  assert.ok(elapsed<=500,name+' revisit '+elapsed+'ms exceeds 500ms');
  report.checks.push({name:name+' completed reattach zero IPC',status:'PASS',elapsedMs:elapsed,targetMs:name==='ai-results'?150:100,limitMs:500,measurement:'route dispatch to committed DOM rows and aria-busy=false; hidden-window frame scheduling excluded; visible paint remains manual gate'});
 }
 await control('/hold-test-query');
 await page.getByRole('button',{name:'重新整理',exact:true}).evaluate(b=>b.click());
 await until(async()=> (await(await control('/test-query-state')).json()).entered===1);
 const before=queries();await route('connections');await page.evaluate(()=>{location.hash='#/integrated-results';});
 await page.getByRole('button',{name:'取消查詢',exact:true}).waitFor();
 assert.equal((await(await control('/test-query-state')).json()).entered,1);assert.equal(queries(),before);
 report.checks.push({name:'in-flight detach/reattach no cancel/no second executor',status:'PASS'});
 await page.getByRole('button',{name:'取消查詢',exact:true}).click();
 await until(async()=>!await page.getByRole('button',{name:'正在取消…',exact:true}).count());
 await control('/release-test-query');
 await page.getByRole('button',{name:'重新整理',exact:true}).evaluate(b=>b.click());await settle();
 assert.ok(!await page.getByRole('alert').count());report.checks.push({name:'explicit cancel/retry excludes cancelled promise',status:'PASS'});
 await require('./v0349-ui-checks.cjs')({page,report,route});
 const lag=events().filter(e=>e.event==='event-loop-lag');assert.deepEqual(lag.filter(e=>e.details?.lagMs>2000),[],'Main/Renderer >2s lag');
 report.checks.push({name:'Main/Renderer no observed >2s loop lag',status:'PASS',samples:lag.map(e=>e.details)});
};
