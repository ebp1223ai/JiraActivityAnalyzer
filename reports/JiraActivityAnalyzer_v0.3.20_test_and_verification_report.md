# Jira Activity Analyzer v0.3.20 測試與驗證報告

## 結論

v0.3.20 的 Artifact Contract 與 Rule Set Alignment 已完成原始碼實作、聚焦回歸、正式建置與 Windows 封裝。自動化範圍為 PASS；因本輪依規格不執行真實 Managed OAuth、Jira、AI 與 SQLite 整合，整體交付狀態記為 **Partial / Manual Validation Pending**，不可解讀為真實 17 筆或 117 筆分析已通過。

## 根因與修正

舊橋接流程在模型提交直接 JSON array 時，曾經由 `object(args.decisionsDocument)` 將陣列轉成空物件；提示又要求直接陣列，而既有 parser 偏向 wrapper，造成提交契約互相矛盾。v0.3.20 建立單一 Decision Contract：root 必須是 direct array、筆數與輸入 N 完全一致、索引集合完全一致、每筆固定 8 個欄位，並將 root type、count、index、schema、skill ID 與 semantic 錯誤分開回報。

Provider 已完成但 artifact 驗證失敗時，provider 狀態仍保留 completed；artifact lifecycle 會進入 `submission_rejected`，根本錯誤保留，衍生後果另列 `AI_ARTIFACT_SUBMISSION_MISSING`。每次提交會留下固定路徑的 attempt/result metadata 證據，不包含原始 prompt、token 或 Authorization。

## Rule Set 綁定

- Rule Set ID：`JAA-SKILL-RULESET-2026-08-14-DRAFT-02`
- Manifest：`0.2.0`
- Common Rules：`1.2.0`
- Catalog：`0.3.1`
- Classification：`JAA-CLASSIFICATION-1.2.0`
- Prompt：`JAA-CHATGPT-ZH-TW-0.3.20`
- Pipeline：`JAA-ANALYSIS-PIPELINE-0.3.20`
- Output Schema：`jaa-ai-analysis-decisions-v2`

規則檔會封裝到 `resources/bundled-rules/v0.3.20`，loader 會核對版本、檔案內容與 SHA-256，不接受隱性漂移。

## 自動化結果

| 項目 | 結果 | Exit code | 耗時 |
|---|---:|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 9.179 秒 |
| `npm.cmd run test:v0.3.20` | PASS | 0 | 12.526 秒 |
| `npm.cmd run build` | PASS | 0 | 24.912 秒 |
| `$env:JAA_ALLOW_DIRTY_PACKAGE='1'; npm.cmd run dist` | PASS | 0 | 117.065 秒 |
| `git diff --check` | PASS | 0 | 約 0.5 秒 |

聚焦測試涵蓋：17 筆 direct-array 首次提交成功、筆數不符拒絕與 lifecycle 證據、root/count/index/schema/skill/semantic 各類錯誤、UNKNOWN 空欄位的負向案例、報告筆數警告、UTF-8 指令確定性、Rule Set 精確綁定，以及既有 17/117 筆 resumable transport regression。

## 封裝與啟動

- Build Version：`0.3.20`
- Build Time：`2026/08/14 17:45:29`（`2026-08-14T09:45:29.539Z`）
- Packaged Source Commit：`924c0a546dfee83fe2a661f36e3e15c16f25c686`
- Bridge：`0.3.20-bridge-v3`
- Bridge SHA-256：`8466dba29101fd99e47afd329f4b634d084c7765e118610d8cb835e8c442c0a8`

隔離 Portable 短啟動在 `test-artifacts/v0320-portable-startup-20260814-175245/` 留下 app-only 診斷：12 秒內觀察到 5 個相關程序、`renderer_boot=1`、`Initial Route Ready=1`、主程序 load/crash 錯誤事件為 0。未擷取桌面，也未連線真實服務。既有 v0.3.19 Portable 程序未被終止或修改。

ASAR 已確認包含 renderer、`main.cjs`、`preload.cjs`、v0.3.20 bridge 與 manifest；不含舊 v0.3.18/v0.3.19 bridge。精確敏感路徑掃描未發現 `.env`、`token.txt`、database 或 debug bundle。

## 警告與限制

- Vite 回報 `node:crypto` browser externalization 警告。
- Vite 回報部分 chunk 大於 500 kB。
- electron-builder 使用預設 Electron icon，並回報既有 dependency reference 警告。
- 封裝使用 dirty override，唯一原因是保留既有、與本版無關的 tracked v0.2.47 報告修改；該檔未納入 v0.3.20 commit。
- 真實 Managed OAuth 17 筆：Manual Validation Pending。
- 真實 Managed OAuth 117 筆、真實 Jira／AI／SQLite、長時間 UI smoke：Not Run。
- Codex task 與 JAA Managed run 均無可用的權威 token telemetry。

## Git 與資料保護

原始碼 commit 為 `924c0a546dfee83fe2a661f36e3e15c16f25c686`。最終交付 commit 由 annotated tag `v0.3.20` 解析。所有既有未追蹤資料、`token.txt`、database、測試資料與歷史 prompt 均未加入 Git、未修改、未移動、未刪除。
