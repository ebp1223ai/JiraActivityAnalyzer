# Report Data Package Contract Report

- Schema：`jaa-analysis-report-data-package-v1`。
- Mode：`FORMAL_CANONICAL` 或 `DIAGNOSTIC_NON_CANONICAL`。
- Package 保存 records、unique issue snapshots、validation findings、quality summary、capabilities 與 receipts。
- Package SHA-256 durable write/reopen 驗證：PASS。
- External Package 僅 view/render；v0.3.24 禁止直接寫入正式 SQLite。
