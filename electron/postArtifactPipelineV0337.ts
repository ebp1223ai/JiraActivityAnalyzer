import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { durableWriteJsonV0337, sha256BytesV0337, verifyFileV0337 } from "./durableIoV0337.js";
import { ReducerFactJournalV0337 } from "./reducerFactJournalV0337.js";

export const POST_ARTIFACT_PIPELINE_VERSION_V0337 = "jaa-post-artifact-pipeline-v1" as const;
export const POST_ARTIFACT_STAGES_V0337 = ["TOKEN_BINDING", "SUBMISSION_DECODE", "DECISION_SCHEMA", "COUNT_INDEX_ORDER", "EVIDENCE_QUOTE_REFERENCE", "SOURCE_ROLE_ATTRIBUTION", "STATUS_SEMANTIC", "QUALITY_GATE", "CANONICAL_ASSEMBLY", "ANALYZED_RESULT_PUBLISH", "ACTIVE_RESULT_COMMIT", "REPORT_PACKAGE", "HTML_RENDER", "SQLITE"] as const;
export type PostArtifactStageV0337 = typeof POST_ARTIFACT_STAGES_V0337[number];
export type StageOutcomeV0337 = "PASSED" | "FAILED" | "NOT_RUN_DUE_TO_PRIOR_FAILURE" | "NOT_RUN_BY_TEST_ISOLATION";
export type StageActionResultV0337 = { evidencePath?: string | null; evidenceSha256?: string | null; nonSensitiveDetails?: Record<string, unknown> };
export type StageReceiptV0337 = Readonly<{ schemaVersion: "jaa-post-artifact-stage-receipt-v1"; stage: PostArtifactStageV0337; outcome: StageOutcomeV0337; idempotencyKey: string; artifactSha256: string; evidencePath: string | null; evidenceSha256: string | null; completedAtUtc: string; rootErrorCode: string | null; nonSensitiveDetails: Record<string, unknown> }>;

export class PostArtifactPipelineV0337 {
  readonly pipelineKey: string;
  private readonly receiptsDirectory: string;
  private readonly journal: ReducerFactJournalV0337;
  constructor(readonly runDirectory: string, readonly runId: string, readonly artifactSha256: string) {
    this.pipelineKey = sha256BytesV0337(`${runId}:${artifactSha256}`);
    this.receiptsDirectory = path.join(runDirectory, "progress", "post-artifact-stages");
    this.journal = new ReducerFactJournalV0337(runDirectory, runId);
  }
  receipt(stage: PostArtifactStageV0337): StageReceiptV0337 | null {
    const receiptPath = this.receiptPath(stage);
    if (!fs.existsSync(receiptPath)) return null;
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as StageReceiptV0337;
    if (receipt.idempotencyKey !== this.stageKey(stage) || receipt.artifactSha256 !== this.artifactSha256) throw Object.assign(new Error(`POST_ARTIFACT_RECEIPT_BINDING_MISMATCH:${stage}`), { code: "POST_ARTIFACT_RECEIPT_BINDING_MISMATCH", stage });
    if (receipt.evidencePath && receipt.evidenceSha256) {
      const body = fs.readFileSync(receipt.evidencePath);
      if (sha256BytesV0337(body) !== receipt.evidenceSha256) throw Object.assign(new Error(`POST_ARTIFACT_EVIDENCE_HASH_MISMATCH:${stage}`), { code: "POST_ARTIFACT_EVIDENCE_HASH_MISMATCH", stage });
    }
    return receipt;
  }
  runStage(stage: PostArtifactStageV0337, action: () => StageActionResultV0337, isolation = false): StageReceiptV0337 {
    const existing = this.receipt(stage);
    if (existing && ["PASSED", "NOT_RUN_BY_TEST_ISOLATION"].includes(existing.outcome)) return existing;
    const index = POST_ARTIFACT_STAGES_V0337.indexOf(stage);
    const prior = POST_ARTIFACT_STAGES_V0337.slice(0, index).map((item) => this.receipt(item));
    const failedPrior = prior.find((item) => item?.outcome === "FAILED" || item?.outcome === "NOT_RUN_DUE_TO_PRIOR_FAILURE");
    if (failedPrior) return this.writeReceipt(stage, "NOT_RUN_DUE_TO_PRIOR_FAILURE", {}, `PRIOR_STAGE_FAILED:${failedPrior.stage}`);
    if (prior.some((item) => !item)) throw Object.assign(new Error(`POST_ARTIFACT_STAGE_ORDER_INVALID:${stage}`), { code: "POST_ARTIFACT_STAGE_ORDER_INVALID", stage });
    if (isolation) return this.writeReceipt(stage, "NOT_RUN_BY_TEST_ISOLATION", {}, null);
    try {
      const result = action();
      if (result.evidencePath) {
        const bytes = fs.readFileSync(result.evidencePath); const observed = sha256BytesV0337(bytes);
        if (result.evidenceSha256 && result.evidenceSha256 !== observed) throw new Error(`POST_ARTIFACT_EVIDENCE_HASH_MISMATCH:${stage}`);
        result.evidenceSha256 = observed;
      }
      return this.writeReceipt(stage, "PASSED", result, null);
    } catch (error) {
      const code = String((error as { code?: string }).code ?? (error instanceof Error ? error.message : error));
      this.writeReceipt(stage, "FAILED", {}, code);
      throw error;
    }
  }
  runAll(actions: Partial<Record<PostArtifactStageV0337, () => StageActionResultV0337>>, options: { sqliteIsolation?: boolean } = {}) {
    let failure: unknown = null;
    for (const stage of POST_ARTIFACT_STAGES_V0337) {
      try { this.runStage(stage, actions[stage] ?? (() => ({})), stage === "SQLITE" && options.sqliteIsolation === true); }
      catch (error) { failure ??= error; }
    }
    const snapshot = this.snapshot();
    if (failure) throw Object.assign(failure instanceof Error ? failure : new Error(String(failure)), { pipelineSnapshot: snapshot });
    return snapshot;
  }
  completeFailure(error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const stage of POST_ARTIFACT_STAGES_V0337) {
      if (this.receipt(stage)) continue;
      try { this.runStage(stage, () => { throw failure; }); } catch { /* The failed receipt is the durable outcome. */ }
    }
    return this.snapshot();
  }  snapshot() {
    const receipts = POST_ARTIFACT_STAGES_V0337.map((stage) => this.receipt(stage)).filter((value): value is StageReceiptV0337 => Boolean(value));
    return Object.freeze({ schemaVersion: POST_ARTIFACT_PIPELINE_VERSION_V0337, runId: this.runId, artifactSha256: this.artifactSha256, pipelineKey: this.pipelineKey, receipts, nextStage: POST_ARTIFACT_STAGES_V0337.find((stage) => !receipts.some((item) => item.stage === stage)) ?? null, completed: receipts.length === POST_ARTIFACT_STAGES_V0337.length && receipts.every((item) => item.outcome === "PASSED" || item.outcome === "NOT_RUN_BY_TEST_ISOLATION") });
  }
  private stageKey(stage: PostArtifactStageV0337) { return sha256BytesV0337(`${this.runId}:${this.artifactSha256}:${stage}`); }
  private receiptPath(stage: PostArtifactStageV0337) { return path.join(this.receiptsDirectory, `${String(POST_ARTIFACT_STAGES_V0337.indexOf(stage) + 1).padStart(2, "0")}-${stage.toLowerCase()}.json`); }
  private writeReceipt(stage: PostArtifactStageV0337, outcome: StageOutcomeV0337, result: StageActionResultV0337, rootErrorCode: string | null) {
    const receipt: StageReceiptV0337 = Object.freeze({ schemaVersion: "jaa-post-artifact-stage-receipt-v1", stage, outcome, idempotencyKey: this.stageKey(stage), artifactSha256: this.artifactSha256, evidencePath: result.evidencePath ?? null, evidenceSha256: result.evidenceSha256 ?? null, completedAtUtc: new Date().toISOString(), rootErrorCode, nonSensitiveDetails: result.nonSensitiveDetails ?? {} });
    const target = this.receiptPath(stage); const written = durableWriteJsonV0337(target, receipt); verifyFileV0337(target, written.bytes, written.sha256);
    this.journal.append("POST_ARTIFACT_STAGE_COMPLETED", "post-artifact-pipeline-v0337", { stage, outcome, receiptPath: target, receiptSha256: written.sha256 });
    return receipt;
  }
}
