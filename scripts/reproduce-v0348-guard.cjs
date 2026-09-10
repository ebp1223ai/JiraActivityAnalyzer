const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,load}=require('./v0343-test-helpers.cjs');
const out=path.join(root,'test-artifacts/v0.3.48/baseline-'+Date.now());fs.mkdirSync(out,{recursive:true});
const policy=load('shared/integratedDisplayV047.ts',out);
const cases=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v0.3.48/guard-boundaries.json'))).cases;
const results=[];
for(const c of cases){
 const row={id:c.id,fieldId:'description',before:c.before,after:c.after,...(c.source==='AI_TRACE'?{aiRecordId:'synthetic-ai',integrityStatus:'VERIFIED',sourceTrace:{diff:{before:c.before,after:c.after,integrityStatus:'VERIFIED'}}}:{})};
 const start=performance.now();let error=null,result;
 try{result=policy.descriptionDisplayV047(row);}catch(e){error=e.message;}
 if(c.expected.distance===1414)assert.equal(error,'DIFF_WORK_GUARD');
 else {assert.equal(error,null);assert.equal(result.addedLineCount,707);assert.equal(result.removedLineCount,706);}
 results.push({id:c.id,status:'PASS_BASELINE_REPRODUCED',error,ms:performance.now()-start});
}
fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify({source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results},null,2));console.log(JSON.stringify({out,results}));

