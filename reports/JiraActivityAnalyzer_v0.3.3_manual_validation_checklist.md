# v0.3.3 最短人工驗收清單

狀態：Real SQLite & Windows GUI Validation Pending。

1. 啟動 `Jira Activity Analyzer Portable 0.3.3.exe`，確認 Build Info 顯示 v0.3.3。
2. 使用同一份 SQLite，在 User Viewer 套用既有日期、使用者及四個 Quick Filters，記下畫面 filtered count 並執行 Pending Analysis Export。
3. 在 Issue Viewer 使用同一 Issue/filters 再匯出一次。
4. 確認兩份 JSON schema 為 `0.3.3-draft.1`、mode 為 `compact-reference`、filtered count 等於 exported count。
5. 確認 `diffCoverageComplete=true`，所有 changed/substantive records 均有 insert/delete hunks，line counts 可重算一致。
6. 抽查 Status、Assignee、Labels、Attachment、Link、自訂欄位及 Description；Description 只能有有限 context，不得出現完整 Before/After aliases。
7. 用 `activityEventId` 與 SHA-256 對 SQLite 做追溯，確認 0 missing、0 multiple matches；相同事件跨 Viewer record/hash 一致。

若失敗，請保留兩份 Pending Analysis JSON 與 App 產生的 Debug Folder；不要提供 Token 或未遮罩 credential。
