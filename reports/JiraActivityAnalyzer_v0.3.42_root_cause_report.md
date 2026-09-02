# Jira Activity Analyzer v0.3.42 Root Cause Report

## Executive Summary

The v0.3.41 baseline established the AI Analysis Database v2 lifecycle, but several implementation assumptions differ from the frozen v0.3.42 decisions and from the production Raw database. These are implementation defects, not reasons to weaken the frozen contracts.

## Confirmed Root Causes

1. **Partial-review rejection**: package validation rejects every non-`AI_ONLY` record with a null `manualReview`. The package v2 contract permits null records in `REVIEW_PARTIAL`; rank must be derived from the complete record set and compared with the declaration.
2. **Runtime DDL dependency**: database creation calls `fs.readFileSync(ddlPath)` and packaged IPC resolves that path under `process.resourcesPath`. This violates the build-time embedded DDL decision and can fail in portable extraction/runtime locations.
3. **Raw schema mismatch**: Integrated Results expects `source_objects.source_object_id`, `source_objects.object_key`, and `database_metadata.database_id`. Production Raw storage uses `source_objects.id`, `source_objects.issue_key`, and key/value metadata. The existing join therefore cannot be considered a valid production query.
4. **Fixed field projection**: AI Results exposes a handwritten column array and query allow-list. Fields added to package JSON, SQLite columns or query metadata remain invisible until frontend code changes.
5. **Incomplete reuse surface**: the current Database Overview wrappers only render a generic `div` and `dl`; toolbar actions, status and dialogs are still route-local. This does not provide the approved production-component reuse boundary.
6. **Date-range semantics**: the current upper bound uses an exclusive raw string comparison and the UI does not reject `from > to`. This is not inclusive end-of-day behavior and can silently produce misleading empty results.
7. **Archived subsystem startup**: the legacy AI analysis IPC is still registered during application startup. The archived page must not initialize provider, rules, state or temporary work.
8. **Source-link metadata assumption**: relinking queries a `database_id` column and uses `updated_at` as generation. Production metadata is key/value based, so otherwise valid primary/fallback candidates can be reported as unavailable.
9. **Same-rank import semantics**: v0.3.41 treats all same-rank records as identical no-ops without proving package/content identity. Idempotence must be based on the package/content identity while preserving higher-ranked current records.

## Required Corrections

- Derive `AI_ONLY`, `REVIEW_PARTIAL`, or `REVIEW_COMPLETED` from records and reject a declared/derived mismatch before opening a write transaction.
- Generate a TypeScript DDL module from the frozen SQL only after SHA-256 verification; runtime creation executes only the embedded constant.
- Query the actual Raw schema and use Raw rows as the left side of Integrated Results.
- Build a stable dot-path field catalog from SQLite metadata, JSON schema metadata and observed JSON union; use catalog-backed safe SQL expressions.
- Reuse `SqliteDataTable`, `ActivityComparisonTable`, route state and expanded Database Overview components.
- Validate date ranges and apply inclusive end-of-day bounds.
- Disable archived AI provider startup registration.
- Record every source-link attempt append-only, with primary identity first and the frozen stable fallback second; never use hashes as a match gate.
- Keep APP_ROOT-derived managed paths inside the clicked Portable executable directory and audit actual business I/O outcomes.

## Requirement Traceability Matrix

| Requirement | Production area | Verification evidence |
| --- | --- | --- |
| Golden AI/PARTIAL/COMPLETED imports | AI package validator/importer | v0.3.42 fixture tests and immutable readback |
| Transactional rollback | AI database importer | negative fixture and forced-failure integration test |
| Embedded DDL | build generator/database initializer | hash test plus packaged resource audit |
| Dynamic catalog | query metadata + table UI | synthetic unknown/all-null/temporal fields test and UI smoke |
| Raw-based Integrated Results | integrated query | production-schema SQLite fixture and LEFT JOIN assertions |
| Stable source linking | relink IPC/link decision | source-link golden fixture and append-only history test |
| Portable containment | app root/path diagnostics | isolated Portable launch and path audit |
| Stable route query state | viewer context/routes | route switch and stale-response tests |
| Approved responsive UI | production pages/components | five-viewport app-only screenshots and acceptance matrix |
| Human release gate | packaged application | signed/manual checklist; no tag or push before PASS |

## Preservation Statement

The pre-existing v0.2.47 tracked modification and all pre-existing untracked user files are outside this change set and must remain byte-for-byte untouched and unstaged.
