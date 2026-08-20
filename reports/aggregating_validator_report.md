# Aggregating Validator Report

- 聚合輸出：Schema、Semantic、Evidence findings 與 validation summary 五類版本化檔案。
- 必要 finding 包含 quote mismatch、role mismatch、primary required、context-only、count/index/identity/catalog errors。
- Bridge v4 僅在 schema 不可解析時拒絕；可解析的 semantic/evidence failure 交給 IPC 產生完整 Diagnostic Package。
- Formal Canonical 與 SQLite gate 只接受全部必要 validator 通過的結果。
