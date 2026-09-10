const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {root}=require('./v0343-test-helpers.cjs');
const previous=require('./v0347-test-seed.cjs');
const boundaries=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v0.3.48/guard-boundaries.json'))).cases;
function seed(work,total=120){
 const s=previous.seed(work,total),guard=boundaries.find(c=>c.id==='distance-1414-RAW');
 const first=s.pkg.records[0];first.sourceTrace.diff.before=guard.before;first.sourceTrace.diff.after=guard.after;
 first.sourceTrace.diff.diffHunks=[];first.sourceTrace.diff.diffText='';
 for(const f of first.aiAnalysis.skillFindings)f.evidence=[{sourceJsonPointer:'/records/0/diff/after',quote:guard.after.split('\n')[0]}];
 s.pkg.packageId+='-v048-guard';fs.writeFileSync(s.pkgPath,JSON.stringify(s.pkg));
 const db=new DatabaseSync(s.raw);
 const ids=total===39281?['raw-60','raw-18000','raw-39279']:['raw-60','raw-118'];
 for(const id of ids)db.prepare("UPDATE activity_events SET field_id='description',field_name='Description',event_type='field_changed',from_value_json=?,to_value_json=? WHERE id=?").run(JSON.stringify(guard.before),JSON.stringify(guard.after),id);
 db.prepare("UPDATE activity_events SET from_value_json=? WHERE id=?").run(JSON.stringify({onlyAtTail:'present',nested:{flag:false},list:[{count:0}]}),'raw-'+(total-1));
 db.close();return {...s,guardIds:['event-000',...ids],guard};
}
module.exports={seed,importAndLink:previous.importAndLink,boundaries};
