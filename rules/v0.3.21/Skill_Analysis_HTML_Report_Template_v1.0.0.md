# JAA 技能分析 HTML 報告模板 v1.0.0

- File: `Skill_Analysis_HTML_Report_Template_v1.0.0.md`
- Template Schema Version: `jaa-html-report-template-v1`
- Template ID: `JAA-SKILL-ANALYSIS-GOLDEN-HTML`
- Template Version: `1.0.0`
- Status: `proposed`
- Locale: `zh-TW`
- Time Zone: `Asia/Taipei`
- Target Application: `JiraActivityAnalyzer`
- Minimum Renderer Version: `JAA-LOCAL-HTML-RENDERER-1.0.0`
- Prepared Date: `2026-08-14`

## 1. 文件定位

本文件是 Jira Activity Analyzer 本機 deterministic HTML renderer 的版本化報告模板規格。它定義：

- Canonical Result 到 HTML View Model 的欄位映射。
- HTML 的資訊架構、欄位、排序、篩選、標籤與狀態色彩。
- 自包含、安全、可離線開啟的輸出要求。
- Template ID、版本、Hash、Renderer 相容性與產物證據。

本文件不定義 Skill、不改變分類結果，也不送給 ChatGPT。正式分析仍維持：

```text
1 Pending JSON + 3 Analysis Reference MD
```

本模板是 JAA 本機第四份「Renderer Reference」，不是第四份「AI Analysis Reference」。

## 2. 權威來源與禁止事項

1. 唯一資料來源是已通過 Schema 與 semantic validation 的 `canonical-output/analysis-result.json`。
2. `analysis-report.md`、ChatGPT 最終摘要與 Provider stream 都不是 HTML 權威資料來源。
3. 模板不得重新分類、補 Skill、改 Status、改 count 或重寫 Evidence。
4. 禁止執行模板內任意 JavaScript、Shell、PowerShell、Node.js 或外部程式碼。
5. 禁止載入 CDN、遠端字型、遠端圖片、analytics、追蹤碼或其他網路資源。
6. 所有使用者與 Jira 內容必須 HTML escape；嵌入 JSON 必須使用不可執行的 `application/json` 資料區塊。
7. 模板不允許自行宣稱 SQLite 成功；資料庫狀態只能顯示 Canonical Run durable evidence。

## 3. Machine-readable Template Contract

JAA 只解析下列標記之間的單一 JSON object。標記外文字供人員閱讀，不參與 runtime rendering。

<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->
```json
{
  "schemaVersion": "jaa-html-report-template-v1",
  "templateId": "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  "templateVersion": "1.0.0",
  "locale": "zh-TW",
  "timeZone": "Asia/Taipei",
  "minimumRendererVersion": "JAA-LOCAL-HTML-RENDERER-1.0.0",
  "input": {
    "role": "CANONICAL_ANALYSIS_RESULT",
    "requiredSchemaName": "JiraActivityAnalyzerSkillAnalysis",
    "minimumSchemaVersion": "0.3.11-v1"
  },
  "output": {
    "fileNamePattern": "skill-analysis-{sourceBaseName}-{runLocalTimestamp}.html",
    "selfContained": true,
    "networkAccess": false,
    "defaultTheme": "light",
    "printEnabled": true
  },
  "sections": [
    "hero",
    "runStatusBanner",
    "authoritativeSummary",
    "ruleAndTemplateSnapshot",
    "validationAndPersistence",
    "filters",
    "recordsTable",
    "recordDetails",
    "provenanceFooter"
  ],
  "filters": [
    "keyword",
    "issueKey",
    "actor",
    "fieldName",
    "decisionStatus",
    "skillGroup",
    "skillId",
    "reviewStatus"
  ],
  "defaultSort": [
    {"field": "recordIndex", "direction": "asc"}
  ],
  "tableColumns": [
    "recordIndex",
    "issueAndActor",
    "eventTimeAndField",
    "diffSummary",
    "skillCandidates",
    "decisionStatus",
    "reviewStatus",
    "details"
  ],
  "recordDetails": [
    "sourceIdentity",
    "addedText",
    "removedText",
    "rationale",
    "positiveEvidence",
    "negativeChecks",
    "unknownReasons",
    "candidateSkills",
    "evidenceRefs",
    "sourceContentHash"
  ],
  "actions": [
    "copyAuthoritativeSummary",
    "resetFilters",
    "exportFilteredCsv",
    "expandRecordDetails",
    "collapseRecordDetails",
    "printReport"
  ],
  "statusLabels": {
    "CLASSIFIED": "已分類",
    "UNKNOWN": "無法判定",
    "NEEDS_REVIEW": "需要覆核",
    "EXCLUDED": "已排除",
    "CATALOG_DETAIL_MISSING": "Catalog 描述缺漏",
    "FAILED": "分析失敗"
  },
  "statusTokens": {
    "CLASSIFIED": "success",
    "UNKNOWN": "neutral",
    "NEEDS_REVIEW": "warning",
    "EXCLUDED": "muted",
    "CATALOG_DETAIL_MISSING": "warning",
    "FAILED": "danger"
  },
  "security": {
    "escapeAllSourceText": true,
    "allowInlineDataScript": true,
    "allowArbitraryTemplateScript": false,
    "allowRemoteResource": false,
    "contentSecurityPolicy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  }
}
```
<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->

## 4. 頁面資訊架構

### 4.1 Hero

顯示：

- `JiraActivityAnalyzer · Skill Analysis`
- 報告標題：`Activity Event Diff 技能分析結果`
- 來源檔名、Run ID、完成時間與總筆數。
- Instruction Mode、Provider、Model、Rule Set 與 Template Version。

### 4.2 Run Status Banner

依 durable lifecycle 顯示：

- Analysis、Artifact、Validation、Canonical、HTML Render、SQLite 各自狀態。
- Canonical 已完成但 SQLite 失敗時，必須顯示「分析產物有效；資料庫寫入失敗」，不得把整體誤寫成 Provider 失敗。
- Catalog 為 `review-draft` 時，顯示結果仍需人工覆核，不可作正式績效結論。

### 4.3 Authoritative Summary

統計必須由 Canonical Result 本機計算：

- Source／Decision／Canonical count。
- `CLASSIFIED`、`UNKNOWN`、`NEEDS_REVIEW`、`EXCLUDED`、`CATALOG_DETAIL_MISSING`、`FAILED`。
- Skill assignment count、multi-skill record count、review pending count。
- SQLite committed count 只能使用 durable database evidence。

### 4.4 Rule and Template Snapshot

顯示：

- Rule Set ID。
- Common Rules 檔名、版本、SHA-256。
- Skill Catalog 檔名、版本、SHA-256。
- Manifest 檔名、Schema Version、SHA-256。
- HTML Template 檔名、Template ID、版本、SHA-256。
- Renderer Version 與 Canonical Result SHA-256。

### 4.5 Filters

篩選必須完全在瀏覽器本機完成，不發出網路請求。支援：

- 全文搜尋。
- Actor、Issue、Field、Status、Group、Skill、Review Status。
- 清除篩選。
- 顯示 `目前筆數 / Canonical 總筆數`。

### 4.6 Records Table

預設依 `recordIndex` 升冪。每列顯示：

1. Index。
2. Issue Key／Actor。
3. Event Time／Field Name。
4. Diff 摘要與 added／removed line count。
5. Skill chips。
6. Decision Status。
7. Review Status。
8. 展開詳細內容。

### 4.7 Record Details

展開後必須分欄顯示：

- 原始 Added／Removed Diff。
- Decision status、Skill IDs、Confidence、Rationale。
- Positive Evidence、Negative Checks、Unknown Reasons。
- Evidence ID、Activity Event ID、Source Diff ID、Source Content Hash。

空陣列顯示 `—`，不得為了畫面完整自行補字串。

## 5. Canonical Mapping

Renderer 應建立 immutable View Model，不修改 Canonical Result：

```text
Canonical Result
→ validate schema/version/hash
→ map run metadata
→ calculate authoritative counts
→ map results[] by recordIndex
→ escape source text
→ render self-contained HTML
→ write .tmp
→ fsync
→ atomic rename
→ reopen and SHA-256 verify
→ write HTML render receipt
```

若 Template、Canonical Result 或 Renderer 不相容，必須停止 HTML render，但不得把已完成的 AI Analysis／Canonical Result 改成失敗。

## 6. HTML Render Receipt

每次產生或重新產生 HTML 都必須建立：

```text
canonical-output/html-render-receipt.json
```

至少包含：

```text
runId
canonicalResultPath
canonicalResultSha256
templateFileName
templateId
templateVersion
templateSha256
rendererVersion
outputHtmlPath
outputHtmlSizeBytes
outputHtmlSha256
renderStartedAt
renderCompletedAt
atomicWrite
reopenVerified
status
errorCode
```

## 7. UI 與可用性

- 桌面寬度下採摘要卡＋表格；窄視窗可改為卡片式，不得截斷必要身分欄位。
- 鍵盤可操作篩選、Details、Copy、CSV 與 Print。
- Status 不得只靠顏色辨識，必須同時顯示文字。
- `pre`／Diff 區塊保留換行並可水平捲動。
- 列印模式隱藏操作按鈕，保留摘要、規則快照與目前篩選結果。
- CSV 僅匯出目前篩選結果，UTF-8 BOM，並記錄 CSV 是衍生檔、不是 Canonical Result。

## 8. Template Resolution

1. JAA 不掃描資料夾猜測模板。
2. JAA 只讀取 Manifest `html_report_template` binding 指定的檔名。
3. 檔內 Template ID／Version 必須與 Manifest 一致。
4. SHA-256 必須在 Run Snapshot 與 Render Receipt 中保存。
5. v0.3.21 只支援一個 Manifest 預設模板，不提供任意模板執行或外部 script。
6. 未來若支援多模板，必須由 Manifest allowlist 明確列出；不可載入未綁定 MD。

## 9. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 1.0.0 | 2026-08-14 | proposed | 建立 Manifest-bound、本機 deterministic、自包含 Golden HTML 報告模板與 UI／安全／Receipt 契約 |
