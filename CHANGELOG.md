# Changelog

## 0.2.39 - Stable Source Archive and Activity Events

- Separated exact archive payload SHA-256 from Stable Source Projection version identity, with deterministic canonicalization, meaningful changed paths, and a narrow volatile-field registry.
- Changed stable duplicates to update seen timestamps without inserting Source Object Versions, Payloads, Import Refs, or Activity Events.
- Added schema v2 migration with SQLite-safe validated backup, transactional legacy stable-hash/event backfill, duplicate-group audit, idempotence, and rollback fault coverage.
- Added normalized `activity_events` for issue creation, field/status/assignee changes, comment create/update, attachments, and issue links.
- Separated official Jira `/serverInfo` title from the user connection label and exposed verification/migration status in Connections.
- Split Stage 5 reporting into file save, database operation, snapshot decisions, and activity event counts; added issue-level projection/hash/decision evidence to Debug Folder.
- Switched renderer and main build provenance to the full Git commit SHA. Database Merge and legacy duplicate cleanup remain deferred to v0.2.40.

## 0.2.38 - Source Archive Database Write Correctness

- Connected User Analysis Stage 5 `Save Full Fetch Result` to the current `LOCAL_DATABASE_PATH` SQLite through the typed preload IPC and Electron main process. File JSON, Source Archive ZIP verification, and database write outcomes are reported separately.
- Added frozen Jira server provenance, database compatibility and binding preflight, first-write Jira binding, cross-server batch rejection, and file-backed per-Issue payload loading without copying the Full Fetch dataset through renderer IPC.
- Added canonical UTF-8 JSON, SHA-256, gzip BLOB storage, Object/Version/Payload/Import Ref deduplication, immutable snapshot history, Jira `source_version_number=NULL`, finite busy handling, per-Issue savepoints, first-binding rollback, and readback/FK verification.
- Enforced hard exclusion of Partial, Failed, and invalid Issue records from formal Source Archive tables, with explicit reason codes and truthful New/Existing/Excluded/Failed/Rolled Back UI metrics.
- Added synthetic v0.2.38 database correctness tests, a read-only SQLite audit utility, manual validation guidance, package-size evidence, and execution-time records. No real Jira, Confluence, credential, database, archive, or debug dataset is used by automated tests.

## 0.2.37 - Startup Configuration & Local Database Readiness

- Added the versioned, credential-free `.env.Version` template and `ENV_FORMAT_VERSION=2`; runtime loads only the local `.env`, preserves comments and unknown keys during targeted atomic updates, and saves Jira settings only after a successful connection test.
- Added one APP_ROOT-aware path resolver, parallel non-blocking Jira and SQLite startup checks, stale-request protection, shared renderer runtime state, retry/details controls, and capability selection that keeps Jira and offline database workflows independent.
- Added a SQLite Source Archive service using Electron's bundled `node:sqlite`, with seven normalized tables, metadata/schema/source-binding compatibility checks, gzip canonical JSON payloads, SHA-256 deduplication, snapshot history, transactions, and cascade integrity.
- Added Select Existing and Create New database flows. Invalid or incompatible selections never modify `.env`; `MIGRATION_REQUIRED` remains advisory and has no migration/repair action in this release.
- Added offline unit, integration, regression, UI, `win-unpacked`, and Portable smoke coverage without connecting to real Jira or Confluence.
- Audited Windows package size before and after optimization. Moving Vite/TypeScript build tooling to development dependencies, explicitly enabling ASAR/maximum compression, and excluding source maps reduced Installer size by 9.63% and `resources` by 74.17%.

## 0.2.34 - Selection / Fetch Queue Correctness

- Removed Project Scope from User Analysis Step 1 UI and active Timeline payload; the Electron Timeline handler now enforces all-project semantics even for restored legacy requests.
- Kept Step 2 Project Key as a display-only filter and preserved one normalized global Selected Set while switching between projects.
- Changed Step 2 queue creation from merge to replace, so the current Selected Set creates a fresh stable Fetch Queue without prior-run keys.
- Removed new-run `PROJECT_SCOPE_MISMATCH` eligibility exclusion while retaining Issue Key format, trusted provenance, duplicate, and prior-fetch protections.
- Added post-run `selection_fetch_queue_reconciliation_v1` diagnostics for Selected, Queue, Attempted, Completed, Partial, and Failed Issue Key sets, including same-count/different-key and outcome exclusivity checks.
- Did not add multi-layer Run IDs or pre-run set blocking. Field Evidence and Coverage Matrix remain outside this release.

## 0.2.33 Hotfix - Renderer Crash and Persistent Diagnostics

- Fixed the Step 2 to Step 3 white screen by normalizing legacy or partial Fetch Queue metadata before merge and render, validating selected Candidate Issue Groups, and committing queue plus wizard state only after conversion succeeds.
- Added 0, 1, 51, and 100 item queue-transition coverage, duplicate handling, missing optional-field coverage, and provenance checks that reject unstructured Jira-like keys while accepting verified structured keys of the same shape.
- Added a root React Error Boundary with an incident reference and safe recovery actions, plus persistent renderer and main-process diagnostics under `<APP_ROOT>/logs/sessions/`.
- Added current/previous session collection, queue transition snapshots, event-specific `not_observed` semantics, Full Fetch `not_run` semantics, and machine-readable APP_ROOT `path-audit.json` output to Debug Folder.
- Updated Electron 43 console-message handling with bounded, masked persistence and added cross-session, Debug Folder status, path containment, and Error Boundary regression coverage.

## 0.2.33 - Portable Output Control, Result UI Cleanup & Complete Time Ledger

- Centralized packaged output under the executable directory (`APP_ROOT`) and redirected Electron user data, session data, cache, logs, crash dumps, and controlled temporary files before application services initialize.
- Added normalized containment checks, explicit development/test roots, writable-root preflight, and clear no-fallback failure behavior.
- Made Debug Folder export one click under `exports/debug-folders`, with collision-safe names, truthful copy counts, and concise Open/Copy/Close completion controls.
- Replaced normal per-Issue Full Fetch preview and Direct Jira Evidence browsing with concise run and evidence summaries while retaining file-backed snapshots, normalized fields, evidence, completeness, and Source Archive compatibility.
- Corrected Jira key provenance so unstructured image, attachment, URL, markup, and text matches cannot enter semantic Jira-key collections or secondary warnings; structured keys remain accepted.
- Added APP_ROOT, startup ordering, Debug Folder, result UI, Issue Key provenance, and execution-ledger validation coverage.
- Added `reports/JiraActivityAnalyzer_v0.2.33_execution_time_ledger.json` as a development delivery artifact.

## 0.2.32 - Full Fetch Compatibility & Queue Correctness

- Restored Jira Server/Data Center changelog collection to the Issue API `expand=changelog`; observed `histories` are always preserved and completeness is determined from `histories.length` versus `total`.
- Removed the per-Issue dedicated `/changelog` request from Full Fetch. Unsupported endpoint behavior can no longer replace embedded histories with an empty result.
- Added stable Complete, Incomplete, Total Unavailable, Missing, and Invalid changelog diagnostics plus machine-readable per-Issue Partial reasons.
- Removed Full Fetch Limit and Batch Size from renderer state, IPC, and execution. Legacy `fetchLimit` values are accepted only as ignored compatibility input and never truncate a new run.
- Added full-queue preflight classification, immutable canonical queue snapshots, explicit Excluded/Invalid reasons, and four count-reconciliation invariants that gate Run completion and Source Archive export.
- Prevented attachment/image-like plain-text keys such as `IMAGE-2026` from becoming a primary Issue Key or entering Full Fetch Queue automatically.
- Corrected shared Jira HTTP diagnostics so successful 2xx responses never produce `HTTP_200` or another failure code.
- Replaced compressed Debug Bundle publication with user-selected, timestamped Debug Folder collection. Existing files are copied unchanged, individual copy failures do not stop remaining files, and no ZIP, hash, sanitization, PII scan, tamper check, or archive verification is performed in this flow.
- Preserved the existing strict Source Archive ZIP format and added count reconciliation to its eligibility gate.
- Added focused compatibility, 43-item queue, parser, HTTP, reconciliation, Debug Folder, staging, and archive-gate regression tests.
- Historical roadmap note: this release originally deferred Coverage Matrix to v0.2.34; that assignment was superseded by the v0.2.34 Selection / Fetch Queue Correctness decision.

## 0.2.31 - Full Fetch Correctness & Validation

- Allowed read-only Jira v2/v3 Changelog pagination through a strict endpoint and query allowlist while preserving the write-method guard.
- Added reusable Changelog/Comments pagination verification with reported/fetched totals, page metadata, duplicate detection, invalid-response handling, and completeness checks; embedded Changelog is no longer authoritative.
- Corrected Activity Stream Issue Key resolution so trusted primary keys alone form Timeline groups and Fetch Queue entries; mentioned and related keys remain separate diagnostics.
- Added preflight validation for source trust, key format, project scope, duplicates, existing entries, and Fetch Limit. An all-invalid queue no longer creates a Run or staging directory.
- Unified canonical Issue outcomes (`eligible`, `partial`, `failed_final`, `not_attempted_due_to_run_failure`) and Run outcomes (`completed`, `completed_with_partial`, `completed_with_errors`, `failed`) across UI, logs, manifests, and exports.
- Added bundle-scoped deterministic identity pseudonyms, expanded credential/path masking, idempotent structured sanitization, and parse validation for JSON and NDJSON.
- Added `sanitized-manifest.json` source-versus-sanitized hash/size semantics, tamper checks, and pre-publication verification for Debug Bundles.
- Added lazy single-Issue load/release diagnostics and retained streaming writes, temporary-file finalization, and atomic rename behavior without moving complete Raw data through renderer IPC.
- Added read-only compatibility for v0.2.30 staging. Legacy facts are not mutated, upgraded, resumed, or automatically refetched.
- Added synthetic correctness, pagination, parser, preflight, status, archive-gate, compatibility, sanitizer, hash, lazy-load, streaming, and failure-path regression coverage.
- Kept Jira and database operations read-only. The real company 60-Issue run, Installer GUI, and Portable GUI remain explicit environment-side acceptance checks.
- Deferred Field Evidence / 欄位來源檢視 and Coverage Matrix to later releases.

## 0.2.30

- Replaced active Full Fetch Resume/recovery queues with terminal, file-backed runs and startup `aborted_on_restart` handling.
- Added per-Issue canonical files, Current Issue Snapshot, normalized current fields, hashes, sizes, and lightweight run indexes under the Local AppData staging root.
- Added bounded JSON/NDJSON writers plus streaming Source Archive ZIP creation and reopen verification without whole-archive buffers.
- Added same-run Jira GET retry policy with a three-attempt cap, `Retry-After` support, and no retry for 400/401/403/404.
- Added permanent failed-run diagnostics, explicit safe deletion, read-only legacy v0.2.29 staging visibility, and canonical staging inclusion in Debug Bundles.
- Removed Resume and Pause controls from renderer IPC and User Analysis; Start New Full Fetch always creates a fresh run.
- Added synthetic terminal-state, run-failure-at-Issue-20, snapshot normalization, streaming writer, archive verification, legacy adapter, lock cleanup, and retry policy tests.
- Finalized staging retention: verified exports 7 days, user cancellations 30 days, and fetch/export failures permanent until explicit safe deletion or successful re-export.
- Tightened Eligible validation with Issue identity, full fields, complete Changelog/Comments pagination, canonical parse/hash/size verification, and per-section fetch metadata.
- Added warning-only Remote Links states with HTTP/error/attempt details and no false empty-array fallback.
- Added Run Summary → Issue List → lazy single-Issue Preview without whole-run Raw IPC transfer.
- Added complete sanitized Debug Bundle streaming ZIP output, deterministic user pseudonyms, credential/query-token removal, 500 MiB warning metadata, atomic failure cleanup, and explicit company-data UI warning.

## 0.2.29

- Made Remote Links optional and OFF by default; optional failures no longer reduce Archive Eligible or enter the Resume queue.
- Corrected Full Fetch terminal and remaining counts for eligible, required-partial, optional-warning, final-failed, excluded, interrupted, and retry-queued targets.
- Rebuilt Source Archive packages from the exact Run staging raw files and added payload, object, hash, manifest, and ZIP reopen verification.
- Preserved complete Full Fetch evidence and moved Result serialization and compression into the Electron main process.
- Removed the manual Save Full Fetch Raw Data action.
- Added the current Run Full Fetch Result ZIP and structured metadata folders to Debug Bundles without including staging raw, Source Archive payloads, or attachment files.
- Persisted User Analysis workflow state for Reload and Resume, including Step 4 and Step 5 status.
- Added Calendar Month, Force All Rounds, three-round, `COPGEN1`, Asia/Taipei date, and Remote Links OFF defaults.
- Added Full Fetch integrity, Result round-trip, and default calendar-window tests.
