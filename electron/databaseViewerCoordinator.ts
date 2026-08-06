import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ViewerWorkerOperation } from "./databaseViewerWorker.js";

export type ViewerWorkerLane = "database" | "database-table" | "database-distributions" | "issue" | "issue-table" | "user-directory" | "user" | "user-distributions" | "detail" | "distinct";
type PendingTask = {
  operation: ViewerWorkerOperation;
  databasePath: string;
  args: unknown[];
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
type ActiveTask = PendingTask & { id: number; timer: ReturnType<typeof setTimeout> };

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

  constructor(private readonly workerPath: string, private readonly timeoutMs: number) {}

  run(operation: ViewerWorkerOperation, databasePath: string, args: unknown[]) {
    return new Promise<unknown>((resolve, reject) => {
      const task: PendingTask = { operation, databasePath: path.resolve(databasePath), args, resolve, reject };
      if (this.databasePath && this.databasePath !== task.databasePath) this.reset("VIEWER_DATABASE_SWITCHED");
      this.databasePath = task.databasePath;
      if (!this.active) this.start(task);
      else {
        this.pending?.reject(typedError("VIEWER_REQUEST_SUPERSEDED"));
        this.pending = task;
      }
    });
  }

  snapshot() { return { active: this.active ? 1 : 0, pending: this.pending ? 1 : 0, databasePath: this.databasePath }; }

  close() { return this.reset("VIEWER_COORDINATOR_CLOSED"); }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerPath);
    worker.on("message", (response: { id: number; ok: boolean; value?: unknown; error?: { code?: string; message?: string } }) => {
      if (!this.active || response.id !== this.active.id) return;
      const active = this.active;
      clearTimeout(active.timer);
      this.active = null;
      if (response.ok) active.resolve(response.value);
      else active.reject(typedError(response.error?.code ?? "VIEWER_WORKER_QUERY_FAILED", response.error?.message));
      this.drain();
    });
    worker.on("error", (error: Error) => this.failWorker("VIEWER_WORKER_CRASHED", error.message));
    worker.on("exit", (code) => { if (code !== 0 && this.worker === worker) this.failWorker("VIEWER_WORKER_EXITED", `Viewer worker exited with code ${code}.`); });
    this.worker = worker;
    return worker;
  }

  private start(task: PendingTask) {
    const id = ++this.sequence;
    const timer = setTimeout(() => {
      if (!this.active || this.active.id !== id) return;
      const active = this.active;
      this.active = null;
      active.reject(typedError("VIEWER_WORKER_TIMEOUT", `Viewer query exceeded ${this.timeoutMs} ms.`));
      void this.worker?.terminate();
      this.worker = null;
      this.drain();
    }, this.timeoutMs);
    this.active = { ...task, id, timer };
    this.ensureWorker().postMessage({ id, operation: task.operation, databasePath: task.databasePath, args: task.args });
  }

  private drain() {
    const next = this.pending;
    this.pending = null;
    if (next) this.start(next);
  }

  private failWorker(code: string, message: string) {
    const active = this.active;
    this.active = null;
    if (active) { clearTimeout(active.timer); active.reject(typedError(code, message)); }
    this.worker = null;
    this.drain();
  }

  private reset(code: string) {
    const active = this.active;
    const pending = this.pending;
    this.active = null;
    this.pending = null;
    if (active) { clearTimeout(active.timer); active.reject(typedError(code)); }
    pending?.reject(typedError(code));
    const worker = this.worker;
    this.worker = null;
    this.databasePath = "";
    return worker ? worker.terminate().then(() => undefined).catch(() => undefined) : Promise.resolve();
  }
}

export class DatabaseViewerCoordinator {
  private readonly lanes = new Map<ViewerWorkerLane, LaneCoordinator>();
  constructor(private readonly workerPath: string, private readonly timeoutMs = 20_000) {}
  run(lane: ViewerWorkerLane, operation: ViewerWorkerOperation, databasePath: string, ...args: unknown[]) {
    let coordinator = this.lanes.get(lane);
    if (!coordinator) {
      coordinator = new LaneCoordinator(this.workerPath, this.timeoutMs);
      this.lanes.set(lane, coordinator);
    }
    return coordinator.run(operation, databasePath, args);
  }
  snapshot() { return Object.fromEntries(Array.from(this.lanes, ([lane, coordinator]) => [lane, coordinator.snapshot()])); }
  close() {
    const closing = Array.from(this.lanes.values(), (coordinator) => coordinator.close());
    this.lanes.clear();
    return Promise.all(closing).then(() => undefined);
  }
}
