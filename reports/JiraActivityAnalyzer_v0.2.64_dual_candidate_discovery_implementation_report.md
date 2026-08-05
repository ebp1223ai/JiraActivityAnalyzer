# Jira Activity Analyzer v0.2.64 Implementation Report

## 摘要

- 版本：`0.2.64`
- 主題：Dual Candidate Discovery Modes & Complete Updated-Date Pagination
- 分支：`feat/v0.2.64-dual-candidate-discovery`（local-only，無 upstream）
- 基線：v0.2.63 local final HEAD `5e1e6a470143d450762712febfe73db8d5804e3d`
- Source commits：`29d89eedddcfc62437ae8ad407d0ad14f09a62f0`、`9bab5d1755f8054ee8d4ea7387b7de3c7f3bce6c`
- SQLite schema：不變，無 migration、無正式 DB write
- Overall Status：**Partial**
- Implementation & Automated Validation：**Passed**
- Real Jira / Windows GUI Manual Validation：**Not Run**

## Baseline 與安全邊界

- Prompt 陳述使用者已於 2026-08-05 完成 v0.2.63 人工測試；Git 可驗證的最終 local evidence HEAD 為 `5e1e6a4`，包含 source `30ea8e2` ancestry。repository 內沒有更新後的額外 acceptance commit，因此兩者在本報告中分開陳述。
- v0.2.63 branch 未設定 upstream，remote 未見 v0.2.63／v0.2.64 branch；本版未 push、tag、PR、Release 或上傳 EXE。
- `JiraActivityAnalyzer_Codex_Prompt_Master_Requirements.md`、`AGENTS.md`、`AI_RULES.md` 在 repository 中不存在；本版以 v0.2.64 prompt 與既有 production contracts 建立 coverage matrix。
- 原有 v0.2.47 tracked dirty report與所有既有 untracked 使用者檔案保持 unstaged；未讀取 `.env`、`token.txt`、`database/`、SQLite、Source Archive、Debug Folder 或真實 payload。
- changed-file scan命中的 `ui-smoke-runtime-token`／`ui-smoke-masked` 均可在 v0.2.63 baseline找到，且不是 v0.2.64新增行；分類為 `SAFE_SYNTHETIC_EXISTING_FIXTURE`。

## Requirement Traceability Matrix

| Requirement | Production location | Root cause / change | Verification | Status |
|---|---|---|---|---|
| Typed dual mode/default | `shared/candidateDiscovery.ts`, `SessionStateContext.tsx` | 舊狀態只能表達 User flow；新增 discriminated mode/config，預設維持 User | v0.2.64 contract test | Passed |
| Mode UI / hidden value isolation | `AnalysisPage.tsx` | mode selector置於 Step 1；Updated DOM 只顯示日期，User-only值保留但不進 snapshot | source contract + packaged CDP smoke | Passed |
| Updated date/JQL | `shared/candidateDiscovery.ts` | calendar-day 半開區間與 deterministic order | invalid dates、next-day、JQL tests | Passed |
| Complete pagination | `electron/updatedCandidateDiscovery.ts` | 舊 User path受 1,000 safety limit；新增 Updated-only完整 cursor loop | 0/37/100/1001/3426、server page 37 | Passed |
| Retry/cancel/progress | executor、`electron/main.ts`、preload/renderer | 沿用唯讀 GET retry taxonomy；run-scoped cancel/progress | retry success/failure、cancel tests | Passed |
| Identity/integrity | executor | ID-first/key fallback；duplicate、stall、empty、drift fail closed | generated fixtures | Passed |
| Atomic publish gate | shared gate + `AnalysisPage.tsx` | 只有同 run/mode 的 COMPLETED 可 replace；其餘保留舊 set | stale/partial/mode mismatch tests | Passed |
| User path unchanged | `electron/main.ts` | 原 loop與 `Math.min(..., 1000)` clamp 保留 | source contract + v0.2.34 regression | Passed |
| Step 2 queue unchanged | existing Session/Full Fetch path | 共用既有 Candidate/Selected Set，不新增 queue path | v0.2.34 + full-fetch correctness | Passed |
| APP_ROOT / Portable | existing runtime path | 無架構修改 | app-root regression + packaged smoke | Passed |
| Schema / DB | none | 未修改 SQLite schema或正式 write | diff review | Passed |

## Root Cause 與 Production Data Flow

舊 Candidate Discovery 由 renderer 組 User JQL，經 preload/IPC 進入 main 的 window/round loop；main 對 `safetyLimit` 做 `Math.min(..., 1000)`，renderer 再把結果合併至 Candidate/Selected Set，因此無法表示「只依 updated 日期且必須全分頁」的 contract。

新流程在 renderer 開始 run 時建立 immutable、mode-specific config。User mode沿用舊 JQL、window/round、retry、progress與 1,000 clamp；Updated mode只傳 Start/End，產生 `updated >= start AND updated < nextDay ORDER BY updated ASC, key ASC`，由 main 的獨立完整分頁 executor驗證 response shape、cursor、total、identity與 counts。hidden User/Window/Round/Delay值不會序列化至 Updated JQL、IPC 或 metadata。

工作結果由 runId、active mode與 terminal status共同 gate；只有完整 `COMPLETED` 才 atomic replace Step 2 Candidate/Selected Set。`PARTIAL`、`FAILED`、`CANCELLED` 或 stale response只保留 diagnostics，不污染舊 completed set。Step 2 Project filter、跨 Project selection、Queue replace與 Full Fetch production path未修改。

## 自動驗證

| Command | Result | Duration | Evidence |
|---|---:|---:|---|
| `npm.cmd run typecheck` | Passed | 12.009s（final source） | renderer/electron TS |
| `npm.cmd run test:v0.2.64` | Passed | 1.600s（final source） | dual mode、dates、JQL、pagination、integrity、publish gate |
| `node scripts/test-v0234.cjs` | Passed | recorded in ledger | selection/queue regression |
| `node scripts/test-full-fetch-correctness.cjs` | Passed | recorded in ledger | Full Fetch correctness |
| `node scripts/test-app-root.cjs` | Passed | recorded in ledger | APP_ROOT/Portable |
| `node scripts/test-v0263.cjs` | Passed | recorded in ledger | previous-version regression |
| clean worktree `npm.cmd ci` | Passed | 137.030s final | lockfile install；9 vulnerabilities noted |
| clean worktree `npm.cmd run dist` | Passed | 172.734s final | build/typecheck/Windows packaging |
| `npm.cmd run audit:package-size` | Passed | 1.994s final | `unexpectedCount=0` |
| packaged app-only CDP smoke | Passed | 3.392s | renderer、Build Time、mode切換、hidden fields |

首次 junction-based封裝雖命令成功，但 builder回報 transitive dependency path missing，稽核顯示 `app.asar=15.264 MiB`；該產物被拒絕。移除 junction、執行乾淨 `npm ci` 後重封裝，最終 `app.asar=23.173 MiB`、packed node_modules=`20.271 MiB`。

## Package Audit

| Artifact | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| `release/Jira Activity Analyzer Setup 0.2.64.exe` | 106,296,845 | 101.373 | `282B03EA7A8DBD05CAA49118440D01DC3A6661106D24934FCB73FF18C0D73B87` |
| `release/Jira Activity Analyzer Portable 0.2.64.exe` | 106,066,772 | 101.153 | `03E638D059E5543A5EA1EC0AC582101473EB3D0E47BEB15DCBBF33B7254B9016` |
| `release/win-unpacked/Jira Activity Analyzer.exe` | 235,706,368 | 224.787 | `46B6192AE2F4DDE47944CD54B94FBFC119DF4F57D60E9A01303242BC94173105` |
| `release/win-unpacked/resources/app.asar` | 24,298,151 | 23.173 | `B637011ED1DC41C146485FBE2D35A0993D552D1E41CA01F39DF0AE000D6E0681` |

`win-unpacked=398,599,160 bytes (380.134 MiB)`；resources=`24,405,671 bytes (23.275 MiB)`；`app.asar.unpacked`不存在。前 50 大檔與前 20 大目錄保存於 ignored `test-artifacts/package-size-audit-v0.2.64.json`。

## Master Requirements Coverage Matrix

| Master Requirement | Applicability | Evidence / Result |
|---|---|---|
| Version consistency | Required | VERSION/package/lock/changelog/build-info/artifacts = 0.2.64 |
| Start-time ledger | Required | v0.2.64 ledger；以 branch creation durable timestamp為起點 |
| Git baseline / dirty safety | Required | explicit status/ancestry；逐檔 stage |
| Sensitive data exclusion | Required | changed-file scan、package unexpectedCount=0 |
| Jira read-only | Required | Search GET path；未連真實 Jira |
| Partial / Failed exclusion | Required | strict publish gate tests |
| Queue conservation / replace | Required | v0.2.34/full-fetch regression |
| Pagination completeness | Required | 1001、3426與 server page 37實際生成測試 |
| Async stale protection | Required | run/mode/status gate與 cancel tests |
| SQLite migration / DB write | Not applicable | schema與 write不變 |
| Windows Build / Dist | Required | Passed |
| Short packaged smoke | Required | Passed，app-only CDP、無桌面截圖 |
| Long smoke | Excluded | 依 prompt/使用者決策未執行 |
| Package size audit | Required | Passed，unexpectedCount=0 |
| Manual real Jira / GUI | User gate | Not Run；見 checklist |
| Commit | Authorized | source commits完成；Evidence commit為本報告所在 commit |
| Push / Tag / PR / Release | Not authorized | Not Run |

## Known Limitations / Remaining Risks

- Jira Search不是 transaction snapshot；擷取期間 total或排序集合改變會標為 Partial/warning，不能保證 Run 開始瞬間絕對快照。
- 真實公司 Jira、真實權限、真實 >1,000 筆、VPN/SSO與使用者 Windows GUI尚未驗證；完成 checklist前 Overall Status維持 Partial。
- npm clean install回報 9 vulnerabilities（1 moderate、8 high）及 deprecated dependencies；本版未執行 `audit fix` 或依賴升級。
- Vite 770.55 kB chunk warning與 Electron default icon為既有 packaging warning，不影響本版 gate。

