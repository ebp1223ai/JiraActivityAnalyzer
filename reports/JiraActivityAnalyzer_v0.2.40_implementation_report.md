# Jira Activity Analyzer v0.2.40 Implementation Report

## Result

v0.2.40 implements a new Current-State archive database and Stable
Deduplication V2. Automated fixture validation, the established unit,
integration and regression suites, production build, app-only Electron UI
smoke, and Windows packaging completed successfully. Real company Jira and
manual GUI acceptance were not executed.

## Major Modules

- `electron/currentStateArchive.ts`: schema, compatibility inspection,
  database creation, payload prevalidation, per-Issue transactions, dedup,
  rollback, event insertion, run summary, checkpoint and bounded vacuum.
- `electron/stableIssueContentV2.ts`: canonical projection, Stable Hash V2,
  exact volatile Field ID resolution, ambiguity warnings, Java identity
  normalization, and meaningful changed paths.
- `electron/coverageProfile.ts`: typed Coverage states, validation, and
  Equivalent/Upgrade/Downgrade/Incomparable/Invalid comparison.
- `electron/sourceArchiveDatabaseWrite.ts`: Stage 5 file-backed integration
  and sanitized save diagnostics.
- `src/routes/AnalysisPage.tsx`: bilingual Current-State result metrics and
  diagnostics path.
- `electron/v0240CurrentStateArchive.test.ts`: focused 57-scenario fixture
  validation.

## Schema

The writable v0.2.40 database declares:

- `schema_version = 1`
- `storage_model = current_state`
- `storage_model_version = 1`
- `stable_hash_policy_version = 2`

Tables:

1. `database_metadata`
2. `source_objects`
3. `current_issue_snapshots`
4. `current_full_fetch_payloads`
5. `issue_sync_states`
6. `activity_events`
7. `database_run_state`

The new schema does not create or use `source_object_versions`,
history `source_payloads`, or `source_import_refs`. Primary and unique
constraints enforce one Snapshot, Payload, and Sync State per Issue and one
event identity per Source Object.

## Stable Projection V2

Business fields, complete Comments and Changelog, attachment metadata,
relationships, parent/subtasks, optional Remote Links, custom fields, and
Coverage markers participate. Fetch/run/queue/evidence paths, `names`,
`schema`, `renderedFields`, local runtime metadata, and Jira `updated` alone do
not participate.

Known calculated field display names are resolved from the same Full Fetch
`names` map. Exclusion uses exact Field IDs only. Missing mappings produce a
non-fatal warning; ambiguous mappings exclude nothing and produce
`AMBIGUOUS_VOLATILE_FIELD_MAPPING`.

Java object identity normalization removes only proven hexadecimal
`Object.toString` suffixes while preserving meaningful Development content.

## Coverage and Transactions

Coverage distinguishes Disabled, Skipped, Failed, Partial, CompleteEmpty, and
CompleteNonEmpty. Only Equivalent and Upgrade candidates can enter formal
comparison. Downgrade, Incomparable, Invalid, Partial, and Failed candidates
leave formal Issue rows unchanged.

Candidate JSON is serialized to exact UTF-8 bytes, SHA-256 hashed, gzip
compressed, decompressed, re-hashed, and parsed before a transaction.
Snapshot, Payload, Sync State, and Activity Events then commit atomically per
Issue. Fault injection proves rollback after Snapshot mutation and during
event insertion.

Stable-equal and equivalent-Coverage saves do not rewrite Snapshot or Payload,
do not update `payload_updated_at`, and do not increment `content_revision`.
They increment successful check metadata and safely deduplicate events.

## Legacy Handling

v0.2.39 databases are detected read-only by their history tables. Detection
does not migrate, compact, rename, delete, activate, or modify the file.
Automated validation compares the legacy file SHA-256 before and after
detection.

## Validation

| Command | Result | Duration |
|---|---|---:|
| `npm.cmd run typecheck` | Passed | 7.4 s final focused run |
| `npm.cmd run test:v0.2.40` | Passed, 57 scenarios | 2.3 s |
| `npm.cmd run test:unit` | Passed | 16.9 s final run |
| `npm.cmd run test:integration` | Passed | 1.46 s |
| `npm.cmd run test:regression` | Passed | 1.46 s |
| `npm.cmd run build` | Passed | 23.48 s |
| `npm.cmd run test:ui` | Passed, 9 routes x 5 viewports | 76.0 s final run |
| `npm.cmd run dist` | Passed | 78.2 s |

The aggregate unit suite no longer invokes the obsolete v0.2.38 test whose
production expectation requires writing the legacy history model. That
historical test file remains unchanged and available separately. v0.2.39
legacy module tests continue to pass.

Known non-blocking build warning: the renderer bundle exceeds Vite's 500 kB
chunk advisory. No new runtime error was observed.

## Manual Acceptance

- Automated synthetic four-Issue fixture: passed.
- Real Jira four-Issue acceptance: Not executed.
- Real Label and volatile-field change rounds: Not executed.
- Manual Windows GUI acceptance: Not executed.
- Long-duration packaged smoke: intentionally not executed.

The manual SQL and seven-round procedure is documented in
`docs/v0.2.40-current-state-archive.md`.

## Artifacts

- Setup: `release/Jira Activity Analyzer Setup 0.2.40.exe`
  - Size: 106,471,213 bytes
  - SHA-256: `684064BB0DB33F40D522AED5478B667249FA1D5E93A1A7C77D4AD48AB0A5FFFE`
- Portable: `release/Jira Activity Analyzer Portable 0.2.40.exe`
  - Size: 106,241,230 bytes
  - SHA-256: `A7626132FACF09069DE200EB81B57728C0CB971305B8C2A5AB24506827E2ADB6`

## Git Status

- Branch: `feat/v0.2.40-current-state-archive-stable-dedup-v2`
- Baseline: `08ff3e313f0a6d7475050e91270e96c84489af67`
- Delivery commit and push status: pending final repository review.
- No v0.2.40 tag or GitHub Release is created before real-machine acceptance.

## Limitations and Risks

- Current-State intentionally retains no historical Snapshot or Payload rows.
- Stable Hash exclusion policy may need future tuning as Jira plugins change.
- Volatile-only raw response changes do not replace the authoritative archive.
- Deleted or inaccessible Jira history cannot be recovered by refetching.
- The complete real-company Jira and Windows acceptance procedure remains a
  user-environment gate.
