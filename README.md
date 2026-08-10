# Jira Activity Analyzer

> v0.3.3 修正 Compact Diff correctness：所有實質 changed records 均須包含可分析的 `diffHunks`，Viewer 與 Export 共用同一組 Quick Filter predicate。SQLite schema 與 ENV format 不變。

> v0.3.2 changes Pending Analysis into a compact, non-self-contained Diff reference export. Jira remains read-only and Current-State SQLite schema stays at v3.

## v0.3.3 Compact Diff Correctness

- Pending Analysis schema：`jira-activity-analyzer.pending-analysis / 0.3.3-draft.1 / review-draft`。
- Export mode 維持 `compact-reference`；完整 Before／After 仍只存在 SQLite，不寫入 JSON。
- Description 延用既有有限 context hunk；scalar、array、attachment、link 與 custom JSON 使用 deterministic canonical rendering。
- `changed && isSubstantiveChange` 必須有 insert/delete hunk，counts 必須與 hunk lines 一致；否則以 `DIFF_CONTENT_MISSING` fail closed。
- 頂層 counts 新增 Diff coverage metadata，Completed export 必須為 `diffCoverageComplete=true`。
- Viewer SQL、progressive query 與 frozen export 使用同一個 classifier/predicate；Query Snapshot 記錄 normalized effective filters。

## v0.3.2 Compact Diff Export

- Exports canonical Diff hunks, change counts/status, stable SQLite source references, actor/event provenance, and original content SHA-256 values.
- Full Before/After values, parsed duplicates, comments, and compatibility aliases are not serialized into Pending Analysis JSON.
- Full source content remains in the selected source SQLite database and is recoverable by `sourceDatabaseId + activityEventId` with supporting stable identity fields.
- Each compact record and the complete record array have deterministic SHA-256 integrity values.
- This is intentionally not a self-contained export. Moving or deleting the source database removes access to full original content.

## Pending Analysis Data Export Contract

- Open **Issue Viewer / Activity Events** or **User Viewer / All Activity Events**, apply filters, then select **Export Compact Diff References**.
- The export freezes the typed filter/sort snapshot and writes every matching record across all pages, not only the visible page.
- Files are UTF-8 JSON under `<APP_ROOT>/exports/pending-analysis/`; the UI reports path, count, size, SHA-256, elapsed time, and Open Folder.
- Export runs use bounded batches, cancellation, source-generation guards, collision-safe filenames, and atomic finalization.
- Export metadata declares `compact-reference`, `selfContained: false`, `fullContentIncluded: false`, and `sourceDatabaseRequiredForFullContent: true`.
- Local SQLite/APP_ROOT paths and credentials are prohibited.
- Schema: `jira-activity-analyzer.pending-analysis` / `0.3.2-draft.1`; status: `review-draft`.

> v0.2.61 unifies Before/After/Diff presentation across Viewer activity tables and simplifies table controls without changing validated evidence or query semantics.

## v0.2.61 Viewer Diff and Table UX

- Issue Changelog, Issue Activity Events, and User Activity Events share the same original preview and Diff components.
- `View Full Original / 查看完整原文` toggles in place to `Hide Full Original / 隱藏完整原文`.
- Before, After, and Diff panes scroll independently; synchronized scrolling is no longer exposed.
- Current Viewer surfaces keep Excel filters, search, date range, and clear-filter actions, but no longer expose Filter Preset management.
- `Reset Table Layout / 重設表格版面` resets only column visibility, order, and widths. Existing query filters and state remain intact.
- Legacy saved Filter Preset data remains compatible and is not deleted or migrated.
> v0.2.60 restores exact original Before/After evidence for validated Description events without enlarging compact table DTOs.

## v0.2.60 Original Before/After Evidence Verification

- **Visible previews:** Issue Changelog, Issue Activity Events, and User Activity Events lazily request bounded Before/After previews in batches of at most 100 stable event IDs.
- **Exact comparison:** expanding a Description event loads the original SQLite strings and renders Before Original, After Original, and the v0.2.59 Diff Hunks together.
- **Manual verification:** each original shows code-point, UTF-8 byte, logical-line, and SHA-256 metadata; Wrap and Show Whitespace affect display only, while Copy Original copies the exact unmodified string.
- **Integrity and privacy:** requests are bound to database identity and generation. Source, event, issue, or hash mismatch fails closed, raw originals never enter compact DTOs or logs, and HTML/ADF/JSON evidence is rendered as inert text.
- **Scope:** local SQLite schema v3 remains unchanged and Jira remains read-only. Database Activity Events is not an available route in this baseline, so that view is N/A.

# Jira Activity Analyzer

> v0.2.59 fixes Description evidence identity and renders deterministic compact line/inline diff hunks from the exact local changelog event. SQLite schema v3 and Jira read-only behavior remain unchanged.

## v0.2.59 Description Diff Source Identity & Hunk Rendering Correctness

- **Stable source identity:** Description rows resolve by activity event ID and exact changelog history/item identity; timestamp and Comment fallbacks are prohibited.
- **Fail-closed evidence:** missing, ambiguous, incomplete, or mismatched evidence reports an explicit status without exposing unrelated content.
- **Real hunks:** deterministic line diff emits only changed lines plus two context lines, with optional inline grapheme-level emphasis.
- **On-demand context:** full Before/After content is fetched from local SQLite only after explicit user action and is guarded against stale responses.
- **Cross-view consistency:** Issue Changelog, Issue Activity Events, and User Activity Events share one result model and renderer.
- **Safety:** Jira remains read-only, SQLite schema stays v3, and no dependency or ENV format changed.

> v0.2.58 adds shared local-calendar date ranges, scoped Excel-style filters, cross-page filtered selection, safe Description diff classification, Comment date modes, and isolated filter presets while keeping SQLite schema v3 and Jira read-only behavior unchanged.

## v0.2.58 Date Range, Excel Filtering & Content Diff UX

- **Date semantics:** All Time, Today, Last 7 Days, Last 30 Days, This Month, and Custom use start-inclusive and next-day-exclusive local calendar bounds.
- **Scoped queries:** Database Overview, User Viewer, Activity Events, distributions, and Excel candidate values share one typed query scope with request revision/stale suppression.
- **Selection:** Step 2 can select or deselect all filtered results across pages while Project Key remains display-only and global selection is retained.
- **Content and comments:** Description uses canonical field identity and safe rich-content states; Comments support Created and Last Updated with explicit Created fallback.
- **Presets:** viewer/tab-isolated filter presets persist atomically under APP_ROOT/app-data/settings/ui-preferences.json.
- **Safety:** Jira access remains read-only, SQLite schema stays v3, and no dependency or ENV format changed.

> v0.2.57 separates Full Fetch draft/preflight, active attempt, completed result, and saved result identities. Save is bound to one completed four-part identity and becomes an idempotent no-op after a verified SQLite commit. SQLite schema and Event Identity Policy remain v3.

## v0.2.57 Full Fetch Identity Lifecycle & Idempotent Save Repair

- **Attempt boundary:** navigation, hydration, queue changes, and preflight checks no longer create executable attempts; an attempt starts only after the user runs Full Fetch and all gates pass.
- **Stable completed result:** the completed tuple (`attemptId`, selected Timeline Run ID, Full Fetch Run ID, and staging ID) survives navigation and is not replaced by later blocked, partial, failed, or cancelled attempts.
- **Idempotent Save:** the first eligible Save records JSON and verified SQLite evidence; a repeated Save returns `ALREADY_SAVED` without another JSON export or SQLite transaction.
- **Commit truthfulness:** the attempt becomes `saved` only after database commit, readback verification, and foreign-key verification succeed.
- **Debug consistency:** Debug Folder resolves staging and database-save evidence from the same registered completed result instead of mutable latest-session globals.
- **Safety:** Partial, Failed, Cancelled, stale, or mismatched identities fail closed. Jira remains read-only and no schema migration or external SQLite dependency was added.
> v0.2.56 fixes Full Fetch result persistence by binding completion, Save, and Debug Folder to one main-process attempt/run/staging registry. SQLite schema and Event Identity Policy remain v3.

## v0.2.56 Full Fetch Result Stale Fix

- **Single authoritative chain:** preflight attempt, Timeline Run, Full Fetch Run, staging reference, reconciliation, result, and save eligibility are held in one main-process registry.
- **Exact Save identity:** Save validates attempt ID, selected Timeline Run ID, Full Fetch Run ID, staging ID, and persisted staging metadata; historical directory timestamps cannot select another run.
- **Truthful stale handling:** FULL_FETCH_RESULT_STALE is reserved for a matching completed run whose staging directory is genuinely unavailable. Identity mismatch and non-save-eligible terminal states fail separately.
- **Debug consistency:** Full Fetch attempt metadata, staging evidence, result, and run reconciliation resolve the same current run and never include historical staging.
- **Safety:** Partial, Failed, Cancelled, or incomplete reconciliation cannot write formal SQLite. Jira access remains read-only.
> v0.2.55 implements run-bound Full Fetch preflight and attempt correctness, current-attempt Debug Folder evidence, shared full-width Activity Event details, Comment-specific display, and authoritative Jira connection hydration. SQLite schema and Event Identity Policy remain v3.

## v0.2.55 Full Fetch Workflow Correctness & Unified Diff Viewer UX

- **Run-bound Full Fetch:** eligibility follows the selected standard Timeline Run and its canonical rounds, merge, and reconciliation. Advanced Probe state cannot block it.
- **Attempt correctness:** blocked preflight preserves the immutable Queue, records an attempt ID, reports NOT_RUN reconciliation, and never borrows historical staging.
- **Unified Viewer:** Issue/User Activity Events share a full-width detail row and stable expansion identity.
- **Comment display:** CREATE, UPDATE, and neutral COMMENT show current full content without constructing previous revisions or invoking text diff.
- **Connection state:** startup and manual Jira checks hydrate all subscribers from Electron main.

## v0.2.53 Single Full Fetch Completeness & Content/Diff Viewer

- **Single-fetch rule:** each Issue is decided from one Full Fetch. No comment or description snapshot/version tables were added.
- **Content display:** a real Diff is produced only for a complete Before/After pair. Otherwise the Diff column shows trusted latest content without green/addition styling, or an em dash when no trustworthy content exists.
- **Exact correlation:** Comments and Worklogs use Jira-native IDs only. Author, nearby timestamps, text summaries, and array order are never used as identity guesses.
- **Required Worklogs:** `GET /rest/api/2/issue/{issueKey}/worklog` uses the existing read-only retry/pagination pipeline. Count conservation, duplicate IDs, permissions, unsupported responses, parse failures, and pagination completion are recorded per Issue.
- **SQLite:** Current-State schema v3 adds `worklogs`, source-aware unique keys, indexes, and Activity Event content provenance. The v2-to-v3 migration is transactional and preserves existing rows.
- **Evidence:** Full Fetch result/staging, JSON diagnostics, plain-text CSV, and Debug Folder reports distinguish `diff`, `latest_content`, `empty`, and `parse_failed` without storing Diff HTML.
- **Safety:** only eligible Full Fetch targets can reach formal SQLite writes. Worklog incomplete, failed, permission-restricted, or unsupported results remain Partial and are blocked.
> v0.2.52 adds explicit rich-content availability/diff semantics, main-owned Jira connection status, Activity Stream Stability Gates, run reconciliation, startup/query diagnostics, and a simplified Data Collection setup. Current-State schema remains v2; acceptance is Partial pending real Jira and Windows packaged human gates.

## v0.2.52 Data Trustworthiness and Runtime Stability

- **Rich content:** Comment/Description rendering distinguishes missing, empty, unavailable, not applicable, and parse failure; no missing Before is treated as unchanged.
- **Runtime SSOT:** Jira settings changes invalidate prior connection success through a credential-safe fingerprint owned by Electron main.
- **Stability Gate:** only stable initial/retry outcomes may formally write SQLite; unstable usable may continue/export but remains database-write blocked.
- **Diagnostics:** Debug Folder run reconciliation, shell-first milestones, Activity Events query timing/cache and artifact metadata are available without changing schema v2.
- **Decision required:** persistent semantic columns/migration remain deferred; see `docs/v0.2.52-sqlite-persistence-decision.md`.

> v0.2.46 adds frozen Data Collection run context, shared SQLite table queries, stable-user and issue Activity Stream views, a read-only Connections page, and safer Jira wiki rendering. Current-State schema remains v2 with no migration or recreation.
> v0.2.47 keeps Step 3 Full Fetch owned by Electron main across route changes, replaces Viewer Activity Stream tabs with complete local SQLite Activity Events, and stabilizes Database Issue filters. Current-State schema remains v2 with no migration or recreation.
> v0.2.48 separates the renderer shell from database bootstrap, adds phased readiness and stale-query protection, and unifies readable Viewer content. Current-State schema remains v2; payload-backed Changelog and Comments remain documented partial limitations.
> v0.2.49 fixes IME/filter/diagnostic failures and adds mapped Activity Event filters, required columns, resizable shared Viewer tables, and compact Before/After Diff. Current-State schema remains v2; the version is Partial pending full manual acceptance.
> v0.2.51 fixes layout-participating table filters, Windows IME composition state, bounded Comment/Description canonical Diff, and same-session Issue/User Viewer state restoration. Schema remains v2.

## v0.2.51 GUI Interaction Correctness, Rich Content Diff and Viewer State Persistence

- **Production contracts:** temporary SQLite tests exercise full-result Actor/Action/Before/After/Diff filtering, multi-select semantics, stable paging, unsupported-field failures and diagnostics.
- **IME and rich content:** the renderer uses a primitive-only IME state machine; HTML, ADF and Jira Wiki text are canonicalized with depth, node and length limits before Diff.
- **Preference v2:** table page, page size, sort and bounded filters now persist independently with Windows-safe atomic replacement.
- **Diagnostics:** Issue/User Viewer requests record safe started/completed/stale/aborted/failed events without query values or credentials.
- **Delivery status:** automated, packaging and app-only evidence is recorded in the v0.2.50 report. Real company data and full human GUI acceptance remain explicitly Not Run.
## v0.2.49 Unified Data Table UX, Activity Diff and Runtime Stability

- **IME correctness:** text filters capture primitive values and wait for composition end before debounce/query work.
- **Filter contract:** presentation columns map explicitly to backend Actor, Action, Field, and Source allowlist fields.
- **Shared Viewer table:** operational SQLite Viewer tables enforce required columns, draggable widths, table-local overflow, candidate filters, and normalized UI-only preferences.
- **Activity Diff:** persisted schema-v2 old/new values produce scalar, set, or compact text differences after safe readable-content conversion.
- **Diagnostics:** Windows-safe session summary replacement keeps `writerFailed` accurate; Debug Folder result follows actual copy failures.
- **Status:** Partial until XML, real large SQLite, all inventory tables, Windows GUI, error-free gate, and containment acceptance are completed.

## v0.2.48 Database Loading and Readable Viewer Correctness

- **Responsive startup:** the renderer shell loads before database recovery and background checks; compatibility no longer performs a synchronous startup `quick_check`.
- **Phased database loading:** Overview, first Issue page, and distributions load independently with explicit Local DB status and local error handling.
- **Safe table interaction:** Database Issues use server paging, 50-row defaults, IME-safe debounce, stale-request rejection, retained results, and Excel-style candidate filters.
- **Readable Viewers:** time, Rich Content, Comments, Before/After values, and distributions use shared components with section-level Error Boundaries.
- **Comment correctness:** newly extracted Comment events persist available bodies and precise availability states; old provenance-only events can be enriched from the current payload by Comment ID.
- **Compatibility:** Current-State schema remains v2. Changelog and Comments are payload-backed, so relational SQLite paging for those two sections is explicitly Partial.

## v0.2.47 Background Fetch and Activity Events UX

- **Navigation-safe Full Fetch:** Electron main retains the active run snapshot, broadcasts run-scoped progress/log events, supports status hydration after route remount, and cancels only the requested run.
- **Stable Database filters:** Issue List keeps the table shell and filter inputs mounted during refresh, debounces text queries, and preserves IME composition and input focus.
- **Issue Activity Events:** the Issue Viewer queries all local SQLite `activity_events` for the selected Issue Key with server-side paging, filtering, sorting, and distinct values.
- **User Activity Events:** the User Viewer retains Related Issues and All Activity Events, removes its Activity Stream tab, and shares readable event type/actor/before/after/source formatting.
- **User distributions:** Project, Issue Type, Status, and Priority counts use distinct Related Issue keys; missing snapshot values are shown as `Unknown` and each value filters Related Issues.
- **Payload sections:** Changelog and Comments provide 50-row client paging and filtering over the decoded Issue payload. Schema v2 has no relational changelog/comment tables, so these two sections do not claim SQLite server-side paging.
- **Preferences:** legacy Viewer stream keys are removed while Issue Activity Events, Changelog, Comments, User Related Issues, and User All Activity Events settings remain in the UI-only JSON preference file.
- **Compatibility:** no schema change, migration, database recreation, SQLite business write, Viewer Jira call, attachment download, or new native dependency is introduced.


## v0.2.46 Table UX, Activity Stream Views and Readable Viewer

- **Frozen Step 1 context:** the selected date range, effective request range, calendar-month windows, run IDs, three force-all rounds, 5-second delay, and union merge are created and validated once before requests begin.
- **Shared SQLite tables:** local Viewer queries use parameter binding, field allowlists, server-side paging/filtering/sorting, distinct values, deterministic secondary ordering, total/filtered counts, and table-local horizontal scrolling.
- **User Viewer:** Related Issues are derived only from the selected Stable User ID's activity events. Activity Stream includes only confirmed provenance; All Activity Events remains a clearly separate superset.
- **Issue Viewer:** Activity Stream reads only the selected Issue Key from the active local SQLite database. Unknown provenance is reported instead of reclassifying general activity events.
- **Connections:** Jira values are read-only. Reload Env, Choose Env, Copy Path, and Test Jira Connection are available; the page does not save or update `.env`.
- **Readable content:** Description and Comments safely render Jira wiki line breaks, bold text, mentions, attachment/image placeholders, links, and code blocks without `dangerouslySetInnerHTML` or remote image loading.
- **Preferences:** table display settings for Database Issues, Timeline, User Related Issues, User Activity Stream, User All Activity Events, and Issue Activity Stream are stored atomically in `APP_ROOT/app-data/settings/ui-preferences.json`.
- **Compatibility:** no schema change, migration, database recreation, SQLite business write, Viewer Jira call, attachment download, or external SQLite native dependency.

## v0.2.45 Table UX and Readable Viewer

- **Database Issue List:** queries SQLite by page (25/50/100/200), uses strict field allowlists, parameterized values, stable Issue Key ordering, integrated filters, configurable columns, and table-local horizontal scrolling.
- **UI preferences:** stores only display settings at `APP_ROOT/app-data/settings/ui-preferences.json`. Writes are atomic, corrupt JSON falls back to defaults with a warning, and credentials or Jira payloads are never stored.
- **Database distributions:** Type, Status, and Priority counts cover the full current snapshot and include an explicit unset bucket. Selecting a value applies the corresponding Issue List filter.
- **Data Collection:** Start Date defaults to 2026-01-01 and End Date to the current Taipei date, both remain editable and are used by the run. Remote Links is visibly locked OFF for this release.
- **Timeline:** filters live with the Timeline Event List, column visibility persists, and completed timeline results remain session-backed.
- **Issue Viewer:** Description and Comments share a safe structural renderer. Changelog shows field-level before/after values. Rendering does not execute scripts or load remote images and never calls Jira.
- **Compatibility:** no schema change, migration, database recreation, Jira write, attachment body download, or external SQLite native dependency.

## v0.2.44 Viewer and Workflow Correctness

- **Jira Connection:** owns only Jira URL, identity, authentication, masked token state, `.env`, test result, and per-run Remote Links guidance.
- **Database Overview:** is the single UI for database selection/creation, path, compatibility, refresh, full health check, counts, and recent writes.
- **Issue Viewer:** reads the current Snapshot, validates and safely decodes the current gzip Full Fetch Payload in the main process, and reads Activity Events through bounded IPC. It never calls Jira.
- **User Viewer:** reads stable user IDs and activities from the local database. Issue and User Viewer state remain independent while the app stays open.
- **Data Collection:** uses five short tabs: Build Activity Stream, Select Issues, Full Fetch, Validate History, and Save & Export. Step 1 executes a locked one-month, force-all, three-round run with a 5-second delay from 2026-01-01 through the run date.
- **Compatibility:** no schema change, migration, database recreation, payload conversion, Jira write, or new native SQLite dependency.

## v0.2.43 Application Structure

- **Overview:** Jira Connection and Database Overview.
- **Collection:** Data Collection reuses the existing staged User Analysis, selection, Full Fetch, related-issue, export, Source Archive, and database-write workflow.
- **Viewers:** Issue Viewer and User Viewer read only the currently validated Local SQLite database through bounded main-process IPC. They do not call Jira.
- **Advanced Tools:** Activity Stream Probe and Jira Probe remain read-only diagnostics.
- **Settings:** General, Display, Export, and Logs & Diagnostics are shown one category at a time.
- **Global Debug Log:** the overlay drawer persists while navigating, counts only retained WARN and ERROR entries, and keeps existing masked export handling.

Legacy renderer links redirect to the new route that owns the same responsibility. No schema change, migration, database recreation, database merge, attachment download, or remote Jira mutation is introduced.

> v0.2.42 adds Stable Hash V4, an exact Field ID volatile-metric registry, safe candidate diagnostics, and corrected build traceability. Earlier Stable Hash policy databases remain read-only. See [docs/v0.2.42-stable-hash-v4-build-traceability.md](docs/v0.2.42-stable-hash-v4-build-traceability.md).

## v0.2.42 Correctness Model

- Volatile metrics are excluded only after exact Jira `names` metadata resolution to a Field ID; broad `Time` or `Duration` matching is forbidden.
- Confirmed mappings include `customfield_12201` (Actual Duration) and `customfield_12401` (Review Time).
- Metric-only refetches update Current Observed Metrics but do not rewrite the stable Snapshot/Payload, increment `content_revision`, or create activity events.
- Unknown changing fields are reported in `volatile-field-candidates.json` and `stable-hash-field-diff.json`; diagnostics never alter the frozen policy.
- Event Identity remains V2 and Current-State schema remains v2. v0.2.41 Stable Hash V3 databases are read-only in v0.2.42.
- Full Fetch artifacts receive version, packaged source commit, and build time from the same injected build identity used by the app.

## v0.2.41 Correctness Model

- A database freezes one canonical Stable Hash V3 policy and one Event Identity V2 policy, each protected by a deterministic SHA-256 fingerprint.
- Volatile calculated fields are resolved from Jira `names` metadata to exact Field IDs. Missing or ambiguous names remain in Stable Hash and produce safe warnings.
- Stable-equal saves update check counters, Current Observed Metrics, and event deduplication without rewriting the Snapshot or compressed Payload.
- Issue Links Coverage is proven from `issue.fields.issuelinks`; Remote Links and Related Issues Discovery remain independent dimensions.
- Comment Created identity is the Jira Comment ID. Comment Updated identity adds Jira's normalized update timestamp.
- Issue Link events are created only from Jira changelog history items, never by enumerating the current links snapshot.
- Current Observed Metrics distinguish missing, explicit null, and typed values. They keep only the latest observation and no history.
- Formal writes remain local SQLite writes in Stage 5. Jira access remains read-only.

## v0.2.40 Current-State Archive

- New databases store at most one Snapshot, one compressed Payload, and one Sync State per Jira Issue.
- Stable-equal reruns update check metadata without rewriting the Snapshot or Payload BLOB.
- Coverage downgrade, incomparable scope, Partial, and Failed candidates cannot overwrite formal state.
- v0.2.39 databases are detected read-only and remain byte-for-byte untouched.
- Volatile calculated fields are excluded only after exact Jira Field ID resolution from the same Full Fetch `names` map.
- Formal Jira access remains read-only. Stage 5 writes only to the explicitly configured local SQLite database.

## v0.2.39 Stable Source Archive

Source Archive now keeps two hashes with separate responsibilities:

- `content_hash` is the archive payload SHA-256 of the complete canonical UTF-8 payload stored in gzip form. It protects exact archive readback.
- `stable_version_hash` is SHA-256 of the Stable Source Projection. It decides whether a fetch represents a new Jira source version.

The Stable Source Projection excludes acquisition-only `evidence` and `normalizedCurrentFields.fetchedAt`. A narrow volatile registry normalizes only Java `Object.toString()` identity suffixes observed at `issue.fields.customfield_10900`; it does not blanket-exclude custom fields or ordinary `@` text. Duplicate stable hashes update seen timestamps but do not add Versions, Payloads, Import Refs, or Activity Events.

Schema v2 adds stable identity metadata, official Jira server title status, connection labels, and `activity_events`. A schema v1 database is migrated only after SQLite preflight and a validated `VACUUM INTO` backup. Legacy gzip payload bytes are retained unchanged, stable hashes and events are backfilled in one transaction, and any failure rolls the original database back to schema v1.

Database Merge and cleanup of legacy duplicate versions are intentionally deferred to v0.2.40.

> v0.2.38 已將 User Analysis Stage 5 正式接通目前的 SQLite Source Archive Database。資料正確性、排除規則、手動驗證與唯讀稽核方式見 [docs/v0.2.38-source-archive-database-write.md](docs/v0.2.38-source-archive-database-write.md)。v0.2.37 的啟動與 Schema 文件仍保留於 [docs/v0.2.37-startup-database-readiness.md](docs/v0.2.37-startup-database-readiness.md)。

Electron desktop application for read-only Jira activity inspection and analysis.

## v0.2.38 Source Archive Database Write

`Save Full Fetch Result` now keeps three outcomes distinct: Full Fetch JSON, verified Source Archive ZIP, and Current Database Write. The database target is only the resolved `LOCAL_DATABASE_PATH`; the application does not create a fallback database.

Only file-backed Full Fetch targets with `eligible` status are written. Partial, failed, cancelled, incomplete, invalid-key, stale-run, unsafe-archive, and unverified-server records are excluded before formal data insertion. A database is bound to one verified Jira server and may contain issues from many projects. A different Jira server rejects the entire batch without changing business rows or seen times.

Each Issue stores one deterministic canonical JSON snapshot as SHA-256 plus gzip BLOB in the existing seven-table schema. Identical content reuses the Object, Version, and Payload; changed content adds a Version and Payload while retaining all prior snapshots. Per-Issue savepoints prevent orphan rows, and a new Jira binding is rolled back when every eligible Issue fails. Success requires gzip/JSON/hash/import-reference readback and a clean foreign-key check.

No historical staging import, database merge, `activity_events` table, split comments/changelog tables, migration UI, or automatic repair is included in v0.2.38.

## v0.2.34 Selection / Fetch Queue Correctness

User Analysis Step 1 now builds the Activity Timeline for the selected user and inclusive date range across all projects; Project Scope is no longer shown, sent through the active renderer flow, or applied by the Electron handler.

Step 2 Project Key remains a display-only filter. Selections are maintained as one normalized global set across projects. Confirming Step 2 creates a fresh Fetch Queue from that set in stable selection order and replaces the previous queue. A selected Issue with trusted structured provenance is not rejected because it belongs to another project; legacy `PROJECT_SCOPE_MISMATCH` values remain readable but are not produced by new runs.

After Full Fetch, `selection_fetch_queue_reconciliation_v1` compares the actual Selected, Fetch Queue, Attempted, Completed, Partial, and Failed Issue Key sets. It reports counts, normalized keys, missing/unexpected keys, duplicate outcomes, and multi-outcome keys as `MATCH` or `MISMATCH`. This is post-run diagnostics only and does not add a pre-run blocking workflow.

## v0.2.33 Hotfix Diagnostics

The v0.2.33 hotfix keeps the product SemVer at `0.2.33` and adds a new build time/commit identity. Candidate Issue Groups are validated and normalized before the Fetch Queue and Step 3 state are committed. Legacy session snapshots with missing optional queue metadata no longer crash the renderer.

Renderer, main-process, and queue-transition diagnostics are persisted by session under `<APP_ROOT>/logs/sessions/`. A new launch retains the previous session, and Export Debug Folder collects current and previous session evidence. The manifest distinguishes `copied`, `not_observed`, `not_run`, `source_missing`, and `copy_failed`; an unexecuted Full Fetch reports `failedCount: null` and does not claim a failed-issues evidence file. Each Debug Folder also includes `path-audit.json` with the actual APP_ROOT-derived paths and containment result.

If a React render error still occurs, the root Error Boundary shows an incident reference and safe Reload, Dashboard, Copy reference, and Open logs actions instead of a blank window. Diagnostic values are bounded and masked before persistence.

## User Analysis Workflow

Version 0.2.34, **Selection / Fetch Queue Correctness**, keeps the crash-safe, file-backed terminal-run design while correcting selection and queue identity:

- Packaged application data is contained under `APP_ROOT`, the directory containing the launched executable. Electron data, cache, crash dumps, session data, logs, temporary application files, Full Fetch staging, and exports no longer intentionally fall back to AppData or OS temp locations.
- Every successful Issue is committed under `<APP_ROOT>/full-fetch-staging/<staging-id>/issues/<issue-key>/` before UI completion is reported.
- Canonical files include Current Issue Snapshot, normalized current fields, changelog NDJSON, comments NDJSON, attachment metadata, users, evidence NDJSON, issue links, remote links, request metadata, and an Issue manifest with hashes and sizes.
- Canonical Issue outcomes are `eligible`, `partial`, `failed_final`, and `not_attempted_due_to_run_failure`. Canonical Run outcomes are `completed`, `completed_with_partial`, `completed_with_errors`, and `failed`; lifecycle-only cancelled/discarded records remain terminal and can never return to `running`.
- Cross-restart Resume and recoverable queues remain removed. Startup converts a stale running process to a terminal `failed` record; **Start New Full Fetch / 開始新的完整抓取** always creates a new Run ID and staging directory.
- Same-run GET retries are limited to three attempts for network/timeout, 408, 429, and selected 5xx failures. HTTP 400, 401, 403, and 404 are never retried.
- Run-level failures write a small error manifest, identify the faulting Issue, mark remaining Issues as not attempted, release mutation locks, and permanently retain the failed staging until explicit deletion.
- Changelog is read from the Issue API `expand=changelog`. Observed histories are always persisted. `histories.length === total` is Complete; fewer histories, an unavailable total, missing data, or invalid data is Partial with a stable machine-readable reason. Full Fetch does not require the unsupported per-Issue `/changelog` endpoint. Comments retain dedicated pagination and verification.
- Start Date normalization reports `present`, `absent`, `unparseable`, or `ambiguous`. Start Date and user enrichment warnings, normalized-field warnings, and attachment bodies not being downloaded do not block Eligible when core Raw remains complete.
- Remote Links is optional and OFF by default. Its states are `available`, `unsupported`, `permission_denied`, `temporarily_unavailable`, and `not_attempted`; failures retain HTTP/error/attempt metadata and warnings without blocking Eligible or masquerading as an empty response.
- Only a fully `completed`, count-reconciled run with no Partial, Failed, or Not Attempted issues can produce a formal Source Archive. Export keeps the existing versioned ZIP verification flow; this is separate from Debug Folder export.
- Successfully verified staging is retained for seven days from successful export. User-cancelled staging is retained for 30 days. Fetch failures, export failures, incomplete runs, and legacy staging are retained permanently until explicit safe deletion; a successful export retry starts the seven-day window. Active staging and formal Export ZIP files are never removed by staging cleanup.
- Legacy v0.2.29, v0.2.30, and v0.2.31 staging are visible through read-only compatibility adapters and are never mutated, resumed, or promoted to Eligible.
- Step 5 provides Save Full Fetch Result, Export Source Archive Import Package, and Export Debug Folder. The old manual Save Full Fetch Raw Data action is removed because main-process staging owns raw persistence.
- Normal results show a concise Full Fetch summary and evidence counts only. Per-Issue snapshots, normalized fields, changelog, comments, attachment metadata, evidence, and completeness data remain in main-process file-backed storage and are not exposed through a result browser.
- Debug Folder export is one click and automatically creates `<APP_ROOT>/exports/debug-folders/jira-activity-analyzer-debug-folder-YYYYMMDD_HHmmss[-02]`. It remains an ordinary directory without compression; individual copy failures do not stop remaining files.
- Jira-like matches from unstructured text, attachment names, image URLs, or markup remain rejected-candidate diagnostics. Only structured Jira fields, REST keys, verified `/browse/` URLs, and explicit related-key fields enter Jira Issue Key semantic collections.

- Stability setup, results, active tab, filters, sort, and visible columns persist for the current app session.
- Formal Stability and Timeline queries use only `escaped_username`; new executions do not perform username/email variant discovery.
- Logical window requests and physical HTTP requests have separate counts, timings, pagination/retry flags, and result classifications.
- Processing timing is separated from HTTP timing, including normalization, Jira-key extraction, deduplication, fingerprint, comparison, and assembly stages.
- Activity Stream Benchmark runs 1-20 isolated, sequential, read-only samples and exports JSON, CSV, and summary files without changing Timeline, Candidate Set, or Full Fetch state.
- Debug Folders include independent Stability setup, round comparison, window diagnostics, raw diagnostics, UI state, Benchmark exports, and available Full Fetch staging metadata from the current session. Formal Source Archive ZIPs remain a separate export flow.

1. Setup & Build Timeline
2. Select Issues
3. Full Fetch
4. Related Issues
5. Export

The Stability Probe and formal Timeline builder default to **Force All Rounds / 強制執行全部輪次** with three rounds. Both use the same sequential round-first executor: every date window in a round completes before round stability is evaluated, and the configured delay is applied only between complete rounds. Stable results do not stop the default three-round run.

Round diagnostics separate primary Jira targets from Jira-like keys referenced in titles or summaries. V2 exports include round fingerprints, union, intersection, variable events, consistency rate, per-window diagnostics, API/processing duration, progress, and ETA. Legacy v1 files remain identifiable as `window_first`; they are not converted into synthetic rounds.

The Source Archive Import Package contains only eligible canonical Issue files from a fully completed and reconciled staging Run. Partial, final-failed, not-attempted, or count-mismatched records block formal export. Export performs streaming hash and ZIP reopen verification. Version 0.2.34 does not create or write a Source Archive SQLite database.

User Analysis defaults are Start Date `2026-01-01`, End Date equal to the current `Asia/Taipei` calendar date, Calendar Month request windows, Force All Rounds, three rounds, and Fetch Remote Links OFF. Step 1 always uses all projects. For 2026-01-01 through 2026-07-21 this produces seven calendar windows and 21 logical window-round tasks.

Step 1 combines the selected user, inclusive date range, Live Jira API source, timeline build action, timeline summary, and event inspection. Later steps repeat a compact setup summary and remain blocked until their required evidence exists. Advanced Tools and Candidate Search are no longer exposed in User Analysis.

Timeline Issue Groups are built only from the event's trusted primary `issueKey`. `/browse/<IssueKey>`, structured fields, and REST keys are trusted sources. Plain-text regex matches, including attachment names such as `IMAGE-2026`, remain low-confidence candidates only and cannot become a primary key or Fetch Queue source. Queue preflight validates every raw item, source, format, duplicate, and prior entry without applying a fetch-count limit or Project Scope exclusion.

Timeline events classify their source application separately from their Jira relationship. `sourceSystem` and `sourceDetail` remain backward compatible, while `sourceApplication`, `hasJiraIssueKey`, `isJiraRelated`, `relatedSystems`, and `jiraRelationReason` identify Jira-related evidence. A Confluence event that references a Jira issue is Jira-related; a Confluence-only page edit is not. Issue groups aggregate both source and Jira-relation diagnostics.

Timeline Event List and Select Issues both provide Column Settings with fixed required columns, optional columns, and expandable row details for long evidence. Their checkbox filters use OR semantics within one category and AND semantics across categories. The default is Jira-related plus Jira and Confluence source applications, so Confluence references to Jira issues remain visible while pure Confluence page edits, Other, and Unknown remain excluded. Project Key filters only the current display; selecting visible rows merges them into the cross-project global Selected Set. Each filter can be cleared independently, all filters can be cleared together, and all visible issue groups can be selected.

After Full Fetch, Related Issues are derived from sanitized read-only metadata. Parent and epic hierarchy relationships are grouped as Recommended Scope and can be added together. Links, mentions, remote links, and other weaker evidence are Optional Scope and require explicit per-issue selection; there is no add-all optional action. Queue metadata distinguishes `recommended_related_issue` from `optional_related_issue`.

Step 3 displays concise Direct and Context evidence counts. Comments, changelog items, and attachment metadata still become `direct` evidence only when actor and inclusive date range match the selected setup. Issue links, remote links, and snapshots without reliable actor/time attribution remain `context`; related-issue evidence remains `related_context`. Detailed evidence records continue to be written to file-backed staging but are no longer browsed, filtered, paginated, or previewed in the normal UI.

Workflow exports are auto-saved under `<APP_ROOT>/exports/user-analysis/workflow/`:

- `user-analysis-workflow-snapshot.json`
- `timeline-issue-groups.json`
- `timeline-source-system-diagnostics.json` (Debug Folder)
- `timeline-jira-relation-diagnostics.json` (Debug Folder)
- `timeline-selected-issues.json`
- `fetch-queue.json`
- `related-candidate-issues.json`
- `related-issue-expansion-summary.json`
- `checkpoint-write-diagnostics.json` (Debug Folder)
- `full-fetch-failed-issues.json` (Debug Folder)
- `full-fetch-failure-summary.json` (Debug Folder)
- `timeline-event-list-ui-state.json` (Debug Folder)
- `select-issues-ui-state.json` (Debug Folder)
- `jira-evidence-events.json`
- `jira-evidence-summary.json`
- `jira-evidence-excluded-summary.json`
- `jira-evidence-schema.json`
- `analysis-roadmap.json`

Canonical JSON and NDJSON files use bounded writes, temporary files, atomic replacement, SHA-256 hashes, and per-file sizes. Full Fetch reports include Queue Total, Eligible/Planned, Excluded, Invalid, Attempted, Completed, Partial, Failed, Not Attempted, reconciliation results, and Changelog/Comments observed totals. Debug Folders include the existing reports, canonical staging, Jira-relation diagnostics, workflow details, and session events as ordinary files. This workflow remains read-only: it does not write Jira or a database and does not download attachment bodies.

The analyzer roadmap reserves Cloud AI Analyzer, Local AI Analyzer, and Offline Rule Analyzer as planned consumers of the normalized evidence schema. Live API is the current data source; Local Database and Hybrid sources are planned. Product goals cover Jira activity analysis, Confluence activity analysis, and combined Jira + Confluence analysis.

This is an Electron desktop app shell with a React renderer. The first version is a static UI prototype with one read-only Jira Probe diagnostics page. Import, database writes, token storage, and backup restore behavior are not implemented.

## Scripts

- `npm install`
- `npm run dev` starts the Electron desktop app and loads the Vite renderer in development mode.
- `npm run build` builds the React renderer and Electron main/preload bundles.
- `npm run dist` builds Windows installer and portable artifacts with electron-builder under `release/`.
- `npm run preview` opens the production build in Electron.
- `npm run test:ui` runs the Electron-only UI smoke test across all eight routes and supported desktop sizes.
- `npm run capture:ui` runs the same smoke test and saves app-only screenshots under `test-artifacts/screenshots/`.

## Build Time

The app injects `__BUILD_TIME__` from `vite.config.ts`.

- `npm run dev`: `Development Mode`
- `npm run build` / `npm run dist`: Asia/Taipei timestamp in `YYYY/MM/DD HH:mm:ss` format

Build Time is shown in the sidebar and in Settings > System Status.

## Full Fetch Stability and Diagnostics

User Analysis Full Fetch is a sequential, read-only Jira operation. Version 0.2.34 processes every Eligible queue item from an immutable confirmed snapshot:

- An auto log is created immediately under `<APP_ROOT>/logs/full-fetch/` and appended throughout the run.
- A small run manifest and index record terminal state, current/faulting Issue, counts, timing, hashes, sizes, and per-Issue canonical references.
- The UI, logs, manifests, exports, and Debug Folder expose one canonical aggregation for Queue Total, Eligible/Planned, Excluded, Invalid, Attempted, Completed, Partial, Failed, and Not Attempted. Partial is never counted as Failed.
- Full Fetch has no Fetch Limit or Batch Size. Candidate Discovery keeps a separate safety limit that does not truncate items already in the Fetch Queue.
- Full Fetch always uses file-backed canonical storage. Complete raw Issue, Snapshot, and Evidence collections are not transmitted through renderer IPC.
- Multi-Issue Full Fetch requires one `CONFIRM` action after full preflight and then processes all Eligible items. There is no per-40-item confirmation or truncation.
- Stop After Current Issue lets the active Jira request finish safely and marks unscheduled Issues as not attempted. It does not create a resumable queue or partial formal archive.
- On restart, stale running state becomes a terminal `failed` record and is shown with Open Folder, Export Debug Folder, and explicit Delete actions. No Resume action is exposed.
- Main/renderer/child process failures and unresponsive windows write masked diagnostics under `<APP_ROOT>/logs/crash/`.

Runtime logs, staging files, raw diagnostic files, exports, databases, and release artifacts are ignored by Git. Full Fetch does not write Jira, does not write a database, and does not download attachment bodies.

### v0.2.34 Acceptance Checklist

For `COPGEN1-141509`, verify that Issue `expand=changelog` histories are preserved and `fetchedCount` is compared with Jira's `total`. A 102/102 response must be Complete; 100/387 must retain all 100 histories and be Partial. The unsupported dedicated `/changelog` endpoint is not required.

For a cross-project queue, expect every explicitly selected Issue with trusted provenance, including `NDS-4316`, to remain in Selected, Queue, and Attempted. Verify `Selected = Queue = Attempted`, mutually exclusive Completed/Partial/Failed outcomes, concise result counts, background per-Issue persistence, strict Source Archive gate, one-click Debug Folder output under `APP_ROOT`, `.env` loading, Installer, and Portable workflows.

The older plan assigning Coverage Matrix to v0.2.34 was superseded. Field Evidence and Coverage Matrix are not part of v0.2.34 and have no newly assigned release number.

## Full Fetch Confirmation and User Actions

The in-app bilingual confirmation dialog now follows full-queue preflight. For a multi-Issue run it shows Queue Total, Eligible, Excluded, Invalid, and the exact planned count; the user types `CONFIRM` once before all Eligible items run. Cancelling or submitting a non-matching value does not create a Full Fetch run, auto log, or staging directory.

User Analysis records important interactions with these diagnostic categories:

- `[USER_ACTION]` for workflow tabs, search controls, queue selection, Full Fetch, reports, exports, Help, and Debug Log controls.
- `[GUARD]` when an action is blocked or confirmation is rejected/cancelled.
- `[UI_MODAL]` when the large-queue dialog opens or closes.

These records appear in the UI Debug Log and `<APP_ROOT>/logs/app/app-YYYYMMDD.log`. While a Full Fetch run is active, subsequent related actions are also appended to its auto log. Confirmation input is never logged verbatim; diagnostics record only `confirmInputMatched=true/false`. Sensitive-value masking remains active for UI, app, Full Fetch, export, and crash logs.

Version 0.2.5 additionally preserves the complete action timeline in `<APP_ROOT>/logs/app/user-actions-YYYYMMDD.log`. This append-only daily file contains `USER_ACTION`, `GUARD`, `UI_MODAL`, and directly related lifecycle entries without Full Fetch per-issue progress noise, so it is not affected by the UI Debug Log's recent 160-line buffer.

- User Analysis > Exports displays the current action log path and provides Open Action Log Folder and Copy Action Log Path controls.
- Export Debug Folder collects the current masked UI buffer and complete daily action timeline into the automatically created Debug Folder.
- Full Fetch result and raw manifest exports include `actionLogDiagnostics`; `debugLogNote` explains that `debugLogSanitized` may contain only the recent UI buffer.
- Action log messages use the same token and Authorization masking as other diagnostics. Large-queue confirmation input is represented only by `confirmInputMatched=true/false`.

## Global Data Source Mode

The current global data source mode is `live_jira_api`.

- Connections is now labeled `連線與資料來源 / Connections & Data Source`.
- Live Jira API is available and selected.
- Local Database mode is disabled and marked as coming later.
- Dashboard, Jira Analysis, User Analysis, and Jira Probe show the active data source mode.
- Jira Probe always uses Live Jira API and remains read-only.
- Header badges reflect the current Jira API/version/status instead of always saying `Jira Cloud Connected`.
- Exported Jira Probe and Jira Analysis JSON includes `globalDataSourceMode` and masked read-only source metadata.

Local database import, database reads, database writes, backup/restore, and production data-source switching are not implemented in this UI round.

## Session State

Jira Analysis and Jira Probe keep their current issue key, last result, active tab, table pagination, filters, notices, and errors in an in-memory React session store. Navigating to another route and returning to these pages preserves the loaded result without triggering a new Jira request. This session store is reset when the app window is closed and does not write tokens, Authorization headers, passwords, cookies, session IDs, or `.env` contents to localStorage or app config.

## Activity Stream Standard Flow

Version 0.2.14 simplifies the normal single-user Activity Stream workflow. The standard flow uses the only Selected User, escapes underscores in the username, applies update-date `AFTER` / `BEFORE`, enables Auto date-range chunking, and sends one `escaped_username` request per chunk with `maxResults=500`.

- No selected user: the UI asks for one user.
- More than one selected user: the standard flow is blocked. Multi-user Activity Stream aggregation is not implemented.
- Activity Stream User Override, query mode, date mode, maxResults, chunk settings, Manual URL Replay, and MaxResults Cap Test remain available under the collapsed Advanced Diagnostics section.
- `startDate` / `endDate` query parameters remain available for diagnostics but are marked unreliable in the verified Jira environment.
- Standard and advanced results remain read-only, do not write a database or Jira, and do not download attachment bodies.

Activity entries use a deterministic rule-based classifier. Comment rules have priority 100 and are evaluated before attachment rules, so `commented on` cannot be misclassified as an attachment. Parsed entries include the matched rule, matched text, priority, source field, previous type, and final type. Exports and Debug Folders include classifier diagnostics, rules version `1.0`, Standard Activity Stream Flow metadata, and whether Advanced Diagnostics was used.

## Export Result / Raw Data

Runtime export files are written under `<APP_ROOT>/exports/`. The app creates these common folders:

```text
<APP_ROOT>/exports/
  jira-analysis/
  jira-probe/
  timeline/
  user-analysis/
  import-preview/
  connections/
  dashboard/
  raw-data/
  debug-bundles/
```

Jira Analysis supports:

- Save Analysis Result: writes `<APP_ROOT>/exports/jira-analysis/jira-analysis-{issueKey}-YYYYMMDD_HHmmss.json`.
- Save Raw Data: writes `<APP_ROOT>/exports/raw-data/jira-analysis-raw-{issueKey}-YYYYMMDD_HHmmss.json`.
- Save Debug Bundle: writes `<APP_ROOT>/exports/debug-bundles/jira-analysis-debug-bundle-{issueKey}-YYYYMMDD_HHmmss.json`.

Save buttons are disabled until a Jira Analysis issue is successfully loaded. Exported JSON is created by Electron main process IPC and is sanitized before writing.

Exported Jira Analysis result JSON includes app version, build time, git commit, git branch, exported time, a token-safe `summary` object, `globalDataSourceMode`, read-only source metadata, issue details, analysis summary, lifecycle, participants, status transitions, field changes, comments, attachments metadata, linked issues, risk hints, and activity timeline.

Exported raw data JSON includes sanitized endpoint responses and sanitized debug logs. It does not include API token values, Authorization headers, passwords, master keys, cookies, session IDs, CSRF/XSRF values, `.env` content, database content, or downloaded attachment files.

The shared export sanitizer masks sensitive keys such as `authorization`, `token`, `apiToken`, `password`, `masterKey`, `cookie`, `set-cookie`, `session`, `sessionId`, `JSESSIONID`, `atl.xsrf.token`, `csrf`, and `secret`.

Common export TODOs for later pages:

- Dashboard: Save Dashboard Snapshot / Save Raw Metrics Data
- Connections: Save Connection Test Result / Save Raw Test Response
- Import: Save Preview Result / Save Dry Run Result / Save Raw Search Result
- Timeline: Save Timeline Result / Save Raw Activity Events / Save Filter State
- Analysis: Save User Analysis Result / Save Raw Aggregation Data
- Jira Probe: Save Probe Result / Save Raw Data / Save Debug Bundle
- Settings: Save Diagnostics Result / Save System Status Snapshot

## Jira Probe

`Jira 測試 / Jira Probe` is a read-only diagnostics page for checking whether one issue can provide enough Jira data to build activity events later.

Default Real Probe UI values are optimized for Jira Server/Data Center:

- API Version: `v2`
- Auth Type: `Bearer Token / Personal Access Token`
- Mock Mode: `Off`
- Log Level: `DEBUG`

Runtime files live beside the executable in packaged builds, and under the explicit `.runtime` development root in development. The app creates and uses this layout:

```text
<APP_ROOT>/
  .env
  app-data/
  logs/
  exports/
  exports/jira-probe/
  exports/raw-data/
  backups/
  app-data/config/
```

Connections and Jira Probe load the current env path recorded in `<APP_ROOT>/app-data/config/app-config.json`. If no custom env path is configured, the app uses `<APP_ROOT>/.env`. If that file is missing, Reload Env creates a safe template automatically and logs the created path. Choose Env File accepts `.env` / `*.env`, stores only the selected path in app-config, and reloads it on the next launch. The app does not create a real database or backup in this UI prototype.

```env
JIRA_BASE_URL=https://jira.example.com:8443
JIRA_EMAIL=your.name@example.com
JIRA_USERNAME=your.username
JIRA_API_TOKEN=replace-with-your-token
JIRA_AUTH_TYPE=bearer
JIRA_API_VERSION=v2
JIRA_PROBE_DEFAULT_ISSUE=COPGEN1-138930
JIRA_PROBE_MOCK_MODE=false
JIRA_PROBE_LOG_LEVEL=DEBUG
```

`.env` is ignored by git. Do not commit real tokens.

- Renderer code does not call Jira directly. Real Probe requests go through Electron preload IPC into the main process.
- The Electron main process owns Jira auth headers, read-only request validation, safe response parsing, sensitive-data masking, and structured probe logs.
- Jira request code is split into:
  - `electron/jira/jiraClient.ts`
  - `electron/jira/jiraReadOnlyGuard.ts`
  - `electron/jira/jiraProbeRunner.ts`
  - `electron/jira/safeJson.ts`
- Mock Mode uses safe sample data. No Jira request is sent, no token is used, and no database write is performed.
- Real Probe requires Jira Base URL, Email / Username, API Token, and Issue Key or ID.
- Real Probe never falls back to mock data. If the Jira request fails, the page shows a real error state with failed/skipped endpoints.
- API Version supports Auto Detect, Jira Cloud v3, and Jira Server/Data Center v2.
- Auto Detect tries v3 first and can try v2 when v3 looks unavailable.
- Auth Type supports Basic Auth and Bearer Token / Personal Access Token.
- The API Token field is a password input and is never written to Debug Log, exported JSON, or console output.
- Real Probe only sends read-only GET requests:
  - `GET /rest/api/3/myself`
  - `GET /rest/api/3/issue/{issueKey}`
  - `GET /rest/api/3/issue/{issueKey}/changelog`
  - `GET /rest/api/3/issue/{issueKey}/comment`
  - `GET /rest/api/2/myself`
  - `GET /rest/api/2/issue/{issueKey}`
  - `GET /rest/api/2/issue/{issueKey}?expand=changelog`
  - `GET /rest/api/2/issue/{issueKey}/comment`
- Non-JSON responses such as login pages, SSO redirects, proxy pages, or HTML error pages are handled as readable probe errors instead of raw JSON parse failures.
- The read-only guard blocks non-GET requests and attachment content/thumbnail URLs.
- Debug Log Copy, Export Folder, and Clear operate on the current in-memory log state. Export Folder uses one-click main-process collection without a destination picker.
- Connections is `.env` only. The page displays Current Env Path, supports Reload Env, Choose Env File, and Test Connection, and does not write connection records or `connections.json`.
- Jira Probe uses a fixed Standard read-only issue analysis scope.
- Data Inspector tabs show sanitized read-only probe data for overview, issue fields, description, changelog, comments, attachments, links, users, activity estimates, raw JSON, and manual compare.
- Data Inspector supports in-page search and simple data filters. It is UI-only and does not write files or database records.
- Save Probe Result writes sanitized JSON to `<APP_ROOT>/exports/jira-probe/`.
- Save Raw Data writes sanitized raw API response JSON to `<APP_ROOT>/exports/raw-data/`.
- Export Debug Folder writes automatically to `<APP_ROOT>/exports/debug-folders/`.
- Exported JSON includes app version, build time, exported time, run id, base URL, issue key, selected API version, auth type, endpoint coverage, parsed inspector sections, sanitized raw responses, and sanitized debug logs.
- Exported JSON does not include API token values or Authorization headers.
- Standard read-only probe scope includes `/myself`, `/issue`, `/issue?expand=changelog`, `/comment`, attachment metadata parsing, issue links parsing, users derived from responses, and activity event estimates.
- It does not write to Jira.
- It does not write to the production database.
- Attachment file content is not downloaded; only metadata from the issue payload is shown.

## UI Validation

The UI smoke test runs inside Electron with `BrowserWindow.capturePage()`. It captures only the app renderer, never the full Windows desktop, so screenshots do not include other user windows.

The smoke test checks:

- all eight routes load
- sidebar, Debug Log, page title, and Build Time are visible
- `documentElement` and `body` have no global horizontal overflow
- important `data-no-clip` UI such as metric values, status badges, buttons, nav labels, and Debug Log labels are not internally clipped
- both Debug Log expanded and collapsed states work across `1024x768`, `1280x720`, `1366x768`, `1600x900`, and `1920x1080`
- screenshots are generated only when `npm run capture:ui` is used

## Activity Stream Precision Probe

The standalone User Activity Precision Probe is a read-only compatibility and diagnostics tool. Activity Stream Query Mode defaults to Auto and tries deduplicated username and email variants in an order based on the supplied user value. Username only, Email only, and Custom only modes are also available.

- Each variant records reachability, endpoint support, HTTP status, content type, Atom entry count, parsed activity count, extracted Jira keys, and a diagnosis.
- Diagnoses distinguish `parsed`, `parsed_no_issue_keys`, `parsed_confluence_only`, `no_entries`, `parser_failed`, `html_login`, `http_error`, `blocked`, and `unknown` instead of treating HTTP 200 alone as a successful parse.
- Atom parsing counts every `<entry>` and keeps only the first three sanitized summaries, limited to 500 characters per field. Complete XML, HTML login pages, cookies, tokens, and Authorization values are not retained.
- Issue keys are extracted from title, link, summary, content, and a sanitized raw-entry fallback. Multiple keys per entry are deduplicated.
- Activity Stream keys are preferred for `recommendedIssueKeys` only after successful parsing. `updatedBy` remains a candidate source and is never described as confirmed user activity.
- Precision Probe exports include `activityStream.variantResults`, `firstEntriesSanitized`, and separate Activity Stream, updatedBy candidate, CHANGED BY, broad baseline, and recommended issue-key sets.
- The probe never writes Jira or the database and never downloads attachment bodies.
- Auto mode also tries an escaped username variant for Jira Activity Stream compatibility. For example, `roger_hsieh` becomes `roger\_hsieh` and is encoded once as `roger%5C_hsieh`; generated requests include `relativeLinks=true` by default.
- Manual Activity Stream URL Replay accepts only the configured Jira origin and `/plugins/servlet/streams` path. External origins, other paths, unsupported query keys, and sensitive query keys such as token, password, session, cookie, or authorization are rejected before any request is sent.
- Manual replay uses the existing authenticated read-only GET client. Exports retain only sanitized path and query diagnostics; origins, cookies, session values, tokens, and Authorization values are not stored.
- Successfully parsed manual replay keys take recommendation priority over automatic Activity Stream keys. `updatedBy` remains only a candidate set and is never used as a fallback recommended set when Activity Stream has no entries.

### Activity Stream Stability Probe

Version 0.2.25 adds Stability, Attempt Comparison, and Raw Results modes inside User Activity Precision Probe; it does not add another sidebar route or another Debug Log. The Stability Probe uses the existing read-only Activity Stream client and the global Debug Log.

- Request Window splits the selected total date range into sequential 1-day, 7-day, 14-day, calendar-month, or custom 1-31 day requests. Calendar months use their actual boundaries, including leap-year February and a final partial window.
- Forced Retry accepts 1-32 attempts per window and repeats successful HTTP 200 requests as configured. Probe-only delay options are 0, 1, 2, 3, and 5 seconds. Stop Early may stop after a stable pair unless Force Run All Attempts is enabled.
- Every attempt records sanitized counts, timing, HTTP outcome, previous/union differences, idle-gap diagnostics, and SHA-256 event-set and Jira-key-set fingerprints. Results classify each window as `insufficient_attempts`, `unstable`, `probably_stable`, or `stable` based on content rather than counts alone.
- Union merge deduplicates normalized stable event IDs across attempts. Last Stable uses a confirmed stable attempt; when none exists, the selected Union or Last Attempt fallback is explicit and exported with a warning.
- Runs are sequential (`concurrency=1`). The UI warns above 100 estimated requests and requires typed confirmation above 500. Cancel stops future attempts and windows while preserving completed partial results for export.
- The probe writes five sanitized diagnostic files: `activity-stream-stability-probe.json`, `activity-stream-attempts.json`, `activity-stream-attempt-comparison.csv`, `activity-stream-window-summary.csv`, and `activity-stream-stability-recommendation.json`. Export Debug Folder includes the latest versions and summarizes them in `README_for_GPT.txt` and `debug-bundle-summary.json`.
- User Analysis Step 1 exposes only Request Window, Forced Retry Count, Merge Strategy, and an Open Stability Probe shortcut. Defaults are 7 Days, 5 attempts, and Union. Recommendations change these settings only after the user selects Apply Recommendation.
- Stability Probe does not write Jira or a database, store credentials, replay external URLs, or download attachment bodies.

### Run Stability And Parsed Entry Diagnostics

- Every automatic, precision, and manual Activity Stream run receives a unique `asrun-...` ID. Each variant and parsed entry carries that same ID.
- While a run is active, all Activity Stream entry points are disabled. A result can update renderer state only when its run ID still matches the latest run; stale results are ignored and logged.
- Starting a run clears the visible current result, variants, parsed entries, issue-key sets, manual result, and parser diagnostics. The last successful result and five most recent run summaries remain available separately.
- Parser diagnostics count an Atom entry as parsed when it has usable activity fields. A missing Jira issue key is diagnostic information, not a skipped entry or parser failure. Confluence-only feeds can therefore report `parsed_confluence_only` with zero Jira keys and no parser anomaly.
- Parsed Entries can be filtered without changing the original sanitized entries by activity type, partial Jira key, key presence, date range, query variant, source, and author. The table paginates at 10, 20, 40, 80, or 160 rows (default 40), resets to page 1 after filter changes, and exposes sanitized expandable details and Copy Entry JSON.
- Precision Probe exports retain the complete sanitized current entries, current filter state and statistics, `activityEntryStats`, `parsedEntriesTableState`, and at most 200 filtered entries. They also include run history and parser diagnostics, but never tokens, Authorization headers, cookies, sessions, full XML, or HTML login pages.

### Run Auto-Save And Debug Folders

- Successful and partial Activity Stream, Precision Probe, Manual URL Replay, and MaxResults Cap Test runs are automatically saved as sanitized JSON under `<APP_ROOT>/exports/user-analysis/` in their corresponding `activity-stream-runs`, `precision-probe-runs`, `manual-url-replay-runs`, and `maxresults-cap-tests` folders.
- Last Auto-Saved Result shows the path, save time, run ID, result type, and status, with Open Folder and Copy Path actions.
- Export Debug Folder creates one timestamped ordinary folder under `<APP_ROOT>/exports/debug-folders/`. It includes the generated debug log, user action log, app metadata, request context, latest result, run histories, auto-saved result paths, available probe results, Full Fetch staging files, and `README_for_GPT.txt`.
- Collected source files are copied without compression, content rewriting, full-file de-identification, PII scanning, hashing, or archive/tamper validation. Existing generated logs keep their normal credential masking, but the export does not claim that copied source files are sanitized; review the folder before sharing.
- `manifest.json` records copied paths, sizes, status, and individual copy failures without hashes. A failed source copy does not stop the remaining files from being collected.
- Debug Folder export never creates `.zip`, `.7z`, `.tar`, `.tar.gz`, or `.gz` output. Formal Source Archive ZIP creation and verification remain independent and keep their Full Fetch completion gate.
- Cross-page integration remains a documented follow-up for Jira Probe, Jira Analysis, Candidate Discovery, Full Fetch, and Connections/Data Source tests; v0.2.12 does not silently claim those flows are auto-saved.

### Date Range Chunking And Result Consistency

- Activity Stream update-date queries support Off, Auto, Monthly, Weekly, and Custom Days chunking. Custom Days accepts 1 through 31 days. Auto uses one request for ranges up to 31 days and monthly chunks for longer ranges; ranges over 180 days display a warning.
- Chunking applies only to `update-date AFTER/BEFORE` requests. `startDate/endDate` remains an independent compatibility test because it is unreliable in some Jira Server/Data Center environments.
- Every chunk records its sanitized request URL, date bounds, status, diagnosis, Atom and parsed counts, Jira-key count, Confluence-only count, and error. Partial chunk failures preserve successful data and produce an overall partial result.
- Merged entries are deduplicated by activity time, author email, normalized title, and first link. Exports include `dateRangeChunking`, `activityStreamChunkResults`, and `chunkMergeStats`.
- Auto-save tracks Latest Run Result, Last Successful Result, Last Parsed Result, and Latest No Entries Result independently. A newer `no_entries` run never overwrites the last meaningful parsed result.
- When every query variant returns no entries, `bestVariant` is empty and `bestVariantReason` is `all_variants_no_entries`; no username or email variant is presented as the winner.
- Debug Folder creation takes one consistent in-memory snapshot. `latest-run-result.json`, `run-history.json`, and `auto-saved-result-paths.json` therefore refer to the same latest run ID.
- Debug Folders also include `last-successful-result.json`, `last-parsed-result.json`, `latest-no-entries-result.json`, `debug-bundle-summary.json`, `activity-stream-chunk-results.json`, and `activity-stream-merged-result.json`.

### Classifier Fallback And Full Session Debug Folders

- Activity classification applies high-precision rules first, then preserves a valid previous type. It uses `fallback_unknown` only when neither a rule nor a valid previous type exists.
- Confluence page metadata, object type, and preserved page classifications keep edited or added page activity as `page`, even when a human-readable title does not contain the word `page`.
- Classifier diagnostics separate higher-precision corrections, preserved types, inferred types, and true unknown fallbacks.
- Result Tracking groups roles by run ID. The latest card lists additional roles without rendering duplicate cards, while a different latest no-entries run remains visible.
- Export Debug Folder creates a full-session support folder from process launch to export time. It includes session-only user actions, all in-memory run summaries, all known auto-save paths, and unchanged copies of every available auto-saved JSON body under `auto-saved-results/`.
- `auto-saved-results-index.json` lists included and missing auto-saves with run ID, source path, bundle path, status, diagnosis, parsed count, or a concrete missing reason.
- `session-timeline.json` combines user actions, renderer Debug Log entries, Activity Stream run history, and auto-save path events in chronological order.
- Missing auto-save files are reported without aborting bundle creation. Auto-save bodies are deduplicated by resolved path, run ID, or basename.

### Activity Stream Baseline Guard

- Standard single-user Activity Stream runs maintain an exact-range best-known JSON baseline under `<APP_ROOT>/app-data/activity-stream-baselines/`. Baselines are runtime diagnostics and are not committed.
- Every sanitized Activity Stream entry has a SHA-256 fingerprint. Atom entry IDs are preferred; otherwise the fingerprint uses source, activity time, author email, normalized title, first issue key, and first link.
- Baseline keys include source, selected user, escaped query user, variant, date mode, exact period, granularity, and a request signature hash. Credentials and sensitive headers are never part of the signature.
- Comparisons distinguish first observation, equal, improved, count regression, missing known issue keys, missing known entries, and mixed regression.
- Improved observations merge new issue keys and entry fingerprints into the best-known baseline. Suspicious observations retain low-confidence diagnostics but cannot remove or replace known baseline data.
- A suspicious standard result can trigger at most two retries. A recovered retry becomes the accepted result; an unresolved regression is labeled `result_incomplete_candidate` and does not overwrite the baseline.
- Manual URL Replay and Advanced Diagnostics remain outside automatic Baseline Guard retry behavior.
- Debug Folders include the latest baseline comparison, snapshot, history, all session comparisons, summary metadata, and `activity_stream_baseline_guard` timeline events.
- The baseline is a local data-quality guard, not a claim that Activity Stream is a complete Jira audit log. Monthly rollup baselines remain a follow-up; v0.2.16 implements exact-range baselines only.

### Date Semantics And MaxResults Diagnostics

- Probe Max Results accepts a custom integer from 1 through 65535, defaults to 50, and provides quick values for 10, 20, 50, 100, 200, 500, and 1000.
- Values above 500 show a large-query warning. Values above 2000 require typing `CONFIRM`; values above 10000 also warn about timeout, UI responsiveness, and Jira server load.
- Date Query Mode can omit server date parameters, test `startDate/endDate`, test repeated `streams=update-date AFTER/BEFORE` parameters, or compare both methods. UI end dates are inclusive and server comparisons use an Asia/Taipei end-exclusive timestamp.
- Every returned entry is checked again against the requested date range. The diagnostics show server-returned, inside-range, outside-range, newest/oldest, and client-filtered counts without deleting the sanitized raw result.
- A single response shorter than requested does not prove a Jira server cap. Cap diagnostics become `likely` only when a larger follow-up request stops at the same non-zero Atom count.
- Exports include `dateSemantics`, `dateQueryResults`, `maxResultsDiagnostics`, cap-test history, and at most 200 `clientDateFilteredEntriesSanitized` entries. No token, Authorization header, cookie, session, Jira write, database write, or attachment body is added.

## Electron Security

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer does not receive direct Node.js API access
- production loads `dist/index.html`
- development loads the local Vite dev server only for the Electron window
