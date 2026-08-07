# Jira Activity Analyzer v0.3.2 Test and Package Report

Status: Ready for Manual Validation.

Source commit: `05724206531834728a04a45dae9ba28f45b2f403`

## Automated verification

| Check | Result |
| --- | --- |
| `npm run test:v0.3.2` | Passed: compact 2,026 bytes versus expanded equivalent 28,829 bytes; one canonical Diff hunk |
| `npm run test:v0.3.1` | Passed: integrity, diagnostics, progress, duplicate-start and cancellation regression |
| `npm run test:v0.3.0` | Passed: 160 User Viewer and 160 cross-view Issue Viewer records; full filtered set and multi-batch path |
| `npm run typecheck` | Passed |
| `npm run test:integration` | Passed |
| `npm run build` | Passed; existing Vite chunk-size and browser `node:crypto` externalization warnings only |
| `npm run dist` | Passed once from a detached clean worktree in 79.148 seconds |
| `npm run audit:package-size` | Passed; unexpected count 0 |
| ASAR audit | Passed: 2,078 entries, unexpected count 0, targeted contamination scan passed |
| Short packaged startup | Passed: alive after 8 seconds, 4 matching Electron processes, 0 remaining after cleanup |

## Contract result

- Schema: `jira-activity-analyzer.pending-analysis / 0.3.2-draft.1 / review-draft`.
- Export mode: `compact-reference`; not self-contained; full content remains in the source SQLite database.
- Recursive forbidden-key checks passed for direct records and production-path exported records.
- Canonical Diff hunks, source references, availability, provenance, and original-content SHA-256 remain available.
- Current-State SQLite schema remains v3.

Full GUI smoke, real Jira, and real SQLite content validation were not run. They remain manual acceptance gates.
