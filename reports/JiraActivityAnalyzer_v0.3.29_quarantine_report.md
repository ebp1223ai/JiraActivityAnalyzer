# v0.3.29 Quarantine Report

Historical formal runs are revalidated deterministically in memory. Matching runs are marked `QUARANTINED_SYSTEMIC_NO_RESULT` and excluded from the formal Active Result and successful-result views without deleting or rewriting Raw Decisions, Canonical JSON, HTML, SQLite rows, or the on-disk result registry.

The two real replay runs (17 + 117 = 134 records) match the new blockers. Persistent database-scoped quarantine migration was intentionally not performed because it would mutate existing user state; the mechanism is reversible and read-only in this delivery.
