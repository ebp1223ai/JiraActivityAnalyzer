# v0.3.22 Evidence Normalizer 報告

Automated Status：`PASS`

- Version：`JAA-EVIDENCE-NORMALIZER-1.0.0`。
- Pure deterministic normalization：處理 JSON body wrapper、escape/newline 與已核准 Jira markup。
- 保留 raw text、normalized text、source provenance、field name、input/output SHA-256 與逐筆 receipt。
- Decision v3 quote 必須能回溯至同 record 的 normalized evidence；任意或跨 record quote 會 semantic fail。
- 測試包含 Comment JSON wrapper regression、escaped content、raw preservation 與重複執行 deterministic identity。
