const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'release/v0.3.45-candidate'),record=path.join(root,'test-artifacts/v0.3.45/freeze.json');
const git=(...a)=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const files=git('ls-files','-z').split('\0').filter(f=>f&&!f.startsWith('reports/'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const inputs=files.map(file=>({file,sha256:hash(file)}));
const names=['win-unpacked/Jira Activity Analyzer.exe','Jira Activity Analyzer Setup 0.3.45.exe','Jira Activity Analyzer Portable 0.3.45.exe'];
assert.ok(names.every(n=>!fs.existsSync(path.join(output,n))),'A v0.3.45 EXE already exists; do not rebuild blindly.');
const state={version:'0.3.45',sourceCommit:git('rev-parse','HEAD'),startedAt:new Date().toISOString(),firstExe:null,inputs,status:'PACKAGING',policy:'After first EXE, source/UI/tests/package inputs frozen. Report-only changes permitted. No Tag/Push without manual gate.'};
const save=()=>fs.writeFileSync(record,JSON.stringify(state,null,2));save();
function observe(){if(state.firstExe)return;for(const name of names){const file=path.join(output,name);if(fs.existsSync(file)){const stat=fs.statSync(file);state.firstExe={path:file,creationTimeUtc:stat.birthtime.toISOString(),observedAt:new Date().toISOString(),observationIntervalMs:100};save();break;}}}
const timer=setInterval(observe,100);
const child=cp.spawn(process.execPath,['scripts/v0345-command.cjs','npm.cmd','run','dist'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,JAA_DIST_OUTPUT_DIR:output,JAA_ALLOW_DIRTY_PACKAGE:'1'}});
child.on('error',e=>{clearInterval(timer);state.status='FAILED';state.error=e.message;save();process.exitCode=1;});
child.on('exit',code=>{observe();clearInterval(timer);state.finishedAt=new Date().toISOString();state.exitCode=code;state.changedInputs=inputs.filter(i=>hash(i.file)!==i.sha256).map(i=>i.file);state.status=code===0&&!state.changedInputs.length?'FROZEN':'FAILED';save();process.exitCode=state.status==='FROZEN'?0:1;});
