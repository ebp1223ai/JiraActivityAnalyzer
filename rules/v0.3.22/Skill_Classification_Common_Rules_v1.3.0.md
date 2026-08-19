# 技能分類通用規則 v1.3.0

- File: `Skill_Classification_Common_Rules_v1.3.0.md`
- Rules Version: `1.3.0`
- Previous Version: `1.2.1`
- Schema Version: `1.3`
- Status: `proposed`
- Effective Date: `2026-08-19`
- Current Catalog Baseline: `Skill_Catalog_v0.3.1.md`（目前為 review-draft）
- Previous Catalog Baseline: `skills_classification_transfer_pack_v0.2`
- Decision Contract: `jaa-ai-analysis-decisions-v3`
- Quality Contract: `jaa-ai-analysis-quality-v1`
- Evidence Normalizer: `JAA-EVIDENCE-NORMALIZER-1.0.0`
- Scope: Evidence normalization、歸屬、權重、Decision v3、信心、排除、追溯、Quality Gate 與報告共同規則

## 1. v1.3.0 核心變更

本版延續 v1.2.1 的權重、計分公式、Status 語意與 deterministic assembly 邊界，將模型輸出正式升級為 Decision v3：

1. Record 不再用共用的 `skillIds`／`positiveEvidence` 表示多技能；改為 `skillFindings[]`，每個 Skill 都有獨立 Evidence Quote、Explanation、Negative Checks、Rationale 與 Confidence。
2. Record 與 Skill Confidence 都只能是 JSON number `0 | 0.3 | 0.6 | 0.9`，禁止 `HIGH／MEDIUM／LOW／NONE` 字串及其他小數。
3. `skillIds` 只能由 JAA 從 `skillFindings[].skillId` deterministic 衍生，不再由模型提交。
4. Evidence Quote 必須能在 JAA 版本化 Normalizer 產生的可讀來源中精確回查；原始 Evidence bytes、ID 與 Hash 永遠不變。
5. 明確分離 Schema Validation、Semantic Validation 與 Quality Gate；只有可信度結構或追溯破壞才 Block，統計異常不得自動改寫分類。
6. Quality Warning 未經 durable manual acceptance 前禁止 SQLite；Blocking Quality 不可用一般接受操作繞過。
7. Report enrichment（Issue Type、Priority、Jira Status）由 JAA 本機 Run-scoped Issue Snapshot 提供，不交給模型補值。
8. Report Template 是 JAA 本機 deterministic renderer 的版本化依據，不加入 ChatGPT 的 `1 JSON + 3 MD` 模型輸入。
9. 不設定預期狀態分布、固定分類率或固定 Skill 數量；同一輸入跨 Run 的差異必須保留為可比較證據。

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
- Decision v3 per-skill Finding
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
- Canonical Result 到 HTML View Model 的 deterministic mapping
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

Decision v3 的 Record 與 Skill Finding `confidence` 都必須是 JSON number，且只能使用：

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

## 11. Decision v3、Multi-skill 與獨立證據

- 同一 Issue／Page／Evidence 可對應多個技能。
- 同一 Group 內不同 Skill 可以共存，不得預設只能選一個主要 Skill。
- 每個保留的 Skill 必須是獨立 `skillFindings[]` 物件，擁有自己的 Evidence Quote、Evidence Explanation、Negative Checks、Rationale 與 Confidence。
- 跨 Group 共存需說明各自支撐的技術面向。
- 同 Group 共存也需說明 Skill 邊界，例如 GC kernel／flow 與 GC event scheduling、suspend／stop 與 pausing control。
- 若多個 Skill 只有完全相同的一句證據且沒有可區分的技術面向，應只保留最精確 Skill 或降為 `NEEDS_REVIEW`，不得複製理由湊成 multi-skill。
- 分析每筆 Evidence 時應先列出合理候選，再逐一執行該 Skill 的正向與負面檢查；不能找到第一個候選就停止。

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
  "evidenceQuotes": [
    {
      "evidenceRef": "pae_xxx",
      "quote": "GC 卡在 FTLGCCheckProgram()"
    }
  ],
  "evidenceExplanation": "此內容直接描述 GC 流程停滯。",
  "negativeChecks": ["已排除只有一般 GC 關鍵字的情況"],
  "rationale": "此證據符合 GC_006 的技術行為定義"
}
```

要求：

1. `skillId` 必須存在於本次 Catalog，同一 Record 不得重複。
2. `evidenceQuotes` 必須 non-empty；每個 quote 都需有核准的 `evidenceRef` 與最小必要原文。
3. `quote` 必須能在 JAA 版本化 Normalizer 產生的可讀 Evidence 中精確回查。
4. `evidenceExplanation` 必須說明這段證據為何支持本 Skill，不能只重述 Skill Name。
5. `negativeChecks` 只能記錄實際執行的相近技能或排除檢查。
6. `rationale` 必須是此 Skill 專屬，不能以 Record 共用句取代。
7. 不得使用 `record-index-*`、`unknown-record-*` 或其他模型自造來源識別。
8. 相鄰 Evidence 即使內容類似，也必須各自判斷，不可直接套用前一筆結論。

### 11.3 分類狀態語意

| 狀態 | 使用條件 | `skillFindings` | `unknownReasons` | 原因主要存放處 |
|---|---|---|---|---|
| `CLASSIFIED` | 至少一個有效 Skill，且每個 Skill 都有完整獨立 Finding | 非空 | `[]` | Skill Finding／Record rationale |
| `UNKNOWN` | 不是明確非技能內容，但技術資訊不足，無合理候選 | `[]` | 至少一筆 | unknownReasons／rationale |
| `NEEDS_REVIEW` | 有合理候選，但歸屬、技能界線、完整性或矛盾需人工判斷 | 可空；有候選時必須完整 | `[]` | rationale／checks |
| `EXCLUDED` | 明確為 automation、workflow-only、request-only、completion-only、context-link-only、模板或非技能 Evidence | `[]` | `[]` | recordNegativeChecks／rationale |
| `CATALOG_DETAIL_MISSING` | 有技術內容，但 Catalog 缺少足以正式判斷的 Detail | 依實際候選，且每筆完整 | `[]` | Skill／Record rationale |
| `FAILED` | 解析、完整性或不可恢復技術錯誤使本筆未完成 | `[]` | `[]` | rationale／error evidence |

`UNKNOWN` 與 `EXCLUDED` 都是合法完成結果。不得為了讓每筆有 Skill、提高覆蓋率或降低 warning 而改成 `CLASSIFIED`。

### 11.4 Status 判斷順序

```text
明確非技能 Evidence → EXCLUDED
不是明確非技能，但技術資訊不足且無合理候選 → UNKNOWN
存在合理候選，但需要人工判斷歸屬、邊界、完整性或矛盾 → NEEDS_REVIEW
至少一個 Skill 有充分、獨立、可追溯證據且通過負面檢查 → CLASSIFIED
有技術證據但 Catalog Detail 不足 → CATALOG_DETAIL_MISSING
不可恢復技術錯誤使本筆無法完成 → FAILED
```

Status 一旦依 Evidence 語意決定，欄位必須服從該 Status。禁止為了 Schema、範例、分類率或固定分布改變 Status。

### 11.5 Decision Transport 與 Deterministic Assembly

1. `unknownReasons` 只有 `UNKNOWN` 可非空；所有其他 Status 必須為 `[]`。
2. `EXCLUDED` 原因放 `recordNegativeChecks`／rationale，不放 unknownReasons。
3. `NEEDS_REVIEW` 覆核原因放 rationale／checks，不放 unknownReasons。
4. JAA Dynamic Tool Schema、Prompt、TypeScript type、semantic validator 與 canonical assembly 必須使用同一矩陣。
5. 正式 array 必須 exact count N、順序與 index coverage 完整；模型送出前自我檢查，但只允許一次 Artifact submission，不導入 Repair。
6. JAA 以不可變 `recordIndex → source identity／sourceContentHash` 對照回填 identity。
7. `skillIds` 由 JAA 從 `skillFindings[].skillId` 衍生；若相容畫面需要 `positiveEvidence`，也必須標示為 derived，不得冒充模型原始欄位。

### 11.6 Schema、Semantic 與 Quality Gate

- Schema Validation：檢查 direct array、count、index、exact fields、types、enum 與 additional properties。
- Semantic Validation：檢查 Status matrix、Catalog membership、Skill uniqueness、Evidence Ref、Quote traceability 與來源 identity。
- Quality Gate：計算 explanation／rationale／unknown reason exact duplicate ratio、multi-skill independent finding、excessive Skill、generic explanation 與 Catalog 狀態。

分級：

- `PASSED`：Schema／Semantic 通過且無分析品質 Warning。
- `WARNING`：結構有效，但存在需人工判斷的重複、過多 Skill、泛化說明或 Catalog review-draft。
- `BLOCKED`：缺少 required per-skill Finding、Evidence 無法追溯或其他破壞可信度的問題。
- `LEGACY_UNVERIFIED`：Decision v2 僅供預覽。

Exact duplicate ratio `> 0.50` 或單筆 Skill Finding `> 5` 的版本化預設行為是 Warning，不得自動改寫分類。WARNING 未被 durable manual acceptance 前禁止 SQLite；BLOCKED 不可用一般接受操作繞過。

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

## 13. Evidence Normalization 與 Report Enrichment

### 13.1 Readable Evidence

JAA 使用 `JAA-EVIDENCE-NORMALIZER-1.0.0` 將 Comment／Description／Changelog Diff 的包裝轉成可讀證據。Normalization 只處理呈現與 quote traceability，不得摘要、改寫、翻譯或補字。

預設可讀內容應移除 JSON wrapper、escaped quote、literal `\\r\\n`、`body`、`commentId`、`contentStatus` 與 `provenance` 等非語意 metadata，並保留真實換行。原始內容仍需完整保存並可展開查驗。

Normalizer 失敗時使用安全 escaped raw fallback，記錄 diagnostics；不得丟失來源或偽造 readable evidence。原始 bytes、Stable ID、Evidence ID、source hash 與 record hash 完全不變。

### 13.2 Quote Traceability

每個 Skill Finding 的 quote 必須：

1. 指向該 Record 核准 Evidence Ref。
2. 是 normalized source 的 exact substring。
3. 能經 normalization receipt 回到 raw source／JSON pointer／diff hunk。
4. 使用最小必要範圍，不以整份 Comment 或完整 JSON 取代精確證據。

### 13.3 Run-scoped Issue Snapshot

Issue Type、Priority、Jira Status 與 Project 統計由 JAA 在 Run 建立時從本機 Current-State Snapshot 固定，不交給模型分析或補值，也不增加模型輸入。

- Unique Issue 使用 `trim(issueKey).toUpperCase()` 去重。
- 同一 Issue 有多筆 Event 時，Issue Type／Priority／Jira Status 只計一次。
- 缺少 Snapshot 時顯示 `資料未提供`，不得猜測。
- Report enrichment warning 不得改寫 AI Status，也不單獨阻擋 SQLite。

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

Decision v3 模型傳輸欄位：

```text
recordIndex
status
confidence
skillFindings[].skillId
skillFindings[].confidence
skillFindings[].evidenceQuotes[].evidenceRef
skillFindings[].evidenceQuotes[].quote
skillFindings[].evidenceExplanation
skillFindings[].negativeChecks
skillFindings[].rationale
recordNegativeChecks
unknownReasons
rationale
```

JAA Canonical Assembly 另行加入／衍生：

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
issueSnapshot
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

本節說明 v1.3.0 如何套用至 JiraActivityAnalyzer。Evidence 權重與計分公式維持 v1.1.0；本版補齊 Decision v3、Readable Evidence、Quality Gate、Run-scoped Issue Snapshot、本機 HTML renderer 與跨 Run 共存邊界。

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

### 17.3 模型 Decision 與已分析資料

- 已分析檔必須保留待分析檔的原始 Evidence 身分與內容 Hash，並在每筆資料新增結構化分析結果。
- 分析器不得修改、重排後冒充原始 Evidence；若允許排序顯示，永久身分與 Hash 必須保持不變。
- 模型的受控 Decision transport 可只回傳本次 Run 的 `recordIndex` 與分析欄位，不要求模型複製 `evidenceUniqueId`、Stable ID 或來源 Hash。
- JAA 必須在送出前建立不可變 `recordIndex → source identity/sourceContentHash` 對照，驗證 Decision 的 exact count、index 範圍、唯一性與順序後，再 deterministic assembly 回填 `evidenceRefs`。
- 最終可攜式已分析檔與 AI Analysis DB 必須保存完整 `evidenceRefs` 與 Hash；禁止依未經驗證的陣列位置猜測，也禁止採用模型自造的來源 ID。
- Unknown／Needs Review 必須是合法結果，不得強迫分類。

### 17.4 權威統計與報告

- `CLASSIFIED`／`UNKNOWN`／Skill assignment／multi-skill 等 count 必須由 JAA 讀取已通過 Schema 與 semantic validation 的 Decision 或 Canonical Result 計算。
- ChatGPT 的 `analysis-report.md` 與最終摘要可以描述觀察，但若文字 count 與 JAA 本機計算不一致，JAA count 為權威，並產生 warning。
- 模型不得以自然語言聲稱取代 Artifact Receipt、Validation Report、Canonical Result 或 SQLite gate。
- Golden HTML 必須由 JAA 本機使用 Manifest 綁定的 `Skill_Analysis_HTML_Report_Template_v1.2.0.md` 與已通過驗證的 Canonical Result 產生，不接受模型產生的 HTML 作為正式報告。
- HTML 產生或重新產生不得重新呼叫 ChatGPT，也不得改寫 Canonical Result 或 SQLite。
- Event 與 Unique Issue 統計必須明確標示母體；相同 normalized Issue Key 的 Issue Type／Priority／Jira Status 只計一次。
- Readable Evidence 預設顯示 normalized text，Raw Source 預設收合且始終可查驗。

### 17.5 匯入 AI Analysis DB

- 已分析檔通過 Schema、Rule Set、來源 DB 身分、Evidence ID 與 Content Hash 驗證後，才可匯入 AI Analysis DB。
- 匯入後預設狀態應為 `PENDING_REVIEW`。
- AI Raw Result 不可修改；人工修訂另存 Human Reviewed Result。
- 只有人工確認的結果可標成正式 `CONFIRMED`，並用於個人／團隊／專案技能報告。

## 18. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 1.3.0 | 2026-08-19 | proposed | 升級 Decision v3 per-skill Finding、numeric confidence enum、Readable Evidence／Quote traceability、三層驗證、Quality／SQLite Gate 與 Run-scoped Issue Snapshot |
| 1.2.1 | 2026-08-14 | proposed | 補齊 Status／Decision 欄位矩陣、判斷順序、禁止格式驅動分類漂移、本機 HTML Template 邊界與不同 Run 結果共存 |
| 1.2.0 | 2026-08-14 | approved | 保留既有權重與公式；加入同 Group multi-skill、Evidence-specific 證據、狀態語意、recordIndex deterministic assembly 與本機權威統計 |
| 1.1.0 | 2026-07-20 | approved | 分離 Common Rules／Catalog／Manifest，加入 Detail Description、版本綁定與 JiraActivityAnalyzer 整合邊界 |
