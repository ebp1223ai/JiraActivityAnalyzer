# JAA AI Analysis Database Design v2.0.0

- Target Application：JiraActivityAnalyzer `v0.3.41`
- Schema：`jaa-ai-analysis-sqlite v2.0.0`
- DDL：`JAA_AI_Analysis_SQLite_Schema_v2.0.0.sql`
- Package Contract：`jaa-ai-analysis-package v2.0.0`
- Source Trace Contract：`JAA-SOURCE-TRACE-v1`
- Status：`APPROVED / FROZEN FOR v0.3.41`

## 1. 目的

AI SQLite 必須完整保存由 Pending Analysis JSON 提供的可追溯資訊，並將 Source Trace、AI Analysis、Manual Review 與 Source Link Attempt 分層保存。任何階段不得因欄位未拆成 SQLite Column 而遺失來源資料。

## 2. 不可違反的原則

1. Pending 是 Source Trace 唯一來源。
2. `source_trace_json` 是 AI DB 來源資料的權威副本。
3. Column 只作查詢索引，必須能與完整 JSON 核對。
4. Hash 只可作選用 Integrity Receipt，不能證明關聯性或可追溯性。
5. Primary／Fallback／Relink 不得使用 Hash 選擇候選。
6. 原始 SQLite 永遠唯讀。
7. Source Link Attempts append-only。
8. 新 AI_ONLY 不得覆蓋既有 REVIEW_PARTIAL／REVIEW_COMPLETED。
9. Legacy 缺失欄位不得猜測、補造或從 AI 文字反推。

## 3. 資料表責任

| 資料表 | 權威內容 |
|---|---|
| `ai_import_batches` | Package、Preflight、來源 DB Binding、Review Rank、Transaction |
| `ai_records` | Canonical Identity、目前 Trace／Link／Integrity 狀態、Active Version |
| `ai_record_source_traces` | 完整不可變 Source Trace JSON 與每次觀測來源 |
| `ai_record_analyses` | 每次 AI Analysis 版本 |
| `ai_record_reviews` | 每次人工驗收版本及其 Analysis Binding |
| `ai_skill_findings` | 可查詢 Skill Finding 投影 |
| `source_link_attempts` | 每次 Relink 的輸入、候選、結果與錯誤 |

## 4. Identity 與去重

### 4.1 Primary Identity

```text
sourceDatabaseId + activityEventId
```

`ai_records` 對此組合建立唯一約束。`databaseGeneration` 必須保存，但不同 Generation 不拆散同一 Activity Event 的邏輯 Identity。

### 4.2 Fallback Identity

只有 Primary 找不到候選時才可使用：

```text
sourceDatabaseId
+ sourceRecordStableId
+ fieldIdentity／fieldName
+ eventTime
```

Fallback 唯一命中標記 `FALLBACK_MATCHED`；不得偽裝為 `PRIMARY_MATCHED`。

### 4.3 Review Rank

```text
REVIEW_COMPLETED > REVIEW_PARTIAL > AI_ONLY
```

同一 Record 匯入新 Package 時：

- 更低 Review Rank 不得改變 Active Review。
- 新 Source Trace 若更完整，可補齊 Trace 層。
- 新 AI Analysis 以新版本保存，不刪除舊 Analysis。
- 舊 Active Review 仍綁定原 Analysis；除非有合法較高或同 Rank 新 Review，否則不得重綁。

## 5. Source Trace 完整度

| 狀態 | 定義 |
|---|---|
| `COMPLETE` | v1 Schema、Count、Order、Identity、Reference、Diff、Pending Integrity 全部通過 |
| `PARTIAL` | 保留部分可追溯欄位，但不符合完整契約 |
| `MISSING` | 無法取得必要 Record Trace |
| `INVALID` | 欄位存在但互相衝突或格式錯誤 |

`COMPLETE` 必須由 validator 推導，不能相信輸入檔自行宣告。

## 6. Source Link

### 6.1 Primary 流程

1. 確認目前 Raw DB Identity。
2. 以 `sourceDatabaseId + activityEventId` 查詢。
3. 0 筆才進入 Fallback。
4. 1 筆建立 `PRIMARY_MATCHED`。
5. 多筆標記 `AMBIGUOUS`，不得任意選擇。

### 6.2 Database Generation

- 相同：`SAME`。
- 不同：仍可建立 Identity Link，但標記 `GENERATION_DIFFERENT`／`DIFFERENT` 警告。
- 未知：`UNKNOWN`，不得宣稱相同世代。

### 6.3 Relink

Relink 重新執行 Identity 查詢並新增 `source_link_attempts`。它不能修改 Source Trace、AI Analysis、Manual Review，也不能靠 Hash 修復關聯。

## 7. Integrity Receipt

Integrity Receipt 為選用欄位：

```text
VERIFIED
MISMATCH
UNVERIFIABLE
NOT_CHECKED
ERROR
```

Integrity Status 與 Link Status 完全獨立。合法組合：

```text
source_trace_status = COMPLETE
source_link_status  = PRIMARY_MATCHED
integrity_status    = UNVERIFIABLE
```

這筆仍須出現在 Integrated Results。

## 8. Import Transaction

1. UTF-8 parse。
2. Package v2 Schema。
3. Source Trace v1 Schema。
4. Count／Order／Identity 守恆。
5. Rule／Catalog／Template Binding。
6. 建立 Transaction。
7. Upsert Batch、Record、Trace、Analysis、Review、Finding。
8. Read-back Deep Equality。
9. 任一步驟失敗整批 Rollback。
10. 只有 COMMITTED 批次出現在正式 Import History。

## 9. Schema v1 → v2 Migration

1. 關閉寫入並執行 `PRAGMA integrity_check`。
2. 建立可恢復 Backup。
3. Transaction 建立 v2 Tables／Indexes／Triggers。
4. 舊 Record 依現有欄位遷移，不補造資料。
5. 舊 Trace 標記 `PARTIAL／MISSING`。
6. 舊 Link 標記 `NOT_ATTEMPTED`，舊 Hash 狀態標記 `UNVERIFIABLE`。
7. Commit 後再次 integrity check 與 count reconciliation。
8. 失敗自動 Rollback，保留原 v1 DB 與 Backup。

## 10. UI Query

- AI Results 只查 AI SQLite。
- Integrated Results 以 Raw SQLite 為母體，LEFT JOIN AI SQLite Active Record。
- 顯示 Trace、Link、Integrity 三種獨立狀態。
- Hash 狀態不得成為 LEFT JOIN 條件。
- 所有 Query 必須支援 cancel／request ID／stale response discard。

## 11. Debug Bundle

必須輸出：

- Active AI DB identity、path、schema、integrity check。
- Migration before／after counts。
- Import Batch Preflight、Transaction、Read-back。
- Trace Completeness Summary 與缺失 JSON Pointer。
- Link Attempt Identity Query、candidate count、matched ID、Generation、duration、failure reason。
- 不輸出 credentials；預設不複製完整 AI SQLite。

## 12. 驗收門檻

- 59/59 Pending → AI_ONLY → HTML Export → AI SQLite Read-back Source Trace Deep Equal。
- 76/76 現有 Primary Identity 唯一命中。
- 0 筆因 Hash 阻止 Link 或 Integrated Results。
- AI_ONLY 補 Trace 時不覆蓋 Completed Review。
- Migration、Rollback、Backup、Relink history 全部有自動測試。
