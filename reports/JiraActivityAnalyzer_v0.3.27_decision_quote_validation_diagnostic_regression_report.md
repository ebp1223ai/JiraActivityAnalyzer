# v0.3.27 Decision / Quote / Validation / Diagnostic Regression

- Decision Contract 維持 `jaa-ai-analysis-decisions-v5` direct array。
- Approved Artifact Identity 由 Host 注入；模型 payload 無 identity 欄位。
- Evidence Quote Catalog deterministic，測試含 Unicode、CRLF、escaped quote、NBSP、tab 與中文。
- Persist-before-validate 在 schema/semantic rejection 前保存並 hash verify submission。
- 14 層 validation receipts 維持順序；Diagnostic HTML 不建立 Canonical、Active Result 或 SQLite。
- Formal Canonical v5、Report Data Package v1、HTML Renderer 1.5.0 與 SQLite gate 未改變。
