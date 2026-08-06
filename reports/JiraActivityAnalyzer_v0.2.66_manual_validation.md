# Jira Activity Analyzer v0.2.66 Manual Validation

## 驗證狀態

| 項目 | 狀態 | 說明 |
|---|---|---|
| Production implementation | Completed | Viewer query 已移至 read-only worker |
| Automated validation | Passed | typecheck、v0.2.66、回歸與 integration 全數通過 |
| Large synthetic SQLite stability | Passed | 20,000 event fixture，queue/cache/recovery/invariants 通過 |
| Build | Passed | isolated clean worktree |
| Dist | Passed | Installer、Portable、win-unpacked 已產生 |
| Package / ASAR audit | Passed | worker entry 存在，unexpected packaged content 0 |
| Short packaged startup smoke | Passed | 12 秒存活，`did-finish-load` 與 `renderer_boot` 已記錄 |
| Real SQLite validation | Not Run | 不讀取使用者 DB |
| Full Windows GUI validation | Not Run | 未做完整人工互動與視覺驗收 |
| Overall | Partial | 尚需使用者以真實但可備份的 SQLite 與 Windows GUI 驗證 |

## Manual Validation Executables

建議優先測試 Portable：

`F:\AI\JiraActivityAnalyzer-v0.2.66-dist-20260806-160705\release\Jira Activity Analyzer Portable 0.2.66.exe`

Installer：

`F:\AI\JiraActivityAnalyzer-v0.2.66-dist-20260806-160705\release\Jira Activity Analyzer Setup 0.2.66.exe`

Unpacked executable：

`F:\AI\JiraActivityAnalyzer-v0.2.66-dist-20260806-160705\release\win-unpacked\Jira Activity Analyzer.exe`

ASAR：

`F:\AI\JiraActivityAnalyzer-v0.2.66-dist-20260806-160705\release\win-unpacked\resources\app.asar`

## 建議人工步驟

1. 先備份預計測試的真實 SQLite，並用 Portable 啟動。
2. 確認 UI 顯示 Version `v0.2.66`、Build Time `2026/08/06 16:08:46`。
3. 載入大型 database，逐一操作 Database、Issue 與 User viewers 的 search、filter、sort、page 與 detail。
4. 快速連續切換 filter 與 page，確認畫面仍可操作且最後一次操作結果勝出。
5. 在三個 viewer 驗證 `Hide Before unavailable`、`Clear All Filters`、count/rows/page 一致。
6. 切換另一個 database，確認沒有上一個 DB 的 stale result。
7. 驗證 viewer 操作前後 DB schema、row counts 與資料內容不變。
8. 檢查 logs 中沒有 worker resolution、uncaught exception、unhandled rejection 或 renderer crash。

## Short Packaged Smoke Evidence

- 測試 executable：win-unpacked app。
- APP_ROOT：隔離的 `%TEMP%\jaa-v0266-packaged-smoke-51554bb3d4cf41508bf06f2e18164032`。
- 12 秒後 main process 與 3 個 Electron child processes 均存活。
- 診斷事件包含 `did-finish-load`、`renderer_boot`、route `#/` 與 `/database`。
- Session Build：version `0.2.66`、commit `8ae32a155a604198ace6f702c17af8aa06a38181`。
- 未連線 Jira、未讀取既有 `.env`、`token.txt` 或 database。

此 smoke 只代表 packaged startup 與 renderer load 成功，不等同完整 Windows GUI 驗收。
