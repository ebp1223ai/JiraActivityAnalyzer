const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {root}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.51','delivery-'+Date.now()),appRoot=path.join(work,'extracted app'),evidence=path.join(work,'ui');fs.mkdirSync(work,{recursive:true});
const delivery=JSON.parse(fs.readFileSync(path.join(root,'release/0.3.51/delivery.json'))),audit=JSON.parse(fs.readFileSync(path.join(root,'release/0.3.51/payload-audit.json')));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run=(exe,args,env)=>{const r=spawnSync(exe,args,{cwd:root,env:{...process.env,...env},encoding:'utf8',windowsHide:true});if(r.stdout)console.log(r.stdout);if(r.stderr)console.error(r.stderr);assert.equal(r.status,0,r.error?.message||r.stderr);};
const report={startedAt:new Date().toISOString(),work,status:'RUNNING',manualGui:'PENDING',checks:[]};
try{
 assert.equal(hash(delivery.zip.path),delivery.zip.sha256);
 run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:JAA_INPUT_ZIP,$env:JAA_EXTRACT_ROOT)"],{JAA_INPUT_ZIP:delivery.zip.path,JAA_EXTRACT_ROOT:appRoot});
 for(const file of audit.files)assert.equal(hash(path.join(appRoot,file.path)),file.sha256,file.path);
 const exe=path.join(appRoot,'Jira Activity Analyzer.exe');assert.equal(hash(exe),delivery.exe.sha256);report.checks.push({name:'ZIP extracted all-file hashes',status:'PASS',files:audit.files.length});
 run(process.execPath,['scripts/test-v0351-ui.cjs'],{JAA_UI_EXECUTABLE:exe,JAA_UI_APP_ROOT:appRoot,JAA_UI_EVIDENCE:evidence});
 const ui=JSON.parse(fs.readFileSync(path.join(evidence,'report.json')));assert.equal(ui.status,'PASS');assert.equal(path.resolve(ui.actualAppExecutable),exe);assert.equal(ui.runtime.version,'0.3.51');report.checks.push({name:'actual extracted EXE production UI',status:'PASS',evidence:path.join(evidence,'report.json')});
 run(process.execPath,['scripts/test-v0351-ui.cjs'],{JAA_UI_EXECUTABLE:exe,JAA_UI_APP_ROOT:appRoot,JAA_UI_EVIDENCE:path.join(work,'restart-ui'),JAA_UI_REOPEN_ONLY:'1'});
 const restarted=JSON.parse(fs.readFileSync(path.join(work,'restart-ui/report.json')));assert.equal(restarted.status,'PASS');report.checks.push({name:'actual EXE restart/preferences persistence',status:'PASS',evidence:path.join(work,'restart-ui/report.json')});
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const file of walk(path.join(appRoot,'databases')).filter(f=>f.endsWith('.sqlite'))){const db=new DatabaseSync(file,{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{db.close();}report.checks.push({name:'post-close canonical integrity',status:'PASS'});}
 for(const file of audit.files)assert.equal(hash(path.join(appRoot,file.path)),file.sha256,file.path);
 const freeze=JSON.parse(fs.readFileSync(path.join(root,'release/0.3.51/first-exe-freeze.json')));
 assert.deepEqual(require('./package-v0351.cjs').inputs(),freeze.inputs);report.checks.push({name:'first EXE executable inputs unchanged',status:'PASS'});report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log('Delivery evidence '+work);}
