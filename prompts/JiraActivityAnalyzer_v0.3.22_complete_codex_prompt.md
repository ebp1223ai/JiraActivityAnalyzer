# Jira Activity Analyzer v0.3.22 — Decision v3、Readable Evidence、Advanced HTML Report 完整實作與交付 Prompt

## 0. Prompt Metadata

- Prompt File：`JiraActivityAnalyzer_v0.3.22_complete_codex_prompt.md`
- Prompt Version：`1.0.0`
- Target Application：`Jira Activity Analyzer`
- Target Version：`0.3.22`
- Target Repository：`F:\AI\JiraActivityAnalyzer`
- Expected Remote：`https://github.com/ebp1223ai/JiraActivityAnalyzer.git`
- Prepared Date：`2026-08-19`
- Required Locale：繁體中文（`zh-TW`）
- Target Platform：Windows 10／11 x64
- Delivery：Installer、Portable、win-unpacked、完整報告、Git Commit、Annotated Tag、Push

---

## 1. 角色與任務

你是 Jira Activity Analyzer 的主要實作者與發版工程師。請在既有 repository 中完成 v0.3.22，主題為：

> Decision v3 per-skill evidence、Schema／Semantic／Quality Gate、Readable Evidence、Run-scoped Issue Snapshot、Advanced HTML Report、truthful lifecycle、run-safe SQLite 與 Canonical Debug Evidence。

這不是只製作靜態 UI，也不是只修改測試。必須完成正式產品程式碼、型別、Schema、Bridge、Prompt、Rule／Template MD、Renderer、SQLite Gate、Debug Folder、Results UI、自動化測試、正式 Build／Dist、短啟動驗證、報告、Commit、Annotated Tag 與 Push。

請先完整檢查現有 v0.3.21 實作、測試、bundled rules、Decision v2、Analysis Bridge、HTML Renderer、AI Analysis Results UI、SQLite persistence、Debug Folder 與既有 dirty worktree，再進行最小且一致的修改。

不得只回覆設計、範例或建議；除非遇到真正無法安全處理的 blocker，否則必須一路執行到正式交付。

---

## 2. 使用者已確認且不可改寫的決策

### 2.1 Provider 與執行方式

1. 正式 ChatGPT 分析仍維持單一 Run、單一 Request、單一 Thread、單一主要 Turn。
2. 模型輸入維持 `1 JSON + 3 MD` local file workspace。
3. 禁止固定批次、逐筆 dispatch、每 20 筆 batch、自動 Repair、額外 Turn 或 fallback 分析。
4. 正式 Artifact 只能提交一次；Validator 拒絕後不得偷偷改資料重送。
5. ChatGPT／Codex 最終回覆及軟體送出的正式分析指令必須使用繁體中文。
6. ChatGPT 對話只保存在 JAA 本機，不要求同步至 ChatGPT 網頁。
7. 不重新導入 direct OpenAI API；不得要求 OpenAI API Key。

### 2.2 Codex Runtime

1. 使用既有 bundled official Codex `0.147.0`。
2. Runtime SHA-256 必須繼續核對：
   `935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d`
3. 不搜尋 PATH、不使用本機外部 Codex、不自動下載、不允許外部 fallback。
4. 啟動時繼續驗證 manifest、實體路徑、版本與 SHA-256。

### 2.3 分析、Canonical、HTML 與 SQLite 邊界

1. ChatGPT 只產生受控 Decision Artifact 與人類可讀分析報告。
2. Stable ID、Evidence ID、source hash、順序、authoritative count、Canonical Result、HTML 與 SQLite 狀態由 JAA 本機決定。
3. HTML Template 不送給 ChatGPT，不得增加成第五份模型輸入。
4. HTML 只能由 JAA 本機 deterministic renderer 依 Canonical Result 產生。
5. HTML 失敗不得阻擋已建立的 Canonical Result 頁面。
6. SQLite 失敗不得阻擋 HTML 或 Canonical Result。
7. Failed／Validation Failed／Interrupted 不得寫正式 SQLite。
8. Quality Warning 未被人工 durable acceptance 前不得寫 SQLite。
9. Custom Diagnostic 不得產生正式 Canonical Result，也不得寫 SQLite。

### 2.4 檔名與版本

1. 每一份正式 Rule／Catalog／Manifest／Template／Instruction MD 的版本必須顯示在檔名。
2. 檔名版本、MD 內部版本、Manifest binding 必須完全一致。
3. Manifest 必須記錄 filename、version、bytes、SHA-256、用途與 model-visible 狀態。
4. 不相符時 fail closed。
5. 正式 package 不得保留無版本別名。

---

## 3. Preflight、工作樹與安全規則

### 3.1 Preflight 必做

開始修改前記錄：

- Repository absolute path。
- Current branch、HEAD commit。
- `git status --short`。
- `git diff --stat`。
- Existing tags／version。
- Remote URL。
- Node、npm、Electron、electron-builder 版本。
- Bundled Codex manifest、版本與實體 SHA-256。
- 目前 Rule／Catalog／Template 檔名、內部版本、bytes、SHA-256。
- 目前 Decision v2 Schema、Bridge、Renderer、Results UI、SQLite 與 Debug Folder 的實際程式位置。

### 3.2 保護既有使用者資料

1. 現有 tracked dirty modifications、untracked files、測試資料、SQLite、PDF、歷史 Prompt、`token.txt`、UI 資料夾與 v0.2.47 report 都屬於使用者。
2. 不得 reset、checkout、clean、stash、覆寫、移動、刪除或提交不屬於本版的既有修改。
3. 禁止 `git reset --hard`、`git clean`、廣域刪除或任何破壞性命令。
4. 只 stage 本版明確修改的檔案；提交前逐檔審查 staged diff。
5. 若本版必須碰到既有 dirty file，先確認是否能局部安全修改並在報告中說明；不可抹除使用者內容。

### 3.3 Branch

建立並使用：

`feat/v0.3.22-decision-v3-readable-evidence-advanced-html`

若分支已存在，先安全確認其 commit、upstream 與內容，不得盲目覆蓋。

---

## 4. 正式版本化文件

v0.3.22 的 bundled formal documents 應為：

1. `Skill_Analysis_Rule_Set_Manifest_v0.4.0.md`
2. `Skill_Classification_Common_Rules_v1.3.0.md`
3. `Skill_Catalog_v0.3.1.md`
4. `Skill_Analysis_HTML_Report_Template_v1.2.0.md`

### 4.1 Catalog

- `Skill_Catalog_v0.3.1.md` 的技能內容與 279 個 Skill ID 不因 App 進版而虛增版本。
- 若沒有必要的技能定義修改，必須 byte-identical 保留既有 v0.3.1 並核對 SHA-256。
- 不得為了配合測試結果新增、刪除、重新編號或硬編碼 Skill。

### 4.2 Common Rules v1.3.0

新增並正式定義：

- Decision v3 per-skill Finding。
- Numeric confidence enum：`0 | 0.3 | 0.6 | 0.9`。
- 每個 Skill 的獨立 Evidence Quote、Explanation、Negative Checks 與 Rationale。
- Record Status／欄位矩陣。
- Evidence normalization 與原始證據不變性。
- Schema／Semantic／Quality Gate 邊界。
- Duplicate quality metrics 只能產生 Warning，不得自行改變分類。
- Excessive skill finding warning。
- 人工接受 Warning 前禁止 SQLite。
- 不得追求固定分類率、固定狀態分布或固定 Skill 數量。

### 4.3 Rule Set Manifest v0.4.0

至少綁定：

- Common Rules `1.3.0`。
- Catalog `0.3.1`。
- Decision Contract `jaa-ai-analysis-decisions-v3`。
- Quality Contract version。
- Prompt `JAA-CHATGPT-ZH-TW-0.3.22`。
- Pipeline `JAA-ANALYSIS-PIPELINE-0.3.22`。
- Evidence Normalizer `JAA-EVIDENCE-NORMALIZER-1.0.0`。
- HTML Template `1.2.0`。
- Renderer `JAA-LOCAL-HTML-RENDERER-1.2.0`。
- Canonical Result contract version。
- Issue Snapshot enrichment contract version。
- 每份文件 filename／version／bytes／SHA-256／model-visible。

### 4.4 HTML Template v1.2.0

必須是 machine-readable contract 加人類說明，完整包含本 Prompt 的 HTML、統計、篩選、顯示欄位、資料字典、安全與 receipt 規格。

### 4.5 禁止無版本正式別名

Bundled rules／正式 package 中不得保留以下正式別名：

- `Skill_Analysis_Rule_Set_Manifest.md`
- `common-rules.md`
- `skill-catalog.md`
- `html-report-template.md`

Run Workspace 必須透過 Role／Manifest 定位實際版本化檔名，並保存原始檔名。歷史 Run 不得回寫或破壞。

---

## 5. Decision Contract v3

建立 strict JSON Schema、TypeScript types、runtime validator、semantic validator、tests 與 SHA-256 identity。

### 5.1 Root

正式 `decisionsDocument` 必須是 direct JSON array，長度精確等於 N；不得包成 `records`、`decisions`、Markdown code fence、stringified JSON 或其他 wrapper。

### 5.2 Record 物件

每筆只能包含以下欄位：

```json
{
  "recordIndex": 5,
  "status": "CLASSIFIED",
  "confidence": 0.9,
  "skillFindings": [],
  "recordNegativeChecks": [],
  "unknownReasons": [],
  "rationale": "此筆 Record 的整體判定理由"
}
```

規格：

- `recordIndex`：integer，唯一且依序完整涵蓋 `0..N-1`。
- `status`：只允許 `CLASSIFIED | UNKNOWN | NEEDS_REVIEW | EXCLUDED | CATALOG_DETAIL_MISSING | FAILED`。
- `confidence`：JSON number，只允許 `0 | 0.3 | 0.6 | 0.9`。
- `skillFindings`：array。
- `recordNegativeChecks`：string array。
- `unknownReasons`：string array。
- `rationale`：non-empty meaningful string。
- `additionalProperties=false`。

### 5.3 Skill Finding

每個 `skillFindings[]` 只能包含：

```json
{
  "skillId": "GC_006",
  "confidence": 0.9,
  "evidenceQuotes": [
    {
      "evidenceRef": "pae_xxx",
      "quote": "GC 卡在 FTLGCCheckProgram()"
    }
  ],
  "evidenceExplanation": "此內容直接描述 GC 流程停滯。",
  "negativeChecks": [
    "已排除只有一般 Log 關鍵字而沒有 GC 行為證據的情況"
  ],
  "rationale": "此證據符合 GC_006 的技術行為定義"
}
```

規格：

- `skillId` 必須存在於本次 Manifest 綁定的 Catalog。
- 同一 Record 不可重複同一 `skillId`。
- `confidence` 只允許 `0 | 0.3 | 0.6 | 0.9`。
- `evidenceQuotes` 必須 non-empty。
- 每個 quote 只能包含 `evidenceRef` 與 `quote`。
- `evidenceRef` 必須對應該 Record 核准來源。
- `quote` 必須能在該 Record 的 deterministic normalized evidence 中精確回查。
- `evidenceExplanation`、`negativeChecks`、`rationale` 都是該 Skill 專屬，不得用 Record 共用句假裝獨立分析。
- `additionalProperties=false`。

### 5.4 Status／欄位矩陣

- `CLASSIFIED`：`skillFindings` non-empty；`unknownReasons=[]`。
- `CATALOG_DETAIL_MISSING`：保留真實 `skillFindings`；`unknownReasons=[]`；rationale 明確指出 Catalog 缺漏。
- `NEEDS_REVIEW`：可有或沒有 candidate；若有 candidate，必須完整 Skill Finding；`unknownReasons=[]`；覆核原因寫入 rationale／checks。
- `UNKNOWN`：`skillFindings=[]`；`unknownReasons` non-empty。
- `EXCLUDED`：`skillFindings=[]`、`unknownReasons=[]`；排除依據放 `recordNegativeChecks`／rationale。
- `FAILED`：`skillFindings=[]`、`unknownReasons=[]`；不可恢復技術錯誤放 rationale。

### 5.5 JAA 本機衍生欄位

下列欄位不得再要求模型提交：

- `skillIds`：由 `skillFindings[].skillId` 依原順序衍生。
- Record／Skill authoritative counts。
- Stable ID、Evidence ID、source hash、Result ID。
- Status／confidence distributions。
- Canonical identity。

若為相容 UI／CSV 暫時需要 `skillIds` 或 `positiveEvidence`，必須清楚標示 `derived`，不得混淆成模型原始輸出。

---

## 6. 繁體中文 Standard Formal 指令

更新內建正式指令版本為 `JAA-CHATGPT-ZH-TW-0.3.22`，必須在不依賴使用者附加指令的情況下正確要求：

1. 完整讀取 1 JSON + 3 MD。
2. 完成 Model Delivery Receipt 後才開始分析。
3. 完整分析 N 筆，不跳讀、不抽樣、不分批、不 Repair。
4. 使用 Decision v3 direct array。
5. Record 與 Skill confidence 只用 numeric enum。
6. 每個 Skill 必須有自己的 Evidence Quote、Explanation、Negative Checks 與 Rationale。
7. Quote 必須使用可由 JAA Normalizer 回查的實際來源文字。
8. 不得以單一關鍵字、檔名、workflow、附件名稱或一般 Log 字眼硬分類。
9. 只能提交一次正式 Artifact。
10. 最終回覆使用繁體中文，清楚回報 INPUT_READY、ANALYSIS_STARTED、已分析筆數、Artifact submission 結果及具體錯誤。
11. 不得把 Artifact accepted 誤稱為 Canonical、HTML 或 SQLite 成功。

保留既有三種 Instruction Mode，但：

- Standard Formal 必須單獨可完成正式分析。
- Standard + User Instruction 只能收窄焦點或補充背景，不得改寫安全、N 筆、Schema、identity、delivery 或 SQLite Gate。
- Custom Diagnostic 不具正式 Artifact／SQLite 資格。

---

## 7. Evidence Normalizer 1.0.0

新增 pure、deterministic、可測試的本機 Normalizer：`JAA-EVIDENCE-NORMALIZER-1.0.0`。

### 7.1 目的

把 Comment／Description／Changelog Diff 的 JSON 包裝與 escape 轉成可讀證據，但不改變原始來源或 hash。

以 `COPGEN1-146289` Comment 為 regression fixture，預設可讀內容應近似：

```text
[Fail Phenomenon]
GC 卡在 FTLGCCheckProgram()

[Root Cause]
因未考量到 Copy Data 追上 Build GCSA，導致 Copy Data 繼續前進，使 Program Index 大於 Read Index。
```

預設可讀 Evidence 不應顯示：

- JSON `{}`。
- `\"`。
- literal `\r\n`。
- `body` wrapper。
- `commentId`。
- `contentStatus`。
- `provenance`。

### 7.2 規則

- 依 `sourceProvenance`／Field 類型選擇已核准 normalizer。
- Comment JSON 僅取人類內容欄位，保留文字語意及真實換行。
- Description／Changelog 保留 Added／Removed 邊界。
- Jira wiki image/link token 轉成安全的本機文字或 chip，不得遠端抓取。
- 不得摘要、改寫、翻譯或補字。
- 無法安全 parse 時降級顯示 escaped raw text 並記錄 diagnostics，不得丟失來源。
- 原始 bytes、source hash、record hash、Evidence ID、Stable ID 完全不變。

### 7.3 Traceability

保存 raw-to-normalized provenance，讓每個 v3 quote 能驗證：

- Evidence Ref 正確。
- Quote 是 normalized source 的 exact substring。
- Normalized source 可連回 raw source／JSON pointer／diff hunk。

每 Run 產生 `evidence-normalization-receipt.json`，包含 version、record counts、success／fallback／failure counts、input identity、output identity、diagnostics 與 SHA-256。

---

## 8. Run-scoped Issue Snapshot Enrichment

### 8.1 建立時點

在 Run 建立、模型 dispatch 之前，從待分析 records 收集 normalized Unique Issue Key：

`trim(issueKey).toUpperCase()`

再由本機 Current-State SQLite／已核准 source archive 查詢 Issue Snapshot，建立 run-scoped local-only enrichment。它不送給 ChatGPT，也不增加模型 Token。

### 8.2 欄位

至少包含：

```json
{
  "issueId": "3756212",
  "issueKey": "COPGEN1-146289",
  "projectKey": "COPGEN1",
  "issueType": { "id": "...", "name": "Bug" },
  "priority": { "id": "...", "name": "Major" },
  "jiraStatus": { "id": "...", "name": "Resolved" }
}
```

若既有 snapshot 還能穩定提供 summary、assignee 等欄位，可納入資料字典，但不得為本版擴張不必要 scope。

### 8.3 一致性與缺漏

- Snapshot 必須在 Run 建立時固定，不能在日後開啟 HTML 時重新查詢 current state。
- Canonical Result 應保存 Render 所需的 run-scoped snapshot，使離線重新產生 HTML deterministic。
- 相同 Issue Key 不論有幾個 Event，Issue Type／Priority／Jira Status 分布只計一次。
- 若無 DB、找不到 Issue 或 snapshot 不完整，顯示 `資料未提供`，不得猜測。
- Enrichment 缺漏是 `report_enrichment_warning`，不應自行改變 AI Status；不得因純報表 metadata 缺漏把正確分析標為 FAILED。

### 8.4 Receipt

產生：

- `report-enrichment/issue-snapshots.json`
- `report-enrichment/issue-snapshot-receipt.json`

Receipt 至少包含 expected unique issue count、resolved、missing、conflict、source DB identity、captured time、SHA-256 與 diagnostics。

---

## 9. Schema、Semantic 與 Quality Gate

### 9.1 Schema Validation

檢查 direct array、count、index coverage、exact properties、types、enum 與 additionalProperties。失敗時：

- 保留提交 Attempt／Result metadata 與可安全保存的原始內容。
- 產生 validation report／completion manifest。
- 不建立正式 Canonical Result。
- 不產生正式 Golden HTML。
- 不寫 SQLite。

### 9.2 Semantic Validation

檢查：

- Status matrix。
- Skill ID catalog membership。
- 同 Record Skill uniqueness。
- Evidence Ref identity。
- Quote exact traceability。
- Multi-skill 每 Skill 的獨立完整 Finding。
- Meaningful rationale／explanation／checks。
- Stable ID、index、source hash、rules snapshot identity 與順序守恆。

Semantic failure 必須 fail closed，保存具體 `errorCode`、`jsonPointer`、expected、observed，不得折疊成模糊的 missing artifact。

### 9.3 Quality Metrics

至少計算：

- `evidenceExplanationExactDuplicateRatio`
- `skillRationaleExactDuplicateRatio`
- `unknownReasonExactDuplicateRatio`
- `multiSkillRecordCount`
- `multiSkillMissingIndependentFindingCount`
- `excessiveSkillFindingCount`
- `maxSkillFindings`
- `untraceableEvidenceQuoteCount`
- `genericEvidenceExplanationCount`
- `legacyUnverifiedRecordCount`

Ratio 的 numerator、denominator、normalization 與 excluded cases 必須寫入 contract／report，不可只顯示百分比。

### 9.4 Quality 分級

- `PASSED`：Schema／Semantic 全通過且沒有分析品質 Warning。
- `WARNING`：結果 structurally valid，但存在需人工判斷的 duplication、過多 Skill、Catalog review-draft 或泛化說明。
- `BLOCKED`：缺少每 Skill 獨立 Finding、Evidence 無法追溯、或其他會破壞結果可信度的 blocking quality finding。
- `LEGACY_UNVERIFIED`：Decision v2 只供預覽。

建議可版本化預設值：

- exact duplicate ratio `> 0.50` 產生 Warning。
- 單筆 Skill Finding `> 5` 產生 Warning。
- 缺少任何 required per-skill field、invalid ref 或 untraceable quote 為 BLOCKED。

Threshold 必須放在 versioned contract／Manifest，不得只藏在 UI 常數。這些統計不得用來自動重寫模型分類。

### 9.5 SQLite Gate

- Schema／Semantic failure：禁止。
- Quality BLOCKED：禁止，不能以一般 Warning acceptance 繞過。
- Quality WARNING：等待人工 durable acceptance。
- PASSED：依既有 run-scoped idempotent transaction 寫入。
- Report enrichment warning 不等同 analysis quality warning，不得單獨阻擋 SQLite。

人工接受必須記錄 Run ID、使用者操作、時間、warning、Canonical SHA-256、接受前後狀態及後續 transaction identity。不得預設接受或自動接受。

---

## 10. Canonical Result 與 Legacy v2

### 10.1 Canonical

JAA 對 v3 Decision deterministic assembly：

- 加入來源 identity、normalized evidence provenance、run-scoped Issue Snapshot。
- 衍生 skill IDs、authoritative counts、distributions 與 quality metrics。
- 不改寫模型 Status、Finding、Explanation 或 Rationale。
- 使用 `.tmp → fsync → atomic rename → reopen/hash verify`。

### 10.2 Legacy v2

- v2 不可自動冒充或轉成通過驗證的 v3。
- 歷史 v0.3.21 Run 可用 `LEGACY_UNVERIFIED` 預覽。
- 可以把 v2 candidate 投影成 legacy skill card，但缺少的 per-skill explanation 必須顯示未提供。
- 不得由 Renderer 補寫不存在的分析。
- Legacy HTML 不得觸發新的正式 SQLite 寫入。

### 10.3 Database 相容性

先檢查現有 SQLite 是否已能 durable 保存 v3 skill findings。若需要 schema 變更：

- 不得對使用者舊 DB 執行無提示、不可回復的 silent migration。
- 優先採相容的 run-scoped JSON／child representation。
- 若確實需要 migration，必須版本化、可驗證、失敗 rollback，並依既有產品政策要求明確使用者操作或安全新 DB；舊 DB 保持可讀。
- 自動化測試只能使用 temp DB，不得碰使用者 production DB。

---

## 11. HTML Template v1.2.0 與 Renderer 1.2.0

### 11.1 Renderer 原則

- 只讀取 Schema／Semantic-valid Canonical Result。
- 不重新分類、不補 Skill、不呼叫 Provider、不查網路。
- 完全離線、self-contained、無 server。
- Template 是 declarative／allowlisted machine contract，禁止任意 Template script 執行。
- Source、Actor、Issue、Evidence、Rationale、Skill Name 全部安全 escape／`textContent`。
- 禁止 CDN、remote font、remote image、analytics、fetch、XHR、WebSocket、form submission。
- CSP 必須嚴格且測試。

### 11.2 Hero 與 lifecycle

頁首分開顯示：

- Provider
- Input Delivery
- Analysis
- Artifact
- Schema Validation
- Semantic Validation
- Quality
- Canonical
- HTML
- SQLite

顯示 App、Run、Instruction Mode、Model、Decision Contract、Rule Set、Template、Normalizer、Renderer、source identity 與生成時間。

### 11.3 Statistics

同時提供兩種母體，標題不可模糊：

**Event-based**

- Activity Event count
- Decision Status distribution
- Field Name distribution
- Skill distribution
- Actor distribution
- Record／Skill confidence distribution
- Quality distribution

**Unique-Issue-based**

- Unique Issue count
- Project distribution
- Issue Type distribution
- Priority distribution
- Jira Issue Status distribution
- 各 Skill 涉及的 Unique Issue count

Unique Issue 使用 normalized `issueKey` 去重。Regression fixture 的 117 Event 應為 28 Unique Issue、26 個 Issue 有多筆 Event、89 個 duplicate event occurrences。若 fixture bytes／identity 不同，不可硬編碼此數字；測試必須以指定 fixture 計算得到。

所有統計隨目前篩選結果即時重算，並同時顯示 visible Event／Unique Issue。

### 11.4 Advanced Multi-select Filters

提供：

- Keyword／field-scoped search
- Project
- Issue Type
- Priority
- Issue Key
- Actor
- Field Name
- Analysis Decision Status
- Skill Group
- Skill ID
- Quality Status
- Confidence
- Skill Finding count
- Event date range

規則：

- 同一欄位多選為 OR。
- 不同欄位之間為 AND。
- 每組可選包含／排除。
- Skill 支援 match any／match all。
- 顯示 active filter chips。
- 一鍵清除、恢復預設及儲存篩選設定。
- 不得再使用意義不清的 `全部 Status`，改成 `全部分析判定狀態`。

提供排序與分頁：

- 每頁 20／50／100／全部。
- Previous／Next 與頁碼。
- Event Time、Issue Key、Confidence、Skill Finding Count 排序。
- 顯示目前區間、visible Event count、visible Unique Issue count。

### 11.5 Field Visibility

新增 grouped field selector，全部使用 checkbox 多選：

**Record Summary**

- Record Index、Issue Key、Issue Type、Priority、Actor、Event Time、Field Name、Decision Status、Record Confidence、Skill Finding Count、Quality Status。

**Record Detail**

- Readable Added／Removed、Raw Added／Removed、Record Rationale、Unknown Reasons、Record Negative Checks、Source Identity、Source Hash。

**Skill Finding**

- Skill ID、Name、Group、Confidence、Evidence Quote、Evidence Explanation、Negative Checks、Rationale、Quality Findings。

支援全選、全不選、恢復預設、儲存目前顯示設定。CSV 與列印遵循目前選取欄位。JAA embedded viewer 可用既有 local preference storage；standalone HTML storage 不可用時必須 session fallback，不能造成報告無法使用。

### 11.6 Field Data Dictionary

每個欄位可查看：

- 中文名稱
- machine field name
- 定義
- 資料來源
- 計算方式
- Event／Unique Issue 母體
- Model-produced／JAA-derived／Source snapshot
- 缺漏表示

明確改名：

- `Status` → `分析判定狀態`
- `Confidence` → `Record Confidence`／`Skill Confidence`
- `Field` → `Jira 變動欄位`
- 所有 Count 標示 Event 或 Unique Issue

### 11.7 Record／Evidence UX

- Record 摘要顯示使用者選取的欄位。
- 展開後 Readable Evidence 預設開啟，Raw Source 預設收合。
- 每個 Skill 是獨立 card。
- 提供複製可讀內容／原始內容。
- 移除 toolbar 下方無用途的空白 spacer。
- 大型 Diff 使用可展開、可捲動區塊，不讓單筆內容破壞整頁。
- 手機不是主要目標，但在一般 1366×768、1920×1080 與高 DPI Windows 顯示不得水平破版。

### 11.8 HTML Receipt

流程：

`validate template identity → validate renderer API → validate canonical/quality → build view model → safe render → .tmp → fsync → atomic rename → reopen/hash verify → receipt`

產生 `canonical-output/html-render-receipt.json`，至少記錄：

- Run／Canonical／Decision／Quality identity
- Template filename／version／bytes／SHA-256
- Renderer version／SHA-256
- output path／bytes／SHA-256
- start／complete time
- atomic write／reopen verify
- status／errorCode／error detail

修正並 regression test 既有 `setHtmlRenderStatus is not a function` 類型 Bridge API 問題。禁止把 Renderer API 缺漏誤報為 ChatGPT 分析失敗。

---

## 12. Results UI 與操作

1. Canonical created 後即可進入「檢視 AI 分析結果」，不受 HTML／SQLite 結果阻擋。
2. 清楚區分：
   - AI 分析結果
   - AI 分析診斷結果
   - Quality Gate
   - HTML Report
   - SQLite Persistence
3. 顯示 authoritative Event／Unique Issue counts。
4. 顯示完整本機路徑及 Copy／Open action。
5. 提供不呼叫 Provider 的「重新產生 HTML」。
6. 提供不呼叫 Provider 的「重試資料庫寫入」。
7. Quality Warning 提供明確的人工接受確認、warning 明細及 durable audit 狀態。
8. BLOCKED 不得提供一般接受後寫入 SQLite 的捷徑。
9. 不顯示未經證明的百分比進度或假 `0/N`。
10. 保留完整 conversation／final assistant response／analysis report 的檢視能力。

---

## 13. Lifecycle 與 truthful status

至少支援並正確顯示：

- `completed`
- `completed_with_quality_warnings`
- `completed_with_artifact_error`
- `completed_with_persistence_error`
- `failed_validation`
- `failed`
- `interrupted`

規則：

- Analysis completed 不等於 Artifact／Canonical／HTML／SQLite 全成功。
- HTML failed 時 Canonical 仍可 completed。
- SQLite failed 時 HTML 仍可 completed。
- Failed Run 原本就不應產生的檔案，不可被 Debug Completeness 誤報成漏包。
- Provider completed 但 Artifact 不完整時，保留 Provider completion 與 Artifact failure 兩個事實。

---

## 14. Local Conversation、Provider Log 與效能

延續：

- `provider-stream.jsonl` append-only buffered writer。
- `conversation.jsonl` append-only。
- 最長 2 秒 durable flush。
- Conversation 不重複保存每個 raw delta。
- Provider raw stream 與人類對話分離。
- 最終 assistant response 完整保存。
- Token usage 累積邏輯不得重複計算。

效能要求：

- 不新增人工逐 token delay、逐 record fsync、逐 event React render 或同步全檔 rewrite。
- 保留 14／15 分鐘 warning 與 20 分鐘 hard timeout（以現有正式設定為準，若實際值不同先查明）。
- 不為了效能改成使用者已拒絕的固定 batch。
- 記錄 input delivery、provider wait、artifact submit、validation、canonical、normalization、enrichment、HTML、SQLite 各階段實際時間。

---

## 15. Debug Folder 與 Canonical Evidence

Debug Folder 必須 flush 所有 writer 後再收集，並從 Canonical Run 收集，而不是從零散暫存路徑猜測。

至少包含：

- 完整 request／instruction composition manifest
- 實際版本化 1 JSON + 3 MD snapshot
- Decision v3 Schema／SHA
- model delivery events／receipt
- artifact submission attempt／result
- 原始 Provider response（依既有 redaction policy）
- final assistant response
- conversation／provider stream
- validation reports
- `quality-gate-report.json`
- `evidence-normalization-receipt.json`
- `report-enrichment/issue-snapshots.json`
- `report-enrichment/issue-snapshot-receipt.json`
- Canonical Result／completion manifest
- 實際版本化 HTML Template
- HTML／Renderer receipt
- 實際 HTML（若 lifecycle 應產生且成功）
- SQLite gate／commit／rollback／manual acceptance evidence
- lifecycle summary
- execution-time report
- token usage
- `debug-completeness.json`
- `debug-file-manifest.json`

Debug Completeness 分類：

- `expected_and_present`
- `expected_but_missing`
- `not_expected_due_to_lifecycle`
- `not_produced_due_to_prior_failure`
- `hash_mismatch`
- `flush_incomplete`

Manifest 記錄每檔 relative path、role、expected reason、bytes、SHA-256、flush status 與收集來源。不得包含 Token、Cookie、Authorization 或未遮罩 credential。

---

## 16. 測試要求

新增 `npm.cmd run test:v0.3.22`，並納入適當既有 regression suites。

### 16.1 Decision／Validation

- direct array／wrapper／stringified root
- exact N／index gaps／duplicates／out-of-order
- additional properties
- confidence number enum
- six Status matrix
- catalog membership
- duplicate skill ID
- invalid Evidence Ref
- quote not found in normalized source
- missing per-skill fields
- multi-skill independent finding
- derived skill IDs
- v2 legacy cannot pass v3

### 16.2 Evidence Normalizer

- `COPGEN1-146289` Comment JSON wrapper regression
- literal escape to real newline
- raw source preservation
- parse failure fallback
- Jira markup safe representation
- script／HTML injection escape
- quote traceability
- receipt identity

### 16.3 Issue Snapshot／Statistics

- normalized Issue Key dedup
- 指定 117 fixture 計算 28 Unique Issue
- 26 issues with multiple events
- 89 duplicate event occurrences
- 相同 Issue 的 Issue Type／Priority 只計一次
- missing／conflicting snapshot
- report enrichment warning 不改 AI Status
- filtered Event 與 Unique Issue recomputation

### 16.4 Filters／Field Visibility

- same-field OR
- cross-field AND
- include／exclude
- Skill any／all
- date／confidence／count filters
- active chips／clear／reset
- pagination 20／50／100／all
- sort stability
- field select all／none／default
- CSV／print follows selected fields
- empty result／single result／117 result

### 16.5 HTML／Security／Lifecycle

- Template filename／internal version／Manifest hash
- Renderer API surface
- `setHtmlRenderStatus` regression
- CSP
- no external resources／network
- source text escape
- inline data script safe escaping
- deterministic output for same Canonical／Template／Renderer
- atomic write／reopen hash
- Canonical visible when HTML fails
- HTML visible when SQLite fails
- regenerate HTML does not call Provider
- retry SQLite does not call Provider

### 16.6 SQLite／Debug

- PASSED commit
- WARNING blocked before acceptance
- durable manual acceptance
- BLOCKED cannot bypass
- idempotent same Run retry
- rollback on failure
- no production DB access in tests
- Debug flush
- expected missing versus not expected
- actual HTML included when successful
- hash mismatch diagnostics

---

## 17. 真實 Fixture 與人工驗證界線

若 repository 或使用者既有測試資料中存在 2026-08-19 的 117-record v0.3.21 Run，將它作為 read-only regression fixture；不得修改原始 Debug Folder 或把單次 AI 分類結果硬編碼成 Golden label。

自動化可驗證 deterministic facts，例如 117 Event／28 Unique Issue、normalization、schema、filters、renderer 與 receipts。

下列需要真實帳號／環境者若本次環境不可用，誠實標示 `Manual Validation Pending`：

- Managed OAuth 真實 17 筆。
- Managed OAuth 真實 117 筆。
- 真實 production SQLite end-to-end。
- 全新 Windows Installer GUI。

不得以 mock／fixture PASS 宣稱真實 Managed OAuth 已完成。

---

## 18. Build、Dist 與短啟動驗證

所有正式修改與測試完成後，依序執行並記錄實際 wall time：

1. `npm.cmd run typecheck`
2. `npm.cmd run test:v0.3.22`
3. 必要的既有 regression test
4. `npm.cmd run build`
5. `git diff --check`
6. Package Source commit
7. 從 Package Source commit 重新 Build（若既有流程要求）
8. `npm.cmd run dist`
9. ASAR inventory／敏感檔名掃描／stale Bridge／Rule／Template 掃描
10. win-unpacked 短啟動
11. 隔離 Portable 短啟動

使用者明確不要求長時間 smoke。只做有上限、可收集 `renderer_boot`、`did-finish-load`、route ready、crash／load failure 的短啟動驗證；不得干擾或終止使用者既有執行中的 JAA process。

Dist 產物至少包含：

- `Jira Activity Analyzer Setup 0.3.22.exe`
- `Jira Activity Analyzer Portable 0.3.22.exe`
- `win-unpacked\Jira Activity Analyzer.exe`

對三個正式產物記錄 absolute path、bytes、SHA-256、Build Version、Build Time、Package Source Commit。

ASAR 驗證：

- bundled Codex 版本／hash 正確。
- 只保留 v0.3.22 正式 Bridge／Schema／Rules／Template。
- 不含 stale v0.3.18／19／20／21 Bridge 或無版本 Rule alias。
- 不含 `.env`、Token、Cookie、Authorization、database、測試資料、Debug Folder、使用者絕對路徑或其他敏感檔案。

---

## 19. 時間與 Token Ledger

產生：

`reports/JiraActivityAnalyzer_v0.3.22_execution_time_ledger.json`

逐階段記錄：

- start／end local and UTC time
- wall time milliseconds／seconds
- command／phase
- result
- relevant artifact
- retry／failure reason

至少包含 preflight、implementation、typecheck、tests、build、package-source rebuild、dist、ASAR、win-unpacked、Portable、reports、Git commit／tag／push。

Token telemetry：

- 只記錄環境實際提供的 actual token counters。
- 若目前 Codex／ChatGPT 環境無法取得，明確寫 `unavailable` 與原因。
- 禁止用字數、檔案大小或估算值冒充 actual token usage。

---

## 20. 正式報告

至少產生：

1. `reports/JiraActivityAnalyzer_v0.3.22_test_and_verification_report.md`
2. `reports/JiraActivityAnalyzer_v0.3.22_artifact_manifest.json`
3. `reports/JiraActivityAnalyzer_v0.3.22_execution_time_ledger.json`
4. `reports/JiraActivityAnalyzer_v0.3.22_decision_v3_contract_report.md`
5. `reports/JiraActivityAnalyzer_v0.3.22_quality_gate_report.md`
6. `reports/JiraActivityAnalyzer_v0.3.22_evidence_normalizer_report.md`
7. `reports/JiraActivityAnalyzer_v0.3.22_issue_snapshot_statistics_report.md`
8. `reports/JiraActivityAnalyzer_v0.3.22_html_renderer_report.md`
9. `reports/JiraActivityAnalyzer_v0.3.22_sqlite_regression_report.md`
10. `reports/JiraActivityAnalyzer_v0.3.22_rule_template_alignment_report.md`

報告必須區分：

- Automated PASS／FAIL。
- Manual Validation Pending。
- Known Warning。
- Actual versus unavailable telemetry。
- Package Source versus Final Delivery commit。
- Dirty worktree 中既有使用者內容與本版內容。

---

## 21. Git、Tag 與 Push

只有在本版 typecheck、tests、build、dist、artifact verification 與短啟動均成功，且沒有阻斷性問題時才執行正式交付。

### 21.1 Commit 建議

1. Package Source Commit：只包含正式 source、rules、tests 與 package inputs。
2. Final Delivery Commit：加入以 Package Source 產生的正式 reports／artifact manifests／ledgers。

不得提交 Installer／Portable binary，除非 repository 現有政策明確追蹤它們；通常只記錄 manifest／hash。

### 21.2 Tag

建立 annotated tag：

`v0.3.22`

Tag 必須指向 Final Delivery Commit，不可指向 Package Source Commit。

### 21.3 Push 授權與檢查

使用者授權在 remote 仍精確為 `https://github.com/ebp1223ai/JiraActivityAnalyzer.git` 且有維護權限時 push 本版 branch 與 `v0.3.22` tag。

Push 前必須：

- 核對 remote。
- 核對 staged／committed files。
- 確認沒有 secret／credential／database／使用者資料。
- 確認 tag target。

Push 後核對：

- upstream branch。
- local／remote branch SHA。
- local／remote tag SHA。
- ahead／behind `0／0`。

若安全審查器、權限或網路拒絕 push，不得繞過；保留本機 commit／tag 並清楚回報 blocker。

---

## 22. Definition of Done

只有同時符合下列條件，才能宣稱自動化交付完成：

- App version／package／UI／build info 為 0.3.22。
- Decision v3 strict Schema、types、Bridge、Prompt、validator 完成。
- Standard Formal 不靠使用者附加指令即可要求正確 v3。
- 每個 Skill 有獨立 Finding／Evidence／Explanation／Checks／Rationale。
- Evidence Normalizer 對 #5 Comment regression 通過。
- Run-scoped Issue Snapshot 及 receipts 完成。
- 117 fixture 正確計算 28 Unique Issue（僅限指定 fixture）。
- HTML v1.2.0 提供進階複選篩選、分頁、排序、欄位顯示控制、資料字典、Event／Unique Issue 統計。
- HTML 完全離線、自包含、安全且 deterministic。
- Renderer lifecycle／Bridge API／atomic receipt 完成。
- Canonical／HTML／SQLite 狀態互不誤阻擋。
- Quality Warning／Blocked／manual acceptance／SQLite Gate 正確。
- Debug Folder 含完整 Canonical Evidence 與實際 HTML。
- 所有正式 MD 檔名版本化且 Manifest hash 對齊。
- Typecheck、tests、build、dist、ASAR、短啟動通過。
- Installer／Portable／win-unpacked hash 完成。
- Reports／time ledger／actual token telemetry 狀態完成。
- Commit／annotated tag／push 完成，或 push blocker 被誠實回報。
- 所有既有使用者 dirty／untracked 資料均保留。

若真實 Managed OAuth、真實 production SQLite 或乾淨 Windows GUI 未執行，Overall Status 必須是：

`Partial / Manual Validation Pending`

不得因自動化 fixture 全 PASS 就宣稱整版真實環境 Completed。

---

## 23. 最終回報格式

完成後使用繁體中文，至少回報：

### 版本結果

- Target Version
- Overall Status
- Branch
- Package Source Commit
- Final Delivery Commit
- Annotated Tag／target
- Upstream／ahead／behind／Push

### 核心成果

- Decision v3
- Evidence Normalizer
- Issue Snapshot／Unique Issue statistics
- Quality／SQLite Gate
- HTML v1.2.0／Renderer
- Results UI／Debug completeness
- Formal MD version alignment

### 驗證

- 每個 command PASS／FAIL 與實際耗時
- ASAR／敏感資料掃描
- win-unpacked／Portable short launch
- 117 fixture deterministic facts
- Manual Validation Pending items

### 封裝產物

- Installer absolute path／bytes／SHA-256
- Portable absolute path／bytes／SHA-256
- win-unpacked absolute path／bytes／SHA-256
- Build Time／Package Source

### 報告

- 所有 report absolute paths

### Telemetry

- Actual token telemetry，或 `unavailable`，不得估算冒充

### 工作樹保護

- 說明既有 tracked dirty／untracked 使用者資料是否完整保留

遇到任何 Partial／Failure，必須提供具體 phase、error、impact、已保存 evidence 與下一步，不得只回覆「失敗」或「可能是權限問題」。

