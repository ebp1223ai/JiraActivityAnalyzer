# Jira Activity Analyzer v0.2.49 Implementation Report

## Result

**Partial**

The reproduced `null.value`, Activity Event filter-contract, persistent diagnostics writer, contradictory Debug Folder status, and Activity Event Diff paths are implemented and covered by focused automated tests. Operational SQLite Viewer tables now share declarative query-field mapping, required-column enforcement, IME-safe text filtering, column resizing, viewport-aware candidate filters, and preference normalization.

The version is not marked Completed because the supplied acceptance criteria also require two XML fixtures, a real large SQLite database, repeated Windows GUI validation, complete conversion of payload-backed and workflow tables, and a zero-error manual gate. Those inputs and manual runs were not available in this pass.

## Root Causes

1. Database Issue text handlers referenced `event.currentTarget.value` inside a React functional state updater. By the time the updater executed, `currentTarget` could be null.
2. Activity Event UI columns used presentation IDs such as `displayName`, while backend query allowlists did not define a stable Actor contract for both Issue and User Viewer.
3. Persistent diagnostics replaced existing JSON files with `renameSync`. Windows can reject rename-over-existing with `EPERM`, `EACCES`, or `EEXIST`, permanently setting `writerFailed`.
4. Debug Folder status could be set to `completed_with_errors` for a Full Fetch result mismatch even when the final copy failure count was zero.
5. Activity Events already stored reliable `from_value_json`, `to_value_json`, field identity, native source ID, source record ID, and provenance. The missing Diff was a query/adapter/UI issue, not a schema capability gap.

## Implemented

- Captures primitive input strings synchronously and handles composition start/update/end before debounce.
- Adds reusable `TextColumnFilter`, `TablePreferenceNormalizer`, `NormalizedChange`, and `DiffCell`.
- Adds declarative `queryField` mapping from UI columns to backend `actor`, `action`, `field`, and `source`.
- Extends the SQLite allowlist and distinct-value contract for Actor, Action, Field, Source, Before, After, and Diff.
- Keeps Current-State schema v2; no migration or data rewrite is introduced.
- Adds scalar, set, and compact text Diff with safe canonical text conversion.
- Makes User Activity Events show Diff by default while Before/After remain optional.
- Enforces required columns and rejects unknown/null/legacy preference values.
- Upgrades the UI-only preference format to v2.
- Adds draggable, clamped column widths and table-specific reset behavior.
- Adds viewport correction for Excel-style candidate filters.
- Adds safe page and table action logging without full sensitive content.
- Adds request diagnostic primitives for request ID, table ID, query summary, duration, result count, and terminal status.
- Adds Windows-safe diagnostic JSON replacement and exposes `writerFailed` in snapshots.
- Makes final Debug Folder status depend on actual copy failures.
- Adds a formal table inventory.

## Requirement Status

| Requirement | Status | Notes |
|---|---|---|
| Chinese IME `null.value` | Complete | No React event object is retained by the Database Issue functional updater. |
| Activity Event Actor/Action/Field/Source contract | Complete | UI mapping, backend allowlist, distinct query, and SQLite contract test. |
| `writerFailed` repair | Complete in automated test | Repeated session-summary updates remain false. |
| Debug Folder `completed_with_errors` with zero failures | Complete in code/test contract | Final status is derived from copy failure count. |
| Shell-first behavior | Retained from v0.2.48 | No startup synchronous DB integrity scan reintroduced. |
| Shared operational SQLite table behavior | Complete for Database Issues and Issue/User SQLite Viewer tables | Declarative definitions and shared table component. |
| All payload/workflow/diagnostic tables migrated | Partial | See `docs/v0.2.49-table-inventory.md`. |
| Required columns | Complete for operational SQLite Viewer tables | Required columns are disabled and restored by normalization. |
| Drag column widths | Complete for shared SQLite Viewer table | Database Issue List still retains its existing width settings UI. |
| Viewer table state across navigation | Existing session query state retained | Full cross-restart sort/filter/page persistence is Partial. |
| Before/After/Diff source correctness | Complete for SQLite Activity Events | Uses persisted old/new values; no adjacent-event inference. |
| Changelog payload relational paging | Partial | Schema v2 stores Changelog in compressed Issue payload. |
| XML fixture validation | Not run | XML files were not supplied with this turn. |
| Real large SQLite/Windows GUI gate | Not run | Automated tests do not substitute for manual acceptance. |
| Error-free manual gate | Not run | No Completed claim or tag. |

## Schema Decision

Current-State schema remains **v2**. `activity_events.from_value_json` and `activity_events.to_value_json` are sufficient for reliable event-level Before/After. `field_id`, `field_name`, `source_record_id`, `jira_native_source_id`, and `source_provenance` provide provenance. No migration is justified for Activity Event Diff.

Payload-backed Changelog and Comments remain a separate known limitation. This version does not create relational tables or migrate existing databases.

## Automated Verification

- `npm.cmd run test:v0.2.49`: PASS
- `npm.cmd run typecheck`: PASS during implementation
- Synthetic SQLite Actor/Action/Field/Source combined filter: PASS
- Chinese Actor candidate search: PASS
- Null/legacy UI preference normalization: PASS
- Required column restoration and width clamp: PASS
- Scalar/set/text Diff and missing-value fallback: PASS
- Persistent diagnostics repeated summary writes: PASS, `writerFailed=false`

## Not Executed

- Supplied XML fixture comparison for COPGEN1-144603 and COPGEN1-138930
- Real Jira or internal network calls
- Real large SQLite GUI acceptance
- Three cold starts
- Repeated manual Chinese IME input
- Full table-by-table manual resize/persistence workflow
- Full UI smoke/capture
- Installer/Portable containment run
- Tag, push, or release
