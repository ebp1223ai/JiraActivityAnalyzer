const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'test-artifacts/v0.3.44');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8'});
const changed=git('diff','--name-only','--').trim().split('\n').filter(Boolean);
const protectedFile='reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md';
const added=git('ls-files','--others','--exclude-standard','--','electron','scripts','src','reports','tests/fixtures/v0.3.44').trim().split('\n').filter(Boolean).filter(p=>/V044\.|v0344|v0\.3\.44|fixtures\/v0\.3\.44/.test(p));
const files=[...new Set([...changed.filter(p=>p!==protectedFile),...added])].filter(f=>fs.statSync(path.join(root,f)).isFile());
const findings=[],hashes=[];const decoder=new TextDecoder('utf-8',{fatal:true});
for(const file of files){const bytes=fs.readFileSync(path.join(root,file));decoder.decode(bytes);hashes.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});const text=added.includes(file)?bytes.toString():git('diff','--unified=0','--',file).split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).join('\n');for(const re of [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,/(?:api[_-]?token|password|authorization|cookie)\s*[:=]\s*["']([A-Za-z0-9+\/_=-]{24,})["']/gi,/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}/g]){if(re.test(text))findings.push({file,kind:'POTENTIAL_CREDENTIAL_REQUIRES_REVIEW'});}}
assert.deepEqual(findings,[]);
assert.equal(git('diff','--name-only','--','contracts','rules').trim(),'','Frozen contract changed');
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,protectedFile))).digest('hex');assert.equal(hash,'9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,'0.3.44');assert.equal(fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),'0.3.44');
const report={status:'PASS',scope:'Changed lines and explicitly named v0.3.44 new source/tests/reports only; no original token/.env/database inspected',protectedFile,protectedHash:hash,findings,files:hashes,securityWarning:'SECURITY_WARNING_EXISTING_IDENTIFIER_FIXTURE: pre-existing company identifiers are not credentials; untouched.',frozenContractChanges:[]};
fs.writeFileSync(path.join(dir,'source-security-audit.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(dir,'stage-candidates.json'),JSON.stringify(files,null,2));console.log(JSON.stringify({status:report.status,files:files.length,findings:findings.length,protectedHash:hash}));
