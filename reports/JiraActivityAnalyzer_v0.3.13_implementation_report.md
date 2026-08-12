# JiraActivityAnalyzer v0.3.13 Implementation Report

## Status

Implementation and local validation are complete. Formal Release Portable and real 117-record validation are recorded separately after packaging.

## Root cause reproduced

The v0.3.12 Provider schema represented `scoreComponents` as an arbitrary-key object. The regression fixture removes the property while retaining it in `required` and produces:

```text
SCHEMA_REQUIRED_KEY_NOT_IN_PROPERTIES
/properties/records/items/properties/analyses/items/required
key=scoreComponents
```

## Implemented

- Canonical `ScoreComponent[]` wire and storage contract.
- Deterministic canonical JSON, UTF-8 bytes, SHA-256, and recursive freeze.
- Recursive Strict Structured Outputs preflight with precise findings and current documented limits.
- Provider-boundary hash verification and response-side schema validation.
- Separate dispatch/thread/turn attempt, accepted, and completed counters.
- Precise schema, response, identity, Catalog, artifact, and SQLite failure semantics.
- Schema evidence in staging, failed staging, and Debug Folder output.
- Stable renderer debug callback plus normalized root-cause error dedup identity.
- Golden HTML schema hash and canonical score-component rendering.

## Safety and compatibility

The one-payload, one-thread, one-turn contract remains unchanged. Capacity warning behavior remains warn-only. There is no automatic retry, repair turn, fallback, batch split, JSON-mode downgrade, Jira write, or formal partial persistence.
