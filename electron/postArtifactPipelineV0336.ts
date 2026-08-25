import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const POST_ARTIFACT_PIPELINE_VERSION_V0336 = "jaa-post-artifact-pipeline-v1" as const;
export const POST_ARTIFACT_STAGES_V0336 = ["CONTENT_VALIDATE", "FORMAL_PUBLISH", "CANONICAL_ASSEMBLY", "ANALYZED_RESULT_PUBLISH", "ACTIVE_RESULT_COMMIT", "REPORT_DATA_PACKAGE", "HTML_RENDER", "SQLITE_GATE"] as const;
export type PostArtifactStageV0336 = typeof POST_ARTIFACT_STAGES_V0336[number];
type StageReceipt = { stage: PostArtifactStageV0336; outcome: "PASSED" | "FAILED" | "NOT_RUN_BY_TEST_ISOLATION"; evidencePath: string | null; evidenceSha256: string | null; completedAtUtc: string };

export class PostArtifactPipelineV0336 {
  readonly idempotencyKey: string;
  private readonly receiptPath: string;
  private receipts: StageReceipt[] = [];
  constructor(readonly runDirectory: string, readonly runId: string, readonly artifactSha256: string) {
    this.idempotencyKey = crypto.createHash("sha256").update(`${runId}:${artifactSha256}`).digest("hex");
    this.receiptPath = path.join(runDirectory, "progress", "post-artifact-pipeline.json");
    try { const stored = JSON.parse(fs.readFileSync(this.receiptPath, "utf8")); if (stored.idempotencyKey === this.idempotencyKey) this.receipts = stored.receipts ?? []; } catch { /* New pipeline. */ }
  }
  completed(stage: PostArtifactStageV0336) { return this.receipts.find((entry) => entry.stage === stage && entry.outcome === "PASSED") ?? null; }
  runStage(stage: PostArtifactStageV0336, action: () => { evidencePath?: string | null; evidenceSha256?: string | null }, isolation = false) {
    const existing = this.receipts.find((entry) => entry.stage === stage && (entry.outcome === "PASSED" || entry.outcome === "NOT_RUN_BY_TEST_ISOLATION"));
    if (existing) return existing;
    const priorStages = POST_ARTIFACT_STAGES_V0336.slice(0, POST_ARTIFACT_STAGES_V0336.indexOf(stage));
    if (priorStages.some((prior) => !this.receipts.some((entry) => entry.stage === prior && (entry.outcome === "PASSED" || entry.outcome === "NOT_RUN_BY_TEST_ISOLATION")))) throw new Error(`POST_ARTIFACT_STAGE_ORDER_INVALID:${stage}`);
    if (isolation) return this.append({ stage, outcome: "NOT_RUN_BY_TEST_ISOLATION", evidencePath: null, evidenceSha256: null, completedAtUtc: new Date().toISOString() });
    try { const evidence = action(); return this.append({ stage, outcome: "PASSED", evidencePath: evidence.evidencePath ?? null, evidenceSha256: evidence.evidenceSha256 ?? null, completedAtUtc: new Date().toISOString() }); }
    catch (error) { this.append({ stage, outcome: "FAILED", evidencePath: null, evidenceSha256: null, completedAtUtc: new Date().toISOString() }); throw error; }
  }
  snapshot() { return Object.freeze({ schemaVersion: POST_ARTIFACT_PIPELINE_VERSION_V0336, runId: this.runId, artifactSha256: this.artifactSha256, idempotencyKey: this.idempotencyKey, receipts: structuredClone(this.receipts), nextStage: POST_ARTIFACT_STAGES_V0336.find((stage) => !this.receipts.some((entry) => entry.stage === stage && (entry.outcome === "PASSED" || entry.outcome === "NOT_RUN_BY_TEST_ISOLATION"))) ?? null }); }
  private append(receipt: StageReceipt) { this.receipts.push(receipt); fs.mkdirSync(path.dirname(this.receiptPath), { recursive: true }); const tmp = `${this.receiptPath}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(this.snapshot(), null, 2) + "\n", "utf8"); const fd = fs.openSync(tmp, "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(tmp, this.receiptPath); return receipt; }
}
