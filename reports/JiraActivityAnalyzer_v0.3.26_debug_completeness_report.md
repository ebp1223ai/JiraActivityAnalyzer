# JiraActivityAnalyzer v0.3.26 Debug Completeness Report

Debug collector 以 `analysisAttemptId` 與 `linkedRunId` 收集實體證據，不使用 latest Run fallback。外部證據會 copy 並驗 hash；不應產生的檔案標記 `not_expected`，可解碼 submission 若缺 diagnostic package/HTML 則 completeness fail 並指出 owner stage。

涵蓋：artifact attempts、identity receipts、quote catalog、14-stage receipts、findings、diagnostic package/HTML、navigation、formal downstream receipts（如存在）與 flush completeness。完整 token、OAuth/session/cookie/credential 排除。

fixture regression `PASS`；真實 Provider Debug Bundle 與 crash flush 人工驗證為 `Manual Validation Pending`。
