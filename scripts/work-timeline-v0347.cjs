const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'reports/v0.3.47');
const file = path.join(dir, 'WorkLedger.json');
const esc = x => String(x ?? 'UNAVAILABLE').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
function union(intervals) {
  let end = -Infinity, total = 0;
  for (const [a,b] of intervals.filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a,b) => a[0]-b[0])) {
    total += Math.max(0, b-Math.max(a,end)); end = Math.max(end,b);
  }
  return total;
}
function delta(a,b) { return a && b && a.resetsAt === b.resetsAt && a.windowDurationMins === b.windowDurationMins && b.usedPercent >= a.usedPercent ? b.usedPercent-a.usedPercent : null; }
function render(data) {
  assert.equal(new Set(data.operations.map(o=>o.id)).size,data.operations.length,'duplicate operation');
  for (const e of data.events) for (const id of e.operations) assert.ok(data.operations.some(o=>o.id===id),'orphan public event');
  const ms = union(data.operations.map(o=>[Date.parse(o.startedAt),Date.parse(o.endedAt)]));
  const wall = Date.parse(data.cutoff)-Date.parse(data.startedAt);
  const lines = ['# v0.3.47 WorkTimeline', '', '即時工作聯表。公開說明不是測試 PASS；COMMAND_ONLY / FILE_IO_ONLY 不代表完整模型閱讀或寫碼時間。', '',
    `開始：${data.startedAt}；截止：${data.cutoff}。命令觀測聯集 ${(ms/1000).toFixed(3)} 秒；wall-clock ${(wall/1000).toFixed(3)} 秒；未分類 ${(Math.max(0,wall-ms)/1000).toFixed(3)} 秒。`,
    '帳戶百分比為共用窗口觀測，非精確 Token；0pp 不代表零 Token。各工作項包含查詢及工具往返，不能與子命令相加。', '',
    '| ID／工作與目的 | 結果 | 起訖 UTC | 秒／範圍 | Codex 前→後剩餘／pp | 階段差異 | 證據 |', '|---|---|---|---|---|---|---|'];
  for (const o of data.operations) lines.push(`| ${o.id}：${esc(o.label)} | ${o.exitCode===0?'PASS':o.exitCode===null?'RECORDED':'FAIL '+o.exitCode} | ${o.startedAt}<br>${o.endedAt} | ${(o.elapsedMs/1000).toFixed(3)}／${o.measurementScope||'COMMAND_ONLY'} | ${o.before?100-o.before.usedPercent:'UNAVAILABLE'}% → ${o.after?100-o.after.usedPercent:'UNAVAILABLE'}%／${delta(o.before,o.after)??'N/A'}pp | ${esc(o.codeChangeRef||'N/A：非修改作業')} | WorkLedger.json operation ${o.id} |`);
  lines.push('', '## 公開進度', '');
  for (const e of data.events) lines.push(`- ${e.id}／${e.recordedAt}／${e.status}／operations ${e.operations.join(', ')}：${e.text}`);
  lines.push('', '## 來源與缺口', '', 'Task/session 使用本機任務識別，平台訊息 ID 與精確 Token usage 不可得。首個工具前的 Prompt 無 BEFORE；起始既有修改排除。FILE_IO_ONLY 不含工具回傳後的模型處理；空檔不推估為 coding。帳本產生、最後回覆尾段在本次截止後另列，不無限更新。', '', `已記操作 ${data.operations.length}；已知公開事件 ${data.events.length}。未聲稱平台完整對話覆蓋。`);
  if(data.operations.length) lines.push(require('./work-ledger-audit-v0347.cjs').markdown(data));
  return lines.join('\n')+'\n';
}
function append(batch) {
  fs.mkdirSync(dir,{recursive:true});
  const d=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schemaVersion:'1.0.0',taskId:'JAA-v0347-20260909-104850',sessionId:'local-v0347-1',startedAt:'2026-09-09T10:48:50.000Z',baseline:'130c5adb597d1cd5f8f4ffed26df9d6d79614885',exactTokens:null,operations:[],events:[]};
  for (const o of batch.operations||[]) { const prior=d.operations.find(x=>x.id===o.id);if(prior)assert.deepEqual(prior,o,'CONFLICTING duplicate append');else d.operations.push(o); }
  for (const e of batch.events||[]) if(!d.events.some(x=>x.id===e.id)) d.events.push(e);
  d.cutoff=new Date().toISOString();
  const md=render(d);
  fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');fs.writeFileSync(path.join(dir,'WorkTimeline.md'),md);
  console.log(JSON.stringify({operations:d.operations.length,events:d.events.length,cutoff:d.cutoff}));
}
if(require.main===module) {
  if(process.argv[2]==='test') {
    assert.equal(union([[0,60],[20,50],[60,90]]),90);
    assert.equal(union([[0,10],[5,20],[30,40]]),30);
    assert.equal(delta({usedPercent:1,resetsAt:1,windowDurationMins:7},{usedPercent:2,resetsAt:2,windowDurationMins:7}),null);
    assert.equal(delta({usedPercent:1,resetsAt:1,windowDurationMins:7},{usedPercent:1,resetsAt:1,windowDurationMins:7}),0);
    assert.throws(()=>render({operations:[],events:[{operations:[1]}]}),/orphan/);
    console.log('WorkTimeline synthetic accounting checks PASS');
  } else append(JSON.parse(process.argv[2].startsWith('@') ? fs.readFileSync(path.resolve(root,process.argv[2].slice(1)), 'utf8') : process.argv[2]));
}
module.exports={union,delta,render};
