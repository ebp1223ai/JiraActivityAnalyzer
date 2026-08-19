# v0.3.22 Issue Snapshot／Statistics 報告

Automated Status：`PASS`

- Run dispatch 前以 normalized Issue Key 建立 run-scoped snapshot；HTML 只使用固定 snapshot，不重新讀 current state。
- Current-State SQLite loader 使用 read-only `node:sqlite`；缺漏或讀取錯誤形成 `report_enrichment_warning`。
- Receipt 保存 expected／resolved／missing／conflict counts、source DB identity、capture time、SHA-256 與 diagnostics。
- 統計明確分開 Event-based 與 Unique-Issue-based 母體。
- Synthetic regression：117 Events、28 Unique Issues、26 Issues with Multiple Events、89 Duplicate Event Occurrences。
- Existing fixture regression：117 records、28 Unique Issues、117 unique source identities；SHA-256 `37aa0da07e7adcb755740caa961377a3685077f4008c2f725b62b475b0b2353b`。
