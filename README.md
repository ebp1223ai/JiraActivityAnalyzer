# Jira Activity Analyzer

First desktop UI prototype for Jira Activity Analyzer / Activity Builder.

This is an Electron desktop app shell with a React renderer. The first version is a static UI prototype with one read-only Jira Probe diagnostics page. Import, database writes, token storage, backup restore, and export behavior are not implemented.

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

## Jira Probe

`Jira 測試 / Jira Probe` is a read-only diagnostics page for checking whether one issue can provide enough Jira data to build activity events later.

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
