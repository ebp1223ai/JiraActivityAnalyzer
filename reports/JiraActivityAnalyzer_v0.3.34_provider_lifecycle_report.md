# Provider Lifecycle Report

Target Version: 0.3.34
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 705e28201b02d63b563b1dbc8840cdc5c1402916
Branch: feat/v0.3.34-provider-lifecycle-live-analysis-validation
Generated: 2026-08-24T09:18:53.5590429Z

Bridge v14 adds a host-owned durable lifecycle from ATTEMPT_CREATED through TERMINAL. Finalize atomically records INPUT_DELIVERY_FINALIZED then INPUT_READY. Post-finalize readonly status remains valid. Progress duplicates are idempotent; non-monotonic telemetry is a recoverable warning and does not create a terminal failure. Tool evidence records state before/after and lifecycle receipt ID. All-FAILED batches are classified as AI_PROVIDER_RUN_LEVEL_FAILURE and do not create formal artifacts.
