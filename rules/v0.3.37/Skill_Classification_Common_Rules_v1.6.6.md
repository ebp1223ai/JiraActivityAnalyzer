# 技能分類通用規則 v1.6.6

- File: `Skill_Classification_Common_Rules_v1.6.6.md`
- Rules Version: `1.6.6`
- Previous Version: `1.6.5`
- Schema Version: `1.6.6`
- Status: `proposed`
- Effective Date: `2026-08-25`
- Current Catalog Baseline: `Skill_Catalog_v0.3.1.md`（目前為 review-draft）
- Previous Catalog Baseline: `skills_classification_transfer_pack_v0.2`
- Decision Contract: `jaa-ai-analysis-decisions-v5`
- Quality Contract: `jaa-ai-analysis-quality-v4`
- Evidence Normalizer: `JAA-EVIDENCE-NORMALIZER-1.0.0`
- Evidence Segmenter: `JAA-EVIDENCE-SEGMENTER-1.0.0`
- Evidence Quote Catalog: `JAA-EVIDENCE-QUOTE-CATALOG-1.0.0`
- Report Data Package Contract: `jaa-analysis-report-data-package-v1`
- Issue Snapshot Profile: `jaa-issue-snapshot-profile-v1`
- Scope: Evidence segmentation、歸屬、權重、Decision v5、信心、排除、追溯、聚合驗證、Quality Gate、資料分層、Issue Snapshot 與報告共同規則

## 1. v1.6.6 核心變更

本版延續 v1.6.5 的單一 Host Controller、Artifact-as-Completion、Validation causal truth、Terminal Reducer 與 Post-Artifact recovery，以及 v1.6.2／v1.6.3 的 Multi-skill Evidence Coverage v2、Catalog Detail Status、Quality Gate v4、Validation Receipts V2、Decision v5、Quote Catalog、Snapshot 與 Report Data Package 分層；依 v0.3.36 真實 17 筆 Managed ChatGPT Run 修正 durable artifact truth 競態，並建立 Provider-neutral Analysis Core：

1. `DurableArtifactTruthResolver` 只能從 durable Artifact、Artifact receipt、Run Manifest 與 append-only fact journal 判定 Artifact 是否已保存；禁止使用 callback closure、記憶體布林值或 UI projection。
2. Artifact submission 的持久化順序固定為 receive、token／binding 驗證、寫入、fsync、reopen／hash、persisted receipt、append fact、lifecycle、Post-Artifact 排程、validating、回覆 persisted。
3. Terminal Reducer 每次決策前必須重讀 durable facts；Provider completed 且 Artifact 已 persisted 時只能執行或延後 Post-Artifact pipeline，不能產生 no-artifact terminal。
4. 新增 hash-chained append-only reducer fact journal，保存 Provider、Artifact、Validation、Post-Artifact、Recovery 與 Cancel facts。
5. Post-Artifact 14 stages 必須真正接線、逐階段 durable receipt，並以 `runId + artifactSha256 + stage` 冪等。
6. App 啟動與操作者「重新處理已保存的分析結果」可恢復 persisted Artifact；不得呼叫 Provider、消耗 token或改寫原始 submission。
7. 已存在的錯誤 terminal 不可刪除或改寫；Recovery 另建 audit／supersession receipt，標示 `superseded_by_recovery`。
8. 在產生 `AI_ARTIFACT_SUBMISSION_MISSING` 前必須執行 terminal contradiction guard；若發現任何 Artifact durable evidence，改用 `AI_TERMINAL_FACT_RECONCILIATION_REQUIRED` 並進入 recovery。
9. 分析核心採共用 `ProviderAnalysisRequest` 與 `ProviderAnalysisArtifact`；Provider artifact 不得包含 Canonical、HTML、SQLite 或 Host-owned identity。
10. 所有分析來源經由 `AnalysisProviderAdapter` 的 capability、preflight、analyze、cancel 與 optional recover 邊界；傳輸細節留在 Adapter，分類契約共用。
11. 現行 ChatGPT／Bundled Codex 流程封裝為 `ChatGptCodexProviderAdapter`；JAA core 不得直接依賴 Codex Thread、Turn 或 dynamic tool type，仍維持單一 request／thread／turn、1 JSON + 3 MD、無 batch／repair／fallback。
12. 新增 test-only `MockAnalysisProviderAdapter`，在不使用 Codex、登入、Thread／Turn 或網路的情況下，驗證同一 Artifact 可走完整 downstream pipeline；不得暴露於 production provider selector。

v1.6.4、v1.6.3 與 v1.6.2 建立的其他規則全部維持。
v1.6.0 建立的下列規則全部維持：

1. JAA 在送出前建立 frozen Evidence Quote Catalog，模型只能引用既有 `evidenceQuoteId`。
2. Evidence 明確分為 `PRIMARY_CHANGE`、`SUPPORTING_CONTEXT` 與 `INELIGIBLE`。
3. `CLASSIFIED` 的每個 Skill Finding 至少需要一個可歸因的 `PRIMARY_CHANGE`；Diff context 不得單獨證明使用者技能。
4. `SUPPORTING_CONTEXT` 只能補充 primary evidence；只有 context 的技術候選應依證據降為 `UNKNOWN` 或 `EXCLUDED`；若已有合理 Skill 但 Catalog Detail 不足則使用 `CATALOG_DETAIL_MISSING`。
5. 模型不再重打 quote／Evidence Ref／Segment ID／Role；每個 Skill Finding 只提交 `evidenceQuoteIds[]`。
6. Validator 改為聚合式 findings；只要後續仍可安全唯讀檢查，就不得在第一個錯誤停止。
7. 新增 non-substantive evidence、boilerplate explanation、context-only classification 與 traceability Quality Gate。
8. Artifact 可解析但正式 gate 失敗時，由 JAA 本機產生 `DIAGNOSTIC_NON_CANONICAL` HTML；不得寫入 SQLite。
9. 待分析 JSON 不攜帶完整 Issue Snapshot；已分析 JSON 只新增分析結果、驗證結果與 Snapshot Reference，不重複嵌入完整 Snapshot。
10. 完整 Issue Snapshot 由原始 Jira 資料庫維持權威；AI Analysis DB 只保存可驗證的 Snapshot ID／SHA-256 reference。
11. JAA 在 Canonical 成功後自動建立 `jaa-analysis-report-data-package-v1`，每個跨伺服器 Unique Issue 只保存一份 Snapshot。
12. HTML 只讀取 Report Data Package + HTML Template；不得開啟報告時即時查詢 Jira／SQLite，亦不得重新分類。
13. Template 只以 allowlisted declarative DSL 決定顯示統計、篩選、欄位與版面；去重、時間、Snapshot 與核心統計語意由 renderer 固定。
14. Snapshot 欄位以 `PRESENT`、`EMPTY`、`NOT_APPLICABLE`、`NOT_CAPTURED`、`SOURCE_UNAVAILABLE`、`CONFLICT` 表達狀態，不得把不同原因都壓成 null。
15. 同一份 Report Data Package 可由多份相容 Template 產生多份 HTML；重新渲染不得呼叫 ChatGPT 或消耗 Provider token。
16. 模型不再回傳 Run／source／rule identity；JAA 以 opaque submission token 及本機 immutable identity 組裝 Artifact。
17. 可解碼的 AI submission 在正式驗證前必須 durable 保存；formal gate 失敗仍產生 diagnostic package／HTML，但不建立 Canonical 或寫 SQLite。
18. 不設定預期狀態分布、固定分類率或固定 Skill 數量；不得以格式通過為理由改變實際分析判斷。

v1.2.1 已建立的 Status 判斷順序、Common Rules／Catalog／Manifest 分離、Detail Description 與追溯要求全部維持。

## 2. 規則架構

```text
Common Rules
+ Skill Catalog
+ Rule Set Manifest
+ Report Template
```

### Common Rules

負責：

- Evidence 權重
- Author attribution
- Negative rules
- Confidence
- Multi-skill
- Decision v5 per-skill Finding 與 Evidence Segment role
- Evidence Normalization／Traceability
- Schema／Semantic／Quality Gate
- Bundle 隔離
- 報告格式
- Catalog 使用規範

### Skill Catalog

負責：

- Group
- Skill ID
- Skill Name
- Detail Description
- Aliases
- Strong / Medium / Weak Signals
- Negative Rules
- Evidence Fields
- Disambiguation
- Confidence Notes
- Change History

### Rule Set Manifest

負責將以下版本綁定：

```text
rule_set_id
common_rules_version
skill_catalog_version
report_template_version
classification_engine_version
compatible_sources
generated_at
```

### HTML Report Template

負責：

- 本機 Golden HTML 的版面、欄位、標籤、色彩 token、進階複選篩選、欄位顯示與排序規格
- Report Data Package 到 HTML View Model 的 deterministic mapping
- Event／Unique Issue 統計與欄位資料字典
- Template ID／版本／SHA-256 與 Renderer 相容性

HTML Report Template 不定義技能語意、不參與模型分類，也不得作為第四份 ChatGPT 分析依據。

## 3. 版本控管

採用 `MAJOR.MINOR.PATCH`。

- **MAJOR**：Group/Skill ID、核心資料模型、報告必備結構或介面不相容變更。
- **MINOR**：新增技能欄位、Evidence 權重、Catalog binding、disambiguation 或報告章節。
- **PATCH**：alias、negative rule、權重微調、文字與錯字修正。

### 自動推進

1. 使用者說「產生目前的技能分析報告通用規則」時，自動整理自上版以來已確認變更並建立新版本。
2. 使用者提出可泛化的明確改動需求時，建立新版本。
3. 不覆蓋舊版，必須保留 `previous_version` 與 CHANGELOG。
4. 單一 JIRA 個案修正不自動升版，除非使用者明確要求納入通用規則。
5. 每份技能分析報告必須標示：
   - `common_rules_version`
   - `skill_catalog_version`
   - `rule_set_id`
   - `classification_version`

## 4. 新 Debug Bundle 隔離

每次收到新的 `jira-activity-analyzer-debug-bundle`：

- 重新解析 `selectedUser`。
- 重新解析 `dateRange`。
- 重新建立 Issue、Evidence、Classification、Needs Review 與統計。
- 不得繼承上一包的使用者、日期、Issue、Evidence ID、分類結果或報告統計。
- 只能沿用已版本化 Common Rules、Skill Catalog、正式規則與固定模板。

## 5. Bundle 分析前檢查

1. Bundle 檔案清單。
2. selectedUser。
3. dateRange。
4. direct/full fetched/failed issue 數量。
5. comment/changelog/attachment/description/page diff 數量。
6. raw full-fetch issue data。
7. common_rules_version、skill_catalog_version、rule_set_id。

## 6. 分類流程

```text
Normalize source data
→ Build clean evidence chunks
→ Author attribution
→ Evidence weighting
→ Load bound Skill Catalog
→ Strong / Medium / Weak signals
→ Negative rules
→ Automation exclusion
→ Cross-group disambiguation
→ Multi-skill candidates
→ Score and confidence
→ Needs review
→ Full traceability
```

禁止只做 keyword match。

## 7. Evidence 權重

| Evidence 類型 | 權重 |
|---|---:|
| Confluence version diff | 1.00 |
| 使用者本人 Comment | 0.98 |
| 本人 Description / Page Body Delta | 0.95 |
| JIRA Description | 0.82 |
| Summary / Title | 0.72 |
| 本人 Changelog Delta | 0.65 |
| Labels / Custom Fields | 0.50 |
| 本人 Attachment Metadata | 0.35 |
| Activity Stream | 0.20 |
| Robot / Automation | 0.05 |
| Context Link Only | 0.05 |

## 8. Author Attribution

| Attribution | 權重 |
|---|---:|
| 本人直接作者 | 1.00 |
| 本人上傳附件 | 0.80 |
| 本人 changelog actor | 0.70 |
| Assignee / Reporter / Creator only | 0.30 |
| 其他人內容 | 0.10 |
| Robot / Automation | 0.00 |

## 9. 分數與 Confidence

```text
score =
signal_strength × 0.40
+ evidence_weight × 0.25
+ author_weight × 0.20
+ evidence_completeness × 0.15
- negative_penalty
```

- **High / `0.9`**：本人高權重 evidence + 多個 strong signals，且無排除條件。
- **Medium / `0.6`**：有 strong signal 但 evidence 較少，或多個 medium signals。
- **Low / `0.3`**：主要只有 title、label、metadata 或 attribution 不足。
- **None / `0`**：automation、workflow-only、非技術內容。
- **Needs Review**：候選合理，但上下文、作者歸屬或跨 Group 判斷不足。

Decision v5 的 Record 與 Skill Finding `confidence` 都必須是 JSON number，且只能使用：

```text
0
0.3
0.6
0.9
```

禁止輸出字串 `HIGH`、`MEDIUM`、`LOW`、`NONE`，也禁止 `0.8`、`0.95` 等契約外數值。Confidence 是受控傳輸值，不得為了通過 Schema 而改變 Status 或原始分析判斷。

## 10. Negative Rules

1. 禁止只做 keyword match。
2. 禁止單一 keyword 或縮寫高信心分類。
3. 禁止 substring 誤判。
4. status=DEBUGGING 不足以分類 Debug。
5. Group title/tag 不足以高信心分類。
6. Template / placeholder 不得作技能 evidence。
7. 附件檔名不可單獨分類。
8. Robot / automation 不算人員技能。
9. 不得將歷史 toValue 全部歸給本次修改者。
10. Debug 不可因 log/drivelog 獨佔同一 evidence。
11. 缺少正式 Detail Description 時，AI 不得虛構正式定義。
12. 只有「請提供 log／dump／資料」而沒有本人分析或技術判讀，不得強迫分類。
13. 只有「已上 Code／已完成／請驗證」等完成通知而沒有實際修改或分析內容，不得強迫分類。
14. 只有相同問題連結、Remote Link 或 Context Link，不得把連結目標內容自動歸給本 Evidence 作者。
15. 同一套通用句型不得複製成多筆 Evidence 的 `positiveSignals`、`negativeChecks` 或 `confidenceReason`；每筆必須能指出自己的內容依據。
16. 不得為了貼近範例、提高覆蓋率或達成固定 Skill 數量而強迫分類。

## 11. Decision v5、Multi-skill 與獨立證據

- 同一 Issue／Page／Evidence 可對應多個技能。
- 同一 Group 內不同 Skill 可以共存，不得預設只能選一個主要 Skill。
- 每個保留的 Skill 必須是獨立 `skillFindings[]` 物件，擁有自己的 Evidence Quote、Evidence Explanation、Negative Checks、Rationale 與 Confidence。
- 每個 Skill Finding 至少必須有一個可歸因的 `PRIMARY_CHANGE` Quote；可用不同 Quote 時應優先使用不同 Quote。
- 同一 Activity Event、Comment 或父層 `evidenceRef` 內的不同 Quote 可以分別支援不同 Skill。Validator 不得因父層 `evidenceRef` 相同就宣告證據不獨立。
- 跨 Group 共存需說明各自支撐的技術面向。
- 同 Group 共存也需說明 Skill 邊界，例如 GC kernel／flow 與 GC event scheduling、suspend／stop 與 pausing control。
- 同一 Quote 確實包含多個技術面向時可以支援多個 Skill，但每個 Skill 的 Explanation、Negative Checks 與 Rationale 必須指向不同技術面向。
- 若多個 Skill 只有完全相同的一句證據且沒有可區分的技術面向，不得複製理由湊成 multi-skill；模型必須依 Evidence 實況判斷，而不是套用全域單一 Skill 上限。
- 分析每筆 Evidence 時應先列出合理候選，再逐一執行該 Skill 的正向與負面檢查；不能找到第一個候選就停止。
- 不得為通過 Quality Gate 而刪除原本有充分證據的 Skill；排除合理候選必須留下 record-specific negative check。

### 11.0.1 Quote-level Independence Algorithm

JAA 必須使用 frozen Evidence Quote Catalog 建立每個 Quote 的權威鍵：

```text
QuoteIdentityKey =
  sourceRecordStableId
  + sourceJsonPointer
  + rawStartOffset
  + rawEndOffset
  + quoteSha256
```

對同一 Record 的每個 Skill Finding：

1. 只取 `evidenceRoleEligibility` 包含 `PRIMARY_CHANGE` 的 Quote。
2. 以 `QuoteIdentityKey` 去重；不同 `evidenceQuoteId` 若指向完全相同 key，仍算同一 Quote。
3. 計算此 Skill 的 Quote key 是否被同 Record 其他 Skill 使用。
4. 若至少一個 Quote key 未被其他 Skill 使用，標記為 `INDEPENDENT_PRIMARY_QUOTE`。
5. 父層 `evidenceRef`、container Evidence Segment 或 Comment ID 相同，不影響 Quote 的獨立性。
6. 不同 Quote span 可以位於同一行、同一 Comment 或同一 Diff；只要權威 key 不同且可 exact trace，就可分別支持不同 Skill。
7. 同一 Quote key 被多個 Skill 使用時，標記為 `SHARED_PRIMARY_QUOTE`，並比較各 Skill 的 Explanation、Negative Checks 與 Rationale 是否具體對應不同技術面向。
8. JAA 只能驗證與回報，不得自動刪除 Skill、替換 Quote、合併 Finding、降狀態或修改模型原始 Decision。

共用 Quote 但各 Skill 具有可區分的技術說明時，產生可覆核 Warning：

```text
MULTI_SKILL_SHARED_PRIMARY_QUOTE_REVIEW
```

共用 Quote 且模型文字相同或近似、沒有可辨識技術面向時，產生 Blocker：

```text
MULTI_SKILL_SHARED_QUOTE_UNDISTINGUISHED
```

Finding 必須指出 `recordIndex`、`skillId`、Primary Quote IDs、shared Quote keys、比較欄位、fingerprint、expected 與 observed，不得只列出整筆所有 Skill ID。

### 11.1 Record Decision Schema

模型正式 Decision 每筆只能包含：

```json
{
  "recordIndex": 0,
  "status": "CLASSIFIED",
  "confidence": 0.9,
  "skillFindings": [],
  "recordNegativeChecks": [],
  "unknownReasons": [],
  "rationale": "Record 整體判定理由"
}
```

- `recordIndex` 必須唯一且完整覆蓋 `0..N-1`。
- `confidence` 只能是 `0 | 0.3 | 0.6 | 0.9`。
- `rationale` 必須是本筆有意義的整體理由。
- 模型不得提交 Stable ID、Evidence ID、source hash、Result ID、authoritative count 或衍生 `skillIds`。
- Root 必須是 direct JSON array，不得包成 object、Markdown 或 stringified JSON。

### 11.2 Skill Finding Schema

每個 `skillFindings[]` 只能包含：

```json
{
  "skillId": "GC_006",
  "confidence": 0.9,
  "evidenceQuoteIds": ["eq_xxx"],
  "evidenceExplanation": "此內容直接描述 GC 流程停滯。",
  "negativeChecks": ["已排除只有一般 GC 關鍵字的情況"],
  "rationale": "此證據符合 GC_006 的技術行為定義"
}
```

要求：

1. `skillId` 必須存在於本次 Catalog，同一 Record 不得重複。
2. `evidenceQuoteIds` 必須 non-empty；每個 ID 必須存在於本次 frozen Evidence Quote Catalog。
3. Quote ID 必須屬於同一 record，並能透過 catalog entry 回查 Evidence Ref、container segment、exact source substring、raw offset、source pointer 與 hash。
4. `CLASSIFIED` 的每個 Skill Finding 至少引用一個 `PRIMARY_CHANGE` eligible quote ID；只有 `SUPPORTING_CONTEXT` 不得單獨支撐分類。
5. `evidenceExplanation` 必須說明這段證據為何支持本 Skill，不能只重述 Skill Name。
6. `negativeChecks` 只能記錄實際執行的相近技能或排除檢查。
7. `rationale` 必須是此 Skill 專屬，不能以 Record 共用句取代。
8. 不得使用 `record-index-*`、`unknown-record-*`、`eq_record_*` 或其他模型自造來源識別。
9. 相鄰 Evidence 即使內容類似，也必須各自判斷，不可直接套用前一筆結論。
10. 模型不得提交 free-form `quote`、`evidenceRef`、`evidenceSegmentId` 或 `evidenceRole`；這些欄位只能由 JAA 以 catalog 回填。
11. Multi-skill 時應優先讓各 Skill 使用不同 PRIMARY_CHANGE Quote；若共用同一權威 Quote key，各 Skill 必須以不同且具體的 Explanation／Negative Checks／Rationale 說明技術面向。
12. 不得為規避 Multi-skill Gate 而只保留一個 Skill；只有該候選確實缺乏證據或未通過負面檢查時才可排除，並須在 `recordNegativeChecks` 留下具體理由。

### 11.3 分類狀態語意

| 狀態 | 使用條件 | `skillFindings` | `unknownReasons` | 原因主要存放處 |
|---|---|---|---|---|
| `CLASSIFIED` | 至少一個有效 Skill、每個 Skill 都有完整 Finding，且所有保留 Skill 的 Catalog Detail 足以正式判斷 | 非空 | `[]` | Skill Finding／Record rationale |
| `UNKNOWN` | 不是明確非技能內容，但技術資訊不足，無合理候選 | `[]` | 至少一筆 | unknownReasons／rationale |
| `EXCLUDED` | 明確為 automation、workflow-only、request-only、completion-only、context-link-only、模板或非技能 Evidence | `[]` | `[]` | recordNegativeChecks／rationale |
| `CATALOG_DETAIL_MISSING` | 有技術內容且至少一個合理 Skill，但任一保留 Skill 的 Catalog Detail 缺少正式判斷所需內容 | 依實際候選，且每筆完整 | `[]` | Skill／Record rationale |
| `FAILED` | 解析、完整性或不可恢復技術錯誤使本筆未完成 | `[]` | `[]` | rationale／error evidence |

`UNKNOWN` 與 `EXCLUDED` 都是合法完成結果。不得為了讓每筆有 Skill、提高覆蓋率或降低 warning 而改成 `CLASSIFIED`。

### 11.4 Status 判斷順序

```text
明確非技能 Evidence → EXCLUDED
不是明確非技能，但技術資訊不足且無合理候選 → UNKNOWN
存在合理候選但證據不足以保留任何 Skill → UNKNOWN；原因放入 unknownReasons
至少一個 Skill 有充分、可追溯證據且通過負面檢查，且所有保留 Skill 的 Catalog Detail 完整 → CLASSIFIED
至少一個 Skill 有充分、可追溯證據，但任一保留 Skill 的 Catalog Detail 不足 → CATALOG_DETAIL_MISSING
不可恢復技術錯誤使本筆無法完成 → FAILED
```

Status 一旦依 Evidence 語意決定，欄位必須服從該 Status。禁止為了 Schema、範例、分類率或固定分布改變 Status。

JAA 只能驗證上述對應，不得修改 AI submission 的原始 `status`。若模型將缺少必要 Catalog Detail 的結果提交為 `CLASSIFIED`，必須產生 `CATALOG_DETAIL_STATUS_MISMATCH` 並 fail closed；不得在背景將它改寫成 `CATALOG_DETAIL_MISSING`。修正只能由下一個全新 Run 重新分析，不導入同 Run repair。

### 11.5 Decision Transport 與 Deterministic Assembly

1. `unknownReasons` 只有 `UNKNOWN` 可非空；所有其他 Status 必須為 `[]`。
2. `EXCLUDED` 原因放 `recordNegativeChecks`／rationale，不放 unknownReasons。
3. JAA Dynamic Tool Schema、Prompt、TypeScript type、semantic validator 與 canonical assembly 必須使用同一矩陣。
4. 正式 array 必須 exact count N、順序與 index coverage 完整；模型送出前自我檢查，但只允許一次 Artifact submission，不導入 Repair。
5. JAA 以不可變 `recordIndex → source identity／sourceContentHash` 對照回填 identity。
6. `skillIds` 由 JAA 從 `skillFindings[].skillId` 衍生；若相容畫面需要 `positiveEvidence`，也必須標示為 derived，不得冒充模型原始欄位。

### 11.6 聚合式 Schema、Semantic 與 Quality Gate

- Schema Validation：檢查 direct array、count、index、exact fields、types、enum 與 additional properties。
- Semantic Validation：檢查 Status matrix、Catalog membership、Skill uniqueness、Evidence Quote ID、record／source／role attribution、raw trace 與來源 identity。
- Quality Gate：計算 non-substantive quote、context-only classification、boilerplate skeleton、Quote-level multi-skill independence、excessive Skill、generic explanation、traceability 與 Catalog 狀態。

只要 Artifact 可解析，validator 就必須在安全唯讀的前提下繼續收集所有 findings，不得遇到第一筆錯誤就停止。每個 finding 至少記錄 `code`、`severity`、`stage`、`recordIndex`、`sourceRecordStableId`、`skillId`、`evidenceSegmentId`、JSON pointer、expected、observed 與繁體中文說明。

必要 error codes：

```text
EVIDENCE_QUOTE_ID_NOT_FOUND
EVIDENCE_QUOTE_RECORD_MISMATCH
EVIDENCE_QUOTE_SOURCE_MISMATCH
EVIDENCE_QUOTE_ROLE_INELIGIBLE
EVIDENCE_QUOTE_HASH_MISMATCH
EVIDENCE_QUOTE_RAW_TRACE_FAILED
PRIMARY_CHANGE_QUOTE_REQUIRED
CONTEXT_ONLY_CLASSIFICATION
NON_SUBSTANTIVE_EVIDENCE
BOILERPLATE_EVIDENCE_PATTERN
MODEL_PROSE_EXACT_DUPLICATE_RATIO_HIGH
MODEL_PROSE_BOILERPLATE_PATTERN
MULTI_SKILL_SHARED_PRIMARY_QUOTE_REVIEW
MULTI_SKILL_SHARED_QUOTE_UNDISTINGUISHED
STATUS_MATRIX_VIOLATION
CATALOG_DETAIL_STATUS_MISMATCH
CATALOG_SKILL_NOT_ALLOWED
COUNT_OR_IDENTITY_MISMATCH
```

分級：

- `PASSED`：Schema／Semantic 通過且無分析品質 Warning。
- `WARNING`：結構有效，但存在需人工判斷的重複、過多 Skill、泛化說明或 Catalog review-draft。
- `BLOCKED`：缺少 required per-skill Finding、Evidence 無法追溯或其他破壞可信度的問題。
- `LEGACY_UNVERIFIED`：Decision v2 僅供預覽。

任一受檢模型文字欄位的 Exact duplicate ratio `> 0.50`，或單筆 Skill Finding `> 5`，版本化預設行為必須是 Warning，不得自動改寫分類。每個 Warning 必須產生可追溯 finding，包含欄位、fingerprint、recordIndex、Skill ID、實際 ratio、threshold、代表文字與繁中說明；不得只保留 metric。`CATALOG_DETAIL_MISSING` 本身是合法完成狀態，不得單獨造成 BLOCKED。WARNING 未被 durable manual acceptance 前禁止 SQLite；BLOCKED 不可用一般接受操作繞過。

Quality Gate 狀態矩陣：

| Quality | Canonical／Active Result | HTML | SQLite |
|---|---|---|---|
| `PASSED` | 允許 | Formal | 允許 |
| `WARNING` | 允許並標示警告 | Formal + Warning Banner | durable 人工接受前禁止 |
| `BLOCKED` | 禁止正式 Canonical；保留 submission | Diagnostic only | 禁止 |
| `FAILED` | 禁止 | 禁止或 Diagnostic | 禁止 |

### 11.7 Non-substantive 與 Boilerplate 規則

只有標題、連結、檔名、圖片名、通用完成通知、一般 log 前綴、格式符號或無辨識力短句，不足以成為 Skill Evidence。合理的短技術 token，例如 `HTTP 500`、`NullPointerException`、`fsync`、函式名、參數名與錯誤碼，若能與本次 Primary Change 及 Skill Explanation 建立明確關係，不得僅因字數短而拒絕。

Boilerplate 檢查使用 deterministic skeleton fingerprint：將 record index、Skill ID、數字與可變識別碼正規化後，只比較模型撰寫的 `evidenceExplanation`、`negativeChecks`、Skill `rationale` 與 Record `rationale`。不得把 Evidence Quote 的 `displayText`、`exactSourceSubstring`、原始 Comment／Diff 本文或父層 `evidenceRef` 當成 boilerplate prose。高度重複必須產生 finding，但不得自動重寫模型結果；finding 的 `observed` 必須指向實際被比較的模型文字欄位，不得輸出整段來源 Evidence 冒充說明文字。

## 11.8 Host Control Lifecycle、Terminal Reconciliation 與 Artifact Identity

### 11.8.1 單一 Host-owned Controller

每個 Run 只能有一個 authoritative lifecycle controller。Controller 至少包含：

```text
controlState
analysisTelemetry
lastSuccessfulControlState
firstFailedControlState
rootError
terminalReceipt
```

Bridge、Provider service、progress handler、Artifact handler、UI、Debug 與 Run Manifest 只能讀取或透過該 Controller 寫入。其他 receipt 可保存 projection，但不得成為第二個權威 state。

Required control state：

```text
ATTEMPT_CREATED
→ PROVIDER_DISPATCHED
→ INPUT_READING
→ INPUT_READY
→ ARTIFACT_RECEIVED
→ VALIDATING
→ CANONICAL_CREATED
→ ANALYZED_RESULT_PUBLISHED
→ ACTIVE_RESULT_COMMITTED
→ REPORT_PACKAGE_CREATED
→ HTML_RENDERED
→ SQLITE_GATE
→ TERMINAL
```

Optional analysis telemetry：

```text
NOT_REPORTED
STARTED
IN_PROGRESS
COMPLETED
COMPLETED_BY_ARTIFACT
```

- Provider completed 只代表 Turn 結束，不等於 Artifact／Canonical／HTML／SQLite 成功。
- Analysis telemetry 不得取代 control state。
- `analysisStarted`、`analysisCompleted` 與各層 status 是 Controller 與 receipts 的 deterministic projection，不是可由不同 service 任意寫入的第二狀態。
- 每個 Run 只允許一筆 idempotent `run_terminal`。

### 11.8.2 Terminal Outcome Reducer

每個 Run 只有一個 Host-side Terminal Outcome Reducer。輸入只允許 Host control snapshot、Artifact durable receipt、Validation receipts、Canonical／Analyzed Result／Active Result／Package／HTML／SQLite receipts 與 Provider terminal status。

- Provider callback、Bridge tool handler、UI、Debug collector 與 recovery worker 不得直接把 Run 改為 completed、failed、provider_failed 或 cancelled。
- `controlState >= ARTIFACT_RECEIVED` 必須推導 `analysisStarted=true`、`analysisCompleted=true` 與 telemetry=`COMPLETED_BY_ARTIFACT`。
- 有合法 Artifact 時，Provider Turn completed 不得產生 `AI_ANALYSIS_NOT_STARTED`。
- Provider Turn completed 且沒有 Artifact 時使用 `AI_ARTIFACT_NOT_SUBMITTED`；Provider failed／cancelled 且沒有 Artifact 時才可成為 Provider root failure。
- Provider failed／cancelled 發生於合法 Artifact durable 保存之後，只能成為 provider warning；本機 validation 與 downstream pipeline 繼續執行。
- Reducer 必須在每次 reduce 前透過 `DurableArtifactTruthResolver` 重讀 Artifact、receipt、Run Manifest 與 fact journal；callback closure、記憶體布林值及 UI projection 不得作為 durable truth。
- Provider completed 且 Artifact 已 durable persisted 時，Reducer 只能回傳 `RUN_POST_ARTIFACT` 或非終局的 `DEFER_POST_ARTIFACT`，不得 terminalize 為 no-artifact failure。
- 產生 `AI_ARTIFACT_SUBMISSION_MISSING` 前必須執行 contradiction guard；如任一 durable evidence 表示 Artifact 已存在，改記 `AI_TERMINAL_FACT_RECONCILIATION_REQUIRED` 並排程 recovery。
- Reducer 必須依 durable receipts 推導 first failed stage、root error 與 terminal outcome；成功 Run 的 root error 欄位全部為 null。

### 11.8.3 Segment read、Finalize 與 Delivery status

- 第一個成功 segment read 必須執行 `PROVIDER_DISPATCHED → INPUT_READING`。
- Finalize receipt 與同一 Controller 的 `INPUT_READING → INPUT_READY` 必須是同一 atomic operation。
- finalize 回覆成功前必須重新讀取 Controller，驗證 postcondition=`INPUT_READY`；否則回 `AI_LIFECYCLE_POSTCONDITION_FAILED`。
- `jaa_get_delivery_status` 在 finalize 前後都可安全重複查詢。
- 完成後回傳的 status／receipt 必須 immutable，查詢不得消耗 handle或改變 cursor／ACK。
- Segment cursor、ACK、Thread／Turn binding 與不同 finalAck 的非法重播才可回報 replay。
- 完全相同的 finalize 重試回傳原 receipt，不建立新 receipt 或新完成事件。

### 11.8.4 Progress telemetry、Artifact completion 與狀態語彙

- `ANALYSIS_STARTED` 從 `INPUT_READY` 合法，但不是 Artifact submission 的必要條件。
- 相同 progress 重複送達只記錄 duplicate evidence。
- completedCount 暫時不增加、重複或可恢復倒退時產生 warning，不終止 Turn。
- identity mismatch、跨 Run handle、負數或超過 expectedCount 才拒絕該 progress event。
- Progress failure 不得掩蓋較早的 root error，也不得阻擋後續有效 Artifact。
- 完整且可解碼、token／binding 合法的 Artifact submission 是分析開始與完成的權威證據。
- Artifact 可從 `INPUT_READY`、telemetry `STARTED` 或 `IN_PROGRESS` 進入 `ARTIFACT_RECEIVED`；同時將 telemetry 設為 `COMPLETED_BY_ARTIFACT`。
- 不得要求先收到 `ANALYSIS_COMPLETED` progress checkpoint 或 submission checkpoint 才保存、驗證或正式接受有效 Artifact。

Artifact lifecycle 固定為：

```text
received → persisted → content_validated → formally_published
```

- `received` 只表示 Host 收到 submission。
- `persisted` 需要 tmp、fsync、atomic rename、reopen 與 SHA-256 驗證全部完成。
- `content_validated` 需要 Validation 01–08 依實際 contract 通過。
- `formally_published` 需要 Canonical 與正式 Analyzed Result durable 建立。
- 模型提交工具最多回覆 `persisted`；不得在 formal validation 前回覆 `published`。

### 11.8.5 Post-Artifact Pipeline 與 interrupted recovery

JAA 必須提供以 `runId + artifactHash` 為 idempotency identity 的 Post-Artifact pipeline：

```text
validate Artifact
→ Canonical assembly
→ Analyzed Result publish
→ Active Result commit
→ Report Package
→ HTML
→ SQLite Gate
→ Terminal reducer
```

- Artifact handler、Provider terminal handler、App startup recovery 與人工重新處理都只能呼叫同一 pipeline。
- 重複呼叫不得重複建立資料、改變既有 hash 或產生第二筆 terminal event。
- App crash 後若 durable Artifact 與 receipts 足以繼續，必須從最後成功 stage 恢復，不得回退成 provider failure。
- Warning Gate、HTML error 與 SQLite error 仍依既有分層規則處理，不撤銷已成功的 Canonical／Analyzed Result。
- 每一階段以 `runId + artifactSha256 + stage` 作為 idempotency key，先檢查 durable receipt，再執行該 stage；禁止只在記憶體標示已完成。
- App 啟動時必須掃描 persisted 但未完成 terminal reconciliation 的 Run；Workspace 也必須提供「重新處理已保存的分析結果」。兩者均不得重新聯絡 Provider、消耗 token 或修改原始 AI submission。
- 歷史錯誤 terminal 為 append-only 稽核證據，不得刪除或覆寫；Recovery 完成後另建 recovery terminal 與 supersession receipt，將舊 terminal 標示為 `superseded_by_recovery`。

### 11.8.6 Artifact Identity 單一來源

- Approved Artifact Identity 只能由 immutable Runtime Contract Registry 在 dispatch 前建立並凍結。
- Dispatch-time Approved Identity 與 Artifact-time Host Injected Identity 必須是兩份獨立資料；validator 不得比較同一物件的兩個 alias。
- Application、Prompt、Prompt Template、Pipeline、Bridge、Decision、source、rules 與 output schema identity 必須逐欄比較。
- 現行 Run 不得繼承上一版 identity。歷史版本值只允許存在於 forensic replay metadata。
- Identity mismatch 必須在 `TOKEN_BINDING` 或專屬 Identity stage fail closed，不得以兩份相同 stale value 判為 MATCH。

### 11.8.7 Run-level input access failure

若模型無法可靠存取整體輸入、Provider context 或全部 required segments：

1. 不提交 N 筆全部 FAILED。
2. 不建立正式 Artifact、Canonical、Active Result、Formal HTML 或 SQLite。
3. 以 Run-level structured failure 保存第一個失敗工具、stage、error code、message、delivery receipt 與 final assistant response。
4. 若沒有 host-observable truncation receipt，只能標示為 model-reported limitation，不得冒充 JAA 已證實 byte loss。
5. 若只有單一 record 存在不可恢復解析錯誤，才可在該 record 使用 FAILED。

### 11.8.8 Validation causal truth 與 reconciliation

- Formal stage 失敗後，後續 Formal stage 使用 `BLOCKED_BY_PRIOR_STAGE` 或 `NOT_RUN_DUE_TO_PRIOR_FAILURE`。
- Diagnostic Package／HTML 可獨立執行，但 receipt 必須標示 `scope=DIAGNOSTIC`、`canonical=false`、`sqliteEligible=false`。
- firstFailedStage、rootErrorStage 與 tool error stage 必須一致；derived consequence 不得取代 root cause。
- `CANONICAL_ASSEMBLY` 至 `SQLITE` 不得以 `delegated`、placeholder 或預定執行為理由標示 `PASSED`。
- 每個 stage 只有在對應 durable artifact／receipt 存在且 reopen／hash 驗證成功後才能 `PASSED`。
- 測試隔離刻意不寫 SQLite 時使用 `NOT_RUN_BY_TEST_ISOLATION`，不得顯示 `PASSED`。
- Validation 01 已執行後，validation status 不得仍為 `not_started`。
- Validation 01–08 全部通過後，Artifact 不得顯示 `rejected`。
- 已到 `INPUT_READY` 後，`INPUT_READING` 不得成為 first failed stage，除非另有具體且較晚發生的 durable failure receipt。
- Receipt 記錄的每個 artifact bytes／SHA-256 必須在 terminalization 與 Debug export 前重新開啟核對；不一致時產生明確 hash mismatch finding。

### 11.8.9 Final response、Submission 與 UI truth

- `artifact-final-summary.txt` 保存模型工具參數中的 final summary；寫入 receipt 後 immutable。
- `provider-final-assistant-message.txt` 保存 Provider Turn 的完整 final assistant response；只能新增，不得覆寫 Artifact summary。
- 兩份檔案都必須各自保存 bytes、SHA-256、來源與 durable receipt。
- Raw submission 已 durable 保存時，必須標示 `submission_received_and_persisted`。
- 已通過內容驗證但被 lifecycle 或正式發布 gate 阻擋時，標示 `submission_validated_but_publish_blocked`。
- 不可將已有 AI submission 的 Run 標為 `not_applicable_no_submission`。
- UI 必須分別呈現 Provider、Input Delivery、Model Analysis、Artifact、Validation、Canonical、Analyzed Result、Package、HTML 與 SQLite，不得以單一 `provider_failed` 掩蓋已完成的模型分析。
- Numeric token telemetry 不是 credential；可保存實際數值。Token、Cookie、Authorization 與 OAuth credential 仍必須遮罩且不得進 Debug Folder。

### 11.8.10 Durable Fact Journal 與 Provider-neutral Analysis Core

每個 Run 必須保存 hash-chained append-only reducer fact journal。至少支援：

```text
PROVIDER_PREPARED
PROVIDER_SENT
PROVIDER_ACCEPTED
PROVIDER_COMPLETED
PROVIDER_FAILED
ARTIFACT_RECEIVED
ARTIFACT_PERSISTED
VALIDATION_STAGE_COMPLETED
POST_ARTIFACT_STAGE_COMPLETED
RECOVERY_STARTED
RECOVERY_COMPLETED
RUN_CANCELLED
```

每筆 fact 至少包含 `sequence`、`runId`、`factType`、`occurredAtUtc`、必要的非敏感 identity／hash、`previousFactSha256` 與 `factSha256`。Journal 不保存 credential、完整 opaque token、Cookie 或 Authorization。

分析核心必須以 Provider-neutral contracts 運作：

- `ProviderAnalysisRequest`：Run identity、輸入檔 receipt／binding、effective instruction identity、Decision／Artifact contract、取消訊號與 provider-neutral options。
- `ProviderAnalysisArtifact`：Provider 產生的 Decision payload、provider summary、provider receipt reference 與可選 usage；不得攜帶 Canonical、HTML、SQLite 或可由 Host 注入的權威 source／rule identity。
- `AnalysisProviderAdapter`：`getCapabilities()`、`preflight()`、`analyze()`、`cancel()` 及 optional `recover()`。
- Provider-specific transport、OAuth、Thread／Turn、stream、tool call 與 local inference protocol 只能存在 Adapter 內；JAA analysis core 不得直接 import 其型別。
- Provider 選擇必須明確且逐 Run 保存；任何 Provider 失敗均不得自動 fallback 到另一個 Provider。
- 不同 Cloud AI、Local AI 與 Offline Rule Adapter 只要通過同一 Request／Artifact contract，即可共用 Decision validation、Canonical assembly、Report、HTML 與 SQLite pipeline。
- v1.6.6 只要求 production `ChatGptCodexProviderAdapter` 與 test-only `MockAnalysisProviderAdapter`；Mock 不得出現在正式 UI，也不得冒充真實 AI 驗證。

## 12. Skill Catalog 必備欄位

```text
catalog_version
group
skill_id
skill_name
detail_description
aliases
strong_signals
medium_signals
weak_signals
negative_rules
evidence_fields
disambiguation
confidence_notes
change_history
```

### Detail Description

`detail_description` 必須是正式 Catalog 內容，用來協助 AI 理解：

- 技術範圍
- 常見工作
- 典型 Evidence
- 相似技能界線

若缺少正式描述：

```text
status = catalog_detail_missing
```

AI 可以提供 suggestion，但 suggestion 不可視為正式 Catalog，必須經人工確認後才能寫回。

## 13. Evidence Segment、Quote Catalog、Normalization 與 Report Enrichment

### 13.1 Frozen Evidence Segment Catalog

JAA 在 Provider dispatch 前以 `JAA-EVIDENCE-SEGMENTER-1.0.0` 建立 immutable catalog。每個 segment 至少包含：

```text
evidenceSegmentId
recordIndex
sourceRecordStableId
evidenceRef
hunkId
lineType
oldLineNumber
newLineNumber
exactText
evidenceRoleEligibility
sourceJsonPointer
segmentSha256
```

Segment ID 與 SHA-256 必須 deterministic；同一輸入、同一 Segmenter 版本必須產生相同結果。Segmenter 不得摘要、翻譯、補字或改寫 Unicode、NBSP、換行、tab 與標點。

### 13.1.1 Frozen Evidence Quote Catalog

JAA 在 Provider dispatch 前以 `JAA-EVIDENCE-QUOTE-CATALOG-1.0.0` 將每個 container segment deterministic 解碼為可讀 line／sentence／log-row entries。每筆至少包含：

```text
evidenceQuoteId
recordIndex
sourceRecordStableId
evidenceRef
containerEvidenceSegmentId
quoteOrdinal
sourceJsonPointer
containerStartOffset / containerEndOffset
rawStartOffset / rawEndOffset
exactSourceSubstring
displayText
evidenceRoleEligibility[]
normalizationOperations[]
sourceContentHash
quoteSha256
catalogVersion
```

Quote ID 必須從來源 identity、container segment、raw offsets 與 exact substring hash deterministic 產生。同一 input／version 必須得到相同 Catalog。`displayText` 可移除 JSON wrapper、escape syntax 與非語意 metadata，但 `exactSourceSubstring`、raw offsets 與 source pointer 必須能回到原始 bytes。

Catalog 不得使用 LLM 產生，不得摘要、改寫、翻譯、補字或合併不相鄰來源。

### 13.2 Evidence Role

| Role | 定義 | 可否單獨支撐 `CLASSIFIED` |
|---|---|---:|
| `PRIMARY_CHANGE` | 本次 Activity Event 可歸因的 Added、Removed、欄位新值或新 Comment 本文 | 可以 |
| `SUPPORTING_CONTEXT` | Diff 中未變更的 context，只用於說明 primary change 的技術背景 | 不可以 |
| `INELIGIBLE` | 無法歸因到本筆 Event、純包裝、metadata 或非證據內容 | 不可以 |

Comment 建立事件的新 `body` 可視為 Primary，但必須能回到 Comment 的 source JSON pointer 與 content hash。歷史 context、引用他人內容或 linked issue 內容不得自動歸給本次操作者。

只有 Supporting Context 顯示合理技術候選而沒有 Primary Change 時：

- 仍可能存在技術活動，但歸屬或技能界線缺乏可追溯 Primary Change：`UNKNOWN`，並在 `unknownReasons` 說明缺口。
- 本筆明確沒有可歸因技術活動：`EXCLUDED`。
- 不得為了保留候選而輸出 `CLASSIFIED`；Decision v5 不允許 `NEEDS_REVIEW`。

### 13.3 Readable Evidence

JAA 使用 `JAA-EVIDENCE-NORMALIZER-1.0.0` 與 Quote Catalog 將 Comment／Description／Changelog Diff 的包裝轉成可讀證據。Normalization 只處理呈現與 quote traceability，不得摘要、改寫、翻譯或補字。

預設可讀內容應移除 JSON wrapper、escaped quote、literal `\\r\\n`、`body`、`commentId`、`contentStatus` 與 `provenance` 等非語意 metadata，並保留真實換行。原始內容仍需完整保存並可展開查驗。

Normalizer 失敗時使用安全 escaped raw fallback，記錄 diagnostics；不得丟失來源或偽造 readable evidence。原始 bytes、Stable ID、Evidence ID、source hash 與 record hash 完全不變。

### 13.4 Quote Traceability

每個 Skill Finding 的 `evidenceQuoteIds[]` 必須：

1. 指向該 Record 的 frozen Quote Catalog entry。
2. Catalog entry 能回到 Evidence Ref、container Segment ID、raw exact substring 與 source pointer。
3. Quote role eligibility 與本筆 Event／Diff 歸屬一致。
4. `CLASSIFIED` 每個 Skill 至少一個 `PRIMARY_CHANGE` eligible ID。
5. 模型不重打 quote，不因 JSON wrapper／escape 而被要求引用整段 serialized container。
6. HTML 預設顯示 `displayText`，並可展開 exact source substring／raw source trace。

### 13.5 Run-scoped Issue Snapshot 與跨伺服器身分

Issue Type、Priority、Jira Status、Project 與型別專屬欄位由 JAA 從原始資料庫建立 Run-scoped Current-State Snapshot，不交給模型分析或補值，也不增加模型輸入。

- 單一 Jira Server 內的 normalized key 為 `trim(issueKey).toUpperCase()`。
- 跨 Server 的 Unique Issue identity 必須是 `jiraServerIdentity + normalizedIssueKey` 的 composite key。
- 同一 Unique Issue 有多筆 Event 時，Report Data Package 只保存一份 Snapshot。
- Snapshot 必須含 `snapshotId`、`snapshotSha256`、`capturedAt` 與來源 identity。
- 若同一 composite identity 出現不一致的 Snapshot，不得 last-write-wins；必須產生 `ISSUE_SNAPSHOT_CONFLICT` 並將衝突欄位標記 `CONFLICT`。
- Activity 範圍以 Event timestamp 判斷；Issue Type／Priority／Status／Project 是 Run 時點的 current-state snapshot。報告必須明示，不得暗示為 Event 當時歷史狀態。
- Report enrichment warning 不得改寫 AI Status；但缺少必要 Snapshot 或 conflict 可依 Template capability 阻擋正式報告。

### 13.6 Snapshot Field State

每個可能缺漏或不適用的 Snapshot 欄位都必須保存 value 與 state：

| State | 定義 |
|---|---|
| `PRESENT` | 來源存在且有可用值 |
| `EMPTY` | 來源欄位存在，但值為空 |
| `NOT_APPLICABLE` | 此 Issue Type 不適用該欄位，例如 Feature 的 Root Cause |
| `NOT_CAPTURED` | 本次 Snapshot profile 未擷取 |
| `SOURCE_UNAVAILABLE` | 原始資料庫或來源無法提供 |
| `CONFLICT` | 同一 Snapshot identity 有互斥資料，未任意選值 |

核心 Snapshot 至少包含 server／database identity、snapshot identity／hash／capturedAt、Issue ID／Key、Project、Summary、Issue Type、Priority、Status、Resolution、created／updated／resolved／start／due、Labels、Components、Fix Versions、Affected Versions，以及在安全且穩定時的 Assignee／Reporter／Creator reference。

Issue Type 專屬欄位放入 `snapshotFields`，並由 `snapshotFieldDefinitions` 說明 machine name、顯示名稱、sourceFieldId、資料型別、適用 Issue Types 與缺漏狀態。例如 `rootCause` 對 Bug 可為 `PRESENT`／`EMPTY`，對 Feature 應為 `NOT_APPLICABLE`。

### 13.7 分析與報告資料分層

固定資料流：

```text
Pending Analysis JSON
→ ChatGPT Decision v5
→ JAA Canonical Assembly
→ Analyzed Result JSON
→ JAA Report Data Package Builder（連接原始 DB）
→ Report Data Package JSON
→ Local Renderer + selected HTML Template MD
→ self-contained HTML
```

- Pending JSON 保存 Diff、Stable ID／hash、歸屬 metadata 與 frozen evidence segments，不含完整 Snapshot。
- Analyzed Result JSON 基於 Pending records，只新增分析、驗證、品質、Run／Rule references 與 Snapshot References；不得重複完整 Snapshot。
- `jaa-analysis-report-data-package-v1` 將 Analyzed Result 與原始 DB 的 Unique Issue Snapshot 做 deterministic join，並保存資料完整性、統計母體、欄位字典與所有 input hash。
- Canonical 成功後 JAA 自動建立正式 Report Data Package 並以目前選取 Template 產生第一份 HTML。
- Artifact 可解析但正式 gate 失敗時，建立 `DIAGNOSTIC_NON_CANONICAL` Report Data Package 與診斷 HTML；不可建立正式 Canonical 或寫入 SQLite。
- 之後可離線匯入同一 Report Data Package，選用另一份相容 Template 重新渲染，不呼叫 Provider、不改寫分析結果。
- 若新 Template 要求 Package 不具備的 capability／Snapshot field，必須 fail closed；僅在使用者明確選擇並重新連接原始 DB 後重建 Package，不得從 HTML 猜值。

## 14. 報告輸出

固定輸出：

- PDF
- DOCX
- Interactive HTML
- CSV / JSON Raw Data Package

每份報告必須標示：

```text
analysis_target_user
analysis_date_range
source_bundle_name
common_rules_version
skill_catalog_version
rule_set_id
classification_version
generated_at
```

固定章節：

1. 封面
2. 目錄
3. Executive Summary
4. 分析範圍與資料完整性
5. Evidence / Author 權重與分類方法
6. Skill Taxonomy & Rule Basis
7. 各 Group / Skill ID / Skill Name / Detail Description
8. AI Classification Rule Basis
9. 規則變更紀錄
10. 技能分類總覽
11. JIRA-by-JIRA / Page-by-Page 分析
12. Multi-skill Evidence
13. Unknown / Needs Review
14. 被排除 Evidence 摘要
15. Raw Data 與人工查驗指引

PDF 必須有目錄。

## 15. 必備分類輸出欄位

Decision v5 模型傳輸欄位：

```text
recordIndex
status
confidence
skillFindings[].skillId
skillFindings[].confidence
skillFindings[].evidenceQuoteIds[]
skillFindings[].evidenceExplanation
skillFindings[].negativeChecks
skillFindings[].rationale
recordNegativeChecks
unknownReasons
rationale
```

JAA Canonical Assembly 以 Quote Catalog 解析 ID，另行加入／衍生：

```text
classificationUniqueId
evidenceUniqueId
person
issueKey_or_pageId
author
source
JiraField_or_ContentField
FieldPath
group
skill_id
skill_name
detail_description_version
evidenceWeight
authorWeight
positiveSignals
negativeChecks
relatedSkillGroups
score
confidence
confidenceReason
evidenceQuote
evidenceExplanation
qualityStatus
qualityFindings
normalizerVersion
issueSnapshotReference
common_rules_version
skill_catalog_version
rule_set_id
classification_version
```

## 16. 跨平台

- **JIRA**：Summary、Description、Comments、Changelog、Attachments Metadata、Remote Links、Labels、Custom Fields。
- **Confluence**：Page Body、Version Diff、Comments、Attachments Metadata、Labels、Linked JIRA。
- **Activity DB**：activity_events、activity_target_details、author、event type、target content、linked source。
- **Cloud AI**：完整 evidence block + bound Skill Catalog + negative rules + confidence reason。
- **Local AI**：使用同一 Catalog；可縮短 context，但不得省略 negative rules 與 attribution。
- **Offline**：token-aware regex / rule engine，禁止粗糙 substring matching。

## 17. JiraActivityAnalyzer 整合邊界

本節說明 v1.6.6 如何套用至 JiraActivityAnalyzer。Evidence 權重與計分公式維持 v1.1.0；本版補齊 Quote-level Multi-skill Independence、Quality Gate 真實狀態、Decision v5、Frozen Evidence Segment、Evidence Role、聚合驗證、診斷 HTML、Report Data Package、Snapshot reference、本機 HTML renderer、跨 Run 共存、Durable Artifact truth、Terminal contradiction recovery 與 Provider-neutral Analysis Core 邊界。

### 17.1 待分析資料

- 只分析操作者在 Issue 檢視 → Activity Events 或使用者檢視 → All Activity Events 中實際選取並匯出的 Evidence／Diff。
- 未選取的 Activity Events 不應進入分析工作。
- 每筆 Evidence 必須保留穩定來源識別、`sourceContentHash`、Issue／History／Comment／Item 對照資訊。
- SQLite `rowid` 與本機 DB 路徑不可作永久追溯鍵。

### 17.2 三種分析來源

以下三種來源必須套用同一份 Catalog、Common Rules、Manifest 與輸出 Schema：

| Analyzer Type | 說明 |
|---|---|
| `CLOUD_AI` | 雲端 AI；必須先通過資料外傳、遮罩與最小化 Payload 規則 |
| `LOCAL_AI` | 地端 AI；可縮短 Context，但不可省略 attribution、negative rules 與版本資訊 |
| `OFFLINE_RULE` | 離線規則引擎；不得使用粗糙 substring matching，不假裝成 AI 模型 |

三者結果可以並存，不得互相靜默覆蓋。

不同 Analysis Run 也必須保存獨立 Run Identity 與結果身分；即使來源 Evidence、Provider、Model 與 Skill 相同，也不得因共用 `resultId` 而碰撞或覆蓋既有 Run。

所有來源必須經過 `AnalysisProviderAdapter`，並產生相同的 `ProviderAnalysisArtifact`。Provider-specific 的 OAuth、ChatGPT／Codex Thread／Turn、HTTP API、local inference protocol 或 rule engine execution 只允許存在對應 Adapter；Decision validation 之後的 Canonical、Analyzed Result、Report Package、HTML 與 SQLite 流程不得因 Provider 而分叉。Provider 必須由操作者或受控設定明確選擇；禁止 silent／automatic fallback。

### 17.3 模型 Decision 與已分析資料

- 已分析檔必須保留待分析檔的原始 Evidence 身分與內容 Hash，並在每筆資料新增結構化分析結果。
- 已分析檔不得為了 HTML 報告而把同一 Issue 的完整 Snapshot 重複塞入每筆 Event；每筆只保存 `issueSnapshotReference`。
- 分析器不得修改、重排後冒充原始 Evidence；若允許排序顯示，永久身分與 Hash 必須保持不變。
- 模型的受控 Decision transport 可只回傳本次 Run 的 `recordIndex` 與分析欄位，不要求模型複製 `evidenceUniqueId`、Stable ID 或來源 Hash。
- JAA 必須在送出前建立不可變 `recordIndex → source identity/sourceContentHash` 對照，驗證 Decision 的 exact count、index 範圍、唯一性與順序後，再 deterministic assembly 回填 `evidenceRefs`。
- 最終可攜式已分析檔與 AI Analysis DB 必須保存完整 `evidenceRefs` 與 Hash；禁止依未經驗證的陣列位置猜測，也禁止採用模型自造的來源 ID。
- Unknown／Needs Review 必須是合法結果，不得強迫分類。

### 17.4 權威統計與報告

- `CLASSIFIED`／`UNKNOWN`／Skill assignment／multi-skill 等 count 必須由 JAA 讀取已通過 Schema 與 semantic validation 的 Decision 或 Canonical Result 計算。
- ChatGPT 的 `analysis-report.md` 與最終摘要可以描述觀察，但若文字 count 與 JAA 本機計算不一致，JAA count 為權威，並產生 warning。
- 模型不得以自然語言聲稱取代 Artifact Receipt、Validation Report、Canonical Result 或 SQLite gate。
- Golden HTML 必須由 JAA 本機使用 Manifest 綁定或操作者明確選取且相容的 `Skill_Analysis_HTML_Report_Template_v1.5.1.md` 與 `jaa-analysis-report-data-package-v1` 產生，不接受模型產生的 HTML 作為正式報告。
- Artifact 可解析但正式 gate 失敗時，JAA 建立 Diagnostic Report Data Package，再使用同一 Template 的 `DIAGNOSTIC_NON_CANONICAL` mode 產生診斷預覽；此預覽不是 Canonical、不得寫入 SQLite。
- HTML 產生或重新產生不得重新呼叫 ChatGPT，也不得改寫 Canonical Result 或 SQLite。
- Event 與 Unique Issue 統計必須明確標示母體；相同 normalized Issue Key 的 Issue Type／Priority／Jira Status 只計一次。
- HTML renderer 的直接輸入只有 Report Data Package 與 Template MD；不得在 render 時查詢原始 Jira DB 或 AI Analysis DB。
- Readable Evidence 預設顯示 normalized text，Raw Source 預設收合且始終可查驗。

### 17.5 匯入 AI Analysis DB

- 已分析檔通過 Schema、Rule Set、來源 DB 身分、Evidence ID 與 Content Hash 驗證後，才可匯入 AI Analysis DB。
- 匯入後預設狀態應為 `PENDING_REVIEW`。
- AI Raw Result 不可修改；人工修訂另存 Human Reviewed Result。
- 只有人工確認的結果可標成正式 `CONFIRMED`，並用於個人／團隊／專案技能報告。

## 18. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 1.6.6 | 2026-08-25 | proposed | 修正 v0.3.36 persisted Artifact 被 stale reducer fact 誤判遺失；新增 DurableArtifactTruthResolver、hash-chained fact journal、14-stage idempotent recovery、terminal contradiction guard、Provider-neutral Request／Artifact／Adapter、ChatGPT Adapter 與 test-only Mock Adapter 邊界；分類語意不變 |
| 1.6.5 | 2026-08-25 | proposed | 新增唯一 Terminal Outcome Reducer、Artifact-as-start/completion 推導、Provider terminal 矩陣、冪等 Post-Artifact pipeline、Runtime Registry Identity 單一來源、四階段 Artifact 狀態、Final Summary 分檔、receipt reconciliation 與雙軌 v0.3.35 replay |
| 1.6.4 | 2026-08-24 | proposed | 分離 required control lifecycle 與 optional analysis telemetry；第一段進入 INPUT_READING、finalize postcondition=INPUT_READY；有效 Artifact 作為 analysis completion；禁止 progress gate 與 delegated PASS；修正 submission／UI truth |
| 1.6.3 | 2026-08-24 | proposed | 修正 finalize→INPUT_READY→ANALYSIS_STARTED、Delivery Status／Finalize idempotency、Progress telemetry、FAILED／Run-level failure 邊界與 Validation causal truth；新增 opt-in Live Provider E2E 規則 |
| 1.6.2 | 2026-08-24 | proposed | 取消全域單一 Skill 縮減；允許具獨立技術說明的 shared PRIMARY_CHANGE Quote；強制 Catalog Detail Status、Duplicate Ratio Warning、SQLite Warning Gate 與 Validation Receipts V2 HTML 能力 |
| 1.6.1 | 2026-08-24 | proposed | 修正 Multi-skill independence 判定粒度；允許同一父層 Evidence 的不同 Quote 支援多技能，要求每個 Skill 至少一個 Exclusive PRIMARY_CHANGE Quote，並限制 Boilerplate Gate 只檢查模型文字欄位 |
| 1.6.0 | 2026-08-20 | proposed | 進版 Decision v5，新增 deterministic Evidence Quote Catalog、`evidenceQuoteIds[]`、JAA-owned Artifact identity、persist-before-validate 與 formal／diagnostic 分層 |
| 1.5.0 | 2026-08-20 | proposed | 分離 Pending／Analyzed／Snapshot／Report Data Package，新增跨 Server Unique Issue、Snapshot field states、automatic package/render pipeline 與 declarative statistics 邊界 |
| 1.4.0 | 2026-08-19 | proposed | 升級 Decision v5、Frozen Evidence Segment、PRIMARY_CHANGE／SUPPORTING_CONTEXT、聚合 Validator、non-substantive／boilerplate Quality Gate 與診斷 HTML 邊界 |
| 1.3.0 | 2026-08-19 | proposed | 升級 Decision v3 per-skill Finding、numeric confidence enum、Readable Evidence／Quote traceability、三層驗證、Quality／SQLite Gate 與 Run-scoped Issue Snapshot |
| 1.2.1 | 2026-08-14 | proposed | 補齊 Status／Decision 欄位矩陣、判斷順序、禁止格式驅動分類漂移、本機 HTML Template 邊界與不同 Run 結果共存 |
| 1.2.0 | 2026-08-14 | approved | 保留既有權重與公式；加入同 Group multi-skill、Evidence-specific 證據、狀態語意、recordIndex deterministic assembly 與本機權威統計 |
| 1.1.0 | 2026-07-20 | approved | 分離 Common Rules／Catalog／Manifest，加入 Detail Description、版本綁定與 JiraActivityAnalyzer 整合邊界 |
