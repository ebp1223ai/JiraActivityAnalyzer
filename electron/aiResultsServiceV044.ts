import path from 'node:path';
import { Worker } from 'node:worker_threads';

type Json = Record<string, any>;
type Job = { owner: number; requestId: string; onStage?: (stage: Json) => void | Promise<unknown>; resolve: (value: any) => void; reject: (error: Error) => void };
type Lane = { lastDiagnostics?: Json; sampledAt?: string; cancelledRequestId?: string; endReason?: string; worker: Worker; pending: Map<string, Job> };
export class AiResultsServiceV044 {
  private lanes = new Map<string, Lane>();
  private receipts: Json = {};
  private testBarrier?: Int32Array;
  holdTestQuery() { if (process.env.JAA_UI_TEST_MODE !== '1') throw Error('TEST_MODE_REQUIRED'); this.releaseTestQuery(); this.testBarrier = new Int32Array(new SharedArrayBuffer(8)); }
  testQueryState() { return { armed: Boolean(this.testBarrier), entered: this.testBarrier ? Atomics.load(this.testBarrier, 1) : 0 }; }
  releaseTestQuery() { if (this.testBarrier) { Atomics.store(this.testBarrier, 0, 1); Atomics.notify(this.testBarrier, 0); this.testBarrier = undefined; } }
  constructor(private filename = path.join(__dirname, 'ai-results-worker-v044.cjs')) {}
  run(owner: number, input: Json, onStage?: (stage: Json) => void | Promise<unknown>): Promise<any> {
    const key = `${owner}:${input.kind}:read`;
    let lane = this.lanes.get(key);
    if (!lane) {
      // Read-only executors never own a user database transaction or background fetch.
      if (this.lanes.size >= 4) return Promise.reject(new Error('QUERY_EXECUTOR_CAPACITY'));
      lane = { worker: new Worker(this.filename), pending: new Map() };
      const current = lane;
      this.lanes.set(key, current);
      current.worker.on('message', msg => {
        const job = current.pending.get(msg.id); if (!job) return;
        if (msg.type === 'stage') {
          Promise.resolve().then(() => job.onStage?.(msg)).then(ok => {
            if (msg.ack) { const ack = new Int32Array(msg.ack); Atomics.store(ack, 0, ok === false ? 2 : 1); Atomics.notify(ack, 0); }
          }, () => { if (msg.ack) { const ack = new Int32Array(msg.ack); Atomics.store(ack, 0, 2); Atomics.notify(ack, 0); } });
          return;
        }
        current.pending.delete(msg.id);
        if (msg.type === 'error') job.reject(new Error(msg.error));
        else { this.receipts = msg.diagnostics; current.lastDiagnostics = msg.diagnostics; current.sampledAt = new Date().toISOString(); job.resolve(msg.value); }
      });
      const fail = (error: Error) => { if (this.lanes.get(key) === current) this.lanes.delete(key); for (const job of current.pending.values()) job.reject(current.endReason ? new Error(job.requestId === current.cancelledRequestId ? current.endReason : 'SUPERSEDED') : error); current.pending.clear(); };
      current.worker.on('error', fail);
      current.worker.on('exit', code => fail(new Error(`QUERY_WORKER_EXIT_${code}`)));
    }
    if (lane.pending.has(input.requestId)) return Promise.reject(new Error('DUPLICATE_REQUEST_ID'));
    if (lane.pending.size >= 16) return Promise.reject(new Error('QUERY_QUEUE_FULL'));
    return new Promise((resolve, reject) => {
      lane!.pending.set(input.requestId, { owner, requestId: input.requestId, onStage, resolve, reject });
      lane!.worker.postMessage({ ...input, id: input.requestId, __testBarrier: process.env.JAA_UI_TEST_MODE === '1' && input.action === 'query' && input.kind === 'integrated' ? this.testBarrier?.buffer : undefined });
    });
  }
  async cancel(owner: number, requestId: string, reason = 'CANCELLED') {
    for (const [key, lane] of this.lanes) {
      if (!lane.pending.has(requestId) || lane.pending.get(requestId)!.owner !== owner) continue;
      this.lanes.delete(key);
      lane.endReason = reason;
      lane.cancelledRequestId = requestId;
      const stopped = lane.worker.terminate();
      await stopped;
      for (const [id, job] of lane.pending) job.reject(new Error(id === requestId ? reason : 'SUPERSEDED'));
      lane.pending.clear();
      return { cancelled: true, executorStopped: true };
    }
    return { cancelled: false, executorStopped: false, reason: 'ALREADY_COMPLETED' };
  }
  async closeOwner(owner: number) {
    for (const [key, lane] of [...this.lanes]) if (key.startsWith(`${owner}:`)) {
      this.lanes.delete(key);
      lane.endReason = 'SUPERSEDED';
      await lane.worker.terminate();
      for (const job of lane.pending.values()) job.reject(new Error('SUPERSEDED'));
      lane.pending.clear();
    }
  }
  async close() { for (const key of [...this.lanes.keys()]) await this.closeOwner(Number(key.split(':')[0])); }
  diagnostics() { return { ...this.receipts, process: { pid: process.pid, rssBytes: process.memoryUsage().rss, sampledAt: new Date().toISOString(), rssScope: 'unique-process' }, executors: [...this.lanes].map(([key, lane]) => ({ key, threadId: lane.worker.threadId, pendingCount: lane.pending.size, sampledAt: lane.sampledAt ?? null, memory: lane.lastDiagnostics?.memory ?? null, cacheBytes: lane.lastDiagnostics?.cacheBytes ?? null, cacheBudgetBytes: lane.lastDiagnostics?.cacheBudgetBytes ?? null, listeners: Object.fromEntries(lane.worker.eventNames().map(name => [String(name), lane.worker.listenerCount(name)])) })), executorCount: this.lanes.size, pendingCount: [...this.lanes.values()].reduce((n, lane) => n + lane.pending.size, 0) }; }
}
export const aiResultsServiceV044 = new AiResultsServiceV044();
