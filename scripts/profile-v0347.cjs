const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {root,load}=require('./v0343-test-helpers.cjs'),{seed,importAndLink}=require('./v0347-test-seed.cjs');
const baseline='262730e47de928f0169a97ccc88ac220996ae27d',work=path.join(root,'test-artifacts/v0.3.47','paired-profile-'+Date.now());fs.mkdirSync(work,{recursive:true});
(async()=>{
const beforeFile=path.join(work,'before.cjs'),files=[];
await require('esbuild').build({entryPoints:[path.join(root,'electron/aiResultsQueryV043.ts')],outfile:beforeFile,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'read-only-baseline-source',setup(b){b.onLoad({filter:/\.tsx?$/},a=>{const rel=path.relative(root,a.path).replaceAll('\\','/');if(rel.startsWith('../'))throw Error('OUTSIDE_SOURCE');const contents=execFileSync('git',['show',baseline+':'+rel],{cwd:root,encoding:'utf8'});files.push(rel);return {contents,loader:'ts',resolveDir:path.dirname(a.path)};});}}]});
const s=importAndLink(path.join(work,'seed'),seed(path.join(work,'seed'),39281));
const current=load('electron/aiResultsQueryV043.ts',work),before=require(beforeFile);
const results=[];const common={pageSize:50,visibleFields:[],diffQuickFilters:{hideNoChange:false,hideZeroAdded:false,hideZeroDeleted:false,hideBeforeUnavailable:false}};
try{
 for(const [name,q]of [['before',before],['after',current]]){
  const stages=[];q.invalidateAiResultsV043();
  for(const [label,query]of [['cold-all',common],['warm-all',common],['actor-two-values',{...common,filters:{displayName:{values:['Synthetic A','Synthetic B']}}}]]){
   const start=performance.now(),r=q.queryResultsV043('integrated',s.ai,s.raw,query);stages.push({label,ms:performance.now()-start,rows:r.rows.length,total:r.totalCount,filtered:r.filteredCount});assert.equal(r.totalCount,39281);
  }
  const t=performance.now();q.distinctResultsV043('integrated',s.ai,s.raw,'displayName',common);stages.push({label:'facet',ms:performance.now()-t});
  results.push({name,status:'PASS',stages,diagnostics:q.latestQueryDiagnosticsV043(),memory:process.memoryUsage(),pid:process.pid,units:'bytes',rssScope:'one unique process; not additive across samples'});q.invalidateAiResultsV043();
 }
 const t=performance.now(),r=current.queryResultsV043('integrated',s.ai,s.raw,{...common,filters:{analysisStatus:{values:['CLASSIFIED','UNKNOWN','EXCLUDED','FAILED']}}});assert.equal(r.filteredCount,55);
 results.push({name:'after-only default-four actual new behavior',status:'PASS',ms:performance.now()-t,filtered:r.filteredCount,total:r.totalCount});
 assert.deepEqual(results[0].stages.slice(0,3).map(s=>[s.total,s.filtered]),results[1].stages.slice(0,3).map(s=>[s.total,s.filtered]));
}catch(e){results.push({name:'profile',status:'FAIL',error:e.stack});process.exitCode=1;}
finally{before.invalidateAiResultsV043();current.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({work,baseline,baselineFiles:files,runtime:process.versions,cold:'logical cache miss; OS cache unknown',timings:'OBSERVATIONAL; same dataset and process, baseline then current, no universal latency promise',results},null,2));console.log('Profile '+work);console.log(JSON.stringify(results.map(r=>({name:r.name,status:r.status,stages:r.stages,error:r.error}))));}
})().catch(e=>{console.error(e);process.exitCode=1;});
