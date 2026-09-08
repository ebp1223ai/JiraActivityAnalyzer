const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),art=path.join(root,'test-artifacts/v0.3.44');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const entries=[];
for(const file of ['electron/main.ts','electron/aiAnalysisDatabaseIpcV042.ts']){
  const text=read(file),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),imports=new Map();
  for(const s of source.statements)if(ts.isImportDeclaration(s)&&ts.isStringLiteral(s.moduleSpecifier)){
    const clause=s.importClause;if(clause?.name)imports.set(clause.name.text,s.moduleSpecifier.text);
    const binding=clause?.namedBindings;if(binding&&ts.isNamedImports(binding))for(const e of binding.elements)imports.set(e.name.text,s.moduleSpecifier.text);
  }
  const visit=node=>{
    if(ts.isCallExpression(node)&&node.expression.getText(source)==='instrumentedHandleV044'){
      assert.ok(ts.isStringLiteral(node.arguments[0]),'Dynamic unenumerated IPC registration');
      const channel=node.arguments[0].text,handler=node.arguments[1],calls=new Map();
      const scan=n=>{if(ts.isCallExpression(n)){const symbol=n.expression.getText(source),base=symbol.split('.')[0];if(imports.has(base)||/Coordinator\./.test(symbol))calls.set(symbol,{symbol,module:imports.get(base)||'coordinator instance declared in main',line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1});}ts.forEachChild(n,scan);};
      if(handler)scan(handler);
      entries.push({channel,file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,repositoryCalls:[...calls.values()],instrumented:true,coverageBoundary:channel.startsWith('diagnostics:')?'CONTROL_NOT_RECURSIVELY_LOGGED':'DURABLE_IPC_START_PERIODIC_PROGRESS_TERMINAL',sqlStage:/query|integrated|facet|export|import|relink/.test(channel)?'service pipeline and command stages':'N/A unless called repository performs SQL; outer command remains observed'});
    }
    ts.forEachChild(node,visit);
  };visit(source);
  assert.ok(!/ipcMain\.handle\(/.test(text),'Uninstrumented active handler in '+file);
}
assert.equal(new Set(entries.map(e=>e.channel)).size,entries.length);
const routes=[...read('src/App.tsx').matchAll(/<Route path="([^"]+)" element=\{<([^ >]+)/g)].filter(m=>m[2]!=='Navigate').map(m=>({route:m[1],component:m[2],entry:'src/App.tsx',navigation:'src/components/useUiDiagnosticsV044.ts',commands:'AppLayout capture listener + formal IPC; text values not recorded'}));
const reports=fs.readdirSync(art).filter(n=>n.startsWith('ui-')&&fs.existsSync(path.join(art,n,'report.json'))).sort().map(n=>({path:'test-artifacts/v0.3.44/'+n+'/report.json',data:JSON.parse(fs.readFileSync(path.join(art,n,'report.json')))}));
const latest=reports.findLast(r=>r.data.status==='PASS'&&r.data.checks.some(c=>c.name==='production-file-io-and-complete-streaming-pipeline'));
assert.ok(latest,'Current production pipeline/I/O UI evidence missing');
assert.deepEqual(latest.data.diagnostic.registeredChannels,[...entries.map(e=>e.channel)].sort());
for(const route of routes)assert.ok(latest.data.checks.some(c=>c.name==='route-ready:'+route.route.slice(1)),route.route+' not exercised');
const ioModules=fs.readdirSync(path.join(root,'electron')).filter(n=>n.endsWith('.ts')&&read('electron/'+n).includes('import fs from "./businessIoDiagnosticsV044.js"')).map(n=>'electron/'+n);
assert.ok(ioModules.includes('electron/main.ts')&&ioModules.includes('electron/sourceArchiveDatabase.ts')&&ioModules.includes('electron/uiPreferences.ts'));
const result={status:'PASS',scope:'D44-01 active commands/routes/repository entry calls; not every function or every row. External network and destructive commands inventoried but not executed.',entries,routes,ioModules,runtimeEvidence:latest.path,uncoveredActiveEntryPoints:[],streamingStages:latest.data.traceAudit.stageNames,limitations:['File-IO points are coalesced by actual path/operation/phase; they are observations within the enclosing durable command, not fsync promises for business writes.','Source-read/mapping/discovery are streaming overlapping spans, not additive independent durations.','Pre-diagnostics bootstrap and diagnostic writer own IO use existing path preflight and writer health; excluded from recursive observation.','CrashReporter is not enabled; no managed Crashpad production dump creation.','No OS syscall interception and no live Jira/AI service execution.']};
fs.writeFileSync(path.join(art,'coverage-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:'PASS',routes:routes.length,channels:entries.length,ioModules:ioModules.length}));
