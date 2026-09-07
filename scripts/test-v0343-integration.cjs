const { root, load, seedRaw } = require('./v0343-test-helpers.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const work = path.join(root, 'test-artifacts/v0.3.43', `integration-${Date.now()}`);
const store = load('electron/aiAnalysisDatabaseV042.ts', work), query = load('electron/aiResultsQueryV043.ts', work), field = load('electron/aiFieldRegistryV043.ts', work), project = load('shared/aiResultProjectionV043.ts', work), prefs = load('shared/aiViewerPreferencesV043.ts', work);
const fixtures = path.join(root, 'tests/fixtures/v0.3.43');
const options = { packageSchemaPath: path.join(root, 'contracts/ai-analysis/jaa-ai-analysis-package_v2.0.0.schema.json'), sourceTraceSchemaPath: path.join(root, 'contracts/ai-analysis/jaa-source-trace_v1.0.0.schema.json') };
const read = file => JSON.parse(fs.readFileSync(file));
const pkgPath = path.join(fixtures, 'v201/package-ai-only-55.json'), pkg = read(pkgPath);
const results = [];
function test(name, fn) { const start=Date.now(); try { fn(); results.push({ name, status:'PASS', durationMs:Date.now()-start }); console.log(`PASS ${name}`); } catch(e) { results.push({ name, status:'FAIL', durationMs:Date.now()-start, error:e.message }); throw e; } }
const ai=path.join(work,'ai.sqlite'), raw=path.join(work,'raw.sqlite');
try {
  test('Legacy 2.0.0 three ranks exact 44/113 on current importer', () => {
    const db=path.join(work,'legacy.sqlite'); store.initializeAiDatabaseV042({databasePath:db});
    for(const rank of ['ai-only','review-partial','review-completed']) {
      const file=path.join(fixtures,'legacy_v200',`jaa-ai-analysis-package-v2__${rank}__golden-44.json`);
      const r=store.importAiAnalysisPackageV042({...options,databasePath:db,packagePath:file}); assert.equal(r.readBack.traces,44); assert.equal(r.readBack.findings,113);
    }
    assert.equal(store.inspectAiDatabaseV042(db).completedReviewCount,44);
  });
  test('Production Raw schema; I01/I02 raw only and unlinked AI never suppress rows', () => {
    seedRaw(raw,pkg.records,work);
    assert.equal(query.queryResultsV043('integrated',null,raw).totalCount,55);
    store.initializeAiDatabaseV042({databasePath:ai}); store.importAiAnalysisPackageV042({...options,databasePath:ai,packagePath:pkgPath});
    const result=query.queryResultsV043('integrated',ai,raw); assert.equal(result.totalCount,55);assert.equal(result.matchedCount,0);assert.equal(result.integrationState,'RELINK_REQUIRED');
  });
  test('I03/I04/I06 unique links preserve one row, all fields exact across both pages', () => {
    const db=new DatabaseSync(ai);const records=db.prepare('SELECT ai_record_id,record_index FROM ai_records ORDER BY record_index').all();db.close();
    for(const [i,item] of records.entries()) {
      const record=pkg.records[item.record_index],ref=record.sourceTrace.reference;
      store.recordSourceLinkAttemptV042({databasePath:ai,aiRecordId:item.ai_record_id,rawDatabaseIdentity:ref.sourceDatabaseId,record,candidates:[{activityEventId:ref.activityEventId}]});
      if(i===9) { const r=query.queryResultsV043('integrated',ai,raw);assert.equal(r.matchedCount,10);assert.equal(r.totalCount,55); }
    }
    const a=query.queryResultsV043('ai',ai,raw,{pageSize:100}), b=query.queryResultsV043('integrated',ai,raw,{pageSize:100});
    assert.equal(b.rows.length,55);assert.equal(b.matchedCount,55);
    for(const row of a.rows) {const other=b.rows.find(r=>r.aiRecordId===row.aiRecordId);assert.ok(other); for(const key of ['analysisId','analysisStatus','confidence','skillFindings','manualReview','manual','reviewRank','rationale','sourceTrace']) assert.deepEqual(other[key],row[key],key);}
    const facet=query.distinctResultsV043('integrated',ai,raw,'analysisStatus');assert.equal(facet.values.find(x=>x.label==='CLASSIFIED').count,40);
  });
  test('Fallback matched ID, ambiguous candidate, SQL ERROR attempts remain append-only', () => {
    const record=pkg.records[0],ref=record.sourceTrace.reference; const db=new DatabaseSync(ai); const id=db.prepare('SELECT ai_record_id FROM ai_records WHERE activity_event_id=?').get(ref.activityEventId).ai_record_id; db.close();
    const candidate={activityEventId:'fallback-event',sourceRecordStableId:ref.sourceRecordStableId,fieldName:ref.fieldName,eventTime:ref.eventTime};
    assert.equal(store.decideSourceLinkV042(record,ref.sourceDatabaseId,[candidate]).status,'FALLBACK_MATCHED');
    assert.equal(store.decideSourceLinkV042(record,ref.sourceDatabaseId,[candidate,{...candidate,activityEventId:'duplicate'}]).status,'AMBIGUOUS');
    const rawDb=new DatabaseSync(raw);rawDb.prepare('UPDATE activity_events SET id=? WHERE id=?').run('fallback-event',ref.activityEventId);rawDb.close();
    store.recordSourceLinkAttemptV042({databasePath:ai,aiRecordId:id,rawDatabaseIdentity:ref.sourceDatabaseId,record,candidates:[candidate]});
    assert.equal(query.queryResultsV043('integrated',ai,raw,{pageSize:100}).rows.find(r=>r.id==='fallback-event').aiRecordId,id);
    store.recordSourceLinkAttemptV042({databasePath:ai,aiRecordId:id,rawDatabaseIdentity:ref.sourceDatabaseId,record,candidates:[],failureReason:'SQLITE_ERROR_SYNTHETIC'});
    const after=query.queryResultsV043('integrated',ai,raw,{pageSize:100});assert.equal(after.totalCount,55);assert.equal(after.matchedCount,54);
    const check=new DatabaseSync(ai,{readOnly:true});assert.equal(check.prepare('SELECT COUNT(*) n FROM source_link_attempts WHERE ai_record_id=?').get(id).n,3);check.close();
  });
  test('Review projections R01-R03; provisional groups, ADJUST and null', () => {
    const cases=read(path.join(fixtures,'review-projection-cases.json'));
    for(const c of cases.cases) {const r=c.review?{completed:c.review.completed,skillReviews:Object.entries(c.review.verdicts).map(([skillId,verdict])=>({skillId,verdict,proposedConfidence:0.3})),missingSkillReviews:c.review.added.map(skillId=>({skillId}))}:null;const result=project.projectManualReviewV043(cases.aiSkills.map(skillId=>({skillId,confidence:0.6})),r);assert.deepEqual(result.confirmed.map(f=>f.skillId),c.confirmed);assert.deepEqual(result.groups.pending.map(f=>f.skillId),c.pending);}
  });
  test('Scoped preferences retain long values, null/0/false; no rows persisted', () => {
    const result=prefs.normalizeAiViewerScopesV043({'v043|A':{query:{page:2,pageSize:100,filters:{x:{values:['x'.repeat(1000)],min:0}}},rows:[{private:'forbidden'}],preferences:{columnOrder:['dynamic:x']},session:{scrollLeft:42}}});assert.equal(result['v043|A'].query.filters.x.values[0].length,1000);assert.equal(result['v043|A'].query.filters.x.min,0);assert.equal(result['v043|A'].rows,undefined);
  });
  test('10001 actual Raw events: last facet, late-only fields, full export and cache invalidation', () => {
    const generated=JSON.parse(require('node:child_process').execFileSync(process.execPath,[path.join(fixtures,'generate-large-facet-fixture.cjs')],{maxBuffer:30*1024*1024}));
    const file=path.join(work,'large.sqlite');seedRaw(file,generated.rows,work,'stress-db');
    const result=query.queryResultsV043('integrated',null,file,{pageSize:25});assert.equal(result.totalCount,10001);
    const facet=query.distinctResultsV043('integrated',null,file,'issueKey');assert.equal(facet.values.length,10001);assert.ok(facet.values.some(v=>v.label==='FIX-10000'));
    const late=result.fieldCatalog.find(f=>f.label.endsWith('extension.lateOnly'));assert.ok(late);
    const last=query.queryResultsV043('integrated',null,file,{filters:{[late.path]:{text:'last-10001'}}});assert.equal(last.filteredCount,1);assert.equal(last.rows[0].id,'stress-10000');
    const zero=query.queryResultsV043('integrated',null,file,{filters:{issueKey:{text:'absent'}}});assert.ok(zero.fieldCatalog.some(f=>f.path===late.path));
    const exported=query.exportResultsV043('integrated',null,file,{page:2,pageSize:25},['issueKey']);assert.equal(exported.rows.length,10001);
    const db=new DatabaseSync(file);db.prepare('UPDATE activity_events SET actor_display_name=? WHERE id=?').run('CHANGED','stress-10000');db.close();assert.equal(query.queryResultsV043('integrated',null,file,{filters:{issueKey:{text:'FIX-10000',operator:'exact'}}}).rows[0].displayName,'CHANGED');
  });
} finally {query.invalidateAiResultsV043();fs.writeFileSync(path.join(work,'results.json'),JSON.stringify({results},null,2));console.log(`Evidence: ${work}`);}
