import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { VALIDATION_STAGES_V0332, type ValidationStageV0332 } from "./analysisValidationTruthV0332.js";

export const VALIDATION_STAGE_RECEIPT_VERSION_V0335 = "jaa-validation-stage-receipt-v2" as const;
export type ValidationOutcomeV0335 =
  | "PASSED" | "WARNING" | "FAILED" | "NOT_RUN_DUE_TO_PRIOR_FAILURE"
  | "BLOCKED_BY_PRIOR_STAGE" | "BLOCKED_PENDING_WARNING_ACCEPTANCE" | "NOT_RUN_BY_TEST_ISOLATION";

type DurableEvidence = { path: string; bytes: number; sha256: string; receiptId?: string | null };
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

function atomicJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = JSON.stringify(value, null, 2) + "\n";
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, content, "utf8"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, filePath);
  return filePath;
}

function verifyEvidence(evidence: DurableEvidence | null | undefined) {
  if (!evidence) return null;
  const bytes = fs.readFileSync(evidence.path);
  if (bytes.length !== evidence.bytes || sha256(bytes) !== evidence.sha256) {
    throw Object.assign(new Error(`AI_VALIDATION_EVIDENCE_MISMATCH:${evidence.path}`), { code: "AI_VALIDATION_EVIDENCE_MISMATCH" });
  }
  return { ...evidence, path: path.resolve(evidence.path), reopenVerified: true };
}

export function writeValidationStageReceiptsV0335(input: {
  runDirectory: string;
  inputHash: string;
  outcomes: Partial<Record<ValidationStageV0332, ValidationOutcomeV0335>>;
  rootErrorCode?: string | null;
  findings?: Array<{ stage?: string; code?: string }>;
  reasons?: Partial<Record<ValidationStageV0332, string>>;
  evidence?: Partial<Record<ValidationStageV0332, DurableEvidence>>;
  completedAtUtc?: string;
}) {
  const at = input.completedAtUtc ?? new Date().toISOString();
  let priorFailure: ValidationStageV0332 | null = null;
  const receipts = VALIDATION_STAGES_V0332.map((stage, index) => {
    let outcome = input.outcomes[stage] ?? (priorFailure ? "NOT_RUN_DUE_TO_PRIOR_FAILURE" : "BLOCKED_BY_PRIOR_STAGE");
    if (priorFailure && outcome === "PASSED") outcome = "NOT_RUN_DUE_TO_PRIOR_FAILURE";
    const durableEvidence = verifyEvidence(input.evidence?.[stage]);
    if (outcome === "PASSED" && index >= 8 && !durableEvidence) {
      throw Object.assign(new Error(`AI_VALIDATION_PASS_WITHOUT_EVIDENCE:${stage}`), { code: "AI_VALIDATION_PASS_WITHOUT_EVIDENCE", stage });
    }
    if (outcome === "FAILED" && !priorFailure) priorFailure = stage;
    const executed = ["PASSED", "WARNING", "FAILED"].includes(outcome);
    const stageFindings = (input.findings ?? []).filter((finding) => finding.stage === stage || stage === "QUALITY_GATE" && ["QUALITY", "QUALITY_GATE"].includes(String(finding.stage)));
    const receipt = {
      schemaVersion: VALIDATION_STAGE_RECEIPT_VERSION_V0335,
      sequence: index + 1,
      stage,
      scope: "FORMAL" as const,
      startedAt: executed ? at : null,
      completedAt: executed ? at : null,
      outcome,
      inputHash: executed ? input.inputHash : null,
      findingsCount: stageFindings.length,
      findingsHash: sha256(JSON.stringify(stageFindings)),
      reason: input.reasons?.[stage] ?? null,
      blockedByStage: ["NOT_RUN_DUE_TO_PRIOR_FAILURE", "BLOCKED_BY_PRIOR_STAGE"].includes(outcome) ? priorFailure : outcome === "BLOCKED_PENDING_WARNING_ACCEPTANCE" ? "QUALITY_GATE" : null,
      rootErrorCode: outcome === "FAILED" || outcome === "NOT_RUN_DUE_TO_PRIOR_FAILURE" ? input.rootErrorCode ?? null : null,
      durableEvidence
    };
    atomicJson(path.join(input.runDirectory, "validation-stage-receipts", `${String(index + 1).padStart(2, "0")}-${stage.toLowerCase()}.json`), receipt);
    return receipt;
  });
  const firstFailedValidationStage = receipts.find((receipt) => receipt.outcome === "FAILED")?.stage ?? null;
  atomicJson(path.join(input.runDirectory, "first-failed-validation-stage.json"), {
    schemaVersion: "jaa-first-failed-validation-stage-v1",
    firstFailedValidationStage,
    rootErrorCode: input.rootErrorCode ?? null,
    generatedAtUtc: at
  });
  return { receipts, firstFailedValidationStage };
}
