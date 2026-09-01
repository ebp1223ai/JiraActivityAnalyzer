# JiraActivityAnalyzer v0.3.39 Codex 輸入清單

- Package Purpose: v0.3.39 正式實作、測試、Windows 封裝與驗收
- Target Version: `0.3.39`
- Package Date: `2026-09-01`
- Import Contract: `jaa-ai-analysis-import-package v1.0.0`
- Import Schema SHA-256: `6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c`

## 1. 給 Codex 的方式

1. 將整份 ZIP 交給在 JiraActivityAnalyzer Repository 中工作的 Codex。
2. 指示 Codex 解壓縮到 Repository 外的暫存輸入目錄，不能覆蓋 Repo 既有檔案。
3. Codex 先讀取本 Manifest、`SHA256SUMS.txt` 與 `JAA_v0.3.39_Formal_Codex_Prompt.md`。
4. 驗證全部 checksum 後，依 Prompt 一路完成實作、測試、封裝與條件式 Git 收尾。

ZIP 已包含必要 JSON、MD 與 GUI 問題影片；不需要另外上傳 Pending JSON 或原始 Manual Review JSON。

## 2. 實作規格

| 檔案 | 角色 |
|---|---|
| `JAA_v0.3.39_Formal_Codex_Prompt.md` | 正式執行指令、測試、Release Gate、最終回報格式 |
| `JAA_v0.3.39_AI_Database_Lifecycle_UI_Design_v1.0.0.md` | v0.3.39 explicit create、Database Overview、Import UX、Recovery 與 UI 設計 |
| `JAA_AI_Analysis_Database_Design_v1.0.0.md` | 已採納的 AI SQLite、DDL、Importer、Review Rank、Source Link 基礎設計 |
| `jaa-ai-analysis-import-package_v1.0.0.schema.json` | JAA 唯一接受的 Import Package 機器契約 |

## 3. Strict Contract Fixtures

| 檔案 | 預期 |
|---|---|
| `jaa-ai-analysis-import-59__ai-only__strict-canonical-v1.0.0.json` | Strict PASS；59 records／86 findings／AI_ONLY |
| `jaa-ai-analysis-import-59__review-completed__converted-v1.0.0.json` | Strict PASS；59/59 completed／81 accept／5 reject |
| `jaa-ai-analysis-import-17__review-completed__converted-v1.0.0.json` | Strict PASS；17 records／39 findings／5 Evidence assignments |
| `jaa-ai-analysis-import-59__review-partial-54-of-59__converted-v1.0.0.json` | Strict PASS；實際 59 records、54 completed、REVIEW_PARTIAL |
| `jaa-ai-analysis-import-59__negative-inlineSegments__expected-preflight-fail.json` | 預期 strict preflight FAIL；未宣告 `inlineSegments` |
| `JAA_v0.3.39_Strict_Fixture_Validation_Report_v1.0.0.json` | Canonical／negative fixture 驗證證據 |

AI_ONLY 與 59 completed fixture 的 Source Hash 與 AI Analysis Hash 相同，可用於驗證人工驗收只增加 Review layer，以及低 Rank 不得覆蓋高 Rank。

## 4. 轉換文件

| 檔案 | 角色 |
|---|---|
| `JAA_Three_Legacy_Review_Conversion_Report_v1.0.0.md` | 人工可讀轉換說明、使用方式與「65 實際為 59」警告 |
| `JAA_Three_Legacy_Review_Conversion_Report_v1.0.0.json` | 機器驗證結果、輸出 hash 與 counts |

原始 `manual-skill-review-*.json` 不在此 ZIP，因為 JAA 不得直接匯入，也不負責 legacy conversion。

## 5. 雲端分析／人工驗收文件

| 檔案 | 角色 |
|---|---|
| `Skill_Analysis_Rule_Set_Manifest_v1.4.0.md` | Pending 分析任務與 AI Import Package 輸出規則 |
| `Skill_Classification_Common_Rules_v2.4.0.md` | Skill、Evidence、Status、Multi-skill 分類語意 |
| `Skill_Catalog_v0.3.4.md` | 279 個 Skill ID、名稱與邊界 |
| `Skill_Analysis_HTML_Report_Template_v1.10.0.md` | 人工驗收 HTML、Review JSON 與 JAA Import Package 匯出契約 |

這四份需交給 Codex，因為它們是 Repository／packaged assets 與契約回歸的一部分；但 v0.3.39 不在 JAA 內執行雲端 AI 分析，也不修改技能分類規則。

## 6. 歷史參考

| 檔案 | 角色 |
|---|---|
| `JAA_v0.3.38_Phase0_Handoff.md` | v0.3.38 Phase-0 檔案角色與舊驗證摘要 |
| `JAA_AI_Analysis_Import_Package_Phase0_Validation_Report.json` | 舊 Phase-0 結果；只供歷史比較，不能取代 v0.3.39 strict report |

舊 Phase-0 fixtures 本身未放入 ZIP，因其含 Schema 未宣告的 `inlineSegments`；必須使用本包的 strict canonical fixtures。

## 7. GUI 驗收證據

| 檔案 | 角色 |
|---|---|
| `錄製_2026_09_01_15_41_22_1.mp4` | v0.3.38 AI 分析資料庫頁實際操作證據 |
| `錄製_2026_09_01_15_42_37_531.mp4` | v0.3.38 建立入口／UI parity 缺口證據 |

影片只供開發與驗收，不得打包進 Installer／Portable runtime resources。

## 8. 重要限制

- v0.3.38 沒有完成 tag／push，因 full UI smoke 與人工 GUI 尚未通過。
- v0.3.39 必須從正確的 v0.3.38 實作 history 延續，不能從 v0.3.37 重新做。
- 使用者既有 tracked dirty 與 unrelated untracked 必須保留，不能 reset／清除／誤 commit。
- 人工 GUI 未完成時，只能標記 `Partial / Manual GUI Validation Pending`，不能 tag／push。
- 所有測試與人工 GUI 均通過時，才建立 annotated tag `v0.3.39` 並 push branch＋tag。
