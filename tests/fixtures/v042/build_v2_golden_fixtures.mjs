import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const contracts = path.join(root, '03_contracts');
const pendingPath = path.join(here, 'pending-analysis__source-trace-golden-3.json');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const binding = (file, version) => {
  const p = path.join(contracts, file);
  return {file, version, bytes:fs.statSync(p).size, sha256:sha(p)};
};
const clone = v => structuredClone(v);
const write = (name, value) => fs.writeFileSync(path.join(here, name), JSON.stringify(value, null, 2)+'\n');

const pending = readJson(pendingPath);
const pendingDocument = clone(pending);
delete pendingDocument.records;
delete pendingDocument.sourceDatabase;
delete pendingDocument.sourceView;
delete pendingDocument.querySnapshot;
delete pendingDocument.exportMetadata;
pendingDocument.pendingFilename = path.basename(pendingPath);
pendingDocument.pendingFileSha256 = sha(pendingPath);

const analyses = [
  {
    status:'CLASSIFIED', confidence:0.9,
    skillFindings:[{
      skillId:'GC_007', skillName:'GC Suspend/Stop Flow', confidence:0.9,
      evidence:[{sourceJsonPointer:'/records/0/sourceTrace/diff/diffHunks/0/lines/0/text',quote:'GC Suspend 時 Copy Data State 切換錯誤。'}],
      negativeChecks:['不是單純流程通知；內容直接描述 GC Suspend 狀態轉移。'],
      rationale:'直接描述 GC Suspend 中 Copy Data State 切換錯誤。'
    }],
    recordNegativeChecks:[], unknownReasons:[], rationale:'具體描述 GC Suspend 領域問題。'
  },
  {
    status:'EXCLUDED', confidence:0,
    skillFindings:[], recordNegativeChecks:['只有請求關閉 Issue，沒有技術內容。'], unknownReasons:[], rationale:'流程性通知。'
  },
  {
    status:'UNKNOWN', confidence:0.3,
    skillFindings:[], recordNegativeChecks:['只有函式名稱，缺少行為、參數與實際修改。'], unknownReasons:['Evidence 太短，無法可靠區分 GC／COP0 實作技能。'], rationale:'保留來源但不強迫分類。'
  }
];

const records = pending.records.map((r,i) => ({
  recordIndex:i,
  dedupeKey:`${r.reference.sourceDatabaseId}|${r.reference.activityEventId}`,
  sourceTrace:{reference:clone(r.reference),diff:clone(r.diff),pendingIntegrity:clone(r.integrity),optionalIntegrityReceipt:null},
  aiAnalysis:{recordIndex:i,evidenceId:r.reference.evidenceId,sourceRecordStableId:r.reference.sourceRecordStableId,issueKey:r.reference.issueKey,...analyses[i]},
  manualReview:null,
  integrityReceipt:null
}));

const counts = recs => ({
  records:recs.length,
  classified:recs.filter(r=>r.aiAnalysis.status==='CLASSIFIED').length,
  unknown:recs.filter(r=>r.aiAnalysis.status==='UNKNOWN').length,
  excluded:recs.filter(r=>r.aiAnalysis.status==='EXCLUDED').length,
  failed:recs.filter(r=>r.aiAnalysis.status==='FAILED').length,
  skillFindings:recs.reduce((n,r)=>n+r.aiAnalysis.skillFindings.length,0),
  reviewedRecords:recs.filter(r=>r.manualReview!==null).length,
  completedReviews:recs.filter(r=>r.manualReview?.completed).length
});

const base = {
  schemaName:'jaa-ai-analysis-package', schemaVersion:'2.0.0',
  packageId:'fixture-ai-only-golden-3', createdAt:'2026-09-02T00:10:00.000Z',
  generator:{name:'JAA v2 Fixture Builder',version:'1.0.0',mode:'TEST_FIXTURE'},
  reviewRank:'AI_ONLY',
  sourceTrace:{
    contractVersion:'JAA-SOURCE-TRACE-v1', pendingDocument,
    sourceDatabase:clone(pending.sourceDatabase), sourceView:pending.sourceView,
    querySnapshot:clone(pending.querySnapshot), exportMetadata:clone(pending.exportMetadata),
    optionalIntegrityReceipt:null
  },
  rulesBinding:{
    manifest:binding('Skill_Analysis_Rule_Set_Manifest_v1.6.0.md','1.6.0'),
    commonRules:binding('Skill_Classification_Common_Rules_v2.6.0.md','2.6.0'),
    skillCatalog:binding('Skill_Catalog_v0.3.5.md','0.3.5'),
    htmlTemplate:binding('Skill_Analysis_HTML_Report_Template_v1.13.1.md','1.13.1')
  },
  counts:counts(records), records, packageIntegrityReceipt:null
};
write('jaa-ai-analysis-package-v2__ai-only__golden-3.json', base);

const reviewed = clone(base);
reviewed.packageId='fixture-review-completed-golden-3';
reviewed.createdAt='2026-09-02T00:20:00.000Z';
reviewed.reviewRank='REVIEW_COMPLETED';
reviewed.records.forEach(r=>r.manualReview={
  recordIndex:r.recordIndex,
  expectedStatus:r.aiAnalysis.status,
  skillReviews:r.aiAnalysis.skillFindings.map(f=>({skillId:f.skillId,verdict:'ACCEPT',proposedConfidence:null,notes:''})),
  missingSkillReviews:[], additionalEvidenceAssignments:[], notes:'Golden completed review', completed:true
});
reviewed.counts=counts(reviewed.records);
write('jaa-ai-analysis-package-v2__review-completed__golden-3.json', reviewed);

const partial = clone(reviewed);
partial.packageId='fixture-review-partial-golden-3';
partial.createdAt='2026-09-02T00:15:00.000Z';
partial.reviewRank='REVIEW_PARTIAL';
partial.records[1].manualReview=null;
partial.records[2].manualReview.completed=false;
partial.records[2].manualReview.notes='Golden review saved but not completed';
partial.counts=counts(partial.records);
write('jaa-ai-analysis-package-v2__review-partial__golden-3.json', partial);

const pending44=clone(pending);
pending44.exportId='export-source-trace-golden-44';
pending44.appVersion='0.3.42-fixture';
pending44.counts={recordCount:44};
pending44.records=Array.from({length:44},(_,i)=>{
  const r=clone(pending.records[0]);
  const n=String(i).padStart(3,'0');
  const day=String(1+(i%28)).padStart(2,'0');
  r.reference.evidenceId=`pae_fixture_44_${n}`;
  r.reference.activityEventId=`activity-fixture-44-${n}`;
  r.reference.sourceRecordStableId=`stable-44-${n}`;
  r.reference.historyId=`history-44-${n}`;
  r.reference.issueId=`issue-44-${n}`;
  r.reference.issueKey=`FIX-${1000+i}`;
  r.reference.eventTime=`2026-08-${day}T${String(i%24).padStart(2,'0')}:00:00.000Z`;
  const text=`Synthetic trace ${n}: GC Suspend state transition and debug investigation.`;
  r.diff.diffText=`+ ${text}`;
  r.diff.diffHunks[0].id=`h44-${n}`;
  r.diff.diffHunks[0].lines[0].text=text;
  r.integrity={recordSha256:`fixture-record-${n}`,originalEvidenceAvailable:true,sourceContentHashesVerified:true,diagnostics:[]};
  return r;
});
write('pending-analysis__source-trace-golden-44.json',pending44);

const pending44Path=path.join(here,'pending-analysis__source-trace-golden-44.json');
const pending44Document=clone(pending44);
delete pending44Document.records;
delete pending44Document.sourceDatabase;
delete pending44Document.sourceView;
delete pending44Document.querySnapshot;
delete pending44Document.exportMetadata;
pending44Document.pendingFilename=path.basename(pending44Path);
pending44Document.pendingFileSha256=sha(pending44Path);

const skillTemplates=[
  ['GC_007','GC Suspend/Stop Flow'],
  ['DEBUG_004','Bug 分析：洞察癥結、改善效率'],
  ['SYSTEM_003','HMB']
];
const records44=pending44.records.map((r,i)=>{
  const n=String(i).padStart(3,'0');
  const findingCount=i<25?3:2;
  const quote=r.diff.diffHunks[0].lines[0].text;
  const skillFindings=skillTemplates.slice(0,findingCount).map(([skillId,skillName])=>({
    skillId,skillName,confidence:0.9,
    evidence:[{sourceJsonPointer:`/records/${i}/sourceTrace/diff/diffHunks/0/lines/0/text`,quote}],
    negativeChecks:['Synthetic fixture has explicit domain and investigation wording.'],
    rationale:`Synthetic ${skillId} finding for importer and viewer regression.`
  }));
  return {
    recordIndex:i,
    dedupeKey:`${r.reference.sourceDatabaseId}|${r.reference.activityEventId}`,
    sourceTrace:{reference:clone(r.reference),diff:clone(r.diff),pendingIntegrity:clone(r.integrity),optionalIntegrityReceipt:null},
    aiAnalysis:{recordIndex:i,evidenceId:r.reference.evidenceId,sourceRecordStableId:r.reference.sourceRecordStableId,issueKey:r.reference.issueKey,status:'CLASSIFIED',confidence:0.9,skillFindings,recordNegativeChecks:[],unknownReasons:[],rationale:`Synthetic classified record ${n}.`},
    manualReview:null,
    integrityReceipt:null
  };
});
const package44=clone(base);
package44.packageId='fixture-ai-only-golden-44';
package44.createdAt='2026-09-02T00:30:00.000Z';
package44.generator={name:'JAA v0.3.42 Synthetic Regression Fixture Builder',version:'1.0.0',mode:'TEST_FIXTURE'};
package44.sourceTrace={contractVersion:'JAA-SOURCE-TRACE-v1',pendingDocument:pending44Document,sourceDatabase:clone(pending44.sourceDatabase),sourceView:pending44.sourceView,querySnapshot:clone(pending44.querySnapshot),exportMetadata:clone(pending44.exportMetadata),optionalIntegrityReceipt:null};
package44.records=records44;
package44.reviewRank='AI_ONLY';
package44.counts=counts(package44.records);
write('jaa-ai-analysis-package-v2__ai-only__golden-44.json',package44);

const partial44=clone(package44);
partial44.packageId='fixture-review-partial-golden-44';
partial44.createdAt='2026-09-02T00:40:00.000Z';
partial44.reviewRank='REVIEW_PARTIAL';
partial44.records.slice(0,6).forEach(r=>r.manualReview={recordIndex:r.recordIndex,expectedStatus:r.aiAnalysis.status,skillReviews:r.aiAnalysis.skillFindings.map(f=>({skillId:f.skillId,verdict:'ACCEPT',proposedConfidence:null,notes:''})),missingSkillReviews:[],additionalEvidenceAssignments:[],notes:'Synthetic completed review',completed:true});
partial44.records[6].manualReview={recordIndex:6,expectedStatus:'CLASSIFIED',skillReviews:[],missingSkillReviews:[],additionalEvidenceAssignments:[],notes:'Synthetic in-progress review',completed:false};
partial44.counts=counts(partial44.records);
write('jaa-ai-analysis-package-v2__review-partial__golden-44.json',partial44);

const completed44=clone(package44);
completed44.packageId='fixture-review-completed-golden-44';
completed44.createdAt='2026-09-02T00:50:00.000Z';
completed44.reviewRank='REVIEW_COMPLETED';
completed44.records.forEach(r=>r.manualReview={recordIndex:r.recordIndex,expectedStatus:r.aiAnalysis.status,skillReviews:r.aiAnalysis.skillFindings.map(f=>({skillId:f.skillId,verdict:'ACCEPT',proposedConfidence:null,notes:''})),missingSkillReviews:[],additionalEvidenceAssignments:[],notes:'Synthetic completed review',completed:true});
completed44.counts=counts(completed44.records);
write('jaa-ai-analysis-package-v2__review-completed__golden-44.json',completed44);

const negative = clone(base);
negative.packageId='fixture-negative-missing-diff';
delete negative.records[1].sourceTrace.diff;
write('jaa-ai-analysis-package-v2__negative-missing-diff.json', negative);

write('JAA_v0.3.42_Golden_Fixture_Expected_Results.json', {
  schemaName:'jaa-v0.3.42-fixture-expected-results', schemaVersion:'1.0.0',
  expected:[
    {file:'jaa-ai-analysis-package-v2__ai-only__golden-3.json',schema:'PASS',sourceTrace:'3/3 COMPLETE',reviewRank:'AI_ONLY'},
    {file:'jaa-ai-analysis-package-v2__review-partial__golden-3.json',schema:'PASS',sourceTrace:'3/3 COMPLETE',reviewRank:'REVIEW_PARTIAL',nullManualReviews:1},
    {file:'jaa-ai-analysis-package-v2__review-completed__golden-3.json',schema:'PASS',sourceTrace:'3/3 COMPLETE',reviewRank:'REVIEW_COMPLETED'},
    {file:'jaa-ai-analysis-package-v2__ai-only__golden-44.json',schema:'PASS',records:44,findings:113,reviewRank:'AI_ONLY'},
    {file:'jaa-ai-analysis-package-v2__review-partial__golden-44.json',schema:'PASS',records:44,findings:113,reviewRank:'REVIEW_PARTIAL',nullManualReviews:37},
    {file:'jaa-ai-analysis-package-v2__review-completed__golden-44.json',schema:'PASS',records:44,findings:113,reviewRank:'REVIEW_COMPLETED'},
    {file:'jaa-ai-analysis-package-v2__negative-missing-diff.json',schema:'FAIL',jsonPointer:'/records/1/sourceTrace/diff',error:'required'}
  ],
  invariants:['Hash is not a link key','Source Trace is deep-equal across positive fixtures','Review modifies only manualReview','REVIEW_PARTIAL may contain null manualReview records','Lower review rank never overwrites higher review rank']
});
