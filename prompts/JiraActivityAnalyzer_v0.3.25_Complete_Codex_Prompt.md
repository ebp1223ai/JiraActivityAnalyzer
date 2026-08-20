# Jira Activity Analyzer v0.3.25 — 正式完整 Codex 實作 Prompt

## 0. 文件用途

請在既有 Jira Activity Analyzer repository 中完成 `v0.3.25`。本文件是可直接交付 Codex 執行的完整實作、驗證、封裝與 Git 交付指令，不是概念草稿。

- Repository：`F:\AI\JiraActivityAnalyzer`
- Target Version：`0.3.25`
- 建議 Branch：`feat/v0.3.25-per-file-rule-selection-gated-results-workspace`
- Annotated Tag：`v0.3.25`
- 預設語言：繁體中文
- 既有 Provider：`chatgpt_codex`
- Bundled Codex：維持官方固定版 `0.147.0`
- Decision Contract：維持 `jaa-ai-analysis-decisions-v4`
- Analysis Bridge identity：`0.3.25-bridge-v7`
- Canonical Contract：維持 `jaa-canonical-analysis-result-v5`
- Report Data Package Contract：維持 `jaa-analysis-report-data-package-v1`
- HTML Template Contract：維持 `jaa-html-report-template-v5`
- HTML Renderer identity：維持 `JAA-LOCAL-HTML-RENDERER-1.4.0`
- 新 Rule Selection Transaction：`jaa-rule-set-selection-transaction-v1`
- 新 Active Result Contract：`jaa-active-analysis-result-v1`
- 新 Navigation Decision Receipt：`jaa-analysis-navigation-decision-v1`

版本基線是已完成的 `v0.3.24`。請保留 v0.3.24 的 Decision v4、Evidence Segmenter、聚合式 Validator、Canonical v5、Report Data Package、Snapshot、HTML Template／Renderer、SQLite Gate、Bundled Codex 與本機 durable evidence 架構；本版聚焦於規則檔選取交易、分析導頁閘門、統一 Active Dataset、Results UI 精簡、狀態一致性及 Debug attempt lineage。

## 1. 角色與執行原則

你是本版本的主要實作者與驗證者。開始修改前，先完整檢查 repository、`AGENTS.md`、package scripts、目前 branch、HEAD、remote、工作樹、v0.3.24 實作與報告。

你必須自行完成：

1. 從實際程式碼與既有 Debug evidence 定位根因。
2. 建立可測試的狀態機與資料契約，不得只修 UI 表象。
3. 修改 Electron main／preload／renderer、IPC、validator、Run archive、Debug collector 與必要 migration。
4. 新增自動化測試與 regression 測試。
5. 執行 typecheck、測試、build、dist、ASAR 與隔離啟動驗證。
6. 產生正式報告、commit、annotated tag 與 push。

若 Managed OAuth、真實 Jira、production SQLite、117 筆正式分析或乾淨 Windows GUI 無法安全執行，明確列為 `Manual Validation Pending`；不得以 mock、fixture、靜態檢查或估算冒充真實驗證。

## 2. 不可破壞的安全邊界

1. 保留使用者全部既有 tracked dirty changes 與 untracked files。
2. 禁止 `git reset --hard`、`git clean`、強制 checkout、強制 push、未經授權 stash、刪除或覆寫使用者資料。
3. 不得提交 token、OAuth credential、session、cookie、真實 Jira 私密資料、production database 或其他敏感檔案。
4. 不得終止使用者已在執行的 JAA、Codex 或其他 Electron process；啟動驗證使用隔離 profile。
5. 真實 17／117 筆資料只能唯讀驗證，不得修改或提交。
6. 所有不確定、mismatch 與 transaction failure 都必須 fail closed；不得 silent fallback 或偽裝成功。

## 3. 已確認根因與本版必須修正的事實

請先用程式碼與測試重現並證明下列現象，不要直接假設只需換文案：

1. 使用者明確選取位於測試資料夾的四份 MD 後，畫面仍可能顯示 `BUNDLED_DEFAULT` 及暫存 bundled path。
2. Template 實際 bytes／SHA-256 與 Manifest 宣告一致，UI 仍可能顯示 `AI_HTML_TEMPLATE_HASH_MISMATCH`。
3. 同一畫面可能同時出現 `verified` 與舊 mismatch banner。
4. 重新驗證成功未可靠清除舊錯誤；錯誤轉換曾產生 `undefined: undefined`。
5. Manual selection 失敗或狀態遺失後，preflight 可能回報 `Rules and dataset source paths are required`。
6. 點擊開始分析會過早切到 Activity Events 分析結果，即使尚無可用 analyzed result 或後續 validation 已失敗。
7. Results 頁混入大量 Workspace diagnostics、lifecycle、對話、Bridge 與 token 技術資訊，並同時列出失敗／零結果 Run，造成內容重複且難以辨識目前有效結果。
8. Debug Folder 在未建立新 Run 時可能選入前一次舊 Run，讓外層 v0.3.24 attempt 與內層 v0.3.22 Run 混在一起。
9. Debug collector 仍可能尋找無版本 alias，或對「Artifact 已發布但 validation 失敗」產生錯誤缺檔理由。

修正必須涵蓋 state ownership、transaction boundary、receipt、IPC error normalization、navigation gate、active result selection 與 debug attempt correlation。

## 4. 已採納且不可擅自變更的十項產品決策

### 決策一：四份參考 MD 各自選取

Rule Set Manifest、Classification Common Rules、Skill Catalog、HTML Report Template 每一列都必須有自己的「選取／更換檔案」按鈕。移除單一共用的「明確選擇四份文件」按鈕。

### 決策二：Manual Explicit 採 Draft／Active 原子交易

選取單一檔案只更新 Draft。Active Bundled 或既有 Active Manual set 在 Draft 4/4 完整驗證前不得被覆蓋。四份檔案全部通過同一 Manifest binding 後，才一次原子切換成 `MANUAL_EXPLICIT`。禁止半套套用、來源混搭與 fallback。

### 決策三：統一驗證與一致的錯誤生命週期

UI 即時驗證與 Provider preflight 必須使用同一個 validation service 與同一契約。成功重新驗證必須清除相同 attempt 的舊錯誤；不得同時顯示 verified 與 mismatch，不得出現 `undefined: undefined`。

### 決策四：開始分析後留在分析工作區

點擊「使用 ChatGPT 分析／開始分析」後留在分析工作區，顯示 Run 的進度、對話與診斷。只有 durable、可重新開啟、hash 驗證完成的正式 Analyzed Result JSON 已建立，且 Active Result commit 成功後，才允許自動或手動前往 Activity Events 分析結果。

### 決策五：成功結果自動成為 Active Dataset

新的正式分析成功後，自動把該 Analyzed Result 設為 Active Dataset，接續建立 Report Data Package、權威統計與第一份 HTML。任一較新的失敗 Run 不得取代先前成功結果。

### 決策六：自動分析與手動匯入共用單一管線

兩個入口都必須進入同一個 `validate -> activate -> package -> statistics -> render` pipeline：

- 正式分析完成的 Analyzed Result JSON。
- 操作者手動匯入的 completed Analyzed Result JSON。

不得維護兩套語意、兩套統計或上下各一組 UI。

### 決策七：Results 以統一 Active Dataset 呈現

移除「最新結果」與「另外匯入結果」的分割。Results 只呈現目前 Active Dataset；歷史成功結果可用精簡下拉選單切換。Failed、Partial、Cancelled、invalid、0-result Run 不得成為 Active，也不得出現在預設成功結果清單。

### 決策八：Results 顯示完整檔案 lineage 與權威統計

Results 必須清楚顯示目前 Analyzed Result JSON、由它建立的 Report Data Package JSON、套用的 HTML Template、產出的 HTML，以及從 Package 計算的最新統計。所有統計不得取自 ChatGPT prose。

### 決策九：診斷資訊移回分析工作區

Failure Diagnostics、Lifecycle、完整對話、Analysis Report、final assistant response、Provider／Thread／Token／Bridge 細節從 Results 移除，改放分析工作區的可收合診斷區，並完整保存在 Debug Folder。

### 決策十：修正 Debug attempt／Run 關聯

Debug Folder 必須區分「本次 UI attempt」與「正式 Run」。若 preflight 失敗而沒有建立新 Run，必須輸出本次 attempt evidence，不得自動把上一個舊 Run 當成本次 Run。Role-based collector 必須使用實際版本化檔名與正確缺檔原因。

## 5. 既有架構決策維持不變

1. 正式分析使用固定內建官方 Codex `0.147.0`，啟動時驗證路徑、版本與 SHA-256。
2. 不搜尋 `PATH`、不使用外部 Codex、不自動下載、不允許外部 fallback。
3. 維持 JAA Managed ChatGPT/OAuth 與 Codex app-server 架構，不新增 API key 替代流程。
4. 單一 Run、單一 request、單一 thread、單一主要 turn；不得新增固定 batch、逐筆 request、逐筆 turn或自動 repair。
5. ChatGPT 對話與 Provider stream 只保存於 JAA 本機，不要求同步 ChatGPT 網頁。
6. Provider 正式輸入維持 `1 JSON + 3 MD`；HTML Template local-only，不送模型。
7. Provider stream 與 conversation 維持 append-only、buffered durable flush。
8. Decision v4、Evidence Segmenter、Evidence Normalizer、聚合式 validator、Quality Gate、Canonical v5、Snapshot reference、Report Data Package v1、HTML Template v5、Renderer 1.4.0 及 SQLite Gate 維持既有契約。
9. Failed、diagnostic-only 或未通過正式 gate 的結果不得寫入正式 SQLite。

## 6. 本版正式文件與版本規則

本次交付與封裝必須包含：

- `Skill_Analysis_Rule_Set_Manifest_v0.7.0.md`
- `Skill_Classification_Common_Rules_v1.5.0.md`，內容必須與 v0.3.24 byte-for-byte 相同
- `Skill_Catalog_v0.3.1.md`，內容必須與 v0.3.24 byte-for-byte 相同
- `Skill_Analysis_HTML_Report_Template_v1.4.0.md`，內容必須與 v0.3.24 byte-for-byte 相同

每份 MD 的版本必須同時出現在檔名與 machine-readable metadata。Manifest v0.7.0 綁定其餘三份文件的 exact basename、version、bytes、SHA-256 與 consumer。未改版文件不得因換行、BOM、格式化或複製流程改變 bytes。

## 7. Rule Set Selection Transaction v1

### 7.1 狀態模型

建立獨立 domain service，不得把 authoritative state 只放 React component：

```text
activeSet
  mode: BUNDLED_DEFAULT | MANUAL_EXPLICIT
  roles[4]: verified immutable file receipts
  manifestBindingReceipt
  activatedAtUtc
  activeSetId

draftSet
  attemptId
  roles[4]: EMPTY | SELECTED | VALID | INVALID
  perRoleReceipt
  aggregateBindingState
  createdAtUtc / updatedAtUtc
```

每次選檔產生新的 role selection event，包含 role、使用者實際選取 path、basename、bytes、hash、document version、attemptId 與時間。

### 7.2 四列 UI

四個角色列各自提供：

- 選取／更換檔案按鈕
- Draft path 與 Active path，兩者不得混淆
- versioned basename
- 內部 version
- bytes
- SHA-256
- source kind
- Draft validation status
- Active status
- 明確錯誤原因

移除 standalone「本機 HTML Renderer（不送給 ChatGPT）」大卡片。HTML Template 列保留簡短 `Local only` 或「不送 ChatGPT」標記即可。

### 7.3 原子啟用規則

1. 使用者選取任一 role 後立即驗證該檔。
2. 只有 Draft 4/4 role 都有效時才進行 aggregate Manifest binding。
3. aggregate 全部通過後才原子建立新的 Active Set。
4. atomic activation 失敗時保留舊 Active Set；Draft 顯示失敗。
5. 提供「取消本次選取」清除 Draft。
6. 提供「使用內建預設」的明確操作；切回 bundled 也須建立 activation receipt。
7. App restart 後若需恢復 Manual Active，必須重新開啟四檔並驗證 bytes/hash；失敗則 fail closed 並要求操作者處理，不得偷偷換成 bundled。

### 7.4 Manifest self-reference

Manifest 不得以不可實現的方式自我綁定自己的 SHA-256。可用 `runtime-calculated` self hash，但其餘三份檔案必須 exact hash binding。Manifest 內部版本、basename、target app version 與 schema 必須驗證。

## 8. Unified Validation Service

UI、重新驗證、分析 preflight、HTML render preflight 與 Debug completeness 必須重用同一核心 parser／validator。不得各自複製 hash 或 marker 邏輯。

每個 finding 至少包含：

```text
errorCode
messageZhTw
selectionMode
attemptId
role
actualPath
actualBasename
actualBytes
actualSha256
expectedBasename
expectedBytes
expectedSha256
expectedSource
manifestRuleSetId
activeSetId
draftState
occurredAtUtc
cause
```

必要錯誤碼至少包括：

- `AI_RULE_FILE_NOT_SELECTED`
- `AI_RULE_FILE_NOT_FOUND`
- `AI_RULE_FILE_READ_FAILED`
- `AI_RULE_FILE_UTF8_INVALID`
- `AI_RULE_FILE_VERSION_MISMATCH`
- `AI_RULE_FILE_HASH_MISMATCH`
- `AI_RULE_SET_BINDING_FAILED`
- `AI_HTML_TEMPLATE_INVALID`
- `AI_HTML_TEMPLATE_HASH_MISMATCH`
- `AI_RULE_SELECTION_TRANSACTION_INCOMPLETE`
- `AI_RULE_SELECTION_ACTIVATION_FAILED`

Error normalization 必須接受 Error、string、structured IPC error 與 unknown；最終 UI 永遠有穩定 error code 與人類可讀 message，禁止 `undefined: undefined`。

同一 attempt 重新驗證成功時，清除該 role 與 aggregate 的已解決 finding；歷史 finding 留在 append-only audit／Debug，但不得繼續顯示成 active banner。Active UI 的 `verified` 必須只代表目前 active receipt，不代表過去曾驗證成功。

## 9. Analysis Attempt、Run 與導頁閘門

### 9.1 Attempt 先於 Run

每次按下開始分析，立即建立 `analysisAttemptId` 與 attempt archive，即使 preflight 失敗、尚未 dispatch Provider，也要有 durable evidence。

Attempt 至少保存：

- requestedAtUtc／local
- pending dataset receipt
- active rule set receipt
- instruction mode／effective instruction hash
- preflight findings
- dispatch decision
- linkedRunId 或 `null`
- navigation decisions
- terminal status

只有 preflight 全部通過後才建立／連結正式 Run。

### 9.2 不得過早導頁

按下開始後：

1. 保持在「分析工作區」。
2. 顯示目前 attempt／Run 狀態與必要進度。
3. Provider、Artifact、Validation、Canonical、Analyzed Result 的錯誤在此顯示。
4. 只有 `Active Result Commit` 成功時才可自動導向 Results。

禁止用下列狀態作為導頁依據：Provider accepted、Provider completed、Artifact published、模型輸出 N 筆、Analysis completed flag、Canonical 尚未 durable、檔案只存在 tmp、SQLite 成功與否。

### 9.3 Navigation Decision Receipt

每次導頁判斷寫入 `jaa-analysis-navigation-decision-v1`：

```text
analysisAttemptId
runId
fromRoute
requestedTargetRoute
decision: ALLOW | DENY | DEFER
reasonCode
analyzedResultReceiptId
activeResultId
evaluatedAtUtc
```

允許導頁的最低條件：正式 Analyzed Result 已 atomic publish、fsync、reopen、hash verify、schema/semantic/quality gate 合格，並完成 Active Result transaction。SQLite、Package 或 HTML 後續失敗不得否定已有效的 Analyzed Result。

## 10. Active Analysis Result v1

### 10.1 Authoritative identity

Active Result 至少保存：

```text
activeResultId
sourceKind: ANALYSIS_RUN | MANUAL_IMPORT
analyzedResultPath
analyzedResultSha256
analyzedResultBytes
recordCount
sourceDatasetSha256
ruleSetId
runId | importId
authoritativeCompletedAtUtc
activatedAtUtc
packageState
htmlState
sqliteState
```

`Latest` 定義為最近成功完成且 durable verified 的正式 Analyzed Result 的 `authoritativeCompletedAtUtc`，不得使用 Run 目錄 mtime、Debug export time 或最近 attempt time。

### 10.2 不取代規則

- 新 Run failed／partial／cancelled／timeout／invalid：不取代現有 Active Result。
- 新 Run 只有 Provider completed 或 Artifact published：不取代。
- 手動匯入驗證失敗：不取代。
- Analyzed Result 成功但 Package／HTML／SQLite 失敗：Analyzed Result 仍可成為 Active，Results 顯示 downstream error 與 retry。

### 10.3 歷史成功結果

維護精簡的 successful result registry，只收正式、可重新開啟、hash 相符的 analyzed result。Results 可用下拉選單切換；切換同樣走 Active Result transaction，不得在左側預設列出大量 failed 或 0-result Run。

## 11. Unified Result Pipeline

建立一個可重入、idempotent 的本機 pipeline：

```text
Analyzed Result candidate
  -> strict validate
  -> durable receipt
  -> Active Result transaction
  -> Report Data Package build/reuse
  -> authoritative statistics
  -> HTML render/reuse
```

### 11.1 自動分析入口

Canonical 成功並發布 Analyzed Result 後，自動送入上述 pipeline。成功 activation 後允許導向 Results；Package 與 HTML 可在 Results 顯示進行中或失敗重試狀態。

### 11.2 手動匯入入口

「匯入已分析 JSON」不得直接改 UI state。先建立 import attempt，驗證 contract、schema、count、stable identity、source hash、rule references 與必要 provenance；通過後才送入同一 pipeline。

外部 analyzed result 的 SQLite 權限維持既有安全規則。若契約禁止寫正式 SQLite，UI 必須清楚標示，但仍可建立 Package／統計／HTML。

### 11.3 Idempotency

相同 analyzed result hash + package builder identity + snapshot/database identity 產生相同 Package identity；相同 Package hash + Template hash + Renderer identity 產生可追溯的新 render receipt。重新執行不得重複污染資料庫或破壞既有 artifact。

## 12. Results UI 精簡規格

Results 是「成功結果檢視與報告」頁，不是 Run diagnostics 頁。

### 12.1 保留內容

1. Active Dataset 摘要與成功歷史下拉選單。
2. 「匯入已分析 JSON」。
3. 搜尋、狀態／Skill 等結果篩選。
4. 分析結果清單與 review 操作。
5. CSV 匯出。
6. 產生／重新產生 HTML。
7. Analyzed Result、Report Data Package、HTML 的 lineage。
8. Package-derived 最新統計。

### 12.2 移除或移回 Workspace

從 Results 移除：

- 大型 Failure Diagnostics 卡片
- Provider／Parsed、Schema／Semantic、Formal／SQLite 等技術格
- Analysis Lifecycle 全格狀態
- 完整分析對話
- raw Analysis Report／final assistant response
- Provider、request、thread、turn、token、Bridge preflight 技術資訊
- Failed／Partial／Cancelled／0-result Run 的預設清單
- 與「分析工作區」重複的路徑與錯誤內容
- standalone HTML Renderer 大卡片

這些資訊改放分析工作區的「診斷與完整對話」可收合區，並保留於 Debug Folder。

### 12.3 Active Dataset header

頁首至少顯示：

- Active result display name
- source kind
- authoritative completion time
- record count
- validation/quality state
- current package state
- current HTML state
- 非阻斷 downstream error 與 retry action

### 12.4 File lineage

以單一、精簡但可展開的 lineage 區顯示：

**Analyzed Result JSON**

- full path／basename
- bytes／SHA-256
- record count
- runId 或 importId
- source dataset SHA-256
- ruleSetId
- completed time

**Report Data Package JSON**

- path／bytes／SHA-256
- packageId／contract version
- analyzed result hash
- unique issue count
- snapshot completeness
- database／snapshot source identity
- builder identity／built time

**HTML**

- path／bytes／SHA-256
- package hash
- template basename／version／SHA-256
- renderer identity
- rendered time

## 13. 權威統計

Results 的統計只能由目前 Active Result 對應的 Report Data Package 以 deterministic local code 計算。不得使用 ChatGPT 文字摘要、conversation、HTML DOM 反推或直接在 Results 臨時查 Jira。

至少提供並清楚標示 population：

### 13.1 Event population

- total analyzed records
- classified／excluded／needs review／unknown
- event type breakdown
- Skill／status distribution

### 13.2 Unique Issue population

依 `jiraServerIdentity + normalized Issue Key` 去重，同一 Issue 多筆 event 只算一次：

- unique issue count
- issue type distribution
- priority distribution
- project distribution
- Jira workflow status distribution
- component distribution
- label distribution
- snapshot field state distribution

Bug 有 Root Cause、Feature 無 Root Cause 等差異必須透過 snapshot field state（例如 `PRESENT`、`EMPTY`、`NOT_APPLICABLE`、`NOT_CAPTURED`、`SOURCE_UNAVAILABLE`、`CONFLICT`）表達，不能把不適用誤算為缺資料。

統計必須顯示 Package identity、計算時間與口徑定義；切換 Active Dataset 時必須整批切換，不得混用上一份 Package。

## 14. 分析工作區

Workspace 保留並整理：

1. 四檔 Active／Draft selection。
2. Pending dataset。
3. Instruction mode／附加指令。
4. 開始、取消與 Run 狀態。
5. 完整本機保存的 JAA ↔ ChatGPT 對話。
6. Provider、Bridge、Lifecycle、validation、artifact、token telemetry（若可取得）。
7. Analysis Report 與 final assistant response。
8. failure diagnosis、錯誤 stage、retry/recovery action。
9. Debug Folder 匯出。

診斷資訊預設可收合，但不得刪除 evidence。若分析失敗，留在 Workspace 並把第一個權威錯誤與聚合 findings 清楚呈現。

## 15. Debug Folder v0.3.25

### 15.1 Attempt-aware inventory

Debug root 必須先收集本次 `analysisAttemptId`。若存在 linked Run，再收集該 Run；若不存在，明確標記 `runCreated=false`。禁止用「最新 Run」或目錄 mtime 補入舊 Run。

### 15.2 Role-based versioned collection

規則檔依 Active/Draft receipt 中的 role、actual basename、path 與 hash 收集。禁止硬編碼 `html-report-template.md` 等無版本 alias。

### 15.3 必收證據

- attempt manifest／status／preflight findings
- Active Rule Set receipt
- Draft transaction／per-role receipts（如存在）
- pending dataset receipt
- linked Run manifest 或明確 no-run reason
- source/model delivery receipts
- provider stream／conversation／final response（如存在）
- artifact attempts／validation aggregate findings
- analyzed result receipt（如存在）
- active result transaction
- navigation decision receipts
- Report Data Package／statistics receipts（如存在）
- HTML render receipts（如存在）
- SQLite receipts（如存在）
- debug completeness／file manifest／flush completeness

### 15.4 正確缺檔理由

缺檔原因必須依實際 lifecycle：

- preflight failed before Run
- Provider not dispatched
- Provider failed before artifact
- Artifact absent
- Artifact published but validation failed
- Analyzed Result published, downstream package failed
- Package published, HTML failed
- file expected but genuinely missing／hash mismatch

不得在 Artifact 已發布時聲稱「Run 在 artifact publication 前結束」。

## 16. 標準正式分析指令

Provider effective instruction 維持繁體中文與 v0.3.24 Decision v4 契約，不因本次 UI 改版要求模型處理 HTML、Package、統計或檔案 I/O。

模型仍只負責：

1. 完整讀取 JAA Bridge 提供的 `1 JSON + 3 MD`。
2. 對每筆 record 依規則產生 Decision v4。
3. 一次提交 direct JSON array，精確 N 筆。
4. 提供完整繁體中文 Analysis Report 與 final assistant summary。

模型不得：

- 使用 shell／PowerShell 讀寫正式 artifact
- 產生 HTML 或 Report Data Package
- 查詢本機 DB
- 自行更改 schema／evidence ID／record order
- 固定分批、逐筆提交或自動 repair

## 17. 自動化測試

新增 `npm.cmd run test:v0.3.25`，至少覆蓋以下案例。

### 17.1 Per-file selection

1. 四列各有獨立 picker，點擊只更新指定 role Draft。
2. 只選 1／2／3 份不得更改 Active Set。
3. 4/4 valid + binding pass 才 atomic activation。
4. 其中一份 hash／version／marker 錯誤，舊 Active 保留且不得 dispatch。
5. Manual 不得混 bundled。
6. cancel Draft 與明確切回 Bundled。
7. App restart revalidation。
8. HTML Template actual hash 等於 Manifest expected 時必須成功。
9. 成功 revalidate 清除 active mismatch banner。
10. 任意 thrown value 不得顯示 `undefined: undefined`。

### 17.2 Attempt／navigation

1. preflight failure 有 attempt archive、沒有假 Run。
2. Provider accepted／completed 不導頁。
3. Artifact published 但 validation failed 不導頁。
4. Analyzed Result durable + Active commit 成功才 ALLOW。
5. newer failed attempt 不取代既有 Active Result。
6. navigation receipt reason 可重播驗證。

### 17.3 Unified Active Dataset

1. 新成功分析自動 activate。
2. valid manual import 使用相同 pipeline。
3. invalid import 不取代 Active。
4. 成功歷史下拉只含 valid analyzed results。
5. Latest 依 authoritative completion time，不依 mtime。
6. 相同 result 重跑 idempotent。

### 17.4 Downstream recovery

1. Analyzed Result 成功、Package 失敗：Results 仍可開啟並可 retry。
2. Package 成功、HTML 失敗：統計仍顯示並可重新 render。
3. SQLite 失敗不移除 Active Result。
4. 切換 Active 時 lineage、stats、results 同步切換。

### 17.5 Results UI

1. 不顯示 diagnostics／conversation／token／Bridge 大卡片。
2. 顯示 Analyzed Result、Package、HTML lineage。
3. 搜尋、篩選、review、CSV、HTML 功能可用。
4. Event 與 Unique Issue 統計口徑正確。
5. failed／partial／cancelled／0-result 不在預設成功清單。

### 17.6 Debug Folder

1. preflight-only attempt 不包上一個 Run。
2. linked Run 僅收正確 runId。
3. versioned Template 收集成功，不尋找無版本 alias。
4. Artifact published + validation failed 的 absent reason 正確。
5. Active／Draft path/hash 與 navigation receipts 完整。
6. flush completeness 與 file manifest hash 可驗證。

### 17.7 Existing regression

v0.3.24 的 Decision v4、Evidence Segmenter、aggregate validator、Quality Gate、Canonical、Report Package、Snapshot、HTML renderer、SQLite、17／117 fixture 測試不得退化。

## 18. 真實案例人工驗證矩陣

### 18.1 四檔手動選取

以使用者指定資料夾的 Manifest v0.7.0、Common v1.5.0、Catalog v0.3.1、Template v1.4.0：

1. 逐列選取。
2. 確認 Draft path 顯示使用者實際路徑。
3. 確認 Active 在 4/4 前不變。
4. 確認 4/4 後切成 MANUAL_EXPLICIT。
5. 確認 Template hash 不再誤報。
6. 確認開始分析能通過 rules/dataset preflight。

### 18.2 17 筆

執行至少一次 Managed OAuth 正式分析，確認不過早導頁，成功後自動 Active、Package、統計、HTML。若環境不可用，列為 Manual Validation Pending。

### 18.3 117 筆

執行正式 117 筆案例或以既有 fixture 做唯讀 regression。必須分別報告「真實 Provider 執行」與「fixture 驗證」，不得混為一談。

### 18.4 失敗案例

故意造成一份 MD hash mismatch 及一次 artifact validation failure，確認都留在 Workspace、Results 不被新失敗污染、Debug Folder 不抓舊 Run。

## 19. 效能與 Provider 行為

1. 不得增加固定 batch、逐筆 request 或自動 repair。
2. Rule selection validation 應以單次檔案讀取與快取 receipt 避免重複 I/O；preflight 仍要 reopen/hash 驗證。
3. Provider stream buffered append 最長 durable flush 間隔維持既有安全上限。
4. 保留 14／15 分鐘效能警告與 20 分鐘 hard timeout，若既有實作如此定義；報告實際值。
5. UI 不得假造百分比進度。
6. Package／HTML 本機工作不應阻塞 renderer thread。

## 20. Build、Package 與啟動驗證

至少執行並記錄 actual duration／exit code：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.25
npm.cmd run build
npm.cmd run dist
git diff --check
```

另須：

1. 檢查 package source commit 與 dirty state。
2. 檢查 ASAR inventory：只有 v0.3.25 Bridge 與正確規則文件，不得殘留 stale Bridge／Rule／Template。
3. 掃描敏感檔名、credential pattern 與不應封裝資料。
4. 驗證 bundled Codex version／path／SHA-256。
5. 驗證 bundled Rule Set 四檔 bytes/hash。
6. 以隔離 profile 短啟動 win-unpacked 與 Portable，確認 renderer boot、did-finish-load、route ready，無 crash／white screen。
7. 不終止使用者既有 process。

封裝產物至少包含 Installer、Portable、win-unpacked EXE 的完整 path、bytes、SHA-256、Build Time 與 Package Source Commit。

## 21. 正式報告

至少產生：

- `JiraActivityAnalyzer_v0.3.25_test_and_verification_report.md`
- `JiraActivityAnalyzer_v0.3.25_artifact_manifest.json`
- `JiraActivityAnalyzer_v0.3.25_execution_time_ledger.json`
- `JiraActivityAnalyzer_v0.3.25_rule_selection_transaction_report.md`
- `JiraActivityAnalyzer_v0.3.25_navigation_gate_report.md`
- `JiraActivityAnalyzer_v0.3.25_active_result_pipeline_report.md`
- `JiraActivityAnalyzer_v0.3.25_results_ui_report.md`
- `JiraActivityAnalyzer_v0.3.25_debug_attempt_lineage_report.md`
- `JiraActivityAnalyzer_v0.3.25_rule_template_alignment_report.md`
- 更新適用的既有 HTML／SQLite regression 報告

Execution ledger 必須使用實際量測值，至少記錄 step、startedAt、finishedAt、durationMs、exitCode、result、evidence path。Actual token telemetry 只能填實際取得值；若環境沒有提供，填 `unavailable`，不得以字數、檔案大小或推算值冒充。

## 22. Git 交付流程

1. 建立 `feat/v0.3.25-per-file-rule-selection-gated-results-workspace`。
2. 僅 stage 本版本檔案；保留所有使用者既有 dirty／untracked 資料。
3. 建議先提交 package source commit。
4. 從該 commit build／dist，產生報告與 artifact manifest。
5. 提交 final delivery commit。
6. 建立 annotated tag `v0.3.25` 指向 final delivery commit。
7. push branch 與 tag。
8. 驗證 upstream ahead／behind `0/0` 與 remote SHA。

若 push 遭權限、安全政策或遠端拒絕，停止並誠實報告；不得改用 force push、其他 remote 或規避方式。

## 23. Definition of Done

只有同時符合以下條件才可宣稱自動化交付完成：

1. 四份 MD 各有獨立 picker。
2. Draft／Active 原子交易與 receipts 完成。
3. 不再出現 valid hash 被誤報、verified/mismatch 並存或 `undefined: undefined`。
4. 開始分析後不過早導頁。
5. 只有正式 Analyzed Result durable + Active commit 才允許 Results。
6. 新成功分析與手動匯入共用同一 pipeline。
7. Results 只顯示 Active successful dataset、lineage、統計、結果與報告操作。
8. 診斷與完整對話移至 Workspace 並保留 Debug evidence。
9. Latest 不會被較新的失敗 attempt 取代。
10. Debug Folder 不把前一個舊 Run 當成本次 preflight failure。
11. v0.3.24 核心資料／模型／Package／HTML／SQLite 契約無退化。
12. typecheck、test:v0.3.25、build、dist、git diff check、ASAR 與短啟動驗證通過。
13. 正式產物、SHA-256、報告、commit、tag 與 push 完成。

真實 Managed OAuth、117 筆、production SQLite 或乾淨 Windows Installer GUI 若未執行，Overall Status 必須是 `Partial / Manual Validation Pending`，不得宣稱 Fully Validated。

## 24. 最終回覆格式

最終回覆使用繁體中文，先給結果，再列證據：

1. Target Version 與 Overall Status。
2. Branch、Package Source Commit、Final Delivery Commit、Tag、Push／upstream。
3. 十項決策各自的實作結果。
4. Rule Selection、Navigation Gate、Active Result、Results UI、Debug Attempt 的關鍵驗證。
5. typecheck／test／build／dist／git diff／ASAR／啟動結果與實際耗時。
6. Installer／Portable／win-unpacked 的 path、bytes、SHA-256。
7. Bundled Codex、Bridge、Rule Set、Template、Renderer identities 與 hash。
8. 報告路徑。
9. 人工驗證待辦。
10. Actual token telemetry；無法取得時明確寫 `unavailable`。
11. 既有 dirty／untracked 使用者資料是否完整保留。

不得只回覆「已修正」或只列自動測試 PASS；必須提供可追溯 commit、artifact、hash、receipt 與報告證據。
