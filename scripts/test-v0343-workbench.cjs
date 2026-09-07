const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {_electron:electron}=require('@playwright/test');
const {root,load}=require('./v0343-test-helpers.cjs');
const work=path.join(root,'test-artifacts/v0.3.43',`workbench-${Date.now()}`),appRoot=path.join(work,'app-root');
fs.mkdirSync(appRoot,{recursive:true});fs.writeFileSync(path.join(appRoot,'.env'),'# Isolated synthetic test\n');
const store=load('electron/aiAnalysisDatabaseV042.ts',work),asset=path.join(root,'contracts/ai-analysis/Skill_Analysis_Review_Workbench_v1.13.2.html');
const originalHash=crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex');
const options={packageSchemaPath:path.join(root,'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'),sourceTraceSchemaPath:path.join(root,'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json')};
const report={results:[],errors:[],networkRequests:[],originalHash};let app;const start=Date.now();
async function main(){
 app=await electron.launch({args:[root],env:{...process.env,JAA_DEV_APP_ROOT:appRoot,JAA_V043_BACKGROUND:'1',OPEN_DEVTOOLS:'0'}});await app.firstWindow();
 for(const [version,relative,count] of [['2.0.1','v201/package-ai-only-55.json',55],['2.0.0','legacy_v200/jaa-ai-analysis-package-v2__ai-only__golden-44.json',44]]){
  const pending=app.waitForEvent('window');const output=path.join(work,`roundtrip-${version}.json`);
  await app.evaluate(({BrowserWindow},{asset,output,version})=>{const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:`workbench-${version}`}});w.webContents.session.on('will-download',(_e,item)=>{item.setSavePath(output);w.downloadState='pending';item.once('done',(_e,state)=>{w.downloadState=state;});});void w.loadFile(asset);},{asset,output,version});
  const page=await pending;page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.networkRequests.push(r.url());});
  await page.waitForSelector('#file',{state:'attached'});const input=path.join(root,'tests/fixtures/v0.3.43',relative),source=JSON.parse(fs.readFileSync(input));
  await page.locator('#file').setInputFiles(input);await page.locator('#workspace').waitFor();assert.equal(await page.locator('#recordList .record').count(),count);
  await page.locator('#recordNotes').fill('Synthetic partial review roundtrip');await page.locator('#export').click();
  for(let i=0;i<100;i++){const state=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('Workbench'))?.downloadState);if(state==='completed')break;await page.waitForTimeout(50);}assert.ok(fs.existsSync(output),'export file missing');
  const exported=JSON.parse(fs.readFileSync(output));assert.equal(exported.schemaVersion,version);assert.equal(exported.reviewRank,'REVIEW_PARTIAL');assert.deepEqual(exported.rulesBinding,source.rulesBinding);
  for(let i=0;i<count;i++){assert.deepEqual(exported.records[i].sourceTrace,source.records[i].sourceTrace);assert.deepEqual(exported.records[i].aiAnalysis,source.records[i].aiAnalysis);}
  const validated=store.validateAiAnalysisPackageV042({...options,filePath:output});assert.equal(validated.preview.ok,true,JSON.stringify(validated.preview.errors));
  const ai=path.join(work,`roundtrip-${version}.sqlite`);store.initializeAiDatabaseV042({databasePath:ai});const receipt=store.importAiAnalysisPackageV042({...options,databasePath:ai,packagePath:output});assert.equal(receipt.insertedCount,count);
  report.results.push({version,status:'PASS',records:count,rank:exported.reviewRank,traceAndAiDeepEqual:true});await page.close();
 }
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex'),originalHash);assert.equal(report.errors.length,0);assert.equal(report.networkRequests.length,0);report.status='PASS';
}
main().catch(e=>{report.status='FAIL';report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();report.durationMs=Date.now()-start;fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log(`Workbench evidence: ${work}`);});
