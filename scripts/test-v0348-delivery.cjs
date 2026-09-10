const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {root}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.48','delivery-'+Date.now()),appRoot=path.join(work,'中文 空白 完整 App'),evidence=path.join(work,'ui');fs.mkdirSync(work,{recursive:true});
const delivery=JSON.parse(fs.readFileSync(path.join(root,'release/0.3.48/delivery.json'))),audit=JSON.parse(fs.readFileSync(path.join(root,'release/0.3.48/payload-audit.json')));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),run=(exe,args,env)=>{const r=spawnSync(exe,args,{env:{...process.env,...env},encoding:'utf8',windowsHide:true});if(r.stdout)console.log(r.stdout);if(r.stderr)console.error(r.stderr);assert.equal(r.status,0,r.error?.message||r.stderr);};
const report={startedAt:new Date().toISOString(),work,status:'RUNNING',manualGui:'PENDING',checks:[]};
try{
 assert.equal(hash(delivery.zip.path),delivery.zip.sha256);
 run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:JAA_INPUT_ZIP,$env:JAA_EXTRACT_ROOT)"],{JAA_INPUT_ZIP:delivery.zip.path,JAA_EXTRACT_ROOT:appRoot});
 for(const f of audit.files)assert.equal(hash(path.join(appRoot,f.path)),f.sha256,f.path);
 const exe=path.join(appRoot,'Jira Activity Analyzer.exe');assert.equal(hash(exe),delivery.exe.sha256);report.checks.push({name:'ZIP extracted all-file hashes',status:'PASS',files:audit.files.length});
 run(process.execPath,['scripts/test-v0348-ui.cjs'],{JAA_UI_EXECUTABLE:exe,JAA_UI_APP_ROOT:appRoot,JAA_UI_EVIDENCE:evidence});
 const ui=JSON.parse(fs.readFileSync(path.join(evidence,'report.json')));assert.equal(ui.status,'PASS');assert.equal(path.resolve(ui.actualAppExecutable),exe);assert.equal(ui.runtime.version,'0.3.48');report.checks.push({name:'actual extracted EXE bridge/SQLite/UI/IO/span assertions',status:'PASS',evidence:path.join(evidence,'report.json')});
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 for(const f of walk(path.join(appRoot,'databases')).filter(f=>f.endsWith('.sqlite'))){const db=new DatabaseSync(f,{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();report.checks.push({name:'post-close integrity',status:'PASS',file:f});}
 for(const f of audit.files)assert.equal(hash(path.join(appRoot,f.path)),f.sha256,f.path);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;console.error(e);process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log('Delivery evidence '+work);}
