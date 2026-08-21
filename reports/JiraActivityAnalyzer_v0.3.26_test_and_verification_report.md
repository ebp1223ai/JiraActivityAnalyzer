# JiraActivityAnalyzer v0.3.26 Test and Verification Report

## Delivery Summary

- Target Version：`0.3.26`
- Overall Status：`Partial / Manual Validation Pending`
- Branch：`feat/v0.3.26-artifact-identity-evidence-quote-diagnostics`
- Package Source Commit：`19b6458cde9ce55562e281ab2473319f2eee5261`
- Build Time：`2026/08/21 11:17:11`（Asia/Taipei）
- Package dirty state：`true`，原因僅為使用者既有 `reports/JiraActivityAnalyzer_v0.2.47_Background_Fetch_and_Activity_Events_UX_implementation_report.md` tracked 修改；v0.3.26 source 已提交。

## Implemented Decisions

1. JAA-owned immutable Artifact Identity 留在本機，不由模型回傳。
2. 256-bit single-use token 綁定 Run／Attempt／Thread／Turn，僅保存 hash/prefix。
3. 可解碼 AI submission 在 validation 前以 atomic durable flow 保存。
4. Decision v5 僅引用 Evidence Quote IDs。
5. deterministic Quote Catalog 綁定 raw offsets、exact substring hash 與 role。
6. 14-stage validation receipts 與 aggregate findings。
7. 正式 gate 失敗產生 non-canonical diagnostic package/HTML，但不得進 Results／SQLite。
8. Workspace 顯示各 lifecycle stage，拒絕提交仍提供 diagnostics。
9. `bridge-resumable-v3` 合併 read/ack，保留 resume 與完整性。
10. Debug export 依 attempt/run 收集實體證據並驗 hash，不使用 latest fallback。

## Focused Verification

| Command / check | Result | Exit | Actual duration |
| --- | --- | ---: | ---: |
| `npm.cmd run typecheck` | PASS | 0 | 10.570 s |
| `npm.cmd run test:v0.3.26` | PASS | 0 | 3.087 s |
| `npm.cmd run build` | PASS with warnings | 0 | 25.094 s |
| initial `npm.cmd run dist` | expected dirty guard failure | 1 | 6.399 s |
| authorized dist retry with exact source commit | PASS | 0 | 107.641 s |
| ASAR/rules/Codex/hash audit | PASS | 0 | 1.412 s |
| win-unpacked isolated launch | PASS | 0 | 8.000 s |
| Portable isolated launch | PASS | 0 | 48.391 s |

Focused test evidence：identity immutable、6 token failure cases、3 fixture quotes、Decision v5、persist-before-validate、14 receipts、formal v5 submission、JAA identity injection、second-submission rejection，以及 v0.3.25 focused contracts 均通過。Transport fixture 完整傳送 52 segments：v3 53 calls，v2 equivalent 104 calls。

## Package Audit

- ASAR entries：4686；僅含 `dist-electron/analysis-bridge-v0326.cjs`，未見 stale bridge。
- Bundled rules：只有 `resources/bundled-rules/v0.3.26` 四份受控文件，hash 與 Manifest binding 正確。
- Bundled Codex：`0.147.0`，SHA-256 `935A1911ED2556E4FFCEC995F4886AC2AC425863BA26FED264DF62E30272AD9D`，禁止 external fallback。
- Portable session `app-session-1787282501951-023471`：`did-finish-load` 指向解壓後 `app.asar/dist/index.html`；renderer `readyState=interactive`，版本、commit、Build Time 正確，未見 crash／white screen／unresponsive。

## Windows Artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Portable 0.3.26.exe` | 190380663 | FCE476B1A47A2C56AB573E0778406701159E6416C8E4A8A150278F0F68FFE9CD |
| `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Setup 0.3.26.exe` | 190610754 | A87125367982E264F7DA016366FBB5B2896F92ED596D13EA82BE76929F7327F9 |
| `F:\AI\JiraActivityAnalyzer\release\win-unpacked\Jira Activity Analyzer.exe` | 235706368 | F0C2CEA2C67949396AE53295F6B0541529E07D71939683EE0862D7D61F59E445 |

## Warnings and Limitations

- Vite warning：`node:crypto` 由 browser externalization 處理；既有 `shared/descriptionDiff.ts` 觸發。
- Vite warning：JS chunk 約 829.94 kB（gzip 228.50 kB），超過 500 kB 建議值。
- electron-builder warning：使用預設 Electron icon。
- 初次 dist 被 tracked dirty guard 正確阻擋；依規格保留使用者修改，使用明確 source commit 與 authorized dirty package 環境變數重試。
- Actual Provider token telemetry：`unavailable`。
- 未執行：Managed OAuth、真實 Jira、真實 17/117 筆、production SQLite、乾淨 Windows Installer GUI、長時間 smoke。
- v0.3.25 真實 submission replay：原 Debug Folder 未提供，`Manual Validation Pending`。

## Preservation

使用者原有 tracked dirty 報告及所有 untracked PDF、UI、測試資料夾、database、token.txt、中文資料夾／壓縮檔均未修改、未刪除、未 stage。Release artifacts 不提交 Git。
