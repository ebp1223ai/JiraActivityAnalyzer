# JiraActivityAnalyzer v0.3.26 Diagnostic Artifact HTML Report

正式 gate 失敗時，本機仍建立 `DIAGNOSTIC_NON_CANONICAL` Report Data Package 與 HTML。內容含 lineage、submission receipt、non-authoritative distribution、submitted decisions、resolved/unresolved quote IDs、aggregate findings、identity receipt、分析報告與摘要，並強制 `formal=false`、`canonicalCreated=false`、`sqliteAllowed=false`。

fixture 已建立並驗證 Diagnostic HTML；它不進 Results 成功歷史、不取代 Active Result。乾淨 Windows GUI 人工檢視尚待執行。
