const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {union,delta}=require('./work-timeline-v0347.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'reports/v0.3.48');
const esc=x=>String(x??'UNAVAILABLE').replaceAll('|',' / ').replace(/\r?\n/g,' ');
function render(d){
 assert.equal(new Set(d.operations.map(o=>o.id)).size,d.operations.length);
 const cutoff=d.cutoff??new Date().toISOString(),wall=Date.parse(cutoff)-Date.parse(d.start);
 const snap=id=>typeof id==='object'?id:d.snapshots.find(s=>s.id===id)?.budgets?.codex?.primary;
 const coverage=union(d.operations.filter(o=>o.end).map(o=>[Date.parse(o.start),Date.parse(o.end)]));
 const lines=['# v0.3.48 完整工作明細','',`開始 ${d.start}；截止 ${cutoff}；wall ${wall/1000} 秒。`,
 '活動包含工具等待，不代表純寫碼或模型 CPU 時間。共享帳戶百分點不是 Token 消耗。','',
 '| ID／活動 | 狀態 | 起訖UTC | 秒 | Codex剩餘前→後 | 差異／證據 |','|---|---|---|---:|---|---|'];
 for(const o of d.operations){const a=snap(o.before),b=snap(o.after);lines.push(`| ${o.id}／${esc(o.activity)} | ${o.status} | ${o.start} → ${o.end??'OPEN'} | ${o.end?((Date.parse(o.end)-Date.parse(o.start))/1000).toFixed(3):'OPEN'} | ${a?100-a.usedPercent:'?'} → ${b?100-b.usedPercent:'?'}% | ${esc(o.codeChangeRef??'REPORT_INCOMPLETE: 未保存獨立階段 diff，參見最終 baseline 差異')}；${esc(o.refs??o.evidence??'WorkLedger.json')} |`);}
 const phases = {}; for (const o of d.operations) if(o.end) phases[o.phase]=(phases[o.phase]??0)+Date.parse(o.end)-Date.parse(o.start);
 lines.push('','## 階段彙總（活動窗，含工具等待）','| Phase | 秒 |','|---|---:|',...Object.entries(phases).map(([name,ms])=>'| '+name+' | '+(ms/1000).toFixed(3)+' |'));
 lines.push('','## 各工作項全部額度窗口','| Operation | Budget/window | Before remaining | After remaining | Used delta pp |','|---|---|---:|---:|---:|');
 for(const o of d.operations){const a=d.snapshots.find(s=>s.id===o.before),b=d.snapshots.find(s=>s.id===o.after);for(const key of new Set([...Object.keys(a?.budgets??{}),...Object.keys(b?.budgets??{})]))for(const w of ['primary','secondary']){const x=a?.budgets?.[key]?.[w],y=b?.budgets?.[key]?.[w];if(x||y)lines.push('| '+[o.id,key+'/'+w,x?100-x.usedPercent:'UNAVAILABLE',y?100-y.usedPercent:'UNAVAILABLE',delta(x,y)??'UNAVAILABLE'].join(' | ')+' |');}}
 lines.push('','## 公開進度');
 for(const e of d.publicEvents)lines.push('- '+esc(e.recordedAt??e.at)+' '+esc(e.operation??'READ-01')+'：'+esc(e.text));
 lines.push('','## 命令與失敗','| ID／活動 | 起訖 | exit | 摘要 |','|---|---|---|---|');
 for(const c of d.commands)lines.push(`| ${c.id}／${c.operation} | ${c.start} → ${c.completedAt??c.end} | ${c.exitCode??'RUNNING'} | ${esc(c.cmd).slice(0,220)}；${esc(c.output).slice(-160)} |`);
 lines.push('','## 額度快照：所有來源窗口','| ID | 取得時間 | budget | window | used | remaining | reset |','|---|---|---|---|---:|---:|---|');
 for(const s of d.snapshots??[])for(const [key,b]of Object.entries(s.budgets))for(const name of ['primary','secondary'])if(b[name]){const v=b[name];lines.push(`| ${s.id} | ${s.receivedAt} | ${key}/${name} | ${v.windowDurationMins}min | ${v.usedPercent} | ${100-v.usedPercent} | ${v.resetsAt} |`);}
 lines.push('','## 統計與缺口',`已結束活動聯集 ${coverage/1000} 秒；其餘開放或未知 ${(wall-coverage)/1000} 秒。命令是子區間，不加進活動總和。`,
 '第一批讀取為 BATCH_SHARED，含README、Prompt、規範分段及基準盤點；未保存各次I/O獨立前後快照，不冒稱逐檔100%。首次自動載入之前與平台訊息ID不可取得。精確input/cached/output/reasoning/total Token及上下文%=UNAVAILABLE。',
 '非同步命令的 completedAt 是觀測到結束的時間，不是可知的精確程序退出時間；包含輪詢前空檔，不冒稱純命令 CPU 或精確 execution duration。',
 ...d.notes.map(n=>'- '+n));
 return lines.join('\n')+'\n';
}
if(process.argv[2]==='test'){assert.equal(union([[0,10],[5,15]]),15);assert.equal(delta(null,{}),null);assert.equal(delta({usedPercent:2,resetsAt:1,windowDurationMins:7},{usedPercent:1,resetsAt:1,windowDurationMins:7}),null);assert.throws(()=>render({operations:[{id:1},{id:1}]}));console.log('PASS work timeline overlap/missing/reset/duplicate');}
else {const d=JSON.parse(fs.readFileSync(path.join(dir,'WorkLedger.json')));fs.writeFileSync(path.join(dir,'WorkTimeline.md'),render(d));console.log('Rendered '+d.operations.length+' activities');}
module.exports={render};
