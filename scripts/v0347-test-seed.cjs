const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {root,load,seedRaw}=require('./v0343-test-helpers.cjs');
const base=path.join(root,'tests/fixtures/v0.3.47');
function seed(work,total=120){
 fs.mkdirSync(work,{recursive:true});
 const pkg=JSON.parse(fs.readFileSync(path.join(base,'package-status-mix-55.json')));
 const cases=JSON.parse(fs.readFileSync(path.join(base,'diff-source-cases.json'))).cases.filter(c=>c.field==='Description'&&c.linked);
 pkg.packageId+='-production-adapter-v047';const mapping=[];
 for(let i=0;i<pkg.records.length;i++){
  const r=pkg.records[i],t=r.sourceTrace,ref=t.reference;
  if(i<cases.length){
   const c=cases[i];ref.fieldId='description';ref.fieldName='Description';ref.sourceProvenance='jira_changelog';ref.sourceRecordStableId=ref.historyId+':0';ref.historyItemIndex=0;ref.eventType='field_changed';r.aiAnalysis.sourceRecordStableId=ref.sourceRecordStableId;
   t.diff={...t.diff,before:c.ai.before??null,after:c.ai.after??null,diffHunks:c.ai.hunks?.map(h=>({lines:[...h.removed.map(text=>({kind:'delete',text})),...h.added.map(text=>({kind:'insert',text}))]}))??[],diffText:'',integrityStatus:c.ai.integrity??'VERIFIED'};
   for(const f of r.aiAnalysis.skillFindings) f.evidence=[{sourceJsonPointer:'/records/'+i+'/diff/after',quote:String(c.ai.after)}];
   mapping.push({caseId:c.id,eventId:ref.activityEventId,expected:c.expected,raw:c.raw});
  }else{
   t.diff.after={body:'Synthetic full comment '+i+'\n'+t.diff.diffHunks[0].lines[0].text};
  }
 }
 const pkgPath=path.join(work,'adapted-package.json');fs.writeFileSync(pkgPath,JSON.stringify(pkg));
 const rows=pkg.records.map((r,i)=>{const m=mapping.find(m=>m.eventId===r.sourceTrace.reference.activityEventId);return {...r,eventType:i<cases.length?'field_changed':i===7?'comment_created':'comment_updated',before:m?.raw.before??null,after:m?.raw.after??r.sourceTrace.diff.after};});
 rows.push({id:'raw-only-description',issue:'RAW-1',actor:'Synthetic A',eventTime:'2026-09-07T00:00:00Z',fieldId:'description',fieldName:'Description',eventType:'field_changed',before:'raw old',after:'raw new'});
 for(let i=rows.length;i<total;i++)rows.push({id:'raw-'+i,issue:'RAW-'+i,actor:i%2?'Synthetic A':'Synthetic B',eventTime:'2026-09-07T00:00:00Z',fieldId:'comment',fieldName:'Comment',eventType:'comment_updated',before:null,after:{body:'Raw comment '+i}});
 const raw=path.join(work,'raw.sqlite');seedRaw(raw,rows,work);
 const db=new DatabaseSync(raw);for(const m of mapping){const ref=pkg.records.find(r=>r.sourceTrace.reference.activityEventId===m.eventId).sourceTrace.reference;db.prepare('UPDATE activity_events SET jira_native_source_id=? WHERE id=?').run(ref.historyId,m.eventId);}db.exec("INSERT INTO current_issue_snapshots(source_object_id,summary,status,issue_type,priority,labels_json,components_json,versions_json,snapshot_json,snapshot_updated_at) SELECT id,'Synthetic issue','Open','Task','High','[]','[]','[]','{}','2026-09-01T00:00:00Z' FROM source_objects");
 db.close();
 return {raw,pkg,pkgPath,mapping,total};
}
function importAndLink(work,s){
 const api=load('electron/aiAnalysisDatabaseV042.ts',work);
 const ai=path.join(work,'ai.sqlite');
 const options={databasePath:ai,packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
 api.initializeAiDatabaseV042({databasePath:ai});
 api.importAiAnalysisPackageV042({...options,packagePath:s.pkgPath});
 const db=new DatabaseSync(ai);
 const ids=db.prepare('SELECT ai_record_id,activity_event_id FROM ai_records').all();db.close();
 const rawDb=new DatabaseSync(s.raw,{readOnly:true});
 for(const r of ids){const record=s.pkg.records.find(x=>x.sourceTrace.reference.activityEventId===r.activity_event_id);const candidates=rawDb.prepare('SELECT id activityEventId FROM activity_events WHERE id=?').all(r.activity_event_id);api.recordSourceLinkAttemptV042({databasePath:ai,aiRecordId:r.ai_record_id,rawDatabaseIdentity:'synthetic-v043-db',record,candidates});}
 rawDb.close();
 return {...s,ai,options,api};
}
module.exports={seed,importAndLink,base};
