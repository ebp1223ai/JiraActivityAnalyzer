# JiraActivityAnalyzer v0.3.25 Test and Verification Report

Target Version: 0.3.25
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 771fe6dc0f0f16e674fc65c987ce4a86ce16b550
Branch: feat/v0.3.25-per-file-rule-selection-gated-results-workspace

Automated evidence is complete for synthetic contracts, regression, build, package inventory and isolated short launch. Managed OAuth, real Jira, production SQLite, formal 117-record analysis and clean Windows GUI remain Manual Validation Pending.

## Results

- npm.cmd run typecheck: PASS, exit 0, 9,421 ms.
- npm.cmd run test:v0.3.25: PASS, exit 0, 4,481 ms.
- npm.cmd run build: PASS, exit 0, 18,660 ms.
- npm.cmd run dist: PASS after the documented authorized dirty-worktree retry, exit 0, approximately 120,030 ms.
- git diff --check: PASS.
- ASAR inventory: PASS; only analysis-bridge-v0325.cjs and its v7 manifest are present.
- win-unpacked short launch: PASS; did-finish-load observed, no renderer crash, white screen, unresponsive or fatal event.
- Portable short launch: PASS; did-finish-load observed, no renderer crash, white screen, unresponsive or fatal event.
- First dist attempt: exit 1 because an existing user-owned tracked report is dirty. The retry used JAA_ALLOW_DIRTY_PACKAGE=1 and fixed JAA_PACKAGED_SOURCE_COMMIT=771fe6dc0f0f16e674fc65c987ce4a86ce16b550; the existing change was preserved and excluded from commits.
- Build warnings: Vite browser externalization warning for node:crypto in shared/descriptionDiff.ts; minified renderer chunk exceeds 500 kB; default Electron icon; duplicate dependency references reported by electron-builder.
- Actual token telemetry: unavailable.