import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { AI_ANALYSIS_DDL_SHA256_V042, AI_ANALYSIS_DDL_V042, AI_ANALYSIS_DDL_VERSION_V042 } from "./generated/aiAnalysisDdlV042.js";

const Ajv2020 = ((Ajv2020Module as any).default ?? Ajv2020Module) as new (options: Record<string, unknown>) => any;
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: any) => void;
type Json = Record<string, any>;
type ReviewRank = "AI_ONLY" | "REVIEW_PARTIAL" | "REVIEW_COMPLETED";

export const AI_DATABASE_SCHEMA_VERSION_V042 = 2;
export const AI_PACKAGE_SCHEMA_VERSION_V042 = "2.0.0";
export const SOURCE_TRACE_CONTRACT_V042 = "JAA-SOURCE-TRACE-v1";
const REVIEW_RANK: Record<ReviewRank, number> = { AI_ONLY: 0, REVIEW_PARTIAL: 1, REVIEW_COMPLETED: 2 };
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value ?? null);
const rows = <T>(value: unknown) => value as T[];
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

export function canonicalJsonV042(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("CANONICAL_JSON_UNSUPPORTED");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonV042).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonV042(object[key])}`).join(",")}}`;
}

export function packageDigestV042(value: unknown) {
  return sha256(Buffer.from(canonicalJsonV042(value), "utf8"));
}

function stableId(prefix: string, ...parts: string[]) {
  return `${prefix}_${sha256(parts.join("\n"))}`;
}

function roleFailure(pkg: Json) {
  const name = String(pkg?.schemaName ?? pkg?.schema ?? "").toLowerCase();
  const version = String(pkg?.schemaVersion ?? "");
  if (name === "jaa-ai-analysis-package" && version === AI_PACKAGE_SCHEMA_VERSION_V042) return null;
  if (name.includes("pending-analysis")) return { code: "WRONG_FILE_ROLE_PENDING", message: "Pending Analysis is source input, not a formal AI Analysis Package v2." };
  if (name.includes("manual") || name.includes("review")) return { code: "WRONG_FILE_ROLE_REVIEW", message: "Standalone review JSON is not importable. Export a formal v2 package from the offline Workbench." };
  if (name.includes("analyzed") || name.includes("analysis-import") || version === "1.0.0") return { code: "WRONG_FILE_ROLE_LEGACY", message: "Legacy analyzed/package v1 files are view-only. Convert the three files outside JAA." };
  return { code: "UNSUPPORTED_FILE_TYPE", message: "Only jaa-ai-analysis-package v2.0.0 is accepted." };
}

function formatAjvErrors(errors: any[] | null | undefined) {
  return (errors ?? []).map((error) => ({
    code: "SCHEMA_VALIDATION_FAILED",
    path: error.instancePath || "$",
    message: error.keyword === "additionalProperties"
      ? `unexpected property ${String(error.params?.additionalProperty ?? "")}`
      : String(error.message ?? "schema validation failed")
  }));
}

export function deriveReviewRankV042(records: Json[]): ReviewRank {
  const reviewed = records.filter((record) => record?.manualReview !== null && record?.manualReview !== undefined);
  if (reviewed.length === 0) return "AI_ONLY";
  if (reviewed.length === records.length && reviewed.every((record) => record.manualReview?.completed === true)) return "REVIEW_COMPLETED";
  return "REVIEW_PARTIAL";
}

function derivedCounts(records: Json[]) {
  const analyses = records.map((record) => record?.aiAnalysis ?? {});
  const countStatus = (status: string) => analyses.filter((analysis) => analysis.status === status).length;
  return {
    records: records.length,
    classified: countStatus("CLASSIFIED"),
    unknown: countStatus("UNKNOWN"),
    excluded: countStatus("EXCLUDED"),
    failed: countStatus("FAILED"),
    skillFindings: analyses.reduce((sum, analysis) => sum + (Array.isArray(analysis.skillFindings) ? analysis.skillFindings.length : 0), 0),
    reviewedRecords: records.filter((record) => record?.manualReview != null).length,
    completedReviews: records.filter((record) => record?.manualReview?.completed === true).length
  };
}
function traceComplete(record: Json) {
  const reference = record?.sourceTrace?.reference;
  return Boolean(reference?.activityEventId && reference?.sourceDatabaseId && reference?.sourceRecordStableId && reference?.issueKey && reference?.fieldName && reference?.eventTime && record?.sourceTrace?.diff && record?.sourceTrace?.pendingIntegrity);
}

export type V042Preview = {
  ok: boolean;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  packageId?: string;
  packageSha256?: string;
  derivedReviewRank?: ReviewRank;
  reviewRank?: ReviewRank;
  recordCount?: number;
  findingCount?: number;
  insertCount?: number;
  replaceCount?: number;
  protectedSkipCount?: number;
  identicalNoopCount?: number;
  errors: Array<{ code: string; message: string; path?: string }>;
};

export function validateAiAnalysisPackageV042(input: { filePath: string; packageSchemaPath: string; sourceTraceSchemaPath: string; databasePath?: string }) {
  const filePath = path.resolve(input.filePath);
  const base = { filePath, fileName: path.basename(filePath), fileSizeBytes: 0 };
  let stat: fs.Stats;
  try { stat = fs.statSync(filePath); } catch { return { preview: { ...base, ok: false, errors: [{ code: "FILE_NOT_FOUND", message: "Import package cannot be read." }] } as V042Preview }; }
  base.fileSizeBytes = stat.size;
  if (!stat.isFile() || stat.size > 128 * 1024 * 1024) return { preview: { ...base, ok: false, errors: [{ code: "FILE_SIZE_INVALID", message: "Package must be a regular JSON file no larger than 128 MiB." }] } as V042Preview };
  let pkg: Json;
  try { pkg = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (error) { return { preview: { ...base, ok: false, errors: [{ code: "INVALID_JSON", message: error instanceof Error ? error.message : String(error) }] } as V042Preview }; }
  const role = roleFailure(pkg);
  if (role) return { preview: { ...base, ok: false, packageId: pkg.packageId, reviewRank: pkg.reviewRank, recordCount: Array.isArray(pkg.records) ? pkg.records.length : 0, errors: [role] } as V042Preview };
  const errors: V042Preview["errors"] = [];
  try {
    const sourceSchema = JSON.parse(fs.readFileSync(input.sourceTraceSchemaPath, "utf8"));
    const packageSchema = JSON.parse(fs.readFileSync(input.packageSchemaPath, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(sourceSchema);
    const validate = ajv.compile(packageSchema);
    const valid = validate(pkg);
    if (!valid) errors.push(...formatAjvErrors(validate.errors));
  } catch (error) { errors.push({ code: "SCHEMA_VALIDATOR_FAILED", message: error instanceof Error ? error.message : String(error) }); }
  const identities = new Set<string>();
  let findings = 0;
  if (Array.isArray(pkg.records)) pkg.records.forEach((record: Json, index: number) => {
    const reference = record?.sourceTrace?.reference ?? {};
    const identity = `${reference.sourceDatabaseId}\n${reference.activityEventId}`;
    if (record.recordIndex !== index || record.aiAnalysis?.recordIndex !== index) errors.push({ code: "RECORD_INDEX_MISMATCH", path: `/records/${index}`, message: "recordIndex must be contiguous and identical across layers." });
    if (reference.sourceDatabaseId !== pkg.sourceTrace?.sourceDatabase?.sourceDatabaseId) errors.push({ code: "SOURCE_DATABASE_ID_MISMATCH", path: `/records/${index}/sourceTrace/reference/sourceDatabaseId`, message: "Record Source Trace must bind to the package source database." });
    if (identities.has(identity)) errors.push({ code: "DUPLICATE_PRIMARY_IDENTITY", path: `/records/${index}`, message: "Duplicate sourceDatabaseId + activityEventId." });
    identities.add(identity);
    if (!record?.sourceTrace?.diff) errors.push({ code: "SOURCE_TRACE_DIFF_MISSING", path: `/records/${index}/sourceTrace/diff`, message: "Source Trace diff is required losslessly." });
    else if (!traceComplete(record)) errors.push({ code: "SOURCE_TRACE_INCOMPLETE", path: `/records/${index}/sourceTrace`, message: "reference, diff and pendingIntegrity are required losslessly." });
    if (record.aiAnalysis?.evidenceId !== reference.evidenceId || record.aiAnalysis?.sourceRecordStableId !== reference.sourceRecordStableId || record.aiAnalysis?.issueKey !== reference.issueKey) errors.push({ code: "LAYER_IDENTITY_MISMATCH", path: `/records/${index}/aiAnalysis`, message: "AI Analysis identity differs from immutable Source Trace." });
    if (record.manualReview != null && record.manualReview.recordIndex !== index) errors.push({ code: "REVIEW_INDEX_MISMATCH", path: `/records/${index}/manualReview/recordIndex`, message: "manualReview.recordIndex must match its record." });
    findings += Array.isArray(record.aiAnalysis?.skillFindings) ? record.aiAnalysis.skillFindings.length : 0;
  });
  const records = Array.isArray(pkg.records) ? pkg.records as Json[] : [];
  const calculatedRank = deriveReviewRankV042(records);
  if (pkg.reviewRank !== calculatedRank) errors.push({ code: "REVIEW_RANK_MISMATCH", path: "/reviewRank", message: `Declared reviewRank ${String(pkg.reviewRank)} differs from derived ${calculatedRank}.` });
  const calculatedCounts = derivedCounts(records);
  for (const [name, expected] of Object.entries(calculatedCounts)) {
    if (pkg.counts?.[name] !== expected) errors.push({ code: "COUNT_MISMATCH", path: `/counts/${name}`, message: `counts.${name} must be ${expected}.` });
  }
  const preview: V042Preview = { ...base, ok: errors.length === 0, packageId: pkg.packageId, packageSha256: packageDigestV042(pkg), reviewRank: pkg.reviewRank, derivedReviewRank: calculatedRank, recordCount: pkg.records?.length ?? 0, findingCount: findings, errors };
  if (preview.ok && input.databasePath && fs.existsSync(input.databasePath)) Object.assign(preview, previewImportActionsV042(input.databasePath, pkg));
  return { preview, pkg: preview.ok ? pkg : undefined };
}

function tableExists(db: DatabaseSync, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function configure(db: DatabaseSync) {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
}

function scalar(db: DatabaseSync, sql: string, ...values: any[]) {
  return Number((db.prepare(sql).get(...values) as Json | undefined)?.value ?? 0);
}

export function initializeAiDatabaseV042(input: { databasePath: string }) {
  fs.mkdirSync(path.dirname(input.databasePath), { recursive: true });
  const db = new DatabaseSync(input.databasePath);
  try {
    configure(db);
    db.exec(AI_ANALYSIS_DDL_V042);
    db.prepare("INSERT OR IGNORE INTO ai_schema_metadata(schema_name,schema_version,created_at,migrated_at,source_trace_contract_version,package_contract_version) VALUES(?,?,?,?,?,?)")
      .run("jaa-ai-analysis-sqlite", AI_ANALYSIS_DDL_VERSION_V042, now(), null, SOURCE_TRACE_CONTRACT_V042, AI_PACKAGE_SCHEMA_VERSION_V042);
    return inspectAiDatabaseV042(input.databasePath);
  } finally { db.close(); }
}

export function inspectAiDatabaseV042(databasePath: string) {
  const resolved = path.resolve(databasePath);
  if (!fs.existsSync(resolved)) return { lifecycleState: "NOT_CREATED", databasePath: resolved, exists: false, canCreate: true, canImport: false, canQuery: false, schemaVersion: 2, recordCount: 0, findingCount: 0, reviewedCount: 0, matchedCount: 0, importBatchCount: 0 };
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    configure(db); db.exec("PRAGMA query_only=ON");
    const userVersion = Number((db.prepare("PRAGMA user_version").get() as Json).user_version ?? 0);
    if (userVersion === 1) return { lifecycleState: "MIGRATION_REQUIRED", databasePath: resolved, exists: true, canCreate: false, canImport: false, canQuery: false, schemaVersion: 1 };
    if (userVersion !== 2 || !tableExists(db, "ai_schema_metadata")) return { lifecycleState: "READ_ONLY_DIAGNOSTIC", databasePath: resolved, exists: true, canCreate: false, canImport: false, canQuery: false, schemaVersion: userVersion, errorCode: "AI_DATABASE_SCHEMA_UNSUPPORTED" };
    const integrity = String((db.prepare("PRAGMA integrity_check").get() as Json).integrity_check ?? "error");
    const foreignKeyErrors = rows(db.prepare("PRAGMA foreign_key_check").all()).length;
    const recordCount = scalar(db, "SELECT COUNT(*) value FROM ai_records");
    const findingCount = scalar(db, "SELECT COUNT(*) value FROM ai_skill_findings");
    const reviewedCount = scalar(db, "SELECT COUNT(*) value FROM ai_records WHERE active_review_id IS NOT NULL");
    const matchedCount = scalar(db, "SELECT COUNT(*) value FROM ai_records WHERE source_link_status IN ('PRIMARY_MATCHED','FALLBACK_MATCHED')");
    const linkOutcomeCounts = Object.fromEntries(rows<Json>(db.prepare("SELECT source_link_status status,COUNT(*) count FROM ai_records GROUP BY source_link_status").all()).map((item) => [String(item.status), Number(item.count)]));
    const traceCompletenessCounts = Object.fromEntries(rows<Json>(db.prepare("SELECT source_trace_status status,COUNT(*) count FROM ai_records GROUP BY source_trace_status").all()).map((item) => [String(item.status), Number(item.count)]));
    const importBatchCount = scalar(db, "SELECT COUNT(*) value FROM ai_import_batches WHERE transaction_status='COMMITTED'");
    const batches = rows<Json>(db.prepare("SELECT * FROM ai_import_batches WHERE transaction_status='COMMITTED' ORDER BY imported_at DESC LIMIT 50").all());
    const sourceContexts = rows<Json>(db.prepare("SELECT source_database_id,database_generation,source_schema_version,COUNT(*) record_count,MAX(imported_at) last_imported_at FROM ai_import_batches WHERE transaction_status='COMMITTED' GROUP BY source_database_id,database_generation,source_schema_version ORDER BY last_imported_at DESC").all());
    const metadata = db.prepare("SELECT * FROM ai_schema_metadata LIMIT 1").get() as Json;
    const ok = integrity === "ok" && foreignKeyErrors === 0;
    return { lifecycleState: ok ? recordCount ? "READY_WITH_DATA" : "READY_EMPTY" : "READ_ONLY_DIAGNOSTIC", databasePath: resolved, databaseFileName: path.basename(resolved), databaseDirectory: path.dirname(resolved), databaseId: sha256(resolved.toLowerCase()), exists: true, canCreate: false, canImport: ok, canQuery: ok, readOnly: !ok, schemaName: metadata.schema_name, schemaVersion: 2, sourceTraceContractVersion: metadata.source_trace_contract_version, packageContractVersion: metadata.package_contract_version, integrity, foreignKeyErrors, recordCount, findingCount, reviewedCount, matchedCount, linkOutcomeCounts, traceCompletenessCounts, sourceContextCount: sourceContexts.length, importBatchCount, batches, sourceContexts, sizeBytes: fs.statSync(resolved).size, modifiedAtUtc: fs.statSync(resolved).mtime.toISOString(), sqliteRuntimeVersion: String((db.prepare("SELECT sqlite_version() value").get() as Json).value), journalMode: String((db.prepare("PRAGMA journal_mode").get() as Json).journal_mode) };
  } catch (error) { return { lifecycleState: "READ_ONLY_DIAGNOSTIC", databasePath: resolved, exists: true, canCreate: false, canImport: false, canQuery: false, schemaVersion: 0, errorCode: "AI_DATABASE_OPEN_FAILED", message: error instanceof Error ? error.message : String(error) }; }
  finally { db.close(); }
}

function currentRank(db: DatabaseSync, identity: { sourceDatabaseId: string; activityEventId: string }) {
  const row = db.prepare("SELECT b.review_rank FROM ai_records r LEFT JOIN ai_import_batches b ON b.import_batch_id=(SELECT import_batch_id FROM ai_record_analyses WHERE analysis_id=r.active_analysis_id) WHERE r.source_database_id=? AND r.activity_event_id=?").get(identity.sourceDatabaseId, identity.activityEventId) as Json | undefined;
  return row?.review_rank as ReviewRank | undefined;
}

function activeRecordDigest(db: DatabaseSync, sourceDatabaseId: string, activityEventId: string) {
  const row = db.prepare(`SELECT t.source_trace_json,a.analysis_json,rv.review_json
    FROM ai_records r
    JOIN ai_record_analyses a ON a.analysis_id=r.active_analysis_id
    JOIN ai_record_source_traces t ON t.ai_record_id=r.ai_record_id AND t.import_batch_id=a.import_batch_id
    LEFT JOIN ai_record_reviews rv ON rv.review_id=r.active_review_id
    WHERE r.source_database_id=? AND r.activity_event_id=?`).get(sourceDatabaseId, activityEventId) as Json | undefined;
  if (!row) return null;
  return packageDigestV042({
    sourceTrace: JSON.parse(String(row.source_trace_json)),
    aiAnalysis: JSON.parse(String(row.analysis_json)),
    manualReview: row.review_json ? JSON.parse(String(row.review_json)) : null
  });
}

function incomingRecordDigest(record: Json) {
  return packageDigestV042({ sourceTrace: record.sourceTrace, aiAnalysis: record.aiAnalysis, manualReview: record.manualReview ?? null });
}
export function previewImportActionsV042(databasePath: string, pkg: Json) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  let insertCount = 0, replaceCount = 0, protectedSkipCount = 0, identicalNoopCount = 0;
  try {
    if (db.prepare("SELECT 1 FROM ai_import_batches WHERE package_id=? AND transaction_status='COMMITTED'").get(pkg.packageId)) return { insertCount: 0, replaceCount: 0, protectedSkipCount: 0, identicalNoopCount: pkg.records.length };
    for (const record of pkg.records as Json[]) {
      const ref = record.sourceTrace.reference;
      const existing = currentRank(db, { sourceDatabaseId: ref.sourceDatabaseId, activityEventId: ref.activityEventId });
      const identical = existing && activeRecordDigest(db, ref.sourceDatabaseId, ref.activityEventId) === incomingRecordDigest(record);
      if (!existing) insertCount += 1;
      else if (REVIEW_RANK[pkg.reviewRank as ReviewRank] > REVIEW_RANK[existing] || (pkg.reviewRank === existing && !identical)) replaceCount += 1;
      else if (REVIEW_RANK[pkg.reviewRank as ReviewRank] < REVIEW_RANK[existing]) protectedSkipCount += 1;
      else identicalNoopCount += 1;
    }
    return { insertCount, replaceCount, protectedSkipCount, identicalNoopCount };
  } finally { db.close(); }
}

export function importAiAnalysisPackageV042(input: { databasePath: string; packageSchemaPath: string; sourceTraceSchemaPath: string; packagePath: string; failureInjection?: "AFTER_BATCH" | "AFTER_RECORDS" }) {
  const validated = validateAiAnalysisPackageV042({ filePath: input.packagePath, packageSchemaPath: input.packageSchemaPath, sourceTraceSchemaPath: input.sourceTraceSchemaPath, databasePath: input.databasePath });
  if (!validated.preview.ok || !validated.pkg) throw Object.assign(new Error("AI_IMPORT_PREFLIGHT_FAILED"), { preview: validated.preview });
  const pkg = validated.pkg, importedAt = now(), packageSha256 = packageDigestV042(pkg);
  const db = new DatabaseSync(input.databasePath);
  try {
    configure(db);
    const prior = db.prepare("SELECT import_batch_id FROM ai_import_batches WHERE package_id=? AND transaction_status='COMMITTED'").get(pkg.packageId) as Json | undefined;
    if (prior) return { ok: true, importBatchId: prior.import_batch_id, packageId: pkg.packageId, insertedCount: 0, replacedCount: 0, protectedSkipCount: 0, identicalNoopCount: pkg.records.length, idempotent: true, committedRecordCount: scalar(db, "SELECT COUNT(*) value FROM ai_records") };
    const batchId = stableId("batch", pkg.packageId, packageSha256);
    let insertedCount = 0, replacedCount = 0, protectedSkipCount = 0, identicalNoopCount = 0;
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO ai_import_batches(import_batch_id,package_id,package_schema_version,source_filename,source_database_id,database_generation,source_schema_version,source_trace_contract_version,review_rank,source_binding_json,package_metadata_json,preflight_result_json,record_count,imported_at,transaction_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(batchId, pkg.packageId, pkg.schemaVersion, path.basename(input.packagePath), pkg.sourceTrace.sourceDatabase.sourceDatabaseId, pkg.sourceTrace.sourceDatabase.databaseGeneration, String(pkg.sourceTrace.sourceDatabase.sourceSchemaVersion), pkg.sourceTrace.contractVersion, pkg.reviewRank, json(pkg.sourceTrace), json({ createdAt: pkg.createdAt, generator: pkg.generator, rulesBinding: pkg.rulesBinding, counts: pkg.counts, packageSha256 }), json(validated.preview), pkg.records.length, importedAt, "COMMITTED");
    if (input.failureInjection === "AFTER_BATCH") throw new Error("SYNTHETIC_V042_IMPORT_FAILURE_AFTER_BATCH");
    for (const record of pkg.records as Json[]) {
      const ref = record.sourceTrace.reference;
      const recordId = stableId("record", ref.sourceDatabaseId, ref.activityEventId);
      const existing = db.prepare("SELECT ai_record_id,active_analysis_id,active_review_id FROM ai_records WHERE source_database_id=? AND activity_event_id=?").get(ref.sourceDatabaseId, ref.activityEventId) as Json | undefined;
      const existingRank = existing ? currentRank(db, { sourceDatabaseId: ref.sourceDatabaseId, activityEventId: ref.activityEventId }) : undefined;
      const identical = Boolean(existingRank) && activeRecordDigest(db, ref.sourceDatabaseId, ref.activityEventId) === incomingRecordDigest(record);
      const incomingWins = !existingRank || REVIEW_RANK[pkg.reviewRank as ReviewRank] > REVIEW_RANK[existingRank] || (pkg.reviewRank === existingRank && !identical);
      if (!existing) {
        db.prepare("INSERT INTO ai_records(ai_record_id,source_database_id,database_generation,activity_event_id,source_record_stable_id,evidence_id,issue_key,field_identity,field_name,event_time,record_index,source_trace_status,source_link_status,integrity_status,active_analysis_id,active_review_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(recordId, ref.sourceDatabaseId, pkg.sourceTrace.sourceDatabase.databaseGeneration, ref.activityEventId, ref.sourceRecordStableId, ref.evidenceId, ref.issueKey, ref.fieldId ?? null, ref.fieldName, ref.eventTime, record.recordIndex, "COMPLETE", "NOT_ATTEMPTED", record.integrityReceipt?.status ?? "NOT_CHECKED", null, null, importedAt, importedAt);
        insertedCount += 1;
      } else if (incomingWins) replacedCount += 1;
      else if (existingRank && REVIEW_RANK[pkg.reviewRank as ReviewRank] < REVIEW_RANK[existingRank]) protectedSkipCount += 1;
      else identicalNoopCount += 1;
      const traceId = stableId("trace", recordId, batchId);
      db.prepare("INSERT INTO ai_record_source_traces(source_trace_id,ai_record_id,import_batch_id,source_trace_json,reference_json,diff_json,pending_integrity_json,source_schema_version,source_trace_contract_version,integrity_receipt_json,trace_completeness_status,observed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(traceId, recordId, batchId, json(record.sourceTrace), json(ref), json(record.sourceTrace.diff), json(record.sourceTrace.pendingIntegrity), String(pkg.sourceTrace.sourceDatabase.sourceSchemaVersion), pkg.sourceTrace.contractVersion, record.integrityReceipt ? json(record.integrityReceipt) : null, "COMPLETE", importedAt);
      const analysisId = stableId("analysis", recordId, batchId);
      db.prepare("INSERT INTO ai_record_analyses(analysis_id,ai_record_id,import_batch_id,rule_set_id,analysis_json,analysis_status,confidence,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .run(analysisId, recordId, batchId, pkg.rulesBinding.manifest.version, json(record.aiAnalysis), record.aiAnalysis.status, record.aiAnalysis.confidence, importedAt);
      for (const finding of record.aiAnalysis.skillFindings as Json[]) db.prepare("INSERT INTO ai_skill_findings(finding_id,analysis_id,ai_record_id,skill_id,skill_name,confidence,finding_json) VALUES(?,?,?,?,?,?,?)")
        .run(stableId("finding", analysisId, finding.skillId), analysisId, recordId, finding.skillId, finding.skillName, finding.confidence, json(finding));
      let reviewId: string | null = null;
      if (record.manualReview) {
        reviewId = stableId("review", recordId, batchId);
        db.prepare("INSERT INTO ai_record_reviews(review_id,ai_record_id,analysis_id,import_batch_id,review_rank,review_json,completed,reviewer,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
          .run(reviewId, recordId, analysisId, batchId, pkg.reviewRank, json(record.manualReview), record.manualReview.completed ? 1 : 0, record.manualReview.reviewer ?? null, record.manualReview.reviewedAt ?? null, importedAt);
      }
      if (!existing || incomingWins) db.prepare("UPDATE ai_records SET active_analysis_id=?,active_review_id=?,updated_at=? WHERE ai_record_id=?").run(analysisId, reviewId, importedAt, recordId);
    }
    if (input.failureInjection === "AFTER_RECORDS") throw new Error("SYNTHETIC_V042_IMPORT_FAILURE_AFTER_RECORDS");
    const readBack = {
      batch: scalar(db, "SELECT COUNT(*) value FROM ai_import_batches WHERE import_batch_id=?", batchId),
      traces: scalar(db, "SELECT COUNT(*) value FROM ai_record_source_traces WHERE import_batch_id=?", batchId),
      analyses: scalar(db, "SELECT COUNT(*) value FROM ai_record_analyses WHERE import_batch_id=?", batchId),
      reviews: scalar(db, "SELECT COUNT(*) value FROM ai_record_reviews WHERE import_batch_id=?", batchId),
      findings: scalar(db, "SELECT COUNT(*) value FROM ai_skill_findings WHERE analysis_id IN (SELECT analysis_id FROM ai_record_analyses WHERE import_batch_id=?)", batchId)
    };
    const expected = derivedCounts(pkg.records as Json[]);
    if (readBack.batch !== 1 || readBack.traces !== expected.records || readBack.analyses !== expected.records || readBack.reviews !== expected.reviewedRecords || readBack.findings !== expected.skillFindings) {
      throw Object.assign(new Error("AI_IMPORT_READBACK_MISMATCH"), { readBack, expected });
    }
    db.exec("COMMIT");
    return { ok: true, importBatchId: batchId, readBack, packageId: pkg.packageId, insertedCount, replacedCount, protectedSkipCount, identicalNoopCount, idempotent: false, committedRecordCount: scalar(db, "SELECT COUNT(*) value FROM ai_records"), completedAt: importedAt };
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no active transaction */ } throw error; }
  finally { db.close(); }
}

type RawCandidate = { activityEventId: string; sourceRecordStableId?: string; fieldName?: string; eventTime?: string; databaseGeneration?: string; sourceContentHash?: string };
export function decideSourceLinkV042(record: Json, rawDatabaseIdentity: string, candidates: RawCandidate[]) {
  const ref = record.sourceTrace.reference;
  if (rawDatabaseIdentity !== ref.sourceDatabaseId) return { method: "NONE", candidateCount: 0, status: "SOURCE_DATABASE_MISMATCH", matchedActivityEventId: null, databaseGenerationStatus: "UNKNOWN" };
  const primary = candidates.filter((candidate) => candidate.activityEventId === ref.activityEventId);
  const generation = (candidate?: RawCandidate) => !candidate?.databaseGeneration ? "UNKNOWN" : candidate.databaseGeneration === record.databaseGeneration ? "SAME" : "DIFFERENT";
  if (primary.length === 1) return { method: "PRIMARY", candidateCount: 1, status: "PRIMARY_MATCHED", matchedActivityEventId: primary[0].activityEventId, databaseGenerationStatus: generation(primary[0]) };
  if (primary.length > 1) return { method: "PRIMARY", candidateCount: primary.length, status: "AMBIGUOUS", matchedActivityEventId: null, databaseGenerationStatus: "UNKNOWN" };
  const fallback = candidates.filter((candidate) => candidate.sourceRecordStableId === ref.sourceRecordStableId && candidate.fieldName === ref.fieldName && candidate.eventTime === ref.eventTime);
  if (fallback.length === 1) return { method: "FALLBACK", candidateCount: 1, status: "FALLBACK_MATCHED", matchedActivityEventId: fallback[0].activityEventId, databaseGenerationStatus: generation(fallback[0]) };
  return { method: "FALLBACK", candidateCount: fallback.length, status: fallback.length > 1 ? "AMBIGUOUS" : "NOT_FOUND", matchedActivityEventId: null, databaseGenerationStatus: "UNKNOWN" };
}

export function recordSourceLinkAttemptV042(input: { databasePath: string; aiRecordId: string; rawDatabaseIdentity: string; rawDatabasePathDisplay?: string; record: Json; candidates: RawCandidate[]; failureReason?: string }) {
  const started = Date.now();
  const decision = input.failureReason ? { method: "NONE", candidateCount: 0, status: "ERROR", matchedActivityEventId: null, databaseGenerationStatus: "UNKNOWN" } : decideSourceLinkV042(input.record, input.rawDatabaseIdentity, input.candidates);
  const db = new DatabaseSync(input.databasePath);
  try {
    configure(db);
    const attemptId = `link_${crypto.randomUUID()}`;
    db.prepare("INSERT INTO source_link_attempts(link_attempt_id,ai_record_id,raw_database_identity,raw_database_path_display,attempted_method,identity_query_json,candidate_count,candidate_summary_json,matched_activity_event_id,link_status,database_generation_status,failure_reason,duration_ms,attempted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(attemptId, input.aiRecordId, input.rawDatabaseIdentity, input.rawDatabasePathDisplay ?? null, decision.method, json({ primary: [input.record.sourceTrace.reference.sourceDatabaseId, input.record.sourceTrace.reference.activityEventId], fallback: [input.record.sourceTrace.reference.sourceDatabaseId, input.record.sourceTrace.reference.sourceRecordStableId, input.record.sourceTrace.reference.fieldName, input.record.sourceTrace.reference.eventTime] }), decision.candidateCount, json(input.candidates.map(({ activityEventId, sourceRecordStableId, fieldName, eventTime, databaseGeneration }) => ({ activityEventId, sourceRecordStableId, fieldName, eventTime, databaseGeneration }))), decision.matchedActivityEventId, decision.status, decision.databaseGenerationStatus, ["PRIMARY_MATCHED", "FALLBACK_MATCHED"].includes(decision.status) ? null : input.failureReason ?? decision.status, Date.now() - started, now());
    db.prepare("UPDATE ai_records SET source_link_status=?,updated_at=? WHERE ai_record_id=?").run(decision.status, now(), input.aiRecordId);
    return { ...decision, linkAttemptId: attemptId };
  } finally { db.close(); }
}

export function aiDatabaseDiagnosticsV042(databasePath: string) {
  const snapshot = inspectAiDatabaseV042(databasePath);
  if (!snapshot.canQuery) return { snapshot, embeddedDdl: { version: AI_ANALYSIS_DDL_VERSION_V042, sha256: AI_ANALYSIS_DDL_SHA256_V042 }, batches: [], traces: [], links: [] };
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try { configure(db); db.exec("PRAGMA query_only=ON"); return { snapshot, embeddedDdl: { version: AI_ANALYSIS_DDL_VERSION_V042, sha256: AI_ANALYSIS_DDL_SHA256_V042 }, batches: rows(db.prepare("SELECT * FROM ai_import_batches ORDER BY imported_at DESC").all()), traces: rows(db.prepare("SELECT source_trace_id,ai_record_id,import_batch_id,trace_completeness_status,observed_at FROM ai_record_source_traces").all()), links: rows(db.prepare("SELECT * FROM source_link_attempts ORDER BY attempted_at DESC LIMIT 500").all()) }; }
  finally { db.close(); }
}
