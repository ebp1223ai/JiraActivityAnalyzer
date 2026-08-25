# Jira Activity Analyzer v0.3.37 正式完整 Codex Prompt

## 0. 任務角色與核心目標

你是 JiraActivityAnalyzer（以下簡稱 JAA）repository 的主要 Codex 實作者。請在既有專案完成 **v0.3.37：Durable Artifact Recovery 與 Provider-neutral Analysis Core**。

本版有兩個同等重要、但必須控制邊界的目標：

1. 修正 v0.3.36 真實 17 筆 Run：Artifact 已 durable persisted，Terminal Reducer 卻讀到 stale `durableArtifactPersisted=false`，誤判 `FAILED_NO_ARTIFACT`。
2. 建立 Provider-neutral 分析核心，使未來「待分析資料 JSON」可由不同雲端 AI、地端 AI 或離線分析器處理，而不是讓 JAA core 永久綁死 ChatGPT／Codex。

本版只實作目前正式可用的 `ChatGptCodexProviderAdapter` 與 test-only `MockAnalysisProviderAdapter`。**不得**在本版倉促加入 OpenAI API、Azure OpenAI、Anthropic、Gemini、Ollama、LM Studio、vLLM 或其他第二個真實 Provider；也不得加入自動 Provider fallback。

完成後必須達到：

- persisted Artifact 的真實性只由 durable evidence 決定。
- Provider terminal event 不得越過已保存 Artifact，製造 no-artifact terminal。
- Post-Artifact 14 stages 可冪等重入、App 重啟恢復與人工重新處理。
- 歷史錯誤 terminal 保持 append-only，Recovery 另建可追溯 supersession。
- JAA core 只依賴 Provider-neutral Request／Artifact／Adapter contracts。
- ChatGPT 現有正式行為不退化：單一 request／thread／turn、1 JSON + 3 MD、無固定 batch、無 automatic repair、無 fallback。
- Mock Adapter 能在無 Codex、無 OAuth、無 Thread／Turn、無網路下走完相同 downstream pipeline。

不要只改 UI 文案、不要吞錯誤、不要用記憶體 flag 假裝 durable、不要刪除舊 terminal、不要改寫 AI submission 來通過驗證。

## 1. 安全、授權與工作樹規則

1. 先唯讀檢查 repository、目前 branch、HEAD、status、package version、scripts、build config、現有 Bridge／Provider／Reducer／Artifact／Recovery 實作與測試。
2. 建立 branch：

   `feat/v0.3.37-durable-artifact-recovery-provider-neutral-core`

3. 使用者既有 tracked 修改、untracked 檔案、Debug Bundle、database、`token.txt`、測試資料、歷史 Prompt、PDF、UI 資料夾均不得修改、移動、刪除、暫存或提交。
4. 禁止 `git reset --hard`、`git checkout --`、`git clean`、遞迴刪除、force push 或任何會覆蓋使用者資料的命令。
5. 不得讀出、顯示、提交或封裝 credential、Bearer Token、PAT、OAuth token、Cookie、完整 opaque handle、nonce 或 session secret。
6. 若 dirty tree 阻擋 dist，先記錄精確原因；只有專案既有且明示授權的 dirty-build 機制可用，並在 Build Info／報告保留 `dirtyState=true`。不得把既有修改納入本版 commit。
7. Debug Bundle 只能唯讀解壓到 ignored／temporary test root；不可修改原壓縮檔或使用 production Run root。
8. Offline replay、Mock Adapter test 與 recovery test 不得聯絡任何 Provider、不消耗 Provider token、不寫 production SQLite、不替換 production Active Result。
9. Live Provider test 預設禁止；只有 `JAA_ENABLE_LIVE_PROVIDER_TEST=1` 且 prerequisites 完整時才能執行。缺少條件必須是 `NOT RUN`，不可冒充 PASS。
10. 遇到 byte-exact 文件、Manifest binding、Identity 或契約衝突必須 fail closed，先列出 expected／observed／來源，不得猜測或自行改寫使用者文件。

## 2. Target、Git 與受控 Identity

### 2.1 Target Identity

- Application Version：`0.3.37`
- Prompt Identity：`JAA-CHATGPT-ZH-TW-0.3.37`
- Prompt Template Version：`0.3.37-zh-TW-v18`
- Pipeline：`JAA-ANALYSIS-PIPELINE-0.3.37`
- Bridge：`0.3.37-bridge-v17`
- Provider Adapter：`jaa-analysis-provider-adapter-v1`
- Provider Request：`jaa-provider-analysis-request-v1`
- Provider Artifact：`jaa-provider-analysis-artifact-v1`
- Durable Artifact Truth Resolver：`jaa-durable-artifact-truth-resolver-v1`
- Reducer Fact Journal：`jaa-reducer-fact-journal-v1`
- Terminal Contradiction Guard：`jaa-terminal-contradiction-guard-v1`
- Recovery Supersession Receipt：`jaa-recovery-supersession-receipt-v1`
- Host Lifecycle：`jaa-host-control-lifecycle-v3`
- Terminal Reducer：`jaa-terminal-outcome-reducer-v1`
- Post-Artifact Pipeline：`jaa-post-artifact-pipeline-v1`
- Artifact Submission Result：`jaa-artifact-submission-result-v3`
- ChatGPT Adapter Transport：`bridge-resumable-v4`
- Decision Contract：`jaa-ai-analysis-decisions-v5`（不變）
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.1`（不變）
- Bundled Codex：維持 repository 已鎖定的官方固定版本；不得升級、下載或使用 PATH fallback。

Immutable Runtime Contract Registry 必須同時保存 Application、Prompt、Prompt Template、Pipeline、Bridge、Provider Adapter、Request、Artifact、Decision、Rules 與 Output Schema identities。Expected 與 actual 不得引用同一個已組裝物件做自我比較。

### 2.2 Git 交付

- Source commit：只包含 v0.3.37 實作、測試與五份受控文件。
- Final Delivery Commit：可增加最終 artifact manifest、驗證報告與 execution ledger。
- Annotated tag：`v0.3.37`，必須指向 Final Delivery Commit。
- Push branch 與 tag；若安全審查或權限阻擋，誠實回報，不得宣稱成功。
- 最後核對 upstream ahead／behind、remote branch SHA 與 peeled tag SHA。

## 3. 五份正式文件與 byte-exact 綁定

本次正式交付包含：

| Role | File | Version | Bytes | SHA-256／規則 |
|---|---|---:|---:|---|
| Codex Prompt | `JiraActivityAnalyzer_v0.3.37_Complete_Codex_Prompt.md` | 0.3.37 | runtime | 保存實際 bytes／SHA-256 |
| Rule Set Manifest | `Skill_Analysis_Rule_Set_Manifest_v0.8.6.md` | 0.8.6 | runtime | 不固定自我 Hash；載入時計算 |
| Common Rules | `Skill_Classification_Common_Rules_v1.6.6.md` | 1.6.6 | 56335 | `bd1858c939fd6e240c5fd57bf7d28c90d52bd1b9cee8149daca7b4f1403c2da4` |
| Skill Catalog | `Skill_Catalog_v0.3.1.md` | 0.3.1 | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| HTML Template | `Skill_Analysis_HTML_Report_Template_v1.5.1.md` | 1.5.1 | 38057 | `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02` |

Manifest v0.8.6 與 Common Rules v1.6.6 是本版新文件。Catalog v0.3.1 與 HTML Template v1.5.1 必須與 v0.3.36 byte-identical；不得因 BOM、換行、格式化或日期改變 Hash。

正式 ChatGPT Provider 輸入仍只有：

1. Pending Dataset JSON
2. Rule Set Manifest v0.8.6
3. Common Rules v1.6.6
4. Skill Catalog v0.3.1

HTML Template v1.5.1 是 local-only，不送 Provider。這個「1 JSON + 3 MD」是 `ChatGptCodexProviderAdapter` 的 transport／delivery 實作，不得硬編碼成所有未來 Provider 的核心介面。

## 4. v0.3.36 真實 17 筆失敗證據

來源 Debug Bundle：

`jira-activity-analyzer-debug-folder-20260825_120741.7z`

### 4.1 已完成 Provider 與輸入傳輸

- Run ID：`analysis_41d05e5a-7386-4d2b-b3c0-1164c4798452`
- Provider：1 request／1 thread／1 turn，Provider completed。
- Files：4/4。
- Records：17/17。
- Model delivery：336,150 bytes。
- Segments：85/85，無 cursor error。
- Duration：224,294 ms。
- Retry／Repair／Fallback：0／0／0。

### 4.2 Artifact 確實已保存

- Artifact tool 成功：1 次。
- Artifact persisted time：`2026-08-25T03:55:27.613Z`（以 Debug durable evidence 為準）。
- Artifact SHA-256：`5540f1a4a0227cd51d8e2ff3ffafc747be99c52eb4a4dd49b780e9b2e8b34322`。
- Host control 已進入 `ARTIFACT_RECEIVED → VALIDATING`。
- Lifecycle projection：`analysisStarted=true`、`analysisCompleted=true`、`COMPLETED_BY_ARTIFACT`。
- Run Manifest 同時記載 `bridgeEvidence.artifactReceipt.status=persisted` 與上述 SHA-256。
- Artifact identity expected／actual 全部符合 v0.3.36，且為獨立來源。

Artifact payload 內容：

- Decisions：17，recordIndex 0..16 完整。
- Status：`CATALOG_DETAIL_MISSING=13`、`UNKNOWN=1`、`EXCLUDED=3`。
- Skill Findings：41。
- Evidence Quote refs：41。
- Unique Quote refs：36。
- Missing Quote IDs：0。

### 4.3 已證實的根因

`2026-08-25T03:55:32.391Z` Terminal Reducer 使用 stale fact：

```json
{
  "durableArtifactPersisted": false,
  "artifactSha256": null
}
```

接著於 `03:55:32.740Z` 產生：

- Terminal：`FAILED_NO_ARTIFACT`
- Root error：`AI_ARTIFACT_SUBMISSION_MISSING`

這與同一 Run 的 Artifact file、Artifact receipt、Run Manifest、Bridge evidence、control state 與 hash 相互矛盾。錯誤不是 ChatGPT 未分析、不是模型沒提交，也不是 Decision schema failure；是 Host 將 stale in-memory／callback state 當成 durable truth。

因此沒有執行 Validation stage receipts、Canonical、Analyzed Result、Active Result、Report Package、HTML 與 SQLite gate。外層 Debug completeness 也錯誤顯示 `artifactSubmissionAttemptExpected=false` 與空 Evidence。

### 4.4 其他已驗證事實

- `artifact-final-summary.txt` 與 `provider-final-assistant-message.txt` 已正確分離。
- Token usage 共 14 events：
  - input：979,701
  - cached input：848,640
  - output：8,762
  - reasoning output：1,236
  - total：988,463
- Numeric token telemetry 必須保留；credential、Authorization、Cookie、OAuth token 與完整 opaque token 仍必須遮罩。

## 5. 十二項已採納決策（全部為 MUST）

### 決策一：DurableArtifactTruthResolver

新增 `jaa-durable-artifact-truth-resolver-v1`。Resolver 只讀：

- 實體 AI submitted artifact，重新開啟並計算 bytes／SHA-256。
- Artifact durable receipt。
- Run Manifest 的 Artifact binding。
- hash-chained reducer fact journal。
- 必要時的 atomic publish／flush receipt。

禁止把下列資料當成 authoritative truth：

- callback closure 捕獲值。
- 記憶體 `boolean`／cache。
- Renderer／UI state。
- 單一非 durable event payload。
- Derived completeness projection。

Resolver 必須回傳 structured result：`PERSISTED_VALID`、`NOT_FOUND`、`CONTRADICTORY` 或 `CORRUPT`，並附 evidence refs、expected／observed bytes／hash 與 finding code。

### 決策二：固定 Artifact persist ordering

Submission handler 必須依序執行，禁止重新排列：

```text
RECEIVE
→ VALIDATE TOKEN / SCOPE / BINDING
→ WRITE TMP
→ FSYNC FILE
→ ATOMIC RENAME
→ FSYNC PARENT DIRECTORY（平台支援時）
→ REOPEN + BYTES / SHA-256 VERIFY
→ WRITE PERSISTED RECEIPT DURABLY
→ APPEND ARTIFACT_PERSISTED FACT DURABLY
→ ADVANCE HOST LIFECYCLE
→ SCHEDULE POST-ARTIFACT JOB
→ ENTER VALIDATING
→ REPLY persisted
```

任何一步失敗必須保留第一個 root error、已完成 receipt 與實體狀態。未完成 reopen／hash、receipt 與 persisted fact 前，不得回覆 `persisted`。

### 決策三：Reducer 每次重讀 Durable Facts

Terminal Reducer 不接收呼叫端傳入的 `durableArtifactPersisted` 布林值作為事實。每次 reduce 前自行呼叫 Resolver。

固定規則：

| Provider terminal | Durable Artifact | Reducer action |
|---|---|---|
| completed | valid persisted | `RUN_POST_ARTIFACT` 或非終局 `DEFER_POST_ARTIFACT` |
| failed | valid persisted | 繼續 pipeline，Provider error 為 warning |
| cancelled | valid persisted | 繼續 pipeline，Provider cancellation 為 warning |
| completed | not found | `FAILED_NO_ARTIFACT`，但先通過 contradiction guard |
| failed | not found | `FAILED_PROVIDER` |
| cancelled | not found | `CANCELLED` |
| any | contradictory／corrupt | `RECONCILIATION_REQUIRED`，不得誤報 missing |

`DEFER_POST_ARTIFACT` 不是 terminal state，不可產生 `run_terminal`。

### 決策四：Hash-chained append-only reducer fact journal

每個 Run 建立 `reducer-facts.jsonl`（實際名稱可依專案慣例，但 contract 固定）。每筆至少包含：

```text
schemaVersion
sequence
runId
factType
occurredAtUtc
sourceComponent
nonSensitivePayload
previousFactSha256
factSha256
```

至少支援：

`PROVIDER_PREPARED`、`PROVIDER_SENT`、`PROVIDER_ACCEPTED`、`PROVIDER_COMPLETED`、`PROVIDER_FAILED`、`ARTIFACT_RECEIVED`、`ARTIFACT_PERSISTED`、`VALIDATION_STAGE_COMPLETED`、`POST_ARTIFACT_STAGE_COMPLETED`、`RECOVERY_STARTED`、`RECOVERY_COMPLETED`、`RUN_CANCELLED`。

Journal append 必須序列化，避免 sequence 競態；hash chain 破裂、sequence 重複／跳號或 payload hash 不符時 fail closed。不得保存 credential、完整 handle／token／nonce。

### 決策五：真正接線 Post-Artifact 14 stages

固定 stages：

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

每一 stage：

- idempotency key=`runId + artifactSha256 + stage`。
- 執行前重讀前置 durable receipts。
- 執行後寫入 stage receipt，reopen／hash verify 後才算 PASSED。
- 重入時若 receipt 與實體相符就 reuse；不相符則明確 reconciliation error。
- Formal stage 首次失敗後，後續 Formal stages 為 `NOT_RUN_DUE_TO_PRIOR_FAILURE`，不得 placeholder PASS。
- Offline／Mock isolation 的 SQLite 必須是 `NOT_RUN_BY_TEST_ISOLATION`，不可冒充 PASSED。

### 決策六：Startup Recovery 與人工重新處理

App 啟動時掃描：

- Artifact persisted。
- 尚未完成 Post-Artifact 或 terminal reconciliation。
- 或 terminal 與 durable Artifact facts 相互矛盾。

符合條件者建立 recovery job。Workspace 增加「重新處理已保存的分析結果」操作，顯示 source Run、Artifact SHA-256、可恢復 stage 與是否會有外部副作用。

Recovery MUST NOT：

- 呼叫 Provider。
- 新建 ChatGPT thread／turn。
- 消耗 Provider token。
- 修改 AI submitted artifact bytes。
- 寫 production SQLite，除非這是正式 Run、既有 gate 允許且操作者明確執行原 pipeline 的 SQLite stage。
- 自動替換較新的有效 Active Result。

Recovery 與正常 Artifact handler 必須呼叫同一 Post-Artifact service，不得複製另一套驗證邏輯。

### 決策七：歷史錯誤 terminal 不可改寫

過去已 durable 保存的錯誤 terminal 是稽核事實，不刪除、不覆寫、不偽造時間。Recovery 成功或得到新結論時新增：

- recovery attempt receipt。
- recovery stage receipts。
- recovery terminal event。
- `jaa-recovery-supersession-receipt-v1`。

Supersession receipt 至少保存 old terminal hash、new terminal hash、Run ID、Artifact SHA-256、reason、createdAtUtc、`status=superseded_by_recovery`。UI 預設顯示目前有效結論，但可展開查看原 terminal 與 supersession lineage。

正常新 Run 仍只允許一筆 terminal。多 terminal 只允許是明確 recovery lineage，不得由一般 callback 重複產生。

### 決策八：Terminal contradiction guard

在任何程式碼產生 `AI_ARTIFACT_SUBMISSION_MISSING`／`FAILED_NO_ARTIFACT` 前，必須查：

- artifact file 是否存在且可驗 hash。
- artifact receipt 是否 persisted。
- Run Manifest 是否有 Artifact binding。
- fact journal 是否有 `ARTIFACT_PERSISTED`。
- Bridge evidence 是否記錄成功 submission。

若任一正向 durable evidence 存在，禁止回報 missing。應使用：

`AI_TERMINAL_FACT_RECONCILIATION_REQUIRED`

並將 action 設為 recovery／manual review；Debug finding 必須列出衝突來源。若 Artifact 存在但 corrupt，使用具體 corrupt／hash mismatch error，不得使用 missing。

### 決策九：Provider-neutral Request 與 Artifact

建立不含 ChatGPT／Codex 型別的 common contracts：

```ts
interface ProviderAnalysisRequest {
  schemaVersion: 'jaa-provider-analysis-request-v1'
  runId: string
  providerId: string
  inputBindings: ProviderInputBinding[]
  effectiveInstruction: { text: string; bytes: number; sha256: string; identity: string }
  expectedRecordCount: number
  decisionContract: string
  artifactContract: string
  locale: 'zh-TW'
  cancellation: AbortSignal
  options: Record<string, JsonValue>
}

interface ProviderAnalysisArtifact {
  schemaVersion: 'jaa-provider-analysis-artifact-v1'
  providerId: string
  decisions: unknown
  analysisReportMarkdown?: string
  finalAssistantSummary?: string
  providerReceiptRef: string
  usage?: ProviderUsageTelemetry
}
```

實際型別可配合專案語言，但語意不得改變。Provider Artifact 不得包含：

- Canonical Result。
- Analyzed Result 完整 Host assembly。
- Report Package／HTML／SQLite。
- Host-owned source／rule／runtime identity。
- 可冒充 durable receipt 的模型欄位。

Host 在收到 Provider Artifact 後注入本機權威 identity，再進入既有 submission／validation pipeline。

### 決策十：AnalysisProviderAdapter 邊界

建立介面：

```ts
interface AnalysisProviderAdapter {
  readonly id: string
  getCapabilities(): Promise<ProviderCapabilities>
  preflight(request: ProviderAnalysisRequest): Promise<ProviderPreflightResult>
  analyze(request: ProviderAnalysisRequest, sink: ProviderEventSink): Promise<ProviderAnalysisResult>
  cancel(runId: string, reason: string): Promise<ProviderCancelResult>
  recover?(recoveryRequest: ProviderRecoveryRequest): Promise<ProviderRecoveryResult>
}
```

要求：

- Provider 選擇明確且逐 Run durable 保存。
- Capability/preflight 結果不可由 UI 猜測。
- Provider-specific auth、transport、stream、tool、Thread／Turn、HTTP、local model protocol 只存在 Adapter。
- JAA core 不可 import Codex Thread／Turn／dynamic tool event type。
- Adapter failure 不得 silent／automatic fallback 至另一 Adapter。
- Decision validation 之後的 Host pipeline 完全共用。

未來 Adapter 可涵蓋 Cloud AI、Local AI、Offline Rule，但本版不實作其真實連線。

### 決策十一：ChatGptCodexProviderAdapter

將現有 Managed ChatGPT／Bundled Codex 流程包進 `ChatGptCodexProviderAdapter`，保持現有使用者行為與安全限制：

- Bundled fixed Codex，驗證 path、version、bytes、SHA-256。
- 不搜尋 PATH、不下載、不 external fallback。
- JAA managed authentication；登入狀態僅屬此 Adapter。
- 單一 Run、單一 request、單一 Thread、單一 primary Turn。
- Provider-visible 1 Pending JSON + Manifest／Common Rules／Catalog 3 MD。
- HTML Template local-only。
- `bridge-resumable-v4`、protected-token-safe segmentation、ACK／cursor／resume／EOF／hash 保持。
- 無 fixed batch、無 automatic repair、無 retry loop、無 fallback。
- Provider stream／conversation append-only 保存。

現有 IPC／UI 可暫時仍只提供 ChatGPT 正式選項，但必須透過 Adapter registry 取得，不得繼續直接呼叫舊 ChatGPT service 進入核心 pipeline。

### 決策十二：Test-only MockAnalysisProviderAdapter

新增 deterministic Mock Adapter：

- 不啟動 Codex。
- 不要求 ChatGPT／OAuth 登入。
- 不建立 Thread／Turn。
- 不使用網路。
- 從固定 fixture 產生符合 `jaa-provider-analysis-artifact-v1` 的 Artifact。
- 能模擬 completed、failed、cancelled、delayed completion、artifact-before-provider-terminal 與 provider-terminal-before-post-artifact 等時序。
- 驗證同一 Artifact 經 14-stage pipeline 產生 Canonical、Analyzed Result、Active Result（隔離 registry）、Report Package、HTML 與 SQLite isolation receipt。

Mock Adapter 必須只在 test build／dependency injection 中可用，不得出現在 production provider selector、production package config 或正式使用者設定。Mock PASS 不等於 Live Provider PASS。

## 6. Provider-independent Core 邊界

重構後依賴方向必須是：

```text
UI / IPC
  → Analysis Application Service
    → AnalysisProviderAdapter interface
      → ChatGptCodexProviderAdapter
      → MockAnalysisProviderAdapter (test only)

ProviderAnalysisArtifact
  → Host Artifact Persistence
  → DurableArtifactTruthResolver
  → Terminal Outcome Reducer
  → Post-Artifact 14-stage Pipeline
  → Canonical / Analyzed Result / Package / HTML / SQLite Gate
```

禁止反向依賴：

- Core import ChatGPT／Codex concrete types。
- Renderer／SQLite 依賴 Provider。
- Adapter 建立 Canonical／HTML／SQLite。
- Provider result 直接成為 Active Result，跳過 Host validation。
- Provider transport status 直接控制 Results navigation。

請加入 architecture／type-level tests，掃描核心目錄不應出現 Codex Thread／Turn／tool-specific imports。

## 7. Lifecycle、Terminal 與 Recovery 一致性

Required control lifecycle 維持：

```text
ATTEMPT_CREATED
→ PROVIDER_DISPATCHED
→ INPUT_READING
→ INPUT_READY
→ ARTIFACT_RECEIVED
→ VALIDATING
→ CANONICAL_CREATED
→ ANALYZED_RESULT_PUBLISHED
→ ACTIVE_RESULT_COMMITTED
→ REPORT_PACKAGE_CREATED
→ HTML_RENDERED
→ SQLITE_GATE
→ TERMINAL
```

Optional telemetry：

```text
NOT_REPORTED | STARTED | IN_PROGRESS | COMPLETED | COMPLETED_BY_ARTIFACT
```

Artifact persisted 必須 deterministic 推導 `analysisStarted=true`、`analysisCompleted=true`、`COMPLETED_BY_ARTIFACT`。Provider completed 只表示 Adapter 工作結束，不代表 Host downstream 已完成。

所有 callback 只能 append fact／receipt、排程 job 或觸發 reducer；不得直接 terminalize。Reducer output 需寫 `terminal-decision-receipt`，內容包含 reducer input facts hash、Resolver result、matrix branch、action、root error、derived consequences 與是否 terminal。

## 8. Standard Formal Prompt 與繁體中文要求

更新 Standard Formal effective instruction 至 `0.3.37-zh-TW-v18`：

- 所有送給 ChatGPT 的系統／使用者指令使用繁體中文。
- 明確說明模型只分析已交付的 Pending JSON，依 3 MD 產生 Decision v5。
- 模型只透過受控 Artifact submission tool 提交一次完整 Artifact。
- 模型可回覆簡短繁體中文摘要與完整 Analysis Report；不得把摘要塞進 Decision JSON。
- 不要求模型產生 Canonical、已分析完整 Host JSON、Report Package、HTML 或寫 SQLite。
- 不允許 shell／PowerShell 檔案 I/O。
- 不允許模型為通過 Quality Gate 而刪除合理 Skill、限制單一 Skill、改寫 Evidence Quote ID 或偽造 Host identity。
- 模型無法讀取完整輸入時，回報 Run-level failure，不提交 N 筆內容相同的 FAILED。

三種 instruction modes 與 Custom Diagnostic 規則保持既有行為；Custom Diagnostic 不建立正式 Canonical／Active Result／SQLite。

## 9. Debug Folder 與可觀測性

Debug Folder 必須 attempt-aware、run-aware 並 lifecycle-aware。新增或確保收錄：

- Provider Adapter identity、capabilities、preflight receipt。
- Provider request receipt，不保存 credential 或完整 payload secret。
- Provider dispatch ledger：prepared／sent／accepted／completed／failed。
- `reducer-facts.jsonl` 與 hash-chain verification report。
- Durable Artifact Truth Resolver receipt。
- 實體 AI submitted artifact、bytes、SHA-256。
- Artifact receipt、Run Manifest binding、Bridge evidence。
- Terminal Reducer input／output receipts。
- Post-Artifact 14-stage receipts。
- Recovery attempt／stage／terminal／supersession receipts。
- `artifact-final-summary.txt`。
- `provider-final-assistant-message.txt`。
- Provider stream／conversation append-only logs。
- Runtime identity、Rule／Template receipts。
- Canonical、Analyzed Result、Report Package、Formal／Diagnostic HTML（若 lifecycle 應產生）。
- SQLite／warning acceptance receipt。
- `debug-completeness.json` 與 `debug-file-manifest.json`。

Completeness 不得因舊 terminal 誤判而忽略已存在 Artifact。若外層與內層 evidence 衝突，列為 `CONTRADICTORY_EVIDENCE`，不得顯示 not applicable。所有收錄檔必須保存 bytes／SHA-256；receipt-bound 檔案需重新開啟核對。

## 10. UI 最小範圍

本版 UI 只做支援 correctness 的最小變更：

1. Workspace 顯示目前 Provider Adapter：`ChatGPT / Bundled Codex`，資料來自 Adapter registry。
2. 顯示 Durable Artifact 狀態、SHA-256、Resolver 結論、Post-Artifact stage、Recovery 狀態。
3. persisted Artifact 未完成時提供「重新處理已保存的分析結果」。
4. 操作前顯示「不會再次聯絡 ChatGPT、不會消耗 token、不會修改原提交」。
5. 歷史 terminal 被 recovery supersede 時，顯示目前有效結論與可展開 lineage。
6. Provider Adapter failure、Artifact failure、Validation failure與Report／SQLite failure必須分層。
7. 只有 `ACTIVE_ANALYZED_RESULT_COMMITTED` 才允許自動導向 Results；recovery 成功也走同一 gate。

本版不建立多 Provider 生產選擇器；Mock 不得顯示。不得大改 Results UI 或 HTML 視覺。

## 11. 測試需求

### 11.1 v0.3.36 真實失敗重現與 Recovery Replay

使用指定 Debug Bundle，先 as-recorded 重現：

- Artifact SHA-256 符合指定值。
- Artifact receipt 為 persisted。
- stale reducer fact 為 false／null。
- 舊 terminal 為 `FAILED_NO_ARTIFACT`／`AI_ARTIFACT_SUBMISSION_MISSING`。

再用 v0.3.37 corrected code：

- Resolver 結論為 `PERSISTED_VALID`。
- contradiction guard 禁止 missing-artifact terminal。
- 不聯絡 Provider、token 增量 0、Artifact bytes/hash 不變。
- 啟動或人工 recovery 從正確 stage 執行 14-stage pipeline。
- 每 stage 產生 durable receipt。
- Canonical、Analyzed Result、isolated Active Result、Report Package、HTML 依實際 gate 產生。
- SQLite=`NOT_RUN_BY_TEST_ISOLATION`。
- 舊 terminal 保留；新 recovery terminal 與 supersession receipt 建立。
- 重跑 recovery 不重複副作用，所有 hash 維持一致。

若 Artifact 的既有語意／Quality Gate 本身阻斷，必須如實停在相應 stage 並產生 Diagnostic Package／HTML；不可為達成 Formal output 而修改模型內容。

### 11.2 Race／ordering tests

至少涵蓋：

1. Artifact persisted fact 先於 Provider completed。
2. Provider completed 與 persisted receipt 幾乎同時。
3. Provider completed 先到，但 Artifact handler 正在 fsync／reopen。
4. Artifact file 存在、receipt 暫未存在。
5. Receipt 存在、Artifact hash mismatch。
6. Run Manifest 與 fact journal 衝突。
7. `DEFER_POST_ARTIFACT` 不建立 terminal。
8. duplicate Artifact callback／duplicate Provider terminal idempotent。
9. App 在每個 persist ordering checkpoint crash 後恢復。
10. fact journal concurrent append sequence／hash chain 正確。
11. contradiction guard 不把 corrupt 誤報 missing。
12. normal new Run 仍只有一個 terminal。

測試不得依賴固定 sleep；使用 barrier、fake clock、controlled promise 或 deterministic scheduler。

### 11.3 Provider Adapter contract tests

- Common Request／Artifact 不 import ChatGPT／Codex type。
- ChatGPT Adapter capability／preflight／analyze／cancel mapping 正確。
- ChatGPT transport 保持 1 JSON + 3 MD、single primary Turn、無 batch／repair／fallback。
- Provider Artifact 不包含 Host identity、Canonical、HTML、SQLite。
- Adapter registry 無 silent fallback。
- Provider selection／identity 進 Run receipt。
- Core downstream 對 ChatGPT Adapter 與 Mock Adapter 使用相同 entry point。
- Mock 不在 production registry／UI／package config。

### 11.4 Mock full pipeline tests

使用 17 筆 fixture：

- 無網路、無 Codex process、無 auth。
- 產生 Provider Artifact 後 durable persist。
- 執行 14-stage receipts。
- 產生 Canonical、Analyzed Result、Package、HTML。
- SQLite isolation receipt 正確。
- 重跑完全 idempotent。
- 模擬 failed／cancelled 在 Artifact 前後的 terminal matrix。

### 11.5 歷史 regression

至少執行專案現有：

- v0.3.31 protected token segmentation。
- v0.3.32 quote-level quality gate。
- v0.3.33 multi-skill／HTML lifecycle。
- v0.3.34 lifecycle／Live runner boundary。
- v0.3.35 Artifact identity。
- v0.3.36 terminal reconciliation／summary／token telemetry。

若既有 script 名稱不同，先盤點後沿用，不可只改測試名稱冒充執行。

### 11.6 Opt-in Live 17

提供：

`npm.cmd run test:live:v0.3.37:17`

只有 `JAA_ENABLE_LIVE_PROVIDER_TEST=1` 才執行。必須使用真實本機選取 Pending JSON 與四份受控 MD、isolated Run root、ChatGptCodexProviderAdapter；不寫 production SQLite、不取代 production Active Result、不使用 retry／repair／fallback。保存 actual providerContacted、dispatch ledger、token telemetry、terminal、Artifact 與 14-stage receipts。未 opt-in 是 `NOT RUN`。

## 12. 實作順序

1. 盤點現況與保存 baseline evidence。
2. 驗證五份文件與 Manifest machine-readable JSON。
3. 建立 Provider-neutral types、Adapter registry 與 dependency direction tests。
4. 用 ChatGptCodexProviderAdapter 包覆現有正式流程，先保持行為等價。
5. 建立 reducer fact journal 與 durable writer。
6. 建立 DurableArtifactTruthResolver 與 contradiction guard。
7. 修正 Artifact persist ordering。
8. 修改 Terminal Reducer 每次重讀 facts，加入非終局 defer。
9. 將 14-stage Post-Artifact pipeline 真正接線並逐 stage durable 化。
10. 實作 startup／manual recovery 與 supersession lineage。
11. 實作 test-only Mock Adapter。
12. 更新最小 UI、Debug collector 與 completeness。
13. 跑聚焦測試、真實 replay、歷史 regression、typecheck、build。
14. 封裝後執行 packaged verifier 與隔離啟動。
15. 產生報告、commit、tag、push 並核對 remote。

每一步若發現較早 root cause，保留證據並調整實作；不得因預設答案而掩蓋新事實。

## 13. 必跑命令與驗證

依 repository 實際 scripts 建立或執行等價命令，最少包含：

```text
npm.cmd run typecheck
npm.cmd run test:v0.3.37
npm.cmd run replay:v0.3.36
npm.cmd run test:provider-adapter:v0.3.37
npm.cmd run test:mock-provider:v0.3.37
npm.cmd run build
npm.cmd run dist
git diff --check
```

Live command只有 opt-in 才跑。每項保存 wall-clock duration、exit code、PASS／FAIL／NOT RUN、providerContacted、productionSqliteWritten、ActiveResultReplaced、actual token telemetry 或 `unavailable`。不得估算 token 冒充實測。

## 14. 封裝與安全驗證

1. Installer、Portable、win-unpacked 的版本全部為 0.3.37。
2. Bridge v17 的實際 path、version、bytes、SHA-256、loadability 與 Runtime Registry 一致。
3. Bridge external-only／ASAR 配置依 repository 正確架構維持；不得同時封裝 stale Bridge。
4. Bundled Codex path、version、SHA-256 維持固定且不使用 PATH fallback。
5. ASAR／resources 不包含 `.env`、Token、Cookie、DB、Debug Bundle、測試資料、歷史 Prompt 或使用者檔案。
6. Production package 不包含 Mock Adapter selectable registration、Mock fixtures 或 test-only UI。
7. Packaged runtime 能驗證四份 Rule／Template exact bytes／SHA-256。
8. win-unpacked 與 Portable 在隔離 APP_ROOT 啟動，確認 `did-finish-load`、`renderer_boot`、initial route ready，無 white screen、renderer crash、`did-fail-load` 或 unresponsive。
9. Installer／Portable／win-unpacked 記錄 bytes、SHA-256 與 Build Time。

## 15. 正式報告

至少產生：

1. `JiraActivityAnalyzer_v0.3.37_test_and_verification_report.md`
2. `JiraActivityAnalyzer_v0.3.37_artifact_manifest.json`
3. `JiraActivityAnalyzer_v0.3.37_execution_time_ledger.json`
4. `JiraActivityAnalyzer_v0.3.37_durable_artifact_truth_report.md`
5. `JiraActivityAnalyzer_v0.3.37_terminal_reducer_recovery_report.md`
6. `JiraActivityAnalyzer_v0.3.37_provider_adapter_boundary_report.md`
7. `JiraActivityAnalyzer_v0.3.37_mock_provider_pipeline_report.md`
8. `JiraActivityAnalyzer_v0.3.37_debug_completeness_report.md`
9. `JiraActivityAnalyzer_v0.3.37_packaged_runtime_security_report.md`

主報告必須區分：

- Automated PASS。
- Offline replay PASS。
- Mock Provider PASS。
- Live Provider PASS／FAIL／NOT RUN。
- Manual Validation Pending。
- Blocked by security／permission。

報告中明確聲明：Mock Adapter、fixture replay 與 packaged diagnostic 都不等於真實 Provider 分析；若 Live 未 opt-in，Overall Status 不得宣稱 Full PASS。

## 16. 本版明確不做

- 不實作第二個真實 Cloud／Local Provider。
- 不建立 OpenAI API、Azure、Anthropic、Gemini、Ollama、LM Studio、vLLM 連線。
- 不做 automatic Provider fallback。
- 不變更 Decision v5 schema 或分類 Status 語意。
- 不變更 Skill Catalog 279 Skills。
- 不變更 Evidence Quote／Multi-skill／Quality Gate 語意。
- 不變更 Pending／Analyzed／Report Data Package／SQLite schema，除非 recovery receipt 必要的 additive metadata。
- 不變更 HTML Template v1.5.1、Renderer 1.5.1 視覺與 declarative DSL。
- 不調整 segment size、token optimization、固定 batch 或 automatic repair。
- 不大改 AI Analysis Results UI。
- 不自動執行 Live Provider。

第二個真實 Provider 應排在 v0.3.38 或後續版本，先根據本版 Adapter contract 與相容性測試再選擇。

## 17. 完成定義

只有全部符合才可宣告 v0.3.37 自動化交付完成：

1. 五份文件版本、bytes、SHA-256 與 Manifest binding 正確。
2. v0.3.36 真實案例可重現舊錯誤並由新 Resolver 正確認出 persisted Artifact。
3. contradiction guard 不再產生 false `AI_ARTIFACT_SUBMISSION_MISSING`。
4. 14-stage pipeline 可在不聯絡 Provider下 recovery，逐 stage durable、可重入。
5. 舊 terminal 未改寫，新 recovery terminal 與 supersession lineage 完整。
6. fact journal append-only、sequence／hash chain 通過驗證。
7. ChatGPT flow 全部經 ChatGptCodexProviderAdapter，核心無 concrete Codex type 依賴。
8. Mock Adapter 走完同一 downstream pipeline，且未進 production package selector。
9. Provider failure 不會 silent fallback。
10. Debug Folder 收錄 Artifact、facts、Resolver、Reducer、stage、recovery 與 completeness evidence。
11. 歷史 regression、typecheck、build、dist、packaged verifier 通過。
12. Windows 產物與 Git delivery 可驗證；未完成項目誠實標記。

Live Managed OAuth、公司 Jira、production SQLite 與乾淨 Windows Installer GUI 若未執行，Overall Status 應為 `Partial / Manual Validation Pending`，不得標成完全 PASS。

## 18. 最終回覆格式

最終回覆使用繁體中文並先給結果，至少包含：

- Target Version 與 Overall Status。
- Branch、Package Source Commit、Final Delivery Commit、annotated tag。
- Remote push、upstream ahead／behind、peeled tag SHA。
- Durable Artifact root cause 與修正結果。
- v0.3.36 replay：Artifact SHA、舊 terminal、Resolver 結論、recovery stages、supersession、Provider contact/token/SQLite/Active Result truth。
- Provider-neutral contracts、正式 Adapter 與 Mock Adapter 結果。
- typecheck、tests、replay、build、dist、packaged verifier、startup 的 PASS／FAIL／NOT RUN 與耗時。
- Installer、Portable、win-unpacked 路徑、bytes、SHA-256、Build Time。
- Bridge／Codex／Rule documents packaged identity。
- Live Provider 是否真的執行、actual token telemetry 或 `unavailable`。
- 所有正式報告路徑。
- 工作樹既有修改是否完整保留。

若 branch／tag push 被安全審查阻擋，明確列出本機 commit／tag 與未 push 狀態，不得聲稱 GitHub 已同步。

---

以上規格全部是 v0.3.37 的驗收條件。請以最小必要修改完成 Durable Artifact correctness 與 Provider-neutral boundary，先證明 Host 可以可靠消化已保存 Artifact，再為後續真實雲端／地端 Provider 擴充建立穩定介面。
