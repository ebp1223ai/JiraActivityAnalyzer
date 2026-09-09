# v0.3.46 測試與交付報告

狀態：**Partial**。Windows 開發 ZIP 與已執行的驗證均有證據，但不能宣稱完整 Acceptance PASS。

## 實作與驗證

typecheck、test:v0.3.46、build、四組既有聚焦回歸、source workflow/edge UI、win-unpacked ZIP 與解壓 EXE edge UI 均通過。實際 ZIP 的 129 個檔案 hash 一致；Bridge 無外部 fallback；關閉後 5 個合成 SQLite integrity_check 均 ok。

Source UI 含 20 輪混合操作與 app-only screenshots；packaged UI 有 26 項檢查、8 張 app-only screenshots、零 renderer errors，正常退出。

## 尚未通過的 Gate

- T46-05：三頁同筆事件／快照完整 UI 比對證據不足。
- T46-12：快速改篩選及切換 DB 的完整 query-inflight renderer 矩陣不足。
- T46-21：日期與多選條件的完整 UI 組合不足。
- T46-25／29／30：受上述覆蓋不足、統計觀測缺口與尚未通過人工 Gate 影響，標示 Partial。
- T46-28：使用者尚未對指定 hash 回覆 GUI PASS。不能用自動測試或截圖取代。

完整覆蓋不足是在第一個 EXE 後的收尾對照中確認，不能回填為封裝前已全部 PASS。依鎖版規則，若需新增測試程式或修正，應升下一版；本輪沒有偷偷修改或重建 EXE。

## 交付

- ZIP：F:\AI\JiraActivityAnalyzer\release\0.3.46\JiraActivityAnalyzer_v0.3.46_win-unpacked.zip
- ZIP bytes：283320777
- ZIP SHA-256：e69d2fb9e447ba92d02739995f722be4cbc304067910821d32ef0f553e3df4c1
- EXE：F:\AI\JiraActivityAnalyzer\release\0.3.46\win-unpacked\Jira Activity Analyzer.exe
- EXE SHA-256：2fc5428201daecd1416107f8baef90d2b115a25b194b4e0e99607bbda8e292bc
- Build Time：2026/09/09 15:43:43 (Asia/Taipei)
- Source：262730e47de928f0169a97ccc88ac220996ae27d

## Warning 與失敗

已保留所有初次失敗。包括 UTF-8/CP950、Windows sandbox ACL、typecheck 初次錯誤、SQLite lock、renderer 回應 shape、SQL 索引選擇、舊 locator、測試 cardinality、picker 取消漏洞、v045 preference 遺失、ASAR 平台路徑、未安裝 7zip-bin、以及工具語法錯誤。

首次 packaged 測試因 C: App 與 F: evidence 間 rename 觸發 EXDEV；EXE 與測試程式未修改。僅用既有環境參數改為全新同磁碟隔離路徑後通過。首份 FAIL 證據位於 test-artifacts/v0.3.46/packaged-ui/。

仍有既有 Vite node:crypto browser externalization、bundle >500KB、Electron 預設 icon、builder 重複依賴參照與 Git LF/CRLF warnings。App-only 圖片的本機視覺讀取工具受 ACL 錯誤阻擋，因此未聲稱人工視覺驗收通過。

K46-01 Installer uninstall data-loss 尚未修正；Installer/Portable 為 N/A_MODE，正式發布 NOT_READY。沒有真實 Jira／AI 呼叫，沒有 Tag／Push／Release。

## 執行時間統計

統計截至 2026-09-09T07:54:30.970Z；從 2026-09-09 14:20:54 +08:00 起算（初始口述 15:20:54 為時區換算筆誤）。Wall-clock 93.62 分；命令 envelope 聯集 49.99 分；quota 查詢聯集 4.13 分；未分類間隔 40.25 分。不可把命令 envelope 當成 CPU 執行時間。

- OP-087 TEST 303.62 秒
- OP-054 TEST 298.43 秒
- OP-062 MIXED_EDIT_VALIDATION 280.87 秒
- OP-048 TEST 204.31 秒
- OP-098 PACKAGE 174.65 秒

## Token 消耗統計

精確 input/output/cached/total/剩餘 token 數：UNAVAILABLE。來源 get_usage_limits；帳戶 7 日窗口剩餘 43% -> 34%，觀測下降 9 個百分點。帳戶共用活動 UNKNOWN，不能當成此任務的精確成本；0pp 不等於 0 token。

- 2026-09-09T06:22:34.241Z ~ 2026-09-09T06:22:47.506Z：1pp；OP-003
- 2026-09-09T06:30:09.159Z ~ 2026-09-09T06:30:17.906Z：1pp；未歸屬
- 2026-09-09T06:39:15.083Z ~ 2026-09-09T06:39:27.455Z：1pp；未歸屬
- 2026-09-09T06:47:18.398Z ~ 2026-09-09T06:47:25.677Z：1pp；OP-040
- 2026-09-09T06:57:01.572Z ~ 2026-09-09T06:57:06.958Z：1pp；OP-051

逐命令（含 retry/exit/時間）、窗口/reset、主要 phase、來源與缺口見 ExecutionLedger.json、QuotaLedger.json。本文、報告 commit 與最終回覆尾段在帳本 cutoff 之後另列；不補造歷史數值。
