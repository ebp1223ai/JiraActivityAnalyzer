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

## Windows Dist 與 Package Audit

| 項目 | 結果 | 證據 |
|---|---:|---|
| clean source commit | PASS | `b9ac0dbe9259619cbe8f3ef2109342ebbaeabf04` |
| npm.cmd run dist | PASS | 75.8 秒；Installer、Portable、win-unpacked |
| package size audit | PASS | unexpected packaged content = 0 |
| app.asar forbidden-name scan | PASS | 2,078 entries；0 matches |
| runtime path contamination | PASS | 0 matches |
| Portable hidden startup | PASS | 12 秒；標題 `Jira Activity Analyzer v0.3.3`；無殘留程序 |
| Authenticode | NotSigned | 三個 EXE 均無簽章憑證 |

第一次 dist 呼叫因執行器 5 秒 timeout 中止；確認無程序、無 release/partial 後才重啟，完整 attempt PASS。完整 hashes 與 paths 見 artifact manifest。

## 狀態

- Implementation：Completed。
- Automated Verification：Completed。
- Build & Dist：Completed。
- Package Audit：Completed。
- Real SQLite & Windows GUI Validation：Pending。
- Overall：Partial（等待使用者真實資料人工驗收）。
