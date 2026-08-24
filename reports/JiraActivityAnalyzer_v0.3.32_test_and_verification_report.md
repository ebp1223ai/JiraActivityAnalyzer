# JiraActivityAnalyzer v0.3.32 Test and Verification Report

Overall Status: **Partial / Manual Validation Pending**.

Source implementation, real v0.3.31 Debug replay, focused regression, build, formal packaging, packaged Bridge diagnostic, win-unpacked isolated short launch, artifact hashing, and package inventory passed. A real v0.3.32 Managed OAuth 17-record run, Installer GUI, clean Windows validation, and Portable GUI short launch remain manual validation items. Portable Bridge diagnostic passed; its regular GUI launch could not be isolated while the user's pre-existing v0.3.31 Portable instance was running, and that process was intentionally left untouched.

- Target / Build Version: `0.3.32`
- Build Time: `2026/08/24 11:12:08`
- Branch: `feat/v0.3.32-quote-level-multiskill-quality-gate-truth`
- Package Source Commit: `3b3f5b8662344254f3cc7168ab6a51520413d643`
- dirtyState=true only because the user's pre-existing tracked v0.2.47 report modification was preserved and excluded.

## Commands

| Command | Result | Exit | Duration |
|---|---|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 9.455 s |
| `npm.cmd run test:v0.3.32` | PASS | 0 | 1.384 s |
| `npm.cmd run replay:v0.3.31-quality-gate` | PASS | 0 | 0.870 s |
| `npm.cmd run replay:v0.3.31-validation-receipts` | PASS | 0 | 0.633 s |
| `npm.cmd run replay:v0.3.31-terminal-lifecycle` | PASS | 0 | 0.600 s |
| v0.3.32 focused regression | PASS | 0 | 1.481 s |
| v0.3.31 transport regression | PASS | 0 | 3.266 s |
| `npm.cmd run build` | PASS | 0 | 30.623 s |
| `npm.cmd run dist` attempt 1 | EXPECTED BLOCK | 1 | 16.923 s |
| authorized dirty-state `npm.cmd run dist` | PASS | 0 | 161.915 s |
| packaged Bridge verifier | PASS | 0 | 10.565 s |
| win-unpacked isolated short launch | PASS | 0 | duration unavailable after task compaction |
| Portable regular short launch | MANUAL PENDING | n/a | 24.000 s attempted |

The first dist attempt correctly stopped at the clean-worktree guard due to the preserved user-owned tracked report. The successful retry explicitly recorded `dirtyState=true` and the fixed Package Source Commit.

## Functional Evidence

- Real replay: old blocked records 14; new blocked records `0,4,5,7,9,10,11,14,15,16`; false positives released `1,2,12,13`.
- Source-quote-driven boilerplate warnings: 48 to 0.
- Decision count 17 and Skill finding count 38 remain unchanged.
- `CATALOG_DETAIL_MISSING` is accepted as a legal Decision v5 status when all formal gates pass; it does not independently fail a run.
- Quality failure receipts: stages 01-07 PASSED, 08 FAILED, 09-14 NOT_RUN_DUE_TO_PRIOR_FAILURE.
- Submission result is `persisted`; formal artifact result is `rejected`; diagnostic outputs do not masquerade as formal outputs.
- One idempotent `run_terminal` event with non-null terminal time and aligned snapshot hash.

## Package Evidence

ASAR contains 4,685 entries and no sensitive-name hits for `.env`, Token file, SQLite/DB, Debug Folder/Bundle, historical prompt, or user test directory. Packaged rules match all four controlled hashes. Bridge is external-only: ASAR current count 0, external count 1, stale count 0, bytes 173352, SHA-256 `42f5034b75efbfa37af4876edf53d84d5ebedf29bf520323dd392462467567e2`, loadability validated.

win-unpacked startup loaded `file:///.../app.asar/dist/index.html`, emitted `renderer did-finish-load`, then user-action route readiness for `/` and `/database`; stderr was empty and no renderer crash/fatal marker appeared. The current build does not emit a literal `renderer_boot` marker, so the renderer load and route action logs are the available startup evidence.

Warnings: Vite externalized `node:crypto` for browser compatibility; renderer chunk exceeds 500 kB; electron-builder reported duplicated dependencies and default Electron icon. No warning changed functional contracts. Actual token telemetry: `unavailable`.

Not executed: real Managed OAuth/ChatGPT, Jira, production SQLite, 117 records, Installer GUI, clean Windows, long-running smoke, or a second Provider turn.
