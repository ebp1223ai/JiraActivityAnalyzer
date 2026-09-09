const fs=require('node:fs'),path=require('node:path');
const {root}=require('./v0343-test-helpers.cjs');
const work=path.resolve(process.env.JAA_UI_EVIDENCE||path.join(root,'test-artifacts/v0.3.47','ui-'+Date.now()));
const s=require('./v0347-test-seed.cjs').seed(path.join(work,'seed'),Number(process.env.JAA_V047_UI_TOTAL||39281));
fs.writeFileSync(path.join(work,'seed-map.json'),JSON.stringify(s));
Object.assign(process.env,{JAA_UI_EXPECT_VERSION:'0.3.47',JAA_UI_EVIDENCE:work,JAA_UI_PACKAGE:s.pkgPath,JAA_UI_STRESS_RAW:s.raw,JAA_UI_EXPECT_TOTAL:String(s.total),JAA_UI_EXPECT_MATCHED:'55',JAA_UI_DEEP:'0',JAA_UI_WORKBENCH:'0'});
require('./test-v0344-ui.cjs');
