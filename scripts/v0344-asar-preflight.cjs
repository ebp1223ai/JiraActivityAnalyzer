const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const version=process.env.JAA_TEST_VERSION||'0.3.44';
const work=path.join(root,'test-artifacts','v'+version,`asar-preflight-${Date.now()}`),input=path.join(work,'input');
const baseline=path.join(root,'release/v0.3.43-candidate/win-unpacked/resources/app.asar');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
const prohibited='node_modules/json-schema-traverse/spec/fixtures/schema.js';
const exclusion='!node_modules/json-schema-traverse/spec/**';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
  assert.ok(pkg.build.files.includes(exclusion));
  assert.equal(pkg.version,version);
  fs.mkdirSync(input,{recursive:true});asar.extractAll(baseline,input);
  const original=fs.readFileSync(path.join(input,prohibited));assert.equal(original.length,5544);
  const prefix=path.join(input,'node_modules/json-schema-traverse/spec');
  assert.ok(path.resolve(prefix).startsWith(path.resolve(input)+path.sep));
  fs.rmSync(prefix,{recursive:true});
  for(const dir of ['dist','dist-electron']){ const target=path.join(input,dir);assert.ok(path.resolve(target).startsWith(path.resolve(input)+path.sep));fs.rmSync(target,{recursive:true,force:true});fs.cpSync(path.join(root,dir),target,{recursive:true}); }
  fs.copyFileSync(path.join(root,'package.json'),path.join(input,'package.json'));
  // Unchanged production dependencies are taken from the prior frozen archive, not a new EXE.
  const before=asar.listPackage(baseline).filter(f=>/license|notice|\.node$/i.test(f));
  const archive=path.join(work,'app.asar');await asar.createPackage(input,archive);
  const entries=asar.listPackage(archive);
  const forbidden=entries.filter(f=>/(?:^|[\\/])(?:fixtures|test-artifacts|08_private_local_only|token\.txt|\.env|@playwright|playwright-core)(?:[\\/]|$)|\.(sqlite3?|db|7z|zip)$/i.test(f));
  assert.deepEqual(forbidden,[]);
  for(const file of before)assert.ok(entries.includes(file),`runtime/license removed: ${file}`);
  for(const file of ['dist/index.html','dist-electron/main.cjs','dist-electron/preload.cjs','dist-electron/ai-results-worker-v044.cjs','dist-electron/diagnostic-writer-v044.cjs','dist-electron/ai-write-worker-v044.cjs','node_modules/json-schema-traverse/index.js'])assert.ok(entries.some(e=>e.replaceAll('\\','/').replace(/^\//,'')===file),file);
  fs.writeFileSync(path.join(work,'file-list.json'),JSON.stringify(entries,null,2));
  const report={status:'PASS',version,method:'prior frozen production dependency archive + current compiled app inputs; actual final builder archive remains a separate required gate',excluded:{path:prohibited,bytes:original.length,sha256:hash(original),pattern:exclusion},archive,archiveBytes:fs.statSync(archive).size,sha256:hash(fs.readFileSync(archive)),preservedNativeLicenseCount:before.length,forbidden,appExeProduced:false};
  fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
