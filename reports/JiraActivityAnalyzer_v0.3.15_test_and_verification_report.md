# Jira Activity Analyzer v0.3.15 測試與驗證報告

## 結果

- Target Version: `0.3.15`
- Theme: Bundled Codex Runtime, Local File Workspace, Count-aware Output, Canonical Debug Evidence
- Overall Status: **Partial / Manual Validation Pending**
- Package Source Commit: `90cff22587b4d30cd140a6c5a38aa859ae1ca6ff`
- Build Time: `2026/08/13 14:15:57` (`2026-08-13T06:15:57.750Z`)

自動化 gate、build、dist、artifact hash、內嵌 runtime hash、ASAR 排除與本機 packaged startup 均通過。未在全新 Windows、未安裝外部 Codex 的機器執行；互動式 ChatGPT OAuth、真實 117 筆單次 Provider 分析與 Installer GUI walkthrough 未執行，因此不可標記為完整人工驗收完成。

## 核心驗證

- 官方 `@openai/codex-win32-x64` `0.147.0` 以 `BUNDLED_ONLY` 封裝；manifest 與 executable SHA-256 均為 `935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d`。
- Runtime resolver 不搜尋 PATH、不使用外部 fallback、不自動下載；missing/version/hash mismatch 均 fail closed。
- 正式分析 workspace 固定為 `1 JSON + 3 MD`，Provider prompt 不含檔案全文；一個 Run 僅一個 thread 與一個主要 turn，無固定 batch、無 repair retry。
- Output Schema 以輸入數量 N 設定 `minItems = maxItems = N`，並保留 schema、identity、stable ID、index、source hash、Skill ID 與順序驗證。
- Conversation 與 Provider stream append-only 並可重開；Debug Folder 從 canonical run 複製並核對 source/destination hash，completeness manifest 可列出 missing/hash/flush 狀態。
- Failed/Partial 結果不寫正式 SQLite 或 Golden HTML。

## 指令結果

| Command | Result | Duration |
|---|---:|---:|
| `npm.cmd run typecheck` (final) | PASS, exit 0 | 9.048 s |
| `npm.cmd run test:v0.3.15` (final) | PASS, exit 0 | 2.520 s |
| `npm.cmd run build` (final) | PASS, exit 0 | 16.541 s |
| `npm.cmd run dist` | PASS, exit 0 | 134.432 s |
| `git diff --check` | PASS, exit 0 | included in source gate |
| Artifact/runtime/ASAR audit | PASS, exit 0 | 3.800 s |
| win-unpacked short launch | PASS | responsive v0.3.15 window |
| isolated Portable short launch | PASS | `did-finish-load`, `renderer_boot`, responsive v0.3.15 window |

兩次測試重試原因已完整保存在 execution ledger：先修正相鄰測試字串語法，再將舊 `failed-staging` 斷言更新為 canonical failure evidence。產品程式 gate 最終全部通過。

## Warning

- Vite 將 `shared/descriptionDiff.ts` 的 `node:crypto` 標示為 browser-externalized；為既有 build warning。
- Renderer bundle 約 825.65 kB，超過 Vite 500 kB chunk warning threshold；build 未失敗。
- electron-builder 使用預設 Electron icon；未設定 application icon。
- electron-builder 報告既有 duplicate dependency references；封裝成功。
- `dirtyState=true` 僅因既有 v0.2.47 tracked 報告修改，該檔未 stage、未 commit、未進 ASAR。

## Manual Pending

1. 在未安裝外部 Codex 的全新 Windows 執行 Installer 與 Portable。
2. 在 JAA 內完成 managed ChatGPT OAuth 登入、登出與重啟狀態驗證。
3. 選取真實 1 JSON + 3 MD，以 117 筆資料執行一次完整分析並核對 117/117 identity conservation。
4. 檢視即時對話、歷史 Run、JSON/Golden HTML/SQLite completed-only gate。
5. 產生 Debug Folder 並確認 `debug-completeness-manifest.json` 為 completed。
