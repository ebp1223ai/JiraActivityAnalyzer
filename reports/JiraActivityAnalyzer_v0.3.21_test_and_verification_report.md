# Jira Activity Analyzer v0.3.21 Test and Verification Report

- Status: Automated verification completed; manual integration validation pending.
- Branch: `feat/v0.3.21-manifest-html-renderer-run-safe-sqlite`
- Package Source Commit: `3230f6f68ff1810d43c94666bb97c81934f5d396`
- Build Time: `2026/08/19 13:04:13` (`2026-08-19T05:04:13.656Z`)
- Dirty package flag: `true`, solely because the pre-existing unrelated v0.2.47 report remained modified and was deliberately excluded from source commit and package inputs.

## Commands

| Command | Result | Duration |
|---|---:|---:|
| `npm.cmd run typecheck` | PASS | 12.2 s |
| `npm.cmd run test:v0.3.21` | PASS | 6.0 s |
| `npm.cmd run build` | PASS | 14.886 s |
| `npm.cmd run dist` | PASS | 112.351 s |
| `git diff --check` | PASS | no findings |
| ASAR inventory and sensitive filename scan | PASS | 5.7 s |
| win-unpacked short launch | PASS | 8.285 s |
| isolated Portable bounded short launch | PASS | 14.217 s |

## Coverage

Six status combinations, 28 legacy findings, exact count/index/schema/catalog checks, contract/transport regression, Manifest/template fail-closed checks, deterministic 0/17/117 HTML, XSS/offline/CSV/print controls, and run-safe/idempotent/rollback SQLite cases passed.

ASAR contained 4,686 entries, zero sensitive filename hits, and zero stale v0318/v0319/v0320 Bridge or v0.3.20 bundled-rule hits.

## Warnings

Vite reported the existing `node:crypto` browser externalization and chunk-size warning. electron-builder used the default Electron icon and reported duplicate dependency references. Managed OAuth real 17/117, production SQLite/Debug Folder, and clean Windows Installer GUI remain Manual Validation Pending.
