# JiraActivityAnalyzer v0.3.32 v0.3.31 Debug Replay Report

Replay source: supplied real v0.3.31 Debug Folder, read-only. The original 17 Decision bytes/hash were not changed.

## Preserved Transport Evidence

- Run `analysis_61bbd9a0-6f7a-4a0e-9267-04ed860bd515`
- Attempt `attempt_fa1ba84e-93de-487e-a551-9eff4d4a4916`
- Thread `01a024f7-0861-7ec3-a663-75dee8498967`
- Turn `01a024f7-0ba1-7711-99b1-33f28ebf914d`
- 4/4 files, 17/17 records, 297974/297974 bytes
- transport `bridge-resumable-v4`
- 75 segments, 1336 protected tokens
- UTF-8 cut 0, escape cut 0, protected-token cut 0, coverage gap 0, overlap 0
- reassembly verified; segment plan SHA-256 `0ef1b5d940f0d6451301e3feb4f55a04dffe8fe514e21eb8cf205b54446a794a`
- Quote `eq_1597081fd3c35b7879094f429849d371` exists and reference validation passed

## Validator Replay

Original: 14 multi-skill errors and 48 source-quote-driven boilerplate warnings. New validator: records `1, 2, 12, 13` released; records `0, 4, 5, 7, 9, 10, 11, 14, 15, 16` retained. Boilerplate source-text warnings: 0. Formal result intentionally remains BLOCKED.

Receipts are 01-07 PASSED, 08 FAILED, and 09-14 NOT_RUN_DUE_TO_PRIOR_FAILURE. Submission is persisted, formal artifact rejected, and exactly one terminal event is projected. Diagnostic artifacts are separate from formal Report/HTML.
