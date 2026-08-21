# JiraActivityAnalyzer v0.3.26 Decision v5 Contract Report

- Canonical contract：`jaa-canonical-analysis-result-v5`
- Decision contract：v5 strict schema。
- 模型 evidence 只允許 `evidenceQuoteIds`，不再接受模型自填原文、offset 或 JAA-owned identity。
- 未知欄位、重複 index、count/index mismatch、未知 quote ID、role/source attribution、status semantic 與 quality finding 都由本機 validation 判定。
- validation 採 aggregate findings，不以第一個錯誤提前終止後續可安全檢查。

聚焦測試結果：Decision v5 schema、Quote ID resolve、失敗 finding aggregation 與成功 submission 均 `PASS`。
