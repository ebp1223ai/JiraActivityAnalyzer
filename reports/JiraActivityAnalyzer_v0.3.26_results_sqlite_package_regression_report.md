# JiraActivityAnalyzer v0.3.26 Results / SQLite / Package Regression Report

- v0.3.25 focused contract regression 隨 `test:v0.3.26` 通過。
- v0.3.26 formal public contract 維持 Decision v5；成功後才允許 Canonical、Analyzed、Active Result、Package、HTML 與 SQLite。
- rejected submission 只進 Workspace diagnostics，不進 Results 成功歷史，也不覆蓋舊 Active Result。
- renderer 相容 `jaa-analysis-report-data-package-v1`、`jaa-html-report-template-v6`、`JAA-LOCAL-HTML-RENDERER-1.5.0`。
- ASAR 僅含 `analysis-bridge-v0326.cjs`；rules 由本版 extraResources 提供。

fixture regression 與封裝檢查 `PASS`。production SQLite 寫入、真實 Managed OAuth 與 Installer GUI 為 `Manual Validation Pending`。
