# AI Analysis Instruction Modes v0.3.19

Jira Activity Analyzer supports three run-scoped instruction modes:

- `STANDARD_FORMAL`: uses the immutable JAA safety wrapper and formal analysis contract.
- `STANDARD_PLUS_USER_INSTRUCTION`: adds a user analysis focus without replacing safety, delivery, schema, identity, count, or SQLite gates.
- `CUSTOM_DIAGNOSTIC`: returns a diagnostic response only. It cannot create canonical analyzed JSON, Golden HTML, or SQLite-eligible results.

Every run archives the selected mode, component files, final effective instruction, SHA-256, composition manifest, and input transport contract under `control/`.

## Verifiable Input Delivery

`bridge-resumable-v2` separates local source validation from delivery to the model:

1. `progress/source-input-receipt.json` proves that JAA validated the four immutable UTF-8 source snapshots.
2. The model reads bounded UTF-8 segments and acknowledges each byte range and SHA-256.
3. Interrupted delivery resumes from the first missing segment with bounded retries.
4. `progress/model-delivery-receipt.json` is created only after all files and records are acknowledged.
5. Formal `INPUT_READY` and `ANALYSIS_STARTED` checkpoints are rejected without the Model Delivery Receipt.

Provider completion, model delivery, analysis, artifact validation, and SQLite persistence are separate lifecycle facts. A completed provider turn remains completed if a later JAA gate fails.

## Security

The immutable wrapper disallows shell commands, arbitrary file access, external providers, credential access, and path overrides. Provider and debug payloads are structurally sanitized without truncating JSON envelopes. Token, authorization, cookie, password, and API-key fields are always masked.

Managed OAuth integration and real 17/117-record provider runs require manual validation. Automated tests use local fixtures and do not contact Jira or an AI provider.
