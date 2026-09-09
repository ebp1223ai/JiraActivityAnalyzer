const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),excluded='reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md';
function category(f){return f.startsWith('tests/fixtures/')?'FIXTURE_DATA':/^(tests\/|scripts\/(test-|v0347-|profile-))/.test(f)?'TEST_CODE':/^scripts\//.test(f)?'DELIVERY_ACCOUNTING_TOOL':/^(reports\/|docs\/)|\.md$/.test(f)?'DOC_REPORT':/^(package.*\.json|VERSION)$/.test(f)?'VERSION_METADATA':'PRODUCT_CODE';}
function stage(o){if(!o.codeChangeRef)return [];const ref=o.codeChangeRef.replaceAll('\\\\','\\');if(!ref.startsWith(path.join(root,'test-artifacts','v0.3.47')+path.sep)||!fs.existsSync(ref))return null;return JSON.parse(fs.readFileSync(ref)).map(c=>({...c,category:category(c.file)}));}
function baseline(){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const stats=git('diff','--numstat','130c5adb597d1cd5f8f4ffed26df9d6d79614885','--','src','electron','shared','scripts','tests/fixtures/v0.3.47','reports/v0.3.47','package.json','package-lock.json','VERSION','CHANGELOG.md').split('\n').filter(Boolean);
 const fresh=git('ls-files','--others','--exclude-standard','--','src','electron','shared','scripts','tests/fixtures/v0.3.47','reports/v0.3.47').split('\n').filter(Boolean);
 const rows=[];
 for(const line of stats){const [a,d,f]=line.split('\t');if(f===excluded)continue;rows.push({file:f,added:Number(a),deleted:Number(d),category:category(f)});}
 for(const f of fresh){const t=fs.readFileSync(path.join(root,f),'utf8');rows.push({file:f,added:t?t.split('\n').length-(t.endsWith('\n')?1:0):0,deleted:0,category:category(f)});}
 return rows;
}
function summary(rows){return rows.reduce((a,r)=>{const v=a[r.category]??={files:0,added:0,deleted:0};v.files++;v.added+=r.added;v.deleted+=r.deleted;v.net=v.added-v.deleted;return a;},{});}
function markdown(data){
 const lines=['','## 程式差異與監測成本','','階段 churn 與最終 baseline 淨差異分開，不相加。報告行數是本次 render 寫入前快照；最終報告結算另有明確 cutoff，不遞迴追算自身。使用者 v0.2.47 既有修改及原有未追蹤資料排除。',''];
 for(const o of data.operations){const rows=stage(o);if(rows===null)lines.push('- operation '+o.id+'：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。');else if(rows.length)lines.push('- operation '+o.id+'：'+rows.map(r=>r.file+' ['+r.category+'] +'+r.added+' / -'+r.deleted+' / net '+(r.added-r.deleted)).join('；'));}
 const final=baseline();lines.push('','### 最終 Baseline 淨差異','','| 類別 | 檔案 | 新增 | 刪除 | 淨增減 |','|---|---:|---:|---:|---:|');for(const [k,v]of Object.entries(summary(final)))lines.push('| '+[k,v.files,v.added,v.deleted,v.net].join(' | ')+' |');
 lines.push('','| 檔案 | 類別 | + | - | net |','|---|---|---:|---:|---:|');for(const r of final)lines.push('| '+[r.file,r.category,r.added,r.deleted,r.added-r.deleted].join(' | ')+' |');
 const quotaMs=data.operations.flatMap(o=>Object.values(o.quotaTiming??{})).reduce((n,[a,b])=>n+Date.parse(b)-Date.parse(a),0);
 lines.push('', '已量測額度工具往返 '+(quotaMs/1000).toFixed(3)+' 秒；包含在各操作/總 wall-clock 的部分不可再加總。帳本寫入工具尾段未完整單獨量測。','精確 Token=UNAVAILABLE；共享帳戶其他活動=UNKNOWN；quota freshness/delay=UNKNOWN。其他額度池未逐項保留，僅首筆原始工具快照可得；不補造。','部分診斷/圖像讀取與錯誤工具呼叫未落入命令帳；列為未分類缺口。op63/64 的 PowerShell 非終止 missing-file 訊息不可被 exit 0 解讀成讀取成功。op41 公開事件欄位錯誤及一次重疊 append 被拒絕，後續成功序列未重複計費。');
 return lines.join('\n');
}
function test(){
 assert.equal(category('src/a.tsx'),'PRODUCT_CODE');assert.equal(category('tests/fixtures/v0.3.47/a.json'),'FIXTURE_DATA');
 assert.deepEqual(summary([{category:'A',added:5,deleted:3},{category:'A',added:2,deleted:4}]),{A:{files:2,added:7,deleted:7,net:0}});
 assert.equal(stage({codeChangeRef:'C:\\outside\\missing'}),null);
 const {union,delta,render}=require('./work-timeline-v0347.cjs');
 assert.equal(union([[0,60],[10,20],[50,100]]),100);assert.equal(delta(null,{usedPercent:1}),null);
 assert.equal(delta({resetsAt:1,windowDurationMins:7,usedPercent:2},{resetsAt:1,windowDurationMins:7,usedPercent:1}),null);
 assert.throws(()=>render({operations:[{id:1},{id:1}],events:[]}),/duplicate/);
 assert.throws(()=>render({operations:[],events:[{operations:[8]}]}),/orphan/);
 console.log('PASS classification/net/overlap/missing/reset/decreasing/duplicate/orphan checks');
}
module.exports={category,stage,baseline,summary,markdown};
if(require.main===module)test();
