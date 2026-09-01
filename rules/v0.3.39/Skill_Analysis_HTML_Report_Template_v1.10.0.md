# JAA 技能分析 HTML 報告模板 v1.10.0

- File: `Skill_Analysis_HTML_Report_Template_v1.10.0.md`
- Template Schema Version: `jaa-html-report-template-v11`
- Template ID: `JAA-SKILL-ANALYSIS-GOLDEN-HTML`
- Template Version: `1.10.0`
- Previous Version: `1.9.0`
- Status: `proposed-ai-import-export`
- Locale: `zh-TW`
- Time Zone: `Asia/Taipei`
- Target Application: `JiraActivityAnalyzer`
- Target Application Version: `0.3.38`
- Minimum Renderer Version: `JAA-LOCAL-HTML-RENDERER-1.10.0`
- Required Decision Contract: `jaa-ai-analysis-decisions-v5`
- Required Normalizer: `JAA-EVIDENCE-NORMALIZER-1.0.0`
- Required Segmenter: `JAA-EVIDENCE-SEGMENTER-1.0.0`
- Required Evidence Quote Catalog: `JAA-EVIDENCE-QUOTE-CATALOG-1.0.0`
- Required Report Data Package: `jaa-analysis-report-data-package-v1`
- Required Issue Snapshot Profile: `jaa-issue-snapshot-profile-v1`
- Prepared Date: `2026-09-01`

## 1. 文件定位

本文件定義 Jira Activity Analyzer 的本機、deterministic、self-contained HTML 呈現與互動契約。v1.10.0 延續 v1.9.0 的簡易人工驗收與獨立「本次資料資訊」頁，並新增 JAA v0.3.38 AI Analysis Import Package 匯出。Skill 與分類語意只引用 Manifest、Common Rules 與 Skill Catalog。

本次改版：

1. 新增 `匯出 JAA 匯入 JSON`，依人工完成度產生 AI_ONLY／REVIEW_PARTIAL／REVIEW_COMPLETED Package。
2. 保留 Review JSON 匯入／匯出，繼續用於人工驗收續作與規則回饋。
3. 延續獨立「本次資料資訊」頁，呈現範圍、人員、Issue metadata、Pending 來源與匯出條件。
4. 匯出 Import Package 時鎖定 Source 與 AI Analysis，只允許增加人工 Review 層並重算 Integrity。
5. 不在 HTML 內實作舊格式轉換或 SQLite 匯入；舊格式由雲端 AI 轉換，資料庫寫入由 JAA v0.3.38 執行。

本模板：

- `FORMAL_CANONICAL` 只讀取由正式 Canonical 組裝出的 Formal Report Data Package。
- `DIAGNOSTIC_NON_CANONICAL` 只讀取由可解析 Decision Artifact 與 validator findings 組裝出的 Diagnostic Report Data Package。
- `BASELINE_RESULT_PREVIEW` 直接讀取分析結果 JSON；若同時提供 Pending JSON，只用於補足可讀 Diff 與來源資訊。
- `MANUAL_SKILL_REVIEW` 讀取本機建立的 Review Data Package，並可匯入相符來源的既有 Review JSON。
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
  "schemaVersion": "jaa-html-report-template-v11",
  "templateId": "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  "templateVersion": "1.10.0",
  "locale": "zh-TW",
  "timeZone": "Asia/Taipei",
  "minimumRendererVersion": "JAA-LOCAL-HTML-RENDERER-1.10.0",
  "requiredCapabilities": [
    "REPORT_DATA_PACKAGE_V1",
    "UNIQUE_ISSUE_SNAPSHOT_V1",
    "SNAPSHOT_FIELD_STATE_V1",
    "DECLARATIVE_STATISTICS_DSL_V1",
    "MULTI_TEMPLATE_OFFLINE_RENDER_V1",
    "AI_SUBMITTED_ARTIFACT_DIAGNOSTIC_V1",
    "ARTIFACT_IDENTITY_RECEIPT_V1",
    "EVIDENCE_QUOTE_CATALOG_V1",
    "LAYERED_VALIDATION_RECEIPTS_V2",
    "BASELINE_RESULT_PREVIEW_V1",
    "MANUAL_SKILL_REVIEW_V1",
    "MANUAL_REVIEW_DATA_PACKAGE_V1",
    "MANUAL_REVIEW_JSON_EXPORT_V1",
    "LOCAL_REVIEW_RESUME_V1",
    "MANUAL_REVIEW_EVIDENCE_ASSIGNMENT_V1",
    "MANUAL_REVIEW_V1_1_MIGRATION_V1",
    "MANUAL_REVIEW_JSON_SCHEMA_V1_3",
    "GUIDED_MANUAL_REVIEW_V1",
    "RAW_DIFF_EVIDENCE_PICKER_V1",
    "STRUCTURED_MISSING_SKILL_REVIEW_V1",
    "MANUAL_REVIEW_V1_2_MIGRATION_V1",
    "SOURCE_EXPORT_OVERVIEW_V1",
    "AI_ANALYSIS_IMPORT_PACKAGE_EXPORT_V1",
    "AI_ANALYSIS_IMPORT_PACKAGE_SCHEMA_V1"
  ],
  "renderModes": [
    "FORMAL_CANONICAL",
    "DIAGNOSTIC_NON_CANONICAL",
    "BASELINE_RESULT_PREVIEW",
    "MANUAL_SKILL_REVIEW"
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
    ],
    "baselinePreviewRole": "ANALYZED_RESULT_JSON",
    "manualReviewRole": "MANUAL_SKILL_REVIEW_DATA_PACKAGE",
    "requiredBaselineResultContract": "jaa-skill-analysis-result-v1.0.0",
    "requiredManualReviewDataPackageContract": "jaa-manual-skill-review-data-package-v1",
    "manualReviewSourceRoles": [
      "PENDING_ANALYSIS_JSON",
      "ANALYZED_RESULT_JSON",
      "RULE_SET_MANIFEST_MD",
      "COMMON_RULES_MD",
      "SKILL_CATALOG_MD"
    ],
    "optionalManualReviewStateContract": "jaa-manual-skill-review-v1.3.0",
    "acceptedLegacyManualReviewStateContracts": [
      "jaa-manual-skill-review-v1.2.0",
      "jaa-manual-skill-review-v1.1.0",
      "jaa-manual-skill-review-v1.0.0"
    ],
    "preferredAnalyzedResultContract": "jaa-ai-analysis-import-package-v1.0.0",
    "acceptedLegacyBaselineResultContract": "jaa-skill-analysis-result-v1.0.0"
  },
  "output": {
    "formalFilePattern": "analysis-result__template-v{templateVersion}__{renderedAtLocal}.html",
    "diagnosticFilePattern": "analysis-result-diagnostic__template-v{templateVersion}__{renderedAtLocal}.html",
    "overwriteExisting": false,
    "selfContained": true,
    "networkAccess": false,
    "defaultTheme": "light",
    "printEnabled": true,
    "filteredCsvEnabled": true,
    "baselinePreviewFilePattern": "analysis-result__template-v{templateVersion}__preview.html",
    "manualReviewFilePattern": "manual-skill-review__template-v{templateVersion}__{createdAtLocal}.html",
    "manualReviewJsonFilePattern": "manual-skill-review__{sourceResultSha256Prefix}__{exportedAtLocal}.json",
    "manualReviewCsvFilePattern": "manual-skill-review__{sourceResultSha256Prefix}__{exportedAtLocal}.csv",
    "reviewStateIsSeparateFromSourceResult": true
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
    "provenanceFooter",
    "manualReviewInstructions",
    "manualReviewStatusDictionary",
    "manualReviewProgress",
    "manualReviewFilters",
    "manualReviewRecordCards",
    "manualReviewExportReceipt",
    "viewNavigation",
    "sourceExportOverview"
  ],
  "statistics": {
    "dslVersion": "JAA-DECLARATIVE-STATISTICS-DSL-1.0.0",
    "allowlistedPopulations": [
      "EVENT",
      "UNIQUE_ISSUE",
      "SKILL_FINDING",
      "VALIDATION_FINDING"
    ],
    "allowlistedMetrics": [
      "COUNT",
      "DISTINCT_COUNT",
      "DISTRIBUTION",
      "MISSING_STATE_DISTRIBUTION"
    ],
    "definitions": [
      {
        "id": "activityEventCount",
        "population": "EVENT",
        "metric": "COUNT",
        "label": "Activity Events"
      },
      {
        "id": "uniqueIssueCount",
        "population": "UNIQUE_ISSUE",
        "metric": "COUNT",
        "label": "Unique Issues"
      },
      {
        "id": "duplicateEventOccurrences",
        "population": "EVENT",
        "metric": "COUNT_MINUS_UNIQUE_ISSUE",
        "label": "重複 Issue 的額外事件數"
      },
      {
        "id": "decisionStatusDistribution",
        "population": "EVENT",
        "metric": "DISTRIBUTION",
        "field": "analysis.status",
        "label": "分析判定狀態"
      },
      {
        "id": "skillDistribution",
        "population": "SKILL_FINDING",
        "metric": "DISTRIBUTION",
        "field": "skillId",
        "label": "技能分布"
      },
      {
        "id": "projectDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "DISTRIBUTION",
        "field": "snapshot.project.key",
        "label": "Project 分布"
      },
      {
        "id": "issueTypeDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "DISTRIBUTION",
        "field": "snapshot.issueType.name",
        "label": "Issue Type 分布"
      },
      {
        "id": "priorityDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "DISTRIBUTION",
        "field": "snapshot.priority.name",
        "label": "優先級分布"
      },
      {
        "id": "jiraIssueStatusDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "DISTRIBUTION",
        "field": "snapshot.status.name",
        "label": "Jira 狀態分布"
      },
      {
        "id": "componentDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "DISTRIBUTION",
        "field": "snapshot.components[].name",
        "label": "Component 分布",
        "topN": 30
      },
      {
        "id": "labelDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "DISTRIBUTION",
        "field": "snapshot.labels[]",
        "label": "Label 分布",
        "topN": 30
      },
      {
        "id": "rootCauseStateDistribution",
        "population": "UNIQUE_ISSUE",
        "metric": "MISSING_STATE_DISTRIBUTION",
        "field": "snapshot.snapshotFields.rootCause",
        "label": "Root Cause 資料狀態"
      }
    ],
    "uniqueIssueIdentity": "jiraServerIdentity + trim(issueKey).toUpperCase()",
    "coreSemanticsMutableByTemplate": false,
    "recalculateFromFilteredRecords": true,
    "showPopulationLabel": true,
    "distributionBarPresentation": {
      "scaleScope": "WITHIN_EACH_CHART_CURRENT_FILTERED_POPULATION",
      "normalizationFormula": "count / maxCountWithinSameChart * 100",
      "zeroCountWidthPercent": 0,
      "nonZeroMinimumVisibleWidthPercent": 2,
      "maximumWidthPercent": 100,
      "sortOrder": "COUNT_DESC_THEN_LABEL_ASC",
      "showExactCount": true,
      "showTrack": true,
      "fillMustAcceptExplicitWidth": true,
      "forbidPerRowNormalization": true,
      "recalculateOnFilterChange": true
    }
  },
  "snapshot": {
    "requiredFields": [
      "jiraServerIdentity",
      "normalizedIssueKey",
      "snapshotId",
      "snapshotSha256",
      "capturedAt",
      "project",
      "issueType",
      "priority",
      "status"
    ],
    "optionalFields": [
      "summary",
      "resolution",
      "created",
      "updated",
      "resolved",
      "startDate",
      "dueDate",
      "labels",
      "components",
      "fixVersions",
      "affectedVersions",
      "assigneeRef",
      "reporterRef",
      "creatorRef",
      "snapshotFields.rootCause"
    ],
    "fieldStates": [
      "PRESENT",
      "EMPTY",
      "NOT_APPLICABLE",
      "NOT_CAPTURED",
      "SOURCE_UNAVAILABLE",
      "CONFLICT"
    ],
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
      "validationFindingCode",
      "manualExpectedStatus",
      "statusAgreement",
      "skillReviewVerdict",
      "reviewCompletion",
      "skillIdentificationState"
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
    "toggleReadableRawTrace",
    "importManualReviewJson",
    "exportManualReviewJson",
    "exportManualReviewCsv",
    "markRecordReviewComplete",
    "copyReviewWithinDuplicateGroup",
    "resetManualReviewState",
    "openSourceExportOverview",
    "returnToReviewWorkspace",
    "exportAiAnalysisImportPackage",
    "exportReviewedAiAnalysisImportPackage"
  ],
  "compatibility": {
    "rejectUnknownCapability": true,
    "rejectMissingRequiredSnapshotField": true,
    "rejectNewerUnsupportedTemplateSchema": true,
    "allowSamePackageMultipleTemplates": true,
    "providerRequiredForRerender": false,
    "databaseRequiredForRerender": false,
    "manualReviewLegacyMigrationRequired": true,
    "manualReviewSourceHashMustMatch": true,
    "manualReviewMayMutateAnalyzedResult": false
  },
  "diagnosticMode": {
    "bannerLevel": "DANGER",
    "bannerText": "非正式診斷預覽：JAA 已收到 AI 提交，但未通過正式驗證。Canonical 未建立、SQLite 禁止，不可視為正式分析成果。",
    "requiredLifecycleLabels": [
      "AI_SUBMITTED",
      "FORMAL_VALIDATION_FAILED",
      "CANONICAL_NOT_CREATED",
      "SQLITE_DENIED"
    ],
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
    "0": "None",
    "0.9": "High",
    "0.6": "Medium",
    "0.3": "Low"
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
  },
  "modeCapabilities": {
    "FORMAL_CANONICAL": [
      "REPORT_DATA_PACKAGE_V1",
      "UNIQUE_ISSUE_SNAPSHOT_V1",
      "LAYERED_VALIDATION_RECEIPTS_V2"
    ],
    "DIAGNOSTIC_NON_CANONICAL": [
      "AI_SUBMITTED_ARTIFACT_DIAGNOSTIC_V1",
      "ARTIFACT_IDENTITY_RECEIPT_V1",
      "LAYERED_VALIDATION_RECEIPTS_V2"
    ],
    "BASELINE_RESULT_PREVIEW": [
      "BASELINE_RESULT_PREVIEW_V1"
    ],
    "MANUAL_SKILL_REVIEW": [
      "MANUAL_SKILL_REVIEW_V1",
      "MANUAL_REVIEW_DATA_PACKAGE_V1",
      "MANUAL_REVIEW_JSON_EXPORT_V1",
      "LOCAL_REVIEW_RESUME_V1",
      "SOURCE_EXPORT_OVERVIEW_V1"
    ]
  },
  "baselinePreviewMode": {
    "canonicalEligible": false,
    "sqliteEligible": false,
    "providerRequired": false,
    "purpose": "直接檢視符合 jaa-skill-analysis-result-v1.0.0 的分析結果，不冒充正式 Canonical。",
    "requiredIdentityChecks": [
      "recordCount",
      "recordIndexCoverage",
      "evidenceId",
      "sourceRecordStableId",
      "sourceSha256"
    ],
    "optionalPendingInputEnhancement": [
      "readableDiff",
      "rawDiff",
      "issueMetadata"
    ]
  },
  "manualReviewMode": {
    "bannerLevel": "INFO",
    "bannerText": "人工技能驗收：本頁只建立人工覆核紀錄，不會修改 AI 分析結果、規則文件、Canonical 或 SQLite。",
    "providerRequired": false,
    "networkAccess": false,
    "canonicalEligible": false,
    "sqliteEligible": false,
    "sourceImmutable": true,
    "expectedStatusValues": [
      {
        "id": "UNDECIDED",
        "label": "尚未判定",
        "definition": "尚未完成此筆記錄的人工狀態判定。"
      },
      {
        "id": "CLASSIFIED",
        "label": "應可分類",
        "definition": "此筆內容預期至少可以對應一個 Skill；不代表自動接受 AI 提出的全部 Skill。"
      },
      {
        "id": "UNKNOWN",
        "label": "資訊不足",
        "definition": "內容可能與技能有關，但現有 Evidence 不足以確定 Skill。"
      },
      {
        "id": "EXCLUDED",
        "label": "應排除",
        "definition": "內容明確不屬技能表現，例如 request-only、workflow-only、automation-only 或純系統內容。"
      },
      {
        "id": "FAILED",
        "label": "資料失敗",
        "definition": "來源不可解析、資料不完整或完整性驗證失敗，無法進行可靠判定。"
      }
    ],
    "agreementDerivation": {
      "sameAsAiStatus": "AGREE",
      "differentFromAiStatus": "DISAGREE",
      "undecided": "UNREVIEWED",
      "userEditable": false
    },
    "skillReviewVerdicts": [
      {
        "id": "UNREVIEWED",
        "label": "尚未驗收"
      },
      {
        "id": "ACCEPT",
        "label": "接受此 Skill"
      },
      {
        "id": "REJECT_WRONG_SKILL",
        "label": "Skill 判錯"
      },
      {
        "id": "REJECT_EVIDENCE_INSUFFICIENT",
        "label": "Evidence 不足"
      },
      {
        "id": "ADJUST_CONFIDENCE",
        "label": "調整信心值"
      },
      {
        "id": "UNCERTAIN",
        "label": "仍不確定"
      }
    ],
    "skillIdentificationStates": [
      "NOT_APPLICABLE",
      "IDENTIFIED",
      "NEEDS_DOMAIN_FOLLOWUP"
    ],
    "recordCompletionGate": {
      "expectedStatusMustNotBe": "UNDECIDED",
      "allAiSkillFindingsReviewed": true,
      "classifiedRequiresOneOf": [
        "acceptedOrAdjustedSkillFinding",
        "missingSkillSuggestion",
        "additionalEvidenceAssignment",
        "needsDomainFollowupWithNote"
      ],
      "unknownExcludedFailedDisallowAcceptedFindingWithoutConflictNote": true,
      "requiredNotesFor": [
        "NEEDS_DOMAIN_FOLLOWUP",
        "STATUS_FINDING_CONFLICT"
      ],
      "additionalEvidenceAssignmentsMustBeConfirmed": true,
      "existingSkillMustNotAppearInMissingSkillIds": true,
      "structuredMissingSkillReviewsMustBeComplete": true
    },
    "persistence": {
      "localAutosave": "BEST_EFFORT",
      "storageKeyFields": [
        "pendingSha256",
        "analyzedResultSha256",
        "catalogSha256",
        "commonRulesSha256",
        "manifestSha256",
        "templateVersion",
        "reviewSchemaVersion"
      ],
      "exportedJsonIsAuthoritativeReviewState": true,
      "sourceFilesAreNeverOverwritten": true,
      "importRequiresMatchingSourceHashes": true
    },
    "legacyReviewMigration": {
      "fromSchemaVersions": [
        "1.0.0",
        "1.1.0",
        "1.2.0"
      ],
      "toSchemaVersion": "1.3.0",
      "coreSourceHashesMustMatch": true,
      "templateHashMayChangeOnlyDuringExplicitMigration": true,
      "preserveSkillVerdictsNotesTimestampsAndCompletedRecords": true,
      "v12MissingSkillMapsToStructuredReview": true,
      "emitMigrationReceipt": true,
      "silentDestructiveOverwriteAllowed": false
    }
  },
  "manualReviewStateContract": {
    "schemaName": "jaa-manual-skill-review",
    "schemaVersion": "1.3.0",
    "requiredRootFields": [
      "schemaName",
      "schemaVersion",
      "reviewStatus",
      "reviewer",
      "createdAtLocal",
      "updatedAtLocal",
      "sourceHashes",
      "sourceIdentity",
      "records",
      "counts"
    ],
    "requiredRecordFields": [
      "recordIndex",
      "evidenceId",
      "sourceRecordStableId",
      "issueKey",
      "aiStatus",
      "expectedStatus",
      "statusAgreement",
      "skillIdentificationState",
      "missingSkillIds",
      "missingSkillReviews",
      "additionalEvidenceAssignments",
      "notes",
      "completed",
      "skillReviews"
    ],
    "requiredSkillReviewFields": [
      "skillId",
      "aiConfidence",
      "verdict",
      "proposedConfidence",
      "notes"
    ],
    "requiredMissingSkillReviewFields": [
      "reviewId",
      "skillId",
      "suggestedConfidence",
      "sourceJsonPointer",
      "quote",
      "reason",
      "negativeChecks",
      "reviewOrigin",
      "confirmed"
    ],
    "requiredEvidenceAssignmentFields": [
      "assignmentId",
      "targetSkillId",
      "targetSkillPresence",
      "sourceFindingSkillId",
      "sourceJsonPointer",
      "quote",
      "suggestedConfidence",
      "reason",
      "negativeChecks",
      "reviewOrigin",
      "confirmed"
    ],
    "derivedFields": [
      "statusAgreement",
      "skillIdentificationState",
      "missingSkillIds",
      "counts",
      "reviewStatus"
    ],
    "recordOrdering": "recordIndex ASC",
    "duplicateRecordIndexAllowed": false,
    "unknownSkillIdAllowed": false,
    "existingSkillAllowedInMissingSkillIds": false,
    "additionalEvidenceAssignmentDuplicateAllowed": false
  },
  "manualReviewUi": {
    "language": "zh-TW",
    "defaultMode": "BASIC",
    "availableModes": [
      "BASIC",
      "ADVANCED"
    ],
    "defaultRecordScope": "ONE_AT_A_TIME",
    "primaryQuestions": [
      "人工狀態是否同意 AI",
      "AI Skill 是否正確",
      "是否漏掉其他 Skill"
    ],
    "autoDerivedFieldsHiddenInBasicMode": [
      "statusAgreement",
      "skillIdentificationState",
      "targetSkillPresence",
      "reviewOrigin"
    ],
    "advancedFieldsCollapsedByDefault": [
      "sourceJsonPointer",
      "negativeChecks",
      "recordNotes",
      "additionalEvidenceAssignments",
      "rawDiff"
    ],
    "rawDiffEvidenceSelectableWhenNoAiFinding": true,
    "missingSkillReviewEditable": true,
    "acceptAllFindingsAction": true,
    "previousNextNavigation": true,
    "completeAndNextAction": true,
    "firstIncompleteOnOpen": true,
    "autosave": true,
    "importLegacyReviewVersions": [
      "1.2.0",
      "1.1.0",
      "1.0.0"
    ],
    "aiStatusReadOnly": true,
    "sourceResultImmutable": true,
    "viewNavigation": {
      "reviewWorkspaceLabel": "人工驗收",
      "sourceOverviewLabel": "本次資料資訊",
      "sourceOverviewSeparateView": true,
      "reviewControlsHiddenInSourceOverview": true
    }
  },
  "manualReviewJsonSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://jiraactivityanalyzer.local/schema/jaa-manual-skill-review-v1.3.0.schema.json",
    "title": "JAA Manual Skill Review v1.3.0",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schemaName",
      "schemaVersion",
      "reviewStatus",
      "reviewer",
      "createdAtLocal",
      "updatedAtLocal",
      "sourceHashes",
      "sourceIdentity",
      "records",
      "counts"
    ],
    "properties": {
      "schemaName": {
        "const": "jaa-manual-skill-review"
      },
      "schemaVersion": {
        "const": "1.3.0"
      },
      "reviewStatus": {
        "enum": [
          "IN_PROGRESS",
          "COMPLETED"
        ]
      },
      "reviewer": {
        "type": "string"
      },
      "createdAtLocal": {
        "type": "string",
        "minLength": 1
      },
      "updatedAtLocal": {
        "type": "string",
        "minLength": 1
      },
      "sourceHashes": {
        "type": "object",
        "additionalProperties": true
      },
      "sourceIdentity": {
        "type": "object",
        "additionalProperties": true
      },
      "migrationReceipt": {
        "type": "object",
        "additionalProperties": true
      },
      "records": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/reviewRecord"
        }
      },
      "counts": {
        "type": "object",
        "additionalProperties": true
      }
    },
    "$defs": {
      "skillId": {
        "type": "string",
        "pattern": "^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$"
      },
      "skillReview": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "skillId",
          "aiConfidence",
          "verdict",
          "proposedConfidence",
          "notes"
        ],
        "properties": {
          "skillId": {
            "$ref": "#/$defs/skillId"
          },
          "aiConfidence": {
            "enum": [
              0,
              0.3,
              0.6,
              0.9
            ]
          },
          "verdict": {
            "enum": [
              "UNREVIEWED",
              "ACCEPT",
              "REJECT_WRONG_SKILL",
              "REJECT_EVIDENCE_INSUFFICIENT",
              "ADJUST_CONFIDENCE",
              "UNCERTAIN"
            ]
          },
          "proposedConfidence": {
            "enum": [
              null,
              0.3,
              0.6,
              0.9
            ]
          },
          "notes": {
            "type": "string"
          }
        }
      },
      "missingSkillReview": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "reviewId",
          "skillId",
          "suggestedConfidence",
          "sourceJsonPointer",
          "quote",
          "reason",
          "negativeChecks",
          "reviewOrigin",
          "confirmed"
        ],
        "properties": {
          "reviewId": {
            "type": "string",
            "pattern": "^msr_[a-f0-9]{20}$"
          },
          "skillId": {
            "$ref": "#/$defs/skillId"
          },
          "suggestedConfidence": {
            "enum": [
              null,
              0.3,
              0.6,
              0.9
            ]
          },
          "sourceJsonPointer": {
            "type": "string"
          },
          "quote": {
            "type": "string"
          },
          "reason": {
            "type": "string"
          },
          "negativeChecks": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "uniqueItems": true
          },
          "reviewOrigin": {
            "enum": [
              "MANUAL",
              "MIGRATED_FROM_V1_2"
            ]
          },
          "confirmed": {
            "type": "boolean"
          }
        }
      },
      "evidenceAssignment": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "assignmentId",
          "targetSkillId",
          "targetSkillPresence",
          "sourceFindingSkillId",
          "sourceJsonPointer",
          "quote",
          "suggestedConfidence",
          "reason",
          "negativeChecks",
          "reviewOrigin",
          "confirmed"
        ],
        "properties": {
          "assignmentId": {
            "type": "string"
          },
          "targetSkillId": {
            "$ref": "#/$defs/skillId"
          },
          "targetSkillPresence": {
            "const": "EXISTING"
          },
          "sourceFindingSkillId": {
            "anyOf": [
              {
                "$ref": "#/$defs/skillId"
              },
              {
                "type": "null"
              }
            ]
          },
          "sourceJsonPointer": {
            "type": "string",
            "minLength": 1
          },
          "quote": {
            "type": "string",
            "minLength": 1
          },
          "suggestedConfidence": {
            "enum": [
              null,
              0.3,
              0.6,
              0.9
            ]
          },
          "reason": {
            "type": "string",
            "minLength": 1
          },
          "negativeChecks": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "uniqueItems": true
          },
          "reviewOrigin": {
            "enum": [
              "MANUAL",
              "MIGRATED_FROM_V1_2"
            ]
          },
          "confirmed": {
            "type": "boolean"
          }
        }
      },
      "reviewRecord": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "recordIndex",
          "evidenceId",
          "sourceRecordStableId",
          "issueKey",
          "aiStatus",
          "expectedStatus",
          "statusAgreement",
          "skillIdentificationState",
          "missingSkillIds",
          "missingSkillReviews",
          "additionalEvidenceAssignments",
          "notes",
          "completed",
          "skillReviews"
        ],
        "properties": {
          "recordIndex": {
            "type": "integer",
            "minimum": 0
          },
          "evidenceId": {
            "type": "string"
          },
          "sourceRecordStableId": {
            "type": "string"
          },
          "issueKey": {
            "type": "string"
          },
          "aiStatus": {
            "enum": [
              "CLASSIFIED",
              "UNKNOWN",
              "EXCLUDED",
              "FAILED"
            ]
          },
          "expectedStatus": {
            "enum": [
              "UNDECIDED",
              "CLASSIFIED",
              "UNKNOWN",
              "EXCLUDED",
              "FAILED"
            ]
          },
          "statusAgreement": {
            "enum": [
              "UNREVIEWED",
              "AGREE",
              "DISAGREE"
            ]
          },
          "skillIdentificationState": {
            "enum": [
              "NOT_APPLICABLE",
              "IDENTIFIED",
              "NEEDS_DOMAIN_FOLLOWUP"
            ]
          },
          "missingSkillIds": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/skillId"
            },
            "uniqueItems": true
          },
          "missingSkillReviews": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/missingSkillReview"
            }
          },
          "additionalEvidenceAssignments": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/evidenceAssignment"
            }
          },
          "notes": {
            "type": "string"
          },
          "completed": {
            "type": "boolean"
          },
          "skillReviews": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/skillReview"
            }
          }
        }
      }
    }
  },
  "manualReviewJsonSchemaSha256": "7ff2a2bf48df2915d5201978db2aaa06302be0b629d5d24cb32808c645a8cbe2",
  "pageViews": {
    "defaultView": "REVIEW_WORKSPACE",
    "views": [
      {
        "id": "REVIEW_WORKSPACE",
        "label": "人工驗收",
        "containsReviewControls": true
      },
      {
        "id": "SOURCE_EXPORT_OVERVIEW",
        "label": "本次資料資訊",
        "containsReviewControls": false
      }
    ],
    "singleVisibleView": true,
    "navigationPreservesReviewState": true
  },
  "sourceExportOverview": {
    "separateFromReviewWorkspace": true,
    "requiredSections": [
      "analysisScope",
      "people",
      "issueMetadataDistributions",
      "pendingSourceIdentity",
      "exportQuerySnapshot",
      "exportCountsAndIntegrity"
    ],
    "requiredFields": [
      "selectedDateRange",
      "actualRecordEventRange",
      "selectedUsers",
      "actualActors",
      "issueTypeDistribution",
      "priorityDistribution",
      "pendingFilename",
      "pendingSha256",
      "pendingSchema",
      "appVersion",
      "createdAt",
      "sourceView",
      "exportId",
      "exportMode",
      "queryFilters",
      "sort",
      "diffQuickFilters",
      "recordCounts",
      "integrity"
    ],
    "missingStructuredMetadataBehavior": "SHOW_SOURCE_NOT_PROVIDED",
    "neverInferIssueTypeOrPriorityFromText": true,
    "distinguishSelectedRangeFromActualRecordRange": true,
    "sourceIdentityReadOnly": true
  },
  "aiAnalysisImportPackage": {
    "schemaName": "jaa-ai-analysis-import-package",
    "schemaVersion": "1.0.0",
    "schemaSha256": "6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c",
    "minimumImporterVersion": "0.3.38",
    "requiredCapabilities": [
      "AI_ANALYSIS_SQLITE_V1",
      "SOURCE_RECORD_LINK_V1",
      "MANUAL_REVIEW_LAYER_V1"
    ],
    "exportStates": [
      "AI_ONLY",
      "REVIEW_PARTIAL",
      "REVIEW_COMPLETED"
    ],
    "preserveAcrossReview": [
      "sourceBinding",
      "rulesBinding",
      "records[].dedupeKey",
      "records[].sourceReference",
      "records[].sourceSnapshot",
      "records[].aiAnalysis"
    ],
    "mutableReviewLayer": [
      "templateBinding",
      "reviewCoverage",
      "records[].manualReview",
      "counts.reviewedRecordCount",
      "counts.completedRecordCount",
      "integrity"
    ],
    "keepManualReviewJsonExport": true,
    "reviewJsonPurpose": "resume-and-rule-feedback",
    "importPackagePurpose": "JAA-v0.3.38-AI-analysis-database-import",
    "failIfSourceOrAiHashChanged": true
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

### 5.4.1 Distribution Bar 比例與實作契約

同一張 Distribution 圖內，所有長條使用同一個分母：該圖在目前 filter population 下的最大 count。

```text
barWidthPercent = count / maxCountWithinSameChart * 100
```

固定規則：

- 最大 count 的長條寬度為 `100%`。
- 其他長條依 count 比例縮短。例如同圖數量為 `12、6、3` 時，寬度必須為 `100%、50%、25%`。
- `count = 0` 時寬度為 `0%`；非零但比例極小時可使用 `2%` 的最低可見寬度，但右側仍顯示真實 count，不得放大數值。
- 禁止以每一列自己的 count 當分母；該做法會讓所有長條都成為 `100%`，失去比較意義。
- 不同圖表各自正規化。Decision Status、Skill Findings、Unique Issue／Event 不共用最大值。
- Filter 改變可見母體時，Renderer 必須同步重算每列 count、圖內最大 count、長條寬度與精確數字標籤。
- Fill element 必須是可接受明確寬度的元素，例如 `display:block` 或 `display:inline-block`；不得只設定 inline element 的 `width`。
- 灰色 track 表示可用尺度，彩色 fill 表示實際比例；不可只顯示 track 而沒有非零 fill。
- 每列保留精確 count 與可存取文字；顏色與長度不得成為唯一資訊來源。
- 排序固定為 count 由大到小；count 相同時依 label 升冪，確保 deterministic output。

Renderer 測試至少包含：

```text
[14, 3]       -> [100%, 21.4286%]
[12, 11, 8, 6, 2, 2] -> [100%, 91.6667%, 66.6667%, 50%, 16.6667%, 16.6667%]
[4, 3, 3, 2, 2, 2, 1] -> [100%, 75%, 75%, 50%, 50%, 50%, 25%]
```

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

- 同一 Formal Package 使用 v1.6.0 兩次，HTML 資料結果一致且 receipt hash 可追溯；檔名不得覆寫。
- 同一 Package 使用另一份相容 Template，不呼叫 Provider且可產生另一份 HTML。
- 缺少 required capability／Snapshot field、contract 太舊或 renderer 太舊時 fail closed。
- Template 試圖執行 script、SQL、外部 fetch 或未允許 expression 時拒絕。
- Offline import 的 External Report Package 只能檢視與渲染，v0.3.33 不可直接寫入正式 SQLite。

## 15. 人工技能驗收模式

### 15.1 基本模式

基本模式預設一次顯示一筆 Record，只要求回答三個問題：人工狀態是否同意 AI、AI 列出的 Skill 是否正確、是否漏掉其他 Skill。狀態一致性、Skill 識別狀態、Existing／Missing、reviewOrigin 與來源指標由系統衍生。

AI 無 Finding 時，使用者選擇「應可分類」後，可以從原始 Diff lines 選 Evidence、選 Skill、Confidence 並填理由。不能因 AI 無 Finding 而產生空 Evidence 下拉選單。

### 15.2 進階模式

進階模式才顯示 sourceJsonPointer、Negative Checks、Record notes、同一句 Evidence 支持另一個既有 Skill，以及完整 AI Rationale。基本模式的操作與進階模式必須寫入同一 Review State。

### 15.3 結構化漏判 Skill

`missingSkillIds` 為相容與索引用衍生欄位；權威人工內容是 `missingSkillReviews`。每項必須保存 Skill ID、建議 Confidence、Evidence pointer、exact quote、支持理由、Negative Checks、來源及確認狀態。目標 Skill 已存在於 AI Findings 時不得建立漏判，應改用 `additionalEvidenceAssignments`。

### 15.4 完成條件

completed=true 必須符合：expectedStatus 已判定、所有 AI Findings 已驗收、每個漏判 Skill 都有合法 Skill、Evidence、Confidence 與理由、所有補充 Evidence 關聯可回溯，而且狀態衝突已有備註。完成後可自動前往下一筆。

### 15.5 v1.2.0 遷移

匯入 v1.2.0 時必須比對 Pending、Analyzed Result、Catalog、Common Rules 與 Manifest 核心 SHA-256；Template SHA 可在明確遷移時改變。既有 completed Records、Skill verdict、notes、missingSkillIds 與 additionalEvidenceAssignments 必須保留。MISSING Assignment 應轉為 structured missingSkillReview；只有 missingSkillId 而沒有 Evidence 的資料轉為待補，不得假造 Evidence。

### 15.6 保存與安全

Local autosave 只是便利功能，正式續作依據仍是匯出的 Review JSON。HTML 必須 self-contained、無 network、不得修改 AI 分析 JSON、三份分析規則、Canonical 或 SQLite。

### 15.7 驗收案例

1. 已完成 #0～#5 的 v1.2.0 Review 匯入後仍保持完成。
2. #3 的 GC_006 漏判與既有 Evidence、Confidence、理由完整轉換。
3. #6 的 CLASSIFIED、GC_006 與備註保留，但在補選原始 Diff Evidence 與 Confidence 前保持未完成。
4. AI Skill Findings=0 時仍可從 raw Diff 建立完整漏判 Skill。
5. v1.3.0 匯出再匯入後 round-trip 一致。

## 16. 本次資料資訊獨立頁

### 16.1 頁面分離

HTML 必須提供「人工驗收」與「本次資料資訊」兩個頁面檢視，預設開啟人工驗收。任一時間只顯示一個檢視；資料資訊頁不得顯示 Record 判定、Skill verdict、漏判 Skill 編輯或完成按鈕。切換頁面不得重設或改寫人工驗收狀態。

### 16.2 必須顯示的資料

資料資訊頁至少顯示：

- 查詢選擇的統計日期區間，以及實際匯出 Records 的最早與最晚 event time。
- 查詢選擇的人員，以及實際 Records 中出現的人員。
- Issue Type 與 Priority 的分布。
- Pending JSON 檔名、SHA-256、Schema、App Version、createdAt、sourceView、exportId 與 exportMode。
- querySnapshot 的欄位篩選、排序、日期、人員範圍、descriptionChangedOnly、includeBeforeUnavailable 與 Diff quick filters。
- filtered、exported、skipped、failed、changed record、Diff coverage 與 integrity receipt。

### 16.3 缺少來源欄位

Issue Type 或 Priority 必須來自 Pending JSON 的結構化 Issue metadata snapshot。來源沒有提供時，頁面必須顯示「來源未提供」，並指出需要升級 Pending export；不得從 Issue key、標題、描述、留言或 Skill 分類推測。

### 16.4 驗收案例

1. 點選「本次資料資訊」後，只顯示來源與匯出條件，不顯示人工判定控制項。
2. 點選「返回人工驗收」後，原本 Review State、目前 Record 與 Local autosave 均不遺失。
3. 查詢日期區間與實際 Record event time 區間分開呈現。
4. Pending JSON 未提供 Issue Type／Priority 時，兩欄顯示「來源未提供」，不得顯示臆測分布。
5. Pending filename、SHA-256、querySnapshot、counts 與 integrity 可由原始 Pending JSON 重算或逐欄比對。

## 17. JAA AI 分析資料庫匯出

### 17.1 兩種匯出用途

| 按鈕 | 輸出 | 用途 |
|---|---|---|
| 匯出 Review JSON | `jaa-manual-skill-review v1.3.0` | 保存／續作人工驗收、回饋分類規則 |
| 匯出 JAA 匯入 JSON | `jaa-ai-analysis-import-package v1.0.0` | 匯入 JAA v0.3.38 的獨立 AI Analysis SQLite |

兩者必須同時保留。Review JSON 不得直接當成資料庫匯入 Package；Import Package 也不取代人工驗收續作檔。

### 17.2 Package 匯出規則

1. Schema Name／Version／SHA-256 固定為 `jaa-ai-analysis-import-package 1.0.0`／`6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c`。
2. 沒有任何人工決定時，輸出 `NONE / AI_ONLY`，全部 `manualReview=null`。
3. 至少一筆有人工決定但未全部完成時，輸出 `PARTIAL / REVIEW_PARTIAL`。
4. 全部 Records 驗收完成時，輸出 `COMPLETED / REVIEW_COMPLETED`。
5. 匯出只能加入 `manualReview`、Template Binding、Review Coverage、Counts 與 Integrity；不得改寫 Source 或 AI Analysis。
6. 匯出前必須重算 Record Hash、Source Hash、AI Analysis Hash、Manual Review Hash 與 Package Hash。
7. 若 Source／AI Hash 與載入時不同，必須 fail closed 並拒絕下載。
8. HTML 不匯入 SQLite；只產生離線 JSON，後續由 JAA Importer 執行 Preflight、去重、Review Rank Protection 與 Source Link。

### 17.3 操作簡化

- 頂端維持「匯入 Review JSON」「匯出 Review JSON」，另增加清楚命名的「匯出 JAA 匯入 JSON」。
- 使用者不必理解 Schema 細節；按鈕旁顯示目前將輸出的 `AI_ONLY`／`REVIEW_PARTIAL`／`REVIEW_COMPLETED`。
- 完成狀態由 Review 資料自動推導，不要求使用者手動選擇 Rank。

### 17.4 驗收案例

1. AI_ONLY Package 經 HTML 開啟後未操作即匯出，Source／AI Hash 不變且 Review Coverage 為 NONE。
2. 只完成部分 Record 時，匯出 REVIEW_PARTIAL；重新匯入 Review JSON 後決定不遺失。
3. 59/59 完成時，匯出 REVIEW_COMPLETED；81 Accept、5 Reject 與 10 Status disagreement 全部保留。
4. REVIEW_COMPLETED Package 不得被相同 dedupeKey 的 AI_ONLY Package 覆蓋；此項由 JAA Importer 測試。
5. Template 不提供舊格式轉換 UI；legacy JSON 由雲端 AI 統一轉換。

## 18. Change History


| Version | Date | Status | Change |
|---|---|---|---|
| 1.10.0 | 2026-09-01 | proposed | 新增 JAA v0.3.38 Import Package 匯出；保留 Review JSON；依人工完成度輸出 AI_ONLY／REVIEW_PARTIAL／REVIEW_COMPLETED，並鎖定 Source／AI Hash |
| 1.9.0 | 2026-09-01 | proposed | 新增獨立「本次資料資訊」頁；顯示統計範圍、人員、Issue metadata、Pending 來源、querySnapshot、counts 與 integrity；來源缺少 Issue Type／Priority 時禁止推測 |
| 1.8.1 | 2026-08-31 | proposed | 修正含顯示名稱之 Skill 選項無法解析 Skill ID |
| 1.8.0 | 2026-08-31 | proposed | 預設基本模式、一次一筆、raw Diff Evidence picker、structured missingSkillReviews、可編輯漏判 Skill與 v1.2.0 migration |
| 1.7.0 | 2026-08-31 | proposed | 將人工驗收互動與匯出規則納入 Template；新增 Review JSON v1.2.0、additionalEvidenceAssignments、既有 Skill 防重複、內嵌 Schema 與 v1.1.0 migration |
| 1.6.0 | 2026-08-25 | proposed | 新增 Baseline Preview 與人工技能驗收；整合 expectedStatus、per-Skill verdict、漏判 Skill、完成閘門、v1.1.0 Review JSON、v1.0.0 migration、續作與離線匯出契約 |
| 1.5.2 | 2026-08-25 | proposed | 修正 Distribution bar 視覺比例契約；同圖共用最大值正規化、filter-aware 重算、禁止 per-row 100%、要求 fill element 可套用寬度並保留精確 count |
| 1.5.1 | 2026-08-24 | proposed | Required capability 升為 `LAYERED_VALIDATION_RECEIPTS_V2`；統一自動／手動 Renderer；加入 Quality Warning、report error、failure receipt 與 Debug HTML 收集要求 |
| 1.5.0 | 2026-08-20 | proposed | 新增 AI Submitted Artifact lifecycle、Artifact Identity Receipt、Decision v5 Quote Catalog lineage、layered findings、Analysis Report／final summary 與強制 non-canonical／SQLite denied 診斷呈現 |
| 1.4.0 | 2026-08-20 | proposed | HTML 直接輸入改為 Report Data Package + Template，新增 Snapshot field states、declarative statistics DSL、capability negotiation 與多模板離線重繪 |
| 1.3.0 | 2026-08-19 | proposed | 加入 Decision v4 Evidence Segment／Role、FORMAL／DIAGNOSTIC mode、聚合 findings、診斷 HTML、Evidence Role／Validation 篩選與 trace view |
| 1.2.0 | 2026-08-19 | proposed | 加入 Readable Evidence、Run-scoped Issue Snapshot、Event／Unique Issue 統計、進階複選篩選、分頁排序、欄位顯示控制與資料字典 |
| 1.1.0 | 2026-08-19 | prototype | Decision v3 Skill Finding、Quality Gate、Legacy Preview、誠實 HTML lifecycle 與版本化檔名 |
| 1.0.0 | 2026-08-14 | proposed | 建立 Manifest-bound、本機 deterministic、自包含 Golden HTML 報告模板 |
