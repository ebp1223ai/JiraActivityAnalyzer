# v0.3.22 Decision v3 Contract 報告

Automated Status：`PASS`

- Contract：`jaa-ai-analysis-decisions-v3`，root 必須是 direct JSON array，長度精確等於 authoritative N。
- Strict validator：拒絕 wrapper、stringified root、額外欄位、錯誤 enum/type、index 缺漏／重複。
- Semantic validator：檢查 status matrix、catalog Skill ID、per-skill findings、evidence refs／quotes 與 normalized evidence traceability。
- JAA local derivation：Stable ID、Evidence ID、source hash、record order、skill IDs、count 與 distributions 不由模型決定。
- Legacy v2：保持可識別但不自動冒充已驗證 v3。
- Bridge：`0.3.22-bridge-v5`，SHA-256 `efdf3ddc73556f6e6d00a496b3896ff7a0b2bb5a8869152ccec6a51e1a183724`。

117 fixture：117 records、117 unique source identities、117 unique evidence IDs、28 Unique Issues；只讀驗證，未硬編碼分類結果。
