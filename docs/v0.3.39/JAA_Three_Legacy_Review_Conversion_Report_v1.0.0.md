# JAA 三份舊人工驗收檔轉換報告 v1.0.0

- Target Application: `JiraActivityAnalyzer v0.3.39`
- Target Contract: `jaa-ai-analysis-import-package v1.0.0`
- Target Schema SHA-256: `6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c`
- Conversion Date: `2026-09-01`
- Validation Status: `PASS`

## 1. 結論

三份舊的 `jaa-manual-skill-review` JSON 已轉為 JAA AI 分析資料庫可接受的統一匯入格式。每份輸出都整合：

- 原始 Pending record snapshot
- AI 分析結果與 Skill Findings
- 人工 Record 決定
- 每個 Skill 的接受／拒絕／調整結果
- 補充 Evidence assignment
- Rules／Template／Source binding
- Review coverage 與 Review Rank
- JCS package integrity hash

三份輸出均通過：

- `jaa-ai-analysis-import-package v1.0.0` strict Schema 驗證
- Package JCS SHA-256 驗證
- Record count／record identity 驗證
- Finding 與人工判定對應驗證
- Review coverage／rank 一致性驗證
- Source file SHA-256 驗證

## 2. 轉換結果

| 舊人工驗收檔 | 實際內容 | 新匯入檔 | Review Rank | 結果 |
|---|---:|---|---|---|
| `manual-skill-review-17__v1.2.0__2026-08-31T06-24-58-748Z(1).json` | 17／17 完成、39 Findings、5 補充 Evidence | `jaa-ai-analysis-import-17__review-completed__converted-v1.0.0.json` | `REVIEW_COMPLETED` | PASS |
| `manual-skill-review-59__v1.3.0__2026-09-01T06-20-41-023Z.json` | 59／59 完成、86 Findings、81 接受、5 拒絕 | `jaa-ai-analysis-import-59__review-completed__converted-v1.0.0.json` | `REVIEW_COMPLETED` | PASS |
| `manual-skill-review-65__v1.3.0__2026-09-01T02-40-02-781Z.json` | 實際只有 59 筆，其中 54 筆完成 | `jaa-ai-analysis-import-59__review-partial-54-of-59__converted-v1.0.0.json` | `REVIEW_PARTIAL` | PASS |

## 3. 「65」檔案的重要說明

第三份檔案雖然檔名寫 `65`，其 JSON 內容實際為：

- Total records: `59`
- Completed records: `54`
- Review status: `IN_PROGRESS`

因此不能標示為 `REVIEW_COMPLETED`。轉換檔忠實保留為 `REVIEW_PARTIAL`，以防未完成的人工資料取得過高 Review Rank，進而覆蓋資料庫中已完成驗收的結果。

## 4. `inlineSegments` 正規化

59 筆 Pending snapshot 的 210 個 diff line 含 `inlineSegments`。此欄位是 Pending HTML／UI 的衍生顯示資訊，但凍結的 Import Package v1.0.0 Schema 未宣告它，且 `diffLine` 使用 `additionalProperties: false`。

為使輸出嚴格符合既有 Schema，轉換時只移除這 210 個 `inlineSegments`：

- line 原文 `text` 未改變
- line `kind` 未改變
- old／new line number 未改變
- hunk 結構未改變
- AI Skill Findings 與人工判定未改變
- Source identity 未改變

17 筆來源沒有此欄位，因此正規化數為 0。

這項既有 Golden Fixture／Schema 落差已列入 v0.3.39 設計，要求 canonical fixtures 全部通過 strict Draft 2020-12 validation，Importer 不得靜默接受未宣告欄位。

## 5. 檔案完整性

| 輸出檔 | File SHA-256 | Package JCS SHA-256 |
|---|---|---|
| `jaa-ai-analysis-import-17__review-completed__converted-v1.0.0.json` | `11a91c80434c85e7a7daf465d0f80942b60afbaa7253ddc7d6955ee7ff9cc53e` | `9b4a2feda85f166b2c3a0283d33c2b6c25f88a6d46f636422abc630eec18bc9a` |
| `jaa-ai-analysis-import-59__review-completed__converted-v1.0.0.json` | `b61aa102108c139e92e1bd90ef5a03563b4e6748b7a2764ed3efced09a34fe61` | `9b1836f5ef97ae9bd3c0f7205f3854402981acf5d0772db3dd6926e06cc41b79` |
| `jaa-ai-analysis-import-59__review-partial-54-of-59__converted-v1.0.0.json` | `d26de4b51757502ad04d7b0fbdb31cbb547003cedce25a5c19fc105bc21c8515` | `c97a774d348aa0573a619dfc43828794d399c2b4c65336fbd3b5e7e2339f687c` |

## 6. 使用方式

在完成 v0.3.39「建立 AI 分析資料庫」後：

1. 進入「AI 分析資料庫」。
2. 選擇「匯入資料」。
3. 選擇上述 `jaa-ai-analysis-import-*.json`，不要選原本的 `manual-skill-review-*.json`。
4. 檢查 Preflight 顯示的 records、findings、review rank 與 replacement protection。
5. Confirm Import。

如果先匯入 `REVIEW_COMPLETED`，之後再匯入來源相同的 `REVIEW_PARTIAL`，Review Rank Protection 必須阻止較低 Rank 覆蓋較高 Rank。
