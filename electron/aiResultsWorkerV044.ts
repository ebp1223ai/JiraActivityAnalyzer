import "./syntheticIoAuditV044.js";
import { configureBusinessIoV044 } from './businessIoDiagnosticsV044.js';
import { parentPort, threadId } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { createEnvelopeProducerV044, type DiagnosticContextV044 } from './diagnosticEnvelopeV044.js';
import { queryResultsV043, distinctResultsV043, exportResultsV043, writeQueryExportV044, latestQueryDiagnosticsV043, releaseOversizeResultCacheV045 } from './aiResultsQueryV043.js';
import { setQueryObserverV044 } from './aiResultsIndexV044.js';
const port = parentPort!;
let produce: ReturnType<typeof createEnvelopeProducerV044> | undefined;
port.on('message', (job) => {
  if (job.diagnostic && !produce) produce = createEnvelopeProducerV044({ ...job.diagnostic, processType: 'worker' });
  const spans = new Map<string, DiagnosticContextV044>();
  const stage = (event: string, phase: 'START' | 'PROGRESS' | 'END' | 'POINT', details: Record<string, unknown> = {}, outcome: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED') => {
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
  try {
    const { kind, ai, raw, query, field, search, visible } = job;
    const value = job.action === 'facet' ? distinctResultsV043(kind, ai, raw, field, query, search) : job.action === 'export-file' ? writeQueryExportV044(kind, ai, raw, query, visible, job.output, job.format) : job.action === 'export' ? exportResultsV043(kind, ai, raw, query, visible) : queryResultsV043(kind, ai, raw, query);
    releaseOversizeResultCacheV045();
    port.postMessage({ type: 'result', id: job.id, value, diagnostics: { ...latestQueryDiagnosticsV043(), memory: process.memoryUsage(), resourceOwner: { pid: process.pid, threadId, processType: 'worker', rssScope: 'process-wide-do-not-sum-workers', heapScope: 'worker-local', units: 'bytes' } } });
  } catch (error) {
    for (const event of [...spans.keys()].reverse()) stage(event, 'END', { code: 'QUERY_FAILED' }, 'FAILED');
    port.postMessage({ type: 'error', id: job.id, error: error instanceof Error ? error.message : 'QUERY_FAILED' });
  }
});
