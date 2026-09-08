import { randomUUID } from 'node:crypto';
export type DiagnosticPhaseV044 = 'START' | 'PROGRESS' | 'END' | 'POINT';
export type DiagnosticOutcomeV044 = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT' | 'SUPERSEDED' | null;
export type DiagnosticContextV044 = { operationId: string; spanId: string; parentSpanId: string | null; route: string | null };
export type DiagnosticBuildV044 = { version: string; sourceCommit: string | null; buildTime: string | null };
export function redactDiagnosticsV044(value: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>();
  let truncated = 0, redacted = 0;
  const walk = (v: any, key = '', depth = 0): any => {
    if (/token|password|cookie|authorization|secret|^binds$|rawbody|rawdata|^before$|^after$|filtertext|^query$|^payload$/i.test(key)) { redacted++; return '[masked]'; }
    if (depth > 6) { truncated++; return '[depth-limit]'; }
    if (v instanceof Error) return { name: v.name, message: walk(v.message), stack: walk(v.stack) };
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'string') {
      const clean = v.replace(/((?:authorization|cookie|password|secret|api[_-]?token|token)\s*[:=]\s*)[^\r\n,;}]+/gi, '$1[masked]').replace(/\b(Basic|Bearer)\s+[^\s,;]+/gi, '$1 [masked]').replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[masked]').replace(/([?&](?:token|key|password|secret)=)[^&\s]+/gi, '$1[masked]');
      if (clean !== v) redacted++;
      if (clean.length > 1600) { truncated++; return clean.slice(0, 1600) + `[length=${clean.length}]`; } return clean;
    }
    if (!v || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? '[unsupported]' : v;
    if (seen.has(v)) return '[circular]'; seen.add(v);
    if (Array.isArray(v)) { if (v.length > 40) truncated++; return v.slice(0, 40).map(item => walk(item, key, depth + 1)); }
    const entries = Object.entries(v); if (entries.length > 50) truncated++;
    return Object.fromEntries(entries.slice(0, 50).map(([k, item]) => [k, walk(item, k, depth + 1)]));
  };
  let output = walk(value) ?? {};
  if (typeof output !== 'object' || Array.isArray(output)) output = { value: output };
  if (Buffer.byteLength(JSON.stringify(output)) > 12 * 1024) { output = { oversizedDetails: true, originalBytes: Buffer.byteLength(JSON.stringify(output)) }; truncated++; }
  return { ...output, redactedCount: redacted, truncatedCount: truncated };
}
export function createEnvelopeProducerV044(input: { sessionId: string; instanceId: string; processType: 'main' | 'renderer' | 'worker' | 'monitor' | 'writer' | 'launcher'; build: DiagnosticBuildV044; pid?: number }) {
  let sequence = 0;
  const producerId = `${input.processType}-${randomUUID()}`;
  return (event: string, phase: DiagnosticPhaseV044, context: DiagnosticContextV044 | null = null, details: unknown = {}, outcome: DiagnosticOutcomeV044 = null) => ({
    schemaVersion: 'jaa-diagnostic-event-v1', eventId: randomUUID(), sessionId: input.sessionId, instanceId: input.instanceId,
    producerId, producerSeq: ++sequence, timestampUtc: new Date().toISOString(), monotonicMs: performance.now(), processType: input.processType, pid: input.pid ?? process.pid,
    route: context?.route ?? null, operationId: context?.operationId ?? null, spanId: context?.spanId ?? null, parentSpanId: context?.parentSpanId ?? null,
    event, phase, outcome: phase === 'END' ? outcome ?? 'SUCCEEDED' : null, build: input.build, details: redactDiagnosticsV044(details)
  });
}
