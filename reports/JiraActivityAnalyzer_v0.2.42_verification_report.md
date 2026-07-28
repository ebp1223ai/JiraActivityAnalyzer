# Jira Activity Analyzer v0.2.42 驗證報告

## 結論

v0.2.42 聚焦驗證通過。Stable Hash V4 的 exact registry、metric-only Existing、payload/revision/event 不變、candidate diagnostics、V3 DB read-only 與 packaged metadata 均已驗證。

## 自動化驗證

| 項目 | 指令 | 結果 |
|---|---|---|
| TypeScript | `npm.cmd run typecheck` | 通過，exit code 0 |
| V3 歷史 policy | `npm.cmd run test:v0.2.41` | 通過，exit code 0 |
| V4/DB 聚焦測試 | `npm.cmd run test:v0.2.42` | 通過，exit code 0 |
| Source Archive unit | `node scripts/test-source-archive.cjs` | 通過，exit code 0 |
| Integration harness | `npm.cmd run test:integration` | 通過，exit code 0 |
| Production build | `npm.cmd run build` | 通過，exit code 0 |
| Installer/Portable | `npm.cmd run dist` | 通過，exit code 0 |
| Diff whitespace | `git diff --check` | 通過 |
| 敏感資料掃描 | tracked v0.2.42 files | 未發現 Token、密碼、私鑰或未遮罩 Authorization |

第一次 `npm.cmd run dist` 因 Windows Node 直接 spawn `npm.cmd` 回傳 `EINVAL` 而失敗，尚未進入 Electron Builder。改由 `ComSpec` 執行後重試成功；此修正已包含於 packaged source commit。

## Stable Hash V4 測試結果

- confirmed registry：`customfield_12201`、`customfield_12401` 通過。
- 既有 Debug Time、FA Debugging Time 與 Working Days exact-name resolution 通過。
- 未註冊的 `Completely New Time` 不會因名稱含 `Time` 被排除。
- metric-only change 判定 `Existing`。
- `content_revision` 保持 1。
- compressed payload hash、保存時間與 bytes 均保持不變。
- Activity Event 筆數不增加。
- `"526.56"` 與 `526.56` 的 metric 正規化通過。
- 未註冊欄位異動會產生 candidate，且 `policyMutationPerformed=false`。
- V3 DB 相容性判定 `MIGRATION_REQUIRED`、`legacyReadOnly=true`，檢查前後檔案 SHA-256 相同。

## Build Metadata 驗證

- app version：`0.2.42`
- implementation commit：`4a90f72547759bde95a41a99c13c0b83f926d06d`
- packaged source commit：`4a90f72547759bde95a41a99c13c0b83f926d06d`
- build time：`2026/07/28 13:24:54`
- build time ISO：`2026-07-28T05:24:54.853Z`
- ASAR `package.json` version：通過
- ASAR `jaaBuildInfo.packagedSourceCommit`：通過
- Electron main bundle 內含 version 與 full commit：通過

## Artifact

| 類型 | 檔名 | Bytes | SHA-256 |
|---|---|---:|---|
| Installer | `Jira Activity Analyzer Setup 0.2.42.exe` | 106,476,865 | `331AF937CA655E770980437393D89A180520508F0A6504095FB6226053143896` |
| Portable | `Jira Activity Analyzer Portable 0.2.42.exe` | 106,246,794 | `22293A36FC3F10BA370BA3A3A07B49A56A5D44C7B5F15989A54EA2A7FF1256F8` |

Artifact 位於 `release/`，依規則不加入 Git。

## 未執行

- 44-Issue 真實 Jira smoke
- 長時間 packaged smoke
- 真實公司 Jira、Confluence、Teams 連線
- 舊 DB migration
- GitHub Release 與 binary upload

這些項目依 v0.2.42 prompt 明確排除；本次只做短版 packaged metadata verification。
