# JiraActivityAnalyzer v0.3.22 測試與驗證報告

- Overall Status：`Partial / Manual Validation Pending`
- Package Source Commit：`9e2ad9af9084f92139ee58296133de069cc1c08d`
- Final Delivery Commit：本報告所屬 commit；由 annotated tag `v0.3.22` 解析。
- Build Version／Time：`0.3.22`／`2026/08/19 16:01:33`（Asia/Taipei）
- Build dirtyState：`true`，唯一 tracked dirty 是既有且未提交的 v0.2.47 使用者報告。

## Automated PASS

| 驗證 | 結果 | Exit code | Wall time |
|---|---:|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 12.629 s |
| `npm.cmd run test:v0.3.22` | PASS | 0 | 1.666 s |
| `npm.cmd run build` | PASS | 0 | 16.010 s |
| Package Source rebuild | PASS | 0 | 15.651 s |
| `npm.cmd run dist` | PASS | 0 | 131.892 s |
| `git diff --check` | PASS（僅 CRLF conversion warning） | 0 | recorded |
| ASAR inventory／stale bridge／sensitive filename scan | PASS | 0 | recorded |
| win-unpacked bounded launch | PASS | 0 | 4.205 s |
| isolated Portable bounded launch | PASS | 0 | 11.834 s |
| 117-record read-only fixture identity check | PASS | 0 | 3.3 s |

`test:v0.3.22` 覆蓋 Decision v3 direct array、schema／semantic validation、evidence normalization、Quality Gate、117 Event／28 Unique Issue 統計、HTML deterministic/security、SQLite PASSED/WARNING/manual acceptance/idempotency，並執行 v0.3.21 regression。

短啟動均取得 `renderer_boot`、`did-finish-load` 與首頁 `page_changed path=/`；未觀察到 `did-fail-load`、`render-process-gone`、`uncaughtException` 或 `unhandledRejection`。

## Warning

- Vite 將 `shared/descriptionDiff.ts` 的 `node:crypto` externalize，屬既有 browser compatibility warning。
- Renderer bundle 約 846 kB，Vite 顯示大於 500 kB chunk warning。
- electron-builder 使用預設 Electron icon。
- electron-builder 顯示既有 duplicate dependency references。
- `release/` 根目錄有既有 runtime `.env`、SQLite 與 Debug folders；它們不在 ASAR，未被本輪修改、刪除或提交。

## Manual Validation Pending

- 真實 Managed OAuth／ChatGPT 117-record provider execution。
- 真實 production SQLite end-to-end 與舊資料庫 migration 人工驗證。
- 全新 Windows 環境 Installer GUI 安裝／解除安裝驗證。
- 人工操作 Advanced HTML 的完整篩選、CSV 與列印 UX。

Actual token telemetry：`unavailable`，未估算。
