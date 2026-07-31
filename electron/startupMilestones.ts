export type StartupMilestoneName = "Process Start" | "BrowserWindow Created" | "Renderer DOM Ready" | "First Paint" | "Shell Visible" | "Database Ready" | "Initial Route Ready" | "App Interactive";
export type StartupMilestone = { name: StartupMilestoneName; timestamp: string; elapsedMs: number; detail?: string };

export class StartupMilestoneRecorder {
  private readonly startedAt = Date.now();
  private readonly milestones = new Map<StartupMilestoneName, StartupMilestone>();
  constructor() { this.mark("Process Start"); }
  mark(name: StartupMilestoneName, detail?: string) {
    if (this.milestones.has(name)) return this.snapshot();
    this.milestones.set(name, { name, timestamp: new Date().toISOString(), elapsedMs: Date.now() - this.startedAt, ...(detail ? { detail } : {}) });
    return this.snapshot();
  }
  snapshot() { return { startedAt: new Date(this.startedAt).toISOString(), milestones: [...this.milestones.values()] }; }
}