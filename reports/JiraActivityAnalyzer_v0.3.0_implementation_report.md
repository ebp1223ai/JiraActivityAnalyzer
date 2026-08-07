# Jira Activity Analyzer v0.3.0 Implementation Report

## Status

Implementation / Automated Verification / Dist: Completed. Pending-analysis contract: Review Draft. Real SQLite / Windows GUI / Export Content Review: Pending User Validation. Overall: Partial.

## Root Cause and Data Flow

Issue and User Viewer event state already used one typed `ViewerTableQuery`, normalized SQLite filters, canonical Diff classifier and deterministic event-ID tie-breaker. Filtered count and page rows shared those predicates, while progressive Diff filtering applied the same canonical classifier. Existing generic export was synchronous and record-oriented, and could not safely export a complete large Viewer set.

v0.3.0 adds one export scan at the existing query source of truth. It freezes query/subject, scans candidates by stable event ID in bounded batches, applies the canonical Diff predicate, sorts with the current Viewer sort plus event ID, and reads original evidence/current snapshot in bounded batches. Compact renderer DTOs are not used as export evidence.

The renderer sends only typed query and subject. Electron main supplies the authoritative readable DB and APP_ROOT. A dedicated worker owns filtering/writing, while a main coordinator owns run state, cancellation and progress across route unmounts. Records spool to APP_ROOT, final JSON is assembled by streams, hashed, and atomically renamed.

Source identity comes from Current-State `database_metadata`: database ID, Jira server URL host, Jira server identity hash, schema v3, plus a path-free runtime generation hash. No SQLite path enters the document.

## Scope

Classification: `CROSS_LAYER_CHANGE`. Production changes are limited to Viewer query/export, Electron IPC/worker/build, a shared contract, one reusable UI panel and two route placements. Tests, version metadata and docs were updated. No project-wide rewrite, dependency upgrade, schema migration, ENV change, Jira request or database write was added.

## Error Policy

Fatal typed codes: `NO_FILTERED_RECORDS`, `SOURCE_DATABASE_NOT_READY`, `SOURCE_DATABASE_CHANGED`, `FILTER_SNAPSHOT_INVALID`, `COUNT_EXPORT_MISMATCH`, `SOURCE_IDENTITY_INCOMPLETE`, `EXPORT_CANCELLED`, `EXPORT_PATH_NOT_WRITABLE`, `EXPORT_WRITE_FAILED`, `EXPORT_FINALIZE_FAILED`, `EXPORT_INTEGRITY_FAILED`. Non-applicable history/comment/context fields remain null/empty with diagnostics.

## Known Draft Limits

`sameHistoryItems`, project name and current Description are not reliably projected by the bounded v0.3.0 export and are explicitly unavailable. Real SQLite content review, Installer/Portable human interaction, inaccessible-path behavior and business-content suitability remain manual gates.
