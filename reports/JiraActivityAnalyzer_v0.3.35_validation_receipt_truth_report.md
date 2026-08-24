# v0.3.35 Validation Receipt Truth Report

Validation receipt schema is `jaa-validation-stage-receipt-v2`. Stages 9-14 cannot be marked `PASSED` without reopening durable evidence and matching bytes plus SHA-256. Production terminal receipts bind:

- Stage 9: Canonical Result durable file.
- Stage 10: Analyzed Result durable publish file.
- Stage 11: durable Active Result registry containing the analyzed result hash.
- Stage 12: Report Data Package file.
- Stage 13: rendered HTML file; render failure is WARNING, not PASS.
- Stage 14: SQLite transaction commit receipt; test isolation uses `NOT_RUN_BY_TEST_ISOLATION`.

No `delegated`, `placeholder`, or `planned` reason can produce a v2 PASS. Offline tests verify missing evidence is rejected and test-isolated SQLite is not reported as executed.
