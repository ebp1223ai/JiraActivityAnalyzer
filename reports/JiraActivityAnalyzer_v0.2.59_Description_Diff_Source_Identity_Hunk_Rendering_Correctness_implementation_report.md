# Jira Activity Analyzer v0.2.59 實作報告

## 結果

- Theme: Description Diff Source Identity & Hunk Rendering Correctness
- Production implementation: Completed
- Automated verification: Passed
- Overall Status: Partial（原始真實 SQLite 案例與完整 Windows GUI 尚未由使用者重驗）
- SQLite schema: v3 unchanged
- Jira access: read-only; 本輪未連線真實 Jira
- Source commit: `fa8341421df6df880e3224fb53d042cd17655ba6`
- Packaged source dirty state: `false`

## v0.2.58 人工失敗與根因

v0.2.58 的真實 GUI 顯示 `Field = description`，展開內容卻標成 COMMENT，並可能把 Comment 或完整 After 當成 Diff。實際根因位於 `electron/databaseViewer.ts` 的 Activity Event SQL：所有事件都把 `jira_native_source_id` 投影為 `commentId`。`activityEventDisplayPolicy` 只要看到 truthy `commentId` 就判定為 Comment，因此 Description changelog history ID 被誤當成 Comment ID。舊 renderer 又缺少 validated source contract 與真正 line hunks，無 hunk 時可退回完整 After，造成第二層錯誤顯示。

## 修正後資料流

1. SQLite query 保留 activity event `id`、`source_record_id`、Jira native source ID 與 identity policy；只有 Comment event type 才產生 `commentId`。
2. Canonical Description 以 system field ID/name 精確判定，不使用 contains、timestamp、row index 或相鄰事件。
3. Issue Changelog 透過 exact `historyId:itemIndex` 找唯一 activity event；零筆或多筆候選一律 `source-mismatch`。
4. 共用 `shared/descriptionDiff.ts` 依序驗證 issue/field/source identity、side availability/completeness、rich content canonicalization、substantive comparison，再建立 hunks。
5. List DTO 只攜帶 compact status/count/hunks，不含完整 Before、After 或 Comment body。
6. `database-viewer:description-full-context` 只在使用者點擊 Before/After/Show Full Context 時，以 event ID 從 local SQLite 重新驗證並讀取；requestId/revision 防止 stale response。
7. Issue Changelog、Issue Activity Events、User Activity Events 共用 `DescriptionDiffCell` 與同一 result；Description Changed Only 只納入 `changed`，可選擇另納入 `before-unavailable`。

## Diff 演算法與保護

- 行級採 deterministic Myers sequence diff，不使用 naive N x M matrix、AI 或 prefix/suffix 假 diff。
- 每個 hunk 前後保留 2 行 context；重疊 context 合併；大段 unchanged 不進 default DTO。
- Inline 使用 grapheme segmentation（可用時為 `Intl.Segmenter`），避免拆壞 emoji/CJK。
- 集中 guards：canonical 200,000 chars、full context 1,000,000 chars、4,000 lines、10,000 rich nodes、depth 64、diff work 2,000,000。
- guard 觸發回傳 `diff-too-large`/`unparseable`，不 fallback 成完整 After。

## 修改範圍

- Engine/contract: `shared/descriptionDiff.ts`
- SQLite/repository/DTO: `electron/databaseViewer.ts`
- IPC: `electron/main.ts`, `electron/preload.ts`, `src/types/electron.d.ts`
- Renderer: `DescriptionDiffCell`, `DiffCell`, `ActivityEventDetailPanel`, Issue/User Viewer
- Tests: `tests/v0259DescriptionDiff.test.ts`, `scripts/test-v0259.cjs`
- Version/docs: VERSION, package metadata, README, CHANGELOG, verification matrix
- `tsconfig.electron.json` rootDir 放寬至 repository root，僅讓 no-emit typecheck 接受 shared module；build output 仍由既有 esbuild entry points 產生。

## 自動驗證摘要

| Gate | Result |
|---|---|
| typecheck | Passed |
| test:v0.2.59 | Passed |
| integration | Passed |
| v0.2.58 / 57 / 56 / 53 / 51 regressions | Passed |
| production build | Passed（既有 large chunk warning） |
| dist | Passed |
| win-unpacked / Portable short renderer launch | Passed |
| ASAR required files / unexpected sensitive paths | 4/4 present; 0 unexpected |
| v0.2.45 optional extra check | Failed on pre-existing `Remote Links (Locked)` UI text assertion; no expectation was modified |

## 不變量與限制

- Schema v3、Event Identity Policy v3、ENV format 與 dependencies 未變。
- 沒有 Jira write、DB migration、正式 DB 讀取、Token 讀取或 Debug Bundle 存取。
- v0.2.57 inherited Debug Folder database evidence projection issue 未處理。
- 原始真實資料失敗案例、Installer install/uninstall、完整人工作業與 diagnostics zero-error gate均 Not Run，因此 Overall Status 維持 Partial。
