# Evidence Segmenter Report

- Version：`JAA-EVIDENCE-SEGMENTER-1.0.0`。
- Added／removed line 為 `PRIMARY_CHANGE`；context 為 `SUPPORTING_CONTEXT`；未知內容為 `INELIGIBLE`。
- 保留 exact text、line number、source pointer、segment SHA-256，不 trim 或正規化證據字串。
- Segment ID deterministic，17／117 synthetic identity uniqueness：PASS。
- Context-only classification 與非 exact quote：正確 BLOCKED。
