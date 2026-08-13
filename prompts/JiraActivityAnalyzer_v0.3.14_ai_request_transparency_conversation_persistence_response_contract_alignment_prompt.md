# JiraActivityAnalyzer v0.3.14 正式完整 Codex Prompt

你現在要在既有 `JiraActivityAnalyzer` repository 上，完整實作、驗證、建置、封裝、記錄、Commit、Tag 與 Push：

> **v0.3.14 — AI Request Transparency, Conversation Persistence & Response Contract Alignment**

中文主題：

> **AI 請求透明化、ChatGPT 對話即時保存、回覆契約一致化**

本版是 v0.3.13 真實 117 筆 Provider Run 完成後確認的集中修復與可稽核性版本。v0.3.13 已成功修復 v0.3.12 的 Strict Structured Output Schema 拒絕，Provider 已接受並完成單一 Thread／Turn；但 App 在回覆到達後，因 Provider wire schema、分析 Prompt、本機 semantic validator、既有 POC 契約與正式保存格式不一致，將 `negativeChecks: []` 視為整批不合法，並且無法正確表達 `CATALOG_DETAIL_MISSING`，最後拒絕整批結果。

本版必須同時完成三項不可拆開的工作：

1. 將每次 AI Analysis 明確建模為「1 個待分析 JSON＋3 個 Markdown 規則＋可見分析需求」的不可變 Request Package，並如實顯示 Provider 實際採用 Native file input 或 Inline exact-content blocks。
2. 在 `AI 分析 → 分析工作區` 按下「使用 ChatGPT 分析 → 開始分析」後，即時顯示軟體與 ChatGPT 的完整可見對話，並依本機時間為每次有效開始命令建立獨立、不可覆寫、可中斷復原的本機 Run 紀錄。
3. 將 Common Rules、Skill Catalog、Rule Set Manifest／第三份規則、analysis instruction、Strict Provider schema、parser、semantic validator、正式 JSON、Golden HTML 與 SQLite 對齊成同一份 Canonical Response Contract，修正 `negativeChecks` 與 `CATALOG_DETAIL_MISSING` 的語意衝突。

不要只對 `negativeChecks` 加一個特例；不要只新增 UI 假畫面；不要只保存摘要；不要把 parser 轉換後資料偽裝成原始 Markdown；不要改成分批／逐筆分析；不要自動建立 repair／retry／fallback Turn；不要用 fixture、舊 POC analyzed file 或手動版結果冒充真實 Provider 成功。

---

## 一、執行原則

1. 先完整讀取並遵守 repository 內的 `AGENTS.md`、`AI_RULES.md`、`PROJECT.md`、`README.md`、`CHANGELOG.md`、`VERSION`、相關 prompts、tests、reports、v0.3.13 Real 117 evidence、Failed staging、Debug Folder 與 Git 狀態。
2. 先從 v0.3.13 實際原始碼與真實證據還原：輸入檔如何讀取、三份 MD 是否保留原文、request assembly 如何組裝、Provider adapter 實際送出什麼、stream 如何回傳、response 如何重組、validator 為何拒絕，以及 Debug response 為何截成 8,192 bytes。不得只依本 Prompt 猜測程式檔名、IPC、App Server envelope 或事件格式。
3. 保留所有使用者既有修改、未追蹤資料及不屬於本版的變更；不得 `git reset --hard`、`git clean`、force push、移動、刪除或覆寫不明檔案。
4. 除非發生本 Prompt 定義的真正 blocker，否則一路完成實作、targeted tests、必要 regressions、Build、Dist、正式 Portable 驗證、一次 Real 117、Debug／Run evidence、Token 帳、時間帳、報告、Commit、annotated Tag、Push 與 remote 核對。
5. 不得偽造檔案附件、Provider request、對話內容、stream chunk、Thread、Turn、Token usage、117 筆輸出、Schema／semantic validation、JSON、Golden HTML、SQLite、測試、封裝、Git 或時間結果。
6. 所有秘密只可由既有 `.env` 或正式 ChatGPT 登入流程載入。不得將 `.env`、ChatGPT Cookie、authentication state、Authorization Header、access／refresh token、Jira Token、AI Nexus Token、`auth.json` 或可重建登入狀態的資料寫入 Git、Run archive、Debug Folder、報告或正式輸出。
7. 真實待分析 JSON、三份公司規則、Provider request／response、conversation log、SQLite、Debug／Failed staging 只可保存在 `APP_ROOT` 的使用者本機資料區，不得加入 Git。
8. 不執行長時間 smoke test。只執行本版必要 targeted tests、必要 regressions、Build、Dist、有限 packaged renderer／Portable 啟動驗證，以及在 authentication 可用時的一次正式 Real 117。
9. 真實 Provider 若回傳 incomplete、refusal、external failure 或其他非程式缺陷，版本可為 `Partial`；但程式修正、測試、Build、Dist、帳本、報告、Commit 與 Push仍須在安全可行時完成。
10. 若程式實作、request package integrity、conversation durability、Strict Schema preflight、必要測試、Build 或 Dist 失敗，不得建立代表成功的 tag，不得宣稱 Completed。
11. 每個 command、測試、Build、Dist、Provider、artifact、Git 階段都要記錄本機開始／結束時間、UTC 時間、duration、結果與錯誤。
12. 本 Prompt 的 OpenAI Structured Outputs／file input 參考只用於約束實際功能，不授權將現有 ChatGPT authentication 架構改回 OpenAI API、要求 OpenAI API Key、上傳資料到 vector store 或新增另一套 Provider。

---

## 二、版本、主題與分支

Target Version：

```text
v0.3.14
```

Theme：

```text
AI Request Transparency, Conversation Persistence & Response Contract Alignment
```

建議工作分支：

```text
feat/v0.3.14-ai-request-transparency-conversation-persistence-response-contract-alignment
```

正式 tag：

```text
v0.3.14
```

要求：

- 從包含完整 v0.3.13 的最新安全 remote commit 開始。
- 不覆寫或移動既有 annotated tag `v0.3.13`。
- 不建立 GitHub Release，除非 repository 既有規則明確要求且已具權限。
- 不 force push。
- 不把 release binaries、真實公司資料、Provider response、Run archive、Debug Folder、Failed staging 或秘密加入 Git。

---

## 三、v0.3.13 真實失敗基線

實作前必須從實際 reports、Run manifest、event log、Failed staging、Debug Folder、操作影片與程式碼核對本節。若原始證據比本 Prompt 更精確，以原始證據為準，但不得省略差異說明。

### 3.1 v0.3.12 問題已修復

v0.3.13 已完成並通過：

- Strict Structured Output Schema preflight；
- `scoreComponents[]` strict-safe contract；
- Schema name／SHA-256／0 findings；
- Provider dispatch；
- Thread 建立；
- Turn accepted；
- Turn completed；
- 全域重複錯誤日誌修正。

因此本版不得將 v0.3.13 失敗誤判回 v0.3.12 的 `invalid_json_schema`，也不得回退 `scoreComponents[]`。

### 3.2 v0.3.13 真實 Run

至少核對以下已知 Run；以實際 evidence 為準：

```text
Run ID: analysis_d4b0bbcd-34bb-4721-a5ff-03f238e950b6
Started: 2026-08-12 19:42:45 local time
Duration: approximately 461,987 ms
Failed stage: validating_response
Error: AI_RESPONSE_INVALID
Message: Every record and candidate requires auditable negativeChecks.
```

已知 lifecycle：

```text
Provider dispatch         = 1
Thread created            = 1
Turn start attempt        = 1
Turn accepted             = 1
Turn completed            = 1
Retry                     = 0
Repair                    = 0
Fallback                  = 0
Provider terminal status  = completed
```

已知真實 usage：

```text
input tokens      = 144,667
output tokens     = 24,984
reasoning tokens  = 590
total tokens      = 169,651
```

不得把估算值寫成上述 Provider usage；實作前應從原始 provider event／usage evidence 驗證實際欄位。

### 3.3 直接失敗點

Provider 已回傳可解析的 Structured Output。已知第一筆類似：

```json
{
  "recordIndex": 0,
  "classificationStatus": "UNKNOWN",
  "dispositionReason": "Catalog detail missing",
  "analyses": [],
  "negativeChecks": []
}
```

Provider wire schema 允許空陣列，但 local semantic validator 以全域規則要求：

```text
Every record and candidate requires auditable negativeChecks.
```

因此形成契約衝突：

| 層級 | `negativeChecks: []` |
|---|---|
| Provider Strict Schema | 合法 |
| Parser | 可解析 |
| Local Semantic Validator | 一律拒絕 |
| Formal Save Gate | 整批拒絕 |

本版必須改成 status-aware semantic validation，不得只把 Schema 強制 `minItems: 1`，也不得只放寬 validator 而不更新 Prompt、examples、JSON／HTML／SQLite contract。

### 3.4 深層契約問題

三份正式規則與既有 POC 語意允許「找到候選 Skill，但 Catalog detail 尚未完成」。v0.3.13 wire contract 只能使用：

```text
MATCHED
EXCLUDED
UNKNOWN
```

無法直接表達：

```text
CATALOG_DETAIL_MISSING
NEEDS_REVIEW
```

模型因此把候選 Skill 壓成：

```text
UNKNOWN
analyses = []
dispositionReason = Catalog detail missing
```

本版必須保留候選 Skill，不得把 `CATALOG_DETAIL_MISSING` 等同完全未知。

### 3.5 Catalog 基線

已知正式 Catalog 約 279 Skills，多數為：

```json
{
  "catalogStatus": "review-draft",
  "detailDescription": null
}
```

必須從原始 `Skill_Catalog_v0.3.0` 核對；不得假設 parser 漏讀，也不得由程式或模型虛構缺少的 `detail_description`。

### 3.6 Evidence 截斷問題

v0.3.13 Debug 中的 `provider-visible-response.json.gz` 解壓後已知只有 8,192 bytes，結尾停在半個 JSON，且與 Run manifest 記錄的完整 response SHA-256 不一致。

已知值：

```text
Run manifest full response SHA-256:
1c83daa226e32f1cb973d5fabdae35de8302582e4b1914cdfa97bf529c2f7ce3

Debug attachment content SHA-256:
5ff6253e584a1e7f4f64a87009a0a5a2c309259e83aa4873102eb8bf9dc83697

Debug visible response bytes:
8,192
```

本版必須定位截斷來源，不得只提高 UI preview limit；canonical raw response、stream events、Debug copy 與 manifest Hash 必須可對應。

### 3.7 已修復項目不得回歸

v0.3.13 已確認相同主要錯誤：

```text
AI event log     = 1
Global debug log = 1
```

v0.3.12 的約 160 次日誌風暴未重現。本版必須保留 dedup regression。

---

## 四、本版核心目標

1. 建立 `AiAnalysisRequestPackage` 單一 domain model。
2. Request Package 固定包含 1 個待分析 JSON、3 個 Markdown 規則、固定核心分析需求、選填使用者附加說明、Strict Output Schema 及完整 manifest。
3. 原始檔案在 Run 啟動時建立 immutable snapshot，保存原始／snapshot bytes、SHA-256、大小、編碼與語意角色。
4. UI 顯示 Provider 實際傳送模式：`NATIVE_FILE_INPUT` 或 `INLINE_EXACT_CONTENT`；不得偽裝。
5. Native file input 只有在現有 ChatGPT Provider／App Server 實際支援且測試可證明時才可使用。
6. Native file input 不可用時，使用保留原始檔名、順序、邊界與完整 UTF-8 內容的 Inline exact-content blocks；不得使用 parser 摘要取代三份 Markdown 原文。
7. 固定核心分析需求可見、唯讀、版本化；使用者可填選填附加說明，但不得覆寫核心輸出契約。
8. 每次有效開始命令先建立唯一 Run，再允許 Provider dispatch。
9. 在分析工作區即時顯示軟體訊息、ChatGPT 可見回覆及 App／Provider 系統事件。
10. 每個 outgoing message、incoming stream event、state transition、usage、validation 與 artifact event 立即追加保存到本機 append-only log。
11. 每個 Run 依本機時間＋毫秒＋Run ID 建立獨立目錄；永不自動刪除，只能由使用者手動刪除。
12. App restart 後可列出、載入與查看歷史 Run；非 terminal Run 必須標為 `Interrupted` 或依 durable evidence 恢復正確 terminal 狀態。
13. 完整保存 Provider stream 與重組後 raw response，移除 8,192-byte evidence 截斷。
14. 將 Provider-returned、parsed、semantic-valid、formally-committed counts 分開。
15. 恢復 `CATALOG_DETAIL_MISSING`／`NEEDS_REVIEW` 等必要語意，並保留候選 Skill。
16. 建立 status-aware `negativeChecks` semantic matrix，不再全域要求每個 array 非空。
17. 讓 Common Rules、Catalog、第三份規則／Manifest、Prompt、Schema、parser、validator、JSON、HTML、SQLite 使用同一 Canonical Response Contract。
18. 保留單一 117 payload、單一 Thread、單一 Turn、0 retry／repair／fallback。
19. 保留 Capacity warn-only、Completed-only formal gate、Failed staging 永久保存、APP_ROOT containment、secret masking 與 error dedup。
20. 使用正式 v0.3.14 Release Portable，在 authentication 可用時只執行一次 Real 117；成功才寫正式 JSON、Golden HTML、SQLite。

---

## 五、權威輸入與 Request Package

### 5.1 五個邏輯輸入

每次正式分析的權威輸入固定為：

```text
1 × Pending Analysis JSON
3 × Markdown Rule Documents
1 × Analysis Instruction
```

三份 Markdown 的實際檔名、suffix 與路徑必須由正式使用者選取／既有 rules-folder 設定及 manifest 驗證，不得只靠 `(1)`、`(2)` 或固定檔名猜測。預期語意角色至少為：

```text
COMMON_RULES
SKILL_CATALOG
RULE_SET_MANIFEST_OR_SCORING_RULES
```

若 repository 實際第三份文件名稱為 `Skill_Analysis_Rule_Set_Manifest.md`，沿用真實名稱；不要為迎合本 Prompt 重新命名使用者檔案。

### 5.2 Canonical Request Package model

建立單一 typed contract，概念至少包含：

```ts
type RequestDocumentRole =
  | "PENDING_ANALYSIS_JSON"
  | "COMMON_RULES"
  | "SKILL_CATALOG"
  | "RULE_SET_MANIFEST_OR_SCORING_RULES"
  | "ANALYSIS_INSTRUCTION"
  | "OUTPUT_SCHEMA";

type ProviderDeliveryMode =
  | "NATIVE_FILE_INPUT"
  | "INLINE_EXACT_CONTENT";

interface RequestPackageDocument {
  role: RequestDocumentRole;
  originalFileName: string;
  originalAbsolutePath: string | null;
  snapshotRelativePath: string;
  mimeType: string;
  encoding: "utf-8" | "binary";
  originalByteLength: number;
  snapshotByteLength: number;
  originalSha256: string;
  snapshotSha256: string;
  byteIdentical: boolean;
  sourceKind: "USER_FILE" | "APP_GENERATED";
}

interface AiAnalysisRequestPackage {
  requestPackageVersion: string;
  runId: string;
  createdAtLocal: string;
  createdAtUtc: string;
  localTimeZone: string;
  deliveryMode: ProviderDeliveryMode;
  inputRecordCount: number;
  documents: RequestPackageDocument[];
  coreInstructionSha256: string;
  supplementalInstructionSha256: string | null;
  outputSchemaSha256: string;
  finalProviderPayloadSha256: string;
}
```

實際欄位依 repo architecture 調整，但不得降低 identity、bytes、Hash、delivery mode 與可重現性。

### 5.3 Run 內不可變快照

每次有效開始命令都先建立：

```text
request-package/
  pending-analysis.json
  common-rules.md
  skill-catalog.md
  rule-set-manifest-or-scoring-rules.md
  analysis-instruction.md
  output-schema.json
  request-package-manifest.json
  final-provider-request-sanitized.json
  final-provider-payload.sha256
```

要求：

- Snapshot 成功且 Hash 完成後才可 dispatch。
- Snapshot 後原始來源檔即使被修改，也不得改變該 Run。
- Snapshot bytes 與真正送出內容必須可核對。
- JSON 的 record count、Stable ID set、source hash 必須在 snapshot 階段固定。
- Markdown 原文不得被 parser normalized output 取代。
- Parser 派生資料若仍供 local validation／UI 使用，另存 `derived/`，清楚標為 non-authoritative derivative。
- Request Package 建立失敗時不得建立 Thread；Run 保留並標為 `RequestPackageFailed`。

### 5.4 原始路徑與安全

Run manifest 可在使用者本機完整 archive 中記錄原始絕對路徑，但任何可分享 report／Git 文件必須避免洩漏使用者名稱或不必要路徑。Credential、cookie、Authorization 永遠不得進入 Request Package。

---

## 六、Provider 傳送模式

四項設計決策之一已正式採納：

> **接受 Native file input 或完整原文 Inline，但 UI、Run manifest、Debug evidence 必須顯示實際方式，禁止偽裝。**

公開 API 的技術參考：

- <https://developers.openai.com/api/docs/guides/file-inputs>

官方文件說明 `.json`、`.md` 等文字檔可作為 file input；但本專案使用既有 ChatGPT Provider／bundled App Server，是否支援仍必須由其實際 capability 與 outgoing request 證據決定，不得因公開 API 支援就假設目前 Provider 一定支援。

### 6.1 Native file input

只有同時滿足以下條件才可使用：

1. 目前 bundled ChatGPT Provider／App Server 正式支援該 input 類型。
2. 實際 outgoing request 可證明四個 user files 以 file input／attachment semantics 傳送。
3. 1 JSON＋3 MD 均被同一個 user turn 引用。
4. Provider acknowledgement／request evidence 可對應每個檔案名稱、bytes 或 content hash／file reference。
5. 不需要新增 OpenAI API Key、不切換 Provider、不建立 vector store／file search knowledge base。
6. 不建立超出本次分析所需的持久遠端檔案；若 Provider 自身管理暫存生命週期，記錄可取得的 reference，不得假稱已刪除。

若上述任一項無法證明，不得在 UI 顯示「已上傳附件」。

### 6.2 Inline exact-content blocks

Native file input 不可用時，固定採用：

```text
deliveryMode = INLINE_EXACT_CONTENT
```

Final user content 必須有 deterministic 邊界，例如：

```text
BEGIN_FILE role=PENDING_ANALYSIS_JSON filename="..." sha256="..." bytes="..."
<完整原文>
END_FILE role=PENDING_ANALYSIS_JSON
```

對全部 1 JSON＋3 MD 依固定順序組裝，再附固定核心需求與選填附加說明。

要求：

- 不可只送 parser 摘要、279 Skill normalized list 或縮減規則來冒充原文。
- 若為容量與既有設計需要同時送 derived compact payload，必須保留原文是否也送出的真實狀態，且 UI 明確列出每個 model-visible block。
- 不可重複傳送同一套規則。
- 不可在 inline 組裝時默默截斷、清除空白、改行尾、排序 JSON key 或重新序列化後仍宣稱是 original bytes。
- 若為傳送需要 normalization，必須另記 `transformationName`、before／after Hash、byte count 及可逆性，並將 delivery label 改為 transformed content，不得標示 exact。

### 6.3 UI 必顯示

在 dispatch 前與 Run 中顯示：

```text
Provider delivery mode
Files / blocks visible to ChatGPT
Document role
Original filename
Bytes
SHA-256
Original or derived
Complete or truncated
Final provider payload bytes
Final provider payload SHA-256
```

任何 `truncated = true` 都必須阻止正式 Real 117 dispatch。

---

## 七、分析需求設計

四項設計決策之二已正式採納：

> **採固定核心需求＋選填使用者附加說明。**

### 7.1 固定核心需求

新增可版本化、可顯示、可保存、唯讀的 core analysis instruction。不得只存在於隱藏程式字串。

核心需求至少清楚表達：

1. 必須使用同一 Request Package 中的三份規則。
2. 必須分析 Pending JSON 的全部 records。
3. 不得省略、合併、重新排序、重編 identity 或創造 records。
4. 必須保留 `recordIndex`、Stable ID、activity／evidence identity 與 source hash。
5. 必須使用 exact Catalog Skill ID，不得猜測不存在 ID。
6. Catalog detail 缺少時，不得虛構 detail，也不得丟掉候選 Skill。
7. `CATALOG_DETAIL_MISSING` 必須保留 candidate identity、reason、evidence 與對應 audit check。
8. `negativeChecks` 依 status-aware matrix 輸出，不是一律空，也不是所有層級一律硬塞假資料。
9. 必須回傳與輸入數量相同的 records。
10. 必須符合本次 Strict Output Schema。

Core instruction 必須有：

```text
instructionName
instructionVersion
UTF-8 bytes
SHA-256
source file / source module
```

### 7.2 使用者附加說明

UI 提供選填文字欄位：

```text
本次分析附加說明（選填）
```

要求：

- 預設空白。
- 顯示字數／UTF-8 bytes。
- 隨 Request Package snapshot 保存。
- 不得覆寫固定核心需求、Schema、Catalog identity 或安全規則。
- App 不可把附加說明當作第二個 Turn。
- 若內容與核心契約矛盾，以固定核心需求為準，UI 在 dispatch 前顯示衝突警告或阻止明顯破壞契約的指令。

### 7.3 Request Preview

按下開始前，分析工作區必須讓使用者看見：

- 1 JSON＋3 MD；
- 固定核心需求完整內容；
- 選填附加說明；
- delivery mode；
- Output Schema name／version／SHA-256／preflight status；
- 117 records／279 Skills 等實際驗證值；
- capacity calculation；
- 本次將建立 1 Thread／1 Turn／0 retry。

不得要求使用者打開 Debug Folder 才能知道軟體送了什麼。

---

## 八、Run identity、本機時間與路徑

四項設計決策之四已正式採納：

> **歷史 Run 永不自動刪除，只允許使用者手動刪除。**

### 8.1 每次有效開始命令

每次 main process 接受一個新的「開始分析」命令時，必須先建立唯一 Run，再進行任何 preflight／Provider action。

建議 Run ID：

```text
analysis_<UUID>
```

目錄名稱：

```text
AI-Analysis-YYYYMMDD-HHmmss-SSS_<runId>
```

`YYYYMMDD-HHmmss-SSS` 使用操作者當下 OS 本機時間，不可硬編碼 Taipei。Manifest 同時記錄：

```text
createdAtLocal     = ISO 8601 with UTC offset
createdAtUtc       = ISO 8601 Z
localTimeZone      = OS-resolved IANA zone or explicit fallback
localOffsetMinutes = actual offset at run time
```

### 8.2 Canonical root

固定使用：

```text
<APP_ROOT>/exports/ai-analysis/runs/YYYY/MM/
  AI-Analysis-YYYYMMDD-HHmmss-SSS_<runId>/
```

若 repository 已有單一 canonical `ai-analysis` 根目錄，整合到既有架構，不得另外建立衝突根。所有實際資料仍須在 `APP_ROOT` 下。

禁止 fallback 到：

- `%LOCALAPPDATA%`；
- `%APPDATA%`；
- 系統 Temp；
- process CWD；
- source repo；
- `release/win-unpacked` 內部；
- 任何未顯示給使用者的隱藏位置。

### 8.3 Run directory

每個 Run 至少包含：

```text
AI-Analysis-..._<runId>/
  run-manifest.json
  conversation.jsonl
  conversation.md
  provider-events.jsonl
  provider-stream.jsonl
  provider-response.raw.json
  provider-response.canonical.json
  provider-response.raw.sha256
  request-package/
  validation/
  token-usage.json
  execution-time.json
  staging/
  output/
```

失敗時可在同一 Run 下保留 `failed-run-manifest.json`；若既有 canonical failed-staging 路徑仍需要 index／compatibility link，建立明確 reference，不得複製出互相不一致的兩份權威資料。

### 8.4 命名碰撞與 double click

- 毫秒相同仍以 UUID 保證唯一。
- Active Run 期間開始按鈕 disabled。
- duplicate IPC／double click／renderer remount 必須由 main process idempotency guard 收斂到同一 active Run，不建立第二個 Provider dispatch。
- 被 guard 拒絕的 duplicate command 記錄為 current Run system event，不得偽裝成另一個分析 Run。
- terminal 後使用者再次有效按下開始，建立新的 Run、時間目錄、conversation 與 staging，永不覆寫舊 Run。

### 8.5 永久保留與手動刪除

- App 啟動、成功 Run、失敗 Run、Debug Folder、版本升級、Build／Dist 均不得自動清除歷史 Run。
- 不新增自動 retention days／容量清除策略。
- 使用者手動刪除前，UI 顯示 Run ID、本機時間、狀態、大小、input count、formal output／SQLite relation。
- 刪除動作必須二次確認，精確刪除單一已解析 Run path，通過 APP_ROOT containment 與 traversal 防護。
- 不允許用 unresolved glob、父目錄、`APP_ROOT` root 或廣泛 recursive target 刪除。
- 刪除 formal data relation 不等於刪除 SQLite records；若未實作 unlink workflow，清楚提示只刪本機 Run archive，不動正式 DB。

---

## 九、對話 UI

四項設計決策之三已正式採納：

> **v0.3.14 對話區是唯讀執行紀錄，不開放自由追問，不建立第二個 Turn。**

### 9.1 顯示位置

操作路徑：

```text
AI 分析
→ 分析工作區
→ 使用 ChatGPT 分析
→ 開始分析
```

按下開始後，在同一分析工作區下方立即展開：

```text
ChatGPT 對話紀錄
```

不得要求切到 Debug page 才能查看。

### 9.2 三類訊息

UI 必須視覺區分：

```text
SOFTWARE_MESSAGE   軟體真正送給 ChatGPT 的可見訊息
CHATGPT_MESSAGE    ChatGPT／Provider 回傳的可見內容
SYSTEM_EVENT       App／Provider lifecycle、usage、validation、save 狀態
```

不得把 system event 顯示成 ChatGPT 說的話；不得把 App 的推測顯示成 Provider 原文。

### 9.3 ChatGPT-visible 與 App-only

對話頁至少提供篩選：

- 全部；
- ChatGPT 可見內容；
- 軟體訊息；
- ChatGPT 回覆；
- 系統事件；
- 錯誤／警告。

Structured Output Schema、delivery metadata、capacity snapshot 不是自然語言對話，但屬 request configuration，必須可從對話頁展開查看或開啟對應本機證據。

### 9.4 UI 功能

至少包含：

- 串流即時追加；
- 自動捲動開關；
- 暫停自動捲動但不暫停保存；
- 顯示本機 timestamp；
- 顯示 role／event type；
- 複製單一訊息；
- 複製完整可見對話；
- 匯出／開啟 `conversation.md`；
- 開啟本機 Run 資料夾；
- 顯示 Run ID、status、elapsed time；
- 顯示 delivery mode；
- 顯示 Provider／Thread／Turn IDs；
- 顯示 estimated／actual Token；
- 顯示 Provider returned／parsed／semantic-valid／committed counts；
- App restart 後載入歷史 Run。

### 9.5 不可顯示或偽造

- 不得顯示 credential／cookie／Authorization。
- 不得聲稱能取得 Provider 未公開的 hidden reasoning／chain of thought。
- `reasoning_tokens` 可顯示數量，但不是可還原推理文字。
- 不得由 App 自行產生看似 ChatGPT 原文的摘要並標記為 ChatGPT。
- Preview 可以折疊／虛擬化，但本機 canonical conversation／response 不得截斷。

---

## 十、Conversation persistence contract

### 10.1 Append-only canonical log

`conversation.jsonl` 是每個 Run 的 canonical、append-only、machine-readable 對話與狀態紀錄。

每列至少包含：

```ts
interface ConversationEvent {
  schemaVersion: string;
  runId: string;
  sequence: number;
  eventId: string;
  messageId: string | null;
  parentMessageId: string | null;
  role: "software" | "assistant" | "system";
  eventType: string;
  visibleToProvider: boolean;
  localTimestamp: string;
  utcTimestamp: string;
  contentType: "text" | "json" | "metadata" | "error";
  content: string | object | null;
  contentByteLength: number;
  contentSha256: string | null;
  providerRequestId: string | null;
  threadId: string | null;
  turnId: string | null;
}
```

實際欄位可增加，不得降低 sequence、role、visibility、time、content identity 與 Provider correlation。

### 10.2 即時保存定義

不得等 Provider completed 才一次寫檔。正式要求：

1. Run 建立後立即寫 `run_created`。
2. Outgoing instruction／file metadata 在 dispatch 前寫入。
3. 每個 Provider stream event 收到後依原始順序追加到 `provider-stream.jsonl`，並將對應可見 delta 追加到 `conversation.jsonl`。
4. 每個 lifecycle、usage、validation、artifact、error event 即時追加。
5. 使用單一序列化 writer queue 保證 sequence 單調且不交錯破壞 JSONL。
6. 每個 append 必須處理 partial write；錯誤不得默默忽略。
7. 至少在 outgoing dispatch 前、message boundary、terminal state、validation完成及 App normal shutdown 執行 durable flush。
8. 不可因 UI 自動捲動暫停而停止本機保存。
9. 不可因 renderer unmount／route change 而中斷 main-process persistence。
10. persistence 失敗時立即停止 formal pipeline、標記 `AI_CONVERSATION_PERSISTENCE_FAILED`，不得繼續假裝可稽核。

### 10.3 Provider raw stream

`provider-stream.jsonl` 保存 Provider adapter 能取得的完整原始事件，至少包含：

```text
sequence
receivedAtLocal / receivedAtUtc
providerEventType
request / thread / turn correlation
raw payload or exact sanitized payload
payload bytes
payload SHA-256
```

Credential／auth header 必須在進入 writer 前排除。若 raw provider event 可能包含敏感 auth material，先做 deterministic field-level redaction，並記錄 redaction policy version；不得用固定 8,192-byte preview 取代 raw event evidence。

### 10.4 `conversation.md`

- 由 canonical JSONL deterministic 生成。
- 可在完整 message boundary／terminal state 更新，不需每個 token 重寫整份檔案。
- 包含 Run summary、Request Package、delivery mode、完整可見 messages、system events、usage、validation、artifact status。
- 不作為唯一 canonical evidence。
- Hash 與來源 conversation event range 必須記錄。

### 10.5 Crash／restart recovery

App 啟動時掃描 canonical runs index 或 manifest：

- Terminal manifest 正常載入。
- 非 terminal 且無 active main-process execution 的 Run 標為 `Interrupted`。
- 不刪除 partial JSONL／stream／staging。
- 以最後一個完整 JSONL sequence 截止；尾端破損 partial line 移到 recovery evidence，不可靜默忽略。
- 不自動重送 Provider request。
- 不自動把 Interrupted 改成 Completed。
- UI 可查看已保存的全部內容與最後成功 sequence。

### 10.6 Secret policy

所有 conversation／request／stream／manifest writer 必須共用 main-process secret redaction／exclusion gate。至少排除：

```text
Authorization
Cookie / Set-Cookie
access_token / refresh_token
ChatGPT auth state
Jira token
AI Nexus token
.env content
auth.json content
```

不得只靠 UI masking；磁碟內容本身不得含 secret。

---

## 十一、Canonical Response Contract

### 11.1 單一來源

建立或整理一份單一 canonical response contract，並由它產生或約束：

- Provider Strict Structured Output Schema；
- TypeScript wire types；
- runtime parser；
- semantic validator；
- analyzed JSON writer；
- Golden HTML reader／renderer；
- SQLite mapper；
- comparison tool；
- tests／fixtures；
- UI counts／status labels。

不得再讓三份規則、Prompt 字串、TypeScript interface、JSON Schema、parser、validator 與 writers 各自維護互相矛盾的 enum／required／empty-array 規則。

### 11.2 Record 與 Candidate 狀態

本版 canonical 語意至少支援：

```ts
type RecordClassificationStatus =
  | "MATCHED"
  | "EXCLUDED"
  | "CATALOG_DETAIL_MISSING"
  | "NEEDS_REVIEW"
  | "UNKNOWN";

type CandidateClassificationStatus =
  | "MATCHED"
  | "EXCLUDED"
  | "CATALOG_DETAIL_MISSING"
  | "NEEDS_REVIEW";
```

若 repository 既有欄位名稱不同，可用清楚的 canonical adapter，但輸出 JSON、HTML、SQLite 與 UI 不得再次把 `CATALOG_DETAIL_MISSING` 壓成完全 `UNKNOWN`。

### 11.3 建議 canonical wire contract

至少保留以下語意；可增加 repository 已有必要欄位，但不得刪除 identity／audit 欄位：

```ts
interface AnalysisRecordResult {
  recordIndex: number;
  sourceRecordStableId: string;
  activityEventId: string;
  evidenceId: string;
  sourceContentHash: string;
  classificationStatus: RecordClassificationStatus;
  reviewStatus: "PENDING_REVIEW";
  reviewAttention: "STANDARD_REVIEW" | "NEEDS_REVIEW";
  dispositionReason: string;
  exclusionReason: string | null;
  unknownReason: string | null;
  reviewReason: string | null;
  matchedRuleIds: string[];
  negativeChecks: NegativeCheck[];
  analyses: SkillCandidate[];
}

interface SkillCandidate {
  skillId: string;
  candidateStatus: CandidateClassificationStatus;
  score: number;
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  statusReason: string;
  catalogDetailAvailable: boolean;
  scoreComponents: ScoreComponent[];
  positiveSignals: string[];
  positiveEvidenceRefs: string[];
  negativeChecks: NegativeCheck[];
  negativeEvidenceRefs: string[];
  rejectedNearSkills: RejectedNearSkill[];
  evidenceQuote: string;
}

interface ScoreComponent {
  componentKey: string;
  score: number;
  explanation: string | null;
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

`scoreComponents[]` 維持 v0.3.13 strict-safe array，不得回退任意-key dictionary。

### 11.4 `CATALOG_DETAIL_MISSING` 規則

若 evidence 足以辨識一個或多個候選 Skill，但該 Skill 的正式 Catalog detail 缺少：

```text
record.classificationStatus = CATALOG_DETAIL_MISSING
record.analyses.length >= 1
candidate.candidateStatus = CATALOG_DETAIL_MISSING
candidate.skillId = Catalog 中存在的 exact Skill ID
candidate.catalogDetailAvailable = false
candidate.statusReason = 明確說明缺少 detail_description
```

每個這類 candidate 必須包含可稽核 check，例如語意等價於：

```json
{
  "ruleId": "CATALOG_DETAIL_REQUIRED",
  "passed": false,
  "detail": "Skill Catalog does not provide an approved detail description.",
  "evidenceRefs": ["..."]
}
```

要求：

- 不得虛構 Catalog detail。
- 不得因 detail 缺失刪掉候選 Skill。
- 不得改成 `UNKNOWN + analyses: []`。
- `CATALOG_DETAIL_MISSING` 預設 `reviewAttention = NEEDS_REVIEW`。
- 正式 JSON／HTML／SQLite 必須保留這個狀態與 candidate。

### 11.5 `NEEDS_REVIEW` 規則

Evidence 有合理候選，但無法安全完成正式 MATCHED／EXCLUDED／CATALOG_DETAIL_MISSING 判定時：

```text
classificationStatus = NEEDS_REVIEW
reviewAttention = NEEDS_REVIEW
reviewReason = non-empty
analyses.length >= 1 when candidates exist
```

不得把 `NEEDS_REVIEW` 當成 Provider failure；它是合法業務結果，但仍必須具備 identity、reason、evidence 與 auditability。

### 11.6 `UNKNOWN` 邊界

`UNKNOWN` 只表示沒有足夠證據建立可靠候選 Skill，而不是 Catalog detail 缺失。

要求：

```text
classificationStatus = UNKNOWN
analyses.length = 0
unknownReason = non-empty
dispositionReason = non-empty
negativeChecks.length >= 1
```

至少一個 record-level check 必須說明哪些必要 evidence／rule 未滿足；不得只輸出空陣列與籠統的 `Unknown`。

### 11.7 `MATCHED`／`EXCLUDED` 邊界

`MATCHED`：

```text
analyses.length >= 1
至少一個 candidateStatus = MATCHED
每個 MATCHED candidate 具正面 evidence 與 matched rule
record-level negativeChecks 可為 []，若沒有適用的 record-level negative rule
MATCHED candidate negativeChecks 可為 []，若沒有適用的負面檢查
```

空 `negativeChecks` 在 MATCHED 下合法，但不得以空陣列取代本應存在的排除／Catalog／review audit。

`EXCLUDED`：

```text
analyses.length = 0，除非 repository 已正式採 candidate-level EXCLUDED 且三份規則支持
exclusionReason = non-empty
negativeChecks.length >= 1
至少一個 check 明確指出排除規則與 evidence
```

若採 candidate-level `EXCLUDED`，必須由原始規則與既有 POC 契約證明需要；不得為填 schema 隨意建立假 candidate。

### 11.8 Status-aware semantic matrix

將條件集中為單一 machine-readable matrix／validator policy，不得散落在 UI 與 writers：

| Record status | `analyses` | Record `negativeChecks` | 必要原因／Evidence |
|---|---:|---:|---|
| MATCHED | `>= 1` | 可空 | MATCHED candidate＋positive evidence＋matched rule |
| EXCLUDED | 通常 `0` | `>= 1` | `exclusionReason`＋排除 rule/evidence |
| CATALOG_DETAIL_MISSING | `>= 1` | 可由 candidate audit 滿足 | Candidate 保留＋Catalog detail check failed |
| NEEDS_REVIEW | 視候選而定，通常 `>= 1` | 依阻礙原因 | `reviewReason`＋可稽核 evidence/check |
| UNKNOWN | `0` | `>= 1` | `unknownReason`＋缺少證據的 audit check |

Candidate matrix：

| Candidate status | `negativeChecks` | 必要條件 |
|---|---:|---|
| MATCHED | 可空 | positive evidence／rule 完整 |
| EXCLUDED | `>= 1` | 排除 rule／reason／evidence |
| CATALOG_DETAIL_MISSING | `>= 1` | Catalog detail required check failed |
| NEEDS_REVIEW | 依原因至少有 audit trail | `statusReason`／evidence／review condition |

### 11.9 既有 analyzed-file 相容

- 讀入舊 POC／舊 analyzed files 時，以 versioned migration／adapter 處理。
- 不得把舊檔案直接當成本次 Provider 成功輸出。
- Canonical v0.3.14 JSON 保留新狀態，不得為舊 UI 降級。
- Legacy UI／SQLite 若暫時只支援舊 enum，必須同步 migration 或使用不遺失語意的 versioned storage；不得靜默轉成 UNKNOWN。

---

## 十二、Strict Structured Output Schema 與本機 Preflight

實作時核對執行當下官方 OpenAI Structured Outputs 文件：

- <https://developers.openai.com/api/docs/guides/structured-outputs>

至少延續 v0.3.13：

1. 每個 object 都有明確 `properties`。
2. 每個 object 都有 `additionalProperties: false`。
3. 同層 `required` key set 與 `properties` key set 完全相等。
4. Optional 語意以 required＋nullable 表達。
5. 不使用任意 dictionary、unsupported keyword 或無法解析的 `$ref`。
6. 遵守 nesting depth、properties、enum、string length 等 Provider limits。
7. Schema canonicalization deterministic，validated／outgoing／saved Schema SHA-256 一致。
8. 無效 Schema 在 Thread 前 fail-fast，request／thread／turn 全 0。

### 12.1 結構與語意分層

Strict Structured Outputs 支援的是 JSON Schema subset，無法安全承擔本版全部跨欄位條件。不得使用 Provider 不支援的：

```text
if / then / else
not
dependentRequired
dependentSchemas
unsupported conditional composition
```

正式分層：

```text
Provider Strict Schema
→ 保證欄位、型別、enum、array/item、additionalProperties

Local Semantic Validator
→ 保證 status matrix、數量、identity、Catalog、Evidence、cross-field conditions
```

不得因 semantic condition 無法寫入 Strict Schema 就移除該條件；也不得為塞入條件而送出 Provider 不支援 Schema。

### 12.2 Schema name／version

使用新 schema identity，例如：

```text
jira_activity_analysis_v0314
```

最終名稱依 repo convention，但不得沿用 v0.3.13 schema name 卻改變 enum／properties。記錄：

```text
schemaName
schemaContractVersion
validatorName
validatorVersion
schemaBytesUtf8
schemaSha256
findingCount
findings[]
```

### 12.3 Preflight 與 request ordering

正式流程：

```text
create Run
→ snapshot Request Package
→ validate 1 JSON + 3 MD
→ build core + supplemental instruction
→ build/freeze Strict Schema
→ local schema preflight
→ assemble exact delivery payload
→ capacity calculation / warning
→ persist outgoing evidence and durable flush
→ one Provider dispatch
→ one Thread
→ one Turn
```

任何 Request Package／Schema／persistence preflight 失敗都不得跨入 Provider boundary。

---

## 十三、Semantic Validator 與精確錯誤

### 13.1 Validator order

Provider completed 後依序：

```text
1. complete raw response assembly
2. raw response Hash / byte verification
3. JSON parse
4. Strict response schema validation
5. record identity conservation
6. Catalog identity validation
7. Evidence ownership validation
8. status-aware semantic validation
9. artifact rendering preflight
10. SQLite transaction preflight
```

每層輸入／輸出 Hash 與 count 要保存。

### 13.2 Finding contract

每個 finding 至少包含：

```text
code
severity
jsonPath
jsonPointer
recordIndex
sourceRecordStableId
candidateIndex
skillId
message
expected
actual
ruleId
```

不適用欄位為 `null`，不得省略到無法定位。

範例：

```text
records[0].negativeChecks is empty for UNKNOWN status
records[17].analyses[1].negativeChecks is empty for CATALOG_DETAIL_MISSING
records[42].analyses[0].skillId does not exist in Catalog snapshot
records[56].classificationStatus is CATALOG_DETAIL_MISSING but analyses is empty
```

不得再只回報：

```text
Every record and candidate requires auditable negativeChecks.
```

### 13.3 Finding aggregation

- Validator 掃描完整 response，收集可安全收集的所有 findings，不在第一筆後丟掉後續資訊。
- UI 顯示 summary＋前幾筆，但完整 findings 寫入 Run。
- 不得用 UI preview 上限截斷 canonical validation file。
- 大量相同 pattern 可以聚合 count，但仍需保存每個受影響 JSON path 或 machine-readable path list。

### 13.4 守恆

Real 117 成功必須：

```text
inputRecordCount = providerReturnedRecordCount = parsedRecordCount
                   = semanticValidRecordCount = formalCommittedRecordCount = 117
input Stable ID set = output Stable ID set
每個 Stable ID 恰好一次
每個 recordIndex 合法且唯一
每個 Skill ID 存在於本次 Catalog snapshot
每個 evidence ref 屬於對應 input record
沒有 missing / duplicate / unexpected record
```

---

## 十四、分階段結果計數

UI、manifest、Debug、Token ledger 與 reports 都要分開記錄：

```text
inputRecordCount
providerReturnedRecordCount
parsedRecordCount
schemaValidRecordCount
semanticValidRecordCount
formalArtifactRecordCount
sqliteCommittedRecordCount
```

v0.3.13 的 `0 / 117` 不得再同時代表 Provider 沒輸出與正式未接受。

顯示範例：

| 階段 | 數量 |
|---|---:|
| Input records | 117 |
| Provider returned records | 117 |
| Parsed records | 117 |
| Schema-valid records | 117 |
| Semantic-valid records | 116 |
| Formally committed records | 0 |

如果任何整批 gate 失敗，`semanticValidRecordCount` 可顯示逐筆通過數，但 `formalArtifactRecordCount`／`sqliteCommittedRecordCount` 必須為 0；不得局部 commit。

---

## 十五、完整 Provider Response 與 Hash

### 15.1 不得再有 8,192 bytes 截斷

定位所有可能截斷來源：

- logger preview／string slice；
- IPC payload limit workaround；
- Debug exporter；
- gzip writer；
- renderer state preview；
- manifest serializer；
- stream accumulator；
- file read helper default max bytes。

UI 可以只渲染 virtualized preview，但 canonical files 必須完整。

### 15.2 三份 response evidence

至少保存：

```text
provider-stream.jsonl
provider-response.raw.json
provider-response.canonical.json
```

定義：

- `provider-stream.jsonl`：按收到順序的 sanitized exact provider events。
- `provider-response.raw.json`：由可見 output deltas／Provider terminal payload deterministic 重組的完整原始可見 response。
- `provider-response.canonical.json`：JSON parse＋Strict schema validation後的 deterministic canonical serialization；不得在 semantic failure 時改寫 Provider 值。

### 15.3 Hash chain

至少記錄：

```text
streamEventCount
streamBytes
streamSha256
rawResponseBytes
rawResponseSha256
canonicalResponseBytes
canonicalResponseSha256
manifestResponseSha256
debugCopyResponseSha256
```

成功條件：

```text
manifestResponseSha256 = rawResponseSha256
debugCopyResponseSha256 = rawResponseSha256
```

若 Debug Folder 使用 gzip，解壓 bytes 的 SHA-256 必須等於 raw response SHA-256；另記 gzip file Hash，不得混用 compressed／uncompressed Hash。

### 15.4 Evidence mismatch

任何 required Hash／byte／record count 不一致：

```text
errorCode = AI_PROVIDER_RESPONSE_EVIDENCE_MISMATCH
formal artifacts = not written
SQLite = not written
Run = failed / partial with evidence preserved
```

不得以 manifest 值覆寫實際檔案 Hash。

---

## 十六、Provider lifecycle、單次執行與容量

保留正式架構：

```text
117 records
→ 1 Request Package
→ 1 Provider dispatch
→ 1 ephemeral Thread
→ 1 Turn
→ 1 main analysis request
→ 117 results
```

繼續禁止：

- 自動分批；
- per-record request；
- repair Turn；
- App／timeout／parse／semantic retry；
- fallback request；
- Group-first fallback；
- `_001` fallback；
- UI rerender／duplicate IPC 重送；
- 自動建立第二個 Thread／Turn；
- 對話區自由追問。

### 16.1 Lifecycle counters

Run manifest、UI、Debug 與 ledger 至少包含：

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

成功：

```text
1 / 1 / 1 / 1 / 1 / 1 / 0 / 0 / 0
```

Request Package／Schema／persistence preflight fail：全部 0。

### 16.2 Capacity warn-only

保留 v0.3.12／v0.3.13：

- Capacity available且足夠：正常。
- Capacity unavailable：顯示完整計算，使用者確認後可執行。
- Estimated total超過已知 capacity：顯示完整 overage，使用者確認後可執行。
- 使用者取消：0 dispatch／0 Thread／0 Turn，但本次已建立的 preflight Run／request evidence保留並標為 CancelledBeforeDispatch。
- 不暗中使用固定 `200,000`。
- 不將 warn-only 改回 hard block。

容量計算必須基於真正 model-visible final payload／file inputs、instruction、Schema與reserve；若 Native input 的 token 只能估算，明確標示方法與不確定性。

---

## 十七、Run stages、錯誤碼與精確 UI 狀態

### 17.1 Run stages

至少能區分：

```text
creating_run
snapshotting_request_package
validating_request_package
building_instruction
building_output_schema
validating_output_schema
assembling_provider_payload
preflighting_capacity
waiting_capacity_confirmation
persisting_outgoing_request
starting_thread
starting_turn
waiting_response
receiving_response
assembling_response
validating_response_hash
parsing_response
validating_response_schema
validating_identity
validating_catalog
validating_semantics
writing_formal_artifacts
committing_database
completed
cancelled
interrupted
failed
```

每個 transition 即時寫入 conversation／event／execution ledger。

### 17.2 錯誤碼

至少區分：

```text
AI_RUN_DIRECTORY_CREATE_FAILED
AI_REQUEST_PACKAGE_SNAPSHOT_FAILED
AI_REQUEST_PACKAGE_HASH_MISMATCH
AI_REQUEST_PACKAGE_INVALID
AI_REQUEST_DELIVERY_MODE_UNSUPPORTED
AI_CONVERSATION_PERSISTENCE_FAILED
AI_OUTPUT_SCHEMA_BUILD_FAILED
AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED
AI_OUTPUT_SCHEMA_PROVIDER_REJECTED
AI_PROVIDER_RESPONSE_INCOMPLETE
AI_PROVIDER_RESPONSE_INVALID_JSON
AI_PROVIDER_RESPONSE_SCHEMA_MISMATCH
AI_PROVIDER_RESPONSE_EVIDENCE_MISMATCH
AI_RESULT_IDENTITY_VALIDATION_FAILED
AI_RESULT_CATALOG_VALIDATION_FAILED
AI_RESULT_SEMANTIC_VALIDATION_FAILED
AI_FORMAL_ARTIFACT_WRITE_FAILED
AI_SQLITE_TRANSACTION_FAILED
AI_RUN_INTERRUPTED
```

### 17.3 Formal save reason

UI 顯示實際原因，例如：

```text
Not written — request package snapshot failed before provider dispatch
Not written — conversation persistence failed
Not written — Provider response evidence Hash mismatch
Not written — records[0].negativeChecks is empty for UNKNOWN status
Not written — records[56] lost CATALOG_DETAIL_MISSING candidates
Written — 117 validated records
```

不得用籠統 `result validation failed` 取代已知精確階段。

### 17.4 Error dedup

保留 v0.3.13 dedup：同一 Run／stage／errorCode／normalized root cause 的 primary error：

```text
AI event log = 1
Global debug log = 1
Toast = at most 1
occurrenceCount = actual observations
```

不同 Run 或不同 JSON path finding 不得錯誤合併。

---

## 十八、Formal artifacts 與 Completed-only Gate

### 18.1 成功條件

只有下列全部成立才可正式保存：

1. Request Package snapshot／Hash／delivery evidence passed。
2. Conversation persistence healthy且 durable flush passed。
3. Strict Output Schema preflight passed。
4. Provider accepted且terminal status = completed。
5. 完整 stream／raw response／Hash chain passed。
6. JSON parse passed。
7. Strict response schema validation passed。
8. 117 input／117 provider returned／117 parsed。
9. Stable ID、recordIndex、source hash無 missing／duplicate／unexpected。
10. Catalog Skill ID exact match。
11. Evidence ownership passed。
12. Status-aware semantic validation passed。
13. `CATALOG_DETAIL_MISSING` candidate preservation passed。
14. Token／execution evidence完整或明確 unavailable reason。
15. Formal analyzed JSON writer成功。
16. Golden HTML writer成功並核對 source JSON Hash。
17. SQLite單一 transaction成功並重新查驗117筆。

### 18.2 正式 analyzed JSON

- 只由本次真實 Provider completed response產生。
- 保留 canonical status、candidate、`scoreComponents[]`、negative checks與source identity。
- 記錄 contract version、request package Hash、response Hash、Schema Hash、Run ID。
- 不得從舊 POC檔案或手動版補值。

### 18.3 Golden HTML

- 由本機 deterministic renderer從 validated analyzed JSON產生。
- 不由模型產生 HTML。
- 顯示 Request Package、delivery mode、Run、Provider、Model、counts、Token、contract／Schema／artifact Hash。
- 正確顯示 MATCHED／EXCLUDED／CATALOG_DETAIL_MISSING／NEEDS_REVIEW／UNKNOWN。
- 本版不重做無關視覺設計。

### 18.4 SQLite

- 全117筆一個 transaction，全寫或全不寫。
- Partial／Invalid／Interrupted不得寫入正式資料。
- transaction失敗 rollback。
- 寫入後重新查驗 Run ID、count、Stable ID set、status distribution、request／response／Schema／JSON Hash。
- 必須可保存新狀態而不降級成 UNKNOWN。
- 若需 migration，做最小且可回滾的 schema migration與tests，不做無關大型重構。

### 18.5 失敗／取消／中斷

任何 gate 失敗：

```text
正式 analyzed JSON = not written
正式 Golden HTML = not written
正式 SQLite = not written
上一份成功結果 = not overwritten
Run / conversation / request / stream / response / findings / staging = retained
automatic retry = 0
```

---

## 十九、Run history 與分析工作區載入

新增或完善歷史 Run 列表，至少顯示：

```text
Local start time
Run ID
Status
Input count
Provider returned / parsed / semantic-valid / committed counts
Delivery mode
Provider / Model
Duration
Actual tokens
Archive size
Formal output / SQLite state
```

功能：

- 查看對話；
- 查看 Request Package manifest；
- 查看 validation findings；
- 開啟本機 Run folder；
- 匯出／開啟 conversation Markdown；
- 對單一 terminal Run執行手動刪除。

歷史列表不得讀取整份巨大 response 才顯示；使用 manifest／index lazy load。開啟對話時採 virtualization／incremental read，避免117筆大回覆造成 renderer freeze。

---

## 二十、Failed Staging 與 Debug Folder

### 20.1 Failed staging

沿用永久保留政策。若既有路徑為：

```text
<APP_ROOT>/exports/ai-analysis/failed-staging/<analysisRunId>/
```

應改為或連結到 canonical Run evidence，避免兩套內容不同。Manifest 必須明確指向權威 Run path。

### 20.2 Debug Folder

一鍵 Debug Folder 仍為資料夾、不壓縮整包，並自動放在既有 `APP_ROOT` debug root。AI Run Debug 必須包含或以安全、可攜副本包含：

```text
run-manifest.json
failed-run-manifest.json (if applicable)
conversation.jsonl
conversation.md
request-package-manifest.json
analysis-instruction.md
output-schema.json
output-schema-validation.json
provider-events.jsonl
provider-stream.jsonl
provider-response.raw.json or .json.gz
provider-response.canonical.json or .json.gz
response-validation.json
token-usage.json
execution-time.json
artifact-manifest.json
```

真實輸入／規則內容是否放入可分享 Debug copy，依既有公司資料遮蔽政策；但本機 Run archive 必須完整。若 Debug copy因隱私只保存 manifest／Hash，必須清楚標示 `contentExcludedByPolicy`，不得標成完整 request。

### 20.3 Debug completeness

Debug export後自動驗證：

- required file存在；
- Hash可重算；
- gzip可解壓；
- raw response解壓 Hash與Run manifest一致；
- conversation sequence無缺口／重複；
- 無8,192-byte固定截斷；
- secret scan通過；
- path containment通過。

---

## 二十一、正式 Real 117 驗證

### 21.1 正式資料

沿用與 v0.3.13 相同的正式資料，以實際 bytes／Hash／manifest辨識：

```text
117 Events
28 Issues
2 Projects
279 Skills
279 Unique Skill IDs
0 Duplicate Skill IDs
1 Pending JSON
3 Markdown rule documents
```

不得把真實公司資料加入Git。

### 21.2 只使用正式 Release Portable

不得使用：

- dev server；
- old v0.3.13 Portable；
- win-unpacked代替正式Portable；
- 測試fixture／mock；
- Build Version／Time／Commit不符的EXE。

流程：

1. 完成 source release commit。
2. 從可追溯 source commit執行最終Build／Dist。
3. 記錄正式v0.3.14 Portable path、bytes、SHA-256、Version、Build Time、Source Commit。
4. 從正式 `release` 目錄啟動Portable。
5. 在UI核對Version／Build Time／Commit／EXE Hash。
6. 由操作者在該Portable內完成ChatGPT登入；不得搬移或猜測credential。
7. 執行Provider diagnostics。
8. 載入正式1 JSON＋3 MD。
9. 核對Request Preview、原始檔名、bytes、Hash、117／279與delivery mode。
10. 核對core instruction與supplemental instruction。
11. 核對Schema preflight passed與Schema Hash。
12. 核對capacity calculation；若警告出現，只確認一次。
13. 按一次「開始分析」。
14. 確認下方立即出現對話紀錄與本機Run path。
15. 等待同一Turn terminal；不得手動或自動第二次執行。
16. Terminal後核對完整counts、validation、formal artifacts、SQLite、conversation與Debug Folder。

### 21.3 成功驗收值

```text
Input records                 117
Provider returned records     117
Parsed records                117
Schema-valid records          117
Semantic-valid records        117
Formal artifact records       117
SQLite committed records      117
Provider dispatch             1
Thread start attempt          1
Thread created                1
Turn start attempt            1
Turn accepted                 1
Turn completed                1
Retry / Repair / Fallback     0 / 0 / 0
Provider terminal status      completed
Request package integrity     passed
Conversation persistence      passed
Output schema preflight       passed
Response evidence Hash        passed
Response schema validation    passed
Identity / Catalog / Evidence passed
Status-aware semantic         passed
Formal JSON                   written
Golden HTML                   written
SQLite                        committed and re-verified
```

### 21.4 無 authentication

若Codex執行環境無可用authentication：

- 不搬移其他App／build的auth state；
- 不使用fixture冒充；
- 完成其餘實作、tests、Build、Dist、reports、Commit、Tag、Push；
- Real 117標示 `Not executed — authentication unavailable`；
- Provider dispatch／Thread／Turn均為0；
- Overall Status為Partial。

### 21.5 真實 Run 失敗

若已dispatch且失敗：

- 不得再執行第二次；
- 不得自動repair／retry／fallback；
- 立即保留Run directory、完整對話、Request Package、stream、raw response、findings、usage、Debug Folder與錄影；
- 根據真實failed stage回報；
- 不得因已消耗約17萬Tokens而用舊結果補齊。

---

## 二十二、軟體版與既有手動／POC版比較

Real 117 Completed後，以相同Stable IDs比對：

```text
Record classification status
Candidate status
Skill ID
CATALOG_DETAIL_MISSING candidate preservation
NEEDS_REVIEW
EXCLUDED reason
Evidence refs / content mapping
Negative checks
Confidence
Rule IDs
scoreComponents
```

產生machine-readable JSON與human-readable Markdown／HTML report。

要求：

- 手動／POC版是比較基準，不是硬編碼答案。
- 區分schema migration差異、排序／空白差異與semantic mismatch。
- 不修改Provider輸出強迫一致。
- 不再送第二次挑較好結果。
- 未解釋semantic mismatch存在時只能Partial。

---

## 二十三、測試要求

先新增可重現 v0.3.13 契約衝突與 8,192-byte截斷的 failing tests，再修實作。不得只修改 assertion 讓錯誤資料通過。

### 23.1 Request Package tests

至少涵蓋：

1. 精確1 Pending JSON＋3 Markdown＋1 instruction＋1 schema。
2. 缺任一文件fail-fast，0 dispatch／0 Thread／0 Turn。
3. 多餘或role重複文件被拒絕或要求明確解決。
4. 原始bytes與snapshot bytes／Hash一致。
5. Snapshot後修改原檔不改變Run。
6. JSON record count／Stable ID snapshot固定。
7. Markdown完整原文保存，不被derived parser output取代。
8. Manifest deterministic且Hash可重算。
9. `truncated=true`禁止dispatch。
10. Secret不進Request Package。

### 23.2 Delivery mode tests

- Native mode只有Provider capability實際存在才啟用。
- Native outgoing payload含同一Turn的4個file inputs＋instruction。
- Inline mode含4個完整file blocks、檔名、role、bytes、Hash與固定順序。
- Inline block未截斷、未重複規則。
- Parser-derived資料不得冒充original。
- UI label／manifest／outgoing request mode一致。
- Final payload SHA-256 deterministic。
- 測試解析實際outgoing request，不可只assert UI文字。

### 23.3 Analysis instruction tests

- Core instruction可見、唯讀、versioned、Hash穩定。
- Supplemental instruction預設空白且可保存。
- Supplemental不產生第二Turn。
- 明顯要求忽略Schema／省略records的衝突被警告或阻止。
- Provider model-visible instruction與Run snapshot一致。

### 23.4 Run identity／path tests

- 每次terminal後再次有效開始建立新Run。
- 同一毫秒建立仍UUID唯一。
- Double click／duplicate IPC／rerender只一個active Run與dispatch。
- 本機time／UTC／timezone／offset正確。
- 年／月folder正確。
- 中文／空白／長APP_ROOT path。
- 不回退AppData／Temp／CWD。
- Path traversal／symlink／junction containment。
- 歷史Run不因restart／success／upgrade／Debug被刪除。
- 手動刪除只作用於單一精確Run。

### 23.5 Conversation persistence tests

- Run建立立即寫第一個event。
- Outgoing message先persist＋flush再dispatch。
- Stream chunks按順序append。
- Sequence單調、無duplicate／gap。
- Concurrent events經single writer queue序列化。
- Renderer unmount不停止main-process writer。
- Auto-scroll off不停止保存。
- Message boundary／terminal durable flush。
- Disk write failure停止formal pipeline並產生精確錯誤。
- Partial line crash recovery。
- App restart將non-terminal Run標為Interrupted且不重送。
- `conversation.md` deterministic生成。
- UI顯示與JSONL canonical events一致。
- Secret redaction在磁碟層驗證。

### 23.6 Large response／Hash tests

- 8,192 bytes以上response完整保存。
- 至少用大於v0.3.13實際回覆規模的fixture。
- Chunk boundaries任意切割仍可重組相同raw bytes。
- Gzip round trip後Hash一致。
- Manifest／raw／Debug解壓Hash一致。
- Truncated stream被偵測。
- Late／duplicate chunk被偵測或安全去重，不污染新Run。
- UI preview截斷不影響canonical file。

### 23.7 Canonical response contract tests

- MATCHED合法案例，negativeChecks可空但positive evidence完整。
- EXCLUDED必須有exclusion reason＋record negative check。
- CATALOG_DETAIL_MISSING保留candidate與exact Skill ID。
- CATALOG_DETAIL_MISSING candidate缺Catalog check時失敗。
- CATALOG_DETAIL_MISSING analyses空時失敗。
- NEEDS_REVIEW保留reason／candidate／evidence。
- UNKNOWN analyses空、reason與record negative check完整。
- UNKNOWN無negative check時精確失敗。
- v0.3.13第一筆fixture產生精確`records[0].negativeChecks` finding。
- `scoreComponents[]` round trip與duplicate key failure。
- Invalid Skill ID、Evidence ref、status/candidate mismatch failure。
- Strict Schema enum包含新status。
- Provider Schema不使用unsupported conditional keyword。
- JSON／HTML／SQLite mapper保留新status。
- Legacy adapter不靜默降級成UNKNOWN。

### 23.8 Counts／formal gate tests

- Provider returned／parsed／schema-valid／semantic-valid／committed分開。
- 117 returned、116 semantic valid時formal／SQLite均0。
- Missing／duplicate／unexpected Stable ID整批失敗。
- Artifact writer任一步失敗不留假成功狀態。
- SQLite transaction 117全寫或rollback全不寫。
- 上一次成功結果不被失敗Run覆寫。

### 23.9 Provider integration tests

Fake／mock App Server證明：

```text
exactly one provider dispatch
exactly one thread/start
exactly one turn/start
one payload contains all 117 records
one request package contains 1 JSON + 3 MD + instruction
rules are not repeated
validated schema hash = outgoing schema hash
stream events persist before UI dependency
one completed response reconstructs completely
no retry / repair / fallback
```

### 23.10 Regression tests

至少重跑：

- v0.3.13 Strict Schema preflight／`scoreComponents[]`；
- v0.3.13 error dedup；
- v0.3.12 Capacity warn-only／confirm／cancel；
- single-dispatch guard；
- Failed staging retention；
- Completed-only JSON／HTML／SQLite gate；
- Debug Folder；
- APP_ROOT／portable containment；
- secret masking；
- AI Nexus／Offline Rule既有必要regressions；
- v0.3.8～v0.3.13相關targeted tests。

### 23.11 必要 commands

執行repository實際支援的：

```text
npm.cmd run typecheck
v0.3.14 targeted tests
AI Analysis integration tests
required regressions
npm.cmd run build
npm.cmd run dist
git diff --check
```

命令名稱依package scripts調整，不得因名稱不同跳過。不得執行已取消的長時間smoke test。

每個command記錄：

```text
exact command
startedAtLocal / startedAtUtc
endedAtLocal / endedAtUtc
durationMs
exitCode
PASS / FAIL
testCount
failureSummary
```

---

## 二十四、Token Ledger

新增：

```text
reports/JiraActivityAnalyzer_v0.3.14_token_ledger.json
```

至少分開記錄下列資料。

### 24.1 Request Package bytes

```text
pending JSON bytes / SHA-256
Common Rules bytes / SHA-256
Skill Catalog bytes / SHA-256
third Markdown bytes / SHA-256
core instruction bytes / SHA-256
supplemental instruction bytes / SHA-256
output schema bytes / SHA-256
final model-visible payload bytes / SHA-256
delivery mode
native file count or inline block count
transformation metadata
```

若 Native file input 的 Provider request envelope 只保存 file reference，不可將 envelope bytes 誤當模型實際輸入 bytes；分開記錄檔案 bytes、request envelope bytes 與 token estimator 方法。

### 24.2 估算值

```text
estimator name / version / method
estimated input tokens
visible output reserve
reasoning reserve
safety margin
estimated required total
capacity source
provider capacity
margin / overage
capacity snapshot SHA-256
```

### 24.3 Provider 真實 usage

依 Provider 實際回傳欄位記錄：

```text
input_tokens
cached_tokens
cache_write_tokens
output_tokens
reasoning_tokens
total_tokens
provider-specific usage fields
usage source event / response ID
```

不得把估算值填入 actual 欄位。Provider 未回傳時填 `null`／`unavailable` 並附原因，不可用 0 冒充。

### 24.4 Lifecycle 與結果

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
inputRecordCount
providerReturnedRecordCount
parsedRecordCount
schemaValidRecordCount
semanticValidRecordCount
formalArtifactRecordCount
sqliteCommittedRecordCount
```

### 24.5 本版實作工作 Token

若 Codex 執行環境可取得本次程式實作的 input／output／reasoning token 或 usage，另列 `implementationUsage`；不可取得時標示 Unavailable。不得與 App 真實 Provider Run 的 169,651 等 usage 混在一起。

---

## 二十五、Execution Time Ledger

新增：

```text
reports/JiraActivityAnalyzer_v0.3.14_execution_time_ledger.json
```

每項至少包含：

```text
startedAtLocal
startedAtUtc
endedAtLocal
endedAtUtc
durationMs
status
commandOrOperation
notes
```

至少記錄：

- overall wall-clock；
- repository／Git inspection；
- v0.3.13 evidence inspection；
- request assembly／delivery mode inspection；
- 8,192-byte 截斷 root cause；
- v0.3.13 semantic conflict reproduction；
- Request Package implementation；
- core／supplemental instruction implementation；
- Run directory／history implementation；
- conversation writer／crash recovery implementation；
- response stream／Hash chain implementation；
- canonical response contract／Schema／validator implementation；
- UI conversation／history implementation；
- each targeted／regression test command；
- typecheck；
- build；
- dist；
- artifact verification；
- formal Portable launch；
- authentication／manual wait；
- Provider diagnostics；
- Request Package／Schema／capacity preflight；
- Thread／Turn／Provider duration；
- response assembly／parse／validation；
- 117 identity／Catalog／Evidence／semantic validation；
- JSON／HTML writer；
- SQLite transaction／reverification；
- comparison；
- conversation／Debug completeness verification；
- docs／reports／ledgers；
- Git commit／tag／push／remote verification。

Blocked、failed、cancelled、interrupted、not executed 階段也要保留真實狀態與原因。

---

## 二十六、Build、Dist 與正式產物

必須完成 repository 實際支援的：

```text
typecheck
targeted tests
required regressions
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

Build warnings 必須列出，特別核對：

- renderer chunk；
- `node:crypto` externalization；
- Electron default icon；
- Authenticode signing；
- 新增 conversation virtualization／large file reader 是否引入 warning。

Warning 不得自動等於 FAIL 或 PASS；需說明是否影響實際 Run persistence、Hash、response assembly 或 renderer 啟動。

正式 Real 117 只能使用最終 Release Portable。

---

## 二十七、Git、Commit、Tag 與 Push

### 27.1 Preflight

開始前記錄：

```text
repository absolute path
branch
HEAD
upstream
remote
git status --short
ahead / behind
v0.3.13 tag target
```

執行 `git fetch --all --prune`；網路／權限失敗時記錄，不破壞本機狀態。

### 27.2 保留使用者既有變更

已知 repo 可能保留舊版 tracked 修改與大量 untracked 使用者資料。必須：

- 開始／結束都列出；
- 不移動、不刪除、不提交無關內容；
- 不將舊 tracked 變更混入本版 commit；
- 若與本版檔案衝突，先精確區分；無法安全處理才回報 blocker。

### 27.3 精準 staging

Commit 前：

- `git status --short`；
- `git diff --check`；
- 列出本版 tracked file 清單；
- secret／path／large file／package audit；
- 不使用 `git add .` 或 `git add -A`；
- 只加入本版明確檔案。

不得加入：

```text
.env / auth state / token
真實 Pending JSON / 3 MD
Request Package / conversation / Provider stream / response
SQLite
release binaries
Debug / Failed staging
錄影 / screenshots
使用者無關修改
```

### 27.4 建議交付流程

1. 完成程式、tests、版本與 docs。
2. 建立 source release commit。
3. 從乾淨且可追溯 source commit 執行最終 Build／Dist。
4. 驗證正式 Portable。
5. Authentication 可用時只執行一次 Real 117。
6. 產生 ledgers／implementation／packaging／real117／comparison reports。
7. 建立 reports／evidence commit。
8. 建立 annotated tag `v0.3.14` 指向最終交付 HEAD。
9. Push branch與 tag。
10. 驗證 remote HEAD／tag／Ahead／Behind。

### 27.5 Artifact source commit 與 final HEAD

若 artifact 來自 source release commit，而 final HEAD 因 reports 不同，正式回報：

```text
artifactSourceCommit
finalHeadCommit
git diff --name-status <artifactSourceCommit>..<finalHeadCommit>
```

兩者差異只可包含 reports、ledgers、validation evidence、純文件或不影響執行檔的 metadata。

若差異包含 app source、Schema、runtime instruction、tests runtime、package／lockfile、builder config、renderer、migration 或 runtime assets，必須重新 Build／Dist，使產物對應最新 source commit。

### 27.6 Push Gate

- 程式修正、必要 tests、Build、Dist 成功後，即使 Real 117 因 authentication／外部限制為 Partial，仍應 Commit、annotated Tag 與 Push。
- 若程式、Request Package、conversation durability、Schema／semantic validator、tests、Build 或 Dist 失敗，不得建立成功 tag。
- 不 force push。
- 最終目標：

```text
Remote branch contains final HEAD
Remote tag v0.3.14 resolves to final HEAD
Ahead = 0
Behind = 0
```

---

## 二十八、文件與報告更新

依 repo 實際結構更新：

- `VERSION`；
- `package.json`／lockfile 版本；
- `CHANGELOG.md`；
- `PROJECT.md`；
- `README.md`；
- v0.3.14 Prompt archive；
- Request Package／delivery mode docs；
- conversation／Run retention docs；
- canonical response contract／semantic matrix docs；
- schema／validator docs；
- Token ledger；
- Execution Time ledger；
- implementation report；
- packaging report；
- Real 117 validation report；
- manual／POC comparison report（Real 117 完成時）。

若 ENV schema 沒有變更，不提高 `ENV_FORMAT_VERSION`，不修改 `.env.version` 格式版本。本版 ChatGPT authentication 仍不寫入 `.env`。

---

## 二十九、本版明確不做

不得擴大為：

- 修改三份正式技能分類規則內容；
- 補寫／虛構 279 Skills 的 detail description；
- 改用其他模型；
- 改回 OpenAI API／要求 OpenAI API Key；
- 新增 vector store／File Search 知識庫；
- 改成分批、逐筆、repair、retry 或 fallback；
- 對話區自由追問或第二 Turn；
- 自動刪除歷史 Run／Failed staging；
- 自動清理遠端 Provider 檔案並在無證據時宣稱已刪；
- 將 parser-derived 摘要偽裝原始 MD；
- 將 Inline 模式偽裝 Native attachment；
- 重新縮減 117 筆資料；
- 改回容量 hard block；
- 關閉 Strict Schema 或降級一般 JSON mode；
- 重做無關 Golden HTML 視覺；
- 無關 SQLite 大型 migration；
- 搬移或猜測 ChatGPT authentication；
- 用 fixture／POC／手動版結果冒充 Real 117；
- 用 dev／win-unpacked／old build 冒充正式 Portable。

若 Native file input 不可用，Inline exact-content 是正式允許且應誠實標示的模式，不是 blocker。

---

## 三十、完成判定

### 30.1 Completed

只有以下全部成立才可標示 Completed：

```text
Version = v0.3.14
v0.3.13 negativeChecks conflict reproduced by regression
v0.3.13 8,192-byte truncation reproduced and fixed
1 JSON + 3 MD + instruction Request Package implemented
Original / snapshot bytes and Hash verified
Actual delivery mode visible and evidence-backed
Core instruction visible / immutable / versioned
Supplemental instruction works without second Turn
Every valid start creates unique local-time Run
Conversation appears immediately in Analysis Workspace
Outgoing / stream / lifecycle / validation persist incrementally
Crash / restart recovery passed
Historical Runs persist until manual deletion
Full provider response and Hash chain passed
Canonical response contract aligned end-to-end
CATALOG_DETAIL_MISSING preserves candidate Skill
NEEDS_REVIEW supported
Status-aware negativeChecks validation passed
Precise JSON path findings passed
Provider / parsed / semantic / committed counts separated
Capacity warn-only preserved
Real input = 117
Real provider returned = 117
Real parsed = 117
Real schema-valid = 117
Real semantic-valid = 117
Formal JSON records = 117
SQLite committed records = 117
Provider dispatch / Thread / Turn completed = 1 / 1 / 1
Retry / Repair / Fallback = 0 / 0 / 0
Provider terminal status = completed
Identity / Catalog / Evidence / semantic validation passed
Manual / POC comparison has no unresolved semantic mismatch
Formal JSON / Golden HTML / SQLite completed
Run / conversation / Debug evidence complete
True Provider Token ledger complete
Execution ledger complete
Typecheck / tests / build / dist passed
Official Release Portable verified
Artifacts hashed
Commit + annotated tag + push completed
Ahead / Behind = 0 / 0
```

### 30.2 Partial

以下任一發生，只能 Partial：

- Real 117 未執行；
- authentication 需人工但未完成；
- Provider incomplete／refusal／external failure；
- 不是正式 Release Portable；
- 不是 117／117；
- lifecycle 不符合單次契約；
- 發生 retry／repair／fallback；
- Request Package／delivery evidence 不完整；
- conversation／stream／response 證據不完整或 Hash 不一致；
- response schema／identity／Catalog／Evidence／semantic validation 失敗；
- manual／POC comparison 有未解釋 semantic mismatch；
- JSON／Golden HTML／SQLite 任一失敗；
- 真實 usage 不可取得且未充分說明；
- Debug／Run evidence 不完整。

即使 Partial，仍須列出程式、tests、Build、Dist、artifacts、Git 與真實 Provider gate 結果。

### 30.3 Failed／Blocked

若程式實作、資料安全、conversation durability、必要 tests、Build、Dist、Git 權限或 repository 狀態本身阻斷，回報：

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

不得用 Partial 掩蓋程式自身仍未修復的契約、截斷、persistence 或必要測試失敗。

---

## 三十一、最終正式回報格式

完成後使用繁體中文，至少依序包含：

1. Version／Theme／Overall Status。
2. Repository path、base branch／commit、working branch。
3. v0.3.13 Real 117 基線、根因與原始 evidence Hash。
4. 8,192-byte 截斷 root cause、修正與 regression。
5. Request Package 文件角色、檔名、bytes、Hash 與 integrity。
6. 實際 delivery mode 及 outgoing request 證據。
7. Core／supplemental instruction 版本、bytes、Hash。
8. Run ID、本機時間、UTC、timezone、canonical path 與 retention。
9. Conversation writer、flush、crash recovery、history UI 與 manual deletion。
10. 對話事件數、stream 事件數、sequence／Hash 完整性。
11. Canonical response contract 舊／新狀態對照。
12. `CATALOG_DETAIL_MISSING` candidate preservation 與 `negativeChecks` status matrix。
13. Strict Schema name／version／SHA-256／preflight findings。
14. Semantic validator findings 格式與精確 path 測試。
15. Provider／parsed／schema-valid／semantic-valid／formal／SQLite counts。
16. Capacity calculation 與 regression。
17. 正式 Portable Version／Build Time／Source Commit／EXE Hash。
18. Provider／Model／diagnostics。
19. Dispatch／Thread attempt／created／Turn attempt／accepted／completed／retry／repair／fallback counts。
20. Provider terminal status、request／thread／turn／trace IDs、actual Token、duration。
21. Response stream／raw／canonical／manifest／Debug Hash chain。
22. 117 identity／Catalog／Evidence／semantic validation。
23. 手動／POC comparison 結果。
24. Formal JSON／Golden HTML／SQLite path、bytes、SHA-256、record count。
25. Run archive／Failed staging／Debug Folder path、內容、Hash 與保留狀態。
26. 每個 test command、test count、結果、duration。
27. Build／Dist command、結果、duration、warnings。
28. Installer／Portable／win-unpacked／ASAR path、bytes、SHA-256、source commit、signature。
29. Token／Execution／Implementation／Packaging／Real117／Comparison reports。
30. Git artifact source commit、final HEAD、diff、tag、remote、push、Ahead／Behind。
31. 完整保留且未提交的使用者既有修改／檔案。
32. 未完成項目、風險與唯一必要下一步。

任何未執行或不可取得項目必須寫 `Not executed`／`Unavailable` 與精確原因，不得省略或填推估值。

---

## 三十二、建議執行順序

1. 讀 repo instructions、Git、v0.3.11～v0.3.13 prompts／reports／true Run evidence。
2. 建立 v0.3.14 Execution Time Ledger 起始紀錄。
3. 定位真正 request assembly、file reading、rules parser、Provider envelope 與 delivery capability。
4. 定位 conversation／event／Debug writers 及 8,192-byte 截斷來源。
5. 定位 v0.3.13 Prompt／Schema／parser／semantic validator／JSON／HTML／SQLite 契約分歧。
6. 新增 v0.3.13 response conflict 與 8,192-byte 截斷 failing tests。
7. 建立 canonical Request Package 及 immutable snapshots／Hash。
8. 實作實際 delivery mode detection／evidence 與 Request Preview。
9. 實作 visible／versioned core instruction 與 supplemental instruction。
10. 建立本機時間 unique Run directory、manifest、history index 與 APP_ROOT containment。
11. 實作 main-process append-only conversation／stream writer、flush 與 crash recovery。
12. 實作分析工作區對話 UI、filters、virtualization 與 historical load。
13. 修復完整 response assembly、Debug copy 與 Hash chain。
14. 建立 canonical response contract 與新 status enums。
15. 更新 Strict Schema 且通過 local preflight。
16. 實作 status-aware semantic matrix 與 precise findings。
17. 更新 counts、errors、stages、formal JSON、Golden HTML、SQLite mapper／migration。
18. 補齊 Request、delivery、conversation、crash、large response、contract、counts、gate、integration tests。
19. 重跑 Capacity、single dispatch、dedup、APP_ROOT、Debug、secret、AI Nexus／Offline regressions。
20. 執行 typecheck／targeted／required regressions，修至通過。
21. 更新 VERSION／CHANGELOG／README／PROJECT／Prompt archive／docs。
22. 建立 source release commit。
23. 從 source commit Build／Dist。
24. 驗證 Installer／Portable／win-unpacked／ASAR metadata 與 Hash。
25. 從正式 Release Portable 完成登入／diagnostics／Request Preview／Schema／capacity 核對。
26. 只執行一次 Real 117。
27. 驗證 conversation、response Hash、117 counts、status contract、comparison、JSON、HTML、SQLite、Debug。
28. 完成 Token／Execution／Implementation／Packaging／Real117／Comparison reports。
29. `git diff --check`、secret audit、精準 staging。
30. Commit reports，建立 annotated `v0.3.14` tag。
31. Push branch與 tag，驗證 remote、tag、Ahead／Behind。
32. 依本 Prompt 格式正式回報。

---

## 三十三、立即開始

現在開始執行 v0.3.14。

本版第一個 gate 不是重新消耗一次 Real 117 Token，而是先以 v0.3.13 真實 response fixture 重現 `negativeChecks` 契約矛盾與 8,192-byte evidence 截斷，再從實際原始碼證明 1 JSON＋3 MD 目前如何送給 ChatGPT。完成 Request Package、delivery transparency、conversation durability、response Hash chain、canonical contract 與全部必要 tests 後，才可 Build／Dist 並使用正式 Release Portable 執行唯一一次 Real 117。

除非發生本 Prompt 定義的真正 blocker，否則不得停在分析、設計、局部修改、只寫 tests、只做 UI 或只完成 Build；必須一路完成可安全完成的全部交付流程、帳本、reports、Commit、annotated Tag 與 Push。
