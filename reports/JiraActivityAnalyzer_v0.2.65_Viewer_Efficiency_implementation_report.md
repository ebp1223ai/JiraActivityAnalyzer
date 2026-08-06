# Jira Activity Analyzer v0.2.65 Implementation Report

## Release status

- Target: `0.2.65` - Viewer Efficiency, Multi-User Comparison & Diff Quick Filters
- Branch: `feat/v0.2.65-viewer-efficiency`
- Baseline: v0.2.63 final verified commit `5e1e6a470143d450762712febfe73db8d5804e3d`
- Source commit: `f5f4fea1312061810652c69daccecc3719c0ca3c`
- v0.2.64: abandoned / not released; dedicated commit `29d89eed` is not an ancestor
- SQLite schema: v3, unchanged
- Production implementation: Completed
- Overall status: Partial pending real SQLite and full Windows GUI verification

## Root-cause inventory

The v0.2.63 viewers already used typed IPC, SQLite-side column filters/count/sort/page, scope-aware cache keys, and stale request sequence guards. Diff rendering used the canonical Description engine, but there was no shared quick-filter contract and `Description Changed Only` still used a raw before/after inequality in SQL. User Viewer supported one stable user or All Users; related issues were grouped by source object identity, while distributions reused the same grouped issue scope. Table preferences persisted layout/filter state per viewer, but did not contain Diff toggles or User selection scope. Comments have no validated Before/After evidence and therefore cannot safely expose Diff controls.

## Production implementation

### Canonical Diff quick filters

- Added one shared classifier and `DiffQuickFilters` contract with defaults ON/OFF/OFF.
- Added bilingual controls to Issue Changelog, Issue Activity Events, and User All Activity Events.
- Registered deterministic read-only SQLite functions for canonical status, validation, added count, and deleted count.
- Applied all active conditions to the same SQL used by filtered count, page count, row selection, sorting, cache identity, and stale identity.
- Diagnostic, unavailable, source-mismatch, unparseable, and non-comparison rows retain null/unavailable semantics and are not silently treated as zero.
- `Description Changed Only` now uses canonical `changed` / optional `before-unavailable` status.
- Comments remain outside Diff controls and receive no synthetic comparison.

### Multi-user User Viewer

- Replaced single-user cards with Selected Users / All Users modes, stable-ID checkboxes, bounded chips, selected count, per-item removal, and Clear Selected.
- Search is IME-safe; selection survives search changes and switching to All Users.
- Selected scope uses parameter-bound, bounded chunks without silent truncation. All Users uses `1=1` and never materializes a giant ID list.
- Cache identity sorts the selected stable set while UI selection order remains unchanged.
- Union rows are selected directly from stable activity events. Related issue totals and four distributions use distinct source object identity.
- Added one SQLite grouped query for per-user event count, distinct related issues, first event, and last event. All Users intentionally returns no unbounded comparison list.

### Preferences and boundaries

- Added per-viewer Diff filter persistence and User scope/selected stable IDs.
- Legacy v0.2.63 preferences receive safe defaults; duplicate/invalid IDs are normalized and restored IDs are validated against the current database.
- Reset Widths and Reset Table Layout retain filters, Diff toggles, User scope, and selection.
- Clear All Filters clears column filters and all three Diff toggles, but keeps User scope and table layout.
- Database changes invalidate loaded results and revalidate saved user IDs.

## Query and security decisions

- Renderer receives typed rows only, never arbitrary SQL or a database path.
- User IDs and filter values use SQLite parameter binding; there is no per-user or per-row N+1 query.
- No Jira request, Candidate Discovery, Full Fetch, save/import/export, Source Archive, schema, or dependency behavior was changed.
- Source SHA and complete normalized query/scope participate in packaged metadata and event cache identity.
- Sensitive scan found no token, credential, private key, real `.env`, database, or raw Jira payload in the v0.2.65 commit/package.

## Verification summary

- Typecheck, v0.2.65 synthetic production-query tests, v0.2.58-v0.2.63 regressions, and maintained integration passed.
- Clean detached build and dist passed from Source commit `f5f4fea`.
- Package size audit and corrected ASAR content audit passed with `unexpectedCount = 0`.
- Full repository UI smoke was intentionally not run because the existing harness is a long multi-route/workflow suite, not the required short packaged smoke.
- Real SQLite and full Windows GUI validation remain pending user verification.

## Observations

- Vite reports the inherited >500 kB renderer chunk warning and `node:crypto` browser externalization warning; neither blocked build.
- `npm ci` reports inherited deprecated package notices and pending allow-scripts notices. No dependency upgrade was authorized.
- The existing package audit JSON contains historically garbled explanatory Chinese strings, but its numeric/content checks complete successfully. This was not changed in v0.2.65.
