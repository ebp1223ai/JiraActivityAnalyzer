import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { CurrentStateInspection } from './currentStateArchive.js';
import { compatibilityObservationV050 } from './databaseCompatibilityObservationV050.js';
export type OpenStageV050 = 'OPENING' | 'VALIDATING' | 'CRITICAL_READY' | 'HEALTH_CHECKING' | 'READY' | 'WARNING' | 'ERROR';
export class DatabaseCompatibilityV050 {
  private job?: { key: string; worker: Worker; critical: Promise<CurrentStateInspection>; resolve: (value: CurrentStateInspection) => void; reject: (error: Error) => void; value?: CurrentStateInspection; observation: string; settled: boolean };
  state = { stage: 'READY' as OpenStageV050, startedAt: '', elapsedMs: 0, error: '', active: false };
  constructor(private filename = path.join(__dirname, 'database-compatibility-worker-v050.cjs'), private health: (value: CurrentStateInspection) => void = () => {}, private diagnostic: (stage: string, details: Record<string, unknown>) => void = () => {}) {}
  async open(file: string, jiraIdentity: string) {
    const observation = compatibilityObservationV050(file), key = JSON.stringify([file, jiraIdentity, observation]);
    if (this.job?.key === key && this.state.stage !== 'ERROR' && this.state.stage !== 'WARNING') {
      this.diagnostic('compatibility-reuse', { databaseId: this.job.value?.databaseId, stage: this.state.stage });
      return this.job.value ?? this.job.critical;
    }
    await this.cancel();
    this.state = { stage: 'OPENING', startedAt: new Date().toISOString(), elapsedMs: 0, error: '', active: true };
    let resolve!: (value: CurrentStateInspection) => void, reject!: (error: Error) => void;
    const critical = new Promise<CurrentStateInspection>((yes, no) => { resolve = yes; reject = no; });
    const worker = new Worker(this.filename, { workerData: { file, jiraIdentity } });
    const job = this.job = { key, worker, critical, resolve, reject, observation, settled: false } as NonNullable<DatabaseCompatibilityV050['job']>;
    this.state.stage = 'VALIDATING'; this.diagnostic('compatibility-critical-start', {});
    const fail = (message: string) => {
      if (this.job !== job) return;
      this.state = { ...this.state, stage: 'ERROR', error: message, active: false };
      job.reject(new Error(message)); job.settled = true;
      if (job.value) this.health({ ...job.value, status: 'UNKNOWN_ERROR', reasonCode: 'UNKNOWN_ERROR', canRead: false, canWrite: false, message });
      this.diagnostic('compatibility-failed', { reason: message });
    };
    worker.on('message', message => {
      if (this.job !== job) return;
      if (message.type === 'error') { fail(message.error); return; }
      if (observation !== compatibilityObservationV050(file) || message.observation !== observation) { fail('DATABASE_REVISION_INVALIDATED'); return; }
      const priorIdentity = job.value?.databaseId;
      job.value = { ...message.value, databaseId: message.value.databaseId || priorIdentity || '' };
      this.state.elapsedMs = message.elapsedMs;
      if (message.type === 'critical') {
        this.state.stage = job.value!.canRead ? 'CRITICAL_READY' : 'ERROR';
        job.settled = true; job.resolve(job.value!);
        this.diagnostic('compatibility-critical-end', { elapsedMs: message.elapsedMs, canRead: job.value!.canRead });
        if (job.value!.canRead) this.state.stage = 'HEALTH_CHECKING';
      } else {
        this.state.stage = job.value!.canRead ? 'READY' : 'ERROR'; this.state.active = false;
        this.health(job.value!);
        this.diagnostic('compatibility-health-end', { elapsedMs: message.elapsedMs, canRead: job.value!.canRead });
      }
    });
    worker.on('error', error => fail(error instanceof Error ? error.message : 'DATABASE_WORKER_ERROR'));
    worker.on('exit', code => { if (this.job !== job) return; this.state.active = false; if (!job.settled || code !== 0) fail('DATABASE_WORKER_EXIT_' + code); });
    return critical;
  }
  async cancel() {
    const job = this.job; if (!job || !this.state.active) return { cancelled: false };
    this.job = undefined;
    await job.worker.terminate();
    job.reject(Error('CANCELLED'));
    this.state = { ...this.state, stage: 'WARNING', error: 'CANCELLED', active: false };
    this.diagnostic('compatibility-cancelled', { criticalReady: Boolean(job.value?.canRead) });
    return { cancelled: true, criticalReady: Boolean(job.value?.canRead) };
  }
}
