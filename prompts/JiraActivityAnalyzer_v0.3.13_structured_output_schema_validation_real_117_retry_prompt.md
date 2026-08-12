# JiraActivityAnalyzer v0.3.13 正式完整 Codex Prompt

你現在要在既有 `JiraActivityAnalyzer` repository 上，完整實作、驗證、建置、封裝、記錄、Commit、Tag 與 Push：

> **v0.3.13 — Structured Output Schema Validation & Real 117 Retry**

本版是 v0.3.12 真實 Provider 驗證後確認的集中修復版。核心任務是修正 ChatGPT Provider 的 Strict Structured Output Schema、在本機阻止無效 Schema 送出、真正完成一次正式 117 筆單一請求驗證，並修完仍存在的全域錯誤日誌風暴。

不要重新設計技能分類規則，不要重新縮減 117 筆資料，不要改成分批／逐筆分析，也不要用 fixture、mock、手動版結果或預先產生的 JSON 冒充真實 Provider 成功。

---

## 一、執行原則

1. 先完整讀取並遵守 repository 內的 `AGENTS.md`、`AI_RULES.md`、`PROJECT.md`、`README.md`、`CHANGELOG.md`、`VERSION`、相關 prompts、tests、reports 與 Git 狀態。
2. 先從 v0.3.12 的實際原始碼、正式報告、Debug Folder、Failed staging 與測試定位根因；不得只依本 Prompt 猜測檔名、IPC、Schema builder 或 Provider API。
3. 保留所有使用者既有修改、未追蹤資料與不屬於本版的變更；不得 `git reset --hard`、`git clean`、force push 或覆寫不明檔案。
4. 除非發生本 Prompt 定義的真正 blocker，否則一路完成實作、測試、Build、Dist、正式 Portable 驗證、真實 117 筆、報告、時間帳、Token 帳、Commit、Tag、Push 與 remote 核對。
5. 不得偽造 Provider request、Thread、Turn、Token usage、117 筆輸出、Schema 驗證、JSON、Golden HTML、SQLite、測試、封裝、Git 或時間結果。
6. 所有秘密資料只可由既有 `.env` 或正式登入流程載入。不得將 `.env`、ChatGPT Cookie、登入狀態、Jira Token、AI Nexus Token、Authorization Header、`auth.json` 或其他 credential 寫入 Git、Debug Folder、報告或正式輸出。
7. 不執行長時間 smoke test。只執行本版必要 targeted tests、必要 regressions、Build、Dist、有限 packaged renderer 啟動驗證，以及一次正式 117 筆真實分析。
8. 真實 Provider 若回傳 incomplete、refusal、外部服務錯誤或其他非程式缺陷，版本可為 `Partial`；但程式修正、測試、Build、Dist、帳本、Commit 與 Push仍須在安全可行時完成。
9. 若程式實作、Schema preflight、必要測試、Build 或 Dist 失敗，不得建立代表成功的 tag，不得宣稱 Completed。
10. 所有命令、測試、Build、Dist、真實 Provider 與 Git 階段都必須記錄開始時間、結束時間、duration、結果與錯誤。

---

## 二、版本、主題與分支

Target Version：

```text
v0.3.13
```

Theme：

```text
Structured Output Schema Validation & Real 117 Retry
```

建議工作分支：

```text
feat/v0.3.13-structured-output-schema-validation-real-117-retry
```

正式 tag：

```text
v0.3.13
```

要求：

- 從包含完整 v0.3.12 的最新安全 remote commit 開始。
- 不覆寫或移動既有 annotated tag `v0.3.12`。
- 不建立 GitHub Release，除非 repository 既有規則明確要求且已具權限。
- 不 force push。
- 不把 release binaries、真實公司資料、Provider response、Debug Folder、Failed staging 或秘密加入 Git。

---

## 三、v0.3.12 真實失敗基線

實作前必須從實際證據確認以下內容，並在最終報告列出實際來源與 Hash：

### 3.1 真正根因

v0.3.12 已完成：

- ChatGPT authentication；
- Provider diagnostics；
- GPT-5.6-Sol model availability；
- 279 Skills／279 Unique／0 Duplicate；
- 117 Events／28 Issues／2 Projects；
- Prompt／Payload／Capacity calculation；
- Capacity warn-only 與使用者確認；
- Thread 建立。

但 Provider 在啟動 Turn 時以 HTTP 400 拒絕 App 傳入的 Strict Structured Output JSON Schema：

```text
invalid_request_error
code: invalid_json_schema
location: records[].analyses[]
Extra required key 'scoreComponents' supplied.
```

實際矛盾結構為：

```json
{
  "type": "object",
  "properties": {
    "skillId": {},
    "score": {}
  },
  "required": [
    "skillId",
    "score",
    "scoreComponents"
  ],
  "additionalProperties": false
}
```

同一 object 的 `required` 包含 `scoreComponents`，但 `properties` 沒有該欄位，因此 Schema 無效。Provider 在模型推理開始前拒絕，並非模型分析後回覆錯誤。

### 3.2 已知真實 Run 證據

至少核對下列 v0.3.12 Run；若實際附件／報告另有更精確資料，以原始證據為準：

```text
analysis_8b482674-e751-4cb8-a835-c4044d27c641
analysis_ed644204-f870-4323-9a92-5e9e572a225b
```

兩次均為人工啟動的新 Run，不是 App 自動 retry；每個 Run 的觀察值為：

```text
App-issued request: 1
Thread created:      1
Turn accepted:       0
Retry:               0
Output:              0 / 117
Provider usage:      unavailable / null
Formal JSON:         not written
Golden HTML:         not written
SQLite:              not written
```

第二個 Run 已知階段：

```text
starting_turn → failed
duration ≈ 7,762 ms
```

### 3.3 容量功能已通過

v0.3.12 真實容量快照：

```text
Final prompt bytes          407,037
Estimated input tokens      135,679
Visible output reserve       74,880
Safety margin                10,855
Estimated required total    221,414
Provider capacity           Unavailable
```

Capacity unavailable 時已顯示完整計算，且使用者確認後沒有被硬擋。本版不得把容量策略改回 hard block。

### 3.4 仍未修完的日誌問題

AI Analysis 專屬 `event-log.jsonl` 只保留一筆主要錯誤，但全域 `debug-log.txt` 仍在約 1.3 秒內重複寫入相同錯誤約 160 次。

因此 v0.3.12 的 dedup 只保護部分 logger；v0.3.13 必須修正全域 logging／renderer effect／subscription loop 的真正來源。

### 3.5 錯誤語意不準確

v0.3.12 使用：

```text
AI_RESPONSE_INVALID
Not written — result validation failed
```

但實際沒有模型 response，正確語意應是：

```text
AI_OUTPUT_SCHEMA_INVALID
Not written — Provider rejected output schema before turn start
```

若本機 preflight 已攔截，則應顯示：

```text
AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED
Not written — local output schema validation failed before provider request
```

---

## 四、本版核心目標

1. 修正 `records[].analyses[].scoreComponents` 的 Strict Structured Output Schema。
2. 消除 wire schema 中不受 Strict Structured Outputs 支援的任意 dictionary／`Record<string, number>` 表達。
3. 建立遞迴、本機、deterministic、可測試的 Output Schema preflight validator。
4. Schema preflight 必須在建立 Thread 之前完成；無效 Schema 必須 `0 request / 0 thread / 0 turn`。
5. 保證「驗證的 Schema」「Hash 的 Schema」「Debug 保存的 Schema」「實際送給 Provider 的 Schema」是同一份不可變 canonical bytes。
6. 保存完整 sanitized output schema、canonical schema bytes、SHA-256、validator version 與所有 validation findings。
7. 分開記錄 Turn 啟動嘗試、Provider 接受與 Turn terminal 狀態，避免 `1/1/0` 語意混亂。
8. 修正全域 `debug-log.txt` 仍重複寫入約 160 次的問題。
9. 修正 Schema preflight／Provider reject／response invalid／result validation／SQLite 未寫入的錯誤碼與 UI 文字。
10. 保留 v0.3.12 Capacity warn-only、單一 Payload／Thread／Turn、0 retry／repair／fallback、Failed staging 永久保留與 Completed-only gate。
11. 使用正式 v0.3.13 Release Portable，真正執行一次同一組 117 筆分析。
12. 成功時完成 117／117、正式 JSON、Golden HTML、SQLite、真實 Token、時間、Debug、比較報告與 Git 交付。

---

## 五、官方 Strict Structured Outputs 契約

實作時以 bundled Codex App Server 的實際 request schema、執行當下的官方 OpenAI 文件，以及 repository 的 Provider adapter 為準，不得從錯誤訊息只修單一欄位後就送出。

官方依據：

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

至少必須滿足：

1. 每個 `type: "object"` 都明確具備 `properties`。
2. 每個 object 都設定：

```json
"additionalProperties": false
```

3. 每個 object 的 `required` 必須與該層 `properties` 的 key 集合完全相等：

```text
set(required) = set(Object.keys(properties))
```

4. `required` 不得包含不存在於同層 `properties` 的 extra key。
5. `properties` 不得存在未列入 `required` 的欄位。
6. Optional 語意以 required + nullable 表示，例如：

```json
{
  "type": ["string", "null"]
}
```

7. 不得以缺少 required 欄位表示 optional。
8. 不得直接使用任意 key dictionary、`additionalProperties: {"type":"number"}`、`patternProperties` 或其他無法符合目前 Strict subset 的 map 結構。
9. 不得使用 Provider 不支援的 JSON Schema keyword。
10. 每個 `anyOf` branch 自身也必須是合法 Strict Schema。
11. Schema 的 nesting depth、object property count、enum count、property／definition／enum／const 字串總長度必須符合執行當下官方限制。
12. 不得用 `any`、型別斷言或移除 `strict: true` 來繞過問題。
13. 不得降級成一般 JSON mode 來掩蓋 Schema 缺陷。

若 bundled App Server 與公開 API request envelope 不同，應沿用 bundled App Server 正式 envelope；上述條件用於實際輸出的 JSON Schema 本體。

---

## 六、Canonical Output Contract

### 6.1 單一來源

建立單一 canonical output contract，並由它產生或約束：

- TypeScript runtime/domain types；
- Strict Provider wire schema；
- local parser；
- local semantic validator；
- analyzed JSON writer；
- Golden HTML reader；
- SQLite mapper；
- tests／fixtures。

不得再讓 TypeScript interface、手寫 JSON Schema、parser 與 downstream writer 各自維護不同欄位。

優先採用 repository 已有且可輸出相容 Strict Schema 的單一 typed schema source。若現有 Zod／schema generator 會對 `Record` 產生不相容結果，必須修改 wire contract或 generator，不得在產出後偷偷刪 property。

### 6.2 `scoreComponents` 正式 wire 格式

Provider wire contract 固定改為 Strict-safe array，不再直接傳輸任意 key object：

```ts
interface ScoreComponent {
  componentKey: string;
  score: number;
  explanation: string | null;
}

interface SkillCandidate {
  skillId: string;
  score: number;
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  scoreComponents: ScoreComponent[];
  positiveSignals: string[];
  positiveEvidenceRefs: string[];
  negativeChecks: NegativeCheck[];
  negativeEvidenceRefs: string[];
  rejectedNearSkills: RejectedNearSkill[];
  evidenceQuote: string;
}
```

`ScoreComponent` 的 Strict Schema 必須為固定欄位 object：

```json
{
  "type": "object",
  "properties": {
    "componentKey": { "type": "string" },
    "score": { "type": "number" },
    "explanation": { "type": ["string", "null"] }
  },
  "required": ["componentKey", "score", "explanation"],
  "additionalProperties": false
}
```

要求：

- `scoreComponents` 必須同時存在於 `properties` 與 `required`。
- 不得再輸出 `Record<string, number>` wire schema。
- `componentKey` 重複時 local semantic validation 失敗，不得後者覆蓋前者。
- 若 downstream legacy JSON／UI／SQLite 仍需要 map，僅可在 Provider response 完整驗證後由 local deterministic adapter 轉換。
- 轉換不得遺失 key、score 或 explanation；若 legacy 格式無 explanation 欄位，canonical analyzed JSON 必須保留 array，legacy view 只能做顯示 adapter。
- 不得降低 `scoreComponents` 原本的稽核語意。

### 6.3 Record 契約

保留 v0.3.11／v0.3.12 已確認語意：

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

實際 repository 可增加既有必要欄位，但不得降低上述語意與稽核資訊。

### 6.4 守恆與 semantic validation

Completed 必須滿足：

```text
inputRecordCount = outputRecordCount = 117
selectedStableIdSet = outputStableIdSet
每個 Stable ID 恰好一次
MATCHED + EXCLUDED + UNKNOWN = 117
MATCHED analyses.length >= 1
EXCLUDED analyses.length = 0
UNKNOWN analyses.length = 0
每個 Skill ID 存在於本次 Catalog snapshot
每個 evidence ref 屬於同一 input record
每個 scoreComponents.componentKey 在同一 candidate 中唯一
所有 required fields 存在且型別正確
沒有未定義欄位
```

任何一項失敗，整個 Run failed；不得局部寫正式資料、猜測 Skill、改成 `_001` 或建立 repair request。

---

## 七、本機 Output Schema Preflight Validator

### 7.1 執行位置

正式流程改為：

```text
load Pending + rules
→ validate source/rules
→ build one payload
→ build exact Provider output schema
→ canonicalize and freeze schema bytes
→ local strict schema preflight
→ capacity calculation / warning
→ create one ephemeral thread
→ start one turn using the exact validated schema bytes
```

Schema preflight 必須早於：

- capacity confirmation後的 dispatch；
- Provider request counter increment；
- `thread/start`；
- `turn/start`。

本機 Schema 無效時：

```text
requestCount = 0
threadCount = 0
turnStartAttemptCount = 0
acceptedTurnCount = 0
retryCount = 0
```

### 7.2 Validator 必查項目

對整棵 schema 遞迴檢查，至少包含：

1. Root 是合法 object schema。
2. 每個 object 的 `properties` 是明確 object。
3. 每個 object 的 `required` 無重複值。
4. 每個 object：`set(required) === set(properties keys)`。
5. 每個 object：`additionalProperties === false`。
6. 不存在任意 dictionary schema。
7. Optional 欄位使用 nullable，且欄位仍 required。
8. Array 具合法 `items`。
9. `anyOf` 每個 branch 都遞迴合法。
10. `$defs`／definitions 與 `$ref` 若使用，引用必須可解析且目標合法。
11. 不存在目前 Provider Strict subset 不支援的 keyword。
12. nesting depth、property total、enum total、字串總長度等限制。
13. schema name／format envelope 與 bundled App Server contract 一致。
14. final outgoing payload 只引用該份已驗證 schema，不得重新生成。

### 7.3 Finding 格式

每個 finding 至少包含：

```text
code
severity
jsonPointer
message
expected
actual
keyword
```

針對 v0.3.12 缺陷，必須產生可測試的精確 finding，例如：

```text
code        = SCHEMA_REQUIRED_KEY_NOT_IN_PROPERTIES
jsonPointer = /properties/records/items/properties/analyses/items/required
key         = scoreComponents
```

### 7.4 Canonical bytes 與 Hash

Schema 建立後必須：

1. 以 deterministic key ordering canonicalize。
2. 產生 UTF-8 bytes。
3. 計算 SHA-256。
4. freeze／immutable 保存。
5. local validator 驗證該 bytes 解析出的 schema。
6. Provider dispatch 使用同一 canonical schema object／bytes。
7. Debug、Run manifest、Token ledger 與 request evidence 使用同一 SHA-256。

不得：

- 驗證 A schema 後送出 B schema；
- validator 後再增刪欄位；
- Debug 保存重建後的近似 schema；
- 只保存 schema 摘要而無法核對實際內容。

### 7.5 Fail-fast UI

本機 preflight 失敗時顯示：

```text
Output schema validation failed before provider request.
No request, thread, or turn was created.
```

並顯示：

- error code；
- 第一個失敗 JSON Pointer；
- finding count；
- schema SHA-256；
- Debug／Failed staging 路徑。

不得顯示為 Provider response invalid、容量不足或 SQLite 故障。

---

## 八、Provider Dispatch 與計數語意

保留正式架構：

```text
117 records
→ 1 compact payload
→ 1 ephemeral thread
→ 1 turn
→ 1 main analysis request
→ 117 results
```

繼續禁止：

- 自動分批；
- per-record request；
- repair turn；
- App retry；
- timeout retry；
- parse／schema／incomplete retry；
- Group-first fallback；
- `_001` fallback；
- UI re-render／duplicate IPC 重送；
- 自動建立第二個 Thread 或 Turn。

### 8.1 計數欄位

Run manifest、UI、Debug 與 ledger 至少分開記錄：

```text
providerDispatchCount
threadStartAttemptCount
threadCreatedCount
turnStartAttemptCount
acceptedTurnCount
turnCompletedCount
retryCount
repairTurnCount
fallbackRequestCount
```

定義：

- `providerDispatchCount`：App 真正跨入 Provider orchestration boundary 的次數。
- `threadStartAttemptCount`：送出 `thread/start` 的次數。
- `threadCreatedCount`：收到有效 Thread ID 的次數。
- `turnStartAttemptCount`：送出 `turn/start` 的次數。
- `acceptedTurnCount`：Provider 接受並回報有效 `turn/started`／Turn ID 的次數。
- `turnCompletedCount`：收到 terminal completed 的 Turn 數。

成功 117 Run：

```text
providerDispatchCount   = 1
threadStartAttemptCount = 1
threadCreatedCount      = 1
turnStartAttemptCount   = 1
acceptedTurnCount       = 1
turnCompletedCount      = 1
retryCount              = 0
repairTurnCount         = 0
fallbackRequestCount    = 0
```

本機 Schema preflight failed：全部為 0。

若 Provider 仍在 `turn/start` request validation 拒絕：

```text
providerDispatchCount   = 1
threadCreatedCount      = 1
turnStartAttemptCount   = 1
acceptedTurnCount       = 0
turnCompletedCount      = 0
```

不得將 attempt 誤報為 accepted Turn，也不得把 accepted=0 誤寫成沒有發生任何 request。

### 8.2 一次性 guard

保留 v0.3.12 Electron main process 一次性 dispatch guard，並用 regression tests 證明：

- double click 不重送；
- re-render 不重送；
- duplicate IPC 回到同一 Run；
- route change／window reopen 不重送；
- timeout 不重送；
- late event 不污染新 Run。

---

## 九、容量策略不得回歸

保留 v0.3.12：

- Capacity available 且足夠：正常執行。
- Capacity unavailable：顯示完整計算與一次警告，確認後仍可執行。
- Estimated required total 超過已知 capacity：顯示完整計算與一次警告，確認後仍可執行。
- 取消警告：0 request／0 thread／0 turn。
- 不暗中使用固定 `200,000`。
- UI、manifest、Debug、Token ledger 共用同一 `CapacityCalculationSnapshot` 與 Hash。

本版不得修改 v0.3.12 的 estimator 公式，除非原始碼證明 Schema 修正必然改變實際 output schema bytes／reserve；若數字因此變動，必須在報告解釋差異。

Schema preflight 與容量警告順序應避免讓使用者先確認容量、後來才發現 App 自己的 Schema 無效。建議先完成 local Schema preflight，再顯示容量警告。

---

## 十、錯誤碼、Run 階段與 UI 文案

### 10.1 錯誤碼

至少區分：

```text
AI_OUTPUT_SCHEMA_BUILD_FAILED
AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED
AI_OUTPUT_SCHEMA_PROVIDER_REJECTED
AI_PROVIDER_RESPONSE_INCOMPLETE
AI_PROVIDER_RESPONSE_INVALID_JSON
AI_PROVIDER_RESPONSE_SCHEMA_MISMATCH
AI_RESULT_IDENTITY_VALIDATION_FAILED
AI_RESULT_CATALOG_VALIDATION_FAILED
AI_FORMAL_ARTIFACT_WRITE_FAILED
AI_SQLITE_TRANSACTION_FAILED
```

不得再將 Provider 啟動前的 Schema reject 統一寫成 `AI_RESPONSE_INVALID`。

### 10.2 Run stages

至少能區分：

```text
building_output_schema
validating_output_schema
output_schema_ready
preflighting_capacity
waiting_capacity_confirmation
starting_thread
starting_turn
waiting_response
receiving_response
validating_response_schema
validating_identity
validating_catalog
writing_formal_artifacts
committing_database
completed
failed
```

### 10.3 SQLite／正式保存狀態

UI 顯示精確原因：

```text
Not written — local output schema validation failed before provider request
Not written — Provider rejected output schema before turn start
Not written — Provider response incomplete
Not written — Provider response JSON invalid
Not written — response schema validation failed
Not written — result identity validation failed
Not written — Catalog validation failed
Not written — SQLite transaction failed
Written — 117 validated records
```

Provider readiness 與 Analysis Run readiness 必須繼續分開；`Provider Ready` 不表示 output schema、容量或 117 Run 已通過。

---

## 十一、全域錯誤日誌風暴修正

### 11.1 必須定位真正來源

不得只在 AI Analysis event logger 外再包一層 suppress。必須追蹤約 160 次寫入的 call stack／React effect／subscription／IPC bridge／state hydration 路徑，修正重複觸發來源。

特別檢查：

- effect dependency 是否因 object identity 每次 render 變動；
- terminal error hydration 是否反覆觸發 append log；
- renderer subscription 是否重複註冊未解除；
- IPC event 是否被 main 與 renderer 各寫一次以上；
- selector／derived state 是否在 render 中產生 side effect；
- Toast、頂部摘要、Run 卡片是否各自呼叫 persistent logger。

### 11.2 單一 persistent error event

dedup identity 至少為：

```text
analysisRunId + stage + errorCode + normalizedRootCauseHash
```

要求：

- AI `event-log.jsonl`：同一主要錯誤一筆。
- 全域 `debug-log.txt`：同一主要錯誤一筆，不得再出現 160 行。
- UI Toast：最多一次。
- 頂部摘要：一份短摘要。
- Run 卡片：一份完整內容。
- 重複 observation 只更新 `occurrenceCount`、`firstOccurredAt`、`lastOccurredAt` 或聚合 metadata，不新增相同 persistent log line。
- 不同 Run、stage、errorCode 或 root cause 不得錯誤合併。
- dedup 不得吞掉 Provider protocol state transitions。
- logger 不得反過來觸發 React state loop。

驗收 fixture 必須重播至少 160 次相同 error observation，結果：

```text
AI primary error records     = 1
Global primary error records = 1
Toast count                  = 1
occurrenceCount              = 160
Provider dispatch            = unchanged
```

---

## 十二、Failed Staging 與 Debug Folder

### 12.1 Failed staging

沿用：

```text
<APP_ROOT>/exports/ai-analysis/failed-staging/<analysisRunId>/
```

若 repository 已有等價 canonical 路徑，沿用既有路徑；不得建立第二套根目錄。

Failed staging：

- 永久保留至操作者手動刪除；
- 新 Run 使用新目錄；
- 不覆寫舊 Run；
- App restart／成功 Run／Debug Folder／版本升級不得刪除；
- 不得寫入 `%LOCALAPPDATA%` 或隨機 temp；
- 必須通過 APP_ROOT containment、path traversal 與 writable preflight。

### 12.2 Schema 專屬證據

每個 AI Run 至少保存：

```text
ai-analysis/
  run-manifest.json
  failed-run-manifest.json
  output-schema-sanitized.json
  output-schema-canonical.json
  output-schema-validation.json
  output-schema.sha256
  capacity-snapshot.json
  provider-diagnostics.json
  request-sanitized.json
  response-sanitized.json
  validation-result.json
  token-usage.json
  execution-time.json
  event-log.jsonl
  user-action-log.txt
```

`output-schema-validation.json` 至少包含：

```text
validatorName
validatorVersion
validatedAt
schemaName
schemaBytesUtf8
schemaSha256
isValid
findingCount
findings[]
maxObservedDepth
totalObjectProperties
totalEnumValues
totalSchemaStringLength
unsupportedKeywords[]
requiredPropertyMismatchCount
additionalPropertiesViolationCount
```

`request-sanitized.json` 必須能證明 outgoing request 引用的 schema SHA-256 與 preflight 相同，但不得包含 credential 或不必要公司機密。

### 12.3 秘密排除

所有 Debug／Failed staging／報告不得包含：

- `.env`；
- ChatGPT Cookie／authentication state；
- Jira Token；
- AI Nexus Token；
- Authorization Header；
- `auth.json`；
- 可重建登入狀態的資料。

---

## 十三、Provider 回覆與 Completed-only Gate

### 13.1 成功條件

只有全部成立才可 Completed：

1. local output schema preflight passed；
2. Provider 接受 Turn；
3. Provider terminal status = completed；
4. 可見回覆完整保存；
5. 真實 Token usage 保存；
6. JSON 完整解析；
7. response 符合 canonical schema；
8. 117 input／117 output；
9. Stable IDs 無 missing／duplicate／unexpected；
10. Skill IDs 全部 exact match Catalog；
11. Evidence／Negative Checks／scoreComponents semantic validation 通過；
12. provider visible response gzip／SHA-256 通過；
13. 正式 analyzed JSON 成功；
14. Golden HTML 成功；
15. SQLite 單一 transaction 成功並重新查驗；
16. Token／Execution ledgers 完整。

### 13.2 Incomplete／refusal／invalid／failed

以下任一情況整個 Run failed：

- Provider schema reject；
- refusal；
- incomplete／cancelled／failed；
- response 截斷；
- JSON parse failed；
- response schema mismatch；
- 不是 117／117；
- identity／Catalog／Evidence／semantic validation failed；
- formal artifact／SQLite transaction failed。

不得 repair、retry、fallback、局部 commit 或使用舊成功結果補齊。

失敗時：

```text
不得寫正式 analyzed JSON
不得產生正式 Golden HTML
不得寫正式 SQLite
不得覆寫上一份成功結果
不得刪除 failed staging
```

---

## 十四、正式 117 筆真實重試

### 14.1 測試資料

使用與 v0.3.11／v0.3.12 相同且已驗證的正式資料：

```text
117 Events
28 Issues
2 Projects
279 Skills
279 Unique Skill IDs
0 Duplicate Skill IDs
```

必須以實際檔案內容、Hash、Manifest 與 metadata 辨識，不得只靠可能帶 `(1)`／`(2)` suffix 的檔名。

不得將真實 Pending、公司規則、Provider response、Golden HTML 或 SQLite 加入 Git。

### 14.2 只用正式 Release Portable

不得使用：

- dev server；
- `portable-isolated`；
- packaged smoke 副本；
- 舊 v0.3.12 Portable；
- `win-unpacked` 代替正式 Portable；
- Build Version／Time／Commit 不符的 EXE。

流程：

1. 完成 source release commit。
2. 從乾淨且可追溯的 source commit 執行最終 `dist`。
3. 記錄正式 v0.3.13 Portable path、bytes、SHA-256、Build Version、Build Time、Source Commit。
4. 從正式 `release` 目錄啟動 Portable。
5. 在畫面核對 Version／Build Time／Commit／EXE SHA-256。
6. 由操作者在該正式 Portable 完成 ChatGPT 登入；不得猜測、複製或搬移 credential。
7. 執行 Provider diagnostics。
8. 載入正式三份規則與 117 Pending JSON。
9. 確認 local output schema preflight = passed，並記錄 Schema SHA-256。
10. 確認 Capacity calculation；若警告出現，只確認一次。
11. 按一次開始分析。
12. 等待同一 Turn terminal state；不得手動或自動再送第二次。
13. terminal 後立即產生 Debug Folder並保存錄影／證據。

### 14.3 成功驗收值

```text
Input / Output              117 / 117
Provider dispatch           1
Thread start attempt        1
Thread created              1
Turn start attempt          1
Turn accepted               1
Turn completed              1
Retry / Repair / Fallback   0 / 0 / 0
Provider terminal status    completed
Output schema preflight     passed
Response schema validation  passed
Identity validation         passed
Catalog validation          passed
Formal JSON                 written
Golden HTML                 written
SQLite                      committed and re-verified
```

### 14.4 若無登入或需人工操作

若執行環境沒有可用 authentication：

- 清楚請使用者只在正式 v0.3.13 Portable 內接手登入；
- 不得搬移其他 App／build 的 authentication state；
- 不得以 fixture 冒充真實執行；
- 其餘實作、測試、Build、Dist、報告、Commit 與 Push仍要完成；
- Overall Status 為 Partial，精確寫明真實 117 未執行。

若已登入且真實 Run 失敗，不得再執行第二次；先保存完整證據並依真實原因回報 Partial／Failed。

---

## 十五、軟體版與手動版比較

真實 117 Completed 後，沿用 v0.3.12 規則，以相同 Stable IDs 比對軟體版與既有手動版：

```text
Classification Status
Review Status
Skill ID
EXCLUDED 狀態與原因
Evidence references／content mapping
Negative Checks
Confidence
Rule IDs
scoreComponents
```

產生 machine-readable JSON 與 human-readable Markdown／HTML comparison report。

要求：

- 區分序列化／排序／空白差異與 semantic mismatch；
- 不得修改 Provider 輸出強迫一致；
- 不得再送一次挑選較好結果；
- 未解釋 semantic mismatch 存在時只能 Partial；
- 手動版是比較基準，不是硬編碼答案。

---

## 十六、正式 JSON、Golden HTML 與 SQLite

### 16.1 正式 JSON

只由本次真實 Provider completed response 經 canonical schema、117 identity、Catalog 與 semantic validation 後產生。

必須保留 `scoreComponents[]` canonical array。若需 legacy adapter，legacy view 必須明確標示版本且不得成為 canonical storage。

### 16.2 Golden HTML

- 由本機 deterministic renderer 從 validated final JSON 產生；
- 不由模型產生 HTML；
- 本版不重做視覺設計；
- 必須相容新的 `scoreComponents[]`；
- 顯示 Build／Run／Provider／Model／117 validation／Token／Schema SHA-256；
- 不包含 secrets；
- HTML 引用的 analyzed JSON hash 必須一致。

### 16.3 SQLite

- 只有全部 validation passed 才以單一 transaction 寫入；
- 117 筆全寫或全不寫；
- Partial／Incomplete／Invalid 不得寫入；
- transaction 失敗 rollback；
- 寫入後重新查詢 run ID、count、Stable IDs 與 schema／artifact identity；
- 若資料表需相容 `scoreComponents[]`，優先使用既有 JSON column／adapter；除非必要，不做無關的大型 migration。

---

## 十七、測試要求

先新增能重現 v0.3.12 缺陷的 failing test，再修實作。不得只修改 assertion 讓既有錯誤通過。

### 17.1 Schema regression tests

至少涵蓋：

1. v0.3.12 無效 fixture：`scoreComponents` 在 required 但不在 properties，preflight 必須失敗。
2. finding code／JSON Pointer 精確指向 `records[].analyses[]`。
3. 修正後 `scoreComponents` 同時存在於 properties／required。
4. `scoreComponents.items` 為固定 object、required 完整、`additionalProperties:false`。
5. 任意 `Record<string, number>`／dictionary wire schema 被拒絕。
6. properties 未全部 required 被拒絕。
7. extra required key 被拒絕。
8. required duplicate 被拒絕。
9. nested object 缺 `additionalProperties:false` 被拒絕。
10. `additionalProperties:true` 被拒絕。
11. optional 欄位未用 nullable 被拒絕。
12. unsupported keyword 被拒絕。
13. invalid `anyOf` branch 被拒絕。
14. nesting／property／enum／schema string limits 邊界測試。
15. canonical serialization deterministic。
16. 相同 schema 產生相同 SHA-256。
17. schema 微小改動產生不同 SHA-256。
18. validated schema 與 outgoing request schema deep-equal／byte-equal。
19. validator 後 mutation 被阻止或偵測。
20. local schema preflight failed 時 0 request／0 thread／0 turn。

### 17.2 Canonical contract tests

至少涵蓋：

- `scoreComponents[]` parse／serialize round trip；
- nullable explanation；
- duplicate componentKey failure；
- invalid score type failure；
- unknown property failure；
- legacy map → canonical array adapter；
- canonical array → legacy display adapter 不遺失 key／score；
- analyzed JSON／HTML／SQLite mapper 相容；
- 117 synthetic response 的 schema validation；
- MATCHED／EXCLUDED／UNKNOWN 守恆；
- invalid Skill ID、missing／duplicate／unexpected Stable ID failure。

### 17.3 App Server mock integration

Fake／mock App Server 必須證明：

- exactly one `thread/start`；
- exactly one `turn/start`；
- outgoing turn 使用 preflight 已驗證的 exact schema hash；
- mock Provider 接受修正後 Schema；
- one payload contains all 117 records；
- rules set 只傳一次；
- no retry／repair／fallback；
- streamed response 可組回完整 canonical JSON；
- turn completed 後才進 response validation；
- schema preflight failure 不呼叫 App Server；
- remote schema reject 時 attempt／accepted counters 正確；
- incomplete／refusal／disconnect 進 failed staging且不重送。

測試必須解析實際 outgoing request，不可只 assert UI 顯示數字。

### 17.4 Error dedup tests

至少涵蓋：

- 同一錯誤 observation 重播 160 次；
- AI event log 一筆；
- global debug log 一筆；
- Toast 一次；
- occurrenceCount = 160；
- 不同 Run 不合併；
- 不同 stage／errorCode／root cause 不合併；
- renderer remount／rehydration 不重寫 terminal error；
- subscription cleanup 正確；
- logger 不造成 state/render loop。

### 17.5 v0.3.12 regression

至少保留並重跑：

- Capacity warn-only；
- Capacity unavailable／overage 計算；
- warning confirm／cancel；
- dispatch guard；
- failed staging retention；
- Completed-only JSON／HTML／SQLite gate；
- Debug Folder；
- APP_ROOT／portable containment；
- secret redaction。

### 17.6 既有必要 tests

執行：

- `npm.cmd run typecheck`；
- 新增的 v0.3.13 targeted／integration tests；
- AI Analysis、ChatGPT Provider、AI Nexus、Offline Rule、SQLite、renderer、Debug Folder、APP_ROOT、packaging、ledger 相關必要 regressions；
- `git diff --check`。

命令名稱依 repository 實際 scripts 調整，不得因名稱不同而跳過測試。

不得執行已取消的長時間 smoke test，也不得刪除 assertion 掩蓋 regression。

### 17.7 測試紀錄

每個 command 保存：

```text
exact command
startedAt
endedAt
durationMs
exitCode
PASS / FAIL
testCount
failureSummary
```

---

## 十八、Token Ledger

新增：

```text
reports/JiraActivityAnalyzer_v0.3.13_token_ledger.json
```

至少分開：

### 18.1 估算值

- estimator name／version／method；
- Prompt／Rules／Payload／Schema UTF-8 bytes；
- estimated input tokens；
- output reserve；
- reasoning reserve；
- safety margin；
- estimated required total；
- capacity source／capacity；
- margin／overage；
- capacity snapshot SHA-256；
- output schema SHA-256。

### 18.2 Provider 真實值

依實際可取得欄位記錄：

```text
input_tokens
cached_tokens
cache_write_tokens
output_tokens
reasoning_tokens
total_tokens
provider-specific usage fields
```

不得把估算值寫成 Provider usage。未回傳填 `null`／`unavailable` 並附原因，不可用 `0` 冒充。

### 18.3 執行次數

```text
providerDispatchCount
threadStartAttemptCount
threadCreatedCount
turnStartAttemptCount
acceptedTurnCount
turnCompletedCount
retryCount
repairTurnCount
fallbackRequestCount
```

---

## 十九、Execution Time Ledger

新增：

```text
reports/JiraActivityAnalyzer_v0.3.13_execution_time_ledger.json
```

至少記錄：

- overall wall-clock；
- repository／Git inspection；
- v0.3.12 evidence inspection；
- root cause reproduction；
- schema contract implementation；
- schema validator implementation；
- error dedup root cause／fix；
- typecheck；
- 每組 targeted／regression test；
- build；
- dist；
- artifact verification；
- formal Portable launch；
- authentication／manual wait；
- Provider diagnostics；
- schema preflight；
- capacity calculation／confirmation；
- thread／turn／Provider；
- response parse／validation；
- 117 identity／Catalog validation；
- comparison；
- JSON／HTML；
- SQLite transaction／verification；
- Debug Folder；
- docs／reports／ledgers；
- Git commit／tag／push／remote verification。

每項包含：

```text
startedAt
endedAt
durationMs
status
commandOrOperation
notes
```

Blocked／failed／not executed 階段也必須保留真實狀態與原因。

---

## 二十、Build、Dist 與產物驗證

必須完成 repository 實際支援的：

```text
typecheck
targeted tests
required regression tests
build
dist
```

Dist 至少驗證：

- Installer EXE；
- Portable EXE；
- win-unpacked EXE；
- `app.asar`（若既有流程產生）。

每個產物記錄：

```text
absolute path
filename
bytes
MiB
SHA-256
version
build time
source Git commit
signature status
```

Build warning 必須列出，但不得把 warning 說成 PASS 或 FAIL。特別記錄 renderer chunk、browser externalization、icon、Windows signing 等既有 warning 是否仍存在，以及是否實際影響 Schema hash／Provider path。

正式 117 驗證只能使用最終 Release Portable。

---

## 二十一、Git、Commit、Tag 與 Push

### 21.1 Preflight

開始前記錄：

```text
repository absolute path
branch
HEAD
upstream
remote
working tree status
ahead / behind
v0.3.12 tag target
```

執行 `git fetch --all --prune`；若網路或權限失敗，記錄而不要破壞本機狀態。

### 21.2 精準 staging

Commit 前：

- `git status --short`；
- `git diff --check`；
- 列出本版 tracked file 清單；
- secret／path／package audit；
- 不使用 `git add .` 或 `git add -A`；
- 只加入本版明確檔案。

不得加入：

- `.env`／auth state／Token；
- 真實 Pending／rules／Provider response；
- SQLite；
- release binaries；
- Debug／Failed staging；
- 操作影片／screenshots；
- 使用者無關修改。

### 21.3 建議流程

1. 完成程式、tests、版本與 docs。
2. 建立 source release commit。
3. 從乾淨 source commit 執行最終 Build／Dist。
4. 使用正式 Portable 執行真實 117。
5. 產生 ledgers／validation／comparison／packaging reports。
6. 建立 evidence／reports commit。
7. 建立 annotated tag `v0.3.13` 指向最終交付 HEAD。
8. Push branch 與 tag。
9. 驗證 remote HEAD／tag／Ahead／Behind。

### 21.4 Artifact source commit 與 final HEAD

若產物來自 source release commit，final HEAD 因 reports 不同，正式回報必須列出：

```text
artifactSourceCommit
finalHeadCommit
git diff --name-status <artifactSourceCommit>..<finalHeadCommit>
```

兩者差異只可包含 reports、ledgers、validation evidence、純文件或不影響執行檔的 metadata。

若包含 application source、schema、tests runtime、package／lockfile、builder config、renderer、migration 或 runtime assets，必須重新 Build／Dist，使產物對應最新 source commit。

### 21.5 Push Gate

- 程式修正、必要 tests、Build、Dist 成功後，即使真實 Provider 因登入／外部限制為 Partial，仍應 Commit 與 Push。
- 若程式、Schema preflight、tests、Build 或 Dist 失敗，不得建立成功 tag。
- 不 force push。
- 最終目標：

```text
Remote branch contains final HEAD
Remote tag v0.3.13 resolves to final HEAD
Ahead = 0
Behind = 0
```

---

## 二十二、文件更新

依 repository 實際結構更新：

- `VERSION`；
- `package.json`／lockfile 的正確版本；
- `CHANGELOG.md`；
- `PROJECT.md`；
- `README.md`；
- v0.3.13 Prompt archive；
- output schema／validator docs；
- Token ledger；
- Execution time ledger；
- implementation report；
- real 117 validation report；
- manual comparison report；
- packaging report。

若 ENV schema 沒有變更，不要提高 `ENV_FORMAT_VERSION`，不要修改 `.env.version`／`.env.Version` 的格式版本。

---

## 二十三、本版明確不做

不得擴大為：

- 修改三份技能分類規則；
- 修改 279 Skills Catalog；
- 重新縮減／重寫 117 筆 Prompt；
- 改用其他模型；
- 改成分批或逐筆分析；
- 新增 repair turn；
- 新增 App retry／fallback；
- 改回容量 hard block；
- 降級成 JSON mode；
- 關閉 strict schema；
- 修改 AI Nexus 核心 orchestration；
- 重做 Golden HTML 視覺設計；
- 無關的 SQLite 大型 migration；
- 自動刪除 Failed staging；
- 搬移或猜測 ChatGPT authentication；
- 用 fixture／手動版結果冒充真實 Provider；
- 用測試 build 冒充正式 Release Portable。

若真實 Provider 接受 Schema 後仍因 context／output limit incomplete，保留真實證據並回報，留給後續版本討論；本版不得自行分批。

---

## 二十四、完成判定

### 24.1 Completed

只有以下全部成立才可標示 Completed：

```text
Version = v0.3.13
v0.3.12 invalid schema reproduced by regression test
scoreComponents strict-safe schema implemented
Canonical contract / parser / writer synchronized
Local recursive schema preflight passed
Validated schema hash = outgoing schema hash = debug schema hash
No unsupported dictionary schema
No required / properties mismatch
All objects additionalProperties = false
Global 160-line error storm fixed
Capacity warn-only preserved
117 real input
117 real output
Provider dispatch = 1
Thread created = 1
Turn start attempt = 1
Turn accepted = 1
Turn completed = 1
Retry / Repair / Fallback = 0 / 0 / 0
Provider status = completed
Response schema validation passed
Identity / Catalog / semantic validation passed
Manual comparison has no unresolved semantic mismatch
Real formal JSON generated
Real Golden HTML generated
SQLite committed and re-verified
Failed staging retention passed
AI Debug Folder complete
Real Token ledger complete
Execution ledger complete
Typecheck / tests / build / dist passed
Official Release Portable verified
Artifacts hashed
Commit + annotated tag + push completed
Ahead / Behind = 0 / 0
```

### 24.2 Partial

以下任一項發生，只能 Partial：

- 真實 Provider 分析未執行；
- authentication 需人工但未完成；
- Provider incomplete／refusal／external failure；
- 不是正式 Release Portable；
- 不是 117／117；
- request／thread／turn 不符合成功契約；
- 發生 retry／repair／fallback；
- response schema／identity／Catalog／semantic validation 失敗；
- manual comparison 有未解釋 semantic mismatch；
- JSON／Golden HTML／SQLite 任一失敗；
- 真實 usage 或必要證據無法取得且未充分說明；
- Debug／Failed staging 證據不完整。

即使 Partial，仍須列出程式、tests、Build、Dist、artifacts、Git 與真實 Provider gate 結果。

### 24.3 Failed／Blocked

若程式實作、Schema validator、必要 tests、Build、Dist、資料安全、Git 目標或權限本身阻斷，回報：

```text
exact blocker
stage
error code / message
what was executed
what was not executed
request / thread / turn counters
formal data write status
recoverable evidence path
safe next action
```

不得用 `Partial` 掩蓋程式自身的未修復 Schema 缺陷或必要測試失敗。

---

## 二十五、最終正式回報格式

完成後使用繁體中文，至少依序包含：

1. Version／Theme／Overall Status。
2. repository path、base branch／commit、working branch。
3. v0.3.12 根因重現證據與實際來源 Hash。
4. `scoreComponents` 舊／新 wire contract 對照。
5. canonical output contract 與 downstream adapters。
6. schema preflight validator 規則、版本、findings、metrics。
7. schema canonical bytes、SHA-256，以及 validated／outgoing／debug hash 一致性。
8. error code／UI／SQLite reason 修正。
9. global 160-line log storm 根因、修正與測試結果。
10. Capacity calculation 與 regression 結果。
11. 正式 Portable Version／Build Time／Commit／EXE Hash 核對。
12. 真實 Provider／Model／diagnostics。
13. dispatch／thread attempt／created／turn attempt／accepted／completed／retry／repair／fallback counts。
14. 真實 Provider terminal status、IDs／Trace、Token usage、duration。
15. 117 input／output、Stable ID／Catalog／Schema／semantic validation。
16. 手動版 comparison 結果。
17. 正式 JSON／Golden HTML／SQLite path、bytes、SHA-256、count 驗證。
18. Failed staging／Debug Folder path、內容、hash、保留狀態。
19. 每個 test command、結果、test count、duration。
20. Build／Dist command、結果、duration與 warnings。
21. Installer／Portable／win-unpacked／ASAR path、bytes、SHA-256、source commit。
22. Token ledger／Execution ledger／Packaging／Implementation／117 Validation reports。
23. Git：artifact source commit、final HEAD、diff、tag、remote、push、Ahead／Behind。
24. 完整保留且未提交的使用者既有修改／檔案。
25. 未完成項目、風險與唯一必要下一步。

任何未執行或不可取得項目必須寫 `Not executed`／`Unavailable` 與精確原因，不得省略或填推估值。

---

## 二十六、建議執行順序

1. 讀 repo instructions、Git、v0.3.11／v0.3.12 Prompt、reports 與真實 failed evidence。
2. 建立 Execution Time Ledger 起始紀錄。
3. 定位實際 output schema builder、TypeScript contract、parser、HTML、SQLite mapper。
4. 用 v0.3.12 schema fixture 新增 failing regression test。
5. 定位 `scoreComponents` 被放入 required 卻未進 properties 的真正程式路徑。
6. 將 wire contract 改成 strict-safe `ScoreComponent[]`。
7. 建立單一 canonical schema source與 downstream adapters。
8. 實作 canonical serialization、freeze、SHA-256。
9. 實作 recursive local Strict Schema preflight validator。
10. 將 preflight 放到 Thread 建立前並串接 precise errors／UI／Failed staging。
11. 增加 attempt／accepted／completed counters。
12. 定位並修正 global debug log 160 次重複寫入來源。
13. 補齊 Schema、integration、117 conservation、dedup、capacity與 gate tests。
14. 執行 typecheck／targeted／required regressions，修至通過。
15. 更新 VERSION／docs／Prompt／CHANGELOG／README／PROJECT。
16. 建立 source release commit。
17. 從 source commit Build／Dist。
18. 驗證 Installer／Portable／win-unpacked／ASAR metadata與 Hash。
19. 從正式 Release Portable 完成登入／diagnostics／Schema preflight／容量確認。
20. 只執行一次真實 117 Run。
21. 完成 response／117／Catalog／comparison／JSON／HTML／SQLite／Debug驗證。
22. 完成 Token／Execution／Packaging／Implementation／117 Validation reports。
23. `git diff --check`、secret audit、精準 staging。
24. Commit reports／evidence，建立 annotated `v0.3.13` tag。
25. Push branch與 tag，驗證 remote與 Ahead／Behind。
26. 依本 Prompt格式正式回報。

---

## 二十七、立即開始

現在開始執行 v0.3.13。

本版首要 gate 不是再次送出 Provider，而是先以自動測試重現 v0.3.12 的無效 Schema，修正 canonical contract，並證明實際 outgoing Schema 已在本機通過完整 Strict Schema preflight。

完成最終正式 Portable 後，才可由操作者登入並執行一次真實 117 筆重試。除非發生本 Prompt 定義的真正 blocker，否則不得停在分析、局部修改、只寫測試或只完成 Build；必須一路完成可安全完成的全部交付流程。
