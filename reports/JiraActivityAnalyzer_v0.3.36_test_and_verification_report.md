# Jira Activity Analyzer v0.3.36 驗證摘要

- Application：0.3.36
- Branch：`feat/v0.3.36-terminal-reconciliation-artifact-identity-correctness`
- Packaged Source Commit：`390f2e781267cf0bcf5f7da5bba13a58072e4638`
- Build Time：2026/08/25 11:30:20（Asia/Taipei）
- Dirty build：是；只因使用者既有 tracked report 修改，未納入 v0.3.36 commits。
- Live Provider：NOT RUN；Provider contacted=false。
- Production SQLite：未寫入。

## 結果

`typecheck`、v0.3.36 聚焦測試、v0.3.31～v0.3.35 regression、build、第二次 dist、packaged Bridge verifier 與 ASAR security inventory 通過。第一次 dist 因 packaged Bridge manifest registry v1/v2 不一致失敗，修正後重跑成功。

v0.3.35 真實 Debug Bundle 的解壓／讀取被安全審查阻擋，因此 forensic replay 與 corrected-host replay 均為 `BLOCKED_BY_SECURITY_REVIEW`，不是 PASS。完整 win-unpacked UI smoke exit 1 且未留下本次 v0.3.36 專屬 log；packaged Bridge diagnostics 已通過，但 renderer short startup 仍列人工驗證待辦。

## 警告

Vite 顯示既有 `node:crypto` browser externalization 與 500 kB chunk 警告；electron-builder 顯示 duplicate dependency references 與 default Electron icon。未發現封裝失敗或 stale Bridge。
