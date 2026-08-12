# JiraActivityAnalyzer v0.3.12 正式 Codex Prompt

你現在要在既有 `JiraActivityAnalyzer` repository 上，完整實作、驗證、建置、封裝、記錄、Commit 與 Push：

> **v0.3.12 — Capacity Override, Real 117 Validation & AI Analysis Diagnostics**

本版是 v0.3.11 的集中修復與真實驗證版。不要重新設計技能分類規則，不要改成分批分析，也不要用模擬資料取代真實 Provider 執行。

---

## 一、執行原則

1. 先讀取並遵守 repository 內既有的 `AGENTS.md`、`AI_RULES.md`、`PROJECT.md`、`README.md`、`CHANGELOG.md`、`VERSION`、相關 prompts、tests、reports 與目前 Git 狀態。
2. 先檢查 v0.3.11 實作、失敗紀錄與現有測試，再修改程式；不要假設檔名、資料夾、schema、IPC 名稱或 Provider API。
3. 保留使用者既有修改與未提交內容；不要覆蓋、重設或刪除不屬於本版的變更。
4. 全程自主完成可安全完成的工作，不要在一般實作細節上停下來等待確認。
5. 不得偽造 Provider 請求、Token usage、Thread／Turn、117 筆輸出、Golden HTML、SQLite 寫入、測試、封裝或 Git 結果。
6. 所有秘密資料必須繼續由 `.env` 或既有安全登入流程載入；不得將 `.env`、ChatGPT Cookie、Jira Token、AI Nexus Token、Authorization Header、`auth.json` 或其他憑證寫入 Git、Debug Folder、報告或正式輸出。
7. 本版必須計算並保存：
   - 真實 Provider Token usage；
   - Prompt／Payload Token 估算；
   - 各階段執行時間；
   - Build／Dist／正式 117 筆驗證時間；
   - 執行檔大小、SHA-256、Build Version、Build Time、Git Commit；
   - 最終 Git HEAD、Remote、Tag、Ahead／Behind。
8. 不執行長時間 smoke test。只執行本版必要的 targeted tests、既有必要 regression tests、Build、Dist，以及一次正式 117 筆真實驗證。
9. 若真實 Provider 分析因 `incomplete`、模型限制或外部服務問題失敗，本版只能回報 **Partial**，但只要程式修正、測試、Build、Dist 與 Git 流程本身仍可安全完成，就必須繼續完成它們，不得因 Provider 結果不完整而放棄封裝、帳本、Commit 或 Push。
10. 若遇到會破壞資料、需要猜測憑證、無法確認 Git 目標、會覆蓋使用者變更，或實作／測試／Build／Dist 本身失敗，才停止相依步驟並清楚回報 blocker。

---

## 二、版本目標

將版本更新為：

```text
v0.3.12
```

Theme：

```text
Capacity Override, Real 117 Validation & AI Analysis Diagnostics
```

本版核心目標：

1. 移除 v0.3.11「容量未知或估算超過就禁止送出」的本機硬性阻擋。
2. 容量風險改成 Warn-only，但在送出前顯示一次確認視窗。
3. 確認視窗必須顯示完整、可驗證的 Token 容量計算方式，不可只顯示「容量不足」。
4. 保留單一 Payload、單一 Ephemeral Thread、單一 Turn、單一主要分析請求。
5. 防止 UI re-render、重複點擊、狀態同步、timeout 或錯誤處理造成重複送出。
6. 修正同一錯誤在不到一秒內被重複寫入約 160 次的日誌風暴。
7. 補齊 AI Analysis 專屬 Debug Folder、Failed Run 與容量證據。
8. 使用最終正式 Release Portable，真正送出一次 117 筆分析。
9. 驗證 117 進／117 出，比對軟體版與既有手動版結果，產生真實 Golden HTML。
10. 記錄真實 Token、時間、Provider Response、封裝與 Git 證據。

---

## 三、已確認且不得再詢問的產品決策

### 3.1 容量警告後的操作

已採用以下設計：

- 容量資訊 unavailable 或估算可能超過容量時，顯示一次確認視窗。
- 確認視窗必須顯示容量如何計算，包含每一個加總項目、公式、資料來源、估算方法與差額。
- 使用者按下「仍然執行單次分析」後立即送出一次。
- 使用者按下取消則不建立 Thread、不建立 Turn、不送出 Provider 請求。
- 同一個 `analysisRunId` 不得再次顯示相同確認視窗，也不得再次 dispatch。
- 容量警告不是硬性禁止條件。

### 3.2 Failed staging 保存期限

已採用以下設計：

- AI Analysis Failed staging 永久保留，直到操作者手動刪除。
- App 啟動、關閉、重新分析、成功分析、Build、升級或 Debug Folder 產生時，都不得自動清除。
- 新 Run 必須使用新的唯一資料夾，不得覆寫舊 Failed staging。
- 若未來提供刪除操作，必須由操作者明確觸發並顯示精確目標；本版若尚無安全刪除 UI，不必新增。

這兩項決策已完成，不要再向使用者詢問。

---

## 四、v0.3.11 已知問題與修復基線

實作前必須從程式碼、測試與附件／報告中核對以下基線：

1. 手動執行成功完成：
   - ChatGPT 登入；
   - Provider diagnostics；
   - GPT-5.6-Sol model availability；
   - 三份規則載入；
   - 279 Skills／279 Unique／0 Duplicate；
   - Pending JSON 117 Events／28 Issues／2 Projects；
   - identity／integrity preflight。
2. 按下執行後約 186 ms 即失敗。
3. 實際錯誤為：

```text
ANALYSIS_INPUT_CONTEXT_TOO_LARGE:
Model context capacity is unavailable;
single-run safety cannot be proven.
```

4. 該次不是已證明容量超出，而是：

```text
Model capacity = unavailable
Existing policy = cannot prove safe, therefore block
```

5. Provider Request／Thread／Turn 均為 `0／0／0`，未真正送出分析。
6. 同一錯誤被重複寫入約 160 次。
7. Debug Folder 沒有正確包含 AI Analysis failed run、capacity preflight、Provider diagnostics 與 run history。
8. 影片執行的是較早的 `portable-isolated` 測試副本，不是最終正式 Release Portable。
9. v0.3.11 曾出現另一組估算：

```text
Final prompt bytes           407,037
Estimated input tokens       135,679
Output/reasoning reserve      90,880
Estimated required total     226,559
Compared capacity            200,000
Estimated overage             26,559
```

這組數字只可作為 regression fixture／畫面範例，不得把 `200,000` 永久寫死成所有模型或目前 Provider 的硬上限。

---

## 五、容量資料來源與判定模型

### 5.1 移除硬編碼容量上限

不得再以固定 `200,000 Tokens` 作為所有 Provider／Model 組合的硬性阻擋。

容量資料來源依序為：

1. Codex App Server `modelProvider/capabilities/read` 對目前實際 Provider／Model 組合回傳的能力界線。
2. App Server 對同一 Provider／Model 回傳的其他明確 model metadata；只有欄位語意確定時才可使用。
3. 官方模型 reference 僅可作為「Reference」，不可假裝等同目前 ChatGPT Provider 實際路由容量。
4. 都取不到時使用 `unavailable`。

容量來源 enum 至少要能區分：

```text
app_server_capability
provider_model_metadata
official_model_reference_only
unavailable
```

若 `modelProvider/capabilities/read` 不支援、回傳錯誤、欄位缺失、model ID 無法映射或資料無法判讀：

- 保存 sanitized raw result／error；
- 顯示 capacity unavailable；
- 不得將 unavailable 轉成 `0`；
- 不得轉回固定 `200,000` 後硬擋；
- 分析仍可經使用者確認後送出。

### 5.2 分離錯誤／警告碼

不得再把容量未知與容量超出混為：

```text
ANALYSIS_INPUT_CONTEXT_TOO_LARGE
```

至少分為：

```text
ANALYSIS_MODEL_CONTEXT_CAPACITY_UNAVAILABLE
ANALYSIS_ESTIMATED_CONTEXT_EXCEEDS_LIMIT
```

這兩項在 v0.3.12 都是 warning，不是 terminal error。

真正可以禁止執行的條件包括：

- Prompt／Payload 無法建立；
- 規則 Catalog 無效；
- 117 筆 Stable ID／identity／integrity preflight 失敗；
- Provider 未登入或基本診斷未通過；
- 必要檔案讀取失敗；
- 無法建立 run staging；
- 其他會使送出內容不確定或不可驗證的真正錯誤。

---

## 六、容量計算與 UI 顯示

### 6.1 必須先追蹤現有算法

先定位 v0.3.11 實際 Token estimator、output reserve、reasoning reserve、safety margin 與 rounding 的程式碼及設定來源。

不得為了讓數字看起來合理而另造公式。若現有算法不透明，先重構成具名、可測試、可序列化的計算元件，再由 UI、run manifest、debug 與帳本共同使用同一份 `CapacityCalculationSnapshot`。

### 6.2 容量快照至少包含

```text
providerId
providerDisplayName
modelId
modelDisplayName
capacitySource
capacitySourceStatus
capacityTokens
capacityRawResponseSanitized
estimatorName
estimatorVersion
estimatorMethod
estimatorFallbackUsed
roundingRule
rulesBytesUtf8
pendingPayloadBytesUtf8
wrapperInstructionsBytesUtf8
finalSerializedPromptBytesUtf8
estimatedRulesTokens
estimatedPendingPayloadTokens
estimatedWrapperTokens
estimatedFinalInputTokens
outputReserveBaseTokens
outputReservePerRecordTokens
recordCount
estimatedVisibleOutputReserveTokens
reasoningReserveTokens
safetyMarginTokens
otherReserveTokens
estimatedOutputAndReasoningReserveTokens
estimatedRequiredTotalTokens
remainingAfterInputTokens
estimatedMarginTokens
estimatedOverageTokens
calculationTimestamp
```

不存在或不適用的欄位必須是明確 `null`／`unavailable`，不可用 `0` 冒充。

### 6.3 必須顯示的公式

UI 與 Debug 證據必須顯示實際採用的公式，而不是只顯示最後結果。概念格式如下，但變數必須對應目前程式的真實算法：

```text
Estimated Input
= tokenEstimate(final serialized prompt)

Estimated Visible Output Reserve
= output base reserve
 + (record count × per-record output reserve)
 + any schema / envelope reserve actually used

Estimated Output & Reasoning Reserve
= visible output reserve
 + reasoning reserve
 + safety margin
 + other configured reserve

Estimated Required Total
= estimated final input
 + estimated output & reasoning reserve

Remaining After Input
= provider/model capacity
 - estimated final input

Estimated Margin
= provider/model capacity
 - estimated required total

Estimated Overage
= max(0, estimated required total - provider/model capacity)
```

若 tokenizer 對各子區塊分別估算後的加總，可能因 token boundary 與完整 prompt 估算不同：

- `estimatedFinalInputTokens` 必須以實際最終序列化 Prompt 的整體估算為準；
- 子區塊只用於解釋構成；
- UI 必須註明子項加總可能與整體估算存在 tokenizer boundary 差異；
- 不得暗中調整子項使它們假裝完全相等。

若 estimator 使用 bytes 比例 fallback，必須顯示：

- UTF-8 bytes；
- 除數／倍率；
- `ceil`／`floor`／`round` 規則；
- 為何啟用 fallback；
- fallback 結果不是 Provider 官方 token count。

### 6.4 容量未知時的顯示

即使 Provider capacity unavailable，仍要顯示：

```text
Estimated final input
Estimated visible output reserve
Estimated reasoning reserve
Safety margin
Estimated required total
Capacity source = unavailable
Remaining after input = unavailable
Estimated margin = unavailable
Estimated overage = unavailable
```

警告文字必須清楚說明：

> 目前無法取得此 Provider／Model 組合的容量界線，因此無法計算剩餘容量或超出量；以下仍顯示本次 Prompt 的完整估算。此狀況不代表已證明輸入超出限制。

### 6.5 已知容量且估算超出時的顯示

必須顯示：

```text
Estimated input
+ visible output reserve
+ reasoning reserve
+ safety margin
= estimated required total

Provider/model capacity
- estimated required total
= margin or overage
```

使用 v0.3.11 fixture 時，若算法與設定未改變，測試應能呈現：

```text
135,679 + 90,880 = 226,559
226,559 - 200,000 = 26,559 estimated overage
```

若追查後發現 v0.3.11 數字來自不同算法、重複計算或錯誤設定，必須修正算法、更新 fixture，並在變更報告中解釋差異；不得為了通過舊數字而保留錯誤。

### 6.6 容量警告確認視窗

只有以下情況需要出現：

- Capacity unavailable；或
- Estimated required total > 已取得的 Provider／Model capacity。

視窗內必須直接顯示上述計算摘要，並提供可展開的完整明細；不可要求使用者去 Debug Folder 才能知道怎麼算。

按鈕：

```text
取消
仍然執行單次分析
```

使用者確認時，寫入：

```text
analysisRunId
warningCode
capacitySnapshotHash
confirmedAt
confirmationAction
```

並保存到 run manifest、event log 與 user action log。

---

## 七、單一請求與一次性 Dispatch 保證

保留 v0.3.11 架構：

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
- group-first fallback；
- `_001` fallback；
- repair turn；
- App retry；
- timeout retry；
- parse failure retry；
- incomplete retry；
- UI re-render 再送；
- 切換頁面再送；
- 自動建立第二個 Thread／Turn。

### 7.1 一次性 Guard

必須在 Electron main／實際 Provider dispatch 邊界建立不可繞過的一次性 guard，不能只依賴 React button disabled。

至少保證：

- 每次開始先建立唯一 `analysisRunId`；
- 每個 `analysisRunId` 最多只能進入 Provider dispatch 一次；
- dispatch 前以原子狀態從 `confirmed`／`ready` 轉為 `dispatching`；
- 重複 IPC、重複 click、re-render、subscription replay 均回傳同一 Run 狀態，不得建立新請求；
- 執行按鈕在開始後立即 disabled；
- Provider request counter 只在真實 dispatch 成功進入 Provider boundary 時增加；
- Thread／Turn counters 由真實建立事件計算，不可由 UI 預先假設；
- timeout、視窗關閉與 route change 不得自動 retry。

成功驗收值：

```text
App-issued main request = 1
Ephemeral thread = 1
Turn = 1
Main payload = 1
Rules set = 1
Retry = 0
Repair turn = 0
Fallback request = 0
```

取消容量視窗的驗收值：

```text
App-issued main request = 0
Thread = 0
Turn = 0
```

---

## 八、Provider 回覆、Incomplete 與正式保存 Gate

### 8.1 Completed Provider 回覆

只有以下條件全部通過，該 Run 才可標記 Completed：

1. Provider／Turn status 明確完成。
2. 可見回覆完整保存。
3. 結構化 JSON 可完整解析。
4. 輸入 117 筆、輸出 117 筆。
5. Stable ID 無缺漏、無重複、無多出。
6. 每筆輸出能回連唯一輸入事件。
7. Skill ID 均可映射至載入的 Catalog；EXCLUDED 狀態符合 schema。
8. 必要欄位、Evidence references 與 Negative Checks 結構驗證通過。
9. Provider visible response gzip 已保存且 SHA-256 驗證通過。
10. 正式分析 JSON 產生成功。
11. 真實 Golden HTML 產生成功。
12. SQLite transaction 完整成功。
13. Token ledger 與 execution time ledger 完整成功。

### 8.2 Incomplete／截斷／無效 JSON／拒絕／失敗

以下任一情況都必須將 Run 標記 Failed：

- Provider status = `incomplete`／`failed`／`cancelled`；
- `incomplete_details` 存在；
- 達到 context／output／reasoning 限制；
- 可見回覆被截斷；
- JSON 無法解析；
- 不是 117／117；
- Stable ID 驗證失敗；
- Catalog／schema 驗證失敗；
- 正式保存 transaction 失敗。

不得 repair、retry 或 fallback。

Failed staging 至少保存：

```text
run-manifest.json
failed-run-manifest.json
capacity-snapshot.json
provider-diagnostics.json
request-sanitized.json
response-sanitized.json
provider-visible-response.json.gz
provider-visible-response.sha256
validation-result.json
token-usage.json
execution-time.json
event-log.jsonl
user-action-log.txt
```

若某項因失敗發生在更早階段而不存在，manifest 必須記錄：

```text
status = unavailable
reason = <exact reason>
```

不得建立空檔假裝已保存。

### 8.3 正式保存禁止條件

任何 incomplete 或驗證失敗結果：

```text
不得寫入正式分析 JSON
不得產生正式 Golden HTML
不得寫入正式 SQLite
不得覆寫上一次正式成功結果
不得自動刪除 Failed staging
```

UI 的 SQLite 狀態不得只顯示 `Unavailable`，應顯示精確原因，例如：

```text
Not written — failed before provider request
Not written — provider response incomplete
Not written — result validation failed
Not written — SQLite transaction failed
Written — 117 validated records
```

---

## 九、Failed Staging 永久保存設計

1. 使用既有統一 `APP_ROOT`／portable containment 規則。
2. 不得將 failed staging 寫入 `%LOCALAPPDATA%`、暫存資料夾或不可預期路徑。
3. 路徑應為既有 App Root 輸出結構下明確、可尋找的 AI Analysis failed staging，例如：

```text
<APP_ROOT>/exports/ai-analysis/failed-staging/<analysisRunId>/
```

若 repository 已有不同但等價的 canonical 路徑，沿用既有規則，不要平行建立第二套根目錄。

4. 每個 Run 使用唯一目錄並以 safe-create 方式建立。
5. 不可覆寫同名目錄；碰撞時必須失敗並記錄，不得刪除舊資料。
6. App 啟動、關閉、成功 Run、Debug Folder 生成、版本升級或一般 cleanup 不得刪除。
7. Debug Folder 可以複製／引用 failed staging 的 sanitized 證據，但不得搬移或消耗原始 failed staging。
8. 所有檔案必須通過 containment、path traversal 與 writable preflight。

---

## 十、修正日誌風暴

同一個 Run 的相同主要錯誤不得寫入 160 筆獨立 log。

建議 dedup key：

```text
analysisRunId + stage + errorCode
```

要求：

- Debug Log 最多建立一筆主要錯誤紀錄；
- Toast 最多顯示一次；
- Run 卡片保留完整錯誤；
- 頂部摘要只顯示一次簡短錯誤；
- 若相同錯誤再次進入 logger，更新同一筆的 `occurrenceCount`、`firstOccurredAt`、`lastOccurredAt`；
- 不得因 logger dedup 而吞掉不同 stage、不同 errorCode 或不同 run 的真正錯誤；
- logger 本身不得觸發 React state loop 或重新 dispatch Provider。

針對 v0.3.11 情境，應驗收：

```text
same primary error records = 1
occurrenceCount >= 1
Provider requests = 0 or 1 according to actual stage, never 160
```

---

## 十一、AI Analysis Debug Folder

Debug Folder 必須真正納入 AI Analysis domain，不得只輸出舊 Activity Stream／User Analysis 診斷結構。

至少包含：

```text
ai-analysis/
  run-manifest.json
  failed-run-manifest.json               # 只有 failed run 才有，或 manifest 清楚標示 N/A
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

若可見 Provider Response 因敏感度與大小不適合直接放 Debug Folder，可保存安全摘要、hash、bytes、gzip path reference 與 redaction 結果；但 Failed staging 必須保存可供診斷的 sanitized 可見回覆。

Debug 必須記錄：

- Build Version／Build Time／Git Commit；
- 正式 EXE path、size、SHA-256；
- App Root；
- Provider／Model；
- Provider diagnostics；
- capacity source 與 sanitized raw result；
- 完整容量公式、每個中間值與 snapshot hash；
- Prompt／Payload／Rules UTF-8 bytes；
- estimated tokens；
- 使用者是否確認容量警告；
- request／thread／turn／retry／repair／fallback counts；
- Run state transitions；
- 117 input／output identity validation；
- 正式 JSON／HTML／SQLite gate 狀態；
- Token usage；
- 各階段時間；
- 最終 Run status。

`user-action-log.txt` 至少記錄：

- 選擇／載入規則；
- 選擇／載入 Pending JSON；
- 執行 Provider diagnostics；
- 按下開始分析；
- 顯示容量警告；
- 使用者確認或取消；
- 產生 Debug Folder；
- 刪除操作（若本版存在）。

所有 log 需去除秘密與不必要個資。

---

## 十二、UI 狀態定義

Provider readiness 與 Analysis readiness 必須分開顯示：

| 狀態 | 建議顯示 |
|---|---|
| Provider 登入及基本診斷通過 | `Provider Ready` |
| 容量未知但可確認後執行 | `Ready with capacity warning` |
| 估算超過已知容量但可確認後執行 | `Ready — estimated capacity exceeded` |
| 尚未送出 | `Not started` |
| 容量警告等待確認 | `Waiting for capacity confirmation` |
| Provider 已接受 | `Analysis running` |
| Provider incomplete | `Failed — provider returned incomplete` |
| Parse／identity／catalog 驗證失敗 | 顯示具體失敗原因 |
| 117 筆完整驗證通過 | `Completed — 117/117 validated` |

要求：

1. `Provider Ready` 不得暗示容量已驗證。
2. 容量警告卡／視窗要顯示計算內容與 capacity source。
3. 頂部、Run 卡片與 Toast 不得重複堆疊同一錯誤。
4. 顯示實際 request／thread／turn counts。
5. 顯示 Token usage unavailable 時不可用 `0` 代替。
6. 顯示正式保存狀態與未寫入原因。

---

## 十三、真實 117 筆正式驗證

### 13.1 測試來源

使用 v0.3.11 已驗證的同一組：

```text
117 Events
28 Issues
2 Projects
279 Skills
279 Unique Skill IDs
0 Duplicate Skill IDs
```

必須定位 repository、既有 test artifacts、使用者提供資料或 App 選取來源中的真實檔案。不得自行生成 117 筆假資料替代 Provider 驗收。

若真實檔案或 Provider 登入狀態在執行環境中不可取得：

- 完成仍可完成的程式、tests、Build、Dist、帳本、Commit 與 Push；
- 將正式驗證標示 Blocked／Partial；
- 列出缺少的精確檔案或登入條件；
- 不得宣稱 117 筆已送出。

### 13.2 必須從正式 Release Portable 執行

不得用：

- `portable-isolated`；
- packaged smoke 副本；
- dev server；
- `win-unpacked` 測試替代正式 Portable；
- 舊 Build Time／舊 Commit 的 EXE。

流程：

1. 完成 source release commit。
2. 從乾淨且可追溯的 source commit 執行最終 `dist`。
3. 記錄正式 Portable path、size、SHA-256。
4. 從正式 `release` 目錄啟動 Portable。
5. 在 App 畫面核對：
   - Version = `0.3.12`；
   - Build Time；
   - Git Commit；
   - App Root；
   - EXE SHA-256 與封裝報告一致。
6. 載入正式三份規則與同一份 117 Pending JSON。
7. 執行 Provider diagnostics。
8. 檢查容量計算與警告視窗。
9. 按一次「仍然執行單次分析」。
10. 等待同一 Turn 進入 terminal state。
11. 不得手動或自動再送第二次。

### 13.3 117 進／117 出驗證

保存並驗證：

```text
inputCount = 117
outputCount = 117
missingStableIds = []
duplicateStableIds = []
unexpectedStableIds = []
catalogInvalidSkillIds = []
requestCount = 1
threadCount = 1
turnCount = 1
retryCount = 0
repairTurnCount = 0
fallbackRequestCount = 0
```

任何一項不符合，不得標記 v0.3.12 Completed。

---

## 十四、軟體版與手動版結果比對

使用相同 117 Stable IDs，比對軟體版結果與既有手動執行結果。至少逐筆比對：

```text
Stable ID
Classification Status
Review Status
Skill ID／Skill
EXCLUDED 狀態與原因
Evidence references／Evidence content mapping
Negative Checks
Confidence（若 schema 中存在）
Rule IDs（若 schema 中存在）
```

產生 machine-readable JSON 與 human-readable Markdown／HTML comparison report，至少包含：

- 117 筆配對狀態；
- 完全一致筆數；
- 各欄位 mismatch count；
- 每筆差異；
- missing／unexpected Stable IDs；
- 無法比對的原因；
- 是否為 deterministic serialization 差異、顯示差異或真正 semantic mismatch。

不得將順序、空白、JSON key order 等非語意差異誤報為分類差異；但不得忽略 Skill、EXCLUDED、Evidence、Negative Checks 的真正差異。

若存在任何未解釋的 semantic mismatch：

- 保留完整比較證據；
- 不得修改 Provider 輸出來強迫一致；
- 不得再送一次挑選較好結果；
- v0.3.12 Overall Status 只能是 Partial。

---

## 十五、正式 JSON、Golden HTML 與 SQLite

### 15.1 正式 JSON

只有 Completed Run 才可產生。必須由真實 Provider visible response 經 parse、117 identity、Catalog、schema 驗證後生成，不得由 fixture 或手動版複製。

### 15.2 Golden HTML

只有 Completed Run 才產生真實 Golden HTML：

- 使用本次真實 117 筆軟體輸出；
- 沿用 v0.3.11 已定義的視覺與內容格式；
- 本版不重新設計 Golden HTML UI；
- 顯示 Build／Run／Model／Provider／117 validation／Token usage／生成時間；
- 不包含秘密；
- HTML 所引用的分析結果 hash 必須與正式 JSON 一致。

### 15.3 SQLite

只有全部驗證成功後才以單一 transaction 寫入正式 SQLite：

- 117 筆全寫或全不寫；
- Partial、Incomplete、Invalid 不得進正式資料；
- transaction 失敗必須 rollback；
- 寫入後重新查詢 count、Stable IDs 與 run identity；
- 保存 SQLite write verification report。

---

## 十六、Token Ledger

新增或更新 v0.3.12 Token ledger。檔名沿用 repository 現有命名慣例；若無既有明確慣例，使用：

```text
reports/JiraActivityAnalyzer_v0.3.12_token_ledger.json
```

必須明確分開：

### 16.1 估算值

- estimator 名稱／版本／方法；
- Prompt／Rules／Payload bytes；
- estimated input tokens；
- output reserve；
- reasoning reserve；
- safety margin；
- estimated required total；
- capacity source／capacity；
- margin／overage；
- capacity snapshot SHA-256。

### 16.2 Provider 真實值

依 Provider 實際可取得欄位記錄：

```text
input_tokens
cached_tokens
cache_write_tokens
output_tokens
reasoning_tokens
total_tokens
other provider-specific usage fields
```

不得把估算值寫成真實 usage。Provider 未回傳的欄位使用 `null`／`unavailable` 並附原因，不可填 `0`。

### 16.3 執行次數

```text
providerRequestCount
threadCount
turnCount
retryCount
repairTurnCount
fallbackRequestCount
```

即使 Provider incomplete，也必須保存它實際回傳的 usage 與狀態。

---

## 十七、Execution Time Ledger

新增：

```text
reports/JiraActivityAnalyzer_v0.3.12_execution_time_ledger.json
```

至少記錄：

- 整體開始／結束／wall-clock；
- repository inspection；
- implementation；
- typecheck；
- 每一組 targeted／regression tests；
- build；
- dist；
- artifact verification；
- Provider diagnostics；
- capacity calculation；
- warning confirmation wait；
- thread creation；
- turn／Provider execution；
- response parse；
- 117 identity validation；
- manual comparison；
- Golden HTML；
- SQLite transaction／verification；
- Debug Folder；
- documentation／ledgers；
- Git commit／tag／push verification。

每個 stage 至少包含：

```text
startedAt
endedAt
durationMs
status
commandOrOperation
notes
```

失敗／blocked 階段也要記錄真實時間與原因，不得省略。

---

## 十八、測試要求

### 18.1 必須新增或更新的 targeted tests

至少涵蓋：

1. Capacity available 且未超出：不顯示警告，正常送出一次。
2. Capacity available 且估算超出：顯示完整公式，確認後送出一次。
3. Capacity unavailable：顯示完整估算，margin／overage 為 unavailable，確認後送出一次。
4. 容量警告取消：0 request／0 thread／0 turn。
5. 不得 fallback 到固定 200,000 後硬擋。
6. v0.3.11 regression fixture 的計算明細。
7. estimator fallback 的 bytes、倍率與 rounding 顯示。
8. 相同 `CapacityCalculationSnapshot` 被 UI、manifest、debug、ledger 共用且 hash 一致。
9. double click 不重複 dispatch。
10. React re-render 不重複 dispatch。
11. 重複 IPC 不重複 dispatch。
12. timeout／route change 不 retry。
13. 相同錯誤 log dedup 且 occurrenceCount 正確。
14. 不同 run／stage／errorCode 不被錯誤 dedup。
15. AI Analysis failed run 正確出現在 Debug Folder。
16. user-action log 包含規則、Pending JSON、diagnostics、start、warning、confirm／cancel。
17. Failed staging 跨 App restart／成功 Run／Debug Folder 生成後仍存在。
18. Failed staging 不覆寫舊 Run。
19. Failed staging containment／path traversal／writable preflight。
20. Provider complete 117／117 才開啟正式 JSON／HTML／SQLite gate。
21. Provider incomplete 不產生正式 JSON／HTML／SQLite，也不 retry。
22. Invalid JSON、missing ID、duplicate ID、unexpected ID、invalid Skill ID 的 gate。
23. SQLite transaction 117 全寫或 rollback。
24. 正式 Portable metadata／Build Commit／SHA-256 evidence path。
25. Debug／報告秘密資料 redaction。

### 18.2 既有測試

- 執行 typecheck。
- 執行與 AI Analysis、Provider、SQLite、APP_ROOT、portable containment、export、debug、version ledger 相關的既有必要 regression tests。
- 不執行已明確取消的長時間 smoke test。
- 不為了通過測試而放寬 117／117、單一 request、正式保存 gate 或 secret redaction。

### 18.3 測試紀錄

每個 command 保存：

```text
exact command
start time
end time
duration
exit code
PASS／FAIL
test count
failure summary
```

---

## 十九、Build、Dist 與產物驗證

必須完成 repository 實際支援的：

```text
typecheck
targeted tests
required regression tests
build
dist
```

Dist 至少驗證既有 Windows 產物：

- Installer；
- Portable；
- win-unpacked EXE；
- app.asar（若既有流程產生）。

每個產物記錄：

```text
absolute/relative path
filename
size bytes
size MiB
SHA-256
version
build time
embedded/source Git commit
signature status
```

正式 117 筆驗證只可使用最終 Release Portable。

---

## 二十、Git、Commit、Tag 與 Push

### 20.1 Preflight

開始前記錄：

```text
repository path
branch
HEAD
remote
working tree status
ahead/behind
existing v0.3.12 tag status
```

不得刪除或覆蓋既有使用者變更。

### 20.2 建議可追溯流程

1. 完成程式、測試、版本與必要文件。
2. 測試通過後建立 source release commit。
3. 從該乾淨 source commit 執行最終 Build／Dist。
4. 使用該正式 Portable 執行真實 117 筆驗證。
5. 產生 Token ledger、Execution ledger、comparison report 與最終回報文件。
6. 建立 evidence／ledger commit。
7. 建立或更新 annotated tag `v0.3.12` 指向最終交付 HEAD。
8. Push branch 與 tag。
9. 驗證 remote branch／tag 與 Ahead／Behind。

### 20.3 產物 Commit 與最終 HEAD 對應

如果正式 Windows 產物來自 source release commit，而最終 HEAD 因帳本／報告 commit 不同，正式回報必須列出：

```text
artifactSourceCommit
finalHeadCommit
git diff --name-status <artifactSourceCommit>..<finalHeadCommit>
```

並驗證中間差異只能包含：

- reports；
- ledgers；
- validation evidence；
- changelog／純文件；
- 不影響執行檔內容的 metadata。

不得包含：

- application source；
- package／lockfile；
- Electron builder config；
- Vite／TypeScript config；
- runtime assets；
- schema／migration；
- 任何會改變封裝內容的檔案。

若 final HEAD 相較 artifact commit 含有程式或封裝相關變更，必須重新 Build／Dist／驗證，使產物對應最新 source commit，不能只在回報中解釋。

### 20.4 Push 規則

- 若程式修正、必要測試、Build、Dist 成功，即使真實 Provider 117 驗證因外部限制為 Partial，仍要 Commit 與 Push 本版修正、failed evidence 與帳本。
- 若程式實作、測試、Build 或 Dist 本身失敗，不得建立代表成功的 tag；保留可診斷狀態並回報 blocker。
- 不得 force push。
- 最終驗證目標：

```text
Ahead = 0
Behind = 0
Remote branch contains final HEAD
Remote tag v0.3.12 resolves to intended final HEAD
```

---

## 二十一、文件更新

依 repository 實際結構更新：

- `VERSION`；
- `package.json`／lockfile 中正確版本欄位；
- `CHANGELOG.md`；
- `PROJECT.md`；
- `README.md` 中與 AI Analysis／capacity warning／failed staging／debug 有關內容；
- `.env.version`／`.env.Version` 只有在格式真的需要變更時才更新；不得把真實 `.env` 納入 Git；
- v0.3.12 prompt archive；
- Token ledger；
- Execution time ledger；
- real 117 validation report；
- manual comparison report；
- packaging／artifact report。

若本版不需 ENV schema 變更，不要無故增加 `ENV_FORMAT_VERSION`。

---

## 二十二、本版明確不做

本版不得擴大為：

- 重新縮減 117 筆 Prompt／Payload；
- 修改三份技能分類規則；
- 修改 279 Skills Catalog；
- 改用其他模型；
- 新增自動分批；
- 新增逐筆分析；
- 新增 repair turn；
- 新增 retry／fallback；
- 修改 AI Nexus 核心流程；
- 重做 Golden HTML 視覺設計；
- 非必要的 SQLite schema 大改；
- 將容量警告改回硬擋；
- 自動刪除 Failed staging；
- 以測試 fixture 冒充真實 Provider 驗證；
- 以 packaged smoke 副本冒充正式 Release Portable。

若真實請求仍因 Provider 限制失敗，保留證據並排入後續版本討論；不要在 v0.3.12 自行改成分批或精簡契約。

---

## 二十三、完成判定

### 23.1 Completed

只有以下全部成立才可標示：

```text
Version = v0.3.12
Capacity hard block removed
Capacity warning shows exact calculation
Capacity unknown and exceeded cases tested
Warning confirmation dispatches exactly once
117 real input
117 real output
1 request
1 ephemeral thread
1 turn
0 retry
0 repair turn
0 fallback request
Provider terminal status = completed
JSON parse passed
Stable ID validation passed
Catalog/schema validation passed
Manual comparison has no unresolved semantic mismatch
Real formal JSON generated
Real Golden HTML generated
SQLite committed and re-verified
Failed staging retention tests passed
AI Analysis Debug Folder complete
Duplicate error logging fixed
Token ledger complete
Execution time ledger complete
Typecheck/tests/build/dist passed
Official Release Portable verified
Artifacts hashed and recorded
Commit + tag + push completed
Ahead / Behind = 0 / 0
```

### 23.2 Partial

以下任一項發生，只能標示 Partial：

- 真實 Provider 分析未執行；
- Provider incomplete／failed／cancelled；
- 不是正式 Release Portable；
- 不是 117／117；
- request／thread／turn 不符合 1／1／1；
- 發生 retry／repair／fallback；
- JSON、identity、Catalog 或 schema 驗證失敗；
- 手動版比較存在未解釋 semantic mismatch；
- 正式 JSON／Golden HTML／SQLite 任一保存失敗；
- 真實 Token usage 或必要證據無法取得且無法充分說明；
- Debug Folder 或 Failed staging 證據不完整。

即使為 Partial，仍須誠實列出：

- 已完成的程式修正；
- 真實 Provider 狀態與 usage；
- 未寫入正式資料的 gate；
- Failed staging path／hash／保留狀態；
- 測試、Build、Dist、產物與 Git 結果；
- 下一步只提出必要項目，不得宣稱 Completed。

### 23.3 Failed／Blocked

程式實作、必要測試、Build、Dist、權限、憑證安全、Git 目標或資料完整性本身出現阻斷時，清楚回報：

```text
exact blocker
stage
error code/message
what was and was not executed
whether any Provider request was sent
whether any formal data was written
recoverable evidence path
safe next action
```

---

## 二十四、最終正式回報格式

完成後只提供一份完整且可稽核的正式回報，至少依序包含：

1. 版本與 Overall Status（Completed／Partial／Failed／Blocked）。
2. 本版實際完成項目。
3. v0.3.11 根因與 v0.3.12 修正對照。
4. Capacity calculation 設計與本次真實數字：
   - capacity source；
   - estimator；
   - UTF-8 bytes；
   - estimated input；
   - output reserve；
   - reasoning reserve；
   - safety margin；
   - required total；
   - capacity；
   - margin／overage；
   - 使用者確認時間。
5. 真實 Provider 執行：
   - Provider／Model；
   - request／thread／turn／retry／repair／fallback counts；
   - Provider terminal status；
   - IDs／Trace；
   - 真實 Token usage。
6. 117 進／117 出與 Stable ID／Catalog／schema 驗證。
7. 軟體版與手動版 Skill、EXCLUDED、Evidence、Negative Checks 比對結果。
8. 正式 JSON、Golden HTML、SQLite 寫入與 hash／count 驗證。
9. Failed staging 與 Debug Folder 內容、路徑、hash、永久保存狀態。
10. 日誌風暴修正驗證。
11. Tests：每個 command、結果與時間。
12. Build／Dist：結果與時間。
13. Installer／Portable／win-unpacked／ASAR 的 size、SHA-256、Commit、Build Time。
14. Token ledger 與 Execution time ledger。
15. Git：branch、artifact source commit、final HEAD、兩者差異、remote、tag、push、Ahead／Behind。
16. 未完成項目、風險與下一步。

若某項沒有執行或不可取得，必須明確寫 `Not executed`／`Unavailable` 與原因，不得省略或用推估值替代真實值。

---

## 二十五、立即開始

現在開始：

1. 檢查 repository、Git 與 v0.3.11 實作／證據。
2. 建立執行時間追蹤。
3. 實作 v0.3.12。
4. 撰寫並執行必要測試。
5. Build 與 Dist。
6. 驗證正式 Release Portable。
7. 真正執行一次 117 筆單一請求分析。
8. 完成 117／117、手動版、Golden HTML、SQLite、Debug、Failed staging、Token／時間帳驗證。
9. 更新文件與正式回報。
10. Commit、Tag、Push 並驗證 remote。

除非發生本 Prompt 定義的真正 blocker，否則一路完成，不要只停在修改程式或產生測試。
