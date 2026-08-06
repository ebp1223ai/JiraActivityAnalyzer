import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ProgressiveCheckpoint, ProgressiveCheckpointDelta, ViewerProgressDto } from "./databaseViewer.js";
import type { ViewerWorkerOperation } from "./databaseViewerWorker.js";

export type ViewerWorkerLane = "database" | "database-table" | "database-distributions" | "issue" | "issue-table" | "user-directory" | "user" | "user-distributions" | "detail" | "distinct";
type PendingTask = {
  operation: ViewerWorkerOperation;
  databasePath: string;
  args: unknown[];
  requestId: string;
  onProgress?: (progress: ViewerProgressDto) => void;
  progressive: boolean;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
type ActiveTask = PendingTask & {
  id: number;
  timer: ReturnType<typeof setTimeout>;
  recoveryAttempts: number;
  settled: boolean;
  cancelReason?: "VIEWER_REQUEST_CANCELLED" | "VIEWER_REQUEST_SUPERSEDED";
  recoveryCheckpoint?: ProgressiveCheckpoint;
};

export const VIEWER_NO_PROGRESS_MS = 30_000;

function typedError(code: string, message = code) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

class LaneCoordinator {
  private worker: Worker | null = null;
  private active: ActiveTask | null = null;
  private pending: PendingTask | null = null;
  private sequence = 0;
  private databasePath = "";

  constructor(private readonly workerPath: string, private readonly noProgressMs: number) {}

  run(operation: ViewerWorkerOperation, databasePath: string, args: unknown[], requestId: string, onProgress?: (progress: ViewerProgressDto) => void, progressive = false) {
    return new Promise<unknown>((resolve, reject) => {
      const task: PendingTask = { operation, databasePath: path.resolve(databasePath), args, requestId, onProgress, progressive, resolve, reject };
      if (this.databasePath && this.databasePath !== task.databasePath) this.reset("VIEWER_DATABASE_SWITCHED");
      this.databasePath = task.databasePath;
      if (!this.active) this.start(task);
      else {
        this.pending?.reject(typedError("VIEWER_REQUEST_SUPERSEDED"));
        this.pending = task;
        if (this.active.progressive) {
          this.active.cancelReason = "VIEWER_REQUEST_SUPERSEDED";
          this.worker?.postMessage({ type: "cancel", id: this.active.id, requestId: this.active.requestId });
        }
      }
    });
  }

  cancel(requestId: string) {
    if (this.pending?.requestId === requestId) {
      const pending = this.pending;
      this.pending = null;
      pending.reject(typedError("VIEWER_REQUEST_CANCELLED"));
      return true;
    }
    if (this.active?.requestId !== requestId) return false;
    this.active.cancelReason = "VIEWER_REQUEST_CANCELLED";
    this.worker?.postMessage({ type: "cancel", id: this.active.id, requestId });
    return true;
  }

  snapshot() { return { active: this.active ? 1 : 0, pending: this.pending ? 1 : 0, databasePath: this.databasePath }; }
  close() { return this.reset("VIEWER_COORDINATOR_CLOSED"); }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerPath);
    worker.on("message", (response: { type?: string; id: number; ok?: boolean; value?: unknown; progress?: ViewerProgressDto; checkpoint?: ProgressiveCheckpointDelta; error?: { code?: string; message?: string } }) => {
      if (!this.active || response.id !== this.active.id) return;
      if (response.type === "checkpoint" && response.checkpoint) {
        const previous = this.active.recoveryCheckpoint?.matching ?? [];
        this.active.recoveryCheckpoint = { cursor: response.checkpoint.cursor, scanned: response.checkpoint.scanned, elapsedMs: response.checkpoint.elapsedMs, matching: [...previous, ...response.checkpoint.matches] };
        this.armWatchdog(this.active);
        return;
      }
      if (response.type === "progress" && response.progress) {
        this.armWatchdog(this.active);
        if (!this.active.settled) this.active.onProgress?.(response.progress);
        return;
      }
      const active = this.active;
      clearTimeout(active.timer);
      this.active = null;
      if (!active.settled) {
        active.settled = true;
        if (response.ok) active.resolve(response.value);
        else {
          const code = response.error?.code === "VIEWER_REQUEST_CANCELLED" && active.cancelReason
            ? active.cancelReason
            : response.error?.code ?? "VIEWER_WORKER_QUERY_FAILED";
          active.reject(typedError(code, code === active.cancelReason ? code : response.error?.message));
        }
      }
      this.drain();
    });
    worker.on("error", (error: Error) => { if (this.worker === worker) this.recoverOrFail("VIEWER_WORKER_CRASHED", error.message); });
    worker.on("exit", (code) => { if (code !== 0 && this.worker === worker) this.recoverOrFail("VIEWER_WORKER_EXITED", `Viewer worker exited with code ${code}.`); });
    this.worker = worker;
    return worker;
  }

  private start(task: PendingTask, recoveryAttempts = 0, recoveryCheckpoint?: ProgressiveCheckpoint) {
    const active = { ...task, id: ++this.sequence, timer: undefined as unknown as ReturnType<typeof setTimeout>, recoveryAttempts, settled: false, recoveryCheckpoint };
    this.active = active;
    this.armWatchdog(active);
    this.ensureWorker().postMessage({ type: "run", id: active.id, requestId: active.requestId, operation: active.operation, databasePath: active.databasePath, args: active.args, batchSize: recoveryAttempts ? 50 : undefined, resume: recoveryCheckpoint });
  }

  private armWatchdog(active: ActiveTask) {
    if (active.timer) clearTimeout(active.timer);
    active.timer = setTimeout(() => {
      if (this.active !== active) return;
      this.recoverOrFail("VIEWER_WORKER_STALLED", `Viewer worker made no progress for ${this.noProgressMs} ms.`);
    }, this.noProgressMs);
  }

  private recoverOrFail(code: string, message: string) {
    const active = this.active;
    if (!active) return;
    clearTimeout(active.timer);
    const worker = this.worker;
    this.worker = null;
    if (active.recoveryAttempts < 1 && !active.settled) {
      this.active = null;
      void worker?.terminate().finally(() => this.start(active, active.recoveryAttempts + 1, active.recoveryCheckpoint));
      return;
    }
    this.active = null;
    if (!active.settled) {
      active.settled = true;
      active.reject(typedError(code, `${message} Retry is available.`));
    }
    void worker?.terminate();
    this.drain();
  }

  private drain() {
    const next = this.pending;
    this.pending = null;
    if (next) this.start(next);
  }

  private reset(code: string) {
    const active = this.active;
    const pending = this.pending;
    this.active = null;
    this.pending = null;
    if (active) {
      clearTimeout(active.timer);
      if (!active.settled) active.reject(typedError(code));
    }
    pending?.reject(typedError(code));
    const worker = this.worker;
    this.worker = null;
    this.databasePath = "";
    return worker ? worker.terminate().then(() => undefined).catch(() => undefined) : Promise.resolve();
  }
}

export class DatabaseViewerCoordinator {
  private readonly lanes = new Map<ViewerWorkerLane, LaneCoordinator>();
  constructor(private readonly workerPath: string, private readonly noProgressMs = VIEWER_NO_PROGRESS_MS) {}
  private lane(value: ViewerWorkerLane) {
    let coordinator = this.lanes.get(value);
    if (!coordinator) {
      coordinator = new LaneCoordinator(this.workerPath, this.noProgressMs);
      this.lanes.set(value, coordinator);
    }
    return coordinator;
  }
  run(lane: ViewerWorkerLane, operation: ViewerWorkerOperation, databasePath: string, ...args: unknown[]) {
    return this.lane(lane).run(operation, databasePath, args, `viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
  runProgressive(lane: ViewerWorkerLane, operation: ViewerWorkerOperation, databasePath: string, requestId: string, onProgress: (progress: ViewerProgressDto) => void, ...args: unknown[]) {
    return this.lane(lane).run(operation, databasePath, args, requestId, onProgress, true);
  }
  cancel(lane: ViewerWorkerLane, requestId: string) { return this.lanes.get(lane)?.cancel(requestId) ?? false; }
  snapshot() { return Object.fromEntries(Array.from(this.lanes, ([lane, coordinator]) => [lane, coordinator.snapshot()])); }
  close() {
    const closing = Array.from(this.lanes.values(), (coordinator) => coordinator.close());
    this.lanes.clear();
    return Promise.all(closing).then(() => undefined);
  }
}
