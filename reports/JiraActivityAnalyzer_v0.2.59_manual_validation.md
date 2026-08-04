# Jira Activity Analyzer v0.2.59 人工驗證

Automated source/package gates are complete. Real company data was not accessed, so unchecked items must not be reported as Passed.

## 已完成的短離線封裝驗證

- [x] win-unpacked 啟動並由 App 自身 DevTools endpoint 讀到 `file:///.../resources/app.asar/dist/index.html`。
- [x] Portable 啟動，標題為 `Jira Activity Analyzer v0.2.59`，route 為 `#/database`。
- [x] 驗證方式未擷取 OS 桌面或其他視窗。
- [x] Build Info version/source/branch/dirty state 一致。
- [x] 測試未連線真實 Jira。

## Gate A：原始 v0.2.58 失敗案例（Not Run）

1. 以使用者核准的相同真實 SQLite 開啟 Issue Viewer。
2. 找到過去 `Field = description` 卻顯示 COMMENT 的 event。
3. 記錄 event ID、source type、status、hunk count、+N/-N，不記錄全文。
4. 預期：顯示 validated Description Diff 或 `Description source mismatch`；絕不可顯示 Comment 全文。

## Gate B：真正 hunk（Not Run）

1. 找一筆長 Description 且只修改小範圍的事件。
2. 預期 default 只顯示變更與前後 2 行 context。
3. 點 Before、After、Show Full Context 才能載入完整內容。
4. 收合再展開，確認 stable event identity 不變。

## Gate C：同時間 Comment（Passed automated / Not Run real GUI）

- Synthetic SQLite 已證明 Description 與 Comment 同 timestamp 不互串。
- 真實 GUI 仍需確認各自 evidence label 與內容來源。

## Gate D：狀態分類（Passed automated / Not Run real GUI）

逐一確認 substantive changed、whitespace-only、unchanged、reliable empty Before、before-unavailable、source-mismatch、ADF/object、long content。預期 unavailable/mismatch 不顯示全文。

## Gate E：Cross-view（Passed automated / Not Run real GUI）

對同一 event 比對 Issue Changelog、Issue Activity Events、User Activity Events；預期 event ID、status、hunks、+N/-N 與按需 Before/After 一致。

## Gate F：v0.2.58 regression（Automated Passed / GUI Not Run）

人工抽查日期模式、Changelog Excel filters、User period statistics、Step 2 filtered selection、Comments date mode、Filter Presets 與表格 pagination。

## Windows 完整 Gate（Not Run）

- Installer install/uninstall
- Portable 互動式長時間使用
- 原始真實 SQLite 案例
- diagnostics target：local error boundary=0、window.error=0、unhandledrejection=0、console error=0、writerFailed=false

## 證據回填欄位

| Gate | Build | Event ID | Source | Status | Hunks | + / - | Diagnostics | Result |
|---|---|---|---|---|---:|---:|---|---|
| A | 0.2.59 |  |  |  |  |  |  | Not Run |
| B | 0.2.59 |  |  |  |  |  |  | Not Run |
| E | 0.2.59 |  |  |  |  |  |  | Not Run |
