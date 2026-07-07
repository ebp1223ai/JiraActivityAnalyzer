# Jira Activity Analyzer

First desktop UI prototype for Jira Activity Analyzer / Activity Builder.

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

- Copy Analysis Summary: copies a token-safe text summary for GPT / Codex troubleshooting.
- Save Analysis Result: writes `<runtime>/exports/jira-analysis/jira-analysis-{issueKey}-YYYYMMDD_HHmmss.json`.
- Save Raw Data: writes `<runtime>/exports/raw-data/jira-analysis-raw-{issueKey}-YYYYMMDD_HHmmss.json`.
- Save Debug Bundle: writes `<runtime>/exports/debug-bundles/jira-analysis-debug-bundle-{issueKey}-YYYYMMDD_HHmmss.json`.

Save buttons are disabled until a Jira Analysis issue is successfully loaded. Exported JSON is created by Electron main process IPC and is sanitized before writing.

Exported Jira Analysis result JSON includes app version, build time, git commit, git branch, exported time, read-only source metadata, issue summary, analysis summary, lifecycle, participants, status transitions, field changes, comments, attachments metadata, linked issues, risk hints, and activity timeline.

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

## Electron Security

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer does not receive direct Node.js API access
- production loads `dist/index.html`
- development loads the local Vite dev server only for the Electron window
