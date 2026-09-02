-- JiraActivityAnalyzer AI Analysis SQLite Schema v2.0.0
-- Target application: v0.3.41
-- Hash is not a Source Link key. Full source_trace_json is authoritative.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_schema_metadata (
  schema_name TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  migrated_at TEXT,
  source_trace_contract_version TEXT NOT NULL,
  package_contract_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_import_batches (
  import_batch_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  package_schema_version TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  source_database_id TEXT NOT NULL,
  database_generation TEXT NOT NULL,
  source_schema_version TEXT NOT NULL,
  source_trace_contract_version TEXT NOT NULL,
  review_rank TEXT NOT NULL CHECK (review_rank IN ('AI_ONLY','REVIEW_PARTIAL','REVIEW_COMPLETED')),
  source_binding_json TEXT NOT NULL CHECK (json_valid(source_binding_json)),
  package_metadata_json TEXT NOT NULL CHECK (json_valid(package_metadata_json)),
  preflight_result_json TEXT NOT NULL CHECK (json_valid(preflight_result_json)),
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  imported_at TEXT NOT NULL,
  transaction_status TEXT NOT NULL CHECK (transaction_status IN ('COMMITTED','ROLLED_BACK')),
  UNIQUE (package_id)
);

CREATE TABLE IF NOT EXISTS ai_records (
  ai_record_id TEXT PRIMARY KEY,
  source_database_id TEXT NOT NULL,
  database_generation TEXT NOT NULL,
  activity_event_id TEXT NOT NULL,
  source_record_stable_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  field_identity TEXT,
  field_name TEXT NOT NULL,
  event_time TEXT NOT NULL,
  record_index INTEGER NOT NULL CHECK (record_index >= 0),
  source_trace_status TEXT NOT NULL CHECK (source_trace_status IN ('COMPLETE','PARTIAL','MISSING','INVALID')),
  source_link_status TEXT NOT NULL CHECK (source_link_status IN ('PRIMARY_MATCHED','FALLBACK_MATCHED','AMBIGUOUS','NOT_FOUND','SOURCE_DATABASE_MISMATCH','IDENTITY_CONFLICT','NOT_ATTEMPTED','ERROR')),
  integrity_status TEXT NOT NULL CHECK (integrity_status IN ('VERIFIED','MISMATCH','UNVERIFIABLE','NOT_CHECKED','ERROR')),
  active_analysis_id TEXT,
  active_review_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_database_id, activity_event_id)
);

CREATE TABLE IF NOT EXISTS ai_record_source_traces (
  source_trace_id TEXT PRIMARY KEY,
  ai_record_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  source_trace_json TEXT NOT NULL CHECK (json_valid(source_trace_json)),
  reference_json TEXT NOT NULL CHECK (json_valid(reference_json)),
  diff_json TEXT NOT NULL CHECK (json_valid(diff_json)),
  pending_integrity_json TEXT NOT NULL CHECK (json_valid(pending_integrity_json)),
  source_schema_version TEXT NOT NULL,
  source_trace_contract_version TEXT NOT NULL,
  integrity_receipt_json TEXT CHECK (integrity_receipt_json IS NULL OR json_valid(integrity_receipt_json)),
  trace_completeness_status TEXT NOT NULL CHECK (trace_completeness_status IN ('COMPLETE','PARTIAL','MISSING','INVALID')),
  observed_at TEXT NOT NULL,
  FOREIGN KEY (ai_record_id) REFERENCES ai_records(ai_record_id) ON DELETE CASCADE,
  FOREIGN KEY (import_batch_id) REFERENCES ai_import_batches(import_batch_id) ON DELETE RESTRICT,
  UNIQUE (ai_record_id, import_batch_id)
);

CREATE TABLE IF NOT EXISTS ai_record_analyses (
  analysis_id TEXT PRIMARY KEY,
  ai_record_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  rule_set_id TEXT NOT NULL,
  analysis_json TEXT NOT NULL CHECK (json_valid(analysis_json)),
  analysis_status TEXT NOT NULL CHECK (analysis_status IN ('CLASSIFIED','UNKNOWN','EXCLUDED','FAILED')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY (ai_record_id) REFERENCES ai_records(ai_record_id) ON DELETE CASCADE,
  FOREIGN KEY (import_batch_id) REFERENCES ai_import_batches(import_batch_id) ON DELETE RESTRICT,
  UNIQUE (ai_record_id, import_batch_id)
);

CREATE TABLE IF NOT EXISTS ai_record_reviews (
  review_id TEXT PRIMARY KEY,
  ai_record_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  review_rank TEXT NOT NULL CHECK (review_rank IN ('REVIEW_PARTIAL','REVIEW_COMPLETED')),
  review_json TEXT NOT NULL CHECK (json_valid(review_json)),
  completed INTEGER NOT NULL CHECK (completed IN (0,1)),
  reviewer TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ai_record_id) REFERENCES ai_records(ai_record_id) ON DELETE CASCADE,
  FOREIGN KEY (analysis_id) REFERENCES ai_record_analyses(analysis_id) ON DELETE RESTRICT,
  FOREIGN KEY (import_batch_id) REFERENCES ai_import_batches(import_batch_id) ON DELETE RESTRICT,
  UNIQUE (ai_record_id, import_batch_id)
);

CREATE TABLE IF NOT EXISTS ai_skill_findings (
  finding_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  ai_record_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  finding_json TEXT NOT NULL CHECK (json_valid(finding_json)),
  FOREIGN KEY (analysis_id) REFERENCES ai_record_analyses(analysis_id) ON DELETE CASCADE,
  FOREIGN KEY (ai_record_id) REFERENCES ai_records(ai_record_id) ON DELETE CASCADE,
  UNIQUE (analysis_id, skill_id)
);

CREATE TABLE IF NOT EXISTS source_link_attempts (
  link_attempt_id TEXT PRIMARY KEY,
  ai_record_id TEXT NOT NULL,
  raw_database_identity TEXT NOT NULL,
  raw_database_path_display TEXT,
  attempted_method TEXT NOT NULL CHECK (attempted_method IN ('PRIMARY','FALLBACK','NONE')),
  identity_query_json TEXT NOT NULL CHECK (json_valid(identity_query_json)),
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  candidate_summary_json TEXT NOT NULL CHECK (json_valid(candidate_summary_json)),
  matched_activity_event_id TEXT,
  link_status TEXT NOT NULL CHECK (link_status IN ('PRIMARY_MATCHED','FALLBACK_MATCHED','AMBIGUOUS','NOT_FOUND','SOURCE_DATABASE_MISMATCH','IDENTITY_CONFLICT','ERROR')),
  database_generation_status TEXT NOT NULL CHECK (database_generation_status IN ('SAME','DIFFERENT','UNKNOWN')),
  failure_reason TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attempted_at TEXT NOT NULL,
  FOREIGN KEY (ai_record_id) REFERENCES ai_records(ai_record_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_records_primary_identity
  ON ai_records (source_database_id, activity_event_id);

CREATE INDEX IF NOT EXISTS idx_ai_records_fallback_identity
  ON ai_records (source_database_id, source_record_stable_id, field_name, event_time);

CREATE INDEX IF NOT EXISTS idx_ai_records_trace_status
  ON ai_records (source_trace_status);

CREATE INDEX IF NOT EXISTS idx_ai_records_link_status
  ON ai_records (source_link_status);

CREATE INDEX IF NOT EXISTS idx_ai_records_event_time
  ON ai_records (event_time);

CREATE INDEX IF NOT EXISTS idx_ai_findings_skill
  ON ai_skill_findings (skill_id, ai_record_id);

CREATE INDEX IF NOT EXISTS idx_link_attempts_record_time
  ON source_link_attempts (ai_record_id, attempted_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_source_trace_identity_consistency_insert
BEFORE INSERT ON ai_record_source_traces
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.reference_json, '$.activityEventId') !=
         (SELECT activity_event_id FROM ai_records WHERE ai_record_id = NEW.ai_record_id)
    THEN RAISE(ABORT, 'SOURCE_TRACE_ACTIVITY_EVENT_ID_MISMATCH')
  END;
END;

PRAGMA user_version = 2;
