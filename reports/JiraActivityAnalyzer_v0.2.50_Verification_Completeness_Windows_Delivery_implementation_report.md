# Jira Activity Analyzer v0.2.50 實作報告

## 版本結果

- Target Version：`0.2.50`
- Theme：Verification, Completeness and Windows Delivery
- Overall Status：**Partial**
- Build Version：`0.2.50`
- Build Time：`2026/07/30 16:36:56`（Asia/Taipei）
- Packaged Source Commit：`180fe906de551773f980a32e01b4f65ba0ba2b78`
- Baseline：`59f6fc40583c4c9f4e04571dd98f0c829a7b4ca0`
- Branch：`feat/v0.2.50-verification-completeness-windows-delivery`
- SQLite Schema：Current-State v2，未變更

因未取得核准且去識別化的真實 XML／大型 SQLite，也未執行完整 Windows 人工 GUI 驗收，依規格必須維持 Partial。自動測試、Windows 封裝與短時間離線 Packaged Smoke 已完成，但不能取代真實資料與人工 Gate。

## Requirement 結果

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R04 | v0.2.49 完整性稽核 | Partial | `docs/v0.2.50-table-verification-matrix.md`；operational SQLite tables 已驗證，payload/workflow/static tables 保留分類與缺口 |
| R05 | IME／Filter／非同步穩定性 | Completed automated | production IME reducer、primitive debounce、route cleanup、latest-request diagnostics；`test:v0.2.50` |
| R06 | Activity Events Filter Contract | Completed automated | temporary SQLite 的 Actor／Action／Before／After／Diff、count/rows、同欄 OR 與跨欄 AND |
| R07 | Columns／Resize／Popover／Preference v2 | Partial | `SqliteDataTable` 支援欄位、resize、reset 與 query-state persistence；payload/static tables 尚未全面遷移 |
| R08 | Before／After／Diff 正確性 | Partial | schema-v2 persisted values 與共用 normalizer 以 synthetic provenance 驗證；真實 Changelog 比對 Not Run |
| R09 | Pagination／Sorting／完整結果 | Completed automated（operational SQLite tables） | 30-row fixture、25-row pages、stable tie-breaker、無重複 ID、count/rows 共用 WHERE |
| R10 | Diagnostics／Debug Folder／Error-free Gate | Partial | lifecycle diagnostics 與 writer state 自動驗證；兩次 packaged session `writerFailed:false`，未見 renderer fatal/error boundary 訊號；完整人工 Gate Not Run |
| R11 | Shell-first／復原 | Partial | 既有 phased runtime 與短版 packaged DOM smoke 通過；三次 cold-start 人工計時 Not Run |
| R12 | 指定真實資料 | Not Run | 無核准的去識別 COPGEN fixture，且未連公司 Jira／Confluence |
| R13 | 自動測試／人工驗收 | Partial | 聚焦及回歸測試通過；人工 checklist 已提供但未執行 |
| R14 | Windows Packaging／Artifacts | Completed automated | Installer、Portable、versioned win-unpacked、ASAR、size/hash/security audit 與 app-only smoke |

## 根因與主要修改

1. v0.2.49 的 IME handling 內嵌於元件，難以證明 composition/query 行為；新增 `src/utils/imeFilterState.ts`，composition 結束前不提交正式 query。
2. Rich Content 轉純文字沒有明確深度、節點與長度上限；HTML、ADF、Jira Wiki canonical text 現在有 deterministic safety bounds，並移除 script／iframe。
3. Preference v2 原本只保存 columns 與 page size；現在依 `pageId + tableId` 保存並 normalize page index、sort、filters、widths，支援 legacy／null／corrupt input。
4. Windows preference atomic rename 在覆蓋既有檔案時可能失敗；新增 `EEXIST`／`EPERM`／`EACCES` copy fallback 與 temp cleanup。
5. Viewer table requests 未全面記錄 terminal state；Issue snapshot/activity、User list/related/all activity 現在記錄 started/completed/stale/aborted/failed。
6. Unsupported filter field 的錯誤格式不一致；統一為 `FILTER_UNSUPPORTED_FIELD:<field>`，UI column/filter ID 經明確 mapping 後才進 SQLite allowlist。
7. Electron package 內曾包含第三方 dependency 文件；builder 排除 dependency docs/test/example/Markdown 後，最終 unexpected documentation count 為 0。

## Runtime Data Flow

`SqliteDataTable column.queryField` → renderer `ViewerTableQuery` → preload `databaseViewer` IPC → main allowlist → SQLite parameterized WHERE → count 與 rows 共用條件 → renderer request identity check → safe diagnostics → table-local result。

Operational Activity Events 不使用 current-page client-side filtering；同一欄位多選採 OR，不同欄位採 AND。重要 Before／After 來自 persisted `from_value_json`／`to_value_json`，不根據相鄰事件推測。

## Schema／DB Impact

- Current-State schema 保持 v2。
- 無 migration、無 DB rewrite、無正式資料庫寫入。
- Changelog／Activity Events 共用 normalized change model 與 provenance。
- Payload-backed Changelog／Comments 仍列為明確限制，未以 UI 假資料宣稱完成。

## 測試與建置

| Command | Result | Duration | Evidence |
|---|---|---:|---|
| `npm.cmd run typecheck` | Passed | 10.4s | renderer／Electron TypeScript |
| `npm.cmd run test:v0.2.50` attempt 1 | Failed（有效發現） | 1.8s | 發現舊錯誤字串 `FILTER_UNSUPPORTED_FIELDS` |
| `npm.cmd run test:v0.2.50` attempt 2 | Passed | 1.6s | production utilities、preferences、diagnostics、temporary SQLite |
| `npm.cmd run test:v0.2.49` | Passed | 2.5s | 前版回歸 |
| `npm.cmd run test:integration` attempt 1 | Failed（舊 source-shape assertion） | 1.2s | 舊測試仍期待 `setTimeout` startup shape |
| `npm.cmd run test:integration` attempt 2 | Passed | 1.1s | 驗證 `did-finish-load` → post-renderer startup |
| `npm.cmd run test:v0.2.48` | Passed | 1.9s | DB loading／Viewer 回歸 |
| `npm.cmd run build` | Passed | 17.4s | version check、typecheck、Vite、Electron main/preload；僅有既有 >500kB chunk warning |
| `npm.cmd run dist` attempt 1 | Passed，後續稽核發現第三方 docs | 95.3s | clean detached packaging worktree，source `63d20aa...` |
| `npm.cmd run dist` attempt 2 | Passed | 73.2s | 排除 dependency docs 後，source `180fe906...` |
| Packaged smoke attempt 1 | Failed（測試 harness） | 8.4s | CDP event 先於 response，舊腳本誤取訊息；App process 已清除 |
| Packaged smoke attempt 2 | Passed | 17.3s | Portable renderer root、Sidebar 9 nav、Debug Log、Version、Build Time，並 app-only capture |

未執行耗時完整多尺寸 Smoke；符合本版禁止長測的限制。

## Windows Artifacts

| Artifact | 完整路徑 | Bytes | MiB | SHA-256 | Version |
|---|---|---:|---:|---|---|
| Installer | `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Setup 0.2.50.exe` | 106261315 | 101.339 | `99f09712965ac3616a419e23dc71bb635bbf2a41db62a9f1188c6ee9425b3a61` | File/Product `0.2.50` |
| Portable | `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Portable 0.2.50.exe` | 106031236 | 101.119 | `9624395b5acd30965ccc5404397d24ec8a9cfd74c90db16ec010ed4e5bc63d66` | File/Product `0.2.50` |
| Unpacked EXE | `F:\AI\JiraActivityAnalyzer\release\win-unpacked-v0.2.50\Jira Activity Analyzer.exe` | 235706368 | 224.787 | `5172c1aa44dc9cfb7a0323bafe5b15b12796f413e26cc934636e0e24f4fbfaf8` | File `0.2.50`／Product `0.2.50.0` |
| app.asar | `F:\AI\JiraActivityAnalyzer\release\win-unpacked-v0.2.50\resources\app.asar` | 24093996 | 22.978 | `fb564eb51726faf4adc6204c3f1ae1dc9ac5645675b7e16567090646aa8a5f40` | packaged source `180fe906...` |
| app.asar.unpacked | 不存在 | 0 | 0 | — | 不適用 |

- `win-unpacked-v0.2.50`：398395005 bytes（379.939 MiB）。
- `resources`：24201516 bytes（23.080 MiB）。
- Build Info：appVersion `0.2.50`、Build Time `2026/07/30 16:36:56`、packagedSourceCommit `180fe906...`。
- Portable 啟動：Passed；Hash `#/database`，DOM body 873 chars，root 1 child，Sidebar 存在，9 個 nav items，Debug Log／Build Time 存在。
- App-only screenshot：`F:\AI\JiraActivityAnalyzer\test-artifacts\screenshots\v0.2.50\portable-dashboard.png`（85162 bytes）；由 Electron CDP `Page.captureScreenshot` 產生，不擷取桌面或其他視窗。
- Containment：session summary 的 `appRoot` 為 Portable 所在的暫存 release 目錄；runtime output 只建立在該目錄。未連真實 Jira。
- Installer：已產生並完成版本/hash 靜態驗證；互動安裝流程未人工執行。
- 詳細前 50 大檔、前 20 大目錄：`reports/JiraActivityAnalyzer_v0.2.50_package_size_audit.md`。

## Error-free Gate

短版 packaged sessions：

- `writerFailed = false`
- `local_error_boundary`：未觀察到
- `window.error`：未觀察到
- `unhandledrejection`：未觀察到
- `render-process-gone`／`did-fail-load`／fatal：未觀察到

此證據只覆蓋短時間 Dashboard/Database renderer smoke，不代表完整人工七頁與真實資料操作 Gate。

## Security

- Staged source scan：private key 0、literal Authorization credential 0、`.env` secret 0、真實 DB 0。
- Final ASAR：4681 entries；精確敏感 payload filename match 0。
- ASAR 未包含 `.env`、`token.txt`、SQLite、Full Fetch／Source Archive、Debug Folder、backup、XML、private key。
- Portable smoke 在暫存輸出目錄建立的 runtime `.env` 與 logs 未複製、未 stage、未提交。
- 未讀取 `token.txt`，未連線真實 Jira／Confluence／內部服務。
- Installer、Portable、release、test-artifacts 全部由 `.gitignore` 排除，不提交 Git。

## Master Requirements Coverage

| ID | Status | Actual Evidence |
|---|---|---|
| M01 | Partial | Ledger 從規格讀取後第一個可量測時間開始；最初 prompt discovery 0.5s 明列 pre-ledger，未偽造回推 |
| M02 | Completed | 規格、架構、前版 reports/tests/runtime paths 已閱讀 |
| M03 | Completed | baseline `59f6fc...`、branch、remote、worktree/tag gate 已記錄 |
| M04 | Completed | 使用者 v0.2.47 tracked 修改與所有未追蹤例外未修改、未 stage |
| M05 | Completed | 本報告與 table verification matrix |
| M06 | Completed | VERSION／package／lockfile／Build Info／artifact metadata = 0.2.50 |
| M07 | Completed | 外部連線未執行；測試使用 synthetic data |
| M08 | Completed automated | packaged session appRoot containment |
| M09 | Completed automated | Viewer read-only SQLite／safe IPC contract tests |
| M10 | Completed automated for operational tables | count/rows/full-result SQLite tests |
| M11 | Completed automated | IME／stale response／preferences tests |
| M12 | Partial | synthetic persisted provenance pass；real Changelog Not Run |
| M13 | Partial | canonicalizer safety tests pass；real rich-content GUI Not Run |
| M14 | Partial | diagnostics/writer automated pass；full Debug Folder GUI Not Run |
| M15 | Completed | typecheck、current/previous/integration regression pass |
| M16 | Completed | production build pass |
| M17 | Completed | Installer／Portable／unpacked generated |
| M18 | Completed automated | short offline packaged smoke pass |
| M19 | Completed | size audit、top files/dirs、SHA-256 |
| M20 | Completed | staged and final ASAR sensitive scan |
| M21 | Completed | CHANGELOG／matrix／implementation／manual／ledger／audit |
| M22 | Completed | clean scoped commits created；final docs commit recorded by Git history |
| M23 | Conditional | final push gate handled after report finalization |
| M24 | Not Run by rule | Overall Partial，因此不建立 tag |
| M25 | Completed | Overall Status 正確標示 Partial |

## 未完成／Not Run／Blocked

1. **完整 Windows 人工 GUI 驗收：Not Run**
   原因：本輪採短時間 app-only smoke，未操作真實桌面輸入與所有表格。影響：IME、窄視窗 popover、欄寬與跨頁互動仍需人工證據。請依 manual validation 逐項執行；若發現程式缺陷，需升下一版本修正。
2. **COPGEN1-144603／COPGEN1-138930：Not Run**
   原因：沒有核准且去識別化 fixture，也禁止真實公司連線。影響：真實 Rich Content、Comments、attachments 與 Changelog provenance 尚未證明。需由使用者在授權環境執行，或下一版提供安全 fixture。
3. **所有 inventory 表格全面共用化：Partial**
   Operational SQLite tables 已套用；payload/workflow/static prototype grids 仍保留既有架構。若要求全面統一，需下一版本設計資料契約與遷移。
4. **Installer 互動安裝／中文空白路徑：Not Run**
   產物與版本/hash 已驗證，但沒有執行安裝 wizard。請人工安裝至包含中文與空白的路徑，再依 checklist 驗證。
5. **三次 cold-start 與完整 error-free GUI gate：Not Run**
   短版 packaged session 無 fatal/error 訊號，但沒有完整 3-run timing。需人工記錄 shell、DB overview、issue list、distribution ready 時間。

## Reports

- `docs/v0.2.50-table-verification-matrix.md`
- `reports/JiraActivityAnalyzer_v0.2.50_Verification_Completeness_Windows_Delivery_implementation_report.md`
- `reports/JiraActivityAnalyzer_v0.2.50_execution_time_ledger.json`
- `reports/JiraActivityAnalyzer_v0.2.50_manual_validation.md`
- `reports/JiraActivityAnalyzer_v0.2.50_package_size_audit.md`

## Git Delivery

- Repository：`F:\AI\JiraActivityAnalyzer`
- Start SHA：`59f6fc40583c4c9f4e04571dd98f0c829a7b4ca0`
- Packaged source SHA：`180fe906de551773f980a32e01b4f65ba0ba2b78`
- Branch：`feat/v0.2.50-verification-completeness-windows-delivery`
- Tag：不建立（Overall Partial）
- Release binaries：不提交、不上傳 GitHub Release。
- 使用者原有 v0.2.47 report 修改及未追蹤資料完整保留。

## Known Limitations／Remaining Risks

- Full table migration 尚未完成於 compressed payload、workflow、static prototype 與 diagnostic grids。
- 真實資料與完整 Windows GUI 沒有通過證據，因此不能宣稱 Release Completed。
- Vite renderer bundle 約 694 kB，build 有 >500 kB warning；不影響本輪 Gate，但後續可評估 route-level code splitting。
- Portable smoke 的 session 因測試以強制結束程序收尾，session summary 保持 `status: running`；`writerFailed:false` 且程序已清除。完整 graceful-close 行為應納入人工驗收。