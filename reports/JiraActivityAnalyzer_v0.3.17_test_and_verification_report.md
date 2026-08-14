# Jira Activity Analyzer v0.3.17 測試與驗證報告

## 結論

- Target Version: `0.3.17`
- Overall Status: `Partial / Manual Validation Pending`
- Automated implementation: `PASS`
- Branch: `feat/v0.3.17-codex-writable-artifact-telemetry-debug-recovery`
- Package Source Commit: `fba1b9ef8f79a55c1bca2d6ccf6668d620b1357b`
- Bundled Codex: `0.147.0`
- Codex SHA-256: `935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d`

Overall Status 保留為 Partial，因真實 Managed OAuth、1／17／117 筆正式 AI 分析及 Installer GUI 尚待人工驗證；不得由編譯或 fixture 測試推論為真實服務成功。

## v0.3.16 根因修正

- `PASS`：正式 Codex Turn 不再沿用唯讀預設。Probe、Thread、Turn 以同一個 `workspaceWrite` policy 與同一個 canonical Run `ai-output` writable root 執行。
- `PASS`：writable root 僅限目前 Run 的 `ai-output`；`networkAccess=false`、`excludeTmpdirEnvVar=true`、`excludeSlashTmp=true`。
- `PASS`：正式模型 dispatch 前執行 Bundled Codex `command/exec` write/read/hash/rename/delete probe。
- `PASS`：probe 使用 Codex Runtime 接受的實際 schema，並產生 config requirements、effective permissions、write probe 與 policy comparison 證據。
- `PASS`：probe failure 保持 `modelDispatchCount=0`、Token=0，且映射 `AI_OUTPUT_WRITE_BLOCKED_BY_POLICY`。
- 唯讀回覆仍可能在作業系統 ACL、reparse point 或 Runtime policy 真正拒絕寫入時出現；此時會在模型 dispatch 前停止，不會假裝分析成功。

## 核心成果

- Decision：缺少或不合法仍為 hard failure；不從摘要或 log 重建。
- Analysis Report／Final：缺少時保留 warning 與 incomplete semantics，不冒充完整成功。
- Canonical Result／HTML：通過 Decision 與 assembly gate 後才產生；Failed／Partial 不寫入正式 SQLite。
- Token telemetry：`tokenUsage.total` 為 Run cumulative；`tokenUsage.last` 為 Last Model Call，兩者分開保存與顯示。
- Capacity estimate：使用 rules + pending input + wrapper，估算倍率為 `2.0`。
- Debug export：只 flush UI 選定的 canonical Run；`exportStatus` 與 `contentCompleteness` 分離。
- Sanitization fallback：保留原始 bytes/hash 與安全欄位，敏感內容以 placeholder 取代。

## 驗證矩陣

| 項目 | 狀態 | 結果 |
|---|---|---|
| `npm.cmd run typecheck` | PASS | exit 0，8,362 ms |
| `npm.cmd run test:v0.3.17` | PASS | exit 0，15,287 ms；包含真實 Bundled Codex 0.147.0 zero-model write-probe contract |
| `npm.cmd run build` | PASS | exit 0，25,781 ms |
| `git diff --check` | PASS | exit 0，95 ms；只有 Git LF/CRLF 提示 |
| `npm.cmd run dist` 首次 | FAIL | 8,317 ms；既有 tracked v0.2.47 報告修改觸發 clean-worktree guard，未開始封裝 |
| `JAA_ALLOW_DIRTY_PACKAGE=1 npm.cmd run dist` | PASS | exit 0，109,703 ms；依保留使用者修改要求使用專案明示 override |
| ASAR path scan | PASS | 4,684 entries；僅命中 npm `cookie` 套件與 Lucide cookie icon，無 `.env`、Token、DB 或 Debug Bundle 路徑 |
| `win-unpacked` | PASS | 6,455 ms；CDP DOM 非空、版本 0.3.17、AI Analysis 可見、renderer 使用 app.asar `file://` |
| Portable | PASS with validation-channel warning | persistent diagnostics 記錄 `did-finish-load`、版本與 commit 正確，無 renderer crash；Portable 自解壓後 CDP websocket 轉交中斷 |
| 1 筆真實 AI Run | MANUAL VALIDATION PENDING | 未使用真實 Managed OAuth／資料 |
| 17 筆真實 AI Run | MANUAL VALIDATION PENDING | 未執行長時間真實分析 |
| 117 筆真實 AI Run | MANUAL VALIDATION PENDING | 未執行長時間真實分析 |
| Installer GUI | MANUAL VALIDATION PENDING | Installer 已產生，未進行互動式安裝 |

## 封裝警告

- Vite 將 renderer 引用的 `node:crypto` externalize；本輪 build/test 未出現功能錯誤。
- Renderer minified chunk 約 831.23 kB，超過 Vite 500 kB 建議值；本輪不改變功能或拆 chunk。
- electron-builder 使用預設 Electron icon。
- electron-builder 報告部分 dependency duplicate references；封裝完成。
- write-probe contract cleanup 在 Windows sandbox ACL 下留下忽略的 `test-artifacts/v0317-codex-contract-*`，未提交、未封裝。
- Build metadata `dirtyState=true`，原因僅為使用者既有 tracked v0.2.47 報告修改；Package Source Commit 仍固定為 `fba1b9e...`。

## 使用者資料保護

- 未 stage、未修改、未刪除既有 tracked `reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md` 修改。
- 未 stage 或封裝 PDF、UI 參考資料、測試資料、`database/`、`token.txt`、歷史 prompt 與其他既有未追蹤內容。
- 未執行真實 Jira、AI、SQLite 整合測試或長時間 smoke。
