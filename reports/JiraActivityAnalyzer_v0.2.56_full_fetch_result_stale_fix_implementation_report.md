# Jira Activity Analyzer v0.2.56 Full Fetch Result Stale 修正實作報告

## 結果摘要

- 目標版本：`0.2.56`
- SQLite schema / Event identity：v3（未變更）
- 原始碼提交：`5195b493e780b94f4e98eb51b4114a3118200247`
- 自動驗證、Windows 封裝、短離線 packaged smoke：通過
- 整體交付狀態：`Partial`；真實 Jira、真實 SQLite、Installer 安裝/移除及完整 GUI 操作仍由使用者驗證

## 根本原因

Full Fetch pipeline 會完成 staging、reconciliation 與結果文件，但完成狀態沒有以同一筆 attempt/run identity 原子發布。Save Result 與 Debug Folder 之後依賴可變的 process-wide `latestFullFetchAttempt`、`latestFullFetchStaging`，而 staging 掃描又可能用更新時間選到另一筆歷史 run。結果是畫面上剛完成且有效的結果，儲存時卻被誤判為 `FULL_FETCH_RESULT_STALE`。

## 修正方式

新增 main-process `FullFetchRunRegistry` 作為唯一權威來源，完整保存並核對 `attemptId`、`selectedTimelineRunId`、`fullFetchRunId`、`stagingId`、terminal status、reconciliation status 與 save eligibility。

完成、Save Result 與 Debug Folder 現在都解析同一條精確 identity chain。Renderer 只傳遞 identity，不再決定哪個 staging 是最新。只有「目前 matching staging 確實不存在」才回報 `FULL_FETCH_RESULT_STALE`；identity 不一致改回報 `FULL_FETCH_IDENTITY_MISMATCH`。Partial、failed、cancelled 或尚未 reconciliation 的結果不可儲存。

## 修改範圍

- `electron/fullFetchRunRegistry.ts`：新增 authoritative run/attempt registry。
- `electron/fullFetchEligibility.ts`：補齊 attempt terminal、staging、reconciliation 與 saved 狀態。
- `electron/main.ts`：完成時原子發布、Save/Debug Folder 精確解析 matching staging。
- `electron/preload.ts`、`src/types/electron.d.ts`、`src/pages/AnalysisPage.tsx`：傳遞完整 Full Fetch identity。
- `tests/v0256FullFetchResultStaleFix.test.ts`、`scripts/test-v0256.cjs`：新增 stale、identity、eligibility 與 regression 測試。
- `VERSION`、package metadata、README 與 CHANGELOG：同步至 0.2.56。

## 驗證結果

| 指令 / 驗證 | 結果 | Exit code | 耗時 |
|---|---:|---:|---:|
| `npm.cmd run typecheck` | 通過 | 0 | 8.8 秒 |
| `npm.cmd run test:v0.2.56` | 通過 | 0 | 2.3 秒 |
| `npm.cmd run build` | 通過 | 0 | 20.8 秒 |
| `git diff --check` | 通過 | 0 | < 1 秒 |
| `npm.cmd run dist` | 通過 | 0 | 92.1 秒 |
| package-size audit | 通過 | 0 | 1.4 秒 |
| win-unpacked 短離線 smoke | renderer `did-finish-load` | 0 | 16.1 秒 |
| Portable 短離線 smoke | renderer `did-finish-load` | 0 | 12.9 秒 |

`test:v0.2.56` 覆蓋 v0.2.56 24/24 assertions，並串接 v0.2.41、v0.2.53 與 v0.2.55 regression。測試確認不存在 historical/latest staging fallback、重複儲存仍使用同一 run、缺少 matching staging 才回 stale，且不可儲存的 terminal 狀態維持封鎖。

## 封裝產物

| 產物 | Bytes | SHA-256 |
|---|---:|---|
| `release/Jira Activity Analyzer Setup 0.2.56.exe` | 105,364,476 | `25117BAADB798707C0B491AB7971A4BFBFFA3FA4BD27443851FDBDE36711435F` |
| `release/Jira Activity Analyzer Portable 0.2.56.exe` | 105,134,412 | `051395DF46D033B9FCA6F66150EDE93B893F9CCE869498BDD1B916274DDBE88D` |
| `release/win-unpacked/Jira Activity Analyzer.exe` | 235,706,368 | `50A063E93E26551A6AE9A094EEACDB0F2D7C1BA205DD671635AE189B46489FA4` |
| `release/win-unpacked/resources/app.asar` | 15,887,790 | `E1F39348C8437652053261BECD4F6A4125B00E6B0E7D291910CA00E1EC55B695` |

Build Info：app version `0.2.56`、packaged source commit `5195b493e780b94f4e98eb51b4114a3118200247`、build time `2026-08-03T05:36:52.040Z`、branch `feat/v0.2.53-single-full-fetch-content-diff`、dirty state `false`。

## 產物稽核與安全

- `app.asar` 共 2,076 entries，未發現 `.env`、Token、DB/SQLite、backup、staging、debug bundle、reports、tests 或 test-artifacts。
- 未發現外部 `.node` native module；未新增 SQLite native dependency。
- Package size audit：Installer 100.483 MiB、Portable 100.264 MiB、win-unpacked 372.113 MiB、app.asar 15.152 MiB，unexpected artifact count 為 0。
- Authenticode 為 `NotSigned`，與目前未設定 code-signing 的狀態一致。
- smoke 未截取桌面、未連線 Jira、未讀寫真實 DB。
- 主 `release/.env` 未讀取、未複製、未覆寫。

## 工作區保護與待驗證

封裝改由 detached clean worktree 執行，未使用 stash、reset、checkout 或覆蓋使用者內容。既有未提交 report、PDF、UI 參考資料夾、歷史 prompt 與 `token.txt` 均未讀取、修改、移動、刪除或加入提交。

clean worktree 透過主工作樹 `node_modules` junction 封裝時，electron-builder 對部分 transitive dependency 顯示 path lookup warning；封裝仍 exit 0，renderer bundle、artifact audit 與兩項 packaged smoke 均通過。

尚未執行 Installer 安裝/移除、完整 GUI 手動操作、真實 Jira Full Fetch、真實 SQLite Save Result 與 Debug Folder 實際資料檢查。本版不建立 Git tag；release 維持人工驗證候選狀態。
