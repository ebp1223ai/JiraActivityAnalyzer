# Jira Activity Analyzer v0.3.16 測試與驗證報告

## 交付狀態

- Target Version: 0.3.16
- Branch: feat/v0.3.16-artifact-output-performance-recovery
- Package Source Commit: 00dd14d62a318a2028c44398d4d24bf63537e601
- Overall Status: Partial / Manual Validation Pending
- 原因: 自動測試、Build、Dist 與短時間 Windows 啟動均通過；本輪未消耗真實 ChatGPT/OAuth 額度執行 117 筆正式分析，也未操作 Installer GUI。

## 根因與架構修正

v0.3.15 的完整 canonical JSON 由模型逐 token 回傳，造成約 22,823 output tokens、44,815 provider events、44,819 conversation events及同步 durable I/O 放大。UNKNOWN 還被錯誤要求非空 negativeChecks，導致 117 筆已產生後仍以 0/117 失敗。

v0.3.16 採用以下四項固定決策：

1. AI 只發布 compact `ai-analysis-decisions.json`，JAA 從已驗證 source records 本機 deterministic 組裝 `canonical-output/analysis-result.json`。
2. AI 分別發布 `analysis-report.md`；final assistant message 為短文字並保存至 `final-assistant-message.txt`。
3. UNKNOWN 允許空 negativeChecks，但必須有 unknownReasons、合法 confidence 與有效 rationale。全 UNKNOWN 為 `completed_with_warnings`，未人工確認不寫 SQLite。
4. provider stream 採 buffered append、1 秒週期 flush、最長 2 秒 durable flush；conversation 不再保存 raw assistant delta。

Run 使用單一 input-workspace、ai-output、canonical-output、logs 與 run-manifest 邊界。Output containment 阻擋 traversal、symlink/reparse escape。正式分析維持 bundled Codex 0.147.0、單一 Thread/Turn、無 batch、無 repair、無 retry、無外部 fallback。

## UI 與狀態

Results UI 分別顯示 Expected、AI Decisions Received、Canonical、Schema Valid、Semantic Valid、Final Accepted；可安全純文字檢視 Analysis Report 與 final summary。重大 anomaly 顯示 warning，人工接受會先重新驗證 persistence gate並寫入 durable audit，Run 仍保留 completed_with_warnings。

14:15 產生 `AI_PROVIDER_PERFORMANCE_WARNING`；20:00 hard timeout 會 abort、flush evidence、設為 `provider_timeout`，不啟動第二 Turn。

## Logging、Debug 與 Recovery

- 44,815 provider events 合成效能測試: 6,933 ms。
- 22,295 assistant deltas: conversation 中保存 0 筆 raw delta。
- Conversation semantic event count: 2。
- Debug Folder 匯出前呼叫 active writer flush。
- 規格檔: `debug-completeness.json`、`debug-file-manifest.json`，保留舊 completeness manifest 相容性。
- Canonical Run 收集包含 input、AI decisions、report、final message、canonical result、validation、completion、conversation、provider stream、runtime/application logs。
- Orphan running/validating Run 啟動時轉為 `recovered_interrupted`，不續跑、不 repair、不寫 DB。
- 真實 Run Debug Folder completeness: Manual Validation Pending，因本輪未執行真實 117 筆 Run。

## 測試與建置

| 命令/檢查 | 結果 | 耗時 |
|---|---:|---:|
| npm.cmd run typecheck | PASS | 8.2 s |
| npm.cmd run test:v0.3.16 | PASS | 11.6 s |
| npm.cmd run build | PASS | 23.6 s |
| npm.cmd run dist | PASS | 97.5 s |
| git diff --check | PASS | <1 s |
| ASAR sensitive path scan | PASS, 4,684 entries, 0 matches | 0.5 s |
| win-unpacked background launch | PASS: renderer_boot + did-finish-load | 12.4 s |
| Portable background launch | PASS: renderer_boot + did-finish-load | 14.7 s |

必要回歸包含 v0.3.12、v0.3.13、v0.3.14、v0.3.15。Build warning: Vite chunk 829.60 kB 超過 500 kB；shared/descriptionDiff.ts 的 node:crypto browser externalization 為既有 warning；electron-builder 使用預設 icon並回報 duplicate dependency references。封裝使用明確 package source commit；因使用者既有 v0.2.47 tracked 修改必須保留，dist 以授權 dirty-worktree 模式執行並標記 dirtyState=true。

## Runtime 與封裝

- Windows 11 Pro 10.0.26100
- Node v24.18.0 / npm 11.16.0
- Electron 43.0.0 / electron-builder 26.15.3
- Bundled Codex 0.147.0
- Runtime SHA-256: 935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d
- Runtime manifest / actual hash: MATCH
- Build Time: 2026/08/13 18:31:08
- Renderer route: file://.../resources/app.asar/dist/index.html
- Renderer version: v0.3.16

## 產物

詳見 `reports/JiraActivityAnalyzer_v0.3.16_artifact_manifest.json`。Installer、Portable、win-unpacked 均存在並完成 SHA-256。

## 安全掃描

未將 .env、token、credential、Cookie、Authorization、SQLite、Debug Folder、測試資料或 release binary納入 commit。ASAR 路徑掃描未發現 .env、token、database、backup、debug-folder 或 test-artifacts。測試中的 secret-value 與 ui-smoke token 是既有 redaction/synthetic fixture，不是可用 credential。

## 已知限制與人工驗證

- 真實 117 筆 Managed ChatGPT 分析、13:09/14:15 provider performance、actual token telemetry及真實 Debug completeness尚待人工驗證。
- Installer GUI 安裝/解除安裝尚待人工驗證。
- Windows 短時間啟動確認 renderer boot，未執行完整多尺寸 UI smoke。
- Token telemetry: unavailable；本執行環境未提供模型 token usage。

人工驗證時請用同一份 117 筆 pending JSON與同一組 3 MD，保留整個 Canonical Run與 Debug Folder，核對 decision/canonical count、report/final message、timing/token telemetry、warning/SQLite gate與 completeness。
