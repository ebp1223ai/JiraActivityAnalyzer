# Jira Activity Analyzer v0.3.36 正式完整 Codex Prompt

## 0. 任務角色與核心目標

你是 JiraActivityAnalyzer（以下簡稱 JAA）專案的主要 Codex 實作者。請在既有 repository 中完成 **v0.3.36：Terminal Reconciliation、Artifact Identity 與 Post-Artifact Recovery Correctness**。

本版是針對 v0.3.35 真實 17 筆 Managed ChatGPT Run 的窄範圍 correctness release。模型已讀完 4/4 檔案、提交 17 筆 Decision Artifact，Validation 01–08 亦已通過；但 Host 在 Provider terminal event 到達後錯誤覆寫成 `AI_ANALYSIS_NOT_STARTED`，導致 Canonical、Analyzed Result、Report Package 與 HTML 均未建立。本版必須修正這個因果錯誤，不得藉機重構無關功能。

核心結果必須是：

1. 只有單一 Host-side Terminal Outcome Reducer 能決定 Run terminal outcome。
2. Durable Artifact submission 本身足以證明分析已開始且已完成。
3. 合法 Artifact 不得被後到的 Provider failed／cancelled／completed callback 覆寫。
4. Post-Artifact pipeline 可冪等、可重入、可在中斷後復原。
5. Artifact Identity 只由 immutable Runtime Contract Registry 提供，且 expected／actual 必須為獨立來源。
6. Artifact 狀態、receipt、檔案 bytes/hash、lifecycle、root error 與 UI 必須一致。
7. v0.3.35 真實 Debug Bundle 必須同時完成 as-recorded forensic replay 與 corrected-host-identity isolated replay。

不要只修改畫面文字、不要吞掉錯誤、不要把失敗改名成成功、不要改寫模型提交內容來通過驗證。

## 1. 安全、授權與工作樹規則

1. 先唯讀檢查 repository、目前 branch、HEAD、status、現有 scripts、package version 與既有測試。
2. 建立 branch：

   `feat/v0.3.36-terminal-reconciliation-artifact-identity-correctness`

3. 使用者既有 tracked 修改、untracked 檔案、測試資料、Debug Bundle、database、`token.txt`、歷史 prompt、PDF、UI 資料夾均不得修改、移動、刪除、暫存或提交。
4. 禁止 `git reset --hard`、`git checkout --`、`git clean`、遞迴刪除、force push 或任何會覆蓋使用者資料的命令。
5. 不得讀取、輸出、提交或封裝 credential、Bearer Token、PAT、OAuth token、完整 opaque handle、nonce 或 session secret。
6. 若既有 dirty tree 會阻擋 dist，先報告精確原因；只能使用專案既有且明示授權的 dirty-build 機制，且報告必須保留 `dirtyState=true`。不得把既有修改加入本版 commit。
7. Debug Bundle 只能唯讀解壓至 ignored／temporary test root；不得改寫原壓縮檔。
8. Live Provider test 預設禁止。只有 `JAA_ENABLE_LIVE_PROVIDER_TEST=1` 且 prerequisites 完整時才允許執行；缺少條件應記為 `NOT RUN`，不得冒充 PASS。
9. Offline replay 不得呼叫 ChatGPT、不得寫 production SQLite、不得替換 Active Result。
10. 遇到 byte-exact 文件、Identity 或契約衝突必須 fail closed 並停止猜測；先列出 expected／observed 與來源。

## 2. Target、Git 與受控 Identity

### 2.1 Target

- Application Version：`0.3.36`
- Prompt Identity：`JAA-CHATGPT-ZH-TW-0.3.36`
- Prompt Template Version：`0.3.36-zh-TW-v17`
- Pipeline：`JAA-ANALYSIS-PIPELINE-0.3.36`
- Bridge：`0.3.36-bridge-v16`
- Host Lifecycle：`jaa-host-control-lifecycle-v3`
- Terminal Reducer：`jaa-terminal-outcome-reducer-v1`
- Post-Artifact Pipeline：`jaa-post-artifact-pipeline-v1`
- Artifact Submission Result：`jaa-artifact-submission-result-v3`
- Provider Transport：`bridge-resumable-v4`（不變）
- Decision Contract：`jaa-ai-analysis-decisions-v5`（不變）
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.1`（不變）
- Bundled Codex：維持專案目前已鎖定的官方固定版本；不得升級、下載或改用 PATH fallback。

所有 runtime identity 必須由同一份 immutable Runtime Contract Registry 建立，但驗證時 expected 與 actual 不得引用同一個已組裝物件做自我比較。

### 2.2 Git 交付

- Source commit：只包含 v0.3.36 實作、測試、受控文件與必要報告。
- Final delivery commit：可包含最終 artifact manifest、驗證報告與 execution ledger。
- Annotated tag：`v0.3.36`，必須指向 Final Delivery Commit。
- Push branch 與 tag；若安全審查或權限阻擋，誠實回報，不得宣稱成功。
- 最後核對 upstream ahead／behind 與 remote peeled tag SHA。

## 3. 五份正式文件與 byte-exact 綁定

本次交付包含下列五份文件。先驗證檔名、內部版本、UTF-8、bytes 與 SHA-256，再開始修改程式：

| Role | File | Version | Bytes | SHA-256／規則 |
|---|---|---:|---:|---|
| Codex Prompt | `JiraActivityAnalyzer_v0.3.36_Complete_Codex_Prompt.md` | v0.3.36 | runtime | 保存實際 bytes／SHA-256 |
| Rule Set Manifest | `Skill_Analysis_Rule_Set_Manifest_v0.8.5.md` | 0.8.5 | runtime | 本檔不得固定自我 Hash；載入時計算 |
| Common Rules | `Skill_Classification_Common_Rules_v1.6.5.md` | 1.6.5 | 51776 | `c819004275aff3c6b3fc646b994ef1077a8e4385730e07460fdd0e36d4aef10d` |
| Skill Catalog | `Skill_Catalog_v0.3.1.md` | 0.3.1 | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| HTML Template | `Skill_Analysis_HTML_Report_Template_v1.5.1.md` | 1.5.1 | 38057 | `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02` |

Manifest v0.8.5 與 Common Rules v1.6.5 是本版新文件。Catalog v0.3.1 與 HTML Template v1.5.1 必須與上一版 byte-identical，不得因換行、BOM、格式化或日期而改變 Hash。

正式 Provider 輸入仍只有：

1. Pending Dataset JSON
2. Rule Set Manifest v0.8.5
3. Common Rules v1.6.5
4. Skill Catalog v0.3.1

HTML Template v1.5.1 只供本機 renderer 使用，不送給 ChatGPT。

## 4. v0.3.35 真實 17 筆證據（本版主要回歸基準）

來源 Debug Bundle：

`jira-activity-analyzer-debug-folder-20260825_103041.7z`

### 4.1 Run identity 與實際輸入

- Application：v0.3.35
- Run ID：`analysis_505bee1a-564e-4c23-9e5d-510bc24f573c`
- Provider：1 request／1 thread／1 turn
- Retry／Repair／Fallback：0／0／0
- Files：4/4
- Records：17/17
- Model delivery bytes：324,945
- Segments：82/82
- Bridge calls：90
  - manifest：1
  - read：86（82 success + 4 recoverable cursor mismatch）
  - status：1
  - finalize：1
  - publish：1
- Duration：308,575 ms（約 5 分 08.6 秒）

### 4.2 模型確實完成並提交

- Artifact submission：1 次
- Decisions：17
- Skill Findings：40
- Evidence Quote references：44
- Unique Quotes：40
- Status：
  - `CATALOG_DETAIL_MISSING`：13
  - `UNKNOWN`：1
  - `EXCLUDED`：3
- Validation stages 01–08：全部 PASSED，findings=0
- Host control transitions：

  `ATTEMPT_CREATED → PROVIDER_DISPATCHED → INPUT_READING → INPUT_READY → ARTIFACT_RECEIVED → VALIDATING`

- Telemetry 已出現：`COMPLETED_BY_ARTIFACT`

以上證據代表「模型未開始分析」在此 Run 中不可能為真。

### 4.3 已證實的錯誤

Provider terminal handler 在 Artifact 已 durable submit、`analysisCompleted=true` 的情況下，仍因 stale `analysisStarted=false` 強制寫入：

- `AI_ANALYSIS_NOT_STARTED`
- `provider_failed`

因此錯誤阻斷：

- Canonical Result
- Analyzed Result JSON
- Active Result
- Report Data Package
- HTML
- SQLite gate

這不是模型分析失敗，也不是 Artifact schema failure；是 Host terminal reconciliation failure。

### 4.4 Lifecycle 與 receipt 矛盾

同一 Run 同時存在：

- Artifact receipt：`published`
- Lifecycle artifact：`rejected`
- Validation receipt 01–08：PASSED
- Lifecycle validation：`not_started`
- `firstFailedStage=INPUT_READING`
- 但 control state 已到 `INPUT_READY`、`ARTIFACT_RECEIVED`、`VALIDATING`
- `rootErrorStage=null`

這些狀態不能再由不同 handler 各自寫入；必須由 reducer 與 reconciliation service 統一。

### 4.5 Stale Artifact Identity 自我驗證

Runtime Registry 實際為：

- Application 0.3.35
- Prompt 0.3.35
- Bridge v15

但 approved Artifact Identity 仍為：

- Application 0.3.34
- Prompt 0.3.34
- Bridge v14

舊 validator 以同一 stale object 同時產生 expected 與 actual，因而錯誤通過。v0.3.36 必須讓 dispatch-time expected 與 artifact-time Host injection 從獨立路徑取得、再逐欄比較。

### 4.6 Final message 被覆寫

- Artifact receipt 綁定的 `final-assistant-message.txt`：162 bytes，SHA-256 prefix `edd1509d...`
- Debug Folder 最終同名檔：438 bytes，SHA-256 prefix `19414272...`

原因是 artifact final summary 與 provider full final response 共用檔名，後者覆寫前者。任何 durable receipt 綁定的檔案都不可被後續事件改寫。

### 4.7 Debug 與 token truth

Debug completeness 錯誤標示 `artifactSubmissionAttemptExpected=false`，但實際存在 artifact submission。Conversation 中可取得真實數字：

- input tokens：1,977,962
- cached input tokens：1,836,032
- output tokens：10,530
- reasoning tokens：1,877
- total tokens：1,988,492
- usage events：25
- model context window：null／unavailable

數字型 token telemetry 不屬於 credential，不得被 sanitizer 清空或改成 `[masked]`；真正的 token、credential、handle、nonce 仍必須遮罩。

## 5. 十項已採納決策（全部為 MUST）

### 決策一：單一 Host-side Terminal Outcome Reducer

建立 `jaa-terminal-outcome-reducer-v1`。只有 reducer 可以輸出 Run terminal state 與唯一 `run_terminal` event。

禁止下列元件直接 terminalize：

- Provider completed／failed／cancelled callback
- Artifact publish handler
- Bridge dynamic tool handler
- timeout handler
- renderer／SQLite callback
- renderer UI callback
- interrupted recovery callback

各 callback 只能 durable append fact／receipt，然後呼叫 reducer。Reducer input 至少包含：

- Provider terminal fact
- Artifact durable status與 hash
- Validation stage receipts
- Post-Artifact pipeline state
- cancellation／timeout fact
- current durable Host Controller snapshot

Reducer 必須純粹、deterministic、可重播、無 side effect；terminal commit 由單一 service 完成且 idempotent。

### 決策二：Durable Artifact 推導分析已開始且完成

只要 Artifact submission 已完成 token／scope／binding 檢查並 durable persist：

- `analysisStarted=true`
- `analysisCompleted=true`
- `analysisTelemetry=COMPLETED_BY_ARTIFACT`
- control state 至少為 `ARTIFACT_RECEIVED`

不得要求模型另外回報 `ANALYSIS_STARTED` 或 `ANALYSIS_COMPLETED` progress 才承認分析完成。Progress 僅是 optional telemetry。

若舊 snapshot 中 `analysisStarted=false` 但已有 durable Artifact，reconciliation 必須修正 derived view，不得產生 `AI_ANALYSIS_NOT_STARTED`。

### 決策三：Provider terminal 固定矩陣

實作並測試下列最小矩陣：

| Provider terminal | Durable valid Artifact | Outcome |
|---|---:|---|
| completed | yes | 繼續／恢復 Post-Artifact pipeline |
| failed | yes | 保留 provider warning；繼續／恢復 pipeline |
| cancelled | yes | 保留 provider warning；繼續／恢復 pipeline |
| completed | no | `FAILED_NO_ARTIFACT` |
| failed | no | `FAILED_PROVIDER` |
| cancelled | no | `CANCELLED` |

「valid Artifact」在此矩陣是 token/binding 合法且 durable persisted；後續 content validation 可能成功或失敗，但不得改寫成「分析未開始」。Formal validation failure 要以實際 stage/root error 表達。

Provider terminal event 晚到、重複或亂序時，reducer 必須 idempotent，不能產生第二筆 terminal event。

### 決策四：冪等、可重入的 Post-Artifact Pipeline

建立 `jaa-post-artifact-pipeline-v1`，idempotency key 固定為：

`runId + artifactSha256`

下列入口皆呼叫同一 service：

1. Artifact handler
2. Provider terminal handler
3. Application startup interrupted-run recovery
4. Workspace 的手動重新處理／復原操作

固定 stage：

1. Content Validate
2. Formal Publish
3. Canonical Assembly
4. Analyzed Result Publish
5. Active Result Commit
6. Report Data Package
7. HTML Render
8. SQLite Gate

每個 stage 使用 durable receipt、atomic temp write、fsync、rename、reopen/hash verify。已成功 stage 不得重做 side effect；中斷後從第一個未完成 stage 繼續。相同 key 重入回傳同一結果，不新增第二份 canonical 或重複 SQLite child rows。

### 決策五：Artifact Identity 只來自 immutable Runtime Contract Registry

建立單一 immutable Runtime Contract Registry，至少含：

- applicationVersion
- promptIdentity
- promptTemplateVersion
- pipelineIdentity
- bridgeIdentity
- transportIdentity
- decision contract
- manifest/common/catalog/template identities

Dispatch-time expected identity 必須在 dispatch 前凍結並存 receipt。Artifact-time actual identity 由 Host 在 publish 時重新從 registry 注入，不接受模型提供 identity。

禁止：

- spread 舊版 identity object
- fallback 到 v0.3.34 常數
- expected／actual 指向同一 mutable object
- 將 stale expected 複製成 actual 後自我比較
- 為通過測試改寫模型 Artifact bytes

逐欄比較結果需保存 expected、observed、match boolean 與來源描述；不得保存敏感值。

### 決策六：統一 Artifact 四階段狀態

正式 vocabulary 只有：

1. `received`：已收到提交呼叫，尚未證明 durable。
2. `persisted`：原始 Artifact 已 durable 保存、reopen/hash verify。
3. `content_validated`：Decision/schema/semantic/quality 所需正式檢查已通過。
4. `formally_published`：正式 Artifact receipt 與 canonical pipeline publish boundary 已完成。

動態工具成功回覆最多只能是 `persisted`。禁止在 validation 前回覆或記錄 `published`。

若 content validation 失敗：Artifact 仍為 `persisted`，formal artifact 不得標成 published；應保留 aggregate findings 與 Diagnostic path。

所有 UI、conversation、provider stream、lifecycle、debug completeness 與 receipt 都使用同一 vocabulary。

### 決策七：Final Summary 與 Provider Final Response 分檔

使用兩份不同 durable artifact：

- `artifact-final-summary.txt`：Artifact submission 當下模型提供的 final summary；一旦 receipt 綁定即 immutable。
- `provider-final-assistant-message.txt`：Provider terminal event 所帶完整 final assistant response；採 atomic create/replace 自己的檔案，不得覆寫前者。

兩者都需保存 bytes、SHA-256、createdAt、source event sequence。Conversation 以 append-only event 引用它們；不要把全文重複塞入每個 lifecycle event。

若名稱因現有相容性必須保留 legacy alias，alias 只能讀取，不得成為 receipt authoritative path，且需清楚標記 deprecated。

### 決策八：Lifecycle／Receipt／Root Error Reconciliation

新增 deterministic reconciliation service，至少檢查：

- control state 與 analysis derived flags
- Artifact status 與實體檔案 bytes/hash
- Validation stages 01–14 與 durable evidence
- firstFailedStage 與第一個 FAILED receipt
- rootErrorCode／Stage／Message
- Canonical／Analyzed／Active／Package／HTML／SQLite 實體與 receipt
- terminal outcome 與 reducer inputs

規則：

- Stage 已有 PASSED durable receipt，lifecycle 不得顯示 `not_started`。
- `firstFailedStage` 必須等於第一個 FAILED stage；沒有 FAILED stage 時必須是 null。
- Success／completed_with_warnings 的 root error fields 必須全為 null。
- Formal failure 必須保留真正 root error；下游未產生是 derived consequence。
- Artifact receipt bytes/hash 與 Debug 實體不一致時 fail closed，finding 必須列出 expected／observed。
- 不得用最後寫入者勝出修補矛盾。

### 決策九：Debug 與 UI 顯示真實狀態

Debug completeness 必須由 durable evidence 與 lifecycle 推導：

- 有任何 artifact tool call／submission receipt／persisted file，就不得標示 submission not expected／not produced。
- 分開顯示 Provider、Input Delivery、AI Submission、Artifact、Validation、Canonical、Analyzed Result、Package/HTML、SQLite。
- UI 不得因 Provider failed 隱藏 persisted Artifact 或 validation receipts。
- Workspace 顯示 root error 與 derived consequences；Results 仍只在 Active Result commit 後開放。
- numeric token usage 原值保留；credential sanitizer 只處理真正秘密。
- `modelContextWindow=null` 顯示 unavailable，不得估算百分比。
- Debug manifest 收錄 actual files，不只保存外部 path。

### 決策十：v0.3.35 雙軌 Replay 與 Live 邊界

必須建立兩個互不冒充的 replay：

#### A. As-recorded forensic replay

- 完全使用 v0.3.35 Debug 中已記錄的 Host identity 與 receipts。
- 不修補 stale 0.3.34 identity。
- 預期結果：偵測 `IDENTITY_MISMATCH`，並列出 stale approved identity 與 v0.3.35 runtime identity。
- 不建立 Formal Canonical；可建立 forensic/diagnostic report。

#### B. Corrected-host-identity isolated replay

- 模型擁有的 Artifact bytes、17 Decisions、40 Skill Findings、44 quote refs 全部不變。
- 只用 v0.3.36 正確 Runtime Registry 重新注入 Host-owned identity 與重跑 Host pipeline。
- 預期完成：Content Validation、Formal Publish、Canonical、Analyzed Result、Report Data Package、HTML。
- SQLite receipt：`NOT_RUN_BY_TEST_ISOLATION`。
- 不聯絡 Provider、不取代 production Active Result、不寫 production DB。

Live 17 E2E 只有明確 opt-in 才可執行，不能以 replay 取代。

## 6. Host Controller、Reducer 與事件模型

### 6.1 Required control lifecycle

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

Control transition 只能 append durable transition receipt，再更新 materialized snapshot。Snapshot 是 projection，不是第二權威來源。

### 6.2 Optional telemetry

```text
NOT_REPORTED | STARTED | IN_PROGRESS | COMPLETED | COMPLETED_BY_ARTIFACT
```

Telemetry 不可作 Artifact acceptance、Canonical 或 SQLite 的必要 gate。倒退、重複、缺少 progress 只產生 recoverable warning，除非另有可證明 protocol corruption。

### 6.3 Terminal commit

- Reducer 先輸出 immutable decision receipt。
- Terminal writer 以 runId/idempotency key 原子建立唯一 `run_terminal`。
- 重複 terminal input 回傳既有 terminal receipt。
- 不允許先寫 failed，後面再 append completed；若新 facts 在 terminal 前到達，重新 reduce；terminal 後只允許 diagnostic finding，不能靜默改 outcome。

## 7. Dynamic Tool 與 Artifact Handler

保留 zero-identity model-visible contract。模型不可看見或提交 JAA-owned run/thread/turn/source/rule identity。

必要工具行為：

1. `jaa_get_input_manifest({})`
   - 回傳 opaque delivery handle、file/record/segment metadata。
   - 不洩漏 JAA-owned internal identity。
2. `jaa_read_and_ack_next_segment(...)`
   - bridge-resumable-v4，不改 segment size 與 protected-token 邏輯。
   - 第一個成功 read 使 Host Controller 進入 INPUT_READING。
3. Delivery status tool
   - finalize 前後唯讀、idempotent，不消耗 handle。
4. Finalize tool
   - receipt 建立與 `INPUT_READY` 為同一 atomic operation。
5. Artifact publish tool
   - 驗證 opaque single-use token/binding。
   - 先 durable persist raw submission，reopen/hash verify。
   - 成功回覆最多為 `persisted`。
   - append fact 後觸發 Post-Artifact pipeline，不自行 terminalize。

本版不處理 4 次 recoverable cursor mismatch，除非測試可證明是 Host cursor regression；不得擴大成 transport 重寫。

## 8. Standard Formal Prompt 調整

送給 ChatGPT 的正式指令使用繁體中文，Prompt Template Version 固定 `0.3.36-zh-TW-v17`。保留既有 Decision v5、精確 N 筆 direct JSON array、Evidence Quote Catalog 與完整 final summary 要求。

必須明確告知模型：

1. 完整讀取並 ACK 所有 segments，確認 4/4 files、N/N records、EOF、bytes、SHA-256 後再分析。
2. 不產生 shell／PowerShell，不嘗試本機檔案 I/O。
3. 不回傳 Host-owned identity。
4. 每個 Skill Finding 只引用 `evidenceQuoteIds[]`。
5. 不為通過 Gate 任意刪除有證據的 Skill。
6. 只呼叫一次 Artifact submission；工具回覆 `persisted` 代表 JAA 已 durable 接收，不代表 formal validation 已成功。
7. Artifact 之外保留繁體中文 final summary，說明輸入完整性、Decision/Skill counts、status 分布、限制與提交結果。
8. 若輸入真正不完整，明確回報缺少的 file/segment/cursor/EOF，不得虛構 N 筆 FAILED。

不要加入固定分類率、固定 Skill 數、batch、repair、retry 或 fallback。

## 9. Validation、Persistence 與下游規則

Validation stages 固定：

1. TOKEN_BINDING
2. SUBMISSION_DECODE
3. DECISION_SCHEMA
4. COUNT_INDEX_ORDER
5. EVIDENCE_QUOTE_REFERENCE
6. SOURCE_ROLE_ATTRIBUTION
7. STATUS_SEMANTIC
8. QUALITY_GATE
9. CANONICAL_ASSEMBLY
10. ANALYZED_RESULT_PUBLISH
11. ACTIVE_RESULT_COMMIT
12. REPORT_PACKAGE
13. HTML_RENDER
14. SQLITE

每個 stage 只有實際執行且 durable evidence 完成才能 PASSED。先前 stage FAILED 後，未執行 stage 使用 `NOT_RUN_DUE_TO_PRIOR_FAILURE`；隔離測試中的 SQLite 使用 `NOT_RUN_BY_TEST_ISOLATION`。

正式規則維持：

- Decision v5 不變。
- 17 筆 exact count/index/order 必須通過。
- 原始模型 Artifact immutable。
- Host deterministic assembly 注入 source identity。
- Quality WARNING 未人工接受前阻擋 production SQLite。
- Failed/Partial/Cancelled/invalid/0-result 不得取代 Active Result。
- Canonical 已成功時，HTML/SQLite 下游失敗不得抹除 Analyzed Result。
- HTML 只讀 Report Data Package + Template，不查 live Jira/SQLite、不呼叫 Provider。

## 10. Debug Folder 與即時對話

Debug Folder 以 attempt/run linkage 收集，不得 fallback 到最新舊 Run。至少收入：

- attempt receipt、runtime registry snapshot、dispatch expected identity
- source/model delivery receipts、segment plan、finalize receipt
- Host Controller transition receipts與 projection
- Terminal Reducer inputs、decision receipt、唯一 run_terminal
- raw AI submitted Artifact 與 artifact states/receipts
- artifact identity per-field receipt
- Post-Artifact stage receipts
- validation 01–14 receipts與 aggregate findings
- Quote Catalog與resolution evidence
- Canonical／Analyzed Result／Active Result／Package／HTML／SQLite receipts（依實際 lifecycle）
- `artifact-final-summary.txt`
- `provider-final-assistant-message.txt`
- append-only provider stream與conversation
- token usage events與 cumulative actual numbers
- debug completeness與file manifest（bytes/hash）

所有檔案 flush 後才封裝 Debug Folder。Completeness 必須區分：存在、應存在但遺失、因先前失敗未產生、測試隔離未執行、非適用、hash mismatch。

## 11. UI 範圍

只做支援 truth 的最小 UI 修改：

1. Workspace 分層顯示 Provider、Input Delivery、AI Submission、Artifact、Validation、Canonical、Analyzed Result、Package/HTML、SQLite。
2. 已有 persisted Artifact 時，即使 Provider terminal 為 failed，也要顯示 Artifact 與 pipeline recovery 狀態。
3. Root error 與 derived consequences 分開。
4. 顯示 Artifact 四階段 vocabulary，不顯示 premature `published`。
5. 顯示 artifact final summary 與 provider final response 為兩個來源。
6. Token 顯示 actual counts；context window unavailable 時不顯示虛假百分比。
7. Results 導頁仍只在 Active Result commit 後允許。

不要重做 Results UI、HTML 樣式、統計卡片、規則選檔 UI 或其他頁面。

## 12. 測試需求

### 12.1 Unit／contract tests

至少涵蓋：

- 六格 Provider terminal × Artifact matrix
- Artifact persisted 推導 started/completed/COMPLETED_BY_ARTIFACT
- callback 無法直接 terminalize
- reducer deterministic/idempotent
- 單一 terminal event
- Post-Artifact 同 key 重入不重複 side effect
- startup recovery 從未完成 stage 繼續
- expected/actual identity 獨立來源
- stale 0.3.34 identity 被拒絕
- Artifact 四階段合法/非法 transition
- final summary 與 final response 不互相覆寫
- receipt bytes/hash reconciliation
- stage receipt/lifecycle/root error consistency
- numeric token telemetry 保留、credential 遮罩
- Debug completeness 認得真實 submission

### 12.2 v0.3.35 真實雙軌 replay

新增明確 scripts，例如：

- `npm.cmd run replay:v0.3.35:forensic`
- `npm.cmd run replay:v0.3.35:corrected-host`

兩者均須輸出 machine-readable receipt 與 Markdown report。必須驗證 4/4、17/17、324945 bytes、82 segments、17 Decisions、40 Skill Findings、44 quote refs、40 unique quotes 與 status distribution。

### 12.3 歷史 regression

維持並執行專案現有 v0.3.31／v0.3.32／v0.3.33／v0.3.34／v0.3.35 相關 regression。若 script 名稱不同，先查 package.json 使用真實名稱，不要虛構結果。

### 12.4 Opt-in Live 17

提供：

`npm.cmd run test:live:v0.3.36:17`

只有 `JAA_ENABLE_LIVE_PROVIDER_TEST=1` 才能聯絡 Provider。需 isolated Run Root、不得寫 production SQLite、不得取代 Active Result、不得 retry/repair/fallback。未執行要回報 Provider contacted=false、Live E2E=NOT RUN。

## 13. 實作順序

1. Repository／worktree／identity／現有 bridge inventory。
2. 將 v0.3.35 Debug Bundle 唯讀解壓至 ignored test root。
3. 先建立 forensic replay，證明 stale identity 與 terminal overwrite，可在未修正前失敗。
4. 建立 immutable Runtime Contract Registry 與 independent identity receipt。
5. 建立 reducer facts、pure reducer、single terminal writer。
6. 統一 Artifact 四階段狀態與 publish tool 回覆。
7. 抽出 idempotent Post-Artifact pipeline 與 recovery entry points。
8. 分離 final summary／provider response durable files。
9. 建立 reconciliation service 與 Debug completeness 修正。
10. 最小 UI truth 修改。
11. 完成 corrected-host replay、unit、regression。
12. typecheck、build、dist、packaged verifier、isolated startup。
13. 產生報告、artifact manifest、execution ledger。
14. commit、tag、push 並核對 remote。

每一階段都先查既有抽象；禁止同時保留第二套 terminal/lifecycle authority。

## 14. 必跑命令與驗證

至少執行並記錄 command、start/end、duration、exit code：

```text
npm.cmd run typecheck
npm.cmd run test:v0.3.36
npm.cmd run replay:v0.3.35:forensic
npm.cmd run replay:v0.3.35:corrected-host
npm.cmd run build
npm.cmd run dist
git diff --check
```

再執行實際存在的歷史 regression、packaged bridge/runtime contract verifier、ASAR inventory、win-unpacked 與 Portable isolated short startup。

若目前環境不是 Windows shell，使用 repository 支援的等價命令，但報告不得偽造 `npm.cmd` 已執行。若 Live 未 opt-in，不執行並標記 NOT RUN。

## 15. 封裝與安全驗證

1. Installer、Portable、win-unpacked 版本均為 0.3.36。
2. Bridge external-only／ASAR 策略沿用 v0.3.35 已驗證配置；實際 packaged path、bytes、SHA-256、loadability 必須驗證。
3. ASAR 不得含 stale bridge、舊 v0.3.35 current-runtime identity、`.env`、token、DB、Debug Bundle、使用者資料或歷史 prompt。
4. 四份受控 MD 應只有正確版本；Catalog/Template Hash 必須 byte-identical。
5. Bundled Codex 路徑、版本、SHA-256 驗證；不搜尋 PATH、不下載、不 fallback。
6. win-unpacked 與 Portable 以 isolated APP_ROOT／userData 啟動，確認 `did-finish-load`、renderer boot、初始 route ready，無 white screen、renderer crash、`did-fail-load`。
7. 不終止使用者正在執行的其他 JAA；若 single-instance lock 阻擋，誠實列人工驗證待辦。

## 16. 正式報告

至少產生：

1. `JiraActivityAnalyzer_v0.3.36_test_and_verification_report.md`
2. `JiraActivityAnalyzer_v0.3.36_artifact_manifest.json`
3. `JiraActivityAnalyzer_v0.3.36_execution_time_ledger.json`
4. `JiraActivityAnalyzer_v0.3.36_terminal_outcome_reducer_report.md`
5. `JiraActivityAnalyzer_v0.3.36_post_artifact_recovery_report.md`
6. `JiraActivityAnalyzer_v0.3.36_artifact_identity_report.md`
7. `JiraActivityAnalyzer_v0.3.36_lifecycle_reconciliation_report.md`
8. `JiraActivityAnalyzer_v0.3.36_v035_forensic_replay_report.md`
9. `JiraActivityAnalyzer_v0.3.36_v035_corrected_host_replay_report.md`
10. `JiraActivityAnalyzer_v0.3.36_packaged_runtime_security_report.md`

報告必須清楚分開：automated offline、packaged smoke、live provider、manual validation。Actual token telemetry 只有實際取得才填；Codex 開發工作階段若 unavailable 就寫 `unavailable`，不得估算。

## 17. 本版明確不做

- 不修改 279 筆 Catalog 內容。
- 不修改分類邏輯、Status matrix、Decision v5 欄位。
- 不修改 Evidence Quote Catalog／Normalizer／Segmenter 演算法。
- 不修改 Report Data Package 結構。
- 不修改 HTML Template v1.5.1、Renderer 視覺、統計或篩選功能。
- 不修改 SQLite schema。
- 不修改 segment size、protected-token 規則或 transport v4。
- 不新增 batch、repair、retry、fallback。
- 不優化 82 read calls、1.99M token 或整體效能。
- 不處理 recoverable cursor mismatch，除非證據直接指向 Host correctness bug。
- 不改動 Rules selection、Active Result Results UI 架構或其他 Jira 功能。
- 不自動執行 Live Provider test。

若完成核心修正需要超出以上範圍，先停止並報告必要性、風險與最小替代方案。

## 18. 完成定義

只有同時符合下列條件才可宣稱 v0.3.36 自動化交付完成：

1. 受控五文件 identity／bytes／hash 驗證完成。
2. v0.3.35 as-recorded replay 如實檢出 stale Artifact Identity。
3. Corrected-host replay 不改模型 Artifact，成功建立 Canonical、Analyzed Result、Package、HTML。
4. 同 replay SQLite 明確為 `NOT_RUN_BY_TEST_ISOLATION`。
5. Durable Artifact 不再被判為 `AI_ANALYSIS_NOT_STARTED`。
6. Provider terminal × Artifact matrix 全部通過。
7. 只有一個 terminal reducer 與一筆 run_terminal。
8. Post-Artifact pipeline 重入與 startup recovery 通過。
9. Artifact 四階段狀態與 tool response 一致。
10. Final summary／Provider response 分檔且 Hash 穩定。
11. Lifecycle／receipts／root error／files reconciliation 通過。
12. Debug completeness 認得 submission；numeric token telemetry 保留。
13. typecheck、v0.3.36 tests、build、dist、packaged verifier、security scan 通過。
14. win-unpacked 與 Portable 至少完成可誠實驗證的 isolated startup。
15. Git commit/tag 狀態與 push 結果有證據。

Live Managed OAuth、production SQLite、Installer GUI、乾淨 Windows 可維持 Manual Validation Pending，但不得被 offline replay 冒充。

## 19. 最終回覆格式

最終回覆使用繁體中文，先給 Overall Status，再依序列出：

1. Target Version
2. Branch、Package Source Commit、Final Delivery Commit、Annotated Tag
3. 十項核心修正完成情況
4. v0.3.35 forensic replay 結果
5. corrected-host replay 結果與實際產物
6. typecheck／tests／build／dist／packaged verification 時間與 exit result
7. Installer／Portable／win-unpacked 路徑、bytes、SHA-256、Build Time
8. Bridge identity、bytes、SHA-256、packaged location
9. Live Provider contacted 與 token telemetry 真實狀態
10. Manual Validation Pending 項目
11. Git push、upstream ahead/behind、remote tag peeled SHA
12. 使用者既有 dirty/untracked 資料保留狀態
13. 正式報告路徑

任何未執行、遭阻擋或只有 fixture 的項目必須明示；禁止以「應該」「推測」「估算」冒充實測 PASS。
