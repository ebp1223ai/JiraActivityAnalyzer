# Jira Activity Analyzer v0.2.51 Manual Validation

Overall manual status: **Not Run / Unverified**

本文件是 packaged Windows App 的人工驗收程序。自動 reducer、DOM contract 或短版 smoke 不取代 Microsoft IME、縮放與真實資料人工 Gate。

## Gate A - Filter

1. 開啟 Installer 或 Portable 0.2.51。
2. 逐一驗證 Database Issue List、Issue Viewer Changelog／Comments／Activity Events、User Viewer Related Issues／All Activity Events。
3. 對第一欄、中間欄與最後一欄開啟 filter，確認資料列向下移動且沒有被遮住。
4. 在窄視窗、水平捲動、100%／125%／150% scaling 與 zoom 下重複。

## Gate B - Windows IME

1. 使用微軟注音或等價 Windows 中文 IME。
2. Database Issue List 的 Key 與 Summary 各連續 20 次組字、選字、退格、快速輸入與失焦返回。
3. 確認 composition 中不查詢、compositionend 只查一次、文字與游標不跳動、console 無 error。

## Gate C - Rich Content Diff

以核准且去敏資料分別驗證 Comment 與 Description 的 created、edited、deleted、no-op、ADF/object 與長文字。確認沒有 `[object Object]`，no-op 顯示「無實質變更」，小修改不顯示全文刪除／新增。

## Gate D - Viewer State

Issue Viewer 與 User Viewer 各載入一筆資料，設定 tab、filter、sort、page size、page、展開至少兩列並捲動；切換 sidebar 後返回，連續重複 10 次，確認狀態與正確列展開均保留。切換另一 subject 或 Local Database 時才允許重設。

## Diagnostics Gate

驗收結束時需確認 `local_error_boundary=0`、`window.error=0`、`unhandledrejection=0`、`console error=0`、`writerFailed=false`。

## Real Data

真實 SQLite／XML／Full Fetch、公司 Jira、Comment／Description 實例皆 **Not Run**。本次沒有讀取 `token.txt`、`.env` 或使用真實服務。