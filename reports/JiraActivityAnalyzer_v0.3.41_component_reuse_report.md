# JiraActivityAnalyzer v0.3.41 Component Reuse Report

## Gate Status

Phase 0 repository inspection completed before v0.3.41 UI implementation. The implementation must import and render the production components listed below; visually similar copied JSX is not accepted.

## Database Overview Reuse

| Capability | Production path | Existing API / state | v0.3.41 reuse |
|---|---|---|---|
| Raw database overview route | `src/routes/DashboardPage.tsx` | `RuntimeStatusContext`, `databaseViewer.overview()`, `healthCheck()`, `DatabaseIssueTable` | Extract the lifecycle/status, database information, health and recent-state presentation into shared database overview primitives, then render those same primitives from both Raw Database Overview and AI Analysis Database. |
| Page framing | `src/components/PageHeader.tsx`, `src/components/SectionCard.tsx`, `src/components/Responsive.tsx`, `src/components/MetricCard.tsx` | Existing props and responsive styles | Reuse directly for all three AI database routes. |
| Raw database lifecycle store | `src/state/RuntimeStatusContext.tsx` | Raw DB identity, path, request ID, read/write status | Remains authoritative for Raw DB identity and stale-response validation in Integrated Results. |
| AI database lifecycle IPC | `electron/aiAnalysisDatabaseIpcV040.ts`, `electron/aiAnalysisDatabaseLifecycleV040.ts` | `lifecycle`, `create`, `openSwitch`, `healthCheck`, `backup`, `forget`, `openFolder` | Upgrade behind the existing preload namespace; do not create a second renderer bridge. v0.3.41 adds schema-v2 migration/import/link semantics while preserving this lifecycle surface. |

## Viewer Reuse

| Capability | Production path | Props / store / IPC | v0.3.41 reuse |
|---|---|---|---|
| Activity Events table | `src/components/ActivityComparisonTable.tsx` | `mode`, `query`, `result`, preferences, session state, distinct loader | AI Results and Integrated Results render this component directly in `user-events` mode. |
| Shared SQLite table | `src/components/SqliteDataTable.tsx` | `ViewerTableQuery`, `ViewerTableResult`, `TablePreferences`, `ViewerTableSessionState` | Directly supplies header filters, pagination, sorting, column visibility/order/width, progress, row expansion and table scroll restoration. |
| Column header filtering | `src/components/ExcelFilterPopover.tsx`, `src/components/TextColumnFilter.tsx` | Driven by each `SqliteTableColumn.kind` and `loadDistinct()` | Reused through `SqliteDataTable`; no independent top-filter panel is allowed. |
| Column registry | `shared/activityViewerColumns.ts` | `activityViewerRegistryForScope()` | Existing Activity Events columns remain the canonical order and labels. AI metadata columns are appended through a small wrapper registry, not a copied table. |
| Before / After / Diff | `src/components/DiffCell.tsx`, `src/components/DescriptionDiffCell.tsx`, `src/components/DescriptionOriginalPreviewCell.tsx`, `src/components/ReadableContentCell.tsx` | Row plus expanded-state context | Reused through `ActivityComparisonTable`; source-trace `diff` is projected into the existing Activity Events row contract. |
| UI preferences | `electron/uiPreferences.ts`, `src/types/uiPreferences.ts` | `uiPreferences.get/update`, `TablePreferences` | Existing `aiResults` and `integratedResults` sections persist columns, order, width, page size, sort, filters and diff quick filters. |
| Route/query state | `src/App.tsx`, new app-level AI viewer state provider | Route, query, table session, raw/AI identities, latest request ID | State lives above route elements so A -> B -> A navigation retains rows, filters, sort, page, page size and scroll/expanded state. |
| Query IPC | `electron/preload.ts`, `electron/aiAnalysisDatabaseIpcV040.ts`, `electron/aiAnalysisDatabaseQueryV040.ts` | `queryResults`, `queryIntegrated`, `exportQuery` | Preserve bridge names and validation. v0.3.41 query responses include request and database identities so stale results are accepted only for the current route and latest request. |

## Verification Hooks

- `scripts/test-v0341.cjs`: frozen contracts, package-v2 validation, lossless trace, SQLite v1-to-v2 migration, review-rank protection, source-link identity rules, query/state and reuse assertions.
- `scripts/test-v0341-integration.cjs`: golden fixture import/read-back, rerun/no-op, migration rollback and integrated link outcomes.
- Electron app-only smoke: existing `ELECTRON_UI_SMOKE` harness, extended to cover `/ai-database`, `/ai-results` and `/integrated-results` using the production preload bridge.
- Acceptance evidence is reported in `reports/JiraActivityAnalyzer_v0.3.41_acceptance_report.md`.

## Non-Reuse Decisions

- The supplied static UI is acceptance evidence, not renderer source.
- `Skill_Analysis_Review_Workbench_v1.12.0.html` is installed byte-for-byte as an offline external workbench asset and is never embedded in an iframe.
- No alternate table, alternate top-filter panel, alternate preference store or weakened IPC bridge is introduced.
