# Jira Activity Analyzer v0.3.27 — 正式完整 Codex 實作 Prompt

## 0. 文件用途

請在既有 Jira Activity Analyzer repository 完成 `v0.3.27`。本文件是可直接交付 Codex 執行的完整實作、驗證、封裝與 Git 交付指令，不是概念草稿。

- Repository：`F:\AI\JiraActivityAnalyzer`
- Target Version：`0.3.27`
- Branch：`feat/v0.3.27-host-owned-bridge-context-debug-correctness`
- Annotated Tag：`v0.3.27`
- UI／Prompt／報告預設語言：繁體中文
- Provider：`chatgpt_codex`
- Bundled Codex：固定官方版 `0.147.0`
- Prompt identity：`JAA-CHATGPT-ZH-TW-0.3.27`
- Prompt template version：`0.3.27-zh-TW-v8`
- Bridge：`0.3.27-bridge-v9`
- Provider transport：`bridge-resumable-v3`
- Decision Contract：`jaa-ai-analysis-decisions-v5`
- Evidence Quote Catalog：`JAA-EVIDENCE-QUOTE-CATALOG-1.0.0`
- Artifact Submission Token：`jaa-artifact-submission-token-v1`
- Artifact Identity Receipt：`jaa-artifact-identity-receipt-v1`
- Bridge Execution Context：`jaa-bridge-execution-context-v1`
- Model Delivery Handle：`jaa-model-delivery-handle-v1`
- Bridge Tool Call Evidence：`jaa-bridge-tool-call-evidence-v1`
- Canonical Contract：維持 `jaa-canonical-analysis-result-v5`
- Report Data Package：維持 `jaa-analysis-report-data-package-v1`
- HTML Template Contract：`jaa-html-report-template-v6`
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.0`

基線是已完成的 `v0.3.26`。完整保留 v0.3.26 的 Artifact Token、Decision v5、Evidence Quote Catalog、14 層驗證、Diagnostic HTML、`bridge-resumable-v3`、四檔獨立選取、Draft／Active 原子交易、Attempt-first、Navigation Gate、Active Result、Report Data Package、SQLite Gate、Bundled Codex 與 durable Debug evidence。本版只修正真實 Managed OAuth 測試揭露的 Bridge Run identity 契約矛盾、Provider Thread／Turn 綁定、根因錯誤傳播、Debug completeness 與錯誤正規化；不得藉此改變技能分類語意或 HTML 規格。

## 1. 執行原則

開始修改前，完整檢查 repository、`AGENTS.md`、package scripts、目前 branch／HEAD／remote／工作樹、v0.3.26 實作與報告。使用者提供的 `jira-activity-analyzer-debug-folder-20260821_120609.7z` 只能唯讀分析，不得改寫原始證據。

你必須自行完成：

1. 從實際程式碼與 Debug evidence 定位根因，不得只根據錯誤文字猜測。
2. 建立單一資料契約與可測試的生命週期，不得只修 UI 表象。
3. 修改 Electron main／preload／renderer、IPC、Bridge、dynamic tool schema、Prompt、Run archive、Error Normalizer、Debug collector 與必要 migration；Decision v5、Evidence Quote Catalog、HTML renderer 與 SQLite 僅能做必要的 regression 修正。
4. 新增自動化測試、v0.3.26 failure replay 與 regression。
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

## 3. 已確認的 v0.3.26 真實失敗事實

請先以程式碼與唯讀 replay 重現下列事實：

1. 正式 Run 為 `analysis_5856089a-c381-44a2-aff4-4916d38b9985`，Provider Thread 為 `01a0227d-c8b7-7801-b116-97813e700df7`，Turn 為 `01a0227d-cbfd-7250-8311-98182585a5ff`。
2. JAA 本機已成功驗證四份模型輸入、17 筆資料、Evidence Segment Catalog、Evidence Quote Catalog、Source Input Receipt 與 Bridge 靜態 preflight。
3. Prompt 明確規定 Run／Attempt／Request／Thread／Turn identity 由 JAA 持有，模型不得提交、猜測或覆寫。
4. `jaa_get_input_manifest` 的實際 dynamic tool schema／handler 卻要求模型提供 `runId`，形成互相矛盾的契約。
5. ChatGPT 第一次傳入 `20260821_120417_905_analysis_5856089a-c381-44a2-aff4-4916d38b9985`，第二次傳入 `5856089a-c381-44a2-aff4-4916d38b9985`；JAA 權威值是 `analysis_5856089a-c381-44a2-aff4-4916d38b9985`。
6. 兩次 `jaa_get_input_manifest` 都以 `AI_BRIDGE_CONTRACT_MISMATCH: Tool context or Run ID mismatch.` 失敗；模型因此沒有呼叫 segment read／ACK 工具。
7. Provider Turn 約 16.3 秒完成，但 Model Delivery 為 0/4、分析為 0/17、`analysisStarted=false`、AI submission 未執行，沒有 Decision、Canonical、Analyzed Result、HTML 或 SQLite。
8. Run 最後將衍生錯誤 `AI_MODEL_INPUT_DELIVERY_INCOMPLETE` 當成 root error，遮蔽了真正的 `AI_BRIDGE_CONTRACT_MISMATCH`。
9. Debug Folder 正確保存 Provider stream、Conversation、Final Assistant Response、Evidence Quote Catalog 與兩次 tool failure；但外層 completeness 誤報 `render-workspace/html-report-template.md` 缺少，內層又將沒有 submission 的 Diagnostic Package 列為 `expected_but_missing`。
10. 一般 Debug Log 仍出現 `[ERROR] undefined: undefined`，表示 v0.3.26 Error Normalizer 未完整覆蓋所有 IPC／renderer error shape。
11. 四份 Active MD 已正確選取與驗證：Manifest v0.8.0、Common Rules v1.6.0、Catalog v0.3.1（279 records）、HTML Template v1.5.0；本次失敗與 MD 選擇、bytes 或 SHA-256 無關。
12. 同一份外層日誌至少記錄三次 `AI_MODEL_INPUT_DELIVERY_INCOMPLETE`，不得把問題視為單次偶發或建議以使用者指令繞過。

請產生根因報告，列出 dynamic tool schema、handler context、實際 arguments、權威 identity、Thread／Turn 綁定時間、比較程式碼、錯誤傳播鏈與 Debug classification owner。不得只改 Prompt 要模型傳正確字串，也不得把完整 Run ID 暴露給模型。

## 4. 已採納且不得擅自變更的十項決策

### 決策一：模型工具全面移除 JAA-owned identity

所有 model-visible dynamic tools 禁止接受 `runId`、`analysisAttemptId`、request／thread／turn ID、source hash、Rule Snapshot ID 或其他 JAA-owned identity。`jaa_get_input_manifest` 必須是 zero-argument tool，模型以 `{}` 呼叫即可。

### 決策二：Host-owned BridgeExecutionContext

每個 Run 建立獨立 immutable `BridgeExecutionContext`。Dynamic Tool Handler 註冊時以本機 closure／registry 綁定該 Context；handler 從受信任 host state 取得 Run，不得從模型 arguments、renderer state 或 path basename 推導。

### 決策三：Provider Thread／Turn 延後原子綁定

先建立 Run 與 Context，再註冊工具，收到 Provider `thread/started`、`turn/started` 後原子綁定外部 identity，完成 binding gate 後才允許第一個 tool 執行。不得把尚未完成的 binding 誤報為 Run ID mismatch。

### 決策四：Opaque Model Delivery Handle

Manifest tool 成功後回傳一次性、不可猜測、不可反推 Run 的 `deliveryHandle`。後續 delivery tools 僅接受 handle、cursor 與 ACK；handle 必須限本 Context、可過期、不可跨 Run／Turn、不可 replay，完整值不得寫入一般對話或 UI。

### 決策五：明確且最小的 Tool Contract

工具介面固定為 zero-identity contract：Manifest `{}`；read/ACK 僅 handle + cursor + previousAck；status 僅 handle；finalize 僅 handle + finalAck；progress 僅 handle + phase/count；artifact publish 維持 artifact token + decisions + report + summary。禁止 silent alias、Run ID normalization 或兼容舊模型參數。

### 決策六：Root error 與 derived consequence 分離

生命週期與 UI 必須分開保存 `rootErrorCode`、`rootErrorStage`、`rootErrorMessage` 與 `derivedErrorCodes[]`。本案不得再以 `AI_MODEL_INPUT_DELIVERY_INCOMPLETE` 覆蓋原始 Bridge failure。

### 決策七：Bridge Tool Call Evidence

每次工具呼叫保存安全的結構化 evidence：tool、call ID、schema version、argument names、context／thread／turn／handle binding status、時間、duration、result 與精確 error code。不得保存 nonce、完整 handle、artifact token 或 OAuth credential。

### 決策八：Lifecycle-aware Debug completeness

Debug completeness 必須區分 `expected_and_present`、`expected_but_missing`、`not_produced_due_to_prior_failure`、`not_applicable_no_model_delivery`、`not_applicable_no_submission` 與 `not_applicable_instruction_mode`。不得將既有 Template Snapshot 誤報漏檔，也不得在沒有 AI submission 時要求 Diagnostic Package／HTML。

### 決策九：統一 Error Normalizer

Electron main、preload、IPC、renderer、Bridge、Provider adapter 與 Debug exporter 共用同一正規化器，完整處理 Error、string、structured IPC error、plain object、null／undefined 與 unknown；任何路徑都不得再產生 `undefined: undefined`。

### 決策十：真實 Tool 順序整合測試與 v0.3.26 Failure Replay

建立不呼叫 Provider的唯讀 replay，以及實際 Codex app-server dynamic tool schema／event order integration test。所有 metadata 統一顯示 `JAA-CHATGPT-ZH-TW-0.3.27`、`0.3.27-zh-TW-v8`、`0.3.27-bridge-v9`、Decision v5 與 `bridge-resumable-v3`。

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
- `Skill_Catalog_v0.3.1.md`，必須與本次 v0.3.26 Active Set byte-for-byte 相同
- `Skill_Analysis_HTML_Report_Template_v1.5.0.md`

每份 MD 的版本必須同時出現於檔名與 machine-readable metadata。Manifest v0.8.0 必須綁定其餘三份的 exact basename、version、bytes、SHA-256 與 consumer。Catalog 不得因 BOM、換行或格式化改變 bytes。

本版四份 MD 全部維持 v0.3.26 Active Set 原始 bytes，不進版、不格式化、不正規化換行、不補 BOM。Codex 必須先計算實際 bytes／SHA-256 並與 Manifest binding 對照；若不一致立即停止，不得自行改寫 Manifest 或任一 MD 使其勉強通過。

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
7. Results 保留 v0.3.26 的 Active Dataset、成功歷史、lineage、統計、結果、CSV、HTML 與 review；不把 diagnostics 搬回 Results。
8. Input Delivery 失敗卡片至少顯示：失敗階段、root error、derived consequence、ChatGPT 已讀取檔案數、已讀取 records、是否開始分析、是否提交 AI artifact、Canonical／HTML／SQLite 狀態。
9. 提供「查看 ChatGPT 最終回覆」、「查看工具呼叫」、「查看 Bridge Context Receipt」、「匯出本次 Attempt Debug Folder」與「重新執行分析」；不得顯示完整 handle／token／nonce。
10. 重新執行必須建立全新 Attempt、Run、Context、Thread／Turn、handle 與 token，不得沿用失敗 Context。
11. 任何 Model Delivery、Analysis、Submission、Validation、Active Result gate 失敗都留在 Workspace，不得自動跳到 Results。

## 14. bridge-resumable-v3

### 14.1 Model-visible tool schemas

工具 schema 必須 exact、`additionalProperties=false`，並以 packaged ASAR 內的實際定義做 snapshot test：

```text
jaa_get_input_manifest({})

jaa_read_and_ack_next_segment({
  deliveryHandle,
  cursor,
  previousAck
})

jaa_get_delivery_status({
  deliveryHandle
})

jaa_finalize_input_delivery({
  deliveryHandle,
  finalAck
})

jaa_report_analysis_progress({
  deliveryHandle,
  phase,
  analyzedCount,
  optionalMessageZhTw
})

jaa_publish_analysis_artifacts_v5({
  artifactSubmissionToken,
  decisions,
  analysisReportMarkdown,
  finalSummaryZhTw
})
```

以上所有 schema 禁止 `runId`、Attempt／Request／Thread／Turn ID、path、source hash、Rule identity 或任意 command。Manifest tool 必須可由模型以空 object 呼叫，且不得設計 optional identity alias。

### 14.2 Host binding 與事件順序

1. 建立 Attempt／Run 與 Source Input Receipt。
2. 建立 BridgeExecutionContext。
3. 將 dynamic tool handlers 綁定該 Context。
4. 啟動 Provider request。
5. 接收並持久化 Thread／Turn started events。
6. 原子完成 Context binding gate。
7. 才允許 `jaa_get_input_manifest({})` 取得 handle 與 manifest。
8. Provider completion／cancel／error 時 terminalize Context 並撤銷 handle／token。

不得以 sleep、模型 retry、Prompt 洩露 Run ID或接受多種 Run ID 格式迴避 race。若 app-server 事件順序允許 tool call 與 binding event 並行，實作有界 Promise barrier／state machine，並把等待時間與結果寫入 receipt。

### 14.3 Combined read／ACK

`jaa_read_and_ack_next_segment` 的 request 至少含 opaque handle、current cursor 與 previous segment ACK（首次為 null）；response 至少含 next segment、sequence、bytes、hash、next cursor、EOF 與 durable ACK receipt ID。模型不負責也不得提交 Run identity。

### 14.4 安全規則

- handle 驗證必須先於 cursor／ACK 處理。
- ACK hash 不符、cursor 退回／跳號、順序重複、非預期 EOF 立即 fail closed。
- resume 必須從最後 durable ACK 繼續，不重送已確認 segment。
- 最後一 segment 需有 final ACK；必須能證明所有 files／segments／bytes／hash／EOF 完整。
- 保留單一 request／thread／turn。
- 不改變檔案內容，不將內容抽出改成新的文字 Prompt。
- 禁止 legacy tool fallback、runId alias、PATH／外部 Codex 或自動 repair。

### 14.5 Bridge Tool Call Evidence

每次呼叫 append-only 保存：

```text
schemaVersion
toolRegistrationId
toolName
callId
argumentSchemaVersion
argumentNames
contextResolutionStatus
threadBindingStatus
turnBindingStatus
deliveryHandleStatus
startedAtUtc
completedAtUtc
durationMs
success
errorCode
safeMessage
```

禁止保存 arguments 的秘密值、完整 handle／token／nonce、OAuth credential 或輸入檔內容。錯誤必須指出失敗層級，不得只回傳 `Tool context or Run ID mismatch`。

### 14.6 效能報告

使用相同 fixture 比較 v2／v3，以及 v0.3.26 failure 與 v0.3.27 success path：tool-call count、binding barrier duration、input delivery duration、provider duration、wall time、input／cached／output／reasoning／total tokens（僅實際 telemetry）、provider-stream bytes 與 conversation bytes。不得保證 ChatGPT 推理時間一定縮短；只可宣稱已測得的 transport overhead 改善。

## 15. Debug Folder v0.3.27

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
4. completeness classification 固定為：`expected_and_present`、`expected_but_missing`、`not_produced_due_to_prior_failure`、`not_applicable_no_model_delivery`、`not_applicable_no_submission`、`not_applicable_instruction_mode`。
5. 沒有 Model Delivery 時，AI submission、Diagnostic Package／HTML、Canonical、Analyzed Result、Formal HTML 與 SQLite 必須依 lifecycle 正確標示，不得假裝漏包。
6. 有可解碼 AI submission 但 diagnostic package／HTML 沒有產生時，completeness 必須失敗並指出 owner stage。
7. Template 已在 `template-snapshots/Skill_Analysis_HTML_Report_Template_v1.5.0.md` 時，外層不得再要求 `render-workspace/html-report-template.md`；若需要 alias，必須真的建立、複製、hash 驗證並在 role registry 宣告。
8. 錯誤 normalization 必須處理 Error、string、structured IPC error、plain object、null／undefined 與 unknown；UI／log 永遠有穩定 code 與繁中 message。
9. 完整 handle、token、nonce、OAuth／session／cookie 與憑證不得被包入。

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

新增 `npm.cmd run test:v0.3.27`，至少覆蓋：

### 17.1 Bridge Context／Tool Schema

1. `jaa_get_input_manifest` schema 為空 object、`additionalProperties=false`，可由 `{}` 成功呼叫。
2. 所有 model-visible tool schemas 均不含 Run／Attempt／Request／Thread／Turn identity。
3. 每個 Run 取得獨立 handler／toolRegistrationId；同時存在兩個 Run 時不會交叉解析。
4. Thread／Turn 延後建立時，binding barrier 後第一次 Manifest 呼叫成功。
5. binding timeout、ambiguous context、cross-thread／turn call 產生精確 root error。
6. Context terminal 後所有 handle／token 失效。
7. Packaged ASAR 的實際 schema 與 source snapshot 完全一致。

### 17.2 Identity／Token／Handle

1. ApprovedArtifactIdentity 建立後 immutable。
2. 正確 token 單次提交成功。
3. missing／invalid／expired／replayed／cross-run／cross-turn token 拒絕。
4. 模型 payload 不含 identity 欄位也能由 Bridge 正確組裝。
5. v0.3.25 Artifact identity regression 不再誤報 mismatch。
6. Receipt 可指出真正 mismatch field、type 與 normalized values。
7. Debug／UI／conversation 不洩露完整 token。
8. 正確 delivery handle 可讀取，missing／invalid／expired／replayed／cross-run／cross-turn handle 拒絕。
9. Debug／UI／conversation 不洩露完整 handle。

### 17.3 Persist-before-validate

1. schema／semantic／quality 失敗前已 durable 保存 AI submission。
2. 重新開啟與 hash verify 通過。
3. 不完整 temp file 不可被視為 submitted artifact。
4. 同一次 submission 不被重複覆蓋；第二次必須另建 attempt 或拒絕。

### 17.4 Evidence Quote Catalog／Decision v5

1. JSON-wrapped Comment 能產生可讀 displayText 且回溯 raw offsets／exact substring。
2. Unicode、CRLF、literal `\\r\\n`、escaped quote、NBSP、tab 與中文不失真。
3. 同一 input 產生相同 quote IDs／hash。
4. 不同 record 不可互引 quote ID。
5. missing／unknown／wrong-record／wrong-role／hash-mismatch quote ID 被聚合檢出。
6. `CLASSIFIED` 每個 Skill 至少一個 PRIMARY_CHANGE eligible quote ID。
7. Decision v5 拒絕 legacy free-form quote fields 與 additional properties。
8. v0.3.25 的 33 筆可讀 substring 經 deterministic catalog 對應後可通過 trace validation，不要求等於整段 JSON container。

### 17.5 分層 Validation／Diagnostic

1. 每層 receipt 順序、input hash 與 terminal state 正確。
2. decodable but invalid submission 產生完整 aggregate findings。
3. 產生 Diagnostic Package 與 HTML，且有 non-canonical／SQLite denied 永久警示。
4. Diagnostic 不建立 Canonical／Analyzed Result、不替換 Active Result、不寫 SQLite、不允許 Results 導頁。
5. Formal pass 仍走 v0.3.26 Active Result／Package／HTML／SQLite pipeline。

### 17.6 bridge-resumable-v3

1. 52 segments 的正常 combined read／ACK／EOF。
2. missing ACK、wrong hash、cursor skip／rollback／duplicate、early EOF 皆 fail closed。
3. crash／restart 從最後 durable ACK resume。
4. 結果 bytes／hash 與 v2 byte-for-byte 相同。
5. tool-call count 明顯低於分離 read／ACK，並有可重現 benchmark receipt。
6. Manifest `{}` → handle → read／ACK → finalize 的真實 event order 可完整走通。
7. Legacy `runId` argument 被 schema 拒絕，而不是被 alias／normalization 接受。

### 17.7 Error／Debug／UI／Version

1. Debug Folder 包含所有必收實體檔案與 hash，無 external-path-only receipt。
2. `undefined: undefined` 無法經任何 Error／string／structured IPC／plain object／null／undefined／unknown 路徑產生。
3. AI submitted but rejected 時 Workspace 文案與 actions 正確。
4. Results 不被 failed diagnostic Run 污染。
5. 所有 identity 無 stale `0.3.24`／`0.3.25`／`0.3.26` prompt／bridge metadata。
6. Root error 與 derived consequence 分開保存、顯示且可由 Debug 重建。
7. 無 Model Delivery／無 submission 時，Diagnostic 與 Formal downstream files 不被誤報 missing。
8. Template Snapshot 存在時，不再誤報舊 render-workspace alias 缺少。

### 17.8 Regression

v0.3.26 的 Artifact Token、Decision v5、Evidence Quote Catalog、14 層驗證、Diagnostic HTML、per-file rule selection、Draft／Active、Attempt-first、navigation、Active Result、manual import、Report Package、Snapshot、HTML、SQLite、Debug Attempt 與 17／117 fixture 測試不得退化。

## 18. v0.3.26 Failure Replay

建立 local-only test harness，唯讀使用 `jira-activity-analyzer-debug-folder-20260821_120609.7z` 的 canonical Run，不呼叫 Provider、不修改 archive、不寫 production SQLite。Replay 必須：

1. 讀取實際 Run／Thread／Turn、Prompt、tool calls、arguments、tool results、lifecycle、final assistant response 與 completeness manifests。
2. 重現第一次 folder-basename Run ID、第二次 UUID Run ID 與 JAA authority `analysis_<uuid>` 的差異。
3. 證明 Prompt 禁止模型猜 identity、舊 tool schema／handler 卻要求 `runId` 的矛盾。
4. 在舊 v0.3.26 contract 下重現兩次 `AI_BRIDGE_CONTRACT_MISMATCH` 與衍生 `AI_MODEL_INPUT_DELIVERY_INCOMPLETE`。
5. 在新 contract 下以 `jaa_get_input_manifest({})` 成功取得 opaque handle，至少完整 replay Manifest → read／ACK → delivery finalization；不得把 fixture 成功冒充 Managed OAuth 成功。
6. 證明 0/4 delivery、0/17 analysis、無 submission 時，Diagnostic Package／HTML 應為 `not_applicable_no_submission`，Formal downstream 應為 `not_produced_due_to_prior_failure`。
7. 證明 Template Snapshot 已存在，不再誤報 `render-workspace/html-report-template.md` 缺少。
8. 將 `undefined: undefined` 原始 error shape 通過新 normalizer，產生穩定 code／message。
9. 產生 TEST／REPLAY／NOT PRODUCTION 報告與 receipts；不得生成或寫入正式 Active Result／SQLite。

另保留 v0.3.25 submission replay 作 regression，但它不是本版主要成功證據。

## 19. 真實案例驗證

### 19.1 17 筆

若 Managed OAuth 可用，以 v0.3.27 Standard Formal 執行一次。先驗證第一個 `jaa_get_input_manifest({})`、Context／Thread／Turn binding、opaque handle、4/4 delivery，再驗證 17/17 submission、token、Quote IDs、Formal／Diagnostic terminal state、Debug completeness 與 UI。不得因本版目標而預先宣稱必須 Formal PASS。

### 19.2 117 筆

真實 Provider Run 與 fixture replay 必須分開報告。若無法安全執行真實 117 筆，只做唯讀 fixture regression 並標記 Manual Validation Pending。

### 19.3 失敗案例

至少測試 Context 未綁定、Thread／Turn mismatch、錯／過期／跨 Run／replay handle、legacy runId argument、錯 token、錯 quote ID、context-only CLASSIFIED、invalid status matrix、第二次 submission、diagnostic HTML 失敗與 Debug export。確認原 Active Result 不被取代。

## 20. Build、Package 與啟動驗證

至少執行並記錄 actual start／finish／duration／exit code：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.27
npm.cmd run build
npm.cmd run dist
git diff --check
```

另須：

1. 檢查 package source commit 與 dirty state。
2. ASAR 只能含 v0.3.27 Bridge 與本版四份正式 MD，不得殘留 stale Bridge／Rule／Template。
3. 掃描敏感檔名、credential patterns、`.env`、token、DB、Debug Bundle 與不應封裝資料。
4. 驗證 bundled Codex version／path／SHA-256。
5. 驗證四份 Rule／Template MD basename／version／bytes／SHA-256／Manifest binding。
6. 以隔離 profile 短啟動 win-unpacked 與 Portable，確認 renderer boot、did-finish-load、route ready，無 crash／white screen／unresponsive。
7. Installer、Portable、win-unpacked EXE 必須列出完整 path、bytes、SHA-256、Build Time 與 Package Source Commit。

## 21. 正式報告

至少產生：

- `JiraActivityAnalyzer_v0.3.27_test_and_verification_report.md`
- `JiraActivityAnalyzer_v0.3.27_artifact_manifest.json`
- `JiraActivityAnalyzer_v0.3.27_execution_time_ledger.json`
- `JiraActivityAnalyzer_v0.3.27_bridge_context_root_cause_report.md`
- `JiraActivityAnalyzer_v0.3.27_dynamic_tool_contract_report.md`
- `JiraActivityAnalyzer_v0.3.27_thread_turn_binding_report.md`
- `JiraActivityAnalyzer_v0.3.27_model_delivery_handle_report.md`
- `JiraActivityAnalyzer_v0.3.27_root_error_propagation_report.md`
- `JiraActivityAnalyzer_v0.3.27_error_normalizer_report.md`
- `JiraActivityAnalyzer_v0.3.27_bridge_resumable_v3_performance_report.md`
- `JiraActivityAnalyzer_v0.3.27_v0326_failure_replay_report.md`
- `JiraActivityAnalyzer_v0.3.27_debug_completeness_report.md`
- `JiraActivityAnalyzer_v0.3.27_rule_template_alignment_report.md`
- `JiraActivityAnalyzer_v0.3.27_v0326_regression_report.md`
- 適用的 Decision v5／Quote Catalog／Validation／Diagnostic／Results／SQLite／Package regression 報告

Execution ledger 至少含 step、startedAt、finishedAt、durationMs、exitCode、result、evidence path。Actual token telemetry 只能使用 Provider／Runtime 實際值；無法取得就填 `unavailable`，禁止以檔案大小、字數或估算冒充。

## 22. Git 交付

1. 建立 `feat/v0.3.27-host-owned-bridge-context-debug-correctness`。
2. 僅 stage 本版檔案；保留使用者既有 dirty／untracked 資料。
3. 建議先提交 package source commit。
4. 從該 commit build／dist，產生報告與 artifact manifest。
5. 提交 final delivery commit。
6. 建立 annotated tag `v0.3.27` 指向 final delivery commit。
7. push branch 與 tag，驗證 upstream ahead／behind `0/0` 與 remote SHA。

若 push 遭權限、安全政策或遠端拒絕，停止並誠實報告；不得 force push、改用其他 remote 或規避。

## 23. Definition of Done

只有同時符合下列條件，才可宣稱自動化交付完成：

1. 實際程式根因報告說明 v0.3.26 model-owned Run ID 契約矛盾與事件綁定來源。
2. `jaa_get_input_manifest({})` 不含任何 JAA-owned identity，並能由 Host-bound Context 成功執行。
3. 所有 model-visible tools 不再接受 Run／Attempt／Request／Thread／Turn identity。
4. 每個 Run 具獨立 BridgeExecutionContext，Thread／Turn 延後原子綁定且無 global currentRun race。
5. Opaque delivery handle 正確 scope、expiry、replay 與 secrecy 驗證。
6. bridge-resumable-v3 完成 Manifest、read／ACK、EOF／hash 與 Model Delivery Receipt，完整性不退化。
7. Root error 與 derived consequence 分離，Bridge failure 不再被泛化 delivery error 覆蓋。
8. Bridge tool-call evidence 足以重建 Context resolution 與失敗層級，且不洩漏秘密值。
9. Error Normalizer 全面消除 `undefined: undefined`。
10. Debug completeness 不再誤報 Template alias；無 delivery／submission 的 downstream artifacts 正確分類。
11. v0.3.26 failure replay 不呼叫 Provider即可重現舊錯誤並證明新 tool contract。
12. v0.3.26 Artifact Token、Decision v5、Quote Catalog、14 層驗證、Diagnostic、Rule Selection、Navigation、Active Result、Results、Package、HTML、SQLite 與 Debug 無退化。
13. Prompt／Bridge／Decision／Transport／Rule／Template／Renderer identity 一致，無 stale metadata。
14. typecheck、test:v0.3.27、build、dist、git diff check、ASAR 與隔離啟動通過。
15. 正式產物、SHA-256、報告、commit、tag 與 push 完成。

真實 Managed OAuth、117 筆、production SQLite 或乾淨 Windows Installer GUI 若未執行，Overall Status 必須是 `Partial / Manual Validation Pending`，不得宣稱 Fully Validated。

## 24. 最終回覆格式

使用繁體中文，先給結果，再列證據：

1. Target Version 與 Overall Status。
2. Branch、Package Source Commit、Final Delivery Commit、Tag、Push／upstream。
3. 十項決策各自實作結果。
4. v0.3.26 Bridge Context／Run ID 根因與 failure replay 結果。
5. Tool schema、Context binding、opaque handle、root error propagation、Error Normalizer 與 Debug completeness 關鍵驗證。
6. Token、AI submission durability、Decision v5、Quote Catalog、layered validation、diagnostic HTML regression。
7. v2／v3 transport 實測比較，不夸大成效。
8. typecheck／test／build／dist／git diff／ASAR／啟動結果與實際耗時。
9. Installer／Portable／win-unpacked 的 path、bytes、SHA-256。
10. Bundled Codex、Bridge、Prompt、Decision、Transport、Rule Set、Template、Renderer identities 與 hash。
11. 報告路徑、人工驗證待辦與 Actual token telemetry；無法取得時寫 `unavailable`。
12. 使用者既有 dirty／untracked 資料是否完整保留。

不得只回覆「已修正」或只列 PASS；必須提供可追溯 commit、artifact、hash、receipt、報告與真實限制。
