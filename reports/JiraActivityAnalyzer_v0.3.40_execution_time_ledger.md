# JiraActivityAnalyzer v0.3.40 Execution Time Ledger

- Timezone：Asia/Taipei (UTC+08:00)
- Formal ledger start：2026-09-01 18:53:03 +08:00
- Final report preparation：2026-09-01 19:40 +08:00
- Formal-ledger wall clock：至少 47 分鐘；輸入包解壓與 SHA 驗證發生在 ledger 建立前，精確耗時 unavailable，未混入或虛構。

| 階段 | 命令／活動 | Result | Exit | Elapsed |
|---|---|---:|---:|---:|
| Input | ZIP safe extract, Manifest/SHA/Prompt read, 25-file verify | PASS | 0 | unavailable (pre-ledger) |
| Baseline | Git/worktree/schema/scripts/history audit | PASS | 0 | recorded in session, aggregate unavailable |
| Implementation | lifecycle/query/IPC/UI/debug/rules/tests | PASS | 0 | iterative |
| Focus | final `npm.cmd run typecheck` | PASS | 0 | 11.349s |
| Focus | final `npm.cmd run test:v0.3.40` | PASS | 0 | 6.877s |
| Build | final pre-package `npm.cmd run build` | PASS | 0 | 16.385s |
| Legacy suites | unit/integration/regression | PASS | 0 | 19.470s total |
| UI automation | `test:ui` | PASS | 0 | approx. 53s |
| Capture | `capture:ui` | PASS | 0 | approx. 210s |
| Package attempt 1 | normal `dist` dirty safety gate | FAIL | nonzero | 8.150s |
| Package final | authorized dirty `dist` | PASS | 0 | approx. 99s |
| Packaged smoke | win-unpacked | PASS | 0 | 30.730s |
| Packaged smoke | direct release Portable | FAIL (contaminated APP_ROOT) | 1 | approx. 124s |
| Packaged smoke | isolated final Portable | PASS | 0 | 39.332s |
| Audit | hashes/resources/security/git | PASS | 0 | command-level |

所有重試與已知失敗均保留於 Test Report；未執行真實 Jira、AI provider、公司內網或人工 GUI 驗收。
