const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),release=path.join(root,'release/v0.3.44-candidate');
const work=path.join(root,'test-artifacts/v0.3.44',`windows-${Date.now()}`);fs.mkdirSync(work,{recursive:true});
const report={status:'RUNNING',manualGui:'PENDING',tag:'NOT_RUN',push:'NOT_RUN',results:[],artifacts:[]};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function command(exe,args,env={}){const at=Date.now();const r=cp.spawnSync(exe,args,{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,...env},maxBuffer:10*1024**2});report.results.push({command:[exe,...args],exitCode:r.status,durationMs:Date.now()-at,stdout:r.stdout,stderr:r.stderr,error:r.error?.message});fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));assert.equal(r.status,0,r.stderr||r.stdout||r.error?.message);}
function ui(appRoot,exe,name,reopen=false){command(process.execPath,['scripts/test-v0344-ui.cjs'],{JAA_UI_EXECUTABLE:exe,JAA_UI_APP_ROOT:appRoot,JAA_UI_EVIDENCE:path.join(work,name),JAA_UI_REOPEN_ONLY:reopen?'1':'0',JAA_UI_SHORT:'0',JAA_UI_DEEP:'0',JAA_UI_WORKBENCH:'0'});const r=JSON.parse(fs.readFileSync(path.join(work,name,'report.json')));assert.equal(r.status,'PASS');return r;}
function inside(p){assert.ok(path.resolve(p).startsWith(path.resolve(work)+path.sep),'test path outside isolated workspace');return p;}
try{
  for(const relative of ['Jira Activity Analyzer Setup 0.3.44.exe','Jira Activity Analyzer Portable 0.3.44.exe','win-unpacked/Jira Activity Analyzer.exe']){const file=path.join(release,relative),size=fs.statSync(file).size;report.artifacts.push({path:file,bytes:size,MiB:size/1024**2,sha256:sha(file)});}
  const archive=path.join(release,'win-unpacked/resources/app.asar'),entries=asar.listPackage(archive);
  const forbidden=entries.filter(f=>/(?:^|[\\/])(?:fixtures|test-artifacts|08_private_local_only|\.env|token\.txt|playwright-core|@playwright)(?:[\\/]|$)|\.(sqlite3?|db|7z|zip)$/i.test(f));assert.deepEqual(forbidden,[]);
  const sizes=entries.flatMap(file=>{const stat=asar.statFile(archive,file.replace(/^[/\\]+/,''));return stat.files?[]:[{file,bytes:stat.size??0}];});const dirs={};for(const entry of sizes){const key=entry.file.replaceAll('\\','/').split('/').slice(0,4).join('/');dirs[key]=(dirs[key]??0)+entry.bytes;}
  report.asar={path:archive,sha256:sha(archive),bytes:fs.statSync(archive).size,forbidden,top50Files:sizes.sort((a,b)=>b.bytes-a.bytes).slice(0,50),top20Directories:Object.entries(dirs).sort((a,b)=>b[1]-a[1]).slice(0,20)};
  const unpacked=inside(path.join(work,'unpacked 獨立測試'));fs.cpSync(path.join(release,'win-unpacked'),unpacked,{recursive:true,errorOnExist:true,force:false});ui(unpacked,path.join(unpacked,'Jira Activity Analyzer.exe'),'unpacked-ui');
  const portableRoot=inside(path.join(work,'Portable 中文 空白'));fs.mkdirSync(portableRoot);const name='Jira Activity Analyzer Portable 0.3.44.exe';fs.copyFileSync(path.join(release,name),path.join(portableRoot,name),fs.constants.COPYFILE_EXCL);assert.deepEqual(fs.readdirSync(portableRoot),[name]);
  const first=ui(portableRoot,path.join(portableRoot,name),'portable-ui');
  const ai=path.join(portableRoot,'databases/ai-analysis/synthetic.sqlite'),before=sha(ai);
  const moved=inside(path.join(work,'搬移後 Portable Space'));assert.ok(!fs.existsSync(moved));fs.renameSync(inside(portableRoot),moved);assert.ok(!fs.existsSync(portableRoot));assert.equal(sha(path.join(moved,'databases/ai-analysis/synthetic.sqlite')),before);
  const restored=ui(moved,path.join(moved,name),'portable-relocated-ui',true);report.relocation={oldRoot:portableRoot,newRoot:moved,originalAbsent:true,aiHashBefore:before,aiHashAfterCopy:before,restoredDatabaseId:restored.restored.databaseId,actualAppPid:restored.actualAppPid,launcherPid:restored.launcherPid};
  report.status='PASS';report.installer='Separate isolated install/uninstall command required; not implied by artifact presence.';
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e);process.exitCode=1;}
finally{fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log('Windows evidence '+work);}
