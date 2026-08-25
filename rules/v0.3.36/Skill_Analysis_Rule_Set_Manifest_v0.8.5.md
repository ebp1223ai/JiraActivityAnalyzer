# Skill Analysis Rule Set Manifest v0.8.5

- File: `Skill_Analysis_Rule_Set_Manifest_v0.8.5.md`
- Manifest Schema Version: `0.8.5`
- Previous Version: `0.8.4`
- Rule Set ID: `JAA-SKILL-RULESET-2026-08-25-DRAFT-085`
- Status: `review-draft`
- Prepared Date: `2026-08-25`
- Target Application: `JiraActivityAnalyzer`
- Target Application Version: `0.3.36`
- Prompt Locale: `zh-TW`

## 1. 文件定位

本 Manifest 是一次技能分析的唯一版本綁定入口，負責把 Common Rules、Catalog、Decision／Quality／Evidence／Canonical Contract、Report Data Package、HTML Template 與 Renderer 綁成可驗證 Rule Set Snapshot。

v0.8.5 延續 v0.8.4 的 Host Controller、Artifact-as-Completion、Validation causal truth，以及既有 Multi-skill、Catalog Detail、Warning Gate、HTML lifecycle、四檔選取、Active Result、Decision v5、Evidence Quote Catalog 與 Debug lineage，不變更 279 Skills。本次依 v0.3.35 真實 17 筆 Managed ChatGPT Run 進版：

1. Run 最終結果只能由單一 Host-side Terminal Outcome Reducer 決定，任何 callback 不得直接 terminalize。
2. Durable Artifact submission 必須推導 `analysisStarted=true`、`analysisCompleted=true` 與 `COMPLETED_BY_ARTIFACT`。
3. Provider terminal event 與 Artifact presence 使用固定矩陣；合法 Artifact 不得被後到的 provider failure 覆寫。
4. Post-Artifact pipeline 以 `runId + artifactHash` 冪等、可重入，並支援啟動復原與人工重處理。
5. Artifact Identity 只能來自 immutable Runtime Contract Registry；dispatch expected 與 artifact-time injection 為獨立來源。
6. Artifact 狀態固定為 `received → persisted → content_validated → formally_published`；工具回覆最多只能是 `persisted`。
7. Artifact final summary 與 Provider final assistant response 分檔保存，禁止覆寫 receipt 已綁定內容。
8. Lifecycle、stage receipts、root error、failed stage、Artifact bytes／hash 必須 reconciliation 一致。
9. Debug／UI 必須如實承認 submission evidence 並保留 numeric token telemetry，憑證仍需遮罩。
10. v0.3.35 真實 17 筆 Debug Bundle 必須同時執行 as-recorded forensic replay 與 corrected-host-identity isolated replay。

Bridge 進版 `0.3.36-bridge-v16`；Transport v4、Decision v5、Catalog v0.3.1 與 Template／Renderer 1.5.1 維持不變。

本 Manifest 不重複定義 279 個 Skill，不允許模型自行新增 Skill，也不要求模型產生 HTML、Report Data Package、統計或寫入本機檔案。

## 2. 正式文件與元件綁定

| Binding | Value | Bytes | SHA-256／狀態 |
|---|---|---:|---|
| `rule_set_id` | `JAA-SKILL-RULESET-2026-08-25-DRAFT-085` | — | review-draft |
| `manifest_file` | `Skill_Analysis_Rule_Set_Manifest_v0.8.5.md` | runtime | 本檔載入時計算；不得自我綁定固定 Hash |
| `common_rules_version` | `1.6.5` | — | Terminal reducer + Artifact reconciliation + Decision v5 |
| `common_rules_file` | `Skill_Classification_Common_Rules_v1.6.5.md` | 51776 | `c819004275aff3c6b3fc646b994ef1077a8e4385730e07460fdd0e36d4aef10d` |
| `skill_catalog_version` | `0.3.1` | — | unchanged review-draft |
| `skill_catalog_file` | `Skill_Catalog_v0.3.1.md` | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d`；279 Skills |
| `html_report_template_version` | `1.5.1` | — | AI submission + layered diagnostic UI |
| `html_report_template_file` | `Skill_Analysis_HTML_Report_Template_v1.5.1.md` | 38057 | `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02` |
| `classification_engine_version` | `JAA-CLASSIFICATION-1.6.5` | — | Terminal reconciliation + Quote-level Quality Gate + Decision v5 |
| `prompt_version` | `JAA-CHATGPT-ZH-TW-0.3.36` | runtime | effective instruction bytes／hash 逐 Run 保存 |
| `pipeline_version` | `JAA-ANALYSIS-PIPELINE-0.3.36` | runtime | terminal reducer／post-artifact recovery／receipt truth |
| `bridge_version` | `0.3.36-bridge-v16` | runtime | 行為進版；實際 bytes／SHA-256 由 Package Source build 計算並驗證 |
| `host_lifecycle` | `jaa-host-control-lifecycle-v3` | runtime | reducer-owned terminal outcome |
| `artifact_submission_result` | `jaa-artifact-submission-result-v3` | runtime | four-state durable artifact vocabulary |
| `provider_transport` | `bridge-resumable-v4` | runtime | protected-token-safe combined read／ACK／resume |
| `evidence_quote_catalog` | `JAA-EVIDENCE-QUOTE-CATALOG-1.0.0` | runtime | deterministic readable trace |
| `artifact_submission_token` | `jaa-artifact-submission-token-v1` | runtime | opaque／single-use／run-scoped |
| `artifact_identity_receipt` | `jaa-artifact-identity-receipt-v1` | runtime | per-field binding result |
| `rule_selection_transaction` | `jaa-rule-set-selection-transaction-v1` | runtime | Draft／Active atomic activation |
| `active_result_contract` | `jaa-active-analysis-result-v1` | runtime | successful analyzed result registry |
| `navigation_decision_receipt` | `jaa-analysis-navigation-decision-v1` | runtime | Workspace → Results gate |
| `decision_schema` | `jaa-ai-analysis-decisions-v5` | runtime | evidenceQuoteIds only |
| `canonical_result` | `jaa-canonical-analysis-result-v5` | runtime | unchanged |
| `report_data_package` | `jaa-analysis-report-data-package-v1` | runtime | unchanged |
| `html_template_contract` | `jaa-html-report-template-v6` | runtime | formal + diagnostic lifecycle |
| `html_renderer` | `JAA-LOCAL-HTML-RENDERER-1.5.1` | runtime | local-only renderer |

Catalog 仍為 `review-draft`。結果適用於 POC、規則驗證與人工覆核；在 279 項 Detail Description 完整且人工核准前，不得宣稱為正式人員職能結論。

## 3. Machine-readable Manifest Contract

JAA 只解析下列標記之間的 JSON object。載入時必須核對檔名、內部版本、bytes 與 SHA-256。

<!-- BEGIN JAA_RULE_SET_MANIFEST_JSON -->
```json
{
  "schemaVersion": "0.8.5",
  "ruleSetId": "JAA-SKILL-RULESET-2026-08-25-DRAFT-085",
  "status": "review-draft",
  "targetApplicationVersion": "0.3.36",
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
      "fileName": "Skill_Analysis_Rule_Set_Manifest_v0.8.5.md",
      "version": "0.8.5",
      "modelVisible": true,
      "selfHash": "runtime-calculated"
    },
    {
      "role": "COMMON_RULES",
      "fileName": "Skill_Classification_Common_Rules_v1.6.5.md",
      "version": "1.6.5",
      "bytes": 51776,
      "sha256": "c819004275aff3c6b3fc646b994ef1077a8e4385730e07460fdd0e36d4aef10d",
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
      "fileName": "Skill_Analysis_HTML_Report_Template_v1.5.1.md",
      "version": "1.5.1",
      "bytes": 38057,
      "sha256": "dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02",
      "modelVisible": false
    }
  ],
  "contracts": {
    "classificationEngine": "JAA-CLASSIFICATION-1.6.5",
    "prompt": "JAA-CHATGPT-ZH-TW-0.3.36",
    "pipeline": "JAA-ANALYSIS-PIPELINE-0.3.36",
    "bridge": "0.3.36-bridge-v16",
    "providerTransport": "bridge-resumable-v4",
    "decision": "jaa-ai-analysis-decisions-v5",
    "quality": "jaa-ai-analysis-quality-v4",
    "multiSkillIndependence": "jaa-multi-skill-evidence-coverage-v2",
    "validationStageReceipt": "jaa-validation-stage-receipt-v2",
    "terminalEvent": "jaa-run-terminal-event-v1",
    "evidenceSegmenter": "JAA-EVIDENCE-SEGMENTER-1.0.0",
    "evidenceNormalizer": "JAA-EVIDENCE-NORMALIZER-1.0.0",
    "evidenceQuoteCatalog": "JAA-EVIDENCE-QUOTE-CATALOG-1.0.0",
    "artifactSubmissionToken": "jaa-artifact-submission-token-v1",
    "artifactIdentityReceipt": "jaa-artifact-identity-receipt-v1",
    "hostLifecycle": "jaa-host-control-lifecycle-v3",
    "artifactSubmissionResult": "jaa-artifact-submission-result-v3",
    "terminalOutcomeReducer": "jaa-terminal-outcome-reducer-v1",
    "postArtifactPipeline": "jaa-post-artifact-pipeline-v1",
    "analysisTelemetry": "jaa-analysis-telemetry-v1",
    "artifactCompletion": "jaa-artifact-completion-boundary-v1",
    "issueSnapshot": "jaa-issue-snapshot-profile-v1",
    "canonicalResult": "jaa-canonical-analysis-result-v5",
    "reportDataPackage": "jaa-analysis-report-data-package-v1",
    "htmlTemplate": "jaa-html-report-template-v6",
    "htmlRenderReceipt": "jaa-html-render-receipt-v2",
    "htmlRenderer": "JAA-LOCAL-HTML-RENDERER-1.5.1",
    "ruleSelectionTransaction": "jaa-rule-set-selection-transaction-v1",
    "activeResult": "jaa-active-analysis-result-v1",
    "navigationDecision": "jaa-analysis-navigation-decision-v1"
  },
  "artifactSubmission": {
    "identityOwner": "JAA_LOCAL_BRIDGE",
    "modelReturnsIdentityFields": false,
    "opaqueSingleUseToken": true,
    "tokenScope": ["ANALYSIS_ATTEMPT", "RUN", "THREAD", "TURN"],
    "persistBeforeValidation": true,
    "submittedArtifactFilePattern": "ai-submitted-artifact-attempt-{attempt}.json",
    "identityReceiptPerField": true,
    "duplicateSubmissionAllowed": false,
    "artifactStatuses": ["received", "persisted", "content_validated", "formally_published"],
    "toolMaximumSuccessStatus": "persisted",
    "submissionArtifactStatusOnDurableSave": "persisted",
    "formalArtifactStatusBeforeValidation": "persisted",
    "publishedBeforeFormalValidationAllowed": false,
    "artifactIsAuthoritativeAnalysisCompletion": true,
    "analysisCompletedProgressRequired": false,
    "allowedControlStates": ["INPUT_READY", "ARTIFACT_RECEIVED", "VALIDATING"],
    "allowedTelemetryStates": ["NOT_REPORTED", "STARTED", "IN_PROGRESS", "COMPLETED", "COMPLETED_BY_ARTIFACT"]
  },
  "decisionV5": {
    "root": "DIRECT_JSON_ARRAY",
    "exactRecordCount": true,
    "completeOrderedIndexes": true,
    "modelEvidenceFields": ["evidenceQuoteIds"],
    "modelFreeFormQuoteAllowed": false,
    "modelEvidenceRefAllowed": false,
    "modelEvidenceSegmentIdAllowed": false,
    "modelEvidenceRoleAllowed": false,
    "identityInjectedByJaa": true
  },
  "evidenceQuoteCatalog": {
    "version": "JAA-EVIDENCE-QUOTE-CATALOG-1.0.0",
    "deterministic": true,
    "llmGenerated": false,
    "readableDisplayText": true,
    "exactSourceSubstring": true,
    "rawOffsetsRequired": true,
    "sourcePointerRequired": true,
    "roleEligibilityRequired": true,
    "primaryChangeRequiredForClassifiedSkill": true
  },
  "multiSkillIndependence": {
    "version": "jaa-multi-skill-evidence-coverage-v2",
    "authorityLevel": "QUOTE_IDENTITY_AND_SOURCE_SPAN",
    "parentEvidenceRefMayBeShared": true,
    "sameQuoteMaySupportMultipleSkills": true,
    "distinctPrimaryQuotePreferred": true,
    "exclusivePrimaryQuoteRequiredPerSkill": false,
    "duplicateIdsWithIdenticalSpanCountAsSameQuote": true,
    "distinctSkillSpecificProseRequiredForSharedQuote": true,
    "globalSingleSkillLimitAllowed": false,
    "modelMayDropSupportedSkillToPassGate": false,
    "hostMutationAllowed": false,
    "sharedQuoteWarningCode": "MULTI_SKILL_SHARED_PRIMARY_QUOTE_REVIEW",
    "undistinguishedSharedQuoteBlockerCode": "MULTI_SKILL_SHARED_QUOTE_UNDISTINGUISHED"
  },
  "providerTransport": {
    "version": "bridge-resumable-v4",
    "combinedReadAndAckTool": "jaa_read_and_ack_next_segment",
    "cursor": true,
    "ordered": true,
    "hashVerified": true,
    "durableAck": true,
    "resume": true,
    "eofVerified": true,
    "fixedBatching": false,
    "automaticRepair": false
  },
  "providerLifecycle": {
    "contract": "jaa-host-control-lifecycle-v3",
    "singleRunScopedController": true,
    "secondaryAuthoritativeStateAllowed": false,
    "controlStates": ["ATTEMPT_CREATED", "PROVIDER_DISPATCHED", "INPUT_READING", "INPUT_READY", "ARTIFACT_RECEIVED", "VALIDATING", "CANONICAL_CREATED", "ANALYZED_RESULT_PUBLISHED", "ACTIVE_RESULT_COMMITTED", "REPORT_PACKAGE_CREATED", "HTML_RENDERED", "SQLITE_GATE", "TERMINAL"],
    "analysisTelemetryStates": ["NOT_REPORTED", "STARTED", "IN_PROGRESS", "COMPLETED", "COMPLETED_BY_ARTIFACT"],
    "firstSuccessfulSegmentSetsInputReading": true,
    "finalizeAtomicallySetsInputReady": true,
    "finalizePostconditionRequired": "INPUT_READY",
    "finalizePostconditionErrorCode": "AI_LIFECYCLE_POSTCONDITION_FAILED",
    "duplicateProgressIdempotent": true,
    "recoverableProgressErrorTerminalizesRun": false,
    "progressControlsArtifactAcceptance": false,
    "artifactSetsCompletedByArtifact": true,
    "artifactImpliesAnalysisStarted": true,
    "artifactImpliesAnalysisCompleted": true,
    "singleTerminalEventPerRun": true
  },
  "terminalOutcomeReducer": {
    "contract": "jaa-terminal-outcome-reducer-v1",
    "owner": "SINGLE_HOST_SIDE_REDUCER",
    "callbacksMayDirectlyTerminalize": false,
    "inputs": ["PROVIDER_TERMINAL_EVENT", "ARTIFACT_DURABLE_STATE", "VALIDATION_RECEIPTS", "POST_ARTIFACT_PIPELINE_STATE", "CANCELLATION_STATE"],
    "validArtifactWinsOverLaterProviderFailure": true,
    "artifactDurableSubmissionImplies": {
      "analysisStarted": true,
      "analysisCompleted": true,
      "analysisTelemetry": "COMPLETED_BY_ARTIFACT"
    },
    "providerTerminalMatrix": {
      "COMPLETED_WITH_VALID_ARTIFACT": "CONTINUE_POST_ARTIFACT_PIPELINE",
      "FAILED_WITH_VALID_ARTIFACT": "CONTINUE_POST_ARTIFACT_PIPELINE_WITH_PROVIDER_WARNING",
      "CANCELLED_WITH_VALID_ARTIFACT": "CONTINUE_POST_ARTIFACT_PIPELINE_WITH_PROVIDER_WARNING",
      "COMPLETED_WITHOUT_ARTIFACT": "FAILED_NO_ARTIFACT",
      "FAILED_WITHOUT_ARTIFACT": "FAILED_PROVIDER",
      "CANCELLED_WITHOUT_ARTIFACT": "CANCELLED"
    }
  },
  "postArtifactPipeline": {
    "contract": "jaa-post-artifact-pipeline-v1",
    "idempotencyKeyFields": ["runId", "artifactSha256"],
    "reentrant": true,
    "triggers": ["ARTIFACT_HANDLER", "PROVIDER_TERMINAL_HANDLER", "STARTUP_RECOVERY", "MANUAL_REPROCESS"],
    "stages": ["CONTENT_VALIDATE", "FORMALLY_PUBLISH", "CANONICAL_ASSEMBLY", "ANALYZED_RESULT_PUBLISH", "ACTIVE_RESULT_COMMIT", "REPORT_PACKAGE", "HTML_RENDER", "SQLITE_GATE"],
    "resumeFromDurableReceipts": true,
    "duplicateStageExecutionAllowed": false,
    "productionSideEffectsInOfflineReplayAllowed": false
  },
  "artifactIdentity": {
    "singleSource": "IMMUTABLE_RUNTIME_CONTRACT_REGISTRY",
    "dispatchExpectedAndArtifactInjectionIndependent": true,
    "artifactTimeIdentityInjectedByHost": true,
    "staleApprovedIdentityAccepted": false,
    "perFieldReceiptRequired": true,
    "selfComparisonAllowed": false
  },
  "deliveryStatus": {
    "readOnly": true,
    "idempotentBeforeFinalize": true,
    "idempotentAfterFinalize": true,
    "queryConsumesHandle": false,
    "identicalFinalizeReturnsSameReceipt": true,
    "mismatchedFinalizeFailsClosed": true
  },
  "runLevelInputFailure": {
    "syntheticFailedDecisionDatasetAllowed": false,
    "formalArtifactAllowed": false,
    "canonicalAllowed": false,
    "runLevelStructuredFailureRequired": true,
    "modelReportedTruncationIsHostProof": false
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
    "showLifecycleGrid": false,
    "workspaceShowsInputDelivery": true,
    "workspaceShowsModelAnalysis": true,
    "workspaceShowsArtifactReceipt": true,
    "workspaceShowsContentValidation": true,
    "workspaceShowsFormalPublish": true,
    "workspaceShowsDownstreamArtifacts": true,
    "providerFailedMayHidePersistedArtifact": false
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
    "navigationReceiptsRequired": true,
    "singleLifecycleControllerSnapshotRequired": true,
    "analysisTelemetryRequired": true,
    "artifactSubmissionAttemptExpectedWhenEvidencePresent": true,
    "artifactFinalSummaryFile": "artifact-final-summary.txt",
    "providerFinalAssistantMessageFile": "provider-final-assistant-message.txt",
    "receiptBoundFilesImmutable": true,
    "numericTokenTelemetryRetained": true,
    "credentialRedactionRequired": true,
    "artifactBytesHashReconciliationRequired": true,
    "submissionClassifications": ["submission_received_and_persisted", "submission_validated_but_publish_blocked", "submission_rejected_before_decode", "not_produced_due_to_prior_failure"],
    "existingSubmissionMayBeClassifiedNoSubmission": false
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
    "undefinedErrorPresentationAllowed": false,
    "stages": ["TOKEN_BINDING", "SUBMISSION_DECODE", "DECISION_SCHEMA", "COUNT_INDEX_ORDER", "EVIDENCE_QUOTE_REFERENCE", "SOURCE_ROLE_ATTRIBUTION", "STATUS_SEMANTIC", "QUALITY_GATE", "CANONICAL_ASSEMBLY", "ANALYZED_RESULT_PUBLISH", "ACTIVE_RESULT_COMMIT", "REPORT_PACKAGE", "HTML_RENDER", "SQLITE"],
    "separateStageReceipts": true,
    "stageReceiptContract": "jaa-validation-stage-receipt-v2",
    "notRunOutcome": "NOT_RUN_DUE_TO_PRIOR_FAILURE",
    "testIsolationNotRunOutcome": "NOT_RUN_BY_TEST_ISOLATION",
    "downstreamPassedWithoutExecutionAllowed": false,
    "delegatedPassAllowed": false,
    "placeholderPassAllowed": false,
    "passedRequiresDurableStageEvidence": true,
    "firstFailedValidationStageRequired": true,
    "lifecycleReceiptReconciliationRequired": true,
    "artifactReceiptHashReconciliationRequired": true,
    "rootErrorStageConsistencyRequired": true,
    "successRequiresNullFailureFields": true,
    "qualityGateRootErrorCode": "AI_DECISION_QUALITY_GATE_BLOCKED"
  },
  "boilerplateGate": {
    "allowedFields": ["evidenceExplanation", "negativeChecks", "skillRationale", "recordRationale"],
    "sourceQuoteTextAllowed": false,
    "exactSourceSubstringAllowed": false,
    "parentEvidenceRefAllowed": false,
    "findingMustIdentifyComparedModelField": true,
    "exactDuplicateRatioWarningThresholdExclusive": 0.50,
    "metricWithoutFindingAllowed": false,
    "warningBlocksSqliteUntilDurableAcceptance": true
  },
  "catalogDetailStatus": {
    "deterministic": true,
    "classifiedRequiresCompleteDetailForEveryRetainedSkill": true,
    "missingAnyRetainedSkillDetailStatus": "CATALOG_DETAIL_MISSING",
    "mismatchFindingCode": "CATALOG_DETAIL_STATUS_MISMATCH",
    "mismatchSeverity": "BLOCKER",
    "hostMayRewriteDecisionStatus": false,
    "hostMayRewriteSkillFindings": false
  },
  "runtimeIdentity": {
    "applicationVersion": "0.3.36",
    "promptIdentity": "JAA-CHATGPT-ZH-TW-0.3.36",
    "promptTemplateVersion": "0.3.36-zh-TW-v17",
    "bridgeIdentity": "0.3.36-bridge-v16",
    "allFieldsSelfValidatedBeforeDispatch": true,
    "staleApplicationOrPromptIdentityAllowed": false,
    "immutableRegistryRequired": true,
    "dispatchExpectedAndArtifactInjectionIndependent": true
  },
  "terminalLifecycle": {
    "contract": "jaa-run-terminal-event-v1",
    "singleTerminalEventPerRun": true,
    "terminalEventType": "run_terminal",
    "primaryErrorIsTerminal": false,
    "reducerOwner": "jaa-terminal-outcome-reducer-v1",
    "callbacksMayDirectlyTerminalize": false,
    "idempotencyKeyFields": ["runId", "terminalState", "rootErrorCode"]
  },
  "liveProviderValidation": {
    "defaultEnabled": false,
    "explicitOptInEnvironmentVariable": "JAA_ENABLE_LIVE_PROVIDER_TEST",
    "requiredOptInValue": "1",
    "command": "npm.cmd run test:live:v0.3.36:17",
    "localSelectedInputs": ["PENDING_DATASET_JSON", "RULE_SET_MANIFEST", "COMMON_RULES", "SKILL_CATALOG", "HTML_REPORT_TEMPLATE"],
    "providerInputs": ["PENDING_DATASET_JSON", "RULE_SET_MANIFEST", "COMMON_RULES", "SKILL_CATALOG"],
    "htmlTemplateLocalOnly": true,
    "expectedRecordCount": 17,
    "singlePrimaryTurn": true,
    "productionSqliteAllowed": false,
    "activeResultReplacementAllowed": false,
    "isolatedRunRootRequired": true,
    "missingPrerequisiteOutcome": "NOT_RUN",
    "offlineReplayMaySatisfyLiveRequirement": false
  },
  "v0335ArtifactReplay": {
    "sourceBundle": "jira-activity-analyzer-debug-folder-20260825_103041.7z",
    "offlineOnly": true,
    "providerContactAllowed": false,
    "productionSqliteAllowed": false,
    "activeResultReplacementAllowed": false,
    "expectedFileCount": 4,
    "expectedRecordCount": 17,
    "expectedBytes": 324945,
    "expectedSegments": 82,
    "expectedDecisionCount": 17,
    "expectedSkillFindingCount": 40,
    "expectedEvidenceReferenceCount": 44,
    "expectedUniqueEvidenceQuoteCount": 40,
    "expectedStatusDistribution": {"CATALOG_DETAIL_MISSING": 13, "UNKNOWN": 1, "EXCLUDED": 3},
    "asRecordedExpectedOutcome": "IDENTITY_MISMATCH",
    "asRecordedStaleIdentity": {
      "applicationVersion": "0.3.34",
      "promptIdentity": "JAA-CHATGPT-ZH-TW-0.3.34",
      "bridgeIdentity": "0.3.34-bridge-v14"
    },
    "correctedHostIdentityReplay": true,
    "preserveModelOwnedArtifactBytes": true,
    "requiredIsolatedOutputs": ["CANONICAL_RESULT", "ANALYZED_RESULT", "REPORT_DATA_PACKAGE", "HTML"],
    "sqliteReceiptResult": "NOT_RUN_BY_TEST_ISOLATION"
  },
  "diagnosticPipeline": {
    "decodableSubmissionRequired": true,
    "formalValidationMayFail": true,
    "diagnosticPackageRequired": true,
    "diagnosticHtmlRequired": true,
    "canonicalAllowed": false,
    "activeResultReplacementAllowed": false,
    "resultsNavigationAllowed": false,
    "sqliteAllowed": false
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
  "htmlLifecycle": {
    "renderer": "JAA-LOCAL-HTML-RENDERER-1.5.1",
    "requiredReceiptCapability": "LAYERED_VALIDATION_RECEIPTS_V2",
    "autoAndManualUseSameService": true,
    "successReceiptRequired": true,
    "failureReceiptRequired": true,
    "canonicalSuccessWithHtmlFailureOverallStatus": "completed_with_report_error",
    "falseSuccessLogAllowed": false,
    "debugCollectActualHtmlAndReceipt": true
  },
  "templateCapabilities": {
    "required": ["REPORT_DATA_PACKAGE_V1", "UNIQUE_ISSUE_SNAPSHOT_V1", "SNAPSHOT_FIELD_STATE_V1", "DECLARATIVE_STATISTICS_DSL_V1", "MULTI_TEMPLATE_OFFLINE_RENDER_V1", "AI_SUBMITTED_ARTIFACT_DIAGNOSTIC_V1", "ARTIFACT_IDENTITY_RECEIPT_V1", "EVIDENCE_QUOTE_CATALOG_V1", "LAYERED_VALIDATION_RECEIPTS_V2"],
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

## 7. Report、Snapshot 與 HTML 邊界

1. Analyzed Result 維持 Pending Dataset 為基礎，只增加分析與追溯欄位；不在每筆 event 重複完整 Snapshot。
2. 原始 Jira database 保持 authoritative snapshot source。
3. Report Data Package 每個跨 Server Unique Issue 只保存一份 Snapshot。
4. HTML 直接輸入只有 Package 與 Template；render 時不得查 Jira／SQLite／AI DB、不得呼叫 Provider。
5. Template v1.5.1 是 allowlisted declarative DSL，不允許 arbitrary JavaScript、SQL、任意 JSONPath 或 remote resource。
6. Event 與 Unique Issue 統計的 population 必須分開標示。
7. Diagnostic Package／HTML 可呈現 AI submission、Identity Receipt、Quote resolution 與 findings，但不得冒充 Formal Package。
8. Package 與 Template 必須共同提供／要求 `LAYERED_VALIDATION_RECEIPTS_V2`，Capability 不符須在 Provider dispatch 前 fail closed。
9. 自動與手動 HTML 共用 Renderer 1.5.1；成功寫 success receipt，失敗寫 failure receipt，兩者都進 Debug Folder。
10. Canonical 成功但 HTML 失敗時整體狀態為 `completed_with_report_error`，Results 仍可檢視 Canonical，但 UI／log 不得宣稱 HTML 已建立。

## 8. Provider 正式輸入與輸出

正式 Provider 輸入仍為：

1. Model Analysis Package JSON
2. 本 Manifest
3. Common Rules v1.6.5
4. Skill Catalog v0.3.1

HTML Template v1.5.1 不送 ChatGPT。模型輸出為精確 N 筆 Decision v5 direct JSON array，每個 Skill Finding 只引用 `evidenceQuoteIds[]`，加上繁體中文 Analysis Report 與 final assistant summary。模型必須保留所有有充分證據的 Skill，不得為規避 Gate 將每筆限制成單一 Skill；同一 Quote 支援多技能時，各 Skill 必須有具體且可區分的 Explanation／Negative Checks／Rationale。模型透過 opaque token 提交，不回傳 Run／source／rule identity，不負責 Package、統計、HTML、SQLite 或 shell 檔案 I/O。

### 8.1 Host control lifecycle、Terminal Reducer 與 analysis telemetry

正式 required control lifecycle 為：

```text
ATTEMPT_CREATED → PROVIDER_DISPATCHED → INPUT_READING → INPUT_READY
→ ARTIFACT_RECEIVED → VALIDATING → CANONICAL_CREATED
→ ANALYZED_RESULT_PUBLISHED → ACTIVE_RESULT_COMMITTED
→ REPORT_PACKAGE_CREATED → HTML_RENDERED → SQLITE_GATE → TERMINAL
```

模型進度另外保存為 optional telemetry：

```text
NOT_REPORTED | STARTED | IN_PROGRESS | COMPLETED | COMPLETED_BY_ARTIFACT
```

- 所有 control state 只能由同一 Run-scoped Host Controller 擁有，只有 Terminal Outcome Reducer 能決定 terminal outcome。
- Provider callback、Bridge tool handler、UI callback 與 artifact callback 不得直接寫入 terminal state。
- 第一個成功 segment read 必須進入 `INPUT_READING`。
- finalize 成功與 `INPUT_READY` 必須是同一 atomic Host operation，並在成功回覆前驗證 postcondition。
- Delivery status 是唯讀查詢；finalize 前後均可重複呼叫。
- 完全相同的 finalize 重送回傳同一 immutable receipt。
- Progress event 只屬 telemetry，不控制 Artifact acceptance。
- 完整有效且 durable 的 Artifact submission 是 analysis start／completion boundary，從 `INPUT_READY` 進入 `ARTIFACT_RECEIVED`，並強制推導 `analysisStarted=true`、`analysisCompleted=true` 與 `COMPLETED_BY_ARTIFACT`。
- Provider terminal event 到達時必須套用固定矩陣；只要已有合法 Artifact，就繼續 Post-Artifact pipeline，不得以 `AI_ANALYSIS_NOT_STARTED` 或 provider failure 覆寫。
- Post-Artifact pipeline 使用 `runId + artifactSha256` 為 idempotency key，可由 artifact handler、provider terminal handler、startup recovery 與 manual reprocess 重入。
- Artifact 必須依序使用 `received`、`persisted`、`content_validated`、`formally_published`；提交工具回覆最多為 `persisted`。
- `artifact-final-summary.txt` 與 `provider-final-assistant-message.txt` 分別保存且不可互相覆寫。
- identity mismatch、跨 Run handle、非法 cursor／ACK 或不一致 finalize 才 fail closed。

### 8.2 Run-level failure 與 Decision v5

若模型無法存取完整輸入、Provider context 或 required segments，JAA 必須保存 Run-level structured failure；不得要求或接受 N 筆內容相同的 `FAILED` Decisions 冒充分析結果。單筆 `FAILED` 僅用於該 record 自身的不可恢復錯誤，且固定 `confidence=0`、`skillFindings=[]`、`unknownReasons=[]`。

### 8.3 Offline 與 Live 驗證

- 預設測試與 Debug Replay 為 offline，不聯絡 ChatGPT、不消耗 Provider token。
- Live Provider E2E 必須由操作者以 `JAA_ENABLE_LIVE_PROVIDER_TEST=1` 明確啟用，並提供實際 Pending JSON 與四份受控 MD 路徑。
- Live 測試在本機驗證五份輸入；只把 Pending JSON、Manifest、Common Rules、Catalog 四份送給 Provider，Template 保持 local-only。
- Live 測試使用 isolated Run Root，不寫 production SQLite、不取代 Active Result、不使用 batch／repair／retry／fallback。
- 缺少 opt-in、設定、檔案或 Managed ChatGPT authentication 時，結果只能是 `NOT RUN`，不得回報 PASS。
- v0.3.35 真實 Debug Bundle replay 分成兩軌：as-recorded forensic replay 必須如實檢出 stale Artifact Identity；corrected-host-identity replay 不改模型原始內容，在隔離環境建立 Canonical／Analyzed Result／Package／HTML，SQLite receipt 使用 `NOT_RUN_BY_TEST_ISOLATION`。

## 9. Fail-closed 規則

下列任一情況不得 dispatch Provider：

- Active set 不完整或無法 reopen
- 任一 role 的 basename／version／bytes／hash 不符
- Manual set 混入 bundled 或 role 不一致
- Manifest binding 失敗
- Pending dataset receipt 不完整
- Effective instruction 無法確定

下列任一情況不得建立正式 Canonical／SQLite：

- submission token／scope／single-use binding 不合格
- Decision contract 不合格
- Quote ID／source／role／raw trace 無法驗證
- semantic／quality gate 阻斷
- stable identity、source hash 或 count 不符
- artifact hash／flush evidence 不完整

若 AI submission 可解碼，上述 formal failure 仍必須產生 aggregate findings 與 Diagnostic Package／HTML；但禁止 Active Result replacement、Results navigation 與 SQLite。

Quality Gate 阻斷時，root error 必須是 `AI_DECISION_QUALITY_GATE_BLOCKED`，`firstFailedValidationStage` 必須是 `QUALITY_GATE`。Quality Gate receipt 必須為 `FAILED`，後續未執行階段必須是 `NOT_RUN_DUE_TO_PRIOR_FAILURE`。Submission durable 保存只能記為 `persisted`，不得在正式驗證前宣稱 `published`。

Quality Gate 為 WARNING 時，Canonical／Active Result／Report Package／帶警告 HTML 可以建立，但 SQLite receipt 必須為 `BLOCKED_PENDING_WARNING_ACCEPTANCE`；人工接受後才可使用同 Run 的 idempotent SQLite retry。成功 Run 的 `firstFailedStage`、`rootErrorCode`、`rootErrorStage` 與 `rootErrorMessage` 必須全為 null，不得殘留 lifecycle transition 訊息。

## 10. Debug 與稽核

Debug collector 以 `analysisAttemptId` 為第一層 correlation，只有透過 `linkedRunId` 收集 Run。Role files 由 receipt 的 exact versioned basename 收集，不使用無版本 alias。必須收入實體 AI submitted artifact、token／identity receipt（不含完整 token）、唯一 Host Controller snapshot、Terminal Reducer input/output、Post-Artifact receipts、analysis telemetry、Quote Catalog、layered receipts、`artifact-final-summary.txt`、`provider-final-assistant-message.txt`、`navigation-decisions.jsonl`、quality findings、warning acceptance audit、SQLite receipt、Runtime Identity receipt、實際 Formal／Diagnostic／手動重繪 HTML、成功或失敗 HTML receipt 與 completeness manifest；不得只存包外 path。數字型 token usage 必須保留原值，credential／token／nonce 仍需遮罩。缺檔理由必須依真實 lifecycle。已有 submission 時不得標示 `not_applicable_no_submission`；應依事實使用 `submission_received_and_persisted` 或 `submission_validated_but_publish_blocked`。Receipt 已綁定檔案的 bytes／SHA-256 必須與 Debug 實體一致。

## 11. Compatibility

### 11.1 相容

- Common Rules v1.6.5
- Catalog v0.3.1
- Decision v5
- Evidence Quote Catalog 1.0.0
- Artifact Submission Token v1
- bridge-resumable-v4
- Canonical v5
- Report Data Package v1
- HTML Template v1.5.1／contract v6
- Renderer 1.5.1

### 11.2 不相容或必須拒絕

- 無版本或版本不符的角色檔
- hash／bytes 與本 Manifest 不符的角色檔
- 混合 Bundled／Manual set
- Decision v2／v3／v4 artifact 冒充 v5 formal result
- 未通過 Active Result gate 的 Run 直接成為 Results active dataset
- Report HTML 在 render 時直接查詢 live source

## 12. 版本紀錄

### v0.8.5

- Target JAA v0.3.36。
- Common Rules 進版 v1.6.5，新增單一 Terminal Outcome Reducer 與固定 Provider terminal／Artifact matrix。
- Durable Artifact 強制推導分析已開始／完成，並以 `runId + artifactSha256` 重入 Post-Artifact pipeline。
- Artifact Identity 改以 immutable Runtime Contract Registry 為唯一來源，dispatch expected 與 artifact-time injection 獨立驗證。
- Artifact 狀態統一為 received／persisted／content_validated／formally_published；final summary 與 provider final response 分檔且不可覆寫。
- 新增 lifecycle／receipt／root error／artifact hash reconciliation 與 numeric token telemetry truth。
- v0.3.35 真實 17 筆 Debug Bundle 執行 as-recorded forensic 與 corrected-host-identity 雙軌 replay。
- Bridge 進版 `0.3.36-bridge-v16`；Transport v4、Decision v5、Catalog v0.3.1、Template／Renderer 1.5.1 維持不變。

### v0.8.4

- Target JAA v0.3.35。
- Common Rules 進版 v1.6.4，分離 required control lifecycle 與 optional analysis telemetry。
- 第一段讀取進入 `INPUT_READING`；finalize 對同一 Controller 原子更新並驗證 `INPUT_READY` postcondition。
- 有效 Artifact submission 成為分析完成權威邊界，不再依賴 progress completed checkpoint。
- 禁止 validation stage 9–14 delegated／placeholder PASS。
- 新增 v0.3.34 真實 17 筆 Artifact 的隔離 replay 與 submission／UI truth。
- Bridge 進版 `0.3.35-bridge-v15`；Transport v4、Decision v5、Catalog v0.3.1、Template／Renderer 1.5.1 維持不變。

### v0.8.3

- Target JAA v0.3.34。
- Common Rules 進版 v1.6.3，建立 finalize／INPUT_READY／ANALYSIS_STARTED 的唯一生命週期。
- Delivery Status 改為 finalize 前後唯讀 idempotent；相同 finalize 重送回傳同一 receipt。
- Progress 改為 nonfatal observability；可恢復的重複或停滯不得 terminalize Run。
- 對齊 Decision v5 `FAILED` 矩陣，整體輸入問題改為 Run-level structured failure。
- Validation Receipt 強制因果排序並保存一致的 root error 與 stage truth。
- 新增 Offline Replay 與明確 opt-in 的真實 17 筆 Live Provider E2E；不得互相冒充。
- Bridge 進版 `0.3.34-bridge-v14`；Transport v4、Decision v5、Catalog 279 Skills、Template／Renderer 1.5.1 維持不變。

### v0.8.2

- Target JAA v0.3.33。
- 導入 Multi-skill Evidence Coverage v2、Catalog Detail deterministic status、Duplicate Ratio Warning、SQLite Warning Gate 與 Validation Receipts V2 HTML 能力。
- 自動與手動 HTML 共用 Renderer 1.5.1。

### v0.8.1

- Target JAA v0.3.32。
- Multi-skill independence 改以 Quote identity／source span 判定，不以父層 `evidenceRef` 判定。
- 每個 Multi-skill Finding 要求 Exclusive PRIMARY_CHANGE Quote。
- Boilerplate Gate 只檢查模型文字欄位。
- Validation Stage Receipt 進版 v2，新增單一 `run_terminal` event。

### v0.8.0

- Target JAA v0.3.26。
- 新增 JAA-owned Approved Artifact Identity、opaque single-use submission token 與逐欄位 Identity Receipt。
- 新增 AI submission persist-before-validate。
- 進版 Decision v5，模型只引用 `evidenceQuoteIds[]`。
- 新增 deterministic Evidence Quote Catalog 1.0.0。
- 新增 layered validation receipts 與 Formal／Diagnostic 分流。
- 新增 Diagnostic Package／HTML，禁止 Canonical／SQLite／Results navigation。
- Provider transport 進版 `bridge-resumable-v3`。
- Debug 收入實體 submission、identity、quote、navigation 與 diagnostic evidence。
- Catalog 279 Skills 內容不變。

### v0.7.0

- Target JAA v0.3.25。
- 新增 per-role explicit selection、Draft／Active atomic transaction、Attempt-first、Active Result、Navigation Gate 與 linked-run-only Debug。

### v0.6.0

- Target JAA v0.3.24。
- 新增 Decision v4、Evidence Segment、Report Data Package 與 Template v1.4.0 綁定。

---

本文件狀態為 `review-draft`。JAA 必須逐 Run 保存本 Manifest 的實際 bytes／SHA-256、三份 model-visible 輸入與 local-only Template receipt，才能重現當次分析與報告。
