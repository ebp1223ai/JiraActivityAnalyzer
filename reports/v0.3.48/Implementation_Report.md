# v0.3.48 實作與交付報告

## 範圍與狀態
DEVELOPMENT，僅 win-unpacked 與完整 ZIP。人工 GUI PENDING，整體交付為 Partial；不 Tag/Push。Installer/Portable N/A_MODE；K46-01 卸載資料問題未修改，正式 Release NOT_READY。

本版直接修復 Description 衍生資料鏈：typed DiffGuardError、單次 bounded 計算、同源 metrics/text/hunks、單筆受限隔離、全查詢 warning/search coverage、四種表格匯出診斷、失敗數量未知、阻擋過期結果匯出、worker 終止後子 span 收尾。詳細列不再對已計算的資料重做 Diff。

DIFF_WORK_GUARD 門檻仍為 2,000,000 work units，1413 可算、1414 超限；沒有提高門檻、延長查詢 timeout、變更 Raw/AI DDL 或 Package/Importer/Relink/Review/凍結規則。

正常 Raw 與有效 AI Trace 使用同一計算入口。Guard 的 added/deleted/substantiveChange 為 null；Before 是否存在獨立判定。AI guard 不用 Raw 原文取代。SQL/schema/finding integrity/未知錯誤仍讓整次查詢失敗。

Diff 搜尋不把錯誤文字當作可搜尋 Diff。未知搜尋數按其他條件的完整候選集合計算，不限當頁；負向搜尋同樣排除無法判定的列。無 Diff 搜尋時 guard rows 保留。

JSON 匯出含 query coverage，四種匯出強制附加逐筆識別、來源及 Diff 診斷欄；CSV 另有 queryWarningCount/querySearchUnknownCount/querySearchCoverage/queryResultStatus。未知數值不填零。成功零列 CSV 只有欄名，完整查詢診斷仍由 IPC receipt/UI 顯示；未新增偽資料列。

## 證據
Input validator PASS 575 / FAIL 0。規範 v2.1.0，87524 bytes，SHA256 95790b94e24c89bf07b4ab390efce4d76c55549dcd5347a8848f751681efb271。
詳見 SourceGate.json、Test_Report.md、Acceptance_Report.md、WorkLedger.json、ActivityEvents.ndjson 與 WorkTimeline.md。
測試只使用合成資料；未連線 Jira/AI、未打開使用者真實 DB 或 token.txt，未讀取本次非必要事故私有原文。

## 紀錄品質
工作活動起訖與各階段可取得的帳戶額度已持續記錄。REPORT_INCOMPLETE：部分公開進度未即時持久化、階段 diff 引用未完整保存，命令記錄有截斷；非同步結束時間為觀測上界。這些不補造成歷史精確值。最終 baseline 分類 LOC 與可讀全部活動另列；工作窗含工具等待，不代表純 coding/CPU 時間。
精確 input/cached/output/reasoning/total Token、上下文剩餘%=UNAVAILABLE。帳戶額度為共用窗口，不當作本任務精確消耗。

## 保留事項
保留 v0.2.47 原有 tracked 修改、v0.3.47 WorkLedger/WorkTimeline 原修改及全部既有未追蹤資料；不將其納入本版工作 commit。未重建任何舊版 EXE。
首次 v0.3.48 EXE 產生後凍結產品、測試、harness、封裝與記帳工具。人工須針對指定 ZIP 明確回覆「v0.3.48 GUI 驗收 PASS」，才符合後續 final reports commit / annotated tag / push 的條件。
