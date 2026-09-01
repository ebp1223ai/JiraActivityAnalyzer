# Jira Activity Analyzer v0.3.38 Test Report

## Harness Analysis

原始首要錯誤為 `window.desktopApp.connections.testAndSave is not a function`。正式 preload 從 v0.2.37 起已移除此 save-capable API，只允許 `connections.list()` 與 read-only `connections.test()`；契約測試也明確禁止舊方法。首例外發生於 route navigation 前，因此舊 log 中全尺寸 route/sidebar/debug failures 為 cascade，不是 11 個頁面同時 regression。

修正後保留 `ELECTRON_UI_LEGACY_DEEP=1` 作歷史證據入口，預設 smoke 對齊現行 Bridge 與 DOM contract。production Bridge、IPC validation、context isolation、`nodeAccess=false` 與 source-server identity gate 均未修改。

## 本輪結果

| Command / audit | Result | Exit | Elapsed |
|---|---|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 10.590 s |
| `npm.cmd run test:v0.3.38` | PASS | 0 | 2.657 s |
| `npm.cmd run build` | PASS | 0 | 27.858 s |
| current-contract renderer UI smoke | PASS | 0 | 32.385 s |
| authorized dirty-worktree `npm.cmd run dist` | PASS | 0 | 243.600 s |
| win-unpacked packaged UI smoke | PASS | 0 | 30.829 s |
| Portable smoke at release APP_ROOT | EXPECTATION MISMATCH | 1 | 156.873 s |
| Portable smoke with isolated APP_ROOT | PASS | 0 | 45.632 s |
| `git diff --check` | PASS | 0 | not separately timed |

非隔離 Portable 已完整走完 11 routes，唯一失敗是正式 APP_ROOT 規則讀到 `release/.env` 與既有 DB，使 offline fixture expectation 不成立。將同一 Portable artifact 複製到 ignored 隔離目錄後通過；測試副本已刪除。

## 舊失敗證據摘要

`test:ui:legacy-deep` 仍保留 v0.2.4x 歷史互動檢查。舊 log 包含 Stability Probe、Benchmark cancellation、舊 workflow step、舊 Debug Folder modal、queue confirmation 等已過期 selectors／期待；這些版本各有獨立 regression scripts，不再作 v0.3.38 全頁啟動 smoke 的 pass gate。

## Warnings

- Vite：既有 `node:crypto` browser externalization。
- Vite：renderer chunk 超過 500 kB。
- electron-builder：duplicate dependency references、default Electron icon。
- `dirtyState=true` 僅因保留使用者既有 v0.2.47 tracked report 修改。
