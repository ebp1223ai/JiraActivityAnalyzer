# Jira Activity Analyzer v0.2.63 Implementation Report

## 摘要

- 版本：`0.2.63`
- 主題：Analyzer Evidence UI, Viewer Column Control & Issue Metadata
- 分支：`fix/v0.2.63-analyzer-evidence-ui`（local-only）
- 基線：v0.2.62 final pushed HEAD `803dff7a43665db30342c3063e067715b898c870`
- Source commit：`30ea8e2baa64a43e98f6f182a4c7fbaa4d81c5e4`
- SQLite schema：維持 v3，無 migration
- Overall Status：Partial

## Phase A：v0.2.62 GitHub 銜接

- Source commit：`b917017891e960df061e83c63da62cd04179d7a1`
- Evidence/final commit：`803dff7a43665db30342c3063e067715b898c870`
- Analyzer rerun commit：無；`803dff7` 即最終 HEAD。
- 已推送 `feat/v0.2.62-issue-viewer-changelog-all-users` 並設定 upstream。
- Local HEAD、upstream 與 `git ls-remote --heads` 均為 `803dff7...`；ahead/behind=`0/0`。
- 未建立 tag、PR、Release，未上傳 EXE。

## Root Cause 與修正

1. Changelog renderer 使用 `eventTime/displayName/fieldName/before/after`，Electron 偏好層卻仍允許舊 `created/author/field/added/removed`。儲存新欄位 ID 時會被後端正規化丟棄，Before/After checkbox 因而恢復預設值。
2. 新增共用 canonical registry，供 renderer 欄位、Columns menu、visibility/order/width/default/reset 與 Electron preference normalization 使用同一 ID。
3. `Time`、`Action` 固定可見且位於第一、第二欄；required control disabled。User All Activity Events 另保留 scope 必要的 Issue Key。
4. Optional 欄位可獨立顯示/隱藏及左右重排，且不能跨越 required 欄位。Reset Widths 只清寬度；Reset Table Layout 只重設 visibility/order/width。
5. 舊偏好會遷移 `created→eventTime`、`author→displayName`、`field→fieldName`、`added→after`、`removed→before`，並處理 unknown、duplicate、missing ID；三個 preference scopes 保持隔離。

## Metadata 與查詢邊界

- `Event Type` 與人類可讀的 `Action` 分開呈現。
- 以既有 `activity_events JOIN source_objects LEFT JOIN current_issue_snapshots` 單一查詢回傳 `projectKey`、`issueTypeName`、`currentStatusName`、`currentPriorityName`，無 N+1、無 schema 變更。
- Status/Priority/Issue Type 明示為目前儲存的 Issue metadata；未知值顯示 `—`。
- Metadata、History ID、Item 支援 SQLite query-layer filter/sort/distinct/pagination。
- Changelog 仍使用專用 `database-viewer:issue-changelog` 與 `jira_changelog/changelog` source 約束；Activity Events 使用獨立 IPC/cache key。
- typed compact DTO 保留 event/source/database/generation identity，不把 raw snapshot/payload 送入列表 renderer。

## 驗證

- `npm.cmd run typecheck`：Passed
- `npm.cmd run test:v0.2.63`：Passed
- `npm.cmd run test:v0.2.62`：Passed
- `npm.cmd run test:v0.2.61`：Passed
- `npm.cmd run test:v0.2.58` 至 `test:v0.2.60`：Passed
- clean worktree `npm.cmd run build`：Passed
- clean worktree `npm.cmd run dist`：Passed
- `npm.cmd run audit:package-size`：Passed，`unexpectedCount=0`
- `git diff --check`：Passed
- Packaged renderer smoke：Not Run（沒有不干擾桌面的短版 app-only harness）
- 真實 SQLite / Windows GUI：Not Run

## 保留事項

- Jira 維持 read-only；未修改 Full Fetch、Source Archive、Save/Import/Export 或 DB schema。
- 未讀取或提交 token、`.env`、database、debug bundle、真實 Jira payload 或 release artifacts。
- 原有 v0.2.47 tracked dirty report 與所有既有 untracked 使用者檔案均保持 unstaged。
- v0.2.63 不 push、不建立 tag/PR/Release；需完成真實 SQLite 與 Windows GUI 驗證後才可提升為 Completed。
