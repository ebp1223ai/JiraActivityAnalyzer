# Jira Activity Analyzer v0.3.4 實作報告

## 結論

- 自動化結果：**Partial**。合成資料的 production-path、SQL／progressive／export 一致性、build、clean dist、package audit 與短啟動皆完成；真實 SQLite 與人工 GUI 驗證未執行。
- 分支：`fix/v0.3.4-description-only-diff-quick-filters`
- Source commit：`44f6c368eeac6feed7fccca776d5f5d55ca3e5bb`
- 未 push、未建立 tag、未建立 Release。

## 行為修正

- `hideNoChange`、`hideZeroAdded`、`hideZeroDeleted`、`hideBeforeUnavailable` 只套用於 canonical Description。
- canonical identity 規則：存在 `fieldId` 時只接受 normalized `description`；僅在 `fieldId` 缺少時才使用 normalized `fieldName === description`。
- Comment、Status、custom field 與其他非 Description 記錄 bypass 四項 Quick Filters，但仍遵守日期、欄位、actor、搜尋與排序。
- 同步 SQL count/rows、progressive Issue/User pagination、frozen export 與 Query Snapshot 使用一致語意。
- UI legend 改為 `Description Diff Quick Filters / Description 差異快速篩選`。
- Compact schema 維持 `0.3.3-draft.1`；Current-State SQLite schema 維持 v3；ENV format 不變。

## 主要檔案

- `shared/viewerEfficiency.ts`：匯出 canonical Description helper，限制 Quick Filter predicate。
- `electron/databaseViewer.ts`：SQL predicate 對非 Description 明確 bypass。
- `src/utils/contentChange.ts`：共用同一 identity helper，避免 fieldName 覆蓋既有 fieldId。
- `src/components/DiffQuickFilters.tsx`：Description-only UI 標籤。
- `tests/v034DescriptionOnlyQuickFilters.test.ts`、`scripts/test-v034.cjs`：72 筆合成事件、跨兩頁、Issue/User/export production-path 驗證。
- `electron/v0244UiViewerCorrectness.test.ts`：清除基準既有的過期 UI 字串斷言，保留實際 defaults 與資料行為測試。
- `README.md`、`CHANGELOG.md`、`VERSION`、`package.json`、`package-lock.json`：0.3.4 文件與版本。

## 驗證結果

| 驗證 | 結果 | 備註 |
|---|---|---|
| `npm run test:v0.3.4` | PASS | 54 mixed candidates、36 retained、18 Comments、2 pages、schema 0.3.3-draft.1 |
| v0.3.3 / v0.3.2 / v0.3.1 / v0.3.0 | PASS | Compact 與 Pending Analysis regressions |
| `npm run test:v0.2.67` | PASS | progressive filtering；約 24.1 秒 |
| `npm run test:v0.2.66` | PASS | 20,000 events worker stability、multi-user、filters；約 19.3 秒 |
| `npm run test:integration` | PASS | Electron IPC/runtime/database selection integration |
| `npm run typecheck` | PASS | renderer 與 Electron TypeScript |
| `npm run build` | PASS | version 0.3.4 verified |
| `npm run test:unit` | BLOCKED | v0.2.44 已通過；接著因基準既有 v0.2.45 `/Remote Links (Locked)/` UI 字串斷言失敗，非 v0.3.4 產品回歸 |
| clean `npm run dist` | PASS | detached source commit 封裝，99.8 秒 |
| package size/content audit | PASS | unexpected 0；ASAR 2,078 entries，敏感檔案 0，本機路徑 0 |
| Portable 12 秒短啟動 | PASS | 視窗標題 `Jira Activity Analyzer v0.3.4`，5 個新程序均 responding 並已精確終止 |

## Windows 產物

- `release/Jira Activity Analyzer Portable 0.3.4.exe`：105,175,024 bytes；SHA-256 `2904963532747C4BE42029A11746A443F4DD0C8049A86C3E9AA9E079C308004D`。
- `release/Jira Activity Analyzer Setup 0.3.4.exe`：105,405,034 bytes；SHA-256 `AD478D20DFBD84841E6F2C600EB0179209EFCC68D0BC8D60E3E409695E00C0CD`。
- `app.asar`：16,132,509 bytes；SHA-256 `77031A4AA70FC3CB9745556EBCF6359F320E2FA3D058FFB3BA7B2B906B54594F`。
- Windows Authenticode：Portable 與 Installer 均為 `NotSigned`。
- 封裝產物位於 gitignored clean worktree，未加入 Git。

## 未執行與限制

- 真實 SQLite trace、真實 Jira、Token 與 `database/` 均未讀取。
- 已知真實資料 Issue 48／User 112 案例：`NOT RUN`。
- Comment-only、Description-only、mixed-field 人工 GUI 驗證：`NOT RUN`。
- 未執行完整多尺寸 UI smoke；未 push/tag/release。
- 既有未提交 v0.2.47 報告與所有既有未追蹤資料均未修改、未暫存。
