import "./syntheticIoAuditV044.js";
import { configureBusinessIoV044 } from './businessIoDiagnosticsV044.js';
import { parentPort } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { createEnvelopeProducerV044 } from './diagnosticEnvelopeV044.js';
import { DatabaseSync } from 'node:sqlite';
import { initializeAiDatabaseV042, importAiAnalysisPackageV042, validateAiAnalysisPackageV042, recordSourceLinkAttemptV042 } from './aiAnalysisDatabaseV042.js';
const port = parentPort!;
port.on('message', job => {
  const flag = new Int32Array(job.control);
  const produce = job.diagnostic ? createEnvelopeProducerV044({ ...job.diagnostic, processType: 'worker' }) : null;
  const context = job.diagnostic?.context ? { ...job.diagnostic.context, spanId: randomUUID(), parentSpanId: job.diagnostic.context.spanId } : null;
  const stage = (event: string, phase: 'START' | 'END', outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' = 'SUCCEEDED') => {
    const ack = new Int32Array(new SharedArrayBuffer(4));
    port.postMessage({ type: 'stage', id: job.requestId, event, phase, ack: ack.buffer, envelope: produce?.(event, phase, context, {}, outcome) });
    Atomics.wait(ack, 0, 0, 2100);
  };
  configureBusinessIoV044(details => port.postMessage({ type: 'stage', id: job.requestId, event: 'file-io', phase: 'POINT', envelope: produce?.('file-io', 'POINT', context, details) }));
  const cancelled = () => Atomics.load(flag, 0) === 1;
  const safePoint = () => { if (cancelled()) throw Error('CANCELLED'); };
  try {
    stage('write.' + job.action, 'START');
    safePoint();
    let value: unknown;
    if (job.action === 'initialize') { value = initializeAiDatabaseV042(job.input); safePoint(); }
    else if (job.action === 'preflight') value = validateAiAnalysisPackageV042(job.input).preview;
    else if (job.action === 'import') value = importAiAnalysisPackageV042({ ...job.input, isCancelled: cancelled, beforeCommit: () => { if (Atomics.compareExchange(flag, 0, 0, 2) === 1) throw Error('CANCELLED'); port.postMessage({ type: 'progress', stage: 'commit-barrier', requestId: job.requestId }); } });
    else if (job.action === 'relink') {
      const raw = new DatabaseSync(job.rawPath, { readOnly: true }), ai = new DatabaseSync(job.databasePath, { readOnly: true });
      const counts: Record<string, number> = {};
      let processed = 0;
      try {
        const metadata = raw.prepare("SELECT database_id FROM database_metadata WHERE metadata_key='primary'").get() as { database_id: string };
        const records = ai.prepare('SELECT r.ai_record_id,r.database_generation,t.source_trace_json FROM ai_records r JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id JOIN ai_record_source_traces t ON t.ai_record_id=r.ai_record_id AND t.import_batch_id=a.import_batch_id').all() as Record<string, any>[];
        for (const item of records) {
          if (cancelled()) break;
          const record = { ...JSON.parse(item.source_trace_json), databaseGeneration: item.database_generation }, ref = record.sourceTrace?.reference ?? record.reference;
          let candidates: Record<string, any>[] = [], failureReason: string | undefined;
          try {
            candidates = raw.prepare('SELECT id activityEventId,source_record_id sourceRecordStableId,field_id fieldIdentity,field_name fieldName,event_time eventTime FROM activity_events WHERE id=?').all(ref.activityEventId);
            if (!candidates.length) candidates = raw.prepare('SELECT id activityEventId,source_record_id sourceRecordStableId,field_id fieldIdentity,field_name fieldName,event_time eventTime FROM activity_events WHERE source_record_id=? AND COALESCE(field_id,field_name)=COALESCE(?,?) AND event_time=?').all(ref.sourceRecordStableId ?? null, ref.fieldId ?? null, ref.fieldName ?? null, ref.eventTime);
          } catch (error) { failureReason = error instanceof Error ? error.message : 'RELINK_SQL_ERROR'; }
          const decision = recordSourceLinkAttemptV042({ databasePath: job.databasePath, aiRecordId: item.ai_record_id, rawDatabaseIdentity: metadata.database_id, record: { sourceTrace: record, databaseGeneration: item.database_generation }, candidates: candidates as Array<{ activityEventId: string }>, failureReason });
          counts[decision.status] = (counts[decision.status] ?? 0) + 1; processed++;
          if (processed % 25 === 0) port.postMessage({ type: 'progress', requestId: job.requestId, processed, total: records.length, stage: 'source-link' });
        }
        value = { ok: true, cancelled: cancelled(), committedAttempts: processed, total: records.length, counts };
      } finally { raw.close(); ai.close(); }
    } else throw Error('WRITE_OPERATION_NOT_ALLOWED');
    if (job.action === 'preflight') safePoint();
    Atomics.store(flag, 0, 3);
    stage('write.' + job.action, 'END', (value as any)?.cancelled ? 'CANCELLED' : 'SUCCEEDED');
    port.postMessage({ requestId: job.requestId, ok: true, value });
  } catch (error) { Atomics.store(flag, 0, 4); stage('write.' + job.action, 'END', (error as Error).message === 'CANCELLED' ? 'CANCELLED' : 'FAILED'); port.postMessage({ requestId: job.requestId, ok: false, error: error instanceof Error ? error.message : 'WRITE_FAILED' }); }
});
