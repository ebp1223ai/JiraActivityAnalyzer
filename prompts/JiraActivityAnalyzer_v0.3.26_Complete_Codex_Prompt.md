# Jira Activity Analyzer v0.3.26 — 正式完整 Codex 實作 Prompt

## 0. 文件用途

請在既有 Jira Activity Analyzer repository 完成 `v0.3.26`。本文件是可直接交付 Codex 執行的完整實作、驗證、封裝與 Git 交付指令，不是概念草稿。

- Repository：`F:\AI\JiraActivityAnalyzer`
- Target Version：`0.3.26`
- Branch：`feat/v0.3.26-artifact-identity-evidence-quote-diagnostics`
- Annotated Tag：`v0.3.26`
- UI／Prompt／報告預設語言：繁體中文
- Provider：`chatgpt_codex`
- Bundled Codex：固定官方版 `0.147.0`
- Prompt identity：`JAA-CHATGPT-ZH-TW-0.3.26`
- Prompt template version：`0.3.26-zh-TW-v7`
- Bridge：`0.3.26-bridge-v8`
- Provider transport：`bridge-resumable-v3`
- Decision Contract：`jaa-ai-analysis-decisions-v5`
- Evidence Quote Catalog：`JAA-EVIDENCE-QUOTE-CATALOG-1.0.0`
- Artifact Submission Token：`jaa-artifact-submission-token-v1`
- Artifact Identity Receipt：`jaa-artifact-identity-receipt-v1`
- Canonical Contract：維持 `jaa-canonical-analysis-result-v5`
- Report Data Package：維持 `jaa-analysis-report-data-package-v1`
- HTML Template Contract：`jaa-html-report-template-v6`
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.0`

基線是已完成的 `v0.3.25`。保留四檔獨立選取、Draft／Active 原子交易、Attempt-first、Navigation Gate、Active Result、Results 精簡、Report Data Package、SQLite Gate、Bundled Codex 與 durable Debug evidence。本版只對 Artifact identity、Evidence quote、診斷產物、Debug completeness、Provider transport 與版本一致性進版。

## 1. 執行原則

開始修改前，完整檢查 repository、`AGENTS.md`、package scripts、目前 branch／HEAD／remote／工作樹、v0.3.25 實作與報告。使用者提供的 v0.3.25 Debug Folder 只能唯讀分析，不得改寫原始證據。

你必須自行完成：

1. 從實際程式碼與 Debug evidence 定位根因，不得只根據錯誤文字猜測。
2. 建立單一資料契約與可測試的生命週期，不得只修 UI 表象。
3. 修改 Electron main／preload／renderer、IPC、Bridge、Prompt、Schema、validator、Run archive、HTML renderer、Debug collector 與必要 migration。
4. 新增自動化測試、v0.3.25 submission replay 與 regression。
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

## 3. 已確認的 v0.3.25 事實

請先以程式碼與唯讀 replay 重現下列事實：

1. Run `analysis_59ac801d-9bae-4f3e-a129-bb4ab153feca` 完成 4/4 files、204,198/204,198 bytes、17/17 records、所有 segment ACK／EOF／hash。
2. 只有單一 request／thread／turn，無 retry／repair／fallback。
3. 模型提交 17 筆 decisions，index `0..16` 完整、無重複、無缺號。
4. JAA 以 `AI_ARTIFACT_RECEIPT_INVALID`／`Artifact submission Run identity binding mismatch` 拒絕唯一提交。
5. rejection receipt 顯示的 submitted `runId`、source SHA-256、Rule Snapshot ID、contract version 與 expected 值一致。
6. 因 receipt gate 失敗，無正式 Canonical、Analyzed Result、Package、HTML 或 SQLite；但 Provider stream 仍包含完整提交。
7. 共 33 筆 Evidence quotes；皆為正確 segment 的可讀 exact substring，但不等於包含 JSON wrapper／escape 的整段 `exactText`。
8. Debug Folder 未以獨立檔案保存完整 AI submission、identity comparison 與實際 navigation JSONL，並出現 `[ERROR] undefined: undefined`。
9. Provider 以 52 segments 分開 read 與 ACK，約 104 次 tool calls；cumulative token 988,441，顯示明顯傳輸／context overhead。
10. metadata 仍有舊 `promptTemplateVersion: 0.3.24-zh-TW-v6`，與 v0.3.25 不一致。

請產生根因報告，列出實際錯誤比對欄位、值、型別、normalization 前後、state source 與原始程式碼位置。不得只寫「改用 token 已解決」。

## 4. 已採納且不得擅自變更的十項決策

### 決策一：JAA 單一持有 Artifact identity

模型不再回傳 `runId`、`analysisAttemptId`、source hash、Rule Snapshot ID、request／thread／turn ID 或 contract identity。JAA 在 dispatch 前建立 immutable `ApprovedArtifactIdentity`，Bridge 接受後由本機注入正式 Artifact。

### 決策二：Opaque Artifact Submission Token

JAA 產生一次性、不可猜測、限本 Run／Attempt／Thread／Turn 的 `artifactSubmissionToken`。模型只提交 token + decisions + Analysis Report + final summary。完整 token 不寫入對話、UI、Debug 或正式輸出；只存 hash／prefix／binding receipt。

### 決策三：驗證前先持久化 AI 提交

只要 tool arguments 可安全解碼，必須先用 `.tmp -> fsync -> atomic rename -> reopen -> hash verify` 寫入 `ai-submitted-artifact-attempt-001.json`，再執行驗證。此檔是 append-only 診斷證據，不是 Canonical、Analyzed Result 或 SQLite 資料。

### 決策四：Decision v5 只引用 Evidence Quote ID

模型不再回傳自由文字 quote、`evidenceRef`、`evidenceSegmentId` 或 `evidenceRole`。每個 Skill Finding 只提交 `evidenceQuoteIds[]`；JAA 以 frozen local catalog 回填 exact source substring、display text、role、pointer、offset 與 hash。

### 決策五：Evidence Quote Catalog

JAA 在 dispatch 前將容器 Evidence Segment deterministic 解碼為可讀 line／sentence／log-row quote entries。只允許 unescape／unwrap／newline normalization，禁止摘要、改寫、翻譯或補字。

### 決策六：分層驗證

順序固定為 Token／Run binding → decodable submission → schema → count／index → quote IDs → source／role attribution → status semantic → quality → canonical → analyzed result → active result → package／HTML／SQLite。每層寫入獨立 receipt。

### 決策七：可解碼提交必須產生診斷產物

正式 gate 失敗仍必須產生 aggregate findings、Diagnostic Report Data Package 與 `DIAGNOSTIC_NON_CANONICAL` HTML，固定標示「AI 已提交／驗證失敗／Canonical 未建立／SQLite 禁止」。不導向 Results，留在 Workspace。

### 決策八：Canonical Debug Evidence

消除 `undefined: undefined`。Debug Folder 必須實際包含 Attempt、Rule receipts、navigation JSONL、AI submission、identity receipt、findings、diagnostic package／HTML、final response 與 completeness manifest，不得只存指向包外的 path。

### 決策九：bridge-resumable-v3

新增 `jaa_read_and_ack_next_segment`，一次 tool call 返回下一 segment 並 ACK 前一 segment。保留 cursor、order、hash、EOF、resume、durable receipt 與 fail-closed，不得改成固定 batch、逐筆 request 或自動 repair。

### 決策十：版本一致與 v0.3.25 Submission Replay

所有 metadata、UI、Run manifest、effective instruction、Debug 與 package 統一顯示 `JAA-CHATGPT-ZH-TW-0.3.26`、`0.3.26-zh-TW-v7`、`0.3.26-bridge-v8`、`jaa-ai-analysis-decisions-v5`、`bridge-resumable-v3`。建立不呼叫 Provider 的唯讀 replay harness。

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
- `Skill_Catalog_v0.3.1.md`，必須與 v0.3.25 byte-for-byte 相同
- `Skill_Analysis_HTML_Report_Template_v1.5.0.md`

每份 MD 的版本必須同時出現於檔名與 machine-readable metadata。Manifest v0.8.0 必須綁定其餘三份的 exact basename、version、bytes、SHA-256 與 consumer。Catalog 不得因 BOM、換行或格式化改變 bytes。

## 7. Approved Artifact Identity 與 Token

### 7.1 ApprovedArtifactIdentity

Preflight 成功後由 JAA main process 建立 immutable object：

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

此 object 一經 Provider dispatch 不可被 renderer state、新一次 Rule selection、stale React closure 或模型輸出覆寫。

### 7.2 Token 生命週期

1. 使用 CSPRNG 產生至少 256-bit token。
2. 將 token hash 綁定 ApprovedArtifactIdentity、dynamic tool name、thread／turn 與 expiry。
3. Tool schema 只接受 token、decisions、analysisReportMarkdown、finalSummaryZhTw。
4. 拒絕空 token、錯誤 token、過期 token、跨 Run／Turn token、已使用 token 與第二次 submission。
5. 只有 Bridge 能將 ApprovedArtifactIdentity 注入 persisted submission。
6. 無論 accept／reject，產生 `jaa-artifact-identity-receipt-v1`。

### 7.3 Identity Receipt

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
7. Results 保留 v0.3.25 的 Active Dataset、成功歷史、lineage、統計、結果、CSV、HTML 與 review；不把 diagnostics 搬回 Results。

## 14. bridge-resumable-v3

### 14.1 Combined tool

`jaa_read_and_ack_next_segment` 的 request 至少含 current cursor 與 previous segment ACK（首次為 null）；response 至少含 next segment、sequence、bytes、hash、next cursor、EOF 與 durable ACK receipt ID。

### 14.2 安全規則

- ACK hash 不符、cursor 退回／跳號、順序重複、非預期 EOF 立即 fail closed。
- resume 必須從最後 durable ACK 繼續，不重送已確認 segment。
- 最後一 segment 需有 final ACK；必須能證明所有 files／segments／bytes／hash／EOF 完整。
- 保留單一 request／thread／turn。
- 不改變檔案內容，不將內容抽出改成新的文字 Prompt。

### 14.3 效能報告

使用相同 fixture 比較 v2／v3：tool-call count、input delivery duration、provider duration、wall time、input／cached／output／reasoning／total tokens（僅實際 telemetry）、provider-stream bytes 與 conversation bytes。不得保證 ChatGPT 推理時間一定縮短；只可宣稱已測得的 transport overhead 改善。

## 15. Debug Folder v0.3.26

必收證據：

```text
attempt-manifest.json
attempt-status.jsonl
active-rule-set-receipt.json
rule-selection-receipts/
pending-dataset-receipt.json
run-manifest.json
model-delivery-receipt.json
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
3. 當 file 不應產生時標示 `not_expected` 與正確 lifecycle reason；不得標成 missing。
4. 當 AI submission 可解碼但 diagnostic package／HTML 沒有產生，completeness 必須失敗並指出 owner stage。
5. 錯誤 normalization 必須處理 Error、string、structured IPC error 與 unknown；UI／log 永遠有穩定 code 與繁中 message。
6. 完整 token、OAuth／session／cookie 與憑證不得被包入。

## 16. 繁體中文 Standard Formal Prompt

Effective instruction 必須完整使用繁體中文，並明確告知模型：

1. 使用 `bridge-resumable-v3` 完整讀取 `1 JSON + 3 MD`，完成前不得分類。
2. 檢查 4/4 files、N/N records、all segments、EOF／hash／ACK。
3. 依 Common Rules v1.6.0、Catalog v0.3.1、Manifest v0.8.0 分析每筆。
4. 只引用 JAA 提供的 `evidenceQuoteId`，不得自造 ID 或重打 quote。
5. 使用 Decision v5 direct JSON array，exact N records，index `0..N-1`。
6. 提交前自我檢查 count、index、Status matrix、Catalog membership、quote IDs、PRIMARY_CHANGE、multi-skill 獨立理由。
7. 只提交一次；無自動 repair、無固定 batch、無逐筆 submission。
8. 同一次 tool submission 附上完整繁中 Analysis Report 與簡短 final summary，必須實話說明輸入完整度、已分析數量、結果分布、限制與是否已提交。
9. 模型不負責檔案 I/O、HTML、Package、SQLite、Run identity 或 source hash。

Custom instruction mode 仍可附加使用者指令，但不可覆寫 Token、Decision v5、count、Evidence Quote ID、一次 submission、安全與 formal gate。

## 17. 自動化測試

新增 `npm.cmd run test:v0.3.26`，至少覆蓋：

### 17.1 Identity／Token

1. ApprovedArtifactIdentity 建立後 immutable。
2. 正確 token 單次提交成功。
3. missing／invalid／expired／replayed／cross-run／cross-turn token 拒絕。
4. 模型 payload 不含 identity 欄位也能由 Bridge 正確組裝。
5. v0.3.25 submitted values 與 expected 相同時不再誤報 mismatch。
6. Receipt 可指出真正 mismatch field、type 與 normalized values。
7. Debug／UI／conversation 不洩露完整 token。

### 17.2 Persist-before-validate

1. schema／semantic／quality 失敗前已 durable 保存 AI submission。
2. 重新開啟與 hash verify 通過。
3. 不完整 temp file 不可被視為 submitted artifact。
4. 同一次 submission 不被重複覆蓋；第二次必須另建 attempt 或拒絕。

### 17.3 Evidence Quote Catalog／Decision v5

1. JSON-wrapped Comment 能產生可讀 displayText 且回溯 raw offsets／exact substring。
2. Unicode、CRLF、literal `\\r\\n`、escaped quote、NBSP、tab 與中文不失真。
3. 同一 input 產生相同 quote IDs／hash。
4. 不同 record 不可互引 quote ID。
5. missing／unknown／wrong-record／wrong-role／hash-mismatch quote ID 被聚合檢出。
6. `CLASSIFIED` 每個 Skill 至少一個 PRIMARY_CHANGE eligible quote ID。
7. Decision v5 拒絕 legacy free-form quote fields 與 additional properties。
8. v0.3.25 的 33 筆可讀 substring 經 deterministic catalog 對應後可通過 trace validation，不要求等於整段 JSON container。

### 17.4 分層 Validation／Diagnostic

1. 每層 receipt 順序、input hash 與 terminal state 正確。
2. decodable but invalid submission 產生完整 aggregate findings。
3. 產生 Diagnostic Package 與 HTML，且有 non-canonical／SQLite denied 永久警示。
4. Diagnostic 不建立 Canonical／Analyzed Result、不替換 Active Result、不寫 SQLite、不允許 Results 導頁。
5. Formal pass 仍走 v0.3.25 Active Result／Package／HTML／SQLite pipeline。

### 17.5 bridge-resumable-v3

1. 52 segments 的正常 combined read／ACK／EOF。
2. missing ACK、wrong hash、cursor skip／rollback／duplicate、early EOF 皆 fail closed。
3. crash／restart 從最後 durable ACK resume。
4. 結果 bytes／hash 與 v2 byte-for-byte 相同。
5. tool-call count 明顯低於分離 read／ACK，並有可重現 benchmark receipt。

### 17.6 Debug／UI／Version

1. Debug Folder 包含所有必收實體檔案與 hash，無 external-path-only receipt。
2. `undefined: undefined` 無法經任何 Error／string／object／unknown 路徑產生。
3. AI submitted but rejected 時 Workspace 文案與 actions 正確。
4. Results 不被 failed diagnostic Run 污染。
5. 所有 identity 無 stale `0.3.24`／`0.3.25` prompt／bridge／decision metadata。

### 17.7 Regression

v0.3.25 的 per-file rule selection、Draft／Active、Attempt-first、navigation、Active Result、manual import、Report Package、Snapshot、HTML、SQLite、Debug Attempt 與 17／117 fixture 測試不得退化。

## 18. v0.3.25 Submission Replay

建立 local-only test harness，從使用者 Debug Folder 回收唯一 tool submission，不呼叫 Provider、不修改 archive，不寫 production SQLite。輸出報告至少證明：

1. 17 decisions／`0..16` 完整。
2. 舊 identity mismatch 真正程式根因。
3. 移除 model-owned identity 後，token／Bridge injection 通過。
4. 33 筆舊 quotes 可對應至 Quote Catalog entries 或明確列出不可對應原因。
5. Decision v5 轉換後 schema／semantic／quality 結果。
6. Formal 或 Diagnostic pipeline 的實際終態，不得預設必然成功。
7. 產生可檢視 HTML，但 replay 產物明確標示 TEST／REPLAY／NOT PRODUCTION。

## 19. 真實案例驗證

### 19.1 17 筆

若 Managed OAuth 可用，以 v0.3.26 Standard Formal 執行一次，驗證 4/4 delivery、17/17 submission、token／identity、Quote IDs、Formal／Diagnostic terminal state、Debug completeness 與 UI。不得因本版目標而預先宣稱必須 Formal PASS。

### 19.2 117 筆

真實 Provider Run 與 fixture replay 必須分開報告。若無法安全執行真實 117 筆，只做唯讀 fixture regression 並標記 Manual Validation Pending。

### 19.3 失敗案例

至少測試錯 token、錯 quote ID、context-only CLASSIFIED、invalid status matrix、第二次 submission、diagnostic HTML 失敗與 Debug export。確認原 Active Result 不被取代。

## 20. Build、Package 與啟動驗證

至少執行並記錄 actual start／finish／duration／exit code：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.26
npm.cmd run build
npm.cmd run dist
git diff --check
```

另須：

1. 檢查 package source commit 與 dirty state。
2. ASAR 只能含 v0.3.26 Bridge 與本版四份正式 MD，不得殘留 stale Bridge／Rule／Template。
3. 掃描敏感檔名、credential patterns、`.env`、token、DB、Debug Bundle 與不應封裝資料。
4. 驗證 bundled Codex version／path／SHA-256。
5. 驗證四份 Rule／Template MD basename／version／bytes／SHA-256／Manifest binding。
6. 以隔離 profile 短啟動 win-unpacked 與 Portable，確認 renderer boot、did-finish-load、route ready，無 crash／white screen／unresponsive。
7. Installer、Portable、win-unpacked EXE 必須列出完整 path、bytes、SHA-256、Build Time 與 Package Source Commit。

## 21. 正式報告

至少產生：

- `JiraActivityAnalyzer_v0.3.26_test_and_verification_report.md`
- `JiraActivityAnalyzer_v0.3.26_artifact_manifest.json`
- `JiraActivityAnalyzer_v0.3.26_execution_time_ledger.json`
- `JiraActivityAnalyzer_v0.3.26_artifact_identity_root_cause_report.md`
- `JiraActivityAnalyzer_v0.3.26_artifact_submission_token_report.md`
- `JiraActivityAnalyzer_v0.3.26_ai_submission_durability_report.md`
- `JiraActivityAnalyzer_v0.3.26_decision_v5_contract_report.md`
- `JiraActivityAnalyzer_v0.3.26_evidence_quote_catalog_report.md`
- `JiraActivityAnalyzer_v0.3.26_layered_validation_report.md`
- `JiraActivityAnalyzer_v0.3.26_diagnostic_artifact_html_report.md`
- `JiraActivityAnalyzer_v0.3.26_bridge_resumable_v3_performance_report.md`
- `JiraActivityAnalyzer_v0.3.26_v0325_submission_replay_report.md`
- `JiraActivityAnalyzer_v0.3.26_debug_completeness_report.md`
- `JiraActivityAnalyzer_v0.3.26_rule_template_alignment_report.md`
- 適用的 Results／SQLite／Package regression 報告

Execution ledger 至少含 step、startedAt、finishedAt、durationMs、exitCode、result、evidence path。Actual token telemetry 只能使用 Provider／Runtime 實際值；無法取得就填 `unavailable`，禁止以檔案大小、字數或估算冒充。

## 22. Git 交付

1. 建立 `feat/v0.3.26-artifact-identity-evidence-quote-diagnostics`。
2. 僅 stage 本版檔案；保留使用者既有 dirty／untracked 資料。
3. 建議先提交 package source commit。
4. 從該 commit build／dist，產生報告與 artifact manifest。
5. 提交 final delivery commit。
6. 建立 annotated tag `v0.3.26` 指向 final delivery commit。
7. push branch 與 tag，驗證 upstream ahead／behind `0/0` 與 remote SHA。

若 push 遭權限、安全政策或遠端拒絕，停止並誠實報告；不得 force push、改用其他 remote 或規避。

## 23. Definition of Done

只有同時符合下列條件，才可宣稱自動化交付完成：

1. 實際程式根因報告說明 v0.3.25 false identity mismatch。
2. 模型不再回傳 JAA-owned identity，改用 opaque single-use token。
3. 可解碼 submission 在 validation 前 durable 保存。
4. Decision v5 只引用 `evidenceQuoteIds[]`。
5. Quote Catalog 同時可讀、exact traceable、deterministic 且 role-aware。
6. Validator 分層並產生獨立 receipts，不再把 submitted-rejected 顯示成未分析。
7. Decodable but invalid submission 有 findings、Diagnostic Package 與 HTML，且無 Canonical／SQLite／Results navigation。
8. Debug Folder 包含實體 AI submission、identity、navigation、diagnostic 與 completeness evidence，且無 `undefined: undefined`。
9. bridge-resumable-v3 保留完整性並有實測 tool-call overhead 改善。
10. v0.3.25 submission replay 不呼叫 Provider 即可重現舊錯誤與驗證新管線。
11. Prompt／Bridge／Decision／Transport／Rule／Template／Renderer identity 一致，無 stale metadata。
12. v0.3.25 Rule Selection、Navigation、Active Result、Results、Package、HTML、SQLite 與 Debug 無退化。
13. typecheck、test:v0.3.26、build、dist、git diff check、ASAR 與隔離啟動通過。
14. 正式產物、SHA-256、報告、commit、tag 與 push 完成。

真實 Managed OAuth、117 筆、production SQLite 或乾淨 Windows Installer GUI 若未執行，Overall Status 必須是 `Partial / Manual Validation Pending`，不得宣稱 Fully Validated。

## 24. 最終回覆格式

使用繁體中文，先給結果，再列證據：

1. Target Version 與 Overall Status。
2. Branch、Package Source Commit、Final Delivery Commit、Tag、Push／upstream。
3. 十項決策各自實作結果。
4. v0.3.25 identity 根因與 submission replay 結果。
5. Token、AI submission durability、Decision v5、Quote Catalog、layered validation、diagnostic HTML、Debug 關鍵驗證。
6. v2／v3 transport 實測比較，不夸大成效。
7. typecheck／test／build／dist／git diff／ASAR／啟動結果與實際耗時。
8. Installer／Portable／win-unpacked 的 path、bytes、SHA-256。
9. Bundled Codex、Bridge、Prompt、Decision、Transport、Rule Set、Template、Renderer identities 與 hash。
10. 報告路徑、人工驗證待辦與 Actual token telemetry；無法取得時寫 `unavailable`。
11. 使用者既有 dirty／untracked 資料是否完整保留。

不得只回覆「已修正」或只列 PASS；必須提供可追溯 commit、artifact、hash、receipt、報告與真實限制。
