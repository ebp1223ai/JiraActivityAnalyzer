import fs from "node:fs";
import type { FullFetchAttempt } from "./fullFetchEligibility.js";

export type FullFetchRunIdentity = {
  attemptId: string;
  selectedTimelineRunId: string;
  fullFetchRunId: string;
  stagingId: string;
};

export type FullFetchResultRecord = {
  runId: string;
  document: Record<string, unknown>;
  savedPath: string;
  generatedAutomatically: boolean;
};

export type FullFetchRunRecord = FullFetchRunIdentity & {
  stagingDir: string;
  attempt: FullFetchAttempt;
  result: FullFetchResultRecord | null;
};

const normalize = (value: unknown) => String(value ?? "").trim();

function assertIdentity(actual: FullFetchRunIdentity, expected: FullFetchRunIdentity) {
  for (const key of ["attemptId", "selectedTimelineRunId", "fullFetchRunId", "stagingId"] as const) {
    if (!normalize(actual[key]) || normalize(actual[key]) !== normalize(expected[key])) {
      throw new Error("FULL_FETCH_IDENTITY_MISMATCH: " + key + " does not identify the requested Full Fetch run.");
    }
  }
}

export class FullFetchRunRegistry {
  private readonly attempts = new Map<string, FullFetchAttempt>();
  private readonly byRunId = new Map<string, FullFetchRunRecord>();
  private readonly runIdByAttemptId = new Map<string, string>();

  registerAttempt(attempt: FullFetchAttempt): FullFetchAttempt {
    this.attempts.set(attempt.attemptId, attempt);
    return attempt;
  }

  getAttempt(attemptId: string): FullFetchAttempt | null {
    return this.attempts.get(normalize(attemptId)) ?? null;
  }

  attachRun(attempt: FullFetchAttempt, stagingDir: string): FullFetchRunRecord {
    this.registerAttempt(attempt);
    const identity = {
      attemptId: attempt.attemptId,
      selectedTimelineRunId: attempt.selectedTimelineRunId,
      fullFetchRunId: attempt.fullFetchRunId,
      stagingId: attempt.stagingId
    };
    if (!identity.attemptId || !identity.selectedTimelineRunId || !identity.fullFetchRunId || !identity.stagingId) {
      throw new Error("FULL_FETCH_IDENTITY_INCOMPLETE: Cannot register a Full Fetch run without its complete identity.");
    }
    const record = { ...identity, stagingDir, attempt, result: null };
    this.byRunId.set(identity.fullFetchRunId, record);
    this.runIdByAttemptId.set(identity.attemptId, identity.fullFetchRunId);
    return record;
  }

  publishTerminal(input: {
    identity: FullFetchRunIdentity;
    status: "completed" | "partial" | "failed" | "cancelled";
    countReconciliationPassed: boolean;
    issueKeyReconciliation: "MATCH" | "MISMATCH";
    result: FullFetchResultRecord | null;
    completedAt: string;
  }): FullFetchRunRecord {
    const current = this.byRunId.get(input.identity.fullFetchRunId);
    if (!current) throw new Error("FULL_FETCH_RUN_NOT_REGISTERED: The Full Fetch run was not attached to its attempt.");
    assertIdentity(current, input.identity);
    const stagingAvailable = fs.existsSync(current.stagingDir);
    const saveEligible = input.status === "completed"
      && input.countReconciliationPassed
      && input.issueKeyReconciliation === "MATCH"
      && stagingAvailable
      && input.result !== null;
    const attempt: FullFetchAttempt = {
      ...current.attempt,
      attemptStatus: input.status,
      stagingAvailable,
      stagingReference: stagingAvailable ? { stagingId: current.stagingId, fullFetchRunId: current.fullFetchRunId, stagingDir: current.stagingDir } : null,
      countReconciliation: input.countReconciliationPassed ? "PASSED" : "FAILED",
      issueKeyReconciliation: input.issueKeyReconciliation,
      saveEligible,
      completedAt: input.completedAt,
      updatedAt: input.completedAt
    };
    const next = { ...current, attempt, result: input.result };
    this.registerAttempt(attempt);
    this.byRunId.set(current.fullFetchRunId, next);
    return next;
  }

  resolve(identity: FullFetchRunIdentity): FullFetchRunRecord {
    const current = this.byRunId.get(normalize(identity.fullFetchRunId));
    if (!current) throw new Error("FULL_FETCH_RESULT_NOT_AVAILABLE: The requested Full Fetch run is not registered in this session.");
    assertIdentity(current, identity);
    return current;
  }

  resolveForSave(identity: FullFetchRunIdentity): FullFetchRunRecord {
    const current = this.resolve(identity);
    if (!fs.existsSync(current.stagingDir)) {
      throw new Error("FULL_FETCH_RESULT_STALE: The matching completed Full Fetch staging run is no longer available.");
    }
    if (!current.attempt.saveEligible || !current.result) {
      throw new Error("FULL_FETCH_RESULT_NOT_SAVE_ELIGIBLE: Full Fetch status is " + current.attempt.attemptStatus + ".");
    }
    return current;
  }

  resolveByAttemptId(attemptId: string): FullFetchRunRecord | null {
    const runId = this.runIdByAttemptId.get(normalize(attemptId));
    return runId ? this.byRunId.get(runId) ?? null : null;
  }

  markSaved(identity: FullFetchRunIdentity, savedPath: string, savedAt: string): FullFetchRunRecord {
    const current = this.resolveForSave(identity);
    const next = {
      ...current,
      attempt: { ...current.attempt, attemptStatus: "saved" as const, savedAt, updatedAt: savedAt },
      result: current.result ? { ...current.result, savedPath, generatedAutomatically: false } : null
    };
    this.registerAttempt(next.attempt);
    this.byRunId.set(current.fullFetchRunId, next);
    return next;
  }
}