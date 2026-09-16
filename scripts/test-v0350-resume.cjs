const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { root, load } = require('./v0343-test-helpers.cjs');
const { seed, importAndLink } = require('./v0348-test-seed.cjs');
const work = path.join(root, 'test-artifacts/v0.3.50', 'resume-' + Date.now());
fs.mkdirSync(work, { recursive: true });
process.env.JAA_PROJECTION_ROOT = path.join(work, 'sidecar');
const s = importAndLink(work, seed(work)), results = [];
const bundle = (name, file) => {
  const outfile = path.join(work, name + '.cjs');
  require('esbuild').buildSync({ entryPoints: [path.join(root, file)], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  return outfile;
};
const serviceBundle = path.join(work, 'service.cjs');
require('esbuild').buildSync({ stdin: { contents: "export { AiResultsServiceV044 } from './electron/aiResultsServiceV044.ts'; export { closeDatabaseRevisionsV045 } from './electron/databaseRevisionV045.ts';", resolveDir: root }, outfile: serviceBundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const { AiResultsServiceV044, closeDatabaseRevisionsV045 } = require(serviceBundle);
const { AiWriteServiceV044 } = load('electron/aiWriteServiceV044.ts', work);
const { AiAnalysisDatabaseStoreV042 } = load('electron/aiAnalysisDatabaseLifecycleV042.ts', work);
const service = new AiResultsServiceV044(bundle('query-worker', 'electron/aiResultsWorkerV044.ts'));
const writes = new AiWriteServiceV044(bundle('write-worker', 'electron/aiWriteWorkerV044.ts'));
let owner = 10;
async function query(kind = 'integrated') {
  const stages = [], id = ++owner;
  const value = await service.run(id, { requestId: 'proof-' + id, action: 'query', kind, ai: s.ai, raw: s.raw, query: { pageSize: 25, visibleFields: [] } }, stage => { stages.push(stage); return true; });
  await service.closeOwner(id);
  return { value, reused: stages.some(stage => stage.event === 'source-fingerprint-reused'), stages };
}
async function test(name, fn) {
  if (process.env.JAA_TEST_FILTER && !name.includes(process.env.JAA_TEST_FILTER)) return;
  const startedAt = new Date().toISOString(), start = performance.now();
  try { const evidence = await fn(); results.push({ name, status: 'PASS', startedAt, ms: performance.now() - start, evidence }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'FAIL', startedAt, ms: performance.now() - start, error: error.stack }); throw error; }
}
const store = new AiAnalysisDatabaseStoreV042({ appRoot: path.join(work, 'app'), defaultDatabasePath: path.join(work, 'absent.sqlite'), backupDirectory: path.join(work, 'backups') });
let createId = 0;
const initialize = temporary => writes.run(1, { requestId: 'create-' + ++createId, action: 'initialize', input: { databasePath: temporary } });
(async () => {
  try {
    await test('load reasons distinguish semantic transitions', () => {
      const { viewerLoadReasonV050: reason } = load('shared/viewerQueryIdentityV050.ts', work);
      const a = { scope: 'a', contentRevision: 'r', generation: 'g', query: { page: 1, pageSize: 25, visibleFields: [] } };
      assert.equal(reason(undefined,a,false,false),'INITIAL_MOUNT');
      assert.equal(reason(undefined,a,false,true),'PREFERENCE_RESTORE');
      assert.equal(reason(a,a,true,false),'FORCE_REFRESH');
      assert.equal(reason(a,structuredClone(a),false,false),'ROUTE_REATTACH');
      for (const [patch, expected] of [[{scope:'b'},'DB_CHANGE'],[{contentRevision:'r2'},'REVISION_CHANGE'],[{generation:'g2'},'GENERATION_CHANGE'],[{query:{...a.query,filters:{before:{text:'x'}}}},'FILTER_CHANGE'],[{query:{...a.query,sort:{field:'issueKey'}}},'SORT_CHANGE'],[{query:{...a.query,page:2}},'PAGE_CHANGE'],[{query:{...a.query,visibleFields:['before']}},'COLUMN_CHANGE']]) assert.equal(reason(a,{...a,...patch},false,false),expected);
    });
    await test('detached first completion binds generation for zero-query revisit', async () => {
      const cache = load('src/state/aiResultCacheV045.ts', work), { semanticQueryV050 } = load('shared/viewerQueryIdentityV050.ts', work);
      const intent = { scope: 'detached', contentRevision: 'r1', kind: 'ai', generation: '', query: { page: 1 } };
      let calls = 0;
      await cache.acquireAiResultV045('detached', semanticQueryV050(intent), 'first', async () => { calls++; return { ok: true, generation: 'g1' }; }).entry.promise;
      const next = cache.acquireAiResultV045('detached', semanticQueryV050({ ...intent, generation: 'g1' }), 'second', async () => { calls++; return { ok: true }; });
      assert.equal(next.reused, true); assert.equal(calls, 1);
    });
    await test('cross-worker reuse preserves canonical results', async () => {
      const first = await query(), second = await query('ai'), third = await query();
      assert.equal(first.reused, false); assert.equal(second.reused, true); assert.equal(third.reused, true);
      assert.equal(first.value.totalCount, 120); assert.equal(second.value.totalCount, 55); assert.equal(third.value.totalCount, 120);
      return { firstReuse: first.reused, aiReuse: second.reused, newWorkerReuse: third.reused };
    });
    await test('WAL commit invalidates shared proof', async () => {
      const db = new DatabaseSync(s.raw);
      try {
        db.exec("PRAGMA journal_mode=WAL; UPDATE activity_events SET actor_display_name='Synthetic WAL Change' WHERE id='raw-61'");
        const changed = await query(); assert.equal(changed.reused, false);
        return { reused: changed.reused, stale: changed.value.projectionStale };
      } finally { db.close(); }
    });
    await test('replacement file invalidates shared proof', async () => {
      await service.close();
      // Windows disallows replacing an open SQLite file; close the watcher first.
      // Its next epoch must still invalidate the service's retained digest proof.
      closeDatabaseRevisionsV045();
      const replacement = seed(path.join(work, 'replacement')).raw;
      const old = s.raw + '.previous';
      fs.renameSync(s.raw, old);
      fs.copyFileSync(replacement, s.raw, fs.constants.COPYFILE_EXCL);
      const changed = await query(); assert.equal(changed.reused, false);
      return { reused: changed.reused };
    });
    await test('stale heavy automatically rebuilds and retries current request', async () => {
      await query();
      const db = new DatabaseSync(s.raw);
      db.exec("UPDATE activity_events SET actor_display_name='Synthetic Recovery' WHERE id='raw-60'"); db.close();
      const stages = [];
      const value = await service.run(++owner, { requestId: 'heavy-recovery', action: 'query', kind: 'integrated', ai: s.ai, raw: s.raw, query: { pageSize: 25, visibleFields: ['before'], filters: { before: { text: 'Synthetic Recovery' } } } }, stage => { stages.push(stage); return true; });
      assert.equal(value.projectionStale, false); assert.equal(value.totalCount, 120);
      assert.ok(value.readPath.heavyRowsHydrated <= 25);
      assert.ok(stages.some(stage => stage.event === 'projection-build' && stage.phase === 'END'));
      return { stale: value.projectionStale, total: value.totalCount, heavyRowsHydrated: value.readPath.heavyRowsHydrated };
    });
    await test('AI initialization runs off caller event loop', async () => {
      let ticks = 0, maxLag = 0, previous = performance.now();
      const timer = setInterval(() => { const current = performance.now(); maxLag = Math.max(maxLag, current - previous - 10); previous = current; ticks++; }, 10);
      try {
        const result = await store.createAndActivateAsyncV050(path.join(work, 'created.sqlite'), initialize);
        assert.equal(result.snapshot.canQuery, true); assert.ok(ticks > 0); assert.ok(maxLag < 2000, 'Main lag ' + maxLag);
        return { ticks, maxLagMs: maxLag, canQuery: result.snapshot.canQuery };
      } finally { clearInterval(timer); }
    });
    await test('async publication never overwrites concurrent destination', async () => {
      const target = path.join(work, 'collision.sqlite'), prior = store.activePath();
      await assert.rejects(store.createAndActivateAsyncV050(target, async temp => { await initialize(temp); fs.writeFileSync(target, 'sentinel', { flag: 'wx' }); }), { code: 'EEXIST' });
      assert.equal(fs.readFileSync(target, 'utf8'), 'sentinel'); assert.equal(store.activePath(), prior);
    });
    await test('selection change supersedes async initialization', async () => {
      const target = path.join(work, 'superseded.sqlite');
      await assert.rejects(store.createAndActivateAsyncV050(target, async temp => { await initialize(temp); store.forget(store.lifecycle().databaseId); }), /SUPERSEDED/);
      assert.equal(fs.existsSync(target), false); assert.equal(store.lifecycle().lifecycleState, 'NOT_SELECTED');
    });
    await test('failed initialization does not publish partial database', async () => {
      const target = path.join(work, 'failed.sqlite');
      await assert.rejects(store.createAndActivateAsyncV050(target, async temp => { fs.writeFileSync(temp, 'partial'); throw Error('CANCELLED'); }), /CANCELLED/);
      assert.equal(fs.existsSync(target), false);
      assert.deepEqual(fs.readdirSync(work).filter(f => f.endsWith('.tmp')), []);
    });
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    await service.close(); closeDatabaseRevisionsV045(); await writes.close();
    fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify({ work, results }, null, 2));
    console.log('Evidence ' + work);
  }
})();
