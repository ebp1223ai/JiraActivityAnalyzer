# Jira Activity Analyzer v0.2.47 Requirement Matrix

| Requirement | Current Code Location | Root Cause / Current Behavior | Planned Change | Verification |
|---|---|---|---|---|
| Step 3 navigation-safe run | `electron/main.ts`, `src/routes/AnalysisPage.tsx`, preload IPC | Main owns staging, but renderer subscriptions and local state can lose the active snapshot after route unmount | Add active-run/status IPC, run-scoped subscription, idempotent listener cleanup, and remount hydration | Deterministic background-run lifecycle test |
| Database Key filter stability | `src/components/DatabaseIssueTable.tsx`, `src/routes/DashboardPage.tsx` | Every keystroke immediately replaces query/loading state and table shell | Keep controls mounted, debounce query commit, preserve input/focus/composition and table scroll | Source assertions plus component-focused state test |
| Remove Issue Activity Stream | `src/routes/IssueViewerPage.tsx`, session/preferences/IPC | v0.2.46 added a provenance-only tab beside broader events | Remove tab and renderer query path; keep Activity Events as authoritative local event list | Route/source regression |
| Issue Activity Events | `electron/databaseViewer.ts`, `IssueViewerPage.tsx` | Existing payload section is bounded but not shared with server-side table UX | Query SQLite by Issue Key with shared event projection, page/filter/sort/count | Synthetic SQLite test |
| Changelog table UX | `IssueViewerPage.tsx`, payload DTO | Changelog is rendered from one decoded payload array with no table query state | Add bounded local table UX and readable before/after/add/remove cells; document payload limitation | Unit/source tests |
| Comments filtering/readability | `IssueViewerPage.tsx`, `JiraContent.tsx` | Comments render all cards without author/date/text controls | Add local bounded filters over already-loaded SQLite payload, stable author identity display, 50/page | Unit/source tests |
| Other Issue list views | `IssueViewerPage.tsx` | Attachments/links use basic table rendering | Retain safe list rendering and document fields unavailable in schema/payload | Regression |
| Remove User Activity Stream | `UserViewerPage.tsx`, session/preferences/IPC | v0.2.46 exposes provenance-only and all-events tabs | Remove Activity Stream tab/query/preference and keep Related Issues + All Activity Events | Source/type tests |
| User All Activity Events detail | `databaseViewer.ts`, `UserViewerPage.tsx` | Projection lacks shared readable event semantics | Use shared event formatter for Type/Actor/Field/Before/After/Source | Synthetic SQLite test |
| User distributions | `databaseViewer.ts`, `UserViewerPage.tsx` | Summary has event/project counts but not full Related-Issue Project/Type/Status/Priority distributions | Add full-dataset read-only aggregate query and clickable filters | Synthetic SQLite test |

## Frozen Boundaries

- Current-State SQLite schema remains version 2.
- No migration, recreation, conversion, merge, incremental sync, or business-data write.
- Viewers remain local SQLite only and never call Jira.
- No attachment body download.
- UI preferences remain under `APP_ROOT/app-data/settings/ui-preferences.json`.
- No long-running smoke loop.
