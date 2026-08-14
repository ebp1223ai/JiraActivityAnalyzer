# 技能分類通用規則 v1.2.0

- Rules Version: `1.2.0`
- Previous Version: `1.1.0`
- Schema Version: `1.2`
- Status: `approved`
- Effective Date: `2026-08-14`
- Current Catalog Baseline: `Skill_Catalog_v0.3.1.md`（目前為 review-draft）
- Previous Catalog Baseline: `skills_classification_transfer_pack_v0.2`
- Scope: Evidence normalization、歸屬、權重、分類、信心、排除、追溯與報告共同規則

## 1. v1.2.0 核心變更

本版延續 v1.1.0 的權重與計分公式，正式加入：

1. Multi-skill 不只允許跨 Group；同一 Group 內不同技術面向也可同時成立。
2. 每個 Skill assignment 必須有獨立且 Evidence-specific 的正向證據、負面檢查與理由，禁止套用重複模板。
3. 明定 `CLASSIFIED`、`UNKNOWN`、`NEEDS_REVIEW`、`EXCLUDED` 與 `CATALOG_DETAIL_MISSING` 的使用界線。
4. 明定模型 Decision transport 與最終可攜式 Analyzed File 的身分責任：模型可回傳受控 `recordIndex`，JAA 由不可變對照表 deterministic assembly 回填 `evidenceRefs` 與來源 Hash。
5. 報告統計必須由通過驗證的 Decision／Canonical Result 本機計算，模型文字統計只可作說明，不能作權威 count。
6. 補強請求資料、完成通知、工作流程狀態、context link 與附件檔名等非技術 Evidence 的排除規則。

v1.1.0 已建立的 Common Rules／Catalog／Manifest 分離、版本綁定、Detail Description 與追溯要求全部維持。

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

- **High**：本人高權重 evidence + 多個 strong signals，且無排除條件。
- **Medium**：有 strong signal 但 evidence 較少，或多個 medium signals。
- **Low**：主要只有 title、label、metadata 或 attribution 不足。
- **None**：automation、workflow-only、非技術內容。
- **Needs Review**：候選合理，但上下文、作者歸屬或跨 Group 判斷不足。

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

## 11. Multi-skill 與獨立證據

- 同一 issue/page/evidence 可對應多個技能。
- 同一 Group 內不同 Skill 也可以共存，不得預設只能選一個「主要 Skill」。
- 每個技能需有獨立的技術面向、signals、negative checks、score、confidence reason。
- 報告需列 `multiSkillEvidence` 與 `relatedSkillGroups`。
- 跨 Group 共存需說明各自支撐的技術面向。
- 同 Group 共存也需說明每個 Skill 的差異，例如 GC kernel／flow 與 GC event scheduling、suspend／stop 與 pausing control。
- 若多個 Skill 只有完全相同的一句證據且沒有可區分的技術面向，應只保留最精確的 Skill 或降為 `NEEDS_REVIEW`，不得複製理由湊成 multi-skill。
- 分析每筆 Evidence 時，應先列出所有合理候選，再逐一執行該 Skill 的正向與負面檢查；不能找到第一個合理候選就停止。

### 11.1 Evidence-specific 要求

每筆 Decision 的文字證據必須：

1. 可指回該筆 Evidence 的實際新增／刪除／Comment／Diff 內容。
2. 說明為何支持此 Skill，而不是只複述 Skill Name。
3. 說明已檢查哪些容易誤判的相似 Skill 或排除條件。
4. 不得使用 `record-index-*`、`unknown-record-*` 或其他模型自造的來源識別。
5. 相鄰 Evidence 即使內容類似，也必須各自判斷；不可把前一筆結論直接套到下一筆。

### 11.2 分類狀態語意

| 狀態 | 使用條件 |
|---|---|
| `CLASSIFIED` | 至少一個有效 Skill，且每個 Skill 都有足夠 Evidence-specific 支持與負面檢查 |
| `UNKNOWN` | 技術資訊不足，無法建立可靠 Skill；允許 `skillIds=[]`，並需列出不足原因與已檢查的負面條件 |
| `NEEDS_REVIEW` | 有合理候選，但作者歸屬、跨 Skill 界線、內容完整性或矛盾證據需要人工判斷 |
| `EXCLUDED` | 可明確判定為 automation、workflow-only、request-only、completion-only、context-link-only、模板或其他非技能 Evidence |
| `CATALOG_DETAIL_MISSING` | Evidence 有技術內容，但綁定 Catalog 缺少足以正式判斷的 Skill Detail；不得由模型補寫正式定義 |
| `FAILED` | 本筆因解析、完整性或不可恢復的技術錯誤未完成分析；不得用來包裝一般 UNKNOWN |

`UNKNOWN` 與 `EXCLUDED` 都是合法完成結果，不應為了讓每筆都有 Skill 而改成 `CLASSIFIED`。產品整合可以把全 UNKNOWN 或含 warning 的完整 Run 標記為 `completed_with_warnings`，但不得因此改寫每筆分類語意。

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

## 13. 報告輸出

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

## 14. 必備分類輸出欄位

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
common_rules_version
skill_catalog_version
rule_set_id
classification_version
```

## 15. 跨平台

- **JIRA**：Summary、Description、Comments、Changelog、Attachments Metadata、Remote Links、Labels、Custom Fields。
- **Confluence**：Page Body、Version Diff、Comments、Attachments Metadata、Labels、Linked JIRA。
- **Activity DB**：activity_events、activity_target_details、author、event type、target content、linked source。
- **Cloud AI**：完整 evidence block + bound Skill Catalog + negative rules + confidence reason。
- **Local AI**：使用同一 Catalog；可縮短 context，但不得省略 negative rules 與 attribution。
- **Offline**：token-aware regex / rule engine，禁止粗糙 substring matching。

## 16. JiraActivityAnalyzer 整合邊界

本節說明 v1.2.0 如何套用至 JiraActivityAnalyzer。Evidence 權重與計分公式維持 v1.1.0；本版變更的是模型 Decision transport、身分組裝與權威統計邊界。

### 16.1 待分析資料

- 只分析操作者在 Issue 檢視 → Activity Events 或使用者檢視 → All Activity Events 中實際選取並匯出的 Evidence／Diff。
- 未選取的 Activity Events 不應進入分析工作。
- 每筆 Evidence 必須保留穩定來源識別、`sourceContentHash`、Issue／History／Comment／Item 對照資訊。
- SQLite `rowid` 與本機 DB 路徑不可作永久追溯鍵。

### 16.2 三種分析來源

以下三種來源必須套用同一份 Catalog、Common Rules、Manifest 與輸出 Schema：

| Analyzer Type | 說明 |
|---|---|
| `CLOUD_AI` | 雲端 AI；必須先通過資料外傳、遮罩與最小化 Payload 規則 |
| `LOCAL_AI` | 地端 AI；可縮短 Context，但不可省略 attribution、negative rules 與版本資訊 |
| `OFFLINE_RULE` | 離線規則引擎；不得使用粗糙 substring matching，不假裝成 AI 模型 |

三者結果可以並存，不得互相靜默覆蓋。

### 16.3 模型 Decision 與已分析資料

- 已分析檔必須保留待分析檔的原始 Evidence 身分與內容 Hash，並在每筆資料新增結構化分析結果。
- 分析器不得修改、重排後冒充原始 Evidence；若允許排序顯示，永久身分與 Hash 必須保持不變。
- 模型的受控 Decision transport 可只回傳本次 Run 的 `recordIndex` 與分析欄位，不要求模型複製 `evidenceUniqueId`、Stable ID 或來源 Hash。
- JAA 必須在送出前建立不可變 `recordIndex → source identity/sourceContentHash` 對照，驗證 Decision 的 exact count、index 範圍、唯一性與順序後，再 deterministic assembly 回填 `evidenceRefs`。
- 最終可攜式已分析檔與 AI Analysis DB 必須保存完整 `evidenceRefs` 與 Hash；禁止依未經驗證的陣列位置猜測，也禁止採用模型自造的來源 ID。
- Unknown／Needs Review 必須是合法結果，不得強迫分類。

### 16.4 權威統計與報告

- `CLASSIFIED`／`UNKNOWN`／Skill assignment／multi-skill 等 count 必須由 JAA 讀取已通過 Schema 與 semantic validation 的 Decision 或 Canonical Result 計算。
- ChatGPT 的 `analysis-report.md` 與最終摘要可以描述觀察，但若文字 count 與 JAA 本機計算不一致，JAA count 為權威，並產生 warning。
- 模型不得以自然語言聲稱取代 Artifact Receipt、Validation Report、Canonical Result 或 SQLite gate。

### 16.5 匯入 AI Analysis DB

- 已分析檔通過 Schema、Rule Set、來源 DB 身分、Evidence ID 與 Content Hash 驗證後，才可匯入 AI Analysis DB。
- 匯入後預設狀態應為 `PENDING_REVIEW`。
- AI Raw Result 不可修改；人工修訂另存 Human Reviewed Result。
- 只有人工確認的結果可標成正式 `CONFIRMED`，並用於個人／團隊／專案技能報告。

## 17. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 1.2.0 | 2026-08-14 | approved | 保留既有權重與公式；加入同 Group multi-skill、Evidence-specific 證據、狀態語意、recordIndex deterministic assembly 與本機權威統計 |
| 1.1.0 | 2026-07-20 | approved | 分離 Common Rules／Catalog／Manifest，加入 Detail Description、版本綁定與 JiraActivityAnalyzer 整合邊界 |
