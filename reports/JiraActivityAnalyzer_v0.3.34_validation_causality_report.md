# Validation Causality Report

Target Version: 0.3.34
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 705e28201b02d63b563b1dbc8840cdc5c1402916
Branch: feat/v0.3.34-provider-lifecycle-live-analysis-validation
Generated: 2026-08-24T09:18:53.5590429Z

The fixed 14-stage formal receipt chain is preserved. After the first FAILED stage, every later formal dependent stage is NOT_RUN_DUE_TO_PRIOR_FAILURE; no later formal stage is reported PASSED. Diagnostic outputs are not promoted to canonical or SQLite-eligible output. Offline causality test with DECISION_SCHEMA failure: PASS.
