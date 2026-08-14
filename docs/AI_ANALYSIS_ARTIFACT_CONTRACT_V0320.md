# AI Analysis Artifact Contract v0.3.20

## Authoritative contract

The single source of truth is `electron/aiAnalysisDecisionContractV0320.ts`.
It generates the per-Run Decision JSON Schema, contract SHA-256, runtime
validation, observable findings, and synthetic fixtures used by tests.

Contract version: `jaa-ai-analysis-decisions-v2`

`decisionsDocument` is a direct JSON array with exactly N items. It is never a
JSON string and never an object containing `decisions` or `records`. Each item
contains exactly these fields:

- `recordIndex`
- `status`
- `skillIds`
- `confidence`
- `positiveEvidence`
- `negativeChecks`
- `unknownReasons`
- `rationale`

The index set must be exactly `0..N-1`. Skill IDs must exist in the Run-bound
Catalog. `CLASSIFIED` requires at least one Skill ID and positive evidence.
`UNKNOWN` requires an unknown reason, while an empty `negativeChecks` array is
valid.

## Evidence and failure semantics

Every publication call writes metadata-only evidence before validation:

- `progress/artifact-submission-attempts/artifact-submission-attempt-NNN.json`
- `progress/artifact-submission-attempts/artifact-submission-result-NNN.json`

Attempt evidence contains argument byte length and SHA-256, top-level keys,
observed root type, count and index coverage, and the contract version/hash. It
does not persist raw tool arguments or credentials.

Root type, exact count, index set, schema, Catalog identity, and semantic
failures use separate error codes. The first concrete error remains the
`rootErrorCode`; missing Artifact, canonical-not-created, and SQLite-not-written
are derived consequences. A Provider turn can therefore be `completed` while
analysis is `completed` and Artifact publication is `submission_rejected`.

## Authoritative counts

Decision validation and deterministic canonical assembly own all authoritative
counts. `analysis-report.md` is explanatory only. A self-reported status count
that differs from the Decision distribution adds `AI_REPORT_COUNT_MISMATCH` and
requires warning acceptance before SQLite eligibility; it never changes the
Decision array or canonical result.

## Rule Set binding

The packaged v0.3.20 Rule Set is bound to:

- Rule Set: `JAA-SKILL-RULESET-2026-08-14-DRAFT-02`
- Manifest: `0.2.0`
- Common Rules: `1.2.0`
- Skill Catalog: `0.3.1`
- Classification: `JAA-CLASSIFICATION-1.2.0`
- Prompt: `JAA-CHATGPT-ZH-TW-0.3.20`
- Pipeline: `JAA-ANALYSIS-PIPELINE-0.3.20`
- Model Decision schema: `jaa-ai-analysis-decisions-v2`

Model delivery remains `bridge-resumable-v2`; v0.3.20 does not introduce a
second transport, repair run, provider fallback, or batch analysis flow.
