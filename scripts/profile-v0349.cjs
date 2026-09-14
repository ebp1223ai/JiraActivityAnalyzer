const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {execFileSync}=require('node:child_process');
const {root,load}=require('./v0343-test-helpers.cjs'),{seed,importAndLink}=require('./v0348-test-seed.cjs');
const work=path.join(root,'test-artifacts/v0.3.49','performance-'+Date.now());fs.mkdirSync(work,{recursive:true});
process.env.JAA_PROJECTION_ROOT=path.join(work,'sidecar');process.env.JAA_READ_PROJECTION_V049='1';
const q=load('electron/aiResultsQueryV043.ts',work),viewer=load('electron/databaseViewer.ts',work),results=[];
const core=['eventTime','action','issueKey','analysisStatus','skillId','computed:["manual","state"]'];
const base={pageSize:50,visibleFields:core};
const memory=()=>({rss:process.memoryUsage().rss,heap:process.memoryUsage().heapUsed,peakRss:process.resourceUsage().maxRSS*1024});
const timing=(name,fn,limit)=>{const times=[];let result;for(let i=0;i<7;i++){const start=performance.now();result=fn(i);times.push(performance.now()-start);}times.sort((a,b)=>a-b);const r={name,status:times[6]>limit?'FAIL':'PASS',p50:times[3],p95:times[6],samples:times,limit,memory:memory(),readPath:result?.readPath};results.push(r);console.log(JSON.stringify(r));};
async function main(){
 const small=importAndLink(path.join(work,'small'),seed(path.join(work,'small')));
 for(let mask=1;mask<16;mask++){
  const query={pageSize:25,sort:{field:'eventTime',direction:'desc'},diffQuickFilters:{hideNoChange:!!(mask&1),hideZeroAdded:!!(mask&2),hideZeroDeleted:!!(mask&4),hideBeforeUnavailable:!!(mask&8)}};
  process.env.JAA_READ_PROJECTION_V049='0';const old=await viewer.queryDatabaseUserEventsProgressive(small.raw,{kind:'all'},query,{requestId:'legacy-'+mask});
  process.env.JAA_READ_PROJECTION_V049='1';const fresh=await viewer.queryDatabaseUserEventsProgressive(small.raw,{kind:'all'}, {...query,revision:1},{requestId:'projection-'+mask});
  assert.equal(fresh.filteredCount,old.filteredCount);assert.deepEqual(fresh.rows.map(r=>r.eventId),old.rows.map(r=>r.eventId));
 }
 results.push({name:'User quick-filter 15 combinations Golden',status:'PASS'});
 for(const total of [40000,100000]){
  const dir=path.join(work,String(total));
  execFileSync(process.execPath,[path.join(__dirname,'v0349-performance-seed.cjs'),dir,String(total)],{stdio:'inherit',windowsHide:true});
  const s=JSON.parse(fs.readFileSync(path.join(dir,'seed-result.json')));
  let start=performance.now();const cold=q.queryResultsV043('integrated',s.ai,s.raw,base);assert.equal(cold.totalCount,total);results.push({name:total+' cold-build',status:'PASS',ms:performance.now()-start,memory:memory()});
  const query=input=>q.queryResultsV043('integrated',s.ai,s.raw,{...base,...input});
  timing(total+' page',i=>query({page:i+1}),1200);
  timing(total+' Tier1 filter',()=>query({filters:{analysisStatus:{values:['NOT_ANALYZED']}}}),2500);
  timing(total+' clear',()=>query({filters:{}}),2000);
  timing(total+' sort',i=>query({sort:{field:i%2?'action':'eventTime',direction:'asc'}}),2000);
  timing(total+' facet',()=>q.distinctResultsV043('integrated',s.ai,s.raw,'issueKey',base),2000);
  timing(total+' selected-heavy',()=>{const r=query({visibleFields:[...core,'before']});assert.equal(r.readPath.heavyRowsHydrated,50);return r;},3000);
  timing(total+' raw-issues',()=>viewer.listDatabaseIssues(s.raw,{pageSize:50}),3000);
  const userQuery={pageSize:50,sort:{field:'eventTime',direction:'desc'},diffQuickFilters:{hideNoChange:true}};
  start=performance.now();await viewer.queryDatabaseUserEventsProgressive(s.raw,{kind:'all'},userQuery,{requestId:'user-cold'});results.push({name:total+' user cold-metrics-build',status:'PASS',ms:performance.now()-start,memory:memory()});
  const times=[];for(let i=0;i<7;i++){start=performance.now();const r=await viewer.queryDatabaseUserEventsProgressive(s.raw,{kind:'all'},{...userQuery,page:i+1},{requestId:'user-'+i});assert.ok(r.rows.length<=50);times.push(performance.now()-start);}times.sort((a,b)=>a-b);results.push({name:total+' user page',status:times[6]>3000?'FAIL':'PASS',p50:times[3],p95:times[6],samples:times,memory:memory()});
  if(total===40000){
   const db=new DatabaseSync(s.raw);db.prepare('UPDATE activity_events SET from_value_json=? WHERE id=?').run(JSON.stringify(Object.fromEntries(Array.from({length:520},(_,i)=>['unused'+i,'synthetic']))),'raw-39999');db.close();
   q.configureReadProjectionV049('',true);query({});q.configureReadProjectionV049('',false);
   timing(total+' unused-520-fields page',i=>query({page:i+1}),1200);
  }
  q.invalidateAiResultsV043();
 }
 const files=fs.readdirSync(process.env.JAA_PROJECTION_ROOT).filter(n=>n.endsWith('.sqlite')).map(name=>({name,bytes:fs.statSync(path.join(process.env.JAA_PROJECTION_ROOT,name)).size}));
 results.push({name:'sidecar sizes',status:'PASS',files});
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
main().catch(error=>{results.push({name:'profile execution',status:'FAIL',error:error.stack});console.error(error);process.exitCode=1;}).finally(()=>{q.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({work,runtime:process.versions,cold:'logical cache miss; OS cache unknown',rss:'single process includes fixture creation; peak not isolated per phase',results},null,2));console.log('Evidence '+work);});
