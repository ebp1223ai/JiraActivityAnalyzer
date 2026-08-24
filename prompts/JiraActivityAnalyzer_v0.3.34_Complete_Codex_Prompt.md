# Jira Activity Analyzer v0.3.34 正式完整 Codex Prompt

## 0. 執行角色與最高原則

你是 JiraActivityAnalyzer（以下簡稱 JAA）專案的主責 Codex 工程代理。請在既有 repository 中完成 v0.3.34，主題為：

> Provider Lifecycle、Delivery/Finalize Idempotency、Run-level Failure Truth、Validation Causality 與 Opt-in Live Analysis Validation

本任務是既有 v0.3.33 的最小範圍修正版，不得趁機重構無關功能。你必須先唯讀檢查 repository、AGENTS.md、package scripts、git 狀態、v0.3.33 實作與下列兩份真實 Debug Bundle，再開始修改。

不得刪除、覆寫、移動、提交或清理使用者既有 tracked dirty 修改與 untracked 檔案。不得讀取、輸出、提交或封裝 `.env`、Token、Cookie、OAuth credential、SQLite／DB、個人資料或其他 secret。若既有 dirty state 阻擋封裝，只能使用專案已存在且經授權的保留機制，並在報告誠實記錄；不得 reset、stash、clean 或 checkout 使用者內容。

所有送給 ChatGPT 的正式分析指令與模型可見說明必須使用繁體中文。程式碼識別字、contract ID、error code、JSON key 可維持英文。

## 1. Target、Git 與固定 Identity

- Target Application Version：`0.3.34`
- Branch：`feat/v0.3.34-provider-lifecycle-live-analysis-validation`
- Annotated Tag：`v0.3.34`
- Prompt Identity：`JAA-CHATGPT-ZH-TW-0.3.34`
- Prompt Template Version：`0.3.34-zh-TW-v15`
- Pipeline：`JAA-ANALYSIS-PIPELINE-0.3.34`
- Classification Engine：`JAA-CLASSIFICATION-1.6.3`
- Decision Contract：`jaa-ai-analysis-decisions-v5`
- Quality Contract：`jaa-ai-analysis-quality-v4`
- Provider Transport：`bridge-resumable-v4`（維持不變）
- Analysis Bridge：`0.3.34-bridge-v14`
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.1`（維持不變）
- Bundled Codex：`0.147.0`（維持固定版本、local bundled only、禁止 PATH fallback／下載）

Bridge 行為已改變，因此 identity 必須進版為 v14。實際 Bridge bytes 與 SHA-256 必須由固定 Package Source Commit 的 build 產物計算，寫入 manifest／report 並對 source、external packaged resource、runtime load 三者驗證一致；不得沿用 v13 的 bytes 或 hash，也不得預先捏造數值。

## 2. 五份正式交付文件

本次必須使用並交付以下五份 MD；每份檔名都必須顯示版本：

1. `JiraActivityAnalyzer_v0.3.34_Complete_Codex_Prompt.md`
2. `Skill_Analysis_Rule_Set_Manifest_v0.8.3.md`
3. `Skill_Classification_Common_Rules_v1.6.3.md`
4. `Skill_Catalog_v0.3.1.md`
5. `Skill_Analysis_HTML_Report_Template_v1.5.1.md`

受控綁定：

| Role | File | Bytes | SHA-256 |
|---|---|---:|---|
| Common Rules | `Skill_Classification_Common_Rules_v1.6.3.md` | 44599 | `9b7a9a537fa5d86d79f8881700043da26d15b4e575d8843c30235a5be74efb5a` |
| Skill Catalog | `Skill_Catalog_v0.3.1.md` | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| HTML Template | `Skill_Analysis_HTML_Report_Template_v1.5.1.md` | 38057 | `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02` |

Manifest 為自我描述檔，不固定自我 hash；JAA 於載入及每個 Run 計算並保存實際 bytes／SHA-256。Codex 開始實作前必須重新計算所有檔案，若與上述綁定不符則 fail closed 並停止 Provider 相關工作，不得自行「修正」使用者提供的 Catalog 或 Template。

Catalog v0.3.1 與 HTML Template v1.5.1 本版內容不變，但仍須隨 Prompt 一併交付、封裝與驗證。

## 3. 先重現的兩份真實 v0.3.33 證據

使用者已提供兩份 Debug Bundle。請唯讀解壓到獨立暫存目錄，建立 deterministic replay；不得修改 bundle 原檔，不得把 replay 寫入 production SQLite：

1. `jira-activity-analyzer-debug-folder-20260824_151333.7z`
2. `jira-activity-analyzer-debug-folder-20260824_153456.7z`

### 3.1 第一份 Run 的權威事實

- Run ID：`analysis_1b45da4f-2e4a-463b-b3af-426c1f0f09ce`
- Mode：Standard Formal
- Provider：已聯絡；1 request／1 thread／1 turn，turn completed。
- Input：4/4 files、17/17 records、311276/311276 bytes、79 segments，EOF／ACK／SHA-256 完整。
- finalize 後模型呼叫 `jaa_get_delivery_status`，JAA 錯誤回覆 `AI_MODEL_DELIVERY_HANDLE_REPLAYED`。
- 模型仍提交 17 筆 Decisions，但全部為 `FAILED`、0 skill findings，並聲稱 combined tool output 被截斷。
- submission 已 durable 保存；semantic validation 因 17 筆 `FAILED` 都含非空 `unknownReasons`，產生 17 個 `STATUS_MATRIX_VIOLATION`。
- Formal validation stage 1–6 PASSED、stage 7 FAILED；stage 8 卻錯誤 PASSED；stage 9–11 blocked；stage 12–13 diagnostic passed；stage 14 not expected。
- 沒有 Formal Canonical／HTML／SQLite；有 Diagnostic Package／HTML。
- Duration：約 157952 ms。

這份證據證明 post-finalize delivery status 被誤判為 replay，也證明 validation receipt 的因果順序錯誤。模型所稱「截斷」僅是 model-reported limitation；在沒有 Host-observed missing byte／segment／hash 證據前，不得宣稱 JAA 已證實 transport truncation。

### 3.2 第二份 Run 的權威事實

- Run ID：`analysis_72db2466-7a18-43e1-88ae-4d2f4c55f9be`
- Mode：Standard + User Instruction A/B
- Input：4/4 files、17/17 records、311276/311276 bytes。
- 模型在 finalize 前呼叫 `jaa_get_delivery_status`，成功取得 complete=true、expectedSegments=79、acknowledgedSegments=79、missingSegments=[]。
- finalize 成功，receipt 顯示 `modelInputDelivered=true`。
- 接著 `jaa_report_analysis_progress(phase=ANALYSIS_STARTED)` 失敗：`AI_ANALYSIS_INCOMPLETE`、`Illegal lifecycle transition to ANALYSIS_STARTED.`，error stage 卻是 `INPUT_READING`。
- 無 Decisions、無 artifact submission、無 Canonical／HTML／SQLite。
- Duration：約 166099 ms。

這份 A/B 證據證明使用者補充指令成功避開 post-finalize status replay，但 Host lifecycle 未在 finalize 後進入可分析狀態。它沒有證明模型能否完整分析，因為 Run 在分析開始前即被 Host 終止。

### 3.3 修正後 replay 期望

- 第一份 replay：post-finalize `jaa_get_delivery_status` 必須成功且不消耗 handle。
- 第二份 replay：成功 finalize 後 authoritative state 必須是 `INPUT_READY`，`ANALYSIS_STARTED` 必須合法。
- 兩份 replay 都不得聯絡 Provider、消耗 token、寫 production SQLite 或取代 Active Result。
- Replay PASS 只代表歷史事件可由新 state machine 正確解釋，不得冒充真實 Managed ChatGPT E2E PASS。

## 4. 十二項已採納決策（全部為 Must）

### 決策 1：唯一 Provider lifecycle state machine

建立單一 Host-owned authoritative state machine，所有 Bridge handler、service、IPC、UI、Debug、receipt 與 terminal event 必須共用，不得各自推導狀態。

最低狀態順序：

```text
ATTEMPT_CREATED
→ PROVIDER_DISPATCHED
→ INPUT_READING
→ INPUT_DELIVERY_FINALIZED
→ INPUT_READY
→ ANALYSIS_STARTED
→ ANALYSIS_IN_PROGRESS
→ ARTIFACT_RECEIVED
→ VALIDATION_COMPLETED
→ CANONICAL_CREATED
→ ANALYZED_RESULT_PUBLISHED
→ ACTIVE_RESULT_COMMITTED
→ REPORT_PACKAGE_CREATED
→ HTML_RENDERED
→ SQLITE_GATE
→ TERMINAL
```

允許依失敗點進入唯一 terminal failure，但必須保存最後成功狀態、第一失敗狀態、root error 與 derived consequences。每個 Run 只允許一筆 idempotent `run_terminal`。

### 決策 2：Finalize 原子建立 INPUT_READY

`jaa_finalize_input_delivery` 只有在 4/4 files、N/N records、bytes、segments、EOF、ACK、ordering、manifest binding 與 SHA-256 全部通過時成功。

成功流程必須在同一個 Host atomic operation 中：

1. 驗證 finalAck／delivery binding。
2. durable 保存 immutable delivery receipt。
3. 將 state 從 `INPUT_DELIVERY_FINALIZED` 設為 `INPUT_READY`。
4. flush／reopen／hash verify receipt。
5. 回傳模型成功結果。

不得先回成功給模型，之後才非同步更新 state；不得出現 receipt 成功但 authoritative state 仍為 `INPUT_READING`。

### 決策 3：允許 INPUT_READY → ANALYSIS_STARTED

`jaa_report_analysis_progress({phase:"ANALYSIS_STARTED"})` 從 `INPUT_READY` 必須合法。第一次成功後可進入 `ANALYSIS_STARTED`；同 phase 重送必須 idempotent，不得成為 illegal transition。

### 決策 4：Progress 是 observability，不是脆弱的控制閘

Progress tool 只用於觀測，並非模型繼續分析的必要授權。

以下屬可恢復情況，只記 warning／duplicate evidence，不得終止 Provider turn：

- 相同 phase 或 completedCount 重送。
- completedCount 暫時不增加。
- 網路／事件重送造成的舊 timestamp。
- 在同一合法 phase 內重複回報。

以下才 fail closed：

- handle／run／thread／turn scope mismatch。
- completedCount 為負數或大於 expectedRecordCount。
- phase 跨越不可達狀態且無合法補足事件。
- 已 terminal 後企圖修改正式狀態。

Progress handler 自身的 recoverable failure 不得掩蓋更早 root error，也不得把尚未完成的分析標記完成。

### 決策 5：Delivery Status 前後皆可唯讀查詢

`jaa_get_delivery_status` 必須：

- finalize 前可查。
- finalize 後可查。
- 分析期間可查。
- readonly、idempotent、不消耗 handle、不改 cursor、不建立新 ACK。
- 回傳相同 immutable status／final receipt identity。

只有 segment cursor／ACK 重播、跨 Run scope、過期或不同 opaque handle 的實際 mutation 才能使用 replay error。不得因查詢發生在 finalize 後就回 `AI_MODEL_DELIVERY_HANDLE_REPLAYED`。

### 決策 6：相同 Finalize 冪等

相同 handle、finalAck、manifest hash、file hashes、expected bytes／segments／records 的 finalize 重送，必須回傳第一次的 immutable receipt，不建立第二份 receipt、不重複 lifecycle event、不重複 terminal event。

任一 binding 不同的 finalize 重送必須 fail closed，並保存 expected／observed 的非敏感摘要；不得洩漏完整 handle、token、nonce 或 credential。

### 決策 7：Bridge identity 反映行為變更

- Bridge 進版 `0.3.34-bridge-v14`。
- Transport 維持 `bridge-resumable-v4`。
- Bridge 必須維持 external-only：`app.asar` 內 0 份、external resource 1 份、stale bridge 0 份。
- source manifest、packaged manifest、actual external file bytes／hash、runtime loaded module identity 必須一致。
- 不搜尋 PATH、不使用外部 Codex／Bridge fallback、不自動下載。

### 決策 8：FAILED 矩陣與 Run-level failure 對齊

Decision v5 正式 enum 只允許：

```text
CLASSIFIED
CATALOG_DETAIL_MISSING
UNKNOWN
EXCLUDED
FAILED
```

不得輸出 `NEEDS_REVIEW`。

單筆 `FAILED` 必須同時符合：

- `confidence = 0`
- `skillFindings = []`
- `unknownReasons = []`
- 具體不可恢復錯誤寫入 `recordNegativeChecks` 與／或 `rationale`

若問題是模型無法存取整體輸入、Provider context、Bridge output 或全部 segments，這是 Run-level failure：

- 不得提交 N 筆全部 FAILED 的假性結果。
- 不得建立 Formal Artifact、Canonical、Active Result、Formal HTML 或 SQLite。
- 保存 structured run failure、first failed tool/stage、delivery receipt、final assistant response 與 model-reported limitation。
- 沒有 Host-observed byte／segment／hash 缺失時，model-reported truncation 不得升格成已證實 transport failure。

### 決策 9：Validation Receipt 因果順序

固定 14 stage：

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

Formal stage 首次 FAILED 後，後續相依 Formal stages 只能為：

- `BLOCKED_BY_PRIOR_STAGE`；或
- `NOT_RUN_DUE_TO_PRIOR_FAILURE`。

不得顯示 PASSED。Diagnostic Package／HTML 可獨立執行，但 receipt 必須明確標示 `scope=DIAGNOSTIC`、`canonical=false`、`sqliteEligible=false`，不得混入 Formal stage PASS。

### 決策 10：Root error 與 stage truth 一致

所有 error normalizer、lifecycle、UI、Debug 與 report 必須保存並一致顯示：

- `rootErrorCode`
- `rootErrorMessage`
- `rootErrorStage`
- `firstFailedStage`
- `lastSuccessfulStage`
- `sourceState`
- `targetState`
- `attemptedTransition`
- `providerContacted`
- `providerRequestSent`
- `providerAccepted`
- `providerCompleted`
- derived consequences

不得出現 `undefined: undefined`、互相矛盾的 stage、空 root error 卻顯示 failed、或把「未建立 Canonical／SQLite」當成 root cause。若 Provider 尚未聯絡，UI 必須明示；若 turn completed，也不得推論 Formal Artifact 已成功。

### 決策 11：兩層測試策略

第一層為預設 Offline：

- unit／integration／fixture／property tests。
- 兩份 v0.3.33 Debug Bundle deterministic replay。
- 不聯絡 ChatGPT、不需要 OAuth、不消耗 token、不寫 production SQLite。
- `npm.cmd run test:v0.3.34` 必須完全 offline。

第二層為 Opt-in Live Provider E2E：

- 新增 `npm.cmd run test:live:v0.3.34:17`。
- 僅在環境變數 `JAA_ENABLE_LIVE_PROVIDER_TEST=1` 且 local config 完整時執行。
- 使用既有 JAA Managed ChatGPT authentication；不得要求使用者把 token 放入 CLI、log、fixture、report 或 git。
- 缺少 opt-in、auth 或輸入設定時結果為 `NOT RUN`，不得假裝 PASS，也不得使預設 offline test 失敗。
- Live 結果與 Offline 結果在 console、JSON receipt 與 Markdown report 分欄顯示。

### 決策 12：Live E2E 必須使用真實選定輸入

Live local selection 必須為 5 份：

1. Pending Dataset JSON。
2. Manifest v0.8.3。
3. Common Rules v1.6.3。
4. Catalog v0.3.1。
5. HTML Template v1.5.1。

Provider 實際接收仍為 4 份：

1. Pending Dataset JSON。
2. Manifest。
3. Common Rules。
4. Catalog。

HTML Template 僅供 JAA 本機 Renderer，禁止送給 ChatGPT。

Live config 至少包含：

```json
{
  "pendingDatasetPath": "<absolute local path>",
  "manifestPath": "<absolute local path>",
  "commonRulesPath": "<absolute local path>",
  "catalogPath": "<absolute local path>",
  "htmlTemplatePath": "<absolute local path>",
  "expectedRecordCount": 17,
  "allowProviderContact": true,
  "allowProductionSqlite": false
}
```

不得猜測路徑。Live runner 必須以與正式 UI 相同的 preflight、Rule Set binding、Pending receipt、Bridge、effective instruction、artifact submission、validation 與 local renderer service 執行，不能使用簡化 mock pipeline 冒充 E2E。

限制：

- isolated Live Test Run Root。
- 不寫 production SQLite。
- 不取代 production Active Result。
- 不建立 fixed batch。
- 不執行 repair、automatic retry 或 provider fallback。
- 1 request、1 thread、1 primary turn、1 artifact submission。
- 本版只將真實 17 筆列為可選驗證；117 筆不得由 Codex 自動執行，保留人工驗證待辦。

## 5. Dynamic Tool 契約

沿用 Host-owned zero-identity model contract。模型不得傳入 runId、threadId、turnId、source path、submission token 或 delivery handle 的原值；Host 由當前 immutable `BridgeExecutionContext` 綁定。

至少覆蓋並測試：

- `jaa_get_input_manifest({})`
- `jaa_read_and_ack_next_segment(...)`
- `jaa_get_delivery_status(...)`
- `jaa_finalize_input_delivery(...)`
- `jaa_report_analysis_progress(...)`
- Artifact submission tool
- Analysis report／final assistant response 保存路徑

工具 schema、runtime handler、Prompt 說明、TypeScript type 與 packaged Bridge 必須同源或由同一 contract factory 產生。Production handler 回傳前重新 decode／validate `contentItems[0].text`，避免 source 與 packaged 行為漂移。

Provider-visible tool evidence 只保存：tool name、sequence、received time、outcome、error code、非敏感 binding fingerprint、state before／after、receipt ID 摘要。禁止保存完整 token、handle、nonce、credential 或可重播 argument value。

## 6. 模型正式指令調整

Standard Formal effective instruction 必須使用繁體中文，並明確告訴模型：

1. 完成所有 segment 後可查詢 delivery status；finalize 前後都可查。
2. finalize 成功即代表輸入已由 Host 標記 `INPUT_READY`。
3. 可回報 `ANALYSIS_STARTED`，但 progress 只是觀測，不是繼續工作的必要條件。
4. 若 progress telemetry 遇到可恢復問題，繼續完成分析與唯一 artifact submission；不得因 telemetry 重送而自行放棄。
5. 若確實無法存取整體輸入，不得合成 N 筆 FAILED；改用 Run-level failure／final summary 回報缺口，不提交假性正式 Artifact。
6. 若只有單一 record 本身不可恢復，才使用 FAILED，並遵守固定矩陣。
7. 只提交一次 Decision v5 direct JSON array；不加 markdown fence、不加 JSON 外文字。
8. Analysis Report 與 final assistant summary 另走既有文字通道，以繁體中文說明輸入完整性、分析是否開始、是否完成、是否提交、已知限制與建議；不得把文字摘要混入 Decision JSON。

不得要求模型使用 PowerShell／Shell 讀寫檔、建立下載連結或自行產生 HTML。Artifact、Canonical、Package、HTML、SQLite 均由 JAA Host 負責。

## 7. 持久化與 UI 真實性

維持 append-only conversation／provider stream 與 buffered durable flush。每次分析依本機時間與唯一 Attempt／Run ID 建立不同資料夾。強制關閉後要能識別 interrupted Run，不得附錯前一個 Run。

Workspace 必須顯示：

- Provider 是否 contacted／request sent／accepted／completed。
- Input delivery state 與 final receipt。
- Analysis 是否 started／in progress／completed。
- Artifact 是否 received／persisted／validated／rejected。
- root error 與 first failed stage。
- Delivery Status 查詢次數與 outcome。
- Finalize 首次／idempotent replay／mismatch outcome。
- final assistant response 與 analysis report。

只有 durable Analyzed Result publish 且 Active Result commit 成功，才允許自動前往 Results。中途任何失敗都留在 Workspace，不跳頁。Diagnostic HTML 不可解鎖 Results。

## 8. Debug Folder 完整性

Debug Folder 必須 attempt-aware，且只透過 linkedRunId 收集正確 Run。至少包含存在即應收的：

- attempt／run metadata。
- runtime identity／Bridge manifest／actual Bridge hash receipt。
- effective instruction 與 SHA-256。
- source input receipt／model delivery receipt。
- segment plan／ACK／EOF／hash evidence。
- delivery status calls 與 finalize receipts。
- lifecycle transitions 與 progress events。
- provider dispatch ledger。
- conversation／provider stream／final assistant response／analysis report。
- raw AI submission（若存在）。
- validation stage receipts、findings、root error、terminal event。
- Formal 或 Diagnostic Package／HTML 與 render receipt（若 lifecycle 應產生）。
- `debug-completeness.json` 與 `debug-file-manifest.json`。

Completeness 必須區分：真正漏包、該 stage 尚未到達、因 prior failure 預期不產生、flush/hash mismatch、敏感檔案刻意排除。不得因 Run 失敗就把不存在的 Formal Artifact 報成 collector bug，也不得回退收集「最新」的其他 Run。

## 9. 必要測試與 Acceptance Criteria

### 9.1 Offline automated tests

新增並通過至少下列案例：

1. finalize 成功原子轉入 `INPUT_READY`。
2. `INPUT_READY → ANALYSIS_STARTED` 成功。
3. 相同 progress 重送 idempotent。
4. 可恢復 progress anomaly 不 terminalize。
5. 非法 scope／count／state fail closed。
6. delivery status 在 finalize 前後均成功且不改 state／cursor／ACK。
7. 相同 finalize 回傳完全相同 receipt identity。
8. 不同 finalAck／hash／binding 的 finalize replay 被拒。
9. 第一份 v0.3.33 replay 不再產生 post-finalize handle replay。
10. 第二份 v0.3.33 replay 不再產生 illegal `ANALYSIS_STARTED` transition。
11. Run-level input access failure 不生成 N 筆 FAILED。
12. 單筆 FAILED 矩陣正確；非空 unknownReasons 被 validator 拒絕。
13. Formal stage 7 FAILED 時 stage 8 不可 PASSED。
14. Diagnostic stage 與 Formal receipt scope 分離。
15. root error／first failed stage／source state／target state 一致。
16. 每 Run 只有一筆 terminal event。
17. Default test 不會建立 Provider request。
18. Live runner 缺 opt-in 時回 NOT RUN。
19. Live runner 不會把 Template 放入 Provider input。
20. Live runner 使用 isolated Run Root、禁止 production SQLite／Active Result replacement。
21. Bridge source／packaged／runtime contract 一致；ASAR 0、external 1、stale 0。
22. v0.3.33、v0.3.32、v0.3.31 相關 regression 不退化。

### 9.2 Live 17-record E2E

只有明確 opt-in 且 config／auth 完整時才執行。成功標準必須全部由真實 receipt 證明：

- selected input 5/5 verified。
- provider input 1 JSON + 3 MD。
- Provider contacted／sent／accepted／completed 各 1。
- delivery 4/4 files、17/17 records、bytes／segments／EOF／ACK／SHA-256 complete。
- finalize receipt 成功且 Host state=`INPUT_READY`。
- delivery status 可在 finalize 後查詢。
- analysis started。
- 唯一 artifact submission durable persisted。
- 17 decisions exact count／index coverage。
- validation stages 依實際結果呈現；若 warning／blocker，仍須因果正確。
- 若 Formal 通過，建立 Analyzed Result、isolated test package／HTML；不寫 production SQLite、不取代 production Active Result。
- 保存 final assistant response。
- Debug completeness 與 manifest 可驗證。

Live 分析可能因模型內容品質而 WARNING／BLOCKED；這不自動代表 lifecycle 修正失敗。報告必須把 Transport/Lifecycle PASS 與 Decision Quality outcome 分開。若 Provider／OAuth 或外部服務不可用，標記 `NOT RUN` 或明確 external failure，不得改用 fixture 宣稱 Live PASS。

## 10. 執行順序

1. 唯讀盤點 repository、AGENTS.md、package.json scripts、git status、現有版本與工作樹。
2. 建立新 branch，不改寫歷史。
3. 驗證五份 MD 與 binding。
4. 唯讀解包並分析兩份 v0.3.33 Debug Bundle。
5. 先建立 failing replay／regression tests。
6. 建立唯一 lifecycle state machine 與 atomic finalize。
7. 修正 delivery status、finalize idempotency、progress semantics。
8. 對齊 FAILED／Run-level failure、validation causality、error truth。
9. 進版 Bridge v14、Prompt／Pipeline／Manifest identity。
10. 實作 offline test 與 opt-in live runner。
11. 執行 typecheck、offline tests、replay、build。
12. 若操作者已提供 opt-in、有效 config 與既有 Managed OAuth，執行一次真實 17 筆 E2E；否則誠實列為 NOT RUN。
13. 固定 Package Source Commit，再執行 dist、packaged verifier、ASAR/security scan、win-unpacked／Portable isolated startup。
14. 產生報告、artifact manifest、execution ledger。
15. `git diff --check`，精準 stage 本版檔案，提交 source commit 與 final delivery commit，建立 annotated tag。
16. 僅在 remote 與權限已明確確認時 push branch/tag；被安全機制阻擋時誠實回報，不得繞過。

## 11. 必跑命令

依 repository 實際 script 名稱實作並執行，至少包括：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.34
npm.cmd run replay:v0.3.33
npm.cmd run build
npm.cmd run dist
git diff --check
```

Live 測試只可在 opt-in 下執行：

```powershell
$env:JAA_ENABLE_LIVE_PROVIDER_TEST = "1"
$env:JAA_LIVE_PROVIDER_TEST_CONFIG = "<absolute-path-to-local-config.json>"
npm.cmd run test:live:v0.3.34:17
```

不可在 CI、預設 test、build 或 dist 中隱式啟動 Live Provider。測試結束不得把 auth 或 config secret 複製到 reports／release／git。

## 12. 封裝與安全驗證

正式封裝至少產生：

- Installer EXE。
- Portable EXE。
- win-unpacked EXE。

每項記錄 absolute path、bytes、SHA-256、Build Time、Package Source Commit。驗證：

- `app.asar` inventory。
- 敏感檔名與 credential pattern 掃描。
- Bridge external-only／loadability／identity／hash。
- 四份規則 MD exact basename／version／bytes／hash。
- Bundled Codex 0.147.0 path／version／hash。
- win-unpacked 與隔離 Portable `did-finish-load`、`renderer_boot`、initial route ready。
- 無 `did-fail-load`、renderer crash、白畫面或 fatal pattern。

不得為通過封裝而刪除正在使用的使用者檔案或任意終止非本次、非 release 目錄的程序。若舊版 JAA 鎖定 release artifact，只能辨識精確 PID／image path，並依既有授權與安全規則處理；否則列為 blocker。

## 13. 正式報告

至少產生：

1. `JiraActivityAnalyzer_v0.3.34_test_and_verification_report.md`
2. `JiraActivityAnalyzer_v0.3.34_artifact_manifest.json`
3. `JiraActivityAnalyzer_v0.3.34_execution_time_ledger.json`
4. `JiraActivityAnalyzer_v0.3.34_provider_lifecycle_report.md`
5. `JiraActivityAnalyzer_v0.3.34_delivery_idempotency_report.md`
6. `JiraActivityAnalyzer_v0.3.34_v0333_debug_replay_report.md`
7. `JiraActivityAnalyzer_v0.3.34_validation_causality_report.md`
8. `JiraActivityAnalyzer_v0.3.34_live_provider_validation_report.md`
9. `JiraActivityAnalyzer_v0.3.34_packaged_runtime_report.md`
10. `JiraActivityAnalyzer_v0.3.34_rule_set_alignment_report.md`

Live report 必須明列：`PASS`／`FAIL`／`NOT RUN`、是否聯絡 Provider、真實 request/thread/turn 數、輸入檔與 record counts、artifact submission count、validation outcome、是否寫 SQLite、是否改變 Active Result。未執行時不得用 fixture count 或 replay 結果填充 live 欄位。

Execution ledger 對各主要命令記錄 start/end/duration/exit code。Actual token telemetry 只能使用 provider/runtime 真實提供值；無法取得時寫 `unavailable`，禁止估算冒充。

## 14. 不在本版範圍

- 不改 Catalog 279 Skills 內容。
- 不改 HTML Template／Renderer 視覺或 DSL。
- 不改 Decision v5、Canonical v5、Report Data Package v1 資料結構。
- 不改 transport v4 segmentation strategy。
- 不新增 batch、repair、automatic retry、provider fallback。
- 不自動執行 117 筆 Live analysis。
- 不重新設計 Results UI；只修正與 lifecycle/error truth 直接相關顯示。
- 不將本機對話同步到 ChatGPT 網頁。
- 不讓模型直接寫本機檔案、產生 HTML 或寫 SQLite。

## 15. 完成定義

只有下列條件都成立，才可將自動化工程部分標為完成：

- 十二項決策全部實作並有測試。
- 兩份 v0.3.33 replay 均通過且不聯絡 Provider。
- 預設 offline tests、typecheck、build、dist、packaged verifier、startup smoke 全部通過。
- Bridge v14 identity 與 packaged bytes/hash 一致。
- Rule Set 五份文件與 Manifest binding 一致。
- Debug／UI／report 的 provider、lifecycle、root error 與 stage truth 一致。
- Git source commit、final delivery commit 與 annotated tag 可追溯。
- 使用者既有 dirty／untracked 資料完整保留。

若真實 Live 17 筆未執行，Overall Status 必須是 `Partial / Manual Validation Pending`，並將 Live Provider E2E 明列 `NOT RUN`。若 Live 已執行但內容 Quality Gate WARNING／BLOCKED，必須分開報告 lifecycle/transport 與 content validation，不得用單一「失敗」掩蓋實際通過階段。

## 16. 最終回覆格式

最終回覆使用繁體中文，至少包含：

- Target Version 與 Overall Status。
- 核心修正摘要。
- 兩份真實 Debug Replay 結果。
- Offline 測試、build、dist、packaged/startup 驗證結果與耗時。
- Live 17 筆狀態，清楚標示 PASS／FAIL／NOT RUN。
- Live 是否真的聯絡 ChatGPT，以及是否真的使用選定的 Pending JSON + 4 MD。
- Installer／Portable／win-unpacked path、bytes、SHA-256、Build Time。
- Bridge identity、bytes、SHA-256。
- Branch、Package Source Commit、Final Delivery Commit、annotated tag、push/upstream 狀態。
- 報告路徑。
- token telemetry 真實狀態。
- 保留使用者既有檔案的確認。

禁止把未執行寫成 PASS、把 replay 寫成 Live、把 Provider completed 寫成分析結果成功、把 Diagnostic HTML 寫成 Formal HTML，或把 derived consequence 寫成 root cause。
