# Skill Analysis Rule Set Manifest v0.7.0

- File: `Skill_Analysis_Rule_Set_Manifest_v0.7.0.md`
- Manifest Schema Version: `0.7.0`
- Previous Version: `0.6.0`
- Rule Set ID: `JAA-SKILL-RULESET-2026-08-20-DRAFT-07`
- Status: `review-draft`
- Prepared Date: `2026-08-20`
- Target Application: `JiraActivityAnalyzer`
- Target Application Version: `0.3.25`
- Prompt Locale: `zh-TW`

## 1. 文件定位

本 Manifest 是一次技能分析的唯一版本綁定入口，負責把 Common Rules、Catalog、Decision／Quality／Evidence／Canonical Contract、Report Data Package、HTML Template 與 Renderer 綁成可驗證 Rule Set Snapshot。

v0.7.0 延續 v0.6.0 的分析語意，不變更 279 Skills、Decision v4、Evidence 規則或 HTML Template DSL。本次新增的是應用程式層的：

1. 四角色逐檔選取。
2. Manual Draft／Active 原子交易。
3. 統一 rule validation service。
4. 分析 Attempt 與 Run 分離。
5. Active Analysis Result 與導頁閘門。
6. 自動分析與手動匯入共用的 result pipeline。
7. Results 僅顯示成功 Active Dataset。
8. Debug Folder 的 attempt-aware lineage。

本 Manifest 不重複定義 279 個 Skill，不允許模型自行新增 Skill，也不要求模型產生 HTML、Report Data Package、統計或寫入本機檔案。

## 2. 正式文件與元件綁定

| Binding | Value | Bytes | SHA-256／狀態 |
|---|---|---:|---|
| `rule_set_id` | `JAA-SKILL-RULESET-2026-08-20-DRAFT-07` | — | review-draft |
| `manifest_file` | `Skill_Analysis_Rule_Set_Manifest_v0.7.0.md` | runtime | 本檔載入時計算；不得自我綁定固定 Hash |
| `common_rules_version` | `1.5.0` | — | unchanged from v0.3.24 |
| `common_rules_file` | `Skill_Classification_Common_Rules_v1.5.0.md` | 32639 | `779f7afa569834535cd200895412097dbee13a775d588555deacae1ce8c47ccc` |
| `skill_catalog_version` | `0.3.1` | — | unchanged review-draft |
| `skill_catalog_file` | `Skill_Catalog_v0.3.1.md` | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d`；279 Skills |
| `html_report_template_version` | `1.4.0` | — | unchanged from v0.3.24 |
| `html_report_template_file` | `Skill_Analysis_HTML_Report_Template_v1.4.0.md` | 34465 | `a2370c1a92bf3b504e23764ef8fdba54ca073f084b4c50605b7250f08a27c5d4` |
| `classification_engine_version` | `JAA-CLASSIFICATION-1.4.0` | — | Decision v4 minimum contract |
| `prompt_version` | `JAA-CHATGPT-ZH-TW-0.3.25` | runtime | effective instruction bytes／hash 逐 Run 保存 |
| `pipeline_version` | `JAA-ANALYSIS-PIPELINE-0.3.25` | runtime | deterministic assembly／validation／identity |
| `bridge_version` | `0.3.25-bridge-v7` | runtime | bundled／hash verified／local-only |
| `rule_selection_transaction` | `jaa-rule-set-selection-transaction-v1` | runtime | Draft／Active atomic activation |
| `active_result_contract` | `jaa-active-analysis-result-v1` | runtime | successful analyzed result registry |
| `navigation_decision_receipt` | `jaa-analysis-navigation-decision-v1` | runtime | Workspace → Results gate |
| `decision_schema` | `jaa-ai-analysis-decisions-v4` | runtime | unchanged |
| `canonical_result` | `jaa-canonical-analysis-result-v5` | runtime | unchanged |
| `report_data_package` | `jaa-analysis-report-data-package-v1` | runtime | unchanged |
| `html_template_contract` | `jaa-html-report-template-v5` | runtime | unchanged |
| `html_renderer` | `JAA-LOCAL-HTML-RENDERER-1.4.0` | runtime | unchanged local-only renderer |

Catalog 仍為 `review-draft`。結果適用於 POC、規則驗證與人工覆核；在 279 項 Detail Description 完整且人工核准前，不得宣稱為正式人員職能結論。

## 3. Machine-readable Manifest Contract

JAA 只解析下列標記之間的 JSON object。載入時必須核對檔名、內部版本、bytes 與 SHA-256。

<!-- BEGIN JAA_RULE_SET_MANIFEST_JSON -->
```json
{
  "schemaVersion": "0.7.0",
  "ruleSetId": "JAA-SKILL-RULESET-2026-08-20-DRAFT-07",
  "status": "review-draft",
  "targetApplicationVersion": "0.3.25",
  "promptLocale": "zh-TW",
  "providerInputContract": {
    "jsonFileCount": 1,
    "markdownFileCount": 3,
    "modelVisibleRoles": ["RULE_SET_MANIFEST", "COMMON_RULES", "SKILL_CATALOG"],
    "localOnlyRoles": ["HTML_REPORT_TEMPLATE"],
    "fixedBatching": false,
    "automaticRepair": false,
    "singlePrimaryTurn": true
  },
  "selectionTransaction": {
    "contract": "jaa-rule-set-selection-transaction-v1",
    "allowedActiveModes": ["BUNDLED_DEFAULT", "MANUAL_EXPLICIT"],
    "rolePickerMode": "PER_ROLE_EXPLICIT",
    "requiredRoles": ["RULE_SET_MANIFEST", "COMMON_RULES", "SKILL_CATALOG", "HTML_REPORT_TEMPLATE"],
    "draftBeforeActive": true,
    "atomicActivation": true,
    "partialActivationAllowed": false,
    "mixedSourceSetAllowed": false,
    "directoryGuessingAllowed": false,
    "silentFallbackAllowed": false,
    "activeSetPreservedOnDraftFailure": true,
    "restartRevalidationRequired": true
  },
  "documents": [
    {
      "role": "RULE_SET_MANIFEST",
      "fileName": "Skill_Analysis_Rule_Set_Manifest_v0.7.0.md",
      "version": "0.7.0",
      "modelVisible": true,
      "selfHash": "runtime-calculated"
    },
    {
      "role": "COMMON_RULES",
      "fileName": "Skill_Classification_Common_Rules_v1.5.0.md",
      "version": "1.5.0",
      "bytes": 32639,
      "sha256": "779f7afa569834535cd200895412097dbee13a775d588555deacae1ce8c47ccc",
      "modelVisible": true
    },
    {
      "role": "SKILL_CATALOG",
      "fileName": "Skill_Catalog_v0.3.1.md",
      "version": "0.3.1",
      "bytes": 24636,
      "sha256": "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d",
      "recordCount": 279,
      "modelVisible": true
    },
    {
      "role": "HTML_REPORT_TEMPLATE",
      "fileName": "Skill_Analysis_HTML_Report_Template_v1.4.0.md",
      "version": "1.4.0",
      "bytes": 34465,
      "sha256": "a2370c1a92bf3b504e23764ef8fdba54ca073f084b4c50605b7250f08a27c5d4",
      "modelVisible": false
    }
  ],
  "contracts": {
    "classificationEngine": "JAA-CLASSIFICATION-1.4.0",
    "prompt": "JAA-CHATGPT-ZH-TW-0.3.25",
    "pipeline": "JAA-ANALYSIS-PIPELINE-0.3.25",
    "bridge": "0.3.25-bridge-v7",
    "decision": "jaa-ai-analysis-decisions-v4",
    "quality": "jaa-ai-analysis-quality-v2",
    "evidenceSegmenter": "JAA-EVIDENCE-SEGMENTER-1.0.0",
    "evidenceNormalizer": "JAA-EVIDENCE-NORMALIZER-1.0.0",
    "issueSnapshot": "jaa-issue-snapshot-profile-v1",
    "canonicalResult": "jaa-canonical-analysis-result-v5",
    "reportDataPackage": "jaa-analysis-report-data-package-v1",
    "htmlTemplate": "jaa-html-report-template-v5",
    "htmlRenderReceipt": "jaa-html-render-receipt-v2",
    "htmlRenderer": "JAA-LOCAL-HTML-RENDERER-1.4.0",
    "ruleSelectionTransaction": "jaa-rule-set-selection-transaction-v1",
    "activeResult": "jaa-active-analysis-result-v1",
    "navigationDecision": "jaa-analysis-navigation-decision-v1"
  },
  "analysisAttempt": {
    "createdBeforePreflight": true,
    "runOptionalUntilDispatch": true,
    "mustNotAttachPreviousRun": true,
    "attemptEvidenceRequiredOnPreflightFailure": true
  },
  "navigationGate": {
    "providerAcceptedAllowsResults": false,
    "providerCompletedAllowsResults": false,
    "artifactPublishedAllowsResults": false,
    "validationFailedAllowsResults": false,
    "requiredState": "ACTIVE_ANALYZED_RESULT_COMMITTED",
    "receiptContract": "jaa-analysis-navigation-decision-v1"
  },
  "activeResult": {
    "contract": "jaa-active-analysis-result-v1",
    "acceptedSourceKinds": ["ANALYSIS_RUN", "MANUAL_IMPORT"],
    "latestOrderField": "authoritativeCompletedAtUtc",
    "fileMtimeAuthoritative": false,
    "failedAttemptMayReplaceActive": false,
    "partialMayReplaceActive": false,
    "cancelledMayReplaceActive": false,
    "invalidMayReplaceActive": false,
    "downstreamFailureMayInvalidateAnalyzedResult": false
  },
  "resultPipeline": {
    "steps": ["VALIDATE", "ACTIVATE", "BUILD_REPORT_DATA_PACKAGE", "COMPUTE_STATISTICS", "RENDER_HTML"],
    "automaticAnalysisAndManualImportSharePipeline": true,
    "idempotent": true,
    "reportStatisticsSource": "REPORT_DATA_PACKAGE_ONLY",
    "chatGptProseStatisticsAllowed": false
  },
  "resultView": {
    "mode": "ACTIVE_SUCCESSFUL_DATASET_ONLY",
    "successfulHistorySelector": true,
    "failedRunsInDefaultSelector": false,
    "showAnalyzedResultLineage": true,
    "showReportPackageLineage": true,
    "showHtmlLineage": true,
    "showProviderDiagnostics": false,
    "showConversation": false,
    "showLifecycleGrid": false
  },
  "statistics": {
    "source": "REPORT_DATA_PACKAGE",
    "eventPopulation": true,
    "uniqueIssuePopulation": true,
    "uniqueIssueIdentity": "jiraServerIdentity + trim(issueKey).toUpperCase()",
    "snapshotFieldStates": ["PRESENT", "EMPTY", "NOT_APPLICABLE", "NOT_CAPTURED", "SOURCE_UNAVAILABLE", "CONFLICT"]
  },
  "debugCollection": {
    "attemptAware": true,
    "attachRunOnlyByLinkedRunId": true,
    "latestRunFallbackAllowed": false,
    "roleBasedVersionedFiles": true,
    "unversionedAliasLookupAllowed": false,
    "activeDraftReceiptsRequired": true,
    "navigationReceiptsRequired": true
  },
  "evidenceRoles": {
    "PRIMARY_CHANGE": "may-support-classified",
    "SUPPORTING_CONTEXT": "supplement-only",
    "INELIGIBLE": "must-not-support-classified"
  },
  "validation": {
    "aggregateFindings": true,
    "stopAfterFirstFinding": false,
    "safeReadOnlyContinuation": true,
    "sharedUiAndPreflightService": true,
    "resolvedActiveErrorsMustClear": true,
    "undefinedErrorPresentationAllowed": false
  },
  "reportDataPackage": {
    "contract": "jaa-analysis-report-data-package-v1",
    "automaticAfterCanonical": true,
    "automaticFirstHtml": true,
    "rendererDirectInputs": ["REPORT_DATA_PACKAGE", "HTML_REPORT_TEMPLATE"],
    "liveDatabaseQueryDuringRender": false,
    "providerUseDuringRender": false,
    "externalPackageFormalSqliteWrite": "DENY",
    "uniqueIssueIdentity": "jiraServerIdentity + trim(issueKey).toUpperCase()",
    "oneSnapshotPerUniqueIssue": true,
    "snapshotConflictPolicy": "FAIL_CLOSED_NO_LAST_WRITE_WINS"
  },
  "templateCapabilities": {
    "required": ["REPORT_DATA_PACKAGE_V1", "UNIQUE_ISSUE_SNAPSHOT_V1", "SNAPSHOT_FIELD_STATE_V1", "DECLARATIVE_STATISTICS_DSL_V1", "MULTI_TEMPLATE_OFFLINE_RENDER_V1"],
    "arbitraryJavaScript": false,
    "sql": false,
    "arbitraryJsonPath": false,
    "remoteResources": false
  }
}
```
<!-- END JAA_RULE_SET_MANIFEST_JSON -->

## 4. Selection Transaction 規則

### 4.1 四個固定角色

JAA 必須提供四個獨立 selector。角色由 UI control 決定，不得由檔名猜測：

1. `RULE_SET_MANIFEST`
2. `COMMON_RULES`
3. `SKILL_CATALOG`
4. `HTML_REPORT_TEMPLATE`

### 4.2 Draft 與 Active

- 單檔選取只寫入 Draft。
- Draft 4/4 前不得改變 Active。
- Draft 4/4 通過 individual validation 及 aggregate Manifest binding 後，才能 atomic activate。
- 啟用失敗時保留既有 Active。
- Manual set 不得混入 bundled 檔案。
- 不得因 Manual 失敗 silent fallback 到 Bundled。

### 4.3 顯示與 Receipt

每個角色都要顯示 actual user-selected path、basename、version、bytes、hash、validation state。Active 與 Draft path 必須區分。每次選取、驗證、啟用、取消與切回 Bundled 都要有 durable receipt。

## 5. Analysis Attempt 與導頁規則

1. 操作者按下開始分析時先建立 attempt。
2. Preflight 失敗時 `linkedRunId=null`，Debug 不得附上舊 Run。
3. Provider accepted／completed 或 Artifact published 均不足以開啟 Results。
4. 正式 Analyzed Result atomic publish、reopen/hash verify 並完成 Active Result commit 後，才允許前往 Results。
5. 導頁 ALLOW／DENY／DEFER 都要保存 receipt。

## 6. Active Result 與 Results 規則

1. 新成功分析自動成為 Active Result。
2. 手動匯入 completed analyzed JSON 使用同一 pipeline。
3. Failed、Partial、Cancelled、invalid 或零結果不得成為 Active。
4. 較新的失敗 attempt 不得取代既有成功 Active Result。
5. Package／HTML／SQLite failure 不得使已有效 Analyzed Result 消失。
6. Results 只呈現 Active successful dataset、successful history selector、result list、review、CSV、HTML、lineage 與 Package-derived statistics。
7. Provider diagnostics、conversation、lifecycle、token、Bridge 與 raw analysis report 留在 Workspace 與 Debug Folder。

## 7. Report、Snapshot 與 HTML 不變契約

1. Analyzed Result 維持 Pending Dataset 為基礎，只增加分析與追溯欄位；不在每筆 event 重複完整 Snapshot。
2. 原始 Jira database 保持 authoritative snapshot source。
3. Report Data Package 每個跨 Server Unique Issue 只保存一份 Snapshot。
4. HTML 直接輸入只有 Package 與 Template；render 時不得查 Jira／SQLite／AI DB、不得呼叫 Provider。
5. Template v1.4.0 仍是 allowlisted declarative DSL，不允許 arbitrary JavaScript、SQL、任意 JSONPath 或 remote resource。
6. Event 與 Unique Issue 統計的 population 必須分開標示。

## 8. Provider 正式輸入與輸出

正式 Provider 輸入仍為：

1. Model Analysis Package JSON
2. 本 Manifest
3. Common Rules v1.5.0
4. Skill Catalog v0.3.1

HTML Template v1.4.0 不送 ChatGPT。模型輸出仍為精確 N 筆 Decision v4 direct JSON array，加上獨立繁體中文 Analysis Report 與 final assistant summary。模型不負責 Package、統計、HTML、SQLite 或 shell 檔案 I/O。

## 9. Fail-closed 規則

下列任一情況不得 dispatch Provider：

- Active set 不完整或無法 reopen
- 任一 role 的 basename／version／bytes／hash 不符
- Manual set 混入 bundled 或 role 不一致
- Manifest binding 失敗
- Pending dataset receipt 不完整
- Effective instruction 無法確定

下列任一情況不得建立正式 Canonical／SQLite：

- Decision contract 不合格
- semantic／quality gate 阻斷
- stable identity、source hash 或 count 不符
- artifact hash／flush evidence 不完整

## 10. Debug 與稽核

Debug collector 以 `analysisAttemptId` 為第一層 correlation，只有透過 `linkedRunId` 收集 Run。Role files 由 receipt 的 exact versioned basename 收集，不使用無版本 alias。缺檔理由必須依真實 lifecycle，不得把 artifact 已發布後的 validation failure 說成 publication 前中止。

## 11. Compatibility

### 11.1 相容

- Common Rules v1.5.0
- Catalog v0.3.1
- Decision v4
- Canonical v5
- Report Data Package v1
- HTML Template v1.4.0／contract v5
- Renderer 1.4.0

### 11.2 不相容或必須拒絕

- 無版本或版本不符的角色檔
- hash／bytes 與本 Manifest 不符的角色檔
- 混合 Bundled／Manual set
- Decision v2／v3 artifact 冒充 v4 formal result
- 未通過 Active Result gate 的 Run 直接成為 Results active dataset
- Report HTML 在 render 時直接查詢 live source

## 12. 版本紀錄

### v0.7.0

- Target JAA v0.3.25。
- 新增 per-role explicit selection。
- 新增 Draft／Active atomic transaction。
- 新增 Attempt-first preflight evidence。
- 新增 Active Analysis Result 與 Navigation Decision Receipt。
- 統一 analysis completion 與 manual import pipeline。
- Results 改為 successful Active Dataset only。
- Debug collector 改為 attempt-aware、linked-run-only。
- Common Rules、Catalog、Decision、Evidence、Package 與 HTML 語意不變。

### v0.6.0

- Target JAA v0.3.24。
- 新增 Decision v4、Evidence Segment、Report Data Package 與 Template v1.4.0 綁定。

---

本文件狀態為 `review-draft`。JAA 必須逐 Run 保存本 Manifest 的實際 bytes／SHA-256、三份 model-visible 輸入與 local-only Template receipt，才能重現當次分析與報告。
