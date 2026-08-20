# JiraActivityAnalyzer v0.3.24 測試與驗證報告

- Target Version：0.3.24
- Overall Status：**Partial / Manual Validation Pending**
- Branch：feat/v0.3.24-evidence-report-data-template-rendering
- Package Source Commit：7cbb7291f85d4e4f10cf9bf79da026e7dc917ae3
- Build Time：2026/08/20 15:34:38（Asia/Taipei）
- Final Delivery Commit：本報告所屬 commit；以 annotated tag v0.3.24 為準

## 實作摘要

1. Decision v4、Evidence Segmenter 1.0.0、Aggregating Validator 與 Quality Gate v2 已接入正式 AI Analysis 流程。
2. Report Data Package v1 與 Unique Issue Snapshot Profile v1 分離 event analysis 與 current-state issue data。
3. 四份 Markdown 使用明確 role、版本與 SHA-256；Template 不送 Provider。
4. Local HTML Renderer 1.4.0 僅讀 Package + Template，支援正式／診斷模式、篩選、分頁、欄位顯示、CSV、列印與資料字典。
5. 可解析但 validation/quality 不合格的 Decision 進入 Diagnostic Package/HTML，禁止正式 SQLite。

## 自動驗證

| 命令 | 結果 | Exit | 時間 |
|---|---:|---:|---:|
| npm.cmd run typecheck | PASS | 0 | 8.858s |
| npm.cmd run test:v0.3.24 | PASS | 0 | 2.071s |
| npm.cmd run build | PASS_WITH_WARNINGS | 0 | 14.223s |
| npm.cmd run dist | Guard blocked preserved dirty report | 1 | 5.659s |
| JAA_ALLOW_DIRTY_PACKAGE=1 npm.cmd run dist | PASS_WITH_WARNINGS | 0 | 96.156s |

17／117 regression 使用 synthetic data，Decision count、segment identity、exact quote、role、validator、Package 與 renderer 均通過。v0.3.22 regression 亦通過。

## Portable 驗證

隔離 TEMP profile 啟動實際 Portable。Renderer readyState=complete、root 非空、標題為 Jira Activity Analyzer v0.3.24、Build Time 可見、#/ai-analysis 三個 tab 均存在：AI 連線與診斷、分析工作區、Activity Events 分析結果。未截取桌面；測試啟動 PID 與 TEMP 內容已清理。第二次 wrapper 因最後一個 PowerShell Write-Output 空格錯誤回傳 1，但 DOM 功能斷言已全數通過。

## Warnings

- Vite 對既有 shared/descriptionDiff.ts 的 node:crypto browser externalize warning。
- JS chunk 超過 500 kB advisory threshold。
- electron-builder 使用預設 Electron icon。
- dirtyState=true 只因保留既有 tracked v0.2.47 報告修改；該檔未提交、未納入 source commit。

## Manual Validation Pending

- 真實 Managed OAuth / ChatGPT provider。
- 真實 Jira 17／117 筆。
- production SQLite transaction、idempotent retry、rollback。
- 乾淨 Windows Installer 完整 GUI walkthrough。

Actual token telemetry：unavailable。不得宣告 Fully Validated。
