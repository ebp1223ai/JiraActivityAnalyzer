# v0.3.33 SQLite Warning Gate Report

- Quality PASSED: SQLite may proceed.
- Quality WARNING: Canonical and formal HTML may proceed, but SQLite is `BLOCKED_PENDING_WARNING_ACCEPTANCE`.
- Quality BLOCKED/FAILED: SQLite is prohibited.
- Warning acceptance persists run ID, finding codes/hash, confirmation time, audit ID, before/after hash, and retry transaction identity.
- Acceptance does not modify raw AI submission.
- Same-run SQLite retry is idempotent.

Boundary tests cover ratio `0.50` (no warning from this rule) and ratio `>0.50` (finding plus WARNING). The 17/117 offline real-debug replays both exceed the threshold; their v0.3.33 reevaluation does not permit SQLite. Production SQLite and a real operator acceptance were not executed.
