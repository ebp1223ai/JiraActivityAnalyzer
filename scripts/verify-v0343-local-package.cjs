const {root,load}=require('./v0343-test-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const [file,directory]=process.argv.slice(2).map(p=>path.resolve(p));
for(const p of [file,directory]) {const relative=path.relative(root,p);if(!relative.startsWith('..')&&!path.isAbsolute(relative))throw new Error('PRIVATE_VERIFICATION_MUST_BE_OUTSIDE_REPOSITORY');}
const work=path.join(root,'test-artifacts/v0.3.43',`local-package-${Date.now()}`),store=load('electron/aiAnalysisDatabaseV042.ts',work);
const options={packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
const pkg=JSON.parse(fs.readFileSync(file)),preview=store.validateAiAnalysisPackageV042({...options,filePath:file}).preview;
assert.equal(preview.ok,true,JSON.stringify(preview.errors?.map(e=>({code:e.code,path:e.path}))));
fs.mkdirSync(directory,{recursive:true});const databasePath=path.join(directory,`private-verification-${Date.now()}.sqlite`);
store.initializeAiDatabaseV042({databasePath});const receipt=store.importAiAnalysisPackageV042({...options,databasePath,packagePath:file});
assert.equal(receipt.readBack.traces,55);assert.equal(receipt.readBack.findings,130);
assert.equal(pkg.records.filter(r=>r.aiAnalysis.status==='CLASSIFIED').length,40);assert.equal(pkg.records.filter(r=>r.aiAnalysis.status==='EXCLUDED').length,15);assert.ok(pkg.records.every(r=>r.manualReview===null));
const db=new DatabaseSync(databasePath,{readOnly:true});
try{for(const r of db.prepare('SELECT r.record_index,t.source_trace_json,a.analysis_json FROM ai_records r JOIN ai_record_source_traces t ON t.ai_record_id=r.ai_record_id JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id').all()){assert.deepEqual(JSON.parse(r.source_trace_json),pkg.records[r.record_index].sourceTrace);assert.deepEqual(JSON.parse(r.analysis_json),pkg.records[r.record_index].aiAnalysis);}}finally{db.close();}
const result={status:'PASS',records:55,findings:130,classified:40,excluded:15,manualReview:'ALL_NULL',traceAndAnalysisDeepEqual:true,privateRawRelink:'NOT_RUN_NO_RAW_PROVIDED',privateContentsWrittenToRepository:false};
fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
