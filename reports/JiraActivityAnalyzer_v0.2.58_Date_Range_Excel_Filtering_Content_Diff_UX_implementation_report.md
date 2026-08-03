# Jira Activity Analyzer v0.2.58 實作報告

## 結論

- 版本：`0.2.58`
- Source commit：`36375920ee1a8913b24bbb4718fff7deb91933a5`
- SQLite schema / Event Identity Policy：維持 `v3`
- 整體狀態：`Partial`
- 自動化功能、回歸、build、dist、ASAR、雜湊及短版 packaged renderer 啟動檢查：`Pass`
- 真實大型 SQLite、完整 GUI 操作、Installer 安裝/移除與真實 Jira：`Pending User` / 本輪刻意不執行

## 主要實作

1. Dashboard、User Viewer、Issue Viewer 加入本機日曆語意的日期範圍與快捷選項；開始日含當日，結束日以次日 exclusive boundary 查詢。
2. Overview 支援 Activity Event、Jira Created、Jira Last Updated 三種日期模式；列表與 distributions 共用相同完整 filtered scope。
3. Excel-style filter 支援 candidate 搜尋、Apply/Cancel、Clear Column、Select All Search Results、Esc；candidate query 排除自身欄位 filter 並保留其他條件。
4. Changelog 改為完整資料集先 filter/sort/count 再 pagination；新增 Description Changed Only 與 Before unavailable 控制。
5. Content Diff 可正規化字串、HTML、ADF/object/array/null，並區分 changed、whitespace-only、unchanged、before/after unavailable、unparseable。
6. Comments 預設 Created，Last Updated 缺失時 fallback Created 並顯示 badge；兩者皆缺失者排除並顯示計數。
7. Step 2 Select/Deselect All Filtered Results 使用完整 filtered result set，Project filter 不清除既有 global selection。
8. Filter presets 依 viewer/tab 隔離，支援 Save/Apply/Rename/Update/Delete、重名防護與 atomic persistence；不保存 DB、credential、entity selection 或展開狀態。

## 驗證結果

| 命令 / 驗證 | 結果 | Exit code |
|---|---:|---:|
| `npm.cmd run typecheck` | Pass | 0 |
| `npm.cmd run test:v0.2.58` | Pass | 0 |
| `npm.cmd run test:integration` | Pass | 0 |
| `npm.cmd run test:v0.2.57` | Pass | 0 |
| `npm.cmd run test:v0.2.56` | Pass | 0 |
| `npm.cmd run test:v0.2.51` | Pass | 0 |
| `npm.cmd run test:ledger` | Pass | 0 |
| `npm.cmd run build` | Pass（既有 large-chunk warning） | 0 |
| `git diff --check` | Pass | 0 |
| clean detached worktree `npm.cmd run dist` | Pass | 0 |
| package size / ASAR audit | Pass，unexpected count 0 | 0 |
| packaged renderer 短版離線啟動 | Pass；標題與 `app.asar/dist/index.html#/database` 正確 | 0 |

`test:v0.2.58` 使用 synthetic temporary SQLite，覆蓋日期 boundary/mode、Overview/User/Event scope、candidate 自身 filter 排除、Changelog local query、content classifier、preset atomic persistence、duplicate guard 與 schema v3。沒有連線真實 Jira，也沒有讀取真實 DB。

## 安全與相容性

- Jira 仍為 read-only；未新增 POST/PUT/DELETE。
- 未變更 ENV contract、dependency 或 SQLite schema。
- SQL 值採 parameter binding，排序/欄位採 allowlist，保留 stable secondary sort。
- source diff 掃描僅命中既有 synthetic UI smoke fixture，未新增可用 Token、密碼、Authorization credential 或真實資料。
- `.env`、`token.txt`、DB、backup、debug bundle、release 執行檔均未加入 commit。
- 使用者既有 v0.2.47 tracked report 修改與所有未追蹤例外均未修改、未 staged、未提交。

## 尚待人工驗證

詳見 `reports/JiraActivityAnalyzer_v0.2.58_manual_validation.md`。完整多尺寸 UI smoke、Portable 互動流程、Installer 安裝/移除、真實大型資料效能與真實 Jira 連線未執行，因此整體狀態不宣告為 Complete。
