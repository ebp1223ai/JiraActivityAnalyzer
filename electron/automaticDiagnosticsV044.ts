import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { monitorEventLoopV050 } from '../shared/eventLoopLagV050.js';
import { redactDiagnosticsV044, createEnvelopeProducerV044, type DiagnosticBuildV044, type DiagnosticContextV044, type DiagnosticPhaseV044, type DiagnosticOutcomeV044 } from './diagnosticEnvelopeV044.js';

type Json = Record<string, any>;
export const diagnosticContextV044 = new AsyncLocalStorage<DiagnosticContextV044>();
export class AutomaticDiagnosticsV044 {
  readonly instanceId = randomUUID();
  readonly ready: Promise<boolean>;
  private child: ChildProcess;
  private produce: ReturnType<typeof createEnvelopeProducerV044>;
  private pending = new Map<string, { bytes: number; timer: NodeJS.Timeout; resolve: (ok: boolean) => void }>();
  private queueBytes = 0;
  private heartbeat: NodeJS.Timeout;
  private stopLoopMonitor: () => void;
  private state: Json = { status: 'starting', writerFailed: false, droppedEventCount: 0, queueHighWater: 0, flushTimeout: 0 };
  private stageSpans = new Map<string, DiagnosticContextV044>();
  private inFlight = new Set<Promise<unknown>>();
  private rendererSpans = new Map<string, { event: string; context: DiagnosticContextV044 }>();
  private suppressedSpans = new Set<string>();
  private closing = false;
  beginShutdown() { this.closing = true; }
  isClosing() { return this.closing; }
  route: string | null = null;
  private afterStartAcknowledged: (() => void) | null = null;
  armIsolatedStartAckFault(callback: () => void) { this.afterStartAcknowledged = callback; }
  constructor(readonly config: { logsDir: string; sessionId: string; build: DiagnosticBuildV044; filename?: string }) {
    this.produce = createEnvelopeProducerV044({ ...config, instanceId: this.instanceId, processType: 'main' });
    this.child = fork(config.filename ?? path.join(__dirname, 'diagnostic-writer-v044.cjs'), [], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', JAA_DIAGNOSTIC_SIDECAR: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.child.on('message', (m: any) => {
      if (m.summary) this.state = { ...this.state, ...m.summary };
      const pending = this.pending.get(m.id);
      if (pending) { clearTimeout(pending.timer); this.queueBytes -= pending.bytes; this.pending.delete(m.id); if (!m.ok) this.state.writerFailed = true; pending.resolve(m.ok === true); }
    });
    const failed = () => { this.state.writerFailed = true; this.state.status = 'DIAGNOSTICS_DEGRADED'; for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve(false); } this.pending.clear(); this.queueBytes = 0; };
    this.child.on('error', failed); this.child.on('exit', failed);
    this.ready = this.send({ type: 'init', config: { ...config, instanceId: this.instanceId, mainPid: process.pid } }, true);
    this.heartbeat = setInterval(() => this.beat('main', { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed }), 2000);
    this.heartbeat.unref();
    this.stopLoopMonitor = monitorEventLoopV050(sample => { void this.event('event-loop-lag', 'POINT', { ...sample, measuredProcess: 'main' }); });
  }
  private send(message: Json, critical: boolean): Promise<boolean> {
    const size = Buffer.byteLength(JSON.stringify(message));
    if (!this.child.connected || this.queueBytes + size > 4 * 1024 ** 2 - (critical ? 0 : 64 * 1024)) { this.state.droppedEventCount++; this.state.writerFailed = true; return Promise.resolve(false); }
    const id = randomUUID(); this.queueBytes += size; this.state.queueHighWater = Math.max(this.state.queueHighWater, this.queueBytes);
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); this.queueBytes -= size; this.state.flushTimeout++; this.state.writerFailed = true; resolve(false); }, 2000);
      this.pending.set(id, { bytes: size, timer, resolve });
      this.child.send({ ...message, id }, error => { if (error) { const p = this.pending.get(id); if (p) { clearTimeout(timer); this.pending.delete(id); this.queueBytes -= size; this.state.writerFailed = true; resolve(false); } } });
    });
  }
  async event(event: string, phase: DiagnosticPhaseV044, details: unknown = {}, context = diagnosticContextV044.getStore() ?? null, outcome: DiagnosticOutcomeV044 = null) {
    await this.ready;
    if (this.closing && phase === 'START' && context) { this.suppressedSpans.add(context.spanId); return false; }
    if (context && this.suppressedSpans.has(context.spanId)) { if (phase === 'END') this.suppressedSpans.delete(context.spanId); return false; }
    if (context && ['navigation-shell','renderer-result-commit'].includes(event)) {
      if (phase === 'START') this.rendererSpans.set(context.spanId, { event, context });
      if (phase === 'END') { if (!this.rendererSpans.has(context.spanId)) return false; this.rendererSpans.delete(context.spanId); }
    }
    return this.send({ type: 'event', event: this.produce(event, phase, context, details, outcome), critical: phase === 'START' || phase === 'END' }, phase === 'START' || phase === 'END');
  }
  async operation<T>(name: string, action: () => Promise<T> | T, details: Json = {}): Promise<T> {
    const parent = diagnosticContextV044.getStore();
    const context = { operationId: parent?.operationId ?? randomUUID(), spanId: randomUUID(), parentSpanId: parent?.spanId ?? null, route: parent?.route ?? this.route };
    const task = diagnosticContextV044.run(context, async () => {
      const durable = await this.event(name, 'START', details);
      const started = performance.now();
      const progress = setInterval(() => void this.event(name, 'PROGRESS', { elapsedMs: performance.now() - started, processed: null, total: null, durableStart: durable }), 2000);
      try {
        const value = await action();
        const result = value as Json | undefined;
        const outcome = result?.errorCode === 'SUPERSEDED' ? 'SUPERSEDED' : result?.cancelled || result?.canceled || result?.errorCode === 'CANCELLED' || result?.run?.status === 'cancelled' ? 'CANCELLED' : result?.ok === false || result?.success === false ? 'FAILED' : 'SUCCEEDED';
        await this.event(name, 'END', { elapsedMs: performance.now() - started, resultCode: result?.errorCode ?? null }, context, outcome);
        return value;
      } catch (error) { await this.event(name, 'END', { error, elapsedMs: performance.now() - started }, context, (error as Error).message === 'CANCELLED' ? 'CANCELLED' : (error as Error).message === 'SUPERSEDED' ? 'SUPERSEDED' : 'FAILED'); throw error; }
      finally { clearInterval(progress); }
    });
    this.inFlight.add(task);
    try { return await task; } finally { this.inFlight.delete(task); }
  }
  async stage(context: DiagnosticContextV044 | undefined, stage: Json) {
    if (stage.envelope) { await this.ready; const ok = await this.send({ type: 'event', event: stage.envelope, critical: stage.phase === 'START' || stage.phase === 'END' }, stage.phase === 'START' || stage.phase === 'END'); if (ok && stage.phase === 'START' && this.afterStartAcknowledged) { const callback = this.afterStartAcknowledged; this.afterStartAcknowledged = null; callback(); } return ok; }
    if (!context) return;
    if (stage.phase === 'POINT') return this.event(stage.event, 'POINT', stage.details ?? {}, context);
    const key = `${context.operationId}:${stage.event}`;
    let child = this.stageSpans.get(key);
    if (stage.phase === 'START') { child = { ...context, spanId: randomUUID(), parentSpanId: context.spanId }; this.stageSpans.set(key, child); }
    if (!child) return;
    await this.event(stage.event, stage.phase, { ...stage.details, observedFrom: 'read-only-worker' }, child);
    if (stage.phase === 'END') this.stageSpans.delete(key);
  }
  async appendLegacy(file: string, value: unknown) {
    await this.ready;
    const safe = redactDiagnosticsV044(value);
    const line = typeof value === 'string' ? String(safe.value ?? '') : JSON.stringify(safe);
    return this.send({ type: 'legacy', file, line }, false);
  }
  beat(producer: string, details: Json = {}) { if (this.child.connected) this.child.send({ type: 'beat', producer, details }, () => {}); }
  suspend(value: boolean) { if (this.child.connected) this.child.send({ type: 'suspend', value }, () => {}); }
  snapshot(): Json { return { ...this.state, queueBytes: this.queueBytes, status: this.state.writerFailed ? 'DIAGNOSTICS_DEGRADED' : this.state.status }; }
  async capture(target: string) { await this.ready; return this.send({ type: 'capture', target }, true); }
  async close() {
    this.beginShutdown(); clearInterval(this.heartbeat); this.stopLoopMonitor();
    const deadline = performance.now() + 2500;
    while ((this.inFlight.size || this.pending.size) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    for (const { event, context } of [...this.rendererSpans.values()]) await this.event(event, 'END', { reason: 'APP_SHUTDOWN_INTERRUPTED_RENDER', observedProducer: 'renderer' }, context, 'CANCELLED');
    await this.send({ type: 'close', incompleteOperations: this.inFlight.size }, true);
    if (this.child.connected) this.child.disconnect();
  }
}
let active: AutomaticDiagnosticsV044 | undefined;
export function setAutomaticDiagnosticsV044(value: AutomaticDiagnosticsV044) { active = value; }
export function automaticDiagnosticsV044() { return active; }
