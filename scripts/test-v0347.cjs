const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {root,load}=require('./v0343-test-helpers.cjs');
const {seed,importAndLink,base}=require('./v0347-test-seed.cjs');
const work=path.join(root,'test-artifacts/v0.3.47','service-'+Date.now());fs.mkdirSync(work,{recursive:true});
const query=load('electron/aiResultsQueryV043.ts',work),policy=load('shared/integratedDisplayV047.ts',work);
const results=[];let s;
const test=(ids,fn)=>{const at=performance.now();try{const detail=fn();results.push({ids,status:'PASS',ms:performance.now()-at,detail});console.log('PASS '+ids);}catch(e){results.push({ids,status:'FAIL',ms:performance.now()-at,error:e.stack});throw e;}};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try{
 test('T47-01/02/04/05 status importer + 32 subsets + facet self exclusion',()=>{
  s=importAndLink(work,seed(work));const before=hash(s.ai);
  for(let mask=0;mask<32;mask++){
   const selected=policy.AI_STATUSES_V047.filter((_,i)=>mask&(1<<i));
   const q={pageSize:25,visibleFields:[],filters:{analysisStatus:{values:selected.map(policy.statusTokenV047)}}};
   const actual=query.queryResultsV043('integrated',s.ai,s.raw,q);
   const expected=s.pkg.records.filter(r=>selected.includes(r.aiAnalysis.status)).length+(selected.includes('NOT_ANALYZED')?65:0);
   assert.equal(actual.filteredCount,expected,'mask '+mask);assert.equal(actual.totalCount,120);assert.equal(actual.statusCounts.reduce((n,c)=>n+c.count,0),120);
   assert.equal(new Set(actual.rows.map(r=>r.id)).size,actual.rows.length);
  }
  assert.equal(hash(s.ai),before);return {subsets:32,rows:120,matched:55};
 });
 test('T47-06 canonical selection + empty/absent and legacy prefs',()=>{
  for(const c of JSON.parse(fs.readFileSync(path.join(base,'preference-cases.json'))).cases.filter(c=>c.action==='LOAD')){
   const actual=policy.normalizeAiSelectionV047(c.stored===null?undefined:c.stored);assert.deepEqual(actual.values,c.expected,c.id);assert.equal(Boolean(actual.warning),Boolean(c.warning),c.id);
  }
  const a=policy.integratedQueryV047({filters:{analysisStatus:{values:['FAILED','UNKNOWN']}}}),b=policy.integratedQueryV047({filters:{analysisStatus:{values:['UNKNOWN','FAILED']}}});assert.deepEqual(a,b);
  assert.notDeepEqual(policy.integratedQueryV047({filters:{analysisStatus:{values:[]}}}),policy.integratedQueryV047({filters:{}}));
  const pref=load('shared/aiViewerPreferencesV043.ts',work);const scope='v045|integrated|raw|ai|2';assert.deepEqual(pref.normalizeAiViewerScopesV043({[scope]:{query:{filters:{analysisStatus:{values:[]}}}}})[scope].query.filters.analysisStatus.values,[]);
 });
 test('T47-09/10/11/12/21 same source metadata, missing/integrity and Raw fields',()=>{
  const rows=query.queryResultsV043('integrated',s.ai,s.raw,{pageSize:200,visibleFields:[]}).rows;
  const ai=query.queryResultsV043('ai',s.ai,s.raw,{pageSize:100,visibleFields:[]}).rows;
  for(const m of s.mapping){
   const r=rows.find(r=>r.id===m.eventId),a=ai.find(r=>r.activityEventId===m.eventId);
   assert.equal(r.displaySourceKind,'AI',m.caseId);assert.equal(r.displayAvailability,m.expected.mode==='DIFF_UNAVAILABLE'?'UNAVAILABLE':m.expected.mode==='DESCRIPTION_COMPACT'?'COMPACT_ONLY':'FULL',m.caseId);
   for(const key of ['before','after','diffText','addedLineCount','removedLineCount','displayReason'])assert.deepEqual(r[key],a[key],m.caseId+' '+key);
   assert.equal(r.addedLineCount,m.expected.added,m.caseId);assert.equal(r.removedLineCount,m.expected.removed,m.caseId);
   assert.equal(r.issueTypeName,'Task');assert.equal(r.currentStatusName,'Open');assert.equal(r.currentPriorityName,'High');
   if(m.expected.removedText)assert.ok(r.diffText.includes(m.expected.removedText),m.caseId);
   if(m.expected.reason)assert.equal(r.displayReason,m.expected.reason,m.caseId);
  }
  assert.equal(rows.find(r=>r.id==='raw-only-description').displaySourceKind,'RAW');
  for(const r of rows.filter(r=>r.fieldName==='Comment')){assert.equal(r.addedLineCount,null);assert.equal(r.removedLineCount,null);}
 });
 test('T47-14/15 full 16 display-source quick filters, search/facet/sort',()=>{
  const baseline=query.queryResultsV043('integrated',s.ai,s.raw,{pageSize:200,visibleFields:[]}).rows;
  for(let mask=0;mask<16;mask++){
   const flags={hideNoChange:!!(mask&1),hideZeroAdded:!!(mask&2),hideZeroDeleted:!!(mask&4),hideBeforeUnavailable:!!(mask&8)};
   const expected=baseline.filter(r=>r.diffApplicability!=='DESCRIPTION'||!((flags.hideNoChange&&r.isSubstantiveChange===false)||(flags.hideZeroAdded&&r.addedLineCount===0)||(flags.hideZeroDeleted&&r.removedLineCount===0)||(flags.hideBeforeUnavailable&&r.beforeAvailability==='UNAVAILABLE'))).map(r=>r.id).sort();
   assert.deepEqual(query.queryResultsV043('integrated',s.ai,s.raw,{pageSize:200,visibleFields:[],diffQuickFilters:flags}).rows.map(r=>r.id).sort(),expected,'mask '+mask);
  }
  const q={filters:{diff:{text:'old AI line'}}};assert.deepEqual(query.queryResultsV043('integrated',s.ai,s.raw,q).rows.map(r=>r.id),['event-000']);
  assert.ok(query.distinctResultsV043('integrated',s.ai,s.raw,'diff',{}).values.some(v=>v.label.includes('old AI line')));
  const sorted=query.queryResultsV043('integrated',s.ai,s.raw,{pageSize:200,sort:{field:'diff',direction:'asc'}});assert.equal(sorted.rows.length,120);
 });
 test('T47-16/22 four whole-result exports and original trace/review preservation',()=>{
  const before=hash(s.ai);
  for(const format of ['json','csv'])for(const visible of [['issueKey','diff','displaySourceKind','analysisStatus'],undefined]){
   const target=path.join(work,format+'-'+Boolean(visible)+'.partial');const r=query.writeQueryExportV044('integrated',s.ai,s.raw,{pageSize:25},visible,target,format);assert.equal(r.filteredCount,120);
   const text=fs.readFileSync(target,'utf8');assert.ok(text.includes('old AI line'));
   if(format==='json'){const out=JSON.parse(text);assert.equal(out.rows.length,120);assert.equal(out.displaySourcePolicy,policy.DISPLAY_POLICY_V047);if(!visible){assert.ok(out.fields.some(f=>f.id.startsWith('raw:')));assert.ok(out.fields.some(f=>f.id.startsWith('ai:')));}}
  }
  assert.equal(hash(s.ai),before);
 });
 test('T47-03/12/20 error, no-AI, unpaired and DB identity separation',()=>{
  assert.equal(query.queryResultsV043('integrated',null,s.raw,{filters:{analysisStatus:{values:['NOT_ANALYZED']}}}).filteredCount,120);
  assert.throws(()=>query.queryResultsV043('integrated',s.ai+'.missing',s.raw),/AI_DATABASE_UNAVAILABLE/);
  const other=path.join(work,'other.sqlite');fs.copyFileSync(s.raw,other);const db=new DatabaseSync(other);db.exec("UPDATE database_metadata SET database_id='other-db'");db.close();
  const actual=query.queryResultsV043('integrated',s.ai,other);assert.equal(actual.matchedCount,0);assert.equal(actual.totalCount,120);assert.equal(actual.unmatchedAiCount,55);
 });
 test('T47-03/12 ambiguous association is Raw, no fanout or AI fallback',()=>{
  const first=s.pkg.records[0],id=query.queryResultsV043('ai',s.ai,s.raw,{pageSize:100}).rows.find(r=>r.activityEventId==='event-000').aiRecordId;
  s.api.recordSourceLinkAttemptV042({databasePath:s.ai,aiRecordId:id,rawDatabaseIdentity:'synthetic-v043-db',record:first,candidates:['candidate-one','candidate-two'].map(activityEventId=>({activityEventId,sourceRecordStableId:first.sourceTrace.reference.sourceRecordStableId,fieldName:first.sourceTrace.reference.fieldName,fieldIdentity:first.sourceTrace.reference.fieldId,eventTime:first.sourceTrace.reference.eventTime}))});
  const r=query.queryResultsV043('integrated',s.ai,s.raw,{pageSize:200});const row=r.rows.find(r=>r.id==='event-000');assert.equal(r.totalCount,120);assert.equal(row.analysisStatus,'NOT_ANALYZED');assert.equal(row.displaySourceKind,'RAW');assert.equal(row.after,'current raw line');assert.equal(r.ambiguousLinkCount,1);assert.equal(r.matchedCount,54);
 });
}catch(e){console.error(e.stack);process.exitCode=1;}
finally{query.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({results,work},null,2));console.log('Evidence '+work);}
