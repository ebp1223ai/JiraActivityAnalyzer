# Skill Analysis Rule Set Manifest v1.6.1

- File：`Skill_Analysis_Rule_Set_Manifest_v1.6.1.md`
- Manifest Version：`1.6.1`
- Previous Version：`1.6.0`
- Rule Set ID：`JAA-SKILL-RULESET-v1.6.1`
- Status：`APPROVED / PACKAGE-ONLY-REVIEW / LOSSLESS-SOURCE-TRACE`
- Prepared Date：`2026-09-07`
- Input Mode：`1 Pending JSON + 3 Analysis MD`
- Output Contract：`jaa-ai-analysis-package v2.0.1`

## 1. 權威文件綁定

| Role | File | Version | Bytes | SHA-256 |
|---|---|---:|---:|---|
| Common Rules | `Skill_Classification_Common_Rules_v2.6.1.md` | 2.6.1 | 24640 | `d4fa8775bb9c71cb2fec67657d861c04ea2f7363f48c6a801a9d70de671757c5` |
| Skill Catalog | `Skill_Catalog_v0.3.5.md` | 0.3.5 | 30465 | `d32eb58ff7ea01931e889d97e2f4b1a30ed35a5cce17a293ba37b0e19d73d006` |
| HTML Template | `Skill_Analysis_HTML_Report_Template_v1.13.2.md` | 1.13.2 | 17235 | `6466a42b30c4ef92952ae2ade7f27b8684308bbdbbb61799a3245f6da7ba8458` |
| Source Trace Schema | `jaa-source-trace_v1.0.0.schema.json` | 1.0.0 | 4699 | `b96147f4a2f766fb39679beeba66ef4ea210f290bc69078b88456fc8b5b8e6e7` |
| Analysis Package Schema | `jaa-ai-analysis-package_v2.0.1.schema.json` | 2.0.1 | 8919 | `cd6a6d1385b5a49f5c56b14d97ccfe21008102c41b0ac5a9e20c7c97ca39a9db` |

任一檔名、版本、Bytes 或 SHA-256 不一致時，不得默認套用其他版本；必須回報 `RULESET_BINDING_MISMATCH`。

## 2. 文件責任

| 文件 | 唯一責任 |
|---|---|
| Manifest | Input／Output、Source Trace、Count／Identity、文件綁定與失敗條件 |
| Common Rules | Skill 分類語意、Evidence、Confidence、Status、Multi-skill 與 Mutation Boundary |
| Skill Catalog | 279 個 Skill ID、名稱、Group 與候選邊界 |
| HTML Template | 離線呈現、人工驗收、Review Progress 與完整 Package 匯出 |
| JSON Schema | 機器可讀結構與 Required Fields |

## 3. 輸入

正式分析輸入：

1. 一份 `jira-activity-analyzer.pending-analysis` JSON。
2. 本 Manifest。
3. 綁定的 Common Rules。
4. 綁定的 Skill Catalog。

HTML Template 用於產生人工驗收 HTML，不參與 Skill 判斷。

必須一次分析整份 Pending JSON，不得預設切成每 20 筆、不得進行 repair batch、不得省略 Record。

## 4. Pending 是 Source Trace 唯一來源

Cloud AI 必須保留 Pending Root 的：

```text
schemaName
schemaVersion
contractStatus
exportId
createdAt
timezone
appVersion
sourceView
sourceDatabase
querySnapshot
exportMetadata
counts
integrity
diagnostics
```

每筆必須原樣保留：

```text
records[i].reference
records[i].diff
records[i].integrity
```

不得只保存 Evidence Quote、Issue Key 或 AI 判斷所需欄位。

## 5. Exact Mapping

| Pending | Package v2 |
|---|---|
| Root metadata（不含 records） | `sourceTrace.pendingDocument` 與同層明確欄位 |
| `sourceDatabase` | `sourceTrace.sourceDatabase` |
| `sourceView` | `sourceTrace.sourceView` |
| `querySnapshot` | `sourceTrace.querySnapshot` |
| `exportMetadata` | `sourceTrace.exportMetadata` |
| `records[i].reference` | `records[i].sourceTrace.reference` |
| `records[i].diff` | `records[i].sourceTrace.diff` |
| `records[i].integrity` | `records[i].sourceTrace.pendingIntegrity` |
| AI 分類結果 | `records[i].aiAnalysis` |
| 首次分析 | `records[i].manualReview = null` |

所有 Source Trace Mapping 必須 Deep Equal。不得正規化空白、換行、Unicode、null、空字串、陣列順序或物件值。

## 6. Identity 守恆

每筆至少保存並核對：

```text
recordIndex
reference.evidenceId
reference.activityEventId
reference.sourceDatabaseId
reference.sourceRecordStableId
reference.issueKey
reference.fieldName
reference.eventTime
```

必須滿足：

- Package `records.length` 等於 Pending `records.length`。
- `recordIndex` 完整覆蓋 `0..N-1`。
- 相同位置的上述 Identity 完全一致。
- `sourceTrace.sourceDatabase.sourceDatabaseId` 等於每筆 `reference.sourceDatabaseId`。
- 不得以 Hash 取代 Identity 核對。

## 7. Mutation Boundary

- Cloud AI 只能寫 `aiAnalysis`、Package generator／rulesBinding／counts。
- HTML 只能寫 `manualReview`、Review Rank、Review counts 與新的 Package metadata。
- JAA 只能寫 DB／Import／Link Attempt 狀態。
- Source Trace 在所有階段唯讀。

## 8. Review Rank

```text
AI_ONLY          = 全部 manualReview 為 null
REVIEW_PARTIAL   = 至少一筆 manualReview 存在，但未全部 completed
REVIEW_COMPLETED = 全部 Record 都有 manualReview 且 completed=true
```

三種狀態使用同一 `jaa-ai-analysis-package v2.0.1` Schema。

## 9. Hash 規則

Hash 只能作選用 `integrityReceipt`，用來比較某份資料與可信任摘要是否改變。Hash 不得：

- 建立或取消 Source Link。
- 判斷資料是否可追溯。
- 取代 Required Field／Deep Equality／Identity 驗證。
- 阻止已 Identity Match 的整合顯示。

沒有可信任 Expected Digest 或 Contract 不一致時，Integrity Status 為 `UNVERIFIABLE`，不得宣稱 Record 沒有關聯。

## 10. AI 分析輸出

每筆 `aiAnalysis` 必須包含：

```text
recordIndex
evidenceId
sourceRecordStableId
issueKey
status
confidence
skillFindings
recordNegativeChecks
unknownReasons
rationale
```

分類語意完全依 Common Rules v2.6.1 與 Catalog v0.3.5。

## 11. Fail-closed

以下任何情況禁止宣告成功：

- `RULESET_BINDING_MISMATCH`
- `PENDING_SCHEMA_UNSUPPORTED`
- `SOURCE_TRACE_REQUIRED_FIELD_MISSING`
- `SOURCE_TRACE_MUTATED`
- `RECORD_COUNT_MISMATCH`
- `RECORD_ORDER_MISMATCH`
- `RECORD_IDENTITY_MISMATCH`
- `UNKNOWN_SKILL_ID`
- `PACKAGE_SCHEMA_INVALID`

失敗時不得輸出部分 Records 冒充完整 Package。

## 12. 完成前自我驗證

1. 全部綁定文件 SHA-256、Bytes、版本一致。
2. 已讀取全部 Pending Records。
3. Package 與 Pending Record Count 相同。
4. 全部 Source Trace Deep Equal。
5. 全部 Record Identity 一致。
6. 每個 AI Status／Skill Finding 符合 Common Rules。
7. 所有 Skill ID 存在 Catalog。
8. 首次分析 Review Rank 為 AI_ONLY。
9. Package 通過兩份 JSON Schema。
10. 最終輸出為一份完整 JSON；HTML 另依 Template 產生。

## 13. Legacy

- 舊 Analyzed／Review Overlay 單檔不能還原完整 Source Trace。
- 只有 Pending＋Analyzed＋Review 三檔齊全且 Identity 一致時，才能轉換 v2 Package。
- 不得從 Rationale、Evidence、人工備註或 Hash 猜測缺失來源欄位。

## 14. Change History

| Version | Date | Change |
|---|---|---|
| 1.6.1 | 2026-09-07 | 修正 Package Skill ID 格式，綁定 Package v2.0.1、Rules v2.6.1、Template v1.13.2；SQLite 不變 |
| 1.6.0 | 2026-09-02 | 綁定 Common Rules v2.6.0 與 Template v1.13.1；移除 Review Progress 專屬格式，三種 Review Rank 統一使用 Package v2 |
| 1.5.0 | 2026-09-02 | Package v2、Lossless Source Trace、Identity 守恆、Mutation Boundary、Hash 非關聯與 Schema 綁定 |
| 1.4.0 | 2026-09-01 | Import Package v1 與雲端分析／HTML／JAA DB 角色整合 |

## v1.6.1 契約修正與版本隔離

- Package v2.0.1 只修正 skillId 格式及自身版本／Schema ID；Source Trace v1.0.0、Catalog v0.3.5、SQLite DDL v2.0.0 保持原始位元組。
- 正式輸出 schemaVersion=2.0.1；不能把新 Schema 冒充舊版 v2.0.0。
- 舊 v2.0.0 Schema 保留作離線相容性驗證，不是新分析的輸出綁定。
- 下載檔名的 `(1)` 等後綴僅是傳輸別名；用內容、內部身分及原綁定雜湊核對後，交付使用標準檔名。
- Dedupe key 使用 `sourceDatabaseId + ":" + activityEventId`，不使用 hash。
- Evidence pointer 採 Pending `/records/i/diff/.../text` 座標；在 Package 內解析時映射為 `/records/i/sourceTrace/diff/.../text`。quote 必須與原始字串連續子字串相等，不把顯示層解碼結果當成來源文字。
- 本次 compact-reference 資料中沒有的 Issue Type／Priority／Status 與圖片內文不得補造。
