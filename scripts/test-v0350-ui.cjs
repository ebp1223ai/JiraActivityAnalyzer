const fs=require('node:fs'),path=require('node:path');
const {root}=require('./v0343-test-helpers.cjs');
const work=path.resolve(process.env.JAA_UI_EVIDENCE||path.join(root,'test-artifacts/v0.3.50','ui-'+Date.now()));
const s=require('./v0348-test-seed.cjs').seed(path.join(work,'seed'),120);
if(process.env.JAA_UI_LARGE_DB==='1'){
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(s.raw);
 try{db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE synthetic_unused_padding(body BLOB); BEGIN');const put=db.prepare('INSERT INTO synthetic_unused_padding VALUES(zeroblob(?))');for(let i=0;i<33;i++)put.run(64*1024*1024);db.exec('COMMIT');}finally{db.close();}
 console.log('Synthetic large Raw DB bytes '+fs.statSync(s.raw).size);
}
fs.writeFileSync(path.join(work,'seed-map.json'),JSON.stringify(s));
Object.assign(process.env,{JAA_UI_EXPECT_VERSION:'0.3.50',JAA_UI_EVIDENCE:work,JAA_UI_PACKAGE:s.pkgPath,JAA_UI_STRESS_RAW:s.raw,JAA_UI_EXPECT_TOTAL:'120',JAA_UI_EXPECT_MATCHED:'55',JAA_UI_DEEP:'0',JAA_UI_SHORT:'1',JAA_UI_WORKBENCH:'0'});
require('./test-v0344-ui.cjs');
