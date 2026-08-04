# Jira Activity Analyzer v0.2.63 Manual Validation

## 狀態

`Overall Status: Partial`

自動化合成 SQLite 與 clean build/dist 已通過；本輪未以真實 SQLite 或完整 Windows GUI 執行人工驗證，也未使用 OS-level screenshot。

## 已自動驗證

- 三個 viewer 的 Time/Action 永遠可見並正規化至前兩欄。
- Optional visibility/order/width、舊偏好 migration、scope isolation 與 reset semantics。
- Changelog 與 Activity Events 使用不同 IPC/query/cache identity。
- Before/After visibility 可持久化，不再被舊 Electron column IDs 重置。
- Event Type、Project、Issue Type、Status、Priority 由 SQLite typed JOIN 取得。
- Metadata filter/sort/distinct/pagination、History ID/Item query 欄位與 All Users scope。
- compact DTO、Description evidence identity、hash/integrity、stale response 與移除 tabs regressions。

## 待人工驗證

1. 以真實 Current-State SQLite 開啟 Issue Viewer Changelog、Issue Activity Events、User All Activity Events。
2. 確認 Time/Action 為第一、第二欄，checkbox disabled 且無法移動。
3. 切換 Before/After 後 reload/restart，確認 visibility 保留。
4. 逐一切換與重排 Event Type、Actor、Project、Issue Type、Status、Priority、Field、Before、After、Diff、History ID、Item、Source。
5. 確認 Changelog 僅顯示 changelog rows，Activity Events 不被 stale Changelog cache 覆蓋。
6. 驗證 metadata 是目前儲存的 Issue 值，缺值顯示 `—`。
7. 驗證 filter、sort、pagination、distinct values 與 All Users/individual user scope。
8. 驗證 Reset Widths 與 Reset Table Layout 不清除 filters/sort/date/paging/scope。
9. 關閉重開 App，確認三個 viewer 的 layout preferences 互不污染。

## Packaged App

- Setup/Portable：已重新產生。
- App-only packaged renderer smoke：Not Run。
- OS desktop screenshot：Not Run。
- v0.2.63 Tag：Not created。
