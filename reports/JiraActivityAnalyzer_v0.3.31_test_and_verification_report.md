# JiraActivityAnalyzer v0.3.31 Test and Verification Report

Overall Status: **Partial / Manual Validation Pending**。Source、真實 Debug replay、正式封裝、packaged diagnostic、win-unpacked 與 Portable 隔離短啟動均通過。真實 Managed OAuth 17 筆分析、Installer GUI 與乾淨 Windows尚未執行。

- Branch: feat/v0.3.31-protected-token-safe-segmentation-terminal-lifecycle
- Package Source Commit: 9048161883c602d9efb34fe40a22a9aae353dc39
- Build Version / Time: 0.3.31 / 2026/08/21 20:07:02
- dirtyState=true 僅因保留使用者既有 tracked report 修改，該檔未提交。

| 項目 | 結果 | 實際耗時 |
|---|---:|---:|
| npm.cmd run typecheck | PASS | 9.471 s |
| npm.cmd run test:v0.3.31 | PASS | 4.702 s |
| segment replay | PASS | 1.453 s |
| artifact/lifecycle replay | PASS | 0.833 s |
| 最終 build | PASS | 15.203 s |
| 最終 dist | PASS | 119.273 s |
| packaged verifier | PASS | 10.200 s |
| win-unpacked 短啟動 | PASS | 15.031 s |
| Portable 短啟動 | PASS | 37.833 s |

真實 1 JSON + 3 MD 為 297,974 bytes、75 segments、1,336 protected spans、cut count 0，4/4 reassembly bytes/hash 一致；boundary preflight 271.986 ms。Bridge 為 external-only：ASAR 0、external 1、stale 0。兩種短啟動均有 did-finish-load、renderer_boot、Initial Route Ready，沒有 crash 或白畫面。

第一次 dist 因 diagnostic 執行位置過晚而逾時；修正後又從短啟動發現受控 Manifest transport binding 被誤升級，已回復文件原值 v3，active Runtime Registry 維持 v4並加入 regression。未執行真實 Provider、Jira、production SQLite、Installer GUI、117 筆或長時間 smoke。Actual token telemetry: unavailable。
