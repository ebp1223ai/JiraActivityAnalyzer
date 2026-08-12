## 0.3.12 - 2026-08-12

- Replaced the v0.3.11 unknown/over-capacity hard block with a warn-only confirmation showing one shared, hashed capacity calculation snapshot and complete UTF-8 byte/token/reserve formulas.
- Added exact App Server provider/model capability lookup with sanitized unavailable/error evidence and no fixed 200,000-token fallback.
- Added an Electron-main one-shot dispatch guard, actual request/thread/turn counters, no retry/repair/fallback behavior, and primary-error deduplication with occurrence counts.
- Added permanent APP_ROOT-contained failed-run staging, completed-only JSON/Golden HTML/SQLite gates, precise SQLite non-write reasons, and AI Analysis evidence in the existing Debug Folder.
- Added v0.3.12 capacity, dispatch, failed-staging, persistence-gate, redaction, and integration tests while preserving the single-payload/single-thread/single-turn contract.
## 0.3.11 - 2026-08-12

- Replaced ChatGPT per-record analysis with one deterministic compact payload, one App Server request, one dedicated ephemeral thread, and one turn for all selected Activity Events.
- Added fail-closed model-capacity preflight, strict record identity conservation, exact Catalog Skill lookup, negative evidence, near-skill rejection, and explicit MATCHED/EXCLUDED/UNKNOWN classification.
- Preserved the final visible provider response as a verified gzip staging artifact and added prompt, runtime, capacity, distribution, and artifact metadata to analyzed output.
- Replaced the basic HTML export with a self-contained Golden renderer containing summary metrics, rules snapshot, Skill ranking, Actor/Issue/Group/Status/Review filters, expandable evidence, negative checks, print CSS, and legacy warnings.
- Added v0.3.11 unit and integration coverage while preserving AI Nexus, Offline Rule, legacy v0.3.10 reading, ENV v4, Jira read-only behavior, and completed-only SQLite persistence.
## 0.3.10 - 2026-08-12

- Reconstructed the production AI Analysis route to match the supplied final
  static UI across AI diagnostics, analysis workspace, and Activity Events
  analysis results without introducing prototype data.
- Replaced folder scanning with one canonical Manifest and bound Catalog/Common
  Rules loader, including absolute-path metadata and actionable duplicate Skill
  ID diagnostics. The supplied Catalog validates as 279 records, 279 unique IDs,
  and zero duplicates.
- Added main-owned Pending and completed Analyzed JSON path handling, immutable
  run preflight, live progress hydration, cancellation, sanitized chat traces,
  token aggregation, automatic analyzed JSON creation, and review/report UI.
- Strengthened completed-only atomic JSON and separate SQLite persistence while
  preserving ChatGPT App Server, AI Nexus, Offline Rule, ENV v4, and Jira
  read-only boundaries.
- Added v0.3.10 contract/integration coverage and renderer-only screenshot audit.

## 0.3.9 - 2026-08-12

- Replaced the direct OpenAI Platform API provider with ChatGPT subscription
  access through bundled Codex App Server 0.147.0.
- Added managed browser login, account/model/quota status, streamed test chat,
  cancellable ephemeral analysis turns, token usage, and crash-safe outcome
  handling behind narrow Electron IPC.
- Enforced keyring-only ChatGPT credential storage, ChatGPT-only runtime auth,
  HTTPS auth URL validation, aggressive diagnostics redaction, read-only
  sandboxing, and automatic rejection of command/file/tool requests.
- Preserved AI Nexus and deterministic Offline Rule Analyzer behavior and the
  completed-only AI Analysis database/export contract.
- Migrated the configuration template to ENV v4 and removed direct OpenAI API
  keys from active UI, env, IPC, network, and test paths.
- Added deterministic fake App Server unit and integration coverage plus Windows
  runtime packaging metadata and third-party notice.

## 0.3.8 - 2026-08-11

- Replaced the v0.3.7 AI Analysis static fixtures with main-process provider diagnostics, validated pending-analysis input, frozen rules snapshots, deterministic offline analysis, queue progress/cancellation, human review, separate SQLite history, and atomic JSON/CSV/HTML exports.
- Added ENV format v3 and lowercase tracked `.env.version`; runtime `.env` remains local and is not auto-created.
- Added synthetic core and integration tests for the AI Analysis trust boundary.

## 0.3.7 - AI Analysis Final Static UI

- Added a three-tab AI Analysis workspace for independent cloud/local settings, seven-step mock diagnostics, sanitized manual chat, and shared analysis-basis status.
- Added Pending and Analyzed JSON front-end pickers, cross-tab readiness state, frozen mock run snapshots, visible progress, and deterministic analyzed-file naming.
- Merged per-Diff results and Skill Analysis Report into one result page driven by one selected analyzed dataset.
- Added 279-entry Skill Catalog lookup, accessible skill tooltips, filtered CSV, valid mock JSON, and self-contained interactive HTML downloads.
- Kept all AI/Jira/SQLite/backend/IPC behavior mocked; no external request, credential persistence, database write, packaging, or release work was added.

## 0.3.4 - Description-only Diff Quick Filters

- 將四個 Diff Quick Filters 嚴格限定於 canonical Description 比較，Comment 與所有非 Description 記錄固定 bypass。
- 統一 field identity 優先順序：存在 fieldId 時只接受 normalized `description`，缺少 fieldId 才使用 fieldName fallback。
- 統一同步 SQL count/rows、progressive pagination、Issue/User Viewer 與 frozen Pending Analysis export 的篩選語意。
- 保留既有 Quick Filter preferences 與 Query Snapshot，並將 UI 標籤改為 Description 專用說明。
- Compact export schema 維持 `0.3.3-draft.1`；SQLite schema v3、ENV format、Jira read-only 與資料庫寫入路徑均未變更。

## 0.3.3 - Compact Diff Export Correctness

- Added deterministic non-Description diff hunks for scalar, collection, ordered-array, attachment/link and custom JSON changes.
- Enforced changed-record hunk/count invariants with typed `DIFF_CONTENT_MISSING` fail-closed diagnostics.
- Added deterministic diff coverage counts and upgraded the review-draft schema to `0.3.3-draft.1`.
- Unified SQL, progressive Viewer and frozen export Quick Filter semantics and added ordered-ID consistency guards.
- Preserved compact-reference boundaries, SQLite schema v3, ENV format and read-only source evidence.

## 0.3.2 - Compact Diff Export

- Replaced duplicated full Before/After Pending Analysis payloads with an allowlisted compact reference DTO containing canonical Diff hunks, stable SQLite source identity, provenance, availability, and original content SHA-256 values.
- Added recursive forbidden-key validation so full-content aliases cannot enter records, nested objects, compatibility data, diagnostics, or integrity metadata.
- Changed the review-draft export contract to `0.3.2-draft.1` and added explicit non-self-contained `compact-reference` metadata.
- Recomputed per-record and record-array SHA-256 over the compact canonical representation while preserving full filtered-set, multi-batch, progress, cancellation, source-generation, and atomic cleanup behavior.
- Kept Current-State SQLite schema v3, Jira read-only behavior, dependencies, and database write paths unchanged.

## 0.3.1 - Pending Analysis Export Correctness

- Replaced the property/value-only local-path rejection with a central provenance-aware integrity policy that permits path-like Jira evidence unchanged while failing generated runtime paths, unknown provenance, and credential material with typed reason and JSON path only.
- Added sanitized, throttled pending-analysis started/completed/failed/cancelled lifecycle diagnostics through the existing persistent logger and Debug Folder session collector.
- Prevented duplicate renderer starts, retained the main/coordinator already-running guard, ignored stale run events, and made active Viewer panels expose only Cancel.
- Corrected progress to use a frozen total and bounded monotonic processed/serialized/written counts: `0 / N` is 0%, finalization is a stage, and only successful completion is 100%.
- Added focused synthetic production-path coverage while preserving Current-State schema v3, ENV format, dependencies, read-only behavior, 100-row-equivalent batching, atomic rename, and contract `0.3.0-draft.1 / review-draft`.
- Automated status remains Partial pending a successful real SQLite export and Windows GUI user revalidation.

## 0.3.0 - Pending Analysis Data Export & Real-data Contract Review

- Added production pending-analysis JSON export to Issue Viewer / Activity Events and User Viewer / All Activity Events only.
- Exports the complete frozen filtered set across all pages through a main-owned worker with bounded batches, progress, cancellation, generation guards, collision-safe filenames, and atomic finalization under APP_ROOT.
- Added the review-draft `jira-activity-analyzer.pending-analysis` contract `0.3.0-draft.1` with stable evidence identity, exact SQLite Before/After, canonical Diff data, current-snapshot context, records digest, and external whole-file SHA-256.
- Added synthetic Current-State schema-v3 production-path coverage for cross-page and cross-view parity, UTF-8 content, deterministic hashes, cancellation, count mismatch, source-generation changes, and partial-file cleanup.
- Kept Jira read-only, Current-State SQLite schema v3, ENV format, dependencies, Full Fetch, and all database write paths unchanged.
- Contract status remains Review Draft; real SQLite content review and Windows GUI validation are pending user acceptance.

## 0.2.67 - Progressive Diff Filtering & Before-Unavailable Correctness

- Unified Description Diff display, filter, count, and page-row classification behind one typed canonical classifier, including legacy stored `"null"` values.
- Corrected Hide Before unavailable so it applies only to Description comparisons and behaves consistently in Issue Changelog, Issue Activity Events, and User All Activity Events.
- Replaced the fixed 20-second Viewer query cutoff with progressive keyset scanning, bounded adaptive batches, compact progress events, cancellation, and latest-request-wins coordination.
- Added a 30-second no-progress watchdog with one reduced-batch recovery attempt and typed retryable failure reporting.
- Added realistic schema-v3 synthetic coverage for 20,000 events, classifier parity, read-only invariants, bounded queue/cache/IPC behavior, cancellation, database switching, and runs longer than 20 seconds.
- Kept SQLite schema v3, Jira read-only behavior, dependencies, and all data collection/save paths unchanged.

## 0.2.66 - Viewer Filter Correctness & Large Dataset Stability

- Added `hideBeforeUnavailable` diff quick filter support for Issue Changelog, Issue Activity Events, and User Activity Events, with quick-filter clear/reset defaults preserved by preference migration and session identity.
- Enforced server-side filter/pagination/count query flow for visible rows and distribution queries, including `before-unavailable` filtering, to keep large SQLite tables stable on large datasets.
- Added dedicated v0.2.66 viewer efficiency regression test and runner (`test:v0.2.66`) for diff filter defaults, multi-user union, scope behavior, and filtering UI coverage.
- Kept SQLite schema v3 and viewer read-only behavior unchanged; no Jira write paths or dependency upgrades were introduced.
- Moved synchronous Viewer SQLite work off the Electron main thread into dedicated read-only workers with per-lane one-active/one-latest-pending coordination, timeout/crash recovery, and database-switch invalidation.
- Added a 32-entry/8 MiB LRU page cache budget and a 20,000-event synthetic worker stability suite covering bounded IPC, heartbeat, stale requests, read-only enforcement, recovery, and schema/logical digest invariants.
## 0.2.65 - Viewer Efficiency, Multi-User Comparison & Diff Quick Filters

- Built directly from the verified v0.2.63 final baseline. v0.2.64 was abandoned and not released; its Updated-Date discovery feature is not part of this branch ancestry or production path.
- Added canonical SQLite-side Hide No Change, Hide + = 0, and Hide − = 0 quick filters for Issue Changelog, Issue Activity Events, and User All Activity Events, keeping diagnostics and non-comparison rows visible.
- Added stable-ID multi-user selection with Selected Users union and All Users scopes, distinct related-issue totals, and bounded per-user comparison summaries.
- Persisted per-viewer Diff filters plus User scope and selected stable IDs, with database-aware restoration and unchanged table-layout reset boundaries.
- Preserved Comments without synthetic Diff, read-only local Viewer behavior, stale-response guards, compact DTOs, current snapshot metadata semantics, and SQLite schema v3.
- Did not change Jira access, Candidate Discovery, Full Fetch, save/import/export, Source Archive, or database schema behavior.

## 0.2.63 - Analyzer Evidence UI, Viewer Column Control & Issue Metadata

- Added one canonical column registry for Issue Changelog, Issue Activity Events, and User All Activity Events, with Time and Action required in the first two positions and optional visibility/order/width controls.
- Corrected the Changelog Before/After visibility persistence bug by migrating legacy column IDs and normalizing each viewer preference scope independently.
- Added typed Event Type, Project, Issue Type, current Status, and current Priority fields from existing Current-State SQLite joins, including query-layer filtering, sorting, pagination, and distinct values.
- Preserved dedicated Changelog and Activity Events queries, source/database/generation stale guards, compact DTOs, All Users behavior, schema v3, and read-only Jira behavior.
- Added focused synthetic v0.2.63 production-query and preference migration coverage.
## 0.2.62 - Issue Viewer Changelog Alignment & All Users Scope

- Moved Issue Viewer Changelog to the same server-side Current-State SQLite event query and shared Before / After / Diff production presentation used by Activity Events, preserving event, history/item, source, database, generation, and integrity identities.
- Removed Worklogs, Attachments Metadata, and Remote Links from Issue Viewer presentation only, with legacy active-tab values normalized safely to Overview; schema v3 and collection/save contracts remain unchanged.
- Added a typed All Users scope to User Viewer without a synthetic account ID, with SQLite-side rows, counts, pagination, filters, sorting, distinct values, related-issue distributions, and stable actor identity.
- Added scope/database-aware cache keys and stale-response suppression for individual-user and All Users transitions.
- Added focused synthetic v0.2.62 coverage and retained v0.2.58 through v0.2.61 viewer/date/identity/diff regressions.
- Kept Jira access read-only, Current-State SQLite schema v3, dependencies, Full Fetch, Source Archive, and export contracts unchanged.
## 0.2.61 - Viewer Diff Presentation Consistency & Table UX Simplification

- Unified Issue Changelog, Issue Activity Events, and User Activity Events on the same Before Original Preview / After Original Preview / Diff presentation and shared row expansion state.
- Replaced the one-way full-original action with an in-place View Full Original / Hide Full Original toggle and retained validated exact evidence, source identity, integrity, and stale-response guards.
- Removed synchronized scrolling and row-collapse controls from the full comparison so Before, After, and Diff panes scroll independently.
- Removed visible Filter Preset controls from current viewer surfaces while preserving legacy preference data and compatibility.
- Renamed table reset controls and limited Reset Table Layout to visible columns, column order, and widths without clearing filters, search/date scope, pagination, or sort state.
- Kept Current-State SQLite schema v3, compact DTO contracts, Jira read-only behavior, dependencies, and inherited limitations unchanged.
## 0.2.60 - Original Before/After Evidence Visibility & Manual Verification UX

- Restored bounded Before/After Original previews in Issue Changelog, Issue Activity Events, and User Activity Events while keeping full raw values out of compact list DTOs.
- Added event-identity-bound preview batching and full comparison IPC with database/generation stale-response guards, exact raw metadata, UTF-8 SHA-256 integrity checks, and fail-closed source handling.
- Added a responsive three-column Before Original / After Original / Diff Hunks verifier with wrap, whitespace visualization, exact-copy, synchronized scrolling, and explicit empty/unavailable states.
- Added synthetic schema-v3 coverage for CRLF, tabs, emoji, HTML literals, 200-line values, empty/unavailable sources, same-time Comment isolation, request limits, stale identity, and hash mismatch.
- Kept Current-State SQLite schema v3, ENV format, dependencies, Jira read-only access, and the inherited v0.2.57 Debug Folder limitation unchanged. Database Activity Events is N/A because no such product route exists in this baseline.

## 0.2.59 - Description Diff Source Identity & Hunk Rendering Correctness

- Corrected Description event identity so changelog and activity views use the exact local activity event and changelog history/item source instead of treating every Jira-native source ID as a Comment ID.
- Added fail-closed source/provenance validation with explicit unavailable, mismatch, unparseable, and resource-guard states; unrelated Comment or snapshot content is never used as Description evidence.
- Added deterministic Myers line diff hunks with two context lines, grapheme-safe inline emphasis, compact list DTOs, and explicit local-only full-context loading with stale-response protection.
- Unified Issue Changelog, Issue Activity Events, and User Activity Events on the same Description diff result and renderer; Description Changed Only now uses the same validated classifier.
- Added synthetic v0.2.59 identity, same-timestamp Comment/Description, HTML/ADF, long-content, multi-hunk, empty/unavailable, and privacy regression coverage.
- Kept SQLite schema v3, ENV format, dependencies, Jira read-only access, and the inherited v0.2.57 Debug Folder limitation unchanged.

## 0.2.58 - Date Range, Excel Filtering & Content Diff UX

- Added shared local-calendar date shortcuts and custom start-inclusive/end-exclusive query bounds without changing SQLite schema v3.
- Made Database Overview counts/distributions, User related issues/distributions, event tables, and Excel candidate values follow one scoped query contract with stale request suppression.
- Added cross-page Select/Deselect All Filtered Results, safe Description content classification, Comment Created/Last Updated semantics, and explicit unavailable/fallback states.
- Added isolated, atomically persisted filter presets plus focused synthetic v0.2.58 regression coverage; Jira remains read-only and no dependency was upgraded.
## 0.2.57 - Full Fetch Identity Lifecycle & Idempotent Save Repair

- Moved Full Fetch attempt creation behind eligibility and queue gates so preflight, navigation, hydration, and mount operations remain non-executable.
- Added a stable completed-result identity separate from the latest active attempt and preserved it across route changes and non-eligible terminal attempts.
- Made Save Full Fetch Result idempotent: repeated requests return `ALREADY_SAVED` with original evidence and start no duplicate JSON export or SQLite transaction.
- Required successful SQLite commit, readback verification, and foreign-key verification before transitioning an attempt to `saved`.
- Bound Debug Folder database evidence to the exact registered Full Fetch result and retained fail-closed stale/mismatch/partial/failed/cancelled behavior.
- Added 56 synthetic focused checks plus v0.2.56, v0.2.41, v0.2.53, and v0.2.55 regressions; kept SQLite schema v3, Event Identity Policy v3, dependencies, and Jira read-only behavior unchanged.
## 0.2.56 - Full Fetch Result Stale Fix

- Added one main-process Full Fetch registry for preflight attempts, run/staging identity, terminal reconciliation, result availability, and save eligibility.
- Published Completed, Partial, Failed, and Cancelled terminal state only after persisted staging and reconciliation are available.
- Bound Save Full Fetch Result and Debug Folder to exact attempt, Timeline Run, Full Fetch Run, and staging identities instead of mutable global latest staging.
- Reserved FULL_FETCH_RESULT_STALE for genuinely missing matching staging; Partial, Failed, Cancelled, identity mismatch, and incomplete reconciliation remain fail-closed.
- Added focused synthetic registry/staging tests and retained Current-State v3 rollback, dedupe, v0.2.53, and v0.2.55 regressions.
- Kept SQLite schema v3, Event Identity Policy v3, Jira read-only access, and dependencies unchanged.
## 0.2.55 - Full Fetch Workflow Correctness & Unified Diff Viewer UX

- Bound Full Fetch eligibility, preflight, attempt identity, staging and Debug Folder evidence to the selected canonical standard Timeline Run; Advanced Stability Probe is diagnostic-only.
- Preserved blocked Fetch Queues and reported PRE_FLIGHT_BLOCKED with zero attempts and NOT_RUN reconciliation instead of a false failed run.
- Added shared full-width Activity Event detail rows for Issue/User Viewer and dedicated CREATE/UPDATE/COMMENT rendering without previous Comment revision inference.
- Hydrated renderer connection UI from one Electron-main authoritative Jira state with startup/manual subscription updates.
- Kept Current-State SQLite schema v3 and Event Identity Policy v3; no Comment history, Development Mode work, Jira writes or dependency upgrades were added.

## 0.2.54 - Development Manual Verification Candidate

- Promoted the v0.2.53 Worklog, content display, Diff Viewer, schema-v3 migration, event-identity-v3, deduplication, and Complete/Partial save-gate baseline for Electron Development Mode manual verification.
- Added a focused version and Development Mode contract test plus an unchecked manual verification checklist.
- Updated application and build metadata sources to 0.2.54 without changing product behavior or dependencies.
- Did not run Windows packaging and did not produce 0.2.54 Installer or Portable artifacts.

## 0.2.53 - Single Full Fetch Completeness & Content/Diff Viewer

- Added independent read-only Jira worklog pagination, count conservation, parse diagnostics, required-source staging, progress, summary, and file-backed evidence.
- Added `ContentDisplayResult` decisions for true Diff, neutral latest content, empty, parse-failed, and not-applicable states with exact Comment/Worklog ID correlation.
- Added Current-State schema v3, transactional v2-to-v3 migration, source-aware Worklog uniqueness/indexes, and Activity Event content provenance columns.
- Added Issue Viewer Worklogs, expandable inline/side-by-side content viewer, Debug Folder JSON/CSV evidence, focused regression tests, and manual verification checklist.
- Kept Jira operations read-only and did not add comment/description snapshots, cross-run Diff caches, Remote Links, attachment downloads, AI Diff, or DB Merge.
# Changelog
## 0.2.52 - Data Trustworthiness, Runtime Consistency and Stability Gate

- Added explicit rich-content availability, diff status and diff basis semantics; missing Comment Before now shows full After, while Description never guesses unavailable history.
- Made Electron main the Jira connection state owner with a credential-safe settings fingerprint and `SETTINGS_CHANGED` invalidation.
- Added five Activity Stream stability outcomes and enforced Full Fetch/formal SQLite write gates at main/service boundaries.
- Added run-chain reconciliation, startup milestones, query phase timing, bounded recent-result cache and slow-query diagnostics without changing Current-State schema v2.
- Reduced Data Collection to three editable fields and moved fixed settings into a collapsed read-only summary.
- Added Build Host/OS and packaged artifact SHA-256 metadata. Acceptance remains Partial pending real Jira, Windows GUI, cold-start and packaged launch gates.
## 0.2.51 - GUI Interaction Correctness, Rich Content Diff and Viewer State Persistence

- Replaced overlay table filters with layout-participating filter rows across Database and shared SQLite tables.
- Added one-commit Windows IME composition state with stale external-value protection for shared text filters.
- Unified bounded Comment/Description rich-content canonicalization and prevented `[object Object]` display.
- Compared canonical visible text for created, edited, deleted and no-op Diff, including compact rich-text edits.
- Preserved Issue/User Viewer subject, tab, query/result cache, expanded stable row IDs and scroll state across sidebar navigation.
- Kept Current-State schema v2 unchanged; Windows human IME, real-data and complete packaged GUI gates remain Not Run.
## 0.2.50 - Verification, Completeness and Windows Delivery

- Added production-path verification for IME, preference persistence, bounded rich-content canonicalization, normalized Diff, temporary SQLite filtering/paging, diagnostics and Debug Folder status.
- Persisted independent table page, page size, sort and bounded filter state with Windows-safe atomic preference replacement.
- Added safe Issue/User Viewer request lifecycle diagnostics and fixed unsupported filters to `FILTER_UNSUPPORTED_FIELD:<field>`.
- Added the table verification matrix, manual validation procedure, Windows delivery report and execution ledger.
- Excluded third-party dependency documentation, tests, examples and Markdown from Windows ASAR artifacts.
- Kept Current-State schema v2 with no migration, adjacent-event inference or real Jira write.
- Real company data, XML/large SQLite and full human GUI acceptance remain Not Run.

## 0.2.49 - Unified Data Table UX, Activity Diff and Runtime Stability

- Fixed Chinese IME `null.value` failures by capturing primitive input values before React state/debounce work.
- Added explicit Activity Event UI-to-IPC filter mapping for Actor, Action, Field, Source, Before, After, and Diff with backend allowlist coverage.
- Added shared required-column enforcement, draggable/clamped widths, viewport-aware filters, UI preference v2 normalization, and safe table action diagnostics.
- Added schema-v2 normalized Before/After and compact scalar, set, and text Diff without adjacent-event inference or database migration.
- Fixed Windows persistent diagnostic summary replacement and made Debug Folder status follow actual copy failure count.
- Status remains Partial pending XML, real large SQLite, complete table inventory migration, Windows GUI, error-free gate, and containment acceptance.

## 0.2.48 - Database Loading and Readable Viewer Correctness

- Deferred database recovery and background checks until after the renderer shell loads, and removed synchronous startup `quick_check` from compatibility validation.
- Added phased Database Overview loading, shared Local DB load states, initialization guards, stale-response suppression, IME-safe debounce, and 25/50/100 server-side paging with a 50-row default.
- Added shared Excel-style filters, readable rich-content summaries, comment cards, before/after comparison, distribution panels, unified display-time formatting, and section-level error boundaries.
- Persisted available Comment bodies and precise content-status metadata in new Activity Events, with page-scoped enrichment for existing provenance-only comment events.
- Kept Current-State schema v2 unchanged. Payload-backed Changelog and Comments remain a documented partial limitation rather than claiming relational SQLite paging.


## 0.2.47 - Background Fetch and Activity Events UX

- Kept Step 3 Full Fetch in Electron main across route/tab/viewer navigation with retained run snapshots, run-scoped subscriptions, hydration, cancellation, and terminal progress.
- Stabilized Database Issue List filters by preserving the mounted table shell, input identity, focus, caret, IME composition, and table-local loading state.
- Removed Issue/User Viewer Activity Stream tabs and their dedicated IPC, session, distinct-query, and preference surfaces.
- Added complete Issue/User local SQLite Activity Events tables with 50-row paging, filtering, sorting, and readable shared event semantics.
- Added distinct Related Issue distributions for Project, Issue Type, Status, and Priority with explicit Unknown buckets and filter actions.
- Added 50-row filtering/paging to payload-backed Changelog and Comments while documenting the schema-v2 server-side query limitation.
- Replaced legacy Viewer stream preference keys with Issue Activity Events, Changelog, and Comments keys.
- Kept Current-State schema v2 unchanged with no migration, database recreation, SQLite business write, Viewer Jira call, or attachment download.
## 0.2.46 - Table UX, Activity Stream Views and Readable Viewer

- Froze Data Collection Step 1 dates, request windows, run IDs, and fixed round settings in one validated Run Context before any Jira request.
- Added shared SQLite viewer query contracts with server-side paging, sorting, filtering, distinct values, total/filtered counts, deterministic ordering, and stale-response protection.
- Removed the Database Issues Action column and replaced exact-value category inputs with full-database Project, Type, Status, and Priority selections.
- Added stable-user Related Issues, confirmed-provenance Activity Stream, All Activity Events, and Issue Activity Stream read-only views without changing Current-State schema v2.
- Extended Jira content rendering for wiki line breaks, bold text, mentions, attachment placeholders, inline image markup, code blocks, and safe links without remote image loading.
- Made Connections fully read-only; Reload, Choose Env, and Test Jira Connection do not save or edit credentials.
- Expanded atomic UI preferences for User and Issue viewer tables under `APP_ROOT/app-data/settings/ui-preferences.json`.
- Reset new Data Collection runs from clean workflow state and removed stale Local Database disabled wording.
- No migration, database recreation, SQLite business write, Viewer Jira call, attachment download, or new native SQLite dependency is introduced.

## 0.2.45 - Table UX and Readable Viewer

- Added strict typed Current-State database query pagination, sorting, and filters with stable Issue Key ordering and a 225-Issue synthetic fixture.
- Added persistent Database Issue List and Timeline Event List UI preferences under `APP_ROOT/app-data/settings/ui-preferences.json`, including safe defaults and corrupt-file recovery.
- Reworked Database Overview with Copy Path, full-database Type/Status/Priority distributions, column visibility/order/width controls, and table-local horizontal scrolling.
- Made Data Collection dates editable while keeping one-month windows, three force-all rounds, 5-second delay, union merge, and Remote Links OFF explicit and shared.
- Moved Timeline filters into the event table workflow and persisted timeline column visibility without changing completed run results.
- Added a shared no-script Jira content renderer, readable Description and Comments, and structured Changelog before/after rows without rendering raw JSON.
- Kept Current-State schema v2 unchanged. No migration, database recreation, Jira write, attachment body download, or new native SQLite dependency is introduced.

## 0.2.44 - UI Integration and Viewer Correctness

- Limited Jira Connection to Jira API and masked `.env` settings, while centralizing database selection, creation, status, health, counts, recent writes, and folder access in Database Overview.
- Added bounded main-process gzip decoding, payload-format and SHA-256 validation, typed Viewer DTOs, safe Description plain-text normalization, and distinct unavailable/decode/JSON error states.
- Corrected Issue Links, Remote Links, Activity Events, and `node:sqlite` `Uint8Array` BLOB handling without changing Current-State schema v2.
- Preserved independent Issue Viewer and User Viewer route state for the current app session.
- Reworked Data Collection into five compact pastel workflow tabs with keyboard navigation, locked one-month/force-all/5-second settings, and clean new-run state reset.
- Added an anonymized 140/48/142/2/453 Viewer fixture test. No real Jira credentials or production database are used.

## 0.2.43 - Unified App Shell and Local Database Viewers

- Reorganized the Electron renderer into one grouped navigation model for Jira Connection, Database Overview, Data Collection, Issue Viewer, User Viewer, Advanced Tools, and Settings while preserving legacy route redirects.
- Replaced the fixed Debug Log column with a global overlay drawer, WARN+ERROR badge, level filters, search, auto-scroll, copy, export, clear, and an explicit empty state.
- Added safe read-only IPC queries for Current-State SQLite Database Overview, Issue Viewer, and stable-ID User Viewer. Viewers never call Jira and the renderer cannot provide an arbitrary database path.
- Reused the existing User Analysis workflow as Data Collection and retained its file-backed Full Fetch, queue, related-issue, export, Source Archive, and database-write gates.
- Removed mock Dashboard and Settings operational data from active routes. Missing or unsupported local fields now render as empty, not found, or unavailable.
- Kept Current-State schema version 2 without migration, recreation, or database merge.

## 0.2.42 - Stable Hash V4 and Build Traceability Repair

- Added Stable Hash V4 with an exact Jira Field ID volatile-metric registry, including confirmed Actual Duration and Review Time mappings.
- Kept metric-only refetches as Existing while updating Current Observed Metrics without rewriting stable payloads, snapshots, revisions, or activity events.
- Added safe volatile-field candidate and stable-hash field-diff diagnostics without allowing diagnostics to mutate policy.
- Kept Event Identity V2 and schema v2; earlier Stable Hash policy databases remain read-only and are never migrated in place.
- Removed hard-coded Full Fetch artifact versions and added packaged source commit/build identity propagation.

## 0.2.41 - Stable Hash V3, Coverage Correctness, and Event Identity V2

- Added one frozen, canonical Stable Hash V3 policy per new database, including deterministic fingerprints and exact Jira Field ID resolution for volatile calculated fields.
- Added Current Observed Metrics so authoritative volatile values can advance without creating a content revision or rewriting a stable-equal payload.
- Added evidence-backed Coverage dimensions and corrected Issue Links coverage to follow `issue.fields.issuelinks` independently from Related Issues discovery.
- Added Jira-native Event Identity V2 for comments and changelog items; current Issue Link snapshots no longer synthesize repeated events.
- Added Current-State schema v2 for v0.2.41 databases. v0.2.39 and v0.2.40 databases remain read-only and are never migrated in place.
- Expanded Stage 5 bilingual diagnostics and added focused stable-hash, coverage, metrics, event-identity, integrity, and rollback tests.

## 0.2.40 - Current-State Archive and Stable Dedup V2

- Added a separate Current-State SQLite schema with one authoritative Snapshot, Payload, and Sync State per Issue.
- Added Stable Projection V2, deterministic canonicalization, exact volatile Field ID policy mapping, and ambiguity diagnostics.
- Added typed Coverage comparison with downgrade, incomparable, and invalid save gates.
- Added payload gzip/JSON/archive-hash prevalidation and atomic per-Issue transaction rollback.
- Changed Stage 5 to deduplicate stable-equal saves without rewriting large payload BLOBs.
- Added read-only legacy v0.2.39 detection; no legacy migration or cleanup is performed.
- Added Current-State save diagnostics and focused 57-scenario automated coverage.

## 0.2.39 - Stable Source Archive and Activity Events

- Separated exact archive payload SHA-256 from Stable Source Projection version identity, with deterministic canonicalization, meaningful changed paths, and a narrow volatile-field registry.
- Changed stable duplicates to update seen timestamps without inserting Source Object Versions, Payloads, Import Refs, or Activity Events.
- Added schema v2 migration with SQLite-safe validated backup, transactional legacy stable-hash/event backfill, duplicate-group audit, idempotence, and rollback fault coverage.
- Added normalized `activity_events` for issue creation, field/status/assignee changes, comment create/update, attachments, and issue links.
- Separated official Jira `/serverInfo` title from the user connection label and exposed verification/migration status in Connections.
- Split Stage 5 reporting into file save, database operation, snapshot decisions, and activity event counts; added issue-level projection/hash/decision evidence to Debug Folder.
- Switched renderer and main build provenance to the full Git commit SHA. Database Merge and legacy duplicate cleanup remain deferred to v0.2.40.

## 0.2.38 - Source Archive Database Write Correctness

- Connected User Analysis Stage 5 `Save Full Fetch Result` to the current `LOCAL_DATABASE_PATH` SQLite through the typed preload IPC and Electron main process. File JSON, Source Archive ZIP verification, and database write outcomes are reported separately.
- Added frozen Jira server provenance, database compatibility and binding preflight, first-write Jira binding, cross-server batch rejection, and file-backed per-Issue payload loading without copying the Full Fetch dataset through renderer IPC.
- Added canonical UTF-8 JSON, SHA-256, gzip BLOB storage, Object/Version/Payload/Import Ref deduplication, immutable snapshot history, Jira `source_version_number=NULL`, finite busy handling, per-Issue savepoints, first-binding rollback, and readback/FK verification.
- Enforced hard exclusion of Partial, Failed, and invalid Issue records from formal Source Archive tables, with explicit reason codes and truthful New/Existing/Excluded/Failed/Rolled Back UI metrics.
- Added synthetic v0.2.38 database correctness tests, a read-only SQLite audit utility, manual validation guidance, package-size evidence, and execution-time records. No real Jira, Confluence, credential, database, archive, or debug dataset is used by automated tests.

## 0.2.37 - Startup Configuration & Local Database Readiness

- Added the versioned, credential-free `.env.Version` template and `ENV_FORMAT_VERSION=2`; runtime loads only the local `.env`, preserves comments and unknown keys during targeted atomic updates, and saves Jira settings only after a successful connection test.
- Added one APP_ROOT-aware path resolver, parallel non-blocking Jira and SQLite startup checks, stale-request protection, shared renderer runtime state, retry/details controls, and capability selection that keeps Jira and offline database workflows independent.
- Added a SQLite Source Archive service using Electron's bundled `node:sqlite`, with seven normalized tables, metadata/schema/source-binding compatibility checks, gzip canonical JSON payloads, SHA-256 deduplication, snapshot history, transactions, and cascade integrity.
- Added Select Existing and Create New database flows. Invalid or incompatible selections never modify `.env`; `MIGRATION_REQUIRED` remains advisory and has no migration/repair action in this release.
- Added offline unit, integration, regression, UI, `win-unpacked`, and Portable smoke coverage without connecting to real Jira or Confluence.
- Audited Windows package size before and after optimization. Moving Vite/TypeScript build tooling to development dependencies, explicitly enabling ASAR/maximum compression, and excluding source maps reduced Installer size by 9.63% and `resources` by 74.17%.

## 0.2.34 - Selection / Fetch Queue Correctness

- Removed Project Scope from User Analysis Step 1 UI and active Timeline payload; the Electron Timeline handler now enforces all-project semantics even for restored legacy requests.
- Kept Step 2 Project Key as a display-only filter and preserved one normalized global Selected Set while switching between projects.
- Changed Step 2 queue creation from merge to replace, so the current Selected Set creates a fresh stable Fetch Queue without prior-run keys.
- Removed new-run `PROJECT_SCOPE_MISMATCH` eligibility exclusion while retaining Issue Key format, trusted provenance, duplicate, and prior-fetch protections.
- Added post-run `selection_fetch_queue_reconciliation_v1` diagnostics for Selected, Queue, Attempted, Completed, Partial, and Failed Issue Key sets, including same-count/different-key and outcome exclusivity checks.
- Did not add multi-layer Run IDs or pre-run set blocking. Field Evidence and Coverage Matrix remain outside this release.

## 0.2.33 Hotfix - Renderer Crash and Persistent Diagnostics

- Fixed the Step 2 to Step 3 white screen by normalizing legacy or partial Fetch Queue metadata before merge and render, validating selected Candidate Issue Groups, and committing queue plus wizard state only after conversion succeeds.
- Added 0, 1, 51, and 100 item queue-transition coverage, duplicate handling, missing optional-field coverage, and provenance checks that reject unstructured Jira-like keys while accepting verified structured keys of the same shape.
- Added a root React Error Boundary with an incident reference and safe recovery actions, plus persistent renderer and main-process diagnostics under `<APP_ROOT>/logs/sessions/`.
- Added current/previous session collection, queue transition snapshots, event-specific `not_observed` semantics, Full Fetch `not_run` semantics, and machine-readable APP_ROOT `path-audit.json` output to Debug Folder.
- Updated Electron 43 console-message handling with bounded, masked persistence and added cross-session, Debug Folder status, path containment, and Error Boundary regression coverage.

## 0.2.33 - Portable Output Control, Result UI Cleanup & Complete Time Ledger

- Centralized packaged output under the executable directory (`APP_ROOT`) and redirected Electron user data, session data, cache, logs, crash dumps, and controlled temporary files before application services initialize.
- Added normalized containment checks, explicit development/test roots, writable-root preflight, and clear no-fallback failure behavior.
- Made Debug Folder export one click under `exports/debug-folders`, with collision-safe names, truthful copy counts, and concise Open/Copy/Close completion controls.
- Replaced normal per-Issue Full Fetch preview and Direct Jira Evidence browsing with concise run and evidence summaries while retaining file-backed snapshots, normalized fields, evidence, completeness, and Source Archive compatibility.
- Corrected Jira key provenance so unstructured image, attachment, URL, markup, and text matches cannot enter semantic Jira-key collections or secondary warnings; structured keys remain accepted.
- Added APP_ROOT, startup ordering, Debug Folder, result UI, Issue Key provenance, and execution-ledger validation coverage.
- Added `reports/JiraActivityAnalyzer_v0.2.33_execution_time_ledger.json` as a development delivery artifact.

## 0.2.32 - Full Fetch Compatibility & Queue Correctness

- Restored Jira Server/Data Center changelog collection to the Issue API `expand=changelog`; observed `histories` are always preserved and completeness is determined from `histories.length` versus `total`.
- Removed the per-Issue dedicated `/changelog` request from Full Fetch. Unsupported endpoint behavior can no longer replace embedded histories with an empty result.
- Added stable Complete, Incomplete, Total Unavailable, Missing, and Invalid changelog diagnostics plus machine-readable per-Issue Partial reasons.
- Removed Full Fetch Limit and Batch Size from renderer state, IPC, and execution. Legacy `fetchLimit` values are accepted only as ignored compatibility input and never truncate a new run.
- Added full-queue preflight classification, immutable canonical queue snapshots, explicit Excluded/Invalid reasons, and four count-reconciliation invariants that gate Run completion and Source Archive export.
- Prevented attachment/image-like plain-text keys such as `IMAGE-2026` from becoming a primary Issue Key or entering Full Fetch Queue automatically.
- Corrected shared Jira HTTP diagnostics so successful 2xx responses never produce `HTTP_200` or another failure code.
- Replaced compressed Debug Bundle publication with user-selected, timestamped Debug Folder collection. Existing files are copied unchanged, individual copy failures do not stop remaining files, and no ZIP, hash, sanitization, PII scan, tamper check, or archive verification is performed in this flow.
- Preserved the existing strict Source Archive ZIP format and added count reconciliation to its eligibility gate.
- Added focused compatibility, 43-item queue, parser, HTTP, reconciliation, Debug Folder, staging, and archive-gate regression tests.
- Historical roadmap note: this release originally deferred Coverage Matrix to v0.2.34; that assignment was superseded by the v0.2.34 Selection / Fetch Queue Correctness decision.

## 0.2.31 - Full Fetch Correctness & Validation

- Allowed read-only Jira v2/v3 Changelog pagination through a strict endpoint and query allowlist while preserving the write-method guard.
- Added reusable Changelog/Comments pagination verification with reported/fetched totals, page metadata, duplicate detection, invalid-response handling, and completeness checks; embedded Changelog is no longer authoritative.
- Corrected Activity Stream Issue Key resolution so trusted primary keys alone form Timeline groups and Fetch Queue entries; mentioned and related keys remain separate diagnostics.
- Added preflight validation for source trust, key format, project scope, duplicates, existing entries, and Fetch Limit. An all-invalid queue no longer creates a Run or staging directory.
- Unified canonical Issue outcomes (`eligible`, `partial`, `failed_final`, `not_attempted_due_to_run_failure`) and Run outcomes (`completed`, `completed_with_partial`, `completed_with_errors`, `failed`) across UI, logs, manifests, and exports.
- Added bundle-scoped deterministic identity pseudonyms, expanded credential/path masking, idempotent structured sanitization, and parse validation for JSON and NDJSON.
- Added `sanitized-manifest.json` source-versus-sanitized hash/size semantics, tamper checks, and pre-publication verification for Debug Bundles.
- Added lazy single-Issue load/release diagnostics and retained streaming writes, temporary-file finalization, and atomic rename behavior without moving complete Raw data through renderer IPC.
- Added read-only compatibility for v0.2.30 staging. Legacy facts are not mutated, upgraded, resumed, or automatically refetched.
- Added synthetic correctness, pagination, parser, preflight, status, archive-gate, compatibility, sanitizer, hash, lazy-load, streaming, and failure-path regression coverage.
- Kept Jira and database operations read-only. The real company 60-Issue run, Installer GUI, and Portable GUI remain explicit environment-side acceptance checks.
- Deferred Field Evidence / 欄位來源檢視 and Coverage Matrix to later releases.

## 0.2.30

- Replaced active Full Fetch Resume/recovery queues with terminal, file-backed runs and startup `aborted_on_restart` handling.
- Added per-Issue canonical files, Current Issue Snapshot, normalized current fields, hashes, sizes, and lightweight run indexes under the Local AppData staging root.
- Added bounded JSON/NDJSON writers plus streaming Source Archive ZIP creation and reopen verification without whole-archive buffers.
- Added same-run Jira GET retry policy with a three-attempt cap, `Retry-After` support, and no retry for 400/401/403/404.
- Added permanent failed-run diagnostics, explicit safe deletion, read-only legacy v0.2.29 staging visibility, and canonical staging inclusion in Debug Bundles.
- Removed Resume and Pause controls from renderer IPC and User Analysis; Start New Full Fetch always creates a fresh run.
- Added synthetic terminal-state, run-failure-at-Issue-20, snapshot normalization, streaming writer, archive verification, legacy adapter, lock cleanup, and retry policy tests.
- Finalized staging retention: verified exports 7 days, user cancellations 30 days, and fetch/export failures permanent until explicit safe deletion or successful re-export.
- Tightened Eligible validation with Issue identity, full fields, complete Changelog/Comments pagination, canonical parse/hash/size verification, and per-section fetch metadata.
- Added warning-only Remote Links states with HTTP/error/attempt details and no false empty-array fallback.
- Added Run Summary → Issue List → lazy single-Issue Preview without whole-run Raw IPC transfer.
- Added complete sanitized Debug Bundle streaming ZIP output, deterministic user pseudonyms, credential/query-token removal, 500 MiB warning metadata, atomic failure cleanup, and explicit company-data UI warning.

## 0.2.29

- Made Remote Links optional and OFF by default; optional failures no longer reduce Archive Eligible or enter the Resume queue.
- Corrected Full Fetch terminal and remaining counts for eligible, required-partial, optional-warning, final-failed, excluded, interrupted, and retry-queued targets.
- Rebuilt Source Archive packages from the exact Run staging raw files and added payload, object, hash, manifest, and ZIP reopen verification.
- Preserved complete Full Fetch evidence and moved Result serialization and compression into the Electron main process.
- Removed the manual Save Full Fetch Raw Data action.
- Added the current Run Full Fetch Result ZIP and structured metadata folders to Debug Bundles without including staging raw, Source Archive payloads, or attachment files.
- Persisted User Analysis workflow state for Reload and Resume, including Step 4 and Step 5 status.
- Added Calendar Month, Force All Rounds, three-round, `COPGEN1`, Asia/Taipei date, and Remote Links OFF defaults.
- Added Full Fetch integrity, Result round-trip, and default calendar-window tests.
