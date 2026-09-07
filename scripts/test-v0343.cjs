const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const work = path.join(root, 'test-artifacts', 'v0.3.43', `services-${Date.now()}`);
fs.mkdirSync(work, { recursive: true });
function load(file) {
  const dest = path.join(work, `${path.basename(file, '.ts')}.cjs`);
  esbuild.buildSync({ entryPoints: [path.join(root, file)], outfile: dest, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  return require(dest);
}
const store = load('electron/aiAnalysisDatabaseV042.ts');
const queries = load('electron/aiResultsQueryV043.ts');
const fields = load('electron/aiFieldRegistryV043.ts');
const projection = load('shared/aiResultProjectionV043.ts');
const fixtures = path.join(root, 'tests/fixtures/v0.3.43');
const contracts = path.join(root, 'contracts/ai-analysis');
const options = { packageSchemaPath: path.join(contracts, 'jaa-ai-analysis-package_v2.0.0.schema.json'), sourceTraceSchemaPath: path.join(contracts, 'jaa-source-trace_v1.0.0.schema.json') };
let passed = 0;
const results = [];
function test(name, run) {
  const start = Date.now();
  try { run(); passed++; results.push({ name, status: 'PASS', durationMs: Date.now()-start }); console.log(`PASS ${name}`); }
  catch (e) { results.push({ name, status: 'FAIL', durationMs: Date.now()-start, error: e.message }); throw e; }
}
function importFile(db, file, extra = {}) { return store.importAiAnalysisPackageV042({ ...options, databasePath: db, packagePath: file, ...extra }); }
function fixture(name) { return path.join(fixtures, 'v201', name); }
function write(name, value) { const file = path.join(work, name); fs.writeFileSync(file, JSON.stringify(value)); return file; }
const ai = path.join(work, 'ai.sqlite');
const pkg = JSON.parse(fs.readFileSync(fixture('package-ai-only-55.json')));
try {
  test('2.0.1 schema, semantic preflight and exact 55/130 import', () => {
    store.initializeAiDatabaseV042({ databasePath: ai });
    const validated = store.validateAiAnalysisPackageV042({ ...options, filePath: fixture('package-ai-only-55.json') });
    assert.equal(validated.preview.ok, true, JSON.stringify(validated.preview.errors));
    const receipt = importFile(ai, fixture('package-ai-only-55.json')); assert.equal(receipt.insertedCount, 55); assert.equal(receipt.readBack.findings, 130);
    const db = new DatabaseSync(ai, { readOnly: true });
    try { for (const r of db.prepare('SELECT r.record_index,t.source_trace_json,a.analysis_json FROM ai_records r JOIN ai_record_source_traces t ON t.ai_record_id=r.ai_record_id JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id').all()) { assert.deepEqual(JSON.parse(r.source_trace_json), pkg.records[r.record_index].sourceTrace); assert.deepEqual(JSON.parse(r.analysis_json), pkg.records[r.record_index].aiAnalysis); } } finally { db.close(); }
    const meta = store.inspectAiDatabaseV042(ai); assert.ok(meta.createdAtUtc); assert.ok(meta.lastImportAtUtc); assert.equal(meta.completedReviewCount, 0);
  });
  test('AI projection keeps findings, hunks and unknown before; no manual auto acceptance', () => {
    const result = queries.queryResultsV043('ai', ai, null, { pageSize: 100 }); assert.equal(result.totalCount, 55);
    for (const r of result.rows) { const original = pkg.records.find(x => x.sourceTrace.reference.activityEventId === r.activityEventId); assert.deepEqual(r.skillFindings, original.aiAnalysis.skillFindings); assert.deepEqual(r.sourceTrace, original.sourceTrace); assert.equal(r.before, null); assert.equal(r.eventType, ''); assert.deepEqual(r.manual.confirmed, []); }
  });
  test('Full facets self exclude, cross intersect and preserve selected zero counts', () => {
    const result = queries.distinctResultsV043('ai', ai, null, 'analysisStatus', { filters: { analysisStatus: { values: ['EXCLUDED'] } } });
    assert.ok(result.values.some(x => x.label === 'CLASSIFIED' && x.count === 40));
    assert.ok(result.values.some(x => x.label === 'EXCLUDED' && x.count === 15));
    const none = queries.distinctResultsV043('ai', ai, null, 'analysisStatus', { filters: { analysisStatus: { values: ['CLASSIFIED'] }, issueKey: { text: 'ABSENT' } } });
    assert.equal(none.values.find(x => x.value === 'CLASSIFIED').count, 0);
    const skills = queries.distinctResultsV043('ai', ai, null, 'skillId'); assert.ok(skills.values.length > 4);
    const selected = skills.values[0]; assert.equal(queries.queryResultsV043('ai', ai, null, { filters: { skillId: { values: [selected.value] } } }).filteredCount, selected.count);
  });
  test('Literal SQL metacharacters, invalid fields and numeric/date ranges', () => {
    assert.equal(queries.queryResultsV043('ai', ai, null, { filters: { issueKey: { text: '%' } } }).filteredCount, 0);
    assert.throws(() => queries.queryResultsV043('ai', ai, null, { filters: { 'x); DROP TABLE ai_records;--': { text: 'x' } } }), /FIELD_UNAVAILABLE/);
    assert.throws(() => queries.queryResultsV043('ai', ai, null, { filters: { confidence: { min: 1, max: 0 } } }), /RANGE_INVALID/);
    assert.equal(queries.dayBoundaryV043('2026-03-08', 'America/New_York', true)-queries.dayBoundaryV043('2026-03-08', 'America/New_York'), 23*3600000);
    assert.equal(queries.dayBoundaryV043('2026-11-01', 'America/New_York', true)-queries.dayBoundaryV043('2026-11-01', 'America/New_York'), 25*3600000);
  });
  test('Lossless key identity and resolver including empty key and arrays', () => {
    const doc = { ai: { 'a.b': 1, a: { b: 2 }, 'a/b': 3, 'a~b': 4, '': 5, items: [{ k: 0 }, { k: false }, { k: null }], '*': 'literal' } };
    const registry = new Map(); fields.registerDocumentV043(registry, doc);
    assert.notEqual(fields.fieldIdV043('ai', ['a.b']), fields.fieldIdV043('ai', ['a','b']));
    assert.deepEqual(fields.resolveFieldV043(doc, registry.get(fields.fieldIdV043('ai', ['items',null,'k']))), [0,false,null]);
    assert.equal(new Set([...registry.keys()]).size, registry.size);
  });
  test('Review partial/completed ranks, idempotency and lower-rank protection', () => {
    assert.equal(importFile(ai, fixture('package-ai-only-55.json')).idempotent, true);
    importFile(ai, fixture('package-review-partial-55.json'));
    importFile(ai, fixture('package-review-completed-55.json'));
    const lower = structuredClone(pkg); lower.packageId += '-low'; const receipt = importFile(ai, write('lower.json', lower)); assert.equal(receipt.protectedSkipCount, 55);
    assert.equal(store.inspectAiDatabaseV042(ai).completedReviewCount, 55);
    const same = JSON.parse(fs.readFileSync(fixture('package-review-completed-55.json'))); same.packageId += '-conflict'; same.records[0].manualReview.notes = 'Conflicting update';
    assert.ok(importFile(ai, write('same-rank.json', same)).protectedSkipCount > 0);
  });
  test('Invalid skill, binding, evidence and review fail before DB write; transaction rollback', () => {
    for (const mutate of [p => p.records[0].aiAnalysis.skillFindings[0].skillId = 'FAKE_999', p => p.rulesBinding.manifest.sha256 = '0'.repeat(64), p => p.records[0].aiAnalysis.skillFindings[0].evidence[0].quote = 'NOT IN SOURCE']) {
      const p = structuredClone(pkg); mutate(p); assert.equal(store.validateAiAnalysisPackageV042({ ...options, filePath: write('invalid.json', p) }).preview.ok, false);
    }
    const db = path.join(work, 'rollback.sqlite'); store.initializeAiDatabaseV042({ databasePath: db });
    assert.throws(() => importFile(db, fixture('package-ai-only-55.json'), { failureInjection: 'AFTER_RECORDS' })); assert.equal(store.inspectAiDatabaseV042(db).recordCount, 0);
  });
  test('All 279 catalog IDs import and read back', () => {
    const db = path.join(work, 'catalog.sqlite'); store.initializeAiDatabaseV042({ databasePath: db }); importFile(db, fixture('package-catalog-279.json'));
    assert.equal(store.inspectAiDatabaseV042(db).findingCount, 279);
  });
  test('Complete snapshot export exceeds current page', () => {
    const result = queries.exportResultsV043('ai', ai, null, { page: 2, pageSize: 25 }); assert.equal(result.rows.length, 55); assert.equal(result.completePackage, false);
  });
} finally {
  queries.invalidateAiResultsV043();
  fs.writeFileSync(path.join(work, 'results.json'), JSON.stringify({ passed, results }, null, 2));
  console.log(`Evidence: ${work}`);
}
