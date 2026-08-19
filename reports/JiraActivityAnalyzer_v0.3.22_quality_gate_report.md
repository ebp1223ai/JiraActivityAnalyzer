# v0.3.22 Quality Gate 報告

Automated Status：`PASS`

- Contract：`jaa-ai-analysis-quality-v1`。
- 狀態：`PASSED`、`WARNING`、`BLOCKED`、`LEGACY_UNVERIFIED`。
- Metrics 保存 numerator、denominator、normalization 與 excluded cases；不追求固定分類率或固定 Skill 分布。
- Schema／Semantic failure 或 `BLOCKED` 不建立正式 Canonical／HTML／SQLite。
- `WARNING` 可檢視 Canonical 與 HTML，但 durable manual acceptance 前禁止 SQLite。
- Report enrichment warning 不會自行改變 AI Decision status，也不會單獨阻擋 SQLite。
- UI 顯示 Quality status、warnings、blockers 與主要 metrics。
