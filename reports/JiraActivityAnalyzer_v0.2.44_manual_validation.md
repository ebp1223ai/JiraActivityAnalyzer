# JiraActivityAnalyzer v0.2.44 手動驗證

1. 啟動 v0.2.44 Installer 或 Portable。
2. 到 **Jira Connection**，確認只有 Jira URL、User、Auth Type、遮罩 Token、API Version、`.env` 與 Test Connection；畫面不得出現 Database 或 Global Data Source Mode。
3. 到 **Database Overview**，選取既有相容 Database，不要建立新檔或改動原檔。
4. 確認畫面顯示路徑、讀寫狀態、相容性、Issue／Snapshot／Payload／Activity Events 數量。
5. 執行 Quick Refresh 與 Full Health Check；Jira 離線時重複操作，Database Overview 仍應可用。
6. 按 **Open Folder**，確認開啟目前 Database 所在資料夾。
7. 到 **Issue Viewer** 查詢 `COPGEN1-138930`，依序檢查 Overview、Description、Changelog、Comments、Attachments Metadata、Issue Links、Remote Links、Activity Events 與 Raw Evidence。
8. 預期 Changelog 140、Comments 48、Attachments 142、Issue Links 2、Activity Events 453；Remote Links 顯示 `Not collected because Remote Links is disabled.`
9. 在 Issue Viewer 切換一個 tab，前往 User Viewer 後返回，確認 Issue Key、結果與 tab 保留。
10. 在 User Viewer 選擇使用者、日期、篩選與 tab，切到 Issue Viewer 後返回，確認 User Viewer 狀態獨立保留。
11. 到 **Data Collection**，確認五個短標籤依序為 Build Activity Stream、Select Issues、Full Fetch、Validate History、Save & Export。
12. 用 Tab 鍵聚焦工作流，使用左右方向鍵、Home、End 切換，確認焦點與內容同步。
13. 在 Step 1 確認固定值為 Force All Rounds、1 Calendar Month、3 rounds、5000 ms、2026-01-01 至執行當日；固定值不可編輯。
14. 執行測試 run，切換五個 tabs，確認 run、selected set、queue 與已完成結果不會因切頁清空。
15. 建立新 Timeline run，確認舊的 Completed／Failed／Skipped 不會沿用；零事件或無 Baseline 時下游不得顯示 Completed。
16. 到 Step 5，分別確認 Export Result 與 Database Write Result；Export 成功不應掩蓋 Database Write 失敗。

一般驗收不需要 SQL 或 DevTools。請勿使用包含 Token 或敏感資料的截圖回報。
