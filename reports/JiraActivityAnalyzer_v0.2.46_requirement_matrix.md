# JiraActivityAnalyzer v0.2.46 Requirement Matrix

| Requirement | Current Code Location | Current Behavior | Planned Change | Verification |
|---|---|---|---|---|
| Step 1 Date Run Context | `src/routes/AnalysisPage.tsx`, `electron/main.ts`, `electron/userActivityTimeline.ts` | Renderer sends mutable date fields directly; service builds windows later | Create and validate one frozen run context before IPC execution | Deterministic same/cross-month/year/leap-day tests and request spy |
| Shared SQLite Data Table | `electron/databaseViewer.ts`, `src/components/DatabaseIssueTable.tsx` | Database Issues has typed query; other tables use independent client-side logic | Add shared query/result/distinct contracts and reusable table controls | 225+ row fixture, full-result sort/filter/count/distinct tests |
| Timeline | `src/routes/AnalysisPage.tsx` | Filters remain in a large block above the table and rows are session data | Remove large block; use table-header controls and persisted state | Source assertion plus focused component/query tests |
| Database Issues | `electron/databaseViewer.ts`, `src/routes/DashboardPage.tsx` | SQLite pagination works; Action column remains; default page size 50 | Default 200, remove Action, make Issue Key the only navigation link, add Project distribution | Query and renderer source tests |
| User View | `electron/databaseViewer.ts`, `src/routes/UserViewerPage.tsx` | Stable actor summary plus one bounded activity table | Add stable-ID user selector and Related Issues / Activity Stream / All Events queries | Same-display-name and assignee-only exclusion fixtures |
| User Activity Stream | `activity_events.source_provenance` | No stored Activity Stream provenance in current schema | Return identifiable-only records; otherwise explicit unidentifiable status | Provenance helper tests |
| User All Activity Events | `electron/databaseViewer.ts` | User detail loads all stable actor events with bounded offset | Add typed SQLite pagination/sort/filter/count contract | Full-result query tests |
| Issue Activity Stream | `electron/databaseViewer.ts`, `src/routes/IssueViewerPage.tsx` | Viewer loads up to 500 all normalized events | Add identifiable-only Activity Stream section and explicit range/status | Issue fixture and no-Jira-call source test |
| Description / Comments / Changelog | `electron/databaseViewer.ts`, `src/components/JiraContent.tsx` | Safe structural HTML subset and basic wiki lines | Add controlled Jira wiki tokens, attachment placeholders, added/removed changelog values | Renderer normalization tests |
| Jira Connection | `src/routes/ConnectionsPage.tsx`, connection IPC | Editable fields and test-and-save can update `.env` | Read-only summary; Reload / Choose / Test only; no save/update UI | Renderer source and connection-state regression |
| UI Preferences | `electron/uiPreferences.ts` | Database/Timeline sections only | Add independent User/Issue table sections and preserve corrupt fallback | Persistence and containment tests |
| Workflow Session | `src/state/SessionStateContext.tsx`, `src/routes/AnalysisPage.tsx` | Session state persists, but frozen Step 1 context is absent | New Step 1 session/run clears downstream completion and stores immutable context | New-run state tests |
| Debug Folder | `electron/debugFolderCollector.ts`, main export pipeline | Evidence manifest exists without current/historical/stale classification | Add classification metadata without moving existing files | Manifest classification and secret scan tests |
| Build / Package / Ledger | version files, scripts, reports | v0.2.45 | Align 0.2.46, truthful focused checks, package after clean commit | Version check, build, dist, short startup only |

