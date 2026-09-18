import type { CollectionSnapshotV051, CollectionUserV051 } from '../shared/multiUserCollectionV051.js';

/** One application-session queue; retry retains accepted results and never runs users in parallel. */
export class MultiUserQueueV051<T> {
  readonly results = new Map<string, T>();
  readonly snapshot: CollectionSnapshotV051;
  private cancelAll = false;
  private cancelCurrent = false;
  constructor(readonly runId: string, readonly binding: string, users: CollectionUserV051[]) {
    this.snapshot = { runId, running: false, status: 'RUNNING', discoveredBy: {}, duplicateDiscoveryCount: 0,
      users: users.map(user => ({ ...user, status: 'PENDING', elapsedMs: 0, eventCount: 0, error: '' })) };
  }
  cancel(scope: 'current' | 'all') {
    if (!this.snapshot.running) return false;
    this.cancelCurrent = true;
    if (scope === 'all') this.cancelAll = true;
    return true;
  }
  async run(execute: (user: CollectionUserV051, cancelled: () => boolean) => Promise<{ value: T; eventCount: number; accepted: boolean }>,
    publish: (snapshot: CollectionSnapshotV051) => void, retryFailed = false) {
    if (this.snapshot.running) throw new Error('COLLECTION_ALREADY_RUNNING');
    if (retryFailed) for (const user of this.snapshot.users) if (user.status === 'FAILED') user.status = 'PENDING';
    this.cancelAll = false;
    this.snapshot.running = true;
    this.snapshot.status = 'RUNNING';
    const emit = () => publish(structuredClone(this.snapshot));
    try {
      emit();
      for (const user of this.snapshot.users) {
        if (user.status !== 'PENDING') continue;
        if (this.cancelAll) { user.status = 'SKIPPED'; emit(); continue; }
        this.cancelCurrent = false;
        user.status = 'RUNNING'; user.error = ''; user.eventCount = 0;
        const start = Date.now();
        emit();
        try {
          const result = await execute(user, () => this.cancelCurrent || this.cancelAll);
          if (this.cancelCurrent || this.cancelAll) user.status = 'CANCELLED';
          else if (!result.accepted) { user.status = 'FAILED'; user.error = 'Timeline completeness/reconciliation gate not met'; }
          else { this.results.set(user.id, result.value); user.status = 'SUCCESS'; user.eventCount = result.eventCount; }
        } catch (error) {
          user.status = this.cancelCurrent || this.cancelAll ? 'CANCELLED' : 'FAILED';
          user.error = error instanceof Error ? error.message : 'Collection failed';
        } finally { user.elapsedMs = Date.now() - start; emit(); }
      }
      const success = this.snapshot.users.filter(user => user.status === 'SUCCESS').length;
      this.snapshot.status = success === this.snapshot.users.length ? 'SUCCESS' : success ? 'PARTIAL' : this.cancelAll || this.snapshot.users.some(user => user.status === 'CANCELLED') ? 'CANCELLED' : 'FAILED';
    } finally { this.snapshot.running = false; emit(); }
    return this.snapshot;
  }
}
