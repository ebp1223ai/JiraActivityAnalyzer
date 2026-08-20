# Jira Activity Analyzer v0.3.24 — 正式完整 Codex 實作 Prompt

## 0. 文件用途

請在既有 Jira Activity Analyzer repository 中完成 `v0.3.24`。本文件是可直接交付 Codex 執行的完整實作、驗證、封裝與 Git 交付指令，不是概念草稿。

- Repository：`F:\AI\JiraActivityAnalyzer`
- Target Version：`0.3.24`
- 建議 Branch：`feat/v0.3.24-evidence-report-data-template-rendering`
- Annotated Tag：`v0.3.24`
- 預設語言：繁體中文
- 既有 Provider：`chatgpt_codex`
- Bundled Codex：維持官方固定版 `0.147.0`
- 新 Decision Contract：`jaa-ai-analysis-decisions-v4`
- 新 Analysis Bridge identity：`0.3.24-bridge-v6`
- 新 Evidence Segmenter identity：`JAA-EVIDENCE-SEGMENTER-1.0.0`
- 新 Canonical Contract：`jaa-canonical-analysis-result-v5`
- 新 Report Data Package Contract：`jaa-analysis-report-data-package-v1`
- 新 Issue Snapshot Profile：`jaa-issue-snapshot-profile-v1`
- 新 HTML Template Contract：`jaa-html-report-template-v5`
- 新 HTML Render Receipt：`jaa-html-render-receipt-v2`
- 新 HTML Renderer identity：`JAA-LOCAL-HTML-RENDERER-1.4.0`

> 版本基線：`v0.3.23` 尚未實作且已由產品決策正式取消。請直接從已完成的 `v0.3.22` 建立 `v0.3.24`；不得建立、發布或標記 `v0.3.23`，也不得假稱 v0.3.23 已存在。

## 1. 角色與執行原則

你是本版本的主要實作者與驗證者。先完整檢查 repository、`AGENTS.md`、package scripts、目前 branch、HEAD、remote、工作樹、既有 v0.3.22 實作與報告，再開始修改。

你必須自行完成：

1. 根因定位。
2. 架構與資料契約調整。
3. UI、主程序、Bridge、validator、renderer、Debug Folder 與 SQLite gate 實作。
4. 自動化測試與唯讀 regression 檢查。
5. build、dist、封裝內容與啟動驗證。
6. 正式報告、commit、annotated tag 與 push。

若真實 Managed OAuth、真實 Jira、production SQLite 或乾淨 Windows GUI 無法在目前環境安全執行，必須明確列為 `Manual Validation Pending`；不得以 mock、估算或靜態測試冒充真實驗證。

## 2. 不可破壞的安全邊界

1. 保留使用者所有既有 tracked dirty changes 與 untracked files。
2. 禁止 `git reset --hard`、`git clean`、強制 checkout、強制 push、未經授權的 stash、刪除或覆寫使用者資料。
3. 不得提交 token、OAuth credential、session、cookie、真實 Jira 私密資料、production database 或其他敏感檔案。
4. 不得終止使用者已在執行的 Jira Activity Analyzer、Codex 或其他 Electron process；啟動測試必須使用隔離 profile。
5. 不得修改真實 17／117 筆 fixture。若可用，只能唯讀驗證，且不得提交其內容。
6. 所有失敗必須 fail closed；不得因 fallback 而偽裝成功。

## 3. 已採納且不可擅自變更的十二項產品決策

### 決策一：四份 MD 採明確角色欄位

AI 分析設定 UI 必須有四個獨立且明確命名的 MD 欄位：

1. Rule Set Manifest
2. Classification Common Rules
3. Skill Catalog
4. HTML Report Template

不得只提供一個資料夾，再由軟體猜測檔案；不得依檔名模糊比對、排序結果或目錄掃描自動決定角色。

### 決策二：提供「內建預設」與「手動選取」兩種模式

- `內建預設`：使用封裝內、版本與 SHA-256 均已驗證的正式檔案。
- `手動選取`：使用者逐一選取四份 MD；四個角色都必須完整且通過驗證。

禁止把兩種模式的檔案混搭，禁止手動檔案失效時靜默 fallback 到內建檔案。

### 決策三：升級 Decision Contract v4

模型輸出維持精簡、直接 JSON array、精確 N 筆、索引完整，但每個 evidence quote 必須能追溯到本機建立的 Evidence Segment，並標記 evidence role。

### 決策四：證據分成 `PRIMARY_CHANGE` 與 `SUPPORTING_CONTEXT`

`PRIMARY_CHANGE` 是可歸因於本次 Activity Event 的新增、刪除或新 Comment 內容；`SUPPORTING_CONTEXT` 是 Diff 中未變更的上下文，只能補充說明，不能單獨證明使用者做了技術活動。

### 決策五：Validator 改為聚合式驗證

不得遇到第一個錯誤就停止。只要後續檢查仍可安全、唯讀地進行，就必須完整收集所有 findings，讓一次 Run 能看見全貌。

### 決策六：正式驗證失敗時自動產生診斷 HTML

只要 Provider 已發布可解析的 Decision artifact，即使 Schema、Semantic、Quality 或 Canonical Gate 失敗，也要由 JAA 本機離線產生「非正式診斷預覽 HTML」。此檔不得被視為 Golden HTML、不得寫入 SQLite。

### 決策七：新增無實質內容與樣板化證據檢查

找出只有標題、連結、檔名、圖片、通用 log、過短且無技術意義、跨筆高度樣板化或不可追溯的 quote；但不得誤判合理的短技術 token，例如函式名、狀態碼、參數名或錯誤碼。

### 決策八：Debug Folder 改為 role-based manifest，保留版本化檔名

Debug collector 不得硬編碼無版本 alias。必須依 Run manifest 的角色與實際 versioned basename 收集、驗證與報告。

### 決策九：分析資料與 Issue Snapshot 分離

Pending Analysis JSON 不包含完整 Issue Snapshot。Analyzed Result JSON 維持以 Pending JSON 為基礎，只增加分析、驗證、品質、Run／Rule reference 與 `issueSnapshotReference`；不得把同一 Issue 的完整 Snapshot 重複塞入每筆 Activity Event。

### 決策十：原始資料庫保有權威 Snapshot，AI DB 只保存 reference

完整 Current-State Issue Snapshot 保留在原始 Jira 資料庫。AI Analysis DB 只保存可追溯的 `jiraServerIdentity`、normalized Issue Key、`snapshotId`、`snapshotSha256` 與必要 Run identity，不改變為重複儲存完整 Snapshot 的資料庫。

### 決策十一：新增獨立 Report Data Package，並自動產生第一份 HTML

Canonical 成功後，JAA 必須自動：

1. 產生 Analyzed Result JSON。
2. 以 Snapshot reference 連接原始資料庫，建立 `jaa-analysis-report-data-package-v1`。
3. 每個跨 Server Unique Issue 在 Package 中只保存一份 Snapshot。
4. 使用當次已選取且相容的 HTML Template MD，自動產生第一份 self-contained HTML。

Artifact 可解析但正式 validation 失敗時，建立 Diagnostic Report Data Package 與 Diagnostic HTML；不得建立正式 Canonical 或寫入 SQLite。

### 決策十二：HTML 只讀 Package + Template，支援同 Package 多模板離線重繪

HTML Renderer 的直接輸入只有 Report Data Package JSON 與 HTML Template MD。開啟或重繪 HTML 時不得查詢 Jira、SQLite 或 AI Analysis DB，不得呼叫 ChatGPT，也不得重新分類。Template 只能以 allowlisted declarative DSL 控制顯示的統計、欄位、篩選與版面；核心去重、時間、Snapshot 與統計語意固定在 renderer／contract。

同一份 Report Data Package 可使用不同的相容 Template 產生多份 HTML。External Report Data Package 在本版本只允許檢視／渲染，禁止直接匯入正式 SQLite。

## 4. 既有架構決策維持不變

1. 正式分析使用固定內建官方 Codex `0.147.0`。
2. 啟動時驗證 runtime 路徑、版本與 SHA-256。
3. 不搜尋 `PATH`、不使用本機外部 Codex、不自動下載、不允許外部 fallback。
4. 不直接整合 OpenAI API key 流程；維持既有 JAA Managed ChatGPT/OAuth 與 Codex app-server 架構。
5. 單一 Run、單一 request、單一 thread、單一主要 turn；不得因本版本新增固定 batch、逐筆 request、逐筆 turn 或自動 repair。
6. ChatGPT 對話與 Provider stream 只保存在 JAA 本機，不要求同步 ChatGPT 網頁。
7. Provider 的正式分析輸入仍為 `1 JSON + 3 MD`；HTML Template 僅供 JAA 本機 renderer 使用，不送給模型。
8. Failed、diagnostic-only 或未通過正式 gate 的結果不得寫入正式 SQLite。
9. Provider stream 與 conversation 維持 append-only、buffered durable flush；不得恢復逐 delta 同步寫入造成效能退化。

## 5. 版本化規則文件

本版本須建立、封裝、顯示並驗證以下檔案：

- `Skill_Analysis_Rule_Set_Manifest_v0.6.0.md`
- `Skill_Classification_Common_Rules_v1.5.0.md`
- `Skill_Catalog_v0.3.1.md`，僅在內容完全不變時可維持此版本；若內容有任何變更，必須正確升版
- `Skill_Analysis_HTML_Report_Template_v1.4.0.md`

所有 MD 的版本號必須出現在檔名與文件內部 machine-readable metadata。檔名版本、內部版本、Manifest 宣告必須一致。

若 Catalog 不需改動，必須證明封裝內容與 v0.3.1 byte-for-byte 相同；不得在內容已變更時仍沿用 v0.3.1。

## 6. 規則檔案選擇 UI 與資料契約

分析設定頁至少包含：

- 待分析 JSON
- Rule Set Manifest MD
- Classification Common Rules MD
- Skill Catalog MD
- HTML Report Template MD
- Instruction Mode
- 選填附加說明／自訂診斷指令

每個檔案欄位顯示：

- Role
- 完整路徑
- 實際 versioned basename
- 內部文件版本
- byte length
- SHA-256
- source kind：`bundled` 或 `user_selected`
- 驗證結果與錯誤原因

### 6.1 內建預設模式

四份 MD 必須全部來自同一套正式 bundled rule set，通過 manifest binding 後才能開始分析。

### 6.2 手動選取模式

使用者必須逐一指定四份 MD。禁止：

- 猜測角色
- 搜尋同目錄替代檔案
- 取版本最高者
- 混入 bundled 檔案補缺
- 驗證失敗後靜默 fallback

### 6.3 Manifest binding

Manifest 至少逐角色綁定：

- role ID
- exact basename
- document version
- byte length
- SHA-256
- schema／contract identity
- required／optional
- allowed consumer

不一致時必須在 Provider dispatch 前阻擋，顯示所有 mismatch。

## 7. Source Input、Model Analysis Package 與 Receipt

### 7.1 Source Input Receipt

保留使用者原始待分析 JSON 的：

- original full path
- basename
- byte length
- SHA-256
- strict UTF-8 validation
- record count
- stable identity inventory

原始檔不得被改寫、重新格式化或覆蓋。

### 7.2 Model Analysis Package

JAA 可由原始 JSON 建立一份 lossless、deterministic 的模型可見 JSON，目的是加入可驗證的 Evidence Segment metadata。它仍是送給模型的唯一 JSON，且不得：

- 摘要或截斷正文
- 翻譯內容
- 改寫標點、空白、換行、Unicode 或 NBSP
- 移除 Diff context
- 改變 records 順序或 Stable ID

Provider 最終仍收到 `1 Model Analysis Package JSON + Manifest MD + Common Rules MD + Catalog MD`。HTML Template 不送 Provider。

### 7.3 Model Delivery Receipt

Source Receipt 與 Model Delivery Receipt 必須分離。後者至少記錄：

- package path
- package bytes／SHA-256
- segment count
- record count
- resumable delivery cursor／ACK／EOF
- Provider accepted/completed 狀態

## 8. Evidence Segmenter 1.0.0

建立 deterministic、local-only、可測試的 Evidence Segmenter。每個 segment 至少包含：

```text
evidenceSegmentId
recordIndex
sourceRecordStableId
evidenceRef
hunkId
lineType
oldLineNumber
newLineNumber
exactText
evidenceRoleEligibility
sourceJsonPointer
segmentSha256
```

### 8.1 lineType 與 eligibility

- Added line／新增欄位／新 Comment body：可為 `PRIMARY_CHANGE`
- Removed line／刪除欄位：可為 `PRIMARY_CHANGE`
- Unchanged Diff context：只能為 `SUPPORTING_CONTEXT`
- 無法歸因到本筆 event 的文字：`INELIGIBLE`

Comment 類型需把新建立 Comment 的本文視為可歸因 primary evidence，但仍要保留對應 pointer 與 hash。

### 8.2 不可變性

Segmenter 與 Evidence Normalizer 只能建立定位資料，不得清洗成另一段語意不同的文字。必須保留：

- Unicode
- CRLF／LF 的可追溯性
- tabs 與 spaces
- NBSP
- punctuation
- Markdown／JSON escape 的原始對應

顯示層可做安全視覺格式化，但 validator 必須對 frozen segment catalog 驗證。

## 9. Decision Contract v4

模型 artifact identity：`jaa-ai-analysis-decisions-v4`。

根層必須是直接 JSON array，精確等於輸入 N 筆，recordIndex 從 `0` 到 `N-1`，不得包在 Markdown code fence 或額外物件中。

每筆至少維持既有 v3 必要欄位，並將每個 Skill Finding 的 evidence 改為可追溯物件：

```json
{
  "skillId": "GC_006",
  "confidence": 0.91,
  "explanation": "繁體中文的獨立判斷理由",
  "evidenceQuotes": [
    {
      "evidenceRef": "...",
      "evidenceSegmentId": "seg_...",
      "quote": "必須與 segment exactText 中的連續內容完全一致",
      "evidenceRole": "PRIMARY_CHANGE"
    }
  ],
  "negativeChecks": []
}
```

### 9.1 核心約束

1. 每個 `CLASSIFIED` Skill Finding 至少一個有效 `PRIMARY_CHANGE` quote。
2. `SUPPORTING_CONTEXT` 可補充 primary evidence，但不得單獨支撐 CLASSIFIED。
3. 只有 context 顯示技術候選、但無可歸因變更時，應為 `NEEDS_REVIEW`，並明確說明歸因不足。
4. 沒有可歸因技術活動時應為 `EXCLUDED`。
5. `UNKNOWN` 必須符合新版 status matrix，不得因空 `negativeChecks` 被不一致地拒絕。
6. Multi-skill 必須保存每個 Skill 的獨立 explanation 與 evidence，不得共用一段模糊總結。
7. 模型 final assistant response 可有繁體中文短摘要與問題回報，但正式 Decision JSON 必須保持乾淨且只經 Bridge artifact channel 提交。

## 10. 聚合式 Validator

Validator pipeline 固定分層：

1. Artifact parse
2. JSON Schema
3. count／index／Stable ID／source hash identity
4. Evidence Segment reference
5. Exact quote
6. Attribution role
7. Semantic status matrix
8. Quality gate
9. Canonical assembly
10. Formal HTML
11. SQLite

除非 artifact 完全不可解析，使後續無可靠輸入，否則不得在第一個 finding 直接 throw 結束。每一層必須回傳結構化 findings，至少包含：

- code
- severity
- stage
- recordIndex
- sourceRecordStableId
- skillId
- evidenceSegmentId
- JSON pointer
- expected
- observed
- Traditional Chinese message

### 10.1 必要錯誤碼

至少包含：

- `EVIDENCE_SEGMENT_NOT_FOUND`
- `EVIDENCE_QUOTE_NOT_EXACT`
- `EVIDENCE_ROLE_MISMATCH`
- `PRIMARY_CHANGE_REQUIRED`
- `CONTEXT_ONLY_CLASSIFICATION`
- `NON_SUBSTANTIVE_EVIDENCE`
- `BOILERPLATE_EVIDENCE_PATTERN`
- `MULTI_SKILL_INDEPENDENT_FINDINGS_MISSING`
- `STATUS_MATRIX_VIOLATION`
- `CATALOG_SKILL_NOT_ALLOWED`
- `COUNT_OR_IDENTITY_MISMATCH`

同一份 frozen segment catalog 必須供 validator、Canonical assembler、HTML renderer、Debug evidence 使用；不得各自重新解析產生不同判斷。

### 10.2 驗證報告

每個 Run 產生：

- `validation/schema-findings.json`
- `validation/semantic-findings.json`
- `validation/evidence-findings.json`
- `validation/quality-findings.json`
- `validation/validation-summary.json`

UI 顯示總錯誤數、warning 數、受影響 records、各 code 分布與可點擊定位，不得只顯示第一筆。

## 11. Quality Gate

Quality Gate 即使 Semantic Validation 已失敗，也要在安全可行範圍內唯讀執行，以便一次回報全部問題。

### 11.1 無實質內容檢查

下列 quote 若沒有同段可辨識的技術行為、技術物件或結果，應標記：

- 純章節標題
- 單獨連結
- 單獨檔名或圖片名
- 通用「完成」、「修改」、「測試」字樣
- 無特徵的一般 log 前綴
- 只有標點、括號或格式符號
- 過短且無技術辨識力的片段

必須設計 allowlist／結構規則，避免誤判有效短 token，例如 `HTTP 500`、`NullPointerException`、`fsync`、`GC_006`、函式名、參數名或明確狀態值。

### 11.2 樣板化檢查

建立 deterministic skeleton fingerprint：將 record index、Skill ID、quote、數字與可變識別碼正規化後，比較跨筆 explanation／negativeChecks。若大量內容僅替換索引或 Skill ID，必須標示 boilerplate risk。

不得自動重寫模型結果；Quality Gate 只負責可驗證診斷與正式 gate。

### 11.3 其他必要檢查

- context-only classification
- generic explanation
- quote 無法 trace 回 source pointer
- 多 Skill 未分別說明
- 過度分類或 findings 異常密集
- 使用不存在、草稿或 Manifest 不允許的 Skill ID

## 12. Canonical、Analyzed Result、Snapshot Reference 與 SQLite Gate

只有下列條件全部成立才可建立正式 Canonical：

- Provider completed
- Artifact published and parsed
- Schema passed
- Identity passed
- Evidence reference／exact quote passed
- Attribution passed
- Semantic passed
- blocking Quality findings 為 0

正式 Canonical 建立後，才可：

1. 以 Pending JSON records 為骨架，deterministic assembly 產生 Analyzed Result JSON。
2. 顯示正式 AI 分析結果。
3. 建立正式 Report Data Package。
4. 以當次選取 Template 產生第一份 Golden HTML。
5. 開放 SQLite 寫入或重試。

### 12.1 Analyzed Result JSON 契約

Analyzed Result JSON 必須：

- 保留 Pending JSON 的 record 數量、順序、Diff、Stable ID、source hash 與原始追溯 metadata。
- 只新增 Decision v4 結果、Canonical 衍生結果、validation／quality、Run／Rule identity 與 `issueSnapshotReference`。
- 不把完整 Issue Snapshot 複製到每個 Event record。
- 對同一 Pending input + Decision artifact + Rule Set 產生 deterministic bytes／hash，時間與環境欄位須隔離至 receipt 或明確 canonicalization。

### 12.2 AI Analysis DB

- 維持分析結果與來源 Event 的 Run-scoped、stable identity。
- 每筆結果只保存 Snapshot reference；不得為了報告需求複製完整 Snapshot。
- Snapshot reference 至少含 `jiraServerIdentity`、`normalizedIssueKey`、`snapshotId`、`snapshotSha256`。
- 若原始 DB unavailable 或 hash 不符，AI 分析結果仍可檢視，但不得偽造 Snapshot 或把不完整報告標示為完整。

SQLite 必須維持 Run-scoped identity、同 Run idempotent retry、transaction、atomic child replacement、rollback evidence。HTML 成功不得被 SQLite 失敗遮蔽；SQLite 失敗標記 `completed_with_persistence_error`。

## 13. Report Data Package、診斷 HTML 與 Template v1.4.0

`Skill_Analysis_HTML_Report_Template_v1.4.0.md` 必須定義兩種 rendering mode：

- `FORMAL_CANONICAL`
- `DIAGNOSTIC_NON_CANONICAL`

### 13.1 Report Data Package Builder

新增 local-only deterministic builder，正式契約為 `jaa-analysis-report-data-package-v1`。輸入是 Analyzed Result／Canonical、原始 DB Snapshot source、Run receipts 與 rule identities；輸出至少包含：

```text
schemaVersion / packageId / packageMode / runId / generatedAt
sourceAnalysisIdentity / sourceCanonicalIdentity
ruleSet / decisionContract / canonicalContract / qualityContract
eventScope / baseCounts / dataCompleteness
records[]
issueSnapshots[]
snapshotFieldDefinitions[]
validationFindings[] / qualitySummary
capabilities[]
inputReceipts[] / packageSha256
```

規則：

- `records[]` 只保存 `issueSnapshotReference`，不複製 Snapshot。
- `issueSnapshots[]` 每個 composite identity 僅一筆：`jiraServerIdentity + trim(issueKey).toUpperCase()`。
- 同 identity 出現互斥 Snapshot 時，不得 last-write-wins；記錄 `ISSUE_SNAPSHOT_CONFLICT`、所有候選 hash 與衝突欄位。
- Activity 範圍以 Event timestamp；Issue Type／Priority／Status／Project 等是 Run `capturedAt` 時點 current-state，報告必須明示。
- Snapshot 欄位 state 必須是 `PRESENT`、`EMPTY`、`NOT_APPLICABLE`、`NOT_CAPTURED`、`SOURCE_UNAVAILABLE`、`CONFLICT` 之一。
- Bug 可有 `rootCause`；Feature 無此欄位時必須是 `NOT_APPLICABLE`，不得誤報為空值或來源遺失。
- Package 使用 `.tmp`、fsync、atomic rename、reopen/hash verify，並產生 builder receipt。

核心 Snapshot profile 至少包含 server／database／snapshot identity、Issue ID／Key、Project、Summary、Issue Type、Priority、Status、Resolution、created／updated／resolved／start／due、Labels、Components、Fix／Affected Versions，以及安全且穩定的 Assignee／Reporter／Creator reference。型別專屬欄位置於 `snapshotFields`，定義置於 `snapshotFieldDefinitions`。

### 13.2 自動產生與手動重繪生命週期

正式分析成功時，單一 Run 依序自動執行：

```text
Provider Decision v4
→ Canonical
→ Analyzed Result JSON
→ Formal Report Data Package
→ selected Template validation
→ first Formal HTML
→ SQLite gate（獨立狀態）
```

不要求操作者另按一次按鈕才建立第一份 Package／HTML。之後「匯入 Report Data Package」或「使用其他 Template 重新產生 HTML」是獨立 local-only 工作：Provider `NOT_USED`、Token `0`、不啟動 Codex process、不改寫原 Package。

若新 Template 要求 Package 不具備的欄位／capability，fail closed 並列出缺項。只有操作者明確選擇原始 DB 後才可重建新 Package；重建 Package 不呼叫 ChatGPT。

### 13.3 診斷 HTML 觸發條件

只要 Decision artifact 已發布且可解析，但後續 Schema、Identity、Evidence、Attribution、Semantic、Quality 或 Canonical assembly 失敗，就由 JAA 本機建立 Diagnostic Report Data Package，再產生診斷 HTML，不得再呼叫 Provider。

### 13.4 檔案命名

- 正式：`analysis-result__template-v{templateVersion}__{renderedAtLocal}.html`
- 診斷：`analysis-result-diagnostic__template-v{templateVersion}__{renderedAtLocal}.html`

兩者不得同名、不得互相覆蓋。每次 render 都建立 `jaa-html-render-receipt-v2`，綁定 Package、Canonical（若有）、Template、Renderer 與 output bytes／SHA-256。

### 13.5 診斷 HTML 標示

頁面頂端固定紅色警示：

> 非正式診斷預覽：此分析未通過 JAA 正式驗證，不可匯入資料庫，亦不可視為正式分析成果。

必須顯示：

- Run ID、版本、時間與輸入 identity
- Provider／Artifact／各 validator stage 狀態
- 所有 aggregated findings 與統計
- 每筆 Decision 原始可解析內容
- Evidence Segment ID、role、line type、source pointer
- quote 與對應 primary/context 來源
- 完整 normalized evidence，包含 Diff context
- 點擊 finding 跳到對應 record／skill／segment

### 13.6 HTML 能力

正式與診斷 HTML 都必須是 offline、self-contained、CSP-safe，不依賴 CDN，並保留或改善：

- 關鍵字搜尋
- Status、Skill、Issue Type、Priority、Evidence Role、Validation State 多選篩選
- AND／OR 篩選方式
- 清除篩選
- 每頁筆數與 pagination
- 展開目前結果／收合全部
- 欄位多選顯示／隱藏與還原預設
- 匯出目前篩選 CSV
- 列印報告
- 顯示 `目前顯示 X / N` 與 active filter chips
- 每一欄位的名稱、定義與資料來源說明

Evidence Quote 預設顯示可讀文字，不得充滿 JSON escape、反斜線與無意義符號；另提供「查看原始值」與 source trace。

### 13.7 統計口徑與 Template DSL

至少顯示：

- Event records
- Unique Issues
- Issues with multiple events
- Duplicate event occurrences
- Decision Status 分布
- Skill 分布
- Issue Type 分布
- Priority 分布
- Evidence Role 分布
- Validation／Quality finding 分布

- Component／Label 分布，例如 `Cop_Controller`、`Cop_Customer_Spec`、`Cop_Flash`
- Snapshot field state 與型別專屬欄位，例如 Root Cause

Issue Type 與 Priority 必須以跨 Server Unique Issue identity 去重；同一 Issue 有多筆 Activity Event 只計一次。Snapshot 衝突不得任選，必須顯示 conflict count。

Template 可宣告 allowlisted `population`、`metric`、`field`、label、排序、Top N 與 presentation。禁止任意 JavaScript、SQL、JSONPath 或 expression eval。核心去重、時間範圍、Snapshot current-state、missing-state 與 filter population 語意由 renderer 固定，Template 不得覆寫。

### 13.8 Template Compatibility

Render 前聚合檢查：

- Template schema／ID／version／bytes／SHA-256
- Report Data Package contract／mode／hash
- Decision／Canonical／Snapshot contract
- minimum renderer version
- required capabilities／required snapshot fields
- CSP／security allowlist

未知 capability、缺少必要欄位、版本不相容或不安全指令一律 fail closed。相容時，同一 Package 可用不同 Template 產生多份 HTML。

## 14. Results UI 與生命週期

UI 不得再以單一 `failed` 隱藏所有資訊。至少分別呈現：

- Provider status
- Input receipt status
- Model delivery status
- Artifact status
- Schema status
- Evidence／Attribution status
- Semantic status
- Quality status
- Canonical status
- Analyzed Result JSON status
- Report Data Package status／mode／completeness
- Diagnostic HTML status
- Formal HTML status
- SQLite status

必要操作：

- 查看完整本機對話
- 查看 final assistant response
- 查看全部 validation findings
- 開啟診斷 HTML
- 開啟正式 HTML
- 匯入 External Report Data Package（只讀檢視／渲染）
- 明確選取另一份 HTML Template 重新產生 HTML
- 在缺少必要 Package 欄位時，明確選擇原始 DB 後重建 Package
- 不呼叫 Provider 重新產生 HTML
- Canonical 成功時重試 SQLite
- 複製 Run path／artifact path／hash

禁止顯示未經證明的百分比或 `0/N` 假進度。可顯示可證明的 Provider event、artifact、validation 與 record count。

## 15. Debug Folder Canonical Evidence

Debug collector 必須先 flush 所有 writer，再依 Run manifest 的 role inventory 收集檔案。

### 15.1 Role-based inventory

每筆至少包含：

- role
- actual versioned basename
- full source path
- archive relative path
- bytes
- SHA-256
- expected／actual
- present／absent
- absent reason
- flush completeness

禁止繼續硬編碼 `render-workspace/html-report-template.md` 等 alias。Run 實際使用 `Skill_Analysis_HTML_Report_Template_v1.4.0.md` 時，Debug Folder 必須保留該 basename 或可逆的 role-scoped versioned path。

### 15.2 必收證據

- Run manifest／lifecycle
- Source Input Receipt
- Model Delivery Receipt
- effective instruction（繁體中文）
- provider-stream.jsonl
- conversation.jsonl
- final assistant response
- artifact submissions 與每次 accepted/rejected metadata
- parsed Decision artifact（如存在）
- frozen Evidence Segment catalog
- 四份 validation findings
- Quality summary
- Canonical、Analyzed Result JSON、Formal Report Data Package、formal HTML 與 render receipt（如存在）
- Diagnostic Report Data Package、diagnostic HTML 與 render receipt（如存在）
- Snapshot Builder receipt、Snapshot conflict／completeness findings
- SQLite evidence（如執行）
- 四份實際使用的 versioned MD
- `debug-completeness.json`
- `debug-file-manifest.json`

若 artifact 已發布後驗證失敗，Canonical absent reason 必須說明「artifact 已發布，但被哪個 gate 阻擋」，不得錯報成「在 artifact publication 前結束」。

## 16. 標準正式分析指令

更新 bundled Standard Formal instruction，內容使用繁體中文，至少明確要求模型：

1. 完整分析 N 筆，直接提交 Decision v4 JSON artifact。
2. 只從 Model Analysis Package 的 frozen Evidence Segment 選取 quote。
3. CLASSIFIED 每個 Skill 至少一個 `PRIMARY_CHANGE`。
4. `SUPPORTING_CONTEXT` 不得單獨支撐分類。
5. 每個 Skill 需獨立 explanation 與 evidence。
6. 完成前自我檢查筆數、索引、Stable ID、Skill ID、segment ID 與 evidence role。
7. final assistant response 以繁體中文回報：是否完成、提交次數、狀態分布、可疑或不完整之處、是否建議正式採用。
8. 不要求模型使用 PowerShell／Shell 寫檔；只透過受控 Bridge artifact tool 提交。

保留三種 Instruction Mode。`標準 + 使用者指令` 可補充需求但不得覆寫安全、契約、精確筆數與 gate；`自訂診斷` 不產生正式 Canonical，也不可寫 SQLite。

## 17. 規則 MD 內容更新

### 17.1 Manifest v0.6.0

加入：

- 四角色 exact binding
- Decision v4 identity
- Segmenter identity
- evidence role contract
- status matrix identity
- Template v1.4.0 binding
- Canonical v5、Report Data Package v1、Issue Snapshot Profile v1 與 HTML Render Receipt v2 identity
- Package Builder／Renderer capability matrix
- consumer matrix：Provider／Validator／Renderer／Debug
- bytes／SHA-256，由最終檔案計算後回填

若 Manifest 包含自身 hash 造成循環，採明確可重現的 manifest canonicalization 規則，不得填入假 hash。

### 17.2 Common Rules v1.5.0

延續 PRIMARY_CHANGE、SUPPORTING_CONTEXT、INELIGIBLE、Comment 歸因與 Quality 規則，新增 Pending／Analyzed／Snapshot／Report Package 分層、Snapshot field state、跨 Server Unique Issue、automatic package/render 與 Template DSL 邊界。

### 17.3 Catalog

維持 Skill 定義本身；只有實際內容需要變更時才升版。不得把 pipeline／renderer 實作規則塞進 Catalog。

### 17.4 HTML Template v1.4.0

完整定義 formal／diagnostic Report Package mode、欄位字典、Snapshot field state、declarative statistics DSL、多選篩選、pagination、column visibility、Evidence readable／raw／trace、capability negotiation、多模板重繪與 CSP requirements。

## 18. 自動化測試

新增 `npm.cmd run test:v0.3.24`，至少涵蓋：

### 18.1 File selection／Manifest

- bundled 四檔成功
- manual 四檔成功
- 缺任一角色 fail closed
- filename／internal version／hash／bytes mismatch 聚合回報
- 禁止 silent fallback
- versioned basename 正確保存與打包

### 18.2 Evidence Segmenter

- 同輸入必須產生相同 segment ID 與 hash
- Added／Removed／Comment body 為 primary eligibility
- Context 只能 supporting
- Unicode、中文、NBSP、CRLF、tabs、punctuation 可精確 round-trip
- source pointer 可追溯

### 18.3 Decision v4／Validator

- exact N、index、Stable ID
- segment 不存在
- quote 不 exact
- role mismatch
- CLASSIFIED 缺 primary
- context-only CLASSIFIED
- mixed primary + context 成功
- Multi-skill 獨立 findings
- UNKNOWN matrix
- 一次輸入至少五個不同錯誤，確認全部聚合而非只回第一筆

### 18.4 Quality Gate

- 純標題、連結、檔名、圖片、格式符號被抓出
- `HTTP 500`、函式名、錯誤碼等短技術 token 不被誤判
- 大量 explanation skeleton 重複被抓出
- semantic 已失敗仍產生可安全完成的 quality findings

### 18.5 HTML

- Canonical 成功自動產生 Analyzed Result、Formal Package 與第一份 formal HTML
- 各 gate 失敗產生 Diagnostic Package 與 diagnostic HTML
- diagnostic 有紅色非正式標示且無 SQLite eligibility
- finding deep link 可定位
- multi-select、AND／OR、pagination、欄位顯示、CSV、print、CSP、離線開啟
- Issue Type／Priority 以 Unique Issue 去重
- Evidence 預設可讀、raw 與 trace 可切換
- 同一 Package 使用兩份相容 Template 產生兩份 HTML，Provider 未被呼叫
- 缺 required capability／Snapshot field fail closed
- 惡意 script／SQL／fetch／expression Template 被拒絕

### 18.6 Report Data Package／Snapshot

- Pending／Analyzed JSON 不含重複完整 Snapshot
- Analyzed records 的 Snapshot reference 可回到唯一 Snapshot
- 同 Server Issue Key 正規化去重；不同 Server 同 Key 不可誤合併
- 相同 Issue 多 Event 只保存一份 Snapshot
- conflict 產生 `ISSUE_SNAPSHOT_CONFLICT`，禁止 last-write-wins
- 六種 Snapshot field state 正確 round-trip
- Bug Root Cause 與 Feature `NOT_APPLICABLE` 正確
- Event 與 Unique Issue 統計分母清楚，Bug／P1／Component／Label 數量正確
- Package `.tmp`／fsync／atomic rename／reopen hash receipt
- External Package 只能 view/render，正式 SQLite gate 永遠拒絕

### 18.7 Debug completeness

- versioned Template 被正確收集，不再尋找 alias
- post-artifact validation failure 的 absent reason 正確
- formal／diagnostic output 依狀態收集
- writer flush 與 archive hash 驗證

### 18.8 SQLite

- failed／diagnostic-only 不可寫入
- Canonical 成功才開 gate
- idempotent retry
- transaction rollback
- HTML 成功但 SQLite 失敗仍可檢視結果

測試 fixture 必須是 synthetic 且不含真實 Jira 私密資料。

## 19. 唯讀 17／117 筆 Regression 驗證

若本機既有歷史 Debug Folder 或 fixture 可用，可進行唯讀檢查，不得修改、提交或把原始內容放入報告。

### 19.1 17 筆 case

已知基準：17 records、38 quotes。需確認 38/38 能 trace 到 frozen segments，並區分 primary／supporting；不得再出現「quote 明明存在卻被舊 validator 拒絕」的假陰性。

### 19.2 117 筆 case

已知基準：117 records、104 Skill Findings、104 quotes。舊檢查為 104/104 存在完整 normalized evidence，99 筆在 Added／Removed，5 筆只存在 Diff context。

新版必須：

- 列出全部 context-only findings，而非停在第一筆
- 不可把 context-only 直接當 CLASSIFIED primary evidence
- 驗證 117 Events、28 Unique Issues、26 個多事件 Issue、89 個 duplicate event occurrences 的統計由資料 deterministic 算出
- 若 Decision v3 無 v4 segment role，不得偽裝成正式 v4 PASS；只可產生 migration／diagnostic regression report

## 20. 效能與 Provider 行為

本版本的修正應主要發生在本機 preprocessing、validator、renderer 與 Debug collector，不得因此增加 Provider 往返。

要求：

- 正式分析仍單一主要 turn
- 不新增逐筆 request
- 不新增固定 batch
- 不新增自動 repair
- 不因診斷 HTML 再呼叫 Provider
- 分別量測 segmenter、model package assembly、delivery、provider wait、validation、canonical、analyzed-result assembly、Report Data Package build、HTML、SQLite 與 Debug export
- offline re-render 必須證明 Provider 未使用、Token 為 0、Codex process 未啟動

保留既有 14／15 分鐘效能提示與 20 分鐘 hard timeout 設計，但必須以實際 lifecycle 判斷，不得把仍有 delta 的正常串流顯示成無回應。

## 21. Build、Package 與啟動驗證

至少執行並記錄實際耗時：

```powershell
npm.cmd run typecheck
npm.cmd run test:v0.3.24
npm.cmd run build
git diff --check
npm.cmd run dist
```

驗證：

- Installer EXE
- Portable EXE
- win-unpacked EXE
- bytes 與 SHA-256
- ASAR inventory
- bundled Codex version／path／SHA-256
- v0.3.24 Bridge 與 Segmenter／Renderer identity
- 四份 versioned MD 存在且 hash 與 Manifest 一致
- Report Data Package Builder／Snapshot Profile／Render Receipt identity 正確
- stale Bridge／Rule／Template 不被正式 runtime 誤用
- ASAR 敏感檔名與 credential pattern 為 0
- win-unpacked 短啟動
- 隔離 Portable 短啟動
- `renderer_boot`、`did-finish-load`、route ready
- 無 white screen、renderer crash 或 `did-fail-load`

若 electron-builder 有既有 warning，逐項列出是否阻擋交付，不得把 warning 隱藏。

## 22. 報告與 Execution Ledger

至少產生：

- `JiraActivityAnalyzer_v0.3.24_test_and_verification_report.md`
- `JiraActivityAnalyzer_v0.3.24_artifact_manifest.json`
- `JiraActivityAnalyzer_v0.3.24_execution_time_ledger.json`
- `JiraActivityAnalyzer_v0.3.24_decision_v4_contract_report.md`
- `JiraActivityAnalyzer_v0.3.24_evidence_segmenter_report.md`
- `JiraActivityAnalyzer_v0.3.24_aggregating_validator_report.md`
- `JiraActivityAnalyzer_v0.3.24_quality_gate_report.md`
- `JiraActivityAnalyzer_v0.3.24_html_renderer_report.md`
- `JiraActivityAnalyzer_v0.3.24_report_data_package_contract_report.md`
- `JiraActivityAnalyzer_v0.3.24_issue_snapshot_profile_report.md`
- `JiraActivityAnalyzer_v0.3.24_template_compatibility_report.md`
- `JiraActivityAnalyzer_v0.3.24_rule_file_selection_report.md`
- `JiraActivityAnalyzer_v0.3.24_debug_completeness_report.md`
- `JiraActivityAnalyzer_v0.3.24_sqlite_regression_report.md`
- `JiraActivityAnalyzer_v0.3.24_rule_template_alignment_report.md`

Execution Ledger 必須分項記錄 command、開始／結束、duration、exit code、結果與證據路徑。Token telemetry 只能填實際可取得值；若環境未提供，填 `unavailable`，禁止估算冒充。

## 23. Git 交付流程

1. 開始前記錄 status、branch、HEAD、remote、tracked dirty 與 untracked inventory。
2. 建立 `feat/v0.3.24-evidence-report-data-template-rendering`。
3. 僅 stage 本版本檔案，逐一核對，不得使用可能納入使用者資料的粗放操作。
4. 完成原始碼與測試 commit。
5. 以該 source commit 重新 build／dist。
6. 產生最終 artifact manifest 與報告，再建立 final delivery commit。
7. 建立 annotated tag `v0.3.24`，指向 final delivery commit。
8. Push branch 與 tag，不得 force push。
9. 驗證 upstream ahead／behind `0/0`、remote branch SHA 與 remote tag target。

若 push 因權限、安全審查或網路被拒絕，停止並誠實回報；不得繞過。

## 24. Definition of Done

以下全部達成，才可宣告自動化交付完成：

1. 四份 MD 有獨立角色欄位，支援 bundled／manual，沒有猜檔或 fallback。
2. 所有 MD 版本皆顯示於檔名，Manifest binding 可驗證。
3. Decision v4、Evidence Segmenter 與 evidence role 契約一致。
4. CLASSIFIED 必須有可歸因的 primary evidence；context-only 不再誤判。
5. Validator 一次回報全部可安全檢查的問題。
6. Artifact 發布後驗證失敗仍可產生非正式診斷 HTML。
7. 無實質內容、樣板化、多 Skill 與 traceability Quality Gate 有測試。
8. Debug Folder 依 role 收集 versioned files，absent reason 正確。
9. Pending／Analyzed JSON 不重複完整 Snapshot，AI DB 只保存 Snapshot reference。
10. Formal／Diagnostic Report Data Package、Unique Issue Snapshot 與六種 field state 契約通過。
11. 正式分析成功自動產生第一份 Package／HTML；同 Package 可用不同相容 Template 離線重繪。
12. HTML render 不查詢 DB、不呼叫 Provider；External Package 不可直接寫正式 SQLite。
13. 正式 Canonical／HTML／SQLite gate 不被放寬。
14. typecheck、test、build、diff check、dist 與短啟動均通過。
15. ASAR、runtime identity、SHA-256、敏感資料掃描完成。
16. Git branch、final commit、annotated tag 與 push 均經核對。

真實 Managed OAuth 17／117 筆、production SQLite、完整 Installer GUI 或乾淨 Windows walkthrough 若未實際執行，整體狀態必須是：

`Partial / Manual Validation Pending`

不得宣告 Fully Validated。

## 25. 最終回覆格式

最後以繁體中文提供精簡但完整的交付摘要，至少包含：

- Target Version 與 Overall Status
- Branch、Package Source Commit、Final Delivery Commit、Tag
- 十二項決策各自的實作結果
- Decision／Canonical／Bridge／Segmenter／Report Package／Snapshot／Renderer／四份 MD identity
- 所有驗證 command 的 PASS／FAIL 與實際耗時
- Installer／Portable／win-unpacked 路徑、bytes、SHA-256
- ASAR 與敏感資料掃描結果
- 17／117 regression 實際執行狀態與結果
- Manual Validation Pending 清單
- Git push、upstream ahead／behind、remote SHA
- 保留的既有 dirty／untracked 使用者資料聲明
- 報告檔案路徑
- Actual token telemetry；不可取得時明確標示 `unavailable`

任何未執行項目都必須標示未執行，不得以推測、mock 或 unit test 結果冒充。
