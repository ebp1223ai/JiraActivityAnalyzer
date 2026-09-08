const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),art=path.join(root,'test-artifacts/v0.3.44'),reports=path.join(root,'reports');
const input=path.join(fs.readFileSync(path.join(art,'input-root.txt'),'utf8').trim(),'JiraActivityAnalyzer_v0.3.44_Complete_Codex_Input');
const spec=fs.readFileSync(path.join(input,'06_acceptance/JAA_v0.3.44_Test_Plan.md'),'utf8');
const rows=spec.split('\n').filter(l=>/^\| T44-/.test(l)).map(l=>{const p=l.split('|').map(s=>s.trim());return {id:p[1],name:p[2],requirement:p[3],expected:p[4]};});
const evidence=[];
for(const name of fs.readdirSync(art)){const dir=path.join(art,name);if(!fs.statSync(dir).isDirectory())continue;for(const file of ['report.json','results.json']){const full=path.join(dir,file);if(!fs.existsSync(full))continue;try{const r=JSON.parse(fs.readFileSync(full));evidence.push({path:path.relative(root,full),...r});}catch{}}}
const current=path.join(reports,'JiraActivityAnalyzer_v0.3.44_Acceptance.json');
const prior=fs.existsSync(current)?JSON.parse(fs.readFileSync(current)).cases:[];
const cases=rows.map(r=>({...r,status:'NOT_RUN',evidence:[],note:'Pending complete requirement-specific review; a matching test title alone is not PASS.',...prior.find(p=>p.id===r.id)}));
fs.writeFileSync(current,JSON.stringify({version:'0.3.44',overall:'IN_PROGRESS',manualGui:'PENDING',generatedAt:new Date().toISOString(),cases,evidenceIndex:evidence.map(e=>({path:e.path,status:e.status,results:e.results?.map(r=>({name:r.name,status:r.status}))}))},null,2));
const main=fs.readFileSync(path.join(root,'electron/main.ts'),'utf8'),app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
const files=['electron/main.ts','electron/aiAnalysisDatabaseIpcV042.ts'];
const channels=files.flatMap(f=>[...fs.readFileSync(path.join(root,f),'utf8').matchAll(/instrumentedHandleV044\("([^"]+)"/g)].map(m=>({channel:m[1],file:f,boundary:'START / progress / END via instrumentedHandleV044',internalStageCoverage:'requires operation-specific audit'})));
const routes=[...app.matchAll(/<Route path="([^"]+)" element=\{<([^ >]+)/g)].map(m=>({route:m[1],component:m[2],redirect:m[2]==='Navigate'}));
fs.writeFileSync(path.join(reports,'JiraActivityAnalyzer_v0.3.44_Instrumentation_Coverage.json'),JSON.stringify({version:'0.3.44',status:'PARTIAL_AUDIT',routes,channels,archivedAi:{activeRegistration:main.includes('registerAiAnalysisIpc('),routeRedirect:true},warning:'Registration coverage is not proof of every internal repository/background stage. Uncovered stages must remain explicit.'},null,2));
const commands=fs.readFileSync(path.join(art,'commands.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
fs.writeFileSync(path.join(reports,'JiraActivityAnalyzer_v0.3.44_Execution_Time_Ledger.json'),JSON.stringify({version:'0.3.44',status:'IN_PROGRESS',startedAt:'2026-09-07T19:40:41.0555979+08:00',recordedAt:new Date().toISOString(),wallClockMs:Date.now()-Date.parse('2026-09-07T19:40:41.0555979+08:00'),preReadDurationMs:null,preReadDurationReason:'UNAVAILABLE',tokenUsage:null,tokenUsageReason:'UNAVAILABLE: no runtime token meter supplied',commands,readonlyToolCalls:'Some exploratory tool calls lack command-level timing; not fabricated.',sourceCommit:null,finalReportCommit:null},null,2));
console.log(JSON.stringify({cases:cases.length,activeRoutes:routes.filter(r=>!r.redirect).length,channels:channels.length,evidence:evidence.length,commandCount:commands.length}));
