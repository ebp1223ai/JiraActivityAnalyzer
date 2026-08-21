# Jira Activity Analyzer v0.3.30 Test and Verification Report

Overall Status: **Partial / Manual Validation Pending**

Package Source Commit: `201d1730580594b508047026f56158cf041e4525`
Build Time: `2026/08/21 18:22:28` (Asia/Taipei)

## Automated Evidence

- `npm.cmd run typecheck`: PASS (14.136 s formal run; 13.049 s final correction run)
- `npm.cmd run test:v0.3.30`: PASS (3.930 s formal run; 4.268 s final correction run)
- `npm.cmd run replay:v0.3.29-bridge-unavailable`: PASS
- `npm.cmd run replay:v0.3.29-provider-dispatch-truth`: PASS
- `npm.cmd run build`: PASS; Vite large-chunk and existing `node:crypto` browser externalization warnings only
- `npm.cmd run dist`: first attempt blocked by the pre-existing tracked dirty report; authorized dirty-worktree retries PASS; final external-only package run 143.322 s
- `git diff --check`: PASS for v0.3.30 source files
- packaged inventory: PASS; app.asar current Bridge 0, external current Bridge 1, stale Bridge 0
- packaged inventory: PASS; app.asar current Bridge 0, external current Bridge 1, stale Bridge 0
- win-unpacked Bridge diagnostic: PASS, exit 0
- Portable extraction Bridge diagnostic: PASS, exit 0
- win-unpacked short launch: `renderer_boot`, `did-finish-load`, `Initial Route Ready`; no crash event
- Portable isolated short launch: `renderer_boot`, `did-finish-load`; no crash event

## Preserved Contracts

Decision v5, Model-visible Quote Map, 17/17 quote coverage, Systemic No-result Gate, Run Manifest Single Writer, Active Result, Report Data Package, HTML renderer, SQLite gate, and `1 JSON + 3 MD` were retained. The four controlled Markdown files were not modified.

## Manual Validation Pending

No real Managed OAuth 17-record Provider run, Installer GUI installation, real Jira request, or production SQLite write was performed. Installer payload was built from the same verified electron-builder `extraResources` configuration, but Installer GUI execution remains manual.
