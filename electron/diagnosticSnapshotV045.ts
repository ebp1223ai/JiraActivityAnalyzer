import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

type Json = Record<string, any>;
// Called on the single writer loop: no producer append can interleave these copies.
export function captureDiagnosticSessionV045(source: string, target: string, expectedProducers: string[] = []) {
  fs.mkdirSync(target, { recursive: true });
  const cutoffUtc = new Date().toISOString();
  const files: Json[] = [], gaps: Json[] = [], counts: Json = {}, watermarks: Json = {}, openSpans: Json = {};
  let state: Json = {};
  try {
    state = JSON.parse(fs.readFileSync(path.join(source, 'automatic-summary.json'), 'utf8'));
    if (state.writerFailed || state.droppedEventCount || state.gapCount || state.retainedTimelineIsPartial) gaps.push({ reason: 'WRITER_REPORTED_GAP', droppedEventCount: state.droppedEventCount ?? 0, gapCount: state.gapCount ?? 0, retainedTimelineIsPartial: Boolean(state.retainedTimelineIsPartial) });
  } catch { gaps.push({ reason: 'AUTOMATIC_SUMMARY_MISSING_OR_INVALID' }); }
  let lastCompleted: Json | null = null;
  const names = fs.readdirSync(source).filter(name => /^(automatic-\d+\.ndjson|automatic-summary\.json|session-summary\.json|main\.ndjson|renderer\.ndjson|transitions\.ndjson|.*\.rotated)$/.test(name)).sort();
  for (const name of names) {
    const file = path.join(source, name);
    if (fs.lstatSync(file).isSymbolicLink()) { gaps.push({ file: name, reason: 'SYMLINK_REJECTED' }); continue; }
    try {
      const body = fs.readFileSync(file);
      fs.writeFileSync(path.join(target, name), body, { flag: 'wx' });
      files.push({ file: name, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') });
      if (!/^automatic-\d+\.ndjson$/.test(name)) continue;
      const lines = body.toString('utf8').split('\n');
      if (lines.at(-1)) gaps.push({ file: name, reason: 'PARTIAL_LINE', bytes: Buffer.byteLength(lines.pop()!) });
      for (const line of lines.filter(Boolean)) {
        try {
          const event = JSON.parse(line), producer = event.producerId;
          if (!producer || !Number.isSafeInteger(event.producerSeq)) { gaps.push({ file: name, reason: 'INVALID_ENVELOPE' }); continue; }
          const prior = watermarks[producer] ?? 0;
          if (event.producerSeq !== prior + 1) gaps.push({ producerId: producer, reason: 'SEQUENCE_GAP', expected: prior + 1, observed: event.producerSeq });
          watermarks[producer] = Math.max(prior, event.producerSeq); counts[producer] = (counts[producer] ?? 0) + 1;
          if (event.phase === 'START' && event.spanId) openSpans[event.spanId] = event;
          if (event.phase === 'END') { delete openSpans[event.spanId]; lastCompleted = event; }
        } catch { gaps.push({ file: name, reason: 'INVALID_JSON_LINE' }); }
      }
    } catch (error) { gaps.push({ file: name, reason: (error as NodeJS.ErrnoException).code ?? 'READ_OR_COPY_FAILED' }); }
  }
  for (const [producer, count] of Object.entries(state.producerCounts ?? {})) {
    if (counts[producer] !== count || watermarks[producer] !== state.producerWatermarks?.[producer]) gaps.push({ producerId: producer, reason: 'SUMMARY_JOURNAL_MISMATCH', expectedCount: count, observedCount: counts[producer] ?? 0, expectedWatermark: state.producerWatermarks?.[producer], observedWatermark: watermarks[producer] ?? 0 });
  }
  for (const producer of expectedProducers) if (!(producer in watermarks)) gaps.push({ producerId: producer, reason: 'MISSING_PRODUCER' });
  if (!names.some(n => /^automatic-\d+\.ndjson$/.test(n))) gaps.push({ reason: 'AUTOMATIC_JOURNAL_MISSING' });
  const summary = { schemaVersion: 'jaa-diagnostic-snapshot-v1', cutoffUtc, cutoffMeaning: 'writer-accepted-events; producer messages not yet received are outside this snapshot', watermarks, counts, openSpans, lastCompleted, files, gaps, completeness: gaps.length ? 'INCOMPLETE' : 'COMPLETE_THROUGH_WATERMARK', generatedAtUtc: new Date().toISOString() };
  fs.writeFileSync(path.join(target, 'snapshot-summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
  return summary;
}
