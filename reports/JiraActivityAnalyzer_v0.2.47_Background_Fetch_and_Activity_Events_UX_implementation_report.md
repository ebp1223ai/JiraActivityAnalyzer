# Jira Activity Analyzer v0.2.47 Implementation Report

## 1. 版本摘要

- Target Version: `0.2.47`
- Theme: Background Fetch & Activity Events UX
- Branch: `feat/v0.2.47-background-fetch-activity-events-ux`
- Baseline: `02d68ebe87423bfaec2be94bfa659c30f0e68b39` (v0.2.46)
- Current-State SQLite Schema: `2` (unchanged)
- Overall Status: Partial

## 2. 主要實作

- Step 3 Full Fetch 持續由 Electron main process 擁有；新增 active/status IPC、runId 篩選的 progress/log subscription、route remount hydration、cancel-requested 與 terminal snapshot。
- Database Issue List 在 loading/query refresh 時維持 table shell 與 input DOM；文字篩選採 250ms debounce，保留 focus、caret、IME composition，loading row 不替換整張表。
- Issue Viewer 移除 Activity Stream tab/IPC/session/preference，Activity Events 改查選定 Issue Key 的全部本機 SQLite `activity_events`。
- User Viewer 移除 Activity Stream tab，只保留 Related Issues 與 All Activity Events。
- Issue/User Activity Events 共用可讀化 Type、Actor、Field、Before、After、Source formatter，不直接呈現原始 JSON/provenance payload。
- 新增 Project、Issue Type、Status、Priority distributions；以 Stable User ID 的 activity events 對 distinct Related Issue keys 聚合，缺值明確顯示 `Unknown`，點擊值可篩選 Related Issues。
- Changelog/Comments 新增關鍵字篩選、Total/Filtered Count 與 50 筆 client-side paging。
- UI preference 移除 `userActivityStream`、`issueActivityStream` legacy keys，新增 `issueActivityEvents`、`issueChangelog`、`issueComments`。

## 3. 架構與資料限制

- No SQLite schema change, migration, recreation, conversion, merge, incremental sync or business-data write.
- Viewer 不呼叫 Jira API，也不下載 attachment body。
- Issue Activity Events 與 User All Activity Events 使用 SQLite server-side paging/filtering/sorting。
- Changelog/Comments 在 schema v2 只存在壓縮 Issue payload，沒有 relational tables；因此本版只能對單一已解碼 payload 做 bounded client-side filter/paging，未宣稱 SQLite server-side query。
- UI preference 是 `APP_ROOT/app-data/settings/ui-preferences.json` 的 UI-only JSON write。

## 4. Focused Verification

| Check | Result | Notes |
|---|---|---|
| `npm.cmd run typecheck` | Passed | Renderer and Electron TypeScript passed |
| `npm.cmd run test:v0.2.47` | Passed | Synthetic schema-v2 SQLite, all events, distributions, preferences, background run/source assertions |
| `npm.cmd run build` | Passed | Version verification, typecheck, Vite and Electron build passed |
| `git diff --check` | Passed | Only line-ending conversion warnings |
| First `npm.cmd run dist` | Expected guard | Packaging refused dirty tracked worktree before commit; rerun required after commit |
| Real SQLite acceptance | Not Run | No user-provided production database was opened |
| Windows GUI acceptance | Not Run | No claim of visual/manual acceptance |
| Long-running smoke | Not Run | Explicitly excluded |

## 5. Activity Stream Removal Boundary

Viewer-specific Activity Stream tab/query/IPC/session/preference surfaces were removed. Activity Stream collection and diagnostics used by Analysis/Precision Probe remain intact because they are separate data-acquisition workflows and are outside the Viewer removal scope.

## 6. Packaging And Tag Policy

Installer/Portable packaging must run from a clean commit so `packagedSourceCommit` is exact. No v0.2.47 tag is created until real SQLite and Windows GUI acceptance are completed. Release artifacts remain ignored and are not committed.

## 7. Remaining Acceptance

- Open a representative real schema-v2 SQLite database and verify Issue/User event counts and readable values.
- Perform Windows GUI navigation during an active Full Fetch and confirm progress hydration/cancel behavior.
- Verify filter top-position variance within 2px using the production Electron window.
- Verify Installer and Portable manually after packaging.
