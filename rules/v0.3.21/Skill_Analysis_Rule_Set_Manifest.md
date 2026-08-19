# Skill Analysis Rule Set Manifest

- File: `Skill_Analysis_Rule_Set_Manifest.md`
- Manifest Schema Version: `0.3.0`
- Rule Set ID: `JAA-SKILL-RULESET-2026-08-14-DRAFT-03`
- Status: `review-draft`
- Prepared Date: `2026-08-14`
- Target Application: `JiraActivityAnalyzer`
- Target Phase: `v0.3.21`

## 1. 文件定位

本 Manifest 把一次技能分析所使用的 Catalog、Common Rules、分析器、輸入／輸出 Schema 與版本綁定在一起，確保同一筆結果日後可以回答：

- 使用哪一版技能表與分類規則？
- 由雲端 AI、地端 AI或離線規則分析？
- 使用哪個 Provider／Model／Prompt／Pipeline？
- 分析的是哪一筆 Diff？
- 是否仍能連回原始 Jira SQLite 的資料？
- 結果是否經人工確認？

本文件不是 Skill Catalog，也不重複定義 Evidence 權重或技能內容。

## 2. 本 Rule Set 綁定

| Binding | Value | 狀態 |
|---|---|---|
| `rule_set_id` | `JAA-SKILL-RULESET-2026-08-14-DRAFT-03` | review-draft |
| `common_rules_version` | `1.2.1` | proposed baseline |
| `common_rules_file` | `Skill_Classification_Common_Rules_v1.2.1.md` | SHA-256 `ad2bc33e9f519f7b752b130a6c73bed6eeddb928083d8a2e28732b306de2fa07` |
| `skill_catalog_version` | `0.3.1` | review-draft |
| `skill_catalog_file` | `Skill_Catalog_v0.3.1.md` | SHA-256 `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d`；279 項，逐 Skill 細節待補 |
| `classification_engine_version` | `JAA-CLASSIFICATION-1.2.1` | v0.3.21 最低相容契約 |
| `prompt_version` | `JAA-CHATGPT-ZH-TW-0.3.21` | Standard Formal 內建 Status／Decision 欄位矩陣；實際 mode／hash 仍逐 Run 記錄 |
| `pipeline_version` | `JAA-ANALYSIS-PIPELINE-0.3.21` | deterministic assembly／validation／run-scoped result identity |
| `report_template_version` | `1.0.0` | 本機 Golden HTML；不送給模型 |
| `html_report_template_file` | `Skill_Analysis_HTML_Report_Template_v1.0.0.md` | SHA-256 `aa3c7c0d4d919a7923eac3c3f43b2aad4f55ae4d39d4a4d407a63e0bce826ad9` |
| `html_report_template_id` | `JAA-SKILL-ANALYSIS-GOLDEN-HTML` | Manifest-bound local renderer template |
| `html_renderer_version` | `JAA-LOCAL-HTML-RENDERER-1.0.0` | deterministic／self-contained／offline |
| `pending_file_schema_version` | `draft-0.1` | 本文件提出 |
| `model_decision_schema_version` | `jaa-ai-analysis-decisions-v2` | 模型回傳受控 `recordIndex` Decision |
| `analyzed_file_schema_version` | `draft-0.2` | 加入 deterministic identity assembly 邊界 |

Rule Set 在 Catalog 仍為 `review-draft` 時，只能用於 POC、規則驗證與人工覆核，不應直接宣稱為正式人員技能結論。

## 3. 分析依據資料夾

AI Analysis 分頁由使用者選擇「分析依據資料夾路徑」。該資料夾至少包含：

```text
<analysis-rules>/
├─ Skill_Catalog_v0.3.1.md
├─ Skill_Classification_Common_Rules_v1.2.1.md
├─ Skill_Analysis_Rule_Set_Manifest.md
└─ Skill_Analysis_HTML_Report_Template_v1.0.0.md
```

其中：

- ChatGPT 模型輸入仍只有 Catalog、Common Rules、Manifest 三份 MD。
- HTML Report Template 是 JAA 本機 Renderer Reference，不得作為第四份模型輸入。
- Template 必須由本 Manifest 精確綁定；不得掃描資料夾猜測或任意執行其他 MD。

### 3.1 載入規則

1. 執行分析前驗證三份 AI Analysis Reference 與一份本機 HTML Report Template 存在且可讀。
2. 解析檔內版本，不可只相信檔名。
3. Catalog／Common Rules 版本必須與 Manifest binding 一致。
4. 每次 Run 分別記錄三份模型參考 MD 與一份本機 Template MD 的檔名、角色、版本與 SHA-256。
5. 分析進行中即使資料夾內容改變，本次 Run 仍使用啟動當下的 Rule Set Snapshot。
6. 不自動載入資料夾內其他任意檔案；新增參考檔需先被 Manifest allowlist 綁定。
7. 缺檔、版本不符、Hash 在 Run 中改變或 Catalog 狀態不允許時，必須 fail closed。
8. 本機資料夾路徑只供 App 讀取，不需傳送給雲端模型，也不作永久版本識別。
9. 每次 Run 必須在 Snapshot 建立後計算四份 MD 的實際 bytes 與 SHA-256；Manifest 不以可變路徑或檔名取代內容 Hash。
10. 三份 AI Reference MD 定義分類語意與版本綁定；HTML Template MD 定義本機呈現。Provider transport、Tool Schema、retry、Runtime 與 SQLite gate 由 JAA 版本化程式契約負責，不應寫回 Catalog 當成技能規則。
11. Model Delivery Receipt 只能計入三份 AI Reference MD 與 Pending JSON；HTML Template 不得計入 Provider delivered bytes／files。

## 4. 整體資料流

```text
原始 Jira SQLite（事實來源）
→ Issue Activity Events／User All Activity Events 人工篩選
→ 匯出待分析資料檔
→ AI Analysis 選擇分析來源＋待分析檔＋規則資料夾
→ 執行雲端 AI／地端 AI／離線規則
→ 產生已分析資料檔
→ JAA 使用 Manifest 綁定的 HTML Template 由 Canonical Result 本機產生 Golden HTML
→ AI Analysis 檢視與驗證
→ 匯入 AI Analysis DB（PENDING_REVIEW）
→ 人工確認（CONFIRMED）
→ Issue／User Activity Event 顯示分析結果
→ 個人／團隊／專案技能分析報告
```

必要邊界：

- 原始 Jira SQLite 永遠是 Before／After／Diff 的事實來源。
- AI Analysis DB 與原始 Jira DB 使用獨立 `.sqlite`。
- 待分析／已分析資料檔是可攜式交換格式，不取代兩個 DB。
- AI 不直接取得 SQLite 檔案、路徑、Schema 或 `rowid`。
- 未經人工選取的 Activity Event 不進入分析檔。

## 5. AI Analysis 分頁

### 5.1 必要設定

| 設定 | 說明 |
|---|---|
| 分析來源 | `CLOUD_AI`／`LOCAL_AI`／`OFFLINE_RULE` 三選一 |
| 待分析資料檔 | 從兩個 Activity Events Viewer 匯出的檔案 |
| 分析依據資料夾 | 內含本 Manifest 綁定的 Catalog 與 Common Rules |
| HTML 報告模板 | 由 Manifest 綁定 `Skill_Analysis_HTML_Report_Template_v1.0.0.md`；唯讀顯示，不任意選檔 |
| Provider／Model | Cloud／Local AI 必填；Offline Rule 不適用 |
| 執行分析 | 建立 Analysis Run 並產生已分析檔 |

### 5.2 顯示與操作

AI Analysis 分頁至少應能：

- 匯入並顯示待分析檔摘要與每筆 Diff。
- 顯示來源 DB、Jira Server、使用者、Issue、日期範圍與選取筆數。
- 顯示 Rule Set 驗證結果與缺少／版本不符項目。
- 分開顯示「AI 模型輸入：3 MD」與「本機 HTML Renderer：1 Template MD」。
- 顯示 Template 檔名、Template ID、版本、SHA-256、Renderer 相容性與驗證結果。
- 提供「預覽模板規格」、「複製模板完整路徑」、「重新產生 HTML」與「開啟 HTML」；重新產生不得呼叫 ChatGPT。
- 顯示 Run、輸入傳輸、分析、Artifact、成功、失敗、Needs Review 與 Unknown；傳輸 segment 不得稱為分析 Batch。
- 匯出已分析資料檔。
- 匯入既有已分析資料檔並顯示每筆分析結果。
- 驗證後匯入 AI Analysis DB。
- 不把「匯入檔案」等同於「人工確認正式結果」。

## 6. 待分析資料檔 Draft Contract

建議格式為 JSON；大量資料是否另支援 JSONL／ZIP，留待詳細設計。

### 6.1 Top-level 必備欄位

```text
schemaVersion
fileType = PENDING_ANALYSIS
exportId
exportedAt
sourceApplication
sourceAppVersion
jiraServerFingerprint
sourceDatabaseId
sourceDatabaseSchemaVersion
selectionContext
itemCount
items
fileContentHash
```

### 6.2 selectionContext

```text
viewerSource              ISSUE_ACTIVITY_EVENTS | USER_ALL_ACTIVITY_EVENTS
selectedUser
issueKeys
dateRange
activeFilters
selectedItemCount
```

`activeFilters` 用於說明匯出當下畫面條件；真正分析母體仍以 `items` 與其穩定 ID 為準。

### 6.3 每筆 item 必備欄位

```text
evidenceUniqueId
sourceDiffId
sourceEventId
sourceContentHash
issueId
issueKey
historyId
commentId
fieldId
fieldName
itemIndex
eventType
actorId
actorDisplayName
eventAt
beforeSourceRecordId
afterSourceRecordId
before
after
diffStatus
diffHunks
traceability
```

規則：

- `sourceDiffId + sourceContentHash` 是跨檔案與跨 DB 驗證的核心，不使用 SQLite `rowid`。
- `before`／`after` 可依隱私與檔案大小策略選擇完整值或受控內容；`diffHunks` 必須包含實際 added／removed。
- `before-unavailable`、`after-unavailable`、`source-mismatch`、`unparseable`、`diff-too-large` 必須保留狀態，不可偽裝成正常 changed。
- 每筆資料必須能回到 Jira History／Item／Comment 或穩定 Activity Event。
- Token、Authorization header、`.env`、DB 路徑與 SQLite Schema 不得出現在檔案。

## 7. 已分析資料檔 Draft Contract

已分析檔保留待分析檔的來源欄位，並新增：

### 7.1 Top-level 新增欄位

```text
fileType = ANALYZED
analysisFileSchemaVersion
sourcePendingFileHash
analysisRun
ruleSetSnapshot
analysisSummary
items[].analyses
analyzedFileContentHash
```

### 7.2 analysisRun

```text
analysisRunId
analyzerType
provider
modelId
modelVersionOrSnapshot
runtimeVersion
promptVersion
pipelineVersion
startedAt
completedAt
status
transportSegmentCount
```

Offline Rule 的 `modelId`／`modelVersionOrSnapshot` 可為空，但 `classification_engine_version`、`rule_set_id` 與 `skill_catalog_version` 不可省略。

### 7.3 ruleSetSnapshot

```text
ruleSetId
manifestSchemaVersion
commonRulesVersion
commonRulesFileHash
skillCatalogVersion
skillCatalogFileHash
classificationEngineVersion
promptVersion
pipelineVersion
```

### 7.4 每筆 analyses[]

```text
analysisResultId
analysisRunId
evidenceRefs
classificationUniqueId
group
skillId
skillName
detailDescriptionVersion
positiveSignals
negativeChecks
relatedSkillGroups
evidenceWeight
authorWeight
score
confidence
confidenceReason
classificationStatus
exclusionReason
analyzerType
analysisSourceIdentity
analyzedAt
```

`classificationStatus` 至少支援：

```text
CLASSIFIED
UNKNOWN
NEEDS_REVIEW
EXCLUDED
CATALOG_DETAIL_MISSING
FAILED
```

一筆 Evidence 可以有多個 `analyses[]`；同一筆 Evidence 由不同 Analyzer／版本分析時，結果必須並存。

### 7.5 Model Decision Transport 與 Deterministic Assembly

模型 Decision transport 與最終已分析檔是兩個不同層次：

1. 模型只需回傳本次 Run 的 `recordIndex` 與分類欄位，不得要求模型複製或自行建立 Stable ID、Evidence ID、source hash 或原始 record。
2. 正式 Decision array 必須 exact count `N`、`recordIndex` 唯一且完整覆蓋 `0..N-1`；重複、缺漏、越界或順序不符時 fail closed。
3. JAA 在送出前建立並 hash 不可變 `recordIndex → evidenceUniqueId/sourceDiffId/sourceEventId/sourceContentHash` 對照。
4. 只有 Decision Schema 與 semantic validation 通過後，JAA 才能 deterministic assembly 回填 `evidenceRefs` 與來源欄位。
5. 模型自造的 `record-index-*`、`unknown-record-*`、placeholder 或不在對照表中的來源身分一律拒絕。
6. `analysis-report.md` 與 ChatGPT 最終摘要不是 Canonical Result；其中 count 與 JAA 本機計算不一致時，以本機驗證結果為準並留下 warning。

模型正式 Decision 每筆的最低欄位：

```text
recordIndex
status
skillIds
confidence
positiveEvidence
negativeChecks
unknownReasons
rationale
```

`skillIds` 可包含同一 Group 或跨 Group 的多個 Skill；每個 Skill 必須符合 Common Rules v1.2.1 的獨立 Evidence-specific 判斷。

Status／Decision 欄位必須遵守：

| Status | `skillIds` | `positiveEvidence` | `unknownReasons` | 原因存放位置 |
|---|---|---|---|---|
| `CLASSIFIED` | 非空 | 非空 | `[]` | evidence／checks／rationale |
| `UNKNOWN` | `[]` | `[]` | 非空 | unknownReasons／rationale |
| `NEEDS_REVIEW` | 可有候選 | 有候選時非空 | `[]` | rationale／checks |
| `EXCLUDED` | `[]` | `[]` | `[]` | negativeChecks／rationale |
| `CATALOG_DETAIL_MISSING` | 依實際候選 | 依實際證據 | `[]` | rationale |
| `FAILED` | `[]` | `[]` | `[]` | rationale／error evidence |

禁止為通過 Schema 而改變 Status。Standard Formal、Dynamic Tool JSON Schema、TypeScript type、semantic validator 與 canonical assembly 必須使用相同矩陣。

### 7.6 Local Golden HTML Rendering

1. HTML 權威輸入只能是已通過驗證的 Canonical Result。
2. 模板固定由 `html_report_template_file` binding 解析，不接受 ChatGPT 產生 HTML。
3. Renderer 必須產生 self-contained、offline、無遠端資源的 HTML。
4. 寫入採 `.tmp`、fsync、atomic rename、reopen 與 SHA-256 驗證。
5. 每次 render 建立 `canonical-output/html-render-receipt.json`。
6. HTML render failure 與 SQLite failure 必須和 AI／Artifact／Canonical 狀態分離。
7. 對既有 Canonical Result 重新產生 HTML，不建立新 AI Run、不消耗 Token、不改寫 SQLite。

## 8. 三種 Analyzer 的共同與個別規則

### 8.1 共同規則

- 使用相同 Pending File Contract、Catalog、Common Rules 與 Analyzed File Contract。
- 最終已分析檔使用 `evidenceRefs`；模型 Decision 可用受控 `recordIndex`，由 JAA 驗證完整索引後回填，不依未驗證的輸出位置猜測。
- 回傳 JSON 必須通過 Schema validation。
- Unknown／Needs Review 是有效結果。
- 不得修改原始 Evidence。
- 相同分析來源已有結果時，不得靜默覆蓋。

### 8.2 CLOUD_AI

- 僅傳送操作者選取的最小化 Diff Payload。
- 公司資料外傳範圍、遮罩欄位與 API Key 保存方式必須先定案。
- 不把規則資料夾路徑、SQLite、完整 Full Fetch Result 或未選取資料送出。
- Provider／Model／Prompt／成本與 Token 統計需記錄。

### 8.3 LOCAL_AI

- 使用與 Cloud AI 相同的核心 Contract。
- Runtime、Model、Context limit 與 API contract 必須記錄。
- 可以縮短傳入內容，但不可省略 Evidence attribution、negative rules 與版本 binding。

### 8.4 OFFLINE_RULE

- 不需要模型。
- 必須使用 token-aware／word-boundary 規則與 disambiguation。
- 禁止粗糙 substring matching。
- 不具備足夠語意時回傳 `NEEDS_REVIEW` 或 `UNKNOWN`，不得提高信心假裝等同 AI 理解。

## 9. 原始 DB 與 AI Analysis DB 連結

兩個獨立 SQLite 之間不依賴跨檔案 Foreign Key；以穩定邏輯識別與 Hash 連結。

AI Analysis DB 至少保存：

```text
jiraServerFingerprint
sourceDatabaseId
sourceDatabaseSchemaVersion
sourceDiffId
sourceEventId
sourceContentHash
issueId / issueKey
historyId / commentId
fieldId / itemIndex
evidence snapshot used for analysis
analysisRunId
analysisSourceIdentity
ruleSetSnapshot
AI Raw Result
Human Reviewed Result
review status
```

`analysisResultId`／`resultId` 必須具有 Run scope 或等價的 Analysis Source Identity，確保不同 Run 對同一 Evidence 的結果可以並存。不得只以來源 Evidence 產生跨 Run 相同 `resultId`，否則 `classification_candidates(result_id, skill_id)` 會與既有結果碰撞。

正式追溯鏈：

```text
Reviewed Analysis Result
→ AI Raw Result
→ evidenceRefs
→ sourceDiffId / sourceEventId
→ sourceContentHash 驗證
→ 原始 Jira SQLite Before / After
→ Jira History / Item / Comment
```

原始 DB 搬移不應破壞連結；只要 `sourceDatabaseId` 與 Hash 驗證成立即可。若目前載入的原始 DB 不符，顯示 `SOURCE_MISMATCH`，不得猜測配對。

## 10. 匯入 AI Analysis DB

匯入前至少驗證：

1. 已分析檔 Schema 完整。
2. `sourcePendingFileHash`、每筆 `sourceContentHash` 正確。
3. Rule Set、Catalog、Common Rules 版本與 Hash 可辨識。
4. `evidenceRefs` 全部存在、無跨 Run／跨 Analysis Run 誤用。
5. Source DB 與 Jira Server 配對正確。
6. 分析來源身分完整。
7. 重複／重跑策略已明確決定。
8. 無 Token、API Key、Authorization header 或不允許欄位。

匯入行為：

- 使用 transaction。
- 不同 Run 使用不同 Result Identity 並存；同一 Run 的重試寫入必須 idempotent。
- Parent result 與 child candidates 必須在同一 transaction；衝突時完整 rollback 並保存實際 `resultId`、`skillId`、既有 Run ID 與新 Run ID。
- 預設匯入為 `PENDING_REVIEW`。
- AI Raw Result 不可修改。
- 人工修訂另存並保留前後差異。
- 只有 `CONFIRMED` 結果可進入正式技能統計與報告。
- 重跑不物理刪除舊結果；建議以 `SUPERSEDED`／`CURRENT` 保存歷史。

## 11. UI／環境設定整合

資料庫管理維持「管理集中、分析功能獨立」：

- Database Overview：管理原始 Jira DB 與 AI Analysis DB 的路徑、測試與配對。
- AI Analysis：管理待分析檔、規則資料夾、Analyzer、Run、結果檢視及匯入。

`.env` 建議綁定：

```dotenv
ENV_FORMAT_VERSION=3
LOCAL_DB_PATH=<原始 Jira SQLite>
AI_ANALYSIS_DB_PATH=<AI Analysis SQLite>
```

分析依據資料夾屬於 AI Analysis 操作設定；是否也寫入 `.env`、另存 UI preference 或每次選擇，仍待決策。無論採哪種方式，每個 Run 都必須保存實際檔案版本與 Hash，而不是只保存路徑。

## 12. 去重與重跑身分

最低唯一性基礎：

```text
sourceDiffId
+ sourceContentHash
+ analyzerType
+ provider
+ modelVersion
+ promptVersion
+ pipelineVersion
+ commonRulesVersion
+ skillCatalogVersion
+ classificationEngineVersion
+ ruleSetId
+ modelDecisionSchemaVersion
+ analysisRunId
```

| 情況 | 行為 |
|---|---|
| 同 Diff、不同 Analyzer／版本 | 新增結果並存 |
| 同 Diff、相同來源、無既有結果 | 建立 |
| 同 Diff、相同來源、不同 Run | 建立新的 Run-scoped Result Identity 並存，不覆蓋舊 Run |
| 同 Run 重試 SQLite commit | idempotent upsert／replace child set，不新增重複 candidate |
| Diff ID 相同但 Content Hash 改變 | 視為新的原始 Evidence 版本 |
| 取代目前結果 | 舊結果標成 `SUPERSEDED`，不物理刪除 |

## 13. 安全與隱私

- Cloud AI 前必須定義公司 Jira 資料外傳政策。
- API Key／Token 不寫入 Pending File、Analyzed File、Debug、Log 或 AI DB。
- Jira HTML／script／Prompt injection 內容一律視為資料，不執行其指令。
- 分析器不得直接任意查詢原始 SQLite。
- 分析結果不得覆蓋原始 Jira Evidence。
- 規則資料夾只載入 Manifest allowlist 檔案。
- 任何來源、版本、Hash 或 ref 驗證失敗時 fail closed。

## 14. 目前待決策

1. 大量待分析／已分析檔是否另支援 JSONL 或 ZIP package；v0.3.20 正式路徑維持 JSON。
2. 完整 Before／After 是否放入交換檔，或只放 Diff＋最小 Context。
3. AI Analysis 分頁是否內建 Run-scoped Staging DB；檔案模式與 Staging DB 的責任界線。
4. 分析依據資料夾路徑保存於 `.env`、UI Preference 或每次選擇。
5. `OFFLINE_RULE`、其他 `LOCAL_AI` 與目前 Managed ChatGPT 路徑的產品優先順序。
6. Local AI Runtime 是否採 AI Nexus，以及實際 API contract。
7. Cloud Provider、可外傳欄位、遮罩規則、Token 預算與重試。
8. 279 項 Skill 的 `detail_description`、逐 Skill signals 與人工核准。
9. AI Analysis DB 正式 Schema、Migration、備份與路徑命名；v0.3.21 先完成 Run-scoped Result Identity 與 idempotent child write。
10. 匯入 transaction 單位：整個 Run 或單一 Reviewed Result；不以模型分析 Batch 為單位。
11. 分析結果回填 Issue Viewer／User Viewer 的版面與篩選條件。
12. 個人／團隊／專案技能報告的聚合與計分方法。

## 15. Review Checklist

- [ ] Catalog 279 項 Skill ID 與原始清單一致。
- [ ] 4 個尚未提供技能表的 Group 不被 AI 自行補寫。
- [ ] Common Rules 版本與 Evidence／Author 權重、計分公式未被誤改。
- [ ] 同 Group／跨 Group multi-skill 都有獨立 Evidence-specific signals 與 negative checks。
- [ ] Model Decision 的 `recordIndex` 經完整驗證後才由 JAA 回填 Evidence identity。
- [ ] 報告 count 由 JAA 本機從已驗證資料計算，不依模型文字自報。
- [ ] 三種 Analyzer 套用同一 Contract。
- [ ] Pending File 可追溯每一筆原始 Diff。
- [ ] Analyzed File 不改寫原始 Evidence。
- [ ] AI Analysis DB 可透過穩定 ID＋Hash 連回原始 DB。
- [ ] 未人工確認的結果不進正式報告。
- [ ] Rule Set Snapshot 可重現每次分析依據。
- [ ] Model Input 維持 1 JSON + 3 MD；HTML Template 只供本機 Renderer。
- [ ] Manifest 能唯一解析 Template 檔名、ID、版本與 SHA-256。
- [ ] Canonical JSON 可在不呼叫 ChatGPT 的情況下重新產生相同 HTML。
- [ ] 不同 Run 的相同 Evidence／Skill 可在 SQLite 並存；同 Run 重試不重複寫入。
- [ ] Cloud AI 資料治理決策完成後才允許送出公司資料。

## 16. Change History

| Manifest Schema | Date | Status | Change |
|---|---|---|---|
| 0.3.0 | 2026-08-14 | review-draft | 綁定 Common Rules 1.2.1／Catalog 0.3.1／HTML Template 1.0.0／v0.3.21；加入 Status 欄位矩陣、本機 Golden HTML Renderer、Run-scoped Result Identity 與 SQLite idempotency |
| 0.2.0 | 2026-08-14 | review-draft | 綁定 Common Rules 1.2.0／Catalog 0.3.1／v0.3.20；新增 Model Decision transport、deterministic identity assembly、本機權威統計與無分析 Batch 邊界 |
| 0.1.0 | 2026-08-06 | review-draft | 首次整理 Catalog／Common Rules 綁定、Pending／Analyzed File Contract、三種 Analyzer、AI Analysis DB 追溯與 UI 整合構想 |
