import fs from "node:fs";
import path from "node:path";
import type { AiAnalysisRun } from "../shared/aiAnalysisContract.js";
import { evaluateSystemicNoResultGateV0329 } from "./systemicNoResultGateV0329.js";

export const QUARANTINE_VERSION_V0329 = "jaa-systemic-no-result-quarantine-v1" as const;

export function revalidateRunForQuarantineV0329(run: AiAnalysisRun) {
  if (!run.runDirectory || !["completed", "completed_with_quality_warnings", "completed_with_persistence_error"].includes(run.status)) return run;
  const decisionsPath = path.join(run.runDirectory, "ai-output", "ai-analysis-decisions.json"); if (!fs.existsSync(decisionsPath)) return run;
  try {
    const parsed = JSON.parse(fs.readFileSync(decisionsPath, "utf8")); const decisions = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.decisions) ? parsed.decisions : [];
    const gate = evaluateSystemicNoResultGateV0329(decisions, { decisionSha256: null, sourceDatasetSha256: run.sourceFileSha256, quoteCatalogSha256: run.evidenceSegmentCatalogSha256 ?? null });
    if (gate.decision === "BLOCKED") { run.quarantineStatus = "QUARANTINED_SYSTEMIC_NO_RESULT"; run.quarantineReasonCode = gate.reasonCode; run.quarantineGateReportSha256 = gate.reportSha256; }
    return run;
  } catch { return run; }
}