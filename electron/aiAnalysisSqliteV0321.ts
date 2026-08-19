import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AI_ANALYSIS_DB_SCHEMA_VERSION, AiAnalysisError, type AiAnalysisRun, type AiPendingDataset } from "../shared/aiAnalysisContract.js";
import { initializeAiDatabase } from "./aiAnalysisCore.js";

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
const canonical = (value: unknown) => JSON.stringify(stable(value));

export type DatabaseCommitReceipt = {
  schemaVersion: "jaa-database-commit-receipt-v1";
  runId: string;
  databaseIdentityFingerprint: string;
  databaseSchemaVersion: number;
  transactionId: string;
  attemptNumber: number;
  preflightCounts: { insert: number; update: number; alreadyCommitted: number; conflict: number };
  insertedResultCount: number;
  updatedResultCount: number;
  alreadyCommittedResultCount: number;
  insertedCandidateCount: number;
  updatedCandidateCount: number;
  committedRecordCount: number;
  rolledBack: false;
  startedAt: string;
  completedAt: string;
  status: "committed" | "already_committed";
};

export type DatabaseCommitFailure = {
  schemaVersion: "jaa-database-commit-failure-v1";
  runId: string;
  databaseIdentityFingerprint: string;
  databaseSchemaVersion: number;
  transactionId: string;
  attemptNumber: number;
  preflightCounts: { insert: number; update: number; alreadyCommitted: number; conflict: number };
  insertedResultCount: number;
  updatedResultCount: number;
  alreadyCommittedResultCount: number;
  insertedCandidateCount: number;
  updatedCandidateCount: number;
  committedRecordCount: number;
  rolledBack: true;
  failedTable: string | null;
  constraint: string | null;
  resultId: string | null;
  skillId: string | null;
  existingRunId: string | null;
  incomingRunId: string;
  errorCode: "AI_SQLITE_UNIQUE_CONSTRAINT" | "AI_SQLITE_COMMIT_FAILED";
  message: string;
  startedAt: string;
  completedAt: string;
};

function databaseFingerprint(databasePath: string) {
  const absolute = path.resolve(databasePath);
  const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
  return sha256(`${absolute.toLocaleLowerCase("en-US")}:${stat?.dev ?? 0}:${stat?.ino ?? 0}`);
}

export function persistCompletedRunV0321(databasePath: string, dataset: AiPendingDataset, run: AiAnalysisRun, options: { attemptNumber?: number; failCandidateInsertAt?: number } = {}) {
  if (!run.results.length || run.canonicalRecordCount !== run.results.length || !run.analyzedFilePath) throw new AiAnalysisError("AI_SQLITE_BLOCKED", "Validated Canonical Result is required before SQLite commit.");
  initializeAiDatabase(databasePath);
  const db = new DatabaseSync(databasePath);
  const transactionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const fingerprint = databaseFingerprint(databasePath);
  const preflight = { insert: 0, update: 0, alreadyCommitted: 0, conflict: 0 };
  let currentResultId: string | null = null;
  let currentSkillId: string | null = null;
  let existingRunId: string | null = null;
  let failedTable: string | null = null;
  let insertedResultCount = 0;
  let updatedResultCount = 0;
  let alreadyCommittedResultCount = 0;
  let insertedCandidateCount = 0;
  let updatedCandidateCount = 0;
  try {
    db.exec("CREATE TABLE IF NOT EXISTS analysis_commit_receipts (run_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, receipt_json TEXT NOT NULL, committed_at TEXT NOT NULL)");
    const existingResult = db.prepare("SELECT run_id, payload_json FROM raw_results WHERE result_id=?");
    const existingCandidates = db.prepare("SELECT skill_id, candidate_json FROM classification_candidates WHERE result_id=? ORDER BY skill_id");
    for (const result of run.results) {
      const row = existingResult.get(result.resultId) as { run_id?: string; payload_json?: string } | undefined;
      const incomingResult = canonical(result);
      const incomingCandidates = [...result.candidates].sort((a, b) => a.skillId.localeCompare(b.skillId)).map((candidate) => ({ skill_id: candidate.skillId, candidate_json: canonical(candidate) }));
      const storedCandidates = existingCandidates.all(result.resultId) as Array<{ skill_id: string; candidate_json: string }>;
      if (!row) preflight.insert += 1;
      else if (row.run_id !== run.runId) { preflight.conflict += 1; currentResultId = result.resultId; existingRunId = row.run_id ?? null; }
      else if (row.payload_json === incomingResult && canonical(storedCandidates) === canonical(incomingCandidates)) preflight.alreadyCommitted += 1;
      else preflight.update += 1;
    }
    if (preflight.conflict) throw new AiAnalysisError("AI_SQLITE_UNIQUE_CONSTRAINT", "Run-scoped result identity collides with a different analysis Run.");
    db.exec("BEGIN IMMEDIATE");
    const committedAt = new Date().toISOString();
    db.prepare("INSERT INTO source_datasets VALUES(?,?,?,?,?,?) ON CONFLICT(dataset_id) DO UPDATE SET source_sha256=excluded.source_sha256, source_database_id=excluded.source_database_id, jira_fingerprint=excluded.jira_fingerprint, payload_json=excluded.payload_json").run(dataset.datasetId, dataset.sourceFileSha256, dataset.sourceDatabaseId, dataset.jiraServerFingerprint, canonical(dataset), committedAt);
    db.prepare("INSERT INTO rule_snapshots VALUES(?,?,?,?) ON CONFLICT(snapshot_id) DO NOTHING").run(run.rules.snapshotId ?? run.rules.ruleSetId, run.rules.ruleSetId, canonical(run.rules), committedAt);
    db.prepare("INSERT INTO analysis_runs VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET revision=excluded.revision, status=excluded.status, source_dataset_id=excluded.source_dataset_id, analyzer_mode=excluded.analyzer_mode, run_json=excluded.run_json, completed_at=excluded.completed_at").run(run.runId, run.revision, run.status, run.sourceDatasetId, run.analyzerMode, canonical(run), run.startedAt, run.completedAt);
    const upsertItem = db.prepare("INSERT INTO run_items VALUES(?,?,?,?) ON CONFLICT(run_id,source_diff_id) DO UPDATE SET status=excluded.status, result_json=excluded.result_json");
    const upsertRaw = db.prepare("INSERT INTO raw_results VALUES(?,?,?) ON CONFLICT(result_id) DO UPDATE SET run_id=excluded.run_id, payload_json=excluded.payload_json");
    const deleteCandidates = db.prepare("DELETE FROM classification_candidates WHERE result_id=?");
    const insertCandidate = db.prepare("INSERT INTO classification_candidates VALUES(?,?,?,?)");
    let candidateSequence = 0;
    for (const result of run.results) {
      currentResultId = result.resultId;
      const row = existingResult.get(result.resultId) as { run_id?: string; payload_json?: string } | undefined;
      const storedCandidates = existingCandidates.all(result.resultId) as Array<{ skill_id: string; candidate_json: string }>;
      const incomingCandidates = [...result.candidates].sort((a, b) => a.skillId.localeCompare(b.skillId)).map((candidate) => ({ skill_id: candidate.skillId, candidate_json: canonical(candidate), candidate }));
      const unchanged = row?.run_id === run.runId && row.payload_json === canonical(result) && canonical(storedCandidates) === canonical(incomingCandidates.map(({ skill_id, candidate_json }) => ({ skill_id, candidate_json })));
      if (unchanged) { alreadyCommittedResultCount += 1; continue; }
      failedTable = "raw_results"; upsertRaw.run(result.resultId, run.runId, canonical(result));
      failedTable = "run_items"; upsertItem.run(run.runId, result.sourceDiffId, result.status, canonical(result));
      failedTable = "classification_candidates"; deleteCandidates.run(result.resultId);
      for (const item of incomingCandidates) {
        candidateSequence += 1; currentSkillId = item.skill_id;
        if (options.failCandidateInsertAt === candidateSequence) throw new Error("SYNTHETIC_CHILD_INSERT_FAILURE");
        insertCandidate.run(result.resultId, item.skill_id, item.candidate.candidateStatus ?? item.candidate.status, item.candidate_json);
      }
      if (row) { updatedResultCount += 1; updatedCandidateCount += incomingCandidates.length; }
      else { insertedResultCount += 1; insertedCandidateCount += incomingCandidates.length; }
    }
    const receipt: DatabaseCommitReceipt = { schemaVersion: "jaa-database-commit-receipt-v1", runId: run.runId, databaseIdentityFingerprint: fingerprint, databaseSchemaVersion: AI_ANALYSIS_DB_SCHEMA_VERSION, transactionId, attemptNumber: options.attemptNumber ?? 1, preflightCounts: preflight, insertedResultCount, updatedResultCount, alreadyCommittedResultCount, insertedCandidateCount, updatedCandidateCount, committedRecordCount: run.results.length, rolledBack: false, startedAt, completedAt: new Date().toISOString(), status: preflight.alreadyCommitted === run.results.length ? "already_committed" : "committed" };
    db.prepare("INSERT INTO analysis_commit_receipts VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET transaction_id=excluded.transaction_id, receipt_json=excluded.receipt_json, committed_at=excluded.committed_at").run(run.runId, transactionId, canonical(receipt), receipt.completedAt);
    db.exec("COMMIT");
    return receipt;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Transaction may not have started. */ }
    const message = error instanceof Error ? error.message : String(error);
    const unique = error instanceof AiAnalysisError && error.code === "AI_SQLITE_UNIQUE_CONSTRAINT" || /UNIQUE constraint/i.test(message);
    const failure: DatabaseCommitFailure = { schemaVersion: "jaa-database-commit-failure-v1", runId: run.runId, databaseIdentityFingerprint: fingerprint, databaseSchemaVersion: AI_ANALYSIS_DB_SCHEMA_VERSION, transactionId, attemptNumber: options.attemptNumber ?? 1, preflightCounts: preflight, insertedResultCount: 0, updatedResultCount: 0, alreadyCommittedResultCount: 0, insertedCandidateCount: 0, updatedCandidateCount: 0, committedRecordCount: 0, rolledBack: true, failedTable, constraint: unique ? "classification_candidates(result_id, skill_id) or run-scoped result identity" : null, resultId: currentResultId, skillId: currentSkillId, existingRunId, incomingRunId: run.runId, errorCode: unique ? "AI_SQLITE_UNIQUE_CONSTRAINT" : "AI_SQLITE_COMMIT_FAILED", message, startedAt, completedAt: new Date().toISOString() };
    throw Object.assign(new AiAnalysisError(failure.errorCode, message), { databaseFailure: failure });
  } finally { db.close(); }
}
