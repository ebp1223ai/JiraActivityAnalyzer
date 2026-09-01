# Skill Analysis Rule Set Manifest v1.4.0

- File: `Skill_Analysis_Rule_Set_Manifest_v1.4.0.md`
- Manifest Version: `1.4.0`
- Previous Version: `1.3.0`
- Rule Set ID: `JAA-SKILL-ANALYSIS-BASELINE-5`
- Status: `baseline-draft`
- Language: `zh-TW`
- Purpose: 使用 1 份 Pending Analysis JSON 與 3 份分析依據 MD，直接產生 JAA v0.3.38 可匯入的 AI_ONLY Package

## 1. 本次分析輸入

模型必須完整讀取：

| Role | 檔案規則 | 作用 |
|---|---|---|
| `PENDING_ANALYSIS_JSON` | 一份 `pending-analysis*.json` | 待分析 records 與來源身分 |
| `RULE_SET_MANIFEST` | `Skill_Analysis_Rule_Set_Manifest_v1.4.0.md` | 任務、封裝與輸出契約 |
| `COMMON_RULES` | `Skill_Classification_Common_Rules_v2.4.0.md` | 分類語意 |
| `SKILL_CATALOG` | `Skill_Catalog_v0.3.4.md` | 279 個 Skill 的 ID、名稱與邊界 |

`Skill_Analysis_HTML_Report_Template_v1.10.0.md` 是分析後的呈現／人工驗收契約，不參與技能判斷。使用者可在同一工作中一併提供，要求模型先產生 Package，再依 Template 產生 HTML。

`jaa-ai-analysis-import-package_v1.0.0.schema.json` 是 JAA／驗證器的機器契約，日常雲端分析不要求使用者額外上傳；本 Manifest 已完整指定輸出欄位與 Schema 身分。

## 2. 綁定文件與契約

| Role | Filename | Bytes | SHA-256 |
|---|---|---:|---|
| `COMMON_RULES` | `Skill_Classification_Common_Rules_v2.4.0.md` | 22078 | `1a44d74f2e08af7eb2a19e302415ae9e81082a67fa94c7ac265382b5a89a9ff7` |
| `SKILL_CATALOG` | `Skill_Catalog_v0.3.4.md` | 30237 | `f9d3e28542e9ebd19b097ab33c59602fc00aa317022fab2a33ee77e25adf89a4` |
| `IMPORT_PACKAGE_SCHEMA` | `jaa-ai-analysis-import-package_v1.0.0.schema.json` | 31380 | `6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c` |

若 Common Rules、Catalog 或 Schema 身分不符，不得猜測相容性或宣稱可供 JAA 匯入。Manifest 本身的 SHA-256 由實際檔案計算並寫入輸出 `rulesBinding.manifestSha256`，不能在 Manifest 內自我綁定。

## 3. 唯一正式任務

1. 依 Common Rules 與 Skill Catalog 分析 Pending 根物件的全部 `records[]`。
2. 產生且只產生一個 `jaa-ai-analysis-import-package v1.0.0` JSON object。
3. 首次分析輸出必須是 `reviewCoverage.state = NONE`、`reviewRank = AI_ONLY`，每筆 `manualReview = null`。
4. HTML Template 不得改變分類結果；它只負責呈現、保存 Review JSON，以及匯出加入人工驗收層的同一 Package。

模型不得在正式 JSON 前後加入 Markdown、摘要或解釋；也不得直接建立 SQLite、執行匯入、修改 JAA 或偽造人工驗收。

## 4. Record Index、來源複製與去重

- `recordIndex` 是 Pending `records[]` 的零起始位置。
- `sourceReference` 必須完整複製同位置的 `record.reference`，不得正規化或推論。
- `sourceSnapshot.diffHunks` 與 Diff 計數、availability、integrity 必須完整複製同位置的 `record.diff`／`record.integrity`。
- Pending 未提供結構化 Issue Type、Priority、Issue Status 時，三欄必須為 `null`；不得從文字推測。
- `readableContent` 只可由同一 record 的 Diff lines 確定性還原。
- `dedupeKey` 必須是下列 UTF-8 字串的 SHA-256 lowercase hex：

```text
JAA-AI-RECORD-v1

{sourceDatabaseId}

{evidenceId}
```

## 5. Evidence 與 aiAnalysis

Evidence 的主要 JSON Pointer 為：

```text
/records/{recordIndex}/diff/diffHunks/{hunkIndex}/lines/{lineIndex}/text
```

`aiAnalysis` exact fields：

```json
{
  "status": "CLASSIFIED",
  "confidence": 0.9,
  "skillFindings": [],
  "recordNegativeChecks": [],
  "unknownReasons": [],
  "rationale": "..."
}
```

每個 Skill Finding exact fields：`skillId`、`skillName`、`group`、`catalogSupport`、`confidence`、`evidence[]`、`evidenceExplanation`、`negativeChecks[]`、`rationale`。分類語意、Confidence、Multi-skill 與 Status 矩陣以 Common Rules v2.4.0 為準。

## 6. 唯一輸出 Root

```json
{
  "schemaName": "jaa-ai-analysis-import-package",
  "schemaVersion": "1.0.0",
  "schemaSha256": "6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c",
  "minimumImporterVersion": "0.3.38",
  "requiredCapabilities": [
    "AI_ANALYSIS_SQLITE_V1",
    "SOURCE_RECORD_LINK_V1",
    "MANUAL_REVIEW_LAYER_V1"
  ],
  "packageId": "UUID",
  "createdAt": "ISO-8601",
  "generator": {
    "name": "雲端 AI 名稱",
    "version": "模型或流程版本",
    "mode": "CLOUD_AI_ANALYSIS"
  },
  "sourceBinding": {},
  "rulesBinding": {},
  "templateBinding": null,
  "reviewCoverage": {
    "state": "NONE",
    "reviewRank": "AI_ONLY",
    "reviewedRecordCount": 0,
    "completedRecordCount": 0,
    "totalRecordCount": 59
  },
  "records": [],
  "counts": {},
  "integrity": {},
  "conversionReceipt": null
}
```

`sourceBinding` 必須複製 Pending filename、SHA-256、schema、source database identity、exportId、sourceView、createdAt、timezone、record count、`querySnapshot` 與 `exportMetadata`。

`rulesBinding` 必須包含 Rule Set ID 及三份分析依據的 version／SHA-256。`templateBinding` 在 AI_ONLY 階段固定為 `null`。

每個 `records[]` exact fields：

```json
{
  "recordIndex": 0,
  "dedupeKey": "64 lowercase hex",
  "sourceReference": {},
  "sourceSnapshot": {},
  "aiAnalysis": {},
  "manualReview": null,
  "integrity": {}
}
```

## 7. Review Coverage 與覆蓋保護

| State | Review Rank | 條件 |
|---|---|---|
| `NONE` | `AI_ONLY` | 全部 `manualReview = null` |
| `PARTIAL` | `REVIEW_PARTIAL` | 至少一筆有人工 Review，但並非全部 completed |
| `COMPLETED` | `REVIEW_COMPLETED` | 每筆都有 Review 且 `completed=true` |

雲端首次分析只能輸出 `NONE / AI_ONLY`。HTML v1.10.0 才可根據人工操作建立 `PARTIAL` 或 `COMPLETED` Package。JAA 匯入時低 Rank 不得覆蓋高 Rank；此規則由 JAA Importer 執行，模型不得假設覆蓋成功。

## 8. Integrity

- Canonicalization：RFC 8785；Hash：SHA-256 lowercase hex。
- `sourceReferencesSha256`：全部 `sourceReference + sourceSnapshot` 的 canonical array。
- `aiAnalysisSha256`：全部 `aiAnalysis` 的 canonical array。
- AI_ONLY 的 `manualReviewSha256 = null`。
- `packageSha256` 計算時省略 `integrity.packageSha256` 欄位本身。
- 每筆也必須計算 sourceReference、sourceSnapshot、aiAnalysis、manualReview 與 record Hash。
- HTML 匯出前後，Source 與 AI Analysis Hash 必須完全相同。

## 9. Counts 與完成閘門

- `records.length = sourceBinding.sourceRecordCount = counts.sourceRecordCount = counts.recordCount`。
- `recordIndex` 必須連續為 `0..N-1`。
- `dedupeKey`、`evidenceId` 在 Package 內唯一。
- `counts.aiStatusCounts` 必須由 records 重算；總和等於 record count。
- `counts.skillFindingCount` 必須等於全部 Findings 總數。
- CLASSIFIED 至少一個 Finding；UNKNOWN／EXCLUDED 不得有 Finding；FAILED 僅用於單筆解析／完整性失敗。
- 每個 Finding 的 Skill ID／Name／Group 必須與 Catalog 一致，且同一 record 不得重複 Skill ID。

任何完整性閘門失敗時，不得把殘缺內容宣稱為可匯入 Package；應明確回報無法產生正式輸出。

## 10. Provider-neutral 與檔案角色

- 任何能完整讀取輸入並遵守此契約的雲端／地端模型均可執行。
- Review JSON 用於保存人工驗收進度與回饋規則；不是 JAA AI 資料庫的匯入格式。
- `jaa-ai-analysis-import-package v1.0.0` 才是 JAA v0.3.38 的唯一匯入格式。
- 舊格式不由 JAA 轉換；需要時由雲端 AI 依本契約轉換並附 `conversionReceipt`。

## 11. 最小包裝指令

> 請完整讀取 1 份 Pending Analysis JSON 與 3 份分析依據 MD。依 Manifest、Common Rules、Skill Catalog 分析全部 records，並只回傳符合 `jaa-ai-analysis-import-package v1.0.0` 的完整 AI_ONLY JSON。不要回傳 Markdown、前言、摘要或其他檔案。

若另提供 HTML Template，可在完成上述 JSON 後，再以該 JSON＋Template 產生獨立 HTML 檔；不得因呈現需求改變 JSON 的 Source 或 AI Analysis。

## 12. 版本紀錄

### v1.4.0

- 正式分析輸出由 legacy `jaa-skill-analysis-result v1.0.0` 升級為 `jaa-ai-analysis-import-package v1.0.0`。
- Rule Set ID 更新為 `JAA-SKILL-ANALYSIS-BASELINE-5`。
- 綁定 Common Rules v2.4.0、Skill Catalog v0.3.4 與 Import Package Schema SHA-256。
- 新增完整 Source Binding、Source Snapshot、dedupeKey、Review Coverage、Integrity 與 JAA v0.3.38 相容性規則。
- 首次分析固定為 AI_ONLY；人工驗收由 HTML Template v1.10.0 新增 `manualReview` 層。

### v1.3.0

- legacy 分析輸出版本；綁定 Common Rules v2.3.0 與 Skill Catalog v0.3.4。
