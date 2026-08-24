# JiraActivityAnalyzer v0.3.34 Test and Verification Report

Target Version: 0.3.34
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 705e28201b02d63b563b1dbc8840cdc5c1402916
Branch: feat/v0.3.34-provider-lifecycle-live-analysis-validation
Generated: 2026-08-24T09:18:53.5590429Z

## 結果

- typecheck: PASS
- test:v0.3.34: PASS; providerCalled=false
- replay:v0.3.33: PASS (2/2 real debug bundles)
- v0.3.31/v0.3.32/v0.3.33 regression: PASS
- build: PASS
- dist: PASS after authorized dirty-worktree override; existing user report remained untouched
- packaged Bridge v14 verifier: PASS for win-unpacked and Portable
- win-unpacked renderer: did-finish-load PASS; later full smoke FAIL at legacy precision-probe selector probe-mode-stability
- Portable full UI smoke: FAIL/NO DIAGNOSTIC OUTPUT after 186232 ms; Bridge diagnostic independently PASS
- Live 17 Provider E2E: NOT RUN; no opt-in/config; Provider not contacted

## Warnings

- Vite browser externalization warning for node:crypto in shared/descriptionDiff.ts.
- Vite chunk size warning: renderer JS approximately 833.90 kB.
- Packaging dirtyState=true solely because a pre-existing tracked report modification was preserved.
