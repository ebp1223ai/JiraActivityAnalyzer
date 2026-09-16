import "./syntheticIoAuditV044.js";
import { configureBusinessIoV044 } from './businessIoDiagnosticsV044.js';
import { parentPort, threadId } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { createEnvelopeProducerV044, type DiagnosticContextV044 } from './diagnosticEnvelopeV044.js';
import { queryResultsV043, distinctResultsV043, exportResultsV043, writeQueryExportV044, latestQueryDiagnosticsV043, releaseOversizeResultCacheV045 } from './aiResultsQueryV043.js';
import { setQueryObserverV044, measureQueryStageV050 } from './aiResultsIndexV044.js';
import { configureReadProjectionV049, configureSourceProofsV050, sourceProofsV050 } from './readProjectionV049.js';
const port = parentPort!;
let produce: ReturnType<typeof createEnvelopeProducerV044> | undefined;
port.on('message', (job) => {
  if (job.diagnostic && !produce) produce = createEnvelopeProducerV044({ ...job.diagnostic, processType: 'worker' });
  const spans = new Map<string, DiagnosticContextV044>();
  const timings: { event: string; elapsedMs: number; startedMonoMs: number; endedMonoMs: number }[] = [];
  const jobStarted = performance.now();
  let firstSqlAt: number | undefined;
  const stage = (event: string, phase: 'START' | 'PROGRESS' | 'END' | 'POINT', details: Record<string, unknown> = {}, outcome: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED') => {
    if (details.timingV050 && phase === 'END' && timings.length < 256) timings.push({event, elapsedMs:Number(details.elapsedMs), startedMonoMs:Number(details.startedMonoMs), endedMonoMs:Number(details.endedMonoMs)});
    if (event === 'sql-count' && phase === 'START' && firstSqlAt === undefined) firstSqlAt = performance.now();
    const parent = [...spans.values()].at(-1) ?? job.diagnostic?.context;
    if (phase === 'START' && parent) spans.set(event, { ...parent, spanId: randomUUID(), parentSpanId: parent.spanId });
    const context = spans.get(event) ?? parent ?? null;
    const ack = phase === 'START' || phase === 'END' ? new Int32Array(new SharedArrayBuffer(4)) : null;
    port.postMessage({ type: 'stage', id: job.id, event, phase, details, envelope: produce?.(event, phase, context, details, outcome), ack: ack?.buffer });
    // The writer's fsync acknowledgement precedes synchronous work in this executor.
    if (ack) {
      const wait = Atomics.wait(ack, 0, 0, 2100);
      if (wait === 'timed-out' || Atomics.load(ack, 0) !== 1) port.postMessage({ type: 'stage', id: job.id, event: 'diagnostics-degraded', phase: 'POINT', details: { reason: 'CRITICAL_ACK_UNAVAILABLE' } });
    }
    if (phase === 'END') spans.delete(event);
  };
  setQueryObserverV044(stage);
  configureBusinessIoV044(details => stage('file-io', 'POINT', details), job.appRoot ?? '');
  configureReadProjectionV049(job.appRoot ?? '',job.action === 'projection-build');
  configureSourceProofsV050(job.sourceProofs ?? {});
  stage('worker-start','POINT',{enqueueAt:job.enqueueAt,workerStartAt:Date.now(),queueMs:Math.max(0,Date.now()-(job.enqueueAt ?? Date.now())),requestKind:job.action});
  try {
    const { kind, ai, raw, query, field, search, visible } = job;
    if (process.env.JAA_UI_TEST_MODE === '1' && job.__testBarrier instanceof SharedArrayBuffer) {
      const barrier = new Int32Array(job.__testBarrier); Atomics.add(barrier, 1, 1);
      if (Atomics.wait(barrier, 0, 0, 20000) === 'timed-out') throw Error('TEST_QUERY_BARRIER_TIMEOUT');
    }
    const value = job.action === 'facet' ? distinctResultsV043(kind, ai, raw, field, query, search) : job.action === 'export-file' ? writeQueryExportV044(kind, ai, raw, query, visible, job.output, job.format) : job.action === 'export' ? exportResultsV043(kind, ai, raw, query, visible) : queryResultsV043(kind, ai, raw, query);
    releaseOversizeResultCacheV045();
    const elapsedMs = performance.now() - jobStarted;
    if (elapsedMs > 5000) stage('query-top-stages', 'POINT', { elapsedMs, topStages: [...timings].sort((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,8), nestedDurationsDoNotSum: true });
    const transferValue = measureQueryStageV050('serialize', () => structuredClone(value));
    if (firstSqlAt !== undefined) {
      const intervals = timings.map(t => [Math.max(jobStarted,t.startedMonoMs),Math.min(firstSqlAt!,t.endedMonoMs)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
      let coveredMs=0,last=jobStarted;
      for (const [a,b] of intervals) { coveredMs+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b); }
      const preSqlMs=firstSqlAt-jobStarted;
      stage('pre-sql-coverage','POINT',{preSqlMs,coveredMs,unknownMs:Math.max(0,preSqlMs-coveredMs),coveragePercent:preSqlMs?coveredMs/preSqlMs*100:null,method:'union-of-named-worker-intervals; no parent-child double count'});
    }
    port.postMessage({ type: 'result', id: job.id, value: transferValue, sourceProofs: sourceProofsV050(), diagnostics: { ...latestQueryDiagnosticsV043(), stageTimings: timings, memory: process.memoryUsage(), resourceOwner: { pid: process.pid, threadId, processType: 'worker', rssScope: 'process-wide-do-not-sum-workers', heapScope: 'worker-local', units: 'bytes' } } });
  } catch (error) {
    for (const event of [...spans.keys()].reverse()) stage(event, 'END', { code: 'QUERY_FAILED' }, 'FAILED');
    port.postMessage({ type: 'error', id: job.id, error: error instanceof Error ? error.message : 'QUERY_FAILED' });
  }
});
