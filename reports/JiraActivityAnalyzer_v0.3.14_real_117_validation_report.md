# JiraActivityAnalyzer v0.3.14 Real 117 Validation Report

## Status

`Not executed / Partial`

v0.3.14 正式 Release Portable 已完成 renderer 啟動驗證，但本輪沒有可稽核的非秘密狀態能確認 ChatGPT authentication 已可用；正式流程另需在 GUI 選取真實 Pending JSON 與三份公司規則。依安全政策未讀取 `auth.json`、keyring、Cookie 或 token，未搬移 authentication，也未用 dev/win-unpacked/fixture/舊 POC 冒充正式 Provider Run。

因此本版數值如下：

| Metric | v0.3.14 value |
|---|---:|
| Input records | Not executed |
| Provider returned | Not executed |
| Parsed | Not executed |
| Schema-valid | Not executed |
| Semantic-valid | Not executed |
| Formal JSON | 0 |
| Golden HTML | 0 |
| SQLite committed | 0 |
| Provider dispatch/thread/turn | 0 / 0 / 0 |
| Retry/repair/fallback | 0 / 0 / 0 |
| Actual tokens | Unavailable (no request) |

## Safe next action

由使用者在 `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Portable 0.3.14.exe` 完成/確認 ChatGPT 登入，選取正式 117 筆 Pending JSON 與三份規則，在 Request Preview 核對 `INLINE_EXACT_CONTENT`、5 blocks、bytes/SHA-256、complete=true、truncated=false，再只按一次 Start 並確認 capacity warning。完成後核對 Run archive conversation/stream/raw/canonical hashes、117 identity/Catalog/evidence/semantic gates與正式 JSON/HTML/SQLite 117/117。