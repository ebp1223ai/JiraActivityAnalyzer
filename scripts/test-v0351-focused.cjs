const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, load } = require('./v0343-test-helpers.cjs');
const work = path.join(root, 'test-artifacts/v0.3.51', 'focused-' + Date.now());
fs.mkdirSync(work, { recursive: true });
const users = load('shared/multiUserCollectionV051.ts', work);
const { MultiUserQueueV051: Queue } = load('electron/multiUserQueueV051.ts', work);
const columns = load('shared/aiResultsColumnsV051.ts', work);
const { buildUserActivityTimeline: build } = load('electron/userActivityTimeline.ts', work);
const { combineUserTimelinesV051: combine } = load('electron/multiUserTimelineV051.ts', work);
const { createActivityTimelineRunContext: context } = load('electron/activityTimelineRunContext.ts', work);
const workflow = load('electron/userAnalysisWorkflow.ts', work);
const eligibility = load('electron/fullFetchEligibility.ts', work);
const results = [];
async function test(name, fn) {
  const startedAt = new Date().toISOString(), start = performance.now();
  try { await fn(); results.push({ name, status: 'PASS', startedAt, elapsedMs: performance.now() - start }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'FAIL', startedAt, elapsedMs: performance.now() - start, error: error.stack }); throw error; }
}
async function main() {
  await test('normalization uses account identity not display name; paste separators and ordered username dedupe', () => {
    assert.deepEqual(users.parseCollectionUsersV051(' Alpha;beta\nALPHA, beta ').map(u => u.queryUser), ['alpha', 'beta']);
    assert.equal(users.normalizeCollectionUsersV051([{ accountId: 'A', displayName: 'Same' }, { accountId: 'B', displayName: 'Same' }, { accountId: 'A', displayName: 'Renamed' }]).length, 2);
  });
  await test('sequential queue retains success; same-session retry only failed user', async () => {
    const q = new Queue('run', 'binding', users.parseCollectionUsersV051('a,b,c'));
    let active = 0, maximum = 0; const calls = [];
    await q.run(async user => {
      calls.push(user.queryUser); maximum = Math.max(maximum, ++active);
      await new Promise(r => setTimeout(r, 2)); active--;
      if (user.queryUser === 'b') throw Error('Synthetic failed request');
      return { value: user.id, eventCount: 3, accepted: true };
    }, () => {});
    assert.equal(maximum, 1); assert.equal(q.snapshot.status, 'PARTIAL'); assert.equal(q.results.size, 2);
    await q.run(async user => { calls.push(user.queryUser); return { value: user.id, eventCount: 2, accepted: true }; }, () => {}, true);
    assert.deepEqual(calls, ['a', 'b', 'c', 'b']); assert.equal(q.snapshot.status, 'SUCCESS');
  });
  await test('cancel current continues queue; cancel all skips pending and retains success', async () => {
    for (const scope of ['current', 'all']) {
      const q = new Queue(scope, 'binding', users.parseCollectionUsersV051('a,b,c'));
      await q.run(async user => {
        if (user.queryUser === 'b') q.cancel(scope);
        return { value: user.id, eventCount: 1, accepted: true };
      }, () => {});
      assert.equal(q.snapshot.users[0].status, 'SUCCESS');
      assert.equal(q.snapshot.users[1].status, 'CANCELLED');
      assert.equal(q.snapshot.users[2].status, scope === 'all' ? 'SKIPPED' : 'SUCCESS');
      assert.equal(q.results.has('username:a'), true);
    }
  });
  await test('overlapping queue rejected; incomplete user does not become success', async () => {
    const q = new Queue('run', 'binding', users.parseCollectionUsersV051('a'));
    let resolve;
    const running = q.run(() => new Promise(r => resolve = r), () => {});
    await assert.rejects(q.run(async () => ({}), () => {}), /ALREADY_RUNNING/);
    resolve({ value: {}, eventCount: 0, accepted: false }); await running;
    assert.equal(q.snapshot.status, 'FAILED'); assert.equal(q.results.size, 0);
  });
  await test('stable pipeline identity merges duplicate discoveries without changing actor or canonical eventId', () => {
    const ctx = context({ sessionId: 'session', runId: 'run', selectedUser: 'a', selectedStartDate: '2026-01-01', selectedEndDate: '2026-01-02' });
    const fingerprint = 'a'.repeat(64);
    const buildFor = user => build({ timelineRunId: user, builtAt: '2026-01-03T00:00:00Z', selectedUser: user, dateRange: { start: '2026-01-01', end: '2026-01-02' }, projectScope: '', sourceRunId: user, sourceParsedActivityCount: 1, sourceIssueKeys: ['TEST-1'], activityStreamQueryUser: user,
      entries: [{ issueKey: 'test-1', activityTime: '2026-01-01T12:00:00Z', activityType: 'issue_updated', activityAuthor: 'Actual Actor', activityAuthorEmail: 'actor@example.invalid', activityApplication: 'Jira', entryFingerprint: fingerprint }],
      baseline: { classification: 'stability_probe_merged', retryTriggered: false, retryRecovered: false, baselineBestParsedActivityCount: 1, currentParsedActivityCount: 1, knownEntryFingerprints: ['sha256:' + fingerprint] } });
    const a = buildFor('a'), b = buildFor('b');
    assert.notEqual(a.events[0].eventId, b.events[0].eventId);
    const combined = combine(ctx, [a, b].map((timeline, i) => ({ userId: ['a', 'b'][i], timeline, stableIds: new Map([[fingerprint, 'existing-round-stable-id']]) })));
    assert.equal(combined.events.length, 1); assert.equal(combined.events[0].eventId, a.events[0].eventId);
    assert.equal(combined.events[0].userKey, 'actor@example.invalid'); assert.equal(combined.duplicateDiscoveryCount, 1);
    assert.deepEqual(combined.discoveredBy[a.events[0].eventId], ['a', 'b']);
    assert.equal(combined.summary.eventCountReconciliation.status, 'reconciled');
    assert.equal(combined.summary.integrity.sourceParsedActivityCount, 2);
    assert.equal(workflow.buildTimelineIssueGroups(combined.events)[0].eventCount, 1);
    assert.equal(eligibility.createFullFetchAttempt({ selectedTimelineRunId: 'run', queueTimelineRunId: 'run', selectedIssueKeys: ['test-1', ' TEST-1 ', 'NEXT-2'], eligibility: { eligible: true, status: 'ELIGIBLE' } }).selectedIssueKeys.length, 2);
  });
  await test('AI fresh Action OFF, only Issue Key required; Integrated unchanged', () => {
    assert.deepEqual(columns.viewerDefaultColumnsV051('ai'), ['eventTime', 'issueKey', 'analysisStatus', 'skillIds', 'manual']);
    assert.deepEqual(columns.viewerRequiredColumnsV051('ai'), ['issueKey']);
    assert.deepEqual(columns.viewerDefaultColumnsV051('integrated'), ['eventTime', 'action', 'issueKey', 'analysisStatus', 'skillIds', 'manual']);
    assert.equal(columns.viewerRequiredColumnsV051('integrated'), undefined);
    const page = fs.readFileSync(path.join(root, 'src/routes/AiDatabaseViewerPagesV043.tsx'), 'utf8');
    assert.match(page, /saved\.preferences \?\?/);
    assert.match(page, /saved\.preferences\?\.visibleColumns \?\? viewerDefaultColumnsV051/);
    assert.match(page, /requiredColumnIds=\{viewerRequiredColumnsV051\(kind\)\}/);
  });
  await test('legacy scope preference visibility/order/width survive normalization; invalid scope rejected', () => {
    const { normalizeAiViewerScopesV043: normalize } = load('shared/aiViewerPreferencesV043.ts', work);
    const preference = { visibleColumns: ['action', 'issueKey'], columnOrder: ['issueKey', 'action', 'eventTime'], columnWidths: { action: 220, issueKey: 180 } };
    const value = { query: { page: 1, pageSize: 50, sort: { field: 'eventTime', direction: 'desc' }, filters: {} }, preferences: preference };
    const result = normalize({ 'v043|ai|raw|ai|old|2': value, 'v045|ai|raw|ai|2': value, 'invalid': value });
    assert.equal(Object.keys(result).length, 2);
    for (const entry of Object.values(result)) {
      for (const field of ['visibleColumns', 'columnOrder', 'columnWidths']) assert.deepEqual(entry.preferences[field], preference[field]);
    }
  });
  await test('Step2 case/whitespace key union counts and existing cross-project queue metadata', () => {
    const event = { eventTime: '2026-01-01T12:00:00Z', eventType: 'issue_updated', sourceConfidence: 'high', allIssueKeys: [] };
    const groups = workflow.buildTimelineIssueGroups([{ ...event, eventId: 'a', issueKey: ' test-1 ' }, { ...event, eventId: 'b', issueKey: 'TEST-1' }, { ...event, eventId: 'c', issueKey: 'NEXT-2' }]);
    assert.equal(groups.length, 2); assert.equal(groups.find(g => g.issueKey === 'TEST-1').eventCount, 2);
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify({ work, results }, null, 2)); console.log('Evidence ' + work);
});
