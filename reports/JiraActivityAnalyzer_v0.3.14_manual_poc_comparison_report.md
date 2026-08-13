# JiraActivityAnalyzer v0.3.14 Manual / POC Comparison Report

Status: `Not executed`

v0.3.14 Real 117 未執行，因此不得將既有 POC analyzed JSON、手動 HTML 或 v0.3.13 Provider response當成本版正式輸出，也沒有可合法比較的 v0.3.14 JSON/Golden HTML/SQLite 117 records。

已完成的 contract-level comparison：

- 舊 wire contract只有 MATCHED/EXCLUDED/UNKNOWN，會把 Catalog detail missing 壓成 UNKNOWN 並丟失 candidate。
- 新 contract保留 CATALOG_DETAIL_MISSING/NEEDS_REVIEW、candidateStatus/statusReason/catalogDetailAvailable、evidence與audit checks。
- 舊 local validator全域要求所有 negativeChecks 非空；新 validator依 record/candidate status matrix判定。
- 舊 Debug canonical response被 8,192-character preview截斷；新 raw/canonical/gzip/Debug evidence各自完整且以 SHA-256核對。

真正的逐筆語意比較需等唯一一次 v0.3.14 Real 117 完成後執行。