# Jira Activity Analyzer v0.3.11 — AI Analysis Single-Run Correctness & Golden HTML Report

## Codex 正式完整實作 Prompt

請在既有 `JiraActivityAnalyzer` repository 內，基於已完成實作、測試、Windows 封裝並 Push 的 **v0.3.10 AI Analysis UI Reconstruction & Functional Alignment**，完成：

> **v0.3.11 — AI Analysis Single-Run Correctness & Golden HTML Report**
> AI 分析單次執行正確性、Token 優化、Skill 精準映射與 Golden HTML 報告

本版不是新增另一套 AI 功能，也不是只修改 HTML／CSS。主要任務是修正 v0.3.10 真實資料驗證確認的四個問題：

1. 117 筆 Activity Event／Diff 被拆成 117 次 ChatGPT 分析請求。
2. 三份規則與 Catalog 被重複傳送，造成 1,415,735 Total Tokens 與 21 分 16.929 秒執行時間。
3. Skill Candidate 高度偏向每個 Group 的第一個 Skill／`_001`，且 Negative Rules 缺乏可稽核證據。
4. 軟體產生的 HTML 與手動請 ChatGPT 產生的 Golden HTML，在資訊架構、內容完整性、互動與閱讀體驗上差異過大。

除非遇到未解決錯誤、資料安全風險、權限阻擋、必要測試失敗，或必須由使用者決定的重大產品歧義，否則不要停在分析、原始碼、測試或 Build；必須一路完成必要測試、Production Build、Windows Installer／Portable 封裝、有限 packaged smoke、Package Audit、執行時間／Token 帳、精準 Commit 與 Push。

若執行過程出現一般可自行修復的錯誤，應在授權範圍內持續診斷、修正與重跑，不要在每個小問題後停下來詢問。

---

## 一、已採納且不得自行更改的產品決策

下列四項已由使用者正式採納：

1. Target Version 固定為 `v0.3.11`。
2. ChatGPT 正式分析採**嚴格單次請求**；容量不足時停止，不做自動分批、逐筆或其他 fallback。
3. 手動版 HTML 作為版型與資訊架構的 **Golden HTML Reference**，但不把其中每一個 Skill 判定視為絕對正確答案。
4. 本版優先修正 ChatGPT Provider；AI Nexus 共用新的 JSON Schema 與 HTML Renderer，但不強制 AI Nexus 也必須採單次請求。

任何實作便利性、既有 queue abstraction、provider 共用 batching 邏輯或 timeout 設計，都不得覆蓋上述決策。

---

## 二、版本、分支與 Git 基準

- Target Version：`v0.3.11`
- Theme：`AI Analysis Single-Run Correctness & Golden HTML Report`
- 預定 Branch：`feat/v0.3.11-ai-analysis-single-run-golden-report`
- 基準：remote 上已 Push、包含完整 v0.3.10 功能的最新安全 commit。
- 不建立 Tag。
- 不建立 GitHub Release。
- 不 force push。
- 不 rebase 使用者尚未確認的 branch。
- 不執行 `git reset --hard`、`git clean` 或其他可能破壞使用者資料的命令。

執行前必須：

1. 讀取 repository 內的 `AGENTS.md`、project instructions、README、PROJECT、CHANGELOG、VERSION、package scripts 與既有 Prompt。
2. 執行 `git fetch --all --prune`。
3. 顯示並記錄 repository 完整絕對路徑、remote、目前 branch、HEAD、upstream、ahead／behind。
4. 確認實際基準包含 v0.3.10 的 ChatGPT Codex App Server、AI Nexus、Offline Rule、AI Analysis SQLite、Analyzed JSON、HTML report 與 Windows packaging。
5. 記錄 `git status --short`、tracked diff 與 untracked 清單。
6. 保留所有既有使用者修改與未追蹤檔案；不得覆蓋、刪除或順手提交。
7. 若 remote HEAD 已前進，以包含完整 v0.3.10 功能的最新安全 commit 為準，並在最終回報列出實際 base branch／commit。

不得只因本 Prompt 提供了預定 branch 名稱，就在未核對 repo 現況前覆蓋現有分支。

---

## 三、使用者提供的正式驗證附件

Codex 開始實作前，必須找到、Resolve、讀取並計算 SHA-256 的附件如下。

### 3.1 上一版 Prompt／需求基準

```text
JiraActivityAnalyzer_v0.3.10_AI_Analysis_UI_Reconstruction_Codex_Prompt.md
```

用途：確認 v0.3.10 的 UI、provider、安全、路徑、SQLite、`.env`、packaging、ledger 與 Git 交付規則。本 Prompt 未明確變更的 v0.3.10 正確行為均應保留。

### 3.2 本次真實 Pending Dataset

```text
pending-analysis_user-all-activity-events_20260810_171729_058c6544.json
```

附件在瀏覽器下載後可能帶 `(2)` 等 collision suffix；應以檔案內容、source SHA-256 與 metadata 辨識，不得只靠顯示檔名。

本次已知內容基準：

```text
SHA-256: 37aa0da07e7adcb755740caa961377a3685077f4008c2f725b62b475b0b2353b
Size:    1,021,410 bytes
Events:  117
```

### 3.3 v0.3.10 軟體版輸出

```text
分析-user-all-activity-events_20260810_171729_058c6544-18299dd7.json
分析-user-all-activity-events_20260810_171729_058c6544-18299dd7.html
```

已知 SHA-256：

```text
JSON: 8354ea1dee111324108b9a811a3a44f42399cdb70cde58468128e68c9970e1be
HTML: df7f38fd62b4aebb45c6bd16b27430a82737d2b304ae9e47f4725ab8a76d9dfc
```

用途：重現 per-record request、Token、`_001` 分布、progress 矛盾、缺少 raw provider response 與舊 HTML 資訊不足等問題。

### 3.4 手動 ChatGPT POC 結果與 Golden HTML

```text
analyzed-user-all-activity-events_20260810_171729_058c6544_poc-20260811.json
skill-analysis-user-all-activity-events_20260810_171729_058c6544_poc-20260811.html
```

已知 SHA-256：

```text
JSON: 151cba2c44c93326d6b9d3beb4cc89be685f9d42e9686b2c748510dcb5f04001
HTML: 3165b5333667f65be965982499356625d18062f5267cb8f23437c933f58bc5b2
```

用途：

- 手動 JSON：輸出欄位完整度、Negative Checks、Evidence、理由與狀態拆分的參考。
- 手動 HTML：資訊架構、章節、統計、卡片、表格、篩選、事件明細、展開／收合與列印版面的 Golden Reference。
- 手動 POC 的 Skill 判定是比較基準，不是硬編碼答案，也不得直接複製進產品輸出。

### 3.5 三份分析依據

```text
Skill_Analysis_Rule_Set_Manifest.md
Skill_Catalog_v0.3.0.md
Skill_Classification_Common_Rules_v1.1.0.md
```

已知 SHA-256：

```text
Manifest:     ebfcf78fd08a1f54ad7482c650b26b74b740fa9fde75eb2fba7457570fa88af8
Catalog:      4a167843d709d8ac5e910983ffc392ae417cab5a12c16e7b3e732027cbaf1aca
Common Rules: 523f6584d34f7b6ed7756214563570f6e99baac5cced02ce12afd70a01074fc5
```

本次 Catalog 預期解析結果：

```text
Catalog records:     279
Unique Skill IDs:    279
Duplicate Skill IDs: 0
```

附件檔名可能帶 `(1)`、`(2)` 等下載 suffix。Codex 必須用 Manifest、內容與 Hash 建立本次 canonical snapshot，不得把多份同內容附件誤當成多份 Catalog 載入。

### 3.6 附件處理硬性規則

1. 使用 `Resolve-Path` 或等價方式取得每個附件的完整絕對路徑。
2. 最終回報列出實際使用檔案的完整絕對路徑、bytes 與 SHA-256。
3. 若任何必要附件缺失或 Hash 與上述基準不符，先判斷是否為使用者另給的新版本；不得靜默使用不明檔案。
4. 找不到 Golden HTML 時不得憑記憶重畫；應停止 Golden HTML 視覺實作並回報 blocker。
5. 真實 Pending／Analyzed JSON、公司規則、Golden HTML、軟體輸出、Provider response、screenshots 與測試產物不得 Commit，除非 repository 已明確核准追蹤對應的去識別 fixture。

---

## 四、v0.3.10 已確認的問題基線

對 `117` 筆事件的 v0.3.10 軟體版 JSON，已確認：

| 指標 | v0.3.10 實際值 |
|---|---:|
| `totalDiffs` | 117 |
| `totalBatches` | 117 |
| `requestCount` | 117 |
| 不同 `requestTraceId` | 117 |
| `retryCount` | 1 |
| `elapsedMs` | 1,276,929 |
| Input Tokens | 1,390,681 |
| Cached Input Tokens | 326,912 |
| Output Tokens | 25,054 |
| Reasoning Tokens | 10,632 |
| Total Tokens | 1,415,735 |

另已確認：

- 284 個軟體 Skill Candidates 中，176 個為 `_001`，占 62.0%。
- 173 個為該 Group 在 Catalog 的第一筆，約占 60.9%。
- 手動版判定 `EXCLUDED` 的 38 筆中，軟體版仍對其中 21 筆產生 Skill Candidates。
- 軟體版 `matchedRuleIds`、`negativeEvidenceRefs` 幾乎沒有可稽核內容。
- 軟體版標示 `rawResultAvailable=true`，但正式 JSON 沒有實際保存可用的 Provider 最終原始回覆。
- `totalBatches=117`、`completedBatches=1`、`currentBatch=117` 的 progress 語意互相矛盾。

本版測試與驗收必須能重現上述舊行為並證明已修正；不得只改顯示數字。

---

## 五、本版修改範圍

### 5.1 必須修改

- ChatGPT formal analysis orchestration。
- ChatGPT Thread／Turn lifecycle、progress、cancel 與 usage capture。
- Pending Dataset → compact full-run payload builder。
- 容量／Token preflight。
- Prompt template 與 strict output contract。
- Provider 最終可見回覆保存、Hash 與 gzip staging。
- Analysis result parser、schema validation、count conservation 與 Catalog exact lookup。
- Group-first／`_001` fallback 的移除。
- Classification／review 狀態拆分。
- Analyzed JSON schema／version 與 legacy reader。
- Golden HTML local renderer、CSS、JavaScript、filters、print style 與 report validation。
- 結果 UI 的真實 stage／request／record／token 顯示。
- Completed-only JSON／HTML／SQLite transaction。
- AI Nexus 對新 JSON Schema 與共用 HTML Renderer 的相容。
- Offline Rule／legacy result viewer 對新 Renderer 的必要相容。
- 直接覆蓋上述契約的 unit、integration、provider mock、schema、UI、report、packaging 與 regression tests。
- VERSION、CHANGELOG、README、PROJECT、docs、Prompt、ledger、Build Version／Build Time。

### 5.2 除必要相依外不得修改

- Dashboard。
- Connections & Data Source。
- Import。
- Timeline。
- User Viewer／Issue Viewer。
- Jira fetch、Full Fetch、DB Merge、Activity Stream Probe／Jira Probe。
- 原始 Jira SQLite schema 或資料語意。
- sidebar、AI Analysis 三子分頁結構與 v0.3.10 已驗收 UI。
- 與本版無關的 dependency 或全域樣式。

若必須修改共用元件，必須以 regression test 證明其他頁面沒有行為或視覺回歸。

### 5.3 禁止事項

- 不得恢復 OpenAI API Key／Base URL／`api.openai.com` direct call。
- 不得改用 ChatGPT 網頁 Cookie、Local Storage 或非官方 Token。
- 不得把 ChatGPT credential 存入 `.env`、SQLite、renderer state、logs、diagnostics 或 export。
- 不得把整個 SQLite、完整 1 MB Pending JSON 外殼、Full Fetch archive、未選取 event、`.env`、本機 DB schema／path 傳給模型。
- 不得讓 ChatGPT 使用 shell、filesystem、MCP、Plugin、Skill、web、browser 或其他工具。
- 不得使用 synthetic success、固定 timeout、假 token、假 progress 或預先寫死的 117 筆結果冒充完成。
- 不得以 Group 名稱、Skill Name 相似度、Catalog 順序或 `_001` 產生 fallback Skill ID。
- 不得在容量不足時靜默改成逐筆或分批。
- 不得讓 ChatGPT 額外生成 HTML。
- 不得把模型的 raw reasoning／chain-of-thought 當成必要輸出或保存；只保存 App Server 正式可見的最終回覆、標準事件與 usage metadata。

---

## 六、目標流程與狀態機

正式流程固定為：

```text
Pending JSON + Manifest + Catalog + Common Rules
→ local source/rules/hash validation
→ build one compact payload containing all selected events
→ capacity/token preflight
→ create one dedicated ChatGPT thread
→ start one analysis turn with rules once + all events once
→ capture visible final provider response + usage
→ strict parse/schema/count/catalog validation
→ merge result back to original local evidence
→ atomically produce final JSON + Golden HTML
→ completed-only SQLite transaction
```

ChatGPT run states 至少包含：

```text
idle
validating_source
validating_rules
building_payload
preflighting_capacity
starting_thread
starting_turn
waiting_response
receiving_response
validating_response
merging_evidence
writing_staging
validating_artifacts
committing_database
completed
cancelling
cancelled
failed
```

要求：

- 所有 terminal state 不得回到 running state。
- 切換分頁、重新整理 renderer 或 reopen App 後，必須 hydrate main process 持有的真實 run state。
- late event 必須以 `analysisRunId + threadId + turnId` scope，不能污染下一個 run。
- 禁止以 event index 或 `setTimeout` 模擬進度。

---

## 七、完整來源驗證與 Compact Payload

### 7.1 Source validation

開始 ChatGPT run 前必須重新驗證：

- Pending JSON schema／format version。
- source file 完整絕對路徑、bytes、SHA-256。
- `sourceRecordStableId`、`activityEventId`、`evidenceId` 唯一性。
- selected Diff identity 與 content hash。
- source count 與 selected count。
- Jira Server／source DB identity 僅供本機比對，不送給模型。
- 三份 rules files 的 canonical path、version、bytes、mtime、SHA-256。
- Catalog records／unique ID／duplicate details。
- 本次 rules snapshot ID。

任何 identity、hash、duplicate 或 source mismatch 失敗時，不得建立 Thread。

### 7.2 Compact payload 原則

不得把原始 Pending JSON 原封不動送出。應建立 deterministic、可重現、可 Hash 的 compact payload。

每筆 event 至少保留：

```text
recordIndex
sourceRecordStableId
activityEventId
evidenceId
sourceContentHash
issueKey（依 masking policy）
actor（依 masking policy）
eventTimestamp
sourceProvenance
fieldName
addedText
removedText
normalizedDiffEvidence
```

可以刪除：

- UI 狀態。
- export 外殼。
- 本機完整路徑。
- SQLite path／schema／rowid。
- 可由 stable ID 在本機重新合併的 metadata。
- 重複 Issue metadata。
- 不參與分類的完整 integrity 外殼。

compact payload 必須保存於 run-scoped staging 供稽核，並記錄：

- schema version。
- build algorithm version。
- event count。
- uncompressed bytes。
- SHA-256。
- masking policy。
- source→compact field mapping summary。

真實 confidential payload 不得 Commit。

### 7.3 Payload 順序

單一 Turn 的 prompt/input 順序固定為：

1. 任務、禁止事項與輸出契約。
2. Manifest snapshot metadata。
3. Common Rules／Negative／Exclusion Rules。
4. 完整 279 筆 Skill Catalog。
5. 全部 selected compact Activity Events，維持 source order。
6. strict JSON response schema 與 conservation rules。

三份規則在該 Turn 中各只能出現一次；不得在每個 event 內重複附加。

---

## 八、ChatGPT 嚴格單次分析契約

### 8.1 單次的正式定義

對每個 ChatGPT `analysisRunId`：

```text
Analysis Run Count           = 1
Thread Count                 = 1
Turn Count                   = 1
App-issued turn/start Count  = 1
Main Analysis Payload Count  = 1
Rules Transmission Count     = 1 set
Event Payload Count          = all selected events in that one payload
App-level Retry Count        = 0
Automatic Repair Turn Count  = 0
```

對本次基準檔，還必須滿足：

```text
Selected Events = 117
Payload Events  = 117
Result Records  = 117
```

不得將 `117 records` 包裝成一個 run、實際仍在內部迴圈執行 117 個 `turn/start` 或 117 個 provider request。

### 8.2 App Server 使用方式

沿用 bundled Codex App Server，由 Electron main process 唯一管理 protocol connection。至少正確處理：

```text
initialize / initialized
thread/start
turn/start
turn/started
item/agentMessage/delta
item/completed
thread/tokenUsage/updated
turn/completed
turn/interrupt
thread/delete 或 ephemeral cleanup
```

以實際 bundled runtime 產生的 TypeScript／JSON Schema 為準：

```text
codex app-server generate-ts --out <staging-schema-dir>
codex app-server generate-json-schema --out <staging-schema-dir>
```

若 schema 與既有程式假設不同，修正 typed adapter 與 tests，不得以 `any` 或未驗證 payload 繞過。

### 8.3 安全 Thread

- dedicated、ephemeral、read-only、empty workspace。
- tools、shell、filesystem、MCP、plugins、skills、web search、image、browser 全部禁止。
- 不與「測試對話」、diagnostics 或其他正式 run 共用 Thread。
- 取消、完成或失敗後進行 bounded cleanup。
- cleanup 失敗只記錄 sanitized warning，不得把已失敗 run 誤標 Completed。

### 8.4 容量與 Token preflight

在建立 Thread 前完成：

- compact payload bytes。
- prompt/rules/catalog bytes。
- tokenizer／runtime 可取得時的 input token estimate。
- model context capacity（只能使用 bundled runtime／model metadata 或官方可驗證資料，不可硬猜）。
- planned max output tokens。
- safety margin。
- total required context。

若無法證明完整輸入與預留輸出可安全容納，或估算超過模型容量，必須：

```text
status    = failed
errorCode = ANALYSIS_INPUT_CONTEXT_TOO_LARGE
```

並顯示／保存：

- input estimate。
- model capacity（可取得時）。
- reserved output。
- safety margin。
- compact payload bytes／hash。
- 建議使用者縮小選取資料或改用可容納模型。

此時：

- 不建立 Thread／Turn。
- 不自動分批。
- 不逐筆分析。
- 不產生 final JSON／HTML。
- 不寫正式 SQLite。

### 8.5 Retry 與 repair

- App 層不得對完整 ChatGPT 分析自動重送或建立第二個 Turn。
- Response schema invalid、missing record、invalid Skill ID、Evidence mismatch、截斷或 parse failed，整個 run 進入 failed staging。
- 不建立 automatic repair Turn。
- 使用者可在 UI 查看 sanitized failure reason 後，手動重新啟動一個新的 `analysisRunId`。
- 若 App Server／upstream 內部在同一 Turn 透明重試且 protocol 有正式欄位可觀測，必須照實記錄；不得捏造或把它誤算成 App-issued Turn。

---

## 九、Prompt 與輸出契約

### 9.1 模型任務

模型必須對全部 events 進行一致的全局分析，且每筆都執行：

- attribution check。
- positive evidence check。
- negative／exclusion rules。
- keyword-only prohibition。
- automation／historical attribution exclusion。
- Catalog exact Skill ID selection。
- near-skill discrimination。
- confidence reasoning。

模型不得：

- 只回傳 Group。
- 使用不存在 Skill ID。
- 以 Catalog 第一筆代替無法判斷的 Skill。
- 因 Skill Name 相似就猜 ID。
- 省略 EXCLUDED／UNKNOWN record。
- 省略 Negative Checks。

### 9.2 Record-level schema

每個輸入 event 必須恰好對應一個 result record：

```ts
type ClassificationStatus = "MATCHED" | "EXCLUDED" | "UNKNOWN";
type ReviewStatus = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED";
type ReviewAttention = "STANDARD_REVIEW" | "NEEDS_REVIEW";

interface AnalysisRecordResult {
  recordIndex: number;
  sourceRecordStableId: string;
  activityEventId: string;
  evidenceId: string;
  sourceContentHash: string;
  classificationStatus: ClassificationStatus;
  reviewStatus: "PENDING_REVIEW";
  reviewAttention: ReviewAttention;
  dispositionReason: string;
  exclusionReason: string | null;
  unknownReason: string | null;
  matchedRuleIds: string[];
  negativeChecks: NegativeCheck[];
  analyses: SkillCandidate[];
}

interface SkillCandidate {
  skillId: string;
  score: number;
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  scoreComponents: Record<string, number>;
  positiveSignals: string[];
  positiveEvidenceRefs: string[];
  negativeChecks: NegativeCheck[];
  negativeEvidenceRefs: string[];
  rejectedNearSkills: RejectedNearSkill[];
  evidenceQuote: string;
}

interface NegativeCheck {
  ruleId: string;
  passed: boolean;
  detail: string;
  evidenceRefs: string[];
}

interface RejectedNearSkill {
  skillId: string;
  reason: string;
}
```

實際 interface 可依 repository schema style 調整，但語意與欄位完整度不得降低。

### 9.3 Classification 與 review 分離

- `MATCHED`：有充分 evidence 對應至少一個 exact Skill ID。
- `EXCLUDED`：明確命中 exclusion／negative rule，不應分類。
- `UNKNOWN`：資訊不足、無法精確選擇 Skill 或沒有充分證據。
- 所有新 AI result 初始 `reviewStatus=PENDING_REVIEW`；不得因高信心自動視為人工確認。
- `reviewAttention=NEEDS_REVIEW` 用於低信心、規則衝突、候選接近或資料異常；一般待人工確認使用 `STANDARD_REVIEW`。
- 只有人工操作可把 `reviewStatus` 改為 `CONFIRMED` 或 `REJECTED`，並保存 audit history。

`CATALOG_DETAIL_MISSING` 等舊語意應移至獨立 `catalogDetailStatus`／warning，不再混入三值 `classificationStatus`。

### 9.4 Catalog 本機補值

模型只需提供 exact `skillId` 與分析證據。App 必須：

1. 以本次 canonical Catalog snapshot 做 exact ID lookup。
2. 由本機補入 canonical `skillName`、`group`、catalog status／detail metadata。
3. 驗證 Group／Name 不可由模型覆蓋。
4. Skill ID 不存在時整個 response validation 失敗；不得 fuzzy match 或 fallback。

### 9.5 守恆與唯一性

Completed 必須滿足：

```text
inputRecordCount = outputRecordCount
selectedStableIdSet = outputStableIdSet
每個 stable ID 恰好一次
MATCHED + EXCLUDED + UNKNOWN = outputRecordCount
EXCLUDED analyses.length = 0
UNKNOWN analyses.length = 0
MATCHED analyses.length >= 1
每個 Skill ID 存在於本次 Catalog snapshot
每個 evidence ref 屬於同一 input record
```

任一條件不符，整個 run failed；不得部分寫入正式結果。

---

## 十、禁止 Group-first／`_001` fallback

必須搜尋並移除所有可能造成下列行為的程式路徑：

- Group → `catalog.find(first)`。
- Group → index 0。
- parse failure → first candidate。
- missing Skill ID → `${group}_001`。
- fuzzy Skill Name → first matching Group。
- empty candidates → default Skill。

正確行為：

```text
沒有 exact valid Skill ID
→ classificationStatus = UNKNOWN
→ reviewAttention = NEEDS_REVIEW
```

若模型回傳 invalid Skill ID，則屬 response contract violation，整個 run failed；App 不得自行改成 UNKNOWN 後掩蓋 provider contract 問題。

每次 run 額外產生 distribution diagnostics：

- candidate count。
- unique Skill ID count。
- `_001` count／ratio。
- Group-first count／ratio。
- Skill frequency ranking。
- Group frequency ranking。
- invalid Skill ID count。
- empty negative checks count。
- EXCLUDED with candidates count。

這些數字只作診斷與回歸警戒；不得因 `_001` 本身存在就自動判定錯誤。

---

## 十一、Provider 可見原始回覆與稽核證據

每個 ChatGPT run 至少保存：

- `analysisRunId`。
- thread ID。
- turn ID。
- App-issued request ID／trace ID（可取得時）。
- app-issued Thread／Turn／payload counts。
- internal retry metadata（官方事件可取得時）。
- started／first response／completed timestamps。
- durationMs。
- input／cached input／output／reasoning／total token usage（實際可取得時）。
- 最終可見 agent response text／JSON。
- response bytes、SHA-256。
- parse result。
- schema validation result。
- count／identity／Catalog validation result。
- compact payload bytes、SHA-256。
- prompt template version／SHA-256。
- rules snapshot ID／file hashes。

Provider response 使用 gzip 保存，例如：

```text
provider-response_<timestamp>_<analysisRunId>.json.gz
```

要求：

- gzip 內容只包含 App Server 正式可見、產品為除錯所需的 response/event metadata；不得要求、重建或輸出隱藏 chain-of-thought。
- secrets、auth、account identifiers 與不必要本機路徑先 sanitize。
- final analyzed JSON 記錄 raw response 的完整本機路徑、bytes、SHA-256 與 compression。
- failed／cancelled run 保留 run-scoped failed staging，直到操作者手動刪除；不得進入正式 result table。
- `rawResultAvailable=true` 只有在檔案確實存在、Hash 可驗證且可由 UI 開啟所在資料夾時才能成立。

---

## 十二、Analyzed JSON v0.3.11

沿用既有 envelope 的可相容欄位，提升 schema／format version，至少新增或明確保存：

- source Pending file identity／path／hash／counts。
- compact payload schema／bytes／hash／masking policy。
- rules snapshot 與三檔 metadata。
- provider／model／runtime／prompt version／hash。
- run、thread、turn、request、retry counts。
- startedAt／completedAt／durationMs。
- input／cached／output／reasoning／total tokens。
- raw provider response path／hash／compression。
- classification／review status separation。
- `matchedRuleIds`。
- `positiveEvidenceRefs`。
- `negativeChecks`。
- `negativeEvidenceRefs`。
- `rejectedNearSkills`。
- distribution diagnostics。
- JSON／HTML artifact pairing metadata。

輸出建議命名：

```text
analyzed-user-all-activity-events_<timestamp>_<analysisRunId>.json
skill-analysis-user-all-activity-events_<timestamp>_<analysisRunId>.html
provider-response_<timestamp>_<analysisRunId>.json.gz
```

若沿用既有中文 `分析-` 命名，必須 collision-safe，且 JSON metadata 保留 source name、run ID 與 artifact role。不可覆寫既有結果。

---

## 十三、Golden HTML Report

### 13.1 Golden Reference 使用方式

正式 Golden HTML：

```text
skill-analysis-user-all-activity-events_20260810_171729_058c6544_poc-20260811.html
```

Codex 必須：

1. Resolve 完整絕對路徑並驗證 SHA-256。
2. 實際在瀏覽器渲染 Golden HTML。
3. 建立 Golden HTML 章節／元件／互動 inventory。
4. 同時渲染 v0.3.10 軟體 HTML，列出 gap matrix。
5. 以 App 本機固定 Renderer 重建，不得 iframe、不直接把 Golden HTML 的資料硬塞進產品。

Golden HTML 是：

- 資訊架構基準。
- 視覺密度與層級基準。
- 章節、統計、篩選、事件明細與列印基準。
- 輸出欄位完整度基準。

Golden HTML 不是：

- 每筆 Skill ID 的硬編碼答案。
- 可直接 Commit 的公司資料 fixture。
- 讓 ChatGPT 每次自由重新生成 HTML 的 Prompt。

### 13.2 HTML 必含內容

- 報告標題、生成時間、App Version、Build Version。
- 分析摘要與整體結論。
- source／rules／provider／model／prompt／run metadata。
- Pending JSON、rules files、final JSON、provider response 的完整本機路徑與 Hash；長路徑必須可完整複製。
- Request／Thread／Turn／Token／duration 統計。
- `MATCHED`／`EXCLUDED`／`UNKNOWN`／`NEEDS_REVIEW` 統計。
- Skill Group 分布。
- Skill ID 排名、次數與占比。
- `_001`／Group-first diagnostics。
- 全部 Activity Events。
- source record／evidence identity。
- Issue、actor、timestamp、field、original Diff／added／removed Evidence。
- Skill ID、Skill Name、Group。
- score、score components、confidence、reason。
- Positive Signals／Evidence refs。
- Negative Checks／Evidence refs。
- rejected near skills。
- exclusion／unknown reason。
- review status／attention／audit summary。
- 搜尋與 filters：status、review、Group、Skill、actor、issue。
- 展開／收合單筆與全部。
- 無 JavaScript 時仍可閱讀核心內容。
- print stylesheet；列印不截斷表格與 evidence，控制避免 orphan heading。

### 13.3 Renderer 硬性規則

- HTML 完全由本機 deterministic Renderer 從 validated final JSON 產生。
- ChatGPT 不執行第二次 HTML 生成請求。
- CSS／JavaScript 全部內嵌；不使用 CDN、外部 font、analytics 或網路資源。
- 所有分析內容必須能追溯回 final JSON；JSON 不存在的理由顯示 `Unavailable`，不得補造。
- 所有動態文字做 HTML escaping／safe serialization，防止 stored XSS。
- Report 可離線開啟。
- 同一 final JSON + renderer version 應產生內容等價的 HTML；若 generated time 等允許欄位不同，必須在測試正規化。
- 報告不得包含 credential、Authorization Header、`.env`、ChatGPT account secret、AI Nexus Token 或未選取資料。

### 13.4 JSON／HTML 原子配對

正式產物流程：

1. 寫 run-scoped temporary JSON。
2. reopen 並通過 schema／hash／count validation。
3. 由 validated JSON 產生 temporary HTML。
4. 以 HTML parser／headless browser 驗證章節、record count、filters、escaping 與無外部請求。
5. atomic rename／publish JSON 與 HTML。
6. 以同一 `analysisRunId` 寫入 SQLite transaction。
7. 任一步驟失敗，不得留下半套正式 artifact，也不得標記 Completed。

---

## 十四、AI Nexus 與 Offline Rule 相容

### 14.1 AI Nexus

本版不強制 AI Nexus 單次請求，但必須：

- 使用同一 v0.3.11 record/result schema。
- 使用同一 Catalog exact lookup 與禁止 Group-first fallback。
- 使用同一 Classification／Review separation。
- 使用同一 Golden HTML Renderer。
- 完整記錄真實 batch、request、retry、record 與 token usage。
- 不得以 ChatGPT 的 `1 Thread／1 Turn` 驗收條件錯誤阻擋 AI Nexus。
- 若 AI Nexus 仍需 batching，每個 batch 的 record set、rules transmission 與 conservation 必須透明可稽核。
- 不得無理由重寫既有 endpoint、auth、timeout 或 codec。

### 14.2 Offline Rule

- 保留 deterministic、zero-token 行為。
- 可輸出或轉換成 v0.3.11 envelope。
- 使用同一 Golden HTML Renderer。
- 不因本版 ChatGPT 改動而回歸。

---

## 十五、UI 與進度調整

不改變 AI Analysis 三個子分頁名稱與順序。本版只調整與正式 run/report 直接相關內容。

分析進度顯示真實 stage：

1. 驗證 Pending JSON。
2. 驗證三份分析依據。
3. 建立完整 Compact Payload。
4. 容量／Token preflight。
5. 建立 ChatGPT Thread。
6. 傳送一次完整分析 Turn。
7. 等待／接收回覆。
8. 驗證全部 records。
9. 合併原始 Evidence。
10. 產生 JSON。
11. 產生 HTML。
12. 寫入 SQLite。
13. Completed。

執行中至少顯示：

```text
Requests: 1
Threads:  1
Turns:    1
Batches:  1
Records:  <validated or completed> / <total>
Thread ID
Turn ID
Input / Cached Input / Output / Total Tokens
Elapsed Time
Current Stage
Planned JSON Full Path
Planned HTML Full Path
```

注意：模型在單一 response 完成前，App 不得假裝逐筆完成 record。可顯示 response bytes／stream activity；record progress 只有在 response parse 後才更新為 validated count。

完成後顯示：

- final JSON／HTML／provider response 完整路徑、bytes、SHA-256。
- request／thread／turn／retry counts。
- token usage 與 duration。
- classification／review summary。
- Skill／Group distribution diagnostics。
- `開啟所在資料夾`、`複製完整路徑`、`重新驗證`。

---

## 十六、SQLite 與 completed-only

- Jira 原始 SQLite 保持唯讀。
- AI Analysis 使用既有獨立 SQLite。
- failed／cancelled／partial／schema-invalid／count-mismatch／HTML-invalid run 不得寫入正式分析結果表。
- final JSON、HTML 與 DB records 共用同一 `analysisRunId`、source hash、rules snapshot hash 與 counts。
- review audit 不可改寫原始 Provider response 或 Evidence。
- v0.3.11 migration 必須具 version 與安全 rollback／backup 策略，並測試舊 DB 開啟。
- 不將 credential、AI Nexus Token、Authorization Header 或完整 confidential prompt 寫入 DB。

---

## 十七、舊版結果相容性

v0.3.10 已產生的 per-record analyzed JSON：

- 仍可匯入與檢視。
- 標示 `legacy_per_record_analysis`。
- 不覆寫、不假造缺少欄位。
- 缺少 `matchedRuleIds`、Negative Checks、raw provider response 等欄位時顯示 `Legacy result did not provide this field／舊版未提供`。
- 可用新 Renderer 產生「Legacy Compatibility HTML」，但必須顯示 legacy warning。
- 不得把舊版 117 requests 偽裝成 single-run。
- 若要取得完整 v0.3.11 結果，必須重新分析。

手動 POC JSON：

- 只作開發期 comparison／Golden data-shape reference。
- 不自動匯入正式 SQLite。
- 不視為已人工確認的產品結果。

---

## 十八、錯誤碼

新增或確認至少包含：

```text
ANALYSIS_INPUT_CONTEXT_TOO_LARGE
ANALYSIS_INPUT_TOKEN_ESTIMATE_UNAVAILABLE
ANALYSIS_SINGLE_RUN_CONTRACT_VIOLATION
ANALYSIS_UNEXPECTED_ADDITIONAL_THREAD
ANALYSIS_UNEXPECTED_ADDITIONAL_TURN
ANALYSIS_RESPONSE_TRUNCATED
ANALYSIS_RESPONSE_PARSE_FAILED
ANALYSIS_RESPONSE_SCHEMA_INVALID
ANALYSIS_RESPONSE_COUNT_MISMATCH
ANALYSIS_RESPONSE_IDENTITY_MISMATCH
ANALYSIS_RESPONSE_INVALID_SKILL_ID
ANALYSIS_RESPONSE_EVIDENCE_MISMATCH
ANALYSIS_PROVIDER_RESPONSE_WRITE_FAILED
ANALYSIS_HTML_RENDER_FAILED
ANALYSIS_HTML_VALIDATION_FAILED
ANALYSIS_ARTIFACT_PAIR_COMMIT_FAILED
```

沿用既有 rules、dataset、provider、cancel、timeout、DB error codes。

每個錯誤 UI 至少顯示：

- stable code。
- 可讀中英訊息。
- 發生 stage。
- 是否可手動重試。
- 建議下一步。
- sanitized detail。
- failed staging／manifest 完整路徑。

不得顯示 `undefined: undefined`、`[object Object]`、secret 或未處理 stack。

---

## 十九、測試要求

先盤點 repository 既有測試命令與命名慣例，再新增 v0.3.11 專屬 tests。不得只修改舊 assertion 使其通過。

### 19.1 Unit tests

至少包含：

- compact payload deterministic build／hash。
- 只包含允許欄位，不含 DB path／schema／rowid／`.env`。
- 117 synthetic fixture → 117 compact events。
- rules／Catalog 在 payload 中只出現一次。
- capacity preflight success／too large／metadata unavailable。
- exact Skill ID lookup。
- missing／invalid Skill ID 不 fallback。
- Group-only response 不 fallback。
- Skill Name fuzzy match 不 fallback。
- `_001` 是真實模型選擇時可保留，但 App 不自動產生。
- Classification／Review separation。
- EXCLUDED／UNKNOWN 不可帶 candidates。
- matchedRuleIds／positive／negative evidence validation。
- duplicate／missing／out-of-order stable IDs。
- response truncated／malformed／unknown fields。
- raw visible response gzip round-trip／hash／sanitize。
- HTML escaping／stored XSS fixture。
- deterministic report normalization。
- legacy v0.3.10 result mapping。
- JSON／HTML artifact pair atomicity。
- token／duration aggregation。

### 19.2 ChatGPT App Server mock integration

Fake App Server 必須能證明：

- exactly one `thread/start`。
- exactly one `turn/start`。
- one payload contains all 117 events。
- Manifest／Catalog／Common Rules 各一次。
- no second repair turn。
- no app-level retry。
- token notifications 正確 aggregate。
- streamed final response 可組回完整 JSON。
- `turn/completed` 後才進 validation。
- interrupt／cancel 不產生 final artifacts。
- crash／disconnect／context exceeded／schema invalid 進 failed staging。
- late event 不污染 next run。

測試必須解析實際 outgoing payload；不能只 assert UI 顯示 `Requests: 1`。

### 19.3 117-record conservation tests

使用程式產生、不含公司資料的 synthetic 117-record fixture：

- 117 input → 117 output。
- shuffled output 可按 stable identity 合併，但 duplicate／missing 必須失敗。
- MATCHED／EXCLUDED／UNKNOWN 守恆。
- invalid Skill ID 使整個 run failed。
- completed run request/thread/turn/batch counts 全為 1。

使用者提供的真實 Pending JSON 可做 local manual／integration evidence，但不得複製進 tracked fixture 或 commit。

### 19.4 Golden HTML tests

至少包含：

- Golden inventory／gap matrix 有文件化。
- semantic sections snapshot。
- summary count、Skill ranking、status filters、search、expand/collapse。
- 117 records 在 DOM/data model 中守恆；可採 lazy render，但搜尋／列印仍完整。
- MATCHED／EXCLUDED／UNKNOWN／NEEDS_REVIEW 視圖。
- Negative Checks、Evidence、reason、near-skill rejection。
- long Windows path、中文、空白、Unicode。
- HTML escaping 與無外部 network request。
- headless browser open 無 console error。
- print CSS screenshot／PDF preview 不截斷主要章節。
- legacy compatibility warning。
- JSON 缺欄時顯示 Unavailable，不補造內容。

視覺驗收以 Golden HTML 的資訊層級、結構與閱讀體驗為主；Build Version、Run ID、路徑、時間、真實統計等動態值允許不同。

### 19.5 AI Nexus／Offline regression

- AI Nexus 舊 batch pipeline 仍可執行。
- AI Nexus 可輸出 v0.3.11 schema 或經明確 adapter 轉換。
- AI Nexus report 使用同 Renderer。
- Offline Rule deterministic、Token=0。
- 兩者都不得出現 Group-first fallback。

### 19.6 Existing regression

至少執行：

- `npm.cmd run typecheck`。
- repository 既有 unit／integration tests。
- v0.3.10 regression tests。
- ChatGPT account／model／diagnostics contract tests。
- AI Nexus tests。
- Offline Rule tests。
- SQLite／export／ledger tests。
- 新增的 `test:v0.3.11` 與 `test:v0.3.11:integration`（依 repo 慣例可調整）。
- `git diff --check`。

不得跳過失敗測試。不得刪除 assertion 掩蓋 regressions。

---

## 二十、真實 117 筆驗證與效能目標

### 20.1 硬性驗收

對使用者提供的基準 Pending JSON，若執行環境已有可用 ChatGPT 登入且 operator data files 可供本次驗證，執行一次真實 117-record run，必須：

- Thread Count = 1。
- Turn Count = 1。
- App-issued main request count = 1。
- Rules transmission = 1 set。
- Payload records = 117。
- Result records = 117。
- App-level retry = 0。
- 不得 fallback 成分批／逐筆。
- final JSON／HTML／provider response Hash 可驗證。
- 只有 validated Completed 才寫正式 SQLite。

若真實 ChatGPT 登入需要人工操作，可請使用者接手。若執行環境無法完成人工登入：

- 不得偽造真實 run。
- 所有 mock／automated／build／package 驗證仍需完成。
- 可在真實帳號驗證 pending 的情況下 Commit＋Push。
- 最終狀態標記為：

```text
Partial — single-run implementation, automated tests, build, packaging and push completed; real 117-record ChatGPT validation pending.
```

### 20.2 效能目標

| 指標 | v0.3.10 基準 | v0.3.11 目標 |
|---|---:|---:|
| App-issued analysis requests | 117 | **1** |
| Rules transmission | 117 次跡象 | **1 set** |
| Input Tokens | 1,390,681 | 目標 `< 250,000` |
| Total Tokens | 1,415,735 | 目標至少降低 75% |
| Duration | 21:16.929 | 目標 `< 8:00` |

Token 與時間受 model、cache、network、output length 與服務狀態影響，因此：

- Request／Thread／Turn／rules transmission／record conservation 是硬性條件。
- `<250,000 Tokens`、降低 75%、8 分鐘內是效能目標與 regression warning，不應在架構契約正確但服務波動時單獨造成 Build Fail。
- 若未達目標，最終回報必須列出實測值與原因，不得省略。

---

## 二十一、Build、Dist 與 Packaged Smoke

必要 tests 通過後：

1. Production build。
2. Windows dist：Installer、Portable、win-unpacked。
3. 驗證版本 `0.3.11` 與 Build Time。
4. 驗證 bundled Codex runtime，不依賴全域 Codex CLI。
5. 驗證 SQLite 不需使用者另行安裝。
6. 驗證 Portable 不回退 `%LOCALAPPDATA%` 產生未授權 AI artifacts。
7. 執行有限時間、可重現的 packaged smoke；不要執行長時間 smoke。

Packaged smoke 至少核對：

- App 啟動無白畫面。
- AI Analysis 三子分頁正常。
- Pending Dataset／rules 可載入並顯示完整路徑。
- ChatGPT single-run preflight UI 正確。
- oversize fixture 顯示 `ANALYSIS_INPUT_CONTEXT_TOO_LARGE` 且不建立 Thread。
- mock／fixture run 顯示 Requests／Threads／Turns／Batches = 1。
- 結果頁可載入 v0.3.11 JSON。
- Golden HTML 可產生、離線開啟、搜尋／篩選／展開。
- legacy v0.3.10 JSON 可讀並顯示 warning。
- Installer／Portable package 內無真實使用者資料。

保存 app-only screenshots／artifacts：

- single-run preflight。
- running stage 與 1 request evidence。
- Completed summary。
- Golden HTML summary。
- Golden HTML event detail／Negative Checks。
- oversize failure。
- legacy warning。

這些 evidence 不得包含未遮罩 confidential content；通常不 Commit release binaries 或真實資料 screenshots。

---

## 二十二、Package Content 與秘密稽核

對 Installer、Portable、win-unpacked／app.asar 執行：

- bundled Codex runtime 存在且版本符合 lock。
- 無 `.env`。
- 無 ChatGPT auth cache／`auth.json`。
- 無 AI Nexus Token／Authorization Header。
- 無 Jira Pending／Analyzed JSON、SQLite、attachments。
- 無三份真實公司規則。
- 無 Provider raw response。
- 無 Golden HTML 真實資料檔。
- 無 debug／failed staging／screenshots／test output。
- `.env.version` 只有安全預設值與中英註解。
- 無 `api.openai.com` active path。
- 無硬編碼使用者 Windows path。
- HTML Renderer 不包含 CDN／analytics／external asset。

---

## 二十三、`.env` 與秘密管理

- 沿用 v0.3.10 實際 `ENV_FORMAT_VERSION`；本版若沒有不相容 env schema，不得只因版本升級提高 ENV format。
- Git 只管理 `.env.version`。
- `.env.version` 維持安全預設值與中英註解。
- `.env` 永不加入 Git。
- AI Nexus Token 仍由 `.env`／main process 管理。
- ChatGPT credential 不進 `.env`。
- Renderer、IPC、diagnostics、logs、report、JSON 與 SQLite 不得出現 secret 明文。
- 若本版不需新增 env 欄位，不得為製造 diff 修改 `.env.version`。

---

## 二十四、執行時間帳與 Token 帳

建立：

```text
reports/JiraActivityAnalyzer_v0.3.11_execution_time_ledger.json
```

至少包含：

- schemaVersion／targetVersion／theme。
- taskStartAt／taskEndAt／wallClockSeconds／timezone。
- machine／OS／Node／npm／Electron／electron-builder／Codex runtime version。
- repository full path、base branch／commit、working branch、final commits。
- 每階段 start／end／duration／command／exitCode／result。
- typecheck、各 tests、build、dist、smoke、package audit、git checks、push。
- Installer／Portable／win-unpacked／app.asar 完整絕對路徑、bytes、SHA-256。
- warnings、retries、known limitations。

另建立或沿用 repository 的 AI analysis request/token ledger，至少保存：

```text
reports/JiraActivityAnalyzer_v0.3.11_ai_analysis_token_ledger.json
```

內容區分：

1. **Codex 實作工作階段 Token**：平台可取得時記錄 input／cached／output／total；不可取得填 `null + unavailableReason`，不得估算。
2. **ChatGPT App 真實／mock run**：記錄 run、thread、turn、app request、provider trace、internal retry、records、rules transmissions、input／cached／output／reasoning／total、duration。
3. **AI Nexus run**：記錄真實 batch／request／retry／token；未執行填明確狀態。
4. **Offline Rule**：Token 必須為 0。

真實 Provider response、Prompt content、規則內容與 confidential Evidence 不寫入 tracked ledger；只記 metadata、counts、Hash 與安全路徑引用。

所有時間使用實測值，不得手填猜測。

---

## 二十五、版本、文件與 Prompt 保存

更新 repository 既有正式版本來源：

- `VERSION`。
- `package.json`／lockfile（依 repo 慣例）。
- Build Version／Build Time 注入來源。
- `CHANGELOG.md`。
- `README.md`。
- `PROJECT.md`。
- 必要 schema／migration／architecture 文件。

新增正式實作文件，例如：

```text
docs/v0.3.11-ai-analysis-single-run-golden-report.md
```

至少說明：

- v0.3.10 問題基線。
- 四項採納決策。
- compact payload contract。
- capacity preflight。
- one Run／Thread／Turn contract。
- output schema 與禁止 fallback。
- raw visible response staging。
- Golden HTML inventory／gap matrix／renderer。
- AI Nexus／Offline compatibility。
- SQLite／atomic artifacts。
- tests、Build、Dist、smoke、package audit。
- real 117-record validation 狀態。
- known limitations。

把本 Prompt 逐字保存至：

```text
prompts/JiraActivityAnalyzer_v0.3.11_ai_analysis_single_run_golden_html_report_prompt.md
```

不得只保存摘要。

---

## 二十六、Git、Commit 與 Push

### 26.1 Commit 前

- 顯示 `git status --short`。
- 顯示本版 tracked file 清單。
- `git diff --check`。
- 執行 secret／path／package audit。
- 確認 staging 無 `.env`、Token、auth cache、Jira data、rules、Provider response、SQLite、release binaries、screenshots、debug／staging、Golden HTML 真實資料或使用者無關檔案。
- 禁止 `git add .`、`git add -A`；只用明確檔案清單。

### 26.2 Commit 條件

只有下列條件成立才可 Commit：

- typecheck／必要 unit／integration／UI／schema／report／regression tests 通過。
- production build／dist／limited packaged smoke／package audit 通過。
- v0.3.11 docs／Prompt／ledgers 完成。
- 沒有未解決 blocker 或資料安全問題。

真實 ChatGPT account／117-record validation pending 是唯一可接受的 Partial 例外；必須明確標示，但不阻擋已完成 automated verification、Build、Dist 後的 Commit＋Push。

建議精準 Commit：

1. `feat: implement v0.3.11 single-run analysis and golden report`
2. `docs: add v0.3.11 prompt, verification evidence and ledgers`

可依 repository 慣例調整，但不得混入無關使用者修改。

### 26.3 Push

- Push 到 `origin/feat/v0.3.11-ai-analysis-single-run-golden-report`。
- 設定 upstream。
- Push 後核對 local HEAD、remote HEAD、ahead／behind = `0 / 0`。
- 不 force push。
- 不建立 Tag／Release。

若任何必要 automated gate 未通過，不得 Commit／Push 一個宣稱完成的版本；保留工作樹並回報失敗 command、error、完整相關路徑與下一步。

---

## 二十七、正式驗收條件

只有全部必要項目成立，才能標示 `Completed`：

### Single-run correctness

- ChatGPT 每個 Analysis Run 恰好一個 Thread、一個 Turn、一次 App-issued main payload。
- 所有 selected events 與三份規則在單一 payload 各出現正確次數。
- 無自動 batching／per-record／repair／App retry fallback。
- 容量不足 fail closed。

### Result correctness

- 117 input／117 output identity 守恆。
- Skill ID exact Catalog lookup。
- 無 Group-first／`_001` fallback。
- MATCHED／EXCLUDED／UNKNOWN 與 review workflow 分離。
- 每筆有可稽核 Positive／Negative／Rule evidence。
- raw visible response、usage 與 validation evidence 真實保存。

### Golden HTML

- App 本機固定 Renderer 產生。
- 章節、統計、事件明細、Evidence、Negative Checks、filters、expand/collapse、print experience 貼近 Golden Reference。
- 全部內容來自 final JSON，不補造。
- self-contained、offline、no CDN、safe escaping。
- JSON／HTML／SQLite atomic pairing。

### Compatibility

- v0.3.10 legacy JSON 可讀並明確標示 legacy。
- AI Nexus 共用新 schema／renderer，不被錯誤要求 single turn。
- Offline Rule 不回歸。

### Delivery

- tests、typecheck、build、Installer、Portable、win-unpacked 成功。
- limited packaged smoke 與 package audit 通過。
- execution／token ledgers 完整。
- Prompt／docs 已保存。
- Commit／Push 成功，ahead／behind = 0／0。

若唯一未完成是真實 ChatGPT 登入／117-record provider validation，狀態為 Partial，不得宣稱 Completed。

---

## 二十八、Codex 最終回報格式

最終回報使用繁體中文，依序提供：

1. 完成狀態：Completed／Partial／Blocked，附精確原因。
2. 版本與主題。
3. repository 完整絕對路徑。
4. 七類輸入附件的實際完整路徑、bytes、SHA-256。
5. base branch／commit、working branch、final commits、remote。
6. v0.3.10 problem reproduction evidence。
7. compact payload、capacity preflight 與 single-run 實作摘要。
8. Thread／Turn／request／rules transmission／record conservation 實測。
9. Skill fallback 移除與 distribution diagnostics。
10. JSON schema、Provider response、HTML、SQLite atomic validation。
11. Golden HTML gap matrix 與視覺／互動驗證。
12. AI Nexus／Offline／legacy compatibility。
13. 真實 117-record run：是否執行；若執行列 model、counts、tokens、duration、artifact paths；不得列 confidential content。
14. 每個 test command、結果與實測秒數。
15. Build／Dist／smoke／audit command、結果與實測秒數。
16. Installer／Portable／win-unpacked／app.asar 完整路徑、bytes、SHA-256。
17. screenshots／test artifacts 完整路徑。
18. execution／token ledger 完整路徑。
19. Git status、Push、upstream、ahead／behind。
20. 完整保留且未提交的使用者既有檔案／修改。
21. warnings、limitations、manual verification items。

所有檔案一律提供完整絕對路徑，不只提供檔名或相對路徑。

---

## 二十九、建議執行順序

1. 讀 repo instructions、Git、版本與 v0.3.10 Prompt。
2. Resolve／Hash／閱讀全部附件。
3. 渲染軟體版 HTML 與 Golden HTML，建立 gap matrix。
4. 以 v0.3.10 JSON 重現 117 requests、Token、progress 與 `_001` 分布。
5. 盤點 orchestration、payload、parser、Catalog mapping、renderer、SQLite code path。
6. 先新增 failing contract／mock／schema／Golden HTML tests。
7. 實作 deterministic compact payload 與 capacity preflight。
8. 實作 single Thread／single Turn orchestration、usage、cancel、failed staging。
9. 實作 strict schema、exact lookup、count conservation、禁止 fallback。
10. 實作 Provider response gzip／Hash。
11. 升級 analyzed JSON 與 legacy adapter。
12. 實作 Golden HTML local Renderer 與 headless validation。
13. 串接 atomic JSON／HTML／SQLite。
14. 補 AI Nexus／Offline compatibility。
15. 執行 unit／integration／UI／report／regression，修至通過。
16. 若具可用登入，執行一次真實 117-record run；否則記錄 Partial pending。
17. 更新版本、docs、Prompt、CHANGELOG、README、PROJECT。
18. Production Build、Windows Dist、limited packaged smoke、screenshots、package audit。
19. 完成 execution／token ledgers。
20. `git diff --check`、精準 staging、Commit、Push。
21. 核對 remote HEAD 與 ahead／behind，依指定格式回報。

---

## 三十、官方實作依據

ChatGPT Provider 必須依執行當下官方 OpenAI Codex App Server 文件與 bundled runtime generated schema：

- `https://learn.chatgpt.com/docs/app-server`
- `https://developers.openai.com/codex/app-server`

官方契約重點：

- Thread 是 conversation，包含 Turns。
- Turn 是一次 user request 與其完整 agent work。
- `thread/start` 建立 Thread。
- `turn/start` 在指定 Thread 開始 Turn。
- `turn/completed` 提供 terminal status。
- `thread/tokenUsage/updated` 提供 active thread usage updates。
- schema 必須由實際 Codex runtime 產生並對齊版本。

不得用第三方 reverse engineering、ChatGPT Web API、browser cookies 或自行猜測的 protocol 取代官方流程。

---

## 附錄 A：交給 Codex 前的附件與資訊清單

執行此 Prompt 時，操作者應同時提供：

### 必要檔案

1. 本 Prompt：
   `JiraActivityAnalyzer_v0.3.11_AI_Analysis_Single_Run_Golden_HTML_Report_Codex_Prompt.md`
2. 上一版 Prompt：
   `JiraActivityAnalyzer_v0.3.10_AI_Analysis_UI_Reconstruction_Codex_Prompt.md`
3. 真實 Pending JSON。
4. v0.3.10 軟體版 analyzed JSON。
5. v0.3.10 軟體版 HTML。
6. 手動 ChatGPT POC analyzed JSON。
7. 手動 ChatGPT Golden HTML。
8. `Skill_Analysis_Rule_Set_Manifest.md`。
9. `Skill_Catalog_v0.3.0.md`。
10. `Skill_Classification_Common_Rules_v1.1.0.md`。

### 必要資訊／環境

- `JiraActivityAnalyzer` repository 的完整路徑。
- Git remote 與允許 Push 的 branch；若與預定 branch 不同，執行前需說明。
- v0.3.10 最新完成回報或至少 base branch／HEAD commit。
- Node／npm／Windows Build／Dist 所需環境可用。
- repository 既有 `.env` 由操作者自行保留；不要把 `.env` 附在 Prompt 或聊天中。
- 若要完成真實 ChatGPT 117-record validation：執行環境必須有可用 ChatGPT 登入狀態、可用 model／額度，必要時由操作者手動接手登入。
- 若公司資料政策不允許再次送出真實 Pending／Rules，需在開始前明確告知 Codex 只做 mock／local verification；此時最終狀態不得宣稱真實 117-record Provider validation 完成。

### 不要提供／不要 Commit

- `.env`。
- ChatGPT credential／auth cache／Cookie。
- AI Nexus 明文 Token。
- Jira Token。
- 任何 Authorization Header。
- 真實 SQLite DB，除非本次另有明確、必要且安全的 local validation 授權。
- 不相關的 debug bundle、release binary 或其他專案資料。
