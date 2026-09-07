const {root,load,seedRaw}=require('./v0343-test-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const work=path.join(root,'test-artifacts/v0.3.43',`correctness-${Date.now()}`);
const query=load('electron/aiResultsQueryV043.ts',work),fields=load('electron/aiFieldRegistryV043.ts',work),store=load('electron/aiAnalysisDatabaseV042.ts',work),project=load('shared/aiResultProjectionV043.ts',work),csv=load('electron/aiTableExportV043.ts',work);
const fixtures=path.join(root,'tests/fixtures/v0.3.43');
const options={packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
const pkgPath=path.join(fixtures,'v201/package-ai-only-55.json'),pkg=JSON.parse(fs.readFileSync(pkgPath));
const results=[];
function test(name,fn){const start=Date.now();try{fn();results.push({name,status:'PASS',durationMs:Date.now()-start});console.log(`PASS ${name}`);}catch(e){results.push({name,status:'FAIL',durationMs:Date.now()-start,error:e.message});throw e;}}
function write(name,p){const file=path.join(work,name);fs.writeFileSync(file,JSON.stringify(p));return file;}
try {
 test('F01-F05 exact event IDs, self exclusion, selected-zero and array membership',()=>{
  const oracle=JSON.parse(fs.readFileSync(path.join(fixtures,'facet-cases.json'))),raw=path.join(work,'facets.sqlite');
  seedRaw(raw,oracle.rows.map(r=>({...r,eventTime:'2026-09-07T00:00:00Z',after:r})),work);
  const key=k=>fields.fieldIdV043('raw',['decoded','activity_events','to_value_json',k]);
  for(const c of oracle.cases){const filters=Object.fromEntries(Object.entries(c.filters).map(([k,v])=>[key(k),{values:v.map(value=>fields.typedValueV043(value).token)}]));
   const actual=query.queryResultsV043('integrated',null,raw,{filters});assert.deepEqual(actual.rows.map(r=>r.id).sort(),c.rowIds.sort(),c.id);
   const facet=query.distinctResultsV043('integrated',null,raw,key(c.facet),{filters});
   for(const expected of c.values){const got=facet.values.find(v=>v.value===fields.typedValueV043(expected.value).token);assert.ok(got,c.id);assert.equal(got.count,expected.count,c.id);}
   assert.deepEqual(facet.values.filter(v=>v.kind==='string'||v.selected).map(v=>({value:v.kind==='string'?v.label:JSON.parse(v.value.slice(7)),count:v.count})).sort((a,b)=>a.value.localeCompare(b.value)),[...c.values].sort((a,b)=>a.value.localeCompare(b.value)),c.id);
  }
 });
 test('Typed tokens cannot alias literal strings; missing/null/zero/false survive export',()=>{
  const raw=path.join(work,'types.sqlite'),values=[null,'null:null',0,'0',false,'false',"%_'中文",undefined];
  seedRaw(raw,values.map((value,i)=>({id:`type-${i}`,issue:`TYPE-${i}`,eventTime:'2026-09-07T00:00:00Z',after:value===undefined?{}:{value}})),work);
  const field=fields.fieldIdV043('raw',['decoded','activity_events','to_value_json','value']);
  for(let i=0;i<values.length;i++){const r=query.queryResultsV043('integrated',null,raw,{filters:{[field]:{values:[fields.typedValueV043(values[i]).token]}}});assert.deepEqual(r.rows.map(x=>x.id),[`type-${i}`]);}
  const exported=query.exportResultsV043('integrated',null,raw,{},[field]);assert.equal(exported.rows.length,8);assert.equal(exported.rows.filter(r=>r[field]===null).length,1);assert.equal(exported.rows.filter(r=>r[field]===undefined).length,1);
  const output=csv.tableCsvV043(exported);assert.equal(output.split('\r\n').length,10);assert.ok(output.startsWith('\uFEFF'));assert.ok(!csv.tableCsvV043({fields:[{id:'x'}],rows:[{x:'=SUM(1,2)'}]}).includes('\r\n=SUM'));
 });
 test('Offsets, milliseconds, one-sided days and invalid dates use epoch order',()=>{
  const raw=path.join(work,'dates.sqlite');seedRaw(raw,[{id:'date',issue:'DATE-1',eventTime:'2026-09-07T00:30:00.123Z'}],work);
  assert.equal(query.queryResultsV043('integrated',null,raw,{filters:{eventTime:{from:'2026-09-07T08:00:00+08:00',to:'2026-09-07T01:00:00Z'}}}).filteredCount,1);
  assert.equal(query.queryResultsV043('integrated',null,raw,{filters:{eventTime:{from:'2026-09-07T00:30:00.124Z'}}}).filteredCount,0);
  assert.equal(query.queryResultsV043('integrated',null,raw,{timeZone:'Asia/Taipei',filters:{eventTime:{from:'2026-09-07',to:'2026-09-07'}}}).filteredCount,1);
  assert.throws(()=>query.queryResultsV043('integrated',null,raw,{filters:{eventTime:{from:'2026-02-30'}}}),/DATE_INVALID/);
 });
 test('Package collision, negative metadata/identity/order/confidence/binding and rollback',()=>{
  const ai=path.join(work,'ai.sqlite');store.initializeAiDatabaseV042({databasePath:ai});store.importAiAnalysisPackageV042({...options,databasePath:ai,packagePath:pkgPath});
  const collision=structuredClone(pkg);collision.records[0].aiAnalysis.rationale+=' Changed';assert.throws(()=>store.importAiAnalysisPackageV042({...options,databasePath:ai,packagePath:write('collision.json',collision)}),/PACKAGE_ID_CONTENT_CONFLICT/);
  for(const mutate of [p=>p.schemaVersion='2.0.2',p=>p.counts.records++,p=>p.records[0].recordIndex=5,p=>p.records[0].aiAnalysis.confidence=0.5,p=>p.records[0].sourceTrace.reference.activityEventId='',p=>p.records[0].dedupeKey='bad',p=>p.rulesBinding.skillCatalog.sha256='0'.repeat(64),p=>p.records[0].aiAnalysis.skillFindings[0].skillName='Wrong name',p=>p.records[0].aiAnalysis.skillFindings.push(p.records[0].aiAnalysis.skillFindings[0])]){const p=structuredClone(pkg);mutate(p);assert.equal(store.validateAiAnalysisPackageV042({...options,filePath:write('negative.json',p)}).preview.ok,false);}
  for(const failureInjection of ['AFTER_BATCH','AFTER_RECORDS']){const p=structuredClone(pkg);p.packageId+=failureInjection;assert.throws(()=>store.importAiAnalysisPackageV042({...options,databasePath:ai,packagePath:write('rollback.json',p),failureInjection}));assert.equal(store.inspectAiDatabaseV042(ai).importBatchCount,1);}
 });
 test('D02/D03/D07 source bytes and unavailable metrics are immutable',()=>{
  const cases=JSON.parse(fs.readFileSync(path.join(fixtures,'diff-cases.json'))).cases;
  for(const c of cases.filter(c=>['D02','D03','D07','D08'].includes(c.id))){const trace={reference:{},diff:{before:c.before??null,after:c.after??null,diffHunks:c.hunks??[{kind:'insert',text:c.source}]}};const before=JSON.stringify(trace);const r=project.traceContentV043(trace);assert.equal(JSON.stringify(trace),before);assert.deepEqual(r.diffHunks,trace.diff.diffHunks);assert.equal(r.before,null);assert.equal(r.addedLineCount,null);}
 });
 test('Shared Diff formatter D01/D04, literal hunk D07/D08 and safe diagnostics',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const viewer=load('src/components/TraceEvidenceView.tsx',work),diag=load('electron/aiDiagnosticsV043.ts',work);
  const render=diff=>renderToStaticMarkup(React.createElement(viewer.TraceDiffLines,{row:{sourceTrace:{reference:{},diff},fieldName:'Description'}}));
  const full=render({before:'old\nkeep',after:'new\nkeep'});assert.ok(full.includes('old'));assert.ok(full.includes('new'));assert.ok(full.includes('line-through'));
  const same=render({before:'same',after:'same',addedLineCount:0,removedLineCount:0});assert.ok(same.includes('same'));assert.ok(!same.includes('line-through'));
  const xss=render({diffHunks:[{kind:'insert',text:'<img src=x onerror=alert(1)>'}]});assert.ok(!xss.includes('<img'));assert.ok(xss.includes('&lt;img'));
  const literal='literal \\r\\n code; real\r\nline\tend';assert.ok(render({diffHunks:[{kind:'insert',text:literal}]}).includes(literal));
  const safe=JSON.stringify(diag.safeAiAuditV043({snapshot:{databaseId:'SECRET_PATH',databasePath:'SECRET_PATH',recordCount:55},batches:[{source_filename:'PRIVATE_NAME',package_metadata_json:'PRIVATE_RAW'}],links:[{ai_record_id:'PRIVATE_ID',failure_reason:'PRIVATE_VALUE'}]}));
  for(const secret of ['SECRET_PATH','PRIVATE_NAME','PRIVATE_RAW','PRIVATE_ID','PRIVATE_VALUE'])assert.ok(!safe.includes(secret));
 });
 test('I05 orphan and I07 SQL errors cannot become successful empty results',()=>{
  const ai=path.join(work,'orphan.sqlite'),raw=path.join(work,'empty.sqlite');store.initializeAiDatabaseV042({databasePath:ai});store.importAiAnalysisPackageV042({...options,databasePath:ai,packagePath:pkgPath});seedRaw(raw,[],work);
  assert.equal(query.queryResultsV043('ai',ai,null).totalCount,55);assert.equal(query.queryResultsV043('integrated',ai,raw).totalCount,0);
  const broken=path.join(work,'broken.sqlite'),db=new DatabaseSync(broken);db.exec('CREATE TABLE unrelated(x)');db.close();assert.throws(()=>query.queryResultsV043('integrated',ai,broken),/no such table/);assert.throws(()=>query.queryResultsV043('integrated',ai,null),/RAW_DATABASE_CLOSED/);
 });
}finally{query.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({results},null,2));console.log(`Evidence: ${work}`);}
