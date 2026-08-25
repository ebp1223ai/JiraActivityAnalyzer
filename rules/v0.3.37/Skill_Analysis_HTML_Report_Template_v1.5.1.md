# JAA 技能分析 HTML 報告模板 v1.5.1

- File: `Skill_Analysis_HTML_Report_Template_v1.5.1.md`
- Template Schema Version: `jaa-html-report-template-v6`
- Template ID: `JAA-SKILL-ANALYSIS-GOLDEN-HTML`
- Template Version: `1.5.1`
- Previous Version: `1.5.0`
- Status: `proposed-for-v0.3.33`
- Locale: `zh-TW`
- Time Zone: `Asia/Taipei`
- Target Application: `JiraActivityAnalyzer`
- Target Application Version: `0.3.33`
- Minimum Renderer Version: `JAA-LOCAL-HTML-RENDERER-1.5.1`
- Required Decision Contract: `jaa-ai-analysis-decisions-v5`
- Required Normalizer: `JAA-EVIDENCE-NORMALIZER-1.0.0`
- Required Segmenter: `JAA-EVIDENCE-SEGMENTER-1.0.0`
- Required Evidence Quote Catalog: `JAA-EVIDENCE-QUOTE-CATALOG-1.0.0`
- Required Report Data Package: `jaa-analysis-report-data-package-v1`
- Required Issue Snapshot Profile: `jaa-issue-snapshot-profile-v1`
- Prepared Date: `2026-08-24`

## 1. 文件定位

本文件定義 Jira Activity Analyzer v0.3.33 的本機、deterministic、self-contained HTML。v1.5.1 延續 v1.5.0 的進階篩選、Unique Issue 統計、FORMAL／DIAGNOSTIC mode、Decision v5 Quote lineage 與離線多模板能力；本次修正：

1. Required capability 統一為 `LAYERED_VALIDATION_RECEIPTS_V2`，與 v0.3.33 Report Data Package 一致。
2. Minimum Renderer 升為 `JAA-LOCAL-HTML-RENDERER-1.5.1`。
3. 自動分析後 render 與 Results 頁手動「產生 HTML」必須呼叫同一 Renderer service、同一 compatibility validator 與同一 receipt writer。
4. Quality `WARNING` 必須顯示 Warning Banner、duplicate ratio、threshold、受影響欄位／records／Skills，以及 SQLite 是否等待人工接受。
5. HTML 失敗不得冒充 HTML 已建立；Canonical 成功但 HTML 失敗時顯示 `COMPLETED_WITH_REPORT_ERROR`。
6. 成功 HTML、失敗 receipt 與手動重繪產物都必須可被 Debug Folder 依 hash 收集。
7. App／Prompt／Bridge Identity 分開顯示，避免 App v0.3.33 被舊 Runtime identity 冒充。

本模板：

- `FORMAL_CANONICAL` 只讀取由正式 Canonical 組裝出的 Formal Report Data Package。
- `DIAGNOSTIC_NON_CANONICAL` 只讀取由可解析 Decision Artifact 與 validator findings 組裝出的 Diagnostic Report Data Package。
- 不送給 ChatGPT，不改變 Provider 的 `1 JSON + 3 MD` 模型輸入。
- 不重新分類、不補 Skill、不生成不存在的 Evidence Explanation。
- 不在開啟報告時重新查詢 Jira 或 SQLite。
- 不以 HTML 成功取代 Canonical、Quality 或 SQLite durable evidence。
- 對 Decision v2／v3 只能產生 `LEGACY_UNVERIFIED` preview，不可冒充 Decision v5 品質通過。

## 2. Machine-readable Template Contract

JAA 只解析下列標記之間的單一 JSON object。標記外內容只供人員閱讀。Filename、內部版本、Manifest binding、bytes 與 SHA-256 必須完全一致，否則 fail closed。

<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->
```json
{
  "schemaVersion": "jaa-html-report-template-v6",
  "templateId": "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  "templateVersion": "1.5.1",
  "locale": "zh-TW",
  "timeZone": "Asia/Taipei",
  "minimumRendererVersion": "JAA-LOCAL-HTML-RENDERER-1.5.1",
  "requiredCapabilities": [
    "REPORT_DATA_PACKAGE_V1",
    "UNIQUE_ISSUE_SNAPSHOT_V1",
    "SNAPSHOT_FIELD_STATE_V1",
    "DECLARATIVE_STATISTICS_DSL_V1",
    "MULTI_TEMPLATE_OFFLINE_RENDER_V1",
    "AI_SUBMITTED_ARTIFACT_DIAGNOSTIC_V1",
    "ARTIFACT_IDENTITY_RECEIPT_V1",
    "EVIDENCE_QUOTE_CATALOG_V1",
    "LAYERED_VALIDATION_RECEIPTS_V2"
  ],
  "renderModes": [
    "FORMAL_CANONICAL",
    "DIAGNOSTIC_NON_CANONICAL"
  ],
  "input": {
    "formalRole": "FORMAL_REPORT_DATA_PACKAGE",
    "diagnosticRole": "DIAGNOSTIC_REPORT_DATA_PACKAGE",
    "requiredReportDataPackageContract": "jaa-analysis-report-data-package-v1",
    "requiredIssueSnapshotProfile": "jaa-issue-snapshot-profile-v1",
    "requiredCanonicalContract": "jaa-canonical-analysis-result-v5",
    "requiredDecisionContract": "jaa-ai-analysis-decisions-v5",
    "requiredNormalizerVersion": "JAA-EVIDENCE-NORMALIZER-1.0.0",
    "requiredSegmenterVersion": "JAA-EVIDENCE-SEGMENTER-1.0.0",
    "requiredEvidenceQuoteCatalogVersion": "JAA-EVIDENCE-QUOTE-CATALOG-1.0.0",
    "requiredIssueSnapshotContract": "jaa-issue-snapshot-profile-v1",
    "legacyPreviewContracts": [
      "jaa-ai-analysis-decisions-v2",
      "jaa-ai-analysis-decisions-v3"
    ]
  },
  "output": {
    "formalFilePattern": "analysis-result__template-v{templateVersion}__{renderedAtLocal}.html",
    "diagnosticFilePattern": "analysis-result-diagnostic__template-v{templateVersion}__{renderedAtLocal}.html",
    "overwriteExisting": false,
    "selfContained": true,
    "networkAccess": false,
    "defaultTheme": "light",
    "printEnabled": true,
    "filteredCsvEnabled": true
  },
  "sections": [
    "hero",
    "lifecycleStatus",
    "aiSubmissionStatus",
    "artifactIdentityReceipt",
    "renderModeBanner",
    "qualityGateBanner",
    "authoritativeSummary",
    "eventStatistics",
    "uniqueIssueStatistics",
    "qualityMetrics",
    "validationFindingSummary",
    "ruleTemplateNormalizerRendererSnapshot",
    "advancedFilters",
    "fieldVisibility",
    "fieldDataDictionary",
    "recordCards",
    "skillFindingCards",
    "evidenceQuoteCatalogTrace",
    "analysisReportAndFinalSummary",
    "provenanceFooter"
  ],
  "statistics": {
    "dslVersion": "JAA-DECLARATIVE-STATISTICS-DSL-1.0.0",
    "allowlistedPopulations": ["EVENT", "UNIQUE_ISSUE", "SKILL_FINDING", "VALIDATION_FINDING"],
    "allowlistedMetrics": ["COUNT", "DISTINCT_COUNT", "DISTRIBUTION", "MISSING_STATE_DISTRIBUTION"],
    "definitions": [
      {"id":"activityEventCount","population":"EVENT","metric":"COUNT","label":"Activity Events"},
      {"id":"uniqueIssueCount","population":"UNIQUE_ISSUE","metric":"COUNT","label":"Unique Issues"},
      {"id":"duplicateEventOccurrences","population":"EVENT","metric":"COUNT_MINUS_UNIQUE_ISSUE","label":"重複 Issue 的額外事件數"},
      {"id":"decisionStatusDistribution","population":"EVENT","metric":"DISTRIBUTION","field":"analysis.status","label":"分析判定狀態"},
      {"id":"skillDistribution","population":"SKILL_FINDING","metric":"DISTRIBUTION","field":"skillId","label":"技能分布"},
      {"id":"projectDistribution","population":"UNIQUE_ISSUE","metric":"DISTRIBUTION","field":"snapshot.project.key","label":"Project 分布"},
      {"id":"issueTypeDistribution","population":"UNIQUE_ISSUE","metric":"DISTRIBUTION","field":"snapshot.issueType.name","label":"Issue Type 分布"},
      {"id":"priorityDistribution","population":"UNIQUE_ISSUE","metric":"DISTRIBUTION","field":"snapshot.priority.name","label":"優先級分布"},
      {"id":"jiraIssueStatusDistribution","population":"UNIQUE_ISSUE","metric":"DISTRIBUTION","field":"snapshot.status.name","label":"Jira 狀態分布"},
      {"id":"componentDistribution","population":"UNIQUE_ISSUE","metric":"DISTRIBUTION","field":"snapshot.components[].name","label":"Component 分布","topN":30},
      {"id":"labelDistribution","population":"UNIQUE_ISSUE","metric":"DISTRIBUTION","field":"snapshot.labels[]","label":"Label 分布","topN":30},
      {"id":"rootCauseStateDistribution","population":"UNIQUE_ISSUE","metric":"MISSING_STATE_DISTRIBUTION","field":"snapshot.snapshotFields.rootCause","label":"Root Cause 資料狀態"}
    ],
    "uniqueIssueIdentity": "jiraServerIdentity + trim(issueKey).toUpperCase()",
    "coreSemanticsMutableByTemplate": false,
    "recalculateFromFilteredRecords": true,
    "showPopulationLabel": true
  },
  "snapshot": {
    "requiredFields": ["jiraServerIdentity","normalizedIssueKey","snapshotId","snapshotSha256","capturedAt","project","issueType","priority","status"],
    "optionalFields": ["summary","resolution","created","updated","resolved","startDate","dueDate","labels","components","fixVersions","affectedVersions","assigneeRef","reporterRef","creatorRef","snapshotFields.rootCause"],
    "fieldStates": ["PRESENT","EMPTY","NOT_APPLICABLE","NOT_CAPTURED","SOURCE_UNAVAILABLE","CONFLICT"],
    "conflictPolicy": "FAIL_CLOSED_NO_LAST_WRITE_WINS",
    "timeSemantics": "EVENT_SCOPE_BY_EVENT_TIMESTAMP_AND_ISSUE_DIMENSIONS_BY_RUN_CAPTURED_CURRENT_STATE"
  },
  "filters": {
    "fields": [
      "keyword",
      "projectKey",
      "issueType",
      "priority",
      "component",
      "label",
      "snapshotFieldState",
      "issueKey",
      "actor",
      "fieldName",
      "decisionStatus",
      "skillGroup",
      "skillId",
      "qualityStatus",
      "recordConfidence",
      "skillConfidence",
      "skillFindingCount",
      "eventDateRange",
      "evidenceRole",
      "evidenceQuoteResolution",
      "aiSubmissionState",
      "validationStage",
      "validationState",
      "validationFindingCode"
    ],
    "sameFieldOperator": "OR",
    "crossFieldOperator": "AND",
    "includeExcludeMode": true,
    "skillMatchModes": [
      "ANY",
      "ALL"
    ],
    "showActiveFilterChips": true,
    "clearAllEnabled": true,
    "resetDefaultEnabled": true,
    "savePreferenceEnabled": true
  },
  "pagination": {
    "pageSizes": [
      20,
      50,
      100,
      "ALL"
    ],
    "defaultPageSize": 20,
    "showRange": true,
    "showVisibleEventCount": true,
    "showVisibleUniqueIssueCount": true
  },
  "sorting": [
    "eventTimestamp",
    "issueKey",
    "recordConfidence",
    "skillFindingCount"
  ],
  "fieldVisibility": {
    "groups": {
      "recordSummary": [
        "recordIndex",
        "issueKey",
        "issueType",
        "priority",
        "projectKey",
        "jiraIssueStatus",
        "components",
        "actor",
        "eventTimestamp",
        "fieldName",
        "decisionStatus",
        "recordConfidence",
        "skillFindingCount",
        "qualityStatus",
        "validationState"
      ],
      "recordDetail": [
        "issueSnapshotReference",
        "issueSnapshotFieldStates",
        "readableAdded",
        "readableRemoved",
        "rawAdded",
        "rawRemoved",
        "recordRationale",
        "unknownReasons",
        "recordNegativeChecks",
        "sourceIdentity",
        "sourceHash",
        "normalizedEvidence",
        "evidenceSegmentInventory",
        "aiSubmissionState",
        "validationStage",
        "validationFindings"
      ],
      "skillFinding": [
        "skillId",
        "skillName",
        "skillGroup",
        "skillConfidence",
        "evidenceQuoteIds",
        "resolvedEvidenceQuotes",
        "evidenceExplanation",
        "negativeChecks",
        "skillRationale",
        "qualityFindings",
        "evidenceRole",
        "evidenceQuoteCatalogTrace",
        "containerEvidenceSegmentId",
        "sourceTrace"
      ]
    },
    "selectAllEnabled": true,
    "selectNoneEnabled": true,
    "resetDefaultEnabled": true,
    "savePreferenceEnabled": true,
    "csvFollowsSelection": true,
    "printFollowsSelection": true
  },
  "evidencePresentation": {
    "defaultView": "READABLE",
    "rawSourceDefaultExpanded": false,
    "copyReadableEnabled": true,
    "copyRawEnabled": true,
    "showNormalizationFallback": true,
    "showTraceability": true,
    "showEvidenceRole": true,
    "showEvidenceQuoteId": true,
    "showExactSourceSubstring": true,
    "showRawOffsets": true,
    "showSegmentId": true,
    "showSourcePointer": true,
    "supportingContextVisualSeparation": true,
    "renderLiteralEscapes": false,
    "hideJsonWrapperMetadataByDefault": true
  },
  "qualityMetrics": [
    "evidenceExplanationExactDuplicateRatio",
    "skillRationaleExactDuplicateRatio",
    "unknownReasonExactDuplicateRatio",
    "multiSkillRecordCount",
    "multiSkillMissingIndependentFindingCount",
    "excessiveSkillFindingCount",
    "untraceableEvidenceQuoteCount",
    "unresolvedEvidenceQuoteIdCount",
    "evidenceQuoteRoleIneligibleCount",
    "genericEvidenceExplanationCount",
    "legacyUnverifiedRecordCount",
    "primaryChangeRequiredCount",
    "contextOnlyClassificationCount",
    "nonSubstantiveEvidenceCount",
    "boilerplateEvidencePatternCount"
  ],
  "actions": [
    "resetFilters",
    "saveViewPreference",
    "selectVisibleFields",
    "expandVisibleRecords",
    "collapseVisibleRecords",
    "copyAuthoritativeSummary",
    "copyReadableEvidence",
    "copyRawEvidence",
    "exportFilteredCsv",
    "printReport",
    "jumpToValidationFinding",
    "toggleReadableRawTrace"
  ],
  "compatibility": {
    "rejectUnknownCapability": true,
    "rejectMissingRequiredSnapshotField": true,
    "rejectNewerUnsupportedTemplateSchema": true,
    "allowSamePackageMultipleTemplates": true,
    "providerRequiredForRerender": false,
    "databaseRequiredForRerender": false
  },
  "diagnosticMode": {
    "bannerLevel": "DANGER",
    "bannerText": "非正式診斷預覽：JAA 已收到 AI 提交，但未通過正式驗證。Canonical 未建立、SQLite 禁止，不可視為正式分析成果。",
    "requiredLifecycleLabels": ["AI_SUBMITTED", "FORMAL_VALIDATION_FAILED", "CANONICAL_NOT_CREATED", "SQLITE_DENIED"],
    "canonicalEligible": false,
    "sqliteEligible": false,
    "showParsedArtifact": true,
    "showArtifactIdentityReceipt": true,
    "showAnalysisReport": true,
    "showFinalAssistantSummary": true,
    "showQuoteResolution": true,
    "showAllValidationFindings": true,
    "showCompleteNormalizedEvidence": true,
    "findingDeepLinks": true
  },
  "statusLabels": {
    "CLASSIFIED": "已分類",
    "UNKNOWN": "無法判定",
    "NEEDS_REVIEW": "需要覆核",
    "EXCLUDED": "已排除",
    "CATALOG_DETAIL_MISSING": "Catalog 描述缺漏",
    "FAILED": "分析失敗"
  },
  "qualityLabels": {
    "PASSED": "品質檢查通過",
    "WARNING": "需要人工確認",
    "BLOCKED": "品質閘門阻擋",
    "LEGACY_UNVERIFIED": "Legacy v2 未驗證"
  },
  "confidenceMapping": {
    "0.9": "High",
    "0.6": "Medium",
    "0.3": "Low",
    "0": "None"
  },
  "security": {
    "escapeAllSourceText": true,
    "renderSourceWithTextContentOnly": true,
    "allowInlineDataScript": true,
    "allowArbitraryTemplateScript": false,
    "allowRemoteResource": false,
    "allowFetch": false,
    "allowXhr": false,
    "allowWebSocket": false,
    "contentSecurityPolicy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  }
}
```
<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->

## 3. 權威資料與 Lifecycle

### 3.1 權威來源

- Renderer 的唯一直接資料輸入是 `jaa-analysis-report-data-package-v1`；Template MD 是唯一直接呈現規格輸入。
- 正式 Classification／Skill Finding：Formal Package 中由 Decision v5 + Canonical Assembly 帶入的 immutable projection。
- 診斷 Classification／Skill Finding：Diagnostic Package 中的 parsed artifact；必須清楚標示尚未成為 Canonical。
- 正式 Event count／Status／Confidence：Package Builder 從 Canonical 計算並附計算 receipt；Renderer 必須重算可驗證欄位。
- 診斷 count：Package Builder 從 parsed artifact 計算，並與 expected source count 並列，不得冒充 Canonical count。
- Issue Type／Priority／Jira Status 與型別專屬欄位：Package 內每個 Unique Issue 僅一份的 Run-scoped Snapshot。
- Readable Evidence：版本化 Normalizer；Role 與 trace 來自 frozen Evidence Segment Catalog。
- ChatGPT `analysis-report.md` 與自然語言摘要不是權威計數來源。
- Renderer 不得查詢 Jira、SQLite、AI Analysis DB 或網路來補齊 Package。

### 3.2 Lifecycle 顯示

Hero 必須分開顯示：

```text
Provider
Input Delivery
Analysis
Artifact
Schema Validation
Evidence Segment Validation
Attribution Validation
Semantic Validation
Quality
Canonical
Analyzed Result JSON
Report Data Package
Diagnostic HTML
Formal HTML
SQLite
```

支援並誠實顯示：

- `completed`
- `completed_with_quality_warnings`
- `completed_with_artifact_error`
- `completed_with_persistence_error`
- `failed_validation`
- `failed`
- `interrupted`

HTML failure 不得改寫 Analysis／Canonical 狀態；SQLite failure 不得改寫 HTML／Canonical 狀態。

### 3.3 Rendering Mode Gate

| Mode | 輸入條件 | Canonical | SQLite | 固定標示 |
|---|---|---:|---:|---|
| `FORMAL_CANONICAL` | Formal Report Data Package 通過 contract、hash、capability 與 Snapshot 驗證 | 是 | 依產品契約 | 正式分析報告 |
| `DIAGNOSTIC_NON_CANONICAL` | Diagnostic Report Data Package 通過最低可渲染驗證 | 否 | 永遠禁止 | 紅色非正式診斷預覽 |

診斷 HTML 不得觸發 Provider、不得修改 Decision、不得補 Skill、不得把 invalid quote 自動替換成合法 quote。

## 4. Summary 與 Quality Gate

### 4.1 Authoritative Summary

至少顯示：

- Source／Decision／Canonical Event count。
- Unique Issue count。
- 六種 Decision Status。
- Record／Skill Confidence 分布。
- Skill Finding／Multi-skill／Review count。
- Quality Gate 與 blocking／warning count。
- HTML durable receipt。
- SQLite durable commit count。

### 4.2 Quality Gate Banner

Quality Gate Banner 位於統計之前，顯示：

- `PASSED／WARNING／BLOCKED／LEGACY_UNVERIFIED`。
- SQLite 是否允許。
- Exact duplicate ratio 的 numerator、denominator、ratio。
- Multi-skill independent finding 狀態。
- Untraceable Evidence Quote count。
- Excessive Skill Finding count。
- Catalog `review-draft` 限制。
- Warning acceptance durable audit 狀態。

| 條件 | Badge | HTML 行為 | SQLite 行為 |
|---|---|---|---|
| v3 全部通過 | `PASSED` | 正常顯示 | 可依產品契約提交 |
| Quality Warning | `WARNING` | 黃色 Banner | 人工接受前禁止 |
| Blocking Quality | `BLOCKED` | 紅色 Banner，可檢視診斷 | 禁止且不可一般繞過 |
| v2 Preview | `LEGACY_UNVERIFIED` | 紫色 Preview Banner | 不宣稱 v3 通過 |

### 4.3 Diagnostic Banner 與 Findings Summary

`DIAGNOSTIC_NON_CANONICAL` 頁面頂端必須固定顯示：

> 非正式診斷預覽：此分析未通過 JAA 正式驗證，不可匯入資料庫，亦不可視為正式分析成果。

不得允許使用者關閉後完全消失。頁面至少顯示：

- blocking／warning／info finding 數量。
- 受影響 Record 數量。
- Schema、Identity、Segment、Quote、Attribution、Semantic、Quality 各 stage 狀態。
- finding code 分布。
- 每個 finding 的 recordIndex、Skill ID、Segment ID、JSON pointer、expected、observed 與繁體中文說明。
- 點擊 finding 可跳到對應 Record／Skill Finding／Evidence Segment。

診斷模式必須明確顯示 `Canonical: NOT CREATED`、`SQLite: DENIED`，不得只以顏色暗示。

## 5. Event、Unique Issue 與 Snapshot 統計

### 5.1 Event-based

以目前 filtered Activity Event 為母體：

- Event 總數。
- Decision Status。
- Jira 變動欄位。
- Skill。
- Actor。
- Record／Skill Confidence。
- Quality Status。

每張圖或表明確標示「依 Event 計算」。

### 5.2 Unique-Issue-based

Unique Issue key 使用：

```text
jiraServerIdentity + trim(issueKey).toUpperCase()
```

相同 Issue 出現兩次或更多次仍只計一次。統計：

- Unique Issue 總數。
- 有多筆 Event 的 Issue 數。
- Duplicate Event Occurrences。
- Project。
- Issue Type。
- Priority。
- Jira Issue Status。
- 各 Skill 涉及的 Unique Issue 數。
- Components，例如 `Cop_Controller`、`Cop_Customer_Spec`、`Cop_Flash`。
- Labels 與 Template allowlist 允許的 Snapshot 欄位。
- 型別專屬欄位的資料狀態，例如 Bug Root Cause 的 PRESENT／EMPTY 與 Feature 的 NOT_APPLICABLE。

每張圖或表明確標示「依 Unique Issue 計算」。若 snapshot 缺漏，使用「資料未提供」分組並顯示缺漏數，不得猜測。

### 5.3 Snapshot 時間與欄位狀態

- 報告日期範圍使用 Activity Event timestamp。
- Issue Type、Priority、Status、Project 與其他 Snapshot 欄位代表 `capturedAt` 時點 current state，不代表 Event 發生時的歷史值。
- `PRESENT`、`EMPTY`、`NOT_APPLICABLE`、`NOT_CAPTURED`、`SOURCE_UNAVAILABLE`、`CONFLICT` 必須分開統計與顯示。
- 若同一 composite Issue identity 有多份互斥 Snapshot，顯示 `ISSUE_SNAPSHOT_CONFLICT`；禁止 last-write-wins。

### 5.4 Declarative Statistics DSL

Template 只能使用 machine-readable contract 允許的 population、metric、field、label、ordering、Top N 與 presentation。禁止任意 JavaScript、SQL、JSONPath、expression eval 或以模板文字改寫核心語意。

Renderer 必須固定執行去重、時間範圍、Snapshot current-state、missing-state 與 filter population 語意。Template 可以選擇顯示哪些統計，但不能把 Event count 偽裝成 Unique Issue count，也不能將 `NOT_APPLICABLE` 合併成 `EMPTY`。

### 5.5 Filter-aware

所有統計依目前 filter 後的 Event 重新計算。頁面同時顯示：

```text
Visible Events / Total Events
Visible Unique Issues / Total Unique Issues
```

## 6. Advanced Multi-select Filters

### 6.1 欄位

- Keyword，可選搜尋範圍。
- Project、Issue Type、Priority、Issue Key。
- Component、Label、Jira Issue Status、Snapshot Field State。
- Actor、Jira 變動欄位、Event 日期。
- 分析判定狀態、Record／Skill Confidence。
- Skill Group、Skill ID、Skill Finding 數量。
- Evidence Role：`PRIMARY_CHANGE`／`SUPPORTING_CONTEXT`／`INELIGIBLE`。
- Validation State／Finding Code。
- Quality Status。

### 6.2 固定語意

- 同一欄位多個 selected values：OR。
- 不同欄位：AND。
- 每一組可切換 Include／Exclude。
- Skill 可選 `ANY` 或 `ALL`。
- 顯示 active filter chips。
- 提供一鍵清除與恢復預設。
- UI 不使用模糊的「全部 Status」，必須顯示「全部分析判定狀態」。

### 6.3 分頁與排序

- Page size：20／50／100／全部，預設 20。
- Previous／Next／頁碼。
- 顯示目前筆數範圍。
- 可依 Event Time、Issue Key、Record Confidence、Skill Finding Count 排序。
- 排序穩定；同值以 recordIndex 作 deterministic tie-breaker。

## 7. Field Visibility

新增 grouped checkbox selector：

### 7.1 Record Summary

- Record Index
- Issue Key
- Issue Type
- Priority
- Actor
- Event Time
- Jira 變動欄位
- 分析判定狀態
- Record Confidence
- Skill Finding Count
- Quality Status
- Validation State

### 7.2 Record Detail

- Readable Added／Removed
- Raw Added／Removed
- Record Rationale
- Unknown Reasons
- Record Negative Checks
- Source Identity
- Source Hash
- Normalized Evidence
- Evidence Segment Inventory

### 7.3 Skill Finding

- Skill ID／Name／Group
- Skill Confidence
- Evidence Quote IDs 與 resolved readable quotes
- Evidence Explanation
- Negative Checks
- Skill Rationale
- Quality Findings
- Evidence Role
- Quote Catalog／Container Segment ID
- Exact Source Substring／Raw Offset／Source Pointer Trace

支援全選、全不選、恢復預設及儲存目前設定。CSV 與列印只輸出目前 selected fields。JAA embedded viewer 優先使用既有 local preference；standalone HTML storage 不可用時使用 session fallback，不得造成報告失效。

## 8. Field Data Dictionary

每個欄位可查看中文名稱、machine name、定義、來源、計算方式、母體、Model／JAA／Source 屬性及缺漏表示。

| 顯示名稱 | Machine field | 定義 | 來源／母體 |
|---|---|---|---|
| Record Index | `recordIndex` | 本次待分析 JSON 順序，不是 Jira Event ID | Source／Event |
| Issue Key | `issueKey` | Jira Issue 識別及 Unique Issue 去重鍵 | Source／Issue |
| Issue Type | `issueSnapshot.issueType` | Run 建立時固定的 Issue Type | JAA Snapshot／Unique Issue |
| Priority | `issueSnapshot.priority` | Run 建立時固定的 Priority | JAA Snapshot／Unique Issue |
| Snapshot Reference | `issueSnapshotReference` | 已分析資料連接 Report Package Snapshot 的 ID／SHA-256 | JAA／Event |
| Snapshot Field State | `issueSnapshots[].snapshotFields.*.state` | 值存在、空值、不適用、未擷取、來源不可用或衝突 | Source + JAA／Unique Issue |
| Jira 變動欄位 | `fieldName` | 此 Activity Event 發生變動的 Jira 欄位 | Source／Event |
| 分析判定狀態 | `status` | AI 對該 Diff 的分類狀態，不是 Jira Issue Status | Model／Event |
| Record Confidence | `confidence` | 整筆 Decision confidence | Model／Event |
| Skill Finding | `skillFindings[]` | 單一 Skill 及其獨立證據與理由 | Model／Event |
| Skill Confidence | `skillFindings[].confidence` | 該 Skill 的 confidence | Model／Finding |
| Evidence Quote ID | `evidenceQuoteIds[]` | 模型引用的 frozen Quote Catalog deterministic ID | Model reference + JAA validation |
| Readable Evidence Quote | `resolvedEvidenceQuotes[].displayText` | JAA deterministic unwrap 後的可讀最小證據 | JAA Quote Catalog |
| Exact Source Substring | `resolvedEvidenceQuotes[].exactSourceSubstring` | 可回到 raw source 的精確原文 | JAA Quote Catalog |
| Container Segment ID | `resolvedEvidenceQuotes[].containerEvidenceSegmentId` | Frozen Segment Catalog 容器定位鍵 | JAA Segmenter + Quote Catalog |
| Evidence Role | `resolvedEvidenceQuotes[].evidenceRole` | 本次可歸因變更或僅供佐證的 context | JAA Quote Catalog validation |
| Source Trace | `resolvedEvidenceQuotes[].sourceJsonPointer/rawOffsets` | Quote 回到 raw source、Diff hunk、line 與 byte range 的定位 | JAA Quote Catalog |
| AI Submission State | `diagnostic.aiSubmissionState` | 是否收到且 durable 保存可解碼 AI submission | JAA Bridge |
| Validation Stage | `validationFindings[].stage` | Token、Schema、Quote、Semantic、Quality 或 downstream stage | JAA validator |
| Evidence Explanation | `evidenceExplanation` | Evidence 為何支持此 Skill | Model／Finding |
| Negative Checks | `negativeChecks` | 實際執行的相近 Skill／排除檢查 | Model／Finding |
| Quality Status | `qualityStatus` | 結果是否符合品質契約 | JAA derived |
| Validation State | `validationSummary` | Schema、Identity、Segment、Quote、Attribution、Semantic 與 Quality 狀態 | JAA validator |

## 9. Record 與 Skill Finding

### 9.1 Record Summary

折疊列顯示目前 selected summary fields。展開 affordance 不依賴任何可隱藏資料欄位。Toolbar 下方不得保留無用途空白 spacer。

### 9.2 Record Detail

順序：

1. Record Quality Finding。
2. Aggregated Validation Findings。
3. Readable Added／Removed／Context。
4. Raw Added／Removed（預設收合）。
5. Record rationale／unknown reasons／record negative checks。
6. Skill Finding Cards。
7. Frozen Evidence Quote Catalog Trace 與 Container Segment Inventory。
8. Evidence ID、Stable ID、Diff ID、Source Content Hash 與 normalization traceability。

大型 Diff 使用可展開、可捲動區塊，不得讓單筆內容破壞整頁。

### 9.3 Skill Finding Card

每個 Skill 必須獨立顯示：

- Skill ID／Name／Group。
- Numeric Confidence 與 Label。
- 一個或多個 Evidence Quote。
- 每個 Quote 的 Evidence Role 與 Segment ID。
- Primary Change 與 Supporting Context 使用不同且可存取的視覺標記。
- Source pointer／Diff hunk／line trace。
- Evidence Explanation。
- Negative Checks。
- Skill Rationale。
- Quality Findings。

Multi-skill 不得只在 Record header 放多個 Skill chip，而缺少各自完整內容。

## 10. Readable Evidence、Raw Source 與 Segment Trace

### 10.1 預設可讀內容

Readable Evidence 使用 `JAA-EVIDENCE-NORMALIZER-1.0.0`。預設不顯示 JSON wrapper、escaped quote、literal `\\r\\n`、`body`、`commentId`、`contentStatus`、`provenance` 等包裝 metadata。

Normalization 不得摘要、改寫、翻譯或補字；只允許 deterministic parse、unescape、換行與安全 Jira markup representation。

### 10.2 雙層查驗

每筆 Evidence 提供：

- 可讀內容（預設展開）。
- 原始來源（預設收合）。
- 複製可讀內容。
- 複製原始內容。
- Normalizer fallback／diagnostics。
- Quote 到 raw source／JSON pointer／diff hunk 的追溯資訊。
- Evidence Segment ID、line type、old/new line number 與 segment SHA-256。
- `PRIMARY_CHANGE` 與 `SUPPORTING_CONTEXT` 分區；context 不得以相同樣式偽裝成可歸因變更。

Raw source、Evidence ID、Stable ID、source hash 與 record hash 不可被 Normalizer 改變。

### 10.3 診斷模式完整證據

診斷模式必須允許檢視該 Record 的完整 normalized evidence，包括 Added、Removed 與 Context，並將每個 validator finding 對應到 segment。預設畫面仍優先顯示人類可讀內容，Raw Source 與完整 trace 預設收合，避免 Evidence Quote 被 escape 與包裝符號淹沒。

## 11. Report Data Package、Renderer 與 HTML Receipt

### 11.1 Report Data Package 必備結構

Formal 與 Diagnostic 共用 `jaa-analysis-report-data-package-v1` envelope，至少包含：

```text
packageId / packageMode / runId / generatedAt
sourceAnalysisIdentity / sourceCanonicalIdentity
ruleSet / decisionContract / qualityContract
eventScope / baseCounts / dataCompleteness
records[]
issueSnapshots[]
snapshotFieldDefinitions[]
validationFindings[] / qualitySummary
capabilities[]
inputReceipts[] / packageSha256
```

`issueSnapshots[]` 對每個跨 Server Unique Issue identity 只能有一筆。`records[]` 只能以 `issueSnapshotReference` 連結，不得複製完整 Snapshot。

### 11.2 相容性與多模板重繪

Render 前檢查 Template schema、Report Package contract、Decision／Canonical contract、minimum renderer、required capabilities、required Snapshot fields 與安全政策。缺任一必要項目時 fail closed，回報結構化 compatibility finding。

`LAYERED_VALIDATION_RECEIPTS_V2` 是本模板的必要 capability。Renderer 不得以 V1 名稱代替、不得把 V2 Package 誤判為缺少 V1，也不得在 capability mismatch 後沿用其他 Run 或其他 Active Result 的 HTML。

同一份 Package 可用多份相容的 versioned Template 離線產生多份 HTML。輸出檔名必須含 Template version 與本機時間，不覆寫既有輸出。重繪時 Provider 狀態顯示 `NOT_USED`、Token usage 顯示 `0`，不得啟動 Codex process。

若 Template 需要 Package 不具備的新欄位，UI 應提示「Report Data Package 缺少必要欄位」。只有操作者明確選擇原始 DB 後才能重建 Package；重建仍不得呼叫 ChatGPT。

### 11.3 Renderer pipeline

Renderer 必須執行：

```text
validate Template filename/version/bytes/hash
→ validate Renderer API surface
→ validate Report Data Package contract/hash/capabilities
→ determine FORMAL_CANONICAL or DIAGNOSTIC_NON_CANONICAL
→ validate Decision/Canonical/Quality/Normalizer/Segmenter/Issue Snapshot Contract
→ calculate authoritative View Model
→ escape all source text
→ render self-contained HTML
→ write .tmp
→ fsync
→ atomic rename
→ reopen/hash verify
→ write canonical-output/html-render-receipt.json
```

自動與手動 render 不得各自維護另一套 pipeline。兩者只允許在觸發來源、輸出檔名與 `renderTrigger=AUTO_AFTER_CANONICAL | MANUAL_RESULTS_REGENERATE` 上不同，其餘輸入驗證、View Model、escaping、atomic write、hash 與 receipt 完全共用。

Render 失敗時仍須寫入 `canonical-output/html-render-failure-receipt.json`，至少保存 error code、failure stage、required／observed capabilities、Template／Package／Renderer identity、繁中訊息與時間；不得建立假的成功 receipt。

Receipt 至少包含：

```text
runId
renderMode
reportDataPackagePath
reportDataPackageContractVersion
reportDataPackageSha256
reportDataPackageCapabilities
decisionContractVersion
qualityContractVersion
qualityGateStatus
normalizerVersion
segmenterVersion
segmentCatalogSha256
issueSnapshotContractVersion
canonicalResultPath
canonicalResultSha256
templateFileName
templateVersion
templateBytes
templateSha256
rendererVersion
rendererSha256
outputHtmlPath
outputHtmlSizeBytes
outputHtmlSha256
renderStartedAt
renderCompletedAt
atomicWrite
reopenVerified
status
errorCode
errorDetail
```

診斷模式沒有 Canonical 時，`canonicalResultPath`／`canonicalResultSha256` 必須明確為 `null`，並由 Diagnostic Package 記錄 parsed artifact 與 validation summary 的 identity／SHA-256。Receipt 不得偽造 Canonical identity。

Renderer API 缺漏（例如 `setHtmlRenderStatus is not a function`）必須歸類為 HTML Renderer failure，不得誤報成 ChatGPT 分析失敗。

## 12. 安全與離線要求

- 禁止 CDN、外部字型、外部圖片、analytics、fetch、XHR、WebSocket 或表單提交。
- Source、Evidence、Rationale、Actor、Issue、Skill Name 全部使用 `textContent` 或等效安全 escape。
- 嵌入 JSON 必須 escape `<`、`>`、`&`、`</script` 與 Unicode line separator。
- Template 只提供 declarative allowlisted contract，禁止任意執行 Template script。
- Template 不得包含可執行 JavaScript payload、SQL、任意 JSONPath、外部 URL 或 renderer plugin path；未知 DSL capability 必須拒絕。
- 篩選、統計、分頁、欄位顯示、CSV 與列印全部在本機執行。
- HTML 不包含 Token、Cookie、Authorization、DB password、未遮罩 credential 或 runtime absolute path。

## 13. Legacy v2／v3 Preview

- Decision v2／v3 只能標示 `LEGACY_UNVERIFIED`。
- 可以把既有 candidate 投影成 legacy skill card，但不得補寫不存在的 per-skill explanation。
- 共用 Evidence 必須標示 `LEGACY_SHARED_EVIDENCE`。
- Legacy Preview 不得觸發新的正式 SQLite 寫入。
- v2／v3 Preview 的 Quality 統計必須誠實顯示，不得宣稱 Decision v5 PASSED。

## 14. Acceptance Criteria

### 14.1 Deterministic Fixture

對已核准的 2026-08-19 117-record regression fixture，必須由資料計算得到：

- 117 Activity Events。
- 28 Unique Issues。
- 26 個 Issue 有多筆 Event。
- 89 個 duplicate event occurrences。

這些數字只屬該 fixture，不得硬編碼成一般報告結果。

### 14.2 COPGEN1-146289 Regression

Comment 的預設 Readable Evidence 不應出現 JSON wrapper 或 literal escape，應呈現真實段落，例如：

```text
[Fail Phenomenon]
GC 卡在 FTLGCCheckProgram()

[Root Cause]
因未考量到 Copy Data 追上 Build GCSA，導致 Copy Data 繼續前進，使 Program Index 大於 Read Index。
```

Raw Source 仍必須可查驗。

### 14.3 UI

- 同欄位 OR、跨欄位 AND、Include／Exclude、Skill ANY／ALL 正確。
- 20／50／100／全部分頁正確。
- 欄位全選／全不選／預設與 CSV／Print 一致。
- Filter 後 Event／Unique Issue 統計同步更新。
- 一般 1366×768、1920×1080 與 Windows high-DPI 不水平破版。
- HTML 完全離線且沒有遠端 request。

### 14.4 Decision v5 Evidence Role

- 每個 `CLASSIFIED` Skill Finding 至少顯示一個有效 `PRIMARY_CHANGE` eligible Evidence Quote ID。
- `SUPPORTING_CONTEXT` 必須視覺分離且不得標示成主要變更。
- Context-only finding 必須出現在 Aggregated Findings，不能只顯示第一筆錯誤。
- Evidence Quote ID 可透過 Catalog 定位到 container Segment、exact source substring、raw offset、source pointer／Diff hunk／line。
- 預設只顯示可讀 displayText，不得把 JSON wrapper／escape 當成 Evidence Quote 展示。

### 14.5 Diagnostic Non-canonical

- AI submission 可解析但 Token／Identity／Schema／Quote／Attribution／Semantic／Quality 任一 blocking gate 失敗時，產生診斷 HTML。
- 固定顯示紅色非正式警示、`AI Submission: RECEIVED`、`Formal Validation: FAILED`、`Canonical: NOT CREATED` 與 `SQLite: DENIED`。
- 顯示 Artifact Identity Receipt 逐欄位結果、Analysis Report、final summary 與 Quote ID resolution。
- 所有 findings 可依 code、stage、record、Skill、Evidence Role 篩選並 deep link。
- 診斷 HTML 不得出現在 `canonical-output`，也不得被正式結果匯入流程接受。

### 14.6 Package 與 Template Compatibility

- 同一 Formal Package 使用 v1.5.1 兩次，HTML 資料結果一致且 receipt hash 可追溯；檔名不得覆寫。
- 同一 Package 使用另一份相容 Template，不呼叫 Provider且可產生另一份 HTML。
- 缺少 required capability／Snapshot field、contract 太舊或 renderer 太舊時 fail closed。
- Template 試圖執行 script、SQL、外部 fetch 或未允許 expression 時拒絕。
- Offline import 的 External Report Package 只能檢視與渲染，v0.3.33 不可直接寫入正式 SQLite。

## 15. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 1.5.1 | 2026-08-24 | proposed | Required capability 升為 `LAYERED_VALIDATION_RECEIPTS_V2`；統一自動／手動 Renderer；加入 Quality Warning、report error、failure receipt 與 Debug HTML 收集要求 |
| 1.5.0 | 2026-08-20 | proposed | 新增 AI Submitted Artifact lifecycle、Artifact Identity Receipt、Decision v5 Quote Catalog lineage、layered findings、Analysis Report／final summary 與強制 non-canonical／SQLite denied 診斷呈現 |
| 1.4.0 | 2026-08-20 | proposed | HTML 直接輸入改為 Report Data Package + Template，新增 Snapshot field states、declarative statistics DSL、capability negotiation 與多模板離線重繪 |
| 1.3.0 | 2026-08-19 | proposed | 加入 Decision v4 Evidence Segment／Role、FORMAL／DIAGNOSTIC mode、聚合 findings、診斷 HTML、Evidence Role／Validation 篩選與 trace view |
| 1.2.0 | 2026-08-19 | proposed | 加入 Readable Evidence、Run-scoped Issue Snapshot、Event／Unique Issue 統計、進階複選篩選、分頁排序、欄位顯示控制與資料字典 |
| 1.1.0 | 2026-08-19 | prototype | Decision v3 Skill Finding、Quality Gate、Legacy Preview、誠實 HTML lifecycle 與版本化檔名 |
| 1.0.0 | 2026-08-14 | proposed | 建立 Manifest-bound、本機 deterministic、自包含 Golden HTML 報告模板 |
