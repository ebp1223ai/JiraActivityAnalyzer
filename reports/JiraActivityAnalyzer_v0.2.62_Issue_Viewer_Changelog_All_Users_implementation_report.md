# Jira Activity Analyzer v0.2.62 Implementation Report

## 結果

- Target: `v0.2.62`
- Theme: Issue Viewer Changelog Alignment & All Users Scope
- Source commit: `b917017891e960df061e83c63da62cd04179d7a1`
- Production implementation: Completed
- Automated tests: Partial (v0.2.62 and v0.2.58-v0.2.61 passed; inherited v0.2.44/v0.2.45 source-text assertions remain stale)
- Build / Dist / package audit: Passed
- Real SQLite validation: Not Run
- Full Windows GUI validation: Not Run
- Overall Status: Partial

## 主要修正

1. Issue Changelog 不再從 Full Fetch payload 建立 renderer-local table。它現在透過 `database-viewer:issue-changelog` 查詢 Current-State SQLite `activity_events`，並與 Issue Activity Events 共用 `ActivityComparisonTable`、Before/After original preview、Diff、row expansion、table preferences 與 integrity/stale guards。
2. Changelog 保留 exact `eventId`、`historyId`、`itemIndex`、actor、timestamp、field、source provenance、database identity 與 preview generation。Description compact rows仍不攜帶完整 raw Before/After。
3. Issue Viewer 僅移除 Worklogs、Attachments Metadata、Remote Links 三個 presentation tabs、panel 與 payload DTO normalization。Full Fetch、Source Archive、SQLite schema v3、Activity Events 與保存 contract 均未改動。
4. Legacy/unknown active tab 會由 `normalizeIssueViewerTab` fail-safe 回到 Overview，不會產生空白 panel 或啟動已移除 tab query。
5. User Viewer 新增 typed scope：`{ kind: "all" }` 或 `{ kind: "single-user", userId }`。All Users 不使用假 account ID，也不以 display name 合併 identity。
6. User rows、total count、filtered count、related issue count、distribution、distinct values、filter、sort 與 pagination 共用同一 validated scope SQL。UI cache key 包含 database identity 與 scope key；request ID 阻擋 single/all/database switch 的 stale response。

## 驗證

- `npm.cmd run typecheck`: Passed
- `npm.cmd run test:v0.2.62`: Passed
- `npm.cmd run test:v0.2.58`: Passed
- `npm.cmd run test:v0.2.59`: Passed
- `npm.cmd run test:v0.2.60`: Passed
- `npm.cmd run test:v0.2.61`: Passed
- `npm.cmd run build`: Passed
- Detached clean-worktree `npm.cmd run dist`: Passed
- `npm.cmd run audit:package-size`: Passed, `unexpectedCount = 0`
- `git diff --check`: Passed

額外執行的 v0.2.44 與 v0.2.45 suite 仍因既有、與本輪無關的 UI source-text expectations 失敗：Connections 舊標題與 Analysis 舊 `Remote Links (Locked)` 文案。未修改這些 expectation 來掩蓋失敗。

## 封裝與限制

- 主工作樹因使用者既有 v0.2.47 tracked dirty report 無法通過 dist clean gate，因此從 Source commit 建立 detached clean worktree 封裝；未 stash、reset、clean、修改或提交該 report。
- Packaged source commit 與 Source commit 完全一致。
- Short packaged renderer smoke: Not Run。Repository 沒有安全、短時間、app-only 的既有 smoke。
- 未連線真實 Jira，未讀取真實 SQLite，未使用 OS screenshot。
- v0.2.62 branch 未 push，未建立 tag、PR、Release，也未上傳執行檔。
