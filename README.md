# Jira Activity Analyzer

Electron desktop application for read-only Jira activity inspection and analysis.

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

User Analysis Full Fetch is a sequential, read-only Jira operation. Version 0.2.3 adds runtime diagnostics intended for larger queues:

- An auto log is created immediately under `<runtime>/logs/full-fetch/` and appended throughout the run.
- An atomic checkpoint JSON records the current issue, last completed issue, counts, timing, memory, and per-issue status.
- The UI shows total/current progress, success/failed/skipped counts, elapsed time, average time, ETA, batch progress, and Node process memory snapshots.
- Batch Size supports 10, 20, 40, or All; the default is 10.
- Raw Data Mode supports Summary Only, Auto-save Raw per Issue, and Full Raw in Memory. Auto-save Raw per Issue is the default and writes sanitized issue files under `<runtime>/exports/raw-data/full-fetch-run-*/issues/`.
- Auto-save and Summary Only keep full raw Jira responses out of renderer session memory. Full Raw in Memory is intended only for small queues and displays additional warnings.
- Queues over 10 issues display a warning; queues over 40 require typing `CONFIRM` before requests begin.
- Pause After Current Issue lets the active Jira request finish, writes a paused checkpoint, and does not start the next issue. Resume is not implemented in this version.
- On the next visit to User Analysis, the newest unfinished checkpoint is shown with its current/last issue and diagnostic paths.
- Main/renderer/child process failures and unresponsive windows write masked diagnostics under `<runtime>/logs/crash/`.

Runtime logs, checkpoints, raw diagnostic files, exports, databases, and release artifacts are ignored by Git. Full Fetch does not write Jira, does not write a database, and does not download attachment bodies.

## Large Queue Confirmation and User Actions

Version 0.2.4 replaces the browser prompt used for Full Fetch queues over 40 issues with an in-app bilingual confirmation dialog. The Run Full Fetch button remains available for large queues; the user must type `CONFIRM` before the renderer invokes the Full Fetch IPC. Cancelling or submitting a non-matching value does not create a Full Fetch run, auto log, or checkpoint.

User Analysis records important interactions with these diagnostic categories:

- `[USER_ACTION]` for workflow tabs, search controls, queue selection, Full Fetch, reports, exports, Help, and Debug Log controls.
- `[GUARD]` when an action is blocked or confirmation is rejected/cancelled.
- `[UI_MODAL]` when the large-queue dialog opens or closes.

These records appear in the UI Debug Log and `<runtime>/logs/app/app-YYYYMMDD.log`. While a Full Fetch run is active, subsequent related actions are also appended to its auto log. Confirmation input is never logged verbatim; diagnostics record only `confirmInputMatched=true/false`. Sensitive-value masking remains active for UI, app, Full Fetch, export, and crash logs.

Version 0.2.5 additionally preserves the complete action timeline in `<runtime>/logs/app/user-actions-YYYYMMDD.log`. This append-only daily file contains `USER_ACTION`, `GUARD`, `UI_MODAL`, and directly related lifecycle entries without Full Fetch per-issue progress noise, so it is not affected by the UI Debug Log's recent 160-line buffer.

- User Analysis > Exports displays the current action log path and provides Open Action Log Folder and Copy Action Log Path controls.
- Save Debug Log still exports the timestamped, masked UI buffer and now appends the complete daily action timeline plus its source path.
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

## Export Result / Raw Data

Runtime export files are written under `<runtime>/exports/`. The app creates these common folders:

```text
<runtime>/exports/
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

- Save Analysis Result: writes `<runtime>/exports/jira-analysis/jira-analysis-{issueKey}-YYYYMMDD_HHmmss.json`.
- Save Raw Data: writes `<runtime>/exports/raw-data/jira-analysis-raw-{issueKey}-YYYYMMDD_HHmmss.json`.
- Save Debug Bundle: writes `<runtime>/exports/debug-bundles/jira-analysis-debug-bundle-{issueKey}-YYYYMMDD_HHmmss.json`.

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

Runtime files live beside the executable in packaged builds, and under the project root in development. The app creates and uses this layout:

```text
<runtime>/
  .env
  data/
  logs/
  exports/
  exports/jira-probe/
  exports/raw-data/
  backups/
  config/
  data/
```

Connections and Jira Probe load the current env path recorded in `<runtime>/config/app-config.json`. If no custom env path is configured, the app falls back to `<runtime>/.env`. If that file is missing, Reload Env creates a safe template automatically and logs the created path. Choose Env File accepts `.env` / `*.env`, stores only the selected path in app-config, and reloads it on the next launch. The app does not create a real database or backup in this UI prototype.

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
- Debug Log Copy, Download, and Clear operate on the current in-memory log state. Download uses a preload IPC save dialog in Electron.
- Connections is `.env` only. The page displays Current Env Path, supports Reload Env, Choose Env File, and Test Connection, and does not write connection records or `connections.json`.
- Jira Probe uses a fixed Standard read-only issue analysis scope.
- Data Inspector tabs show sanitized read-only probe data for overview, issue fields, description, changelog, comments, attachments, links, users, activity estimates, raw JSON, and manual compare.
- Data Inspector supports in-page search and simple data filters. It is UI-only and does not write files or database records.
- Save Probe Result writes sanitized JSON to `<runtime>/exports/jira-probe/`.
- Save Raw Data writes sanitized raw API response JSON to `<runtime>/exports/raw-data/`.
- Debug Log Download opens an Electron save dialog defaulting to `<runtime>/logs/`.
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

### Run Stability And Parsed Entry Diagnostics

- Every automatic, precision, and manual Activity Stream run receives a unique `asrun-...` ID. Each variant and parsed entry carries that same ID.
- While a run is active, all Activity Stream entry points are disabled. A result can update renderer state only when its run ID still matches the latest run; stale results are ignored and logged.
- Starting a run clears the visible current result, variants, parsed entries, issue-key sets, manual result, and parser diagnostics. The last successful result and five most recent run summaries remain available separately.
- Parser diagnostics count an Atom entry as parsed when it has usable activity fields. A missing Jira issue key is diagnostic information, not a skipped entry or parser failure. Confluence-only feeds can therefore report `parsed_confluence_only` with zero Jira keys and no parser anomaly.
- Parsed Entries can be filtered without changing the original sanitized entries by activity type, partial Jira key, key presence, date range, query variant, source, and author. The table paginates at 10, 20, 40, 80, or 160 rows (default 40), resets to page 1 after filter changes, and exposes sanitized expandable details and Copy Entry JSON.
- Precision Probe exports retain the complete sanitized current entries, current filter state and statistics, `activityEntryStats`, `parsedEntriesTableState`, and at most 200 filtered entries. They also include run history and parser diagnostics, but never tokens, Authorization headers, cookies, sessions, full XML, or HTML login pages.

### Run Auto-Save And Debug Bundles

- Successful and partial Activity Stream, Precision Probe, Manual URL Replay, and MaxResults Cap Test runs are automatically saved as sanitized JSON under `<runtime>/exports/user-analysis/` in their corresponding `activity-stream-runs`, `precision-probe-runs`, `manual-url-replay-runs`, and `maxresults-cap-tests` folders.
- Last Auto-Saved Result shows the path, save time, run ID, result type, and status, with Open Folder and Copy Path actions.
- Save Debug Log creates an app-scoped folder under `<runtime>/exports/debug-bundles/`. It includes the sanitized debug log, user action log, app metadata, request context, latest result, run histories, auto-saved result paths, available latest probe results, and `README_for_GPT.txt`.
- Debug bundles exclude `.env`, tokens, Authorization headers, cookies, session identifiers, raw login HTML, and database data. The bundle metadata lists unavailable result files and the remaining cross-page auto-save/debug-bundle integration checklist.
- Cross-page integration remains a documented follow-up for Jira Probe, Jira Analysis, Candidate Discovery, Full Fetch, and Connections/Data Source tests; v0.2.12 does not silently claim those flows are auto-saved.

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
