# v0.3.31 Protected Token Extraction Report

使用 strict UTF-8 byte offset；Catalog Skill ID 由已驗證 279 筆 exact set 建立。保護 EVIDENCE_QUOTE_ID、SKILL_ID、RECORD_INDEX_LITERAL、DECISION_STATUS_LITERAL、CONFIDENCE_LITERAL、CONTRACT_IDENTITY、VERSION_IDENTITY、SHA256_LITERAL、SOURCE_RECORD_STABLE_ID、EVIDENCE_SEGMENT_ID、EVIDENCE_REF。

真實四檔共 1,336 spans：Pending 909、Common Rules 46、Catalog 315、Manifest 66。Quote ID unique count 282，Skill ID count 279。Duplicate、多位元中文、escape、CRLF、malformed JSON fail-closed 與 token hash 均有測試。Extraction 實測 61.592 ms。
