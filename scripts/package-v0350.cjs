const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {build,Platform,Arch}=require('electron-builder');
const root=path.resolve(__dirname,'..'),version='0.3.50',out=path.join(root,'release',version);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const run=(exe,args,env=process.env)=>execFileSync(exe,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED');const file=path.join(dir,e.name);return e.isDirectory()?walk(file):[file];});
function inputs(){return git('ls-files','--cached','--others','--exclude-standard','-z','electron','src','shared','scripts','rules','contracts','package.json','package-lock.json','VERSION','vite.config.ts','tsconfig.json','tsconfig.electron.json','index.html').split('\0').filter(Boolean).sort().map(file=>({file,sha256:hash(path.join(root,file))}));}
async function main(){
 if(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version!==version||fs.readFileSync(path.join(root,'VERSION'),'utf8').trim()!==version)throw Error('VERSION_MISMATCH');
 if(fs.existsSync(out))throw Error('FIRST_EXE_FREEZE_OUTPUT_EXISTS');
 const gate=JSON.parse(fs.readFileSync(path.join(root,'reports/v0.3.50/SourceGate.json')));
 if(gate.status!=='PASS')throw Error('SOURCE_GATES_REQUIRED');
 for(const item of gate.evidence){const evidence=JSON.parse(fs.readFileSync(item.path));const checks=evidence.results??evidence.checks;if(hash(item.path)!==item.sha256||!checks?.length||checks.some(c=>c.status!=='PASS'))throw Error('INVALID_GATE_EVIDENCE:'+item.path);}
 const source=inputs();if(crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex')!==gate.sourceDigest)throw Error('SOURCE_CHANGED_AFTER_GATES');
 const now=new Date(),info={appVersion:version,packagedSourceCommit:git('rev-parse','HEAD'),gitBranch:git('branch','--show-current'),buildTimeIso:now.toISOString(),buildTime:now.toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hour12:false}).replaceAll('-','/'),deliveryMode:'DEVELOPMENT',artifactTargets:['win-unpacked','win-unpacked-zip'],manualGuiGate:'PENDING',sourceDigest:gate.sourceDigest};
 run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run build'],{...process.env,JAA_PACKAGED_SOURCE_COMMIT:info.packagedSourceCommit,JAA_BUILD_TIME:info.buildTime,JAA_BUILD_TIME_ISO:info.buildTimeIso,JAA_BUILD_BRANCH:info.gitBranch});
 if(JSON.stringify(inputs())!==JSON.stringify(source))throw Error('SOURCE_CHANGED_DURING_BUILD');
 fs.mkdirSync(out);fs.writeFileSync(path.join(out,'first-exe-freeze.json'),JSON.stringify({state:'PACKAGING_STARTED_SOURCE_FROZEN',...info,inputs:source},null,2));
 await build({targets:Platform.WINDOWS.createTarget(['dir'],Arch.x64),config:{directories:{output:out},extraMetadata:{jaaBuildInfo:info}}});
 const unpacked=path.join(out,'win-unpacked'),exe=path.join(unpacked,'Jira Activity Analyzer.exe'),asar=require('@electron/asar'),archive=path.join(unpacked,'resources/app.asar');
 const pkg=JSON.parse(asar.extractFile(archive,'package.json'));if(pkg.version!==version||pkg.jaaBuildInfo.sourceDigest!==gate.sourceDigest)throw Error('PACKAGED_METADATA_MISMATCH');
 const files=walk(unpacked).map(file=>({path:path.relative(unpacked,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:hash(file)}));
 const collect=(node,prefix='')=>Object.entries(node.files||{}).flatMap(([name,item])=>item.files?collect(item,prefix+name+'/'):[{path:prefix+name,bytes:item.size||0,unpacked:Boolean(item.unpacked)}]);
 const asarFiles=collect(asar.getRawHeader(archive).header);
 const forbidden=/^(tests|scripts|reports)\/|(^|\/)(\.env|token\.txt|password\.txt)$|\.(sqlite3?|db|7z)$|(^|\/)(test-artifacts|debug-folders|backups)\//i;
 if([...files,...asarFiles].some(f=>forbidden.test(f.path)))throw Error('FORBIDDEN_PAYLOAD');
 for(const file of ['dist/index.html','dist-electron/main.cjs','dist-electron/preload.cjs'])if(!asarFiles.some(f=>f.path===file))throw Error('PAYLOAD_MISSING:'+file);
 const dirs={};for(const f of files){const dir=path.posix.dirname(f.path);dirs[dir]=(dirs[dir]||0)+f.bytes;}
 const audit={...info,exe:{path:exe,bytes:fs.statSync(exe).size,sha256:hash(exe)},files,asarFiles,totalBytes:files.reduce((n,f)=>n+f.bytes,0),fileCount:files.length,top50Files:[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,50),top50AsarFiles:[...asarFiles].sort((a,b)=>b.bytes-a.bytes).slice(0,50),top20Directories:Object.entries(dirs).sort((a,b)=>b[1]-a[1]).slice(0,20),forbiddenPathAudit:'PASS'};
 fs.writeFileSync(path.join(out,'payload-audit.json'),JSON.stringify(audit,null,2));
 const zip=path.join(out,'JiraActivityAnalyzer_v0.3.50_win-unpacked.zip');
 run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:JAA_ZIP_SOURCE,$env:JAA_ZIP_TARGET,[System.IO.Compression.CompressionLevel]::Optimal,$false)"],{...process.env,JAA_ZIP_SOURCE:unpacked,JAA_ZIP_TARGET:zip});
 run('python',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("ZIP CRC PASS",len(z.infolist()))',zip]);
 const receipt={...info,exe:audit.exe,zip:{path:zip,bytes:fs.statSync(zip).size,sha256:hash(zip),crc:'PASS'},fileCount:files.length,totalBytes:audit.totalBytes};
 fs.writeFileSync(path.join(out,'delivery.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={inputs};
