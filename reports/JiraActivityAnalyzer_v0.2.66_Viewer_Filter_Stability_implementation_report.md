# Jira Activity Analyzer v0.2.66 Viewer Filter Stability 實作報告

## 結論

- Target Version: `0.2.66`
- Overall Status: `Partial`
- 起始 Source Commit: `06076b3144f4bb53bc5e6acdd96274d09233a4d2`
- 最終 Source Commit: `8ae32a155a604198ace6f702c17af8aa06a38181`
- Branch: `feat/v0.2.66-viewer-filter-stability`
- Production implementation: `Completed`
- Automated validation: `Passed`
- Large synthetic SQLite stability: `Passed`
- Build / Dist / Package audit: `Passed`
- Short packaged startup smoke: `Passed`
- Real SQLite validation: `Not Run`
- Full Windows GUI validation: `Not Run`
- Push / Tag / PR / Release: `Not Run`

## 06076b Audit

`06076b...` 已實作 `Hide Before unavailable` 的 UI、SQL predicate、Preferences 與 session state，但 production database viewer IPC 仍直接在 Electron main process 執行同步 `DatabaseSync` 查詢。它沒有 dedicated worker、bounded coordinator、latest-pending queue、timeout/crash recovery 或 packaged worker output，因此不足以通過 large-dataset stability gate。

## Production Implementation

- 新增 `electron/databaseViewerWorker.ts`：在 dedicated `worker_threads` worker 執行既有 viewer query，production connection 使用 `readOnly: true` 與 `PRAGMA query_only=ON`。
- 新增 `electron/databaseViewerCoordinator.ts`：每個 lane 最多一個 active 與一個 latest pending request；舊 pending 以 `VIEWER_REQUEST_SUPERSEDED` 結束。
- timeout、worker error/exit 與 DB path switch 均會終止並重建 worker；舊 DB request 不得污染新 DB response。
- `electron/main.ts` 的 viewer IPC 全部改由 coordinator 非同步派送，不再直接執行同步 SQLite viewer operation。
- `scripts/build-electron.cjs` 產出 `dist-electron/database-viewer-worker.cjs`，並由 packaged main 以 `path.join(__dirname, "database-viewer-worker.cjs")` 解析。
- event query cache 改為 LRU，限制 32 entries 與 8 MiB，並維護過期 entry byte accounting。
- Server-side count/filter/sort/pagination、schema v3、既有 writer path 與 canonical diff predicate 均未改寫。

## Root Cause 與資料影響

大量 viewer query 原先會在 Electron main event loop 內同步執行，造成 UI hang、IPC 堆積與 request completion 順序不可靠。修正後資料流為 Renderer -> typed IPC -> bounded coordinator -> read-only worker -> compact page DTO；page size 上限維持 100。

本次沒有 migration、DDL、index 或 writer lifecycle 變更。synthetic DB 測試前後 schema/logical digest 一致，DML/DDL 由 production worker 拒絕。

## Automated Validation

| Gate | 結果 | 摘要 |
|---|---|---|
| `npm.cmd run typecheck` | Passed | exit 0，約 7.9 秒 |
| `npm.cmd run test:v0.2.66` | Passed | exit 0，約 12.4 秒 |
| v0.2.65 / .63 / .62 / .61 / .60 / .59 / .58 | Passed | 全部 exit 0 |
| `npm.cmd run test:integration` | Passed | exit 0 |
| `npm.cmd run build` | Passed | exit 0，約 18.4 秒；只有既有 Vite chunk warning |
| `git diff --check` | Passed | 無 whitespace error |
| Source diff sensitive scan | Passed | 未發現 credential/raw data |

## Large Synthetic SQLite Stability

- Fixture: schema v3 temporary SQLite，20,000 events、100 users、20 issues。
- 使用實際 `dist-electron/database-viewer-worker.cjs`，不是 source-text mock。
- 30 次 rapid requests 後只保留 latest pending；觀測上限 active=1、pending=1。
- Query latency: P50 `182.297 ms`、P95 `293.271 ms`、max `302.127 ms`。
- Page size max `100`；最大觀測 payload `155,592 bytes`。
- Cache: 32 entries、4,999,988 bytes；限制 32 entries / 8,388,608 bytes。
- Heartbeat observation: `18`。
- RSS: 91,328,512 -> 289,521,664 bytes；heap used: 32,944,696 -> 26,534,304 bytes。
- timeout recovery、crash recovery、DB switch invalidation、DML/DDL rejection 均通過。

## Packaging

隔離 worktree：`F:\AI\JiraActivityAnalyzer-v0.2.66-dist-20260806-160705`

`npm.cmd ci`、`npm.cmd run build`、`npm.cmd run dist` 均成功。Build Info 為 version `0.2.66`、build time `2026/08/06 16:08:46`、`packagedSourceCommit=8ae32a155a604198ace6f702c17af8aa06a38181`、dirty state `false`。

## 限制

短版 packaged smoke 驗證 Electron main 與 renderer 從 ASAR 啟動、renderer boot、Dashboard/Database route transition，並維持 12 秒無 crash。ASAR 內 worker path 已確認存在；production worker runtime correctness 由 bundled worker synthetic test 驗證。未執行完整 packaged UI smoke、真實 SQLite 或人工 Windows GUI 操作，因此 Overall Status 必須維持 `Partial`，不建立 v0.2.66 tag。
