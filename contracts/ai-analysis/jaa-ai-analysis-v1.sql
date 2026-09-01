PRAGMA foreign_keys = ON;

CREATE TABLE ai_database_metadata (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    database_id TEXT NOT NULL UNIQUE,
    schema_name TEXT NOT NULL CHECK (schema_name = 'jaa-ai-analysis-sqlite'),
    schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    created_by_app_version TEXT NOT NULL,
    last_migrated_by_app_version TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(metadata_json))
);

CREATE TABLE ai_import_batches (
    import_batch_id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    package_sha256 TEXT NOT NULL CHECK (length(package_sha256) = 64),
    original_file_name TEXT NOT NULL,
    original_file_path TEXT,
    original_file_size_bytes INTEGER NOT NULL CHECK (original_file_size_bytes >= 0),
    schema_name TEXT NOT NULL CHECK (schema_name = 'jaa-ai-analysis-import-package'),
    schema_version TEXT NOT NULL,
    schema_sha256 TEXT NOT NULL CHECK (length(schema_sha256) = 64),
    minimum_importer_version TEXT NOT NULL,
    required_capabilities_json TEXT NOT NULL
        CHECK (json_valid(required_capabilities_json)),
    generator_json TEXT NOT NULL CHECK (json_valid(generator_json)),
    source_database_id TEXT NOT NULL,
    jira_server_fingerprint TEXT NOT NULL,
    jira_server_host TEXT,
    pending_file_name TEXT NOT NULL,
    pending_sha256 TEXT NOT NULL CHECK (length(pending_sha256) = 64),
    pending_schema_name TEXT NOT NULL,
    pending_schema_version TEXT NOT NULL,
    export_id TEXT NOT NULL,
    source_view TEXT NOT NULL,
    source_created_at TEXT NOT NULL,
    source_timezone TEXT NOT NULL,
    query_snapshot_json TEXT NOT NULL CHECK (json_valid(query_snapshot_json)),
    export_metadata_json TEXT NOT NULL CHECK (json_valid(export_metadata_json)),
    rule_set_id TEXT NOT NULL,
    manifest_version TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) = 64),
    common_rules_version TEXT NOT NULL,
    common_rules_sha256 TEXT NOT NULL CHECK (length(common_rules_sha256) = 64),
    catalog_version TEXT NOT NULL,
    catalog_sha256 TEXT NOT NULL CHECK (length(catalog_sha256) = 64),
    template_id TEXT,
    template_version TEXT,
    template_schema_version TEXT,
    template_sha256 TEXT CHECK (template_sha256 IS NULL OR length(template_sha256) = 64),
    review_coverage_state TEXT NOT NULL
        CHECK (review_coverage_state IN ('NONE', 'PARTIAL', 'COMPLETED')),
    declared_record_count INTEGER NOT NULL CHECK (declared_record_count >= 0),
    validated_record_count INTEGER NOT NULL CHECK (validated_record_count >= 0),
    inserted_count INTEGER NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
    replaced_count INTEGER NOT NULL DEFAULT 0 CHECK (replaced_count >= 0),
    protected_skip_count INTEGER NOT NULL DEFAULT 0 CHECK (protected_skip_count >= 0),
    identical_noop_count INTEGER NOT NULL DEFAULT 0 CHECK (identical_noop_count >= 0),
    matched_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
    unmatched_count INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_count >= 0),
    ambiguous_count INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous_count >= 0),
    status TEXT NOT NULL
        CHECK (status IN ('PREVIEWED', 'IMPORTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')),
    validation_summary_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(validation_summary_json)),
    package_integrity_json TEXT NOT NULL CHECK (json_valid(package_integrity_json)),
    conversion_receipt_json TEXT
        CHECK (conversion_receipt_json IS NULL OR json_valid(conversion_receipt_json)),
    failure_code TEXT,
    failure_message TEXT,
    previewed_at_utc TEXT NOT NULL,
    imported_at_utc TEXT,
    completed_at_utc TEXT,
    importer_app_version TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_ai_import_batches_completed_package_sha
    ON ai_import_batches(package_sha256)
    WHERE status = 'COMPLETED';

CREATE INDEX ix_ai_import_batches_source
    ON ai_import_batches(jira_server_fingerprint, source_database_id, completed_at_utc DESC);

CREATE INDEX ix_ai_import_batches_review
    ON ai_import_batches(review_coverage_state, completed_at_utc DESC);

CREATE TABLE ai_analysis_records (
    ai_record_id TEXT PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE CHECK (length(dedupe_key) = 64),
    source_database_id TEXT NOT NULL,
    jira_server_fingerprint TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    activity_event_id TEXT NOT NULL,
    source_record_stable_id TEXT NOT NULL,
    issue_id TEXT,
    issue_key TEXT NOT NULL,
    project_key TEXT,
    issue_type TEXT,
    priority TEXT,
    issue_status TEXT,
    field_id TEXT,
    field_name TEXT NOT NULL,
    event_time_utc TEXT NOT NULL,
    actor_stable_identity TEXT NOT NULL,
    actor_display_value TEXT NOT NULL,
    source_content_hash TEXT NOT NULL CHECK (length(source_content_hash) = 64),
    source_reference_json TEXT NOT NULL CHECK (json_valid(source_reference_json)),
    source_snapshot_json TEXT NOT NULL CHECK (json_valid(source_snapshot_json)),
    ai_status TEXT NOT NULL
        CHECK (ai_status IN ('CLASSIFIED', 'UNKNOWN', 'EXCLUDED', 'FAILED')),
    ai_confidence REAL NOT NULL
        CHECK (ai_confidence IN (0.0, 0.3, 0.6, 0.9)),
    ai_rationale TEXT NOT NULL,
    ai_record_negative_checks_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(ai_record_negative_checks_json)),
    ai_unknown_reasons_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(ai_unknown_reasons_json)),
    ai_analysis_json TEXT NOT NULL CHECK (json_valid(ai_analysis_json)),
    review_state TEXT NOT NULL
        CHECK (review_state IN ('AI_ONLY', 'REVIEW_PARTIAL', 'REVIEW_COMPLETED')),
    effective_status TEXT NOT NULL
        CHECK (effective_status IN ('CLASSIFIED', 'UNKNOWN', 'EXCLUDED', 'FAILED')),
    effective_status_source TEXT NOT NULL
        CHECK (effective_status_source IN ('AI', 'MANUAL_COMPLETED')),
    is_human_verified INTEGER NOT NULL DEFAULT 0
        CHECK (is_human_verified IN (0, 1)),
    manual_review_json TEXT
        CHECK (manual_review_json IS NULL OR json_valid(manual_review_json)),
    ai_analysis_sha256 TEXT NOT NULL CHECK (length(ai_analysis_sha256) = 64),
    manual_review_sha256 TEXT
        CHECK (manual_review_sha256 IS NULL OR length(manual_review_sha256) = 64),
    record_integrity_sha256 TEXT NOT NULL CHECK (length(record_integrity_sha256) = 64),
    current_import_batch_id TEXT NOT NULL,
    first_imported_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
    FOREIGN KEY (current_import_batch_id)
        REFERENCES ai_import_batches(import_batch_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    UNIQUE (source_database_id, evidence_id)
);

CREATE INDEX ix_ai_records_source_activity
    ON ai_analysis_records(source_database_id, activity_event_id);

CREATE INDEX ix_ai_records_source_stable
    ON ai_analysis_records(source_database_id, source_record_stable_id, field_name, event_time_utc);

CREATE INDEX ix_ai_records_actor_time
    ON ai_analysis_records(actor_stable_identity, event_time_utc DESC);

CREATE INDEX ix_ai_records_issue_time
    ON ai_analysis_records(issue_key, event_time_utc DESC);

CREATE INDEX ix_ai_records_project_time
    ON ai_analysis_records(project_key, event_time_utc DESC);

CREATE INDEX ix_ai_records_status
    ON ai_analysis_records(ai_status, review_state, event_time_utc DESC);

CREATE INDEX ix_ai_records_effective_status
    ON ai_analysis_records(effective_status, is_human_verified, event_time_utc DESC);

CREATE INDEX ix_ai_records_source_hash
    ON ai_analysis_records(source_database_id, source_content_hash);

CREATE TABLE ai_skill_findings (
    ai_finding_id TEXT PRIMARY KEY,
    ai_record_id TEXT NOT NULL,
    finding_ordinal INTEGER NOT NULL CHECK (finding_ordinal >= 0),
    skill_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    skill_group TEXT NOT NULL,
    ai_confidence REAL NOT NULL CHECK (ai_confidence IN (0.3, 0.6, 0.9)),
    evidence_explanation TEXT NOT NULL,
    rationale TEXT NOT NULL,
    negative_checks_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(negative_checks_json)),
    near_skills_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(near_skills_json)),
    finding_json TEXT NOT NULL CHECK (json_valid(finding_json)),
    finding_sha256 TEXT NOT NULL CHECK (length(finding_sha256) = 64),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    UNIQUE (ai_record_id, finding_ordinal),
    UNIQUE (ai_record_id, skill_id),
    UNIQUE (ai_finding_id, ai_record_id)
);

CREATE INDEX ix_ai_findings_skill
    ON ai_skill_findings(skill_id, ai_confidence);

CREATE INDEX ix_ai_findings_group
    ON ai_skill_findings(skill_group, skill_id);

CREATE TABLE ai_skill_evidence (
    ai_evidence_row_id TEXT PRIMARY KEY,
    ai_finding_id TEXT NOT NULL,
    evidence_ordinal INTEGER NOT NULL CHECK (evidence_ordinal >= 0),
    source_json_pointer TEXT NOT NULL,
    quote TEXT NOT NULL,
    quote_sha256 TEXT NOT NULL CHECK (length(quote_sha256) = 64),
    evidence_role TEXT,
    explanation TEXT,
    FOREIGN KEY (ai_finding_id)
        REFERENCES ai_skill_findings(ai_finding_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    UNIQUE (ai_finding_id, evidence_ordinal)
);

CREATE INDEX ix_ai_evidence_quote_sha
    ON ai_skill_evidence(quote_sha256);

CREATE TABLE ai_record_reviews (
    ai_record_id TEXT PRIMARY KEY,
    expected_status TEXT NOT NULL
        CHECK (expected_status IN ('CLASSIFIED', 'UNKNOWN', 'EXCLUDED', 'FAILED', 'UNDECIDED')),
    status_agreement TEXT NOT NULL
        CHECK (status_agreement IN ('AGREE', 'DISAGREE', 'UNREVIEWED')),
    skill_identification_state TEXT NOT NULL
        CHECK (skill_identification_state IN ('IDENTIFIED', 'NOT_APPLICABLE', 'NEEDS_DOMAIN_FOLLOWUP')),
    notes TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    reviewer TEXT NOT NULL DEFAULT '',
    review_schema_name TEXT NOT NULL,
    review_schema_version TEXT NOT NULL,
    review_schema_sha256 TEXT NOT NULL CHECK (length(review_schema_sha256) = 64),
    review_origin TEXT NOT NULL,
    review_created_at_local TEXT,
    review_updated_at_local TEXT,
    imported_at_utc TEXT NOT NULL,
    review_json TEXT NOT NULL CHECK (json_valid(review_json)),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    CHECK (completed = 0 OR expected_status <> 'UNDECIDED')
);

CREATE INDEX ix_ai_record_reviews_status
    ON ai_record_reviews(completed, expected_status, status_agreement);

CREATE TABLE ai_skill_reviews (
    skill_review_id TEXT PRIMARY KEY,
    ai_record_id TEXT NOT NULL,
    ai_finding_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    ai_confidence REAL NOT NULL CHECK (ai_confidence IN (0.3, 0.6, 0.9)),
    verdict TEXT NOT NULL
        CHECK (verdict IN (
            'UNREVIEWED',
            'ACCEPT',
            'REJECT_WRONG_SKILL',
            'REJECT_EVIDENCE_INSUFFICIENT',
            'ADJUST_CONFIDENCE',
            'UNCERTAIN'
        )),
    proposed_confidence REAL
        CHECK (proposed_confidence IS NULL OR proposed_confidence IN (0.3, 0.6, 0.9)),
    notes TEXT NOT NULL DEFAULT '',
    review_json TEXT NOT NULL CHECK (json_valid(review_json)),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (ai_finding_id, ai_record_id)
        REFERENCES ai_skill_findings(ai_finding_id, ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    UNIQUE (ai_record_id, skill_id),
    CHECK (
        (verdict = 'ADJUST_CONFIDENCE' AND proposed_confidence IS NOT NULL)
        OR
        (verdict <> 'ADJUST_CONFIDENCE' AND proposed_confidence IS NULL)
    )
);

CREATE INDEX ix_ai_skill_reviews_verdict
    ON ai_skill_reviews(verdict, skill_id);

CREATE TABLE ai_missing_skill_reviews (
    missing_review_id TEXT PRIMARY KEY,
    ai_record_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    skill_group TEXT NOT NULL,
    suggested_confidence REAL NOT NULL CHECK (suggested_confidence IN (0.3, 0.6, 0.9)),
    source_json_pointer TEXT NOT NULL,
    quote TEXT NOT NULL,
    quote_sha256 TEXT NOT NULL CHECK (length(quote_sha256) = 64),
    reason TEXT NOT NULL,
    negative_checks_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(negative_checks_json)),
    review_origin TEXT NOT NULL,
    confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
    review_json TEXT NOT NULL CHECK (json_valid(review_json)),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    UNIQUE (ai_record_id, skill_id)
);

CREATE INDEX ix_ai_missing_skills_skill
    ON ai_missing_skill_reviews(skill_id, confirmed);

CREATE TABLE ai_additional_evidence_assignments (
    assignment_id TEXT PRIMARY KEY,
    ai_record_id TEXT NOT NULL,
    target_skill_id TEXT NOT NULL,
    target_skill_presence TEXT NOT NULL
        CHECK (target_skill_presence IN ('EXISTING', 'MISSING')),
    source_finding_skill_id TEXT,
    source_json_pointer TEXT NOT NULL,
    quote TEXT NOT NULL,
    quote_sha256 TEXT NOT NULL CHECK (length(quote_sha256) = 64),
    suggested_confidence REAL
        CHECK (suggested_confidence IS NULL OR suggested_confidence IN (0.3, 0.6, 0.9)),
    reason TEXT NOT NULL,
    negative_checks_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(negative_checks_json)),
    review_origin TEXT NOT NULL,
    confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
    assignment_json TEXT NOT NULL CHECK (json_valid(assignment_json)),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    UNIQUE (ai_record_id, target_skill_id, source_json_pointer, quote_sha256)
);

CREATE INDEX ix_ai_additional_evidence_target
    ON ai_additional_evidence_assignments(target_skill_id, target_skill_presence, confirmed);

CREATE TABLE ai_source_links (
    ai_record_id TEXT PRIMARY KEY,
    link_status TEXT NOT NULL
        CHECK (link_status IN (
            'MATCHED',
            'SOURCE_DATABASE_NOT_AVAILABLE',
            'SOURCE_RECORD_NOT_FOUND',
            'AMBIGUOUS',
            'SOURCE_IDENTITY_MISMATCH',
            'SOURCE_CONTENT_MISMATCH',
            'LINK_ERROR',
            'NOT_ATTEMPTED'
        )),
    link_method TEXT
        CHECK (link_method IS NULL OR link_method IN (
            'SOURCE_DATABASE_AND_ACTIVITY_EVENT',
            'STABLE_RECORD_FALLBACK'
        )),
    matched_source_database_id TEXT,
    matched_activity_event_id TEXT,
    matched_raw_record_id TEXT,
    candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
    source_identity_match INTEGER
        CHECK (source_identity_match IS NULL OR source_identity_match IN (0, 1)),
    source_content_match INTEGER
        CHECK (source_content_match IS NULL OR source_content_match IN (0, 1)),
    diagnostic_code TEXT,
    diagnostic_message TEXT,
    first_attempt_at_utc TEXT,
    last_attempt_at_utc TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    link_debug_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(link_debug_json)),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    CHECK (
        link_status <> 'MATCHED'
        OR (
            link_method IS NOT NULL
            AND matched_source_database_id IS NOT NULL
            AND matched_activity_event_id IS NOT NULL
        )
    )
);

CREATE INDEX ix_ai_source_links_status
    ON ai_source_links(link_status, link_method);

CREATE INDEX ix_ai_source_links_matched_activity
    ON ai_source_links(matched_source_database_id, matched_activity_event_id);

CREATE TABLE ai_source_link_attempts (
    link_attempt_id TEXT PRIMARY KEY,
    ai_record_id TEXT NOT NULL,
    import_batch_id TEXT,
    trigger_type TEXT NOT NULL
        CHECK (trigger_type IN (
            'IMPORT',
            'DATABASE_OPENED',
            'DATABASE_REPLACED',
            'MANUAL_RELINK',
            'APP_MIGRATION'
        )),
    target_source_database_id TEXT,
    target_jira_server_fingerprint TEXT,
    attempted_primary_key_json TEXT NOT NULL
        CHECK (json_valid(attempted_primary_key_json)),
    attempted_fallback_key_json TEXT NOT NULL
        CHECK (json_valid(attempted_fallback_key_json)),
    candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
    candidate_ids_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(candidate_ids_json)),
    result_status TEXT NOT NULL
        CHECK (result_status IN (
            'MATCHED',
            'SOURCE_DATABASE_NOT_AVAILABLE',
            'SOURCE_RECORD_NOT_FOUND',
            'AMBIGUOUS',
            'SOURCE_IDENTITY_MISMATCH',
            'SOURCE_CONTENT_MISMATCH',
            'LINK_ERROR',
            'NOT_ATTEMPTED'
        )),
    result_method TEXT
        CHECK (result_method IS NULL OR result_method IN (
            'SOURCE_DATABASE_AND_ACTIVITY_EVENT',
            'STABLE_RECORD_FALLBACK'
        )),
    diagnostic_code TEXT,
    diagnostic_message TEXT,
    attempted_at_utc TEXT NOT NULL,
    app_version TEXT NOT NULL,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    FOREIGN KEY (ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (import_batch_id)
        REFERENCES ai_import_batches(import_batch_id)
        ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE INDEX ix_ai_link_attempts_record_time
    ON ai_source_link_attempts(ai_record_id, attempted_at_utc DESC);

CREATE INDEX ix_ai_link_attempts_result
    ON ai_source_link_attempts(result_status, attempted_at_utc DESC);

CREATE TABLE ai_import_actions (
    import_action_id TEXT PRIMARY KEY,
    import_batch_id TEXT NOT NULL,
    input_record_index INTEGER NOT NULL CHECK (input_record_index >= 0),
    evidence_id TEXT NOT NULL,
    dedupe_key TEXT NOT NULL CHECK (length(dedupe_key) = 64),
    existing_ai_record_id TEXT,
    resulting_ai_record_id TEXT,
    existing_review_state TEXT
        CHECK (existing_review_state IS NULL OR existing_review_state IN (
            'AI_ONLY', 'REVIEW_PARTIAL', 'REVIEW_COMPLETED'
        )),
    incoming_review_state TEXT NOT NULL
        CHECK (incoming_review_state IN ('AI_ONLY', 'REVIEW_PARTIAL', 'REVIEW_COMPLETED')),
    action_type TEXT NOT NULL
        CHECK (action_type IN (
            'INSERTED',
            'REPLACED',
            'SKIPPED_PROTECTED_REVIEW',
            'NOOP_IDENTICAL',
            'REJECTED_VALIDATION'
        )),
    reason_code TEXT NOT NULL,
    reason_message TEXT NOT NULL,
    existing_ai_analysis_sha256 TEXT
        CHECK (existing_ai_analysis_sha256 IS NULL OR length(existing_ai_analysis_sha256) = 64),
    incoming_ai_analysis_sha256 TEXT NOT NULL
        CHECK (length(incoming_ai_analysis_sha256) = 64),
    existing_manual_review_sha256 TEXT
        CHECK (existing_manual_review_sha256 IS NULL OR length(existing_manual_review_sha256) = 64),
    incoming_manual_review_sha256 TEXT
        CHECK (incoming_manual_review_sha256 IS NULL OR length(incoming_manual_review_sha256) = 64),
    link_status_after_action TEXT,
    occurred_at_utc TEXT NOT NULL,
    action_debug_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(action_debug_json)),
    FOREIGN KEY (import_batch_id)
        REFERENCES ai_import_batches(import_batch_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (existing_ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE SET NULL,
    FOREIGN KEY (resulting_ai_record_id)
        REFERENCES ai_analysis_records(ai_record_id)
        ON UPDATE RESTRICT ON DELETE SET NULL,
    UNIQUE (import_batch_id, input_record_index)
);

CREATE INDEX ix_ai_import_actions_batch_type
    ON ai_import_actions(import_batch_id, action_type);

CREATE INDEX ix_ai_import_actions_dedupe
    ON ai_import_actions(dedupe_key, occurred_at_utc DESC);

CREATE VIEW v_ai_record_overview AS
SELECT
    r.ai_record_id,
    r.dedupe_key,
    r.source_database_id,
    r.jira_server_fingerprint,
    r.evidence_id,
    r.activity_event_id,
    r.issue_key,
    r.project_key,
    r.issue_type,
    r.priority,
    r.field_name,
    r.event_time_utc,
    r.actor_stable_identity,
    r.actor_display_value,
    r.ai_status,
    r.ai_confidence,
    r.review_state,
    r.effective_status,
    r.effective_status_source,
    r.is_human_verified,
    COALESCE(l.link_status, 'NOT_ATTEMPTED') AS link_status,
    l.link_method,
    l.matched_raw_record_id,
    l.diagnostic_code AS link_diagnostic_code,
    COUNT(DISTINCT f.ai_finding_id) AS ai_skill_finding_count,
    COUNT(DISTINCT m.missing_review_id) AS missing_skill_count,
    r.current_import_batch_id,
    r.updated_at_utc
FROM ai_analysis_records r
LEFT JOIN ai_source_links l ON l.ai_record_id = r.ai_record_id
LEFT JOIN ai_skill_findings f ON f.ai_record_id = r.ai_record_id
LEFT JOIN ai_missing_skill_reviews m ON m.ai_record_id = r.ai_record_id
GROUP BY r.ai_record_id;

CREATE VIEW v_ai_effective_skills AS
SELECT
    r.ai_record_id,
    f.skill_id,
    f.skill_name,
    f.skill_group,
    CASE
        WHEN r.review_state = 'REVIEW_COMPLETED'
             AND sr.verdict = 'ADJUST_CONFIDENCE'
        THEN sr.proposed_confidence
        ELSE f.ai_confidence
    END AS effective_confidence,
    CASE
        WHEN r.review_state = 'REVIEW_COMPLETED' THEN 'AI_REVIEW_ACCEPTED'
        ELSE 'AI_UNVERIFIED'
    END AS effective_skill_source,
    sr.verdict AS manual_verdict
FROM ai_analysis_records r
JOIN ai_skill_findings f ON f.ai_record_id = r.ai_record_id
LEFT JOIN ai_skill_reviews sr
    ON sr.ai_record_id = r.ai_record_id
   AND sr.ai_finding_id = f.ai_finding_id
WHERE
    r.review_state <> 'REVIEW_COMPLETED'
    OR sr.verdict IN ('ACCEPT', 'ADJUST_CONFIDENCE')

UNION ALL

SELECT
    r.ai_record_id,
    m.skill_id,
    m.skill_name,
    m.skill_group,
    m.suggested_confidence AS effective_confidence,
    'MANUAL_MISSING' AS effective_skill_source,
    'ACCEPT' AS manual_verdict
FROM ai_analysis_records r
JOIN ai_missing_skill_reviews m ON m.ai_record_id = r.ai_record_id
WHERE r.review_state = 'REVIEW_COMPLETED'
  AND m.confirmed = 1;

CREATE VIEW v_ai_import_batch_summary AS
SELECT
    b.import_batch_id,
    b.original_file_name,
    b.package_sha256,
    b.source_database_id,
    b.jira_server_fingerprint,
    b.pending_file_name,
    b.rule_set_id,
    b.review_coverage_state,
    b.declared_record_count,
    b.inserted_count,
    b.replaced_count,
    b.protected_skip_count,
    b.identical_noop_count,
    b.matched_count,
    b.unmatched_count,
    b.ambiguous_count,
    b.status,
    b.completed_at_utc,
    b.importer_app_version
FROM ai_import_batches b;

PRAGMA user_version = 1;
