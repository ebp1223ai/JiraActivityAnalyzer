import { Worker } from 'node:worker_threads';
import { automaticDiagnosticsV044, diagnosticContextV044 } from './automaticDiagnosticsV044.js';
import path from 'node:path';
type Job = { owner: number; requestId: string; control: Int32Array; worker: Worker; promise: Promise<any>; startedAt: number; stage: string };
export class AiWriteServiceV044 {
  private active: Job | null = null;
  constructor(private filename = path.join(__dirname, 'ai-write-worker-v044.cjs')) {}
  run(owner: number, input: Record<string, any>, progress?: (value: Record<string, any>) => void) {
    if (this.active) return Promise.reject(new Error('AI_DATABASE_OPERATION_IN_PROGRESS'));
    const diagnostic = automaticDiagnosticsV044(), context = diagnosticContextV044.getStore();
    const worker = new Worker(this.filename), control = new Int32Array(new SharedArrayBuffer(4));
    let finish!: () => void;
    const promise = new Promise<Record<string, any>>((resolve, reject) => {
      finish = () => { if (this.active?.worker === worker) this.active = null; void worker.terminate(); };
      worker.on('message', message => {
        if (message.type === 'stage' && !message.ack) { void diagnostic?.stage(context, message); return; }
        if (message.type === 'stage') { if (this.active?.worker === worker) this.active.stage = message.event; void Promise.resolve(diagnostic?.stage(context, message)).then(ok => { const ack = new Int32Array(message.ack); Atomics.store(ack,0,ok === false ? 2 : 1); Atomics.notify(ack,0); }).catch(() => { const ack = new Int32Array(message.ack); Atomics.store(ack,0,2); Atomics.notify(ack,0); }); return; }
        if (message.type === 'progress') { progress?.(message); return; }
        if (message.ok) resolve(message.value); else reject(new Error(message.error));
        finish();
      });
      worker.on('error', error => { reject(error); finish(); });
      worker.on('exit', code => { if (this.active?.worker === worker) { this.active = null; reject(new Error(`WRITE_EXECUTOR_EXIT_${code}`)); } });
    });
    this.active = { owner, requestId: input.requestId, control, worker, promise, startedAt: Date.now(), stage: input.action };
    worker.postMessage({ ...input, control: control.buffer, diagnostic: diagnostic ? { ...diagnostic.config, instanceId: diagnostic.instanceId, context } : null });
    return promise;
  }
  cancel(owner: number, requestId: string) {
    const job = this.active;
    if (!job || job.owner !== owner || job.requestId !== requestId) return { requested: false, reason: 'ALREADY_COMPLETED' };
    const phase = Atomics.compareExchange(job.control, 0, 0, 1);
    return { requested: phase === 0 || phase === 1, reason: phase >= 2 ? 'CANCEL_TOO_LATE_COMMIT_BARRIER' : 'CANCEL_REQUESTED', cancelled: false };
  }
  state() { return this.active ? { requestId: this.active.requestId, phase: Atomics.load(this.active.control, 0), running: true, startedAt: this.active.startedAt, stage: this.active.stage } : { running: false }; }
  async close() { if (this.active) { this.cancel(this.active.owner, this.active.requestId); await this.active.promise.catch(() => {}); } }
}
export const aiWriteServiceV044 = new AiWriteServiceV044();
