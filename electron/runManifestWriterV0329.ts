import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RUN_MANIFEST_WRITER_VERSION_V0329 = "jaa-run-manifest-writer-v1" as const;
const RETRY_DELAYS_MS = [25, 75, 225, 500, 1_000] as const;
const transient = new Set(["EPERM", "EBUSY"]);
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const sleep = (milliseconds: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

export class RunManifestWriterV0329 {
  private sequence = 0;
  private writing = false;
  private readonly writerIdHash = sha256(crypto.randomUUID());
  constructor(readonly target: string, private readonly rename: typeof fs.renameSync = fs.renameSync) {}

  write(value: unknown, reason = "state_update") {
    if (this.writing) throw Object.assign(new Error("AI_RUN_MANIFEST_WRITER_REENTRY:Only one writer may update a Run manifest."), { code: "AI_RUN_MANIFEST_WRITER_REENTRY" });
    this.writing = true;
    const sequence = ++this.sequence; const queuedAt = new Date().toISOString(); const startedAt = new Date().toISOString();
    const body = JSON.stringify(value, null, 2); const temporary = `${this.target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const errors: string[] = []; let attemptCount = 0;
    try {
      fs.mkdirSync(path.dirname(this.target), { recursive: true });
      const descriptor = fs.openSync(temporary, "wx", 0o600);
      try { fs.writeFileSync(descriptor, body, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      for (;;) {
        attemptCount += 1;
        try { this.rename(temporary, this.target); break; }
        catch (error) {
          const code = String((error as NodeJS.ErrnoException).code ?? "UNKNOWN"); errors.push(code);
          const delay = RETRY_DELAYS_MS[attemptCount - 1]; if (!transient.has(code) || delay === undefined) throw error;
          sleep(delay);
        }
      }
      if (sha256(fs.readFileSync(this.target, "utf8")) !== sha256(body)) throw Object.assign(new Error("AI_RUN_MANIFEST_HASH_MISMATCH"), { code: "AI_RUN_MANIFEST_HASH_MISMATCH" });
      this.event({ sequence, reason, queuedAt, startedAt, completedAt: new Date().toISOString(), attemptCount, transientErrorCodes: errors, status: "completed" });
      return { sequence, attemptCount, transientErrorCodes: errors };
    } catch (error) {
      this.event({ sequence, reason, queuedAt, startedAt, completedAt: new Date().toISOString(), attemptCount, transientErrorCodes: errors, status: "failed", errorCode: String((error as NodeJS.ErrnoException).code ?? "AI_RUN_MANIFEST_WRITE_FAILED") });
      throw error;
    } finally { this.writing = false; }
  }

  private event(value: Record<string, unknown>) {
    const target = path.join(path.dirname(this.target), "debug", "run-manifest-write-events.jsonl"); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, JSON.stringify({ writerIdHash: this.writerIdHash, ...value }) + "\n", "utf8");
  }
}
