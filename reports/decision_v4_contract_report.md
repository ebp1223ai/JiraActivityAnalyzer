# Decision v4 Contract Report

- Schema：`jaa-ai-analysis-decisions-v4`，直接陣列，筆數與輸入完全相等。
- Confidence enum：0、0.3、0.6、0.9。
- Evidence Quote 綁定 `evidenceRef`、`evidenceSegmentId`、exact `quote` 與 `evidenceRole`。
- Status matrix、Catalog Skill ID、record identity 與 count 均 fail closed。
- v3 legacy 保留相容讀取；v4 為 v0.3.24 正式契約。
- Synthetic 17／117：PASS。Real Provider：Manual Validation Pending。
