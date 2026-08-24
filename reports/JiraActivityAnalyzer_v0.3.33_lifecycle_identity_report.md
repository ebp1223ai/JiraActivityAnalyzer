# v0.3.33 Lifecycle and Runtime Identity Report

## Lifecycle

Duplicate progress stages are idempotent and do not create authoritative root errors. A successful run clears `firstFailedStage`, `firstFailedValidationStage`, `rootErrorCode`, `rootErrorStage`, and `rootErrorMessage`. HTML-only failure is represented as `completed_with_report_error`. Terminal finalization remains append-only and idempotent.

Both v0.3.32 real-debug replays reproduced the ghost `ANALYSIS_STARTED` failure and verified that v0.3.33 normalized success lifecycle fields are null.

## Runtime Identity

- App: `0.3.33`
- Prompt: `JAA-CHATGPT-ZH-TW-0.3.33`
- Prompt template: `0.3.33-zh-TW-v14`
- Quality: `jaa-ai-analysis-quality-v4`
- Provider transport: `bridge-resumable-v4`
- Bridge: `0.3.31-bridge-v13`

Dispatch identity is validated and persisted before Provider contact. Stale App/Prompt identity fails closed. The external Bridge remains intentionally frozen and byte-identical at 173352 bytes / SHA-256 `42f5034b75efbfa37af4876edf53d84d5ebedf29bf520323dd392462467567e2`; app and prompt identity are separate fields.
