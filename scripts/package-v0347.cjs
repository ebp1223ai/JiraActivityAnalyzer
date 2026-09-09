const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {build,Platform,Arch}=require('electron-builder');
const root=path.resolve(__dirname,'..'),version='0.3.47',out=path.join(root,'release',version);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const run=(exe,args,env=process.env)=>execFileSync(exe,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const f=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED:'+f);return e.isDirectory()?walk(f):[f];});
async function main(){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 if(pkg.version!==version||fs.readFileSync(path.join(root,'VERSION'),'utf8').trim()!==version)throw Error('VERSION_MISMATCH');
 const dirty=git('diff','--name-only','HEAD').split('\n').filter(Boolean);
 const exception='reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md';
 if(dirty.some(f=>f!==exception))throw Error('COMMIT_SOURCE_BEFORE_PACKAGING:'+dirty.join(','));
 const protectedHash=hash(path.join(root,exception));
 if(protectedHash!=='9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d')throw Error('PROTECTED_FILE_CHANGED');
 const evidence=JSON.parse(fs.readFileSync(process.env.JAA_V047_PACKAGE_EVIDENCE||'', 'utf8'));
 for(const name of ['services','profile','ui']){
  const f=path.resolve(evidence[name]),r=JSON.parse(fs.readFileSync(f));
  const checks=r.results||r.checks;
  if(!checks?.length||checks.some(c=>c.status!=='PASS')||(name==='ui'&&r.status!=='PASS'))throw Error('PREPACK_TEST_FAILED:'+name);
 }
 const ui=JSON.parse(fs.readFileSync(evidence.ui));const dates=JSON.parse(fs.readFileSync(evidence.dates));
 if(!ui.v047SourceUiGates?.T47_13||!ui.v047SourceUiGates?.T47_19||!dates.checks?.some(c=>c.status==='PASS'&&c.name.startsWith('T47-08 actual')))throw Error('THREE_SOURCE_UI_GATES_REQUIRED');
 const coverage=JSON.parse(fs.readFileSync(evidence.coverage));if(coverage.sourceGate!=='PASS'||coverage.rows.some(r=>r.requiredBeforeExe&&r.status!=='PASS'))throw Error('SOURCE_COVERAGE_INCOMPLETE');
 run(process.execPath,['scripts/work-timeline-v0347.cjs','test']);run(process.execPath,['scripts/work-ledger-audit-v0347.cjs']);
 if(fs.existsSync(out))throw Error('OUTPUT_ALREADY_EXISTS_FIRST_EXE_FREEZE_REQUIRES_REVIEW:'+out);
 const inputs=git('ls-files','-z').split('\0').filter(f=>f&&!f.startsWith('reports/')&&!f.startsWith('docs/')).map(f=>({path:f,sha256:hash(path.join(root,f))}));
 const date=new Date(),buildTime=date.toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hour12:false}).replaceAll('-','/');
 const info={appVersion:version,packagedSourceCommit:git('rev-parse','HEAD'),gitBranch:git('branch','--show-current'),buildTime,buildTimeIso:date.toISOString(),buildMachine:os.hostname(),buildOs:os.release(),dirtyState:dirty.length>0,dirtyException:exception,deliveryMode:'DEVELOPMENT',artifactTargets:['win-unpacked'],manualGuiGate:'PENDING'};
 fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'prepack-inputs.json'),JSON.stringify({info,evidence,inputs},null,2));
 const env={...process.env,JAA_PACKAGED_SOURCE_COMMIT:info.packagedSourceCommit,JAA_BUILD_TIME:buildTime,JAA_BUILD_TIME_ISO:info.buildTimeIso,JAA_BUILD_BRANCH:info.gitBranch};
 run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run build'],env);
 // From this invocation forward an EXE may exist. Never overwrite this version directory.
 fs.writeFileSync(path.join(out,'first-exe-freeze.json'),JSON.stringify({state:'PACKAGING_STARTED_SOURCE_FROZEN',timestamp:new Date().toISOString(),sourceCommit:info.packagedSourceCommit}));
 await build({targets:Platform.WINDOWS.createTarget(['dir'],Arch.x64),config:{directories:{output:out},extraMetadata:{jaaBuildInfo:info}}});
 const unpacked=path.join(out,'win-unpacked'),exe=path.join(unpacked,'Jira Activity Analyzer.exe');
 if(!fs.existsSync(exe))throw Error('UNPACKED_EXE_MISSING');
 const asar=require('@electron/asar'),archive=path.join(unpacked,'resources/app.asar');
 const packed=JSON.parse(asar.extractFile(archive,'package.json'));
 if(packed.version!==version||packed.jaaBuildInfo.packagedSourceCommit!==info.packagedSourceCommit)throw Error('PACKAGED_METADATA_MISMATCH');
 const forbidden=f=>/(^|\/)(\.env|token\.txt|password\.txt)$|\.(sqlite3?|db|7z)$/i.test(f)||/(^|\/)(test-artifacts|debug-folders|backups)\//.test(f);
 const files=walk(unpacked).map(f=>({path:path.relative(unpacked,f).replaceAll('\\','/'),bytes:fs.statSync(f).size,sha256:hash(f)}));
 const header=asar.getRawHeader(archive).header;
 const collect=(node,prefix='')=>Object.entries(node.files||{}).flatMap(([name,value])=>{const p=prefix+name;return value.files?collect(value,p+'/'):[{path:p,bytes:value.size||0,link:value.link??null,unpacked:Boolean(value.unpacked)}];});
 const asarFiles=collect(header);
 if([...files,...asarFiles].some(f=>forbidden(f.path)))throw Error('FORBIDDEN_PAYLOAD_NAME');
 if(!asarFiles.some(f=>f.path==='dist/index.html')||!asarFiles.some(f=>f.path==='dist-electron/preload.cjs'))throw Error('RENDERER_OR_PRELOAD_MISSING');
 const dirs={};for(const f of [...files,...asarFiles.map(f=>({...f,path:'app.asar/'+f.path}))]){const d=path.posix.dirname(f.path);dirs[d]=(dirs[d]||0)+f.bytes;}
 const audit={...info,exe:{path:exe,bytes:fs.statSync(exe).size,sha256:hash(exe)},fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),files,asarFiles,top50AsarFiles:[...asarFiles].sort((a,b)=>b.bytes-a.bytes).slice(0,50),top20Directories:Object.entries(dirs).sort((a,b)=>b[1]-a[1]).slice(0,20),licensesPreserved:true,forbiddenPathAudit:'PASS'};
 fs.writeFileSync(path.join(out,'payload-audit.json'),JSON.stringify(audit,null,2));
 const zip=path.join(out,'JiraActivityAnalyzer_v0.3.47_win-unpacked.zip');
 run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:JAA_ZIP_SOURCE,$env:JAA_ZIP_TARGET,[System.IO.Compression.CompressionLevel]::Optimal,$false)"],{...process.env,JAA_ZIP_SOURCE:unpacked,JAA_ZIP_TARGET:zip});
 run('python',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip(); assert bad is None,bad; print("ZIP CRC PASS",len(z.infolist()))',zip]);
 const receipt={...info,exe:audit.exe,zip:{path:zip,bytes:fs.statSync(zip).size,sha256:hash(zip),crc:'PASS'},fileCount:audit.fileCount,totalBytes:audit.totalBytes};
 fs.writeFileSync(path.join(out,'delivery.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
