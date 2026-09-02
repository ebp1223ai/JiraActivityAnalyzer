# JAA 技能分析 HTML 報告模板 v1.13.1

- File: `Skill_Analysis_HTML_Report_Template_v1.13.1.md`
- Template Schema Version: `jaa-html-report-template-v14`
- Template ID: `JAA-SKILL-ANALYSIS-GOLDEN-HTML`
- Template Version: `1.13.1`
- Previous Version: `1.13.0`
- Status: `package-only-offline-review-workbench`
- Locale: `zh-TW`
- Time Zone: `Asia/Taipei`
- Target Application: `JiraActivityAnalyzer`
- Target Application Version: `0.3.42`
- Minimum Renderer Version: `JAA-LOCAL-HTML-RENDERER-1.13.1`
- Analysis Package Contract: `jaa-ai-analysis-package v2.0.0`
- Analysis Package Schema SHA-256: `bound-by-Manifest-v1.6.0-and-SHA256SUMS`
- Skill Catalog: `Skill_Catalog_v0.3.5.md`
- Prepared Date: `2026-09-02`

## 1. 文件定位

本文件定義一個不預先嵌入任何分析資料、可直接以 `file://` 開啟的 self-contained HTML 人工驗收工作台。操作者開啟 HTML 後才選擇本機 JSON，完成查驗、人工修正與離線匯出。

v1.13.1 將分析、部分驗收、完整驗收與跨版本續作統一為同一個正式 Package 契約：

| 使用狀態 | 正式格式 | Review Rank |
|---|---|---|
| AI 已分析、尚未人工驗收 | `jaa-ai-analysis-package v2.0.0` | `AI_ONLY` |
| 部分人工驗收 | 同一 Package | `REVIEW_PARTIAL` |
| 全部人工驗收 | 同一 Package | `REVIEW_COMPLETED` |

不再產生人工驗收進度專屬 JSON。需要暫停或跨版本續作時，直接匯出並重新匯入 `REVIEW_PARTIAL` JAA Analysis Package。

本工作台：

- 開啟時不要求任何資料檔。
- 不連線、不查 Jira、不讀 SQLite、不呼叫 AI。
- 只在使用者選檔後讀取該檔案。
- 不修改 `sourceTrace` 或原始 `aiAnalysis`。
- 人工修正只寫入 `manualReview`，並產生 Effective Result。
- 匯出 JAA Package 前驗證 Source Trace Required Fields、Count、Order、Identity 與 Deep Equality。
- Pending、legacy analyzed 或舊 Manual Review 不由本工作台轉換；需要時交由雲端 AI 依正式契約轉成 v2 Package。

## 2. v1.13.1 核心變更

1. 正式 Package 升級為 `jaa-ai-analysis-package v2.0.0`，每筆必帶完整 Source Trace。
2. 空白工作台接受 AI_ONLY、REVIEW_PARTIAL、REVIEW_COMPLETED v2 Package。
3. 保留拖放 JSON、自動辨識檔案角色與繁中錯誤說明。
4. 移除人工驗收進度專屬匯入／匯出；續作統一使用 JAA Analysis Package。
5. 單筆導引、上一筆／下一筆、一鍵接受 AI 結果均使用中英並列。
6. 每個 Skill 可展開 Evidence、JSON Pointer、Explanation、Rationale、Negative Checks 與 Confidence。
7. 未開始、進行中、已完成與衝突使用文字、圖示及背景三重區分。
8. 保留 per-Skill 接受、拒絕、調整 Confidence、Structured Missing Skill 與 Additional Evidence Assignment。
9. 匯出 `JAA 分析 Package` 與選用摘要 CSV；不再匯出 Review Progress JSON。
10. 匯入及匯出執行 strict Schema、Source Trace、counts、order、identity 與 immutable layer 驗證。
11. 新版 HTML 對舊 Package 的相容性以 Package Schema 為準，不以 Template 版本為準。
12. 顯示層將跳脫控制符號轉成可讀換行，但不得修改 Source Trace 或 AI Analysis。
13. Hash 僅為選用 Integrity Receipt，不得判斷關聯性、可追溯性或阻止匯出。
14. Pending、legacy analyzed 與舊 Review 的轉換由雲端 AI 處理，不在 HTML 或 JAA 實作。

## 3. Machine-readable Template Contract

<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->

```json
{
  "schemaVersion": "jaa-html-report-template-v14",
  "templateId": "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  "templateVersion": "1.13.1",
  "locale": "zh-TW",
  "timeZone": "Asia/Taipei",
  "minimumRendererVersion": "JAA-LOCAL-HTML-RENDERER-1.13.1",
  "targetApplicationVersion": "0.3.42",
  "bootMode": "EMPTY_OFFLINE_WORKBENCH",
  "selfContained": true,
  "networkAccess": false,
  "requiredCapabilities": [
    "EMPTY_BOOT_V1",
    "LOCAL_FILE_IMPORT_V1",
    "DRAG_DROP_IMPORT_V1",
    "STRICT_ANALYSIS_PACKAGE_SCHEMA_V2",
    "LOSSLESS_SOURCE_TRACE_V1",
    "SOURCE_TRACE_IMMUTABILITY_GATE_V1",
    "AI_ONLY_PACKAGE_IMPORT_V2",
    "REVIEW_PARTIAL_PACKAGE_IMPORT_V2",
    "REVIEW_COMPLETED_PACKAGE_IMPORT_V2",
    "GUIDED_SINGLE_RECORD_REVIEW_V2",
    "BILINGUAL_REVIEW_CONTROLS_V1",
    "EXPANDABLE_SKILL_DETAILS_V1",
    "DISTINCT_RECORD_PROGRESS_STATES_V1",
    "STRUCTURED_MISSING_SKILL_REVIEW_V1",
    "MANUAL_REVIEW_EVIDENCE_ASSIGNMENT_V1",
    "AI_ANALYSIS_IMMUTABILITY_GATE_V1",
    "JAA_ANALYSIS_PACKAGE_EXPORT_V2",
    "OPTIONAL_INTEGRITY_RECEIPT_V1",
    "PACKAGE_ONLY_CONTINUATION_V1",
    "LOCAL_REVIEW_AUTOSAVE_V2",
    "FILTERED_REVIEW_SUMMARY_CSV_V1"
  ],
  "input": {
    "primary": {
      "schemaName": "jaa-ai-analysis-package",
      "schemaVersion": "2.0.0",
      "schemaSha256Binding": "Manifest-v1.6.0-and-SHA256SUMS",
      "acceptedReviewRanks": [
        "AI_ONLY",
        "REVIEW_PARTIAL",
        "REVIEW_COMPLETED"
      ]
    },
    "rejectedRoles": [
      "jira-activity-analyzer.pending-analysis",
      "jaa-skill-analysis-result",
      "jaa-manual-skill-review"
    ]
  },
  "output": {
    "jaaAnalysisPackage": "jaa-ai-analysis-package v2.0.0",
    "summaryCsv": true,
    "originalAiOnlyCopy": true,
    "overwriteInput": false,
    "downloadOnlyAfterValidation": true
  },
  "immutableLayers": [
    "sourceTrace",
    "rulesBinding",
    "records[].dedupeKey",
    "records[].sourceTrace",
    "records[].aiAnalysis"
  ],
  "mutableLayer": "records[].manualReview",
  "reviewRankDerivation": {
    "AI_ONLY": "all manualReview are null",
    "REVIEW_PARTIAL": "at least one manualReview exists and not all records are completed",
    "REVIEW_COMPLETED": "every record has manualReview and completed=true"
  },
  "security": {
    "allowNetwork": false,
    "allowEval": false,
    "allowExternalScript": false,
    "allowArbitraryPathRead": false,
    "allowSqlite": false,
    "allowAiCall": false
  }
}
```

<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->

## 4. 開啟與空白狀態

HTML 必須能直接雙擊開啟。沒有資料時顯示：

- 標題：`AI 技能分析人工驗收工作台`
- 說明：`先匯入 JAA AI 分析 JSON，再進行查驗或人工修正。`
- Primary：`選擇 JAA 分析 JSON`
- Secondary drop zone：`將 JSON 拖曳到這裡`
- 支援狀態：AI_ONLY／REVIEW_PARTIAL／REVIEW_COMPLETED
- 顯示 Template、Schema、Catalog 版本
- 不顯示假的 0/0 Progress、空 Record 或可用的匯出按鈕

## 5. 匯入檔案角色

### 5.1 正式 Package

只接受：

```text
schemaName = jaa-ai-analysis-package
schemaVersion = 2.0.0
schemaSha256 = Manifest v1.6.0 與 SHA256SUMS 的綁定值
```

匯入後必須顯示：filename、packageId、createdAt、generator、Pending filename、Source DB、Database Generation、Jira host、Rule Set、Template、Review Rank、records、findings、completed、Source Trace 完整度及選用 Integrity Receipt。

### 5.2 跨版本續作

跨版本續作只重新匯入正式 `jaa-ai-analysis-package v2.0.0`。HTML Template 版本不同不構成拒絕理由；只要 Package Schema、Source Trace、Immutable Gate 與 Review Rank 驗證通過即可載入。

### 5.3 錯誤角色

| 檔案 | 結果 |
|---|---|
| Pending JSON | 拒絕並說明需先由雲端 AI 產生正式 v2 Package |
| legacy analyzed result | 拒絕並說明需由雲端 AI 轉換 |
| Manual Review Progress JSON | 拒絕並說明 v1.13.1 續作只接受正式 v2 Package |
| 未知 JSON | 顯示 schemaName／schemaVersion 或缺漏欄位 |

## 6. Strict 驗證

匯入 Package 前至少驗證：

1. UTF-8 JSON parse。
2. 完整 Draft 2020-12 Schema 驗證。
3. Package-level 與每筆 Record-level Source Trace Required Fields。
4. records、counts、reviewCoverage 一致。
5. recordIndex 連續；dedupeKey／evidenceId／activityEventId 符合契約。
6. 完整 `reference`、`diff`、Pending `integrity` 與 Source Database Binding。
7. CLASSIFIED 有 Finding；UNKNOWN／EXCLUDED 無 Finding。
8. Review Rank 與 manualReview 實際狀態一致。
9. Integrity Receipt 若存在，只驗證其格式與自身契約；失敗不得改寫 Source Link 語意。

任何錯誤時不載入資料、不覆蓋現有工作、不啟用匯出。錯誤顯示 JSON Pointer 與最多 100 筆明細。

## 7. 人工驗收 UI

預設採單筆導引，避免一次顯示全部表單：

1. `問題 1：這筆應該分類嗎？`
2. `問題 2：AI 列出的 Skill 正確嗎？`
3. `問題 3：還缺少其他 Skill 嗎？`
4. `問題 4：同一句 Evidence 是否也支持另一個已存在 Skill？`
5. `完成此筆並下一筆`

每筆顯示：

- issueKey、eventTime、actor、field、Evidence ID
- readableContent／Diff lines
- AI Status、Confidence、Rationale、Negative Checks
- AI Skill Finding、Evidence、Explanation、Negative Checks、Rationale
- 人工 expectedStatus
- 每個 Skill verdict、proposedConfidence、notes
- missingSkillReviews
- additionalEvidenceAssignments
- Record notes、completed

快捷操作：

- `接受 AI 此筆全部判定`：expectedStatus=AI Status、全部 Findings=ACCEPT、completed=true。
- `標示需領域人員確認`
- `只儲存，暫不完成`
- `上一筆`／`下一筆`／`下一筆未完成`

## 8. 人工 Review 結構

每個非 null `manualReview` 必須符合 Analysis Package Schema：

```json
{
  "recordIndex": 0,
  "evidenceId": "...",
  "sourceRecordStableId": "...",
  "issueKey": "...",
  "aiStatus": "CLASSIFIED",
  "expectedStatus": "UNDECIDED",
  "statusAgreement": "UNREVIEWED",
  "skillIdentificationState": "NOT_APPLICABLE",
  "missingSkillIds": [],
  "missingSkillReviews": [],
  "additionalEvidenceAssignments": [],
  "notes": "",
  "completed": false,
  "skillReviews": []
}
```

`statusAgreement` 由 expectedStatus 與 aiStatus 自動推導。Skill ID 必須存在嵌入的 Catalog v0.3.5；不得只靠備註表達漏判 Skill。

## 9. Immutable Gate

載入 Package 時建立 Source Trace／AI immutable snapshot。人工操作不得取得可修改該 snapshot 的 UI。

匯出前重新驗證：

- Package-level Source Trace 與每筆 `sourceTrace` 必須和載入時 Deep Equal。
- 每筆 dedupeKey、recordIndex、activityEventId、sourceRecordStableId 與 `aiAnalysis` 必須和載入時相同。
- 如果不相同，禁止匯出並顯示 `IMMUTABLE_LAYER_CHANGED`。
- Hash／Integrity Receipt 只作輔助檢查，不得取代 Deep Equality 與 Required Field 驗證。

## 10. JAA Analysis Package 匯出

1. 以載入 Package 的 immutable layers 為基底。
2. 只以工作區 Review 替換 `records[].manualReview`。
3. 未做任何人工決定的 record 使用 `manualReview=null`。
4. 全部 null → `NONE / AI_ONLY`。
5. 至少一筆 Review，未全部 completed → `PARTIAL / REVIEW_PARTIAL`。
6. 全部 Record 都有 Review 且 completed → `COMPLETED / REVIEW_COMPLETED`。
7. PARTIAL／COMPLETED 設定 Template Binding v1.13.1；AI_ONLY 為 null。
8. 重算 counts，並驗證 Source Trace／AI immutable layers；Integrity Receipt 為選用。
9. generator mode=`HTML_MANUAL_REVIEW_EXPORT`，建立新 packageId／createdAt。
10. 匯出前重新執行 strict validation；失敗不得下載。

匯出不寫 SQLite。後續由 JAA v0.3.42 Importer 執行 Preflight、Review Rank Protection、transaction 與 Source Link。

## 11. 原始 AI_ONLY 副本

Advanced action 可從目前載入 Package 匯出 AI_ONLY：

- 所有 `manualReview=null`
- `templateBinding=null`
- Coverage=`NONE / AI_ONLY`
- Source／AI layers 不變
- 建立新 Package ID 並重算 integrity

此功能不能清除 JAA DB 內的高 Rank 結果；JAA Importer 仍必須阻止 AI_ONLY 覆蓋 REVIEW_PARTIAL／COMPLETED。

## 12. 本機 Autosave

- Key 由 packageId＋sourceDatabaseId＋record identity summary 組成。
- 只保存 Review records、reviewer、current index、filters、created／updated time。
- 不保存 Source Snapshot／AI Analysis／完整 Package。
- 開啟相同 Package 時提示是否載入暫存。
- Local autosave 不是正式備份；正式續作依匯出的 JAA Analysis Package。
- 提供清除目前 Package autosave，不清除其他 Package。

## 13. 資料資訊頁

另開 Workbench 內部 overlay／dialog，避免主驗收畫面混亂。至少顯示：

- 統計實際 eventTime 最早／最晚
- querySnapshot 設定區間
- 人員清單
- Issue Type／Priority／Status 分布
- source view、source database、Jira host
- Pending filename／hash
- exportMetadata／querySnapshot 完整 JSON
- Rule／Template／Package／Source Trace／Integrity 身分

## 14. Security／Privacy

- 單一 HTML；CSS、JS、Schema、Skill Catalog 全部內嵌。
- 不載入 CDN、字型、圖片、analytics、service worker 或外部 URL。
- 不使用 `eval`、`new Function`、動態 script 或 HTML 字串執行輸入內容。
- 所有輸入文字使用 `textContent`／DOM property 顯示。
- 不執行 Package 內 URL、path、SQL、command 或 HTML。
- 檔案只透過使用者 file picker／drop 讀取。
- 下載使用 Blob；不覆蓋來源檔。

## 15. Accessibility／操作簡化

- 預設只顯示一筆 Record。
- Primary action 每個階段最多一個。
- 表單 label、focus、keyboard、disabled、error 必須可辨識。
- 重要動作使用繁中動詞，不以 Schema 英文取代使用者說明。
- Advanced corrections 預設收合。
- 匯出與重設要有確認或清楚結果提示。
- 響應式支援 1280×720，手機僅需可閱讀，不要求完整高效率驗收。

## 16. 驗收測試

1. 無資料直接開啟 HTML，不報錯且只顯示匯入引導。
2. 匯入 AI_ONLY v2 Golden，顯示 0 completed 且 Source Trace COMPLETE。
3. 匯入 REVIEW_COMPLETED v2 Golden，顯示全部 completed。
4. 匯入 REVIEW_PARTIAL v2，正確顯示 coverage。
5. 匯 17 completed，5 Evidence assignments 保留。
6. 缺失 `reference`／`diff`／activityEventId 的 negative fixture 明確 fail，現有工作不被覆蓋。
7. Pending、legacy analyzed、Review 顯示正確角色；只有三檔齊全且 Identity 一致才能轉換。
8. AI_ONLY 一鍵接受一筆後匯出 PARTIAL。
9. 59 全部完成匯出 COMPLETED。
10. REVIEW_PARTIAL Package 匯出後由同一版或新版 HTML 重新匯入，round-trip 一致。
11. Review overlay record identity 不符時 fail closed。
12. 匯出前後 Source Trace／AI Analysis Deep Equal。
13. 匯出 Package 通過 Schema、Source Trace、counts、order、identity 與 review rank 驗證。
14. file:// Chrome／Edge 無 network request。
15. 重新整理後空白 HTML 仍可開啟；只有 matching autosave 可恢復人工層。

## 17. 版本紀錄

| Version | Date | Status | Change |
|---|---|---|---|
| 1.13.1 | 2026-09-02 | formal-v0.3.42-binding | 僅更新 Manifest v1.6.0、Renderer 與正式輸入包綁定；人工驗收行為與已核准 v1.13.0 相同 |
| 1.13.0 | 2026-09-02 | package-only-offline-review-workbench | 移除 Review Progress 專屬檔、統一 Package 續作、中英控制、Skill 詳情展開、明顯進度狀態及 readable Diff |
| 1.12.0 | 2026-09-02 | approved-lossless-source-trace-workbench | Package v2、Lossless Source Trace、Deep Equality Gate、選用 Integrity Receipt、Legacy 三檔轉換與離線匯出 |
| 1.11.0 | 2026-09-01 | generic-offline-review-workbench | 改為空白可開啟、操作者匯入 Package、Review v1.4 overlay、導引式人工修正與離線匯出 |
| 1.10.0 | 2026-09-01 | proposed-ai-import-export | 固定資料 HTML 新增 JAA Analysis Package 匯出與 Review JSON v1.3 |
