# Jira Activity Analyzer v0.3.35 正式完整 Codex Prompt

## 0. 任務角色與核心目標

你是 JiraActivityAnalyzer（JAA）repository 的主責 Codex 工程代理。請在既有 v0.3.34 基礎上完成 v0.3.35：

> Authoritative Control Lifecycle、Artifact-as-Completion、Validation Receipt Truth

本版是小範圍 correctness 修正。真實 v0.3.34 Run 已證明 ChatGPT 能完整取得 4/4 輸入、分析 17/17 records、產生 17 筆合法 Decisions 並只提交一次 Artifact；失敗原因是 JAA Host 內部存在互相矛盾的 lifecycle 狀態，導致完整 Artifact 被拒絕。

不要重新設計 AI 分析內容、Catalog、Evidence 演算法、HTML 視覺或 transport。先建立可重現測試，再修正 Host orchestration。

所有送給 ChatGPT 的正式分析指令與模型可見說明必須使用繁體中文。程式碼 identifier、JSON key、contract ID 與 error code 可使用英文。

## 1. 安全與工作樹規則

開始前必須完整讀取 repository 內適用的 `AGENTS.md`、`package.json`、既有 v0.3.34 reports、git status 與相關 source。不得假設檔名或架構。

使用者既有 tracked dirty 修改及所有 untracked 檔案均不屬於本版：

- 不得刪除、移動、修改、stage 或 commit。
- 不得使用 `git reset --hard`、`git clean`、破壞性 checkout 或未經授權的 stash。
- 不得讀取、輸出、提交或封裝 `.env`、Token、Cookie、OAuth credential、SQLite／DB、個人資料或其他 secret。
- 不得把 `token.txt`、Debug Bundle、測試資料或歷史 Prompt 封裝進 App。
- 若 dirty guard 阻擋 dist，只能依 repository 既有且已授權的保留流程處理，並在報告記錄 `dirtyState=true`；不得修改使用者檔案。

## 2. Target、Git 與受控 Identity

- Target Application：`JiraActivityAnalyzer 0.3.35`
- Branch：`feat/v0.3.35-authoritative-control-lifecycle-artifact-publish`
- Annotated Tag：`v0.3.35`
- Prompt Identity：`JAA-CHATGPT-ZH-TW-0.3.35`
- Prompt Template Version：`0.3.35-zh-TW-v16`
- Pipeline：`JAA-ANALYSIS-PIPELINE-0.3.35`
- Classification Engine：`JAA-CLASSIFICATION-1.6.4`
- Decision Contract：`jaa-ai-analysis-decisions-v5`
- Quality Contract：`jaa-ai-analysis-quality-v4`
- Host Lifecycle Contract：`jaa-host-control-lifecycle-v2`
- Analysis Telemetry Contract：`jaa-analysis-telemetry-v1`
- Artifact Completion Contract：`jaa-artifact-completion-boundary-v1`
- Provider Transport：`bridge-resumable-v4`（維持不變）
- Analysis Bridge：`0.3.35-bridge-v15`
- HTML Renderer：`JAA-LOCAL-HTML-RENDERER-1.5.1`（維持不變）
- Bundled Codex：`0.147.0`（固定 bundled local runtime）

Bridge 行為改變，必須進版 v15。實際 Bridge bytes／SHA-256 只能由固定 Package Source Commit 的最終 build 計算，並驗證 source manifest、external packaged resource 與 runtime loaded module 三者一致。不得沿用 v14 bytes／hash，不得預先捏造。

不搜尋 PATH、不使用外部 Codex／Bridge fallback、不自動下載 runtime。

## 3. 五份正式文件與 byte-exact 綁定

本次必須使用並交付：

1. `JiraActivityAnalyzer_v0.3.35_Complete_Codex_Prompt.md`
2. `Skill_Analysis_Rule_Set_Manifest_v0.8.4.md`
3. `Skill_Classification_Common_Rules_v1.6.4.md`
4. `Skill_Catalog_v0.3.1.md`
5. `Skill_Analysis_HTML_Report_Template_v1.5.1.md`

正式綁定：

| Role | File | Bytes | SHA-256 |
|---|---|---:|---|
| Common Rules | `Skill_Classification_Common_Rules_v1.6.4.md` | 46756 | `3b8cccc062db30a1dbc19ea0b7d75d0e19e44150ab805b2d8ae43ef68f054d57` |
| Skill Catalog | `Skill_Catalog_v0.3.1.md` | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| HTML Template | `Skill_Analysis_HTML_Report_Template_v1.5.1.md` | 38057 | `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02` |

Manifest v0.8.4 不固定自我 hash；JAA 於載入與每個 Run 計算實際 bytes／SHA-256。Codex 必須先解析 Manifest machine-readable JSON，再核對 basename、internal version、bytes、SHA-256 與 runtime identities。

若 Prompt、Manifest、Common Rules 或 runtime registry 的任一 Identity 不一致，必須在 source 修改前或 Provider dispatch 前 fail closed，列出 expected／observed，不得自行猜測哪個版本正確。

Catalog 與 HTML Template 本版 byte-identical 不變，但仍須複製至正式交付、封裝並驗證。

## 4. v0.3.34 真實失敗證據

主要 regression source：

`jira-activity-analyzer-debug-folder-20260824_175354(1).7z`

必須唯讀解壓至 ignored／temporary test-artifacts，不修改原 bundle、不寫 production SQLite、不聯絡 Provider。

### 4.1 Run identity

- Run ID：`analysis_18bc11b0-fb0d-401d-b10c-4cd13bcca01a`
- Provider：`chatgpt_codex`
- Model：`gpt-5.6-sol`
- Duration：341912 ms
- Request／Thread／Turn：1／1／1
- Provider Turn：completed

### 4.2 已成功的事實

- 4/4 files。
- 17/17 records，index 0–16。
- 319220/319220 bytes。
- 80/80 segments，ACK／EOF／ordering／SHA-256 完整。
- `modelInputDelivered=true`。
- finalize 成功。
- finalize 後 `jaa_get_delivery_status` 成功，沒有 replay error。
- ChatGPT 完成 17 筆分析。
- 只呼叫一次 `jaa_publish_analysis_artifacts_v5`。
- Raw Artifact 已 durable 保存，34344 bytes，SHA-256 `cb4d5b120353bed86bd89c9efab9cc84743af02a00a25e546f095734f203da31`。
- Artifact Identity Receipt：accepted=true。
- Decisions：17。
- Status：`CATALOG_DETAIL_MISSING=14`、`UNKNOWN=3`。
- Skill Findings：44。
- Evidence Quote references：79；unique quote IDs：54。
- Validation stages 1–8 的內容檢查均通過，findings=0。

### 4.3 已證實的 Host 矛盾

同一 Run 同時存在：

```text
Model Delivery Receipt: modelInputDelivered=true
Lifecycle Summary: inputStatus=ready
Provider Lifecycle state: PROVIDER_DISPATCHED
Provider Lifecycle finalized: null
Progress handler: INPUT_READY is required before analysis progress
```

Bridge evidence：

```text
jaa_finalize_input_delivery
success=true
providerStateBefore=PROVIDER_DISPATCHED
providerStateAfter=PROVIDER_DISPATCHED
```

所有 segment read 也維持 `PROVIDER_DISPATCHED → PROVIDER_DISPATCHED`，沒有進入 `INPUT_READING`。

ChatGPT 回報 progress 時被多次拒絕：

```text
AI_MODEL_INPUT_DELIVERY_INCOMPLETE
INPUT_READY is required before analysis progress.
```

Artifact 已保存並通過內容驗證，但 publish tool 回：

```text
AI_ANALYSIS_INCOMPLETE
Artifacts require authoritative ANALYSIS_COMPLETED and submission checkpoint.
```

### 4.4 其他 truth 問題

- Lifecycle Summary：`artifactAttemptStatus=received`，但 `artifactStatus=rejected`。
- Validation stages 9–14 沒有建立對應正式產物，卻全部標示 `PASSED`，理由只是 `delegated to v0.3.25 formal pipeline` 或 `formal ... delegated`。
- Canonical、Analyzed Result、Formal Package、HTML、SQLite 實際都沒有建立。
- `validationStatus=not_started` 與 14 份 PASS receipts 互相矛盾。
- `firstFailedStage=ANALYSIS_STARTED`，但 `rootErrorStage=null`。
- Debug completeness 對 Diagnostic Package 使用 `not_applicable_no_submission`，但 Raw Artifact 明確存在。

上述每一點都必須先寫成 failing deterministic regression，修正後才可標記完成。

## 5. 十項已採納決策（全部為 MUST）

### 決策一：分離 Required Control Lifecycle 與 Optional Analysis Telemetry

同一個 Host Controller 內保存兩個不同欄位，但只有 control state 能控制正式產物。

Required control lifecycle：

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

Optional analysis telemetry：

```text
NOT_REPORTED
STARTED
IN_PROGRESS
COMPLETED
COMPLETED_BY_ARTIFACT
```

Telemetry 只用於可觀測性；不得控制 Artifact acceptance、Canonical、Analyzed Result、HTML 或 SQLite。

### 決策二：每個 Run 只能有一個 Host-owned Lifecycle Controller

建立明確的 Run-scoped `HostControlLifecycleController`（名稱可依專案慣例調整），由同一 factory 建立並注入：

- Bridge execution context。
- Provider service。
- Segment handlers。
- Finalize／Delivery Status handlers。
- Progress handler。
- Artifact handler。
- Validation pipeline。
- UI projection。
- Debug／Run Manifest writer。

禁止任何 service 建立第二份 authority。Model Delivery Receipt、Run Manifest、Lifecycle Summary 與 UI 都只是由 Controller 產生的 projection；不得反向成為另一個狀態來源。

所有 transition 必須透過 Controller API，保存 monotonic sequence、state before／after、reason、receipt ID、timestamp 與 idempotency key。

### 決策三：第一個成功 Segment Read 進入 INPUT_READING

`jaa_read_and_ack_next_segment` 第一次成功時原子執行：

```text
PROVIDER_DISPATCHED → INPUT_READING
```

後續 segment reads 維持 `INPUT_READING`。重複讀取、非法 cursor／ACK、scope mismatch 依既有 fail-closed 規則處理，但合法 read 不得將 state 留在 `PROVIDER_DISPATCHED`。

每次 tool evidence 必須顯示同一 Controller 的 state before／after。

### 決策四：Finalize 更新同一 Controller 並驗證 Postcondition

`jaa_finalize_input_delivery` 成功必須在一個 Host-owned atomic operation 中：

1. 驗證 file／record／byte／segment／ACK／EOF／ordering／hash／binding。
2. 建立 immutable Delivery Receipt。
3. 將同一 Controller 從 `INPUT_READING` 更新為 `INPUT_READY`。
4. durable flush receipt 與 transition evidence。
5. 重新讀取 Controller，驗證 postcondition=`INPUT_READY`。
6. 只有全部成功才向模型回 success。

若 receipt 成功但 postcondition 不是 `INPUT_READY`，回覆：

```text
AI_LIFECYCLE_POSTCONDITION_FAILED
```

不得回成功，也不得使用 derived `inputStatus=ready` 掩蓋 Controller state 不正確。

相同 binding 的 finalize replay 回原 immutable receipt；不同 finalAck／hash／binding fail closed。Delivery Status 維持 finalize 前後 readonly、idempotent、不消耗 handle。

### 決策五：Artifact Submission 是權威 Analysis Completion Boundary

有效 Artifact submission 必須取代 `ANALYSIS_COMPLETED progress checkpoint` 成為權威完成證據。

正式接受條件：

- controlState=`INPUT_READY`。
- Model Delivery Receipt complete。
- Artifact token、scope、single-use binding 合法。
- Submission 可解碼並 durable 保存。
- exact N decisions／index coverage／schema 基本條件可檢查。

不要求 telemetry 先為 `COMPLETED`，不要求額外 submission checkpoint。

成功持久化後：

```text
controlState: INPUT_READY → ARTIFACT_RECEIVED
analysisTelemetry: * → COMPLETED_BY_ARTIFACT
```

接著進入 `VALIDATING`。模型未回報 progress、progress 重送或 recoverable progress failure 均不得拒絕有效 Artifact。

Token 仍為 single-use；第二次 Artifact submission 依既有契約拒絕，不導入 repair／retry。

### 決策六：Progress Failure 不阻擋 Artifact

`jaa_report_analysis_progress` 只更新 telemetry。

下列只記 warning／duplicate evidence：

- 相同 phase 重送。
- completedCount 不變。
- 可恢復 completedCount 倒退。
- 較舊 timestamp。
- Artifact call 與較早 progress event 交錯。
- `STARTED`／`IN_PROGRESS` 重複。

下列才拒絕該 progress event：

- Run／Thread／Turn／handle scope mismatch。
- completedCount<0 或 >expectedCount。
- 已 terminal 後試圖改變狀態。
- 跨 Run replay。

拒絕 progress event 不得自動 terminalize Control Lifecycle，也不得封鎖後續合法 Artifact。只有真正的 control／identity／input failure 才可成為 Run root error。

### 決策七：Validation Receipt 禁止 Delegated／Placeholder PASS

固定 14 stages：

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

Stage 1–8 可根據 Artifact 與 frozen inputs 實際執行。

Stage 9–14 只有在對應 action 與 durable evidence 實際完成後才可 `PASSED`：

| Stage | PASS 必要證據 |
|---|---|
| 9 | Canonical 寫入、fsync、atomic rename、reopen、hash、count 驗證 |
| 10 | Analyzed Result atomic publish 與 hash receipt |
| 11 | Active Result commit receipt |
| 12 | Report Data Package 實體檔與 hash receipt |
| 13 | HTML 實體檔與 renderer receipt |
| 14 | 實際 SQLite transaction commit receipt |

禁止使用 `delegated`、`placeholder`、`planned` 或「由舊 pipeline 處理」作為 PASS 理由。

未執行時只能使用：

- `NOT_RUN_DUE_TO_PRIOR_FAILURE`
- `BLOCKED_BY_PRIOR_STAGE`
- `BLOCKED_PENDING_WARNING_ACCEPTANCE`
- `NOT_RUN_BY_TEST_ISOLATION`

Formal stage 首次失敗後，後續相依 Formal stage 不得 PASS。Diagnostic stage 必須另標 `scope=DIAGNOSTIC`，不可冒充 Formal PASS。

### 決策八：Error、Debug Completeness 與 Submission Truth

修正並統一：

- `rootErrorCode`
- `rootErrorMessage`
- `rootErrorStage`
- `firstFailedStage`
- `lastSuccessfulStage`
- `controlState`
- `analysisTelemetry`
- `providerContacted／sent／accepted／completed`
- `artifactReceived／persisted／validated／published`
- derived consequences

禁止 `undefined: undefined`、`rootErrorStage=null` 搭配已知 root failure、或互相矛盾的 lifecycle／validation 狀態。

Debug completeness 至少支援：

```text
submission_received_and_persisted
submission_validated_but_publish_blocked
submission_rejected_before_decode
not_produced_due_to_prior_failure
```

已存在 Raw Artifact 時不得標示 `not_applicable_no_submission`。

每個 Debug Folder 必須包含唯一 Controller snapshot、transition log、analysis telemetry、Delivery Receipt、Artifact receipt、raw submission、validation receipts 與實際產物；不得只存外部 path。

### 決策九：Workspace UI 分層顯示真實結果

Workspace 必須分開顯示：

1. ChatGPT／Provider connectivity。
2. Input Delivery。
3. Model Analysis telemetry。
4. Artifact received／persisted。
5. Artifact content validation。
6. Formal publish。
7. Canonical／Analyzed Result／Active Result。
8. Report Package／HTML。
9. SQLite。

若模型已完成 17 筆並提交完整 Artifact，但正式發布失敗，文案必須類似：

> ChatGPT 已完成 17 筆分析並提交結果，但 JAA 在正式發布階段失敗。

不得只顯示 `Provider failed`，也不得宣稱不存在的 Canonical／HTML／SQLite 已成功。

Results 導頁規則不變：只有 durable Analyzed Result publish 且 Active Result commit 成功才允許自動前往 Results。失敗留在 Workspace。

### 決策十：以 v0.3.34 真實 Artifact 作為主要 Regression

新增 deterministic offline replay，輸入為本 Prompt 第4節的真實 Debug Bundle。

固定期望：

- 4/4 files。
- 17/17 records。
- 319220 bytes。
- 80 segments。
- 17 Decisions。
- 44 Skill Findings。
- 79 Evidence references。
- Status：14 `CATALOG_DETAIL_MISSING`、3 `UNKNOWN`。
- Stage 1–8：依原始 Artifact 實際重新驗證並 PASS、0 findings。
- Stage 9：建立隔離 Canonical。
- Stage 10：建立隔離 Analyzed Result。
- Stage 11：不得取代 production Active Result；使用 test-scoped receipt，不得假 PASS。
- Stage 12：建立隔離 Report Data Package。
- Stage 13：使用 Template 1.5.1 建立隔離 HTML。
- Stage 14：`NOT_RUN_BY_TEST_ISOLATION`。
- Provider contacted=false。
- Production SQLite written=false。
- Production Active Result unchanged。

Replay 不得修改原 Debug Bundle、raw Artifact 或 source fixture。

## 6. Dynamic Tool 與 Controller 整合

沿用 Host-owned zero-identity model contract；模型不得看到或提交 JAA-owned Run／Thread／Turn identity。

至少涵蓋：

- `jaa_get_input_manifest({})`
- `jaa_read_and_ack_next_segment(...)`
- `jaa_get_delivery_status(...)`
- `jaa_finalize_input_delivery(...)`
- `jaa_report_analysis_progress(...)`
- `jaa_publish_analysis_artifacts_v5(...)`

所有 production handler 必須取得相同 Controller reference／context key。不得在每個 tool registration closure 內複製 lifecycle object。Thread／Turn deferred binding 完成後更新 Controller binding，不建立替代 Controller。

Tool schema、TypeScript type、runtime handler、Prompt 說明與 packaged Bridge 必須由同一 contract source/factory 產生。Production handler 回傳前重新 decode／validate `contentItems[0].text`。

安全 tool evidence 只保存：tool name、sequence、duration、success、error code、safe message、control state before／after、telemetry before／after、receipt ID fingerprint。禁止保存完整 token、handle、nonce、credential 或可重播 argument values。

## 7. Standard Formal Prompt 調整

維持繁體中文與單一主要 Turn。模型需知道：

1. 完成所有 segments 後呼叫 finalize。
2. finalize 成功即代表 Host control state=`INPUT_READY`。
3. Progress 回報是選填 observability，不是繼續分析或提交 Artifact 的必要條件。
4. Progress 遇到 recoverable warning 時繼續分析。
5. 完成 N 筆 Decisions 後只呼叫一次 Artifact tool。
6. Artifact submission 本身是分析完成的權威交付。
7. 若整體輸入不可讀，不得合成 N 筆 FAILED；使用 Run-level failure summary。
8. Decision JSON 不得混入摘要；Analysis Report／final summary 使用獨立欄位。
9. 不產生 HTML、不寫檔、不執行 shell、不宣稱 Canonical／HTML／SQLite 成功。

不增加 batch、repair、第二個 Turn、自動 retry 或 fallback。

## 8. Offline、Live 與歷史 Regression 測試

### 8.1 預設 Offline

`npm.cmd run test:v0.3.35` 必須完全 offline：不聯絡 ChatGPT、不需要 OAuth、不消耗 token、不寫 production SQLite。

至少測試：

1. Controller factory 每 Run 只建立一份 authority。
2. 不同 service 取得同一 Controller instance／key。
3. 第一個 segment：`PROVIDER_DISPATCHED → INPUT_READING`。
4. 後續 segment 保持 `INPUT_READING`。
5. finalize 原子更新為 `INPUT_READY`。
6. finalize postcondition 失敗時不回 success。
7. Delivery Status finalize 前後 idempotent。
8. 相同 finalize 回相同 receipt；不同 binding fail closed。
9. Artifact 從 `INPUT_READY` 成功進入 `ARTIFACT_RECEIVED`。
10. telemetry=`NOT_REPORTED` 時 Artifact 仍可接受。
11. recoverable progress failure 不阻擋 Artifact。
12. valid Artifact 設定 `COMPLETED_BY_ARTIFACT`。
13. duplicate Artifact 被 single-use token 拒絕。
14. Stage 9–14 無實際 evidence 時不得 PASS。
15. Test isolation SQLite=`NOT_RUN_BY_TEST_ISOLATION`。
16. 已有 submission 不得分類為 no submission。
17. root error／stage／control state 一致。
18. 每 Run 只有一筆 terminal event。
19. v0.3.34 真實 Artifact replay 完整通過固定期望。
20. v0.3.33 兩份 lifecycle replay 不退化。
21. v0.3.31／v0.3.32／v0.3.33／v0.3.34 relevant regressions PASS。
22. Bridge source／external packaged／runtime identity 一致。

### 8.2 Opt-in Live 17

維持：

```powershell
$env:JAA_ENABLE_LIVE_PROVIDER_TEST = "1"
$env:JAA_LIVE_PROVIDER_TEST_CONFIG = "<absolute local config path>"
npm.cmd run test:live:v0.3.35:17
```

缺少 opt-in、config、files 或既有 Managed ChatGPT auth 時為 `NOT RUN`，不得改用 fixture 宣稱 Live PASS。

本機選取5份輸入：Pending JSON＋Manifest＋Common Rules＋Catalog＋HTML Template。Provider只接收1 JSON＋3 model-visible MD；Template local-only。

Live runner 使用正式 production service path，但使用 isolated Live Test Run Root，不寫 production SQLite、不取代 production Active Result。維持1 request／1 thread／1 turn／1 Artifact submission，禁止batch／repair／retry／fallback。

### 8.3 真實 UI 手動驗證

封裝完成後將真實17筆 Standard Formal列為必要人工驗證。只有17筆走到Analyzed Result與HTML後，才建議使用者測117筆。

Codex不得自動執行117筆 Live case。

## 9. Validation、Persistence 與下游規則

- Raw AI submission：先 durable persist，再驗證，原始 bytes 不修改。
- Artifact token／identity 不合格：禁止 Formal pipeline，但保留安全 evidence。
- Stage 1–8 PASS：進入 Canonical assembly。
- Quality WARNING：允許 Canonical／Analyzed Result／Package／帶警告 HTML；未經 durable acceptance 禁止 SQLite。
- Quality BLOCKED：禁止 Formal Canonical；依既有規則建立 Diagnostic Package／HTML。
- Canonical、Analyzed Result、Package、HTML：全部使用 `.tmp`、fsync、atomic rename、reopen、hash verify。
- SQLite：只有對應 gate 真正允許且 transaction commit 成功才能 PASS。
- HTML renderer 只讀 Report Data Package＋Template，不查 Jira／SQLite／AI DB、不呼叫 Provider。

不得將本次 v0.3.34 歷史 Raw Artifact 自動匯入 production Active Result 或 SQLite。它只用於隔離 replay。正式 production 結果由修正後的新 Run 產生。

## 10. Debug Folder 與即時對話

維持 append-only：

- `conversation.jsonl`
- `provider-stream.jsonl`
- Bridge tool evidence
- provider dispatch ledger
- transition log

每次按下開始分析以本機時間＋Attempt／Run ID 建立獨立資料夾。強制關閉後識別 interrupted Run，不得附上先前最新 Run。

Debug completeness 必須 lifecycle-aware，區分：

- expected and present
- genuinely missing
- not produced due to prior failure
- not applicable by lifecycle
- intentionally excluded sensitive content
- submission received/persisted
- submission validated but publish blocked
- test isolation not run

Debug export 前 flush writer，保存 flush completeness 與 file manifest。每個收錄檔重新計算 bytes／SHA-256，不得只保存外部 path。

## 11. UI 範圍

只修改 AI Analysis Workspace 與結果導頁所需真實性，不重做整體 UI。

Workspace 建議狀態卡：

```text
PROVIDER
INPUT DELIVERY
MODEL ANALYSIS
ARTIFACT
CONTENT VALIDATION
FORMAL PUBLISH
CANONICAL / ANALYZED RESULT
PACKAGE / HTML
SQLITE
```

顯示實際 count、status、root error 與最後成功階段。若 Artifact已收到，UI不可仍顯示0筆或「ChatGPT未分析」。

既有 `#/precision-probe` 的 `probe-mode-stability` packaged UI selector問題不在本版範圍，建立或更新獨立issue／報告；不得為了修它擴張v0.3.35 source。基本renderer boot、首頁route與AI Analysis目標頁仍需驗證。

## 12. 執行順序

1. 唯讀盤點repo、AGENTS、git status、v0.3.34 source／reports。
2. 建立指定branch，不改寫歷史。
3. 驗證五份MD與Identity。
4. 唯讀解壓三份真實bundle：v0.3.33兩份＋本次v0.3.34一份。
5. 先建立v0.3.34 failing replay。
6. 建立單一Controller與control／telemetry分層。
7. 修正segment、finalize postcondition與delivery status。
8. 修正Artifact completion與progress non-gating。
9. 移除delegated／placeholder PASS。
10. 修正UI、Debug completeness與root error truth。
11. 執行offline tests、歷史replay、typecheck、build。
12. 固定Package Source Commit。
13. 執行dist、packaged verifier、ASAR/security scan、win-unpacked／Portable smoke。
14. 若使用者已明確opt-in且config／auth完整，可執行Live 17 runner；否則標記NOT RUN。
15. 產生報告與時間帳。
16. `git diff --check`，精準stage本版檔案，提交source與final delivery commits，建立annotated tag。
17. 僅在remote與權限明確時push branch/tag；被安全審查阻擋時誠實回報，不規避。

## 13. 必跑命令

依repo實際scripts實作並執行，至少包括：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.35
npm.cmd run replay:v0.3.34
npm.cmd run replay:v0.3.33
npm.cmd run build
npm.cmd run dist
git diff --check
```

新增或維持packaged Bridge／runtime verifier。Live命令不得被預設test、build、dist或CI隱式呼叫。

## 14. 封裝與安全驗證

正式產物：

- Installer EXE。
- Portable EXE。
- win-unpacked EXE。

每項記錄absolute path、bytes、SHA-256、Build Time、Package Source Commit。

驗證：

- ASAR inventory。
- Bridge external-only：app.asar=0、external=1、stale=0。
- Bridge bytes／SHA-256／loadability／identity。
- Bundled Codex 0.147.0 version／path／SHA-256。
- 四份規則文件basename／version／bytes／hash。
- Prompt／Pipeline／Manifest／Bridge runtime identity。
- 敏感檔名與credential pattern掃描。
- win-unpacked與隔離Portable：`did-finish-load`、`renderer_boot`、initial route ready，無crash／白畫面。
- AI Analysis目標頁基本smoke。

既有precision-probe selector失敗可列為獨立known issue，但不得冒充AI Analysis lifecycle failure。

## 15. 正式報告

至少產生：

1. `JiraActivityAnalyzer_v0.3.35_test_and_verification_report.md`
2. `JiraActivityAnalyzer_v0.3.35_artifact_manifest.json`
3. `JiraActivityAnalyzer_v0.3.35_execution_time_ledger.json`
4. `JiraActivityAnalyzer_v0.3.35_authoritative_lifecycle_report.md`
5. `JiraActivityAnalyzer_v0.3.35_artifact_completion_report.md`
6. `JiraActivityAnalyzer_v0.3.35_v0334_artifact_replay_report.md`
7. `JiraActivityAnalyzer_v0.3.35_validation_receipt_truth_report.md`
8. `JiraActivityAnalyzer_v0.3.35_debug_submission_truth_report.md`
9. `JiraActivityAnalyzer_v0.3.35_live_provider_validation_report.md`
10. `JiraActivityAnalyzer_v0.3.35_rule_set_alignment_report.md`
11. `JiraActivityAnalyzer_v0.3.35_packaged_runtime_report.md`

Offline Replay、Live Provider、UI Manual Validation 必須分欄，不能互相代替。

Execution ledger 記錄每個主要命令的start、end、duration、exit code。Actual token telemetry只能使用真實runtime資料；無法取得寫`unavailable`，禁止估算冒充。

## 16. 不在本版範圍

- 不修改Catalog 279 Skills。
- 不修改HTML Template／Renderer視覺或DSL。
- 不修改Decision v5／Canonical v5／Report Data Package v1資料結構。
- 不修改Evidence Quote Catalog／Normalizer／Segmenter演算法。
- 不修改transport v4分段策略。
- 不新增batch、repair、第二Turn、automatic retry或fallback。
- 不修precision-probe selector。
- 不自動將歷史v0.3.34 Artifact匯入production。
- 不自動執行117筆Live case。
- 不同步本機Conversation到ChatGPT網頁。
- 不讓模型直接寫檔、產生HTML或寫SQLite。

## 17. 完成定義

自動化工程只有在下列全部成立才算完成：

- 十項決策全部實作並有測試。
- v0.3.34真實Artifact可offline replay至隔離Canonical／Analyzed Result／Package／HTML。
- Stage 9–14不再出現delegated／placeholder PASS。
- Segment state與finalize postcondition使用同一Controller。
- Artifact acceptance不依賴progress completed。
- Debug／UI能正確表達已分析、已提交、已驗證與正式發布的差別。
- typecheck、offline tests、replay、build、dist、packaged verifier、basic startup smoke通過。
- Bridge v15 source／package／runtime一致。
- 五份文件Identity完全一致。
- 使用者dirty／untracked資料完整保留。
- Git commits／tag可追溯。

若Live 17未執行，Overall Status必須為`Partial / Manual Validation Pending`。若Live 17執行但Quality為WARNING／BLOCKED，必須分開報告transport／lifecycle與content quality，不得以單一failed掩蓋已成功階段。

## 18. 最終回覆格式

最終回覆使用繁體中文，至少包含：

- Target與Overall Status。
- 十項核心修正。
- v0.3.34真實Artifact replay結果。
- 17 Decisions／44 Findings／79 refs／status distribution是否守恆。
- Stage 1–14實際結果，特別列出9–14的durable evidence。
- typecheck／test／replay／build／dist／packaged smoke結果與耗時。
- Live 17：PASS／FAIL／NOT RUN；是否真的聯絡Provider。
- Installer／Portable／win-unpacked path、bytes、SHA-256、Build Time。
- Bridge v15 bytes／SHA-256。
- Branch、Package Source Commit、Final Delivery Commit、annotated tag、push/upstream狀態。
- 報告路徑。
- token telemetry狀態。
- precision-probe selector是否仍為獨立known issue。
- 使用者既有檔案未被修改的確認。

禁止把Replay寫成Live、把Provider completed寫成Artifact成功、把Artifact persisted寫成Canonical成功、把planned／delegated stage寫成PASS、或把derived consequence寫成root cause。
