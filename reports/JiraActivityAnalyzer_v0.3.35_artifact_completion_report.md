# v0.3.35 Artifact Completion Report

Artifact acceptance no longer requires an `ANALYSIS_COMPLETED` progress checkpoint. Acceptance requires `INPUT_READY`, a complete delivery receipt, valid single-use token/scope, durable raw submission, and exact decision count/index/schema preconditions. Duplicate Artifact submission remains rejected. Recoverable progress failures do not become the Run root error and do not block a later valid Artifact.

Offline deterministic tests passed with `providerCalled=false` and `productionSqliteWritten=false`. Real v0.3.34 artifact conservation counts (17 decisions, 44 findings, 79 references, 14 `CATALOG_DETAIL_MISSING`, 3 `UNKNOWN`) remain **not independently replay-verified in this run** because Debug Bundle access was security-blocked.
