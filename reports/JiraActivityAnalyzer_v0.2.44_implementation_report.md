# JiraActivityAnalyzer v0.2.44 Implementation Report

## 本版目標

v0.2.44 修正 v0.2.43 App Shell 與既有資料流的整合：分離 Jira 與 Database 頁面責任、讓 Viewer 正確讀取 Current-State Database，並將 Data Collection 整理為清楚的五步驟工作流。

## 已完成

- Connections 僅保留 Jira API、`.env`、認證、遮罩 Token 與連線診斷。
- Database Overview 集中資料庫選取、建立、重新驗證、重新整理、完整健康檢查、統計、最近寫入與開啟資料夾。
- Issue Viewer 僅透過安全 IPC 讀取目前資料庫，不呼叫 Jira API。
- 主程序驗證 payload format、壓縮與解壓大小、gzip、SHA-256 與 JSON；64 MB 上限防止異常解壓。
- Description 優先使用 rendered description，移除 script、style、iframe 與 HTML 標籤；失敗時退回 plain text。
- Changelog、Comments、Attachments、Issue Links、Remote Links 與 Activity Events 分別映射，Remote Links 關閉時回傳明確狀態。
- 修正 `node:sqlite` BLOB 為 `Uint8Array` 時被誤判為無 payload 的問題。
- Issue Viewer 與 User Viewer 使用各自的 SessionState；切換 route 不清除查詢、結果、條件或目前 tab。
- Data Collection 提供五個彩色 tabs、鍵盤方向鍵/Home/End 操作，以及對應內容色。
- Step 1 固定以 Force All Rounds、1 Calendar Month、3 rounds、5000 ms、Union、2026-01-01 至執行當日執行。
- 新 Timeline run 會清除舊的 selected set、queue、Full Fetch 與 related 狀態；零事件或無可用 baseline 不會完成下游步驟。

## Viewer 資料流

Renderer 只傳 Issue Key。Main process 使用目前已驗證的 read-only Database path，結合 `current_issue_snapshots`、`current_full_fetch_payloads` 與 `activity_events`，完成解壓、完整性驗證、normalization 後回傳最小 `IssueViewerDto`。Renderer 不取得 SQLite connection、任意路徑、Node API 或 Jira credential。

## Mapping

| Viewer | 來源 |
|---|---|
| Overview | Current Issue Snapshot |
| Description | renderedFields.description，退回 fields.description |
| Changelog | changelog |
| Comments | comments 或 fields.comment.comments |
| Attachments | attachments 或 fields.attachment |
| Issue Links | issueLinks 或 fields.issuelinks |
| Remote Links | remoteLinks 與 sectionStatus |
| Activity Events | activity_events |
| Raw Evidence | 有長度上限的 payload preview |

## Database 影響與相容性

- Schema change: No
- Migration required: No
- Database recreation required: No
- Data conversion required: No
- Current-State schema: 2
- v0.2.41／v0.2.42／v0.2.43 相容資料庫：沿用既有 runtime compatibility 規則，可直接唯讀使用，不因 Viewer 修正而重建。
- Partial／Failed 正式寫入 gate 未變更。

## 測試與驗證

`test:v0.2.44` 使用完全合成化的暫存 SQLite fixture，驗證 Description、140 Changelog、48 Comments、142 Attachments、2 Issue Links、453 Activity Events、Remote Links OFF、gzip failure 與 malformed JSON。

本次執行環境未提供真實 COPGEN1-138930 Database，因此沒有宣稱真實資料庫驗證；測試只使用匿名 fixture。長時間多尺寸 UI smoke 依任務要求未執行。

| Command | Result | Duration |
|---|---|---:|
| `npm.cmd run typecheck` | Passed | 9.7 s |
| `npm.cmd run test:v0.2.43` | Passed | 1.4 s |
| `npm.cmd run test:v0.2.44` | Passed | 3.1 s |
| `npm.cmd run build` | Passed | 24.7 s |
| `npm.cmd run dist` | Passed | 109.2 s |
| Portable process check | Alive and responding after 6 seconds | 6.6 s |

Build Version 為 `v0.2.44`，正式封裝 Build Time 為 `2026/07/29 10:51:35`（Asia/Taipei），packaged source commit 為 `cb122eb8c8ee35f34f0caae1a0ef8e3640632cde`。

產物：

- `release/Jira Activity Analyzer Setup 0.2.44.exe`
- `release/Jira Activity Analyzer Portable 0.2.44.exe`
- `release/build-info.json`

## 已知限制

- Viewer session state 僅在 App 本次執行期間保存，關閉 App 後不保存。
- Raw Evidence 僅提供有上限的安全 preview。
- 真實相容 Database 仍需依手動驗證文件由使用者驗收。

## 主要修改檔案

- `electron/databaseViewer.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/types/databaseViewer.ts`
- `src/state/SessionStateContext.tsx`
- `src/routes/ConnectionsPage.tsx`
- `src/routes/DashboardPage.tsx`
- `src/routes/IssueViewerPage.tsx`
- `src/routes/UserViewerPage.tsx`
- `src/routes/AnalysisPage.tsx`
- `electron/v0244UiViewerCorrectness.test.ts`
