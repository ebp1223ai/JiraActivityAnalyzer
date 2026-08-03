# Jira Activity Analyzer v0.2.57 Full Fetch Identity Lifecycle 與 Idempotent Save 修復實作報告

## 結果摘要

- 目標版本：`0.2.57`
- SQLite schema / Event Identity Policy：v3（未變更）
- Packaged source commit：`a4485b1ffa4368d406f06ea0acfbbde6778e2d71`
- 自動驗證、Windows 封裝、package audit、短離線 packaged smoke：通過
- 整體交付狀態：`Partial`
- 真實 Jira、真實 SQLite 首次儲存與重複儲存、完整 GUI、Installer 安裝/移除：`Pending User`
- Git tag：未建立

## 根本原因與重現路徑

v0.2.56 已建立 main-process registry，但 renderer 的 queue/preflight effect 與 queue transition 仍呼叫 Full Fetch preflight；main preflight 每次都建立並註冊 attempt，再把新的空 attempt ID 寫回 renderer。使用者離開再回到 Data Collection、重新 hydrate 或 queue 狀態變動時，最新 attempt 會取代真正完成結果的 identity。

Save 與 Debug Folder 又從多個可變欄位拼接 `attemptId`、Timeline Run、Full Fetch Run 與 staging ID，因此可能把不同生命週期的值組成同一請求。Save 在 SQLite commit 前便把 attempt 標成 `saved`，重複點擊也會再次執行 JSON 與 SQLite 路徑。Debug Folder 的 database evidence 則取自 process-wide latest write，不保證屬於 requested result。

## 修正後狀態模型

1. `draft / preflight`：只檢查 eligibility 與 queue，不建立 executable attempt。
2. `active attempt`：僅在使用者按下 Run 且所有 gate 通過後建立。
3. `completed result`：固定保存 `attemptId`、`selectedTimelineRunId`、`fullFetchRunId`、`stagingId` 四元 identity；後續 blocked、partial、failed、cancelled attempt 不得覆蓋。
4. `saved result`：僅在 JSON evidence、SQLite commit、readback verification 與 foreign-key verification 全部成功後轉為 saved。

Renderer 將 completed tuple 存入 session/workflow snapshot，Save 與 Debug Folder 都直接傳遞該 tuple。Main process 以 `FullFetchRunRegistry` 驗證完整 identity，不使用 historical/latest staging fallback。

## Idempotent Save 契約

- 第一次 eligible Save：執行 JSON export 與正式 SQLite transaction，成功後保存 operation/file/database evidence 並轉為 `saved`。
- 第二次相同 tuple：`resolveSaveRequest` 回傳 `already_saved`；IPC 回傳 `ALREADY_SAVED` 與第一次 evidence，不啟動第二次 JSON export 或 SQLite transaction。
- DB write、readback 或 FK check 任一失敗：不得標成 saved，仍可在修正原因後重試。
- identity mismatch、stale staging、Partial、Failed、Cancelled 或 reconciliation 不完整：fail closed。

## Debug Folder 一致性

Debug Folder 先解析 requested completed tuple，再從同一 `FullFetchRunRecord.saveEvidence.databaseWrite` 產生 `source-archive-database-write.json`、run reconciliation 與 database projection。它不再使用 global latest database write，因此 navigation 或另一個 attempt 不會污染證據。Source Archive 若未獨立執行仍維持 truthful `not_run`，Full Fetch Save evidence 以 `operationType=full_fetch_save` 與 matching run identity 呈現。

## 主要修改檔案

- `electron/fullFetchRunRegistry.ts`：save evidence、ready/already-saved resolver、commit verification。
- `electron/main.ts`：pure preflight、post-gate attempt creation、terminal identity、idempotent Save、run-scoped Debug evidence。
- `electron/fullFetchStaging.ts`：區分 JSON save 與 database save action。
- `src/state/SessionStateContext.tsx`、`src/routes/AnalysisPage.tsx`：completed identity persistence 與生命週期分離。
- `src/types/electron.d.ts`：IPC contract 更新。
- `tests/v0257FullFetchIdentityLifecycle.test.ts`、`scripts/test-v0257.cjs`：56 項 synthetic focused checks。
- v0.2.55/v0.2.56 regression：更新至 pure preflight 與 idempotent save 契約。
- `VERSION`、package metadata、README、CHANGELOG：同步 0.2.57。

## 驗證結果

| 指令 / 驗證 | 結果 | Exit code | 耗時 |
|---|---:|---:|---:|
| `npm.cmd run typecheck` | 通過 | 0 | 7.216 秒 |
| `npm.cmd run test:v0.2.57` | 通過 | 0 | 1.840 秒 |
| `npm.cmd run build` | 通過 | 0 | 17.340 秒 |
| `git diff --check` | 通過（修正 1 行 trailing whitespace 後） | 0 | < 1 秒 |
| staged sensitive-value scan | 通過 | 0 | < 1 秒 |
| clean worktree `npm.cmd run dist` | 通過 | 0 | 82.275 秒 |
| `npm.cmd run audit:package-size` | 通過；unexpected count 0 | 0 | 2.0 秒 |
| win-unpacked 短離線 smoke | 6 秒後 4 個 tracked process 存活 | 0 | 8.421 秒 |
| Portable 短離線 smoke | 6 秒後 5 個 tracked process、1 個 App window 存活 | 0 | 8.633 秒 |
| ASAR / artifact security audit | 通過 | 0 | < 1 秒 |

`test:v0.2.57` 為 56/56，並串接 v0.2.56 24/24、v0.2.41、v0.2.53 與 v0.2.55 39/39 regressions。測試全部使用 synthetic identity、temporary staging 與記憶體 registry，未連線 Jira、未讀寫使用者 DB。

## 封裝產物

| 產物 | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| `release/Jira Activity Analyzer Setup 0.2.57.exe` | 105,365,260 | 100.484 | `33dc087ef61e3d1210547d036f59c7d7026ce1dd1fa810b7a8a858227b93be8f` |
| `release/Jira Activity Analyzer Portable 0.2.57.exe` | 105,135,199 | 100.265 | `7e18b35990a3059e1d9ca6c2d96877625f434c67a32f57474c22418e5b82ffa1` |
| `release/win-unpacked/resources/app.asar` | 15,890,902 | 15.155 | `c31e32ecc386cf3821e11ff0bd4943339a98e66e52b5405ce147981679af2bc6` |

Build Info：app version `0.2.57`、packaged source commit `a4485b1ffa4368d406f06ea0acfbbde6778e2d71`、build time `2026-08-03T07:46:36.436Z`、branch `feat/v0.2.53-single-full-fetch-content-diff`、dirty state `false`。

Package size audit：win-unpacked 372.116 MiB、resources 15.257 MiB、packed node modules 12.946 MiB、`app.asar.unpacked` 不存在、unexpected count 0。electron-builder 的 transitive dependency path warning 為非致命訊息，dist exit 0 且 ASAR/smoke 均通過。

## 安全與工作區保護

- ASAR 共 2,076 entries，未發現 `.env`、`token.txt`、DB/SQLite、Debug Folder、Full Fetch staging、Source Archive 或 native `.node`。
- 未新增外部 SQLite native dependency，schema 與 event identity 都維持 v3。
- Jira access 未變更，仍為 read-only。
- 主 `release/.env` 與 runtime data 未讀取、未覆寫、未複製到 clean package。
- 原有 v0.2.47 tracked report 修改、PDF、UI 參考資料、歷史 prompt 與 `token.txt` 均未加入 commit。
- 既有 v0.2.56 `win-unpacked` 已保留為 `release/win-unpacked-v0.2.56`。

## 未執行與剩餘風險

未執行真實 Jira Full Fetch、真實 SQLite 首次 Save、真實重複 Save count invariance、完整 navigation GUI、Debug Folder 真實資料核對、Installer 安裝/移除與長時間多尺寸 UI smoke。本版不建立 tag，維持人工驗證候選，Overall Status 為 `Partial`。v0.2.58 的 Excel 編輯、Select All Filtered Results、Description Diff 與 Comments 版本功能均未實作。