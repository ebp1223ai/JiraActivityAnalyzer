# JAA 技能分析 HTML 報告模板 v1.2.0

- File: `Skill_Analysis_HTML_Report_Template_v1.2.0.md`
- Template Schema Version: `jaa-html-report-template-v3`
- Template ID: `JAA-SKILL-ANALYSIS-GOLDEN-HTML`
- Template Version: `1.2.0`
- Previous Version: `1.1.0`
- Status: `proposed-for-v0.3.22`
- Locale: `zh-TW`
- Time Zone: `Asia/Taipei`
- Target Application: `JiraActivityAnalyzer`
- Target Application Version: `0.3.22`
- Minimum Renderer Version: `JAA-LOCAL-HTML-RENDERER-1.2.0`
- Required Decision Contract: `jaa-ai-analysis-decisions-v3`
- Required Normalizer: `JAA-EVIDENCE-NORMALIZER-1.0.0`
- Prepared Date: `2026-08-19`

## 1. 文件定位

本文件定義 Jira Activity Analyzer v0.3.22 的本機、deterministic、self-contained Golden HTML。v1.2.0 在 v1.1.0 的 Decision v3 Skill Finding 與 Quality Gate 基礎上，加入：

1. Readable Evidence 與 Raw Source 雙層呈現。
2. Advanced Multi-select Filters。
3. Pagination／Sorting／Active Filter Chips。
4. Record／Detail／Skill 欄位顯示控制。
5. 欄位資料字典。
6. Event-based 與 Unique-Issue-based 統計。
7. Run-scoped Issue Snapshot enrichment。
8. 明確的 HTML／Canonical／Quality／SQLite lifecycle。

本模板：

- 只讀取已通過 Schema／Semantic Validation 的 Canonical Result。
- 不送給 ChatGPT，不改變 Provider 的 `1 JSON + 3 MD` 模型輸入。
- 不重新分類、不補 Skill、不生成不存在的 Evidence Explanation。
- 不在開啟報告時重新查詢 Jira 或 SQLite。
- 不以 HTML 成功取代 Canonical、Quality 或 SQLite durable evidence。
- 對 Decision v2 只能產生 `LEGACY_UNVERIFIED` preview，不可冒充 Decision v3 品質通過。

## 2. Machine-readable Template Contract

JAA 只解析下列標記之間的單一 JSON object。標記外內容只供人員閱讀。Filename、內部版本、Manifest binding、bytes 與 SHA-256 必須完全一致，否則 fail closed。

<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->
```json
{
  "schemaVersion": "jaa-html-report-template-v3",
  "templateId": "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  "templateVersion": "1.2.0",
  "locale": "zh-TW",
  "timeZone": "Asia/Taipei",
  "minimumRendererVersion": "JAA-LOCAL-HTML-RENDERER-1.2.0",
  "input": {
    "role": "CANONICAL_ANALYSIS_RESULT",
    "requiredDecisionContract": "jaa-ai-analysis-decisions-v3",
    "requiredNormalizerVersion": "JAA-EVIDENCE-NORMALIZER-1.0.0",
    "requiredIssueSnapshotContract": "jaa-run-issue-snapshot-v1",
    "legacyPreviewContracts": [
      "jaa-ai-analysis-decisions-v2"
    ]
  },
  "output": {
    "fileNamePattern": "skill-analysis-{sourceBaseName}-{runLocalTimestamp}-template-v1.2.0.html",
    "selfContained": true,
    "networkAccess": false,
    "defaultTheme": "light",
    "printEnabled": true,
    "filteredCsvEnabled": true
  },
  "sections": [
    "hero",
    "lifecycleStatus",
    "qualityGateBanner",
    "authoritativeSummary",
    "eventStatistics",
    "uniqueIssueStatistics",
    "qualityMetrics",
    "ruleTemplateNormalizerRendererSnapshot",
    "advancedFilters",
    "fieldVisibility",
    "fieldDataDictionary",
    "recordCards",
    "skillFindingCards",
    "provenanceFooter"
  ],
  "statistics": {
    "eventBased": [
      "activityEventCount",
      "decisionStatusDistribution",
      "fieldNameDistribution",
      "skillDistribution",
      "actorDistribution",
      "recordConfidenceDistribution",
      "skillConfidenceDistribution",
      "qualityStatusDistribution"
    ],
    "uniqueIssueBased": [
      "uniqueIssueCount",
      "issuesWithMultipleEvents",
      "duplicateEventOccurrences",
      "projectDistribution",
      "issueTypeDistribution",
      "priorityDistribution",
      "jiraIssueStatusDistribution",
      "skillUniqueIssueDistribution"
    ],
    "uniqueIssueKeyNormalization": "trim-uppercase",
    "recalculateFromFilteredRecords": true,
    "showPopulationLabel": true
  },
  "filters": {
    "fields": [
      "keyword",
      "projectKey",
      "issueType",
      "priority",
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
      "eventDateRange"
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
        "actor",
        "eventTimestamp",
        "fieldName",
        "decisionStatus",
        "recordConfidence",
        "skillFindingCount",
        "qualityStatus"
      ],
      "recordDetail": [
        "readableAdded",
        "readableRemoved",
        "rawAdded",
        "rawRemoved",
        "recordRationale",
        "unknownReasons",
        "recordNegativeChecks",
        "sourceIdentity",
        "sourceHash"
      ],
      "skillFinding": [
        "skillId",
        "skillName",
        "skillGroup",
        "skillConfidence",
        "evidenceQuotes",
        "evidenceExplanation",
        "negativeChecks",
        "skillRationale",
        "qualityFindings"
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
    "genericEvidenceExplanationCount",
    "legacyUnverifiedRecordCount"
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
    "printReport"
  ],
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

- Classification／Skill Finding：Decision v3 + Canonical Assembly。
- Event count／Status／Confidence：JAA 從 Canonical 本機計算。
- Issue Type／Priority／Jira Status：Run-scoped Issue Snapshot。
- Readable Evidence：版本化 Normalizer。
- ChatGPT `analysis-report.md` 與自然語言摘要不是權威計數來源。

### 3.2 Lifecycle 顯示

Hero 必須分開顯示：

```text
Provider
Input Delivery
Analysis
Artifact
Schema Validation
Semantic Validation
Quality
Canonical
HTML
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

## 5. Event 與 Unique Issue 統計

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
trim(issueKey).toUpperCase()
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

每張圖或表明確標示「依 Unique Issue 計算」。若 snapshot 缺漏，使用「資料未提供」分組並顯示缺漏數，不得猜測。

### 5.3 Filter-aware

所有統計依目前 filter 後的 Event 重新計算。頁面同時顯示：

```text
Visible Events / Total Events
Visible Unique Issues / Total Unique Issues
```

## 6. Advanced Multi-select Filters

### 6.1 欄位

- Keyword，可選搜尋範圍。
- Project、Issue Type、Priority、Issue Key。
- Actor、Jira 變動欄位、Event 日期。
- 分析判定狀態、Record／Skill Confidence。
- Skill Group、Skill ID、Skill Finding 數量。
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

### 7.2 Record Detail

- Readable Added／Removed
- Raw Added／Removed
- Record Rationale
- Unknown Reasons
- Record Negative Checks
- Source Identity
- Source Hash

### 7.3 Skill Finding

- Skill ID／Name／Group
- Skill Confidence
- Evidence Quotes
- Evidence Explanation
- Negative Checks
- Skill Rationale
- Quality Findings

支援全選、全不選、恢復預設及儲存目前設定。CSV 與列印只輸出目前 selected fields。JAA embedded viewer 優先使用既有 local preference；standalone HTML storage 不可用時使用 session fallback，不得造成報告失效。

## 8. Field Data Dictionary

每個欄位可查看中文名稱、machine name、定義、來源、計算方式、母體、Model／JAA／Source 屬性及缺漏表示。

| 顯示名稱 | Machine field | 定義 | 來源／母體 |
|---|---|---|---|
| Record Index | `recordIndex` | 本次待分析 JSON 順序，不是 Jira Event ID | Source／Event |
| Issue Key | `issueKey` | Jira Issue 識別及 Unique Issue 去重鍵 | Source／Issue |
| Issue Type | `issueSnapshot.issueType` | Run 建立時固定的 Issue Type | JAA Snapshot／Unique Issue |
| Priority | `issueSnapshot.priority` | Run 建立時固定的 Priority | JAA Snapshot／Unique Issue |
| Jira 變動欄位 | `fieldName` | 此 Activity Event 發生變動的 Jira 欄位 | Source／Event |
| 分析判定狀態 | `status` | AI 對該 Diff 的分類狀態，不是 Jira Issue Status | Model／Event |
| Record Confidence | `confidence` | 整筆 Decision confidence | Model／Event |
| Skill Finding | `skillFindings[]` | 單一 Skill 及其獨立證據與理由 | Model／Event |
| Skill Confidence | `skillFindings[].confidence` | 該 Skill 的 confidence | Model／Finding |
| Evidence Quote | `evidenceQuotes[].quote` | 可回查 normalized source 的最小必要原文 | Model + JAA validation |
| Evidence Explanation | `evidenceExplanation` | Evidence 為何支持此 Skill | Model／Finding |
| Negative Checks | `negativeChecks` | 實際執行的相近 Skill／排除檢查 | Model／Finding |
| Quality Status | `qualityStatus` | 結果是否符合品質契約 | JAA derived |

## 9. Record 與 Skill Finding

### 9.1 Record Summary

折疊列顯示目前 selected summary fields。展開 affordance 不依賴任何可隱藏資料欄位。Toolbar 下方不得保留無用途空白 spacer。

### 9.2 Record Detail

順序：

1. Record Quality Finding。
2. Readable Added／Removed。
3. Raw Added／Removed（預設收合）。
4. Record rationale／unknown reasons／record negative checks。
5. Skill Finding Cards。
6. Evidence ID、Stable ID、Diff ID、Source Content Hash 與 normalization traceability。

大型 Diff 使用可展開、可捲動區塊，不得讓單筆內容破壞整頁。

### 9.3 Skill Finding Card

每個 Skill 必須獨立顯示：

- Skill ID／Name／Group。
- Numeric Confidence 與 Label。
- 一個或多個 Evidence Quote。
- Evidence Explanation。
- Negative Checks。
- Skill Rationale。
- Quality Findings。

Multi-skill 不得只在 Record header 放多個 Skill chip，而缺少各自完整內容。

## 10. Readable Evidence 與 Raw Source

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

Raw source、Evidence ID、Stable ID、source hash 與 record hash 不可被 Normalizer 改變。

## 11. Renderer 與 HTML Receipt

Renderer 必須執行：

```text
validate Template filename/version/bytes/hash
→ validate Renderer API surface
→ validate Canonical/Decision/Quality/Normalizer/Issue Snapshot Contract
→ calculate authoritative View Model
→ escape all source text
→ render self-contained HTML
→ write .tmp
→ fsync
→ atomic rename
→ reopen/hash verify
→ write canonical-output/html-render-receipt.json
```

Receipt 至少包含：

```text
runId
decisionContractVersion
qualityContractVersion
qualityGateStatus
normalizerVersion
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

Renderer API 缺漏（例如 `setHtmlRenderStatus is not a function`）必須歸類為 HTML Renderer failure，不得誤報成 ChatGPT 分析失敗。

## 12. 安全與離線要求

- 禁止 CDN、外部字型、外部圖片、analytics、fetch、XHR、WebSocket 或表單提交。
- Source、Evidence、Rationale、Actor、Issue、Skill Name 全部使用 `textContent` 或等效安全 escape。
- 嵌入 JSON 必須 escape `<`、`>`、`&`、`</script` 與 Unicode line separator。
- Template 只提供 declarative allowlisted contract，禁止任意執行 Template script。
- 篩選、統計、分頁、欄位顯示、CSV 與列印全部在本機執行。
- HTML 不包含 Token、Cookie、Authorization、DB password、未遮罩 credential 或 runtime absolute path。

## 13. Legacy v2 Preview

- Decision v2 只能標示 `LEGACY_UNVERIFIED`。
- 可以把既有 candidate 投影成 legacy skill card，但不得補寫不存在的 per-skill explanation。
- 共用 Evidence 必須標示 `LEGACY_SHARED_EVIDENCE`。
- Legacy Preview 不得觸發新的正式 SQLite 寫入。
- v2 Preview 的 Quality 統計必須誠實顯示，不得宣稱 v3 PASSED。

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

## 15. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 1.2.0 | 2026-08-19 | proposed | 加入 Readable Evidence、Run-scoped Issue Snapshot、Event／Unique Issue 統計、進階複選篩選、分頁排序、欄位顯示控制與資料字典 |
| 1.1.0 | 2026-08-19 | prototype | Decision v3 Skill Finding、Quality Gate、Legacy Preview、誠實 HTML lifecycle 與版本化檔名 |
| 1.0.0 | 2026-08-14 | proposed | 建立 Manifest-bound、本機 deterministic、自包含 Golden HTML 報告模板 |
