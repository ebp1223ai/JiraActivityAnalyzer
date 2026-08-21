# JiraActivityAnalyzer v0.3.27 測試與驗證報告

- Overall Status: **Partial / Manual Validation Pending**
- Package Source Commit: `0697921f5298a4b779b8645456fa9aa250d33d1c`
- Build: PASS；Dist: PASS（首次被 dirty guard 拒絕，保留既有 tracked dirty 後以明示模式重跑）
- `typecheck`: PASS；`test:v0.3.27`: PASS；`git diff --check`: PASS
- win-unpacked / Portable: 隔離 APP_ROOT 短啟動 PASS，均保存 `renderer_boot` 與 `did-finish-load`，未見 renderer crash。
- ASAR: 只有 `analysis-bridge-v0327.cjs`；無 stale bridge、`.env`、token、DB 或 Debug Bundle 檔名。
- 真實 Managed OAuth、真實 Jira、production SQLite、17/117 筆 Provider Run、Installer GUI：Manual Validation Pending。
- 指定 v0.3.26 Debug Bundle 不存在；`npm.cmd run replay:v0.3.26` exit 2，未冒充 replay PASS。
- Actual token telemetry: `unavailable`（未執行 Provider Run）。

已知 warning：Vite 將 renderer 內 `node:crypto` externalize；主 bundle 約 830.71 kB，觸發 500 kB chunk warning。兩者未造成 build 或 renderer boot 失敗。
