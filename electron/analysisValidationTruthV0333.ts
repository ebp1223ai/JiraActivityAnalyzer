import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { VALIDATION_STAGES_V0332, type ValidationStageV0332 } from "./analysisValidationTruthV0332.js";

export const VALIDATION_STAGE_RECEIPT_VERSION_V0333 = "jaa-validation-stage-receipt-v2" as const;
export type ValidationOutcomeV0333 = "PASSED" | "WARNING" | "FAILED" | "NOT_RUN_DUE_TO_PRIOR_FAILURE" | "BLOCKED_PENDING_WARNING_ACCEPTANCE";
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const atomicJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = JSON.stringify(value, null, 2) + "\n";
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
  return filePath;
};

export function writeValidationStageReceiptsV0333(input: {
  runDirectory: string;
  inputHash: string;
  failedStage: ValidationStageV0332 | null;
  rootErrorCode: string | null;
  findings?: Array<{ stage?: string; code?: string }>;
  warningStages?: ValidationStageV0332[];
  blockedPendingAcceptanceStages?: ValidationStageV0332[];
  stageReasons?: Partial<Record<ValidationStageV0332, string>>;
  completedAtUtc?: string;
}) {
  const at = input.completedAtUtc ?? new Date().toISOString();
  const failedIndex = input.failedStage ? VALIDATION_STAGES_V0332.indexOf(input.failedStage) : -1;
  const warningStages = new Set(input.warningStages ?? []);
  const blockedStages = new Set(input.blockedPendingAcceptanceStages ?? []);
  const receipts = VALIDATION_STAGES_V0332.map((stage, index) => {
    const outcome: ValidationOutcomeV0333 = failedIndex >= 0
      ? index < failedIndex ? "PASSED" : index === failedIndex ? "FAILED" : "NOT_RUN_DUE_TO_PRIOR_FAILURE"
      : blockedStages.has(stage) ? "BLOCKED_PENDING_WARNING_ACCEPTANCE"
      : warningStages.has(stage) ? "WARNING" : "PASSED";
    const executed = outcome !== "NOT_RUN_DUE_TO_PRIOR_FAILURE" && outcome !== "BLOCKED_PENDING_WARNING_ACCEPTANCE";
    const stageFindings = (input.findings ?? []).filter((finding) => finding.stage === stage || stage === "QUALITY_GATE" && ["QUALITY", "QUALITY_GATE"].includes(String(finding.stage)));
    const reason = input.stageReasons?.[stage]
      ?? (outcome === "FAILED" ? `${stage} blocked formal validation.`
        : outcome === "NOT_RUN_DUE_TO_PRIOR_FAILURE" ? `Not run because ${input.failedStage} failed.`
        : outcome === "BLOCKED_PENDING_WARNING_ACCEPTANCE" ? "Quality WARNING requires durable user acceptance before SQLite."
        : outcome === "WARNING" ? `${stage} completed with structured findings.` : null);
    const receipt = {
      schemaVersion: VALIDATION_STAGE_RECEIPT_VERSION_V0333,
      sequence: index + 1,
      stage,
      startedAt: executed ? at : null,
      completedAt: executed ? at : null,
      outcome,
      inputHash: executed ? input.inputHash : null,
      findingsCount: stageFindings.length,
      findingsHash: sha256(JSON.stringify(stageFindings)),
      reason,
      blockedByStage: outcome === "NOT_RUN_DUE_TO_PRIOR_FAILURE" ? input.failedStage : outcome === "BLOCKED_PENDING_WARNING_ACCEPTANCE" ? "QUALITY_GATE" : null,
      rootErrorCode: ["FAILED", "NOT_RUN_DUE_TO_PRIOR_FAILURE"].includes(outcome) ? input.rootErrorCode : null
    };
    atomicJson(path.join(input.runDirectory, "validation-stage-receipts", `${String(index + 1).padStart(2, "0")}-${stage.toLowerCase()}.json`), receipt);
    return receipt;
  });
  const firstFailedValidationStage = receipts.find((receipt) => receipt.outcome === "FAILED")?.stage ?? null;
  atomicJson(path.join(input.runDirectory, "first-failed-validation-stage.json"), { schemaVersion: "jaa-first-failed-validation-stage-v1", firstFailedValidationStage, rootErrorCode: input.rootErrorCode, generatedAtUtc: at });
  return { receipts, firstFailedValidationStage };
}
