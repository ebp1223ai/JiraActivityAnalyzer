# Jira Activity Analyzer v0.3.42 Component Reuse Report

## Scope

This report records the production component reuse boundary before v0.3.42 implementation. The approved static UI is an information-architecture reference only. Its demo data and JavaScript are not production inputs.

## Reuse Decisions

| Capability | Existing production component | v0.3.42 decision |
| --- | --- | --- |
| Server-side paging, sorting, header filters, row expansion | `SqliteDataTable` | Reuse and extend with grouped/searchable dynamic-column controls and validated date ranges. |
| Activity rows and readable before/after diff | `ActivityComparisonTable` | Reuse for AI Results and Integrated Results. Do not create a second diff renderer. |
| Viewer query state | `AiViewerStateContext` | Reuse and extend the per-route state contract so AI and Integrated routes retain independent successful results and controls. |
| Database toolbar/details | `DatabaseOverviewToolbar`, `DatabaseOverviewDetails` | Keep as the shared public surface, but expand it to own the actual toolbar actions, status presentation and overflow behavior. |
| App shell, sidebar, debug panel | Existing application layout | Reuse unchanged except for v0.3.42 route labels/status wiring required by the approved UI. |
| IPC and preload boundary | Existing `window.jiraActivity` bridge | Extend through validated v0.3.42 channels. Do not weaken context isolation or expose raw Node/Electron APIs. |
| AI package validator/database/query stack | v0.3.41 AI Database modules | Evolve in place to v0.3.42 behavior, retaining the frozen schema v2.0.0 and source-trace v1.0.0 contracts. |

## Deliberate Non-Reuse

- The approved static HTML's sample records, company-like labels and JavaScript are not copied.
- The archived AI provider workflow is not reused for AI Database import or viewing.
- Hash values are not reused as source-link identities or display gates.
- The fixed v0.3.41 column list is not reused as the authoritative field catalog.
- Runtime filesystem DDL loading is not reused; the verified DDL is embedded at build time.

## Acceptance Boundary

The implementation must preserve the User Viewer interaction model while deriving AI and Integrated columns from runtime metadata. Tables may scroll inside their own container, but the application shell must not gain horizontal overflow. Automated app-only capture is evidence; the final human GUI checklist remains a separate release gate.
