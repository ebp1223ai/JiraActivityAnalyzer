# v0.3.33 Real Debug Replay Report

Target Version: 0.3.34
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 705e28201b02d63b563b1dbc8840cdc5c1402916
Branch: feat/v0.3.34-provider-lifecycle-live-analysis-validation
Generated: 2026-08-24T09:18:53.5590429Z

## 20260824_151333

PASS offline replay. Run analysis_1b45da4f-2e4a-463b-b3af-426c1f0f09ce; 4/4 files, 17/17 records, 311276 bytes. Reproduced AI_MODEL_DELIVERY_HANDLE_REPLAYED after successful finalize. v0.3.34 expected behavior: readonly status succeeds.

## 20260824_153456

PASS offline replay. Run analysis_72db2466-7a18-43e1-88ae-4d2f4c55f9be; 4/4 files, 17/17 records, 311276 bytes. Reproduced ANALYSIS_STARTED failure after finalize. v0.3.34 expected behavior: atomic finalize enters INPUT_READY first.

Provider contacted: false. Production SQLite written: false.
