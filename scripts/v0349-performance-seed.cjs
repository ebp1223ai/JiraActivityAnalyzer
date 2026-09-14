const fs=require('node:fs'),path=require('node:path');
const {seed,importAndLink}=require('./v0348-test-seed.cjs');
const dir=path.resolve(process.argv[2]),total=Number(process.argv[3]);
if(!Number.isSafeInteger(total)||total<120||total>100000)throw Error('SYNTHETIC_SIZE_INVALID');
const result=importAndLink(dir,seed(dir,total));
fs.writeFileSync(path.join(dir,'seed-result.json'),JSON.stringify(result));
