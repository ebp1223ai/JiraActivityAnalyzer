# Jira Activity Analyzer v0.2.67 Implementation Report

## Status

- Production implementation: Completed
- Automated and synthetic validation: Passed
- Build, dist, and ASAR audit: Passed
- Packaged startup smoke: Passed from app-only persistent diagnostics
- Real company SQLite and full Windows GUI validation: Not Run
- Overall status: Partial

## Root Cause

`attachDescriptionDiffRows()` interpreted the persisted string `"null"` as an unavailable original Description, while the SQLite UDF filter only tested SQL `NULL`. Display and filtering therefore disagreed. The old filter also treated generic non-Description missing values as `before-unavailable`.

The v0.2.66 coordinator also applied a fixed 20,000 ms wall-clock timeout to an exact COUNT plus synchronous diff classification. Large candidate sets could be correct and responsive in the worker yet still be terminated solely because total duration exceeded 20 seconds.

## Implementation

- `shared/viewerEfficiency.ts` now owns classifier version `v2`, persisted-value normalization, typed Description classification, and all quick-filter predicates.
- Display, synchronous SQLite UDF filtering, progressive filtering, exact count, and page rows use the same classifier semantics.
- Hide Before unavailable is Description-only. Comments and other field changes are not hidden merely because Before is absent or text contains the display label.
- Expensive Viewer queries use keyset batches of 100 candidates, reducing to 50 when a batch exceeds the 250 ms target.
- Worker progress carries scanned, total, matched, percentage, elapsed time, batch size, and a cursor. Renderer progress DTOs remain below 2 KiB.
- Cancellation and supersession have distinct typed codes. Each lane remains bounded to one active and one latest pending request.
- The fixed total timeout was replaced by a 30-second no-progress watchdog. One recovery attempt resumes from the latest safe cursor and compact match state with a 50-row batch; a second stall returns retryable `VIEWER_WORKER_STALLED`.
- Completed results use the existing bounded 32-entry / 8 MiB cache. The classifier version is included in cache identity; partial results are not cached.
- SQLite remains read-only and schema version remains v3.

## Traceability

| Requirement | Production path | v0.2.67 verification | Status |
|---|---|---|---|
| Canonical Diff classifier | `shared/viewerEfficiency.ts`, `electron/databaseViewer.ts` | stored `"null"` parity and three Viewer result checks | Passed |
| Hide Before unavailable, three viewers | Issue Changelog, Issue Events, User Events progressive wrappers | 8,520-row target scope | Passed |
| Count, rows, and page identity | progressive final sort and page fetch | exact count/page assertions | Passed |
| Progress and keyset batches | database worker and IPC | 87 updates, 50–100 batch assertion | Passed |
| Cancel and latest request wins | coordinator and renderer request identity | cancel plus 30 rapid requests | Passed |
| Watchdog and checkpoint recovery | coordinator internal checkpoint channel | retryable stall regression and resume parity | Passed |
| Bounded queue/cache/IPC | coordinator/cache/DTO | 1 active + 1 pending, cache and DTO limits | Passed |
| Preferences/Clear Filters | inherited preference normalization | v0.2.65/v0.2.66 regressions | Passed |
| Packaged worker | `dist-electron/database-viewer-worker.cjs` in ASAR | clean dist and ASAR audit | Passed |

## Synthetic Fixture

- Schema v3 events: 20,000
- Target issue/user scope: 8,520 events
- Description field changes: 6,338
- Before unavailable: 1,268
- No Change: 1,268
- Progressive completion: 2.89–3.12 seconds in observed runs
- First progress: 75–108 ms
- Maximum public progress DTO: 192 bytes
- Maximum page DTO: 163,524 bytes
- Read-only query-only mode, rejected CREATE/DELETE, and schema/logical digest invariants: Passed
- Observed RSS rose from about 84 MiB to 593 MiB in the direct synthetic process; heap remained about 47 MiB. This is recorded as a manual large-session observation item, not hidden.

## Build Identity

- Source SHA: `cccad2fd268b076096fcc6124c81a754a4ddbea4`
- Version: `0.2.67`
- Build time: `2026/08/06 18:01:49` (Asia/Taipei)
- Packaged source SHA: `cccad2fd268b076096fcc6124c81a754a4ddbea4`

No Jira write, schema migration, import/save behavior, dependency version, or production collection path was changed.
