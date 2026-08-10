# Jira Activity Analyzer v0.3.3 驗證報告

## 自動驗證

| 命令 | 結果 | 最近一次耗時 |
|---|---:|---:|
| npm.cmd run test:v0.3.3 | PASS | <1 秒 |
| npm.cmd run typecheck | PASS | 8.895 秒 |
| npm.cmd run test:v0.3.2 | PASS | 0.619 秒 |
| npm.cmd run test:v0.3.1 | PASS | 0.699 秒 |
| npm.cmd run test:v0.3.0 | PASS | 1.516 秒 |
| npm.cmd run test:v0.2.67 | PASS | 17.2 秒 |
| npm.cmd run test:v0.2.66 | PASS | 17.494 秒 |
| npm.cmd run test:integration | PASS | 0.676 秒 |
| npm.cmd run build | PASS | 20.280 秒 |
| git diff --check | PASS | <1 秒 |

失敗重跑均保留於 execution ledger。array comma false diff、Row typing、舊 Quick Filter expectations、empty-string fixture 與 30ms synthetic watchdog 均經最小修正後重驗。

## Correctness 證據

- scalar、日期、Description、Labels、ordered array、Attachment、Custom JSON、Unicode/CRLF、null/missing/empty 均有 focused synthetic coverage。
- `changed && substantive` 必有 insert/delete hunk，added/removed counts 由同一 hunk lines 計算。
- 缺 hunk 的有效 digest record 仍被 `DIFF_CONTENT_MISSING` 阻擋。
- 20,000-event progressive regression 證明 SQL/progressive predicate parity、server-side pagination、checkpoint、取消與 worker queue。
- 160-record production export regression 證明完整 filtered set、多 batch、cross-view record/hash、normalized snapshot、coverage metadata 與 frozen exported IDs parity。

## 尚待

Windows dist、package audit、Portable 短啟動與 artifacts 將在 clean source commit 後回填。真實 SQLite／Windows GUI 內容驗收不由 Codex 偽裝執行，狀態為 Pending。
