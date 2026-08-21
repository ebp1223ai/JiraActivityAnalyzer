# Jira Activity Analyzer v0.3.28 — 正式完整 Codex 實作 Prompt

## 0. 文件用途

請在既有 Jira Activity Analyzer repository 完成 `v0.3.28`。本文件是可直接交付 Codex 執行的完整實作、驗證、封裝與 Git 交付指令，不是概念草稿。

- Repository：`F:\AI\JiraActivityAnalyzer`
- Target Version：`0.3.28`
- Branch：`feat/v0.3.28-runtime-manifest-contract-preflight-root-error`
- Annotated Tag：`v0.3.28`
- UI／Prompt／報告預設語言：繁體中文
- Provider：`chatgpt_codex`
- Bundled Codex：固定官方版 `0.147.0`
- Prompt identity：`JAA-CHATGPT-ZH-TW-0.3.28`
- Prompt template version：`0.3.28-zh-TW-v9`
- Bridge：`0.3.28-bridge-v10`
- Provider transport：`bridge-resumable-v3`
- Decision Contract：`jaa-ai-analysis-decisions-v5`
- Evidence Quote Catalog：`JAA-EVIDENCE-QUOTE-CATALOG-1.0.0`
- Artifact Submission Token：`jaa-artifact-submission-token-v1`
- Artifact Identity Receipt：`jaa-artifact-identity-receipt-v1`
- Bridge Execution Context：`jaa-bridge-execution-context-v1`
- Model Delivery Handle：`jaa-model-delivery-handle-v1`
- Bridge Tool Call Evidence：`jaa-bridge-tool-call-evidence-v1`
- Runtime Contract Registry：`jaa-runtime-contract-registry-v1`
- Provider Dispatch Gate：`jaa-provider-dispatch-gate-v1`
- Runtime Manifest Receipt：`jaa-runtime-manifest-receipt-v1`
- Canonical Contract：維持 `jaa-canonical-analysis-result-v5`
- Report Data Package：維持 `jaa-analysis-report-data-package-v1`
- HTML Template Contract：`jaa-html-report-template-v6`
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.0`

基線是已完成的 `v0.3.27`。完整保留 v0.3.27 已證明有效的 Host-owned BridgeExecutionContext、zero-identity dynamic tools、Thread／Turn bounded binding、opaque delivery handle、Artifact Token、Decision v5、Evidence Quote Catalog、14 層驗證、Diagnostic HTML、`bridge-resumable-v3`、四檔獨立選取、Navigation Gate、Active Result、Report Data Package、SQLite Gate、Bundled Codex 與 lifecycle-aware Debug evidence。本版只修正真實 Managed OAuth 測試揭露的 Runtime Manifest transport identity 殘留、Provider Dispatch Gate、實際 Tool Response 驗證、root error 傳播及 Run 建立前仍出現的 `undefined: undefined`；不得改變技能分類語意、Decision 結構、HTML 規格或資料庫正式 Gate。

## 1. 執行原則

開始修改前，完整檢查 repository、`AGENTS.md`、package scripts、目前 branch／HEAD／remote／工作樹、v0.3.27 實作與報告。使用者提供的 `jira-activity-analyzer-debug-folder-20260821_141728.7z` 是本版必要 replay input，只能唯讀分析，不得改寫原始證據；若交付環境未提供該檔，先清楚報告缺檔，不得用其他 Debug、fixture 或敘述冒充真實 replay。

你必須自行完成：

1. 從實際程式碼與 Debug evidence 定位根因，不得只根據錯誤文字猜測。
2. 建立單一資料契約與可測試的生命週期，不得只修 UI 表象。
3. 修改 Electron main／preload／renderer、IPC、Bridge、Runtime Contract Registry、Manifest factory、Provider Dispatch Gate、dynamic tool response validator、Prompt、Run archive、Error Normalizer、Debug collector 與必要 migration；Decision v5、Evidence Quote Catalog、HTML renderer 與 SQLite 僅能做必要 regression 修正。
4. 新增 production-handler、packaged-ASAR、v0.3.27 failure replay 與 regression 測試。
5. 執行 typecheck、test、build、dist、ASAR 與隔離啟動驗證。
6. 產生正式報告、commit、annotated tag 與 push。

若 Managed OAuth、真實 Jira、production SQLite、17／117 筆正式分析或乾淨 Windows GUI 無法安全執行，必須標記 `Manual Validation Pending`；不得以 fixture、mock、靜態檢查或估算冒充真實驗證。

## 2. 不可破壞的邊界

1. 保留使用者全部 tracked dirty changes 與 untracked files。
2. 禁止 `git reset --hard`、`git clean`、強制 checkout、強制 push、未授權 stash、刪除或覆寫使用者資料。
3. 不得提交 token、OAuth credential、session、cookie、真實 Jira 私密資料、production database 或 Debug Bundle。
4. 不得終止使用者已在執行的 JAA、Codex 或 Electron process；啟動驗證使用隔離 profile。
5. 所有 mismatch、綁定不明、缺檔、hash 異常與 transaction failure 皆 fail closed；禁止 silent fallback。
6. 失敗的 AI submission 可作診斷檢視，但不得冒充正式 Canonical／Analyzed Result 或寫入正式 SQLite。

## 3. 已確認的 v0.3.27 真實失敗事實

請先以程式碼與唯讀 replay 重現下列事實：

1. 正式 Run 為 `analysis_64ffcb94-b98d-4bbe-98d3-b6ee341fea77`，Provider Thread 為 `01a022f7-20f9-7a62-bdaf-d1cbc73cbdd9`，Turn 為 `01a022f7-22de-7a03-8eb3-b859cca95e0e`。
2. 四份 Active MD 與 17 筆來源資料皆通過本機驗證；本次失敗與檔案選擇、bytes、SHA-256 或 Manifest binding 無關。
3. v0.3.27 的 `jaa_get_input_manifest({})` 已成功：arguments 為空、Context resolution `RESOLVED`、Thread／Turn 均 `BOUND`、duration 43 ms，證明 v0.3.26 Run ID 契約問題已修復。
4. Opaque delivery handle 已成功簽發，handle receipt 顯示 scope／Thread／Turn／manifest hash／expiry 正常，完整 handle 未持久化。
5. Bridge Contract、Input Transport Contract、Effective Instruction、Request Package 全部要求 `bridge-resumable-v3`。
6. 唯獨實際 `jaa_get_input_manifest` 回傳 JSON 為 `schemaVersion=jaa-model-input-manifest-v3`、`transportProtocol=bridge-resumable-v2`，形成 production tool response 內部矛盾。
7. ChatGPT 正確比較 expected v3 與 observed v2，依 fail-closed 停止；只呼叫一次 Manifest，沒有呼叫 52 個 segment read／ACK tools。
8. Model Delivery 為 0/4、分析為 0/17、`analysisStarted=false`、AI submission 未執行，沒有 Decision、Canonical、Analyzed Result、HTML 或 SQLite。
9. JAA 沒有在回傳前驗證自己的 Manifest，也沒有取得結構化 protocol mismatch，因此最後仍以 `AI_MODEL_INPUT_DELIVERY_INCOMPLETE` 當 root，真正應是 `AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH`。
10. v0.3.27 Debug completeness 改善已生效：`missingRequiredFileCount=0`、Template Snapshot 正確為 present、Diagnostic Package 正確標示 `not_applicable_no_model_delivery`。
11. 一般 Debug Log 於正式 Run 建立前仍出現 `[ERROR] undefined: undefined`，表示 Error Normalizer 尚未涵蓋 Active Rule revalidation、Pending Dataset preflight、ChatGPT status、頁面初始化或其他 pre-run renderer／IPC 路徑。
12. 自動化測試只證明常數、fixture、source schema 或 transport benchmark，沒有真正執行 production `jaa_get_input_manifest({})` 並 decode `contentItems[0].text`，也沒有對 packaged ASAR handler 做相同驗證。

請產生根因報告，列出 stale v2 的實際 source symbol／factory／hard-coded location、production handler call chain、source 與 packaged ASAR response、各 identity state source、錯誤傳播鏈及 `undefined: undefined` 的實際入口。不得只修改 Prompt、忽略版本 mismatch 或要求 ChatGPT 繼續。

## 4. 已採納且不得擅自變更的十項決策

### 決策一：單一 Runtime Contract Registry

App、Prompt、Bridge、Transport、Manifest Schema、Decision、Quote Catalog 與 Renderer identity 必須由 immutable `jaa-runtime-contract-registry-v1` 單一提供。Effective Instruction、Bridge Contract、Input Contract、Request Package、Tool descriptions、production Manifest、Run Manifest、Debug、UI 與 package metadata 禁止各自硬編碼。

### 決策二：唯一 Production Manifest Factory

建立唯一 `createModelInputManifestV3(runtimeContract, sourceReceipt, segments)`；fixture、source runtime 與 packaged runtime 共用同一 production factory。正式輸出固定為 `jaa-model-input-manifest-v3` + `bridge-resumable-v3`，禁止從 v2 factory 繼承、建立後覆寫或由 handler 另組一份。

### 決策三：Provider Dispatch Gate

正式聯絡 ChatGPT 前，以 production code path 建立並驗證實際 Manifest、tool response、Registry、Bridge／Input contracts、Prompt identity、bytes／hash、file／record／segment counts。只有 receipt `providerDispatchAllowed=true` 才能 dispatch；內部 mismatch 必須在本機停止，避免浪費 Provider Turn。

### 決策四：Tool Response 回傳前自我驗證

`jaa_get_input_manifest({})` 在建立 `contentItems[0].text` 後、回傳模型前，必須重新 decode 並驗證實際 serialized JSON。protocol、schema、handle contract、token contract、counts、segments、bytes 或 hash 不一致時工具直接失敗，不得把錯誤 Manifest 交給 ChatGPT。

### 決策五：Host 建立 Root Error

Runtime Manifest mismatch 必須由 JAA 建立 `AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH`／`MODEL_INPUT_MANIFEST_GENERATION` root failure；`AI_MODEL_INPUT_DELIVERY_INCOMPLETE`、`AI_ANALYSIS_NOT_STARTED`、`AI_ARTIFACT_NOT_SUBMITTED` 只能列入 derived consequences。禁止依靠解析 ChatGPT 最終文字才能得知根因。

### 決策六：Production Handler Integration Test

測試必須真正建立 Context、綁定 Thread／Turn、呼叫 production `jaa_get_input_manifest({})`、decode `contentItems[0].text` 並驗證 actual JSON；不得只測 fixture、constant、schema object 或 benchmark helper。

### 決策七：Packaged ASAR Contract Test

dist 後從 packaged ASAR／resources 載入實際 `analysis-bridge-v0328.cjs`，執行同一 handler test。Source PASS 但 packaged response 不一致時 dist 必須失敗。

### 決策八：Stale v2 Runtime Scan

掃描 source、generated bridge、dist、resources 與 app.asar 中的 `bridge-resumable-v2`。Production runtime 命中立即阻擋；migration、compatibility parser、benchmark、regression fixture 或歷史報告只能透過逐項 allowlist 保留並寫明理由。

### 決策九：Pre-run Error Normalizer 全覆蓋

除 Run／Bridge 外，Active Rule revalidation、Pending Dataset preflight、ChatGPT status refresh、頁面初始化、renderer event handler、preload IPC rejection、analysis start validation 與 Debug export 全部必須使用共用 Error Normalizer；任何路徑不得產生 `undefined: undefined`。

### 決策十：保留 v0.3.27 成果並以真實順序驗證

不得退化 Host-owned Context、zero-identity tools、bounded binding、opaque handle、Decision v5、Artifact Token、Quote Catalog、14 層驗證、Diagnostic HTML 與 lifecycle-aware Debug。驗證順序固定為 v0.3.27 failure replay → source production handler → packaged handler → 17 筆真實 Managed OAuth；只有 17 筆成功後才可執行真實 117 筆。

## 5. 既有架構決策維持不變

1. 固定內建官方 Codex `0.147.0`，啟動時驗證版本、路徑與 SHA-256。
2. 不搜尋 PATH、不使用外部 Codex、不自動下載、禁止 external fallback。
3. 維持 JAA Managed ChatGPT／OAuth 與 Codex app-server；不新增 API key 替代流程。
4. 單一 Run、request、thread、主要 turn；無固定 batch、逐筆 request／turn、自動 repair。
5. 對話與 Provider stream 只保存於 JAA 本機，不要求同步 ChatGPT 網頁。
6. Provider 輸入維持 `1 JSON + 3 MD`；HTML Template 為 local-only，不送 ChatGPT。
7. Provider stream／conversation 維持 append-only、buffered durable flush。
8. Rule Selection、Attempt-first、Navigation Gate、Active Result、Report Data Package v1、Canonical v5、Snapshot、Results／Workspace 分工與 SQLite Gate 不退化。
9. Failed、Partial、Cancelled、diagnostic-only 或未通過 formal gate 不得寫入正式 SQLite，不得取代 Active Result。

## 6. 正式配套文件

本次實作、測試與封裝必須使用：

- `Skill_Analysis_Rule_Set_Manifest_v0.8.0.md`
- `Skill_Classification_Common_Rules_v1.6.0.md`
- `Skill_Catalog_v0.3.1.md`，必須與本次 v0.3.27 Active Set byte-for-byte 相同
- `Skill_Analysis_HTML_Report_Template_v1.5.0.md`

每份 MD 的版本必須同時出現於檔名與 machine-readable metadata。Manifest v0.8.0 必須綁定其餘三份的 exact basename、version、bytes、SHA-256 與 consumer。Catalog 不得因 BOM、換行或格式化改變 bytes。

本版四份 MD 全部維持 v0.3.27 Active Set 原始 bytes，不進版、不格式化、不正規化換行、不補 BOM。Codex 必須先計算實際 bytes／SHA-256 並與 Manifest binding 對照；若不一致立即停止，不得自行改寫 Manifest 或任一 MD 使其勉強通過。

## 7. BridgeExecutionContext、Approved Artifact Identity 與 Token

### 7.1 BridgeExecutionContext

Preflight 成功且 Provider dispatch 前，由 Electron main process 建立一次性的 `jaa-bridge-execution-context-v1`：

```text
contextVersion
toolRegistrationId
analysisAttemptId
internalRunId
provider
model
sourceInputIdentity
rulesSnapshotId
expectedRecordCount
sessionNonceHash
contextState
threadBindingState
turnBindingState
providerThreadId
providerTurnId
createdAtUtc
expiresAtUtc
terminalAtUtc
```

要求：

1. `internalRunId`、Attempt、Request、Thread、Turn 與 nonce 永遠不得出現在 model-visible tool schema。
2. 每個 Run 使用獨立 tool registration／handler closure，不得共用可被下一個 Run 覆寫的 global mutable currentRun。
3. Context 狀態至少為 `CREATED → TOOLS_REGISTERED → THREAD_BOUND → TURN_BOUND → DELIVERY_ACTIVE → DELIVERY_COMPLETED → TERMINAL`。
4. 只有 `TURN_BOUND` 後可執行 Manifest tool；若事件順序造成 call 提早到達，handler 必須等待有界 binding barrier，超時回傳 `AI_BRIDGE_CONTEXT_NOT_BOUND`，不得要求模型改猜 Run ID。
5. Context terminal、cancelled、expired 或 provider restart 後，所有 handle／token 立即失效。
6. 同一 tool call 必須能從 `toolRegistrationId + callId` 唯一解析到一個 Context；0 或多於 1 個 match 皆 fail closed。

必要錯誤碼：

```text
AI_BRIDGE_CONTEXT_NOT_BOUND
AI_BRIDGE_CONTEXT_AMBIGUOUS
AI_BRIDGE_CONTEXT_EXPIRED
AI_BRIDGE_THREAD_BINDING_MISMATCH
AI_BRIDGE_TURN_BINDING_MISMATCH
AI_BRIDGE_TOOL_REGISTRATION_MISMATCH
```

### 7.2 Model Delivery Handle

`jaa_get_input_manifest({})` 成功後，JAA 產生 `jaa-model-delivery-handle-v1`。完整 handle 只可在 model tool argument／result 的受控通道中存在；durable evidence 僅保存 hash、短 prefix、scope、created／expiry／consumed state。

Handle 必須綁定 BridgeExecutionContext、Thread、Turn、manifest hash、source input receipt 與 transport version。錯誤、過期、跨 Context、跨 Turn、已完成或 replay handle 必須拒絕，必要錯誤碼：

```text
AI_MODEL_DELIVERY_HANDLE_MISSING
AI_MODEL_DELIVERY_HANDLE_INVALID
AI_MODEL_DELIVERY_HANDLE_EXPIRED
AI_MODEL_DELIVERY_HANDLE_SCOPE_MISMATCH
AI_MODEL_DELIVERY_HANDLE_REPLAYED
```

### 7.3 ApprovedArtifactIdentity

Preflight 成功後由 JAA main process 建立 source-bound identity；Provider Thread／Turn 欄位只能由受信任 Provider events 各綁定一次。完成 `TURN_BOUND` 後 identity 封存為 immutable object：

```text
identityVersion
analysisAttemptId
runId
requestId
threadId
turnId
provider
model
sourceDatasetSha256
sourceDatasetBytes
sourceRecordCount
rulesSnapshotId
manifestSha256
commonRulesSha256
catalogSha256
decisionContract
outputSchemaSha256
promptIdentity
bridgeIdentity
createdAtUtc
```

模型不得看到或提交此 object。source-bound 部分一經 Provider dispatch 不可變；Thread／Turn 只能由 Host binding state machine 填入一次，封存後不可被 renderer state、新一次 Rule selection、stale React closure 或模型輸出覆寫。Artifact Submission Token 必須在 identity 封存後才簽發。

### 7.4 Artifact Token 生命週期

1. 使用 CSPRNG 產生至少 256-bit token。
2. 將 token hash 綁定 ApprovedArtifactIdentity、dynamic tool name、thread／turn 與 expiry。
3. Tool schema 只接受 token、decisions、analysisReportMarkdown、finalSummaryZhTw。
4. 拒絕空 token、錯誤 token、過期 token、跨 Run／Turn token、已使用 token 與第二次 submission。
5. 只有 Bridge 能將 ApprovedArtifactIdentity 注入 persisted submission。
6. 無論 accept／reject，產生 `jaa-artifact-identity-receipt-v1`。

### 7.5 Identity Receipt

Receipt 必須逐欄位記錄 expected source、actual source、type、normalized value、comparison result、token binding result 與 first mismatch code。不得只輸出汎化 `Run identity binding mismatch`。

必要錯誤碼：

```text
AI_ARTIFACT_TOKEN_MISSING
AI_ARTIFACT_TOKEN_INVALID
AI_ARTIFACT_TOKEN_EXPIRED
AI_ARTIFACT_TOKEN_REPLAYED
AI_ARTIFACT_TOKEN_SCOPE_MISMATCH
AI_ARTIFACT_IDENTITY_INTERNAL_MISMATCH
AI_ARTIFACT_SUBMISSION_DUPLICATE
```

## 8. AI Submitted Artifact 持久化

### 8.1 Persist-before-validate

Tool arguments 可解碼後立即寫入：

```text
artifact-attempts/
  ai-submitted-artifact-attempt-001.json
  ai-submitted-artifact-attempt-001.receipt.json
  artifact-identity-receipt-001.json
```

寫入必須 atomic、durable、reopen／hash verified。只對明確允許的憑證／隱私欄位遮罩，不得藉 sanitizer 移除 decisions、reports、findings 或必要 lineage。

### 8.2 語意

- `AI_SUBMITTED` 代表「模型已送出可解碼內容」。
- `ARTIFACT_ACCEPTED` 代表 token／identity／schema 已通過。
- `FORMAL_VALIDATED` 代表 semantic／quality gate 允許 Canonical。
- 三者不得互相冒充。

UI 必須能開啟安全格式化的 AI submission、Analysis Report、final summary 與拒絕 findings。

## 9. Decision v5

### 9.1 Root

Root 必須是 direct JSON array，exact count N，完整覆蓋 `0..N-1`，無 Markdown fence、wrapper object 或 stringified JSON。

```json
{
  "recordIndex": 0,
  "status": "CLASSIFIED",
  "confidence": 0.9,
  "skillFindings": [],
  "recordNegativeChecks": [],
  "unknownReasons": [],
  "rationale": "本筆整體判定理由"
}
```

### 9.2 Skill Finding

```json
{
  "skillId": "GC_006",
  "confidence": 0.9,
  "evidenceQuoteIds": ["eq_..."],
  "evidenceExplanation": "此可讀原文直接描述 GC 流程停滯。",
  "negativeChecks": ["已排除只有一般 GC 關鍵字"],
  "rationale": "此證據符合 GC_006 技術行為邊界。"
}
```

Decision v5 禁止模型提交：

- `runId`、Stable ID、source hash、Rule Snapshot ID、Evidence ID、Result ID。
- free-form `quote`、`evidenceRef`、`evidenceSegmentId`、`evidenceRole`。
- 模型自造的 Evidence Quote ID。

Status matrix、confidence enum `0 | 0.3 | 0.6 | 0.9`、multi-skill 獨立 finding、negative checks 與 Catalog membership 維持 Common Rules v1.6.0。

## 10. Evidence Quote Catalog 1.0.0

### 10.1 Catalog entry

```text
evidenceQuoteId
recordIndex
sourceRecordStableId
evidenceRef
containerEvidenceSegmentId
quoteOrdinal
sourceJsonPointer
containerStartOffset
containerEndOffset
rawStartOffset
rawEndOffset
exactSourceSubstring
displayText
evidenceRoleEligibility[]
normalizationOperations[]
sourceContentHash
quoteSha256
catalogVersion
```

ID 必須從 source identity + container segment + raw offsets + exact substring hash deterministic 產生。同一輸入與版本必須得到相同 Catalog。

### 10.2 產生原則

1. 先完整解析 Comment／Description／Changelog／Diff 容器，再產生可讀 quote entries。
2. 保留中文、Unicode、標點、函式名、error code、tab 與真實換行。
3. JSON wrapper key、escape syntax 與 provenance metadata 可在 displayText 移除，但 exactSourceSubstring／raw offsets 必須能回到原始 bytes。
4. 不得使用 LLM 產生 Catalog，不得摘要、改寫、翻譯或合併不相鄰來源。
5. 每筆 quote 必須具有 role eligibility；`CLASSIFIED` 的每個 Skill 至少引用一個 `PRIMARY_CHANGE` eligible quote ID。
6. Catalog 與 receipt 必須寫入 Run archive 並送給模型作為 frozen input。

### 10.3 Validation

每個 quote ID 必須存在、recordIndex 相同、屬於允許 Evidence Ref、role eligible、hash 可重算且能回到 raw source。正式 validator 不再要求模型自由文字 quote 等於整個 serialized segment。

必要錯誤碼：

```text
EVIDENCE_QUOTE_ID_NOT_FOUND
EVIDENCE_QUOTE_RECORD_MISMATCH
EVIDENCE_QUOTE_SOURCE_MISMATCH
EVIDENCE_QUOTE_ROLE_INELIGIBLE
EVIDENCE_QUOTE_HASH_MISMATCH
EVIDENCE_QUOTE_RAW_TRACE_FAILED
PRIMARY_CHANGE_QUOTE_REQUIRED
```

## 11. 分層 Validator 與 Receipts

必須實作下列獨立 stage，且每層保存 started／completed time、input hash、result、findings 與 receipt path：

1. `TOKEN_BINDING`
2. `SUBMISSION_DECODE`
3. `DECISION_SCHEMA`
4. `COUNT_INDEX_ORDER`
5. `EVIDENCE_QUOTE_REFERENCE`
6. `SOURCE_ROLE_ATTRIBUTION`
7. `STATUS_SEMANTIC`
8. `QUALITY_GATE`
9. `CANONICAL_ASSEMBLY`
10. `ANALYZED_RESULT_PUBLISH`
11. `ACTIVE_RESULT_COMMIT`
12. `REPORT_PACKAGE`
13. `HTML_RENDER`
14. `SQLITE`

只要後續可安全唯讀檢查，validator 就必須聚合所有 findings，不得在第一個 record 或 quote 錯誤就停止。但不得越過阻斷 gate 建立 formal downstream artifact。

生命週期必須區分：

```text
SUBMISSION_MISSING
SUBMISSION_UNDECODABLE
AI_SUBMITTED
SUBMISSION_REJECTED_IDENTITY
SUBMISSION_REJECTED_SCHEMA
SUBMISSION_REJECTED_SEMANTIC
SUBMISSION_REJECTED_QUALITY
FORMAL_VALIDATED
CANONICAL_CREATED
ANALYZED_RESULT_PUBLISHED
ACTIVE_RESULT_COMMITTED
```

所有 terminal failure 必須使用統一 `FailureEnvelope`：

```text
failureId
runId
analysisAttemptId
rootErrorCode
rootErrorStage
rootErrorMessage
rootOccurredAtUtc
rootEvidencePath
derivedErrorCodes[]
derivedConsequences[]
lastSuccessfulStage
firstFailedStage
providerTurnStatus
modelDeliveryStatus
analysisStatus
submissionStatus
canonicalStatus
htmlStatus
sqliteStatus
```

`AI_MODEL_INPUT_DELIVERY_INCOMPLETE` 在本案只能是 derived consequence；第一個不可恢復的 Bridge context／tool contract error 才是 root。UI banner、Run manifest、event log、failed-run manifest、validation report、Debug Folder 與 final status 必須引用同一 failure identity，不得各自重建並產生不同 root。

## 12. Formal 與 Diagnostic 管線

### 12.1 Formal

```text
AI Submitted Artifact
→ all formal gates pass
→ Canonical v5
→ Analyzed Result JSON
→ Active Result
→ Formal Report Data Package
→ HTML
→ SQLite gate
```

只有 formal gate 通過才能建立 Canonical／Analyzed Result、取代 Active Result、允許 Results 導頁或寫入 SQLite。

### 12.2 Diagnostic

```text
Decodable AI Submitted Artifact
→ aggregate validation findings
→ Diagnostic Report Data Package
→ HTML Template v1.5.0 DIAGNOSTIC_NON_CANONICAL
```

Diagnostic Package 至少包含：

- Run／Attempt／Provider／Model lineage。
- AI submission receipt、count、status／Skill distribution（標示 non-authoritative）。
- 每筆 submitted decision 與 resolved／unresolved quote IDs。
- 聚合 findings，含 stage、severity、code、recordIndex、skillId、JSON pointer、expected、observed 與繁中說明。
- Identity Receipt 的逐欄位結果。
- Analysis Report 與 final assistant summary。
- `formal=false`、`canonicalCreated=false`、`sqliteAllowed=false`。

如果 submission 無法解碼，仍產生 diagnostics receipt 與安全截斷的 raw payload metadata，但不偽造 decisions 或 Diagnostic HTML content。

## 13. Workspace 與 Results UI

1. 開始分析後留在 Workspace。
2. Workspace 顯示 Provider、Input Delivery、AI Submission、Validation、Canonical、Analyzed Result、Active Result、Package、HTML、SQLite 各自狀態。
3. AI 有提交但被拒絕時，顯示「已收到 AI 提交，正式驗證失敗」，提供開啟 submission、findings、diagnostic HTML 與 Debug Folder。
4. 不得用 `0/N`、假百分比或「沒有分析」掩蓋已收到完整 submission 的事實。
5. 只有 `ACTIVE_RESULT_COMMITTED` 允許導向 Results。
6. Diagnostic artifact 不出現於 Results 成功歷史，不取代先前 Active Result。
7. Results 保留 v0.3.27 的 Active Dataset、成功歷史、lineage、統計、結果、CSV、HTML 與 review；不把 diagnostics 搬回 Results。
8. Input Delivery 失敗卡片至少顯示：失敗階段、root error、derived consequence、ChatGPT 已讀取檔案數、已讀取 records、是否開始分析、是否提交 AI artifact、Canonical／HTML／SQLite 狀態。
9. 提供「查看 ChatGPT 最終回覆」、「查看工具呼叫」、「查看 Bridge Context Receipt」、「匯出本次 Attempt Debug Folder」與「重新執行分析」；不得顯示完整 handle／token／nonce。
10. 重新執行必須建立全新 Attempt、Run、Context、Thread／Turn、handle 與 token，不得沿用失敗 Context。
11. 任何 Model Delivery、Analysis、Submission、Validation、Active Result gate 失敗都留在 Workspace，不得自動跳到 Results。
12. Provider dispatch 前顯示 Runtime Contract、Manifest Protocol、Bridge、Dispatch Gate；通過後才顯示已聯絡 ChatGPT。
13. 本機 Gate 失敗時顯示 expected／observed、root stage 與「尚未聯絡 ChatGPT」，不得顯示 Provider completed 或 ChatGPT 分析失敗。

## 14. Runtime Manifest Contract、Provider Dispatch Gate 與 bridge-resumable-v3

### 14.1 Runtime Contract Registry

建立 immutable `jaa-runtime-contract-registry-v1`，至少包含：

```text
appVersion=0.3.28
promptIdentity=JAA-CHATGPT-ZH-TW-0.3.28
promptTemplateVersion=0.3.28-zh-TW-v9
bridgeVersion=0.3.28-bridge-v10
transportProtocol=bridge-resumable-v3
manifestSchemaVersion=jaa-model-input-manifest-v3
bridgeContextContract=jaa-bridge-execution-context-v1
deliveryHandleContract=jaa-model-delivery-handle-v1
artifactTokenContract=jaa-artifact-submission-token-v1
decisionContract=jaa-ai-analysis-decisions-v5
evidenceQuoteCatalogVersion=JAA-EVIDENCE-QUOTE-CATALOG-1.0.0
htmlRendererVersion=JAA-LOCAL-HTML-RENDERER-1.5.0
```

Registry 是所有 runtime／Prompt／Debug／UI／package identity 的唯一 source of truth。不得以 scattered string literal、舊 module default、fallback value 或 post-serialization replacement 產生 identity。

### 14.2 Production Manifest Factory

建立唯一 production factory：

```text
createModelInputManifestV3(runtimeContract, sourceInputReceipt, segmentCatalog, deliveryHandle, artifactSubmissionToken)
```

輸出至少包含：

```text
schemaVersion
transportProtocol
expectedFileCount
expectedRecordCount
segmentByteLimit
files[]
deliveryHandleContract
deliveryHandle
artifactSubmissionTokenContract
artifactSubmissionToken
hostOwnedIdentity
```

`schemaVersion` 必須等於 `jaa-model-input-manifest-v3`，`transportProtocol` 必須等於 `bridge-resumable-v3`。Factory 不得 import／extend v2 Manifest default；fixture、source handler、replay 與 packaged handler 必須共用此 factory。

### 14.3 Provider Dispatch Gate

Provider dispatch 前以正式 Run 資料執行：

1. 建立 Source Input Receipt、segments 與尚未綁定 Provider Thread／Turn 的 Host-owned Context；僅建立無法用於正式工具呼叫的 validation-only opaque placeholder，不得在此階段簽發可用的 delivery handle 或 Artifact Token。
2. 呼叫 production Manifest factory。
3. 以正式 JSON Schema 驗證 Manifest object。
4. 序列化成實際 model-visible JSON，再重新 decode。
5. 比對 Registry、Bridge Contract、Input Transport Contract、Effective Instruction、Request Package 與 Run Manifest identity。
6. 驗證 files、records、segment counts、bytes、SHA-256、EOF plan、handle／token contracts。
7. 建立 `jaa-provider-dispatch-gate-v1` receipt。

只有 `selfValidationPassed=true` 且 `providerDispatchAllowed=true` 才能聯絡 ChatGPT。Gate 通過只代表 production factory、序列化結果與契約可安全 dispatch，不代表已簽發任何可用 handle／token。若失敗，UI 必須顯示「尚未聯絡 ChatGPT／本機 Runtime Manifest 驗證失敗」，不得建立假的 Provider Thread／Turn、不得消耗 Provider Turn。

### 14.4 Tool Response 回傳前自我驗證

Provider Thread／Turn 成功綁定後，Host 才可依該 Run／Context／Thread／Turn scope 簽發正式 delivery handle 與 Artifact Token。`jaa_get_input_manifest({})` handler 必須以 production factory 和正式憑證產生 response，建立完整 `contentItems[0].text` 後再次 decode，使用與 Dispatch Gate 相同 validator 驗證 actual serialized payload。只有這次 runtime 驗證通過才可將 response 回傳模型；失敗時撤銷憑證並建立 Host root error。禁止只驗證 pre-serialization object，亦禁止把 validation-only placeholder 回傳模型。

必要錯誤碼：

```text
AI_PROVIDER_DISPATCH_CONTRACT_MISMATCH
AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH
AI_RUNTIME_MANIFEST_SCHEMA_MISMATCH
AI_RUNTIME_MANIFEST_SERIALIZATION_INVALID
AI_RUNTIME_MANIFEST_COUNT_MISMATCH
AI_RUNTIME_MANIFEST_HASH_MISMATCH
AI_RUNTIME_TOOL_RESPONSE_CONTRACT_MISMATCH
```

### 14.5 Model-visible tool schemas

工具 schema 必須 exact、`additionalProperties=false`：

```text
jaa_get_input_manifest({})
jaa_read_and_ack_next_segment({ deliveryHandle, cursor, previousAck })
jaa_get_delivery_status({ deliveryHandle })
jaa_finalize_input_delivery({ deliveryHandle, finalAck })
jaa_report_analysis_progress({ deliveryHandle, phase, analyzedCount, optionalMessageZhTw })
jaa_publish_analysis_artifacts_v5({ artifactSubmissionToken, decisions, analysisReportMarkdown, finalSummaryZhTw })
```

所有 schema 禁止 Run／Attempt／Request／Thread／Turn identity、path、source hash、Rule identity 或任意 command。v0.3.27 zero-identity contract 不得退化。

### 14.6 Host binding 與 Combined read／ACK

維持：Attempt／Run → Context → tool registration → Provider dispatch → Thread／Turn events → bounded binding barrier → Manifest → opaque handle → combined read／ACK → finalize → Model Delivery Receipt。不得以 sleep、模型 retry、Run ID alias、固定 batch、逐筆 request 或自動 repair迴避問題。

Handle 驗證先於 cursor／ACK；wrong hash、cursor skip／rollback／duplicate、early EOF、cross-context／turn handle 立即 fail closed。最後一 segment 必須 final ACK，完整證明所有 files／segments／bytes／hash／EOF。

### 14.7 Host-owned Failure Envelope

Manifest 或 tool response mismatch 必須在 Host 端立即建立 root failure：

```text
rootErrorCode=AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH
rootErrorStage=MODEL_INPUT_MANIFEST_GENERATION
expected=bridge-resumable-v3
observed=bridge-resumable-v2
derivedErrorCodes=[AI_MODEL_INPUT_DELIVERY_INCOMPLETE, AI_ANALYSIS_NOT_STARTED, AI_ARTIFACT_NOT_SUBMITTED]
```

實際 observed 依事件填寫，不可硬編碼測試值。UI、Run manifest、event log、failed-run manifest、validation report 與 Debug Folder 必須引用同一 failure identity。禁止把 derived delivery error 當 root，也禁止解析 ChatGPT prose 才建立根因。

### 14.8 Source／Packaged Contract Tests

Source test 必須真正建立 production Context、綁定 Thread／Turn、呼叫 handler、decode `contentItems[0].text` 並驗證 actual Manifest。dist 後從 packaged ASAR／resources 載入實際 `analysis-bridge-v0328.cjs`，執行相同測試；source 與 packaged response 的 schema／protocol／safe identity／file／record／segment metadata 必須一致。

### 14.9 Stale v2 Scan

掃描 `electron/`、`src/`、generated bridge、`dist/`、resources 與 `app.asar` 的 `bridge-resumable-v2`。Production runtime 命中立即阻擋 build／dist。只有 migration、compatibility parser、v2 benchmark、regression fixture、歷史報告可用明確 path + purpose allowlist 保留；每筆命中寫入 `stale-transport-identity-scan.json`。

### 14.10 Bridge Tool Call Evidence 與效能

保留 v0.3.27 tool-call evidence，另加入 Registry identity、Manifest factory version、Dispatch Gate receipt、pre／post serialization hashes、response self-validation status，仍禁止保存完整 handle／token／nonce、OAuth credential 或輸入內容。

使用相同 fixture 比較 v2／v3及 v0.3.27 failure／v0.3.28 success path：tool-call count、binding／dispatch gate duration、input delivery、Provider／wall time、實際 token telemetry、provider-stream 與 conversation bytes。不得保證推理時間縮短，只可陳述實測結果。

## 15. Debug Folder v0.3.28

必收證據：

```text
attempt-manifest.json
attempt-status.jsonl
active-rule-set-receipt.json
rule-selection-receipts/
pending-dataset-receipt.json
run-manifest.json
model-delivery-receipt.json
bridge-execution-context-receipt.json
model-delivery-handle-receipt.json
bridge-tool-calls.jsonl
runtime-contract-registry.json
provider-dispatch-gate-receipt.json
runtime-manifest-self-validation.json
model-input-manifest.json
model-input-manifest-receipt.json
packaged-bridge-contract-test.json
stale-transport-identity-scan.json
failure-envelope.json
error-normalizer-events.jsonl
evidence-quote-catalog.jsonl
evidence-quote-catalog-receipt.json
provider-stream.jsonl
conversation.jsonl
final-assistant-response.*
artifact-attempts/ai-submitted-artifact-attempt-*.json
artifact-attempts/*.receipt.json
artifact-identity-receipt-*.json
validation-stage-receipts/
validation-findings.jsonl
diagnostic-report-data-package.json
diagnostic-analysis-report.html
navigation-decisions.jsonl
canonical/analyzed/active/package/html/sqlite receipts（如存在）
debug-file-manifest.json
debug-completeness.json
flush-completeness.json
```

要求：

1. 根據本次 `analysisAttemptId` 與 `linkedRunId` 收集，禁止 latest Run fallback。
2. 若證據在原 Run 外部路徑，export 必須複製實體並驗證 hash，不得只包 path string。
3. 每一 evidence role 只能由單一 canonical role registry 判定 expected path，不得同時要求 Template Snapshot 與不存在的舊 alias。
4. completeness classification 固定為：`expected_and_present`、`expected_but_missing`、`not_produced_due_to_prior_failure`、`not_applicable_provider_not_dispatched`、`not_applicable_no_model_delivery`、`not_applicable_no_submission`、`not_applicable_instruction_mode`。
5. 沒有 Model Delivery 時，AI submission、Diagnostic Package／HTML、Canonical、Analyzed Result、Formal HTML 與 SQLite 必須依 lifecycle 正確標示，不得假裝漏包。
6. 有可解碼 AI submission 但 diagnostic package／HTML 沒有產生時，completeness 必須失敗並指出 owner stage。
7. Template 已在 `template-snapshots/Skill_Analysis_HTML_Report_Template_v1.5.0.md` 時，外層不得再要求 `render-workspace/html-report-template.md`；若需要 alias，必須真的建立、複製、hash 驗證並在 role registry 宣告。
8. 錯誤 normalization 必須處理 Error、string、structured IPC error、plain object、null／undefined 與 unknown；UI／log 永遠有穩定 code 與繁中 message。
9. 完整 handle、token、nonce、OAuth／session／cookie 與憑證不得被包入。
10. Provider 未 dispatch 時，Provider stream／Thread／Turn 不應存在，並以 `not_applicable_provider_not_dispatched` 明確分類；不得偽造空 Provider evidence。
11. Runtime Manifest receipt 必須保存 expected／observed protocol／schema、factory version、pre／post serialization hash、self-validation 與 dispatch decision，但不得保存完整 handle／token。

Debug Folder 必須能重建本次錯誤鏈：`tool call → context resolution → root error → derived consequence → final assistant response → lifecycle terminal state`，不得只留下最終泛化錯誤。

### 15.1 Error Normalizer Contract

建立唯一的 `normalizeJaaError(error, context)`，回傳至少：

```text
errorId
errorCode
messageZhTw
technicalMessage
stage
source
occurredAtUtc
causeCode
safeDetails
```

規則：

1. `Error` 使用 name／message／cause，但不得依賴 enumerable properties。
2. string 轉為穩定 fallback code + 原文字串。
3. structured IPC error 保留明確 code／stage／safe details。
4. plain object 以安全 allowlist 解析；不得直接 stringify credential-bearing object。
5. null／undefined／無法辨識值使用 `UNEXPECTED_ERROR_SHAPE` 與「收到非標準錯誤物件」，不得輸出空 code／message。
6. Error dedup key 使用 root identity + stage + code + safe hash，保留 occurrenceCount；不得因重複而丟失第一次與最後一次時間。
7. renderer toast、Workspace banner、session log、event log 與 Debug evidence 必須消費同一 normalized object。
8. 必須覆蓋 Active Rule Set revalidation、Pending Dataset preflight、ChatGPT status refresh、AI Analysis page initialization、renderer callbacks、preload IPC rejection、analysis-start validation 與 Debug export。
9. 針對 v0.3.27 日誌 14:16:14 的 pre-run `undefined: undefined`，從實際 action／IPC call chain 找到 origin；不得只加顯示 fallback 而不修正 producer。

## 16. 繁體中文 Standard Formal Prompt

Effective instruction 必須完整使用繁體中文，並明確告知模型：

1. 使用 `bridge-resumable-v3` 完整讀取 `1 JSON + 3 MD`，完成前不得分類。
2. 第一個工具固定呼叫 `jaa_get_input_manifest({})`；不得傳入、猜測、轉換或要求 JAA 提供 Run／Attempt／Request／Thread／Turn identity。
3. 後續只使用 Manifest 回傳的 opaque `deliveryHandle`、cursor 與 ACK；不得從目錄名稱、訊息或 UUID 推導 Run ID。
4. 檢查 4/4 files、N/N records、all segments、EOF／hash／ACK。
5. 依 Common Rules v1.6.0、Catalog v0.3.1、Manifest v0.8.0 分析每筆。
6. 只引用 JAA 提供的 `evidenceQuoteId`，不得自造 ID 或重打 quote。
7. 使用 Decision v5 direct JSON array，exact N records，index `0..N-1`。
8. 提交前自我檢查 count、index、Status matrix、Catalog membership、quote IDs、PRIMARY_CHANGE、multi-skill 獨立理由。
9. 只提交一次；無自動 repair、無固定 batch、無逐筆 submission。
10. 同一次 tool submission 附上完整繁中 Analysis Report 與簡短 final summary，必須實話說明輸入完整度、已分析數量、結果分布、限制與是否已提交。
11. 模型不負責檔案 I/O、HTML、Package、SQLite、JAA-owned identity 或 source hash。

System Safety Wrapper、Default Instruction、Effective Instruction、tool descriptions 與 JSON Schema 必須一致；不得再發生 Prompt 禁止 Run ID、tool schema 卻要求 Run ID 的矛盾。

Custom instruction mode 仍可附加使用者指令，但不可覆寫 Token、Decision v5、count、Evidence Quote ID、一次 submission、安全與 formal gate。

## 17. 自動化測試

新增 `npm.cmd run test:v0.3.28`，至少覆蓋：

### 17.1 Runtime Contract Registry／Factory

1. 所有 identity consumers 取得同一 Registry object／hash。
2. Production factory actual output 是 Manifest v3 + transport v3。
3. 將任一 consumer 注入 v2／stale Prompt／Bridge identity時，Dispatch Gate fail closed。
4. object 驗證與 serialize→decode 後驗證結果一致。
5. files、records、segments、bytes、hash、handle／token contracts 任一 mismatch 都有精確 error。
6. production factory 不依賴 v2 default／post-build replacement。

### 17.2 Provider Dispatch Gate／Root Error

1. 正確 Manifest 時 receipt `selfValidationPassed=true`、`providerDispatchAllowed=true`。
2. observed v2 時 Provider 不 dispatch、Thread／Turn 不建立、root 為 `AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH`。
3. derived delivery／analysis／artifact codes 不得取代 root。
4. UI 顯示「尚未聯絡 ChatGPT」與 expected／observed。
5. event log、failed-run manifest、validation report、Failure Envelope 使用同一 failure ID。

### 17.3 Production Handler／Packaged Handler

1. Source production Context + bound Thread／Turn + `jaa_get_input_manifest({})` 成功。
2. decode 實際 `contentItems[0].text`，assert schema v3、transport v3、4 files、N records、完整 segment metadata。
3. model-visible payload 無 Run／Attempt／Request／Thread／Turn identity。
4. Packaged `analysis-bridge-v0328.cjs` 執行完全相同測試。
5. Source／packaged safe response identity 與 metadata 一致。
6. Packaged test 未執行或失敗時 dist 不得標 PASS。

### 17.4 Bridge Context／Handle／Token／Transport

1. v0.3.27 zero-identity schema、獨立 Context、bounded binding 不退化。
2. missing／invalid／expired／replayed／cross-run／cross-turn handle／token 拒絕。
3. 52 segments 正常 combined read／ACK／EOF，53 calls；wrong ACK／hash／cursor／EOF fail closed。
4. Manifest `{}` → handle → read／ACK → finalize → Delivery Receipt 可完整走通。
5. Legacy `runId` argument 被 schema 拒絕，不被 alias 接受。
6. Debug／UI／conversation 不洩漏完整 handle／token／nonce。

### 17.5 Stale v2 Scan

1. Production source／generated bridge／dist／resources／ASAR 無 v2 命中。
2. allowlist 僅接受 migration／compatibility／benchmark／regression／歷史報告。
3. 每個 allowlist 命中有 path、owner、purpose、hash。
4. 新增 production v2 literal 時 build／dist 測試必須失敗。

### 17.6 Pre-run Error Normalizer

1. Error、string、structured IPC、plain object、null、undefined、unknown 七類均產生穩定 code／message。
2. 實際走過頁面初始化、ChatGPT refresh、四檔 revalidation、Pending Dataset preflight、analysis start、Debug export。
3. session log、renderer toast、event log 不得出現 `undefined: undefined`。
4. v0.3.27 pre-run failure replay 能指出原始 producer／action／IPC channel。
5. dedup 保留 occurrenceCount、first／last time，不吞掉 root。

### 17.7 Existing Formal Pipeline Regression

1. Persist-before-validate、Artifact Token、Decision v5、Quote Catalog 與 14 stage receipts 不退化。
2. decodable invalid submission 仍產生 findings、Diagnostic Package／HTML，無 Canonical／SQLite／Results navigation。
3. Formal pass 仍走 Active Result／Package／HTML／SQLite pipeline。
4. per-file Rule Selection、Draft／Active、manual import、Results、Snapshot 與 review 不退化。
5. 17／117 fixture identity／count／order regression 通過，但不得冒充真實 Provider Run。

### 17.8 Debug／UI／Version Regression

1. 新增 Registry、Dispatch Gate、Manifest receipts、packaged test、stale scan、Failure Envelope 與 normalizer events。
2. Provider 未 dispatch、無 delivery、無 submission及 formal／diagnostic downstream 的分類正確。
3. Template Snapshot 不誤報舊 alias 缺少。
4. 所有 identity 無 stale production `0.3.27` Prompt／Bridge或 v2 transport。
5. Failed Run 留在 Workspace；只有 Active Result commit 才能進 Results。

## 18. v0.3.27 Failure Replay

建立 local-only replay，唯讀使用 `jira-activity-analyzer-debug-folder-20260821_141728.7z`，不呼叫 Provider、不修改 archive、不寫 production SQLite：

1. 驗證 Run `analysis_64ffcb94-b98d-4bbe-98d3-b6ee341fea77`、Thread、Turn、Context、handle 與唯一 Manifest tool call。
2. 從實際 Provider stream decode Manifest response，重現 schema v3 + transport v2。
3. 證明其他 Bridge／Input／Prompt／Request identities 全為 v3。
4. 舊版結果重現 0/4、0/17、無 submission與衍生 delivery incomplete。
5. 新版 Registry／factory／Dispatch Gate 對相同 mismatch 在 Provider dispatch 前建立正確 root。
6. 新版 production handler response 必須為 v3，並完成至少 Manifest → read／ACK → finalize replay。
7. 驗證 v0.3.27 Debug completeness 已改善且不退化。
8. 追查 14:16:14 pre-run `undefined: undefined` 的 action／IPC producer並驗證新 normalizer。
9. 產生 TEST／REPLAY／NOT PRODUCTION receipts；不得建立正式 Active Result／SQLite。

若 Debug Bundle 未提供，replay 必須明確標為 `Manual Validation Pending — required evidence missing`，不得以 fixture PASS 取代；其他 build 流程可繼續，但 Overall Status 不得宣稱 replay verified。

## 19. 真實案例驗證

### 19.1 17 筆

若 Managed OAuth 可用，以 v0.3.28 Standard Formal 執行一次。先保存 Dispatch Gate receipt，再驗證 `jaa_get_input_manifest({})` actual response 為 v3、Context／Thread／Turn、opaque handle、4/4 delivery，再驗證 17/17 submission、token、Quote IDs、Formal／Diagnostic terminal state、Debug completeness 與 UI。不得因本版目標預先宣稱必須 Formal PASS。

### 19.2 117 筆

只有真實 17 筆已證明 Manifest v3、4/4 delivery 且沒有 Bridge／contract failure，才可執行真實 117 筆。真實 Provider Run 與 fixture replay 必須分開報告；無法安全執行時只做唯讀 fixture regression 並標記 Manual Validation Pending。

### 19.3 失敗案例

至少測試 Registry／Manifest protocol mismatch、serialization mismatch、Provider not dispatched、Context 未綁定、錯 handle／token、錯 quote、invalid status、第二次 submission、diagnostic HTML 失敗與 Debug export。確認 root／derived、UI、completeness及原 Active Result 正確。

## 20. Build、Package 與啟動驗證

至少執行並記錄 actual start／finish／duration／exit code：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.28
npm.cmd run replay:v0.3.27
npm.cmd run test:runtime-manifest-contract
npm.cmd run build
npm.cmd run dist
npm.cmd run test:packaged-runtime-manifest-contract
git diff --check
```

另須：

1. 檢查 package source commit 與 dirty state。
2. ASAR 只能含 v0.3.28 Bridge 與本版四份正式 MD，不得殘留 stale Bridge／Rule／Template；production runtime 不得命中 v2 transport。
3. 掃描敏感檔名、credential patterns、`.env`、token、DB、Debug Bundle 與不應封裝資料。
4. 驗證 bundled Codex version／path／SHA-256。
5. 驗證四份 Rule／Template MD basename／version／bytes／SHA-256／Manifest binding。
6. `dist` 後必須執行 packaged runtime Manifest contract test；未執行不得宣稱 package verified。
7. 以隔離 profile 短啟動 win-unpacked 與 Portable，確認 renderer boot、did-finish-load、route ready，無 crash／white screen／unresponsive；不要進行長時間 smoke。
8. Installer、Portable、win-unpacked EXE 必須列出完整 path、bytes、SHA-256、Build Time 與 Package Source Commit。

## 21. 正式報告

至少產生：

- `JiraActivityAnalyzer_v0.3.28_test_and_verification_report.md`
- `JiraActivityAnalyzer_v0.3.28_artifact_manifest.json`
- `JiraActivityAnalyzer_v0.3.28_execution_time_ledger.json`
- `JiraActivityAnalyzer_v0.3.28_runtime_manifest_root_cause_report.md`
- `JiraActivityAnalyzer_v0.3.28_runtime_contract_registry_report.md`
- `JiraActivityAnalyzer_v0.3.28_provider_dispatch_gate_report.md`
- `JiraActivityAnalyzer_v0.3.28_production_handler_contract_report.md`
- `JiraActivityAnalyzer_v0.3.28_packaged_handler_contract_report.md`
- `JiraActivityAnalyzer_v0.3.28_stale_transport_identity_scan_report.md`
- `JiraActivityAnalyzer_v0.3.28_root_error_propagation_report.md`
- `JiraActivityAnalyzer_v0.3.28_error_normalizer_report.md`
- `JiraActivityAnalyzer_v0.3.28_bridge_resumable_v3_performance_report.md`
- `JiraActivityAnalyzer_v0.3.28_v0327_failure_replay_report.md`
- `JiraActivityAnalyzer_v0.3.28_debug_completeness_report.md`
- `JiraActivityAnalyzer_v0.3.28_rule_template_alignment_report.md`
- `JiraActivityAnalyzer_v0.3.28_v0327_regression_report.md`
- 適用的 Decision v5／Quote Catalog／Validation／Diagnostic／Results／SQLite／Package regression 報告

Execution ledger 至少含 step、startedAt、finishedAt、durationMs、exitCode、result、evidence path。Actual token telemetry 只能使用 Provider／Runtime 實際值；無法取得就填 `unavailable`，禁止以檔案大小、字數或估算冒充。

## 22. Git 交付

1. 建立 `feat/v0.3.28-runtime-manifest-contract-preflight-root-error`。
2. 僅 stage 本版檔案；保留使用者既有 dirty／untracked 資料。
3. 建議先提交 package source commit。
4. 從該 commit build／dist，產生報告與 artifact manifest。
5. 提交 final delivery commit。
6. 建立 annotated tag `v0.3.28` 指向 final delivery commit。
7. push branch 與 tag，驗證 upstream ahead／behind `0/0` 與 remote SHA。

若 push 遭權限、安全政策或遠端拒絕，停止並誠實報告；不得 force push、改用其他 remote 或規避。

## 23. Definition of Done

只有同時符合下列條件，才可宣稱自動化交付完成：

1. 根因報告定位 v0.3.27 production Manifest response 的 stale v2 source 與 handler call chain。
2. 單一 Runtime Contract Registry 驅動所有 production identity。
3. Production Manifest factory actual object與 serialized response 均為 schema v3／transport v3。
4. Provider Dispatch Gate 在聯絡 ChatGPT 前驗證 actual response並保存 receipt。
5. Runtime mismatch 由 Host 建立精確 root；delivery／analysis／artifact只列 derived。
6. Source production handler test 真正 decode `contentItems[0].text` 並通過。
7. Packaged ASAR handler test 實際執行且與 source一致。
8. Production runtime 無非 allowlist 的 `bridge-resumable-v2` 命中。
9. v0.3.27 Context、zero-identity tools、bounded binding、handle／token與 v3 read／ACK不退化。
10. Pre-run與 Run Error Normalizer 全面消除 `undefined: undefined` 並找到原 producer。
11. Debug Folder 包含 Registry、Dispatch Gate、Manifest、packaged test、stale scan、Failure Envelope與 normalizer evidence。
12. v0.3.27 failure replay 重現 actual v2 response並驗證新 Gate／factory；缺 evidence時誠實標記 pending。
13. Decision v5、Quote Catalog、14層驗證、Diagnostic、Rule Selection、Navigation、Active Result、Results、Package、HTML、SQLite無退化。
14. Prompt／Bridge／Decision／Transport／Rule／Template／Renderer identities一致，無 stale production metadata。
15. typecheck、test:v0.3.28、replay、source contract test、build、dist、packaged contract test、git diff、ASAR與隔離啟動完成；未執行項不得列 PASS。
16. 正式產物、SHA-256、時間帳、報告、commit、tag與push完成。

真實 Managed OAuth、117 筆、production SQLite 或乾淨 Windows Installer GUI 若未執行，Overall Status 必須是 `Partial / Manual Validation Pending`，不得宣稱 Fully Validated。

## 24. 最終回覆格式

使用繁體中文，先給結果，再列證據：

1. Target Version 與 Overall Status。
2. Branch、Package Source Commit、Final Delivery Commit、Tag、Push／upstream。
3. 十項決策各自實作結果。
4. v0.3.27 Runtime Manifest v2 殘留根因與 failure replay。
5. Registry、production factory、Dispatch Gate、source／packaged handler actual response與 stale v2 scan。
6. Root／derived error、pre-run Error Normalizer與 Debug completeness。
7. Context、handle／token、Decision v5、Quote Catalog、layered validation、Diagnostic HTML regression。
8. v2／v3 transport實測比較，不夸大成效。
9. typecheck／test／replay／source contract／build／dist／packaged contract／git diff／ASAR／啟動結果與實際耗時。
10. Installer／Portable／win-unpacked path、bytes、SHA-256。
11. Bundled Codex、Bridge、Prompt、Decision、Transport、Rule Set、Template、Renderer identities與 hash。
12. 報告路徑、人工驗證待辦與 Actual token telemetry；無法取得寫 `unavailable`。
13. 使用者既有 dirty／untracked 資料是否完整保留。

不得只回覆「已修正」或只列 PASS；必須提供可追溯 commit、artifact、hash、receipt、報告與真實限制。
