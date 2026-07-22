# Changelog

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
- Deferred Field Evidence / 欄位來源檢視 and Coverage Matrix to v0.2.32.

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
