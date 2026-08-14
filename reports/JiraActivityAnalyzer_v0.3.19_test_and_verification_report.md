# Jira Activity Analyzer v0.3.19 Test and Verification Report

## 結論

**Partial / Manual Validation Pending**

v0.3.19 的 instruction mode、可驗證 model input delivery、provider lifecycle、完整 final response 保存、sanitizer 與 cumulative token parsing 已完成自動化驗證。未以真實 Managed OAuth 執行 17/117 筆正式分析，也未執行正式 SQLite 寫入或長時間 GUI smoke，因此不得宣告完整人工驗證通過。

## 實作摘要

- 新增 `STANDARD_FORMAL`、`STANDARD_PLUS_USER_INSTRUCTION`、`CUSTOM_DIAGNOSTIC` 三種 instruction mode。
- 以 immutable safety wrapper 組合 deterministic effective instruction，保存 bytes、SHA-256 與 composition manifest。
- 以 `bridge-resumable-v2` 取代一次性大型 tool payload；每段最多 4096 UTF-8 bytes，支援 cursor、ACK、receipt token、resume、重複與順序檢查、最多三次重試。
- `SOURCE_INPUT_VALIDATED` 與 `MODEL_INPUT_DELIVERED` 分開；無 model delivery receipt 時禁止正式分析與 artifact tools。
- 修正 provider completed 與 analysis incomplete 的狀態分離；失敗時仍保存完整 final assistant message。
- sanitizer 對完整 nested payload 做遮罩，不再先截斷 JSON；累積 token event 只採最後一筆 authoritative usage。
- Custom Diagnostic 不建立 formal decisions、canonical result 或 SQLite eligible output。
- UI 提供 mode 選擇、instruction 預覽/複製、模板 CRUD、Custom warning，以及 Source/Model delivery 分離進度。

## 自動化結果

| 項目 | 結果 | 證據 |
|---|---|---|
| `npm.cmd run typecheck` | PASS | TypeScript renderer/Electron 均無錯誤 |
| `npm.cmd run test:v0.3.19` | PASS | 111,967 bytes/17 records、360,000 bytes/117 records、UTF-8、resume、retry、hash/cursor/order、三種模式、sanitizer、token |
| `npm.cmd run build` | PASS | Vite、Electron main/preload/workers、v0.3.19 bridge 完成 |
| `npm.cmd run dist` | PASS | Installer、Portable、win-unpacked 產生 |
| `git diff --check` | PASS | 無 whitespace error |
| ASAR inventory | PASS | renderer/main/v0319 bridge/manifest/package 存在，v0318 bridge 不存在 |
| Portable 短啟動 | PASS | Electron child、`did-finish-load`、renderer boot 均偵測成功 |
| 敏感資料差異掃描 | PASS | 未在 v0.3.19 差異發現 token、password、cookie、未遮罩 authorization 或 `.env` |

## 交付產物

Build Version：`0.3.19`  
Build Time：`2026/08/14 14:40:19`（Asia/Taipei）  
Package Source Commit：`81e62f82cd4567d231f7e25a8e2c5b40c896fde4`

| 產物 | Bytes | SHA-256 |
|---|---:|---|
| `release/Jira Activity Analyzer Setup 0.3.19.exe` | 190,534,884 | `d5c7070d17764614ebaecf1b500cdcc6e333b3987121cc9f75421cc43a308658` |
| `release/Jira Activity Analyzer Portable 0.3.19.exe` | 190,304,791 | `558b1d9c89344f4c60b549357bc074d50e8814d05e29fa450dcbf78fffa2d45b` |
| `release/win-unpacked/Jira Activity Analyzer.exe` | 235,706,368 | `abb9a39545356fe5c66a6b79916e113c3f252e7ebf60bac750edf240c4cd93a4` |
| `release/win-unpacked/resources/app.asar` | 24,843,686 | `469efa775b55ecbf351497ec5dcc0e58bcbea0722a273d4ab6da3041ad8bd9a7` |

Bundled Codex Runtime：`0.147.0`, SHA-256 `935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d`。  
Analysis Bridge：`0.3.19-bridge-v2`, SHA-256 `e46efeda10bc36fb79d217db47385a0e59fd11236c9f3f27bb940df0b2d9ebac`。

## Warning 與限制

- Vite 報告 `shared/descriptionDiff.ts` 的 `node:crypto` browser externalize warning。
- Renderer bundle 約 840 kB，超過 Vite 500 kB chunk warning threshold。
- electron-builder 使用預設 Electron icon，並報告重複 dependency references；封裝仍成功。
- 因既有且與本輪無關的 tracked report 修改，正式包經 `JAA_ALLOW_DIRTY_PACKAGE=1` 授權產生，`build-info.json` 的 `dirtyState=true`；該檔未被修改、暫存或提交。
- Portable 測試是短啟動診斷，不是完整 GUI 操作或長時間 smoke。

## 待人工驗證

- 真實 Managed OAuth 的 17 筆與 117 筆分析、對應 Debug Folder completeness。
- 真實 provider 回應、artifact/canonical validation 與 warning acceptance。
- 正式 SQLite eligibility/persistence。
- Installer GUI 安裝流程與三種模式的完整人工互動。

Token accounting：Codex task 未提供 authoritative token telemetry；本輪未執行真實 JAA Managed ChatGPT Run，因此兩者皆記為 `unavailable`，未以估算值冒充 actual。
