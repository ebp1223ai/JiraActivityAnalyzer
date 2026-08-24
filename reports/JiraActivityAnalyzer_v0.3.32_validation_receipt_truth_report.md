# JiraActivityAnalyzer v0.3.32 Validation Receipt Truth Report

Contract: `jaa-validation-stage-receipt-v2`.

For the supplied v0.3.31 rejected artifact, replay produced:

| Sequence | Stage | Outcome |
|---:|---|---|
| 01 | TOKEN_BINDING | PASSED |
| 02 | SUBMISSION_DECODE | PASSED |
| 03 | DECISION_SCHEMA | PASSED |
| 04 | COUNT_INDEX_ORDER | PASSED |
| 05 | EVIDENCE_QUOTE_REFERENCE | PASSED |
| 06 | SOURCE_ROLE_ATTRIBUTION | PASSED |
| 07 | STATUS_SEMANTIC | PASSED |
| 08 | QUALITY_GATE | FAILED |
| 09 | CANONICAL_ASSEMBLY | NOT_RUN_DUE_TO_PRIOR_FAILURE |
| 10 | ANALYZED_RESULT_PUBLISH | NOT_RUN_DUE_TO_PRIOR_FAILURE |
| 11 | ACTIVE_RESULT_COMMIT | NOT_RUN_DUE_TO_PRIOR_FAILURE |
| 12 | REPORT_PACKAGE | NOT_RUN_DUE_TO_PRIOR_FAILURE |
| 13 | HTML_RENDER | NOT_RUN_DUE_TO_PRIOR_FAILURE |
| 14 | SQLITE | NOT_RUN_DUE_TO_PRIOR_FAILURE |

`firstFailedValidationStage=QUALITY_GATE`, `rootErrorCode=AI_DECISION_QUALITY_GATE_BLOCKED`, and `rootErrorStage=QUALITY_GATE`. Diagnostic Package and Diagnostic HTML creation do not change formal stages 12 or 13 to PASSED.
