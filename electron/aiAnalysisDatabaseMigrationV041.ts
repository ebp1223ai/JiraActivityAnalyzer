import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type Json = Record<string, any>;
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value ?? null);
const stable = (prefix: string, ...parts: string[]) => `${prefix}_${crypto.createHash("sha256").update(parts.join("\n")).digest("hex")}`;
function table(db: DatabaseSync, name: string) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function scalar(db: DatabaseSync, sql: string, ...values: any[]) { return Number((db.prepare(sql).get(...values) as Json | undefined)?.value ?? 0); }

export function migrateAiDatabaseV1ToV2Complete(input: { databasePath: string; ddlPath: string; backupDirectory: string; failureInjection?: "AFTER_RENAME" | "AFTER_DDL" | "AFTER_DATA" }) {
  const databasePath = path.resolve(input.databasePath);
  const preflight = new DatabaseSync(databasePath);
  let legacyCount = 0;
  try {
    preflight.exec("PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(FULL);");
    if (String((preflight.prepare("PRAGMA integrity_check").get() as Json).integrity_check) !== "ok") throw new Error("AI_DATABASE_MIGRATION_INTEGRITY_FAILED");
    if (Number((preflight.prepare("PRAGMA user_version").get() as Json).user_version) !== 1) throw new Error("AI_DATABASE_MIGRATION_SOURCE_NOT_V1");
    legacyCount = table(preflight, "ai_analysis_records") ? scalar(preflight, "SELECT COUNT(*) value FROM ai_analysis_records") : 0;
  } finally { preflight.close(); }
  fs.mkdirSync(input.backupDirectory, { recursive: true });
  const backupPath = path.join(input.backupDirectory, `${path.basename(databasePath)}.pre-v2.${Date.now()}.bak`);
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
    for (const name of ["ai_import_batches", "ai_record_reviews", "ai_skill_findings"]) if (table(db, name)) db.exec(`ALTER TABLE ${name} RENAME TO legacy_v1_${name}`);
    if (input.failureInjection === "AFTER_RENAME") throw new Error("SYNTHETIC_MIGRATION_FAILURE_AFTER_RENAME");
    db.exec(fs.readFileSync(input.ddlPath, "utf8"));
    if (input.failureInjection === "AFTER_DDL") throw new Error("SYNTHETIC_MIGRATION_FAILURE_AFTER_DDL");
    const migratedAt = now();
    db.prepare("INSERT OR REPLACE INTO ai_schema_metadata(schema_name,schema_version,created_at,migrated_at,source_trace_contract_version,package_contract_version) VALUES(?,?,?,?,?,?)").run("jaa-ai-analysis-sqlite", "2.0.0", migratedAt, migratedAt, "JAA-SOURCE-TRACE-v1", "2.0.0");
    const legacyRows = db.prepare("SELECT * FROM ai_analysis_records ORDER BY source_database_id,event_time_utc,ai_record_id").all() as Json[];
    const groups = new Map<string, Json[]>();
    for (const row of legacyRows) groups.set(row.source_database_id, [...(groups.get(row.source_database_id) ?? []), row]);
    for (const [sourceDatabaseId, records] of groups) {
      const batchId = stable("legacy_batch", sourceDatabaseId);
      const rank = records.some((row) => row.review_state === "REVIEW_COMPLETED") ? "REVIEW_COMPLETED" : records.some((row) => row.review_state === "REVIEW_PARTIAL") ? "REVIEW_PARTIAL" : "AI_ONLY";
      db.prepare("INSERT INTO ai_import_batches(import_batch_id,package_id,package_schema_version,source_filename,source_database_id,database_generation,source_schema_version,source_trace_contract_version,review_rank,source_binding_json,package_metadata_json,preflight_result_json,record_count,imported_at,transaction_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(batchId, `legacy-v1-migration:${sourceDatabaseId}`, "1.0.0-migrated", "existing-ai-database-v1", sourceDatabaseId, "legacy-generation-unknown", "legacy-v1-unknown", "LEGACY_PARTIAL", rank, json({ sourceDatabaseId, legacy: true }), json({ migration: "v1-to-v2", inventedSourceTrace: false }), json({ status: "MIGRATED_PARTIAL", warning: "Legacy v1 did not contain complete v2 Source Trace." }), records.length, migratedAt, "COMMITTED");
      records.forEach((row, recordIndex) => {
        const recordId = stable("record", row.source_database_id, row.activity_event_id);
        const sourceReference = (() => { try { return JSON.parse(row.source_reference_json); } catch { return {}; } })();
        const sourceSnapshot = (() => { try { return JSON.parse(row.source_snapshot_json); } catch { return null; } })();
        const reference = { ...sourceReference, evidenceId: row.evidence_id, activityEventId: row.activity_event_id, sourceDatabaseId: row.source_database_id, sourceRecordStableId: row.source_record_stable_id, issueKey: row.issue_key, fieldId: row.field_id ?? null, fieldName: row.field_name, eventTime: row.event_time_utc, actor: sourceReference.actor ?? { stableIdentity: row.actor_stable_identity, displayValue: row.actor_display_value } };
        const partialTrace = { reference, diff: sourceSnapshot?.diff ?? {}, pendingIntegrity: { status: "LEGACY_SOURCE_SNAPSHOT_ONLY", sourceSnapshot, diagnostics: ["Complete Pending Analysis Source Trace was unavailable in schema v1."] }, optionalIntegrityReceipt: null };
        const analysis = (() => { try { return JSON.parse(row.ai_analysis_json); } catch { return { status: row.ai_status, confidence: row.ai_confidence, rationale: row.ai_rationale, skillFindings: [] }; } })();
        const analysisId = stable("analysis", recordId, batchId), traceId = stable("trace", recordId, batchId);
        db.prepare("INSERT INTO ai_records(ai_record_id,source_database_id,database_generation,activity_event_id,source_record_stable_id,evidence_id,issue_key,field_identity,field_name,event_time,record_index,source_trace_status,source_link_status,integrity_status,active_analysis_id,active_review_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(recordId, row.source_database_id, "legacy-generation-unknown", row.activity_event_id, row.source_record_stable_id, row.evidence_id, row.issue_key, row.field_id ?? null, row.field_name, row.event_time_utc, recordIndex, "PARTIAL", "NOT_ATTEMPTED", "UNVERIFIABLE", analysisId, null, row.first_imported_at_utc ?? migratedAt, migratedAt);
        db.prepare("INSERT INTO ai_record_source_traces(source_trace_id,ai_record_id,import_batch_id,source_trace_json,reference_json,diff_json,pending_integrity_json,source_schema_version,source_trace_contract_version,integrity_receipt_json,trace_completeness_status,observed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(traceId, recordId, batchId, json(partialTrace), json(reference), json(partialTrace.diff), json(partialTrace.pendingIntegrity), "legacy-v1-unknown", "LEGACY_PARTIAL", null, "PARTIAL", migratedAt);
        db.prepare("INSERT INTO ai_record_analyses(analysis_id,ai_record_id,import_batch_id,rule_set_id,analysis_json,analysis_status,confidence,created_at) VALUES(?,?,?,?,?,?,?,?)")
          .run(analysisId, recordId, batchId, "legacy-v1", json(analysis), row.ai_status, Number(row.ai_confidence), row.first_imported_at_utc ?? migratedAt);
        let reviewId: string | null = null;
        if (row.manual_review_json) {
          reviewId = stable("review", recordId, batchId);
          const review = JSON.parse(row.manual_review_json);
          db.prepare("INSERT INTO ai_record_reviews(review_id,ai_record_id,analysis_id,import_batch_id,review_rank,review_json,completed,reviewer,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .run(reviewId, recordId, analysisId, batchId, row.review_state === "REVIEW_COMPLETED" ? "REVIEW_COMPLETED" : "REVIEW_PARTIAL", json(review), row.is_human_verified ? 1 : 0, review.reviewer ?? null, review.reviewedAt ?? null, migratedAt);
          db.prepare("UPDATE ai_records SET active_review_id=? WHERE ai_record_id=?").run(reviewId, recordId);
        }
      });
    }
    if (input.failureInjection === "AFTER_DATA") throw new Error("SYNTHETIC_MIGRATION_FAILURE_AFTER_DATA");
    const preserved = scalar(db, "SELECT COUNT(*) value FROM ai_analysis_records");
    const migrated = scalar(db, "SELECT COUNT(*) value FROM ai_records");
    if (preserved !== legacyCount || migrated !== legacyCount) throw new Error("AI_DATABASE_MIGRATION_RECONCILIATION_FAILED");
    if ((db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length) throw new Error("AI_DATABASE_MIGRATION_FOREIGN_KEY_FAILED");
    db.exec("COMMIT");
    return { ok: true, backupPath, legacyRecordCount: legacyCount, migratedRecordCount: migrated, partialTraceCount: migrated, inventedSourceTraceCount: 0, reconciliation: "PASS" };
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no active transaction */ } throw error; }
  finally { db.close(); }
}
