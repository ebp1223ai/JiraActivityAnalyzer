# v0.3.33 Multi-skill and Quality Report

## Result

PASS for deterministic fixtures and offline real-debug replay.

- Quote identity uses stable source ID, JSON pointer, raw offsets, and quote SHA-256.
- Distinct PRIMARY_CHANGE quotes can independently support multiple skills.
- Shared quote with distinguishable skill prose emits `MULTI_SKILL_SHARED_PRIMARY_QUOTE_REVIEW` WARNING without deleting skills.
- Shared quote with indistinguishable prose emits `MULTI_SKILL_SHARED_QUOTE_UNDISTINGUISHED` BLOCKER.
- Missing PRIMARY_CHANGE evidence emits `MULTI_SKILL_PRIMARY_CHANGE_QUOTE_MISSING` BLOCKER.
- Host validation preserves raw decision bytes and status.
- Source evidence text is excluded from model-prose duplicate populations.
- Exact duplicate ratio above 0.50 emits `MODEL_PROSE_EXACT_DUPLICATE_RATIO_HIGH`; boilerplate is separately reported as `MODEL_PROSE_BOILERPLATE_PATTERN`.

## Real v0.3.32 Replay

- 17 records: ratio `0.8571428571428571`; v0.3.33 emits both duplicate warnings and does not permit SQLite.
- 117 records: ratio `0.8181818181818182`; v0.3.33 emits both duplicate warnings and does not permit SQLite.
- Both replays additionally found `CATALOG_DETAIL_STATUS_MISMATCH`, so final reevaluation state is BLOCKED rather than WARNING-only.
- Provider called: no. Raw submission SHA-256 before/after remained identical.
