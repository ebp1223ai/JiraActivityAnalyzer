const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {root,load}=require('./v0343-test-helpers.cjs'),{seed,importAndLink,boundaries}=require('./v0348-test-seed.cjs');
const work=path.join(root,'test-artifacts/v0.3.48','focused-'+Date.now());fs.mkdirSync(work,{recursive:true});
const q=load('electron/aiResultsQueryV043.ts',work),p=load('shared/integratedDisplayV047.ts',work),d=load('shared/descriptionDiff.ts',work);
const results=[];let s;const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function test(name,fn){const start=performance.now();try{const detail=fn();results.push({name,status:'PASS',ms:performance.now()-start,detail});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}}
const all={pageSize:200,visibleFields:[]};
try{
 test('T48-02/03/06 bounded Raw and AI guard / unknown / originals',()=>{
  for(const c of boundaries){const row={id:c.id,fieldId:'description',before:c.before,after:c.after,...(c.source==='AI_TRACE'?{aiRecordId:'a',sourceTrace:{diff:{before:c.before,after:c.after,integrityStatus:'VERIFIED'}},integrityStatus:'VERIFIED'}:{})};
   const input=JSON.stringify(row),r=p.descriptionDisplayV047(row);assert.equal(JSON.stringify(row),input);assert.equal(r.diffComputationCount,1);
   assert.equal(r.addedLineCount,c.expected.added);assert.equal(r.removedLineCount,c.expected.deleted);assert.equal(r.beforeAvailability,'AVAILABLE');
   if(c.expected.distance===1414){assert.equal(r.diffStatus,'GUARD');assert.equal(r.diffReason,'DIFF_WORK_GUARD');assert.equal(r.diffText,'');assert.equal(r.diffDiagnostic.distance,1414);assert.ok(r.diffDiagnostic.stack.includes('myersLineDiff'));assert.equal(r.diffDiagnostic.workUnits,2002225);}
  }
  assert.throws(()=>p.descriptionDisplayV047({id:'getter',fieldId:'description',get before(){throw Error('UNKNOWN_PROGRAM_ERROR')}}),/UNKNOWN_PROGRAM_ERROR/);
  assert.equal(d.DESCRIPTION_DIFF_LIMITS.maxWorkUnits,2000000);
 });
 test('T48-19 normal, unchanged, empty, missing, compact, invalid, comment and other',()=>{
  const row=(before,after)=>p.descriptionDisplayV047({id:'normal',fieldId:'description',before,after});assert.equal(row('old','new').addedLineCount,1);assert.equal(row('same','same').isSubstantiveChange,false);assert.equal(row('','new').beforeAvailability,'AVAILABLE');assert.equal(row(null,'new').addedLineCount,null);
  const compact=p.descriptionDisplayV047({id:'compact',fieldId:'description',aiRecordId:'a',integrityStatus:'VERIFIED',sourceTrace:{diff:{before:null,after:null,diffHunks:[{lines:[{kind:'insert',text:'compact'}]}],integrityStatus:'VERIFIED'}}});assert.equal(compact.diffStatus,'COMPACT');assert.equal(compact.addedLineCount,1);
  assert.equal(p.descriptionDisplayV047({id:'bad',fieldId:'description',aiRecordId:'a',integrityStatus:'MISMATCH',sourceTrace:{diff:{before:'old',after:'new'}}}).displayReason,'AI_DIFF_INTEGRITY');
  for(const eventType of ['comment_created','comment_updated'])assert.equal(p.descriptionDisplayV047({id:'comment',fieldId:'comment',eventType,after:{body:'full comment'}}).diffApplicability,'NOT_APPLICABLE');assert.equal(p.descriptionDisplayV047({id:'other',fieldId:'status'}).diffApplicability,'OTHER');
 });
 test('T48-04/05/13/21 real importer/links and Raw mother preservation',()=>{
  s=importAndLink(work,seed(work));const h=[hash(s.ai),hash(s.raw)];
  const r=q.queryResultsV043('integrated',s.ai,s.raw,all);assert.equal(r.totalCount,120);assert.equal(r.matchedCount,55);assert.equal(r.warningCount,3);assert.equal(r.rows.length,120);
  for(const id of s.guardIds){const row=r.rows.find(r=>r.id===id);assert.equal(row.diffStatus,'GUARD');assert.equal(row.addedLineCount,null);}
  const raw=r.rows.find(r=>r.id==='raw-60'),ai=r.rows.find(r=>r.id==='event-000');assert.equal(raw.displaySourceKind,'RAW');assert.equal(ai.displaySourceKind,'AI');assert.notEqual(ai.before,ai.rawSupplement.before);
  const same=q.queryResultsV043('ai',s.ai,s.raw,all).rows.find(r=>r.activityEventId==='event-000');assert.equal(same.diffText,ai.diffText);assert.equal(same.before,ai.before);
  assert.deepEqual([hash(s.ai),hash(s.raw)],h);
 });
 test('T48-07/11 all 16 quick filters and 32 status subsets with guard',()=>{
  const baseline=q.queryResultsV043('integrated',s.ai,s.raw,all).rows;
  for(let mask=0;mask<16;mask++){const flags={hideNoChange:!!(mask&1),hideZeroAdded:!!(mask&2),hideZeroDeleted:!!(mask&4),hideBeforeUnavailable:!!(mask&8)};
   const expected=baseline.filter(r=>r.diffApplicability!=='DESCRIPTION'||!((flags.hideNoChange&&r.isSubstantiveChange===false)||(flags.hideZeroAdded&&r.addedLineCount===0)||(flags.hideZeroDeleted&&r.removedLineCount===0)||(flags.hideBeforeUnavailable&&r.beforeAvailability==='UNAVAILABLE'))).map(r=>r.id).sort();
   assert.deepEqual(q.queryResultsV043('integrated',s.ai,s.raw,{...all,diffQuickFilters:flags}).rows.map(r=>r.id).sort(),expected);
  }
  for(let mask=0;mask<32;mask++){const statuses=p.AI_STATUSES_V047.filter((_,i)=>mask&(1<<i)),r=q.queryResultsV043('integrated',s.ai,s.raw,{...all,filters:{analysisStatus:{values:statuses}}});
   assert.equal(r.filteredCount,baseline.filter(r=>statuses.includes(r.analysisStatus)).length);assert.equal(r.warningCount,baseline.filter(r=>statuses.includes(r.analysisStatus)&&r.diffStatus==='GUARD').length);
   assert.equal(r.statusCounts.reduce((a,c)=>a+c.count,0),120);
  }
 });
 test('T48-08 search coverage is other-condition whole scope including negative',()=>{
  const candidate=q.queryResultsV043('integrated',s.ai,s.raw,all).rows.filter(r=>r.diffSearchUnknown).length;
  for(const operator of ['contains','not-contains','exact','not-equal']){
   const r=q.queryResultsV043('integrated',s.ai,s.raw,{pageSize:25,visibleFields:[],filters:{diff:{text:'line',operator}}});assert.equal(r.searchUnknownCount,candidate);assert.ok(r.rows.every(r=>!r.diffSearchUnknown));
  }
  const r=q.queryResultsV043('integrated',s.ai,s.raw,{...all,filters:{diff:{text:'DIFF_WORK_GUARD'},analysisStatus:{values:['NOT_ANALYZED']}}});
  assert.equal(r.filteredCount,0);assert.equal(r.searchUnknownCount,2);assert.equal(r.searchCoverage,'INCOMPLETE');
 });
 test('T48-09/10 four exports / warnings / null / stale / I/O failure',()=>{
  for(const format of ['json','csv'])for(const visible of [['issueKey'],undefined]){
   const target=path.join(work,format+'-'+!!visible+'.partial'),r=q.writeQueryExportV044('integrated',s.ai,s.raw,{pageSize:25},visible,target,format);assert.equal(r.filteredCount,120);assert.equal(r.warningCount,3);
   const text=fs.readFileSync(target,'utf8');assert.ok(text.includes('DIFF_WORK_GUARD'));assert.ok(text.includes('displaySourceKind'));
   if(format==='json'){const data=JSON.parse(text);assert.equal(data.rows.length,120);assert.equal(data.warningCount,3);}
  }
  assert.throws(()=>q.writeQueryExportV044('integrated',s.ai,s.raw,{expectedSnapshot:'old'},[],path.join(work,'stale.partial'),'json'),/EXPORT_SNAPSHOT_CHANGED/);
  assert.throws(()=>q.writeQueryExportV044('integrated',s.ai,s.raw,{},[],path.join(work,'missing/failed.partial'),'json'),/ENOENT/);
 });
 test('T48-03/13/14 global failure retained / date facet late fields / no AI',()=>{
  const r=q.queryResultsV043('integrated',s.ai,s.raw,all);assert.ok(r.fieldCatalog.some(f=>f.label.includes('onlyAtTail')));
  const tail=r.fieldCatalog.find(f=>f.label.includes('onlyAtTail'));assert.equal(q.queryResultsV043('integrated',s.ai,s.raw,{...all,filters:{[tail.path]:{text:'present',operator:'exact'}}}).filteredCount,1);assert.ok(q.distinctResultsV043('integrated',s.ai,s.raw,tail.path,all).values.some(v=>v.label==='present'));
  assert.throws(()=>q.queryResultsV043('integrated',s.ai,s.raw,{filters:{eventTime:{from:'2026-09-10',to:'2026-09-01'}}}),/QUERY_DATE_RANGE_INVALID/);
  for(const filter of [{from:'2026-09-07',to:'2026-09-07'},{from:'2026-09-07'},{to:'2026-09-07'}])assert.ok(q.queryResultsV043('integrated',s.ai,s.raw,{filters:{eventTime:filter},timeZone:'UTC'}).filteredCount>0);
  assert.equal(q.queryResultsV043('integrated',null,s.raw,all).totalCount,120);
  const broken=path.join(work,'broken.sqlite');new DatabaseSync(broken).close();assert.throws(()=>q.queryResultsV043('integrated',null,broken),/no such table/);
  assert.equal(q.latestQueryDiagnosticsV043().cacheEntries,0);
 });
 test('T48-03 finding integrity still fails, no broad catch',()=>{
  const bad=path.join(work,'bad-ai.sqlite');fs.copyFileSync(s.ai,bad);const db=new DatabaseSync(bad);db.exec('DELETE FROM ai_skill_findings');db.close();
  assert.throws(()=>q.queryResultsV043('integrated',bad,s.raw),/ACTIVE_FINDING_PROJECTION_MISMATCH/);
 });
}catch(e){console.error(e.stack);process.exitCode=1;}finally{q.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({results,work},null,2));console.log('Evidence '+work);}
