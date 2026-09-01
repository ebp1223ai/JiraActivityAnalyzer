# JiraActivityAnalyzer v0.3.39 AI Database Lifecycle／UI 設計規劃 v1.0.0

- Target Application Version: `0.3.39`
- Design Version: `1.0.0`
- Previous Application Version: `0.3.38`
- Status: `proposed-for-discussion`
- Prepared Date: `2026-09-01`
- Depends On: `JAA_AI_Analysis_Database_Design_v1.0.0.md`
- Import Contract: `jaa-ai-analysis-import-package v1.0.0`
- AI SQLite Schema: `v1 / PRAGMA user_version=1`（不變更）

## 1. 結論

v0.3.39 不重做 v0.3.38 的 SQLite、Importer、Review Rank 或 Source Link。它要補齊人工 GUI 驗收發現的產品缺口：

1. AI 分析資料庫不存在時，提供明確的「建立 AI 分析資料庫」流程。
2. AI 分析資料庫頁面改為與既有「資料庫總覽」相同的操作心智模型，而不是只有工程用 Import Dashboard。
3. 匯入檔選錯時，顯示可理解的檔案角色與修正方法。
4. AI 結果檢視與整合顯示結果在 DB 尚未建立或尚無資料時，提供明確下一步。
5. 修正 v0.3.38 Legacy full UI smoke harness drift，完成可重複的 packaged UI regression。

v0.3.39 完成後，使用者不需要知道 `Path=-`、`Schema=v0` 或 lazy creation 的內部語意，也不需要靠嘗試匯入檔案來猜測如何建立資料庫。

## 2. 人工驗收發現

根據兩段 v0.3.38 Windows Portable 錄影：

- AI 分析資料庫頁顯示 `Path=-`、`Schema=v0`、`Size=0 B`。
- 頁面沒有「建立 AI 分析資料庫」按鈕。
- Import Package 仍可選檔，造成使用者不知道是否要先建立 DB。
- 選到 `jaa-manual-skill-review` 後只顯示 `Preflight Failed / 0 B / Records 0`，沒有解釋選錯檔案角色。
- `Confirm Import` 在失敗畫面仍出現，視覺上無法確認是否真的禁止寫入。
- 頁面只有四張統計卡、Database Health、Import Package、Import History，沒有既有「資料庫總覽」的資料庫生命週期與資訊層次。

判定：後端功能可能存在，但 UI Lifecycle 與 Error UX 未完成。因此 v0.3.38 維持 `Partial / Manual GUI Validation Failed`，不得 Tag／Push 為正式完成版本。

## 3. 已凍結、不得改變的決策

1. AI 分析資料使用獨立全域 SQLite：

   ```text
   {JAA_DATA_ROOT}/databases/ai-analysis/jaa-ai-analysis.sqlite
   ```

2. 不得寫入 `%LOCALAPPDATA%`；Installer／Portable 遵守既有 JAA Data Root 與 containment。
3. 一個 JAA Data Root 只有一顆 active AI SQLite，不設計多顆 AI DB 任意切換。
4. 原始 Jira SQLite 與 AI SQLite 永遠是不同檔案。
5. JAA 只接受 `jaa-ai-analysis-import-package v1.0.0`。
6. `jaa-manual-skill-review`、legacy analyzed result、Pending JSON 不能直接匯入 AI SQLite。
7. Legacy 格式由雲端 AI 轉換，JAA 不實作轉換器。
8. Review Rank Protection 不變：低 Rank 不得覆蓋高 Rank。
9. Source Link Attempt 維持 append-only。
10. v0.3.39 不修改 Import Package Schema SHA、AI SQLite DDL 或 Golden Fixture 的業務語意；但必須修正既有 fixture 與凍結 Schema 的表現層落差，使 canonical fixture 本身能通過 strict Schema validation。

## 4. 範圍

### 4.1 v0.3.39 必做

- AI DB explicit create／open-existing／health lifecycle。
- AI 分析資料庫頁資訊架構重整。
- 正確的 empty、creating、ready、degraded、error 狀態。
- Import gating、file-role validation 與繁中錯誤。
- 有效 Package 的 Preflight／Preview／Confirm 清楚分階段。
- AI 結果檢視與整合頁的空狀態與 cross-page action。
- Database backup／open folder／refresh／health check／diagnostic。
- Legacy UI smoke harness 更新。
- Windows Portable／Installer 人工 GUI 驗收。
- 成功後才 Commit、Tag `v0.3.39`、Push。

### 4.2 非目標

- 不恢復封存中的 AI 分析頁。
- 不在 JAA 內呼叫雲端 AI。
- 不新增 legacy Review JSON converter。
- 不重新定義技能分類規則。
- 不允許 Renderer 直接開啟 SQLite。
- 不在 AI 分析資料庫頁展開單筆 Skill 詳細資料。
- 不變更原始 Jira SQLite schema。

## 5. Database Lifecycle 狀態機

### 5.1 狀態

| UI State | 定義 | 可用操作 |
|---|---|---|
| `NOT_CREATED` | 預期路徑不存在 DB | 建立資料庫、重新偵測 |
| `CREATING` | 正在建立 temp DB、DDL 與驗證 | 只顯示進度；禁止重複操作 |
| `READY_EMPTY` | Schema v1 正常、尚無 AI Record | 匯入、Health Check、Backup、Open Folder |
| `PREFLIGHTING` | 正在只讀驗證 Package | 取消選檔；禁止 Confirm |
| `PREFLIGHT_FAILED` | Package 不可匯入 | 重新選檔、匯出 Diagnostic |
| `PREVIEW_READY` | Preflight 通過、等待使用者確認 | Confirm、Cancel |
| `IMPORTING` | Transaction／Link 執行中 | 顯示進度；禁止重複 Import |
| `READY_WITH_DATA` | DB 正常且至少一筆 AI Record | 匯入、Relink、查詢、Backup、Health Check |
| `MIGRATING` | 未來 schema migration | 顯示進度；禁止 Import |
| `READ_ONLY_DIAGNOSTIC` | Integrity／Migration blocking failure | Diagnostic、Backup、Open Folder；禁止寫入 |
| `ERROR` | 建立／開啟／I/O 非預期失敗 | Retry、Diagnostic；依錯誤決定能否刪除半成品 |

### 5.2 合法轉移

```text
NOT_CREATED
→ CREATE REQUEST CONFIRMED
→ CREATING
→ READY_EMPTY

READY_EMPTY／READY_WITH_DATA
→ SELECT PACKAGE
→ PREFLIGHTING
→ PREFLIGHT_FAILED
  或
→ PREVIEW_READY
→ CONFIRM IMPORT
→ IMPORTING
→ READY_WITH_DATA

READY_EMPTY／READY_WITH_DATA
→ HEALTH FAILURE
→ READ_ONLY_DIAGNOSTIC
```

不得在 `NOT_CREATED`、`CREATING`、`PREFLIGHT_FAILED`、`IMPORTING`、`MIGRATING` 或 `READ_ONLY_DIAGNOSTIC` 執行 Confirm Import。

## 6. AI 分析資料庫頁面資訊架構

### 6.1 頁首

標題：

```text
AI 分析資料庫 / AI Analysis Database
```

副標：

```text
管理獨立 AI SQLite、匯入已分析資料、檢查來源連結與匯入歷史。
```

頁首狀態 Badge：

- 尚未建立
- 建立中
- 正常／空資料庫
- 正常／已有資料
- 唯讀診斷
- 錯誤

### 6.2 `NOT_CREATED` 空狀態

頁面第一視覺必須是明確引導卡，不顯示容易誤會為正常 DB 的四張 0 統計卡。

必須顯示：

- `尚未建立 AI 分析資料庫`
- 完整預計路徑
- `Schema v1 / user_version=1`
- 說明：「此資料庫與原始 Jira 資料庫分離，用於保存雲端 AI 分析與人工驗收結果。」
- 說明：「建立空資料庫不會匯入資料，也不會修改原始 Jira SQLite。」

操作：

- Primary：`建立 AI 分析資料庫`
- Secondary：`重新偵測`
- 如果 parent folder 已存在：`開啟資料夾`

Import Package 在此狀態預設 disabled，旁邊顯示：

```text
請先建立 AI 分析資料庫，再匯入 JAA AI 分析匯入 JSON。
```

### 6.3 Database Overview

建立成功後，版面與既有「資料庫總覽」的資料卡、欄位命名、間距與操作位置一致。

資料庫資訊至少包含：

| 欄位 | 顯示內容 |
|---|---|
| Name | `jaa-ai-analysis.sqlite` |
| Full Path | 完整實體路徑，可複製 |
| Schema | `AI Analysis Schema v1` |
| SQLite user_version | `1` |
| SQLite runtime | SQLite version |
| File Size | bytes 與可讀單位 |
| Integrity | `ok`／具體失敗 |
| Foreign Keys | PASS／失敗數 |
| Invariants | PASS／失敗數 |
| Journal Mode | WAL |
| Created At | 檔案／metadata 建立時間 |
| Modified At | 最後修改時間 |
| Last Opened | 本次開啟時間 |
| Last Successful Import | 時間或尚無 |
| Last Health Check | 時間與結果 |

資料統計卡：

- AI Records
- Skill Findings
- Reviewed Records
- Matched Sources
- Source Contexts
- Import Batches

操作：

- `匯入資料`
- `重新整理`
- `健康檢查`
- `建立備份`
- `開啟資料夾`
- `匯出 Diagnostics`

### 6.4 Source Context 摘要

在 Database Overview 下新增 Source Context list，不顯示單筆 AI Record：

| 欄位 | 說明 |
|---|---|
| Jira Server | host／fingerprint 簡短值 |
| Source Database ID | 可複製 |
| Source View | Pending 來源 |
| Records | AI Record 數 |
| Review Rank | 各 Rank count |
| Link Coverage | matched／error／unavailable |
| Last Import | 時間 |

### 6.5 Import History

保留 v0.3.38 Import History，但補強：

- Package filename／packageId
- Review Rank
- Preflight result
- Insert／Replace／Protected／No-op／Rejected
- Link result
- Started／Completed／Elapsed
- 可展開 Batch summary
- 可匯出該批 Diagnostic

## 7. 建立資料庫流程

### 7.1 確認對話框

按下「建立 AI 分析資料庫」後顯示：

- 完整目標路徑
- Schema／user_version
- 「不會修改原始 Jira Database」
- 「建立後仍需另外匯入 JAA AI 分析匯入 JSON」
- Confirm：`建立資料庫`
- Cancel：`取消`

### 7.2 Atomic Create

Main process 必須：

1. 解析並驗證 JAA Data Root。
2. 建立 parent folder。
3. 在同一目錄建立唯一 temp SQLite。
4. 設定 PRAGMA。
5. 在 transaction 中執行 Frozen DDL v1。
6. 設定 `PRAGMA user_version=1`。
7. 執行 foreign key、integrity 與 invariant checks。
8. checkpoint／close。
9. Atomic rename 為 `jaa-ai-analysis.sqlite`。
10. 重新開啟並再驗證一次。
11. 寫入不含 secret 的 lifecycle receipt。

任一步失敗：

- 關閉 handle。
- 刪除本次 temp file／其 WAL／SHM。
- 不碰既有正式 DB。
- 顯示 error code、stage、path、message。

不得建立 0-byte 正式 DB 後再逐步補內容。

### 7.3 已存在 DB

- 啟動時若預期路徑存在，先讀 header、user_version、integrity，再決定 READY 或 READ_ONLY_DIAGNOSTIC。
- 不提供任意路徑「選擇其他 AI DB」作為正常操作，避免同一 Data Root 出現多顆 active DB。
- Recovery 如需替換，走明確 Restore／Backup 流程，不在 Create 按鈕混用。

## 8. Import UX

### 8.1 可接受檔案

只接受：

```text
schemaName    = jaa-ai-analysis-import-package
schemaVersion = 1.0.0
```

File picker 標題：

```text
選擇 JAA AI 分析匯入 JSON
```

輔助說明：

```text
請從技能驗收 HTML 按「匯出 JAA 匯入 JSON」。
不要選擇 manual-skill-review、pending-analysis 或 legacy analyzed result。
```

### 8.2 Preflight Error

不得再只顯示 `Preflight Failed / 0 B / Records 0`。

錯誤卡必須顯示：

- 選擇檔案完整路徑
- Filename
- Bytes
- SHA-256（成功讀取時）
- Error Code
- Failure Stage
- Expected Schema／Version
- Observed Schema／Version
- JSON Pointer（適用時）
- Record Index（適用時）
- 繁中說明
- 建議下一步

### 8.3 常見錯誤專用訊息

| Observed | Error Code | 訊息 |
|---|---|---|
| `jaa-manual-skill-review` | `WRONG_FILE_ROLE_MANUAL_REVIEW` | 這是人工驗收續作檔，不是資料庫匯入檔。請回 HTML 按「匯出 JAA 匯入 JSON」。 |
| `jira-activity-analyzer.pending-analysis` | `WRONG_FILE_ROLE_PENDING` | 這是待分析資料，必須先交給雲端 AI 分析。 |
| `jaa-skill-analysis-result` | `WRONG_FILE_ROLE_LEGACY_ANALYZED` | 這是舊版分析結果，請由雲端 AI 轉成 Import Package v1.0.0。 |
| ZIP／非 JSON | `UNSUPPORTED_FILE_TYPE` | 請先解壓縮並選擇 Package JSON。 |
| Schema SHA mismatch | `IMPORT_SCHEMA_IDENTITY_MISMATCH` | Package 契約與 JAA 內建 Schema 不一致。 |
| Package hash mismatch | `PACKAGE_INTEGRITY_FAILED` | Package 內容已變更或損壞。 |

任何 Preflight Failed：

- Confirm Import 不渲染或明確 disabled。
- 不建立 DB。
- 不寫 Import Batch／History。
- 可匯出 Preflight Diagnostic。

### 8.4 Preview Ready

Preflight 通過後才顯示 Confirm：

- Package filename／bytes／hash
- Source Context
- Rules／Template binding
- Review Coverage／Rank
- Records／Findings／Status
- Insert／Replace／Protected／No-op
- Link 預估
- 明確提示「本次是否會覆蓋既有資料」

Primary：`確認匯入`

Secondary：`取消`

## 9. 其他兩頁的 Lifecycle UX

### 9.1 AI 結果檢視

| 狀態 | 顯示 |
|---|---|
| DB 未建立 | 尚未建立 AI 分析資料庫＋前往建立 |
| DB 已建立但無資料 | 尚未匯入 AI 分析資料＋前往匯入 |
| DB 唯讀診斷 | 顯示健康錯誤，不查詢可能不一致資料 |
| Ready | 正常 filters／statistics／list |

### 9.2 整合顯示結果

- Raw DB 未開啟：引導使用者先開啟原始資料庫。
- AI DB 未建立：仍可顯示 Raw Records，但全部標示 `UNANALYZED`，並顯示建立 AI DB 的 CTA。
- AI DB 已建立但無資料：同上，說明尚未匯入。
- AI DB 有資料但 Source DB context 不符：顯示 `SOURCE_DB_MISMATCH`，不得當作未分析。

## 10. IPC 契約

Renderer 只能呼叫明確 IPC：

```text
aiDb:getLifecycleState
aiDb:create
aiDb:refresh
aiDb:runHealthCheck
aiDb:createBackup
aiDb:openFolder
aiDb:selectImportPackage
aiDb:preflightImport
aiDb:confirmImport
aiDb:cancelPreflight
aiDb:exportDiagnostics
```

要求：

- 每個 request 有 requestId、runtime validation、structured result／error。
- `create` 與 `confirmImport` 有 single-flight guard。
- Renderer 不傳入任意 SQL、DDL、command 或 destination path。
- Main process 自行解析 Data Root 與正式 DB path。
- Progress event 帶 operationId，頁面重載後可 hydration。

## 11. Migration 與相容性

### 11.1 v0.3.38 已建立 AI DB

- v0.3.39 啟動後直接驗證並開啟。
- 不重建、不清空、不重新匯入。
- Schema v1 不變，不執行破壞性 migration。

### 11.2 v0.3.38 沒有建立 DB

- 顯示 `NOT_CREATED`，不以 `Schema v0 / 0 B` 冒充 Database Health。

### 11.3 v0.3.38 留下 0-byte／半成品

- 不直接覆寫。
- 判定 `INVALID_DATABASE_FILE`。
- 提供 Diagnostic 與「移至隔離區後重新建立」的明確恢復流程。
- 隔離是可恢復 move，不做永久刪除。

### 11.4 Import Contract／Golden Fixture 相容性修正

轉換實測確認既有 59-record Pending snapshot 的部分 `diffHunks[].lines[]` 含 `inlineSegments`。然而凍結的 `jaa-ai-analysis-import-package v1.0.0` 在 `$defs.diffLine` 採 `additionalProperties: false`，並未宣告 `inlineSegments`；既有 phase-0 Golden Package 也含相同欄位。這代表先前 importer／fixture 驗證與正式 JSON Schema 之間存在契約落差。

v0.3.39 必須採取以下處理：

1. `inlineSegments` 定義為 Pending HTML／UI 的衍生顯示資料，不是 AI Import Package 的 canonical 欄位。
2. 雲端轉換產生 Package 時移除該欄位，但必須保留 line `text`、`kind`、old/new line number、hunk 與 source identity。
3. 重新產生不含 `inlineSegments` 的 canonical Golden／converted fixtures。
4. 每份 fixture 必須同時通過 Draft 2020-12 Schema validation、JCS package hash、record identity 與語意 invariant。
5. JAA importer 不得為了相容而默默接受未宣告欄位；未知欄位應在 preflight 以 JSON Pointer 回報。
6. 保留 legacy fixture 的 failure receipt，證明修正的是 fixture representation，而不是放寬 Schema。
7. Import Package Schema filename、schema version 與 SHA-256 均保持不變。

## 12. Legacy UI Smoke 修正

v0.3.38 的 legacy full UI smoke 因 bridge harness drift 失敗。v0.3.39 必須：

1. 先證明失敗是 harness 契約過時，不是 production regression。
2. 依目前 preload／IPC 正式契約更新 harness。
3. 不得為通過測試而降低 context isolation、IPC validation 或安全限制。
4. 保留舊 failure receipt 與新 contract mapping。
5. Packaged win-unpacked 與 Portable 都要跑 UI smoke。

## 13. Acceptance Tests

### 13.1 Database Create

1. Fresh Data Root 顯示 NOT_CREATED 與完整預期路徑。
2. Import disabled。
3. Create confirmation 正確。
4. Atomic create 後 user_version=1、integrity=ok、FK=PASS、invariants=PASS。
5. Refresh 後 path／size／times 正確。
6. 關閉重開仍載入同一 DB。
7. 注入 DDL／I/O failure 不留下正式半成品。
8. 重複點擊 create 只執行一次。

### 13.2 Wrong File Role

1. `jaa-manual-skill-review` 顯示專用錯誤與 HTML 匯出指引。
2. Pending 顯示待分析指引。
3. Legacy analyzed 顯示雲端轉換指引。
4. Preflight Failed 沒有 Confirm、DB write、Import History。

### 13.3 Valid Import

1. AI_ONLY Golden：59 records／86 findings。
2. REVIEW_COMPLETED：59 completed／81 Accept／5 Reject／10 disagreements。
3. 再匯 AI_ONLY：全部受 Review Rank Protection。
4. 17 completed converted Package：17 records／39 findings／5 Evidence assignments。
5. Partial converted Package：59 records／54 completed，Rank=`REVIEW_PARTIAL`。

### 13.4 UI Parity

1. Database Overview 的資訊密度、路徑顯示與 action placement 與原始資料庫總覽一致。
2. AI DB 頁不顯示單筆 Skill detail。
3. AI Results／Integrated Results 的空狀態與 CTA 正確。
4. 鍵盤、focus、disabled、loading 與錯誤狀態可辨識。

### 13.5 Regression

- 原始資料庫總覽不變。
- Issue／User Viewer 與 Pending export 不變。
- AI 分析（封存中）仍 disabled。
- AI SQLite DDL、Schema SHA、Importer、Review Rank、Source Link regression 全部通過。
- Canonical Golden／converted fixtures 不含未宣告的 `inlineSegments`，並通過 strict Draft 2020-12 validation。
- 含 `inlineSegments` 或其他未知 diff-line 欄位的 negative fixture，必須在 preflight 明確失敗且不得寫入 DB。
- Updated full UI smoke PASS。

## 14. 人工 GUI 驗收腳本

1. 使用全新 Portable Data Root 啟動。
2. 開啟 AI 分析資料庫，確認顯示建立引導。
3. 建立 DB，確認 Path、Schema v1、Size、Integrity。
4. 選 manual review JSON，確認專用錯誤且無 Confirm。
5. 選 17 completed converted Package，Preview 後匯入。
6. AI DB Overview 顯示 17 records／39 findings／17 reviewed。
7. AI Results Viewer 可查資料。
8. Integrated Results 顯示 matched／unmatched／link error。
9. 再匯 59 completed converted Package。
10. 關閉重開，資料與 Import History 保留。
11. Health Check、Backup、Open Folder、Diagnostics 正常。
12. 原始資料庫頁與 Pending export 無回歸。

## 15. 實作階段

### Phase 1：Lifecycle 與 Atomic Create

- Main-process lifecycle service。
- IPC、single-flight、receipt、recovery。
- Unit／failure injection tests。

### Phase 2：AI Database Overview UI

- NOT_CREATED／READY／DIAGNOSTIC layouts。
- 原始 Database Overview 視覺與元件重用。
- Source Context、Health、actions。

### Phase 3：Import UX

- File-role detection。
- Structured Preflight error。
- Preview／Confirm gating。
- 修正 Golden fixture 與凍結 Schema 的 `inlineSegments` 契約落差，加入 strict-schema negative regression。

### Phase 4：Cross-page Empty States

- AI Results Viewer。
- Integrated Results。

### Phase 5：UI Smoke 與 Windows 驗證

- 更新 harness。
- Installer／Portable packaged smoke。
- 人工 GUI checklist。

### Phase 6：報告與 Git

- Execution time／Token ledger。
- Acceptance／Test／Implementation reports。
- Build manifest、Installer／Portable hashes。
- 全部成功且人工 GUI 通過後，Commit、annotated tag `v0.3.39`、Push。

## 16. Release Gate

只有下列全部通過才可宣告 Completed：

- Create lifecycle tests PASS。
- Wrong-file-role tests PASS。
- Golden／converted Package import tests PASS。
- Review Rank／Source Link regression PASS。
- Updated packaged full UI smoke PASS。
- Installer／Portable build PASS。
- 使用者人工 GUI 驗收 PASS。
- 既有 tracked dirty 修改未被納入。
- `git diff --check` PASS。
- Reports、time/token ledger、Debug Bundle 完整。

人工 GUI 尚未通過時，狀態只能是：

```text
Partial / Manual GUI Validation Pending
```

## 17. 版本紀錄

| Design Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-01 | 建立 v0.3.39 explicit AI DB create、Database Overview parity、file-role error UX、cross-page lifecycle、legacy UI smoke 修正與 release gate |
