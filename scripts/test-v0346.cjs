const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { root, load, seedRaw } = require('./v0343-test-helpers.cjs');
const baseline = process.argv.includes('--baseline');
const work = path.join(root, 'test-artifacts/v0.3.46', (baseline ? 'baseline-' : 'services-') + Date.now());
fs.mkdirSync(work, { recursive: true });
const query = load('electron/aiResultsQueryV043.ts', work);
const policy = load('src/utils/activityEventDisplayPolicy.ts', work);
const results = [];
function test(name, action) { const start = performance.now(); try { const detail = action(); results.push({ name, status: 'PASS', durationMs: performance.now() - start, detail }); } catch (e) { results.push({ name, status: 'FAIL', durationMs: performance.now() - start, error: e.stack }); } }
const input = process.env.JAA_V046_INPUT || path.join(root,'tests/fixtures/v0.3.46');
const cases = JSON.parse(fs.readFileSync(path.join(input, '05_fixtures/v046/presentation-cases.json'))).cases;
const raw = path.join(work, 'cases.sqlite');
seedRaw(raw, cases.map(c => ({ id:c.id, issue:'SYN-1', actor:'Synthetic User', eventTime:'2026-09-01T12:00:00Z', fieldName:c.field, fieldId:c.field.toLowerCase(), eventType:c.eventType, before:c.before, after:c.after })), work);
// seedRaw's legacy null fallback is not appropriate for the explicit missing-body oracle.
const db = new DatabaseSync(raw);
for (const c of cases) db.prepare('UPDATE activity_events SET to_value_json=? WHERE id=?').run(JSON.stringify(c.after), c.id);
db.close();
test('R46-01 Comment source body excludes wrapper; no JSON diff metrics', () => {
  const page = query.queryResultsV043('integrated', null, raw, { pageSize:20, visibleFields:[] });
  for (const c of cases.filter(c => c.field === 'Comment')) {
    const row = page.rows.find(r => r.id === c.id);
    if (c.expected.text !== undefined) assert.equal(policy.activityEventDisplayPolicy(row).content, c.expected.text, c.id);
    assert.equal(row.addedLineCount, null, c.id);
    assert.equal(row.removedLineCount, null, c.id);
  }
  return { cases:5, production:'queryResultsV043 + activityEventDisplayPolicy' };
});
test('R46-02 Description-only quick filters retain other events and unknown metrics', () => {
  // Compact-only D06 is tested through the AI SourceTrace path separately.
  const combinations = JSON.parse(fs.readFileSync(path.join(input, '05_fixtures/v046/quick-filter-cases.json'))).combinations;
  for (const c of combinations) {
    const flags = { hideNoChange:c.flags.hideNoChange, hideZeroAdded:c.flags.hideAddedZero, hideZeroDeleted:c.flags.hideRemovedZero, hideBeforeUnavailable:c.flags.hideBeforeUnavailable };
    const page = query.queryResultsV043('integrated', null, raw, { pageSize:20, visibleFields:[], diffQuickFilters:flags });
    assert.deepEqual(page.rows.map(r=>r.id).filter(id=>id!=='D06').sort(), c.expectedIds.filter(id=>id!=='D06').sort(), JSON.stringify(flags));
  }
  return { combinations:16 };
});
test('R46-03 paired production query/facet profile', () => {
  const file = path.join(work,'profile.sqlite');
  const rows = Array.from({length:39281},(_,i)=>({id:'perf-'+i,issue:'SYN-'+i,actor:i<40?'Target User':'Other User',eventTime:new Date(1788220800000+i*1000).toISOString(),fieldName:i<20?'Comment':'Description',fieldId:i<20?'comment':'description',eventType:i<20?'comment_updated':'field_changed',before:i<20?null:'old',after:i<20?{body:'content\n'+'x'.repeat(65536),commentId:'comment-'+i}:i<40?'new\n'+'y'.repeat(65536):'new'}));
  seedRaw(file,rows,work);
  query.invalidateAiResultsV043();
  const stages=[]; // End-to-end function timings include snapshot/index work, not exclusive SQL CPU.
  const at=performance.now(), first=query.queryResultsV043('integrated',null,file,{pageSize:20,visibleFields:[]});
  stages.push({name:'cold-query',ms:performance.now()-at});
  for (const field of ['displayName','fieldName']) { const start=performance.now(); const facet=query.distinctResultsV043('integrated',null,file,field,{});stages.push({name:'facet-'+field,ms:performance.now()-start,values:facet.values.length}); }
  const start=performance.now();query.distinctResultsV043('integrated',null,file,'displayName',{});stages.push({name:'warm-facet',ms:performance.now()-start});
  assert.equal(first.totalCount,39281);
  const quickAt=performance.now();const filtered=query.queryResultsV043('integrated',null,file,{pageSize:20,visibleFields:[],filters:{displayName:{text:'Target User',operator:'exact'}},diffQuickFilters:{hideZeroAdded:true,hideZeroDeleted:true,hideBeforeUnavailable:true,hideNoChange:true}});assert.equal(filtered.filteredCount,40);stages.push({name:'large-numeric-quick-filter',ms:performance.now()-quickAt,queryPlan:query.latestQueryDiagnosticsV043().integrated.queryPlan});
  const beforeEviction=query.latestQueryDiagnosticsV043();query.releaseOversizeResultCacheV045();assert.equal(query.latestQueryDiagnosticsV043().cacheEntries,0);const rebuilt=query.queryResultsV043('integrated',null,file,{pageSize:20,visibleFields:[]});assert.equal(rebuilt.generation,first.generation);assert.equal(rebuilt.totalCount,39281);
  return {eviction:{beforeBytes:beforeEviction.cacheBytes,budget:beforeEviction.cacheBudgetBytes,rebuildSameRevision:true},stages,rows:39281,longRows:40,longContentBytes:65536,cache:query.latestQueryDiagnosticsV043(),memory:process.memoryUsage(),cold:'logical cache miss; OS cache unknown',runtime:process.versions};
});
query.invalidateAiResultsV043();
const report={baseline,startedAt:new Date().toISOString(),results};
fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({work,results},null,2));
if (!baseline && results.some(r=>r.status==='FAIL')) process.exitCode=1;
