# v0.3.47 人工 GUI Release Gate

狀態：MANUAL_GUI_PENDING。自動 UI PASS 不等於人工 PASS。DEVELOPMENT ZIP 可供驗收，正式發布 NOT_READY。

- ZIP：F:\AI\JiraActivityAnalyzer\release\0.3.47\JiraActivityAnalyzer_v0.3.47_win-unpacked.zip
- SHA256：4d7ec7f87e2e7f01d8b4021ed96ab366f0a18200293a4293ee6d07674893be56
- Build：0.3.47 / 2026/09/09 20:35:37
- Source：b2e52bb79083f425836fe179ebbfedb7ee4e7916
- EXE 沒有數位簽章；ZIP 必須完整解壓，不能只取單顆 EXE。
- 不要覆蓋或搬動真實資料。本次自動驗證只使用隔離 synthetic DB；正式測試資料先按既有備份流程保護。

## 人工檢查

1. 開啟完整解壓目錄中的 Jira Activity Analyzer.exe，確認版本/build time、三個 AI 頁面及 User Viewer 正常。
2. Integrated 首次四種已分析狀態；複選、全不選為0、清除全篩選為五種、恢復預設為四種。
3. AI 狀態 + 日期 + Actor 多選，切頁回來條件正確；再檢查同日、單邊与不合法範圍。
4. 同事件 Raw/AI 不同內容時 Integrated 主 Diff 顯示 AI 紅刪綠增；AI Results 相同，User 保持 Raw；compact/缺失/完整性警示沒有偷換 Raw。
5. Comment Create/Update 全文；四種 Description 快篩與匯出筆數符合所見條件。
6. 切換 Raw/AI DB、快速改條件、取消匯出後不出現過期結果或錯誤成功。
7. 關閉重開後資料仍可讀；小視窗和 Debug Panel 狀態可用。

只有使用者明確針對以上 ZIP SHA256 回覆「v0.3.47 GUI 驗收 PASS」後，才可評估全部適用 Gate 並做 final reports commit / annotated tag / branch與單一tag push。本輪不執行。發現需要改程式的問題，不覆蓋重建0.3.47，需下一版本授權。

K46-01 Installer 卸載資料保留仍 DEFERRED；本版不產 Installer/Portable，不能將 N/A_MODE 寫為 PASS。
