# JiraActivityAnalyzer v0.3.40 Acceptance Report

## Release Gate

`Partial / Manual GUI Validation Pending`

Codex 已完成自動化與 app-only packaged smoke，但未操作使用者的正式 Windows GUI 驗收流程，因此不得宣告 Manual GUI PASS、不得建立 `v0.3.40` tag、不得 push tag/branch。

| ID | 自動證據 | 本次狀態 |
|---|---|---|
| UI-001 | 四狀態元件與 route smoke 通過 | PARTIAL：人工狀態轉換待驗 |
| UI-002 | NOT_SELECTED lifecycle 測試通過 | PENDING MANUAL GUI |
| UI-003 | atomic create + READY_EMPTY 通過 | PARTIAL |
| UI-004 | 既有 v0.3.39 DB 59-record 原地開啟通過 | PARTIAL |
| UI-005 | invalid candidate retains active identity 通過 | PARTIAL |
| UI-006 | APP_ROOT folder move/resolution 通過 | PARTIAL |
| UI-007 | external missing path = FILE_NOT_FOUND、未重建通過 | PARTIAL |
| UI-008 | production layout route smoke 通過 | PENDING visual comparison |
| UI-009 | v0.3.39 import transaction/protection regression 通過 | PARTIAL |
| UI-010 | structured actor/issue/status filters與 counts 測試通過 | PARTIAL |
| UI-011 | hide/order/default + App Settings normalization 已實作測試 | PARTIAL：重開頁人工確認待驗 |
| UI-012 | export 使用完整 structured query、忽略 hidden columns | PARTIAL：人工檔案檢查待驗 |
| UI-013 | 真實 schema synthetic fixture LEFT JOIN 測試通過 | PASS |
| UI-014 | zero-match raw rows 保留 UNANALYZED 測試通過 | PARTIAL |
| UI-015 | missing column = QUERY_SCHEMA_ERROR + missingColumns 通過 | PARTIAL |
| UI-016 | missing/closed raw = RAW_DATABASE_CLOSED 通過 | PARTIAL |
| UI-017 | append-only link attempts regression 通過 | PARTIAL：使用者 DB Relink 待驗 |
| UI-018 | REVIEW_COMPLETED rank protection v0.3.38 regression 通過 | PASS |
| UI-019 | diagnostics directory/receipts contract 與 packaged smoke 通過 | PARTIAL：人工匯出 bundle 待驗 |
| UI-020 | field/operator whitelist、parameterized SQL、path preflight 通過 | PASS |

## 人工 GUI 驗收步驟

1. 啟動 `release/Jira Activity Analyzer Portable 0.3.40.exe`，確認頂部四個狀態互相獨立。
2. 在 AI Database 頁依序驗證 NOT_SELECTED、Create、Open/Switch、Recent、invalid switch retention、More Actions。
3. 將 Portable 整個資料夾移動後，確認 APP_ROOT-relative DB identity 不變；外部 DB 缺失時顯示 FILE_NOT_FOUND 且不新建 DB。
4. 匯入正式允許的測試 package，確認只更新畫面所示 active DB；檢查 counts、Source Link summary、Relink history。
5. AI Results 套用 actor/status/date filters，確認 rows/counts/chips；隱藏並排序欄位，重開頁後仍保留；Restore Defaults 正常。
6. 匯出 filtered JSON，確認包含完整篩選排序結果與 hidden-column data。
7. Integrated Results 分別驗證 Ready、0 match、partial match、Raw DB closed、schema error；Raw rows 不得消失。
8. 匯出 Debug Bundle，確認 `ai-analysis-database/` 及 completeness，且無 Token/Authorization/raw sensitive payload。
9. 確認無白畫面、renderer crash、全域水平 overflow；完成並保存人工驗收證據。
