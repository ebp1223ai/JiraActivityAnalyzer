import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

const Ajv2020 = ((Ajv2020Module as any).default ?? Ajv2020Module) as new (options: Record<string, unknown>) => any;
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: any) => void;

export const AI_DATABASE_SCHEMA_NAME = "jaa-ai-analysis-sqlite";
export const AI_DATABASE_SCHEMA_VERSION = 1;
export const AI_IMPORT_SCHEMA_NAME = "jaa-ai-analysis-import-package";
export const AI_IMPORT_SCHEMA_VERSION = "1.0.0";
export const AI_IMPORT_SCHEMA_SHA256 = "6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c";
export const AI_IMPORT_CAPABILITIES = ["AI_ANALYSIS_SQLITE_V1", "SOURCE_RECORD_LINK_V1", "MANUAL_REVIEW_LAYER_V1"] as const;

type JsonRecord = Record<string, any>;
type ReviewState = "AI_ONLY" | "REVIEW_PARTIAL" | "REVIEW_COMPLETED";
type LinkStatus = "MATCHED" | "SOURCE_DATABASE_NOT_AVAILABLE" | "SOURCE_RECORD_NOT_FOUND" | "AMBIGUOUS" | "SOURCE_IDENTITY_MISMATCH" | "SOURCE_CONTENT_MISMATCH" | "LINK_ERROR" | "NOT_ATTEMPTED";

export type AiImportPreview = {
  ok: boolean;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  packageId?: string;
  packageSha256?: string;
  reviewState?: ReviewState;
  recordCount?: number;
  findingCount?: number;
  insertCount?: number;
  replaceCount?: number;
  protectedSkipCount?: number;
  identicalNoopCount?: number;
  errors: Array<{ code: string; message: string; path?: string }>;
};

export type AiImportReceipt = {
  ok: true;
  importBatchId: string;
  packageId: string;
  packageSha256: string;
  insertedCount: number;
  replacedCount: number;
  protectedSkipCount: number;
  identicalNoopCount: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  completedAt: string;
  idempotent: boolean;
};

const rank: Record<ReviewState, number> = { AI_ONLY: 0, REVIEW_PARTIAL: 1, REVIEW_COMPLETED: 2 };
const json = (value: unknown) => JSON.stringify(value ?? null);
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const nowIso = () => new Date().toISOString();
const rows = <T>(value: unknown) => value as T[];

export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("JCS_UNSUPPORTED_VALUE");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`).join(",")}}`;
}

export function canonicalSha256(value: unknown) {
  return sha256(Buffer.from(canonicalizeJson(value), "utf8"));
}

export function expectedDedupeKey(sourceDatabaseId: string, evidenceId: string) {
  return sha256(`JAA-AI-RECORD-v1\n${sourceDatabaseId}\n${evidenceId}`);
}

function semverAtMost(required: string, current: string) {
  const parse = (value: string) => value.split(".").map((item) => Number.parseInt(item, 10) || 0);
  const a = parse(required);
  const b = parse(current);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] < b[index]) return true;
    if (a[index] > b[index]) return false;
  }
  return true;
}

function reviewStateOf(pkg: JsonRecord): ReviewState {
  const declared = String(pkg.reviewCoverage?.reviewRank ?? "");
  if (declared === "REVIEW_COMPLETED" || declared === "REVIEW_PARTIAL" || declared === "AI_ONLY") return declared;
  if (pkg.reviewCoverage?.state === "COMPLETED") return "REVIEW_COMPLETED";
  if (pkg.reviewCoverage?.state === "PARTIAL") return "REVIEW_PARTIAL";
  return "AI_ONLY";
}

function jsonPath(instancePath: string, additionalProperty?: string) {
  const segments = instancePath.split("/").filter(Boolean).map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  let result = "$";
  for (const segment of segments) result += /^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`;
  if (additionalProperty) result += `.${additionalProperty}`;
  return result;
}

function wrongFileRole(pkg: JsonRecord): { code: string; message: string } | null {
  const schemaName = String(pkg?.schemaName ?? pkg?.schema ?? "");
  if (schemaName === AI_IMPORT_SCHEMA_NAME) return null;
  const identity = `${schemaName} ${String(pkg?.schemaVersion ?? "")}`.toLowerCase();
  if (identity.includes("manual-skill-review") || identity.includes("manual_review")) {
    return { code: "WRONG_FILE_ROLE_MANUAL_REVIEW", message: "Manual Review JSON stores review progress; export a JAA AI Analysis Import Package first." };
  }
  if (identity.includes("pending-analysis") || identity.includes("pending_analysis")) {
    return { code: "WRONG_FILE_ROLE_PENDING", message: "Pending Analysis JSON is source input, not an AI database import package." };
  }
  if (identity.includes("analyzed") || identity.includes("analysis-result") || identity.includes("canonical-output")) {
    return { code: "WRONG_FILE_ROLE_LEGACY_ANALYZED", message: "Legacy analyzed output must be converted to jaa-ai-analysis-import-package v1.0.0." };
  }
  return { code: "UNSUPPORTED_FILE_TYPE", message: "The selected JSON is not a supported JAA AI Analysis Import Package." };
}

function validateHashes(pkg: JsonRecord, errors: AiImportPreview["errors"]) {
  for (const record of pkg.records as JsonRecord[]) {
    const index = Number(record.recordIndex);
    const expected = {
      sourceReferenceSha256: canonicalSha256(record.sourceReference),
      sourceSnapshotSha256: canonicalSha256(record.sourceSnapshot),
      aiAnalysisSha256: canonicalSha256(record.aiAnalysis),
      manualReviewSha256: record.manualReview === null ? null : canonicalSha256(record.manualReview),
      recordSha256: canonicalSha256({
        recordIndex: record.recordIndex,
        dedupeKey: record.dedupeKey,
        sourceReference: record.sourceReference,
        sourceSnapshot: record.sourceSnapshot,
        aiAnalysis: record.aiAnalysis,
        manualReview: record.manualReview
      })
    };
    for (const [key, value] of Object.entries(expected)) {
      if (record.integrity?.[key] !== value) errors.push({ code: "RECORD_HASH_MISMATCH", message: `${key} does not match canonical content.`, path: `/records/${index}/integrity/${key}` });
    }
    const ref = record.sourceReference;
    if (record.dedupeKey !== expectedDedupeKey(String(ref.sourceDatabaseId), String(ref.evidenceId))) {
      errors.push({ code: "DEDUPE_KEY_MISMATCH", message: "dedupeKey does not match the v1 identity formula.", path: `/records/${index}/dedupeKey` });
    }
    for (const [findingIndex, finding] of (record.aiAnalysis?.skillFindings ?? []).entries()) {
      for (const [evidenceIndex, evidence] of (finding.evidence ?? []).entries()) {
        if (!String(evidence.sourceJsonPointer ?? "").trim() || !String(evidence.quote ?? "").trim()) {
          errors.push({ code: "EMPTY_EVIDENCE", message: "Evidence pointer and quote must be non-empty.", path: `/records/${index}/aiAnalysis/skillFindings/${findingIndex}/evidence/${evidenceIndex}` });
        }
      }
    }
  }
  const sourceScope = pkg.records.map((record: JsonRecord) => ({ sourceReference: record.sourceReference, sourceSnapshot: record.sourceSnapshot }));
  const aiScope = pkg.records.map((record: JsonRecord) => record.aiAnalysis);
  const reviewScope = pkg.records.map((record: JsonRecord) => record.manualReview);
  if (canonicalSha256(sourceScope) !== pkg.integrity?.sourceReferencesSha256) errors.push({ code: "SOURCE_SCOPE_HASH_MISMATCH", message: "sourceReferencesSha256 does not match records." });
  if (canonicalSha256(aiScope) !== pkg.integrity?.aiAnalysisSha256) errors.push({ code: "AI_SCOPE_HASH_MISMATCH", message: "aiAnalysisSha256 does not match records." });
  const reviewHash = reviewStateOf(pkg) === "AI_ONLY" ? null : canonicalSha256(reviewScope);
  if (reviewHash !== pkg.integrity?.manualReviewSha256) errors.push({ code: "REVIEW_SCOPE_HASH_MISMATCH", message: "manualReviewSha256 does not match records." });
  const packageForHash = structuredClone(pkg);
  delete packageForHash.integrity.packageSha256;
  if (canonicalSha256(packageForHash) !== pkg.integrity?.packageSha256) errors.push({ code: "PACKAGE_HASH_MISMATCH", message: "packageSha256 does not match the RFC8785 package content." });
}

export function validateAiImportPackage(input: {
  filePath: string;
  schemaPath: string;
  appVersion?: string;
  databasePath?: string;
}): { preview: AiImportPreview; pkg?: JsonRecord } {
  const filePath = path.resolve(input.filePath);
  const errors: AiImportPreview["errors"] = [];
  let stat: fs.Stats;
  try { stat = fs.statSync(filePath); } catch { return { preview: { ok: false, filePath, fileName: path.basename(filePath), fileSizeBytes: 0, errors: [{ code: "FILE_NOT_FOUND", message: "Import package cannot be read." }] } }; }
  if (stat.size > 128 * 1024 * 1024) errors.push({ code: "FILE_TOO_LARGE", message: "Import package exceeds 128 MiB." });
  let pkg: JsonRecord;
  try { pkg = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (error) {
    return { preview: { ok: false, filePath, fileName: path.basename(filePath), fileSizeBytes: stat.size, errors: [{ code: "INVALID_JSON", message: error instanceof Error ? error.message : String(error) }] } };
  }
  const schemaBuffer = fs.readFileSync(input.schemaPath);
  if (sha256(schemaBuffer) !== AI_IMPORT_SCHEMA_SHA256) errors.push({ code: "LOCAL_SCHEMA_SHA_MISMATCH", message: "Bundled import schema SHA-256 is not approved." });
  const roleError = wrongFileRole(pkg);
  if (roleError) {
    return { preview: { ok: false, filePath, fileName: path.basename(filePath), fileSizeBytes: stat.size, reviewState: reviewStateOf(pkg), recordCount: Array.isArray(pkg.records) ? pkg.records.length : 0, findingCount: Number(pkg.counts?.skillFindingCount ?? 0), errors: [roleError] } };
  }
  if (pkg.schemaVersion !== AI_IMPORT_SCHEMA_VERSION || pkg.schemaSha256 !== AI_IMPORT_SCHEMA_SHA256) errors.push({ code: "IMPORT_SCHEMA_IDENTITY_MISMATCH", message: "Import package schema version or SHA-256 does not match the frozen v1.0.0 contract." });
  if (!semverAtMost(String(pkg.minimumImporterVersion ?? "999.0.0"), input.appVersion ?? "0.3.39")) errors.push({ code: "IMPORTER_VERSION_TOO_OLD", message: `Package requires importer ${pkg.minimumImporterVersion}.` });
  for (const capability of pkg.requiredCapabilities ?? []) if (!AI_IMPORT_CAPABILITIES.includes(capability)) errors.push({ code: "UNSUPPORTED_CAPABILITY", message: `Unsupported required capability: ${capability}` });
  try {
    const schema = JSON.parse(schemaBuffer.toString("utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(pkg);
    if (!valid) for (const error of validate.errors ?? []) {
      const additionalProperty = error.keyword === "additionalProperties" ? String(error.params?.additionalProperty ?? "") : "";
      const precisePath = jsonPath(String(error.instancePath ?? ""), additionalProperty || undefined);
      const message = additionalProperty ? `unexpected property ${additionalProperty}` : error.message ?? "Schema validation failed.";
      errors.push({ code: "SCHEMA_VALIDATION_FAILED", message, path: precisePath });
    }
  } catch (error) { errors.push({ code: "SCHEMA_VALIDATOR_FAILED", message: error instanceof Error ? error.message : String(error) }); }
  if (Array.isArray(pkg.records)) {
    const dedupe = new Set<string>();
    const evidence = new Set<string>();
    let findingCount = 0;
    pkg.records.forEach((record: JsonRecord, index: number) => {
      if (record.recordIndex !== index) errors.push({ code: "RECORD_ORDER_INVALID", message: "recordIndex must be contiguous and preserve array order.", path: `/records/${index}/recordIndex` });
      if (dedupe.has(record.dedupeKey)) errors.push({ code: "DUPLICATE_DEDUPE_KEY", message: "Package contains a duplicate dedupeKey.", path: `/records/${index}/dedupeKey` });
      if (evidence.has(record.sourceReference?.evidenceId)) errors.push({ code: "DUPLICATE_EVIDENCE_ID", message: "Package contains a duplicate evidenceId.", path: `/records/${index}/sourceReference/evidenceId` });
      dedupe.add(record.dedupeKey); evidence.add(record.sourceReference?.evidenceId);
      const skills = new Set<string>();
      for (const finding of record.aiAnalysis?.skillFindings ?? []) {
        findingCount += 1;
        if (skills.has(finding.skillId)) errors.push({ code: "DUPLICATE_SKILL_ID", message: "Record contains duplicate Skill IDs.", path: `/records/${index}/aiAnalysis/skillFindings` });
        skills.add(finding.skillId);
      }
    });
    if (pkg.records.length !== pkg.counts?.recordCount || pkg.records.length !== pkg.reviewCoverage?.totalRecordCount || pkg.records.length !== pkg.sourceBinding?.sourceRecordCount) errors.push({ code: "RECORD_COUNT_MISMATCH", message: "Declared record counts do not match records.length." });
    if (findingCount !== pkg.counts?.skillFindingCount) errors.push({ code: "FINDING_COUNT_MISMATCH", message: "Declared finding count does not match package contents." });
    const integrityErrorStart = errors.length;
    validateHashes(pkg, errors);
    if (errors.slice(integrityErrorStart).some((error) => /HASH_MISMATCH$/.test(error.code))) {
      errors.push({ code: "PACKAGE_INTEGRITY_FAILED", message: "One or more package, record, or layer integrity hashes do not match." });
    }
  }
  const preview: AiImportPreview = { ok: errors.length === 0, filePath, fileName: path.basename(filePath), fileSizeBytes: stat.size, packageId: pkg.packageId, packageSha256: pkg.integrity?.packageSha256, reviewState: reviewStateOf(pkg), recordCount: pkg.records?.length ?? 0, findingCount: pkg.counts?.skillFindingCount ?? 0, errors };
  if (preview.ok && input.databasePath && fs.existsSync(input.databasePath)) Object.assign(preview, previewActions(input.databasePath, pkg));
  return { preview, pkg };
}

function configure(db: DatabaseSync, readOnly = false) {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY;${readOnly ? " PRAGMA query_only=ON;" : " PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;"}`);
}

export function initializeAiAnalysisDatabase(input: { databasePath: string; ddlPath: string; appVersion: string; databaseId?: string }) {
  const databasePath = path.resolve(input.databasePath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const existed = fs.existsSync(databasePath);
  const db = new DatabaseSync(databasePath);
  try {
    configure(db);
    const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    if (version > AI_DATABASE_SCHEMA_VERSION) return { databasePath, status: "READ_ONLY_TOO_NEW" as const, schemaVersion: version };
    if (!existed || version === 0) {
      db.exec(fs.readFileSync(input.ddlPath, "utf8"));
      const now = nowIso();
      db.prepare(`INSERT INTO ai_database_metadata(singleton_id,database_id,schema_name,schema_version,created_at_utc,updated_at_utc,created_by_app_version,last_migrated_by_app_version,metadata_json) VALUES(1,?,?,?,?,?,?,?,?)`).run(input.databaseId ?? crypto.randomUUID(), AI_DATABASE_SCHEMA_NAME, AI_DATABASE_SCHEMA_VERSION, now, now, input.appVersion, input.appVersion, "{}");
    }
    const integrity = String((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check);
    const foreignKeys = rows(db.prepare("PRAGMA foreign_key_check").all()).length;
    return { databasePath, status: integrity === "ok" && foreignKeys === 0 ? "READY" as const : "READ_ONLY_INTEGRITY_FAILED" as const, schemaVersion: AI_DATABASE_SCHEMA_VERSION, integrity, foreignKeyErrors: foreignKeys };
  } finally { db.close(); }
}

function previewActions(databasePath: string, pkg: JsonRecord) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    configure(db, true);
    let insertCount = 0, replaceCount = 0, protectedSkipCount = 0, identicalNoopCount = 0;
    const incomingState = reviewStateOf(pkg);
    const statement = db.prepare("SELECT review_state, ai_analysis_sha256, manual_review_sha256 FROM ai_analysis_records WHERE dedupe_key=?");
    for (const record of pkg.records) {
      const existing = statement.get(record.dedupeKey) as { review_state: ReviewState; ai_analysis_sha256: string; manual_review_sha256: string | null } | undefined;
      if (!existing) insertCount += 1;
      else if (rank[incomingState] < rank[existing.review_state]) protectedSkipCount += 1;
      else if (existing.ai_analysis_sha256 === record.integrity.aiAnalysisSha256 && (existing.manual_review_sha256 ?? null) === (record.integrity.manualReviewSha256 ?? null)) identicalNoopCount += 1;
      else replaceCount += 1;
    }
    return { insertCount, replaceCount, protectedSkipCount, identicalNoopCount };
  } finally { db.close(); }
}

function reviewSchema(pkg: JsonRecord) {
  const source = (pkg.conversionReceipt?.sourceFiles ?? []).find((item: JsonRecord) => item.role === "MANUAL_REVIEW_JSON");
  return { name: "jaa-manual-skill-review", version: String(pkg.conversionReceipt?.sourceFormat ?? "").match(/manual review v([^ ]+)/)?.[1] ?? "1.0.0", sha: source?.sha256 ?? "0".repeat(64) };
}

function insertChildren(db: DatabaseSync, record: JsonRecord, aiRecordId: string, importedAt: string, pkg: JsonRecord) {
  const findingIds = new Map<string, string>();
  const findingSql = db.prepare("INSERT INTO ai_skill_findings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const evidenceSql = db.prepare("INSERT INTO ai_skill_evidence VALUES(?,?,?,?,?,?,?,?)");
  for (const [index, finding] of (record.aiAnalysis.skillFindings ?? []).entries()) {
    const findingId = `aif_${sha256(`${aiRecordId}\n${finding.skillId}`).slice(0, 40)}`;
    findingIds.set(finding.skillId, findingId);
    findingSql.run(findingId, aiRecordId, index, finding.skillId, finding.skillName, finding.group, finding.confidence, finding.evidenceExplanation, finding.rationale, json(finding.negativeChecks ?? []), json(finding.nearSkills ?? []), json(finding), canonicalSha256(finding));
    for (const [evidenceIndex, evidence] of (finding.evidence ?? []).entries()) evidenceSql.run(`aie_${sha256(`${findingId}\n${evidenceIndex}`).slice(0, 40)}`, findingId, evidenceIndex, evidence.sourceJsonPointer, evidence.quote, sha256(String(evidence.quote)), evidence.role ?? null, evidence.explanation ?? null);
  }
  const review = record.manualReview;
  if (!review) return;
  const reviewContract = reviewSchema(pkg);
  db.prepare("INSERT INTO ai_record_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(aiRecordId, review.expectedStatus, review.statusAgreement, review.skillIdentificationState, review.notes ?? "", review.completed ? 1 : 0, review.reviewer ?? "", reviewContract.name, reviewContract.version, reviewContract.sha, "UNIFIED_IMPORT_PACKAGE", review.createdAt ?? null, review.updatedAt ?? null, importedAt, json(review));
  const skillReviewSql = db.prepare("INSERT INTO ai_skill_reviews VALUES(?,?,?,?,?,?,?,?,?)");
  for (const item of review.skillReviews ?? []) {
    const findingId = findingIds.get(item.skillId);
    if (!findingId) throw new Error(`REVIEW_FINDING_NOT_FOUND:${item.skillId}`);
    skillReviewSql.run(`aisr_${sha256(`${aiRecordId}\n${item.skillId}`).slice(0, 40)}`, aiRecordId, findingId, item.skillId, item.aiConfidence, item.verdict, item.proposedConfidence ?? null, item.notes ?? "", json(item));
  }
  const missingSql = db.prepare("INSERT INTO ai_missing_skill_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const item of review.missingSkillReviews ?? []) missingSql.run(`aim_${sha256(`${aiRecordId}\n${item.skillId}`).slice(0, 40)}`, aiRecordId, item.skillId, item.skillName, item.group, item.suggestedConfidence, item.sourceJsonPointer, item.quote, sha256(String(item.quote)), item.reason, json(item.negativeChecks ?? []), "UNIFIED_IMPORT_PACKAGE", item.confirmed === false ? 0 : 1, json(item));
  const assignmentSql = db.prepare("INSERT INTO ai_additional_evidence_assignments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const item of review.additionalEvidenceAssignments ?? []) assignmentSql.run(`aia_${sha256(`${aiRecordId}\n${item.targetSkillId}\n${item.sourceJsonPointer}`).slice(0, 40)}`, aiRecordId, item.targetSkillId, findingIds.has(item.targetSkillId) ? "EXISTING" : "MISSING", item.sourceFindingSkillId ?? null, item.sourceJsonPointer, item.quote, sha256(String(item.quote)), item.suggestedConfidence ?? null, item.reason, json(item.negativeChecks ?? []), "UNIFIED_IMPORT_PACKAGE", item.confirmed === false ? 0 : 1, json(item));
}

function createRecordValues(record: JsonRecord, aiRecordId: string, batchId: string, importedAt: string, firstImportedAt: string, rowVersion: number, incomingState: ReviewState) {
  const ref = record.sourceReference, snap = record.sourceSnapshot, ai = record.aiAnalysis, review = record.manualReview;
  const completed = incomingState === "REVIEW_COMPLETED";
  return [aiRecordId, record.dedupeKey, ref.sourceDatabaseId, ref.jiraServerFingerprint, ref.evidenceId, ref.activityEventId, ref.sourceRecordStableId, ref.issueId ?? null, ref.issueKey, ref.projectKey ?? null, snap.issueType ?? null, snap.priority ?? null, snap.issueStatus ?? null, ref.fieldId ?? null, ref.fieldName, ref.eventTime, ref.actor.stableIdentity, ref.actor.displayValue, ref.sourceContentHash, json(ref), json(snap), ai.status, ai.confidence, ai.rationale, json(ai.recordNegativeChecks ?? []), json(ai.unknownReasons ?? []), json(ai), incomingState, completed ? review.expectedStatus : ai.status, completed ? "MANUAL_COMPLETED" : "AI", completed ? 1 : 0, review ? json(review) : null, record.integrity.aiAnalysisSha256, record.integrity.manualReviewSha256, record.integrity.recordSha256, batchId, firstImportedAt, importedAt, rowVersion];
}

function attemptSourceLink(db: DatabaseSync, input: { aiRecordId: string; batchId?: string; sourceDatabasePath?: string; trigger: string; appVersion: string }) {
  const started = Date.now();
  const record = db.prepare("SELECT * FROM ai_analysis_records WHERE ai_record_id=?").get(input.aiRecordId) as JsonRecord;
  let result: { status: LinkStatus; method: string | null; candidateCount: number; ids: string[]; matchedId?: string; diagnostic: string; message: string } = { status: "SOURCE_DATABASE_NOT_AVAILABLE", method: null, candidateCount: 0, ids: [], diagnostic: "SOURCE_DATABASE_NOT_AVAILABLE", message: "The bound source database is not open or available." };
  if (input.sourceDatabasePath && fs.existsSync(input.sourceDatabasePath)) {
    let source: DatabaseSync | undefined;
    try {
      source = new DatabaseSync(input.sourceDatabasePath, { readOnly: true });
      source.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=5000");
      const metadata = source.prepare("SELECT database_id FROM database_metadata LIMIT 1").get() as { database_id?: string } | undefined;
      if (metadata?.database_id !== record.source_database_id) result = { status: "SOURCE_IDENTITY_MISMATCH", method: null, candidateCount: 0, ids: [], diagnostic: "SOURCE_DATABASE_ID_MISMATCH", message: "Source database identity does not match the imported binding." };
      else {
        let candidates = rows<JsonRecord>(source.prepare("SELECT * FROM activity_events WHERE id=?").all(record.activity_event_id));
        let method = "SOURCE_DATABASE_AND_ACTIVITY_EVENT";
        if (!candidates.length) { candidates = rows<JsonRecord>(source.prepare("SELECT * FROM activity_events WHERE source_record_id=? AND field_name=? AND event_time=?").all(record.source_record_stable_id, record.field_name, record.event_time_utc)); method = "STABLE_RECORD_FALLBACK"; }
        if (!candidates.length) result = { status: "SOURCE_RECORD_NOT_FOUND", method: null, candidateCount: 0, ids: [], diagnostic: "SOURCE_RECORD_NOT_FOUND", message: "No source activity event matched the primary or fallback key." };
        else if (candidates.length > 1) result = { status: "AMBIGUOUS", method: null, candidateCount: candidates.length, ids: candidates.map((item) => String(item.id)), diagnostic: "MULTIPLE_SOURCE_CANDIDATES", message: "Multiple source activity events matched; no candidate was selected." };
        else {
          const candidate = candidates[0];
          const hashes = new Set([String(candidate.event_hash ?? ""), sha256(String(candidate.to_value_json ?? ""))]);
          try { hashes.add(canonicalSha256(JSON.parse(String(candidate.to_value_json ?? "null")))); } catch { /* Raw hash still applies. */ }
          if (!hashes.has(record.source_content_hash)) result = { status: "SOURCE_CONTENT_MISMATCH", method: null, candidateCount: 1, ids: [String(candidate.id)], diagnostic: "SOURCE_CONTENT_HASH_MISMATCH", message: "Source identity matched but content hash verification failed." };
          else result = { status: "MATCHED", method, candidateCount: 1, ids: [String(candidate.id)], matchedId: String(candidate.id), diagnostic: "MATCHED", message: "Source activity event matched and content was verified." };
        }
      }
    } catch (error) { result = { status: "LINK_ERROR", method: null, candidateCount: 0, ids: [], diagnostic: "SOURCE_LINK_ERROR", message: error instanceof Error ? error.message : String(error) }; }
    finally { source?.close(); }
  }
  const attemptedAt = nowIso();
  const existing = db.prepare("SELECT attempt_count,first_attempt_at_utc FROM ai_source_links WHERE ai_record_id=?").get(input.aiRecordId) as JsonRecord | undefined;
  db.prepare(`INSERT INTO ai_source_links(ai_record_id,link_status,link_method,matched_source_database_id,matched_activity_event_id,matched_raw_record_id,candidate_count,source_identity_match,source_content_match,diagnostic_code,diagnostic_message,first_attempt_at_utc,last_attempt_at_utc,attempt_count,link_debug_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ai_record_id) DO UPDATE SET link_status=excluded.link_status,link_method=excluded.link_method,matched_source_database_id=excluded.matched_source_database_id,matched_activity_event_id=excluded.matched_activity_event_id,matched_raw_record_id=excluded.matched_raw_record_id,candidate_count=excluded.candidate_count,source_identity_match=excluded.source_identity_match,source_content_match=excluded.source_content_match,diagnostic_code=excluded.diagnostic_code,diagnostic_message=excluded.diagnostic_message,last_attempt_at_utc=excluded.last_attempt_at_utc,attempt_count=excluded.attempt_count,link_debug_json=excluded.link_debug_json`).run(input.aiRecordId, result.status, result.method, result.status === "MATCHED" ? record.source_database_id : null, result.matchedId ?? null, result.matchedId ?? null, result.candidateCount, result.status === "SOURCE_IDENTITY_MISMATCH" ? 0 : result.status === "SOURCE_DATABASE_NOT_AVAILABLE" ? null : 1, result.status === "MATCHED" ? 1 : result.status === "SOURCE_CONTENT_MISMATCH" ? 0 : null, result.diagnostic, result.message, existing?.first_attempt_at_utc ?? attemptedAt, attemptedAt, Number(existing?.attempt_count ?? 0) + 1, json({ candidateIds: result.ids }));
  db.prepare("INSERT INTO ai_source_link_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), input.aiRecordId, input.batchId ?? null, input.trigger, record.source_database_id, record.jira_server_fingerprint, json({ sourceDatabaseId: record.source_database_id, activityEventId: record.activity_event_id }), json({ sourceDatabaseId: record.source_database_id, sourceRecordStableId: record.source_record_stable_id, fieldName: record.field_name, eventTime: record.event_time_utc }), result.candidateCount, json(result.ids), result.status, result.method, result.diagnostic, result.message, attemptedAt, input.appVersion, Date.now() - started);
  return result.status;
}

export function importAiAnalysisPackage(input: { databasePath: string; ddlPath: string; schemaPath: string; packagePath: string; appVersion: string; sourceDatabasePath?: string; failAfterRecord?: number }): AiImportReceipt {
  initializeAiAnalysisDatabase({ databasePath: input.databasePath, ddlPath: input.ddlPath, appVersion: input.appVersion });
  const validated = validateAiImportPackage({ filePath: input.packagePath, schemaPath: input.schemaPath, appVersion: input.appVersion, databasePath: input.databasePath });
  if (!validated.preview.ok || !validated.pkg) throw Object.assign(new Error("AI_IMPORT_PREFLIGHT_FAILED"), { preview: validated.preview });
  const pkg = validated.pkg;
  const db = new DatabaseSync(input.databasePath);
  configure(db);
  const existingBatch = db.prepare("SELECT import_batch_id,inserted_count,replaced_count,protected_skip_count,identical_noop_count,matched_count,unmatched_count,ambiguous_count,completed_at_utc FROM ai_import_batches WHERE package_sha256=? AND status='COMPLETED'").get(pkg.integrity.packageSha256) as JsonRecord | undefined;
  if (existingBatch) { db.close(); return { ok: true, importBatchId: existingBatch.import_batch_id, packageId: pkg.packageId, packageSha256: pkg.integrity.packageSha256, insertedCount: existingBatch.inserted_count, replacedCount: existingBatch.replaced_count, protectedSkipCount: existingBatch.protected_skip_count, identicalNoopCount: existingBatch.identical_noop_count, matchedCount: existingBatch.matched_count, unmatchedCount: existingBatch.unmatched_count, ambiguousCount: existingBatch.ambiguous_count, completedAt: existingBatch.completed_at_utc, idempotent: true }; }
  const batchId = crypto.randomUUID(), importedAt = nowIso(), incomingState = reviewStateOf(pkg);
  const counts = { inserted: 0, replaced: 0, protected: 0, noop: 0, matched: 0, unmatched: 0, ambiguous: 0 };
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare(`INSERT INTO ai_import_batches(import_batch_id,package_id,package_sha256,original_file_name,original_file_path,original_file_size_bytes,schema_name,schema_version,schema_sha256,minimum_importer_version,required_capabilities_json,generator_json,source_database_id,jira_server_fingerprint,jira_server_host,pending_file_name,pending_sha256,pending_schema_name,pending_schema_version,export_id,source_view,source_created_at,source_timezone,query_snapshot_json,export_metadata_json,rule_set_id,manifest_version,manifest_sha256,common_rules_version,common_rules_sha256,catalog_version,catalog_sha256,template_id,template_version,template_schema_version,template_sha256,review_coverage_state,declared_record_count,validated_record_count,status,validation_summary_json,package_integrity_json,conversion_receipt_json,previewed_at_utc,imported_at_utc,importer_app_version) VALUES(${Array(46).fill("?").join(",")})`).run(batchId, pkg.packageId, pkg.integrity.packageSha256, path.basename(input.packagePath), path.resolve(input.packagePath), fs.statSync(input.packagePath).size, pkg.schemaName, pkg.schemaVersion, pkg.schemaSha256, pkg.minimumImporterVersion, json(pkg.requiredCapabilities), json(pkg.generator), pkg.sourceBinding.sourceDatabaseId, pkg.sourceBinding.jiraServerFingerprint, pkg.sourceBinding.jiraServerHost ?? null, pkg.sourceBinding.pendingFilename, pkg.sourceBinding.pendingSha256, pkg.sourceBinding.pendingSchemaName, pkg.sourceBinding.pendingSchemaVersion, pkg.sourceBinding.exportId, pkg.sourceBinding.sourceView, pkg.sourceBinding.createdAt, pkg.sourceBinding.timezone, json(pkg.sourceBinding.querySnapshot), json(pkg.sourceBinding.exportMetadata), pkg.rulesBinding.ruleSetId, pkg.rulesBinding.manifestVersion, pkg.rulesBinding.manifestSha256, pkg.rulesBinding.commonRulesVersion, pkg.rulesBinding.commonRulesSha256, pkg.rulesBinding.catalogVersion, pkg.rulesBinding.catalogSha256, pkg.templateBinding?.templateId ?? null, pkg.templateBinding?.templateVersion ?? null, pkg.templateBinding?.templateSchemaVersion ?? null, pkg.templateBinding?.templateSha256 ?? null, pkg.reviewCoverage.state, pkg.records.length, pkg.records.length, "IMPORTING", json(validated.preview), json(pkg.integrity), pkg.conversionReceipt ? json(pkg.conversionReceipt) : null, importedAt, importedAt, input.appVersion);
    const findExisting = db.prepare("SELECT * FROM ai_analysis_records WHERE dedupe_key=?");
    const insertRecord = db.prepare(`INSERT INTO ai_analysis_records VALUES(${Array(39).fill("?").join(",")})`);
    const updateRecord = db.prepare(`UPDATE ai_analysis_records SET ${[
      "dedupe_key", "source_database_id", "jira_server_fingerprint", "evidence_id", "activity_event_id", "source_record_stable_id", "issue_id", "issue_key", "project_key", "issue_type", "priority", "issue_status", "field_id", "field_name", "event_time_utc", "actor_stable_identity", "actor_display_value", "source_content_hash", "source_reference_json", "source_snapshot_json", "ai_status", "ai_confidence", "ai_rationale", "ai_record_negative_checks_json", "ai_unknown_reasons_json", "ai_analysis_json", "review_state", "effective_status", "effective_status_source", "is_human_verified", "manual_review_json", "ai_analysis_sha256", "manual_review_sha256", "record_integrity_sha256", "current_import_batch_id", "updated_at_utc", "row_version"
    ].map((column) => `${column}=?`).join(",")} WHERE ai_record_id=?`);
    const action = db.prepare("INSERT INTO ai_import_actions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    for (const [index, record] of pkg.records.entries()) {
      const existing = findExisting.get(record.dedupeKey) as JsonRecord | undefined;
      let actionType: string, reasonCode: string, resultId: string | null = existing?.ai_record_id ?? null;
      if (!existing) { actionType = "INSERTED"; reasonCode = "NEW_DEDUPE_KEY"; resultId = `air_${record.dedupeKey.slice(0, 40)}`; insertRecord.run(...createRecordValues(record, resultId, batchId, importedAt, importedAt, 1, incomingState)); insertChildren(db, record, resultId, importedAt, pkg); counts.inserted += 1; }
      else if (rank[incomingState] < rank[existing.review_state as ReviewState]) { actionType = "SKIPPED_PROTECTED_REVIEW"; reasonCode = "LOWER_REVIEW_RANK"; counts.protected += 1; }
      else if (existing.ai_analysis_sha256 === record.integrity.aiAnalysisSha256 && (existing.manual_review_sha256 ?? null) === (record.integrity.manualReviewSha256 ?? null)) { actionType = "NOOP_IDENTICAL"; reasonCode = "IDENTICAL_CONTENT"; counts.noop += 1; }
      else {
        actionType = "REPLACED"; reasonCode = "EQUAL_OR_HIGHER_REVIEW_RANK";
        db.prepare("DELETE FROM ai_additional_evidence_assignments WHERE ai_record_id=?").run(existing.ai_record_id);
        db.prepare("DELETE FROM ai_missing_skill_reviews WHERE ai_record_id=?").run(existing.ai_record_id);
        db.prepare("DELETE FROM ai_record_reviews WHERE ai_record_id=?").run(existing.ai_record_id);
        db.prepare("DELETE FROM ai_skill_findings WHERE ai_record_id=?").run(existing.ai_record_id);
        const values = createRecordValues(record, existing.ai_record_id, batchId, importedAt, existing.first_imported_at_utc, Number(existing.row_version) + 1, incomingState);
        updateRecord.run(...values.slice(1, 36), values[37], values[38], existing.ai_record_id);
        insertChildren(db, record, existing.ai_record_id, importedAt, pkg);
        resultId = existing.ai_record_id; counts.replaced += 1;
      }
      let linkStatus = existing ? String((db.prepare("SELECT link_status FROM ai_source_links WHERE ai_record_id=?").get(resultId) as JsonRecord | undefined)?.link_status ?? "NOT_ATTEMPTED") : "NOT_ATTEMPTED";
      if (actionType === "INSERTED" || actionType === "REPLACED") linkStatus = attemptSourceLink(db, { aiRecordId: resultId!, batchId, sourceDatabasePath: input.sourceDatabasePath, trigger: "IMPORT", appVersion: input.appVersion });
      if (linkStatus === "MATCHED") counts.matched += 1; else if (linkStatus === "AMBIGUOUS") counts.ambiguous += 1; else counts.unmatched += 1;
      action.run(crypto.randomUUID(), batchId, index, record.sourceReference.evidenceId, record.dedupeKey, existing?.ai_record_id ?? null, resultId, existing?.review_state ?? null, incomingState, actionType, reasonCode, actionType.replaceAll("_", " "), existing?.ai_analysis_sha256 ?? null, record.integrity.aiAnalysisSha256, existing?.manual_review_sha256 ?? null, record.integrity.manualReviewSha256 ?? null, linkStatus, nowIso(), json({ rowVersionBefore: existing?.row_version ?? 0 }));
      if (input.failAfterRecord === index + 1) throw new Error("SYNTHETIC_IMPORT_FAILURE");
    }
    const invariantSql = [
      "SELECT COUNT(*) AS count FROM ai_analysis_records r LEFT JOIN ai_source_links l ON l.ai_record_id=r.ai_record_id WHERE l.ai_record_id IS NULL",
      "SELECT COUNT(*) AS count FROM ai_analysis_records r JOIN ai_record_reviews rr ON rr.ai_record_id=r.ai_record_id WHERE r.review_state='AI_ONLY'",
      "SELECT COUNT(*) AS count FROM ai_analysis_records r LEFT JOIN ai_record_reviews rr ON rr.ai_record_id=r.ai_record_id WHERE r.review_state IN ('REVIEW_PARTIAL','REVIEW_COMPLETED') AND rr.ai_record_id IS NULL",
      "SELECT COUNT(*) AS count FROM ai_analysis_records r JOIN ai_record_reviews rr ON rr.ai_record_id=r.ai_record_id WHERE r.review_state='REVIEW_COMPLETED' AND rr.completed<>1",
      "SELECT COUNT(*) AS count FROM ai_analysis_records r JOIN ai_skill_findings f ON f.ai_record_id=r.ai_record_id LEFT JOIN ai_skill_reviews sr ON sr.ai_record_id=r.ai_record_id AND sr.ai_finding_id=f.ai_finding_id WHERE r.review_state='REVIEW_COMPLETED' AND (sr.skill_review_id IS NULL OR sr.verdict='UNREVIEWED')",
      "SELECT COUNT(*) AS count FROM ai_skill_reviews sr JOIN ai_skill_findings f ON f.ai_finding_id=sr.ai_finding_id WHERE sr.skill_id<>f.skill_id",
      "SELECT COUNT(*) AS count FROM ai_missing_skill_reviews m JOIN ai_skill_findings f ON f.ai_record_id=m.ai_record_id AND f.skill_id=m.skill_id",
      "SELECT COUNT(*) AS count FROM ai_analysis_records r WHERE (r.review_state='REVIEW_COMPLETED' AND (r.effective_status_source<>'MANUAL_COMPLETED' OR r.is_human_verified<>1)) OR (r.review_state<>'REVIEW_COMPLETED' AND (r.effective_status_source<>'AI' OR r.is_human_verified<>0))"
    ];
    for (const sql of invariantSql) if (Number((db.prepare(sql).get() as { count: number }).count) !== 0) throw new Error("AI_DATABASE_INVARIANT_FAILED");
    const completedAt = nowIso();
    db.prepare("UPDATE ai_import_batches SET inserted_count=?,replaced_count=?,protected_skip_count=?,identical_noop_count=?,matched_count=?,unmatched_count=?,ambiguous_count=?,status='COMPLETED',completed_at_utc=? WHERE import_batch_id=?").run(counts.inserted, counts.replaced, counts.protected, counts.noop, counts.matched, counts.unmatched, counts.ambiguous, completedAt, batchId);
    db.prepare("UPDATE ai_database_metadata SET updated_at_utc=?,last_migrated_by_app_version=? WHERE singleton_id=1").run(completedAt, input.appVersion);
    db.exec("COMMIT");
    return { ok: true, importBatchId: batchId, packageId: pkg.packageId, packageSha256: pkg.integrity.packageSha256, insertedCount: counts.inserted, replacedCount: counts.replaced, protectedSkipCount: counts.protected, identicalNoopCount: counts.noop, matchedCount: counts.matched, unmatchedCount: counts.unmatched, ambiguousCount: counts.ambiguous, completedAt, idempotent: false };
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* Transaction may already be closed. */ } throw error; }
  finally { db.close(); }
}

export function relinkAiAnalysisSources(input: { databasePath: string; sourceDatabasePath?: string; appVersion: string }) {
  const db = new DatabaseSync(input.databasePath); configure(db);
  try { db.exec("BEGIN IMMEDIATE"); const ids = rows<{ ai_record_id: string }>(db.prepare("SELECT ai_record_id FROM ai_analysis_records ORDER BY ai_record_id").all()); const counts: Record<string, number> = {}; for (const { ai_record_id } of ids) { const status = attemptSourceLink(db, { aiRecordId: ai_record_id, sourceDatabasePath: input.sourceDatabasePath, trigger: "MANUAL_RELINK", appVersion: input.appVersion }); counts[status] = (counts[status] ?? 0) + 1; } db.exec("COMMIT"); return { ok: true, total: ids.length, counts }; } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no-op */ } throw error; } finally { db.close(); }
}

export function aiDatabaseOverview(databasePath: string) {
  if (!fs.existsSync(databasePath)) return { exists: false, databasePath, schemaVersion: 0, sizeBytes: 0, recordCount: 0, findingCount: 0, reviewedCount: 0, matchedCount: 0, integrity: "not-created", batches: [] };
  const db = new DatabaseSync(databasePath, { readOnly: true }); configure(db, true);
  try { const scalar = (sql: string) => Number((db.prepare(sql).get() as { value: number }).value); return { exists: true, databasePath, schemaVersion: Number((db.prepare("PRAGMA user_version").get() as JsonRecord).user_version), sizeBytes: fs.statSync(databasePath).size, recordCount: scalar("SELECT COUNT(*) value FROM ai_analysis_records"), findingCount: scalar("SELECT COUNT(*) value FROM ai_skill_findings"), reviewedCount: scalar("SELECT COUNT(*) value FROM ai_analysis_records WHERE review_state<>'AI_ONLY'"), matchedCount: scalar("SELECT COUNT(*) value FROM ai_source_links WHERE link_status='MATCHED'"), integrity: String((db.prepare("PRAGMA integrity_check").get() as JsonRecord).integrity_check), batches: rows(db.prepare("SELECT * FROM ai_import_batches ORDER BY COALESCE(completed_at_utc,previewed_at_utc) DESC LIMIT 100").all()) }; } finally { db.close(); }
}

function normalizedPage(payload: JsonRecord) { return { limit: Math.max(1, Math.min(500, Number(payload?.limit ?? 100))), offset: Math.max(0, Number(payload?.offset ?? 0)) }; }
function aiWhere(payload: JsonRecord) {
  const clauses: string[] = [], values: any[] = [];
  const mapping: Record<string, string> = { actor: "r.actor_stable_identity", project: "r.project_key", issue: "r.issue_key", field: "r.field_name", aiStatus: "r.ai_status", effectiveStatus: "r.effective_status", reviewState: "r.review_state", linkStatus: "l.link_status", skillId: "f.skill_id" };
  for (const [key, column] of Object.entries(mapping)) if (String(payload?.filters?.[key] ?? "").trim()) { clauses.push(`${column}=?`); values.push(String(payload.filters[key])); }
  if (payload?.filters?.startDate) { clauses.push("r.event_time_utc>=?"); values.push(String(payload.filters.startDate)); }
  if (payload?.filters?.endDate) { clauses.push("r.event_time_utc<?"); values.push(String(payload.filters.endDate)); }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

export function queryAiResults(databasePath: string, payload: JsonRecord = {}) {
  const db = new DatabaseSync(databasePath, { readOnly: true }); configure(db, true);
  try { const page = normalizedPage(payload), where = aiWhere(payload); const base = `FROM ai_analysis_records r LEFT JOIN ai_source_links l ON l.ai_record_id=r.ai_record_id LEFT JOIN ai_skill_findings f ON f.ai_record_id=r.ai_record_id ${where.sql}`; const total = Number((db.prepare(`SELECT COUNT(DISTINCT r.ai_record_id) value ${base}`).get(...where.values) as JsonRecord).value); const items = rows(db.prepare(`SELECT r.ai_record_id,r.evidence_id,r.issue_key,r.project_key,r.field_name,r.event_time_utc,r.actor_display_value,r.ai_status,r.effective_status,r.review_state,r.is_human_verified,r.ai_confidence,r.ai_rationale,r.source_snapshot_json,r.ai_analysis_json,r.manual_review_json,l.link_status,l.link_method,l.diagnostic_message,GROUP_CONCAT(DISTINCT f.skill_id) skill_ids ${base} GROUP BY r.ai_record_id ORDER BY r.event_time_utc DESC,r.ai_record_id LIMIT ? OFFSET ?`).all(...where.values, page.limit, page.offset)); return { total, ...page, items }; } finally { db.close(); }
}

export function exportAiDiagnostics(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true }); configure(db, true);
  try { return { schemaName: "jaa-ai-analysis-diagnostic-v1", createdAt: nowIso(), databasePath, metadata: rows(db.prepare("SELECT * FROM ai_database_metadata").all()), integrity: db.prepare("PRAGMA integrity_check").get(), foreignKeys: rows(db.prepare("PRAGMA foreign_key_check").all()), batches: rows(db.prepare("SELECT * FROM ai_import_batches ORDER BY previewed_at_utc DESC").all()), actions: rows(db.prepare("SELECT * FROM ai_import_actions ORDER BY occurred_at_utc DESC").all()), links: rows(db.prepare("SELECT * FROM ai_source_links").all()), linkAttempts: rows(db.prepare("SELECT * FROM ai_source_link_attempts ORDER BY attempted_at_utc DESC").all()) }; } finally { db.close(); }
}

export function queryIntegratedResults(sourceDatabasePath: string, aiDatabasePath: string, payload: JsonRecord = {}) {
  if (!sourceDatabasePath || !fs.existsSync(sourceDatabasePath)) return { total: 0, limit: 100, offset: 0, items: [], sourceAvailable: false };
  const db = new DatabaseSync(sourceDatabasePath, { readOnly: true });
  try {
    configure(db, true);
    db.prepare("ATTACH DATABASE ? AS ai").run(aiDatabasePath);
    const page = normalizedPage(payload);
    const clauses: string[] = [];
    const values: any[] = [];
    const mode = String(payload?.filters?.analysisState ?? "ALL");
    if (mode === "ANALYZED") clauses.push("r.ai_record_id IS NOT NULL");
    if (mode === "UNANALYZED") clauses.push("r.ai_record_id IS NULL");
    const mapping: Record<string, string> = { actor: "e.actor_account_id", issue: "o.object_key", field: "e.field_name", aiStatus: "r.ai_status", effectiveStatus: "r.effective_status", reviewState: "r.review_state", linkStatus: "l.link_status" };
    for (const [key, column] of Object.entries(mapping)) if (String(payload?.filters?.[key] ?? "").trim()) { clauses.push(`${column}=?`); values.push(String(payload.filters[key])); }
    if (payload?.filters?.startDate) { clauses.push("e.event_time>=?"); values.push(String(payload.filters.startDate)); }
    if (payload?.filters?.endDate) { clauses.push("e.event_time<?"); values.push(String(payload.filters.endDate)); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const base = `FROM activity_events e JOIN source_objects o ON o.source_object_id=e.source_object_id LEFT JOIN ai.ai_source_links l ON l.link_status='MATCHED' AND l.matched_source_database_id=(SELECT database_id FROM database_metadata LIMIT 1) AND l.matched_activity_event_id=e.id LEFT JOIN ai.ai_analysis_records r ON r.ai_record_id=l.ai_record_id ${where}`;
    const total = Number((db.prepare(`SELECT COUNT(*) value ${base}`).get(...values) as JsonRecord).value);
    const items = rows(db.prepare(`SELECT e.id activity_event_id,o.object_key issue_key,e.event_time,e.actor_account_id,e.actor_display_name,e.field_name,e.from_value_json,e.to_value_json,CASE WHEN r.ai_record_id IS NULL THEN 'UNANALYZED' WHEN l.link_status='MATCHED' THEN 'ANALYZED_MATCHED' ELSE 'ANALYZED_LINK_ERROR' END analysis_state,r.ai_record_id,r.ai_status,r.effective_status,r.review_state,r.ai_confidence,r.ai_rationale,l.link_status ${base} ORDER BY e.event_time DESC,e.id LIMIT ? OFFSET ?`).all(...values, page.limit, page.offset));
    return { total, ...page, items, sourceAvailable: true };
  } finally { try { db.exec("DETACH DATABASE ai"); } catch { /* Attachment may not exist. */ } db.close(); }
}

export function checkpointAiDatabase(databasePath: string) { if (!fs.existsSync(databasePath)) return { ok: true, exists: false }; const db = new DatabaseSync(databasePath); try { configure(db); return { ok: true, exists: true, checkpoint: db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() }; } finally { db.close(); } }
