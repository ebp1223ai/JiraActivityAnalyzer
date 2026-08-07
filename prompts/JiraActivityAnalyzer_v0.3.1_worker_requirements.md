# Jira Activity Analyzer v0.3.1 Worker Requirements

You are the monitored Worker. Obey the active phase at the top of each turn and stop after writing its handoff. Use the same thread for all four phases.

## Baseline and Git

- Required ancestry baseline: `feat/v0.3.0-pending-analysis-data-export` at `bd3a44fde48754ea56a125808d1913ba34dc3a5c`.
- v0.3.0 packaged source: `1cba4a00f100cb7fc02728a345aa050d38b19e5c`.
- Required App branch: `fix/v0.3.1-pending-analysis-export-correctness`, created from the instrumentation commit.
- Preserve the existing unrelated dirty v0.2.47 report and all unrelated untracked files. Never inspect private untracked content.
- Never use clean, reset, stash, rebase, force, `git add .`, or `git add -A`.
- No push, tag, PR, release, dependency install, or history rewrite.
- Allowed commits after instrumentation: one Source commit and one Evidence commit, with precise file staging.

## Defects and scope

Fix only the confirmed v0.3.0 pending-analysis export defects:

1. Real exports fail with `EXPORT_INTEGRITY_FAILED Local path found at $.analysisContent.beforeRaw` for User Viewer 369/2263 and Issue Viewer 3/21.
2. Debug Folder lacks pending-analysis export lifecycle diagnostics.
3. Active Export remains clickable and produces an already-running response.
4. Progress can contradict itself, such as `0 / 369` with `95%`.

Do not redesign the pending-analysis contract, add AI features, selected sets, remote fetch/write, SQLite schema/index/migration, unrelated Viewer filters, Diff classifier, or event identity. Do not add dependencies or broadly format/refactor.

## P0-A Provenance-aware integrity policy

- Centrally distinguish `SOURCE_EVIDENCE`, `DERIVED_FROM_EVIDENCE`, and `RUNTIME_GENERATED_METADATA`.
- Path-like Jira evidence in beforeRaw, afterRaw, canonical Diff/hunks, comments, descriptions, or other explicit source evidence is legal and must remain byte/content/hash stable.
- Do not use a property-name-only whitelist.
- Unknown/generated provenance defaults fail closed.
- Typed reasons must include `EVIDENCE_PATH_TEXT_ALLOWED`, `RUNTIME_PATH_IN_GENERATED_METADATA`, `CREDENTIAL_PATTERN_DETECTED`, and `UNKNOWN_FIELD_PROVENANCE`.
- The scanner only passes or fails. It must never clean evidence and continue.

## P0-B Runtime paths and credentials

- Fail closed on runtime-generated SQLite, APP_ROOT descendant, executable, userData, temp, staging, profile, and non-contract host filesystem identity.
- Normalize separators and descendants, and compare Windows paths case-insensitively.
- Credentials fail closed in every provenance zone: token, authorization/bearer, cookie/session, password/secret, and real env material.
- Diagnostics may report typed reason and JSON path but never the value.

## P1-C Durable diagnostics

Connect to the existing production logger and Debug Folder collector:

- `pending_analysis_export_started`
- `pending_analysis_export_completed`
- `pending_analysis_export_failed`
- `pending_analysis_export_cancelled`

Include only sanitized timestamp, app/build identity, runId, viewer source, filter snapshot hash, frozen/processed/serialized/written counts, stage, elapsed, public/internal reason, offending JSON path, and output basename/relative identity. Never log evidence, Diff, Description, Comment, credential, or absolute DB/APP_ROOT/temp path. Throttle progress diagnostics.

## P1-D Concurrency and progress

- Both Viewers disable Export while active and leave only Cancel enabled.
- Renderer does not send duplicate starts; keep main/coordinator guard.
- Ignore stale run events and restore UI after completed/failed/cancelled.
- `totalRecords` is frozen filtered count. Primary processed count is monotonic and never above total.
- `0 / N` is 0%. Finalization is a stage, not fake record percentage. Only successful completion reaches 100%.
- Preserve bounded batching, generation guard, cancellation, atomic rename, no renderer full-memory export, no fallback output, and no final/partial success file on failure/cancel.

## Production-path tests

Use only synthetic data and exercise production paths:

- Evidence accepts Windows, slash, UNC, POSIX, and relative path text in before/after/Diff/hunks; original text and hashes are unchanged.
- Generated metadata containing synthetic APP_ROOT, SQLite, userData, temp, executable, or unknown runtime paths fails closed.
- Credentials fail everywhere and diagnostics omit values.
- Diagnostic started/completed/failed/cancelled lifecycle reaches the synthetic Debug Folder collector, includes sanitized counts/reasons/path, excludes evidence/credentials/runtime roots, and throttles progress.
- Both Viewers disable Export and retain Cancel; duplicate renderer start is suppressed, main guard remains, stale events are ignored.
- Progress is monotonic, bounded, 0/N is 0%, only completion is 100%, and failed/cancelled resets.
- Preserve v0.3.0 invariants: full frozen filtered set rather than page, page/pageSize excluded from filter hash, Diff/identity/Before/After/hash consistency, bounded 100-row-equivalent batches, mismatch fail closed, atomic rename, generation/cancel guard, and contract `0.3.0-draft.1 / review-draft`.

## Version and verification

- Set App version to 0.3.1 consistently in VERSION, package metadata/lockfile, Electron/UI Build Info, Debug metadata, artifacts, CHANGELOG, and reports.
- Do not change SQLite schema, ENV_FORMAT_VERSION, or pending-analysis contract namespace/schema/status.
- Verification order: focused v0.3.1 tests; v0.3.0 export regression; affected Viewer/export/diagnostic regression; typecheck; necessary integration; `git diff --check`; Source commit; exactly one clean production Windows Dist from Source commit; same-artifact audit; short offline packaged synthetic smoke; contamination scan; reports/ledgers; Evidence commit.
- Do not run the full historical suite or cancelled long UI smoke. Retry only the smallest failed scope and record cost.
- Use a new run-specific v0.3.1 delivery root if any existing v0.3.1 artifact exists. Never overwrite v0.3.0 artifacts.
- Audit Installer, Portable, and win-unpacked/app.asar for version 0.3.1 and exact Source commit. Exclude env, token, DB, real JSON, Debug Folder, reports, tests, source maps, backups, raw telemetry, and local paths.

## Ledgers, reports, and handoff

Phase 1 immediately starts:

- `reports/JiraActivityAnalyzer_v0.3.1_execution_time_ledger.json`
- `reports/JiraActivityAnalyzer_v0.3.1_scope_and_token_ledger.json`

Required evidence reports:

- `reports/JiraActivityAnalyzer_v0.3.1_implementation_report.md`
- `reports/JiraActivityAnalyzer_v0.3.1_test_and_package_report.md`
- `reports/JiraActivityAnalyzer_v0.3.1_manual_validation_checklist.md`
- the two ledgers above
- `reports/JiraActivityAnalyzer_v0.3.1_controller_supervision_ledger.json` supplied/finished with Controller boundaries

Inspect only the v0.3.0 export path: integrity scanner, serializer/engine/coordinator/worker, progress/cancel IPC, common export panel, Issue/User Viewer wiring, diagnostic logger/Debug Folder collector, version/package metadata, and direct tests. Prefer `git show --name-only 1cba4a0...`, targeted search, import/type trace, and focused tests. Do not scan old prompts/reports, node_modules, dist, real logs, or SQLite.

Every handoff must contain exact phaseId, completed status, current threadId, branch, HEAD, timestamps, nonempty inspected paths (or explicit notApplicableReason), modified paths, commands, retries, nextPhaseReady true, and empty blockers. Inspected/modified/commands must be truthful. Token usage is owned by the runner and must not be estimated or edited by the Worker.

Final automated status remains Partial pending real user revalidation. Real SQLite export and Windows GUI UX are not automated acceptance; business review stays blocked until a successful real export.

For the first phase only, the runner has not observed `thread.started` when your handoff is authored. Use the exact sentinel `RUNNER_INJECT` supplied in the active prompt. The runner preserves that declaration and replaces only `threadId` with the machine-observed JSONL thread ID before schema validation. Every resumed phase receives and must write the exact thread ID supplied by the runner.