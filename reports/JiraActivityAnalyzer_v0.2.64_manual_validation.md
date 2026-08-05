# Jira Activity Analyzer v0.2.64 Manual Validation

狀態：**Not Run / Unverified**。以下步驟需由使用者在 Windows 與獲授權的真實 Jira 環境執行；不要提供 Token、`.env`、DB 或公司資料給 Codex。

1. 開啟 `release/Jira Activity Analyzer Portable 0.2.64.exe`，確認 Build Version `0.2.64`、Build Time `2026/08/05 15:24:05`。
2. 進入 Analysis 的 Step 1，確認預設為 `User-related Issues / 使用者相關 Issue`。
3. User mode輸入 User、Start/End、既有 Window/Rounds/Delay，記錄原值但先不要執行。
4. 切至 `All Issues by Last Updated Date`；確認只顯示 Start/End，User與 Advanced Details完全隱藏，且不會自動送 request。
5. 切回 User mode；確認第 3 步原值完整恢復，原 User-related discovery仍可執行。
6. Updated mode依序測試可合理取得 0 筆、少量、多頁與 >1,000 筆的日期範圍；確認沒有在 1,000 筆停止。
7. 以 Jira唯讀搜尋對照 executed JQL、raw fetched、unique、duplicate、initial/final observed total與最後 Issue identity。
8. 在多頁途中 Cancel；再模擬 request failure。兩者均不得覆蓋既有 completed Candidate Set或進入 Step 2。
9. 完整成功後確認 status=`COMPLETED`，新的 Candidate Set一次性取代舊 set並可進 Step 2。
10. 在 Step 2切換不同 Project filter並跨 Project勾選；確認 filter只影響畫面，不清除 global Selected Set。
11. 建立新的 Full Fetch Queue；確認 queue只含本次 Selected Set，且完全取代上一輪 queue。
12. 回到 User mode重跑既有流程；確認 User JQL、Matched Reason、1,000 safety limit、progress/retry/cancel均未退化。

驗收紀錄：

- Tester：________________
- Date / Environment：________________
- Real Jira >1,000 result：PASS / FAIL / NOT AVAILABLE
- User mode regression：PASS / FAIL
- Updated mode complete/cancel/failure gate：PASS / FAIL
- Step 2 selection/queue replace：PASS / FAIL
- Overall Manual Result：PASS / FAIL
- Notes / Evidence path：________________

