const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='1696923df674351fc24b68865b4638fb0e756a36',dir=path.join(root,'test-artifacts/v0.3.45');
const git=(...a)=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const protectedFile='reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md';
const changed=git('diff','--name-only',base,'--').split('\n').filter(p=>p&&p!==protectedFile);
const added=git('ls-files','--others','--exclude-standard','--','electron','src','scripts','reports').split('\n').filter(p=>/V045\.|v0345|v0\.3\.45/.test(p));
const files=[...new Set([...changed,...added])];
const allowed=/^(VERSION|CHANGELOG\.md|package(?:-lock)?\.json|electron\/(?:aiAnalysisDatabaseIpcV042|aiResultsIndexV044|aiResultsQueryV043|aiResultsServiceV044|aiResultsWorkerV044|automaticDiagnosticsV044|diagnosticWriterV044|main|databaseRevisionV045|diagnosticSnapshotV045)\.ts|src\/(?:routes\/AiDatabaseViewerPagesV043\.tsx|components\/ActivityComparisonTable\.tsx|state\/aiResultCacheV045\.ts)|scripts\/.*v034[45].*\.(?:cjs|ps1)|reports\/JiraActivityAnalyzer_v0\.3\.45_.*)$/;
const findings=[],hashes=[];
for(const file of files){assert.ok(allowed.test(file),'OUT_OF_SCOPE '+file);const bytes=fs.readFileSync(path.join(root,file));new TextDecoder('utf-8',{fatal:true}).decode(bytes);const text=added.includes(file)?bytes.toString():git('diff','--unified=0',base,'--',file).split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).join('\n');
  for(const re of [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,/(?:api[_-]?token|password|authorization|cookie)\s*[:=]\s*["']([A-Za-z0-9+\/_=-]{24,})["']/gi,/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}/g])if(re.test(text))findings.push({file,kind:'POTENTIAL_CREDENTIAL_REQUIRES_REVIEW'});
  hashes.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
assert.deepEqual(findings,[]);assert.equal(git('diff','--name-only',base,'--','contracts','rules','electron/generated/aiAnalysisDdlV042.ts'),'');
const protectedHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,protectedFile))).digest('hex');assert.equal(protectedHash,'9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d');
assert.equal(JSON.parse(fs.readFileSync('package.json')).version,'0.3.45');assert.equal(fs.readFileSync('VERSION','utf8').trim(),'0.3.45');
const report={status:'PASS',base,files:hashes,findings,protectedFile,protectedHash,scope:'Only changed lines and named v045 source/tests/reports; original untracked files not opened.',warning:'SECURITY_WARNING_EXISTING_IDENTIFIER_FIXTURE: unchanged historical identifiers are not credentials.',frozenContractChanges:[]};
fs.writeFileSync(path.join(dir,'source-security-audit.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(dir,'stage-candidates.json'),JSON.stringify(files,null,2));console.log(JSON.stringify({status:report.status,files:files.length,findings:findings.length,protectedHash}));
