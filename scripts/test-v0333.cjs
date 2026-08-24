const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path"),{api,root,artifacts}=require("./v0333-test-helpers.cjs"),m=api();
const hash=(value)=>crypto.createHash("sha256").update(value).digest("hex");
const q=(id,recordIndex,start,end,quoteHash)=>({evidenceQuoteId:id,recordIndex,sourceRecordStableId:"record-"+recordIndex,evidenceRef:"parent-"+recordIndex,containerEvidenceSegmentId:"segment-"+recordIndex,quoteOrdinal:start,sourceJsonPointer:"/records/"+recordIndex+"/description",containerStartOffset:0,containerEndOffset:100,rawStartOffset:start,rawEndOffset:end,exactSourceSubstring:"source quote "+id,displayText:"source quote "+id,evidenceRoleEligibility:["PRIMARY_CHANGE"],normalizationOperations:[],sourceContentHash:"source-"+recordIndex,quoteSha256:quoteHash,catalogVersion:"JAA-EVIDENCE-QUOTE-CATALOG-1.0.0"});
const quotes=[q("eq_"+("1".repeat(32)),0,0,8,"a".repeat(64)),q("eq_"+("2".repeat(32)),0,9,18,"b".repeat(64))];
const quoteCatalog=(entries)=>({schemaVersion:"jaa-evidence-quote-catalog-v1",catalogVersion:"JAA-EVIDENCE-QUOTE-CATALOG-1.0.0",recordCount:new Set(entries.map((item)=>item.recordIndex)).size,quoteCount:entries.length,entries,catalogSha256:"catalog"});
const skill=(id,ids,prose)=>({skillId:id,confidence:0.8,evidenceQuoteIds:ids,evidenceExplanation:prose+" evidence",negativeChecks:[prose+" negative"],rationale:prose+" rationale"});
const decision=(recordIndex,status,skills,rationale)=>({recordIndex,status,confidence:0.8,skillFindings:skills,recordNegativeChecks:[],unknownReasons:[],rationale:rationale||"record specific rationale "+recordIndex});
const catalog=[{id:"SKILL_A",name:"A",group:"G",catalogStatus:"approved",detailDescription:"detail A"},{id:"SKILL_B",name:"B",group:"G",catalogStatus:"approved",detailDescription:"detail B"}];

const independent=decision(0,"CLASSIFIED",[skill("SKILL_A",[quotes[0].evidenceQuoteId],"A specific"),skill("SKILL_B",[quotes[1].evidenceQuoteId],"B specific")]);
assert.equal(m.evaluateDecisionQualityV0333({decisions:[independent],quoteCatalog:quoteCatalog(quotes),catalog}).status,"PASSED");

const sharedWarning=decision(0,"CLASSIFIED",[skill("SKILL_A",[quotes[0].evidenceQuoteId],"memory ownership"),skill("SKILL_B",[quotes[0].evidenceQuoteId],"diagnostic observability")]);
const warning=m.evaluateDecisionQualityV0333({decisions:[sharedWarning],quoteCatalog:quoteCatalog(quotes),catalog});
assert.equal(warning.status,"WARNING");
assert.ok(warning.findings.some((item)=>item.code==="MULTI_SKILL_SHARED_PRIMARY_QUOTE_REVIEW"&&item.evidenceQuoteIds.length===1&&item.quoteIdentityKeyHashes.length===1));
assert.equal(m.sqliteQualityGateV0333(warning).eligible,false);
assert.equal(m.sqliteQualityGateV0333(warning,{accepted:true,runId:"run",findingsHash:"hash",acceptedAtUtc:new Date().toISOString(),auditId:"audit"}).eligible,true);

const sharedBlocked=decision(0,"CLASSIFIED",[skill("SKILL_A",[quotes[0].evidenceQuoteId],"same prose"),skill("SKILL_B",[quotes[0].evidenceQuoteId],"same prose")]);
assert.equal(m.evaluateDecisionQualityV0333({decisions:[sharedBlocked],quoteCatalog:quoteCatalog(quotes),catalog}).status,"BLOCKED");

const missingPrimary=decision(0,"CLASSIFIED",[skill("SKILL_A",[quotes[0].evidenceQuoteId],"A"),skill("SKILL_B",[],"B")]);
const missingReport=m.evaluateDecisionQualityV0333({decisions:[missingPrimary],quoteCatalog:quoteCatalog(quotes),catalog});
assert.ok(missingReport.blockers.includes("MULTI_SKILL_PRIMARY_CHANGE_QUOTE_MISSING"));

const catalogMismatch=decision(0,"CLASSIFIED",[skill("SKILL_A",[quotes[0].evidenceQuoteId],"A")]);
const mismatch=m.evaluateDecisionQualityV0333({decisions:[catalogMismatch],quoteCatalog:quoteCatalog(quotes),catalog:[{id:"SKILL_A",name:"A",group:"G",catalogStatus:"review-draft",detailDescription:null}]});
assert.ok(mismatch.blockers.includes("CATALOG_DETAIL_STATUS_MISMATCH"));

const duplicateQuotes=[],duplicateDecisions=[];
for(let index=0;index<4;index++){const quote=q("eq_"+String(index+3).repeat(32),index,0,8,String.fromCharCode(99+index).repeat(64));duplicateQuotes.push(quote);duplicateDecisions.push(decision(index,"CATALOG_DETAIL_MISSING",[skill("SKILL_A",[quote.evidenceQuoteId],"identical model prose")],"identical record prose"))}
const duplicate=m.evaluateDecisionQualityV0333({decisions:duplicateDecisions,quoteCatalog:quoteCatalog(duplicateQuotes),catalog});
assert.equal(duplicate.status,"WARNING");
assert.ok(duplicate.findings.some((item)=>item.code==="MODEL_PROSE_EXACT_DUPLICATE_RATIO_HIGH"&&item.actualRatio>0.5&&item.population===4));

const expected={"Skill_Analysis_Rule_Set_Manifest_v0.8.2.md":[26502,"13334c6cdd598d0499841438cdc595de7facee908aca83e9ed16b4c1cd26558c"],"Skill_Classification_Common_Rules_v1.6.2.md":[41369,"54fc40aac4e9bc07d1a34480c8f50dde4ab919c605b2d00148268192752e17b5"],"Skill_Catalog_v0.3.1.md":[24636,"dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d"],"Skill_Analysis_HTML_Report_Template_v1.5.1.md":[38057,"dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02"]};
const rulesDir=path.join(root,"rules","v0.3.33");
for(const [name,[bytes,sha]] of Object.entries(expected)){const data=fs.readFileSync(path.join(rulesDir,name));assert.equal(data.length,bytes);assert.equal(hash(data),sha)}
const rules=m.loadExplicitRulesSnapshotV0333({mode:"BUNDLED_DEFAULT",manifest:path.join(rulesDir,"Skill_Analysis_Rule_Set_Manifest_v0.8.2.md"),commonRules:path.join(rulesDir,"Skill_Classification_Common_Rules_v1.6.2.md"),catalog:path.join(rulesDir,"Skill_Catalog_v0.3.1.md"),htmlTemplate:path.join(rulesDir,"Skill_Analysis_HTML_Report_Template_v1.5.1.md")});
assert.equal(rules.promptVersion,"JAA-CHATGPT-ZH-TW-0.3.33");assert.equal(rules.qualityContractVersion,"jaa-ai-analysis-quality-v4");assert.equal(rules.multiSkillCoverageVersion,"jaa-multi-skill-evidence-coverage-v2");
assert.match(m.DEFAULT_ANALYSIS_INSTRUCTION,/不得為規避 Multi-skill Quality Gate/);assert.match(m.DEFAULT_ANALYSIS_INSTRUCTION,/jaa_publish_analysis_artifacts_v5/);

const templatePath=path.join(rulesDir,"Skill_Analysis_HTML_Report_Template_v1.5.1.md");
const capabilities=["REPORT_DATA_PACKAGE_V1","UNIQUE_ISSUE_SNAPSHOT_V1","SNAPSHOT_FIELD_STATE_V1","DECLARATIVE_STATISTICS_DSL_V1","MULTI_TEMPLATE_OFFLINE_RENDER_V1","AI_SUBMITTED_ARTIFACT_DIAGNOSTIC_V1","ARTIFACT_IDENTITY_RECEIPT_V1","EVIDENCE_QUOTE_CATALOG_V1","LAYERED_VALIDATION_RECEIPTS_V2"];
assert.doesNotThrow(()=>m.preflightHtmlRendererV0333(templatePath,capabilities));
assert.throws(()=>m.preflightHtmlRendererV0333(templatePath,capabilities.map((item)=>item==="LAYERED_VALIDATION_RECEIPTS_V2"?"LAYERED_VALIDATION_RECEIPTS_V1":item)),/V2 capability mismatch/);
const stable=(value)=>Array.isArray(value)?value.map(stable):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])])):value;
const packageBase={schemaVersion:"jaa-analysis-report-data-package-v1",packageId:"",packageMode:"FORMAL_CANONICAL",runId:"run-v0333",generatedAt:new Date().toISOString(),sourceAnalysisIdentity:{},sourceCanonicalIdentity:{contractVersion:"jaa-canonical-analysis-result-v5",sha256:"canonical"},ruleSet:{},decisionContract:"jaa-ai-analysis-decisions-v5",canonicalContract:"jaa-canonical-analysis-result-v5",qualityContract:"jaa-ai-analysis-quality-v4",eventScope:{},baseCounts:{activityEventCount:0,uniqueIssueCount:0,skillFindingCount:0,validationFindingCount:0},dataCompleteness:{},records:[],issueSnapshots:[],snapshotFieldDefinitions:[],validationFindings:[],qualitySummary:{contractVersion:"jaa-ai-analysis-quality-v4",multiSkillCoverageVersion:"jaa-multi-skill-evidence-coverage-v2",status:"PASSED",warnings:[],blockers:[],metrics:{},findings:[],sqliteGate:"ELIGIBLE"},capabilities,inputReceipts:[]};
const packageSha256=hash(JSON.stringify(stable(packageBase))),reportPackage={...packageBase,packageId:"report_package_"+packageSha256.slice(0,24),packageSha256};
const htmlFolder=path.join(artifacts,"html");fs.rmSync(htmlFolder,{recursive:true,force:true});fs.mkdirSync(htmlFolder,{recursive:true});const packagePath=path.join(htmlFolder,"report-data-package.json");fs.writeFileSync(packagePath,JSON.stringify(reportPackage,null,2));
const rendered=m.renderReportDataPackageHtmlV0333({reportDataPackagePath:packagePath,templatePath,outputDirectory:htmlFolder,renderTrigger:"AUTO_AFTER_CANONICAL"});
assert.equal(path.basename(rendered.receipt.outputHtmlPath),"analysis-result.html");assert.ok(fs.existsSync(rendered.receipt.outputHtmlPath));assert.ok(fs.existsSync(path.join(htmlFolder,"html-render-receipt.json")));assert.equal(rendered.receipt.requiredCapabilities.includes("LAYERED_VALIDATION_RECEIPTS_V2"),true);

const lifecycle={schemaVersion:"jaa-analysis-lifecycle-v1",runId:"run",providerTurnStatus:"completed",inputStatus:"ready",analysisStatus:"completed",artifactStatus:"accepted",validationStatus:"completed",canonicalAssemblyStatus:"completed",htmlRenderStatus:"completed",sqliteStatus:"committed",overallStatus:"completed",lastSuccessfulStage:"RUN_COMPLETED",firstFailedStage:"ANALYSIS_STARTED",rootErrorCode:null,rootErrorStage:"ANALYSIS_STARTED",rootErrorMessage:"Illegal lifecycle transition to ANALYSIS_STARTED.",derivedStatusCodes:[],canonicalStatus:"created",analysisStarted:true,analysisCompleted:true,completedCount:1,decisionPreparedCount:1,updatedAtLocal:new Date().toISOString()};
const terminal=m.convergeTerminalLifecycleV0333(lifecycle,{terminalState:"completed",rootErrorCode:null,artifactReceived:true,artifactAccepted:true,validationStarted:true,validationPassed:true,firstFailedValidationStage:null,canonicalCreated:true,analyzedResultCreated:true,activeResultChanged:true,formalReportPackageCreated:true,formalHtmlCreated:true,diagnosticReportPackageCreated:false,diagnosticHtmlCreated:false,sqliteStatus:"committed"});
assert.equal(terminal.firstFailedStage,null);assert.equal(terminal.firstFailedValidationStage,null);assert.equal(terminal.rootErrorCode,null);assert.equal(terminal.rootErrorMessage,null);

const identities={applicationVersion:"0.3.33",promptIdentity:"JAA-CHATGPT-ZH-TW-0.3.33",promptTemplateVersion:"0.3.33-zh-TW-v14",decisionContract:"jaa-ai-analysis-decisions-v5",qualityContract:"jaa-ai-analysis-quality-v4",bridgeIdentity:"0.3.31-bridge-v13",providerTransport:"bridge-resumable-v4",outputSchemaSha256:"schema",expectedOutputSchemaSha256:"schema",rulesSnapshotId:"rules",requestRulesSnapshotId:"rules"};
assert.equal(m.validateDispatchIdentityV0333(identities).status,"PASSED");assert.throws(()=>m.validateDispatchIdentityV0333({...identities,applicationVersion:"0.3.31"}),/AI_RUNTIME_CONTRACT_REGISTRY_MISMATCH/);

const receiptFolder=path.join(artifacts,"receipts");fs.rmSync(receiptFolder,{recursive:true,force:true});m.writeValidationStageReceiptsV0333({runDirectory:receiptFolder,inputHash:"input",failedStage:null,rootErrorCode:null,findings:warning.findings,warningStages:["QUALITY_GATE"],blockedPendingAcceptanceStages:["SQLITE"],stageReasons:{QUALITY_GATE:"warning",SQLITE:"pending acceptance"}});
const receipts=fs.readdirSync(path.join(receiptFolder,"validation-stage-receipts")).map((name)=>JSON.parse(fs.readFileSync(path.join(receiptFolder,"validation-stage-receipts",name),"utf8")));
assert.equal(receipts.length,14);assert.equal(receipts.find((item)=>item.stage==="QUALITY_GATE").outcome,"WARNING");assert.equal(receipts.find((item)=>item.stage==="SQLITE").outcome,"BLOCKED_PENDING_WARNING_ACCEPTANCE");
console.log("v0.3.33 tests passed");
