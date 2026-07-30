# Jira Activity Analyzer v0.2.51 Implementation Report

## Result

- Target: `0.2.51`
- Theme: GUI Interaction Correctness, Rich Content Diff & Viewer State Persistence
- Overall status: **Partial**
- Build Time: `2026/07/30 18:41:21` (Asia/Taipei)
- Branch: `feat/v0.2.51-gui-ime-rich-content-diff-state-persistence`
- SQLite schema: unchanged, version 2

Partial 的原因是 Windows 真實 IME、逐表 packaged GUI、diagnostics 零錯誤與真實資料 Gate 尚未由人工執行。

## Implementation

### Filter layout

`DatabaseIssueTable` 與共用 `SqliteDataTable` 改成 header 後的固定 filter row。`ExcelFilterPopover` 成為正常 document-flow panel，不再計算 viewport position，也不使用 absolute/fixed overlay。

### Windows IME

共用 `TextColumnFilter` 以 `draftValue`、`committedValue`、`isComposing`、`pendingCommit` 管理輸入。composition 中只更新 draft，結束時只排程一次 commit，並抑制瀏覽器緊接的重複 input；外部 stale value 在 composing 或 pending commit 時不覆寫。

### Rich content and Diff

Comment／Description 共用 `canonicalizeRichContent`，保留 raw value，產生安全 display text 與 canonical visible text。支援 primitive、ADF/object、HTML、wiki、array/nested object，並限制 depth、node 與 text size。Diff 以 canonical visible text 比較；no-op 回傳空 segments，created/deleted 正確標示，Comment／Description 單行修改使用共同 prefix/suffix 的精簡 diff。

### Viewer session

Issue/User Viewer 狀態提升至 session context，保存 loaded identity、active tab、query、result cache identity、page、expanded stable IDs 與 scroll。一般 sidebar unmount 不清除結果；換 subject 或 database identity 才重設。global request generation 與 pending request ID 阻止 stale response 覆寫最新狀態。

## Automated Evidence

- `npm.cmd run typecheck`: Passed
- `npm.cmd run test:v0.2.51`: Passed（含一次 red→green 修正）
- `npm.cmd run test:v0.2.48`: Passed
- `npm.cmd run test:v0.2.49`: Passed（舊 source assertion 更新為共用 TextColumnFilter contract）
- `npm.cmd run test:v0.2.50`: Passed
- `npm.cmd run test:integration`: Passed
- `npm.cmd run build`: Passed；Vite 僅有既有 >500 kB chunk warning

## Scope and Safety

沒有 Jira/Confluence 連線、schema migration、正式資料庫寫入或真實資料讀取。使用者既有 tracked 修改與所有 untracked/ignored 內容保留，`token.txt` 未讀取。Packaging 已由乾淨 commit `0dcaf28` 完成。Installer、Portable、win-unpacked 與 app.asar 均已生成；ASAR 4681 entries 中禁止項目為 0。短版 packaged launch smoke 通過（BrowserWindow 有有效 handle、標題 v0.2.51、程序可回應）。完整人工 GUI、Windows IME 與真實資料 Gate 仍為 Not Run。Git delivery 將記錄於最終 ledger 更新。