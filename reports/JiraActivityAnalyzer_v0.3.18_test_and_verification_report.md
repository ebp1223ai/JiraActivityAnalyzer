# Jira Activity Analyzer v0.3.18 Test and Verification Report

Generated: 2026-08-14 13:00:07 +08:00
Branch: `feat/v0.3.18-deterministic-analysis-bridge-observable-results`
Package Source Commit: `1479ea5e415a6de532c34a844772bbc31560cc69`

## Overall Status

**Partial / Manual Validation Pending**

All automatically verifiable implementation, regression, build, packaging, ASAR integrity, win-unpacked launch, and isolated Portable launch checks passed. Real Managed ChatGPT/OAuth 17-record three-run validation, real 117-record validation, and a clean-machine Installer GUI test were intentionally not run in this environment.

## Root Cause and Resolution

- Removed the v0.3.17 formal dependency on model-generated PowerShell `Get-Content`, `Set-Content`, `Move-Item`, and `command/exec` file operations.
- Added a bundled, versioned, SHA-256 verified, local-only Analysis Bridge using Codex dynamic tools over the existing stdio protocol. Formal provider threads use a read-only sandbox and have no external fallback.
- Added strict fatal UTF-8 decoding, byte-length and SHA-256 verification, fixed four-document allowlists, Run/session nonce validation, containment checks, and durable Input Receipts.
- Added authoritative Input, Analysis, Artifact, Validation, Canonical Assembly, SQLite, and overall lifecycle states. Provider Turn completion cannot imply Analysis completion.
- Added exact-count progress checkpoints and durable atomic artifact publication with `.tmp`, fsync, rename, reopen, and hash verification.
- Added distinct `AI 分析結果` and `AI 分析診斷結果` views, lifecycle evidence, Bridge integrity, durable failed-run conversation, artifact paths, Run folder access, and Debug Folder export.
- Changed generated provider prose and tool descriptions to Traditional Chinese (`zh-TW`) while preserving technical identifiers and supplemental user text.
- Expanded provider sanitizer fallback envelopes and Debug Folder expected/absent evidence classification.

## Verification Results

| Check | Result | Exit | Duration |
|---|---:|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 9.504 s |
| `npm.cmd run test:v0.3.18` | PASS | 0 | 15.174 s |
| `npm.cmd run build` | PASS | 0 | 26.297 s |
| Package Source rebuild | PASS | 0 | 14.328 s |
| Initial `npm.cmd run dist` | Expected block: existing tracked dirty report | 1 | 7.924 s |
| Authorized dirty-worktree `npm.cmd run dist` | PASS | 0 | 109.263 s |
| `git diff --check` | PASS | 0 | <1 s |
| win-unpacked short launch | PASS, renderer `did-finish-load` | 0 | 4.5 s |
| Isolated Portable short launch | PASS, renderer `did-finish-load` | 0 | 12.3 s |
| ASAR filename and Bridge integrity scan | PASS | 0 | 2.3 s |

The authorized dirty-worktree packaging exception was required only because the pre-existing tracked file `reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md` must be preserved and excluded from this release. `release/build-info.json` therefore records `dirtyState=true`, while `packagedSourceCommit` remains the exact v0.3.18 source commit above.

## Automated Coverage

- Four-document strict UTF-8 input, Traditional Chinese marker preservation, byte/hash receipts, invalid UTF-8, traversal, nonce/Run identity, and exact lifecycle ordering.
- 17 decisions to 17 validated decisions, UNKNOWN reason rules, Skill allowlist, exact record index order, warning SQLite gate, representative JSON/Markdown durable publication, and forced atomic rename failure.
- Bundled Bridge manifest/version/hash, local-only transport, no PATH lookup, no external fallback, no formal PowerShell/Shell path, and read-only provider sandbox.
- Durable conversation/provider logging, sanitizer fallback evidence, recovery, token telemetry, canonical gates, and prior v0.3.12-v0.3.17 regressions.
- Success/failure result labels, real lifecycle fields, no ChatGPT synthetic percentage bar, conversation reload, artifacts, token, and duration display.

## Packaging and Security

- ASAR entries scanned: 4,686.
- Forbidden `.env`, token, database, backup, and Debug Bundle path entries: 0.
- Bundled Codex: `0.147.0`, SHA-256 `935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d`.
- Bundled Analysis Bridge: `0.3.18-bridge-v1`, SHA-256 `6a5ad07c7963692d89ab43c0de141b4fb902b8659b1436da1a95791719cd415c`.
- Source scan findings were limited to `[masked]` authorization placeholders and the existing synthetic UI smoke token fixture. No usable credential was added or packaged.

## Warnings

- Vite reports the existing browser externalization warning for `node:crypto` in `shared/descriptionDiff.ts`.
- The renderer bundle is 835.52 kB and triggers the existing chunk-size warning.
- electron-builder uses the default Electron icon.
- electron-builder reports duplicate dependency references during dependency discovery.
- The package is signed with the local/default signing flow shown by electron-builder; no clean-machine trust validation was performed.

## Manual Validation Pending

- Managed ChatGPT/OAuth availability was not used or inspected.
- Real 17-record analysis repeated three times: pending.
- Real 117-record analysis: pending.
- Debug completeness from a real Managed ChatGPT Run: pending.
- Installer installation and launch on a clean Windows machine: pending.
- Current Codex development-session actual token telemetry is unavailable; no estimate is substituted.
